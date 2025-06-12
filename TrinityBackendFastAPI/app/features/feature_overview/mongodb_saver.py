import datetime
import pandas as pd

def serialize_for_mongo(obj):
    if isinstance(obj, pd.DataFrame):
        return obj.to_dict(orient="records")
    elif isinstance(obj, dict):
        return {k: serialize_for_mongo(v) for k, v in obj.items()}
    return obj

async def save_feature_overview_results(output_store: dict,results_collection,validator_atom_id: str,
    file_key: str):
    document = {
        "timestamp": datetime.datetime.utcnow(),
        "validator_atom_id": validator_atom_id,
        "file_key": file_key,
        "output_result": serialize_for_mongo(output_store.get("result", {})),
    }

    detailed_summary = output_store.get("result", {}).get("detailed_summary", [])
    if isinstance(detailed_summary, list):
        # for summary in detailed_summary:
        #     if isinstance(summary, dict) and "DataFrame" in summary:
        #         summary.pop("DataFrame", None)

        for summary in detailed_summary:
            if isinstance(summary.get("Numeric Summary"), pd.DataFrame):
                summary["Numeric Summary"] = summary["Numeric Summary"].to_dict(orient="index")

        document["output_result"]["detailed_summary"] = detailed_summary

    await results_collection.insert_one(document)



async def save_feature_overview_unique_results(unique_count: dict, results_collection,validator_atom_id: str,
    file_key: str):
    document = {
        "timestamp": datetime.datetime.utcnow(),
        "validator_atom_id": validator_atom_id,
        "file_key": file_key,
        # "output_result": serialize_for_mongo(output_store.get("result", {})),
        "unique_result": {
            "object_summary": serialize_for_mongo(
                unique_count.get("unique_result", {}).get("object_summary", {})
            )
        }
    }

    await results_collection.insert_one(document)




# utils/mongo_utils.py

from fastapi import HTTPException
from motor.motor_asyncio import AsyncIOMotorCollection
from typing import Dict

async def fetch_dimensions_dict(
    # _id:str,
    validator_atom_id: str,
    file_key: str,
    collection: AsyncIOMotorCollection
) -> Dict[str, list]:
    document = await collection.find_one({
        # "id":_id,
        "validator_atom_id": validator_atom_id,
        "file_key": file_key
    })

    if not document:
        raise HTTPException(status_code=404, detail="Dimension document not found")

    result = {}
    for dim in document.get("dimensions", []):
        dim_id = dim.get("dimension_id")
        result[dim_id] = dim.get("assigned_identifiers", [])
    return result
