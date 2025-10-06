# main_app.py - DataFrame Operations Agent FastAPI Application

import os
import time
import logging
from typing import Optional, Dict, Any, List, Union

from fastapi import APIRouter, HTTPException, Query
from pydantic import BaseModel, Field

from .llm_dataframe_operations import DataFrameOperationsAgent

logger = logging.getLogger("smart.dataframe_operations")
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

# Initialize agent with error handling
try:
    agent = DataFrameOperationsAgent(
        cfg["api_url"], 
        cfg["model_name"], 
        cfg["bearer_token"],
        "minio:9000",
        "minio",
        "minio123", 
        "trinity",
        ""
    )
    logger.info("DataFrame Operations Agent initialized successfully")
except Exception as e:
    logger.error(f"Failed to initialize DataFrame Operations Agent: {e}")
    agent = None

class DataFrameOperationsRequest(BaseModel):
    prompt: str = Field(..., description="User prompt describing the DataFrame operations to perform")
    session_id: Optional[str] = Field(None, description="Optional session ID for conversation continuity")
    client_name: str = Field("", description="Client name for dynamic path resolution")
    app_name: str = Field("", description="App name for dynamic path resolution")
    project_name: str = Field("", description="Project name for dynamic path resolution")
    current_df_id: Optional[str] = Field(None, description="Current DataFrame ID if working with existing DataFrame")

class ChatRequest(BaseModel):
    query: str = Field(..., description="Natural language query from the user")
    session_id: Optional[str] = Field(None, description="Optional session ID for conversation continuity")
    client_name: str = Field("", description="Client name for dynamic path resolution")
    app_name: str = Field("", description="App name for dynamic path resolution")
    project_name: str = Field("", description="Project name for dynamic path resolution")
    current_df_id: Optional[str] = Field(None, description="Current DataFrame ID if working with existing DataFrame")

class DataFrameContextRequest(BaseModel):
    df_id: str = Field(..., description="DataFrame ID")
    df_state: Dict[str, Any] = Field(..., description="Current state of the DataFrame")

class DataFrameOperationsResponse(BaseModel):
    success: bool = Field(..., description="Whether the operation was successful")
    smart_response: str = Field(..., description="Smart response message for the user")
    dataframe_config: Optional[Dict[str, Any]] = Field(None, description="DataFrame operations configuration")
    execution_plan: Optional[Dict[str, Any]] = Field(None, description="Execution plan for the operations")
    reasoning: Optional[str] = Field(None, description="Reasoning about the operations")
    used_memory: Optional[bool] = Field(None, description="Whether conversation memory was used")
    suggestions: Optional[List[str]] = Field(None, description="Suggestions for improvement if failed")
    next_steps: Optional[List[str]] = Field(None, description="Next steps to take if failed")
    error: Optional[str] = Field(None, description="Error details if applicable")
    session_id: Optional[str] = Field(None, description="Session ID for conversation tracking")
    processing_time: Optional[float] = Field(None, description="Time taken to process the request")
    file_name: Optional[str] = Field(None, description="Name of the file used for operations")
    available_files: Optional[Dict[str, Any]] = Field(None, description="Available files and their columns")

