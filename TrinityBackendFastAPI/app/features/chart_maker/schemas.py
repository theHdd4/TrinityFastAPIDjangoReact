from typing import List, Optional, Literal, Union
from pydantic import BaseModel, conint, confloat

# Allowed types for style options
LineStyle = Literal['-', '--', '-.', ':']
MarkerStyle = Literal['o', 's', 'D', '^', 'v', '>', '<', 'p', '*', 'x']
GridType = Literal['both', 'horizontal', 'vertical', 'neither']
LegendPosition = Literal[  'top', 'bottom', 'left', 'right',
    'top+right', 'top+left', 'bottom+right', 'bottom+left',
    'left+top', 'left+bottom', 'right+top', 'right+bottom']
LegendOrientation = Literal['h', 'v']
PieTextPosition = Literal['inside', 'outside', 'auto', 'none']
PieTextInfo = Literal['label', 'percent', 'value', 'label+percent', 'label+value']


class TitleConfig(BaseModel):
    text: str
    font_family: Optional[str] = "Arial"
    font_size: Optional[conint(ge=8, le=72)] = 24
    font_color: Optional[str] = "#2c3e50"
    bold: Optional[bool] = False
    italic: Optional[bool] = False
    x: Optional[confloat(ge=0.0, le=1.0)] = 0.5   
    y: Optional[confloat(ge=0.0, le=1.0)] = 1.0    

class AxisLabelConfig(BaseModel):
    text: str
    font_family: Optional[str] = "Arial"
    font_size: Optional[conint(ge=8, le=72)] = 16
    font_color: Optional[str] = "#3775b4"
    rotation: Optional[conint(ge=0, le=90)] = 0
    bold: Optional[bool] = False 
    italic: Optional[bool] = False

class LineStyleConfig(BaseModel):
    linewidth: Optional[List[conint(ge=1, le=10)]] = [2]
    linestyle: Optional[List[LineStyle]] = ['-']
    marker: Optional[List[MarkerStyle]] = ['o']
    color: Optional[List[str]] = ["#27e230"]
    alpha: Optional[List[confloat(ge=0.0, le=1.0)]] = [1.0]
    markersize: Optional[List[conint(ge=4, le=20)]] = [8]

class BarStyleConfig(BaseModel):
    barmode: Literal['group', 'stack', 'overlay', 'relative'] = 'group'
    width: Optional[confloat(ge=0.1, le=1.0)] = None
    opacity: Optional[List[confloat(ge=0.0, le=1.0)]] = [0.8]
    color: Optional[List[str]] = None
    border_color: Optional[List[str]] = ["#A46161"]
    border_width: Optional[List[conint(ge=0, le=5)]] = [1]

class PieStyleConfig(BaseModel):
    color: Optional[List[str]] = None
    textposition: Optional[PieTextPosition] = 'auto'
    textinfo: Optional[PieTextInfo] = 'label+percent'
    textfont_size: Optional[conint(ge=8, le=24)] = 12
    textfont_color: Optional[str] = "#000000"
    border_color: Optional[str] = "#FFFFFF"
    border_width: Optional[conint(ge=0, le=5)] = 1
    opacity: Optional[confloat(ge=0.0, le=1.0)] = 0.8

class ScatterStyleConfig(BaseModel):
    marker: Optional[List[MarkerStyle]] = ['o']
    color: Optional[List[str]] = ["#27e230"]
    alpha: Optional[List[confloat(ge=0.0, le=1.0)]] = [1.0]
    markersize: Optional[List[conint(ge=4, le=20)]] = [8]
    line: Optional[bool] = False

class BackgroundConfig(BaseModel):
    plot_bgcolor: Optional[str] = "#ffffff"
    paper_bgcolor: Optional[str] = "#ffffff"

class LegendConfig(BaseModel):
    show: Optional[bool] = True
    position: Optional[LegendPosition] = 'top+right'
    orientation: Optional[LegendOrientation] = 'v'
    font_size: Optional[conint(ge=8, le=24)] = 12
    font_color: Optional[str] = "#000000"
    bgcolor: Optional[str] = "#ffffff"
    bordercolor: Optional[str] = "#000000"
    borderwidth: Optional[conint(ge=0, le=5)] = 1

class GridConfig(BaseModel):
    type: Optional[GridType] = 'both'
    linewidth: Optional[conint(ge=1, le=5)] = 1
    color: Optional[str] = "#e0e0e0"

class AnnotationConfig(BaseModel):
    text: str
    x: Optional[Union[int, float, str]] = None
    y: Optional[Union[int, float, str]] = None
    font_size: Optional[conint(ge=8, le=72)] = 12
    font_color: Optional[str] = "#000000"
    bgcolor: Optional[str] = "#ffffff"
    bordercolor: Optional[str] = "#000000"
    borderwidth: Optional[conint(ge=0, le=5)] = 1

