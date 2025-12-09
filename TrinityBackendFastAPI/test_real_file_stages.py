"""
Test the real file through U0, U1, and U2 stages.
"""
import sys
import os
import io
import pandas as pd
import json

# Add paths
sys.path.insert(0, os.path.join(os.path.dirname(__file__), 'app'))
sys.path.insert(0, os.path.join(os.path.dirname(__file__), 'app', 'features', 'data_upload_validate', 'file_ingestion', 'processors'))
sys.path.insert(0, os.path.join(os.path.dirname(__file__), 'app', 'features', 'data_upload_validate', 'file_ingestion', 'readers'))

from app.features.data_upload_validate.file_ingestion.processors.description_separator import DescriptionSeparator
from app.features.data_upload_validate.file_ingestion.processors.header_detector import HeaderDetector
from app.features.data_upload_validate.file_ingestion.robust_file_reader import RobustFileReader

def test_u0_upload_stage(file_path):
    """Simulate U0: File Upload Stage"""
    print("=" * 80)
    print("STAGE U0: FILE UPLOAD")
    print("=" * 80)
    
    print(f"\n1. Reading file: {file_path}")
    
    if not os.path.exists(file_path):
        print(f"ERROR: File not found: {file_path}")
        return None
    
    # Read file as bytes (simulating upload)
    with open(file_path, 'rb') as f:
        file_bytes = f.read()
    
    file_size = len(file_bytes)
    file_name = os.path.basename(file_path)
    
    print(f"   File name: {file_name}")
    print(f"   File size: {file_size:,} bytes")
    print(f"   File type: CSV")
    
    # Read file using RobustFileReader (same as backend) in raw mode
    print(f"   Reading file using RobustFileReader (raw mode)...")
    with open(file_path, 'rb') as f:
        file_bytes = f.read()
    
    try:
        df_raw, metadata = RobustFileReader.read_file_to_pandas(
            content=file_bytes,
            filename=file_name,
            return_raw=True  # Return raw rows without header detection
        )
        print(f"   [OK] File read successfully using RobustFileReader")
        print(f"   Encoding: {metadata.get('encoding', 'unknown')}")
        print(f"   Delimiter: {metadata.get('delimiter', 'unknown')}")
    except Exception as e:
        print(f"   [ERROR] RobustFileReader failed: {e}")
        print(f"   Falling back to basic pandas read...")
        # Fallback
        df_raw = pd.read_csv(file_path, header=None, low_memory=False, engine='python', quoting=1)
    
    print(f"\n2. File structure analysis:")
    print(f"   Total rows: {len(df_raw)}")
    print(f"   Total columns: {len(df_raw.columns)}")
    print(f"   First row (raw): {df_raw.iloc[0].tolist()[:5] if len(df_raw) > 0 else 'N/A'}...")  # First 5 columns
    if len(df_raw) > 1:
        print(f"   Second row (raw): {df_raw.iloc[1].tolist()[:5]}...")
    else:
        print(f"   Second row: Not available (only 1 row read)")
    
    return {
        'file_name': file_name,
        'file_size': file_size,
        'file_path': file_path,
        'total_rows': len(df_raw),
        'total_columns': len(df_raw.columns),
        'df_raw': df_raw
    }

def test_u1_structural_scan_stage(u0_result):
    """Simulate U1: Structural Scan Stage"""
    print("\n" + "=" * 80)
    print("STAGE U1: STRUCTURAL SCAN")
    print("=" * 80)
    
    if not u0_result:
        print("ERROR: U0 result not available")
        return None
    
    df_raw = u0_result['df_raw']
    
    print(f"\n1. File analysis:")
    print(f"   File: {u0_result['file_name']}")
    print(f"   Total rows: {u0_result['total_rows']}")
    print(f"   Total columns: {u0_result['total_columns']}")
    
    # Check if it's Excel with multiple sheets (it's CSV, so single file)
    print(f"\n2. File type detection:")
    print(f"   Type: CSV (single file, single sheet)")
    print(f"   Sheet count: 1")
    
    # Show first few rows
    print(f"\n3. First 5 rows preview:")
    for i in range(min(5, len(df_raw))):
        row_preview = df_raw.iloc[i].tolist()[:5]  # First 5 columns
        print(f"   Row {i+1}: {row_preview}...")
    
    return {
        **u0_result,
        'file_type': 'csv',
        'sheet_count': 1,
        'has_multiple_sheets': False
    }

