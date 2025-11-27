"""
Standardized Merge Agent using BaseAgent infrastructure
Connects to backend via FastAPI router
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
            from BaseAgent.exceptions import (
                TrinityException,
                AgentExecutionError,
                ConfigurationError,
                FileLoadError,
                ValidationError
            )
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
                from TrinityAgent.BaseAgent.exceptions import (
                    TrinityException,
                    AgentExecutionError,
                    ConfigurationError,
                    FileLoadError,
                    ValidationError
                )
                from .merge_prompt import MergePromptBuilder
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
            Build merge-specific prompt using MergePromptBuilder.
            BaseAgent handles file loading and context building automatically.
            """
            # Filter out non-existent files before building prompt
            filtered_files = self._filter_existing_files(available_files)
            
            # Update files_with_columns to only include existing files
            self.files_with_columns = filtered_files
            
            # Use MergePromptBuilder to build the prompt
            # BaseAgent's execute() method provides available_files and context
            prompt = MergePromptBuilder.build_merge_prompt(
                user_prompt=user_prompt,
                available_files_with_columns=filtered_files,  # Use filtered files
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
        
        def _validate_files_exist(self, file1: Any, file2: Any) -> Tuple[bool, List[str]]:
            """
            Validate that files exist in the available files list.
            
            Args:
                file1: First file name or list
                file2: Second file name or list
                
            Returns:
                Tuple of (all_valid, error_messages)
            """
            errors = []
            
            # Extract file names from lists if needed
            file1_name = file1[0] if isinstance(file1, list) and file1 else (file1 if isinstance(file1, str) else "")
            file2_name = file2[0] if isinstance(file2, list) and file2 else (file2 if isinstance(file2, str) else "")
            
            # Check if files exist in files_with_columns
            if file1_name:
                # Try to resolve file path
                file1_resolved = None
                if file1_name in self.files_with_columns:
                    file1_resolved = file1_name
                else:
                    # Try to find by basename
                    import os
                    file1_basename = os.path.basename(file1_name)
                    for actual_path in self.files_with_columns.keys():
                        if os.path.basename(actual_path) == file1_basename:
                            file1_resolved = actual_path
                            break
                
                if not file1_resolved:
                    errors.append(f"File '{file1_name}' not found in available files")
            
            if file2_name:
                # Try to resolve file path
                file2_resolved = None
                if file2_name in self.files_with_columns:
                    file2_resolved = file2_name
                else:
                    # Try to find by basename
                    import os
                    file2_basename = os.path.basename(file2_name)
                    for actual_path in self.files_with_columns.keys():
                        if os.path.basename(actual_path) == file2_basename:
                            file2_resolved = actual_path
                            break
                
                if not file2_resolved:
                    errors.append(f"File '{file2_name}' not found in available files")
            
            return len(errors) == 0, errors
        
        def _detect_categorical_columns(self, file1: str, file2: str) -> List[str]:
            """
            Detect categorical/string columns that are good candidates for joining.
            
            Args:
                file1: First file name
                file2: Second file name
                
            Returns:
                List of common categorical column names
            """
            import os
            
            # Resolve file paths
            file1_resolved = None
            file2_resolved = None
            
            if file1 in self.files_with_columns:
                file1_resolved = file1
            else:
                file1_basename = os.path.basename(file1)
                for actual_path in self.files_with_columns.keys():
                    if os.path.basename(actual_path) == file1_basename:
                        file1_resolved = actual_path
                        break
            
            if file2 in self.files_with_columns:
                file2_resolved = file2
            else:
                file2_basename = os.path.basename(file2)
                for actual_path in self.files_with_columns.keys():
                    if os.path.basename(actual_path) == file2_basename:
                        file2_resolved = actual_path
                        break
            
            if not file1_resolved or not file2_resolved:
                return []
            
            # Get columns for both files
            file1_info = self.files_with_columns.get(file1_resolved, {})
            file2_info = self.files_with_columns.get(file2_resolved, {})
            
            file1_columns = file1_info.get("columns", [])
            file2_columns = file2_info.get("columns", [])
            
            # Find common columns
            common_columns = set(file1_columns) & set(file2_columns)
            
            # Filter for categorical-looking columns (ID, name, key, code, etc.)
            categorical_keywords = ["id", "key", "name", "code", "identifier", "ref", "reference"]
            categorical_columns = []
            
            for col in common_columns:
                col_lower = col.lower()
                # Check if column name suggests it's categorical
                if any(keyword in col_lower for keyword in categorical_keywords):
                    categorical_columns.append(col)
                # Also include columns that look like IDs (e.g., "ProductID", "CustomerID")
                elif col_lower.endswith("id") or col_lower.endswith("_id"):
                    categorical_columns.append(col)
            
            # If no categorical columns found, return common columns (prioritize shorter names)
            if not categorical_columns and common_columns:
                # Sort by length (shorter names are often IDs/keys)
                sorted_common = sorted(common_columns, key=len)
                return sorted_common[:3]  # Return top 3 candidates
            
            return categorical_columns[:3]  # Return top 3 categorical candidates
        
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
                
                # Extract file names
                file1 = merge_json.get("file1", [])
                file2 = merge_json.get("file2", [])
                join_columns = merge_json.get("join_columns", [])
                join_type = merge_json.get("join_type", "").lower().strip()
                
                # Validate files exist
                file1_name = file1[0] if isinstance(file1, list) and file1 else (file1 if isinstance(file1, str) else "")
                file2_name = file2[0] if isinstance(file2, list) and file2 else (file2 if isinstance(file2, str) else "")
                
                if file1_name and file2_name:
                    files_valid, errors = self._validate_files_exist(file1, file2)
                    if not files_valid:
                        logger.warning(f"⚠️ File validation errors: {errors}")
                        # Don't fail, but log the warning
                
                # If join_columns not specified, try to detect categorical columns
                if not join_columns and file1_name and file2_name:
                    detected_columns = self._detect_categorical_columns(file1_name, file2_name)
                    if detected_columns:
                        logger.info(f"🔍 Detected categorical columns for joining: {detected_columns}")
                        join_columns = detected_columns[:1]  # Use first detected column
                
                # Ensure join_type defaults to "outer" if not specified or invalid
                if not join_type or join_type not in ["inner", "outer", "left", "right"]:
                    join_type = "outer"
                    logger.info("🔧 Defaulting join_type to 'outer'")
                
                normalized["merge_json"] = {
                    "bucket_name": merge_json.get("bucket_name", "trinity"),
                    "file1": file1,
                    "file2": file2,
                    "join_columns": join_columns,
                    "join_type": join_type  # Always "outer" if not specified
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
                raise ConfigurationError(
                    "MergeAgent not initialized - BaseAgent import failed",
                    config_key="BASEAGENT_IMPORT"
                )
            
            # MergeAgent should already be defined at module level if BaseAgent was imported
            # If it's still None, that means BaseAgent import succeeded but MergeAgent wasn't defined
            # This shouldn't happen, but if it does, we can't define it here (would be a nested class)
            if BaseAgent is not None and MergeAgent is None:
                logger.error("BaseAgent imported but MergeAgent class not found - this should not happen")
                logger.error("MergeAgent should be defined at module level when BaseAgent is imported")
                raise ConfigurationError(
                    "MergeAgent class not found after BaseAgent import",
                    config_key="MERGEAGENT_CLASS"
                )
        
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
                raise ConfigurationError(
                    f"MergeAgent initialization failed: {str(init_error)}",
                    config_key="MERGEAGENT_INIT"
                )
        else:
            logger.error("BaseAgent or settings still not available after retry")
            raise ConfigurationError(
                "MergeAgent not initialized - BaseAgent import failed",
                config_key="BASEAGENT_IMPORT"
            )
    
    if not agent_initialized or agent is None:
        logger.error("MergeAgent still not initialized after retry")
        raise ConfigurationError(
            "MergeAgent not initialized",
            config_key="MERGEAGENT_INIT"
        )
    
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
            
            # Ensure join_type defaults to "outer" if not specified
            join_type = merge_json.get("join_type", "outer")
            if not join_type or join_type.lower() not in ["inner", "outer", "left", "right"]:
                join_type = "outer"
            
            # Add merge_config for frontend/backend
            response["merge_config"] = {
                "file1": file1,
                "file2": file2,
                "join_columns": merge_json.get("join_columns", []),
                "join_type": join_type,  # Always defaults to "outer"
            }
        
        # Add other fields from result.data
        for key in ["suggestions", "reasoning", "used_memory", "file_analysis", "next_steps"]:
            if key in result.data:
                response[key] = result.data[key]
        
        logger.info(f"MERGE REQUEST COMPLETED:")
        logger.info(f"Success: {response.get('success', False)}")
        logger.info(f"Processing Time: {response.get('processing_time', 0)}s")
        
        return response
        
    except (TrinityException, ValidationError, FileLoadError, ConfigurationError) as e:
        # Re-raise Trinity exceptions to be caught by global handler
        logger.error(f"MERGE REQUEST FAILED (TrinityException): {e.message if hasattr(e, 'message') else str(e)}", exc_info=True)
        raise
    except Exception as e:
        # Wrap generic exceptions in AgentExecutionError
        logger.error(f"MERGE REQUEST FAILED: {e}", exc_info=True)
        raise AgentExecutionError(
            f"An error occurred while processing your request: {str(e)}",
            agent_name="merge"
        )


@router.get("/merge/history/{session_id}")
def get_history(session_id: str) -> Dict[str, Any]:
    """Get session history."""
    if not agent_initialized or agent is None:
        raise ConfigurationError(
            "MergeAgent not initialized",
            config_key="MERGEAGENT_INIT"
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
            agent_name="merge"
        )


@router.get("/merge/files")
def list_files() -> Dict[str, Any]:
    """List available files."""
    if not agent_initialized or agent is None:
        raise ConfigurationError(
            "MergeAgent not initialized",
            config_key="MERGEAGENT_INIT"
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
            agent_name="merge"
        )


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

