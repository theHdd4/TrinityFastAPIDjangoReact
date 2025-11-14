from fastapi import APIRouter, Response, Body, HTTPException, UploadFile, File
import base64
import os
from minio import Minio
from minio.error import S3Error
from urllib.parse import unquote
import polars as pl
import numba as nb
import io
import uuid
import re
import datetime
import math
from bisect import bisect_right
from typing import Dict, Any, List, Tuple, Optional
from numbers import Real
from pydantic import BaseModel
from app.DataStorageRetrieval.arrow_client import download_table_bytes
from app.features.data_upload_validate.app.routes import get_object_prefix
from app.core.task_queue import celery_task_client, format_task_response
from app.features.dataframe_operations.service import (
    SESSIONS,
    dataframe_payload as _df_payload,
    filter_dataframe,
    get_session_dataframe as _get_df,
    load_dataframe_from_base64,
    sort_dataframe,
)

router = APIRouter()

# Self-contained MinIO config (match feature-overview)
MINIO_ENDPOINT = os.getenv("MINIO_ENDPOINT", "minio:9000")
MINIO_ACCESS_KEY = os.getenv("MINIO_ACCESS_KEY", "admin_dev")
MINIO_SECRET_KEY = os.getenv("MINIO_SECRET_KEY", "pass_dev")
MINIO_BUCKET = os.getenv("MINIO_BUCKET", "trinity")

minio_client = Minio(
    MINIO_ENDPOINT,
    access_key=MINIO_ACCESS_KEY,
    secret_key=MINIO_SECRET_KEY,
    secure=False
)

def _is_null(value: Any) -> bool:
    if value is None:
        return True
    if isinstance(value, float):
        return math.isnan(value)
    return False


def _to_number(value: Any) -> float | None:
    if _is_null(value):
        return None
    if isinstance(value, bool):
        return float(value)
    if isinstance(value, (int, float)):
        return float(value)
    try:
        return float(str(value))
    except (TypeError, ValueError):
        return None


def _parse_datetime(value: Any) -> datetime.datetime | None:
    if _is_null(value):
        return None
    if isinstance(value, datetime.datetime):
        return value
    if isinstance(value, datetime.date):
        return datetime.datetime.combine(value, datetime.time())
    if isinstance(value, (int, float)):
        try:
            return datetime.datetime.fromtimestamp(float(value))
        except (OverflowError, OSError, ValueError):
            return None
    if isinstance(value, str):
        text = value.strip()
        if not text:
            return None
        try:
            return datetime.datetime.fromisoformat(text)
        except ValueError:
            pass
        for fmt in (
            "%Y-%m-%d",
            "%Y/%m/%d",
            "%m/%d/%Y",
            "%d-%m-%Y",
            "%Y-%m-%d %H:%M:%S",
        ):
            try:
                return datetime.datetime.strptime(text, fmt)
            except ValueError:
                continue
    return None


def _format_value(value: Any) -> str:
    if _is_null(value):
        return "None"
    if isinstance(value, datetime.datetime):
        return repr(value.isoformat())
    if isinstance(value, datetime.date):
        return repr(value.isoformat())
    return repr(value)


def _fn_if(condition: Any, true_val: Any, false_val: Any) -> Any:
    return true_val if condition else false_val


def _fn_lower(value: Any) -> Any:
    if _is_null(value):
        return None
    return str(value).lower()


def _fn_upper(value: Any) -> Any:
    if _is_null(value):
        return None
    return str(value).upper()


def _fn_len(value: Any) -> int:
    if _is_null(value):
        return 0
    return len(str(value))


def _fn_substr(value: Any, start: Any, end: Any | None = None) -> Any:
    if _is_null(value):
        return None
    text = str(value)
    try:
        start_idx = int(start)
    except (TypeError, ValueError):
        start_idx = 0
    end_idx: int | None
    if end is None:
        end_idx = None
    else:
        try:
            end_idx = int(end)
        except (TypeError, ValueError):
            end_idx = None
    return text[start_idx:end_idx]


def _fn_str_replace(value: Any, old: Any, new: Any) -> Any:
    """
    Replace text in value. 
    ENHANCED: If old="" (empty string), it matches blank cells (NULL, "", whitespace)
    """
    # Check if we're replacing blanks (old is empty string)
    if old == "" or old == '':
        # Check if value is blank (NULL, empty string, or whitespace only)
        if _is_null(value):
            return new  # Replace NULL with new value
        str_val = str(value).strip()
        if str_val == "":
            return new  # Replace empty/whitespace with new value
        return value  # Not blank, keep original
    
    # Normal string replacement
    if _is_null(value):
        return None
    return str(value).replace(str(old), str(new))


def _fn_year(value: Any) -> Any:
    dt = _parse_datetime(value)
    return dt.year if dt else None


def _fn_month(value: Any) -> Any:
    dt = _parse_datetime(value)
    return dt.month if dt else None


def _fn_day(value: Any) -> Any:
    dt = _parse_datetime(value)
    return dt.day if dt else None


def _fn_weekday(value: Any) -> Any:
    dt = _parse_datetime(value)
    return dt.strftime("%A") if dt else None


def _fn_date_diff(a: Any, b: Any) -> Any:
    dt_a = _parse_datetime(a)
    dt_b = _parse_datetime(b)
    if not dt_a or not dt_b:
        return None
    return (dt_a - dt_b).days


def _fn_abs(value: Any) -> Any:
    num = _to_number(value)
    return abs(num) if num is not None else None


def _fn_round(value: Any, digits: Any = 0) -> Any:
    num = _to_number(value)
    if num is None:
        return None
    try:
        places = int(digits)
    except (TypeError, ValueError):
        places = 0
    return round(num, places)


def _fn_floor(value: Any) -> Any:
    num = _to_number(value)
    return math.floor(num) if num is not None else None


def _fn_ceil(value: Any) -> Any:
    num = _to_number(value)
    return math.ceil(num) if num is not None else None


def _fn_exp(value: Any) -> Any:
    num = _to_number(value)
    return math.exp(num) if num is not None else None


def _fn_log(value: Any) -> Any:
    num = _to_number(value)
    if num is None or num <= 0:
        return None
    return math.log(num)


def _fn_sqrt(value: Any) -> Any:
    num = _to_number(value)
    if num is None or num < 0:
        return None
    return math.sqrt(num)


def _fn_sum(*values: Any) -> Any:
    nums = [n for v in values if (n := _to_number(v)) is not None]
    return sum(nums)


def _fn_prod(*values: Any) -> Any:
    nums = [n for v in values if (n := _to_number(v)) is not None]
    result = 1.0
    if not nums:
        return 0
    for n in nums:
        result *= n
    return result


def _fn_div(*values: Any) -> Any:
    nums = [n for v in values if (n := _to_number(v)) is not None]
    if not nums:
        return None
    result = nums[0]
    for n in nums[1:]:
        if n == 0:
            continue
        result /= n
    return result


def _fn_avg(*values: Any) -> Any:
    nums = [n for v in values if (n := _to_number(v)) is not None]
    if not nums:
        return None
    return sum(nums) / len(nums)


def _fn_max(*values: Any) -> Any:
    nums = [n for v in values if (n := _to_number(v)) is not None]
    return max(nums) if nums else None


def _fn_min(*values: Any) -> Any:
    nums = [n for v in values if (n := _to_number(v)) is not None]
    return min(nums) if nums else None


def _fn_bin(value: Any, bins: Any) -> Any:
    try:
        edges = [float(b) for b in bins]
    except TypeError:
        return None
    if len(edges) < 2:
        return None
    edges.sort()
    num = _to_number(value)
    if num is None:
        return None
    if num < edges[0]:
        return f"<{edges[0]}"
    idx = bisect_right(edges, num) - 1
    if idx >= len(edges) - 1:
        return f">={edges[-1]}"
    lower = edges[idx]
    upper = edges[idx + 1]
    return f"[{lower}, {upper})"


