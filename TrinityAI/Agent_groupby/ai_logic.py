# ai_logic_group_by.py
import json
import re
import requests
import logging
from typing import Optional, Union, Dict, List, Any

logger = logging.getLogger("ai_logic.group_by")

def build_prompt_group_by(
    user_prompt: str,
    session_id: str,
    files_with_columns: dict,
    supported_aggs_detailed: str,
    operation_format: str,
    history_string: str,
    file_details: Optional[Dict[str, Any]] = None,
    other_files: Optional[List[str]] = None,
    matched_columns: Optional[Dict[str, List[str]]] = None,
) -> str:
    """
    Build the LLM prompt for group-by aggregation operations.
    """
    file_details_json = json.dumps(file_details, indent=2) if file_details else "None"
    other_files_line = ", ".join(other_files) if other_files else "None"
    matched_columns_json = json.dumps(matched_columns, indent=2) if matched_columns else "None"

    return f"""
You are an expert AI assistant that converts natural language into JSON for GROUP BY aggregations.

Your goal is to help the user build a valid final aggregation object interactively.

## Response JSON Structure
You MUST respond with ONLY JSON (a single object) having:

SUCCESS RESPONSE (when you have all required info):
{{
  "success": true,
  "groupby_json": {{ operation object matching format below }},
  "message": "GroupBy configuration completed successfully",
  "smart_response": "I've configured the groupby operation for you. The data will be grouped and aggregated according to your specifications. You can now proceed with the operation or make adjustments as needed.",
  "reasoning": "Found all required components with context from history",
  "used_memory": true,
  "session_id": "{session_id}"
}}

GENERAL RESPONSE (for questions, file info, suggestions):
{{
  "success": false,
  "suggestions": [
    "Here's what I found about your files:",
    "Available files for groupby: [list relevant files]",
    "Supported aggregations: [list relevant operations]",
    "Based on your previous patterns, I recommend:",
    "To complete groupby, specify: file + group columns + aggregation functions + weight columns (if needed)",
    "Or say 'yes' to use my suggestions"
  ],
  "message": "Here's what I can help you with",
  "smart_response": "I'd be happy to help you with GroupBy operations! Here are your available files and their columns: [FORMAT: **filename.arrow** (X columns) - column1, column2, column3, etc.]. I can help you group and aggregate your data. What would you like to group and aggregate?",
  "reasoning": "Providing helpful information and guidance",
  "file_analysis": {{
    "total_files": "number",
    "available_columns": ["col1", "col2"],
    "supported_aggregations": ["agg1", "agg2"],
    "groupby_tips": ["tip1", "tip2"]
  }},
  "next_steps": [
    "Ask about specific files or columns",
    "Request groupby suggestions",
    "Specify your groupby requirements",
    "Say 'yes' to use my recommendations"
  ],
  "session_id": "{session_id}"
}}

### CRITICAL SUCCESS RULES:
Only success=true when:
- object_names known and valid
- identifiers present
- at least one complete aggregation (agg + rename_to)
- if agg = weighted_mean → weight_by required
- ⚠️ ALL COLUMN NAMES MUST BE LOWERCASE (e.g., "volume", "channel", "year")
Keep/merge previous ops unless user explicitly says remove/reset.

### FILE DISPLAY RULES:
When user asks to "show files", "show all files", "show file names", "show columns", or similar:
- ALWAYS use GENERAL RESPONSE format (success: false)
- Include detailed file information in smart_response
- Format: **filename.arrow** (X columns) - column1, column2, column3, etc.
- List ALL available files with their column counts and sample columns

### Final JSON output format:
{operation_format}

---

Available files and columns:
{json.dumps(files_with_columns, indent=2)}

Relevant file metadata:
{file_details_json}

Matched columns detected from prompt:
{matched_columns_json}

Other available files (not included above):
{other_files_line}

Supported aggregations:
{supported_aggs_detailed}

Conversation History:
{history_string}

Current User Request:
"{user_prompt}"

RESPOND WITH ONLY THE JSON OBJECT.
"""


