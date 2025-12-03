"""
Standardized Explore Agent using BaseAgent infrastructure
Connects to backend via FastAPI router
"""

import sys
import json
import logging
from pathlib import Path
from typing import Dict, Any, Optional, List, Union
from fastapi import APIRouter
from pydantic import BaseModel

# ============================================================================
# IMPORT ROUTER FROM router.py (always available)
# This ensures router is always available even if agent init fails
# ============================================================================
from .router import router

# Initialize logger early
logger = logging.getLogger("trinity.agent_explore")

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
ExplorePromptBuilder = None

logger.info("=" * 80)
logger.info("ATTEMPTING TO IMPORT BASEAGENT FOR EXPLORE")
logger.info("=" * 80)

try:
    try:
        logger.info("Strategy 1: Importing from BaseAgent.__init__.py (package import)...")
        from BaseAgent import BaseAgent, AgentContext, AgentResult, settings
        from .explore_prompt import ExplorePromptBuilder
        logger.info("✅ Imported BaseAgent from BaseAgent package (__init__.py)")
    except ImportError as e1:
        logger.warning(f"Strategy 1 failed: {e1}")
        try:
            logger.info("Strategy 2: Importing from BaseAgent modules directly...")
            from BaseAgent.base_agent import BaseAgent
            from BaseAgent.interfaces import AgentContext, AgentResult
            from BaseAgent.config import settings
            from .explore_prompt import ExplorePromptBuilder
            logger.info("✅ Imported BaseAgent from local BaseAgent modules")
        except ImportError as e2:
            logger.warning(f"Strategy 2 failed: {e2}")
            try:
                logger.info("Strategy 3: Importing from TrinityAgent.BaseAgent (absolute)...")
                from TrinityAgent.BaseAgent import BaseAgent, AgentContext, AgentResult, settings
                from .explore_prompt import ExplorePromptBuilder
                logger.info("✅ Imported BaseAgent from TrinityAgent.BaseAgent package")
            except ImportError as e3:
                logger.error(f"Strategy 3 also failed: {e3}")
                logger.error(f"Failed to import BaseAgent from all locations: {e1}, {e2}, {e3}")
                logger.error("Router will be available but agent functionality will not work")
except Exception as e:
    logger.error("=" * 80)
    logger.error(f"❌ UNEXPECTED ERROR DURING BASEAGENT IMPORT: {e}")
    logger.error("Router will be available but agent functionality will not work")
    logger.error("=" * 80)

