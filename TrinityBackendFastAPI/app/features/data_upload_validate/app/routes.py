# app/routes.py - API Routes
from fastapi import APIRouter, HTTPException, File, Form, UploadFile, Query, Request
from typing import List, Dict, Any
import json
import pandas as pd
import io
import os
from pathlib import Path
import re

# Add this line with your other imports
from datetime import datetime


from app.features.data_upload_validate.app.validators.mmm import validate_mmm
from app.features.data_upload_validate.app.validators.category_forecasting import validate_category_forecasting
# Add this import at the top of your routes.py file
from app.features.data_upload_validate.app.validators.promo import validate_promo_intensity
# app/routes.py - Add this import
from app.features.data_upload_validate.app.schemas import (
    # Create validator schemas
    CreateValidatorResponse,
    
    # Classification schemas
    ClassifyColumnsResponse,
    Classification,
    AutoClassification,
    ClassificationSummary,
    
    # Column types schemas
    UpdateColumnTypesResponse,
    MongoDBUpdateStatus,
    
    # Business dimensions schemas
    DefineDimensionsResponse,
    BusinessDimensionItem,
    
    # Assignment schemas
    AssignIdentifiersResponse,
    AssignmentSummary,
    
    # Validation schemas
    ValidateResponse,
    FileValidationResult,
    ValidationSummary,
    MinIOUploadResult,ConditionFailure
)

# Add to your existing imports in app/routes.py
from app.features.data_upload_validate.app.database import get_validation_config_from_mongo  # ✅ ADD THIS

from app.features.data_upload_validate.app.database import save_validation_config_to_mongo
from app.features.data_upload_validate.app.schemas import ConfigureValidationConfigResponse
from app.features.data_upload_validate.app.database import save_classification_to_mongo
from app.features.data_upload_validate.app.database import save_classification_to_mongo, get_validator_atom_from_mongo, update_validator_atom_in_mongo

from app.features.data_upload_validate.app.database import (
    save_business_dimensions_to_mongo,
    get_business_dimensions_from_mongo,
    get_classification_from_mongo,
    update_business_dimensions_assignments_in_mongo,
    save_validation_units_to_mongo,
    get_validation_units_from_mongo,
)




from app.features.data_upload_validate.app.database import (
    get_validator_atom_from_mongo,  # Fallback function
    save_validation_log_to_mongo
)

# Add this import
from app.features.data_upload_validate.app.database import save_validator_atom_to_mongo
from app.features.data_upload_validate.app.database import save_classification_to_mongo, get_validator_atom_from_mongo


# Initialize router
router = APIRouter()





from app.features.data_upload_validate.app.validators.custom_validator import perform_enhanced_validation

# Config directory
CUSTOM_CONFIG_DIR = Path("custom_validations")
CUSTOM_CONFIG_DIR.mkdir(exist_ok=True)

# In-memory storage
extraction_results = {}

# Health check
@router.get("/health")
async def health_check():
    return {"status": "healthy", "message": "Validate Atom API is running"}

# app/routes.py - Add MinIO imports and configuration

from minio import Minio
from minio.error import S3Error
from app.features.feature_overview.deps import redis_client
import os

# ✅ MINIO CONFIGURATION FOR YOUR SERVER
MINIO_ENDPOINT = "10.2.1.65:9003"
MINIO_ACCESS_KEY = "admin_dev"  # Update with your credentials
MINIO_SECRET_KEY = "pass_dev"  # Update with your credentials
MINIO_BUCKET = "validated-d1"    # Your existing bucket

# Path info for saving uploads
CLIENT_NAME = os.getenv("CLIENT_NAME", "default_client")
APP_NAME = os.getenv("APP_NAME", "default_app")
PROJECT_NAME = os.getenv("PROJECT_NAME", "default_project")
OBJECT_PREFIX = f"{CLIENT_NAME}/{APP_NAME}/{PROJECT_NAME}/"

# Initialize MinIO client
minio_client = Minio(
    endpoint=MINIO_ENDPOINT,
    access_key=MINIO_ACCESS_KEY,
    secret_key=MINIO_SECRET_KEY,
    secure=False
)

# Check bucket exists
def check_minio_bucket():
    try:
        if minio_client.bucket_exists(MINIO_BUCKET):
            print(f"✅ MinIO bucket '{MINIO_BUCKET}' is accessible")
            return True
        else:
            print(f"❌ MinIO bucket '{MINIO_BUCKET}' not found")
            return False
    except Exception as e:
        print(f"⚠️ MinIO connection error: {e}")
        return False

# Test connection on startup
check_minio_bucket()



# app/routes.py - Efficient MinIO upload function

# app/routes.py - Add this function definition

def upload_to_minio(file_content_bytes: bytes, filename: str, validator_atom_id: str, file_key: str) -> dict:
    """
    Upload file to MinIO - Complete function definition
    """
    try:
        # Create unique object name with timestamp
        timestamp = pd.Timestamp.now().strftime("%Y%m%d_%H%M%S")
        object_name = f"{CLIENT_NAME}/{APP_NAME}/{PROJECT_NAME}/{timestamp}_{filename}"
        
        # Convert bytes to BytesIO for seek operations
        file_content = io.BytesIO(file_content_bytes)
        
        # Get file size
        file_content.seek(0, os.SEEK_END)
        file_size = file_content.tell()
        file_content.seek(0)  # Reset to beginning
        
        # Upload directly to MinIO
        result = minio_client.put_object(
            bucket_name=MINIO_BUCKET,
            object_name=object_name,
            data=file_content,
            length=file_size,
            content_type="application/octet-stream"
        )
        
        return {
            "status": "success",
            "bucket": MINIO_BUCKET,
            "object_name": object_name,
            "file_url": f"http://{MINIO_ENDPOINT}/{MINIO_BUCKET}/{object_name}",
            "uploaded_at": timestamp,
            "etag": result.etag,
            "server": MINIO_ENDPOINT
        }
        
    except S3Error as e:
        return {
            "status": "error",
            "error_message": str(e),
            "error_type": "minio_s3_error"
        }
    except Exception as e:
        return {
            "status": "error",
            "error_message": str(e),
            "error_type": "general_upload_error"
        }


# MongoDB directory setup
MONGODB_DIR = Path("mongodb")
MONGODB_DIR.mkdir(exist_ok=True)

def save_non_validation_data(validator_atom_id: str, data_type: str, data: dict):
    """
    Save non-validation data to separate JSON files in mongodb folder
    data_type: 'classification', 'business_dimensions', 'identifier_assignments'
    """
    try:
        file_path = MONGODB_DIR / f"{validator_atom_id}_{data_type}.json"
        
        # Load existing data if file exists
        existing_data = {}
        if file_path.exists():
            with open(file_path, "r") as f:
                existing_data = json.load(f)
        
        # Merge with new data
        existing_data.update(data)
        
        # Save updated data
        with open(file_path, "w") as f:
            json.dump(existing_data, f, indent=2)
        
        print(f"✅ Saved {data_type} for {validator_atom_id} to mongodb folder")
        return True
    except Exception as e:
        print(f"❌ Error saving {data_type}: {str(e)}")
        return False

def load_non_validation_data(validator_atom_id: str, data_type: str) -> dict:
    """
    Load non-validation data from mongodb folder
    Returns: dict with file_key as keys
    """
    try:
        file_path = MONGODB_DIR / f"{validator_atom_id}_{data_type}.json"
        if file_path.exists():
            with open(file_path, "r") as f:
                data = json.load(f)
            print(f"✅ Loaded {data_type} for {validator_atom_id} from mongodb folder")
            return data
        else:
            print(f"ℹ️ No {data_type} file found for {validator_atom_id}")
            return {}
    except Exception as e:
        print(f"❌ Error loading {data_type}: {str(e)}")
        return {}

def load_all_non_validation_data(validator_atom_id: str) -> dict:
    """
    Load all non-validation data for a validator atom from mongodb folder
    Returns: dict with classification, business_dimensions, identifier_assignments
    """
    classification = load_non_validation_data(validator_atom_id, "classification")
    business_dimensions = load_non_validation_data(validator_atom_id, "business_dimensions")
    identifier_assignments = load_non_validation_data(validator_atom_id, "identifier_assignments")
    
    return {
        "classification": classification,
        "business_dimensions": business_dimensions,
        "identifier_assignments": identifier_assignments
    }

def get_validator_from_memory_or_disk(validator_atom_id: str):
    """
    Get validator from memory, or load from disk if not in memory
    Loads both validation data (custom_validations/) and non-validation data (mongodb/)
    """
    # Check memory first
    if validator_atom_id in extraction_results:
        return extraction_results[validator_atom_id]
    
    # Load from disk if not in memory
    config_path = CUSTOM_CONFIG_DIR / f"{validator_atom_id}.json"
    if config_path.exists():
        try:
            # Load validation data
            with open(config_path, "r") as f:
                config = json.load(f)
            
            # Load non-validation data from mongodb folder
            non_validation_data = load_all_non_validation_data(validator_atom_id)
            
            # Combine all data in memory
            extraction_results[validator_atom_id] = {
                "validator_atom_id": validator_atom_id,
                "schemas": config.get("schemas", {}),
                "column_types": config.get("column_types", {}),
                "config_saved": True,
                "config_path": str(config_path),
                **non_validation_data  # Add classification, business_dimensions, identifier_assignments
            }
            
            print(f"✅ Loaded {validator_atom_id} from disk (validation + mongodb data)")
            return extraction_results[validator_atom_id]
        except Exception as e:
            print(f"❌ Error loading config from disk: {str(e)}")
    
    return None

def load_existing_configs():
    """
    Load all existing validator configs from both folders on startup
    - custom_validations/: validation data (schemas, column_types)
    - mongodb/: non-validation data (classification, dimensions, assignments)
    """
    if not CUSTOM_CONFIG_DIR.exists():
        print("ℹ️ No custom_validations folder found")
        return
    
    print("📁 Loading configs from custom_validations and mongodb folders...")
    
    for config_file in CUSTOM_CONFIG_DIR.glob("*.json"):
        try:
            with open(config_file, "r") as f:
                config = json.load(f)
            
            validator_atom_id = config.get("validator_atom_id")
            if validator_atom_id:
                # Load validation data
                extraction_results[validator_atom_id] = {
                    "validator_atom_id": validator_atom_id,
                    "schemas": config.get("schemas", {}),
                    "column_types": config.get("column_types", {}),
                    "config_saved": True,
                    "config_path": str(config_file)
                }
                
                # Load non-validation data from mongodb folder
                non_validation_data = load_all_non_validation_data(validator_atom_id)
                extraction_results[validator_atom_id].update(non_validation_data)
                
                print(f"✅ Loaded validator atom: {validator_atom_id}")
                print(f"   - Validation: {len(config.get('schemas', {}))}")
                print(f"   - Classification: {len(non_validation_data.get('classification', {}))}")
                print(f"   - Dimensions: {len(non_validation_data.get('business_dimensions', {}))}")
                print(f"   - Assignments: {len(non_validation_data.get('identifier_assignments', {}))}")
        except Exception as e:
            print(f"⚠️ Failed to load config {config_file}: {str(e)}")


            

# POST: CREATE_NEW - Create validator atom with column preprocessing
@router.post("/create_new", status_code=202, response_model=CreateValidatorResponse)
async def create_new(
    validator_atom_id: str = Form(..., description="Unique ID for your validator atom"),
    files: List[UploadFile] = File(...),
    file_keys: str = Form(...)
) -> Dict[str, Any]:
    """
    Create new validator atom by uploading files and generating validation rules
    """
    # ✅ ADD COLUMN PREPROCESSING FUNCTION
    def preprocess_column_name(col_name: str) -> str:
        """
        Preprocess column name:
        - Strip leading/trailing spaces
        - Lowercase
        - Remove spaces inside the name but preserve underscores
        """
        col_name = col_name.strip().lower()
        # Remove spaces but keep underscores
        col_name = re.sub(r'(?<!_)\s+(?!_)', '', col_name)
        return col_name

    # Parse file_keys JSON
    try:
        keys = json.loads(file_keys)
    except json.JSONDecodeError:
        raise HTTPException(status_code=400, detail="Invalid JSON format for file_keys")

    # Basic validations
    if not validator_atom_id or not validator_atom_id.strip():
        raise HTTPException(status_code=400, detail="validator_atom_id cannot be empty")
    if len(files) != len(keys):
        raise HTTPException(status_code=400, detail="Number of keys must match number of files")
    if len(files) > 3:
        raise HTTPException(status_code=400, detail="Maximum 3 files supported")

    schemas = {}
    dataframes = {}  # Store DataFrames for data type extraction
    
    # Process each file
    for file, key in zip(files, keys):
        # Read file
        try:
            content = await file.read()
        except Exception as e:
            raise HTTPException(status_code=400, detail=f"Error reading file {file.filename}: {str(e)}")

        # Parse file to DataFrame
        try:
            if file.filename.lower().endswith(".csv"):
                df = pd.read_csv(io.BytesIO(content))
            elif file.filename.lower().endswith(".xlsx"):
                df = pd.read_excel(io.BytesIO(content))
            else:
                raise HTTPException(status_code=400, detail="Only CSV and XLSX files supported")
        except Exception as e:
            raise HTTPException(status_code=400, detail=f"Error parsing file {file.filename}: {str(e)}")

        # ✅ PREPROCESS COLUMN NAMES - Remove spaces but preserve underscores
        df.columns = [preprocess_column_name(col) for col in df.columns]

        # Store DataFrame for data type extraction
        dataframes[key] = df

        # Extract schema
        schema = []
        for col in df.columns:
            dtype = str(df[col].dtype)
            if "int" in dtype or "float" in dtype:
                col_type = "numeric"
            elif "datetime" in dtype:
                col_type = "date"
            elif "bool" in dtype:
                col_type = "boolean"
            else:
                col_type = "string"
            
            schema.append({"column": col, "type": col_type})

        # Store schema info
        schemas[key] = {
            "columns": schema,
            "sample_rows": df.head(3).astype(str).to_dict(orient="records"),  # ✅ ONLY THIS LINE CHANGED
            "total_rows": len(df),
            "total_columns": len(df.columns)
        }


    # Extract data types for each column in each file
    column_types = {}
    for key, df in dataframes.items():
        types = {}
        for col in df.columns:
            dtype = str(df[col].dtype)
            if "int" in dtype:
                types[col] = "integer"
            elif "float" in dtype:
                types[col] = "numeric"
            elif "datetime" in dtype:
                types[col] = "date"
            elif "bool" in dtype:
                types[col] = "boolean"
            else:
                types[col] = "string"
        column_types[key] = types

    # Also include column_types in the schemas
    for key in schemas:
        schemas[key]["column_types"] = column_types.get(key, {})

    # Generate validation config
    validation_config = {
        "validator_atom_id": validator_atom_id,
        "created_from_files": [f.filename for f in files],
        "file_keys": keys,
        "schemas": schemas,
        "column_types": column_types,
        "validation_mode": "simple"
    }

    # Save to file
    try:
        config_path = CUSTOM_CONFIG_DIR / f"{validator_atom_id}.json"
        with open(config_path, "w") as f:
            json.dump(validation_config, f, indent=2)
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Error saving config: {str(e)}")

    # ✅ ADD: Save to MongoDB
    mongo_result = save_validator_atom_to_mongo(validator_atom_id, validation_config)

    # Store in memory for GET endpoint
    extraction_results[validator_atom_id] = {
        "validator_atom_id": validator_atom_id,
        "schemas": schemas,
        "column_types": column_types,
        "config_saved": True,
        "config_path": str(config_path)
    }

    # ✅ MINIMAL POST RESPONSE - Only success confirmation
    return {
        "status": "success",
        "message": "Validator atom created successfully", 
        "validator_atom_id": validator_atom_id,
        "config_saved": True
    }
    
    
    
