"""
Standard Explore Prompt Builder for Trinity AI
Contains only explore-specific prompt logic.
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


class ExplorePromptBuilder:
    """Explore-specific prompt building utilities."""
    
    # Explore-specific success response template
    SUCCESS_TEMPLATE = {
        "success": True,
        "exploration_config": [
            {
                "exploration_id": "1",
                "exploration_type": "pattern_analysis",
                "target_columns": ["column1", "column2"],
                "analysis_method": "correlation_study",
                "visualization_type": "scatter",
                "insights_focus": "pattern_analysis_description",
                "description": "Description of the exploration analysis"
            }
        ],
        "reasoning": "Detailed explanation of why the Explore atom was chosen, including: analysis of the user's request, why this specific file was selected, why these columns were chosen, what analysis will be performed, alternatives considered, and complete raw thinking process. Be thorough and detailed - explain every decision and consideration.",
        "used_memory": True,
        "file_name": "data_file.arrow"
    }
    
    # Explore-specific general response template
    GENERAL_TEMPLATE = {
        "success": False,
        "suggestions": [
            "Here's what I found about your files:",
            "Available files for exploration: [list relevant files]",
            "Columns in [file]: [list columns]",
            "Based on your previous patterns, I recommend:",
            "To explore data, specify: what you want to analyze + which columns/metrics",
            "Or say 'yes' to use my suggestions"
        ],
        "reasoning": "Detailed explanation of why the Explore atom was chosen, including: analysis of the current situation, what files are available, what the user might want, analysis of the request, why Explore is appropriate, what information is needed, recommendations based on available data, and complete raw thinking process. Be thorough and detailed - explain every consideration.",
        "file_analysis": {
            "total_files": "number",
            "recommended_files": ["file1"],
            "exploration_tips": [
                "Use pattern_analysis for finding correlations and relationships",
                "Use trend_analysis for time-based patterns",
                "Use outlier_detection for finding anomalies",
                "Use statistical_summary for descriptive statistics"
            ]
        },
        "next_steps": [
            "Ask about specific files or columns",
            "Request exploration type suggestions",
            "Specify your exploration requirements",
            "Say 'yes' to use my recommendations"
        ]
    }
    
    # Explore-specific intelligence rules
    INTELLIGENCE_RULES = [
        "USE COMPLETE HISTORY: Reference previous interactions, successful explorations, and user preferences",
        "SMART FILE SELECTION: Analyze user's request to identify the most appropriate file from the available list",
        "CONTEXT AWARENESS: Understand \"yes\", \"no\", \"use that\", \"analyze data\" based on conversation",
        "MEMORY UTILIZATION: Suggest files user has successfully used before",
        "PATTERN RECOGNITION: Identify user's preferred exploration types and analysis methods",
        "AUTOMATIC COLUMN DETECTION: When file is selected, automatically identify relevant columns for analysis based on data patterns",
        "SMART EXPLORATION SELECTION: Suggest appropriate exploration types based on column names and data patterns (numeric → correlation, time → trend, categorical → pattern)",
        "VALIDATION: Always ensure suggested files exist in the AVAILABLE FILES AND COLUMNS section",
        "EXPLORATION TYPES: Support pattern_analysis, trend_analysis, outlier_detection, statistical_summary, clustering_analysis",
        "ANALYSIS METHODS: Support correlation_study, time_series_analysis, statistical_analysis, clustering, regression_analysis, distribution_analysis",
        "VISUALIZATION TYPES: Support scatter, line, bar, box, histogram, heatmap, area",
        "MULTIPLE EXPLORATIONS: Can generate multiple exploration_config items in a single response for comprehensive analysis",
        "REQUIRED JSON KEYS: success, exploration_config (when success true), and reasoning must ALL be present so the UI always has a friendly response",
        "EXPLORATION CONFIG STRUCTURE: Each exploration_config item must have exploration_type, target_columns, analysis_method, visualization_type, insights_focus, and description"
    ]
    
    @staticmethod
    def build_explore_prompt(
        user_prompt: str,
        available_files_with_columns: Dict[str, Any],
        context: str,
        file_details: Optional[Dict[str, Any]] = None,
        other_files: Optional[List[str]] = None,
        matched_columns: Optional[str] = None
    ) -> str:
        """
        Build a complete Explore-specific prompt using BaseAgent infrastructure.
        """
        return PromptBuilder.build_agent_specific_prompt(
            user_prompt=user_prompt,
            available_files_with_columns=available_files_with_columns,
            context=context,
            agent_name="Explore",
            agent_description="generating data exploration configurations for pattern analysis, trend analysis, outlier detection, and statistical summaries",
            success_template=ExplorePromptBuilder.SUCCESS_TEMPLATE,
            general_template=ExplorePromptBuilder.GENERAL_TEMPLATE,
            intelligence_rules=ExplorePromptBuilder.INTELLIGENCE_RULES,
            file_details=file_details,
            other_files=other_files,
            matched_columns=matched_columns
        )


