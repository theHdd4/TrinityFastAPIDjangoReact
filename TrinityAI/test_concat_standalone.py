#!/usr/bin/env python3
"""
Test script to verify the concat agent is working standalone
"""

import requests
import json
import logging

# Set up logging
logging.basicConfig(level=logging.INFO, format='%(asctime)s - %(name)s - %(levelname)s - %(message)s')
logger = logging.getLogger(__name__)

def test_concat_standalone():
    """Test the concat agent standalone endpoint"""
    
    # Test the concat agent directly (not through main API)
    concat_url = "http://localhost:8002/concat"
    
    test_prompts = [
        "concatenate orders.csv with products.csv vertically",
        "combine sales.csv and customers.csv horizontally"
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
            
            if response.ok:
                data = response.json()
                logger.info(f"Response Data: {json.dumps(data, indent=2)}")
                
                if data.get("success"):
                    logger.info("✅ SUCCESS: Got successful response")
                    if data.get("concat_json"):
                        logger.info("✅ SUCCESS: Got concat_json")
                    else:
                        logger.warning("⚠️ WARNING: No concat_json in response")
                else:
                    logger.warning("⚠️ WARNING: Response indicates failure")
                    if data.get("suggestions"):
                        logger.info(f"Suggestions: {data['suggestions']}")
            else:
                logger.error(f"❌ ERROR: Request failed with status {response.status_code}")
                logger.error(f"Error Text: {response.text}")
                
        except Exception as e:
            logger.error(f"❌ EXCEPTION: {e}")
    
    # Test the health endpoint
    logger.info(f"\n=== HEALTH CHECK ===")
    try:
        health_url = "http://localhost:8002/health"
        health_response = requests.get(health_url, timeout=10)
        logger.info(f"Health Status: {health_response.status_code}")
        if health_response.ok:
            health_data = health_response.json()
            logger.info(f"Health Data: {json.dumps(health_data, indent=2)}")
    except Exception as e:
        logger.error(f"Health check failed: {e}")

if __name__ == "__main__":
    test_concat_standalone()

