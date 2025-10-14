from __future__ import annotations

from datetime import datetime
from typing import Any, Dict, List, Optional

from pydantic import BaseModel, Field


class VisualizationManifest(BaseModel):
    """Immutable snapshot of a laboratory visualisation used in exhibition mode."""

    manifest_id: str = Field(..., min_length=1, alias="manifestId")
    component_id: str = Field(..., min_length=1, alias="componentId")
    atom_id: Optional[str] = Field(None, alias="atomId")
    view: Optional[str] = Field(
        default=None,
        description="Logical view for the manifest (e.g. statistical_summary, trend_analysis)",
    )
    created_at: Optional[str] = Field(
        default=None,
        alias="createdAt",
        description="ISO timestamp describing when the manifest was generated",
    )
    thumbnail: Optional[str] = Field(
        default=None,
        description="Base64 encoded preview thumbnail captured from laboratory mode",
    )
    viz_spec: Dict[str, Any] = Field(
        default_factory=dict,
        alias="vizSpec",
        description="Renderer-ready specification used to recreate the visualisation",
    )
    chart_data: Dict[str, Any] = Field(
        default_factory=dict,
        alias="chartData",
        description="Raw data buffers required by the renderer",
    )
    sku_data: Optional[Dict[str, Any]] = Field(
        default=None,
        alias="skuData",
        description="Captured SKU level payload associated with this manifest",
    )

    class Config:
        allow_population_by_field_name = True


class ExhibitionComponent(BaseModel):
    """Represents a component exhibited from a specific atom."""

    id: str = Field(..., description="Identifier of the exhibited component")
    atomId: Optional[str] = Field(None, description="Source atom identifier for the component")
    title: Optional[str] = Field(None, description="Display label for the exhibited component")
    category: Optional[str] = Field(None, description="Category of the exhibited component")
    color: Optional[str] = Field(None, description="Accent colour associated with the component")
    metadata: Optional[Dict[str, Any]] = Field(
        default=None,
        description="Additional metadata captured for the exhibited component",
    )
    manifest_ref: Optional[str] = Field(
        default=None,
        alias="manifestRef",
        description="Identifier linking the component to a stored visualisation manifest",
    )
    visualisation_manifest: Optional[VisualizationManifest] = Field(
        default=None,
        alias="visualisationManifest",
        description="Complete manifest payload used for read-only rendering in exhibition mode",
    )

    class Config:
        allow_population_by_field_name = True


class ExhibitionAtomEntry(BaseModel):
    """Grouping of exhibited components for a single atom."""

    id: str = Field(..., min_length=1, description="Stable identifier for the exhibited atom entry")
    atom_name: str = Field(..., min_length=1, description="Human friendly name of the atom")
    exhibited_components: List[ExhibitionComponent] = Field(
        default_factory=list,
        description="Components from the atom that should appear in the exhibition catalogue",
    )


class ExhibitionConfigurationBase(BaseModel):
    client_name: str = Field(..., min_length=1)
    app_name: str = Field(..., min_length=1)
    project_name: str = Field(..., min_length=1)
    atoms: List[ExhibitionAtomEntry] = Field(default_factory=list)


class ExhibitionConfigurationIn(ExhibitionConfigurationBase):
    """Payload accepted when saving an exhibition configuration."""


class ExhibitionConfigurationOut(ExhibitionConfigurationBase):
    updated_at: Optional[datetime] = Field(default=None, description="Timestamp of the last update")

    class Config:
        orm_mode = True
