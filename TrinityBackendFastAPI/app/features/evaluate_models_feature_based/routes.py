# routes.py
from fastapi import APIRouter, HTTPException, Query, Form
from typing import Optional, List, Dict, Any, Tuple
from urllib.parse import urlparse
from io import BytesIO
import logging
import os
import mimetypes
import io
import json
from datetime import datetime

import numpy as np
import pandas as pd

from minio import Minio
from minio.error import S3Error

# Arrow/Parquet libs for reading
import pyarrow as pa
import pyarrow.compute as pc
import pyarrow.feather as feather
import pyarrow.parquet as pq

# MinIO client initialization (same pattern as feature_overview)
MINIO_ENDPOINT = os.getenv("MINIO_ENDPOINT", "minio:9000")
MINIO_ACCESS_KEY = os.getenv("MINIO_ACCESS_KEY", "admin_dev")
MINIO_SECRET_KEY = os.getenv("MINIO_SECRET_KEY", "pass_dev")
MINIO_BUCKET = os.getenv("MINIO_BUCKET", "trinity")

minio_client = Minio(
    MINIO_ENDPOINT,
    access_key=MINIO_ACCESS_KEY,
    secret_key=MINIO_SECRET_KEY,
    secure=False,  # Set to True if using HTTPS
)

from app.core.task_queue import celery_task_client, format_task_response

from .config import settings
from .database import get_authenticated_client, MONGO_DB
from .schemas import (
    MinioObject, ListObjectsResponse,
    SelectedModelRow, SelectedModelsResponse,
    PerformanceMetrics, ActualPredictedItem, ActualPredictedResponse,
    ContributionsItem, ContributionsResponse,
    IdentifiersResponse,
)
from .service import (
    compute_actual_vs_predicted,
    compute_contributions_yoy,
    compute_yoy_growth,
    list_selected_models,
)

logger = logging.getLogger("evaluate-atom")
router = APIRouter(tags=["MinIO"])


# ---------- Helpers ----------
def _endpoint_from_url(url: str) -> str:
    """
    Accepts either 'http(s)://host:port' or 'host:port' and returns 'host:port'
    as required by Minio(..., secure=...).
    """
    parsed = urlparse(url)
    if parsed.scheme:
        return parsed.netloc or parsed.path
    return url


def _infer_content_type(key: str) -> str:
    ctype, _ = mimetypes.guess_type(key)
    return ctype or "application/octet-stream"


def _extract_betas_from_results_file(results_df: pd.DataFrame, combination_id: str) -> tuple[Dict[str, float], float, Dict[str, Any]]:
    """
    Extract betas, intercept, and transformation metadata from the results file for a specific combination.
    Returns a tuple of (betas_dict, intercept_value, transformation_metadata).
    """
    # Find combination_id column (case-insensitive)
    combination_id_column = None
    for col in results_df.columns:
        col_lower = col.lower()
        if (col_lower == 'combination_id' or 
            col_lower == 'combo_id' or 
            col_lower == 'combinationid' or
            'combination_id' in col_lower or 
            'combo_id' in col_lower or 
            'combination' in col_lower):
            combination_id_column = col
            break
    
    if not combination_id_column:
        raise HTTPException(status_code=404, detail="No combination_id column found in results file")
    
    # Find selected_models column (case-insensitive)
    selected_models_column = None
    for col in results_df.columns:
        col_lower = col.lower()
        if (col_lower == 'selected_models' or 
            col_lower == 'selectedmodels' or
            'selected_models' in col_lower or 
            'selectedmodels' in col_lower):
            selected_models_column = col
            break
    
    if not selected_models_column:
        raise HTTPException(status_code=404, detail="No selected_models column found in results file")
    
    # Filter by combination_id AND selected_models = 'yes'
    filtered_df = results_df[
        (results_df[combination_id_column] == combination_id) & 
        (results_df[selected_models_column].str.lower() == 'yes')
    ]
    
    if filtered_df.empty:
        raise HTTPException(status_code=404, detail=f"No data found for combination_id: {combination_id} with selected_models = 'yes'")
    
    # Get the first row (should be only one for a specific combination)
    combination_row = filtered_df.iloc[0]
    
    # Extract intercept
    intercept = 0.0
    if 'intercept' in results_df.columns:
        intercept_value = combination_row['intercept']
        if pd.notna(intercept_value):
            intercept = float(intercept_value)
    
    # Find columns that end with _beta
    beta_columns = []
    for col in results_df.columns:
        if col.lower().endswith('_beta'):
            beta_columns.append(col)
    
    if not beta_columns:
        raise HTTPException(status_code=404, detail="No beta columns found in results file")
    
    # Extract beta data and create mapping
    betas = {}
    for col in beta_columns:
        value = combination_row[col]
        
        if pd.notna(value):
            # Extract variable name from column (remove _beta suffix)
            variable_name = col.replace('_beta', '').replace('_Beta', '')
            betas[variable_name] = float(value)
    
    # Extract transformation metadata (if available)
    transformation_metadata = {}
    if 'transformation_metadata' in results_df.columns:
        metadata_value = combination_row['transformation_metadata']
        if pd.notna(metadata_value):
            # Try to parse as JSON if it's a string
            if isinstance(metadata_value, str):
                try:
                    transformation_metadata = json.loads(metadata_value)
                except json.JSONDecodeError:
                    logger.warning(f"Failed to parse transformation_metadata as JSON: {metadata_value}")
            elif isinstance(metadata_value, dict):
                transformation_metadata = metadata_value
    
    return betas, intercept, transformation_metadata


# ---------- Arrow readers / filters ----------
_ALLOWED_EXT = {".parquet", ".feather", ".arrow"}


def _read_table_from_bytes(key: str, buf: BytesIO) -> pa.Table:
    """Read a pyarrow Table from object bytes based on extension."""
    ext = os.path.splitext(key)[1].lower()
    buf.seek(0)
    if ext == ".parquet":
        return pq.read_table(buf)
    if ext in {".feather", ".arrow"}:
        return feather.read_table(buf)
    # Fallback: try Feather then Parquet
    try:
        buf.seek(0)
        return feather.read_table(buf)
    except Exception:
        buf.seek(0)
        return pq.read_table(buf)


def _filter_selected(table: pa.Table) -> pa.Table:
    """
    Keep rows where selected_models ∈ {selected,true,yes,1} (case-insensitive).
    If the column is missing, returns 0 rows.
    """
    if "selected_models" not in table.column_names:
        return table.slice(0, 0)
    col = table["selected_models"]
    col_str = pc.utf8_lower(pc.cast(col, pa.string()))
    accepted = pa.array(["selected", "true", "yes", "1"])
    mask = pc.is_in(col_str, value_set=accepted)
    return table.filter(mask)


_RETURN_COLS = [
    "Scope",
    "combination_id",
    "y_variable",
    "x_variables",
    "model_name",
    "mape_train",
    "mape_test",
    "r2_train",
    "r2_test",
    "aic",
    "bic",
    "price_elasticity",
    "run_id",
    "timestamp",
    "selected_models",
]


def _table_to_records(table: pa.Table) -> List[Dict[str, Any]]:
    """Keep known columns (if present) and convert to list[dict]."""
    keep = [c for c in _RETURN_COLS if c in table.column_names]
    if keep:
        table = table.select(keep)
    return table.to_pylist()


# ---------- Pandas-based helpers for charts ----------
def _read_minio_dataframe(client: Minio, bucket: str, key: str) -> pd.DataFrame:
    try:
        resp = client.get_object(bucket, key)
        data = resp.read()
        resp.close()
        resp.release_conn()
        
        lk = key.lower()
        
        if lk.endswith(".parquet"):
            return pd.read_parquet(io.BytesIO(data))
        if lk.endswith(".feather") or lk.endswith(".arrow"):
            return pd.read_feather(io.BytesIO(data))
        if lk.endswith(".csv"):
            return pd.read_csv(io.BytesIO(data))
        
        # fallback: try parquet -> feather
        try:
            return pd.read_parquet(io.BytesIO(data))
        except Exception as e:
            return pd.read_feather(io.BytesIO(data))
            
    except Exception as e:
        logger.error(f"Error in _read_minio_dataframe: {str(e)}")
        raise


