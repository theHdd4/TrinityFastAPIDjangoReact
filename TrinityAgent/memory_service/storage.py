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

# Import Redis cache layer
try:
    from .cache import (
        delete_chat_from_cache,
        get_chat_from_cache,
        is_redis_available,
        set_chat_in_cache,
    )
except ImportError:
    # Fallback if cache module not available
    logger = logging.getLogger("trinity.ai.memory")
    logger.warning("Redis cache module not available, using MinIO only")
    is_redis_available = lambda: False
    get_chat_from_cache = lambda *args, **kwargs: None
    set_chat_in_cache = lambda *args, **kwargs: False
    delete_chat_from_cache = lambda *args, **kwargs: False

logger = logging.getLogger("trinity.ai.memory")

# Initialize DEFAULT_MINIO_BUCKET first to ensure it's always defined
DEFAULT_MINIO_BUCKET = None
ensure_minio_bucket = None
get_client = None

try:
    from app.DataStorageRetrieval.minio_utils import (
        MINIO_BUCKET as DEFAULT_MINIO_BUCKET,
        ensure_minio_bucket,
        get_client,
    )
    logger.info(f"✅ Imported MinIO utils from backend, bucket: {DEFAULT_MINIO_BUCKET}")
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
        logger.info(f"✅ Imported MinIO utils from DataStorageRetrieval, bucket: {DEFAULT_MINIO_BUCKET}")
    except (ModuleNotFoundError, ImportError, AttributeError):
        # Final fallback: create MinIO client directly from centralized config or environment
        # This is expected in microservices deployment where backend modules may not be available
        logger.info("ℹ️ Backend MinIO utils unavailable - using direct initialization from environment variables")
        
        # Try to use centralized config from BaseAgent
        try:
            from BaseAgent.config import settings
            minio_config = settings.get_minio_config()
            MINIO_ENDPOINT = minio_config["endpoint"]
            MINIO_ACCESS_KEY = minio_config["access_key"]
            MINIO_SECRET_KEY = minio_config["secret_key"]
            DEFAULT_MINIO_BUCKET = minio_config.get("bucket") or "trinity"
            logger.info(f"✅ Using MinIO config from BaseAgent settings, bucket: {DEFAULT_MINIO_BUCKET}")
        except (ImportError, AttributeError, KeyError):
            # Fallback to environment variables
            try:
                from TrinityAgent.BaseAgent.config import settings
                minio_config = settings.get_minio_config()
                MINIO_ENDPOINT = minio_config["endpoint"]
                MINIO_ACCESS_KEY = minio_config["access_key"]
                MINIO_SECRET_KEY = minio_config["secret_key"]
                DEFAULT_MINIO_BUCKET = minio_config.get("bucket") or "trinity"
                logger.info(f"✅ Using MinIO config from TrinityAgent.BaseAgent settings, bucket: {DEFAULT_MINIO_BUCKET}")
            except (ImportError, AttributeError, KeyError):
                # Final fallback to environment variables
                MINIO_ENDPOINT = os.getenv("MINIO_ENDPOINT", "minio:9000")
                MINIO_ACCESS_KEY = os.getenv("MINIO_ACCESS_KEY", "minio")
                MINIO_SECRET_KEY = os.getenv("MINIO_SECRET_KEY", "minio123")
                DEFAULT_MINIO_BUCKET = os.getenv("MINIO_BUCKET", "trinity")
                logger.info(f"✅ Using MinIO config from environment variables: endpoint={MINIO_ENDPOINT}, bucket={DEFAULT_MINIO_BUCKET}")
        
        # Ensure DEFAULT_MINIO_BUCKET is never None
        if not DEFAULT_MINIO_BUCKET:
            DEFAULT_MINIO_BUCKET = "trinity"
            logger.warning(f"⚠️ DEFAULT_MINIO_BUCKET was None, using fallback: {DEFAULT_MINIO_BUCKET}")
        
        # Initialize MinIO client - handle different minio library versions
        try:
            # Try newer API (all keyword arguments)
            _minio_client = Minio(
                endpoint=MINIO_ENDPOINT,
                access_key=MINIO_ACCESS_KEY,
                secret_key=MINIO_SECRET_KEY,
                secure=False,
            )
        except (TypeError, ValueError):
            # Fallback for older minio versions (endpoint as positional)
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

