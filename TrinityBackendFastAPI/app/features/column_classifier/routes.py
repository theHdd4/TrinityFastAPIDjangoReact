# app/routes.py - Data Classification API Routes
from fastapi import APIRouter, HTTPException, Form
from datetime import datetime
import json
from typing import Dict, Any, List, Optional
from pydantic import BaseModel
from urllib.parse import unquote
import os
import pyarrow as pa
import pyarrow.ipc as ipc
from minio.error import S3Error
from app.DataStorageRetrieval.arrow_client import download_dataframe, upload_dataframe
from app.DataStorageRetrieval.flight_registry import get_flight_path_for_csv, set_ticket
from app.DataStorageRetrieval.db import get_dataset_info
from app.DataStorageRetrieval.minio_utils import get_client, MINIO_BUCKET
from app.features.feature_overview.deps import redis_client

# Import your existing database functions
# Change these lines at the top of routes.py:
from app.features.column_classifier.database import (
    get_validator_atom_from_mongo,
    get_validator_from_memory_or_disk,
    save_business_dimensions_to_mongo,
    save_project_dimension_mapping,
    save_classifier_config_to_mongo,
    save_classifier_config_to_postgres,
    get_classifier_config_from_mongo,
    get_project_dimension_mapping,
)
from app.features.column_classifier.config import settings
from app.core.utils import get_env_vars


from app.features.column_classifier.schemas import (
    ClassifyColumnsResponse,
    AutoClassification,
    ClassificationSummary,
    UserClassification,
    FinalClassification,
    DefineDimensionsResponse,
    DimensionDetails,
    NextSteps,
    AssignmentSummary,
    NextStepsAssignment,
    AssignIdentifiersResponse,
)

# Create router instance
router = APIRouter()

# In-memory storage (keeping your existing structure)
extraction_results = {}

# MinIO client for loading saved dataframes
minio_client = get_client()


# =============================================================================
# HEALTH CHECK ENDPOINT
# =============================================================================
@router.get("/health")
async def health_check():
    """Health check endpoint for the classification service"""
    return {
        "status": "healthy",
        "service": "Data Classification API",
        "timestamp": datetime.now().isoformat(),
        "database": settings.classification_database,
        "port": settings.api_port,
        "version": settings.app_version
    }


@router.get("/debug/mongodb")
async def check_mongodb_collections():
    """Debug: Check MongoDB connection and collections"""
    try:
        from database import test_mongodb_operations, check_mongodb_connection
        
        # Test basic connection
        if not check_mongodb_connection():
            return {
                "status": "error",
                "message": "MongoDB connection failed",
                "database": settings.classification_database,
                "collections": None,
                "connection": "failed"
            }
        
        # Get detailed MongoDB info
        mongo_result = test_mongodb_operations()
        
        return {
            "status": "success",
            "message": "MongoDB connection and collections verified",
            "database": settings.classification_database,
            "mongodb_url": settings.mongo_uri,
            "available_collections": mongo_result.get("collections", []),
            "required_collections": [
                settings.validator_atoms_collection,
                settings.column_classifications_collection,
                settings.business_dimensions_collection
            ],
            "connection": "healthy",
            "full_mongo_result": mongo_result
        }
        
    except Exception as e:
        return {
            "status": "error", 
            "message": f"MongoDB check failed: {str(e)}",
            "database": settings.classification_database,
            "connection": "error",
            "error": str(e)
        }

@router.get("/debug/collections_detailed")
async def check_collections_with_counts():
    """Debug: Check MongoDB collections with document counts"""
    try:
        from database import check_mongodb_connection, db
        
        if not check_mongodb_connection():
            return {"status": "error", "message": "MongoDB not connected"}
        
        # Count documents in each collection
        collections_info = {}
        
        required_collections = [
            settings.validator_atoms_collection,
            settings.column_classifications_collection, 
            settings.business_dimensions_collection
        ]
        
        for collection_name in required_collections:
            try:
                count = db[collection_name].count_documents({})
                collections_info[collection_name] = {
                    "exists": True,
                    "document_count": count,
                    "status": "healthy"
                }
            except Exception as e:
                collections_info[collection_name] = {
                    "exists": False,
                    "document_count": 0,
                    "status": f"error: {str(e)}"
                }
        
        return {
            "status": "success",
            "database": settings.classification_database,
            "collections": collections_info,
            "total_collections": len(required_collections),
            "timestamp": datetime.now().isoformat()
        }
        
    except Exception as e:
        return {
            "status": "error",
            "message": f"Collection check failed: {str(e)}",
            "error": str(e)
        }

