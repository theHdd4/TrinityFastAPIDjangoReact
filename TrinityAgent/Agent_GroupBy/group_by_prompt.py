"""
Standard GroupBy Prompt Builder for Trinity AI
Contains only group_by-specific prompt logic.
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


class GroupByPromptBuilder:
    """GroupBy-specific prompt building utilities."""
    
    # GroupBy-specific success response template
    SUCCESS_TEMPLATE = {
        "success": True,
        "group_by_json": {
            "bucket_name": "trinity",
            "file": ["exact_filename.csv"],
            "group_by_columns": ["column1", "column2"],
            "aggregation_functions": {
                "column3": "sum",
                "column4": "mean",
                "column5": "count"
            }
        },
        "reasoning": "Detailed explanation of why the GroupBy atom was chosen, including: analysis of the user's request, why this specific file was selected, why these group by columns were chosen, why these aggregation functions were selected, alternatives considered, and complete raw thinking process. Be thorough and detailed - explain every decision and consideration.",
        "used_memory": True
    }
    
    # GroupBy-specific general response template
    GENERAL_TEMPLATE = {
        "success": False,
        "suggestions": [
            "Here's what I found about your files:",
            "Available files for group by: [list relevant files]",
            "Columns in [file]: [list columns]",
            "Based on your previous patterns, I recommend:",
            "To complete group by, specify: file + group by columns + aggregation functions",
            "Or say 'yes' to use my suggestions"
        ],
        "reasoning": "Detailed explanation of why the GroupBy atom was chosen, including: analysis of the current situation, what files are available, what the user might want, analysis of the request, why GroupBy is appropriate, what information is needed, recommendations based on available data, and complete raw thinking process. Be thorough and detailed - explain every consideration.",
        "file_analysis": {
            "total_files": "number",
            "recommended_files": ["file1"],
            "group_by_tips": [
                "Select categorical columns for grouping",
                "Choose appropriate aggregation functions for numeric columns",
                "Common aggregations: sum, mean, count, min, max, std"
            ]
        },
        "next_steps": [
            "Ask about specific files or columns",
            "Request group by suggestions",
            "Specify your group by requirements",
            "Say 'yes' to use my recommendations"
        ]
    }
    
    # GroupBy-specific intelligence rules
    INTELLIGENCE_RULES = [
        "USE COMPLETE HISTORY: Reference previous interactions, successful group by operations, and user preferences",
        "SMART FILE SELECTION: Analyze user's request to identify the most appropriate file from the available list",
        "CONTEXT AWARENESS: Understand \"yes\", \"no\", \"use that\", \"group by those\" based on conversation",
        "MEMORY UTILIZATION: Suggest files user has successfully used before",
        "PATTERN RECOGNITION: Identify user's preferred group by columns and aggregation functions",
        "AUTOMATIC COLUMN DETECTION: When file is selected, automatically identify categorical columns suitable for grouping and numeric columns suitable for aggregation",
        "SMART AGGREGATION: Suggest appropriate aggregation functions based on column types (sum for totals, mean for averages, count for counting, etc.)",
        "VALIDATION: Always ensure suggested files exist in the AVAILABLE FILES AND COLUMNS section",
        "AGGREGATION FUNCTIONS: Support common functions like sum, mean, count, min, max, std, median, first, last",
        "GROUP BY COLUMNS: Identify categorical or discrete columns that make sense for grouping",
        "DEFAULT BEHAVIOR: If no aggregation functions specified, suggest count as default aggregation"
    ]
    
    @staticmethod
    def build_group_by_prompt(
        user_prompt: str,
        available_files_with_columns: Dict[str, Any],
        context: str,
        file_details: Optional[Dict[str, Any]] = None,
        other_files: Optional[List[str]] = None,
        matched_columns: Optional[Dict[str, List[str]]] = None
    ) -> str:
        """
        Build a complete group_by-specific prompt using BaseAgent infrastructure.
        
        Args:
            user_prompt: The user's input prompt
            available_files_with_columns: Dictionary of files with their columns
            context: Conversation context/history (provided by BaseAgent)
            file_details: Optional file metadata (provided by BaseAgent)
            other_files: Optional list of other available files (provided by BaseAgent)
            matched_columns: Optional matched columns dictionary (provided by BaseAgent)
        
        Returns:
            Complete formatted prompt string with group_by-specific templates and rules
        """
        return PromptBuilder.build_agent_specific_prompt(
            user_prompt=user_prompt,
            available_files_with_columns=available_files_with_columns,
            context=context,
            agent_name="group by",
            agent_description="grouping data by specific columns and applying aggregation functions (sum, mean, count, min, max, etc.)",
            success_template=GroupByPromptBuilder.SUCCESS_TEMPLATE,
            general_template=GroupByPromptBuilder.GENERAL_TEMPLATE,
            intelligence_rules=GroupByPromptBuilder.INTELLIGENCE_RULES,
            file_details=file_details,
            other_files=other_files,
            matched_columns=matched_columns
        )
    
    @staticmethod
    def get_success_template() -> Dict[str, Any]:
        """Get the success response template for group by operations."""
        return GroupByPromptBuilder.SUCCESS_TEMPLATE.copy()
    
    @staticmethod
    def get_general_template() -> Dict[str, Any]:
        """Get the general response template for group by operations."""
        return GroupByPromptBuilder.GENERAL_TEMPLATE.copy()
    
    @staticmethod
    def get_intelligence_rules() -> List[str]:
        """Get the intelligence rules for group by operations."""
        return GroupByPromptBuilder.INTELLIGENCE_RULES.copy()


# Convenience function for backward compatibility
def build_group_by_prompt(
    user_prompt: str,
    available_files_with_columns: Dict[str, Any],
    context: str,
    file_details: Optional[Dict[str, Any]] = None,
    other_files: Optional[List[str]] = None,
    matched_columns: Optional[Dict[str, List[str]]] = None
) -> str:
    """
    Build a group_by-specific prompt (convenience function).
    
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
    return GroupByPromptBuilder.build_group_by_prompt(
        user_prompt=user_prompt,
        available_files_with_columns=available_files_with_columns,
        context=context,
        file_details=file_details,
        other_files=other_files,
        matched_columns=matched_columns
    )

