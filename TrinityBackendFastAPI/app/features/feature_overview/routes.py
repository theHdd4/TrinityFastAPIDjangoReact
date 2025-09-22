from minio import Minio
from minio.error import S3Error
import os
from fastapi import APIRouter, Form, HTTPException
from urllib.parse import unquote, quote
from fastapi.responses import JSONResponse, Response
import pandas as pd
import io
import json
import pyarrow as pa
import pyarrow.ipc as ipc
import polars as pl
from datetime import date, datetime
from typing import List
from fastapi import Depends
from pydantic import BaseModel
from motor.motor_asyncio import AsyncIOMotorCollection
from functools import reduce
from .deps import (
    get_unique_dataframe_results_collection,
    get_summary_results_collection,
    get_validator_atoms_collection,
    redis_client,
)

from .mongodb_saver import (
    save_feature_overview_results,
    save_feature_overview_unique_results,
    fetch_dimensions_dict,
)
from app.features.data_upload_validate.app.routes import get_object_prefix

from .feature_overview.base import (
    run_unique_count,
    run_feature_overview,
    output_store,
    unique_count,
)


def _parse_numeric_id(value: str | int | None) -> int:
    """Return the numeric component of an ID string like "name_123"."""
    if value is None:
        return 0
    try:
        return int(str(value).split("_")[-1])
    except Exception:
        return 0


from app.DataStorageRetrieval.arrow_client import (
    download_dataframe,
    download_table_bytes,
    upload_dataframe,
)
from app.DataStorageRetrieval.flight_registry import (
    get_flight_path_for_csv,
    set_ticket,
)
from app.DataStorageRetrieval.db import get_dataset_info
from app.features.column_classifier.database import (
    get_project_dimension_mapping,
    get_classifier_config_from_mongo,
)
import asyncio


# MinIO client initialization
# Default to the development MinIO service if not explicitly configured
MINIO_ENDPOINT = os.getenv("MINIO_ENDPOINT", "minio:9000")
MINIO_ACCESS_KEY = os.getenv("MINIO_ACCESS_KEY", "admin_dev")
MINIO_SECRET_KEY = os.getenv("MINIO_SECRET_KEY", "pass_dev")
MINIO_BUCKET = os.getenv("MINIO_BUCKET", "trinity")

# Legacy environment lookups are replaced by per-request prefix calculation via
# ``get_object_prefix`` from the data upload feature.  This ensures all feature
# overview endpoints operate on the same client/app/project namespace as the
# rest of the system without relying on global environment variables.

minio_client = Minio(
    MINIO_ENDPOINT,
    access_key=MINIO_ACCESS_KEY,
    secret_key=MINIO_SECRET_KEY,
    secure=False,  # Set to True if using HTTPS
)


# Ensure required bucket exists on startup
def ensure_minio_bucket():
    try:
        if not minio_client.bucket_exists(MINIO_BUCKET):
            minio_client.make_bucket(MINIO_BUCKET)
            print(f"📁 Created MinIO bucket '{MINIO_BUCKET}' for feature overview")
        else:
            print(f"✅ MinIO bucket '{MINIO_BUCKET}' is accessible for feature overview")
    except Exception as e:
        print(f"⚠️ MinIO connection error: {e}")


ensure_minio_bucket()

router = APIRouter()


