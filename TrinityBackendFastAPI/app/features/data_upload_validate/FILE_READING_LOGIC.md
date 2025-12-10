# File Reading Logic & Step 2 Description Detection

## Overview
This document explains how files are read and how Step 2 determines what is description/metadata vs actual data rows (including Row 1 which typically contains column names).

---

## 1. FILE READING ARCHITECTURE

### Libraries Used
- **Pandas** (`pd.read_csv`, `pd.read_excel`) - Primary file reading library
- **Polars** (`pl.read_csv`, `pl.from_pandas`) - Used for efficient serialization and some operations
- **OpenPyXL** - Excel file engine for reading `.xlsx` files
- **Python CSV module** - For pre-scanning CSV files to detect max columns

### Main Entry Point: `RobustFileReader`
```python
# Location: file_ingestion/robust_file_reader.py
RobustFileReader.read_file_to_pandas()
```

**Flow:**
1. Detects file type (CSV, Excel, TSV) using `FileTypeDetector`
2. Routes to appropriate reader:
   - **CSV files** → `CSVReader.read()`
   - **Excel files** → `ExcelReader.read()`

---

## 2. CSV FILE READING (`CSVReader`)

### Location
`file_ingestion/readers/csv_reader.py`

### Process Flow

#### Step 1: Pre-scan for Maximum Columns
```python
# CRITICAL: Find max columns FIRST to prevent truncation
max_cols = CSVReader._find_max_columns(content, encoding, delimiter)
```

**Why?** 
- Description rows may have fewer columns (e.g., 5 columns)
- Data rows may have more columns (e.g., 30 columns)
- Without pre-scanning, pandas would truncate to match the first row's column count

**How it works:**
- Uses Python's `csv` module to scan ALL rows
- Counts columns in each row
- Returns the maximum column count found

#### Step 2: Read CSV with Column Preservation
```python
read_kwargs = {
    "header": None,  # Read ALL rows as data (no header detection yet)
    "names": [f"col_{i}" for i in range(max_cols)],  # Force pandas to read ALL columns
    "encoding": encoding,
    "sep": delimiter,
    "engine": "python",  # More flexible parsing
}
df_raw = pd.read_csv(io.BytesIO(content), **read_kwargs)
```

**Key Points:**
- `header=None` means pandas treats ALL rows as data (no automatic header detection)
- `names` parameter forces pandas to create columns up to `max_cols`
- This ensures all 30 columns are preserved even if first row only has 5 columns

#### Step 3: Encoding Detection
- Uses `EncodingDetector` to detect file encoding (UTF-8, Latin-1, CP1252, etc.)
- Tries multiple encodings if first attempt fails

#### Step 4: Delimiter Detection
- Auto-detects delimiter (comma, tab, semicolon, etc.)
- Uses statistical analysis of first few rows

---

## 3. EXCEL FILE READING (`ExcelReader`)

### Location
`file_ingestion/readers/excel_reader.py`

### Process Flow

#### Step 1: Pre-scan for Maximum Columns
```python
# CRITICAL: Find max columns FIRST by scanning ALL rows
max_cols = ExcelReader._find_max_columns(excel_file, sheet, sample_rows=0)
```

**How it works:**
- Uses `openpyxl` to access the Excel workbook directly
- Uses `worksheet.max_column` property (most reliable - tracks actual max column used)
- Also scans rows as verification
- Returns the maximum of both methods

#### Step 2: Read Excel with Column Preservation
```python
# Generate Excel column range (e.g., "A:AD" for 30 columns)
last_col_letter = num_to_col_letter(max_cols - 1)  # Convert to Excel letters
usecols_range = f"A:{last_col_letter}"

df_raw = pd.read_excel(
    excel_file,
    sheet_name=sheet,
    header=None,  # Read ALL rows as data
    usecols=usecols_range,  # Force reading all columns
    engine='openpyxl',
    keep_default_na=False,
    na_values=[],
)
```

**Key Points:**
- `header=None` means pandas treats ALL rows as data
- `usecols` parameter forces pandas to read columns A through the last column
- This ensures all columns are preserved

#### Step 3: Expand DataFrame if Needed
```python
# If pandas read fewer columns than detected, expand DataFrame
if max_cols > 0 and len(df_raw.columns) < max_cols:
    for col_idx in range(len(df_raw.columns), max_cols):
        df_raw[f"col_{col_idx}"] = np.nan
    df_raw = df_raw.reindex(columns=[f"col_{i}" for i in range(max_cols)])
```

---

## 4. STEP 2: DESCRIPTION ROW DETECTION

