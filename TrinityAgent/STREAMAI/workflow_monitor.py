"""
Workflow Monitor for Stream AI
==============================

Comprehensive logging and monitoring of workflow execution for audit and reproducibility.
"""

import logging
import json
from datetime import datetime
from typing import Dict, Any, List, Optional
from dataclasses import dataclass, asdict, field

logger = logging.getLogger("trinity.trinityai.monitor")


@dataclass
class StepExecution:
    """Represents a single step execution with all attempts."""
    step_number: int
    subtask: str
    atom_id: str
    prompts: List[str] = field(default_factory=list)  # Original + refined prompts
    executions: List[Dict[str, Any]] = field(default_factory=list)  # All execution results
    analyses: List[Dict[str, Any]] = field(default_factory=list)  # All analysis results
    final_result: Optional[Dict[str, Any]] = None
    reasoning: str = ""
    smart_response: str = ""
    raw_response: Dict[str, Any] = field(default_factory=dict)
    start_time: Optional[str] = None
    end_time: Optional[str] = None
    retry_count: int = 0
    success: bool = False


@dataclass
class WorkflowRecord:
    """Complete workflow execution record."""
    session_id: str
    user_prompt: str
    intent: str  # "workflow" or "text_reply"
    intent_detection: Dict[str, Any] = field(default_factory=dict)
    task_decomposition: Optional[List[Dict[str, Any]]] = None
    atom_selection: Optional[List[Dict[str, Any]]] = None
    steps: List[StepExecution] = field(default_factory=list)
    final_response: Optional[Dict[str, Any]] = None
    final_insight: Optional[str] = None
    start_time: str = ""
    end_time: Optional[str] = None
    total_duration: Optional[float] = None
    success: bool = False
    error: Optional[str] = None


