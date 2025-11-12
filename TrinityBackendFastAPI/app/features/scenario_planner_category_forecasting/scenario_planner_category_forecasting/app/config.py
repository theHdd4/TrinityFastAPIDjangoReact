# app/config.py

import logging
import os
from typing import Optional

import motor.motor_asyncio
from dotenv import load_dotenv
from minio import Minio

from app.core.mongo import build_host_mongo_uri
from app.core.feature_cache import feature_cache
from app.core.redis import get_redis_settings

load_dotenv()
logger = logging.getLogger(__name__)


def _sanitize_mongo_uri(uri: Optional[str]) -> Optional[str]:
    """Hide credentials when logging MongoDB connection strings."""

    if not uri:
        return uri
    if "@" in uri:
        try:
            credentials = uri.split("@")[0].split("//")[1]
        except IndexError:
            return uri
        return uri.replace(credentials, "***:***")
    return uri

# --------------------------------------------------------------------------- #
# MongoDB                                                                     #
# --------------------------------------------------------------------------- #
# Use the same database as the build atom (trinity_db)
MONGO_URI = os.getenv("MONGO_URI", "mongodb://root:rootpass@mongo:27017/trinity_db?authSource=admin")

# Debug: Log environment variables to see what's being set
logger.info("Environment MONGO_URI: %s", _sanitize_mongo_uri(os.getenv("MONGO_URI")))
logger.info("Using MONGO_URI: %s", _sanitize_mongo_uri(MONGO_URI))

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

logger.info("Mongo URI: %s", _sanitize_mongo_uri(MONGO_URI))

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
# Shared Redis configuration
_redis_settings = get_redis_settings()
cache = feature_cache.router("scenario_planner_category_forecasting")

if os.getenv("ENVIRONMENT", "production").lower() == "development":
    logger.info(
        "Redis client configured for %s:%s (db %s)",
        _redis_settings.host,
        _redis_settings.port,
        _redis_settings.db,
    )

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
