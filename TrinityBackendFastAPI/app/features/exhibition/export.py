from __future__ import annotations

import base64
import html
import io
import json
import logging
import math
import re
import urllib.parse
from typing import Any, Iterable, Optional, Sequence

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
from PIL import Image

try:  # pragma: no cover - optional dependency for SVG rasterisation
    import cairosvg  # type: ignore[import-not-found]
except Exception:  # pragma: no cover - optional dependency missing or misconfigured
    cairosvg = None  # type: ignore[assignment]

from .renderer import ExhibitionRendererError, build_inputs, render_slide_batch
from .schemas import (
    DocumentStylesPayload,
    ExhibitionExportRequest,
    SlideDomSnapshotPayload,
    SlideExportObjectPayload,
    SlideExportPayload,
    SlideScreenshotPayload,
    SlideScreenshotResponse,
)

logger = logging.getLogger(__name__)

PX_PER_INCH = 96.0
EMU_PER_INCH = 914400
PT_PER_INCH = 72.0

METADATA_MARKER = "TRINITY_EXPORT_METADATA"

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
DEFAULT_ATOM_BACKGROUND = RGBColor(0xF1, 0xF5, 0xF9)
DEFAULT_ATOM_BORDER = RGBColor(0xD1, 0xD5, 0xDB)

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


def _decode_svg_data_url(data_url: str) -> bytes:
    if not data_url:
        raise ExportGenerationError('Missing SVG data for chart render.')

    if ';base64,' in data_url:
        try:
            _, payload = data_url.split(';base64,', 1)
        except ValueError as exc:  # pragma: no cover - defensive
            raise ExportGenerationError('Invalid SVG data URL.') from exc
        try:
            return base64.b64decode(payload, validate=True)
        except (base64.binascii.Error, ValueError) as exc:  # type: ignore[attr-defined]
            raise ExportGenerationError('Unable to decode base64 SVG data.') from exc

    if ',' not in data_url:
        raise ExportGenerationError('Invalid SVG data URL.')

    _, payload = data_url.split(',', 1)
    try:
        return urllib.parse.unquote_to_bytes(payload)
    except Exception as exc:  # pragma: no cover - unexpected percent decoding errors
        raise ExportGenerationError('Unable to decode SVG data URL.') from exc


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


def _lighten_color(color: RGBColor, ratio: float = 0.2) -> RGBColor:
    ratio = max(0.0, min(1.0, ratio))
    red = min(255, int(color[0]) + int((255 - int(color[0])) * ratio))
    green = min(255, int(color[1]) + int((255 - int(color[1])) * ratio))
    blue = min(255, int(color[2]) + int((255 - int(color[2])) * ratio))
    return RGBColor(red, green, blue)


def _is_non_empty_str(value: Any) -> bool:
    return isinstance(value, str) and value.strip() != ""


def _as_dict(value: Any) -> Optional[dict[str, Any]]:
    return value if isinstance(value, dict) else None


def _ensure_list(value: Any) -> list[Any]:
    if isinstance(value, list):
        return value
    return []


def _is_data_url(value: str) -> bool:
    return bool(re.match(r"^data:[^;]+;base64,", value, flags=re.IGNORECASE))


def _humanise_key(value: str) -> str:
    if not value:
        return value
    cleaned = re.sub(r"[_-]+", " ", value)
    cleaned = re.sub(r"([a-z])([A-Z])", r"\1 \2", cleaned)
    return cleaned.strip().capitalize()


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


def _format_table_value(value: Any) -> str:
    if value is None:
        return ''
    if isinstance(value, (int, float)) and not isinstance(value, bool):
        if math.isnan(value) or math.isinf(value):
            return ''
        return f"{value}"
    return str(value)


def _extract_table_preview(metadata: Optional[dict[str, Any]]) -> Optional[dict[str, list[Any]]]:
    if not metadata:
        return None

    candidates = [
        metadata.get('tableData'),
        metadata.get('previewTable'),
        metadata.get('table'),
        metadata.get('data'),
        metadata.get('rows'),
    ]

    for candidate in candidates:
        if not candidate:
            continue

        if isinstance(candidate, dict):
            headers = _ensure_list(candidate.get('headers'))
            rows = _ensure_list(candidate.get('rows'))

            if headers and rows:
                return {'headers': headers, 'rows': rows}

            data_rows = _ensure_list(candidate.get('data'))
            if data_rows and isinstance(data_rows[0], dict):
                keys = list(data_rows[0].keys())
                return {'headers': keys, 'rows': data_rows}

        if isinstance(candidate, list) and candidate and isinstance(candidate[0], dict):
            keys = list(candidate[0].keys())
            return {'headers': keys, 'rows': candidate}

    return None


