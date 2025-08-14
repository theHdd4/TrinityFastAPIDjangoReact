# app/routes.py

from fastapi import APIRouter, Form, HTTPException, Query, File, UploadFile, Body
from fastapi.responses import Response, JSONResponse, StreamingResponse
from urllib.parse import unquote
from typing import List
import pandas as pd
import io
import pyarrow as pa
import pyarrow.ipc as ipc
from minio.error import S3Error
import uuid
import datetime
from .deps import (
    minio_client, load_dataframe,
    save_concat_result_to_minio, get_concat_results_collection, save_concat_metadata_to_mongo,
    OBJECT_PREFIX, MINIO_BUCKET, redis_client
)

router = APIRouter()

@router.get("/")
async def root():
    """Root endpoint for concat backend."""
    return {"message": "Concat backend is running", "endpoints": ["/ping", "/init", "/perform", "/results", "/column_summary", "/cached_dataframe", "/export_csv", "/export_excel"]}

@router.get("/ping")
async def ping():
    """Health check endpoint for concat backend."""
    return {"msg": "Concat backend is alive"}

@router.get("/column_summary")
async def column_summary(object_name: str):
    """Return column summary statistics for a saved dataframe."""
    object_name = unquote(object_name)
    print(f"➡️ column_summary request: {object_name}")
    if not object_name.startswith(OBJECT_PREFIX):
        print(f"⚠️ column_summary prefix mismatch: {object_name} (expected {OBJECT_PREFIX})")
    try:
        df = load_dataframe(object_name)
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

            safe_vals = [_serialize(v) for v in vals[:10]]
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
async def cached_dataframe(
    object_name: str,
    page: int = Query(1, ge=1, description="Page number (1-based)"),
    page_size: int = Query(50, ge=1, le=1000, description="Number of rows per page")
):
    """Return the saved dataframe as CSV text from Redis or MinIO with pagination."""
    object_name = unquote(object_name)
    print(f"➡️ cached_dataframe request: {object_name}, page={page}, page_size={page_size}")
    if not object_name.startswith(OBJECT_PREFIX):
        print(f"⚠️ cached_dataframe prefix mismatch: {object_name} (expected {OBJECT_PREFIX})")
    try:
        content = redis_client.get(object_name)
        if content is None:
            # Construct the full object path using the prefix if object_name doesn't already include it
            if not object_name.startswith(OBJECT_PREFIX):
                full_object_path = f"{OBJECT_PREFIX}{object_name}"
            else:
                full_object_path = object_name
            response = minio_client.get_object(MINIO_BUCKET, full_object_path)
            content = response.read()
            redis_client.setex(object_name, 3600, content)

        if object_name.endswith(".arrow"):
            reader = ipc.RecordBatchFileReader(pa.BufferReader(content))
            df = reader.read_all().to_pandas()
            
            # Calculate pagination
            total_rows = len(df)
            start_idx = (page - 1) * page_size
            end_idx = start_idx + page_size
            
            # Get the subset of data
            df_subset = df.iloc[start_idx:end_idx]
            
            # Return paginated data with metadata
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

        try:
            text = content.decode()
        except Exception:
            text = content
            
        # For non-Arrow files, parse CSV and paginate
        import pandas as pd
        import io
        
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
    except S3Error as e:
        error_code = getattr(e, "code", "")
        if error_code in {"NoSuchKey", "NoSuchBucket"}:
            redis_client.delete(object_name)
            raise HTTPException(status_code=404, detail="File not found")
        raise HTTPException(status_code=500, detail=str(e))
    except Exception as e:
        print(f"⚠️ cached_dataframe error for {object_name}: {e}")
        raise HTTPException(status_code=400, detail=str(e))

@router.post("/init")
async def init_concat(
    file1: str = Body(...),
    file2: str = Body(...)
):
    """Initialize concat operation by analyzing two files from storage."""
    try:
        # Fetch first file from storage
        if not file1.endswith('.arrow'):
            file1 += '.arrow'
        
        # Fetch second file from storage
        if not file2.endswith('.arrow'):
            file2 += '.arrow'
        
        # Get column info for both files
        col_info = {
            "file1": file1,
            "file2": file2,
            "message": "Files referenced successfully."
        }
        return col_info
    except Exception as e:
        raise HTTPException(status_code=400, detail=f"Failed to process files: {e}")

