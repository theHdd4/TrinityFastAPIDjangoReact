from __future__ import annotations

import json
import logging
import time
import uuid
from datetime import datetime, timezone
from typing import Any, Dict, List, Optional

import numpy as np
import pandas as pd
import pyarrow as pa
import pyarrow.ipc as ipc
from fastapi import HTTPException

from app.DataStorageRetrieval.arrow_client import download_dataframe
from app.DataStorageRetrieval.minio_utils import ensure_minio_bucket, upload_to_minio
from app.features.data_upload_validate.app.routes import get_object_prefix
from app.core.feature_cache import feature_cache

from .unpivot_models import (
    UnpivotComputeRequest,
    UnpivotComputeResponse,
    UnpivotCreateRequest,
    UnpivotCreateResponse,
    UnpivotMetadataResponse,
    UnpivotPropertiesUpdate,
    UnpivotResultResponse,
    UnpivotSaveRequest,
    UnpivotSaveResponse,
    UnpivotValidateRequest,
    UnpivotValidateResponse,
    DatasetSchemaRequest,
    DatasetSchemaResponse,
    UnpivotDatasetUpdatedRequest,
    UnpivotAutosaveResponse,
    UnpivotCacheResponse,
)
from .unpivot_utils import (
    apply_filters,
    convert_numpy,
    get_dataset_schema_info,
    resolve_columns,
    resolve_object_path,
    validate_unpivot_config,
)

redis_client = feature_cache.router("unpivot")

logger = logging.getLogger(__name__)

UNPIVOT_CACHE_TTL = 3600
UNPIVOT_NAMESPACE = "unpivot"


def _ns_key(atom_id: str, suffix: str) -> str:
    return f"{UNPIVOT_NAMESPACE}:{atom_id}:{suffix}"


def _ensure_redis_json(value: Dict[str, Any]) -> bytes:
    return json.dumps(value, default=str).encode("utf-8")


def _decode_redis_json(value: Optional[bytes]) -> Optional[Dict[str, Any]]:
    if not value:
        return None
    try:
        return json.loads(value.decode("utf-8"))
    except Exception:
        return None


def _store_metadata(atom_id: str, metadata: Dict[str, Any]) -> None:
    """Store atom metadata in Redis."""
    redis_client.setex((atom_id, "metadata"), UNPIVOT_CACHE_TTL, _ensure_redis_json(metadata))


def _load_metadata(atom_id: str) -> Optional[Dict[str, Any]]:
    """Load atom metadata from Redis."""
    raw = redis_client.get((atom_id, "metadata"))
    return _decode_redis_json(raw)


