from __future__ import annotations

from datetime import datetime
from typing import Any, Dict, List, Optional

from pydantic import BaseModel, Field


class ExhibitionCatalogueComponent(BaseModel):
    type: str = Field(..., description="Type of the exhibited component")
    title: str = Field(..., description="Unique display title for the catalogue entry")
    label: Optional[str] = Field(default=None, description="Human readable label for the component")
    catalogue_id: Optional[str] = Field(
        default=None, description="Stable identifier for the catalogue entry"
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


class ExhibitionComponents(BaseModel):
    skuStatistics: bool = Field(False, description="Include SKU statistics summary")
    trendAnalysis: bool = Field(False, description="Include trend analysis visuals")


class ExhibitionFeatureOverview(BaseModel):
    atomId: str = Field(..., description="Identifier of the Feature Overview atom")
    cardId: str = Field(..., description="Identifier of the parent card")
    components: ExhibitionComponents = Field(
        default_factory=ExhibitionComponents,
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
