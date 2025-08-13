from fastapi import APIRouter, Form, HTTPException, Query, Response
from typing import Dict, List, Any
from .deps import get_minio_df, get_validator_atoms_collection, fetch_dimensions_dict, get_column_classifications_collection, fetch_measures_list, fetch_identifiers_and_measures, minio_client, MINIO_BUCKET
from app.features.data_upload_validate.app.routes import get_object_prefix
from .mongodb_saver import save_groupby_result
import io
import json
import pandas as pd
from .groupby.base import perform_groupby as groupby_base_func
import datetime
from urllib.parse import unquote

router = APIRouter()

@router.get("/identifier_options")
async def identifier_options(
    client_name: str = Query(..., description="Client name"),
    app_name: str = Query(..., description="App name"),
    project_name: str = Query(..., description="Project name"),
):
    """Return identifier column names using Redis ▶ Mongo ▶ fallback logic.

    1. Attempt to read JSON config from Redis key
       `<client>/<app>/<project>/column_classifier_config`.
    2. If missing, fetch from Mongo (`classifier_configs` collection).
       Cache the document back into Redis.
    3. If still unavailable, return empty list – the frontend will
       fall back to its existing column_summary extraction flow.
    """
    key = f"{client_name}/{app_name}/{project_name}/column_classifier_config"
    cfg: dict[str, Any] | None = None

    # --- Redis lookup -------------------------------------------------------
    try:
        from .deps import redis_client
        cached = redis_client.get(key)
        if cached:
            cfg = json.loads(cached)
    except Exception as exc:
        print(f"⚠️ Redis read error for {key}: {exc}")

    # --- Mongo fallback ------------------------------------------------------
    if cfg is None:
        try:
            from app.features.column_classifier.database import get_classifier_config_from_mongo
            cfg = get_classifier_config_from_mongo(client_name, app_name, project_name)
            if cfg and redis_client:
                try:
                    redis_client.setex(key, 3600, json.dumps(cfg, default=str))
                except Exception as exc:
                    print(f"⚠️ Redis write error for {key}: {exc}")
        except Exception as exc:
            print(f"⚠️ Mongo classifier config lookup failed: {exc}")

    identifiers: list[str] = []
    if cfg and isinstance(cfg.get("identifiers"), list):
        identifiers = cfg["identifiers"]

    return {"identifiers": identifiers}


# ----------- Export Endpoints (CSV / Excel) -----------
@router.get("/export_csv")
async def export_csv(object_name: str):
    """Export the grouped result as CSV file."""
    object_name = unquote(object_name)
    try:
        # Get the object directly with the provided name
        response = minio_client.get_object(MINIO_BUCKET, object_name)
        content = response.read()

        # Convert Arrow or Excel to CSV if needed
        if object_name.endswith(".arrow"):
            import pyarrow as pa, pyarrow.ipc as ipc, io, pandas as pd
            reader = ipc.RecordBatchFileReader(pa.BufferReader(content))
            df = reader.read_all().to_pandas()
            content = df.to_csv(index=False).encode("utf-8")
        elif object_name.endswith(".xlsx"):
            import io, pandas as pd
            df = pd.read_excel(io.BytesIO(content))
            content = df.to_csv(index=False).encode("utf-8")
        # else assume content already CSV bytes

        return Response(
            content=content,
            media_type="text/csv",
            headers={
                "Content-Disposition": f"attachment; filename=groupby_result_{object_name.split('/')[-1].replace('.arrow','').replace('.xlsx','')} .csv"
            },
        )
    except Exception as e:
        raise HTTPException(status_code=404, detail=f"Export failed: {e}")