async def _store_result(atom_id: str, result: Dict[str, Any]) -> None:
    """Store computation result in Redis or MinIO.
    
    Strategy:
    - Small results (≤20MB): Store full data in Redis
    - Large results (>20MB): Store only metadata in Redis, full data in MinIO
    - Very large results (>100MB): Always use MinIO, store preview sample in Redis
    """
    # Check size of the result
    result_bytes = _ensure_redis_json(result)
    result_size = len(result_bytes)
    
    # Thresholds:
    # - SMALL: Store in Redis (fast access)
    # - LARGE: Store metadata in Redis, full data in MinIO
    # - VERY_LARGE: Always use MinIO, store preview in Redis
    SMALL_RESULT_THRESHOLD = 20 * 1024 * 1024  # 20MB - must be < binary_cache limit (25MB)
    VERY_LARGE_THRESHOLD = 100 * 1024 * 1024  # 100MB - always use MinIO
    
    if result_size > VERY_LARGE_THRESHOLD:
        # Very large results: Always use MinIO, store preview sample in Redis
        logger.info(
            "Unpivot result for atom %s is very large (%d bytes), using MinIO with preview sample",
            atom_id,
            result_size,
        )
        
        # Store preview sample (first 1000 rows) in Redis for quick access
        records = result.get("dataframe", [])
        preview_records = records[:1000] if len(records) > 1000 else records
        
        preview_result = {
            "atom_id": result.get("atom_id"),
            "status": result.get("status"),
            "updated_at": result.get("updated_at"),
            "row_count": result.get("row_count"),
            "dataframe": preview_records,  # Preview only
            "summary": result.get("summary"),
            "computation_time": result.get("computation_time"),
            "stored_in_minio": True,
            "is_preview": True,  # Flag to indicate this is a preview
        }
        redis_client.setex((atom_id, "result"), UNPIVOT_CACHE_TTL, _ensure_redis_json(preview_result))
        
        # Save full result to MinIO
        try:
            minio_path = await _save_large_result_to_minio(atom_id, result)
            if minio_path:
                logger.info("Very large result saved to MinIO: %s", minio_path)
        except Exception as e:
            logger.warning("Failed to save very large result to MinIO: %s", e)
    elif result_size > SMALL_RESULT_THRESHOLD:
        # For large results, save to MinIO and store only metadata in Redis
        logger.info(
            "Unpivot result for atom %s is large (%d bytes), saving to MinIO instead of Redis",
            atom_id,
            result_size,
        )
        
        # Store minimal metadata in Redis (without the dataframe)
        metadata_only = {
            "atom_id": result.get("atom_id"),
            "status": result.get("status"),
            "updated_at": result.get("updated_at"),
            "row_count": result.get("row_count"),
            "summary": result.get("summary"),
            "computation_time": result.get("computation_time"),
            "stored_in_minio": True,  # Flag to indicate data is in MinIO
        }
        redis_client.setex((atom_id, "result"), UNPIVOT_CACHE_TTL, _ensure_redis_json(metadata_only))
        
        # Save full result to MinIO synchronously (we need the path immediately)
        # This is called from async context, so we can await
        try:
            minio_path = await _save_large_result_to_minio(atom_id, result)
            if minio_path:
                logger.info("Large result saved to MinIO: %s", minio_path)
        except Exception as e:
            logger.warning("Failed to save large result to MinIO: %s", e)
    else:
        # Small results: store directly in Redis as before
        redis_client.setex((atom_id, "result"), UNPIVOT_CACHE_TTL, result_bytes)


async def _load_result(atom_id: str) -> Optional[Dict[str, Any]]:
    """Load computation result from Redis or MinIO."""
    raw = redis_client.get((atom_id, "result"))
    result = _decode_redis_json(raw)
    
    if not result:
        return None
    
    # Check if the result is stored in MinIO
    if result.get("stored_in_minio"):
        # Load from MinIO using the cached path
        metadata = _load_metadata(atom_id) or {}
        minio_path = metadata.get("cached_result_path")
        
        if minio_path:
            try:
                # Load dataframe from MinIO
                resolved_path = await resolve_object_path(minio_path)
                df = download_dataframe(resolved_path)
                
                # For very large files, only convert to records if needed
                # Check if this is a preview that needs full data
                if result.get("is_preview"):
                    # This is a preview - keep it as preview unless explicitly requested
                    # The full data is available in MinIO at minio_path
                    logger.info("Returning preview result from MinIO cache: %s", minio_path)
                    # Keep the preview dataframe, but mark that full data is available
                    result["full_data_path"] = minio_path
                else:
                    # Regular large result - load full data
                    # Convert back to records format
                    records = [convert_numpy(record) for record in df.to_dict(orient="records")]
                    
                    # Reconstruct full result
                    result["dataframe"] = records
                    result["stored_in_minio"] = False  # Mark as loaded
                    
                    logger.info("Loaded large unpivot result from MinIO: %s", minio_path)
            except Exception as e:
                logger.error("Failed to load result from MinIO (%s): %s", minio_path, e)
                # Return metadata-only result (without dataframe)
                result["dataframe"] = []
        else:
            logger.warning("Result marked as stored_in_minio but no cached_result_path found in metadata")
    
    return result


def _store_config(atom_id: str, config: Dict[str, Any]) -> None:
    """Store atom configuration in Redis."""
    redis_client.setex((atom_id, "config"), UNPIVOT_CACHE_TTL, _ensure_redis_json(config))


