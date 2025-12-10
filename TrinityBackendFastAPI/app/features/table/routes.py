"""
API routes for Table atom.
"""
from fastapi import APIRouter, HTTPException, Body
from typing import Dict, Any, List, Tuple, Optional
import uuid
import logging
import os
import polars as pl
import re
from urllib.parse import unquote
from minio.error import S3Error

from .schemas import (
    TableLoadRequest,
    TableResponse,
    TableSettings,
    TableUpdateRequest,
    TableSaveRequest,
    TableSaveResponse,
    TablePreviewRequest,
    TableAggregateRequest,
    FormatRequest,
    FormatResponse,
    ConditionalFormatRule,
    RestoreSessionRequest,
    RestoreSessionResponse
)
from .service import (
    SESSIONS,
    load_table_from_minio,
    apply_table_settings,
    save_table_to_minio,
    dataframe_to_response,
    compute_aggregations,
    get_column_types,
    evaluate_conditional_formatting,
    minio_client,
    MINIO_BUCKET,
    save_session_metadata,
    get_session_metadata,
    update_session_access_time,
    save_change_log,
    queue_draft_save,
    restore_session_from_draft,
    clear_draft,
)
from app.features.data_upload_validate.app.routes import get_object_prefix
from app.features.concat.deps import redis_client

logger = logging.getLogger(__name__)

router = APIRouter(tags=["Table"])


def _get_project_context() -> Tuple[str, str]:
    """
    Get project_id and atom_id from environment or use defaults.
    Returns: (project_id, atom_id)
    """
    project_id = os.getenv("PROJECT_ID", os.getenv("PROJECT_NAME", "default_project"))
    # For atom_id, we'll use a placeholder - frontend should provide it
    atom_id = "unknown"  # Will be updated when frontend provides it
    return project_id, atom_id

# ============================================================================
# Conditional Formatting Cache
# ============================================================================
import hashlib
import json
from datetime import datetime

# In-memory cache for CF evaluation results
# Key: (table_id, rules_hash) -> Value: FormatResponse
CF_CACHE: Dict[Tuple[str, str], Any] = {}


def _hash_rules(rules: List[Any]) -> str:
    """Create hash of rules for cache key"""
    rules_json = json.dumps([r.dict() if hasattr(r, 'dict') else r for r in rules], sort_keys=True)
    return hashlib.md5(rules_json.encode()).hexdigest()


@router.get("/test_alive")
async def test_alive():
    """Health check endpoint"""
    return {"status": "alive", "service": "table"}


@router.post("/load", response_model=TableResponse)
async def load_table(request: TableLoadRequest):
    """
    Load a table from MinIO and create a session.
    Similar to dataframe-operations /load_cached endpoint.
    
    Args:
        request: Contains object_name (path to Arrow file in MinIO)
        
    Returns:
        TableResponse with table data, columns, and session ID
    """
    # URL decode the object_name (like dataframe-operations does)
    object_name = unquote(request.object_name)
    logger.info(f"🔵 [TABLE-LOAD] Loading table: {object_name}")
    
    # Validate .arrow extension
    if not object_name.endswith(".arrow"):
        error_msg = f"Invalid object_name '{object_name}': Only .arrow objects are supported"
        logger.error(f"❌ [TABLE-LOAD] {error_msg}")
        raise HTTPException(status_code=400, detail=error_msg)
    
    try:
        # Load DataFrame from MinIO (returns tuple with styles)
        df, conditional_format_styles = load_table_from_minio(object_name)
        
        # Create session
        table_id = str(uuid.uuid4())
        SESSIONS[table_id] = df
        
        # Get project context for MongoDB storage
        project_id, atom_id = _get_project_context()
        atom_id = request.atom_id or atom_id
        project_id = request.project_id or project_id
        
        # Save session metadata to MongoDB
        metadata = {
            "row_count": df.height,
            "column_count": df.width,
        }
        await save_session_metadata(
            table_id=table_id,
            atom_id=atom_id,
            project_id=project_id,
            object_name=object_name,
            has_unsaved_changes=False,
            metadata=metadata
        )
        
        logger.info(f"✅ [TABLE-LOAD] Session created: {table_id}, shape: {df.shape}")
        if conditional_format_styles:
            logger.info(f"🎨 [TABLE-LOAD] Loaded conditional formatting styles for {len(conditional_format_styles)} rows")
        
        # Convert to response format
        response = dataframe_to_response(
            df=df,
            table_id=table_id,
            object_name=object_name
        )
        
        # Add conditional formatting styles to response
        response['conditional_format_styles'] = conditional_format_styles
        
        return TableResponse(**response)
        
    except HTTPException:
        raise
    except Exception as e:
        error_msg = f"Failed to load object '{object_name}': {str(e)}"
        logger.error(f"❌ [TABLE-LOAD] {error_msg}")
        raise HTTPException(status_code=404, detail=error_msg) from e


