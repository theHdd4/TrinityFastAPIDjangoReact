#!/usr/bin/env python3
"""
Simple script to check which models are available and working on your API.
This script tests connectivity to different models independently.
"""

import os
import json
import requests
import time
from typing import Dict, List, Any

def get_api_config() -> Dict[str, str]:
    """Get API configuration from environment variables."""
    ollama_ip = os.getenv("OLLAMA_IP", os.getenv("HOST_IP", "10.2.1.65"))
    ollama_port = os.getenv("OLLAMA_PORT", "11434")
    
    return {
        "base_url": f"http://{ollama_ip}:{ollama_port}",
        "chat_url": f"http://{ollama_ip}:{ollama_port}/api/chat",
        "tags_url": f"http://{ollama_ip}:{ollama_port}/api/tags",
        "bearer_token": os.getenv("LLM_BEARER_TOKEN", "aakash_api_key"),
    }

def try_different_endpoints() -> List[Dict[str, str]]:
    """Try different possible endpoints for Ollama."""
    possible_hosts = [
        "127.0.0.1",
        "localhost", 
        "ollama",  # Docker container name
        "host.docker.internal",  # Docker host from container
        os.getenv("OLLAMA_IP", ""),
        os.getenv("HOST_IP", ""),
    ]
    
    possible_ports = ["11434", "8080", "8000", "3000"]
    
    endpoints = []
    for host in possible_hosts:
        if host:  # Skip empty hosts
            for port in possible_ports:
                endpoints.append({
                    "host": host,
                    "port": port,
                    "base_url": f"http://{host}:{port}",
                    "tags_url": f"http://{host}:{port}/api/tags"
                })
    
    return endpoints

def test_endpoint_connectivity(endpoint: Dict[str, str]) -> bool:
    """Test if an endpoint is accessible."""
    try:
        response = requests.get(endpoint["tags_url"], timeout=5)
        return response.status_code == 200
    except:
        return False

def find_working_endpoint() -> Dict[str, str]:
    """Find a working Ollama endpoint."""
    print("🔍 Searching for working Ollama endpoint...")
    
    # First try the configured endpoint
    config = get_api_config()
    print(f"   Trying configured endpoint: {config['base_url']}")
    
    try:
        response = requests.get(config["tags_url"], timeout=5)
        if response.status_code == 200:
            print(f"   ✅ Found working endpoint: {config['base_url']}")
            return config
    except Exception as e:
        print(f"   ❌ Configured endpoint failed: {str(e)}")
    
    # Try different endpoints
    print("   🔄 Trying alternative endpoints...")
    endpoints = try_different_endpoints()
    
    for endpoint in endpoints:
        print(f"   Testing: {endpoint['base_url']}")
        if test_endpoint_connectivity(endpoint):
            print(f"   ✅ Found working endpoint: {endpoint['base_url']}")
            return {
                "base_url": endpoint["base_url"],
                "chat_url": f"{endpoint['base_url']}/api/chat",
                "tags_url": endpoint["tags_url"],
                "bearer_token": config["bearer_token"],
            }
    
    print("   ❌ No working endpoints found")
    return None

def get_available_models(config: Dict[str, str]) -> List[str]:
    """Get list of available models from the API."""
    print("📦 Fetching available models...")
    
    try:
        response = requests.get(config["tags_url"], timeout=10)
        
        if response.status_code == 200:
            data = response.json()
            models = []
            
            if "models" in data:
                for model in data["models"]:
                    model_name = model.get("name", "unknown")
                    model_size = model.get("size", 0)
                    size_gb = round(model_size / (1024**3), 1) if model_size > 0 else 0
                    models.append({
                        "name": model_name,
                        "size": size_gb,
                        "details": model.get("details", {})
                    })
                    
            return models
        else:
            print(f"   ❌ Failed to get models: HTTP {response.status_code}")
            return []
            
    except Exception as e:
        print(f"   ❌ Error fetching models: {str(e)}")
        return []

def test_model_connectivity(model_name: str, config: Dict[str, str]) -> Dict[str, Any]:
    """Test if a specific model is working."""
    print(f"🧪 Testing model: {model_name}")
    
    # Simple test prompt
    payload = {
        "model": model_name,
        "messages": [
            {
                "role": "user", 
                "content": "Hello! Please respond with just 'OK' to confirm you're working."
            }
        ],
        "stream": False,
        "options": {
            "temperature": 0.1,
            "num_predict": 50,
            "top_p": 0.9
        }
    }
    
    headers = {
        "Authorization": f"Bearer {config['bearer_token']}",
        "Content-Type": "application/json"
    }
    
    start_time = time.time()
    
    try:
        response = requests.post(
            config["chat_url"],
            json=payload,
            headers=headers,
            timeout=30
        )
        
        end_time = time.time()
        response_time = round(end_time - start_time, 2)
        
        if response.status_code == 200:
            result = response.json()
            content = result.get("message", {}).get("content", "").strip()
            
            return {
                "status": "success",
                "response_time": response_time,
                "content": content[:100] + "..." if len(content) > 100 else content,
                "response_length": len(content)
            }
        else:
            return {
                "status": "error",
                "response_time": response_time,
                "error": f"HTTP {response.status_code}: {response.text[:200]}"
            }
            
    except requests.Timeout:
        return {
            "status": "timeout",
            "response_time": 30.0,
            "error": "Request timed out after 30 seconds"
        }
    except Exception as e:
        return {
            "status": "exception",
            "response_time": 0,
            "error": str(e)
        }