### Location
`file_ingestion/processors/description_separator.py`

### Main Function
```python
DescriptionSeparator.separate_description_rows(df, max_description_rows=10)
```

### Process Flow

#### Step 1: Find Stable Data Block
```python
stable_start = DescriptionSeparator._find_stable_data_block(df, start_row=0)
```

**What it does:**
- Scans first 50 rows looking for ≥3 consecutive rows with:
  - Fill ratio ≥ 10% (very lenient)
  - Data consistency score ≥ 0.2
  - No very long text (>200 chars)
- Returns the row index where stable data starts

**Safety checks:**
- If `stable_start > 3`, it's likely wrong for simple files
- Falls back to row 0 if no stable block found

#### Step 2: Identify Header Row (CRITICAL)
```python
# First, identify which row is the header row (if any)
header_row_index = -1
best_header_score = 0
for i in range(min(rows_to_check, 10)):  # Check first 10 rows
    row = df.iloc[i]
    header_score = HeaderDetector._score_header_likelihood(row)
    if header_score > best_header_score:
        best_header_score = header_score
        header_row_index = i

# If we found a clear header row (score > 0.3), exclude it from description rows
if best_header_score > 0.3:
    logger.info(f"Detected header row at index {header_row_index}")
```

**Header Detection Logic (`HeaderDetector._score_header_likelihood`):**
- **String ratio** (30% weight): Headers are mostly strings
- **Empty cell ratio** (20% weight): Headers have few empty cells
- **Long text penalty** (20% weight): Headers don't have very long text
- **Numeric penalty** (15% weight): Headers have few numeric values
- **Column name pattern** (15% weight): Values look like column names (1-50 chars, alphanumeric)

**Key Fix:**
- Column names CAN contain ':' (e.g., "Impressions: Total Count")
- Previously excluded ':', now allows it
- Only excludes patterns like "Brand=" or "=value"

#### Step 3: Collect Description Rows
```python
for i in range(rows_to_check):
    # CRITICAL: Skip header row - it should NEVER be in description rows
    if i == header_row_index and best_header_score > 0.3:
        continue  # Skip header row
    
    row = df.iloc[i]
    if DescriptionSeparator._is_description_row(row, ...):
        description_rows.append(row)
```

**Description Row Detection (`_is_description_row`):**

Uses **pattern-agnostic structural analysis** (no hardcoded patterns):

1. **Header Check First** (lines 427-448):
   - If row looks like headers (score > 0.3), return `False` (NOT description)
   - Additional check: if 70%+ values look like column names, return `False`

2. **Structural Analysis:**
   - **Fill ratio**: Description rows are sparse (< 20% filled)
   - **Text length**: Description rows have longer text (> 200 chars)
   - **Numeric ratio**: Description rows have fewer numeric values

3. **Statistical Comparison:**
   - Compares row with next 3 rows
   - If structure differs significantly (fill ratio differs by >30%, text length differs by >100 chars), likely description

4. **Position-Based Heuristics:**
   - First 5 rows more likely to be description (but headers are excluded)

5. **Final Score Calculation:**
   ```python
   final_score = consistency_score - fill_penalty - long_text_penalty - mismatch_penalty - sparse_penalty + position_score
   is_description = final_score < 0.35  # Lower score = more likely description
   ```

#### Step 4: Extract Data Rows
```python
# Extract data rows starting from stable block
df_data = df.iloc[stable_start:].copy()
```

**Safety Checks:**
- If `df_data` is empty, return all rows as data
- If `df_data` has < 10% of original rows, reset (likely wrong)
- If `stable_start > 10%` of rows for small files (< 50 rows), reset to 0

---

## 5. HOW ROW 1 (COLUMN HEADERS) IS HANDLED

### The Problem
- Row 1 typically contains column names (e.g., "Search Query", "Impressions: Total Count")
- Previously, Row 1 was incorrectly treated as a description row
- This moved it to "File Metadata / Description Rows" section
- User couldn't select it as the header row in Step 3

### The Solution

#### 1. Header Detection Before Description Detection
```python
# Check if row looks like headers FIRST (before checking if it's description)
if row_index >= 0 and row_index < 10:
    header_score = HeaderDetector._score_header_likelihood(row)
    if header_score > 0.3:  # Lower threshold (was 0.5)
        return False  # NOT a description row
```

#### 2. Column Name Pattern Recognition
```python
# Additional check: if row has many column-name-like values
non_empty_values = [str(val).strip() for val in row if pd.notna(val)]
if len(non_empty_values) >= total_cols * 0.5:  # At least 50% filled
    column_name_like_count = sum(
        1 for val in non_empty_values 
        if 1 <= len(val) <= 50 and not val.startswith('=') and not val.endswith('=')
    )
    column_name_ratio = column_name_like_count / len(non_empty_values)
    if column_name_ratio >= 0.7:  # 70%+ look like column names
        return False  # NOT a description row
```

