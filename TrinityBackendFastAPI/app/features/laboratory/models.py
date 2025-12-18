from __future__ import annotations

from datetime import datetime
from typing import Any, Dict, List, Literal, Optional

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
    # Old calculation logic - commented out
    # formula: Optional[str] = Field(default=None, description="Optional formula associated with the variable")
    # value: Optional[str] = Field(default=None, description="Default value for the variable")
    description: Optional[str] = Field(default=None, description="Description explaining the variable")
    usage_summary: Optional[str] = Field(
        default=None,
        alias="usageSummary",
        description="Summary of how this variable is used across cards/atoms",
    )
    # Card-related fields - commented out
    # card_id: Optional[str] = Field(default=None, alias="cardId", description="Identifier of the card that owns the variable")
    # atom_id: Optional[str] = Field(default=None, alias="atomId", description="Identifier of the atom linked to the variable")
    client_id: Optional[str] = Field(default=None, alias="clientId", description="Identifier of the client that owns the project")
    app_id: Optional[str] = Field(default=None, alias="appId", description="Identifier of the app/workspace using the variable")
    project_id: Optional[str] = Field(default=None, alias="projectId", description="Identifier of the project the variable belongs to")
    # Card-related origin fields - commented out
    # origin_card_id: Optional[str] = Field(
    #     default=None,
    #     alias="originCardId",
    #     description="Identifier of the card where this variable originated",
    # )
    # origin_variable_id: Optional[str] = Field(
    #     default=None,
    #     alias="originVariableId",
    #     description="Identifier of the original variable this was derived from",
    # )
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
    # Old calculation logic - commented out
    # formula: Optional[str] = Field(default=None, alias="formula")
    # value: Optional[str] = Field(default=None, alias="value")
    description: Optional[str] = Field(default=None, alias="description")
    usage_summary: Optional[str] = Field(default=None, alias="usageSummary")
    # Card-related fields - commented out
    # card_id: Optional[str] = Field(default=None, alias="cardId")
    # atom_id: Optional[str] = Field(default=None, alias="atomId")
    client_id: Optional[str] = Field(default=None, alias="clientId")
    app_id: Optional[str] = Field(default=None, alias="appId")
    project_id: Optional[str] = Field(default=None, alias="projectId")
    # Card-related origin fields - commented out
    # origin_card_id: Optional[str] = Field(default=None, alias="originCardId")
    # origin_variable_id: Optional[str] = Field(default=None, alias="originVariableId")
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
    # Old calculation logic - commented out
    # formula: Optional[str] = Field(default=None, alias="formula")
    value: Optional[str] = Field(default=None, alias="value")
    description: Optional[str] = Field(default=None, alias="description")
    usage_summary: Optional[str] = Field(default=None, alias="usageSummary")
    metadata: Optional[Dict[str, Any]] = Field(default=None, alias="metadata")
    # Card-related fields - commented out
    # card_id: Optional[str] = Field(default=None, alias="cardId")
    # atom_id: Optional[str] = Field(default=None, alias="atomId")
    # origin_card_id: Optional[str] = Field(default=None, alias="originCardId")
    # origin_variable_id: Optional[str] = Field(default=None, alias="originVariableId")
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


class VariableOperation(BaseModel):
    """Schema for a single variable operation."""

    id: str = Field(..., description="Unique identifier for the operation")
    numericalColumn: str = Field(..., alias="numericalColumn", description="Numerical column to operate on")
    method: str = Field(..., description="Operation method: sum, mean, median, max, min, count, nunique, rank_pct, add, subtract, multiply, divide")
    secondColumn: Optional[str] = Field(default=None, alias="secondColumn", description="Second column for arithmetic operations (add, subtract, multiply, divide)")
    secondValue: Optional[float] = Field(default=None, alias="secondValue", description="Numeric value for arithmetic operations when not using a column")
    customName: Optional[str] = Field(default=None, alias="customName", description="Custom variable name (optional)")

    model_config = ConfigDict(populate_by_name=True)


class VariableComputeRequest(BaseModel):
    """Schema for variable computation request."""

    dataSource: Optional[str] = Field(default=None, alias="dataSource", description="Object name/path to the data file (optional for variable-only operations)")
    computeMode: Literal["whole-dataframe", "within-group"] = Field(..., alias="computeMode", description="Compute mode: whole-dataframe or within-group")
    identifiers: Optional[List[str]] = Field(default=None, description="List of identifier columns for within-group mode")
    operations: List[VariableOperation] = Field(..., description="List of operations to perform")
    client_name: Optional[str] = Field(default=None, alias="clientName", description="Client name")
    app_name: Optional[str] = Field(default=None, alias="appName", description="App name")
    project_name: Optional[str] = Field(default=None, alias="projectName", description="Project name")
    confirmOverwrite: Optional[bool] = Field(default=False, alias="confirmOverwrite", description="Confirm overwriting existing variables")
    preview: Optional[bool] = Field(default=False, description="If True, compute values without saving to MongoDB")

    model_config = ConfigDict(populate_by_name=True)


class ComputedVariableValue(BaseModel):
    """Schema for a computed variable value (used in preview mode)."""
    
    name: str = Field(..., description="Variable name")
    value: str = Field(..., description="Computed value as string")
    operationDetails: Optional[dict] = Field(default=None, alias="operationDetails", description="Operation details for this variable")


class VariableComputeResponse(BaseModel):
    """Response from variable computation."""

    success: bool = Field(..., description="Whether the computation was successful")
    new_columns: List[str] = Field(default_factory=list, alias="newColumns", description="List of newly created variable names")
    error: Optional[str] = Field(default=None, description="Error message if computation failed")
    existingVariables: Optional[List[str]] = Field(default=None, alias="existingVariables", description="List of existing variable names that would be overwritten")
    computedValues: Optional[List[ComputedVariableValue]] = Field(default=None, alias="computedValues", description="Computed variable values (only returned in preview mode)")

    model_config = ConfigDict(populate_by_name=True)


class ConstantAssignment(BaseModel):
    """Schema for a constant assignment."""

    variableName: str = Field(..., alias="variableName", description="Name of the variable")
    value: str = Field(..., description="Constant value to assign")

    model_config = ConfigDict(populate_by_name=True)


class VariableAssignRequest(BaseModel):
    """Schema for constant variable assignment request."""

    assignments: List[ConstantAssignment] = Field(..., description="List of constant assignments")
    dataSource: str = Field(..., alias="dataSource", description="Object name/path to the data file")
    client_name: Optional[str] = Field(default=None, alias="clientName", description="Client name")
    app_name: Optional[str] = Field(default=None, alias="appName", description="App name")
    project_name: Optional[str] = Field(default=None, alias="projectName", description="Project name")
    confirmOverwrite: Optional[bool] = Field(default=False, alias="confirmOverwrite", description="Confirm overwriting existing variables")

    model_config = ConfigDict(populate_by_name=True)


class VariableAssignResponse(BaseModel):
    """Response from constant variable assignment."""

    success: bool = Field(..., description="Whether the assignment was successful")
    new_variables: List[str] = Field(default_factory=list, alias="newVariables", description="List of newly created variable names")
    error: Optional[str] = Field(default=None, description="Error message if assignment failed")
    existingVariables: Optional[List[str]] = Field(default=None, alias="existingVariables", description="List of existing variable names that would be overwritten")

    model_config = ConfigDict(populate_by_name=True)
