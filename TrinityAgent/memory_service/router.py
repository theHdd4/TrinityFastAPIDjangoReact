from __future__ import annotations

import os
from typing import List, Optional, Tuple

from fastapi import APIRouter, HTTPException, Query, Response, status

from . import storage
from .schemas import (
    ChatListResponse,
    ChatResponse,
    ChatSummary,
    ChatUpsertRequest,
    SessionPayload,
    SessionResponse,
)
from .summarizer import summarize_messages

router = APIRouter(prefix="/memory", tags=["Trinity AI Memory"])


def _get_project_context(
    client: Optional[str] = None,
    app: Optional[str] = None,
    project: Optional[str] = None,
) -> Tuple[str, str, str]:
    """Get client/app/project from parameters, Redis, or database."""
    import logging
    logger = logging.getLogger("trinity.ai.memory.router")
    
    # First try to load from Redis (this is what main_api.py does)
    try:
        from DataStorageRetrieval.arrow_client import load_env_from_redis
        load_env_from_redis()
    except Exception as e:
        logger.debug(f"load_env_from_redis failed: {e}")
    
    # Use provided parameters, centralized config, or environment variables
    try:
        from BaseAgent.config import settings
        client_name = (client or getattr(settings, "CLIENT_NAME", "") or os.getenv("CLIENT_NAME", "")).strip()
        app_name = (app or getattr(settings, "APP_NAME", "") or os.getenv("APP_NAME", "")).strip()
        project_name = (project or getattr(settings, "PROJECT_NAME", "") or os.getenv("PROJECT_NAME", "")).strip()
    except (ImportError, AttributeError):
        try:
            from TrinityAgent.BaseAgent.config import settings
            client_name = (client or getattr(settings, "CLIENT_NAME", "") or os.getenv("CLIENT_NAME", "")).strip()
            app_name = (app or getattr(settings, "APP_NAME", "") or os.getenv("APP_NAME", "")).strip()
            project_name = (project or getattr(settings, "PROJECT_NAME", "") or os.getenv("PROJECT_NAME", "")).strip()
        except (ImportError, AttributeError):
            # Fallback to environment variables
            client_name = (client or os.getenv("CLIENT_NAME", "")).strip()
            app_name = (app or os.getenv("APP_NAME", "")).strip()
            project_name = (project or os.getenv("PROJECT_NAME", "")).strip()
    
    # If all are set, use them
    if client_name and app_name and project_name:
        logger.debug(f"Using provided/env vars: client={client_name}, app={app_name}, project={project_name}")
        return client_name, app_name, project_name
    
    # Otherwise, try to fetch from database
    try:
        # Import the function from main_api
        from main_api import _fetch_names_from_db
        
        # Fetch from database
        client_name, app_name, project_name, debug = _fetch_names_from_db(
            client_name or None,
            app_name or None,
            project_name or None
        )
        
        # Update environment variables for future calls
        if client_name:
            os.environ["CLIENT_NAME"] = client_name
        if app_name:
            os.environ["APP_NAME"] = app_name
        if project_name:
            os.environ["PROJECT_NAME"] = project_name
        
        logger.info(f"Fetched from DB: client={client_name}, app={app_name}, project={project_name}, source={debug.get('source', 'unknown')}")
        
        return client_name or "", app_name or "", project_name or ""
    except Exception as e:
        logger.warning(f"Failed to fetch project context from DB: {e}, using defaults")
        # Fallback to environment or empty strings (which will result in "default" path)
        return client_name or "", app_name or "", project_name or ""


@router.get("/health")
def health_check(
    client: Optional[str] = Query(None, description="Client name"),
    app: Optional[str] = Query(None, description="App name"),
    project: Optional[str] = Query(None, description="Project name"),
) -> dict:
    """Check if the memory service is available."""
    try:
        # Try to list chats to verify storage is working
        client_name, app_name, project_name = _get_project_context(client, app, project)
        storage.list_chats(client_name, app_name, project_name)
        
        # Get the actual path being used
        from .storage import _context_prefix
        path_prefix = _context_prefix(client_name, app_name, project_name)
        
        # Get cache stats if available
        cache_stats = {}
        try:
            from .cache import get_cache_stats
            cache_stats = get_cache_stats()
        except Exception:
            pass
        
        return {
            "status": "healthy",
            "service": "memory",
            "context": {
                "client": client_name or "default",
                "app": app_name or "default",
                "project": project_name or "default"
            },
            "storage_path": path_prefix,
            "cache": cache_stats
        }
    except Exception as e:
        return {"status": "unhealthy", "service": "memory", "error": str(e)}


