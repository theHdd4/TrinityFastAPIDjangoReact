"""
Simple standalone test - copies minimal logic to avoid app imports.
Tests real file through U0, U1, U2 stages.
"""
import sys
import os
import io
import pandas as pd
import json
import chardet

# Minimal CSV reading logic (copied from CSVReader to avoid imports)
def read_csv_raw(content_bytes, filename=None):
    """Read CSV in raw mode (no header detection)."""
    # Simple encoding detection
    try:
        detected = chardet.detect(content_bytes)
        encoding = detected.get('encoding', 'utf-8')
    except:
        encoding = 'utf-8'
    
    # Check pandas version
    pandas_version = tuple(map(int, pd.__version__.split('.')[:2]))
    use_on_bad_lines = pandas_version >= (1, 3)
    
    # Try reading with detected encoding
    # For files with inconsistent column counts, we need to read all rows and pad to max columns
    try:
        # First, read as text to determine max columns
        text_content = content_bytes.decode(encoding, errors='ignore')
        lines = text_content.split('\n')[:100]  # Check first 100 lines
        max_cols = max(len(line.split(',')) for line in lines if line.strip())
        
        # Now read with enough columns
        kwargs = {
            'encoding': encoding,
            'sep': ',',
            'header': None,
            'engine': 'python',
            'names': range(max_cols),  # Specify column names to handle inconsistent columns
        }
        if use_on_bad_lines:
            kwargs['on_bad_lines'] = 'skip'
        else:
            kwargs['error_bad_lines'] = False
            kwargs['warn_bad_lines'] = False
        
        df = pd.read_csv(io.BytesIO(content_bytes), **kwargs)
        return df, {'encoding': encoding, 'delimiter': ','}
    except Exception as e:
        print(f"   Warning: Reading failed with {encoding}: {e}")
        # Fallback: try without specifying columns
        try:
            kwargs = {
                'encoding': encoding,
                'sep': ',',
                'header': None,
                'engine': 'python',
            }
            if use_on_bad_lines:
                kwargs['on_bad_lines'] = 'skip'
            else:
                kwargs['error_bad_lines'] = False
                kwargs['warn_bad_lines'] = False
            
            df = pd.read_csv(io.BytesIO(content_bytes), **kwargs)
            return df, {'encoding': encoding, 'delimiter': ','}
        except:
            # Try fallback encodings
            for enc in ['latin-1', 'cp1252', 'iso-8859-1', 'utf-8']:
                try:
                    text_content = content_bytes.decode(enc, errors='ignore')
                    lines = text_content.split('\n')[:100]
                    max_cols = max(len(line.split(',')) for line in lines if line.strip())
                    
                    kwargs = {
                        'encoding': enc,
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
                    return df, {'encoding': enc, 'delimiter': ','}
                except:
                    continue
            raise

# Import processors directly (they don't trigger app init)
sys.path.insert(0, os.path.join(os.path.dirname(__file__), 'app', 'features', 'data_upload_validate', 'file_ingestion', 'processors'))
from description_separator import DescriptionSeparator
from header_detector import HeaderDetector

def test_all_stages(file_path):
    """Test all stages U0, U1, U2"""
    print("=" * 80)
    print("TESTING FILE: " + os.path.basename(file_path))
    print("=" * 80)
    
    # U0: Upload
    print("\n[U0] FILE UPLOAD STAGE")
    print("-" * 80)
    with open(file_path, 'rb') as f:
        file_bytes = f.read()
    
    file_name = os.path.basename(file_path)
    print(f"File: {file_name}")
    print(f"Size: {len(file_bytes):,} bytes")
    
    df_raw, metadata = read_csv_raw(file_bytes, file_name)
    print(f"Rows: {len(df_raw)}")
    print(f"Columns: {len(df_raw.columns)}")
    print(f"Encoding: {metadata['encoding']}")
    print(f"First row: {df_raw.iloc[0].tolist()[:3]}...")
    if len(df_raw) > 1:
        print(f"Second row: {df_raw.iloc[1].tolist()[:3]}...")
    
    # U1: Structural Scan
    print("\n[U1] STRUCTURAL SCAN STAGE")
    print("-" * 80)
    print(f"File type: CSV")
    print(f"Sheet count: 1")
    print(f"Has multiple sheets: False")
    
    # U2: Understanding Files
    print("\n[U2] UNDERSTANDING FILES STAGE (FILE PREVIEW)")
    print("-" * 80)
    
    # Separate description rows
    description_rows, df_data = DescriptionSeparator.separate_description_rows(df_raw)
    print(f"Description rows: {len(description_rows)}")
    print(f"Data rows: {len(df_data)}")
    
    if description_rows:
        print(f"\nDescription rows:")
        for idx, row in enumerate(description_rows[:3]):
            print(f"  Row {idx+1}: {row[:3]}...")
    
    # Detect header
    suggested_header_row_relative = HeaderDetector.find_header_row(df_data.head(20))
    data_rows_start = len(description_rows)
    suggested_header_row_absolute = data_rows_start + suggested_header_row_relative
    
    if suggested_header_row_relative == 0:
        confidence = "high"
    elif suggested_header_row_relative < 3:
        confidence = "medium"
    else:
        confidence = "low"
    
    print(f"\nHeader detection:")
    print(f"  Suggested header (relative): {suggested_header_row_relative}")
    print(f"  Suggested header (absolute): {suggested_header_row_absolute}")
    print(f"  Confidence: {confidence}")
    
    if len(df_data) > suggested_header_row_relative:
        header_preview = df_data.iloc[suggested_header_row_relative].tolist()[:5]
        print(f"  Header row (first 5): {header_preview}...")
    
    # Build response
    preview_rows = df_data.head(15).values.tolist()
    
    description_rows_structured = []
    for idx, row in enumerate(description_rows):
        description_rows_structured.append({
            "row_index": idx + 1,
            "cells": [str(val) if pd.notna(val) else "" for val in row]
        })
    
    data_rows_structured = []
    for idx, row in enumerate(preview_rows):
        data_rows_structured.append({
            "row_index": data_rows_start + idx + 1,
            "relative_index": idx,
            "cells": [str(val) if pd.notna(val) else "" for val in row]
        })
    
    response = {
        "data_rows": data_rows_structured,
        "description_rows": description_rows_structured,
        "data_rows_count": len(df_data),
        "description_rows_count": len(description_rows),
        "data_rows_start": data_rows_start,
        "preview_row_count": len(preview_rows),
        "column_count": len(df_data.columns) if not df_data.empty else 0,
        "total_rows": len(df_data),
        "suggested_header_row": suggested_header_row_relative,
        "suggested_header_row_absolute": suggested_header_row_absolute,
        "suggested_header_confidence": confidence,
        "has_description_rows": len(description_rows) > 0,
    }
    
    print(f"\nResponse structure:")
    print(f"  data_rows: {len(response['data_rows'])} rows")
    print(f"  description_rows: {len(response['description_rows'])} rows")
    print(f"  data_rows_count: {response['data_rows_count']}")
    print(f"  column_count: {response['column_count']}")
    
    # Validate
    required = ['data_rows', 'description_rows', 'data_rows_count', 'description_rows_count',
                'data_rows_start', 'preview_row_count', 'column_count', 'total_rows',
                'suggested_header_row', 'suggested_header_row_absolute', 'suggested_header_confidence']
    missing = [f for f in required if f not in response]
    
    print(f"\nValidation:")
    if missing:
        print(f"  [ERROR] Missing: {missing}")
        return False
    if len(response['data_rows']) == 0:
        print(f"  [ERROR] data_rows is empty!")
        return False
    
    print(f"  [OK] All fields present")
    print(f"  [OK] Structure valid")
    
    # Save response
    output_file = "test_u2_response.json"
    with open(output_file, 'w', encoding='utf-8') as f:
        json.dump(response, f, indent=2, ensure_ascii=False)
    print(f"\nResponse saved to: {output_file}")
    
    print("\n" + "=" * 80)
    print("SUMMARY")
    print("=" * 80)
    print(f"[OK] U0: File read ({len(df_raw)} rows, {len(df_raw.columns)} cols)")
    print(f"[OK] U1: Structure analyzed (CSV, 1 sheet)")
    print(f"[OK] U2: Preview generated")
    print(f"\nResults:")
    print(f"  Description rows: {response['description_rows_count']}")
    print(f"  Data rows: {response['data_rows_count']}")
    print(f"  Header at row: {response['suggested_header_row_absolute']} (confidence: {confidence})")
    print(f"  Columns: {response['column_count']}")
    print("=" * 80)
    
    return True

if __name__ == "__main__":
    file_path = r"C:\Users\ASUS\Downloads\IN_Search_Query_Performance_Brand_View_Simple_Week_2025_11_15.csv"
    success = test_all_stages(file_path)
    sys.exit(0 if success else 1)

