# ai_logic_create_transform.py
import json
import re
import os
import requests
import logging
from typing import Optional, Dict, Union, List, Any
from datetime import datetime

logger = logging.getLogger(__name__)

def build_prompt_create_transform(
    user_prompt: str,
    session_id: str,
    files_with_columns: dict,
    supported_ops_detailed: str,
    op_format: str,
    history_string: str,
    file_details: Optional[Dict[str, Any]] = None,
    other_files: Optional[List[str]] = None,
    matched_columns: Optional[Dict[str, List[str]]] = None
) -> str:
    """
    Build a clean, focused prompt for the create/transform agent.
    """
    
    # Build file information section
    file_info_section = _build_file_info_section(files_with_columns)
    file_details_section = ""
    if file_details:
        file_details_section = f"\n## Relevant File Metadata:\n{json.dumps(file_details, indent=2)}\n"
    matched_columns_section = ""
    if matched_columns:
        matched_columns_section = f"\n## Matched Columns From Prompt:\n{json.dumps(matched_columns, indent=2)}\n"
    other_files_section = ""
    if other_files:
        other_files_section = f"\n## Other Available Files (Reference Only):\n{', '.join(other_files)}\n"
    
    # Build history context if available
    history_section = ""
    if history_string and history_string.strip() != "No history.":
        history_section = f"\n## Previous Conversation:\n{history_string}\n"
    
    return f"""You are a data transformation specialist. Convert the user's request into a JSON configuration for creating or transforming columns in data files.

## Available Files and Columns:
{file_info_section}
{file_details_section}{matched_columns_section}{other_files_section}
## Supported Operations:
{supported_ops_detailed}

{history_section}
## Session ID:
{session_id}

## User Request:
{user_prompt}

## JSON Output Requirements:
1. Return ONLY JSON (no markdown, no prose).
2. JSON must contain:
   - "success": boolean
   - "message": string
   - "json": array of operation configs when success=true
   - "smart_response": human-readable summary of actions taken or next steps
3. Each operation config MUST follow this schema exactly:
{op_format}

## Mandatory Rules:
1. Include "bucket_name": "trinity" in every operation config.
2. All column names MUST be lowercase in the final output (normalize them if needed).
3. When referencing files, use the exact keys from the Available Files section (full path).
4. Do NOT invent columns or files. Only use what is listed.
5. Maintain operation_id as strings ("1", "2", etc.) and ensure execute_order matches the order.
6. For derived columns, include clear descriptions and formulas when applicable.
7. If user intent is unclear, return success=false with helpful suggestions in smart_response.

## Respond with JSON only.
"""

def _analyze_files_for_context(files_with_columns: dict) -> str:
    """Analyze available files and create intelligent context."""
    if not files_with_columns:
        return "❌ No files available for analysis."
    
    analysis = []
    analysis.append(f"📁 **Total Files Available: {len(files_with_columns)}**")
    
    # Group files by type and analyze columns
    file_groups = {}
    for filename, columns in files_with_columns.items():
        file_type = _categorize_file(filename, columns)
        if file_type not in file_groups:
            file_groups[file_type] = []
        file_groups[file_type].append((filename, columns))
    
    for file_type, files in file_groups.items():
        analysis.append(f"\n🔹 **{file_type.upper()} Files:**")
        for filename, columns in files:
            numeric_cols = [col for col in columns if _is_numeric_column(col)]
            categorical_cols = [col for col in columns if _is_categorical_column(col)]
            
            analysis.append(f"  📄 **{filename}** ({len(columns)} columns)")
            if numeric_cols:
                analysis.append(f"    🔢 Numeric: {', '.join(numeric_cols[:5])}{'...' if len(numeric_cols) > 5 else ''}")
            if categorical_cols:
                analysis.append(f"    🏷️ Categorical: {', '.join(categorical_cols[:5])}{'...' if len(categorical_cols) > 5 else ''}")
    
    return "\n".join(analysis)

def _build_operation_suggestions(files_with_columns: dict) -> str:
    """Build intelligent operation suggestions based on available data."""
    if not files_with_columns:
        return "❌ No operation suggestions available."
    
    suggestions = []
    suggestions.append("🚀 **INTELLIGENT OPERATION SUGGESTIONS:**")
    
    # Analyze each file for operation opportunities
    for filename, columns in files_with_columns.items():
        numeric_cols = [col for col in columns if _is_numeric_column(col)]
        categorical_cols = [col for col in columns if _is_categorical_column(col)]
        
        if numeric_cols:
            suggestions.append(f"\n📊 **{filename}** - Numeric Operations:")
            if len(numeric_cols) >= 2:
                suggestions.append(f"  ➕ **Add**: Combine {', '.join(numeric_cols[:3])} → 'total_sum'")
                suggestions.append(f"  ➖ **Subtract**: {numeric_cols[0]} - {numeric_cols[1]} → 'difference'")
                suggestions.append(f"  ✖️ **Multiply**: {', '.join(numeric_cols[:3])} → 'product'")
                suggestions.append(f"  ➗ **Divide**: {numeric_cols[0]} / {numeric_cols[1]} → 'ratio'")
            
            # Time series operations if date columns exist
            date_cols = [col for col in columns if _is_date_column(col)]
            if date_cols and len(numeric_cols) >= 1:
                suggestions.append(f"  📈 **Trend**: {numeric_cols[0]} over time → 'trend_component'")
                suggestions.append(f"  🌊 **Seasonality**: {numeric_cols[0]} seasonal patterns → 'seasonal_component'")
        
        if categorical_cols:
            suggestions.append(f"\n🏷️ **{filename}** - Categorical Operations:")
            suggestions.append(f"  🔢 **Dummy Variables**: Convert {categorical_cols[0]} → 'dummy_{categorical_cols[0]}'")
    
    return "\n".join(suggestions)

