# ai_logic.py - Minimal, strict, and precise Chart Maker AI Logic

import re
import json
import logging
from typing import Dict, Any, Optional, List

logger = logging.getLogger("smart.chart.ai")

# Removed schema validation - using simple JSON extraction only

# ------------------------------------------------------------------------------
# Strict JSON Schema (precise shape, minimal fields, filters optional)
# ------------------------------------------------------------------------------

# Removed schema - using simple JSON extraction only

# ------------------------------------------------------------------------------
# Intent detection and sanitization helpers
# ------------------------------------------------------------------------------

def _detect_chart_request(user_prompt: str) -> bool:
    """Detect if user explicitly wants to create a chart"""
    kws = ['chart', 'graph', 'plot', 'visualize', 'bar chart', 'line chart', 'pie chart', 'scatter', 'dashboard']
    up = user_prompt.lower()
    return any(k in up for k in kws)

def _has_sufficient_info_for_chart(user_prompt: str, available_files_with_columns: dict, context: str) -> bool:
    """
    Check if we have sufficient information to create a chart.
    Required: file name AND x-axis column AND y-axis column
    """
    up = user_prompt.lower()
    
    # Check if user mentioned a file (either in prompt or in context)
    has_file = False
    if available_files_with_columns:
        for file_name in available_files_with_columns.keys():
            # Check for file name in prompt or context
            file_name_lower = file_name.lower()
            simple_name = file_name.split('/')[-1].lower().replace('.arrow', '').replace('.parquet', '').replace('.feather', '')
            if simple_name in up or simple_name in context.lower():
                has_file = True
                break
    
    # Check if user mentioned columns (approximate detection)
    # Look for words like "x axis", "y axis", "column", or specific column names
    mentions_axes = ('x axis' in up or 'y axis' in up or 'x-axis' in up or 'y-axis' in up)
    
    # Check if user mentioned specific column names from available files
    has_specific_columns = False
    if available_files_with_columns:
        for file_name, columns in available_files_with_columns.items():
            for column in columns:
                # Check if user mentioned this specific column (case insensitive)
                if column.lower() in up:
                    has_specific_columns = True
                    break
            if has_specific_columns:
                break
    
    # Check if context has previous configuration (indicates ongoing conversation)
    has_previous_config = 'previous configuration' in context.lower() or 'chart_json' in context.lower()
    
    # 🚨 CRITICAL: Must have file AND (axes mentioned OR specific columns OR previous config)
    return has_file and (mentions_axes or has_specific_columns or has_previous_config)

def _detect_filter_intent(user_prompt: str) -> bool:
    """Simple filter detection - check if user mentioned filtering"""
    kws = [
        "filter", "where", "only", "show only", "for ", " in ", " with ", "by ",
        "filtered by", "specific", "particular", "equals", "=", ":"
    ]
    up = user_prompt.lower()
    return any(k in up for k in kws)

def _is_general_question(user_prompt: str) -> bool:
    """Detect if this is a general question that doesn't need chart generation"""
    general_keywords = [
        'what is', 'how does', 'explain', 'tell me', 'what can you',
        'help', 'what are', 'show me available', 'list', 'which files',
        'what files', 'hello', 'hi ', 'hey', 'thanks', 'thank you'
    ]
    up = user_prompt.lower()
    return any(k in up for k in general_keywords)

# Removed helper functions - using simple JSON extraction only

# Removed schema pruning - using simple JSON extraction only

# Removed complex processing functions - using simple JSON extraction only

# ------------------------------------------------------------------------------
# Prompt builders (minimal, deterministic, JSON-only)
# ------------------------------------------------------------------------------

