# ai_logic_create_transform.py
import json
import re
import requests
import logging
from typing import Optional, Dict, Union

logger = logging.getLogger(__name__)

def build_prompt_create_transform(
    user_prompt: str,
    session_id: str,
    files_with_columns: dict,
    supported_ops_detailed: str,
    op_format: str,
    history_string: str
) -> str:
    """
    Build the prompt for the create/transform combined operation agent.
    """
    return f"""
You are an expert AI assistant that converts natural language into a specific JSON format for data operations (create & transform).

Your goal is to be helpful, accurate, and guide the user to a valid final command.

## Response JSON Structure
You MUST respond with ONLY JSON (a single object) having:

SUCCESS RESPONSE (when you have all required info):
{{
  "success": true,
  "create_transform_json": [{{ operation objects matching format below }}],
  "message": "Create/Transform configuration completed successfully",
  "reasoning": "Found all required components with context from history",
  "used_memory": true,
  "session_id": "{session_id}"
}}

GENERAL RESPONSE (for questions, file info, suggestions):
{{
  "success": false,
  "suggestions": [
    "Here's what I found about your files:",
    "Available files for create/transform: [list relevant files]",
    "Supported operations: [list relevant operations]",
    "Based on your previous patterns, I recommend:",
    "To complete create/transform, specify: file + columns + operation type + parameters",
    "Or say 'yes' to use my suggestions"
  ],
  "message": "Here's what I can help you with",
  "reasoning": "Providing helpful information and guidance",
  "file_analysis": {{
    "total_files": "number",
    "available_columns": ["col1", "col2"],
    "supported_operations": ["op1", "op2"],
    "create_transform_tips": ["tip1", "tip2"]
  }},
  "next_steps": [
    "Ask about specific files or columns",
    "Request operation suggestions",
    "Specify your create/transform requirements",
    "Say 'yes' to use my recommendations"
  ],
  "session_id": "{session_id}"
}}

## Rules for success=true
1. User request must be clear, complete, valid file/columns present in available list.
2. Operations in `create_transform_json` must be from supported set.
3. `create_transform_json` is a list, but for multiple ops in same file, produce ONE object with all ops merged, numbered accordingly.
4. Append new ops to existing ops if session history provides context.
5. ⚠️ ALL COLUMN NAMES MUST BE LOWERCASE (e.g., "volume", "channel", "year")

## Rules for success=false
1. Do NOT include `create_transform_json`.
2. Suggestions must precisely ask for what's missing (file name, columns, operation type, param values, etc.).
3. Provide helpful file analysis and operation guidance.

## Operation object format:
{op_format.strip()}

## Available files and columns:

## Supported operations:
{supported_ops_detailed}

## Session history:
{history_string}

## Current user input:
"{user_prompt}"

Respond ONLY with the JSON object.
"""


def call_llm_create_transform(
    api_url: str,
    model_name: str,
    bearer_token: str,
    prompt: str,
    retry: int = 3
) -> str:
    """Call the LLM API for create/transform."""
    headers = {"Authorization": f"Bearer {bearer_token}", "Content-Type": "application/json"}
    payload = {
        "model": model_name,
        "messages": [{"role": "user", "content": prompt}],
        "options": {"temperature": 0.1},
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


def extract_json_from_response(response: str) -> Optional[Union[Dict, list]]:
    """Extract JSON object from LLM raw response string."""
    if not response:
        return None
    
    # Try triple backticks first (3 backticks)
    match = re.search(r"```(?:json)?\s*(\{.*?\})\s*```", response, flags=re.DOTALL)
    if match:
        try:
            return json.loads(match.group(1))
        except json.JSONDecodeError:
            pass

    cleaned = re.sub(r"```(?:json)?", "", response, flags=re.DOTALL).strip()
    start, end = cleaned.find("{"), cleaned.rfind("}")
    if start != -1 and end != -1:
        try:
            return json.loads(cleaned[start:end+1])
        except json.JSONDecodeError:
            pass

    # Aggressive patterns
    patterns = [
        r"\{[^{}]*\{[^{}]*\}[^{}]*\}",
        r"\{[^{}]+\}",
        r"\{.*?\}(?=\s*$)",
        r"\{.*\}"
    ]
    for pat in patterns:
        for m in re.findall(pat, cleaned, re.DOTALL):
            try:
                return json.loads(m)
            except json.JSONDecodeError:
                continue
    return None