@router.get("/column_summary")
async def column_summary(object_name: str):
    """Return column summary statistics for a saved dataframe."""
    object_name = unquote(object_name)
    print(f"➡️ column_summary request: {object_name}")
    parts = object_name.split("/", 3)
    client = parts[0] if len(parts) > 0 else ""
    app = parts[1] if len(parts) > 1 else ""
    project = parts[2] if len(parts) > 2 else ""
    prefix = await get_object_prefix(
        client_name=client, app_name=app, project_name=project
    )
    if not object_name.startswith(prefix):
        print(
            f"⚠️ column_summary prefix mismatch: {object_name} (expected {prefix})"
        )
    try:
        flight_path = get_flight_path_for_csv(object_name)
        if not flight_path:
            info = await get_dataset_info(object_name)
            if info:
                file_key, flight_path, original_csv = info
                set_ticket(file_key, object_name, flight_path, original_csv)
                print(f"🗄 restored ticket for {object_name}: {flight_path}")
        df = None
        if flight_path:
            print(f"📡 trying flight download {flight_path}")
            try:
                df = download_dataframe(flight_path)
            except Exception as e:
                print(
                    f"⚠️ column_summary flight download failed for {object_name}: {e}"
                )
        if df is None:
            if not object_name.endswith(".arrow"):
                raise ValueError("Unsupported file format")
            content = redis_client.get(object_name)
            if content is None:
                response = minio_client.get_object(MINIO_BUCKET, object_name)
                content = response.read()
                redis_client.setex(object_name, 3600, content)
            reader = ipc.RecordBatchFileReader(pa.BufferReader(content))
            df = reader.read_all().to_pandas()

        df.columns = df.columns.str.lower()
        summary = []
        for col in df.columns:
            column_series = df[col].dropna()
            try:
                vals = column_series.unique()
            except TypeError:
                vals = column_series.astype(str).unique()

            def _serialize(v):
                if isinstance(v, (pd.Timestamp, datetime, date)):
                    return pd.to_datetime(v).isoformat()
                return str(v)

            safe_vals = [_serialize(v) for v in vals]
            summary.append(
                {
                    "column": col,
                    "data_type": str(df[col].dtype),
                    "unique_count": int(len(vals)),
                    "unique_values": safe_vals,
                }
            )
        return {"summary": summary}
    except S3Error as e:
        error_code = getattr(e, "code", "")
        if error_code in {"NoSuchKey", "NoSuchBucket"}:
            redis_client.delete(object_name)
            raise HTTPException(status_code=404, detail="File not found")
        raise HTTPException(status_code=500, detail=str(e))
    except Exception as e:
        print(f"⚠️ column_summary error for {object_name}: {e}")
        raise HTTPException(status_code=400, detail=str(e))


@router.get("/cached_dataframe")
async def cached_dataframe(object_name: str):
    """Return the saved dataframe as CSV text.
    Prefers Arrow Flight for the latest data, then falls back to Redis/MinIO."""
    object_name = unquote(object_name)
    print(f"➡️ cached_dataframe request: {object_name}")
    parts = object_name.split("/", 3)
    client = parts[0] if len(parts) > 0 else ""
    app = parts[1] if len(parts) > 1 else ""
    project = parts[2] if len(parts) > 2 else ""
    prefix = await get_object_prefix(
        client_name=client, app_name=app, project_name=project
    )
    if not object_name.startswith(prefix):
        print(
            f"⚠️ cached_dataframe prefix mismatch: {object_name} (expected {prefix})"
        )
    try:
        try:
            df = download_dataframe(object_name)
            csv_text = df.to_csv(index=False)
            return Response(csv_text, media_type="text/csv")
        except Exception as exc:
            print(f"⚠️ flight dataframe error for {object_name}: {exc}")

        content = redis_client.get(object_name)
        if content is None:
            response = minio_client.get_object(MINIO_BUCKET, object_name)
            content = response.read()
            redis_client.setex(object_name, 3600, content)

        if object_name.endswith(".arrow"):
            reader = ipc.RecordBatchFileReader(pa.BufferReader(content))
            df = reader.read_all().to_pandas()
            csv_text = df.to_csv(index=False)
            return Response(csv_text, media_type="text/csv")

        try:
            text = content.decode()
        except Exception:
            text = content
        return Response(text, media_type="text/csv")
    except S3Error as e:
        error_code = getattr(e, "code", "")
        if error_code in {"NoSuchKey", "NoSuchBucket"}:
            redis_client.delete(object_name)
            raise HTTPException(status_code=404, detail="File not found")
        raise HTTPException(status_code=500, detail=str(e))
    except Exception as e:
        print(f"⚠️ cached_dataframe error for {object_name}: {e}")
        raise HTTPException(status_code=400, detail=str(e))


@router.get("/flight_table")
async def flight_table(object_name: str):
    """Return the Arrow IPC file for the given object via Arrow Flight."""
    object_name = unquote(object_name)
    parts = object_name.split("/", 3)
    client = parts[0] if len(parts) > 0 else ""
    app = parts[1] if len(parts) > 1 else ""
    project = parts[2] if len(parts) > 2 else ""
    await get_object_prefix(client_name=client, app_name=app, project_name=project)
    flight_path = get_flight_path_for_csv(object_name)
    if not flight_path:
        info = await get_dataset_info(object_name)
        if info:
            file_key, flight_path, original_csv = info
            set_ticket(file_key, object_name, flight_path, original_csv)
            print(f"🗄 restored ticket for {object_name}: {flight_path}")
    print(f"➡️ flight_table request: {object_name} path={flight_path}")
    if not flight_path:
        print(f"⚠️ flight path not found for {object_name}; using object name")
        flight_path = object_name
    try:
        data = download_table_bytes(flight_path)
        return Response(data, media_type="application/vnd.apache.arrow.file")
    except Exception as e:
        print(f"⚠️ flight_table error for {object_name}: {e}")
        raise HTTPException(status_code=400, detail=str(e))


