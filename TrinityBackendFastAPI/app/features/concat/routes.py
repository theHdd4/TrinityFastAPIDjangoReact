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
from ..data_upload_validate.app.routes import get_object_prefix

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
        raise HTTPException(status_code=400, detail=str(e))

@router.post("/cardinality")
async def cardinality(
    validator_atom_id: str = Form(...),
    file_key: str = Form(...),
    bucket_name: str = Form(...),
    object_names: str = Form(...),
    source_type: str = Form(...)
):
    """Return cardinality data for a file (similar to merge API)."""
    try:
        # Get the current object prefix
        prefix = await get_object_prefix()
        
        # Construct the full object path
        full_object_path = f"{prefix}{object_names}" if not object_names.startswith(prefix) else object_names
        
        # Load the dataframe using the correct path
        from .deps import get_minio_df
        df = get_minio_df(bucket=bucket_name, file_key=full_object_path)
        df.columns = df.columns.str.strip().str.lower()
        
        # Generate cardinality data
        cardinality = []
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
            cardinality.append(
                {
                    "column": col,
                    "data_type": str(df[col].dtype),
                    "unique_count": int(len(vals)),
                    "unique_values": safe_vals,
                }
            )
        return {
            "status": "SUCCESS",
            "source_type": source_type,
            "cardinality": cardinality
        }
    except S3Error as e:
        error_code = getattr(e, "code", "")
        if error_code in {"NoSuchKey", "NoSuchBucket"}:
            redis_client.delete(object_names)
            raise HTTPException(status_code=404, detail="File not found")
        raise HTTPException(status_code=500, detail=str(e))
    except Exception as e:
        raise HTTPException(status_code=400, detail=str(e))

@router.get("/cached_dataframe")
async def cached_dataframe(
    object_name: str,
    page: int = Query(1, ge=1, description="Page number (1-based)"),
    page_size: int = Query(50, ge=1, le=1000, description="Number of rows per page")
):
    """Return the saved dataframe as CSV text from Redis or MinIO with pagination."""
    object_name = unquote(object_name)
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
        raise HTTPException(status_code=400, detail=str(e))