@router.post("/dataframe-operations", response_model=DataFrameOperationsResponse)
def dataframe_operations(request: DataFrameOperationsRequest):
    """
    Generate DataFrame operations configuration based on user prompt.
    Enhanced to match Explore agent's robust approach with full AI integration.
    
    Returns a backend-compatible DataFrame operations configuration that can be directly used
    with the dataframe-operations backend endpoints.
    """
    start = time.time()
    
    
    logger.info(f"DataFrame operations request: {request.prompt[:100]}... (Session: {request.session_id})")
    logger.info(f"Request fields: prompt='{request.prompt}', session_id='{request.session_id}', client_name='{request.client_name}', app_name='{request.app_name}', project_name='{request.project_name}', current_df_id='{request.current_df_id}'")
    
    # Check if agent is initialized
    if agent is None:
        logger.error("DataFrame Operations Agent is not initialized")
        return DataFrameOperationsResponse(
            success=False,
            smart_response="DataFrame Operations service is currently unavailable. Please try again later.",
            error="Agent not initialized",
            session_id=request.session_id,
            processing_time=round(time.time() - start, 2)
        )
    
    # Simple test response to verify endpoint connectivity
    if request.prompt.lower().strip() == "test":
        logger.info("Test request received, returning simple response")
        return DataFrameOperationsResponse(
            success=True,
            smart_response="DataFrame Operations service is working! I can help you with data loading, filtering, sorting, column operations, formulas, and saving results.",
            session_id=request.session_id,
            processing_time=round(time.time() - start, 2)
        )
    
    try:
        result = agent.process(
            request.prompt, 
            request.session_id,
            request.client_name,
            request.app_name,
            request.project_name,
            request.current_df_id
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
                result["smart_response"] = "DataFrame operations configuration completed successfully"
            else:
                result["smart_response"] = "DataFrame operations configuration failed - please try again"
        
        # Add helpful suggestions if not present
        if not result.get("success") and not result.get("suggestions"):
            result["suggestions"] = [
                "Try being more specific about what DataFrame operations you want",
                "Ask about filtering, sorting, adding columns, or transforming data",
                "Specify which file you want to work with",
                "Describe the exact changes you want to make to your data"
            ]
        
        # Clean logging
        logger.info(f"DataFrame operations request completed: {result.get('success')} ({result.get('processing_time')}s)")
        
        
        return DataFrameOperationsResponse(**result)
        
    except Exception as e:
        logger.error(f"DataFrame operations request failed: {e}")
        error_response = {
            "success": False,
            "smart_response": f"Internal server error: {str(e)}",
            "suggestions": [
                "Try rephrasing your request more clearly",
                "Ask for specific DataFrame operations like 'filter data where Country = USA'",
                "Specify which file you want to work with",
                "Check if your request is properly formatted"
            ],
            "error": str(e),
            "session_id": request.session_id,
            "processing_time": round(time.time() - start, 2)
        }
        return DataFrameOperationsResponse(**error_response)

@router.post("/dataframe-operations-data", response_model=DataFrameOperationsResponse)
def dataframe_operations_alias(request: DataFrameOperationsRequest):
    """
    Alias endpoint for /dataframe-operations to support frontend compatibility.
    """
    return dataframe_operations(request)

@router.post("/set-dataframe-context")
def set_dataframe_context(request: DataFrameContextRequest):
    """Set the current DataFrame context for operations"""
    try:
        agent.set_dataframe_context(request.df_id, request.df_state)
        return {
            "success": True,
            "message": f"DataFrame context set for {request.df_id}",
            "df_id": request.df_id
        }
    except Exception as e:
        logger.error(f"Error setting DataFrame context: {e}")
        raise HTTPException(status_code=500, detail=f"Failed to set DataFrame context: {str(e)}")

@router.get("/dataframe-context")
def get_dataframe_context():
    """Get current DataFrame context information"""
    try:
        context = agent.get_dataframe_context()
        return {
            "success": True,
            "dataframe_context": context
        }
    except Exception as e:
        logger.error(f"Error getting DataFrame context: {e}")
        raise HTTPException(status_code=500, detail=f"Failed to get DataFrame context: {str(e)}")

@router.get("/files")
def list_available_files():
    """List all available files from MinIO for DataFrame operations using dynamic paths"""
    try:
        logger.info("Listing available files with dynamic paths")
        files_info = agent.list_available_files()
        return files_info
    except Exception as e:
        logger.error(f"Error listing available files: {e}")
        raise HTTPException(status_code=500, detail=f"Failed to list files: {str(e)}")

@router.get("/dataframe-operations/history/{session_id}")
def dataframe_operations_history(session_id: str):
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

@router.post("/dataframe-operations-chat")
def chat_endpoint(request: ChatRequest):
    """
    Chat endpoint that matches the pattern used by other working agents.
    Provides conversational AI assistance for DataFrame operations.
    """
    start_time = time.time()
    
    
    logger.info(f"DATAFRAME OPERATIONS CHAT REQUEST RECEIVED:")
    logger.info(f"Query: {request.query}")
    logger.info(f"Session ID: {request.session_id}")
    logger.info(f"Current DF ID: {request.current_df_id}")
    
    # Check if agent is initialized
    if agent is None:
        logger.error("DataFrame Operations Agent is not initialized")
        return {
            "success": False,
            "smart_response": "DataFrame Operations service is currently unavailable. Please try again later.",
            "error": "Agent not initialized",
            "session_id": request.session_id,
            "processing_time": round(time.time() - start_time, 2)
        }
    

    try:
        # Process with complete memory context
        result = agent.process_conversation(
            request.query, 
            request.session_id,
            request.client_name,
            request.app_name,
            request.project_name,
            request.current_df_id
        )

        # Add timing
        processing_time = round(time.time() - start_time, 2)
        result["processing_time"] = processing_time

        logger.info(f"DATAFRAME OPERATIONS CHAT REQUEST COMPLETED:")
        logger.info(f"Success: {result.get('success', False)}")
        logger.info(f"Used Memory: {result.get('used_memory', False)}")
        logger.info(f"Processing Time: {processing_time}s")

        # Return response in format expected by AIChatBot
        if result.get("success") and result.get("dataframe_config"):
            # Use smart_response if available, otherwise fallback to message
            smart_response = result.get("smart_response", result.get("message", "DataFrame operations configuration ready"))
            
            # Format for successful DataFrame operations configuration
            response_data = {
                "success": True,
                "smart_response": smart_response,
                "match_type": "single",
                "atom_status": True,
                "atom_name": "dataframe-operations",
                "dataframe_config": result.get("dataframe_config"),
                "execution_plan": result.get("execution_plan"),
                "reasoning": result.get("reasoning", ""),
                "used_memory": result.get("used_memory", False),
                "session_id": request.session_id,
                "processing_time": processing_time
            }
            
            
            return response_data
        else:
            # Format for suggestions and guidance
            smart_response = result.get("smart_response", result.get("message", "I can help you with DataFrame operations. What would you like to do with your data?"))
            
            response_data = {
                "success": False,
                "smart_response": smart_response,
                "suggestions": result.get("suggestions", [
                    "Try being more specific about what DataFrame operations you want",
                    "Ask about filtering, sorting, adding columns, or transforming data",
                    "Specify which file you want to work with",
                    "Describe the exact changes you want to make to your data"
                ]),
                "next_steps": result.get("next_steps", [
                    "Tell me which file you want to work with",
                    "Specify what operations you need (filter, sort, transform, etc.)",
                    "Describe your desired outcome",
                    "Ask about specific DataFrame manipulations"
                ]),
                "session_id": request.session_id,
                "processing_time": processing_time
            }
            
            
            return response_data
        
    except Exception as e:
        logger.error(f"DATAFRAME OPERATIONS CHAT REQUEST FAILED: {e}")
        error_result = {
            "success": False,
            "smart_response": f"I encountered an issue: {str(e)}",
            "suggestions": [
                "Try rephrasing your request more clearly",
                "Ask for specific DataFrame operations like 'filter data where Country = USA'",
                "Specify which file you want to work with",
                "Check if your request is properly formatted"
            ],
            "match_type": "none",
            "atom_status": False,
            "error": str(e),
            "session_id": request.session_id,
            "processing_time": round(time.time() - start_time, 2)
        }
        
        
        return error_result

@router.get("/dataframe-operations/test")
def test_endpoint():
    """Simple test endpoint to verify the service is accessible"""
    return {
        "status": "ok",
        "message": "DataFrame Operations service is accessible",
        "timestamp": time.time()
    }

@router.get("/dataframe-operations/health")
def dataframe_operations_health():
    """Health check endpoint"""
    try:
        agent_status = "initialized" if agent is not None else "failed"
        active_sessions = len(agent.sessions) if agent is not None else 0
        loaded_files = len(agent.files_with_columns) if agent is not None else 0
        dataframe_sessions = len(agent.dataframe_sessions) if agent is not None else 0
        
        return {
            "status": "healthy" if agent is not None else "unhealthy",
            "service": "smart_dataframe_operations_agent",
            "version": "1.0.0",
            "agent_status": agent_status,
            "active_sessions": active_sessions,
            "loaded_files": loaded_files,
            "dataframe_sessions": dataframe_sessions,
            "pattern": "explore_agent_compatible",
            "supported_operations": [
                "load_dataframe", "filter_rows", "sort_dataframe", "insert_row", "delete_row", 
                "duplicate_row", "insert_column", "delete_column", "duplicate_column", 
                "move_column", "retype_column", "rename_column", "edit_cell", "apply_formula", 
                "apply_udf", "ai_execute_batch", "save_dataframe"
            ],
            "supported_file_types": ["csv", "xlsx", "xls", "arrow"],
            "ai_integration": "Full LLM-powered DataFrame operations configuration generation",
            "features": [
                "complete_memory_context",
                "intelligent_suggestions", 
                "conversational_responses",
                "comprehensive_api_coverage",
                "automatic_execution_planning",
                "sequential_operation_chaining",
                "dynamic_file_loading",
                "session_persistence",
                "error_handling",
                "batch_operations"
            ],
            "api_coverage": {
                "data_loading": ["/load", "/load_cached"],
                "row_operations": ["/insert_row", "/delete_row", "/duplicate_row"],
                "column_operations": ["/insert_column", "/delete_column", "/duplicate_column", "/move_column", "/retype_column", "/rename_column"],
                "data_manipulation": ["/edit_cell", "/sort", "/filter_rows"],
                "advanced_operations": ["/apply_formula", "/apply_udf", "/ai/execute_operations"],
                "utility_operations": ["/save", "/preview", "/info"]
            },
            "note": "Comprehensive DataFrame operations with automatic API execution"
        }
    except Exception as e:
        logger.error(f"Health check failed: {e}")
        return {
            "status": "unhealthy",
            "service": "smart_dataframe_operations_agent",
            "error": str(e)
        }
