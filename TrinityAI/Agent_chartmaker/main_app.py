# main_app.py (Enhanced to match Merge Agent's robust approach)

import os
import time
import logging
from typing import Optional, Dict, Any, List, Union

from fastapi import APIRouter, HTTPException
from pydantic import BaseModel, Field

from .llm_chartmaker import ChartMakerAgent

logger = logging.getLogger("smart.chart")
router = APIRouter()

# Standalone configuration functions (no circular imports)
def get_llm_config():
    """Return LLM configuration from environment variables."""
    ollama_ip = os.getenv("OLLAMA_IP", os.getenv("HOST_IP", "172.22.64.1"))
    llm_port = os.getenv("OLLAMA_PORT", "11434")
    api_url = os.getenv("LLM_API_URL", f"http://{ollama_ip}:{llm_port}/api/chat")
    return {
        "api_url": api_url,
        "model_name": os.getenv("LLM_MODEL_NAME", "deepseek-r1:32b"),
        "bearer_token": os.getenv("LLM_BEARER_TOKEN", "aakash_api_key"),
    }

# Initialize agent
cfg = get_llm_config()

logger.info(f"CHART MAKER AGENT INITIALIZATION:")
logger.info(f"LLM Config: {cfg}")

agent = ChartMakerAgent(
    cfg["api_url"], 
    cfg["model_name"], 
    cfg["bearer_token"],
    "minio:9000",  # Default values for compatibility
    "minio",
    "minio123", 
    "trinity",
    ""
)

class ChartRequest(BaseModel):
    prompt: str = Field(..., description="User prompt describing the chart to create")
    session_id: Optional[str] = Field(None, description="Optional session ID for conversation continuity")
    client_name: str = Field("", description="Client name for dynamic path resolution")
    app_name: str = Field("", description="App name for dynamic path resolution")
    project_name: str = Field("", description="Project name for dynamic path resolution")

class FileContextRequest(BaseModel):
    file_id: str = Field(..., description="File ID for chart generation")
    columns: List[str] = Field(..., description="List of available columns in the file")
    file_name: Optional[str] = Field(None, description="Optional file name for display")

class ChartResponse(BaseModel):
    success: bool = Field(..., description="Whether the chart generation was successful")
    message: str = Field(..., description="Success message or error description")
    # 🔧 UNIFIED APPROACH: chart_json can be either a single chart (dict) or multiple charts (list)
    chart_json: Optional[Union[Dict[str, Any], List[Dict[str, Any]]]] = Field(None, description="Chart configuration(s) - single chart as dict or multiple charts as list")
    reasoning: Optional[str] = Field(None, description="Reasoning about the chart generation")
    used_memory: Optional[bool] = Field(None, description="Whether conversation memory was used")
    suggestions: Optional[list] = Field(None, description="Suggestions for improvement if failed")
    next_steps: Optional[list] = Field(None, description="Next steps to take if failed")
    error: Optional[str] = Field(None, description="Error details if applicable")
    session_id: Optional[str] = Field(None, description="Session ID for conversation tracking")
    processing_time: Optional[float] = Field(None, description="Time taken to process the request")
    # 🔧 CRITICAL FIX: Add missing fields for file information
    file_name: Optional[str] = Field(None, description="Name of the file used for chart generation")
    file_context: Optional[Dict[str, Any]] = Field(None, description="Context about available files and current file")
    # 🔧 SMART RESPONSE: Add smart_response field for user-friendly messages
    smart_response: Optional[str] = Field(None, description="Smart, user-friendly response explaining what was created and next steps")