@router.get("/export_excel")
async def export_excel(object_name: str):
    """Export the grouped result as Excel file."""
    object_name = unquote(object_name)
    try:
        # Fetch from MinIO with the exact path
        response = minio_client.get_object(MINIO_BUCKET, object_name)
        content = response.read()

        import io, pandas as pd
        if object_name.endswith(".arrow"):
            import pyarrow as pa, pyarrow.ipc as ipc
            reader = ipc.RecordBatchFileReader(pa.BufferReader(content))
            df = reader.read_all().to_pandas()
        elif object_name.endswith(".csv"):
            df = pd.read_csv(io.BytesIO(content))
        else:
            df = pd.read_excel(io.BytesIO(content))

        excel_buffer = io.BytesIO()
        try:
            df.to_excel(excel_buffer, index=False, engine="openpyxl")
        except Exception:
            df.to_excel(excel_buffer, index=False)
        excel_bytes = excel_buffer.getvalue()

        return Response(
            content=excel_bytes,
            media_type="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
            headers={
                "Content-Disposition": f"attachment; filename=groupby_result_{object_name.split('/')[-1].replace('.arrow','').replace('.csv','')}.xlsx"
            }
        )
    except Exception as e:
        raise HTTPException(status_code=404, detail=f"Export failed: {e}")
# async def export_excel(object_name: str):
#     """Export the grouped result as Excel file."""
#     object_name = unquote(object_name)
#     try:
#         # Try direct key first, fallback with prefix
#         try:
#             response = minio_client.get_object(MINIO_BUCKET, object_name)
#         except Exception:
#             prefixed = OBJECT_PREFIX + object_name if not object_name.startswith(OBJECT_PREFIX) else object_name[len(OBJECT_PREFIX):]
#             response = minio_client.get_object(MINIO_BUCKET, prefixed)
#         content = response.read()

#         import io, pandas as pd
#         if object_name.endswith(".arrow"):
#             import pyarrow as pa, pyarrow.ipc as ipc
#             reader = ipc.RecordBatchFileReader(pa.BufferReader(content))
#             df = reader.read_all().to_pandas()
#         elif object_name.endswith(".csv"):
#             df = pd.read_csv(io.BytesIO(content))
#         else:  # already excel
#             df = pd.read_excel(io.BytesIO(content))

#         excel_buffer = io.BytesIO()
#         try:
#             df.to_excel(excel_buffer, index=False, engine="openpyxl")
#         except Exception as e:
#             df.to_excel(excel_buffer, index=False, engine="xlsxwriter")
#         excel_bytes = excel_buffer.getvalue()

#         return Response(
#             content=excel_bytes,
#             media_type="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
#             headers={
#                 "Content-Disposition": f"attachment; filename=groupby_result_{object_name.split('/')[-1].replace('.arrow','').replace('.csv','')}.xlsx"
#             }
#         )
#     except Exception as e:
#         raise HTTPException(status_code=404, detail=f"Export failed: {e}")

def clean_columns(df):
    df.columns = [col.strip().lower() for col in df.columns]
    return df

@router.post("/init")
async def get_dimensions_and_measures(
    bucket_name: str = Form(...),
    object_names: str = Form(...),
    client_name: str = Form(..., description="Client name"),
    app_name: str = Form(..., description="App name"),
    project_name: str = Form(..., description="Project name"),
    file_key: str = Form(...)
) -> Dict:
    try:
        df = get_minio_df(bucket_name, object_names)
        df = clean_columns(df)
        
        # Get identifiers using the new approach (like scope_selector)
        key = f"{client_name}/{app_name}/{project_name}/column_classifier_config"
        cfg: dict[str, Any] | None = None
        
        # Try Redis first
        try:
            from .deps import redis_client
            cached = redis_client.get(key)
            if cached:
                cfg = json.loads(cached)
        except Exception as exc:
            print(f"⚠️ Redis read error for {key}: {exc}")
        
        # Try MongoDB if Redis failed
        if cfg is None:
            try:
                from app.features.column_classifier.database import get_classifier_config_from_mongo
                cfg = get_classifier_config_from_mongo(client_name, app_name, project_name)
                if cfg and redis_client:
                    try:
                        redis_client.setex(key, 3600, json.dumps(cfg, default=str))
                    except Exception as exc:
                        print(f"⚠️ Redis write error for {key}: {exc}")
            except Exception as exc:
                print(f"⚠️ Mongo classifier config lookup failed: {exc}")
        
        identifiers: list[str] = []
        measures: list[str] = []
        if cfg:
            identifiers = cfg.get("identifiers", [])
            measures = cfg.get("measures", [])
        
        # Filter out time-related identifiers
        # time_keywords = {"date", "time", "month", "months", "week", "weeks", "year"}
        # identifiers = [i for i in identifiers if i and i.lower() not in time_keywords]
        
        # For now, skip dimensions since they require validator_atom_id
        # We can add a separate endpoint for dimensions if needed
        dimensions = {}
        
        numeric_measures = df.select_dtypes(include='number').columns.tolist()
        time_col_found = 'date' if 'date' in df.columns else None
        return {
            "status": "SUCCESS",
            "dimensions_from_db": dimensions,
            "identifiers": identifiers,
            "measures": measures,
            "numeric_measures": numeric_measures,
            "time_column_used": time_col_found,
        }
    except Exception as e:
        return {"status": "FAILURE", "error": str(e)}