def _load_config(atom_id: str) -> Optional[Dict[str, Any]]:
    """Load atom configuration from Redis."""
    raw = redis_client.get((atom_id, "config"))
    return _decode_redis_json(raw)


async def _save_large_result_to_minio(atom_id: str, result: Dict[str, Any]) -> Optional[str]:
    """Save large unpivot result to MinIO and return the path."""
    try:
        records = result.get("dataframe", [])
        if not records:
            logger.warning("No dataframe to save for atom %s", atom_id)
            return None
        
        df = pd.DataFrame(records)
        
        # Convert to Arrow format (more efficient than JSON)
        table = pa.Table.from_pandas(df)
        sink = pa.BufferOutputStream()
        with ipc.new_file(sink, table.schema) as writer:
            writer.write_table(table)
        file_bytes = sink.getvalue().to_pybytes()
        
        # Get object prefix
        prefix = await get_object_prefix()
        if isinstance(prefix, tuple):
            prefix = prefix[0]
        if not prefix.endswith("/"):
            prefix = f"{prefix}/"
        
        object_prefix = f"{prefix}unpivot/cache/"
        file_name = f"{atom_id}_result.arrow"
        
        # Upload to MinIO
        ensure_minio_bucket()
        upload_result = upload_to_minio(file_bytes, file_name, object_prefix)
        
        if upload_result.get("status") != "success":
            logger.error("Failed to save large result to MinIO: %s", upload_result.get("error_message"))
            return None
        
        minio_path = upload_result["object_name"]
        
        # Store the MinIO path in metadata
        metadata = _load_metadata(atom_id) or {}
        metadata["cached_result_path"] = minio_path
        _store_metadata(atom_id, metadata)
        
        logger.info("Saved large unpivot result to MinIO: %s", minio_path)
        return minio_path
    except Exception as e:
        logger.error("Error saving large result to MinIO for atom %s: %s", atom_id, e)
        return None


async def create_unpivot_atom(payload: UnpivotCreateRequest) -> UnpivotCreateResponse:
    """Create a new unpivot atom."""
    logger.info("Creating unpivot atom: %s", payload.atom_name)
    
    # Generate unique atom ID
    atom_id = f"unpivot_{uuid.uuid4().hex[:12]}"
    
    now = datetime.now(timezone.utc)
    
    # Store initial metadata
    metadata = {
        "atom_id": atom_id,
        "project_id": payload.project_id,
        "workflow_id": payload.workflow_id,
        "atom_name": payload.atom_name,
        "dataset_path": payload.dataset_path,
        "id_vars": [],
        "value_vars": [],
        "variable_column_name": "variable",
        "value_column_name": "value",
        "pre_filters": [],
        "post_filters": [],
        "auto_refresh": True,
        "created_at": now.isoformat(),
        "updated_at": now.isoformat(),
    }
    
    _store_metadata(atom_id, metadata)
    
    logger.info("Created unpivot atom: %s", atom_id)
    
    return UnpivotCreateResponse(
        atom_id=atom_id,
        project_id=payload.project_id,
        workflow_id=payload.workflow_id,
        atom_name=payload.atom_name,
        created_at=now,
    )


async def get_unpivot_metadata(atom_id: str) -> UnpivotMetadataResponse:
    """Get metadata for an unpivot atom."""
    metadata = _load_metadata(atom_id)
    if not metadata:
        raise HTTPException(status_code=404, detail=f"Unpivot atom '{atom_id}' not found")
    
    created_at = datetime.fromisoformat(metadata["created_at"]) if isinstance(metadata.get("created_at"), str) else datetime.now(timezone.utc)
    updated_at = None
    if metadata.get("updated_at"):
        try:
            updated_at = datetime.fromisoformat(metadata["updated_at"])
        except (ValueError, TypeError):
            pass
    
    last_computed_at = None
    if metadata.get("last_computed_at"):
        try:
            last_computed_at = datetime.fromisoformat(metadata["last_computed_at"])
        except (ValueError, TypeError):
            pass
    
    return UnpivotMetadataResponse(
        atom_id=metadata["atom_id"],
        project_id=metadata["project_id"],
        workflow_id=metadata["workflow_id"],
        atom_name=metadata["atom_name"],
        dataset_path=metadata["dataset_path"],
        id_vars=metadata.get("id_vars", []),
        value_vars=metadata.get("value_vars", []),
        variable_column_name=metadata.get("variable_column_name", "variable"),
        value_column_name=metadata.get("value_column_name", "value"),
        pre_filters=metadata.get("pre_filters", []),
        post_filters=metadata.get("post_filters", []),
        auto_refresh=metadata.get("auto_refresh", True),
        created_at=created_at,
        updated_at=updated_at,
        last_computed_at=last_computed_at,
    )


