"""
Data Type Handler - Handles dtype detection, preservation, and storage in MongoDB

This module provides functions for:
1. Detecting and inferring data types from DataFrames
2. Preserving dtypes when converting between formats (Pandas, Polars, Arrow)
3. Saving/loading original and user-modified dtypes from MongoDB
4. Converting Polars types to Pandas types correctly
"""

import pandas as pd
import polars as pl
import logging
from typing import Dict, List, Optional, Any, Tuple
from datetime import datetime
from pymongo import MongoClient
import os

logger = logging.getLogger(__name__)

# MongoDB Configuration
MONGODB_URL = os.getenv("MONGO_URI", "mongodb://mongo:27017")
MONGO_USER = os.getenv("MONGO_USERNAME") or os.getenv("MONGO_USER")
MONGO_PASSWORD = os.getenv("MONGO_PASSWORD")
MONGO_AUTH_DB = os.getenv("MONGO_AUTH_DB", "admin")
DATABASE_NAME = "validator_atoms_db"
COLLECTION_NAME = "column_dtypes"

# Initialize MongoDB client
try:
    auth_kwargs = (
        {
            "username": MONGO_USER,
            "password": MONGO_PASSWORD,
            "authSource": MONGO_AUTH_DB,
        }
        if MONGO_USER and MONGO_PASSWORD
        else {}
    )
    mongo_client = MongoClient(
        MONGODB_URL,
        **auth_kwargs,
        serverSelectionTimeoutMS=5000,
    )
    db = mongo_client[DATABASE_NAME]
    logger.info(f"Connected to MongoDB for dtype storage: {DATABASE_NAME}")
except Exception as e:
    logger.error(f"MongoDB connection failed for dtype storage: {e}")
    mongo_client = None
    db = None


def check_mongodb_connection() -> bool:
    """Check if MongoDB is available for dtype storage."""
    global mongo_client, db
    if mongo_client is None or db is None:
        try:
            auth_kwargs = (
                {
                    "username": MONGO_USER,
                    "password": MONGO_PASSWORD,
                    "authSource": MONGO_AUTH_DB,
                }
                if MONGO_USER and MONGO_PASSWORD
                else {}
            )
            mongo_client = MongoClient(
                MONGODB_URL,
                **auth_kwargs,
                serverSelectionTimeoutMS=5000,
            )
            db = mongo_client[DATABASE_NAME]
            mongo_client.admin.command('ping')
            return True
        except Exception:
            return False
    return True


def detect_column_types(df: pd.DataFrame) -> Dict[str, str]:
    """
    Detect and infer data types for each column in a DataFrame.
    
    Args:
        df: pandas DataFrame with string/object columns
        
    Returns:
        Dictionary mapping column names to their detected dtype strings
        (e.g., {'col1': 'Int64', 'col2': 'float64', 'col3': 'datetime64[ns]'})
    """
    dtype_map = {}
    
    for col_idx, col_name in enumerate(df.columns):
        col_data = df[col_name]
        
        # Skip if column is all empty
        if col_data.astype(str).str.strip().eq('').all():
            dtype_map[col_name] = 'object'
            continue
        
        # Remove empty strings and whitespace for type checking
        non_empty = col_data.astype(str).str.strip()
        non_empty = non_empty[non_empty != '']
        
        if len(non_empty) == 0:
            dtype_map[col_name] = 'object'
            continue
        
        # Try to convert to integer first (more specific than float)
        converted = False
        try:
            int_col = pd.to_numeric(col_data, errors='coerce', downcast='integer')
            non_null_count = int_col.notna().sum()
            total_count = len(col_data)
            
            if total_count > 0 and non_null_count >= total_count * 0.8:
                # Verify they're integers (no decimal part)
                sample_values = non_empty.head(100).tolist()
                all_integers = all(
                    ('.' not in str(v) or str(v).split('.')[1] == '0' or str(v).split('.')[1] == '')
                    for v in sample_values
                    if v and str(v).strip()
                )
                if all_integers:
                    dtype_map[col_name] = 'Int64'  # Nullable integer
                    converted = True
        except Exception:
            pass
        
        if converted:
            continue
        
        # Try to convert to float
        try:
            float_col = pd.to_numeric(col_data, errors='coerce')
            non_null_count = float_col.notna().sum()
            total_count = len(col_data)
            if total_count > 0 and non_null_count >= total_count * 0.8:
                dtype_map[col_name] = 'float64'
                converted = True
        except Exception:
            pass
        
        if converted:
            continue
        
        # Try to convert to datetime
        try:
            datetime_col = pd.to_datetime(col_data, errors='coerce', infer_datetime_format=True)
            non_null_count = datetime_col.notna().sum()
            total_count = len(col_data)
            if total_count > 0 and non_null_count >= total_count * 0.8:
                dtype_map[col_name] = 'datetime64[ns]'
                converted = True
        except Exception:
            pass
        
        if converted:
            continue
        
        # Try to convert to boolean
        try:
            bool_col = col_data.astype(str).str.lower().str.strip()
            bool_map = {'true': True, 'false': False, '1': True, '0': False, 'yes': True, 'no': False}
            bool_col = bool_col.map(bool_map)
            non_null_count = bool_col.notna().sum()
            total_count = len(col_data)
            if total_count > 0 and non_null_count >= total_count * 0.9:  # Higher threshold for boolean
                dtype_map[col_name] = 'boolean'
                converted = True
        except Exception:
            pass
        
        if converted:
            continue
        
        # Otherwise keep as object/string (default)
        dtype_map[col_name] = 'object'
    
    logger.debug(f"Detected dtypes: {dtype_map}")
    return dtype_map


