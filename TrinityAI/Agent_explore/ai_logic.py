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
            "x_axis": "actual_column_name_from_file",  # Required for line_chart, optional for others
            "y_axis": "actual_column_name_from_file",  # Display purposes only
            "title": "title_of_the_chart",
            "description": "Analyze patterns across different categories",
            "aggregation": "sum",  # Must be: sum, avg, count, min, max, weighted_avg, null, no_aggregation
            "filters": {},  # Dict format: {"column": ["value1", "value2"]}
            "dimensions": ["actual_column_name_from_file"],  # Will become group_by in backend
            "measures": ["actual_column_name_from_file"],  # Will become measures_config keys
            "weight_column": None,  # Required if using weighted_avg aggregation
<<<<<<< HEAD
            "segregated_field": None,  # Optional categorical column for secondary x-axis grouping (like filters, optional but useful when user requests multiple column comparison)
=======
>>>>>>> 150810c1b5794effe92101434eba656c97730ac5
            "data_summary": False,  # Set to true if user wants data summary/statistics
            "add_note": "This analysis will reveal patterns and relationships in your data, helping you identify key insights and trends."  # AI-generated insights about the chart
        }
    ],
    "file_name": "exact_file_name_from_available_files.arrow",
    "message": "Exploration configuration completed successfully",
    "smart_response": "I've configured a bar chart analysis using your file 'exact_file_name_from_available_files.arrow'. The chart will show patterns and relationships between the selected columns, helping you identify key insights and trends. You can now view the visualization to see the findings.",
    "reasoning": "The query requests data analysis and visualization",
    "used_memory": True
}

EXAMPLE_MULTIPLE_EXPLORATIONS_JSON = {
    "success": True,
    "exploration_config": [
        {
            "exploration_id": "1",
            "chart_type": "bar_chart",
            "x_axis": "Column_name_from_available_files",
            "y_axis": "Column_name_from_available_files",
            "title": "Title_of_the_chart",
            "description": "based on the user's request",
            "aggregation": "sum",
            "filters": {},
<<<<<<< HEAD
            "segregated_field": None,  # Optional categorical column for secondary x-axis grouping
=======
            
>>>>>>> 150810c1b5794effe92101434eba656c97730ac5
            "weight_column": None,
            "data_summary": False,
            "add_note": "Insight based on the users request and the data "
        },
        {
            "exploration_id": "2",
            "chart_type": "line_chart",
            "x_axis": "column_name_from_available_files",  # Required for line_chart
            "y_axis": "column_name_from_available_files",
            "title": "title_of_the_chart",
            "description": "Track performance trends over time",
            "aggregation": "sum",
            "filters": {},
<<<<<<< HEAD
            "segregated_field": "category_column",  # Example: Use category column for secondary grouping
=======
>>>>>>> 150810c1b5794effe92101434eba656c97730ac5
            "weight_column": None,
            "data_summary": True,
            "add_note": "This trend analysis will show how your metrics change over time, revealing growth patterns and seasonal variations."
        }
    ],
    "file_name": "exact_full_path_from_available_files.arrow",
    "message": "Multiple exploration configurations completed successfully",
    "smart_response": "I've created two complementary analyses for your data: a bar chart for categorical comparison and a line chart for trend analysis. This will give you both categorical insights and temporal patterns. You can view both visualizations to get a comprehensive understanding of your data.",
    "reasoning": "User requested multiple analyses for comprehensive insights",
    "used_memory": True
}

def build_file_info_string(available_files_with_columns: dict) -> str:
    """
    Build a formatted string with file names and their columns for display in smart_response.
    """
    if not available_files_with_columns:
        return "No files available"
    
    logger.info(f"Building file info string. Available files structure: {type(available_files_with_columns)}")
    logger.info(f"First file data type: {type(list(available_files_with_columns.values())[0]) if available_files_with_columns else 'None'}")
    
    file_info_parts = []
    for file_name, file_data in available_files_with_columns.items():
        # Handle both dict and list formats
        if isinstance(file_data, dict):
            columns = file_data.get('columns', [])
        elif isinstance(file_data, list):
            columns = file_data
        else:
            logger.warning(f"Unexpected file_data type for {file_name}: {type(file_data)}")
            columns = []
        
<<<<<<< HEAD
        # Show just the filename for cleaner display
        display_name = file_name.split('/')[-1] if '/' in file_name else file_name
        
        file_info_parts.append(f"{display_name} (columns: {', '.join(columns)})")
=======
        file_info_parts.append(f"{file_name} (columns: {', '.join(columns)})")
>>>>>>> 150810c1b5794effe92101434eba656c97730ac5
    
    return ', '.join(file_info_parts)

def build_explore_prompt(user_prompt: str, available_files_with_columns: dict, context: str) -> str:
    """
    Build a comprehensive prompt for the LLM to generate exploration configurations.
    Enhanced with better error handling and smart responses.
    """
    logger.info(f"Building explore prompt for: {user_prompt[:100]}...")
<<<<<<< HEAD
    logger.info(f"📚 Conversation context length: {len(context)} characters")
    logger.info(f"📚 Conversation context preview: {context[:200]}...")
