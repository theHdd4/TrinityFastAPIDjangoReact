"""
Result Storage for Stream AI
=============================

Session-based storage for intermediate results between atom executions.
Stores outputs from each atom and provides them to subsequent atoms in the sequence.
"""

import logging
from typing import Dict, Any, Optional, List
from datetime import datetime, timedelta
import threading
import json

logger = logging.getLogger("trinity.streamai.storage")


class ResultStorage:
    """
    In-memory session-based storage for intermediate results.
    Thread-safe storage for atom execution outputs.
    """
    
    def __init__(self, session_timeout_minutes: int = 60):
        """
        Initialize result storage.
        
        Args:
            session_timeout_minutes: Time after which inactive sessions are cleaned up
        """
        self._storage: Dict[str, Dict[str, Any]] = {}
        self._session_metadata: Dict[str, Dict[str, Any]] = {}
        self._lock = threading.Lock()
        self.session_timeout = timedelta(minutes=session_timeout_minutes)
        logger.info(f"ResultStorage initialized with {session_timeout_minutes}min timeout")
    
    def create_session(self, session_id: str) -> None:
        """
        Create a new session for storing results.
        
        Args:
            session_id: Unique session identifier
        """
        with self._lock:
            if session_id not in self._storage:
                self._storage[session_id] = {}
                self._session_metadata[session_id] = {
                    "created_at": datetime.now(),
                    "last_accessed": datetime.now(),
                    "result_count": 0
                }
                logger.info(f"✅ Created session: {session_id}")
    
    def store_result(
        self,
        session_id: str,
        result_name: str,
        result_data: Any,
        result_type: str = "unknown",
        metadata: Optional[Dict[str, Any]] = None
    ) -> None:
        """
        Store a result for a session.
        
        Args:
            session_id: Session identifier
            result_name: Name/key for this result
            result_data: The actual result data
            result_type: Type of result (e.g., "DataFrame", "dict", "visualization")
            metadata: Additional metadata about the result
        """
        with self._lock:
            # Ensure session exists
            if session_id not in self._storage:
                self.create_session(session_id)
            
            # Store the result
            self._storage[session_id][result_name] = {
                "data": result_data,
                "type": result_type,
                "timestamp": datetime.now().isoformat(),
                "metadata": metadata or {}
            }
            
            # Update session metadata
            self._session_metadata[session_id]["last_accessed"] = datetime.now()
            self._session_metadata[session_id]["result_count"] = len(self._storage[session_id])
            
            logger.info(f"💾 Stored result '{result_name}' for session {session_id} (type: {result_type})")
    
    def get_result(self, session_id: str, result_name: str) -> Optional[Dict[str, Any]]:
        """
        Retrieve a result by name.
        
        Args:
            session_id: Session identifier
            result_name: Name of the result to retrieve
            
        Returns:
            Dict with result data, type, timestamp, and metadata, or None if not found
        """
        with self._lock:
            if session_id in self._storage and result_name in self._storage[session_id]:
                # Update last accessed time
                self._session_metadata[session_id]["last_accessed"] = datetime.now()
                result = self._storage[session_id][result_name]
                logger.info(f"📤 Retrieved result '{result_name}' from session {session_id}")
                return result
            
            logger.warning(f"⚠️ Result '{result_name}' not found in session {session_id}")
            return None
    
    def get_all_results(self, session_id: str) -> Dict[str, Dict[str, Any]]:
        """
        Get all results for a session.
        
        Args:
            session_id: Session identifier
            
        Returns:
            Dict of all results for the session
        """
        with self._lock:
            if session_id in self._storage:
                # Update last accessed time
                self._session_metadata[session_id]["last_accessed"] = datetime.now()
                return self._storage[session_id].copy()
            
            return {}
    
    def list_result_names(self, session_id: str) -> List[str]:
        """
        Get list of all result names in a session.
        
        Args:
            session_id: Session identifier
            
        Returns:
            List of result names
        """
        with self._lock:
            if session_id in self._storage:
                return list(self._storage[session_id].keys())
            return []
    
    def format_result_for_prompt(self, session_id: str, result_name: str) -> str:
        """
        Format a result for injection into an LLM prompt.
        
        Args:
            session_id: Session identifier
            result_name: Name of the result
            
        Returns:
            Formatted string describing the result
        """
        result = self.get_result(session_id, result_name)
        if not result:
            return f"[Result '{result_name}' not found]"
        
        result_type = result.get("type", "unknown")
        metadata = result.get("metadata", {})
        
        # Format based on type
        if result_type == "DataFrame":
            rows = metadata.get("rows", "unknown")
            columns = metadata.get("columns", [])
            col_str = ", ".join(columns[:10])  # First 10 columns
            if len(columns) > 10:
                col_str += f", ... ({len(columns)} total)"
            return f"[DataFrame '{result_name}' with {rows} rows and columns: {col_str}]"
        
        elif result_type == "dict":
            keys = list(metadata.get("keys", []))
            key_str = ", ".join(keys[:5])
            if len(keys) > 5:
                key_str += f", ... ({len(keys)} total)"
            return f"[Dictionary '{result_name}' with keys: {key_str}]"
        
        elif result_type == "list":
            length = metadata.get("length", "unknown")
            return f"[List '{result_name}' with {length} items]"
        
        elif result_type == "visualization":
            chart_type = metadata.get("chart_type", "chart")
            return f"[{chart_type} '{result_name}']"
        
        else:
            return f"[Result '{result_name}' of type {result_type}]"
    
    def inject_results_into_prompt(self, session_id: str, prompt_template: str) -> str:
        """
        Replace result references in prompt template with formatted descriptions.
        
        Args:
            session_id: Session identifier
            prompt_template: Prompt with {{result_name}} placeholders
            
        Returns:
            Prompt with placeholders replaced
        """
        import re
        
        # Find all {{result_name}} patterns
        pattern = r'\{\{([^}]+)\}\}'
        matches = re.findall(pattern, prompt_template)
        
        prompt = prompt_template
        for result_name in matches:
            result_name = result_name.strip()
            formatted_result = self.format_result_for_prompt(session_id, result_name)
            prompt = prompt.replace(f"{{{{{result_name}}}}}", formatted_result)
        
        return prompt
    
    def clear_session(self, session_id: str) -> None:
        """
        Clear all results for a session.
        
        Args:
            session_id: Session identifier
        """
        with self._lock:
            if session_id in self._storage:
                result_count = len(self._storage[session_id])
                del self._storage[session_id]
                del self._session_metadata[session_id]
                logger.info(f"🗑️ Cleared session {session_id} ({result_count} results)")
    
    def cleanup_expired_sessions(self) -> int:
        """
        Remove sessions that haven't been accessed recently.
        
        Returns:
            Number of sessions cleaned up
        """
        with self._lock:
            now = datetime.now()
            expired_sessions = []
            
            for session_id, metadata in self._session_metadata.items():
                last_accessed = metadata.get("last_accessed", metadata["created_at"])
                if now - last_accessed > self.session_timeout:
                    expired_sessions.append(session_id)
            
            for session_id in expired_sessions:
                result_count = len(self._storage[session_id])
                del self._storage[session_id]
                del self._session_metadata[session_id]
                logger.info(f"🗑️ Cleaned up expired session {session_id} ({result_count} results)")
            
            if expired_sessions:
                logger.info(f"✅ Cleaned up {len(expired_sessions)} expired sessions")
            
            return len(expired_sessions)
    
    def get_session_info(self, session_id: str) -> Optional[Dict[str, Any]]:
        """
        Get information about a session.
        
        Args:
            session_id: Session identifier
            
        Returns:
            Session metadata or None
        """
        with self._lock:
            if session_id in self._session_metadata:
                metadata = self._session_metadata[session_id].copy()
                metadata["result_names"] = list(self._storage[session_id].keys())
                return metadata
            return None
    
    def get_all_sessions(self) -> List[str]:
        """
        Get list of all active session IDs.
        
        Returns:
            List of session IDs
        """
        with self._lock:
            return list(self._storage.keys())
    
    # =========================================================================
    # Enhanced methods for Stream AI Sequential Execution (Phase 2)
    # =========================================================================
    
    def store_step_result(self, sequence_id: str, step_result) -> None:
        """
        Store a complete step result for sequential execution.
        
        Args:
            sequence_id: Unique sequence identifier
            step_result: StepResult object from step_executor
        """
        with self._lock:
            # Ensure session exists
            if sequence_id not in self._storage:
                self.create_session(sequence_id)
            
            # Store step result with step number as key
            step_key = f"step_{step_result.step_number}"
            
            self._storage[sequence_id][step_key] = {
                "data": step_result.to_dict(),
                "type": "step_result",
                "timestamp": datetime.now().isoformat(),
                "metadata": {
                    "step_number": step_result.step_number,
                    "atom_id": step_result.atom_id,
                    "status": step_result.status,
                    "output_file": step_result.output_file,
                    "columns": step_result.columns,
                    "row_count": step_result.row_count,
                    "card_id": step_result.card_id
                }
            }
            
            # Update session metadata
            self._session_metadata[sequence_id]["last_accessed"] = datetime.now()
            self._session_metadata[sequence_id]["result_count"] = len(self._storage[sequence_id])
            
            logger.info(f"💾 Stored step {step_result.step_number} result for sequence {sequence_id}")
    
    def get_sequence_results(self, sequence_id: str) -> List:
        """
        Get all step results for a sequence in order.
        
        Args:
            sequence_id: Unique sequence identifier
            
        Returns:
            List of StepResult objects ordered by step number
        """
        # Import here to avoid circular dependency
        try:
            from STREAMAI.step_executor import StepResult
        except:
            # If import fails, return empty list
            return []
        
        with self._lock:
            if sequence_id not in self._storage:
                return []
            
            # Get all step results
            step_results = []
            for key, value in self._storage[sequence_id].items():
                if key.startswith("step_") and value.get("type") == "step_result":
                    result_data = value.get("data", {})
                    # Reconstruct StepResult object
                    step_result = StepResult(
                        step_number=result_data.get("step_number", 0),
                        atom_id=result_data.get("atom_id", ""),
                        parameters_generated=result_data.get("parameters_generated", {}),
                        card_id=result_data.get("card_id"),
                        execution_result=result_data.get("execution_result", {}),
                        status=result_data.get("status", "pending"),
                        error_message=result_data.get("error_message"),
                        output_file=result_data.get("output_file"),
                        columns=result_data.get("columns"),
                        row_count=result_data.get("row_count")
                    )
                    step_results.append(step_result)
            
            # Sort by step number
            step_results.sort(key=lambda x: x.step_number)
            
            # Update last accessed time
            self._session_metadata[sequence_id]["last_accessed"] = datetime.now()
            
            return step_results
    
    def get_last_successful_step(self, sequence_id: str):
        """
        Get the last successfully completed step.
        
        Args:
            sequence_id: Unique sequence identifier
            
        Returns:
            StepResult object or None
        """
        results = self.get_sequence_results(sequence_id)
        
        # Find last completed step
        completed_steps = [r for r in results if r.status == "completed"]
        if completed_steps:
            return completed_steps[-1]
        
        return None
    
    def get_step_output_file(self, sequence_id: str, step_number: int) -> Optional[str]:
        """
        Get the output file path from a specific step.
        
        Args:
            sequence_id: Unique sequence identifier
            step_number: Step number
            
        Returns:
            Output file path or None
        """
        results = self.get_sequence_results(sequence_id)
        
        for result in results:
            if result.step_number == step_number:
                return result.output_file
        
        return None
    
    def get_data_lineage(self, sequence_id: str) -> List[Dict[str, Any]]:
        """
        Get data lineage showing how data flows through steps.
        
        Args:
            sequence_id: Unique sequence identifier
            
        Returns:
            List of lineage information for each step
        """
        results = self.get_sequence_results(sequence_id)
        
        lineage = []
        for result in results:
            lineage.append({
                "step_number": result.step_number,
                "atom_id": result.atom_id,
                "input_from": self._detect_input_source(result, results),
                "output_file": result.output_file,
                "status": result.status
            })
        
        return lineage
    
    def _detect_input_source(self, current_step, all_results) -> Optional[int]:
        """
        Detect which previous step provided input to this step.
        
        Args:
            current_step: Current StepResult
            all_results: List of all StepResults
            
        Returns:
            Step number of input source or None
        """
        # Check parameters for file references
        params = current_step.parameters_generated
        
        # Look for file references in parameters
        for param_value in params.values():
            if isinstance(param_value, str):
                # Check if this file was output by a previous step
                for prev_result in all_results:
                    if prev_result.step_number < current_step.step_number:
                        if prev_result.output_file and prev_result.output_file in param_value:
                            return prev_result.step_number
        
        # If step > 1 and no explicit reference, assume it uses previous step
        if current_step.step_number > 1:
            prev_step = current_step.step_number - 1
            return prev_step
        
        return None


