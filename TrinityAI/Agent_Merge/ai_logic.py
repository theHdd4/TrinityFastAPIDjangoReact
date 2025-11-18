# ai_logic_merge.py
import json
import re
import requests
import logging
from typing import Dict, Any, List, Optional

logger = logging.getLogger("smart.merge.ai_logic")

def build_merge_prompt(
    user_prompt: str,
    available_files_with_columns: dict,
    context: str,
    file_details: Optional[Dict[str, Any]] = None,
    other_files: Optional[List[str]] = None,
    matched_columns: Optional[Dict[str, List[str]]] = None,
) -> str:
    """
    Build the LLM prompt for the merge assistant.
    """
    file_details_json = json.dumps(file_details, indent=2) if file_details else "None"
    other_files_line = ", ".join(other_files) if other_files else "None"
    matched_columns_json = json.dumps(matched_columns, indent=2) if matched_columns else "None"
    prompt = f"""You are an intelligent merge assistant with perfect memory access to complete conversation history.

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
"""
    prompt += """

GENERAL RESPONSE (for questions, file info, suggestions):
{
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
  "file_analysis": {
    "total_files": "number",
    "recommended_pairs": ["file1 + file2"],
    "common_columns": ["col1", "col2"],
    "merge_tips": ["tip1", "tip2"]
  },
  "next_steps": [
    "Ask about specific files or columns",
    "Request merge suggestions",
    "Specify your merge requirements",
    "Say 'yes' to use my recommendations"
  ]
}

INTELLIGENCE RULES:

1. **CRITICAL: ALWAYS include "smart_response" field in your JSON output** - This is the user-friendly message displayed in the chat
2. USE COMPLETE HISTORY: Reference previous interactions, successful configs, and user preferences
3. SMART FILE SELECTION: Analyze user's request to identify the most appropriate files from the available list
4. CONTEXT AWARENESS: Understand "yes", "no", "use those", "merge them" based on conversation
5. MEMORY UTILIZATION: Suggest files user has successfully used before
6. PATTERN RECOGNITION: Identify user's preferred file combinations and join types
7. AUTOMATIC COLUMN DETECTION: When files are selected, automatically find common columns between them
8. SMART JOIN TYPE: Use "outer" as default if no join type specified, otherwise use user preference
9. FILE VALIDATION: Always ensure suggested files exist in the AVAILABLE FILES AND COLUMNS section

"""
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
            "num_predict": 4000,  # Increased to handle long smart_response with file listings
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
    SIMPLIFIED JSON extraction - only check for required keys:
    1. Clean response (remove <think> tags)
    2. Find JSON using brace counting (respecting strings)
    3. Parse JSON
    4. Validate: success=true needs smart_response+merge_json, success=false needs smart_response
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