def _build_file_info_section(files_with_columns: dict) -> str:
    """Build a clean file information section for the prompt."""
    if not files_with_columns:
        return "No files available."
    
    file_info = []
    for file_path, file_data in files_with_columns.items():
        # Handle both dict and list formats
        if isinstance(file_data, dict):
            columns = file_data.get('columns', [])
            file_name = file_data.get('file_name', os.path.basename(file_path))
        elif isinstance(file_data, list):
            columns = file_data
            file_name = os.path.basename(file_path)
        else:
            columns = []
            file_name = os.path.basename(file_path)
        
        # Use just the filename (not full path)
        display_name = file_name.split('/')[-1] if '/' in file_name else file_name
        
        # Show all columns for better matching
        column_list = ', '.join(columns)
        file_info.append(f"- {display_name} ({len(columns)} columns): {column_list}")
    
    return "\n".join(file_info)

def _categorize_file(filename: str, columns: List[str]) -> str:
    """Categorize file based on name and content."""
    filename_lower = filename.lower()
    
    if any(keyword in filename_lower for keyword in ['mayo', 'beans', 'bagel']):
        return "Product Data"
    elif any(keyword in filename_lower for keyword in ['concat', 'merge']):
        return "Combined Data"
    elif any(keyword in filename_lower for keyword in ['create', 'transform']):
        return "Transformed Data"
    else:
        return "Raw Data"

def _is_numeric_column(column_name: str) -> bool:
    """Check if column is likely numeric based on name."""
    numeric_keywords = [
        'volume', 'sales', 'value', 'price', 'cost', 'revenue', 'amount',
        'quantity', 'count', 'number', 'total', 'sum', 'avg', 'mean',
        'd1', 'd2', 'd3', 'd4', 'd5', 'd6', 'av1', 'av2', 'av3', 'av4', 'av5', 'av6',
        'ev1', 'ev2', 'ev3', 'ev4', 'ev5', 'ev6'
    ]
    return any(keyword in column_name.lower() for keyword in numeric_keywords)

def _is_categorical_column(column_name: str) -> bool:
    """Check if column is likely categorical based on name."""
    categorical_keywords = [
        'market', 'channel', 'region', 'category', 'subcategory', 'brand',
        'variant', 'packtype', 'ppg', 'packsize', 'year', 'month', 'week',
        'date', 'brcatid', 'prepdate', 'projcode'
    ]
    return any(keyword in column_name.lower() for keyword in categorical_keywords)

def _is_date_column(column_name: str) -> bool:
    """Check if column is likely a date column based on name."""
    date_keywords = ['date', 'year', 'month', 'week', 'prepdate']
    return any(keyword in column_name.lower() for keyword in date_keywords)

def call_llm_create_transform(
    api_url: str,
    model_name: str,
    bearer_token: str,
    prompt: str,
    retry: int = 3
) -> str:
    """Call the LLM API for create/transform with enhanced error handling."""
    headers = {"Authorization": f"Bearer {bearer_token}", "Content-Type": "application/json"}
    payload = {
        "model": model_name,
        "messages": [{"role": "user", "content": prompt}],
        "options": {"temperature": 0.2, "top_p": 0.95},
        "stream": False
    }
    
    for attempt in range(retry):
        try:
            logger.info(f"Calling LLM API (attempt {attempt+1}/{retry})")
            r = requests.post(api_url, json=payload, headers=headers, timeout=300)
            r.raise_for_status()
            
            response = r.json()
            content = response.get("message", {}).get("content", "")
            
            if content:
                logger.info(f"LLM API call successful (attempt {attempt+1})")
                return content
            else:
                logger.warning(f"LLM API returned empty content (attempt {attempt+1})")
                
        except requests.exceptions.Timeout:
            logger.error(f"LLM API timeout (attempt {attempt+1}/{retry})")
        except requests.exceptions.RequestException as e:
            logger.error(f"LLM API request failed (attempt {attempt+1}/{retry}): {e}")
        except Exception as e:
            logger.error(f"LLM API unexpected error (attempt {attempt+1}/{retry}): {e}")
    
    logger.error("All LLM API attempts failed")
    return ""

