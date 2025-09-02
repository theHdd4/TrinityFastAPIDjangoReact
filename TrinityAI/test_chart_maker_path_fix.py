#!/usr/bin/env python3
"""
Test script to diagnose and fix Chart Maker MinIO path issues
This script helps identify why the chart maker is not finding files
"""

import os
import sys
import requests
import json

def test_environment_variables():
    """Test current environment variables"""
    print("🔍 ===== ENVIRONMENT VARIABLES TEST =====")
    
    client = os.getenv("CLIENT_NAME", "").strip()
    app = os.getenv("APP_NAME", "").strip()
    project = os.getenv("PROJECT_NAME", "").strip()
    
    print(f"CLIENT_NAME: '{client}'")
    print(f"APP_NAME: '{app}'")
    print(f"PROJECT_NAME: '{project}'")
    
    if client == "default_client" and app == "default_app" and project == "default_project":
        print("❌ CRITICAL: Using default values - this will cause issues!")
        return False
    elif not client or not app or not project:
        print("❌ CRITICAL: Missing environment variables!")
        return False
    else:
        print("✅ Environment variables look good")
        return True

def test_api_prefix_endpoint():
    """Test the API endpoint to get the current prefix"""
    print("\n🔍 ===== API PREFIX ENDPOINT TEST =====")
    
    try:
        base_url = "http://localhost:8000"  # Adjust if needed
        prefix_endpoint = f"{base_url}/data-upload-validate/get_object_prefix"
        
        print(f"Testing endpoint: {prefix_endpoint}")
        
        response = requests.get(prefix_endpoint, timeout=10)
        
        if response.status_code == 200:
            data = response.json()
            prefix = data.get("prefix", "")
            environment = data.get("environment", {})
            source = data.get("source", "unknown")
            
            print(f"✅ API call successful")
            print(f"📁 Prefix: {prefix}")
            print(f"🔧 Source: {source}")
            print(f"📋 Environment: {json.dumps(environment, indent=2)}")
            
            if prefix and prefix != "default_client/default_app/default_project/":
                print("✅ Prefix looks good")
                return prefix
            else:
                print("❌ Prefix is still using default values")
                return None
        else:
            print(f"❌ API call failed with status: {response.status_code}")
            print(f"📝 Response: {response.text}")
            return None
            
    except Exception as e:
        print(f"❌ API call failed: {e}")
        return None

def test_minio_connection():
    """Test MinIO connection and list available buckets"""
    print("\n🔍 ===== MINIO CONNECTION TEST =====")
    
    try:
        from minio import Minio
        
        # Try to connect to MinIO
        minio_client = Minio("minio:9000", access_key="minio", secret_key="minio123", secure=False)
        
        # List buckets
        buckets = list(minio_client.list_buckets())
        print(f"✅ MinIO connection successful")
        print(f"🪣 Available buckets: {[b.name for b in buckets]}")
        
        # Check if 'trinity' bucket exists
        trinity_bucket = None
        for bucket in buckets:
            if bucket.name == "trinity":
                trinity_bucket = bucket
                break
        
        if trinity_bucket:
            print("✅ 'trinity' bucket found")
            
            # List some objects in the bucket
            objects = list(minio_client.list_objects("trinity", recursive=True))
            print(f"📊 Total objects in bucket: {len(objects)}")
            
            # Show first few objects
            for i, obj in enumerate(objects[:10]):
                print(f"  {i+1}. {obj.object_name}")
            if len(objects) > 10:
                print(f"  ... and {len(objects) - 10} more objects")
            
            return True
        else:
            print("❌ 'trinity' bucket not found")
            return False
            
    except Exception as e:
        print(f"❌ MinIO connection failed: {e}")
        return False

def suggest_fixes():
    """Suggest fixes for common path issues"""
    print("\n🔍 ===== SUGGESTED FIXES =====")
    
    print("1. Check environment variables:")
    print("   export CLIENT_NAME='your_actual_client'")
    print("   export APP_NAME='your_actual_app'")
    print("   export PROJECT_NAME='your_actual_project'")
    
    print("\n2. Check Redis cache:")
    print("   - The system should be using Redis to get the correct client/app/project names")
    print("   - Check if Redis is running and accessible")
    
    print("\n3. Check database:")
    print("   - The system falls back to database if Redis is unavailable")
    print("   - Check if the database has the correct client/app/project information")
    
    print("\n4. Manual path setting:")
    print("   - If automatic detection fails, you can manually set the path")
    print("   - Use the set_minio_path() method in the chart maker agent")
    
    print("\n5. Check MinIO:")
    print("   - Verify that files exist in the expected path")
    print("   - Check MinIO permissions and access")

def main():
    """Main test function"""
    print("🧪 Chart Maker Path Diagnosis Tool")
    print("=" * 50)
    
    # Test 1: Environment variables
    env_ok = test_environment_variables()
    
    # Test 2: API endpoint
    api_prefix = test_api_prefix_endpoint()
    
    # Test 3: MinIO connection
    minio_ok = test_minio_connection()
    
    # Summary
    print("\n🔍 ===== SUMMARY =====")
    
    if env_ok and api_prefix and minio_ok:
        print("✅ All tests passed! Chart maker should work properly.")
        print(f"📁 Using prefix: {api_prefix}")
    else:
        print("❌ Some tests failed. Chart maker may not work properly.")
        
        if not env_ok:
            print("❌ Environment variables issue detected")
        if not api_prefix:
            print("❌ API prefix endpoint issue detected")
        if not minio_ok:
            print("❌ MinIO connection issue detected")
    
    # Suggest fixes
    suggest_fixes()
    
    print("\n" + "=" * 50)
    print("🧪 Path Diagnosis Complete")

if __name__ == "__main__":
    main()