# =============================================================================
# MAIN CLASSIFICATION ENDPOINT
# =============================================================================
@router.post("/classify_columns", response_model=ClassifyColumnsResponse)
async def classify_columns(
    dataframe: str = Form(...),
    identifiers: str = Form(default="[]"),
    measures: str = Form(default="[]"),
    unclassified: str = Form(default="[]")
):
    """
    Auto-classify data columns with optional user overrides.

    - **dataframe**: Saved Arrow dataframe object name
    - **identifiers**: JSON array of columns to classify as identifiers
    - **measures**: JSON array of columns to classify as measures
    - **unclassified**: JSON array of columns to leave unclassified
    """

    object_name = unquote(dataframe)
    flight_path = get_flight_path_for_csv(object_name)
    if not flight_path:
        info = await get_dataset_info(object_name)
        if info:
            file_key, flight_path, original_csv = info
            set_ticket(file_key, object_name, flight_path, original_csv)
    df = None
    if flight_path:
        try:
            df = download_dataframe(flight_path)
        except Exception:
            df = None
    if df is None:
        if not object_name.endswith(".arrow"):
            raise HTTPException(status_code=400, detail="Unsupported file format")
        content = redis_client.get(object_name)
        if content is None:
            try:
                response = minio_client.get_object(MINIO_BUCKET, object_name)
                content = response.read()
                redis_client.setex(object_name, 3600, content)
            except S3Error as e:
                code = getattr(e, "code", "")
                if code in {"NoSuchKey", "NoSuchBucket"}:
                    redis_client.delete(object_name)
                    raise HTTPException(status_code=404, detail="File not found")
                raise HTTPException(status_code=500, detail=str(e))
        reader = ipc.RecordBatchFileReader(pa.BufferReader(content))
        df = reader.read_all().to_pandas()

    df.columns = [str(c).lower() for c in df.columns]
    all_columns = df.columns.tolist()
    column_types = {c: str(df[c].dtype) for c in df.columns}

    # Parse user overrides (if provided)
    try:
        user_identifiers = json.loads(identifiers) if identifiers != "[]" else []
        user_measures = json.loads(measures) if measures != "[]" else []
        user_unclassified = json.loads(unclassified) if unclassified != "[]" else []
    except json.JSONDecodeError as e:
        raise HTTPException(
            status_code=400, 
            detail=f"Invalid JSON format for classification lists: {str(e)}"
        )

    # Validate user inputs - ensure they reference actual columns
    all_user_columns = user_identifiers + user_measures + user_unclassified
    invalid_columns = [col for col in all_user_columns if col not in all_columns]
    if invalid_columns:
        raise HTTPException(
            status_code=400, 
            detail=f"Invalid columns specified: {invalid_columns}. Available columns: {all_columns}"
        )

    # Start with user-specified classifications
    final_identifiers = user_identifiers.copy()
    final_measures = user_measures.copy()
    final_unclassified = user_unclassified.copy()

    # Get columns already classified by user
    user_classified_columns = set(final_identifiers + final_measures + final_unclassified)

    # Check for user classification conflicts
    all_user_specified = user_identifiers + user_measures + user_unclassified
    if len(all_user_specified) != len(set(all_user_specified)):
        raise HTTPException(
            status_code=400, 
            detail="Column specified in multiple classification categories"
        )

    # AUTO-CLASSIFY only the remaining columns
    identifier_keywords = [
        'id', 'name', 'brand', 'market', 'category', 'region', 'channel', 
        'date', 'time', 'year', 'week', 'month', 'variant', 'ppg', 'type', 
        'code', 'packsize', 'packtype'
    ]
    measure_keywords = [
        'sales', 'revenue', 'volume', 'amount', 'value', 'price', 'cost', 
        'profit', 'units', 'd1', 'd2', 'd3', 'd4', 'd5', 'd6', 
        'salesvalue', 'baseprice', 'promoprice'
    ]

    auto_identifiers = []
    auto_measures = []
    auto_unclassified = []

    # Only auto-classify columns NOT already specified by user
    remaining_columns = [col for col in all_columns if col not in user_classified_columns]

    for col in remaining_columns:
        col_lower = col.lower()
        col_type = column_types.get(col, "string")
        
        # Auto-classify remaining columns
        if any(keyword in col_lower for keyword in identifier_keywords):
            auto_identifiers.append(col)
            final_identifiers.append(col)
        elif any(keyword in col_lower for keyword in measure_keywords):
            auto_measures.append(col)
            final_measures.append(col)
        elif col_type in ["numeric", "integer", "float64"]:
            auto_measures.append(col)
            final_measures.append(col)
        else:
            auto_unclassified.append(col)
            final_unclassified.append(col)

    # Calculate confidence scores
    confidence_scores = {}
    for col in all_columns:
        col_lower = col.lower()
        if col in user_classified_columns:
            confidence_scores[col] = 1.0  # User specified = 100% confidence
        elif any(keyword in col_lower for keyword in identifier_keywords):
            confidence_scores[col] = 0.9
        elif any(keyword in col_lower for keyword in measure_keywords):
            confidence_scores[col] = 0.9
        elif column_types.get(col) in ["numeric", "integer", "float64"]:
            confidence_scores[col] = 0.7
        else:
            confidence_scores[col] = 0.5

    # FINAL VALIDATION: Check no duplicates and all columns classified
    all_final = final_identifiers + final_measures + final_unclassified
    if len(all_final) != len(set(all_final)):
        raise HTTPException(
            status_code=400, 
            detail="Internal error: Column classification conflict"
        )
    
    if set(all_final) != set(all_columns):
        missing = set(all_columns) - set(all_final)
        extra = set(all_final) - set(all_columns)
        error_msg = []
        if missing:
            error_msg.append(f"Missing columns: {list(missing)}")
        if extra:
            error_msg.append(f"Extra columns: {list(extra)}")
        raise HTTPException(
            status_code=400, 
            detail=f"Classification mismatch: {'; '.join(error_msg)}"
        )

    # Build classification data
    classification_data = {
        "auto_classification": {
            "identifiers": auto_identifiers,
            "measures": auto_measures,
            "unclassified": auto_unclassified,
        },
        "final_classification": {
            "identifiers": final_identifiers,
            "measures": final_measures,
            "unclassified": final_unclassified
        },
        "user_modified": bool(user_identifiers or user_measures or user_unclassified),
        "timestamp": datetime.now().isoformat(),
    }

    return ClassifyColumnsResponse(
        status="success",
        message="Column classification completed successfully",
        dataframe=object_name,
        auto_classification=AutoClassification(
            identifiers=auto_identifiers,
            measures=auto_measures,
            unclassified=auto_unclassified,
            confidence_scores=confidence_scores
        ),
        user_classification=UserClassification(
            identifiers=user_identifiers,
            measures=user_measures,
            unclassified=user_unclassified
        ),
        final_classification=FinalClassification(
            identifiers=final_identifiers,
            measures=final_measures,
            unclassified=final_unclassified
        ),
        user_modified=bool(user_identifiers or user_measures or user_unclassified),
        summary=ClassificationSummary(
            total_columns=len(all_columns),
            user_specified=len(user_identifiers + user_measures + user_unclassified),
            auto_classified=len(auto_identifiers + auto_measures + auto_unclassified),
            identifiers_count=len(final_identifiers),
            measures_count=len(final_measures),
            unclassified_count=len(final_unclassified)
        )
    )
    
    
