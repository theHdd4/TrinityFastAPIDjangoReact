# ai_logic_merge.py
import json
import re
import requests
import logging

logger = logging.getLogger("smart.merge.ai_logic")

def build_merge_prompt(user_prompt: str, available_files_with_columns: dict, context: str) -> str:
    """
    Build the LLM prompt for the merge assistant.
    """
    prompt = f"""You are an intelligent merge assistant with perfect memory access to complete conversation history.

USER INPUT: "{user_prompt}"

AVAILABLE FILES WITH COLUMNS:
{json.dumps(available_files_with_columns, indent=2)}

COMPLETE CONVERSATION CONTEXT:
{context}

TASK: Analyze the user input along with the complete conversation history to provide the most appropriate response.

SUCCESS RESPONSE (when you have all required info):
{{
  "success": true,
  "merge_json": {{
    "bucket_name": "trinity",
    "file1": ["exact_filename.csv"],
    "file2": ["exact_filename.csv"],
    "join_columns": ["common_columns_name"],
    "join_type": "outer"
  }},
  "message": "Merge configuration completed successfully",
  "smart_response": "I've configured the merge operation for you. The files will be joined using the specified columns and join type. You can now proceed with the merge or make adjustments as needed.",
  "reasoning": "Found all required components with context from history",
  "used_memory": true
}}

GENERAL RESPONSE (for questions, file info, suggestions):
{{
  "success": false,
  "suggestions": [
    "Here's what I found about your files:",
    "Available files for merge: [list relevant files]",
    "Common columns between [file1] and [file2]: [list columns]",
    "Based on your previous patterns, I recommend:",
    "To complete merge, specify: files + join columns + join type",
    "Or say 'yes' to use my suggestions"
  ],
  "message": "Here's what I can help you with",
  "smart_response": "I'd be happy to help you with Merge operations! Here are your available files and their columns: [FORMAT: **filename.arrow** (X columns) - column1, column2, column3, etc.]. I can help you merge your data files using various join strategies. What files would you like to merge?",
  "reasoning": "Providing helpful information and guidance",
  "file_analysis": {{
    "total_files": "number",
    "recommended_pairs": ["file1 + file2"],
    "common_columns": ["col1", "col2"],
    "merge_tips": ["tip1", "tip2"]
  }},
  "next_steps": [
    "Ask about specific files or columns",
    "Request merge suggestions",
    "Specify your merge requirements",
    "Say 'yes' to use my recommendations"
  ]
}}

INTELLIGENCE RULES:

1. USE COMPLETE HISTORY: Reference previous interactions, successful configs, and user preferences
2. SMART FILE SELECTION: Analyze user's request to identify the most appropriate files from the available list
3. CONTEXT AWARENESS: Understand "yes", "no", "use those", "merge them" based on conversation
4. MEMORY UTILIZATION: Suggest files user has successfully used before
5. PATTERN RECOGNITION: Identify user's preferred file combinations and join types
6. AUTOMATIC COLUMN DETECTION: When files are selected, automatically find common columns between them
7. SMART JOIN TYPE: Use "outer" as default if no join type specified, otherwise use user preference
8. FILE VALIDATION: Always ensure suggested files exist in the AVAILABLE FILES AND COLUMNS section

### FILE DISPLAY RULES:
When user asks to "show files", "show all files", "show file names", "show columns", or similar:
- ALWAYS use GENERAL RESPONSE format (success: false)
- Include detailed file information in smart_response
- Format: **filename.arrow** (X columns) - column1, column2, column3, etc.
- List ALL available files with their column counts and sample columns

COLUMN HANDLING INSTRUCTIONS:
- CRITICAL: Use ONLY the columns provided in the COLUMN ANALYSIS section and join_columns are common columns in files that has been choosen .
- The system provides you with a clear dictionary showing file names and their columns
- The dictionary format is: {{"filename.csv": ["column1", "column2", ...]}}
- Use the RECOMMENDED JOIN COLUMNS that are already identified for you
- If common columns exist, choose the most appropriate for merge otherwise choose all common columns
- If no common columns exist, inform the user that merge is not possible
- NEVER invent or assume columns that aren't in the provided file data
- The column analysis is already done - use that information directly

JOIN TYPE HANDLING:
- Default to "outer" if no join type specified

- Use "inner" if user wants only matching records
- Use "left" or "right" based on user preference for preserving one side
- Learn from user's previous successful patterns

CONVERSATIONAL HANDLING:
- "yes" after suggestions → Use the suggested configuration
- "no" after suggestions → Ask for different preferences
- "use those files" → Apply to most recent file suggestion
- "merge them" → Use default outer join with identified files and common columns
- "on column_name" → Apply to most recent file context

SUGGESTION QUALITY:
- Always provide specific file names from available files 
- Use memory to suggest files user has worked with before
- Explain WHY you're suggesting specific files and columns
- Provide concrete next steps, not generic advice

EXAMPLES OF SMART BEHAVIOR:

- Always verify file names exist in the AVAILABLE FILES AND COLUMNS before suggesting them

Return ONLY the JSON response:"""

    logger.info(f"BUILDING MERGE PROMPT:")
    logger.info(f"User Prompt: {user_prompt}")
    logger.info(f"Available Files: {list(available_files_with_columns.keys())}")
    logger.info(f"Context Length: {len(context)}")
    logger.info(f"Generated Prompt Length: {len(prompt)}")
    logger.info(f"🔍 FULL PROMPT TO AI:")
    logger.info(f"{'='*80}")
    logger.info(f"{prompt}")
    logger.info(f"{'='*80}")
    
    return prompt

