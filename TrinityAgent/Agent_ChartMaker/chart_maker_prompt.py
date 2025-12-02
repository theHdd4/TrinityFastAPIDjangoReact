"""
Standard ChartMaker Prompt Builder for Trinity AI
Contains only chart_maker-specific prompt logic.
Uses BaseAgent infrastructure for file details, history, validation, and JSON instructions.
"""

from typing import Dict, Any, List, Optional
import sys
from pathlib import Path

# Import PromptBuilder from BaseAgent
parent_dir = Path(__file__).parent.parent
if str(parent_dir) not in sys.path:
    sys.path.insert(0, str(parent_dir))

try:
    from BaseAgent.prompt_builder import PromptBuilder
except ImportError:
    try:
        from TrinityAgent.BaseAgent.prompt_builder import PromptBuilder
    except ImportError:
        raise ImportError("Could not import PromptBuilder from BaseAgent")


class ChartMakerPromptBuilder:
    """ChartMaker-specific prompt building utilities."""
    
    # ChartMaker-specific success response template
    SUCCESS_TEMPLATE = {
        "success": True,
        "chart_json": [
            {
                "chart_id": "chart_1",
                "chart_type": "bar",
                "title": "Chart Title",
                "file": "exact_filename.arrow",
                "traces": [
                    {
                        "x_column": "category_column",
                        "y_column": "numeric_column",
                        "name": "Series Name",
                        "aggregation": "sum",
                        "color": "#41C185"
                    }
                ],
                "filter_columns": "optional_filter_column",
                "filter_values": "value1, value2"
            }
        ],
        "file_name": "exact_filename.arrow",
        "response": "Raw thinking and reasoning from LLM about the chart creation, including why this file was selected, why these columns were chosen, why this chart type was selected, and any considerations made",
        "smart_response": "I've created a chart configuration for you. The chart will visualize your data with the specified columns and chart type. You can now view the chart or make adjustments as needed.",
        "reasoning": "Found all required components with context from history",
        "used_memory": True
    }
    
    # 🔧 CRITICAL: Examples for dual Y-axis and legend field
    # Example 1: Dual Y-axis (2 different metrics)
    # {
    #     "traces": [
    #         {"x_column": "Year", "y_column": "SalesValue", "name": "Sales Value", "aggregation": "sum"},
    #         {"x_column": "Year", "y_column": "Volume", "name": "Volume", "aggregation": "sum"}
    #     ]
    # }
    # 
    # Example 2: Legend field (segregate one metric by category)
    # {
    #     "traces": [
    #         {"x_column": "Year", "y_column": "SalesValue", "legend_field": "Brand", "aggregation": "sum"}
    #     ]
    # }
    
    # ChartMaker-specific general response template
    GENERAL_TEMPLATE = {
        "success": False,
        "suggestions": [
            "Here's what I found about your files:",
            "Available files for chart creation: [list relevant files]",
            "Columns in [file]: [list columns]",
            "Based on your previous patterns, I recommend:",
            "To create a chart, specify: file + x-axis column + y-axis column + chart type",
            "Or say 'yes' to use my suggestions"
        ],
        "response": "Raw thinking and reasoning from LLM about the current situation, what files are available, what the user might want, analysis of the request, and recommendations based on available data",
        "smart_response": "I'd be happy to help you create charts! Here are your available files and their columns: [FORMAT: **filename.arrow** (X columns) - column1, column2, column3, etc.]. I can help you create bar charts, line charts, area charts, pie charts, or scatter plots. What would you like to visualize?",
        "reasoning": "Providing helpful information and guidance",
        "file_analysis": {
            "total_files": "number",
            "recommended_files": ["file1"],
            "chart_tips": [
                "Use categorical columns for x-axis",
                "Use numeric columns for y-axis",
                "Bar charts for comparisons",
                "Line charts for trends over time",
                "Pie charts for proportions",
                "Scatter plots for relationships"
            ]
        },
        "next_steps": [
            "Ask about specific files or columns",
            "Request chart suggestions",
            "Specify your chart requirements",
            "Say 'yes' to use my recommendations"
        ]
    }
    
    # ChartMaker-specific intelligence rules
    INTELLIGENCE_RULES = [
        "Match the user’s partial file name to the closest exact filename from the available list and return only that filename",
        "USE COMPLETE HISTORY: Reference previous interactions, successful chart creations, and user preferences",
        "SMART FILE SELECTION: Analyze user's request to identify the most appropriate file from the available list",
        "CONTEXT AWARENESS: Understand \"yes\", \"no\", \"use that\", \"create chart with those\" based on conversation",
        "MEMORY UTILIZATION: Suggest files user has successfully used before",
        "PATTERN RECOGNITION: Identify user's preferred chart types, columns, and visualizations",
        "AUTOMATIC COLUMN DETECTION: When file is selected, automatically identify categorical columns suitable for x-axis and numeric columns suitable for y-axis",
        "SMART CHART TYPE SELECTION: Suggest appropriate chart types based on data and user intent (bar for comparisons, line for trends, pie for proportions, scatter for relationships)",
        "VALIDATION: Always ensure suggested files exist in the AVAILABLE FILES AND COLUMNS section",
        "🔧 CRITICAL: Use SIMPLE MODE format (not advanced traces mode) for all charts",
        "🔧 CRITICAL: For multiple series, use ONE of these approaches:",
        "   1. DUAL Y-AXIS: If user wants 2 different metrics (e.g., SalesValue and Volume), use secondYAxis field",
        "       - Create 2 traces: first trace with y_column=SalesValue, second trace with y_column=Volume",
        "       - Backend will automatically create dual Y-axis chart",
        "   2. LEGEND FIELD (Segregate Field): If user wants to segregate one metric by a category (e.g., SalesValue by Brand), use legend_field",
        "       - Create 1 trace with y_column=SalesValue and legend_field=Brand",
        "       - Backend will create multiple series (one per Brand value) from single Y-axis",
        "🔧 DO NOT use multiple traces with different y_columns unless you want dual Y-axis",
        "🔧 For dual Y-axis: Always provide exactly 2 traces with different y_column values",
        "🔧 For legend field segregation: Provide 1 trace with legend_field set to the categorical column",
        "CHART TYPES: Support bar, line, area, pie, and scatter chart types",
        "MULTIPLE CHARTS: Can create multiple charts in a single response by providing multiple chart configurations in chart_json array",
        "FILTERS: Support optional filters to narrow down data before charting",
        "AGGREGATION: Support aggregation functions (sum, mean, count, min, max) for numeric columns",
        "DEFAULT BEHAVIOR: If no chart type specified, suggest bar chart as default",
        "🔧 CRITICAL: Use SIMPLE MODE format (not advanced traces mode) for all charts",
        "🔧 CRITICAL: ALWAYS provide x_column and y_column in EVERY trace - these are REQUIRED for filters to work",
        "🔧 CRITICAL: x_column must be a categorical column (e.g., Year, Month, Category, Brand)",
        "🔧 CRITICAL: y_column must be a numeric column (e.g., SalesValue, Volume, Count, Revenue)",
        "🔧 CRITICAL: For multiple series, use ONE of these approaches:",
        "   1. DUAL Y-AXIS: If user wants 2 different metrics (e.g., SalesValue and Volume), use 2 traces with different y_column values",
        "       - First trace: x_column='Year', y_column='SalesValue', name='Sales Value', aggregation='sum'",
        "       - Second trace: x_column='Year', y_column='Volume', name='Volume', aggregation='sum'",
        "       - Both traces MUST have the SAME x_column value",
        "       - Backend will automatically create dual Y-axis chart with left and right axes",
        "   2. LEGEND FIELD (Segregate Field): If user wants to segregate one metric by a category (e.g., SalesValue by Brand), use legend_field",
        "       - Create 1 trace: x_column='Year', y_column='SalesValue', legend_field='Brand', aggregation='sum'",
        "       - Backend will create multiple series (one per Brand value) from single Y-axis",
        "       - Example: {'x_column': 'Year', 'y_column': 'SalesValue', 'legend_field': 'Brand', 'aggregation': 'sum'}",
        "🔧 DO NOT use multiple traces with different y_columns unless you want dual Y-axis (2 different metrics)",
        "🔧 For dual Y-axis: Always provide exactly 2 traces with different y_column values and same x_column",
        "🔧 For legend field segregation: Provide 1 trace with legend_field set to the categorical column name",
        "🔧 The frontend uses SIMPLE MODE (isAdvancedMode: false) with legendField or secondYAxis, NOT advanced traces mode",
        "🔧 FILTERS: Filters are enabled when x_column and y_column are provided - always include them in traces"
    ]
    
    @staticmethod
    def build_chart_maker_prompt(
        user_prompt: str,
        available_files_with_columns: Dict[str, Any],
        context: str,
        file_details: Optional[Dict[str, Any]] = None,
        other_files: Optional[List[str]] = None,
        matched_columns: Optional[Dict[str, List[str]]] = None
    ) -> str:
        """
        Build a complete chart_maker-specific prompt using BaseAgent infrastructure.
        
        Args:
            user_prompt: The user's input prompt
            available_files_with_columns: Dictionary of files with their columns
            context: Conversation context/history (provided by BaseAgent)
            file_details: Optional file metadata (provided by BaseAgent)
            other_files: Optional list of other available files (provided by BaseAgent)
            matched_columns: Optional matched columns dictionary (provided by BaseAgent)
        
        Returns:
            Complete formatted prompt string with chart_maker-specific templates and rules
        """
        return PromptBuilder.build_agent_specific_prompt(
            user_prompt=user_prompt,
            available_files_with_columns=available_files_with_columns,
            context=context,
            agent_name="chart maker",
            agent_description="creating charts and visualizations (bar, line, area, pie, scatter) from data files",
            success_template=ChartMakerPromptBuilder.SUCCESS_TEMPLATE,
            general_template=ChartMakerPromptBuilder.GENERAL_TEMPLATE,
            intelligence_rules=ChartMakerPromptBuilder.INTELLIGENCE_RULES,
            file_details=file_details,
            other_files=other_files,
            matched_columns=matched_columns
        )
    
    @staticmethod
    def get_success_template() -> Dict[str, Any]:
        """Get the success response template for chart maker operations."""
        return ChartMakerPromptBuilder.SUCCESS_TEMPLATE.copy()
    
    @staticmethod
    def get_general_template() -> Dict[str, Any]:
        """Get the general response template for chart maker operations."""
        return ChartMakerPromptBuilder.GENERAL_TEMPLATE.copy()
    
    @staticmethod
    def get_intelligence_rules() -> List[str]:
        """Get the intelligence rules for chart maker operations."""
        return ChartMakerPromptBuilder.INTELLIGENCE_RULES.copy()


# Convenience function for backward compatibility
def build_chart_maker_prompt(
    user_prompt: str,
    available_files_with_columns: Dict[str, Any],
    context: str,
    file_details: Optional[Dict[str, Any]] = None,
    other_files: Optional[List[str]] = None,
    matched_columns: Optional[Dict[str, List[str]]] = None
) -> str:
    """
    Build a chart_maker-specific prompt (convenience function).
    
    Args:
        user_prompt: The user's input prompt
        available_files_with_columns: Dictionary of files with their columns
        context: Conversation context/history
        file_details: Optional file metadata
        other_files: Optional list of other available files
        matched_columns: Optional matched columns dictionary
    
    Returns:
        Complete formatted prompt string
    """
    return ChartMakerPromptBuilder.build_chart_maker_prompt(
        user_prompt=user_prompt,
        available_files_with_columns=available_files_with_columns,
        context=context,
        file_details=file_details,
        other_files=other_files,
        matched_columns=matched_columns
    )

