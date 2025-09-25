# app/routes.py

from fastapi import APIRouter, Form, HTTPException, Body, Query, Depends
from fastapi.responses import StreamingResponse
import json, io, uuid, datetime, os
import pandas as pd
import pyarrow as pa
import pyarrow.ipc as ipc
import numpy as np
from minio.error import S3Error
from ..data_upload_validate.app.routes import get_object_prefix
from .merge.base import get_common_columns, merge_dataframes
from .deps import get_minio_df, get_minio_content_with_flight_fallback, minio_client, MINIO_BUCKET, redis_client

router = APIRouter()

@router.post("/init")
async def init_merge(
    file1: str = Form(...),
    file2: str = Form(...),
    bucket_name: str = Form(...)
):
    try:
        # Get the current object prefix for proper path resolution
        prefix = await get_object_prefix()
        
        # Construct full object paths
        full_path1 = f"{prefix}{file1}" if not file1.startswith(prefix) else file1
        full_path2 = f"{prefix}{file2}" if not file2.startswith(prefix) else file2
        
        print(f"🔍 MERGE INIT - Path resolution:")
        print(f"   Original file1: {file1}")
        print(f"   Original file2: {file2}")
        print(f"   Current prefix: {prefix}")
        print(f"   Full path1: {full_path1}")
        print(f"   Full path2: {full_path2}")
        
        # Load dataframes using direct MinIO access (same as perform endpoint)
        print(f"📁 Loading dataframe 1 for init: {full_path1}")
        try:
            response1 = minio_client.get_object(bucket_name, full_path1)
            content1 = response1.read()
            if full_path1.endswith(".csv"):
                df1 = pd.read_csv(io.BytesIO(content1))
            elif full_path1.endswith(".xlsx"):
                df1 = pd.read_excel(io.BytesIO(content1))
            elif full_path1.endswith(".arrow"):
                reader1 = ipc.RecordBatchFileReader(pa.BufferReader(content1))
                df1 = reader1.read_all().to_pandas()
            else:
                raise ValueError("Unsupported file type for file1")
        except Exception as e:
            raise RuntimeError(f"Failed to fetch file1 from MinIO: {e}")
            
        print(f"📁 Loading dataframe 2 for init: {full_path2}")
        try:
            response2 = minio_client.get_object(bucket_name, full_path2)
            content2 = response2.read()
            if full_path2.endswith(".csv"):
                df2 = pd.read_csv(io.BytesIO(content2))
            elif full_path2.endswith(".xlsx"):
                df2 = pd.read_excel(io.BytesIO(content2))
            elif full_path2.endswith(".arrow"):
                reader2 = ipc.RecordBatchFileReader(pa.BufferReader(content2))
                df2 = reader2.read_all().to_pandas()
            else:
                raise ValueError("Unsupported file type for file2")
        except Exception as e:
            raise RuntimeError(f"Failed to fetch file2 from MinIO: {e}")

        df1.columns = df1.columns.str.strip().str.lower()
        df2.columns = df2.columns.str.strip().str.lower()

        # Clean string values (strip spaces and make lowercase)
        df1 = df1.applymap(lambda x: x.strip().lower() if isinstance(x, str) else x)
        df2 = df2.applymap(lambda x: x.strip().lower() if isinstance(x, str) else x)
        common_cols = get_common_columns(df1, df2)

        print(f"✅ MERGE INIT - Found {len(common_cols)} common columns: {common_cols}")

        return {
            "common_columns": common_cols,
            "join_methods": ["inner", "outer", "left", "right"],
            "fillna_method":["mean", "median", "mode", "ffill", "bfill", "value"]
        }
    except Exception as e:
        print(f"❌ MERGE INIT - Error: {e}")
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
        print(f"🔍 MERGE PERFORM - Received data:")
        print(f"   file1: {file1}")
        print(f"   file2: {file2}")
        print(f"   bucket_name: {bucket_name}")
        print(f"   join_columns: {join_columns}")
        print(f"   join_type: {join_type}")
        
        # Validate inputs
        if not file1 or not file2:
            raise ValueError("file1 and file2 are required")
        
        if not join_columns:
            raise ValueError("join_columns is required")
        
        # Parse join_columns JSON
        try:
            join_cols = json.loads(join_columns)
            print(f"✅ Parsed join_columns: {join_cols}")
        except json.JSONDecodeError as e:
            print(f"❌ JSON decode error for join_columns: {e}")
            print(f"   Raw join_columns: {join_columns}")
            raise ValueError(f"Invalid join_columns JSON: {e}")
        
        # Get the current object prefix for proper path resolution
        prefix = await get_object_prefix()
        
        # Construct full object paths
        full_path1 = f"{prefix}{file1}" if not file1.startswith(prefix) else file1
        full_path2 = f"{prefix}{file2}" if not file2.startswith(prefix) else file2
        
        print(f"🔍 MERGE PERFORM - Path resolution:")
        print(f"   Original file1: {file1}")
        print(f"   Original file2: {file2}")
        print(f"   Current prefix: {prefix}")
        print(f"   Full path1: {full_path1}")
        print(f"   Full path2: {full_path2}")
        
        # Load dataframes using direct MinIO access (same as cardinality endpoint)
        print(f"📁 Loading dataframe 1: {full_path1}")
        try:
            response1 = minio_client.get_object(bucket_name, full_path1)
            content1 = response1.read()
            if full_path1.endswith(".csv"):
                df1 = pd.read_csv(io.BytesIO(content1))
            elif full_path1.endswith(".xlsx"):
                df1 = pd.read_excel(io.BytesIO(content1))
            elif full_path1.endswith(".arrow"):
                reader1 = ipc.RecordBatchFileReader(pa.BufferReader(content1))
                df1 = reader1.read_all().to_pandas()
            else:
                raise ValueError("Unsupported file type for file1")
        except Exception as e:
            raise RuntimeError(f"Failed to fetch file1 from MinIO: {e}")
            
        print(f"📁 Loading dataframe 2: {full_path2}")
        try:
            response2 = minio_client.get_object(bucket_name, full_path2)
            content2 = response2.read()
            if full_path2.endswith(".csv"):
                df2 = pd.read_csv(io.BytesIO(content2))
            elif full_path2.endswith(".xlsx"):
                df2 = pd.read_excel(io.BytesIO(content2))
            elif full_path2.endswith(".arrow"):
                reader2 = ipc.RecordBatchFileReader(pa.BufferReader(content2))
                df2 = reader2.read_all().to_pandas()
            else:
                raise ValueError("Unsupported file type for file2")
        except Exception as e:
            raise RuntimeError(f"Failed to fetch file2 from MinIO: {e}")
        
        print(f"📊 DataFrame shapes: df1={df1.shape}, df2={df2.shape}")
        print(f"📊 DataFrame 1 columns: {list(df1.columns)}")
        print(f"📊 DataFrame 2 columns: {list(df2.columns)}")
        
        # Clean column names - convert to lowercase for consistent matching
        df1.columns = df1.columns.str.strip().str.lower()
        df2.columns = df2.columns.str.strip().str.lower()
        
        # Convert join columns to lowercase for case-insensitive matching
        join_cols_lower = [col.lower() for col in join_cols]
        print(f"🔄 Join columns case conversion:")
        print(f"   Original: {join_cols}")
        print(f"   Lowercase: {join_cols_lower}")
        
        # Verify all join columns exist in both dataframes
        missing_in_df1 = [col for col in join_cols_lower if col not in df1.columns]
        missing_in_df2 = [col for col in join_cols_lower if col not in df2.columns]
        
        if missing_in_df1:
            print(f"❌ Missing columns in df1: {missing_in_df1}")
            print(f"   Available columns in df1: {list(df1.columns)}")
            raise ValueError(f"Join columns not found in first file: {missing_in_df1}")
            
        if missing_in_df2:
            print(f"❌ Missing columns in df2: {missing_in_df2}")
            print(f"   Available columns in df2: {list(df2.columns)}")
            raise ValueError(f"Join columns not found in second file: {missing_in_df2}")
        
        print(f"✅ All join columns found in both dataframes")

        # Clean string values (strip spaces and make lowercase)
        df1 = df1.applymap(lambda x: x.strip().lower() if isinstance(x, str) else x)
        df2 = df2.applymap(lambda x: x.strip().lower() if isinstance(x, str) else x)

        print(f"🔗 Merging with join_columns: {join_cols_lower}, join_type: {join_type}")
        merged_df = merge_dataframes(df1, df2, join_cols_lower, join_type)
        
        print(f"✅ Merge successful! Result shape: {merged_df.shape}")
        
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
        print(f"❌ MERGE PERFORM ERROR: {e}")
        import traceback
        traceback.print_exc()
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
            # Try Arrow Flight first, then fallback to MinIO
            content = get_minio_content_with_flight_fallback(MINIO_BUCKET, object_name)
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
            # Try Arrow Flight first, then fallback to MinIO
            content = get_minio_content_with_flight_fallback(MINIO_BUCKET, object_name)
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
            # Try Arrow Flight first, then fallback to MinIO
            content = get_minio_content_with_flight_fallback(MINIO_BUCKET, object_name)
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


