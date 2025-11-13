from __future__ import annotations

from typing import List, Optional

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

router = APIRouter(prefix="/memory", tags=["Trinity AI Memory"])


@router.get("/health")
def health_check() -> dict:
    """Check if the memory service is available."""
    try:
        # Try to list chats to verify storage is working
        storage.list_chats()
        return {"status": "healthy", "service": "memory"}
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
def list_chat_histories() -> ChatListResponse:
    """Return summaries of stored chat transcripts."""
    try:
        records = storage.list_chats()
    except storage.MemoryStorageError as exc:
        raise HTTPException(status_code=500, detail=str(exc))

    summaries: List[ChatSummary] = []
    for record in records:
        summaries.append(
            ChatSummary(
                chat_id=record["chat_id"],
                updated_at=record["updated_at"],
                total_messages=record["total_messages"],
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
        data = storage.load_chat(chat_id)
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
) -> ChatResponse:
    """Create or update a chat transcript."""
    try:
        existing = storage.load_chat(chat_id)
    except storage.MemoryStorageError as exc:
        raise HTTPException(status_code=500, detail=str(exc))

    try:
        record = storage.save_chat(
            chat_id,
            messages=payload.messages,
            metadata=payload.metadata,
            append=payload.append,
            retain_last=payload.retain_last,
        )
    except storage.MemoryStorageError as exc:
        raise HTTPException(status_code=400, detail=str(exc))

    response.status_code = (
        status.HTTP_201_CREATED if existing is None else status.HTTP_200_OK
    )

    chat = ChatResponse(**record)
    return _slice_messages(chat, offset=0, limit=payload.retain_last)


@router.delete("/chats/{chat_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_chat_history(chat_id: str) -> None:
    """Remove a stored chat transcript."""
    try:
        storage.delete_chat(chat_id)
    except storage.MemoryStorageError as exc:
        raise HTTPException(status_code=500, detail=str(exc))


@router.get("/sessions/{session_id}", response_model=SessionResponse)
def get_session_context(session_id: str) -> SessionResponse:
    """Retrieve persisted session context."""
    try:
        record = storage.load_session(session_id)
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
        record = storage.save_session(
            session_id,
            data=payload.data,
            metadata=payload.metadata,
        )
    except storage.MemoryStorageError as exc:
        raise HTTPException(status_code=400, detail=str(exc))

    return SessionResponse(**record)


@router.delete("/sessions/{session_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_session_context(session_id: str) -> None:
    """Delete persisted session context."""
    try:
        storage.delete_session(session_id)
    except storage.MemoryStorageError as exc:
        raise HTTPException(status_code=500, detail=str(exc))

