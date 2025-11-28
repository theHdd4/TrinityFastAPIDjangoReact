"""Redis cache layer for chat memory to improve performance.

This module implements a cache-aside pattern where:
1. Reads check Redis first, fallback to MinIO if not found
2. Writes update both Redis and MinIO
3. Total cache size is limited to 200MB
4. LRU eviction when cache limit is reached
"""
from __future__ import annotations

import json
import logging
import sys
from pathlib import Path
from typing import Any, Dict, List, Optional

# Initialize logger first
logger = logging.getLogger("trinity.ai.memory.cache")

# Try to import Redis client
get_redis_client = None
try:
    # Try importing from BaseAgent first (standardized location)
    try:
        from BaseAgent.redis_client import get_redis_client
        logger.info("✅ Imported redis_client from BaseAgent")
    except ImportError:
        try:
            from TrinityAgent.BaseAgent.redis_client import get_redis_client
            logger.info("✅ Imported redis_client from TrinityAgent.BaseAgent")
        except ImportError:
            # Fallback: try direct import (for backward compatibility)
            try:
                from redis_client import get_redis_client
                logger.info("✅ Imported redis_client directly")
            except ImportError:
                # Fallback if redis_client is not in path
                BACKEND_ROOT = Path(__file__).resolve().parents[1]
                if str(BACKEND_ROOT) not in sys.path:
                    sys.path.insert(0, str(BACKEND_ROOT))
                try:
                    from redis_client import get_redis_client
                    logger.info("✅ Imported redis_client after adding to path")
                except ImportError:
                    logger.warning("Redis client not available, caching disabled")
                    get_redis_client = None
except Exception as e:
    logger.warning(f"Failed to import redis_client: {e}, caching disabled")
    get_redis_client = None

# Cache configuration
REDIS_CACHE_ENABLED = True
REDIS_CACHE_PREFIX = "trinity:memory:chat:"
REDIS_CACHE_LIST_KEY = "trinity:memory:chat:list"
REDIS_CACHE_SIZE_KEY = "trinity:memory:cache:size"
REDIS_MAX_CACHE_SIZE = 200 * 1024 * 1024  # 200MB in bytes
REDIS_CACHE_TTL = 86400 * 7  # 7 days default TTL

# Check if Redis is available
_redis_available = False
if get_redis_client:
    try:
        test_client = get_redis_client()
        test_client.ping()
        _redis_available = True
        logger.info("Redis cache enabled for chat memory")
    except Exception as e:
        logger.warning(f"Redis not available, caching disabled: {e}")
        _redis_available = False
else:
    _redis_available = False


def _get_cache_key(chat_id: str, client_name: Optional[str] = None, 
                   app_name: Optional[str] = None, project_name: Optional[str] = None) -> str:
    """Generate Redis cache key for a chat."""
    # Include context in key to avoid collisions
    context_parts = []
    if client_name:
        context_parts.append(client_name)
    if app_name:
        context_parts.append(app_name)
    if project_name:
        context_parts.append(project_name)
    
    context_str = ":".join(context_parts) if context_parts else "default"
    return f"{REDIS_CACHE_PREFIX}{context_str}:{chat_id}"


def get_cache_key(chat_id: str, client_name: Optional[str] = None, 
                  app_name: Optional[str] = None, project_name: Optional[str] = None) -> str:
    """Public function to get Redis cache key for a chat."""
    return _get_cache_key(chat_id, client_name, app_name, project_name)


def _get_size(data: Dict[str, Any]) -> int:
    """Calculate approximate size of data in bytes."""
    try:
        json_str = json.dumps(data, ensure_ascii=False)
        return len(json_str.encode('utf-8'))
    except Exception:
        # Fallback: estimate based on structure
        return len(str(data).encode('utf-8'))


def is_redis_available() -> bool:
    """Check if Redis is available for caching."""
    return _redis_available and REDIS_CACHE_ENABLED


def get_chat_from_cache(chat_id: str, client_name: Optional[str] = None,
                       app_name: Optional[str] = None, 
                       project_name: Optional[str] = None) -> Optional[Dict[str, Any]]:
    """Get chat from Redis cache."""
    if not is_redis_available():
        logger.info(f"🔴 Redis not available - cache miss for chat {chat_id}")
        return None
    
    try:
        client = get_redis_client()
        cache_key = _get_cache_key(chat_id, client_name, app_name, project_name)
        logger.info(f"🔍 Checking Redis cache for chat {chat_id} (key: {cache_key})")
        cached_data = client.get(cache_key)
        
        if cached_data:
            if isinstance(cached_data, bytes):
                cached_data = cached_data.decode('utf-8')
            data = json.loads(cached_data)
            message_count = len(data.get("messages", []))
            logger.info(f"✅ CACHE HIT: Chat {chat_id} found in Redis with {message_count} messages")
            return data
        else:
            logger.info(f"❌ CACHE MISS: Chat {chat_id} not found in Redis, will load from MinIO")
            return None
    except Exception as e:
        logger.warning(f"⚠️ Failed to get chat from cache: {e}")
        return None


