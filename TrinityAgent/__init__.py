"""
Trinity Agent Package
Standardized foundation for all Trinity AI agents.

This package provides:
- Standard LLM client
- Standard prompt builder
- Standard main/router setup
- Base Agent components (in BaseAgent subfolder)
"""

# NOTE: Root-level module imports are commented out to prevent import errors
# when importing main_app. These can be imported directly if needed:
#   from TrinityAgent.llm_client import LLMClient
#   from TrinityAgent.main import create_agent_router
#   from TrinityAgent.BaseAgent.prompt_builder import PromptBuilder

# Placeholder exports (can be imported directly if needed)
LLMClient = None
call_llm = None
PromptBuilder = None
build_prompt = None
create_agent_router = None
initialize_agent = None
AgentRequest = None

# Import agent registry (this will auto-register all agents)
try:
    from .agent_registry import (
        register_agent,
        get_agent_router,
        get_all_routers,
        register_concat_agent,
        initialize_all_agents,
    )
except ImportError:
    # If registry not available, create minimal exports
    pass

# Also export from BaseAgent for convenience
try:
    from .BaseAgent import (
        Settings,
        settings,
        BaseAgentInterface,
        AgentContext,
        AgentResult,
        BaseAgent,
        AgentRegistry,
        registry,
        TrinityException,
        AgentExecutionError,
        ConfigurationError,
        FileLoadError,
        JSONExtractionError,
        ValidationError
    )
except ImportError:
    # If BaseAgent not available, create minimal exports
    pass

__all__ = [
    # Root-level exports
    "LLMClient",
    "call_llm",
    "PromptBuilder",
    "build_prompt",
    "create_agent_router",
    "initialize_agent",
    "AgentRequest",
    # Agent Registry exports
    "register_agent",
    "get_agent_router",
    "get_all_routers",
    "register_concat_agent",
    "initialize_all_agents",
    # BaseAgent exports (if available)
    "Settings",
    "settings",
    "BaseAgentInterface",
    "AgentContext",
    "AgentResult",
    "BaseAgent",
    "AgentRegistry",
    "registry",
    "TrinityException",
    "AgentExecutionError",
    "ConfigurationError",
    "FileLoadError",
    "JSONExtractionError",
    "ValidationError",
]

__version__ = "1.0.0"