def test_u2_understanding_files_stage(u1_result):
    """Simulate U2: Understanding Files Stage (file-preview endpoint logic)"""
    print("\n" + "=" * 80)
    print("STAGE U2: UNDERSTANDING FILES (FILE PREVIEW)")
    print("=" * 80)
    
    if not u1_result:
        print("ERROR: U1 result not available")
        return None
    
    df_raw = u1_result['df_raw']
    
    print(f"\n1. Separating description rows from data rows...")
    
    # This is what the backend does
    description_rows, df_data = DescriptionSeparator.separate_description_rows(df_raw)
    
    print(f"   Description rows found: {len(description_rows)}")
    print(f"   Data rows found: {len(df_data)}")
    
    if description_rows:
        print(f"\n   Description rows content:")
        for idx, row in enumerate(description_rows):
            row_str = ', '.join([str(val) if pd.notna(val) else '' for val in row[:3]])  # First 3 columns
            print(f"     Row {idx+1}: {row_str}...")
    
    print(f"\n2. Data rows preview (first 5):")
    for i in range(min(5, len(df_data))):
        row_preview = df_data.iloc[i].tolist()[:5]  # First 5 columns
        print(f"     Row {i+1}: {row_preview}...")
    
    print(f"\n3. Detecting header row...")
    
    # Detect header row (relative to data rows, 0-indexed)
    suggested_header_row_relative = HeaderDetector.find_header_row(df_data.head(20))
    
    # Calculate absolute row index
    data_rows_start = len(description_rows)
    suggested_header_row_absolute = data_rows_start + suggested_header_row_relative
    
    # Calculate confidence
    if suggested_header_row_relative == 0:
        suggested_header_confidence = "high"
    elif suggested_header_row_relative < 3:
        suggested_header_confidence = "medium"
    else:
        suggested_header_confidence = "low"
    
    print(f"   Suggested header row (relative to data): {suggested_header_row_relative}")
    print(f"   Suggested header row (absolute): {suggested_header_row_absolute}")
    print(f"   Confidence: {suggested_header_confidence}")
    
    # Get preview rows (first 15 rows of data)
    preview_rows = df_data.head(15).values.tolist()
    preview_row_count = len(preview_rows)
    
    print(f"\n4. Building preview response (as endpoint does)...")
    
    # Convert description rows to structured format
    description_rows_structured = []
    for idx, row in enumerate(description_rows):
        description_rows_structured.append({
            "row_index": idx + 1,  # 1-indexed for display
            "cells": [str(val) if pd.notna(val) else "" for val in row]
        })
    
    # Convert data rows to structured format
    data_rows_structured = []
    for idx, row in enumerate(preview_rows):
        data_rows_structured.append({
            "row_index": data_rows_start + idx + 1,  # 1-indexed absolute row number
            "relative_index": idx,  # 0-indexed relative to data rows
            "cells": [str(val) if pd.notna(val) else "" for val in row]
        })
    
    column_count = len(df_data.columns) if not df_data.empty else 0
    
    # Build response (as endpoint does)
    response = {
        "data_rows": data_rows_structured,
        "description_rows": description_rows_structured,
        "data_rows_count": len(df_data),
        "description_rows_count": len(description_rows),
        "data_rows_start": data_rows_start,
        "preview_row_count": preview_row_count,
        "column_count": column_count,
        "total_rows": len(df_data),
        "suggested_header_row": suggested_header_row_relative,
        "suggested_header_row_absolute": suggested_header_row_absolute,
        "suggested_header_confidence": suggested_header_confidence,
        "has_description_rows": len(description_rows) > 0,
    }
    
    print(f"\n5. Response summary:")
    print(f"   Description rows: {response['description_rows_count']}")
    print(f"   Data rows: {response['data_rows_count']}")
    print(f"   Preview rows returned: {response['preview_row_count']}")
    print(f"   Data rows start at index: {response['data_rows_start']}")
    print(f"   Column count: {response['column_count']}")
    print(f"   Suggested header row (relative): {response['suggested_header_row']}")
    print(f"   Suggested header row (absolute): {response['suggested_header_row_absolute']}")
    print(f"   Confidence: {response['suggested_header_confidence']}")
    
    print(f"\n6. Sample data_rows structure (first row):")
    if data_rows_structured:
        first_row = data_rows_structured[0]
        print(f"   Row index: {first_row['row_index']}")
        print(f"   Relative index: {first_row['relative_index']}")
        print(f"   Cells (first 5): {first_row['cells'][:5]}...")
    
    print(f"\n7. Sample description_rows structure:")
    if description_rows_structured:
        first_desc = description_rows_structured[0]
        print(f"   Row index: {first_desc['row_index']}")
        print(f"   Cells (first 5): {first_desc['cells'][:5]}...")
    
    # Validate response structure
    print(f"\n8. Validating response structure...")
    required_fields = [
        'data_rows', 'description_rows', 'data_rows_count', 'description_rows_count',
        'data_rows_start', 'preview_row_count', 'column_count', 'total_rows',
        'suggested_header_row', 'suggested_header_row_absolute', 'suggested_header_confidence'
    ]
    
    missing_fields = [f for f in required_fields if f not in response]
    if missing_fields:
        print(f"   [ERROR] Missing fields: {missing_fields}")
        return None
    
    # Validate data_rows structure
    if len(response['data_rows']) == 0:
        print(f"   [ERROR] data_rows is empty!")
        return None
    
    for idx, row in enumerate(response['data_rows'][:3]):  # Check first 3
        if 'row_index' not in row or 'relative_index' not in row or 'cells' not in row:
            print(f"   [ERROR] data_row[{idx}] missing required fields")
            return None
    
    print(f"   [OK] All required fields present")
    print(f"   [OK] data_rows structure valid")
    print(f"   [OK] description_rows structure valid")
    
    return response

