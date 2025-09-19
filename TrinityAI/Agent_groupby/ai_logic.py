# ai_logic_group_by.py
import json
import re
import requests
import logging
from typing import Optional, Union, Dict

logger = logging.getLogger("ai_logic.group_by")

def build_prompt_group_by(
    user_prompt: str,
    session_id: str,
    files_with_columns: dict,
    supported_aggs_detailed: str,
    operation_format: str,
    history_string: str
) -> str:
    """
    Build the LLM prompt for group-by aggregation operations.
    """
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
  "smart_response": "I can help you perform groupby operations on your data! Based on your available files, I can suggest the best grouping strategies and aggregation functions. What would you like to group and aggregate?",
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

### Final JSON output format:
{operation_format}

---

Available files and columns:
{json.dumps(files_with_columns, indent=2)}

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
        "options": {"temperature": 0.05},  # deterministic
        "stream": False
    }
    for attempt in range(retry):
        try:
            r = requests.post(api_url, json=payload, headers=headers, timeout=120)
            r.raise_for_status()
            return r.json().get("message", {}).get("content", "")
        except Exception as e:
            logger.error(f"[LLM_CALL_FAIL] Attempt {attempt+1}/{retry} — {e}")
    return ""


def extract_json_group_by(response: str) -> Optional[Union[Dict, list]]:
    """Extract JSON object from raw LLM response."""
    if not response:
        return None
    # backticks pattern (3 backticks)
    match = re.search(r"```(?:json)?\s*(\{.*?\})\s*```", response, re.DOTALL)
    if match:
        try:
            return json.loads(match.group(1))
        except json.JSONDecodeError:
            pass
    # brace search
    start, end = response.find("{"), response.rfind("}")
    if start != -1 and end != -1:
        try:
            return json.loads(response[start:end+1])
        except json.JSONDecodeError:
            pass
    # patterns
    for pat in [r"\{[^{}]*\{[^{}]*\}[^{}]*\}", r"\{[^{}]+\}", r"\{.*?\}(?=\s*$)", r"\{.*\}"]:
        for m in re.findall(pat, response, re.DOTALL):
            try:
                return json.loads(m)
            except json.JSONDecodeError:
                continue
    return None
