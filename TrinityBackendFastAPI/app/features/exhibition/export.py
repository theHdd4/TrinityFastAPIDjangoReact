from __future__ import annotations

import base64
import html
import io
import logging
import math
import os
import re
from typing import Iterable, Optional, Sequence

import httpx
from pptx import Presentation
from pptx.chart.data import ChartData
from pptx.dml.color import RGBColor
from pptx.enum.chart import XL_CHART_TYPE, XL_LEGEND_POSITION
from pptx.enum.dml import MSO_LINE_DASH_STYLE
from pptx.enum.shapes import MSO_CONNECTOR, MSO_SHAPE
from pptx.enum.text import MSO_ANCHOR, PP_ALIGN
from pptx.util import Emu, Pt
from reportlab.lib.utils import ImageReader
from reportlab.pdfgen import canvas

from .schemas import (
    DocumentStylesPayload,
    ExhibitionExportRequest,
    SlideDomSnapshotPayload,
    SlideExportObjectPayload,
    SlideExportPayload,
    SlideScreenshotPayload,
)

logger = logging.getLogger(__name__)

PX_PER_INCH = 96.0
EMU_PER_INCH = 914400
PT_PER_INCH = 72.0
DEFAULT_RENDER_SERVICE_URL = "http://localhost:4100"

CANVAS_STAGE_HEIGHT = 520.0
TOP_LAYOUT_MIN_HEIGHT = 210.0
BOTTOM_LAYOUT_MIN_HEIGHT = 220.0
SIDE_LAYOUT_MIN_WIDTH = 280.0
SIDE_LAYOUT_RATIO = 0.34

GRADIENT_PRESETS: dict[str, dict[str, object]] = {
    "default": {"stops": ["#7c3aed", "#ec4899", "#f97316"], "angle": 135},
    "blue": {"stops": ["#1d4ed8", "#2563eb", "#0ea5e9", "#14b8a6"], "angle": 135},
    "purple": {"stops": ["#5b21b6", "#7c3aed", "#a855f7", "#ec4899"], "angle": 135},
    "green": {"stops": ["#047857", "#10b981", "#22c55e", "#bef264"], "angle": 135},
    "orange": {"stops": ["#c2410c", "#ea580c", "#f97316", "#facc15"], "angle": 135},
    "gradient-aurora": {"stops": ["#312e81", "#7c3aed", "#ec4899", "#f97316"], "angle": 135},
    "gradient-dusk": {"stops": ["#1e3a8a", "#6366f1", "#a855f7", "#f472b6"], "angle": 135},
    "gradient-oceanic": {"stops": ["#0f172a", "#1d4ed8", "#38bdf8", "#2dd4bf"], "angle": 135},
    "gradient-forest": {"stops": ["#064e3b", "#047857", "#22c55e", "#a3e635"], "angle": 135},
    "gradient-tropical": {"stops": ["#0ea5e9", "#22d3ee", "#34d399", "#fde68a"], "angle": 135},
    "gradient-blush": {"stops": ["#f472b6", "#fb7185", "#f97316", "#fde68a"], "angle": 135},
    "gradient-midnight": {"stops": ["#0f172a", "#312e81", "#6d28d9", "#a855f7"], "angle": 135},
}

DEFAULT_OVERLAY_COLOR = "#7c3aed"

SHAPE_ID_TO_MSO: dict[str, MSO_SHAPE] = {
    "rectangle": MSO_SHAPE.RECTANGLE,
    "rounded-rectangle": MSO_SHAPE.ROUNDED_RECTANGLE,
    "ellipse": MSO_SHAPE.OVAL,
    "circle": MSO_SHAPE.OVAL,
    "triangle": MSO_SHAPE.ISOSCELES_TRIANGLE,
    "diamond": MSO_SHAPE.DIAMOND,
    "pentagon": MSO_SHAPE.PENTAGON,
    "hexagon": MSO_SHAPE.HEXAGON,
    "octagon": MSO_SHAPE.OCTAGON,
    "star": MSO_SHAPE.STAR_5_POINT,
    "burst": MSO_SHAPE.EXPLOSION1,
    "arrow-right": MSO_SHAPE.RIGHT_ARROW,
    "arrow-left": MSO_SHAPE.LEFT_ARROW,
    "arrow-up": MSO_SHAPE.UP_ARROW,
    "arrow-down": MSO_SHAPE.DOWN_ARROW,
    "process": MSO_SHAPE.FLOWCHART_PROCESS,
    "decision": MSO_SHAPE.FLOWCHART_DECISION,
    "terminator": MSO_SHAPE.FLOWCHART_TERMINATOR,
    "data": MSO_SHAPE.FLOWCHART_DATA,
    "speech-rectangle": MSO_SHAPE.RECTANGULAR_CALLOUT,
    "speech-oval": MSO_SHAPE.OVAL_CALLOUT,
    "thought-bubble": MSO_SHAPE.CLOUD_CALLOUT,
    "cloud": MSO_SHAPE.CLOUD,
    "double-cloud": MSO_SHAPE.CLOUD,
}

