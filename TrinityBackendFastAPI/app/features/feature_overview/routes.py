from minio import Minio
from minio.error import S3Error
import os
from fastapi import APIRouter, Form, HTTPException
from fastapi.responses import JSONResponse, Response
import pandas as pd
import io
import json
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


# MinIO client initialization
MINIO_ENDPOINT = os.getenv("MINIO_ENDPOINT", "minio:9000")
MINIO_ACCESS_KEY = os.getenv("MINIO_ACCESS_KEY", "admin_dev")
MINIO_SECRET_KEY = os.getenv("MINIO_SECRET_KEY", "pass_dev")
MINIO_BUCKET = os.getenv("MINIO_BUCKET", "validated-d1")

minio_client = Minio(
    MINIO_ENDPOINT,
    access_key=MINIO_ACCESS_KEY,
    secret_key=MINIO_SECRET_KEY,
    secure=False,  # Set to True if using HTTPS
)

router = APIRouter()


@router.get("/column_summary")
async def column_summary(object_name: str):
    """Return column summary statistics for a saved dataframe."""
    try:
        content = redis_client.get(object_name)
        if content is None:
            response = minio_client.get_object(MINIO_BUCKET, object_name)
            content = response.read()
            redis_client.setex(object_name, 3600, content)
        if object_name.endswith(".csv"):
            df = pd.read_csv(io.BytesIO(content))
        elif object_name.endswith((".xls", ".xlsx")):
            df = pd.read_excel(io.BytesIO(content))
        else:
            raise ValueError("Unsupported file format")

        df.columns = df.columns.str.lower()
        summary = []
        for col in df.columns:
            vals = df[col].dropna().unique()
            # Convert to plain Python types for JSON serialisation
            safe_vals = [str(v) for v in vals[:10]]
            summary.append({
                "column": col,
                "data_type": str(df[col].dtype),
                "unique_count": int(len(vals)),
                "unique_values": safe_vals,
            })
        return {"summary": summary}
    except S3Error as e:
        if getattr(e, "code", "") == "NoSuchKey":
            raise HTTPException(status_code=404, detail="File not found")
        raise HTTPException(status_code=500, detail=str(e))
    except Exception as e:
        raise HTTPException(status_code=400, detail=str(e))


@router.get("/cached_dataframe")
async def cached_dataframe(object_name: str):
    """Return the raw CSV bytes for a saved dataframe from Redis."""
    try:
        content = redis_client.get(object_name)
        if content is None:
            response = minio_client.get_object(MINIO_BUCKET, object_name)
            content = response.read()
            redis_client.setex(object_name, 3600, content)
        return Response(content, media_type="text/csv")
    except S3Error as e:
        if getattr(e, "code", "") == "NoSuchKey":
            raise HTTPException(status_code=404, detail="File not found")
        raise HTTPException(status_code=500, detail=str(e))
    except Exception as e:
        raise HTTPException(status_code=400, detail=str(e))


@router.get("/sku_stats")
async def sku_stats(object_name: str, y_column: str, combination: str):
    """Return time series and summary for a specific SKU combination."""
    try:
        combo = json.loads(combination)
    except Exception as e:
        raise HTTPException(status_code=400, detail=f"Invalid combination: {e}")

    try:
        content = redis_client.get(object_name)
        if content is None:
            response = minio_client.get_object(MINIO_BUCKET, object_name)
            content = response.read()
            redis_client.setex(object_name, 3600, content)

        if object_name.endswith(".csv"):
            df = pd.read_csv(io.BytesIO(content))
        elif object_name.endswith((".xls", ".xlsx")):
            df = pd.read_excel(io.BytesIO(content))
        else:
            raise ValueError("Unsupported file format")

        df.columns = df.columns.str.lower()
        y_col = y_column.lower()
        if y_col not in df.columns:
            raise ValueError("y_column not found")

        date_cols = [c for c in df.columns if "date" in c or "time" in c]
        if not date_cols:
            raise ValueError("no date column found")
        date_col = date_cols[0]

        mask = pd.Series(True, index=df.index)
        for k, v in combo.items():
            col = k.lower()
            if col in df.columns:
                mask &= df[col] == v

        sub = df.loc[mask, [date_col, y_col]].dropna()
        sub[date_col] = pd.to_datetime(sub[date_col], errors="coerce")
        sub = sub.dropna(subset=[date_col]).sort_values(date_col)

        series = [
            {"date": str(d.date() if hasattr(d, "date") else d), "value": float(val)}
            for d, val in zip(sub[date_col], sub[y_col])
        ]
        summary = {
            "avg": float(sub[y_col].mean()) if not sub.empty else 0,
            "min": float(sub[y_col].min()) if not sub.empty else 0,
            "max": float(sub[y_col].max()) if not sub.empty else 0,
        }
        return {"timeseries": series, "summary": summary}
    except S3Error as e:
        if getattr(e, "code", "") == "NoSuchKey":
            raise HTTPException(status_code=404, detail="File not found")
        raise HTTPException(status_code=500, detail=str(e))
    except Exception as e:
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
