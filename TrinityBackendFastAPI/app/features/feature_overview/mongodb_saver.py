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
    print(f"📦 Stored in {results_collection.name}: {document}")



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
    print(f"📦 Stored in {results_collection.name}: {document}")




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
    """Fetch identifiers from column classifier config instead of dimensions.
    
    Extracts client/app/project from file_key and fetches identifiers from
    the column classifier MongoDB config, similar to dimension_mapping endpoint.
    """
    # Extract client/app/project from file_key (object_name path)
    # file_key format: "client/app/project/file.csv" or "client/app/project/file.arrow"
    parts = file_key.split("/", 3)
    client = parts[0] if len(parts) > 0 else ""
    app = parts[1] if len(parts) > 1 else ""
    project = parts[2] if len(parts) > 2 else ""
    
    # Try to fetch identifiers from column classifier config
    try:
        from app.features.column_classifier.database import get_classifier_config_from_mongo
        mongo_cfg = get_classifier_config_from_mongo(
            client,
            app,
            project,
            file_key if len(parts) > 3 else None,
        )
        
        if mongo_cfg:
            identifiers = mongo_cfg.get("identifiers", [])
            if isinstance(identifiers, list) and len(identifiers) > 0:
                # Return in the same format as before: {"identifiers": [col1, col2, ...]}
                return {"identifiers": identifiers}
    except Exception as exc:
        print(f"⚠️ fetch_dimensions_dict: Failed to fetch from classifier config: {exc}")
    
    # Fallback to legacy dimension-based approach if classifier config not found
    document = await collection.find_one({
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
