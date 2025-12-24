from __future__ import annotations

import json
import logging
import re
import time
import uuid
from datetime import datetime, timezone
from typing import Any, Dict, List, Optional, Tuple

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
    VariableDecoderConfig,
    VariableDecoderMapping,
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


def load_dataframe_in_chunks_from_source(resolved_path: str):
    """
    Generator that yields chunks of a dataframe loaded directly from source.
    
    Uses Arrow Flight reader iteration if available, otherwise falls back to
    Arrow IPC RecordBatchFileReader from MinIO.
    """
    import pyarrow.flight as flight
    from app.DataStorageRetrieval.arrow_client import _get_client, get_arrow_for_flight_path, get_minio_prefix, _find_latest_object
    from minio import Minio
    import os
    
    # Try Arrow Flight first (supports streaming)
    try:
        client = _get_client()
        descriptor = flight.FlightDescriptor.for_path(resolved_path)
        info = client.get_flight_info(descriptor)
        reader = client.do_get(info.endpoints[0].ticket)
        
        # Iterate over Flight stream chunks
        for chunk in reader:
            batch = chunk.data
            df_chunk = batch.to_pandas()
            yield df_chunk
        return
    except Exception as flight_error:
        logger.debug("Arrow Flight streaming failed, falling back to MinIO: %s", flight_error)
    
    # Fallback: Load from MinIO using Arrow IPC batch reader
    try:
        arrow_obj = get_arrow_for_flight_path(resolved_path)
        if not arrow_obj:
            # Try to resolve path
            basename = os.path.basename(resolved_path)
            default_prefix = get_minio_prefix()
            
            endpoint = os.getenv("MINIO_ENDPOINT", "minio:9000")
            access_key = os.getenv("MINIO_ACCESS_KEY", "admin_dev")
            secret_key = os.getenv("MINIO_SECRET_KEY", "pass_dev")
            bucket = os.getenv("MINIO_BUCKET", "trinity")
            
            m_client = Minio(endpoint, access_key=access_key, secret_key=secret_key, secure=False)
            arrow_obj = _find_latest_object(basename + ".arrow", m_client, bucket, default_prefix) or os.path.join(default_prefix, basename)
        else:
            endpoint = os.getenv("MINIO_ENDPOINT", "minio:9000")
            access_key = os.getenv("MINIO_ACCESS_KEY", "admin_dev")
            secret_key = os.getenv("MINIO_SECRET_KEY", "pass_dev")
            bucket = os.getenv("MINIO_BUCKET", "trinity")
            m_client = Minio(endpoint, access_key=access_key, secret_key=secret_key, secure=False)
        
        resp = m_client.get_object(bucket, arrow_obj)
        data = resp.read()
        resp.close()
        resp.release_conn()
        
        # Read Arrow file in batches
        reader = ipc.RecordBatchFileReader(pa.BufferReader(data))
        
        # Read batches incrementally
        for i in range(reader.num_record_batches):
            batch = reader.get_batch(i)
            df_chunk = batch.to_pandas()
            yield df_chunk
    except Exception as minio_error:
        logger.error("Failed to load chunks from MinIO: %s", minio_error)
        raise HTTPException(status_code=500, detail=f"Unable to load dataset in chunks: {minio_error}")


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


