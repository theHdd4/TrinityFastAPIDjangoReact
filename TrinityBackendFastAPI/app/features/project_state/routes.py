from __future__ import annotations

from datetime import datetime
from typing import Any, Dict, List, Optional

from fastapi import APIRouter, Depends, HTTPException, status
from motor.motor_asyncio import AsyncIOMotorCollection
from pydantic import BaseModel, Field

from app.features.build_model_feature_based.mongodb_saver import (
    save_atom_list_configuration,
    get_atom_list_configuration,
)
from app.features.exhibition.deps import get_exhibition_layout_collection
from app.features.exhibition.persistence import save_exhibition_list_configuration
from app.session_state import load_state, save_state

router = APIRouter()


class StateIn(BaseModel):
    client_id: str
    app_id: str
    project_id: str
    state: dict


project_state_router = APIRouter()


@project_state_router.post("/save", status_code=status.HTTP_201_CREATED)
async def save_project_state(payload: StateIn):
    try:
        await save_state(
            payload.client_id, payload.app_id, payload.project_id, payload.state
        )
    except Exception as exc:
        raise HTTPException(status_code=400, detail=str(exc))
    return {"status": "saved"}


@project_state_router.get("/{client_id}/{app_id}/{project_id}")
async def get_project_state(client_id: str, app_id: str, project_id: str):
    state = await load_state(client_id, app_id, project_id)
    return {"state": state}


class LaboratoryProjectStateIn(BaseModel):
    client_name: str = Field(..., min_length=1)
    app_name: str = Field(..., min_length=1)
    project_name: str = Field(..., min_length=1)
    cards: List[Dict[str, Any]] = Field(default_factory=list)
    mode: Optional[str] = Field(default=None)


laboratory_project_state_router = APIRouter()


@laboratory_project_state_router.post("/save", status_code=status.HTTP_200_OK)
async def save_laboratory_project_state(payload: LaboratoryProjectStateIn):
    client_name = payload.client_name.strip()
    app_name = payload.app_name.strip()
    project_name = payload.project_name.strip()

    if not client_name or not app_name or not project_name:
        raise HTTPException(status_code=400, detail="client_name, app_name, and project_name are required")

    config_payload = payload.model_dump()
    config_payload.setdefault("mode", payload.mode or "laboratory")

    persistence_result = await save_atom_list_configuration(
        client_name=client_name,
        app_name=app_name,
        project_name=project_name,
        atom_config_data=config_payload,
    )

    if persistence_result.get("status") != "success":
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=persistence_result.get("error", "Failed to persist laboratory configuration"),
        )

    timestamp = datetime.utcnow().isoformat()

    return {
        "status": "ok",
        "updated_at": timestamp,
        "documents_inserted": persistence_result.get("documents_inserted", 0),
        "collection": persistence_result.get("collection"),
    }


@laboratory_project_state_router.get("/get/{client_name}/{app_name}/{project_name}")
async def get_laboratory_project_state(
    client_name: str,
    app_name: str,
    project_name: str,
    mode: str = "laboratory"
):
    """Get laboratory project state from MongoDB atom_list_configuration collection"""
    try:
        client_name = client_name.strip()
        app_name = app_name.strip()
        project_name = project_name.strip()

        if not client_name or not app_name or not project_name:
            raise HTTPException(status_code=400, detail="client_name, app_name, and project_name are required")

        result = await get_atom_list_configuration(
            client_name=client_name,
            app_name=app_name,
            project_name=project_name,
            mode=mode
        )

        if result.get("status") != "success":
            raise HTTPException(
                status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
                detail=result.get("error", "Failed to retrieve laboratory configuration"),
            )

        timestamp = datetime.utcnow().isoformat()

        return {
            "status": "ok",
            "cards": result.get("cards", []),
            "workflow_molecules": result.get("workflow_molecules", []),
            "count": result.get("count", 0),
            "retrieved_at": timestamp,
            "collection": "atom_list_configuration",
        }

    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Internal server error: {str(e)}")


class ExhibitionProjectStateIn(LaboratoryProjectStateIn):
    slide_objects: Dict[str, Any] = Field(default_factory=dict)


exhibition_project_state_router = APIRouter()


@exhibition_project_state_router.post("/save", status_code=status.HTTP_200_OK)
async def save_exhibition_project_state(
    payload: ExhibitionProjectStateIn,
    collection: AsyncIOMotorCollection = Depends(get_exhibition_layout_collection),
):
    client_name = payload.client_name.strip()
    app_name = payload.app_name.strip()
    project_name = payload.project_name.strip()

    if not client_name or not app_name or not project_name:
        raise HTTPException(status_code=400, detail="client_name, app_name, and project_name are required")

    cards = payload.cards or []
    slide_objects = payload.slide_objects or {}

    persistence_result = await save_exhibition_list_configuration(
        client_name=client_name,
        app_name=app_name,
        project_name=project_name,
        exhibition_config_data={
            "mode": payload.mode or "exhibition",
            "cards": cards,
            "slide_objects": slide_objects,
        },
        collection=collection,
    )

    if persistence_result.get("status") != "success":
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=persistence_result.get("error", "Failed to persist exhibition configuration"),
        )

    timestamp = persistence_result.get("updated_at", datetime.utcnow())
    updated_at = timestamp.isoformat() if isinstance(timestamp, datetime) else str(timestamp)

    return {
        "status": "ok",
        "updated_at": updated_at,
        "documents_inserted": persistence_result.get("documents_written", 0),
        "collection": persistence_result.get("collection"),
    }


router.include_router(
    project_state_router,
    prefix="/project-state",
    tags=["Project State"],
)
router.include_router(
    laboratory_project_state_router,
    prefix="/laboratory-project-state",
    tags=["Laboratory Project State"],
)
router.include_router(
    exhibition_project_state_router,
    prefix="/exhibition-project-state",
    tags=["Exhibition Project State"],
)