@router.post("/define_dimensions", response_model=DefineDimensionsResponse)
async def define_dimensions(
    validator_atom_id: str = Form(...),
    file_key: str = Form(...),
    dimensions: str = Form(...),
    project_id: int = Form(None),
    user_id: str = Form(""),
    client_id: str = Form("")
):
    """
    Endpoint to define business dimensions for a specific file key in a validator atom.
    Maximum of 4 dimensions allowed per file key.
    Works for both regular validator atoms and template validator atoms.
    """
    
    # Parse dimensions JSON
    try:
        dims = json.loads(dimensions)
    except json.JSONDecodeError as e:
        raise HTTPException(status_code=400, detail=f"Invalid JSON format for dimensions: {str(e)}")

    # Validate dims structure
    if not isinstance(dims, list):
        raise HTTPException(status_code=400, detail="Dimensions must be a list of objects")

    # ✅ ENFORCE MAX 4 DIMENSIONS
    if len(dims) > 4:
        raise HTTPException(status_code=400, detail="Maximum of 4 dimensions allowed")
    
    if len(dims) == 0:
        raise HTTPException(status_code=400, detail="At least 1 dimension must be provided")

    # Validate each dimension structure
    required_fields = ['id', 'name']
    dimension_ids = []
    dimension_names = []
    
    for i, dim in enumerate(dims):
        if not isinstance(dim, dict):
            raise HTTPException(status_code=400, detail=f"Dimension {i+1} must be an object")
        
        # Check required fields
        for field in required_fields:
            if field not in dim:
                raise HTTPException(status_code=400, detail=f"Dimension {i+1} missing required field: '{field}'")
            if not dim[field] or not isinstance(dim[field], str):
                raise HTTPException(status_code=400, detail=f"Dimension {i+1} field '{field}' must be a non-empty string")
        
        # Check for duplicate IDs and names
        if dim['id'] in dimension_ids:
            raise HTTPException(status_code=400, detail=f"Duplicate dimension ID: '{dim['id']}'")
        if dim['name'] in dimension_names:
            raise HTTPException(status_code=400, detail=f"Duplicate dimension name: '{dim['name']}'")
        
        dimension_ids.append(dim['id'])
        dimension_names.append(dim['name'])

    # Check if validator atom exists (MongoDB first)
    validator_data = get_validator_atom_from_mongo(validator_atom_id)
    if not validator_data:
        # Fallback to old method for backward compatibility
        validator_data = get_validator_from_memory_or_disk(validator_atom_id)

    if not validator_data:
        raise HTTPException(status_code=404, detail=f"Validator atom '{validator_atom_id}' not found")

    # Check if file_key exists
    if file_key not in validator_data["schemas"]:
        available_keys = list(validator_data["schemas"].keys())
        raise HTTPException(
            status_code=400, 
            detail=f"File key '{file_key}' not found in validator. Available file keys: {available_keys}"
        )

    # Store dimensions for this specific file key
    dims_dict = {dim['id']: dim for dim in dims}

    # Save to MongoDB
    try:
        mongo_result = save_business_dimensions_to_mongo(
            validator_atom_id,
            file_key,
            dims_dict,
            project_id,
            user_id=user_id,
            client_id=client_id,
        )
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Failed to save dimensions to MongoDB: {str(e)}")

    # Safe update in memory (optional for compatibility)
    try:
        # Initialize extraction_results entry if it doesn't exist
        if validator_atom_id not in extraction_results:
            extraction_results[validator_atom_id] = {}
        
        if "business_dimensions" not in extraction_results[validator_atom_id]:
            extraction_results[validator_atom_id]["business_dimensions"] = {}
        
        extraction_results[validator_atom_id]["business_dimensions"][file_key] = dims_dict
        in_memory_status = "success"
    except Exception as e:
        # Log but don't fail - MongoDB save is what matters
        print(f"Warning: Could not update in-memory results for {validator_atom_id}: {e}")
        in_memory_status = "warning"

    return DefineDimensionsResponse(
        status="success",
        message=f"Business dimensions defined successfully for file key '{file_key}' ({len(dims)} dimensions)",
        validator_atom_id=validator_atom_id,
        file_key=file_key,
        validator_type=validator_data.get("template_type", "custom"),
        dimensions=dims_dict,
        dimensions_count=len(dims),
        max_allowed=4,
        dimension_details=DimensionDetails(
            dimension_ids=dimension_ids,
            dimension_names=dimension_names,
            created_at=datetime.now().isoformat()
        ),
        mongodb_saved=mongo_result.get("status") == "success",
        in_memory_saved=in_memory_status,
        project_id=project_id,
        next_steps=NextSteps(
            assign_identifiers=f"POST /assign_identifiers_to_dimensions with validator_atom_id: {validator_atom_id}",
            view_assignments=f"GET /get_identifier_assignments/{validator_atom_id}/{file_key}"
        )
    )


