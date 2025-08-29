# ai_logic.py - Chart Maker AI Logic (Enhanced to match Merge Agent)

import re
import json
import logging
from typing import Dict, Any, Optional

logger = logging.getLogger("smart.chart.ai")

# Example JSON that the LLM should generate - UNIFIED APPROACH
# chart_json is always a list, containing 1 or more chart configurations

EXAMPLE_SINGLE_CHART_JSON = {
    "success": True,
    "chart_json": [
        {
            "chart_id": "1",
            "chart_type": "bar",
            "traces": [
                {
                    "x_column": "Zone",
                    "y_column": "Godrej Aer Matic",
                    "name": "Godrej Aer Matic",
                    "chart_type": "bar",
                    "aggregation": "sum",
                    "color": "#FFA07A"
                }
            ],
            "title": "Awareness by Zone",
            "x_axis": { "dataKey": "Zone", "label": "Zone", "type": "category" },
            "y_axis": { "dataKey": "Godrej Aer Matic_trace_0", "label": "Awareness", "type": "number" }
        }
    ],
    "file_name": "exact_full_path_from_available_files.arrow",
    "data_source": "exact_full_path_from_available_files.arrow",
    "message": "Chart configuration completed successfully",
    "reasoning": "The query mentions x/y and chart-related terms",
    "used_memory": True
}

EXAMPLE_MULTIPLE_CHARTS_JSON = {
    "success": True,
    "chart_json": [
        {
            "chart_id": "1",
            "title": "Sales by Region",
            "chart_type": "bar",
            "traces": [
                {
                    "x_column": "Region",
                    "y_column": "Sales",
                    "name": "Sales by Region",
                    "chart_type": "bar",
                    "aggregation": "sum",
                    "color": "#FFA07A"
                }
            ],
            "x_axis": { "dataKey": "Region", "label": "Region", "type": "category" },
            "y_axis": { "dataKey": "Sales", "label": "Sales", "type": "number" }
        },
        {
            "chart_id": "2",
            "title": "Revenue Trend Over Time",
            "chart_type": "line",
            "traces": [
                {
                    "x_column": "Date",
                    "y_column": "Revenue",
                    "name": "Revenue Trend",
                    "chart_type": "line",
                    "aggregation": "sum",
                    "color": "#458EE2"
                }
            ],
            "x_axis": { "dataKey": "Date", "label": "Date", "type": "category" },
            "y_axis": { "dataKey": "Revenue", "label": "Revenue", "type": "number" }
        }
    ],
    "file_name": "exact_full_path_from_available_files.arrow",
    "data_source": "exact_full_path_from_available_files.arrow",
    "message": "Multiple chart configuration completed successfully",
    "reasoning": "User requested multiple charts for different data views",
    "used_memory": True
}