def _truthy_selected(val: Any) -> bool:
    if val is None:
        return False
    s = str(val).strip().lower()
    return s in {"selected", "true", "yes", "1", "y"}


def _collect_selected_rows(results_df: pd.DataFrame) -> List[Tuple[str, str]]:
    # Find columns case-insensitively
    combination_col = None
    model_name_col = None
    selected_models_col = None
    
    for col in results_df.columns:
        col_lower = col.lower()
        if col_lower == 'combination_id':
            combination_col = col
        elif col_lower == 'model_name':
            model_name_col = col
        elif col_lower == 'selected_models':
            selected_models_col = col
    
    missing_cols = []
    if not combination_col:
        missing_cols.append('combination_id')
    if not model_name_col:
        missing_cols.append('model_name')
    
    if missing_cols:
        raise HTTPException(
            status_code=400,
            detail=f"Results file missing required columns: {missing_cols}. Available columns: {list(results_df.columns)}",
        )
    
    # If selected_models column doesn't exist, use all rows (backward compatibility)
    if not selected_models_col:
        logger.warning("No selected_models column found in dataset, using all data")
        return [(str(r[combination_col]), str(r[model_name_col])) for _, r in results_df.iterrows()]
    
    rows = results_df[results_df[selected_models_col].apply(_truthy_selected)]
    
    return [(str(r[combination_col]), str(r[model_name_col])) for _, r in rows.iterrows()]


async def _get_build_config(client_name: str, app_name: str, project_name: str):
    # Use the shared MongoDB client from database.py (same pattern as select atom)
    from .database import get_build_config
    
    try:
        # Use the get_build_config function from database.py
        build_config = await get_build_config(client_name, app_name, project_name)
        
        return build_config
        
    except Exception as e:
        # logger.error(f"Failed to get build configuration: {str(e)}")
        raise HTTPException(status_code=500, detail=f"Failed to get build configuration: {str(e)}")


def _coeff_pack(build_cfg: dict, combination_name: str, model_name: str):
    mc = build_cfg.get("model_coefficients", {})
    
    m_for_combo = mc.get(combination_name, {})
    
    coeffs = m_for_combo.get(model_name, {})
    if not coeffs:
        # logger.error(f"No coefficients found for {combination_name} / {model_name}")
        raise HTTPException(status_code=404, detail=f"No coefficients for {combination_name} / {model_name}")
    
    intercept = float(coeffs.get("intercept", 0.0))
    x_vars = coeffs.get("x_variables") or list((coeffs.get("coefficients") or {}).keys())
    if not x_vars:
        raise HTTPException(status_code=400, detail=f"No x_variables for {combination_name} / {model_name}")
    
    y_var = coeffs.get("y_variable") or build_cfg.get("y_variable") or "Volume"
    betas = coeffs.get("coefficients") or {}
    
    # Fix: Create a mapping from x_var names to their beta values
    # The betas dictionary has keys like "Beta_SalesValue" but x_vars has "SalesValue"
    beta_mapping = {}
    for x_var in x_vars:
        beta_key = f"Beta_{x_var}"
        if beta_key in betas:
            beta_mapping[x_var] = betas[beta_key]
        else:
            # Fallback: try to find any key that contains the x_var name
            for beta_key, beta_value in betas.items():
                if x_var in beta_key:
                    beta_mapping[x_var] = beta_value
                    break
            else:
                beta_mapping[x_var] = 0.0
    
    return intercept, beta_mapping, x_vars, y_var


def _file_key_for_combo(build_cfg: dict, combination_name: str) -> str:
    combination_file_keys = build_cfg.get("combination_file_keys", [])
    
    for item in combination_file_keys:
        if item.get("combination") == combination_name:
            file_key = item.get("file_key")
            return file_key
    
    # logger.error(f"No file key found for combination '{combination_name}'")
    raise HTTPException(status_code=404, detail=f"No file key found for combination '{combination_name}'")


def _predict_series(df: pd.DataFrame, intercept: float, betas: Dict[str, float], x_vars: List[str]) -> np.ndarray:
    # missing columns -> treat as 0
    pred = np.full(len(df), intercept, dtype=float)
    for x in x_vars:
        if x in df.columns:
            pred += betas.get(x, 0.0) * pd.to_numeric(df[x], errors="coerce").fillna(0.0).to_numpy(dtype=float)
    return pred


def _metrics(actual: np.ndarray, pred: np.ndarray) -> Dict[str, float]:
    if len(actual) == 0:
        return {"mae": 0.0, "mse": 0.0, "rmse": 0.0, "r2": 0.0, "mape": 0.0}
    from sklearn.metrics import mean_absolute_error, mean_squared_error, r2_score

    mae = float(mean_absolute_error(actual, pred))
    mse = float(mean_squared_error(actual, pred))
    rmse = float(mse ** 0.5)
    r2 = float(r2_score(actual, pred)) if np.isfinite(actual).all() and np.isfinite(pred).all() else 0.0
    mape = (
        float(np.mean([abs((a - p) / a) for a, p in zip(actual, pred) if a != 0.0]) * 100)
        if np.any(actual != 0)
        else 0.0
    )
    return {"mae": mae, "mse": mse, "rmse": rmse, "r2": r2, "mape": mape}


def _year_col(df: pd.DataFrame) -> Optional[str]:
    for c in ["year"]:  # Since columns are converted to lowercase
        if c in df.columns:
            return c
    return None


# ---------- Routes ----------

@router.get("/files", response_model=ListObjectsResponse)
def list_minio_files(
    bucket: str = Query(default=MINIO_BUCKET, description="Bucket to list"),
    prefix: Optional[str] = Query(default=None, description="Prefix filter (e.g. 'runs/2024/')"),
    recursive: bool = Query(default=True, description="Recurse into subfolders"),
    limit: int = Query(default=1000, ge=1, le=10000, description="Max objects to return"),
):
    """
    List objects from a MinIO bucket. By default lists model result files from the
    evaluation source bucket (settings.minio_source_bucket_name = 'model_results').
    """
    try:
        if not minio_client.bucket_exists(bucket):
            raise HTTPException(status_code=404, detail=f"Bucket '{bucket}' not found")

        items: List[MinioObject] = []
        for obj in minio_client.list_objects(bucket, prefix=prefix or "", recursive=recursive):
            items.append(
                MinioObject(
                    name=getattr(obj, "object_name", ""),
                    size=int(getattr(obj, "size", 0) or 0),
                    etag=getattr(obj, "etag", None),
                    last_modified=getattr(obj, "last_modified", None),
                    is_dir=bool(getattr(obj, "is_dir", False)),
                )
            )
            if len(items) >= limit:
                break

        return ListObjectsResponse(bucket=bucket, prefix=prefix, count=len(items), objects=items)

    except S3Error as e:
        # logger.exception("MinIO error while listing files")
        raise HTTPException(status_code=500, detail=f"MinIO error: {e.code}: {e.message}")
    except Exception as e:
        # logger.exception("Unexpected error while listing files")
        raise HTTPException(status_code=500, detail=str(e))


@router.get("/application-type", tags=["Application Type"])
async def get_application_type(
    client_name: str = Query(..., description="Client name"),
    app_name: str = Query(..., description="App name"),
    project_name: str = Query(..., description="Project name")
):
    """
    Get the application type for a specific project from MongoDB build configuration.
    This is used to determine if S-curve features should be displayed (only for MMM applications).
    """
    try:
        # Get the build configuration document
        document_id = f"{client_name}/{app_name}/{project_name}"
        mongo_client = get_authenticated_client()
        db = mongo_client[MONGO_DB]
        build_config = await db["build-model_featurebased_configs"].find_one({"_id": document_id})
        
        if not build_config:
            raise HTTPException(
                status_code=404, 
                detail=f"No build configuration found for {document_id}"
            )
        
        # Extract application type
        application_type = build_config.get("application_type", "general")
        
        return {
            "client_name": client_name,
            "app_name": app_name,
            "project_name": project_name,
            "application_type": application_type,
            "is_mmm": application_type == "mmm"
        }
        
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error getting application type: {e}")
        raise HTTPException(status_code=500, detail=f"Internal server error: {str(e)}")