=======
>>>>>>> 150810c1b5794effe92101434eba656c97730ac5
    
    # Check if we have sufficient data
    has_files = available_files_with_columns and len(available_files_with_columns) > 0
    has_columns = False
    if has_files:
        for file_data in available_files_with_columns.values():
            if isinstance(file_data, dict) and 'columns' in file_data:
                has_columns = len(file_data['columns']) > 0
                break
    
    prompt = """You are an intelligent data exploration assistant with perfect memory access to complete conversation history. You understand context, remember previous interactions, and respond like ChatGPT with conversational intelligence.

USER INPUT: "{}"

📁 AVAILABLE FILES AND THEIR COLUMNS:
""" + json.dumps(available_files_with_columns, indent=2) + """

📝 CONVERSATION CONTEXT:
<<<<<<< HEAD
{2}
=======
{}
>>>>>>> 150810c1b5794effe92101434eba656c97730ac5

TASK: Analyze the user input along with the complete conversation history to provide the most appropriate data exploration configuration.

🧠 CONVERSATIONAL INTELLIGENCE RULES:
1. USE COMPLETE HISTORY: Reference previous interactions, successful configs, and user preferences
2. CONTEXT AWARENESS: Understand "yes", "no", "use that", "create it" based on conversation
3. MEMORY UTILIZATION: Remember files user has successfully used before
4. PATTERN RECOGNITION: Identify user's preferred chart types and analysis patterns
5. SMART RESPONSES: Build upon previous suggestions and maintain conversation flow
6. CONFIGURATION PRESERVATION: When user says "yes" or modifies previous suggestion, use the Previous Configuration JSON as base and only change what user requested
7. CONVERSATIONAL HANDLING:
   - "yes" after suggestions → Use the Previous Configuration exactly as suggested
   - "no" after suggestions → Ask for different preferences
   - "use that file" → Apply to most recent file suggestion
   - "create the chart" → Use Previous Configuration with default settings
   - "show me trends" → Convert Previous Configuration to line chart
   - "make it a bar chart" → Convert Previous Configuration to bar chart
   - "use different columns" → Modify Previous Configuration with new columns
   - "change the title" → Update Previous Configuration title only
   - "add filters" → Add filters to Previous Configuration
<<<<<<< HEAD
   - "filter on [column]" → Add filter for [column] to Previous Configuration
   - "apply filter" → Add the specified filter to Previous Configuration
   - "add more filters" → Ask which filters to add to Previous Configuration
   - "break down by [column]" → Add [column] as segregated_field for disaggregation
   - "split by [column]" → Add [column] as segregated_field for data splitting
   - "decompose by [column]" → Add [column] as segregated_field for decomposition
   - "show by [dimension]" → Add [dimension] as segregated_field for detailed analysis
=======
>>>>>>> 150810c1b5794effe92101434eba656c97730ac5

🔍 DECISION PROCESS - SMART CONFIGURATION BUILDING:
1. FIRST: Check if there's a Previous Configuration in conversation history
2. IF Previous Configuration exists:
   - For "yes", "ok", "create it" → Use Previous Configuration exactly (success: true)
   - For "make it [chart_type]" → Modify Previous Configuration chart type only
   - For "use [column]" → Update Previous Configuration with new column
   - For "show [metric]" → Update Previous Configuration with new metric
   - For "filter on [column]" → Add filter to Previous Configuration
   - For "x axis as [column]" → Update x_axis in Previous Configuration
   - For "y axis as [column]" → Update y_axis in Previous Configuration
<<<<<<< HEAD
   - For "break down by [column]" → Add [column] as segregated_field
   - For "split by [column]" → Add [column] as segregated_field
   - For "decompose by [column]" → Add [column] as segregated_field
   - For any modification → Update only requested parts of Previous Configuration
   - ALWAYS return success: true when building upon Previous Configuration
   - NEVER ask for file selection again - use the file from Previous Configuration
   - **CRITICAL**: NEVER randomly select a different file - maintain consistency

🔍 DISAGGREGATION DECISION PROCESS:
1. **READ CONTEXT CAREFULLY**: Understand what the user wants to break down/split
2. **ESTABLISH PRIMARY DIMENSIONS**: Set x_axis and y_axis first (main analysis)
3. **IDENTIFY SEGREGATION NEED**: Look for keywords like "by", "break down", "split", "decompose"
4. **SMART SEGREGATION LOGIC**:
   - Single dimension: "sales by region" → x_axis: region, y_axis: sales, segregated_field: null
   - Multiple dimensions: "sales by region and category" → x_axis: region, y_axis: sales, segregated_field: category
   - Time + dimension: "trends by month and region" → x_axis: month, y_axis: trends, segregated_field: region
   - Comparison: "compare performance by channel" → x_axis: channel, y_axis: performance, segregated_field: null
3. IF no Previous Configuration:
   - Check if user mentioned a specific file name in their request
   - IF user mentioned a file → Use that file (if it exists in available files) and create chart
   - IF user didn't mention a file → Ask which file to use in smart_response
4. ALWAYS generate exploration config if:
   - Previous Configuration exists and user is modifying it, OR
   - User explicitly mentions specific chart types, analysis requests, or columns, OR
   - User mentions a file name (even without specific chart details)
5. For vague questions without file context → Return suggestions in smart_response
=======
   - For any modification → Update only requested parts of Previous Configuration
   - ALWAYS return success: true when building upon Previous Configuration
3. IF no Previous Configuration:
   - Check if user mentioned a specific file name in their request
   - IF user mentioned a file → Use that file (if it exists in available files)
   - IF user didn't mention a file → Ask which file to use in smart_response
4. ONLY generate exploration config if:
   - Previous Configuration exists and user is modifying it, OR
   - User explicitly mentions specific chart types, analysis requests, or columns
5. For ANY vague or general questions → Return suggestions in smart_response
>>>>>>> 150810c1b5794effe92101434eba656c97730ac5
6. PRIORITIZE building upon Previous Configuration over asking for new details
7. NEVER ask for file selection again if Previous Configuration has a file
8. NEVER ask for chart type again if Previous Configuration has a chart type
9. Remember: smart_response is what user sees - be helpful and ask for clarification

<<<<<<< HEAD
🔧 FILE SELECTION LOGIC - SMART MEMORY:
1. FIRST: Check if Previous Configuration has a file - if yes, use that file (NEVER ask again)
2. SECOND: Look for file names mentioned in user prompt (case-insensitive)
3. IF user mentions a file name → Use that file if it exists in available files
4. IF user mentions multiple files → Ask which one to use
5. IF user doesn't mention any file AND no Previous Configuration → Ask which file to use in smart_response
6. IF user doesn't mention any file BUT Previous Configuration exists → Use Previous Configuration file
7. NEVER ask for file selection again once a file is established in Previous Configuration
8. ALWAYS validate that the selected file exists in available files
=======
🔧 FILE SELECTION LOGIC - PRIORITIZE USER MENTION:
1. FIRST: Look for file names mentioned in user prompt (case-insensitive)
2. IF user mentions a file name → Use that file if it exists in available files
3. IF user mentions multiple files → Ask which one to use
4. IF user doesn't mention any file → Ask which file to use in smart_response
5. NEVER automatically select the first file without user consent
6. ALWAYS validate that the selected file exists in available files
>>>>>>> 150810c1b5794effe92101434eba656c97730ac5

🔧 COLUMN SELECTION RULES:
- ALWAYS use ONLY column names that exist in the selected file
- NEVER use generic names like "Column1", "Column2" - use actual column names from the data
- NEVER hardcode values like "sales", "brand", "date" unless they exist in the actual columns
<<<<<<< HEAD
- ALWAYS validate that selected columns exist in the chosen file

🔧 DATA DISAGGREGATION & SEGREGATION RULES:
- **FIRST**: Always establish x_axis and y_axis properly before considering segregation
- **SECOND**: Read context carefully to understand what disaggregation is needed
- **SEGREGATED_FIELD USAGE**:
  - Use when user wants to "break down by", "split by", "decompose by", "show by [dimension]"
  - Use when user mentions multiple dimensions: "sales by region and category"
  - Use when user wants detailed analysis: "show trends by product type"
  - Use when user wants comparison across groups: "compare performance by channel"
- **SMART SEGREGATION EXAMPLES**:
  - "Show sales by region" → x_axis: region, y_axis: sales, segregated_field: null
  - "Show sales by region and product" → x_axis: region, y_axis: sales, segregated_field: product
  - "Break down revenue by channel and month" → x_axis: month, y_axis: revenue, segregated_field: channel
  - "Compare performance across categories" → x_axis: category, y_axis: performance, segregated_field: null
  - "Show trends by product type and region" → x_axis: product_type, y_axis: trends, segregated_field: region 
=======
- ALWAYS validate that selected columns exist in the chosen file 
>>>>>>> 150810c1b5794effe92101434eba656c97730ac5

🔧 CRITICAL INSTRUCTIONS:""".format(user_prompt, json.dumps(available_files_with_columns, indent=2), context) + """

- ALWAYS return valid JSON
- NEVER return invalid JSON or malformed responses
- ALWAYS include smart_response field (REQUIRED) - this is what the user sees
- BE CONSERVATIVE: Only generate exploration_config when user explicitly requests specific analysis
- If user asks vague questions or general help → Return suggestions with success: false
- If user asks for specific charts/analysis → Generate exploration_config with success: true
- NEVER assume what the user wants - ask for clarification instead

<<<<<<< HEAD
🚨 **CRITICAL FILE MEMORY RULE**:
- **IF Previous Configuration has a file** → ALWAYS use that file, NEVER ask for file selection again
- **ONLY ask for file selection** if there's no Previous Configuration AND user doesn't mention a file
- **EXAMPLES OF NEVER ASKING FOR FILE**:
  - Previous: UK Mayo file → User: "show trends" → Use UK Mayo file (NO FILE QUESTION)
  - Previous: sales_data.arrow → User: "add filters" → Use sales_data.arrow (NO FILE QUESTION)
  - Previous: any file → User: "yes" → Use Previous Configuration file (NO FILE QUESTION)
- **EXAMPLES OF ASKING FOR FILE**:
  - No Previous Configuration → User: "create chart" → Ask which file to use
  - No Previous Configuration → User: "help" → Ask which file to use

=======
>>>>>>> 150810c1b5794effe92101434eba656c97730ac5
🔧 SMART_RESPONSE REQUIREMENT:
- MUST include smart_response field in ALL responses - this is the ONLY thing user sees
- Write in a conversational, professional tone like ChatGPT
- For suggestions (success: false): Show available files and columns, ask what specific analysis they want
- For charts (success: true): Explain what was configured, mention the file name, and what insights it will reveal
- ALWAYS mention the file name you're using in the smart_response
- When asking for clarification, ALWAYS include available files and their columns in smart_response
- Be helpful and informative without using emojis

🔧 CONVERSATIONAL EXAMPLES - CHATGPT-STYLE INTERACTIONS:

✅ INCREMENTAL CONFIGURATION BUILDING (success: true) when user says:
- "Create a bar chart showing sales by region using sales_data.arrow" → Generate full config
<<<<<<< HEAD
- "yes" (after you suggested a chart) → Use Previous Configuration exactly (SAME FILE)
- "ok, create it" (after you suggested a chart) → Use Previous Configuration exactly (SAME FILE)
- "make it a bar chart" (after suggesting line chart) → Modify Previous Configuration chart type (SAME FILE)
- "use sales column" (after you suggested a chart) → Update Previous Configuration with sales column (SAME FILE)
- "show me trends" (after suggesting bar chart) → Convert Previous Configuration to line chart (SAME FILE)
- "change the title to Sales Analysis" → Update Previous Configuration title only (SAME FILE)
- "add a filter for 2023" → Add filter to Previous Configuration (SAME FILE)
- "use different columns" (after specifying which) → Update Previous Configuration columns (SAME FILE)
- "apply more filters" → Ask which filters to add (SAME FILE)
- "change x axis" → Ask which column for x axis (SAME FILE)
- "update y axis" → Ask which column for y axis (SAME FILE)
- "group by brand and region" → Add region as segregated_field (SAME FILE)
- "show by category and channel" → Add channel as segregated_field (SAME FILE)
- "compare by product type" → Add product_type as segregated_field (SAME FILE)
=======
- "yes" (after you suggested a chart) → Use Previous Configuration exactly
- "ok, create it" (after you suggested a chart) → Use Previous Configuration exactly
- "make it a bar chart" (after suggesting line chart) → Modify Previous Configuration chart type
- "use sales column" (after you suggested a chart) → Update Previous Configuration with sales column
- "show me trends" (after suggesting bar chart) → Convert Previous Configuration to line chart
- "change the title to Sales Analysis" → Update Previous Configuration title only
- "add a filter for 2023" → Add filter to Previous Configuration
- "use different columns" (after specifying which) → Update Previous Configuration columns
>>>>>>> 150810c1b5794effe92101434eba656c97730ac5

✅ Example - INCREMENTAL UPDATES (success: true) when user says after Previous Configuration:
- "use salesvalue" → Update Previous Configuration y_axis to SalesValue
- "filter on channel" → Add Channel filter to Previous Configuration
- "x axis as brand" → Update Previous Configuration x_axis to Brand
- "y axis as volume" → Update Previous Configuration y_axis to Volume
- "apply filter on region" → Add Region filter to Previous Configuration
- "use different metric" → Update Previous Configuration y_axis
- "change to line chart" → Update Previous Configuration chart_type to line_chart
- "add category filter" → Add Category filter to Previous Configuration

✅ REAL-WORLD EXAMPLE - STEP BY STEP:
1. User: "use uk mayo file and create the chart for sales" → AI: Creates bar chart with UK Mayo file
<<<<<<< HEAD
2. User: "apply filter on channel and use x axis as brand" → AI: Updates Previous Configuration with Channel filter and Brand x_axis (USES SAME FILE)
3. User: "use salesvalue" → AI: Updates Previous Configuration y_axis to SalesValue (USES SAME FILE)
4. User: "make it a line chart" → AI: Updates Previous Configuration chart_type to line_chart (USES SAME FILE)
5. User: "add more filters" → AI: Asks which filters to add (USES SAME FILE)
6. User: "filter on region" → AI: Adds Region filter to Previous Configuration (USES SAME FILE)
7. User: "add category filter" → AI: Adds Category filter to Previous Configuration (USES SAME FILE)
8. Result: Complete configuration with UK Mayo file, line chart, Channel filter, Region filter, Category filter, Brand x_axis, SalesValue y_axis

✅ DISAGGREGATION EXAMPLE - DATA SPLITTING:
1. User: "show sales by region" → AI: x_axis: region, y_axis: sales, segregated_field: null
2. User: "break down by product category" → AI: x_axis: region, y_axis: sales, segregated_field: product_category
3. User: "split by channel as well" → AI: x_axis: region, y_axis: sales, segregated_field: channel (or asks which to prioritize)
4. User: "decompose by month" → AI: x_axis: month, y_axis: sales, segregated_field: region
5. Result: Time series showing sales by month, broken down by region

✅ SMART SEGREGATION EXAMPLES:
- "Show revenue by category and channel" → x_axis: category, y_axis: revenue, segregated_field: channel
- "Break down performance by region and product" → x_axis: region, y_axis: performance, segregated_field: product
- "Compare sales across different channels" → x_axis: channel, y_axis: sales, segregated_field: null
- "Show trends by product type and region" → x_axis: product_type, y_axis: trends, segregated_field: region

✅ FILE MEMORY EXAMPLES - NEVER ASK FOR FILE AGAIN:
1. Previous: UK Mayo file → User: "show trends" → AI: Creates line chart with UK Mayo file (NO FILE QUESTION)
2. Previous: sales_data.arrow → User: "add filters" → AI: Asks which filters, uses sales_data.arrow (NO FILE QUESTION)
3. Previous: customer_data.arrow → User: "change to pie chart" → AI: Creates pie chart with customer_data.arrow (NO FILE QUESTION)
4. Previous: revenue_file.arrow → User: "use different columns" → AI: Asks which columns, uses revenue_file.arrow (NO FILE QUESTION)
5. Previous: any file → User: "yes" → AI: Uses Previous Configuration exactly (NO FILE QUESTION)
=======
2. User: "apply filter on channel and use x axis as brand" → AI: Updates Previous Configuration with Channel filter and Brand x_axis
3. User: "use salesvalue" → AI: Updates Previous Configuration y_axis to SalesValue (success: true)
4. Result: Complete configuration with UK Mayo file, bar chart, Channel filter, Brand x_axis, SalesValue y_axis
>>>>>>> 150810c1b5794effe92101434eba656c97730ac5

✅ NEW CONFIGURATION (success: true) when user says:
- "Show me a line chart of revenue over time from revenue_file.arrow" 
- "Make a pie chart of customer segments using customer_data.arrow"
- "I want to see trends in [specific column] from [specific file]"

❌ ASK FOR CLARIFICATION (success: false) when user says:
- "Help me" → "I'd be happy to help! I can see you have these files available: file1.arrow (columns: col1, col2, col3), file2.arrow (columns: col4, col5, col6). What specific analysis would you like me to create and which file should I use?"
- "What can you do?" → "I can create various charts and visualizations. I can see you have these files available: file1.arrow (columns: col1, col2, col3), file2.arrow (columns: col4, col5, col6). What type of analysis are you looking for and which file should I use?"
- "Analyze my data" → "I'd love to analyze your data! I can see you have these files available: file1.arrow (columns: col1, col2, col3), file2.arrow (columns: col4, col5, col6). Which file would you like me to use and what specific analysis do you need?"
- "Show me something" → "I can show you many different types of charts. I can see you have these files available: file1.arrow (columns: col1, col2, col3), file2.arrow (columns: col4, col5, col6). Which file should I use and what specific data would you like to visualize?"
- "Create a chart" → "I can create several types of charts. I can see you have these files available: file1.arrow (columns: col1, col2, col3), file2.arrow (columns: col4, col5, col6). Which file should I use and what kind of chart would you like me to create?"
- "no" (after you suggested something) → Ask for different preferences
- "use different columns" (without specifying which) → Ask which columns to use

🧠 MEMORY-BASED RESPONSES:
- If user previously used a file successfully → Reference it in suggestions
- If user previously created a specific chart type → Suggest similar patterns
- If user previously asked about specific columns → Remember their interests
- If user said "yes" to a suggestion → Use that exact configuration
- If user said "no" to a suggestion → Offer alternative options

🔧 PREVIOUS CONFIGURATION HANDLING:
- When you see "Previous Configuration" in conversation history, use it as the base
- For "yes" responses → Return the Previous Configuration exactly as is (success: true)
- For modification requests → Update only the requested parts of Previous Configuration
- For "make it [chart_type]" → Change only the chart_type in Previous Configuration
- For "use different columns" → Update only the x_axis/y_axis in Previous Configuration
- For "change title" → Update only the title in Previous Configuration
- Always preserve file_name, filters, and other settings from Previous Configuration
- Only modify what the user specifically requested to change

🔧 STEP-BY-STEP CONFIGURATION BUILDING:
- If user provides file name first → Store it and ask for chart type/columns
- If user provides chart type after file → Use file + chart type, ask for columns
- If user provides columns after file + chart type → Complete the configuration (success: true)
- If user says "yes" after any partial configuration → Complete it with reasonable defaults
- If user modifies any part of existing configuration → Update only that part
- NEVER fall back to asking for all details again if Previous Configuration exists
- ALWAYS build upon Previous Configuration rather than starting over

🔧 INCREMENTAL UPDATE RULES:
- If Previous Configuration exists and user provides additional details → Update configuration and return success: true
- If user says "use [metric]" after Previous Configuration → Update y_axis with that metric
- If user says "filter by [column]" after Previous Configuration → Add filter for that column
- If user says "x axis as [column]" after Previous Configuration → Update x_axis with that column
- If user says "y axis as [column]" after Previous Configuration → Update y_axis with that column
- If user provides any specific column/metric after Previous Configuration → Complete the configuration
- NEVER ask for file selection again if Previous Configuration has a file
- NEVER ask for chart type again if Previous Configuration has a chart type
- ALWAYS use Previous Configuration as base and only modify what user specified

🔧 UI OPTIONS:
- **data_summary**: Set to true if user wants to see data summary/statistics (default: false)
- **filter_unique**: Set to true if user wants to filter out columns with single unique value (default: false)
- **add_note**: Provide AI-generated insights about the chart data and what it means (required for all charts)
<<<<<<< HEAD
- **segregated_field**: Optional categorical column name for data decomposition/disaggregation - used when user wants to split/break down data by additional dimensions (e.g., "show sales by region and product category")
=======
>>>>>>> 150810c1b5794effe92101434eba656c97730ac5

🔧 ADD_NOTE EXAMPLES:
- Bar chart: "This analysis reveals key patterns and relationships in your categorical data, helping identify dominant categories and outliers"
- Line chart: "The trend analysis shows how your metrics change over time, revealing growth patterns and seasonal variations"
- Pie chart: "This visualization highlights the distribution of your data across different segments, showing relative proportions and key insights"

<<<<<<< HEAD
🔧 SEGREGATED_FIELD USAGE:
- **Purpose**: Add a categorical column as secondary x-axis to show multiple columns in same graph
- **When to use**: When user asks for "compare by category", "group by brand and region", "show both X and Y by category"
- **Examples**:
  - User: "show sales by region and brand" → Use brand as segregated_field
  - User: "compare revenue by category and channel" → Use channel as segregated_field
  - User: "group by product type and month" → Use month as segregated_field
- **Format**: String with categorical column name, or null if not needed
- **Behavior**: Like filters - optional but useful when user requests multiple column comparison
- **UI Element**: Maps to "Segregate Field Values" dropdown in the frontend

=======
>>>>>>> 150810c1b5794effe92101434eba656c97730ac5

🔧 MANDATORY FILE AND COLUMN USAGE:
- You MUST use the EXACT file names from the "AVAILABLE FILES AND THEIR COLUMNS" section above
- You MUST use ONLY column names that exist in the selected file
- Example: If file "data.arrow" has columns ["name", "age", "salary"], use these exact column names
- NEVER create new file names or use placeholder column names
- ALWAYS validate your selections against the available data
- In your smart_response, ALWAYS mention which file you're using
- Example smart_response: "I've created a bar chart using your file 'sales_data.arrow' showing revenue by region..."

🔧 SMART_RESPONSE FILE INFORMATION FORMAT:
- When asking for clarification (success: false), ALWAYS include available files and their columns
- Format: "I can see you have these files available: file1.arrow (columns: col1, col2, col3), file2.arrow (columns: col4, col5, col6)"
- This helps users understand what data is available for analysis
- Make it easy for users to choose the right file and columns

🔧 FILE NAME MATCHING RULES:
- Look for file names in user prompt (case-insensitive)
- Match partial file names (e.g., "sales" matches "sales_data.arrow")
- If user mentions a file that doesn't exist → Ask for clarification
- If user mentions multiple files → Ask which one to use
- If no file mentioned → Ask which file to use
- NEVER assume which file to use without user input

🔍 DATA SUFFICIENCY CHECK:
- If no files available: Return error with suggestion to upload data
- Always use the available files and only you use one file that user gives in prompt
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
- **visualization_analysis**: Visualize the data based on the user's request
- **filteration_analysis**: Filter the data based on the user's request
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

📊 FAILURE RESPONSE (for general questions or when you need clarification):
{{
  "success": false,
  "suggestions": [
    "Create a bar chart showing [column1] by [column2] using [filename]",
    "Show me a line chart of [column] over time from [filename]", 
    "Make a pie chart of [categorical column] using [filename]",
    "Compare [column1] vs [column2] with a bar chart from [filename]",
    "What files are available for analysis?",
    "What columns are available in [filename]?"
  ],
  "message": "I need more specific information about what analysis you'd like me to create and which file to use.",
  "smart_response": "I'd be happy to help you create data visualizations! I can see you have these files available: {file_info}. To get started, I need to know which file you'd like me to use and what specific analysis you're looking for. For example, you could ask me to 'create a bar chart showing [column1] by [column2] using [filename]' or 'show me trends in [column] over time from [filename]'. Which file should I use and what would you like to visualize?",
  "file_analysis": {{
    "total_files": {total_files},
    "available_columns": {available_columns}
  }},
  "next_steps": [
    "Tell me which file you want to use",
    "Specify what type of chart you want (bar, line, pie, etc.)",
    "Tell me which columns to analyze",
    "Describe what insights you're looking for"
  ]
}}""".format(
        file_info=build_file_info_string(available_files_with_columns),
        total_files=len(available_files_with_columns),
        available_columns=json.dumps(list(available_files_with_columns.values())[0].get('columns', []) if available_files_with_columns and list(available_files_with_columns.values()) else [])
    ) + """

CRITICAL: You MUST respond with ONLY valid JSON. Do not include any text before or after the JSON. Do not use <think> tags or any other formatting. Just return the JSON object directly.

🔧 FINAL REMINDER:
- BE CONSERVATIVE: When in doubt, ask for clarification instead of generating charts
- smart_response is what the user sees - make it helpful and ask for specifics
- ALWAYS generate smart_response field - it's the primary user-facing message
- Only generate exploration_config when user explicitly requests specific analysis
- Don't assume what the user wants - ask them to be more specific
- ALWAYS validate file names and column names exist in available data
- If validation fails, return suggestions instead of invalid configs
- When asking for clarification, ALWAYS show available files and their columns in smart_response
- For success: true - explain what chart was created and what insights it will show
- For success: false - ask for clarification and show available files/columns
- Format: "I can see you have these files available: filename1.arrow (columns: col1, col2, col3), filename2.arrow (columns: col4, col5, col6)"

RESPOND WITH VALID JSON ONLY. STRICT-  RETURN JSON ONLY.

🔧 SMART ERROR RESPONSES:
If you cannot create a valid exploration, return this format:
{
  "success": false,
  "error_type": "insufficient_data|no_files|invalid_request|missing_columns",
    "message": "Clear explanation of why exploration cannot be created",
     "smart_response": "I encountered an issue while setting up your analysis. This could be due to missing data files, insufficient column information, or an invalid request format. Please check that you have uploaded your data file and try specifying the analysis you need more clearly.",
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
        
        response = requests.post(api_url, headers=headers, json=data, timeout=60)  # Increased timeout
        response.raise_for_status()
        
        # Handle streaming response format
        response_text = response.text.strip()
        logger.info(f"🔍 LLM API Response - Status: {response.status_code}")
        logger.info(f"🔍 LLM API Response - Length: {len(response_text)} characters")
        
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
<<<<<<< HEAD
    Extract JSON from LLM response with simplified parsing.
    If LLM generates valid JSON with file_name, x_axis, y_axis, then pass it through.
=======
    Extract JSON from LLM response with multiple fallback patterns.
    Enhanced to handle malformed responses better.
>>>>>>> 150810c1b5794effe92101434eba656c97730ac5
    """
    if not text or not text.strip():
        logger.warning("🔍 JSON Extraction - Empty or None text provided")
        return None
    
    # Clean the text
    text = text.strip()
    
    # Remove <think> tags if present
    if '<think>' in text and '</think>' in text:
        # Extract content after </think> tag
        think_end = text.find('</think>')
        if think_end != -1:
            text = text[think_end + 8:].strip()
            logger.info("🔍 JSON Extraction - Removed <think> tags")
    
    logger.info(f"🔍 JSON Extraction - Input length: {len(text)}")
    
