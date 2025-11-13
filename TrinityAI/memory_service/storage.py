from __future__ import annotations

import io
import json
import logging
import os
import re
from datetime import datetime, timezone
from typing import Any, Dict, Iterable, List, Optional, Tuple

from minio import Minio
from minio.error import S3Error

logger = logging.getLogger("trinity.ai.memory")

try:
    from app.DataStorageRetrieval.minio_utils import (
        MINIO_BUCKET as DEFAULT_MINIO_BUCKET,
        ensure_minio_bucket,
        get_client,
    )
except (ModuleNotFoundError, ImportError):  # pragma: no cover - fallback when FastAPI package unavailable
    import sys
    from pathlib import Path

    BACKEND_ROOT = Path(__file__).resolve().parents[1] / "TrinityBackendFastAPI"
    BACKEND_APP = BACKEND_ROOT / "app"

    for candidate in (BACKEND_ROOT, BACKEND_APP):
        if candidate.exists():
            candidate_str = str(candidate)
            if candidate_str not in sys.path:
                sys.path.append(candidate_str)

    try:
        from DataStorageRetrieval.minio_utils import (  # type: ignore
            MINIO_BUCKET as DEFAULT_MINIO_BUCKET,
            ensure_minio_bucket,
            get_client,
        )
    except (ModuleNotFoundError, ImportError, AttributeError):
        # Final fallback: create MinIO client directly from environment
        logger.warning("Using direct MinIO client initialization (backend utils unavailable)")
        MINIO_ENDPOINT = os.getenv("MINIO_ENDPOINT", "minio:9000")
        MINIO_ACCESS_KEY = os.getenv("MINIO_ACCESS_KEY", "minio")
        MINIO_SECRET_KEY = os.getenv("MINIO_SECRET_KEY", "minio123")
        DEFAULT_MINIO_BUCKET = os.getenv("MINIO_BUCKET", "trinity")
        
        _minio_client = Minio(
            MINIO_ENDPOINT,
            access_key=MINIO_ACCESS_KEY,
            secret_key=MINIO_SECRET_KEY,
            secure=False,
        )
        
        def ensure_minio_bucket() -> None:
            try:
                if not _minio_client.bucket_exists(DEFAULT_MINIO_BUCKET):
                    _minio_client.make_bucket(DEFAULT_MINIO_BUCKET)
                    logger.info(f"Created MinIO bucket: {DEFAULT_MINIO_BUCKET}")
            except Exception as e:
                logger.error(f"Failed to ensure bucket {DEFAULT_MINIO_BUCKET}: {e}")
                raise
        
        def get_client() -> Minio:
            return _minio_client

MEMORY_PREFIX = os.getenv("TRINITY_AI_MEMORY_PREFIX", "trinity_ai_memory")
MEMORY_BUCKET = os.getenv("TRINITY_AI_MEMORY_BUCKET", DEFAULT_MINIO_BUCKET)
MAX_MESSAGES_DEFAULT = int(os.getenv("TRINITY_AI_MEMORY_MAX_MESSAGES", "400"))
MAX_BYTES_DEFAULT = int(os.getenv("TRINITY_AI_MEMORY_MAX_BYTES", str(2 * 1024 * 1024)))

_SAFE_ID_PATTERN = re.compile(r"[^0-9A-Za-z_\-]+")


class MemoryStorageError(RuntimeError):
    """Raised when a memory persistence operation fails."""


def _sanitize_identifier(value: str) -> str:
    value = value.strip()
    if not value:
        raise MemoryStorageError("identifier cannot be empty")
    sanitized = _SAFE_ID_PATTERN.sub("_", value)
    return sanitized[:256]


def _get_project_name() -> str:
    """Get project name from environment, fallback to 'default' if not set."""
    project_name = os.getenv("PROJECT_NAME", "").strip()
    if not project_name:
        project_name = "default"
    return _sanitize_identifier(project_name)


def _context_prefix() -> str:
    """Generate simplified path: trinity_ai_memory/[PROJECT_NAME]"""
    project = _get_project_name()
    return f"{MEMORY_PREFIX}/{project}"


def _chat_object_name(chat_id: str) -> str:
    """Generate chat object path: trinity_ai_memory/[PROJECT_NAME]/chats/[chat_id]/messages.json"""
    safe_id = _sanitize_identifier(chat_id)
    return f"{_context_prefix()}/chats/{safe_id}/messages.json"


