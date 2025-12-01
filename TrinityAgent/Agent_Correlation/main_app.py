"""
Standardized Correlation Agent using BaseAgent infrastructure
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
logger = logging.getLogger("trinity.agent_correlation")

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
CorrelationPromptBuilder = None

logger.info("=" * 80)
logger.info("ATTEMPTING TO IMPORT BASEAGENT FOR CORRELATION")
logger.info("=" * 80)

try:
    try:
        logger.info("Strategy 1: Importing from BaseAgent.__init__.py (package import)...")
        from BaseAgent import BaseAgent, AgentContext, AgentResult, settings
        from .correlation_prompt import CorrelationPromptBuilder
        logger.info("✅ Imported BaseAgent from BaseAgent package (__init__.py)")
    except ImportError as e1:
        logger.warning(f"Strategy 1 failed: {e1}")
        try:
            logger.info("Strategy 2: Importing from BaseAgent modules directly...")
            from BaseAgent.base_agent import BaseAgent
            from BaseAgent.interfaces import AgentContext, AgentResult
            from BaseAgent.config import settings
            from .correlation_prompt import CorrelationPromptBuilder
            logger.info("✅ Imported BaseAgent from local BaseAgent modules")
        except ImportError as e2:
            logger.warning(f"Strategy 2 failed: {e2}")
            try:
                logger.info("Strategy 3: Importing from TrinityAgent.BaseAgent (absolute)...")
                from TrinityAgent.BaseAgent import BaseAgent, AgentContext, AgentResult, settings
                from .correlation_prompt import CorrelationPromptBuilder
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

# Only define CorrelationAgent if BaseAgent was imported successfully
if BaseAgent is not None:
    class CorrelationAgent(BaseAgent):
        """
        Standardized Correlation Agent using BaseAgent infrastructure.
        Only implements correlation-specific logic.
        """
        
        def __init__(self, *args, **kwargs):
            """Initialize CorrelationAgent with optional attributes."""
            super().__init__(*args, **kwargs)
            # Initialize optional attributes used in _build_prompt
            self.current_file_details = None
            self.other_files = None
            self.matched_columns = None
        
        @property
        def name(self) -> str:
            return "correlation"
        
        @property
        def description(self) -> str:
            return "Calculates correlation matrices and analyzes relationships between numeric variables"
        
        def _call_llm(self, prompt: str, temperature: float = 0.1, num_predict: int = 4000) -> str:
            """Override to add logging for raw LLM response."""
            llm_response = super()._call_llm(prompt, temperature, num_predict)
            logger.info("=" * 80)
            logger.info("📥 RECEIVED FROM CORRELATION LLM:")
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
            """Build correlation-specific prompt using CorrelationPromptBuilder."""
            prompt = CorrelationPromptBuilder.build_correlation_prompt(
                user_prompt=user_prompt,
                available_files_with_columns=available_files,
                context=context,
                file_details=self.current_file_details,
                other_files=self.other_files,
                matched_columns=self.matched_columns
            )
            logger.info("=" * 80)
            logger.info("📤 SENDING TO CORRELATION LLM:")
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
            """Validate correlation-specific JSON structure."""
            if not isinstance(result, dict):
                return False
            
            # If success is True, must have correlation_config
            if result.get("success") is True:
                if "correlation_config" not in result:
                    return False
                
                correlation_config = result.get("correlation_config", {})
                if not isinstance(correlation_config, dict):
                    return False
                
                # Required fields: file_path and method
                if "file_path" not in correlation_config:
                    return False
                if "method" not in correlation_config:
                    return False
                
                # Method must be valid
                valid_methods = ["pearson", "spearman", "phi_coefficient", "cramers_v"]
                if correlation_config.get("method", "").lower() not in valid_methods:
                    logger.warning(f"Invalid correlation method: {correlation_config.get('method')}")
            
            # Must have smart_response
            if "smart_response" not in result:
                return False
            
            return True
        
        def _normalize_result(self, result: Dict[str, Any]) -> Dict[str, Any]:
            """
            Normalize correlation result to ensure consistent format.
            """
            normalized = {
                "success": result.get("success", False),
                "response": result.get("response", ""),
                "smart_response": result.get("smart_response", ""),
            }
            
            # Process correlation_config
            if "correlation_config" in result:
                correlation_config = result["correlation_config"]
                if not isinstance(correlation_config, dict):
                    correlation_config = {}
                
                # Normalize correlation config
                normalized_config = {
                    "file_path": correlation_config.get("file_path", ""),
                    "method": correlation_config.get("method", "pearson").lower(),
                    "identifier_columns": correlation_config.get("identifier_columns", []),
                    "measure_columns": correlation_config.get("measure_columns", []),
                    "identifier_filters": correlation_config.get("identifier_filters", []),
                    "measure_filters": correlation_config.get("measure_filters", []),
                    "include_preview": correlation_config.get("include_preview", True),
                    "include_date_analysis": correlation_config.get("include_date_analysis", False),
                    "date_column": correlation_config.get("date_column"),
                    "date_range_filter": correlation_config.get("date_range_filter"),
                    "aggregation_level": correlation_config.get("aggregation_level")
                }
                
                # Remove None values
                normalized_config = {k: v for k, v in normalized_config.items() if v is not None}
                
                normalized["correlation_config"] = normalized_config
            
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
                "smart_response": f"I had trouble processing your correlation request. {'Let me suggest based on your previous usage: ' + ', '.join(favorite_files) if favorite_files else 'Please try with specific correlation requirements.'}",
                "suggestions": [
                    "I had trouble processing your request",
                    f"Files you've used before: {', '.join(favorite_files) if favorite_files else 'None yet'}",
                    f"Available files: {', '.join(list(self.files_with_columns.keys())[:5])}",
                    "Example: 'analyze correlations in sales data' or 'find relationships between price and quantity'"
                ],
                "recommended_files": favorite_files,
                "next_steps": [
                    "Please try with specific correlation requirements",
                    "Or say 'yes' if you want to use suggested files",
                    "Or say 'show me available files' to see all options"
                ]
            }
else:
    CorrelationAgent = None

agent = None
agent_initialized = False

if BaseAgent is not None and settings is not None:
    logger.info("=" * 80)
    logger.info("INITIALIZING CORRELATION AGENT")
    logger.info("=" * 80)
    
    try:
        llm_config = settings.get_llm_config()
        minio_config = settings.get_minio_config()
        
        agent = CorrelationAgent(
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
            logger.info(f"✅ Registered CorrelationAgent in BaseAgent registry")
        except ImportError:
            try:
                from TrinityAgent.BaseAgent.registry import registry
                registry.register(agent)
                logger.info(f"✅ Registered CorrelationAgent in BaseAgent registry (absolute import)")
            except ImportError as e:
                logger.warning(f"⚠️ Could not register agent in registry: {e}")
        
        agent_initialized = True
        logger.info("✅ CorrelationAgent initialized successfully")
    except Exception as e:
        logger.error(f"❌ Failed to initialize CorrelationAgent: {e}", exc_info=True)
        agent = None
        agent_initialized = False
else:
    logger.warning("=" * 80)
    logger.warning("⚠️ BaseAgent not imported - Correlation agent will not be initialized")
    logger.warning("Router and routes will still be available")
    logger.warning("Agent will attempt to initialize on first request")
    logger.warning("=" * 80)

def _retry_baseagent_import_correlation():
    """Retry BaseAgent import if it failed initially."""
    global BaseAgent, AgentContext, AgentResult, settings, CorrelationPromptBuilder
    
    if BaseAgent is not None:
        return True
    
    logger.info("Retrying BaseAgent import for Correlation...")
    parent_dir = Path(__file__).parent.parent
    if str(parent_dir) not in sys.path:
        sys.path.insert(0, str(parent_dir))
    
    try:
        try:
            from BaseAgent import BaseAgent, AgentContext, AgentResult, settings
            from .correlation_prompt import CorrelationPromptBuilder
            logger.info("✅ BaseAgent imported successfully on retry for Correlation")
            return True
        except ImportError as e1:
            logger.warning(f"Retry Strategy 1 failed for Correlation: {e1}")
            try:
                from BaseAgent.base_agent import BaseAgent
                from BaseAgent.interfaces import AgentContext, AgentResult
                from BaseAgent.config import settings
                from .correlation_prompt import CorrelationPromptBuilder
                logger.info("✅ BaseAgent imported successfully on retry (modules) for Correlation")
                return True
            except ImportError as e2:
                logger.warning(f"Retry Strategy 2 failed for Correlation: {e2}")
                try:
                    from TrinityAgent.BaseAgent import BaseAgent, AgentContext, AgentResult, settings
                    from .correlation_prompt import CorrelationPromptBuilder
                    logger.info("✅ BaseAgent imported successfully on retry (absolute) for Correlation")
                    return True
                except ImportError as e3:
                    logger.error(f"All retry strategies failed for Correlation: {e1}, {e2}, {e3}")
                    return False
    except Exception as e:
        logger.error(f"Unexpected error during BaseAgent retry import for Correlation: {e}", exc_info=True)
        return False

class CorrelationRequest(BaseModel):
    prompt: str
    session_id: Optional[str] = None
    client_name: str = ""
    app_name: str = ""
    project_name: str = ""

@router.get("/correlation/test")
def test_endpoint() -> Dict[str, Any]:
    return {
        "success": True,
        "message": "Correlation router is working!",
        "router_created": router is not None,
        "agent_initialized": agent_initialized if 'agent_initialized' in globals() else False
    }

@router.post("/correlation")
def perform_correlation(request: CorrelationRequest) -> Dict[str, Any]:
    import time
    start_time = time.time()
    
    global agent, agent_initialized, BaseAgent, settings, CorrelationAgent
    
    if not agent_initialized or agent is None:
        logger.warning("CorrelationAgent not initialized - attempting to initialize now...")
        
        if BaseAgent is None or settings is None:
            logger.info("BaseAgent not imported - attempting to retry import...")
            if not _retry_baseagent_import_correlation():
                logger.error("BaseAgent import retry failed - cannot initialize agent")
                return {
                    "success": False,
                    "error": "CorrelationAgent not initialized - BaseAgent import failed",
                    "smart_response": "The Correlation agent is not available. BaseAgent could not be imported. Please check server logs for details.",
                    "processing_time": round(time.time() - start_time, 2)
                }
            
            if BaseAgent is not None and CorrelationAgent is None:
                logger.error("BaseAgent imported but CorrelationAgent class not found - this should not happen")
        
        if BaseAgent is not None and settings is not None:
            try:
                logger.info("Attempting to initialize CorrelationAgent on-demand...")
                llm_config = settings.get_llm_config()
                minio_config = settings.get_minio_config()
                
                agent = CorrelationAgent(
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
                    logger.info(f"✅ Registered CorrelationAgent in BaseAgent registry (on-demand)")
                except ImportError:
                    try:
                        from TrinityAgent.BaseAgent.registry import registry
                        registry.register(agent)
                        logger.info(f"✅ Registered CorrelationAgent in BaseAgent registry (on-demand, absolute import)")
                    except ImportError as e:
                        logger.warning(f"⚠️ Could not register agent in registry: {e}")
                
                agent_initialized = True
                logger.info("✅ CorrelationAgent initialized successfully on-demand")
            except Exception as init_error:
                logger.error(f"❌ Failed to initialize CorrelationAgent on-demand: {init_error}", exc_info=True)
                return {
                    "success": False,
                    "error": f"CorrelationAgent initialization failed: {str(init_error)}",
                    "smart_response": "The Correlation agent could not be initialized. Please check server logs for details.",
                    "processing_time": round(time.time() - start_time, 2)
                }
        else:
            logger.error("BaseAgent or settings still not available after retry for Correlation")
            return {
                "success": False,
                "error": "CorrelationAgent not initialized - BaseAgent import failed",
                "smart_response": "The Correlation agent is not available. BaseAgent could not be imported. Please check server logs for details.",
                "processing_time": round(time.time() - start_time, 2)
            }
    
    if not agent_initialized or agent is None:
        logger.error("CorrelationAgent still not initialized after retry")
        return {
            "success": False,
            "error": "CorrelationAgent not initialized",
            "smart_response": "The Correlation agent is not available. Please check server logs.",
            "processing_time": round(time.time() - start_time, 2)
        }
    
    logger.info(f"CORRELATION REQUEST RECEIVED:")
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
        
        if "correlation_config" in result.data:
            response["correlation_config"] = result.data["correlation_config"]
        if "file_name" in result.data:
            response["file_name"] = result.data["file_name"]
        if "file_analysis" in result.data:
            response["file_analysis"] = result.data["file_analysis"]
        
        for key in ["reasoning", "used_memory", "suggestions", "next_steps"]:
            if key in result.data:
                response[key] = result.data[key]
        
        if "message" not in response:
            response["message"] = response.get("smart_response", "")
        
        logger.info(f"CORRELATION REQUEST COMPLETED:")
        logger.info(f"Success: {response.get('success', False)}")
        logger.info(f"Processing Time: {response.get('processing_time', 0)}s")
        logger.info(f"Response keys: {list(response.keys())}")
        
        return response
        
    except Exception as e:
        logger.error(f"CORRELATION REQUEST FAILED: {e}", exc_info=True)
        processing_time = round(time.time() - start_time, 2)
        
        return {
            "success": False,
            "error": str(e),
            "response": f"Error occurred: {str(e)}",
            "smart_response": f"An error occurred while processing your request: {str(e)}",
            "processing_time": processing_time
        }

@router.get("/correlation/history/{session_id}")
def get_history(session_id: str) -> Dict[str, Any]:
    if not agent_initialized or agent is None:
        return {
            "success": False,
            "error": "CorrelationAgent not initialized"
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

@router.get("/correlation/files")
def list_files() -> Dict[str, Any]:
    if not agent_initialized or agent is None:
        return {
            "success": False,
            "error": "CorrelationAgent not initialized"
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

@router.get("/correlation/health")
def health_check() -> Dict[str, Any]:
    if not agent_initialized or agent is None:
        return {
            "status": "unhealthy",
            "service": "correlation",
            "error": "Agent not initialized",
            "version": "1.0.0"
        }
    status = {
        "status": "healthy",
        "service": "correlation",
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
        set_agent_metadata("correlation", {
            "name": "Correlation",
            "description": "Calculates correlation matrices and analyzes relationships between numeric variables",
            "category": "Data Analysis",
            "tags": ["correlation", "data", "analysis", "relationship", "matrix", "statistics"]
        })
        # Register router
        if router is not None:
            success = register_agent("correlation", router)
            if success:
                logger.info("✅ Correlation router registered in agent registry")
            else:
                logger.warning("⚠️ Failed to register Correlation router in agent registry")
    except ImportError:
        # Agent registry not available, will be auto-discovered
        logger.debug("Agent registry not available - router will be auto-discovered")
except Exception as e:
    logger.warning(f"Could not register Correlation router: {e}")

logger.info("=" * 80)
logger.info("CORRELATION AGENT MODULE LOADED")
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