<<<<<<< HEAD
    # Simple JSON extraction - look for JSON in markdown code blocks first
    json_patterns = [
        r'```json\s*(\{.*?\})\s*```',
        r'```\s*(\{.*?\})\s*```',
    ]
    
    for pattern in json_patterns:
        matches = re.findall(pattern, text, re.DOTALL | re.IGNORECASE)
        for match in matches:
            try:
                result = json.loads(match)
                logger.info("✅ Successfully extracted JSON using pattern matching")
                return result
            except json.JSONDecodeError as e:
                logger.debug(f"JSON decode error with pattern {pattern}: {e}")
                continue
    
    # Fallback: Find JSON by counting braces
=======
    # Pattern 1: Look for JSON block markers
    json_patterns = [
        r'```json\s*(\{.*?\})\s*```',
        r'```\s*(\{.*?\})\s*```',
        r'</think>\s*(\{.*\})',  # JSON after </think> tag
        r'(\{.*\})',  # Any JSON object
    ]
    
    # Pattern 2: Find JSON by counting braces (more robust)
>>>>>>> 150810c1b5794effe92101434eba656c97730ac5
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
    
<<<<<<< HEAD
=======
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
    
    # Try brace counting method
>>>>>>> 150810c1b5794effe92101434eba656c97730ac5
    complete_json = find_complete_json(text)
    if complete_json:
        try:
            result = json.loads(complete_json)