def call_llm_group_by(api_url: str, model_name: str, bearer_token: str, prompt: str, retry: int = 3) -> str:
    headers = {"Authorization": f"Bearer {bearer_token}", "Content-Type": "application/json"}
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
    for attempt in range(retry):
        try:
            r = requests.post(api_url, json=payload, headers=headers, timeout=300)
            r.raise_for_status()
            return r.json().get("message", {}).get("content", "")
        except Exception as e:
            logger.error(f"[LLM_CALL_FAIL] Attempt {attempt+1}/{retry} — {e}")
    return ""


def extract_json_group_by(response: str) -> Optional[Union[Dict, list]]:
    """
    SIMPLIFIED JSON extraction - only check for required keys:
    1. Clean response (remove <think> tags)
    2. Find JSON using brace counting (respecting strings)
    3. Parse JSON
    4. Validate: success=true needs smart_response+groupby_json, success=false needs smart_response
    """
    logger.info(f"🔍 Extracting JSON (response length: {len(response)})")
    
    if not response:
        logger.error("❌ Empty response")
        return None

    # Step 1: Clean response - remove thinking tags and code blocks
    cleaned = re.sub(r"<think>.*?</think>", "", response, flags=re.DOTALL)
    cleaned = re.sub(r"<reasoning>.*?</reasoning>", "", cleaned, flags=re.DOTALL)
    cleaned = re.sub(r"```json\s*", "", cleaned)
    cleaned = re.sub(r"```\s*", "", cleaned)
    cleaned = cleaned.strip()
    
    logger.info(f"📋 Cleaned response length: {len(cleaned)}")
    
    # Step 2: Try multiple extraction methods (like dataframe operations)
    
    # Method 1: Try regex patterns first
    json_patterns = [
        r'```json\s*(\{.*?\})\s*```',
        r'```\s*(\{.*?\})\s*```',
    ]
    
    for pattern in json_patterns:
        matches = re.findall(pattern, cleaned, re.DOTALL | re.IGNORECASE)
        for match in matches:
            try:
                result = json.loads(match)
                logger.info("✅ Successfully extracted JSON using pattern matching")
                return result
            except json.JSONDecodeError as e:
                logger.debug(f"JSON decode error with pattern {pattern}: {e}")
                continue

    # Method 2: Try brace counting
    try:
        start_idx = cleaned.find("{")
        if start_idx == -1:
            logger.error("❌ No opening brace found")
            return None
        
        # Count braces (respecting strings to avoid counting braces inside strings)
        brace_count = 0
        in_string = False
        escape_next = False
        end_idx = start_idx
        
        for i in range(start_idx, len(cleaned)):
            char = cleaned[i]
            
            # Handle escape sequences (\", \\, etc.)
            if escape_next:
                escape_next = False
                continue
            if char == '\\':
                escape_next = True
                continue
            
            # Track if we're inside a string (to ignore braces in strings)
            if char == '"':
                in_string = not in_string
                continue
            
            # Only count braces outside of strings
            if not in_string:
                if char == "{":
                    brace_count += 1
                elif char == "}":
                    brace_count -= 1
                    if brace_count == 0:
                        end_idx = i + 1
                        break
        
        if brace_count != 0:
            logger.error(f"❌ Unbalanced braces (remaining count: {brace_count})")
            return None
        
        # Extract and parse JSON
        json_str = cleaned[start_idx:end_idx]
        logger.info(f"📦 Extracted JSON string (length: {len(json_str)})")
        
        result = json.loads(json_str)
        logger.info("✅ Successfully extracted JSON using brace counting")
        return result
        
    except json.JSONDecodeError as e:
        logger.debug(f"Brace counting JSON decode failed: {e}")
    except Exception as e:
        logger.debug(f"Brace counting failed: {e}")

    # Method 3: Try simple bracket matching (fallback)
    try:
        start = cleaned.find('{')
        end = cleaned.rfind('}')
        if start != -1 and end != -1 and end > start:
            json_str = cleaned[start:end+1]
            result = json.loads(json_str)
            logger.info("✅ Successfully extracted JSON using bracket matching")
            return result
    except json.JSONDecodeError as e:
        logger.debug(f"Bracket matching JSON decode failed: {e}")

    # If all methods fail, return None and let fallback handle it
    logger.warning("❌ All JSON extraction methods failed")
    logger.warning(f"Response preview for debugging: {cleaned[:500]}")
    return None

