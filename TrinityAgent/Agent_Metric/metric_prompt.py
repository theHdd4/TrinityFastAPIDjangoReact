"""
Standard Metric Prompt Builder for Trinity AI
Contains only metric-specific prompt logic.
Uses BaseAgent infrastructure for file details, history, validation, and JSON instructions.
Handles three operation types: Input, Variables, and Column Ops.
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


class MetricPromptBuilder:
    """Metric-specific prompt building utilities."""
    
    # Metric-specific success response template for Variables operation
    VARIABLES_SUCCESS_TEMPLATE = {
        "success": True,
        "operation_type": "variables",
        "reasoning": "Detailed explanation of the variable operation, including: analysis of the user's request, why this operation type was chosen, which columns were selected, what aggregation/computation method was used, whether it's compute or assign mode, whether within-group computation is needed, and complete raw thinking process. Be thorough and detailed - explain every decision and consideration.",
        "data_source": "path/to/source/file.arrow",
        "file_name": "result_file.arrow",
        "operation_config": {
            "variable_type": "dataframe",  # or "constant"
            "compute_mode": "whole-dataframe",  # or "within-group"
            "identifiers": [],  # List of identifier columns for within-group mode
            "operations": [  # For compute mode
                {
                    "numericalColumn": "column_name",
                    "method": "sum",  # sum, mean, median, max, min, count, nunique, rank_pct, add, subtract, multiply, divide
                    "secondColumn": "",  # For arithmetic operations
                    "secondValue": None,  # For arithmetic with number
                    "customName": ""  # Optional custom variable name
                }
            ],
            "assignments": []  # For assign mode: [{"variableName": "var1", "value": "100"}]
        },
        "metrics_json": {
            "variable_type": "dataframe",
            "compute_mode": "whole-dataframe",
            "operations": []
        },
        "used_memory": True
    }
    
    # Metric-specific success response template for Column Ops operation
    COLUMN_OPS_SUCCESS_TEMPLATE = {
        "success": True,
        "operation_type": "column_ops",
        "reasoning": "Detailed explanation of the column operation, including: analysis of the user's request, which operation type was selected, which columns were involved, what parameters were configured, and complete raw thinking process. Be thorough and detailed - explain every decision and consideration.",
        "data_source": "path/to/source/file.arrow",
        "file_name": "result_file.arrow",
        "operation_config": {
            "operation_type": "filter_rows_condition",  # One of the available operation types
            "columns": ["column1"],  # Columns involved in operation
            "parameters": {},  # Operation-specific parameters
            "identifiers": []  # For grouped operations
        },
        "metrics_json": {
            "operation_type": "filter_rows_condition",
            "config": {}
        },
        "used_memory": True
    }
    
    # Metric-specific success response template for Input operation
    INPUT_SUCCESS_TEMPLATE = {
        "success": True,
        "operation_type": "input",
        "reasoning": "Detailed explanation of data source selection, including: analysis of available files, why this specific file was chosen, what columns it contains, and how it relates to the user's request. Be thorough and detailed - explain every decision and consideration.",
        "data_source": "path/to/selected/file.arrow",
        "file_name": "selected_file.arrow",
        "operation_config": {
            "selected_file": "file.arrow"
        },
        "metrics_json": {
            "data_source": "path/to/selected/file.arrow"
        },
        "used_memory": True
    }
    
    # Metric-specific general response template
    GENERAL_TEMPLATE = {
        "success": False,
        "suggestions": [
            "Here are the available metric operations:",
            "1. Input - Select a data source file",
            "2. Variables - Create computed or assigned variables",
            "3. Column Ops - Perform column operations (filter, transform, etc.)",
            "Please specify which operation you'd like to perform",
            "Or provide more details about what you want to do"
        ],
        "reasoning": "Detailed explanation of why the Metric atom was chosen, including: analysis of the current situation, what operations are available, what the user might want, analysis of the request, why Metric is appropriate, what information is needed, recommendations based on available data, and complete raw thinking process. Be thorough and detailed - explain every consideration.",
        "available_operations": {
            "input": "Select data source from available files",
            "variables": "Create variables (compute from dataframe or assign constants)",
            "column_ops": "Perform column operations (filter rows, create columns, transformations)"
        },
        "next_steps": [
            "Specify operation type (Input, Variables, or Column Ops)",
            "Provide file name and column details",
            "Describe what metric or operation you want to create",
            "Ask about available operations"
        ]
    }
    
    # Available column operations list (from MetricsColOps.tsx)
    AVAILABLE_OPERATIONS = [
        # Numeric
        "add", "subtract", "multiply", "divide", "power", "log", "exp", "sqrt", "logistic", "dummy", "pct_change",
        # String Ops
        "lower", "upper", "strip", "replace", "fill_na",
        # Grouped Metrics
        "compute_metrics_within_group", "group_share_of_total", "group_contribution",
        # Time Series
        "lag", "lead", "diff", "growth_rate", "rolling_mean", "rolling_sum", "rolling_min", "rolling_max", "cumulative_sum",
        # Date Helpers
        "datetime", "fiscal_mapping", "is_weekend", "is_month_end", "is_qtr_end", "date_builder",
        # Row Filtering
        "filter_rows_condition", "filter_top_n_per_group", "filter_percentile",
        # Dataframe Level Ops
        "select_columns", "drop_columns", "rename", "reorder", "deduplicate", "sort_rows",
        # Statistical
        "detrend", "deseasonalize", "detrend_deseasonalize", "stl_outlier", "standardize_minmax", "standardize_zscore", "residual", "rpi"
    ]
    
    # Metric-specific intelligence rules
    INTELLIGENCE_RULES = [
        "USE COMPLETE HISTORY: Reference previous interactions, successful metric operations, and user preferences",
        "SMART OPERATION DETECTION: Analyze user's request to identify the most appropriate operation type (Input, Variables, or Column Ops)",
        "CONTEXT AWARENESS: Understand user intent from natural language queries",
        "MEMORY UTILIZATION: Suggest files and operations user has successfully used before",
        "PATTERN RECOGNITION: Identify user's preferred operations and column selections",
        "VARIABLE OPERATIONS: For 'create variable', 'compute variable', 'assign variable' - use Variables operation type",
        "COLUMN OPERATIONS: For 'filter rows', 'create column', 'transform column' - use Column Ops operation type",
        "INPUT OPERATIONS: For 'select file', 'choose data source' - use Input operation type",
        "COMPUTE MODE: Determine if variables should be computed whole-dataframe or within-group based on user request",
        "AGGREGATION METHODS: Support sum, mean, median, max, min, count, nunique, rank_pct for variable computation",
        "ARITHMETIC OPERATIONS: Support add, subtract, multiply, divide for variable computation",
        "IDENTIFIERS: For within-group computation, identify categorical columns suitable for grouping",
        "VALIDATION: Always ensure suggested files exist in the AVAILABLE FILES AND COLUMNS section",
        "OPERATION PARAMETERS: Extract all required parameters for the selected operation type",
        "FILE NAMING: Suggest appropriate file names for result files based on operation type"
    ]
    
    @staticmethod
    def build_metric_prompt(
        user_prompt: str,
        available_files_with_columns: Dict[str, Any],
        context: str,
        file_details: Optional[Dict[str, Any]] = None,
        other_files: Optional[List[str]] = None,
        matched_columns: Optional[Dict[str, List[str]]] = None
    ) -> str:
        """
        Build a complete metric-specific prompt using BaseAgent infrastructure.
        
        Args:
            user_prompt: The user's input prompt
            available_files_with_columns: Dictionary of files with their columns
            context: Conversation context/history (provided by BaseAgent)
            file_details: Optional file metadata (provided by BaseAgent)
            other_files: Optional list of other available files (provided by BaseAgent)
            matched_columns: Optional matched columns dictionary (provided by BaseAgent)
        
        Returns:
            Complete formatted prompt string with metric-specific templates and rules
        """
        # Build base prompt using BaseAgent infrastructure
        base_prompt = PromptBuilder.build_agent_specific_prompt(
            user_prompt=user_prompt,
            available_files_with_columns=available_files_with_columns,
            context=context,
            agent_name="metric",
            agent_description="performing metric operations including data source selection (Input), variable creation (Variables), and column operations (Column Ops)",
            success_template=MetricPromptBuilder.VARIABLES_SUCCESS_TEMPLATE,  # Use Variables as default template
            general_template=MetricPromptBuilder.GENERAL_TEMPLATE,
            intelligence_rules=MetricPromptBuilder.INTELLIGENCE_RULES,
            file_details=file_details,
            other_files=other_files,
            matched_columns=matched_columns
        )
        
        # Add metric-specific operation information
        operations_section = "\n\n## AVAILABLE COLUMN OPERATIONS\n\n"
        operations_section += "The following column operations are available:\n\n"
        
        # Group operations by category
        operation_categories = {
            "Numeric": ["add", "subtract", "multiply", "divide", "power", "log", "exp", "sqrt", "logistic", "dummy", "pct_change"],
            "String Ops": ["lower", "upper", "strip", "replace", "fill_na"],
            "Grouped Metrics": ["compute_metrics_within_group", "group_share_of_total", "group_contribution"],
            "Time Series": ["lag", "lead", "diff", "growth_rate", "rolling_mean", "rolling_sum", "rolling_min", "rolling_max", "cumulative_sum"],
            "Date Helpers": ["datetime", "fiscal_mapping", "is_weekend", "is_month_end", "is_qtr_end", "date_builder"],
            "Row Filtering": ["filter_rows_condition", "filter_top_n_per_group", "filter_percentile"],
            "Dataframe Level Ops": ["select_columns", "drop_columns", "rename", "reorder", "deduplicate", "sort_rows"],
            "Statistical": ["detrend", "deseasonalize", "detrend_deseasonalize", "stl_outlier", "standardize_minmax", "standardize_zscore", "residual", "rpi"]
        }
        
        for category, ops in operation_categories.items():
            operations_section += f"### {category}\n"
            for op in ops:
                operations_section += f"- {op}\n"
            operations_section += "\n"
        
        # Add operation type templates
        operations_section += "\n## OPERATION TYPE TEMPLATES\n\n"
        operations_section += "### Variables Operation (operation_type: 'variables')\n"
        operations_section += "Use this for creating computed or assigned variables.\n"
        operations_section += "Template:\n"
        operations_section += str(MetricPromptBuilder.VARIABLES_SUCCESS_TEMPLATE).replace("'", '"')
        operations_section += "\n\n"
        
        operations_section += "### Column Ops Operation (operation_type: 'column_ops')\n"
        operations_section += "Use this for column transformations, filtering, and dataframe operations.\n"
        operations_section += "Template:\n"
        operations_section += str(MetricPromptBuilder.COLUMN_OPS_SUCCESS_TEMPLATE).replace("'", '"')
        operations_section += "\n\n"
        
        operations_section += "### Input Operation (operation_type: 'input')\n"
        operations_section += "Use this for selecting a data source file.\n"
        operations_section += "Template:\n"
        operations_section += str(MetricPromptBuilder.INPUT_SUCCESS_TEMPLATE).replace("'", '"')
        operations_section += "\n\n"
        
        # Combine base prompt with operations section
        full_prompt = base_prompt + operations_section
        
        return full_prompt
    
    @staticmethod
    def get_success_template(operation_type: str = "variables") -> Dict[str, Any]:
        """Get the success response template for the specified operation type."""
        templates = {
            "variables": MetricPromptBuilder.VARIABLES_SUCCESS_TEMPLATE,
            "column_ops": MetricPromptBuilder.COLUMN_OPS_SUCCESS_TEMPLATE,
            "input": MetricPromptBuilder.INPUT_SUCCESS_TEMPLATE
        }
        return templates.get(operation_type, MetricPromptBuilder.VARIABLES_SUCCESS_TEMPLATE).copy()
    
    @staticmethod
    def get_general_template() -> Dict[str, Any]:
        """Get the general response template for metric operations."""
        return MetricPromptBuilder.GENERAL_TEMPLATE.copy()
    
    @staticmethod
    def get_intelligence_rules() -> List[str]:
        """Get the intelligence rules for metric operations."""
        return MetricPromptBuilder.INTELLIGENCE_RULES.copy()


# Convenience function for backward compatibility
def build_metric_prompt(
    user_prompt: str,
    available_files_with_columns: Dict[str, Any],
    context: str,
    file_details: Optional[Dict[str, Any]] = None,
    other_files: Optional[List[str]] = None,
    matched_columns: Optional[Dict[str, List[str]]] = None
) -> str:
    """Convenience function to build metric prompt."""
    return MetricPromptBuilder.build_metric_prompt(
        user_prompt=user_prompt,
        available_files_with_columns=available_files_with_columns,
        context=context,
        file_details=file_details,
        other_files=other_files,
        matched_columns=matched_columns
    )