def _build_table_cells(headers: list[Any], rows: list[Any]) -> list[list[dict[str, Any]]]:
    table: list[list[dict[str, Any]]] = []
    header_cells = [
        {'content': _format_table_value(header), 'formatting': {'bold': True, 'align': 'left'}}
        for header in headers
    ]
    table.append(header_cells)

    for row in rows:
        cells: list[dict[str, Any]] = []
        if isinstance(row, dict):
            for header in headers:
                cells.append({'content': _format_table_value(row.get(header))})
        elif isinstance(row, (list, tuple)):
            sequence = list(row)
            for index, header in enumerate(headers):
                value = sequence[index] if index < len(sequence) else ''
                cells.append({'content': _format_table_value(value)})
        else:
            cells.append({'content': _format_table_value(row)})

        table.append(cells)

    return table


def _is_numeric_value(value: Any) -> bool:
    if isinstance(value, bool):
        return False
    try:
        numeric = float(value)
    except (TypeError, ValueError):
        return False
    return math.isfinite(numeric)


def _derive_numeric_keys(sample: dict[str, Any]) -> list[str]:
    return [key for key, value in sample.items() if _is_numeric_value(value)]


def _derive_category_key(sample: dict[str, Any]) -> str:
    preferred = ['label', 'name', 'category', 'x', 'dimension']
    for key in preferred:
        if key in sample:
            return key
    for key, value in sample.items():
        if isinstance(value, str):
            return key
    return 'index'


def _extract_chart_colors(candidate: Any) -> list[str]:
    colors = []
    if isinstance(candidate, dict):
        options = [
            candidate.get('chartColors'),
            candidate.get('chart_colors'),
            candidate.get('colorPalette'),
            candidate.get('color_palette'),
            candidate.get('colors'),
        ]
        for option in options:
            if isinstance(option, list):
                colors.extend([color for color in option if _is_non_empty_str(color)])
    elif isinstance(candidate, list):
        colors.extend([color for color in candidate if _is_non_empty_str(color)])
    return colors


def _normalise_series_colors(metadata: dict[str, Any], candidate: Optional[dict[str, Any]]) -> list[str]:
    colors: list[str] = []
    if candidate:
        colors.extend(_extract_chart_colors(candidate))
    colors.extend(_extract_chart_colors(metadata))
    seen: set[str] = set()
    unique: list[str] = []
    for color in colors:
        key = color.lower()
        if key in seen:
            continue
        seen.add(key)
        unique.append(color)
    return unique


def _extract_chart_preview(metadata: Optional[dict[str, Any]]) -> Optional[dict[str, Any]]:
    if not metadata:
        return None

    candidate_raw = (
        metadata.get('chartData')
        or metadata.get('chart_data')
        or metadata.get('chart')
        or metadata.get('chartMetadata')
        or metadata.get('chart_metadata')
        or metadata.get('chartState')
        or metadata.get('visualisation')
        or metadata.get('visualization')
    )

    candidate_dict = _as_dict(candidate_raw)
    raw_source: list[Any] = []
    if isinstance(candidate_raw, list):
        raw_source = candidate_raw
    elif candidate_dict and isinstance(candidate_dict.get('data'), list):
        raw_source = candidate_dict['data']
    elif isinstance(metadata.get('data'), list):
        raw_source = metadata['data']

    records = [entry for entry in raw_source if isinstance(entry, dict)]
    if not records:
        return None

    sample = records[0]
    chart_type_raw = (
        (candidate_dict.get('chart_type') if candidate_dict else None)
        or (candidate_dict.get('type') if candidate_dict else None)
        or metadata.get('chartType')
        or metadata.get('chart_type')
        or metadata.get('type')
    )
    chart_type = str(chart_type_raw).lower() if chart_type_raw else ''

    numeric_keys = _derive_numeric_keys(sample)

    label_key = _derive_category_key(sample)
    if label_key not in sample:
        label_key = 'index'

    possible_pie = False
    if 'value' in sample and _is_numeric_value(sample['value']):
        possible_pie = 'label' in sample or 'name' in sample or 'x' in sample
    elif 'y' in sample and _is_numeric_value(sample['y']):
        possible_pie = 'label' in sample or 'name' in sample or 'x' in sample

    forced_pie = any(token in chart_type for token in ('pie', 'donut', 'doughnut'))

    if forced_pie or (not chart_type and possible_pie):
        value_key = 'value' if 'value' in sample else 'y' if 'y' in sample else None
        if not value_key and numeric_keys:
            value_key = numeric_keys[0]
        if not value_key:
            return None

        categories: list[str] = []
        values: list[float] = []
        for index, entry in enumerate(records):
            if not isinstance(entry, dict):
                continue
            raw_value = entry.get(value_key)
            numeric = _safe_float(raw_value, math.nan)
            if math.isnan(numeric):
                continue
            label = entry.get(label_key)
            if label is None:
                label = f'Slice {index + 1}'
            categories.append(str(label))
            values.append(numeric)

        if not values:
            return None

        chart_kind = 'donut' if forced_pie and ('donut' in chart_type or 'doughnut' in chart_type) else 'pie'
        return {
            'type': chart_kind,
            'categories': categories,
            'series': [{'name': 'Series 1', 'values': values}],
            'seriesColors': _normalise_series_colors(metadata, candidate_dict),
        }

    if not numeric_keys:
        return None

    categories: list[str] = []
    series_values: dict[str, list[float]] = {key: [] for key in numeric_keys}

    for index, entry in enumerate(records):
        if not isinstance(entry, dict):
            continue
        label = entry.get(label_key, f'Row {index + 1}')
        categories.append(str(label))
        for key in numeric_keys:
            numeric = _safe_float(entry.get(key), math.nan)
            if math.isnan(numeric):
                numeric = 0.0
            series_values[key].append(numeric)

    chart_kind = 'column'
    if 'line' in chart_type:
        chart_kind = 'line'
    elif 'area' in chart_type:
        chart_kind = 'area'
    elif 'scatter' in chart_type:
        chart_kind = 'scatter'
    elif 'bar' in chart_type:
        chart_kind = 'bar'

    series = [
        {'name': key, 'values': series_values[key]}
        for key in numeric_keys
    ]

    legend_position = metadata.get('legendPosition') or metadata.get('legend_position')
    show_values = metadata.get('showValues') or metadata.get('showDataLabels')
    axis_zero = metadata.get('axisIncludesZero') or metadata.get('includeZero')

    return {
        'type': chart_kind,
        'categories': categories,
        'series': series,
        'legendPosition': legend_position,
        'showValues': bool(show_values) if show_values is not None else False,
        'axisIncludesZero': bool(axis_zero) if axis_zero is not None else False,
        'seriesColors': _normalise_series_colors(metadata, candidate_dict),
    }


