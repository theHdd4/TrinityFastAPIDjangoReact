import json
import re
import requests
from typing import Dict, Any, List, Optional


def build_prompt(
    user_prompt: str,
    available_files_with_columns: dict,
    context: str,
    file_details: Optional[Dict[str, Any]] = None,
    other_files: Optional[List[str]] = None,
    matched_columns: Optional[Dict[str, List[str]]] = None
) -> str:
    """Return the LLM prompt for the concat assistant."""
    file_details_json = json.dumps(file_details, indent=2) if file_details else "None"
    other_files_line = ", ".join(other_files) if other_files else "None"
    matched_columns_json = json.dumps(matched_columns, indent=2) if matched_columns else "None"
    return f"""You are an intelligent concatenation assistant with perfect memory access to complete conversation history.

USER INPUT: "{user_prompt}"

AVAILABLE FILES WITH COLUMNS:
{json.dumps(available_files_with_columns, indent=2)}

RELEVANT FILE METADATA:
{file_details_json}

MATCHED COLUMNS (based on prompt):
{matched_columns_json}

OTHER AVAILABLE FILES (REFERENCE ONLY): {other_files_line}

COMPLETE CONVERSATION CONTEXT:
{context}

TASK: Analyze the user input along with the complete conversation history to provide the most appropriate response.

SUCCESS RESPONSE (when you have all required info):
{{
  "success": true,
  "concat_json": {{
    "bucket_name": "trinity",
    "file1": ["exact_filename1.csv"],
    "file2": ["exact_filename2.csv"],
    "concat_direction": "vertical"
  }},
  "message": "Concatenation configuration completed successfully",
  "smart_response": "I've configured the concatenation operation for you. The files will be combined using the specified direction. You can now proceed with the concatenation or make adjustments as needed.",
  "reasoning": "Found all required components with context from history",
  "used_memory": true
}}

GENERAL RESPONSE (for questions, file info, suggestions):
{{
  "success": false,
  "suggestions": [
    "Here's what I found about your files:",
    "Available files for concatenation: [list relevant files]",
    "Concatenation direction options: vertical (stack), horizontal (append columns)",
    "Based on your previous patterns, I recommend:",
    "To complete concatenation, specify: files + direction + optional column alignment",
    "Or say 'yes' to use my suggestions"
  ],
  "message": "Here's what I can help you with",
  "smart_response": "I'd be happy to help you with concatenation operations! Tell me which files you'd like to combine and whether you prefer stacking rows (vertical) or adding columns side by side (horizontal).",
  "reasoning": "Providing helpful information and guidance",
  "file_analysis": {{
    "total_files": "number",
    "recommended_pairs": ["file1 + file2"],
    "concat_tips": ["Ensure columns align for horizontal concatenation", "Clean column names before merging"]
  }},
  "next_steps": [
    "Ask about specific files or columns",
    "Request concatenation suggestions",
    "Specify your concatenation requirements",
    "Say 'yes' to use my recommendations"
  ]
}}

INTELLIGENCE RULES:

1. **CRITICAL: ALWAYS include "smart_response" field in your JSON output** - This is the user-friendly message displayed in the chat
2. USE COMPLETE HISTORY: Reference previous interactions, successful concatenations, and user preferences
3. SMART FILE SELECTION: Analyze user's request to identify the most appropriate files from the available list
4. CONTEXT AWARENESS: Understand "yes", "no", "use those", "concatenate them" based on conversation
5. MEMORY UTILIZATION: Suggest files user has successfully used before
6. PATTERN RECOGNITION: Identify user's preferred concatenation direction (vertical vs horizontal)
7. VALIDATION: Always ensure suggested files exist in the AVAILABLE FILES AND COLUMNS section

"""


def call_llm(api_url: str, model_name: str, bearer_token: str, prompt: str) -> str:
    """Call the LLM and return the raw response string."""
    payload = {
        "model": model_name,
        "messages": [{"role": "user", "content": prompt}],
        "stream": False,
        "options": {"temperature": 0.2, "top_p": 0.9, "num_predict": 1000},
    }
    headers = {"Authorization": f"Bearer {bearer_token}", "Content-Type": "application/json"}
    response = requests.post(api_url, json=payload, headers=headers, timeout=300)
    response.raise_for_status()
    return response.json().get("message", {}).get("content", "")


def extract_json(response: str):
    """Extract a JSON object from the LLM response."""
    if not response:
        return None
    cleaned = re.sub(r"<think>.*?</think>", "", response, flags=re.DOTALL)
    cleaned = re.sub(r"<reasoning>.*?</reasoning>", "", cleaned, flags=re.DOTALL)
    cleaned = re.sub(r"```json\s*", "", cleaned)
    cleaned = re.sub(r"```\s*", "", cleaned)
    json_patterns = [r"\{[^{}]*\{[^{}]*\}[^{}]*\}", r"\{[^{}]+\}", r"\{.*?\}(?=\s*$)", r"\{.*\}"]
    for pattern in json_patterns:
        matches = re.findall(pattern, cleaned, re.DOTALL)
        for match in matches:
            try:
                parsed = json.loads(match)
                if isinstance(parsed, dict) and ("success" in parsed or "suggestions" in parsed):
                    return parsed
            except json.JSONDecodeError:
                continue
    try:
        start_idx = cleaned.find("{")
        if start_idx != -1:
            brace_count = 0
            end_idx = start_idx
            for i in range(start_idx, len(cleaned)):
                if cleaned[i] == "{":
                    brace_count += 1
                elif cleaned[i] == "}":
                    brace_count -= 1
                    if brace_count == 0:
                        end_idx = i + 1
                        break
            if end_idx > start_idx:
                potential = cleaned[start_idx:end_idx]
                return json.loads(potential)
    except Exception:
        pass
    try:
        fixed = re.sub(r",\s*}", "}", cleaned)
        fixed = re.sub(r",\s*]", "]", cleaned)
        match = re.search(r"\{.*\}", fixed, re.DOTALL)
        if match:
            return json.loads(match.group())
    except Exception:
        pass
    return None
