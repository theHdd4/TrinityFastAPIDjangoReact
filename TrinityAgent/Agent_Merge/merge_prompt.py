"""
Standard Merge Prompt Builder for Trinity AI
Contains only merge-specific prompt logic.
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


class MergePromptBuilder:
    """Merge-specific prompt building utilities."""
    
    # Merge-specific success response template
    SUCCESS_TEMPLATE = {
        "success": True,
        "merge_json": {
            "bucket_name": "trinity",
            "file1": ["exact_filename1.csv"],
            "file2": ["exact_filename2.csv"],
            "join_columns": ["common_column_name"],
            "join_type": "outer"
        },
        "response": "Raw thinking and reasoning from LLM about the merge operation, including why these files were selected, why these join columns were chosen, why this join type was selected, and any considerations made",
        "smart_response": "I've configured the merge operation for you. The files will be joined using the specified columns and join type. You can now proceed with the merge or make adjustments as needed.",
        "reasoning": "Found all required components with context from history",
        "used_memory": True
    }
    
    # Merge-specific general response template
    GENERAL_TEMPLATE = {
        "success": False,
        "suggestions": [
            "Here's what I found about your files:",
            "Available files for merge: [list relevant files]",
            "Common columns between [file1] and [file2]: [list columns]",
            "Based on your previous patterns, I recommend:",
            "To complete merge, specify: files + join columns + join type",
            "Or say 'yes' to use my suggestions"
        ],
        "response": "Raw thinking and reasoning from LLM about the current situation, what files are available, what the user might want, analysis of the request, and recommendations based on available data",
        "smart_response": "I'd be happy to help you with Merge operations! Here are your available files and their columns: [FORMAT: **filename.arrow** (X columns) - column1, column2, column3, etc.]. I can help you merge your data files using various join strategies. What files would you like to merge?",
        "reasoning": "Providing helpful information and guidance",
        "file_analysis": {
            "total_files": "number",
            "recommended_pairs": ["file1 + file2"],
            "common_columns": ["col1", "col2"],
            "merge_tips": [
                "Ensure join columns exist in both files",
                "Choose appropriate join type based on data requirements",
                "Consider data quality before merging"
            ]
        },
        "next_steps": [
            "Ask about specific files or columns",
            "Request merge suggestions",
            "Specify your merge requirements",
            "Say 'yes' to use my recommendations"
        ]
    }
    
    # Merge-specific intelligence rules
    INTELLIGENCE_RULES = [
        "USE COMPLETE HISTORY: Reference previous interactions, successful merges, and user preferences",
        "SMART FILE SELECTION: Analyze user's request to identify the most appropriate files from the available list",
        "CONTEXT AWARENESS: Understand \"yes\", \"no\", \"use those\", \"merge them\" based on conversation",
        "MEMORY UTILIZATION: Suggest files user has successfully used before",
        "PATTERN RECOGNITION: Identify user's preferred file combinations and join types",
        "AUTOMATIC COLUMN DETECTION: When files are selected, automatically find common columns between them",
        "SMART JOIN TYPE: Use \"outer\" as default if no join type specified, otherwise use user preference",
        "VALIDATION: Always ensure suggested files exist in the AVAILABLE FILES AND COLUMNS section",
        "JOIN TYPES: Use \"inner\", \"outer\", \"left\", or \"right\" based on user requirements",
        "COLUMN MATCHING: Identify common columns between files for join operations"
    ]
    
    @staticmethod
    def build_merge_prompt(
        user_prompt: str,
        available_files_with_columns: Dict[str, Any],
        context: str,
        file_details: Optional[Dict[str, Any]] = None,
        other_files: Optional[List[str]] = None,
        matched_columns: Optional[Dict[str, List[str]]] = None
    ) -> str:
        """
        Build a complete merge-specific prompt using BaseAgent infrastructure.
        
        Args:
            user_prompt: The user's input prompt
            available_files_with_columns: Dictionary of files with their columns
            context: Conversation context/history (provided by BaseAgent)
            file_details: Optional file metadata (provided by BaseAgent)
            other_files: Optional list of other available files (provided by BaseAgent)
            matched_columns: Optional matched columns dictionary (provided by BaseAgent)
        
        Returns:
            Complete formatted prompt string with merge-specific templates and rules
        """
        return PromptBuilder.build_agent_specific_prompt(
            user_prompt=user_prompt,
            available_files_with_columns=available_files_with_columns,
            context=context,
            agent_name="merge",
            agent_description="merging data files using various join strategies (inner, outer, left, right)",
            success_template=MergePromptBuilder.SUCCESS_TEMPLATE,
            general_template=MergePromptBuilder.GENERAL_TEMPLATE,
            intelligence_rules=MergePromptBuilder.INTELLIGENCE_RULES,
            file_details=file_details,
            other_files=other_files,
            matched_columns=matched_columns
        )
    
    @staticmethod
    def get_success_template() -> Dict[str, Any]:
        """Get the success response template for merge operations."""
        return MergePromptBuilder.SUCCESS_TEMPLATE.copy()
    
    @staticmethod
    def get_general_template() -> Dict[str, Any]:
        """Get the general response template for merge operations."""
        return MergePromptBuilder.GENERAL_TEMPLATE.copy()
    
    @staticmethod
    def get_intelligence_rules() -> List[str]:
        """Get the intelligence rules for merge operations."""
        return MergePromptBuilder.INTELLIGENCE_RULES.copy()


# Convenience function for backward compatibility
def build_merge_prompt(
    user_prompt: str,
    available_files_with_columns: Dict[str, Any],
    context: str,
    file_details: Optional[Dict[str, Any]] = None,
    other_files: Optional[List[str]] = None,
    matched_columns: Optional[Dict[str, List[str]]] = None
) -> str:
    """
    Build a merge-specific prompt (convenience function).
    
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
    return MergePromptBuilder.build_merge_prompt(
        user_prompt=user_prompt,
        available_files_with_columns=available_files_with_columns,
        context=context,
        file_details=file_details,
        other_files=other_files,
        matched_columns=matched_columns
    )