def _slice_messages(
    chat: ChatResponse,
    offset: int,
    limit: Optional[int],
) -> ChatResponse:
    messages = list(chat.messages)
    total = len(messages)
    start = max(offset, 0)
    end = start + limit if limit is not None else total
    end = min(end, total)

    sliced = messages[start:end]
    truncated = chat.truncated or start > 0 or end < total

    return ChatResponse(
        chat_id=chat.chat_id,
        messages=sliced,
        metadata=chat.metadata,
        total_messages=total,
        offset=start,
        limit=limit,
        truncated=truncated,
        updated_at=chat.updated_at,
    )


@router.get("/chats", response_model=ChatListResponse)
def list_chat_histories(
    client: Optional[str] = Query(None, description="Client name"),
    app: Optional[str] = Query(None, description="App name"),
    project: Optional[str] = Query(None, description="Project name"),
    include_messages: bool = Query(
        True,
        description="Include message payloads in the listing response (defaults to True for backward compatibility).",
    ),
    message_limit: Optional[int] = Query(
        None,  # Changed from 8 to None - return all messages by default
        ge=1,
        le=storage.MAX_MESSAGES_DEFAULT,
        description="Maximum number of messages to include per chat when include_messages is true. If None, returns all messages.",
    ),
) -> ChatListResponse:
    """Return summaries of stored chat transcripts."""
    try:
        client_name, app_name, project_name = _get_project_context(client, app, project)
        records = storage.list_chats(client_name, app_name, project_name)
    except storage.MemoryStorageError as exc:
        raise HTTPException(status_code=500, detail=str(exc))

    summaries: List[ChatSummary] = []
    for record in records:
        raw_messages = list(record.get("messages") or [])
        trimmed_messages = raw_messages
        if include_messages and raw_messages:
            # Only trim if message_limit is explicitly set
            # If None, return all messages to avoid truncation
            if message_limit is not None:
                limit = min(message_limit, storage.MAX_MESSAGES_DEFAULT)
                trimmed_messages = raw_messages[-limit:]
            # else: return all messages (trimmed_messages = raw_messages)
        elif not include_messages:
            trimmed_messages = []

        history_summary = summarize_messages(raw_messages) if raw_messages else None

        summaries.append(
            ChatSummary(
                chat_id=record["chat_id"],
                updated_at=record["updated_at"],
                total_messages=record["total_messages"],
                messages=trimmed_messages,
                history_summary=history_summary,
                metadata=record["metadata"],
            )
        )
    return ChatListResponse(chats=summaries)


@router.get("/chats/{chat_id}", response_model=ChatResponse)
def get_chat_history(
    chat_id: str,
    offset: int = Query(0, ge=0),
    limit: Optional[int] = Query(
        None,
        ge=1,
        description="If provided, return only this many messages starting from offset.",
    ),
) -> ChatResponse:
    """Fetch a persisted chat transcript."""
    try:
        client_name, app_name, project_name = _get_project_context()
        data = storage.load_chat(chat_id, client_name, app_name, project_name)
    except storage.MemoryStorageError as exc:
        raise HTTPException(status_code=500, detail=str(exc))

    if data is None:
        raise HTTPException(status_code=404, detail="Chat history not found")

    chat = ChatResponse(**data)
    return _slice_messages(chat, offset=offset, limit=limit)


