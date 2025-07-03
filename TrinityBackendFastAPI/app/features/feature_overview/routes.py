from minio import Minio
from minio.error import S3Error
import os
from fastapi import APIRouter, Form, HTTPException
from urllib.parse import unquote
from fastapi.responses import JSONResponse, Response
import pandas as pd
import io
import json
import pyarrow as pa
import pyarrow.ipc as ipc
from datetime import date, datetime
from typing import List
from fastapi import Depends
from motor.motor_asyncio import AsyncIOMotorCollection
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

from .feature_overview.base import run_unique_count,run_feature_overview, output_store, unique_count
from app.utils.db import fetch_client_app_project
from app.utils.arrow_client import download_dataframe, download_table_bytes
from app.utils.flight_registry import get_flight_path_for_csv
import asyncio


# MinIO client initialization
MINIO_ENDPOINT = os.getenv("MINIO_ENDPOINT", "minio:9000")
MINIO_ACCESS_KEY = os.getenv("MINIO_ACCESS_KEY", "admin_dev")
MINIO_SECRET_KEY = os.getenv("MINIO_SECRET_KEY", "pass_dev")
MINIO_BUCKET = os.getenv("MINIO_BUCKET", "trinity")

USER_ID = int(os.getenv("USER_ID", "0"))
PROJECT_ID = int(os.getenv("PROJECT_ID", "0"))

CLIENT_NAME = os.getenv("CLIENT_NAME", "default_client")
APP_NAME = os.getenv("APP_NAME", "default_app")
PROJECT_NAME = os.getenv("PROJECT_NAME", "default_project")

def load_names_from_db() -> None:
    global CLIENT_NAME, APP_NAME, PROJECT_NAME
    if USER_ID and PROJECT_ID:
        try:
            CLIENT_NAME_DB, APP_NAME_DB, PROJECT_NAME_DB = asyncio.run(
                fetch_client_app_project(USER_ID, PROJECT_ID)
            )
            CLIENT_NAME = CLIENT_NAME_DB or CLIENT_NAME
            APP_NAME = APP_NAME_DB or APP_NAME
            PROJECT_NAME = PROJECT_NAME_DB or PROJECT_NAME
        except Exception as exc:
            print(f"⚠️ Failed to load names from DB: {exc}")

load_names_from_db()

OBJECT_PREFIX = f"{CLIENT_NAME}/{APP_NAME}/{PROJECT_NAME}/"

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
    if not object_name.startswith(OBJECT_PREFIX):
        print(
            f"⚠️ column_summary prefix mismatch: {object_name} (expected {OBJECT_PREFIX})"
        )
    try:
        flight_path = get_flight_path_for_csv(object_name)
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
            content = redis_client.get(object_name)
            if content is None:
                response = minio_client.get_object(MINIO_BUCKET, object_name)
                content = response.read()
                redis_client.setex(object_name, 3600, content)
            if object_name.endswith(".arrow"):
                reader = ipc.RecordBatchFileReader(pa.BufferReader(content))
                df = reader.read_all().to_pandas()
            elif object_name.endswith(".csv"):
                df = pd.read_csv(io.BytesIO(content))
            elif object_name.endswith((".xls", ".xlsx")):
                df = pd.read_excel(io.BytesIO(content))
            else:
                raise ValueError("Unsupported file format")

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

            safe_vals = [_serialize(v) for v in vals[:10]]
            summary.append({
                "column": col,
                "data_type": str(df[col].dtype),
                "unique_count": int(len(vals)),
                "unique_values": safe_vals,
            })
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
    """Return the raw CSV bytes for a saved dataframe from Redis."""
    object_name = unquote(object_name)
    print(f"➡️ cached_dataframe request: {object_name}")
    if not object_name.startswith(OBJECT_PREFIX):
        print(
            f"⚠️ cached_dataframe prefix mismatch: {object_name} (expected {OBJECT_PREFIX})"
        )
    try:
        content = redis_client.get(object_name)
        if content is None:
            response = minio_client.get_object(MINIO_BUCKET, object_name)
            content = response.read()
            redis_client.setex(object_name, 3600, content)

        if object_name.endswith(".arrow"):
            try:
                reader = ipc.RecordBatchFileReader(pa.BufferReader(content))
                df = reader.read_all().to_pandas()
                content = df.to_csv(index=False).encode()
            except Exception as e:
                print(f"⚠️ cached_dataframe failed to convert arrow: {e}")

        return Response(content, media_type="text/csv")
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
    flight_path = get_flight_path_for_csv(object_name)
    print(f"➡️ flight_table request: {object_name} path={flight_path}")
    if not flight_path:
        raise HTTPException(status_code=404, detail="Flight path not found")
    try:
        data = download_table_bytes(flight_path)
        return Response(data, media_type="application/vnd.apache.arrow.file")
    except Exception as e:
        print(f"⚠️ flight_table error for {object_name}: {e}")
        raise HTTPException(status_code=400, detail=str(e))