# GET: VIEW_NEW - Retrieve only schemas for all file keys
@router.get("/view_new/{validator_atom_id}")
async def view_new(validator_atom_id: str):
    """
    Retrieve only schemas for all file keys - no metadata
    """
    if validator_atom_id not in extraction_results:
        raise HTTPException(status_code=404, detail=f"Validator atom '{validator_atom_id}' not found")
    
    # ✅ RETURN ONLY SCHEMAS - No config_saved, config_path, validator_atom_id
    data = extraction_results[validator_atom_id]
    return data.get("schemas", {})


# POST: CLASSIFY_COLUMNS - Complete fixed version for both validator types
@router.post("/classify_columns", response_model=ClassifyColumnsResponse)
async def classify_columns(
    validator_atom_id: str = Form(...),
    file_key: str = Form(...),
    identifiers: str = Form(default="[]"),
    measures: str = Form(default="[]"),
    unclassified: str = Form(default="[]")
):
    """
    Auto-classify columns first, then allow user to override classifications.
    Works for both regular validator atoms (from /create_new) and template validator atoms (from /validate_*)
    """
    # Check if validator atom exists (MongoDB first, then fallback)
    validator_data = get_validator_atom_from_mongo(validator_atom_id)
    if not validator_data:
        # Fallback to old method for backward compatibility (regular validator atoms)
        validator_data = get_validator_from_memory_or_disk(validator_atom_id)

    if not validator_data:
        raise HTTPException(status_code=404, detail=f"Validator atom '{validator_atom_id}' not found")

    # Get column information from existing schema
    schema_data = validator_data["schemas"].get(file_key, {})
    if not schema_data:
        available_keys = list(validator_data["schemas"].keys())
        raise HTTPException(
            status_code=400, 
            detail=f"File key '{file_key}' not found in validator. Available file keys: {available_keys}"
        )

    all_columns = [col["column"] for col in schema_data.get("columns", [])]
    column_types = schema_data.get("column_types", {})

    if not all_columns:
        raise HTTPException(status_code=400, detail="No columns found in schema data")

    # Parse user overrides (if provided)
    try:
        user_identifiers = json.loads(identifiers) if identifiers != "[]" else []
        user_measures = json.loads(measures) if measures != "[]" else []
        user_unclassified = json.loads(unclassified) if unclassified != "[]" else []
    except json.JSONDecodeError as e:
        raise HTTPException(status_code=400, detail=f"Invalid JSON format for classification lists: {str(e)}")

    # Validate user inputs - ensure they reference actual columns
    all_user_columns = user_identifiers + user_measures + user_unclassified
    invalid_columns = [col for col in all_user_columns if col not in all_columns]
    if invalid_columns:
        raise HTTPException(
            status_code=400, 
            detail=f"Invalid columns specified: {invalid_columns}. Available columns: {all_columns}"
        )

    # ✅ FIXED LOGIC: Start with user-specified classifications
    final_identifiers = user_identifiers.copy()
    final_measures = user_measures.copy()
    final_unclassified = user_unclassified.copy()

    # Get columns already classified by user
    user_classified_columns = set(final_identifiers + final_measures + final_unclassified)

    # Check for user classification conflicts
    all_user_specified = user_identifiers + user_measures + user_unclassified
    if len(all_user_specified) != len(set(all_user_specified)):
        raise HTTPException(status_code=400, detail="Column specified in multiple classification categories")

    # AUTO-CLASSIFY only the remaining columns
    identifier_keywords = ['id', 'name', 'brand', 'market', 'category', 'region', 'channel', 
                          'date', 'time', 'year','week', 'month', 'variant', 'ppg', 'type', 'code', 'packsize', 'packtype']
    measure_keywords = ['sales', 'revenue', 'volume', 'amount', 'value', 'price', 'cost', 
                       'profit', 'units', 'd1', 'd2', 'd3', 'd4', 'd5', 'd6', 'salesvalue', 'baseprice', 'promoprice']

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

    # ✅ FINAL VALIDATION: Check no duplicates and all columns classified
    all_final = final_identifiers + final_measures + final_unclassified
    if len(all_final) != len(set(all_final)):
        raise HTTPException(status_code=400, detail="Internal error: Column classification conflict")
    
    if set(all_final) != set(all_columns):
        missing = set(all_columns) - set(all_final)
        extra = set(all_final) - set(all_columns)
        error_msg = []
        if missing:
            error_msg.append(f"Missing columns: {list(missing)}")
        if extra:
            error_msg.append(f"Extra columns: {list(extra)}")
        raise HTTPException(status_code=400, detail=f"Classification mismatch: {'; '.join(error_msg)}")

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
        "validator_type": validator_data.get("template_type", "custom")
    }

    # ✅ SAVE TO MONGODB
    try:
        mongo_result = save_classification_to_mongo(validator_atom_id, file_key, classification_data)
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Failed to save classification to MongoDB: {str(e)}")

    # ✅ FIXED: Safe update in memory (works for both validator types)
    try:
        # Initialize extraction_results entry if it doesn't exist (for template validator atoms)
        if validator_atom_id not in extraction_results:
            extraction_results[validator_atom_id] = {}
        
        if "classification" not in extraction_results[validator_atom_id]:
            extraction_results[validator_atom_id]["classification"] = {}
        
        extraction_results[validator_atom_id]["classification"][file_key] = classification_data
        
        in_memory_status = "success"
    except Exception as e:
        # Log but don't fail - MongoDB save is what matters
        print(f"Warning: Could not update in-memory results for {validator_atom_id}: {e}")
        in_memory_status = "warning"

    return {
        "status": "success",
        "message": "Column classification completed successfully",
        "validator_atom_id": validator_atom_id,
        "file_key": file_key,
        "validator_type": validator_data.get("template_type", "custom"),
        "auto_classification": {
            "identifiers": auto_identifiers,
            "measures": auto_measures,
            "unclassified": auto_unclassified,
            "confidence_scores": confidence_scores
        },
        "user_classification": {
            "identifiers": user_identifiers,
            "measures": user_measures,
            "unclassified": user_unclassified
        },
        "final_classification": {
            "identifiers": final_identifiers,
            "measures": final_measures,
            "unclassified": final_unclassified
        },
        "user_modified": bool(user_identifiers or user_measures or user_unclassified),
        "summary": {
            "total_columns": len(all_columns),
            "user_specified": len(user_identifiers + user_measures + user_unclassified),
            "auto_classified": len(auto_identifiers + auto_measures + auto_unclassified),
            "identifiers_count": len(final_identifiers),
            "measures_count": len(final_measures),
            "unclassified_count": len(final_unclassified)
        },
        "mongodb_save_status": mongo_result.get("status", "unknown"),
        "in_memory_save_status": in_memory_status
    }


# # POST: CLASSIFY_COLUMNS - Fixed logic with MongoDB storage
# @router.post("/classify_columns", response_model=ClassifyColumnsResponse)
# async def classify_columns(
#     validator_atom_id: str = Form(...),
#     file_key: str = Form(...),
#     identifiers: str = Form(default="[]"),
#     measures: str = Form(default="[]"),
#     unclassified: str = Form(default="[]")
# ):
#     """
#     Auto-classify columns first, then allow user to override classifications
#     """
#     # Check if validator atom exists (MongoDB first, then fallback)
#     validator_data = get_validator_atom_from_mongo(validator_atom_id)
#     if not validator_data:
#         # Fallback to old method for backward compatibility
#         validator_data = get_validator_from_memory_or_disk(validator_atom_id)

#     if not validator_data:
#         raise HTTPException(status_code=404, detail=f"Validator atom '{validator_atom_id}' not found")


#     # Get column information from existing schema
#     schema_data = validator_data["schemas"].get(file_key, {})
#     if not schema_data:
#         raise HTTPException(status_code=400, detail=f"File key '{file_key}' not found in validator")

#     all_columns = [col["column"] for col in schema_data.get("columns", [])]
#     column_types = schema_data.get("column_types", {})

#     # Parse user overrides (if provided)
#     try:
#         user_identifiers = json.loads(identifiers) if identifiers != "[]" else []
#         user_measures = json.loads(measures) if measures != "[]" else []
#         user_unclassified = json.loads(unclassified) if unclassified != "[]" else []
#     except json.JSONDecodeError:
#         raise HTTPException(status_code=400, detail="Invalid JSON format for classification lists")

#     # ✅ FIXED LOGIC: Start with user-specified classifications
#     final_identifiers = user_identifiers.copy()
#     final_measures = user_measures.copy()
#     final_unclassified = user_unclassified.copy()

#     # Get columns already classified by user
#     user_classified_columns = set(final_identifiers + final_measures + final_unclassified)

#     # AUTO-CLASSIFY only the remaining columns
#     identifier_keywords = ['id', 'name', 'brand', 'market', 'category', 'region', 'channel', 
#                           'date', 'time', 'year', 'month', 'variant', 'ppg', 'type', 'code', 'packsize']
#     measure_keywords = ['sales', 'revenue', 'volume', 'amount', 'value', 'price', 'cost', 
#                        'profit', 'units', 'd1', 'd2', 'd3', 'd4', 'd5', 'd6']

#     auto_identifiers = []
#     auto_measures = []
#     auto_unclassified = []

#     # Only auto-classify columns NOT already specified by user
#     remaining_columns = [col for col in all_columns if col not in user_classified_columns]

#     for col in remaining_columns:
#         col_lower = col.lower()
#         col_type = column_types.get(col, "string")
        
#         # Auto-classify remaining columns
#         if any(keyword in col_lower for keyword in identifier_keywords):
#             auto_identifiers.append(col)
#             final_identifiers.append(col)
#         elif any(keyword in col_lower for keyword in measure_keywords):
#             auto_measures.append(col)
#             final_measures.append(col)
#         elif col_type in ["numeric", "integer"]:
#             auto_measures.append(col)
#             final_measures.append(col)
#         else:
#             auto_unclassified.append(col)
#             final_unclassified.append(col)

#     # Calculate confidence scores
#     confidence_scores = {}
#     for col in all_columns:
#         col_lower = col.lower()
#         if col in user_classified_columns:
#             confidence_scores[col] = 1.0  # User specified = 100% confidence
#         elif any(keyword in col_lower for keyword in identifier_keywords):
#             confidence_scores[col] = 0.9
#         elif any(keyword in col_lower for keyword in measure_keywords):
#             confidence_scores[col] = 0.9
#         elif column_types.get(col) in ["numeric", "integer"]:
#             confidence_scores[col] = 0.7
#         else:
#             confidence_scores[col] = 0.5

#     # ✅ FINAL VALIDATION: Check no duplicates (should never happen now)
#     all_final = final_identifiers + final_measures + final_unclassified
#     if len(all_final) != len(set(all_final)):
#         raise HTTPException(status_code=400, detail="Internal error: Column classification conflict")

#     # Save classification
#     classification_data = {
#         "auto_classification": {
#             "identifiers": auto_identifiers,
#             "measures": auto_measures,
#             "unclassified": auto_unclassified,
#             "confidence_scores": confidence_scores
#         },
#         "final_classification": {
#             "identifiers": final_identifiers,
#             "measures": final_measures,
#             "unclassified": final_unclassified
#         },
#         "user_modified": bool(user_identifiers or user_measures or user_unclassified)
#     }

#     # ✅ SAVE TO MONGODB
#     mongo_result = save_classification_to_mongo(validator_atom_id, file_key, classification_data)


#     # Update in memory
#     if "classification" not in extraction_results[validator_atom_id]:
#         extraction_results[validator_atom_id]["classification"] = {}
#     extraction_results[validator_atom_id]["classification"][file_key] = classification_data

