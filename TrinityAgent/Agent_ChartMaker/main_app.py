"""
Standardized ChartMaker Agent using BaseAgent infrastructure
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
logger = logging.getLogger("trinity.agent_chart_maker")

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
ChartMakerPromptBuilder = None

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
        from .chart_maker_prompt import ChartMakerPromptBuilder
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
            from .chart_maker_prompt import ChartMakerPromptBuilder
            logger.info("✅ Imported BaseAgent from local BaseAgent modules")
        except ImportError as e2:
            logger.warning(f"Strategy 2 failed: {e2}")
            import traceback
            logger.warning(f"Strategy 2 traceback: {traceback.format_exc()}")
            try:
                # Fallback import
                logger.info("Strategy 3: Importing from TrinityAgent.BaseAgent (absolute)...")
                from TrinityAgent.BaseAgent import BaseAgent, AgentContext, AgentResult, settings
                from .chart_maker_prompt import ChartMakerPromptBuilder
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

# Only define ChartMakerAgent if BaseAgent was imported successfully
if BaseAgent is not None:
    class ChartMakerAgent(BaseAgent):
        """
        Standardized ChartMaker Agent using BaseAgent infrastructure.
        Only implements chart_maker-specific logic.
        """
        
        @property
        def name(self) -> str:
            return "chart_maker"
        
        @property
        def description(self) -> str:
            return "Creates charts and visualizations (bar, line, area, pie, scatter) from data files"
        
        def _call_llm(self, prompt: str, temperature: float = 0.1, num_predict: int = 4000) -> str:
            """
            Override to add logging for raw LLM response.
            """
            # Call parent method
            llm_response = super()._call_llm(prompt, temperature, num_predict)
            
            # Log what we received from LLM
            logger.info("=" * 80)
            logger.info("📥 RECEIVED FROM CHARTMAKER LLM:")
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
            Build chart_maker-specific prompt using ChartMakerPromptBuilder.
            BaseAgent handles file loading and context building automatically.
            """
            # Use ChartMakerPromptBuilder to build the prompt
            # BaseAgent's execute() method provides available_files and context
            prompt = ChartMakerPromptBuilder.build_chart_maker_prompt(
                user_prompt=user_prompt,
                available_files_with_columns=available_files,
                context=context,
                file_details={},  # Can be enhanced if needed
                other_files=[],
                matched_columns={}
            )
            
            # Log what we're sending to LLM
            logger.info("=" * 80)
            logger.info("📤 SENDING TO CHARTMAKER LLM:")
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
            Validate chart_maker-specific JSON structure.
            BaseAgent handles general validation, this adds chart_maker-specific checks.
            """
            if not isinstance(result, dict):
                return False
            
            # If success is True, must have chart_json
            if result.get("success") is True:
                if "chart_json" not in result:
                    return False
                
                chart_json = result.get("chart_json", [])
                # chart_json must be a list (can have multiple charts)
                if not isinstance(chart_json, list):
                    return False
                
                if len(chart_json) == 0:
                    return False
                
                # Validate each chart in the list
                for chart in chart_json:
                    if not isinstance(chart, dict):
                        return False
                    
                    # Must have chart_type
                    if "chart_type" not in chart:
                        return False
                    
                    # Must have file
                    if "file" not in chart:
                        return False
                    
                    # Must have traces (array)
                    if "traces" not in chart:
                        return False
                    
                    traces = chart.get("traces", [])
                    if not isinstance(traces, list) or len(traces) == 0:
                        return False
                    
                    # Each trace must have x_column and y_column
                    for trace in traces:
                        if not isinstance(trace, dict):
                            return False
                        if "x_column" not in trace or "y_column" not in trace:
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
            Normalize chart_maker result to ensure consistent format.
            BaseAgent handles general normalization.
            🔧 CRITICAL: Column names MUST preserve original case (backend expects exact column names from dataset).
            🔧 CRITICAL: Filter values MUST preserve original case (backend expects exact values from dataset).
            Only chart_type and aggregation function names are normalized to lowercase.
            """
            normalized = {
                "success": result.get("success", False),
                "response": result.get("response", ""),  # Raw LLM thinking
                "smart_response": result.get("smart_response", ""),
            }
            
            # Add chart_json if present
            if "chart_json" in result:
                chart_json = result["chart_json"]
                
                # Ensure chart_json is a list
                if not isinstance(chart_json, list):
                    chart_json = [chart_json]
                
                # Normalize each chart in the list
                normalized_charts = []
                for chart in chart_json:
                    if not isinstance(chart, dict):
                        continue
                    
                    # Normalize file name
                    file = chart.get("file", "")
                    if isinstance(file, list):
                        file = file[0] if file else ""
                    elif not isinstance(file, str):
                        file = str(file)
                    
                    # Normalize traces
                    traces = chart.get("traces", [])
                    if not isinstance(traces, list):
                        traces = []
                    
                    normalized_traces = []
                    for trace in traces:
                        if not isinstance(trace, dict):
                            continue
                        
                        # 🔧 CRITICAL: Preserve original column names (case-sensitive for backend)
                        # Backend expects exact column names from dataset (e.g., "SalesValue", "Volume", "Year")
                        x_column = trace.get("x_column", "")
                        y_column = trace.get("y_column", "")
                        
                        # Only strip whitespace, DO NOT lowercase
                        normalized_x = x_column.strip() if isinstance(x_column, str) else str(x_column).strip()
                        normalized_y = y_column.strip() if isinstance(y_column, str) else str(y_column).strip()
                        
                        # Normalize aggregation function name to lowercase (this is fine)
                        aggregation = trace.get("aggregation", "sum")
                        normalized_agg = aggregation.lower() if isinstance(aggregation, str) else str(aggregation).lower()
                        
                        normalized_trace = {
                            "x_column": normalized_x,  # 🔧 Original case preserved
                            "y_column": normalized_y,  # 🔧 Original case preserved
                            "name": trace.get("name", f"Trace {len(normalized_traces) + 1}"),
                            "aggregation": normalized_agg,
                            "color": trace.get("color", ""),
                            "chart_type": trace.get("chart_type", chart.get("chart_type", "bar")).lower()
                        }
                        normalized_traces.append(normalized_trace)
                    
                    # Normalize chart_type to lowercase
                    chart_type = chart.get("chart_type", "bar")
                    normalized_chart_type = chart_type.lower() if isinstance(chart_type, str) else str(chart_type).lower()
                    
                    # 🔧 CRITICAL: Preserve original filter column names and values (case-sensitive for backend)
                    # Backend expects exact column names and values from dataset
                    normalized_filters = {}
                    if "filter_columns" in chart and "filter_values" in chart:
                        filter_col = chart.get("filter_columns", "")
                        filter_vals = chart.get("filter_values", "")
                        if filter_col and filter_vals:
                            # Only strip whitespace, DO NOT lowercase column name
                            normalized_filter_col = filter_col.strip() if isinstance(filter_col, str) else str(filter_col).strip()
                            # filter_values can be comma-separated string - preserve original case
                            if isinstance(filter_vals, str):
                                # Only strip whitespace, DO NOT lowercase values
                                normalized_filter_vals = [v.strip() for v in filter_vals.split(",") if v.strip()]
                            elif isinstance(filter_vals, list):
                                # Only strip whitespace, DO NOT lowercase values
                                normalized_filter_vals = [str(v).strip() for v in filter_vals if v]
                            else:
                                normalized_filter_vals = []
                            if normalized_filter_col and normalized_filter_vals:
                                normalized_filters[normalized_filter_col] = normalized_filter_vals
                    
                    # Also check for direct filters object
                    if "filters" in chart and isinstance(chart["filters"], dict):
                        for filter_col, filter_vals in chart["filters"].items():
                            # Only strip whitespace, DO NOT lowercase column name
                            normalized_filter_col = filter_col.strip() if isinstance(filter_col, str) else str(filter_col).strip()
                            if isinstance(filter_vals, list):
                                # Only strip whitespace, DO NOT lowercase values
                                normalized_filter_vals = [str(v).strip() for v in filter_vals if v]
                            elif isinstance(filter_vals, str):
                                # Only strip whitespace, DO NOT lowercase values
                                normalized_filter_vals = [v.strip() for v in filter_vals.split(",") if v.strip()]
                            else:
                                # Only strip whitespace, DO NOT lowercase
                                normalized_filter_vals = [str(filter_vals).strip()]
                            if normalized_filter_col and normalized_filter_vals:
                                normalized_filters[normalized_filter_col] = normalized_filter_vals
                    
                    normalized_chart = {
                        "chart_id": chart.get("chart_id", f"chart_{len(normalized_charts) + 1}"),
                        "chart_type": normalized_chart_type,
                        "title": chart.get("title", f"Chart {len(normalized_charts) + 1}"),
                        "file": file,
                        "traces": normalized_traces
                    }
                    
                    # Add filters if present
                    if normalized_filters:
                        normalized_chart["filters"] = normalized_filters
                        # Also add filter_columns and filter_values for compatibility
                        if len(normalized_filters) == 1:
                            filter_col = list(normalized_filters.keys())[0]
                            filter_vals = normalized_filters[filter_col]
                            normalized_chart["filter_columns"] = filter_col
                            normalized_chart["filter_values"] = ", ".join(filter_vals)
                    
                    normalized_charts.append(normalized_chart)
                
                # 🔧 CRITICAL: Validate all charts against actual file data
                # This ensures 100% guarantee that columns and filter values exist
                # Uses case-insensitive matching for filter values but preserves original case
                validation_errors = []
                if self.data_validator:
                    for idx, chart in enumerate(normalized_charts):
                        chart_file = chart.get("file", "")
                        if chart_file:
                            chart_context = f"Chart {idx + 1} ({chart.get('title', 'Untitled')})"
                            is_valid, errors, value_mapping, column_mapping = self.data_validator.validate_chart_config(
                                chart, chart_file, chart_context
                            )
                            if not is_valid:
                                validation_errors.extend([f"{chart_context}: {err}" for err in errors])
                                logger.error(f"❌ VALIDATION FAILED for {chart_context}: {errors}")
                            else:
                                # Apply column mapping to convert user/AI input to original case from file
                                if column_mapping:
                                    traces = chart.get("traces", [])
                                    for trace in traces:
                                        if isinstance(trace, dict):
                                            x_col = trace.get("x_column")
                                            y_col = trace.get("y_column")
                                            if x_col and x_col in column_mapping:
                                                trace["x_column"] = column_mapping[x_col]
                                                logger.debug(f"✅ Applied column case correction: '{x_col}' -> '{column_mapping[x_col]}'")
                                            if y_col and y_col in column_mapping:
                                                trace["y_column"] = column_mapping[y_col]
                                                logger.debug(f"✅ Applied column case correction: '{y_col}' -> '{column_mapping[y_col]}'")
                                
                                # Apply value mapping to convert user/AI input to original case from file
                                if value_mapping:
                                    filters = chart.get("filters", {})
                                    for filter_col, mapping in value_mapping.items():
                                        if filter_col in filters and isinstance(filters[filter_col], list):
                                            # Replace user input with original case from file
                                            original_vals = [mapping.get(val, val) for val in filters[filter_col]]
                                            filters[filter_col] = original_vals
                                            chart["filters"] = filters
                                            logger.info(f"✅ Applied case correction for filter '{filter_col}': {filters[filter_col]}")
                                    
                                    # Also update filter_columns/filter_values format
                                    if "filter_columns" in chart and "filter_values" in chart:
                                        filter_col = chart.get("filter_columns")
                                        if filter_col in value_mapping:
                                            mapping = value_mapping[filter_col]
                                            filter_vals = chart.get("filter_values", "")
                                            if isinstance(filter_vals, str):
                                                filter_vals_list = [v.strip() for v in filter_vals.split(",") if v.strip()]
                                                original_vals = [mapping.get(val, val) for val in filter_vals_list]
                                                chart["filter_values"] = ", ".join(original_vals)
                                            elif isinstance(filter_vals, list):
                                                original_vals = [mapping.get(val, val) for val in filter_vals]
                                                chart["filter_values"] = original_vals
                                
                                logger.info(f"✅ VALIDATION PASSED for {chart_context}")
                        else:
                            validation_errors.append(f"Chart {idx + 1}: File path is empty")
                    
                    if validation_errors:
                        error_msg = "Data validation failed. " + "; ".join(validation_errors)
                        logger.error(f"❌ CHART VALIDATION ERRORS: {error_msg}")
                        # Set success to False and add detailed error message
                        normalized["success"] = False
                        normalized["smart_response"] = (
                            f"I found some issues with the chart configuration: {error_msg}. "
                            "Please check that all column names and filter values exist in the file."
                        )
                        normalized["validation_errors"] = validation_errors
                else:
                    logger.warning("⚠️ DataValidator not available - skipping validation")
                
                # Store normalized chart_json
                normalized["chart_json"] = normalized_charts
            
            # Extract file_name from first chart if available
            if "chart_json" in normalized and normalized["chart_json"]:
                first_chart = normalized["chart_json"][0]
                if "file" in first_chart:
                    normalized["file_name"] = first_chart["file"]
            
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
            Uses chart_maker-specific template.
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
                "smart_response": f"I had trouble processing your request. {'Let me suggest based on your previous usage: ' + ', '.join(favorite_files) if favorite_files else 'Please try with specific file names and chart requirements.'}",
                "suggestions": [
                    "I had trouble processing your request",
                    f"Files you've used before: {', '.join(favorite_files) if favorite_files else 'None yet'}",
                    f"Available files: {', '.join(list(self.files_with_columns.keys())[:5])}",
                    "Example: 'create a bar chart with category on x-axis and sales on y-axis from file.csv'"
                ],
                "recommended_files": favorite_files,
                "next_steps": [
                    "Please try with specific file names and chart requirements",
                    "Or say 'yes' if you want to use suggested files",
                    "Or say 'show me available files' to see all options"
                ]
            }
