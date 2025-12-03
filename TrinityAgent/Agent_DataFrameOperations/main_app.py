"""
Standardized DataFrameOperations Agent using BaseAgent infrastructure
Connects to backend via FastAPI router
"""

import sys
import json
import logging
from pathlib import Path
from typing import Dict, Any, Optional, List
from fastapi import APIRouter
from pydantic import BaseModel

# ============================================================================
# IMPORT ROUTER FROM router.py (always available)
# This ensures router is always available even if agent init fails
# ============================================================================
from .router import router

# Initialize logger early
logger = logging.getLogger("trinity.agent_dataframe_operations")

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
DataFrameOperationsPromptBuilder = None

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
        from .dataframe_operations_prompt import DataFrameOperationsPromptBuilder
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
            from .dataframe_operations_prompt import DataFrameOperationsPromptBuilder
            logger.info("✅ Imported BaseAgent from local BaseAgent modules")
        except ImportError as e2:
            logger.warning(f"Strategy 2 failed: {e2}")
            import traceback
            logger.warning(f"Strategy 2 traceback: {traceback.format_exc()}")
            try:
                # Fallback import
                logger.info("Strategy 3: Importing from TrinityAgent.BaseAgent (absolute)...")
                from TrinityAgent.BaseAgent import BaseAgent, AgentContext, AgentResult, settings
                from .dataframe_operations_prompt import DataFrameOperationsPromptBuilder
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

