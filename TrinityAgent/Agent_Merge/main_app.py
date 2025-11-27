"""
Standardized Merge Agent using BaseAgent infrastructure
Connects to backend via FastAPI router
"""

import sys
import json
import logging
from pathlib import Path
from typing import Dict, Any, Optional
from fastapi import APIRouter
from pydantic import BaseModel

# ============================================================================
# IMPORT ROUTER FROM router.py (always available)
# This ensures router is always available even if agent init fails
# ============================================================================
from .router import router

# Initialize logger early
logger = logging.getLogger("trinity.agent_merge")

# Add parent directory to path to import BaseAgent
parent_dir = Path(__file__).parent.parent
if str(parent_dir) not in sys.path:
    sys.path.insert(0, str(parent_dir))
    logger.info(f"✅ Added parent directory to sys.path: {parent_dir}")

# Import BaseAgent - if this fails, we'll still have the router but agent won't work
# Wrap in try-except to prevent import failures from breaking router export
BaseAgent = None
AgentContext = None
AgentResult = None
settings = None
MergePromptBuilder = None

logger.info("=" * 80)
logger.info("ATTEMPTING TO IMPORT BASEAGENT")
logger.info("=" * 80)
logger.info(f"Parent directory: {parent_dir}")
logger.info(f"BaseAgent path: {parent_dir / 'BaseAgent'}")
logger.info(f"BaseAgent exists: {(parent_dir / 'BaseAgent').exists()}")

try:
    try:
        logger.info("Strategy 1: Importing from BaseAgent.__init__.py (package import)...")
        from BaseAgent import BaseAgent, AgentContext, AgentResult, settings
        from .merge_prompt import MergePromptBuilder
        logger.info("✅ Imported BaseAgent from BaseAgent package (__init__.py)")
    except ImportError as e1:
        logger.warning(f"Strategy 1 failed: {e1}")
        import traceback
        logger.warning(f"Strategy 1 traceback: {traceback.format_exc()}")
        try:
            logger.info("Strategy 2: Importing from BaseAgent modules directly...")
            from BaseAgent.base_agent import BaseAgent
            from BaseAgent.interfaces import AgentContext, AgentResult
            from BaseAgent.config import settings
            from .merge_prompt import MergePromptBuilder
            logger.info("✅ Imported BaseAgent from local BaseAgent modules")
        except ImportError as e2:
            logger.warning(f"Strategy 2 failed: {e2}")
            import traceback
            logger.warning(f"Strategy 2 traceback: {traceback.format_exc()}")
            try:
                # Fallback import
                logger.info("Strategy 3: Importing from TrinityAgent.BaseAgent (absolute)...")
                from TrinityAgent.BaseAgent import BaseAgent, AgentContext, AgentResult, settings
                from .merge_prompt import MergePromptBuilder
                logger.info("✅ Imported BaseAgent from TrinityAgent.BaseAgent package")
            except ImportError as e3:
                logger.error(f"Strategy 3 also failed: {e3}")
                import traceback
                logger.error(f"Strategy 3 traceback: {traceback.format_exc()}")
                logger.error(f"Failed to import BaseAgent from all locations: {e1}, {e2}, {e3}")
                logger.error("Router will be available but agent functionality will not work")
                # Don't raise - let the router be created and routes be registered
                # The endpoints will check if agent is initialized and return errors if not
except Exception as e:
    # Catch any other exceptions during import (e.g., Pydantic errors)
    logger.error("=" * 80)
    logger.error(f"❌ UNEXPECTED ERROR DURING BASEAGENT IMPORT: {e}")
    import traceback
    logger.error(f"Full traceback:\n{traceback.format_exc()}")
    logger.error("Router will be available but agent functionality will not work")
    logger.error("=" * 80)
    # Continue - router is already created and routes will be registered

