"""
Standard DataUploadValidate Prompt Builder for Trinity AI
Contains only data_upload_validate-specific prompt logic.
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


class DataUploadValidatePromptBuilder:
    """DataUploadValidate-specific prompt building utilities."""
    
    # DataUploadValidate-specific success response template
    SUCCESS_TEMPLATE = {
        "success": True,
        "validate_json": {
            "file_name": "exact_filename.csv",
            "dtype_changes": {
                "column_name_1": "int64",
                "column_name_2": "float64",
                "column_name_3": {"dtype": "datetime64", "format": "YYYY-MM-DD"},
                "column_name_4": "object"
            }
        },
        "response": "Raw thinking and reasoning from LLM about the data validation and dtype conversion, including why this file was selected, why these dtype changes were chosen, and any considerations made",
        "smart_response": "I'll help you validate and convert data types in a two-step process:\n\n📂 **Step 1: Load File**\nI'll load \"exact_filename.csv\" into the data upload atom so you can see it in the UI.\n\n🔄 **Step 2: Apply Dtype Conversions**\nI'll convert the following columns:\n• column_name_1 → int64\n• column_name_2 → float64\n• column_name_3 → datetime64 with format YYYY-MM-DD\n• column_name_4 → object\n\n💡 **Insights:**\nThese conversions will ensure your data types are correct for downstream operations.",
        "reasoning": "Found all required components with context from history",
        "used_memory": True
    }
    
    # DataUploadValidate-specific general response template
    GENERAL_TEMPLATE = {
        "success": False,
        "suggestions": [
            "Here's what I found about your files:",
            "Available files for data validation: [list relevant files]",
            "Columns in [file]: [list columns]",
            "Based on your previous patterns, I recommend:",
            "To validate data, specify: file name + optional dtype changes",
            "Or say 'yes' to use my suggestions"
        ],
        "response": "Raw thinking and reasoning from LLM about the current situation, what files are available, what the user might want, analysis of the request, and recommendations based on available data",
        "smart_response": "I'd be happy to help you validate and convert data types! Here are your available files and their columns: [FORMAT: **filename.csv** (X columns) - column1, column2, column3, etc.]. I can help you load files and convert data types (int64, float64, datetime64, object, bool). What would you like to validate?",
        "reasoning": "Providing helpful information and guidance",
        "file_analysis": {
            "total_files": "number",
            "recommended_files": ["file1"],
            "dtype_tips": [
                "Use int64 for integer numbers",
                "Use float64 for decimal numbers",
                "Use datetime64 for date/time data (can specify format)",
                "Use object for text/string data",
                "Use bool for boolean values"
            ]
        },
        "next_steps": [
            "Ask about specific files or columns",
            "Request dtype conversion suggestions",
            "Specify your validation requirements",
            "Say 'yes' to use my recommendations"
        ]
    }
    
    # DataUploadValidate-specific intelligence rules
    INTELLIGENCE_RULES = [
        "USE COMPLETE HISTORY: Reference previous interactions, successful validations, and user preferences",
        "SMART FILE SELECTION: Analyze user's request to identify the most appropriate file from the available list",
        "CONTEXT AWARENESS: Understand \"yes\", \"no\", \"use that\", \"apply that\" based on conversation",
        "MEMORY UTILIZATION: Suggest files user has successfully used before",
        "PATTERN RECOGNITION: Identify user's preferred dtype conversions and validation patterns",
        "AUTOMATIC DTYPE DETECTION: When file is selected, automatically identify columns that might need dtype conversion based on data patterns",
        "SMART DTYPE SELECTION: Suggest appropriate dtypes based on column names and data patterns (dates → datetime64, numbers → int64/float64, text → object)",
        "VALIDATION: Always ensure suggested files exist in the AVAILABLE FILES AND COLUMNS section",
        "DTYPE CHANGES: Support int64, float64, datetime64 (with optional format), object, and bool",
        "OPTIONAL DTYPE CHANGES: If user only wants to load file without dtype changes, set dtype_changes to empty object {}",
        "DATETIME FORMATS: For datetime64, can include format specification: {\"dtype\": \"datetime64\", \"format\": \"YYYY-MM-DD\"}",
        "FILE LOADING: Primary goal is to load the file into the data upload atom - dtype changes are optional",
        "REQUIRED JSON KEYS: success, validate_json (when success true), and smart_response must ALL be present so the UI always has a friendly response"
    ]

    @staticmethod
    def build_data_upload_validate_prompt(
        user_prompt: str,
        available_files_with_columns: Dict[str, Any],
        context: str,
        file_details: Optional[Dict[str, Any]] = None,
        other_files: Optional[List[str]] = None,
        matched_columns: Optional[str] = None
    ) -> str:
        """
        Build a complete DataUploadValidate-specific prompt using BaseAgent infrastructure.
        """
        return PromptBuilder.build_agent_specific_prompt(
            user_prompt=user_prompt,
            available_files_with_columns=available_files_with_columns,
            context=context,
            agent_name="Data Upload and Validate",
            agent_description="loading files into the data upload atom and applying dtype conversions (int64, float64, datetime64, object, bool)",
            success_template=DataUploadValidatePromptBuilder.SUCCESS_TEMPLATE,
            general_template=DataUploadValidatePromptBuilder.GENERAL_TEMPLATE,
            intelligence_rules=DataUploadValidatePromptBuilder.INTELLIGENCE_RULES,
            file_details=file_details,
            other_files=other_files,
            matched_columns=matched_columns
        )


