# ai_logic.py - DataFrame Operations Agent AI Logic

import re
import json
import logging
from typing import Dict, Any, Optional, List, Union

logger = logging.getLogger("smart.dataframe_operations.ai")

# Import RAG module for loading API endpoints and examples from JSON files
try:
    from .rag import format_api_endpoints_for_prompt, format_operation_examples_for_prompt
    logger.info("✅ RAG module imported successfully")
except ImportError as e:
    logger.error(f"❌ Failed to import RAG module: {e}")
    # Fallback functions if RAG module fails
    def format_api_endpoints_for_prompt() -> str:
        return "API endpoints documentation not available"
    def format_operation_examples_for_prompt() -> str:
        return "Operation examples not available"

# Note: Example JSON schemas are now loaded from rag/operation_examples.json
# This keeps the code clean and makes examples easy to update

# 🔧 RAG SYSTEM: API Endpoints and Examples now loaded from JSON files
# See: rag/api_endpoints.json and rag/operation_examples.json
# This makes the AI logic cleaner and easier to maintain

def build_dataframe_operations_prompt(
    user_prompt: str,
    available_files_with_columns: dict,
    context: str,
    current_df_state: dict = None,
    file_details: Optional[Dict[str, Any]] = None,
    other_files: Optional[List[str]] = None,
) -> str:
    """
    Build a concise prompt for the LLM to generate DataFrame operations configurations.
    Optimized for better LLM comprehension with minimal verbosity.
    """
    logger.info(f"Building DataFrame operations prompt for: {user_prompt[:100]}...")
    logger.info(f"📚 Conversation context length: {len(context)} characters")
    
    # Build simplified file info
    file_list = []
    if available_files_with_columns:
        for file_name, file_data in available_files_with_columns.items():
            if isinstance(file_data, dict):
                columns = file_data.get('columns', [])
                display_name = file_data.get('display_name') or file_name.split('/')[-1] if isinstance(file_name, str) else file_name
            elif isinstance(file_data, list):
                columns = file_data
                display_name = file_name.split('/')[-1] if isinstance(file_name, str) and '/' in file_name else file_name
            else:
                columns = []
                display_name = file_name
            file_list.append(f"{display_name} → {file_name} ({len(columns)} cols)")
    file_summary = ", ".join(file_list[:5])  # Only show first 5 files
    if len(file_list) > 5:
        file_summary += f" + {len(file_list) - 5} more"

    # 🔧 OPTIMIZATION: Only include file details if comprehensive details are available
    # If file_details contains comprehensive info, skip redundant file listings
    file_details_json = "None"
    if file_details and isinstance(file_details, dict):
        # Check if this is comprehensive file details (has file_id, columns, etc.)
        if "file_id" in file_details or "columns" in file_details:
            # This is comprehensive details - use it, but don't duplicate file listings
            file_details_json = json.dumps(file_details, indent=2)
            # Skip the redundant FILES DETAIL section if we have comprehensive details
            files_detail_section = ""  # Empty to reduce duplication
        else:
            file_details_json = json.dumps(file_details, indent=2)
            files_detail_section = f"FILES DETAIL: {json.dumps(available_files_with_columns, indent=2)}\n"
    else:
        files_detail_section = f"FILES DETAIL: {json.dumps(available_files_with_columns, indent=2)}\n"
    
    # Only include other_files if no comprehensive details (to reduce size)
    other_files_summary = ""
    if not file_details_json or file_details_json == "None":
        other_files_summary = f"OTHER AVAILABLE FILES (REFERENCE ONLY): {', '.join(other_files) if other_files else 'None'}\n"
    
    prompt = f"""You are a DataFrame operations assistant. Generate JSON configs for data manipulation tasks.

USER REQUEST: "{user_prompt}"
AVAILABLE FILES: {file_summary}
{files_detail_section}FILE METADATA: {file_details_json}
{other_files_summary}

{f"CONVERSATION: {context[:500]}..." if len(context) > 500 else f"CONVERSATION: {context}" if context else ""}

KEY RULES:
1. ALWAYS start with /load_cached operation (operation_id "1") using EXACT KEY from FILES DETAIL (full path)
2. Use "auto_from_previous" for df_id in subsequent operations
3. Find file by matching user's words to file keys (e.g., user says "uk beans" → use the FULL KEY containing "UK_Beans")
4. CRITICAL: object_name parameter MUST be the complete key from FILES DETAIL, NOT just the filename
5. ONLY generate operations user explicitly requests - NO random filters
6. 🔧 CRITICAL FOR COLUMN NAMES: If FILE METADATA contains comprehensive file details with 'columns' list:
   - ALWAYS use EXACT column names from the 'columns' list (case-sensitive, including spaces and special characters)
   - For filter operations, verify column names match EXACTLY - check 'unique_values' or 'sample_data' for valid filter values
   - Column names may contain spaces, underscores, hyphens - use them EXACTLY as shown in 'columns' list
   - If user mentions a column that doesn't match exactly, find the closest match from 'columns' list
7. If no comprehensive file details available, use exact column names from file schema (case-sensitive)
8. REQUIRED JSON KEYS: success, dataframe_config (when success true), execution_plan, and smart_response must ALL be present so the UI always has a friendly response

AVAILABLE OPERATIONS:
• /load_cached: Load file (params: object_name)
• /filter_rows: Filter data (params: df_id, column, value)
• /sort: Sort data (params: df_id, column, direction)
• /insert_column: Add column (params: df_id, name, position)
• /delete_column: Remove column (params: df_id, name)
• /rename_column: Rename column (params: df_id, old_name, new_name)
• /move_column: Reorder column (params: df_id, name, to_index)
• /apply_formula: Calculate column (params: df_id, target_column, formula)

FORMULA FUNCTIONS (for apply_formula):
Math: SUM(a,b), DIV(a,b), PROD(a,b), AVG(a,b), ROUND(x,n)
Logic: IF(cond,true,false), ISNULL(x)
Text: UPPER(x), LOWER(x), STR_REPLACE(x,"old","new")
Data: FILLNA(x,val), ZSCORE(x)

RESPONSE FORMAT (success):
{{
  "success": true,
  "dataframe_config": {{
    "operations": [
      {{
        "operation_id": "1",
        "api_endpoint": "/load_cached",
        "operation_name": "load_cached",
        "description": "Load data file",
        "parameters": {{"object_name": "exact_filename_from_available_files"}},
        "execute_order": 1,
        "depends_on": []
      }},
      {{
        "operation_id": "2",
        "api_endpoint": "/sort",
        "operation_name": "sort",
        "description": "Sort by column",
        "parameters": {{"df_id": "auto_from_previous", "column": "ColumnName", "direction": "desc"}},
        "execute_order": 2,
        "depends_on": ["1"]
      }}
    ]
  }},
  "execution_plan": {{
    "auto_execute": true,
    "execution_mode": "sequential",
    "error_handling": "stop_on_error"
  }},
  "smart_response": "I'll load your file and sort it by ColumnName."
}}

RESPONSE FORMAT (unclear request):
{{
  "success": false,
  "message": "Need more details",
  "smart_response": "I can help with DataFrame operations. Available files: {file_summary}. What would you like to do? (load, filter, sort, add/rename columns, apply formulas)",
  "suggestions": ["Load [filename]", "Filter [column] for [value]", "Sort by [column]"]
}}

EXAMPLES:
Q: "load uk beans"
A: {{"success": true, "dataframe_config": {{"operations": [{{"operation_id": "1", "api_endpoint": "/load_cached", "parameters": {{"object_name": "Quant_Matrix_AI_Schema/blank/New Custom Project 8/D0_KHC_UK_Beans.arrow"}}, "execute_order": 1, "depends_on": []}}]}}, "execution_plan": {{"auto_execute": true, "execution_mode": "sequential", "error_handling": "stop_on_error"}}, "smart_response": "Loading UK Beans data file."}}

Q: "load uk beans and sort by year desc"
A: {{"success": true, "dataframe_config": {{"operations": [{{"operation_id": "1", "api_endpoint": "/load_cached", "parameters": {{"object_name": "Quant_Matrix_AI_Schema/blank/New Custom Project 8/D0_KHC_UK_Beans.arrow"}}, "execute_order": 1, "depends_on": []}}, {{"operation_id": "2", "api_endpoint": "/sort", "parameters": {{"df_id": "auto_from_previous", "column": "Year", "direction": "desc"}}, "execute_order": 2, "depends_on": ["1"]}}]}}, "execution_plan": {{"auto_execute": true, "execution_mode": "sequential", "error_handling": "stop_on_error"}}, "smart_response": "Loading UK Beans and sorting by Year (descending)."}}

CRITICAL:
- Return ONLY valid JSON, no extra text
- Include "smart_response" field (user sees this)
- Set auto_execute: true by default
- object_name MUST be the COMPLETE KEY from FILES DETAIL (e.g., "Quant_Matrix_AI_Schema/blank/Project 8/D0_KHC_UK_Beans.arrow")
- NEVER use just the filename (e.g., "D0_KHC_UK_Beans.arrow") - ALWAYS use full path from available_files keys
- Use exact column names from file schema (case-sensitive)

RESPOND WITH JSON ONLY."""

    return prompt

