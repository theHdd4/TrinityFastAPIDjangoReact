from __future__ import annotations

from typing import Any, List, Literal, Optional

from pydantic import AliasChoices, BaseModel, ConfigDict, Field


class LaboratoryCardRequest(BaseModel):
    """Schema describing the payload for creating a laboratory card."""

    model_config = ConfigDict(populate_by_name=True)

    atom_id: str = Field(
        ...,
        description="Identifier of the atom to render inside the card",
        serialization_alias="atomId",
        validation_alias=AliasChoices("atomId", "atom_id"),
    )
    molecule_id: Optional[str] = Field(
        default=None,
        description="Optional molecule identifier associated with the card",
        serialization_alias="moleculeId",
        validation_alias=AliasChoices("moleculeId", "molecule_id"),
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

class LaboratoryAtomResponse(BaseModel):
    """Atom metadata returned as part of the laboratory card response."""

    model_config = ConfigDict(populate_by_name=True)

    id: str = Field(..., description="Unique identifier for this atom instance")
    atom_id: str = Field(
        ...,
        description="Atom identifier (e.g. 'feature-overview')",
        serialization_alias="atomId",
        validation_alias=AliasChoices("atomId", "atom_id"),
    )
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

class LaboratoryCardResponse(BaseModel):
    """Response returned after creating a laboratory card."""

    model_config = ConfigDict(populate_by_name=True)

    id: str = Field(..., description="Unique identifier for the newly created card")
    atoms: List[LaboratoryAtomResponse] = Field(..., description="List of atoms contained in the card")
    is_exhibited: bool = Field(
        default=False,
        description="Flag denoting whether the card should appear in exhibition mode.",
        serialization_alias="isExhibited",
        validation_alias=AliasChoices("isExhibited", "is_exhibited"),
    )
    molecule_id: Optional[str] = Field(
        default=None,
        description="Optional molecule identifier for grouping cards together.",
        serialization_alias="moleculeId",
        validation_alias=AliasChoices("moleculeId", "molecule_id"),
    )
    molecule_title: Optional[str] = Field(
        default=None,
        description="Human readable molecule title when available.",
        serialization_alias="moleculeTitle",
        validation_alias=AliasChoices("moleculeTitle", "molecule_title"),
    )


LaboratoryCardRequest.model_rebuild(_types_namespace=globals())
LaboratoryAtomResponse.model_rebuild(_types_namespace=globals())
LaboratoryCardResponse.model_rebuild(_types_namespace=globals())