def _extract_summary_lines(metadata: Optional[dict[str, Any]]) -> list[str]:
    if not metadata:
        return []

    lines: list[str] = []
    summary = metadata.get('summary')
    if isinstance(summary, list):
        lines.extend(str(item) for item in summary if _is_non_empty_str(item))
    elif _is_non_empty_str(summary):
        lines.append(str(summary))

    keys_to_skip = {
        'chartData',
        'chart_data',
        'chart',
        'chartMetadata',
        'chart_metadata',
        'chartState',
        'previewTable',
        'tableData',
        'table',
        'rows',
        'data',
        'previewImage',
        'preview_image',
        'visualization',
        'visualisation',
        'visualizationManifest',
        'visualisationManifest',
        'manifest',
    }

    for key, value in metadata.items():
        if key in keys_to_skip:
            continue
        if isinstance(value, (str, int, float, bool)):
            lines.append(f"{_humanise_key(key)}: {_format_table_value(value)}")
        elif isinstance(value, list) and value and len(lines) < 8:
            preview = ', '.join(str(item) for item in value[:3])
            lines.append(f"{_humanise_key(key)}: {preview}")
        if len(lines) >= 8:
            break

    return lines[:8]


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
        "dotted": MSO_LINE_DASH_STYLE.ROUND_DOT,
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
        'area': XL_CHART_TYPE.AREA_STACKED,
        'scatter': XL_CHART_TYPE.XY_SCATTER_LINES,
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


def _resolve_post_animation_image(props: dict[str, Any]) -> Optional[bytes]:
    png_candidate = props.get('postAnimationPng') or props.get('postAnimationImage')
    if isinstance(png_candidate, str) and png_candidate.strip():
        try:
            return _decode_data_url(png_candidate)
        except ExportGenerationError as exc:
            logger.warning('Unable to decode post-animation PNG for chart: %s', exc)

    svg_candidate = props.get('postAnimationSvg')
    if isinstance(svg_candidate, str) and svg_candidate.strip():
        if cairosvg is None:
            logger.debug('SVG chart provided but cairosvg is unavailable; skipping rasterisation.')
        else:
            try:
                svg_bytes = _decode_svg_data_url(svg_candidate)
                return cairosvg.svg2png(bytestring=svg_bytes)
            except ExportGenerationError as exc:
                logger.warning('Unable to decode post-animation SVG for chart: %s', exc)
            except Exception as exc:  # pragma: no cover - cairosvg runtime issues
                logger.warning('Failed to rasterise SVG chart for export: %s', exc)

    return None


