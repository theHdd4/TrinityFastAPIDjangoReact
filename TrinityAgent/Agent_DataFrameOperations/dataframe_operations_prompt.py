"""
Standard DataFrameOperations Prompt Builder for Trinity AI
Contains only dataframe_operations-specific prompt logic.
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


class DataFrameOperationsPromptBuilder:
    """DataFrameOperations-specific prompt building utilities."""
    
    # DataFrameOperations-specific success response template
    SUCCESS_TEMPLATE = {
        "success": True,
        "dataframe_config": {
            "operations": [
                {
                    "operation_id": "1",
                    "api_endpoint": "/load_cached",
                    "operation_name": "load_cached",
                    "description": "Load cached Arrow file into session",
                    "parameters": {
                        "object_name": "exact_filename_from_available_files.arrow"
                    },
                    "execute_order": 1,
                    "depends_on": []
                }
            ]
        },
        "execution_plan": {
            "auto_execute": True,
            "execution_mode": "sequential",
            "error_handling": "stop_on_error"
        },
        "response": "Raw thinking and reasoning from LLM about the DataFrame operations, including why this file was selected, why these operations were chosen, and any considerations made",
        "smart_response": "I'll load your data file and perform the requested operations. The operations will be executed sequentially.",
        "reasoning": "Found all required components with context from history",
        "used_memory": True
    }
    
    # DataFrameOperations-specific general response template
    GENERAL_TEMPLATE = {
        "success": False,
        "suggestions": [
            "Here's what I found about your files:",
            "Available files for DataFrame operations: [list relevant files]",
            "Columns in [file]: [list columns]",
            "Based on your previous patterns, I recommend:",
            "To perform operations, specify: file + operation type (load, filter, sort, add column, etc.)",
            "Or say 'yes' to use my suggestions"
        ],
        "response": "Raw thinking and reasoning from LLM about the current situation, what files are available, what the user might want, analysis of the request, and recommendations based on available data",
        "smart_response": "I'd be happy to help you with DataFrame operations! Here are your available files and their columns: [FORMAT: **filename.arrow** (X columns) - column1, column2, column3, etc.]. I can help you load files, filter rows, sort data, add/rename/delete columns, apply formulas, and save results. What would you like to do?",
        "reasoning": "Providing helpful information and guidance",
        "file_analysis": {
            "total_files": "number",
            "recommended_files": ["file1"],
            "operation_tips": [
                "Load files to start working with data",
                "Filter rows to narrow down data",
                "Sort by columns to organize data",
                "Add columns for calculations",
                "Apply formulas for complex operations",
                "Save results when done"
            ]
        },
        "next_steps": [
            "Ask about specific files or columns",
            "Request operation suggestions",
            "Specify your DataFrame operation requirements",
            "Say 'yes' to use my recommendations"
        ]
    }
    
    # DataFrameOperations-specific intelligence rules
    INTELLIGENCE_RULES = [
        "USE COMPLETE HISTORY: Reference previous interactions, successful operations, and user preferences",
        "SMART FILE SELECTION: Analyze user's request to identify the most appropriate file from the available list",
        "CONTEXT AWARENESS: Understand \"yes\", \"no\", \"use that\", \"apply that\" based on conversation",
        "MEMORY UTILIZATION: Suggest files user has successfully used before",
        "PATTERN RECOGNITION: Identify user's preferred operations and workflows",
        "AUTOMATIC OPERATION DETECTION: When file is selected, automatically identify appropriate operations based on user intent",
        "SMART OPERATION SEQUENCING: Always start with /load_cached, then chain operations using 'auto_from_previous' for df_id",
        "VALIDATION: Always ensure suggested files exist in the AVAILABLE FILES AND COLUMNS section",
        "OPERATIONS: Support load, filter, sort, insert/delete/duplicate rows, insert/delete/duplicate/rename/move/retype columns, edit cells, apply formulas, and save",
        "FORMULAS: Support mathematical (SUM, AVG, DIV, PROD, MAX, MIN), statistical (ZSCORE, CORR), string (UPPER, LOWER, LEN), date (YEAR, MONTH, DAY), and conditional (IF) functions",
        "COLUMN NAMES: Use EXACT column names from file schema (case-sensitive, including spaces and special characters)",
        "FILTER VALUES: Use exact values from file data or closest match with fuzzy matching",
        "DEFAULT BEHAVIOR: If operation unclear, suggest loading file first",
        "EXECUTION PLAN: Always set auto_execute: true for automatic operation execution",
        "OPERATION CHAINING: Use 'auto_from_previous' for df_id in all operations after load_cached",
        "FILE PATHS: Use COMPLETE object_name from available_files keys, not just filename"
    ]
    
    @staticmethod
    def build_dataframe_operations_prompt(
        user_prompt: str,
        available_files_with_columns: Dict[str, Any],
        context: str,
        file_details: Optional[Dict[str, Any]] = None,
        other_files: Optional[List[str]] = None,
        matched_columns: Optional[Dict[str, List[str]]] = None
    ) -> str:
        """
        Build a complete dataframe_operations-specific prompt using BaseAgent infrastructure.
        
        Args:
            user_prompt: The user's input prompt
            available_files_with_columns: Dictionary of files with their columns
            context: Conversation context/history (provided by BaseAgent)
            file_details: Optional file metadata (provided by BaseAgent)
            other_files: Optional list of other available files (provided by BaseAgent)
            matched_columns: Optional matched columns dictionary (provided by BaseAgent)
        
        Returns:
            Complete formatted prompt string with dataframe_operations-specific templates and rules
        """
        # Load API endpoints knowledge from JSON file
        api_endpoints_info = DataFrameOperationsPromptBuilder._load_api_endpoints_info()
        
        # Build base prompt using BaseAgent infrastructure
        base_prompt = PromptBuilder.build_agent_specific_prompt(
            user_prompt=user_prompt,
            available_files_with_columns=available_files_with_columns,
            context=context,
            agent_name="dataframe operations",
            agent_description="performing DataFrame operations (load, filter, sort, column operations, formulas, save) on data files",
            success_template=DataFrameOperationsPromptBuilder.SUCCESS_TEMPLATE,
            general_template=DataFrameOperationsPromptBuilder.GENERAL_TEMPLATE,
            intelligence_rules=DataFrameOperationsPromptBuilder.INTELLIGENCE_RULES,
            file_details=file_details,
            other_files=other_files,
            matched_columns=matched_columns
        )
        
        # Append DataFrame Operations-specific API knowledge
        operations_section = f"""

