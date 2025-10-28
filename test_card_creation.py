#!/usr/bin/env python3
"""
Quick test to verify card creation API works
"""
import requests
import json

# Test card creation endpoint
def test_card_creation():
    url = "http://localhost:8001/api/laboratory/cards"
    payload = {
        "atomId": "merge",
        "source": "ai",
        "llm": "deepseek-r1:32b"
    }
    
    print("Testing Card Creation API")
    print(f"URL: {url}")
    print(f"Payload: {json.dumps(payload, indent=2)}")
    print("-" * 80)
    
    try:
        response = requests.post(url, json=payload, timeout=10)
        print(f"Status Code: {response.status_code}")
        print(f"Response:")
        print(json.dumps(response.json(), indent=2))
        
        if response.status_code == 200:
            print("\nCARD CREATION SUCCESSFUL!")
            return response.json()
        else:
            print(f"\nCARD CREATION FAILED: {response.status_code}")
            return None
            
    except Exception as e:
        print(f"ERROR: {e}")
        return None

if __name__ == "__main__":
    result = test_card_creation()