def call_dataframe_operations_llm(api_url: str, model_name: str, bearer_token: str, prompt: str) -> str:
    """Call the LLM API with the DataFrame operations prompt"""
    import requests
    
    headers = {
        "Authorization": f"Bearer {bearer_token}",
        "Content-Type": "application/json"
    }
    
    data = {
        "model": model_name,
        "messages": [
            {"role": "user", "content": prompt}
        ],
        "temperature": 0.1,
        "max_tokens": 3000,  # Increased for complex configurations
        "stream": False
    }
    
    try:
        logger.info("="*100)
        logger.info("🌐 LLM API REQUEST DETAILS:")
        logger.info("="*100)
        logger.info(f"URL: {api_url}")
        logger.info(f"Model: {model_name}")
        logger.info(f"Temperature: {data.get('temperature')}")
        logger.info(f"Max Tokens: {data.get('max_tokens')}")
        logger.info(f"Prompt Length: {len(data.get('messages', [{}])[0].get('content', ''))} characters")
        logger.info("="*100)
        
        response = requests.post(api_url, headers=headers, json=data, timeout=300)
        response.raise_for_status()
        
        response_text = response.text.strip()
        logger.info("="*100)
        logger.info("🌐 LLM API RESPONSE DETAILS:")
        logger.info("="*100)
        logger.info(f"Status Code: {response.status_code}")
        logger.info(f"Response Length: {len(response_text)} characters")
        logger.info(f"Response Headers: {dict(response.headers)}")
        logger.info("="*100)
        
        # Handle streaming response format (same as explore agent)
        if response_text.count('{') > 1:
            logger.info("🔄 Detected streaming response format, extracting final content...")
            logger.info(f"Number of JSON objects detected: {response_text.count('{')}")
            
            lines = response_text.split('\n')
            final_content = ""
            chunk_count = 0
            
            for line in lines:
                line = line.strip()
                if line and line.startswith('{') and line.endswith('}'):
                    try:
                        chunk = json.loads(line)
                        chunk_count += 1
                        if "message" in chunk and "content" in chunk["message"]:
                            content = chunk["message"]["content"]
                            if content and content not in ["<think>", "\n", "Okay"]:
                                final_content += content
                                logger.info(f"  Chunk {chunk_count}: Added {len(content)} characters")
                    except json.JSONDecodeError:
                        continue
            
            if final_content:
                logger.info(f"✅ Extracted {len(final_content)} characters from {chunk_count} streaming chunks")
                logger.info(f"Final extracted content:\n{final_content}")
                return final_content
            else:
                logger.warning("⚠️ No valid content found in streaming response, returning raw response")
                return response_text
        
        # Handle single JSON response
        try:
            logger.info("📦 Parsing single JSON response...")
            result = response.json()
            logger.info(f"Parsed JSON structure keys: {list(result.keys())}")
            
            if "choices" in result and len(result["choices"]) > 0:
                content = result["choices"][0]["message"]["content"]
                logger.info(f"✅ Extracted content from choices[0].message.content ({len(content)} chars)")
                return content
            elif "message" in result and "content" in result["message"]:
                content = result["message"]["content"]
                logger.info(f"✅ Extracted content from message.content ({len(content)} chars)")
                return content
            else:
                logger.error(f"❌ Unexpected response structure: {list(result.keys())}")
                logger.error(f"Full response: {json.dumps(result, indent=2)}")
                return str(result)
                
        except requests.exceptions.JSONDecodeError as json_error:
            logger.error(f"JSON decode error: {json_error}")
            logger.error(f"Response content: {response_text[:500]}...")
            
            # Try to extract content from the raw response
            if '"content":' in response_text:
                start = response_text.find('"content":"') + 11
                end = response_text.find('"', start)
                if start > 10 and end > start:
                    extracted_content = response_text[start:end]
                    extracted_content = extracted_content.replace('\\"', '"').replace('\\n', '\n').replace('\\t', '\t')
                    return extracted_content
            
            return response_text
            
    except requests.exceptions.ConnectionError as e:
        logger.error(f"Could not reach AI service at {api_url}: {e}")
        raise Exception(f"Could not reach AI service. Please check if the LLM service is running at {api_url}")
    except requests.exceptions.Timeout as e:
        logger.error(f"AI service timeout: {e}")
        raise Exception(f"AI service timeout. The request took too long to complete.")
    except requests.exceptions.RequestException as e:
        logger.error(f"Request failed: {e}")
        raise Exception(f"AI service request failed: {str(e)}")
    except Exception as e:
        logger.error(f"DataFrame Operations LLM API call failed: {e}")
        raise Exception(f"AI service error: {str(e)}")