def _fn_map(value: Any, mapping: Any) -> Any:
    if not isinstance(mapping, dict):
        return value
    if value in mapping:
        return mapping[value]
    key = str(value) if not isinstance(value, str) else value
    return mapping.get(key, value)


def _fn_isnull(value: Any) -> bool:
    if isinstance(value, str):
        return value.strip() == ""
    return _is_null(value)


def _fn_fillna(value: Any, replacement: Any) -> Any:
    return replacement if _fn_isnull(value) else value


def _fn_fillblank(value: Any, replacement: Any) -> Any:
    """
    Fill blank cells with replacement value.
    Treats NULL, empty strings, and whitespace-only strings as blank.
    """
    # Check if value is NULL
    if _is_null(value):
        return replacement
    
    # Check if value is empty string or whitespace only
    if isinstance(value, str):
        if value == "" or value.strip() == "":
            return replacement
    
    # Not blank, return original value
    return value


SAFE_EVAL_GLOBALS: Dict[str, Any] = {
    "__builtins__": {},
    "True": True,
    "False": False,
    "None": None,
    "IF": _fn_if,
    "LOWER": _fn_lower,
    "UPPER": _fn_upper,
    "LEN": _fn_len,
    "SUBSTR": _fn_substr,
    "STR_REPLACE": _fn_str_replace,
    "YEAR": _fn_year,
    "MONTH": _fn_month,
    "DAY": _fn_day,
    "WEEKDAY": _fn_weekday,
    "DATE_DIFF": _fn_date_diff,
    "ABS": _fn_abs,
    "ROUND": _fn_round,
    "FLOOR": _fn_floor,
    "CEIL": _fn_ceil,
    "EXP": _fn_exp,
    "LOG": _fn_log,
    "SQRT": _fn_sqrt,
    "SUM": _fn_sum,
    "AVG": _fn_avg,
    "MEAN": _fn_avg,
    "PROD": _fn_prod,
    "DIV": _fn_div,
    "MAX": _fn_max,
    "MIN": _fn_min,
    "BIN": _fn_bin,
    "MAP": _fn_map,
    "ISNULL": _fn_isnull,
    "FILLNA": _fn_fillna,
    "FILLBLANK": _fn_fillblank,
}

SAFE_EVAL_FUNCTIONS = {
    name for name in SAFE_EVAL_GLOBALS if name not in {"__builtins__", "True", "False", "None"}
}


def _normalize_formula_functions(expr: str) -> str:
    """Normalize function names to match the casing expected by SAFE_EVAL_GLOBALS."""

    result: List[str] = []
    i = 0
    in_quote: str | None = None
    length = len(expr)

    while i < length:
        ch = expr[i]

        if in_quote:
            result.append(ch)
            if ch == "\\" and i + 1 < length:
                # Preserve escaped characters within strings
                result.append(expr[i + 1])
                i += 2
                continue
            if ch == in_quote:
                in_quote = None
            i += 1
            continue

        if ch in {'"', "'"}:
            in_quote = ch
            result.append(ch)
            i += 1
            continue

        if ch.isalpha() or ch == "_":
            start = i
            while i < length and (expr[i].isalnum() or expr[i] == "_"):
                i += 1
            name = expr[start:i]
            j = i
            while j < length and expr[j].isspace():
                j += 1
            if j < length and expr[j] == "(":
                canonical = name.upper()
                if canonical in SAFE_EVAL_FUNCTIONS:
                    result.append(canonical)
                else:
                    result.append(name)
            else:
                result.append(name)
            if j > i:
                result.append(expr[i:j])
            i = j
            continue

        result.append(ch)
        i += 1

    return "".join(result)


def _fetch_df_from_object(object_name: str) -> pl.DataFrame:
    """Fetch a DataFrame from the Flight server or MinIO given an object key."""
    import logging
    logger = logging.getLogger("dataframe_operations.load")
    
    object_name = unquote(object_name)
    logger.debug(f"🔍 [FETCH] Fetching object: {object_name}")
    
    if not object_name.endswith(".arrow"):
        error_msg = f"Invalid object_name '{object_name}': Only .arrow objects are supported"
        logger.error(f"❌ [FETCH] {error_msg}")
        raise HTTPException(status_code=400, detail=error_msg)
    
    try:
        logger.debug(f"⬇️ [FETCH] Downloading table bytes for: {object_name}")
        data = download_table_bytes(object_name)
        logger.debug(f"✅ [FETCH] Downloaded {len(data)} bytes, parsing Arrow IPC format")
        df = pl.read_ipc(io.BytesIO(data))
        logger.debug(f"✅ [FETCH] Successfully parsed DataFrame: {df.shape}")
        return df
    except HTTPException:
        raise
    except Exception as e:
        error_msg = f"Failed to load object '{object_name}': {str(e)}"
        logger.error(f"❌ [FETCH] {error_msg}")
        raise HTTPException(status_code=404, detail=error_msg) from e

@router.get("/test_alive")
async def test_alive():
    return {"status": "alive"}

@router.get("/cached_dataframe")
async def cached_dataframe(object_name: str):
    df = _fetch_df_from_object(object_name)
    buf = io.StringIO()
    df.write_csv(buf)
    return Response(content=buf.getvalue(), media_type="text/csv")


@router.post("/load_cached")
async def load_cached_dataframe(object_name: str = Body(..., embed=True)):
    """Load a cached dataframe by object key and create a session."""
    import logging
    logger = logging.getLogger("dataframe_operations.load")
    
    logger.info(f"🔵 [LOAD] Starting load_cached operation - object_name: {object_name}")
    
    # Validate and fix object_name if needed
    if not object_name.endswith(".arrow"):
        error_msg = f"Invalid object_name '{object_name}': Must end with '.arrow' extension"
        logger.error(f"❌ [LOAD] {error_msg}")
        raise HTTPException(status_code=400, detail=error_msg)
    
    try:
        df = _fetch_df_from_object(object_name)
    except HTTPException as e:
        logger.error(f"❌ [LOAD] Failed to fetch dataframe: {e.detail}")
        raise
    except Exception as e:
        error_msg = f"Error loading dataframe '{object_name}': {str(e)}"
        logger.error(f"❌ [LOAD] {error_msg}")
        raise HTTPException(status_code=400, detail=error_msg) from e
    
    logger.info(f"📊 [LOAD] DataFrame loaded successfully:")
    logger.info(f"   - Shape: {df.shape}")
    logger.info(f"   - Columns: {df.columns}")
    logger.info(f"   - Dtypes: {dict(zip(df.columns, df.dtypes))}")
    logger.info(f"   - Schema: {df.schema}")
    
    # Log sample data
    try:
        logger.info(f"📊 [LOAD] Sample row (first): {df.head(1).to_dicts()}")
    except Exception as sample_err:
        logger.warning(f"⚠️ [LOAD] Could not log sample data: {sample_err}")
    
    df_id = str(uuid.uuid4())
    SESSIONS[df_id] = df
    
    logger.info(f"✅ [LOAD] DataFrame cached in session: {df_id}")
    
    return _df_payload(df, df_id)


class LoadFileDetailsRequest(BaseModel):
    object_name: str