def apply_dtypes_to_dataframe(df: pd.DataFrame, dtype_map: Dict[str, str]) -> pd.DataFrame:
    """
    Apply detected dtypes to a DataFrame.
    
    Args:
        df: pandas DataFrame
        dtype_map: Dictionary mapping column names to dtype strings
        
    Returns:
        DataFrame with applied dtypes
    """
    df_result = df.copy()
    
    for col_name, dtype_str in dtype_map.items():
        if col_name not in df_result.columns:
            continue
        
        try:
            if dtype_str == 'Int64':
                # Nullable integer
                df_result[col_name] = pd.to_numeric(df_result[col_name], errors='coerce').astype('Int64')
            elif dtype_str == 'Int32':
                df_result[col_name] = pd.to_numeric(df_result[col_name], errors='coerce').astype('Int32')
            elif dtype_str == 'float64':
                df_result[col_name] = pd.to_numeric(df_result[col_name], errors='coerce').astype('float64')
            elif dtype_str == 'datetime64[ns]':
                df_result[col_name] = pd.to_datetime(df_result[col_name], errors='coerce')
            elif dtype_str == 'boolean':
                bool_col = df_result[col_name].astype(str).str.lower().str.strip()
                bool_map = {'true': True, 'false': False, '1': True, '0': False, 'yes': True, 'no': False}
                df_result[col_name] = bool_col.map(bool_map).astype('boolean')
            # object/string types are already correct, no conversion needed
        except Exception as e:
            logger.warning(f"Failed to convert column {col_name} to {dtype_str}: {e}")
            # Keep original dtype if conversion fails
    
    return df_result


def preserve_polars_to_pandas_dtypes(df_pl: pl.DataFrame, df: pd.DataFrame) -> pd.DataFrame:
    """
    Fix dtype mapping when converting from Polars to Pandas.
    Polars nullable integer types (Int64, Int32) sometimes convert to object in Pandas.
    
    Args:
        df_pl: Polars DataFrame (source)
        df: Pandas DataFrame (after conversion)
        
    Returns:
        Pandas DataFrame with corrected dtypes
    """
    df_result = df.copy()
    dtype_map = dict(zip(df_pl.columns, df_pl.dtypes))
    
    for col in df_result.columns:
        polars_dtype = dtype_map.get(col)
        if not polars_dtype:
            continue
        
        pandas_dtype = df_result[col].dtype
        
        # If Polars says it's Int64 but Pandas converted it to object, fix it
        if polars_dtype == pl.Int64 and pandas_dtype == 'object':
            try:
                df_result[col] = df_result[col].astype('Int64')
                logger.debug(f"Fixed column {col}: object -> Int64")
            except Exception as e:
                logger.warning(f"Could not convert {col} from object to Int64: {e}")
        elif polars_dtype == pl.Int32 and pandas_dtype == 'object':
            try:
                df_result[col] = df_result[col].astype('Int32')
                logger.debug(f"Fixed column {col}: object -> Int32")
            except Exception:
                pass
        # Float64 should convert correctly, but check anyway
        elif polars_dtype == pl.Float64 and pandas_dtype == 'object':
            try:
                df_result[col] = pd.to_numeric(df_result[col], errors='coerce').astype('float64')
                logger.debug(f"Fixed column {col}: object -> float64")
            except Exception:
                pass
        # Datetime should convert correctly
        elif polars_dtype == pl.Datetime and pandas_dtype == 'object':
            try:
                df_result[col] = pd.to_datetime(df_result[col], errors='coerce')
                logger.debug(f"Fixed column {col}: object -> datetime64[ns]")
            except Exception:
                pass
        # Boolean
        elif polars_dtype == pl.Boolean and pandas_dtype == 'object':
            try:
                df_result[col] = df_result[col].astype('boolean')
                logger.debug(f"Fixed column {col}: object -> boolean")
            except Exception:
                pass
    
    return df_result