def _apply_post_animation_overlays(slide: SlideExportPayload) -> None:
    screenshot = getattr(slide, 'screenshot', None)
    if not isinstance(screenshot, SlideScreenshotPayload):
        return

    overlays: list[tuple[SlideExportObjectPayload, bytes]] = []
    for obj in slide.objects:
        props = obj.props or {}
        if not isinstance(props, dict):
            continue
        image_bytes = _resolve_post_animation_image(props)
        if image_bytes:
            overlays.append((obj, image_bytes))

    if not overlays:
        return

    try:
        screenshot_bytes = _decode_data_url(screenshot.data_url)
    except ExportGenerationError as exc:
        logger.warning('Unable to decode screenshot for slide %s: %s', slide.id, exc)
        return

    try:
        base_image = Image.open(io.BytesIO(screenshot_bytes)).convert('RGBA')
    except Exception as exc:  # pragma: no cover - Pillow decoding edge cases
        logger.warning('Unable to load screenshot image for slide %s: %s', slide.id, exc)
        return

    css_width = _safe_float(getattr(screenshot, 'css_width', None), 0)
    css_height = _safe_float(getattr(screenshot, 'css_height', None), 0)
    pixel_ratio = _safe_float(getattr(screenshot, 'pixel_ratio', None), 0)
    image_width = base_image.width
    image_height = base_image.height

    if css_width <= 0 and image_width > 0 and pixel_ratio > 0:
        css_width = image_width / pixel_ratio
    if css_height <= 0 and image_height > 0 and pixel_ratio > 0:
        css_height = image_height / pixel_ratio

    if css_width <= 0:
        css_width = _safe_float(slide.base_width, image_width)
    if css_height <= 0:
        css_height = _safe_float(slide.base_height, image_height)

    scale_x = image_width / css_width if css_width > 0 else 1.0
    scale_y = image_height / css_height if css_height > 0 else 1.0

    updated = False
    for obj, image_bytes in overlays:
        obj_width = _safe_float(obj.width, 0)
        obj_height = _safe_float(obj.height, 0)
        if obj_width <= 0 or obj_height <= 0:
            continue

        try:
            overlay_image = Image.open(io.BytesIO(image_bytes)).convert('RGBA')
        except Exception as exc:  # pragma: no cover - Pillow decoding edge cases
            logger.warning('Unable to decode post-animation image for object %s: %s', obj.id, exc)
            continue

        target_width = max(int(round(obj_width * scale_x)), 1)
        target_height = max(int(round(obj_height * scale_y)), 1)

        if overlay_image.size != (target_width, target_height):
            try:
                overlay_image = overlay_image.resize((target_width, target_height), Image.LANCZOS)
            except Exception:  # pragma: no cover - resize issues
                overlay_image = overlay_image.resize((target_width, target_height))

        dest_x = int(round(_safe_float(obj.x, 0) * scale_x))
        dest_y = int(round(_safe_float(obj.y, 0) * scale_y))

        try:
            base_image.paste(overlay_image, (dest_x, dest_y), overlay_image)
            updated = True
        except Exception as exc:  # pragma: no cover - paste errors
            logger.warning(
                'Unable to overlay post-animation image for object %s on slide %s: %s',
                obj.id,
                slide.id,
                exc,
            )

    if not updated:
        return

    output = io.BytesIO()
    try:
        base_image.save(output, format='PNG')
    except Exception as exc:  # pragma: no cover - save errors
        logger.warning('Unable to encode overlaid screenshot for slide %s: %s', slide.id, exc)
        return

    encoded = base64.b64encode(output.getvalue()).decode('ascii')
    updated_payload = {
        **screenshot.model_dump(by_alias=True),
        'dataUrl': f'data:image/png;base64,{encoded}',
        'width': image_width,
        'height': image_height,
    }

    try:
        slide.screenshot = SlideScreenshotPayload.model_validate(updated_payload)
    except Exception as exc:  # pragma: no cover - validation errors
        logger.warning('Unable to update screenshot payload for slide %s: %s', slide.id, exc)


def _render_chart_image(slide, obj: SlideExportObjectPayload, image_bytes: bytes, offset_x: float, offset_y: float) -> None:
    width = _safe_float(obj.width, 0)
    height = _safe_float(obj.height, 0)
    if width <= 0 or height <= 0:
        return

    picture = slide.shapes.add_picture(
        io.BytesIO(image_bytes),
        _px_to_emu(obj.x + offset_x),
        _px_to_emu(obj.y + offset_y),
        width=_px_to_emu(width),
        height=_px_to_emu(height),
    )

    rotation = _safe_float(obj.rotation, 0.0)
    if rotation:
        picture.rotation = rotation