@router.post("/run")
async def perform_groupby_route(
    validator_atom_id: str = Form(...),
    file_key: str = Form(...),
    bucket_name: str = Form(...),
    object_names: str = Form(...),
    identifiers: str = Form(...),
    aggregations: str = Form(...),
):
    try:
        identifiers = json.loads(identifiers) if isinstance(identifiers, str) else identifiers
        aggregations = json.loads(aggregations) if isinstance(aggregations, str) else aggregations
        df = get_minio_df(bucket=bucket_name, file_key=object_names)
        df = clean_columns(df)
        grouped = groupby_base_func(df, identifiers, aggregations)
        await save_groupby_result(validator_atom_id, file_key, grouped)
        timestamp = datetime.datetime.now().strftime("%Y%m%d_%H%M%S")
        new_filename = f"{validator_atom_id}_{file_key}_grouped.csv"
        csv_bytes = grouped.to_csv(index=False).encode("utf-8")
        minio_client.put_object(
            bucket_name=bucket_name,
            object_name=new_filename,
            data=io.BytesIO(csv_bytes),
            length=len(csv_bytes),
            content_type="text/csv"
        )
        return {
            "status": "SUCCESS",
            "message": "GroupBy complete",
            "result_file": new_filename,
            "row_count": len(grouped),
            "columns": list(grouped.columns)
        }
    except Exception as e:
        return {"status": "FAILURE", "error": str(e)}

import uuid
from fastapi import Body

@router.post("/save")
async def save_groupby_dataframe(
    csv_data: str = Body(..., embed=True),
    filename: str = Body(..., embed=True)
):
    """Save grouped DataFrame CSV to MinIO bucket and return saved filename"""
    try:
        if not filename:
            gid = str(uuid.uuid4())[:8]
            filename = f"groupby_{gid}.csv"
        if not filename.endswith('.csv'):
            filename += '.csv'
        # Ensure no path traversal
        filename = filename.replace('..', '')
        import pyarrow as pa, pyarrow.ipc as ipc
        import pandas as pd, io
        df = pd.read_csv(io.StringIO(csv_data))
        if not filename.endswith('.arrow'):
            filename = filename.replace('.csv','') + '.arrow'
        # Get consistent object prefix and construct full path
        prefix = await get_object_prefix()
        filename = f"{prefix}groupby-data/{filename}"
        table = pa.Table.from_pandas(df)
        sink = pa.BufferOutputStream()
        with ipc.new_file(sink, table.schema) as writer:
            writer.write_table(table)
        arrow_bytes = sink.getvalue().to_pybytes()
        minio_client.put_object(
            MINIO_BUCKET,
            filename,
            data=io.BytesIO(arrow_bytes),
            length=len(arrow_bytes),
            content_type="application/octet-stream"
        )
        return {"status": "SUCCESS", "result_file": filename}
    except Exception as e:
        raise HTTPException(status_code=400, detail=f"Save failed: {str(e)}")

@router.get("/results")
async def get_latest_groupby_result_from_minio(
    validator_atom_id: str = Query(...),
    file_key: str = Query(...),
    bucket_name: str = Query(...),
):
    try:
        key = f"{validator_atom_id}_{file_key}_grouped.csv"
        group_obj = minio_client.get_object(bucket_name, key)
        grouped_df = pd.read_csv(io.BytesIO(group_obj.read()))
        return {
            "status": "SUCCESS",
            "row_count": len(grouped_df),
            "merged_data": grouped_df.to_dict(orient="records")
        }
    except Exception as e:
        raise HTTPException(status_code=404, detail=f"Unable to fetch merged data: {str(e)}")

