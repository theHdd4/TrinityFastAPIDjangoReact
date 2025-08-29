#!/usr/bin/env python3
"""
Test script to debug the concat agent
"""

import requests
import json
import logging

# Set up logging
logging.basicConfig(level=logging.INFO, format='%(asctime)s - %(name)s - %(levelname)s - %(message)s')
logger = logging.getLogger(__name__)

def test_concat_agent():
    """Test the concat agent endpoint"""
    
    # Test the concat agent
    concat_url = "http://localhost:8002/trinityai/concat"
    
    test_prompts = [
        "concatenate orders.csv with products.csv vertically",
        "combine sales.csv and customers.csv horizontally",
        "join inventory.csv with suppliers.csv vertically"
    ]
    
    for i, prompt in enumerate(test_prompts, 1):
        logger.info(f"\n=== TEST {i} ===")
        logger.info(f"Prompt: {prompt}")
        
        try:
            response = requests.post(
                concat_url,
                json={"prompt": prompt},
                headers={"Content-Type": "application/json"},
                timeout=30
            )
            
            logger.info(f"Response Status: {response.status_code}")
            logger.info(f"Response Headers: {dict(response.headers)}")
            
            if response.ok:
                data = response.json()
                logger.info(f"Response Data: {json.dumps(data, indent=2)}")
                
                # Check if we got a successful response
                if data.get("success"):
                    logger.info("✅ SUCCESS: Got successful response")
                    if data.get("concat_json"):
                        logger.info("✅ SUCCESS: Got concat_json")
                        concat_cfg = data["concat_json"]
                        logger.info(f"File1: {concat_cfg.get('file1')}")
                        logger.info(f"File2: {concat_cfg.get('file2')}")
                        logger.info(f"Direction: {concat_cfg.get('concat_direction')}")
                    else:
                        logger.warning("⚠️ WARNING: No concat_json in response")
                else:
                    logger.warning("⚠️ WARNING: Response indicates failure")
                    if data.get("suggestions"):
                        logger.info(f"Suggestions: {data['suggestions']}")
            else:
                logger.error(f"❌ ERROR: Request failed with status {response.status_code}")
                try:
                    error_data = response.json()
                    logger.error(f"Error Data: {json.dumps(error_data, indent=2)}")
                except:
                    logger.error(f"Error Text: {response.text}")
                    
        except Exception as e:
            logger.error(f"❌ EXCEPTION: {e}")
    
    # Test the health endpoint
    logger.info(f"\n=== HEALTH CHECK ===")
    try:
        health_url = "http://localhost:8002/trinityai/health"
        health_response = requests.get(health_url, timeout=10)
        logger.info(f"Health Status: {health_response.status_code}")
        if health_response.ok:
            health_data = health_response.json()
            logger.info(f"Health Data: {json.dumps(health_data, indent=2)}")
    except Exception as e:
        logger.error(f"Health check failed: {e}")

if __name__ == "__main__":
    test_concat_agent()
