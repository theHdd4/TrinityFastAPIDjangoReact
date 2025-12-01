"""
Agent Registry for Trinity AI Base Agent
Provides dynamic agent discovery and registration.
"""

import importlib
import logging
from pathlib import Path
from typing import Dict, Optional

from .interfaces import BaseAgentInterface

logger = logging.getLogger("trinity.registry")


class AgentRegistry:
    """Registry for managing and discovering Trinity AI agents."""
    
    def __init__(self):
        self._agents: Dict[str, BaseAgentInterface] = {}
        logger.info("AgentRegistry initialized")
    
    def register(self, agent: BaseAgentInterface, name: Optional[str] = None):
        """
        Register an agent in the registry.
        
        Args:
            agent: The agent instance to register
            name: Optional name override (defaults to agent.name)
        """
        agent_name = name or agent.name
        if agent_name in self._agents:
            logger.warning(f"Overwriting agent {agent_name}")
        self._agents[agent_name] = agent
        logger.info(f"Registered agent: {agent_name}")
    
    def get(self, name: str) -> Optional[BaseAgentInterface]:
        """
        Get an agent by name.
        
        Args:
            name: The agent name (e.g., 'merge', 'groupby')
        
        Returns:
            The agent instance, or None if not found
        """
        return self._agents.get(name)
    
    def list_agents(self) -> Dict[str, str]:
        """
        Returns a dictionary of agent names and descriptions for the LLM planner.
        
        Returns:
            Dictionary mapping agent names to descriptions
        """
        return {
            name: agent.description
            for name, agent in self._agents.items()
        }
    
    def get_all_agents(self) -> Dict[str, BaseAgentInterface]:
        """Get all registered agents."""
        return self._agents.copy()
    
    def auto_discover(self, package_path: str = None):
        """
        Automatically discover and register agents from Agent_* directories.
        
        Args:
            package_path: Path to the TrinityAI package (defaults to current directory)
        """
        if package_path is None:
            # Default to the directory containing this file
            package_path = Path(__file__).parent.parent.parent
        
        package_path = Path(package_path)
        logger.info(f"Auto-discovering agents in: {package_path}")
        
        # Find all Agent_* directories
        agent_dirs = [
            d for d in package_path.iterdir()
            if d.is_dir() and d.name.startswith("Agent_")
        ]
        
        logger.info(f"Found {len(agent_dirs)} agent directories")
        
        for agent_dir in agent_dirs:
            try:
                # Try multiple import strategies
                agent_module_name = None
                module = None
                
                # Strategy 1: Try as direct module (if we're in TrinityAgent directory)
                try:
                    agent_module_name = f"{agent_dir.name}.main_app"
                    module = importlib.import_module(agent_module_name)
                    logger.debug(f"Imported {agent_module_name} (direct)")
                except ImportError:
                    # Strategy 2: Try with TrinityAgent prefix
                    try:
                        agent_module_name = f"TrinityAgent.{agent_dir.name}.main_app"
                        module = importlib.import_module(agent_module_name)
                        logger.debug(f"Imported {agent_module_name} (TrinityAgent prefix)")
                    except ImportError:
                        # Strategy 3: Try with TrinityAI prefix (legacy)
                        try:
                            agent_module_name = f"TrinityAI.{agent_dir.name}.main_app"
                            module = importlib.import_module(agent_module_name)
                            logger.debug(f"Imported {agent_module_name} (TrinityAI prefix)")
                        except ImportError as e3:
                            logger.warning(f"Failed to import {agent_dir.name}.main_app: {e3}")
                            continue
                
                if module is None:
                    continue
                
                # Look for 'agent' instance
                if hasattr(module, 'agent'):
                    agent_instance = module.agent
                    
                    # Check if agent is not None and implements BaseAgentInterface
                    if agent_instance is not None and isinstance(agent_instance, BaseAgentInterface):
                        self.register(agent_instance)
                        logger.info(f"Auto-discovered agent: {agent_instance.name}")
                    elif agent_instance is None:
                        logger.debug(f"Agent instance is None in {agent_dir.name} (may initialize later)")
                    else:
                        logger.warning(
                            f"Agent in {agent_dir.name} doesn't implement BaseAgentInterface (type: {type(agent_instance)})"
                        )
                else:
                    logger.debug(f"No 'agent' instance found in {agent_dir.name}")
                    
            except Exception as e:
                logger.error(f"Error discovering agent in {agent_dir.name}: {e}", exc_info=True)
                continue
        
        logger.info(f"Auto-discovery complete. Registered {len(self._agents)} agents")


# Global registry instance
registry = AgentRegistry()