# Only define MergeAgent if BaseAgent was imported successfully
if BaseAgent is not None:
    class MergeAgent(BaseAgent):
        """
        Standardized Merge Agent using BaseAgent infrastructure.
        Only implements merge-specific logic.
        """
        
        @property
        def name(self) -> str:
            return "merge"
        
        @property
        def description(self) -> str:
            return "Merges data files using various join strategies (inner, outer, left, right)"
        
        def _call_llm(self, prompt: str, temperature: float = 0.1, num_predict: int = 4000) -> str:
            """
            Override to add logging for raw LLM response.
            """
            # Call parent method
            llm_response = super()._call_llm(prompt, temperature, num_predict)
            
            # Log what we received from LLM
            logger.info("=" * 80)
            logger.info("📥 RECEIVED FROM MERGE LLM:")
            logger.info("=" * 80)
            logger.info(f"Response Length: {len(llm_response)} characters")
            logger.info("-" * 80)
            logger.info("RAW LLM RESPONSE (BEFORE PROCESSING):")
            logger.info("-" * 80)
            logger.info(llm_response)
            logger.info("=" * 80)
            
            return llm_response
        
        def _extract_json(self, response: str) -> Optional[Dict[str, Any]]:
            """
            Override to add logging for extracted JSON.
            """
            # Call parent method
            result = super()._extract_json(response)
            
            # Log what we extracted
            logger.info("=" * 80)
            logger.info("🔍 EXTRACTED JSON FROM LLM RESPONSE:")
            logger.info("=" * 80)
            if result:
                logger.info("✅ JSON Extraction Successful")
                logger.info(f"Extracted Keys: {list(result.keys())}")
                logger.info("-" * 80)
                logger.info("EXTRACTED JSON (BEFORE VALIDATION/NORMALIZATION):")
                logger.info("-" * 80)
                logger.info(json.dumps(result, indent=2))
            else:
                logger.warning("❌ JSON Extraction Failed - No JSON found in response")
            logger.info("=" * 80)
            
            return result
        
        def _build_prompt(
            self,
            user_prompt: str,
            available_files: Dict[str, Any],
            context: str
        ) -> str:
            """
            Build merge-specific prompt using MergePromptBuilder.
            BaseAgent handles file loading and context building automatically.
            """
            # Use MergePromptBuilder to build the prompt
            # BaseAgent's execute() method provides available_files and context
            prompt = MergePromptBuilder.build_merge_prompt(
                user_prompt=user_prompt,
                available_files_with_columns=available_files,
                context=context,
                file_details={},  # Can be enhanced if needed
                other_files=[],
                matched_columns={}
            )
            
            # Log what we're sending to LLM
            logger.info("=" * 80)
            logger.info("📤 SENDING TO MERGE LLM:")
            logger.info("=" * 80)
            logger.info(f"Prompt Length: {len(prompt)} characters")
            logger.info(f"User Prompt: {user_prompt}")
            logger.info(f"Available Files Count: {len(available_files)}")
            logger.info("-" * 80)
            logger.info("FULL PROMPT SENT TO LLM:")
            logger.info("-" * 80)
            logger.info(prompt)
            logger.info("=" * 80)
            
            return prompt
        
        def _validate_json(self, result: Dict[str, Any]) -> bool:
            """
            Validate merge-specific JSON structure.
            BaseAgent handles general validation, this adds merge-specific checks.
            """
            if not isinstance(result, dict):
                return False
            
            # If success is True, must have merge_json
            if result.get("success") is True:
                if "merge_json" not in result:
                    return False
                
                merge_json = result.get("merge_json", {})
                if not isinstance(merge_json, dict):
                    return False
                
                # Must have file1 and file2
                if "file1" not in merge_json or "file2" not in merge_json:
                    return False
                
                # Must have join_columns and join_type
                if "join_columns" not in merge_json or "join_type" not in merge_json:
                    return False
                
                join_type = merge_json.get("join_type")
                if join_type not in ["inner", "outer", "left", "right"]:
                    return False
            
            # Must have smart_response (BaseAgent requirement)
            if "smart_response" not in result:
                return False
            
            # Must have response (raw thinking)
            if "response" not in result:
                return False
            
            return True
        
        def _normalize_result(self, result: Dict[str, Any]) -> Dict[str, Any]:
            """
            Normalize merge result to ensure consistent format.
            BaseAgent handles general normalization.
            """
            normalized = {
                "success": result.get("success", False),
                "response": result.get("response", ""),  # Raw LLM thinking
                "smart_response": result.get("smart_response", ""),
            }
            
            # Add merge_json if present
            if "merge_json" in result:
                merge_json = result["merge_json"]
                normalized["merge_json"] = {
                    "bucket_name": merge_json.get("bucket_name", "trinity"),
                    "file1": merge_json.get("file1", []),
                    "file2": merge_json.get("file2", []),
                    "join_columns": merge_json.get("join_columns", []),
                    "join_type": merge_json.get("join_type", "outer")
                }
            
            # Add other fields
            if "suggestions" in result:
                normalized["suggestions"] = result["suggestions"]
            
            if "reasoning" in result:
                normalized["reasoning"] = result["reasoning"]
            
            if "used_memory" in result:
                normalized["used_memory"] = result["used_memory"]
            
            if "file_analysis" in result:
                normalized["file_analysis"] = result["file_analysis"]
            
            if "next_steps" in result:
                normalized["next_steps"] = result["next_steps"]
            
            return normalized
        
        def _create_fallback_response(self, session_id: str) -> Dict[str, Any]:
            """
            Create fallback response when JSON extraction fails.
            Uses merge-specific template.
            """
            # Try to get favorite files from memory
            favorite_files = []
            try:
                session_data = self.load_session_from_memory(session_id)
                if session_data and "favorite_files" in session_data:
                    favorite_files = list(session_data.get("favorite_files", {}).keys())[:3]
            except:
                pass
            
            return {
                "success": False,
                "response": "Raw thinking: I encountered an issue processing the request. Based on the user's history, I can see they have used these files before. Let me provide helpful suggestions to guide them.",
                "smart_response": f"I had trouble processing your request. {'Let me suggest based on your previous usage: ' + ', '.join(favorite_files) if favorite_files else 'Please try with specific file names.'}",
                "suggestions": [
                    "I had trouble processing your request",
                    f"Files you've used before: {', '.join(favorite_files) if favorite_files else 'None yet'}",
                    f"Available files: {', '.join(list(self.files_with_columns.keys())[:5])}",
                    "Example: 'merge file1.csv with file2.csv using id column'"
                ],
                "recommended_files": favorite_files,
                "next_steps": [
                    "Please try with specific file names",
                    "Or say 'yes' if you want to use suggested files",
                    "Or say 'show me available files' to see all options"
                ]
            }
