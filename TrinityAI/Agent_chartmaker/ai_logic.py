# ai_logic.py - Chart Maker AI Logic (following concat pattern)

import json
import re
import requests
import logging
from typing import Dict, Any, Optional

logger = logging.getLogger("smart.chart.ai")

def build_prompt(user_prompt: str, available_files_with_columns: dict, context: str, file_analysis_data: dict = None) -> str:
    """Return the LLM prompt for the chart maker assistant."""
    
    # Analyze available files for better context
    file_summary = []
    numeric_columns = []
    categorical_columns = []
    
    for filename, columns in available_files_with_columns.items():
        file_summary.append(f"**{filename}** ({len(columns)} columns) - {', '.join(columns[:5])}{'...' if len(columns) > 5 else ''}")
        
        # Categorize columns (simple heuristic)
        for col in columns:
            col_lower = col.lower()
            if any(word in col_lower for word in ['id', 'name', 'category', 'type', 'status', 'region', 'country', 'brand', 'product']):
                categorical_columns.append(col)
            elif any(word in col_lower for word in ['value', 'amount', 'price', 'cost', 'revenue', 'sales', 'count', 'number', 'quantity', 'score', 'rate']):
                numeric_columns.append(col)
    
    file_analysis_text = f"""
FILE ANALYSIS:
- Total files: {len(available_files_with_columns)}
- Numeric columns: {', '.join(set(numeric_columns)[:10])}{'...' if len(set(numeric_columns)) > 10 else ''}
- Categorical columns: {', '.join(set(categorical_columns)[:10])}{'...' if len(set(categorical_columns)) > 10 else ''}
- Available files: {', '.join(list(available_files_with_columns.keys())[:5])}{'...' if len(available_files_with_columns) > 5 else ''}
"""
    
    return f"""You are an expert data visualization assistant with deep understanding of chart creation and data analysis. You have perfect memory of all previous conversations and can intelligently interpret user requests.

CURRENT REQUEST: "{user_prompt}"

CONVERSATION HISTORY:
{context}

AVAILABLE DATA FILES:
{json.dumps(available_files_with_columns, indent=2)}
{file_analysis_text}

## YOUR TASK:
Analyze the user's request and determine the most appropriate response. You must be context-aware and understand the user's intent.

## DECISION LOGIC:

### 1. FILE LISTING REQUESTS (success: false)
If user asks to "show files", "list files", "what files", "show columns", "available data", etc.:
- Use GENERAL RESPONSE format
- Provide comprehensive file information
- Suggest chart possibilities
- Be helpful and informative

### 2. CHART CREATION REQUESTS (success: true)
If user wants to create, make, generate, or visualize charts:
- Use SUCCESS RESPONSE format
- Generate proper chart configuration
- Select appropriate file and columns
- Create meaningful chart titles

### 3. QUESTIONS/SUGGESTIONS (success: false)
If user asks questions, needs help, or wants suggestions:
- Use GENERAL RESPONSE format
- Provide helpful guidance
- Suggest next steps
- Be conversational and supportive

## RESPONSE FORMATS:

### SUCCESS RESPONSE (Chart Creation):
{{
  "success": true,
  "chart_json": [
    {{
      "chart_id": "1",
      "chart_type": "bar|line|area|pie|scatter",
      "title": "Clear, descriptive title based on data and user intent",
      "traces": [
        {{
          "x_column": "exact_column_name_from_available_files",
          "y_column": "exact_column_name_from_available_files",
          "name": "Descriptive trace name",
          "chart_type": "bar|line|area|pie|scatter",
          "aggregation": "sum|mean|count|min|max",
          "color": "#8884d8",
          "filters": {{}} or {{"ColumnName": ["Value1", "Value2"]}}
        }}
      ],
      "filters": {{}} or {{"ColumnName": ["Value1", "Value2"]}}
    }}
  ],
  "file_name": "exact_filename_from_available_files",
  "data_source": "exact_filename_from_available_files",
  "message": "Chart configuration completed successfully",
  "smart_response": "I've created a [chart_type] chart showing [specific description]. The chart visualizes [data insights] from [file_name] and you can now view it in the interface or modify the settings as needed.",
  "reasoning": "Selected [file_name] because [reasoning]. Used [chart_type] because [reasoning]. Chose [x_column] and [y_column] because [reasoning].",
  "used_memory": true
}}

### GENERAL RESPONSE (File Info, Questions, Suggestions):
{{
  "success": false,
  "suggestions": [
    "Here's what I found about your data:",
    "Available files: {', '.join(list(available_files_with_columns.keys())[:3])}{'...' if len(available_files_with_columns) > 3 else ''}",
    "Recommended chart types: Bar charts for comparisons, Line charts for trends, Pie charts for proportions",
    "To create a chart, specify: file name + what you want to visualize + how",
    "Or ask me to suggest the best visualization for your data"
  ],
  "message": "Here's what I can help you with",
  "smart_response": "I'd be happy to help you create visualizations! Here are your available files: {', '.join([f'**{f}** ({len(cols)} columns)' for f, cols in list(available_files_with_columns.items())[:3]])}{'...' if len(available_files_with_columns) > 3 else ''}. I can help you create bar charts, line charts, pie charts, scatter plots, and more. What would you like to visualize?",
  "reasoning": "Providing helpful information and guidance",
  "file_analysis": {{
    "total_files": {len(available_files_with_columns)},
    "numeric_columns": {list(set(numeric_columns))[:10]},
    "categorical_columns": {list(set(categorical_columns))[:10]},
    "chart_tips": ["Use bar charts for comparing categories", "Use line charts for showing trends over time", "Use pie charts for showing proportions"]
  }},
  "next_steps": [
    "Ask about specific files or columns",
    "Request chart suggestions for your data",
    "Specify what you want to visualize",
    "Say 'create a chart' to get started"
  ]
}}

## CRITICAL RULES:

### FILE SELECTION:
- MUST use exact filenames from AVAILABLE FILES
- Choose the most relevant file based on user request
- If user mentions specific file, use that file
- If ambiguous, choose the file with most relevant columns

### COLUMN SELECTION:
- MUST use exact column names from the chosen file
- For x-axis: prefer categorical columns (names, categories, regions, etc.)
- For y-axis: prefer numeric columns (values, amounts, counts, etc.)
- Choose columns that make sense for the chart type

### CHART TYPE SELECTION:
- Bar charts: For comparing categories or groups
- Line charts: For showing trends over time or continuous data
- Pie charts: For showing proportions of a whole
- Scatter plots: For showing relationships between two numeric variables
- Area charts: For showing cumulative data over time

### TITLE CREATION:
- Be specific and descriptive
- Include the main data being visualized
- Mention the file or data source if relevant
- Examples: "Sales by Region", "Revenue Trends Over Time", "Product Category Distribution"

### SMART RESPONSE:
- Be conversational and helpful
- Explain what was created and why
- Mention key insights or data characteristics
- Provide next steps or suggestions
- Use natural language, not technical jargon

### FILTERS:
- Only add filters if user explicitly mentions filtering
- Use exact column names from available files
- Format: {{"ColumnName": ["Value1", "Value2"]}} for specific values
- Format: {{"ColumnName": []}} for column filtering without specific values

## EXAMPLES:

User: "show all files" → GENERAL RESPONSE with file list
User: "create a bar chart of sales by region" → SUCCESS RESPONSE with chart config
User: "what can I visualize?" → GENERAL RESPONSE with suggestions
User: "make a line chart showing revenue over time" → SUCCESS RESPONSE with chart config

Remember: Be intelligent, context-aware, and always provide the most helpful response based on the user's actual intent and available data."""