@router.post("/chart", response_model=ChartResponse)
def chart_make(request: ChartRequest):
    """
    Generate a chart configuration based on user prompt.
    Enhanced to match Merge agent's robust approach.
    
    Returns a backend-compatible chart configuration that can be directly used
    with the chart maker backend endpoints.
    """
    start = time.time()
    
    logger.info(f"Chart request: {request.prompt[:100]}... (Session: {request.session_id})")
    
    try:
        result = agent.process(request.prompt, request.session_id, 
                              request.client_name, request.app_name, request.project_name)
        
        # Add processing time
        result["processing_time"] = round(time.time() - start, 2)
        
        # Validate response structure
        if not isinstance(result, dict):
            raise HTTPException(status_code=500, detail="Invalid response format from agent")
        
        # Ensure required fields are present
        if "success" not in result:
            result["success"] = False
            result["message"] = "Missing success status in response"
        
        if "message" not in result:
            result["message"] = "Chart generation completed" if result.get("success") else "Chart generation failed"
        
        # 🔧 SMART RESPONSE FALLBACK: Ensure smart_response is always present
        if "smart_response" not in result or not result["smart_response"]:
            if result.get("success") and result.get("chart_json"):
                # Chart generation success - create smart response
                charts_list = result["chart_json"] if isinstance(result["chart_json"], list) else [result["chart_json"]]
                if len(charts_list) > 1:
                    result["smart_response"] = f"I've created {len(charts_list)} complementary charts for you. These charts provide different perspectives on your data - use the 2-chart layout option to view them simultaneously for better analysis."
                else:
                    chart = charts_list[0]
                    chart_type = chart.get("chart_type", "chart")
                    title = chart.get("title", "your data")
                    result["smart_response"] = f"I've created a {chart_type} chart showing {title}. You can now view this chart in the interface or modify the settings as needed."
            else:
                # Suggestions or error - create smart response
                if result.get("suggestions"):
                    result["smart_response"] = "I can help you create charts from your data. Based on your request, I have some suggestions to get you started. Please let me know what you'd like to visualize or ask me to suggest chart types for your data."
                else:
                    result["smart_response"] = "I'm here to help you create charts and analyze your data. Please describe what you'd like to visualize or ask me for suggestions."
        
        # Clean logging
        logger.info(f"Chart request completed: {result.get('success')} ({result.get('processing_time')}s)")
        
        return ChartResponse(**result)
        
    except Exception as e:
        logger.error(f"Chart request failed: {e}")
        error_response = {
            "success": False,
            "message": f"Internal server error: {str(e)}",
            "error": str(e),
            "session_id": request.session_id,
            "processing_time": round(time.time() - start, 2)
        }
        return ChartResponse(**error_response)

@router.post("/chart-maker", response_model=ChartResponse)
def chart_make_alias(request: ChartRequest):
    """
    Alias endpoint for /chart to support frontend compatibility.
    """
    return chart_make(request)

@router.post("/generate", response_model=ChartResponse)
def chart_generate(request: ChartRequest):
    """
    Generate endpoint for frontend compatibility.
    """
    return chart_make(request)

@router.post("/set-file-context")
def set_file_context(request: FileContextRequest):
    """Set the current file context for chart generation"""
    try:
        agent.set_file_context(request.file_id, request.columns, request.file_name)
        return {
            "success": True,
            "message": f"File context set for {request.file_id} with {len(request.columns)} columns",
            "file_id": request.file_id,
            "columns_count": len(request.columns)
        }
    except Exception as e:
        logger.error(f"Error setting file context: {e}")
        raise HTTPException(status_code=500, detail=f"Failed to set file context: {str(e)}")

@router.get("/file-context")
def get_file_context():
    """Get current file context information"""
    try:
        context = agent.get_file_context()
        return {
            "success": True,
            "file_context": context
        }
    except Exception as e:
        logger.error(f"Error getting file context: {e}")
        raise HTTPException(status_code=500, detail=f"Failed to get file context: {str(e)}")

@router.get("/files")
def list_available_files():
    """List all available files from MinIO for chart generation"""
    try:
        logger.info("Listing available files")
        files_info = agent.list_available_files()
        return files_info
    except Exception as e:
        logger.error(f"Error listing available files: {e}")
        raise HTTPException(status_code=500, detail=f"Failed to list files: {str(e)}")

@router.get("/chart/history/{session_id}")
def chart_history(session_id: str):
    """Get conversation history for a specific session"""
    try:
        logger.info(f"Getting history for session: {session_id}")
        hist = agent.get_session_history(session_id)
        return {
            "success": True,
            "session_id": session_id,
            "complete_history": hist,
            "total_interactions": len(hist)
        }
    except Exception as e:
        logger.error(f"Error retrieving session history: {e}")
        raise HTTPException(status_code=500, detail=f"Failed to retrieve session history: {str(e)}")

@router.get("/chart/health")
def chart_health():
    """Health check endpoint - Enhanced to match Merge agent"""
    try:
        return {
            "status": "healthy",
            "service": "smart_chart_agent",
            "version": "2.0.0",
            "active_sessions": len(agent.sessions),
            "loaded_files": len(agent.files_with_columns),
            "backend_compatibility": "ChartRequest schema compatible",
            "supported_chart_types": ["line", "bar", "area", "pie", "scatter"],
            "supported_aggregations": ["sum", "mean", "count", "min", "max"],
            "file_context_enabled": True,
            "ai_integration": "Full LLM-powered chart generation",
            "features": [
                "complete_memory_context",
                "intelligent_suggestions",
                "conversational_responses",
                "user_preference_learning",
                "enhanced_column_analysis",
                "llm_driven_chart_generation",
                "active_minio_file_loading"
            ]
        }
    except Exception as e:
        logger.error(f"Health check failed: {e}")
        return {
            "status": "unhealthy",
            "service": "smart_chart_agent",
            "error": str(e)
        }