@router.post("/update", response_model=TableResponse)
async def update_table(request: TableUpdateRequest):
    """
    Update table settings and recompute the view.
    
    Args:
        request: Contains table_id and new settings
        
    Returns:
        TableResponse with updated table data
    """
    logger.info(f"🔵 [TABLE-UPDATE] Updating table: {request.table_id}")
    
    # Clear CF cache for this table (data might have changed)
    keys_to_remove = [k for k in CF_CACHE.keys() if k[0] == request.table_id]
    for key in keys_to_remove:
        del CF_CACHE[key]
    if keys_to_remove:
        logger.info(f"🗑️ [CF] Cleared cache for table {request.table_id} (table updated)")
    
    # Get DataFrame from session (try restore from draft if missing)
    df = SESSIONS.get(request.table_id)
    if df is None:
        logger.warning(f"⚠️ [TABLE-UPDATE] Session {request.table_id} not found, attempting restoration")
        df = await restore_session_from_draft(request.table_id)
        if df is None:
            raise HTTPException(status_code=404, detail="Table session not found and could not be restored")
        SESSIONS[request.table_id] = df
    
    try:
        # Get project context
        project_id, atom_id = _get_project_context()
        atom_id = request.atom_id or atom_id
        project_id = request.project_id or project_id
        
        # Get original object_name from metadata
        metadata = await get_session_metadata(request.table_id)
        object_name = metadata.get("object_name") if metadata else ""
        
        # Apply settings (filters, sorting, column selection)
        processed_df = apply_table_settings(
            df=df,
            settings=request.settings.dict()
        )
        
        # Update session with processed DataFrame
        SESSIONS[request.table_id] = processed_df
        
        # Queue draft save (debounced)
        if object_name:
            await queue_draft_save(
                table_id=request.table_id,
                df=processed_df,
                atom_id=atom_id,
                project_id=project_id,
                object_name=object_name
            )
            
            # Log change
            await save_change_log(
                table_id=request.table_id,
                atom_id=atom_id,
                change_type="settings_update",
                change_data={"settings": request.settings.dict()}
            )
        
        # Update access time
        await update_session_access_time(request.table_id)
        
        # Convert to response
        response = dataframe_to_response(
            df=processed_df,
            table_id=request.table_id,
            settings=request.settings.dict()
        )
        
        logger.info(f"✅ [TABLE-UPDATE] Table updated successfully")
        return TableResponse(**response)
        
    except Exception as e:
        logger.error(f"❌ [TABLE-UPDATE] Error: {e}")
        raise HTTPException(status_code=400, detail=str(e))


@router.post("/restore-session", response_model=RestoreSessionResponse)
async def restore_session(request: RestoreSessionRequest):
    """
    Restore a session from MongoDB metadata and MinIO draft.
    
    Args:
        request: Contains table_id, optional atom_id and project_id
        
    Returns:
        RestoreSessionResponse with restored data
    """
    logger.info(f"🔄 [RESTORE] Restoring session: {request.table_id}")
    
    try:
        # Get metadata from MongoDB
        metadata = await get_session_metadata(request.table_id)
        
        if not metadata:
            return RestoreSessionResponse(
                table_id=request.table_id,
                restored=False,
                has_unsaved_changes=False,
                change_count=0,
                data=None,
                message="Session not found in MongoDB"
            )
        
        # Check for unsaved changes
        has_unsaved_changes = metadata.get("has_unsaved_changes", False)
        draft_object_name = metadata.get("draft_object_name")
        
        if has_unsaved_changes and draft_object_name:
            # Load draft from MinIO
            try:
                df, _ = load_table_from_minio(draft_object_name)
                
                # Restore session
                SESSIONS[request.table_id] = df
                
                # Get change log
                changes = await get_change_log(request.table_id, applied=False)
                
                # Update access time
                await update_session_access_time(request.table_id)
                
                # Convert to response
                response_data = dataframe_to_response(
                    df=df,
                    table_id=request.table_id,
                    object_name=metadata.get("object_name")
                )
                
                logger.info(f"✅ [RESTORE] Restored session {request.table_id} from draft ({len(changes)} unsaved changes)")
                
                return RestoreSessionResponse(
                    table_id=request.table_id,
                    restored=True,
                    has_unsaved_changes=True,
                    change_count=len(changes),
                    data=TableResponse(**response_data),
                    message=f"Restored session with {len(changes)} unsaved changes"
                )
            except Exception as e:
                logger.error(f"❌ [RESTORE] Failed to load draft: {e}")
                # Fall through to load original
        else:
            # Load original file
            object_name = metadata.get("object_name")
            if object_name:
                try:
                    df, _ = load_table_from_minio(object_name)
                    SESSIONS[request.table_id] = df
                    
                    await update_session_access_time(request.table_id)
                    
                    response_data = dataframe_to_response(
                        df=df,
                        table_id=request.table_id,
                        object_name=object_name
                    )
                    
                    logger.info(f"✅ [RESTORE] Restored session {request.table_id} from original file")
                    
                    return RestoreSessionResponse(
                        table_id=request.table_id,
                        restored=True,
                        has_unsaved_changes=False,
                        change_count=0,
                        data=TableResponse(**response_data),
                        message="Restored session from original file"
                    )
                except Exception as e:
                    logger.error(f"❌ [RESTORE] Failed to load original: {e}")
        
        return RestoreSessionResponse(
            table_id=request.table_id,
            restored=False,
            has_unsaved_changes=False,
            change_count=0,
            data=None,
            message="Failed to restore session"
        )
        
    except Exception as e:
        logger.error(f"❌ [RESTORE] Error restoring session: {e}")
        raise HTTPException(status_code=500, detail=str(e))


