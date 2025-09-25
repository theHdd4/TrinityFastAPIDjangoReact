# main_app.py (Enhanced to match Chart Maker Agent's robust approach)

import os
import time
import logging
from typing import Optional, Dict, Any, List, Union

from fastapi import APIRouter, HTTPException, Query
from pydantic import BaseModel, Field

from .llm_explore import ExploreAgent

logger = logging.getLogger("smart.explore")
router = APIRouter()

def get_llm_config():
    ollama_ip = os.getenv("OLLAMA_IP", os.getenv("HOST_IP", "127.0.0.1"))
    llm_port = os.getenv("OLLAMA_PORT", "11434")
    api_url = os.getenv("LLM_API_URL", f"http://{ollama_ip}:{llm_port}/api/chat")
    return {
        "api_url": api_url,
        "model_name": os.getenv("LLM_MODEL_NAME", "deepseek-r1:32b"),
        "bearer_token": os.getenv("LLM_BEARER_TOKEN", "aakash_api_key"),
    }

cfg = get_llm_config()
agent = ExploreAgent(
    cfg["api_url"], 
    cfg["model_name"], 
    cfg["bearer_token"],
    "minio:9000",  # Default values for compatibility
    "minio",
    "minio123", 
    "trinity",
    ""
)

class ExploreRequest(BaseModel):
    prompt: str = Field(..., description="User prompt describing the data exploration to perform")
    session_id: Optional[str] = Field(None, description="Optional session ID for conversation continuity")
    client_name: str = Field("", description="Client name for dynamic path resolution")
    app_name: str = Field("", description="App name for dynamic path resolution")
    project_name: str = Field("", description="Project name for dynamic path resolution")

# Add chat-compatible request model for frontend integration
class ChatRequest(BaseModel):
    query: str = Field(..., description="Natural language query from the user")
    session_id: Optional[str] = Field(None, description="Optional session ID for conversation continuity")
    client_name: str = Field("", description="Client name for dynamic path resolution")
    app_name: str = Field("", description="App name for dynamic path resolution")
    project_name: str = Field("", description="Project name for dynamic path resolution")

class FileContextRequest(BaseModel):
    file_id: str = Field(..., description="File ID for exploration")
    columns: List[str] = Field(..., description="List of available columns in the file")
    file_name: Optional[str] = Field(None, description="Optional file name for display")

class ExploreResponse(BaseModel):
    success: bool = Field(..., description="Whether the exploration was successful")
    smart_response: str = Field(..., description="Smart response message for the user")
    exploration_config: Optional[Union[Dict[str, Any], List[Dict[str, Any]]]] = Field(None, description="Exploration configuration(s) - single or multiple")
    reasoning: Optional[str] = Field(None, description="Reasoning about the exploration")
    used_memory: Optional[bool] = Field(None, description="Whether conversation memory was used")
    suggestions: Optional[list] = Field(None, description="Suggestions for improvement if failed")
    next_steps: Optional[list] = Field(None, description="Next steps to take if failed")
    error: Optional[str] = Field(None, description="Error details if applicable")
    session_id: Optional[str] = Field(None, description="Session ID for conversation tracking")
    processing_time: Optional[float] = Field(None, description="Time taken to process the request")
    file_name: Optional[str] = Field(None, description="Name of the file used for exploration")
    file_context: Optional[Dict[str, Any]] = Field(None, description="Context about available files and current file")

@router.post("/explore", response_model=ExploreResponse)
def explore_data(request: ExploreRequest):
    """
    Generate exploration configuration based on user prompt.
    Enhanced to match Chart Maker agent's robust approach with full AI integration.
    
    Returns a backend-compatible exploration configuration that can be directly used
    with the explore backend endpoints.
    """
    start = time.time()
    
    logger.info(f"Explore request: {request.prompt[:100]}... (Session: {request.session_id})")
    
    try:
        result = agent.process(
            request.prompt, 
            request.session_id,
            request.client_name,
            request.app_name,
            request.project_name
        )
        
        # Add processing time
        result["processing_time"] = round(time.time() - start, 2)
        
        # Validate response structure
        if not isinstance(result, dict):
            raise HTTPException(status_code=500, detail="Invalid response format from agent")
        
        # Ensure required fields are present with better defaults
        if "success" not in result:
            result["success"] = False
            result["smart_response"] = "Missing success status in response"
        
        if "smart_response" not in result:
            if result.get("success"):
                result["smart_response"] = "Exploration configuration completed successfully"
            else:
                result["smart_response"] = "Exploration configuration failed - please try again"
        
        # Add helpful suggestions if not present
        if not result.get("success") and not result.get("suggestions"):
            result["suggestions"] = [
                "Try being more specific about what you want to explore",
                "Ask about trends, patterns, or outliers in your data",
                "Specify which columns or metrics you're interested in"
            ]
        
        # Clean logging
        logger.info(f"Explore request completed: {result.get('success')} ({result.get('processing_time')}s)")
        
        return ExploreResponse(**result)
        
    except Exception as e:
        logger.error(f"Explore request failed: {e}")
        error_response = {
            "success": False,
            "smart_response": f"Internal server error: {str(e)}",
            "error": str(e),
            "session_id": request.session_id,
            "processing_time": round(time.time() - start, 2)
        }
        return ExploreResponse(**error_response)