async def stream_full_unpivot_to_minio(
    atom_id: str,
    resolved_path: str,
    id_vars: list[str],
    value_vars: list[str],
    variable_col: str,
    value_col: str,
) -> tuple[str, int]:
    """
    Stream full unpivot result to MinIO using chunked processing from source.
    
    Loads data in chunks directly from source, unpivots each chunk, and streams
    results incrementally to Arrow format, then uploads to MinIO.
    
    Returns:
        tuple: (minio_path, row_count)
    """
    row_count = 0
    total_original_rows = 0
    
    # Initialize Arrow stream writer
    sink = pa.BufferOutputStream()
    writer = None
    schema = None
    
    # Load and process chunks from source
    for source_chunk in load_dataframe_in_chunks_from_source(resolved_path):
        total_original_rows += len(source_chunk)
        
        # Handle no id_vars case
        chunk_id_vars = id_vars.copy() if id_vars else []
        chunk_value_vars = value_vars.copy() if value_vars else []
        
        if not chunk_id_vars:
            source_chunk = source_chunk.copy()
            if "row_number" not in source_chunk.columns:
                source_chunk.insert(0, "row_number", range(len(source_chunk)))
                chunk_id_vars = ["row_number"]
            else:
                source_chunk = source_chunk.reset_index()
                chunk_id_vars = ["index"]
        
        if not chunk_value_vars:
            chunk_value_vars = [col for col in source_chunk.columns if col not in chunk_id_vars]
            if not chunk_value_vars:
                raise HTTPException(
                    status_code=400,
                    detail="No columns available to unpivot. All columns are in id_vars."
                )
        
        # Unpivot chunk
        melted_chunk = pd.melt(
            source_chunk,
            id_vars=chunk_id_vars,
            value_vars=chunk_value_vars,
            var_name=variable_col,
            value_name=value_col,
        )
        
        if melted_chunk.empty:
            continue
        
        # Convert to Arrow table
        table = pa.Table.from_pandas(melted_chunk)
        
        # Initialize writer on first chunk
        if writer is None:
            schema = table.schema
            writer = ipc.new_stream(sink, schema)
        
        # Write chunk to stream
        writer.write_table(table)
        row_count += len(melted_chunk)
    
    # Close writer
    if writer:
        writer.close()
    
    # Get bytes and upload to MinIO
    file_bytes = sink.getvalue().to_pybytes()
    
    # Get object prefix
    prefix = await get_object_prefix()
    if isinstance(prefix, tuple):
        prefix = prefix[0]
    if not prefix.endswith("/"):
        prefix = f"{prefix}/"
    
    object_prefix = f"{prefix}unpivot/"
    file_name = f"{atom_id}_full_result.arrow"
    
    # Upload to MinIO
    ensure_minio_bucket()
    upload_result = upload_to_minio(file_bytes, file_name, object_prefix)
    
    if upload_result.get("status") != "success":
        raise HTTPException(
            status_code=500,
            detail=upload_result.get("error_message", "Failed to upload unpivot result to MinIO"),
        )
    
    minio_path = upload_result["object_name"]
    logger.info("Streamed full unpivot result to MinIO: %s (%d rows from %d original rows)", minio_path, row_count, total_original_rows)
    
    return minio_path, row_count


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
        variable_decoder=metadata.get("variable_decoder"),
        created_at=created_at,
        updated_at=updated_at,
        last_computed_at=last_computed_at,
    )


def _validate_decoder_config(df: pd.DataFrame, variable_col: str, config: VariableDecoderConfig) -> Tuple[bool, List[str]]:
    """Validate variable decoder configuration."""
    errors = []
    
    if not config.enabled:
        return True, []
    
    if not config.mappings:
        errors.append("Decoder enabled but no mappings configured")
        return False, errors
    
    # Check for duplicate output column names
    output_columns = [m.column for m in config.mappings]
    if len(output_columns) != len(set(output_columns)):
        errors.append("Duplicate output column names in mappings")
    
    # Check for column name conflicts with existing columns
    existing_columns = set(df.columns)
    for mapping in config.mappings:
        if mapping.column in existing_columns:
            errors.append(f"Output column '{mapping.column}' conflicts with existing column")
    
    if config.type == "delimiter":
        if not config.delimiter:
            errors.append("Delimiter type requires delimiter to be specified")
        else:
            # For delimiter, check if indices are reasonable (we'll check against actual data during execution)
            max_index = max([m.index for m in config.mappings], default=-1)
            if max_index < 0:
                errors.append("No valid mapping indices found")
    
    elif config.type == "regex":
        if not config.regex:
            errors.append("Regex type requires regex pattern to be specified")
        else:
            # Validate regex pattern
            try:
                pattern = re.compile(config.regex)
                # Check if pattern has named groups (for regex mode)
                if not pattern.groupindex:
                    errors.append("Regex pattern must contain named capture groups")
            except re.error as e:
                errors.append(f"Invalid regex pattern: {str(e)}")
    
    return len(errors) == 0, errors