def _session_object_name(session_id: str) -> str:
    """Generate session object path: trinity_ai_memory/[PROJECT_NAME]/sessions/[session_id]/context.json"""
    safe_id = _sanitize_identifier(session_id)
    return f"{_context_prefix()}/sessions/{safe_id}/context.json"


def _ensure_bucket(client: Minio) -> None:
    if MEMORY_BUCKET == DEFAULT_MINIO_BUCKET:
        ensure_minio_bucket()
        return
    try:
        if not client.bucket_exists(MEMORY_BUCKET):
            client.make_bucket(MEMORY_BUCKET)
    except Exception as exc:  # pragma: no cover - defensive logging
        logger.error("Failed to ensure MinIO bucket %s: %s", MEMORY_BUCKET, exc)
        raise MemoryStorageError(f"Unable to ensure MinIO bucket '{MEMORY_BUCKET}'") from exc


def _load_json_object(client: Minio, object_name: str) -> Optional[Dict[str, Any]]:
    try:
        response = client.get_object(MEMORY_BUCKET, object_name)
    except S3Error as exc:
        if exc.code in {"NoSuchKey", "NoSuchObject"}:
            return None
        raise MemoryStorageError(f"Failed to fetch object {object_name}: {exc}") from exc
    except Exception as exc:  # pragma: no cover
        raise MemoryStorageError(f"Failed to fetch object {object_name}: {exc}") from exc

    try:
        payload_bytes = response.read()
    finally:
        response.close()
        response.release_conn()

    if not payload_bytes:
        return None

    try:
        return json.loads(payload_bytes.decode("utf-8"))
    except json.JSONDecodeError:
        logger.warning("Corrupted JSON payload at %s", object_name)
        return None


def _put_json_object(client: Minio, object_name: str, payload: Dict[str, Any], max_bytes: int) -> None:
    data = json.dumps(payload, ensure_ascii=False).encode("utf-8")
    size = len(data)
    if max_bytes > 0 and size > max_bytes:
        raise MemoryStorageError(
            f"Payload size {size} bytes exceeds configured limit ({max_bytes} bytes)"
        )

    stream = io.BytesIO(data)
    try:
        client.put_object(
            bucket_name=MEMORY_BUCKET,
            object_name=object_name,
            data=stream,
            length=size,
            content_type="application/json",
        )
    except Exception as exc:
        raise MemoryStorageError(f"Failed to save object {object_name}: {exc}") from exc


def _remove_object(client: Minio, object_name: str) -> None:
    try:
        client.remove_object(MEMORY_BUCKET, object_name)
    except S3Error as exc:
        if exc.code not in {"NoSuchKey", "NoSuchObject"}:
            raise MemoryStorageError(f"Failed to delete object {object_name}: {exc}") from exc
    except Exception as exc:
        raise MemoryStorageError(f"Failed to delete object {object_name}: {exc}") from exc


def _parse_timestamp(value: Any) -> Optional[datetime]:
    if not value:
        return None
    if isinstance(value, datetime):
        return value
    if isinstance(value, (int, float)):
        return datetime.fromtimestamp(value, tz=timezone.utc)
    if isinstance(value, str):
        try:
            return datetime.fromisoformat(value.replace("Z", "+00:00"))
        except ValueError:
            return None
    return None


def _build_chat_response(chat_id: str, payload: Dict[str, Any]) -> Dict[str, Any]:
    messages = payload.get("messages", []) or []
    metadata = payload.get("metadata") or {}
    updated_at = _parse_timestamp(payload.get("updated_at")) or datetime.now(timezone.utc)

    return {
        "chat_id": payload.get("original_chat_id") or chat_id,
        "messages": messages,
        "metadata": metadata,
        "total_messages": len(messages),
        "offset": 0,
        "limit": None,
        "truncated": bool(payload.get("truncated", False)),
        "updated_at": updated_at,
    }


def _build_session_response(session_id: str, payload: Dict[str, Any]) -> Dict[str, Any]:
    updated_at = _parse_timestamp(payload.get("updated_at")) or datetime.now(timezone.utc)
    return {
        "session_id": payload.get("original_session_id") or session_id,
        "data": payload.get("data") or {},
        "metadata": payload.get("metadata") or {},
        "updated_at": updated_at,
    }


def _default_retain_limit(requested: Optional[int]) -> int:
    if requested is None or requested <= 0:
        return MAX_MESSAGES_DEFAULT
    return requested