<<<<<<< HEAD
            logger.info("✅ Successfully extracted JSON using brace counting")
            
            # Basic validation - check if it has the required structure
            if not isinstance(result, dict):
                logger.warning("❌ Extracted JSON is not a dictionary")
                return None
            
            # Check for basic required fields for explore functionality
            if 'success' not in result:
                logger.warning("❌ Missing 'success' field in JSON")
                return None
            
            # If success is True, check for exploration_config
            if result.get('success') and 'exploration_config' not in result:
                logger.warning("❌ Missing 'exploration_config' field in successful response")
                return None
            
            # Validate exploration_config structure if present
            if 'exploration_config' in result:
                exp_config = result['exploration_config']
                if not isinstance(exp_config, list):
                    logger.warning("❌ exploration_config is not a list")
                    return None
                
                # Check each exploration in the list
                for i, exp in enumerate(exp_config):
                    if not isinstance(exp, dict):
                        logger.warning(f"❌ Exploration {i} is not a dictionary")
                        return None
                    
                    # Check for required fields in each exploration
                    required_fields = ['x_axis', 'y_axis', 'chart_type']
                    for field in required_fields:
                        if field not in exp:
                            logger.warning(f"❌ Exploration {i} missing required field: {field}")
                            return None
                    
                    # Validate field types
                    if not isinstance(exp.get('x_axis'), str) or not exp.get('x_axis').strip():
                        logger.warning(f"❌ Exploration {i} x_axis is not a valid string")
                        return None
                    
                    if not isinstance(exp.get('y_axis'), str) or not exp.get('y_axis').strip():
                        logger.warning(f"❌ Exploration {i} y_axis is not a valid string")
                        return None
                    
                    if not isinstance(exp.get('chart_type'), str) or not exp.get('chart_type').strip():
                        logger.warning(f"❌ Exploration {i} chart_type is not a valid string")
                        return None
            
            logger.info("✅ JSON validation passed")
            return result
            
        except json.JSONDecodeError as e:
            logger.debug(f"JSON decode error with brace counting: {e}")
    
    # Final fallback: Try to find JSON-like structure
    try:
=======
            if _validate_explore_config(result, available_files_with_columns):
                logger.info("✅ Successfully extracted JSON using brace counting")
                return result
        except json.JSONDecodeError as e:
            logger.debug(f"JSON decode error with brace counting: {e}")
    
    # Pattern 2: Try to find JSON-like structure
    try:
        # Look for the first { and last }
>>>>>>> 150810c1b5794effe92101434eba656c97730ac5
        start = text.find('{')
        end = text.rfind('}')
        if start != -1 and end != -1 and end > start:
            json_str = text[start:end+1]
            result = json.loads(json_str)
<<<<<<< HEAD
            logger.info("✅ Successfully extracted JSON using bracket matching")
            
            # Basic validation for fallback JSON
            if isinstance(result, dict) and 'success' in result:
                logger.info("✅ Fallback JSON validation passed")
                return result
            else:
                logger.warning("❌ Fallback JSON missing required structure")
                return None
    except json.JSONDecodeError as e:
        logger.debug(f"JSON decode error with bracket matching: {e}")
    
    # If all parsing fails, return a helpful response
=======
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
    
    # Pattern 5: If all else fails, try to extract smart_response from the text
>>>>>>> 150810c1b5794effe92101434eba656c97730ac5
    logger.warning("Could not extract valid JSON from LLM response")
    logger.warning(f"Response preview: {text[:200]}...")
    
    # Try to extract smart_response from the text even if JSON is malformed
    smart_response = text.strip()
    if '"smart_response":' in text:
        try:
<<<<<<< HEAD
=======
            # Try to extract just the smart_response value
>>>>>>> 150810c1b5794effe92101434eba656c97730ac5
            start = text.find('"smart_response":"') + 18
            end = text.find('"', start)
            if start > 17 and end > start:
                smart_response = text[start:end]
<<<<<<< HEAD
=======
                # Unescape the content
>>>>>>> 150810c1b5794effe92101434eba656c97730ac5
                smart_response = smart_response.replace('\\"', '"').replace('\\n', '\n').replace('\\t', '\t')
        except:
            pass
    
    # If no smart_response found, create a helpful one with file information
    if not smart_response or smart_response == text.strip():
        file_info = build_file_info_string(available_files_with_columns)
        smart_response = f"I'd be happy to help you with data analysis! I can see you have these files available: {file_info}. To get started, I need to know which file you'd like me to use and what specific analysis you're looking for. For example, you could ask me to 'create a bar chart showing [column1] by [column2] using [filename]' or 'show me trends in [column] over time from [filename]'. Which file should I use and what would you like to visualize?"
    
    logger.info("Using LLM response as smart_response fallback")
    
    return {
        "success": False,
        "message": "Could not parse LLM response as valid JSON",
        "smart_response": smart_response if smart_response else "I'd be happy to help you with data analysis. Could you please be more specific about what you'd like to explore?",
        "raw_response": text
    }