@router.post("/load-file-details")
async def load_file_details(request: LoadFileDetailsRequest):
    """
    Load a saved dataframe from Arrow Flight and return comprehensive file info including:
    - File ID for subsequent operations
    - All columns
    - Column types (numeric/categorical)
    - Unique values for categorical columns
    - Sample data
    - Column data types
    
    This endpoint is similar to chart maker's /load-saved-dataframe and provides
    detailed file information so the LLM can use exact column names for operations.
    """
    import logging
    logger = logging.getLogger("dataframe_operations.load_file_details")
    
    try:
        logger.info(f"🔍 ===== LOAD FILE DETAILS REQUEST =====")
        logger.info(f"📥 Object name: {request.object_name}")
        
        # Load the dataframe from Arrow Flight
        logger.info("🚀 Loading dataframe from Arrow Flight...")
        df = _fetch_df_from_object(request.object_name)
        logger.info(f"✅ Dataframe loaded: {len(df)} rows, {len(df.columns)} columns")
        logger.info(f"📋 Available columns: {list(df.columns)}")
        
        # Create a session for the dataframe
        df_id = str(uuid.uuid4())
        SESSIONS[df_id] = df
        
        # Get all columns
        all_columns = list(df.columns)
        logger.info(f"📋 Total columns: {len(all_columns)}")
        
        # Classify columns into numeric and categorical
        numeric_columns = []
        categorical_columns = []
        column_types = {}
        
        for col in df.columns:
            dtype = df[col].dtype
            dtype_str = str(dtype)
            column_types[col] = dtype_str
            
            # Check if numeric
            if dtype in [pl.Int8, pl.Int16, pl.Int32, pl.Int64, pl.UInt8, pl.UInt16, pl.UInt32, pl.UInt64,
                         pl.Float32, pl.Float64]:
                numeric_columns.append(col)
            else:
                categorical_columns.append(col)
        
        logger.info(f"🔢 Numeric columns: {len(numeric_columns)}")
        logger.info(f"📝 Categorical columns: {len(categorical_columns)}")
        
        # Get unique values for categorical columns (limit to reduce payload size)
        unique_values = {}
        categorical_cols_to_process = categorical_columns[:15]  # Limit to prevent large payloads
        
        for col in categorical_cols_to_process:
            try:
                unique_vals = df[col].drop_nulls().unique().to_list()
                # Convert to strings and limit to first 30 unique values (reduced from 100)
                unique_values[col] = [str(val) for val in unique_vals[:30]]
            except Exception as e:
                logger.warning(f"⚠️ Could not get unique values for column '{col}': {e}")
                unique_values[col] = []
        
        logger.info(f"🎯 Unique values for {len(categorical_cols_to_process)} categorical columns")
        
        # Get sample data (reduced to 2 rows to minimize payload)
        try:
            sample_data = df.head(2).to_dicts()
            # Convert any non-serializable types
            for row in sample_data:
                for key, value in row.items():
                    if value is None:
                        continue
                    # Convert polars types to Python native types
                    if hasattr(value, 'item'):  # numpy/polars scalar
                        try:
                            row[key] = value.item()
                        except (AttributeError, ValueError):
                            row[key] = str(value)
                    elif isinstance(value, (pl.Date, pl.Datetime)):
                        row[key] = str(value)
        except Exception as e:
            logger.warning(f"⚠️ Could not get sample data: {e}")
            sample_data = []
        
        logger.info(f"📄 Sample data: {len(sample_data)} rows")
        
        response = {
            "file_id": df_id,
            "columns": all_columns,
            "numeric_columns": numeric_columns,
            "categorical_columns": categorical_columns,
            "unique_values": unique_values,
            "sample_data": sample_data,
            "row_count": len(df),
            "column_types": column_types,
            "object_name": request.object_name
        }
        
        logger.info(f"✅ Response prepared successfully")
        logger.info(f"🔍 ===== END RESPONSE LOG =====")
        
        return response
        
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"❌ Error loading file details: {e}")
        raise HTTPException(status_code=404, detail=f"Error loading file details for {request.object_name}: {str(e)}")

class SaveRequest(BaseModel):
    csv_data: str | None = None
    filename: str | None = None
    df_id: str | None = None
    overwrite_original: bool = False
    
    class Config:
        # Allow extra fields for forward compatibility
        extra = "allow"