def build_chart_prompt(user_prompt: str, available_files_with_columns: dict, context: str, file_analysis_data: dict = None) -> str:
    """
    Generate backend-compatible chart configuration JSON.
    Only called when we have sufficient information (file + x/y axes).
    """
    file_info = build_file_info_string(available_files_with_columns)
    file_details_section = build_file_details_section(file_analysis_data)
    
    return (
        "You are an intelligent chart creation assistant. Generate a chart configuration based on user requirements.\n"
        "Return ONLY valid JSON (no prose, no markdown, no code blocks).\n\n"
        f"{file_details_section}"
        "🚨 CRITICAL VALIDATION RULES - MUST CHECK BEFORE RETURNING success: true:\n"
        "1. file_name MUST exist in AVAILABLE_FILES_WITH_COLUMNS (exact match)\n"
        "2. chart_json MUST NOT be empty - must contain at least one chart configuration\n"
        "3. For EACH chart in chart_json, MUST have: x_column, y_column, chart_type\n"
        "4. For multiple charts: ALL charts use SAME file_name, but can have different x_axis, y_axis, chart_type\n"
        "5. If ANY required field is missing, return success: false with smart_response explaining what's missing\n"
        "6. ONLY return success: true when ALL validation passes\n\n"
        "✅ SUCCESS CRITERIA (ALL must be true):\n"
        "- file_name is present AND exists in available files\n"
        "- chart_json is NOT empty (must contain at least one chart)\n"
        "- EVERY chart has x_column (must exist in file)\n"
        "- EVERY chart has y_column (must exist in file)\n"
        "- EVERY chart has chart_type ('bar', 'line', 'area', 'pie', or 'scatter')\n"
        "- For multiple charts: same file_name, different x/y/chart_type combinations allowed\n\n"
        "❌ RETURN success: false IF:\n"
        "- file_name is missing or not in available files\n"
        "- chart_json is empty []\n"
        "- ANY chart missing x_column, y_column, or chart_type\n"
        "- Column names don't exist in the selected file\n"
        "- User didn't provide enough information\n\n"
        "VALIDATION CHECKLIST:\n"
        "Step 1: Check file_name exists in AVAILABLE_FILES_WITH_COLUMNS\n"
        "Step 2: Check chart_json is NOT empty (must contain at least one chart)\n"
        "Step 3: For each chart, verify x_column exists in file columns\n"
        "Step 4: For each chart, verify y_column exists in file columns\n"
        "Step 5: For each chart, verify chart_type is valid\n"
        "Step 6: If ALL checks pass → success: true, else → success: false\n\n"
        "COLUMN AND FILE RULES:\n"
        "- Use ONLY columns from AVAILABLE_FILES_WITH_COLUMNS or FILE_DETAILS (if provided).\n"
        "- file_name and data_source MUST be exact paths from AVAILABLE_FILES_WITH_COLUMNS / FILE_DETAILS.\n"
        "- NEVER invent column names or file names.\n"
        "- x_column and y_column must be STRINGS (column names), not arrays or lists.\n"
        "- All columns must exist in the selected file.\n"
         "- 🚨 CRITICAL: Use EXACT column names from FILE_DETAILS.columns (case-sensitive). If FILE_DETAILS is missing, fall back to AVAILABLE_FILES_WITH_COLUMNS.\n"
         "- 🚨 CRITICAL: If file has columns ['Brand', 'SalesValue'], use 'Brand' NOT 'brand'. Different files may use lowercase ['brand'] vs title case ['Brand']; always check the specific file's schema.\n"
         "- 🚨 CRITICAL: Respect column types from FILE_DETAILS (e.g., don't use numeric columns as categorical filters).\n"
         "- Validate each x_column, y_column, segregated_field, legend_field, and filter column against the file schema before returning success: true.\n\n"
        "FILTER RULES:\n"
        "- filters is OPTIONAL: include ONLY if the user explicitly asked to filter; otherwise set filters to {}.\n"
        "- NEVER invent or copy example/sample values; only include filter values explicitly present in USER INPUT text.\n"
        "- FILTER LOGIC: If user says 'filter by PPG' (no specific values) → {\"PPG\": []}. If user says 'filter by PPG xl and lg' (with values) → {\"PPG\": [\"xl\", \"lg\"]}.\n"
        "- CRITICAL: Only include filters when user explicitly mentions filtering, sorting, or finding specific things.\n"
        "- CRITICAL: Do NOT add filters automatically - only when user context clearly indicates filtering is needed.\n"
        "- When FILE_DETAILS.unique_values exist, filter values MUST come from that list (discard anything that is not present in the dataset).\n\n"
        "CHART CONFIGURATION RULES:\n"
        "- Each chart MUST include 'chart_type' field with value 'bar', 'line', 'area', 'pie', or 'scatter'.\n"
        "- aggregation must be one of: 'sum', 'mean', 'count', 'min', 'max'.\n"
        "- All required fields in traces must be present: x_column, y_column, name, chart_type, aggregation.\n"
        "- For multiple charts, each chart can have different filters based on user requirements.\n"
        "- For multiple charts, ALL charts share the SAME file_name\n\n"
        f"USER INPUT: {user_prompt}\n"
        f"AVAILABLE_FILES_WITH_COLUMNS: {json.dumps(available_files_with_columns)}\n"
        f"CONTEXT: {context}\n"
        "\n"
        "EXAMPLE VALIDATION:\n"
        "\n"
        "✅ SINGLE CHART - VALID:\n"
        "Available files: {'sales.arrow': ['Date', 'Revenue', 'Region']}\n"
        "User: 'Create chart showing revenue by region using sales.arrow'\n"
        "Validation: ✅ file_name='sales.arrow' (exists), ✅ x_column='Region' (exists), ✅ y_column='Revenue' (exists), ✅ chart_type='bar'\n"
        "→ success: true\n"
        "\n"
        "✅ MULTIPLE CHARTS - VALID:\n"
        "Available files: {'sales.arrow': ['Date', 'Revenue', 'Region', 'Profit']}\n"
        "User: 'Create 2 charts: revenue by region and profit by date using sales.arrow'\n"
        "Validation:\n"
        "  Chart 1: ✅ file_name='sales.arrow', ✅ x_column='Region', ✅ y_column='Revenue', ✅ chart_type='bar'\n"
        "  Chart 2: ✅ file_name='sales.arrow', ✅ x_column='Date', ✅ y_column='Profit', ✅ chart_type='line'\n"
        "→ success: true (same file_name, different x/y/chart_type)\n"
        "\n"
        "❌ MISSING INFO - INVALID:\n"
        "User: 'Create a chart'\n"
        "Validation: ❌ missing file_name, ❌ missing x_column, ❌ missing y_column\n"
        "→ success: false, smart_response: 'To create a chart, I need: file name, x-axis column, y-axis column. Available files: " + file_info + "'\n"
        "\n"
        "❌ INVALID COLUMN - INVALID:\n"
        "Available files: {'sales.arrow': ['Date', 'Revenue', 'Region']}\n"
        "User: 'Create chart showing profit by region using sales.arrow'\n"
        "Validation: ✅ file_name='sales.arrow', ✅ x_column='Region', ❌ y_column='profit' (doesn't exist in file)\n"
        "→ success: false, smart_response: 'Column \"profit\" not found in sales.arrow. Available columns: Date, Revenue, Region'\n"
        "\n"
        "❌ CASE SENSITIVITY - INVALID:\n"
        "Available files: {'sales.arrow': ['Brand', 'SalesValue', 'Region']}\n"
        "User: 'Create chart showing salesvalue by brand using sales.arrow'\n"
        "Validation: ✅ file_name='sales.arrow', ❌ x_column='brand' (WRONG CASE), ❌ y_column='salesvalue' (WRONG CASE)\n"
        "→ success: false, smart_response: 'Columns \"brand\" and \"salesvalue\" not found. Available columns: Brand, SalesValue, Region. Use exact column names including capitalization.'\n"
        "\n"
         "❌ EMPTY CHART JSON - INVALID:\n"
         "Available files: {'sales.arrow': ['Brand', 'SalesValue', 'Region']}\n"
         "User: 'List available files'\n"
         "Validation: ❌ chart_json is empty [], ❌ no chart configuration provided\n"
         "→ success: false, smart_response: 'Here are the available files: " + file_info + "'\n"
         "\n"
         "❌ CASING INCONSISTENCY - INVALID:\n"
         "Available files: {'uk_beans.arrow': ['brand', 'salesvalue', 'region'], 'sales.arrow': ['Brand', 'SalesValue', 'Region']}\n"
         "User: 'Create chart showing SalesValue by Brand using uk_beans.arrow'\n"
         "Validation: ✅ file_name='uk_beans.arrow', ❌ x_column='Brand' (WRONG CASE for this file), ❌ y_column='SalesValue' (WRONG CASE for this file)\n"
         "→ success: false, smart_response: 'Columns \"Brand\" and \"SalesValue\" not found in uk_beans.arrow. Available columns: brand, salesvalue, region. Use exact column names including capitalization.'\n"
         "\n"
         "✅ CASING INCONSISTENCY - VALID:\n"
         "Available files: {'uk_beans.arrow': ['brand', 'salesvalue', 'region'], 'sales.arrow': ['Brand', 'SalesValue', 'Region']}\n"
         "User: 'Create chart showing salesvalue by brand using uk_beans.arrow'\n"
         "Validation: ✅ file_name='uk_beans.arrow', ✅ x_column='brand' (CORRECT CASE), ✅ y_column='salesvalue' (CORRECT CASE)\n"
         "→ success: true\n"
        "\n"
        "FILTER EXAMPLES:\n"
        "- User: 'Create chart filtered by PPG' → filters: {\"PPG\": []}\n"
        "- User: 'Create chart filtered by PPG xl and lg' → filters: {\"PPG\": [\"xl\", \"lg\"]}\n"
        "- User: 'Create chart' (no filter mention) → filters: {}\n"
        "Output shape:\n"
        "{"
        "\"success\": true,"
        "\"chart_json\": [ {"
          "\"chart_id\": \"1\","
          "\"chart_type\": \"bar|line|area|pie|scatter\","
          "\"title\": \"Chart Title\","
          "\"traces\": [ {"
            "\"x_column\": \"ColumnName\","
            "\"y_column\": \"ColumnName\","
            "\"name\": \"Trace Name\","
            "\"chart_type\": \"bar|line|area|pie|scatter\","
            "\"aggregation\": \"sum|mean|count|min|max\","
            "\"color\": \"#8884d8\","
            "\"filters\": {} or {\"ColumnName\": [\"Value1\", \"Value2\"]} or {\"ColumnName\": []}"
          "} ],"
          "\"filters\": {} or {\"ColumnName\": [\"Value1\", \"Value2\"]} or {\"ColumnName\": []}"
        "}, {"
          "\"chart_id\": \"2\","
          "\"chart_type\": \"bar|line|area|pie|scatter\","
          "\"title\": \"Second Chart Title\","
          "\"traces\": [ {"
            "\"x_column\": \"ColumnName\","
            "\"y_column\": \"ColumnName\","
            "\"name\": \"Trace Name\","
            "\"chart_type\": \"bar|line|area|pie|scatter\","
            "\"aggregation\": \"sum|mean|count|min|max\","
            "\"color\": \"#82ca9d\","
            "\"filters\": {} or {\"DifferentColumn\": [\"Value3\", \"Value4\"]}"
          "} ],"
          "\"filters\": {} or {\"DifferentColumn\": [\"Value3\", \"Value4\"]}"
        "} ],"
        "\"file_name\": \"exact_file_path_from_available_files\" (REQUIRED - use this field name),"
        "\"data_source\": \"exact_file_path_from_available_files\" (OPTIONAL - can be same as file_name for backward compatibility),"
        "\"message\": \"Chart configuration completed successfully\","
        "\"reasoning\": \"Brief explanation of chart choices\","
        "\"used_memory\": true,"
        "\"smart_response\": \"User-friendly message about the chart created\""
        "}"
        "REMEMBER - Return ONLY valid JSON (no prose, no markdown, no code blocks).\n"
    )