@router.post("/chats/{chat_id}", response_model=ChatResponse)
def upsert_chat_history(
    chat_id: str,
    payload: ChatUpsertRequest,
    response: Response,
    client: Optional[str] = Query(None, description="Client name"),
    app: Optional[str] = Query(None, description="App name"),
    project: Optional[str] = Query(None, description="Project name"),
) -> ChatResponse:
    """Create or update a chat transcript."""
    client_name, app_name, project_name = _get_project_context(client, app, project)
    try:
        existing = storage.load_chat(chat_id, client_name, app_name, project_name)
    except storage.MemoryStorageError as exc:
        raise HTTPException(status_code=500, detail=str(exc))

    try:
        record = storage.save_chat(
            chat_id,
            messages=payload.messages,
            metadata=payload.metadata,
            append=payload.append,
            retain_last=payload.retain_last,
            client_name=client_name,
            app_name=app_name,
            project_name=project_name,
        )
    except storage.MemoryStorageError as exc:
        raise HTTPException(status_code=400, detail=str(exc))

    response.status_code = (
        status.HTTP_201_CREATED if existing is None else status.HTTP_200_OK
    )

    chat = ChatResponse(**record)
    return _slice_messages(chat, offset=0, limit=payload.retain_last)


@router.delete("/chats/{chat_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_chat_history(
    chat_id: str,
    client: Optional[str] = Query(None, description="Client name"),
    app: Optional[str] = Query(None, description="App name"),
    project: Optional[str] = Query(None, description="Project name"),
) -> None:
    """Remove a stored chat transcript."""
    try:
        client_name, app_name, project_name = _get_project_context(client, app, project)
        storage.delete_chat(chat_id, client_name, app_name, project_name)
    except storage.MemoryStorageError as exc:
        raise HTTPException(status_code=500, detail=str(exc))


@router.get("/sessions/{session_id}", response_model=SessionResponse)
def get_session_context(session_id: str) -> SessionResponse:
    """Retrieve persisted session context."""
    try:
        client_name, app_name, project_name = _get_project_context()
        record = storage.load_session(session_id, client_name, app_name, project_name)
    except storage.MemoryStorageError as exc:
        raise HTTPException(status_code=500, detail=str(exc))

    if record is None:
        raise HTTPException(status_code=404, detail="Session context not found")

    return SessionResponse(**record)


@router.post(
    "/sessions/{session_id}",
    response_model=SessionResponse,
    status_code=status.HTTP_200_OK,
)
def upsert_session_context(session_id: str, payload: SessionPayload) -> SessionResponse:
    """Persist session context payload."""
    try:
        client_name, app_name, project_name = _get_project_context()
        record = storage.save_session(
            session_id,
            data=payload.data,
            metadata=payload.metadata,
            client_name=client_name,
            app_name=app_name,
            project_name=project_name,
        )
    except storage.MemoryStorageError as exc:
        raise HTTPException(status_code=400, detail=str(exc))

    return SessionResponse(**record)