def _apply_delimiter_decoder(df: pd.DataFrame, variable_col: str, config: VariableDecoderConfig) -> Tuple[pd.DataFrame, Dict[str, Any]]:
    """Apply delimiter-based decoder to split variable column into dimensions."""
    if variable_col not in df.columns:
        logger.warning("Variable column '%s' not found in dataframe", variable_col)
        return df, {"matched_rows": 0, "failed_rows": len(df), "match_rate": 0.0}
    
    # Normalize delimiter
    delimiter_map = {
        "space": " ",
        "underscore": "_",
        "hyphen": "-",
    }
    delimiter = delimiter_map.get(config.delimiter, config.delimiter) if config.delimiter else None
    
    if not delimiter:
        logger.warning("No delimiter specified for delimiter decoder")
        return df, {"matched_rows": 0, "failed_rows": len(df), "match_rate": 0.0}
    
    result_df = df.copy()
    matched_count = 0
    failed_count = 0
    
    # Initialize new columns with None
    for mapping in config.mappings:
        result_df[mapping.column] = None
    
    # Process each row
    for idx, row in result_df.iterrows():
        variable_value = str(row[variable_col]) if pd.notna(row[variable_col]) else ""
        
        if not variable_value:
            failed_count += 1
            continue
        
        # Split by delimiter
        segments = variable_value.split(delimiter)
        
        # Extract segments based on mappings
        all_matched = True
        for mapping in config.mappings:
            segment_index = mapping.index
            if segment_index < len(segments):
                segment_value = segments[segment_index].strip()
                
                # Convert dtype
                if mapping.dtype == "int":
                    try:
                        segment_value = int(segment_value)
                    except (ValueError, TypeError):
                        segment_value = None
                        all_matched = False
                elif mapping.dtype == "category":
                    segment_value = str(segment_value) if segment_value else None
                else:  # string
                    segment_value = str(segment_value) if segment_value else None
                
                result_df.at[idx, mapping.column] = segment_value
            else:
                result_df.at[idx, mapping.column] = None
                all_matched = False
        
        if all_matched and len(segments) >= max([m.index for m in config.mappings], default=-1) + 1:
            matched_count += 1
        else:
            failed_count += 1
    
    match_rate = (matched_count / len(result_df)) * 100.0 if len(result_df) > 0 else 0.0
    
    stats = {
        "matched_rows": matched_count,
        "failed_rows": failed_count,
        "match_rate": match_rate
    }
    
    logger.info("Delimiter decoder applied: %d matched, %d failed (%.2f%%)", matched_count, failed_count, match_rate)
    
    return result_df, stats


def _apply_regex_decoder(df: pd.DataFrame, variable_col: str, config: VariableDecoderConfig) -> Tuple[pd.DataFrame, Dict[str, Any]]:
    """Apply regex-based decoder to extract dimensions from variable column."""
    if variable_col not in df.columns:
        logger.warning("Variable column '%s' not found in dataframe", variable_col)
        return df, {"matched_rows": 0, "failed_rows": len(df), "match_rate": 0.0}
    
    if not config.regex:
        logger.warning("No regex pattern specified for regex decoder")
        return df, {"matched_rows": 0, "failed_rows": len(df), "match_rate": 0.0}
    
    try:
        pattern = re.compile(config.regex)
    except re.error as e:
        logger.error("Invalid regex pattern: %s", e)
        return df, {"matched_rows": 0, "failed_rows": len(df), "match_rate": 0.0}
    
    result_df = df.copy()
    matched_count = 0
    failed_count = 0
    
    # Initialize new columns with None
    for mapping in config.mappings:
        result_df[mapping.column] = None
    
    # Create mapping from column name to group name (for regex named groups)
    # For regex, we'll use the mapping's column name to find the corresponding group
    # The regex pattern should have named groups matching the column names
    group_to_column = {}
    for mapping in config.mappings:
        # Try to find a group with the same name as the column, or use index
        # For simplicity, we'll assume the regex has named groups matching column names
        group_to_column[mapping.column] = mapping
    
    # Process each row
    for idx, row in result_df.iterrows():
        variable_value = str(row[variable_col]) if pd.notna(row[variable_col]) else ""
        
        if not variable_value:
            failed_count += 1
            continue
        
        # Apply regex
        match = pattern.search(variable_value)
        
        if match:
            # Extract groups
            groups = match.groupdict()
            
            # Map groups to columns
            all_matched = True
            for mapping in config.mappings:
                # Try to find group by column name first, then by index
                group_value = None
                
                # Check if there's a named group matching the column name
                if mapping.column in groups:
                    group_value = groups[mapping.column]
                elif str(mapping.index) in groups:
                    group_value = groups[str(mapping.index)]
                elif mapping.index < len(match.groups()):
                    group_value = match.group(mapping.index + 1)  # +1 because group(0) is full match
                
                if group_value is not None:
                    # Convert dtype
                    if mapping.dtype == "int":
                        try:
                            group_value = int(group_value)
                        except (ValueError, TypeError):
                            group_value = None
                            all_matched = False
                    elif mapping.dtype == "category":
                        group_value = str(group_value) if group_value else None
                    else:  # string
                        group_value = str(group_value) if group_value else None
                    
                    result_df.at[idx, mapping.column] = group_value
                else:
                    result_df.at[idx, mapping.column] = None
                    all_matched = False
            
            if all_matched:
                matched_count += 1
            else:
                failed_count += 1
        else:
            failed_count += 1
    
    match_rate = (matched_count / len(result_df)) * 100.0 if len(result_df) > 0 else 0.0
    
    stats = {
        "matched_rows": matched_count,
        "failed_rows": failed_count,
        "match_rate": match_rate
    }
    
    logger.info("Regex decoder applied: %d matched, %d failed (%.2f%%)", matched_count, failed_count, match_rate)
    
    return result_df, stats


