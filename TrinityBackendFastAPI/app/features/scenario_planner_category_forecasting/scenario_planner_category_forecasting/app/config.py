# app/config.py

import os
from dotenv import load_dotenv
import motor.motor_asyncio
import redis
import logging
from minio import Minio

load_dotenv()
logger = logging.getLogger(__name__)

# --------------------------------------------------------------------------- #
# MongoDB                                                                     #
# --------------------------------------------------------------------------- #
# Use the same database as the build atom (trinity_db)
MONGO_URI = os.getenv("MONGO_URI", "mongodb://root:rootpass@mongo:27017/trinity_db?authSource=admin")

# Debug: Log environment variables to see what's being set
logger.info("Environment MONGO_URI: %s", os.getenv("MONGO_URI"))
logger.info("Using MONGO_URI: %s", MONGO_URI)

# Create MongoDB client using the same pattern as select atom
mongo_client = motor.motor_asyncio.AsyncIOMotorClient(MONGO_URI, serverSelectionTimeoutMS=5000)

# Get database explicitly like select atom
MONGO_DB = os.getenv("MONGO_DB", "trinity_db")
db = mongo_client[MONGO_DB]

# Debug: Log database information
logger.info("Environment MONGO_DB: %s", os.getenv("MONGO_DB"))
logger.info("Using MONGO_DB: %s", MONGO_DB)
logger.info("Database name: %s", db.name)

# Collection  inshared config database for identifier structure
CONFIG_DB = os.getenv("CLASSIFIER_CONFIG_DB", "trinity_db")
column_classifier_config = mongo_client[CONFIG_DB]["column_classifier_config"]

# Primary collections - use select_configs for model selection
select_models_collection = db["select_configs"]  # Correct collection for selected models
reference_points_collection = db["calculated_reference_points_promo"]
build_collection = db["build-model_featurebased_configs"]
saved_predictions_collection = db["save_prediction_promo"]
flat_aggregations_collection = db["flat_aggregations"]
hierarchical_aggregations_collection = db["hierarchical_aggregations"]

# New collection for scenario values
scenario_values_collection = db["scenario_values_promo"]

logger.info("Mongo URI: %s", MONGO_URI)

# --------------------------------------------------------------------------- #
# MinIO                                                                       #
# --------------------------------------------------------------------------- #
# Use the same MinIO configuration as clustering atom
MINIO_ENDPOINT = os.getenv("MINIO_ENDPOINT", "minio:9000")
MINIO_ACCESS_KEY = os.getenv("MINIO_ACCESS_KEY", "minio")
MINIO_SECRET_KEY = os.getenv("MINIO_SECRET_KEY", "minio123")
MINIO_SECURE = False

# Use the same bucket as other atoms for fetching data
MINIO_BUCKET = os.getenv("MINIO_BUCKET", "trinity")

# Bucket for generated CSV outputs (keep this for scenario-specific outputs)
MINIO_OUTPUT_BUCKET = os.getenv("MINIO_OUTPUT_BUCKET", "scenario-outputs-promo")

minio_client = Minio(
    MINIO_ENDPOINT,
    access_key=MINIO_ACCESS_KEY,
    secret_key=MINIO_SECRET_KEY,
    secure=MINIO_SECURE
)

# --------------------------------------------------------------------------- #
# Redis                                                                       #
# --------------------------------------------------------------------------- #
# Use the same Redis configuration as other atoms (Docker service name)
REDIS_HOST = os.getenv("REDIS_HOST", "redis")
REDIS_PORT = int(os.getenv("REDIS_PORT", 6379))

# Debug: Log environment variables to see what's being set
logger.info("Environment REDIS_HOST: %s", os.getenv("REDIS_HOST"))
logger.info("Environment REDIS_PORT: %s", os.getenv("REDIS_PORT"))
logger.info("Using REDIS_HOST: %s, REDIS_PORT: %s", REDIS_HOST, REDIS_PORT)

# DB 0 → lightweight text / flag cache (existing `cache` object)
cache = redis.Redis(
    host=REDIS_HOST,
    port=REDIS_PORT,
    db=0,
    decode_responses=False,   # UTF-8 strings
    socket_connect_timeout=5,
    socket_timeout=5,
    retry_on_timeout=True,    # Retry on connection timeout
    health_check_interval=30  # Health check every 30 seconds
)

# Don't test connection at import time - let it fail gracefully when used
logger.info("Redis client configured for %s:%s (connection will be tested when used)", REDIS_HOST, REDIS_PORT)

# --------------------------------------------------------------------------- #
# Local output folder for CSVs                                                #
# --------------------------------------------------------------------------- #
OUTPUT_FOLDER = os.getenv("OUTPUT_FOLDER", "/tmp/scenario_outputs")

# Make sure the folder exists at import-time so later writes don't fail
os.makedirs(OUTPUT_FOLDER, exist_ok=True)

# --------------------------------------------------------------------------- #
# Misc application settings                                                   #
# --------------------------------------------------------------------------- #
APP_ENV  = os.getenv("APP_ENV",  "development")
LOG_LEVEL = os.getenv("LOG_LEVEL", "INFO")