@router.get("/files/selected", response_model=SelectedModelsResponse)
def list_selected_models(
    bucket: str = Query(default=MINIO_BUCKET, description="Bucket to read from"),
    prefix: Optional[str] = Query(default=None, description="Prefix to scan (e.g. 'runs/2025-08/')"),
    recursive: bool = Query(default=True, description="Recurse into subfolders"),
    limit: int = Query(default=1000, ge=1, le=10000, description="Max rows to return"),
    offset: int = Query(default=0, ge=0, description="Row offset for pagination"),
    extensions: str = Query(default="parquet,feather,arrow", description="Comma-separated file extensions to include"),
):
    """
    Scan Arrow/Feather/Parquet files in MinIO and return rows where `selected_models`
    indicates selection (case-insensitive match of: selected/true/yes/1).
    Aggregates across files, supports offset/limit pagination on the combined result.
    """
    submission = celery_task_client.submit_callable(
        name="evaluate.list_selected_models",
        dotted_path="app.features.evaluate_models_feature_based.service.list_selected_models",
        kwargs={
            "bucket": bucket,
            "prefix": prefix,
            "recursive": recursive,
            "limit": limit,
            "offset": offset,
            "extensions": extensions,
        },
        metadata={
            "feature": "evaluate_models_feature_based",
            "operation": "list_selected_models",
            "bucket": bucket,
            "prefix": prefix,
        },
    )
    if submission.status == "failure":
        raise HTTPException(status_code=500, detail=submission.detail or "Failed to list selected models")
    return format_task_response(submission, embed_result=True)


# ---------- Selected models charts ----------

@router.get("/selected/actual-vs-predicted", response_model=ActualPredictedResponse, tags=["Selected Models", "Charts"])
async def selected_actual_vs_predicted(
    results_file_key: str = Query(..., description="MinIO key of the results file with selected_models flags"),
    client_name: str = Query(...),
    app_name: str = Query(...),
    project_name: str = Query(...),
    bucket: str = Query(default=MINIO_BUCKET, description="MinIO bucket for both results & sources"),
    limit_models: int = Query(default=1000, ge=1, le=10000),
):
    """
    For every row flagged in `selected_models`, compute actual vs predicted using the model
    coefficients + source data (intercept + sum(beta*x)) WITH TRANSFORMATION SUPPORT.
    Returns an array of items, one per (combination_id, model_name).
    """
    submission = celery_task_client.submit_callable(
        name="evaluate.selected_actual_vs_predicted",
        dotted_path="app.features.evaluate_models_feature_based.service.compute_actual_vs_predicted",
        kwargs={
            "results_file_key": results_file_key,
            "client_name": client_name,
            "app_name": app_name,
            "project_name": project_name,
            "bucket": bucket,
            "limit_models": limit_models,
        },
        metadata={
            "feature": "evaluate_models_feature_based",
            "operation": "selected_actual_vs_predicted",
            "results_file_key": results_file_key,
            "bucket": bucket,
        },
    )
    if submission.status == "failure":
        raise HTTPException(status_code=500, detail=submission.detail or "Failed to compute actual vs predicted")
    return format_task_response(submission, embed_result=True)


@router.get("/selected/contributions-yoy", response_model=ContributionsResponse, tags=["Selected Models", "Charts"])
async def selected_contributions_yoy(
    results_file_key: str = Query(..., description="MinIO key of the results file with selected_models flags"),
    client_name: str = Query(...),
    app_name: str = Query(...),
    project_name: str = Query(...),
    bucket: str = Query(default=MINIO_BUCKET),
):
    """
    For every selected (combination_id, model_name):
      - build variable-level contribution time series with beta * X_t
      - aggregate by Year
      - compute YoY % change per variable
    Returns one block per model with {yearly_contributions, yoy_contributions}.
    """
    submission = celery_task_client.submit_callable(
        name="evaluate.selected_contributions_yoy",
        dotted_path="app.features.evaluate_models_feature_based.service.compute_contributions_yoy",
        kwargs={
            "results_file_key": results_file_key,
            "client_name": client_name,
            "app_name": app_name,
            "project_name": project_name,
            "bucket": bucket,
        },
        metadata={
            "feature": "evaluate_models_feature_based",
            "operation": "selected_contributions_yoy",
            "results_file_key": results_file_key,
            "bucket": bucket,
        },
    )
    if submission.status == "failure":
        raise HTTPException(status_code=500, detail=submission.detail or "Failed to compute contributions")
    return format_task_response(submission, embed_result=True)


@router.get("/get-scope", tags=["Data"])
async def get_scope_from_dataset(
    object_name: str = Query(..., description="MinIO key of the dataset file"),
    bucket: str = Query(default=MINIO_BUCKET),
):
    """
    Extract scope value from the 'scope' column of a dataset.
    Returns the unique scope value found in the dataset.
    """
    try:
        # logger.info(f"Attempting to read dataset: bucket={bucket}, object_name={object_name}")
        
        # Check if bucket exists
        if not minio_client.bucket_exists(bucket):
            # logger.error(f"Bucket '{bucket}' does not exist")
            raise HTTPException(status_code=404, detail=f"Bucket '{bucket}' not found")
        
        # Check if object exists
        try:
            minio_client.stat_object(bucket, object_name)
            # logger.info(f"Object {object_name} exists in bucket {bucket}")
        except Exception as e:
            # logger.error(f"Object {object_name} not found in bucket {bucket}: {str(e)}")
            raise HTTPException(status_code=404, detail=f"Object '{object_name}' not found in bucket '{bucket}'")
        
        # Read the dataset
        # logger.info(f"Reading dataset from MinIO...")
        df = _read_minio_dataframe(minio_client, bucket, object_name)
        # logger.info(f"Successfully read dataset with {len(df)} rows and columns: {list(df.columns)}")
        
        # Check if 'scope' column exists (case-insensitive)
        scope_column = None
        for col in df.columns:
            if col.lower() == 'scope':
                scope_column = col
                break
        
        if scope_column is None:
            # logger.error(f"Dataset does not contain 'scope' column. Available columns: {list(df.columns)}")
            raise HTTPException(status_code=400, detail=f"Dataset does not contain a 'scope' column. Available columns: {list(df.columns)}")
        
        # Get unique scope values
        scope_values = df[scope_column].dropna().unique()
        # logger.info(f"Found scope values: {scope_values}")
        
        if len(scope_values) == 0:
            # logger.error("No scope values found in the dataset")
            raise HTTPException(status_code=404, detail="No scope values found in the dataset")
        
        # Return the first unique scope value (assuming single scope per dataset)
        scope_value = str(scope_values[0])
        # logger.info(f"Returning scope value: {scope_value}")
        
        return {
            "scope": scope_value,
            "object_name": object_name,
            "bucket": bucket
        }
        
    except HTTPException:
        raise
    except Exception as e:
        # logger.error(f"Error getting scope from dataset {object_name}: {str(e)}")
        raise HTTPException(status_code=500, detail=f"Failed to get scope from dataset: {str(e)}")