=== DATAFRAME OPERATIONS API ENDPOINTS ===
{api_endpoints_info}

CRITICAL RULES FOR OPERATIONS:
1. ALWAYS start with /load_cached as operation_id "1" using EXACT object_name from AVAILABLE FILES (full path, not just filename)
2. Use "auto_from_previous" for df_id in all subsequent operations (operation_id "2" onwards)
3. Use EXACT column names from file schema (case-sensitive, including spaces and special characters)
4. For filter operations, use exact values from file data or closest match with fuzzy matching
5. For formulas, use supported functions: SUM, AVG, DIV, PROD, MAX, MIN, ABS, ROUND, IF, UPPER, LOWER, LEN, YEAR, MONTH, DAY, ZSCORE, etc.
6. For move_column: to_index must be < total number of columns
7. NEVER add random filters unless user explicitly requests filtering
8. All operations require a valid df_id from a previous load operation
9. Use "auto_generated_csv" for csv_data parameter in /save operation
10. Use exact filename from user request for save operation (no prefixes like 'ai_' or 'processed_')

OPERATION EXAMPLES:
- Load file: {{"operation_id": "1", "api_endpoint": "/load_cached", "parameters": {{"object_name": "full/path/to/file.arrow"}}}}
- Filter rows: {{"operation_id": "2", "api_endpoint": "/filter_rows", "parameters": {{"df_id": "auto_from_previous", "column": "Country", "value": "USA"}}}}
- Sort: {{"operation_id": "2", "api_endpoint": "/sort", "parameters": {{"df_id": "auto_from_previous", "column": "Year", "direction": "desc"}}}}
- Add column: {{"operation_id": "2", "api_endpoint": "/insert_column", "parameters": {{"df_id": "auto_from_previous", "index": 3, "name": "NewColumn", "default": ""}}}}
- Apply formula: {{"operation_id": "2", "api_endpoint": "/apply_formula", "parameters": {{"df_id": "auto_from_previous", "target_column": "Total", "formula": "=SUM(Revenue,Cost)"}}}}
- Save: {{"operation_id": "2", "api_endpoint": "/save", "parameters": {{"csv_data": "auto_generated_csv", "filename": "result.arrow"}}}}

