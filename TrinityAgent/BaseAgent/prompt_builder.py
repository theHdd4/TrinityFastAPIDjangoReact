"""
Standard Prompt Builder for Trinity AI Base Agent
Provides reusable prompt building utilities and templates.
"""

import json
import logging
from typing import Dict, Any, Optional, List

logger = logging.getLogger("trinity.prompt_builder")


class PromptBuilder:
    """Standardized prompt building utilities for agents."""
    
    @staticmethod
    def build_base_prompt(
        user_prompt: str,
        available_files_with_columns: Dict[str, Any],
        context: str = "",
        agent_role: str = "intelligent assistant",
        agent_task: str = "analyze and respond",
        file_details: Optional[Dict[str, Any]] = None,
        other_files: Optional[List[str]] = None,
        matched_columns: Optional[Dict[str, List[str]]] = None
    ) -> str:
        """
        Build a base prompt template with standard structure.
        
        Args:
            user_prompt: The user's input prompt
            available_files_with_columns: Dictionary of files with their columns
            context: Conversation context/history
            agent_role: Description of the agent's role
            agent_task: Description of the task
            file_details: Optional file metadata
            other_files: Optional list of other available files
            matched_columns: Optional matched columns dictionary
        
        Returns:
            Formatted prompt string
        """
        file_details_json = json.dumps(file_details, indent=2) if file_details else "None"
        other_files_line = ", ".join(other_files) if other_files else "None"
        matched_columns_json = json.dumps(matched_columns, indent=2) if matched_columns else "None"
        
        prompt = f"""You are an {agent_role} with perfect memory access to complete conversation history.

USER INPUT: "{user_prompt}"

AVAILABLE FILES WITH COLUMNS:
{json.dumps(available_files_with_columns, indent=2)}

RELEVANT FILE METADATA:
{file_details_json}

MATCHED COLUMNS (based on prompt):
{matched_columns_json}

OTHER AVAILABLE FILES (REFERENCE ONLY): {other_files_line}

COMPLETE CONVERSATION CONTEXT:
{context}

TASK: {agent_task}
"""
        return prompt
    
    @staticmethod
    def add_success_response_template(
        prompt: str,
        success_fields: Dict[str, Any],
        example_response: Optional[Dict[str, Any]] = None
    ) -> str:
        """
        Add success response template to prompt.
        
        Args:
            prompt: Base prompt string
            success_fields: Dictionary describing required success fields
            example_response: Optional example response structure
        
        Returns:
            Prompt with success response template added
        """
        if example_response:
            example_json = json.dumps(example_response, indent=2)
        else:
            example_json = json.dumps(success_fields, indent=2)
        
        prompt += f"""

SUCCESS RESPONSE (when you have all required info):
{example_json}
"""
        return prompt
    
    @staticmethod
    def add_general_response_template(
        prompt: str,
        general_fields: Dict[str, Any],
        example_response: Optional[Dict[str, Any]] = None
    ) -> str:
        """
        Add general response template to prompt.
        
        Args:
            prompt: Base prompt string
            general_fields: Dictionary describing general response fields
            example_response: Optional example response structure
        
        Returns:
            Prompt with general response template added
        """
        if example_response:
            example_json = json.dumps(example_response, indent=2)
        else:
            example_json = json.dumps(general_fields, indent=2)
        
        prompt += f"""

GENERAL RESPONSE (for questions, file info, suggestions):
{example_json}
"""
        return prompt
    
    @staticmethod
    def add_intelligence_rules(
        prompt: str,
        rules: List[str],
        include_smart_response_rule: bool = True
    ) -> str:
        """
        Add intelligence rules to prompt.
        
        Args:
            prompt: Base prompt string
            rules: List of rule strings
            include_smart_response_rule: Whether to include the smart_response rule
        
        Returns:
            Prompt with intelligence rules added
        """
        prompt += "\n\nINTELLIGENCE RULES:\n\n"
        
        if include_smart_response_rule:
            prompt += "1. **CRITICAL: ALWAYS include \"smart_response\" field in your JSON output** - This is the user-friendly message displayed in the chat\n"
        
        for i, rule in enumerate(rules, start=2 if include_smart_response_rule else 1):
            prompt += f"{i}. {rule}\n"
        
        return prompt
    
    @staticmethod
    def build_agent_specific_prompt(
        user_prompt: str,
        available_files_with_columns: Dict[str, Any],
        context: str,
        agent_name: str,
        agent_description: str,
        success_template: Dict[str, Any],
        general_template: Dict[str, Any],
        intelligence_rules: List[str],
        file_details: Optional[Dict[str, Any]] = None,
        other_files: Optional[List[str]] = None,
        matched_columns: Optional[Dict[str, List[str]]] = None
    ) -> str:
        """
        Build a complete agent-specific prompt.
        
        Args:
            user_prompt: The user's input prompt
            available_files_with_columns: Dictionary of files with their columns
            context: Conversation context/history
            agent_name: Name of the agent
            agent_description: Description of what the agent does
            success_template: Template for success responses
            general_template: Template for general responses
            intelligence_rules: List of intelligence rules
            file_details: Optional file metadata
            other_files: Optional list of other available files
            matched_columns: Optional matched columns dictionary
        
        Returns:
            Complete formatted prompt string
        """
        # Build base prompt
        prompt = PromptBuilder.build_base_prompt(
            user_prompt=user_prompt,
            available_files_with_columns=available_files_with_columns,
            context=context,
            agent_role=f"intelligent {agent_name} assistant",
            agent_task=f"Analyze the user input along with the complete conversation history to provide the most appropriate response for {agent_description}",
            file_details=file_details,
            other_files=other_files,
            matched_columns=matched_columns
        )
        
        # Add success response template
        prompt = PromptBuilder.add_success_response_template(
            prompt,
            success_template,
            example_response=success_template
        )
        
        # Add general response template
        prompt = PromptBuilder.add_general_response_template(
            prompt,
            general_template,
            example_response=general_template
        )
        
        # Add intelligence rules
        prompt = PromptBuilder.add_intelligence_rules(
            prompt,
            intelligence_rules,
            include_smart_response_rule=True
        )
        
        return prompt
    
    @staticmethod
    def format_file_list(files_with_columns: Dict[str, Any], max_files: int = 10) -> str:
        """
        Format file list for display in prompts.
        
        Args:
            files_with_columns: Dictionary of files with columns
            max_files: Maximum number of files to include
        
        Returns:
            Formatted file list string
        """
        if not files_with_columns:
            return "No files available."
        
        formatted = []
        for i, (file_path, file_info) in enumerate(list(files_with_columns.items())[:max_files]):
            file_name = file_info.get("file_name", file_path)
            columns = file_info.get("columns", [])
            column_count = len(columns)
            column_list = ", ".join(columns[:5])  # Show first 5 columns
            if column_count > 5:
                column_list += f", ... ({column_count} total)"
            
            formatted.append(f"  - **{file_name}** ({column_count} columns): {column_list}")
        
        if len(files_with_columns) > max_files:
            formatted.append(f"  ... and {len(files_with_columns) - max_files} more files")
        
        return "\n".join(formatted)


# Convenience functions for backward compatibility
def build_prompt(
    user_prompt: str,
    available_files_with_columns: Dict[str, Any],
    context: str = "",
    file_details: Optional[Dict[str, Any]] = None,
    other_files: Optional[List[str]] = None,
    matched_columns: Optional[Dict[str, List[str]]] = None
) -> str:
    """
    Build a standard prompt (convenience function).
    
    Args:
        user_prompt: The user's input prompt
        available_files_with_columns: Dictionary of files with their columns
        context: Conversation context/history
        file_details: Optional file metadata
        other_files: Optional list of other available files
        matched_columns: Optional matched columns dictionary
    
    Returns:
        Formatted prompt string
    """
    return PromptBuilder.build_base_prompt(
        user_prompt=user_prompt,
        available_files_with_columns=available_files_with_columns,
        context=context,
        file_details=file_details,
        other_files=other_files,
        matched_columns=matched_columns
    )