@router.post("/assign_identifiers_to_dimensions", response_model=AssignIdentifiersResponse)
async def assign_identifiers_to_dimensions(
    identifier_assignments: str = Form(...),
    project_id: int = Form(...),
    user_id: str = Form(""),
    client_id: str = Form(""),
):
    """Assign identifiers to business dimensions for the given project."""
    
    # Parse identifier_assignments JSON
    try:
        assignments = json.loads(identifier_assignments)
    except json.JSONDecodeError as e:
        raise HTTPException(status_code=400, detail=f"Invalid JSON format for identifier_assignments: {str(e)}")

    # Validate assignments structure
    if not isinstance(assignments, dict):
        raise HTTPException(status_code=400, detail="identifier_assignments must be a JSON object")

    if not assignments:
        raise HTTPException(status_code=400, detail="identifier_assignments cannot be empty")

    # Validate assignments
    all_assigned_identifiers = []
    for dim_id, identifiers in assignments.items():
        if not isinstance(identifiers, list):
            raise HTTPException(status_code=400, detail=f"Identifiers for dimension '{dim_id}' must be a list")
        if not identifiers:
            raise HTTPException(status_code=400, detail=f"Identifiers list for dimension '{dim_id}' cannot be empty")
        all_assigned_identifiers.extend(identifiers)

    mongo_result = save_project_dimension_mapping(
        project_id,
        assignments,
        user_id=user_id,
        client_id=client_id,
    )
    map_key = f"project:{project_id}:dimensions"
    redis_client.setex(map_key, 3600, json.dumps(assignments, default=str))
    in_memory_status = "skipped"
    message = "Identifiers assigned to project dimensions"
    validator_type = "project"
    unassigned_identifiers = []
    updated_business_dimensions = assignments

    # Push mapping to flight server for project consumption
    try:
        rows = [(d, i) for d, ids in assignments.items() for i in ids]
        if rows:
            import pandas as pd

            df = pd.DataFrame(rows, columns=["dimension", "identifier"])
            path = f"{project_id}/dimension_mapping"
            upload_dataframe(df, path)
            set_ticket(f"project_{project_id}_dimensions", f"project_{project_id}_dimensions.arrow", path, "project_dimensions.csv")
    except Exception as e:
        print(f"flight upload failed: {e}")

    return AssignIdentifiersResponse(
        status="success",
        message=message,
        validator_atom_id="",
        file_key="",
        validator_type=validator_type,
        project_id=project_id,
        updated_business_dimensions=updated_business_dimensions,
        assignment_summary=AssignmentSummary(
            total_identifiers=len(all_assigned_identifiers),
            assigned_identifiers=len(all_assigned_identifiers),
            unassigned_identifiers=0,
            dimensions_with_assignments=len(assignments),
            assignment_timestamp=datetime.now().isoformat(),
        ),
        unassigned_identifiers=[],
        dimension_breakdown={dim_id: len(ids) for dim_id, ids in assignments.items()},
        mongodb_updated=mongo_result.get("status") == "success",
        in_memory_updated=in_memory_status,
        next_steps=NextStepsAssignment(view_complete_setup="", export_configuration=""),
    )