def _generate_default_smart_response(available_files_with_columns: dict) -> str:
    """
    Build a friendly default smart_response to ensure UI messaging never fails.
    """
    file_info = ""
    if available_files_with_columns:
        file_info_parts = []
        for file_name, file_data in available_files_with_columns.items():
            if isinstance(file_data, dict):
                columns = file_data.get('columns', [])
            elif isinstance(file_data, list):
                columns = file_data
            else:
                columns = []
            display_name = file_name.split('/')[-1] if isinstance(file_name, str) and '/' in file_name else file_name
            column_list = ', '.join(columns[:8])
            if len(columns) > 8:
                column_list += f" ... (+{len(columns) - 8} more)"
            file_info_parts.append(f"• **{display_name}** ({len(columns)} columns): {column_list}")
        file_info = '\n'.join(file_info_parts)
    
    return f"""I'd be happy to help you with DataFrame operations! Here are your available files and their columns:

📁 **Available Files:**
{file_info}

I can help you with:
• **Data Loading**: Load any of these files for processing
• **Filtering**: Filter rows based on column values (e.g., 'Filter Country column for USA')
• **Sorting**: Sort data by any column (e.g., 'Sort by Revenue descending')
• **Column Operations**: Add, delete, rename, or transform columns
• **Formulas**: Apply calculations using =SUM(), =AVG(), =DIV(), etc.
• **Data Transformations**: Clean, normalize, or restructure your data
• **Saving**: Save processed results to new files

💡 **How to use your data:**
For example, with your files you could ask:
- 'Load [filename] and show me the first 10 rows'
- 'Filter [filename] where [column] equals [value]'
- 'Sort [filename] by [column] in descending order'
- 'Add a new column to [filename] calculating [formula]'

What specific operations would you like me to perform and which file should I use?"""

