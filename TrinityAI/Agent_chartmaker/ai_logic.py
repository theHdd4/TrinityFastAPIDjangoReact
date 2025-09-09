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
    kws = ['chart', 'graph', 'plot', 'visualize', 'bar chart', 'line chart', 'pie chart', 'scatter', 'dashboard']
    up = user_prompt.lower()
    return any(k in up for k in kws)

def _detect_filter_intent(user_prompt: str) -> bool:
    """Simple filter detection - check if user mentioned filtering"""
    kws = [
        "filter", "where", "only", "show only", "for ", " in ", " with ", "by ",
        "filtered by", "specific", "particular", "equals", "=", ":"
    ]
    up = user_prompt.lower()
    has_filter_intent = any(k in up for k in kws)
    
    # 🔍 CONSOLE LOGGING: Filter intent detection
    print(f"🔍 AI FILTER DETECTION:")
    print(f"   User prompt: {user_prompt[:100]}...")
    print(f"   Has filter intent: {has_filter_intent}")
    if has_filter_intent:
        matched_keywords = [k for k in kws if k in up]
        print(f"   Matched keywords: {matched_keywords}")
    
    return has_filter_intent

def _build_column_metadata_section(available_files_with_columns: dict, file_analysis_data: dict = None) -> str:
    """
    Build a detailed column metadata section for the LLM prompt.
    """
    if not file_analysis_data:
        return "No detailed file analysis available."
    
    metadata_sections = []
    
    for filename, columns in available_files_with_columns.items():
        if filename in file_analysis_data:
            analysis = file_analysis_data[filename]
            
            # Basic file info
            row_count = analysis.get('total_rows', 0)
            file_size = analysis.get('file_size_bytes', 0)
            
            # Column types
            numeric_cols = analysis.get('numeric_columns', [])
            categorical_cols = analysis.get('categorical_columns', [])
            
            metadata_sections.append(
                f"{filename}:\n"
                f"  Rows: {row_count}\n"
                f"  Numeric columns: {', '.join(numeric_cols)}\n"
                f"  Categorical columns: {', '.join(categorical_cols)}\n"
            )
        else:
            metadata_sections.append(
                f"{filename}:\n"
                f"  Columns: {', '.join(columns)}\n"
                f"  (No detailed analysis available)\n"
            )
    
    return "\n".join(metadata_sections) if metadata_sections else "No file analysis data available."

# ------------------------------------------------------------------------------
# Prompt builders (minimal, deterministic, JSON-only)
# ------------------------------------------------------------------------------