class DimensionMappingRequest(BaseModel):
    client_name: str
    app_name: str
    project_name: str
    object_name: str | None = None


@router.post("/dimension_mapping")
async def dimension_mapping(req: DimensionMappingRequest):
    """Return dimension to identifier mapping.

    Checks the ``env`` namespace in Redis for a cached environment entry.  When
    not found, the column classifier configuration is loaded from MongoDB.
    This ensures Feature Overview can prefetch dimension mappings and render
    SKU tables and charts correctly.
    """

    payload = req.dict()
    print(f"🛰️ dimension_mapping payload: {payload}")
    client = req.client_name
    app = req.app_name
    project = req.project_name
    object_name = req.object_name or ""

    env_key = f"env:{client}:{app}:{project}"
    cached_env = None
    file_env_key = None
    if object_name:
        safe_file = quote(object_name, safe="")
        file_env_key = f"{env_key}:file:{safe_file}"
        cached_env = redis_client.get(file_env_key)
    if cached_env is None:
        cached_env = redis_client.get(env_key)
    if cached_env:
        print("✅ found env in redis")
        try:
            env = json.loads(cached_env)
            if object_name and env.get("file_name") and env["file_name"] != object_name:
                dims = None
            else:
                dims = env.get("dimensions")
            if isinstance(dims, dict):
                return {"mapping": dims, "source": "env"}
        except Exception as exc:  # pragma: no cover
            print(f"⚠️ dimension_mapping env parse error: {exc}")
    else:
        print("🔍 env not in redis")

    mongo_cfg = get_classifier_config_from_mongo(
        client,
        app,
        project,
        object_name or None,
    )
    if mongo_cfg and mongo_cfg.get("dimensions"):
        print("📦 loaded mapping from MongoDB")
        try:
            redis_client.setex(env_key, 3600, json.dumps(mongo_cfg, default=str))
            if file_env_key:
                redis_client.setex(file_env_key, 3600, json.dumps(mongo_cfg, default=str))
        except Exception:
            pass
        return {"mapping": mongo_cfg["dimensions"], "config": mongo_cfg}

    raise HTTPException(status_code=404, detail="Mapping not found")


def _load_polars_frame(object_name: str, flight_path: str | None = None) -> pl.DataFrame:
    """Load a dataframe for feature overview analysis as a Polars frame."""

    if flight_path:
        try:
            pandas_df = download_dataframe(flight_path)
            if pandas_df is not None:
                return pl.from_pandas(pandas_df)
        except Exception as exc:
            print(f"⚠️ polars load via flight failed for {flight_path}: {exc}")

    if not object_name.endswith(".arrow"):
        raise ValueError("Unsupported file format")

    content = redis_client.get(object_name)
    if content is None:
        response = minio_client.get_object(MINIO_BUCKET, object_name)
        content = response.read()
        redis_client.setex(object_name, 3600, content)

    try:
        return pl.read_ipc(io.BytesIO(content))
    except Exception as exc:
        print(f"⚠️ polars read_ipc failed for {object_name}: {exc}")
        reader = ipc.RecordBatchFileReader(pa.BufferReader(content))
        table = reader.read_all()
        pandas_df = table.to_pandas()
        return pl.from_pandas(pandas_df)


def _lowercase_columns(df: pl.DataFrame) -> pl.DataFrame:
    """Return a dataframe with normalized lowercase column names."""

    rename_map: dict[str, str] = {}
    seen: dict[str, int] = {}
    for original in df.columns:
        lowered = str(original).strip().lower()
        if not lowered:
            lowered = "column"
        index = seen.get(lowered, 0)
        seen[lowered] = index + 1
        if index:
            lowered = f"{lowered}_{index}"
        rename_map[original] = lowered

    return df.rename(rename_map) if rename_map else df


def _parse_datetime_column(frame: pl.DataFrame, column: str) -> pl.DataFrame:
    """Ensure the provided column is represented as a Polars Datetime column."""

    dtype = frame.schema.get(column)
    if dtype in (pl.Date, pl.Datetime):
        return frame.with_columns(pl.col(column).cast(pl.Datetime).alias(column))

    return frame.with_columns(
        pl.col(column)
        .cast(pl.Utf8, strict=False)
        .str.strptime(pl.Datetime, strict=False, exact=False)
        .alias(column)
    )