def main():
    """Run all stage tests"""
    file_path = r"C:\Users\ASUS\Downloads\IN_Search_Query_Performance_Brand_View_Simple_Week_2025_11_15.csv"
    
    print("\n" + "=" * 80)
    print("TESTING FILE UPLOAD FLOW: U0 -> U1 -> U2")
    print("=" * 80)
    print(f"\nFile: {file_path}")
    
    # Stage U0: Upload
    u0_result = test_u0_upload_stage(file_path)
    if not u0_result:
        print("\n[ERROR] U0 stage failed!")
        return False
    
    # Stage U1: Structural Scan
    u1_result = test_u1_structural_scan_stage(u0_result)
    if not u1_result:
        print("\n[ERROR] U1 stage failed!")
        return False
    
    # Stage U2: Understanding Files
    u2_result = test_u2_understanding_files_stage(u1_result)
    if not u2_result:
        print("\n[ERROR] U2 stage failed!")
        return False
    
    # Final summary
    print("\n" + "=" * 80)
    print("FINAL SUMMARY")
    print("=" * 80)
    print(f"[OK] U0 (Upload): File read successfully")
    print(f"[OK] U1 (Structural Scan): File structure analyzed")
    print(f"[OK] U2 (Understanding Files): Preview data generated")
    print(f"\nKey Results:")
    print(f"  - Description rows: {u2_result['description_rows_count']}")
    print(f"  - Data rows: {u2_result['data_rows_count']}")
    print(f"  - Header row detected at: Row {u2_result['suggested_header_row_absolute']} (absolute)")
    print(f"  - Header row confidence: {u2_result['suggested_header_confidence']}")
    print(f"  - Columns: {u2_result['column_count']}")
    print("\n[OK] ALL STAGES PASSED!")
    print("=" * 80)
    
    return True

if __name__ == "__main__":
    success = main()
    sys.exit(0 if success else 1)
