# app/routes.py - API Routes
from fastapi import APIRouter, HTTPException, File, Form, UploadFile, Query, Request, Response
from typing import List, Dict, Any
import json
import pandas as pd
import polars as pl
import io
import os
import openpyxl
import pyarrow as pa
from app.core.utils import get_env_vars
from pathlib import Path
import fastexcel

# Add this line with your other imports
from datetime import datetime, timezone
import logging


from app.features.data_upload_validate.app.validators.mmm import validate_mmm
from app.features.data_upload_validate.app.validators.category_forecasting import validate_category_forecasting
# Add this import at the top of your routes.py file
from app.features.data_upload_validate.app.validators.promo import validate_promo_intensity
# app/routes.py - Add this import
from app.features.data_upload_validate.app.schemas import (
    # Create validator schemas
    CreateValidatorResponse,

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
from app.features.data_upload_validate.app.database import get_validator_atom_from_mongo, update_validator_atom_in_mongo

from app.features.data_upload_validate.app.database import (
    save_business_dimensions_to_mongo,
    get_business_dimensions_from_mongo,
    update_business_dimensions_assignments_in_mongo,
    save_validation_units_to_mongo,
    get_validation_units_from_mongo,
)

from app.redis_cache import cache_master_config

import re

# Allowed characters for file keys (alphanumeric, underscores, hyphens, periods)
FILE_KEY_RE = re.compile(r"^[A-Za-z0-9_.-]+$")




from app.features.data_upload_validate.app.database import (
    get_validator_atom_from_mongo,  # Fallback function
    save_validation_log_to_mongo,
    log_operation_to_mongo,
    mark_operation_log_deleted,
)

# Add this import
from app.features.data_upload_validate.app.database import save_validator_atom_to_mongo


# Initialize router
router = APIRouter()

logger = logging.getLogger(__name__)





from app.features.data_upload_validate.app.validators.custom_validator import perform_enhanced_validation

# Config directory
CUSTOM_CONFIG_DIR = Path("custom_validations")
CUSTOM_CONFIG_DIR.mkdir(exist_ok=True)

# In-memory storage
extraction_results = {}

# Common Polars CSV options to improve schema inference on large files
CSV_READ_KWARGS = {
    "low_memory": True, 
    "infer_schema_length": 10_000,
    "encoding": "utf8-lossy"  # Handle all encodings gracefully (UTF-8, Latin-1, Windows-1252, etc.)
}

def _smart_csv_parse(content: bytes, csv_kwargs: dict) -> tuple[pl.DataFrame, list[str], dict]:
    """
    Smart CSV parsing that automatically detects and handles mixed data types.
    Returns DataFrame, list of warnings, and detailed metadata about data quality issues.
    """
    warnings = []
    metadata = {
        "mixed_dtype_columns": [],
        "encoding_used": "utf8-lossy",
        "parsing_method": "standard"
    }
    
    # Step 1: Try normal parsing first (FAST PATH)
    try:
        df = pl.read_csv(io.BytesIO(content), **csv_kwargs)
        return df, warnings, metadata
    except Exception as e1:
        error_msg = str(e1).lower()
        
        # Step 2: Quick check - if it's a mixed data type error, jump directly to ignore_errors
        if "could not parse" in error_msg and "as dtype" in error_msg:
            print(f"🔄 Mixed data type detected, using ignore_errors for fast handling...")
            try:
                kwargs_ignore = csv_kwargs.copy()
                kwargs_ignore["ignore_errors"] = True
                df = pl.read_csv(io.BytesIO(content), **kwargs_ignore)
                metadata["parsing_method"] = "ignore_errors"
                
                # Extract problematic column name from error message
                try:
                    import re
                    match = re.search(r"at column '([^']+)'", str(e1))
                    if match:
                        problematic_col = match.group(1)
                        metadata["mixed_dtype_columns"] = [problematic_col]
                        warnings.append(f"Detected mixed data types in column: {problematic_col}")
                        warnings.append("File may contain mixed numeric and text values - converted problematic data to preserve integrity")
                except:
                    warnings.append("Detected mixed data types - some problematic data was handled")
                
                return df, warnings, metadata
            except Exception as e2:
                print(f"❌ ignore_errors failed: {e2}")
        
        # Step 3: Final fallback - everything as strings (GUARANTEED TO WORK)
        try:
            print(f"🔄 Final fallback: Reading all columns as strings")
            kwargs_strings = {k: v for k, v in csv_kwargs.items() if k not in ["infer_schema_length"]}
            df = pl.read_csv(io.BytesIO(content), dtypes=pl.Utf8, **kwargs_strings)
            metadata["parsing_method"] = "all_strings"
            metadata["mixed_dtype_columns"] = []  # Can't determine specific columns
            warnings.append("All columns read as strings to handle data type conflicts")
            warnings.append("Please use Dataframe Operations atom to fix column data types if needed")
            return df, warnings, metadata
        except Exception as e3:
            print(f"❌ All parsing methods failed: {e3}")
            raise e1  # Re-raise original error


# Health check
@router.get("/health")
async def health_check():
    return {"status": "healthy", "message": "Validate Atom API is running"}

# app/routes.py - Add MinIO imports and configuration

from minio import Minio
from minio.error import S3Error
from app.features.cache_utils import get_feature_cache
from app.DataStorageRetrieval.db import (
    fetch_client_app_project,
    record_arrow_dataset,
    rename_arrow_dataset,
    delete_arrow_dataset,
    arrow_dataset_exists,
)
from app.DataStorageRetrieval.arrow_client import upload_dataframe
from app.DataStorageRetrieval.flight_registry import (
    set_ticket,
    get_ticket_by_key,
    get_latest_ticket_for_basename,
    get_original_csv,
    rename_arrow_object,
    remove_arrow_object,
    get_flight_path_for_csv,
    get_arrow_for_flight_path,
    CSV_TO_FLIGHT,
    FILEKEY_TO_CSV,
)
from app.DataStorageRetrieval.minio_utils import (
    ensure_minio_bucket,
    save_arrow_table,
    upload_to_minio,
    get_client,
    ARROW_DIR,
    get_arrow_dir,
)
from pathlib import Path
import asyncio
import os


redis_client = get_feature_cache()

# ✅ MINIO CONFIGURATION - values come from docker-compose/.env
# Default to the development MinIO service if not explicitly configured
MINIO_ENDPOINT = os.getenv("MINIO_ENDPOINT", "minio:9000")
MINIO_ACCESS_KEY = os.getenv("MINIO_ACCESS_KEY", "minio")
MINIO_SECRET_KEY = os.getenv("MINIO_SECRET_KEY", "minio123")
MINIO_BUCKET = os.getenv("MINIO_BUCKET", "trinity")


def _parse_numeric_id(value: str | int | None) -> int:
    """Return the numeric component of an ID string like "name_123"."""
    if value is None:
        return 0
    try:
        return int(str(value).split("_")[-1])
    except Exception:
        return 0

async def get_object_prefix(
    client_id: str = "",
    app_id: str = "",
    project_id: str = "",
    *,
    client_name: str = "",
    app_name: str = "",
    project_name: str = "",
    include_env: bool = False,
) -> str | tuple[str, dict[str, str], str]:
    """Return the MinIO prefix for the current client/app/project.

    When ``include_env`` is True a tuple of ``(prefix, env, source)`` is
    returned where ``source`` describes where the environment variables were
    loaded from.
    """
    USER_ID = _parse_numeric_id(os.getenv("USER_ID"))
    PROJECT_ID = _parse_numeric_id(project_id or os.getenv("PROJECT_ID", "0"))
    # If explicit names are provided, avoid using potentially stale identifier
    # values from ``os.environ``. This ensures that when the frontend sends the
    # current ``client_name/app_name/project_name`` combo, we resolve the
    # environment for that namespace rather than whatever IDs may have been set
    # previously.
    if client_name or app_name or project_name:
        client_id_env = client_id or ""
        app_id_env = app_id or ""
        project_id_env = project_id or ""
    else:
        client_id_env = client_id or os.getenv("CLIENT_ID", "")
        app_id_env = app_id or os.getenv("APP_ID", "")
        project_id_env = project_id or os.getenv("PROJECT_ID", "")

    # Resolve environment variables using ``get_env_vars`` which consults the
    # Redis cache keyed by ``<client>/<app>/<project>`` and falls back to
    # Postgres when missing.  This ensures we always load the latest names for
    # the currently selected namespace instead of defaulting to
    # ``default_client/default_app/default_project``.
    env: dict[str, str] = {}
    env_source = "unknown"
    fresh = await get_env_vars(
        client_id_env,
        app_id_env,
        project_id_env,
        client_name=client_name or os.getenv("CLIENT_NAME", ""),
        app_name=app_name or os.getenv("APP_NAME", ""),
        project_name=project_name or os.getenv("PROJECT_NAME", ""),
        use_cache=True,
        return_source=True,
    )
    if isinstance(fresh, tuple):
        env, env_source = fresh
    else:
        env, env_source = fresh, "unknown"

    print(f"🔧 fetched env {env} (source={env_source})")
    client = env.get("CLIENT_NAME", os.getenv("CLIENT_NAME", "default_client"))
    app = env.get("APP_NAME", os.getenv("APP_NAME", "default_app"))
    project = env.get("PROJECT_NAME", os.getenv("PROJECT_NAME", "default_project"))

    if PROJECT_ID and (client == "default_client" or app == "default_app" or project == "default_project"):
        try:
            client_db, app_db, project_db = await fetch_client_app_project(
                USER_ID if USER_ID else None, PROJECT_ID
            )
            client = client_db or client
            app = app_db or app
            project = project_db or project
        except Exception as exc:  # pragma: no cover - database unreachable
            print(f"⚠️ Failed to load names from DB: {exc}")

    os.environ["CLIENT_NAME"] = client
    os.environ["APP_NAME"] = app
    os.environ["PROJECT_NAME"] = project
    prefix = f"{client}/{app}/{project}/"
    print(
        f"📦 prefix {prefix} (CLIENT_ID={client_id or os.getenv('CLIENT_ID','')} APP_ID={app_id or os.getenv('APP_ID','')} PROJECT_ID={PROJECT_ID})"
    )
    if include_env:
        return prefix, env, env_source
    return prefix


def read_minio_object(object_name: str) -> bytes:
    """Read an object from MinIO and return its bytes."""
    client = get_client()
    response = client.get_object(MINIO_BUCKET, object_name)
    try:
        data = response.read()
    finally:
        try:
            response.close()
            response.release_conn()
        except Exception:
            pass
    return data


@router.get("/get_object_prefix")
async def get_object_prefix_endpoint(
    client_name: str = "",
    app_name: str = "",
    project_name: str = "",
) -> dict:
    """Expose ``get_object_prefix`` as an API endpoint.

    The endpoint resolves the MinIO prefix for the provided client/app/project
    combination. Environment variables are sourced from Redis when available
    and otherwise retrieved from Postgres' ``registry_environment`` table.
    """

    prefix, env, env_source = await get_object_prefix(
        client_name=client_name,
        app_name=app_name,
        project_name=project_name,
        include_env=True,
    )
    return {"prefix": prefix, "environment": env, "source": env_source}

# Initialize MinIO client
minio_client = get_client()
ensure_minio_bucket()

# MongoDB directory setup
MONGODB_DIR = Path("mongodb")
MONGODB_DIR.mkdir(exist_ok=True)

def save_non_validation_data(validator_atom_id: str, data_type: str, data: dict):
    """
    Save non-validation data to separate JSON files in mongodb folder
    data_type: 'business_dimensions', 'identifier_assignments'
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
    Returns: dict with business_dimensions and identifier_assignments
    """
    business_dimensions = load_non_validation_data(validator_atom_id, "business_dimensions")
    identifier_assignments = load_non_validation_data(validator_atom_id, "identifier_assignments")

    return {
        "business_dimensions": business_dimensions,
        "identifier_assignments": identifier_assignments,
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
                **non_validation_data  # Add business_dimensions, identifier_assignments
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
    - mongodb/: non-validation data (dimensions, assignments)
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
                print(f"   - Dimensions: {len(non_validation_data.get('business_dimensions', {}))}")
                print(f"   - Assignments: {len(non_validation_data.get('identifier_assignments', {}))}")
        except Exception as e:
            print(f"⚠️ Failed to load config {config_file}: {str(e)}")


# Upload arbitrary file to MinIO and return its path
@router.post("/upload-file")
async def upload_file(
    file: UploadFile = File(...),
    client_id: str = Form(""),
    app_id: str = Form(""),
    project_id: str = Form(""),
    client_name: str = Form(""),
    app_name: str = Form(""),
    project_name: str = Form("")
):
    if client_id:
        os.environ["CLIENT_ID"] = client_id
    if app_id:
        os.environ["APP_ID"] = app_id
    if project_id:
        os.environ["PROJECT_ID"] = project_id
    if client_name:
        os.environ["CLIENT_NAME"] = client_name
    if app_name:
        os.environ["APP_NAME"] = app_name
    if project_name:
        os.environ["PROJECT_NAME"] = project_name
    prefix = await get_object_prefix()
    ensure_minio_bucket()
    # Upload initial file to a temporary subfolder so it isn't exposed as a
    # saved dataframe until explicitly persisted via the save_dataframes
    # endpoint.
    tmp_prefix = prefix + "tmp/"
    content = await file.read()
    
    try:
        if file.filename.lower().endswith(".csv"):
            print(f"🔄 Processing CSV file: {file.filename}")
            print(f"📊 File size: {len(content)} bytes")
            print(f"📊 CSV_READ_KWARGS: {CSV_READ_KWARGS}")
            
            # Smart CSV parsing with automatic mixed data type detection
            df_pl, parsing_warnings, parsing_metadata = _smart_csv_parse(content, CSV_READ_KWARGS)
            
            # Report any warnings about data quality issues
            if parsing_warnings:
                print(f"⚠️ Data Quality Warnings:")
                for warning in parsing_warnings:
                    print(f"  - {warning}")
                    
            if parsing_metadata.get("mixed_dtype_columns"):
                print(f"🔍 Columns with mixed data types: {', '.join(parsing_metadata['mixed_dtype_columns'])}")
                    
            print(f"📊 DataFrame shape: {df_pl.shape}")
            print(f"📊 Sample data: {df_pl.head(2).to_dicts()}")
            
        elif file.filename.lower().endswith((".xls", ".xlsx")):
            print(f"🔄 Processing Excel file: {file.filename}")
            try:
                # First try with pandas, then convert to polars
                df_pandas = pd.read_excel(io.BytesIO(content))
                print(f"📊 Pandas DataFrame shape: {df_pandas.shape}")
                print(f"📊 Sample data types: {df_pandas.dtypes.to_dict()}")
                
                # Convert to polars with better type handling
                df_pl = pl.from_pandas(df_pandas)
                print(f"✅ Excel parsed successfully - Shape: {df_pl.shape}")
            except Exception as e1:
                print(f"❌ Standard Excel parsing failed: {e1}")
                try:
                    # Try with different pandas options
                    df_pandas = pd.read_excel(io.BytesIO(content), dtype=str)
                    print(f"📊 Reading as string types - Shape: {df_pandas.shape}")
                    df_pl = pl.from_pandas(df_pandas)
                    print(f"✅ Excel parsed as strings - Shape: {df_pl.shape}")
                except Exception as e2:
                    print(f"❌ String parsing also failed: {e2}")
                    raise e1  # Re-raise original error
        else:
            print(f"❌ Unsupported file type: {file.filename}")
            raise HTTPException(status_code=400, detail="Only CSV and XLSX files supported")
    except Exception as e:
        print(f"❌ Error parsing file {file.filename}: {str(e)}")
        print(f"📊 Error type: {type(e).__name__}")
        raise HTTPException(status_code=400, detail=f"Error parsing file {file.filename}: {str(e)}")

    print(f"🔄 Converting to Arrow format...")
    arrow_buf = io.BytesIO()
    df_pl.write_ipc(arrow_buf)
    arrow_name = Path(file.filename).stem + ".arrow"
    print(f"📊 Arrow file: {arrow_name}")
    print(f"📊 Arrow buffer size: {len(arrow_buf.getvalue())} bytes")
    
    # Store under temporary prefix to hide from list_saved_dataframes
    print(f"📤 Uploading to MinIO...")
    print(f"📊 MinIO prefix: {tmp_prefix}")
    result = upload_to_minio(arrow_buf.getvalue(), arrow_name, tmp_prefix)
    print(f"📊 MinIO result: {result}")
    
    if result.get("status") != "success":
        print(f"❌ MinIO upload failed: {result.get('error_message')}")
        raise HTTPException(status_code=500, detail=result.get("error_message", "Upload failed"))
    
    print(f"✅ Upload successful: {result['object_name']}")
    
    # Prepare response with warnings and metadata if any
    response = {
        "file_path": result["object_name"],
        "file_name": file.filename
    }
    
    if 'parsing_warnings' in locals() and parsing_warnings:
        response["warnings"] = parsing_warnings
        response["has_data_quality_issues"] = True
        
        if 'parsing_metadata' in locals() and parsing_metadata.get("mixed_dtype_columns"):
            mixed_cols = parsing_metadata["mixed_dtype_columns"]
            response["mixed_dtype_columns"] = mixed_cols
            response["mixed_dtype_count"] = len(mixed_cols)
            
            # Create user-friendly message
            if len(mixed_cols) > 0:
                col_list = ", ".join(mixed_cols[:5])  # Show first 5 columns
                if len(mixed_cols) > 5:
                    col_list += f" and {len(mixed_cols) - 5} more"
                    
                response["message"] = f"File '{file.filename}' has mixed data types in columns: {col_list}. This may lead to unstable results. Please use Dataframe Operations atom to fix column data types."
            else:
                response["message"] = "File uploaded successfully with data quality warnings. Some atoms may need data type conversion."
        else:
            response["message"] = "File uploaded successfully with data quality warnings. Some atoms may need data type conversion."
    else:
        response["message"] = "File uploaded successfully"
        response["has_data_quality_issues"] = False
    
    return response


@router.delete("/temp-uploads")
async def clear_temp_uploads(
    client_name: str = "",
    app_name: str = "",
    project_name: str = "",
):
    """Remove any temporary uploads for the given environment."""
    prefix, env, env_source = await get_object_prefix(
        client_name=client_name,
        app_name=app_name,
        project_name=project_name,
        include_env=True,
    )
    tmp_prefix = prefix + "tmp/"
    try:
        objects = list(
            minio_client.list_objects(MINIO_BUCKET, prefix=tmp_prefix, recursive=True)
        )
        for obj in objects:
            minio_client.remove_object(MINIO_BUCKET, obj.object_name)
        return {
            "deleted": len(objects),
            "prefix": tmp_prefix,
            "environment": env,
            "env_source": env_source,
        }
    except S3Error as e:
        return {
            "deleted": 0,
            "error": str(e),
            "prefix": tmp_prefix,
            "environment": env,
            "env_source": env_source,
        }


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

        # Parse file to DataFrame using Polars for efficient serialization
        try:
            if file.filename.lower().endswith(".csv"):
                df_pl = pl.read_csv(io.BytesIO(content), **CSV_READ_KWARGS)
            elif file.filename.lower().endswith((".xls", ".xlsx")):
                df_pl = pl.from_pandas(pd.read_excel(io.BytesIO(content)))
            else:
                raise HTTPException(status_code=400, detail="Only CSV and XLSX files supported")

            df = df_pl.to_pandas()

            # Attempt to convert object columns that look like dates or datetimes
            date_pat = re.compile(
                r"^(?:\d{4}[-/]\d{2}[-/]\d{2}|\d{2}[-/]\d{2}[-/]\d{4})(?:[ T]\d{2}:\d{2}:\d{2}(?:\.\d+)?)?$"
            )
            for col in df.columns:
                if df[col].dtype == object:
                    sample = df[col].dropna().astype(str).head(5)
                    if not sample.empty and all(date_pat.match(v.strip()) for v in sample):
                        parsed = pd.to_datetime(df[col], errors="coerce", infer_datetime_format=True)
                        if parsed.notna().sum() >= len(df[col]) * 0.8:
                            df[col] = parsed
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


#     # Check if validator atom exists (MongoDB first, then fallback)
#     validator_data = get_validator_atom_from_mongo(validator_atom_id)
#     if not validator_data:
#         # Fallback to old method for backward compatibility
#         validator_data = get_validator_from_memory_or_disk(validator_atom_id)

#     if not validator_data:
#         raise HTTPException(status_code=404, detail=f"Validator atom '{validator_atom_id}' not found")




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

    # Validate assignments
    all_assigned_identifiers = []
    for dim_id, identifiers in assignments.items():
        if not isinstance(identifiers, list):
            raise HTTPException(status_code=400, detail=f"Identifiers for dimension '{dim_id}' must be a list")
        
        if not identifiers:
            raise HTTPException(status_code=400, detail=f"Identifiers list for dimension '{dim_id}' cannot be empty")
        
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

    # In this simplified version identifiers are not validated,
    # so all provided identifiers are considered assigned
    unassigned_identifiers: list = []

    return {
        "status": "success",
        "message": f"Identifiers assigned to dimensions and saved in business dimensions structure for file key '{file_key}'",
        "validator_atom_id": validator_atom_id,
        "file_key": file_key,
        "validator_type": validator_data.get("template_type", "custom"),
        "updated_business_dimensions": updated_business_dimensions,
        "assignment_summary": {
            "total_identifiers": len(all_assigned_identifiers),
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
    regex_units = []
    null_units = []
    ref_units = []
    for col, conds in column_conditions.items():
        min_val = None
        max_val = None
        for cond in conds:
            op = cond.get("operator")
            if op in ["greater_than_or_equal", "greater_than"]:
                min_val = cond.get("value")
            elif op in ["less_than_or_equal", "less_than"]:
                max_val = cond.get("value")
            elif op == "regex_match":
                regex_units.append({
                    "column": col,
                    "validation_type": "regex",
                    "pattern": cond.get("value"),
                })
            elif op == "null_percentage":
                null_units.append({
                    "column": col,
                    "validation_type": "null_percentage",
                    "value": cond.get("value"),
                })
            elif op == "in_list":
                ref_units.append({
                    "column": col,
                    "validation_type": "in_list",
                    "value": cond.get("value"),
                })
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
            if u.get("validation_type")
            not in ["range", "periodicity", "regex", "null_percentage", "in_list"]
        ]
    save_validation_units_to_mongo(
        validator_atom_id,
        file_key,
        other_units
        + range_units
        + periodicity_units
        + regex_units
        + null_units
        + ref_units,
    )

    client_id = os.getenv("CLIENT_ID", "")
    app_id = os.getenv("APP_ID", "")
    project_id = os.getenv("PROJECT_ID", "")
    cache_master_config(client_id, app_id, project_id, file_key, config_data)
    print(
        f"📦 Stored in redis namespace {client_id}:{app_id}:{project_id}:{file_key}"
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
    files: List[UploadFile] | None = File(None),
    file_keys: str = Form(...),
    file_paths: str = Form(default=""),
    date_frequency: str = Form(default=None),
    user_id: str = Form(""),
    client_id: str = Form("")
):
    """
    Enhanced validation: mandatory columns + type check + auto-correction + custom conditions + MongoDB logging
    """
    try:
        keys = json.loads(file_keys)
    except json.JSONDecodeError:
        raise HTTPException(status_code=400, detail="Invalid JSON format for file_keys")
    if not isinstance(keys, list):
        raise HTTPException(status_code=400, detail="file_keys must be a JSON array")

    try:
        paths = json.loads(file_paths) if file_paths else []
    except json.JSONDecodeError:
        raise HTTPException(status_code=400, detail="Invalid JSON format for file_paths")

    files_list = files or []

    if files_list and len(files_list) != len(keys):
        raise HTTPException(status_code=400, detail="Number of files must match number of keys")
    if paths and len(paths) != len(keys):
        raise HTTPException(status_code=400, detail="Number of file paths must match number of keys")
    if not files_list and not paths:
        raise HTTPException(status_code=400, detail="No files or file paths provided")

    if len(set(keys)) != len(keys):
        raise HTTPException(status_code=400, detail="Duplicate file keys are not allowed")
    for k in keys:
        if not isinstance(k, str) or not k.strip() or not FILE_KEY_RE.match(k):
            raise HTTPException(status_code=400, detail=f"Malformed file key: {k}")

    if files_list and len(files_list) > 3:
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

    if files_list:
        for file, key in zip(files_list, keys):
            try:
                content = await file.read()
                size_bytes = len(content)

                if file.filename.lower().endswith(".csv"):
                    df_pl = pl.read_csv(io.BytesIO(content), **CSV_READ_KWARGS)
                elif file.filename.lower().endswith((".xls", ".xlsx")):
                    df_pl = pl.from_pandas(pd.read_excel(io.BytesIO(content)))
                elif file.filename.lower().endswith(".arrow"):
                    df_pl = pl.read_ipc(io.BytesIO(content))
                else:
                    raise HTTPException(status_code=400, detail="Only CSV, XLSX and Arrow files supported")
                df = df_pl.to_pandas()

                df.columns = [preprocess_column_name(col) for col in df.columns]
                files_data.append((key, df))
                file_contents.append((size_bytes, file.filename, key))
            except Exception as e:
                raise HTTPException(status_code=400, detail=f"Error parsing file {file.filename}: {str(e)}")
    else:
        for path, key in zip(paths, keys):
            try:
                data = read_minio_object(path)
                size_bytes = len(data)
                filename = Path(path).name
                if filename.lower().endswith(".csv"):
                    df_pl = pl.read_csv(io.BytesIO(data), **CSV_READ_KWARGS)
                elif filename.lower().endswith((".xls", ".xlsx")):
                    df_pl = pl.from_pandas(pd.read_excel(io.BytesIO(data)))
                elif filename.lower().endswith(".arrow"):
                    df_pl = pl.read_ipc(io.BytesIO(data))
                else:
                    raise HTTPException(status_code=400, detail="Only CSV, XLSX and Arrow files supported")
                df = df_pl.to_pandas()

                df.columns = [preprocess_column_name(col) for col in df.columns]
                files_data.append((key, df))
                file_contents.append((size_bytes, filename, key))
            except Exception as e:
                raise HTTPException(status_code=400, detail=f"Error parsing file {path}: {str(e)}")
    
    # ✅ Enhanced validation with auto-correction and custom conditions
    validation_results = perform_enhanced_validation(files_data, validator_data)
    
    # ✅ Upload to Flight server for immediate use if validation passes
    minio_uploads: list = []
    flight_uploads: list = []
    if validation_results["overall_status"] in ["passed", "passed_with_warnings"]:
        for (_, filename, key), (_, df) in zip(file_contents, files_data):
            arrow_file = get_arrow_dir() / f"{validator_atom_id}_{key}.arrow"
            print(f"📝 saving arrow {arrow_file}")
            save_arrow_table(df, arrow_file)

            flight_path = f"{validator_atom_id}/{key}"
            upload_dataframe(df, flight_path)
            flight_uploads.append({"file_key": key, "flight_path": flight_path})
    
    # ✅ Save detailed validation log to MongoDB
    validation_log_data = {
        "validator_atom_id": validator_atom_id,
        "files_validated": [
            {
                "file_key": key,
                "filename": next(f[1] for f in file_contents if f[2] == key),
                "file_size_bytes": next(f[0] for f in file_contents if f[2] == key),
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
    log_operation_to_mongo(
        user_id=user_id,
        client_id=client_id,
        validator_atom_id=validator_atom_id,
        operation="validate",
        details={"overall_status": validation_results["overall_status"]},
    )

    return {
        "overall_status": validation_results["overall_status"],
        "validator_atom_id": validator_atom_id,
        "file_validation_results": validation_results["file_results"],
        "summary": validation_results["summary"],
        "minio_uploads": minio_uploads,
        "flight_uploads": flight_uploads,
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

        # Delete from mongodb folder - dimensions, assignments
        for suffix in ["business_dimensions", "identifier_assignments"]:
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
    mongo_dimensions = MONGODB_DIR / f"{validator_atom_id}_business_dimensions.json"
    mongo_assignments = MONGODB_DIR / f"{validator_atom_id}_identifier_assignments.json"
    
    if (custom_file.exists() or
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
    dimension information."""

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
#             elif file.filename.lower().endswith((".xls", ".xlsx")):
#                 df = pl.read_excel(io.BytesIO(content))
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

            # Parse file based on extension using Polars, then convert to pandas
            if file.filename.lower().endswith(".csv"):
                df_pl = pl.read_csv(io.BytesIO(content), **CSV_READ_KWARGS)
            elif file.filename.lower().endswith((".xls", ".xlsx")):
                df_pl = pl.from_pandas(pd.read_excel(io.BytesIO(content)))
            else:
                raise HTTPException(status_code=400, detail="Only CSV and XLSX files supported")

            df = df_pl.to_pandas()

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
            prefix = await get_object_prefix()
            for content, filename, key in file_contents:
                upload_result = upload_to_minio(content, filename, prefix)
                minio_uploads.append({
                    "file_key": key,
                    "filename": filename,
                    "minio_upload": upload_result
                })
            
            # Save validator atom schema to MongoDB
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
                "available_file_keys": keys if validation_report.status == "success" else [],
                "next_steps": {
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
#         elif file.filename.lower().endswith((".xls", ".xlsx")):
#             df = pl.read_excel(io.BytesIO(content))
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
        
        # Parse file based on extension using Polars
        if file.filename.lower().endswith(".csv"):
            df_pl = pl.read_csv(io.BytesIO(content), **CSV_READ_KWARGS)
        elif file.filename.lower().endswith((".xls", ".xlsx")):
            df_pl = pl.from_pandas(pd.read_excel(io.BytesIO(content)))
        else:
            raise HTTPException(status_code=400, detail="Only CSV and XLSX files supported")

        df = df_pl.to_pandas()

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
            prefix = await get_object_prefix()
            upload_result = upload_to_minio(content, file.filename, prefix)
            minio_uploads.append({
                "file_key": key,
                "filename": file.filename,
                "minio_upload": upload_result
            })
            
            # Save validator atom schema to MongoDB
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
                "available_file_keys": [key] if validation_report.status == "success" else [],
                "next_steps": {
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
            df_pl = pl.read_csv(io.BytesIO(content), **CSV_READ_KWARGS)
        elif file.filename.lower().endswith((".xls", ".xlsx")):
            df_pl = pl.from_pandas(pd.read_excel(io.BytesIO(content)))
        else:
            raise HTTPException(status_code=400, detail="Only CSV and XLSX files supported")

        df = df_pl.to_pandas()

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
            prefix = await get_object_prefix()
            upload_result = upload_to_minio(content, file.filename, prefix)
            minio_uploads.append({
                "file_key": key,
                "filename": file.filename,
                "minio_upload": upload_result
            })
            
            
            # Save validator atom schema to MongoDB
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
                "available_file_keys": [key] if validation_report.status == "success" else [],
                "next_steps": {
                    "dimensions": f"POST /define_dimensions with validator_atom_id: {validator_atom_id}"
                } if validation_report.status == "success" else {}
            }

        }

        
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Promo validation failed: {str(e)}")


# Call this function when the module loads
load_existing_configs()


# --- New endpoints for saving and listing validated dataframes ---
# Accept both trailing and non-trailing slash variants and explicitly
# handle CORS preflight OPTIONS requests so browsers or proxies never
# receive a 405/500 before the actual POST is issued.
@router.options("/save_dataframes")
@router.options("/save_dataframes/")
async def save_dataframes_options() -> Response:
    return Response(status_code=204)

@router.post("/save_dataframes")
@router.post("/save_dataframes/")
async def save_dataframes(
    validator_atom_id: str = Form(...),
    files: List[UploadFile] | None = File(None),
    file_keys: str = Form(...),
    file_paths: str = Form(default=""),
    overwrite: bool = Form(False),
    client_id: str = Form(""),
    user_id: str = Form(""),
    app_id: str = Form(""),
    project_id: str = Form(""),
    client_name: str = Form(""),
    app_name: str = Form(""),
    project_name: str = Form(""),
    user_name: str = Form(""),
):
    """Save validated dataframes as Arrow tables and upload via Flight."""
    logger.info(
        "save_dataframes invoked", extra={
            "validator_atom_id": validator_atom_id,
            "overwrite": overwrite,
        }
    )
    logger.debug("raw file_keys=%s", file_keys)
    logger.debug("raw file_paths=%s", file_paths)

    # --- Parse and validate inputs -------------------------------------------------
    try:
        key_inputs = json.loads(file_keys) if file_keys else []
    except json.JSONDecodeError:
        logger.exception("Invalid JSON for file_keys")
        raise HTTPException(status_code=400, detail="Invalid JSON format for file_keys")
    if not isinstance(key_inputs, list):
        logger.error("file_keys not list: %s", type(key_inputs))
        raise HTTPException(status_code=400, detail="file_keys must be a JSON array")

    try:
        paths = json.loads(file_paths) if file_paths else []
    except json.JSONDecodeError:
        logger.exception("Invalid JSON for file_paths")
        raise HTTPException(status_code=400, detail="Invalid JSON format for file_paths")
    if paths and (
        not isinstance(paths, list)
        or any(not isinstance(p, str) or not p for p in paths)
    ):
        logger.error("file_paths malformed: %s", paths)
        raise HTTPException(
            status_code=400, detail="file_paths must be a JSON array of non-empty strings"
        )

    files_list = files or []
    source_count = len(files_list) if files_list else len(paths)
    if source_count == 0:
        logger.error("No files or file paths provided")
        raise HTTPException(status_code=400, detail="No files or file paths provided")

    # Fallback to filenames when keys are missing or empty
    fallback_names = (
        [f.filename for f in files_list]
        if files_list
        else [Path(p).name for p in paths]
    )
    if len(key_inputs) == 0:
        keys = fallback_names
    else:
        if len(key_inputs) != source_count:
            logger.error(
                "Mismatched file key count: %s keys for %s sources",
                len(key_inputs),
                source_count,
            )
            raise HTTPException(
                status_code=400,
                detail="Number of file keys must match number of files or paths",
            )
        keys = []
        for i, k in enumerate(key_inputs):
            if not isinstance(k, str) or not k.strip():
                k = fallback_names[i]
            keys.append(k)

    if len(set(keys)) != len(keys):
        logger.error("Duplicate file keys: %s", keys)
        raise HTTPException(status_code=400, detail="Duplicate file keys are not allowed")

    # Validate file key format
    for k in keys:
        if not FILE_KEY_RE.match(k):
            logger.error("Malformed file key: %s", k)
            raise HTTPException(
                status_code=400,
                detail=f"Malformed file key: {k}",
            )

    uploads = []
    flights = []
    if client_id:
        os.environ["CLIENT_ID"] = client_id
    if app_id:
        os.environ["APP_ID"] = app_id
    if project_id:
        os.environ["PROJECT_ID"] = project_id
    if client_name:
        os.environ["CLIENT_NAME"] = client_name
    if app_name:
        os.environ["APP_NAME"] = app_name
    if project_name:
        os.environ["PROJECT_NAME"] = project_name
    prefix = await get_object_prefix()
    numeric_pid = _parse_numeric_id(project_id or os.getenv("PROJECT_ID", "0"))
    print(f"📤 saving to prefix {prefix}")

    tmp_prefix = prefix + "tmp/"
    if files_list:
        iter_sources = [
            (k, f.filename, f.file, None) for k, f in zip(keys, files_list)
        ]
    else:
        iter_sources = []
        for k, p in zip(keys, paths):
            data = read_minio_object(p)
            iter_sources.append((k, Path(p).name, io.BytesIO(data), p))

    MAX_FILE_SIZE = 512 * 1024 * 1024  # 512 MB
    STATUS_TTL = 3600

    for key, filename, fileobj, orig_path in iter_sources:
        logger.info("Processing file %s with key %s", filename, key)
        progress_key = f"upload_status:{validator_atom_id}:{key}"
        redis_client.set(progress_key, "uploading", ex=STATUS_TTL)

        arrow_name = Path(filename).stem + ".arrow"
        exists = await arrow_dataset_exists(numeric_pid, validator_atom_id, filename)
        if exists and not overwrite:
            uploads.append({"file_key": key, "already_saved": True})
            flights.append({"file_key": key})
            redis_client.set(progress_key, "saved", ex=STATUS_TTL)
            continue

        fileobj.seek(0, os.SEEK_END)
        size = fileobj.tell()
        fileobj.seek(0)
        if size > MAX_FILE_SIZE:
            redis_client.set(progress_key, "rejected", ex=STATUS_TTL)
            raise HTTPException(status_code=413, detail=f"{filename} exceeds 512MB limit")

        redis_client.set(progress_key, "parsing", ex=STATUS_TTL)

        if filename.lower().endswith(".csv"):
            csv_path = getattr(fileobj, "name", None)
            if csv_path and os.path.exists(csv_path):
                reader = pl.read_csv_batched(
                    csv_path, batch_size=1_000_000, **CSV_READ_KWARGS
                )
                try:
                    first_chunk = next(reader)
                except StopIteration:
                    uploads.append(
                        {
                            "file_key": key,
                            "already_saved": False,
                            "error": "empty file",
                        }
                    )
                    flights.append({"file_key": key})
                    continue
                arrow_buf = io.BytesIO()
                # Use PyArrow conversion to avoid "string_view" byte-range errors
                first_arrow = first_chunk.to_arrow(use_pyarrow=True)
                with pa.ipc.new_file(arrow_buf, first_arrow.schema) as writer:
                    writer.write(first_arrow)
                    for chunk in reader:
                        writer.write(chunk.to_arrow(use_pyarrow=True))
                arrow_bytes = arrow_buf.getvalue()
                df_pl = None
            else:
                data_bytes = fileobj.read()
                df_pl = pl.read_csv(io.BytesIO(data_bytes), **CSV_READ_KWARGS)
                arrow_buf = io.BytesIO()
                df_pl.write_ipc(arrow_buf)
                arrow_bytes = arrow_buf.getvalue()
        elif filename.lower().endswith((".xls", ".xlsx")):
            data_bytes = fileobj.read()
            reader = fastexcel.read_excel(data_bytes)
            sheet = reader.load_sheet_by_idx(0)
            df_pl = sheet.to_polars()
            if df_pl.height == 0:
                uploads.append({"file_key": key, "already_saved": False, "error": "empty file"})
                flights.append({"file_key": key})
                continue
            arrow_buf = io.BytesIO()
            df_pl.write_ipc(arrow_buf)
            arrow_bytes = arrow_buf.getvalue()
        elif filename.lower().endswith(".arrow"):
            arrow_bytes = fileobj.read()
            df_pl = pl.read_ipc(io.BytesIO(arrow_bytes))
        else:
            raise HTTPException(status_code=400, detail="Unsupported file type")

        result = upload_to_minio(arrow_bytes, arrow_name, prefix)
        saved_name = Path(result.get("object_name", "")).name or arrow_name
        flight_path = f"{validator_atom_id}/{saved_name}"
        logger.info("Uploaded %s as %s", filename, result.get("object_name", ""))

        # If df_pl is None (chunked csv), upload via polars scan
        if filename.lower().endswith(".csv"):
            if df_pl is None:
                reader_for_flight = pl.read_ipc(io.BytesIO(arrow_bytes))
                upload_dataframe(reader_for_flight.to_pandas(), flight_path)
            else:
                upload_dataframe(df_pl.to_pandas(), flight_path)
        else:
            upload_dataframe(df_pl.to_pandas(), flight_path)

        set_ticket(
            key,
            result.get("object_name", ""),
            flight_path,
            filename,
        )
        redis_client.set(f"flight:{flight_path}", result.get("object_name", ""))

        await record_arrow_dataset(
            numeric_pid,
            validator_atom_id,
            key,
            result.get("object_name", ""),
            flight_path,
            filename,
        )

        redis_client.set(progress_key, "saved", ex=STATUS_TTL)
        # Remove temporary upload if it exists
        if orig_path and orig_path.startswith(tmp_prefix):
            try:
                minio_client.remove_object(MINIO_BUCKET, orig_path)
            except Exception:
                logger.warning("Failed to remove temp object %s", orig_path)

        uploads.append({
            "file_key": key,
            "filename": arrow_name,
            "minio_upload": result,
            "already_saved": False,
        })
        flights.append({"file_key": key, "flight_path": flight_path})

    env = {
        "CLIENT_NAME": os.getenv("CLIENT_NAME"),
        "APP_NAME": os.getenv("APP_NAME"),
        "PROJECT_NAME": os.getenv("PROJECT_NAME"),
    }
    logger.info("save_dataframes completed: %s files", len(uploads))
    log_operation_to_mongo(
        user_id=user_id,
        client_id=client_id,
        validator_atom_id=validator_atom_id,
        operation="save_dataframes",
        details={"files_saved": uploads, "prefix": prefix},
        user_name=user_name,
        client_name=client_name,
        app_id=app_id,
        app_name=app_name,
        project_id=project_id,
        project_name=project_name,
    )
    return {
        "minio_uploads": uploads,
        "flight_uploads": flights,
        "prefix": prefix,
        "environment": env,
    }


@router.get("/upload-status/{validator_atom_id}/{file_key}")
async def get_upload_status(validator_atom_id: str, file_key: str) -> dict:
    progress_key = f"upload_status:{validator_atom_id}:{file_key}"
    status = redis_client.get(progress_key)
    if isinstance(status, bytes):
        status = status.decode()
    return {"status": status}


_TIMESTAMP_PATTERN = re.compile(r"(\d{8})_(\d{6})")


def _normalize_datetime(value: datetime | None) -> datetime | None:
    if value is None:
        return None
    if not isinstance(value, datetime):
        return None
    if value.tzinfo is None:
        try:
            return value.replace(tzinfo=timezone.utc)
        except Exception:
            return value
    try:
        return value.astimezone(timezone.utc)
    except Exception:
        return value


def _extract_timestamp_from_string(value: str | None) -> datetime | None:
    if not value:
        return None
    match = _TIMESTAMP_PATTERN.search(Path(value).name)
    if not match:
        return None
    try:
        parsed = datetime.strptime(
            f"{match.group(1)}{match.group(2)}", "%Y%m%d%H%M%S"
        )
    except ValueError:
        return None
    return parsed.replace(tzinfo=timezone.utc)


def _stat_object_metadata(object_name: str) -> tuple[datetime | None, int | None]:
    try:
        stat = minio_client.stat_object(MINIO_BUCKET, object_name)
    except S3Error as exc:
        code = getattr(exc, "code", "")
        if code in {"NoSuchKey", "NoSuchBucket"}:
            return None, None
        logger.warning("stat_object failed for %s: %s", object_name, exc)
        return None, None
    except Exception as exc:
        logger.warning("stat_object error for %s: %s", object_name, exc)
        return None, None
    last_modified = _normalize_datetime(getattr(stat, "last_modified", None))
    size = getattr(stat, "size", None)
    return last_modified, size if isinstance(size, int) else None


def _choose_newest_candidate(
    current: dict[str, Any] | None, candidate: dict[str, Any]
) -> dict[str, Any]:
    if current is None:
        return candidate
    cand_ts = candidate.get("timestamp")
    curr_ts = current.get("timestamp")
    if cand_ts and curr_ts:
        if cand_ts > curr_ts:
            return candidate
        if cand_ts < curr_ts:
            return current
    elif cand_ts and not curr_ts:
        return candidate
    elif curr_ts and not cand_ts:
        return current
    cand_mod = candidate.get("last_modified")
    curr_mod = current.get("last_modified")
    if cand_mod and curr_mod:
        if cand_mod > curr_mod:
            return candidate
        if cand_mod < curr_mod:
            return current
    elif cand_mod and not curr_mod:
        return candidate
    elif curr_mod and not cand_mod:
        return current
    cand_priority = candidate.get("priority", 0)
    curr_priority = current.get("priority", 0)
    if cand_priority != curr_priority:
        return candidate if cand_priority > curr_priority else current
    cand_name = candidate.get("object_name", "")
    curr_name = current.get("object_name", "")
    return candidate if cand_name > curr_name else current


@router.get("/latest_project_dataframe")
async def latest_project_dataframe(
    client_name: str = "",
    app_name: str = "",
    project_name: str = "",
    client_id: str = "",
    app_id: str = "",
    project_id: str = "",
) -> dict[str, Any]:
    prefix, env, env_source = await get_object_prefix(
        client_id=client_id,
        app_id=app_id,
        project_id=project_id,
        client_name=client_name,
        app_name=app_name,
        project_name=project_name,
        include_env=True,
    )

    best: dict[str, Any] | None = None
    arrow_names: set[str] = set()
    arrow_names.update(name for name in CSV_TO_FLIGHT.keys() if isinstance(name, str))
    arrow_names.update(
        value for value in FILEKEY_TO_CSV.values() if isinstance(value, str)
    )

    for arrow_name in arrow_names:
        original = get_original_csv(arrow_name)
        if not arrow_name.startswith(prefix) and not (
            original and original.startswith(prefix)
        ):
            continue
        flight_path = CSV_TO_FLIGHT.get(arrow_name) or get_flight_path_for_csv(
            arrow_name
        )
        timestamp = _extract_timestamp_from_string(arrow_name) or _extract_timestamp_from_string(
            flight_path
        )
        last_modified, size = _stat_object_metadata(arrow_name)
        candidate = {
            "object_name": arrow_name,
            "csv_name": original or Path(arrow_name).name,
            "flight_path": flight_path,
            "timestamp": timestamp or last_modified,
            "last_modified": last_modified,
            "size": size,
            "priority": 2 if flight_path else 1,
            "source": "flight_registry" if flight_path else "registry",
        }
        best = _choose_newest_candidate(best, candidate)

    list_error: str | None = None
    objects: list[Any] = []
    try:
        objects = list(
            minio_client.list_objects(
                MINIO_BUCKET, prefix=prefix, recursive=True
            )
        )
    except S3Error as exc:
        if getattr(exc, "code", "") == "NoSuchBucket":
            objects = []
        else:
            list_error = str(exc)
            objects = []
    except Exception as exc:
        list_error = str(exc)
        objects = []

    tmp_prefix = prefix + "tmp/"
    for obj in objects:
        object_name = getattr(obj, "object_name", "")
        if not object_name.endswith(".arrow"):
            continue
        if object_name.startswith(tmp_prefix):
            continue
        last_modified = _normalize_datetime(getattr(obj, "last_modified", None))
        size = obj.size if isinstance(obj.size, int) else None
        flight_path = get_flight_path_for_csv(object_name)
        timestamp = _extract_timestamp_from_string(object_name) or _extract_timestamp_from_string(
            flight_path
        )
        candidate = {
            "object_name": object_name,
            "csv_name": get_original_csv(object_name) or Path(object_name).name,
            "flight_path": flight_path,
            "timestamp": timestamp or last_modified,
            "last_modified": last_modified,
            "size": size,
            "priority": 2 if flight_path else 1,
            "source": "minio_flight" if flight_path else "minio",
        }
        previous = best
        best = _choose_newest_candidate(best, candidate)
        if previous is best and best and best.get("object_name") == object_name:
            if best.get("last_modified") is None and last_modified:
                best["last_modified"] = last_modified
            if best.get("size") is None and size is not None:
                best["size"] = size
            if best.get("flight_path") is None and flight_path:
                best["flight_path"] = flight_path
            if best.get("csv_name") in (None, "", Path(object_name).name):
                original = get_original_csv(object_name)
                if original:
                    best["csv_name"] = original

    if best and (best.get("last_modified") is None or best.get("size") is None):
        stat_modified, stat_size = _stat_object_metadata(best["object_name"])
        if best.get("last_modified") is None and stat_modified:
            best["last_modified"] = stat_modified
        if best.get("size") is None and stat_size is not None:
            best["size"] = stat_size

    if best:
        logger.info(
            "latest_project_dataframe resolved %s via %s",
            best.get("object_name"),
            best.get("source"),
        )

    response: dict[str, Any] = {
        "bucket": MINIO_BUCKET,
        "prefix": prefix,
        "environment": env,
        "env_source": env_source,
    }
    if best:
        response["object_name"] = best.get("object_name")
        response["csv_name"] = best.get("csv_name") or Path(
            best["object_name"]
        ).name
        if best.get("flight_path"):
            response["flight_path"] = best.get("flight_path")
        if best.get("last_modified"):
            response["last_modified"] = best["last_modified"].isoformat()
        if best.get("timestamp"):
            response["timestamp"] = best["timestamp"].isoformat()
        if best.get("size") is not None:
            response["size"] = best.get("size")
        if best.get("source"):
            response["source"] = best.get("source")
    else:
        response["object_name"] = None
        if list_error:
            response["error"] = list_error

    return response


@router.get("/list_saved_dataframes")
async def list_saved_dataframes(
    client_name: str = "",
    app_name: str = "",
    project_name: str = "",
) -> dict:
    """List all objects stored under the client/app/project prefix.

    Previously this endpoint returned only the latest ``.arrow`` file for each
    dataset which meant any additional files or nested directories inside the
    user's namespace were ignored by the UI. The Saved DataFrames panel now
    expects a complete listing so it can render a tree view of folders and
    files. To support this we simply return every object MinIO reports for the
    resolved prefix.
    """

    prefix, env, env_source = await get_object_prefix(
        client_name=client_name,
        app_name=app_name,
        project_name=project_name,
        include_env=True,
    )

    try:
        print(
            f"🪣 listing from bucket '{MINIO_BUCKET}' prefix '{prefix}' (source={env_source})"
        )
        objects = list(
            minio_client.list_objects(
                MINIO_BUCKET, prefix=prefix, recursive=True
            )
        )
        tmp_prefix = prefix + "tmp/"
        files = []
        for obj in sorted(objects, key=lambda o: o.object_name):
            if not obj.object_name.endswith(".arrow"):
                continue
            if obj.object_name.startswith(tmp_prefix):
                continue
            last_modified = getattr(obj, "last_modified", None)
            if last_modified is not None:
                try:
                    modified_iso = last_modified.isoformat()
                except Exception:
                    modified_iso = None
            else:
                modified_iso = None
            entry = {
                "object_name": obj.object_name,
                "arrow_name": Path(obj.object_name).name,
                "csv_name": Path(obj.object_name).name,
            }
            if modified_iso:
                entry["last_modified"] = modified_iso
            size = getattr(obj, "size", None)
            if isinstance(size, int):
                entry["size"] = size
            files.append(entry)
        return {
            "bucket": MINIO_BUCKET,
            "prefix": prefix,
            "files": files,
            "environment": env,
            "env_source": env_source,
        }
    except S3Error as e:
        if getattr(e, "code", "") == "NoSuchBucket":
            return {
                "bucket": MINIO_BUCKET,
                "prefix": prefix,
                "files": [],
                "environment": env,
            }
        return {
            "bucket": MINIO_BUCKET,
            "prefix": prefix,
            "files": [],
            "error": str(e),
            "environment": env,
        }
    except Exception as e:  # pragma: no cover - unexpected error
        return {
            "bucket": MINIO_BUCKET,
            "prefix": prefix,
            "files": [],
            "error": str(e),
            "environment": env,
        }


@router.get("/latest_ticket/{file_key}")
async def latest_ticket(file_key: str):
    path, arrow_name = get_ticket_by_key(file_key)
    if path is None:
        path, arrow_name = get_latest_ticket_for_basename(file_key)
    if path is None:
        raise HTTPException(status_code=404, detail="Ticket not found")
    original = get_original_csv(arrow_name) or arrow_name
    return {
        "flight_path": path,
        "arrow_name": arrow_name,
        "csv_name": original,
    }


@router.get("/download_dataframe")
async def download_dataframe(object_name: str):
    """Return a presigned URL to download a dataframe"""
    prefix = await get_object_prefix()
    if not object_name.startswith(prefix):
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
    prefix = await get_object_prefix()
    if not object_name.startswith(prefix):
        raise HTTPException(status_code=400, detail="Invalid object name")
    csv_name = object_name.rsplit('.', 1)[0] + '.csv'
    try:
        try:
            minio_client.remove_object(MINIO_BUCKET, object_name)
        except S3Error as e:
            if getattr(e, "code", "") not in {"NoSuchKey", "NoSuchBucket"}:
                raise
        try:
            minio_client.remove_object(MINIO_BUCKET, csv_name)
        except S3Error as e:
            if getattr(e, "code", "") not in {"NoSuchKey", "NoSuchBucket"}:
                raise
        redis_client.delete(object_name)
        redis_client.delete(csv_name)
        remove_arrow_object(object_name)
        await delete_arrow_dataset(object_name)
        mark_operation_log_deleted(object_name)
        return {"deleted": object_name}
    except S3Error as e:
        raise HTTPException(status_code=500, detail=str(e))
    except Exception as e:
        raise HTTPException(status_code=400, detail=str(e))


@router.delete("/delete_all_dataframes")
async def delete_all_dataframes():
    """Delete all saved dataframes for the current project"""
    prefix = await get_object_prefix()
    deleted = []
    try:
        objects = list(minio_client.list_objects(MINIO_BUCKET, prefix=prefix, recursive=True))
        for obj in objects:
            obj_name = obj.object_name
            try:
                minio_client.remove_object(MINIO_BUCKET, obj_name)
            except S3Error as e:
                if getattr(e, "code", "") not in {"NoSuchKey", "NoSuchBucket"}:
                    raise
            redis_client.delete(obj_name)
            if obj_name.endswith('.arrow'):
                remove_arrow_object(obj_name)
                await delete_arrow_dataset(obj_name)
                mark_operation_log_deleted(obj_name)
            deleted.append(obj_name)
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
    prefix = await get_object_prefix()
    if not object_name.startswith(prefix):
        raise HTTPException(status_code=400, detail="Invalid object name")
    new_object = f"{prefix}{new_filename}"
    if new_object == object_name:
        # Nothing to do if the name hasn't changed
        return {"old_name": object_name, "new_name": object_name}
    try:
        from minio.commonconfig import CopySource
        minio_client.copy_object(
            MINIO_BUCKET,
            new_object,
            CopySource(MINIO_BUCKET, object_name),
        )
        try:
            minio_client.remove_object(MINIO_BUCKET, object_name)
        except S3Error:
            pass
        content = redis_client.get(object_name)
        if content is not None:
            redis_client.setex(new_object, 3600, content)
            redis_client.delete(object_name)
        rename_arrow_object(object_name, new_object)
        await rename_arrow_dataset(object_name, new_object)
        return {"old_name": object_name, "new_name": new_object}
    except S3Error as e:
        code = getattr(e, "code", "")
        if code in {"NoSuchKey", "NoSuchBucket"}:
            redis_client.delete(object_name)
            raise HTTPException(status_code=404, detail="File not found")
        raise HTTPException(status_code=500, detail=str(e))
    except Exception as e:
        raise HTTPException(status_code=400, detail=str(e))


@router.post("/file-metadata")
async def get_file_metadata(request: Request):
    """
    Get metadata for a file including column dtypes, missing values, and sample data.
    Expects JSON body with 'file_path' key.
    """
    try:
        body = await request.json()
        file_path = body.get("file_path")
        
        if not file_path:
            raise HTTPException(status_code=400, detail="file_path is required")
        
        # Read file from MinIO
        data = read_minio_object(file_path)
        filename = Path(file_path).name
        
        # Parse based on file type
        if filename.lower().endswith(".csv"):
            df_pl = pl.read_csv(io.BytesIO(data), **CSV_READ_KWARGS)
        elif filename.lower().endswith((".xls", ".xlsx")):
            df_pl = pl.from_pandas(pd.read_excel(io.BytesIO(data)))
        elif filename.lower().endswith(".arrow"):
            df_pl = pl.read_ipc(io.BytesIO(data))
        else:
            raise HTTPException(status_code=400, detail="Only CSV, XLSX and Arrow files supported")
        
        df = df_pl.to_pandas()
        
        # Collect column metadata
        columns_info = []
        for col in df.columns:
            col_data = df[col]
            missing_count = int(col_data.isna().sum())
            total_rows = len(df)
            missing_percentage = (missing_count / total_rows * 100) if total_rows > 0 else 0
            
            # Get sample values (non-null)
            sample_values = col_data.dropna().head(5).tolist()
            
            columns_info.append({
                "name": str(col),
                "dtype": str(col_data.dtype),
                "missing_count": missing_count,
                "missing_percentage": round(missing_percentage, 2),
                "sample_values": sample_values,
            })
        
        return {
            "columns": columns_info,
            "total_rows": len(df),
            "total_columns": len(df.columns),
        }
        
    except Exception as e:
        logger.error(f"Error getting file metadata: {str(e)}")
        raise HTTPException(status_code=500, detail=str(e))


@router.post("/detect-datetime-format")
async def detect_datetime_format(request: Request):
    """
    Auto-detect datetime format for a column.
    Expects JSON body with:
    - file_path: str
    - column_name: str
    """
    try:
        body = await request.json()
        file_path = body.get("file_path")
        column_name = body.get("column_name")
        
        if not file_path or not column_name:
            raise HTTPException(status_code=400, detail="file_path and column_name are required")
        
        # Read file from MinIO
        data = read_minio_object(file_path)
        filename = Path(file_path).name
        
        # Parse based on file type
        if filename.lower().endswith(".csv"):
            df_pl = pl.read_csv(io.BytesIO(data), **CSV_READ_KWARGS)
        elif filename.lower().endswith((".xls", ".xlsx")):
            df_pl = pl.from_pandas(pd.read_excel(io.BytesIO(data)))
        elif filename.lower().endswith(".arrow"):
            df_pl = pl.read_ipc(io.BytesIO(data))
        else:
            raise HTTPException(status_code=400, detail="Only CSV, XLSX and Arrow files supported")
        
        df = df_pl.to_pandas()
        
        if column_name not in df.columns:
            raise HTTPException(status_code=400, detail=f"Column '{column_name}' not found")
        
        # Get non-null sample values
        column_data = df[column_name].dropna()
        if len(column_data) == 0:
            return {
                "detected_format": None,
                "can_detect": False,
                "sample_values": []
            }
        
        sample_values = column_data.head(5).astype(str).tolist()
        
        # Normalize separators for detection (handle mixed / and -)
        # Convert all / to - for standardization
        normalized_samples = [str(val).replace('/', '-') for val in sample_values]
        
        # Try common datetime formats (normalized to use -)
        common_formats = [
            '%Y-%m-%d',
            '%d/%m/%Y',
            '%m/%d/%Y',
            '%d-%m-%Y',
            '%m-%d-%Y',
            '%m/%d/%y',
            '%d-%m-%y',
            '%m-%d-%y',
            '%Y/%m/%d',
            '%Y-%m-%d %H:%M:%S',
            '%d/%m/%Y %H:%M:%S',
            '%m/%d/%Y %H:%M:%S',
            '%Y-%m-%dT%H:%M:%S',
        ]
        
        detected_format = None
        for fmt in common_formats:
            try:
                # Test with normalized sample values
                success_count = 0
                for val in normalized_samples[:5]:
                    try:
                        pd.to_datetime(val, format=fmt)
                        success_count += 1
                    except:
                        break
                
                if success_count >= len(normalized_samples[:5]):
                    detected_format = fmt
                    break
            except:
                continue
        
        return {
            "detected_format": detected_format,
            "can_detect": detected_format is not None,
            "sample_values": sample_values
        }
        
    except Exception as e:
        logger.error(f"Error detecting datetime format: {str(e)}")
        raise HTTPException(status_code=500, detail=str(e))


@router.post("/apply-data-transformations")
async def apply_data_transformations(request: Request):
    """
    Apply dtype changes and missing value strategies to a file.
    Expects JSON body with:
    - file_path: str
    - dtype_changes: dict[str, str | dict] (column_name -> new_dtype or {dtype: str, format: str})
    - missing_value_strategies: dict[str, dict] (column_name -> {strategy: str, value?: str})
    """
    try:
        body = await request.json()
        logger.info("=" * 80)
        logger.info("apply_data_transformations endpoint called")
        logger.info(f"Full request body: {body}")
        logger.info("=" * 80)
        
        file_path = body.get("file_path")
        dtype_changes = body.get("dtype_changes", {})
        missing_value_strategies = body.get("missing_value_strategies", {})
        
        logger.info(f"Extracted file_path: {file_path}")
        logger.info(f"Extracted dtype_changes: {dtype_changes}")
        logger.info(f"Extracted missing_value_strategies: {missing_value_strategies}")
        
        # Check if this is a missing value only request
        if len(dtype_changes) == 0 and len(missing_value_strategies) > 0:
            logger.warning("⚠️  MISSING VALUE ONLY REQUEST - No dtype changes found!")
        elif len(dtype_changes) > 0 and len(missing_value_strategies) == 0:
            logger.warning("⚠️  DTYPE ONLY REQUEST - No missing value strategies found!")
        elif len(dtype_changes) > 0 and len(missing_value_strategies) > 0:
            logger.info("✅ COMBINED REQUEST - Both dtype and missing value changes found!")
        
        if not file_path:
            raise HTTPException(status_code=400, detail="file_path is required")
        
        # Read file from MinIO
        data = read_minio_object(file_path)
        filename = Path(file_path).name
        
        # Parse based on file type
        if filename.lower().endswith(".csv"):
            df_pl = pl.read_csv(io.BytesIO(data), **CSV_READ_KWARGS)
        elif filename.lower().endswith((".xls", ".xlsx")):
            df_pl = pl.from_pandas(pd.read_excel(io.BytesIO(data)))
        elif filename.lower().endswith(".arrow"):
            df_pl = pl.read_ipc(io.BytesIO(data))
        else:
            raise HTTPException(status_code=400, detail="Only CSV, XLSX and Arrow files supported")
        
        df = df_pl.to_pandas()
        
        # Apply missing value strategies first
        for col_name, strategy_config in missing_value_strategies.items():
            if col_name not in df.columns:
                continue
                
            strategy = strategy_config.get("strategy", "none")
            
            if strategy == "none":
                continue
            elif strategy == "drop":
                df = df.dropna(subset=[col_name])
            elif strategy == "mean":
                if pd.api.types.is_numeric_dtype(df[col_name]):
                    df[col_name].fillna(df[col_name].mean(), inplace=True)
            elif strategy == "median":
                if pd.api.types.is_numeric_dtype(df[col_name]):
                    df[col_name].fillna(df[col_name].median(), inplace=True)
            elif strategy == "mode":
                mode_val = df[col_name].mode()
                if len(mode_val) > 0:
                    df[col_name].fillna(mode_val[0], inplace=True)
            elif strategy == "zero":
                df[col_name].fillna(0, inplace=True)
            elif strategy == "empty":
                df[col_name].fillna("", inplace=True)
            elif strategy == "custom":
                custom_value = strategy_config.get("value", "")
                logger.info(f"Applying custom value '{custom_value}' to column '{col_name}' (dtype: {df[col_name].dtype})")
                
                # Convert custom value to match column dtype
                if pd.api.types.is_numeric_dtype(df[col_name]):
                    try:
                        # Try to convert to numeric
                        numeric_value = pd.to_numeric(custom_value, errors='coerce')
                        if pd.notna(numeric_value):
                            df[col_name].fillna(numeric_value, inplace=True)
                            logger.info(f"Converted custom value '{custom_value}' to numeric: {numeric_value}")
                        else:
                            logger.warning(f"Could not convert custom value '{custom_value}' to numeric for column '{col_name}'")
                    except Exception as e:
                        logger.warning(f"Error converting custom value '{custom_value}' to numeric: {str(e)}")
                else:
                    # For non-numeric columns, use as string
                    df[col_name].fillna(str(custom_value), inplace=True)
                    logger.info(f"Applied custom string value '{custom_value}' to column '{col_name}'")
        
        # Apply dtype changes
        logger.info(f"Starting dtype changes. Total dtype_changes to apply: {len(dtype_changes)}")
        logger.info(f"dtype_changes received: {dtype_changes}")
        
        for col_name, dtype_config in dtype_changes.items():
            logger.info(f"Processing dtype change for column: {col_name}, config: {dtype_config}")
            
            if col_name not in df.columns:
                logger.warning(f"Column '{col_name}' not found in dataframe. Skipping.")
                continue
            
            # Handle both string dtype and dict with {dtype, format}
            if isinstance(dtype_config, dict):
                new_dtype = dtype_config.get('dtype')
                datetime_format = dtype_config.get('format')
                logger.info(f"Dict config detected - dtype: {new_dtype}, format: {datetime_format}")
            else:
                new_dtype = dtype_config
                datetime_format = None
                logger.info(f"String config detected - dtype: {new_dtype}")
                
            try:
                if new_dtype == "int64":
                    # logger.info(f"Converting column '{col_name}' to int64")
                    # logger.info(f"Sample values before conversion: {df[col_name].head(5).tolist()}")
                    # logger.info(f"Column dtype before conversion: {df[col_name].dtype}")
                    
                    # Convert to numeric first, then round to remove decimals, then to Int64
                    numeric_col = pd.to_numeric(df[col_name], errors='coerce')
                    df[col_name] = numeric_col.round().astype('Int64')
                    
                    # logger.info(f"Sample values after conversion: {df[col_name].head(5).tolist()}")
                    # logger.info(f"Column dtype after conversion: {df[col_name].dtype}")
                    # logger.info(f"Non-null count: {df[col_name].notna().sum()} out of {len(df[col_name])}")
                elif new_dtype == "float64":
                    df[col_name] = pd.to_numeric(df[col_name], errors='coerce')
                elif new_dtype == "object":
                    df[col_name] = df[col_name].astype(str)
                elif new_dtype == "datetime64":
                    # Use provided format if available
                    if datetime_format:
                        # logger.info(f"Converting column '{col_name}' to datetime64 with format: {datetime_format}")
                        # logger.info(f"Sample values before conversion: {df[col_name].head(5).tolist()}")
                        # logger.info(f"Column dtype before conversion: {df[col_name].dtype}")
                        
                        # Two-step process: First auto-parse and standardize, then convert
                        # Step 1: Auto-detect parse (no format) and convert to standardized format string
                        def parse_and_format(x):
                            try:
                                # Auto-detect the date format (no format parameter)
                                parsed = pd.to_datetime(x, errors='coerce')
                                if pd.notna(parsed):
                                    # Format to the user's selected format
                                    result = parsed.strftime(datetime_format)
                                    return result
                                return None
                            except Exception as e:
                                logger.warning(f"Error parsing value '{x}': {str(e)}")
                                return None
                        
                        df[col_name] = df[col_name].apply(parse_and_format)
                        # logger.info(f"After Step 1 (auto-parse & format): {df[col_name].head(5).tolist()}")
                        # logger.info(f"Non-null count after Step 1: {df[col_name].notna().sum()} out of {len(df[col_name])}")
                        
                        # Step 2: Convert to datetime64 using the standardized format
                        df[col_name] = pd.to_datetime(df[col_name], format=datetime_format, errors='coerce')
                        # logger.info(f"After Step 2 (final conversion): {df[col_name].head(5).tolist()}")
                        # logger.info(f"Non-null count after Step 2: {df[col_name].notna().sum()} out of {len(df[col_name])}")
                        # logger.info(f"Column dtype after conversion: {df[col_name].dtype}")
                    else:
                        logger.info(f"Converting column '{col_name}' to datetime64 without specific format")
                        df[col_name] = pd.to_datetime(df[col_name], errors='coerce')
                elif new_dtype == "bool":
                    df[col_name] = df[col_name].astype(bool)
            except Exception as e:
                logger.warning(f"Could not convert {col_name} to {new_dtype}: {str(e)}")
        
        # Save back to MinIO (overwrite the temp file)
        buffer = io.BytesIO()
        if filename.lower().endswith(".csv"):
            df.to_csv(buffer, index=False)
        elif filename.lower().endswith((".xls", ".xlsx")):
            df.to_excel(buffer, index=False)
        elif filename.lower().endswith(".arrow"):
            df_pl_updated = pl.from_pandas(df)
            df_pl_updated.write_ipc(buffer)
        
        buffer.seek(0)
        
        # Upload back to MinIO
        minio_client.put_object(
            MINIO_BUCKET,
            file_path,
            buffer,
            length=buffer.getbuffer().nbytes,
            content_type="application/octet-stream",
        )
        
        return {
            "status": "success",
            "message": "Transformations applied successfully",
            "rows_affected": len(df),
        }
        
    except Exception as e:
        logger.error(f"Error applying transformations: {str(e)}")
        raise HTTPException(status_code=500, detail=str(e))