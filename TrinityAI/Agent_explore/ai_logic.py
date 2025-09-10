# ai_logic.py - Explore Agent AI Logic (Simplified Chart Maker Pattern)

import re
import json
import logging
from typing import Dict, Any, Optional

logger = logging.getLogger("smart.explore.ai")

# Example JSON that the LLM should generate - BACKEND API COMPATIBLE
# exploration_config is always a list, containing 1 or more exploration configurations
# All configurations must match the backend API requirements

EXAMPLE_SINGLE_EXPLORATION_JSON = {
    "success": True,
    "exploration_config": [
        {
            "exploration_id": "1",
            "chart_type": "bar_chart",  # Must be: bar_chart, area_bar_chart, line_chart, pie_chart, table
            "x_axis": "Brand",  # Required for line_chart, optional for others
            "y_axis": "SalesValue",  # Display purposes only
            "title": "Sales by Brand",
            "description": "Analyze sales patterns across different brands",
            "aggregation": "sum",  # Must be: sum, avg, count, min, max, weighted_avg, null, no_aggregation
            "filters": {},  # Dict format: {"column": ["value1", "value2"]}
            "dimensions": ["Brand"],  # Will become group_by in backend
            "measures": ["SalesValue"],  # Will become measures_config keys
            "weight_column": None,  # Required if using weighted_avg aggregation
            "data_summary": False,  # Set to true if user wants data summary/statistics
            "add_note": "Brand A shows the highest sales performance, indicating strong market presence and customer preference."  # AI-generated insights about the chart
        }
    ],
    "file_name": "exact_full_path_from_available_files.arrow",
    "message": "Exploration configuration completed successfully",
    "reasoning": "The query mentions sales analysis and brand comparison",
    "used_memory": True
}

EXAMPLE_MULTIPLE_EXPLORATIONS_JSON = {
    "success": True,
    "exploration_config": [
        {
            "exploration_id": "1",
            "chart_type": "bar_chart",
            "x_axis": "Brand",
            "y_axis": "SalesValue",
            "title": "Sales by Brand",
            "description": "Analyze sales patterns across different brands",
            "aggregation": "sum",
            "filters": {},
            "dimensions": ["Brand"],
            "measures": ["SalesValue"],
            "weight_column": None,
            "data_summary": False,
            "add_note": "Brand A shows the highest sales performance, indicating strong market presence and customer preference."
        },
        {
            "exploration_id": "2",
            "chart_type": "line_chart",
            "x_axis": "Date",  # Required for line_chart
            "y_axis": "SalesValue",
            "title": "Sales Trend Over Time",
            "description": "Track sales performance over time",
            "aggregation": "sum",
            "filters": {},
            "dimensions": ["Date"],
            "measures": ["SalesValue"],
            "weight_column": None,
            "data_summary": True,
            "add_note": "Sales show a clear upward trend over time, with peak performance in Q4, suggesting seasonal patterns and growth momentum."
        }
    ],
    "file_name": "exact_full_path_from_available_files.arrow",
    "message": "Multiple exploration configurations completed successfully",
    "reasoning": "User requested multiple analyses for comprehensive insights",
    "used_memory": True
}