async def update_unpivot_properties(atom_id: str, payload: UnpivotPropertiesUpdate) -> UnpivotMetadataResponse:
    """Update properties of an unpivot atom."""
    logger.info("update_unpivot_properties START atom_id=%s auto_refresh=%s", atom_id, payload.auto_refresh)
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
    
    # Handle variable_decoder
    if payload.variable_decoder is not None:
        # Validate decoder config if enabled
        if payload.variable_decoder.enabled:
            # We need to validate against the dataframe, but we don't have it here
            # So we'll do basic validation and defer full validation to compute time
            if not payload.variable_decoder.mappings:
                raise HTTPException(
                    status_code=400,
                    detail="Variable decoder enabled but no mappings configured"
                )
        
        metadata["variable_decoder"] = payload.variable_decoder.dict() if payload.variable_decoder else None
    
    metadata["updated_at"] = datetime.now(timezone.utc).isoformat()
    
    _store_metadata(atom_id, metadata)
    
    # If auto_refresh is enabled, trigger computation via Celery
    if metadata.get("auto_refresh", True):
        try:
            # Import here to avoid circular dependency
            from app.features.unpivot.task_service import submit_compute_task
            
            logger.info("Auto-refresh enabled, submitting compute task atom_id=%s", atom_id)
            
            # Submit task to Celery (fire and forget - don't await)
            submission = submit_compute_task(
                atom_id=atom_id,
                force_recompute=True,
                preview_limit=None,
            )
            
            logger.info(
                "Auto-refresh submitted compute task atom_id=%s task_id=%s status=%s has_result=%s",
                atom_id,
                submission.task_id,
                submission.status,
                submission.result is not None,
            )
            
            # Log result if available (eager execution)
            if submission.result is not None:
                result = submission.result
                if isinstance(result, dict):
                    logger.info(
                        "Auto-refresh task completed atom_id=%s status=%s row_count=%d",
                        atom_id,
                        result.get("status", "unknown"),
                        result.get("row_count", 0),
                    )
                else:
                    logger.info("Auto-refresh task result type=%s", type(result).__name__)
        except Exception as e:
            logger.exception("Auto-refresh task submission failed for atom %s", atom_id)
            logger.warning("Auto-refresh task submission failed for atom %s: %s", atom_id, e)
    
    return await get_unpivot_metadata(atom_id)


