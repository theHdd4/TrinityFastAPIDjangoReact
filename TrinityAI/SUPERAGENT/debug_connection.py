#!/usr/bin/env python3
"""
Debug script to test LLM connection
"""

import os
import sys
import requests
import json
from pathlib import Path

# Add the parent directory to sys.path to import from main_api
PARENT_DIR = Path(__file__).resolve().parent.parent
if str(PARENT_DIR) not in sys.path:
    sys.path.append(str(PARENT_DIR))

from main_api import get_llm_config

def test_llm_connection():
    """Test the LLM connection directly."""
    
    print("🔍 Testing LLM Connection...")
    print("=" * 50)
    
    # Get configuration
    config = get_llm_config()
    print(f"API URL: {config['api_url']}")
    print(f"Model: {config['model_name']}")
    print(f"Bearer Token: {config['bearer_token']}")
    print("-" * 50)
    
    # Test message
    test_message = "Hello! How are you?"
    
    # Prepare payload for Ollama
    payload = {
        "model": config["model_name"],
        "messages": [
            {"role": "user", "content": test_message}
        ],
        "stream": False,
        "options": {
            "temperature": 0.7,
            "num_predict": 100  # Ollama uses num_predict instead of max_tokens
        }
    }
    
    headers = {
        "Content-Type": "application/json"
    }
    
    print(f"Sending message: {test_message}")
    print(f"To URL: {config['api_url']}")
    print("-" * 50)
    
    try:
        response = requests.post(
            config["api_url"],
            json=payload,
            headers=headers,
            timeout=30
        )
        
        print(f"Response Status: {response.status_code}")
        print(f"Response Headers: {dict(response.headers)}")
        
        if response.status_code == 200:
            result = response.json()
            print("✅ Success!")
            print(f"Full Response: {json.dumps(result, indent=2)}")
            
            if "message" in result and "content" in result["message"]:
                print(f"AI Response: {result['message']['content']}")
            else:
                print("❌ Unexpected response format")
        else:
            print(f"❌ Error: HTTP {response.status_code}")
            print(f"Response Text: {response.text}")
            
    except requests.exceptions.ConnectionError as e:
        print(f"❌ Connection Error: {e}")
        print("Make sure the Ollama server is running!")
    except requests.exceptions.Timeout as e:
        print(f"❌ Timeout Error: {e}")
    except Exception as e:
        print(f"❌ Unexpected Error: {e}")

def test_environment_variables():
    """Test environment variables."""
    
    print("\n🔧 Environment Variables:")
    print("=" * 50)
    
    env_vars = [
        "OLLAMA_IP",
        "HOST_IP", 
        "OLLAMA_PORT",
        "LLM_API_URL",
        "LLM_MODEL_NAME",
        "LLM_BEARER_TOKEN"
    ]
    
    for var in env_vars:
        value = os.getenv(var, "NOT SET")
        print(f"{var}: {value}")

if __name__ == "__main__":
    test_environment_variables()
    test_llm_connection()
