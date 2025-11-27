"""
Trinity Agent - Base Agent Package
Standardized foundation for all Trinity AI agents.

This package provides:
- Centralized configuration management
- Standard agent interfaces
- Unified error handling
- Standardized JSON operations
- Memory storage management
- File reading utilities
- Data validation
- Agent registry system
"""

# Core imports (required)
from .config import Settings, settings
from .interfaces import BaseAgentInterface, AgentContext, AgentResult
from .exceptions import (
    TrinityException,
    AgentExecutionError,
    ConfigurationError,
    FileLoadError,
    JSONExtractionError,
    ValidationError
)
from .base_agent import BaseAgent

# Optional imports (may not be available)
try:
    from .registry import AgentRegistry, registry
except ImportError:
    AgentRegistry = None
    registry = None

try:
    from .prompt_builder import PromptBuilder, build_prompt
except ImportError:
    PromptBuilder = None
    build_prompt = None

try:
    from .llm_client import LLMClient, call_llm
except ImportError:
    LLMClient = None
    call_llm = None

try:
    from .main import AgentRequest, create_agent_router, initialize_agent
except ImportError:
    AgentRequest = None
    create_agent_router = None
    initialize_agent = None

__all__ = [
    # Configuration
    "Settings",
    "settings",
    # Interfaces
    "BaseAgentInterface",
    "AgentContext",
    "AgentResult",
    # Exceptions
    "TrinityException",
    "AgentExecutionError",
    "ConfigurationError",
    "FileLoadError",
    "JSONExtractionError",
    "ValidationError",
    # Base Agent
    "BaseAgent",
    # Registry
    "AgentRegistry",
    "registry",
    # Prompt Builder
    "PromptBuilder",
    "build_prompt",
    # LLM Client
    "LLMClient",
    "call_llm",
    # Main
    "AgentRequest",
    "create_agent_router",
    "initialize_agent",
]

__version__ = "1.0.0"

