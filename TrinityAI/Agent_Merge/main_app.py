# main_merge.py
import json
import logging
import os
import time
from fastapi import APIRouter
from pydantic import BaseModel
from typing import Optional

from .ai_logic import build_merge_prompt, call_merge_llm, extract_json
from .llm_merge import SmartMergeAgent

logger = logging.getLogger("smart.merge")

# Initialize router
router = APIRouter()

# Standalone configuration functions (no circular imports)
def get_llm_config():
    """Return LLM configuration from environment variables."""
    ollama_ip = os.getenv("OLLAMA_IP", os.getenv("HOST_IP", "127.0.0.1"))
    llm_port = os.getenv("OLLAMA_PORT", "11434")
    api_url = os.getenv("LLM_API_URL", f"http://{ollama_ip}:{llm_port}/api/chat")
    return {
        "api_url": api_url,
        "model_name": os.getenv("LLM_MODEL_NAME", "deepseek-r1:32b"),
        "bearer_token": os.getenv("LLM_BEARER_TOKEN", "sushant_api_key"),
    }

# Initialize agent
cfg_llm = get_llm_config()

logger.info(f"MERGE AGENT INITIALIZATION:")
logger.info(f"LLM Config: {cfg_llm}")

agent = SmartMergeAgent(
    cfg_llm["api_url"],
    cfg_llm["model_name"],
    cfg_llm["bearer_token"],
    "minio:9000",  # Default values for compatibility
    "minio",
    "minio123",
    "trinity",
    "",
)

# Trinity AI only generates JSON configuration
# Frontend handles all backend API calls and path resolution

class MergeRequest(BaseModel):
    prompt: str
    session_id: Optional[str] = None
    client_name: Optional[str] = ""
    app_name: Optional[str] = ""
    project_name: Optional[str] = ""