def build_explore_prompt(user_prompt: str, available_files_with_columns: dict, context: str) -> str:
    """
    Build a comprehensive prompt for the LLM to generate exploration configurations.
    Enhanced with better error handling and smart responses.
    """
    logger.info(f"Building explore prompt for: {user_prompt[:100]}...")
    
    # Check if we have sufficient data
    has_files = available_files_with_columns and len(available_files_with_columns) > 0
    has_columns = False
    if has_files:
        for file_data in available_files_with_columns.values():
            if isinstance(file_data, dict) and 'columns' in file_data:
                has_columns = len(file_data['columns']) > 0
                break
    
    prompt = """You are an intelligent data exploration assistant with perfect memory access to complete conversation history.

USER INPUT: "{}"

AVAILABLE FILES WITH COLUMNS:
{}

COMPLETE CONVERSATION CONTEXT:
{}

TASK: Analyze the user input along with the complete conversation history to provide the most appropriate data exploration configuration.

🔧 CRITICAL INSTRUCTIONS:""".format(user_prompt, json.dumps(available_files_with_columns, indent=2), context) + """

- ALWAYS return valid JSON with exploration_config as a LIST (even for single explorations)
- NEVER return invalid JSON or malformed responses
- ALWAYS include file_name from available files
- ALWAYS use only columns that exist in the provided file data
- If you cannot create a valid exploration, return suggestions instead

🔧 UI OPTIONS:
- **data_summary**: Set to true if user wants to see data summary/statistics (default: false)
- **filter_unique**: Set to true if user wants to filter out columns with single unique value (default: false)
- **add_note**: Provide AI-generated insights about the chart data and what it means (required for all charts)

🔧 ADD_NOTE EXAMPLES:
- Bar chart: "Brand A leads with 35% of total sales, showing strong market dominance"
- Line chart: "Sales show consistent growth with 15% increase month-over-month"
- Pie chart: "Online channel represents 60% of revenue, indicating digital transformation success"

IMPORTANT: When specifying file names, ALWAYS use the EXACT full path from the AVAILABLE FILES list above. Do NOT create new file names or use placeholder names.

🔍 DATA SUFFICIENCY CHECK:
- If no files available: Return error with suggestion to upload data
- If no columns available: Return error with suggestion to check data format
- If insufficient columns for requested analysis: Return error with specific suggestions

🔍 MULTI-EXPLORATION DETECTION: Analyze if the user wants multiple explorations:
- Look for keywords: "2 analyses", "multiple explorations", "both analyses", "compare", "side by side", "dashboard"
- Look for context: "one showing X, another showing Y", "first analysis for A, second analysis for B"
- Look for numbers: "2", "two", "both", "pair of analyses"
- Look for comparison language: "compare", "versus", "and", "also", "additionally"

🔍 EXPLORATION COUNT INTELLIGENCE: 
- **Single Exploration (Default)**: When user asks for one specific analysis or general exploration
- **Two Explorations**: When user asks for comparison, multiple views, or uses language suggesting multiple analyses

🔧 IMPORTANT: Always return exploration_config as a LIST, even for single explorations

📊 SUCCESS RESPONSE (when you have all required info):
{}

📊 MULTIPLE SUCCESS RESPONSE (when user wants multiple analyses):
{}""".format(
        json.dumps(EXAMPLE_SINGLE_EXPLORATION_JSON, indent=2),
        json.dumps(EXAMPLE_MULTIPLE_EXPLORATIONS_JSON, indent=2)
    ) + """

🔍 EXPLORATION TYPES AVAILABLE:
- **pattern_analysis**: Find patterns, correlations, and relationships in data
- **trend_analysis**: Analyze time-based trends and seasonal patterns
- **outlier_detection**: Identify unusual data points and anomalies
- **statistical_summary**: Generate descriptive statistics and summaries
- **clustering_analysis**: Group similar data points together
- **comparison_analysis**: Compare different categories or time periods

📊 CHART TYPES AVAILABLE (BACKEND VALIDATED):
- **bar_chart**: Best for categorical comparisons 
- **area_bar_chart**: ask for covering area
- **line_chart**: Best for trends over time (REQUIRES x_axis)
- **pie_chart**: Best for showing proportions
- **table**: Best for detailed data display

🔧 AGGREGATION TYPES (BACKEND VALIDATED):
- **sum**: Add up values (for sales, revenue, etc.)
- **avg**: Calculate average (for ratings, scores, etc.)
- **count**: Count occurrences (for frequency analysis)
- **min**: Find minimum value
- **max**: Find maximum value
- **weighted_avg**: Weighted average (REQUIRES weight_column)
- **null**: No aggregation
- **no_aggregation**: No aggregation

🔧 BACKEND API REQUIREMENTS:
- **chart_type**: Must be one of: bar_chart, area_bar_chart, line_chart, pie_chart, table
- **x_axis**: REQUIRED for line_chart, must be in dimensions list
- **weight_column**: REQUIRED when using weighted_avg aggregation
- **filters**: Must be dict format: {{"column": ["value1", "value2"]}}
- **dimensions**: Will become group_by in backend operations
- **measures**: Will become measures_config keys in backend

📊 FAILURE RESPONSE (when you need more information):
{{
  "success": false,
  "suggestions": [
    "Please specify which columns you'd like to analyze",
    "What type of analysis are you looking for?",
    "Do you want to compare different categories or time periods?",
    "What insights are you hoping to gain from this data?"
  ],
  "message": "I need more information to create the exploration configuration",
  "file_analysis": {{
    "total_files": {},
    "available_columns": {}
  }},
  "next_steps": [
    "Specify the columns you want to analyze",
    "Choose the type of analysis (pattern, trend, comparison, etc.)",
    "Select the chart type you prefer"
  ]
}}""".format(
        len(available_files_with_columns),
        json.dumps(list(available_files_with_columns.values())[0] if available_files_with_columns else [])
    ) + """

CRITICAL: You MUST respond with ONLY valid JSON. Do not include any text before or after the JSON. Do not use <think> tags or any other formatting. Just return the JSON object directly.

RESPOND WITH VALID JSON ONLY. STRICT-  RETURN JSON ONLY.

🔧 SMART ERROR RESPONSES:
If you cannot create a valid exploration, return this format:
{
  "success": false,
  "error_type": "insufficient_data|no_files|invalid_request|missing_columns",
  "message": "Clear explanation of why exploration cannot be created",
  "suggestions": ["Specific action 1", "Specific action 2", "Specific action 3"],
  "available_columns": ["list", "of", "available", "columns"],
  "reasoning": "Why this error occurred and what user should do next"
}

🔧 SUCCESS RESPONSES:
If exploration can be created, return the standard format with:
- Clear explanation of what the output means
- What insights the user will gain
- How to interpret the results"""

    return prompt

