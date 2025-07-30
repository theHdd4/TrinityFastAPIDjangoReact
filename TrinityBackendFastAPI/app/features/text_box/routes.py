from fastapi import APIRouter, Depends, HTTPException
from motor.motor_asyncio import AsyncIOMotorCollection
from datetime import datetime, timezone
from .schemas import TextIn 
from .deps import get_texts  

router = APIRouter()

@router.post("/text", status_code=201)
async def create_text(  
    payload: TextIn,  
    texts: AsyncIOMotorCollection = Depends(get_texts) 
):
    doc = payload.model_dump()
    now = datetime.now(timezone.utc)
    doc["createdAt"] = doc["updatedAt"] = now
    try:
        result = await texts.insert_one(doc)
        print(f"📦 Stored in {texts.name}: {doc}")
        return {
            "_id": str(result.inserted_id),
            "message": "Submitted Successfully"
        }
    except Exception as e:
        print("MongoDB Insert Error:", e)
        raise HTTPException(status_code=400, detail=str(e))


@router.get("/text/{text_id}") 
async def get_text(text_id: str, texts: AsyncIOMotorCollection = Depends(get_texts)):  
    text = await texts.find_one({"textId": text_id, "status": {"$ne": "archived"}}) 
    if not text:
        raise HTTPException(status_code=404, detail="Not found")
    text["_id"] = str(text["_id"])
    return text

@router.put("/text/{text_id}") 
async def update_text(  
    text_id: str,  
    payload: TextIn,  
    texts: AsyncIOMotorCollection = Depends(get_texts) 
):
    doc = payload.model_dump(exclude_unset=True)
    doc["updatedAt"] = datetime.now(timezone.utc)
    result = await texts.update_one(
        {"textId": text_id, "status": {"$ne": "archived"}},
        {"$set": doc}
    )
    print(f"📦 Stored in {texts.name}: {doc}")
    if result.matched_count == 0:
        raise HTTPException(status_code=404, detail="Not found")

    return {"updated": True}

@router.delete("/text/{text_id}", status_code=200)
async def delete_text(
    text_id: str,
    texts: AsyncIOMotorCollection = Depends(get_texts)
):
    now = datetime.now(timezone.utc)
    result = await texts.update_one(
        {"textId": text_id, "status": {"$ne": "archived"}},
        {"$set": {"status": "archived", "updatedAt": now}}
    )
    print(f"📦 Stored in {texts.name}: {{'status': 'archived', 'updatedAt': now}}")
    if result.matched_count == 0:
        raise HTTPException(status_code=404, detail="Not found")
    return {"message": "Data deleted successfully"}

