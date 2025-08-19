#!/usr/bin/env python3
"""
Test script for create-transform functionality
"""

import requests
import json
import time

def test_create_transform():
    """Test the create-transform endpoint"""
    
    # Test URL - adjust based on your setup
    base_url = "http://localhost:8002"  # Default TrinityAI port
    endpoint = f"{base_url}/trinityai/create-transform"
    
    print(f"🧪 Testing create-transform endpoint: {endpoint}")
    
    # Test data
    test_prompt = "Add volume and sales_volume columns together and name the result total_volume"
    
    payload = {
        "prompt": test_prompt,
        "session_id": "test_session_123"
    }
    
    try:
        print(f"📤 Sending request with prompt: {test_prompt}")
        print(f"📋 Payload: {json.dumps(payload, indent=2)}")
        
        # Send request
        response = requests.post(endpoint, json=payload, timeout=30)
        
        print(f"📥 Response status: {response.status_code}")
        print(f"📥 Response headers: {dict(response.headers)}")
        
        if response.status_code == 200:
            result = response.json()
            print(f"✅ Success! Response: {json.dumps(result, indent=2)}")
            
            # Check if we got a valid configuration
            if result.get("success") and result.get("create_transform_json"):
                config = result["create_transform_json"]
                print(f"🎯 Configuration received: {json.dumps(config, indent=2)}")
                
                # Test the perform endpoint if we have a valid config
                if "operations" in config and config["operations"]:
                    print(f"🚀 Testing perform endpoint...")
                    test_perform_endpoint(config)
            else:
                print(f"⚠️ No configuration in response: {result}")
                
        else:
            print(f"❌ Error response: {response.text}")
            
    except requests.exceptions.RequestException as e:
        print(f"❌ Request failed: {e}")
    except Exception as e:
        print(f"❌ Unexpected error: {e}")

def test_perform_endpoint(config):
    """Test the perform endpoint with the generated configuration"""
    
    base_url = "http://localhost:8002"
    endpoint = f"{base_url}/trinityai/perform"
    
    # Extract data from config
    file_name = config.get("object_names", "test_file.csv")
    bucket_name = config.get("bucket_name", "trinity")
    identifiers = config.get("identifiers", [])
    operations = config.get("operations", [])
    
    payload = {
        "operation": "create_transform",
        "file1": file_name,
        "file2": file_name,  # Same file for create_transform
        "bucket_name": bucket_name,
        "identifiers": json.dumps(identifiers),
        "operations": json.dumps(operations)
    }
    
    print(f"📤 Testing perform endpoint with: {json.dumps(payload, indent=2)}")
    
    try:
        response = requests.post(endpoint, json=payload, timeout=60)
        
        print(f"📥 Perform response status: {response.status_code}")
        
        if response.status_code == 200:
            result = response.json()
            print(f"✅ Perform successful! Result: {json.dumps(result, indent=2)}")
        else:
            print(f"❌ Perform failed: {response.text}")
            
    except Exception as e:
        print(f"❌ Perform test failed: {e}")

def test_health_endpoint():
    """Test the health endpoint"""
    
    base_url = "http://localhost:8002"
    endpoint = f"{base_url}/trinityai/health"
    
    print(f"🏥 Testing health endpoint: {endpoint}")
    
    try:
        response = requests.get(endpoint, timeout=10)
        
        if response.status_code == 200:
            result = response.json()
            print(f"✅ Health check passed: {json.dumps(result, indent=2)}")
        else:
            print(f"❌ Health check failed: {response.status_code}")
            
    except Exception as e:
        print(f"❌ Health check failed: {e}")

def test_files_endpoint():
    """Test the files endpoint"""
    
    base_url = "http://localhost:8002"
    endpoint = f"{base_url}/trinityai/create-transform/files"
    
    print(f"📁 Testing files endpoint: {endpoint}")
    
    try:
        response = requests.get(endpoint, timeout=10)
        
        if response.status_code == 200:
            result = response.json()
            print(f"✅ Files endpoint working: {json.dumps(result, indent=2)}")
        else:
            print(f"❌ Files endpoint failed: {response.status_code}")
            
    except Exception as e:
        print(f"❌ Files endpoint failed: {e}")

if __name__ == "__main__":
    print("🚀 Starting create-transform tests...")
    print("=" * 60)
    
    # Test health first
    test_health_endpoint()
    print()
    
    # Test files endpoint
    test_files_endpoint()
    print()
    
    # Test create-transform endpoint
    test_create_transform()
    print()
    
    print("🏁 Tests completed!")