"""
        
        return base_prompt + operations_section
    
    @staticmethod
    def _load_api_endpoints_info() -> str:
        """Load API endpoints information from JSON file."""
        try:
            # Try to load from the old location first
            rag_dir = Path(__file__).parent.parent.parent / "TrinityAI" / "Agent_dataframe_operations" / "rag"
            api_endpoints_file = rag_dir / "api_endpoints.json"
            
            if api_endpoints_file.exists():
                with open(api_endpoints_file, 'r') as f:
                    data = json.load(f)
                    endpoints = data.get("endpoints", {})
                    critical_rules = data.get("critical_rules", [])
                    
                    info = "AVAILABLE API ENDPOINTS:\n"
                    for endpoint, details in endpoints.items():
                        info += f"\n{endpoint}:\n"
                        info += f"  Description: {details.get('description', 'N/A')}\n"
                        info += f"  Method: {details.get('method', 'POST')}\n"
                        if "required_parameters" in details:
                            info += f"  Required Parameters: {json.dumps(details['required_parameters'], indent=4)}\n"
                        if "optional_parameters" in details:
                            info += f"  Optional Parameters: {json.dumps(details['optional_parameters'], indent=4)}\n"
                        if "example" in details:
                            info += f"  Example: {json.dumps(details['example'], indent=4)}\n"
                    
                    if critical_rules:
                        info += "\nCRITICAL RULES:\n"
                        for rule in critical_rules:
                            info += f"  - {rule}\n"
                    
                    return info
        except Exception as e:
            import logging
            logger = logging.getLogger("trinity.agent_dataframe_operations")
            logger.warning(f"Could not load API endpoints from JSON: {e}")
        
        # Fallback: Return basic endpoint information
        return """
AVAILABLE API ENDPOINTS:
- /load_cached: Load cached Arrow file (params: object_name)
- /filter_rows: Filter rows (params: df_id, column, value)
- /sort: Sort by column (params: df_id, column, direction)
- /insert_row: Insert row (params: df_id, index, direction)
- /delete_row: Delete row (params: df_id, index)
- /duplicate_row: Duplicate row (params: df_id, index)
- /insert_column: Insert column (params: df_id, index, name, default)
- /delete_column: Delete column (params: df_id, name)
- /duplicate_column: Duplicate column (params: df_id, name, new_name)
- /move_column: Move column (params: df_id, from, to_index)
- /rename_column: Rename column (params: df_id, old_name, new_name)
- /retype_column: Change column type (params: df_id, name, new_type)
- /edit_cell: Edit cell (params: df_id, row, column, value)
- /apply_formula: Apply formula (params: df_id, target_column, formula)
- /save: Save dataframe (params: csv_data, filename)
"""
    
    @staticmethod
    def get_success_template() -> Dict[str, Any]:
        """Get the success response template for dataframe operations."""
        return DataFrameOperationsPromptBuilder.SUCCESS_TEMPLATE.copy()
    
    @staticmethod
    def get_general_template() -> Dict[str, Any]:
        """Get the general response template for dataframe operations."""
        return DataFrameOperationsPromptBuilder.GENERAL_TEMPLATE.copy()
    
    @staticmethod
    def get_intelligence_rules() -> List[str]:
        """Get the intelligence rules for dataframe operations."""
        return DataFrameOperationsPromptBuilder.INTELLIGENCE_RULES.copy()


# Convenience function for backward compatibility
def build_dataframe_operations_prompt(
    user_prompt: str,
    available_files_with_columns: Dict[str, Any],
    context: str,
    file_details: Optional[Dict[str, Any]] = None,
    other_files: Optional[List[str]] = None,
    matched_columns: Optional[Dict[str, List[str]]] = None
) -> str:
    """
    Build a dataframe_operations-specific prompt (convenience function).
    
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
    return DataFrameOperationsPromptBuilder.build_dataframe_operations_prompt(
        user_prompt=user_prompt,
        available_files_with_columns=available_files_with_columns,
        context=context,
        file_details=file_details,
        other_files=other_files,
        matched_columns=matched_columns
    )

