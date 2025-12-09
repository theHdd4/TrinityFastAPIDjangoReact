"""
Standardized Metric Agent using BaseAgent infrastructure
Connects to backend via FastAPI router
Handles three operation types: Input, Variables, Column Ops
"""

import sys
import json
import logging
from pathlib import Path
from typing import Dict, Any, Optional, Tuple, List
from fastapi import APIRouter
from pydantic import BaseModel

# ============================================================================
# IMPORT ROUTER FROM router.py (always available)
# This ensures router is always available even if agent init fails
# ============================================================================
from .router import router

# Initialize logger early
logger = logging.getLogger("trinity.agent_metric")

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
MetricPromptBuilder = None

logger.info("=" * 80)
logger.info("ATTEMPTING TO IMPORT BASEAGENT FOR METRIC AGENT")
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
        from .metric_prompt import MetricPromptBuilder
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
            from .metric_prompt import MetricPromptBuilder
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
                from .metric_prompt import MetricPromptBuilder
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

# Only define MetricAgent if BaseAgent was imported successfully
if BaseAgent is not None:
    class MetricAgent(BaseAgent):
        """
        Standardized Metric Agent using BaseAgent infrastructure.
        Handles three operation types: Input, Variables, Column Ops.
        """
        
        @property
        def name(self) -> str:
            return "metric"
        
        @property
        def description(self) -> str:
            return "Performing metric operations including data source selection, variable creation, and column transformations"
        
        def _call_llm(self, prompt: str, temperature: float = 0.1, num_predict: int = 4000) -> str:
            """
            Override to add logging for raw LLM response.
            """
            # Call parent method
            llm_response = super()._call_llm(prompt, temperature, num_predict)
            
            # Log what we received from LLM
            logger.info("=" * 80)
            logger.info("📥 RECEIVED FROM METRIC LLM:")
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
                logger.info(f"Operation Type: {result.get('operation_type', 'unknown')}")
                logger.info("-" * 80)
                logger.info("EXTRACTED JSON (BEFORE VALIDATION/NORMALIZATION):")
                logger.info("-" * 80)
                logger.info(json.dumps(result, indent=2))
            else:
                logger.warning("❌ JSON Extraction Failed - No JSON found in response")
            logger.info("=" * 80)
            
            return result
        
        def _filter_existing_files(self, available_files: Dict[str, Any]) -> Dict[str, Any]:
            """
            Filter out files that no longer exist in S3.
            Validates each file exists before including it in the available files list.
            
            Args:
                available_files: Dictionary of files with columns
                
            Returns:
                Filtered dictionary containing only existing files
            """
            filtered_files = {}
            import os
            
            for file_path, file_info in available_files.items():
                try:
                    # Try to stat the object to verify it exists
                    self.file_reader.minio_client.stat_object(
                        bucket_name=self.bucket,
                        object_name=file_path
                    )
                    # File exists, include it
                    filtered_files[file_path] = file_info
                except Exception as e:
                    # File doesn't exist or error accessing it
                    logger.warning(f"⚠️ File '{file_path}' no longer exists or is inaccessible: {e}")
                    # Try to find by basename in case path changed
                    file_basename = os.path.basename(file_path)
                    found = False
                    try:
                        # List objects to find by basename
                        objects = self.file_reader.minio_client.list_objects(
                            bucket_name=self.bucket,
                            prefix=self.file_reader.prefix,
                            recursive=True
                        )
                        for obj in objects:
                            if os.path.basename(obj.object_name) == file_basename:
                                # Found file with same basename, verify it exists
                                try:
                                    self.file_reader.minio_client.stat_object(
                                        bucket_name=self.bucket,
                                        object_name=obj.object_name
                                    )
                                    # Update the path and include it
                                    filtered_files[obj.object_name] = file_info
                                    found = True
                                    logger.info(f"✅ Found file by basename: '{file_path}' -> '{obj.object_name}'")
                                    break
                                except:
                                    continue
                    except:
                        pass
                    
                    if not found:
                        logger.debug(f"❌ Excluding non-existent file: '{file_path}'")
            
            if len(filtered_files) < len(available_files):
                logger.info(f"🔍 Filtered files: {len(available_files)} -> {len(filtered_files)} (removed {len(available_files) - len(filtered_files)} non-existent files)")
            
            return filtered_files
        
        def _build_prompt(
            self,
            user_prompt: str,
            available_files: Dict[str, Any],
            context: str
        ) -> str:
            """
            Build metric-specific prompt using MetricPromptBuilder.
            BaseAgent handles file loading and context building automatically.
            """
            # Filter out non-existent files before building prompt
            filtered_files = self._filter_existing_files(available_files)
            
            # Update files_with_columns to only include existing files
            self.files_with_columns = filtered_files
            
            # Use MetricPromptBuilder to build the prompt
            # BaseAgent's execute() method provides available_files and context
            prompt = MetricPromptBuilder.build_metric_prompt(
                user_prompt=user_prompt,
                available_files_with_columns=filtered_files,  # Use filtered files
                context=context,
                file_details={},  # Can be enhanced if needed
                other_files=[],
                matched_columns={}
            )
            
            # Log what we're sending to LLM
            logger.info("=" * 80)
            logger.info("📤 SENDING TO METRIC LLM:")
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
            Validate metric-specific JSON structure.
            BaseAgent handles general validation, this adds metric-specific checks.
            """
            if not isinstance(result, dict):
                return False
            
            # If success is True, must have operation_type
            if result.get("success") is True:
                operation_type = result.get("operation_type", "").lower()
                
                if not operation_type:
                    return False
                
                # Validate based on operation type
                if operation_type == "input":
                    # Input operation: must have data_source
                    if "data_source" not in result and "dataSource" not in result:
                        return False
                
                elif operation_type == "variables":
                    # Variables operation: must have operation_config
                    if "operation_config" not in result:
                        return False
                    op_config = result.get("operation_config", {})
                    variable_type = op_config.get("variable_type", "").lower()
                    
                    if variable_type == "constant":
                        # Must have assignments
                        if "assignments" not in op_config:
                            return False
                    elif variable_type == "dataframe":
                        # Must have operations
                        if "operations" not in op_config:
                            return False
                    else:
                        return False
                    
                    # Must have api_endpoint (accept both with and without /laboratory prefix)
                    api_endpoint = result.get("api_endpoint", "")
                    valid_endpoints = [
                        "/laboratory/variables/assign", "/laboratory/variables/compute",
                        "/variables/assign", "/variables/compute"
                    ]
                    if not api_endpoint or api_endpoint not in valid_endpoints:
                        return False
                
                elif operation_type == "column_ops":
                    # Column Ops operation: must have operation_config
                    if "operation_config" not in result:
                        return False
                    op_config = result.get("operation_config", {})
                    
                    # Must have method and columns
                    if "method" not in op_config or "columns" not in op_config:
                        return False
                    
                    # Must have api_endpoint and api_endpoint_save
                    if "api_endpoint" not in result or "api_endpoint_save" not in result:
                        return False
                
                else:
                    # Unknown operation type
                    return False
            
            # Reasoning is preferred but not strictly required
            return True
        
        def _validate_file_exists(self, file_path: str) -> Tuple[bool, str]:
            """
            Validate that a file exists in the available files list.
            
            Args:
                file_path: File path to validate
                
            Returns:
                Tuple of (is_valid, error_message)
            """
            import os
            
            # Check if file exists in files_with_columns
            if file_path in self.files_with_columns:
                return True, ""
            
            # Try to find by basename
            file_basename = os.path.basename(file_path)
            for actual_path in self.files_with_columns.keys():
                if os.path.basename(actual_path) == file_basename:
                    return True, ""
            
            return False, f"File '{file_path}' not found in available files"
        
        def _normalize_result(self, result: Dict[str, Any]) -> Dict[str, Any]:
            """
            Normalize metric result to ensure consistent format.
            BaseAgent handles general normalization.
            """
            normalized = {
                "success": result.get("success", False),
                "response": result.get("response", ""),  # Raw LLM thinking
                "smart_response": result.get("smart_response", ""),
            }
            
            # Extract operation type
            operation_type = result.get("operation_type", "").lower()
            normalized["operation_type"] = operation_type
            
            # Add operation-specific fields
            if "data_source" in result:
                normalized["data_source"] = result["data_source"]
            elif "dataSource" in result:
                normalized["data_source"] = result["dataSource"]
            
            if "file_name" in result:
                normalized["file_name"] = result["file_name"]
            
            if "operation_config" in result:
                normalized["operation_config"] = result["operation_config"]
            
            if "metrics_json" in result:
                normalized["metrics_json"] = result["metrics_json"]
            
            # Add API endpoint fields
            if "api_endpoint" in result:
                normalized["api_endpoint"] = result["api_endpoint"]
            
            if "api_endpoint_save" in result:
                normalized["api_endpoint_save"] = result["api_endpoint_save"]
            
            # Add other fields
            for key in ["suggestions", "reasoning", "used_memory", "file_analysis", "next_steps"]:
                if key in result:
                    normalized[key] = result[key]
            
            return normalized
        
        def _create_fallback_response(self, session_id: str) -> Dict[str, Any]:
            """
            Create fallback response when JSON extraction fails.
            Uses metric-specific template.
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
                "smart_response": f"I had trouble processing your request. {'Let me suggest based on your previous usage: ' + ', '.join(favorite_files) if favorite_files else 'Please try with specific file names and operation type.'}",
                "suggestions": [
                    "I had trouble processing your request",
                    f"Files you've used before: {', '.join(favorite_files) if favorite_files else 'None yet'}",
                    f"Available files: {', '.join(list(self.files_with_columns.keys())[:5])}",
                    "Example: 'select file.arrow as data source' or 'create a price column by dividing SalesValue by Volume'"
                ],
                "recommended_files": favorite_files,
                "next_steps": [
                    "Please specify which operation you want (Input/Variables/Column Ops)",
                    "Provide data source file name",
                    "Specify columns and operations needed",
                    "Or say 'yes' if you want to use suggested files"
                ]
            }
