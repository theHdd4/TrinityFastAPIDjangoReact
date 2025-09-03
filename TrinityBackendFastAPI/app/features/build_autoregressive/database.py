import os
import pandas as pd
import numpy as np
from io import StringIO, BytesIO
import logging
from typing import List, Dict, Any, Optional
import asyncio
from datetime import datetime

# PyArrow imports for MinIO storage
import pyarrow as pa
import pyarrow.feather as feather

# MinIO imports
from minio import Minio
from minio.error import S3Error

# MongoDB imports
from motor.motor_asyncio import AsyncIOMotorClient, AsyncIOMotorCollection

# Configuration
from .config import settings
from .deps import redis_client, OBJECT_PREFIX, MINIO_BUCKET

logger = logging.getLogger(__name__)

# MinIO client initialization
minio_client = Minio(
    settings.minio_url,
    access_key=settings.minio_access_key,
    secret_key=settings.minio_secret_key,
    secure=settings.minio_secure
)

# MongoDB client initialization
mongo_client = AsyncIOMotorClient(settings.mongo_details)
autoregressive_db = mongo_client[settings.database_name]
autoreg_results_collection = autoregressive_db["autoreg_results"]
autoreg_identifiers_collection = autoregressive_db["autoreg_identifiers"]

async def save_autoregressive_results(scope_id: str, set_name: str, combination_id: str, results: Dict[str, Any]):
    """Save autoregressive model results to MongoDB."""
    try:
        document = {
            "scope_id": scope_id,
            "set_name": set_name,
            "combination_id": combination_id,
            "results": results,
            "created_at": datetime.utcnow(),
            "status": "completed"
        }
        
        await autoreg_results_collection.insert_one(document)
        logger.info(f"✅ Saved autoregressive results for {combination_id}")
        
    except Exception as e:
        logger.error(f"Failed to save autoregressive results: {e}")
        raise

async def get_autoregressive_results(scope_id: str, set_name: str) -> List[Dict[str, Any]]:
    """Get autoregressive results for a scope and set."""
    try:
        cursor = autoreg_results_collection.find({
            "scope_id": scope_id,
            "set_name": set_name
        })
        results = await cursor.to_list(length=None)
        return results
    except Exception as e:
        logger.error(f"Failed to get autoregressive results: {e}")
        return []

def save_dataframe_to_minio(df: pd.DataFrame, object_name: str, format: str = "csv"):
    """Save dataframe to MinIO."""
    try:
        if format == "csv":
            content = df.to_csv(index=False).encode("utf-8")
            content_type = "text/csv"
        elif format == "arrow":
            buffer = pa.BufferOutputStream()
            table = pa.Table.from_pandas(df)
            with pa.ipc.RecordBatchFileWriter(buffer, table.schema) as writer:
                writer.write_table(table)
            content = buffer.getvalue().to_pybytes()
            content_type = "application/octet-stream"
        else:
            raise ValueError(f"Unsupported format: {format}")
        
        minio_client.put_object(
            MINIO_BUCKET,
            object_name,
            data=BytesIO(content),
            length=len(content),
            content_type=content_type
        )
        
        # Cache in Redis for 1 hour
        if redis_client:
            try:
                redis_client.setex(object_name, 3600, content)
            except Exception as e:
                logger.warning(f"Failed to cache in Redis: {e}")
        
        logger.info(f"✅ Saved dataframe to MinIO: {object_name}")
        
    except Exception as e:
        logger.error(f"Failed to save dataframe to MinIO: {e}")
        raise