@router.post("/perform")
async def perform_concat(
    file1: str = Body(...),
    file2: str = Body(...),
    concat_direction: str = Body(...)
):
    print('DEBUG: Received in /perform:', {'file1': file1, 'file2': file2, 'concat_direction': concat_direction})
    if not file1 or not file2 or not concat_direction:
        raise HTTPException(status_code=400, detail=f"file1, file2, and concat_direction are required and must be non-empty. Got: file1={file1!r}, file2={file2!r}, concat_direction={concat_direction!r}")
    try:
        # Ensure files have .arrow extension
        if not file1.endswith('.arrow'):
            file1 += '.arrow'
        if not file2.endswith('.arrow'):
            file2 += '.arrow'
        
        # Read first file from storage
        try:
            df1 = load_dataframe(file1)
        except Exception as e:
            raise HTTPException(status_code=404, detail=f"File1 not found: {file1}")
        
        # Read second file from storage
        try:
            df2 = load_dataframe(file2)
        except Exception as e:
            raise HTTPException(status_code=404, detail=f"File2 not found: {file2}")
        
        # Standardize column names
        df1.columns = df1.columns.str.lower()
        df2.columns = df2.columns.str.lower()

        if concat_direction == "vertical":
            result = pd.concat([df1, df2], axis=0, ignore_index=True)
        elif concat_direction == "horizontal":
            # Handle duplicate column names for horizontal concatenation
            # Add suffixes to distinguish columns from different files
            df1_suffix = df1.copy()
            df2_suffix = df2.copy()
            
            # Get common columns
            common_cols = set(df1.columns) & set(df2.columns)
            
            # Add suffixes to common columns
            if common_cols:
                # Rename columns in df1 with "_file1" suffix
                df1_suffix.columns = [f"{col}_file1" if col in common_cols else col for col in df1.columns]
                # Rename columns in df2 with "_file2" suffix  
                df2_suffix.columns = [f"{col}_file2" if col in common_cols else col for col in df2.columns]
            
            result = pd.concat([df1_suffix, df2_suffix], axis=1)
        else:
            raise ValueError("Invalid concat direction")

        # Generate auto concat ID
        concat_id = str(uuid.uuid4())[:8]  # Shorten UUID for readability
        concat_key = f"{concat_id}_concat.arrow"

        print('Received:', file1, file2, concat_direction)

        # Save as Arrow file instead of CSV
        import pyarrow as pa
        table = pa.Table.from_pandas(result)
        arrow_buffer = pa.BufferOutputStream()
        with pa.ipc.new_file(arrow_buffer, table.schema) as writer:
            writer.write_table(table)
        arrow_bytes = arrow_buffer.getvalue().to_pybytes()
        
        # Save to MinIO
        minio_client.put_object(
            MINIO_BUCKET,
            concat_key,
            data=io.BytesIO(arrow_bytes),
            length=len(arrow_bytes),
            content_type="application/octet-stream",
        )
        # Cache in Redis
        redis_client.setex(concat_key, 3600, arrow_bytes)

        # Save metadata to MongoDB
        collection = get_concat_results_collection()
        await save_concat_metadata_to_mongo(collection, {
            "concat_id": concat_id,
            "file1_name": file1,
            "file2_name": file2,
            "direction": concat_direction,
            "columns": list(result.columns),
            "shape": result.shape,
            "result_file": concat_key,
            "created_at": datetime.datetime.now().isoformat()
        })

        return {
            "concat_id": concat_id,
            "result_shape": result.shape,
            "columns": list(result.columns),
            "result_file": concat_key,
            "message": "Concatenation completed successfully"
        }

    except Exception as e:
        raise HTTPException(status_code=400, detail=f"Concat failed: {str(e)}")

@router.post("/save")
async def save_concat_dataframe(
    csv_data: str = Body(..., embed=True),
    filename: str = Body(..., embed=True)
):
    """Save a concatenated dataframe (CSV) to MinIO as Arrow file and return file info."""
    import pandas as pd
    import pyarrow as pa
    import pyarrow.ipc as ipc
    import io
    import datetime
    import uuid

    try:
        # Parse CSV to DataFrame
        df = pd.read_csv(io.StringIO(csv_data))
        # Generate unique file key if not provided
        if not filename:
            concat_id = str(uuid.uuid4())[:8]
            filename = f"{concat_id}_concat.arrow"
        if not filename.endswith('.arrow'):
            filename += '.arrow'
        # Prepend OBJECT_PREFIX if not already present
        if not filename.startswith(OBJECT_PREFIX):
            filename = OBJECT_PREFIX + filename
        # Convert to Arrow
        table = pa.Table.from_pandas(df)
        arrow_buffer = pa.BufferOutputStream()
        with ipc.new_file(arrow_buffer, table.schema) as writer:
            writer.write_table(table)
        arrow_bytes = arrow_buffer.getvalue().to_pybytes()
        # Save to MinIO
        minio_client.put_object(
            MINIO_BUCKET,
            filename,
            data=io.BytesIO(arrow_bytes),
            length=len(arrow_bytes),
            content_type="application/octet-stream",
        )
        # Optionally, cache in Redis
        redis_client.setex(filename, 3600, arrow_bytes)
        # Return file info
        return {
            "result_file": filename,
            "shape": df.shape,
            "columns": list(df.columns),
            "message": "DataFrame saved successfully"
        }
    except Exception as e:
        print(f"⚠️ save_concat_dataframe error: {e}")
        raise HTTPException(status_code=400, detail=str(e))

