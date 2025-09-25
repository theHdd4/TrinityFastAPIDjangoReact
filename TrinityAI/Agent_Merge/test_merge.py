#!/usr/bin/env python3
"""
Test script to debug the merge agent
"""

import requests
import json
import logging

# Set up logging
logging.basicConfig(level=logging.INFO, format='%(asctime)s - %(name)s - %(levelname)s - %(message)s')
logger = logging.getLogger(__name__)

def test_merge_agent():
    """Test the merge agent endpoint"""
    
    # Test the merge agent
    merge_url = "http://localhost:8002/trinityai/merge"
    
    test_prompts = [
        "merge orders.csv with products.csv on order_id",
        "combine sales.csv and customers.csv using customer_id",
        "join inventory.csv with suppliers.csv on supplier_id"
    ]
    
    for i, prompt in enumerate(test_prompts, 1):
        logger.info(f"\n=== TEST {i} ===")
        logger.info(f"Prompt: {prompt}")
        
        try:
            response = requests.post(
                merge_url,
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
                    if data.get("merge_json"):
                        logger.info("✅ SUCCESS: Got merge_json")
                        merge_cfg = data["merge_json"]
                        logger.info(f"File1: {merge_cfg.get('file1')}")
                        logger.info(f"File2: {merge_cfg.get('file2')}")
                        logger.info(f"Join Columns: {merge_cfg.get('join_columns')}")
                        logger.info(f"Join Type: {merge_cfg.get('join_type')}")
                    else:
                        logger.warning("⚠️ WARNING: No merge_json in response")
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
    test_merge_agent()