def build_chart_prompt(user_prompt: str, available_files_with_columns: dict, context: str) -> str:
    """
    Build a comprehensive prompt for the LLM to generate chart configurations.
    Enhanced to match Merge agent's robust approach and support multiple charts.
    """
    # Clean logging - only essential info
    logger.info(f"Building chart prompt for: {user_prompt[:100]}...")
    
    prompt = f"""You are an intelligent chart generation assistant with perfect memory access to complete conversation history.

USER INPUT: "{user_prompt}"

AVAILABLE FILES WITH COLUMNS:
{json.dumps(available_files_with_columns, indent=2)}

COMPLETE CONVERSATION CONTEXT:
{context}

TASK: Analyze the user input along with the complete conversation history to provide the most appropriate chart configuration.

🔧 CRITICAL INSTRUCTIONS:
- ALWAYS return valid JSON with chart_json as a LIST (even for single charts)
- NEVER return invalid JSON or malformed responses
- ALWAYS include file_name and data_source from available files
- ALWAYS use only columns that exist in the provided file data
- If you cannot create a valid chart, return suggestions instead

IMPORTANT: When specifying file names, ALWAYS use the EXACT full path from the AVAILABLE FILES list above. Do NOT create new file names or use placeholder names like "your_file.csv" or "data.arrow". Use the exact paths shown in the available files.

For example, if available files show "client/app/project/data.arrow", use that exact path, not just "data.arrow".

🔍 MULTI-CHART DETECTION: Analyze if the user wants multiple charts:
- Look for keywords: "2 charts", "multiple charts", "both charts", "compare", "side by side", "dashboard"
- Look for context: "one showing X, another showing Y", "first chart for A, second chart for B"
- Look for numbers: "2", "two", "both", "pair of charts"
- Look for comparison language: "compare", "versus", "and", "also", "additionally"

🔍 CHART COUNT INTELLIGENCE: 
- **Single Chart (Default)**: When user asks for one specific chart or general visualization
- **Two Charts**: When user asks for comparison, multiple views, or uses language suggesting multiple charts

🔧 IMPORTANT: Always return chart_json as a LIST, even for single charts

📊 SINGLE CHART RESPONSE (when user wants one chart):
{{
  "success": true,
  "chart_json": [
    {{
      "chart_id": "1",
      "chart_type": "bar",
      "traces": [
        {{
          "x_column": "exact_column_name_from_files",
          "y_column": "exact_column_name_from_files",
          "name": "Descriptive trace name",
          "chart_type": "bar",
          "aggregation": "sum",
          "color": "#FFA07A"
        }}
      ],
      "title": "Specific chart title based on user request",
      "x_axis": {{ "dataKey": "column_name", "label": "X-Axis Label", "type": "category" }},
      "y_axis": {{ "dataKey": "column_name", "label": "Y-Axis Label", "type": "number" }}
    }}
  ],
  "file_name": "exact_full_path_from_available_files.arrow",
  "data_source": "exact_full_path_from_available_files.arrow",
  "message": "Chart configuration completed successfully",
  "reasoning": "Found all required components with context from history",
  "used_memory": true
}}

📊 MULTIPLE CHARTS RESPONSE (when user wants 2 charts):
{{
  "success": true,
  "chart_json": [
    {{
      "chart_id": "1",
      "title": "First chart title",
      "chart_type": "bar",
      "traces": [
        {{
          "x_column": "exact_column_name_from_files",
          "y_column": "exact_column_name_from_files",
          "name": "First chart trace name",
          "chart_type": "bar",
          "aggregation": "sum",
          "color": "#FFA07A"
        }}
      ],
      "x_axis": {{ "dataKey": "column_name", "label": "X-Axis Label", "type": "category" }},
      "y_axis": {{ "dataKey": "column_name", "label": "Y-Axis Label", "type": "number" }}
    }},
    {{
      "chart_id": "2",
      "title": "Second chart title",
      "chart_type": "line",
      "traces": [
        {{
          "x_column": "exact_column_name_from_files",
          "y_column": "exact_column_name_from_files",
          "name": "Second chart trace name",
          "chart_type": "line",
          "aggregation": "sum",
          "color": "#458EE2"
        }}
      ],
      "x_axis": {{ "dataKey": "column_name", "label": "X-Axis Label", "type": "category" }},
      "y_axis": {{ "dataKey": "column_name", "label": "Y-Axis Label", "type": "number" }}
    }}
  ],
  "file_name": "exact_full_path_from_available_files.arrow",
  "data_source": "exact_full_path_from_available_files.arrow",
  "message": "Multiple chart configuration completed successfully",
  "reasoning": "User requested multiple charts for different data views",
  "used_memory": true
}}

GENERAL RESPONSE (for questions, file info, suggestions):
{{
  "success": false,
  "suggestions": [
    "Here's what I found about your files:",
    "Available files for charting: [list exact full paths from available files]",
    "Numeric columns for Y-axis: [list numeric columns]",
    "Categorical columns for X-axis: [list categorical columns]",
    "Based on your data, I recommend: [specific chart type]",
    "To complete chart, specify: chart type + x-axis column + y-axis column + exact file path from available files",
    "For multiple charts, say: 'Create 2 charts: one showing X vs Y, another showing A vs B'"
  ],
  "message": "Here's what I can help you with",
  "reasoning": "Providing helpful information and guidance",
  "file_analysis": {{
    "total_files": "number",
    "numeric_columns": ["col1", "col2"],
    "categorical_columns": ["col1", "col2"],
    "chart_tips": ["tip1", "tip2"]
  }},
  "next_steps": [
    "Ask about specific columns or chart types",
    "Request chart suggestions",
    "Specify your chart requirements",
    "Say 'yes' to use my recommendations",
    "For multiple charts: 'Create 2 charts showing different views'"
  ]
}}

INTELLIGENCE RULES:

1. USE COMPLETE HISTORY: Reference previous interactions, successful configs, and user preferences
2. SMART COLUMN SELECTION: Analyze user's request to identify the most appropriate columns from available files
3. CONTEXT AWARENESS: Understand "yes", "no", "use those", "create chart" based on conversation
4. MEMORY UTILIZATION: Suggest columns user has successfully used before
5. PATTERN RECOGNITION: Identify user's preferred chart types and column combinations
6. AUTOMATIC COLUMN DETECTION: When chart type is selected, automatically find appropriate x/y columns
7. SMART CHART TYPE: Use "bar" as default if no chart type specified, otherwise use user preference
8. COLUMN VALIDATION: Always ensure suggested columns exist in the AVAILABLE FILES AND COLUMNS section
9. MULTI-CHART INTELLIGENCE: Detect when user wants multiple charts and create complementary configurations

MULTI-CHART DETECTION RULES:
- Keywords: "2 charts", "multiple charts", "both charts", "chart 1 and chart 2", "compare", "side by side", "dashboard"
- Context: "one showing X, another showing Y", "first chart for A, second chart for B", "create a comprehensive view"
- Numbers: "2", "two", "both", "pair of charts", "dual charts"
- Dashboard language: "dashboard", "overview", "summary", "comprehensive analysis"
- When detected, create 2 complementary charts with different perspectives on the same data
- 🔧 IMPORTANT: Always return chart_json as a LIST, even for single charts

FILE AND COLUMN HANDLING INSTRUCTIONS:
- CRITICAL: You MUST include the exact file name in your response
- CRITICAL: Use ONLY the columns provided in the AVAILABLE FILES WITH COLUMNS section
- The system provides you with a clear dictionary showing file names and their columns
- The dictionary format is: {{"filename.arrow": ["column1", "column2", ...]}}
- ALWAYS include "file_name" and "data_source" fields with the exact filename from available files
- For X-axis: Use categorical columns (strings, categories, regions, etc.)
- For Y-axis: Use numeric columns (sales, values, counts, etc.)
- NEVER invent or assume columns that aren't in the provided file data
- NEVER invent or assume file names that aren't in the available files
- The column analysis is already done - use that information directly

CHART TYPE HANDLING:
- Default to "bar" if no chart type specified
- Use "line" for time series or continuous data
- Use "pie" for proportions and percentages
- Use "scatter" for correlation analysis
- Learn from user's previous successful patterns
- For multiple charts, use complementary chart types (e.g., bar + line, pie + bar)

CONVERSATIONAL HANDLING:
- "yes" after suggestions → Use the suggested configuration
- "no" after suggestions → Ask for different preferences
- "use those columns" → Apply to most recent column suggestion
- "create chart" → Use default bar chart with identified columns
- "on column_name" → Apply to most recent column context
- "2 charts" or "multiple charts" → Create 2 complementary chart configurations

EXAMPLE WITH MULTIPLE CHARTS:
If user asks "CREATE 2 CHARTS: one showing sales by region, another showing revenue trend over time", and available files include "sales_data.arrow", your response MUST include:

{{
  "success": true,
  "chart_json": [
    {{
      "chart_id": "1",
      "title": "Sales by Region",
      "chart_type": "bar",
      "traces": [...]
    }},
    {{
      "chart_id": "2", 
      "title": "Revenue Trend Over Time",
      "chart_type": "line",
      "traces": [...]
    }}
  ],
  "file_name": "sales_data.arrow",
  "data_source": "sales_data.arrow",
  "message": "Multiple chart configuration completed successfully"
}}

MULTI-CHART EXAMPLES:
1. "Create a dashboard with 2 charts" → 2 complementary charts
2. "Show me both sales and revenue" → 2 charts comparing different metrics
3. "Compare performance across regions and time" → 2 charts with different perspectives
4. "Give me an overview with charts" → 2 charts for comprehensive analysis
5. "Create charts for analysis" → 2 charts showing different aspects

Return ONLY the JSON response:"""

    # 🔍 COMPREHENSIVE LOGGING: Show final prompt
    logger.info("🔍 ===== FINAL PROMPT BUILT =====")
    logger.info(f"📤 Final Prompt Length: {len(prompt)} characters")
    logger.info(f"📤 Final Prompt:\n{prompt}")
    logger.info(f"🔍 ===== END FINAL PROMPT =====")
    
    return prompt

