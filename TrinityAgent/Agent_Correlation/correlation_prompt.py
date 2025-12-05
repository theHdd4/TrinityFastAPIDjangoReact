"""
Standard Correlation Prompt Builder for Trinity AI
Contains only correlation-specific prompt logic.
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


class CorrelationPromptBuilder:
    """Correlation-specific prompt building utilities."""
    
    # Correlation-specific success response template
    SUCCESS_TEMPLATE = {
        "success": True,
        "correlation_config": {
            "file_path": "Quant_Matrix_AI_Schema/churn-prediction/New Projects Project/D0_KHC_UK_Beans.arrow",  # IMPORTANT: Use the COMPLETE path as shown in AVAILABLE FILES section
            "method": "pearson",
            # IMPORTANT: identifier_columns and measure_columns are OPTIONAL
            # If user doesn't mention columns, DO NOT include these fields at all - backend will use ALL numeric columns automatically
            # Only include if user explicitly requests specific columns:
            # "identifier_columns": ["category", "region"],  # Only if user mentions categorical filters
            # "measure_columns": ["sales", "price", "quantity"],  # Only if user mentions specific numeric columns
            # Example: If user says "analyze correlation in UK beans file" without mentioning columns:
            #   → Omit identifier_columns and measure_columns entirely - backend will use ALL numeric columns
            "identifier_filters": [
                {
                    "column": "category",
                    "values": ["Electronics", "Books"]
                }
            ],
            # "measure_filters": [],  # Only include if user specifies numeric filters
            "include_preview": True,
            "include_date_analysis": False,
            "date_column": None,
            "date_range_filter": None,
            "aggregation_level": None
        },
        "reasoning": "Detailed explanation of why the Correlation atom was chosen, including: analysis of the user's request, why this specific file was selected, why these columns were chosen, why this correlation method was selected, what analysis will be performed, alternatives considered, and complete raw thinking process. Be thorough and detailed - explain every decision and consideration.",
        "used_memory": True,
        "file_name": "data_file.arrow"
    }
    
    # Correlation-specific general response template
    GENERAL_TEMPLATE = {
        "success": False,
        "suggestions": [
            "Here's what I found about your files:",
            "Available files for correlation analysis: [list relevant files]",
            "Numeric columns in [file]: [list numeric columns]",
            "Categorical columns in [file]: [list categorical columns]",
            "Based on your previous patterns, I recommend:",
            "To analyze correlations, specify: file + numeric columns + correlation method",
            "Or say 'yes' to use my suggestions"
        ],
        "reasoning": "Detailed explanation of why the Correlation atom was chosen, including: analysis of the current situation, what files are available, what the user might want, analysis of the request, why Correlation is appropriate, what information is needed, recommendations based on available data, and complete raw thinking process. Be thorough and detailed - explain every consideration.",
        "file_analysis": {
            "total_files": "number",
            "recommended_files": ["file1"],
            "correlation_tips": [
                "Use Pearson for linear relationships between continuous variables",
                "Use Spearman for monotonic relationships (rank-based)",
                "Use Phi Coefficient for binary categorical variables",
                "Use Cramer's V for categorical variables with multiple levels",
                "Select numeric columns for correlation analysis",
                "Filter by categorical columns to focus analysis on specific subsets"
            ]
        },
        "next_steps": [
            "Ask about specific files or columns",
            "Request correlation method suggestions",
            "Specify your correlation requirements",
            "Say 'yes' to use my recommendations"
        ]
    }
    
    # Correlation-specific intelligence rules
    INTELLIGENCE_RULES = [
        "USE COMPLETE HISTORY: Reference previous interactions, successful correlation analyses, and user preferences",
        "SMART FILE SELECTION: Analyze user's request to identify the most appropriate file from the available list",
        "CONTEXT AWARENESS: Understand \"yes\", \"no\", \"use that\", \"analyze correlations\" based on conversation",
        "MEMORY UTILIZATION: Suggest files user has successfully used before",
        "PATTERN RECOGNITION: Identify user's preferred correlation methods and column selections",
        "AUTOMATIC COLUMN DETECTION: When file is selected, automatically identify numeric columns suitable for correlation analysis. Use the 'numeric_columns' field from AVAILABLE FILES WITH COLUMNS section - these are pre-identified by the file handler",
        "SMART METHOD SELECTION: Suggest appropriate correlation method based on data types (Pearson for continuous, Spearman for rank-based, Phi/Cramer's V for categorical)",
        "VALIDATION: Always ensure suggested files exist in the AVAILABLE FILES AND COLUMNS section",
        "CORRELATION METHODS: Support pearson (default), spearman, phi_coefficient, cramers_v",
        "COLUMN TYPES: Use measure_columns for numeric variables, identifier_columns for categorical filters",
        "FILTER SUPPORT: Support identifier_filters (categorical) and measure_filters (numeric ranges)",
        "DATE ANALYSIS: Support optional date analysis and date range filtering",
        "REQUIRED JSON KEYS: success, correlation_config (when success true), and reasoning must ALL be present so the UI always has a friendly response",
        "CORRELATION CONFIG STRUCTURE: correlation_config must have file_path (required - full path as shown in AVAILABLE FILES, e.g., 'Quant_Matrix_AI_Schema/churn-prediction/New Projects Project/D0_KHC_UK_Beans.arrow'), method (required), and optionally identifier_columns, measure_columns, identifier_filters, measure_filters, date_column, date_range_filter",
        "FILE_PATH FORMAT: Always return the COMPLETE file path as it appears in the AVAILABLE FILES AND COLUMNS section (e.g., 'Quant_Matrix_AI_Schema/churn-prediction/New Projects Project/D0_KHC_UK_Beans.arrow'). Use the exact path from the available files list - do NOT extract just the filename. The backend needs the full object path to locate the file in the bucket.",
        "DEFAULT BEHAVIOR: If no method specified, use pearson as default",
        "COLUMN DETECTION: If user does NOT mention specific columns, DO NOT include identifier_columns or measure_columns in the JSON at all - backend will automatically detect and use ALL numeric columns for correlation analysis",
        "DEFAULT BEHAVIOR FOR COLUMNS: When user doesn't specify columns, omit identifier_columns and measure_columns entirely from correlation_config. Backend will automatically use ALL numeric columns from the file. Only include columns if user explicitly mentions them",
        "OMIT EMPTY ARRAYS: Never include empty arrays for identifier_columns or measure_columns. If empty or not specified, omit these fields completely from the JSON",
        "FILTER INTELLIGENCE: Understand filter requests like \"only North America\", \"sales > 1000\", \"between 2023 and 2024\"",
        "DATE INTELLIGENCE: Automatically detect date columns and suggest date range filters when user mentions time periods"
    ]
    
    @staticmethod
    def build_correlation_prompt(
        user_prompt: str,
        available_files_with_columns: Dict[str, Any],
        context: str,
        file_details: Optional[Dict[str, Any]] = None,
        other_files: Optional[List[str]] = None,
        matched_columns: Optional[Dict[str, List[str]]] = None
    ) -> str:
        """
        Build a complete correlation-specific prompt using BaseAgent infrastructure.
        
        Args:
            user_prompt: The user's input prompt
            available_files_with_columns: Dictionary of files with their columns
            context: Conversation context/history (provided by BaseAgent)
            file_details: Optional file metadata (provided by BaseAgent)
            other_files: Optional list of other available files (provided by BaseAgent)
            matched_columns: Optional matched columns dictionary (provided by BaseAgent)
        
        Returns:
            Complete formatted prompt string with correlation-specific templates and rules
        """
        return PromptBuilder.build_agent_specific_prompt(
            user_prompt=user_prompt,
            available_files_with_columns=available_files_with_columns,
            context=context,
            agent_name="correlation",
            agent_description="calculating correlation matrices and analyzing relationships between numeric variables",
            success_template=CorrelationPromptBuilder.SUCCESS_TEMPLATE,
            general_template=CorrelationPromptBuilder.GENERAL_TEMPLATE,
            intelligence_rules=CorrelationPromptBuilder.INTELLIGENCE_RULES,
            file_details=file_details,
            other_files=other_files,
            matched_columns=matched_columns
        )
    
    @staticmethod
    def get_success_template() -> Dict[str, Any]:
        """Get the success response template for correlation operations."""
        return CorrelationPromptBuilder.SUCCESS_TEMPLATE.copy()
    
    @staticmethod
    def get_general_template() -> Dict[str, Any]:
        """Get the general response template for correlation operations."""
        return CorrelationPromptBuilder.GENERAL_TEMPLATE.copy()
    
    @staticmethod
    def get_intelligence_rules() -> List[str]:
        """Get the intelligence rules for correlation operations."""
        return CorrelationPromptBuilder.INTELLIGENCE_RULES.copy()


# Convenience function for backward compatibility
def build_correlation_prompt(
    user_prompt: str,
    available_files_with_columns: Dict[str, Any],
    context: str,
    file_details: Optional[Dict[str, Any]] = None,
    other_files: Optional[List[str]] = None,
    matched_columns: Optional[Dict[str, List[str]]] = None
) -> str:
    """
    Build a correlation-specific prompt (convenience function).
    
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
    return CorrelationPromptBuilder.build_correlation_prompt(
        user_prompt=user_prompt,
        available_files_with_columns=available_files_with_columns,
        context=context,
        file_details=file_details,
        other_files=other_files,
        matched_columns=matched_columns
    )