@router.post("/save", response_model=TableSaveResponse)
async def save_table(request: TableSaveRequest):
    """
    Save table data to MinIO.
    Supports Save (overwrite) and Save As (new file) operations.
    Similar to dataframe-operations /save endpoint.
    
    Args:
        request: Contains table_id, optional filename, overwrite_original flag
        
    Returns:
        TableSaveResponse with object_name and status
    """
    logger.info(f"🔵 [TABLE-SAVE] Saving table: {request.table_id}, filename: {request.filename}, overwrite: {request.overwrite_original}")
    
    # Get DataFrame from session (try restore from draft if missing)
    df = SESSIONS.get(request.table_id)
    if df is None:
        logger.warning(f"⚠️ [TABLE-SAVE] Session {request.table_id} not found, attempting restoration")
        df = await restore_session_from_draft(request.table_id)
        if df is None:
            raise HTTPException(status_code=404, detail="Table session not found and could not be restored")
        SESSIONS[request.table_id] = df
    
    try:
        import io
        import re
        
        # Process header row if enabled (for blank tables)
        if request.use_header_row:
            logger.info(f"📝 [TABLE-SAVE] Processing header row: extracting column names from first row")
            
            if len(df) == 0:
                logger.warning(f"⚠️ [TABLE-SAVE] DataFrame is empty, cannot process header row")
            else:
                # Extract first row values
                first_row = df.head(1)
                new_column_names = []
                
                for col_idx, col_name in enumerate(df.columns):
                    first_row_value = first_row[col_name][0]
                    
                    # Convert to string and clean
                    if first_row_value is None or first_row_value == '':
                        # Fallback to original column name if empty
                        logger.info(f"📝 [TABLE-SAVE] Column {col_idx} header is empty, using '{col_name}'")
                        new_column_names.append(col_name)
                    else:
                        # Use first row value as column name
                        new_name = str(first_row_value).strip()
                        
                        # Clean the name: replace spaces with underscores
                        new_name = new_name.replace(' ', '_')
                        
                        # Remove special characters (keep alphanumeric, underscore, hyphen)
                        new_name = re.sub(r'[^a-zA-Z0-9_-]', '', new_name)
                        
                        # Validate: must start with letter or underscore, and be valid identifier
                        if not new_name:
                            logger.warning(f"⚠️ [TABLE-SAVE] Column {col_idx} header '{first_row_value}' resulted in empty name, using '{col_name}'")
                            new_column_names.append(col_name)
                        elif not (new_name[0].isalpha() or new_name[0] == '_'):
                            logger.warning(f"⚠️ [TABLE-SAVE] Column {col_idx} header '{first_row_value}' doesn't start with letter/underscore, using '{col_name}'")
                            new_column_names.append(col_name)
                        else:
                            new_column_names.append(new_name)
                
                # Check for duplicates and handle them
                seen = {}
                final_column_names = []
                for i, name in enumerate(new_column_names):
                    if name in seen:
                        seen[name] += 1
                        final_name = f"{name}_{seen[name]}"
                        logger.info(f"📝 [TABLE-SAVE] Duplicate column name '{name}' at index {i}, renaming to '{final_name}'")
                        final_column_names.append(final_name)
                    else:
                        seen[name] = 0
                        final_column_names.append(name)
                
                logger.info(f"📝 [TABLE-SAVE] New column names: {final_column_names}")
                
                # Rename columns
                rename_map = {old: new for old, new in zip(df.columns, final_column_names)}
                df = df.rename(rename_map)
                
                # Remove first row (it's now the header, not data)
                original_row_count = len(df)
                df = df.tail(-1)  # Remove first row
                new_row_count = len(df)
                
                logger.info(f"✅ [TABLE-SAVE] DataFrame processed: {original_row_count} rows → {new_row_count} rows")
                logger.info(f"✅ [TABLE-SAVE] Columns renamed: {list(rename_map.keys())} → {final_column_names}")
        
        # Handle filename based on overwrite_original flag
        if request.overwrite_original:
            # Save (overwrite) - use filename as-is
            if not request.filename:
                raise HTTPException(status_code=400, detail="filename is required when overwriting original file")
            if not request.filename.endswith('.arrow'):
                request.filename += '.arrow'
            object_name = request.filename
            message = "Original file updated successfully"
            logger.info(f"🔄 [TABLE-SAVE] Overwriting original file: {object_name}")
        else:
            # Save As (new file) - create new file in table folder
            filename = (request.filename or "").strip()
            if not filename:
                stub = request.table_id.replace("-", "")[:8]
                filename = f"{stub}_table.arrow"
            if not filename.endswith(".arrow"):
                filename += ".arrow"
            
            logger.info(f"💾 [TABLE-SAVE] Target filename: {filename}")
            
            # Get object prefix (client/app/project/)
            prefix = await get_object_prefix()
            table_prefix = f"{prefix}table/"
            logger.info(f"📁 [TABLE-SAVE] MinIO prefix: {table_prefix}")
            
            # Ensure prefix directory exists
            try:
                minio_client.stat_object(MINIO_BUCKET, table_prefix)
            except S3Error:
                logger.info(f"📁 [TABLE-SAVE] Creating prefix directory: {table_prefix}")
                minio_client.put_object(MINIO_BUCKET, table_prefix, io.BytesIO(b""), 0)
            
            object_name = f"{table_prefix}{filename}"
            message = "Table saved successfully"
            logger.info(f"🎯 [TABLE-SAVE] Full object name: {object_name}")
        
        # Evaluate conditional formatting rules if provided
        conditional_format_styles = None
        if request.conditional_format_rules:
            try:
                from .schemas import ConditionalFormatRule
                # Convert dict rules to Pydantic models if needed
                rules = request.conditional_format_rules
                if rules and isinstance(rules[0], dict):
                    # Parse dict rules to Pydantic models
                    parsed_rules = []
                    for rule_dict in rules:
                        rule_type = rule_dict.get('type')
                        if rule_type == 'highlight':
                            from .schemas import HighlightRule
                            parsed_rules.append(HighlightRule(**rule_dict))
                        elif rule_type == 'color_scale':
                            from .schemas import ColorScaleRule
                            parsed_rules.append(ColorScaleRule(**rule_dict))
                    rules = parsed_rules
                
                logger.info(f"🎨 [TABLE-SAVE] Evaluating {len(rules)} conditional formatting rules...")
                conditional_format_styles = evaluate_conditional_formatting(df, rules)
                logger.info(f"🎨 [TABLE-SAVE] Formatting applied to {len(conditional_format_styles)} rows")
            except Exception as cf_err:
                logger.warning(f"⚠️ [TABLE-SAVE] Failed to evaluate conditional formatting: {cf_err}")
                # Continue without styles if evaluation fails
        
        # Write DataFrame to Arrow format with optional metadata
        logger.info(f"🔄 [TABLE-SAVE] Writing DataFrame to Arrow format...")
        logger.info(f"📊 [TABLE-SAVE] DataFrame shape: {df.shape}, columns: {df.columns}")
        
        try:
            import pyarrow as pa
            import pyarrow.ipc as ipc
            import json
            
            # Convert Polars DataFrame to PyArrow Table
            table = df.to_arrow()
            
            # Add conditional formatting styles to metadata if available
            if conditional_format_styles:
                try:
                    # Convert styles dict to JSON string
                    styles_json = json.dumps(conditional_format_styles)
                    
                    # Get existing metadata (if any)
                    metadata = table.schema.metadata or {}
                    
                    # Add conditional formatting styles to metadata
                    metadata[b'conditional_formatting'] = styles_json.encode('utf-8')
                    
                    # Recreate table with new metadata
                    table = table.replace_schema_metadata(metadata)
                    
                    logger.info(f"🎨 [TABLE-SAVE] Added conditional formatting styles to metadata ({len(styles_json)} bytes)")
                except Exception as meta_err:
                    logger.warning(f"⚠️ [TABLE-SAVE] Failed to add conditional formatting metadata: {meta_err}")
            
            # Write Arrow file with metadata
            arrow_buffer = pa.BufferOutputStream()
            with ipc.new_file(arrow_buffer, table.schema) as writer:
                writer.write_table(table)
            arrow_bytes = arrow_buffer.getvalue().to_pybytes()
            
            logger.info(f"✅ [TABLE-SAVE] Arrow write successful")
            logger.info(f"📦 [TABLE-SAVE] Arrow buffer size: {len(arrow_bytes)} bytes")
        except Exception as write_err:
            logger.error(f"❌ [TABLE-SAVE] Arrow write failed: {write_err}")
            raise Exception(f"Failed to write DataFrame to Arrow format: {write_err}") from write_err
        
        # Upload to MinIO
        logger.info(f"⬆️ [TABLE-SAVE] Uploading to MinIO...")
        minio_client.put_object(
            MINIO_BUCKET,
            object_name,
            data=io.BytesIO(arrow_bytes),
            length=len(arrow_bytes),
            content_type="application/octet-stream",
        )
        logger.info(f"✅ [TABLE-SAVE] Upload successful: {object_name}")
        
        # Cache in Redis (like dataframe-operations)
        try:
            redis_client.setex(object_name, 3600, arrow_bytes)
            logger.info(f"💾 [TABLE-SAVE] Cached in Redis: {object_name}")
        except Exception as redis_err:
            logger.warning(f"⚠️ [TABLE-SAVE] Redis cache failed (non-critical): {redis_err}")
        
        # Clear draft and update metadata
        project_id, atom_id = _get_project_context()
        atom_id = request.atom_id or atom_id
        project_id = request.project_id or project_id
        
        # Clear draft (if exists)
        await clear_draft(request.table_id)
        
        # Update metadata with new object_name
        metadata = {
            "row_count": df.height,
            "column_count": df.width,
        }
        await save_session_metadata(
            table_id=request.table_id,
            atom_id=atom_id,
            project_id=project_id,
            object_name=object_name,
            has_unsaved_changes=False,
            metadata=metadata
        )
        
        return TableSaveResponse(
            object_name=object_name,
            status="success",
            message=message,
            row_count=len(df),
            column_count=len(df.columns)
        )
        
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"❌ [TABLE-SAVE] Error: {e}")
        import traceback
        logger.error(f"❌ [TABLE-SAVE] Traceback: {traceback.format_exc()}")
        raise HTTPException(status_code=400, detail=str(e)) from e


