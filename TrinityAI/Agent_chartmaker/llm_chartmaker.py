# llm_chart_maker.py (Enhanced to match Merge Agent's robust functionality)

import logging
import os
import uuid
import json
from datetime import datetime
from typing import Dict, Optional, Any, List

from .ai_logic import build_chart_prompt, call_chart_llm, extract_json
from file_loader import FileLoader
from file_context_resolver import FileContextResolver, FileContextResult

# Import the file analyzer
import sys
sys.path.append(os.path.join(os.path.dirname(__file__), '..'))
from file_analyzer import FileAnalyzer

logger = logging.getLogger("smart.chart.agent")

class ChartMakerAgent:
    """
    Enhanced Chart Maker Agent that mirrors SmartMergeAgent's robust functionality:
    - Maintains sessions and conversational memory.
    - Builds context from last N interactions.
    - Single LLM call via ai_logic.
    - Generates backend-compatible chart configurations.
    - Handles file context for intelligent chart suggestions.
    - ACTIVE MinIO file loading and column analysis (like Merge agent).
    """
    def __init__(self, api_url: str, model_name: str, bearer_token: str, minio_endpoint: str = "minio:9000", access_key: str = "minio", secret_key: str = "minio123", bucket: str = "trinity", prefix: str = ""):
        logger.info("Initializing Enhanced ChartMakerAgent...")
        self.api_url = api_url
        self.model_name = model_name
        self.bearer_token = bearer_token
        self.sessions = {}
        # File context for intelligent chart suggestions (ACTIVE like Merge agent)
        self.files_with_columns: Dict[str, List[str]] = {}
        self.files_metadata: Dict[str, Dict[str, Any]] = {}  # Store column types, row counts, etc.
        self._raw_files_with_columns: Dict[str, Any] = {}
        self.current_file_id: Optional[str] = None
        
        # MinIO configuration (ACTIVE like Merge agent)
        self.minio_endpoint = minio_endpoint
        self.access_key = access_key
        self.secret_key = secret_key
        self.bucket = bucket
        self.prefix = prefix
        
        # Initialize FileLoader for standardized file handling
        self.file_loader = FileLoader(
            minio_endpoint=minio_endpoint,
            minio_access_key=access_key,
            minio_secret_key=secret_key,
            minio_bucket=bucket,
            object_prefix=prefix
        )
        
        # Initialize file analyzer for enhanced file context
        self.file_analyzer = FileAnalyzer(
            minio_endpoint=minio_endpoint,
            access_key=access_key,
            secret_key=secret_key,
            bucket=bucket,
            prefix=prefix,
            secure=False
        )

        # Centralised resolver for matching prompts to relevant files
        self.file_context_resolver = FileContextResolver(
            file_loader=self.file_loader,
            file_analyzer=self.file_analyzer
        )
        self._last_context_selection: Optional[FileContextResult] = None
        
        # Load files on initialization
        self._load_files()
    
    def set_context(self, client_name: str = "", app_name: str = "", project_name: str = "") -> None:
        """
        Set environment context for dynamic path resolution.
        This ensures the API call will fetch the correct path for the current project.
        """
        if client_name or app_name or project_name:
            if client_name:
                os.environ["CLIENT_NAME"] = client_name
            if app_name:
                os.environ["APP_NAME"] = app_name
            if project_name:
                os.environ["PROJECT_NAME"] = project_name
            logger.info(f"🔧 Environment context set for dynamic path resolution: {client_name}/{app_name}/{project_name}")
        else:
            logger.info("🔧 Using existing environment context for dynamic path resolution")

    def _maybe_update_prefix(self) -> None:
        """Dynamically updates the MinIO prefix and reloads files."""
        try:
            # Use FileLoader's prefix update method
            self.file_loader._maybe_update_prefix()
            if self.file_loader.object_prefix != self.prefix:
                logger.info("MinIO prefix updated from '%s' to '%s'", self.prefix, self.file_loader.object_prefix)
                self.prefix = self.file_loader.object_prefix
                # Update file analyzer prefix
                self.file_analyzer.prefix = self.prefix
                # Reload files with new prefix
                self._load_files()
        except Exception as e:
            logger.warning(f"Failed to update prefix: {e}")

    def _load_files(self) -> None:
        """
        Load files using the standardized FileLoader and FileAnalyzer for comprehensive analysis.
        This provides rich file context for better chart recommendations.
        """
        logger.info(f"Loading files from MinIO bucket '{self.bucket}' with prefix '{self.prefix}'...")
        
        try:
            # First load files using the standardized FileLoader
            files_with_columns = self.file_loader.load_files()
            self._raw_files_with_columns = files_with_columns or {}
            
            # Convert FileLoader results to the format expected by the chart maker
            self.files_with_columns = {}
            for file_path, file_data in files_with_columns.items():
                if isinstance(file_data, dict):
                    columns = file_data.get('columns', [])
                    file_name = file_data.get('file_name', os.path.basename(file_path))
                else:
                    columns = file_data
                    file_name = os.path.basename(file_path)
                self.files_with_columns[file_name] = columns
            
            # Then use file analyzer to get comprehensive analysis
            analysis_results = self.file_analyzer.analyze_files()
            
            if 'error' in analysis_results:
                logger.warning(f"File analysis failed, using basic file info: {analysis_results['error']}")
                # Use basic file info from FileLoader
                self.files_metadata = {}
                for file_name, columns in self.files_with_columns.items():
                    self.files_metadata[file_name] = {
                        'total_rows': 0,
                        'row_count': 0,
                        'total_columns': len(columns),
                        'file_size_bytes': 0,
                        'file_size': 0,
                        'file_path': '',
                        'columns': {},
                        'data_types': {},
                        'missing_values': {},
                        'sample_data': {},
                        'statistical_summary': {},
                        'column_types': [],
                        'numeric_columns': [],
                        'categorical_columns': []
                    }
                self.file_context_resolver.update_files(self._raw_files_with_columns, self.files_metadata)
                self._last_context_selection = None
                return
            
            # Convert file analyzer results to the format expected by the chart maker
            self.files_metadata = {}
            
            for filename, analysis in analysis_results.get('files', {}).items():
                # Store comprehensive metadata with JSON-serializable values
                def convert_to_json_serializable(obj):
                    """Convert numpy types to Python types for JSON serialization."""
                    if hasattr(obj, 'item'):  # numpy scalar
                        return obj.item()
                    elif isinstance(obj, dict):
                        return {k: convert_to_json_serializable(v) for k, v in obj.items()}
                    elif isinstance(obj, list):
                        return [convert_to_json_serializable(item) for item in obj]
                    else:
                        return obj
                
                self.files_metadata[filename] = {
                    'total_rows': int(analysis.get('total_rows', 0)),
                    'row_count': int(analysis.get('total_rows', 0)),  # Compatibility field
                    'total_columns': int(analysis.get('total_columns', 0)),
                    'file_size_bytes': int(analysis.get('file_size_bytes', 0)),
                    'file_size': int(analysis.get('file_size_bytes', 0)),  # Compatibility field
                    'file_path': str(analysis.get('file_path', '')),
                    'columns': convert_to_json_serializable(analysis.get('columns', {})),
                    'data_types': convert_to_json_serializable(analysis.get('data_types', {})),
                    'missing_values': convert_to_json_serializable(analysis.get('missing_values', {})),
                    'sample_data': convert_to_json_serializable(analysis.get('sample_data', {})),
                    'statistical_summary': convert_to_json_serializable(analysis.get('statistical_summary', {})),
                    # Additional compatibility fields
                    'column_types': [],  # Will be populated from data_types
                    'numeric_columns': [],
                    'categorical_columns': []
                }
                
                # Populate compatibility fields from analysis data
                if 'data_types' in analysis:
                    column_types = []
                    numeric_columns = []
                    categorical_columns = []
                    
                    for col_name, col_info in analysis.get('columns', {}).items():
                        data_type = str(col_info.get('data_type', 'unknown'))  # Ensure string
                        column_types.append(data_type)
                        
                        if data_type in ['int64', 'float64', 'int32', 'float32']:
                            numeric_columns.append(str(col_name))  # Ensure string
                        elif data_type in ['object', 'string', 'category']:
                            categorical_columns.append(str(col_name))  # Ensure string
                    
                    self.files_metadata[filename]['column_types'] = column_types
                    self.files_metadata[filename]['numeric_columns'] = numeric_columns
                    self.files_metadata[filename]['categorical_columns'] = categorical_columns
            
            self.file_context_resolver.update_files(self._raw_files_with_columns, self.files_metadata)
            self._last_context_selection = None

            logger.info(f"Successfully loaded {len(self.files_with_columns)} files using FileLoader and FileAnalyzer")
            
        except Exception as e:
            logger.error(f"Error during file loading: {e}")
            self.files_with_columns = {}
            self.files_metadata = {}
            self._raw_files_with_columns = {}
            self.file_context_resolver.update_files({})
            self._last_context_selection = None

    def set_file_context(self, file_id: str, columns: List[str], file_name: str = ""):
        """Set the current file context for chart generation"""
        self.current_file_id = file_id
        self.files_with_columns[file_name or file_id] = columns
        logger.info(f"Set file context: {file_id} with {len(columns)} columns")

    def set_minio_path(self, new_path: str) -> bool:
        """
        🔧 CRITICAL FIX: Manually set the MinIO path and reload files
        This is useful when the automatic path detection fails
        
        Args:
            new_path: The new MinIO path (e.g., "client/app/project/")
            
        Returns:
            bool: True if path was updated and files were reloaded
        """
        try:
            # Normalize the path
            if not new_path.endswith("/"):
                new_path += "/"
            
            logger.info(f"🔧 Manually setting MinIO path from '{self.prefix}' to '{new_path}'")
            
            if self.prefix != new_path:
                self.prefix = new_path
                logger.info(f"✅ MinIO path updated to: {self.prefix}")
                
                # Reload files with the new path
                self._load_files()
                return True
            else:
                logger.info(f"✅ MinIO path already set to: {self.prefix}")
                return True
                
        except Exception as e:
            logger.error(f"❌ Failed to set MinIO path: {e}")
            return False

    def diagnose_path_issues(self) -> Dict[str, Any]:
        """
        🔧 DIAGNOSTIC: Check current path configuration and suggest fixes
        This helps identify why the chart maker is not finding files
        
        Returns:
            Dict with diagnostic information and suggestions
        """
        try:
            diagnosis = {
                "current_prefix": self.prefix,
                "bucket": self.bucket,
                "endpoint": self.minio_endpoint,
                "files_found": len(self.files_with_columns),
                "issues": [],
                "suggestions": []
            }
            
            # Check environment variables
            client = os.getenv("CLIENT_NAME", "").strip()
            app = os.getenv("APP_NAME", "").strip()
            project = os.getenv("PROJECT_NAME", "").strip()
            
            diagnosis["environment_vars"] = {
                "CLIENT_NAME": client,
                "APP_NAME": app,
                "PROJECT_NAME": project
            }
            
            # Check for issues
            if self.prefix == "default_client/default_app/default_project/" or self.prefix == "":
                diagnosis["issues"].append("Using default path - no files will be found")
                diagnosis["suggestions"].append("Set environment variables CLIENT_NAME, APP_NAME, PROJECT_NAME")
                diagnosis["suggestions"].append("Or use set_minio_path() method to set correct path")
            
            if not client or not app or not project:
                diagnosis["issues"].append("Missing environment variables")
                diagnosis["suggestions"].append("Set CLIENT_NAME, APP_NAME, PROJECT_NAME environment variables")
            
            if client == "default_client" and app == "default_app" and project == "default_project":
                diagnosis["issues"].append("Using default environment values")
                diagnosis["suggestions"].append("Check Redis cache or database for correct client/app/project names")
            
            if len(self.files_with_columns) == 0:
                diagnosis["issues"].append("No files loaded from MinIO")
                diagnosis["suggestions"].append("Verify MinIO connection and bucket access")
                diagnosis["suggestions"].append("Check if files exist in the specified path")
                diagnosis["suggestions"].append("Try setting the correct path manually")
            
            # Try to suggest the correct path
            if client and app and project and not (client == "default_client" and app == "default_app" and project == "default_project"):
                suggested_path = f"{client}/{app}/{project}/"
                diagnosis["suggested_path"] = suggested_path
                diagnosis["suggestions"].append(f"Try setting path to: {suggested_path}")
            
            return diagnosis
            
        except Exception as e:
            logger.error(f"Error in diagnose_path_issues: {e}")
            return {
                "error": str(e),
                "current_prefix": self.prefix,
                "issues": ["Diagnostic failed"],
                "suggestions": ["Check logs for errors"]
            }

    def get_file_context(self) -> Dict[str, Any]:
        """Get current file context for AI prompts"""
        return {
            "current_file_id": self.current_file_id,
            "available_files": self.files_with_columns,
            "current_columns": self.files_with_columns.get(self.current_file_id, [])
        }

    def create_session(self, session_id: Optional[str] = None) -> str:
        import uuid
        if not session_id:
            session_id = str(uuid.uuid4())
        if session_id not in self.sessions:
            self.sessions[session_id] = []
        return session_id

    def _build_context(self, session_id: str) -> str:
        """Builds a conversational context from the session history (like Merge agent)."""
        history = self.sessions.get(session_id, [])
        if not history:
            return "This is the first interaction."
            
        # Use the last 5 interactions to keep the context relevant and concise (like Merge agent)
        context_parts = []
        for interaction in history[-5:]:
            context_parts.append(f"User asked: {interaction['user_prompt']}")
            context_parts.append(f"You responded: {json.dumps(interaction['system_response'])}")
        
        return "--- CONVERSATION HISTORY ---\n" + "\n".join(context_parts)

    def _enhance_context_with_columns(self, context: str, user_prompt: str) -> str:
        """Adds file and column information to the LLM context for better accuracy (like Merge agent)."""
        # Check if MinIO prefix needs an update (and files need reloading)
        self._maybe_update_prefix()
        
        # If no files loaded yet, try to load them now
        if not self.files_with_columns:
            self._load_files()
        
        if not self.files_with_columns:
            context += "\n\n--- FILE CONTEXT ---\n"
            context += "No files are currently loaded. User needs to upload data first."
            self._last_context_selection = None
            return context

        selection = self.file_context_resolver.resolve(
            user_prompt=user_prompt,
            top_k=3,
            include_metadata=True,
            fallback_limit=10
        )
        self._last_context_selection = selection

        context += "\n\n--- RELEVANT FILES AND COLUMNS ---\n"
        if selection.relevant_files:
            context += json.dumps(selection.relevant_files, indent=2)
        else:
            context += "No specific files matched the prompt. Showing default suggestions.\n"
            context += json.dumps(self.files_with_columns, indent=2)

        if selection.file_details:
            context += "\n\n--- FILE DETAILS ---\n"
            context += json.dumps(selection.file_details, indent=2)

        if selection.matched_columns:
            context += "\n\n--- MATCHED COLUMNS ---\n"
            context += json.dumps(selection.matched_columns, indent=2)

        if selection.other_files:
            context += "\n\nOther available files (not included above): "
            context += ", ".join(selection.other_files)
        
        context += "\n\n--- INSTRUCTIONS FOR LLM ---\n"
        context += "1. Analyze the user's request to identify which files they want to chart\n"
        context += "2. Use the column information above to determine the best x/y columns\n"
        context += "3. If the user's request is unclear, suggest appropriate files based on their description\n"
        context += "4. Always verify that the suggested files exist in the available files list\n"
        
        return context

    def _coerce_to_list_of_strings(self, value: Any) -> List[str]:
        """
        Normalize filter values into a clean list of non-empty strings.
        Accepts comma-separated strings, single values, or iterables.
        """
        if value is None:
            return []

        # If already an iterable (list/tuple/set), convert items to strings
        if isinstance(value, (list, tuple, set)):
            normalized = [str(item).strip() for item in value if str(item).strip()]
            return normalized

        # If provided as a comma separated string, split and trim
        if isinstance(value, str):
            # Some models return the literal string "[]" – treat as empty list
            if value.strip() in {"", "[]", "{}"}:
                return []
            parts = [part.strip() for part in value.split(",")]
            return [part for part in parts if part]

        # Fallback: coerce scalar to string
        value_str = str(value).strip()
        return [value_str] if value_str else []

    def _normalize_filters(self, raw_filters: Any) -> Dict[str, List[str]]:
        """
        Ensure filter payloads are always Dict[str, List[str]].
        Supports dicts, list[dict], and comma-separated strings.
        """
        normalized: Dict[str, List[str]] = {}

        if not raw_filters:
            return normalized

        if isinstance(raw_filters, dict):
            iterator = raw_filters.items()
        elif isinstance(raw_filters, list):
            # Sometimes models return [{"column": ["A","B"]}]
            flattened: Dict[str, Any] = {}
            for item in raw_filters:
                if isinstance(item, dict):
                    for key, value in item.items():
                        flattened.setdefault(key, value)
            iterator = flattened.items()
        else:
            # Unsupported type – best effort conversion
            return normalized

        for key, value in iterator:
            key_str = str(key).strip()
            if not key_str:
                continue
            values = self._coerce_to_list_of_strings(value)
            normalized[key_str] = values

        return normalized

    def _normalize_chart_result(self, result: Dict[str, Any]) -> Dict[str, Any]:
        """
        Normalise chart_json so the frontend always receives a predictable structure.
        Guards against occasional LLM deviations (e.g. dict, stringified JSON, or missing fields).
        """
        if not isinstance(result, dict):
            logger.error("❌ Chart result is not a dict – returning failure payload")
            return {
                "success": False,
                "message": "Invalid chart result format",
                "chart_json": [],
                "smart_response": "I could not understand the response. Please try asking for the chart again."
            }

        raw_chart_json = result.get("chart_json")
        charts_source: List[Dict[str, Any]] = []

        try:
            if raw_chart_json is None:
                charts_source = []
            elif isinstance(raw_chart_json, list):
                charts_source = [chart for chart in raw_chart_json if isinstance(chart, dict)]
            elif isinstance(raw_chart_json, dict):
                charts_source = [raw_chart_json]
            elif isinstance(raw_chart_json, str):
                parsed = json.loads(raw_chart_json)
                if isinstance(parsed, list):
                    charts_source = [chart for chart in parsed if isinstance(chart, dict)]
                elif isinstance(parsed, dict):
                    charts_source = [parsed]
                else:
                    logger.warning("⚠️ Parsed string chart_json but result was not dict/list")
                    charts_source = []
            else:
                logger.warning(f"⚠️ Unsupported chart_json type: {type(raw_chart_json)}")
        except Exception as exc:
            logger.error(f"❌ Failed to parse chart_json field: {exc}")
            charts_source = []

        normalized_charts: List[Dict[str, Any]] = []

        def _pick_field_value(*candidates):
            """Return the first non-empty string candidate."""
            for candidate in candidates:
                if isinstance(candidate, str) and candidate.strip():
                    return candidate.strip()
            return ""

        for index, chart in enumerate(charts_source):
            try:
                chart_id = str(chart.get("chart_id", index + 1))
                chart_type = chart.get("chart_type") or chart.get("type") or "bar"
                if isinstance(chart_type, str):
                    chart_type = chart_type.lower().strip()
                if chart_type not in {"bar", "line", "area", "pie", "scatter"}:
                    logger.warning(f"⚠️ Invalid chart_type '{chart_type}' – defaulting to 'bar'")
                    chart_type = "bar"

                title = chart.get("title") or f"Chart {index + 1}"

                raw_traces = chart.get("traces") or []
                chart_level_legend = _pick_field_value(
                    chart.get("legend_field"),
                    chart.get("legendField"),
                    chart.get("segregated_field"),
                    chart.get("segregatedField"),
                )
                traces: List[Dict[str, Any]] = []

                if isinstance(raw_traces, dict):
                    raw_traces = [raw_traces]
                elif not isinstance(raw_traces, list):
                    raw_traces = []

                for trace_index, trace in enumerate(raw_traces):
                    if not isinstance(trace, dict):
                        continue

                    x_column = trace.get("x_column") or trace.get("xAxis") or trace.get("x_axis") or trace.get("x")
                    y_column = trace.get("y_column") or trace.get("yAxis") or trace.get("y_axis") or trace.get("y")

                    # Guard against arrays for column names
                    if isinstance(x_column, list):
                        x_column = next((str(val).strip() for val in x_column if str(val).strip()), "")
                    if isinstance(y_column, list):
                        y_column = next((str(val).strip() for val in y_column if str(val).strip()), "")

                    x_column = str(x_column).strip() if x_column else ""
                    y_column = str(y_column).strip() if y_column else ""

                    name = trace.get("name") or f"Trace {trace_index + 1}"
                    aggregation = trace.get("aggregation") or "sum"
                    trace_chart_type = trace.get("chart_type") or chart_type
                    if isinstance(trace_chart_type, str):
                        trace_chart_type = trace_chart_type.lower().strip()
                    if trace_chart_type not in {"bar", "line", "area", "pie", "scatter"}:
                        trace_chart_type = chart_type

                    filters = self._normalize_filters(trace.get("filters"))
                    trace_legend_field = _pick_field_value(
                        trace.get("legend_field"),
                        trace.get("legendField"),
                        trace.get("segregated_field"),
                        trace.get("segregatedField"),
                        chart_level_legend
                    )

                    traces.append({
                        "id": trace.get("id", f"trace_{trace_index}"),
                        "x_column": x_column,
                        "y_column": y_column,
                        "name": str(name),
                        "aggregation": aggregation,
                        "chart_type": trace_chart_type,
                        "color": trace.get("color"),
                        "filters": filters,
                        **({"legend_field": trace_legend_field} if trace_legend_field else {})
                    })

                normalized_chart = {
                    "chart_id": chart_id,
                    "chart_type": chart_type,
                    "title": str(title),
                    "traces": traces,
                    "filters": self._normalize_filters(chart.get("filters"))
                }

                if chart_level_legend:
                    normalized_chart["legend_field"] = chart_level_legend
                    normalized_chart["segregated_field"] = chart_level_legend

                # Preserve optional fields when already in correct format
                for optional_key in ["description", "insights", "notes"]:
                    if optional_key in chart:
                        normalized_chart[optional_key] = chart[optional_key]

                normalized_charts.append(normalized_chart)

            except Exception as chart_exc:
                logger.error(f"❌ Failed to normalize chart index {index}: {chart_exc}", exc_info=True)

        # Update result payload
        result["chart_json"] = normalized_charts

        if result.get("success") and not normalized_charts:
            # If we expected success but have no charts, downgrade the response
            logger.warning("⚠️ Response flagged success but no valid chart configurations were produced.")
            result["success"] = False
            result["message"] = result.get("message") or "Chart generation failed – no valid chart configuration found."
            result.setdefault(
                "smart_response",
                "I could not create a chart because the configuration looked incomplete. Please specify the file and the columns for the x- and y-axis."
            )

        # Normalise file_name to plain string (no lists/objects)
        # 🔧 CRITICAL FIX: Also check for data_source field (LLM sometimes returns this instead)
        file_name = result.get("file_name") or result.get("data_source")
        if isinstance(file_name, (list, dict)):
            result["file_name"] = None
        elif file_name is not None:
            result["file_name"] = str(file_name).strip() or None
        
        # 🔧 CRITICAL FIX: Ensure data_source is also set for backward compatibility
        if result.get("file_name") and not result.get("data_source"):
            result["data_source"] = result["file_name"]
        elif result.get("data_source") and not result.get("file_name"):
            result["file_name"] = result["data_source"]

        return result

    def list_available_files(self) -> Dict[str, Any]:
        """🔧 ENHANCED: Get available files from MinIO like Merge agent"""
        try:
            # Check if MinIO prefix needs an update
            self._maybe_update_prefix()
            
            # If no files loaded yet, try to load them now
            if not self.files_with_columns:
                self._load_files()
            
            return {
                "success": True,
                "total_files": len(self.files_with_columns),
                "files": self.files_with_columns,
                "mode": "minio_active_loading",
                "message": "Using active MinIO file loading like Merge agent"
            }
            
        except Exception as e:
            logger.warning(f"Failed to get files from MinIO: {e}")
            return {
                "success": True,
                "total_files": len(self.files_with_columns),
                "files": self.files_with_columns,
                "mode": "fallback_mode",
                "message": f"MinIO unavailable, using fallback: {str(e)}"
            }

    # 🔧 REMOVED: Manual transformation function - let the LLM handle everything
    # def _transform_to_backend_format(self, chart_json: Dict[str, Any]) -> Dict[str, Any]:
        """
        Transform the AI-generated chart_json to ensure it's fully compatible
        with the backend ChartRequest schema and uses only available columns.
        Supports both single and multiple chart configurations.
        """
        try:
            # Check if this is a multiple charts response
            if isinstance(chart_json, dict) and chart_json.get("multiple_charts") and chart_json.get("charts"):
                logger.info("🔍 Processing multiple charts configuration")
                return self._transform_multiple_charts_to_backend_format(chart_json)
            
            # Single chart processing (existing logic)
            logger.info("🔍 Processing single chart configuration")
            
            # Ensure required fields are present
            backend_request = {
                "chart_type": chart_json.get("chart_type", "line"),
                "traces": []
            }
            
            # Get all available columns from all files
            all_available_columns = set()
            for columns in self.files_with_columns.values():
                all_available_columns.update(columns)
            
            # 🔧 CRITICAL FIX: Log available files and columns for debugging
            logger.info(f"🔍 Available files: {list(self.files_with_columns.keys())}")
            logger.info(f"🔍 Available columns: {list(all_available_columns)[:20]}...")
            
            # Transform traces to match backend ChartTrace schema
            for trace in chart_json.get("traces", []):
                x_column = trace.get("x_column", "")
                y_column = trace.get("y_column", "")
                
                # Validate that columns exist in available data
                if x_column and x_column not in all_available_columns:
                    logger.warning(f"X-column '{x_column}' not found in available columns: {list(all_available_columns)[:10]}")
                    # Try to find a similar column or use first available
                    if all_available_columns:
                        x_column = list(all_available_columns)[0]
                        logger.info(f"Using alternative x-column: {x_column}")
                
                if y_column and y_column not in all_available_columns:
                    logger.warning(f"Y-column '{y_column}' not found in available columns: {list(all_available_columns)[:10]}")
                    # Try to find a similar column or use first available
                    if all_available_columns:
                        y_column = list(all_available_columns)[0]
                        logger.info(f"Using alternative y-column: {y_column}")
                
                backend_trace = {
                    "x_column": x_column,
                    "y_column": y_column,
                    "name": trace.get("name", f"Trace {len(backend_request['traces']) + 1}"),
                    "chart_type": trace.get("chart_type", chart_json.get("chart_type", "line")),
                    "aggregation": trace.get("aggregation", "sum")
                }
                
                # Add optional fields if present
                if "color" in trace:
                    backend_trace["color"] = trace["color"]
                if "filters" in trace:
                    backend_trace["filters"] = trace["filters"]
                
                backend_request["traces"].append(backend_trace)
            
            # Add optional fields if present
            if "title" in chart_json:
                backend_request["title"] = chart_json["title"]
            
            # Transform axis configurations if present
            if "x_axis" in chart_json:
                backend_request["x_axis"] = chart_json["x_axis"]
            if "y_axis" in chart_json:
                backend_request["y_axis"] = chart_json["y_axis"]
            
            # Transform legend configuration if present
            if "legend" in chart_json:
                backend_request["legend"] = chart_json["legend"]
            
            # Transform tooltip configuration if present
            if "tooltip" in chart_json:
                backend_request["tooltip"] = chart_json["tooltip"]
            
            # Transform responsive configuration if present
            if "responsive" in chart_json:
                backend_request["responsive"] = chart_json["responsive"]
            
            logger.info("✅ Successfully transformed single chart_json to backend format")
            logger.info(f"📊 Backend request: {json.dumps(backend_request, indent=2)}")
            return backend_request
            
        except Exception as e:
            logger.error(f"❌ Error transforming chart_json to backend format: {e}")
            return chart_json

    def _transform_multiple_charts_to_backend_format(self, multi_chart_response: Dict[str, Any]) -> Dict[str, Any]:
        """
        Transform multiple charts configuration to backend format.
        This creates a structure that the frontend can use to configure multiple charts.
        """
        try:
            logger.info("🔍 Transforming multiple charts to backend format")
            
            # Extract the charts array
            charts = multi_chart_response.get("charts", [])
            number_of_charts = multi_chart_response.get("number_of_charts", len(charts))
            
            # Create a multi-chart configuration structure
            multi_chart_config = {
                "multiple_charts": True,
                "number_of_charts": number_of_charts,
                "charts": []
            }
            
            # Get all available columns from all files
            all_available_columns = set()
            for columns in self.files_with_columns.values():
                all_available_columns.update(columns)
            
            logger.info(f"🔍 Available columns for multiple charts: {list(all_available_columns)[:20]}...")
            
            # Transform each chart
            for chart in charts:
                chart_id = chart.get("chart_id", str(len(multi_chart_config["charts"]) + 1))
                chart_type = chart.get("chart_type", "line")
                
                # Transform traces for this chart
                backend_traces = []
                for trace in chart.get("traces", []):
                    x_column = trace.get("x_column", "")
                    y_column = trace.get("y_column", "")
                    
                    # Validate columns exist
                    if x_column and x_column not in all_available_columns:
                        logger.warning(f"X-column '{x_column}' not found in chart {chart_id}")
                        if all_available_columns:
                            x_column = list(all_available_columns)[0]
                    
                    if y_column and y_column not in all_available_columns:
                        logger.warning(f"Y-column '{y_column}' not found in chart {chart_id}")
                        if all_available_columns:
                            y_column = list(all_available_columns)[0]
                    
                    backend_trace = {
                        "x_column": x_column,
                        "y_column": y_column,
                        "name": trace.get("name", f"Chart {chart_id} Trace"),
                        "chart_type": trace.get("chart_type", chart_type),
                        "aggregation": trace.get("aggregation", "sum")
                    }
                    
                    if "color" in trace:
                        backend_trace["color"] = trace["color"]
                    if "filters" in trace:
                        backend_trace["filters"] = trace["filters"]
                    
                    backend_traces.append(backend_trace)
                
                # Create backend chart configuration
                backend_chart = {
                    "chart_id": chart_id,
                    "chart_type": chart_type,
                    "title": chart.get("title", f"Chart {chart_id}"),
                    "traces": backend_traces
                }
                
                # Add optional configurations
                if "x_axis" in chart:
                    backend_chart["x_axis"] = chart["x_axis"]
                if "y_axis" in chart:
                    backend_chart["y_axis"] = chart["y_axis"]
                if "legend" in chart:
                    backend_chart["legend"] = chart["legend"]
                if "tooltip" in chart:
                    backend_chart["tooltip"] = chart["tooltip"]
                if "responsive" in chart:
                    backend_chart["responsive"] = chart["responsive"]
                
                multi_chart_config["charts"].append(backend_chart)
            
            logger.info("✅ Successfully transformed multiple charts to backend format")
            logger.info(f"📊 Multi-chart config: {json.dumps(multi_chart_config, indent=2)}")
            return multi_chart_config
            
        except Exception as e:
            logger.error(f"❌ Error transforming multiple charts to backend format: {e}")
            return multi_chart_response

    # 🔧 REMOVED: Manual transformation function - let the LLM handle everything
    # def _transform_to_frontend_format(self, result: Dict[str, Any], user_prompt: str) -> Dict[str, Any]:
        """
        Transform the result to match frontend expectations with suggestions key.
        This ensures consistency with other agents like merge, concat, etc.
        Supports both single and multiple chart configurations.
        """
        try:
            if result.get("success"):
                # 🔧 UNIFIED APPROACH: chart_json is always a list
                logger.info("🔍 Processing charts for frontend (unified approach)")
                
                # Check if we have chart_json
                if "chart_json" in result and isinstance(result["chart_json"], list):
                    chart_count = len(result["chart_json"])
                    logger.info(f"📊 Processing {chart_count} chart(s) for frontend")
                else:
                    logger.warning("❌ No valid chart_json found in result")
                    chart_count = 0
                
                # Success case - create suggestions for next steps
                if chart_count > 1:
                    suggestions = [
                        f"{chart_count} chart configurations have been generated successfully!",
                        "You can now view and customize the chart settings",
                        "Use the 2-chart layout option to view multiple charts simultaneously",
                        "Each chart will auto-render when you have data loaded",
                        "Use the chart maker interface to adjust colors, titles, and layout"
                    ]
                else:
                    suggestions = [
                        "Chart configuration has been generated successfully!",
                        "You can now view and customize the chart settings",
                        "The chart will auto-render when you have data loaded",
                        "Use the chart maker interface to adjust colors, titles, and layout"
                    ]
                
                # Add file-specific suggestions if we have file context
                if self.files_with_columns:
                    suggestions.append(f"Available files: {', '.join(self.files_with_columns.keys())}")
                    if self.current_file_id and self.current_file_id in self.files_with_columns:
                        columns = self.files_with_columns[self.current_file_id]
                        suggestions.append(f"Current file has {len(columns)} columns: {', '.join(columns[:5])}{'...' if len(columns) > 5 else ''}")
                
                # 🔧 CRITICAL FIX: Preserve file_name and data_source from LLM response
                frontend_response = {
                    "success": True,
                    "message": result.get("message", "Chart configuration completed successfully"),
                    "chart_json": result.get("chart_json"),
                    "reasoning": result.get("reasoning", "AI analyzed your request and generated appropriate chart settings"),
                    "used_memory": len(self.sessions.get(result.get("session_id", ""), [])) > 1,
                    "suggestions": suggestions,
                    "next_steps": [
                        "Review the generated chart configuration",
                        "Upload data if not already loaded",
                        "Customize chart appearance as needed",
                        "Save or export the chart when ready"
                    ]
                }
                
                # 🔧 CRITICAL: Add file information if available in LLM response
                if result.get("file_name"):
                    frontend_response["file_name"] = result["file_name"]
                    logger.info(f"✅ Added file_name to frontend response: {result['file_name']}")
                
                # data_source field removed - frontend now uses file_name only
                
                # 🔧 CRITICAL: Add file context for frontend
                if self.files_with_columns:
                    # 🔧 CRITICAL FIX: Use full object paths for file context
                    available_files = list(self.files_with_columns.keys())
                    current_file_id = self.current_file_id or ""
                    
                    frontend_response["file_context"] = {
                        "available_files": available_files,
                        "current_file_id": current_file_id,
                        "total_files": len(self.files_with_columns)
                    }
                    logger.info(f"✅ Added file_context to frontend response: {len(self.files_with_columns)} files")
                    logger.info(f"📁 Available files: {available_files[:5]}...")  # Log first 5 files
                    
                    # 🔧 CRITICAL FIX: If we have files but no specific file selected, suggest the first one
                    if available_files and not result.get("file_name"):
                        suggested_file = available_files[0]
                        frontend_response["file_name"] = suggested_file
                        logger.info(f"✅ Auto-suggested file: {suggested_file}")
                else:
                    logger.warning("⚠️ No files available for file context")
                
                # 🔧 CRITICAL DEBUG: Log the complete frontend response before returning
                logger.info("🔍 ===== COMPLETE FRONTEND RESPONSE BEFORE RETURN =====")
                logger.info(f"📊 Frontend Response Keys: {list(frontend_response.keys())}")
                logger.info(f"📊 Frontend Response:\n{json.dumps(frontend_response, indent=2)}")
                logger.info(f"🔍 ===== END FRONTEND RESPONSE =====")
                
                return frontend_response
            else:
                # Failure case - provide helpful suggestions
                suggestions = [
                    "Please check your request and try again",
                    "Make sure you have data files uploaded",
                    "Be specific about what type of chart you want",
                    "Try describing the data you want to visualize"
                ]
                
                # Add file context suggestions if available
                if self.files_with_columns:
                    suggestions.append(f"Available files: {', '.join(self.files_with_columns.keys())}")
                else:
                    suggestions.append("No data files are currently available")
                
                return {
                    "success": False,
                    "message": result.get("message", "Chart generation failed"),
                    "error": result.get("error", "Unknown error occurred"),
                    "suggestions": suggestions,
                    "next_steps": [
                        "Upload your data files first",
                        "Provide a clear description of the chart you want",
                        "Check that the requested columns exist in your data"
                    ]
                }
                
        except Exception as e:
            logger.error(f"Error transforming to frontend format: {e}")
            # Fallback to original result with basic suggestions
            return {
                "success": result.get("success", False),
                "message": result.get("message", "Chart generation completed"),
                "chart_json": result.get("chart_json"),
                "suggestions": ["Chart generation completed", "Check the results in the interface"],
                "error": str(e) if not result.get("success") else None
            }

    # 🔧 DEPRECATED: This function is no longer used with the unified chart_json approach
    # def _transform_multiple_charts_to_frontend_format(self, result: Dict[str, Any], user_prompt: str) -> Dict[str, Any]:
    #     """
    #     Transform multiple charts result to frontend format.
    #     This creates a structure that the frontend can use to configure multiple charts.
    #     """
    #     # Function removed - unified approach handles all chart types
    #     pass

    def process(self, user_prompt: str, session_id: Optional[str] = None, 
                client_name: str = "", app_name: str = "", project_name: str = "") -> Dict:
        """
        Main entry point to process a user's request to create charts.
        Enhanced to match Merge agent's robust approach.
        """
        logger.info(f"Processing chart request for session '{session_id}': '{user_prompt}'")
        
        # Set environment context for dynamic path resolution (like explore agent)
        self.set_context(client_name, app_name, project_name)
        
        if not user_prompt or not user_prompt.strip():
            return {"success": False, "error": "Prompt cannot be empty.", "session_id": session_id}

        # 🔍 COMPREHENSIVE LOGGING: Show what we're receiving
        # logger.info("🔍 ===== CHART MAKER AI AGENT - INPUT ANALYSIS =====")
        # logger.info(f"📝 User Prompt: {user_prompt}")
        # logger.info(f"🆔 Session ID: {session_id}")
        # logger.info(f"📁 Available Files: {list(self.files_with_columns.keys())}")
        # logger.info(f"📊 Files with Columns: {json.dumps(self.files_with_columns, indent=2)}")
        # logger.info(f"🔍 ===== END INPUT ANALYSIS =====")

        session_id = self.create_session(session_id)
        
        # Check if MinIO prefix needs an update (and files need reloading) - like Merge agent
        self._maybe_update_prefix()
        
        # Always refresh file listing so newly created/updated files are available
        self._load_files()
        
        # Debug logging for file loading
        logger.info(f"🔍 Files loaded: {len(self.files_with_columns)} files")
        logger.info(f"🔍 File names: {list(self.files_with_columns.keys())}")
        
        if not self.files_with_columns:
            logger.warning("No files are loaded. Cannot process chart request.")
            return {
                "success": False, 
                "error": "No data files found in the specified MinIO location.", 
                "session_id": session_id
            }
        
        # 1. Build context from history
        context = self._build_context(session_id)
        logger.info(f"📚 Session Context Built: {len(context)} characters")
        
        # 2. Enhance context with file/column info
        context = self._enhance_context_with_columns(context, user_prompt)
        logger.info(f"📁 Enhanced Context Built: {len(context)} characters")
        
        # 3. Resolve relevant files for this prompt (reuse selection from context enhancement when possible)
        selection = self._last_context_selection or self.file_context_resolver.resolve(
            user_prompt=user_prompt,
            top_k=3,
            include_metadata=True
        )
        available_for_prompt = selection.to_object_column_mapping(self._raw_files_with_columns) if selection else self._raw_files_with_columns
        file_analysis_data = selection.file_details if selection else {}
        
        # 4. Build the final prompt for the LLM with condensed file analysis
        prompt = build_chart_prompt(user_prompt, available_for_prompt, context, file_analysis_data)
        
        # 🔍 COMPREHENSIVE LOGGING: Show what we're sending to LLM
        logger.info("🔍 ===== LLM INPUT - COMPLETE PROMPT =====")
        logger.info(f"📤 Prompt Length: {len(prompt)} characters")
        logger.info(f"📤 Complete Prompt:\n{prompt}")
        logger.info(f"🔍 ===== END LLM INPUT =====")
        
        logger.info("🚀 Sending final prompt to LLM...")
        
        try:
            llm_response = call_chart_llm(self.api_url, self.model_name, self.bearer_token, prompt)
            
            # 🔍 COMPREHENSIVE LOGGING: Show what we received from LLM
            logger.info("🔍 ===== LLM OUTPUT - COMPLETE RESPONSE =====")
            logger.info(f"📥 Response Length: {len(llm_response)} characters")
            logger.info(f"📥 Complete LLM Response:\n{llm_response}")
            logger.info(f"🔍 ===== END LLM OUTPUT =====")
            
            # Enhanced JSON extraction with better error handling
            result = extract_json(llm_response, self.files_with_columns, user_prompt)
            
            if not result:
                logger.error("❌ Failed to extract valid JSON from LLM response")
                logger.error(f"🔍 Raw LLM response that failed JSON extraction:\n{llm_response}")
                
                # Return a helpful error response instead of raising an exception
                return {
                    "success": False,
                    "message": "Could not parse JSON from LLM response",
                    "suggestions": [
                        "The AI response was not in valid JSON format",
                        "Try rephrasing your request more clearly",
                        "Make sure to ask for a specific chart type (bar, line, pie, scatter)",
                        "Include the data file name in your request"
                    ],
                    "smart_response": "I had trouble understanding your request. Please try asking for a chart in a simpler way, like 'Create a bar chart showing sales by region' or 'Make a line chart of revenue over time'.",
                    "reasoning": "JSON parsing failed",
                    "used_memory": False
                }
            
            # 🔍 COMPREHENSIVE LOGGING: Show extracted JSON
            logger.info("🔍 ===== EXTRACTED JSON FROM LLM =====")
            logger.info(f"📊 Extracted JSON:\n{json.dumps(result, indent=2)}")
            logger.info(f"🔍 ===== END EXTRACTED JSON =====")

            # 🔧 Ensure consistent payload before returning to frontend
            result = self._normalize_chart_result(result)

            logger.info("🔍 ===== NORMALISED CHART JSON =====")
            logger.info(f"📊 Normalised JSON:\n{json.dumps(result, indent=2)}")
            logger.info(f"🔍 ===== END NORMALISED JSON =====")
            
            # 🔍 DEBUG: Check if smart_response is present
            if "smart_response" in result:
                logger.info(f"✅ Smart response found: {result['smart_response']}")
            else:
                logger.warning("⚠️ Smart response NOT found in LLM response")
            
            # 🔧 USE LLM RESPONSE DIRECTLY - NO MANUAL PROCESSING
            if result.get("success") and "chart_json" in result:
                logger.info("🔍 Chart configuration successful, using LLM response directly...")
                
                # Use LLM response exactly as generated - no modifications
                logger.info("🔍 Using LLM response directly - no manual processing")
                for i, chart in enumerate(result["chart_json"]):
                    chart_title = chart.get("title", f"Chart {i+1}")
                    chart_filters = chart.get("filters", {})
                    logger.info(f"🔍 Chart {i+1} ({chart_title}): LLM chart filters = {chart_filters}")
                    
                    # Log trace filters - no modifications
                    for j, trace in enumerate(chart.get("traces", [])):
                        trace_filters = trace.get("filters", {})
                        logger.info(f"🔍 Chart {i+1}, Trace {j+1}: LLM trace filters = {trace_filters}")
                
                logger.info("🔍 LLM generated chart configuration successfully")
                logger.info(f"📊 Number of charts: {len(result['chart_json']) if isinstance(result['chart_json'], list) else 1}")
                
            else:
                logger.info("🔍 LLM response processed (may be suggestions or error)")
                
        except Exception as e:
            logger.error(f"❌ Error in LLM processing: {e}", exc_info=True)
            result = {
                "success": False,
                "message": f"System error occurred: {str(e)}",
                "suggestions": [
                    "There was a technical issue processing your request",
                    "Please try again with a simpler request",
                    "Make sure to specify a chart type and data file"
                ],
                "smart_response": "I encountered a technical issue while processing your request. Please try again with a simpler chart request, like 'Create a bar chart of sales by region'.",
                "reasoning": f"System error: {str(e)}",
                "used_memory": False
            }

        # Store interaction in session history (like Merge agent)
        interaction = {
            "user_prompt": user_prompt,
            "system_response": result,
            "timestamp": datetime.now().isoformat()
        }
        self.sessions[session_id].append(interaction)
        result["session_id"] = session_id
        
        # 🔧 SIMPLIFIED: No transformation needed with unified approach
        # final_result = self._transform_to_frontend_format(result, user_prompt)
        final_result = result  # Use result directly
        final_result["session_id"] = session_id
        
        # 🔍 COMPREHENSIVE LOGGING: Show final response
        logger.info("🔍 ===== FINAL AI AGENT RESPONSE =====")
        logger.info(f"✅ Success: {final_result.get('success')}")
        logger.info(f"📝 Message: {final_result.get('message')}")
        logger.info(f"📊 Final Response:\n{json.dumps(final_result, indent=2)}")
        logger.info(f"🔍 ===== END FINAL RESPONSE =====")
        
        logger.info(f"Request processed successfully. Success: {final_result.get('success', False)}")
        return final_result

    # Memory helpers (like Merge agent)
    def get_session_history(self, session_id):
        return self.sessions.get(session_id, [])

    def get_all_sessions(self):
        return list(self.sessions.keys())

    def clear_session(self, session_id):
        if session_id in self.sessions:
            del self.sessions[session_id]
            logger.info(f"Cleared session: {session_id}")
            return True
        return False
