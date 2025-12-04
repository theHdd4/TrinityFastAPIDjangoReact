"""
API routes for Table atom.
"""
from fastapi import APIRouter, HTTPException, Body
from typing import Dict, Any, List
import uuid
import logging
import polars as pl
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
    TableAggregateRequest
)
from .service import (
    SESSIONS,
    load_table_from_minio,
    apply_table_settings,
    save_table_to_minio,
    dataframe_to_response,
    compute_aggregations,
    get_column_types,
    minio_client,
    MINIO_BUCKET
)
from app.features.data_upload_validate.app.routes import get_object_prefix
from app.features.concat.deps import redis_client

logger = logging.getLogger(__name__)

router = APIRouter(tags=["Table"])


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
        # Load DataFrame from MinIO
        df = load_table_from_minio(object_name)
        
        # Create session
        table_id = str(uuid.uuid4())
        SESSIONS[table_id] = df
        
        logger.info(f"✅ [TABLE-LOAD] Session created: {table_id}, shape: {df.shape}")
        
        # Convert to response format
        response = dataframe_to_response(
            df=df,
            table_id=table_id,
            object_name=object_name
        )
        
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
    
    # Get DataFrame from session
    df = SESSIONS.get(request.table_id)
    if df is None:
        raise HTTPException(status_code=404, detail="Table session not found")
    
    try:
        # Apply settings (filters, sorting, column selection)
        processed_df = apply_table_settings(
            df=df,
            settings=request.settings.dict()
        )
        
        # Update session with processed DataFrame
        SESSIONS[request.table_id] = processed_df
        
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
    
    # Get DataFrame from session
    df = SESSIONS.get(request.table_id)
    if df is None:
        raise HTTPException(status_code=404, detail="Table session not found")
    
    try:
        import io
        
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
        
        # Write DataFrame to Arrow format
        logger.info(f"🔄 [TABLE-SAVE] Writing DataFrame to Arrow format...")
        logger.info(f"📊 [TABLE-SAVE] DataFrame shape: {df.shape}, columns: {df.columns}")
        
        arrow_buffer = io.BytesIO()
        try:
            df.write_ipc(arrow_buffer)
            logger.info(f"✅ [TABLE-SAVE] Arrow write successful")
        except Exception as write_err:
            logger.error(f"❌ [TABLE-SAVE] Arrow write failed: {write_err}")
            raise Exception(f"Failed to write DataFrame to Arrow format: {write_err}") from write_err
        
        arrow_bytes = arrow_buffer.getvalue()
        logger.info(f"📦 [TABLE-SAVE] Arrow buffer size: {len(arrow_bytes)} bytes")
        
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
    column_names: list = Body(None)
):
    """
    Create a blank table with m rows and n columns.
    All cells will be empty/null and editable.
    
    Args:
        rows: Number of rows (m)
        columns: Number of columns (n)
        column_names: Optional list of column names
        
    Returns:
        Table session with empty DataFrame
    """
    logger.info(f"🔨 [TABLE-CREATE-BLANK] Creating blank table: {rows}×{columns}")
    
    try:
        import polars as pl
        
        # Validate dimensions
        if rows < 1 or rows > 1000:
            raise HTTPException(status_code=400, detail="Rows must be between 1 and 1000")
        if columns < 1 or columns > 100:
            raise HTTPException(status_code=400, detail="Columns must be between 1 and 100")
        
        # Generate column names if not provided
        if not column_names or len(column_names) != columns:
            column_names = [f"Column{i+1}" for i in range(columns)]
            logger.info(f"📝 [TABLE-CREATE-BLANK] Generated column names: {column_names}")
        
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
            "column_names": column_names,
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
    value: Any = Body(...)
):
    """
    Edit a single cell in the table.
    Based on dataframe-operations edit_cell logic.
    
    Args:
        table_id: Table session ID
        row: Row index (0-based)
        column: Column name
        value: New value for the cell
        
    Returns:
        Updated table data
    """
    logger.info(f"✏️ [TABLE-EDIT-CELL] Editing [{row}, {column}] = {value}")
    
    # Get DataFrame from session
    df = SESSIONS.get(table_id)
    if df is None:
        raise HTTPException(status_code=404, detail="Table session not found")
    
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
        
        # Return updated data
        response = dataframe_to_response(df, table_id)
        return response
        
    except Exception as e:
        logger.error(f"❌ [TABLE-EDIT-CELL] Error: {e}")
        raise HTTPException(status_code=400, detail=str(e))