# Only define ExploreAgent if BaseAgent was imported successfully
if BaseAgent is not None:
    class ExploreAgent(BaseAgent):
        """
        Standardized Explore Agent using BaseAgent infrastructure.
        Only implements explore-specific logic.
        """
        
        @property
        def name(self) -> str:
            return "explore"
        
        @property
        def description(self) -> str:
            return "Generates data exploration configurations for pattern analysis, trend analysis, outlier detection, and statistical summaries"
        
        def _call_llm(self, prompt: str, temperature: float = 0.1, num_predict: int = 4000) -> str:
            """Override to add logging for raw LLM response."""
            llm_response = super()._call_llm(prompt, temperature, num_predict)
            logger.info("=" * 80)
            logger.info("📥 RECEIVED FROM EXPLORE LLM:")
            logger.info("=" * 80)
            logger.info(f"Response Length: {len(llm_response)} characters")
            logger.info("-" * 80)
            logger.info("RAW LLM RESPONSE (BEFORE PROCESSING):")
            logger.info("-" * 80)
            logger.info(llm_response)
            logger.info("=" * 80)
            return llm_response
        
        def _extract_json(self, response: str) -> Optional[Dict[str, Any]]:
            """Override to add logging for extracted JSON."""
            result = super()._extract_json(response)
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
            """Build explore-specific prompt using ExplorePromptBuilder."""
            prompt = ExplorePromptBuilder.build_explore_prompt(
                user_prompt=user_prompt,
                available_files_with_columns=available_files,
                context=context,
                file_details=self.current_file_details,
                other_files=self.other_files,
                matched_columns=self.matched_columns
            )
            logger.info("=" * 80)
            logger.info("📤 SENDING TO EXPLORE LLM:")
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
            """Validate explore-specific JSON structure."""
            if not isinstance(result, dict):
                return False
            
            # If success is True, must have exploration_config
            if result.get("success") is True:
                if "exploration_config" not in result:
                    return False
                
                exploration_config = result.get("exploration_config", [])
                # Can be a single dict or list of dicts
                if isinstance(exploration_config, dict):
                    exploration_config = [exploration_config]
                elif not isinstance(exploration_config, list):
                    return False
                
                # Validate each exploration config item
                for config in exploration_config:
                    if not isinstance(config, dict):
                        return False
                    # Required fields
                    required_fields = ["exploration_type", "target_columns", "analysis_method", "visualization_type"]
                    for field in required_fields:
                        if field not in config:
                            return False
            
            # Reasoning is preferred but not strictly required (will be added in normalization if missing)
            # No longer validating for smart_response or response - only reasoning is used now
            
            return True
        
        def _normalize_result(self, result: Dict[str, Any]) -> Dict[str, Any]:
            """
            Normalize explore result to ensure consistent format.
            """
            normalized = {
                "success": result.get("success", False),
                "response": result.get("response", ""),
                "smart_response": result.get("smart_response", ""),
            }
            
            # Process exploration_config
            if "exploration_config" in result:
                exploration_config = result["exploration_config"]
                # Ensure it's a list
                if isinstance(exploration_config, dict):
                    exploration_config = [exploration_config]
                elif not isinstance(exploration_config, list):
                    exploration_config = []
                
                # Normalize each config item
                normalized_config = []
                for config in exploration_config:
                    if isinstance(config, dict):
                        normalized_item = {
                            "exploration_id": config.get("exploration_id", "1"),
                            "exploration_type": config.get("exploration_type", "pattern_analysis"),
                            "target_columns": config.get("target_columns", []),
                            "analysis_method": config.get("analysis_method", "correlation_study"),
                            "visualization_type": config.get("visualization_type", "scatter"),
                            "insights_focus": config.get("insights_focus", ""),
                            "description": config.get("description", "")
                        }
                        normalized_config.append(normalized_item)
                
                normalized["exploration_config"] = normalized_config
            
            # Add file_name if present
            if "file_name" in result:
                normalized["file_name"] = result["file_name"]
            
            # Add other optional fields
            for key in ["reasoning", "used_memory", "suggestions", "next_steps", "file_analysis"]:
                if key in result:
                    normalized[key] = result[key]
            
            return normalized
        
        def _create_fallback_response(self, session_id: str) -> Dict[str, Any]:
            """Create fallback response when LLM fails."""
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
                "smart_response": f"I had trouble processing your request. {'Let me suggest based on your previous usage: ' + ', '.join(favorite_files) if favorite_files else 'Please try with specific exploration requirements.'}",
                "suggestions": [
                    "I had trouble processing your request",
                    f"Files you've used before: {', '.join(favorite_files) if favorite_files else 'None yet'}",
                    f"Available files: {', '.join(list(self.files_with_columns.keys())[:5])}",
                    "Example: 'analyze sales patterns by region' or 'find outliers in customer data'"
                ],
                "recommended_files": favorite_files,
                "next_steps": [
                    "Please try with specific exploration requirements",
                    "Or say 'yes' if you want to use suggested files",
                    "Or say 'show me available files' to see all options"
                ]
            }
else:
    ExploreAgent = None

agent = None
agent_initialized = False

if BaseAgent is not None and settings is not None:
    logger.info("=" * 80)
    logger.info("INITIALIZING EXPLORE AGENT")
    logger.info("=" * 80)
    
    try:
        llm_config = settings.get_llm_config()
        minio_config = settings.get_minio_config()
        
        agent = ExploreAgent(
            api_url=llm_config["api_url"],
            model_name=llm_config["model_name"],
            bearer_token=llm_config["bearer_token"],
            minio_endpoint=minio_config["endpoint"],
            access_key=minio_config["access_key"],
            secret_key=minio_config["secret_key"],
            bucket=minio_config["bucket"],
            prefix=minio_config["prefix"]
        )
        
        # Register agent in BaseAgent registry
        try:
            from BaseAgent.registry import registry
            registry.register(agent)
            logger.info(f"✅ Registered ExploreAgent in BaseAgent registry")
        except ImportError:
            try:
                from TrinityAgent.BaseAgent.registry import registry
                registry.register(agent)
                logger.info(f"✅ Registered ExploreAgent in BaseAgent registry (absolute import)")
            except ImportError as e:
                logger.warning(f"⚠️ Could not register agent in registry: {e}")
        
        agent_initialized = True
        logger.info("✅ ExploreAgent initialized successfully")
    except Exception as e:
        logger.error(f"❌ Failed to initialize ExploreAgent: {e}", exc_info=True)
        agent = None
        agent_initialized = False
else:
    logger.warning("=" * 80)
    logger.warning("⚠️ BaseAgent not imported - Explore agent will not be initialized")
    logger.warning("Router and routes will still be available")
    logger.warning("Agent will attempt to initialize on first request")
    logger.warning("=" * 80)

