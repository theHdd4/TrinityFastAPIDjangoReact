# Redis Cache Verification Guide

This guide shows you how to verify that Redis caching is working correctly for chat memory.

## 1. Check Server Logs

The implementation now includes detailed logging. Look for these log messages:

### When Redis is Available:
- `✅ Redis cache enabled for chat memory` - Redis connection successful
- `💾 CACHED: Chat {id} stored in Redis` - Chat saved to cache
- `✅ CACHE HIT: Chat {id} found in Redis` - Chat loaded from cache (FAST)
- `❌ CACHE MISS: Chat {id} not found in Redis` - Cache miss, loading from MinIO
- `✅ Loaded chat {id} from Redis cache (FAST)` - Successfully loaded from cache

### When Redis is NOT Available:
- `🔴 Redis not available - cache miss` - Redis connection failed
- `🔴 Redis not available, loading chat from MinIO only` - Using MinIO only

## 2. Check Cache Statistics API

### Get Overall Cache Stats:
```bash
GET http://localhost:8002/trinityai/memory/cache/stats
```

Response example:
```json
{
  "enabled": true,
  "size_bytes": 1048576,
  "max_size_bytes": 209715200,
  "size_mb": 1.0,
  "max_size_mb": 200.0,
  "usage_percent": 0.5,
  "cached_chats": 5,
  "cached_chat_keys": 5,
  "sample_keys": [
    "trinity:memory:chat:default:stream_chat_1234567890",
    "trinity:memory:chat:client:app:project:stream_chat_1234567891"
  ]
}
```

### Verify Specific Chat:
```bash
GET http://localhost:8002/trinityai/memory/cache/verify/{chat_id}?client=CLIENT&app=APP&project=PROJECT
```

Response example:
```json
{
  "chat_id": "stream_chat_1234567890",
  "context": {
    "client": "default",
    "app": "default",
    "project": "default"
  },
  "redis_available": true,
  "cache_key": "trinity:memory:chat:default:stream_chat_1234567890",
  "cached": true,
  "message_count": 10,
  "cache_size_bytes": 2048,
  "ttl": 604800,
  "in_minio": true,
  "minio_message_count": 10
}
```

## 3. Check Health Endpoint

The health endpoint now includes cache information:

```bash
GET http://localhost:8002/trinityai/memory/health
```

Response includes cache stats:
```json
{
  "status": "healthy",
  "service": "memory",
  "context": {
    "client": "default",
    "app": "default",
    "project": "default"
  },
  "storage_path": "trinity_ai_memory/default",
  "cache": {
    "enabled": true,
    "size_mb": 1.0,
    "max_size_mb": 200.0,
    "usage_percent": 0.5,
    "cached_chats": 5
  }
}
```

## 4. Direct Redis Inspection

### Using Redis CLI:
```bash
# Connect to Redis
redis-cli

# List all cache keys
KEYS trinity:memory:chat:*

# Get a specific chat
GET trinity:memory:chat:default:stream_chat_1234567890

# Check TTL (time to live)
TTL trinity:memory:chat:default:stream_chat_1234567890

# Check cache size tracking
GET trinity:memory:cache:size

# List all cached chats
HKEYS trinity:memory:chat:list
```

### Using Python:
```python
from redis_client import get_redis_client

client = get_redis_client()

# Get all cache keys
keys = list(client.scan_iter(match="trinity:memory:chat:*"))
print(f"Found {len(keys)} cached chats")

# Get a specific chat
chat_data = client.get("trinity:memory:chat:default:stream_chat_1234567890")
if chat_data:
    import json
    data = json.loads(chat_data.decode('utf-8'))
    print(f"Chat has {len(data.get('messages', []))} messages")
```

## 5. Performance Testing

### Test Cache Hit (Fast):
1. Load a chat for the first time (will load from MinIO and cache)
2. Load the same chat again (should load from Redis - much faster)
3. Check logs for "CACHE HIT" message

### Test Cache Miss:
1. Load a chat that doesn't exist in cache
2. Check logs for "CACHE MISS" message
3. Verify it loads from MinIO and then caches it

## 6. Expected Behavior

### First Load (Cache Miss):
```
📥 Loading chat {id} (Redis cache-aside pattern)
🔍 Checking Redis cache for chat {id} (key: trinity:memory:chat:...)
❌ CACHE MISS: Chat {id} not found in Redis, will load from MinIO
⏳ Cache miss for chat {id}, loading from MinIO...
📦 Loaded chat {id} from MinIO (10 messages)
💾 CACHED: Chat {id} stored in Redis (2048 bytes, 10 messages, TTL: 604800s)
✅ Chat {id} cached in Redis for future fast access
```

### Second Load (Cache Hit):
```
📥 Loading chat {id} (Redis cache-aside pattern)
🔍 Checking Redis cache for chat {id} (key: trinity:memory:chat:...)
✅ CACHE HIT: Chat {id} found in Redis with 10 messages
✅ Loaded chat {id} from Redis cache (FAST)
```

### When Saving:
```
💾 Saved chat {id} to MinIO (10 messages)
💾 CACHED: Chat {id} stored in Redis (2048 bytes, 10 messages, TTL: 604800s)
✅ Updated Redis cache for chat {id}
```

## 7. Troubleshooting

### If Redis is not working:
1. Check Redis connection: `redis-cli ping` should return `PONG`
2. Check environment variables: `REDIS_HOST`, `REDIS_PORT`, `REDIS_PASSWORD`
3. Check logs for connection errors
4. Verify Redis client is imported correctly

### If cache is not being used:
1. Check logs for "Redis not available" messages
2. Verify `is_redis_available()` returns `True`
3. Check cache stats endpoint to see if Redis is enabled
4. Verify cache keys are being created (check Redis directly)

### If cache is full:
- Cache automatically evicts oldest entries when approaching 200MB limit
- Check cache stats to see usage percentage
- Old entries are removed based on TTL (7 days default)

## 8. Monitoring

Monitor these metrics:
- **Cache hit rate**: Number of cache hits vs misses
- **Cache size**: Current usage vs 200MB limit
- **TTL**: Time remaining for cached entries
- **Performance**: Compare load times (Redis vs MinIO)

The cache should significantly improve performance, especially when:
- Loading chat history
- Switching between chats
- Reloading the same chat multiple times