# Final safety check - ensure DEFAULT_MINIO_BUCKET is never None
if not DEFAULT_MINIO_BUCKET:
    DEFAULT_MINIO_BUCKET = "trinity"
    logger.error(f"❌ DEFAULT_MINIO_BUCKET was None after initialization, using fallback: {DEFAULT_MINIO_BUCKET}")

# Try to get memory config from centralized settings, fallback to environment
# Ensure DEFAULT_MINIO_BUCKET is defined before using it
if not DEFAULT_MINIO_BUCKET:
    DEFAULT_MINIO_BUCKET = "trinity"
    logger.error(f"❌ DEFAULT_MINIO_BUCKET was None before memory config, using fallback: {DEFAULT_MINIO_BUCKET}")

try:
    from BaseAgent.config import settings
    MEMORY_PREFIX = getattr(settings, "TRINITY_AI_MEMORY_PREFIX", "trinity_ai_memory")
    MEMORY_BUCKET = getattr(settings, "TRINITY_AI_MEMORY_BUCKET", None) or DEFAULT_MINIO_BUCKET
    MAX_MESSAGES_DEFAULT = getattr(settings, "TRINITY_AI_MEMORY_MAX_MESSAGES", 1000)
    MAX_BYTES_DEFAULT = getattr(settings, "TRINITY_AI_MEMORY_MAX_BYTES", 10 * 1024 * 1024)
    logger.info(f"✅ Memory config from BaseAgent: bucket={MEMORY_BUCKET}, prefix={MEMORY_PREFIX}")
except (ImportError, AttributeError):
    try:
        from TrinityAgent.BaseAgent.config import settings
        MEMORY_PREFIX = getattr(settings, "TRINITY_AI_MEMORY_PREFIX", "trinity_ai_memory")
        MEMORY_BUCKET = getattr(settings, "TRINITY_AI_MEMORY_BUCKET", None) or DEFAULT_MINIO_BUCKET
        MAX_MESSAGES_DEFAULT = getattr(settings, "TRINITY_AI_MEMORY_MAX_MESSAGES", 1000)
        MAX_BYTES_DEFAULT = getattr(settings, "TRINITY_AI_MEMORY_MAX_BYTES", 10 * 1024 * 1024)
        logger.info(f"✅ Memory config from TrinityAgent.BaseAgent: bucket={MEMORY_BUCKET}, prefix={MEMORY_PREFIX}")
    except (ImportError, AttributeError):
        # Fallback to environment variables
        MEMORY_PREFIX = os.getenv("TRINITY_AI_MEMORY_PREFIX", "trinity_ai_memory")
        MEMORY_BUCKET = os.getenv("TRINITY_AI_MEMORY_BUCKET", None) or DEFAULT_MINIO_BUCKET
        MAX_MESSAGES_DEFAULT = int(os.getenv("TRINITY_AI_MEMORY_MAX_MESSAGES", "1000"))  # Increased from 400 to 1000
        MAX_BYTES_DEFAULT = int(os.getenv("TRINITY_AI_MEMORY_MAX_BYTES", str(10 * 1024 * 1024)))  # Increased from 2MB to 10MB for large insights
        logger.info(f"✅ Memory config from environment: bucket={MEMORY_BUCKET}, prefix={MEMORY_PREFIX}")

# Final safety check - ensure MEMORY_BUCKET is never None
if not MEMORY_BUCKET:
    MEMORY_BUCKET = DEFAULT_MINIO_BUCKET or "trinity"
    logger.error(f"❌ MEMORY_BUCKET was None after initialization, using fallback: {MEMORY_BUCKET}")

logger.info(f"✅ Memory service initialized: bucket={MEMORY_BUCKET}, prefix={MEMORY_PREFIX}, max_messages={MAX_MESSAGES_DEFAULT}")

_SAFE_ID_PATTERN = re.compile(r"[^0-9A-Za-z_\-]+")


class MemoryStorageError(RuntimeError):
    """Raised when a memory persistence operation fails."""


def _sanitize_identifier(value: str) -> str:
    value = value.strip()
    if not value:
        raise MemoryStorageError("identifier cannot be empty")
    sanitized = _SAFE_ID_PATTERN.sub("_", value)
    return sanitized[:256]