@router.post("/preview")
async def preview_table(request: TablePreviewRequest):
    """
    Get paginated preview of table data.
    
    Args:
        request: Contains table_id, page number, page size
        
    Returns:
        Paginated table data
    """
    logger.info(f"🔵 [TABLE-PREVIEW] Preview: {request.table_id}, page {request.page}")
    
    # Get DataFrame from session
    df = SESSIONS.get(request.table_id)
    if df is None:
        raise HTTPException(status_code=404, detail="Table session not found")
    
    try:
        # Calculate offset
        offset = (request.page - 1) * request.page_size
        
        # Get page data
        page_df = df.slice(offset, request.page_size)
        
        return {
            "table_id": request.table_id,
            "page": request.page,
            "page_size": request.page_size,
            "total_rows": len(df),
            "total_pages": (len(df) + request.page_size - 1) // request.page_size,
            "rows": page_df.to_dicts()
        }
        
    except Exception as e:
        logger.error(f"❌ [TABLE-PREVIEW] Error: {e}")
        raise HTTPException(status_code=400, detail=str(e))


@router.post("/aggregate")
async def aggregate_table(request: TableAggregateRequest):
    """
    Compute aggregations for specified columns.
    
    Args:
        request: Contains table_id and aggregation configuration
        
    Returns:
        Aggregation results
    """
    logger.info(f"🔵 [TABLE-AGGREGATE] Computing aggregations: {request.table_id}")
    
    # Get DataFrame from session
    df = SESSIONS.get(request.table_id)
    if df is None:
        raise HTTPException(status_code=404, detail="Table session not found")
    
    try:
        results = compute_aggregations(df, request.aggregations)
        
        return {
            "table_id": request.table_id,
            "aggregations": results
        }
        
    except Exception as e:
        logger.error(f"❌ [TABLE-AGGREGATE] Error: {e}")
        raise HTTPException(status_code=400, detail=str(e))


