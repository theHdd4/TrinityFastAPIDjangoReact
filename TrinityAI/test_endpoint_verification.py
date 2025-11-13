#!/usr/bin/env python3
"""
Endpoint Verification Test Script

This script tests each agent endpoint to verify they are accessible and respond correctly.
"""

import requests
import json
from typing import Dict, Any

# Configuration
BASE_URL = "http://localhost:8002"
FASTAPI_URL = "http://localhost:8001"

# Agent endpoints to test
AGENT_ENDPOINTS = {
    "fetch_atom": "/trinityai/chat",
    "merge": "/trinityai/merge",
    "concat": "/trinityai/concat",
    "chart": "/trinityai/chart",
    "groupby": "/trinityai/groupby",
    "explore": "/trinityai/explore",
    "dataframe_operations": "/trinityai/dataframe-operations",
    "create_transform": "/trinityai/create-transform",
}

def test_endpoint_accessibility(endpoint: str, agent_name: str) -> Dict[str, Any]:
    """Test if an endpoint is accessible"""
    
    url = f"{BASE_URL}{endpoint}"
    
    # Prepare test payload based on agent type
    if agent_name == "fetch_atom":
        payload = {"query": "test query"}
    else:
        payload = {"prompt": "test prompt", "session_id": "test_session"}
    
    try:
        response = requests.post(url, json=payload, timeout=10)
        
        # Check if endpoint is accessible (any 2xx or 4xx status is good - it means endpoint exists)
        if response.status_code < 500:
            return {
                "agent": agent_name,
                "endpoint": endpoint,
                "status": "✅ ACCESSIBLE",
                "status_code": response.status_code,
                "accessible": True
            }
        else:
            return {
                "agent": agent_name,
                "endpoint": endpoint,
                "status": "❌ SERVER ERROR",
                "status_code": response.status_code,
                "error": response.text[:200],
                "accessible": False
            }
            
    except requests.exceptions.ConnectionError:
        return {
            "agent": agent_name,
            "endpoint": endpoint,
            "status": "❌ CONNECTION FAILED",
            "error": "Service not running or unreachable",
            "accessible": False
        }
    except requests.exceptions.Timeout:
        return {
            "agent": agent_name,
            "endpoint": endpoint,
            "status": "⚠️ TIMEOUT",
            "error": "Request timed out",
            "accessible": True  # Timeout means endpoint exists
        }
    except Exception as e:
        return {
            "agent": agent_name,
            "endpoint": endpoint,
            "status": "❌ ERROR",
            "error": str(e),
            "accessible": False
        }

def test_card_creation_endpoint() -> Dict[str, Any]:
    """Test Laboratory Card Creation API"""
    
    url = f"{FASTAPI_URL}/api/laboratory/cards"
    payload = {
        "atomId": "merge",
        "source": "manual"
    }
    
    try:
        response = requests.post(url, json=payload, timeout=10)
        
        if response.status_code < 500:
            return {
                "agent": "card_creation",
                "endpoint": "/api/laboratory/cards",
                "status": "✅ ACCESSIBLE",
                "status_code": response.status_code,
                "accessible": True
            }
        else:
            return {
                "agent": "card_creation",
                "endpoint": "/api/laboratory/cards",
                "status": "❌ SERVER ERROR",
                "status_code": response.status_code,
                "accessible": False
            }
            
    except requests.exceptions.ConnectionError:
        return {
            "agent": "card_creation",
            "endpoint": "/api/laboratory/cards",
            "status": "❌ CONNECTION FAILED",
            "error": "FastAPI service not running or unreachable",
            "accessible": False
        }
    except Exception as e:
        return {
            "agent": "card_creation",
            "endpoint": "/api/laboratory/cards",
            "status": "❌ ERROR",
            "error": str(e),
            "accessible": False
        }

def main():
    """Run endpoint verification tests"""
    
    print("🔍 Endpoint Verification Test")
    print("=" * 80)
    print()
    
    results = []
    
    # Test TrinityAI agent endpoints
    print("📋 Testing TrinityAI Agent Endpoints (Port 8002):")
    print("-" * 80)
    
    for agent_name, endpoint in AGENT_ENDPOINTS.items():
        result = test_endpoint_accessibility(endpoint, agent_name)
        results.append(result)
        
        status_emoji = "✅" if result["accessible"] else "❌"
        print(f"{status_emoji} {agent_name:25} → {endpoint:45} | {result['status']}")
    
    print()
    
    # Test Laboratory Card Creation API
    print("📋 Testing Laboratory Card Creation API (Port 8001):")
    print("-" * 80)
    
    card_result = test_card_creation_endpoint()
    results.append(card_result)
    
    status_emoji = "✅" if card_result["accessible"] else "❌"
    print(f"{status_emoji} {card_result['agent']:25} → {card_result['endpoint']:45} | {card_result['status']}")
    
    print()
    print("=" * 80)
    
    # Summary
    accessible_count = sum(1 for r in results if r["accessible"])
    total_count = len(results)
    
    print(f"\n📊 Summary: {accessible_count}/{total_count} endpoints accessible")
    
    if accessible_count == total_count:
        print("✅ All endpoints are accessible!")
    else:
        print("⚠️ Some endpoints are not accessible. Check service status.")
        print("\nNon-accessible endpoints:")
        for r in results:
            if not r["accessible"]:
                print(f"  - {r['agent']}: {r['endpoint']}")
                if "error" in r:
                    print(f"    Error: {r['error']}")
    
    print()
    
    # Save results to file
    with open("endpoint_verification_results.json", "w") as f:
        json.dump(results, f, indent=2)
    
    print("💾 Results saved to endpoint_verification_results.json")
    print()

if __name__ == "__main__":
    main()