#     return {
#         "status": "success",
#         "message": "Column classification completed successfully",
#         "validator_atom_id": validator_atom_id,
#         "file_key": file_key,
#         "auto_classification": {
#             "identifiers": auto_identifiers,
#             "measures": auto_measures,
#             "unclassified": auto_unclassified,
#             "confidence_scores": confidence_scores
#         },
#         "user_classification": {
#             "identifiers": user_identifiers,
#             "measures": user_measures,
#             "unclassified": user_unclassified
#         },
#         "final_classification": {
#             "identifiers": final_identifiers,
#             "measures": final_measures,
#             "unclassified": final_unclassified
#         },
#         "user_modified": bool(user_identifiers or user_measures or user_unclassified),
#         "summary": {
#             "total_columns": len(all_columns),
#             "user_specified": len(user_identifiers + user_measures + user_unclassified),
#             "auto_classified": len(auto_identifiers + auto_measures + auto_unclassified)
#         }
#     }


# POST: UPDATE_COLUMN_TYPES - Allow user to change column data types
@router.post("/update_column_types", response_model=UpdateColumnTypesResponse)
async def update_column_types(
    validator_atom_id: str = Form(...),
    file_key: str = Form(...),
    column_types: str = Form(...)
):
    """
    Update column data types for a specific validator atom and file key
    """
    # Parse column_types JSON
    try:
        submitted_column_types = json.loads(column_types)
    except json.JSONDecodeError:
        raise HTTPException(status_code=400, detail="Invalid JSON format for column_types")

    # Check if validator atom exists (MongoDB first)
    validator_data = get_validator_atom_from_mongo(validator_atom_id)
    if not validator_data:
        # Fallback to old method for backward compatibility
        validator_data = get_validator_from_memory_or_disk(validator_atom_id)

    if not validator_data:
        raise HTTPException(status_code=404, detail=f"Validator atom '{validator_atom_id}' not found")

    # Check if file_key exists
    if file_key not in validator_data["schemas"]:
        raise HTTPException(status_code=400, detail=f"File key '{file_key}' not found in validator")

    # Get current schema
    current_schema = validator_data["schemas"][file_key]
    available_columns = [col["column"] for col in current_schema.get("columns", [])]

    # Validate that all columns in submitted_column_types exist in the schema
    invalid_columns = [col for col in submitted_column_types.keys() if col not in available_columns]
    if invalid_columns:
        raise HTTPException(
            status_code=400, 
            detail=f"Invalid columns: {invalid_columns}. Available columns: {available_columns}"
        )

    # Validate column type values
    valid_types = ["string", "integer", "numeric", "date", "boolean", "number"]
    invalid_types = {col: typ for col, typ in submitted_column_types.items() if typ not in valid_types and typ not in ["", None, "not_defined"]}
    if invalid_types:
        raise HTTPException(
            status_code=400,
            detail=f"Invalid column types: {invalid_types}. Valid types: {valid_types}"
        )

    # Normalize and update column_types in memory
    current_column_types = extraction_results[validator_atom_id]["column_types"].get(file_key, {})
    for col in available_columns:
        val = submitted_column_types.get(col)
        if val in ["", None, "not_defined"]:
            current_column_types.pop(col, None)
        else:
            normalized = "numeric" if val == "number" else val
            current_column_types[col] = normalized
    extraction_results[validator_atom_id]["column_types"][file_key] = current_column_types

    # Also update in schemas for consistency
    extraction_results[validator_atom_id]["schemas"][file_key]["column_types"] = current_column_types

    # Update the columns array with new types
    updated_columns = []
    for col_info in current_schema["columns"]:
        col_name = col_info["column"]
        if col_name in submitted_column_types and submitted_column_types.get(col_name) not in ["", None, "not_defined"]:
            normalized = "numeric" if submitted_column_types[col_name] == "number" else submitted_column_types[col_name]
            col_info["type"] = normalized
        updated_columns.append(col_info)
    
    extraction_results[validator_atom_id]["schemas"][file_key]["columns"] = updated_columns

    # Update JSON config file
    try:
        config_path = CUSTOM_CONFIG_DIR / f"{validator_atom_id}.json"
        if config_path.exists():
            with open(config_path, "r") as f:
                config = json.load(f)
            
            # Update column_types in config
            if "column_types" not in config:
                config["column_types"] = {}
            config["column_types"][file_key] = current_column_types
            
            # Update schemas in config
            if "schemas" in config and file_key in config["schemas"]:
                config["schemas"][file_key]["column_types"] = current_column_types
                config["schemas"][file_key]["columns"] = updated_columns
            
            # Save updated config
            with open(config_path, "w") as f:
                json.dump(config, f, indent=2)
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Error updating config file: {str(e)}")

    # ✅ MongoDB Update - INSERT THIS NEW CODE
    mongo_update_data = {
        f"schemas.{file_key}.column_types": current_column_types,
        f"schemas.{file_key}.columns": updated_columns,
        f"column_types.{file_key}": current_column_types
    }
    mongo_result = update_validator_atom_in_mongo(validator_atom_id, mongo_update_data)

    # Save datatype validation units
    datatype_units = [
        {"column": col, "validation_type": "datatype", "expected": typ}
        for col, typ in current_column_types.items()
    ]
    existing_units = get_validation_units_from_mongo(validator_atom_id, file_key)
    other_units = []
    if existing_units and "validations" in existing_units:
        other_units = [
            u for u in existing_units["validations"] if u.get("validation_type") != "datatype"
        ]
    save_validation_units_to_mongo(
        validator_atom_id,
        file_key,
        other_units + datatype_units,
    )

    # Optional: Log MongoDB result
    if mongo_result["status"] == "success":
        print(f"✅ Validator atom updated in MongoDB")
    else:
        print(f"⚠️ MongoDB update failed: {mongo_result['error']}")

    return {
        "status": "success",
        "message": "Column types updated successfully",
        "validator_atom_id": validator_atom_id,
        "file_key": file_key,
        "updated_column_types": submitted_column_types,
        "current_all_column_types": current_column_types,
        "updated_columns_count": len([c for c in submitted_column_types.values() if c not in ["", None, "not_defined"]]),
        # ✅ ADD: MongoDB update status
        "mongodb_update": {
            "status": mongo_result["status"],
            "modified": mongo_result.get("modified_count", 0) > 0 if mongo_result["status"] == "success" else False,
            "details": mongo_result.get("error", "Update successful") if mongo_result["status"] == "error" else f"Matched: {mongo_result.get('matched_count', 0)}, Modified: {mongo_result.get('modified_count', 0)}"
        }
    }

    
    




# # POST: DEFINE_DIMENSIONS - Complete fixed version for both validator types
# @router.post("/define_dimensions", response_model=DefineDimensionsResponse)
# async def define_dimensions(
#     validator_atom_id: str = Form(...),
#     file_key: str = Form(...),
#     dimensions: str = Form(...)
# ):
#     """
#     Endpoint to define business dimensions for a specific file key in a validator atom.
#     Maximum of 4 dimensions allowed per file key.
#     Works for both regular validator atoms (from /create_new) and template validator atoms (from /validate_*)
#     """
#     # Parse dimensions JSON
#     try:
#         dims = json.loads(dimensions)
#     except json.JSONDecodeError as e:
#         raise HTTPException(status_code=400, detail=f"Invalid JSON format for dimensions: {str(e)}")

#     # Validate dims structure
#     if not isinstance(dims, list):
#         raise HTTPException(status_code=400, detail="Dimensions must be a list of objects")

#     # ✅ ENFORCE MAX 4 DIMENSIONS
#     if len(dims) > 4:
#         raise HTTPException(status_code=400, detail="Maximum of 4 dimensions allowed")
    
#     if len(dims) == 0:
#         raise HTTPException(status_code=400, detail="At least 1 dimension must be provided")

#     # Validate each dimension structure
#     required_fields = ['id', 'name']
#     dimension_ids = []
#     dimension_names = []
    
#     for i, dim in enumerate(dims):
#         if not isinstance(dim, dict):
#             raise HTTPException(status_code=400, detail=f"Dimension {i+1} must be an object")
        
#         # Check required fields
#         for field in required_fields:
#             if field not in dim:
#                 raise HTTPException(status_code=400, detail=f"Dimension {i+1} missing required field: '{field}'")
#             if not dim[field] or not isinstance(dim[field], str):
#                 raise HTTPException(status_code=400, detail=f"Dimension {i+1} field '{field}' must be a non-empty string")
        
#         # Check for duplicate IDs and names
#         if dim['id'] in dimension_ids:
#             raise HTTPException(status_code=400, detail=f"Duplicate dimension ID: '{dim['id']}'")
#         if dim['name'] in dimension_names:
#             raise HTTPException(status_code=400, detail=f"Duplicate dimension name: '{dim['name']}'")
        
#         dimension_ids.append(dim['id'])
#         dimension_names.append(dim['name'])

#     # ✅ UPDATED: Check if validator atom exists (MongoDB first)
#     validator_data = get_validator_atom_from_mongo(validator_atom_id)
#     if not validator_data:
#         # Fallback to old method for backward compatibility
#         validator_data = get_validator_from_memory_or_disk(validator_atom_id)

#     if not validator_data:
#         raise HTTPException(status_code=404, detail=f"Validator atom '{validator_atom_id}' not found")

#     # Check if file_key exists
#     if file_key not in validator_data["schemas"]:
#         available_keys = list(validator_data["schemas"].keys())
#         raise HTTPException(
#             status_code=400, 
#             detail=f"File key '{file_key}' not found in validator. Available file keys: {available_keys}"
#         )

#     # Store dimensions for this specific file key
#     dims_dict = {dim['id']: dim for dim in dims}
    
#     # Add metadata
#     dimension_data = {
#         "dimensions": dims_dict,
#         "file_key": file_key,
#         "validator_atom_id": validator_atom_id,
#         "timestamp": datetime.now().isoformat(),
#         "validator_type": validator_data.get("template_type", "custom"),
#         "dimensions_count": len(dims)
#     }

#     # ✅ REPLACE: Save to MongoDB instead of file
#     try:
#         mongo_result = save_business_dimensions_to_mongo(validator_atom_id, file_key, dimension_data)
#     except Exception as e:
#         raise HTTPException(status_code=500, detail=f"Failed to save dimensions to MongoDB: {str(e)}")

#     # ✅ FIXED: Safe update in memory (works for both validator types)
#     try:
#         # Initialize extraction_results entry if it doesn't exist (for template validator atoms)
#         if validator_atom_id not in extraction_results:
#             extraction_results[validator_atom_id] = {}
        
#         if "business_dimensions" not in extraction_results[validator_atom_id]:
#             extraction_results[validator_atom_id]["business_dimensions"] = {}
        
#         extraction_results[validator_atom_id]["business_dimensions"][file_key] = dims_dict
#         in_memory_status = "success"
#     except Exception as e:
#         # Log but don't fail - MongoDB save is what matters
#         print(f"Warning: Could not update in-memory results for {validator_atom_id}: {e}")
#         in_memory_status = "warning"

#     return {
#         "status": "success",
#         "message": f"Business dimensions defined successfully for file key '{file_key}' ({len(dims)} dimensions)",
#         "validator_atom_id": validator_atom_id,
#         "file_key": file_key,
#         "validator_type": validator_data.get("template_type", "custom"),
#         "dimensions": dims_dict,
#         "dimensions_count": len(dims),
#         "max_allowed": 4,
#         "dimension_details": {
#             "dimension_ids": dimension_ids,
#             "dimension_names": dimension_names,
#             "created_at": datetime.now().isoformat()
#         },
#         "mongodb_saved": mongo_result.get("status") == "success",
#         "in_memory_saved": in_memory_status,
#         "next_steps": {
#             "assign_identifiers": f"POST /assign_identifiers_to_dimensions with validator_atom_id: {validator_atom_id}",
#             "view_assignments": f"GET /get_identifier_assignments/{validator_atom_id}/{file_key}"
#         }
#     }


# POST: DEFINE_DIMENSIONS - Complete fixed version for both validator types
@router.post("/define_dimensions", response_model=DefineDimensionsResponse)
async def define_dimensions(
    validator_atom_id: str = Form(...),
    file_key: str = Form(...),
    dimensions: str = Form(...)
):
    """
    Endpoint to define business dimensions for a specific file key in a validator atom.
    Maximum of 4 dimensions allowed per file key.
    Works for both regular validator atoms (from /create_new) and template validator atoms (from /validate_*)
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

    # ✅ UPDATED: Check if validator atom exists (MongoDB first)
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
    
    # Add metadata
    dimension_data = {
        "dimensions": dims_dict,
        "file_key": file_key,
        "validator_atom_id": validator_atom_id,
        "timestamp": datetime.now().isoformat(),
        "validator_type": validator_data.get("template_type", "custom"),
        "dimensions_count": len(dims)
    }

    # ✅ REPLACE: Save to MongoDB instead of file
    try:
        mongo_result = save_business_dimensions_to_mongo(validator_atom_id, file_key, dims_dict)
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Failed to save dimensions to MongoDB: {str(e)}")

    # ✅ FIXED: Safe update in memory (works for both validator types)
    try:
        # Initialize extraction_results entry if it doesn't exist (for template validator atoms)
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

    return {
        "status": "success",
        "message": f"Business dimensions defined successfully for file key '{file_key}' ({len(dims)} dimensions)",
        "validator_atom_id": validator_atom_id,
        "file_key": file_key,
        "validator_type": validator_data.get("template_type", "custom"),
        "dimensions": dims_dict,
        "dimensions_count": len(dims),
        "max_allowed": 4,
        "dimension_details": {
            "dimension_ids": dimension_ids,
            "dimension_names": dimension_names,
            "created_at": datetime.now().isoformat()
        },
        "mongodb_saved": mongo_result.get("status") == "success",
        "in_memory_saved": in_memory_status,
        "next_steps": {
            "assign_identifiers": f"POST /assign_identifiers_to_dimensions with validator_atom_id: {validator_atom_id}",
            "view_assignments": f"GET /get_identifier_assignments/{validator_atom_id}/{file_key}"
        }
    }




# # POST: ASSIGN_IDENTIFIERS_TO_DIMENSIONS - Save assignments in business dimensions structure
# @router.post("/assign_identifiers_to_dimensions", response_model=AssignIdentifiersResponse)
# async def assign_identifiers_to_dimensions(
#     validator_atom_id: str = Form(...),
#     file_key: str = Form(...),
#     identifier_assignments: str = Form(...)
# ):
#     """
#     Assign identifiers to dimensions and save within business dimensions structure
#     """
#     # Parse identifier_assignments JSON
#     try:
#         assignments = json.loads(identifier_assignments)
#     except json.JSONDecodeError:
#         raise HTTPException(status_code=400, detail="Invalid JSON format for identifier_assignments")