LINE_SHAPES = {"line-horizontal", "line-vertical", "line-diagonal"}


class ExportGenerationError(Exception):
    """Raised when an export file cannot be generated."""


def _get_render_service_url() -> str:
    configured = (os.environ.get("EXHIBITION_RENDER_SERVICE_URL") or "").strip()
    if configured:
        return configured.rstrip("/")
    return DEFAULT_RENDER_SERVICE_URL


def _px_to_inches(value: float) -> float:
    return value / PX_PER_INCH


def _px_to_emu(value: float) -> Emu:
    return Emu(int(round(_px_to_inches(value) * EMU_PER_INCH)))


def _px_to_pt(value: float) -> float:
    return _px_to_inches(value) * PT_PER_INCH


def _safe_float(value: Optional[float], default: float = 0.0) -> float:
    if value is None:
        return default
    try:
        numeric = float(value)
    except (TypeError, ValueError):
        return default
    if math.isnan(numeric) or math.isinf(numeric):
        return default
    return numeric


def _decode_data_url(data_url: str) -> bytes:
    if not data_url:
        raise ExportGenerationError('Missing image data for slide screenshot.')

    match = re.match(r"^data:.*?;base64,(.+)$", data_url, flags=re.IGNORECASE | re.DOTALL)
    payload = match.group(1) if match else data_url

    try:
        return base64.b64decode(payload, validate=True)
    except (base64.binascii.Error, ValueError) as exc:  # type: ignore[attr-defined]
        raise ExportGenerationError('Unable to decode base64 image data.') from exc


_BR_TAG_RE = re.compile(r"<\s*br\s*/?\s*>", flags=re.IGNORECASE)
_TAG_RE = re.compile(r"<[^>]+>")


def _html_to_plain_text(raw: str) -> str:
    if not raw:
        return ''
    text = _BR_TAG_RE.sub('\n', raw)
    text = _TAG_RE.sub('', text)
    return html.unescape(text).strip()


def _parse_hex_color(value: Optional[str]) -> Optional[RGBColor]:
    if not value:
        return None
    cleaned = value.strip().lstrip('#')
    if len(cleaned) not in {6, 3}:
        return None
    if len(cleaned) == 3:
        cleaned = ''.join(ch * 2 for ch in cleaned)
    try:
        red = int(cleaned[0:2], 16)
        green = int(cleaned[2:4], 16)
        blue = int(cleaned[4:6], 16)
    except ValueError:
        return None
    return RGBColor(red, green, blue)


def _parse_color_token(value: Optional[str]) -> Optional[RGBColor]:
    if value is None:
        return None

    token = str(value).strip()
    if not token or token.lower() in {"transparent", "none", "currentcolor"}:
        return None

    if token.startswith("var("):
        return None

    return _parse_hex_color(token)


def _map_alignment(value: Optional[str]) -> PP_ALIGN:
    if value == 'center':
        return PP_ALIGN.CENTER
    if value == 'right':
        return PP_ALIGN.RIGHT
    return PP_ALIGN.LEFT


def _apply_font_formatting(font, formatting: dict) -> None:
    font_name = formatting.get('fontFamily')
    if isinstance(font_name, str) and font_name.strip():
        font.name = font_name.strip()

    font_size = formatting.get('fontSize')
    numeric_size = _safe_float(font_size, 0)
    if numeric_size > 0:
        font.size = Pt(_px_to_pt(numeric_size))

    font.bold = bool(formatting.get('bold'))
    font.italic = bool(formatting.get('italic'))
    font.underline = bool(formatting.get('underline'))
    font.strike = bool(formatting.get('strikethrough'))

    color = _parse_hex_color(formatting.get('color'))
    if color is not None:
        font.color.rgb = color


def _normalise_card_layout(value: Optional[str]) -> str:
    if not value:
        return 'none'
    lowered = value.lower()
    if lowered in {'none', 'top', 'bottom', 'left', 'right', 'full'}:
        return lowered
    return 'none'


