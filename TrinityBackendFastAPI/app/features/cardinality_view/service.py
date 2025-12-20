"""
Unified Cardinality Service
Provides consistent cardinality data with metadata support for all atoms
"""
import logging
from datetime import datetime
from typing import Any, Dict, List, Optional

import numpy as np
import pandas as pd

from .deps import MINIO_BUCKET, get_minio_df, get_column_metadata_for_file

logger = logging.getLogger("app.features.cardinality-view.service")


def unified_cardinality_task(
    *,
    bucket_name: str,
    object_name: str,
    client_name: Optional[str] = None,
    app_name: Optional[str] = None,
    project_name: Optional[str] = None,
) -> Dict[str, Any]:
    """
    Unified cardinality task with metadata support for derived columns.
    
    This function provides consistent cardinality data across all atoms,
    with metadata support to show derived column information (formulas, etc.)
    
    Args:
        bucket_name: MinIO bucket name
        object_name: File path/name
        client_name: Client name for metadata lookup
        app_name: App name for metadata lookup  
        project_name: Project name for metadata lookup
        
    Returns:
        Dict containing cardinality data with metadata for derived columns
    """
    logger.info(f"🔍 [UNIFIED-CARDINALITY] Starting task for: {object_name}")
    logger.info(f"🔍 [UNIFIED-CARDINALITY] Metadata params: client={client_name}, app={app_name}, project={project_name}")
    
    try:
        # Extract project context from object_name path if not provided (fallback)
        # Path format: client_name/app_name/project_name/filename.arrow
        # Also handles: client_name/app_name/project_name/create-data/filename.arrow
        path_parts = [p for p in (object_name or "").strip("/").split("/") if p]  # Filter empty parts
        extracted_client = path_parts[0] if len(path_parts) > 0 and path_parts[0] else ""
        extracted_app = path_parts[1] if len(path_parts) > 1 and path_parts[1] else ""
        extracted_project = path_parts[2] if len(path_parts) > 2 and path_parts[2] else ""
        
        # If we have create-data/ prefix, adjust indices (skip it)
        if len(path_parts) > 3 and path_parts[3] in ["create-data", "create_data"]:
            # Path is: client/app/project/create-data/file.arrow
            # We already have the right values, but log it
            logger.info(f"🔍 [UNIFIED-CARDINALITY] Detected create-data prefix in path")
        
        # Use provided params, fallback to extracted from path, then to environment
        import os
        final_client_name = (client_name or extracted_client or os.getenv("CLIENT_NAME", "")).strip()
        final_app_name = (app_name or extracted_app or os.getenv("APP_NAME", "")).strip()
        final_project_name = (project_name or extracted_project or os.getenv("PROJECT_NAME", "")).strip()
        
        logger.info(f"🔍 [UNIFIED-CARDINALITY] Final context: client={final_client_name}, app={final_app_name}, project={final_project_name}")
        logger.info(f"🔍 [UNIFIED-CARDINALITY] Context source breakdown: provided=({client_name}, {app_name}, {project_name}), extracted=({extracted_client}, {extracted_app}, {extracted_project})")
        
        # 1. Load dataframe and get basic cardinality
        dataframe = get_minio_df(bucket_name, object_name)
        dataframe.columns = dataframe.columns.str.strip().str.lower()
        logger.info(f"📊 [UNIFIED-CARDINALITY] DataFrame columns (normalized): {list(dataframe.columns)}")

        cardinality_data: List[Dict[str, Any]] = []
        
        # 2. Get column metadata if project context provided
        column_metadata = {}
        metadata_available = False
        
        if final_client_name and final_app_name and final_project_name:
            logger.info(f"✅ [UNIFIED-CARDINALITY] All context values present - proceeding with metadata lookup")
            try:
                logger.info(f"🔍 [UNIFIED-CARDINALITY] Fetching column metadata...")
                column_metadata = get_column_metadata_for_file(
                    object_name=object_name,
                    client_name=final_client_name,
                    app_name=final_app_name,
                    project_name=final_project_name,
                )
                metadata_available = True
                logger.info(f"✅ [UNIFIED-CARDINALITY] Retrieved {len(column_metadata)} columns with metadata")
                logger.info(f"📋 [UNIFIED-CARDINALITY] Metadata keys: {list(column_metadata.keys())}")
            except Exception as e:
                logger.warning(f"⚠️ [UNIFIED-CARDINALITY] Failed to get column metadata: {e}")
                # Continue without metadata (graceful fallback)
        else:
            logger.warning(
                f"⚠️ [UNIFIED-CARDINALITY] Missing metadata params - skipping metadata lookup. "
                f"Context: client='{final_client_name}', app='{final_app_name}', project='{final_project_name}'. "
                f"At least one is empty/missing."
            )
        
        # 3. Generate cardinality data for each column
        for col in dataframe.columns:
            series = dataframe[col].dropna()
            try:
                values = series.unique()
            except TypeError:
                values = series.astype(str).unique()

            def _serialize(value: Any) -> str:
                """Serialize values for JSON response"""
                if isinstance(value, (pd.Timestamp, datetime)):
                    return pd.to_datetime(value).isoformat()
                return str(value)

            safe_values = [_serialize(v) for v in values]
            
            # Basic column info
            col_info = {
                "column": col,
                "data_type": str(dataframe[col].dtype),
                "unique_count": int(len(values)),
                "unique_values": safe_values,
            }
            
            # 4. Add metadata if available
            normalized_col = col.lower().strip()
            if normalized_col in column_metadata:
                col_info["metadata"] = column_metadata[normalized_col]
                logger.info(f"✅ [UNIFIED-CARDINALITY] Added metadata for column '{col}' (normalized: '{normalized_col}'): is_created={col_info['metadata'].get('is_created')}, formula={col_info['metadata'].get('formula')}")
            else:
                # Original column (not created via operations)
                col_info["metadata"] = {
                    "is_created": False,
                    "operation_type": None,
                    "formula": None,
                }
                logger.debug(f"📝 [UNIFIED-CARDINALITY] Column '{col}' is original (no metadata)")
            
            cardinality_data.append(col_info)
        
        # 5. Debug: Count columns with metadata
        columns_with_metadata = [c for c in cardinality_data if c.get("metadata", {}).get("is_created")]
        logger.info(f"📊 [UNIFIED-CARDINALITY] Final result: {len(cardinality_data)} total columns, {len(columns_with_metadata)} with is_created=True")

        return {
            "status": "SUCCESS",
            "cardinality": cardinality_data,
            "metadata_available": metadata_available,
            "total_columns": len(cardinality_data),
            "derived_columns": len(columns_with_metadata)
        }
        
    except Exception as e:
        logger.error(f"❌ [UNIFIED-CARDINALITY] Task failed: {e}", exc_info=True)
        return {
            "status": "ERROR",
            "error": str(e),
            "cardinality": [],
            "metadata_available": False
        }


__all__ = [
    "unified_cardinality_task"
]