@router.get("/info/{table_id}")
async def get_table_info(table_id: str):
    """
    Get basic information about a table session.
    
    Args:
        table_id: Session ID
        
    Returns:
        Table metadata
    """
    df = SESSIONS.get(table_id)
    if df is None:
        raise HTTPException(status_code=404, detail="Table session not found")
    
    return {
        "table_id": table_id,
        "row_count": len(df),
        "column_count": len(df.columns),
        "columns": df.columns,
        "dtypes": {col: str(dtype) for col, dtype in zip(df.columns, df.dtypes)}
    }


@router.delete("/session/{table_id}")
async def delete_session(table_id: str):
    """
    Delete a table session to free memory.
    
    Args:
        table_id: Session ID to delete
        
    Returns:
        Success message
    """
    if table_id in SESSIONS:
        del SESSIONS[table_id]
        logger.info(f"🗑️ [TABLE] Session deleted: {table_id}")
        return {"status": "success", "message": f"Session {table_id} deleted"}
    else:
        raise HTTPException(status_code=404, detail="Session not found")


@router.post("/create-blank")
async def create_blank_table(
    rows: int = Body(...), 
    columns: int = Body(...),
    use_header_row: bool = Body(False)
):
    """
    Create a blank table with m rows and n columns.
    All cells will be empty/null and editable.
    
    Blank tables are treated as pure grids, not dataframes:
    - No auto-generated column names (uses internal col_0, col_1, etc.)
    - If use_header_row=True, first row will be treated as column headers
    - If use_header_row=False (default), all rows are data rows
    
    Args:
        rows: Number of rows (m)
        columns: Number of columns (n)
        use_header_row: If True, first row will be treated as headers (default: False)
        
    Returns:
        Table session with empty DataFrame
    """
    logger.info(f"🔨 [TABLE-CREATE-BLANK] Creating blank table: {rows}×{columns}, use_header_row={use_header_row}")
    
    try:
        import polars as pl
        
        # Validate dimensions
        if rows < 1 or rows > 1000:
            raise HTTPException(status_code=400, detail="Rows must be between 1 and 1000")
        if columns < 1 or columns > 100:
            raise HTTPException(status_code=400, detail="Columns must be between 1 and 100")
        
        # Use internal column identifiers (col_0, col_1, etc.) - NOT auto-generated names
        # These are internal only, not displayed to users
        column_names = [f"col_{i}" for i in range(columns)]
        logger.info(f"📝 [TABLE-CREATE-BLANK] Using internal column identifiers: {column_names}")
        
        # Create empty DataFrame with None values
        data_dict = {col_name: [None] * rows for col_name in column_names}
        df = pl.DataFrame(data_dict)
        
        logger.info(f"✅ [TABLE-CREATE-BLANK] Created DataFrame: {df.shape}")
        
        # Create session
        table_id = str(uuid.uuid4())
        SESSIONS[table_id] = df
        
        logger.info(f"✅ [TABLE-CREATE-BLANK] Session created: {table_id}")
        
        # Return full response with table data
        response = {
            "table_id": table_id,
            "rows": rows,
            "columns": columns,
            "column_names": column_names,  # Internal identifiers only
            "use_header_row": use_header_row,
            "mode": "blank",
            "message": f"Created blank table: {rows} rows × {columns} columns",
            "column_types": get_column_types(df)
        }
        
        return response
        
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"❌ [TABLE-CREATE-BLANK] Error: {e}")
        raise HTTPException(status_code=400, detail=str(e))


@router.post("/edit-cell")
async def edit_cell(
    table_id: str = Body(...),
    row: int = Body(...),
    column: str = Body(...),
    value: Any = Body(...),
    atom_id: Optional[str] = Body(None),
    project_id: Optional[str] = Body(None)
):
    """
    Edit a single cell in the table.
    Based on dataframe-operations edit_cell logic.
    
    Args:
        table_id: Table session ID
        row: Row index (0-based)
        column: Column name
        value: New value for the cell
        atom_id: Optional atom ID for session tracking
        project_id: Optional project ID for session tracking
        
    Returns:
        Updated table data
    """
    logger.info(f"✏️ [TABLE-EDIT-CELL] Editing [{row}, {column}] = {value}")
    
    # Get DataFrame from session (try restore from draft if missing)
    df = SESSIONS.get(table_id)
    if df is None:
        logger.warning(f"⚠️ [TABLE-EDIT-CELL] Session {table_id} not found, attempting restoration")
        df = await restore_session_from_draft(table_id)
        if df is None:
            raise HTTPException(status_code=404, detail="Table session not found and could not be restored")
        SESSIONS[table_id] = df
    
    try:
        import polars as pl
        
        # Update the cell using Polars
        # Add row_nr column, update value where row_nr matches, then drop row_nr
        df = df.with_row_count().with_columns(
            pl.when(pl.col("row_nr") == row)
            .then(pl.lit(value))
            .otherwise(pl.col(column))
            .alias(column)
        ).drop("row_nr")
        
        logger.info(f"✅ [TABLE-EDIT-CELL] Cell updated successfully")
        
        # Update session
        SESSIONS[table_id] = df
        
        # Get project context
        project_id_env, atom_id_env = _get_project_context()
        atom_id_final = atom_id or atom_id_env
        project_id_final = project_id or project_id_env
        
        # Get original object_name from metadata
        metadata = await get_session_metadata(table_id)
        object_name = metadata.get("object_name") if metadata else ""
        
        # Queue draft save (debounced)
        if object_name:
            await queue_draft_save(
                table_id=table_id,
                df=df,
                atom_id=atom_id_final,
                project_id=project_id_final,
                object_name=object_name
            )
            
            # Log change
            await save_change_log(
                table_id=table_id,
                atom_id=atom_id_final,
                change_type="cell_edit",
                change_data={"row": row, "column": column, "value": value}
            )
        
        # Update access time
        await update_session_access_time(table_id)
        
        # Return updated data
        response = dataframe_to_response(df, table_id)
        return response
        
    except Exception as e:
        logger.error(f"❌ [TABLE-EDIT-CELL] Error: {e}")
        raise HTTPException(status_code=400, detail=str(e))


