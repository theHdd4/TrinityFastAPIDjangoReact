from __future__ import annotations

from datetime import datetime
from typing import Any, Dict, List, Optional

from pydantic import BaseModel, Field, validator


class ChatUpsertRequest(BaseModel):
    """Payload for creating or updating a chat transcript."""

    messages: List[Dict[str, Any]] = Field(default_factory=list)
    metadata: Optional[Dict[str, Any]] = None
    append: bool = False
    retain_last: Optional[int] = Field(
        default=None,
        ge=1,
        description="If provided, override the default retention window and keep only the last N messages.",
    )

    @validator("messages", each_item=False)
    def _validate_messages(cls, value: List[Dict[str, Any]]) -> List[Dict[str, Any]]:
        if not value:
            return value
        if not isinstance(value, list):
            raise ValueError("messages must be a list")
        for item in value:
            if not isinstance(item, dict):
                raise ValueError("each message must be a JSON object (dict)")
        return value


class ChatResponse(BaseModel):
    """Standard chat payload returned to the client."""

    chat_id: str
    messages: List[Dict[str, Any]]
    metadata: Dict[str, Any] = Field(default_factory=dict)
    total_messages: int
    offset: int = 0
    limit: Optional[int] = None
    truncated: bool = False
    updated_at: datetime


class ChatSummary(BaseModel):
    """Lightweight summary used for chat listings."""

    chat_id: str
    updated_at: Optional[datetime] = None
    total_messages: Optional[int] = None
    metadata: Dict[str, Any] = Field(default_factory=dict)


class ChatListResponse(BaseModel):
    """Wrapper returned by the chat listing endpoint."""

    chats: List[ChatSummary] = Field(default_factory=list)


class SessionPayload(BaseModel):
    """JSON payload stored for a session."""

    data: Dict[str, Any] = Field(default_factory=dict)
    metadata: Dict[str, Any] = Field(default_factory=dict)


class SessionResponse(BaseModel):
    """Response returned when fetching a session context."""

    session_id: str
    data: Dict[str, Any]
    metadata: Dict[str, Any]
    updated_at: datetime