else:
    # Define MergeAgent as None if BaseAgent is not available
    MergeAgent = None


# ============================================================================
# Router already created at module level (above)
# Log router creation status
# ============================================================================
logger.info("=" * 80)
logger.info("MERGE AGENT MODULE LOADING")
logger.info("=" * 80)
logger.info(f"Router created: {router is not None}")
logger.info(f"Router type: {type(router)}")
logger.info(f"BaseAgent imported: {BaseAgent is not None}")

# Initialize agent variables
agent = None
agent_initialized = False

# ============================================================================
# INITIALIZE AGENT WITH CONFIGURATION
# Only initialize if BaseAgent was imported successfully
# ============================================================================
if BaseAgent is not None and settings is not None:
    logger.info("=" * 80)
    logger.info("INITIALIZING MERGE AGENT")
    logger.info("=" * 80)
    
    try:
        logger.info("Getting LLM and MinIO configuration...")
        llm_config = settings.get_llm_config()
        minio_config = settings.get_minio_config()
        logger.info(f"LLM Config: {llm_config.get('api_url', 'N/A')}")
        logger.info(f"MinIO Config: {minio_config.get('endpoint', 'N/A')}")
        
        logger.info("Creating MergeAgent instance...")
        agent = MergeAgent(
            api_url=llm_config["api_url"],
            model_name=llm_config["model_name"],
            bearer_token=llm_config["bearer_token"],
            minio_endpoint=minio_config["endpoint"],
            access_key=minio_config["access_key"],
            secret_key=minio_config["secret_key"],
            bucket=minio_config["bucket"],
            prefix=minio_config["prefix"]
        )
        
        logger.info("✅ MergeAgent initialized successfully")
        logger.info(f"Agent name: {agent.name}")
        logger.info(f"Agent description: {agent.description}")
        agent_initialized = True
        logger.info("=" * 80)
    except Exception as e:
        logger.error("=" * 80)
        logger.error(f"❌ Failed to initialize MergeAgent: {e}", exc_info=True)
        logger.error("=" * 80)
        agent = None
        agent_initialized = False