def save_dtypes_to_mongo(
    file_path: str,
    original_dtypes: Dict[str, str],
    modified_dtypes: Optional[Dict[str, str]] = None,
    *,
    client_name: str = "",
    app_name: str = "",
    project_name: str = "",
    user_id: str = "",
) -> Dict[str, Any]:
    """
    Save column dtypes to MongoDB.
    
    Args:
        file_path: File path (used as document ID)
        original_dtypes: Dictionary mapping column names to original detected dtypes
        modified_dtypes: Optional dictionary mapping column names to user-modified dtypes
        client_name: Client name for metadata
        app_name: App name for metadata
        project_name: Project name for metadata
        user_id: User ID for metadata
        
    Returns:
        Dictionary with status and mongo_id
    """
    if not check_mongodb_connection():
        return {"status": "error", "error": "MongoDB not connected"}
    
    try:
        document_id = f"dtypes_{file_path}"
        document = {
            "_id": document_id,
            "file_path": file_path,
            "original_dtypes": original_dtypes,
            "modified_dtypes": modified_dtypes or {},
            "client_name": client_name,
            "app_name": app_name,
            "project_name": project_name,
            "user_id": user_id,
            "created_at": datetime.utcnow(),
            "updated_at": datetime.utcnow(),
        }
        
        result = db[COLLECTION_NAME].replace_one(
            {"_id": document_id},
            document,
            upsert=True
        )
        
        logger.info(f"Saved dtypes to MongoDB for file: {file_path}")
        return {
            "status": "success",
            "mongo_id": document_id,
            "operation": "inserted" if result.upserted_id else "updated",
        }
    except Exception as e:
        logger.error(f"MongoDB save error for dtypes: {e}")
        return {"status": "error", "error": str(e)}


def get_dtypes_from_mongo(file_path: str) -> Optional[Dict[str, Any]]:
    """
    Retrieve dtypes from MongoDB.
    
    Args:
        file_path: File path (used as document ID)
        
    Returns:
        Dictionary with original_dtypes and modified_dtypes, or None if not found
    """
    if not check_mongodb_connection():
        return None
    
    try:
        document_id = f"dtypes_{file_path}"
        result = db[COLLECTION_NAME].find_one({"_id": document_id})
        return result
    except Exception as e:
        logger.error(f"MongoDB read error for dtypes: {e}")
        return None