@router.post("/save")
async def save_dataframe(payload: SaveRequest):
    """Save a dataframe session to MinIO, falling back to CSV payloads when no session is available."""
    import logging
    logger = logging.getLogger("dataframe_operations.save")

    df: pl.DataFrame | None = None
    session_id = payload.df_id

    logger.info(f"🔵 [SAVE] Starting save operation - df_id: {session_id}, filename: {payload.filename}")

    if session_id:
        logger.info(f"🔍 [SAVE] Looking for session: {session_id}")
        logger.info(f"🔍 [SAVE] Available sessions: {list(SESSIONS.keys())}")
        
        df = SESSIONS.get(session_id)
        if df is None and payload.csv_data is None:
            logger.error(f"❌ [SAVE] DataFrame session not found: {session_id}")
            raise HTTPException(status_code=404, detail="DataFrame session not found")
        
        if df is not None:
            logger.info(f"✅ [SAVE] Found dataframe in session: shape={df.shape}, columns={len(df.columns)}")
            logger.info(f"📊 [SAVE] DataFrame columns: {df.columns}")
            logger.info(f"📊 [SAVE] DataFrame dtypes: {dict(zip(df.columns, df.dtypes))}")
            
            # Log sample data to help debug dtype issues
            try:
                logger.info(f"📊 [SAVE] Sample row (first): {df.head(1).to_dicts()}")
            except Exception as sample_err:
                logger.warning(f"⚠️ [SAVE] Could not log sample data: {sample_err}")
        else:
            logger.warning(f"⚠️ [SAVE] Session {session_id} not found in SESSIONS")
    
    # 🔧 CRITICAL FIX: Only parse CSV if no session DataFrame was found
    if df is None:
        if not payload.csv_data:
            logger.error("❌ [SAVE] csv_data is required when df_id is missing")
            raise HTTPException(status_code=400, detail="csv_data is required when df_id is missing")
        try:
            logger.info(f"📥 [SAVE] Parsing CSV data (length: {len(payload.csv_data)} chars)")
            
            # 🔧 FIX: Use better schema inference to handle mixed types correctly
            # This prevents the "could not parse as i64" error when columns have mixed int/float values
            df = pl.read_csv(
                io.StringIO(payload.csv_data),
                infer_schema_length=10000,  # Scan more rows before inferring dtypes (default is ~100)
                ignore_errors=False,  # Don't ignore errors, but with better inference they shouldn't occur
                null_values=['', 'None', 'null', 'NULL', 'nan', 'NaN'],  # Explicit null handling
                try_parse_dates=True  # Auto-detect date columns
            )
            
            logger.info(f"✅ [SAVE] CSV parsed successfully: shape={df.shape}")
            logger.info(f"📊 [SAVE] Parsed dtypes: {dict(zip(df.columns, df.dtypes))}")
        except Exception as exc:
            logger.error(f"❌ [SAVE] Invalid csv_data: {exc}")
            logger.error(f"❌ [SAVE] Trying again with ignore_errors=True...")
            
            # 🔧 FALLBACK: If strict parsing fails, try with ignore_errors
            try:
                df = pl.read_csv(
                    io.StringIO(payload.csv_data),
                    infer_schema_length=10000,
                    ignore_errors=True,  # Be lenient with type mismatches
                    null_values=['', 'None', 'null', 'NULL', 'nan', 'NaN'],
                    try_parse_dates=True
                )
                logger.warning(f"⚠️ [SAVE] CSV parsed with ignore_errors=True: shape={df.shape}")
                logger.info(f"📊 [SAVE] Parsed dtypes: {dict(zip(df.columns, df.dtypes))}")
            except Exception as fallback_exc:
                logger.error(f"❌ [SAVE] Even fallback parsing failed: {fallback_exc}")
                raise HTTPException(status_code=400, detail=f"Invalid csv_data: {exc}") from exc

    # Handle filename based on overwrite_original flag
    if payload.overwrite_original:
        # Overwrite original file - use filename as-is
        if not payload.filename:
            raise HTTPException(status_code=400, detail="filename is required when overwriting original file")
        if not payload.filename.endswith('.arrow'):
            payload.filename += '.arrow'
        object_name = payload.filename
        logger.info(f"🔄 [SAVE] Overwriting original file: {object_name}")
    else:
        # Normal save - create new file in dataframe operations folder
        filename = (payload.filename or "").strip()
        if not filename:
            stub = (session_id or str(uuid.uuid4())).replace("-", "")[:8]
            filename = f"{stub}_dataframe_ops.arrow"
        if not filename.endswith(".arrow"):
            filename += ".arrow"

        logger.info(f"💾 [SAVE] Target filename: {filename}")

        prefix = await get_object_prefix()
        dfops_prefix = f"{prefix}dataframe operations/"
        logger.info(f"📁 [SAVE] MinIO prefix: {dfops_prefix}")
        
        try:
            minio_client.stat_object(MINIO_BUCKET, dfops_prefix)
        except S3Error:
            logger.info(f"📁 [SAVE] Creating prefix directory: {dfops_prefix}")
            minio_client.put_object(MINIO_BUCKET, dfops_prefix, io.BytesIO(b""), 0)

        object_name = f"{dfops_prefix}{filename}"
        logger.info(f"🎯 [SAVE] Full object name: {object_name}")
    
    # Set message based on operation type
    message = "Original file updated successfully" if payload.overwrite_original else "DataFrame saved successfully"

    try:

        # Add detailed dtype validation and conversion logging
        logger.info(f"🔍 [SAVE] Pre-save DataFrame inspection:")
        logger.info(f"   - Shape: {df.shape}")
        logger.info(f"   - Columns: {df.columns}")
        logger.info(f"   - Dtypes: {df.dtypes}")
        logger.info(f"   - Schema: {df.schema}")
        
        # Check for problematic dtypes
        for col_name, dtype in zip(df.columns, df.dtypes):
            logger.info(f"   - Column '{col_name}': dtype={dtype}, null_count={df[col_name].null_count()}")
            
        logger.info(f"🔄 [SAVE] Writing DataFrame to Arrow format...")
        arrow_buffer = io.BytesIO()
        try:
            df.write_ipc(arrow_buffer)
            logger.info(f"✅ [SAVE] Arrow write successful")
        except Exception as write_err:
            logger.error(f"❌ [SAVE] Arrow write failed: {write_err}")
            logger.error(f"❌ [SAVE] Error type: {type(write_err)}")
            logger.error(f"❌ [SAVE] DataFrame info at failure:")
            logger.error(f"   - Columns: {df.columns}")
            logger.error(f"   - Dtypes: {df.dtypes}")
            logger.error(f"   - Null counts: {[df[col].null_count() for col in df.columns]}")
            
            # Try to identify the problematic column
            for col in df.columns:
                try:
                    test_df = df.select([col])
                    test_buffer = io.BytesIO()
                    test_df.write_ipc(test_buffer)
                    logger.info(f"   ✅ Column '{col}' can be written to Arrow")
                except Exception as col_err:
                    logger.error(f"   ❌ Column '{col}' CANNOT be written to Arrow: {col_err}")
                    logger.error(f"      - dtype: {df[col].dtype}")
                    logger.error(f"      - sample values: {df[col].head(5).to_list()}")
            
            raise Exception(f"Failed to write DataFrame to Arrow format: {write_err}") from write_err
        
        arrow_bytes = arrow_buffer.getvalue()
        logger.info(f"📦 [SAVE] Arrow buffer size: {len(arrow_bytes)} bytes")
        
        logger.info(f"⬆️ [SAVE] Uploading to MinIO...")
        minio_client.put_object(
            MINIO_BUCKET,
            object_name,
            data=io.BytesIO(arrow_bytes),
            length=len(arrow_bytes),
            content_type="application/octet-stream",
        )
        logger.info(f"✅ [SAVE] Upload successful: {object_name}")

        response = {
            "result_file": object_name,
            "shape": df.shape,
            "columns": list(df.columns),
            "message": message,
            "overwrite_original": payload.overwrite_original,
        }
        if session_id:
            response["df_id"] = session_id
        
        logger.info(f"🎉 [SAVE] Save operation completed successfully")
        return response
    except HTTPException:
        raise
    except Exception as exc:
        logger.error(f"❌ [SAVE] Save operation failed with exception: {exc}")
        logger.error(f"❌ [SAVE] Exception type: {type(exc)}")
        import traceback
        logger.error(f"❌ [SAVE] Traceback: {traceback.format_exc()}")
        raise HTTPException(status_code=400, detail=str(exc)) from exc


# ---------------------------------------------------------------------------
# Backend dataframe operation endpoints
# ---------------------------------------------------------------------------


@router.post("/load")
async def load_dataframe(file: UploadFile = File(...)):
    """Load a CSV file and store it in a session via the task queue."""

    content = await file.read()
    submission = celery_task_client.submit_callable(
        name="dataframe_operations.load",
        dotted_path="app.features.dataframe_operations.service.load_dataframe_from_base64",
        kwargs={
            "content_b64": base64.b64encode(content).decode("utf-8"),
            "filename": file.filename,
        },
        metadata={
            "feature": "dataframe_operations",
            "operation": "load",
            "filename": file.filename,
        },
    )
    if submission.status == "failure":  # pragma: no cover - defensive
        raise HTTPException(status_code=400, detail="Failed to parse uploaded file")
    return format_task_response(submission, embed_result=True)


@router.post("/filter_rows")
async def filter_rows(
    df_id: str = Body(...),
    column: str = Body(...),
    value: Any = Body(...),
):
    submission = celery_task_client.submit_callable(
        name="dataframe_operations.filter_rows",
        dotted_path="app.features.dataframe_operations.service.filter_dataframe",
        kwargs={"df_id": df_id, "column": column, "value": value},
        metadata={
            "feature": "dataframe_operations",
            "operation": "filter_rows",
            "df_id": df_id,
            "column": column,
        },
    )
    if submission.status == "failure":  # pragma: no cover - defensive
        raise HTTPException(status_code=400, detail="Failed to filter dataframe")
    return format_task_response(submission, embed_result=True)


@router.post("/sort")
async def sort_dataframe(
    df_id: str = Body(...),
    column: str = Body(...),
    direction: str = Body("asc"),
):
    submission = celery_task_client.submit_callable(
        name="dataframe_operations.sort",
        dotted_path="app.features.dataframe_operations.service.sort_dataframe",
        kwargs={"df_id": df_id, "column": column, "direction": direction},
        metadata={
            "feature": "dataframe_operations",
            "operation": "sort",
            "df_id": df_id,
            "column": column,
            "direction": direction,
        },
    )
    if submission.status == "failure":  # pragma: no cover - defensive
        raise HTTPException(status_code=400, detail="Failed to sort dataframe")
    return format_task_response(submission, embed_result=True)


@router.post("/insert_row")
async def insert_row(
    df_id: str = Body(...),
    index: int = Body(...),
    direction: str = Body("below"),
):
    df = _get_df(df_id)
    empty = {col: None for col in df.columns}
    insert_at = index if direction == "above" else index + 1
    insert_at = max(0, min(insert_at, df.height))
    upper = df.slice(0, insert_at)
    lower = df.slice(insert_at, df.height - insert_at)
    df = pl.concat([upper, pl.DataFrame([empty], schema=df.schema), lower])
    SESSIONS[df_id] = df
    result = _df_payload(df, df_id)
    return result


@router.post("/delete_row")
async def delete_row(df_id: str = Body(...), index: int = Body(...)):
    df = _get_df(df_id)
    try:
        df = df.with_row_count().filter(pl.col("row_nr") != index).drop("row_nr")
    except Exception as e:
        raise HTTPException(status_code=400, detail=str(e))
    SESSIONS[df_id] = df
    result = _df_payload(df, df_id)
    return result


