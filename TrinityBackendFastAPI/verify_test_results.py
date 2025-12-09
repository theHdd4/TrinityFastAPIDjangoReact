"""Verify test results."""
import json

# Verify Excel test results
with open('test_excel_all_sheets_response.json', 'r', encoding='utf-8') as f:
    data = json.load(f)

print("="*80)
print("EXCEL FILE TEST VERIFICATION")
print("="*80)

for sheet_name in ['Lift Table', 'Percentile Thresholds']:
    if sheet_name in data:
        response = data[sheet_name]
        print(f"\n{sheet_name}:")
        print(f"  data_rows: {len(response['data_rows'])}")
        print(f"  description_rows: {len(response['description_rows'])}")
        print(f"  data_rows_count: {response['data_rows_count']}")
        print(f"  header_at: {response['suggested_header_row_absolute']}")
        print(f"  confidence: {response['suggested_header_confidence']}")
        print(f"  columns: {response['column_count']}")
        
        # Verify structure
        if response['data_rows']:
            first_row = response['data_rows'][0]
            has_row_index = 'row_index' in first_row
            has_relative_index = 'relative_index' in first_row
            has_cells = 'cells' in first_row
            print(f"  Structure: row_index={has_row_index}, relative_index={has_relative_index}, cells={has_cells}")

print("\n" + "="*80)
print("VERIFICATION COMPLETE")
print("="*80)