def _resolve_overlay_fill(settings: dict) -> tuple[str, object]:
    accent_image = settings.get('accentImage') or settings.get('accent_image')
    if isinstance(accent_image, str) and accent_image.strip():
        return 'image', accent_image.strip()

    card_color = settings.get('cardColor') or settings.get('card_color')
    if isinstance(card_color, str) and card_color.strip():
        token = card_color.strip()
        if token.startswith('solid-') and len(token) >= 12:
            return 'solid', f"#{token[6:12]}"

        lookup = token.lower()
        preset = GRADIENT_PRESETS.get(lookup)
        if preset:
            return 'gradient', preset

    return 'solid', DEFAULT_OVERLAY_COLOR


def _compute_overlay_rect(layout: str, width: float, height: float) -> Optional[tuple[float, float, float, float]]:
    if width <= 0 or height <= 0:
        return None

    if layout == 'full':
        return 0.0, 0.0, width, height

    if layout == 'top':
        ratio = TOP_LAYOUT_MIN_HEIGHT / CANVAS_STAGE_HEIGHT if CANVAS_STAGE_HEIGHT else 0
        overlay_height = max(TOP_LAYOUT_MIN_HEIGHT, height * ratio)
        overlay_height = min(overlay_height, height)
        return 0.0, 0.0, width, overlay_height

    if layout == 'bottom':
        ratio = BOTTOM_LAYOUT_MIN_HEIGHT / CANVAS_STAGE_HEIGHT if CANVAS_STAGE_HEIGHT else 0
        overlay_height = max(BOTTOM_LAYOUT_MIN_HEIGHT, height * ratio)
        overlay_height = min(overlay_height, height)
        return 0.0, height - overlay_height, width, overlay_height

    if layout == 'left':
        overlay_width = max(SIDE_LAYOUT_MIN_WIDTH, width * SIDE_LAYOUT_RATIO)
        overlay_width = min(overlay_width, width)
        return 0.0, 0.0, overlay_width, height

    if layout == 'right':
        overlay_width = max(SIDE_LAYOUT_MIN_WIDTH, width * SIDE_LAYOUT_RATIO)
        overlay_width = min(overlay_width, width)
        return width - overlay_width, 0.0, overlay_width, height

    return None


def _render_layout_overlay(
    slide,
    slide_payload: SlideExportPayload,
    base_width: float,
    base_height: float,
    offset_x: float = 0.0,
    offset_y: float = 0.0,
) -> None:
    settings = slide_payload.presentation_settings or {}
    if not isinstance(settings, dict):
        return

    layout_value = settings.get('cardLayout') or settings.get('card_layout')
    layout = _normalise_card_layout(layout_value)
    if layout == 'none':
        return

    rect = _compute_overlay_rect(layout, base_width, base_height)
    if not rect:
        return

    x, y, width, height = rect
    fill_type, fill_value = _resolve_overlay_fill(settings)

    if fill_type == 'image' and isinstance(fill_value, str):
        try:
            image_bytes = _decode_data_url(fill_value)
            image_stream = io.BytesIO(image_bytes)
            slide.shapes.add_picture(
                image_stream,
                _px_to_emu(x + offset_x),
                _px_to_emu(y + offset_y),
                width=_px_to_emu(width),
                height=_px_to_emu(height),
            )
            return
        except ExportGenerationError:
            fill_type = 'solid'
            fill_value = DEFAULT_OVERLAY_COLOR
        except Exception as exc:  # pragma: no cover - best effort logging
            logger.warning('Unable to render accent image for slide %s: %s', slide_payload.id, exc)
            fill_type = 'solid'
            fill_value = DEFAULT_OVERLAY_COLOR

    shape = slide.shapes.add_shape(
        MSO_SHAPE.RECTANGLE,
        _px_to_emu(x + offset_x),
        _px_to_emu(y + offset_y),
        _px_to_emu(width),
        _px_to_emu(height),
    )
    shape.line.fill.background()

    if fill_type == 'gradient' and isinstance(fill_value, dict):
        stops = fill_value.get('stops') if isinstance(fill_value.get('stops'), list) else []
        colors = [color for color in stops if isinstance(color, str)]
        if len(colors) >= 2:
            gradient = shape.fill
            gradient.gradient()
            try:
                gradient.gradient_angle = int(fill_value.get('angle')) if fill_value.get('angle') is not None else 135
            except (TypeError, ValueError):
                gradient.gradient_angle = 135

            start_color = _parse_hex_color(colors[0]) or _parse_hex_color(DEFAULT_OVERLAY_COLOR)
            end_color = _parse_hex_color(colors[-1]) or start_color
            if start_color is not None and end_color is not None:
                gradient_stops = gradient.gradient_stops
                gradient_stops[0].position = 0.0
                gradient_stops[0].color.rgb = start_color
                gradient_stops[1].position = 1.0
                gradient_stops[1].color.rgb = end_color
                return

        fill_type = 'solid'
        fill_value = colors[0] if colors else DEFAULT_OVERLAY_COLOR

    if fill_type == 'solid':
        rgb = _parse_hex_color(str(fill_value)) or _parse_hex_color(DEFAULT_OVERLAY_COLOR)
        if rgb is not None:
            fill = shape.fill
            fill.solid()
            fill.fore_color.rgb = rgb