@router.get("/sku_stats")
async def sku_stats(object_name: str, y_column: str, combination: str, x_column: str = "date"):
    """Return time series and summary for a specific SKU combination."""
    object_name = unquote(object_name)
    print(f"➡️ sku_stats request: {object_name}")
    if not object_name.startswith(OBJECT_PREFIX):
        print(
            f"⚠️ sku_stats prefix mismatch: {object_name} (expected {OBJECT_PREFIX})"
        )
    try:
        combo = json.loads(combination)
    except Exception as e:
        raise HTTPException(status_code=400, detail=f"Invalid combination: {e}")

    try:
        flight_path = get_flight_path_for_csv(object_name)
        df = None
        if flight_path:
            print(f"📡 trying flight download {flight_path}")
            try:
                df = download_dataframe(flight_path)
            except Exception as e:
                print(f"⚠️ sku_stats flight download failed for {object_name}: {e}")
        if df is None:
            content = redis_client.get(object_name)
            if content is None:
                response = minio_client.get_object(MINIO_BUCKET, object_name)
                content = response.read()
                redis_client.setex(object_name, 3600, content)

            if object_name.endswith(".csv"):
                df = pd.read_csv(io.BytesIO(content))
            elif object_name.endswith((".xls", ".xlsx")):
                df = pd.read_excel(io.BytesIO(content))
            elif object_name.endswith(".arrow"):
                reader = ipc.RecordBatchFileReader(pa.BufferReader(content))
                df = reader.read_all().to_pandas()
            else:
                raise ValueError("Unsupported file format")

        df.columns = df.columns.str.lower()
        y_col = y_column.lower()
        if y_col not in df.columns:
            raise ValueError("y_column not found")

        x_col = x_column.lower()
        if x_col not in df.columns:
            date_cols = [c for c in df.columns if "date" in c or "time" in c]
            if not date_cols:
                raise ValueError("no date column found")
            x_col = date_cols[0]


        mask = pd.Series(True, index=df.index)
        for k, v in combo.items():
            col = k.lower()
            if col in df.columns:
                mask &= df[col] == v

        sub = df.loc[mask, [x_col, y_col]].dropna()
        sub[x_col] = pd.to_datetime(sub[x_col], errors="coerce")
        sub = sub.dropna(subset=[x_col]).sort_values(x_col)

        series = [
            {"date": str(d.date() if hasattr(d, "date") else d), "value": float(val)}
            for d, val in zip(sub[x_col], sub[y_col])
        ]
        summary = {
            "avg": float(sub[y_col].mean()) if not sub.empty else 0,
            "min": float(sub[y_col].min()) if not sub.empty else 0,
            "max": float(sub[y_col].max()) if not sub.empty else 0,
        }
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
    validator_collection: AsyncIOMotorCollection = Depends(get_validator_atoms_collection),
   
):
    try:

        dimensions = await fetch_dimensions_dict(validator_atom_id, file_key, validator_collection)




        dataframes = []
        for object_name in object_names:
            response = minio_client.get_object(bucket_name, object_name)
            content = response.read()
            if object_name.endswith(".csv"):
                df = pd.read_csv(io.BytesIO(content))
            elif object_name.endswith((".xls", ".xlsx")):
                df = pd.read_excel(io.BytesIO(content))
            else:
                raise ValueError(f"Unsupported file format: {object_name}")
            df.columns = df.columns.str.lower()
            dataframes.append(df)

        if not dataframes:
            raise ValueError("No valid files fetched from MinIO")

        combined_df = pd.concat(dataframes, ignore_index=True)
        result = run_unique_count(
            combined_df,
            dimensions
        )

        # Save the results
        await save_feature_overview_unique_results(unique_count, results_collection,validator_atom_id, file_key)
        




        return JSONResponse(content={"status": result,"dimensions": dimensions})
    
    except S3Error as e:
        return JSONResponse(status_code=500, content={"status": "FAILURE", "error": str(e)})

    except Exception as e:
        return JSONResponse(status_code=400, content={"status": "FAILURE", "error": str(e)})





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
    validator_collection: AsyncIOMotorCollection = Depends(get_validator_atoms_collection),
   
):
    try:
      
        dimensions = await fetch_dimensions_dict(validator_atom_id, file_key, validator_collection)
        
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
            create_summary=create_summary
        )

        # Save the results
        await save_feature_overview_results(output_store, results_collection,validator_atom_id, file_key)
        




        return JSONResponse(content={"status": result,"dimensions": dimensions})
    
    except S3Error as e:
        return JSONResponse(status_code=500, content={"status": "FAILURE", "error": str(e)})

    except Exception as e:
        return JSONResponse(status_code=400, content={"status": "FAILURE", "error": str(e)})







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