else:
    logger.warning("=" * 80)
    logger.warning("⚠️ BaseAgent not imported - agent will not be initialized")
    logger.warning("Router and routes will still be available")
    logger.warning("Agent will attempt to initialize on first request")
    logger.warning("=" * 80)


def _retry_baseagent_import():
    """Retry importing BaseAgent - useful if import failed at module load time."""
    global BaseAgent, AgentContext, AgentResult, settings, MergePromptBuilder
    
    if BaseAgent is not None:
        return True  # Already imported
    
    logger.info("Retrying BaseAgent import...")
    parent_dir = Path(__file__).parent.parent
    if str(parent_dir) not in sys.path:
        sys.path.insert(0, str(parent_dir))
    
    try:
        try:
            logger.info("Retry Strategy 1: Importing from BaseAgent package...")
            from BaseAgent import BaseAgent, AgentContext, AgentResult, settings
            from .merge_prompt import MergePromptBuilder
            logger.info("✅ BaseAgent imported successfully on retry")
            return True
        except ImportError as e1:
            logger.warning(f"Retry Strategy 1 failed: {e1}")
            try:
                logger.info("Retry Strategy 2: Importing from BaseAgent modules...")
                from BaseAgent.base_agent import BaseAgent
                from BaseAgent.interfaces import AgentContext, AgentResult
                from BaseAgent.config import settings
                from .merge_prompt import MergePromptBuilder
                logger.info("✅ BaseAgent imported successfully on retry (modules)")
                return True
            except ImportError as e2:
                logger.warning(f"Retry Strategy 2 failed: {e2}")
                try:
                    logger.info("Retry Strategy 3: Importing from TrinityAgent.BaseAgent...")
                    from TrinityAgent.BaseAgent import BaseAgent, AgentContext, AgentResult, settings
                    from .merge_prompt import MergePromptBuilder
                    logger.info("✅ BaseAgent imported successfully on retry (absolute)")
                    return True
                except ImportError as e3:
                    logger.error(f"All retry strategies failed: {e1}, {e2}, {e3}")
                    return False
    except Exception as e:
        logger.error(f"Unexpected error during BaseAgent retry import: {e}", exc_info=True)
        return False


class MergeRequest(BaseModel):
    """Request model for merge endpoint."""
    prompt: str
    session_id: Optional[str] = None
    client_name: str = ""
    app_name: str = ""
    project_name: str = ""


# Test endpoint to verify router is working
@router.get("/merge/test")
def test_endpoint() -> Dict[str, Any]:
    """Test endpoint to verify router is registered."""
    return {
        "success": True,
        "message": "Merge router is working!",
        "router_created": router is not None,
        "agent_initialized": agent_initialized if 'agent_initialized' in globals() else False
    }