# ============================================================================
# Column Operation Endpoints
# ============================================================================


@router.post("/delete-column", response_model=TableResponse)
async def delete_column(
    table_id: str = Body(...),
    column: str = Body(...)
):
    """
    Delete a column from the table.
    
    Args:
        table_id: Table session ID
        column: Column name to delete
        
    Returns:
        Updated table data
    """
    logger.info(f"🗑️ [TABLE-DELETE-COLUMN] Deleting column: {column}")
    
    # Get DataFrame from session
    df = SESSIONS.get(table_id)
    if df is None:
        raise HTTPException(status_code=404, detail="Table session not found")
    
    try:
        # Validate column exists
        if column not in df.columns:
            raise HTTPException(status_code=400, detail=f"Column '{column}' not found")
        
        # Drop the column
        df = df.drop(column)
        
        logger.info(f"✅ [TABLE-DELETE-COLUMN] Column deleted successfully")
        
        # Update session
        SESSIONS[table_id] = df
        
        # Return updated data
        response = dataframe_to_response(df, table_id)
        return TableResponse(**response)
        
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"❌ [TABLE-DELETE-COLUMN] Error: {e}")
        raise HTTPException(status_code=400, detail=str(e))


@router.post("/insert-column", response_model=TableResponse)
async def insert_column(
    table_id: str = Body(...),
    index: int = Body(...),
    name: str = Body(...),
    default_value: Any = Body(None)
):
    """
    Insert a new column into the table at the specified index.
    
    Args:
        table_id: Table session ID
        index: Position to insert the column (0-based)
        name: Name of the new column
        default_value: Default value for all cells in the new column
        
    Returns:
        Updated table data
    """
    logger.info(f"➕ [TABLE-INSERT-COLUMN] Inserting column '{name}' at index {index}")
    
    # Get DataFrame from session
    df = SESSIONS.get(table_id)
    if df is None:
        raise HTTPException(status_code=404, detail="Table session not found")
    
    try:
        # Validate index
        if index < 0:
            index = 0
        elif index > len(df.columns):
            index = len(df.columns)
        
        # Add the new column with default value
        df = df.with_columns(pl.lit(default_value).alias(name))
        
        # Get all columns and reorder them
        cols = df.columns.copy()
        cols.remove(name)  # Remove the new column from the end
        cols.insert(index, name)  # Insert it at the specified position
        
        # Reorder the dataframe columns
        df = df.select(cols)
        
        logger.info(f"✅ [TABLE-INSERT-COLUMN] Column inserted successfully")
        
        # Update session
        SESSIONS[table_id] = df
        
        # Return updated data
        response = dataframe_to_response(df, table_id)
        return TableResponse(**response)
        
    except Exception as e:
        logger.error(f"❌ [TABLE-INSERT-COLUMN] Error: {e}")
        raise HTTPException(status_code=400, detail=str(e))


@router.post("/rename-column", response_model=TableResponse)
async def rename_column(
    table_id: str = Body(...),
    old_name: str = Body(...),
    new_name: str = Body(...)
):
    """
    Rename a column in the table.
    
    Args:
        table_id: Table session ID
        old_name: Current column name
        new_name: New column name
        
    Returns:
        Updated table data
    """
    logger.info(f"✏️ [TABLE-RENAME-COLUMN] Renaming '{old_name}' to '{new_name}'")
    
    # Get DataFrame from session
    df = SESSIONS.get(table_id)
    if df is None:
        raise HTTPException(status_code=404, detail="Table session not found")
    
    try:
        # Validate column exists
        if old_name not in df.columns:
            raise HTTPException(status_code=400, detail=f"Column '{old_name}' not found")
        
        # Rename the column
        df = df.rename({old_name: new_name})
        
        logger.info(f"✅ [TABLE-RENAME-COLUMN] Column renamed successfully")
        
        # Update session
        SESSIONS[table_id] = df
        
        # Return updated data
        response = dataframe_to_response(df, table_id)
        return TableResponse(**response)
        
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"❌ [TABLE-RENAME-COLUMN] Error: {e}")
        raise HTTPException(status_code=400, detail=str(e))


