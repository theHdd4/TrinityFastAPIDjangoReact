from __future__ import annotations

from typing import Annotated, Any, Dict, List, Literal, Optional, Union

from pydantic import BaseModel, ConfigDict, Field


class GradientSpec(BaseModel):
    angle: float = 0
    colors: List[str] = Field(default_factory=list)

    model_config = ConfigDict(extra="ignore")


class BackgroundSpec(BaseModel):
    type: Literal['solid', 'gradient', 'image']
    color: Optional[str] = None
    gradient: Optional[GradientSpec] = None
    image_src: Optional[str] = Field(default=None, alias='imageSrc')
    image_data: Optional[str] = Field(default=None, alias='imageData')

    model_config = ConfigDict(populate_by_name=True, extra="ignore")


class OverlaySpec(BaseModel):
    type: Literal['color', 'gradient', 'image']
    color: Optional[str] = None
    gradient: Optional[GradientSpec] = None
    image_src: Optional[str] = Field(default=None, alias='imageSrc')
    image_data: Optional[str] = Field(default=None, alias='imageData')
    x: float
    y: float
    width: float
    height: float

    model_config = ConfigDict(populate_by_name=True, extra="ignore")


class BaseObject(BaseModel):
    id: str
    kind: Literal['text', 'image', 'shape', 'table', 'chart', 'foreign']
    x: float
    y: float
    width: float
    height: float
    rotation: float = 0
    z_index: int = Field(default=0, alias='zIndex')

    model_config = ConfigDict(populate_by_name=True, extra="ignore")


class TextObject(BaseObject):
    kind: Literal['text']
    text: str = ''
    font_size: float = Field(default=16, alias='fontSize')
    font_family: str = Field(default='Arial', alias='fontFamily')
    bold: bool = False
    italic: bool = False
    underline: bool = False
    align: Literal['left', 'center', 'right'] = 'left'
    color: str = '#111827'


class ImageObject(BaseObject):
    kind: Literal['image']
    src: str = ''
    name: Optional[str] = None
    data: Optional[str] = None


class ShapeObject(BaseObject):
    kind: Literal['shape']
    shape_id: str = Field(alias='shapeId')
    fill: str = '#111827'
    stroke: str = 'transparent'
    stroke_width: float = Field(default=0, alias='strokeWidth')
    stroke_style: str = Field(default='solid', alias='strokeStyle')
    opacity: float = 1.0


class TableCellFormatting(BaseModel):
    font_family: str = Field(default='Arial', alias='fontFamily')
    font_size: float = Field(default=14, alias='fontSize')
    bold: bool = False
    italic: bool = False
    underline: bool = False
    strikethrough: bool = False
    align: Literal['left', 'center', 'right'] = 'left'
    color: str = '#111827'

    model_config = ConfigDict(populate_by_name=True, extra="ignore")


class TableCell(BaseModel):
    content: str = ''
    formatting: TableCellFormatting = Field(default_factory=TableCellFormatting)
    row_span: Optional[int] = Field(default=None, alias='rowSpan')
    col_span: Optional[int] = Field(default=None, alias='colSpan')

    model_config = ConfigDict(populate_by_name=True, extra="ignore")


class TableObject(BaseObject):
    kind: Literal['table']
    data: List[List[TableCell]] = Field(default_factory=list)
    show_outline: bool = Field(default=True, alias='showOutline')


class ChartObject(BaseObject):
    kind: Literal['chart']
    chart_config: Optional[Dict[str, Any]] = Field(default=None, alias='chartConfig')
    chart_data: List[Dict[str, Any]] = Field(default_factory=list, alias='chartData')


class ForeignObject(BaseObject):
    kind: Literal['foreign']
    object_type: str = Field(default='', alias='objectType')


SlideObject = Annotated[
    Union[TextObject, ImageObject, ShapeObject, TableObject, ChartObject, ForeignObject],
    Field(discriminator='kind'),
]


class SlideExportData(BaseModel):
    id: str
    title: str = ''
    settings: Dict[str, Any] = Field(default_factory=dict)
    background: BackgroundSpec
    overlay: Optional[OverlaySpec] = None
    objects: List[SlideObject] = Field(default_factory=list)

    model_config = ConfigDict(populate_by_name=True, extra="ignore")


class SlideScreenshot(BaseModel):
    id: str
    data: str
    mime_type: str = Field(default='image/png', alias='mimeType')
    width: int
    height: int
    scale: float = 1.0

    model_config = ConfigDict(populate_by_name=True, extra="ignore")


class ExportRequest(BaseModel):
    title: str = 'Presentation'
    slides: List[SlideExportData] = Field(default_factory=list)
    screenshots: List[SlideScreenshot] = Field(default_factory=list)

    model_config = ConfigDict(populate_by_name=True, extra="ignore")