def _render_text_box(slide, obj: SlideExportObjectPayload, offset_x: float = 0.0, offset_y: float = 0.0) -> None:
    width = _safe_float(obj.width, 0)
    height = _safe_float(obj.height, 0)
    if width <= 0 or height <= 0:
        return

    shape = slide.shapes.add_textbox(
        _px_to_emu(obj.x + offset_x),
        _px_to_emu(obj.y + offset_y),
        _px_to_emu(width),
        _px_to_emu(height),
    )

    text = _html_to_plain_text(str(obj.props.get('text', '') or ''))
    text_frame = shape.text_frame
    text_frame.clear()
    text_frame.word_wrap = True
    text_frame.vertical_anchor = MSO_ANCHOR.TOP

    formatting = obj.props
    lines = text.split('\n') if text else ['']
    for index, line in enumerate(lines):
        paragraph = text_frame.add_paragraph() if index > 0 else text_frame.paragraphs[0]
        paragraph.text = line
        paragraph.alignment = _map_alignment(formatting.get('align'))
        _apply_font_formatting(paragraph.font, formatting)

    rotation = _safe_float(obj.rotation, 0)
    if rotation:
        shape.rotation = rotation


def _render_image(slide, obj: SlideExportObjectPayload, offset_x: float = 0.0, offset_y: float = 0.0) -> None:
    width = _safe_float(obj.width, 0)
    height = _safe_float(obj.height, 0)
    if width <= 0 or height <= 0:
        return

    source = obj.props.get('src') or obj.props.get('dataUrl')
    if not isinstance(source, str) or not source:
        logger.debug('Skipping image on slide %s due to missing source', obj.id)
        return

    image_bytes = _decode_data_url(source)
    image_stream = io.BytesIO(image_bytes)

    shape = slide.shapes.add_picture(
        image_stream,
        _px_to_emu(obj.x + offset_x),
        _px_to_emu(obj.y + offset_y),
        width=_px_to_emu(width),
        height=_px_to_emu(height),
    )

    rotation = _safe_float(obj.rotation, 0)
    if rotation:
        shape.rotation = rotation


def _map_dash_style(style: Optional[str]) -> Optional[MSO_LINE_DASH_STYLE]:
    if not style:
        return None

    lookup = {
        "solid": MSO_LINE_DASH_STYLE.SOLID,
        "dashed": MSO_LINE_DASH_STYLE.DASH,
        "dotted": MSO_LINE_DASH_STYLE.DOT,
        "dash-dot": MSO_LINE_DASH_STYLE.DASH_DOT,
    }

    return lookup.get(style.lower())


def _apply_shape_styles(shape, props: dict, *, is_line: bool = False) -> None:
    opacity = _safe_float(props.get("opacity"), 1.0)
    opacity = min(max(opacity, 0.0), 1.0)

    if not is_line:
        fill_color = _parse_color_token(props.get("fill"))
        if fill_color is None or opacity <= 0:
            shape.fill.background()
        else:
            fill = shape.fill
            fill.solid()
            fill.fore_color.rgb = fill_color
            if opacity < 1.0:
                fill.fore_color.transparency = max(0.0, min(1.0, 1.0 - opacity))

    stroke_width = _safe_float(props.get("strokeWidth"), 0.0)
    stroke_color = _parse_color_token(props.get("stroke"))
    line = getattr(shape, "line", None)

    if line is not None:
        if stroke_color is None or stroke_width <= 0:
            try:
                line.fill.background()
            except AttributeError:
                pass
            line.width = 0
        else:
            try:
                line.color.rgb = stroke_color
            except AttributeError:
                pass
            line.width = Pt(_px_to_pt(stroke_width))
            dash = _map_dash_style(props.get("strokeStyle"))
            if dash is not None:
                line.dash_style = dash
            if opacity < 1.0:
                try:
                    line.fill.solid()
                    line.fill.fore_color.rgb = stroke_color
                    line.fill.fore_color.transparency = max(0.0, min(1.0, 1.0 - opacity))
                except AttributeError:
                    pass


