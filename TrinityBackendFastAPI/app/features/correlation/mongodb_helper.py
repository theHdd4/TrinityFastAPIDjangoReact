"""
MongoDB helper functions for correlation feature
Following the pattern from feature_overview
"""

from fastapi import HTTPException
from motor.motor_asyncio import AsyncIOMotorCollection
from typing import Dict, List
import datetime


async def fetch_correlation_columns(
    validator_atom_id: str,
    file_key: str,
    collection: AsyncIOMotorCollection
) -> Dict[str, List[str]]:
    """
    Fetch column classifications for correlation analysis
    Similar to fetch_dimensions_dict in feature_overview
    """
    document = await collection.find_one({
        "validator_atom_id": validator_atom_id,
        "file_key": file_key
    })

    if not document:
        raise HTTPException(
            status_code=404, 
            detail=f"Column configuration not found for validator {validator_atom_id}"
        )

    # Extract column classifications
    final_classification = document.get("final_classification", {})
    
    return {
        "identifiers": final_classification.get("identifiers", []),
        "measures": final_classification.get("measures", []),
        "unclassified": final_classification.get("unclassified", [])
    }


async def save_correlation_results(
    correlation_data: dict,
    results_collection: AsyncIOMotorCollection,
    validator_atom_id: str,
    file_key: str
) -> str:
    """
    Save correlation analysis results to MongoDB
    Returns the inserted document ID
    """
    document = {
        "validator_atom_id": validator_atom_id,
        "file_key": file_key,
        "correlation_results": correlation_data,
        "timestamp": datetime.datetime.utcnow(),
        "status": "completed"
    }
    
    result = await results_collection.insert_one(document)
    print(f"📦 Stored correlation results in {results_collection.name}: {document}")
    
    return str(result.inserted_id)


async def get_correlation_history(
    validator_atom_id: str,
    file_key: str,
    collection: AsyncIOMotorCollection,
    limit: int = 10
) -> List[dict]:
    """
    Get historical correlation results for a validator and file
    """
    cursor = collection.find({
        "validator_atom_id": validator_atom_id,
        "file_key": file_key
    }).sort("timestamp", -1).limit(limit)
    
    results = []
    async for document in cursor:
        # Convert ObjectId to string for JSON serialization
        document["_id"] = str(document["_id"])
        results.append(document)
    
    return results


async def store_column_mapping(
    validator_atom_id: str,
    file_key: str,
    column_mapping: dict,
    collection: AsyncIOMotorCollection
) -> str:
    """
    Store column mapping configuration for future use
    """
    document = {
        "validator_atom_id": validator_atom_id,
        "file_key": file_key,
        "column_mapping": column_mapping,
        "created_at": datetime.datetime.utcnow(),
        "updated_at": datetime.datetime.utcnow()
    }
    
    # Upsert - update if exists, insert if not
    result = await collection.replace_one(
        {
            "validator_atom_id": validator_atom_id,
            "file_key": file_key
        },
        document,
        upsert=True
    )
    
    print(f"📝 Stored column mapping for {validator_atom_id}/{file_key}")
    return str(result.upserted_id) if result.upserted_id else "updated"
