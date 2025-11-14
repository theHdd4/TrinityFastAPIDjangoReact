from __future__ import annotations

import io
import logging
import os
from datetime import datetime
from typing import Any, Dict, Iterable, List, Optional

import pandas as pd
import pyarrow as pa
import pyarrow.ipc as ipc
from minio import Minio
from minio.error import S3Error
from pymongo import MongoClient

from .feature_overview.base import (
    output_store,
    run_feature_overview,
    run_unique_count,
    unique_count,
)

logger = logging.getLogger("app.features.feature_overview.service")

MINIO_ENDPOINT = os.getenv("MINIO_ENDPOINT", "minio:9000")
MINIO_ACCESS_KEY = os.getenv("MINIO_ACCESS_KEY", "admin_dev")
MINIO_SECRET_KEY = os.getenv("MINIO_SECRET_KEY", "pass_dev")
MINIO_SECURE = os.getenv("MINIO_SECURE", "false").lower() in {"1", "true", "yes", "on"}

DEFAULT_MONGO_URI = "mongodb://mongo:27017/trinity"
MONGO_URI = os.getenv("OVERVIEW_MONGO_URI", os.getenv("MONGO_URI", DEFAULT_MONGO_URI))

_mongo_client: Optional[MongoClient] = None


def _get_mongo_client() -> MongoClient:
    global _mongo_client
    if _mongo_client is None:
        _mongo_client = MongoClient(MONGO_URI)
    return _mongo_client


def _get_minio_client() -> Minio:
    return Minio(
        MINIO_ENDPOINT,
        access_key=MINIO_ACCESS_KEY,
        secret_key=MINIO_SECRET_KEY,
        secure=MINIO_SECURE,
    )


def _read_object_bytes(client: Minio, bucket_name: str, object_name: str) -> bytes:
    response = client.get_object(bucket_name, object_name)
    try:
        return response.read()
    finally:
        response.close()
        response.release_conn()


def _frame_from_bytes(object_name: str, payload: bytes) -> pd.DataFrame:
    if object_name.endswith(".csv"):
        return pd.read_csv(io.BytesIO(payload))
    if object_name.endswith((".xls", ".xlsx")):
        return pd.read_excel(io.BytesIO(payload))
    if object_name.endswith(".arrow"):
        reader = ipc.RecordBatchFileReader(pa.BufferReader(payload))
        table = reader.read_all()
        return table.to_pandas()
    raise ValueError(f"Unsupported file format: {object_name}")


def _load_combined_dataframe(bucket_name: str, object_names: Iterable[str]) -> pd.DataFrame:
    client = _get_minio_client()
    frames: List[pd.DataFrame] = []
    for object_name in object_names:
        try:
            payload = _read_object_bytes(client, bucket_name, object_name)
        except S3Error as exc:
            logger.error(
                "feature_overview.minio_error bucket=%s object=%s error=%s",
                bucket_name,
                object_name,
                exc,
            )
            raise
        frame = _frame_from_bytes(object_name, payload)
        frame.columns = frame.columns.str.lower()
        frames.append(frame)
    if not frames:
        raise ValueError("No valid files fetched from MinIO")
    return pd.concat(frames, ignore_index=True)


def _serialize_value(value: Any) -> Any:
    if isinstance(value, pd.DataFrame):
        return value.to_dict(orient="records")
    if isinstance(value, dict):
        return {key: _serialize_value(val) for key, val in value.items()}
    if isinstance(value, list):
        return [_serialize_value(item) for item in value]
    return value


def _normalise_detailed_summary(result: Dict[str, Any]) -> Dict[str, Any]:
    detailed = result.get("detailed_summary")
    if not isinstance(detailed, list):
        return result
    normalised: List[Any] = []
    for entry in detailed:
        if isinstance(entry, dict):
            converted = {}
            for key, value in entry.items():
                if key == "Numeric Summary" and isinstance(value, pd.DataFrame):
                    converted[key] = value.to_dict(orient="index")
                else:
                    converted[key] = _serialize_value(value)
            normalised.append(converted)
        else:
            normalised.append(_serialize_value(entry))
    result = dict(result)
    result["detailed_summary"] = normalised
    return result


def _store_document(db_name: str, collection_name: str, document: Dict[str, Any]) -> None:
    try:
        client = _get_mongo_client()
        client[db_name][collection_name].insert_one(document)
        logger.info(
            "feature_overview.mongo_insert db=%s collection=%s document_keys=%s",
            db_name,
            collection_name,
            sorted(document.keys()),
        )
    except Exception:  # pragma: no cover - defensive logging
        logger.exception("Failed to store feature overview document")


def run_unique_count_task(
    *,
    bucket_name: str,
    object_names: Iterable[str],
    dimensions: Dict[str, List[str]],
    validator_atom_id: str,
    file_key: str,
    mongo_db: str = "feature_overview_db",
    collection_name: str = "unique_dataframe",
) -> Dict[str, Any]:
    dataframe = _load_combined_dataframe(bucket_name, object_names)
    status = run_unique_count(dataframe, dimensions)
    unique_snapshot = _serialize_value(unique_count.get("unique_result", {}))

    document = {
        "timestamp": datetime.utcnow(),
        "validator_atom_id": validator_atom_id,
        "file_key": file_key,
        "unique_result": unique_snapshot,
    }
    _store_document(mongo_db, collection_name, document)

    return {
        "status": status,
        "dimensions": dimensions,
        "unique_result": unique_snapshot,
    }


def run_feature_overview_summary_task(
    *,
    bucket_name: str,
    object_names: Iterable[str],
    dimensions: Dict[str, List[str]],
    validator_atom_id: str,
    file_key: str,
    create_hierarchy: bool = True,
    create_summary: bool = True,
    selected_combination: Optional[Dict[str, Any]] = None,
    mongo_db: str = "feature_overview_db",
    collection_name: str = "summary_results",
) -> Dict[str, Any]:
    dataframe = _load_combined_dataframe(bucket_name, object_names)
    status = run_feature_overview(
        dataframe,
        dimensions,
        create_hierarchy=create_hierarchy,
        selected_combination=selected_combination,
        create_summary=create_summary,
    )
    result_snapshot = _serialize_value(output_store.get("result", {}))
    result_snapshot = _normalise_detailed_summary(result_snapshot)
    unique_snapshot = _serialize_value(unique_count.get("unique_result", {}))

    document = {
        "timestamp": datetime.utcnow(),
        "validator_atom_id": validator_atom_id,
        "file_key": file_key,
        "output_result": result_snapshot,
    }
    _store_document(mongo_db, collection_name, document)

    return {
        "status": status,
        "dimensions": dimensions,
        "result": result_snapshot,
        "unique_result": unique_snapshot,
    }


__all__ = [
    "run_unique_count_task",
    "run_feature_overview_summary_task",
]