def _resolve_line_points(
    shape_id: str,
    obj: SlideExportObjectPayload,
    offset_x: float,
    offset_y: float,
) -> tuple[float, float, float, float]:
    width = _safe_float(obj.width, 0.0)
    height = _safe_float(obj.height, 0.0)
    left = obj.x + offset_x
    top = obj.y + offset_y

    if shape_id == "line-vertical":
        x = left + (width / 2.0)
        return x, top, x, top + height

    if shape_id == "line-diagonal":
        return left, top + height, left + width, top

    # Default to horizontal line
    y = top + (height / 2.0)
    return left, y, left + width, y


def _render_shape(slide, obj: SlideExportObjectPayload, offset_x: float = 0.0, offset_y: float = 0.0) -> None:
    props = obj.props or {}
    shape_id = str(props.get("shapeId") or props.get("shape_id") or "").strip()

    if shape_id in LINE_SHAPES:
        x1, y1, x2, y2 = _resolve_line_points(shape_id, obj, offset_x, offset_y)
        shape = slide.shapes.add_connector(
            MSO_CONNECTOR.STRAIGHT,
            _px_to_emu(x1),
            _px_to_emu(y1),
            _px_to_emu(x2),
            _px_to_emu(y2),
        )
        _apply_shape_styles(shape, props, is_line=True)
    else:
        width = _safe_float(obj.width, 0.0)
        height = _safe_float(obj.height, 0.0)
        if width <= 0 or height <= 0:
            return

        mapped_shape = SHAPE_ID_TO_MSO.get(shape_id, MSO_SHAPE.RECTANGLE)
        shape = slide.shapes.add_shape(
            mapped_shape,
            _px_to_emu(obj.x + offset_x),
            _px_to_emu(obj.y + offset_y),
            _px_to_emu(width),
            _px_to_emu(height),
        )
        _apply_shape_styles(shape, props)

    rotation = _safe_float(obj.rotation, 0.0)
    if rotation:
        shape.rotation = rotation

def _extract_table_data(obj: SlideExportObjectPayload) -> Optional[list]:
    data = obj.props.get('data')
    if isinstance(data, list) and data:
        return data
    return None


def _apply_table_cell(cell, payload: dict) -> None:
    text = _html_to_plain_text(str(payload.get('content', '') or ''))
    formatting = payload.get('formatting') or {}

    cell.text = ''
    cell.vertical_anchor = MSO_ANCHOR.MIDDLE

    paragraph = cell.text_frame.paragraphs[0]
    paragraph.text = text
    paragraph.alignment = _map_alignment(formatting.get('align'))
    _apply_font_formatting(paragraph.font, formatting)


def _render_table(slide, obj: SlideExportObjectPayload, offset_x: float = 0.0, offset_y: float = 0.0) -> None:
    table_data = _extract_table_data(obj)
    if not table_data:
        return

    rows = len(table_data)
    cols = len(table_data[0]) if rows else 0
    if rows == 0 or cols == 0:
        return

    width = _safe_float(obj.width, 0)
    height = _safe_float(obj.height, 0)
    if width <= 0 or height <= 0:
        return

    table_shape = slide.shapes.add_table(
        rows,
        cols,
        _px_to_emu(obj.x + offset_x),
        _px_to_emu(obj.y + offset_y),
        _px_to_emu(width),
        _px_to_emu(height),
    )

    table = table_shape.table

    column_width = _px_to_emu(width) // cols
    for index in range(cols):
        table.columns[index].width = column_width

    row_height = _px_to_emu(height) // rows
    for index in range(rows):
        table.rows[index].height = row_height

    for row_index, row in enumerate(table_data):
        for col_index in range(cols):
            try:
                payload = row[col_index]
            except IndexError:
                payload = ''

            cell = table.cell(row_index, col_index)
            if isinstance(payload, dict):
                _apply_table_cell(cell, payload)
            else:
                cell.text = ''
                paragraph = cell.text_frame.paragraphs[0]
                paragraph.text = str(payload or '')
                paragraph.alignment = PP_ALIGN.LEFT

    rotation = _safe_float(obj.rotation, 0)
    if rotation:
        table_shape.rotation = rotation


def _map_chart_type(chart_type: Optional[str]) -> XL_CHART_TYPE:
    mapping = {
        'column': XL_CHART_TYPE.COLUMN_CLUSTERED,
        'bar': XL_CHART_TYPE.BAR_CLUSTERED,
        'line': XL_CHART_TYPE.LINE_MARKERS,
        'pie': XL_CHART_TYPE.PIE,
        'donut': XL_CHART_TYPE.DOUGHNUT,
    }
    return mapping.get((chart_type or '').lower(), XL_CHART_TYPE.COLUMN_CLUSTERED)