def load_chat(chat_id: str) -> Optional[Dict[str, Any]]:
    client = get_client()
    _ensure_bucket(client)
    object_name = _chat_object_name(chat_id)
    payload = _load_json_object(client, object_name)
    if payload is None:
        return None
    return _build_chat_response(chat_id, payload)


def save_chat(
    chat_id: str,
    *,
    messages: Optional[List[Dict[str, Any]]] = None,
    metadata: Optional[Dict[str, Any]] = None,
    append: bool = False,
    retain_last: Optional[int] = None,
    max_bytes: int = MAX_BYTES_DEFAULT,
) -> Dict[str, Any]:
    client = get_client()
    _ensure_bucket(client)

    object_name = _chat_object_name(chat_id)
    existing_payload = _load_json_object(client, object_name) or {}

    base_messages: List[Dict[str, Any]] = existing_payload.get("messages", []) or []
    incoming_messages: List[Dict[str, Any]] = messages or []

    if append:
        combined_messages = base_messages + incoming_messages
    elif messages is not None:
        combined_messages = incoming_messages
    else:
        combined_messages = base_messages

    retain_limit = _default_retain_limit(retain_last)
    truncated = False
    if retain_limit and len(combined_messages) > retain_limit:
        truncated = True
        combined_messages = combined_messages[-retain_limit:]

    timestamp = datetime.now(timezone.utc)

    payload = {
        "original_chat_id": existing_payload.get("original_chat_id") or chat_id,
        "messages": combined_messages,
        "metadata": metadata or existing_payload.get("metadata") or {},
        "total_messages": len(combined_messages),
        "truncated": truncated,
        "updated_at": timestamp.isoformat(),
        "created_at": existing_payload.get("created_at") or timestamp.isoformat(),
    }

    _put_json_object(client, object_name, payload, max_bytes=max_bytes)
    return _build_chat_response(chat_id, payload)


def delete_chat(chat_id: str) -> None:
    client = get_client()
    _ensure_bucket(client)
    object_name = _chat_object_name(chat_id)
    _remove_object(client, object_name)


def list_chats() -> List[Dict[str, Any]]:
    client = get_client()
    _ensure_bucket(client)
    prefix = f"{_context_prefix()}/chats/"
    results: List[Dict[str, Any]] = []
    try:
        objects: Iterable = client.list_objects(MEMORY_BUCKET, prefix=prefix, recursive=True)
    except Exception as exc:
        raise MemoryStorageError(f"Failed to list chat memory objects: {exc}") from exc

    for item in objects:
        if not getattr(item, "object_name", "").endswith("messages.json"):
            continue
        payload = _load_json_object(client, item.object_name)
        if not payload:
            continue
        chat_id = payload.get("original_chat_id") or payload.get("chat_id")
        if not chat_id:
            # Fallback to object name segment
            chat_id = item.object_name.split("/")[-2]
        record = _build_chat_response(chat_id, payload)
        results.append(record)

    results.sort(key=lambda r: r["updated_at"], reverse=True)
    return results


def load_session(session_id: str) -> Optional[Dict[str, Any]]:
    client = get_client()
    _ensure_bucket(client)
    object_name = _session_object_name(session_id)
    payload = _load_json_object(client, object_name)
    if payload is None:
        return None
    return _build_session_response(session_id, payload)


def save_session(
    session_id: str,
    *,
    data: Dict[str, Any],
    metadata: Optional[Dict[str, Any]] = None,
    max_bytes: int = MAX_BYTES_DEFAULT,
) -> Dict[str, Any]:
    client = get_client()
    _ensure_bucket(client)

    object_name = _session_object_name(session_id)
    existing_payload = _load_json_object(client, object_name) or {}

    timestamp = datetime.now(timezone.utc)
    payload = {
        "original_session_id": existing_payload.get("original_session_id") or session_id,
        "data": data,
        "metadata": metadata or existing_payload.get("metadata") or {},
        "updated_at": timestamp.isoformat(),
        "created_at": existing_payload.get("created_at") or timestamp.isoformat(),
    }

    _put_json_object(client, object_name, payload, max_bytes=max_bytes)
    return _build_session_response(session_id, payload)


def delete_session(session_id: str) -> None:
    client = get_client()
    _ensure_bucket(client)
    object_name = _session_object_name(session_id)
    _remove_object(client, object_name)

