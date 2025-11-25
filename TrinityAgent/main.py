"""
Standard Main Entry Point for Trinity AI Agents
Provides FastAPI router setup and agent initialization template.
Can be imported from TrinityAgent root or BaseAgent subfolder.
"""

import json
import logging
import time
from fastapi import APIRouter, HTTPException
from pydantic import BaseModel
from typing import Optional, Dict, Any, Tuple, Type

try:
    # Try importing from BaseAgent first (preferred)
    from .BaseAgent.config import settings
    from .BaseAgent.interfaces import BaseAgentInterface, AgentContext, AgentResult
except ImportError:
    # Fallback to direct imports if BaseAgent not available
    try:
        from BaseAgent.config import settings
        from BaseAgent.interfaces import BaseAgentInterface, AgentContext, AgentResult
    except ImportError:
        # Minimal fallback - create basic types
        from typing import Protocol
        
        class BaseAgentInterface(Protocol):
            def execute(self, context) -> Any:
                ...
        
        class AgentContext:
            def __init__(self, session_id: str, user_prompt: str, **kwargs):
                self.session_id = session_id
                self.user_prompt = user_prompt
                for k, v in kwargs.items():
                    setattr(self, k, v)
        
        class AgentResult:
            def __init__(self, success: bool, data: Dict = None, message: str = "", **kwargs):
                self.success = success
                self.data = data or {}
                self.message = message
                for k, v in kwargs.items():
                    setattr(self, k, v)
        
        import os
        try:
            from pydantic_settings import BaseSettings
        except ImportError:
            # Fallback for Pydantic v1
            from pydantic import BaseSettings
        
        class Settings(BaseSettings):
            OLLAMA_IP: Optional[str] = None
            OLLAMA_PORT: str = "11434"
            LLM_API_URL: Optional[str] = None
            LLM_MODEL_NAME: str = "deepseek-r1:32b"
            LLM_BEARER_TOKEN: str = "aakash_api_key"
            HOST_IP: str = "127.0.0.1"
            MINIO_ENDPOINT: str = "minio:9000"
            MINIO_ACCESS_KEY: str = "minio"
            MINIO_SECRET_KEY: str = "minio123"
            MINIO_BUCKET: str = "trinity"
            MINIO_PREFIX: str = ""
            
            def get_llm_config(self) -> dict:
                ollama_ip = self.OLLAMA_IP or self.HOST_IP
                api_url = self.LLM_API_URL or f"http://{ollama_ip}:{self.OLLAMA_PORT}/api/chat"
                return {
                    "api_url": api_url,
                    "model_name": self.LLM_MODEL_NAME,
                    "bearer_token": self.LLM_BEARER_TOKEN,
                }
            
            def get_minio_config(self, prefix: Optional[str] = None) -> dict:
                return {
                    "endpoint": self.MINIO_ENDPOINT,
                    "access_key": self.MINIO_ACCESS_KEY,
                    "secret_key": self.MINIO_SECRET_KEY,
                    "bucket": self.MINIO_BUCKET,
                    "prefix": prefix or self.MINIO_PREFIX,
                }
        
        settings = Settings()

logger = logging.getLogger("trinity.agent_main")


class AgentRequest(BaseModel):
    """Standard request model for agent endpoints."""
    prompt: str
    session_id: Optional[str] = None
    client_name: Optional[str] = ""
    app_name: Optional[str] = ""
    project_name: Optional[str] = ""