def _render_chart(slide, obj: SlideExportObjectPayload, offset_x: float = 0.0, offset_y: float = 0.0) -> None:
    props = obj.props or {}
    image_bytes = _resolve_post_animation_image(props)
    if image_bytes:
        _render_chart_image(slide, obj, image_bytes, offset_x, offset_y)
        return

    data = props.get('chartData')
    config = props.get('chartConfig') or {}

    if isinstance(data, list):
        if not data:
            logger.debug('Skipping chart on slide %s due to missing data', obj.id)
            return
    elif not isinstance(data, dict):
        logger.debug('Skipping chart on slide %s due to unsupported data payload', obj.id)
        return

    width = _safe_float(obj.width, 0)
    height = _safe_float(obj.height, 0)
    if width <= 0 or height <= 0:
        return

    chart_data = ChartData()
    series_colors: list[str] = []
    legend_position = _map_legend_position(config.get('legendPosition'))

    if isinstance(data, dict):
        categories = [str(category) for category in data.get('categories', [])]
        chart_data.categories = categories

        series_payload = data.get('series') if isinstance(data.get('series'), list) else []
        for index, series_entry in enumerate(series_payload):
            if not isinstance(series_entry, dict):
                continue
            name = str(series_entry.get('name') or f'Series {index + 1}')
            values_raw = series_entry.get('values')
            values: list[float] = []
            if isinstance(values_raw, list):
                for value in values_raw:
                    values.append(_safe_float(value, 0.0))
            if not values and categories:
                values = [0.0 for _ in categories]
            if values:
                while len(values) < len(categories):
                    values.append(0.0)
                if len(values) > len(categories):
                    values = values[: len(categories)]
                chart_data.add_series(name, values)
        series_colors = [
            str(color)
            for color in _ensure_list(data.get('seriesColors'))
            if _is_non_empty_str(color)
        ]
        chart_type_value = data.get('type') or config.get('type')
        chart_type = _map_chart_type(chart_type_value)
    else:
        # Backwards compatibility with legacy chart payloads
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

    if legend_position is None and isinstance(data, dict):
        legend_position = _map_legend_position(data.get('legendPosition'))

    chart.has_legend = legend_position is not None and len(chart.series) > 1
    if chart.has_legend and legend_position is not None:
        chart.legend.position = legend_position
        chart.legend.include_in_layout = False

    plot = chart.plots[0]
    show_values = config.get('showValues')
    if show_values is None and isinstance(data, dict):
        show_values = data.get('showValues')
    if bool(show_values):
        plot.has_data_labels = True
        data_labels = plot.data_labels
        data_labels.number_format = '0.00'
        data_labels.show_value = True
    else:
        plot.has_data_labels = False

    axis_includes_zero = config.get('axisIncludesZero')
    if axis_includes_zero is None and isinstance(data, dict):
        axis_includes_zero = data.get('axisIncludesZero')

    if chart_type not in {XL_CHART_TYPE.PIE, XL_CHART_TYPE.DOUGHNUT}:
        if bool(axis_includes_zero):
            try:
                chart.value_axis.crosses_at = 0
            except AttributeError:
                logger.debug('Chart type %s does not expose value axis', chart_type)

    for index, series in enumerate(chart.series):
        if index < len(series_colors):
            rgb = _parse_hex_color(series_colors[index])
            if rgb is not None:
                try:
                    fill = series.format.fill
                    fill.solid()
                    fill.fore_color.rgb = rgb
                except AttributeError:
                    pass

    rotation = _safe_float(obj.rotation, 0)
    if rotation:
        chart_shape.rotation = rotation