@router.post("/delete_rows_bulk")
async def delete_rows_bulk(df_id: str = Body(...), indices: list = Body(...)):
    df = _get_df(df_id)
    try:
        # Convert indices to a list of row numbers to exclude
        df = df.with_row_count().filter(~pl.col("row_nr").is_in(indices)).drop("row_nr")
    except Exception as e:
        raise HTTPException(status_code=400, detail=str(e))
    SESSIONS[df_id] = df
    result = _df_payload(df, df_id)
    return result


@router.post("/insert_column")
async def insert_column(
    df_id: str = Body(...),
    index: Optional[int] = Body(None),
    name: str = Body(...),
    default: Any = Body(None),
):
    df = _get_df(df_id)
    
    # Validate index
    if index is None:
        index = len(df.columns)
    if index < 0:
        index = 0
    elif index > len(df.columns):
        index = len(df.columns)
    
    # Add the new column with default value
    df = df.with_columns(pl.lit(default).alias(name))
    
    # Get all columns and reorder them
    cols = df.columns.copy()
    cols.remove(name)  # Remove the new column from the end
    cols.insert(index, name)  # Insert it at the specified position
    
    # Reorder the dataframe columns
    df = df.select(cols)
    
    SESSIONS[df_id] = df
    result = _df_payload(df, df_id)
    return result


@router.post("/delete_column")
async def delete_column(df_id: str = Body(...), name: str = Body(...)):
    df = _get_df(df_id)
    try:
        df = df.drop(name)
    except Exception as e:
        raise HTTPException(status_code=400, detail=str(e))
    SESSIONS[df_id] = df
    result = _df_payload(df, df_id)
    return result


@router.post("/edit_cell")
async def edit_cell(df_id: str = Body(...), row: int = Body(...), column: str = Body(...), value: Any = Body(...)):
    df = _get_df(df_id)
    try:
        df = df.with_row_count().with_columns(
            pl.when(pl.col("row_nr") == row)
            .then(pl.lit(value))
            .otherwise(pl.col(column))
            .alias(column)
        ).drop("row_nr")
    except Exception as e:
        raise HTTPException(status_code=400, detail=str(e))
    SESSIONS[df_id] = df
    result = _df_payload(df, df_id)
    return result


@router.post("/apply_formula")
async def apply_formula(
    df_id: str = Body(...),
    target_column: str = Body(...),
    formula: str = Body(...),
):
    """Apply a simple column-based formula to the dataframe."""
    import logging
    logger = logging.getLogger("dataframe_operations.apply_formula")
    
    logger.info(f"🔵 [APPLY_FORMULA] Starting - df_id: {df_id}, target_column: '{target_column}', formula: '{formula}'")
    
    df = _get_df(df_id)
    logger.info(f"📊 [APPLY_FORMULA] DataFrame shape: {df.shape}, columns: {df.columns}")
    
    expr = formula.strip()
    logger.info(f"📝 [APPLY_FORMULA] Original formula: '{formula}'")
    logger.info(f"📝 [APPLY_FORMULA] Processed expression: '{expr}'")
    
    # 🔧 FIX: Auto-add "=" prefix if formula contains function calls but doesn't start with "="
    if not expr.startswith("=") and any(func in expr.upper() for func in ["DIV", "SUM", "AVG", "MAX", "MIN", "IF", "CORR", "ZSCORE", "NORM"]):
        logger.info(f"🔧 [APPLY_FORMULA] Auto-adding '=' prefix to formula")
        expr = "=" + expr
    
    rows = df.to_dicts()
    if expr.startswith("="):
        expr_body = expr[1:].strip()
        corr_match = re.match(r"^CORR\(([^,]+),([^)]+)\)$", expr_body, re.IGNORECASE)
        if corr_match:
            cols = [c.strip() for c in corr_match.groups()]
            if len(cols) != 2:
                raise HTTPException(status_code=400, detail="CORR requires two columns")
            c1, c2 = cols
            try:
                corr_val = df.select(pl.corr(pl.col(c1), pl.col(c2))).to_series()[0]
            except Exception as e:
                raise HTTPException(status_code=400, detail=str(e))
            df = df.with_columns(pl.lit(corr_val).alias(target_column))
        else:
            zscore_pattern = re.compile(r"(?i)\b(ZSCORE|NORM)\s*\(([^)]+)\)")
            zscore_placeholders: List[Tuple[str, str]] = []

            def _capture_zscore(match: re.Match) -> str:
                column_name = match.group(2).strip()
                if (column_name.startswith("\"") and column_name.endswith("\"")) or (
                    column_name.startswith("'") and column_name.endswith("'")
                ):
                    column_name = column_name[1:-1]
                placeholder = f"__ZFUNC_{len(zscore_placeholders)}__"
                zscore_placeholders.append((placeholder, column_name))
                return placeholder

            expr_body_processed = zscore_pattern.sub(_capture_zscore, expr_body)
            expr_body_processed = _normalize_formula_functions(expr_body_processed)

            zscore_values: Dict[str, List[Any]] = {}
            if zscore_placeholders:
                for column_name in {col for _, col in zscore_placeholders}:
                    if column_name not in df.columns:
                        raise HTTPException(
                            status_code=400,
                            detail=f"Column '{column_name}' not found for ZSCORE/NORM",
                        )
                    try:
                        series = df.get_column(column_name)
                    except Exception as e:
                        raise HTTPException(status_code=400, detail=str(e))
                    try:
                        numeric_series = series.cast(pl.Float64, strict=False)
                        numeric_series = numeric_series.fill_nan(None)
                    except Exception as e:
                        raise HTTPException(
                            status_code=400,
                            detail=f"Column '{column_name}' could not be converted to numeric values for ZSCORE/NORM: {e}",
                        )

                    values = numeric_series.to_list()
                    valid_values = [
                        float(v)
                        for v in values
                        if v is not None and isinstance(v, Real) and math.isfinite(float(v))
                    ]

                    if not valid_values:
                        raise HTTPException(
                            status_code=400,
                            detail=f"Column '{column_name}' has no numeric values for ZSCORE/NORM",
                        )

                    mean_val = numeric_series.mean()
                    std_val = numeric_series.std()

                    mean_val_f: float | None = None
                    if isinstance(mean_val, Real) and math.isfinite(float(mean_val)):
                        mean_val_f = float(mean_val)

                    std_val_f: float | None = None
                    if isinstance(std_val, Real) and math.isfinite(float(std_val)):
                        std_val_f = float(std_val)

                    if mean_val_f is None:
                        raise HTTPException(
                            status_code=400,
                            detail=f"Unable to compute mean for column '{column_name}'",
                        )

                    if std_val_f is None or math.isclose(std_val_f, 0.0, rel_tol=1e-12, abs_tol=1e-12):
                        zscore_values[column_name] = [
                            None if v is None else 0.0
                            for v in values
                        ]
                    else:
                        zscore_values[column_name] = [
                            None
                            if v is None
                            else (float(v) - mean_val_f) / std_val_f
                            for v in values
                        ]

            # 🔧 FIX: Create case-insensitive column mapping for formula replacement
            column_map = {col.lower(): col for col in df.columns if col}
            logger.info(f"🔍 [APPLY_FORMULA] Available columns: {list(df.columns)}")
            logger.info(f"🔍 [APPLY_FORMULA] Column map (lowercase -> original): {column_map}")
            
            headers_pattern = "|".join(re.escape(h) for h in df.columns if h)
            regex = re.compile(f"\\b({headers_pattern})\\b", re.IGNORECASE) if headers_pattern else None
            logger.info(f"🔍 [APPLY_FORMULA] Column pattern: {headers_pattern[:100]}...")
            logger.info(f"🔍 [APPLY_FORMULA] Processed expression body: '{expr_body_processed}'")
            
            def replace_column(match):
                """Replace column name in formula with actual value, handling case-insensitive matching."""
                matched_col = match.group(0)
                # Try exact match first
                if matched_col in r:
                    return _format_value(r.get(matched_col))
                # Try case-insensitive match
                matched_lower = matched_col.lower()
                if matched_lower in column_map:
                    actual_col = column_map[matched_lower]
                    logger.debug(f"🔧 [APPLY_FORMULA] Case-insensitive match: '{matched_col}' -> '{actual_col}'")
                    return _format_value(r.get(actual_col))
                # If no match, return original (might be a function name)
                logger.warning(f"⚠️ [APPLY_FORMULA] Column '{matched_col}' not found in row, keeping as-is")
                return matched_col
            
            new_vals: List[Any] = []
            for row_idx, r in enumerate(rows):
                replaced = expr_body_processed
                if regex:
                    replaced = regex.sub(replace_column, replaced)
                    if row_idx == 0:  # Log first row replacement for debugging
                        logger.info(f"🔍 [APPLY_FORMULA] First row replacement: '{expr_body_processed}' -> '{replaced}'")
                if zscore_placeholders:
                    for placeholder, column_name in zscore_placeholders:
                        column_series = zscore_values.get(column_name)
                        z_val = (
                            column_series[row_idx]
                            if column_series is not None and row_idx < len(column_series)
                            else None
                        )
                        replaced = replaced.replace(placeholder, _format_value(z_val))
                try:
                    val = eval(replaced, SAFE_EVAL_GLOBALS, {})
                    if row_idx == 0:  # Log first row evaluation
                        logger.info(f"✅ [APPLY_FORMULA] First row eval: '{replaced}' -> {val}")
                except Exception as e:
                    import traceback
                    error_trace = traceback.format_exc()
                    logger.error(f"❌ [APPLY_FORMULA] Row {row_idx} evaluation failed:")
                    logger.error(f"   Expression: '{replaced}'")
                    logger.error(f"   Error: {e}")
                    logger.error(f"   Traceback: {error_trace}")
                    val = None
                new_vals.append(val)
            
            logger.info(f"📊 [APPLY_FORMULA] Generated {len(new_vals)} values, non-null: {sum(1 for v in new_vals if v is not None)}")
            df = df.with_columns(pl.Series(target_column, new_vals))
    else:
        logger.info(f"📝 [APPLY_FORMULA] No '=' prefix, treating as literal value")
        df = df.with_columns(pl.lit(expr).alias(target_column))
    
    logger.info(f"✅ [APPLY_FORMULA] Formula applied successfully, new DataFrame shape: {df.shape}")
    SESSIONS[df_id] = df
    result = _df_payload(df, df_id)
    logger.info(f"🎉 [APPLY_FORMULA] Operation completed, returning result with df_id: {result.get('df_id')}")
    return result

