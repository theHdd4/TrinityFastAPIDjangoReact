"""
Standard FetchAtom Prompt Builder for Trinity AI
Contains only fetch_atom-specific prompt logic.
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


class FetchAtomPromptBuilder:
    """FetchAtom-specific prompt building utilities."""
    
    # FetchAtom-specific success response template
    SUCCESS_TEMPLATE = {
        "success": True,
        "atom_name": "ChartMaker",
        "atom_id": "chart_maker",
        "confidence": 0.95,
        "reasoning": "Detailed explanation of why this atom was chosen, including: analysis of the user's query, matching against available atoms, why this specific atom best matches the request, confidence level and rationale, alternatives considered, and complete raw thinking process. Be thorough and detailed - explain every decision and consideration.",
        "suggested_atoms": [
            {
                "atom_name": "ChartMaker",
                "atom_id": "chart_maker",
                "confidence": 0.95,
                "reason": "Best match for chart creation request"
            }
        ],
        "used_memory": True
    }
    
    # FetchAtom-specific general response template
    GENERAL_TEMPLATE = {
        "success": False,
        "suggestions": [
            "Here are the available atoms that might help:",
            "ChartMaker - Create charts and visualizations",
            "Data Upload & Validate - Upload and validate data files",
            "Merge - Join datasets together",
            "Explore - Browse and analyze data",
            "Metric - Perform metric operations (variables, column operations, data source selection)",
            "Please clarify what you'd like to do",
            "Or say 'show me all atoms' to see complete list"
        ],
        "reasoning": "Detailed explanation of why FetchAtom was chosen, including: analysis of the current situation, what atoms are available, what the user might want, analysis of the request, why FetchAtom is appropriate, recommendations based on available atoms, and complete raw thinking process. Be thorough and detailed - explain every consideration.",
        "available_atoms": [
            {
                "atom_name": "ChartMaker",
                "description": "Create charts and visualizations",
                "keywords": ["chart", "graph", "visualization", "plot"]
            },
            {
                "atom_name": "Metric",
                "description": "Perform metric operations including variable creation, column operations, and data source selection",
                "keywords": ["metric", "variable", "create column", "compute variable", "assign variable", "column operation", "filter rows", "create new column", "transform column", "data source", "select file"]
            }
        ],
        "next_steps": [
            "Specify what you want to do",
            "Ask about specific atoms",
            "Request atom recommendations",
            "Say 'show me all atoms' for complete list"
        ]
    }
    
    # FetchAtom-specific intelligence rules
    INTELLIGENCE_RULES = [
        "USE COMPLETE HISTORY: Reference previous interactions, successful atom selections, and user preferences",
        "SMART ATOM SELECTION: Analyze user's query to identify the most appropriate atom from available options",
        "CONTEXT AWARENESS: Understand user intent from natural language queries",
        "MEMORY UTILIZATION: Suggest atoms user has successfully used before",
        "PATTERN RECOGNITION: Identify user's preferred atoms and workflows",
        "ATOM MATCHING: Match user queries to appropriate atoms based on keywords, descriptions, and context",
        "METRIC ATOM ROUTING: When user mentions 'metric', 'variable', 'create column', 'compute variable', 'assign variable', 'column operation', 'filter rows', 'create new column', 'transform column', 'data source', or 'select file', route to Metric atom (atom_id: 'metric')",
        "CONFIDENCE SCORING: Provide confidence scores for atom recommendations",
        "MULTIPLE SUGGESTIONS: When query is ambiguous, suggest multiple relevant atoms with confidence scores",
        "VALIDATION: Always ensure suggested atoms exist in the AVAILABLE ATOMS section",
        "REQUIRED JSON KEYS: success, atom_name (when success true), atom_id (when success true), and reasoning must ALL be present so the UI always has a friendly response",
        "ATOM ID FORMAT: Use snake_case for atom_id (e.g., 'chart_maker', 'data_upload_validate', 'merge', 'metric')",
        "ATOM NAME FORMAT: Use proper case for atom_name (e.g., 'ChartMaker', 'Data Upload & Validate', 'Merge', 'Metric')"
    ]
    
    @staticmethod
    def build_fetch_atom_prompt(
        user_prompt: str,
        available_files_with_columns: Dict[str, Any],
        context: str,
        file_details: Optional[Dict[str, Any]] = None,
        other_files: Optional[List[str]] = None,
        matched_columns: Optional[str] = None
    ) -> str:
        """
        Build a complete FetchAtom-specific prompt using BaseAgent infrastructure.
        """
        return PromptBuilder.build_agent_specific_prompt(
            user_prompt=user_prompt,
            available_files_with_columns=available_files_with_columns,
            context=context,
            agent_name="Fetch Atom",
            agent_description="determining which atom/tool best matches a user's query and fetching atom configurations",
            success_template=FetchAtomPromptBuilder.SUCCESS_TEMPLATE,
            general_template=FetchAtomPromptBuilder.GENERAL_TEMPLATE,
            intelligence_rules=FetchAtomPromptBuilder.INTELLIGENCE_RULES,
            file_details=file_details,
            other_files=other_files,
            matched_columns=matched_columns
        )