class Trace(BaseModel):
    x_column: str
    y_column: str
    name: Optional[str] = None
    aggregation: Optional[Literal['sum', 'mean', 'count', 'min', 'max']] = 'sum'
    annotation: Optional[AnnotationConfig] = None
    style: Optional[Union[LineStyleConfig, BarStyleConfig, PieStyleConfig, ScatterStyleConfig]] = None

# Remove the old ChartRequest class - keeping only the recharts-compatible one below

# Filter schemas
class CategoricalFilter(BaseModel):
    type: Literal["categorical"] = "categorical"
    column: str
    values: List[str]

class NumericalFilter(BaseModel):
    type: Literal["numerical"] = "numerical"
    column: str
    operator: Literal["==", "!=", "<", "<=", ">", ">=", "between"]
    value: Union[int, float, List[Union[int, float]]]

# Response schemas
class ColumnResponse(BaseModel):
    numeric_columns: List[str]
    categorical_columns: List[str]

class UniqueValuesResponse(BaseModel):
    values: dict

class FilterResponse(BaseModel):
    filtered_data: List[dict]

class AllColumnsResponse(BaseModel):
    columns: List[str]

# CSV Upload response schemas
class CSVUploadResponse(BaseModel):
    file_id: str
    columns: List[str]
    numeric_columns: List[str]
    categorical_columns: List[str]
    unique_values: dict
    sample_data: List[dict]
    row_count: int

class LoadSavedDataframeRequest(BaseModel):
    object_name: str

# Recharts-specific schemas for chart generation
class RechartsStyleConfig(BaseModel):
    stroke: Optional[str] = "#8884d8"
    strokeWidth: Optional[int] = 2
    fill: Optional[str] = "#8884d8"
    fillOpacity: Optional[float] = 0.6
    strokeDasharray: Optional[str] = None

class RechartsDataKey(BaseModel):
    dataKey: str
    name: Optional[str] = None
    type: Optional[Literal["monotone", "linear", "basis", "cardinal", "step"]] = "monotone"
    stroke: Optional[str] = None
    fill: Optional[str] = None
    strokeWidth: Optional[int] = None
    fillOpacity: Optional[float] = None

class RechartsAxisConfig(BaseModel):
    dataKey: Optional[str] = None
    label: Optional[str] = None
    type: Optional[Literal["number", "category"]] = "category"
    domain: Optional[List[Union[str, int]]] = None
    tickFormatter: Optional[str] = None

class RechartsLegendConfig(BaseModel):
    show: bool = True
    verticalAlign: Optional[Literal["top", "middle", "bottom"]] = "top"
    height: Optional[int] = 36

class RechartsTooltipConfig(BaseModel):
    show: bool = True
    formatter: Optional[str] = None
    labelFormatter: Optional[str] = None

class RechartsResponsiveConfig(BaseModel):
    width: Optional[Union[str, int]] = "100%"
    height: Optional[int] = 300

class ChartTrace(BaseModel):
    x_column: str
    y_column: str
    name: Optional[str] = None
    chart_type: Literal["line", "bar", "area", "pie", "scatter"] = "line"
    style: Optional[RechartsStyleConfig] = None
    aggregation: Optional[Literal["sum", "mean", "count", "min", "max"]] = "sum"
    filters: Optional[dict] = None  # Trace-specific filters
    color: Optional[str] = None  # Trace-specific color
    legend_field: Optional[str] = None  # Field to segregate values by (like channel, region, etc.)

class ChartRequest(BaseModel):
    file_id: str
    chart_type: Literal["line", "bar", "area", "pie", "scatter"]
    traces: List[ChartTrace]
    title: Optional[str] = None
    x_axis: Optional[RechartsAxisConfig] = None
    y_axis: Optional[RechartsAxisConfig] = None
    legend: Optional[RechartsLegendConfig] = None
    tooltip: Optional[RechartsTooltipConfig] = None
    responsive: Optional[RechartsResponsiveConfig] = None
    filters: Optional[dict] = None
    filtered_data: Optional[List[dict]] = None  # Priority data if provided

class RechartsConfig(BaseModel):
    chart_type: str
    data: List[dict]
    traces: List[RechartsDataKey]
    title: Optional[str] = None
    x_axis: Optional[RechartsAxisConfig] = None
    y_axis: Optional[RechartsAxisConfig] = None
    legend: Optional[RechartsLegendConfig] = None
    tooltip: Optional[RechartsTooltipConfig] = None
    responsive: Optional[RechartsResponsiveConfig] = None

class ChartResponse(BaseModel):
    chart_id: str
    chart_config: RechartsConfig
    data_summary: dict
    file_name: Optional[str] = None
    data_source: Optional[str] = None