else:
    # Define ChartMakerAgent as None if BaseAgent is not available
    ChartMakerAgent = None


# ============================================================================
# Router already created at module level (above)
# Log router creation status
# ============================================================================
logger.info("=" * 80)
logger.info("CHARTMAKER AGENT MODULE LOADING")
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
    logger.info("INITIALIZING CHARTMAKER AGENT")
    logger.info("=" * 80)
    
    try:
        logger.info("Getting LLM and MinIO configuration...")
        llm_config = settings.get_llm_config()
        minio_config = settings.get_minio_config()
        logger.info(f"LLM Config: {llm_config.get('api_url', 'N/A')}")
        logger.info(f"MinIO Config: {minio_config.get('endpoint', 'N/A')}")
        
        logger.info("Creating ChartMakerAgent instance...")
        agent = ChartMakerAgent(
            api_url=llm_config["api_url"],
            model_name=llm_config["model_name"],
            bearer_token=llm_config["bearer_token"],
            minio_endpoint=minio_config["endpoint"],
            access_key=minio_config["access_key"],
            secret_key=minio_config["secret_key"],
            bucket=minio_config["bucket"],
            prefix=minio_config["prefix"]
        )
        
        logger.info("✅ ChartMakerAgent initialized successfully")
        logger.info(f"Agent name: {agent.name}")
        logger.info(f"Agent description: {agent.description}")
        agent_initialized = True
        logger.info("=" * 80)
    except Exception as e:
        logger.error("=" * 80)
        logger.error(f"❌ Failed to initialize ChartMakerAgent: {e}", exc_info=True)
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
    global BaseAgent, AgentContext, AgentResult, settings, ChartMakerPromptBuilder
    
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
            from .chart_maker_prompt import ChartMakerPromptBuilder
            logger.info("✅ BaseAgent imported successfully on retry")
            return True
        except ImportError as e1:
            logger.warning(f"Retry Strategy 1 failed: {e1}")
            try:
                logger.info("Retry Strategy 2: Importing from BaseAgent modules...")
                from BaseAgent.base_agent import BaseAgent
                from BaseAgent.interfaces import AgentContext, AgentResult
                from BaseAgent.config import settings
                from .chart_maker_prompt import ChartMakerPromptBuilder
                logger.info("✅ BaseAgent imported successfully on retry (modules)")
                return True
            except ImportError as e2:
                logger.warning(f"Retry Strategy 2 failed: {e2}")
                try:
                    logger.info("Retry Strategy 3: Importing from TrinityAgent.BaseAgent...")
                    from TrinityAgent.BaseAgent import BaseAgent, AgentContext, AgentResult, settings
                    from .chart_maker_prompt import ChartMakerPromptBuilder
                    logger.info("✅ BaseAgent imported successfully on retry (absolute)")
                    return True
                except ImportError as e3:
                    logger.error(f"All retry strategies failed: {e1}, {e2}, {e3}")
                    return False
    except Exception as e:
        logger.error(f"Unexpected error during BaseAgent retry import: {e}", exc_info=True)
        return False