@router.delete("/sessions/{session_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_session_context(session_id: str) -> None:
    """Delete persisted session context."""
    try:
        client_name, app_name, project_name = _get_project_context()
        storage.delete_session(session_id, client_name, app_name, project_name)
    except storage.MemoryStorageError as exc:
        raise HTTPException(status_code=500, detail=str(exc))


@router.delete("/chats", status_code=status.HTTP_200_OK)
def delete_all_chat_histories(
    client: Optional[str] = Query(None, description="Client name"),
    app: Optional[str] = Query(None, description="App name"),
    project: Optional[str] = Query(None, description="Project name"),
) -> dict:
    """Delete all chat histories for the current project context."""
    try:
        client_name, app_name, project_name = _get_project_context(client, app, project)
        deleted_count = storage.delete_all_chats(client_name, app_name, project_name)
        return {
            "deleted_count": deleted_count,
            "message": f"Deleted {deleted_count} chat(s) for project context"
        }
    except storage.MemoryStorageError as exc:
        raise HTTPException(status_code=500, detail=str(exc))


@router.delete("/sessions", status_code=status.HTTP_200_OK)
def delete_all_session_contexts(
    client: Optional[str] = Query(None, description="Client name"),
    app: Optional[str] = Query(None, description="App name"),
    project: Optional[str] = Query(None, description="Project name"),
) -> dict:
    """Delete all session contexts for the current project context."""
    try:
        client_name, app_name, project_name = _get_project_context(client, app, project)
        deleted_count = storage.delete_all_sessions(client_name, app_name, project_name)
        return {
            "deleted_count": deleted_count,
            "message": f"Deleted {deleted_count} session(s) for project context"
        }
    except storage.MemoryStorageError as exc:
        raise HTTPException(status_code=500, detail=str(exc))


@router.get("/cache/stats")
def get_cache_statistics() -> dict:
    """Get Redis cache statistics."""
    try:
        from .cache import get_cache_stats, is_redis_available, REDIS_CACHE_PREFIX
        # Try importing redis_client from BaseAgent (standardized location)
        try:
            from BaseAgent.redis_client import get_redis_client
        except ImportError:
            try:
                from TrinityAgent.BaseAgent.redis_client import get_redis_client
            except ImportError:
                from redis_client import get_redis_client
        
        stats = get_cache_stats()
        
        # Add detailed cache information
        if stats.get("enabled"):
            try:
                client = get_redis_client()
                # Get all cache keys
                cache_keys = []
                try:
                    # Get all keys matching the cache prefix
                    for key in client.scan_iter(match=f"{REDIS_CACHE_PREFIX}*"):
                        if isinstance(key, bytes):
                            key = key.decode('utf-8')
                        cache_keys.append(key)
                except Exception as e:
                    logger.warning(f"Failed to scan cache keys: {e}")
                
                stats["cached_chat_keys"] = len(cache_keys)
                stats["sample_keys"] = cache_keys[:5]  # Show first 5 keys as sample
            except Exception as e:
                stats["key_scan_error"] = str(e)
        
        return stats
    except ImportError:
        return {
            "enabled": False,
            "error": "Cache module not available"
        }
    except Exception as e:
        return {
            "enabled": False,
            "error": str(e)
        }


@router.get("/cache/verify/{chat_id}")
def verify_chat_cache(
    chat_id: str,
    client: Optional[str] = Query(None, description="Client name"),
    app: Optional[str] = Query(None, description="App name"),
    project: Optional[str] = Query(None, description="Project name"),
) -> dict:
    """Verify if a specific chat is cached in Redis."""
    try:
        from .cache import (
            get_chat_from_cache,
            is_redis_available,
            get_cache_key,
        )
        from . import storage
        # Try importing redis_client from BaseAgent (standardized location)
        try:
            from BaseAgent.redis_client import get_redis_client
        except ImportError:
            try:
                from TrinityAgent.BaseAgent.redis_client import get_redis_client
            except ImportError:
                from redis_client import get_redis_client
        
        client_name, app_name, project_name = _get_project_context(client, app, project)
        
        result = {
            "chat_id": chat_id,
            "context": {
                "client": client_name or "default",
                "app": app_name or "default",
                "project": project_name or "default",
            },
            "redis_available": is_redis_available(),
        }
        
        if not is_redis_available():
            result["error"] = "Redis is not available"
            return result
        
        # Check cache
        cache_key = get_cache_key(chat_id, client_name, app_name, project_name)
        result["cache_key"] = cache_key
        
        redis_client = get_redis_client()
        cached_data = redis_client.get(cache_key)
        
        if cached_data:
            if isinstance(cached_data, bytes):
                cached_data = cached_data.decode('utf-8')
            import json
            data = json.loads(cached_data)
            result["cached"] = True
            result["message_count"] = len(data.get("messages", []))
            result["cache_size_bytes"] = len(cached_data.encode('utf-8'))
            result["ttl"] = redis_client.ttl(cache_key)
        else:
            result["cached"] = False
            result["message_count"] = 0
        
        # Check MinIO
        minio_data = storage.load_chat(chat_id, client_name, app_name, project_name)
        if minio_data:
            result["in_minio"] = True
            result["minio_message_count"] = len(minio_data.get("messages", []))
        else:
            result["in_minio"] = False
            result["minio_message_count"] = 0
        
        return result
    except Exception as e:
        return {
            "error": str(e),
            "chat_id": chat_id
        }

