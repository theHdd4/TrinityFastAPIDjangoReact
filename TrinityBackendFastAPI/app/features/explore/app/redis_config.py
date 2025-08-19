# redis_config.py - Redis Configuration for Explore Atom
import redis
from typing import Optional
import os

# =============================================================================
# REDIS CONFIGURATION
# =============================================================================

# Your Redis configuration
REDIS_HOST = os.getenv("REDIS_HOST", "redis")  # Use Docker service name
REDIS_PORT = int(os.getenv("REDIS_PORT", 6379))  # Use standard Redis port
REDIS_DB = 0
REDIS_PASSWORD = None  # Set if you have password authentication

class RedisConfig:
    """Redis configuration and connection management"""
    
    @staticmethod
    def create_connection_pool():
        """Create Redis connection pool for better performance"""
        try:
            pool = redis.ConnectionPool(
                host=REDIS_HOST,
                port=REDIS_PORT,
                db=REDIS_DB,
                password=REDIS_PASSWORD,
                decode_responses=False,  # Keep as bytes for file data
                max_connections=20,
                retry_on_timeout=True,
                socket_connect_timeout=5,
                socket_timeout=5
            )
            return pool
        except Exception as e:
            print(f"Failed to create Redis connection pool: {e}")
            return None

# Global connection pool
redis_pool = RedisConfig.create_connection_pool()

def get_redis_client():
    """Get Redis client using connection pool"""
    try:
        if redis_pool:
            client = redis.Redis(connection_pool=redis_pool)
            # Test connection
            client.ping()
            return client
        else:
            # Fallback direct connection
            client = redis.Redis(
                host=REDIS_HOST,
                port=REDIS_PORT,
                db=REDIS_DB,
                password=REDIS_PASSWORD,
                decode_responses=False,
                socket_timeout=5
            )
            client.ping()
            return client
    except redis.ConnectionError as e:
        print(f"Redis connection failed: {e}")
        return None
    except Exception as e:
        print(f"Redis client error: {e}")
        return None

def test_redis_connection():
    """Test Redis connection"""
    try:
        client = get_redis_client()
        if client:
            # Test basic operations
            client.set("test_key", "test_value")
            value = client.get("test_key")
            client.delete("test_key")
            
            return {
                "status": "success",
                "message": f"Connected to Redis at {REDIS_HOST}:{REDIS_PORT}",
                "test_result": value.decode() if value else None
            }
        else:
            return {"status": "error", "message": "Failed to get Redis client"}
    except Exception as e:
        return {"status": "error", "message": f"Redis test failed: {str(e)}"}