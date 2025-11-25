"""
Database connection module for Trinity Agent PostgreSQL operations.
Follows the pattern from TrinityBackendFastAPI/app/DataStorageRetrieval/db/connection.py
"""

import os
import logging

logger = logging.getLogger("trinity.agent_db_connection")

try:
    import asyncpg  # type: ignore
except ModuleNotFoundError:  # pragma: no cover - optional dependency
    asyncpg = None

# Try to get settings, but fallback to environment variables if Settings fails
try:
    from .config import settings
    POSTGRES_HOST = settings.POSTGRES_HOST
    POSTGRES_DB = settings.POSTGRES_DB
    POSTGRES_USER = settings.POSTGRES_USER
    POSTGRES_PASSWORD = settings.POSTGRES_PASSWORD
    POSTGRES_PORT = settings.POSTGRES_PORT
except Exception as e:
    # Fallback to environment variables if Settings validation fails
    logger.warning(f"Settings validation failed, using environment variables directly: {e}")
    POSTGRES_HOST = os.getenv("POSTGRES_HOST", "postgres")
    POSTGRES_DB = os.getenv("POSTGRES_DB", "trinity_prod")
    POSTGRES_USER = os.getenv("POSTGRES_USER", "trinity_user")
    POSTGRES_PASSWORD = os.getenv("POSTGRES_PASSWORD", "trinity_pass")
    POSTGRES_PORT = os.getenv("POSTGRES_PORT", "5432")

__all__ = [
    "asyncpg",
    "POSTGRES_HOST",
    "POSTGRES_DB",
    "POSTGRES_USER",
    "POSTGRES_PASSWORD",
    "POSTGRES_PORT",
]

