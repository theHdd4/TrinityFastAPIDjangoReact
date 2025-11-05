"""
Simple Memory Implementation
=============================

Lightweight replacement for langchain.memory.ConversationBufferWindowMemory
to avoid installing the heavy langchain package.
"""

from typing import List, Dict, Any
from langchain_core.messages import BaseMessage, HumanMessage, AIMessage


class ConversationBufferWindowMemory:
    """
    Simple conversation memory that keeps last N messages.
    Replacement for langchain.memory.ConversationBufferWindowMemory
    """
    
    def __init__(self, k: int = 5, memory_key: str = "history", return_messages: bool = True):
        """
        Initialize memory buffer.
        
        Args:
            k: Number of recent messages to keep
            memory_key: Key name for memory storage
            return_messages: Whether to return messages as objects
        """
        self.k = k
        self.memory_key = memory_key
        self.return_messages = return_messages
        self.messages: List[BaseMessage] = []
    
    def save_context(self, inputs: Dict[str, Any], outputs: Dict[str, Any]) -> None:
        """
        Save conversation context.
        
        Args:
            inputs: Input messages (e.g., {"input": "user message"})
            outputs: Output messages (e.g., {"output": "AI response"})
        """
        # Add human message
        if "input" in inputs:
            self.messages.append(HumanMessage(content=inputs["input"]))
        
        # Add AI message
        if "output" in outputs:
            self.messages.append(AIMessage(content=outputs["output"]))
        
        # Keep only last k*2 messages (k exchanges = k human + k AI)
        if len(self.messages) > self.k * 2:
            self.messages = self.messages[-(self.k * 2):]
    
    def load_memory_variables(self, inputs: Dict[str, Any] = None) -> Dict[str, Any]:
        """
        Load memory variables.
        
        Args:
            inputs: Input variables (not used in this simple implementation)
            
        Returns:
            Dictionary with memory content
        """
        if self.return_messages:
            return {self.memory_key: self.messages}
        else:
            # Return as string
            text = "\n".join([
                f"{'Human' if isinstance(msg, HumanMessage) else 'AI'}: {msg.content}"
                for msg in self.messages
            ])
            return {self.memory_key: text}
    
    def clear(self) -> None:
        """Clear all messages from memory."""
        self.messages = []
    
    @property
    def buffer(self) -> List[BaseMessage]:
        """Get the message buffer."""
        return self.messages
    
    @property
    def buffer_as_str(self) -> str:
        """Get buffer as formatted string."""
        return "\n".join([
            f"{'Human' if isinstance(msg, HumanMessage) else 'AI'}: {msg.content}"
            for msg in self.messages
        ])