@router.get("/get-combinations", tags=["Data"])
async def get_combinations_from_dataset(
    object_name: str = Query(..., description="MinIO key of the dataset file"),
    bucket: str = Query(default=MINIO_BUCKET),
    identifier_values: str = Query(default="", description="JSON string of selected identifier values to filter combinations"),
):
    """
    Extract unique combination_id values from the 'combination_id' column of a dataset.
    Returns the list of unique combination values found in the dataset.
    """
    try:
        # logger.info(f"Attempting to read dataset for combinations: bucket={bucket}, object_name={object_name}")
        
        # Check if bucket exists
        if not minio_client.bucket_exists(bucket):
            # logger.error(f"Bucket '{bucket}' does not exist")
            raise HTTPException(status_code=404, detail=f"Bucket '{bucket}' not found")
        
        # Check if object exists
        try:
            minio_client.stat_object(bucket, object_name)
            # logger.info(f"Object {object_name} exists in bucket {bucket}")
        except Exception as e:
            # logger.error(f"Object {object_name} not found in bucket {bucket}: {str(e)}")
            raise HTTPException(status_code=404, detail=f"Object '{object_name}' not found in bucket '{bucket}'")
        
        # Read the dataset
        # logger.info(f"Reading dataset from MinIO...")
        df = _read_minio_dataframe(minio_client, bucket, object_name)
        # logger.info(f"Successfully read dataset with {len(df)} rows and columns: {list(df.columns)}")
        
        # Check if 'combination_id' column exists (case-insensitive)
        combination_column = None
        for col in df.columns:
            if col.lower() == 'combination_id':
                combination_column = col
                break
        
        if combination_column is None:
            # logger.error(f"Dataset does not contain 'combination_id' column. Available columns: {list(df.columns)}")
            raise HTTPException(status_code=400, detail=f"Dataset does not contain a 'combination_id' column. Available columns: {list(df.columns)}")
        
        # Check if 'selected_models' column exists (case-insensitive)
        selected_models_column = None
        for col in df.columns:
            if col.lower() == 'selected_models':
                selected_models_column = col
                break
        
        # Filter combinations where selected_models = 'yes'
        if selected_models_column is not None:
            filtered_df = df[df[selected_models_column].astype(str).str.lower() == 'yes']
            if filtered_df.empty:
                logger.warning("selected_models column present but no rows selected; using all rows instead")
                filtered_df = df
        else:
            # If no selected_models column, use all data (fallback)
            filtered_df = df
            # logger.info(f"No selected_models column found, using all data")
        
        # Further filter by selected identifier values if provided
        if identifier_values:
            try:
                import json
                selected_identifiers = json.loads(identifier_values)
                # logger.info(f"Filtering by selected identifier values: {selected_identifiers}")
                
                # Apply identifier filters
                for identifier_name, selected_values in selected_identifiers.items():
                    if selected_values and len(selected_values) > 0:
                        # Find the identifier column (case-insensitive)
                        identifier_column = None
                        for col in filtered_df.columns:
                            if col.lower() == identifier_name.lower():
                                identifier_column = col
                                break
                        
                        if identifier_column:
                            # Filter rows where identifier value is in the selected values
                            filtered_df = filtered_df[filtered_df[identifier_column].astype(str).isin(selected_values)]
                        else:
                            logger.warning(f"Identifier column '{identifier_name}' not found in dataset")
                
                logger.info(f"After identifier filtering: {len(filtered_df)} rows remaining")
                
            except json.JSONDecodeError as e:
                logger.warning(f"Invalid JSON in identifier_values parameter: {e}")
            except Exception as e:
                logger.warning(f"Error processing identifier values: {e}")
        
        # Get unique combination values from filtered data
        combination_values = filtered_df[combination_column].dropna().unique()
        # logger.info(f"Found {len(combination_values)} unique combination values after all filtering")
        
        if len(combination_values) == 0:
            # logger.error("No combination values found in the dataset")
            raise HTTPException(status_code=404, detail="No combination values found in the dataset")
        
        # Convert to list of strings
        combinations_list = [str(val) for val in combination_values]
        # logger.info(f"Returning {len(combinations_list)} combinations")
        
        return {
            "combinations": combinations_list,
            "object_name": object_name,
            "bucket": bucket,
            "count": len(combinations_list)
        }
        
    except HTTPException:
        raise
    except Exception as e:
        # logger.error(f"Error getting combinations from dataset {object_name}: {str(e)}")
        raise HTTPException(status_code=500, detail=f"Failed to get combinations from dataset: {str(e)}")


@router.get("/get-identifiers", response_model=IdentifiersResponse, tags=["Data"])
async def get_identifiers_from_dataset(
    object_name: str = Query(..., description="MinIO key of the dataset file"),
    bucket: str = Query(default=MINIO_BUCKET),
):
    """
    Fetch identifiers from scope selector mongo and find those columns in the selected file.
    Returns the identifiers with their unique values as options.
    """
    try:
        # logger.info(f"Attempting to get identifiers from dataset: bucket={bucket}, object_name={object_name}")
        
        # Check if bucket exists
        if not minio_client.bucket_exists(bucket):
            # logger.error(f"Bucket '{bucket}' does not exist")
            raise HTTPException(status_code=404, detail=f"Bucket '{bucket}' not found")
        
        # Check if object exists
        try:
            minio_client.stat_object(bucket, object_name)
            # logger.info(f"Object {object_name} exists in bucket {bucket}")
        except Exception as e:
            # logger.error(f"Object {object_name} not found in bucket {bucket}: {str(e)}")
            raise HTTPException(status_code=404, detail=f"Object '{object_name}' not found in bucket '{bucket}'")
        
        # Extract client, app, project from object_name
        # object_name format: "default_client/default_app/default_project/..."
        object_name_parts = object_name.split('/')
        if len(object_name_parts) >= 3:
            client_name = object_name_parts[0]
            app_name = object_name_parts[1]
            project_name = object_name_parts[2]
        else:
            # logger.warning(f"Could not extract client/app/project from object_name: {object_name}")
            client_name = "default_client"
            app_name = "default_app"
            project_name = "default_project"
        
        # Get identifiers from scope configuration
        identifiers = []
        try:
            # Use the same MongoDB client pattern as build atom
            from .mongodb_saver import get_scope_config_from_mongo
            
            # Get scope configuration from scopeselector_configs collection
            scope_config = await get_scope_config_from_mongo(client_name, app_name, project_name)
            
            if scope_config and 'identifiers' in scope_config:
                identifiers = scope_config['identifiers']
                logger.info(f"Retrieved identifiers from scope config: {identifiers}")
            else:
                logger.warning("No identifiers found in scope config")
                
        except Exception as e:
            # logger.warning(f"Failed to get identifiers from scope config: {e}")
            identifiers = []
        
        if not identifiers:
            # logger.warning("No identifiers found, returning empty result")
            return {
                "identifiers": {},
                "object_name": object_name,
                "bucket": bucket,
                "count": 0
            }
        
        # Read the dataset to find identifier columns and their unique values
        # logger.info(f"Reading dataset from MinIO...")
        df = _read_minio_dataframe(minio_client, bucket, object_name)
        # logger.info(f"Successfully read dataset with {len(df)} rows and columns: {list(df.columns)}")
        # logger.info(f"Sample combination_ids in dataset: {df['combination_id'].head(10).tolist() if 'combination_id' in df.columns else 'No combination_id column'}")
        
        # Filter data to only include rows where selected_models = 'yes'
        if 'selected_models' in df.columns:
            df_filtered = df[df['selected_models'].astype(str).str.lower() == 'yes']
            if df_filtered.empty:
                logger.warning("selected_models column present but no rows marked 'yes'; using all data instead")
            else:
                df = df_filtered
        else:
            logger.warning("No selected_models column found in dataset, using all data")
        
        # Find identifier columns in the dataset (case-insensitive)
        identifier_data = {}
        for identifier in identifiers:
            # Look for the identifier column (case-insensitive)
            found_column = None
            for col in df.columns:
                if col.lower() == identifier.lower():
                    found_column = col
                    break
            
            if found_column:
                # Get unique values for this identifier
                # logger.info(f"Processing identifier '{identifier}' in column '{found_column}'")
                # logger.info(f"Column data type: {df[found_column].dtype}")
                # logger.info(f"Column sample values: {df[found_column].head(5).tolist()}")
                # logger.info(f"Column null count: {df[found_column].isnull().sum()}")
                
                unique_values = df[found_column].dropna().unique()
                # Filter out empty strings and whitespace-only strings
                filtered_values = [val for val in unique_values if str(val).strip()]
                # logger.info(f"Unique values after dropna: {unique_values.tolist()}")
                # logger.info(f"Filtered values after removing empty strings: {filtered_values}")
                
                identifier_data[identifier] = {
                    "column_name": found_column,
                    "unique_values": [str(val) for val in filtered_values]
                }
                # logger.info(f"Found identifier '{identifier}' with {len(unique_values)} unique values: {[str(val) for val in unique_values]}")
            else:
                # logger.warning(f"Identifier '{identifier}' not found in dataset columns")
                identifier_data[identifier] = {
                    "column_name": None,
                    "unique_values": []
                }
        
        # logger.info(f"Returning {len(identifier_data)} identifiers with their values")
        
        return {
            "identifiers": identifier_data,
            "object_name": object_name,
            "bucket": bucket,
            "count": len(identifier_data)
        }
        
    except HTTPException:
        raise
    except Exception as e:
        # logger.error(f"Error getting identifiers from dataset {object_name}: {str(e)}")
        raise HTTPException(status_code=500, detail=f"Failed to get identifiers from dataset: {str(e)}")