async def compute_unpivot(atom_id: str, payload: UnpivotComputeRequest) -> UnpivotComputeResponse:
    """Compute unpivot transformation."""
    logger.info("Computing unpivot for atom: %s", atom_id)
    
    start_time = time.time()
    
    # Load metadata
    metadata = _load_metadata(atom_id)
    if not metadata:
        raise HTTPException(status_code=404, detail=f"Unpivot atom '{atom_id}' not found")
    
    # Check cache if not forcing recompute and not in preview mode
    # Preview mode always computes fresh (no cache)
    if not payload.force_recompute and not (payload.preview_limit and payload.preview_limit > 0):
        cached = await _load_result(atom_id)
        if cached:
            logger.info("Returning cached result for atom: %s", atom_id)
            updated_at = datetime.fromisoformat(cached["updated_at"]) if isinstance(cached.get("updated_at"), str) else datetime.now(timezone.utc)
            
            # Cached result already contains preview data if it was large
            # The dataframe field will be preview (1000 rows) for very large results,
            # or full data for small results
            dataframe = cached.get("dataframe", [])
            
            return UnpivotComputeResponse(
                atom_id=atom_id,
                status="success",
                updated_at=updated_at,
                row_count=cached.get("row_count", 0),  # Total count (may be larger than dataframe length)
                dataframe=dataframe,  # Preview or full based on cache
                summary=cached.get("summary", {}),
                computation_time=cached.get("computation_time", 0.0),
            )
    
    # Resolve dataset path
    try:
        resolved_path = await resolve_object_path(metadata["dataset_path"])
    except HTTPException:
        raise
    except Exception as exc:
        logger.exception("Failed to resolve dataset path for atom %s", atom_id)
        raise HTTPException(status_code=500, detail=f"Unable to resolve dataset path: {exc}")
    
    # Safety guard: Force preview-only for very large datasets
    # Estimate based on dataset info if available, otherwise force preview
    if not (payload.preview_limit and payload.preview_limit > 0):
        # Try to get row count estimate from Flight info
        try:
            from app.DataStorageRetrieval.arrow_client import _get_client
            import pyarrow.flight as flight
            client = _get_client()
            descriptor = flight.FlightDescriptor.for_path(resolved_path)
            info = client.get_flight_info(descriptor)
            estimated_rows = info.total_records
            if estimated_rows > 5_000_000:
                logger.warning("Large dataset detected (%d rows), forcing preview mode", estimated_rows)
                payload.preview_limit = 1000
        except Exception:
            # If we can't get estimate, default to preview for safety
            logger.warning("Cannot estimate dataset size, defaulting to preview mode")
            payload.preview_limit = 1000
    
    # PREVIEW MODE: Load and process only first chunk(s) until we have enough rows
    if payload.preview_limit and payload.preview_limit > 0:
        PREVIEW_LIMIT = payload.preview_limit
        
        preview_records = []
        total_unpivoted_rows = 0
        total_original_rows = 0
        chunk_id_vars = None
        chunk_value_vars = None
        
        # Load and process chunks from source
        for source_chunk in load_dataframe_in_chunks_from_source(resolved_path):
            total_original_rows += len(source_chunk)
            
            # Resolve column names for this chunk
            chunk_id_vars = resolve_columns(source_chunk, metadata.get("id_vars", []))
            chunk_value_vars = resolve_columns(source_chunk, metadata.get("value_vars", []))
            
            # Handle no id_vars case
            if not chunk_id_vars:
                source_chunk = source_chunk.copy()
                if "row_number" not in source_chunk.columns:
                    source_chunk.insert(0, "row_number", range(len(source_chunk)))
                    chunk_id_vars = ["row_number"]
                else:
                    source_chunk = source_chunk.reset_index()
                    chunk_id_vars = ["index"]
            
            # Handle no value_vars case
            if not chunk_value_vars:
                chunk_value_vars = [col for col in source_chunk.columns if col not in chunk_id_vars]
                if not chunk_value_vars:
                    raise HTTPException(
                        status_code=400,
                        detail="No columns available to unpivot. All columns are in id_vars."
                    )
            
            # Validate configuration (only on first chunk)
            if total_original_rows == len(source_chunk):
                is_valid, errors, warnings = validate_unpivot_config(source_chunk, chunk_id_vars, chunk_value_vars)
                if not is_valid:
                    raise HTTPException(status_code=400, detail=f"Invalid configuration: {', '.join(errors)}")
            
            # Unpivot chunk
            variable_col = metadata.get("variable_column_name", "variable")
            value_col = metadata.get("value_column_name", "value")
            
            melted_chunk = pd.melt(
                source_chunk,
                id_vars=chunk_id_vars,
                value_vars=chunk_value_vars,
                var_name=variable_col,
                value_name=value_col,
            )
            
            total_unpivoted_rows += len(melted_chunk)
            
            # Collect needed rows
            needed = PREVIEW_LIMIT - len(preview_records)
            if needed > 0:
                chunk_records = melted_chunk.head(needed).to_dict(orient="records")
                preview_records.extend([convert_numpy(record) for record in chunk_records])
            
            # Stop if we have enough rows
            if len(preview_records) >= PREVIEW_LIMIT:
                break
        
        # Build response
        summary = {
            "original_rows": total_original_rows,  # Rows processed from source
            "original_columns": len(source_chunk.columns) if 'source_chunk' in locals() else 0,
            "unpivoted_rows": total_unpivoted_rows,  # Estimated total
            "unpivoted_columns": len(preview_records[0].keys()) if preview_records else 0,
            "id_vars_count": len(chunk_id_vars) if chunk_id_vars else 0,
            "value_vars_count": len(chunk_value_vars) if chunk_value_vars else 0,
            "is_preview": True,
            "preview_limit": PREVIEW_LIMIT,
            "preview_rows": len(preview_records),
        }
        
        computation_time = time.time() - start_time
        
        # NEVER cache preview results
        logger.info("Preview mode: returning %d rows (estimated total: %d), skipping cache", len(preview_records), total_unpivoted_rows)
        
        return UnpivotComputeResponse(
            atom_id=atom_id,
            status="success",
            updated_at=datetime.now(timezone.utc),
            row_count=total_unpivoted_rows,  # Estimated total
            dataframe=preview_records,  # Only preview rows
            summary=summary,
            computation_time=computation_time,
        )
    
    # FULL MODE: This should not be reached if safety guard works correctly
    # But keeping as fallback - will be handled by save path
    raise HTTPException(
        status_code=400,
        detail="Full mode computation not supported. Use save endpoint for full dataset processing."
    )