#     # Validate assignments structure
#     if not isinstance(assignments, dict):
#         raise HTTPException(status_code=400, detail="identifier_assignments must be a JSON object")

#     # ✅ Check if validator atom exists (MongoDB first)
#     validator_data = get_validator_atom_from_mongo(validator_atom_id)
#     if not validator_data:
#         # Fallback to old method for backward compatibility
#         validator_data = get_validator_from_memory_or_disk(validator_atom_id)

#     if not validator_data:
#         raise HTTPException(status_code=404, detail=f"Validator atom '{validator_atom_id}' not found")

#     # Check if file_key exists
#     if file_key not in validator_data.get("schemas", {}):
#         raise HTTPException(status_code=400, detail=f"File key '{file_key}' not found in validator")

#     # ✅ Get business dimensions from MongoDB first with correct structure handling
#     mongo_dimensions = get_business_dimensions_from_mongo(validator_atom_id, file_key)

#     if mongo_dimensions:
#         # MongoDB format: extract from dimensions array
#         dimensions_array = mongo_dimensions.get("dimensions", [])
#         available_dimension_ids = [dim.get("dimension_id") for dim in dimensions_array]
#         business_dimensions = {dim["dimension_id"]: dim for dim in dimensions_array}
#     elif validator_data.get("business_dimensions", {}).get(file_key, {}):
#         # Old format: dictionary of dimensions
#         business_dimensions = validator_data.get("business_dimensions", {}).get(file_key, {})
#         available_dimension_ids = list(business_dimensions.keys())
#     else:
#         raise HTTPException(status_code=400, detail=f"No business dimensions defined for file key '{file_key}'. Define dimensions first.")

#     # Validate dimension IDs
#     invalid_dimensions = [dim_id for dim_id in assignments.keys() if dim_id not in available_dimension_ids]
#     if invalid_dimensions:
#         raise HTTPException(
#             status_code=400,
#             detail=f"Invalid dimension IDs: {invalid_dimensions}. Available dimensions: {available_dimension_ids}"
#         )

#     # ✅ Get available identifiers from MongoDB classification
#     mongo_classification = get_classification_from_mongo(validator_atom_id, file_key)
    
#     if mongo_classification:
#         classification_data = mongo_classification
#     elif validator_data.get("classification", {}).get(file_key, {}):
#         classification_data = validator_data.get("classification", {}).get(file_key, {})
#     else:
#         raise HTTPException(status_code=400, detail=f"No column classification found for file key '{file_key}'. Classify columns first.")

#     available_identifiers = classification_data.get("final_classification", {}).get("identifiers", [])
#     if not available_identifiers:
#         raise HTTPException(status_code=400, detail=f"No identifiers classified for file key '{file_key}'. Classify columns first.")

#     # Validate assignments
#     all_assigned_identifiers = []
#     for dim_id, identifiers in assignments.items():
#         if not isinstance(identifiers, list):
#             raise HTTPException(status_code=400, detail=f"Identifiers for dimension '{dim_id}' must be a list")
        
#         invalid_identifiers = [ident for ident in identifiers if ident not in available_identifiers]
#         if invalid_identifiers:
#             raise HTTPException(
#                 status_code=400,
#                 detail=f"Invalid identifiers for dimension '{dim_id}': {invalid_identifiers}. Available: {available_identifiers}"
#             )
#         all_assigned_identifiers.extend(identifiers)

#     # Check for unique assignment
#     if len(all_assigned_identifiers) != len(set(all_assigned_identifiers)):
#         duplicates = [ident for ident in set(all_assigned_identifiers) if all_assigned_identifiers.count(ident) > 1]
#         raise HTTPException(status_code=400, detail=f"Identifiers cannot be assigned to multiple dimensions: {duplicates}")

#     # ✅ UPDATE BUSINESS DIMENSIONS STRUCTURE WITH ASSIGNMENTS
#     updated_business_dimensions = business_dimensions.copy()
#     for dim_id, identifiers in assignments.items():
#         if dim_id in updated_business_dimensions:
#             updated_business_dimensions[dim_id]["assigned_identifiers"] = identifiers

#     # ✅ Save to MongoDB
#     mongo_result = update_business_dimensions_assignments_in_mongo(validator_atom_id, file_key, assignments)

#     # Update in memory
#     if "business_dimensions" not in extraction_results[validator_atom_id]:
#         extraction_results[validator_atom_id]["business_dimensions"] = {}
#     extraction_results[validator_atom_id]["business_dimensions"][file_key] = updated_business_dimensions

#     # Find unassigned identifiers
#     unassigned_identifiers = [ident for ident in available_identifiers if ident not in all_assigned_identifiers]

#     return {
#         "status": "success",
#         "message": f"Identifiers assigned to dimensions and saved in business dimensions structure for file key '{file_key}'",
#         "validator_atom_id": validator_atom_id,
#         "file_key": file_key,
#         "updated_business_dimensions": updated_business_dimensions,
#         "assignment_summary": {
#             "total_identifiers": len(available_identifiers),
#             "assigned_identifiers": len(all_assigned_identifiers),
#             "unassigned_identifiers": len(unassigned_identifiers)
#         },
#         "unassigned_identifiers": unassigned_identifiers,
#         "dimension_breakdown": {dim_id: len(identifiers) for dim_id, identifiers in assignments.items()},
#         "mongodb_updated": mongo_result["status"] == "success"
#     }

# POST: ASSIGN_IDENTIFIERS_TO_DIMENSIONS - Complete fixed version for both validator types
@router.post("/assign_identifiers_to_dimensions", response_model=AssignIdentifiersResponse)
async def assign_identifiers_to_dimensions(
    validator_atom_id: str = Form(...),
    file_key: str = Form(...),
    identifier_assignments: str = Form(...)
):
    """
    Assign identifiers to dimensions and save within business dimensions structure.
    Works for both regular validator atoms (from /create_new) and template validator atoms (from /validate_*)
    """
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

    # ✅ Check if validator atom exists (MongoDB first)
    validator_data = get_validator_atom_from_mongo(validator_atom_id)
    if not validator_data:
        # Fallback to old method for backward compatibility
        validator_data = get_validator_from_memory_or_disk(validator_atom_id)

    if not validator_data:
        raise HTTPException(status_code=404, detail=f"Validator atom '{validator_atom_id}' not found")

    # Check if file_key exists
    if file_key not in validator_data.get("schemas", {}):
        available_keys = list(validator_data.get("schemas", {}).keys())
        raise HTTPException(
            status_code=400, 
            detail=f"File key '{file_key}' not found in validator. Available file keys: {available_keys}"
        )

    # ✅ Get business dimensions from MongoDB first with correct structure handling
    mongo_dimensions = get_business_dimensions_from_mongo(validator_atom_id, file_key)

    if mongo_dimensions:
        # MongoDB format: extract from dimensions array
        dimensions_array = mongo_dimensions.get("dimensions", [])
        available_dimension_ids = [dim.get("dimension_id") for dim in dimensions_array]
        business_dimensions = {dim["dimension_id"]: dim for dim in dimensions_array}
    elif validator_data.get("business_dimensions", {}).get(file_key, {}):
        # Old format: dictionary of dimensions
        business_dimensions = validator_data.get("business_dimensions", {}).get(file_key, {})
        available_dimension_ids = list(business_dimensions.keys())
    else:
        raise HTTPException(
            status_code=400, 
            detail=f"No business dimensions defined for file key '{file_key}'. Define dimensions first using /define_dimensions."
        )

    # Validate dimension IDs
    invalid_dimensions = [dim_id for dim_id in assignments.keys() if dim_id not in available_dimension_ids]
    if invalid_dimensions:
        raise HTTPException(
            status_code=400,
            detail=f"Invalid dimension IDs: {invalid_dimensions}. Available dimensions: {available_dimension_ids}"
        )

    # ✅ Get available identifiers from MongoDB classification
    mongo_classification = get_classification_from_mongo(validator_atom_id, file_key)
    
    if mongo_classification:
        classification_data = mongo_classification
    elif validator_data.get("classification", {}).get(file_key, {}):
        classification_data = validator_data.get("classification", {}).get(file_key, {})
    else:
        raise HTTPException(
            status_code=400, 
            detail=f"No column classification found for file key '{file_key}'. Classify columns first using /classify_columns."
        )

    available_identifiers = classification_data.get("final_classification", {}).get("identifiers", [])
    if not available_identifiers:
        raise HTTPException(
            status_code=400, 
            detail=f"No identifiers classified for file key '{file_key}'. Classify columns first using /classify_columns."
        )

    # Validate assignments
    all_assigned_identifiers = []
    for dim_id, identifiers in assignments.items():
        if not isinstance(identifiers, list):
            raise HTTPException(status_code=400, detail=f"Identifiers for dimension '{dim_id}' must be a list")
        
        if not identifiers:
            raise HTTPException(status_code=400, detail=f"Identifiers list for dimension '{dim_id}' cannot be empty")
        
        invalid_identifiers = [ident for ident in identifiers if ident not in available_identifiers]
        if invalid_identifiers:
            raise HTTPException(
                status_code=400,
                detail=f"Invalid identifiers for dimension '{dim_id}': {invalid_identifiers}. Available: {available_identifiers}"
            )
        all_assigned_identifiers.extend(identifiers)

    # Check for unique assignment
    if len(all_assigned_identifiers) != len(set(all_assigned_identifiers)):
        duplicates = [ident for ident in set(all_assigned_identifiers) if all_assigned_identifiers.count(ident) > 1]
        raise HTTPException(status_code=400, detail=f"Identifiers cannot be assigned to multiple dimensions: {duplicates}")

    # ✅ UPDATE BUSINESS DIMENSIONS STRUCTURE WITH ASSIGNMENTS
    updated_business_dimensions = business_dimensions.copy()
    for dim_id, identifiers in assignments.items():
        if dim_id in updated_business_dimensions:
            updated_business_dimensions[dim_id]["assigned_identifiers"] = identifiers
            updated_business_dimensions[dim_id]["assignment_timestamp"] = datetime.now().isoformat()

    # ✅ Save to MongoDB
    try:
        mongo_result = update_business_dimensions_assignments_in_mongo(validator_atom_id, file_key, assignments)
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Failed to save assignments to MongoDB: {str(e)}")

    # ✅ FIXED: Safe update in memory (works for both validator types)
    try:
        # Initialize extraction_results entry if it doesn't exist (for template validator atoms)
        if validator_atom_id not in extraction_results:
            extraction_results[validator_atom_id] = {}
        
        if "business_dimensions" not in extraction_results[validator_atom_id]:
            extraction_results[validator_atom_id]["business_dimensions"] = {}
        
        extraction_results[validator_atom_id]["business_dimensions"][file_key] = updated_business_dimensions
        in_memory_status = "success"
    except Exception as e:
        # Log but don't fail - MongoDB save is what matters
        print(f"Warning: Could not update in-memory results for {validator_atom_id}: {e}")
        in_memory_status = "warning"

    # Find unassigned identifiers
    unassigned_identifiers = [ident for ident in available_identifiers if ident not in all_assigned_identifiers]

    return {
        "status": "success",
        "message": f"Identifiers assigned to dimensions and saved in business dimensions structure for file key '{file_key}'",
        "validator_atom_id": validator_atom_id,
        "file_key": file_key,
        "validator_type": validator_data.get("template_type", "custom"),
        "updated_business_dimensions": updated_business_dimensions,
        "assignment_summary": {
            "total_identifiers": len(available_identifiers),
            "assigned_identifiers": len(all_assigned_identifiers),
            "unassigned_identifiers": len(unassigned_identifiers),
            "dimensions_with_assignments": len(assignments),
            "assignment_timestamp": datetime.now().isoformat()
        },
        "unassigned_identifiers": unassigned_identifiers,
        "dimension_breakdown": {dim_id: len(identifiers) for dim_id, identifiers in assignments.items()},
        "mongodb_updated": mongo_result.get("status") == "success",
        "in_memory_updated": in_memory_status,
        "next_steps": {
            "view_complete_setup": f"GET /get_validator_atom_summary/{validator_atom_id}",
            "export_configuration": f"GET /export_validator_atom/{validator_atom_id}"
        }
    }



# Add this constant at the top of routes.py (after imports)
VALIDATION_OPERATORS = {
    "greater_than": ">",
    "greater_than_or_equal": ">=", 
    "less_than": "<",
    "less_than_or_equal": "<=",
    "equal_to": "==",
    "not_equal_to": "!=",
    "between": "BETWEEN",
    "contains": "CONTAINS",
    "not_contains": "NOT_CONTAINS",
    "starts_with": "STARTS_WITH",
    "ends_with": "ENDS_WITH",
    "regex_match": "REGEX",
    "in_list": "IN",
    "not_in_list": "NOT_IN",
    "date_before": "DATE_BEFORE",
    "date_after": "DATE_AFTER",
    "date_between": "DATE_BETWEEN"
}