@router.get("/yoy-growth", tags=["YoY Growth"])
async def calculate_yoy_growth(
    results_file_key: str = Query(..., description="MinIO key of the results file with selected_models flags"),
    client_name: str = Query(...),
    app_name: str = Query(...),
    project_name: str = Query(...),
    bucket: str = Query(default=MINIO_BUCKET),
):
    """
    Calculate Year-over-Year (YoY) growth for each selected combination using stored coefficients and actual X values WITH TRANSFORMATION SUPPORT.
    Returns YoY growth data for all combinations where selected_models = 'yes'.
    """
    submission = celery_task_client.submit_callable(
        name="evaluate.yoy_growth",
        dotted_path="app.features.evaluate_models_feature_based.service.compute_yoy_growth",
        kwargs={
            "results_file_key": results_file_key,
            "client_name": client_name,
            "app_name": app_name,
            "project_name": project_name,
            "bucket": bucket,
        },
        metadata={
            "feature": "evaluate_models_feature_based",
            "operation": "yoy_growth",
            "results_file_key": results_file_key,
            "bucket": bucket,
        },
    )
    if submission.status == "failure":
        raise HTTPException(status_code=500, detail=submission.detail or "Failed to calculate YoY growth")
    return format_task_response(submission, embed_result=True)

@router.get("/contribution", tags=["Evaluate"])
async def get_contribution_data(
    results_file_key: str = Query(..., description="MinIO file key for the results file"),
    combination_id: str = Query(..., description="Combination ID to filter by"),
    client_name: str = Query(..., description="Client name"),
    app_name: str = Query(..., description="App name"),
    project_name: str = Query(..., description="Project name")
):
    """
    Get contribution data for a specific combination from the results file.
    Returns data from columns that end with _contribution for pie chart.
    """
    try:
        # logger.info(f"Getting contribution data for combination: {combination_id}")
        
        # Read the results file
        df = _read_minio_dataframe(minio_client, MINIO_BUCKET, results_file_key)
        if df is None or df.empty:
            raise HTTPException(status_code=404, detail="Results file not found or empty")
        
        # logger.info(f"Results file loaded with {len(df)} rows and columns: {list(df.columns)}")
        
        # Find combination_id column (case-insensitive)
        combination_id_column = None
        for col in df.columns:
            col_lower = col.lower()
            if (col_lower == 'combination_id' or 
                col_lower == 'combo_id' or 
                col_lower == 'combinationid' or
                'combination_id' in col_lower or 
                'combo_id' in col_lower or 
                'combination' in col_lower):
                combination_id_column = col
                break
        
        if not combination_id_column:
            raise HTTPException(status_code=404, detail="No combination_id column found in results file")
        
        # logger.info(f"Found combination_id column: {combination_id_column}")
        
        # Find selected_models column (case-insensitive)
        selected_models_column = None
        for col in df.columns:
            col_lower = col.lower()
            if (col_lower == 'selected_models' or 
                col_lower == 'selectedmodels' or
                'selected_models' in col_lower or 
                'selectedmodels' in col_lower):
                selected_models_column = col
                break
        
        if not selected_models_column:
            raise HTTPException(status_code=404, detail="No selected_models column found in results file")
        
        # logger.info(f"Found selected_models column: {selected_models_column}")
        
        # # Filter by combination_id AND selected_models = 'yes'
        # logger.info(f"Filtering by combination_id: {combination_id}")
        # logger.info(f"Filtering by selected_models column: {selected_models_column}")
        # logger.info(f"Unique values in selected_models column: {df[selected_models_column].unique()}")
        
        filtered_df = df[
            (df[combination_id_column] == combination_id) & 
            (df[selected_models_column].str.lower() == 'yes')
        ]
        
        if filtered_df.empty:
            logger.warning("No rows marked selected for combination %s; falling back to first available row", combination_id)
            filtered_df = df[df[combination_id_column] == combination_id]
            if filtered_df.empty:
                raise HTTPException(status_code=404, detail=f"No data found for combination_id: {combination_id}")
        
        # logger.info(f"Found {len(filtered_df)} rows for combination_id: {combination_id} with selected_models = 'yes'")
        
        # Get the first row (should be only one for a specific combination)
        combination_row = filtered_df.iloc[0]
        
        # Find columns that end with _contribution
        contribution_columns = []
        # logger.info(f"All columns in dataframe: {list(df.columns)}")
        for col in df.columns:
            if col.lower().endswith('_contribution'):
                contribution_columns.append(col)
                logger.info(f"Found contribution column: {col}")
        
        if not contribution_columns:
            # logger.warning("No contribution columns found, returning empty contribution data")
            return {
                "file_key": results_file_key,
                "combination_id": combination_id,
                "contribution_data": []
            }
        
        # logger.info(f"Found contribution columns: {contribution_columns}")
        
        # Extract contribution data
        contribution_data = []
        # logger.info(f"Extracting contribution data from row: {combination_row.to_dict()}")
        for col in contribution_columns:
            value = combination_row[col]
            # logger.info(f"Column {col}: value = {value}, type = {type(value)}")
            if pd.notna(value):  # Check if value is not NaN
                # Extract variable name from column (remove _contribution suffix)
                variable_name = col.replace('_contribution', '').replace('_Contribution', '')
                contribution_data.append({
                    "name": variable_name,
                    "value": float(value)
                })
                # logger.info(f"Added contribution: {variable_name} = {value}")
        
        if not contribution_data:
            raise HTTPException(status_code=404, detail="No valid contribution data found")
        
        # logger.info(f"Extracted {len(contribution_data)} contribution entries")
        
        return {
            "file_key": results_file_key,
            "combination_id": combination_id,
            "contribution_data": contribution_data
        }
        
    except HTTPException:
        raise
    except Exception as e:
        # logger.error(f"Error getting contribution data: {str(e)}")
        import traceback
        # logger.error(f"Traceback: {traceback.format_exc()}")
        raise HTTPException(status_code=500, detail=f"Error processing file: {str(e)}")