def main():
    """Main function to check all available models."""
    print("🚀 Model Availability Checker")
    print("=" * 60)
    
    config = get_api_config()
    print(f"📋 Configuration:")
    print(f"   Base URL: {config['base_url']}")
    print(f"   Chat URL: {config['chat_url']}")
    print(f"   Tags URL: {config['tags_url']}")
    print(f"   Bearer Token: {config['bearer_token'][:10]}...")
    print()
    
    # Get available models
    models = get_available_models(config)
    
    if not models:
        print("❌ No models found or API not accessible")
        print("\n💡 Troubleshooting:")
        print("   - Check if Ollama service is running")
        print("   - Verify the API URL is correct")
        print("   - Check network connectivity")
        return
    
    print(f"✅ Found {len(models)} models:")
    for model in models:
        size_info = f" ({model['size']}GB)" if model['size'] > 0 else ""
        print(f"   📦 {model['name']}{size_info}")
    
    print("\n" + "=" * 60)
    print("🧪 TESTING MODEL CONNECTIVITY")
    print("=" * 60)
    
    # Test each model
    results = {}
    working_models = []
    failed_models = []
    
    for model in models:
        model_name = model["name"]
        result = test_model_connectivity(model_name, config)
        results[model_name] = result
        
        if result["status"] == "success":
            working_models.append(model_name)
            print(f"   ✅ {model_name} - OK ({result['response_time']}s)")
            if result.get("content"):
                print(f"      Response: {result['content']}")
        else:
            failed_models.append(model_name)
            status_emoji = "⏱️" if result["status"] == "timeout" else "❌"
            print(f"   {status_emoji} {model_name} - {result['status'].upper()}")
            if result.get("error"):
                print(f"      Error: {result['error']}")
        
        print()  # Add spacing between tests
        time.sleep(1)  # Brief pause between tests
    
    # Summary
    print("=" * 60)
    print("📊 SUMMARY")
    print("=" * 60)
    print(f"✅ Working Models: {len(working_models)}/{len(models)}")
    print(f"❌ Failed Models: {len(failed_models)}/{len(models)}")
    
    if working_models:
        print(f"\n🎉 Working Models:")
        for model in working_models:
            response_time = results[model].get("response_time", 0)
            print(f"   ✅ {model} ({response_time}s)")
    
    if failed_models:
        print(f"\n⚠️  Failed Models:")
        for model in failed_models:
            status = results[model].get("status", "unknown")
            print(f"   ❌ {model} ({status})")
    
    # Recommendations
    print(f"\n💡 RECOMMENDATIONS:")
    if working_models:
        fastest_model = min(working_models, key=lambda m: results[m].get("response_time", float('inf')))
        print(f"   🏃 Fastest model: {fastest_model} ({results[fastest_model]['response_time']}s)")
        
        if "gpt-oss:20b" in working_models:
            print(f"   ✅ Your configured model (gpt-oss:20b) is working!")
        else:
            print(f"   ⚠️  Your configured model (gpt-oss:20b) is not working")
            print(f"   💡 Consider using: {fastest_model}")
    else:
        print(f"   ❌ No models are working - check your Ollama setup")
    
    # Export results to JSON for further analysis
    output_file = "model_test_results.json"
    try:
        with open(output_file, 'w') as f:
            json.dump({
                "config": config,
                "models": models,
                "test_results": results,
                "summary": {
                    "total_models": len(models),
                    "working_models": len(working_models),
                    "failed_models": len(failed_models),
                    "working_model_list": working_models,
                    "failed_model_list": failed_models
                }
            }, f, indent=2)
        print(f"\n📄 Detailed results saved to: {output_file}")
    except Exception as e:
        print(f"\n⚠️  Could not save results file: {str(e)}")

if __name__ == "__main__":
    try:
        main()
    except KeyboardInterrupt:
        print("\n⏹️  Test interrupted by user")
    except Exception as e:
        print(f"\n💥 Unexpected error: {str(e)}")