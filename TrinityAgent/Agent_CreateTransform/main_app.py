"""
Standardized CreateTransform Agent using BaseAgent infrastructure
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
logger = logging.getLogger("trinity.agent_create_transform")

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
CreateTransformPromptBuilder = None

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
        from .create_transform_prompt import CreateTransformPromptBuilder
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
            from .create_transform_prompt import CreateTransformPromptBuilder
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
                from .create_transform_prompt import CreateTransformPromptBuilder
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

# Only define CreateTransformAgent if BaseAgent was imported successfully
if BaseAgent is not None:
    class CreateTransformAgent(BaseAgent):
        """
        Standardized CreateTransform Agent using BaseAgent infrastructure.
        Only implements create_transform-specific logic.
        """
        
        def __init__(self, api_url: str, model_name: str, bearer_token: str,
                     minio_endpoint: str, access_key: str, secret_key: str,
                     bucket: str, prefix: str,
                     supported_operations: Optional[Dict[str, str]] = None,
                     operation_format: Optional[str] = None):
            """
            Initialize CreateTransformAgent with operations support.
            
            Args:
                supported_operations: Dictionary of supported operations and descriptions
                operation_format: Format string for operation JSON structure
            """
            # Call parent __init__ first
            super().__init__(
                api_url=api_url,
                model_name=model_name,
                bearer_token=bearer_token,
                minio_endpoint=minio_endpoint,
                access_key=access_key,
                secret_key=secret_key,
                bucket=bucket,
                prefix=prefix
            )
            
            # Store operations configuration
            if supported_operations is None:
                # Use default from CreateTransformPromptBuilder if available
                try:
                    if CreateTransformPromptBuilder is not None:
                        self.supported_operations = CreateTransformPromptBuilder.DEFAULT_SUPPORTED_OPERATIONS
                    else:
                        # Fallback: import directly
                        from .create_transform_prompt import CreateTransformPromptBuilder as CTBuilder
                        self.supported_operations = CTBuilder.DEFAULT_SUPPORTED_OPERATIONS
                except Exception as e:
                    logger.warning(f"Could not load default operations from CreateTransformPromptBuilder: {e}")
                    # Use hardcoded defaults as last resort (defined below)
                    self.supported_operations = {
                        "add": "Add multiple numeric columns together (e.g., volume + sales_value)",
                        "subtract": "Subtract columns (first column minus others, e.g., revenue - cost)",
                        "multiply": "Multiply multiple numeric columns together (e.g., price * quantity)",
                        "divide": "Divide columns (first column divided by others, e.g., revenue / volume)",
                        "abs": "Create absolute value for numeric columns (|value|).",
                        "power": "Raise a column to a specified power (requires `_param`, e.g., 2 for square).",
                        "sqrt": "Calculate square root of a numeric column.",
                        "log": "Calculate natural logarithm of a numeric column.",
                        "exp": "Calculate exponential of a numeric column.",
                        "residual": "Calculate regression residuals for a dependent column vs explanatory columns.",
                        "dummy": "Create categorical dummy/label-encoded columns.",
                        "datetime": "Extract year/month/week/day/day_name/month_name from a datetime column via `_param`.",
                        "rpi": "Calculate relative price index (price / average_price).",
                        "stl_outlier": "Detect STL outliers for date/volume columns.",
                        "logistic": "Apply logistic saturation with `_param` JSON: {\"gr\": growth, \"co\": carryover, \"mp\": midpoint}.",
                        "detrend": "Remove trend component using STL on a date-sorted series.",
                        "deseasonalize": "Remove seasonal component using STL.",
                        "detrend_deseasonalize": "Remove both trend and seasonality using STL.",
                        "standardize_zscore": "Standardize numeric columns using z-score.",
                        "standardize_minmax": "Scale numeric columns to 0-1 using min/max."
                    }
            else:
                self.supported_operations = supported_operations
            
            if operation_format is None:
                # Use default from CreateTransformPromptBuilder if available
                try:
                    if CreateTransformPromptBuilder is not None:
                        self.operation_format = CreateTransformPromptBuilder.DEFAULT_OPERATION_FORMAT
                    else:
                        # Fallback: import directly
                        from .create_transform_prompt import CreateTransformPromptBuilder as CTBuilder
                        self.operation_format = CTBuilder.DEFAULT_OPERATION_FORMAT
                except Exception as e:
                    logger.warning(f"Could not load default format from CreateTransformPromptBuilder: {e}")
                    # Use hardcoded defaults as last resort (defined below)
                    self.operation_format = """
