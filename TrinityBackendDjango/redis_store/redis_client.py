from __future__ import annotations

import sys
from pathlib import Path

# Ensure the shared FastAPI package is on the import path when Django boots.
ROOT = Path(__file__).resolve().parents[2]
if str(ROOT) not in sys.path:
    sys.path.append(str(ROOT))

from TrinityBackendFastAPI.app.core.redis import get_redis_settings, get_sync_redis

redis_client = get_sync_redis(decode_responses=True)
redis_settings = get_redis_settings()

__all__ = ["redis_client", "redis_settings", "get_sync_redis", "get_redis_settings"]