def _get_project_path(
    client_name: Optional[str] = None,
    app_name: Optional[str] = None,
    project_name: Optional[str] = None,
) -> str:
    """Get full project path from parameters or environment: CLIENT_NAME/APP_NAME/PROJECT_NAME"""
    # Use provided parameters or fall back to environment variables
    # Try to get context from centralized config, fallback to environment
    try:
        from BaseAgent.config import settings
        client = (client_name or getattr(settings, "CLIENT_NAME", "") or os.getenv("CLIENT_NAME", "")).strip()
        app = (app_name or getattr(settings, "APP_NAME", "") or os.getenv("APP_NAME", "")).strip()
        project = (project_name or getattr(settings, "PROJECT_NAME", "") or os.getenv("PROJECT_NAME", "")).strip()
    except (ImportError, AttributeError):
        try:
            from TrinityAgent.BaseAgent.config import settings
            client = (client_name or getattr(settings, "CLIENT_NAME", "") or os.getenv("CLIENT_NAME", "")).strip()
            app = (app_name or getattr(settings, "APP_NAME", "") or os.getenv("APP_NAME", "")).strip()
            project = (project_name or getattr(settings, "PROJECT_NAME", "") or os.getenv("PROJECT_NAME", "")).strip()
        except (ImportError, AttributeError):
            # Fallback to environment variables
            client = (client_name or os.getenv("CLIENT_NAME", "")).strip()
            app = (app_name or os.getenv("APP_NAME", "")).strip()
            project = (project_name or os.getenv("PROJECT_NAME", "")).strip()
    
    # Build path components, skipping empty parts
    path_parts = []
    if client:
        path_parts.append(_sanitize_identifier(client))
    if app:
        path_parts.append(_sanitize_identifier(app))
    if project:
        path_parts.append(_sanitize_identifier(project))
    
    # If no path components, use default
    if not path_parts:
        path_parts = ["default"]
    
    return "/".join(path_parts)


def _context_prefix(
    client_name: Optional[str] = None,
    app_name: Optional[str] = None,
    project_name: Optional[str] = None,
) -> str:
    """Generate path: trinity_ai_memory/[CLIENT_NAME]/[APP_NAME]/[PROJECT_NAME]"""
    project_path = _get_project_path(client_name, app_name, project_name)
    return f"{MEMORY_PREFIX}/{project_path}"


def _chat_object_name(
    chat_id: str,
    client_name: Optional[str] = None,
    app_name: Optional[str] = None,
    project_name: Optional[str] = None,
) -> str:
    """Generate chat object path: trinity_ai_memory/[CLIENT]/[APP]/[PROJECT]/chats/[chat_id]/messages.json"""
    safe_id = _sanitize_identifier(chat_id)
    prefix = _context_prefix(client_name, app_name, project_name)
    return f"{prefix}/chats/{safe_id}/messages.json"


def _session_object_name(
    session_id: str,
    client_name: Optional[str] = None,
    app_name: Optional[str] = None,
    project_name: Optional[str] = None,
) -> str:
    """Generate session object path: trinity_ai_memory/[CLIENT]/[APP]/[PROJECT]/sessions/[session_id]/context.json"""
    safe_id = _sanitize_identifier(session_id)
    prefix = _context_prefix(client_name, app_name, project_name)
    return f"{prefix}/sessions/{safe_id}/context.json"


def _ensure_bucket(client: Minio) -> None:
    """Ensure the MinIO bucket exists, with proper error handling."""
    if not MEMORY_BUCKET:
        error_msg = f"MEMORY_BUCKET is None - cannot ensure bucket"
        logger.error(f"❌ {error_msg}")
        raise MemoryStorageError(error_msg)
    
    try:
        if MEMORY_BUCKET == DEFAULT_MINIO_BUCKET and ensure_minio_bucket:
            # Use the ensure_minio_bucket function if available
            ensure_minio_bucket()
            logger.debug(f"✅ Ensured MinIO bucket via ensure_minio_bucket: {MEMORY_BUCKET}")
        else:
            # Ensure the bucket exists directly
            if not client.bucket_exists(MEMORY_BUCKET):
                client.make_bucket(MEMORY_BUCKET)
                logger.info(f"✅ Created MinIO bucket: {MEMORY_BUCKET}")
            else:
                logger.debug(f"✅ MinIO bucket already exists: {MEMORY_BUCKET}")
    except Exception as exc:  # pragma: no cover - defensive logging
        error_msg = f"Unable to ensure MinIO bucket '{MEMORY_BUCKET}': {exc}"
        logger.error(f"❌ {error_msg}")
        raise MemoryStorageError(error_msg) from exc


def _load_json_object(client: Minio, object_name: str) -> Optional[Dict[str, Any]]:
    try:
        response = client.get_object(bucket_name=MEMORY_BUCKET, object_name=object_name)
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


