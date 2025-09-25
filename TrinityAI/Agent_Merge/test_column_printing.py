#!/usr/bin/env python3
"""
Test script to demonstrate enhanced column printing functionality
for the SmartMergeAgent when loading arrow files.
"""

import os
import sys
import logging

# Add the parent directory to the path so we can import our modules
sys.path.append(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from Agent_Merge.llm_merge import SmartMergeAgent

def test_column_printing():
    """Test the enhanced column printing functionality."""
    
    # Set up logging
    logging.basicConfig(level=logging.INFO, format='%(asctime)s - %(levelname)s - %(message)s')
    
    print("🧪 Testing Enhanced Column Printing for SmartMergeAgent")
    print("=" * 60)
    
    # Mock configuration (you'll need to replace with actual values)
    config = {
        'api_url': 'http://localhost:11434/v1/chat/completions',
        'model_name': 'llama3.1:8b',
        'bearer_token': 'your_token_here',
        'minio_endpoint': 'localhost:9000',
        'access_key': 'your_access_key',
        'secret_key': 'your_secret_key',
        'bucket': 'trinity',
        'prefix': 'test/'
    }
    
    try:
        # Initialize the agent
        print("🔧 Initializing SmartMergeAgent...")
        agent = SmartMergeAgent(**config)
        
        print("\n✅ Agent initialized successfully!")
        print(f"📁 Files loaded: {len(agent.files_with_columns)}")
        
        if agent.files_with_columns:
            print("\n📊 Available files and their columns:")
            for filename, columns in agent.files_with_columns.items():
                print(f"  • {filename}: {len(columns)} columns")
                print(f"    Columns: {columns}")
        else:
            print("\n⚠️  No files were loaded. Check your MinIO configuration.")
            
    except Exception as e:
        print(f"\n❌ Error during testing: {e}")
        print("💡 Make sure your MinIO server is running and accessible")
        print("💡 Verify your MinIO credentials and bucket configuration")

if __name__ == "__main__":
    test_column_printing()
