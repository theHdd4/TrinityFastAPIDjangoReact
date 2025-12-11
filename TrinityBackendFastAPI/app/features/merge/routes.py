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
from app.features.project_state.routes import get_atom_list_configuration
from .merge.base import get_common_columns, merge_dataframes
from .deps import get_minio_df, get_minio_content_with_flight_fallback, minio_client, MINIO_BUCKET, redis_client
from app.features.pipeline.service import record_atom_execution
import logging

logger = logging.getLogger(__name__)

router = APIRouter()

@router.post("/init")
async def init_merge(
    file1: str = Form(...),
    file2: str = Form(...),
    bucket_name: str = Form(...),
    # Pipeline tracking (optional)
    validator_atom_id: str = Form(None),
    card_id: str = Form(None),
    canvas_position: int = Form(0),
):
    try:
        # Get the current object prefix for proper path resolution
        prefix = await get_object_prefix()
        
        # Construct full object paths
        full_path1 = f"{prefix}{file1}" if not file1.startswith(prefix) else file1
        full_path2 = f"{prefix}{file2}" if not file2.startswith(prefix) else file2
        
        # Load dataframes using direct MinIO access (same as perform endpoint)
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

        result = {
            "common_columns": common_cols,
            "join_methods": ["inner", "outer", "left", "right"],
            "fillna_method":["mean", "median", "mode", "ffill", "bfill", "value"]
        }
        
        # Record pipeline execution if validator_atom_id is provided
        if validator_atom_id:
            try:
                # Extract client/app/project from file paths
                path_parts1 = full_path1.split("/")
                client_name = path_parts1[0] if len(path_parts1) > 0 else ""
                app_name = path_parts1[1] if len(path_parts1) > 1 else ""
                project_name = path_parts1[2] if len(path_parts1) > 2 else ""
                
                # Get user_id from atom configuration
                user_id = None
                try:
                    atom_config = await get_atom_list_configuration(
                        client_name=client_name,
                        app_name=app_name,
                        project_name=project_name,
                        mode="laboratory"
                    )
                    if atom_config.get("status") == "success":
                        cards = atom_config.get("cards", [])
                        for card in cards:
                            atoms = card.get("atoms", [])
                            atom = next((a for a in atoms if a.get("id") == validator_atom_id), None)
                            if atom:
                                user_id = atom.get("user_id")
                                break
                except Exception:
                    pass
                
                # Build configuration for pipeline tracking
                configuration = {
                    "file1": full_path1,
                    "file2": full_path2,
                    "bucket_name": bucket_name,
                }
                
                # Build API calls
                execution_started_at = datetime.datetime.utcnow()
                api_calls = [
                    {
                        "endpoint": "/merge/init",
                        "method": "POST",
                        "timestamp": execution_started_at,
                        "params": configuration.copy(),
                        "response_status": 200,
                        "response_data": result
                    }
                ]
                
                # No output files for init
                output_files = []
                
                execution_completed_at = datetime.datetime.utcnow()
                execution_status = "success"
                execution_error = None
                
                # Record execution (async, don't wait for it)
                try:
                    await record_atom_execution(
                        client_name=client_name,
                        app_name=app_name,
                        project_name=project_name,
                        atom_instance_id=validator_atom_id,
                        card_id=card_id or "",
                        atom_type="merge",
                        atom_title="Merge Data",
                        input_files=[full_path1, full_path2],
                        configuration=configuration,
                        api_calls=api_calls,
                        output_files=output_files,
                        execution_started_at=execution_started_at,
                        execution_completed_at=execution_completed_at,
                        execution_status=execution_status,
                        execution_error=execution_error,
                        user_id=user_id or "unknown",
                        mode="laboratory",
                        canvas_position=canvas_position or 0
                    )
                except Exception as e:
                    # Don't fail the request if pipeline recording fails
                    logger.warning(f"⚠️ Failed to record merge init execution for pipeline: {e}")
            except Exception as e:
                logger.warning(f"⚠️ Error during merge init pipeline tracking: {e}")
        
        return result
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
    # Pipeline tracking (optional)
    validator_atom_id: str = Form(None),
    card_id: str = Form(None),
    canvas_position: int = Form(0),
):
    try:
        # Validate inputs
        if not file1 or not file2:
            raise ValueError("file1 and file2 are required")
        
        if not join_columns:
            raise ValueError("join_columns is required")
        
        # Parse join_columns JSON
        try:
            join_cols = json.loads(join_columns)
        except json.JSONDecodeError as e:
            raise ValueError(f"Invalid join_columns JSON: {e}")
        
        # Ensure files have .arrow extension (same as concat)
        if not file1.endswith('.arrow'):
            file1 += '.arrow'
        if not file2.endswith('.arrow'):
            file2 += '.arrow'
        
        # Get the current object prefix for proper path resolution
        prefix = await get_object_prefix()
        
        # Construct full object paths
        full_path1 = f"{prefix}{file1}" if not file1.startswith(prefix) else file1
        full_path2 = f"{prefix}{file2}" if not file2.startswith(prefix) else file2
        
        # Load dataframes using direct MinIO access (same as cardinality endpoint)
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
        
        # Clean column names - convert to lowercase for consistent matching
        df1.columns = df1.columns.str.strip().str.lower()
        df2.columns = df2.columns.str.strip().str.lower()
        
        # Convert join columns to lowercase for case-insensitive matching
        join_cols_lower = [col.lower() for col in join_cols]
        
        # Verify all join columns exist in both dataframes
        missing_in_df1 = [col for col in join_cols_lower if col not in df1.columns]
        missing_in_df2 = [col for col in join_cols_lower if col not in df2.columns]
        
        if missing_in_df1:
            raise ValueError(f"Join columns not found in first file: {missing_in_df1}")
            
        if missing_in_df2:
            raise ValueError(f"Join columns not found in second file: {missing_in_df2}")

        # Clean string values (strip spaces and make lowercase)
        df1 = df1.applymap(lambda x: x.strip().lower() if isinstance(x, str) else x)
        df2 = df2.applymap(lambda x: x.strip().lower() if isinstance(x, str) else x)

        merged_df = merge_dataframes(df1, df2, join_cols_lower, join_type)
        
        suffix_columns = [c for c in merged_df.columns if c.endswith("_x") or c.endswith("_y")]
        
        # Record pipeline execution if validator_atom_id is provided
        if validator_atom_id:
            try:
                # Extract client/app/project from file paths
                path_parts1 = full_path1.split("/")
                client_name = path_parts1[0] if len(path_parts1) > 0 else ""
                app_name = path_parts1[1] if len(path_parts1) > 1 else ""
                project_name = path_parts1[2] if len(path_parts1) > 2 else ""
                
                # Get user_id from atom configuration
                user_id = None
                try:
                    atom_config = await get_atom_list_configuration(
                        client_name=client_name,
                        app_name=app_name,
                        project_name=project_name,
                        mode="laboratory"
                    )
                    if atom_config.get("status") == "success":
                        cards = atom_config.get("cards", [])
                        for card in cards:
                            atoms = card.get("atoms", [])
                            atom = next((a for a in atoms if a.get("id") == validator_atom_id), None)
                            if atom:
                                user_id = atom.get("user_id")
                                break
                except Exception:
                    pass
                
                # Build configuration for pipeline tracking
                configuration = {
                    "file1": full_path1,
                    "file2": full_path2,
                    "bucket_name": bucket_name,
                    "join_columns": join_cols,
                    "join_type": join_type,
                }
                
                # Build API calls
                execution_started_at = datetime.datetime.utcnow()
                api_calls = [
                    {
                        "endpoint": "/merge/perform",
                        "method": "POST",
                        "timestamp": execution_started_at,
                        "params": configuration.copy(),
                        "response_status": 200,
                        "response_data": {
                            "row_count": len(merged_df),
                            "columns": list(merged_df.columns),
                        }
                    }
                ]
                
                # No output files yet (file is saved separately via /save endpoint)
                output_files = []
                
                execution_completed_at = datetime.datetime.utcnow()
                execution_status = "success"
                execution_error = None
                
                # Record execution (async, don't wait for it)
                try:
                    await record_atom_execution(
                        client_name=client_name,
                        app_name=app_name,
                        project_name=project_name,
                        atom_instance_id=validator_atom_id,
                        card_id=card_id or "",
                        atom_type="merge",
                        atom_title="Merge Data",
                        input_files=[full_path1, full_path2],
                        configuration=configuration,
                        api_calls=api_calls,
                        output_files=output_files,
                        execution_started_at=execution_started_at,
                        execution_completed_at=execution_completed_at,
                        execution_status=execution_status,
                        execution_error=execution_error,
                        user_id=user_id or "unknown",
                        mode="laboratory",
                        canvas_position=canvas_position or 0
                    )
                except Exception as e:
                    # Don't fail the request if pipeline recording fails
                    logger.warning(f"⚠️ Failed to record merge atom execution for pipeline: {e}")
            except Exception as e:
                logger.warning(f"⚠️ Error during merge pipeline tracking: {e}")
        
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
    filename: str = Body(..., embed=True),
    # Pipeline tracking (optional)
    validator_atom_id: str = Body(None),
    card_id: str = Body(None),
    canvas_position: int = Body(0),
):
    try:
        # ============================================================
        # 🔧 DTYPE PRESERVATION FIX
        # ============================================================
        # STEP 1: Preview CSV to detect dtypes intelligently
        df_preview = pd.read_csv(io.StringIO(csv_data), nrows=10000)
        
        # STEP 2: Content-based date detection
        # Analyze column values to intelligently detect date columns
        date_columns = []
        for col in df_preview.columns:
            # Skip numeric columns
            if pd.api.types.is_numeric_dtype(df_preview[col]):
                continue
            
            # Get non-null sample
            non_null_values = df_preview[col].dropna()
            if len(non_null_values) == 0:
                continue
            
            # Sample up to 100 values for testing
            sample_size = min(100, len(non_null_values))
            sample = non_null_values.head(sample_size)
            
            # Try parsing as datetime
            try:
                parsed = pd.to_datetime(sample, errors='coerce')
                success_rate = parsed.notna().sum() / len(parsed)
                
                # If 80%+ of samples parse as dates, it's a date column
                if success_rate >= 0.8:
                    date_columns.append(col)
            except Exception as e:
                continue
        
        # STEP 3: Parse full CSV with enhanced dtype inference
        df = pd.read_csv(
            io.StringIO(csv_data),
            parse_dates=date_columns,      # Explicit date columns
            infer_datetime_format=True,    # Speed up date parsing
            low_memory=False,              # Scan entire file before inferring dtypes
            na_values=['', 'None', 'null', 'NULL', 'nan', 'NaN', 'NA', 'N/A']
        )
        
        # STEP 4: Fallback - Manual date conversion for any missed columns
        for col in date_columns:
            if col in df.columns and df[col].dtype == 'object':
                df[col] = pd.to_datetime(df[col], errors='coerce')
        # ============================================================
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
        
        # Record save operation in pipeline (if atom_id is provided)
        if validator_atom_id:
            try:
                # Extract client/app/project from file path
                path_parts = full_path.split("/")
                client_name = path_parts[0] if len(path_parts) > 0 else ""
                app_name = path_parts[1] if len(path_parts) > 1 else ""
                project_name = path_parts[2] if len(path_parts) > 2 else ""
                
                # Determine if it's a default name
                is_default_name = not filename or filename.strip() == ""
                save_as_name = filename if filename else "merge_result"
                
                # Build API call for save operation
                save_started_at = datetime.datetime.utcnow()
                save_api_call = {
                    "endpoint": "/merge/save",
                    "method": "POST",
                    "timestamp": save_started_at,
                    "params": {
                        "filename": filename,
                        "is_default_name": is_default_name,
                    },
                    "response_status": 200,
                    "response_data": {
                        "status": "SUCCESS",
                        "result_file": full_path,
                        "shape": df.shape,
                        "columns": list(df.columns),
                    }
                }
                
                # Get existing execution step and update it with output file
                from app.features.pipeline.service import get_pipeline_collection
                coll = await get_pipeline_collection()
                doc_id = f"{client_name}/{app_name}/{project_name}"
                existing_doc = await coll.find_one({"_id": doc_id})
                
                if existing_doc:
                    pipeline = existing_doc.get("pipeline", {})
                    execution_graph = pipeline.get("execution_graph", [])
                    
                    # Find the step for this atom
                    for step in execution_graph:
                        if (step.get("atom_instance_id") == validator_atom_id and 
                            step.get("card_id") == card_id):
                            # Add save API call to the step
                            if "api_calls" not in step:
                                step["api_calls"] = []
                            step["api_calls"].append(save_api_call)
                            
                            # Update output files to include the saved file
                            if "outputs" not in step:
                                step["outputs"] = []
                            
                            # Check if this saved file already exists in outputs
                            existing_output = None
                            for output in step["outputs"]:
                                if output.get("file_key") == full_path:
                                    existing_output = output
                                    break
                            
                            if existing_output:
                                # Update existing output with save_as_name
                                existing_output["save_as_name"] = save_as_name
                                existing_output["is_default_name"] = is_default_name
                            else:
                                # Add new output for saved file
                                step["outputs"].append({
                                    "file_key": full_path,
                                    "file_path": full_path,
                                    "flight_path": full_path,
                                    "file_name": filename,
                                    "file_type": "arrow",
                                    "size": len(arrow_bytes),
                                    "save_as_name": save_as_name,
                                    "is_default_name": is_default_name,
                                    "columns": list(df.columns),
                                    "row_count": len(df)
                                })
                            
                            # Update the document
                            await coll.update_one(
                                {"_id": doc_id},
                                {
                                    "$set": {
                                        "pipeline.execution_graph": execution_graph,
                                        "execution_timestamp": datetime.datetime.utcnow()
                                    }
                                }
                            )
                            logger.info(f"✅ Updated merge execution step with output file: {full_path}")
                            break
            except Exception as e:
                # Don't fail the save if pipeline recording fails
                logger.warning(f"⚠️ Failed to record merge save operation in pipeline: {e}")
        
        return {
            "result_file": full_path,
            "shape": df.shape,
            "columns": list(df.columns),
            "message": "DataFrame saved successfully"
        }
    except Exception as e:
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
        raise HTTPException(status_code=400, detail=str(e))
 