class ChartMakerRequest(BaseModel):
    """Request model for chart_maker endpoint."""
    prompt: str
    session_id: Optional[str] = None
    client_name: str = ""
    app_name: str = ""
    project_name: str = ""


# Test endpoint to verify router is working
@router.get("/chart-maker/test")
def test_endpoint() -> Dict[str, Any]:
    """Test endpoint to verify router is registered."""
    return {
        "success": True,
        "message": "ChartMaker router is working!",
        "router_created": router is not None,
        "agent_initialized": agent_initialized if 'agent_initialized' in globals() else False
    }


@router.post("/chart-maker")
def create_chart(request: ChartMakerRequest) -> Dict[str, Any]:
    """
    Smart chart creation endpoint with complete memory.
    Connects to backend via standardized BaseAgent interface.
    """
    import time
    start_time = time.time()
    
    # Try to initialize agent if not already initialized
    global agent, agent_initialized, BaseAgent, settings, ChartMakerAgent
    
    if not agent_initialized or agent is None:
        logger.warning("ChartMakerAgent not initialized - attempting to initialize now...")
        
        # First, try to retry BaseAgent import if it failed
        if BaseAgent is None or settings is None:
            logger.info("BaseAgent not imported - attempting to retry import...")
            if not _retry_baseagent_import():
                logger.error("BaseAgent import retry failed - cannot initialize agent")
                return {
                    "success": False,
                    "error": "ChartMakerAgent not initialized - BaseAgent import failed",
                    "smart_response": "The chart_maker agent is not available. BaseAgent could not be imported. Please check server logs for details.",
                    "processing_time": round(time.time() - start_time, 2)
                }
            
            if BaseAgent is not None and ChartMakerAgent is None:
                logger.error("BaseAgent imported but ChartMakerAgent class not found - this should not happen")
                logger.error("ChartMakerAgent should be defined at module level when BaseAgent is imported")
        
        # Try to initialize now
        if BaseAgent is not None and settings is not None:
            try:
                logger.info("Attempting to initialize ChartMakerAgent on-demand...")
                llm_config = settings.get_llm_config()
                minio_config = settings.get_minio_config()
                
                agent = ChartMakerAgent(
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
                logger.info("✅ ChartMakerAgent initialized successfully on-demand")
            except Exception as init_error:
                logger.error(f"❌ Failed to initialize ChartMakerAgent on-demand: {init_error}", exc_info=True)
                return {
                    "success": False,
                    "error": f"ChartMakerAgent initialization failed: {str(init_error)}",
                    "smart_response": "The chart_maker agent could not be initialized. Please check server logs for details.",
                    "processing_time": round(time.time() - start_time, 2)
                }
        else:
            logger.error("BaseAgent or settings still not available after retry")
            return {
                "success": False,
                "error": "ChartMakerAgent not initialized - BaseAgent import failed",
                "smart_response": "The chart_maker agent is not available. BaseAgent could not be imported. Please check server logs for details.",
                "processing_time": round(time.time() - start_time, 2)
            }
    
    if not agent_initialized or agent is None:
        logger.error("ChartMakerAgent still not initialized after retry")
        return {
            "success": False,
            "error": "ChartMakerAgent not initialized",
            "smart_response": "The chart_maker agent is not available. Please check server logs.",
            "processing_time": round(time.time() - start_time, 2)
        }
    
    logger.info(f"CHARTMAKER REQUEST RECEIVED:")
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
        
        # Add chart_json if present (at top level for frontend handler)
        if "chart_json" in result.data:
            chart_json = result.data["chart_json"]
            # Ensure it's a list (frontend expects array)
            if not isinstance(chart_json, list):
                chart_json = [chart_json]
            
            # Set at top level (frontend expects data.chart_json)
            response["chart_json"] = chart_json
            
            # Also add to response.data for consistency
            if "data" in response and isinstance(response["data"], dict):
                response["data"]["chart_json"] = chart_json
            
            # Extract file_name from first chart if available
            if chart_json and len(chart_json) > 0:
                first_chart = chart_json[0]
                if isinstance(first_chart, dict) and "file" in first_chart:
                    response["file_name"] = first_chart["file"]
            
            logger.info(f"🔧 SET chart_json at top level (preserving original column case):")
            logger.info(f"  - Number of charts: {len(chart_json)}")
            logger.info(f"  - Chart types: {[c.get('chart_type') if isinstance(c, dict) else 'unknown' for c in chart_json]}")
            logger.info(f"  - File name: {response.get('file_name', 'N/A')}")
            # Log column names for each chart (showing original case is preserved)
            for idx, chart in enumerate(chart_json):
                if isinstance(chart, dict):
                    traces = chart.get("traces", [])
                    logger.info(f"  - Chart {idx + 1} columns (original case preserved):")
                    for trace_idx, trace in enumerate(traces):
                        if isinstance(trace, dict):
                            logger.info(f"    Trace {trace_idx + 1}: x_column='{trace.get('x_column')}', y_column='{trace.get('y_column')}'")
                    # Log filters if present
                    if "filters" in chart:
                        logger.info(f"  - Chart {idx + 1} filters (original case preserved): {chart.get('filters')}")
            logger.info(f"🔧 Full chart_json structure: {json.dumps(chart_json, indent=2)}")
        
        # Add other fields from result.data
        for key in ["suggestions", "reasoning", "used_memory", "file_analysis", "next_steps", "file_name"]:
            if key in result.data:
                response[key] = result.data[key]
        
        # Ensure message field exists (UI might expect it)
        if "message" not in response:
            response["message"] = response.get("smart_response", "")
        
        logger.info(f"CHARTMAKER REQUEST COMPLETED:")
        logger.info(f"Success: {response.get('success', False)}")
        logger.info(f"Processing Time: {response.get('processing_time', 0)}s")
        logger.info(f"Response keys: {list(response.keys())}")
        logger.info(f"Has chart_json: {'chart_json' in response}")
        if "chart_json" in response:
            logger.info(f"  - Charts count: {len(response['chart_json']) if isinstance(response['chart_json'], list) else 1}")
        
        return response
        
    except Exception as e:
        logger.error(f"CHARTMAKER REQUEST FAILED: {e}", exc_info=True)
        processing_time = round(time.time() - start_time, 2)
        
        return {
            "success": False,
            "error": str(e),
            "response": f"Error occurred: {str(e)}",
            "smart_response": f"An error occurred while processing your request: {str(e)}",
            "processing_time": processing_time
        }


@router.get("/chart-maker/history/{session_id}")
def get_history(session_id: str) -> Dict[str, Any]:
    """Get session history."""
    if not agent_initialized or agent is None:
        return {
            "success": False,
            "error": "ChartMakerAgent not initialized"
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


@router.get("/chart-maker/files")
def list_files() -> Dict[str, Any]:
    """List available files."""
    if not agent_initialized or agent is None:
        return {
            "success": False,
            "error": "ChartMakerAgent not initialized"
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


@router.get("/chart-maker/health")
def health_check() -> Dict[str, Any]:
    """Health check endpoint."""
    if not agent_initialized or agent is None:
        return {
            "status": "unhealthy",
            "service": "chart_maker",
            "error": "Agent not initialized",
            "version": "1.0.0"
        }
    
    status = {
        "status": "healthy",
        "service": "chart_maker",
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
logger.info("CHARTMAKER AGENT MODULE LOADED")
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