def _render_atom(slide, obj: SlideExportObjectPayload, offset_x: float = 0.0, offset_y: float = 0.0) -> None:
    width = _safe_float(obj.width, 0)
    height = _safe_float(obj.height, 0)
    if width <= 0 or height <= 0:
        return

    props = obj.props or {}
    atom = _as_dict(props.get('atom'))
    if not atom:
        logger.debug('Skipping atom object %s due to missing atom payload', obj.id)
        return

    metadata = _as_dict(atom.get('metadata')) or {}

    background_color = _parse_color_token(atom.get('color')) or _parse_color_token(props.get('color'))
    fill_color = _lighten_color(background_color, 0.6) if background_color else DEFAULT_ATOM_BACKGROUND
    border_color = background_color or DEFAULT_ATOM_BORDER

    background = slide.shapes.add_shape(
        MSO_SHAPE.ROUNDED_RECTANGLE,
        _px_to_emu(obj.x + offset_x),
        _px_to_emu(obj.y + offset_y),
        _px_to_emu(width),
        _px_to_emu(height),
    )
    background.line.width = Pt(2)
    try:
        background.line.fill.solid()
        background.line.fill.fore_color.rgb = border_color
    except AttributeError:
        try:
            background.line.color.rgb = border_color
        except AttributeError:
            pass

    background.fill.solid()
    background.fill.fore_color.rgb = fill_color
    try:
        background.adjustments[0] = 0.2
    except (AttributeError, IndexError):
        pass

    padding = 24.0
    inner_width = max(width - (padding * 2), 0)
    if inner_width <= 0:
        return

    title_text = str(atom.get('title') or atom.get('name') or '').strip()
    if not title_text:
        raw_id = atom.get('atomId') or atom.get('id')
        if _is_non_empty_str(raw_id):
            title_text = _humanise_key(str(raw_id))

    category_text = str(atom.get('category') or '').strip()

    cursor_y = obj.y + padding
    remaining_height = height - (cursor_y - obj.y) - padding

    if title_text and remaining_height > 0:
        title_height = min(max(remaining_height * 0.3, 32.0), remaining_height)
        title_box = SlideExportObjectPayload.model_validate(
            {
                'id': f'{obj.id}::title',
                'type': 'text-box',
                'x': obj.x + padding,
                'y': cursor_y,
                'width': inner_width,
                'height': title_height,
                'props': {
                    'text': title_text,
                    'fontFamily': props.get('fontFamily') or 'Inter',
                    'fontSize': 24,
                    'bold': True,
                    'align': 'left',
                    'color': '#111827',
                },
            }
        )
        _render_text_box(slide, title_box, offset_x, offset_y)
        cursor_y += title_height + 6
        remaining_height = height - (cursor_y - obj.y) - padding

    if category_text and remaining_height > 0:
        category_height = min(max(remaining_height * 0.25, 24.0), remaining_height)
        category_box = SlideExportObjectPayload.model_validate(
            {
                'id': f'{obj.id}::category',
                'type': 'text-box',
                'x': obj.x + padding,
                'y': cursor_y,
                'width': inner_width,
                'height': category_height,
                'props': {
                    'text': category_text,
                    'fontFamily': props.get('fontFamily') or 'Inter',
                    'fontSize': 14,
                    'bold': False,
                    'align': 'left',
                    'color': '#4B5563',
                },
            }
        )
        _render_text_box(slide, category_box, offset_x, offset_y)
        cursor_y += category_height + 10
        remaining_height = height - (cursor_y - obj.y) - padding

    content_height = remaining_height
    if content_height <= 0:
        return

    table_preview = _extract_table_preview(metadata)
    chart_preview = _extract_chart_preview(metadata)

    chart_overlay_props: dict[str, Any] = {}
    for key in (
        'postAnimationPng',
        'postAnimationSvg',
        'postAnimationWidth',
        'postAnimationHeight',
        'postAnimationPixelRatio',
    ):
        value = metadata.get(key)
        if value is None and key in props:
            value = props.get(key)
        if value is not None:
            chart_overlay_props[key] = value

    preview_image = None
    for key in ('previewImage', 'preview_image', 'image', 'thumbnail'):
        candidate = metadata.get(key)
        if _is_non_empty_str(candidate) and _is_data_url(str(candidate)):
            preview_image = str(candidate)
            break

    summary_lines = _extract_summary_lines(metadata)

    summary_height = 0.0
    has_primary = bool(table_preview or chart_preview or preview_image)
    if summary_lines and has_primary:
        approx_line_height = 18.0
        estimated = len(summary_lines) * approx_line_height + 16.0
        summary_height = min(content_height * 0.35, max(estimated, 64.0))
        if summary_height > content_height - 40:
            summary_height = max(content_height * 0.25, 56.0)

    primary_height = content_height - summary_height
    if has_primary and primary_height <= 0:
        summary_height = 0.0
        primary_height = content_height

    content_start = cursor_y
    next_y = content_start

    if table_preview:
        table_cells = _build_table_cells(table_preview['headers'], table_preview['rows'])
        table_object = SlideExportObjectPayload.model_validate(
            {
                'id': f'{obj.id}::table',
                'type': 'table',
                'x': obj.x + padding,
                'y': content_start,
                'width': inner_width,
                'height': primary_height,
                'props': {'data': table_cells},
            }
        )
        _render_table(slide, table_object, offset_x, offset_y)
        next_y = content_start + primary_height
    elif chart_preview or chart_overlay_props:
        chart_props: dict[str, Any] = {}
        if chart_preview:
            chart_props['chartData'] = chart_preview
            chart_props['chartConfig'] = {
                'type': chart_preview.get('type'),
                'legendPosition': chart_preview.get('legendPosition'),
                'showValues': chart_preview.get('showValues'),
                'axisIncludesZero': chart_preview.get('axisIncludesZero'),
                'seriesColors': chart_preview.get('seriesColors'),
            }
        chart_props.update(chart_overlay_props)

        chart_object = SlideExportObjectPayload.model_validate(
            {
                'id': f'{obj.id}::chart',
                'type': 'chart',
                'x': obj.x + padding,
                'y': content_start,
                'width': inner_width,
                'height': primary_height,
                'props': chart_props,
            }
        )
        _render_chart(slide, chart_object, offset_x, offset_y)
        next_y = content_start + primary_height
    elif preview_image:
        image_object = SlideExportObjectPayload.model_validate(
            {
                'id': f'{obj.id}::image',
                'type': 'image',
                'x': obj.x + padding,
                'y': content_start,
                'width': inner_width,
                'height': primary_height,
                'props': {'dataUrl': preview_image},
            }
        )
        _render_image(slide, image_object, offset_x, offset_y)
        next_y = content_start + primary_height
    elif summary_lines:
        summary_height = content_height
        next_y = content_start

    if summary_lines:
        if has_primary and summary_height > 0:
            next_y += 12
        summary_text = '\n'.join(f'• {line}' for line in summary_lines)
        summary_object = SlideExportObjectPayload.model_validate(
            {
                'id': f'{obj.id}::summary',
                'type': 'text-box',
                'x': obj.x + padding,
                'y': next_y,
                'width': inner_width,
                'height': summary_height if summary_height > 0 else content_height,
                'props': {
                    'text': summary_text,
                    'fontFamily': props.get('fontFamily') or 'Inter',
                    'fontSize': 12,
                    'align': 'left',
                    'color': '#1F2937',
                },
            }
        )
        _render_text_box(slide, summary_object, offset_x, offset_y)



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
            elif obj.type == 'atom':
                _render_atom(slide, obj, offset_x, offset_y)
            else:
                logger.debug('Skipping unsupported object type %s on slide %s', obj.type, slide_payload.id)
        except ExportGenerationError:
            raise
        except Exception as exc:  # pragma: no cover - best effort logging
            logger.exception('Failed to render %s on slide %s: %s', obj.type, slide_payload.id, exc)