def build_file_info_string(available_files_with_columns: dict) -> str:
    """
    Build a formatted string with file names and their columns for display in smart_response.
    """
    if not available_files_with_columns:
        return "No files available"
    
    file_info_parts = []
    for file_name, file_data in available_files_with_columns.items():
        # Handle both dict and list formats
        if isinstance(file_data, dict):
            columns = file_data.get('columns', [])
        elif isinstance(file_data, list):
            columns = file_data
        else:
            columns = []
        
        # Show just the filename for cleaner display
        display_name = file_name.split('/')[-1] if '/' in file_name else file_name
        
        # Show first 5 columns for readability
        column_preview = ', '.join(columns[:5])
        if len(columns) > 5:
            column_preview += f' ... (+{len(columns) - 5} more)'
        
        file_info_parts.append(f"{display_name} (columns: {column_preview})")
    
    return '; '.join(file_info_parts)

def build_file_details_section(file_analysis_data: Optional[dict], max_files: int = 2, max_columns: int = 40) -> str:
    """
    Build a compact FILE_DETAILS blob (columns + unique values) so the LLM can match exact column names and filter values.
    """
    if not file_analysis_data:
        return ""

    trimmed_details = {}
    for idx, (file_name, details) in enumerate(file_analysis_data.items()):
        if idx >= max_files:
            break
        if not isinstance(details, dict):
            continue

        columns = details.get("columns", [])
        if isinstance(columns, dict):
            columns = list(columns.keys())
        elif not isinstance(columns, list):
            columns = []
        columns = columns[:max_columns]

        unique_values = details.get("unique_values", {})
        if isinstance(unique_values, dict):
            trimmed_unique = {
                col: (vals[:10] if isinstance(vals, list) else vals)
                for col, vals in unique_values.items()
                if col in columns
            }
        else:
            trimmed_unique = {}

        trimmed_details[file_name] = {
            "file_path": details.get("file_path") or details.get("object_name"),
            "columns": columns,
            "numeric_columns": [col for col in details.get("numeric_columns", []) if col in columns],
            "categorical_columns": [col for col in details.get("categorical_columns", []) if col in columns],
            "unique_values": trimmed_unique,
            "row_count": details.get("row_count") or details.get("total_rows"),
            "sample_data": details.get("sample_data", [])[:1],
        }

    if not trimmed_details:
        return ""

    return "FILE_DETAILS (USE EXACT COLUMN NAMES & FILTER VALUES):\n" + json.dumps(trimmed_details, indent=2) + "\n"

