import os
import redis

# Use the REDIS_URL from Django settings or environment
REDIS_URL = os.getenv("REDIS_URL", "redis://redis:6379/0")

# Create a StrictRedis client from URL
redis_client = redis.StrictRedis.from_url(REDIS_URL, decode_responses=True)

__all__ = ["redis_client"]