@router.post("/apply_udf")
async def apply_udf(
    df_id: str = Body(...),
    column: str = Body(...),
    udf_code: str = Body(...),
    new_column: str | None = Body(None),
):
    """Apply a custom scalar UDF using Polars with a Numba-compiled function."""
    df = _get_df(df_id)
    try:
        local_ns: Dict[str, Any] = {}
        exec("def _udf(x):\n    return " + udf_code, {}, local_ns)
        udf = nb.njit(local_ns["_udf"])  # type: ignore[arg-type]
        target = new_column or column
        df = df.with_columns(pl.col(column).apply(udf).alias(target))
    except Exception as e:
        raise HTTPException(status_code=400, detail=str(e))
    SESSIONS[df_id] = df
    return _df_payload(df, df_id)


@router.post("/rename_column")
async def rename_column(df_id: str = Body(...), old_name: str = Body(...), new_name: str = Body(...)):
    import logging
    logger = logging.getLogger("dataframe_operations.rename")
    
    df = _get_df(df_id)
    logger.info(f"🔵 [RENAME] Renaming column - df_id: {df_id}, old_name: '{old_name}', new_name: '{new_name}'")
    logger.info(f"📊 [RENAME] Current columns in dataframe: {df.columns}")
    logger.info(f"📊 [RENAME] Column exists: {old_name in df.columns}")
    
    if old_name not in df.columns:
        logger.error(f"❌ [RENAME] Column '{old_name}' not found in dataframe. Available: {df.columns}")
        raise HTTPException(status_code=400, detail=f"Column '{old_name}' not found. Available columns: {df.columns}")
    
    df = df.rename({old_name: new_name})
    logger.info(f"✅ [RENAME] After rename - columns: {df.columns}")
    
    SESSIONS[df_id] = df
    result = _df_payload(df, df_id)
    return result


@router.post("/duplicate_row")
async def duplicate_row(df_id: str = Body(...), index: int = Body(...)):
    df = _get_df(df_id)
    try:
        row = df.slice(index, 1)
        df = pl.concat([df.slice(0, index), row, df.slice(index, df.height - index)])
    except Exception as e:
        raise HTTPException(status_code=400, detail=str(e))
    SESSIONS[df_id] = df
    result = _df_payload(df, df_id)
    return result


@router.post("/duplicate_column")
async def duplicate_column(df_id: str = Body(...), name: str = Body(...), new_name: str = Body(...)):
    """Duplicate a column and place it right after the original column."""
    df = _get_df(df_id)
    
    try:
        # Validate that the source column exists
        if name not in df.columns:
            raise HTTPException(status_code=404, detail=f"Column '{name}' not found")
        
        # Get the position of the original column
        original_idx = df.columns.index(name)
        
        # Duplicate the column with the new name
        df = df.with_columns(pl.col(name).alias(new_name))
        
        # Get all columns and reorder them
        all_columns = df.columns.copy()
        
        # Remove the new column from the end
        all_columns.remove(new_name)
        
        # Insert the new column right after the original column
        insert_position = original_idx + 1
        all_columns.insert(insert_position, new_name)
        
        # Reorder the dataframe with the new column order
        df = df.select(all_columns)
        
        print(f"[Backend] Duplicated column '{name}' as '{new_name}' at position {insert_position}")
        print(f"[Backend] New column order: {all_columns}")
        
    except HTTPException:
        raise  # Re-raise HTTP exceptions as-is
    except Exception as e:
        raise HTTPException(status_code=400, detail=f"Duplicate column operation failed: {str(e)}")
    
    SESSIONS[df_id] = df
    result = _df_payload(df, df_id)
    return result


@router.post("/move_column")
async def move_column(df_id: str = Body(...), from_col: str = Body(..., alias="from"), to_index: int = Body(...)):
    df = _get_df(df_id)
    try:
        cols = df.columns
        
        # Validate column exists
        if from_col not in cols:
            available_cols = ", ".join(cols)
            raise HTTPException(
                status_code=400, 
                detail=f"Column '{from_col}' not found. Available columns: {available_cols}"
            )
        
        # Validate to_index is within bounds
        if to_index < 0 or to_index >= len(cols):
            raise HTTPException(
                status_code=400, 
                detail=f"Index {to_index} is out of bounds. Valid range: 0-{len(cols)-1} (total columns: {len(cols)})"
            )
        
        cols.remove(from_col)
        cols.insert(to_index, from_col)
        df = df.select(cols)
    except HTTPException:
        raise  # Re-raise HTTP exceptions as-is
    except Exception as e:
        raise HTTPException(status_code=400, detail=f"Move column operation failed: {str(e)}")
    SESSIONS[df_id] = df
    result = _df_payload(df, df_id)
    return result


@router.post("/retype_column")
async def retype_column(df_id: str = Body(...), name: str = Body(...), new_type: str = Body(...)):
    df = _get_df(df_id)
    try:
        if new_type == "number":
            df = df.with_columns(pl.col(name).cast(pl.Float64, strict=False))
        elif new_type in ["string", "text"]:
            df = df.with_columns(pl.col(name).cast(pl.Utf8))
        else:
            df = df.with_columns(pl.col(name).cast(pl.Utf8))
    except Exception as e:
        raise HTTPException(status_code=400, detail=str(e))
    SESSIONS[df_id] = df
    result = _df_payload(df, df_id)
    return result


