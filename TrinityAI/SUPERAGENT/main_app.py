import os
import sys
import json
import logging
import requests
from typing import Dict, Any
from fastapi import APIRouter, HTTPException
from pydantic import BaseModel
from pathlib import Path

# Add the parent directory to sys.path to import from main_api
PARENT_DIR = Path(__file__).resolve().parent.parent
if str(PARENT_DIR) not in sys.path:
    sys.path.append(str(PARENT_DIR))

from main_api import get_llm_config
from text_cleaner import clean_ai_response

logger = logging.getLogger("trinity.superagent")

# Create router for SuperAgent endpoints
router = APIRouter(prefix="/superagent", tags=["SuperAgent"])

class ChatRequest(BaseModel):
    message: str

class ChatResponse(BaseModel):
    response: str

class SuperAgentLLMClient:
    """Simple client for direct AI communication."""
    
    def __init__(self):
        self.config = get_llm_config()
        self.api_url = self.config["api_url"]
        self.model_name = self.config["model_name"]
        self.bearer_token = self.config["bearer_token"]
        self.is_connected = False
        
        # Test connection on initialization
        self.test_connection()
        
        logger.info(f"SuperAgent LLM initialized with {self.model_name} at {self.api_url}")
    
    def test_connection(self):
        """Test if Ollama is accessible."""
        try:
            # Try a simple health check
            health_url = self.api_url.replace('/api/chat', '/api/tags')
            response = requests.get(health_url, timeout=5)
            self.is_connected = response.status_code == 200
            logger.info(f"Ollama connection test: {'✅ Connected' if self.is_connected else '❌ Failed'}")
        except Exception as e:
            self.is_connected = False
            logger.warning(f"Ollama connection test failed: {e}")
    

    def get_ai_response(self, message: str) -> str:
        """Get direct AI response."""
        
        if not self.is_connected:
            return self.get_fallback_response(message)
        
        try:
            # Simple prompt - just send the message
            messages = [
                {"role": "user", "content": message}
            ]
            
            # Prepare API request payload for Ollama
            payload = {
                "model": self.model_name,
                "messages": messages,
                "stream": False,
                "options": {
                    "temperature": 0.7,
                    "num_predict": 1000
                }
            }
            
            # Make API request - Ollama doesn't need authorization header
            headers = {
                "Content-Type": "application/json"
            }
            
            logger.info(f"Making request to {self.api_url} with model {self.model_name}")
            
            response = requests.post(
                self.api_url,
                json=payload,
                headers=headers,
                timeout=30
            )
            
            logger.info(f"Response status: {response.status_code}")
            
            response.raise_for_status()
            result = response.json()
            
            # Extract and clean response content
            if "message" in result and "content" in result["message"]:
                raw_response = result["message"]["content"]
                cleaned_response = clean_ai_response(raw_response)
                logger.info(f"Raw response: {raw_response[:100]}...")
                logger.info(f"Cleaned response: {cleaned_response[:100]}...")
                return cleaned_response
            else:
                logger.error(f"Unexpected response format: {result}")
                return self.get_fallback_response(message)
                
        except requests.exceptions.Timeout:
            logger.error("LLM API request timed out")
            return "I'm experiencing a delay in processing your request. Please try again in a moment."
        except requests.exceptions.ConnectionError:
            logger.error("Failed to connect to LLM API")
            self.is_connected = False
            return self.get_fallback_response(message)
        except requests.exceptions.HTTPError as e:
            logger.error(f"HTTP error from LLM API: {e}")
            return self.get_fallback_response(message)
        except Exception as e:
            logger.error(f"Unexpected error in get_ai_response: {e}")
            return self.get_fallback_response(message)
    
    def get_fallback_response(self, message: str) -> str:
        """Provide fallback responses when LLM is not available."""
        
        # Simple keyword-based responses for common queries
        message_lower = message.lower()
        
        if any(word in message_lower for word in ['hello', 'hi', 'hey', 'good morning', 'good afternoon']):
            return "Hello! I'm Super Agent AI, your intelligent assistant. I'm here to help you with data analysis, atom configuration, and laboratory operations. However, I'm currently unable to connect to the AI service. Please check if Ollama is running on your server."
        
        elif any(word in message_lower for word in ['help', 'assist', 'support']):
            return "I'm here to help you with:\n• Data analysis and visualization\n• Atom configuration and setup\n• Laboratory operations and workflows\n• DataFrame operations and transformations\n• Machine learning and analytics tasks\n\nUnfortunately, I can't provide detailed assistance right now as I'm unable to connect to the AI service. Please ensure Ollama is running on your server."
        
        elif any(word in message_lower for word in ['data', 'analysis', 'atom', 'laboratory']):
            return "I can help you with data analysis and laboratory operations! I can assist with:\n• Configuring atoms for data processing\n• Setting up laboratory workflows\n• Analyzing DataFrames\n• Creating visualizations\n\nHowever, I'm currently unable to access the AI service. Please check your Ollama server connection."
        
        elif any(word in message_lower for word in ['error', 'problem', 'issue', 'trouble']):
            return "I understand you're experiencing an issue. I'm here to help troubleshoot problems with:\n• Data processing workflows\n• Atom configurations\n• Laboratory operations\n• Analysis tasks\n\nCurrently, I can't provide detailed assistance as I'm unable to connect to the AI service. Please verify that Ollama is running on your server."
        
        else:
            return f"I understand you're asking: '{message}'. I'm Super Agent AI, your intelligent assistant for Trinity Laboratory Mode. I can help with data analysis, atom configuration, and laboratory operations. However, I'm currently unable to connect to the AI service. Please ensure Ollama is running on your server with the DeepSeek model available."

# Initialize the LLM client
llm_client = SuperAgentLLMClient()

@router.post("/chat", response_model=ChatResponse)
async def chat_with_superagent(request: ChatRequest):
    """
    Simple chat with Super Agent AI - just send prompt, get answer.
    """
    try:
        logger.info(f"SuperAgent chat request: {request.message[:100]}...")
        
        # Get AI response (with fallback if needed)
        ai_response = llm_client.get_ai_response(request.message)
        
        # Return simple response
        return ChatResponse(response=ai_response)
        
    except Exception as e:
        logger.error(f"Error in SuperAgent chat endpoint: {e}")
        raise HTTPException(
            status_code=500,
            detail="Failed to process chat request"
        )

@router.get("/health")
async def health_check():
    """Health check endpoint for SuperAgent."""
    return {
        "status": "healthy" if llm_client.is_connected else "limited",
        "service": "SuperAgent AI",
        "model": llm_client.model_name,
        "api_url": llm_client.api_url,
        "llm_connected": llm_client.is_connected,
        "message": "Connected to Ollama" if llm_client.is_connected else "Ollama not accessible - using fallback responses"
    }

@router.get("/test-connection")
async def test_connection():
    """Test LLM connection endpoint."""
    llm_client.test_connection()
    return {
        "connected": llm_client.is_connected,
        "api_url": llm_client.api_url,
        "model": llm_client.model_name,
        "message": "Connection test completed"
    }