else:
    # Define MetricAgent as None if BaseAgent is not available
    MetricAgent = None


# ============================================================================
# Router already created at module level (above)
# Log router creation status
# ============================================================================
logger.info("=" * 80)
logger.info("METRIC AGENT MODULE LOADING")
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
    logger.info("INITIALIZING METRIC AGENT")
    logger.info("=" * 80)
    
    try:
        logger.info("Getting LLM and MinIO configuration...")
        llm_config = settings.get_llm_config()
        minio_config = settings.get_minio_config()
        logger.info(f"LLM Config: {llm_config.get('api_url', 'N/A')}")
        logger.info(f"MinIO Config: {minio_config.get('endpoint', 'N/A')}")
        
        logger.info("Creating MetricAgent instance...")
        agent = MetricAgent(
            api_url=llm_config["api_url"],
            model_name=llm_config["model_name"],
            bearer_token=llm_config["bearer_token"],
            minio_endpoint=minio_config["endpoint"],
            access_key=minio_config["access_key"],
            secret_key=minio_config["secret_key"],
            bucket=minio_config["bucket"],
            prefix=minio_config["prefix"]
        )
        
        logger.info("✅ MetricAgent initialized successfully")
        logger.info(f"Agent name: {agent.name}")
        logger.info(f"Agent description: {agent.description}")
        
        # Register agent in BaseAgent registry
        try:
            from BaseAgent.registry import registry
            registry.register(agent)
            logger.info(f"✅ Registered MetricAgent in BaseAgent registry")
        except ImportError:
            try:
                from TrinityAgent.BaseAgent.registry import registry
                registry.register(agent)
                logger.info(f"✅ Registered MetricAgent in BaseAgent registry (absolute import)")
            except ImportError as e:
                logger.warning(f"⚠️ Could not register agent in registry: {e}")
        
        agent_initialized = True
        logger.info("=" * 80)
    except Exception as e:
        logger.error("=" * 80)
        logger.error(f"❌ Failed to initialize MetricAgent: {e}", exc_info=True)
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
    global BaseAgent, AgentContext, AgentResult, settings, MetricPromptBuilder
    
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
            from .metric_prompt import MetricPromptBuilder
            logger.info("✅ BaseAgent imported successfully on retry")
            return True
        except ImportError as e1:
            logger.warning(f"Retry Strategy 1 failed: {e1}")
            try:
                logger.info("Retry Strategy 2: Importing from BaseAgent modules...")
                from BaseAgent.base_agent import BaseAgent
                from BaseAgent.interfaces import AgentContext, AgentResult
                from BaseAgent.config import settings
                from .metric_prompt import MetricPromptBuilder
                logger.info("✅ BaseAgent imported successfully on retry (modules)")
                return True
            except ImportError as e2:
                logger.warning(f"Retry Strategy 2 failed: {e2}")
                try:
                    logger.info("Retry Strategy 3: Importing from TrinityAgent.BaseAgent...")
                    from TrinityAgent.BaseAgent import BaseAgent, AgentContext, AgentResult, settings
                    from .metric_prompt import MetricPromptBuilder
                    logger.info("✅ BaseAgent imported successfully on retry (absolute)")
                    return True
                except ImportError as e3:
                    logger.error(f"All retry strategies failed: {e1}, {e2}, {e3}")
                    return False
    except Exception as e:
        logger.error(f"Unexpected error during BaseAgent retry import: {e}", exc_info=True)
        return False