class WorkflowMonitor:
    """
    Monitors and logs all workflow execution steps.
    """
    
    def __init__(self):
        """Initialize the workflow monitor"""
        self._workflows: Dict[str, WorkflowRecord] = {}
        logger.info("✅ WorkflowMonitor initialized")
    
    def start_workflow(
        self,
        session_id: str,
        user_prompt: str,
        intent: str,
        intent_detection: Dict[str, Any]
    ) -> None:
        """
        Start monitoring a new workflow.
        
        Args:
            session_id: Session identifier
            user_prompt: User's original prompt
            intent: Detected intent ("workflow" or "text_reply")
            intent_detection: Intent detection result
        """
        record = WorkflowRecord(
            session_id=session_id,
            user_prompt=user_prompt,
            intent=intent,
            intent_detection=intent_detection,
            start_time=datetime.utcnow().isoformat()
        )
        self._workflows[session_id] = record
        logger.info(f"📊 Started monitoring workflow: {session_id}")
    
    def record_intent_detection(
        self,
        session_id: str,
        intent_detection: Dict[str, Any]
    ) -> None:
        """Record intent detection result."""
        if session_id in self._workflows:
            self._workflows[session_id].intent_detection = intent_detection
    
    def record_task_decomposition(
        self,
        session_id: str,
        subtasks: List[Dict[str, Any]]
    ) -> None:
        """
        Record task decomposition result.
        
        Args:
            session_id: Session identifier
            subtasks: List of decomposed subtasks
        """
        if session_id in self._workflows:
            self._workflows[session_id].task_decomposition = subtasks
            logger.debug(f"📊 Recorded task decomposition: {len(subtasks)} subtasks")
    
    def record_atom_selection(
        self,
        session_id: str,
        selected_atoms: List[Dict[str, Any]]
    ) -> None:
        """
        Record atom selection result.
        
        Args:
            session_id: Session identifier
            selected_atoms: List of selected atoms
        """
        if session_id in self._workflows:
            self._workflows[session_id].atom_selection = selected_atoms
            logger.debug(f"📊 Recorded atom selection: {len(selected_atoms)} atoms")
    
    def start_step(
        self,
        session_id: str,
        step_number: int,
        subtask: str,
        atom_id: str
    ) -> None:
        """
        Start monitoring a workflow step.
        
        Args:
            session_id: Session identifier
            step_number: Step number
            subtask: Subtask description
            atom_id: Atom ID
        """
        if session_id not in self._workflows:
            logger.warning(f"⚠️ Workflow {session_id} not found, creating new record")
            self.start_workflow(session_id, "Unknown", "workflow", {})
        
        # Check if step already exists
        existing_step = None
        for step in self._workflows[session_id].steps:
            if step.step_number == step_number:
                existing_step = step
                break
        
        if not existing_step:
            step = StepExecution(
                step_number=step_number,
                subtask=subtask,
                atom_id=atom_id,
                start_time=datetime.utcnow().isoformat()
            )
            self._workflows[session_id].steps.append(step)
        else:
            existing_step.start_time = datetime.utcnow().isoformat()
            existing_step.retry_count += 1
        
        logger.debug(f"📊 Started step {step_number} for {session_id}")
    
    def record_prompt(
        self,
        session_id: str,
        step_number: int,
        prompt: str
    ) -> None:
        """
        Record a prompt used in a step.
        
        Args:
            session_id: Session identifier
            step_number: Step number
            prompt: Prompt text
        """
        step = self._get_step(session_id, step_number)
        if step:
            step.prompts.append(prompt)
            logger.debug(f"📊 Recorded prompt for step {step_number}")
    
    def record_execution(
        self,
        session_id: str,
        step_number: int,
        execution_result: Dict[str, Any]
    ) -> None:
        """
        Record an execution result.
        
        Args:
            session_id: Session identifier
            step_number: Step number
            execution_result: Execution result
        """
        step = self._get_step(session_id, step_number)
        if step:
            step.executions.append(execution_result)
            logger.debug(f"📊 Recorded execution for step {step_number}")
    
    def record_analysis(
        self,
        session_id: str,
        step_number: int,
        analysis_result: Dict[str, Any]
    ) -> None:
        """
        Record an analysis result.
        
        Args:
            session_id: Session identifier
            step_number: Step number
            analysis_result: Analysis result
        """
        step = self._get_step(session_id, step_number)
        if step:
            step.analyses.append(analysis_result)
            logger.debug(f"📊 Recorded analysis for step {step_number}")
    
    def complete_step(
        self,
        session_id: str,
        step_number: int,
        final_result: Dict[str, Any],
        extracted: Dict[str, Any],
        success: bool = True
    ) -> None:
        """
        Mark a step as complete.
        
        Args:
            session_id: Session identifier
            step_number: Step number
            final_result: Final execution result
            extracted: Extracted result fields
            success: Whether step succeeded
        """
        step = self._get_step(session_id, step_number)
        if step:
            step.final_result = final_result
            step.reasoning = extracted.get("reasoning", "")
            step.smart_response = extracted.get("smart_response", "")
            step.raw_response = extracted.get("raw_response", {})
            step.success = success
            step.end_time = datetime.utcnow().isoformat()
            logger.info(f"📊 Completed step {step_number} for {session_id} (success: {success})")
    
    def record_final_response(
        self,
        session_id: str,
        final_response: Dict[str, Any]
    ) -> None:
        """
        Record final workflow response.
        
        Args:
            session_id: Session identifier
            final_response: Final response
        """
        if session_id in self._workflows:
            self._workflows[session_id].final_response = final_response
    
    def record_final_insight(
        self,
        session_id: str,
        insight: str
    ) -> None:
        """
        Record final workflow insight.
        
        Args:
            session_id: Session identifier
            insight: Final insight text
        """
        if session_id in self._workflows:
            self._workflows[session_id].final_insight = insight
    
    def complete_workflow(
        self,
        session_id: str,
        success: bool = True,
        error: Optional[str] = None
    ) -> None:
        """
        Mark workflow as complete.
        
        Args:
            session_id: Session identifier
            success: Whether workflow succeeded
            error: Error message if failed
        """
        if session_id in self._workflows:
            record = self._workflows[session_id]
            record.end_time = datetime.utcnow().isoformat()
            record.success = success
            record.error = error
            
            # Calculate duration
            if record.start_time:
                start = datetime.fromisoformat(record.start_time.replace('Z', '+00:00'))
                end = datetime.fromisoformat(record.end_time.replace('Z', '+00:00'))
                record.total_duration = (end - start).total_seconds()
            
            logger.info(f"📊 Completed workflow {session_id} (success: {success}, "
                       f"duration: {record.total_duration:.2f}s)")
    
    def get_workflow_record(self, session_id: str) -> Optional[Dict[str, Any]]:
        """
        Get complete workflow record.
        
        Args:
            session_id: Session identifier
            
        Returns:
            Workflow record as dict or None
        """
        if session_id in self._workflows:
            record = self._workflows[session_id]
            return asdict(record)
        return None
    
    def get_step_record(
        self,
        session_id: str,
        step_number: int
    ) -> Optional[Dict[str, Any]]:
        """
        Get step record.
        
        Args:
            session_id: Session identifier
            step_number: Step number
            
        Returns:
            Step record as dict or None
        """
        step = self._get_step(session_id, step_number)
        if step:
            return asdict(step)
        return None
    
    def _get_step(
        self,
        session_id: str,
        step_number: int
    ) -> Optional[StepExecution]:
        """Get step execution object."""
        if session_id not in self._workflows:
            return None
        
        for step in self._workflows[session_id].steps:
            if step.step_number == step_number:
                return step
        
        return None
    
    def export_workflow_json(self, session_id: str) -> Optional[str]:
        """
        Export workflow record as JSON.
        
        Args:
            session_id: Session identifier
            
        Returns:
            JSON string or None
        """
        record = self.get_workflow_record(session_id)
        if record:
            return json.dumps(record, indent=2, default=str)
        return None
    
    def list_workflows(self) -> List[str]:
        """
        List all workflow session IDs.
        
        Returns:
            List of session IDs
        """
        return list(self._workflows.keys())
    
    def clear_workflow(self, session_id: str) -> None:
        """
        Clear workflow record (for cleanup).
        
        Args:
            session_id: Session identifier
        """
        if session_id in self._workflows:
            del self._workflows[session_id]
            logger.debug(f"📊 Cleared workflow {session_id}")


# Global instance
_workflow_monitor: Optional[WorkflowMonitor] = None


def get_workflow_monitor() -> WorkflowMonitor:
    """
    Get singleton workflow monitor instance.
    
    Returns:
        WorkflowMonitor instance
    """
    global _workflow_monitor
    if _workflow_monitor is None:
        _workflow_monitor = WorkflowMonitor()
        logger.info("✅ Global WorkflowMonitor instance created")
    return _workflow_monitor

