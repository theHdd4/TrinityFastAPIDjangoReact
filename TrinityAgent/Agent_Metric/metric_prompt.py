"""
Standard Metric Prompt Builder for Trinity AI
Contains only metric-specific prompt logic.
Uses BaseAgent infrastructure for file details, history, validation, and JSON instructions.
"""

from typing import Dict, Any, List, Optional
import sys
import json
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
    
    # Metric-specific success response templates for different operation types
    
    # Input Operation Template
    INPUT_SUCCESS_TEMPLATE = {
        "success": True,
        "operation_type": "input",
        "api_endpoint": None,  # No backend API call needed
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
    
    # Variables Operation Template (Constant Mode)
    VARIABLES_CONSTANT_SUCCESS_TEMPLATE = {
        "success": True,
        "operation_type": "variables",
        "api_endpoint": "/variables/assign",
        "reasoning": "Detailed explanation of the constant variable assignment, including: analysis of the user's request, why constant variables were chosen, what values were assigned, and complete raw thinking process. Be thorough and detailed - explain every decision and consideration.",
        "data_source": "path/to/source/file.arrow",
        "file_name": "result_file.arrow",
        "operation_config": {
            "variable_type": "constant",
            "assignments": [
                {
                    "variableName": "variable1",  # REQUIRED - exact backend field name (camelCase)
                    "value": "value1"  # REQUIRED - string value
                }
            ]
        },
        "metrics_json": {
            "variable_type": "constant",
            "assignments": []
        },
        "used_memory": True
    }
    
    # Variables Operation Template (Dataframe Mode)
    VARIABLES_DATAFRAME_SUCCESS_TEMPLATE = {
        "success": True,
        "operation_type": "variables",
        "api_endpoint": "/variables/compute",
        "reasoning": "Detailed explanation of the variable computation, including: analysis of the user's request, why this operation type was chosen, which columns were selected, what aggregation/computation method was used, whether it's whole-dataframe or within-group computation, and complete raw thinking process. Be thorough and detailed - explain every decision and consideration.",
        "data_source": "path/to/source/file.arrow",
        "file_name": "result_file.arrow",
        "operation_config": {
            "variable_type": "dataframe",
            "compute_mode": "whole-dataframe",  # "whole-dataframe" or "within-group"
            "identifiers": [],  # Array of strings - ONLY required if compute_mode is "within-group"
            "operations": [  # For dataframe compute mode
                {
                    "numericalColumn": "column1",  # REQUIRED - exact backend field name (camelCase), use actual column name from available files
                    "method": "sum",  # REQUIRED - sum, mean, median, max, min, count, nunique, rank_pct, add, subtract, multiply, divide
                    "secondColumn": "column2",  # Optional - for arithmetic operations with another column, use actual column name from available files
                    "secondValue": 10,  # Optional - for arithmetic operations with a number (mutually exclusive with secondColumn)
                    "customName": "computed_variable"  # Optional - custom variable name
                }
            ]
        },
        "metrics_json": {
            "variable_type": "dataframe",
            "compute_mode": "whole-dataframe",
            "operations": []
        },
        "used_memory": True
    }
    
    # Column Ops Operation Template
    COLUMN_OPS_SUCCESS_TEMPLATE = {
        "success": True,
        "operation_type": "column_ops",
        "api_endpoint": "/create-column/perform",
        "api_endpoint_save": "/create-column/save",
        "reasoning": "Detailed explanation of the column operation, including: analysis of the user's request, which operation type was selected, which columns were involved, what parameters were configured, and complete raw thinking process. Be thorough and detailed - explain every decision and consideration.",
        "data_source": "path/to/source/file.arrow",
        "file_name": "result_file.arrow",
        "operation_config": {
            "method": "divide",  # REQUIRED - operation type (add, subtract, multiply, divide, lag, lead, etc.)
            "columns": ["column1", "column2"],  # REQUIRED - array of column names, use actual column names from available files
            "rename": "new_column_name",  # Optional - new column name
            "parameters": {},  # Optional - operation-specific parameters
            "identifiers": []  # Optional - for grouped operations
        },
        "metrics_json": {
            "method": "divide",
            "columns": ["column1", "column2"],  # Use actual column names from available files
            "rename": "new_column_name"
        },
        "used_memory": True
    }
    
    # General response template (when more info needed)
    GENERAL_TEMPLATE = {
        "success": False,
        "suggestions": [
            "Here's what I can help you with:",
            "1. Select a data source file (Input operation)",
            "2. Create computed or assigned variables (Variables operation)",
            "3. Perform column transformations (Column Ops operation)",
            "Please specify which operation you'd like to perform and provide details."
        ],
        "reasoning": "Detailed explanation of why the Metric atom was chosen, including: analysis of the current situation, what operations are available, what the user might want, analysis of the request, why Metric is appropriate, what information is needed, recommendations based on available data, and complete raw thinking process. Be thorough and detailed - explain every consideration.",
        "file_analysis": {
            "total_files": "number",
            "recommended_files": ["file1.arrow", "file2.arrow"],
            "available_columns": ["col1", "col2"],
            "operation_tips": [
                "Use Input operation to select a data source",
                "Use Variables operation to create computed metrics",
                "Use Column Ops operation to transform columns"
            ]
        },
        "next_steps": [
            "Specify which operation type you want (Input/Variables/Column Ops)",
            "Provide data source file name",
            "Specify columns and operations needed",
            "Say 'yes' to use my recommendations"
        ]
    }
    
    # Metric-specific intelligence rules
    INTELLIGENCE_RULES = [
        "USE COMPLETE HISTORY: Reference previous interactions, successful operations, and user preferences",
        "SMART OPERATION SELECTION: Analyze user's request to determine the most appropriate operation type (Input/Variables/Column Ops)",
        "CONTEXT AWARENESS: Understand \"yes\", \"no\", \"use that\", \"create that\" based on conversation",
        "MEMORY UTILIZATION: Suggest files and operations user has successfully used before",
        "PATTERN RECOGNITION: Identify user's preferred operation types and column combinations",
        "AUTOMATIC COLUMN DETECTION: When operations are requested, automatically identify relevant columns from available files",
        "SMART VARIABLE TYPE: Determine if user wants constant assignment or dataframe computation based on request",
        "SMART COMPUTE MODE: Use 'whole-dataframe' as default, use 'within-group' only if grouping is mentioned",
        "VALIDATION: Always ensure suggested files exist in the AVAILABLE FILES AND COLUMNS section",
        "EXACT FIELD NAMES: Use exact backend field names - camelCase for variables (variableName, numericalColumn, secondColumn, customName), snake_case for column ops (operation_type, created_column_name)",
        "API ENDPOINT SPECIFICATION: Always include 'api_endpoint' field specifying which backend API to call",
        "COLUMN OPS FORMAT: For column operations, use FormData format with {method}_0 = comma-separated columns",
        "VARIABLES FORMAT: For variables, use exact camelCase field names matching backend expectations",
        "FILE VALIDATION: Before using any file, verify it exists in the available files list",
        "USE ACTUAL COLUMN NAMES: Always use the exact column names from the AVAILABLE FILES AND COLUMNS section - do NOT use example column names like 'SalesValue', 'Volume', 'column1', etc. Use the actual column names from the user's files",
        "USE ACTUAL FILE NAMES: Always use the exact file names from the AVAILABLE FILES AND COLUMNS section - do NOT use example file names like 'file1.arrow', 'data_file.arrow', etc. Use the actual file names from the available files list",
        "AVOID HALLUCINATION: Do not copy example column names or file names from templates. Always reference the actual columns and files provided in the AVAILABLE FILES AND COLUMNS section"
    ]
    
    @staticmethod
    def _load_operations_rag() -> str:
        """Load the condensed column operations RAG document for reference."""
        try:
            # Try condensed version first (smaller, faster)
            rag_path = Path(__file__).parent / "column_operations_rag_condensed.md"
            if not rag_path.exists():
                # Fallback to full version if condensed doesn't exist
                rag_path = Path(__file__).parent / "column_operations_rag.md"
            if rag_path.exists():
                with open(rag_path, 'r', encoding='utf-8') as f:
                    return f.read()
        except Exception:
            # Silently fail if RAG can't be loaded
            pass
        return ""
    
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
        # Build the base prompt using PromptBuilder
        prompt = PromptBuilder.build_agent_specific_prompt(
            user_prompt=user_prompt,
            available_files_with_columns=available_files_with_columns,
            context=context,
            agent_name="metric",
            agent_description="performing metric operations including data source selection, variable creation, and column transformations",
            success_template=MetricPromptBuilder.INPUT_SUCCESS_TEMPLATE,  # Use input as default
            general_template=MetricPromptBuilder.GENERAL_TEMPLATE,
            intelligence_rules=MetricPromptBuilder.INTELLIGENCE_RULES,
            file_details=file_details,
            other_files=other_files,
            matched_columns=matched_columns
        )
        
        # Add JSON output reminder right after base prompt
        prompt += "\n\n" + "="*80 + "\n"
        prompt += "⚠️ CRITICAL: YOUR RESPONSE MUST BE VALID JSON ONLY ⚠️\n"
        prompt += "="*80 + "\n"
        prompt += "Return ONLY a JSON object. Do NOT include explanations, reasoning text, markdown, or any other content.\n"
        prompt += "Start with '{' and end with '}'. The backend will parse your JSON directly.\n"
        prompt += "="*80 + "\n\n"
        
        # Add operations section after the base prompt
        operations_section = "\n\n## METRIC OPERATION TYPES:\n\n"
        operations_section += "You can perform three types of operations:\n\n"
        
        operations_section += "### 1. Input Operation (operation_type: 'input')\n"
        operations_section += "Use this for selecting a data source file.\n"
        operations_section += "REQUIRED: Include 'api_endpoint' field set to null (no backend call needed)\n"
        operations_section += "Template:\n"
        operations_section += json.dumps(MetricPromptBuilder.INPUT_SUCCESS_TEMPLATE, indent=2)
        operations_section += "\n\n"
        
        operations_section += "### 2. Variables Operation (operation_type: 'variables')\n"
        operations_section += "Use this for creating computed or assigned variables.\n"
        operations_section += "REQUIRED: Include 'api_endpoint' field:\n"
        operations_section += "- For constant mode: '/variables/assign'\n"
        operations_section += "- For dataframe mode: '/variables/compute'\n"
        operations_section += "IMPORTANT: Field names must match backend exactly:\n"
        operations_section += "- Use 'numericalColumn' (not 'numerical_column')\n"
        operations_section += "- Use 'variableName' (not 'variable_name')\n"
        operations_section += "- Use 'computeMode' (not 'compute_mode')\n"
        operations_section += "- Use 'secondColumn' (not 'second_column')\n"
        operations_section += "- Use 'secondValue' (not 'second_value')\n"
        operations_section += "- Use 'customName' (not 'custom_name')\n"
        operations_section += "CRITICAL: Use ACTUAL column names from AVAILABLE FILES AND COLUMNS section - do NOT use example names like 'column1', 'sales', 'quantity' from templates\n"
        operations_section += "Constant Mode Template:\n"
        operations_section += json.dumps(MetricPromptBuilder.VARIABLES_CONSTANT_SUCCESS_TEMPLATE, indent=2)
        operations_section += "\n\n"
        operations_section += "Dataframe Mode Template:\n"
        operations_section += json.dumps(MetricPromptBuilder.VARIABLES_DATAFRAME_SUCCESS_TEMPLATE, indent=2)
        operations_section += "\n\n"
        
        operations_section += "### 3. Column Ops Operation (operation_type: 'column_ops')\n"
        operations_section += "Use this for column transformations, filtering, and dataframe operations.\n"
        operations_section += "REQUIRED: Include 'api_endpoint' and 'api_endpoint_save' fields:\n"
        operations_section += "- 'api_endpoint': '/create-column/perform' (to perform operation)\n"
        operations_section += "- 'api_endpoint_save': '/create-column/save' (to save results)\n"
        operations_section += "IMPORTANT: Handler will convert to FormData format automatically.\n"
        operations_section += "Provide 'method' (operation type), 'columns' (array), 'rename' (optional), 'parameters' (object), 'identifiers' (array)\n"
        operations_section += "CRITICAL: Use ACTUAL column names from AVAILABLE FILES AND COLUMNS section - do NOT use example names like 'column1', 'column2', 'SalesValue', 'Volume' from templates\n"
        operations_section += "\n"
        operations_section += "AVAILABLE OPERATIONS AND THEIR REQUIREMENTS:\n"
        operations_section += "Refer to column_operations_rag.md for complete operation reference.\n"
        operations_section += "\n"
        operations_section += "QUICK REFERENCE:\n"
        operations_section += "- Arithmetic (2+ columns): add, subtract, multiply, divide, pct_change (exactly 2), residual (2+)\n"
        operations_section += "- Single Column Numeric: abs, log, sqrt, exp, power (needs param: exponent)\n"
        operations_section += "- String Ops (in-place): lower, upper, strip, replace (needs oldValue, newValue)\n"
        operations_section += "- Missing Values: fill_na (needs strategy: mean/median/mode/zero/empty/drop/custom)\n"
        operations_section += "- Date/Time (needs date column): datetime (needs param: to_year/to_month/etc), lag, lead, diff, growth_rate (all need param: period)\n"
        operations_section += "- Rolling (needs date column + param: window): rolling_mean, rolling_sum, rolling_min, rolling_max\n"
        operations_section += "- Time Series (needs date column + identifiers): detrend, deseasonalize, detrend_deseasonalize (optional param: period)\n"
        operations_section += "- Standardization (needs identifiers): standardize_zscore, standardize_minmax\n"
        operations_section += "- Advanced: dummy, logistic (needs param: JSON with gr/co/mp), rpi (2+ columns), cumulative_sum (needs date column)\n"
        operations_section += "- Dataframe: select_columns, drop_columns, rename (needs rename param), reorder, deduplicate, sort_rows\n"
        operations_section += "- Filtering: filter_rows_condition (needs condition operators/values), filter_top_n_per_group (needs n, metric_col), filter_percentile (needs percentile, metric_col, direction)\n"
        operations_section += "- Grouped Aggregation (needs identifiers): compute_metrics_within_group (needs metric_cols JSON), group_share_of_total (needs metric_cols JSON), group_contribution (needs metric_cols JSON)\n"
        operations_section += "\n"
        operations_section += "Template:\n"
        operations_section += json.dumps(MetricPromptBuilder.COLUMN_OPS_SUCCESS_TEMPLATE, indent=2)
        operations_section += "\n\n"
        
        # Append operations section to the prompt
        prompt += operations_section
        
        # Add condensed RAG reference section (only if needed, keep it brief)
        rag_content = MetricPromptBuilder._load_operations_rag()
        if rag_content:
            prompt += "\n\n## COLUMN OPERATIONS QUICK REFERENCE:\n\n"
            prompt += "Use this reference to understand operation requirements. ALWAYS use ACTUAL column names from AVAILABLE FILES AND COLUMNS section.\n\n"
            # Include condensed RAG content
            prompt += rag_content
            prompt += "\n\n"
        
        # CRITICAL: Emphasize JSON output requirement at the end (repeated for emphasis)
        prompt += "\n\n" + "="*80 + "\n"
        prompt += "🚨 FINAL REMINDER: RETURN JSON ONLY 🚨\n"
        prompt += "="*80 + "\n"
        prompt += "Your response must be a valid JSON object matching one of these templates:\n"
        prompt += "- INPUT_SUCCESS_TEMPLATE (for input operations)\n"
        prompt += "- VARIABLES_CONSTANT_SUCCESS_TEMPLATE (for constant variables)\n"
        prompt += "- VARIABLES_DATAFRAME_SUCCESS_TEMPLATE (for dataframe variables)\n"
        prompt += "- COLUMN_OPS_SUCCESS_TEMPLATE (for column operations)\n\n"
        prompt += "DO NOT return:\n"
        prompt += "- Explanations outside JSON\n"
        prompt += "- Reasoning text\n"
        prompt += "- Markdown formatting\n"
        prompt += "- Any text before '{' or after '}'\n\n"
        prompt += "START with '{' and END with '}'. Return ONLY the JSON object.\n"
        prompt += "="*80 + "\n\n"
        
        return prompt
    
    @staticmethod
    def get_success_template(operation_type: str = "input") -> Dict[str, Any]:
        """Get the success response template for specific operation type."""
        if operation_type == "variables_constant":
            return MetricPromptBuilder.VARIABLES_CONSTANT_SUCCESS_TEMPLATE.copy()
        elif operation_type == "variables_dataframe":
            return MetricPromptBuilder.VARIABLES_DATAFRAME_SUCCESS_TEMPLATE.copy()
        elif operation_type == "column_ops":
            return MetricPromptBuilder.COLUMN_OPS_SUCCESS_TEMPLATE.copy()
        else:
            return MetricPromptBuilder.INPUT_SUCCESS_TEMPLATE.copy()
    
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
    """
    Build a metric-specific prompt (convenience function).
    
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
    return MetricPromptBuilder.build_metric_prompt(
        user_prompt=user_prompt,
        available_files_with_columns=available_files_with_columns,
        context=context,
        file_details=file_details,
        other_files=other_files,
        matched_columns=matched_columns
    )

