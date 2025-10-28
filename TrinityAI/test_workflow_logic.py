#!/usr/bin/env python3
"""
Test script for the updated SuperAgent workflow logic.

This script tests the specific workflow logic:
Step 1: Check for agent_name → Add Card API
Step 2: Fetch Atom API with "fetch <agent_name> atom"  
Step 3: Run Atom API with original prompt + task text
"""

import requests
import json
import time
from typing import Dict, Any

# Configuration
SUPERAGENT_BASE_URL = "http://localhost:8002"
TRINITY_AI_BASE_URL = "http://localhost:8002"
FASTAPI_BASE_URL = "http://localhost:8001"

def test_workflow_generation():
    """Test the workflow generation with the new logic"""
    
    print("🧪 Testing SuperAgent Workflow Generation Logic")
    print("=" * 60)
    
    test_prompts = [
        "merge the files uk mayo and uk beans",
        "create a chart from sales data", 
        "explore the customer dataset",
        "concat the files file1 and file2 vertically"
    ]
    
    for i, prompt in enumerate(test_prompts, 1):
        print(f"\n📝 Test {i}: {prompt}")
        print("-" * 40)
        
        try:
            # Test workflow generation
            response = requests.post(
                f"{SUPERAGENT_BASE_URL}/trinityai/superagent/generate-workflow",
                json={"message": prompt},
                timeout=30
            )
            
            if response.status_code == 200:
                workflow_data = response.json()
                print(f"✅ Workflow generated successfully")
                print(f"📊 Total steps: {workflow_data.get('total_steps', 0)}")
                print(f"🎯 Is data science: {workflow_data.get('is_data_science', False)}")
                
                # Check workflow structure
                workflow = workflow_data.get('workflow', [])
                if len(workflow) >= 3:
                    print("\n🔍 Workflow Steps Analysis:")
                    
                    # Step 1: CARD_CREATION
                    step1 = workflow[0]
                    print(f"  Step 1: {step1.get('action')} - {step1.get('agent')}")
                    print(f"    Prompt: {step1.get('prompt')}")
                    print(f"    Endpoint: {step1.get('endpoint')}")
                    if step1.get('payload'):
                        print(f"    Payload: {step1.get('payload')}")
                    
                    # Step 2: FETCH_ATOM
                    step2 = workflow[1]
                    print(f"  Step 2: {step2.get('action')} - {step2.get('agent')}")
                    print(f"    Prompt: {step2.get('prompt')}")
                    print(f"    Endpoint: {step2.get('endpoint')}")
                    
                    # Verify fetch prompt follows new logic
                    fetch_prompt = step2.get('prompt', '').lower()
                    if 'fetch' in fetch_prompt and 'atom' in fetch_prompt:
                        print(f"    ✅ Fetch prompt follows new logic: '{step2.get('prompt')}'")
                    else:
                        print(f"    ❌ Fetch prompt doesn't follow new logic: '{step2.get('prompt')}'")
                    
                    # Step 3: AGENT_EXECUTION
                    step3 = workflow[2]
                    print(f"  Step 3: {step3.get('action')} - {step3.get('agent')}")
                    print(f"    Prompt: {step3.get('prompt')}")
                    print(f"    Endpoint: {step3.get('endpoint')}")
                    
                    # Verify combined prompt follows new logic
                    exec_prompt = step3.get('prompt', '')
                    if prompt in exec_prompt and ('original' in exec_prompt.lower() or 'task' in exec_prompt.lower()):
                        print(f"    ✅ Execution prompt combines original + task: '{exec_prompt[:100]}...'")
                    else:
                        print(f"    ❌ Execution prompt doesn't combine properly: '{exec_prompt[:100]}...'")
                        
                else:
                    print(f"❌ Invalid workflow structure: expected 3+ steps, got {len(workflow)}")
                    
            else:
                print(f"❌ Failed to generate workflow: {response.status_code}")
                print(f"   Error: {response.text}")
                
        except Exception as e:
            print(f"❌ Error testing workflow generation: {e}")
        
        time.sleep(1)  # Rate limiting