def load_chat(
    chat_id: str,
    client_name: Optional[str] = None,
    app_name: Optional[str] = None,
    project_name: Optional[str] = None,
) -> Optional[Dict[str, Any]]:
    """Load chat with Redis cache-aside pattern."""
    logger.info(f"📥 Loading chat {chat_id} (Redis cache-aside pattern)")
    
    # Try Redis cache first
    if is_redis_available():
        cached_data = get_chat_from_cache(chat_id, client_name, app_name, project_name)
        if cached_data:
            logger.info(f"✅ Loaded chat {chat_id} from Redis cache (FAST)")
            return cached_data
        logger.info(f"⏳ Cache miss for chat {chat_id}, loading from MinIO...")
    else:
        logger.info(f"🔴 Redis not available, loading chat {chat_id} from MinIO only")
    
    # Cache miss or Redis unavailable - load from MinIO
    client = get_client()
    _ensure_bucket(client)
    object_name = _chat_object_name(chat_id, client_name, app_name, project_name)
    payload = _load_json_object(client, object_name)
    if payload is None:
        logger.warning(f"⚠️ Chat {chat_id} not found in MinIO")
        return None
    
    # Build response
    response = _build_chat_response(chat_id, payload)
    message_count = len(response.get("messages", []))
    logger.info(f"📦 Loaded chat {chat_id} from MinIO ({message_count} messages)")
    
    # Cache in Redis for next time
    if is_redis_available():
        cache_success = set_chat_in_cache(chat_id, response, client_name, app_name, project_name)
        if cache_success:
            logger.info(f"✅ Chat {chat_id} cached in Redis for future fast access")
        else:
            logger.warning(f"⚠️ Failed to cache chat {chat_id} in Redis")
    
    return response


def save_chat(
    chat_id: str,
    *,
    messages: Optional[List[Dict[str, Any]]] = None,
    metadata: Optional[Dict[str, Any]] = None,
    append: bool = False,
    retain_last: Optional[int] = None,
    max_bytes: int = MAX_BYTES_DEFAULT,
    client_name: Optional[str] = None,
    app_name: Optional[str] = None,
    project_name: Optional[str] = None,
) -> Dict[str, Any]:
    client = get_client()
    _ensure_bucket(client)

    object_name = _chat_object_name(chat_id, client_name, app_name, project_name)
    existing_payload = _load_json_object(client, object_name) or {}

    base_messages: List[Dict[str, Any]] = existing_payload.get("messages", []) or []
    incoming_messages: List[Dict[str, Any]] = messages or []

    if append:
        combined_messages = base_messages + incoming_messages
    elif messages is not None:
        combined_messages = incoming_messages
    else:
        combined_messages = base_messages

    # Only apply retain_limit if explicitly requested
    # Don't truncate by default - preserve all messages including large insights
    truncated = False
    if retain_last is not None and retain_last > 0:
        retain_limit = retain_last
        if len(combined_messages) > retain_limit:
            truncated = True
            logger.warning(f"⚠️ Truncating chat {chat_id} from {len(combined_messages)} to {retain_limit} messages (retain_last={retain_last})")
            combined_messages = combined_messages[-retain_limit:]
    # If retain_last is None, keep all messages (no truncation)

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
    response = _build_chat_response(chat_id, payload)
    message_count = len(response.get("messages", []))
    logger.info(f"💾 Saved chat {chat_id} to MinIO ({message_count} messages)")
    
    # Update Redis cache
    if is_redis_available():
        cache_success = set_chat_in_cache(chat_id, response, client_name, app_name, project_name)
        if cache_success:
            logger.info(f"✅ Updated Redis cache for chat {chat_id}")
        else:
            logger.warning(f"⚠️ Failed to update Redis cache for chat {chat_id}")
    else:
        logger.info(f"🔴 Redis not available, chat {chat_id} saved to MinIO only")
    
    return response