def _retry_baseagent_import_explore():
    """Retry BaseAgent import if it failed initially."""
    global BaseAgent, AgentContext, AgentResult, settings, ExplorePromptBuilder
    
    if BaseAgent is not None:
        return True
    
    logger.info("Retrying BaseAgent import for Explore...")
    parent_dir = Path(__file__).parent.parent
    if str(parent_dir) not in sys.path:
        sys.path.insert(0, str(parent_dir))
    
    try:
        try:
            from BaseAgent import BaseAgent, AgentContext, AgentResult, settings
            from .explore_prompt import ExplorePromptBuilder
            logger.info("✅ BaseAgent imported successfully on retry for Explore")
            return True
        except ImportError as e1:
            logger.warning(f"Retry Strategy 1 failed for Explore: {e1}")
            try:
                from BaseAgent.base_agent import BaseAgent
                from BaseAgent.interfaces import AgentContext, AgentResult
                from BaseAgent.config import settings
                from .explore_prompt import ExplorePromptBuilder
                logger.info("✅ BaseAgent imported successfully on retry (modules) for Explore")
                return True
            except ImportError as e2:
                logger.warning(f"Retry Strategy 2 failed for Explore: {e2}")
                try:
                    from TrinityAgent.BaseAgent import BaseAgent, AgentContext, AgentResult, settings
                    from .explore_prompt import ExplorePromptBuilder
                    logger.info("✅ BaseAgent imported successfully on retry (absolute) for Explore")
                    return True
                except ImportError as e3:
                    logger.error(f"All retry strategies failed for Explore: {e1}, {e2}, {e3}")
                    return False
    except Exception as e:
        logger.error(f"Unexpected error during BaseAgent retry import for Explore: {e}", exc_info=True)
        return False

class ExploreRequest(BaseModel):
    prompt: str
    session_id: Optional[str] = None
    client_name: str = ""
    app_name: str = ""
    project_name: str = ""

@router.get("/explore/test")
def test_endpoint() -> Dict[str, Any]:
    return {
        "success": True,
        "message": "Explore router is working!",
        "router_created": router is not None,
        "agent_initialized": agent_initialized if 'agent_initialized' in globals() else False
    }

@router.post("/explore")
def perform_explore(request: ExploreRequest) -> Dict[str, Any]:
    import time
    start_time = time.time()
    
    global agent, agent_initialized, BaseAgent, settings, ExploreAgent
    
    if not agent_initialized or agent is None:
        logger.warning("ExploreAgent not initialized - attempting to initialize now...")
        
        if BaseAgent is None or settings is None:
            logger.info("BaseAgent not imported - attempting to retry import...")
            if not _retry_baseagent_import_explore():
                logger.error("BaseAgent import retry failed - cannot initialize agent")
                return {
                    "success": False,
                    "error": "ExploreAgent not initialized - BaseAgent import failed",
                    "smart_response": "The Explore agent is not available. BaseAgent could not be imported. Please check server logs for details.",
                    "processing_time": round(time.time() - start_time, 2)
                }
            
            if BaseAgent is not None and ExploreAgent is None:
                logger.error("BaseAgent imported but ExploreAgent class not found - this should not happen")
        
        if BaseAgent is not None and settings is not None:
            try:
                logger.info("Attempting to initialize ExploreAgent on-demand...")
                llm_config = settings.get_llm_config()
                minio_config = settings.get_minio_config()
                
                agent = ExploreAgent(
                    api_url=llm_config["api_url"],
                    model_name=llm_config["model_name"],
                    bearer_token=llm_config["bearer_token"],
                    minio_endpoint=minio_config["endpoint"],
                    access_key=minio_config["access_key"],
                    secret_key=minio_config["secret_key"],
                    bucket=minio_config["bucket"],
                    prefix=minio_config["prefix"]
                )
                # Register agent in BaseAgent registry
                try:
                    from BaseAgent.registry import registry
                    registry.register(agent)
                    logger.info(f"✅ Registered ExploreAgent in BaseAgent registry (on-demand)")
                except ImportError:
                    try:
                        from TrinityAgent.BaseAgent.registry import registry
                        registry.register(agent)
                        logger.info(f"✅ Registered ExploreAgent in BaseAgent registry (on-demand, absolute import)")
                    except ImportError as e:
                        logger.warning(f"⚠️ Could not register agent in registry: {e}")
                
                agent_initialized = True
                logger.info("✅ ExploreAgent initialized successfully on-demand")
            except Exception as init_error:
                logger.error(f"❌ Failed to initialize ExploreAgent on-demand: {init_error}", exc_info=True)
                return {
                    "success": False,
                    "error": f"ExploreAgent initialization failed: {str(init_error)}",
                    "smart_response": "The Explore agent could not be initialized. Please check server logs for details.",
                    "processing_time": round(time.time() - start_time, 2)
                }
        else:
            logger.error("BaseAgent or settings still not available after retry for Explore")
            return {
                "success": False,
                "error": "ExploreAgent not initialized - BaseAgent import failed",
                "smart_response": "The Explore agent is not available. BaseAgent could not be imported. Please check server logs for details.",
                "processing_time": round(time.time() - start_time, 2)
            }
    
    if not agent_initialized or agent is None:
        logger.error("ExploreAgent still not initialized after retry")
        return {
            "success": False,
            "error": "ExploreAgent not initialized",
            "smart_response": "The Explore agent is not available. Please check server logs.",
            "processing_time": round(time.time() - start_time, 2)
        }
    
    logger.info(f"EXPLORE REQUEST RECEIVED:")
    logger.info(f"Prompt: {request.prompt}")
    logger.info(f"Session ID: {request.session_id}")
    logger.info(f"Context: {request.client_name}/{request.app_name}/{request.project_name}")
    
    try:
        context = AgentContext(
            session_id=request.session_id or f"session_{int(time.time())}",
            user_prompt=request.prompt,
            client_name=request.client_name,
            app_name=request.app_name,
            project_name=request.project_name,
            previous_steps={}
        )
        
        result = agent.execute(context)
        
        response = {
            "success": result.success,
            "data": result.data,
            "response": result.data.get("response", ""),
            "smart_response": result.message or result.data.get("smart_response", ""),
            "error": result.error,
            "artifacts": result.artifacts,
            "session_id": result.session_id,
            "processing_time": round(time.time() - start_time, 2)
        }
        
        if "exploration_config" in result.data:
            response["exploration_config"] = result.data["exploration_config"]
        if "file_name" in result.data:
            response["file_name"] = result.data["file_name"]
        if "file_analysis" in result.data:
            response["file_analysis"] = result.data["file_analysis"]
        
        for key in ["reasoning", "used_memory", "suggestions", "next_steps"]:
            if key in result.data:
                response[key] = result.data[key]
        
        if "message" not in response:
            response["message"] = response.get("smart_response", "")
        
        logger.info(f"EXPLORE REQUEST COMPLETED:")
        logger.info(f"Success: {response.get('success', False)}")
        logger.info(f"Processing Time: {response.get('processing_time', 0)}s")
        logger.info(f"Response keys: {list(response.keys())}")
        
        return response
        
    except Exception as e:
        logger.error(f"EXPLORE REQUEST FAILED: {e}", exc_info=True)
        processing_time = round(time.time() - start_time, 2)
        
        return {
            "success": False,
            "error": str(e),
            "response": f"Error occurred: {str(e)}",
            "smart_response": f"An error occurred while processing your request: {str(e)}",
            "processing_time": processing_time
        }