@router.post("/round_column")
async def round_column(df_id: str = Body(...), name: str = Body(...), decimal_places: int = Body(...)):
    df = _get_df(df_id)
    try:
        # Round the specified column to the given decimal places
        df = df.with_columns(pl.col(name).round(decimal_places))
    except Exception as e:
        raise HTTPException(status_code=400, detail=str(e))
    SESSIONS[df_id] = df
    result = _df_payload(df, df_id)
    return result


@router.post("/transform_column_case")
async def transform_column_case(df_id: str = Body(...), column: str = Body(...), case_type: str = Body(...)):
    """Transform the case of text values in a column with various case styles."""
    df = _get_df(df_id)
    
    if column not in df.columns:
        raise HTTPException(status_code=404, detail=f"Column '{column}' not found")
    
    try:
        # Convert column to string first to handle any data type
        df = df.with_columns(pl.col(column).cast(pl.Utf8))
        
        if case_type == "lower":
            # Convert to lowercase
            df = df.with_columns(pl.col(column).str.to_lowercase())
        elif case_type == "upper":
            # Convert to uppercase
            df = df.with_columns(pl.col(column).str.to_uppercase())
        elif case_type == "pascal":
            # Pascal Case: FirstLetterOfEachWord
            df = df.with_columns(
                pl.col(column).map_elements(
                    lambda x: ''.join(word.capitalize() for word in re.split(r'[\s_\-]+', x)) if isinstance(x, str) and x.strip() else x,
                    return_dtype=pl.Utf8
                )
            )
        elif case_type == "lower_camel":
            # Lower Camel Case: firstLetterOfEachWord
            df = df.with_columns(
                pl.col(column).map_elements(
                    lambda x: ''.join(word.capitalize() if i > 0 else word.lower() for i, word in enumerate(re.split(r'[\s_\-]+', x))) if isinstance(x, str) and x.strip() else x,
                    return_dtype=pl.Utf8
                )
            )
        elif case_type == "snake":
            # Snake Case: snake_case
            df = df.with_columns(
                pl.col(column).map_elements(
                    lambda x: re.sub(r'(?<!^)(?=[A-Z])', '_', re.sub(r'[\s\-]+', '_', x)).lower() if isinstance(x, str) and x.strip() else x,
                    return_dtype=pl.Utf8
                )
            )
        elif case_type == "screaming_snake":
            # Screaming Snake Case: SCREAMING_SNAKE_CASE
            df = df.with_columns(
                pl.col(column).map_elements(
                    lambda x: re.sub(r'(?<!^)(?=[A-Z])', '_', re.sub(r'[\s\-]+', '_', x)).upper() if isinstance(x, str) and x.strip() else x,
                    return_dtype=pl.Utf8
                )
            )
        elif case_type == "kebab":
            # Kebab Case: kebab-case
            df = df.with_columns(
                pl.col(column).map_elements(
                    lambda x: re.sub(r'(?<!^)(?=[A-Z])', '-', re.sub(r'[\s_]+', '-', x)).lower() if isinstance(x, str) and x.strip() else x,
                    return_dtype=pl.Utf8
                )
            )
        elif case_type == "train":
            # Train Case: Train-Case
            df = df.with_columns(
                pl.col(column).map_elements(
                    lambda x: '-'.join(word.capitalize() for word in re.split(r'[\s_\-]+', x)) if isinstance(x, str) and x.strip() else x,
                    return_dtype=pl.Utf8
                )
            )
        elif case_type == "flat":
            # Flat Case: flatcase
            df = df.with_columns(
                pl.col(column).map_elements(
                    lambda x: re.sub(r'[\s_\-]+', '', x).lower() if isinstance(x, str) and x.strip() else x,
                    return_dtype=pl.Utf8
                )
            )
        else:
            raise HTTPException(status_code=400, detail=f"Invalid case_type '{case_type}'. Supported types: lower, upper, pascal, lower_camel, snake, screaming_snake, kebab, train, flat")
            
    except Exception as e:
        raise HTTPException(status_code=400, detail=str(e))
    
    SESSIONS[df_id] = df
    result = _df_payload(df, df_id)
    return result


@router.get("/preview")
async def preview(df_id: str, n: int = 5):
    df = _get_df(df_id)
    preview_df = df.head(n)
    return {
        "df_id": df_id,
        "headers": df.columns,
        "rows": preview_df.to_dicts(),
    }


@router.get("/info")
async def info(df_id: str):
    df = _get_df(df_id)
    return {
        "df_id": df_id,
        "row_count": df.height,
        "column_count": df.width,
        "types": {col: str(dtype) for col, dtype in zip(df.columns, df.dtypes)},
    }


@router.post("/describe_column")
async def describe_column(df_id: str = Body(...), column: str = Body(...)):
    """Get statistical description of a specific column."""
    df = _get_df(df_id)
    
    if column not in df.columns:
        raise HTTPException(status_code=404, detail=f"Column '{column}' not found")
    
    try:
        series = df.get_column(column)
        dtype = str(series.dtype)
        
        # Check if column is numeric
        is_numeric = dtype in ['Float64', 'Int64', 'Float32', 'Int32', 'Float16', 'Int16', 'Int8', 'UInt8', 'UInt16', 'UInt32', 'UInt64']
        
        # Basic stats that apply to all columns
        total_count = len(series)
        null_count = series.null_count()
        non_null_count = total_count - null_count
        unique_count = series.n_unique()
        
        result = {
            "column": column,
            "dtype": dtype,
            "is_numeric": is_numeric,
            "total_count": total_count,
            "null_count": null_count,
            "non_null_count": non_null_count,
            "unique_count": unique_count,
            "null_percentage": round((null_count / total_count) * 100, 2) if total_count > 0 else 0,
        }
        
        if is_numeric and non_null_count > 0:
            # Convert to numeric for calculations
            numeric_series = series.cast(pl.Float64, strict=False).fill_nan(None)
            
            # Calculate numeric statistics
            try:
                mean_val = numeric_series.mean()
                median_val = numeric_series.median()
                std_val = numeric_series.std()
                min_val = numeric_series.min()
                max_val = numeric_series.max()
                sum_val = numeric_series.sum()
                
                # Calculate quartiles
                q25 = numeric_series.quantile(0.25)
                q75 = numeric_series.quantile(0.75)
                
                result.update({
                    "mean": float(mean_val) if mean_val is not None else None,
                    "median": float(median_val) if median_val is not None else None,
                    "std": float(std_val) if std_val is not None else None,
                    "min": float(min_val) if min_val is not None else None,
                    "max": float(max_val) if max_val is not None else None,
                    "sum": float(sum_val) if sum_val is not None else None,
                    "q25": float(q25) if q25 is not None else None,
                    "q75": float(q75) if q75 is not None else None,
                    "range": float(max_val - min_val) if max_val is not None and min_val is not None else None,
                })
            except Exception as e:
                # If numeric calculations fail, mark as non-numeric
                result["is_numeric"] = False
                result["numeric_error"] = str(e)
        else:
            # For categorical columns, show NaN for mathematical operations
            result.update({
                "mean": None,
                "median": None,
                "std": None,
                "min": None,
                "max": None,
                "sum": None,
                "q25": None,
                "q75": None,
                "range": None,
            })
            
            # For categorical columns, show most frequent values
            if non_null_count > 0:
                try:
                    value_counts = series.value_counts().sort("count", descending=True)
                    top_values = value_counts.head(5).to_dicts()
                    result["top_values"] = [
                        {"value": str(item["column"]), "count": item["count"]} 
                        for item in top_values
                    ]
                except Exception:
                    result["top_values"] = []
        
        return result
        
    except Exception as e:
        raise HTTPException(status_code=400, detail=f"Error describing column: {str(e)}")


