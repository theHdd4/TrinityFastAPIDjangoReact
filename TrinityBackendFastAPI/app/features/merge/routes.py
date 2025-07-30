# app/routes.py

from fastapi import APIRouter, Form, HTTPException, Body, Query, Depends
from fastapi.responses import StreamingResponse
import json, io, uuid, datetime, os
import pandas as pd
import pyarrow as pa
import pyarrow.ipc as ipc
import numpy as np
from ..data_upload_validate.app.routes import get_object_prefix
from .merge.base import get_common_columns, merge_dataframes
from .deps import get_minio_df, minio_client, MINIO_BUCKET, redis_client

router = APIRouter()

@router.post("/init")
async def init_merge(
    file1: str = Form(...),
    file2: str = Form(...),
    bucket_name: str = Form(...)
):
    try:
        df1 = get_minio_df(bucket_name, file1)
        df2 = get_minio_df(bucket_name, file2)

        df1.columns = df1.columns.str.strip().str.lower()
        df2.columns = df2.columns.str.strip().str.lower()

        # Clean string values (strip spaces and make lowercase)
        df1 = df1.applymap(lambda x: x.strip().lower() if isinstance(x, str) else x)
        df2 = df2.applymap(lambda x: x.strip().lower() if isinstance(x, str) else x)
        common_cols = get_common_columns(df1, df2)


        return {
            "common_columns": common_cols,
            "join_methods": ["inner", "outer", "left", "right"],
            "fillna_method":["mean", "median", "mode", "ffill", "bfill", "value"]
        }
    except Exception as e:
        raise HTTPException(status_code=400, detail=f"Init failed: {str(e)}")


import io
from pandas import DataFrame
from io import BytesIO
# latest_merged_data: DataFrame | None = None

# @router.post("/perform")
# async def perform_merge(
#     file1: str = Form(...),
#     file2: str = Form(...),
#     bucket_name: str = Form(...),
#     join_columns: str = Form(...),    
#     join_type: str = Form(...),          
#     merge_id: str = Form(...)
# ):
#     # global latest_merged_data 
#     try:
#         # Read CSVs from MinIO
#         df1 = get_minio_df(bucket_name, file1)
#         df2 = get_minio_df(bucket_name, file2)

#         df1.columns = df1.columns.str.strip().str.lower()
#         df2.columns = df2.columns.str.strip().str.lower()

#         join_cols = json.loads(join_columns)  

#         # Merge the dataframes
#         merged_df = merge_dataframes(df1, df2, join_cols, join_type)

#         # Detect columns with _x or _y suffixes
#         suffix_columns = [col for col in merged_df.columns if col.endswith('_x') or col.endswith('_y')]


#         # Merge the dataframes
#         merged_df = merge_dataframes(df1, df2, join_cols, join_type)

#         # ── NEW: save merged_df back to MinIO ──────────────────────────────
#         merged_key = f"{merge_id}_merged.csv"          # pick any naming rule you like
#         csv_bytes  = merged_df.to_csv(index=False).encode("utf-8")

#         # assuming you already have a MinIO client called `minio_client`
#         minio_client.put_object(
#             bucket_name=bucket_name,
#             object_name=merged_key,
#             data=io.BytesIO(csv_bytes),
#             length=len(csv_bytes),
#             content_type="text/csv"
#         )

        

#         # Build response message
#         response = {
#             "message": "Merge successful",
#             "row_count": len(merged_df),
#             "merged_object": merged_key
#         }

#         if suffix_columns:
#             response["note"] = f"Some overlapping columns were renamed: {suffix_columns}"

#         return response

#     except Exception as e:
#         raise HTTPException(status_code=400, detail=f"Merge failed: {str(e)}")


import uuid
import datetime

@router.post("/perform")
async def perform_merge(
    file1: str = Form(...),
    file2: str = Form(...),
    bucket_name: str = Form(...),
    join_columns: str = Form(...),    
    join_type: str = Form(...),          
):
    try:
        df1 = get_minio_df(bucket_name, file1)
        df2 = get_minio_df(bucket_name, file2)
        df1.columns = df1.columns.str.strip().str.lower()
        df2.columns = df2.columns.str.strip().str.lower()

        # Clean string values (strip spaces and make lowercase)
        df1 = df1.applymap(lambda x: x.strip().lower() if isinstance(x, str) else x)
        df2 = df2.applymap(lambda x: x.strip().lower() if isinstance(x, str) else x)

        join_cols = json.loads(join_columns)
        merged_df = merge_dataframes(df1, df2, join_cols, join_type)
        suffix_columns = [c for c in merged_df.columns if c.endswith("_x") or c.endswith("_y")]
        # Return CSV as string (do NOT save)
        csv_text = merged_df.to_csv(index=False)
        return {
            "data": csv_text,
            "row_count": len(merged_df),
            "columns": list(merged_df.columns),
            "note": f"Some overlapping columns were renamed: {suffix_columns}" if suffix_columns else None
        }
    except Exception as e:
        raise HTTPException(status_code=400, detail=f"Merge failed: {str(e)}")

