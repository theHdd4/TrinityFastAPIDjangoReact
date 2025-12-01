"""
Standardized GroupBy Agent using BaseAgent infrastructure
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
logger = logging.getLogger("trinity.agent_group_by")

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
GroupByPromptBuilder = None

logger.info("=" * 80)
logger.info("ATTEMPTING TO IMPORT BASEAGENT")
logger.info("=" * 80)
logger.info(f"Parent directory: {parent_dir}")
logger.info(f"BaseAgent path: {parent_dir / 'BaseAgent'}")
logger.info(f"BaseAgent exists: {(parent_dir / 'BaseAgent').exists()}")

# Import exceptions for error handling
TrinityException = None
AgentExecutionError = None
ConfigurationError = None
FileLoadError = None
ValidationError = None

try:
    try:
        logger.info("Strategy 1: Importing from BaseAgent.__init__.py (package import)...")
        from BaseAgent import BaseAgent, AgentContext, AgentResult, settings
        from BaseAgent.exceptions import (
            TrinityException,
            AgentExecutionError,
            ConfigurationError,
            FileLoadError,
            ValidationError
        )
        from .group_by_prompt import GroupByPromptBuilder
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
            from BaseAgent.exceptions import (
                TrinityException,
                AgentExecutionError,
                ConfigurationError,
                FileLoadError,
                ValidationError
            )
            from .group_by_prompt import GroupByPromptBuilder
            logger.info("✅ Imported BaseAgent from local BaseAgent modules")
        except ImportError as e2:
            logger.warning(f"Strategy 2 failed: {e2}")
            import traceback
            logger.warning(f"Strategy 2 traceback: {traceback.format_exc()}")
            try:
                # Fallback import
                logger.info("Strategy 3: Importing from TrinityAgent.BaseAgent (absolute)...")
                from TrinityAgent.BaseAgent import BaseAgent, AgentContext, AgentResult, settings
                from TrinityAgent.BaseAgent.exceptions import (
                    TrinityException,
                    AgentExecutionError,
                    ConfigurationError,
                    FileLoadError,
                    ValidationError
                )
                from .group_by_prompt import GroupByPromptBuilder
                logger.info("✅ Imported BaseAgent from TrinityAgent.BaseAgent package")
            except ImportError as e3:
                logger.error(f"Strategy 3 also failed: {e3}")
                import traceback
                logger.error(f"Strategy 3 traceback: {traceback.format_exc()}")
                logger.error(f"Failed to import BaseAgent from all locations: {e1}, {e2}, {e3}")
                logger.error("Router will be available but agent functionality will not work")
                # Fallback: define minimal exceptions if import fails
                class TrinityException(Exception):
                    def __init__(self, message: str, code: str = "INTERNAL_ERROR"):
                        self.message = message
                        self.code = code
                        super().__init__(self.message)
                
                class AgentExecutionError(TrinityException):
                    def __init__(self, message: str, agent_name: str = "unknown"):
                        super().__init__(message, code="AGENT_EXECUTION_ERROR")
                        self.agent_name = agent_name
                
                class ConfigurationError(TrinityException):
                    def __init__(self, message: str, config_key: str = "unknown"):
                        super().__init__(message, code="CONFIGURATION_ERROR")
                        self.config_key = config_key
                
                FileLoadError = TrinityException
                ValidationError = TrinityException
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
    # Fallback: define minimal exceptions if import fails
    if TrinityException is None:
        class TrinityException(Exception):
            def __init__(self, message: str, code: str = "INTERNAL_ERROR"):
                self.message = message
                self.code = code
                super().__init__(self.message)
        
        class AgentExecutionError(TrinityException):
            def __init__(self, message: str, agent_name: str = "unknown"):
                super().__init__(message, code="AGENT_EXECUTION_ERROR")
                self.agent_name = agent_name
        
        class ConfigurationError(TrinityException):
            def __init__(self, message: str, config_key: str = "unknown"):
                super().__init__(message, code="CONFIGURATION_ERROR")
                self.config_key = config_key
        
        FileLoadError = TrinityException
        ValidationError = TrinityException
    # Continue - router is already created and routes will be registered

# Only define GroupByAgent if BaseAgent was imported successfully
if BaseAgent is not None:
    class GroupByAgent(BaseAgent):
        """
        Standardized GroupBy Agent using BaseAgent infrastructure.
        Only implements group_by-specific logic.
        """
        
        @property
        def name(self) -> str:
            return "group_by"
        
        @property
        def description(self) -> str:
            return "Groups data by specific columns and applies aggregation functions (sum, mean, count, min, max, etc.)"
        
        def _call_llm(self, prompt: str, temperature: float = 0.1, num_predict: int = 4000) -> str:
            """
            Override to add logging for raw LLM response.
            """
            # Call parent method
            llm_response = super()._call_llm(prompt, temperature, num_predict)
            
            # Log what we received from LLM
            logger.info("=" * 80)
            logger.info("📥 RECEIVED FROM GROUPBY LLM:")
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
            Build group_by-specific prompt using GroupByPromptBuilder.
            BaseAgent handles file loading and context building automatically.
            """
            # Use GroupByPromptBuilder to build the prompt
            # BaseAgent's execute() method provides available_files and context
            prompt = GroupByPromptBuilder.build_group_by_prompt(
                user_prompt=user_prompt,
                available_files_with_columns=available_files,
                context=context,
                file_details={},  # Can be enhanced if needed
                other_files=[],
                matched_columns={}
            )
            
            # Log what we're sending to LLM
            logger.info("=" * 80)
            logger.info("📤 SENDING TO GROUPBY LLM:")
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
            Validate group_by-specific JSON structure.
            BaseAgent handles general validation, this adds group_by-specific checks.
            """
            if not isinstance(result, dict):
                return False
            
            # If success is True, must have group_by_json
            if result.get("success") is True:
                if "group_by_json" not in result:
                    return False
                
                group_by_json = result.get("group_by_json", {})
                if not isinstance(group_by_json, dict):
                    return False
                
                # Must have file (can be list or string)
                if "file" not in group_by_json:
                    return False
                
                # Must have group_by_columns
                if "group_by_columns" not in group_by_json:
                    return False
                
                group_by_columns = group_by_json.get("group_by_columns", [])
                if not isinstance(group_by_columns, list) or len(group_by_columns) == 0:
                    return False
                
                # Must have aggregation_functions (can be empty dict, but must exist)
                if "aggregation_functions" not in group_by_json:
                    return False
                
                aggregation_functions = group_by_json.get("aggregation_functions", {})
                if not isinstance(aggregation_functions, dict):
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
            Normalize group_by result to ensure consistent format.
            BaseAgent handles general normalization.
            🔧 CRITICAL: All column names are normalized to lowercase for backend compatibility.
            """
            normalized = {
                "success": result.get("success", False),
                "response": result.get("response", ""),  # Raw LLM thinking
                "smart_response": result.get("smart_response", ""),
            }
            
            # Add group_by_json if present
            if "group_by_json" in result:
                group_by_json = result["group_by_json"]
                
                # Get original values from LLM
                group_by_columns = group_by_json.get("group_by_columns", [])
                aggregation_functions = group_by_json.get("aggregation_functions", {})
                
                # Get file path
                file = group_by_json.get("file", [])
                if isinstance(file, list):
                    file = file[0] if file else ""
                elif not isinstance(file, str):
                    file = str(file)
                
                # 🔧 CRITICAL: Validate columns exist in file first (case-insensitive matching)
                # This ensures 100% guarantee that columns exist in actual file data
                validation_errors = []
                column_mapping = {}  # Maps user input -> original case from file
                
                if file and self.data_validator:
                    # Validate using case-insensitive matching, get original case from file
                    is_valid, errors, col_mapping = self.data_validator.validate_groupby_config(
                        group_by_columns, aggregation_functions, file, "GroupBy"
                    )
                    
                    if not is_valid:
                        validation_errors.extend(errors)
                        logger.error(f"❌ VALIDATION FAILED: {errors}")
                    else:
                        # Store column mapping
                        column_mapping = col_mapping
                        logger.info("✅ VALIDATION PASSED for GroupBy configuration")
                    
                    if validation_errors:
                        error_msg = "Data validation failed. " + "; ".join(validation_errors)
                        logger.error(f"❌ GROUPBY VALIDATION ERRORS: {error_msg}")
                        # Set success to False and add detailed error message
                        normalized["success"] = False
                        normalized["smart_response"] = (
                            f"I found some issues with the GroupBy configuration: {error_msg}. "
                            "Please check that all column names exist in the file."
                        )
                        normalized["validation_errors"] = validation_errors
                elif file:
                    logger.warning("⚠️ DataValidator not available - skipping validation")
                
                # 🔧 CRITICAL: Apply column mapping to get original case from file, then normalize to lowercase
                # Backend requires lowercase: "Year" -> "year", "Volume" -> "volume"
                if column_mapping:
                    # Use mapped columns (original case from file), then normalize to lowercase
                    mapped_columns = [column_mapping.get(col, col) for col in group_by_columns]
                    normalized_columns = [col.lower() for col in mapped_columns]
                    logger.info(f"✅ Applied column case correction: {group_by_columns} -> {mapped_columns} -> {normalized_columns}")
                else:
                    # Fallback: normalize directly to lowercase
                    normalized_columns = [
                        col.strip().lower() if isinstance(col, str) else str(col).strip().lower()
                        for col in group_by_columns
                    ]
                
                # Normalize aggregation_functions: get original case, then normalize to lowercase
                normalized_agg_funcs = {}
                for field, agg_func in aggregation_functions.items():
                    # Get original case from file if mapping available
                    if column_mapping and field in column_mapping:
                        mapped_field = column_mapping[field]
                    else:
                        mapped_field = field
                    # Normalize to lowercase for backend
                    normalized_field = mapped_field.lower()
                    normalized_agg = agg_func.lower() if isinstance(agg_func, str) else str(agg_func).lower()
                    normalized_agg_funcs[normalized_field] = normalized_agg
                
                if column_mapping:
                    logger.info(f"✅ Applied aggregation column case correction: {list(aggregation_functions.keys())} -> {list(normalized_agg_funcs.keys())}")
                
                # 🔧 CRITICAL: Store normalized values - LLM values overwrite any defaults
                # All column names are lowercase for backend compatibility
                normalized["group_by_json"] = {
                    "bucket_name": group_by_json.get("bucket_name", "trinity"),
                    "file": file,
                    "group_by_columns": normalized_columns,  # 🔧 Normalized to lowercase (e.g., "Year" -> "year")
                    "aggregation_functions": normalized_agg_funcs  # 🔧 All keys normalized to lowercase (e.g., "SalesValue" -> "salesvalue")
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
            Uses group_by-specific template.
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
                "smart_response": f"I had trouble processing your request. {'Let me suggest based on your previous usage: ' + ', '.join(favorite_files) if favorite_files else 'Please try with specific file names and group by columns.'}",
                "suggestions": [
                    "I had trouble processing your request",
                    f"Files you've used before: {', '.join(favorite_files) if favorite_files else 'None yet'}",
                    f"Available files: {', '.join(list(self.files_with_columns.keys())[:5])}",
                    "Example: 'group by category and region columns from file.csv with sum of sales and mean of price'"
                ],
                "recommended_files": favorite_files,
                "next_steps": [
                    "Please try with specific file names and group by columns",
                    "Or say 'yes' if you want to use suggested files",
                    "Or say 'show me available files' to see all options"
                ]
            }
