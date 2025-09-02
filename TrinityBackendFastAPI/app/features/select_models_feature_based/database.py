# app/database.py

import motor.motor_asyncio
from minio import Minio
from minio.error import S3Error
from .config import settings
from typing import Dict, Any, List
import logging
from datetime import datetime, timedelta

# Configure logging
logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)


# MongoDB Connection with Authentication
client = None
db = None
scopes_collection = None

if all([settings.mongo_details, settings.database_name, settings.collection_name]):
    try:
        # Create connection string without exposing credentials in logs
        mongo_url_safe = settings.mongo_details.replace(
            settings.mongo_details.split('@')[0].split('//')[1],
            "***:***",
        )
        logger.info(f"Connecting to MongoDB: {mongo_url_safe}")

        client = motor.motor_asyncio.AsyncIOMotorClient(
            settings.mongo_details,
            serverSelectionTimeoutMS=5000,
            connectTimeoutMS=5000,
            socketTimeoutMS=5000,
            maxPoolSize=10,
            minPoolSize=1
        )

        db = client[settings.database_name]
        scopes_collection = db.get_collection(settings.collection_name)
        logger.info(f"✅ MongoDB connection established: {settings.database_name}.{settings.collection_name}")

    except Exception as e:
        logger.error(f"❌ MongoDB connection failed: {e}")
        client, db, scopes_collection = None, None, None
else:
    logger.warning("⚠️  MongoDB configuration incomplete")
# MinIO Client Connection - Port 9003
minio_client = None

try:
    if all([settings.minio_url, settings.minio_access_key, settings.minio_secret_key]):
        logger.info(f"Connecting to MinIO: {settings.minio_url} (Port 9003)")
        
        minio_client = Minio(
            settings.minio_url,
            access_key=settings.minio_access_key,
            secret_key=settings.minio_secret_key,
            secure=settings.minio_secure,
        )
        
        # Test connection by listing buckets
        buckets = minio_client.list_buckets()
        bucket_names = [b.name for b in buckets]
        logger.info(f"✅ MinIO connection established on port 9003")
        logger.info(f"Available buckets: {bucket_names}")
        

        # Verify both buckets exist
        # Check primary bucket (model results)
        if settings.minio_bucket_name:
            if not minio_client.bucket_exists(settings.minio_bucket_name):
                logger.warning(f"⚠️  Primary bucket '{settings.minio_bucket_name}' not found")
                try:
                    minio_client.make_bucket(settings.minio_bucket_name)
                    logger.info(f"✅ Created primary bucket: {settings.minio_bucket_name}")
                except S3Error as e:
                    logger.error(f"❌ Failed to create primary bucket: {e}")
            else:
                logger.info(f"✅ Primary bucket '{settings.minio_bucket_name}' verified")

        # Check source data bucket
        if getattr(settings, 'minio_source_bucket_name', None):
            if not minio_client.bucket_exists(settings.minio_source_bucket_name):
                logger.warning(f"⚠️  Source bucket '{settings.minio_source_bucket_name}' not found")
                # Don't create it automatically - it should already exist with data
            else:
                logger.info(f"✅ Source bucket '{settings.minio_source_bucket_name}' verified")
                # List sample files to verify access
                try:
                    objects = list(minio_client.list_objects(settings.minio_source_bucket_name, recursive=False))
                    logger.info(f"✅ Source bucket contains {len(objects)} objects at root level")
                except Exception as e:
                    logger.warning(f"⚠️  Could not list objects in source bucket: {e}")
            
    else:
        logger.warning("⚠️  MinIO configuration incomplete")
        
except Exception as e:
    logger.error(f"❌ MinIO connection failed: {e}")
    logger.error("Please verify:")
    logger.error("1. MinIO server is running on 10.2.1.65:9003")
    logger.error("2. Access key and secret key are correct")
    logger.error("3. Network connectivity is available")
    minio_client = None

