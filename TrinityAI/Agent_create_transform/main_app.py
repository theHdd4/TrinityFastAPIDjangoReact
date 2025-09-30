# main_create_transform.py
import os
import time
import logging
from fastapi import APIRouter
from pydantic import BaseModel
from typing import Optional

from .llm_create import SmartCreateTransformAgent

# Set up logging
logging.basicConfig(level=logging.INFO)
logger = logging.getLogger("trinity.create_transform.app")

# Standalone configuration functions (no circular imports)
def get_llm_config():
    """Return LLM configuration from environment variables."""
    ollama_ip = os.getenv("OLLAMA_IP", os.getenv("HOST_IP", "127.0.0.1"))
    llm_port = os.getenv("OLLAMA_PORT", "11434")
    api_url = os.getenv("LLM_API_URL", f"http://{ollama_ip}:{llm_port}/api/chat")
    return {
        "api_url": api_url,
        "model_name": os.getenv("LLM_MODEL_NAME", "qwen3:30b"),
        "bearer_token": os.getenv("LLM_BEARER_TOKEN", "aakash_api_key"),
    }

# Initialize router and agent
router = APIRouter()

cfg_llm = get_llm_config()

logger.info(f"CREATE TRANSFORM AGENT INITIALIZATION:")
logger.info(f"LLM Config: {cfg_llm}")

agent = SmartCreateTransformAgent(
    cfg_llm["api_url"],
    cfg_llm["model_name"],
    cfg_llm["bearer_token"],
    "minio:9000",  # Default values for compatibility
    "minio",
    "minio123",
    "trinity",
    "",
    {
        "add": "Add multiple numeric columns together (e.g., volume + sales_value)",
        "subtract": "Subtract columns (first column minus others, e.g., revenue - cost)",
        "multiply": "Multiply multiple numeric columns together (e.g., price * quantity)",
        "divide": "Divide columns (first column divided by others, e.g., revenue / volume)",
        "power": "Raise a column to a specified power (e.g., volume^2)",
        "sqrt": "Calculate square root of a numeric column",
        "log": "Calculate natural logarithm of a numeric column",
        "exp": "Calculate exponential of a numeric column",
        "residual": "Calculate residuals from STL decomposition for time series",
        "dummy": "Create dummy variables from categorical columns (e.g., market categories)",
        "seasonality": "Extract seasonal component using STL for time series data",
        "trend": "Extract trend component using STL for time series data",
        "rpi": "Calculate relative price index (price / average_price)",
        "percentile": "Calculate percentile rank of a numeric column",
        "zscore": "Calculate z-score normalization of a numeric column",
        "rolling_mean": "Calculate rolling average with specified window",
        "rolling_sum": "Calculate rolling sum with specified window",
        "lag": "Create lagged version of a column (previous period value)",
        "diff": "Calculate difference between consecutive values",
        "pct_change": "Calculate percentage change between consecutive values"
    },  # supported_operations
    """
[
  {
    "bucket_name": "trinity",
    "object_name": "exact_file_name.extension",
    "add_1": "column1,column2",
    "add_1_rename": "new_column_name",
    "multiply_1": "column3,column4",
    "multiply_1_rename": "product_column",
    "add_2": "column5,column6",
    "add_2_rename": "sum_of_columns"
  }
]

## Operation Examples:
## - "add_1": "volume,salesvalue" → "add_1_rename": "total_volume_sales"
## - "multiply_1": "price,quantity" → "multiply_1_rename": "total_revenue"
## - "subtract_1": "revenue,cost" → "subtract_1_rename": "profit_margin"
## - "divide_1": "revenue,volume" → "divide_1_rename": "price_per_unit"
"""
)

# Trinity AI only generates JSON configuration
# Frontend handles all backend API calls and path resolution

class CreateTransformRequest(BaseModel):
    prompt: str
    session_id: Optional[str] = None
    client_name: str = ""
    app_name: str = ""
    project_name: str = ""

@router.post("/create-transform")
def create_transform_files(request: CreateTransformRequest):
    """Smart create/transform endpoint with complete memory"""
    start_time = time.time()
    
    logger.info(f"CREATE TRANSFORM REQUEST RECEIVED:")
    logger.info(f"Prompt: {request.prompt}")
    logger.info(f"Session ID: {request.session_id}")
    
    try:
        # Process with complete memory context
        result = agent.process_request(request.prompt, request.session_id, 
                                     request.client_name, request.app_name, request.project_name)

        # Add timing
        processing_time = round(time.time() - start_time, 2)
        result["processing_time"] = processing_time

        logger.info(f"CREATE TRANSFORM REQUEST COMPLETED:")
        logger.info(f"Success: {result.get('success', False)}")
        logger.info(f"Processing Time: {processing_time}s")

        # 🔧 PRESERVE LLM SMART RESPONSE: Don't override the smart_response from LLM
        # The LLM already provides detailed smart_response with file information

        if result.get("success") and (result.get("create_transform_json") or result.get("json")):
            # 🔧 FIX: Get config from whichever key exists
            cfg = result.get("create_transform_json") or result.get("json")
            
            # Return the configuration for frontend to handle
            result["create_transform_config"] = cfg
            # Also keep the original key for frontend compatibility
            result["create_transform_json"] = cfg
            # Keep json key as well for frontend handlers
            if "json" not in result:
                result["json"] = cfg
            
            # Add session ID for consistency
            if request.session_id:
                result["session_id"] = request.session_id
            
            # Update message to indicate configuration is ready
            result["message"] = f"Create/Transform configuration ready"
            
            logger.info(f"✅ Configuration extracted successfully from {'create_transform_json' if result.get('create_transform_json') else 'json'} key")

        return result

    except Exception as e:
        logger.error(f"CREATE TRANSFORM REQUEST FAILED: {e}")
        error_result = {
            "success": False,
            "error": str(e),
            "processing_time": round(time.time() - start_time, 2)
        }
        return error_result

@router.get("/history/{session_id}")
def get_complete_history(session_id: str):
    """Get complete session history with all JSON details"""
    logger.info(f"Getting history for session: {session_id}")
    history = agent.get_session_history(session_id)
    
    return {
        "success": True,
        "session_id": session_id,
        "complete_history": history,
        "total_interactions": len(history)
    }

@router.get("/files")
def list_available_files():
    """List all available files"""
    logger.info("Listing available files")
    files = agent.files_with_columns
    return {
        "success": True,
        "total_files": len(files),
        "files": files
    }

@router.get("/health")
def health_check():
    """Health check endpoint"""
    status = {
        "status": "healthy",
        "service": "smart_create_transform_agent",
        "version": "1.0.0",
        "active_sessions": len(agent.sessions),
        "loaded_files": len(agent.files_with_columns),
        "features": [
            "complete_memory_context",
            "intelligent_suggestions",
            "conversational_responses",
            "user_preference_learning",
            "enhanced_column_printing",
            "llm_driven_file_selection"
        ]
    }
    logger.info(f"Health check: {status}")
    return status

# Export the router for mounting in main_api.py