def compute_unpivot_task(
    atom_id: str,
    force_recompute: bool = False,
    preview_limit: Optional[int] = None,
) -> Dict[str, Any]:
    """Synchronous task function for Celery to execute unpivot computation.
    
    This is a wrapper around the async compute_unpivot function that handles
    async operations internally for Celery workers.
    """
    import asyncio
    import concurrent.futures
    
    print(f"[UNPIVOT_TASK] compute_unpivot_task called: atom_id={atom_id}")  # Debug print
    logger.info(
        "compute_unpivot_task starting atom_id=%s force_recompute=%s preview_limit=%s",
        atom_id,
        force_recompute,
        preview_limit,
    )
    
    # Create a request-like object for the async function
    class ComputeRequest:
        def __init__(self, force_recompute: bool, preview_limit: Optional[int]):
            self.force_recompute = force_recompute
            self.preview_limit = preview_limit
    
    payload = ComputeRequest(force_recompute, preview_limit)
    
    # Helper to run async function
    def run_async():
        return asyncio.run(compute_unpivot(atom_id, payload))
    
    # Run the async function - handle both sync and async contexts
    try:
        # Check if we're in an existing event loop
        try:
            loop = asyncio.get_running_loop()
            # We're inside an async context - run in a thread pool
            logger.info("compute_unpivot_task: Running in thread pool (async context detected)")
            with concurrent.futures.ThreadPoolExecutor() as executor:
                future = executor.submit(run_async)
                response = future.result(timeout=300)  # 5 minute timeout
        except RuntimeError:
            # No running loop - we can use asyncio.run directly
            logger.info("compute_unpivot_task: Running with asyncio.run (no async context)")
            response = asyncio.run(compute_unpivot(atom_id, payload))
        
        logger.info(
            "compute_unpivot_task completed atom_id=%s status=%s row_count=%d",
            atom_id,
            response.status,
            response.row_count,
        )
        
        # Convert Pydantic model to dict for Celery serialization
        result = {
            "atom_id": response.atom_id,
            "status": response.status,
            "updated_at": response.updated_at.isoformat() if isinstance(response.updated_at, datetime) else str(response.updated_at),
            "row_count": response.row_count,
            "dataframe": response.dataframe if response.dataframe else [],
            "summary": response.summary if response.summary else {},
            "computation_time": response.computation_time,
        }
        
        logger.info(
            "compute_unpivot_task returning result atom_id=%s dataframe_len=%d",
            atom_id,
            len(result.get("dataframe", [])),
        )
        
        return result
    except HTTPException as e:
        # Convert HTTPException to dict for error handling
        logger.error(
            "compute_unpivot_task HTTPException atom_id=%s error=%s",
            atom_id,
            e.detail,
        )
        return {
            "atom_id": atom_id,
            "status": "failure",
            "error": e.detail,
            "status_code": e.status_code,
        }
    except Exception as e:
        logger.exception("Unpivot computation task failed for atom %s", atom_id)
        return {
            "atom_id": atom_id,
            "status": "failure",
            "error": str(e),
        }