[
  {
    "bucket_name": "trinity",
    "object_name": "exact_file_name.extension",
    "add_1": "column1,column2",
    "add_1_rename": "new_column_name",
    "multiply_1": "column3,column4",
    "multiply_1_rename": "product_column",
    "add_2": "column5,column6",
    "add_2_rename": "sum_of_columns"
  }
]

## Operation Examples:
## - "add_1": "volume,salesvalue" → "add_1_rename": "total_volume_sales"
## - "multiply_1": "price,quantity" → "multiply_1_rename": "total_revenue"
## - "subtract_1": "revenue,cost" → "subtract_1_rename": "profit_margin"
## - "divide_1": "revenue,volume" → "divide_1_rename": "price_per_unit"
##
## Special Parameters:
## - Datetime ops must include `<op>_<idx>_param` with one of: to_year, to_month, to_week, to_day, to_day_name, to_month_name.
## - Logistic ops require `<op>_<idx>_param` JSON: {"gr": growth_rate, "co": carryover, "mp": midpoint}.
## - Power ops require `<op>_<idx>_param` numeric exponent (e.g., 2 for square).
"""
            else:
                self.operation_format = operation_format
        
        @property
        def name(self) -> str:
            return "create_transform"
        
        @property
        def description(self) -> str:
            return "Creates and transforms data columns using various operations (add, subtract, multiply, divide, abs, power, sqrt, log, exp, dummy, datetime, etc.)"
        
        def _call_llm(self, prompt: str, temperature: float = 0.1, num_predict: int = 4000) -> str:
            """
            Override to add logging for raw LLM response.
            """
            # Call parent method
            llm_response = super()._call_llm(prompt, temperature, num_predict)
            
            # Log what we received from LLM
            logger.info("=" * 80)
            logger.info("📥 RECEIVED FROM CREATETRANSFORM LLM:")
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
            Build create_transform-specific prompt using CreateTransformPromptBuilder.
            BaseAgent handles file loading and context building automatically.
            """
            # Use CreateTransformPromptBuilder to build the prompt
            # BaseAgent's execute() method provides available_files and context
            prompt = CreateTransformPromptBuilder.build_create_transform_prompt(
                user_prompt=user_prompt,
                available_files_with_columns=available_files,
                context=context,
                supported_operations=self.supported_operations,
                operation_format=self.operation_format,
                file_details={},  # Can be enhanced if needed
                other_files=[],
                matched_columns={}
            )
            
            # Log what we're sending to LLM
            logger.info("=" * 80)
            logger.info("📤 SENDING TO CREATETRANSFORM LLM:")
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
            Validate create_transform-specific JSON structure.
            BaseAgent handles general validation, this adds create_transform-specific checks.
            """
            if not isinstance(result, dict):
                return False
            
            # If success is True, must have create_transform_json
            if result.get("success") is True:
                # Check for create_transform_json or json (for compatibility)
                create_transform_json = result.get("create_transform_json") or result.get("json")
                if not create_transform_json:
                    return False
                
                # create_transform_json should be a list (array of operation configs)
                if not isinstance(create_transform_json, list):
                    return False
                
                # Each config in the list should be a dict with required fields
                for config in create_transform_json:
                    if not isinstance(config, dict):
                        return False
                    # Must have bucket_name and object_name
                    if "bucket_name" not in config or "object_name" not in config:
                        return False
                    # Must have at least one operation
                    has_operation = False
                    for key in config.keys():
                        if key not in ["bucket_name", "object_name"] and not key.endswith("_rename") and not key.endswith("_param"):
                            has_operation = True
                            break
                    if not has_operation:
                        return False
            
            # Must have smart_response (BaseAgent requirement)
            if "smart_response" not in result:
                return False
            
            # Must have response (raw thinking)
            if "response" not in result:
                return False
            
            return True
        
        def _normalize_column_names(self, create_transform_json: List[Dict[str, Any]]) -> List[Dict[str, Any]]:
            """
            Normalize all column names to lowercase for backend compatibility.
            
            Args:
                create_transform_json: List of operation configs
                
            Returns:
                List with all column names converted to lowercase
            """
            normalized_list = []
            
            for config in create_transform_json:
                if not isinstance(config, dict):
                    normalized_list.append(config)
                    continue
                
                normalized_config = {}
                
                for key, value in config.items():
                    # Skip non-column fields (bucket_name, object_name)
                    if key in ["bucket_name", "object_name"]:
                        normalized_config[key] = value
                        continue
                    
                    # Handle _param fields (keep as-is, they're JSON or special values)
                    if key.endswith("_param"):
                        normalized_config[key] = value
                        continue
                    
                    # Handle rename fields (single column name)
                    # e.g., "add_1_rename": "NewColumnName" -> "add_1_rename": "newcolumnname"
                    if key.endswith("_rename"):
                        if isinstance(value, str):
                            normalized_config[key] = value.strip().lower()
                        else:
                            normalized_config[key] = value
                        continue
                    
                    # Handle operation fields (comma-separated column names)
                    # e.g., "add_1": "Column1,Column2" -> "add_1": "column1,column2"
                    if isinstance(value, str):
                        # Split by comma, lowercase each, rejoin
                        columns = [col.strip().lower() for col in value.split(",") if col.strip()]
                        normalized_config[key] = ",".join(columns)
                    else:
                        normalized_config[key] = value
                
                normalized_list.append(normalized_config)
            
            return normalized_list
        
        def _normalize_result(self, result: Dict[str, Any]) -> Dict[str, Any]:
            """
            Normalize create_transform result to ensure consistent format.
            BaseAgent handles general normalization.
            """
            normalized = {
                "success": result.get("success", False),
                "response": result.get("response", ""),  # Raw LLM thinking
                "smart_response": result.get("smart_response", ""),
            }
            
            # Add create_transform_json if present (can be array or single dict)
            create_transform_json = result.get("create_transform_json") or result.get("json")
            if create_transform_json:
                # Ensure it's a list
                if isinstance(create_transform_json, dict):
                    create_transform_json = [create_transform_json]
                elif not isinstance(create_transform_json, list):
                    create_transform_json = []
                
                # Normalize all column names to lowercase for backend compatibility
                normalized["create_transform_json"] = self._normalize_column_names(create_transform_json)
                
                # Also keep json key for compatibility
                normalized["json"] = normalized["create_transform_json"]
            
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
            Uses create_transform-specific template.
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
                "smart_response": f"I had trouble processing your request. {'Let me suggest based on your previous usage: ' + ', '.join(favorite_files) if favorite_files else 'Please try with specific file names and operations.'}",
                "suggestions": [
                    "I had trouble processing your request",
                    f"Files you've used before: {', '.join(favorite_files) if favorite_files else 'None yet'}",
                    f"Available files: {', '.join(list(self.files_with_columns.keys())[:5])}",
                    "Example: 'add volume and sales_value columns from file.csv and rename to total_volume_sales'"
                ],
                "recommended_files": favorite_files,
                "next_steps": [
                    "Please try with specific file names and operations",
                    "Or say 'yes' if you want to use suggested files",
                    "Or say 'show me available files' to see all options"
                ]
            }
else:
    # Define CreateTransformAgent as None if BaseAgent is not available
    CreateTransformAgent = None


# ============================================================================
# Router already created at module level (above)
# Log router creation status
# ============================================================================
logger.info("=" * 80)
logger.info("CREATETRANSFORM AGENT MODULE LOADING")
logger.info("=" * 80)
logger.info(f"Router created: {router is not None}")
logger.info(f"Router type: {type(router)}")
logger.info(f"BaseAgent imported: {BaseAgent is not None}")

# Initialize agent variables
agent = None
agent_initialized = False

# Default supported operations (same as old agent)
DEFAULT_SUPPORTED_OPERATIONS = {
    "add": "Add multiple numeric columns together (e.g., volume + sales_value)",
    "subtract": "Subtract columns (first column minus others, e.g., revenue - cost)",
    "multiply": "Multiply multiple numeric columns together (e.g., price * quantity)",
    "divide": "Divide columns (first column divided by others, e.g., revenue / volume)",
    "abs": "Create absolute value for numeric columns (|value|).",
    "power": "Raise a column to a specified power (requires `_param`, e.g., 2 for square).",
    "sqrt": "Calculate square root of a numeric column.",
    "log": "Calculate natural logarithm of a numeric column.",
    "exp": "Calculate exponential of a numeric column.",
    "residual": "Calculate regression residuals for a dependent column vs explanatory columns.",
    "dummy": "Create categorical dummy/label-encoded columns.",
    "datetime": "Extract year/month/week/day/day_name/month_name from a datetime column via `_param`.",
    "rpi": "Calculate relative price index (price / average_price).",
    "stl_outlier": "Detect STL outliers for date/volume columns.",
    "logistic": "Apply logistic saturation with `_param` JSON: {\"gr\": growth, \"co\": carryover, \"mp\": midpoint}.",
    "detrend": "Remove trend component using STL on a date-sorted series.",
    "deseasonalize": "Remove seasonal component using STL.",
    "detrend_deseasonalize": "Remove both trend and seasonality using STL.",
    "standardize_zscore": "Standardize numeric columns using z-score.",
    "standardize_minmax": "Scale numeric columns to 0-1 using min/max."
}

DEFAULT_OPERATION_FORMAT = """
[
  {
    "bucket_name": "trinity",
    "object_name": "exact_file_name.extension",
    "add_1": "column1,column2",
    "add_1_rename": "new_column_name",
    "multiply_1": "column3,column4",
    "multiply_1_rename": "product_column",
    "add_2": "column5,column6",
    "add_2_rename": "sum_of_columns"
  }
]