# ✅ ADD: Valid frequency options
VALID_FREQUENCIES = ["daily", "weekly", "monthly"]

# Updated endpoint with data frequency per column support
@router.post("/configure_validation_config", response_model=ConfigureValidationConfigResponse)
async def configure_validation_config(request: Request):
    """
    Configure custom validation config for specific columns with optional date frequency per column
    """
    data = await request.json()
    validator_atom_id = data.get("validator_atom_id")
    file_key = data.get("file_key")
    column_conditions = data.get("column_conditions")
    column_frequencies = data.get("column_frequencies", {})  # ✅ NEW: Optional dict of column to frequency

    if not validator_atom_id:
        raise HTTPException(status_code=400, detail="validator_atom_id is required")
    if not file_key:
        raise HTTPException(status_code=400, detail="file_key is required")
    if column_conditions is None:
        raise HTTPException(status_code=400, detail="column_conditions is required")

    if not isinstance(column_conditions, dict):
        raise HTTPException(status_code=400, detail="column_conditions must be a dictionary of column to list of conditions")

    if not isinstance(column_frequencies, dict):
        raise HTTPException(status_code=400, detail="column_frequencies must be a dictionary of column to frequency strings")

    # ✅ NEW: Validate frequencies if provided
    for col, freq in column_frequencies.items():
        if freq.lower() not in VALID_FREQUENCIES:
            raise HTTPException(
                status_code=400,
                detail=f"Invalid frequency '{freq}' for column '{col}'. Valid options: {VALID_FREQUENCIES}"
            )

    validator_data = get_validator_atom_from_mongo(validator_atom_id)
    if not validator_data:
        validator_data = get_validator_from_memory_or_disk(validator_atom_id)

    if not validator_data:
        raise HTTPException(status_code=404, detail=f"Validator atom '{validator_atom_id}' not found")

    if file_key not in validator_data.get("schemas", {}):
        raise HTTPException(status_code=400, detail=f"File key '{file_key}' not found in validator")

    available_columns = [col["column"] for col in validator_data["schemas"][file_key].get("columns", [])]

    total_conditions = 0
    for col, cond_list in column_conditions.items():
        if col not in available_columns:
            raise HTTPException(
                status_code=400,
                detail=f"Column '{col}' not found in validator schema. Available columns: {available_columns}"
            )
        if not isinstance(cond_list, list):
            raise HTTPException(status_code=400, detail=f"Conditions for column '{col}' must be a list")
        
        for i, cond in enumerate(cond_list):
            if not isinstance(cond, dict):
                raise HTTPException(status_code=400, detail=f"Condition {i+1} for column '{col}' must be a dictionary")
            
            required_fields = ['operator', 'value', 'error_message']
            missing_fields = [field for field in required_fields if field not in cond]
            if missing_fields:
                raise HTTPException(
                    status_code=400,
                    detail=f"Condition {i+1} for column '{col}' missing required fields: {missing_fields}"
                )
            
            if cond['operator'] not in VALIDATION_OPERATORS:
                raise HTTPException(
                    status_code=400,
                    detail=f"Invalid operator '{cond['operator']}' for column '{col}'. Valid operators: {list(VALIDATION_OPERATORS.keys())}"
                )
            
            if 'severity' not in cond:
                cond['severity'] = 'error'
            
            if cond['severity'] not in ['error', 'warning']:
                raise HTTPException(
                    status_code=400,
                    detail=f"Invalid severity '{cond['severity']}' for column '{col}'. Must be 'error' or 'warning'"
                )
            
            total_conditions += 1

    # ✅ NEW: Build config data with optional column frequencies
    config_data = {
        "column_conditions": column_conditions,
        "column_frequencies": column_frequencies
    }

    mongo_result = save_validation_config_to_mongo(validator_atom_id, file_key, config_data)

    # Build validation units and save
    range_units = []
    for col, conds in column_conditions.items():
        min_val = None
        max_val = None
        for cond in conds:
            op = cond.get("operator")
            if op in ["greater_than_or_equal", "greater_than"]:
                min_val = cond.get("value")
            elif op in ["less_than_or_equal", "less_than"]:
                max_val = cond.get("value")
        if (min_val not in [None, ""] or max_val not in [None, ""]):
            range_units.append({
                "column": col,
                "validation_type": "range",
                "min": min_val,
                "max": max_val,
            })

    periodicity_units = [
        {
            "column": col,
            "validation_type": "periodicity",
            "periodicity": freq,
        }
        for col, freq in column_frequencies.items()
    ]

    existing_units = get_validation_units_from_mongo(validator_atom_id, file_key)
    other_units = []
    if existing_units and "validations" in existing_units:
        other_units = [
            u
            for u in existing_units["validations"]
            if u.get("validation_type") not in ["range", "periodicity"]
        ]
    save_validation_units_to_mongo(
        validator_atom_id,
        file_key,
        other_units + range_units + periodicity_units,
    )

    message = f"Validation config configured successfully for file key '{file_key}' with {total_conditions} conditions"
    if column_frequencies:
        message += f" and frequencies specified for columns: {list(column_frequencies.keys())}"

    return {
        "status": "success",
        "message": message,
        "validator_atom_id": validator_atom_id,
        "file_key": file_key,
        "mongo_id": mongo_result.get("mongo_id", ""),
        "operation": mongo_result.get("operation", "unknown"),
        "total_conditions": total_conditions,
        "columns_configured": list(column_conditions.keys()),
        "columns_with_frequencies": list(column_frequencies.keys()),  # ✅ NEW
        "mongodb_saved": mongo_result["status"] == "success"
    }




# POST: VALIDATE - Enhanced validation with auto-correction, custom conditions, and MongoDB logging
@router.post("/validate", response_model=ValidateResponse)
async def validate(
    validator_atom_id: str = Form(...),
    files: List[UploadFile] = File(...),
    file_keys: str = Form(...),
    date_frequency: str = Form(default=None)
):
    """
    Enhanced validation: mandatory columns + type check + auto-correction + custom conditions + MongoDB logging
    """
    try:
        keys = json.loads(file_keys)
    except json.JSONDecodeError:
        raise HTTPException(status_code=400, detail="Invalid JSON format for file_keys")
    
    if len(files) != len(keys):
        raise HTTPException(status_code=400, detail="Number of files must match number of keys")
    
    if len(files) > 3:
        raise HTTPException(status_code=400, detail="Maximum 3 files allowed")
    
    # ✅ Get validator atom data from MongoDB first
    validator_data = get_validator_atom_from_mongo(validator_atom_id)
    if not validator_data:
        # Fallback to old method for backward compatibility
        validator_data = get_validator_from_memory_or_disk(validator_atom_id)
    
    if not validator_data:
        raise HTTPException(status_code=404, detail=f"Validator atom '{validator_atom_id}' not found")
    
    # ✅ ADD: Pass validator_atom_id to validation function for custom conditions lookup
    validator_data["validator_atom_id"] = validator_atom_id
    
    # ✅ Column preprocessing function (same as create_new)
    def preprocess_column_name(col_name: str) -> str:
        """Preprocess column name: strip, lowercase, remove spaces but preserve underscores"""
        col_name = col_name.strip().lower()
        col_name = re.sub(r'(?<!_)\s+(?!_)', '', col_name)
        return col_name
    
    # ✅ Parse files and store content for MinIO
    files_data = []
    file_contents = []
    
    for file, key in zip(files, keys):
        try:
            content = await file.read()
            file_contents.append((content, file.filename, key))
            
            # Parse file based on extension
            if file.filename.lower().endswith(".csv"):
                df = pd.read_csv(io.BytesIO(content))
            elif file.filename.lower().endswith(".xlsx"):
                df = pd.read_excel(io.BytesIO(content))
            else:
                raise HTTPException(status_code=400, detail="Only CSV and XLSX files supported")
            
            # ✅ Preprocess columns (same logic as create_new)
            df.columns = [preprocess_column_name(col) for col in df.columns]
            files_data.append((key, df))
            
        except Exception as e:
            raise HTTPException(status_code=400, detail=f"Error parsing file {file.filename}: {str(e)}")
    
    # ✅ Enhanced validation with auto-correction and custom conditions
    validation_results = perform_enhanced_validation(files_data, validator_data)
    
    # ✅ MinIO upload: Only if validation passes or passes with warnings
    minio_uploads = []
    if validation_results["overall_status"] in ["passed", "passed_with_warnings"]:
        for content, filename, key in file_contents:
            upload_result = upload_to_minio(content, filename, validator_atom_id, key)
            minio_uploads.append({
                "file_key": key,
                "filename": filename,
                "minio_upload": upload_result
            })
    
    # ✅ Save detailed validation log to MongoDB
    validation_log_data = {
        "validator_atom_id": validator_atom_id,
        "files_validated": [
            {
                "file_key": key,
                "filename": next(f[1] for f in file_contents if f[2] == key),
                "file_size_bytes": len(next(f[0] for f in file_contents if f[2] == key)),
                "overall_status": validation_results["file_results"].get(key, {}).get("status", "unknown"),
                "errors": validation_results["file_results"].get(key, {}).get("errors", []),
                "warnings": validation_results["file_results"].get(key, {}).get("warnings", []),
                "auto_corrections": validation_results["file_results"].get(key, {}).get("auto_corrections", []),
                "condition_failures": validation_results["file_results"].get(key, {}).get("condition_failures", []),  # ✅ ADD
                "columns_checked": validation_results["file_results"].get(key, {}).get("columns_checked", 0),
                "data_corrections_applied": validation_results["file_results"].get(key, {}).get("data_corrections_applied", 0),
                "custom_conditions_failed": validation_results["file_results"].get(key, {}).get("custom_conditions_failed", 0),  # ✅ ADD
                "validation_duration_ms": 0  # Will implement timing later
            }
            for key in keys
        ],
        "overall_status": validation_results["overall_status"],
        "total_files": len(keys),
        "total_duration_ms": 0,  # Will implement timing later
        "minio_uploads": minio_uploads,
        "summary_stats": {
            "total_auto_corrections": validation_results["summary"].get("total_auto_corrections", 0),
            "total_condition_failures": validation_results["summary"].get("total_condition_failures", 0),  # ✅ ADD
            "total_errors": sum(len(result.get("errors", [])) for result in validation_results["file_results"].values()),
            "total_warnings": sum(len(result.get("warnings", [])) for result in validation_results["file_results"].values())
        }
    }
    
    # ✅ Save to MongoDB validation logs collection
    mongo_log_result = save_validation_log_to_mongo(validation_log_data)

    return {
        "overall_status": validation_results["overall_status"],
        "validator_atom_id": validator_atom_id,
        "file_validation_results": validation_results["file_results"],
        "summary": validation_results["summary"],
        "minio_uploads": minio_uploads,
        "validation_log_saved": mongo_log_result["status"] == "success",
        "validation_log_id": mongo_log_result.get("mongo_id", ""),
        "total_auto_corrections": validation_results["summary"].get("total_auto_corrections", 0),
        "total_condition_failures": validation_results["summary"].get("total_condition_failures", 0)  # ✅ ADD
    }

    
    



# DELETE: DELETE_VALIDATOR_ATOM - Delete a custom validator atom completely
@router.delete("/delete_validator_atom/{validator_atom_id}")
async def delete_validator_atom(validator_atom_id: str):
    """
    Delete a custom validator atom completely
    - Removes from custom_validations folder
    - Removes from mongodb folder (all related files)
    - Clears from memory
    """
    
    def delete_validator_atom_files(validator_atom_id: str):
        """Delete all files related to a validator atom from disk and memory"""
        # Paths
        custom_dir = Path("custom_validations")
        mongo_dir = Path("mongodb")
        deleted_files = []

        # Delete from custom_validations
        custom_file = custom_dir / f"{validator_atom_id}.json"
        if custom_file.exists():
            custom_file.unlink()
            deleted_files.append(str(custom_file))

        # Delete from mongodb folder - classification, dimensions, assignments
        for suffix in ["classification", "business_dimensions", "identifier_assignments"]:
            mongo_file = mongo_dir / f"{validator_atom_id}_{suffix}.json"
            if mongo_file.exists():
                mongo_file.unlink()
                deleted_files.append(str(mongo_file))

        # Clear from memory
        if validator_atom_id in extraction_results:
            del extraction_results[validator_atom_id]
            deleted_files.append("memory_cleared")

        return deleted_files
    
    # Validate validator_atom_id
    if not validator_atom_id or not validator_atom_id.strip():
        raise HTTPException(status_code=400, detail="validator_atom_id cannot be empty")
    
    # Check if validator atom exists
    validator_exists = False
    custom_file = CUSTOM_CONFIG_DIR / f"{validator_atom_id}.json"
    mongo_classification = MONGODB_DIR / f"{validator_atom_id}_classification.json"
    mongo_dimensions = MONGODB_DIR / f"{validator_atom_id}_business_dimensions.json"
    mongo_assignments = MONGODB_DIR / f"{validator_atom_id}_identifier_assignments.json"
    
    if (custom_file.exists() or 
        mongo_classification.exists() or 
        mongo_dimensions.exists() or 
        mongo_assignments.exists() or 
        validator_atom_id in extraction_results):
        validator_exists = True
    
    if not validator_exists:
        raise HTTPException(status_code=404, detail=f"Validator atom '{validator_atom_id}' not found")
    
    # Delete all files and clear memory
    try:
        deleted_files = delete_validator_atom_files(validator_atom_id)
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Error deleting validator atom: {str(e)}")
    
    return {
        "status": "success",
        "message": f"Validator atom '{validator_atom_id}' deleted completely",
        "validator_atom_id": validator_atom_id,
        "deleted_files": deleted_files,
        "deletion_summary": {
            "custom_validations_removed": any("custom_validations" in f for f in deleted_files),
            "mongodb_files_removed": any("mongodb" in f for f in deleted_files),
            "memory_cleared": "memory_cleared" in deleted_files,
            "total_files_deleted": len([f for f in deleted_files if f != "memory_cleared"])
        }
    }