def extract_json_from_response(response: str) -> Optional[Union[Dict, list]]:
    """Extract JSON object from LLM raw response with enhanced parsing."""
    if not response:
        return None
    
    # Clean the response
    cleaned = response.strip()
    
    # Try multiple extraction strategies
    extraction_methods = [
        _extract_json_triple_backticks,
        _extract_json_braces,
        _extract_json_aggressive,
        _extract_json_fallback
    ]
    
    for method in extraction_methods:
        try:
            result = method(cleaned)
            if result:
                logger.info(f"JSON extracted successfully using {method.__name__}")
                # Validate the extracted JSON before returning
                if _validate_create_transform_json(result):
                    return result
                else:
                    logger.warning("Extracted JSON failed validation")
        except Exception as e:
            logger.debug(f"Method {method.__name__} failed: {e}")
            continue
    
    logger.warning("Failed to extract valid JSON from LLM response")
    return None

def _validate_create_transform_json(json_data: Union[Dict, list]) -> bool:
    """Validate that the extracted JSON has the correct structure for create-transform operations."""
    try:
        if isinstance(json_data, dict):
            # Check if it's a success response
            if json_data.get("success") and "json" in json_data:
                json_data_content = json_data["json"]
                
                if isinstance(json_data_content, list):
                    for item in json_data_content:
                        if not _validate_create_config(item):
                            return False
                elif isinstance(json_data_content, dict):
                    if not _validate_create_config(json_data_content):
                        return False
                else:
                    return False
                    
            elif json_data.get("success") and "json" not in json_data:
                # Success=true but no json is invalid
                return False
                
        return True
    except Exception as e:
        logger.error(f"JSON validation error: {e}")
        return False

def _validate_create_config(config: Dict) -> bool:
    """Validate a single create-transform configuration object."""
    try:
        # Check required fields for new simple format
        required_fields = ["bucket_name", "object_name"]
        for field in required_fields:
            if field not in config or not config[field]:
                return False
        
        # Validate that at least one operation exists
        operation_keys = [key for key in config.keys() if key.endswith(('_0', '_1', '_2', '_3', '_4', '_5')) and not key.endswith('_rename')]
        if not operation_keys:
            return False
            
        # Validate that each operation has a corresponding rename
        for op_key in operation_keys:
            rename_key = f"{op_key}_rename"
            if rename_key not in config or not config[rename_key]:
                return False
                
            # Validate operation columns are not empty
            if not config[op_key] or config[op_key].strip() == "":
                return False
                
        return True
    except Exception as e:
        logger.error(f"Config validation error: {e}")
        return False

def _extract_json_triple_backticks(cleaned: str) -> Optional[Union[Dict, list]]:
    """Extract JSON from triple backticks."""
    match = re.search(r"```(?:json)?\s*(\{.*?\})\s*```", cleaned, flags=re.DOTALL)
    if match:
        return json.loads(match.group(1))
    return None

def _extract_json_braces(cleaned: str) -> Optional[Union[Dict, list]]:
    """Extract JSON from balanced braces."""
    start, end = cleaned.find("{"), cleaned.rfind("}")
    if start != -1 and end != -1 and start < end:
        try:
            return json.loads(cleaned[start:end+1])
        except json.JSONDecodeError:
            pass
    return None

def _extract_json_aggressive(cleaned: str) -> Optional[Union[Dict, list]]:
    """Aggressive JSON extraction using multiple patterns."""
    patterns = [
        r"\{[^{}]*\{[^{}]*\}[^{}]*\}",  # Nested objects
        r"\{[^{}]+\}",                   # Simple objects
        r"\{.*?\}(?=\s*$)",             # Objects at end
        r"\{.*\}"                        # Any object
    ]
    
    for pattern in patterns:
        matches = re.findall(pattern, cleaned, re.DOTALL)
        for match in matches:
            try:
                return json.loads(match)
            except json.JSONDecodeError:
                continue
    return None

def _extract_json_fallback(cleaned: str) -> Optional[Union[Dict, list]]:
    """Fallback JSON extraction for edge cases."""
    # Try to find the largest valid JSON object
    json_objects = []
    
    # Find all potential JSON objects
    brace_count = 0
    start_pos = -1
    
    for i, char in enumerate(cleaned):
        if char == '{':
            if brace_count == 0:
                start_pos = i
            brace_count += 1
        elif char == '}':
            brace_count -= 1
            if brace_count == 0 and start_pos != -1:
                json_str = cleaned[start_pos:i+1]
                try:
                    obj = json.loads(json_str)
                    json_objects.append((len(json_str), obj))
                except json.JSONDecodeError:
                    pass
                start_pos = -1
    
    # Return the largest valid JSON object
    if json_objects:
        json_objects.sort(key=lambda x: x[0], reverse=True)
        return json_objects[0][1]
    
    return None
