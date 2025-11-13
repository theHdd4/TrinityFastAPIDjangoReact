from __future__ import annotations

from uuid import uuid4

from fastapi import APIRouter, HTTPException

from .models import LaboratoryAtomResponse, LaboratoryCardRequest, LaboratoryCardResponse

router = APIRouter()


@router.post("/cards", response_model=LaboratoryCardResponse)
async def create_laboratory_card(payload: LaboratoryCardRequest) -> LaboratoryCardResponse:
    """Create a laboratory card scaffold for the frontend workspace."""

    card_id = f"card-{uuid4().hex}"
    atoms = []
    
    # Create atom only if atomId is provided
    if payload.atom_id and payload.atom_id.strip():
        atom_id = payload.atom_id.strip()
        atom_instance_id = f"{atom_id}-{uuid4().hex}"

        atom_response = LaboratoryAtomResponse(
            id=atom_instance_id,
            atomId=atom_id,
            source=payload.source,
            llm=payload.llm,
            settings=payload.settings,
        )
        atoms = [atom_response]

    return LaboratoryCardResponse(
        id=card_id,
        atoms=atoms,  # Empty list if no atomId provided
        molecule_id=payload.molecule_id,
        molecule_title=None,
    )