def save_unpivot_result_task(
    atom_id: str,
    format: str = "arrow",
    filename: Optional[str] = None,
) -> Dict[str, Any]:
    """Synchronous task function for Celery to execute unpivot save.
    
    This is a wrapper around the async save_unpivot_result function that handles
    async operations internally for Celery workers.
    """
    import asyncio
    import concurrent.futures
    
    print(f"[UNPIVOT_TASK] save_unpivot_result_task called: atom_id={atom_id}")  # Debug print
    logger.info("save_unpivot_result_task starting atom_id=%s format=%s", atom_id, format)
    
    # Create a request-like object for the async function
    class SaveRequest:
        def __init__(self, format: str, filename: Optional[str]):
            self.format = format
            self.filename = filename
    
    payload = SaveRequest(format, filename)
    
    # Helper to run async function
    def run_async():
        return asyncio.run(save_unpivot_result(atom_id, payload))
    
    # Run the async function - handle both sync and async contexts
    try:
        # Check if we're in an existing event loop
        try:
            loop = asyncio.get_running_loop()
            # We're inside an async context - run in a thread pool
            logger.info("save_unpivot_result_task: Running in thread pool (async context detected)")
            with concurrent.futures.ThreadPoolExecutor() as executor:
                future = executor.submit(run_async)
                response = future.result(timeout=300)  # 5 minute timeout
        except RuntimeError:
            # No running loop - we can use asyncio.run directly
            logger.info("save_unpivot_result_task: Running with asyncio.run (no async context)")
            response = asyncio.run(save_unpivot_result(atom_id, payload))
        
        # Convert Pydantic model to dict for Celery serialization
        return {
            "atom_id": response.atom_id,
            "minio_path": response.minio_path,
            "updated_at": response.updated_at.isoformat() if isinstance(response.updated_at, datetime) else str(response.updated_at),
            "row_count": response.row_count,
        }
    except HTTPException as e:
        # Convert HTTPException to dict for error handling
        return {
            "atom_id": atom_id,
            "status": "failure",
            "error": e.detail,
            "status_code": e.status_code,
        }
    except Exception as e:
        logger.exception("Unpivot save task failed for atom %s", atom_id)
        return {
            "atom_id": atom_id,
            "status": "failure",
            "error": str(e),
        }


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
    """Save unpivot result directly to MinIO using chunked streaming.
    
    Always recomputes from source using chunked processing and streams to MinIO.
    Does not use cache or load full dataframes into memory.
    """
    logger.info("Saving unpivot result directly to MinIO for atom: %s", atom_id)
    
    # Load metadata to get configuration
    metadata = _load_metadata(atom_id)
    if not metadata:
        raise HTTPException(status_code=404, detail=f"Unpivot atom '{atom_id}' not found")
    
    # Resolve dataset path
    try:
        resolved_path = await resolve_object_path(metadata["dataset_path"])
    except Exception as exc:
        logger.exception("Failed to resolve dataset path for saving atom %s", atom_id)
        raise HTTPException(status_code=500, detail=f"Unable to resolve dataset path: {exc}")
    
    # Resolve column names (we need to get these from first chunk or metadata)
    # For now, use metadata values - they should be consistent across chunks
    id_vars = metadata.get("id_vars", [])
    value_vars = metadata.get("value_vars", [])
    variable_col = metadata.get("variable_column_name", "variable")
    value_col = metadata.get("value_column_name", "value")
    
    # Perform full chunked unpivot and stream to MinIO
    minio_path, row_count = await stream_full_unpivot_to_minio(
        atom_id=atom_id,
        resolved_path=resolved_path,
        id_vars=id_vars,
        value_vars=value_vars,
        variable_col=variable_col,
        value_col=value_col,
    )
    
    timestamp = datetime.now(timezone.utc)
    
    # Update metadata with saved path
    metadata["last_saved_path"] = minio_path
    metadata["last_saved_at"] = timestamp.isoformat()
    _store_metadata(atom_id, metadata)
    
    logger.info("Saved unpivot result to MinIO for atom %s: %s (%d rows)", atom_id, minio_path, row_count)
    
    return UnpivotSaveResponse(
        atom_id=atom_id,
        minio_path=minio_path,
        updated_at=timestamp,
        row_count=row_count,
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

