from __future__ import annotations

from uuid import uuid4

from fastapi import APIRouter, HTTPException

from .models import LaboratoryAtomResponse, LaboratoryCardRequest, LaboratoryCardResponse

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
