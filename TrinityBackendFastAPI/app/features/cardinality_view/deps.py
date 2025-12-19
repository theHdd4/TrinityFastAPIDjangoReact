"""
Dependencies and utilities for cardinality-view feature
"""
import os
from typing import Optional

# MinIO Configuration
# Use same bucket as createcolumn feature for consistency
MINIO_BUCKET = os.getenv("MINIO_BUCKET", "trinity")

# Import shared utilities
try:
    from ..createcolumn.deps import get_minio_df, minio_client
    from ..createcolumn.service import get_column_metadata_for_file
except ImportError:
    # Fallback imports if structure changes
    from app.features.createcolumn.deps import get_minio_df, minio_client
    from app.features.createcolumn.service import get_column_metadata_for_file

__all__ = [
    "MINIO_BUCKET",
    "get_minio_df", 
    "minio_client",
    "get_column_metadata_for_file"
]