def test_enhanced_chat():
    """Test the enhanced chat endpoint with workflow logic"""
    
    print("\n\n🧪 Testing Enhanced Chat with Workflow Logic")
    print("=" * 60)
    
    test_prompts = [
        "merge files uk mayo and uk beans using the workflow",
        "create a visualization from the sales dataset"
    ]
    
    for i, prompt in enumerate(test_prompts, 1):
        print(f"\n📝 Test {i}: {prompt}")
        print("-" * 40)
        
        try:
            # Test enhanced chat
            response = requests.post(
                f"{SUPERAGENT_BASE_URL}/trinityai/superagent/enhanced-chat",
                json={"message": prompt},
                timeout=30
            )
            
            if response.status_code == 200:
                chat_data = response.json()
                print(f"✅ Enhanced chat successful")
                print(f"🎯 Domain related: {chat_data.get('is_domain_related', False)}")
                print(f"🔄 Workflow generated: {chat_data.get('workflow_generated', False)}")
                print(f"🤖 Recommended agents: {chat_data.get('recommended_agents', [])}")
                
                # Check processing details
                processing = chat_data.get('processing_details', {})
                if processing:
                    print(f"📊 Confidence: {processing.get('confidence', 0.0)}")
                    print(f"📁 Files mentioned: {processing.get('mentioned_files', [])}")
                    print(f"📈 Available files: {processing.get('available_files_count', 0)}")
                    
                    # Check workflow details
                    workflow_info = processing.get('workflow', {})
                    if workflow_info:
                        print(f"🔄 Workflow steps: {workflow_info.get('total_steps', 0)}")
                        
            else:
                print(f"❌ Failed enhanced chat: {response.status_code}")
                print(f"   Error: {response.text}")
                
        except Exception as e:
            print(f"❌ Error testing enhanced chat: {e}")
        
        time.sleep(1)  # Rate limiting

def test_orchestration():
    """Test the complete orchestration with new workflow logic"""
    
    print("\n\n🧪 Testing Complete Orchestration")
    print("=" * 60)
    
    test_prompts = [
        "merge file1 and file2, then create a chart"
    ]
    
    for i, prompt in enumerate(test_prompts, 1):
        print(f"\n📝 Test {i}: {prompt}")
        print("-" * 40)
        
        try:
            # Test orchestration
            response = requests.post(
                f"{SUPERAGENT_BASE_URL}/trinityai/superagent/orchestrate",
                json={"message": prompt},
                timeout=60  # Longer timeout for orchestration
            )
            
            if response.status_code == 200:
                orchestration_data = response.json()
                print(f"✅ Orchestration successful")
                print(f"🎯 Success: {orchestration_data.get('success', False)}")
                print(f"📊 Steps completed: {orchestration_data.get('steps_completed', 0)}")
                print(f"⏱️ Execution time: {orchestration_data.get('execution_time', 0):.2f}s")
                
                # Check results
                results = orchestration_data.get('results', {})
                if results:
                    print(f"\n🔍 Execution Results:")
                    for step_key, step_result in results.items():
                        success = step_result.get('success', False)
                        action = step_result.get('action', 'unknown')
                        agent = step_result.get('agent', 'unknown')
                        print(f"  {step_key}: {action} - {agent} - {'✅' if success else '❌'}")
                        
                # Check errors
                errors = orchestration_data.get('errors', [])
                if errors:
                    print(f"\n❌ Errors encountered:")
                    for error in errors:
                        print(f"  - {error}")
                        
            else:
                print(f"❌ Failed orchestration: {response.status_code}")
                print(f"   Error: {response.text}")
                
        except Exception as e:
            print(f"❌ Error testing orchestration: {e}")
        
        time.sleep(2)  # Rate limiting

def main():
    """Run all tests"""
    
    print("🚀 SuperAgent Workflow Logic Test Suite")
    print("=" * 60)
    print("Testing the new workflow logic:")
    print("Step 1: Check for agent_name → Add Card API")
    print("Step 2: Fetch Atom API with 'fetch <agent_name> atom'")  
    print("Step 3: Run Atom API with original prompt + task text")
    print()
    
    # Test workflow generation
    test_workflow_generation()
    
    # Test enhanced chat
    test_enhanced_chat()
    
    # Test orchestration (optional - may take longer)
    print("\n\n" + "="*60)
    print("🧪 ORCHESTRATION TEST (Optional - may take longer)")
    print("="*60)
    
    user_input = input("Run orchestration test? (y/n): ").lower().strip()
    if user_input in ['y', 'yes']:
        test_orchestration()
    else:
        print("⏭️ Skipping orchestration test")
    
    print("\n\n🎉 Test suite completed!")
    print("=" * 60)

if __name__ == "__main__":
    main()