def call_merge_llm(api_url: str, model_name: str, bearer_token: str, prompt: str) -> str:
    """
    Call the LLM API for merge.
    """
    logger.info(f"CALLING MERGE LLM:")
    logger.info(f"API URL: {api_url}")
    logger.info(f"Model: {model_name}")
    logger.info(f"Prompt Length: {len(prompt)}")
    
    payload = {
        "model": model_name,
        "messages": [{"role": "user", "content": prompt}],
        "stream": False,
        "options": {
            "temperature": 0.1,
            "num_predict": 1500,
            "top_p": 0.9,
            "repeat_penalty": 1.1
        }
    }
    headers = {
        "Authorization": f"Bearer {bearer_token}",
        "Content-Type": "application/json"
    }
    
    logger.info(f"🔍 API REQUEST PAYLOAD:")
    logger.info(f"{'='*80}")
    logger.info(f"URL: {api_url}")
    logger.info(f"Headers: {headers}")
    logger.info(f"Payload: {json.dumps(payload, indent=2)}")
    logger.info(f"{'='*80}")
    
    try:
        logger.info(f"Sending request to LLM...")
        response = requests.post(api_url, json=payload, headers=headers, timeout=300)
        response.raise_for_status()
        
        response_data = response.json()
        logger.info(f"LLM Response Status: {response.status_code}")
        logger.info(f"LLM Response Data Keys: {list(response_data.keys()) if isinstance(response_data, dict) else 'Not a dict'}")
        logger.info(f"🔍 FULL LLM RESPONSE DATA: {json.dumps(response_data, indent=2)}")
        
        content = response_data.get('message', {}).get('content', '')
        logger.info(f"LLM Content Length: {len(content)}")
        logger.info(f"LLM Content Preview: {content[:200]}...")
        logger.info(f"🔍 FULL LLM CONTENT: {content}")
        
        return content
        
    except Exception as e:
        logger.error(f"Error calling LLM: {e}")
        raise

def extract_json(response: str):
    """
    Extract JSON object from LLM response.
    """
    logger.info(f"EXTRACTING JSON FROM RESPONSE:")
    logger.info(f"Response Length: {len(response)}")
    logger.info(f"Response Preview: {response[:300]}...")
    
    if not response:
        logger.warning("Empty response received")
        return None

    # 🔧 FIX: Handle <think> and <reasoning> tags like concat agent
    cleaned = re.sub(r"<think>.*?</think>", "", response, flags=re.DOTALL)
    cleaned = re.sub(r"<reasoning>.*?</reasoning>", "", cleaned, flags=re.DOTALL)
    cleaned = re.sub(r"```json\s*", "", cleaned)
    cleaned = re.sub(r"```\s*", "", cleaned)
    
    logger.info(f"Cleaned Response Preview: {cleaned[:300]}...")

    json_patterns = [
        r"\{[^{}]*\{[^{}]*\}[^{}]*\}",  
        r"\{[^{}]+\}",                  
        r"\{.*?\}(?=\s*$)",             
        r"\{.*\}"                       
    ]
    
    for i, pattern in enumerate(json_patterns):
        matches = re.findall(pattern, cleaned, re.DOTALL)
        logger.info(f"Pattern {i+1} found {len(matches)} matches")
        for j, match in enumerate(matches):
            try:
                parsed = json.loads(match)
                if isinstance(parsed, dict) and ("success" in parsed or "suggestions" in parsed):
                    logger.info(f"Successfully parsed JSON with pattern {i+1}, match {j+1}")
                    logger.info(f"🔍 PARSED JSON: {json.dumps(parsed, indent=2)}")
                    logger.info(f"🔍 PARSED JSON KEYS: {list(parsed.keys())}")
                    logger.info(f"🔍 SMART_RESPONSE IN PARSED: {'smart_response' in parsed}")
                    if 'smart_response' in parsed:
                        logger.info(f"🔍 SMART_RESPONSE VALUE: '{parsed['smart_response']}'")
                    return parsed
            except json.JSONDecodeError as e:
                logger.debug(f"JSON decode failed for pattern {i+1}, match {j+1}: {e}")
                continue

    # Brace balancing fallback
    logger.info("Trying brace balancing fallback...")
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
                extracted = cleaned[start_idx:end_idx]
                logger.info(f"Brace balancing extracted: {extracted}")
                result = json.loads(extracted)
                logger.info(f"Brace balancing successful: {json.dumps(result, indent=2)}")
                return result
    except Exception as e:
        logger.error(f"Brace balancing failed: {e}")

    # 🔧 ADDITIONAL FALLBACK: Try to fix common JSON issues like concat agent
    try:
        fixed = re.sub(r",\s*}", "}", cleaned)
        fixed = re.sub(r",\s*]", "]", cleaned)
        match = re.search(r"\{.*\}", fixed, re.DOTALL)
        if match:
            result = json.loads(match.group())
            logger.info(f"Fixed JSON successful: {json.dumps(result, indent=2)}")
            return result
    except Exception as e:
        logger.error(f"Fixed JSON fallback failed: {e}")

    logger.warning("No valid JSON could be extracted")
    return None