@router.post("/explore-data", response_model=ExploreResponse)
def explore_data_alias(request: ExploreRequest):
    """
    Alias endpoint for /explore to support frontend compatibility.
    """
    return explore_data(request)

@router.post("/set-file-context")
def set_file_context(request: FileContextRequest):
    """Set the current file context for exploration"""
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
    """List all available files from MinIO for exploration using dynamic paths"""
    try:
        logger.info("Listing available files with dynamic paths")
        files_info = agent.list_available_files()
        return files_info
    except Exception as e:
        logger.error(f"Error listing available files: {e}")
        raise HTTPException(status_code=500, detail=f"Failed to list files: {str(e)}")

@router.get("/explore/history/{session_id}")
def explore_history(session_id: str):
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

@router.post("/explore-chat")
def chat_endpoint(request: ChatRequest):
    """
    Chat endpoint that matches the pattern used by other working agents.
    Provides conversational AI assistance for data exploration.
    """
    start_time = time.time()
    
    logger.info(f"EXPLORE CHAT REQUEST RECEIVED:")
    logger.info(f"Query: {request.query}")
    logger.info(f"Session ID: {request.session_id}")
    
    try:
        # Process with complete memory context using the same pattern as concat agent
        result = agent.process_conversation(
            request.query, 
            request.session_id,
            request.client_name,
            request.app_name,
            request.project_name
        )

        # Add timing
        processing_time = round(time.time() - start_time, 2)
        result["processing_time"] = processing_time

        logger.info(f"EXPLORE CHAT REQUEST COMPLETED:")
        logger.info(f"Success: {result.get('success', False)}")
        logger.info(f"Used Memory: {result.get('used_memory', False)}")
        logger.info(f"Processing Time: {processing_time}s")

        # Return response in format expected by AIChatBot
        if result.get("success") and result.get("exploration_config"):
            # Use smart_response if available, otherwise fallback to message
            smart_response = result.get("smart_response", result.get("message", "Exploration configuration ready"))
            
            # Format for successful exploration configuration
            return {
                "success": True,
                "smart_response": smart_response,
                "match_type": "single",
                "atom_status": True,
                "atom_name": "explore",
                "exploration_config": result.get("exploration_config"),
                "reasoning": result.get("reasoning", ""),
                "used_memory": result.get("used_memory", False),
                "session_id": request.session_id,
                "processing_time": processing_time
            }
        else:
            # Format for suggestions and guidance - return only smart_response
            smart_response = result.get("smart_response", result.get("message", "I can help you explore your data. What would you like to analyze?"))
            
            return {
                "success": False,
                "smart_response": smart_response,
                "session_id": request.session_id,
                "processing_time": processing_time
            }
        
    except Exception as e:
        logger.error(f"EXPLORE CHAT REQUEST FAILED: {e}")
        error_result = {
            "success": False,
            "smart_response": f"I encountered an issue: {str(e)}",
            "match_type": "none",
            "atom_status": False,
            "error": str(e),
            "session_id": request.session_id,
            "processing_time": round(time.time() - start_time, 2)
        }
        return error_result

# Backend integration endpoints removed - following chart maker pattern
# The explore agent now only generates configuration, frontend handles execution

@router.get("/explore/health")
def explore_health():
    """Health check endpoint - Following Chart Maker pattern"""
    try:
        return {
            "status": "healthy",
            "service": "smart_explore_agent",
            "version": "3.0.0",
            "active_sessions": len(agent.sessions),
            "loaded_files": len(agent.files_with_columns),
            "pattern": "chart_maker_compatible",
            "supported_exploration_types": ["pattern_analysis", "correlation_study", "trend_analysis", "outlier_detection", "statistical_summary"],
            "supported_visualizations": ["bar_chart", "line_chart", "pie_chart", "table", "stacked_bar_chart"],
            "file_context_enabled": True,
            "ai_integration": "Full LLM-powered data exploration configuration generation",
            "features": [
                "complete_memory_context",
                "intelligent_suggestions",
                "conversational_responses",
                "enhanced_column_analysis",
                "llm_driven_exploration",
                "active_minio_file_loading",
                "configuration_generation_only",
                "frontend_execution_pattern",
                "multi_exploration_support"
            ],
            "note": "Configuration generation only - frontend handles execution (like chart maker)"
        }
    except Exception as e:
        logger.error(f"Health check failed: {e}")
        return {
            "status": "unhealthy",
            "service": "smart_explore_agent",
            "error": str(e)
        }