def call_chart_llm(api_url: str, model_name: str, bearer_token: str, prompt: str) -> str:
    """
    Call the LLM API to generate chart configuration.
    Enhanced to match Merge agent's robust approach.
    """
    import requests
    
    # 🔍 COMPREHENSIVE LOGGING: Show LLM API call details
    logger.info("🔍 ===== CALLING CHART LLM =====")
    logger.info(f"🌐 API URL: {api_url}")
    logger.info(f"🤖 Model: {model_name}")
    logger.info(f"📤 Prompt Length: {len(prompt)} characters")
    logger.info(f"📤 Prompt Preview: {prompt[:200]}...")
    
    headers = {
        "Authorization": f"Bearer {bearer_token}",
        "Content-Type": "application/json"
    }
    
    payload = {
        "model": model_name,
        "messages": [
            {
                "role": "user",
                "content": prompt
            }
        ],
        "stream": False,
        "options": {
            "temperature": 0.1,
            "num_predict": 1500,
            "top_p": 0.9,
            "repeat_penalty": 1.1
        }
    }
    
    # 🔍 COMPREHENSIVE LOGGING: Show API payload
    logger.info(f"📦 API Payload:\n{json.dumps(payload, indent=2)}")
    
    try:
        logger.info("🚀 Making API request to LLM...")
        response = requests.post(api_url, headers=headers, json=payload, timeout=120)
        response.raise_for_status()
        
        result = response.json()
        content = result.get("message", {}).get("content", "")
        
        # 🔍 COMPREHENSIVE LOGGING: Show LLM response
        logger.info("🔍 ===== LLM API RESPONSE =====")
        logger.info(f"📥 Response Status: {response.status_code}")
        logger.info(f"📥 Response Headers: {dict(response.headers)}")
        logger.info(f"📥 Raw Response: {json.dumps(result, indent=2)}")
        logger.info(f"📥 Extracted Content Length: {len(content)} characters")
        logger.info(f"📥 Extracted Content:\n{content}")
        logger.info(f"🔍 ===== END LLM API RESPONSE =====")
        
        return content
        
    except Exception as e:
        logger.error(f"❌ LLM API call failed: {e}", exc_info=True)
        raise