def _prepare_timeseries(
    frame: pl.DataFrame, x_col: str, y_col: str
) -> tuple[list[dict[str, float]], dict[str, float]]:
    """Convert a filtered dataframe into timeseries points and summary stats."""

    if frame.is_empty():
        return [], {"avg": 0.0, "min": 0.0, "max": 0.0}

    stats_row = (
        frame.select(
            [
                pl.col(y_col).mean().alias("avg"),
                pl.col(y_col).min().alias("min"),
                pl.col(y_col).max().alias("max"),
            ]
        )
        .to_dicts()[0]
    )

    summary = {k: float(stats_row.get(k, 0.0) or 0.0) for k in ("avg", "min", "max")}

    series = []
    for row in frame.iter_rows(named=True):
        dt_value = row.get(x_col)
        y_value = row.get(y_col)
        if dt_value is None or y_value is None:
            continue
        if isinstance(dt_value, datetime):
            ts = dt_value.date().isoformat()
        elif isinstance(dt_value, date):
            ts = dt_value.isoformat()
        else:
            ts = str(dt_value)
        try:
            series.append({"date": ts, "value": float(y_value)})
        except Exception:
            continue

    return series, summary


@router.get("/sku_stats")
async def sku_stats(
    object_name: str, y_column: str, combination: str, x_column: str = "date"
):
    """Return time series and summary for a specific SKU combination."""
    object_name = unquote(object_name)
    print(f"➡️ sku_stats request: {object_name}")
    parts = object_name.split("/", 3)
    client = parts[0] if len(parts) > 0 else ""
    app = parts[1] if len(parts) > 1 else ""
    project = parts[2] if len(parts) > 2 else ""
    prefix = await get_object_prefix(
        client_name=client, app_name=app, project_name=project
    )
    if not object_name.startswith(prefix):
        print(f"⚠️ sku_stats prefix mismatch: {object_name} (expected {prefix})")
    try:
        combo = json.loads(combination)
    except Exception as e:
        raise HTTPException(status_code=400, detail=f"Invalid combination: {e}")

    try:
        flight_path = get_flight_path_for_csv(object_name)
        if not flight_path:
            info = await get_dataset_info(object_name)
            if info:
                file_key, flight_path, original_csv = info
                set_ticket(file_key, object_name, flight_path, original_csv)
                print(f"🗄 restored ticket for {object_name}: {flight_path}")
        if flight_path:
            print(f"📡 trying flight download {flight_path}")

        frame = _load_polars_frame(object_name, flight_path)
        frame = _lowercase_columns(frame)

        y_col = y_column.lower()
        if y_col not in frame.columns:
            raise ValueError("y_column not found")

        x_col = x_column.lower()
        if x_col not in frame.columns:
            date_cols = [c for c in frame.columns if "date" in c or "time" in c]
            if not date_cols:
                raise ValueError("no date column found")
            x_col = date_cols[0]

        filter_exprs = []
        for raw_key, raw_value in combo.items():
            col = raw_key.lower()
            if col not in frame.columns:
                continue
            frame = frame.with_columns(
                pl.col(col).cast(pl.Utf8, strict=False).alias(col)
            )
            if isinstance(raw_value, list):
                values = ["" if v is None else str(v) for v in raw_value]
                filter_exprs.append(pl.col(col).is_in(values))
            else:
                value = "" if raw_value is None else str(raw_value)
                filter_exprs.append(pl.col(col) == value)

        if filter_exprs:
            condition = reduce(lambda acc, expr: acc & expr, filter_exprs[1:], filter_exprs[0])
            frame = frame.filter(condition)

        subset = frame.select([x_col, y_col])
        subset = subset.with_columns(
            pl.col(y_col).cast(pl.Float64, strict=False).alias(y_col)
        )
        subset = _parse_datetime_column(subset, x_col)
        subset = subset.drop_nulls([x_col, y_col]).sort(x_col)

        series, summary = _prepare_timeseries(subset, x_col, y_col)
        return {"timeseries": series, "summary": summary}
    except S3Error as e:
        error_code = getattr(e, "code", "")
        if error_code in {"NoSuchKey", "NoSuchBucket"}:
            redis_client.delete(object_name)
            raise HTTPException(status_code=404, detail="File not found")
        raise HTTPException(status_code=500, detail=str(e))
    except Exception as e:
        print(f"⚠️ sku_stats error for {object_name}: {e}")
        raise HTTPException(status_code=400, detail=str(e))


@router.get("/ping")
async def ping():
    return {"msg": "Feature overview is alive"}