@router.get("/explore/history/{session_id}")
def get_history(session_id: str) -> Dict[str, Any]:
    if not agent_initialized or agent is None:
        return {
            "success": False,
            "error": "ExploreAgent not initialized"
        }
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

@router.get("/explore/files")
def list_files() -> Dict[str, Any]:
    if not agent_initialized or agent is None:
        return {
            "success": False,
            "error": "ExploreAgent not initialized"
        }
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

@router.get("/explore/health")
def health_check() -> Dict[str, Any]:
    if not agent_initialized or agent is None:
        return {
            "status": "unhealthy",
            "service": "explore",
            "error": "Agent not initialized",
            "version": "1.0.0"
        }
    status = {
        "status": "healthy",
        "service": "explore",
        "agent_name": agent.name if agent else "unknown",
        "agent_description": agent.description if agent else "unknown",
        "version": "1.0.0",
        "active_sessions": len(agent.sessions) if hasattr(agent, "sessions") else 0,
        "loaded_files": len(agent.files_with_columns) if hasattr(agent, "files_with_columns") else 0
    }
    logger.info(f"Health check: {status}")
    return status

# Register router in agent registry (for auto-discovery)
try:
    parent_dir = Path(__file__).parent.parent
    if str(parent_dir) not in sys.path:
        sys.path.insert(0, str(parent_dir))
    
    try:
        from agent_registry import register_agent, set_agent_metadata
        # Set metadata for PostgreSQL
        set_agent_metadata("explore", {
            "name": "Explore",
            "description": "Generates data exploration configurations for pattern analysis, trend analysis, outlier detection, and statistical summaries",
            "category": "Data Analysis",
            "tags": ["explore", "data", "analysis", "pattern", "trend", "outlier", "statistics", "visualization"]
        })
        # Register router
        if router is not None:
            success = register_agent("explore", router)
            if success:
                logger.info("✅ Explore router registered in agent registry")
            else:
                logger.warning("⚠️ Failed to register Explore router in agent registry")
    except ImportError:
        # Agent registry not available, will be auto-discovered
        logger.debug("Agent registry not available - router will be auto-discovered")
except Exception as e:
    logger.warning(f"Could not register Explore router: {e}")

logger.info("=" * 80)
logger.info("EXPLORE AGENT MODULE LOADED")
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