@router.post("/merge")
def merge_files(request: MergeRequest) -> Dict[str, Any]:
    """
    Smart merge endpoint with complete memory.
    Connects to backend via standardized BaseAgent interface.
    """
    import time
    start_time = time.time()
    
    # Try to initialize agent if not already initialized
    global agent, agent_initialized, BaseAgent, settings, MergeAgent
    
    if not agent_initialized or agent is None:
        logger.warning("MergeAgent not initialized - attempting to initialize now...")
        
        # First, try to retry BaseAgent import if it failed
        if BaseAgent is None or settings is None:
            logger.info("BaseAgent not imported - attempting to retry import...")
            if not _retry_baseagent_import():
                logger.error("BaseAgent import retry failed - cannot initialize agent")
                return {
                    "success": False,
                    "error": "MergeAgent not initialized - BaseAgent import failed",
                    "smart_response": "The merge agent is not available. BaseAgent could not be imported. Please check server logs for details.",
                    "processing_time": round(time.time() - start_time, 2)
                }
            
            # MergeAgent should already be defined at module level if BaseAgent was imported
            # If it's still None, that means BaseAgent import succeeded but MergeAgent wasn't defined
            # This shouldn't happen, but if it does, we can't define it here (would be a nested class)
            if BaseAgent is not None and MergeAgent is None:
                logger.error("BaseAgent imported but MergeAgent class not found - this should not happen")
                logger.error("MergeAgent should be defined at module level when BaseAgent is imported")
        
        # Try to initialize now
        if BaseAgent is not None and settings is not None:
            try:
                logger.info("Attempting to initialize MergeAgent on-demand...")
                llm_config = settings.get_llm_config()
                minio_config = settings.get_minio_config()
                
                agent = MergeAgent(
                    api_url=llm_config["api_url"],
                    model_name=llm_config["model_name"],
                    bearer_token=llm_config["bearer_token"],
                    minio_endpoint=minio_config["endpoint"],
                    access_key=minio_config["access_key"],
                    secret_key=minio_config["secret_key"],
                    bucket=minio_config["bucket"],
                    prefix=minio_config["prefix"]
                )
                agent_initialized = True
                logger.info("✅ MergeAgent initialized successfully on-demand")
            except Exception as init_error:
                logger.error(f"❌ Failed to initialize MergeAgent on-demand: {init_error}", exc_info=True)
                return {
                    "success": False,
                    "error": f"MergeAgent initialization failed: {str(init_error)}",
                    "smart_response": "The merge agent could not be initialized. Please check server logs for details.",
                    "processing_time": round(time.time() - start_time, 2)
                }
        else:
            logger.error("BaseAgent or settings still not available after retry")
            return {
                "success": False,
                "error": "MergeAgent not initialized - BaseAgent import failed",
                "smart_response": "The merge agent is not available. BaseAgent could not be imported. Please check server logs for details.",
                "processing_time": round(time.time() - start_time, 2)
            }
    
    if not agent_initialized or agent is None:
        logger.error("MergeAgent still not initialized after retry")
        return {
            "success": False,
            "error": "MergeAgent not initialized",
            "smart_response": "The merge agent is not available. Please check server logs.",
            "processing_time": round(time.time() - start_time, 2)
        }
    
    logger.info(f"MERGE REQUEST RECEIVED:")
    logger.info(f"Prompt: {request.prompt}")
    logger.info(f"Session ID: {request.session_id}")
    logger.info(f"Context: {request.client_name}/{request.app_name}/{request.project_name}")
    
    try:
        # Create agent context
        context = AgentContext(
            session_id=request.session_id or f"session_{int(time.time())}",
            user_prompt=request.prompt,
            client_name=request.client_name,
            app_name=request.app_name,
            project_name=request.project_name,
            previous_steps={}
        )
        
        # Execute agent using BaseAgent's execute method
        result = agent.execute(context)
        
        # Convert AgentResult to dictionary format
        response = {
            "success": result.success,
            "data": result.data,
            "response": result.data.get("response", ""),  # Raw LLM thinking
            "smart_response": result.message or result.data.get("smart_response", ""),
            "error": result.error,
            "artifacts": result.artifacts,
            "session_id": result.session_id,
            "processing_time": round(time.time() - start_time, 2)
        }
        
        # Add merge_json if present
        if "merge_json" in result.data:
            merge_json = result.data["merge_json"]
            response["merge_json"] = merge_json
            
            # Extract file names for backend
            file1 = merge_json.get("file1", [])
            file2 = merge_json.get("file2", [])
            
            if isinstance(file1, list):
                file1 = file1[0] if file1 else ""
            if isinstance(file2, list):
                file2 = file2[0] if file2 else ""
            
            # Add merge_config for frontend/backend
            response["merge_config"] = {
                "file1": file1,
                "file2": file2,
                "join_columns": merge_json.get("join_columns", []),
                "join_type": merge_json.get("join_type", "outer"),
            }
        
        # Add other fields from result.data
        for key in ["suggestions", "reasoning", "used_memory", "file_analysis", "next_steps"]:
            if key in result.data:
                response[key] = result.data[key]
        
        logger.info(f"MERGE REQUEST COMPLETED:")
        logger.info(f"Success: {response.get('success', False)}")
        logger.info(f"Processing Time: {response.get('processing_time', 0)}s")
        
        return response
        
    except Exception as e:
        logger.error(f"MERGE REQUEST FAILED: {e}", exc_info=True)
        processing_time = round(time.time() - start_time, 2)
        
        return {
            "success": False,
            "error": str(e),
            "response": f"Error occurred: {str(e)}",
            "smart_response": f"An error occurred while processing your request: {str(e)}",
            "processing_time": processing_time
        }