def extract_dataframe_operations_json(text: str, available_files_with_columns: dict) -> Optional[Dict[str, Any]]:
    """
    Extract JSON from LLM response with comprehensive validation for DataFrame operations.
    """
    logger.info("="*100)
    logger.info("🔍 JSON EXTRACTION PROCESS START")
    logger.info("="*100)
    
    if not text or not text.strip():
        logger.warning("❌ JSON Extraction - Empty or None text provided")
        return None
    
    text = text.strip()
    logger.info(f"Input text length: {len(text)} characters")
    logger.info(f"First 500 chars: {text[:500]}")
    logger.info(f"Last 500 chars: {text[-500:]}")
    
    # Remove <think> tags if present
    if '<think>' in text and '</think>' in text:
        think_end = text.find('</think>')
        if think_end != -1:
            removed_text = text[:think_end + 8]
            text = text[think_end + 8:].strip()
            logger.info(f"✂️ Removed <think> tags ({len(removed_text)} chars)")
            logger.info(f"Text after removing think tags (first 500 chars): {text[:500]}")
    
    # JSON extraction patterns (same as explore agent)
    json_patterns = [
        r'```json\s*(\{.*?\})\s*```',
        r'```\s*(\{.*?\})\s*```',
    ]
    
    logger.info(f"🔎 Trying {len(json_patterns)} JSON extraction patterns...")
    for i, pattern in enumerate(json_patterns):
        logger.info(f"Pattern {i+1}: {pattern[:50]}...")
        matches = re.findall(pattern, text, re.DOTALL | re.IGNORECASE)
        logger.info(f"  Found {len(matches)} matches")
        for j, match in enumerate(matches):
            try:
                logger.info(f"  Attempting to parse match {j+1} ({len(match)} chars)...")
                result = json.loads(match)
                logger.info(f"✅ Successfully parsed JSON from pattern {i+1}, match {j+1}")
                logger.info(f"Extracted JSON keys: {list(result.keys())}")
                validated = _validate_dataframe_operations_json(result, available_files_with_columns)
                if validated:
                    logger.info("✅ JSON validation passed!")
                    return validated
                else:
                    logger.warning("⚠️ JSON validation failed")
            except json.JSONDecodeError as e:
                logger.debug(f"❌ JSON decode error with pattern {i+1}: {e}")
                continue
    
    # Fallback: Find JSON by counting braces
    logger.info("🔎 Pattern matching failed, trying brace counting method...")
    def find_complete_json(text):
        start = text.find('{')
        if start == -1:
            return None
        
        brace_count = 0
        for i, char in enumerate(text[start:], start):
            if char == '{':
                brace_count += 1
            elif char == '}':
                brace_count -= 1
                if brace_count == 0:
                    return text[start:i+1]
        return None
    
    complete_json = find_complete_json(text)
    if complete_json:
        logger.info(f"Found JSON by brace counting ({len(complete_json)} chars)")
        logger.info(f"JSON preview: {complete_json[:200]}...")
        try:
            result = json.loads(complete_json)
            logger.info("✅ Successfully parsed JSON using brace counting")
            logger.info(f"Extracted JSON keys: {list(result.keys())}")
            validated = _validate_dataframe_operations_json(result, available_files_with_columns)
            if validated:
                logger.info("✅ JSON validation passed!")
                return validated
            else:
                logger.warning("⚠️ JSON validation failed")
        except json.JSONDecodeError as e:
            logger.error(f"❌ JSON decode error with brace counting: {e}")
    else:
        logger.warning("⚠️ No JSON found using brace counting")
    
    # Final fallback: Try bracket matching
    logger.info("🔎 Brace counting failed, trying bracket matching method...")
    try:
        start = text.find('{')
        end = text.rfind('}')
        if start != -1 and end != -1 and end > start:
            json_str = text[start:end+1]
            logger.info(f"Found JSON by bracket matching ({len(json_str)} chars)")
            logger.info(f"JSON preview: {json_str[:200]}...")
            result = json.loads(json_str)
            logger.info("✅ Successfully parsed JSON using bracket matching")
            logger.info(f"Extracted JSON keys: {list(result.keys())}")
            validated = _validate_dataframe_operations_json(result, available_files_with_columns)
            if validated:
                logger.info("✅ JSON validation passed!")
                return validated
            else:
                logger.warning("⚠️ JSON validation failed")
        else:
            logger.warning(f"⚠️ No valid JSON brackets found (start={start}, end={end})")
    except json.JSONDecodeError as e:
        logger.error(f"❌ JSON decode error with bracket matching: {e}")
    
    # If all parsing fails, create helpful fallback response
    logger.error("="*100)
    logger.error("❌ ALL JSON EXTRACTION METHODS FAILED")
    logger.error("="*100)
    logger.error("Could not extract valid JSON from LLM response")
    logger.error(f"Response length: {len(text)} characters")
    logger.error(f"Response preview (first 500): {text[:500]}")
    logger.error(f"Response preview (last 500): {text[-500:]}")
    
    # Try to extract smart_response from malformed JSON
    smart_response = text.strip()
    if '"smart_response":' in text:
        try:
            start = text.find('"smart_response":"') + 18
            end = text.find('"', start)
            if start > 17 and end > start:
                smart_response = text[start:end]
                smart_response = smart_response.replace('\\"', '"').replace('\\n', '\n').replace('\\t', '\t')
        except:
            pass
    
    # Create helpful fallback with detailed file information
    if not smart_response or smart_response == text.strip():
        smart_response = _generate_default_smart_response(available_files_with_columns)
    
    logger.info("Using LLM response as smart_response fallback")
    
    return {
        "success": False, 
        "message": "Could not parse LLM response as valid JSON",
        "smart_response": smart_response,
        "suggestions": [
            "Try being more specific about what DataFrame operations you want",
            "Ask about filtering, sorting, adding columns, or transforming data",
            "Specify which file you want to work with",
            "Describe the exact changes you want to make to your data"
        ],
        "next_steps": [
            "Tell me which file you want to work with",
            "Specify what operations you need (filter, sort, transform, etc.)",
            "Describe your desired outcome",
            "Ask about specific DataFrame manipulations"
        ],
        "raw_response": text
    }

