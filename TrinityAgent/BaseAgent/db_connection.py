"""
Database connection module for Trinity Agent PostgreSQL operations.
Follows the pattern from TrinityBackendFastAPI/app/DataStorageRetrieval/db/connection.py
"""

import logging
from .config import settings
from .exceptions import ConfigurationError

logger = logging.getLogger("trinity.agent_db_connection")

try:
    import asyncpg  # type: ignore
except ModuleNotFoundError:  # pragma: no cover - optional dependency
    asyncpg = None

# Use settings directly - but don't raise at import time to avoid breaking module imports
# Instead, validate when values are actually accessed
try:
    POSTGRES_HOST = settings.POSTGRES_HOST
    POSTGRES_DB = settings.POSTGRES_DB
    POSTGRES_USER = settings.POSTGRES_USER
    POSTGRES_PASSWORD = settings.POSTGRES_PASSWORD
    POSTGRES_PORT = settings.POSTGRES_PORT
    
    logger.info(f"PostgreSQL configuration loaded: host={POSTGRES_HOST}, db={POSTGRES_DB}")
except Exception as e:
    # Configuration error - log warning but don't raise at import time
    # This allows modules to import even if config is invalid
    # The error will be raised when the values are actually used
    error_msg = f"PostgreSQL configuration error: {e}. Please check your .env file."
    logger.warning(error_msg)
    logger.warning("PostgreSQL configuration will fail when actually used. Please fix your .env file.")
    # Set to None so we can detect invalid config later
    POSTGRES_HOST = None
    POSTGRES_DB = None
    POSTGRES_USER = None
    POSTGRES_PASSWORD = None
    POSTGRES_PORT = None

__all__ = [
    "asyncpg",
    "POSTGRES_HOST",
    "POSTGRES_DB",
    "POSTGRES_USER",
    "POSTGRES_PASSWORD",
    "POSTGRES_PORT",
]