@router.post("/round-column", response_model=TableResponse)
async def round_column(
    table_id: str = Body(...),
    column: str = Body(...),
    decimal_places: int = Body(...)
):
    """
    Round numeric values in a column to the specified decimal places.
    
    Args:
        table_id: Table session ID
        column: Column name to round
        decimal_places: Number of decimal places
        
    Returns:
        Updated table data
    """
    logger.info(f"🔢 [TABLE-ROUND-COLUMN] Rounding column '{column}' to {decimal_places} decimal places")
    
    # Get DataFrame from session
    df = SESSIONS.get(table_id)
    if df is None:
        raise HTTPException(status_code=404, detail="Table session not found")
    
    try:
        # Validate column exists
        if column not in df.columns:
            raise HTTPException(status_code=404, detail=f"Column '{column}' not found")
        
        # Get column dtype
        column_series = df.get_column(column)
        dtype = column_series.dtype
        
        # Check if column is numeric
        is_numeric = dtype in [
            pl.Int8, pl.Int16, pl.Int32, pl.Int64,
            pl.UInt8, pl.UInt16, pl.UInt32, pl.UInt64,
            pl.Float32, pl.Float64
        ]
        
        if not is_numeric:
            raise HTTPException(
                status_code=400,
                detail=f"Column '{column}' is not numeric (dtype: {str(dtype)}). Rounding can only be applied to numeric columns."
            )
        
        # Round the column
        df = df.with_columns(
            pl.col(column).cast(pl.Float64, strict=False).round(decimal_places)
        )
        
        logger.info(f"✅ [TABLE-ROUND-COLUMN] Column rounded successfully")
        
        # Update session
        SESSIONS[table_id] = df
        
        # Return updated data
        response = dataframe_to_response(df, table_id)
        return TableResponse(**response)
        
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"❌ [TABLE-ROUND-COLUMN] Error: {e}")
        raise HTTPException(status_code=400, detail=str(e))


@router.post("/retype-column", response_model=TableResponse)
async def retype_column(
    table_id: str = Body(...),
    column: str = Body(...),
    new_type: str = Body(...)
):
    """
    Change the data type of a column.
    
    Args:
        table_id: Table session ID
        column: Column name to retype
        new_type: New data type ('text', 'number', 'float', 'date')
        
    Returns:
        Updated table data
    """
    logger.info(f"🔄 [TABLE-RETYPE-COLUMN] Changing column '{column}' type to '{new_type}'")
    
    # Get DataFrame from session
    df = SESSIONS.get(table_id)
    if df is None:
        raise HTTPException(status_code=404, detail="Table session not found")
    
    try:
        # Validate column exists
        if column not in df.columns:
            raise HTTPException(status_code=404, detail=f"Column '{column}' not found")
        
        # Convert based on new_type
        if new_type in ["number", "integer", "int"]:
            df = df.with_columns(pl.col(column).cast(pl.Float64, strict=False))
        elif new_type in ["string", "text"]:
            df = df.with_columns(pl.col(column).cast(pl.Utf8))
        elif new_type in ["float", "double"]:
            df = df.with_columns(pl.col(column).cast(pl.Float64, strict=False))
        elif new_type in ["date", "datetime"]:
            df = df.with_columns(pl.col(column).cast(pl.Datetime, strict=False))
        else:
            # Default to string
            df = df.with_columns(pl.col(column).cast(pl.Utf8))
        
        logger.info(f"✅ [TABLE-RETYPE-COLUMN] Column type changed successfully")
        
        # Update session
        SESSIONS[table_id] = df
        
        # Return updated data
        response = dataframe_to_response(df, table_id)
        return TableResponse(**response)
        
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"❌ [TABLE-RETYPE-COLUMN] Error: {e}")
        raise HTTPException(status_code=400, detail=str(e))


@router.post("/transform-case", response_model=TableResponse)
async def transform_case(
    table_id: str = Body(...),
    column: str = Body(...),
    case_type: str = Body(...)
):
    """
    Transform the case of text values in a column.
    
    Args:
        table_id: Table session ID
        column: Column name to transform
        case_type: Case type ('lower', 'upper', 'pascal', 'lower_camel', 'snake', 'screaming_snake')
        
    Returns:
        Updated table data
    """
    logger.info(f"🔤 [TABLE-TRANSFORM-CASE] Transforming column '{column}' to '{case_type}' case")
    
    # Get DataFrame from session
    df = SESSIONS.get(table_id)
    if df is None:
        raise HTTPException(status_code=404, detail="Table session not found")
    
    try:
        # Validate column exists
        if column not in df.columns:
            raise HTTPException(status_code=404, detail=f"Column '{column}' not found")
        
        # Convert column to string first
        df = df.with_columns(pl.col(column).cast(pl.Utf8))
        
        # Apply case transformation
        if case_type == "lower":
            df = df.with_columns(pl.col(column).str.to_lowercase())
        elif case_type == "upper":
            df = df.with_columns(pl.col(column).str.to_uppercase())
        elif case_type == "pascal":
            # Pascal Case: FirstLetterOfEachWord
            df = df.with_columns(
                pl.col(column).map_elements(
                    lambda x: ''.join(word.capitalize() for word in re.split(r'[\s_\-]+', x)) if isinstance(x, str) and x.strip() else x,
                    return_dtype=pl.Utf8
                )
            )
        elif case_type == "lower_camel":
            # Lower Camel Case: firstLetterOfEachWord
            df = df.with_columns(
                pl.col(column).map_elements(
                    lambda x: ''.join(word.capitalize() if i > 0 else word.lower() for i, word in enumerate(re.split(r'[\s_\-]+', x))) if isinstance(x, str) and x.strip() else x,
                    return_dtype=pl.Utf8
                )
            )
        elif case_type == "snake":
            # Snake Case: snake_case
            df = df.with_columns(
                pl.col(column).map_elements(
                    lambda x: re.sub(r'(?<!^)(?=[A-Z])', '_', re.sub(r'[\s\-]+', '_', x)).lower() if isinstance(x, str) and x.strip() else x,
                    return_dtype=pl.Utf8
                )
            )
        elif case_type == "screaming_snake":
            # Screaming Snake Case: SCREAMING_SNAKE_CASE
            df = df.with_columns(
                pl.col(column).map_elements(
                    lambda x: re.sub(r'(?<!^)(?=[A-Z])', '_', re.sub(r'[\s\-]+', '_', x)).upper() if isinstance(x, str) and x.strip() else x,
                    return_dtype=pl.Utf8
                )
            )
        else:
            raise HTTPException(status_code=400, detail=f"Invalid case_type: {case_type}")
        
        logger.info(f"✅ [TABLE-TRANSFORM-CASE] Case transformed successfully")
        
        # Update session
        SESSIONS[table_id] = df
        
        # Return updated data
        response = dataframe_to_response(df, table_id)
        return TableResponse(**response)
        
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"❌ [TABLE-TRANSFORM-CASE] Error: {e}")
        raise HTTPException(status_code=400, detail=str(e))