# Health check function
async def check_database_health():
    """Comprehensive health check for all services."""
    health_status = {
        "mongodb": {
            "status": False, 
            "details": "", 
            "endpoint": f"{settings.database_name}.{settings.collection_name}"
        },
        "minio": {
            "status": False, 
            "details": "", 
            "endpoint": f"{settings.minio_url} (Port 9003)"
        }
    }
    
    # MongoDB Health Check
    try:
        if client is not None and scopes_collection is not None:
            await client.admin.command('ping')
            count = await scopes_collection.count_documents({})
            health_status["mongodb"]["status"] = True
            health_status["mongodb"]["details"] = f"Connected. Documents: {count}"
        else:
            health_status["mongodb"]["details"] = "Client not initialized"
    except Exception as e:
        health_status["mongodb"]["details"] = f"Error: {str(e)}"
    
    # MinIO Health Check
    try:
        if minio_client:
            buckets = minio_client.list_buckets()
            bucket_names = [b.name for b in buckets]
            
            # Check both configured buckets
            bucket_status = {}
            if settings.minio_bucket_name in bucket_names:
                bucket_status[settings.minio_bucket_name] = "✅ Available"
            else:
                bucket_status[settings.minio_bucket_name] = "❌ Not found"
                
            if hasattr(settings, 'minio_source_bucket_name'):
                if settings.minio_source_bucket_name in bucket_names:
                    bucket_status[settings.minio_source_bucket_name] = "✅ Available"
                else:
                    bucket_status[settings.minio_source_bucket_name] = "❌ Not found"
            
            health_status["minio"]["status"] = True
            health_status["minio"]["details"] = f"Connected. Buckets: {bucket_names}. Status: {bucket_status}"
        else:
            health_status["minio"]["details"] = "Client not initialized"
    except Exception as e:
        health_status["minio"]["details"] = f"Error: {str(e)}"
    
    return health_status

# Utility functions for data processing
def extract_unique_combinations(scopes_data: List[Dict[str, Any]]) -> List[Dict[str, Any]]:
    """Extract all unique combinations from scope data."""
    combination_map = {}
    
    for scope in scopes_data:
        scope_name = scope.get('name', '')
        scope_id = scope.get('scope_id', '')
        validator_id = scope.get('validator_id', '')
        scope_type = scope.get('scope_type', '')
        
        for filter_set in scope.get('filter_set_results', []):
            set_name = filter_set.get('set_name', '')
            start_date = filter_set.get('start_date', '')
            end_date = filter_set.get('end_date', '')
            
            for combo_file in filter_set.get('combination_files', []):
                combo = combo_file.get('combination', {})
                channel = combo.get('Channel', '')
                brand = combo.get('Brand', '')
                ppg = combo.get('PPG', '')
                
                # Create unique combination key
                combo_key = f"{channel}_{brand}_{ppg}"
                
                if combo_key not in combination_map:
                    combination_map[combo_key] = {
                        'combination_id': combo_key,
                        'Channel': channel,
                        'Brand': brand,
                        'PPG': ppg,
                        'scope_names': set(),
                        'set_names': set(),
                        'total_records': 0,
                        'file_keys': set(),
                        'date_ranges': set(),
                        'available_scopes': set(),
                        'file_locations': set()
                    }
                
                # Aggregate data
                combination_map[combo_key]['scope_names'].add(scope_name)
                combination_map[combo_key]['set_names'].add(set_name)
                combination_map[combo_key]['file_keys'].add(combo_file.get('file_key', ''))
                combination_map[combo_key]['available_scopes'].add(scope_id)
                combination_map[combo_key]['total_records'] += combo_file.get('record_count', 0)
                combination_map[combo_key]['file_locations'].add(combo_file.get('filename', ''))
                
                if start_date and end_date:
                    combination_map[combo_key]['date_ranges'].add(f"{start_date}_to_{end_date}")
    
    # Convert to list format
    result = []
    for combo_data in combination_map.values():
        result.append({
            'combination_id': combo_data['combination_id'],
            'Channel': combo_data['Channel'],
            'Brand': combo_data['Brand'],
            'PPG': combo_data['PPG'],
            'scope_names': list(combo_data['scope_names']),
            'set_names': list(combo_data['set_names']),
            'total_records': combo_data['total_records'],
            'file_keys': list(combo_data['file_keys']),
            'date_ranges': [
                {'start_date': dr.split('_to_')[0], 'end_date': dr.split('_to_')[1]} 
                for dr in combo_data['date_ranges']
            ],
            'available_scopes': list(combo_data['available_scopes']),
            'file_locations': list(combo_data['file_locations'])
        })
    
    return result

