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


class ExhibitionCatalogueComponent(BaseModel):
    id: str = Field(..., description="Unique identifier for the catalogue component")
    atom_id: str = Field(
        ...,
        alias="atomId",
        description="Identifier of the originating atom",
    )
    title: str = Field(..., description="Display title for the component")
    category: Optional[str] = Field(
        default=None,
        description="Category grouping used when rendering the component",
    )
    color: Optional[str] = Field(
        default=None,
        description="Tailwind colour class applied to the component chip",
    )
    metadata: Optional[Dict[str, Any]] = Field(
        default=None,
        description="Arbitrary metadata describing the component",
    )

    class Config:
        allow_population_by_field_name = True
        fields = {"atom_id": "atomId"}


class ExhibitionCatalogueCard(BaseModel):
    card_id: Optional[str] = Field(
        default=None,
        alias="cardId",
        description="Identifier that links the catalogue section to a slide",
    )
    molecule_id: Optional[str] = Field(
        default=None,
        alias="moleculeId",
        description="Identifier of the originating molecule, when available",
    )
    molecule_title: Optional[str] = Field(
        default=None,
        alias="moleculeTitle",
        description="Human readable title for the originating atom or molecule",
    )
    atoms: List[ExhibitionCatalogueComponent] = Field(
        default_factory=list,
        description="Components that can be dragged onto exhibition slides",
    )

    class Config:
        allow_population_by_field_name = True
        fields = {
            "card_id": "cardId",
            "molecule_id": "moleculeId",
            "molecule_title": "moleculeTitle",
        }


class ExhibitionCatalogueOut(BaseModel):
    client_name: str = Field(..., min_length=1)
    app_name: str = Field(..., min_length=1)
    project_name: str = Field(..., min_length=1)
    cards: List[ExhibitionCatalogueCard] = Field(default_factory=list)
