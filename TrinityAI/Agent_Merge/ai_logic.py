import json
import re
import requests


def build_prompt(user_prompt: str, files_with_columns: dict[str, list[str]], context: str) -> str:
    """Return the LLM prompt for the merge assistant."""
    merge_json_template = """{
  \"bucket_name\": \"trinity\",
  \"file1\": [\"exact_filename.csv\"],
  \"file2\": [\"exact_filename.csv\"],
  \"join_columns\": [\"column_name\"],
  \"join_type\": \"inner\"
}"""
    return f"""You are a JSON-only merge assistant. You MUST respond with ONLY valid JSON, no other text.

CURRENT USER INPUT: \"{user_prompt}\"

AVAILABLE FILES WITH COLUMNS:
{json.dumps(files_with_columns, indent=2)}

{context}

CRITICAL RULES:
1. Respond with ONLY JSON - no explanations, no text before or after
2. Read the JSON HISTORY to understand context
3. If user says \"yes\" or agrees \u2192 Use information from the LAST system response
4. Build complete configuration from ALL available information
5. Only single files we are able to take so if multiple files in json return success false and ask to select the files

REQUIRED RESPONSE FORMAT (choose one):

For SUCCESS (when you have all required information):
{{
  \"success\": true,
  \"merge_json\": {merge_json_template},
  \"source\": \"Brief explanation\"
}}

For PARTIAL (when missing information):
{{
  \"success\": false,
  \"suggestions\": [
    \"What you understand so far\",
    \"What is still needed\",
    \"Specific next step\"
  ],
  \"context_from_history\": \"Information from previous interactions\",
  \"still_needed\": \"Specific missing information\"
}}

RESPOND WITH ONLY THE JSON:"""


def call_llm(api_url: str, model_name: str, bearer_token: str, prompt: str) -> str:
    """Call the LLM and return the raw response string."""
    payload = {
        "model": model_name,
        "messages": [{"role": "user", "content": prompt}],
        "stream": False,
        "options": {"temperature": 0.2, "top_p": 0.9, "num_predict": 1000},
    }
    headers = {"Authorization": f"Bearer {bearer_token}", "Content-Type": "application/json"}
    response = requests.post(api_url, json=payload, headers=headers, timeout=90)
    response.raise_for_status()
    return response.json().get("message", {}).get("content", "")


def extract_json(response: str):
    """Extract a JSON object from the LLM response."""
    if not response:
        return None
    cleaned = re.sub(r"<think>.*?</think>", "", response, flags=re.DOTALL)
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
        fixed = re.sub(r",\s*]", "]", fixed)
        match = re.search(r"\{.*\}", fixed, re.DOTALL)
        if match:
            return json.loads(match.group())
    except Exception:
        pass
    return None