@router.post("/uniquecount")
async def feature_overview_uniquecountendpoint(
    bucket_name: str = Form(...),
    object_names: List[str] = Form(...),
    # dimension_json: str = Form(...),
    # id:str = Form(...),
    validator_atom_id: str = Form(...),
    file_key: str = Form(...),
    results_collection=Depends(get_unique_dataframe_results_collection),
    validator_collection: AsyncIOMotorCollection = Depends(
        get_validator_atoms_collection
    ),
):
    try:
        dimensions = await fetch_dimensions_dict(
            validator_atom_id, file_key, validator_collection
        )

        dataframes = []
        for object_name in object_names:
            response = minio_client.get_object(bucket_name, object_name)
            content = response.read()
            if object_name.endswith(".csv"):
                df = pd.read_csv(io.BytesIO(content))
            elif object_name.endswith((".xls", ".xlsx")):
                df = pd.read_excel(io.BytesIO(content))
            elif object_name.endswith(".arrow"):
                reader = ipc.RecordBatchFileReader(pa.BufferReader(content))
                df = reader.read_all().to_pandas()
            else:
                raise ValueError(f"Unsupported file format: {object_name}")
            df.columns = df.columns.str.lower()
            dataframes.append(df)

        if not dataframes:
            raise ValueError("No valid files fetched from MinIO")

        combined_df = pd.concat(dataframes, ignore_index=True)
        result = run_unique_count(combined_df, dimensions)

        # Save the results
        await save_feature_overview_unique_results(
            unique_count, results_collection, validator_atom_id, file_key
        )

        return JSONResponse(content={"status": result, "dimensions": dimensions})

    except S3Error as e:
        return JSONResponse(
            status_code=500, content={"status": "FAILURE", "error": str(e)}
        )

    except Exception as e:
        return JSONResponse(
            status_code=400, content={"status": "FAILURE", "error": str(e)}
        )


@router.post("/summary")
async def feature_overview_summaryendpoint(
    bucket_name: str = Form(...),
    object_names: List[str] = Form(...),
    # dimension_json: str = Form(...),
    # id:str = Form(...),
    validator_atom_id: str = Form(...),
    file_key: str = Form(...),
    create_hierarchy: bool = Form(False),
    create_summary: bool = Form(False),
    combination: str = Form(None),  # Optional specific combo
    results_collection=Depends(get_summary_results_collection),
    validator_collection: AsyncIOMotorCollection = Depends(
        get_validator_atoms_collection
    ),
):
    try:
        dimensions = await fetch_dimensions_dict(
            validator_atom_id, file_key, validator_collection
        )

        combination_dict = None
        if combination:
            try:
                combination_dict = json.loads(combination)
                if not isinstance(combination_dict, dict):
                    raise ValueError("Combination must be a dictionary")
            except Exception as e:
                raise ValueError(f"Invalid combination format: {str(e)}")

        dataframes = []
        for object_name in object_names:
            response = minio_client.get_object(bucket_name, object_name)
            content = response.read()
            if object_name.endswith(".csv"):
                df = pd.read_csv(io.BytesIO(content))
            elif object_name.endswith((".xls", ".xlsx")):
                df = pd.read_excel(io.BytesIO(content))
            elif object_name.endswith(".arrow"):
                reader = ipc.RecordBatchFileReader(pa.BufferReader(content))
                df = reader.read_all().to_pandas()
            else:
                raise ValueError(f"Unsupported file format: {object_name}")
            df.columns = df.columns.str.lower()
            dataframes.append(df)

        if not dataframes:
            raise ValueError("No valid files fetched from MinIO")

        combined_df = pd.concat(dataframes, ignore_index=True)
        result = run_feature_overview(
            combined_df,
            dimensions,
            create_hierarchy=create_hierarchy,
            selected_combination=combination_dict,
            create_summary=create_summary,
        )

        # Save the results
        await save_feature_overview_results(
            output_store, results_collection, validator_atom_id, file_key
        )

        return JSONResponse(content={"status": result, "dimensions": dimensions})

    except S3Error as e:
        return JSONResponse(
            status_code=500, content={"status": "FAILURE", "error": str(e)}
        )

    except Exception as e:
        return JSONResponse(
            status_code=400, content={"status": "FAILURE", "error": str(e)}
        )


@router.get("/unique_dataframe_results")
def get_feature_overview_unique_dataframe_results():
    if not unique_count:
        raise HTTPException(status_code=404, detail="No results available")

    result = {}
    for key, val in unique_count["unique_result"].items():
        if isinstance(val, pd.DataFrame):
            result[key] = val.to_dict(orient="records")
        else:
            result[key] = val

    return result


@router.get("/results")
def get_feature_overview_results():
    if not output_store:
        raise HTTPException(status_code=404, detail="No results available")

    result = {}
    for key, val in output_store["result"].items():
        if isinstance(val, pd.DataFrame):
            result[key] = val.to_dict(orient="records")
        else:
            result[key] = val

    return result