async def update_unpivot_properties(atom_id: str, payload: UnpivotPropertiesUpdate) -> UnpivotMetadataResponse:
    """Update properties of an unpivot atom."""
    metadata = _load_metadata(atom_id)
    if not metadata:
        raise HTTPException(status_code=404, detail=f"Unpivot atom '{atom_id}' not found")
    
    # Update metadata with provided values
    if payload.id_vars is not None:
        metadata["id_vars"] = payload.id_vars
    if payload.value_vars is not None:
        metadata["value_vars"] = payload.value_vars
    if payload.variable_column_name is not None:
        metadata["variable_column_name"] = payload.variable_column_name
    if payload.value_column_name is not None:
        metadata["value_column_name"] = payload.value_column_name
    if payload.pre_filters is not None:
        metadata["pre_filters"] = [f.dict() for f in payload.pre_filters]
    if payload.post_filters is not None:
        metadata["post_filters"] = [f.dict() for f in payload.post_filters]
    if payload.auto_refresh is not None:
        metadata["auto_refresh"] = payload.auto_refresh
    
    metadata["updated_at"] = datetime.now(timezone.utc).isoformat()
    
    _store_metadata(atom_id, metadata)
    
    # If auto_refresh is enabled, trigger computation
    if metadata.get("auto_refresh", True):
        try:
            await compute_unpivot(atom_id, UnpivotComputeRequest(force_recompute=True))
        except Exception as e:
            logger.warning("Auto-refresh failed for atom %s: %s", atom_id, e)
    
    return await get_unpivot_metadata(atom_id)