# GET: GET_VALIDATOR_CONFIG - return validator setup with MongoDB details
@router.get("/get_validator_config/{validator_atom_id}")
async def get_validator_config(validator_atom_id: str):
    """Retrieve stored validator atom configuration along with any
    classification or dimension information."""

    validator_data = get_validator_atom_from_mongo(validator_atom_id)
    if not validator_data:
        validator_data = get_validator_from_memory_or_disk(validator_atom_id)

    if not validator_data:
        raise HTTPException(status_code=404, detail=f"Validator atom '{validator_atom_id}' not found")

    extra = load_all_non_validation_data(validator_atom_id)

    validations = {}
    for key in validator_data.get("file_keys", []):
        units = get_validation_units_from_mongo(validator_atom_id, key)
        if units:
            validations[key] = units.get("validations", [])

    return {**validator_data, **extra, "validations": validations}


############################prebuild

# # ✅ UPDATED: Complete MMM Validation Endpoint with MinIO Upload
# @router.post("/validate_mmm")
# async def validate_mmm_endpoint(
#     files: List[UploadFile] = File(...),
#     file_keys: str = Form(...)
# ):
#     """
#     Validate files using MMM (Media Mix Modeling) validation rules and save to MinIO if passed.
#     Requires both 'media' and 'sales' datasets.
#     """
#     try:
#         keys = json.loads(file_keys)
#     except json.JSONDecodeError:
#         raise HTTPException(status_code=400, detail="Invalid JSON format for file_keys")
    
#     if len(files) != len(keys):
#         raise HTTPException(status_code=400, detail="Number of files must match number of keys")
    
#     if len(files) != 2:
#         raise HTTPException(status_code=400, detail="MMM validation requires exactly 2 files: media and sales")
    
#     # ✅ FIXED: Column preprocessing function that matches MMM validation expectations
#     def preprocess_column_name(col_name: str) -> str:
#         """Preprocess column name: strip, lowercase, replace spaces with underscores"""
#         col_name = col_name.strip().lower()
#         col_name = col_name.replace(' ', '_').replace('-', '_').replace('__', '_')
#         col_name = col_name.strip('_')  # Remove leading/trailing underscores
#         return col_name
    
#     # Parse files and store data
#     files_data = {}
#     file_contents = []
    
#     for file, key in zip(files, keys):
#         try:
#             content = await file.read()
#             file_contents.append((content, file.filename, key))
            
#             # Parse file based on extension
#             if file.filename.lower().endswith(".csv"):
#                 df = pd.read_csv(io.BytesIO(content))
#             elif file.filename.lower().endswith(".xlsx"):
#                 df = pd.read_excel(io.BytesIO(content))
#             else:
#                 raise HTTPException(status_code=400, detail="Only CSV and XLSX files supported")
            
#             # ✅ FIXED: Preprocess columns to match MMM validation expectations
#             df.columns = [preprocess_column_name(col) for col in df.columns]
#             files_data[key] = df
            
#         except Exception as e:
#             raise HTTPException(status_code=400, detail=f"Error parsing file {file.filename}: {str(e)}")
    
#     # Check required keys
#     if 'media' not in files_data or 'sales' not in files_data:
#         available_keys = list(files_data.keys())
#         raise HTTPException(
#             status_code=400, 
#             detail=f"MMM validation requires 'media' and 'sales' file keys. Found: {available_keys}"
#         )
    
#     media_df = files_data['media']
#     sales_df = files_data['sales']
    
#     # Validate that datasets are not empty
#     if media_df.empty:
#         raise HTTPException(status_code=400, detail="Media dataset is empty")
#     if sales_df.empty:
#         raise HTTPException(status_code=400, detail="Sales dataset is empty")
    
#     try:
#         # Call MMM validation
#         validation_report = validate_mmm(media_df, sales_df)
        
#         # ✅ NEW: Auto-generate validator_atom_id for MMM
#         from datetime import datetime
#         timestamp = datetime.now().strftime("%Y%m%d_%H%M%S")
#         validator_atom_id = f"mmm_template_{timestamp}"
        
#         # ✅ NEW: MinIO upload if validation passes
#         minio_uploads = []
#         mongo_log_result = {"status": "skipped", "reason": "validation_failed"}
        
#         if validation_report.status == "success":
#             for content, filename, key in file_contents:
#                 upload_result = upload_to_minio(content, filename, validator_atom_id, key)
#                 minio_uploads.append({
#                     "file_key": key,
#                     "filename": filename,
#                     "minio_upload": upload_result
#                 })
            
#             # ✅ NEW: Save validation log to MongoDB
#             validation_log_data = {
#                 "validator_atom_id": validator_atom_id,
#                 "validation_type": "mmm_template",
#                 "files_validated": [
#                     {
#                         "file_key": key,
#                         "filename": next(f[1] for f in file_contents if f[2] == key),
#                         "file_size_bytes": len(next(f[0] for f in file_contents if f[2] == key)),
#                         "overall_status": "passed",
#                         "records_count": len(files_data[key]),
#                         "columns_found": list(files_data[key].columns),
#                         "validation_duration_ms": 0
#                     }
#                     for key in keys
#                 ],
#                 "overall_status": "passed",
#                 "total_files": len(keys),
#                 "minio_uploads": minio_uploads,
#                 "timestamp": datetime.now().isoformat(),
#                 "summary_stats": {
#                     "media_records": len(media_df),
#                     "sales_records": len(sales_df),
#                     "total_validation_checks": len(validation_report.results)
#                 }
#             }
#             mongo_log_result = save_validation_log_to_mongo(validation_log_data)
        
#         # Build detailed response
#         validation_results = {
#             "overall_status": "passed" if validation_report.status == "success" else "failed",
#             "validation_type": "mmm_template",
#             "file_results": {
#                 "media": {
#                     "status": "passed" if not validation_report.has_failures("media") else "failed",
#                     "errors": validation_report.get_failures("media"),
#                     "warnings": validation_report.get_warnings("media"),
#                     "successes": validation_report.get_successes("media"),
#                     "columns_checked": len(media_df.columns),
#                     "records_count": len(media_df),
#                     "columns_found": list(media_df.columns)
#                 },
#                 "sales": {
#                     "status": "passed" if not validation_report.has_failures("sales") else "failed", 
#                     "errors": validation_report.get_failures("sales"),
#                     "warnings": validation_report.get_warnings("sales"),
#                     "successes": validation_report.get_successes("sales"),
#                     "columns_checked": len(sales_df.columns),
#                     "records_count": len(sales_df),
#                     "columns_found": list(sales_df.columns)
#                 }
#             },
#             "summary": {
#                 "total_files": 2,
#                 "media_records": len(media_df),
#                 "sales_records": len(sales_df),
#                 "validation_checks_performed": len(validation_report.results)
#             },
#             "mmm_specific_validations": {
#                 "media_columns_validated": len([col for col in media_df.columns if col in validation_report.media_rules["required"]]),
#                 "sales_columns_validated": len([col for col in sales_df.columns if col in validation_report.sales_rules["required"]])
#             }
#         }
        
#         return {
#             "overall_status": validation_results["overall_status"],
#             "validation_type": "mmm_template",
#             "validator_atom_id": validator_atom_id,  # ✅ NEW
#             "file_validation_results": validation_results["file_results"],
#             "summary": validation_results["summary"],
#             "mmm_specific_results": validation_results["mmm_specific_validations"],
#             "minio_uploads": minio_uploads,  # ✅ NEW
#             "validation_log_saved": mongo_log_result.get("status") == "success",  # ✅ NEW
#             "validation_log_id": mongo_log_result.get("mongo_id", ""),  # ✅ NEW
#             "files_processed": {
#                 "media": {
#                     "filename": file_contents[0][1] if len(file_contents) > 0 else "unknown",
#                     "size_bytes": len(file_contents[0][0]) if len(file_contents) > 0 else 0
#                 },
#                 "sales": {
#                     "filename": file_contents[1][1] if len(file_contents) > 1 else "unknown", 
#                     "size_bytes": len(file_contents[1][0]) if len(file_contents) > 1 else 0
#                 }
#             },
#             "debug_info": {
#                 "media_columns_after_preprocessing": list(media_df.columns),
#                 "sales_columns_after_preprocessing": list(sales_df.columns),
#                 "validation_results_count": len(validation_report.results)
#             }
#         }
        
#     except Exception as e:
#         raise HTTPException(status_code=500, detail=f"MMM validation failed: {str(e)}")

# ✅ UPDATED: Complete MMM Validation Endpoint with Full Integration
@router.post("/validate_mmm")
async def validate_mmm_endpoint(
    files: List[UploadFile] = File(...),
    file_keys: str = Form(...)
):
    """
    Validate files using MMM (Media Mix Modeling) validation rules and save to MinIO if passed.
    Requires both 'media' and 'sales' datasets.
    Includes validator atom schema saving for classification workflow.
    """
    try:
        keys = json.loads(file_keys)
    except json.JSONDecodeError:
        raise HTTPException(status_code=400, detail="Invalid JSON format for file_keys")
    
    if len(files) != len(keys):
        raise HTTPException(status_code=400, detail="Number of files must match number of keys")
    
    if len(files) != 2:
        raise HTTPException(status_code=400, detail="MMM validation requires exactly 2 files: media and sales")
    
    # ✅ FIXED: Column preprocessing function that matches MMM validation expectations
    def preprocess_column_name(col_name: str) -> str:
        """Preprocess column name: strip, lowercase, replace spaces with underscores"""
        col_name = col_name.strip().lower()
        col_name = col_name.replace(' ', '_').replace('-', '_').replace('__', '_')
        col_name = col_name.strip('_')  # Remove leading/trailing underscores
        return col_name
    
    # Parse files and store data
    files_data = {}
    file_contents = []
    
    for file, key in zip(files, keys):
        try:
            content = await file.read()
            file_contents.append((content, file.filename, key))
            
            # Parse file based on extension
            if file.filename.lower().endswith(".csv"):
                df = pd.read_csv(io.BytesIO(content))
            elif file.filename.lower().endswith(".xlsx"):
                df = pd.read_excel(io.BytesIO(content))
            else:
                raise HTTPException(status_code=400, detail="Only CSV and XLSX files supported")
            
            # ✅ FIXED: Preprocess columns to match MMM validation expectations
            df.columns = [preprocess_column_name(col) for col in df.columns]
            files_data[key] = df
            
        except Exception as e:
            raise HTTPException(status_code=400, detail=f"Error parsing file {file.filename}: {str(e)}")
    
    # Check required keys
    if 'media' not in files_data or 'sales' not in files_data:
        available_keys = list(files_data.keys())
        raise HTTPException(
            status_code=400, 
            detail=f"MMM validation requires 'media' and 'sales' file keys. Found: {available_keys}"
        )
    
    media_df = files_data['media']
    sales_df = files_data['sales']
    
    # Validate that datasets are not empty
    if media_df.empty:
        raise HTTPException(status_code=400, detail="Media dataset is empty")
    if sales_df.empty:
        raise HTTPException(status_code=400, detail="Sales dataset is empty")
    
    try:
        # Call MMM validation
        validation_report = validate_mmm(media_df, sales_df)
        
        # ✅ NEW: Auto-generate validator_atom_id for MMM
        from datetime import datetime
        timestamp = datetime.now().strftime("%Y%m%d_%H%M%S")
        validator_atom_id = f"mmm_template_{timestamp}"
        
        # ✅ NEW: MinIO upload and validator atom schema saving if validation passes
        minio_uploads = []
        mongo_log_result = {"status": "skipped", "reason": "validation_failed"}
        validator_atom_result = {"status": "skipped", "reason": "validation_failed"}
        
        if validation_report.status == "success":
            for content, filename, key in file_contents:
                upload_result = upload_to_minio(content, filename, validator_atom_id, key)
                minio_uploads.append({
                    "file_key": key,
                    "filename": filename,
                    "minio_upload": upload_result
                })
            
            # ✅ NEW: Save validator atom schema to MongoDB for classification
            validator_atom_schema = {
                "_id": validator_atom_id,
                "validator_atom_id": validator_atom_id,
                "template_type": "mmm_template",
                "schemas": {
                    key: {
                        "columns": [{"column": col} for col in files_data[key].columns],
                        "column_types": {
                            col: "numeric" if pd.api.types.is_numeric_dtype(files_data[key][col]) 
                                 else "datetime" if pd.api.types.is_datetime64_any_dtype(files_data[key][col])
                                 else "string"
                            for col in files_data[key].columns
                        },
                        "template_type": "mmm_template"
                    }
                    for key in keys  # Creates schema for both media and sales
                },
                "created_at": datetime.now().isoformat(),
                "template_generated": True
            }
            
            # Save validator atom schema
            validator_atom_result = save_validator_atom_to_mongo(validator_atom_id, validator_atom_schema)
            
            # ✅ NEW: Save validation log to MongoDB
            validation_log_data = {
                "validator_atom_id": validator_atom_id,
                "validation_type": "mmm_template",
                "files_validated": [
                    {
                        "file_key": key,
                        "filename": next(f[1] for f in file_contents if f[2] == key),
                        "file_size_bytes": len(next(f[0] for f in file_contents if f[2] == key)),
                        "overall_status": "passed",
                        "records_count": len(files_data[key]),
                        "columns_found": list(files_data[key].columns),
                        "validation_duration_ms": 0
                    }
                    for key in keys
                ],
                "overall_status": "passed",
                "total_files": len(keys),
                "minio_uploads": minio_uploads,
                "timestamp": datetime.now().isoformat(),
                "summary_stats": {
                    "media_records": len(media_df),
                    "sales_records": len(sales_df),
                    "total_validation_checks": len(validation_report.results)
                }
            }
            mongo_log_result = save_validation_log_to_mongo(validation_log_data)
        
        # Build detailed response
        validation_results = {
            "overall_status": "passed" if validation_report.status == "success" else "failed",
            "validation_type": "mmm_template",
            "file_results": {
                "media": {
                    "status": "passed" if not validation_report.has_failures("media") else "failed",
                    "errors": validation_report.get_failures("media"),
                    "warnings": validation_report.get_warnings("media"),
                    "successes": validation_report.get_successes("media"),
                    "columns_checked": len(media_df.columns),
                    "records_count": len(media_df),
                    "columns_found": list(media_df.columns)
                },
                "sales": {
                    "status": "passed" if not validation_report.has_failures("sales") else "failed", 
                    "errors": validation_report.get_failures("sales"),
                    "warnings": validation_report.get_warnings("sales"),
                    "successes": validation_report.get_successes("sales"),
                    "columns_checked": len(sales_df.columns),
                    "records_count": len(sales_df),
                    "columns_found": list(sales_df.columns)
                }
            },
            "summary": {
                "total_files": 2,
                "media_records": len(media_df),
                "sales_records": len(sales_df),
                "validation_checks_performed": len(validation_report.results)
            },
            "mmm_specific_validations": {
                "media_columns_validated": len([col for col in media_df.columns if col in validation_report.media_rules["required"]]),
                "sales_columns_validated": len([col for col in sales_df.columns if col in validation_report.sales_rules["required"]])
            }
        }
        
        return {
            "overall_status": validation_results["overall_status"],
            "validation_type": "mmm_template",
            "validator_atom_id": validator_atom_id,
            "file_validation_results": validation_results["file_results"],
            "summary": validation_results["summary"],
            "mmm_specific_results": validation_results["mmm_specific_validations"],
            "minio_uploads": minio_uploads,
            "validation_log_saved": mongo_log_result.get("status") == "success",
            "validation_log_id": mongo_log_result.get("mongo_id", ""),
            # ✅ NEW: Template integration section
            "template_integration": {
                "validator_atom_saved": validator_atom_result.get("status") == "success" if validation_report.status == "success" else False,
                "classify_columns_ready": True if validation_report.status == "success" else False,
                "available_file_keys": keys if validation_report.status == "success" else [],
                "next_steps": {
                    "classification_media": f"POST /classify_columns with validator_atom_id: {validator_atom_id}, file_key: media",
                    "classification_sales": f"POST /classify_columns with validator_atom_id: {validator_atom_id}, file_key: sales",
                    "dimensions_media": f"POST /define_dimensions with validator_atom_id: {validator_atom_id}, file_key: media",
                    "dimensions_sales": f"POST /define_dimensions with validator_atom_id: {validator_atom_id}, file_key: sales"
                } if validation_report.status == "success" else {}
            },
            "files_processed": {
                "media": {
                    "filename": file_contents[0][1] if len(file_contents) > 0 else "unknown",
                    "size_bytes": len(file_contents[0][0]) if len(file_contents) > 0 else 0
                },
                "sales": {
                    "filename": file_contents[1][1] if len(file_contents) > 1 else "unknown", 
                    "size_bytes": len(file_contents[1][0]) if len(file_contents) > 1 else 0
                }
            },
        }
        
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"MMM validation failed: {str(e)}")