<<<<<<< HEAD
# Removed _validate_explore_config function - simplified JSON parsing without strict validation

# Removed _validate_single_exploration_config function - simplified JSON parsing without strict validation
=======
def _validate_explore_config(config: Dict[str, Any], available_files_with_columns: dict) -> bool:
    """
    Validate that the extracted configuration has the required structure and backend compatibility.
    """
    if not isinstance(config, dict):
        logger.warning("Config is not a dictionary")
        return False
    
    # Check for success field
    if "success" not in config:
        logger.warning("Config missing success field")
        return False
    
    logger.info(f"Validating config with success: {config.get('success')}")
    
    # If success is True, only check essential fields
    if config.get("success"):
        # Check file_name exists and is valid
        if "file_name" not in config:
            logger.warning("File name is required for successful exploration config")
            return False
        
        file_name = config["file_name"]
        if file_name not in available_files_with_columns:
            logger.warning(f"File {file_name} not found in available files: {list(available_files_with_columns.keys())}")
            return False
        
        # Check smart_response exists
        if "smart_response" not in config:
            logger.warning("Smart response is required for successful exploration config")
            return False
        
        # Check exploration_config exists and has x_axis, y_axis
        if "exploration_config" in config:
            exploration_configs = config["exploration_config"]
            if isinstance(exploration_configs, list) and len(exploration_configs) > 0:
                exp_config = exploration_configs[0]  # Check first config
                if "x_axis" not in exp_config or "y_axis" not in exp_config:
                    logger.warning("x_axis and y_axis are required in exploration config")
                    return False
        
        logger.info("✅ Success config validation passed")
        return True
    
    # If success is False, check for suggestions and smart_response
    else:
        if "suggestions" not in config:
            logger.warning("Config with success=false missing suggestions field")
            return False
        
        if "smart_response" not in config:
            logger.warning("Smart response is required for suggestions")
            return False
        
        logger.info("✅ Suggestions config validation passed")
        return True