async def compute_unpivot(atom_id: str, payload: UnpivotComputeRequest) -> UnpivotComputeResponse:
    """Compute unpivot transformation."""
    logger.info("Computing unpivot for atom: %s", atom_id)
    
    start_time = time.time()
    
    # Load metadata
    metadata = _load_metadata(atom_id)
    if not metadata:
        raise HTTPException(status_code=404, detail=f"Unpivot atom '{atom_id}' not found")
    
    # Check cache if not forcing recompute
    if not payload.force_recompute:
        cached = await _load_result(atom_id)
        if cached:
            logger.info("Returning cached result for atom: %s", atom_id)
            updated_at = datetime.fromisoformat(cached["updated_at"]) if isinstance(cached.get("updated_at"), str) else datetime.now(timezone.utc)
            return UnpivotComputeResponse(
                atom_id=atom_id,
                status="success",
                updated_at=updated_at,
                row_count=cached.get("row_count", 0),
                dataframe=cached.get("dataframe", []),
                summary=cached.get("summary", {}),
                computation_time=cached.get("computation_time", 0.0),
            )
    
    # Load dataset
    try:
        resolved_path = await resolve_object_path(metadata["dataset_path"])
        df = download_dataframe(resolved_path)
    except HTTPException:
        raise
    except Exception as exc:
        logger.exception("Failed to load dataframe for atom %s", atom_id)
        raise HTTPException(status_code=500, detail=f"Unable to load dataset: {exc}")
    
    if df.empty:
        raise HTTPException(status_code=400, detail="Dataset is empty")
    
    # Apply pre-filters
    pre_filters = metadata.get("pre_filters", [])
    filtered_df = apply_filters(df, pre_filters)
    
    if filtered_df.empty:
        raise HTTPException(status_code=400, detail="No rows remain after applying pre-filters")
    
    # Resolve column names
    id_vars = resolve_columns(filtered_df, metadata.get("id_vars", []))
    value_vars = resolve_columns(filtered_df, metadata.get("value_vars", []))
    
    # Validate configuration
    is_valid, errors, warnings = validate_unpivot_config(filtered_df, id_vars, value_vars)
    if not is_valid:
        raise HTTPException(status_code=400, detail=f"Invalid configuration: {', '.join(errors)}")
    
    # Perform unpivot
    try:
        if not id_vars:
            # If no id_vars, create a row number column to use as identifier
            # This ensures we can unpivot all columns while maintaining row identity
            filtered_df = filtered_df.copy()
            if "row_number" not in filtered_df.columns:
                filtered_df.insert(0, "row_number", range(len(filtered_df)))
                id_vars = ["row_number"]
            else:
                # If row_number already exists, use index
                filtered_df = filtered_df.reset_index()
                id_vars = ["index"]
        
        if not value_vars:
            # If no value_vars specified, use all columns not in id_vars
            value_vars = [col for col in filtered_df.columns if col not in id_vars]
            if not value_vars:
                raise HTTPException(
                    status_code=400,
                    detail="No columns available to unpivot. All columns are in id_vars."
                )
        
        # Perform melt (unpivot)
        variable_col = metadata.get("variable_column_name", "variable")
        value_col = metadata.get("value_column_name", "value")
        
        unpivoted_df = pd.melt(
            filtered_df,
            id_vars=id_vars,
            value_vars=value_vars,
            var_name=variable_col,
            value_name=value_col,
        )
        
    except Exception as exc:
        logger.exception("Unpivot computation failed for atom %s", atom_id)
        raise HTTPException(status_code=400, detail=f"Unpivot computation failed: {exc}")
    
    # Apply post-filters
    post_filters = metadata.get("post_filters", [])
    unpivoted_df = apply_filters(unpivoted_df, post_filters)
    
    # Convert to records (needed for API response and storage decision)
    records = [convert_numpy(record) for record in unpivoted_df.to_dict(orient="records")]
    
    # Generate summary
    summary = {
        "original_rows": len(filtered_df),
        "original_columns": len(filtered_df.columns),
        "unpivoted_rows": len(unpivoted_df),
        "unpivoted_columns": len(unpivoted_df.columns),
        "id_vars_count": len(id_vars),
        "value_vars_count": len(value_vars),
    }
    
    computation_time = time.time() - start_time
    
    # Store result
    result = {
        "atom_id": atom_id,
        "status": "success",
        "updated_at": datetime.now(timezone.utc).isoformat(),
        "row_count": len(records),
        "dataframe": records,
        "summary": summary,
        "computation_time": computation_time,
    }
    
    await _store_result(atom_id, result)
    
    # Update metadata with last computed time
    metadata["last_computed_at"] = datetime.now(timezone.utc).isoformat()
    _store_metadata(atom_id, metadata)
    
    logger.info("Computed unpivot for atom %s: %d rows in %.2f seconds", atom_id, len(records), computation_time)
    
    return UnpivotComputeResponse(
        atom_id=atom_id,
        status="success",
        updated_at=datetime.now(timezone.utc),
        row_count=len(records),
        dataframe=records,
        summary=summary,
        computation_time=computation_time,
    )


async def get_unpivot_result(atom_id: str) -> UnpivotResultResponse:
    """Get stored unpivot result."""
    result = await _load_result(atom_id)
    if not result:
        raise HTTPException(status_code=404, detail="Unpivot result not found. Please compute first.")
    
    updated_at = datetime.fromisoformat(result["updated_at"]) if isinstance(result.get("updated_at"), str) else datetime.now(timezone.utc)
    
    return UnpivotResultResponse(
        atom_id=atom_id,
        status=result.get("status", "success"),
        updated_at=updated_at,
        row_count=result.get("row_count", 0),
        dataframe=result.get("dataframe", []),
        summary=result.get("summary", {}),
    )