@router.post("/ai/execute_operations")
async def ai_execute(df_id: str = Body(...), operations: List[Dict[str, Any]] = Body(...)):
    df = _get_df(df_id)
    for op in operations:
        name = op.get("op")
        params = op.get("params", {})
        if name == "filter_rows":
            df = df.filter(pl.col(params.get("column")) == params.get("value"))
        elif name == "sort":
            df = df.sort(params.get("column"), descending=params.get("direction", "asc") != "asc")
        elif name == "insert_column":
            idx = params.get("index", len(df.columns))
            df = df.with_columns(pl.lit(params.get("default")).alias(params.get("name")))
            cols = df.columns
            cols.remove(params.get("name"))
            cols.insert(idx, params.get("name"))
            df = df.select(cols)
        elif name == "delete_row":
            df = df.with_row_count().filter(pl.col("row_nr") != params.get("index")).drop("row_nr")
        elif name == "edit_cell":
            df = df.with_row_count().with_columns(
                pl.when(pl.col("row_nr") == params.get("row"))
                .then(pl.lit(params.get("value")))
                .otherwise(pl.col(params.get("column")))
                .alias(params.get("column"))
            ).drop("row_nr")
    SESSIONS[df_id] = df
    return _df_payload(SESSIONS[df_id], df_id)

@router.post("/find_and_replace")
async def find_and_replace(
    df_id: str = Body(...), 
    find_text: str = Body(...), 
    replace_text: str = Body(...),
    replace_all: bool = Body(False),
    case_sensitive: bool = Body(False)
):
    df = _get_df(df_id)
    try:
        # Search and replace in all columns by converting them to strings
        all_columns = df.columns
        
        if not all_columns:
            raise HTTPException(status_code=400, detail="No columns found to search")
        
        # Apply find and replace to all columns
        expressions = []
        for col in all_columns:
            try:
                # Convert column to string and handle nulls
                string_col = pl.col(col).cast(pl.Utf8).fill_null("")
                
                if case_sensitive:
                    # Case sensitive replacement
                    if replace_all:
                        expr = string_col.str.replace_all(find_text, replace_text, literal=True)
                    else:
                        expr = string_col.str.replace(find_text, replace_text, literal=True)
                else:
                    # Case insensitive replacement using map_elements for better control
                    def case_insensitive_replace(text, find_text, replace_text, replace_all=False):
                        if not text or not find_text:
                            return text
                        text_str = str(text)
                        find_lower = find_text.lower()
                        text_lower = text_str.lower()
                        
                        if replace_all:
                            # Replace all occurrences
                            result = text_str
                            start = 0
                            while True:
                                pos = text_lower.find(find_lower, start)
                                if pos == -1:
                                    break
                                # Replace with original case preserved
                                result = result[:pos] + replace_text + result[pos + len(find_text):]
                                text_lower = result.lower()
                                start = pos + len(replace_text)
                            return result
                        else:
                            # Replace first occurrence only
                            pos = text_lower.find(find_lower)
                            if pos != -1:
                                return text_str[:pos] + replace_text + text_str[pos + len(find_text):]
                            return text_str
                    
                    if replace_all:
                        expr = string_col.map_elements(
                            lambda x: case_insensitive_replace(x, find_text, replace_text, True),
                            return_dtype=pl.Utf8
                        )
                    else:
                        expr = string_col.map_elements(
                            lambda x: case_insensitive_replace(x, find_text, replace_text, False),
                            return_dtype=pl.Utf8
                        )
                
                expressions.append(expr.alias(col))
                
            except Exception as col_error:
                # If column conversion fails, try a more robust approach
                try:
                    if case_sensitive:
                        if replace_all:
                            expr = pl.col(col).map_elements(
                                lambda x: str(x).replace(find_text, replace_text) if x is not None else "",
                                return_dtype=pl.Utf8
                            )
                        else:
                            expr = pl.col(col).map_elements(
                                lambda x: str(x).replace(find_text, replace_text, 1) if x is not None else "",
                                return_dtype=pl.Utf8
                            )
                    else:
                        def case_insensitive_replace_fallback(text, find_text, replace_text, replace_all=False):
                            if not text or not find_text:
                                return text
                            text_str = str(text)
                            find_lower = find_text.lower()
                            text_lower = text_str.lower()
                            
                            if replace_all:
                                # Replace all occurrences
                                result = text_str
                                start = 0
                                while True:
                                    pos = text_lower.find(find_lower, start)
                                    if pos == -1:
                                        break
                                    # Replace with original case preserved
                                    result = result[:pos] + replace_text + result[pos + len(find_text):]
                                    text_lower = result.lower()
                                    start = pos + len(replace_text)
                                return result
                            else:
                                # Replace first occurrence only
                                pos = text_lower.find(find_lower)
                                if pos != -1:
                                    return text_str[:pos] + replace_text + text_str[pos + len(find_text):]
                                return text_str
                        
                        if replace_all:
                            expr = pl.col(col).map_elements(
                                lambda x: case_insensitive_replace_fallback(x, find_text, replace_text, True) if x is not None else "",
                                return_dtype=pl.Utf8
                            )
                        else:
                            expr = pl.col(col).map_elements(
                                lambda x: case_insensitive_replace_fallback(x, find_text, replace_text, False) if x is not None else "",
                                return_dtype=pl.Utf8
                            )
                    
                    expressions.append(expr.alias(col))
                    
                except Exception as fallback_error:
                    # If all else fails, keep the original column
                    expressions.append(pl.col(col))
        
        # Apply the expressions
        df = df.with_columns(expressions)
        
    except Exception as e:
        raise HTTPException(status_code=400, detail=str(e))
    
    SESSIONS[df_id] = df
    result = _df_payload(df, df_id)
    return result

@router.post("/count_matches")
async def count_matches(
    df_id: str = Body(...), 
    find_text: str = Body(...), 
    case_sensitive: bool = Body(False)
):
    """Count occurrences of text in the dataframe."""
    df = _get_df(df_id)
    try:
        # Search in all columns by converting them to strings
        all_columns = df.columns
        
        if not all_columns:
            return {"total_matches": 0, "matches_by_column": {}, "string_columns": []}
        
        total_matches = 0
        matches_by_column = {}
        
        for col in all_columns:
            try:
                # Convert column to string and handle nulls
                string_col = pl.col(col).cast(pl.Utf8).fill_null("")
                
                if case_sensitive:
                    # Case sensitive search
                    matches = df.select(
                        string_col.str.count_matches(find_text, literal=True).sum()
                    ).item()
                else:
                    # Case insensitive search - convert both search term and column data to lowercase
                    matches = df.select(
                        string_col.str.to_lowercase().str.count_matches(find_text.lower(), literal=True).sum()
                    ).item()
                
                matches_by_column[col] = matches
                total_matches += matches
                
            except Exception as col_error:
                # If column conversion fails, try a different approach
                try:
                    # Try using map_elements for more robust string conversion
                    if case_sensitive:
                        matches = df.select(
                            pl.col(col).map_elements(
                                lambda x: str(x).count(find_text) if x is not None else 0,
                                return_dtype=pl.Int64
                            ).sum()
                        ).item()
                    else:
                        matches = df.select(
                            pl.col(col).map_elements(
                                lambda x: str(x).lower().count(find_text.lower()) if x is not None else 0,
                                return_dtype=pl.Int64
                            ).sum()
                        ).item()
                    
                    matches_by_column[col] = matches
                    total_matches += matches
                    
                except Exception as fallback_error:
                    # If all else fails, set matches to 0 for this column
                    matches_by_column[col] = 0
        
        return {
            "total_matches": total_matches,
            "matches_by_column": matches_by_column,
            "string_columns": [col for col in all_columns if df[col].dtype == pl.Utf8],
            "all_columns": all_columns
        }
        
    except Exception as e:
        raise HTTPException(status_code=400, detail=str(e))