class SaveConfigRequest(BaseModel):
    project_id: int | None = None
    client_name: str = ""
    app_name: str = ""
    project_name: str = ""
    identifiers: List[str]
    measures: List[str]
    dimensions: Dict[str, List[str]]


@router.post("/save_config")
async def save_config(req: SaveConfigRequest):
    """Save column classifier configuration to Redis and MongoDB."""
    key = f"{req.client_name}/{req.app_name}/{req.project_name}/column_classifier_config"
    env = await get_env_vars(
        client_name=req.client_name,
        app_name=req.app_name,
        project_name=req.project_name,
    )
    env = env or {}
    print(f"🔧 save_config env {env}")
    data = {
        "project_id": req.project_id,
        "client_name": req.client_name,
        "app_name": req.app_name,
        "project_name": req.project_name,
        "identifiers": req.identifiers,
        "measures": req.measures,
        "dimensions": req.dimensions,
        "env": env,
    }
    redis_client.setex(key, 3600, json.dumps(data, default=str))

    # Keep the cached environment in sync so downstream features like
    # Feature Overview pick up the latest dimension mapping after a
    # configuration change.
    env_key = f"env:{req.client_name}:{req.app_name}:{req.project_name}"
    env["identifiers"] = req.identifiers
    env["measures"] = req.measures
    env["dimensions"] = req.dimensions
    redis_client.setex(env_key, 3600, json.dumps(env, default=str))

    if req.project_id:
        map_key = f"project:{req.project_id}:dimensions"
        redis_client.setex(map_key, 3600, json.dumps(req.dimensions, default=str))
        # Persist the project-level mapping so cache refreshes pick up the
        # updated assignments.
        save_project_dimension_mapping(req.project_id, req.dimensions)

    mongo_result = save_classifier_config_to_mongo(data)
    postgres_result = await save_classifier_config_to_postgres(data)
    print(f"📦 mongo save result {mongo_result}")
    print(f"🗃 postgres save result {postgres_result}")
    if mongo_result.get("status") != "success":
        raise HTTPException(status_code=500, detail=mongo_result.get("error", "Mongo save failed"))
    return {
        "status": "success",
        "key": key,
        "data": data,
        "mongo": mongo_result,
        "postgres": postgres_result,
    }


