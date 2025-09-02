from fastapi import APIRouter, Form, HTTPException, Query, Response, Body
from typing import Dict, List
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

@router.get("/")
async def root():
    """Root endpoint for groupby backend."""
    return {"message": "GroupBy backend is running", "endpoints": ["/ping", "/init", "/run", "/export_csv", "/export_excel", "/cached_dataframe", "/column_summary", "/save"]}

@router.get("/ping")
async def ping():
    """Health check endpoint for groupby backend."""
    return {"msg": "GroupBy backend is alive"}

@router.get("/column_summary")
async def column_summary(object_name: str):
    """Return column summary statistics for a saved dataframe."""
    object_name = unquote(object_name)
    print(f"➡️ groupby column_summary request: {object_name}")
    
    try:
        # Try to get from Redis first
        content = redis_client.get(object_name)
        if content is None:
            # Get from MinIO
            response = minio_client.get_object(MINIO_BUCKET, object_name)
            content = response.read()
            redis_client.setex(object_name, 3600, content)

        # Parse the content based on file type
        if object_name.endswith(".arrow"):
            import pyarrow as pa, pyarrow.ipc as ipc
            reader = ipc.RecordBatchFileReader(pa.BufferReader(content))
            df = reader.read_all().to_pandas()
        else:
            df = pd.read_csv(io.BytesIO(content))

        df.columns = df.columns.str.lower()
        summary = []
        for col in df.columns:
            column_series = df[col].dropna()
            try:
                vals = column_series.unique()
            except TypeError:
                vals = column_series.astype(str).unique()

            def _serialize(v):
                if isinstance(v, (pd.Timestamp, pd.Timestamp)):
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
    except Exception as e:
        print(f"⚠️ groupby column_summary error for {object_name}: {e}")
        raise HTTPException(status_code=400, detail=str(e))

@router.get("/cached_dataframe")
async def cached_dataframe(
    object_name: str,
    page: int = Query(1, ge=1, description="Page number (1-based)"),
    page_size: int = Query(50, ge=1, le=1000, description="Number of rows per page")
):
    """Return the saved dataframe as CSV text from Redis or MinIO with pagination."""
    object_name = unquote(object_name)
    print(f"➡️ groupby cached_dataframe request: {object_name}, page={page}, page_size={page_size}")
    
    try:
        # Try to get from Redis first
        content = redis_client.get(object_name)
        if content is None:
            # Get from MinIO
            response = minio_client.get_object(MINIO_BUCKET, object_name)
            content = response.read()
            redis_client.setex(object_name, 3600, content)

        # Parse the content based on file type
        if object_name.endswith(".arrow"):
            import pyarrow as pa, pyarrow.ipc as ipc
            reader = ipc.RecordBatchFileReader(pa.BufferReader(content))
            df = reader.read_all().to_pandas()
        else:
            df = pd.read_csv(io.BytesIO(content))

        # Calculate pagination
        total_rows = len(df)
        start_idx = (page - 1) * page_size
        end_idx = start_idx + page_size
        
        # Slice the dataframe
        df_page = df.iloc[start_idx:end_idx]
        
        # Convert to CSV
        csv_data = df_page.to_csv(index=False)
        
        pagination = {
            "current_page": page,
            "page_size": page_size,
            "total_rows": total_rows,
            "total_pages": (total_rows + page_size - 1) // page_size,
            "start_row": start_idx + 1,
            "end_row": min(end_idx, total_rows)
        }
        
        return {
            "data": csv_data,
            "pagination": pagination
        }
    except Exception as e:
        print(f"⚠️ groupby cached_dataframe error for {object_name}: {e}")
        raise HTTPException(status_code=400, detail=str(e))

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
        
        # 🔧 CRITICAL FIX: Resolve the full MinIO object path
        from app.features.data_upload_validate.app.routes import get_object_prefix
        
        # Get the current object prefix
        prefix = await get_object_prefix()
        
        # Construct the full object path
        full_object_path = f"{prefix}{object_names}" if not object_names.startswith(prefix) else object_names
        
        print(f"🔍 GroupBy file path resolution:")
        print(f"  Original object_names: {object_names}")
        print(f"  Current prefix: {prefix}")
        print(f"  Full object path: {full_object_path}")
        
        # Use the full path to load the dataframe
        df = get_minio_df(bucket=bucket_name, file_key=full_object_path)
        df = clean_columns(df)
        
        print(f"✅ Successfully loaded dataframe with shape: {df.shape}")
        print(f"  Columns: {list(df.columns)}")
        print(f"  Identifiers: {identifiers}")
        print(f"  Aggregations: {aggregations}")
        
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
        
        # 🔧 CRITICAL FIX: Return the actual grouped data for immediate frontend display
        # Convert grouped DataFrame to list of dictionaries for JSON serialization
        grouped_data = grouped.reset_index().to_dict('records')
        
        return {
            "status": "SUCCESS",
            "message": "GroupBy complete",
            "result_file": new_filename,
            "row_count": len(grouped),
            "columns": list(grouped.columns),
            "results": grouped_data  # 🔧 Add the actual grouped results
        }
    except Exception as e:
        print(f"❌ GroupBy operation failed: {e}")
        import traceback
        traceback.print_exc()
        return {"status": "FAILURE", "error": str(e)}

@router.post("/save")
async def save_groupby_dataframe(
    csv_data: str = Body(..., embed=True),
    filename: str = Body(..., embed=True)
):
    """Save grouped DataFrame CSV to MinIO bucket and return saved filename"""
    import uuid
    try:
        if not filename:
            gid = str(uuid.uuid4())[:8]
            filename = f"groupby_{gid}.csv"
        
        # Convert CSV string to bytes
        csv_bytes = csv_data.encode("utf-8")
        
        # Save to MinIO
        minio_client.put_object(
            bucket_name=MINIO_BUCKET,
            object_name=filename,
            data=io.BytesIO(csv_bytes),
            length=len(csv_bytes),
            content_type="text/csv"
        )
        
        return {
            "status": "SUCCESS",
            "message": "DataFrame saved successfully",
            "filename": filename,
            "size_bytes": len(csv_bytes)
        }
    except Exception as e:
        print(f"⚠️ groupby save error: {e}")
        raise HTTPException(status_code=500, detail=f"Save failed: {str(e)}")

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