def build_chart_prompt(user_prompt: str, available_files_with_columns: dict, context: str, file_analysis_data: dict = None) -> str:
    """
    Generate backend-compatible chart configuration JSON.
    """
    return (
        "Return ONLY valid JSON (no prose, no markdown, no code blocks).\n"
        "Rules:\n"
        "- Use ONLY columns from AVAILABLE_FILES_WITH_COLUMNS.\n"
        "- file_name and data_source MUST be exact paths from AVAILABLE_FILES_WITH_COLUMNS.\n"
        "- filters is OPTIONAL: include ONLY if the user explicitly asked to filter; otherwise set filters to {}.\n"
        "- NEVER invent or copy example/sample values; only include filter values explicitly present in USER INPUT text.\n"
        "- FILTER LOGIC: If user says 'filter by PPG' (no specific values) → {\"PPG\": []}. If user says 'filter by PPG xl and lg' (with values) → {\"PPG\": [\"xl\", \"lg\"]}.\n"
        "- Do not include suggestions or explanations in the output.\n"
        "- Do not wrap JSON in markdown code blocks (```json).\n"
        "- CRITICAL: Each trace MUST include 'chart_type' field with value 'bar', 'line', 'area', 'pie', or 'scatter'.\n"
        "- CRITICAL: aggregation must be one of: 'sum', 'mean', 'count', 'min', 'max'.\n"
        "- CRITICAL: All required fields in traces must be present: x_column, y_column, name, chart_type, aggregation.\n"
        "- CRITICAL: x_column and y_column must be STRINGS (column names), not arrays or lists.\n"
        "- CRITICAL: For multiple charts, each chart can have different filters based on user requirements.\n"
        "- CRITICAL: If user mentions different filters for different charts, apply them to the respective charts.\n"
        "- CRITICAL: Only include filters when user explicitly mentions filtering, sorting, or finding specific things.\n"
        "- CRITICAL: Do NOT add filters automatically - only when user context clearly indicates filtering is needed.\n"
        "- CRITICAL: For filters: If user mentions a filter column but no specific values, use {\"ColumnName\": []}. If user mentions specific values, use {\"ColumnName\": [\"Value1\", \"Value2\"]}. Use empty object {} when no filtering is needed.\n"
        "- CRITICAL: smart_response must be intelligent and insightful, providing:\n"
        "  * What the chart will show (data insights, trends, patterns)\n"
        "  * Performance implications (data size, processing complexity)\n"
        "  * Business value and actionable insights\n"
        "  * Suggestions for further analysis or chart improvements\n"
        "  * Technical details about the visualization approach\n"
        f"USER INPUT: {user_prompt}\n"
        f"AVAILABLE_FILES_WITH_COLUMNS: {json.dumps(available_files_with_columns)}\n"
        f"CONTEXT: {context}\n"
        "\n"
        "--- AVAILABLE FILES AND COLUMNS ---\n"
        "Here are all the files available for charting with their column information:\n"
        f"{json.dumps(available_files_with_columns, indent=2)}\n"
        "\n"
        "--- COLUMN METADATA ---\n"
        f"{_build_column_metadata_section(available_files_with_columns, file_analysis_data)}\n"
        "\n"
        "--- INSTRUCTIONS FOR LLM ---\n"
        "1. Analyze the user's request to identify which files they want to chart\n"
        "2. Use the column information above to determine the best x/y columns\n"
        "3. If the user's request is unclear, suggest appropriate files based on their description\n"
        "4. Always verify that the suggested files exist in the available files list\n"
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
        "\"file_name\": \"exact_file_path_from_available_files\","
        "\"data_source\": \"exact_file_path_from_available_files\","
        "\"message\": \"Chart configuration completed successfully\","
        "\"reasoning\": \"Brief explanation of chart choices\","
        "\"used_memory\": true,"
        "\"smart_response\": \"User-friendly message about the chart created\""
        "}"
        "REMEMBER - Return ONLY valid JSON (no prose, no markdown, no code blocks).\n"
    )

def build_data_question_prompt(user_prompt: str, available_files_with_columns: dict, context: str, file_analysis_data: dict = None, file_info_section: str = "") -> str:
    """
    Minimal data Q&A path returning JSON suggestions; kept short for large prompts.
    """
    return (
        "Return ONLY valid JSON (no prose, no markdown).\n"
        f"USER INPUT: {user_prompt}\n"
        f"AVAILABLE_FILES_WITH_COLUMNS: {json.dumps(available_files_with_columns)}\n"
        f"FILE_ANALYSIS_DATA: {json.dumps(file_analysis_data)}\n"
        
        f"CONTEXT: {context}\n"
        "Output shape:\n"
        "{"
        "\"success\": false,"
        "\"suggestions\": [\"...\"],"
        "\"message\": \"...\","
        "\"reasoning\": \"...\","
        "\"file_analysis\": {\"total_files\":\"number\",\"numeric_columns\":[\"...\"],\"categorical_columns\":[\"...\"],\"chart_tips\":[\"...\"]},"
        "\"next_steps\": [\"...\"],"
        "\"smart_response\": \"...\""
        "}"
    )