# Only define DataFrameOperationsAgent if BaseAgent was imported successfully
if BaseAgent is not None:
    class DataFrameOperationsAgent(BaseAgent):
        """
        Standardized DataFrameOperations Agent using BaseAgent infrastructure.
        Only implements dataframe_operations-specific logic.
        """
        
        @property
        def name(self) -> str:
            return "dataframe_operations"
        
        @property
        def description(self) -> str:
            return "Performs DataFrame operations (load, filter, sort, column operations, formulas, save) on data files"
        
        def _call_llm(self, prompt: str, temperature: float = 0.1, num_predict: int = 4000) -> str:
            """
            Override to add logging for raw LLM response.
            """
            # Call parent method
            llm_response = super()._call_llm(prompt, temperature, num_predict)
            
            # Log what we received from LLM
            logger.info("=" * 80)
            logger.info("📥 RECEIVED FROM DATAFRAME OPERATIONS LLM:")
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
            Build dataframe_operations-specific prompt using DataFrameOperationsPromptBuilder.
            BaseAgent handles file loading and context building automatically.
            """
            # Use DataFrameOperationsPromptBuilder to build the prompt
            # BaseAgent's execute() method provides available_files and context
            prompt = DataFrameOperationsPromptBuilder.build_dataframe_operations_prompt(
                user_prompt=user_prompt,
                available_files_with_columns=available_files,
                context=context,
                file_details={},  # Can be enhanced if needed
                other_files=[],
                matched_columns={}
            )
            
            # Log what we're sending to LLM
            logger.info("=" * 80)
            logger.info("📤 SENDING TO DATAFRAME OPERATIONS LLM:")
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
            Validate dataframe_operations-specific JSON structure.
            BaseAgent handles general validation, this adds dataframe_operations-specific checks.
            """
            if not isinstance(result, dict):
                return False
            
            # If success is True, must have dataframe_config
            if result.get("success") is True:
                if "dataframe_config" not in result:
                    return False
                
                dataframe_config = result.get("dataframe_config", {})
                if not isinstance(dataframe_config, dict):
                    return False
                
                # Must have operations list
                operations = dataframe_config.get("operations", [])
                if not isinstance(operations, list):
                    return False
                
                if len(operations) == 0:
                    return False
                
                # Validate each operation
                for op in operations:
                    if not isinstance(op, dict):
                        return False
                    
                    # Must have operation_id, api_endpoint, and parameters
                    if "operation_id" not in op:
                        return False
                    if "api_endpoint" not in op:
                        return False
                    if "parameters" not in op:
                        return False
            
            # Reasoning is preferred but not strictly required (will be added in normalization if missing)
            # No longer validating for smart_response or response - only reasoning is used now
            
            return True
        
        def _normalize_result(self, result: Dict[str, Any]) -> Dict[str, Any]:
            """
            Normalize dataframe_operations result to ensure consistent format.
            BaseAgent handles general normalization.
            🔧 CRITICAL: Column names MUST preserve original case (backend expects exact column names from dataset).
            🔧 CRITICAL: Filter values MUST preserve original case (backend expects exact values from dataset).
            Only api_endpoint and operation names are normalized to lowercase.
            """
            normalized = {
                "success": result.get("success", False),
                "response": result.get("response", ""),  # Raw LLM thinking
                "smart_response": result.get("smart_response", ""),
            }
            
            # Add dataframe_config if present
            if "dataframe_config" in result:
                dataframe_config = result["dataframe_config"]
                
                if not isinstance(dataframe_config, dict):
                    dataframe_config = {}
                
                operations = dataframe_config.get("operations", [])
                if not isinstance(operations, list):
                    operations = []
                
                # Normalize each operation
                normalized_operations = []
                validation_errors = []
                file_for_validation = None
                
                for op in operations:
                    if not isinstance(op, dict):
                        continue
                    
                    # Normalize operation structure
                    normalized_op = {
                        "operation_id": str(op.get("operation_id", f"{len(normalized_operations) + 1}")),
                        "api_endpoint": op.get("api_endpoint", "").lower().strip() if isinstance(op.get("api_endpoint"), str) else str(op.get("api_endpoint", "")).lower().strip(),
                        "operation_name": op.get("operation_name", "").lower().strip() if isinstance(op.get("operation_name"), str) else str(op.get("operation_name", "")).lower().strip(),
                        "description": op.get("description", ""),
                        "parameters": op.get("parameters", {}),
                        "execute_order": op.get("execute_order", len(normalized_operations) + 1),
                        "depends_on": op.get("depends_on", [])
                    }
                    
                    # 🔧 CRITICAL: Preserve original column names and values in parameters (case-sensitive for backend)
                    # Backend expects exact column names and values from dataset
                    parameters = normalized_op.get("parameters", {})
                    if isinstance(parameters, dict):
                        normalized_params = {}
                        for param_key, param_value in parameters.items():
                            # For column-related parameters, preserve original case
                            if param_key in ["column", "name", "old_name", "new_name", "from", "target_column"]:
                                # Preserve original case for column names
                                normalized_params[param_key] = str(param_value).strip() if isinstance(param_value, (str, int, float)) else str(param_value)
                            elif param_key == "value" and isinstance(param_value, (str, list)):
                                # Preserve original case for filter values
                                if isinstance(param_value, list):
                                    normalized_params[param_key] = [str(v).strip() for v in param_value if v]
                                else:
                                    normalized_params[param_key] = str(param_value).strip()
                            elif param_key == "object_name":
                                # File path - preserve as is (will be validated)
                                normalized_params[param_key] = str(param_value).strip() if isinstance(param_value, str) else str(param_value)
                            else:
                                # Other parameters (direction, index, etc.) - preserve as is
                                normalized_params[param_key] = param_value
                        normalized_op["parameters"] = normalized_params
                    
                    # Extract file for validation (from first load_cached operation)
                    if normalized_op.get("api_endpoint") == "/load_cached" and not file_for_validation:
                        file_for_validation = normalized_op.get("parameters", {}).get("object_name", "")
                    
                    normalized_operations.append(normalized_op)
                
                # 🔧 CRITICAL: Validate operations against actual file data
                # This ensures 100% guarantee that columns and filter values exist
                # Uses case-insensitive matching but preserves original case
                if self.data_validator and file_for_validation:
                    # Validate columns used in operations
                    all_columns_to_validate = []
                    filter_validations = {}  # {column: [values]}
                    
                    for op in normalized_operations:
                        params = op.get("parameters", {})
                        api_endpoint = op.get("api_endpoint", "")
                        
                        # Collect columns for validation
                        if api_endpoint == "/filter_rows":
                            col = params.get("column")
                            if col:
                                all_columns_to_validate.append(col)
                                # Collect filter values for validation
                                filter_val = params.get("value")
                                if filter_val:
                                    if col not in filter_validations:
                                        filter_validations[col] = []
                                    if isinstance(filter_val, list):
                                        filter_validations[col].extend([str(v) for v in filter_val if v])
                                    else:
                                        filter_validations[col].append(str(filter_val))
                        elif api_endpoint in ["/sort", "/delete_column", "/duplicate_column", "/rename_column", "/move_column", "/retype_column"]:
                            col = params.get("column") or params.get("name") or params.get("old_name") or params.get("from")
                            if col:
                                all_columns_to_validate.append(col)
                        elif api_endpoint == "/apply_formula":
                            # Formula might reference columns - extract if possible
                            formula = params.get("formula", "")
                            if isinstance(formula, str) and "=" in formula:
                                # Try to extract column names from formula (basic extraction)
                                # This is a simple heuristic - formulas can be complex
                                pass  # Skip formula column validation for now
                    
                    # Validate all columns exist
                    if all_columns_to_validate:
                        unique_columns = list(set(all_columns_to_validate))
                        is_valid, missing_cols, column_mapping = self.data_validator.validate_columns_exist(
                            file_for_validation, unique_columns, "DataFrameOperations"
                        )
                        if not is_valid:
                            validation_errors.extend([f"Column '{col}' not found in file" for col in missing_cols])
                            logger.error(f"❌ VALIDATION FAILED: Columns not found: {missing_cols}")
                        else:
                            # Apply column mapping to correct case
                            for op in normalized_operations:
                                params = op.get("parameters", {})
                                for param_key in ["column", "name", "old_name", "new_name", "from"]:
                                    if param_key in params:
                                        param_value = str(params[param_key]).strip()
                                        param_lower = param_value.lower()
                                        if param_lower in column_mapping:
                                            params[param_key] = column_mapping[param_lower]
                                            logger.debug(f"✅ Applied column case correction: '{param_value}' -> '{column_mapping[param_lower]}'")
                    
                    # Validate filter values exist
                    for filter_col, filter_vals in filter_validations.items():
                        if filter_vals:
                            unique_vals = list(set(filter_vals))
                            is_valid, invalid_vals, value_mapping = self.data_validator.validate_filter_values_exist(
                                file_for_validation, filter_col, unique_vals, "DataFrameOperations"
                            )
                            if not is_valid:
                                validation_errors.extend([f"Filter value '{val}' not found in column '{filter_col}'" for val in invalid_vals])
                                logger.error(f"❌ VALIDATION FAILED: Filter values not found in column '{filter_col}': {invalid_vals}")
                            else:
                                # Apply value mapping to correct case
                                for op in normalized_operations:
                                    if op.get("api_endpoint") == "/filter_rows":
                                        params = op.get("parameters", {})
                                        if params.get("column") == filter_col:
                                            filter_val = params.get("value")
                                            if isinstance(filter_val, list):
                                                original_vals = [value_mapping.get(str(v).strip(), str(v).strip()) for v in filter_val]
                                                params["value"] = original_vals
                                            elif filter_val:
                                                original_val = value_mapping.get(str(filter_val).strip(), str(filter_val).strip())
                                                params["value"] = original_val
                                            logger.debug(f"✅ Applied filter value case correction for '{filter_col}': {params.get('value')}")
                    
                    if validation_errors:
                        error_msg = "Data validation failed. " + "; ".join(validation_errors)
                        logger.error(f"❌ DATAFRAME OPERATIONS VALIDATION ERRORS: {error_msg}")
                        # Set success to False and add detailed error message
                        normalized["success"] = False
                        normalized["smart_response"] = (
                            f"I found some issues with the DataFrame operations configuration: {error_msg}. "
                            "Please check that all column names and filter values exist in the file."
                        )
                        normalized["validation_errors"] = validation_errors
                    else:
                        logger.info("✅ VALIDATION PASSED for DataFrame operations")
                elif not self.data_validator:
                    logger.warning("⚠️ DataValidator not available - skipping validation")
                
                # Store normalized dataframe_config
                normalized["dataframe_config"] = {
                    "operations": normalized_operations
                }
                
                # Add execution_plan if present
                if "execution_plan" in result:
                    normalized["execution_plan"] = result["execution_plan"]
                else:
                    # Default execution plan
                    normalized["execution_plan"] = {
                        "auto_execute": True,
                        "execution_mode": "sequential",
                        "error_handling": "stop_on_error"
                    }
            
            # Extract file_name from first load_cached operation if available
            if "dataframe_config" in normalized and normalized["dataframe_config"].get("operations"):
                for op in normalized["dataframe_config"]["operations"]:
                    if op.get("api_endpoint") == "/load_cached":
                        object_name = op.get("parameters", {}).get("object_name", "")
                        if object_name:
                            normalized["file_name"] = object_name
                            break
            
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
            Uses dataframe_operations-specific template.
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
                "smart_response": f"I had trouble processing your request. {'Let me suggest based on your previous usage: ' + ', '.join(favorite_files) if favorite_files else 'Please try with specific file names and DataFrame operation requirements.'}",
                "suggestions": [
                    "I had trouble processing your request",
                    f"Files you've used before: {', '.join(favorite_files) if favorite_files else 'None yet'}",
                    f"Available files: {', '.join(list(self.files_with_columns.keys())[:5])}",
                    "Example: 'load file.csv and filter for Country = USA'"
                ],
                "recommended_files": favorite_files,
                "next_steps": [
                    "Please try with specific file names and DataFrame operation requirements",
                    "Or say 'yes' if you want to use suggested files",
                    "Or say 'show me available files' to see all options"
                ]
            }