def get_filter_options(scopes_data: List[Dict[str, Any]]) -> Dict[str, List[str]]:
    """Extract all available filter options."""
    options = {
        'channels': set(),
        'brands': set(),
        'ppgs': set(),
        'scope_types': set(),
        'validator_ids': set()
    }
    
    for scope in scopes_data:
        options['scope_types'].add(scope.get('scope_type', ''))
        options['validator_ids'].add(scope.get('validator_id', ''))
        
        for filter_set in scope.get('filter_set_results', []):
            for combo_file in filter_set.get('combination_files', []):
                combo = combo_file.get('combination', {})
                options['channels'].add(combo.get('Channel', ''))
                options['brands'].add(combo.get('Brand', ''))
                options['ppgs'].add(combo.get('PPG', ''))
    
    return {key: sorted(list(values)) for key, values in options.items()}

# MinIO file operations
def get_presigned_url(file_key: str, expires_in_hours: int = 24) -> str:
    """Generate presigned URL for file download."""
    if not minio_client:
        raise Exception("MinIO client not available")
    
    try:
        url = minio_client.presigned_get_object(
            settings.minio_bucket_name,
            file_key,
            expires=timedelta(hours=expires_in_hours)
        )
        return url
    except S3Error as e:
        logger.error(f"Error generating presigned URL: {e}")
        raise

def get_file_info(file_key: str) -> Dict[str, Any]:
    """Get file information from MinIO."""
    if not minio_client:
        raise Exception("MinIO client not available")
    
    try:
        stat = minio_client.stat_object(settings.minio_bucket_name, file_key)
        return {
            "file_key": file_key,
            "size": stat.size,
            "last_modified": stat.last_modified,
            "etag": stat.etag,
            "content_type": stat.content_type
        }
    except S3Error as e:
        logger.error(f"Error getting file info: {e}")
        raise

def list_files_in_bucket(prefix: str = "") -> List[Dict[str, Any]]:
    """List all files in the bucket with optional prefix filter."""
    if not minio_client:
        raise Exception("MinIO client not available")
    
    try:
        objects = minio_client.list_objects(
            settings.minio_bucket_name,
            prefix=prefix,
            recursive=True
        )
        
        files = []
        for obj in objects:
            files.append({
                "file_key": obj.object_name,
                "size": obj.size,
                "last_modified": obj.last_modified,
                "etag": obj.etag
            })
        
        return files
    except S3Error as e:
        logger.error(f"Error listing files: {e}")
        raise



# Add these functions to your database.py file

async def get_transformation_metadata(transform_id: str):
    """
    Fetch transformation metadata from MongoDB by transform_id.
    This assumes you have a collection storing transformation parameters.
    """
    if db is None:
        logger.error("Database connection not available")
        return None
    
    try:
        # Get the collection where transformation metadata is stored
        transform_collection = db.get_collection("transformation_metadata")
        
        # Find document by transform_id
        transform_doc = await transform_collection.find_one({"transform_id": transform_id})
        
        if transform_doc:
            logger.info(f"Found transformation metadata for ID: {transform_id}")
        else:
            logger.warning(f"No transformation metadata found for ID: {transform_id}")
            
        return transform_doc
        
    except Exception as e:
        logger.error(f"Error fetching transformation metadata: {e}")
        return None


async def get_model_by_transform_and_id(transform_id: str, model_id: int):
    """
    Fetch model results by transform_id and model_id.
    This assumes you have a collection storing model results.
    """
    if db is None:
        logger.error("Database connection not available")
        return None
    
    try:
        # Get the collection where model results are stored
        model_collection = db.get_collection("model_results")
        
        # Find document by both transform_id and model_id
        model_doc = await model_collection.find_one({
            "transform_id": transform_id,
            "model_id": model_id
        })
        
        if model_doc:
            logger.info(f"Found model for transform_id: {transform_id}, model_id: {model_id}")
        else:
            logger.warning(f"No model found for transform_id: {transform_id}, model_id: {model_id}")
            
        return model_doc
        
    except Exception as e:
        logger.error(f"Error fetching model results: {e}")
        return None
