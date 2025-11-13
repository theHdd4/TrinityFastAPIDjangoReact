from __future__ import annotations

from datetime import datetime
from uuid import uuid4

from fastapi import APIRouter, HTTPException, Query

from .models import (
    LaboratoryAtomResponse,
    LaboratoryCardRequest,
    LaboratoryCardResponse,
    LaboratoryVariableDefinition,
    LaboratoryVariableResponse,
    LaboratoryVariableListResponse,
    LaboratoryVariableRecord,
)
from .mongodb_saver import save_variable_definition, get_config_variable_collection

router = APIRouter()


@router.post("/cards", response_model=LaboratoryCardResponse)
async def create_laboratory_card(payload: LaboratoryCardRequest) -> LaboratoryCardResponse:
    """Create a laboratory card scaffold for the frontend workspace."""

    atom_id = payload.atom_id.strip()
    if not atom_id:
        raise HTTPException(status_code=422, detail="atomId is required")

    card_id = f"card-{uuid4().hex}"
    atom_instance_id = f"{atom_id}-{uuid4().hex}"

    atom_response = LaboratoryAtomResponse(
        id=atom_instance_id,
        atomId=atom_id,  # Use alias field name for Pydantic v2 compatibility
        source=payload.source,
        llm=payload.llm,
        settings=payload.settings,
    )

    return LaboratoryCardResponse(
        id=card_id,
        atoms=[atom_response],
        molecule_id=payload.molecule_id,
        molecule_title=None,
    )


@router.post("/variables", response_model=LaboratoryVariableResponse)
async def upsert_variable_definition(payload: LaboratoryVariableDefinition) -> LaboratoryVariableResponse:
    """Persist a card variable definition to MongoDB."""

    variable_name = payload.variable_name.strip()
    if not variable_name:
        raise HTTPException(status_code=422, detail="variableName is required")

    client_id = (payload.client_id or "").strip()
    app_id = (payload.app_id or "").strip()
    project_id = (payload.project_id or "").strip()

    if not client_id or not app_id or not project_id:
        raise HTTPException(status_code=422, detail="clientId, appId and projectId are required")

    variable_id = payload.id or f"variable-{uuid4().hex}"
    now = datetime.utcnow()

    document = {
        "_id": variable_id,
        "variable_name": variable_name,
        "formula": payload.formula,
        "value": payload.value,
        "description": payload.description,
        "usage_summary": payload.usage_summary,
        "card_id": payload.card_id,
        "atom_id": payload.atom_id,
        "origin_card_id": payload.origin_card_id,
        "origin_variable_id": payload.origin_variable_id,
        "client_id": client_id,
        "app_id": app_id,
        "project_id": project_id,
        "project_name": payload.project_name,
        "created_at": payload.created_at or now,
        "updated_at": now,
    }

    save_result = await save_variable_definition(document)
    if save_result.get("status") == "conflict":
        raise HTTPException(status_code=409, detail=save_result.get("error", "Variable name already exists"))

    if save_result.get("status") != "success":
        raise HTTPException(status_code=500, detail=save_result.get("error", "Failed to persist variable definition"))

    return LaboratoryVariableResponse(
        id=variable_id,
        variableName=variable_name,
        formula=payload.formula,
        value=payload.value,
        description=payload.description,
        usageSummary=payload.usage_summary,
        cardId=payload.card_id,
        atomId=payload.atom_id,
        originCardId=payload.origin_card_id,
        originVariableId=payload.origin_variable_id,
        clientId=client_id,
        appId=app_id,
        projectId=project_id,
        projectName=payload.project_name,
        createdAt=document["created_at"],
        updatedAt=now,
        status=save_result["status"],
        operation=save_result["operation"],
    )


@router.get("/variables", response_model=LaboratoryVariableListResponse)
async def list_variable_definitions(
    client_id: str = Query(..., alias="clientId"),
    app_id: str = Query(..., alias="appId"),
    project_id: str = Query(..., alias="projectId"),
) -> LaboratoryVariableListResponse:
    """Fetch variable definitions scoped to a specific client/app/project."""

    collection = get_config_variable_collection()

    cursor = collection.find(
        {
            "client_id": client_id,
            "app_id": app_id,
            "project_id": project_id,
        }
    ).sort("updated_at", -1)

    records = []
    async for document in cursor:
        records.append(
            LaboratoryVariableRecord(
                id=str(document.get("_id")),
                variableName=document.get("variable_name", ""),
                formula=document.get("formula"),
                value=document.get("value"),
                description=document.get("description"),
                usageSummary=document.get("usage_summary"),
                cardId=document.get("card_id"),
                atomId=document.get("atom_id"),
                originCardId=document.get("origin_card_id"),
                originVariableId=document.get("origin_variable_id"),
                clientId=document.get("client_id"),
                appId=document.get("app_id"),
                projectId=document.get("project_id"),
                projectName=document.get("project_name"),
                createdAt=document.get("created_at"),
                updatedAt=document.get("updated_at"),
            )
        )

    return LaboratoryVariableListResponse(variables=records)
