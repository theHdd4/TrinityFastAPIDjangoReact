from __future__ import annotations

from datetime import datetime
from typing import Any, Dict, List, Optional

from pydantic import BaseModel, Field


class ExhibitionSku(BaseModel):
    id: str = Field(..., description="Unique identifier for the SKU")
    title: str = Field(..., description="Display name for the SKU")
    details: Optional[Dict[str, Any]] = Field(
        default=None,
        description="Additional metadata captured for the SKU",
    )


class ExhibitionComponents(BaseModel):
    skuStatistics: bool = Field(False, description="Include SKU statistics summary")
    trendAnalysis: bool = Field(False, description="Include trend analysis visuals")


class ExhibitionTrendSettings(BaseModel):
    chartType: str = Field(..., description="Active chart type used in trend analysis")
    theme: str = Field(..., description="Selected colour theme identifier")
    colorPalette: Optional[List[str]] = Field(
        default=None,
        description="Resolved colour palette for the current chart theme",
    )
    showGrid: bool = Field(True, description="Whether the grid overlay is visible")
    showLegend: bool = Field(True, description="Whether the legend is displayed")
    showDataLabels: bool = Field(False, description="Whether data labels are rendered")
    showAxisLabels: bool = Field(True, description="Whether axis labels are rendered")
    xAxisField: Optional[str] = Field(
        default=None,
        description="Source field powering the X axis",
    )
    yAxisField: Optional[str] = Field(
        default=None,
        description="Source field powering the Y axis",
    )


class ExhibitionSkuStatisticsSettings(BaseModel):
    visibility: Dict[str, bool] = Field(
        default_factory=dict,
        description="Visibility toggles for SKU statistics table elements",
    )
    tableRows: Optional[List[Dict[str, Any]]] = Field(
        default=None,
        description="Snapshot of the SKU statistics rows staged for exhibition",
    )
    tableColumns: Optional[List[str]] = Field(
        default=None,
        description="Column order used when capturing the SKU statistics table",
    )


class ExhibitionFeatureOverview(BaseModel):
    atomId: str = Field(..., description="Identifier of the Feature Overview atom")
    cardId: str = Field(..., description="Identifier of the parent card")
    components: ExhibitionComponents = Field(
        default_factory=ExhibitionComponents,
        description="Which sections should render in exhibition mode",
    )
    skus: List[ExhibitionSku] = Field(default_factory=list)
    chartSettings: Optional[ExhibitionTrendSettings] = Field(
        default=None,
        description="Chart configuration applied to trend analysis visuals",
    )
    skuStatisticsSettings: Optional[ExhibitionSkuStatisticsSettings] = Field(
        default=None,
        description="Display preferences for the SKU statistics table",
    )


class ExhibitionConfigurationBase(BaseModel):
    client_name: str = Field(..., min_length=1)
    app_name: str = Field(..., min_length=1)
    project_name: str = Field(..., min_length=1)
    cards: List[Dict[str, Any]] = Field(default_factory=list)
    feature_overview: Optional[List[ExhibitionFeatureOverview]] = None


class ExhibitionConfigurationIn(ExhibitionConfigurationBase):
    """Payload accepted when saving an exhibition configuration."""


class ExhibitionConfigurationOut(ExhibitionConfigurationBase):
    updated_at: Optional[datetime] = None

    class Config:
        orm_mode = True