def build_data_question_prompt(user_prompt: str, available_files_with_columns: dict, context: str, file_analysis_data: dict = None, file_info_section: str = "") -> str:
    """
    Prompt for answering general questions or asking for clarification when information is missing.
    Enhanced to provide smart responses about what's needed for chart creation.
    """
    file_info = build_file_info_string(available_files_with_columns)
    file_details_section = build_file_details_section(file_analysis_data)
    
    return (
        "You are a helpful chart creation assistant. The user needs to provide complete information to create a chart.\n"
        "Return ONLY valid JSON (no prose, no markdown).\n\n"
        f"USER INPUT: {user_prompt}\n"
        f"AVAILABLE_FILES_WITH_COLUMNS: {json.dumps(available_files_with_columns)}\n"
        f"{file_details_section}"
        f"CONTEXT: {context}\n\n"
        "CRITICAL RULES:\n"
        "1. For chart creation, we REQUIRE: file name, x-axis column, and y-axis column\n"
        "2. If user asks for a chart but didn't provide these details, ask for them in smart_response\n"
        "3. If user asks a general question (what is, how does, explain, help), answer it helpfully\n"
        "4. ALWAYS include available files and their columns in smart_response when asking for clarification\n"
        "5. Be conversational and helpful - guide the user to provide the information needed\n\n"
        "RESPONSE TYPES:\n"
        "- If user asks 'create a chart' without details → Ask which file, x-axis, and y-axis to use\n"
        "- If user asks 'what files are available' → List the available files and columns\n"
        "- If user asks general questions → Answer them helpfully\n"
        "- If user provides partial info → Ask for the missing pieces specifically\n\n"
        "Output shape:\n"
        "{\n"
        "  \"success\": false,\n"
        "  \"suggestions\": [\n"
        "    \"Create a bar chart showing [column1] by [column2] using [filename]\",\n"
        "    \"Show me a line chart of [column] over time from [filename]\",\n"
        "    \"Make a pie chart of [column] using [filename]\"\n"
        "  ],\n"
        "  \"message\": \"I need more information to create your chart\",\n"
        "  \"reasoning\": \"Missing required information: file name, x-axis, or y-axis\",\n"
        "  \"file_analysis\": {\"total_files\": 0, \"numeric_columns\": [], \"categorical_columns\": [], \"chart_tips\": []},\n"
        "  \"next_steps\": [\n"
        "    \"Tell me which file to use: " + file_info + "\",\n"
        "    \"Specify which column for x-axis\",\n"
        "    \"Specify which column for y-axis\"\n"
        "  ],\n"
        "  \"smart_response\": \"To create a chart, I need three things: which file to use, which column for the x-axis, and which column for the y-axis. Available files: " + file_info + ". Please tell me which file and columns you'd like to use.\"\n"
        "}\n"
    )