@router.get("/results")
async def get_concat_data(
    concat_id: str = Query(...)
):
    """Retrieve concatenated data by concat_id."""
    try:
        concat_key = f"{concat_id}_concat.arrow"

        # Try Redis cache first
        content = redis_client.get(concat_key)
        if content is not None:
            reader = ipc.RecordBatchFileReader(pa.BufferReader(content))
            concat_df = reader.read_all().to_pandas()
            concat_df.columns = concat_df.columns.str.lower()
            return {
                "row_count": len(concat_df),
                "concat_data": concat_df.to_dict(orient="records")
            }

        # Fallback to MinIO
        concat_obj = minio_client.get_object(MINIO_BUCKET, concat_key)
        data = concat_obj.read()
        reader = ipc.RecordBatchFileReader(pa.BufferReader(data))
        concat_df = reader.read_all().to_pandas()
        concat_df.columns = concat_df.columns.str.lower()

        return {
            "row_count": len(concat_df),
            "concat_data": concat_df.to_dict(orient="records")
        }

    except Exception as e:
        raise HTTPException(status_code=404, detail=f"Unable to fetch concat data: {str(e)}")

@router.get("/export_csv")
async def export_csv(object_name: str):
    """Export concatenated data as CSV file."""
    object_name = unquote(object_name)
    print(f"➡️ export_csv request: {object_name}")
    
    try:
        # Try Redis cache first
        content = redis_client.get(object_name)
        if content is None:
            # Fallback to MinIO
            # Construct the full object path using the prefix if object_name doesn't already include it
            if not object_name.startswith(OBJECT_PREFIX):
                full_object_path = f"{OBJECT_PREFIX}{object_name}"
            else:
                full_object_path = object_name
            response = minio_client.get_object(MINIO_BUCKET, full_object_path)
            content = response.read()
            redis_client.setex(object_name, 3600, content)

        # Convert Arrow to DataFrame
        if object_name.endswith(".arrow"):
            reader = ipc.RecordBatchFileReader(pa.BufferReader(content))
            df = reader.read_all().to_pandas()
        else:
            # Handle CSV files directly
            df = pd.read_csv(io.BytesIO(content))

        # Convert to CSV
        csv_buffer = io.StringIO()
        df.to_csv(csv_buffer, index=False)
        csv_content = csv_buffer.getvalue()

        # Return as downloadable file
        return StreamingResponse(
            io.BytesIO(csv_content.encode('utf-8')),
            media_type="text/csv",
            headers={
                "Content-Disposition": f"attachment; filename=concat_result_{datetime.datetime.now().strftime('%Y%m%d_%H%M%S')}.csv"
            }
        )

    except S3Error as e:
        error_code = getattr(e, "code", "")
        if error_code in {"NoSuchKey", "NoSuchBucket"}:
            redis_client.delete(object_name)
            raise HTTPException(status_code=404, detail="File not found")
        raise HTTPException(status_code=500, detail=str(e))
    except Exception as e:
        print(f"⚠️ export_csv error for {object_name}: {e}")
        raise HTTPException(status_code=400, detail=str(e))

@router.get("/export_excel")
async def export_excel(object_name: str):
    """Export concatenated data as Excel file."""
    object_name = unquote(object_name)
    print(f"➡️ export_excel request: {object_name}")
    
    try:
        # Try Redis cache first
        content = redis_client.get(object_name)
        if content is None:
            # Fallback to MinIO
            # Construct the full object path using the prefix if object_name doesn't already include it
            if not object_name.startswith(OBJECT_PREFIX):
                full_object_path = f"{OBJECT_PREFIX}{object_name}"
            else:
                full_object_path = object_name
            response = minio_client.get_object(MINIO_BUCKET, full_object_path)
            content = response.read()
            redis_client.setex(object_name, 3600, content)

        # Convert Arrow to DataFrame
        if object_name.endswith(".arrow"):
            reader = ipc.RecordBatchFileReader(pa.BufferReader(content))
            df = reader.read_all().to_pandas()
        else:
            # Handle CSV files directly
            df = pd.read_csv(io.BytesIO(content))

        # Convert to Excel
        excel_buffer = io.BytesIO()
        with pd.ExcelWriter(excel_buffer, engine='openpyxl') as writer:
            df.to_excel(writer, sheet_name='Concatenated Data', index=False)
        
        excel_buffer.seek(0)
        excel_content = excel_buffer.getvalue()

        # Return as downloadable file
        return StreamingResponse(
            io.BytesIO(excel_content),
            media_type="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
            headers={
                "Content-Disposition": f"attachment; filename=concat_result_{datetime.datetime.now().strftime('%Y%m%d_%H%M%S')}.xlsx"
            }
        )

    except S3Error as e:
        error_code = getattr(e, "code", "")
        if error_code in {"NoSuchKey", "NoSuchBucket"}:
            redis_client.delete(object_name)
            raise HTTPException(status_code=404, detail="File not found")
        raise HTTPException(status_code=500, detail=str(e))
    except Exception as e:
        print(f"⚠️ export_excel error for {object_name}: {e}")
        raise HTTPException(status_code=400, detail=str(e))
