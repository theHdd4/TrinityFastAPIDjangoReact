from __future__ import annotations

from datetime import datetime
from typing import Any, List, Literal, Optional

from pydantic import BaseModel, ConfigDict, Field


class LaboratoryCardRequest(BaseModel):
    """Schema describing the payload for creating a laboratory card."""

    atom_id: Optional[str] = Field(None, alias="atomId", description="Optional identifier of the atom to render inside the card. Can be None for empty cards.")
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

    model_config = ConfigDict(populate_by_name=True)


class LaboratoryAtomResponse(BaseModel):
    """Atom metadata returned as part of the laboratory card response."""

    id: str = Field(..., description="Unique identifier for this atom instance")
    atom_id: str = Field(..., alias="atomId", description="Atom identifier (e.g. 'feature-overview')")
    title: Optional[str] = Field(
        default=None,
        description="Human readable title for the atom.",
    )
    category: Optional[str] = Field(
        default="Atom",
        description="Category of the atom (e.g. 'Atom', 'Molecule').",
    )
    color: Optional[str] = Field(
        default="bg-gray-400",
        description="CSS color class for the atom display.",
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
    molecule_id: Optional[str] = Field(
        default=None,
        alias="moleculeId",
        description="Optional molecule identifier for grouping atoms together.",
    )
    molecule_title: Optional[str] = Field(
        default=None,
        alias="moleculeTitle",
        description="Human readable molecule title when available.",
    )

    model_config = ConfigDict(populate_by_name=True)


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

    model_config = ConfigDict(populate_by_name=True)


class LaboratoryVariableDefinition(BaseModel):
    """Schema describing a card variable definition persisted to MongoDB."""

    id: Optional[str] = Field(default=None, description="Unique identifier for the variable", alias="id")
    variable_name: str = Field(..., alias="variableName", description="Human readable name of the variable")
    formula: Optional[str] = Field(default=None, description="Optional formula associated with the variable")
    value: Optional[str] = Field(default=None, description="Default value for the variable")
    description: Optional[str] = Field(default=None, description="Description explaining the variable")
    usage_summary: Optional[str] = Field(
        default=None,
        alias="usageSummary",
        description="Summary of how this variable is used across cards/atoms",
    )
    card_id: Optional[str] = Field(default=None, alias="cardId", description="Identifier of the card that owns the variable")
    atom_id: Optional[str] = Field(default=None, alias="atomId", description="Identifier of the atom linked to the variable")
    client_id: Optional[str] = Field(default=None, alias="clientId", description="Identifier of the client that owns the project")
    app_id: Optional[str] = Field(default=None, alias="appId", description="Identifier of the app/workspace using the variable")
    project_id: Optional[str] = Field(default=None, alias="projectId", description="Identifier of the project the variable belongs to")
    origin_card_id: Optional[str] = Field(
        default=None,
        alias="originCardId",
        description="Identifier of the card where this variable originated",
    )
    origin_variable_id: Optional[str] = Field(
        default=None,
        alias="originVariableId",
        description="Identifier of the original variable this was derived from",
    )
    project_name: Optional[str] = Field(
        default=None,
        alias="projectName",
        description="Optional project name context for the variable definition",
    )
    created_at: Optional[datetime] = Field(
        default=None,
        alias="createdAt",
        description="Timestamp when the variable was created (auto-populated).",
    )

    model_config = ConfigDict(populate_by_name=True)


class LaboratoryVariableResponse(BaseModel):
    """Response returned after persisting a variable definition."""

    id: str = Field(..., alias="id", description="Identifier of the persisted variable")
    variable_name: str = Field(..., alias="variableName")
    formula: Optional[str] = Field(default=None, alias="formula")
    value: Optional[str] = Field(default=None, alias="value")
    description: Optional[str] = Field(default=None, alias="description")
    usage_summary: Optional[str] = Field(default=None, alias="usageSummary")
    card_id: Optional[str] = Field(default=None, alias="cardId")
    atom_id: Optional[str] = Field(default=None, alias="atomId")
    client_id: Optional[str] = Field(default=None, alias="clientId")
    app_id: Optional[str] = Field(default=None, alias="appId")
    project_id: Optional[str] = Field(default=None, alias="projectId")
    origin_card_id: Optional[str] = Field(default=None, alias="originCardId")
    origin_variable_id: Optional[str] = Field(default=None, alias="originVariableId")
    project_name: Optional[str] = Field(default=None, alias="projectName")
    created_at: Optional[datetime] = Field(default=None, alias="createdAt")
    updated_at: datetime = Field(..., alias="updatedAt")
    status: str = Field(..., alias="status")
    operation: Literal["inserted", "updated"] = Field(..., alias="operation")

    model_config = ConfigDict(populate_by_name=True)


class LaboratoryVariableRecord(BaseModel):
    """Variable definition document fetched from MongoDB."""

    id: str = Field(..., alias="id")
    variable_name: str = Field(..., alias="variableName")
    formula: Optional[str] = Field(default=None, alias="formula")
    value: Optional[str] = Field(default=None, alias="value")
    description: Optional[str] = Field(default=None, alias="description")
    usage_summary: Optional[str] = Field(default=None, alias="usageSummary")
    card_id: Optional[str] = Field(default=None, alias="cardId")
    atom_id: Optional[str] = Field(default=None, alias="atomId")
    origin_card_id: Optional[str] = Field(default=None, alias="originCardId")
    origin_variable_id: Optional[str] = Field(default=None, alias="originVariableId")
    client_id: Optional[str] = Field(default=None, alias="clientId")
    app_id: Optional[str] = Field(default=None, alias="appId")
    project_id: Optional[str] = Field(default=None, alias="projectId")
    project_name: Optional[str] = Field(default=None, alias="projectName")
    created_at: Optional[datetime] = Field(default=None, alias="createdAt")
    updated_at: Optional[datetime] = Field(default=None, alias="updatedAt")

    model_config = ConfigDict(populate_by_name=True)


class LaboratoryVariableListResponse(BaseModel):
    """Collection wrapper for variable definition results."""

    variables: List[LaboratoryVariableRecord] = Field(default_factory=list)

    model_config = ConfigDict(populate_by_name=True)
