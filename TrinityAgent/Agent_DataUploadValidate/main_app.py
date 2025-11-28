"""
Standardized DataUploadValidate Agent using BaseAgent infrastructure
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
logger = logging.getLogger("trinity.agent_data_upload_validate")

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
DataUploadValidatePromptBuilder = None

logger.info("=" * 80)
logger.info("ATTEMPTING TO IMPORT BASEAGENT FOR DATA UPLOAD VALIDATE")
logger.info("=" * 80)

try:
    try:
        logger.info("Strategy 1: Importing from BaseAgent.__init__.py (package import)...")
        from BaseAgent import BaseAgent, AgentContext, AgentResult, settings
        from .data_upload_validate_prompt import DataUploadValidatePromptBuilder
        logger.info("✅ Imported BaseAgent from BaseAgent package (__init__.py)")
    except ImportError as e1:
        logger.warning(f"Strategy 1 failed: {e1}")
        try:
            logger.info("Strategy 2: Importing from BaseAgent modules directly...")
            from BaseAgent.base_agent import BaseAgent
            from BaseAgent.interfaces import AgentContext, AgentResult
            from BaseAgent.config import settings
            from .data_upload_validate_prompt import DataUploadValidatePromptBuilder
            logger.info("✅ Imported BaseAgent from local BaseAgent modules")
        except ImportError as e2:
            logger.warning(f"Strategy 2 failed: {e2}")
            try:
                logger.info("Strategy 3: Importing from TrinityAgent.BaseAgent (absolute)...")
                from TrinityAgent.BaseAgent import BaseAgent, AgentContext, AgentResult, settings
                from .data_upload_validate_prompt import DataUploadValidatePromptBuilder
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

# Only define DataUploadValidateAgent if BaseAgent was imported successfully
if BaseAgent is not None:
    class DataUploadValidateAgent(BaseAgent):
        """
        Standardized DataUploadValidate Agent using BaseAgent infrastructure.
        Only implements data_upload_validate-specific logic.
        """
        
        @property
        def name(self) -> str:
            return "data_upload_validate"
        
        @property
        def description(self) -> str:
            return "Loads files into the data upload atom and applies dtype conversions (int64, float64, datetime64, object, bool)"
        
        def _call_llm(self, prompt: str, temperature: float = 0.1, num_predict: int = 4000) -> str:
            """Override to add logging for raw LLM response."""
            llm_response = super()._call_llm(prompt, temperature, num_predict)
            logger.info("=" * 80)
            logger.info("📥 RECEIVED FROM DATA UPLOAD VALIDATE LLM:")
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
            """Build data_upload_validate-specific prompt using DataUploadValidatePromptBuilder."""
            # Get optional attributes with safe defaults if they don't exist
            file_details = getattr(self, 'current_file_details', None)
            other_files = getattr(self, 'other_files', None)
            matched_columns = getattr(self, 'matched_columns', None)
            
            prompt = DataUploadValidatePromptBuilder.build_data_upload_validate_prompt(
                user_prompt=user_prompt,
                available_files_with_columns=available_files,
                context=context,
                file_details=file_details,
                other_files=other_files,
                matched_columns=matched_columns
            )
            logger.info("=" * 80)
            logger.info("📤 SENDING TO DATA UPLOAD VALIDATE LLM:")
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
            """Validate data_upload_validate-specific JSON structure."""
            if not isinstance(result, dict):
                return False
            
            # If success is True, must have validate_json
            if result.get("success") is True:
                if "validate_json" not in result:
                    return False
                
                validate_json = result.get("validate_json", {})
                if not isinstance(validate_json, dict):
                    return False
                
                # Must have file_name
                if "file_name" not in validate_json:
                    return False
                
                # dtype_changes is optional (can be empty dict)
                if "dtype_changes" in validate_json:
                    if not isinstance(validate_json["dtype_changes"], dict):
                        return False
            
            # Must have smart_response
            if "smart_response" not in result:
                return False
            
            return True
        
        def _normalize_result(self, result: Dict[str, Any]) -> Dict[str, Any]:
            """
            Normalize data_upload_validate result to ensure consistent format.
            🔧 CRITICAL: File name and column names MUST preserve original case.
            Only dtype names are normalized to lowercase.
            """
            normalized = {
                "success": result.get("success", False),
                "response": result.get("response", ""),
                "smart_response": result.get("smart_response", ""),
            }
            
            if "validate_json" in result:
                validate_json = result["validate_json"]
                
                if not isinstance(validate_json, dict):
                    validate_json = {}
                
                # Extract file name (preserve original case)
                file_name = validate_json.get("file_name", "")
                if isinstance(file_name, list):
                    file_name = file_name[0] if file_name else ""
                elif not isinstance(file_name, str):
                    file_name = str(file_name)
                
                # Validate file exists if data_validator is available
                validation_errors = []
                if file_name and self.data_validator:
                    resolved_file_path = self.data_validator._resolve_file_path(file_name)
                    if not resolved_file_path:
                        validation_errors.append(f"File '{file_name}' could not be resolved or found.")
                    elif not self.data_validator._file_exists_in_minio(resolved_file_path):
                        validation_errors.append(f"File '{resolved_file_path}' does not exist in MinIO.")
                    else:
                        logger.info(f"✅ File '{resolved_file_path}' validated for data upload/validate.")
                        file_name = resolved_file_path  # Use resolved path
                elif file_name:
                    logger.warning("⚠️ DataValidator not available - skipping file existence validation.")
                
                # Process dtype_changes (preserve column names, normalize dtype names)
                dtype_changes = validate_json.get("dtype_changes", {})
                if not isinstance(dtype_changes, dict):
                    dtype_changes = {}
                
                normalized_dtype_changes = {}
                for col_name, dtype_spec in dtype_changes.items():
                    # Preserve original column name (case-sensitive)
                    if isinstance(dtype_spec, dict):
                        # Complex dtype with format (e.g., datetime64 with format)
                        normalized_dtype_spec = {
                            "dtype": dtype_spec.get("dtype", "").lower() if isinstance(dtype_spec.get("dtype"), str) else str(dtype_spec.get("dtype", "")).lower(),
                            "format": dtype_spec.get("format", "")  # Preserve format as-is
                        }
                        normalized_dtype_changes[col_name] = normalized_dtype_spec
                    elif isinstance(dtype_spec, str):
                        # Simple dtype string (e.g., "int64", "float64")
                        normalized_dtype_changes[col_name] = dtype_spec.lower()
                    else:
                        # Fallback: convert to string and lowercase
                        normalized_dtype_changes[col_name] = str(dtype_spec).lower()
                
                if validation_errors:
                    error_msg = "Data validation failed. " + "; ".join(validation_errors)
                    logger.error(f"❌ DATA UPLOAD VALIDATE VALIDATION ERRORS: {error_msg}")
                    normalized["success"] = False
                    normalized["smart_response"] = (
                        f"I found some issues with the data upload/validate configuration: {error_msg}. "
                        "Please check that the file exists."
                    )
                    normalized["validation_errors"] = validation_errors
                    return normalized
                
                normalized["validate_json"] = {
                    "file_name": file_name,
                    "dtype_changes": normalized_dtype_changes
                }
            
            # Add other optional fields
            for key in ["reasoning", "used_memory", "suggestions", "next_steps", "available_files"]:
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
                "smart_response": f"I had trouble processing your request. {'Let me suggest based on your previous usage: ' + ', '.join(favorite_files) if favorite_files else 'Please try with specific file names and dtype conversion requirements.'}",
                "suggestions": [
                    "I had trouble processing your request",
                    f"Files you've used before: {', '.join(favorite_files) if favorite_files else 'None yet'}",
                    f"Available files: {', '.join(list(self.files_with_columns.keys())[:5])}",
                    "Example: 'load file.csv and convert volume to int64'"
                ],
                "recommended_files": favorite_files,
                "next_steps": [
                    "Please try with specific file names and dtype conversion requirements",
                    "Or say 'yes' if you want to use suggested files",
                    "Or say 'show me available files' to see all options"
                ]
            }
else:
    DataUploadValidateAgent = None

agent = None
agent_initialized = False

if BaseAgent is not None and settings is not None:
    logger.info("=" * 80)
    logger.info("INITIALIZING DATA UPLOAD VALIDATE AGENT")
    logger.info("=" * 80)
    
    try:
        llm_config = settings.get_llm_config()
        minio_config = settings.get_minio_config()
        
        agent = DataUploadValidateAgent(
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
        logger.info("✅ DataUploadValidateAgent initialized successfully")
    except Exception as e:
        logger.error(f"❌ Failed to initialize DataUploadValidateAgent: {e}", exc_info=True)
        agent = None
        agent_initialized = False
else:
    logger.warning("=" * 80)
    logger.warning("⚠️ BaseAgent not imported - Data Upload Validate agent will not be initialized")
    logger.warning("Router and routes will still be available")
    logger.warning("Agent will attempt to initialize on first request")
    logger.warning("=" * 80)

def _retry_baseagent_import_data_upload_validate():
    """Retry BaseAgent import if it failed initially."""
    global BaseAgent, AgentContext, AgentResult, settings, DataUploadValidatePromptBuilder
    
    if BaseAgent is not None:
        return True
    
    logger.info("Retrying BaseAgent import for Data Upload Validate...")
    parent_dir = Path(__file__).parent.parent
    if str(parent_dir) not in sys.path:
        sys.path.insert(0, str(parent_dir))
    
    try:
        try:
            from BaseAgent import BaseAgent, AgentContext, AgentResult, settings
            from .data_upload_validate_prompt import DataUploadValidatePromptBuilder
            logger.info("✅ BaseAgent imported successfully on retry for Data Upload Validate")
            return True
        except ImportError as e1:
            logger.warning(f"Retry Strategy 1 failed for Data Upload Validate: {e1}")
            try:
                from BaseAgent.base_agent import BaseAgent
                from BaseAgent.interfaces import AgentContext, AgentResult
                from BaseAgent.config import settings
                from .data_upload_validate_prompt import DataUploadValidatePromptBuilder
                logger.info("✅ BaseAgent imported successfully on retry (modules) for Data Upload Validate")
                return True
            except ImportError as e2:
                logger.warning(f"Retry Strategy 2 failed for Data Upload Validate: {e2}")
                try:
                    from TrinityAgent.BaseAgent import BaseAgent, AgentContext, AgentResult, settings
                    from .data_upload_validate_prompt import DataUploadValidatePromptBuilder
                    logger.info("✅ BaseAgent imported successfully on retry (absolute) for Data Upload Validate")
                    return True
                except ImportError as e3:
                    logger.error(f"All retry strategies failed for Data Upload Validate: {e1}, {e2}, {e3}")
                    return False
    except Exception as e:
        logger.error(f"Unexpected error during BaseAgent retry import for Data Upload Validate: {e}", exc_info=True)
        return False

class DataUploadValidateRequest(BaseModel):
    prompt: str
    session_id: Optional[str] = None
    client_name: str = ""
    app_name: str = ""
    project_name: str = ""

@router.get("/data-upload-validate/test")
@router.get("/df-validate/test")  # Backward compatibility alias
def test_endpoint() -> Dict[str, Any]:
    return {
        "success": True,
        "message": "Data Upload Validate router is working!",
        "router_created": router is not None,
        "agent_initialized": agent_initialized if 'agent_initialized' in globals() else False
    }

@router.post("/data-upload-validate")
@router.post("/df-validate")  # Backward compatibility alias
def perform_data_upload_validate(request: DataUploadValidateRequest) -> Dict[str, Any]:
    import time
    start_time = time.time()
    
    global agent, agent_initialized, BaseAgent, settings, DataUploadValidateAgent
    
    if not agent_initialized or agent is None:
        logger.warning("DataUploadValidateAgent not initialized - attempting to initialize now...")
        
        if BaseAgent is None or settings is None:
            logger.info("BaseAgent not imported - attempting to retry import...")
            if not _retry_baseagent_import_data_upload_validate():
                logger.error("BaseAgent import retry failed - cannot initialize agent")
                return {
                    "success": False,
                    "error": "DataUploadValidateAgent not initialized - BaseAgent import failed",
                    "smart_response": "The Data Upload Validate agent is not available. BaseAgent could not be imported. Please check server logs for details.",
                    "processing_time": round(time.time() - start_time, 2)
                }
            
            if BaseAgent is not None and DataUploadValidateAgent is None:
                logger.error("BaseAgent imported but DataUploadValidateAgent class not found - this should not happen")
        
        if BaseAgent is not None and settings is not None:
            try:
                logger.info("Attempting to initialize DataUploadValidateAgent on-demand...")
                llm_config = settings.get_llm_config()
                minio_config = settings.get_minio_config()
                
                agent = DataUploadValidateAgent(
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
                logger.info("✅ DataUploadValidateAgent initialized successfully on-demand")
            except Exception as init_error:
                logger.error(f"❌ Failed to initialize DataUploadValidateAgent on-demand: {init_error}", exc_info=True)
                return {
                    "success": False,
                    "error": f"DataUploadValidateAgent initialization failed: {str(init_error)}",
                    "smart_response": "The Data Upload Validate agent could not be initialized. Please check server logs for details.",
                    "processing_time": round(time.time() - start_time, 2)
                }
        else:
            logger.error("BaseAgent or settings still not available after retry for Data Upload Validate")
            return {
                "success": False,
                "error": "DataUploadValidateAgent not initialized - BaseAgent import failed",
                "smart_response": "The Data Upload Validate agent is not available. BaseAgent could not be imported. Please check server logs for details.",
                "processing_time": round(time.time() - start_time, 2)
            }
    
    if not agent_initialized or agent is None:
        logger.error("DataUploadValidateAgent still not initialized after retry")
        return {
            "success": False,
            "error": "DataUploadValidateAgent not initialized",
            "smart_response": "The Data Upload Validate agent is not available. Please check server logs.",
            "processing_time": round(time.time() - start_time, 2)
        }
    
    logger.info(f"DATA UPLOAD VALIDATE REQUEST RECEIVED:")
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
        
        if "validate_json" in result.data:
            response["validate_json"] = result.data["validate_json"]
        if "validate_config" in result.data:
            response["validate_config"] = result.data["validate_config"]
        if "file_name" in result.data:
            response["file_name"] = result.data["file_name"]
        if "available_files" in result.data:
            response["available_files"] = result.data["available_files"]
        
        for key in ["reasoning", "used_memory", "suggestions", "next_steps"]:
            if key in result.data:
                response[key] = result.data[key]
        
        if "message" not in response:
            response["message"] = response.get("smart_response", "")
        
        logger.info(f"DATA UPLOAD VALIDATE REQUEST COMPLETED:")
        logger.info(f"Success: {response.get('success', False)}")
        logger.info(f"Processing Time: {response.get('processing_time', 0)}s")
        logger.info(f"Response keys: {list(response.keys())}")
        
        return response
        
    except Exception as e:
        logger.error(f"DATA UPLOAD VALIDATE REQUEST FAILED: {e}", exc_info=True)
        processing_time = round(time.time() - start_time, 2)
        
        return {
            "success": False,
            "error": str(e),
            "response": f"Error occurred: {str(e)}",
            "smart_response": f"An error occurred while processing your request: {str(e)}",
            "processing_time": processing_time
        }

@router.get("/data-upload-validate/history/{session_id}")
def get_history(session_id: str) -> Dict[str, Any]:
    if not agent_initialized or agent is None:
        return {
            "success": False,
            "error": "DataUploadValidateAgent not initialized"
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

@router.get("/data-upload-validate/files")
@router.get("/df-validate/files")  # Backward compatibility alias
def list_files() -> Dict[str, Any]:
    if not agent_initialized or agent is None:
        return {
            "success": False,
            "error": "DataUploadValidateAgent not initialized"
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

@router.get("/data-upload-validate/health")
@router.get("/df-validate/health")  # Backward compatibility alias
def health_check() -> Dict[str, Any]:
    if not agent_initialized or agent is None:
        return {
            "status": "unhealthy",
            "service": "data_upload_validate",
            "error": "Agent not initialized",
            "version": "1.0.0"
        }
    status = {
        "status": "healthy",
        "service": "data_upload_validate",
        "agent_name": agent.name if agent else "unknown",
        "agent_description": agent.description if agent else "unknown",
        "version": "1.0.0",
        "active_sessions": len(agent.sessions) if hasattr(agent, "sessions") else 0,
        "loaded_files": len(agent.files_with_columns) if hasattr(agent, "files_with_columns") else 0
    }
    logger.info(f"Health check: {status}")
    return status

logger.info("=" * 80)
logger.info("DATA UPLOAD VALIDATE AGENT MODULE LOADED")
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


