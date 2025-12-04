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
        "reasoning": "Detailed explanation of why the DataUploadValidate atom was chosen, including: analysis of the user's request, why this specific file was selected, why these dtype changes were chosen, alternatives considered, and complete raw thinking process. Be thorough and detailed - explain every decision and consideration.",
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
        "reasoning": "Detailed explanation of why the DataUploadValidate atom was chosen, including: analysis of the current situation, what files are available, what the user might want, analysis of the request, why DataUploadValidate is appropriate, what information is needed, recommendations based on available data, and complete raw thinking process. Be thorough and detailed - explain every consideration.",
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
        "REQUIRED JSON KEYS: success, validate_json (when success true), and reasoning must ALL be present so the UI always has a friendly response"
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


