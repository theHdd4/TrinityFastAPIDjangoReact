"""
Standard CreateTransform Prompt Builder for Trinity AI
Contains only create_transform-specific prompt logic.
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


class CreateTransformPromptBuilder:
    """CreateTransform-specific prompt building utilities."""
    
    # Default supported operations (can be customized)
    DEFAULT_SUPPORTED_OPERATIONS = {
        "add": "Add multiple numeric columns together (e.g., volume + sales_value)",
        "subtract": "Subtract columns (first column minus others, e.g., revenue - cost)",
        "multiply": "Multiply multiple numeric columns together (e.g., price * quantity)",
        "divide": "Divide columns (first column divided by others, e.g., revenue / volume)",
        "abs": "Create absolute value for numeric columns (|value|).",
        "power": "Raise a column to a specified power (requires `_param`, e.g., 2 for square).",
        "sqrt": "Calculate square root of a numeric column.",
        "log": "Calculate natural logarithm of a numeric column.",
        "exp": "Calculate exponential of a numeric column.",
        "residual": "Calculate regression residuals for a dependent column vs explanatory columns.",
        "dummy": "Create categorical dummy/label-encoded columns.",
        "datetime": "Extract year/month/week/day/day_name/month_name from a datetime column via `_param`.",
        "rpi": "Calculate relative price index (price / average_price).",
        "stl_outlier": "Detect STL outliers for date/volume columns.",
        "logistic": "Apply logistic saturation with `_param` JSON: {\"gr\": growth, \"co\": carryover, \"mp\": midpoint}.",
        "detrend": "Remove trend component using STL on a date-sorted series.",
        "deseasonalize": "Remove seasonal component using STL.",
        "detrend_deseasonalize": "Remove both trend and seasonality using STL.",
        "standardize_zscore": "Standardize numeric columns using z-score.",
        "standardize_minmax": "Scale numeric columns to 0-1 using min/max."
    }
    
    # Default operation format
    DEFAULT_OPERATION_FORMAT = """
[
  {
    "bucket_name": "trinity",
    "object_name": "exact_file_name.extension",
    "add_1": "column1,column2",
    "add_1_rename": "new_column_name",
    "multiply_1": "column3,column4",
    "multiply_1_rename": "product_column",
    "add_2": "column5,column6",
    "add_2_rename": "sum_of_columns"
  }
]