def create_agent_router(
    agent: BaseAgentInterface,
    endpoint_name: str,
    agent_name: str
) -> APIRouter:
    """
    Create a FastAPI router for an agent.
    
    Args:
        agent: The agent instance implementing BaseAgentInterface
        endpoint_name: The endpoint name (e.g., "merge", "concat")
        agent_name: Display name for the agent (e.g., "Merge Agent")
    
    Returns:
        Configured FastAPI router
    """
    router = APIRouter()
    
    @router.post(f"/{endpoint_name}")
    def process_request(request: AgentRequest) -> Dict[str, Any]:
        """
        Process a request through the agent.
        
        Args:
            request: Agent request with prompt and context
        
        Returns:
            Agent response dictionary
        """
        start_time = time.time()
        
        logger.info(f"{agent_name.upper()} REQUEST RECEIVED:")
        logger.info(f"Prompt: {request.prompt}")
        logger.info(f"Session ID: {request.session_id}")
        logger.info(f"Context: {request.client_name}/{request.app_name}/{request.project_name}")
        
        try:
            # Create agent context
            context = AgentContext(
                session_id=request.session_id or f"session_{int(time.time())}",
                user_prompt=request.prompt,
                client_name=request.client_name or "",
                app_name=request.app_name or "",
                project_name=request.project_name or "",
                previous_steps={}
            )
            
            # Execute agent
            result = agent.execute(context)
            
            # Convert to dictionary format
            response = {
                "success": result.success,
                "data": result.data,
                "message": result.message,
                "error": result.error,
                "artifacts": result.artifacts,
                "session_id": result.session_id,
                "processing_time": round(time.time() - start_time, 2)
            }
            
            # Add processing time if available
            if hasattr(result, "processing_time") and result.processing_time:
                response["processing_time"] = result.processing_time
            
            # Add any additional fields
            if hasattr(result, "__dict__"):
                for key, value in result.__dict__.items():
                    if key not in response and not key.startswith("_"):
                        response[key] = value
            
            logger.info(f"{agent_name.upper()} REQUEST COMPLETED:")
            logger.info(f"Success: {response.get('success', False)}")
            logger.info(f"Processing Time: {response.get('processing_time', 0)}s")
            
            return response
            
        except Exception as e:
            logger.error(f"{agent_name.upper()} REQUEST FAILED: {e}", exc_info=True)
            processing_time = round(time.time() - start_time, 2)
            
            error_response = {
                "success": False,
                "error": str(e),
                "processing_time": processing_time,
                "message": f"An error occurred while processing your request: {str(e)}"
            }
            
            # Add smart_response if agent supports it
            if hasattr(agent, "_create_fallback_response"):
                try:
                    fallback = agent._create_fallback_response(request.session_id or "error")
                    if isinstance(fallback, dict) and "smart_response" in fallback:
                        error_response["smart_response"] = fallback["smart_response"]
                except:
                    pass
            
            return error_response
    
    @router.get(f"/{endpoint_name}/history/{{session_id}}")
    def get_history(session_id: str) -> Dict[str, Any]:
        """
        Get session history.
        
        Args:
            session_id: Session identifier
        
        Returns:
            Session history dictionary
        """
        logger.info(f"Getting history for session: {session_id}")
        
        try:
            if hasattr(agent, "get_session_history"):
                history = agent.get_session_history(session_id)
                return {
                    "success": True,
                    "session_id": session_id,
                    "history": history,
                    "total_interactions": len(history) if isinstance(history, list) else 0
                }
            else:
                return {
                    "success": False,
                    "error": "Agent does not support session history"
                }
        except Exception as e:
            logger.error(f"Failed to get history: {e}")
            raise HTTPException(status_code=500, detail=str(e))
    
    @router.get(f"/{endpoint_name}/files")
    def list_files() -> Dict[str, Any]:
        """
        List available files.
        
        Returns:
            Dictionary with available files
        """
        logger.info("Listing available files")
        
        try:
            if hasattr(agent, "files_with_columns"):
                files = agent.files_with_columns
                return {
                    "success": True,
                    "total_files": len(files) if isinstance(files, dict) else 0,
                    "files": files
                }
            else:
                return {
                    "success": False,
                    "error": "Agent does not support file listing"
                }
        except Exception as e:
            logger.error(f"Failed to list files: {e}")
            raise HTTPException(status_code=500, detail=str(e))
    
    @router.get(f"/{endpoint_name}/health")
    def health_check() -> Dict[str, Any]:
        """
        Health check endpoint.
        
        Returns:
            Health status dictionary
        """
        status = {
            "status": "healthy",
            "service": endpoint_name,
            "agent_name": agent_name,
            "agent_type": agent.name if hasattr(agent, "name") else "unknown",
            "version": "1.0.0"
        }
        
        # Add agent-specific status
        if hasattr(agent, "sessions"):
            status["active_sessions"] = len(agent.sessions) if isinstance(agent.sessions, dict) else 0
        
        if hasattr(agent, "files_with_columns"):
            status["loaded_files"] = len(agent.files_with_columns) if isinstance(agent.files_with_columns, dict) else 0
        
        logger.info(f"Health check: {status}")
        return status
    
    return router


def initialize_agent(
    agent_class: Type[BaseAgentInterface],
    endpoint_name: str,
    agent_name: str,
    **agent_kwargs
) -> Tuple[BaseAgentInterface, APIRouter]:
    """
    Initialize an agent and create its router.
    
    Args:
        agent_class: The agent class to instantiate
        endpoint_name: The endpoint name (e.g., "merge")
        agent_name: Display name for the agent (e.g., "Merge Agent")
        **agent_kwargs: Additional arguments to pass to agent constructor
    
    Returns:
        Tuple of (agent_instance, router)
    """
    logger.info(f"Initializing {agent_name}...")
    
    # Get LLM config
    llm_config = settings.get_llm_config()
    
    # Get MinIO config
    minio_config = settings.get_minio_config()
    
    # Create agent instance with default configs
    agent = agent_class(
        api_url=llm_config["api_url"],
        model_name=llm_config["model_name"],
        bearer_token=llm_config["bearer_token"],
        minio_endpoint=minio_config["endpoint"],
        access_key=minio_config["access_key"],
        secret_key=minio_config["secret_key"],
        bucket=minio_config["bucket"],
        prefix=minio_config["prefix"],
        **agent_kwargs
    )
    
    logger.info(f"{agent_name} initialized successfully")
    logger.info(f"Agent name: {agent.name if hasattr(agent, 'name') else 'unknown'}")
    logger.info(f"Agent description: {agent.description if hasattr(agent, 'description') else 'N/A'}")
    
    # Create router
    router = create_agent_router(agent, endpoint_name, agent_name)
    
    return agent, router