class MetricRequest(BaseModel):
    """Request model for metric endpoint."""
    prompt: str
    session_id: Optional[str] = None
    client_name: str = ""
    app_name: str = ""
    project_name: str = ""


# Test endpoint to verify router is working
@router.get("/metric/test")
def test_endpoint() -> Dict[str, Any]:
    """Test endpoint to verify router is registered."""
    return {
        "success": True,
        "message": "Metric router is working!",
        "router_created": router is not None,
        "agent_initialized": agent_initialized if 'agent_initialized' in globals() else False
    }


@router.post("/metric")
def metric_operations(request: MetricRequest) -> Dict[str, Any]:
    """
    Smart metric operations endpoint with complete memory.
    Connects to backend via standardized BaseAgent interface.
    Handles three operation types: Input, Variables, and Column Ops.
    """
    import time
    start_time = time.time()
    
    # Try to initialize agent if not already initialized
    global agent, agent_initialized, BaseAgent, settings, MetricAgent
    
    if not agent_initialized or agent is None:
        logger.warning("MetricAgent not initialized - attempting to initialize now...")
        
        # First, try to retry BaseAgent import if it failed
        if BaseAgent is None or settings is None:
            logger.info("BaseAgent not imported - attempting to retry import...")
            if not _retry_baseagent_import():
                logger.error("BaseAgent import retry failed - cannot initialize agent")
                raise ConfigurationError(
                    "MetricAgent not initialized - BaseAgent import failed",
                    config_key="BASEAGENT_IMPORT"
                )
            
            # MetricAgent should already be defined at module level if BaseAgent was imported
            if BaseAgent is not None and MetricAgent is None:
                logger.error("BaseAgent imported but MetricAgent class not found - this should not happen")
                logger.error("MetricAgent should be defined at module level when BaseAgent is imported")
                raise ConfigurationError(
                    "MetricAgent class not found after BaseAgent import",
                    config_key="METRICAGENT_CLASS"
                )
        
        # Try to initialize now
        if BaseAgent is not None and settings is not None:
            try:
                logger.info("Attempting to initialize MetricAgent on-demand...")
                llm_config = settings.get_llm_config()
                minio_config = settings.get_minio_config()
                
                agent = MetricAgent(
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
                    logger.info(f"✅ Registered MetricAgent in BaseAgent registry (on-demand)")
                except ImportError:
                    try:
                        from TrinityAgent.BaseAgent.registry import registry
                        registry.register(agent)
                        logger.info(f"✅ Registered MetricAgent in BaseAgent registry (on-demand, absolute import)")
                    except ImportError as e:
                        logger.warning(f"⚠️ Could not register agent in registry: {e}")
                
                agent_initialized = True
                logger.info("✅ MetricAgent initialized successfully on-demand")
            except Exception as init_error:
                logger.error(f"❌ Failed to initialize MetricAgent on-demand: {init_error}", exc_info=True)
                raise ConfigurationError(
                    f"MetricAgent initialization failed: {str(init_error)}",
                    config_key="METRICAGENT_INIT"
                )
        else:
            logger.error("BaseAgent or settings still not available after retry")
            raise ConfigurationError(
                "MetricAgent not initialized - BaseAgent import failed",
                config_key="BASEAGENT_IMPORT"
            )
    
    if not agent_initialized or agent is None:
        logger.error("MetricAgent still not initialized after retry")
        raise ConfigurationError(
            "MetricAgent not initialized",
            config_key="METRICAGENT_INIT"
        )
    
    logger.info(f"METRIC REQUEST RECEIVED:")
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
        
        # Extract operation type and add to response
        operation_type = result.data.get("operation_type", "").lower()
        response["operation_type"] = operation_type
        
        # Add operation-specific fields
        if "data_source" in result.data:
            response["data_source"] = result.data["data_source"]
        elif "dataSource" in result.data:
            response["data_source"] = result.data["dataSource"]
        
        if "file_name" in result.data:
            response["file_name"] = result.data["file_name"]
        
        if "operation_config" in result.data:
            response["operation_config"] = result.data["operation_config"]
        
        if "metrics_json" in result.data:
            response["metrics_json"] = result.data["metrics_json"]
        
        # Add API endpoint fields
        if "api_endpoint" in result.data:
            response["api_endpoint"] = result.data["api_endpoint"]
        
        if "api_endpoint_save" in result.data:
            response["api_endpoint_save"] = result.data["api_endpoint_save"]
        
        # Add other fields from result.data
        for key in ["suggestions", "reasoning", "used_memory", "file_analysis", "next_steps"]:
            if key in result.data:
                response[key] = result.data[key]
        
        logger.info(f"METRIC REQUEST COMPLETED:")
        logger.info(f"Success: {response.get('success', False)}")
        logger.info(f"Operation Type: {response.get('operation_type', 'unknown')}")
        logger.info(f"Processing Time: {response.get('processing_time', 0)}s")
        
        return response
        
    except (TrinityException, ValidationError, FileLoadError, ConfigurationError) as e:
        # Re-raise Trinity exceptions to be caught by global handler
        logger.error(f"METRIC REQUEST FAILED (TrinityException): {e.message if hasattr(e, 'message') else str(e)}", exc_info=True)
        raise
    except Exception as e:
        # Wrap generic exceptions in AgentExecutionError
        logger.error(f"METRIC REQUEST FAILED: {e}", exc_info=True)
        raise AgentExecutionError(
            f"An error occurred while processing your request: {str(e)}",
            agent_name="metric"
        )


@router.get("/metric/history/{session_id}")
def get_history(session_id: str) -> Dict[str, Any]:
    """Get session history."""
    if not agent_initialized or agent is None:
        raise ConfigurationError(
            "MetricAgent not initialized",
            config_key="METRICAGENT_INIT"
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
            agent_name="metric"
        )


@router.get("/metric/files")
def list_files() -> Dict[str, Any]:
    """List available files."""
    if not agent_initialized or agent is None:
        raise ConfigurationError(
            "MetricAgent not initialized",
            config_key="METRICAGENT_INIT"
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
            agent_name="metric"
        )


@router.get("/metric/health")
def health_check() -> Dict[str, Any]:
    """Health check endpoint."""
    if not agent_initialized or agent is None:
        return {
            "status": "unhealthy",
            "service": "metric",
            "error": "Agent not initialized",
            "version": "1.0.0"
        }
    
    status = {
        "status": "healthy",
        "service": "metric",
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
logger.info("METRIC AGENT MODULE LOADED")
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