## Operation Examples:
## - "add_1": "volume,salesvalue" → "add_1_rename": "total_volume_sales"
## - "multiply_1": "price,quantity" → "multiply_1_rename": "total_revenue"
## - "subtract_1": "revenue,cost" → "subtract_1_rename": "profit_margin"
## - "divide_1": "revenue,volume" → "divide_1_rename": "price_per_unit"
##
## Special Parameters:
## - Datetime ops must include `<op>_<idx>_param` with one of: to_year, to_month, to_week, to_day, to_day_name, to_month_name.
## - Logistic ops require `<op>_<idx>_param` JSON: {"gr": growth_rate, "co": carryover, "mp": midpoint}.
## - Power ops require `<op>_<idx>_param` numeric exponent (e.g., 2 for square).
"""
    
    # CreateTransform-specific success response template
    SUCCESS_TEMPLATE = {
        "success": True,
        "create_transform_json": [
            {
                "bucket_name": "trinity",
                "object_name": "exact_file_name.extension",
                "add_1": "column1,column2",
                "add_1_rename": "new_column_name"
            }
        ],
        "reasoning": "Detailed explanation of why the CreateTransform atom was chosen, including: analysis of the user's request, why these specific columns were selected, why this transformation operation was chosen, alternatives considered, and complete raw thinking process. Be thorough and detailed - explain every decision and consideration.",
        "used_memory": True
    }
    
    # CreateTransform-specific general response template
    GENERAL_TEMPLATE = {
        "success": False,
        "suggestions": [
            "Here's what I found about your files:",
            "Available files for transformation: [list relevant files]",
            "Available operations: add, subtract, multiply, divide, abs, power, sqrt, log, exp, etc.",
            "Based on your previous patterns, I recommend:",
            "To complete transformation, specify: file + columns + operation + new column name",
            "Or say 'yes' to use my suggestions"
        ],
        "reasoning": "Detailed explanation of why the CreateTransform atom was chosen, including: analysis of the current situation, what files are available, what columns can be transformed, what operations are suitable, why CreateTransform is appropriate, recommendations based on available data, and complete raw thinking process. Be thorough and detailed - explain every consideration.",
        "file_analysis": {
            "total_files": "number",
            "recommended_files": ["file1", "file2"],
            "numeric_columns": ["col1", "col2"],
            "transformation_tips": [
                "Ensure columns are numeric for arithmetic operations",
                "Check column names match exactly (case-sensitive)",
                "Consider data types before applying transformations"
            ]
        },
        "next_steps": [
            "Ask about specific files or columns",
            "Request transformation suggestions",
            "Specify your transformation requirements",
            "Say 'yes' to use my recommendations"
        ]
    }
    
    # CreateTransform-specific intelligence rules
    INTELLIGENCE_RULES = [
        "USE COMPLETE HISTORY: Reference previous interactions, successful transformations, and user preferences",
        "SMART FILE SELECTION: Analyze user's request to identify the most appropriate files from the available list",
        "CONTEXT AWARENESS: Understand \"yes\", \"no\", \"use those\", \"transform them\" based on conversation",
        "MEMORY UTILIZATION: Suggest files and columns user has successfully used before",
        "PATTERN RECOGNITION: Identify user's preferred transformation operations and column combinations",
        "AUTOMATIC COLUMN DETECTION: When files are selected, automatically identify suitable columns for transformation",
        "OPERATION SELECTION: Choose appropriate operations based on column types (numeric for arithmetic, categorical for dummy, etc.)",
        "VALIDATION: Always ensure suggested columns exist in the AVAILABLE FILES AND COLUMNS section",
        "COLUMN NORMALIZATION: All column names MUST be lowercase in the final output",
        "FILE VALIDATION: Use exact file names from the Available Files section"
    ]
    
    @staticmethod
    def build_create_transform_prompt(
        user_prompt: str,
        available_files_with_columns: Dict[str, Any],
        context: str,
        supported_operations: Optional[Dict[str, str]] = None,
        operation_format: Optional[str] = None,
        file_details: Optional[Dict[str, Any]] = None,
        other_files: Optional[List[str]] = None,
        matched_columns: Optional[Dict[str, List[str]]] = None
    ) -> str:
        """
        Build a complete create_transform-specific prompt using BaseAgent infrastructure.
        
        Args:
            user_prompt: The user's input prompt
            available_files_with_columns: Dictionary of files with their columns
            context: Conversation context/history (provided by BaseAgent)
            supported_operations: Dictionary of supported operations and their descriptions
            operation_format: Format string for operation JSON structure
            file_details: Optional file metadata (provided by BaseAgent)
            other_files: Optional list of other available files (provided by BaseAgent)
            matched_columns: Optional matched columns dictionary (provided by BaseAgent)
        
        Returns:
            Complete formatted prompt string with create_transform-specific templates and rules
        """
        import json
        
        # Use defaults if not provided
        if supported_operations is None:
            supported_operations = CreateTransformPromptBuilder.DEFAULT_SUPPORTED_OPERATIONS
        if operation_format is None:
            operation_format = CreateTransformPromptBuilder.DEFAULT_OPERATION_FORMAT
        
        # Build supported operations section
        ops_section = "## Supported Operations:\n"
        for op_name, op_desc in supported_operations.items():
            ops_section += f"- **{op_name}**: {op_desc}\n"
        
        # Build the base prompt using PromptBuilder
        base_prompt = PromptBuilder.build_agent_specific_prompt(
            user_prompt=user_prompt,
            available_files_with_columns=available_files_with_columns,
            context=context,
            agent_name="create_transform",
            agent_description="creating and transforming data columns using various operations (add, subtract, multiply, divide, abs, power, sqrt, log, exp, dummy, datetime, etc.)",
            success_template=CreateTransformPromptBuilder.SUCCESS_TEMPLATE,
            general_template=CreateTransformPromptBuilder.GENERAL_TEMPLATE,
            intelligence_rules=CreateTransformPromptBuilder.INTELLIGENCE_RULES,
            file_details=file_details,
            other_files=other_files,
            matched_columns=matched_columns
        )
        
        # Insert supported operations and format into the prompt
        # Find where to insert (after file information, before intelligence rules)
        prompt_parts = base_prompt.split("INTELLIGENCE RULES:")
        if len(prompt_parts) == 2:
            # Insert operations section before intelligence rules
            enhanced_prompt = prompt_parts[0] + ops_section + "\n" + operation_format + "\n\nINTELLIGENCE RULES:" + prompt_parts[1]
        else:
            # Fallback: append at the end
            enhanced_prompt = base_prompt + "\n\n" + ops_section + "\n" + operation_format
        
        return enhanced_prompt
    
    @staticmethod
    def get_success_template() -> Dict[str, Any]:
        """Get the success response template for create_transform operations."""
        return CreateTransformPromptBuilder.SUCCESS_TEMPLATE.copy()
    
    @staticmethod
    def get_general_template() -> Dict[str, Any]:
        """Get the general response template for create_transform operations."""
        return CreateTransformPromptBuilder.GENERAL_TEMPLATE.copy()
    
    @staticmethod
    def get_intelligence_rules() -> List[str]:
        """Get the intelligence rules for create_transform operations."""
        return CreateTransformPromptBuilder.INTELLIGENCE_RULES.copy()


# Convenience function for backward compatibility
def build_create_transform_prompt(
    user_prompt: str,
    available_files_with_columns: Dict[str, Any],
    context: str,
    supported_operations: Optional[Dict[str, str]] = None,
    operation_format: Optional[str] = None,
    file_details: Optional[Dict[str, Any]] = None,
    other_files: Optional[List[str]] = None,
    matched_columns: Optional[Dict[str, List[str]]] = None
) -> str:
    """
    Build a create_transform-specific prompt (convenience function).
    
    Args:
        user_prompt: The user's input prompt
        available_files_with_columns: Dictionary of files with their columns
        context: Conversation context/history
        supported_operations: Dictionary of supported operations and their descriptions
        operation_format: Format string for operation JSON structure
        file_details: Optional file metadata
        other_files: Optional list of other available files
        matched_columns: Optional matched columns dictionary
    
    Returns:
        Complete formatted prompt string
    """
    return CreateTransformPromptBuilder.build_create_transform_prompt(
        user_prompt=user_prompt,
        available_files_with_columns=available_files_with_columns,
        context=context,
        supported_operations=supported_operations,
        operation_format=operation_format,
        file_details=file_details,
        other_files=other_files,
        matched_columns=matched_columns
    )