@router.post("/cardinality")
async def get_merge_cardinality_data(
    validator_atom_id: str = Form(...),
    file_key: str = Form(...),
    bucket_name: str = Form(...),
    object_names: str = Form(...),
    source_type: str = Form(...)  # "primary" or "secondary"
):
    """Return cardinality data for columns in the primary or secondary dataset."""
    try:
        # Get the current object prefix
        prefix = await get_object_prefix()
        
        # Construct the full object path
        full_object_path = f"{prefix}{object_names}" if not object_names.startswith(prefix) else object_names
        
        print(f"🔍 Merge Cardinality file path resolution:")
        print(f"  Original object_names: {object_names}")
        print(f"  Current prefix: {prefix}")
        print(f"  Full object path: {full_object_path}")
        print(f"  Source type: {source_type}")
        
        # Load the dataframe using direct MinIO access (like concat)
        try:
            response = minio_client.get_object(bucket_name, full_object_path)
            content = response.read()
            if full_object_path.endswith(".csv"):
                df = pd.read_csv(io.BytesIO(content))
            elif full_object_path.endswith(".xlsx"):
                df = pd.read_excel(io.BytesIO(content))
            elif full_object_path.endswith(".arrow"):
                reader = ipc.RecordBatchFileReader(pa.BufferReader(content))
                df = reader.read_all().to_pandas()
            else:
                raise ValueError("Unsupported file type")
        except Exception as e:
            raise RuntimeError(f"Failed to fetch file from MinIO: {e}")
        df.columns = df.columns.str.strip().str.lower()
        
        print(f"✅ Successfully loaded {source_type} dataframe for cardinality with shape: {df.shape}")
        
        # Generate cardinality data
        cardinality_data = []
        for col in df.columns:
            column_series = df[col].dropna()
            try:
                vals = column_series.unique()
            except TypeError:
                vals = column_series.astype(str).unique()

            def _serialize(v):
                if isinstance(v, (pd.Timestamp, datetime.datetime, datetime.date)):
                    return pd.to_datetime(v).isoformat()
                return str(v)

            safe_vals = [_serialize(v) for v in vals]
            
            cardinality_data.append({
                "column": col,
                "data_type": str(df[col].dtype),
                "unique_count": int(len(vals)),
                "unique_values": safe_vals,  # All unique values, not just samples
            })
        
        return {
            "status": "SUCCESS",
            "source_type": source_type,
            "cardinality": cardinality_data
        }
        
    except S3Error as e:
        error_code = getattr(e, "code", "")
        if error_code in {"NoSuchKey", "NoSuchBucket"}:
            redis_client.delete(object_names)
            raise HTTPException(status_code=404, detail="File not found")
        raise HTTPException(status_code=500, detail=str(e))
    except Exception as e:
        print(f"❌ Error in Merge cardinality endpoint: {e}")
        raise HTTPException(status_code=400, detail=str(e))
 