async def validate_unpivot_configuration(payload: UnpivotValidateRequest) -> UnpivotValidateResponse:
    """Validate unpivot configuration."""
    try:
        resolved_path = await resolve_object_path(payload.dataset_path)
        df = download_dataframe(resolved_path)
    except Exception as exc:
        return UnpivotValidateResponse(
            valid=False,
            errors=[f"Failed to load dataset: {exc}"],
        )
    
    if df.empty:
        return UnpivotValidateResponse(
            valid=False,
            errors=["Dataset is empty"],
        )
    
    # Resolve column names
    id_vars = resolve_columns(df, payload.id_vars)
    value_vars = resolve_columns(df, payload.value_vars)
    
    # Validate
    is_valid, errors, warnings = validate_unpivot_config(df, id_vars, value_vars)
    
    column_info = {
        "total_columns": len(df.columns),
        "id_vars_resolved": id_vars,
        "value_vars_resolved": value_vars,
    }
    
    return UnpivotValidateResponse(
        valid=is_valid,
        errors=errors,
        warnings=warnings,
        column_info=column_info,
    )


async def get_dataset_schema(payload: DatasetSchemaRequest) -> DatasetSchemaResponse:
    """Get dataset schema information."""
    try:
        resolved_path = await resolve_object_path(payload.dataset_path)
        df = download_dataframe(resolved_path)
    except Exception as exc:
        raise HTTPException(status_code=500, detail=f"Failed to load dataset: {exc}")
    
    schema_info = get_dataset_schema_info(df)
    
    return DatasetSchemaResponse(
        columns=schema_info["columns"],
        dtypes=schema_info["dtypes"],
        null_stats=schema_info["null_stats"],
        row_count=schema_info["row_count"],
        id_vars_candidates=schema_info["id_vars_candidates"],
        value_vars_candidates=schema_info["value_vars_candidates"],
    )


