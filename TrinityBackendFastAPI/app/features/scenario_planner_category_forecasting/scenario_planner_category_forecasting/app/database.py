import logging

import motor.motor_asyncio

from ..config import *

logger = logging.getLogger(__name__)

class DatabaseConnections:
    def __init__(self):
        self.mongo_client = None
        self.minio_client = None
        self.redis_client = None
        
    async def connect_all(self):
        """Initialize all database connections"""
        await self.connect_mongo()
        self.connect_minio()
        self.connect_redis()
        
    async def connect_mongo(self):
        """Connect to MongoDB using the same pattern as clustering atom"""
        try:
            logger.info("Attempting MongoDB connection")
            
            # Use the mongo_client from config (same as clustering atom)
            self.mongo_client = mongo_client
            
            # Test connection by getting database info
            db_info = await self.mongo_client.admin.command('ping')
            logger.info("MongoDB connection established")
            return
                    
        except Exception as e:
            logger.error(f"MongoDB connection failed: {e}")
            raise
            
    def connect_minio(self):
        """Connect to MinIO"""
        try:
            # Use the minio_client from config
            self.minio_client = minio_client
            
            # Test connection by listing buckets
            buckets = list(self.minio_client.list_buckets())
            logger.info(f"MinIO connection established. Found {len(buckets)} buckets")
            
        except Exception as e:
            logger.error(f"MinIO connection error: {e}")
            
    def connect_redis(self):
        """Connect to Redis"""
        try:
            # Use the cache from config
            self.redis_client = cache
            
            # Test connection
            self.redis_client.ping()
            logger.info("Redis connection established")
            
        except Exception as e:
            logger.error(f"Redis connection error: {e}")
            
    async def close_connections(self):
        """Close all connections"""
        if self.mongo_client:
            # Don't close the shared client from config
            pass
        if self.redis_client:
            # Don't close the shared cache from config
            pass

# Global database instance
db = DatabaseConnections()
