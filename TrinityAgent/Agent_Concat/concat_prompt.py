"""
Standard Concat Prompt Builder for Trinity AI
Contains only concat-specific prompt logic.
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


class ConcatPromptBuilder:
    """Concat-specific prompt building utilities."""
    
    # Concat-specific success response template
    SUCCESS_TEMPLATE = {
        "success": True,
        "concat_json": {
            "bucket_name": "trinity",
            "file1": ["exact_filename1.csv"],
            "file2": ["exact_filename2.csv"],
            "concat_direction": "vertical"
        },
        "response": "Raw thinking and reasoning from LLM about the concatenation operation, including why these files were selected, why this direction was chosen, and any considerations made",
        "smart_response": "I've configured the concatenation operation for you. The files will be combined using the specified direction. You can now proceed with the concatenation or make adjustments as needed.",
        "reasoning": "Found all required components with context from history",
        "used_memory": True
    }
    
    # Concat-specific general response template
    GENERAL_TEMPLATE = {
        "success": False,
        "suggestions": [
            "Here's what I found about your files:",
            "Available files for concatenation: [list relevant files]",
            "Concatenation direction options: vertical (stack), horizontal (append columns)",
            "Based on your previous patterns, I recommend:",
            "To complete concatenation, specify: files + direction + optional column alignment",
            "Or say 'yes' to use my suggestions"
        ],
        "response": "Raw thinking and reasoning from LLM about the current situation, what files are available, what the user might want, analysis of the request, and recommendations based on available data",
        "smart_response": "I'd be happy to help you with concatenation operations! Tell me which files you'd like to combine and whether you prefer stacking rows (vertical) or adding columns side by side (horizontal).",
        "reasoning": "Providing helpful information and guidance",
        "file_analysis": {
            "total_files": "number",
            "recommended_pairs": ["file1 + file2"],
            "concat_tips": [
                "Ensure columns align for horizontal concatenation",
                "Clean column names before merging"
            ]
        },
        "next_steps": [
            "Ask about specific files or columns",
            "Request concatenation suggestions",
            "Specify your concatenation requirements",
            "Say 'yes' to use my recommendations"
        ]
    }
    
    # Concat-specific intelligence rules
    INTELLIGENCE_RULES = [
        "USE COMPLETE HISTORY: Reference previous interactions, successful concatenations, and user preferences",
        "SMART FILE SELECTION: Analyze user's request to identify the most appropriate files from the available list",
        "CONTEXT AWARENESS: Understand \"yes\", \"no\", \"use those\", \"concatenate them\" based on conversation",
        "MEMORY UTILIZATION: Suggest files user has successfully used before",
        "PATTERN RECOGNITION: Identify user's preferred concatenation direction (vertical vs horizontal)",
        "VALIDATION: Always ensure suggested files exist in the AVAILABLE FILES AND COLUMNS section",
        "DIRECTION DETECTION: Infer concatenation direction from user intent (\"stack\" = vertical, \"side by side\" = horizontal)",
        "COLUMN ALIGNMENT: For horizontal concatenation, ensure column names are compatible or suggest renaming",
        "FILE COUNT: Support concatenating 2 or more files (use file1, file2, file3, etc. in concat_json)",
        "DEFAULT BEHAVIOR: Use \"vertical\" as default direction if not specified"
    ]
    
    @staticmethod
    def build_concat_prompt(
        user_prompt: str,
        available_files_with_columns: Dict[str, Any],
        context: str,
        file_details: Optional[Dict[str, Any]] = None,
        other_files: Optional[List[str]] = None,
        matched_columns: Optional[Dict[str, List[str]]] = None
    ) -> str:
        """
        Build a complete concat-specific prompt using BaseAgent infrastructure.
        
        Args:
            user_prompt: The user's input prompt
            available_files_with_columns: Dictionary of files with their columns
            context: Conversation context/history (provided by BaseAgent)
            file_details: Optional file metadata (provided by BaseAgent)
            other_files: Optional list of other available files (provided by BaseAgent)
            matched_columns: Optional matched columns dictionary (provided by BaseAgent)
        
        Returns:
            Complete formatted prompt string with concat-specific templates and rules
        """
        return PromptBuilder.build_agent_specific_prompt(
            user_prompt=user_prompt,
            available_files_with_columns=available_files_with_columns,
            context=context,
            agent_name="concatenation",
            agent_description="concatenating data files (vertical stacking or horizontal column appending)",
            success_template=ConcatPromptBuilder.SUCCESS_TEMPLATE,
            general_template=ConcatPromptBuilder.GENERAL_TEMPLATE,
            intelligence_rules=ConcatPromptBuilder.INTELLIGENCE_RULES,
            file_details=file_details,
            other_files=other_files,
            matched_columns=matched_columns
        )
    
    @staticmethod
    def get_success_template() -> Dict[str, Any]:
        """Get the success response template for concat operations."""
        return ConcatPromptBuilder.SUCCESS_TEMPLATE.copy()
    
    @staticmethod
    def get_general_template() -> Dict[str, Any]:
        """Get the general response template for concat operations."""
        return ConcatPromptBuilder.GENERAL_TEMPLATE.copy()
    
    @staticmethod
    def get_intelligence_rules() -> List[str]:
        """Get the intelligence rules for concat operations."""
        return ConcatPromptBuilder.INTELLIGENCE_RULES.copy()


# Convenience function for backward compatibility
def build_concat_prompt(
    user_prompt: str,
    available_files_with_columns: Dict[str, Any],
    context: str,
    file_details: Optional[Dict[str, Any]] = None,
    other_files: Optional[List[str]] = None,
    matched_columns: Optional[Dict[str, List[str]]] = None
) -> str:
    """
    Build a concat-specific prompt (convenience function).
    
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
    return ConcatPromptBuilder.build_concat_prompt(
        user_prompt=user_prompt,
        available_files_with_columns=available_files_with_columns,
        context=context,
        file_details=file_details,
        other_files=other_files,
        matched_columns=matched_columns
    )