async def save_unpivot_result(atom_id: str, payload: UnpivotSaveRequest) -> UnpivotSaveResponse:
    """Save unpivot result directly to MinIO, bypassing cache updates.
    
    Tries to load from cache/MinIO first. If not available, recomputes from source.
    Does not update cache when saving.
    """
    logger.info("Saving unpivot result directly to MinIO for atom: %s", atom_id)
    
    # Try to load from cache/MinIO first (more efficient)
    result = await _load_result(atom_id)
    df = None
    
    if result:
        records = result.get("dataframe", [])
        
        # If result is stored in MinIO (especially if it's a preview), load full data from MinIO
        if result.get("stored_in_minio") or result.get("is_preview"):
            metadata = _load_metadata(atom_id) or {}
            minio_path = metadata.get("cached_result_path") or result.get("full_data_path")
            
            if minio_path:
                try:
                    # Load full data from MinIO
                    resolved_path = await resolve_object_path(minio_path)
                    df = download_dataframe(resolved_path)
                    logger.info("Loaded full data from MinIO cache for saving: %s", minio_path)
                except Exception as e:
                    logger.warning("Failed to load from MinIO cache, will recompute: %s", e)
        
        # If we have records and no dataframe yet, convert records to dataframe
        if df is None and records:
            df = pd.DataFrame(records)
            logger.info("Using cached result for saving (converted from records)")
    
    # If no cached result available, recompute from source
    if df is None or df.empty:
        logger.info("No cached result available, recomputing from source for atom: %s", atom_id)
        
        # Load metadata to get configuration
        metadata = _load_metadata(atom_id)
        if not metadata:
            raise HTTPException(status_code=404, detail=f"Unpivot atom '{atom_id}' not found")
        
        # Load dataset directly from source
        try:
            resolved_path = await resolve_object_path(metadata["dataset_path"])
            source_df = download_dataframe(resolved_path)
        except HTTPException:
            raise
        except Exception as exc:
            logger.exception("Failed to load dataframe for saving atom %s", atom_id)
            raise HTTPException(status_code=500, detail=f"Unable to load dataset: {exc}")
        
        if source_df.empty:
            raise HTTPException(status_code=400, detail="Dataset is empty")
        
        # Apply pre-filters
        pre_filters = metadata.get("pre_filters", [])
        filtered_df = apply_filters(source_df, pre_filters)
        
        if filtered_df.empty:
            raise HTTPException(status_code=400, detail="No rows remain after applying pre-filters")
        
        # Resolve column names
        id_vars = resolve_columns(filtered_df, metadata.get("id_vars", []))
        value_vars = resolve_columns(filtered_df, metadata.get("value_vars", []))
        
        # Validate configuration
        is_valid, errors, warnings = validate_unpivot_config(filtered_df, id_vars, value_vars)
        if not is_valid:
            raise HTTPException(status_code=400, detail=f"Invalid configuration: {', '.join(errors)}")
        
        # Perform unpivot directly
        try:
            if not id_vars:
                # If no id_vars, create a row number column to use as identifier
                filtered_df = filtered_df.copy()
                if "row_number" not in filtered_df.columns:
                    filtered_df.insert(0, "row_number", range(len(filtered_df)))
                    id_vars = ["row_number"]
                else:
                    filtered_df = filtered_df.reset_index()
                    id_vars = ["index"]
            
            if not value_vars:
                # If no value_vars specified, use all columns not in id_vars
                value_vars = [col for col in filtered_df.columns if col not in id_vars]
                if not value_vars:
                    raise HTTPException(
                        status_code=400,
                        detail="No columns available to unpivot. All columns are in id_vars."
                    )
            
            # Perform melt (unpivot)
            variable_col = metadata.get("variable_column_name", "variable")
            value_col = metadata.get("value_column_name", "value")
            
            unpivoted_df = pd.melt(
                filtered_df,
                id_vars=id_vars,
                value_vars=value_vars,
                var_name=variable_col,
                value_name=value_col,
            )
            
        except Exception as exc:
            logger.exception("Unpivot computation failed for saving atom %s", atom_id)
            raise HTTPException(status_code=400, detail=f"Unpivot computation failed: {exc}")
        
        # Apply post-filters
        post_filters = metadata.get("post_filters", [])
        unpivoted_df = apply_filters(unpivoted_df, post_filters)
        
        if unpivoted_df.empty:
            raise HTTPException(status_code=400, detail="No rows remain after applying post-filters")
        
        df = unpivoted_df
    
    if df is None or df.empty:
        raise HTTPException(status_code=400, detail="Cannot save empty unpivot results")
    
    timestamp = datetime.now(timezone.utc)
    
    # Load metadata for filename and path info
    metadata = _load_metadata(atom_id) or {}
    
    prefix = await get_object_prefix()
    if isinstance(prefix, tuple):
        prefix = prefix[0]
    if not prefix.endswith("/"):
        prefix = f"{prefix}/"
    
    object_prefix = f"{prefix}unpivot/"
    
    # Determine filename: use provided filename for save_as, or standard filename for save (always overwrites)
    
    if payload.filename:
        # Save As: create new file with provided filename
        file_name = payload.filename.strip()
        if not file_name.endswith(('.arrow', '.parquet', '.csv')):
            # Add extension based on format
            if payload.format.lower() == "csv":
                file_name = f"{file_name}.csv"
            else:
                file_name = f"{file_name}.arrow"
    else:
        # Save: always use the same filename (creates or overwrites)
        atom_name = metadata.get("atom_name", "unpivot")
        safe_name = "".join(c if c.isalnum() or c in ('-', '_') else '_' for c in atom_name)
        file_name = f"{safe_name}_{atom_id[:8]}.arrow"
    
    if payload.format.lower() == "parquet":
        # Convert to parquet bytes
        table = pa.Table.from_pandas(df)
        sink = pa.BufferOutputStream()
        with ipc.new_file(sink, table.schema) as writer:
            writer.write_table(table)
        file_bytes = sink.getvalue().to_pybytes()
    elif payload.format.lower() == "csv":
        # Convert to CSV bytes
        file_bytes = df.to_csv(index=False).encode("utf-8")
    else:
        # Default to arrow
        table = pa.Table.from_pandas(df)
        sink = pa.BufferOutputStream()
        with ipc.new_file(sink, table.schema) as writer:
            writer.write_table(table)
        file_bytes = sink.getvalue().to_pybytes()
    
    ensure_minio_bucket()
    upload_result = upload_to_minio(file_bytes, file_name, object_prefix)
    
    if upload_result.get("status") != "success":
        raise HTTPException(
            status_code=500,
            detail=upload_result.get("error_message", "Failed to store unpivot result"),
        )
    
    minio_path = upload_result["object_name"]
    
    # Update metadata with saved path (but don't update cache)
    metadata["last_saved_path"] = minio_path
    metadata["last_saved_at"] = timestamp.isoformat()
    _store_metadata(atom_id, metadata)
    
    logger.info("Saved unpivot result directly to MinIO for atom %s: %s (bypassed cache)", atom_id, minio_path)
    
    return UnpivotSaveResponse(
        atom_id=atom_id,
        minio_path=minio_path,
        updated_at=timestamp,
        row_count=len(df),
    )