def build_smart_prompt(user_prompt: str, available_files_with_columns: dict, context: str, file_analysis_data: dict = None) -> str:
    """
    Intelligently decide whether to generate a chart or ask for more information.
    Enhanced with validation to ensure we have sufficient information before attempting chart creation.
    """
    logger.info(f"Building smart prompt for: {user_prompt[:100]}...")
    
    # Check if this is a general question first
    if _is_general_question(user_prompt):
        logger.info("Detected general question - using data question prompt")
        return build_data_question_prompt(user_prompt, available_files_with_columns, context, file_analysis_data, "")
    
    # Check if user wants to create a chart
    wants_chart = _detect_chart_request(user_prompt)
    
    if wants_chart:
        # Check if we have sufficient information to create the chart
        has_info = _has_sufficient_info_for_chart(user_prompt, available_files_with_columns, context)
        
        if has_info:
            logger.info("Chart request detected with sufficient info - using chart prompt")
            return build_chart_prompt(user_prompt, available_files_with_columns, context, file_analysis_data)
        else:
            logger.info("Chart request detected but missing required info - asking for clarification")
            return build_data_question_prompt(user_prompt, available_files_with_columns, context, file_analysis_data, "")
    
    # Default to data question prompt for unclear requests
    logger.info("No clear chart request - using data question prompt")
    return build_data_question_prompt(user_prompt, available_files_with_columns, context, file_analysis_data, "")



