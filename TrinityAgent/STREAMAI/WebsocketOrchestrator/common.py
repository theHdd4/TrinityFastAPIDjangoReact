"""
Shared fallbacks and logger for the WebSocket orchestrator modules.
"""
from __future__ import annotations

import logging

logger = logging.getLogger("trinity.trinityai.websocket")

# Import atom insights with fallbacks for environments where the package path differs
try:  # pragma: no cover - optional dependency
    from TrinityAgent.atoms.insights import generate_insights
except ImportError:  # pragma: no cover
    try:
        from atoms.insights import generate_insights  # type: ignore
    except ImportError:  # pragma: no cover - insights unavailable
        logger.warning("Atom insights unavailable; TrinityAgent package not on PYTHONPATH")

        def generate_insights(*args, **kwargs):  # type: ignore
            return []


try:  # pragma: no cover
    from starlette.websockets import WebSocketDisconnect  # type: ignore
except ImportError:  # pragma: no cover

    class WebSocketDisconnect(Exception):  # type: ignore
        """Fallback WebSocketDisconnect for environments without starlette."""

        def __init__(self, code: int = 1000, reason: str = "") -> None:
            self.code = code
            self.reason = reason
            super().__init__(code, reason)


try:  # pragma: no cover
    import aiohttp  # type: ignore
except ImportError:  # pragma: no cover
    aiohttp = None  # type: ignore


try:  # pragma: no cover - memory service optional
    from memory_service import storage as memory_storage_module  # type: ignore
    from memory_service.summarizer import summarize_messages as summarize_chat_messages  # type: ignore
except Exception:  # pragma: no cover
    memory_storage_module = None
    summarize_chat_messages = None