async def handle_dataset_updated(atom_id: str, payload: UnpivotDatasetUpdatedRequest) -> UnpivotComputeResponse:
    """Handle dataset update event (triggers auto-refresh)."""
    metadata = _load_metadata(atom_id)
    if not metadata:
        raise HTTPException(status_code=404, detail=f"Unpivot atom '{atom_id}' not found")
    
    # Update dataset path if provided
    if payload.dataset_path:
        metadata["dataset_path"] = payload.dataset_path
        metadata["updated_at"] = datetime.now(timezone.utc).isoformat()
        _store_metadata(atom_id, metadata)
    
    # Auto-compute with current config
    return await compute_unpivot(atom_id, UnpivotComputeRequest(force_recompute=True))


async def autosave_atom_state(atom_id: str) -> UnpivotAutosaveResponse:
    """Auto-save atom state snapshot."""
    metadata = _load_metadata(atom_id)
    if not metadata:
        raise HTTPException(status_code=404, detail=f"Unpivot atom '{atom_id}' not found")
    
    # Save current state as snapshot
    snapshot = {
        "metadata": metadata,
        "config": _load_config(atom_id),
        "saved_at": datetime.now(timezone.utc).isoformat(),
    }
    
    # Store snapshot in Redis with longer TTL
    snapshot_key = f"{atom_id}_snapshot_{int(time.time())}"
    redis_client.setex((snapshot_key, "snapshot"), UNPIVOT_CACHE_TTL * 24, _ensure_redis_json(snapshot))
    
    return UnpivotAutosaveResponse(
        atom_id=atom_id,
        status="success",
        saved_at=datetime.now(timezone.utc),
        snapshot_path=snapshot_key,
    )


async def get_cached_result(atom_id: str) -> UnpivotCacheResponse:
    """Get cached unpivot result."""
    result = await _load_result(atom_id)
    if not result:
        raise HTTPException(status_code=404, detail="No cached result found")
    
    updated_at = datetime.fromisoformat(result["updated_at"]) if isinstance(result.get("updated_at"), str) else datetime.now(timezone.utc)
    
    return UnpivotCacheResponse(
        atom_id=atom_id,
        status=result.get("status", "success"),
        updated_at=updated_at,
        row_count=result.get("row_count", 0),
        dataframe=result.get("dataframe", []),
        summary=result.get("summary", {}),
    )


async def delete_unpivot_atom(atom_id: str) -> Dict[str, Any]:
    """Delete an unpivot atom and its cached data."""
    metadata = _load_metadata(atom_id)
    if not metadata:
        raise HTTPException(status_code=404, detail=f"Unpivot atom '{atom_id}' not found")
    
    # Delete all cached data
    try:
        redis_client.delete((atom_id, "metadata"))
        redis_client.delete((atom_id, "result"))
        redis_client.delete((atom_id, "config"))
    except Exception as e:
        logger.warning("Error deleting cache for atom %s: %s", atom_id, e)
    
    logger.info("Deleted unpivot atom: %s", atom_id)
    
    return {"status": "success", "atom_id": atom_id, "message": "Atom deleted successfully"}