def _validate_dataframe_operations_json(result: Dict[str, Any], available_files_with_columns: dict) -> Optional[Dict[str, Any]]:
    """
    Validate the extracted JSON for DataFrame operations requirements.
    """
    logger.info("="*100)
    logger.info("🔍 VALIDATING EXTRACTED JSON")
    logger.info("="*100)
    
    if not isinstance(result, dict):
        logger.warning("❌ Validation failed: Extracted JSON is not a dictionary")
        logger.warning(f"Type: {type(result)}")
        return None
    
    logger.info(f"✅ JSON is a dictionary with {len(result)} keys: {list(result.keys())}")

    # Guarantee smart_response exists so downstream UI never encounters missing responses
    smart_response_value = result.get('smart_response')
    if not isinstance(smart_response_value, str) or not smart_response_value.strip():
        logger.warning("⚠️ smart_response missing or empty, generating default smart_response")
        result['smart_response'] = _generate_default_smart_response(available_files_with_columns)
    
    # Check for required fields
    if 'success' not in result:
        logger.warning("❌ Validation failed: Missing 'success' field in JSON")
        return None
    
    logger.info(f"✅ 'success' field present: {result.get('success')}")
    
    # If success is True, validate dataframe_config
    if result.get('success') and 'dataframe_config' not in result:
        logger.warning("❌ Validation failed: Missing 'dataframe_config' field in successful response")
        return None
    
    # Validate dataframe_config structure if present
    if 'dataframe_config' in result:
        logger.info("✅ 'dataframe_config' field present")
        df_config = result['dataframe_config']
        
        if not isinstance(df_config, dict):
            logger.warning("❌ Validation failed: dataframe_config is not a dictionary")
            logger.warning(f"Type: {type(df_config)}")
            return None
        
        logger.info(f"✅ dataframe_config is a dictionary with {len(df_config)} keys: {list(df_config.keys())}")
        
        # Check for required fields in dataframe_config - only operations is truly required
        required_fields = ['operations']
        for field in required_fields:
            if field not in df_config:
                logger.warning(f"❌ Validation failed: dataframe_config missing required field: {field}")
                return None
        
        logger.info(f"✅ All required fields present in dataframe_config")
        
        # Validate operations list
        operations = df_config.get('operations', [])
        if not isinstance(operations, list):
            logger.warning("❌ Validation failed: operations is not a list")
            logger.warning(f"Type: {type(operations)}")
            return None
        
        logger.info(f"✅ operations is a list with {len(operations)} operations")
        
        # Validate each operation
        for i, op in enumerate(operations):
            logger.info(f"Validating operation {i+1}/{len(operations)}...")
            if not isinstance(op, dict):
                logger.warning(f"❌ Validation failed: Operation {i} is not a dictionary")
                return None
            
            logger.info(f"  Operation {i+1} keys: {list(op.keys())}")
            
            # Check for minimal required operation fields
            required_op_fields = ['operation_id', 'api_endpoint', 'parameters']
            for field in required_op_fields:
                if field not in op:
                    logger.warning(f"❌ Validation failed: Operation {i} missing required field: {field}")
                    return None
            
            logger.info(f"  ✅ Operation {i+1} has all required fields")
            logger.info(f"    - ID: {op.get('operation_id')}")
            logger.info(f"    - Endpoint: {op.get('api_endpoint')}")
            logger.info(f"    - Parameters: {list(op.get('parameters', {}).keys())}")
        
        # Validate file references if present
        if 'source_data' in df_config:
            logger.info("Validating source_data field...")
            source_data = df_config['source_data']
            if isinstance(source_data, dict):
                if source_data.get('type') == 'file_upload' and 'file_path' in source_data:
                    file_path = source_data['file_path']
                    logger.info(f"Checking if file '{file_path}' exists in available files...")
                    # Check if file exists in available files
                    if available_files_with_columns:
                        file_found = False
                        for available_file in available_files_with_columns.keys():
                            if file_path in available_file or available_file.endswith(file_path):
                                file_found = True
                                logger.info(f"✅ File found: {available_file}")
                                break
                        if not file_found:
                            logger.warning(f"⚠️ File '{file_path}' not found in available files (continuing anyway)")
                            logger.warning(f"Available files: {list(available_files_with_columns.keys())}")
                            # Don't return None here, just log warning - let frontend handle

    # 🔧 Ensure execution_plan always exists with auto_execute True
    execution_plan = result.get('execution_plan')
    if not isinstance(execution_plan, dict):
        logger.info("⚠️ execution_plan missing or invalid, adding default execution_plan with auto_execute: true")
        result['execution_plan'] = {
            "auto_execute": True,
            "execution_mode": "sequential",
            "error_handling": "stop_on_error"
        }
    elif not execution_plan.get('auto_execute'):
        logger.info("⚠️ execution_plan.auto_execute is False or missing, setting to True")
        result['execution_plan']['auto_execute'] = True
    
    logger.info(f"✅ execution_plan: {result.get('execution_plan')}")
    
    logger.info("="*100)
    logger.info("✅ DATAFRAME OPERATIONS JSON VALIDATION PASSED")
    logger.info("="*100)
    return result
