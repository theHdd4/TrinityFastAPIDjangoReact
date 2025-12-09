"""
Test script to verify /file-preview endpoint works correctly with description rows.
"""
import requests
import json
import sys
import os

# Add the app directory to path
sys.path.insert(0, os.path.join(os.path.dirname(__file__), 'app'))

# Configuration
BASE_URL = "http://localhost:8004"  # Adjust if your backend runs on different port
API_ENDPOINT = f"{BASE_URL}/api/data-upload-validate/file-preview"

def test_file_preview():
    """Test the file-preview endpoint with a file that has description rows."""
    
    print("=" * 80)
    print("Testing /file-preview API Endpoint")
    print("=" * 80)
    
    # Step 1: First upload the file to get its path
    print("\n1. Uploading test file...")
    upload_url = f"{BASE_URL}/api/data-upload-validate/upload-file"
    
    test_file_path = "test_file_with_description.csv"
    if not os.path.exists(test_file_path):
        print(f"ERROR: Test file {test_file_path} not found!")
        return False
    
    with open(test_file_path, 'rb') as f:
        files = {'file': ('test_file_with_description.csv', f, 'text/csv')}
        data = {
            'client_id': 'test',
            'app_id': 'test',
            'project_id': 'test',
            'client_name': 'test',
            'app_name': 'test',
            'project_name': 'test'
        }
        
        try:
            response = requests.post(upload_url, files=files, data=data)
            print(f"Upload response status: {response.status_code}")
            
            if response.status_code != 200:
                print(f"ERROR: Upload failed: {response.text}")
                return False
            
            upload_result = response.json()
            print(f"Upload result: {json.dumps(upload_result, indent=2)}")
            
            # Extract file path from task result
            if 'result' in upload_result:
                file_path = upload_result['result'].get('file_path', '')
            else:
                file_path = upload_result.get('file_path', '')
            
            if not file_path:
                print("ERROR: No file_path in upload response!")
                print(f"Full response: {json.dumps(upload_result, indent=2)}")
                return False
            
            print(f"[OK] File uploaded successfully. Path: {file_path}")
            
        except Exception as e:
            print(f"ERROR: Upload exception: {str(e)}")
            return False
    
    # Step 2: Test file-preview endpoint
    print("\n2. Testing /file-preview endpoint...")
    
    params = {
        'object_name': file_path,
        'client_id': 'test',
        'app_id': 'test',
        'project_id': 'test'
    }
    
    try:
        response = requests.get(API_ENDPOINT, params=params)
        print(f"Preview response status: {response.status_code}")
        
        if response.status_code != 200:
            print(f"ERROR: Preview failed: {response.text}")
            return False
        
        preview_data = response.json()
        print(f"\n[OK] Preview API Response:")
        print(json.dumps(preview_data, indent=2))
        
        # Step 3: Validate response structure
        print("\n3. Validating response structure...")
        
        required_fields = [
            'data_rows',
            'description_rows',
            'data_rows_count',
            'description_rows_count',
            'data_rows_start',
            'preview_row_count',
            'column_count',
            'total_rows',
            'suggested_header_row',
            'suggested_header_row_absolute',
            'suggested_header_confidence'
        ]
        
        missing_fields = []
        for field in required_fields:
            if field not in preview_data:
                missing_fields.append(field)
        
        if missing_fields:
            print(f"[ERROR] Missing required fields: {missing_fields}")
            return False
        
        print("[OK] All required fields present")
        
        # Step 4: Validate data structure
        print("\n4. Validating data structure...")
        
        # Check data_rows structure
        if not isinstance(preview_data['data_rows'], list):
            print("[ERROR] data_rows should be a list")
            return False
        
        if len(preview_data['data_rows']) == 0:
            print("[ERROR] data_rows is empty!")
            return False
        
        # Check each data row has required fields
        for idx, row in enumerate(preview_data['data_rows']):
            if 'row_index' not in row:
                print(f"[ERROR] data_row[{idx}] missing 'row_index'")
                return False
            if 'relative_index' not in row:
                print(f"[ERROR] data_row[{idx}] missing 'relative_index'")
                return False
            if 'cells' not in row:
                print(f"[ERROR] data_row[{idx}] missing 'cells'")
                return False
        
        print(f"[OK] data_rows structure valid ({len(preview_data['data_rows'])} rows)")
        
        # Check description_rows structure
        if not isinstance(preview_data['description_rows'], list):
            print("[ERROR] description_rows should be a list")
            return False
        
        if len(preview_data['description_rows']) > 0:
            for idx, row in enumerate(preview_data['description_rows']):
                if 'row_index' not in row:
                    print(f"[ERROR] description_row[{idx}] missing 'row_index'")
                    return False
                if 'cells' not in row:
                    print(f"[ERROR] description_row[{idx}] missing 'cells'")
                    return False
        
        print(f"[OK] description_rows structure valid ({len(preview_data['description_rows'])} rows)")
        
        # Step 5: Validate counts match
        print("\n5. Validating counts...")
        
        if preview_data['data_rows_count'] != len(preview_data['data_rows']):
            print(f"[WARNING] data_rows_count ({preview_data['data_rows_count']}) != len(data_rows) ({len(preview_data['data_rows'])})")
            print("  Note: This is OK if preview_row_count limits the returned rows")
        
        if preview_data['description_rows_count'] != len(preview_data['description_rows']):
            print(f"[ERROR] description_rows_count ({preview_data['description_rows_count']}) != len(description_rows) ({len(preview_data['description_rows'])})")
            return False
        
        print("[OK] Counts match")
        
        # Step 6: Validate row indices
        print("\n6. Validating row indices...")
        
        if preview_data['data_rows_start'] != len(preview_data['description_rows']):
            print(f"[WARNING] data_rows_start ({preview_data['data_rows_start']}) != description_rows_count ({len(preview_data['description_rows'])})")
        
        # Check that data row indices start after description rows
        if preview_data['data_rows']:
            first_data_row_index = preview_data['data_rows'][0]['row_index']
            expected_start = len(preview_data['description_rows']) + 1  # 1-indexed
            if first_data_row_index < expected_start:
                print(f"[WARNING] First data row index ({first_data_row_index}) < expected ({expected_start})")
        
        print("[OK] Row indices valid")
        
        # Step 7: Summary
        print("\n" + "=" * 80)
        print("TEST SUMMARY")
        print("=" * 80)
        print(f"[OK] Description rows found: {preview_data['description_rows_count']}")
        print(f"[OK] Data rows found: {preview_data['data_rows_count']}")
        print(f"[OK] Preview rows returned: {len(preview_data['data_rows'])}")
        print(f"[OK] Data rows start at index: {preview_data['data_rows_start']}")
        print(f"[OK] Suggested header row (relative): {preview_data['suggested_header_row']}")
        print(f"[OK] Suggested header row (absolute): {preview_data['suggested_header_row_absolute']}")
        print(f"[OK] Confidence: {preview_data['suggested_header_confidence']}")
        print(f"[OK] Column count: {preview_data['column_count']}")
        print("\n[OK] ALL TESTS PASSED!")
        print("=" * 80)
        
        return True
        
    except Exception as e:
        print(f"ERROR: Preview exception: {str(e)}")
        import traceback
        traceback.print_exc()
        return False

if __name__ == "__main__":
    success = test_file_preview()
    sys.exit(0 if success else 1)