# Global storage instance
_result_storage: Optional[ResultStorage] = None


def get_result_storage() -> ResultStorage:
    """
    Get the global result storage instance (singleton).
    
    Returns:
        ResultStorage instance
    """
    global _result_storage
    if _result_storage is None:
        _result_storage = ResultStorage()
        logger.info("✅ Global ResultStorage instance created")
    return _result_storage


# For testing
if __name__ == "__main__":
    # Test the storage
    storage = ResultStorage()
    
    # Create session
    storage.create_session("test-session-123")
    
    # Store some results
    storage.store_result(
        "test-session-123",
        "sales_data",
        {"sample": "data"},
        "DataFrame",
        {"rows": 1000, "columns": ["date", "region", "sales"]}
    )
    
    storage.store_result(
        "test-session-123",
        "filtered_data",
        {"sample": "filtered"},
        "DataFrame",
        {"rows": 500, "columns": ["date", "region", "sales"]}
    )
    
    # Test prompt injection
    prompt = "Filter {{sales_data}} where sales > 1000 and use {{filtered_data}}"
    injected = storage.inject_results_into_prompt("test-session-123", prompt)
    print("Original prompt:", prompt)
    print("Injected prompt:", injected)
    
    # Get session info
    info = storage.get_session_info("test-session-123")
    print("\nSession info:", json.dumps(info, indent=2, default=str))