@router.post("/save")
async def save_merged_dataframe(
    csv_data: str = Body(..., embed=True),
    filename: str = Body(..., embed=True)
):
    try:
        df = pd.read_csv(io.StringIO(csv_data))
        if not filename:
            merge_id = str(uuid.uuid4())[:8]
            filename = f"{merge_id}_merge.arrow"
        if not filename.endswith('.arrow'):
            filename += '.arrow'
            
        # Get the standard prefix using get_object_prefix
        prefix = await get_object_prefix()
        # Create full path with standard structure
        full_path = f"{prefix}merged-data/{filename}"
        
        # Convert to Arrow format
        table = pa.Table.from_pandas(df)
        arrow_buffer = pa.BufferOutputStream()
        with ipc.new_file(arrow_buffer, table.schema) as writer:
            writer.write_table(table)
        arrow_bytes = arrow_buffer.getvalue().to_pybytes()
        
        # Upload to MinIO
        minio_client.put_object(
            MINIO_BUCKET,
            full_path,
            data=io.BytesIO(arrow_bytes),
            length=len(arrow_bytes),
            content_type="application/octet-stream",
        )
        
        # Cache in Redis
        redis_client.setex(full_path, 3600, arrow_bytes)
        
        return {
            "result_file": full_path,
            "shape": df.shape,
            "columns": list(df.columns),
            "message": "DataFrame saved successfully"
        }
    except Exception as e:
        print(f"⚠️ save_merged_dataframe error: {e}")
        raise HTTPException(status_code=400, detail=str(e))

@router.get("/cached_dataframe")
async def cached_dataframe(
    object_name: str,
    page: int = Query(1, ge=1, description="Page number (1-based)"),
    page_size: int = Query(50, ge=1, le=1000, description="Number of rows per page")
):
    object_name = object_name
    try:
        content = redis_client.get(object_name)
        if content is None:
            response = minio_client.get_object(MINIO_BUCKET, object_name)
            content = response.read()
            redis_client.setex(object_name, 3600, content)
        if object_name.endswith(".arrow"):
            reader = ipc.RecordBatchFileReader(pa.BufferReader(content))
            df = reader.read_all().to_pandas()
            total_rows = len(df)
            start_idx = (page - 1) * page_size
            end_idx = start_idx + page_size
            df_subset = df.iloc[start_idx:end_idx]
            csv_text = df_subset.to_csv(index=False)
            return {
                "data": csv_text,
                "pagination": {
                    "current_page": page,
                    "page_size": page_size,
                    "total_rows": total_rows,
                    "total_pages": (total_rows + page_size - 1) // page_size,
                    "start_row": start_idx + 1,
                    "end_row": min(end_idx, total_rows)
                }
            }
        text = content.decode()
        df = pd.read_csv(io.StringIO(text))
        total_rows = len(df)
        start_idx = (page - 1) * page_size
        end_idx = start_idx + page_size
        df_subset = df.iloc[start_idx:end_idx]
        csv_text = df_subset.to_csv(index=False)
        return {
            "data": csv_text,
            "pagination": {
                "current_page": page,
                "page_size": page_size,
                "total_rows": total_rows,
                "total_pages": (total_rows + page_size - 1) // page_size,
                "start_row": start_idx + 1,
                "end_row": min(end_idx, total_rows)
            }
        }
    except Exception as e:
        raise HTTPException(status_code=400, detail=str(e))

@router.get("/export_csv")
async def export_csv(object_name: str):
    try:
        content = redis_client.get(object_name)
        if content is None:
            response = minio_client.get_object(MINIO_BUCKET, object_name)
            content = response.read()
            redis_client.setex(object_name, 3600, content)
        if object_name.endswith(".arrow"):
            reader = ipc.RecordBatchFileReader(pa.BufferReader(content))
            df = reader.read_all().to_pandas()
        else:
            df = pd.read_csv(io.BytesIO(content))
        csv_buffer = io.StringIO()
        df.to_csv(csv_buffer, index=False)
        csv_content = csv_buffer.getvalue()
        return StreamingResponse(
            io.BytesIO(csv_content.encode('utf-8')),
            media_type="text/csv",
            headers={
                "Content-Disposition": f"attachment; filename=merge_result_{datetime.datetime.now().strftime('%Y%m%d_%H%M%S')}.csv"
            }
        )
    except Exception as e:
        raise HTTPException(status_code=400, detail=str(e))

@router.get("/export_excel")
async def export_excel(object_name: str):
    try:
        content = redis_client.get(object_name)
        if content is None:
            response = minio_client.get_object(MINIO_BUCKET, object_name)
            content = response.read()
            redis_client.setex(object_name, 3600, content)
        if object_name.endswith(".arrow"):
            reader = ipc.RecordBatchFileReader(pa.BufferReader(content))
            df = reader.read_all().to_pandas()
        else:
            df = pd.read_csv(io.BytesIO(content))
        excel_buffer = io.BytesIO()
        with pd.ExcelWriter(excel_buffer, engine='openpyxl') as writer:
            df.to_excel(writer, sheet_name='Merged Data', index=False)
        excel_buffer.seek(0)
        excel_content = excel_buffer.getvalue()
        return StreamingResponse(
            io.BytesIO(excel_content),
            media_type="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
            headers={
                "Content-Disposition": f"attachment; filename=merge_result_{datetime.datetime.now().strftime('%Y%m%d_%H%M%S')}.xlsx"
            }
        )
    except Exception as e:
        raise HTTPException(status_code=400, detail=str(e))




from fastapi import Query
import io, pandas as pd, numpy as np

import pandas as pd
@router.get("/results")
async def get_merged_data(
    merge_id: str = Query(...),      # 👈 USE Query, not Form
    bucket_name: str = Query(...)
):
    try:
        merged_key = f"{merge_id}_merge.arrow"

        merged_obj = minio_client.get_object(bucket_name, merged_key)
        data = merged_obj.read()
        reader = ipc.RecordBatchFileReader(pa.BufferReader(data))
        merged_df = reader.read_all().to_pandas()

        clean_df = merged_df.replace({np.nan: None, np.inf: None, -np.inf: None})

        return {
            "row_count": len(merged_df),
            "merged_data": clean_df.to_dict(orient="records")
        }

    except Exception as e:
        raise HTTPException(status_code=404, detail=f"Unable to fetch merged data: {str(e)}")
 