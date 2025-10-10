from __future__ import annotations

from datetime import datetime
from typing import Any, Dict, List, Optional

from pydantic import BaseModel, Field


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