def set_chat_in_cache(chat_id: str, data: Dict[str, Any],
                      client_name: Optional[str] = None,
                      app_name: Optional[str] = None,
                      project_name: Optional[str] = None) -> bool:
    """Store chat in Redis cache with size tracking."""
    if not is_redis_available():
        return False
    
    try:
        client = get_redis_client()
        cache_key = _get_cache_key(chat_id, client_name, app_name, project_name)
        
        # Calculate data size
        data_size = _get_size(data)
        
        # Check if adding this would exceed limit
        current_size = _get_cache_size()
        if current_size + data_size > REDIS_MAX_CACHE_SIZE:
            # Evict oldest entries (LRU) until we have space
            if not _evict_cache_entries(data_size):
                logger.warning(f"Cache full, cannot store chat {chat_id} ({data_size} bytes)")
                return False
        
        # Store the data
        json_data = json.dumps(data, ensure_ascii=False, default=str)
        client.setex(cache_key, REDIS_CACHE_TTL, json_data)
        
        # Update cache size
        _increment_cache_size(data_size)
        
        # Add to cache list for tracking
        _add_to_cache_list(cache_key, chat_id)
        
        message_count = len(data.get("messages", []))
        logger.info(f"💾 CACHED: Chat {chat_id} stored in Redis ({data_size} bytes, {message_count} messages, TTL: {REDIS_CACHE_TTL}s)")
        return True
    except Exception as e:
        logger.warning(f"Failed to cache chat {chat_id}: {e}")
        return False


def delete_chat_from_cache(chat_id: str, client_name: Optional[str] = None,
                          app_name: Optional[str] = None,
                          project_name: Optional[str] = None) -> bool:
    """Remove chat from Redis cache."""
    if not is_redis_available():
        return False
    
    try:
        client = get_redis_client()
        cache_key = _get_cache_key(chat_id, client_name, app_name, project_name)
        
        # Get size before deleting
        cached_data = client.get(cache_key)
        if cached_data:
            if isinstance(cached_data, bytes):
                cached_data = cached_data.decode('utf-8')
            data = json.loads(cached_data)
            data_size = _get_size(data)
            _decrement_cache_size(data_size)
        
        # Delete the key
        deleted = client.delete(cache_key)
        
        # Remove from cache list
        _remove_from_cache_list(cache_key, chat_id)
        
        if deleted:
            logger.debug(f"Deleted chat {chat_id} from cache")
        return deleted > 0
    except Exception as e:
        logger.warning(f"Failed to delete chat from cache: {e}")
        return False


def _get_cache_size() -> int:
    """Get current total cache size."""
    if not is_redis_available():
        return 0
    
    try:
        client = get_redis_client()
        size_str = client.get(REDIS_CACHE_SIZE_KEY)
        if size_str:
            if isinstance(size_str, bytes):
                size_str = size_str.decode('utf-8')
            return int(size_str)
        return 0
    except Exception:
        return 0


def _increment_cache_size(size: int) -> None:
    """Increment cache size counter."""
    if not is_redis_available():
        return
    
    try:
        client = get_redis_client()
        client.incrby(REDIS_CACHE_SIZE_KEY, size)
        client.expire(REDIS_CACHE_SIZE_KEY, REDIS_CACHE_TTL)
    except Exception as e:
        logger.warning(f"Failed to increment cache size: {e}")


def _decrement_cache_size(size: int) -> None:
    """Decrement cache size counter."""
    if not is_redis_available():
        return
    
    try:
        client = get_redis_client()
        current = _get_cache_size()
        new_size = max(0, current - size)
        client.set(REDIS_CACHE_SIZE_KEY, str(new_size))
        client.expire(REDIS_CACHE_SIZE_KEY, REDIS_CACHE_TTL)
    except Exception as e:
        logger.warning(f"Failed to decrement cache size: {e}")


def _add_to_cache_list(cache_key: str, chat_id: str) -> None:
    """Add chat to cache tracking list."""
    if not is_redis_available():
        return
    
    try:
        client = get_redis_client()
        # Store mapping: cache_key -> chat_id for easy lookup
        client.hset(REDIS_CACHE_LIST_KEY, cache_key, chat_id)
        client.expire(REDIS_CACHE_LIST_KEY, REDIS_CACHE_TTL)
    except Exception as e:
        logger.warning(f"Failed to add to cache list: {e}")


def _remove_from_cache_list(cache_key: str, chat_id: str) -> None:
    """Remove chat from cache tracking list."""
    if not is_redis_available():
        return
    
    try:
        client = get_redis_client()
        client.hdel(REDIS_CACHE_LIST_KEY, cache_key)
    except Exception as e:
        logger.warning(f"Failed to remove from cache list: {e}")