#### 3. Explicit Exclusion from Description Rows
```python
# In separate_description_rows():
for i in range(rows_to_check):
    # CRITICAL: Skip header row - it should NEVER be in description rows
    if i == header_row_index and best_header_score > 0.3:
        logger.debug(f"Row {i} is the header row - skipping from description rows")
        continue  # Skip this row
```

### Result
- ✅ Row 1 (with column names) is **detected as header row**
- ✅ Row 1 is **excluded from description rows**
- ✅ Row 1 **remains in the data table** (appears as Row 1 in preview)
- ✅ User can **select Row 1 as header** in Step 3

---

## 6. KEY CONCEPTS

### Pattern-Agnostic Approach
- **No hardcoded patterns** like "Brand=", "Reporting Range="
- Uses **structural/statistical analysis** instead
- Works with any file format or metadata style

### Column Preservation
- **Pre-scanning** finds maximum columns across ALL rows
- **Forces pandas** to read all columns using `names` (CSV) or `usecols` (Excel)
- **Prevents truncation** when description rows have fewer columns

### Header Protection
- **Header detection happens FIRST** (before description detection)
- **Multiple checks** ensure header rows are never treated as description
- **Lower threshold** (0.3 instead of 0.5) catches more header patterns

### Safety First
- **Multiple fallbacks** if detection fails
- **Conservative thresholds** to avoid false positives
- **Returns all rows as data** if unsure

---

## 7. FILE READING SUMMARY

```
User uploads file
    ↓
RobustFileReader.read_file_to_pandas()
    ↓
Detect file type (CSV/Excel)
    ↓
[CSV] CSVReader.read()
    ├─ Detect encoding
    ├─ Detect delimiter
    ├─ Pre-scan: Find max columns (scan ALL rows)
    └─ Read with pd.read_csv(header=None, names=[col_0...col_N])
    
[Excel] ExcelReader.read()
    ├─ Open with pd.ExcelFile(engine='openpyxl')
    ├─ Pre-scan: Find max columns (worksheet.max_column + row scan)
    └─ Read with pd.read_excel(header=None, usecols="A:XXX")
    ↓
Return DataFrame (ALL rows as data, no headers applied)
    ↓
Step 2: DescriptionSeparator.separate_description_rows()
    ├─ Find stable data block start
    ├─ Identify header row (HeaderDetector)
    ├─ Collect description rows (exclude header row)
    └─ Return (description_rows, df_data)
    ↓
Step 3: User selects header row from df_data
```

---

## 8. IMPORTANT FILES

| File | Purpose |
|------|---------|
| `robust_file_reader.py` | Main entry point for file reading |
| `readers/csv_reader.py` | CSV file reading with column preservation |
| `readers/excel_reader.py` | Excel file reading with column preservation |
| `processors/description_separator.py` | Step 2: Separates description rows from data |
| `processors/header_detector.py` | Detects which row contains column headers |
| `detectors/encoding_detector.py` | Detects file encoding |
| `detectors/file_type_detector.py` | Detects file type (CSV/Excel/TSV) |

---

## 9. CONFIGURATION

### CSV Reading Configuration
- **Encoding**: Auto-detected (UTF-8, Latin-1, CP1252, ISO-8859-1)
- **Delimiter**: Auto-detected (comma, tab, semicolon)
- **Engine**: Python (most flexible)
- **Bad lines**: Skipped (doesn't fail on malformed rows)

### Excel Reading Configuration
- **Engine**: OpenPyXL
- **Keep default NA**: False (preserves empty strings)
- **NA values**: Empty list (nothing treated as NaN)

### Description Detection Configuration
- **Max description rows**: 10 (default)
- **Header score threshold**: 0.3 (lower = more lenient)
- **Description score threshold**: 0.35 (lower score = description)
- **Stable block consecutive rows**: 3 (minimum)

---

## 10. DEBUGGING

### Enable Debug Logging
```python
import logging
logging.getLogger("app.features.data_upload_validate").setLevel(logging.DEBUG)
```

### Key Log Messages
- `"Detected maximum columns: {max_cols}"` - Column preservation working
- `"Detected header row at index {i}"` - Header detection working
- `"Row {i} is the header row - skipping from description rows"` - Header protection working
- `"Row {i} detected as description"` - Description detection working

---

## END OF DOCUMENT

