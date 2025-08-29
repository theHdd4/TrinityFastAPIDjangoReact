#!/usr/bin/env python3
"""
Test script to verify the endpoint configurations
"""

import requests
import json
import logging

# Set up logging
logging.basicConfig(level=logging.INFO, format='%(asctime)s - %(levelname)s - %(message)s')
logger = logging.getLogger(__name__)

def test_concat_endpoint():
    """Test the concat endpoint mounted under main API"""
    concat_url = "http://localhost:8002/trinityai/concat"
    
    logger.info(f"Testing concat endpoint: {concat_url}")
    
    try:
        response = requests.post(
            concat_url,
            json={"prompt": "concatenate test1.csv with test2.csv vertically"},
            headers={"Content-Type": "application/json"},
            timeout=30
        )
        
        logger.info(f"Concat Status: {response.status_code}")
        if response.ok:
            data = response.json()
            logger.info(f"Concat Response: {json.dumps(data, indent=2)}")
            return True
        else:
            logger.error(f"Concat failed: {response.text}")
            return False
            
    except Exception as e:
        logger.error(f"Concat test failed: {e}")
        return False

def test_merge_endpoint():
    """Test the merge endpoint mounted under main API"""
    merge_url = "http://localhost:8002/trinityai/merge"
    
    logger.info(f"Testing merge endpoint: {merge_url}")
    
    try:
        response = requests.post(
            merge_url,
            json={"prompt": "merge test1.csv with test2.csv on id"},
            headers={"Content-Type": "application/json"},
            timeout=30
        )
        
        logger.info(f"Merge Status: {response.status_code}")
        if response.ok:
            data = response.json()
            logger.info(f"Merge Response: {json.dumps(data, indent=2)}")
            return True
        else:
            logger.error(f"Merge failed: {response.text}")
            return False
            
    except Exception as e:
        logger.error(f"Merge test failed: {e}")
        return False

def test_main_api_health():
    """Test the main API health endpoint"""
    health_url = "http://localhost:8002/trinityai/health"
    
    logger.info(f"Testing main API health: {health_url}")
    
    try:
        response = requests.get(health_url, timeout=10)
        
        logger.info(f"Health Status: {response.status_code}")
        if response.ok:
            data = response.json()
            logger.info(f"Health Response: {json.dumps(data, indent=2)}")
            return True
        else:
            logger.error(f"Health check failed: {response.text}")
            return False
            
    except Exception as e:
        logger.error(f"Health check failed: {e}")
        return False

if __name__ == "__main__":
    logger.info("=== ENDPOINT TESTING ===")
    
    # Test main API health
    test_main_api_health()
    
    # Test concat endpoint (standalone)
    test_concat_endpoint()
    
    # Test merge endpoint (mounted)
    test_merge_endpoint()