@router.get("/roi", tags=["Evaluate"])
async def get_roi_data(
    results_file_key: str = Query(..., description="MinIO file key for the results file"),
    combination_id: str = Query(..., description="Combination ID to filter by"),
    client_name: str = Query(..., description="Client name"),
    app_name: str = Query(..., description="App name"),
    project_name: str = Query(..., description="Project name")
):
    """
    Get ROI data for a specific combination from the results file.
    Returns data from columns that end with _roi for chart.
    """
    try:
        # Read the results file
        df = _read_minio_dataframe(minio_client, MINIO_BUCKET, results_file_key)
        if df is None or df.empty:
            raise HTTPException(status_code=404, detail="Results file not found or empty")
        df.columns = df.columns.str.lower()
        # Find combination_id column (case-insensitive)
        combination_id_column = None
        for col in df.columns:
            col_lower = col.lower()
            if (col_lower == 'combination_id' or 
                col_lower == 'combo_id' or 
                col_lower == 'combinationid' or
                'combination_id' in col_lower or 
                'combo_id' in col_lower or 
                'combination' in col_lower):
                combination_id_column = col
                break
        
        if not combination_id_column:
            raise HTTPException(status_code=404, detail="No combination_id column found in results file")
        
        # Find selected_models column (case-insensitive)
        selected_models_column = None
        for col in df.columns:
            col_lower = col.lower()
            if (col_lower == 'selected_models' or 
                col_lower == 'selectedmodels' or
                'selected_models' in col_lower or 
                'selectedmodels' in col_lower):
                selected_models_column = col
                break
        
        if not selected_models_column:
            raise HTTPException(status_code=404, detail="No selected_models column found in results file")
        
        # Filter by combination_id AND selected_models = 'yes'
        filtered_df = df[
            (df[combination_id_column] == combination_id) & 
            (df[selected_models_column].str.lower() == 'yes')
        ]
        
        if filtered_df.empty:
            logger.warning("No ROI rows marked selected for combination %s; using all rows for this combination", combination_id)
            filtered_df = df[df[combination_id_column] == combination_id]
            if filtered_df.empty:
                raise HTTPException(status_code=404, detail=f"No data found for combination_id: {combination_id}")
        
        # Get the first row (should be only one for a specific combination)
        combination_row = filtered_df.iloc[0]
        
        # Find columns that end with _roi
        roi_columns = []
        for col in df.columns:
            if col.lower().endswith('_roi'):
                roi_columns.append(col)
                logger.info(f"Found ROI column: {col}")
        
        if not roi_columns:
            return {
                "file_key": results_file_key,
                "combination_id": combination_id,
                "roi_data": []
            }
        
        # Extract ROI data
        roi_data = []
        for col in roi_columns:
            value = combination_row[col]
            logger.info(f"Column {col}: value = {value}, type = {type(value)}")
            if pd.notna(value):  # Check if value is not NaN
                # Extract variable name from column (remove _roi suffix)
                variable_name = col.replace('_roi', '').replace('_ROI', '').replace('_Roi', '')
                roi_data.append({
                    "name": variable_name,
                    "value": float(value)
                })
        logger.info(f"Found ROI data: {roi_data}")
        if not roi_data:
            raise HTTPException(status_code=404, detail="No valid ROI data found")
        
        return {
            "file_key": results_file_key,
            "combination_id": combination_id,
            "roi_data": roi_data
        }
        
    except HTTPException:
        raise
    except Exception as e:
        import traceback
        raise HTTPException(status_code=500, detail=f"Error processing file: {str(e)}")


@router.get("/beta", tags=["Evaluate"])
async def get_beta_data(
    results_file_key: str = Query(..., description="MinIO file key for the results file"),
    combination_id: str = Query(..., description="Combination ID to filter by"),
    client_name: str = Query(..., description="Client name"),
    app_name: str = Query(..., description="App name"),
    project_name: str = Query(..., description="Project name")
):
    """
    Get beta data for a specific combination from the results file.
    Returns data from columns that end with _beta for bar chart.
    """
    try:
        # logger.info(f"Getting beta data for combination: {combination_id}")
        
        # Read the results file
        df = _read_minio_dataframe(minio_client, MINIO_BUCKET, results_file_key)
        if df is None or df.empty:
            raise HTTPException(status_code=404, detail="Results file not found or empty")
        
        # logger.info(f"Results file loaded with {len(df)} rows and columns: {list(df.columns)}")
        
        # Find combination_id column (case-insensitive)
        combination_id_column = None
        for col in df.columns:
            col_lower = col.lower()
            if (col_lower == 'combination_id' or 
                col_lower == 'combo_id' or 
                col_lower == 'combinationid' or
                'combination_id' in col_lower or 
                'combo_id' in col_lower or 
                'combination' in col_lower):
                combination_id_column = col
                break
        
        if not combination_id_column:
            raise HTTPException(status_code=404, detail="No combination_id column found in results file")
        
        # logger.info(f"Found combination_id column: {combination_id_column}")
        
        # Find selected_models column (case-insensitive)
        selected_models_column = None
        for col in df.columns:
            col_lower = col.lower()
            if (col_lower == 'selected_models' or 
                col_lower == 'selectedmodels' or
                'selected_models' in col_lower or 
                'selectedmodels' in col_lower):
                selected_models_column = col
                break
        
        if not selected_models_column:
            raise HTTPException(status_code=404, detail="No selected_models column found in results file")
        
        # logger.info(f"Found selected_models column: {selected_models_column}")
        
        # # Filter by combination_id AND selected_models = 'yes'
        # logger.info(f"Filtering by combination_id: {combination_id}")
        # logger.info(f"Filtering by selected_models column: {selected_models_column}")
        # logger.info(f"Unique values in selected_models column: {df[selected_models_column].unique()}")
        
        filtered_df = df[
            (df[combination_id_column] == combination_id) & 
            (df[selected_models_column].str.lower() == 'yes')
        ]
        
        if filtered_df.empty:
            logger.warning("No beta rows marked selected for combination %s; using all rows for this combination", combination_id)
            filtered_df = df[df[combination_id_column] == combination_id]
            if filtered_df.empty:
                raise HTTPException(status_code=404, detail=f"No data found for combination_id: {combination_id}")
        
        # logger.info(f"Found {len(filtered_df)} rows for combination_id: {combination_id} with selected_models = 'yes'")
        
        # Get the first row (should be only one for a specific combination)
        combination_row = filtered_df.iloc[0]
        
        # Find columns that end with _beta
        beta_columns = []
        # logger.info(f"All columns in dataframe: {list(df.columns)}")
        for col in df.columns:
            if col.lower().endswith('_beta'):
                beta_columns.append(col)
                # logger.info(f"Found beta column: {col}")
        
        if not beta_columns:
            # logger.warning("No beta columns found, returning empty beta data")
            return {
                "file_key": results_file_key,
                "combination_id": combination_id,
                "beta_data": []
            }
        
        # logger.info(f"Found beta columns: {beta_columns}")
        
        # Extract beta data
        beta_data = []
        # logger.info(f"Extracting beta data from row: {combination_row.to_dict()}")
        for col in beta_columns:
            value = combination_row[col]
            # logger.info(f"Column {col}: value = {value}, type = {type(value)}")
            if pd.notna(value):  # Check if value is not NaN
                # Extract variable name from column (remove _beta suffix)
                variable_name = col.replace('_beta', '').replace('_Beta', '')
                beta_data.append({
                    "name": variable_name,
                    "value": float(value)
                })
                # logger.info(f"Added beta: {variable_name} = {value}")
        
        if not beta_data:
            raise HTTPException(status_code=404, detail="No valid beta data found")
        
        # logger.info(f"Extracted {len(beta_data)} beta entries")
        
        return {
            "file_key": results_file_key,
            "combination_id": combination_id,
            "beta_data": beta_data
        }
        
    except HTTPException:
        raise
    except Exception as e:
        # logger.error(f"Error getting beta data: {str(e)}")
        import traceback
        # logger.error(f"Traceback: {traceback.format_exc()}")
        raise HTTPException(status_code=500, detail=f"Error processing file: {str(e)}")


