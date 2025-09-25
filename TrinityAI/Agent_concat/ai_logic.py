import json
import re
import requests


def build_prompt(user_prompt: str, available_files: list[str], context: str) -> str:
    """Return the LLM prompt for the concat assistant."""
    return f"""You are an intelligent concatenation assistant with perfect memory access to complete conversation history.

USER INPUT: "{user_prompt}"

AVAILABLE FILES:
{json.dumps(available_files, indent=2)}

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
    "Based on your previous patterns, I recommend:",
    "To complete concatenation, specify: files + direction",
    "Or say 'yes' to use my suggestions"
  ],
  "message": "Here's what I can help you with",
  "smart_response": "I can help you concatenate your data files! Based on your available files, I can suggest the best file combinations and concatenation strategies. What files would you like to combine?",
  "reasoning": "Providing helpful information and guidance",
  "file_analysis": {{
    "total_files": "number",
    "recommended_pairs": ["file1 + file2"],
    "concat_tips": ["tip1", "tip2"]
  }},
  "next_steps": [
    "Ask about specific files",
    "Request concatenation suggestions",
    "Specify your concatenation requirements",
    "Say 'yes' to use my recommendations"
  ]
}}

INTELLIGENCE RULES:
1. USE COMPLETE HISTORY: Reference previous interactions, successful configs, and user preferences
2. FUZZY MATCHING: "beans" matches "D0_KHC_UK_Beans.csv"
3. CONTEXT AWARENESS: Understand "yes", "no", "use those", "combine them" based on conversation
4. MEMORY UTILIZATION: Suggest files user has successfully used before
5. PATTERN RECOGNITION: Identify user's preferred file combinations and directions

CONVERSATIONAL HANDLING:
- "yes" after suggestions → Use the suggested configuration
- "no" after suggestions → Ask for different preferences
- "use those files" → Apply to most recent file suggestion
- "combine them" → Use default vertical direction with identified files
- "horizontally" or "vertically" → Apply to most recent file context

SUGGESTION QUALITY:
- Always provide specific file names from available files
- Use memory to suggest files user has worked with before
- Explain WHY you're suggesting specific files
- Provide concrete next steps, not generic advice

EXAMPLES OF SMART BEHAVIOR:
- If user previously used "beans.csv + mayo.csv", suggest similar food files
- If user always chooses "vertical", default to that direction
- If user says "yes" after you suggested files, complete the configuration
- If user mentions partial names, match to their previous successful patterns

Return ONLY the JSON response:"""


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