def call_llm(api_url: str, model_name: str, bearer_token: str, prompt: str) -> str:
    """Call the LLM API to generate chart configuration."""
    logger.info("Calling Chart LLM...")
    headers = {
        "Authorization": f"Bearer {bearer_token}",
        "Content-Type": "application/json"
    }

    payload = {
        "model": model_name,
        "messages": [{"role": "user", "content": prompt}],
        "stream": False,
        "options": {
            "temperature": 0.0,
            "num_predict": 1200,
            "top_p": 0.9,
            "repeat_penalty": 1.1
        }
    }

    logger.info(f"Payload prepared (len={len(json.dumps(payload))})")
    resp = requests.post(api_url, headers=headers, json=payload, timeout=300)
    resp.raise_for_status()
    result = resp.json()
    content = result.get("message", {}).get("content", "")
    logger.info(f"LLM raw content length: {len(content)}")
    return content

def _extract_outer_json_text(response: str) -> str:
    """Extract JSON from response, handling markdown code blocks and thinking tags."""
    if not response:
        return ""
    
    # Remove <think> tags (DeepSeek-style thinking)
    cleaned = response.strip()
    
    # Remove <think>...</think> blocks
    cleaned = re.sub(r'<think>.*?</think>', '', cleaned, flags=re.DOTALL)
    
    # Remove markdown code blocks (```json ... ```)
    cleaned = cleaned.strip()
    
    # Remove ```json at the beginning
    if cleaned.startswith("```json"):
        cleaned = cleaned[7:]  # Remove "```json"
    elif cleaned.startswith("```"):
        cleaned = cleaned[3:]   # Remove "```"
    
    # Remove ``` at the end
    if cleaned.endswith("```"):
        cleaned = cleaned[:-3]  # Remove "```"
    
    # Remove any remaining whitespace
    cleaned = cleaned.strip()
    
    # Find the first { and last } to extract JSON
    start = cleaned.find("{")
    end = cleaned.rfind("}")
    
    if start != -1 and end != -1 and end > start:
        return cleaned[start:end+1]
    
    return cleaned

def extract_json(response: str, available_files_with_columns: dict = None, user_prompt: str = "") -> Optional[Dict[str, Any]]:
    """Extract JSON object from raw LLM response."""
    logger.info(f"Extracting JSON from LLM response (len={len(response) if response else 0})")
    
    if not response:
        return {
            "success": False,
            "message": "Empty response from LLM",
            "suggestions": ["Retry the request with clearer chart requirements"]
        }

    # Extract JSON from response (handles markdown code blocks)
    raw = _extract_outer_json_text(response)
    
    try:
        obj = json.loads(raw)
        logger.info("✅ Successfully extracted JSON from LLM response")
        return obj
    except Exception as e:
        logger.error(f"❌ JSON parse failed: {e}")
        logger.error(f"🔍 Raw response that failed: {response[:500]}...")
        
        # Try one more time with simple brace matching
        try:
            start = response.find("{")
            end = response.rfind("}")
            if start != -1 and end != -1 and end > start:
                obj = json.loads(response[start:end+1])
                logger.info("✅ Successfully extracted JSON with fallback method")
                return obj
        except Exception as e2:
            logger.error(f"❌ Fallback JSON parse also failed: {e2}")
        
        return {
            "success": False,
            "message": "Could not parse JSON from LLM response",
            "suggestions": ["Enable JSON mode or reduce temperature and retry"]
        }