def delete_chat(
    chat_id: str,
    client_name: Optional[str] = None,
    app_name: Optional[str] = None,
    project_name: Optional[str] = None,
) -> None:
    """Delete a chat and all its associated objects from MinIO and Redis cache."""
    # Delete from Redis cache first
    if is_redis_available():
        delete_chat_from_cache(chat_id, client_name, app_name, project_name)
        logger.debug(f"Deleted chat {chat_id} from Redis cache")
    
    # Delete from MinIO
    client = get_client()
    _ensure_bucket(client)
    
    # Get the chat directory prefix (everything before messages.json)
    object_name = _chat_object_name(chat_id, client_name, app_name, project_name)
    # Extract the directory prefix (e.g., "trinity_ai_memory/client/app/project/chats/chat_id/")
    chat_dir_prefix = "/".join(object_name.split("/")[:-1]) + "/"
    
    try:
        # List all objects in the chat directory
        objects_to_delete = []
        try:
            objects: Iterable = client.list_objects(bucket_name=MEMORY_BUCKET, prefix=chat_dir_prefix, recursive=True)
            for obj in objects:
                objects_to_delete.append(obj.object_name)
        except Exception as exc:
            logger.warning(f"Failed to list objects for chat {chat_id}: {exc}")
        
        # Delete all objects in the chat directory
        errors = []
        for obj_name in objects_to_delete:
            try:
                _remove_object(client, obj_name)
            except Exception as exc:
                errors.append(f"{obj_name}: {exc}")
                logger.warning(f"Failed to delete object {obj_name}: {exc}")
        
        # Also try to delete the main messages.json file (in case it wasn't in the list)
        try:
            _remove_object(client, object_name)
        except Exception:
            pass  # Already deleted or doesn't exist
        
        if errors:
            logger.warning(f"Some objects failed to delete for chat {chat_id}: {errors}")
    except Exception as exc:
        raise MemoryStorageError(f"Failed to delete chat {chat_id}: {exc}") from exc


def list_chats(
    client_name: Optional[str] = None,
    app_name: Optional[str] = None,
    project_name: Optional[str] = None,
) -> List[Dict[str, Any]]:
    """List all chats, using cache when available for faster loading."""
    client = get_client()
    _ensure_bucket(client)
    prefix = f"{_context_prefix(client_name, app_name, project_name)}/chats/"
    results: List[Dict[str, Any]] = []
    try:
        objects: Iterable = client.list_objects(bucket_name=MEMORY_BUCKET, prefix=prefix, recursive=True)
    except Exception as exc:
        raise MemoryStorageError(f"Failed to list chat memory objects: {exc}") from exc

    for item in objects:
        if not getattr(item, "object_name", "").endswith("messages.json"):
            continue
        
        # Extract chat_id from object name
        chat_id = item.object_name.split("/")[-2]
        
        # Try to load from cache first
        cached_data = None
        if is_redis_available():
            cached_data = get_chat_from_cache(chat_id, client_name, app_name, project_name)
        
        if cached_data:
            # Use cached data
            try:
                if isinstance(cached_data.get("messages"), list):
                    results.append(cached_data)
                    continue
            except Exception:
                pass  # Fall through to MinIO load
        
        # Load from MinIO
        payload = _load_json_object(client, item.object_name)
        if not payload:
            continue
        
        # Validate chat completeness - ensure it has required fields
        messages = payload.get("messages", [])
        if not isinstance(messages, list):
            logger.warning(f"Skipping invalid chat at {item.object_name}: messages is not a list")
            continue
        
        chat_id = payload.get("original_chat_id") or payload.get("chat_id") or chat_id
        
        # Only include chats with valid structure
        try:
            record = _build_chat_response(chat_id, payload)
            # Additional validation: ensure chat has valid structure
            if not isinstance(record.get("messages"), list):
                logger.warning(f"Skipping chat {chat_id}: invalid messages structure")
                continue
            results.append(record)
            
            # Cache for next time
            if is_redis_available():
                set_chat_in_cache(chat_id, record, client_name, app_name, project_name)
        except Exception as exc:
            logger.warning(f"Skipping invalid chat at {item.object_name}: {exc}")
            continue

    results.sort(key=lambda r: r["updated_at"], reverse=True)
    return results


def load_session(
    session_id: str,
    client_name: Optional[str] = None,
    app_name: Optional[str] = None,
    project_name: Optional[str] = None,
) -> Optional[Dict[str, Any]]:
    client = get_client()
    _ensure_bucket(client)
    object_name = _session_object_name(session_id, client_name, app_name, project_name)
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
    client_name: Optional[str] = None,
    app_name: Optional[str] = None,
    project_name: Optional[str] = None,
) -> Dict[str, Any]:
    client = get_client()
    _ensure_bucket(client)

    object_name = _session_object_name(session_id, client_name, app_name, project_name)
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


def delete_session(
    session_id: str,
    client_name: Optional[str] = None,
    app_name: Optional[str] = None,
    project_name: Optional[str] = None,
) -> None:
    client = get_client()
    _ensure_bucket(client)
    object_name = _session_object_name(session_id, client_name, app_name, project_name)
    _remove_object(client, object_name)