def _map_legend_position(position: Optional[str]) -> Optional[XL_LEGEND_POSITION]:
    if not position:
        return None
    lookup = {
        'top': XL_LEGEND_POSITION.TOP,
        'bottom': XL_LEGEND_POSITION.BOTTOM,
        'left': XL_LEGEND_POSITION.LEFT,
        'right': XL_LEGEND_POSITION.RIGHT,
    }
    return lookup.get(position.lower())


def _render_chart(slide, obj: SlideExportObjectPayload, offset_x: float = 0.0, offset_y: float = 0.0) -> None:
    props = obj.props or {}
    data = props.get('chartData')
    config = props.get('chartConfig') or {}

    if not isinstance(data, list) or not data:
        logger.debug('Skipping chart on slide %s due to missing data', obj.id)
        return

    width = _safe_float(obj.width, 0)
    height = _safe_float(obj.height, 0)
    if width <= 0 or height <= 0:
        return

    chart_data = ChartData()
    categories = []
    values = []
    for entry in data:
        if isinstance(entry, dict):
            categories.append(str(entry.get('label', '')))
            values.append(_safe_float(entry.get('value'), 0))
        else:
            categories.append(str(entry))
            values.append(0)

    chart_data.categories = categories
    chart_data.add_series('Series 1', values)

    chart_type = _map_chart_type(config.get('type'))
    chart_shape = slide.shapes.add_chart(
        chart_type,
        _px_to_emu(obj.x + offset_x),
        _px_to_emu(obj.y + offset_y),
        _px_to_emu(width),
        _px_to_emu(height),
        chart_data,
    )

    chart = chart_shape.chart
    chart.has_title = False

    legend_position = _map_legend_position(config.get('legendPosition'))
    chart.has_legend = legend_position is not None
    if legend_position is not None:
        chart.legend.position = legend_position
        chart.legend.include_in_layout = False

    plot = chart.plots[0]
    if bool(config.get('showValues')):
        plot.has_data_labels = True
        data_labels = plot.data_labels
        data_labels.number_format = '0.00'
        data_labels.show_value = True
    else:
        plot.has_data_labels = False

    if chart_type not in {XL_CHART_TYPE.PIE, XL_CHART_TYPE.DOUGHNUT}:
        if bool(config.get('axisIncludesZero')):
            try:
                chart.value_axis.crosses_at = 0
            except AttributeError:
                logger.debug('Chart type %s does not expose value axis', chart_type)

    rotation = _safe_float(obj.rotation, 0)
    if rotation:
        chart_shape.rotation = rotation


def _sort_objects(objects: Iterable[SlideExportObjectPayload]) -> list[SlideExportObjectPayload]:
    return sorted(objects, key=lambda item: (item.z_index if item.z_index is not None else 0))


def _render_slide_objects(
    slide,
    slide_payload: SlideExportPayload,
    offset_x: float = 0.0,
    offset_y: float = 0.0,
) -> None:
    for obj in _sort_objects(slide_payload.objects):
        try:
            if obj.type == 'text-box':
                _render_text_box(slide, obj, offset_x, offset_y)
            elif obj.type == 'image':
                _render_image(slide, obj, offset_x, offset_y)
            elif obj.type == 'table':
                _render_table(slide, obj, offset_x, offset_y)
            elif obj.type == 'chart':
                _render_chart(slide, obj, offset_x, offset_y)
            elif obj.type == 'shape':
                _render_shape(slide, obj, offset_x, offset_y)
            else:
                logger.debug('Skipping unsupported object type %s on slide %s', obj.type, slide_payload.id)
        except ExportGenerationError:
            raise
        except Exception as exc:  # pragma: no cover - best effort logging
            logger.exception('Failed to render %s on slide %s: %s', obj.type, slide_payload.id, exc)


def _resolve_slide_dimensions(slide: SlideExportPayload) -> tuple[float, float]:
    width = _safe_float(slide.base_width, 0)
    height = _safe_float(slide.base_height, 0)

    if (width <= 0 or height <= 0) and getattr(slide, "dom_snapshot", None):
        snapshot = slide.dom_snapshot
        if isinstance(snapshot, SlideDomSnapshotPayload):
            width = max(width, _safe_float(getattr(snapshot, "width", None), 0))
            height = max(height, _safe_float(getattr(snapshot, "height", None), 0))

    if (width <= 0 or height <= 0) and slide.screenshot:
        screenshot = slide.screenshot
        width = max(width, _safe_float(getattr(screenshot, 'css_width', None), 0))
        height = max(height, _safe_float(getattr(screenshot, 'css_height', None), 0))
        width = width or _safe_float(getattr(screenshot, 'width', None), 0)
        height = height or _safe_float(getattr(screenshot, 'height', None), 0)

    if width <= 0 or height <= 0:
        raise ExportGenerationError('Slide dimensions are missing or invalid.')

    return width, height


