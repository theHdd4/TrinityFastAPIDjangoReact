"""Centralized settings import with resilient fallbacks."""
from __future__ import annotations

# Import centralized settings
try:  # pragma: no cover
    from BaseAgent.config import settings
except ImportError:  # pragma: no cover
    try:
        from TrinityAgent.BaseAgent.config import settings
    except ImportError:  # pragma: no cover
        # Fallback: create minimal settings wrapper if BaseAgent not available
        class SettingsWrapper:
            OLLAMA_IP = None
            OLLAMA_PORT = "11434"
            HOST_IP = "127.0.0.1"
            LLM_API_URL = None
            LLM_MODEL_NAME = "deepseek-r1:32b"
            LLM_BEARER_TOKEN = "aakash_api_key"
            FASTAPI_BASE_URL = None
            FASTAPI_HOST = None
            FASTAPI_PORT = "8001"
            CLIENT_NAME = None
            APP_NAME = None
            PROJECT_NAME = None
            STREAM_AI_ATOM_RETRY_ATTEMPTS = 3
            STREAM_AI_ATOM_RETRY_DELAY_SECONDS = 2.0
            RUNNING_IN_DOCKER = None

        settings = SettingsWrapper()

__all__ = ["settings"]