def extract_json(response: str, available_files_with_columns: dict = None) -> Optional[Dict[str, Any]]:
    """
    Extract JSON from LLM response and validate structure.
    Enhanced to match Merge agent's robust JSON extraction.
    """
    logger.info(f"EXTRACTING JSON FROM RESPONSE:")
    logger.info(f"Response Length: {len(response)}")
    logger.info(f"Response Preview: {response[:300]}...")
    
    if not response:
        logger.warning("Empty response received")
        return None

    cleaned = re.sub(r"```", "", response)
    cleaned = re.sub(r"```\s*", "", cleaned)
    
    logger.info(f"Cleaned Response Preview: {cleaned[:300]}...")
    
    # 🔧 REMOVED: Manual validation - let the LLM handle everything
    # The LLM is responsible for generating valid, complete JSON responses

    # 🔧 IMPROVED: Better JSON extraction to capture complete responses
    # First try to find JSON wrapped in markdown code blocks
    code_block_pattern = r"```(?:json)?\s*\n(.*?)\n```"
    code_block_matches = re.findall(code_block_pattern, cleaned, re.DOTALL)
    
    if code_block_matches:
        logger.info(f"Found {len(code_block_matches)} code block matches")
        for i, match in enumerate(code_block_matches):
            try:
                parsed = json.loads(match.strip())
                if isinstance(parsed, dict):
                    logger.info(f"Successfully parsed JSON from code block {i+1}")
                    logger.info(f"Parsed JSON: {json.dumps(parsed, indent=2)}")
                    return parsed
            except json.JSONDecodeError as e:
                logger.debug(f"Code block {i+1} JSON decode failed: {e}")
                continue
    
    # Fallback: Try to find complete JSON object with brace balancing
    logger.info("Trying complete JSON extraction with brace balancing...")
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
                logger.info(f"Brace balancing extracted: {extracted[:200]}...")
                result = json.loads(extracted)
                logger.info(f"Brace balancing successful: {json.dumps(result, indent=2)}")
                return result
    except Exception as e:
        logger.error(f"Brace balancing failed: {e}")
    
    # Last resort: Try simple patterns for partial JSON
    logger.info("Trying simple JSON patterns as fallback...")
    simple_patterns = [
        r"\{[^{}]*\{[^{}]*\}[^{}]*\}",  
        r"\{[^{}]+\}",                  
        r"\{.*?\}(?=\s*$)",             
        r"\{.*\}"                       
    ]
    
    for i, pattern in enumerate(simple_patterns):
        matches = re.findall(pattern, cleaned, re.DOTALL)
        logger.info(f"Pattern {i+1} found {len(matches)} matches")
        for j, match in enumerate(matches):
            try:
                parsed = json.loads(match)
                if isinstance(parsed, dict):
                    logger.info(f"Successfully parsed JSON with pattern {i+1}, match {j+1}")
                    logger.info(f"Parsed JSON: {json.dumps(parsed, indent=2)}")
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

    logger.warning("No valid JSON could be extracted")
    
    # 🔧 SIMPLIFIED: Let the LLM handle suggestions too
    return {
        "success": False,
        "message": "Could not extract JSON from LLM response",
        "suggestions": [
            "Please try rephrasing your request",
            "Be specific about what you want to visualize"
        ]
    }

# 🔧 REMOVED: Manual validation function - let the LLM handle everything
# The LLM is responsible for generating valid, complete chart configurations