## Operation Examples:
## - "add_1": "volume,salesvalue" → "add_1_rename": "total_volume_sales"
## - "multiply_1": "price,quantity" → "multiply_1_rename": "total_revenue"
## - "subtract_1": "revenue,cost" → "subtract_1_rename": "profit_margin"
## - "divide_1": "revenue,volume" → "divide_1_rename": "price_per_unit"
##
## Special Parameters:
## - Datetime ops must include `<op>_<idx>_param` with one of: to_year, to_month, to_week, to_day, to_day_name, to_month_name.
## - Logistic ops require `<op>_<idx>_param` JSON: {"gr": growth_rate, "co": carryover, "mp": midpoint}.
## - Power ops require `<op>_<idx>_param` numeric exponent (e.g., 2 for square).
"""

# ============================================================================
# INITIALIZE AGENT WITH CONFIGURATION
# Only initialize if BaseAgent was imported successfully
# ============================================================================
if BaseAgent is not None and settings is not None:
    logger.info("=" * 80)
    logger.info("INITIALIZING CREATETRANSFORM AGENT")
    logger.info("=" * 80)
    
    try:
        logger.info("Getting LLM and MinIO configuration...")
        llm_config = settings.get_llm_config()
        minio_config = settings.get_minio_config()
        logger.info(f"LLM Config: {llm_config.get('api_url', 'N/A')}")
        logger.info(f"MinIO Config: {minio_config.get('endpoint', 'N/A')}")
        
        logger.info("Creating CreateTransformAgent instance...")
        agent = CreateTransformAgent(
            api_url=llm_config["api_url"],
            model_name=llm_config["model_name"],
            bearer_token=llm_config["bearer_token"],
            minio_endpoint=minio_config["endpoint"],
            access_key=minio_config["access_key"],
            secret_key=minio_config["secret_key"],
            bucket=minio_config["bucket"],
            prefix=minio_config["prefix"],
            supported_operations=DEFAULT_SUPPORTED_OPERATIONS,
            operation_format=DEFAULT_OPERATION_FORMAT
        )
        
        logger.info("✅ CreateTransformAgent initialized successfully")
        logger.info(f"Agent name: {agent.name}")
        logger.info(f"Agent description: {agent.description}")
        agent_initialized = True
        logger.info("=" * 80)
    except Exception as e:
        logger.error("=" * 80)
        logger.error(f"❌ Failed to initialize CreateTransformAgent: {e}", exc_info=True)
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
    global BaseAgent, AgentContext, AgentResult, settings, CreateTransformPromptBuilder
    
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
            from .create_transform_prompt import CreateTransformPromptBuilder
            logger.info("✅ BaseAgent imported successfully on retry")
            return True
        except ImportError as e1:
            logger.warning(f"Retry Strategy 1 failed: {e1}")
            try:
                logger.info("Retry Strategy 2: Importing from BaseAgent modules...")
                from BaseAgent.base_agent import BaseAgent
                from BaseAgent.interfaces import AgentContext, AgentResult
                from BaseAgent.config import settings
                from .create_transform_prompt import CreateTransformPromptBuilder
                logger.info("✅ BaseAgent imported successfully on retry (modules)")
                return True
            except ImportError as e2:
                logger.warning(f"Retry Strategy 2 failed: {e2}")
                try:
                    logger.info("Retry Strategy 3: Importing from TrinityAgent.BaseAgent...")
                    from TrinityAgent.BaseAgent import BaseAgent, AgentContext, AgentResult, settings
                    from .create_transform_prompt import CreateTransformPromptBuilder
                    logger.info("✅ BaseAgent imported successfully on retry (absolute)")
                    return True
                except ImportError as e3:
                    logger.error(f"All retry strategies failed: {e1}, {e2}, {e3}")
                    return False
    except Exception as e:
        logger.error(f"Unexpected error during BaseAgent retry import: {e}", exc_info=True)
        return False


class CreateTransformRequest(BaseModel):
    """Request model for create-transform endpoint."""
    prompt: str
    session_id: Optional[str] = None
    client_name: str = ""
    app_name: str = ""
    project_name: str = ""


# Test endpoint to verify router is working
@router.get("/create-transform/test")
def test_endpoint() -> Dict[str, Any]:
    """Test endpoint to verify router is registered."""
    return {
        "success": True,
        "message": "CreateTransform router is working!",
        "router_created": router is not None,
        "agent_initialized": agent_initialized if 'agent_initialized' in globals() else False
    }


@router.post("/create-transform")
def create_transform_files(request: CreateTransformRequest) -> Dict[str, Any]:
    """
    Smart create/transform endpoint with complete memory.
    Connects to backend via standardized BaseAgent interface.
    """
    import time
    start_time = time.time()
    
    # Try to initialize agent if not already initialized
    global agent, agent_initialized, BaseAgent, settings, CreateTransformAgent
    
    if not agent_initialized or agent is None:
        logger.warning("CreateTransformAgent not initialized - attempting to initialize now...")
        
        # First, try to retry BaseAgent import if it failed
        if BaseAgent is None or settings is None:
            logger.info("BaseAgent not imported - attempting to retry import...")
            if not _retry_baseagent_import():
                logger.error("BaseAgent import retry failed - cannot initialize agent")
                raise ConfigurationError(
                    "CreateTransformAgent not initialized - BaseAgent import failed",
                    config_key="BASEAGENT_IMPORT"
                )
            
            # CreateTransformAgent should already be defined at module level if BaseAgent was imported
            if BaseAgent is not None and CreateTransformAgent is None:
                logger.error("BaseAgent imported but CreateTransformAgent class not found - this should not happen")
                logger.error("CreateTransformAgent should be defined at module level when BaseAgent is imported")
                raise ConfigurationError(
                    "CreateTransformAgent class not found after BaseAgent import",
                    config_key="CREATETRANSFORMAGENT_CLASS"
                )
        
        # Try to initialize now
        if BaseAgent is not None and settings is not None:
            try:
                logger.info("Attempting to initialize CreateTransformAgent on-demand...")
                llm_config = settings.get_llm_config()
                minio_config = settings.get_minio_config()
                
                agent = CreateTransformAgent(
                    api_url=llm_config["api_url"],
                    model_name=llm_config["model_name"],
                    bearer_token=llm_config["bearer_token"],
                    minio_endpoint=minio_config["endpoint"],
                    access_key=minio_config["access_key"],
                    secret_key=minio_config["secret_key"],
                    bucket=minio_config["bucket"],
                    prefix=minio_config["prefix"],
                    supported_operations=DEFAULT_SUPPORTED_OPERATIONS,
                    operation_format=DEFAULT_OPERATION_FORMAT
                )
                agent_initialized = True
                logger.info("✅ CreateTransformAgent initialized successfully on-demand")
            except Exception as init_error:
                logger.error(f"❌ Failed to initialize CreateTransformAgent on-demand: {init_error}", exc_info=True)
                raise ConfigurationError(
                    f"CreateTransformAgent initialization failed: {str(init_error)}",
                    config_key="CREATETRANSFORMAGENT_INIT"
                )
        else:
            logger.error("BaseAgent or settings still not available after retry")
            raise ConfigurationError(
                "CreateTransformAgent not initialized - BaseAgent import failed",
                config_key="BASEAGENT_IMPORT"
            )
    
    if not agent_initialized or agent is None:
        logger.error("CreateTransformAgent still not initialized after retry")
        raise ConfigurationError(
            "CreateTransformAgent not initialized",
            config_key="CREATETRANSFORMAGENT_INIT"
        )
    
    logger.info(f"CREATETRANSFORM REQUEST RECEIVED:")
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
        
        # Add create_transform_json if present
        create_transform_json = result.data.get("create_transform_json") or result.data.get("json")
        if create_transform_json:
            # Ensure column names are lowercase for backend compatibility
            if isinstance(create_transform_json, dict):
                create_transform_json = [create_transform_json]
            elif not isinstance(create_transform_json, list):
                create_transform_json = []
            
            # Normalize column names to lowercase
            if agent and hasattr(agent, '_normalize_column_names'):
                create_transform_json = agent._normalize_column_names(create_transform_json)
            else:
                # Fallback normalization if agent method not available
                normalized_list = []
                for config in create_transform_json:
                    if not isinstance(config, dict):
                        normalized_list.append(config)
                        continue
                    normalized_config = {}
                    for key, value in config.items():
                        if key in ["bucket_name", "object_name"]:
                            normalized_config[key] = value
                        elif key.endswith("_param"):
                            normalized_config[key] = value
                        elif not key.endswith("_rename") and isinstance(value, str):
                            # Operation fields: comma-separated columns
                            columns = [col.strip().lower() for col in value.split(",") if col.strip()]
                            normalized_config[key] = ",".join(columns)
                        elif key.endswith("_rename") and isinstance(value, str):
                            # Rename fields: single column name
                            normalized_config[key] = value.strip().lower()
                        else:
                            normalized_config[key] = value
                    normalized_list.append(normalized_config)
                create_transform_json = normalized_list
            
            response["create_transform_json"] = create_transform_json
            response["json"] = create_transform_json  # Keep json key for compatibility
            response["create_transform_config"] = create_transform_json  # Also add config key
            
            # Update message to indicate configuration is ready
            response["message"] = "Create/Transform configuration ready"
        
        # Add other fields from result.data
        for key in ["suggestions", "reasoning", "used_memory", "file_analysis", "next_steps"]:
            if key in result.data:
                response[key] = result.data[key]
        
        logger.info(f"CREATETRANSFORM REQUEST COMPLETED:")
        logger.info(f"Success: {response.get('success', False)}")
        logger.info(f"Processing Time: {response.get('processing_time', 0)}s")
        
        return response
        
    except (TrinityException, ValidationError, FileLoadError, ConfigurationError) as e:
        # Re-raise Trinity exceptions to be caught by global handler
        logger.error(f"CREATETRANSFORM REQUEST FAILED (TrinityException): {e.message if hasattr(e, 'message') else str(e)}", exc_info=True)
        raise
    except Exception as e:
        # Wrap generic exceptions in AgentExecutionError
        logger.error(f"CREATETRANSFORM REQUEST FAILED: {e}", exc_info=True)
        raise AgentExecutionError(
            f"An error occurred while processing your request: {str(e)}",
            agent_name="create_transform"
        )


@router.get("/create-transform/history/{session_id}")
def get_history(session_id: str) -> Dict[str, Any]:
    """Get session history."""
    if not agent_initialized or agent is None:
        raise ConfigurationError(
            "CreateTransformAgent not initialized",
            config_key="CREATETRANSFORMAGENT_INIT"
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
            agent_name="create_transform"
        )


@router.get("/create-transform/files")
def list_files() -> Dict[str, Any]:
    """List available files."""
    if not agent_initialized or agent is None:
        raise ConfigurationError(
            "CreateTransformAgent not initialized",
            config_key="CREATETRANSFORMAGENT_INIT"
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
            agent_name="create_transform"
        )


@router.get("/create-transform/health")
def health_check() -> Dict[str, Any]:
    """Health check endpoint."""
    if not agent_initialized or agent is None:
        return {
            "status": "unhealthy",
            "service": "create_transform",
            "error": "Agent not initialized",
            "version": "1.0.0"
        }
    
    status = {
        "status": "healthy",
        "service": "create_transform",
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
logger.info("CREATETRANSFORM AGENT MODULE LOADED")
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

