# routes.py
from fastapi import APIRouter, Depends, HTTPException, Query
from typing import Optional, List, Dict, Any, Tuple
from urllib.parse import urlparse
from io import BytesIO
import logging
import os
import mimetypes
import io

import numpy as np
import pandas as pd

from minio import Minio
from minio.error import S3Error

# Arrow/Parquet libs for reading
import pyarrow as pa
import pyarrow.compute as pc
import pyarrow.feather as feather
import pyarrow.parquet as pq

from .config import settings
from .schemas import (
    MinioObject, ListObjectsResponse,
    SelectedModelRow, SelectedModelsResponse,
    PerformanceMetrics, ActualPredictedItem, ActualPredictedResponse,
    ContributionsItem, ContributionsResponse,
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


def get_minio_client() -> Minio:
    endpoint = os.getenv("MINIO_ENDPOINT", settings.minio_url)
    access_key = os.getenv("MINIO_ACCESS_KEY", settings.minio_access_key)
    secret_key = os.getenv("MINIO_SECRET_KEY", settings.minio_secret_key)
    secure_env = os.getenv("MINIO_USE_SSL")
    if secure_env is not None:
        secure = secure_env.lower() == "true"
    else:
        secure = bool(settings.minio_secure)
    return Minio(
        _endpoint_from_url(endpoint),
        access_key=access_key,
        secret_key=secret_key,
        secure=secure,
    )


def _infer_content_type(key: str) -> str:
    ctype, _ = mimetypes.guess_type(key)
    return ctype or "application/octet-stream"


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
    except Exception:
        return pd.read_feather(io.BytesIO(data))


def _truthy_selected(val: Any) -> bool:
    if val is None:
        return False
    s = str(val).strip().lower()
    return s in {"selected", "true", "yes", "1", "y"}


def _collect_selected_rows(results_df: pd.DataFrame) -> List[Tuple[str, str]]:
    need_cols = {"combination_id", "model_name", "selected_models"}
    if not need_cols.issubset(set(results_df.columns)):
        raise HTTPException(
            status_code=400,
            detail="results file must contain columns: combination_id, model_name, selected_models",
        )
    rows = results_df[results_df["selected_models"].apply(_truthy_selected)]
    return [(str(r["combination_id"]), str(r["model_name"])) for _, r in rows.iterrows()]


async def _get_build_config(client_name: str, app_name: str, project_name: str):
    # load build configuration (coefficients, mapping combo->file_key, etc.)
    from motor.motor_asyncio import AsyncIOMotorClient

    MONGO_URI = os.getenv("MONGO_URI", "mongodb://mongo:27017/trinity")
    db_name = os.getenv("MONGO_DB", "trinity_prod")
    coll_name = os.getenv("MONGO_COLLECTION", "build-model_featurebased_configs")

    mclient = AsyncIOMotorClient(MONGO_URI)
    doc_id = f"{client_name}/{app_name}/{project_name}"
    cfg = await mclient[db_name][coll_name].find_one({"_id": doc_id})
    if not cfg:
        raise HTTPException(status_code=404, detail=f"No build configuration found for {doc_id}")
    return cfg


def _coeff_pack(build_cfg: dict, combination_name: str, model_name: str):
    mc = build_cfg.get("model_coefficients", {})
    m_for_combo = mc.get(combination_name, {})
    coeffs = m_for_combo.get(model_name, {})
    if not coeffs:
        raise HTTPException(status_code=404, detail=f"No coefficients for {combination_name} / {model_name}")

    intercept = float(coeffs.get("intercept", 0.0))
    x_vars = coeffs.get("x_variables") or list((coeffs.get("coefficients") or {}).keys())
    if not x_vars:
        raise HTTPException(status_code=400, detail=f"No x_variables for {combination_name} / {model_name}")
    y_var = coeffs.get("y_variable") or build_cfg.get("y_variable") or "Volume"
    betas = coeffs.get("coefficients") or {}
    beta_map = {x: float(betas.get(x, 0.0)) for x in x_vars}
    return intercept, beta_map, x_vars, y_var


def _file_key_for_combo(build_cfg: dict, combination_name: str) -> str:
    for item in build_cfg.get("combination_file_keys", []):
        if item.get("combination") == combination_name:
            return item.get("file_key")
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
    for c in ["Year", "year", "YEAR"]:
        if c in df.columns:
            return c
    return None


# ---------- Routes ----------

@router.get("/files", response_model=ListObjectsResponse)
def list_minio_files(
    bucket: str = Query(default=settings.minio_source_bucket_name, description="Bucket to list"),
    prefix: Optional[str] = Query(default=None, description="Prefix filter (e.g. 'runs/2024/')"),
    recursive: bool = Query(default=True, description="Recurse into subfolders"),
    limit: int = Query(default=1000, ge=1, le=10000, description="Max objects to return"),
    client: Minio = Depends(get_minio_client),
):
    """
    List objects from a MinIO bucket. By default lists model result files from the
    evaluation source bucket (settings.minio_source_bucket_name = 'model_results').
    """
    try:
        if not client.bucket_exists(bucket):
            raise HTTPException(status_code=404, detail=f"Bucket '{bucket}' not found")

        items: List[MinioObject] = []
        for obj in client.list_objects(bucket, prefix=prefix or "", recursive=recursive):
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
        logger.exception("MinIO error while listing files")
        raise HTTPException(status_code=500, detail=f"MinIO error: {e.code}: {e.message}")
    except Exception as e:
        logger.exception("Unexpected error while listing files")
        raise HTTPException(status_code=500, detail=str(e))


@router.get("/files/selected", response_model=SelectedModelsResponse)
def list_selected_models(
    bucket: str = Query(default=settings.minio_source_bucket_name, description="Bucket to read from"),
    prefix: Optional[str] = Query(default=None, description="Prefix to scan (e.g. 'runs/2025-08/')"),
    recursive: bool = Query(default=True, description="Recurse into subfolders"),
    limit: int = Query(default=1000, ge=1, le=10000, description="Max rows to return"),
    offset: int = Query(default=0, ge=0, description="Row offset for pagination"),
    extensions: str = Query(default="parquet,feather,arrow", description="Comma-separated file extensions to include"),
    client: Minio = Depends(get_minio_client),
):
    """
    Scan Arrow/Feather/Parquet files in MinIO and return rows where `selected_models`
    indicates selection (case-insensitive match of: selected/true/yes/1).
    Aggregates across files, supports offset/limit pagination on the combined result.
    """
    try:
        if not client.bucket_exists(bucket):
            raise HTTPException(status_code=404, detail=f"Bucket '{bucket}' not found")

        allowed_ext = {"." + e.strip().lower().lstrip(".") for e in extensions.split(",") if e.strip()}
        if not allowed_ext:
            allowed_ext = _ALLOWED_EXT

        objs = client.list_objects(bucket, prefix=prefix or "", recursive=recursive)

        files_scanned = 0
        total_rows_scanned = 0
        all_rows: List[Dict[str, Any]] = []

        for obj in objs:
            key = getattr(obj, "object_name", "")
            ext = os.path.splitext(key)[1].lower()
            if ext not in allowed_ext:
                continue

            # Fetch object bytes
            try:
                resp = client.get_object(bucket, key)
                data = resp.read()
                resp.close()
                resp.release_conn()
            except S3Error as e:
                logger.warning("Skipping %s due to MinIO error: %s", key, e)
                continue

            files_scanned += 1

            # Parse as Arrow/Feather/Parquet
            try:
                table = _read_table_from_bytes(key, BytesIO(data))
            except Exception as e:
                logger.warning("Skipping %s due to read error: %s", key, e)
                continue

            total_rows_scanned += table.num_rows or 0

            # Filter selected
            table = _filter_selected(table)
            if table.num_rows == 0:
                continue

            # Convert to records
            rows = _table_to_records(table)
            all_rows.extend(rows)

            # Early stop cushion
            if len(all_rows) >= offset + limit + 1000:
                break

        # Apply pagination on the aggregated rows
        sliced = all_rows[offset: offset + limit]

        return SelectedModelsResponse(
            bucket=bucket,
            prefix=prefix,
            files_scanned=files_scanned,
            total_rows_scanned=total_rows_scanned,
            count=len(sliced),
            items=[SelectedModelRow(**r) for r in sliced],
        )

    except HTTPException:
        raise
    except Exception as e:
        logger.exception("Unexpected error in /files/selected")
        raise HTTPException(status_code=500, detail=str(e))


# ---------- Selected models charts ----------

@router.get("/selected/actual-vs-predicted", response_model=ActualPredictedResponse, tags=["Selected Models", "Charts"])
async def selected_actual_vs_predicted(
    results_file_key: str = Query(..., description="MinIO key of the results file with selected_models flags"),
    client_name: str = Query(...),
    app_name: str = Query(...),
    project_name: str = Query(...),
    bucket: str = Query(default=settings.minio_source_bucket_name, description="MinIO bucket for both results & sources"),
    limit_models: int = Query(default=1000, ge=1, le=10000),
    client: Minio = Depends(get_minio_client),
):
    """
    For every row flagged in `selected_models`, compute actual vs predicted using the model
    coefficients + source data (intercept + sum(beta*x)).
    Returns an array of items, one per (combination_id, model_name).
    """
    # 1) read results and collect (combination_id, model_name) pairs
    results_df = _read_minio_dataframe(client, bucket, results_file_key)
    selected_pairs = _collect_selected_rows(results_df)[:limit_models]

    build_cfg = await _get_build_config(client_name, app_name, project_name)

    items: List[Dict[str, Any]] = []
    for combination_id, model_name in selected_pairs:
        file_key = _file_key_for_combo(build_cfg, combination_id)
        src_df = _read_minio_dataframe(client, bucket, file_key)
        intercept, betas, x_vars, y_var = _coeff_pack(build_cfg, combination_id, model_name)

        # coerce y to numeric
        if y_var not in src_df.columns:
            raise HTTPException(status_code=404, detail=f"y_variable '{y_var}' not in source for {combination_id}")
        actual = pd.to_numeric(src_df[y_var], errors="coerce").fillna(0.0).to_numpy(dtype=float)
        pred = _predict_series(src_df, intercept, betas, x_vars)

        # optional outlier guard
        if len(pred) and len(actual):
            p99, p01 = np.percentile(pred, 99), np.percentile(pred, 1)
            a99, a01 = np.percentile(actual, 99), np.percentile(actual, 1)
            mask = (pred <= p99) & (pred >= p01) & (actual <= a99) & (actual >= a01)
            actual = actual[mask]
            pred = pred[mask]

        items.append(
            ActualPredictedItem(
                combination_id=combination_id,
                model_name=model_name,
                file_key=file_key,
                actual_values=actual.tolist(),
                predicted_values=pred.tolist(),
                performance_metrics=PerformanceMetrics(**_metrics(actual, pred)),
                data_points=int(len(actual)),
            ).dict()
        )

    return ActualPredictedResponse(
        results_file_key=results_file_key,
        bucket=bucket,
        models_count=len(items),
        items=[ActualPredictedItem(**i) for i in items],
    )


@router.get("/selected/contributions-yoy", response_model=ContributionsResponse, tags=["Selected Models", "Charts"])
async def selected_contributions_yoy(
    results_file_key: str = Query(..., description="MinIO key of the results file with selected_models flags"),
    client_name: str = Query(...),
    app_name: str = Query(...),
    project_name: str = Query(...),
    bucket: str = Query(default=settings.minio_source_bucket_name),
    client: Minio = Depends(get_minio_client),
):
    """
    For every selected (combination_id, model_name):
      - build variable-level contribution time series with beta * X_t
      - aggregate by Year
      - compute YoY % change per variable
    Returns one block per model with {yearly_contributions, yoy_contributions}.
    """
    results_df = _read_minio_dataframe(client, bucket, results_file_key)
    selected_pairs = _collect_selected_rows(results_df)

    build_cfg = await _get_build_config(client_name, app_name, project_name)

    out_items: List[Dict[str, Any]] = []
    for combination_id, model_name in selected_pairs:
        file_key = _file_key_for_combo(build_cfg, combination_id)
        df = _read_minio_dataframe(client, bucket, file_key)
        intercept, betas, x_vars, _y_var = _coeff_pack(build_cfg, combination_id, model_name)

        year_col = _year_col(df)
        if not year_col:
            raise HTTPException(status_code=400, detail=f"Source for {combination_id} has no Year column")

        # Build per-variable contribution columns (beta * x)
        contrib_cols: Dict[str, pd.Series] = {}
        for x in x_vars:
            if x in df.columns:
                vec = pd.to_numeric(df[x], errors="coerce").fillna(0.0)
                contrib_cols[x] = (betas.get(x, 0.0) * vec).astype(float)

        if not contrib_cols:
            # nothing to contribute
            continue

        contrib_df = pd.DataFrame(contrib_cols)
        contrib_df[year_col] = df[year_col]

        # Yearly totals per variable
        yearly = contrib_df.groupby(year_col).sum(numeric_only=True).sort_index()

        # YoY % change per variable
        yoy = yearly.pct_change().replace([np.inf, -np.inf], np.nan) * 100.0

        years_list: List[Any]
        if np.issubdtype(yearly.index.dtype, np.number):
            years_list = yearly.index.astype(int).tolist()
        else:
            years_list = yearly.index.astype(str).tolist()

        out_items.append(
            ContributionsItem(
                combination_id=combination_id,
                model_name=model_name,
                file_key=file_key,
                years=years_list,
                yearly_contributions={col: yearly[col].round(6).tolist() for col in yearly.columns},
                yoy_contributions_pct={col: yoy[col].round(4).fillna(0.0).tolist() for col in yearly.columns},
            ).dict()
        )

    if not out_items:
        raise HTTPException(status_code=404, detail="No selected models (or no contribution variables) found")

    return ContributionsResponse(
        results_file_key=results_file_key,
        bucket=bucket,
        models_count=len(out_items),
        items=[ContributionsItem(**i) for i in out_items],
    )