def _render_screenshot_background(
    slide,
    slide_payload: SlideExportPayload,
    base_width: float,
    base_height: float,
    offset_x: float,
    offset_y: float,
) -> bool:
    screenshot = slide_payload.screenshot
    if not isinstance(screenshot, SlideScreenshotPayload):
        return False

    try:
        image_bytes = _decode_data_url(screenshot.data_url)
    except ExportGenerationError as exc:
        logger.warning('Unable to decode screenshot for slide %s: %s', slide_payload.id, exc)
        return False
    except Exception as exc:  # pragma: no cover - defensive logging
        logger.warning('Unexpected screenshot decoding error for slide %s: %s', slide_payload.id, exc)
        return False

    image_stream = io.BytesIO(image_bytes)
    try:
        picture = slide.shapes.add_picture(
            image_stream,
            _px_to_emu(offset_x),
            _px_to_emu(offset_y),
            width=_px_to_emu(base_width),
            height=_px_to_emu(base_height),
        )
    except Exception as exc:  # pragma: no cover - drawing edge cases
        logger.warning('Unable to add screenshot background for slide %s: %s', slide_payload.id, exc)
        return False

    try:
        picture.name = f"{slide_payload.id}-background"
    except Exception:  # pragma: no cover - property best effort
        pass

    try:
        lock = picture.lock
        lock.aspect_ratio = True
        lock.position = True
        lock.rotation = True
        lock.crop = True
    except AttributeError:
        pass

    return True


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


def _build_slide_metadata(slide_payload: SlideExportPayload) -> dict[str, Any]:
    objects: list[dict[str, Any]] = []
    for obj in slide_payload.objects:
        entry: dict[str, Any] = {
            "id": obj.id,
            "type": obj.type,
            "x": obj.x,
            "y": obj.y,
            "width": obj.width,
            "height": obj.height,
            "rotation": obj.rotation,
            "zIndex": obj.z_index,
            "props": obj.props or {},
        }
        group_id = getattr(obj, "group_id", None)
        if group_id is not None:
            entry["groupId"] = group_id
        objects.append(entry)

    metadata: dict[str, Any] = {
        "id": slide_payload.id,
        "index": slide_payload.index,
        "title": slide_payload.title,
        "baseWidth": slide_payload.base_width,
        "baseHeight": slide_payload.base_height,
        "presentationSettings": slide_payload.presentation_settings,
        "objects": objects,
    }

    screenshot = slide_payload.screenshot
    if isinstance(screenshot, SlideScreenshotPayload):
        metadata["screenshot"] = {
            "width": screenshot.width,
            "height": screenshot.height,
            "cssWidth": getattr(screenshot, "css_width", None),
            "cssHeight": getattr(screenshot, "css_height", None),
            "pixelRatio": getattr(screenshot, "pixel_ratio", None),
        }

    return metadata


