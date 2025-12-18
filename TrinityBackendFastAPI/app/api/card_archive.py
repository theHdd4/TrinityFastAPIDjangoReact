from fastapi import APIRouter, Depends, HTTPException
from motor.motor_asyncio import AsyncIOMotorCollection
from datetime import datetime

from app.features.text_box.deps import get_deleted_cards

router = APIRouter()

@router.post("/cards/archive", status_code=201)
async def archive_card(card: dict, collection: AsyncIOMotorCollection = Depends(get_deleted_cards)):
    doc = card.copy()
    doc["archivedAt"] = datetime.utcnow()
    await collection.insert_one(doc)
    return {"archived": True}

@router.get("/cards/archive/{card_id}")
async def get_archived_card(card_id: str, collection: AsyncIOMotorCollection = Depends(get_deleted_cards)):
    card = await collection.find_one({"id": card_id})
    if not card:
        raise HTTPException(status_code=404, detail="Not found")
    card["_id"] = str(card["_id"])
    return card