else:
    # Define GroupByAgent as None if BaseAgent is not available
    GroupByAgent = None


# ============================================================================
# Router already created at module level (above)
# Log router creation status
# ============================================================================
logger.info("=" * 80)
logger.info("GROUPBY AGENT MODULE LOADING")
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
    logger.info("INITIALIZING GROUPBY AGENT")
    logger.info("=" * 80)
    
    try:
        logger.info("Getting LLM and MinIO configuration...")
        llm_config = settings.get_llm_config()
        minio_config = settings.get_minio_config()
        logger.info(f"LLM Config: {llm_config.get('api_url', 'N/A')}")
        logger.info(f"MinIO Config: {minio_config.get('endpoint', 'N/A')}")
        
        logger.info("Creating GroupByAgent instance...")
        agent = GroupByAgent(
            api_url=llm_config["api_url"],
            model_name=llm_config["model_name"],
            bearer_token=llm_config["bearer_token"],
            minio_endpoint=minio_config["endpoint"],
            access_key=minio_config["access_key"],
            secret_key=minio_config["secret_key"],
            bucket=minio_config["bucket"],
            prefix=minio_config["prefix"]
        )
        
        logger.info("✅ GroupByAgent initialized successfully")
        logger.info(f"Agent name: {agent.name}")
        logger.info(f"Agent description: {agent.description}")
        
        # Register agent in BaseAgent registry
        try:
            from BaseAgent.registry import registry
            registry.register(agent)
            logger.info(f"✅ Registered GroupByAgent in BaseAgent registry")
        except ImportError:
            try:
                from TrinityAgent.BaseAgent.registry import registry
                registry.register(agent)
                logger.info(f"✅ Registered GroupByAgent in BaseAgent registry (absolute import)")
            except ImportError as e:
                logger.warning(f"⚠️ Could not register agent in registry: {e}")
        
        agent_initialized = True
        logger.info("=" * 80)
    except Exception as e:
        logger.error("=" * 80)
        logger.error(f"❌ Failed to initialize GroupByAgent: {e}", exc_info=True)
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
    global BaseAgent, AgentContext, AgentResult, settings, GroupByPromptBuilder
    
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
            from .group_by_prompt import GroupByPromptBuilder
            logger.info("✅ BaseAgent imported successfully on retry")
            return True
        except ImportError as e1:
            logger.warning(f"Retry Strategy 1 failed: {e1}")
            try:
                logger.info("Retry Strategy 2: Importing from BaseAgent modules...")
                from BaseAgent.base_agent import BaseAgent
                from BaseAgent.interfaces import AgentContext, AgentResult
                from BaseAgent.config import settings
                from .group_by_prompt import GroupByPromptBuilder
                logger.info("✅ BaseAgent imported successfully on retry (modules)")
                return True
            except ImportError as e2:
                logger.warning(f"Retry Strategy 2 failed: {e2}")
                try:
                    logger.info("Retry Strategy 3: Importing from TrinityAgent.BaseAgent...")
                    from TrinityAgent.BaseAgent import BaseAgent, AgentContext, AgentResult, settings
                    from .group_by_prompt import GroupByPromptBuilder
                    logger.info("✅ BaseAgent imported successfully on retry (absolute)")
                    return True
                except ImportError as e3:
                    logger.error(f"All retry strategies failed: {e1}, {e2}, {e3}")
                    return False
    except Exception as e:
        logger.error(f"Unexpected error during BaseAgent retry import: {e}", exc_info=True)
        return False


