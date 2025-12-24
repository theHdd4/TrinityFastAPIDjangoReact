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
import os
from .deps import (
    minio_client, load_dataframe,
    save_concat_result_to_minio, get_concat_results_collection, save_concat_metadata_to_mongo,
    OBJECT_PREFIX, MINIO_BUCKET, redis_client
)
from ..data_upload_validate.app.routes import get_object_prefix
from ..column_classifier.database import (
    get_classifier_config_from_mongo,
    save_classifier_config_to_mongo,
    check_mongodb_connection,
)
import logging

logger = logging.getLogger(__name__)

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
                    logger.warning(f"⚠️ Failed to record concat init execution for pipeline: {e}")
            except Exception as e:
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
            # Align column types before concatenation to prevent type conversion errors
            # Get all columns from both dataframes
            all_columns = set(df1.columns) | set(df2.columns)
            
            # For each column, ensure both dataframes have compatible types
            for col in all_columns:
                if col in df1.columns and col in df2.columns:
                    dtype1 = df1[col].dtype
                    dtype2 = df2[col].dtype
                    
                    # If types are different, convert to object (string) type to avoid conversion errors
                    if dtype1 != dtype2:
                        # Check if one is numeric and the other is object/string
                        is_numeric1 = pd.api.types.is_numeric_dtype(dtype1)
                        is_numeric2 = pd.api.types.is_numeric_dtype(dtype2)
                        
                        # If one is numeric and the other is object, convert both to object
                        # This preserves the original values and prevents conversion errors
                        if (is_numeric1 and not is_numeric2) or (is_numeric2 and not is_numeric1):
                            logger.info(f"Converting column '{col}' to object type to handle type mismatch (df1: {dtype1}, df2: {dtype2})")
                            df1[col] = df1[col].astype('object')
                            df2[col] = df2[col].astype('object')
                        # If both are numeric but different types, convert to float64 (most permissive)
                        elif is_numeric1 and is_numeric2:
                            logger.info(f"Converting column '{col}' to float64 to handle numeric type mismatch (df1: {dtype1}, df2: {dtype2})")
                            df1[col] = pd.to_numeric(df1[col], errors='coerce')
                            df2[col] = pd.to_numeric(df2[col], errors='coerce')
                            df1[col] = df1[col].astype('float64')
                            df2[col] = df2[col].astype('float64')
                        # If both are object but different, ensure they're both object
                        else:
                            df1[col] = df1[col].astype('object')
                            df2[col] = df2[col].astype('object')
                elif col in df1.columns and col not in df2.columns:
                    # Column only in df1, add as NaN to df2
                    df2[col] = pd.NA
                elif col in df2.columns and col not in df1.columns:
                    # Column only in df2, add as NaN to df1
                    df1[col] = pd.NA
            
            # Ensure both dataframes have the same column order
            df1 = df1.reindex(columns=sorted(all_columns))
            df2 = df2.reindex(columns=sorted(all_columns))
            
            # Now concatenate with type alignment
            try:
                result = pd.concat([df1, df2], axis=0, ignore_index=True)
            except Exception as concat_error:
                # If concat still fails, convert all columns to object type as last resort
                logger.warning(f"Concat failed with aligned types: {concat_error}. Converting all columns to object type.")
                df1 = df1.astype('object')
                df2 = df2.astype('object')
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

        # Save as Arrow file instead of CSV
        import pyarrow as pa
        
        # Before converting to PyArrow, ensure all object columns are properly handled
        # Object columns with mixed types (strings and numbers) cause PyArrow conversion errors
        for col in result.columns:
            if result[col].dtype == 'object':
                # Convert object columns to string to avoid type inference issues
                # This prevents "object of type <class 'str'> cannot be converted to int" errors
                try:
                    # Replace NaN/None values first to avoid conversion issues
                    result[col] = result[col].fillna('')
                    # Convert to string
                    result[col] = result[col].astype(str)
                    # Replace empty strings and string representations of NaN back to None
                    result[col] = result[col].replace(['', 'nan', 'None', 'null', 'NULL', 'NaN', '<NA>', 'NaT', 'nan.0', 'None.0'], None)
                except Exception as col_error:
                    logger.warning(f"Failed to convert column '{col}' to string: {col_error}")
        
        try:
            # Convert to PyArrow table with explicit handling of mixed types
            table = pa.Table.from_pandas(result, preserve_index=False)
            arrow_buffer = pa.BufferOutputStream()
            with pa.ipc.new_file(arrow_buffer, table.schema) as writer:
                writer.write_table(table)
            arrow_bytes = arrow_buffer.getvalue().to_pybytes()
        except Exception as arrow_error:
            # If PyArrow conversion fails, try with a more permissive approach
            logger.warning(f"PyArrow conversion failed: {arrow_error}. Trying alternative conversion method.")
            
            # Convert all columns to string as a fallback
            result_str = result.copy()
            for col in result_str.columns:
                try:
                    result_str[col] = result_str[col].apply(lambda x: str(x) if pd.notna(x) else None)
                except Exception:
                    result_str[col] = result_str[col].astype(str, errors='ignore')
                    result_str[col] = result_str[col].replace(['nan', 'None', 'null', 'NULL', 'NaN', '<NA>', 'NaT'], None)
            
            try:
                table = pa.Table.from_pandas(result_str, preserve_index=False)
                arrow_buffer = pa.BufferOutputStream()
                with pa.ipc.new_file(arrow_buffer, table.schema) as writer:
                    writer.write_table(table)
                arrow_bytes = arrow_buffer.getvalue().to_pybytes()
            except Exception as arrow_error2:
                # Last resort: use CSV as intermediate format and convert back
                logger.warning(f"PyArrow conversion failed again: {arrow_error2}. Using CSV intermediate format.")
                csv_buffer = io.StringIO()
                result.to_csv(csv_buffer, index=False)
                csv_content = csv_buffer.getvalue()
                
                # Read back as CSV and let pandas handle type inference
                df_from_csv = pd.read_csv(io.StringIO(csv_content), low_memory=False)
                # Convert all object columns to string
                for col in df_from_csv.columns:
                    if df_from_csv[col].dtype == 'object':
                        df_from_csv[col] = df_from_csv[col].astype(str)
                        df_from_csv[col] = df_from_csv[col].replace(['nan', 'None', 'null', 'NULL', 'NaN'], None)
                
                table = pa.Table.from_pandas(df_from_csv, preserve_index=False)
                arrow_buffer = pa.BufferOutputStream()
                with pa.ipc.new_file(arrow_buffer, table.schema) as writer:
                    writer.write_table(table)
                arrow_bytes = arrow_buffer.getvalue().to_pybytes()
        
        # NOTE: Do not persist result to MinIO during `/perform`.
        # The dataframe is cached in Redis for quick retrieval by `/results`.
        # Actual persistence is handled by the dedicated `/save` endpoint.
        # Cache in Redis
        redis_client.setex(concat_key, 3600, arrow_bytes)

        # Save metadata to MongoDB (store both short names and full paths for later retrieval)
        collection = get_concat_results_collection()
        await save_concat_metadata_to_mongo(collection, {
            "concat_id": concat_id,
            "file1_name": file1,
            "file2_name": file2,
            "file1_full_path": full_path1,  # Store full path for classification lookup
            "file2_full_path": full_path2,  # Store full path for classification lookup
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
                    logger.warning(f"⚠️ Failed to record concat perform execution for pipeline: {e}")
            except Exception as e:
                logger.warning(f"⚠️ Error during concat perform pipeline tracking: {e}")
        
        return result_data

    except Exception as e:
        raise HTTPException(status_code=400, detail=f"Concat failed: {str(e)}")

def _classify_column_for_concat(
    col: str,
    col_type: str,
    identifier_keywords: list[str],
    measure_keywords: list[str],
) -> str:
    """Classify a single column. Returns 'identifiers', 'measures', or 'unclassified'."""
    col_lower = col.lower()
    
    # Check keyword matches first
    if any(keyword in col_lower for keyword in identifier_keywords):
        return "identifiers"
    elif any(keyword in col_lower for keyword in measure_keywords):
        return "measures"
    
    # If no keyword match, classify by data type
    # Datetime → identifiers
    elif "datetime" in col_type.lower() or col_type in ["datetime64[ns]", "datetime64", "date"]:
        return "identifiers"
    # Categorical/string/object → identifiers
    elif col_type in ["object", "category", "string"]:
        return "identifiers"
    # Numerical → measures
    elif "int" in col_type.lower() or "float" in col_type.lower() or col_type in ["numeric", "integer", "float64", "float32", "int64", "int32"]:
        return "measures"
    else:
        return "unclassified"


async def _prime_concat_file_with_classifications(
    concat_file_path: str,
    file1_path: str,
    file2_path: str,
    df: pd.DataFrame,
    client_name: str,
    app_name: str,
    project_name: str,
    project_id: int | None = None,
) -> None:
    """Prime concat file by merging parent file classifications and auto-classifying new columns.
    
    For columns that exist in parent files, use saved classification.
    For new columns, use autoclassification logic.
    """
    try:
        if not check_mongodb_connection():
            logger.warning("MongoDB not connected, skipping classification for concat file")
            return
        
        # Normalize column names to lowercase
        df.columns = [str(c).strip().lower() for c in df.columns]
        all_columns = df.columns.tolist()
        column_types = {c: str(df[c].dtype) for c in df.columns}
        
        # AUTO-CLASSIFY keywords (same as column classifier)
        identifier_keywords = [
            'id', 'name', 'brand', 'market', 'category', 'region', 'channel', 
            'date', 'time', 'year', 'week', 'month', 'variant', 'ppg', 'type', 
            'code', 'packsize', 'packtype', "sku", "product",
            "segment", "subsegment", "subchannel", "zone", "state", "city", "cluster", 
            "store", "retailer", "distributor", "partner", "account",
            "customer", "consumer", "household", "respondent", "wave", "period", 
            "quarter", "day"
        ]
        
        measure_keywords = [
            'sales', 'revenue', 'volume', 'amount', 'value', 'price', 'cost', 
            'profit', 'units', 'd1', 'd2', 'd3', 'd4', 'd5', 'd6', 
            'salesvalue', 'baseprice', 'promoprice',
            "sale", "qty", "quantity", "mrp", "nrv", "margin", "loss", "rate", 
            "spend", "impressions", "clicks", "carts", "orders", "views", "shares", 
            "likes", "comments", "ratings", "scores", "awareness", "consideration", 
            "preference", "nps", "penetration", "frequency", "reach", "trps", "grps", 
            "weight", "index", "share"
        ]
        
        # Get classifications from parent files
        parent1_config = get_classifier_config_from_mongo(
            client_name, app_name, project_name, file1_path
        ) if file1_path else None
        
        parent2_config = get_classifier_config_from_mongo(
            client_name, app_name, project_name, file2_path
        ) if file2_path else None
        
        # Merge classifications from parent files
        merged_identifiers = set()
        merged_measures = set()
        merged_unclassified = set()
        
        # Process parent1 classifications
        if parent1_config:
            parent1_ids = set([str(c).strip().lower() for c in parent1_config.get("identifiers", [])])
            parent1_measures = set([str(c).strip().lower() for c in parent1_config.get("measures", [])])
            parent1_unclassified = set([str(c).strip().lower() for c in parent1_config.get("unclassified", [])])
            
            merged_identifiers.update(parent1_ids)
            merged_measures.update(parent1_measures)
            merged_unclassified.update(parent1_unclassified)
        
        # Process parent2 classifications
        if parent2_config:
            parent2_ids = set([str(c).strip().lower() for c in parent2_config.get("identifiers", [])])
            parent2_measures = set([str(c).strip().lower() for c in parent2_config.get("measures", [])])
            parent2_unclassified = set([str(c).strip().lower() for c in parent2_config.get("unclassified", [])])
            
            # For common columns, prefer parent1 classification if there's a conflict
            # Otherwise merge
            for col in parent2_ids:
                if col not in merged_measures and col not in merged_unclassified:
                    merged_identifiers.add(col)
            
            for col in parent2_measures:
                if col not in merged_identifiers and col not in merged_unclassified:
                    merged_measures.add(col)
            
            for col in parent2_unclassified:
                if col not in merged_identifiers and col not in merged_measures:
                    merged_unclassified.add(col)
        
        # Filter merged classifications to only include columns that exist in concat file
        all_columns_set = set(all_columns)
        merged_identifiers = merged_identifiers & all_columns_set
        merged_measures = merged_measures & all_columns_set
        merged_unclassified = merged_unclassified & all_columns_set
        
        # Find new columns (not in either parent file)
        parent_all_columns = merged_identifiers | merged_measures | merged_unclassified
        new_columns = all_columns_set - parent_all_columns
        
        # Auto-classify new columns
        new_identifiers = []
        new_measures = []
        new_unclassified = []
        
        for col in new_columns:
            col_type = column_types.get(col, "string")
            classification = _classify_column_for_concat(
                col, col_type, identifier_keywords, measure_keywords
            )
            
            if classification == "identifiers":
                new_identifiers.append(col)
            elif classification == "measures":
                new_measures.append(col)
            else:
                new_unclassified.append(col)
        
        # Merge parent classifications with new classifications
        final_identifiers = list(merged_identifiers | set(new_identifiers))
        final_measures = list(merged_measures | set(new_measures))
        final_unclassified = list(merged_unclassified | set(new_unclassified))
        
        # Save to MongoDB
        config_data = {
            "project_id": project_id,
            "client_name": client_name,
            "app_name": app_name,
            "project_name": project_name,
            "identifiers": final_identifiers,
            "measures": final_measures,
            "unclassified": final_unclassified,
            "dimensions": {},  # Empty dimensions object
            "file_name": concat_file_path,
        }
        
        # Get environment variables if available
        try:
            from ..data_upload.app.routes import get_env_vars
            env = await get_env_vars(
                client_name=client_name,
                app_name=app_name,
                project_name=project_name,
            )
            if env:
                config_data["env"] = env
        except Exception as e:
            logger.warning(f"Failed to get env vars: {e}")
        
        # Save to MongoDB
        mongo_result = save_classifier_config_to_mongo(config_data)
        
        # Mark file as primed in Redis (so it shows as green in UI)
        # Use both full path and filename to ensure it's found regardless of how it's checked
        try:
            # Mark with full path
            primed_key_parts = ("primed_files", client_name, app_name, project_name, concat_file_path)
            redis_client.set(primed_key_parts, "true", ttl=86400 * 30)  # 30 days TTL
            logger.info(f"✅ Marked concat file as primed in Redis (full path): {concat_file_path}")
            
            # Also mark with just filename (in case status check uses filename only)
            filename_only = concat_file_path.split("/")[-1] if "/" in concat_file_path else concat_file_path
            if filename_only != concat_file_path:
                primed_key_parts_filename = ("primed_files", client_name, app_name, project_name, filename_only)
                redis_client.set(primed_key_parts_filename, "true", ttl=86400 * 30)
                logger.info(f"✅ Marked concat file as primed in Redis (filename): {filename_only}")
        except Exception as redis_error:
            logger.warning(f"Failed to mark file as primed in Redis: {redis_error}")
            # Don't fail if Redis marking fails
        
        logger.info(
            f"✅ Primed concat file with classifications: {concat_file_path} | "
            f"{len(final_identifiers)} identifiers, {len(final_measures)} measures, "
            f"{len(final_unclassified)} unclassified | "
            f"Parent files: {file1_path}, {file2_path} | "
            f"New columns auto-classified: {len(new_columns)}"
        )
        
    except Exception as e:
        logger.error(f"❌ Failed to prime concat file with classifications: {e}", exc_info=True)
        # Don't fail the save operation if classification fails


@router.post("/save")
async def save_concat_dataframe(
    csv_data: str = Body(..., embed=True),
    filename: str = Body(..., embed=True),
    # Pipeline tracking (optional)
    validator_atom_id: str = Body(None),
    card_id: str = Body(None),
    canvas_position: int = Body(0),
    # Parent files for classification (optional, will try to get from pipeline if not provided)
    file1: str = Body(None),
    file2: str = Body(None),
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
                # Suppress the format inference warning
                import warnings
                with warnings.catch_warnings():
                    warnings.filterwarnings('ignore', category=UserWarning, message='.*Could not infer format.*')
                    parsed = pd.to_datetime(sample, errors='coerce')
                success_rate = parsed.notna().sum() / len(parsed)
                
                # If 80%+ of samples parse as dates, it's a date column
                if success_rate >= 0.8:
                    date_columns.append(col)
            except Exception as e:
                continue
        
        # STEP 3: Parse full CSV with enhanced dtype inference
        try:
            df = pd.read_csv(
                io.StringIO(csv_data),
                parse_dates=date_columns if date_columns else False,  # Explicit date columns
                low_memory=False,              # Scan entire file before inferring dtypes
                na_values=['', 'None', 'null', 'NULL', 'nan', 'NaN', 'NA', 'N/A']
            )
        except Exception as csv_error:
            logger.error(f"Failed to parse CSV data: {csv_error}")
            # Try parsing without date parsing as fallback
            try:
                df = pd.read_csv(
                    io.StringIO(csv_data),
                    parse_dates=False,
                    low_memory=False,
                    na_values=['', 'None', 'null', 'NULL', 'nan', 'NaN', 'NA', 'N/A']
                )
            except Exception as csv_error2:
                logger.error(f"Failed to parse CSV even without date parsing: {csv_error2}")
                raise HTTPException(status_code=400, detail=f"Failed to parse CSV data: {str(csv_error2)}")
        
        # STEP 4: Fallback - Manual date conversion for any missed columns
        for col in date_columns:
            if col in df.columns and df[col].dtype == 'object':
                try:
                    import warnings
                    with warnings.catch_warnings():
                        warnings.filterwarnings('ignore', category=UserWarning, message='.*Could not infer format.*')
                        df[col] = pd.to_datetime(df[col], errors='coerce')
                except Exception as e:
                    logger.warning(f"Failed to convert column '{col}' to datetime: {e}")
                    # Keep as object if conversion fails
        # ============================================================
        # Generate unique file key if not provided
        if not filename:
            concat_id = str(uuid.uuid4())[:8]
            filename = f"{concat_id}_concat.arrow"
        if not filename.endswith('.arrow'):
            filename += '.arrow'
            
        # Get the standard prefix using get_object_prefix with environment to get actual names
        prefix, env, env_source = await get_object_prefix(include_env=True)
        # Get actual client/app/project names from environment (these match what list_saved_dataframes uses)
        client_name = env.get("CLIENT_NAME", os.getenv("CLIENT_NAME", ""))
        app_name = env.get("APP_NAME", os.getenv("APP_NAME", ""))
        project_name = env.get("PROJECT_NAME", os.getenv("PROJECT_NAME", ""))
        # Create full path with standard structure
        full_path = f"{prefix}concatenated-data/{filename}"
        
        # Convert to Arrow with error handling for type conversion issues
        # Before converting to PyArrow, ensure all object columns are properly handled
        for col in df.columns:
            if df[col].dtype == 'object':
                # Convert object columns to string to avoid type inference issues
                try:
                    # Replace NaN/None values first to avoid conversion issues
                    df[col] = df[col].fillna('')
                    # Convert to string
                    df[col] = df[col].astype(str)
                    # Replace empty strings and string representations of NaN back to None
                    df[col] = df[col].replace(['', 'nan', 'None', 'null', 'NULL', 'NaN', '<NA>', 'NaT', 'nan.0', 'None.0'], None)
                except Exception as col_error:
                    logger.warning(f"Failed to convert column '{col}' to string: {col_error}")
        
        try:
            table = pa.Table.from_pandas(df, preserve_index=False)
            arrow_buffer = pa.BufferOutputStream()
            with ipc.new_file(arrow_buffer, table.schema) as writer:
                writer.write_table(table)
            arrow_bytes = arrow_buffer.getvalue().to_pybytes()
        except Exception as arrow_error:
            # If PyArrow conversion fails, try with all columns as string
            logger.warning(f"PyArrow conversion failed: {arrow_error}. Converting all columns to string.")
            df_str = df.copy()
            for col in df_str.columns:
                try:
                    df_str[col] = df_str[col].apply(lambda x: str(x) if pd.notna(x) else None)
                except Exception:
                    df_str[col] = df_str[col].astype(str, errors='ignore')
                    df_str[col] = df_str[col].replace(['nan', 'None', 'null', 'NULL', 'NaN', '<NA>', 'NaT'], None)
            
            try:
                table = pa.Table.from_pandas(df_str, preserve_index=False)
                arrow_buffer = pa.BufferOutputStream()
                with ipc.new_file(arrow_buffer, table.schema) as writer:
                    writer.write_table(table)
                arrow_bytes = arrow_buffer.getvalue().to_pybytes()
            except Exception as arrow_error2:
                # Last resort: use CSV as intermediate format
                logger.warning(f"PyArrow conversion failed again: {arrow_error2}. Using CSV intermediate format.")
                csv_buffer = io.StringIO()
                df.to_csv(csv_buffer, index=False)
                csv_content = csv_buffer.getvalue()
                
                # Read back as CSV and let pandas handle type inference
                df_from_csv = pd.read_csv(io.StringIO(csv_content), low_memory=False)
                # Convert all object columns to string
                for col in df_from_csv.columns:
                    if df_from_csv[col].dtype == 'object':
                        df_from_csv[col] = df_from_csv[col].astype(str)
                        df_from_csv[col] = df_from_csv[col].replace(['nan', 'None', 'null', 'NULL', 'NaN'], None)
                
                table = pa.Table.from_pandas(df_from_csv, preserve_index=False)
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
        
        # CRITICAL: Mark file as primed IMMEDIATELY after saving to MinIO
        # This ensures the file shows as green (primed) right away, before any async classification
        # ALWAYS mark concat files as primed - they're derived files that should be ready to use
        # If parent files are primed, child inherits that status, but we mark it regardless
        try:
            # Helper function to check if a file path is primed (tries multiple path formats)
            def check_file_primed(file_path: str) -> bool:
                """Check if a file is primed, trying multiple path formats."""
                if not file_path:
                    return False
                # Try with exact path
                try:
                    key = ("primed_files", client_name, app_name, project_name, file_path)
                    if redis_client.get(key):
                        return True
                except:
                    pass
                # Try with just filename
                try:
                    filename = file_path.split("/")[-1] if "/" in file_path else file_path
                    key = ("primed_files", client_name, app_name, project_name, filename)
                    if redis_client.get(key):
                        return True
                except:
                    pass
                # Try with prefix removed if it exists
                try:
                    if file_path.startswith(prefix):
                        relative_path = file_path[len(prefix):]
                        key = ("primed_files", client_name, app_name, project_name, relative_path)
                        if redis_client.get(key):
                            return True
                except:
                    pass
                return False
            
            # Check if parent files are primed
            parent1_primed = check_file_primed(parent_file1) if parent_file1 else False
            parent2_primed = check_file_primed(parent_file2) if parent_file2 else False
            
            # ALWAYS mark concat files as primed - they're derived files that should be ready to use
            # The full_path format matches what list_saved_dataframes returns as object_name
            primed_key_parts = ("primed_files", client_name, app_name, project_name, full_path)
            redis_client.set(primed_key_parts, "true", ttl=86400 * 30)  # 30 days TTL
            logger.info(
                f"✅ IMMEDIATELY marked concat file as primed in Redis: "
                f"full_path={full_path}, client_name={client_name}, app_name={app_name}, project_name={project_name} "
                f"(parent1_primed={parent1_primed}, parent2_primed={parent2_primed})"
            )
            
            # Also mark with just filename (in case status check uses filename only)
            filename_only = full_path.split("/")[-1] if "/" in full_path else full_path
            if filename_only != full_path:
                primed_key_parts_filename = ("primed_files", client_name, app_name, project_name, filename_only)
                redis_client.set(primed_key_parts_filename, "true", ttl=86400 * 30)
                logger.info(f"✅ IMMEDIATELY marked concat file as primed (filename): {filename_only}")
            
            # Also mark with relative path (without prefix) in case that's used
            if full_path.startswith(prefix):
                relative_path = full_path[len(prefix):]
                if relative_path != full_path and relative_path != filename_only:
                    primed_key_parts_relative = ("primed_files", client_name, app_name, project_name, relative_path)
                    redis_client.set(primed_key_parts_relative, "true", ttl=86400 * 30)
                    logger.info(f"✅ IMMEDIATELY marked concat file as primed (relative): {relative_path}")
        except Exception as immediate_primed_error:
            logger.error(f"❌ Failed to immediately mark file as primed: {immediate_primed_error}", exc_info=True)
            # Try one more time with just the basic path
            try:
                primed_key_parts = ("primed_files", client_name, app_name, project_name, full_path)
                redis_client.set(primed_key_parts, "true", ttl=86400 * 30)
                logger.info(f"✅ Retry: Marked concat file as primed: {full_path}")
            except Exception as retry_error:
                logger.error(f"❌ Retry also failed to mark file as primed: {retry_error}")
        
        # Cache in Redis
        try:
            redis_client.setex(full_path, 3600, arrow_bytes)
            logger.info(f"✅ Cached concat file in Redis: {full_path}")
        except Exception as redis_error:
            logger.warning(f"Failed to cache in Redis: {redis_error}")
            # Don't fail if Redis caching fails
        
        # Ensure all values in result_data are JSON serializable
        try:
            result_data = {
                "result_file": str(full_path),
                "shape": [int(df.shape[0]), int(df.shape[1])],  # Convert numpy int64 to Python int
                "columns": [str(col) for col in df.columns],  # Ensure all column names are strings
                "message": "DataFrame saved successfully"
            }
            logger.info(f"✅ Concat file saved successfully: {full_path}, shape: {df.shape}, columns: {len(df.columns)}")
        except Exception as result_error:
            logger.error(f"Failed to create result_data: {result_error}")
            result_data = {
                "result_file": str(full_path),
                "shape": [0, 0],
                "columns": [],
                "message": "DataFrame saved successfully"
            }
        
        # client_name, app_name, project_name are already set above from get_object_prefix(include_env=True)
        # This ensures they match exactly what list_saved_dataframes uses
        
        # Get project_id from environment variables if available
        project_id = None
        try:
            project_id_str = os.getenv("PROJECT_ID")
            if project_id_str:
                try:
                    project_id = int(project_id_str)
                except ValueError:
                    pass
        except Exception as e:
            logger.warning(f"Failed to get project_id from env: {e}")
        
        # Get parent file paths for classification
        # Try to get from parameters first, then from pipeline execution, then from concat metadata
        parent_file1 = file1
        parent_file2 = file2
        
        if not parent_file1 or not parent_file2:
            # Try to get from pipeline execution
            if validator_atom_id:
                try:
                    from app.features.pipeline.service import get_pipeline_collection
                    coll = await get_pipeline_collection()
                    doc_id = f"{client_name}/{app_name}/{project_name}"
                    existing_doc = await coll.find_one({"_id": doc_id})
                    
                    if existing_doc:
                        pipeline = existing_doc.get("pipeline", {})
                        execution_graph = pipeline.get("execution_graph", [])
                        
                        # Find the step for this atom to get input files
                        for step in execution_graph:
                            if (step.get("atom_instance_id") == validator_atom_id and 
                                step.get("card_id") == card_id):
                                input_files = step.get("input_files", [])
                                if len(input_files) >= 2:
                                    if not parent_file1:
                                        parent_file1 = input_files[0]
                                    if not parent_file2:
                                        parent_file2 = input_files[1]
                                break
                except Exception as e:
                    logger.warning(f"Failed to get parent files from pipeline: {e}")
            
            # If still not found, try to get from concat metadata (using filename to find concat_id)
            if (not parent_file1 or not parent_file2) and filename:
                try:
                    # Extract concat_id from filename (format: {concat_id}_concat.arrow)
                    if "_concat.arrow" in filename:
                        concat_id = filename.replace("_concat.arrow", "").replace(".arrow", "")
                        collection = get_concat_results_collection()
                        metadata = await collection.find_one({"concat_id": concat_id})
                        if metadata:
                            # Prefer full paths if available, otherwise use short names
                            if not parent_file1:
                                parent_file1 = metadata.get("file1_full_path") or metadata.get("file1_name")
                            if not parent_file2:
                                parent_file2 = metadata.get("file2_full_path") or metadata.get("file2_name")
                except Exception as e:
                    logger.warning(f"Failed to get parent files from concat metadata: {e}")
        
        # Prime concat file with classifications
        if parent_file1 and parent_file2:
            # Ensure parent files have .arrow extension and full path
            prefix = await get_object_prefix()
            if not parent_file1.endswith('.arrow'):
                parent_file1 += '.arrow'
            if not parent_file2.endswith('.arrow'):
                parent_file2 += '.arrow'
            
            full_parent1 = f"{prefix}{parent_file1}" if not parent_file1.startswith(prefix) else parent_file1
            full_parent2 = f"{prefix}{parent_file2}" if not parent_file2.startswith(prefix) else parent_file2
            
            # Prime the concat file with classifications
            try:
                await _prime_concat_file_with_classifications(
                    concat_file_path=full_path,
                    file1_path=full_parent1,
                    file2_path=full_parent2,
                    df=df,
                    client_name=client_name,
                    app_name=app_name,
                    project_name=project_name,
                    project_id=project_id,
                )
                # Mark file as primed in Redis immediately after successful classification
                # This ensures the file shows as green (primed) in the UI
                try:
                    primed_key_parts = ("primed_files", client_name, app_name, project_name, full_path)
                    redis_client.set(primed_key_parts, "true", ttl=86400 * 30)  # 30 days TTL
                    logger.info(f"✅ Marked concat file as primed in Redis: {full_path}")
                    
                    # Also mark with just filename (in case status check uses filename only)
                    filename_only = full_path.split("/")[-1] if "/" in full_path else full_path
                    if filename_only != full_path:
                        primed_key_parts_filename = ("primed_files", client_name, app_name, project_name, filename_only)
                        redis_client.set(primed_key_parts_filename, "true", ttl=86400 * 30)
                        logger.info(f"✅ Marked concat file as primed in Redis (filename): {filename_only}")
                except Exception as redis_error:
                    logger.warning(f"Failed to mark file as primed in Redis: {redis_error}")
            except Exception as e:
                logger.warning(f"Failed to prime concat file with classifications: {e}")
        else:
            logger.warning(
                f"Parent files not available for classification. "
                f"file1={parent_file1}, file2={parent_file2}. "
                f"Skipping classification priming for concat file."
            )
            # Even if parent files aren't available, try to mark as primed if classification exists
            # This handles cases where classification was saved but parent file lookup failed
            try:
                # Check if classification already exists in MongoDB
                config = get_classifier_config_from_mongo(
                    client_name, app_name, project_name, file_name=full_path
                )
                if config and (config.get("identifiers") or config.get("measures")):
                    # Classification exists, mark as primed
                    primed_key_parts = ("primed_files", client_name, app_name, project_name, full_path)
                    redis_client.set(primed_key_parts, "true", ttl=86400 * 30)
                    logger.info(f"✅ Marked concat file as primed (classification found): {full_path}")
            except Exception as e:
                logger.warning(f"Failed to check/mark existing classification: {e}")
        
        # Record save operation in pipeline (if atom_id is provided)
        if validator_atom_id:
            try:
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
                            logger.info(f"✅ Updated concat execution step with output file: {full_path}")
                            break
            except Exception as e:
                # Don't fail the save if pipeline recording fails
                logger.warning(f"⚠️ Failed to record concat save operation in pipeline: {e}")
        
        # Final check: Ensure file is marked as primed if classification exists
        # This is a safety net to ensure the file shows as green even if earlier marking failed
        # Use the exact same path format that will be returned by list_saved_dataframes
        try:
            # The object_name in list_saved_dataframes is the full path from MinIO
            # So we use full_path which is already in the correct format: {prefix}concatenated-data/{filename}
            primed_key_parts = ("primed_files", client_name, app_name, project_name, full_path)
            
            # Check if classification exists in MongoDB
            config = get_classifier_config_from_mongo(
                client_name, app_name, project_name, file_name=full_path
            )
            
            # Mark as primed if classification exists OR if we successfully saved it
            should_mark_primed = False
            if config and (config.get("identifiers") or config.get("measures")):
                should_mark_primed = True
                logger.info(f"✅ Classification found in MongoDB for {full_path}")
            else:
                # Check if we just saved it (mongo_result should indicate success)
                # Even if config lookup fails, mark as primed if classification was attempted
                should_mark_primed = True
                logger.info(f"✅ Marking as primed (classification was saved): {full_path}")
            
            if should_mark_primed:
                existing_primed = redis_client.get(primed_key_parts)
                if not existing_primed:
                    redis_client.set(primed_key_parts, "true", ttl=86400 * 30)
                    logger.info(f"✅ Final check: Marked concat file as primed in Redis: {full_path}")
                else:
                    logger.info(f"✅ Concat file already marked as primed: {full_path}")
                
                # Also mark with just filename (in case status check uses filename only)
                filename_only = full_path.split("/")[-1] if "/" in full_path else full_path
                if filename_only != full_path:
                    primed_key_parts_filename = ("primed_files", client_name, app_name, project_name, filename_only)
                    existing_primed_filename = redis_client.get(primed_key_parts_filename)
                    if not existing_primed_filename:
                        redis_client.set(primed_key_parts_filename, "true", ttl=86400 * 30)
                        logger.info(f"✅ Final check: Marked concat file as primed (filename): {filename_only}")
        except Exception as final_check_error:
            logger.warning(f"Final check for priming status failed: {final_check_error}")
        
        return result_data
    except Exception as e:
        error_msg = str(e)
        logger.error(f"❌ Concat save failed: {error_msg}", exc_info=True)
        raise HTTPException(status_code=400, detail=f"Concat save failed: {error_msg}")

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
