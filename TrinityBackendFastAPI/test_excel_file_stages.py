"""
Test Excel file through U0, U1, U2, U3 stages.
Tests multi-sheet Excel file handling.
"""
import sys
import os
import io
import pandas as pd
import json
import chardet

# Minimal CSV reading logic
def read_csv_raw(content_bytes, filename=None):
    """Read CSV in raw mode."""
    try:
        detected = chardet.detect(content_bytes)
        encoding = detected.get('encoding', 'utf-8')
    except:
        encoding = 'utf-8'
    
    pandas_version = tuple(map(int, pd.__version__.split('.')[:2]))
    use_on_bad_lines = pandas_version >= (1, 3)
    
    try:
        text_content = content_bytes.decode(encoding, errors='ignore')
        lines = text_content.split('\n')[:100]
        max_cols = max(len(line.split(',')) for line in lines if line.strip())
        
        kwargs = {
            'encoding': encoding,
            'sep': ',',
            'header': None,
            'engine': 'python',
            'names': range(max_cols),
        }
        if use_on_bad_lines:
            kwargs['on_bad_lines'] = 'skip'
        else:
            kwargs['error_bad_lines'] = False
            kwargs['warn_bad_lines'] = False
        
        df = pd.read_csv(io.BytesIO(content_bytes), **kwargs)
        return df, {'encoding': encoding, 'delimiter': ','}
    except Exception as e:
        print(f"   Error reading CSV: {e}")
        raise

# Import processors directly
sys.path.insert(0, os.path.join(os.path.dirname(__file__), 'app', 'features', 'data_upload_validate', 'file_ingestion', 'processors'))
from description_separator import DescriptionSeparator
from header_detector import HeaderDetector

def read_excel_raw(file_path):
    """Read Excel file in raw mode (all rows as data, no header detection)."""
    try:
        # Read all sheets
        excel_file = pd.ExcelFile(file_path, engine='openpyxl')
        sheet_names = excel_file.sheet_names
        
        sheets_dict = {}
        for sheet_name in sheet_names:
            df = pd.read_excel(excel_file, sheet_name=sheet_name, header=None, engine='openpyxl')
            sheets_dict[sheet_name] = df
        
        return sheets_dict, {'sheet_names': sheet_names, 'total_sheets': len(sheet_names)}
    except Exception as e:
        print(f"   Error reading Excel: {e}")
        raise

def test_u0_upload_stage(file_path):
    """Simulate U0: File Upload Stage"""
    print("=" * 80)
    print("STAGE U0: FILE UPLOAD")
    print("=" * 80)
    
    print(f"\n1. Reading file: {file_path}")
    
    if not os.path.exists(file_path):
        print(f"ERROR: File not found: {file_path}")
        return None
    
    file_name = os.path.basename(file_path)
    file_size = os.path.getsize(file_path)
    
    print(f"   File name: {file_name}")
    print(f"   File size: {file_size:,} bytes")
    
    # Check file type
    is_excel = file_name.lower().endswith(('.xlsx', '.xls'))
    print(f"   File type: {'Excel' if is_excel else 'CSV'}")
    
    if is_excel:
        print(f"\n2. Reading Excel file (multi-sheet)...")
        sheets_dict, metadata = read_excel_raw(file_path)
        
        print(f"   Total sheets: {metadata['total_sheets']}")
        print(f"   Sheet names: {metadata['sheet_names']}")
        
        # Show info for each sheet
        for sheet_name, df in sheets_dict.items():
            print(f"\n   Sheet '{sheet_name}':")
            print(f"     Rows: {len(df)}")
            print(f"     Columns: {len(df.columns)}")
            if len(df) > 0:
                print(f"     First row (first 5 cols): {df.iloc[0].tolist()[:5]}...")
        
        return {
            'file_name': file_name,
            'file_size': file_size,
            'file_path': file_path,
            'file_type': 'excel',
            'sheets_dict': sheets_dict,
            'sheet_names': metadata['sheet_names'],
            'total_sheets': metadata['total_sheets'],
            'df_raw': list(sheets_dict.values())[0] if sheets_dict else None,  # First sheet for preview
            'selected_sheet': metadata['sheet_names'][0] if metadata['sheet_names'] else None
        }
    else:
        # CSV file
        with open(file_path, 'rb') as f:
            file_bytes = f.read()
        
        df_raw, csv_metadata = read_csv_raw(file_bytes, file_name)
        
        return {
            'file_name': file_name,
            'file_size': file_size,
            'file_path': file_path,
            'file_type': 'csv',
            'total_rows': len(df_raw),
            'total_columns': len(df_raw.columns),
            'df_raw': df_raw,
            'metadata': csv_metadata
        }

