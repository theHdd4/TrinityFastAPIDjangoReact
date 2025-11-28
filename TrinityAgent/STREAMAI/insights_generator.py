"""
Insights Generator for Stream AI
=================================

Generates step-level summaries and final comprehensive insights including
all reasoning, smart_response, and raw_response from atoms.
"""

import logging
import sys
from typing import Dict, Any, List, Optional
from pathlib import Path

logger = logging.getLogger("trinity.trinityai.insights")

# Add parent directory to path for imports
PARENT_DIR = Path(__file__).resolve().parent.parent
if str(PARENT_DIR) not in sys.path:
    sys.path.append(str(PARENT_DIR))

try:
    from Agent_Insight.workflow_insight_agent import get_workflow_insight_agent
    INSIGHT_AGENT_AVAILABLE = True
except ImportError:
    try:
        from TrinityAgent.Agent_Insight.workflow_insight_agent import get_workflow_insight_agent
        INSIGHT_AGENT_AVAILABLE = True
    except ImportError:
        INSIGHT_AGENT_AVAILABLE = False
        logger.warning("⚠️ WorkflowInsightAgent not available")
        def get_workflow_insight_agent():
            return None

from STREAMAI.result_extractor import get_result_extractor


class InsightsGenerator:
    """
    Generates insights at step level and final comprehensive insights.
    """
    
    def __init__(self):
        """Initialize the insights generator"""
        self.insight_agent = None
        if INSIGHT_AGENT_AVAILABLE:
            try:
                self.insight_agent = get_workflow_insight_agent()
                logger.info("✅ InsightsGenerator initialized with insight agent")
            except Exception as e:
                logger.warning(f"⚠️ Could not initialize insight agent: {e}")
        else:
            logger.warning("⚠️ InsightsGenerator initialized without insight agent")
        
        self.extractor = get_result_extractor()
    
    async def generate_step_summary(
        self,
        step_number: int,
        atom_id: str,
        subtask: str,
        extracted_result: Dict[str, Any],
        analysis_result: Optional[Dict[str, Any]] = None
    ) -> str:
        """
        Generate a summary for a single step execution.
        
        Args:
            step_number: Step number
            atom_id: Atom ID
            subtask: Subtask description
            extracted_result: Extracted result with reasoning, smart_response, raw_response
            analysis_result: Optional analysis result
            
        Returns:
            Step summary text
        """
        logger.info(f"📝 Generating step summary for step {step_number} ({atom_id})")
        
        lines = []
        lines.append(f"**Step {step_number}: {atom_id}**")
        lines.append("")
        
        # Add subtask context
        lines.append(f"**Subtask:** {subtask}")
        lines.append("")
        
        # Add reasoning if available
        reasoning = extracted_result.get("reasoning", "")
        if reasoning:
            lines.append("**Reasoning:**")
            lines.append(reasoning[:500] + ("..." if len(reasoning) > 500 else ""))
            lines.append("")
        
        # Add smart response
        smart_response = extracted_result.get("smart_response", "")
        if smart_response:
            lines.append("**Result:**")
            lines.append(smart_response[:500] + ("..." if len(smart_response) > 500 else ""))
            lines.append("")
        
        # Add analysis summary if available
        if analysis_result:
            quality_score = analysis_result.get("quality_score", 0.0)
            sufficient = analysis_result.get("sufficient", False)
            lines.append(f"**Quality:** {quality_score:.2f}/1.0 ({'Sufficient' if sufficient else 'Needs improvement'})")
            lines.append("")
        
        summary = "\n".join(lines)
        logger.debug(f"✅ Generated step summary ({len(summary)} chars)")
        
        return summary
    
    async def generate_final_insight(
        self,
        user_prompt: str,
        session_id: str,
        workflow_steps: List[Dict[str, Any]],
        project_context: Optional[Dict[str, Any]] = None
    ) -> str:
        """
        Generate final comprehensive insight including all atom results.
        
        Args:
            user_prompt: Original user prompt
            session_id: Session identifier
            workflow_steps: List of step records with reasoning, smart_response, raw_response
            project_context: Optional project context
            
        Returns:
            Final insight text
        """
        logger.info(f"📝 Generating final insight for {len(workflow_steps)} steps")
        
        # If insight agent is available, use it
        if self.insight_agent:
            try:
                # Prepare step records for insight agent
                step_records = []
                for step in workflow_steps:
                    record = {
                        "step_number": step.get("step_number", 0),
                        "agent": step.get("atom_id", "unknown"),
                        "description": step.get("subtask", ""),
                        "reasoning": step.get("reasoning", ""),
                        "smart_response": step.get("smart_response", ""),
                        "raw_response": step.get("raw_response", {}),
                        "result_preview": step.get("smart_response", "")[:200],
                        "output_files": step.get("output_files", []),
                        "success": step.get("success", False)
                    }
                    step_records.append(record)
                
                # Build payload for insight agent
                payload = {
                    "user_prompt": user_prompt,
                    "step_records": step_records,
                    "session_id": session_id,
                    "workflow_id": session_id,
                    "available_files": project_context.get("available_files", []) if project_context else [],
                    "generated_files": project_context.get("generated_files", []) if project_context else [],
                    "additional_context": "",
                    "client_name": project_context.get("client_name", "") if project_context else "",
                    "app_name": project_context.get("app_name", "") if project_context else "",
                    "project_name": project_context.get("project_name", "") if project_context else "",
                    "metadata": {
                        "total_steps": len(step_records),
                        "include_reasoning": True,
                        "include_smart_response": True,
                        "include_raw_response": True
                    }
                }
                
                # Generate insight using agent
                import asyncio
                loop = asyncio.get_running_loop()
                result = await loop.run_in_executor(
                    None,
                    lambda: self.insight_agent.generate_workflow_insight(payload)
                )
                
                if result.get("success"):
                    insight = result.get("insight", "")
                    logger.info(f"✅ Generated final insight using agent ({len(insight)} chars)")
                    return insight
                else:
                    logger.warning(f"⚠️ Insight agent returned error: {result.get('error')}")
                    # Fall through to manual generation
                    
            except Exception as e:
                logger.warning(f"⚠️ Error using insight agent: {e}, falling back to manual generation")
        
        # Fallback: Manual insight generation
        return self._generate_manual_insight(user_prompt, workflow_steps)
    
    def _generate_manual_insight(
        self,
        user_prompt: str,
        workflow_steps: List[Dict[str, Any]]
    ) -> str:
        """
        Generate insight manually when agent is not available.
        
        Args:
            user_prompt: Original user prompt
            workflow_steps: List of step records
            
        Returns:
            Insight text
        """
        lines = []
        lines.append("## Workflow Summary")
        lines.append("")
        lines.append(f"**User Request:** {user_prompt}")
        lines.append("")
        lines.append(f"**Total Steps:** {len(workflow_steps)}")
        lines.append("")
        
        # Add summary for each step
        for step in workflow_steps:
            step_num = step.get("step_number", 0)
            atom_id = step.get("atom_id", "unknown")
            subtask = step.get("subtask", "")
            reasoning = step.get("reasoning", "")
            smart_response = step.get("smart_response", "")
            success = step.get("success", False)
            
            lines.append(f"### Step {step_num}: {atom_id}")
            lines.append("")
            lines.append(f"**Subtask:** {subtask}")
            lines.append("")
            
            if reasoning:
                lines.append("**Reasoning:**")
                lines.append(reasoning[:300] + ("..." if len(reasoning) > 300 else ""))
                lines.append("")
            
            if smart_response:
                lines.append("**Result:**")
                lines.append(smart_response[:300] + ("..." if len(smart_response) > 300 else ""))
                lines.append("")
            
            lines.append(f"**Status:** {'✅ Success' if success else '❌ Failed'}")
            lines.append("")
        
        # Add overall conclusion
        lines.append("## Conclusion")
        lines.append("")
        successful_steps = sum(1 for step in workflow_steps if step.get("success", False))
        lines.append(f"Successfully completed {successful_steps} out of {len(workflow_steps)} steps.")
        
        return "\n".join(lines)
    
    def format_atom_results_for_display(
        self,
        extracted_result: Dict[str, Any]
    ) -> str:
        """
        Format atom results (reasoning, smart_response, raw_response) for chat display.
        
        Args:
            extracted_result: Extracted result dict
            
        Returns:
            Formatted string for display
        """
        return self.extractor.format_for_display(extracted_result)


# Global instance
_insights_generator: Optional[InsightsGenerator] = None


def get_insights_generator() -> InsightsGenerator:
    """
    Get singleton insights generator instance.
    
    Returns:
        InsightsGenerator instance
    """
    global _insights_generator
    if _insights_generator is None:
        _insights_generator = InsightsGenerator()
        logger.info("✅ Global InsightsGenerator instance created")
    return _insights_generator