def _evict_cache_entries(required_space: int) -> bool:
    """Evict oldest cache entries to make space (LRU)."""
    if not is_redis_available():
        return False
    
    try:
        client = get_redis_client()
        freed_space = 0
        
        # Get all cache keys
        cache_keys = client.hkeys(REDIS_CACHE_LIST_KEY)
        if not cache_keys:
            return False
        
        # Try to free space by deleting oldest entries
        # Note: Redis doesn't have built-in LRU for arbitrary keys,
        # so we'll delete oldest entries based on TTL remaining
        for cache_key in cache_keys:
            if isinstance(cache_key, bytes):
                cache_key = cache_key.decode('utf-8')
            
            # Get TTL to find oldest entries
            ttl = client.ttl(cache_key)
            if ttl < 0:
                # Key expired or doesn't exist, remove from list
                client.hdel(REDIS_CACHE_LIST_KEY, cache_key)
                continue
            
            # Get size of this entry
            cached_data = client.get(cache_key)
            if cached_data:
                if isinstance(cached_data, bytes):
                    cached_data = cached_data.decode('utf-8')
                try:
                    data = json.loads(cached_data)
                    entry_size = _get_size(data)
                    
                    # Delete this entry
                    client.delete(cache_key)
                    client.hdel(REDIS_CACHE_LIST_KEY, cache_key)
                    _decrement_cache_size(entry_size)
                    freed_space += entry_size
                    
                    if freed_space >= required_space:
                        logger.info(f"Evicted {freed_space} bytes from cache")
                        return True
                except Exception:
                    # Invalid data, just remove it
                    client.delete(cache_key)
                    client.hdel(REDIS_CACHE_LIST_KEY, cache_key)
        
        # If we still need more space, clear some more aggressively
        if freed_space < required_space:
            # Delete a few more entries
            remaining_keys = client.hkeys(REDIS_CACHE_LIST_KEY)
            for cache_key in remaining_keys[:5]:  # Delete up to 5 more
                if isinstance(cache_key, bytes):
                    cache_key = cache_key.decode('utf-8')
                cached_data = client.get(cache_key)
                if cached_data:
                    if isinstance(cached_data, bytes):
                        cached_data = cached_data.decode('utf-8')
                    try:
                        data = json.loads(cached_data)
                        entry_size = _get_size(data)
                        client.delete(cache_key)
                        client.hdel(REDIS_CACHE_LIST_KEY, cache_key)
                        _decrement_cache_size(entry_size)
                        freed_space += entry_size
                    except Exception:
                        client.delete(cache_key)
                        client.hdel(REDIS_CACHE_LIST_KEY, cache_key)
        
        logger.info(f"Evicted {freed_space} bytes from cache (requested {required_space})")
        return freed_space >= required_space
    except Exception as e:
        logger.error(f"Failed to evict cache entries: {e}")
        return False


def clear_all_cache() -> bool:
    """Clear all cached chats (for testing/debugging)."""
    if not is_redis_available():
        return False
    
    try:
        client = get_redis_client()
        # Get all cache keys
        cache_keys = client.hkeys(REDIS_CACHE_LIST_KEY)
        if cache_keys:
            for cache_key in cache_keys:
                if isinstance(cache_key, bytes):
                    cache_key = cache_key.decode('utf-8')
                client.delete(cache_key)
        
        # Clear tracking structures
        client.delete(REDIS_CACHE_LIST_KEY)
        client.delete(REDIS_CACHE_SIZE_KEY)
        
        logger.info("Cleared all chat cache")
        return True
    except Exception as e:
        logger.error(f"Failed to clear cache: {e}")
        return False


def get_cache_stats() -> Dict[str, Any]:
    """Get cache statistics."""
    if not is_redis_available():
        return {
            "enabled": False,
            "size_bytes": 0,
            "max_size_bytes": REDIS_MAX_CACHE_SIZE,
            "size_mb": 0,
            "max_size_mb": REDIS_MAX_CACHE_SIZE / (1024 * 1024),
        }
    
    try:
        client = get_redis_client()
        size = _get_cache_size()
        cache_keys = client.hkeys(REDIS_CACHE_LIST_KEY)
        count = len(cache_keys) if cache_keys else 0
        
        return {
            "enabled": True,
            "size_bytes": size,
            "max_size_bytes": REDIS_MAX_CACHE_SIZE,
            "size_mb": round(size / (1024 * 1024), 2),
            "max_size_mb": round(REDIS_MAX_CACHE_SIZE / (1024 * 1024), 2),
            "usage_percent": round((size / REDIS_MAX_CACHE_SIZE) * 100, 2),
            "cached_chats": count,
        }
    except Exception as e:
        logger.warning(f"Failed to get cache stats: {e}")
        return {
            "enabled": False,
            "error": str(e),
        }