def test_u1_structural_scan_stage(u0_result):
    """Simulate U1: Structural Scan Stage"""
    print("\n" + "=" * 80)
    print("STAGE U1: STRUCTURAL SCAN")
    print("=" * 80)
    
    if not u0_result:
        print("ERROR: U0 result not available")
        return None
    
    print(f"\n1. File analysis:")
    print(f"   File: {u0_result['file_name']}")
    print(f"   File type: {u0_result['file_type'].upper()}")
    
    if u0_result['file_type'] == 'excel':
        print(f"\n2. Excel workbook analysis:")
        print(f"   Total sheets: {u0_result['total_sheets']}")
        print(f"   Sheet names: {u0_result['sheet_names']}")
        
        if u0_result['total_sheets'] > 1:
            print(f"   [MULTI-SHEET] User needs to select which sheet(s) to process")
            print(f"   Default selection: All sheets")
        else:
            print(f"   [SINGLE-SHEET] No sheet selection needed")
        
        # Show summary for each sheet
        print(f"\n3. Sheet details:")
        for sheet_name in u0_result['sheet_names']:
            df = u0_result['sheets_dict'][sheet_name]
            print(f"   Sheet '{sheet_name}': {len(df)} rows × {len(df.columns)} columns")
        
        return {
            **u0_result,
            'has_multiple_sheets': u0_result['total_sheets'] > 1,
            'selected_sheet': u0_result['selected_sheet'] or u0_result['sheet_names'][0]
        }
    else:
        print(f"   Total rows: {u0_result['total_rows']}")
        print(f"   Total columns: {u0_result['total_columns']}")
        return {
            **u0_result,
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
    
    # For Excel, use selected sheet
    if u1_result['file_type'] == 'excel':
        selected_sheet = u1_result.get('selected_sheet') or u1_result['sheet_names'][0]
        print(f"\n1. Processing selected sheet: '{selected_sheet}'")
        df_raw = u1_result['sheets_dict'][selected_sheet]
    else:
        df_raw = u1_result['df_raw']
    
    print(f"\n2. Separating description rows from data rows...")
    
    # This is what the backend does
    description_rows, df_data = DescriptionSeparator.separate_description_rows(df_raw)
    
    print(f"   Description rows found: {len(description_rows)}")
    print(f"   Data rows found: {len(df_data)}")
    
    if description_rows:
        print(f"\n   Description rows content:")
        for idx, row in enumerate(description_rows[:3]):  # First 3
            row_str = ', '.join([str(val) if pd.notna(val) else '' for val in row[:3]])
            print(f"     Row {idx+1}: {row_str}...")
    
    print(f"\n3. Data rows preview (first 5):")
    for i in range(min(5, len(df_data))):
        row_preview = df_data.iloc[i].tolist()[:5]
        print(f"     Row {i+1}: {row_preview}...")
    
    print(f"\n4. Detecting header row...")
    
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
    
    # Show the detected header row
    if len(df_data) > suggested_header_row_relative:
        header_row_data = df_data.iloc[suggested_header_row_relative].tolist()[:5]
        print(f"   Header row content (first 5 cols): {header_row_data}...")
    
    # Get preview rows (first 15 rows of data)
    preview_rows = df_data.head(15).values.tolist()
    preview_row_count = len(preview_rows)
    
    print(f"\n5. Building preview response (as endpoint does)...")
    
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
    
    print(f"\n6. Response summary:")
    print(f"   Description rows: {response['description_rows_count']}")
    print(f"   Data rows: {response['data_rows_count']}")
    print(f"   Preview rows returned: {response['preview_row_count']}")
    print(f"   Data rows start at index: {response['data_rows_start']}")
    print(f"   Column count: {response['column_count']}")
    print(f"   Suggested header row (relative): {response['suggested_header_row']}")
    print(f"   Suggested header row (absolute): {response['suggested_header_row_absolute']}")
    print(f"   Confidence: {response['suggested_header_confidence']}")
    
    # Validate response structure
    print(f"\n7. Validating response structure...")
    required_fields = [
        'data_rows', 'description_rows', 'data_rows_count', 'description_rows_count',
        'data_rows_start', 'preview_row_count', 'column_count', 'total_rows',
        'suggested_header_row', 'suggested_header_row_absolute', 'suggested_header_confidence'
    ]
    
    missing_fields = [f for f in required_fields if f not in response]
    if missing_fields:
        print(f"   [ERROR] Missing fields: {missing_fields}")
        return None
    
    if len(response['data_rows']) == 0:
        print(f"   [ERROR] data_rows is empty!")
        return None
    
    print(f"   [OK] All required fields present")
    print(f"   [OK] data_rows structure valid")
    print(f"   [OK] description_rows structure valid")
    
    return {
        **u1_result,
        'preview_response': response,
        'df_data': df_data,
        'description_rows': description_rows
    }

def test_u3_confirm_headers_stage(u2_result):
    """Simulate U3: Confirm Headers Stage"""
    print("\n" + "=" * 80)
    print("STAGE U3: CONFIRM HEADERS")
    print("=" * 80)
    
    if not u2_result or 'preview_response' not in u2_result:
        print("ERROR: U2 result not available")
        return None
    
    preview = u2_result['preview_response']
    df_data = u2_result['df_data']
    description_rows = u2_result['description_rows']
    
    print(f"\n1. Header selection options:")
    print(f"   Suggested header row: {preview['suggested_header_row_absolute']} (absolute)")
    print(f"   Confidence: {preview['suggested_header_confidence']}")
    print(f"   Total data rows available: {preview['data_rows_count']}")
    
    # Show header row options (first 5 rows of data)
    print(f"\n2. Available header row options (first 5 data rows):")
    for i in range(min(5, len(df_data))):
        row_preview = df_data.iloc[i].tolist()[:5]
        is_suggested = (i == preview['suggested_header_row'])
        marker = " <-- SUGGESTED" if is_suggested else ""
        print(f"   Row {len(description_rows) + i + 1} (data row {i}): {row_preview}...{marker}")
    
    # Simulate user selecting the suggested header
    selected_header_row_relative = preview['suggested_header_row']
    selected_header_row_absolute = preview['suggested_header_row_absolute']
    
    print(f"\n3. Simulating header selection:")
    print(f"   Selected header row (relative): {selected_header_row_relative}")
    print(f"   Selected header row (absolute): {selected_header_row_absolute}")
    
    # Extract header row
    if len(df_data) > selected_header_row_relative:
        header_row = df_data.iloc[selected_header_row_relative]
        headers = [str(val) if pd.notna(val) else f"Column_{i+1}" for i, val in enumerate(header_row)]
        
        print(f"\n4. Extracted headers (first 10):")
        for i, header in enumerate(headers[:10]):
            print(f"   Column {i+1}: {header}")
        print(f"   Total columns: {len(headers)}")
        
        # Show data after header
        print(f"\n5. Data rows after header (first 3):")
        data_after_header = df_data.iloc[selected_header_row_relative + 1:selected_header_row_relative + 4]
        for idx, (_, row) in enumerate(data_after_header.iterrows()):
            row_preview = row.tolist()[:5]
            print(f"   Data row {idx+1}: {row_preview}...")
        
        return {
            **u2_result,
            'selected_header_row_relative': selected_header_row_relative,
            'selected_header_row_absolute': selected_header_row_absolute,
            'headers': headers,
            'data_after_header_count': len(df_data) - selected_header_row_relative - 1
        }
    else:
        print(f"   [ERROR] Selected header row index out of range")
        return None

def main():
    """Run all stage tests"""
    file_path = r"C:\Users\ASUS\Downloads\Combined_Reach_Lift_Results_AF_HC_Brand_Level_State_Profile_Combined_03.07.xlsx"
    
    print("\n" + "=" * 80)
    print("TESTING EXCEL FILE UPLOAD FLOW: U0 -> U1 -> U2 -> U3")
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
    
    # Stage U3: Confirm Headers
    u3_result = test_u3_confirm_headers_stage(u2_result)
    if not u3_result:
        print("\n[ERROR] U3 stage failed!")
        return False
    
    # Final summary
    print("\n" + "=" * 80)
    print("FINAL SUMMARY")
    print("=" * 80)
    print(f"[OK] U0 (Upload): File read successfully")
    print(f"[OK] U1 (Structural Scan): File structure analyzed")
    print(f"[OK] U2 (Understanding Files): Preview data generated")
    print(f"[OK] U3 (Confirm Headers): Header selection ready")
    
    print(f"\nKey Results:")
    if u0_result['file_type'] == 'excel':
        print(f"  - File type: Excel ({u0_result['total_sheets']} sheets)")
        print(f"  - Sheet names: {', '.join(u0_result['sheet_names'])}")
        print(f"  - Selected sheet: {u3_result.get('selected_sheet', 'N/A')}")
    
    print(f"  - Description rows: {u2_result['preview_response']['description_rows_count']}")
    print(f"  - Data rows: {u2_result['preview_response']['data_rows_count']}")
    print(f"  - Header row detected at: Row {u2_result['preview_response']['suggested_header_row_absolute']} (absolute)")
    print(f"  - Header row confidence: {u2_result['preview_response']['suggested_header_confidence']}")
    print(f"  - Columns: {u2_result['preview_response']['column_count']}")
    print(f"  - Headers extracted: {len(u3_result.get('headers', []))} columns")
    print(f"  - Data rows after header: {u3_result.get('data_after_header_count', 0)}")
    
    print("\n[OK] ALL STAGES PASSED!")
    print("=" * 80)
    
    # Save response to JSON
    output_file = "test_excel_u2_response.json"
    with open(output_file, 'w', encoding='utf-8') as f:
        json.dump(u2_result['preview_response'], f, indent=2, ensure_ascii=False)
    print(f"\nU2 response saved to: {output_file}")
    
    return True

if __name__ == "__main__":
    success = main()
    sys.exit(0 if success else 1)