def build_smart_prompt(user_prompt: str, available_files_with_columns: dict, context: str, file_analysis_data: dict = None) -> str:
    logger.info(f"Building smart prompt for: {user_prompt[:1000]}...")
    
    # 🔍 CONSOLE LOGGING: AI prompt building stage
    print(f"🔍 AI PROMPT BUILDING:")
    print(f"   User prompt: {user_prompt[:100]}...")
    print(f"   Available files: {list(available_files_with_columns.keys())}")
    print(f"   Context length: {len(context)}")
    
    is_chart_request = _detect_chart_request(user_prompt)
    has_filter_intent = _detect_filter_intent(user_prompt)
    
    print(f"   Is chart request: {is_chart_request}")
    print(f"   Has filter intent: {has_filter_intent}")
    
    if is_chart_request:
        print(f"   📊 Building chart prompt with filter support...")
        return build_chart_prompt(user_prompt, available_files_with_columns, context, file_analysis_data)
    
    print(f"   ❓ Building data question prompt...")
    return build_data_question_prompt(user_prompt, available_files_with_columns, context, file_analysis_data, "")



# ------------------------------------------------------------------------------
# LLM call (unchanged shape; keep low temperature)
# ------------------------------------------------------------------------------

def call_chart_llm(api_url: str, model_name: str, bearer_token: str, prompt: str) -> str:
    """
    Call the LLM API to generate chart configuration (JSON-only prompted).
    """
    import requests

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
    resp = requests.post(api_url, headers=headers, json=payload, timeout=120)
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
    
    # 🔍 CONSOLE LOGGING: JSON extraction stage
    print(f"🔍 AI JSON EXTRACTION:")
    print(f"   Response length: {len(response) if response else 0}")
    print(f"   User prompt: {user_prompt[:50]}...")
    
    if not response:
        print(f"   ❌ Empty response from LLM")
        return {
            "success": False,
            "message": "Empty response from LLM",
            "suggestions": ["Retry the request with clearer chart requirements"]
        }

    # Extract JSON from response (handles markdown code blocks)
    raw = _extract_outer_json_text(response)
    print(f"   Raw JSON extracted: {raw[:200]}...")
    
    try:
        obj = json.loads(raw)
        logger.info(f"✅ Successfully extracted JSON from LLM response")
        logger.info(f"🔍 Extracted JSON: {json.dumps(obj, indent=2)}")
        
        # 🔍 CONSOLE LOGGING: Filter analysis in extracted JSON
        print(f"   ✅ JSON extraction successful")
        if isinstance(obj, dict) and 'chart_json' in obj:
            charts = obj.get('chart_json', [])
            print(f"   📊 Found {len(charts)} charts")
            for i, chart in enumerate(charts):
                filters = chart.get('filters', {})
                print(f"   📊 Chart {i+1} filters: {filters}")
                if filters:
                    print(f"   🔍 Chart {i+1} has filters with values: {filters}")
                else:
                    print(f"   🔍 Chart {i+1} has no filters")
        
        return obj
    except Exception as e:
        logger.error(f"❌ JSON parse failed: {e}")
        logger.error(f"🔍 Raw response that failed: {response[:500]}...")
        print(f"   ❌ JSON parse failed: {e}")
        print(f"   🔍 Raw response that failed: {response[:500]}...")
        
        # Try one more time with simple brace matching
        try:
            start = response.find("{")
            end = response.rfind("}")
            if start != -1 and end != -1 and end > start:
                obj = json.loads(response[start:end+1])
                logger.info(f"✅ Successfully extracted JSON with fallback method")
                print(f"   ✅ JSON extraction successful with fallback method")
                return obj
        except Exception as e2:
            logger.error(f"❌ Fallback JSON parse also failed: {e2}")
            print(f"   ❌ Fallback JSON parse also failed: {e2}")
        
        return {
            "success": False,
            "message": "Could not parse JSON from LLM response",
            "suggestions": ["Enable JSON mode or reduce temperature and retry"]
        }