def _attach_slide_metadata(slide, slide_payload: SlideExportPayload) -> None:
    metadata = _build_slide_metadata(slide_payload)
    try:
        serialised = json.dumps(metadata, ensure_ascii=False, separators=(",", ":"))
    except (TypeError, ValueError) as exc:
        logger.warning('Unable to serialise metadata for slide %s: %s', slide_payload.id, exc)
        return

    notes_slide = slide.notes_slide
    text_frame = notes_slide.notes_text_frame
    existing_text = [paragraph.text for paragraph in text_frame.paragraphs if paragraph.text.strip()]

    text_frame.clear()

    for paragraph_text in existing_text:
        paragraph = text_frame.add_paragraph()
        paragraph.text = paragraph_text

    marker = text_frame.add_paragraph()
    marker.text = METADATA_MARKER
    marker.level = 0
    try:
        marker.font.size = Pt(6)
    except AttributeError:
        pass

    data_paragraph = text_frame.add_paragraph()
    data_paragraph.text = serialised
    data_paragraph.level = 0
    try:
        data_paragraph.font.size = Pt(6)
    except AttributeError:
        pass


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

    try:
        inputs = build_inputs(render_slides)
        rendered = render_slide_batch(
            inputs,
            styles,
            pixel_ratio=max(pixel_ratios) if pixel_ratios else None,
        )
    except ExhibitionRendererError as exc:
        message = f"Server-side renderer failed to capture slides: {exc}"
        if strict:
            raise ExportGenerationError(message) from exc
        logger.warning(message)
        return {}

    return {entry.id: entry.as_payload() for entry in rendered}


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


def render_slide_screenshots(payload: ExhibitionExportRequest) -> list[dict[str, object]]:
    """Render slide screenshots using the server-side rendering service."""

    if not payload.slides:
        raise ExportGenerationError('No slides provided for export.')

    ordered_slides = sorted(payload.slides, key=lambda slide: slide.index)

    _attempt_server_screenshots(payload, ordered_slides)
    _ensure_slide_screenshots(payload, ordered_slides)

    rendered: list[SlideScreenshotResponse] = []
    for slide in ordered_slides:
        _apply_post_animation_overlays(slide)
        screenshot = slide.screenshot
        if not isinstance(screenshot, SlideScreenshotPayload):
            raise ExportGenerationError(
                f'Unable to render screenshot for slide {slide.id}.'
            )

        entry = SlideScreenshotResponse.model_validate(
            {
                "id": slide.id,
                "index": slide.index,
                **screenshot.model_dump(by_alias=True),
            }
        )
        rendered.append(entry)

    return [entry.model_dump(by_alias=True) for entry in rendered]


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
        _attach_slide_metadata(slide, slide_payload)

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

        if css_width <= 0 and image_width > 0 and pixel_ratio > 0:
            css_width = image_width / pixel_ratio
        if css_height <= 0 and image_height > 0 and pixel_ratio > 0:
            css_height = image_height / pixel_ratio

        if css_width <= 0:
            css_width = width
        if css_height <= 0:
            css_height = height

        aspect_ratio = css_height / css_width if css_width > 0 else 1.0
        if aspect_ratio <= 0:
            aspect_ratio = height / width if width > 0 else 1.0

        draw_width = page_width
        draw_height = draw_width * aspect_ratio

        if draw_height > page_height and draw_height > 0:
            scale = page_height / draw_height
            draw_height = page_height
            draw_width = draw_width * scale

        offset_x = (page_width - draw_width) / 2 if draw_width < page_width else 0.0
        offset_y = (page_height - draw_height) / 2 if draw_height < page_height else 0.0

        pdf.drawImage(
            image,
            offset_x,
            offset_y,
            width=draw_width,
            height=draw_height,
            preserveAspectRatio=False,
            mask='auto',
        )

        scale_x = draw_width / page_width if page_width > 0 else 1.0
        scale_y = draw_height / page_height if page_height > 0 else 1.0

        for obj in slide.objects:
            props = obj.props or {}
            if not isinstance(props, dict):
                continue

            image_bytes = _resolve_post_animation_image(props)
            if not image_bytes:
                continue

            obj_width = _safe_float(obj.width, 0)
            obj_height = _safe_float(obj.height, 0)
            if obj_width <= 0 or obj_height <= 0:
                continue

            chart_x_pt = _px_to_pt(_safe_float(obj.x, 0))
            chart_y_pt = _px_to_pt(_safe_float(obj.y, 0))
            chart_width_pt = _px_to_pt(obj_width)
            chart_height_pt = _px_to_pt(obj_height)
            chart_bottom_pt = page_height - (chart_y_pt + chart_height_pt)

            draw_x = offset_x + chart_x_pt * scale_x
            draw_y = offset_y + chart_bottom_pt * scale_y
            draw_w = chart_width_pt * scale_x
            draw_h = chart_height_pt * scale_y

            image_reader = ImageReader(io.BytesIO(image_bytes))
            pdf.drawImage(
                image_reader,
                draw_x,
                draw_y,
                width=draw_w,
                height=draw_h,
                preserveAspectRatio=False,
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