else:
    # Define DataFrameOperationsAgent as None if BaseAgent is not available
    DataFrameOperationsAgent = None


# ============================================================================
# Router already created at module level (above)
# Log router creation status
# ============================================================================
logger.info("=" * 80)
logger.info("DATAFRAME OPERATIONS AGENT MODULE LOADING")
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
    logger.info("INITIALIZING DATAFRAME OPERATIONS AGENT")
    logger.info("=" * 80)
    
    try:
        logger.info("Getting LLM and MinIO configuration...")
        llm_config = settings.get_llm_config()
        minio_config = settings.get_minio_config()
        logger.info(f"LLM Config: {llm_config.get('api_url', 'N/A')}")
        logger.info(f"MinIO Config: {minio_config.get('endpoint', 'N/A')}")
        
        logger.info("Creating DataFrameOperationsAgent instance...")
        agent = DataFrameOperationsAgent(
            api_url=llm_config["api_url"],
            model_name=llm_config["model_name"],
            bearer_token=llm_config["bearer_token"],
            minio_endpoint=minio_config["endpoint"],
            access_key=minio_config["access_key"],
            secret_key=minio_config["secret_key"],
            bucket=minio_config["bucket"],
            prefix=minio_config["prefix"]
        )
        
        logger.info("✅ DataFrameOperationsAgent initialized successfully")
        logger.info(f"Agent name: {agent.name}")
        logger.info(f"Agent description: {agent.description}")
        
        # Register agent in BaseAgent registry
        try:
            from BaseAgent.registry import registry
            registry.register(agent)
            logger.info(f"✅ Registered DataFrameOperationsAgent in BaseAgent registry")
        except ImportError:
            try:
                from TrinityAgent.BaseAgent.registry import registry
                registry.register(agent)
                logger.info(f"✅ Registered DataFrameOperationsAgent in BaseAgent registry (absolute import)")
            except ImportError as e:
                logger.warning(f"⚠️ Could not register agent in registry: {e}")
        
        agent_initialized = True
        logger.info("=" * 80)
    except Exception as e:
        logger.error("=" * 80)
        logger.error(f"❌ Failed to initialize DataFrameOperationsAgent: {e}", exc_info=True)
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
    global BaseAgent, AgentContext, AgentResult, settings, DataFrameOperationsPromptBuilder
    
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
            from .dataframe_operations_prompt import DataFrameOperationsPromptBuilder
            logger.info("✅ BaseAgent imported successfully on retry")
            return True
        except ImportError as e1:
            logger.warning(f"Retry Strategy 1 failed: {e1}")
            try:
                logger.info("Retry Strategy 2: Importing from BaseAgent modules...")
                from BaseAgent.base_agent import BaseAgent
                from BaseAgent.interfaces import AgentContext, AgentResult
                from BaseAgent.config import settings
                from .dataframe_operations_prompt import DataFrameOperationsPromptBuilder
                logger.info("✅ BaseAgent imported successfully on retry (modules)")
                return True
            except ImportError as e2:
                logger.warning(f"Retry Strategy 2 failed: {e2}")
                try:
                    logger.info("Retry Strategy 3: Importing from TrinityAgent.BaseAgent...")
                    from TrinityAgent.BaseAgent import BaseAgent, AgentContext, AgentResult, settings
                    from .dataframe_operations_prompt import DataFrameOperationsPromptBuilder
                    logger.info("✅ BaseAgent imported successfully on retry (absolute)")
                    return True
                except ImportError as e3:
                    logger.error(f"All retry strategies failed: {e1}, {e2}, {e3}")
                    return False
    except Exception as e:
        logger.error(f"Unexpected error during BaseAgent retry import: {e}", exc_info=True)
        return False


