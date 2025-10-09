from __future__ import annotations

from typing import Any, Dict, List, Optional

from fastapi import APIRouter, Depends, HTTPException, Query, status
from motor.motor_asyncio import AsyncIOMotorCollection

from .deps import get_exhibition_catalogue_collection
from .schemas import (
    ExhibitionCatalogueCard,
    ExhibitionCatalogueComponent,
    ExhibitionCatalogueOut,
    ExhibitionConfigurationIn,
    ExhibitionConfigurationOut,
)
from .service import ExhibitionStorage

router = APIRouter(prefix="/exhibition", tags=["Exhibition"])
storage = ExhibitionStorage()


FALLBACK_COMPONENT_COLOR = "bg-gray-400"


def _normalise_string(value: Any) -> Optional[str]:
    if value is None:
        return None

    if isinstance(value, str):
        candidate = value.strip()
    else:
        candidate = str(value).strip()

    return candidate or None


def _normalise_component(payload: Any) -> Optional[ExhibitionCatalogueComponent]:
    if not isinstance(payload, dict):
        return None

    identifier = (
        _normalise_string(payload.get("id"))
        or _normalise_string(payload.get("component_id"))
        or _normalise_string(payload.get("componentId"))
        or _normalise_string(payload.get("atom_id"))
        or _normalise_string(payload.get("atomId"))
    )

    atom_identifier = (
        _normalise_string(payload.get("atom_id"))
        or _normalise_string(payload.get("atomId"))
        or identifier
    )

    if identifier is None:
        identifier = (
            atom_identifier
            or _normalise_string(payload.get("component_name"))
            or _normalise_string(payload.get("componentName"))
            or _normalise_string(payload.get("title"))
        )

    if identifier is None:
        return None

    if atom_identifier is None:
        atom_identifier = identifier

    title = (
        _normalise_string(payload.get("title"))
        or _normalise_string(payload.get("component_title"))
        or _normalise_string(payload.get("componentTitle"))
        or _normalise_string(payload.get("component_name"))
        or _normalise_string(payload.get("componentName"))
        or _normalise_string(payload.get("name"))
        or identifier
    )

    category = (
        _normalise_string(payload.get("category"))
        or _normalise_string(payload.get("component_category"))
        or _normalise_string(payload.get("componentCategory"))
    )

    colour = (
        _normalise_string(payload.get("color"))
        or _normalise_string(payload.get("colour"))
        or _normalise_string(payload.get("componentColor"))
        or FALLBACK_COMPONENT_COLOR
    )

    metadata_raw = payload.get("metadata") or payload.get("details")
    metadata = metadata_raw if isinstance(metadata_raw, dict) else None

    return ExhibitionCatalogueComponent(
        id=identifier,
        atom_id=atom_identifier,
        title=title,
        category=category,
        color=colour,
        metadata=metadata,
    )


def _extract_component_list(payload: Dict[str, Any]) -> List[Any]:
    if "atoms" in payload and isinstance(payload["atoms"], list):
        return payload["atoms"]

    for key in ("components", "catalogueAtoms", "items", "entries"):
        value = payload.get(key)
        if isinstance(value, list):
            return value

    return []


def _normalise_card(payload: Any) -> Optional[ExhibitionCatalogueCard]:
    if not isinstance(payload, dict):
        return None

    components = [_normalise_component(entry) for entry in _extract_component_list(payload)]
    atoms = [component for component in components if component is not None]

    candidate_identifiers = [
        payload.get("card_id"),
        payload.get("cardId"),
        payload.get("id"),
        payload.get("molecule_id"),
        payload.get("moleculeId"),
        payload.get("moleculeTitle"),
        payload.get("molecule_title"),
    ]

    card_identifier: Optional[str] = None
    for candidate in candidate_identifiers:
        candidate_string = _normalise_string(candidate)
        if candidate_string:
            card_identifier = candidate_string
            break

    molecule_identifier = (
        _normalise_string(payload.get("molecule_id"))
        or _normalise_string(payload.get("moleculeId"))
    )
    molecule_title = (
        _normalise_string(payload.get("molecule_title"))
        or _normalise_string(payload.get("moleculeTitle"))
        or _normalise_string(payload.get("atom_title"))
        or _normalise_string(payload.get("atomTitle"))
        or _normalise_string(payload.get("title"))
    )

    if card_identifier is None:
        card_identifier = molecule_identifier or molecule_title

    if card_identifier is None:
        return None

    return ExhibitionCatalogueCard(
        card_id=card_identifier,
        molecule_id=molecule_identifier,
        molecule_title=molecule_title,
        atoms=atoms,
    )

@router.get("/configuration", response_model=ExhibitionConfigurationOut)
async def get_configuration(
    client_name: str = Query(..., min_length=1),
    app_name: str = Query(..., min_length=1),
    project_name: str = Query(..., min_length=1),
) -> ExhibitionConfigurationOut:
    record = await storage.get_configuration(client_name, app_name, project_name)
    if not record:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Exhibition configuration not found")

    return ExhibitionConfigurationOut(**record)


@router.post("/configuration", status_code=status.HTTP_200_OK)
async def save_configuration(
    config: ExhibitionConfigurationIn,
) -> Dict[str, Any]:
    payload = config.dict()
    payload["client_name"] = payload["client_name"].strip()
    payload["app_name"] = payload["app_name"].strip()
    payload["project_name"] = payload["project_name"].strip()
    payload["cards"] = payload.get("cards") or []
    payload["feature_overview"] = payload.get("feature_overview") or []

    if not payload["client_name"] or not payload["app_name"] or not payload["project_name"]:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="client_name, app_name, and project_name are required",
        )

    saved = await storage.save_configuration(payload)

    return {"status": "ok", "updated_at": saved.get("updated_at")}


@router.get("/catalogue", response_model=ExhibitionCatalogueOut)
async def get_catalogue(
    client_name: str = Query(..., min_length=1),
    app_name: str = Query(..., min_length=1),
    project_name: str = Query(..., min_length=1),
    collection: AsyncIOMotorCollection = Depends(get_exhibition_catalogue_collection),
) -> ExhibitionCatalogueOut:
    client = _normalise_string(client_name) or ""
    app = _normalise_string(app_name) or ""
    project = _normalise_string(project_name) or ""

    if not client or not app or not project:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="client_name, app_name, and project_name are required",
        )

    document = await collection.find_one(
        {
            "client_name": client,
            "app_name": app,
            "project_name": project,
        }
    )

    if not document:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Exhibition catalogue not found",
        )

    raw_cards = document.get("cards")
    if not isinstance(raw_cards, list):
        fallback_keys = ("catalogue", "entries", "items")
        for key in fallback_keys:
            potential = document.get(key)
            if isinstance(potential, list):
                raw_cards = potential
                break
        else:
            raw_cards = []

    cards = []
    for entry in raw_cards:
        normalised = _normalise_card(entry)
        if normalised is not None:
            cards.append(normalised)

    return ExhibitionCatalogueOut(
        client_name=client,
        app_name=app,
        project_name=project,
        cards=cards,
    )