@router.get("/merge/history/{session_id}")
def get_history(session_id: str) -> Dict[str, Any]:
    """Get session history."""
    if not agent_initialized or agent is None:
        return {
            "success": False,
            "error": "MergeAgent not initialized"
        }
    
    logger.info(f"Getting history for session: {session_id}")
    
    try:
        history = agent.get_session_history(session_id)
        return {
            "success": True,
            "session_id": session_id,
            "history": history,
            "total_interactions": len(history) if isinstance(history, list) else 0
        }
    except Exception as e:
        logger.error(f"Failed to get history: {e}")
        return {
            "success": False,
            "error": str(e)
        }


@router.get("/merge/files")
def list_files() -> Dict[str, Any]:
    """List available files."""
    if not agent_initialized or agent is None:
        return {
            "success": False,
            "error": "MergeAgent not initialized"
        }
    
    logger.info("Listing available files")
    
    try:
        files = agent.files_with_columns
        return {
            "success": True,
            "total_files": len(files) if isinstance(files, dict) else 0,
            "files": files
        }
    except Exception as e:
        logger.error(f"Failed to list files: {e}")
        return {
            "success": False,
            "error": str(e)
        }


@router.get("/merge/health")
def health_check() -> Dict[str, Any]:
    """Health check endpoint."""
    if not agent_initialized or agent is None:
        return {
            "status": "unhealthy",
            "service": "merge",
            "error": "Agent not initialized",
            "version": "1.0.0"
        }
    
    status = {
        "status": "healthy",
        "service": "merge",
        "agent_name": agent.name if agent else "unknown",
        "agent_description": agent.description if agent else "unknown",
        "version": "1.0.0",
        "active_sessions": len(agent.sessions) if hasattr(agent, "sessions") else 0,
        "loaded_files": len(agent.files_with_columns) if hasattr(agent, "files_with_columns") else 0
    }
    logger.info(f"Health check: {status}")
    return status

# Log router setup on module load
logger.info("=" * 80)
logger.info("MERGE AGENT MODULE LOADED")
logger.info(f"Router created: {router is not None}")
logger.info(f"Router type: {type(router)}")
logger.info(f"Agent initialized: {agent_initialized}")
if router:
    try:
        route_count = len(router.routes)
        logger.info(f"Router has {route_count} routes")
        routes = []
        for r in router.routes:
            if hasattr(r, 'path') and hasattr(r, 'methods'):
                routes.append(f"{r.methods} {r.path}")
            elif hasattr(r, 'path'):
                routes.append(f"{r.path}")
        if routes:
            logger.info(f"Router routes: {routes}")
        else:
            logger.warning("⚠️ Router has no routes registered!")
    except Exception as e:
        logger.error(f"Error logging routes: {e}")
logger.info("=" * 80)

