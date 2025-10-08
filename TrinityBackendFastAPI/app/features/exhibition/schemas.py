from __future__ import annotations

from datetime import datetime
from typing import Any, Dict, List, Optional

from pydantic import BaseModel, Field


class ExhibitionChartSettings(BaseModel):
    chart_type: str = Field(..., description="Selected chart type for rendering")
    chart_theme: str = Field(..., description="Theme to apply to the chart")
    show_data_labels: bool = Field(
        default=False, description="Whether individual data points should display labels",
    )
    show_axis_labels: bool = Field(
        default=True, description="Whether axis labels should be rendered",
    )
    x_axis_label: Optional[str] = Field(
        default=None, description="Label for the chart X axis",
    )
    y_axis_label: Optional[str] = Field(
        default=None, description="Label for the chart Y axis",
    )


class ExhibitionCatalogueComponent(BaseModel):
    type: str = Field(..., description="Type of the exhibited component")
    title: str = Field(..., description="Unique display title for the catalogue entry")
    label: Optional[str] = Field(default=None, description="Human readable label for the component")
    catalogue_id: Optional[str] = Field(
        default=None, description="Stable identifier for the catalogue entry"
    )
    metadata: Optional[Dict[str, Any]] = Field(
        default=None,
        description="Additional payload needed to render the component",
    )


class ExhibitionSku(BaseModel):
    id: str = Field(..., description="Unique identifier for the SKU")
    title: str = Field(..., description="Display name for the SKU")
    details: Optional[Dict[str, Any]] = Field(
        default=None,
        description="Additional metadata captured for the SKU",
    )
    catalogue_components: Optional[List[ExhibitionCatalogueComponent]] = Field(
        default=None,
        description="Catalogue entries generated for this SKU",
    )
    statistical_summaries: Optional[List["ExhibitionStatisticalSummary"]] = Field(
        default=None,
        description="Metric level statistical summaries prepared for exhibition",
    )


class ExhibitionComponents(BaseModel):
    skuStatistics: bool = Field(False, description="Include SKU statistics summary")
    trendAnalysis: bool = Field(False, description="Include trend analysis visuals")


class ExhibitionStatisticalSummary(BaseModel):
    metric: str = Field(..., description="Identifier of the exhibited metric or Y-axis")
    metric_label: Optional[str] = Field(
        default=None, description="Display label for the exhibited metric",
    )
    summary: Dict[str, Any] = Field(
        default_factory=dict,
        description="Summary statistics for the metric",
    )
    timeseries: List[Dict[str, Any]] = Field(
        default_factory=list,
        description="Time series data backing the trend analysis chart",
    )
    chart_settings: ExhibitionChartSettings = Field(
        ..., description="Chart presentation preferences",
    )
    combination: Optional[Dict[str, Any]] = Field(
        default=None,
        description="Dimension combination used to calculate the metric",
    )
    component_type: str = Field(
        default="statistical_summary", description="Component type identifier",
    )
    catalogue_id: Optional[str] = Field(
        default=None,
        description="Stable identifier generated for this metric component",
    )
    catalogue_title: Optional[str] = Field(
        default=None,
        description="Display title generated for this metric component",
    )
    metadata: Optional[Dict[str, Any]] = Field(
        default=None,
        description="Cached metadata required to render the metric component",
    )


class ExhibitionFeatureOverview(BaseModel):
    atomId: str = Field(..., description="Identifier of the Feature Overview atom")
    cardId: str = Field(..., description="Identifier of the parent card")
    components: Optional[ExhibitionComponents] = Field(
        default=None,
        description="Which sections should render in exhibition mode",
    )
    skus: List[ExhibitionSku] = Field(default_factory=list)


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
