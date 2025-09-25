#!/usr/bin/env python3
"""
Test script to verify Chart Maker AI integration
This script tests the complete flow from AI response to chart generation
"""

import json
import requests
import time

def test_chart_maker_integration():
    """Test the complete chart maker integration flow"""
    
    print("🧪 Testing Chart Maker AI Integration...")
    print("=" * 50)
    
    # Test configuration
    base_url = "http://localhost:8000"  # Adjust if needed
    chart_ai_endpoint = f"{base_url}/chart-maker/chart"
    chart_backend_endpoint = f"{base_url}/chart-maker"
    
    # Test 1: Test AI Chart Generation
    print("\n📊 Test 1: AI Chart Generation")
    print("-" * 30)
    
    test_prompt = "Create a bar chart showing sales by region using the available data"
    
    ai_request = {
        "prompt": test_prompt,
        "session_id": "test_session_123"
    }
    
    try:
        print(f"🚀 Sending request to AI endpoint: {chart_ai_endpoint}")
        print(f"📝 Prompt: {test_prompt}")
        
        ai_response = requests.post(chart_ai_endpoint, json=ai_request, timeout=30)
        
        if ai_response.status_code == 200:
            ai_data = ai_response.json()
            print("✅ AI response received successfully")
            print(f"📊 Success: {ai_data.get('success')}")
            print(f"📝 Message: {ai_data.get('message')}")
            
            if ai_data.get('success') and ai_data.get('chart_json'):
                print("🎯 Chart JSON generated successfully")
                chart_json = ai_data['chart_json']
                print(f"📊 Chart Type: {chart_json.get('chart_type')}")
                print(f"📈 Traces: {len(chart_json.get('traces', []))}")
                print(f"📝 Title: {chart_json.get('title')}")
                
                # Check if file information is present
                if ai_data.get('file_name') or ai_data.get('data_source'):
                    print("📁 File information present:")
                    print(f"   File Name: {ai_data.get('file_name')}")
                    print(f"   Data Source: {ai_data.get('data_source')}")
                else:
                    print("⚠️ No file information in AI response")
                
                # Check file context
                if ai_data.get('file_context'):
                    file_context = ai_data['file_context']
                    print("📁 File context present:")
                    print(f"   Available Files: {len(file_context.get('available_files', []))}")
                    print(f"   Current File ID: {file_context.get('current_file_id')}")
                else:
                    print("⚠️ No file context in AI response")
                
                # Test 2: Test Backend Chart Generation (if we have file info)
                if ai_data.get('file_name'):
                    print("\n📊 Test 2: Backend Chart Generation")
                    print("-" * 30)
                    
                    # First, try to load the saved dataframe
                    load_endpoint = f"{chart_backend_endpoint}/load-saved-dataframe"
                    load_request = {"object_name": ai_data['file_name']}
                    
                    print(f"🚀 Loading saved dataframe: {ai_data['file_name']}")
                    load_response = requests.post(load_endpoint, json=load_request, timeout=30)
                    
                    if load_response.status_code == 200:
                        load_data = load_response.json()
                        print("✅ Dataframe loaded successfully")
                        print(f"📊 File ID: {load_data.get('file_id')}")
                        print(f"📋 Columns: {len(load_data.get('columns', []))}")
                        print(f"📈 Rows: {load_data.get('row_count')}")
                        
                        # Now try to generate the chart
                        chart_request = {
                            "file_id": load_data['file_id'],
                            "chart_type": chart_json.get('chart_type', 'bar'),
                            "traces": chart_json.get('traces', []),
                            "title": chart_json.get('title', 'AI Generated Chart')
                        }
                        
                        print(f"🚀 Generating chart with backend...")
                        chart_response = requests.post(f"{chart_backend_endpoint}/charts", json=chart_request, timeout=30)
                        
                        if chart_response.status_code == 200:
                            chart_data = chart_response.json()
                            print("✅ Chart generated successfully")
                            print(f"📊 Chart ID: {chart_data.get('chart_id')}")
                            print(f"📈 Data rows: {len(chart_data.get('chart_config', {}).get('data', []))}")
                            print(f"📊 Traces: {len(chart_data.get('chart_config', {}).get('traces', []))}")
                        else:
                            print(f"❌ Chart generation failed: {chart_response.status_code}")
                            print(f"📝 Error: {chart_response.text}")
                    else:
                        print(f"❌ Failed to load dataframe: {load_response.status_code}")
                        print(f"📝 Error: {load_response.text}")
                else:
                    print("⚠️ Skipping backend test - no file information available")
                
            else:
                print("❌ No chart JSON in AI response")
                if ai_data.get('suggestions'):
                    print("💡 Suggestions:")
                    for suggestion in ai_data['suggestions']:
                        print(f"   • {suggestion}")
        else:
            print(f"❌ AI request failed: {ai_response.status_code}")
            print(f"📝 Error: {ai_response.text}")
            
    except requests.exceptions.RequestException as e:
        print(f"❌ Request failed: {e}")
    except Exception as e:
        print(f"❌ Unexpected error: {e}")
    
    print("\n" + "=" * 50)
    print("🧪 Chart Maker Integration Test Complete")

if __name__ == "__main__":
    test_chart_maker_integration()
