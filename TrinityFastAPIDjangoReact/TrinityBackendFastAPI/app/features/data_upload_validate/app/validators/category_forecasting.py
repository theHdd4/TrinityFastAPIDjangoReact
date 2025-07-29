# app/validators/category_forecasting.py
import pandas as pd
from typing import Optional, List

class ValidationReport:
    """Simple validation report class for Category Forecasting validation"""
    
    def __init__(self):
        self.results = []
        self.status = "success"
    
    def pass_(self, check_name: str, message: str = ""):
        """Record a passing validation"""
        self.results.append({
            "check": check_name,
            "status": "passed",
            "message": message,
            "type": "success"
        })
    
    def fail(self, check_name: str, message: str):
        """Record a failing validation"""
        self.results.append({
            "check": check_name,
            "status": "failed", 
            "message": message,
            "type": "error"
        })
        self.status = "failed"
    
    def warn(self, check_name: str, message: str):
        """Record a warning"""
        self.results.append({
            "check": check_name,
            "status": "warning",
            "message": message,
            "type": "warning"
        })
    
    def has_failures(self, dataset_prefix: str = "") -> bool:
        """Check if there are any failures"""
        return any(r["status"] == "failed" for r in self.results)
    
    def get_failures(self) -> List[str]:
        """Get all failure messages"""
        return [f"{r['check']}: {r['message']}" for r in self.results if r["status"] == "failed"]
    
    def get_warnings(self) -> List[str]:
        """Get all warning messages"""
        return [f"{r['check']}: {r['message']}" for r in self.results if r["status"] == "warning"]
    
    def get_successes(self) -> List[str]:
        """Get all success messages"""
        return [f"{r['check']}: {r['message']}" for r in self.results if r["status"] == "passed"]

def clean_and_standardize_columns(df: pd.DataFrame, rep: ValidationReport) -> None:
    """Clean and standardize columns - strip, lowercase, spaces to underscores"""
    # Step 1: Remove leading/trailing whitespace
    renamed_cols = {c: c.strip() for c in df.columns if c != c.strip()}
    if renamed_cols:
        df.rename(columns=renamed_cols, inplace=True)
        rep.pass_("cleanup", f"Cleaned whitespace from columns: {list(renamed_cols.keys())}")
    
    # Step 2: Convert to lowercase
    lowercase_cols = {c: c.lower() for c in df.columns if c != c.lower()}
    if lowercase_cols:
        df.rename(columns=lowercase_cols, inplace=True)
        rep.pass_("lowercase", f"Converted to lowercase: {list(lowercase_cols.keys())}")
    
    # Step 3: Replace spaces with underscores for consistency
    standardized_cols = {}
    for col in df.columns:
        new_col = col.replace(' ', '_').replace('-', '_').replace('__', '_').strip('_')
        if col != new_col:
            standardized_cols[col] = new_col
    
    if standardized_cols:
        df.rename(columns=standardized_cols, inplace=True)
        rep.pass_("standardization", f"Standardized columns: {list(standardized_cols.keys())} → {list(standardized_cols.values())}")

def find_column_variations(df: pd.DataFrame, target_column: str) -> str:
    """Find column variations - checks for multiple formats"""
    variations = [
        target_column.lower(),  # lowercase
        target_column.lower().replace('_', ''),  # no underscore
        target_column.lower().replace('_', ' '),  # with space
        target_column.lower().replace('_', '-'),  # with hyphen
    ]
    
    for variation in variations:
        if variation in df.columns:
            return variation
    
    return None

def check_missing(df: pd.DataFrame, rep: ValidationReport) -> None:
    """Simple missing values check - informational only"""
    total_missing = df.isnull().sum().sum()
    if total_missing == 0:
        rep.pass_("missing_values", "No missing values found")
    else:
        rep.warn("missing_values", f"Total missing values: {total_missing}")

def validate_category_forecasting(
    df: pd.DataFrame,
    *,
    date_col: str = "Date",
    fiscal_start_month: int = 4,
) -> ValidationReport:
    """
    Category Forecasting validation with proper column mapping
    """
    rep = ValidationReport()
    
    # 1. ✅ Clean and standardize column names (strip, lowercase, underscores)
    clean_and_standardize_columns(df, rep)
    
    # 2. ✅ Date column validation with flexible matching
    date_col_lower = date_col.lower()  # Convert target to lowercase
    date_col_found = find_column_variations(df, date_col_lower)
    
    if not date_col_found:
        rep.fail("date_column", f"'{date_col}' not found. Available columns: {list(df.columns)}")
    else:
        if date_col_found != date_col_lower:
            # Rename to standard name
            df.rename(columns={date_col_found: date_col_lower}, inplace=True)
            rep.pass_("date_mapping", f"Mapped '{date_col_found}' to '{date_col_lower}'")
        
        working_date_col = date_col_lower
        
        if not pd.api.types.is_datetime64_any_dtype(df[working_date_col]):
            try:
                df[working_date_col] = pd.to_datetime(df[working_date_col], errors="coerce")
                if df[working_date_col].isna().all():
                    rep.fail("date_column", "all values NaT after conversion")
                else:
                    rep.pass_("date_column", "valid datetime")
            except Exception as e:
                rep.fail("date_column", f"error converting: {str(e)}")
        else:
            rep.pass_("date_column", "valid datetime")
        
        # Simple duplicate check (warning only)
        if working_date_col in df.columns and pd.api.types.is_datetime64_any_dtype(df[working_date_col]):
            dup = df[working_date_col].duplicated().sum()
            if dup:
                rep.warn("duplicate_dates", f"{dup} duplicates")
            else:
                rep.pass_("duplicate_dates", "No duplicate dates")
            
            # Simple date range info
            if not df[working_date_col].isna().all():
                min_date = df[working_date_col].min().date()
                max_date = df[working_date_col].max().date()
                rep.pass_("date_range", f"from {min_date} to {max_date}")
    
    # 3. ✅ Business key check with flexible matching (all lowercase)
    business_keys = ["market", "channel", "region", "category", "subcategory", "brand", "ppg", "variant", "packtype", "packsize"]
    found = []
    
    for required in business_keys:
        found_col = find_column_variations(df, required)
        if found_col:
            found.append(found_col)
    
    if found:
        rep.pass_("dimension_check", f"found {', '.join(found)}")
    else:
        rep.fail("dimension_check", f"need at least one of {', '.join(business_keys)}")
    
    # 4. ✅ Fiscal year check with flexible matching
    fiscal_col_found = find_column_variations(df, "fiscal_year")
    if fiscal_col_found:
        rep.pass_("fiscal_year", "Fiscal Year column found")
    else:
        rep.warn("fiscal_year", f"will compute at runtime (start month={fiscal_start_month})")
    
    # 5. Simple missing values summary (informational only)
    check_missing(df, rep)
    
    # 6. Empty data check
    if df.empty:
        rep.fail("data_empty", "Data is empty after validations")
    else:
        rep.pass_("records_count", f"{len(df)} records")
    
    return rep