@router.get("/s-curve", tags=["Evaluate"])
async def get_s_curve_data(
    results_file_key: str = Query(..., description="MinIO key of the results file with selected_models flags"),
    client_name: str = Query(...),
    app_name: str = Query(...),
    project_name: str = Query(...),
    bucket: str = Query(default=MINIO_BUCKET, description="MinIO bucket for both results & sources"),
    limit_models: int = Query(default=1000, ge=1, le=10000),
):
    """
    Generate S-curve data for all selected models and combinations.
    Returns S-curve data for each (combination_id, model_name) pair where selected_models = 'yes'.
    """
    try:
        # Create MinIO client
        minio_client = Minio(
            MINIO_ENDPOINT,
            access_key=MINIO_ACCESS_KEY,
            secret_key=MINIO_SECRET_KEY,
            secure=False
        )
        
        # Create MongoDB client
        from .database import get_authenticated_client
        mongo_client = get_authenticated_client()
        db = mongo_client["trinity_db"]
        
        # Import the S-curve endpoint from select models feature
        from ..select_models_feature_based.s_curve import get_s_curve_endpoint
        
        # 1) read results and collect (combination_id, model_name) pairs
        results_df = _read_minio_dataframe(minio_client, bucket, results_file_key)
        results_df.columns = results_df.columns.str.lower()
        selected_pairs = _collect_selected_rows(results_df)[:limit_models]
        
        if not selected_pairs:
            return {
                "success": False,
                "error": "No selected models found in results file",
                "s_curves": {}
            }
        
        logger.info(f"✅ Found {len(selected_pairs)} selected model combinations for S-curve generation")
        
        # Process each selected combination and model
        all_s_curves = {}
        errors = []
        
        for combination_id, model_name in selected_pairs:
            try:
                logger.info(f"🔍 Generating S-curve for {combination_id}/{model_name}")
                
                # Call the S-curve endpoint for this specific combination and model
                s_curve_result = await get_s_curve_endpoint(
                    client_name=client_name,
                    app_name=app_name,
                    project_name=project_name,
                    combination_name=combination_id,
                    model_name=model_name,
                    db=db,
                    minio_client=minio_client,
                    MINIO_BUCKET=bucket
                )
                
                if s_curve_result.get("success", False):
                    # Store the S-curve data with a unique key
                    key = f"{combination_id}_{model_name}"
                    all_s_curves[key] = s_curve_result
                    logger.info(f"✅ S-curve generated successfully for {combination_id}/{model_name}")
                else:
                    error_msg = s_curve_result.get("error", "Unknown error")
                    errors.append(f"{combination_id}/{model_name}: {error_msg}")
                    logger.warning(f"⚠️ S-curve generation failed for {combination_id}/{model_name}: {error_msg}")
                    
            except Exception as e:
                error_msg = f"Error generating S-curve for {combination_id}/{model_name}: {str(e)}"
                errors.append(error_msg)
                logger.error(error_msg)
                continue
        
        # Return results
        if all_s_curves:
            return {
                "success": True,
                "results_file_key": results_file_key,
                "bucket": bucket,
                "models_count": len(all_s_curves),
                "s_curves": all_s_curves,
                "errors": errors if errors else None
            }
        else:
            return {
                "success": False,
                "error": "No S-curves could be generated for any selected models",
                "errors": errors,
                "s_curves": {}
            }
        
    except Exception as e:
        logger.error(f"Error generating S-curves: {str(e)}")
        raise HTTPException(status_code=500, detail=f"Error generating S-curves: {str(e)}")


@router.get("/elasticity", tags=["Evaluate"])
async def get_elasticity_data(
    results_file_key: str = Query(..., description="MinIO file key for the results file"),
    combination_id: str = Query(..., description="Combination ID to filter by"),
    client_name: str = Query(..., description="Client name"),
    app_name: str = Query(..., description="App name"),
    project_name: str = Query(..., description="Project name")
):
    """
    Get elasticity data for a specific combination from the results file.
    Returns data from columns that end with _elasticity for bar chart.
    """
    try:
        # logger.info(f"Getting elasticity data for combination: {combination_id}")
        
        # Read the results file
        df = _read_minio_dataframe(minio_client, MINIO_BUCKET, results_file_key)
        if df is None or df.empty:
            raise HTTPException(status_code=404, detail="Results file not found or empty")
        
        # logger.info(f"Results file loaded with {len(df)} rows and columns: {list(df.columns)}")
        
        # Find combination_id column (case-insensitive)
        combination_id_column = None
        for col in df.columns:
            col_lower = col.lower()
            if (col_lower == 'combination_id' or 
                col_lower == 'combo_id' or 
                col_lower == 'combinationid' or
                'combination_id' in col_lower or 
                'combo_id' in col_lower or 
                'combination' in col_lower):
                combination_id_column = col
                break
        
        if not combination_id_column:
            raise HTTPException(status_code=404, detail="No combination_id column found in results file")
        
        # logger.info(f"Found combination_id column: {combination_id_column}")
        
        # Find selected_models column (case-insensitive)
        selected_models_column = None
        for col in df.columns:
            col_lower = col.lower()
            if (col_lower == 'selected_models' or 
                col_lower == 'selectedmodels' or
                'selected_models' in col_lower or 
                'selectedmodels' in col_lower):
                selected_models_column = col
                break
        
        if not selected_models_column:
            raise HTTPException(status_code=404, detail="No selected_models column found in results file")
        
        # logger.info(f"Found selected_models column: {selected_models_column}")
        
        # # Filter by combination_id AND selected_models = 'yes'
        # logger.info(f"Filtering by combination_id: {combination_id}")
        # logger.info(f"Filtering by selected_models column: {selected_models_column}")
        # logger.info(f"Unique values in selected_models column: {df[selected_models_column].unique()}")
        
        filtered_df = df[
            (df[combination_id_column] == combination_id) & 
            (df[selected_models_column].str.lower() == 'yes')
        ]
        
        if filtered_df.empty:
            logger.warning("No elasticity rows marked selected for combination %s; using all rows for this combination", combination_id)
            filtered_df = df[df[combination_id_column] == combination_id]
            if filtered_df.empty:
                raise HTTPException(status_code=404, detail=f"No data found for combination_id: {combination_id}")
        
        # logger.info(f"Found {len(filtered_df)} rows for combination_id: {combination_id} with selected_models = 'yes'")
        
        # Get the first row (should be only one for a specific combination)
        combination_row = filtered_df.iloc[0]
        
        # Find columns that end with _elasticity
        elasticity_columns = []
        # logger.info(f"All columns in dataframe: {list(df.columns)}")
        for col in df.columns:
            if col.lower().endswith('_elasticity'):
                elasticity_columns.append(col)
                # logger.info(f"Found elasticity column: {col}")
        
        if not elasticity_columns:
            # logger.warning("No elasticity columns found, returning empty elasticity data")
            return {
                "file_key": results_file_key,
                "combination_id": combination_id,
                "elasticity_data": []
            }
        
        # logger.info(f"Found elasticity columns: {elasticity_columns}")
        
        # Extract elasticity data
        elasticity_data = []
        # logger.info(f"Extracting elasticity data from row: {combination_row.to_dict()}")
        for col in elasticity_columns:
            value = combination_row[col]
            # logger.info(f"Column {col}: value = {value}, type = {type(value)}")
            if pd.notna(value):  # Check if value is not NaN
                # Extract variable name from column (remove _elasticity suffix)
                variable_name = col.replace('_elasticity', '').replace('_Elasticity', '')
                elasticity_data.append({
                    "name": variable_name,
                    "value": float(value)
                })
                # logger.info(f"Added elasticity: {variable_name} = {value}")
        
        if not elasticity_data:
            raise HTTPException(status_code=404, detail="No valid elasticity data found")
        
        # logger.info(f"Extracted {len(elasticity_data)} elasticity entries")
        
        return {
            "file_key": results_file_key,
            "combination_id": combination_id,
            "elasticity_data": elasticity_data
        }
        
    except HTTPException:
        raise
    except Exception as e:
        # logger.error(f"Error getting elasticity data: {str(e)}")
        import traceback
        # logger.error(f"Traceback: {traceback.format_exc()}")
        raise HTTPException(status_code=500, detail=f"Error processing file: {str(e)}")