def _prepare_render_slide(slide: SlideExportPayload) -> dict:
    snapshot = slide.dom_snapshot
    if not isinstance(snapshot, SlideDomSnapshotPayload):
        raise ExportGenerationError(
            f'Slide {slide.id} is missing a DOM snapshot required for server-side rendering.'
        )

    width = _safe_float(getattr(snapshot, "width", None), 0) or _safe_float(slide.base_width, 0)
    height = _safe_float(getattr(snapshot, "height", None), 0) or _safe_float(slide.base_height, 0)

    if width <= 0 or height <= 0:
        raise ExportGenerationError(
            f'Slide {slide.id} does not include valid dimensions for rendering.'
        )

    payload: dict[str, object] = {
        "id": slide.id,
        "html": snapshot.html,
        "width": width,
        "height": height,
    }

    pixel_ratio = _safe_float(getattr(snapshot, "pixel_ratio", None), 0)
    if pixel_ratio > 0:
        payload["pixelRatio"] = pixel_ratio

    return payload


def _request_slide_screenshots(
    slides: Sequence[SlideExportPayload],
    styles: DocumentStylesPayload,
    *,
    strict: bool = True,
) -> dict[str, dict]:
    if not slides:
        return {}

    render_slides = []
    pixel_ratios: list[float] = []
    for slide in slides:
        render_payload = _prepare_render_slide(slide)
        ratio = _safe_float(render_payload.get("pixelRatio"), 0)
        if ratio > 0:
            pixel_ratios.append(ratio)
        render_slides.append(render_payload)

    request_payload: dict[str, object] = {
        "slides": render_slides,
        "styles": styles.model_dump(by_alias=True),
    }

    if pixel_ratios:
        request_payload["pixelRatio"] = max(pixel_ratios)

    base_url = _get_render_service_url()

    try:
        with httpx.Client(base_url=base_url, timeout=60.0) as client:
            response = client.post("/render/batch", json=request_payload)
        response.raise_for_status()
    except httpx.HTTPError as exc:  # pragma: no cover - network failure
        raise ExportGenerationError('Unable to render slides using the rendering service.') from exc

    try:
        payload = response.json()
    except ValueError as exc:  # pragma: no cover - unexpected payload
        raise ExportGenerationError('Rendering service returned an invalid response.') from exc

    screenshots = payload.get("screenshots")
    if not isinstance(screenshots, list):
        raise ExportGenerationError('Rendering service response did not include screenshots.')

    results: dict[str, dict] = {}
    for entry in screenshots:
        if not isinstance(entry, dict):
            continue
        slide_id = entry.get("id")
        if entry.get("error"):
            message = f"Rendering service failed to capture slide {slide_id or '?'}"
            if strict:
                raise ExportGenerationError(message)
            logger.warning(message)
            continue
        if isinstance(slide_id, str):
            results[slide_id] = entry

    return results


def _attempt_server_screenshots(
    payload: ExhibitionExportRequest, slides: Sequence[SlideExportPayload]
) -> None:
    if not slides:
        return

    styles = payload.document_styles
    if not isinstance(styles, DocumentStylesPayload):
        return

    candidates = [
        slide
        for slide in slides
        if isinstance(slide.dom_snapshot, SlideDomSnapshotPayload) and slide.dom_snapshot.html
    ]
    if not candidates:
        return

    try:
        screenshots = _request_slide_screenshots(candidates, styles, strict=False)
    except ExportGenerationError as exc:  # pragma: no cover - best effort logging
        logger.warning('Falling back to client slide captures: %s', exc)
        return

    for slide in candidates:
        data = screenshots.get(slide.id)
        if not isinstance(data, dict):
            continue
        try:
            slide.screenshot = SlideScreenshotPayload.model_validate(data)
        except Exception as exc:  # pragma: no cover - validation edge cases
            logger.warning('Skipping invalid renderer screenshot for slide %s: %s', slide.id, exc)


def _ensure_slide_screenshots(
    payload: ExhibitionExportRequest, slides: Sequence[SlideExportPayload]
) -> None:
    missing = [slide for slide in slides if not slide.screenshot or not slide.screenshot.data_url]
    if not missing:
        return

    styles = payload.document_styles
    if not isinstance(styles, DocumentStylesPayload):
        raise ExportGenerationError(
            'Document styles are required to render slide screenshots on the server.'
        )

    screenshots = _request_slide_screenshots(missing, styles)

    for slide in missing:
        data = screenshots.get(slide.id)
        if not isinstance(data, dict):
            raise ExportGenerationError(f'Unable to render screenshot for slide {slide.id}.')
        slide.screenshot = SlideScreenshotPayload.model_validate(data)