def _validate_single_exploration_config(exp_config: Dict[str, Any], available_files_with_columns: dict = None) -> bool:
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
    
    # Validate columns exist in available files (if validation data provided)
    if available_files_with_columns:
        # Get the file name from the parent config (we need to pass this through)
        # For now, validate against all available files
        all_columns = set()
        for file_data in available_files_with_columns.values():
            if isinstance(file_data, dict) and 'columns' in file_data:
                all_columns.update(file_data['columns'])
        
        # Check if dimensions exist in any available file
        dimensions = exp_config.get("dimensions", [])
        for dim in dimensions:
            if dim not in all_columns:
                logger.warning(f"Dimension column '{dim}' not found in any available file")
                return False
        
        # Check if measures exist in any available file
        measures = exp_config.get("measures", [])
        for measure in measures:
            if measure not in all_columns:
                logger.warning(f"Measure column '{measure}' not found in any available file")
                return False
        
        # Check if x_axis exists in any available file
        x_axis = exp_config.get("x_axis")
        if x_axis and x_axis not in all_columns:
            logger.warning(f"x_axis column '{x_axis}' not found in any available file")
            return False
        
        # Check if y_axis exists in any available file
        y_axis = exp_config.get("y_axis")
        if y_axis and y_axis not in all_columns:
            logger.warning(f"y_axis column '{y_axis}' not found in any available file")
            return False
    
    return True
>>>>>>> 150810c1b5794effe92101434eba656c97730ac5