@router.get("/averages", tags=["Evaluate"])
async def get_averages_data(
    results_file_key: str = Query(..., description="MinIO file key for the results file"),
    combination_id: str = Query(..., description="Combination ID to filter by"),
    client_name: str = Query(..., description="Client name"),
    app_name: str = Query(..., description="App name"),
    project_name: str = Query(..., description="Project name")
):
    """
    Get averages data for a specific combination from the results file.
    Returns data from columns that end with _avg for bar chart.
    """
    try:
        # logger.info(f"Getting averages data for combination: {combination_id}")
        
        # Read the results file
        df = _read_minio_dataframe(minio_client, MINIO_BUCKET, results_file_key)
        if df is None or df.empty:
            raise HTTPException(status_code=404, detail="Results file not found or empty")
        
        # logger.info(f"Results file loaded with {len(df)} rows and columns: {list(df.columns)}")
        
        # Find combination_id column (case-insensitive)
        combination_id_column = None
        for col in df.columns:
            col_lower = col.lower()
            if (col_lower == 'combination_id' or 
                col_lower == 'combo_id' or 
                col_lower == 'combinationid' or
                'combination_id' in col_lower or 
                'combo_id' in col_lower or 
                'combination' in col_lower):
                combination_id_column = col
                break
        
        if not combination_id_column:
            raise HTTPException(status_code=404, detail="No combination_id column found in results file")
        
        # logger.info(f"Found combination_id column: {combination_id_column}")
        
        # Find selected_models column (case-insensitive)
        selected_models_column = None
        for col in df.columns:
            col_lower = col.lower()
            if (col_lower == 'selected_models' or 
                col_lower == 'selectedmodels' or
                'selected_models' in col_lower or 
                'selectedmodels' in col_lower):
                selected_models_column = col
                break
        
        if not selected_models_column:
            raise HTTPException(status_code=404, detail="No selected_models column found in results file")
        
        # logger.info(f"Found selected_models column: {selected_models_column}")
        
        # # Filter by combination_id AND selected_models = 'yes'
        # logger.info(f"Filtering by combination_id: {combination_id}")
        # logger.info(f"Filtering by selected_models column: {selected_models_column}")
        # logger.info(f"Unique values in selected_models column: {df[selected_models_column].unique()}")
        
        filtered_df = df[
            (df[combination_id_column] == combination_id) & 
            (df[selected_models_column].str.lower() == 'yes')
        ]
        
        if filtered_df.empty:
            logger.warning("No average rows marked selected for combination %s; using all rows for this combination", combination_id)
            filtered_df = df[df[combination_id_column] == combination_id]
            if filtered_df.empty:
                raise HTTPException(status_code=404, detail=f"No data found for combination_id: {combination_id}")
        
        # logger.info(f"Found {len(filtered_df)} rows for combination_id: {combination_id} with selected_models = 'yes'")
        
        # Get the first row (should be only one for a specific combination)
        combination_row = filtered_df.iloc[0]
        
        # Find columns that end with _avg
        avg_columns = []
        # logger.info(f"All columns in dataframe: {list(df.columns)}")
        for col in df.columns:
            if col.lower().endswith('_avg'):
                avg_columns.append(col)
                # logger.info(f"Found average column: {col}")
        
        if not avg_columns:
            # logger.warning("No average columns found, returning empty averages data")
            return {
                "file_key": results_file_key,
                "combination_id": combination_id,
                "averages_data": []
            }
        
        # logger.info(f"Found average columns: {avg_columns}")
        
        # Extract averages data
        averages_data = []
        # logger.info(f"Extracting averages data from row: {combination_row.to_dict()}")
        for col in avg_columns:
            value = combination_row[col]
            # logger.info(f"Column {col}: value = {value}, type = {type(value)}")
            if pd.notna(value):  # Check if value is not NaN
                # Extract variable name from column (remove _avg suffix)
                variable_name = col.replace('_avg', '').replace('_Avg', '')
                averages_data.append({
                    "name": variable_name,
                    "value": float(value)
                })
                # logger.info(f"Added average: {variable_name} = {value}")
        
        if not averages_data:
            raise HTTPException(status_code=404, detail="No valid averages data found")
        
        # logger.info(f"Extracted {len(averages_data)} averages entries")
        
        return {
            "file_key": results_file_key,
            "combination_id": combination_id,
            "averages_data": averages_data
        }
        
    except HTTPException:
        raise
    except Exception as e:
        # logger.error(f"Error getting averages data: {str(e)}")
        import traceback
        logger.error(f"Traceback: {traceback.format_exc()}")
        raise HTTPException(status_code=500, detail=f"Error processing file: {str(e)}")


@router.post("/save-comments", tags=["Evaluate"])
async def save_comments(
    client_name: str = Form(..., description="Client name"),
    app_name: str = Form(..., description="App name"),
    project_name: str = Form(..., description="Project name"),
    combination_id: str = Form(..., description="Combination ID"),
    graph_type: str = Form(..., description="Graph type"),
    comments: str = Form(..., description="Comments data as JSON string")
):
    """
    Save comments for a specific combination and graph type to MongoDB.
    """
    try:
        # logger.info(f"Saving comments for combination: {combination_id}, graph_type: {graph_type}")
        
        # Parse comments JSON
        try:
            comments_data = json.loads(comments)
        except json.JSONDecodeError as e:
            raise HTTPException(status_code=400, detail=f"Invalid JSON format: {str(e)}")
        
        # Create document ID like other atoms: client_name/app_name/project_name
        document_id = f"{client_name}/{app_name}/{project_name}"
        
        # Create document for MongoDB
        document = {
            "_id": document_id,
            "client_name": client_name,
            "app_name": app_name,
            "project_name": project_name,
            "operation_type": "evaluate",
            "created_at": datetime.utcnow(),
            "updated_at": datetime.utcnow(),
            "combinations": [{
                "combination_id": combination_id,
                "graph_type": graph_type,
                "comments": comments_data,
                "created_at": datetime.utcnow(),
                "updated_at": datetime.utcnow()
            }]
        }
        
        # Save to MongoDB
        mongo_client = get_authenticated_client()
        collection = mongo_client[MONGO_DB]["evaluate_configs"]
        
        # Check if document already exists
        existing_doc = await collection.find_one({"_id": document_id})
        
        if existing_doc:
            # Check if this combination already exists
            existing_combination = None
            for combo in existing_doc.get("combinations", []):
                if combo.get("combination_id") == combination_id and combo.get("graph_type") == graph_type:
                    existing_combination = combo
                    break
            
            if existing_combination:
                # Update existing combination
                result = await collection.update_one(
                    {"_id": document_id, "combinations.combination_id": combination_id, "combinations.graph_type": graph_type},
                    {
                        "$set": {
                            "combinations.$.comments": comments_data,
                            "combinations.$.updated_at": datetime.utcnow(),
                            "updated_at": datetime.utcnow()
                        }
                    }
                )
                # logger.info(f"Updated existing combination comments: {result.modified_count} modified")
            else:
                # Add new combination to existing document
                result = await collection.update_one(
                    {"_id": document_id},
                    {
                        "$push": {
                            "combinations": {
                                "combination_id": combination_id,
                                "graph_type": graph_type,
                                "comments": comments_data,
                                "created_at": datetime.utcnow(),
                                "updated_at": datetime.utcnow()
                            }
                        },
                        "$set": {
                            "updated_at": datetime.utcnow()
                        }
                    }
                )
                # logger.info(f"Added new combination to existing document: {result.modified_count} modified")
        else:
            # Insert new document
            result = await collection.insert_one(document)
            # logger.info(f"Inserted new evaluate document: {result.inserted_id}")
        
        return {
            "success": True,
            "message": "Comments saved successfully",
            "combination_id": combination_id,
            "graph_type": graph_type
        }
        
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error saving comments: {str(e)}")
        import traceback
        logger.error(f"Traceback: {traceback.format_exc()}")
        raise HTTPException(status_code=500, detail=f"Error saving comments: {str(e)}")


@router.get("/selected/actual-vs-predicted", tags=["Evaluate"])
async def get_actual_vs_predicted_for_selected(
    results_file_key: str = Query(..., description="MinIO key of the results file with selected_models flags"),
    client_name: str = Query(...),
    app_name: str = Query(...),
    project_name: str = Query(...),
    bucket: str = Query(default=MINIO_BUCKET),
    limit_models: int = Query(default=1000, ge=1, le=10000),
):
    """
    Calculate actual vs predicted values for all selected models.
    Returns actual vs predicted data for each (combination_id, model_name) pair where selected_models = 'yes'.
    """
    submission = celery_task_client.submit_callable(
        name="evaluate.actual_vs_predicted",
        dotted_path="app.features.evaluate_models_feature_based.service.compute_actual_vs_predicted",
        kwargs={
            "results_file_key": results_file_key,
            "client_name": client_name,
            "app_name": app_name,
            "project_name": project_name,
            "bucket": bucket,
            "limit_models": limit_models,
        },
        metadata={
            "feature": "evaluate_models_feature_based",
            "operation": "actual_vs_predicted",
            "results_file_key": results_file_key,
            "bucket": bucket,
        },
    )
    if submission.status == "failure":
        raise HTTPException(status_code=500, detail=submission.detail or "Failed to calculate actual vs predicted")
    return format_task_response(submission, embed_result=True)