def update_modified_dtypes(
    file_path: str,
    column_name: str,
    new_dtype: str,
    *,
    client_name: str = "",
    app_name: str = "",
    project_name: str = "",
    user_id: str = "",
) -> Dict[str, Any]:
    """
    Update a single column's modified dtype in MongoDB.
    
    Args:
        file_path: File path (used as document ID)
        column_name: Column name to update
        new_dtype: New dtype string
        client_name: Client name for metadata
        app_name: App name for metadata
        project_name: Project name for metadata
        user_id: User ID for metadata
        
    Returns:
        Dictionary with status
    """
    if not check_mongodb_connection():
        return {"status": "error", "error": "MongoDB not connected"}
    
    try:
        document_id = f"dtypes_{file_path}"
        
        # Get existing document or create new one
        existing = db[COLLECTION_NAME].find_one({"_id": document_id})
        
        if existing:
            # Update existing document
            modified_dtypes = existing.get("modified_dtypes", {})
            modified_dtypes[column_name] = new_dtype
            
            db[COLLECTION_NAME].update_one(
                {"_id": document_id},
                {
                    "$set": {
                        "modified_dtypes": modified_dtypes,
                        "updated_at": datetime.utcnow(),
                    }
                }
            )
        else:
            # Create new document (shouldn't happen, but handle gracefully)
            logger.warning(f"Attempting to update dtypes for non-existent file: {file_path}")
            return {"status": "error", "error": "Original dtypes not found. Please save original dtypes first."}
        
        logger.info(f"Updated modified dtype for column {column_name} in file: {file_path}")
        return {"status": "success", "mongo_id": document_id}
    except Exception as e:
        logger.error(f"MongoDB update error for dtypes: {e}")
        return {"status": "error", "error": str(e)}


def get_current_dtype(
    file_path: str,
    column_name: str,
    default_dtype: str = "object"
) -> str:
    """
    Get the current dtype for a column (modified dtype if exists, otherwise original dtype).
    
    Args:
        file_path: File path
        column_name: Column name
        default_dtype: Default dtype to return if not found
        
    Returns:
        Current dtype string
    """
    dtypes_doc = get_dtypes_from_mongo(file_path)
    if not dtypes_doc:
        return default_dtype
    
    # Check modified dtypes first, then original dtypes
    modified_dtypes = dtypes_doc.get("modified_dtypes", {})
    if column_name in modified_dtypes:
        return modified_dtypes[column_name]
    
    original_dtypes = dtypes_doc.get("original_dtypes", {})
    if column_name in original_dtypes:
        return original_dtypes[column_name]
    
    return default_dtype


def convert_pandas_to_polars_with_dtype_preservation(df: pd.DataFrame) -> pl.DataFrame:
    """
    Convert pandas DataFrame to Polars while preserving dtypes.
    
    Args:
        df: pandas DataFrame with proper dtypes
        
    Returns:
        Polars DataFrame with preserved dtypes
    """
    # Clean data before converting to Polars
    df_cleaned = df.copy()
    
    for col in df_cleaned.columns:
        col_dtype = df_cleaned[col].dtype
        if col_dtype == 'object':
            # Replace empty strings with NaN for object columns
            df_cleaned[col] = df_cleaned[col].replace(
                ['', ' ', '  ', 'None', 'null', 'NULL', 'nan', 'NaN', 'N/A', 'n/a', 'NaT', '<NA>'],
                pd.NA
            )
        elif pd.api.types.is_numeric_dtype(col_dtype):
            # For numeric columns, ensure empty strings are NaN
            df_cleaned[col] = pd.to_numeric(df_cleaned[col], errors='coerce')
        elif pd.api.types.is_datetime64_any_dtype(col_dtype):
            # For datetime columns, ensure empty strings are NaT
            df_cleaned[col] = pd.to_datetime(df_cleaned[col], errors='coerce')
    
    # Convert to Polars with nan_to_null=True to preserve nullable types
    try:
        df_pl = pl.from_pandas(df_cleaned, nan_to_null=True)
        logger.debug(f"Converted to Polars with dtypes: {dict(zip(df_pl.columns, [str(dt) for dt in df_pl.dtypes]))}")
        return df_pl
    except Exception as e:
        logger.warning(f"Direct Polars conversion failed: {e}. Attempting column-by-column conversion.")
        # Fallback: convert column by column
        df_fixed = df_cleaned.copy()
        for col in df_fixed.columns:
            try:
                if pd.api.types.is_integer_dtype(df_fixed[col].dtype):
                    df_fixed[col] = df_fixed[col].astype('Int64')
                elif pd.api.types.is_float_dtype(df_fixed[col].dtype):
                    df_fixed[col] = pd.to_numeric(df_fixed[col], errors='coerce')
                elif pd.api.types.is_datetime64_any_dtype(df_fixed[col].dtype):
                    df_fixed[col] = pd.to_datetime(df_fixed[col], errors='coerce')
            except Exception:
                pass
        
        df_pl = pl.from_pandas(df_fixed, nan_to_null=True)
        return df_pl