def call_explore_llm(api_url: str, model_name: str, bearer_token: str, prompt: str) -> str:
    """Call the LLM API with the explore prompt"""
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
        "max_tokens": 2000,
        "stream": False  # 🔧 CRITICAL FIX: Disable streaming to get complete response
    }
    
    try:
        logger.info(f"🔍 LLM API Request - URL: {api_url}")
        logger.info(f"🔍 LLM API Request - Model: {model_name}")
        logger.info(f"🔍 LLM API Request - Data: {json.dumps(data, indent=2)}")
        
        response = requests.post(api_url, headers=headers, json=data, timeout=60)  # Increased timeout
        response.raise_for_status()
        
        # 🔧 CRITICAL FIX: Handle streaming response format
        response_text = response.text.strip()
        logger.info(f"🔍 LLM API Response - Status: {response.status_code}")
        logger.info(f"🔍 LLM API Response - Length: {len(response_text)} characters")
        logger.info(f"🔍 LLM API Response - Preview: {response_text[:500]}...")
        
        # Check if this is a streaming response (multiple JSON objects)
        if response_text.count('{') > 1:
            logger.info("Detected streaming response format, extracting final content...")
            
            # Parse streaming response - get the last complete message
            lines = response_text.split('\n')
            final_content = ""
            
            for line in lines:
                line = line.strip()
                if line and line.startswith('{') and line.endswith('}'):
                    try:
                        chunk = json.loads(line)
                        if "message" in chunk and "content" in chunk["message"]:
                            content = chunk["message"]["content"]
                            if content and content != "<think>" and content != "\n" and content != "Okay":
                                final_content += content
                    except json.JSONDecodeError:
                        continue
            
            if final_content:
                logger.info(f"Extracted content from streaming response: {len(final_content)} characters")
                return final_content
            else:
                logger.warning("No valid content found in streaming response")
                return response_text
        
        # Handle single JSON response
        try:
            result = response.json()
            
            # Check if the response has the expected structure
            if "choices" in result and len(result["choices"]) > 0:
                return result["choices"][0]["message"]["content"]
            elif "message" in result and "content" in result["message"]:
                return result["message"]["content"]
            else:
                logger.error(f"Unexpected response structure: {result}")
                return str(result)
                
        except requests.exceptions.JSONDecodeError as json_error:
            logger.error(f"JSON decode error: {json_error}")
            logger.error(f"Response content: {response_text[:500]}...")
            
            # Try to extract content from the raw response
            if '"content":' in response_text:
                # Find the content field and extract it
                start = response_text.find('"content":"') + 11
                end = response_text.find('"', start)
                if start > 10 and end > start:
                    extracted_content = response_text[start:end]
                    # Unescape JSON strings
                    extracted_content = extracted_content.replace('\\"', '"').replace('\\n', '\n').replace('\\t', '\t')
                    return extracted_content
            
            # If extraction fails, return the raw content
            return response_text
            
    except requests.exceptions.RequestException as e:
        logger.error(f"Request failed: {e}")
        raise
    except Exception as e:
        logger.error(f"LLM API call failed: {e}")
        raise

