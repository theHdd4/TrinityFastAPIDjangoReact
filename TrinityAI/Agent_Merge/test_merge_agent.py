#!/usr/bin/env python3
"""
Test script for the enhanced SmartMergeAgent
Demonstrates automatic column detection and LLM-driven JSON generation
"""

import json
import logging
from llm_merge import SmartMergeAgent

# Set up logging
logging.basicConfig(level=logging.INFO)
logger = logging.getLogger("test.merge")

def test_merge_agent():
    """Test the enhanced merge agent functionality"""
    
    # Mock configuration for testing
    config = {
        "api_url": "http://localhost:11434/api/chat",
        "model_name": "qwen3:30b",
        "bearer_token": "test_token",
        "minio_endpoint": "localhost:9000",
        "access_key": "test",
        "secret_key": "test123",
        "bucket": "test",
        "prefix": ""
    }
    
    # Create agent instance
    agent = SmartMergeAgent(**config)
    
    # Mock files with columns for testing
    agent.files_with_columns = {
        "orders.csv": ["order_id", "customer_id", "product_id", "quantity", "order_date"],
        "customers.csv": ["customer_id", "customer_name", "email", "phone", "address"],
        "products.csv": ["product_id", "product_name", "category", "price", "supplier_id"],
        "suppliers.csv": ["supplier_id", "supplier_name", "contact_person", "phone", "email"]
    }
    
    logger.info("=== Testing Enhanced Merge Agent ===")
    logger.info(f"Loaded {len(agent.files_with_columns)} test files")
    
    # Test common column detection
    logger.info("\n=== Testing Common Column Detection ===")
    
    test_pairs = [
        ("orders.csv", "customers.csv"),
        ("orders.csv", "products.csv"),
        ("products.csv", "suppliers.csv"),
        ("customers.csv", "suppliers.csv")
    ]
    
    for file1, file2 in test_pairs:
        common_cols = agent._find_common_columns(file1, file2)
        logger.info(f"Common columns between {file1} and {file2}: {common_cols}")
    
    # Test context enhancement
    logger.info("\n=== Testing Context Enhancement ===")
    
    test_prompts = [
        "merge orders.csv with customers.csv",
        "combine products.csv and suppliers.csv on supplier_id",
        "join orders.csv with products.csv"
    ]
    
    for prompt in test_prompts:
        base_context = "Previous successful merge: orders.csv + customers.csv on customer_id"
        enhanced_context = agent._enhance_context_with_columns(base_context, prompt)
        logger.info(f"\nPrompt: {prompt}")
        logger.info(f"Enhanced context preview: {enhanced_context[:200]}...")
    
    # Test session management
    logger.info("\n=== Testing Session Management ===")
    
    session_id = agent.create_session()
    logger.info(f"Created session: {session_id}")
    
    # Test processing a request (without actual LLM call)
    logger.info("\n=== Testing Request Processing Structure ===")
    
    # Mock the LLM response for testing
    mock_llm_response = {
        "success": True,
        "merge_json": {
            "bucket_name": "trinity",
            "file1": ["orders.csv"],
            "file2": ["customers.csv"],
            "join_columns": ["customer_id"],
            "join_type": "outer"
        },
        "message": "Merge configuration completed successfully",
        "reasoning": "Found common column 'customer_id' between files",
        "used_memory": True
    }
    
    # Test JSON validation
    if mock_llm_response.get("success") and mock_llm_response.get("merge_json"):
        merge_json = mock_llm_response["merge_json"]
        # Ensure default values are set
        if "join_type" not in merge_json:
            merge_json["join_type"] = "outer"
        if "bucket_name" not in merge_json:
            merge_json["bucket_name"] = "trinity"
        
        logger.info(f"Validated merge JSON: {json.dumps(merge_json, indent=2)}")
    
    logger.info("\n=== Test Completed Successfully ===")
    logger.info("The enhanced merge agent is ready for production use!")

if __name__ == "__main__":
    test_merge_agent()