@router.post("/init")
async def init_concat(
    file1: str = Body(...),
    file2: str = Body(...),
    # Pipeline tracking (optional)
    validator_atom_id: str = Body(None),
    card_id: str = Body(None),
    canvas_position: int = Body(0),
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
        
        # Record pipeline execution if validator_atom_id is provided
        if validator_atom_id:
            try:
                # Extract client/app/project from file paths
                prefix = await get_object_prefix()
                full_path1 = f"{prefix}{file1}" if not file1.startswith(prefix) else file1
                full_path2 = f"{prefix}{file2}" if not file2.startswith(prefix) else file2
                
                path_parts1 = full_path1.split("/")
                client_name = path_parts1[0] if len(path_parts1) > 0 else ""
                app_name = path_parts1[1] if len(path_parts1) > 1 else ""
                project_name = path_parts1[2] if len(path_parts1) > 2 else ""
                
                # Get user_id from atom configuration
                from app.features.project_state.routes import get_atom_list_configuration
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
                }
                
                # Build API calls
                execution_started_at = datetime.datetime.utcnow()
                api_calls = [
                    {
                        "endpoint": "/concat/init",
                        "method": "POST",
                        "timestamp": execution_started_at,
                        "params": configuration.copy(),
                        "response_status": 200,
                        "response_data": col_info
                    }
                ]
                
                # No output files for init
                output_files = []
                
                execution_completed_at = datetime.datetime.utcnow()
                execution_status = "success"
                execution_error = None
                
                # Record execution (async, don't wait for it)
                from app.features.pipeline.service import record_atom_execution
                try:
                    await record_atom_execution(
                        client_name=client_name,
                        app_name=app_name,
                        project_name=project_name,
                        atom_instance_id=validator_atom_id,
                        card_id=card_id or "",
                        atom_type="concat",
                        atom_title="Concat Data",
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
                    import logging
                    logger = logging.getLogger(__name__)
                    logger.warning(f"⚠️ Failed to record concat init execution for pipeline: {e}")
            except Exception as e:
                import logging
                logger = logging.getLogger(__name__)
                logger.warning(f"⚠️ Error during concat init pipeline tracking: {e}")
        
        return col_info
    except Exception as e:
        raise HTTPException(status_code=400, detail=f"Failed to process files: {e}")

@router.post("/perform")
async def perform_concat(
    file1: str = Body(...),
    file2: str = Body(...),
    concat_direction: str = Body(...),
    # Pipeline tracking (optional)
    validator_atom_id: str = Body(None),
    card_id: str = Body(None),
    canvas_position: int = Body(0),
):
    if not file1 or not file2 or not concat_direction:
        raise HTTPException(status_code=400, detail=f"file1, file2, and concat_direction are required and must be non-empty. Got: file1={file1!r}, file2={file2!r}, concat_direction={concat_direction!r}")
    try:
        # Ensure files have .arrow extension
        if not file1.endswith('.arrow'):
            file1 += '.arrow'
        if not file2.endswith('.arrow'):
            file2 += '.arrow'
        
        # Get the current object prefix for proper path resolution
        prefix = await get_object_prefix()
        
        # Construct full object paths
        full_path1 = f"{prefix}{file1}" if not file1.startswith(prefix) else file1
        full_path2 = f"{prefix}{file2}" if not file2.startswith(prefix) else file2
        
        # Read first file from storage using direct MinIO access
        try:
            from .deps import get_minio_df
            df1 = get_minio_df(bucket='trinity', file_key=full_path1)
        except Exception as e:
            raise HTTPException(status_code=404, detail=f"File1 not found: {file1}")
        
        # Read second file from storage using direct MinIO access
        try:
            df2 = get_minio_df(bucket='trinity', file_key=full_path2)
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
        # 🔧 COMMENTED OUT: Auto-generation of concat_key creates unwanted files during rerun
        # The concat_key is only used for Redis caching and shouldn't create files
        # During rerun, we should reuse existing concat_id if available, or generate only if needed for Redis cache
        # For now, we'll still generate for Redis cache, but this shouldn't create files
        concat_id = str(uuid.uuid4())[:8]  # Shorten UUID for readability
        concat_key = f"{concat_id}_concat.arrow"

        # Save as Arrow file instead of CSV
        import pyarrow as pa
        table = pa.Table.from_pandas(result)
        arrow_buffer = pa.BufferOutputStream()
        with pa.ipc.new_file(arrow_buffer, table.schema) as writer:
            writer.write_table(table)
        arrow_bytes = arrow_buffer.getvalue().to_pybytes()
        
        # NOTE: Do not persist result to MinIO during `/perform`.
        # The dataframe is cached in Redis for quick retrieval by `/results`.
        # Actual persistence is handled by the dedicated `/save` endpoint.
        # 🔧 CRITICAL: Only cache in Redis, DO NOT save to MinIO here
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

        # Return CSV as string (like Merge API does)
        csv_text = result.to_csv(index=False)
        
        result_data = {
            "concat_id": concat_id,
            "data": csv_text,  # Add CSV data to response
            "result_shape": result.shape,
            "columns": list(result.columns),
            "result_file": concat_key,
            "message": "Concatenation completed successfully"
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
                from app.features.project_state.routes import get_atom_list_configuration
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
                    "concat_direction": concat_direction,
                }
                
                # Build API calls
                execution_started_at = datetime.datetime.utcnow()
                api_calls = [
                    {
                        "endpoint": "/concat/perform",
                        "method": "POST",
                        "timestamp": execution_started_at,
                        "params": configuration.copy(),
                        "response_status": 200,
                        "response_data": result_data
                    }
                ]
                
                # No output files for perform (save handles that)
                output_files = []
                
                execution_completed_at = datetime.datetime.utcnow()
                execution_status = "success"
                execution_error = None
                
                # Record execution (async, don't wait for it)
                from app.features.pipeline.service import record_atom_execution
                try:
                    await record_atom_execution(
                        client_name=client_name,
                        app_name=app_name,
                        project_name=project_name,
                        atom_instance_id=validator_atom_id,
                        card_id=card_id or "",
                        atom_type="concat",
                        atom_title="Concat Data",
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
                    import logging
                    logger = logging.getLogger(__name__)
                    logger.warning(f"⚠️ Failed to record concat perform execution for pipeline: {e}")
            except Exception as e:
                import logging
                logger = logging.getLogger(__name__)
                logger.warning(f"⚠️ Error during concat perform pipeline tracking: {e}")
        
        return result_data

    except Exception as e:
        raise HTTPException(status_code=400, detail=f"Concat failed: {str(e)}")

@router.post("/save")
async def save_concat_dataframe(
    csv_data: str = Body(..., embed=True),
    filename: str = Body(..., embed=True),
    # Pipeline tracking (optional)
    validator_atom_id: str = Body(None),
    card_id: str = Body(None),
    canvas_position: int = Body(0),
):
    """Save a concatenated dataframe (CSV) to MinIO as Arrow file and return file info."""
    import pandas as pd
    import pyarrow as pa
    import pyarrow.ipc as ipc
    import io
    import datetime
    import uuid

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
        # Generate unique file key if not provided
        # 🔧 COMMENTED OUT: Auto-generation creates unwanted files during rerun
        # Output files are correctly created/updated, so this auto-generation is not needed
        # if not filename:
        #     concat_id = str(uuid.uuid4())[:8]
        #     filename = f"{concat_id}_concat.arrow"
        if not filename:
            raise HTTPException(status_code=400, detail="filename is required for save operation")
        
        # 🔧 CRITICAL: Prevent using auto-generated concat_key as filename (e.g., "5771ec39_concat.arrow")
        # These are temporary Redis cache keys and should not be saved as files
        if filename.endswith('_concat.arrow') and len(filename.split('_')[0]) == 8:
            # This looks like an auto-generated concat_key (8-char hex + "_concat.arrow")
            # During rerun, we should use the actual save filename, not the concat_key
            raise HTTPException(
                status_code=400, 
                detail=f"Invalid filename: '{filename}' appears to be an auto-generated concat_key. Please provide a proper save filename."
            )
        
        if not filename.endswith('.arrow'):
            filename += '.arrow'
            
        # Get the standard prefix using get_object_prefix
        prefix = await get_object_prefix()
        # Create full path with standard structure
        full_path = f"{prefix}concatenated-data/{filename}"
        
        # Convert to Arrow
        table = pa.Table.from_pandas(df)
        arrow_buffer = pa.BufferOutputStream()
        with ipc.new_file(arrow_buffer, table.schema) as writer:
            writer.write_table(table)
        arrow_bytes = arrow_buffer.getvalue().to_pybytes()
        
        # Save to MinIO
        minio_client.put_object(
            MINIO_BUCKET,
            full_path,
            data=io.BytesIO(arrow_bytes),
            length=len(arrow_bytes),
            content_type="application/octet-stream",
        )
        
        # Cache in Redis
        redis_client.setex(full_path, 3600, arrow_bytes)
        
        result_data = {
            "result_file": full_path,
            "shape": df.shape,
            "columns": list(df.columns),
            "message": "DataFrame saved successfully"
        }
        
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
                save_as_name = filename if filename else "concat_result"
                
                # Build API call for save operation
                save_started_at = datetime.datetime.utcnow()
                save_api_call = {
                    "endpoint": "/concat/save",
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
                            import logging
                            logger = logging.getLogger(__name__)
                            logger.info(f"✅ Updated concat execution step with output file: {full_path}")
                            break
            except Exception as e:
                # Don't fail the save if pipeline recording fails
                import logging
                logger = logging.getLogger(__name__)
                logger.warning(f"⚠️ Failed to record concat save operation in pipeline: {e}")
        
        return result_data
    except Exception as e:
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
        raise HTTPException(status_code=400, detail=str(e))

@router.get("/export_excel")
async def export_excel(object_name: str):
    """Export concatenated data as Excel file."""
    object_name = unquote(object_name)
    
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
        raise HTTPException(status_code=400, detail=str(e))
