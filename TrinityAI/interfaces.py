"""
Agent interfaces for Trinity AI.
Defines standard contracts for all agents.
"""

from abc import ABC, abstractmethod
from typing import Dict, Any, Optional, List
from pydantic import BaseModel


class AgentContext(BaseModel):
    """Standard context passed to every agent."""
    
    session_id: str
    user_prompt: str
    client_name: str = ""
    app_name: str = ""
    project_name: str = ""
    previous_steps: Dict[str, Any] = {}  # Results from previous steps
    
    class Config:
        extra = "allow"  # Allow additional fields for flexibility


class AgentResult(BaseModel):
    """Standard result returned by every agent."""
    
    success: bool
    data: Dict[str, Any] = {}  # The actual output (e.g., {"id": "df_123"})
    message: str = ""  # User-facing summary
    error: Optional[str] = None
    artifacts: List[str] = []  # List of created artifact IDs
    session_id: Optional[str] = None
    processing_time: Optional[float] = None
    
    class Config:
        extra = "allow"  # Allow additional fields for backward compatibility


class BaseAgentInterface(ABC):
    """
    Interface for all Trinity AI agents.
    This is used by the registry system.
    """
    
    @property
    @abstractmethod
    def name(self) -> str:
        """Unique name of the agent (e.g., 'merge')."""
        pass
    
    @property
    @abstractmethod
    def description(self) -> str:
        """Description for the LLM Planner."""
        pass
    
    @abstractmethod
    def execute(self, context: AgentContext) -> AgentResult:
        """Main execution logic."""
        pass


