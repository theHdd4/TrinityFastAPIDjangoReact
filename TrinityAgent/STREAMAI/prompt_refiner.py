"""
Prompt Refiner for Stream AI
============================

Refines prompts based on analysis feedback and RAG context.
"""

import logging
import sys
from typing import Dict, Any, Optional
from pathlib import Path

logger = logging.getLogger("trinity.trinityai.refiner")

# Add parent directory to path for imports
PARENT_DIR = Path(__file__).resolve().parent.parent
if str(PARENT_DIR) not in sys.path:
    sys.path.append(str(PARENT_DIR))

try:
    from STREAMAI.stream_rag_engine import get_stream_rag_engine
    RAG_AVAILABLE = True
except ImportError:
    try:
        from stream_rag_engine import get_stream_rag_engine
        RAG_AVAILABLE = True
    except ImportError:
        RAG_AVAILABLE = False
        logger.warning("⚠️ StreamRAGEngine not available for prompt refinement")


class PromptRefiner:
    """
    Refines prompts using RAG context and error feedback.
    """
    
    def __init__(self):
        """Initialize the prompt refiner"""
        self.rag_engine = None
        if RAG_AVAILABLE:
            try:
                self.rag_engine = get_stream_rag_engine()
                logger.info("✅ PromptRefiner initialized with RAG engine")
            except Exception as e:
                logger.warning(f"⚠️ Could not initialize RAG engine: {e}")
        else:
            logger.warning("⚠️ PromptRefiner initialized without RAG engine")
    
    def refine_prompt(
        self,
        original_prompt: str,
        analysis_result: Dict[str, Any],
        atom_id: str,
        previous_result: Optional[Dict[str, Any]] = None,
        user_intent: Optional[str] = None
    ) -> str:
        """
        Refine prompt based on analysis feedback.
        
        Args:
            original_prompt: Original prompt that was used
            analysis_result: Analysis result with issues and suggested_refinement
            atom_id: ID of the atom
            previous_result: Previous execution result (optional)
            user_intent: Original user intent (optional)
            
        Returns:
            Refined prompt
        """
        logger.info(f"🔧 Refining prompt for atom: {atom_id}")
        
        # Get RAG context for the atom
        rag_context = ""
        if self.rag_engine:
            try:
                atom_context = self.rag_engine.get_atom_specific_context(atom_id)
                rag_context = atom_context
                logger.debug(f"✅ Retrieved RAG context for {atom_id}")
            except Exception as e:
                logger.warning(f"⚠️ Could not get RAG context: {e}")
        
        # Get prompt guidance from RAG
        prompt_guidance = ""
        if self.rag_engine:
            try:
                guidance = self.rag_engine.get_atom_prompt_guidance(atom_id)
                if guidance:
                    prompt_guidance = self._format_prompt_guidance(guidance)
            except Exception as e:
                logger.debug(f"⚠️ Could not get prompt guidance: {e}")
        
        # Build refined prompt
        refined = self._build_refined_prompt(
            original_prompt=original_prompt,
            analysis_result=analysis_result,
            rag_context=rag_context,
            prompt_guidance=prompt_guidance,
            previous_result=previous_result,
            user_intent=user_intent,
            atom_id=atom_id
        )
        
        logger.info(f"✅ Prompt refined (original: {len(original_prompt)} chars, "
                   f"refined: {len(refined)} chars)")
        
        return refined
    
    def _build_refined_prompt(
        self,
        original_prompt: str,
        analysis_result: Dict[str, Any],
        rag_context: str,
        prompt_guidance: str,
        previous_result: Optional[Dict[str, Any]],
        user_intent: Optional[str],
        atom_id: str
    ) -> str:
        """
        Build the refined prompt.
        
        Args:
            original_prompt: Original prompt
            analysis_result: Analysis result
            rag_context: RAG context for atom
            prompt_guidance: Prompt guidance from RAG
            previous_result: Previous result
            user_intent: User intent
            atom_id: Atom ID
            
        Returns:
            Refined prompt
        """
        lines = []
        
        # Header
        lines.append("🚨 PROMPT REFINEMENT - PREVIOUS ATTEMPT HAD ISSUES")
        lines.append("")
        lines.append(f"Atom: {atom_id}")
        if user_intent:
            lines.append(f"User Goal: {user_intent}")
        lines.append("")
        
        # Issues from analysis
        issues = analysis_result.get("issues", [])
        if issues:
            lines.append("**Issues Identified in Previous Execution:**")
            for i, issue in enumerate(issues, 1):
                lines.append(f"{i}. {issue}")
            lines.append("")
        
        # Suggested refinement
        suggested = analysis_result.get("suggested_refinement", "")
        if suggested:
            lines.append("**Suggested Improvements:**")
            lines.append(suggested)
            lines.append("")
        
        # RAG context
        if rag_context:
            lines.append("**Atom Knowledge & Best Practices:**")
            lines.append(rag_context)
            lines.append("")
        
        # Prompt guidance
        if prompt_guidance:
            lines.append("**Prompt Requirements:**")
            lines.append(prompt_guidance)
            lines.append("")
        
        # Previous result summary (if available)
        if previous_result:
            extracted = previous_result.get("extracted", {})
            if extracted:
                smart_response = extracted.get("smart_response", "")[:500]
                if smart_response:
                    lines.append("**Previous Result (for reference):**")
                    lines.append(f"Response: {smart_response}")
                    lines.append("")
        
        # Original prompt (for context)
        lines.append("**Original Request (REFINED VERSION BELOW):**")
        lines.append(original_prompt)
        lines.append("")
        
        # Refined instructions
        lines.append("=" * 80)
        lines.append("**REFINED INSTRUCTIONS - PLEASE FOLLOW CAREFULLY:**")
        lines.append("=" * 80)
        lines.append("")
        
        # Add specific refinements
        if suggested:
            lines.append("Based on the issues identified above, please:")
            lines.append("")
            # Parse suggested refinement into actionable items
            suggestions = suggested.split("\n")
            for suggestion in suggestions:
                suggestion = suggestion.strip()
                if suggestion and len(suggestion) > 10:
                    lines.append(f"- {suggestion}")
            lines.append("")
        
        # Re-state the original goal with clarifications
        lines.append("**Your Task (with clarifications):**")
        lines.append(original_prompt)
        lines.append("")
        
        # Add specific requirements based on issues
        if issues:
            lines.append("**Critical Requirements (based on previous issues):**")
            for issue in issues:
                # Try to convert issue to requirement
                if "missing" in issue.lower():
                    lines.append(f"- Ensure all required data/fields are included")
                elif "error" in issue.lower() or "failed" in issue.lower():
                    lines.append(f"- Fix any errors: {issue}")
                elif "format" in issue.lower() or "structure" in issue.lower():
                    lines.append(f"- Verify data format/structure matches requirements")
                elif "incomplete" in issue.lower():
                    lines.append(f"- Complete the full operation: {issue}")
                else:
                    lines.append(f"- Address: {issue}")
            lines.append("")
        
        lines.append("Please execute this task again with the above clarifications and improvements.")
        
        return "\n".join(lines)
    
    def _format_prompt_guidance(self, guidance: Dict[str, Any]) -> str:
        """
        Format prompt guidance from RAG.
        
        Args:
            guidance: Guidance dict from RAG
            
        Returns:
            Formatted string
        """
        lines = []
        
        if isinstance(guidance, dict):
            if "description" in guidance:
                lines.append(f"Description: {guidance['description']}")
            
            if "required_parameters" in guidance:
                lines.append("\nRequired Parameters:")
                for param, desc in guidance["required_parameters"].items():
                    lines.append(f"  - {param}: {desc}")
            
            if "prompt_requirements" in guidance:
                lines.append("\nPrompt Requirements:")
                for req in guidance["prompt_requirements"]:
                    lines.append(f"  - {req}")
            
            if "examples" in guidance:
                lines.append("\nExamples:")
                for example in guidance["examples"][:2]:  # Limit to 2 examples
                    lines.append(f"  - {example}")
        
        return "\n".join(lines) if lines else ""


# Global instance
_prompt_refiner: Optional[PromptRefiner] = None


def get_prompt_refiner() -> PromptRefiner:
    """
    Get singleton prompt refiner instance.
    
    Returns:
        PromptRefiner instance
    """
    global _prompt_refiner
    if _prompt_refiner is None:
        _prompt_refiner = PromptRefiner()
        logger.info("✅ Global PromptRefiner instance created")
    return _prompt_refiner

