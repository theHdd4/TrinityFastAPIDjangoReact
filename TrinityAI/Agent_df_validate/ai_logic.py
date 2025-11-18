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
    """Return the LLM prompt for the data validation and dtype conversion assistant."""
    file_details_json = json.dumps(file_details, indent=2) if file_details else "None"
    other_files_line = ", ".join(other_files) if other_files else "None"
    matched_columns_json = json.dumps(matched_columns, indent=2) if matched_columns else "None"
    return f"""You are an intelligent data validation and dtype conversion assistant with perfect memory access to complete conversation history.

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

TASK: Analyze the user input along with the complete conversation history. Your primary goal is to load the file the user mentions into the data upload atom. Additionally, if the user explicitly requests dtype changes (e.g., "change volume to integer", "convert date column"), apply those changes. If the user only mentions loading a file without dtype changes, just load the file and proceed.

SUPPORTED DTYPES:
- "int64": Integer numbers
- "float64": Floating point numbers
- "object": String/text data
- "datetime64": Date and time data (can include format: {{"dtype": "datetime64", "format": "YYYY-MM-DD"}})
- "bool": Boolean values

SUCCESS RESPONSE (when you have file name):
{{
  "success": true,
  "validate_json": {{
    "file_name": "exact_filename.csv",
    "dtype_changes": {{
      "column_name_1": "int64",
      "column_name_2": "float64",
      "column_name_3": {{"dtype": "datetime64", "format": "YYYY-MM-DD"}},
      "column_name_4": "object"
    }}
  }},
  
NOTE: dtype_changes can be an empty object {{}} if user only wants to load the file without dtype conversions.
  "message": "Data validation and dtype conversion configuration completed successfully",
  "smart_response": "I'll help you validate and convert data types in a two-step process:\n\n📂 **Step 1: Load File**\nI'll load \"exact_filename.csv\" into the data upload atom so you can see it in the UI.\n\n🔄 **Step 2: Apply Dtype Conversions**\nI'll convert the following columns:\n• column_name_1 → int64 (for integer values)\n• column_name_2 → float64 (for decimal numbers)\n• column_name_3 → datetime64 with format YYYY-MM-DD (for date/time data)\n• column_name_4 → object (for text/string data)\n\n💡 **Insights:**\nThese conversions will ensure your data types are correct for downstream operations. After conversion, you'll see the updated file in the UI with the new data types applied.\n\n✅ The file will be ready for use in other operations once the conversion is complete.",
  "reasoning": "Found all required components with context from history",
  "used_memory": true
}}

GENERAL RESPONSE (for questions, file info, suggestions):
{{
  "success": false,
  "suggestions": [
    "Here's what I found about your files:",
    "Available files for validation: [list relevant files]",
    "Current data types in your files: [list types]",
    "Recommended conversions: [suggestions based on data analysis]",
    "To complete validation, specify: file + columns to convert + target types",
    "Or say 'yes' to use my suggestions"
  ],
  "message": "Here's what I can help you with",
  "smart_response": "I'd be happy to help you validate and convert data types! Tell me which file you'd like to validate and I'll analyze the current data types and suggest appropriate conversions.",
  "reasoning": "Providing helpful information and guidance",
  "file_analysis": {{
    "total_files": "number",
    "recommended_conversions": ["column1: int64", "column2: datetime64"],
    "validation_tips": ["Check for mixed types in columns", "Ensure date formats are consistent"]
  }},
  "next_steps": [
    "Ask about specific files or columns",
    "Request dtype conversion suggestions",
    "Specify your validation requirements",
    "Say 'yes' to use my recommendations"
  ]
}}

INTELLIGENCE RULES:

1. **CRITICAL: ALWAYS include "smart_response" field in your JSON output** - This is the user-friendly message displayed in the chat
2. USE COMPLETE HISTORY: Reference previous interactions, successful conversions, and user preferences
3. SMART FILE SELECTION: Analyze user's request to identify the most appropriate file from the available list
4. CONTEXT AWARENESS: Understand "yes", "no", "use those", "convert them" based on conversation
5. MEMORY UTILIZATION: Suggest conversions user has successfully used before
6. PATTERN RECOGNITION: Identify user's preferred dtype patterns
7. VALIDATION: Always ensure suggested files exist in the AVAILABLE FILES AND COLUMNS section
8. DTYPE INTELLIGENCE: 
   - ONLY apply dtype changes if user explicitly requests them (e.g., "change volume to integer", "convert date column")
   - If user only mentions loading a file without dtype changes, set dtype_changes to empty object {{}}
   - When dtype changes are requested, analyze column names and sample data to suggest appropriate types
   - For date columns, suggest datetime64 with appropriate format
   - For numeric columns with decimals, suggest float64
   - For whole numbers, suggest int64
   - For text data, suggest object
9. CONVERSION SAFETY: Only suggest conversions that are safe and won't lose data
10. FILE LOADING PRIORITY: The primary goal is to load the file. Dtype changes are optional and only applied when explicitly requested by the user.

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

