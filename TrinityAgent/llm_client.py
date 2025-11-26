"""
Standard LLM Client for Trinity AI Agents
Provides consistent LLM API interaction across all agents.
Can be imported from TrinityAgent root or BaseAgent subfolder.
"""

import json
import logging
import requests
from typing import Dict, Any, Optional

try:
    # Try importing from BaseAgent first (preferred)
    from .BaseAgent.config import settings
    from .BaseAgent.exceptions import TrinityException
except ImportError:
    # Fallback to direct imports if BaseAgent not available
    try:
        from BaseAgent.config import settings
        from BaseAgent.exceptions import TrinityException
    except ImportError:
        # Final fallback - create minimal settings
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
            
            def get_llm_config(self) -> dict:
                ollama_ip = self.OLLAMA_IP or self.HOST_IP
                api_url = self.LLM_API_URL or f"http://{ollama_ip}:{self.OLLAMA_PORT}/api/chat"
                return {
                    "api_url": api_url,
                    "model_name": self.LLM_MODEL_NAME,
                    "bearer_token": self.LLM_BEARER_TOKEN,
                }
        
        settings = Settings()
        
        class TrinityException(Exception):
            def __init__(self, message: str, code: str = "INTERNAL_ERROR"):
                self.message = message
                self.code = code
                super().__init__(self.message)

logger = logging.getLogger("trinity.llm_client")


class LLMClient:
    """Standardized LLM client for making API calls."""
    
    def __init__(
        self,
        api_url: Optional[str] = None,
        model_name: Optional[str] = None,
        bearer_token: Optional[str] = None
    ):
        """Initialize LLM client with configuration."""
        llm_config = settings.get_llm_config()
        self.api_url = api_url or llm_config["api_url"]
        self.model_name = model_name or settings.LLM_MODEL_NAME
        self.bearer_token = bearer_token or settings.LLM_BEARER_TOKEN
        
        logger.info(f"LLMClient initialized: {self.api_url}, Model: {self.model_name}")
    
    def call(
        self,
        prompt: str,
        temperature: float = 0.1,
        num_predict: int = 4000,
        top_p: float = 0.9,
        repeat_penalty: float = 1.1,
        stream: bool = False
    ) -> str:
        """
        Call the LLM API with standardized payload structure.
        
        Args:
            prompt: The prompt to send to the LLM
            temperature: Temperature for LLM (default: 0.1)
            num_predict: Maximum tokens to predict (default: 4000)
            top_p: Top-p sampling parameter (default: 0.9)
            repeat_penalty: Repeat penalty parameter (default: 1.1)
            stream: Whether to stream the response (default: False)
        
        Returns:
            The LLM response content as a string
        
        Raises:
            TrinityException: If the LLM call fails
        """
        logger.info(f"CALLING LLM:")
        logger.info(f"API URL: {self.api_url}")
        logger.info(f"Model: {self.model_name}")
        logger.info(f"Prompt Length: {len(prompt)}")
        logger.debug(f"Prompt Preview: {prompt[:200]}...")
        
        payload = {
            "model": self.model_name,
            "messages": [{"role": "user", "content": prompt}],
            "stream": stream,
            "options": {
                "temperature": temperature,
                "num_predict": num_predict,
                "top_p": top_p,
                "repeat_penalty": repeat_penalty
            }
        }
        
        headers = {
            "Authorization": f"Bearer {self.bearer_token}",
            "Content-Type": "application/json"
        }
        
        if logger.isEnabledFor(logging.DEBUG):
            logger.debug(f"Request Payload: {json.dumps(payload, indent=2)}")
        
        try:
            logger.info("Sending request to LLM...")
            response = requests.post(
                self.api_url,
                json=payload,
                headers=headers,
                timeout=300
            )
            response.raise_for_status()
            
            response_data = response.json()
            content = response_data.get('message', {}).get('content', '')
            
            logger.info(f"LLM Response Status: {response.status_code}")
            logger.info(f"LLM Content Length: {len(content)}")
            logger.debug(f"LLM Content Preview: {content[:200]}...")
            
            return content
            
        except requests.exceptions.RequestException as e:
            logger.error(f"Error calling LLM: {e}")
            raise TrinityException(f"LLM API call failed: {str(e)}", code="LLM_API_ERROR")
        except Exception as e:
            logger.error(f"Unexpected error calling LLM: {e}")
            raise TrinityException(f"Unexpected error during LLM call: {str(e)}", code="LLM_ERROR")
    
    def call_with_retry(
        self,
        prompt: str,
        max_retries: int = 3,
        retry_delay: float = 1.0,
        **kwargs
    ) -> str:
        """
        Call the LLM API with retry logic.
        
        Args:
            prompt: The prompt to send to the LLM
            max_retries: Maximum number of retry attempts (default: 3)
            retry_delay: Delay between retries in seconds (default: 1.0)
            **kwargs: Additional arguments passed to call()
        
        Returns:
            The LLM response content as a string
        
        Raises:
            TrinityException: If all retry attempts fail
        """
        import time
        
        last_exception = None
        for attempt in range(max_retries):
            try:
                return self.call(prompt, **kwargs)
            except Exception as e:
                last_exception = e
                if attempt < max_retries - 1:
                    logger.warning(f"LLM call failed (attempt {attempt + 1}/{max_retries}), retrying in {retry_delay}s...")
                    time.sleep(retry_delay)
                else:
                    logger.error(f"LLM call failed after {max_retries} attempts")
        
        raise TrinityException(
            f"LLM call failed after {max_retries} attempts: {str(last_exception)}",
            code="LLM_RETRY_EXHAUSTED"
        )


# Convenience functions for backward compatibility
def call_llm(
    api_url: Optional[str] = None,
    model_name: Optional[str] = None,
    bearer_token: Optional[str] = None,
    prompt: str = "",
    temperature: float = 0.1,
    num_predict: int = 4000
) -> str:
    """
    Call the LLM API (convenience function).
    
    Args:
        api_url: Optional API URL override
        model_name: Optional model name override
        bearer_token: Optional bearer token override
        prompt: The prompt to send to the LLM
        temperature: Temperature for LLM (default: 0.1)
        num_predict: Maximum tokens to predict (default: 4000)
    
    Returns:
        The LLM response content as a string
    """
    client = LLMClient(api_url=api_url, model_name=model_name, bearer_token=bearer_token)
    return client.call(prompt, temperature=temperature, num_predict=num_predict)