@router.get("/get_config")
async def get_config(client_name: str, app_name: str, project_name: str):
    """Retrieve saved column classifier configuration."""
    key = f"{client_name}/{app_name}/{project_name}/column_classifier_config"
    cached = redis_client.get(key)
    if cached:
        return {"status": "success", "source": "redis", "data": json.loads(cached)}

    mongo_data = get_classifier_config_from_mongo(client_name, app_name, project_name)
    if mongo_data:
        redis_client.setex(key, 3600, json.dumps(mongo_data, default=str))
        return {"status": "success", "source": "mongo", "data": mongo_data}

    raise HTTPException(status_code=404, detail="Configuration not found")


class CacheProjectRequest(BaseModel):
    client_name: str
    app_name: str = ""
    project_name: str
    project_id: int


@router.post("/cache_project")
async def cache_project(req: CacheProjectRequest):
    """Load project environment and classifier data into Redis."""
    env = await get_env_vars(
        client_name=req.client_name,
        app_name=req.app_name,
        project_name=req.project_name,
    )
    env_key = f"env:{req.client_name}:{req.app_name}:{req.project_name}"
    redis_client.setex(env_key, 3600, json.dumps(env, default=str))

    cfg = get_classifier_config_from_mongo(
        req.client_name, req.app_name, req.project_name
    )
    if cfg:
        cfg_key = (
            f"{req.client_name}/{req.app_name}/{req.project_name}/"
            "column_classifier_config"
        )
        redis_client.setex(cfg_key, 3600, json.dumps(cfg, default=str))

    mapping = get_project_dimension_mapping(req.project_id)
    if mapping and mapping.get("assignments"):
        map_key = f"project:{req.project_id}:dimensions"
        redis_client.setex(map_key, 3600, json.dumps(mapping["assignments"], default=str))

    return {
        "status": "cached",
        "env_cached": bool(env),
        "config_cached": bool(cfg),
        "mapping_cached": bool(mapping),
    }