def extract_json(text: str, available_files_with_columns: dict) -> Optional[Dict[str, Any]]:
    """
    Extract JSON from LLM response with multiple fallback patterns.
    Enhanced to handle malformed responses better.
    """
    if not text or not text.strip():
        logger.warning("🔍 JSON Extraction - Empty or None text provided")
        return None
    
    # Clean the text
    text = text.strip()
    logger.info(f"🔍 JSON Extraction - Input length: {len(text)}")
    logger.info(f"🔍 JSON Extraction - Input preview: {text[:200]}...")
    
    # Pattern 1: Look for JSON block markers
    json_patterns = [
        r'```json\s*(\{.*?\})\s*```',
        r'```\s*(\{.*?\})\s*```',
        r'(\{.*?\})',
    ]
    
    for pattern in json_patterns:
        matches = re.findall(pattern, text, re.DOTALL | re.IGNORECASE)
        for match in matches:
            try:
                result = json.loads(match)
                if _validate_explore_config(result, available_files_with_columns):
                    logger.info("✅ Successfully extracted JSON using pattern matching")
                    return result
            except json.JSONDecodeError as e:
                logger.debug(f"JSON decode error with pattern {pattern}: {e}")
                continue
    
    # Pattern 2: Try to find JSON-like structure
    try:
        # Look for the first { and last }
        start = text.find('{')
        end = text.rfind('}')
        if start != -1 and end != -1 and end > start:
            json_str = text[start:end+1]
            result = json.loads(json_str)
            if _validate_explore_config(result, available_files_with_columns):
                logger.info("✅ Successfully extracted JSON using bracket matching")
                return result
    except json.JSONDecodeError as e:
        logger.debug(f"JSON decode error with bracket matching: {e}")
    
    # Pattern 3: Try to clean and fix common JSON issues
    try:
        # Remove any text before the first { and after the last }
        cleaned_text = text
        first_brace = cleaned_text.find('{')
        last_brace = cleaned_text.rfind('}')
        
        if first_brace != -1 and last_brace != -1 and last_brace > first_brace:
            cleaned_text = cleaned_text[first_brace:last_brace+1]
            
            # Try to fix common issues
            cleaned_text = cleaned_text.replace('\n', ' ').replace('\r', ' ')
            cleaned_text = re.sub(r'\s+', ' ', cleaned_text)  # Normalize whitespace
            
            result = json.loads(cleaned_text)
            if _validate_explore_config(result, available_files_with_columns):
                logger.info("✅ Successfully extracted JSON after cleaning")
                return result
    except json.JSONDecodeError as e:
        logger.debug(f"JSON decode error after cleaning: {e}")
    
    # Pattern 4: Try to extract just the content part if it's wrapped
    try:
        if '"content":' in text:
            # Extract content from OpenAI-style response
            content_start = text.find('"content":"') + 11
            content_end = text.find('"', content_start)
            if content_start > 10 and content_end > content_start:
                content = text[content_start:content_end]
                # Unescape the content
                content = content.replace('\\"', '"').replace('\\n', '\n').replace('\\t', '\t')
                # Try to parse the extracted content
                result = json.loads(content)
                if _validate_explore_config(result, available_files_with_columns):
                    logger.info("✅ Successfully extracted JSON from content field")
                    return result
    except json.JSONDecodeError as e:
        logger.debug(f"JSON decode error from content extraction: {e}")
    
    # Pattern 5: If all else fails, try to create a basic response from the available data
    logger.warning("Could not extract valid JSON from LLM response")
    logger.warning(f"Response preview: {text[:200]}...")
    
    # Try to create a basic exploration config from available files
    if available_files_with_columns:
        first_file = list(available_files_with_columns.keys())[0]
        columns = available_files_with_columns[first_file]
        
        # Find some basic columns for a simple exploration
        brand_col = next((col for col in columns if 'brand' in col.lower()), None)
        sales_col = next((col for col in columns if 'sales' in col.lower() or 'value' in col.lower()), None)
        
        if brand_col and sales_col:
            logger.info("Creating fallback exploration config from available columns")
            return {
                "success": True,
                "exploration_config": [
                    {
                        "exploration_id": "1",
                        "chart_type": "bar_chart",
                        "x_axis": brand_col,
                        "y_axis": sales_col,
                        "title": f"Sales by {brand_col}",
                        "description": f"Analyze sales patterns across different {brand_col.lower()}s",
                        "aggregation": "sum",
                        "filters": {},
                        "dimensions": [brand_col],
                        "measures": [sales_col]
                    }
                ],
                "file_name": first_file,
                "message": "Created basic exploration configuration from available data",
                "reasoning": "Fallback configuration based on available columns",
                "used_memory": False
            }
    
    return None