class DataFrameOperationsRequest(BaseModel):
    """Request model for dataframe_operations endpoint."""
    prompt: str
    session_id: Optional[str] = None
    client_name: str = ""
    app_name: str = ""
    project_name: str = ""
    current_df_id: Optional[str] = None


# Test endpoint to verify router is working
@router.get("/dataframe-operations/test")
def test_endpoint() -> Dict[str, Any]:
    """Test endpoint to verify router is registered."""
    return {
        "success": True,
        "message": "DataFrameOperations router is working!",
        "router_created": router is not None,
        "agent_initialized": agent_initialized if 'agent_initialized' in globals() else False
    }


@router.post("/dataframe-operations")
def dataframe_operations(request: DataFrameOperationsRequest) -> Dict[str, Any]:
    """
    Smart DataFrame operations endpoint with complete memory.
    Connects to backend via standardized BaseAgent interface.
    """
    import time
    start_time = time.time()
    
    # Try to initialize agent if not already initialized
    global agent, agent_initialized, BaseAgent, settings, DataFrameOperationsAgent
    
    if not agent_initialized or agent is None:
        logger.warning("DataFrameOperationsAgent not initialized - attempting to initialize now...")
        
        # First, try to retry BaseAgent import if it failed
        if BaseAgent is None or settings is None:
            logger.info("BaseAgent not imported - attempting to retry import...")
            if not _retry_baseagent_import():
                logger.error("BaseAgent import retry failed - cannot initialize agent")
                return {
                    "success": False,
                    "error": "DataFrameOperationsAgent not initialized - BaseAgent import failed",
                    "smart_response": "The dataframe_operations agent is not available. BaseAgent could not be imported. Please check server logs for details.",
                    "processing_time": round(time.time() - start_time, 2)
                }
            
            if BaseAgent is not None and DataFrameOperationsAgent is None:
                logger.error("BaseAgent imported but DataFrameOperationsAgent class not found - this should not happen")
                logger.error("DataFrameOperationsAgent should be defined at module level when BaseAgent is imported")
        
        # Try to initialize now
        if BaseAgent is not None and settings is not None:
            try:
                logger.info("Attempting to initialize DataFrameOperationsAgent on-demand...")
                llm_config = settings.get_llm_config()
                minio_config = settings.get_minio_config()
                
                agent = DataFrameOperationsAgent(
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
                    logger.info(f"✅ Registered DataFrameOperationsAgent in BaseAgent registry (on-demand)")
                except ImportError:
                    try:
                        from TrinityAgent.BaseAgent.registry import registry
                        registry.register(agent)
                        logger.info(f"✅ Registered DataFrameOperationsAgent in BaseAgent registry (on-demand, absolute import)")
                    except ImportError as e:
                        logger.warning(f"⚠️ Could not register agent in registry: {e}")
                
                agent_initialized = True
                logger.info("✅ DataFrameOperationsAgent initialized successfully on-demand")
            except Exception as init_error:
                logger.error(f"❌ Failed to initialize DataFrameOperationsAgent on-demand: {init_error}", exc_info=True)
                return {
                    "success": False,
                    "error": f"DataFrameOperationsAgent initialization failed: {str(init_error)}",
                    "smart_response": "The dataframe_operations agent could not be initialized. Please check server logs for details.",
                    "processing_time": round(time.time() - start_time, 2)
                }
        else:
            logger.error("BaseAgent or settings still not available after retry")
            return {
                "success": False,
                "error": "DataFrameOperationsAgent not initialized - BaseAgent import failed",
                "smart_response": "The dataframe_operations agent is not available. BaseAgent could not be imported. Please check server logs for details.",
                "processing_time": round(time.time() - start_time, 2)
            }
    
    if not agent_initialized or agent is None:
        logger.error("DataFrameOperationsAgent still not initialized after retry")
        return {
            "success": False,
            "error": "DataFrameOperationsAgent not initialized",
            "smart_response": "The dataframe_operations agent is not available. Please check server logs.",
            "processing_time": round(time.time() - start_time, 2)
        }
    
    logger.info(f"DATAFRAME OPERATIONS REQUEST RECEIVED:")
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
        
        # Add dataframe_config if present (at top level for frontend handler)
        if "dataframe_config" in result.data:
            dataframe_config = result.data["dataframe_config"]
            
            # Set at top level (frontend expects data.dataframe_config)
            response["dataframe_config"] = dataframe_config
            
            # Also add to response.data for consistency
            if "data" in response and isinstance(response["data"], dict):
                response["data"]["dataframe_config"] = dataframe_config
            
            # Extract file_name from first load_cached operation if available
            if isinstance(dataframe_config, dict):
                operations = dataframe_config.get("operations", [])
                for op in operations:
                    if isinstance(op, dict) and op.get("api_endpoint") == "/load_cached":
                        object_name = op.get("parameters", {}).get("object_name", "")
                        if object_name:
                            response["file_name"] = object_name
                            break
            
            logger.info(f"🔧 SET dataframe_config at top level (preserving original column case):")
            logger.info(f"  - Number of operations: {len(operations) if isinstance(dataframe_config, dict) and 'operations' in dataframe_config else 0}")
            if isinstance(dataframe_config, dict) and "operations" in dataframe_config:
                for idx, op in enumerate(dataframe_config["operations"]):
                    if isinstance(op, dict):
                        logger.info(f"  - Operation {idx + 1}: {op.get('api_endpoint')} - {op.get('operation_name', 'N/A')}")
                        params = op.get("parameters", {})
                        if "column" in params:
                            logger.info(f"    Column (original case preserved): '{params['column']}'")
                        if "value" in params:
                            logger.info(f"    Value (original case preserved): {params['value']}")
            logger.info(f"🔧 Full dataframe_config structure: {json.dumps(dataframe_config, indent=2)}")
        
        # Add execution_plan if present
        if "execution_plan" in result.data:
            response["execution_plan"] = result.data["execution_plan"]
        
        # Add other fields from result.data
        for key in ["suggestions", "reasoning", "used_memory", "file_analysis", "next_steps", "file_name"]:
            if key in result.data:
                response[key] = result.data[key]
        
        # Ensure message field exists (UI might expect it)
        if "message" not in response:
            response["message"] = response.get("smart_response", "")
        
        logger.info(f"DATAFRAME OPERATIONS REQUEST COMPLETED:")
        logger.info(f"Success: {response.get('success', False)}")
        logger.info(f"Processing Time: {response.get('processing_time', 0)}s")
        logger.info(f"Response keys: {list(response.keys())}")
        logger.info(f"Has dataframe_config: {'dataframe_config' in response}")
        if "dataframe_config" in response:
            df_config = response["dataframe_config"]
            if isinstance(df_config, dict) and "operations" in df_config:
                logger.info(f"  - Operations count: {len(df_config['operations'])}")
        
        return response
        
    except Exception as e:
        logger.error(f"DATAFRAME OPERATIONS REQUEST FAILED: {e}", exc_info=True)
        processing_time = round(time.time() - start_time, 2)
        
        return {
            "success": False,
            "error": str(e),
            "response": f"Error occurred: {str(e)}",
            "smart_response": f"An error occurred while processing your request: {str(e)}",
            "processing_time": processing_time
        }


@router.get("/dataframe-operations/history/{session_id}")
def get_history(session_id: str) -> Dict[str, Any]:
    """Get session history."""
    if not agent_initialized or agent is None:
        return {
            "success": False,
            "error": "DataFrameOperationsAgent not initialized"
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


@router.get("/dataframe-operations/files")
def list_files() -> Dict[str, Any]:
    """List available files."""
    if not agent_initialized or agent is None:
        return {
            "success": False,
            "error": "DataFrameOperationsAgent not initialized"
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


@router.get("/dataframe-operations/health")
def health_check() -> Dict[str, Any]:
    """Health check endpoint."""
    if not agent_initialized or agent is None:
        return {
            "status": "unhealthy",
            "service": "dataframe_operations",
            "error": "Agent not initialized",
            "version": "1.0.0"
        }
    
    status = {
        "status": "healthy",
        "service": "dataframe_operations",
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
        set_agent_metadata("dataframe_operations", {
            "name": "DataFrame Operations",
            "description": "Perform DataFrame operations (load, filter, sort, column operations, formulas, save) on data files",
            "category": "Data Operations",
            "tags": ["dataframe", "operations", "filter", "sort", "columns", "formulas", "data", "manipulation"]
        })
        # Register router
        if router is not None:
            success = register_agent("dataframe_operations", router)
            if success:
                logger.info("✅ DataFrameOperations router registered in agent registry")
            else:
                logger.warning("⚠️ Failed to register DataFrameOperations router in agent registry")
    except ImportError:
        # Agent registry not available, will be auto-discovered
        # This is expected during initialization, so log at debug level
        logger.debug("Agent registry not available during module import - router will be auto-discovered")
except Exception as e:
    # Registration failure is non-critical - auto-discovery will handle it
    logger.debug(f"Could not register DataFrameOperations router during module import (will be auto-discovered): {e}")

# Log router setup on module load
logger.info("=" * 80)
logger.info("DATAFRAME OPERATIONS AGENT MODULE LOADED")
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