@router.post("/duplicate-column", response_model=TableResponse)
async def duplicate_column(
    table_id: str = Body(...),
    column: str = Body(...),
    new_name: str = Body(...)
):
    """
    Duplicate a column and place it right after the original column.
    
    Args:
        table_id: Table session ID
        column: Column name to duplicate
        new_name: Name for the duplicated column
        
    Returns:
        Updated table data
    """
    logger.info(f"📋 [TABLE-DUPLICATE-COLUMN] Duplicating column '{column}' as '{new_name}'")
    
    # Get DataFrame from session
    df = SESSIONS.get(table_id)
    if df is None:
        raise HTTPException(status_code=404, detail="Table session not found")
    
    try:
        # Validate column exists
        if column not in df.columns:
            raise HTTPException(status_code=404, detail=f"Column '{column}' not found")
        
        # Get the position of the original column
        original_idx = df.columns.index(column)
        
        # Duplicate the column with the new name
        df = df.with_columns(pl.col(column).alias(new_name))
        
        # Get all columns and reorder them
        all_columns = df.columns.copy()
        
        # Remove the new column from the end
        all_columns.remove(new_name)
        
        # Insert the new column right after the original column
        insert_position = original_idx + 1
        all_columns.insert(insert_position, new_name)
        
        # Reorder the dataframe with the new column order
        df = df.select(all_columns)
        
        logger.info(f"✅ [TABLE-DUPLICATE-COLUMN] Column duplicated successfully")
        
        # Update session
        SESSIONS[table_id] = df
        
        # Return updated data
        response = dataframe_to_response(df, table_id)
        return TableResponse(**response)
        
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"❌ [TABLE-DUPLICATE-COLUMN] Error: {e}")
        raise HTTPException(status_code=400, detail=str(e))


# ============================================================================
# Conditional Formatting Endpoints
# ============================================================================


@router.post("/formatting/evaluate", response_model=FormatResponse)
async def evaluate_formatting(request: FormatRequest):
    """
    Evaluate conditional formatting rules for a table.
    
    Args:
        request: FormatRequest with table_id and rules
        
    Returns:
        FormatResponse with sparse style map
    """
    logger.info(f"🎨 [CF] Evaluating formatting for table: {request.table_id}")
    logger.info(f"📋 [CF] Rules: {len(request.rules)}")
    
    # Get DataFrame from session
    df = SESSIONS.get(request.table_id)
    if df is None:
        raise HTTPException(status_code=404, detail="Table session not found")
    
    # Check cache
    rules_hash = _hash_rules(request.rules)
    cache_key = (request.table_id, rules_hash)
    
    if cache_key in CF_CACHE:
        logger.info(f"💾 [CF] Cache hit for table {request.table_id}")
        cached_response = CF_CACHE[cache_key]
        # Update timestamp (create new response to avoid mutating cached one)
        cached_dict = cached_response.dict() if hasattr(cached_response, 'dict') else cached_response
        cached_dict['evaluated_at'] = datetime.utcnow().isoformat()
        return FormatResponse(**cached_dict)
    
    try:
        # Evaluate rules
        styles = evaluate_conditional_formatting(df, request.rules)
        
        # Create response
        response = FormatResponse(
            table_id=request.table_id,
            styles=styles,
            evaluated_at=datetime.utcnow().isoformat()
        )
        
        # Cache result (limit cache size)
        if len(CF_CACHE) > 100:
            # Remove oldest entry
            oldest_key = min(CF_CACHE.keys(), key=lambda k: CF_CACHE[k].evaluated_at or "")
            del CF_CACHE[oldest_key]
        
        CF_CACHE[cache_key] = response
        
        logger.info(f"✅ [CF] Evaluated {len(styles)} formatted rows")
        return response
        
    except Exception as e:
        logger.error(f"❌ [CF] Error evaluating formatting: {e}")
        import traceback
        logger.error(traceback.format_exc())
        raise HTTPException(status_code=500, detail=f"Failed to evaluate formatting: {str(e)}")


@router.delete("/formatting/cache/{table_id}")
async def clear_formatting_cache(table_id: str):
    """Clear formatting cache for a table"""
    keys_to_remove = [k for k in CF_CACHE.keys() if k[0] == table_id]
    for key in keys_to_remove:
        del CF_CACHE[key]
    logger.info(f"🗑️ [CF] Cleared cache for table {table_id}")
    return {"status": "success", "cleared_keys": len(keys_to_remove)}