def build_pptx_bytes(payload: ExhibitionExportRequest) -> bytes:
    if not payload.slides:
        raise ExportGenerationError('No slides provided for export.')

    ordered_slides = sorted(payload.slides, key=lambda slide: slide.index)
    dimensions = [_resolve_slide_dimensions(slide) for slide in ordered_slides]
    max_width = max(width for width, _ in dimensions)
    max_height = max(height for _, height in dimensions)

    presentation = Presentation()
    presentation.slide_width = _px_to_emu(max_width)
    presentation.slide_height = _px_to_emu(max_height)

    title = (payload.title or 'Exhibition Presentation').strip() or 'Exhibition Presentation'
    presentation.core_properties.title = title
    presentation.core_properties.subject = 'Exhibition export'
    presentation.core_properties.author = 'Trinity Exhibition'

    for slide_payload, (base_width, base_height) in zip(ordered_slides, dimensions):
        slide = presentation.slides.add_slide(presentation.slide_layouts[6])
        offset_x = max((max_width - base_width) / 2, 0.0)
        offset_y = max((max_height - base_height) / 2, 0.0)
        _render_layout_overlay(slide, slide_payload, base_width, base_height, offset_x, offset_y)
        _render_slide_objects(slide, slide_payload, offset_x, offset_y)

    output = io.BytesIO()
    presentation.save(output)
    output.seek(0)
    return output.getvalue()


def build_pdf_bytes(payload: ExhibitionExportRequest) -> bytes:
    if not payload.slides:
        raise ExportGenerationError('No slides provided for export.')

    ordered_slides = sorted(payload.slides, key=lambda slide: slide.index)

    _attempt_server_screenshots(payload, ordered_slides)
    _ensure_slide_screenshots(payload, ordered_slides)

    buffer = io.BytesIO()
    pdf = canvas.Canvas(buffer)
    pdf.setTitle(payload.title or 'Exhibition Presentation')

    for index, slide in enumerate(ordered_slides):
        width, height = _resolve_slide_dimensions(slide)
        page_width = _px_to_pt(width)
        page_height = _px_to_pt(height)
        pdf.setPageSize((page_width, page_height))

        screenshot = slide.screenshot
        if not screenshot or not isinstance(screenshot.data_url, str):
            raise ExportGenerationError('Every slide must include a screenshot for PDF export.')

        image_stream = io.BytesIO(_decode_data_url(screenshot.data_url))
        image = ImageReader(image_stream)

        css_width = _safe_float(getattr(screenshot, 'css_width', None), 0)
        css_height = _safe_float(getattr(screenshot, 'css_height', None), 0)
        pixel_ratio = _safe_float(getattr(screenshot, 'pixel_ratio', None), 0) or 1.0
        image_width = _safe_float(getattr(screenshot, 'width', None), 0)
        image_height = _safe_float(getattr(screenshot, 'height', None), 0)

        if css_width <= 0 and image_width > 0:
            css_width = image_width / pixel_ratio
        if css_height <= 0 and image_height > 0:
            css_height = image_height / pixel_ratio

        if css_width <= 0 or css_height <= 0:
            css_width = width
            css_height = height

        scale = width / css_width if css_width else 1.0
        if scale <= 0:
            scale = 1.0

        draw_width = page_width
        if css_height > 0:
            draw_height = _px_to_pt(css_height * scale)
        elif image_height > 0 and pixel_ratio > 0:
            draw_height = _px_to_pt((image_height / pixel_ratio) * scale)
        else:
            draw_height = page_height

        if draw_height > page_height:
            draw_height = page_height

        offset_x = 0.0
        offset_y = (page_height - draw_height) / 2 if draw_height < page_height else 0.0

        pdf.drawImage(
            image,
            offset_x,
            offset_y,
            width=draw_width,
            height=draw_height,
            preserveAspectRatio=True,
            mask='auto',
        )
        if index < len(ordered_slides) - 1:
            pdf.showPage()

    pdf.save()
    buffer.seek(0)
    return buffer.getvalue()


def build_export_filename(title: Optional[str], extension: str) -> str:
    base = (title or 'exhibition-export').strip().lower()
    base = re.sub(r"[^a-z0-9._-]+", '-', base)
    base = base.strip('-')[:120] or 'exhibition-export'
    return f"{base}.{extension}"