@router.post("/merge")
def merge_files(request: MergeRequest):
    """Smart merge endpoint with complete memory"""
    start_time = time.time()
    
    logger.info(f"MERGE REQUEST RECEIVED:")
    logger.info(f"Prompt: {request.prompt}")
    logger.info(f"Session ID: {request.session_id}")
    logger.info(f"Client: {request.client_name}")
    logger.info(f"App: {request.app_name}")
    logger.info(f"Project: {request.project_name}")
    logger.info(f"🔍 FULL REQUEST TO MERGE AGENT:")
    logger.info(f"{'='*80}")
    logger.info(f"User Prompt: {request.prompt}")
    logger.info(f"Session ID: {request.session_id}")
    logger.info(f"Context: {request.client_name}/{request.app_name}/{request.project_name}")
    logger.info(f"{'='*80}")
    
    try:
        # Process with complete memory context and dynamic path resolution
        result = agent.process_request(
            request.prompt, 
            request.session_id,
            request.client_name or "",
            request.app_name or "",
            request.project_name or ""
        )

        # Add timing
        processing_time = round(time.time() - start_time, 2)
        result["processing_time"] = processing_time

        logger.info(f"MERGE REQUEST COMPLETED:")
        logger.info(f"Success: {result.get('success', False)}")
        logger.info(f"Processing Time: {processing_time}s")
        logger.info(f"🔍 RESULT FROM LLM: {json.dumps(result, indent=2)}")
        logger.info(f"🔍 SMART_RESPONSE IN RESULT: {'smart_response' in result}")
        if 'smart_response' in result:
            logger.info(f"🔍 SMART_RESPONSE VALUE: '{result['smart_response']}'")

        # 🔧 FALLBACK: If smart_response is missing, construct it from other fields
        if "smart_response" not in result or not result.get("smart_response"):
            logger.warning("⚠️ smart_response missing from result, constructing fallback...")
            
            # Build smart_response from suggestions if available
            if result.get("suggestions") and isinstance(result["suggestions"], list):
                smart_text = result.get("message", "Here's what I can help you with") + "\n\n"
                smart_text += "\n".join(result["suggestions"])
                
                # Add file analysis if available
                if result.get("file_analysis"):
                    file_analysis = result["file_analysis"]
                    smart_text += "\n\n📊 File Analysis:\n"
                    if file_analysis.get("total_files"):
                        smart_text += f"• Total files: {file_analysis['total_files']}\n"
                    if file_analysis.get("recommended_pairs"):
                        smart_text += f"• Recommended pairs: {', '.join(file_analysis['recommended_pairs'])}\n"
                    if file_analysis.get("merge_tips"):
                        smart_text += f"• Tips: {', '.join(file_analysis['merge_tips'])}\n"
                
                # Add next steps if available
                if result.get("next_steps") and isinstance(result["next_steps"], list):
                    smart_text += "\n\n🎯 Next Steps:\n"
                    for i, step in enumerate(result["next_steps"], 1):
                        smart_text += f"{i}. {step}\n"
                
                result["smart_response"] = smart_text
                logger.info(f"✅ Constructed smart_response from suggestions: {smart_text[:200]}...")
            
            # Fallback for success case with merge_json
            elif result.get("success") and result.get("merge_json"):
                cfg = result["merge_json"]
                file1 = cfg.get("file1", "")
                file2 = cfg.get("file2", "")
                if isinstance(file1, list):
                    file1 = file1[0] if file1 else ""
                if isinstance(file2, list):
                    file2 = file2[0] if file2 else ""
                join_columns = cfg.get("join_columns", [])
                join_type = cfg.get("join_type", "inner")
                
                result["smart_response"] = f"I've configured the merge operation for you. The files '{file1}' and '{file2}' will be joined using {join_columns} columns with {join_type} join. You can now proceed with the merge or make adjustments as needed."
                logger.info(f"✅ Constructed smart_response for success case")
            
            # Final fallback - generic message
            else:
                result["smart_response"] = result.get("message") or result.get("error") or "I'm here to help you merge your data files. Please describe what files you'd like to merge or ask me for suggestions."
                logger.info(f"✅ Using final fallback smart_response")

        # If merge configuration was successful, return the configuration for frontend to handle
        if result.get("success") and result.get("merge_json"):
            cfg = result["merge_json"]
            file1 = cfg.get("file1")
            if isinstance(file1, list):
                file1 = file1[0] if file1 else ""
            file2 = cfg.get("file2")
            if isinstance(file2, list):
                file2 = file2[0] if file2 else ""
            join_columns = cfg.get("join_columns", ["id"])  # Default to list format
            join_type = cfg.get("join_type", "inner")
            
            # Return clean filenames only - let backend handle path resolution
            # This prevents duplicate path issues
            result["merge_json"] = {
                "file1": file1,  # Just filename, backend will resolve path
                "file2": file2,  # Just filename, backend will resolve path
                "join_columns": join_columns,
                "join_type": join_type,
                "bucket_name": "trinity",  # Add bucket name for compatibility
            }
            
            # Add session ID for consistency
            if request.session_id:
                result["session_id"] = request.session_id
            
            # Update message to indicate configuration is ready
            result["message"] = f"Merge configuration ready: {file1} + {file2} using {join_columns} columns with {join_type} join"

        logger.info(f"🔍 FINAL RESULT TO FRONTEND: {json.dumps(result, indent=2)}")
        logger.info(f"🔍 FINAL SMART_RESPONSE: {'smart_response' in result}")
        if 'smart_response' in result:
            logger.info(f"🔍 FINAL SMART_RESPONSE VALUE: '{result['smart_response']}'")

        return result
        
    except Exception as e:
        logger.error(f"MERGE REQUEST FAILED: {e}")
        error_result = {
            "success": False,
            "error": str(e),
            "processing_time": round(time.time() - start_time, 2),
            "smart_response": f"I encountered an error while processing your request: {str(e)}\n\nPlease try again or rephrase your request. I'm here to help you merge your data files!"
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
        "service": "smart_merge_agent",
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
