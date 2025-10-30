from __future__ import annotations

import base64
import html
import io
import logging
import math
import re
from typing import Iterable, Optional

from pptx import Presentation
from pptx.chart.data import ChartData
from pptx.dml.color import RGBColor
from pptx.enum.chart import XL_CHART_TYPE, XL_LEGEND_POSITION
from pptx.enum.text import MSO_ANCHOR, PP_ALIGN
from pptx.util import Emu, Pt
from reportlab.lib.utils import ImageReader
from reportlab.pdfgen import canvas

from .schemas import ExhibitionExportRequest, SlideExportObjectPayload, SlideExportPayload

logger = logging.getLogger(__name__)

PX_PER_INCH = 96.0
EMU_PER_INCH = 914400
PT_PER_INCH = 72.0


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


def _render_text_box(slide, obj: SlideExportObjectPayload) -> None:
    width = _safe_float(obj.width, 0)
    height = _safe_float(obj.height, 0)
    if width <= 0 or height <= 0:
        return

    shape = slide.shapes.add_textbox(
        _px_to_emu(obj.x),
        _px_to_emu(obj.y),
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


def _render_image(slide, obj: SlideExportObjectPayload) -> None:
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
        _px_to_emu(obj.x),
        _px_to_emu(obj.y),
        width=_px_to_emu(width),
        height=_px_to_emu(height),
    )

    rotation = _safe_float(obj.rotation, 0)
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


def _render_table(slide, obj: SlideExportObjectPayload) -> None:
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
        _px_to_emu(obj.x),
        _px_to_emu(obj.y),
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


def _render_chart(slide, obj: SlideExportObjectPayload) -> None:
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
        _px_to_emu(obj.x),
        _px_to_emu(obj.y),
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


def _render_slide_objects(slide, slide_payload: SlideExportPayload) -> None:
    for obj in _sort_objects(slide_payload.objects):
        try:
            if obj.type == 'text-box':
                _render_text_box(slide, obj)
            elif obj.type == 'image':
                _render_image(slide, obj)
            elif obj.type == 'table':
                _render_table(slide, obj)
            elif obj.type == 'chart':
                _render_chart(slide, obj)
            else:
                logger.debug('Skipping unsupported object type %s on slide %s', obj.type, slide_payload.id)
        except ExportGenerationError:
            raise
        except Exception as exc:  # pragma: no cover - best effort logging
            logger.exception('Failed to render %s on slide %s: %s', obj.type, slide_payload.id, exc)


def _resolve_slide_dimensions(slide: SlideExportPayload) -> tuple[float, float]:
    width = _safe_float(slide.base_width, 0)
    height = _safe_float(slide.base_height, 0)

    if width <= 0 or height <= 0 and slide.screenshot:
        screenshot = slide.screenshot
        width = max(width, _safe_float(getattr(screenshot, 'css_width', None), 0))
        height = max(height, _safe_float(getattr(screenshot, 'css_height', None), 0))
        width = width or _safe_float(getattr(screenshot, 'width', None), 0)
        height = height or _safe_float(getattr(screenshot, 'height', None), 0)

    if width <= 0 or height <= 0:
        raise ExportGenerationError('Slide dimensions are missing or invalid.')

    return width, height


def build_pptx_bytes(payload: ExhibitionExportRequest) -> bytes:
    if not payload.slides:
        raise ExportGenerationError('No slides provided for export.')

    ordered_slides = sorted(payload.slides, key=lambda slide: slide.index)
    width, height = _resolve_slide_dimensions(ordered_slides[0])

    presentation = Presentation()
    presentation.slide_width = _px_to_emu(width)
    presentation.slide_height = _px_to_emu(height)

    title = (payload.title or 'Exhibition Presentation').strip() or 'Exhibition Presentation'
    presentation.core_properties.title = title
    presentation.core_properties.subject = 'Exhibition export'
    presentation.core_properties.author = 'Trinity Exhibition'

    for slide_payload in ordered_slides:
        slide = presentation.slides.add_slide(presentation.slide_layouts[6])
        _render_slide_objects(slide, slide_payload)

    output = io.BytesIO()
    presentation.save(output)
    output.seek(0)
    return output.getvalue()


def build_pdf_bytes(payload: ExhibitionExportRequest) -> bytes:
    if not payload.slides:
        raise ExportGenerationError('No slides provided for export.')

    ordered_slides = sorted(payload.slides, key=lambda slide: slide.index)

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

        scale = min(width / css_width if css_width else 1.0, height / css_height if css_height else 1.0)
        if scale <= 0:
            scale = 1.0

        draw_width = _px_to_pt(css_width * scale)
        draw_height = _px_to_pt(css_height * scale)
        offset_x = (page_width - draw_width) / 2
        offset_y = (page_height - draw_height) / 2

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