# ------------------------------------------------------------------------------
# LLM call (unchanged shape; keep low temperature)
# ------------------------------------------------------------------------------

def call_chart_llm(api_url: str, model_name: str, bearer_token: str, prompt: str) -> str:
    """
    Call the LLM API to generate chart configuration (JSON-only prompted).
    """
    try:
        import requests  # type: ignore[import-not-found]
    except ImportError as exc:  # pragma: no cover - requests should be present with the agent
        raise RuntimeError("The requests library is required to call the Chart LLM API.") from exc

    logger.info("Calling Chart LLM...")
    headers = {
        "Authorization": f"Bearer {bearer_token}",
        "Content-Type": "application/json"
    }

    payload = {
        "model": model_name,
        "messages": [{"role": "user", "content": prompt}],
        "stream": False,
        "options": {
            "temperature": 0.0,
            "num_predict": 1200,
            "top_p": 0.9,
            "repeat_penalty": 1.1
        }
    }

    logger.info(f"Payload prepared (len={len(json.dumps(payload))})")
    resp = requests.post(api_url, headers=headers, json=payload, timeout=300)
    resp.raise_for_status()
    result = resp.json()
    content = result.get("message", {}).get("content", "")
    logger.info(f"LLM raw content length: {len(content)}")
    return content

# ------------------------------------------------------------------------------
# Robust extraction + sanitize + validate against schema
# ------------------------------------------------------------------------------

def _extract_outer_json_text(response: str) -> str:
    if not response:
        return ""
    
    # Remove <think> tags (DeepSeek-style thinking)
    cleaned = response.strip()
    
    # Remove <think>...</think> blocks
    cleaned = re.sub(r'<think>.*?</think>', '', cleaned, flags=re.DOTALL)
    
    # Remove markdown code blocks (```json ... ```)
    cleaned = cleaned.strip()
    
    # Remove ```json at the beginning
    if cleaned.startswith("```json"):
        cleaned = cleaned[7:]  # Remove "```json"
    elif cleaned.startswith("```"):
        cleaned = cleaned[3:]   # Remove "```"
    
    # Remove ``` at the end
    if cleaned.endswith("```"):
        cleaned = cleaned[:-3]  # Remove "```"
    
    # Remove any remaining whitespace
    cleaned = cleaned.strip()
    
    # Find the first { and last } to extract JSON
    start = cleaned.find("{")
    end = cleaned.rfind("}")
    
    if start == -1 or end == -1 or end <= start:
        return cleaned
    
    return cleaned[start:end+1].strip()

def extract_json(response: str, available_files_with_columns: dict = None, user_prompt: str = "") -> Optional[Dict[str, Any]]:
    """
    Simple JSON extraction from LLM response - no complex processing.
    Works with DeepSeek-style responses that include thinking and reasoning.
    """
    logger.info(f"Extracting JSON from LLM response (len={len(response) if response else 0})")
    
    if not response:
        return {
            "success": False,
            "message": "Empty response from LLM",
            "suggestions": ["Retry the request with clearer chart requirements"]
        }

    # Extract JSON from response (handles markdown code blocks)
    raw = _extract_outer_json_text(response)
    
    try:
        obj = json.loads(raw)
        logger.info(f"✅ Successfully extracted JSON from LLM response")
        logger.info(f"🔍 Extracted JSON: {json.dumps(obj, indent=2)}")
        return obj
    except Exception as e:
        logger.error(f"❌ JSON parse failed: {e}")
        logger.error(f"🔍 Raw response that failed: {response[:500]}...")
        
        # Try one more time with simple brace matching
        try:
            start = response.find("{")
            end = response.rfind("}")
            if start != -1 and end != -1 and end > start:
                obj = json.loads(response[start:end+1])
                logger.info(f"✅ Successfully extracted JSON with fallback method")
                return obj
        except Exception as e2:
            logger.error(f"❌ Fallback JSON parse also failed: {e2}")
        
        return {
            "success": False,
            "message": "Could not parse JSON from LLM response",
            "suggestions": ["Enable JSON mode or reduce temperature and retry"]
        }