# # ✅ UPDATED: Category Forecasting Validation Endpoint with MinIO Upload
# @router.post("/validate_category_forecasting")
# async def validate_category_forecasting_endpoint(
#     files: List[UploadFile] = File(...),
#     file_keys: str = Form(...),
#     date_col: str = Form(default="Date"),
#     fiscal_start_month: int = Form(default=4)
# ):
#     """
#     Validate files using Category Forecasting validation rules and save to MinIO if passed.
#     Requires one file with category forecasting data.
#     """
#     try:
#         keys = json.loads(file_keys)
#     except json.JSONDecodeError:
#         raise HTTPException(status_code=400, detail="Invalid JSON format for file_keys")
    
#     if len(files) != len(keys):
#         raise HTTPException(status_code=400, detail="Number of files must match number of keys")
    
#     if len(files) != 1:
#         raise HTTPException(status_code=400, detail="Category Forecasting validation requires exactly 1 file")
    
#     # Column preprocessing function
#     def preprocess_column_name(col_name: str) -> str:
#         """Preprocess column name: strip, lowercase, minimal processing for CF"""
#         col_name = col_name.strip()
#         return col_name
    
#     # Parse file
#     file = files[0]
#     key = keys[0]
    
#     try:
#         content = await file.read()
        
#         # Parse file based on extension
#         if file.filename.lower().endswith(".csv"):
#             df = pd.read_csv(io.BytesIO(content))
#         elif file.filename.lower().endswith(".xlsx"):
#             df = pd.read_excel(io.BytesIO(content))
#         else:
#             raise HTTPException(status_code=400, detail="Only CSV and XLSX files supported")
        
#         # Light preprocessing (CF validation handles most column standardization)
#         df.columns = [preprocess_column_name(col) for col in df.columns]
        
#     except Exception as e:
#         raise HTTPException(status_code=400, detail=f"Error parsing file {file.filename}: {str(e)}")
    
#     # Validate that dataset is not empty
#     if df.empty:
#         raise HTTPException(status_code=400, detail="Dataset is empty")
    
#     try:
#         # Call Category Forecasting validation
#         validation_report = validate_category_forecasting(
#             df, 
#             date_col=date_col, 
#             fiscal_start_month=fiscal_start_month
#         )
        
#         # ✅ NEW: Auto-generate validator_atom_id for Category Forecasting
#         from datetime import datetime
#         timestamp = datetime.now().strftime("%Y%m%d_%H%M%S")
#         validator_atom_id = f"category_forecasting_template_{timestamp}"
        
#         # ✅ NEW: MinIO upload if validation passes
#         minio_uploads = []
#         mongo_log_result = {"status": "skipped", "reason": "validation_failed"}
        
#         if validation_report.status == "success":
#             upload_result = upload_to_minio(content, file.filename, validator_atom_id, key)
#             minio_uploads.append({
#                 "file_key": key,
#                 "filename": file.filename,
#                 "minio_upload": upload_result
#             })
            
#             # ✅ NEW: Save validation log to MongoDB
#             validation_log_data = {
#                 "validator_atom_id": validator_atom_id,
#                 "validation_type": "category_forecasting_template",
#                 "files_validated": [{
#                     "file_key": key,
#                     "filename": file.filename,
#                     "file_size_bytes": len(content),
#                     "overall_status": "passed",
#                     "date_column_used": date_col,
#                     "fiscal_start_month": fiscal_start_month,
#                     "records_count": len(df),
#                     "columns_found": list(df.columns),
#                     "validation_duration_ms": 0
#                 }],
#                 "overall_status": "passed",
#                 "total_files": 1,
#                 "minio_uploads": minio_uploads,
#                 "timestamp": datetime.now().isoformat(),
#                 "summary_stats": {
#                     "total_records": len(df),
#                     "total_columns": len(df.columns),
#                     "validation_checks": len(validation_report.results)
#                 }
#             }
#             mongo_log_result = save_validation_log_to_mongo(validation_log_data)
        
#         # Build response
#         return {
#             "overall_status": "passed" if validation_report.status == "success" else "failed",
#             "validation_type": "category_forecasting_template",
#             "validator_atom_id": validator_atom_id,  # ✅ NEW
#             "file_validation_results": {
#                 key: {
#                     "status": "passed" if not validation_report.has_failures() else "failed",
#                     "errors": validation_report.get_failures(),
#                     "warnings": validation_report.get_warnings(),
#                     "successes": validation_report.get_successes(),
#                     "columns_checked": len(df.columns),
#                     "records_count": len(df),
#                     "columns_found": list(df.columns)
#                 }
#             },
#             "summary": {
#                 "total_files": 1,
#                 "records_processed": len(df),
#                 "columns_processed": len(df.columns),
#                 "validation_checks_performed": len(validation_report.results),
#                 "date_column_used": date_col,
#                 "fiscal_start_month": fiscal_start_month
#             },
#             "category_forecasting_specific_results": {
#                 "date_column_validation": any("date" in r["check"] for r in validation_report.results),
#                 "dimension_columns_found": len([r for r in validation_report.results if "dimension" in r["check"] and r["status"] == "passed"]),
#                 "fiscal_year_handling": any("fiscal" in r["check"] for r in validation_report.results)
#             },
#             "minio_uploads": minio_uploads,  # ✅ NEW
#             "validation_log_saved": mongo_log_result.get("status") == "success",  # ✅ NEW
#             "validation_log_id": mongo_log_result.get("mongo_id", ""),  # ✅ NEW
#             "files_processed": {
#                 key: {
#                     "filename": file.filename,
#                     "size_bytes": len(content)
#                 }
#             }
#         }
        
#     except Exception as e:
#         raise HTTPException(status_code=500, detail=f"Category Forecasting validation failed: {str(e)}")



# ✅ UPDATED: Complete Category Forecasting Validation Endpoint with Full Integration
@router.post("/validate_category_forecasting")
async def validate_category_forecasting_endpoint(
    files: List[UploadFile] = File(...),
    file_keys: str = Form(...),
    date_col: str = Form(default="Date"),
    fiscal_start_month: int = Form(default=4)
):
    """
    Validate files using Category Forecasting validation rules and save to MinIO if passed.
    Requires one file with category forecasting data.
    Includes validator atom schema saving for classification workflow.
    """
    try:
        keys = json.loads(file_keys)
    except json.JSONDecodeError:
        raise HTTPException(status_code=400, detail="Invalid JSON format for file_keys")
    
    if len(files) != len(keys):
        raise HTTPException(status_code=400, detail="Number of files must match number of keys")
    
    if len(files) != 1:
        raise HTTPException(status_code=400, detail="Category Forecasting validation requires exactly 1 file")
    
    # Column preprocessing function
    def preprocess_column_name(col_name: str) -> str:
        """Preprocess column name: strip, lowercase, minimal processing for CF"""
        col_name = col_name.strip()
        return col_name
    
    # Parse file
    file = files[0]
    key = keys[0]
    
    try:
        content = await file.read()
        
        # Parse file based on extension
        if file.filename.lower().endswith(".csv"):
            df = pd.read_csv(io.BytesIO(content))
        elif file.filename.lower().endswith(".xlsx"):
            df = pd.read_excel(io.BytesIO(content))
        else:
            raise HTTPException(status_code=400, detail="Only CSV and XLSX files supported")
        
        # Light preprocessing (CF validation handles most column standardization)
        df.columns = [preprocess_column_name(col) for col in df.columns]
        
    except Exception as e:
        raise HTTPException(status_code=400, detail=f"Error parsing file {file.filename}: {str(e)}")
    
    # Validate that dataset is not empty
    if df.empty:
        raise HTTPException(status_code=400, detail="Dataset is empty")
    
    try:
        # Call Category Forecasting validation
        validation_report = validate_category_forecasting(
            df, 
            date_col=date_col, 
            fiscal_start_month=fiscal_start_month
        )
        
        # ✅ NEW: Auto-generate validator_atom_id for Category Forecasting
        from datetime import datetime
        timestamp = datetime.now().strftime("%Y%m%d_%H%M%S")
        validator_atom_id = f"category_forecasting_template_{timestamp}"
        
        # ✅ NEW: MinIO upload and validator atom schema saving if validation passes
        minio_uploads = []
        mongo_log_result = {"status": "skipped", "reason": "validation_failed"}
        validator_atom_result = {"status": "skipped", "reason": "validation_failed"}
        
        if validation_report.status == "success":
            upload_result = upload_to_minio(content, file.filename, validator_atom_id, key)
            minio_uploads.append({
                "file_key": key,
                "filename": file.filename,
                "minio_upload": upload_result
            })
            
            # ✅ NEW: Save validator atom schema to MongoDB for classification
            validator_atom_schema = {
                "_id": validator_atom_id,
                "validator_atom_id": validator_atom_id,
                "template_type": "category_forecasting_template",
                "schemas": {
                    key: {
                        "columns": [{"column": col} for col in df.columns],
                        "column_types": {
                            col: "numeric" if pd.api.types.is_numeric_dtype(df[col]) 
                                 else "datetime" if pd.api.types.is_datetime64_any_dtype(df[col])
                                 else "string"
                            for col in df.columns
                        },
                        "template_type": "category_forecasting_template"
                    }
                },
                "created_at": datetime.now().isoformat(),
                "template_generated": True
            }
            
            # Save validator atom schema
            validator_atom_result = save_validator_atom_to_mongo(validator_atom_id, validator_atom_schema)
            
            # ✅ NEW: Save validation log to MongoDB
            validation_log_data = {
                "validator_atom_id": validator_atom_id,
                "validation_type": "category_forecasting_template",
                "files_validated": [{
                    "file_key": key,
                    "filename": file.filename,
                    "file_size_bytes": len(content),
                    "overall_status": "passed",
                    "date_column_used": date_col,
                    "fiscal_start_month": fiscal_start_month,
                    "records_count": len(df),
                    "columns_found": list(df.columns),
                    "validation_duration_ms": 0
                }],
                "overall_status": "passed",
                "total_files": 1,
                "minio_uploads": minio_uploads,
                "timestamp": datetime.now().isoformat(),
                "summary_stats": {
                    "total_records": len(df),
                    "total_columns": len(df.columns),
                    "validation_checks": len(validation_report.results)
                }
            }
            mongo_log_result = save_validation_log_to_mongo(validation_log_data)
        
        # Build response
        return {
            "overall_status": "passed" if validation_report.status == "success" else "failed",
            "validation_type": "category_forecasting_template",
            "validator_atom_id": validator_atom_id,
            "file_validation_results": {
                key: {
                    "status": "passed" if not validation_report.has_failures() else "failed",
                    "errors": validation_report.get_failures(),
                    "warnings": validation_report.get_warnings(),
                    "successes": validation_report.get_successes(),
                    "columns_checked": len(df.columns),
                    "records_count": len(df),
                    "columns_found": list(df.columns)
                }
            },
            "summary": {
                "total_files": 1,
                "records_processed": len(df),
                "columns_processed": len(df.columns),
                "validation_checks_performed": len(validation_report.results),
                "date_column_used": date_col,
                "fiscal_start_month": fiscal_start_month
            },
            "category_forecasting_specific_results": {
                "date_column_validation": any("date" in r["check"] for r in validation_report.results),
                "dimension_columns_found": len([r for r in validation_report.results if "dimension" in r["check"] and r["status"] == "passed"]),
                "fiscal_year_handling": any("fiscal" in r["check"] for r in validation_report.results)
            },
            "minio_uploads": minio_uploads,
            "validation_log_saved": mongo_log_result.get("status") == "success",
            "validation_log_id": mongo_log_result.get("mongo_id", ""),
            # ✅ NEW: Template integration section
            "template_integration": {
                "validator_atom_saved": validator_atom_result.get("status") == "success" if validation_report.status == "success" else False,
                "classify_columns_ready": True if validation_report.status == "success" else False,
                "available_file_keys": [key] if validation_report.status == "success" else [],
                "next_steps": {
                    "classification": f"POST /classify_columns with validator_atom_id: {validator_atom_id}",
                    "dimensions": f"POST /define_dimensions with validator_atom_id: {validator_atom_id}"
                } if validation_report.status == "success" else {}
            },
            "files_processed": {
                key: {
                    "filename": file.filename,
                    "size_bytes": len(content)
                }
            },
            # ✅ NEW: Debug info for troubleshooting
            "debug_info": {
                "columns_after_preprocessing": list(df.columns),
                "validation_results_count": len(validation_report.results)
            }
        }
        
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Category Forecasting validation failed: {str(e)}")





