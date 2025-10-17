from __future__ import annotations

from typing import Any, List, Literal, Optional

from pydantic import BaseModel, Field


class LaboratoryCardRequest(BaseModel):
    """Schema describing the payload for creating a laboratory card."""

    atom_id: str = Field(..., alias="atomId", description="Identifier of the atom to render inside the card")
    molecule_id: Optional[str] = Field(
        default=None,
        alias="moleculeId",
        description="Optional molecule identifier associated with the card",
    )
    source: Literal["manual", "ai"] = Field(
        default="manual",
        description="Origin of the card request so the UI can annotate provenance.",
    )
    llm: Optional[str] = Field(
        default=None,
        description="Optional name of the LLM responsible for generating the card contents.",
    )
    settings: Optional[Any] = Field(
        default=None,
        description="Optional settings object to initialize the atom with.",
    )

    class Config:
        allow_population_by_field_name = True


class LaboratoryAtomResponse(BaseModel):
    """Atom metadata returned as part of the laboratory card response."""

    id: str = Field(..., description="Unique identifier for this atom instance")
    atom_id: str = Field(..., alias="atomId", description="Atom identifier (e.g. 'feature-overview')")
    source: Literal["manual", "ai"] = Field(
        default="manual",
        description="Indicates how the atom was added to the card.",
    )
    llm: Optional[str] = Field(
        default=None,
        description="Optional LLM attribution that the frontend can surface.",
    )
    settings: Optional[Any] = Field(
        default=None,
        description="Settings payload to bootstrap the atom in the UI.",
    )

    class Config:
        allow_population_by_field_name = True


class LaboratoryCardResponse(BaseModel):
    """Response returned after creating a laboratory card."""

    id: str = Field(..., description="Unique identifier for the newly created card")
    atoms: List[LaboratoryAtomResponse] = Field(..., description="List of atoms contained in the card")
    is_exhibited: bool = Field(
        default=False,
        alias="isExhibited",
        description="Flag denoting whether the card should appear in exhibition mode.",
    )
    molecule_id: Optional[str] = Field(
        default=None,
        alias="moleculeId",
        description="Optional molecule identifier for grouping cards together.",
    )
    molecule_title: Optional[str] = Field(
        default=None,
        alias="moleculeTitle",
        description="Human readable molecule title when available.",
    )

    class Config:
        allow_population_by_field_name = True