class GroupByRequest(BaseModel):
    """Request model for group_by endpoint."""
    prompt: str
    session_id: Optional[str] = None
    client_name: str = ""
    app_name: str = ""
    project_name: str = ""


# Test endpoint to verify router is working
@router.get("/groupby/test")
def test_endpoint() -> Dict[str, Any]:
    """Test endpoint to verify router is registered."""
    return {
        "success": True,
        "message": "GroupBy router is working!",
        "router_created": router is not None,
        "agent_initialized": agent_initialized if 'agent_initialized' in globals() else False
    }


@router.post("/groupby")
def group_by_files(request: GroupByRequest) -> Dict[str, Any]:
    """
    Smart group by endpoint with complete memory.
    Connects to backend via standardized BaseAgent interface.
    """
    import time
    start_time = time.time()
    
    # Try to initialize agent if not already initialized
    global agent, agent_initialized, BaseAgent, settings, GroupByAgent
    
    if not agent_initialized or agent is None:
        logger.warning("GroupByAgent not initialized - attempting to initialize now...")
        
        # First, try to retry BaseAgent import if it failed
        if BaseAgent is None or settings is None:
            logger.info("BaseAgent not imported - attempting to retry import...")
            if not _retry_baseagent_import():
                logger.error("BaseAgent import retry failed - cannot initialize agent")
                raise ConfigurationError(
                    "GroupByAgent not initialized - BaseAgent import failed",
                    config_key="BASEAGENT_IMPORT"
                )
            
            # GroupByAgent should already be defined at module level if BaseAgent was imported
            # If it's still None, that means BaseAgent import succeeded but GroupByAgent wasn't defined
            # This shouldn't happen, but if it does, we can't define it here (would be a nested class)
            if BaseAgent is not None and GroupByAgent is None:
                logger.error("BaseAgent imported but GroupByAgent class not found - this should not happen")
                logger.error("GroupByAgent should be defined at module level when BaseAgent is imported")
                raise ConfigurationError(
                    "GroupByAgent class not found after BaseAgent import",
                    config_key="GROUPBYAGENT_CLASS"
                )
        
        # Try to initialize now
        if BaseAgent is not None and settings is not None:
            try:
                logger.info("Attempting to initialize GroupByAgent on-demand...")
                llm_config = settings.get_llm_config()
                minio_config = settings.get_minio_config()
                
                agent = GroupByAgent(
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
                    logger.info(f"✅ Registered GroupByAgent in BaseAgent registry (on-demand)")
                except ImportError:
                    try:
                        from TrinityAgent.BaseAgent.registry import registry
                        registry.register(agent)
                        logger.info(f"✅ Registered GroupByAgent in BaseAgent registry (on-demand, absolute import)")
                    except ImportError as e:
                        logger.warning(f"⚠️ Could not register agent in registry: {e}")
                
                agent_initialized = True
                logger.info("✅ GroupByAgent initialized successfully on-demand")
            except Exception as init_error:
                logger.error(f"❌ Failed to initialize GroupByAgent on-demand: {init_error}", exc_info=True)
                raise ConfigurationError(
                    f"GroupByAgent initialization failed: {str(init_error)}",
                    config_key="GROUPBYAGENT_INIT"
                )
        else:
            logger.error("BaseAgent or settings still not available after retry")
            raise ConfigurationError(
                "GroupByAgent not initialized - BaseAgent import failed",
                config_key="BASEAGENT_IMPORT"
            )
    
    if not agent_initialized or agent is None:
        logger.error("GroupByAgent still not initialized after retry")
        raise ConfigurationError(
            "GroupByAgent not initialized",
            config_key="GROUPBYAGENT_INIT"
        )
    
    logger.info(f"GROUPBY REQUEST RECEIVED:")
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
        
        # Add group_by_json if present
        if "group_by_json" in result.data:
            # 🔧 CRITICAL: Use normalized values from _normalize_result (already lowercase)
            # result.data contains the output of _normalize_result, so values are already normalized
            group_by_json = result.data["group_by_json"]
            
            # Extract file name for backend
            file = group_by_json.get("file", [])
            if isinstance(file, list):
                file = file[0] if file else ""
            elif isinstance(file, str):
                file = file
            
            # Extract just the filename if it's a full path (for frontend compatibility)
            file_name_only = file
            if file and "/" in file:
                file_name_only = file.split("/")[-1]
            elif file and "\\" in file:
                file_name_only = file.split("\\")[-1]
            
            # 🔧 ALIGNMENT: Backend expects "identifiers" (not "group_by_columns") and "aggregations" (not "aggregation_functions")
            # group_by_columns = identifiers = "levels" in UI terminology
            # 🔧 CRITICAL: LLM-provided values overwrite defaults - use what LLM provided (already normalized by _normalize_result)
            # 🔧 CRITICAL: UI MUST show AI-selected identifiers even if backend rejects them (e.g., "year" as numeric)
            # Backend validation happens later when user clicks "Perform", but UI should always display AI's selection
            group_by_columns = group_by_json.get("group_by_columns", [])
            aggregation_functions = group_by_json.get("aggregation_functions", {})
            
            # 🔧 CRITICAL: Preserve ALL LLM-provided identifiers exactly as provided (normalized to lowercase for backend)
            # Do NOT filter based on backend's predefined list - UI will show them and user can adjust if needed
            # Values from _normalize_result are already lowercase, but ensure normalization for safety
            normalized_identifiers = [
                col.strip().lower() if isinstance(col, str) else str(col).strip().lower() 
                for col in group_by_columns
            ]
            # 🔧 CRITICAL: Remove any empty strings or None values, but keep all valid identifiers
            normalized_identifiers = [col for col in normalized_identifiers if col and col.strip()]
            
            logger.info(f"🔧 PRESERVING ALL LLM-PROVIDED IDENTIFIERS (will be shown in UI regardless of backend validation):")
            logger.info(f"  - Original from LLM: {group_by_columns}")
            logger.info(f"  - Normalized (for UI/backend): {normalized_identifiers}")
            
            # Convert aggregation_functions to backend-expected format
            # Backend expects: { "field_name": { "agg": "sum", "weight_by": "", "rename_to": "" } }
            # 🔧 CRITICAL: LLM-provided aggregation_functions overwrite defaults - use what LLM provided
            # Values are already normalized by _normalize_result, but ensure normalization for safety
            normalized_aggregations = {}
            for field, agg_func in aggregation_functions.items():
                # 🔧 CRITICAL: Normalize field name to lowercase (backend requirement)
                normalized_field = field.strip().lower() if isinstance(field, str) else str(field).strip().lower()
                
                if isinstance(agg_func, dict):
                    # Already in object format - normalize all nested values
                    normalized_agg = {
                        "agg": agg_func.get("agg", "").lower() if isinstance(agg_func.get("agg"), str) else agg_func.get("agg"),
                        "weight_by": agg_func.get("weight_by", "").strip().lower() if isinstance(agg_func.get("weight_by"), str) else agg_func.get("weight_by", ""),
                        "rename_to": agg_func.get("rename_to", normalized_field).strip().lower() if isinstance(agg_func.get("rename_to"), str) else agg_func.get("rename_to", normalized_field)
                    }
                    normalized_aggregations[normalized_field] = normalized_agg
                else:
                    # Simple string format (e.g., "sum", "count") - convert to object format
                    # 🔧 CRITICAL: Normalize aggregation function name to lowercase
                    normalized_agg_func = agg_func.lower() if isinstance(agg_func, str) else str(agg_func).lower()
                    normalized_aggregations[normalized_field] = {
                        "agg": normalized_agg_func,
                        "weight_by": "",
                        "rename_to": normalized_field
                    }
            
            # 🔧 VALIDATION: Ensure we have LLM-provided values (not empty defaults)
            if not normalized_identifiers:
                logger.warning("⚠️ No identifiers (group_by_columns) provided by LLM - using empty list")
            if not normalized_aggregations:
                logger.warning("⚠️ No aggregations (aggregation_functions) provided by LLM - using empty dict")
            
            logger.info(f"🔧 LLM PROVIDED VALUES (normalized to lowercase):")
            logger.info(f"  - Identifiers (levels): {normalized_identifiers}")
            logger.info(f"  - Identifiers type: {type(normalized_identifiers)}, length: {len(normalized_identifiers)}")
            logger.info(f"  - Aggregations (measures): {list(normalized_aggregations.keys())} with functions: {[v.get('agg') if isinstance(v, dict) else v for v in normalized_aggregations.values()]}")
            logger.info(f"  - Aggregations type: {type(normalized_aggregations)}, keys: {list(normalized_aggregations.keys())}")
            
            # 🔧 ALIGNED STRUCTURE 1: group_by_json (for LLM/agent context - maintains original field names)
            # This is what the LLM returns and what we store for agent context
            response["group_by_json"] = {
                "bucket_name": group_by_json.get("bucket_name", "trinity"),
                "file": [file] if file else [],
                "group_by_columns": normalized_identifiers,  # Normalized to lowercase
                "aggregation_functions": {k: v.get("agg") if isinstance(v, dict) else v for k, v in normalized_aggregations.items()}  # Simplified for agent context
            }
            
            # 🔧 ALIGNED STRUCTURE 2: groupby_json (for frontend/backend - uses backend-expected field names)
            # Backend /api/groupby/run expects: identifiers, aggregations, object_names, file_key
            # Frontend handler expects: data.groupby_json.identifiers (array) and data.groupby_json.aggregations (object)
            # 🔧 CRITICAL: This MUST be at top level of response (like concat_json, merge_json) for frontend handler
            # 🔧 CRITICAL: Frontend handler does: const cfg = data.groupby_json; const aiSelectedIdentifiers = cfg.identifiers || [];
            # 🔧 CRITICAL: UI MUST display ALL AI-selected identifiers, even if backend rejects them (e.g., "year" as numeric)
            # Backend validation happens when user clicks "Perform", but UI should always show AI's selection
            # So identifiers MUST be an array containing ALL LLM-provided values (normalized to lowercase)
            groupby_json_for_frontend = {
                "bucket_name": group_by_json.get("bucket_name", "trinity"),
                "object_names": file,  # Full path - backend expects this in /run endpoint
                "file_name": file_name_only,  # Just filename for frontend display
                "file_key": file_name_only,   # Just filename - backend expects this in /run endpoint
                "identifiers": normalized_identifiers if normalized_identifiers else [],  # 🔧 CRITICAL: ALL AI-selected identifiers (UI "levels") - no backend filtering
                "aggregations": normalized_aggregations if normalized_aggregations else {}  # 🔧 CRITICAL: ALL AI-selected aggregations (UI "measures")
            }
            
            # Set at top level (frontend expects data.groupby_json)
            response["groupby_json"] = groupby_json_for_frontend
            
            # 🔧 CRITICAL: Also add to response.data for consistency (some handlers might check there)
            if "data" in response and isinstance(response["data"], dict):
                response["data"]["groupby_json"] = groupby_json_for_frontend
            
            logger.info(f"🔧 SET groupby_json at top level (UI will display ALL AI-selected identifiers):")
            logger.info(f"  - identifiers (array, UI 'levels'): {groupby_json_for_frontend['identifiers']}")
            logger.info(f"  - identifiers count: {len(groupby_json_for_frontend['identifiers'])}")
            logger.info(f"  - aggregations (object, UI 'measures'): {list(groupby_json_for_frontend['aggregations'].keys())}")
            logger.info(f"  - aggregations count: {len(groupby_json_for_frontend['aggregations'])}")
            logger.info(f"  - object_names: {groupby_json_for_frontend['object_names']}")
            logger.info(f"  - file_key: {groupby_json_for_frontend['file_key']}")
            logger.info(f"  - NOTE: UI will show these identifiers even if backend rejects them during 'Perform'")
            
            # 🔧 ALIGNED STRUCTURE 3: group_by_config (compatibility layer with both naming conventions)
            response["group_by_config"] = {
                "file": file,
                "bucket_name": group_by_json.get("bucket_name", "trinity"),
                # Agent/LLM naming (for compatibility)
                "group_by_columns": normalized_identifiers,  # Same as identifiers
                "aggregation_functions": {k: v.get("agg") if isinstance(v, dict) else v for k, v in normalized_aggregations.items()},  # Simplified
                # Backend naming (for clarity)
                "identifiers": normalized_identifiers,  # Alias - these are the "levels" in UI
                "aggregations": normalized_aggregations  # Full structure for backend
            }
            
            # Update message to indicate configuration is ready (similar to create_transform)
            if response.get("success"):
                response["message"] = "GroupBy configuration ready"
        
        # Add other fields from result.data
        for key in ["suggestions", "reasoning", "used_memory", "file_analysis", "next_steps"]:
            if key in result.data:
                response[key] = result.data[key]
        
        # Ensure message field exists (UI might expect it)
        if "message" not in response:
            response["message"] = response.get("smart_response", "")
        
        logger.info(f"GROUPBY REQUEST COMPLETED:")
        logger.info(f"Success: {response.get('success', False)}")
        logger.info(f"Processing Time: {response.get('processing_time', 0)}s")
        logger.info(f"Response keys: {list(response.keys())}")
        logger.info(f"Has group_by_config: {'group_by_config' in response}")
        logger.info(f"Has group_by_json: {'group_by_json' in response}")
        logger.info(f"Has groupby_json (frontend/backend format): {'groupby_json' in response}")
        if "groupby_json" in response:
            groupby_cfg = response["groupby_json"]
            logger.info(f"🔧 FINAL groupby_json structure (UI will use this to display levels):")
            logger.info(f"  - identifiers (UI 'levels', ALL AI-selected): {groupby_cfg.get('identifiers', [])}")
            logger.info(f"  - identifiers type: {type(groupby_cfg.get('identifiers', []))}, length: {len(groupby_cfg.get('identifiers', []))}")
            logger.info(f"  - aggregations (UI 'measures'): {list(groupby_cfg.get('aggregations', {}).keys())}")
            logger.info(f"  - object_names: {groupby_cfg.get('object_names')}")
            logger.info(f"  - file_key: {groupby_cfg.get('file_key')}")
            logger.info(f"🔧 CRITICAL: Frontend handler extracts cfg.identifiers and sets as selectedIdentifiers")
            logger.info(f"🔧 CRITICAL: UI will display ALL identifiers even if backend rejects them during 'Perform'")
            logger.info(f"🔧 Full groupby_json: {json.dumps(groupby_cfg, indent=2)}")
            logger.info(f"  - aggregations (fields): {list(groupby_cfg.get('aggregations', {}).keys())}")
            logger.info(f"  - object_names (full path): {groupby_cfg.get('object_names')}")
            logger.info(f"  - file_key (filename): {groupby_cfg.get('file_key')}")
            logger.info(f"🔧 Column normalization: All identifiers and aggregation field names are lowercase")
        if "group_by_json" in response:
            group_by_cfg = response["group_by_json"]
            logger.info(f"🔧 ALIGNED STRUCTURE - group_by_json (for agent context):")
            logger.info(f"  - group_by_columns (levels): {group_by_cfg.get('group_by_columns')}")
            logger.info(f"  - aggregation_functions: {list(group_by_cfg.get('aggregation_functions', {}).keys())}")
        
        return response
        
    except (TrinityException, ValidationError, FileLoadError, ConfigurationError) as e:
        # Re-raise Trinity exceptions to be caught by global handler
        logger.error(f"GROUPBY REQUEST FAILED (TrinityException): {e.message if hasattr(e, 'message') else str(e)}", exc_info=True)
        raise
    except Exception as e:
        # Wrap generic exceptions in AgentExecutionError
        logger.error(f"GROUPBY REQUEST FAILED: {e}", exc_info=True)
        raise AgentExecutionError(
            f"An error occurred while processing your request: {str(e)}",
            agent_name="group_by"
        )


@router.get("/groupby/history/{session_id}")
def get_history(session_id: str) -> Dict[str, Any]:
    """Get session history."""
    if not agent_initialized or agent is None:
        raise ConfigurationError(
            "GroupByAgent not initialized",
            config_key="GROUPBYAGENT_INIT"
        )
    
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
        logger.error(f"Failed to get history: {e}", exc_info=True)
        raise AgentExecutionError(
            f"Failed to get session history: {str(e)}",
            agent_name="group_by"
        )


@router.get("/groupby/files")
def list_files() -> Dict[str, Any]:
    """List available files."""
    if not agent_initialized or agent is None:
        raise ConfigurationError(
            "GroupByAgent not initialized",
            config_key="GROUPBYAGENT_INIT"
        )
    
    logger.info("Listing available files")
    
    try:
        files = agent.files_with_columns
        return {
            "success": True,
            "total_files": len(files) if isinstance(files, dict) else 0,
            "files": files
        }
    except Exception as e:
        logger.error(f"Failed to list files: {e}", exc_info=True)
        raise AgentExecutionError(
            f"Failed to list files: {str(e)}",
            agent_name="group_by"
        )


@router.get("/groupby/health")
def health_check() -> Dict[str, Any]:
    """Health check endpoint."""
    if not agent_initialized or agent is None:
        return {
            "status": "unhealthy",
            "service": "group_by",
            "error": "Agent not initialized",
            "version": "1.0.0"
        }
    
    status = {
        "status": "healthy",
        "service": "group_by",
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
logger.info("GROUPBY AGENT MODULE LOADED")
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