def _validate_explore_config(config: Dict[str, Any], available_files_with_columns: dict) -> bool:
    """
    Validate that the extracted configuration has the required structure and backend compatibility.
    """
    if not isinstance(config, dict):
        return False
    
    # Check for success field
    if "success" not in config:
        return False
    
    # If success is True, check for exploration_config
    if config.get("success") and "exploration_config" not in config:
        return False
    
    # If success is False, check for suggestions
    if not config.get("success") and "suggestions" not in config:
        return False
    
    # Validate file_name if present
    if "file_name" in config:
        file_name = config["file_name"]
        if file_name not in available_files_with_columns:
            logger.warning(f"File {file_name} not found in available files")
            return False
    
    # Validate exploration configurations for backend compatibility
    if config.get("success") and "exploration_config" in config:
        exploration_configs = config["exploration_config"]
        if not isinstance(exploration_configs, list):
            return False
        
        for exp_config in exploration_configs:
            if not _validate_single_exploration_config(exp_config):
                return False
    
    return True

def _validate_single_exploration_config(exp_config: Dict[str, Any]) -> bool:
    """
    Validate a single exploration configuration against backend API requirements.
    """
    if not isinstance(exp_config, dict):
        return False
    
    # Required fields
    required_fields = ["chart_type", "dimensions", "measures", "aggregation"]
    for field in required_fields:
        if field not in exp_config:
            logger.warning(f"Missing required field: {field}")
            return False
    
    # Validate chart_type
    valid_chart_types = ["bar_chart", "area_bar_chart", "line_chart", "pie_chart", "table"]
    if exp_config["chart_type"] not in valid_chart_types:
        logger.warning(f"Invalid chart_type: {exp_config['chart_type']}")
        return False
    
    # Validate aggregation
    valid_aggregations = ["sum", "avg", "count", "min", "max", "weighted_avg", "null", "no_aggregation"]
    if exp_config["aggregation"] not in valid_aggregations:
        logger.warning(f"Invalid aggregation: {exp_config['aggregation']}")
        return False
    
    # Validate line_chart requirements
    if exp_config["chart_type"] == "line_chart":
        if "x_axis" not in exp_config or not exp_config["x_axis"]:
            logger.warning("x_axis is required for line_chart")
            return False
        if exp_config["x_axis"] not in exp_config.get("dimensions", []):
            logger.warning("x_axis must be in dimensions list for line_chart")
            return False
    
    # Validate weighted_avg requirements
    if exp_config["aggregation"] == "weighted_avg":
        if "weight_column" not in exp_config or not exp_config["weight_column"]:
            logger.warning("weight_column is required for weighted_avg aggregation")
            return False
    
    # Validate filters format
    filters = exp_config.get("filters", {})
    if not isinstance(filters, dict):
        logger.warning("filters must be a dictionary")
        return False
    
    # Validate dimensions and measures are lists
    if not isinstance(exp_config.get("dimensions", []), list):
        logger.warning("dimensions must be a list")
        return False
    
    if not isinstance(exp_config.get("measures", []), list):
        logger.warning("measures must be a list")
        return False
    
    # 🔧 VALIDATE NEW FIELDS: data_summary and add_note
    # Validate data_summary (optional, must be boolean if present)
    if "data_summary" in exp_config and not isinstance(exp_config["data_summary"], bool):
        logger.warning("data_summary must be a boolean value")
        return False
    
    # Validate add_note (required, must be string)
    if "add_note" not in exp_config or not isinstance(exp_config["add_note"], str) or not exp_config["add_note"].strip():
        logger.warning("add_note is required and must be a non-empty string")
        return False
    
    return True