# ✅ UPDATED: Complete Promo Validation Endpoint with MinIO Upload
@router.post("/validate_promo")
async def validate_promo_endpoint(
    files: List[UploadFile] = File(...),
    file_keys: str = Form(...)
):
    """
    Validate files using Promo Intensity validation rules and save to MinIO if passed.
    Requires one file with promotional data.
    """
    try:
        keys = json.loads(file_keys)
    except json.JSONDecodeError:
        raise HTTPException(status_code=400, detail="Invalid JSON format for file_keys")
    
    if len(files) != len(keys):
        raise HTTPException(status_code=400, detail="Number of files must match number of keys")
    
    if len(files) != 1:
        raise HTTPException(status_code=400, detail="Promo validation requires exactly 1 file")
    
    # Column preprocessing function
    def preprocess_column_name(col_name: str) -> str:
        """Preprocess column name: strip, minimal processing for Promo"""
        col_name = col_name.strip()
        return col_name
    
    # Parse file
    file = files[0]
    key = keys[0]
    
    try:
        content = await file.read()
        
        # Parse file based on extension
        if file.filename.lower().endswith(".csv"):
            df = pd.read_csv(io.BytesIO(content))
        elif file.filename.lower().endswith(".xlsx"):
            df = pd.read_excel(io.BytesIO(content))
        else:
            raise HTTPException(status_code=400, detail="Only CSV and XLSX files supported")
        
        # Light preprocessing (Promo validation handles column standardization)
        df.columns = [preprocess_column_name(col) for col in df.columns]
        
    except Exception as e:
        raise HTTPException(status_code=400, detail=f"Error parsing file {file.filename}: {str(e)}")
    
    # Validate that dataset is not empty
    if df.empty:
        raise HTTPException(status_code=400, detail="Dataset is empty")
    
    try:
        # Call Promo validation
        validation_report = validate_promo_intensity(df)
        
        # ✅ NEW: Auto-generate validator_atom_id for Promo
        from datetime import datetime
        timestamp = datetime.now().strftime("%Y%m%d_%H%M%S")
        validator_atom_id = f"promo_template_{timestamp}"
        
        # ✅ NEW: MinIO upload if validation passes
        minio_uploads = []
        mongo_log_result = {"status": "skipped", "reason": "validation_failed"}
        
        if validation_report.status == "success":
            upload_result = upload_to_minio(content, file.filename, validator_atom_id, key)
            minio_uploads.append({
                "file_key": key,
                "filename": file.filename,
                "minio_upload": upload_result
            })
            
            
            # ✅ ADD THIS: Save validator atom schema to MongoDB for classification
            # ✅ CORRECT: Use the actual key from file_keys
            validator_atom_schema = {
                "_id": validator_atom_id,
                "validator_atom_id": validator_atom_id,
                "template_type": "promo_template",
                "schemas": {
                    key: {  # ✅ Use the actual key variable (which should be "promo")
                        "columns": [{"column": col} for col in df.columns],
                        "column_types": {
                            col: "numeric" if pd.api.types.is_numeric_dtype(df[col]) 
                                else "datetime" if pd.api.types.is_datetime64_any_dtype(df[col])
                                else "string"
                            for col in df.columns
                        },
                        "template_type": "promo_template"
                    }
                },
                "created_at": datetime.now().isoformat(),
                "template_generated": True
            }
            
            validator_atom_result = save_validator_atom_to_mongo(validator_atom_id, validator_atom_schema)
            
            
            # ✅ NEW: Save validation log to MongoDB
            validation_log_data = {
                "validator_atom_id": validator_atom_id,
                "validation_type": "promo_template",
                "files_validated": [{
                    "file_key": key,
                    "filename": file.filename,
                    "file_size_bytes": len(content),
                    "overall_status": "passed",
                    "records_count": len(df),
                    "columns_found": list(df.columns),
                    "validation_duration_ms": 0
                }],
                "overall_status": "passed",
                "total_files": 1,
                "minio_uploads": minio_uploads,
                "timestamp": datetime.now().isoformat(),
                "summary_stats": {
                    "total_records": len(df),
                    "total_columns": len(df.columns),
                    "validation_checks": len(validation_report.results)
                }
            }
            mongo_log_result = save_validation_log_to_mongo(validation_log_data)
        
        # Build response
        return {
            "overall_status": "passed" if validation_report.status == "success" else "failed",
            "validation_type": "promo_template",
            "validator_atom_id": validator_atom_id,  # ✅ NEW
            "file_validation_results": {
                key: {
                    "status": "passed" if not validation_report.has_failures() else "failed",
                    "errors": validation_report.get_failures(),
                    "warnings": validation_report.get_warnings(),
                    "successes": validation_report.get_successes(),
                    "columns_checked": len(df.columns),
                    "records_count": len(df),
                    "columns_found": list(df.columns)
                }
            },
            "summary": {
                "total_files": 1,
                "records_processed": len(df),
                "columns_processed": len(df.columns),
                "validation_checks_performed": len(validation_report.results)
            },
            "promo_specific_results": {
                "required_columns_validated": len([r for r in validation_report.results if "required" in r["check"]]),
                "time_granularity_detected": any("granularity" in r["check"] for r in validation_report.results),
                "promotion_indicators_found": len([r for r in validation_report.results if "promotion_indicator" in r["check"] and r["status"] == "passed"]),
                "price_columns_validated": len([r for r in validation_report.results if "price" in r["check"] or "Price" in r["check"]]),
                "aggregator_columns_found": len([r for r in validation_report.results if "aggregator" in r["check"] and r["status"] == "passed"])
            },
            "minio_uploads": minio_uploads,  # ✅ NEW
            "validation_log_saved": mongo_log_result.get("status") == "success",  # ✅ NEW
            "validation_log_id": mongo_log_result.get("mongo_id", ""),  # ✅ NEW
            "files_processed": {
                key: {
                    "filename": file.filename,
                    "size_bytes": len(content)
                }
            },
            "template_integration": {
                "validator_atom_saved": validator_atom_result.get("status") == "success" if validation_report.status == "success" else False,
                "classify_columns_ready": True if validation_report.status == "success" else False,
                "available_file_keys": [key] if validation_report.status == "success" else [],  # ✅ Use actual key
                "next_steps": {
                    "classification": f"POST /classify_columns with validator_atom_id: {validator_atom_id}",
                    "dimensions": f"POST /define_dimensions with validator_atom_id: {validator_atom_id}"
                } if validation_report.status == "success" else {}
            }

        }

        
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Promo validation failed: {str(e)}")


# Call this function when the module loads
load_existing_configs()


# --- New endpoints for saving and listing validated dataframes ---
@router.post("/save_dataframes")
async def save_dataframes(
    validator_atom_id: str = Form(...),
    files: List[UploadFile] = File(...),
    file_keys: str = Form(...)
):
    """Save validated dataframes to MinIO"""
    try:
        keys = json.loads(file_keys)
    except json.JSONDecodeError:
        raise HTTPException(status_code=400, detail="Invalid JSON format for file_keys")
    if len(files) != len(keys):
        raise HTTPException(status_code=400, detail="Number of files must match number of keys")

    uploads = []
    for file, key in zip(files, keys):
        content = await file.read()
        result = upload_to_minio(content, file.filename, validator_atom_id, key)
        uploads.append({"file_key": key, "filename": file.filename, "minio_upload": result})

    return {"minio_uploads": uploads}


@router.get("/list_saved_dataframes")
async def list_saved_dataframes():
    """List saved dataframes for the current project"""
    prefix = OBJECT_PREFIX
    try:
        objects = minio_client.list_objects(MINIO_BUCKET, prefix=prefix, recursive=True)
        files = []
        for obj in objects:
            try:
                minio_client.stat_object(MINIO_BUCKET, obj.object_name)
                files.append(obj.object_name)
            except S3Error as e:
                if getattr(e, "code", "") in {"NoSuchKey", "NoSuchBucket"}:
                    redis_client.delete(obj.object_name)
                    continue
                raise
        return {"files": files}
    except S3Error as e:
        if getattr(e, "code", "") == "NoSuchBucket":
            return {"files": []}
        raise HTTPException(status_code=500, detail=str(e))
    except Exception as e:
        raise HTTPException(status_code=400, detail=str(e))


@router.get("/download_dataframe")
async def download_dataframe(object_name: str):
    """Return a presigned URL to download a dataframe"""
    if not object_name.startswith(OBJECT_PREFIX):
        raise HTTPException(status_code=400, detail="Invalid object name")
    try:
        url = minio_client.presigned_get_object(MINIO_BUCKET, object_name)
        return {"url": url}
    except S3Error as e:
        if getattr(e, "code", "") in {"NoSuchKey", "NoSuchBucket"}:
            redis_client.delete(object_name)
            raise HTTPException(status_code=404, detail="File not found")
        raise HTTPException(status_code=500, detail=str(e))
    except Exception as e:
        raise HTTPException(status_code=400, detail=str(e))


@router.delete("/delete_dataframe")
async def delete_dataframe(object_name: str):
    """Delete a single saved dataframe"""
    if not object_name.startswith(OBJECT_PREFIX):
        raise HTTPException(status_code=400, detail="Invalid object name")
    try:
        try:
            minio_client.remove_object(MINIO_BUCKET, object_name)
        except S3Error as e:
            if getattr(e, "code", "") not in {"NoSuchKey", "NoSuchBucket"}:
                raise
        redis_client.delete(object_name)
        return {"deleted": object_name}
    except S3Error as e:
        raise HTTPException(status_code=500, detail=str(e))
    except Exception as e:
        raise HTTPException(status_code=400, detail=str(e))


@router.delete("/delete_all_dataframes")
async def delete_all_dataframes():
    """Delete all saved dataframes for the current project"""
    prefix = OBJECT_PREFIX
    deleted = []
    try:
        objects = minio_client.list_objects(MINIO_BUCKET, prefix=prefix, recursive=True)
        for obj in objects:
            try:
                minio_client.remove_object(MINIO_BUCKET, obj.object_name)
            except S3Error as e:
                if getattr(e, "code", "") not in {"NoSuchKey", "NoSuchBucket"}:
                    raise
            redis_client.delete(obj.object_name)
            deleted.append(obj.object_name)
        return {"deleted": deleted}
    except S3Error as e:
        if getattr(e, "code", "") == "NoSuchBucket":
            return {"deleted": []}
        raise HTTPException(status_code=500, detail=str(e))
    except Exception as e:
        raise HTTPException(status_code=400, detail=str(e))


@router.post("/rename_dataframe")
async def rename_dataframe(object_name: str = Form(...), new_filename: str = Form(...)):
    """Rename a saved dataframe"""
    if not object_name.startswith(OBJECT_PREFIX):
        raise HTTPException(status_code=400, detail="Invalid object name")
    new_object = f"{OBJECT_PREFIX}{new_filename}"
    try:
        minio_client.copy_object(MINIO_BUCKET, new_object, f"/{MINIO_BUCKET}/{object_name}")
        try:
            minio_client.remove_object(MINIO_BUCKET, object_name)
        except S3Error:
            pass
        content = redis_client.get(object_name)
        if content is not None:
            redis_client.setex(new_object, 3600, content)
            redis_client.delete(object_name)
        return {"old_name": object_name, "new_name": new_object}
    except S3Error as e:
        code = getattr(e, "code", "")
        if code in {"NoSuchKey", "NoSuchBucket"}:
            redis_client.delete(object_name)
            raise HTTPException(status_code=404, detail="File not found")
        raise HTTPException(status_code=500, detail=str(e))
    except Exception as e:
        raise HTTPException(status_code=400, detail=str(e))