def delete_all_chats(
    client_name: Optional[str] = None,
    app_name: Optional[str] = None,
    project_name: Optional[str] = None,
) -> int:
    """Delete all chats for a project context from MinIO and Redis cache.
    
    Returns the number of chats deleted.
    """
    logger.info(f"🗑️ Deleting all chats for project context: client={client_name}, app={app_name}, project={project_name}")
    
    client = get_client()
    _ensure_bucket(client)
    
    # Get the prefix for all chats in this project
    prefix = f"{_context_prefix(client_name, app_name, project_name)}/chats/"
    
    deleted_count = 0
    errors = []
    
    try:
        # List all chat objects in this project
        objects: Iterable = client.list_objects(bucket_name=MEMORY_BUCKET, prefix=prefix, recursive=True)
        
        chat_ids_seen = set()
        
        # Collect all objects to delete
        objects_to_delete = []
        for obj in objects:
            object_name = obj.object_name
            # Extract chat_id from path: trinity_ai_memory/client/app/project/chats/chat_id/messages.json
            if object_name.endswith("/messages.json"):
                parts = object_name.split("/")
                if len(parts) >= 2:
                    chat_id = parts[-2]  # Second to last part is chat_id
                    chat_ids_seen.add(chat_id)
            
            objects_to_delete.append(object_name)
        
        # Delete all objects
        for obj_name in objects_to_delete:
            try:
                _remove_object(client, obj_name)
            except Exception as exc:
                errors.append(f"{obj_name}: {exc}")
                logger.warning(f"Failed to delete object {obj_name}: {exc}")
        
        # Delete from Redis cache for all chat IDs found
        if is_redis_available():
            for chat_id in chat_ids_seen:
                try:
                    delete_chat_from_cache(chat_id, client_name, app_name, project_name)
                    logger.debug(f"Deleted chat {chat_id} from Redis cache")
                except Exception as exc:
                    logger.warning(f"Failed to delete chat {chat_id} from Redis cache: {exc}")
        
        deleted_count = len(chat_ids_seen)
        
        if errors:
            logger.warning(f"Some objects failed to delete: {errors}")
        
        logger.info(f"✅ Deleted {deleted_count} chats for project context")
        
    except Exception as exc:
        error_msg = f"Failed to delete all chats for project context: {exc}"
        logger.error(f"❌ {error_msg}")
        raise MemoryStorageError(error_msg) from exc
    
    return deleted_count


def delete_all_sessions(
    client_name: Optional[str] = None,
    app_name: Optional[str] = None,
    project_name: Optional[str] = None,
) -> int:
    """Delete all sessions for a project context from MinIO.
    
    Returns the number of sessions deleted.
    """
    logger.info(f"🗑️ Deleting all sessions for project context: client={client_name}, app={app_name}, project={project_name}")
    
    client = get_client()
    _ensure_bucket(client)
    
    # Get the prefix for all sessions in this project
    prefix = f"{_context_prefix(client_name, app_name, project_name)}/sessions/"
    
    deleted_count = 0
    errors = []
    
    try:
        # List all session objects in this project
        objects: Iterable = client.list_objects(bucket_name=MEMORY_BUCKET, prefix=prefix, recursive=True)
        
        session_ids_seen = set()
        
        # Collect all objects to delete
        objects_to_delete = []
        for obj in objects:
            object_name = obj.object_name
            # Extract session_id from path: trinity_ai_memory/client/app/project/sessions/session_id/context.json
            if object_name.endswith("/context.json"):
                parts = object_name.split("/")
                if len(parts) >= 2:
                    session_id = parts[-2]  # Second to last part is session_id
                    session_ids_seen.add(session_id)
            
            objects_to_delete.append(object_name)
        
        # Delete all objects
        for obj_name in objects_to_delete:
            try:
                _remove_object(client, obj_name)
            except Exception as exc:
                errors.append(f"{obj_name}: {exc}")
                logger.warning(f"Failed to delete object {obj_name}: {exc}")
        
        deleted_count = len(session_ids_seen)
        
        if errors:
            logger.warning(f"Some objects failed to delete: {errors}")
        
        logger.info(f"✅ Deleted {deleted_count} sessions for project context")
        
    except Exception as exc:
        error_msg = f"Failed to delete all sessions for project context: {exc}"
        logger.error(f"❌ {error_msg}")
        raise MemoryStorageError(error_msg) from exc
    
    return deleted_count

