"""
Test both sheets of the Excel file to show multi-sheet handling.
"""
import sys
import os
import pandas as pd
import json

sys.path.insert(0, os.path.join(os.path.dirname(__file__), 'app', 'features', 'data_upload_validate', 'file_ingestion', 'processors'))
from description_separator import DescriptionSeparator
from header_detector import HeaderDetector

def read_excel_raw(file_path):
    """Read Excel file in raw mode."""
    excel_file = pd.ExcelFile(file_path, engine='openpyxl')
    sheet_names = excel_file.sheet_names
    
    sheets_dict = {}
    for sheet_name in sheet_names:
        df = pd.read_excel(excel_file, sheet_name=sheet_name, header=None, engine='openpyxl')
        sheets_dict[sheet_name] = df
    
    return sheets_dict, {'sheet_names': sheet_names, 'total_sheets': len(sheet_names)}

def test_sheet(sheet_name, df_raw):
    """Test a single sheet through U2 stage."""
    print(f"\n{'='*80}")
    print(f"SHEET: {sheet_name}")
    print(f"{'='*80}")
    
    print(f"Rows: {len(df_raw)}, Columns: {len(df_raw.columns)}")
    
    # Separate description rows
    description_rows, df_data = DescriptionSeparator.separate_description_rows(df_raw)
    print(f"Description rows: {len(description_rows)}")
    print(f"Data rows: {len(df_data)}")
    
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
    
    print(f"Header row: {suggested_header_row_absolute} (absolute), {suggested_header_row_relative} (relative)")
    print(f"Confidence: {confidence}")
    
    # Show header
    if len(df_data) > suggested_header_row_relative:
        header_preview = df_data.iloc[suggested_header_row_relative].tolist()[:5]
        print(f"Header (first 5): {header_preview}...")
    
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
    
    return response

def main():
    file_path = r"C:\Users\ASUS\Downloads\Combined_Reach_Lift_Results_AF_HC_Brand_Level_State_Profile_Combined_03.07.xlsx"
    
    print("="*80)
    print("TESTING EXCEL FILE - ALL SHEETS")
    print("="*80)
    print(f"\nFile: {os.path.basename(file_path)}")
    
    sheets_dict, metadata = read_excel_raw(file_path)
    
    print(f"\nTotal sheets: {metadata['total_sheets']}")
    print(f"Sheet names: {metadata['sheet_names']}")
    
    results = {}
    for sheet_name in metadata['sheet_names']:
        df = sheets_dict[sheet_name]
        response = test_sheet(sheet_name, df)
        results[sheet_name] = response
        
        # Validate
        required = ['data_rows', 'description_rows', 'data_rows_count', 'description_rows_count',
                    'data_rows_start', 'preview_row_count', 'column_count', 'total_rows',
                    'suggested_header_row', 'suggested_header_row_absolute', 'suggested_header_confidence']
        missing = [f for f in required if f not in response]
        
        if missing:
            print(f"  [ERROR] Missing: {missing}")
        elif len(response['data_rows']) == 0:
            print(f"  [ERROR] data_rows is empty!")
        else:
            print(f"  [OK] Response structure valid")
    
    # Summary
    print(f"\n{'='*80}")
    print("SUMMARY - ALL SHEETS")
    print(f"{'='*80}")
    for sheet_name, response in results.items():
        print(f"\n{sheet_name}:")
        print(f"  Description rows: {response['description_rows_count']}")
        print(f"  Data rows: {response['data_rows_count']}")
        print(f"  Header at row: {response['suggested_header_row_absolute']} (confidence: {response['suggested_header_confidence']})")
        print(f"  Columns: {response['column_count']}")
    
    # Save results
    output_file = "test_excel_all_sheets_response.json"
    with open(output_file, 'w', encoding='utf-8') as f:
        json.dump(results, f, indent=2, ensure_ascii=False)
    print(f"\nAll sheet responses saved to: {output_file}")
    
    return True

if __name__ == "__main__":
    success = main()
    sys.exit(0 if success else 1)

