# app/validators/mmm.py
import pandas as pd
from typing import Dict, Any, List, Set, Tuple

class ValidationReport:
    """Simple validation report class for MMM validation"""
    
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
        """Check if there are any failures for a specific dataset"""
        if dataset_prefix:
            return any(r["status"] == "failed" and r["check"].startswith(dataset_prefix) for r in self.results)
        return any(r["status"] == "failed" for r in self.results)
    
    def get_failures(self, dataset_prefix: str = "") -> List[str]:
        """Get all failure messages for a specific dataset"""
        failures = []
        for r in self.results:
            if r["status"] == "failed":
                if not dataset_prefix or r["check"].startswith(dataset_prefix):
                    failures.append(f"{r['check']}: {r['message']}")
        return failures
    
    def get_warnings(self, dataset_prefix: str = "") -> List[str]:
        """Get all warning messages for a specific dataset"""
        warnings = []
        for r in self.results:
            if r["status"] == "warning":
                if not dataset_prefix or r["check"].startswith(dataset_prefix):
                    warnings.append(f"{r['check']}: {r['message']}")
        return warnings
    
    def get_successes(self, dataset_prefix: str = "") -> List[str]:
        """Get all success messages for a specific dataset"""
        successes = []
        for r in self.results:
            if r["status"] == "passed":
                if not dataset_prefix or r["check"].startswith(dataset_prefix):
                    successes.append(f"{r['check']}: {r['message']}")
        return successes
    
    def get_result(self, check_name: str) -> str:
        """Get the status of a specific check"""
        for r in self.results:
            if r["check"] == check_name:
                return r["status"]
        return "not_found"

# Configuration constants for MMM validation
_MMM_MEDIA = {
    "required": ["market", "channel", "region", "category", "subcategory", "brand",
                 "variant", "pack_type", "ppg", "pack_size", "year", "month", "week",
                 "media_category", "media_subcategory"],
    "non_null": ["market", "region", "category", "subcategory", "brand", "year",
                 "month", "media_category", "media_subcategory"],
    "dtypes": {"amount_spent": "float64", "year": "object"},
    "business_columns": ["amount_spent", "impressions", "reach", "frequency"]
}

_MMM_SALES = {
    "required": ["market", "channel", "region", "category", "subcategory", "brand",
                 "variant", "pack_type", "ppg", "pack_size", "year", "month", "week",
                 "d1", "price"],
    "non_null": ["market", "region", "category", "subcategory", "brand", "year", "month"],
    "dtypes": {"d1": "float64", "volume": "float64", "sales": "float64",
               "price": "float64", "year": "object"},
    "business_columns": ["sales", "volume", "d1", "price"]
}

def find_column_variations(df: pd.DataFrame, target_column: str) -> str:
    """
    Find column variations - checks for multiple formats of the same column
    """
    # Generate possible variations of the target column
    variations = [
        target_column,  # exact match: "pack_size"
        target_column.replace('_', ''),  # no underscore: "packsize"
        target_column.replace('_', ' '),  # with space: "pack size"
        target_column.replace('_', '-'),  # with hyphen: "pack-size"
    ]
    
    # Check if any variation exists in the dataframe columns
    for variation in variations:
        if variation in df.columns:
            return variation
    
    return None

def check_required_columns_flexible(df: pd.DataFrame, rep: ValidationReport, dataset_name: str, required_columns: List[str]) -> List[str]:
    """
    Check for required columns with flexible matching
    """
    missing_columns = []
    found_columns = []
    column_mappings = {}
    
    for required_col in required_columns:
        found_col = find_column_variations(df, required_col)
        if found_col:
            found_columns.append(required_col)
            if found_col != required_col:
                column_mappings[found_col] = required_col
                # Rename the column to the expected name for consistency
                df.rename(columns={found_col: required_col}, inplace=True)
        else:
            missing_columns.append(required_col)
    
    # Report column mappings
    if column_mappings:
        rep.pass_(f"{dataset_name}_column_mapping", f"Mapped columns: {column_mappings}")
    
    return missing_columns

def clean_columns(df: pd.DataFrame, rep: ValidationReport, dataset_name: str) -> None:
    """Enhanced column cleaning with flexible preprocessing"""
    original_columns = df.columns.tolist()
    
    # Step 1: Remove leading/trailing whitespace
    renamed_cols = {c: c.strip() for c in df.columns if c != c.strip()}
    if renamed_cols:
        df.rename(columns=renamed_cols, inplace=True)
        rep.pass_(f"{dataset_name}_cleanup", f"Cleaned whitespace from columns: {list(renamed_cols.keys())}")
    
    # Step 2: Convert to lowercase first
    lowercase_cols = {c: c.lower() for c in df.columns if c != c.lower()}
    if lowercase_cols:
        df.rename(columns=lowercase_cols, inplace=True)
        rep.pass_(f"{dataset_name}_lowercase", f"Converted to lowercase: {list(lowercase_cols.keys())}")
    
    # Step 3: Create both formats (with and without underscores) 
    # This allows flexible matching later
    standardized_cols = {}
    for col in df.columns:
        # Handle spaces -> underscores, but keep original format info
        if ' ' in col or '-' in col:
            new_col = col.replace(' ', '_').replace('-', '_').replace('__', '_').strip('_')
            if col != new_col:
                standardized_cols[col] = new_col
    
    if standardized_cols:
        df.rename(columns=standardized_cols, inplace=True)
        rep.pass_(f"{dataset_name}_standardization", f"Standardized columns: {list(standardized_cols.keys())} → {list(standardized_cols.values())}")

def check_missing(df: pd.DataFrame, rep: ValidationReport, dataset_name: str, critical: List[str] = None) -> None:
    """Check for missing values in critical columns"""
    if critical is None:
        critical = []
    
    total_missing = df.isnull().sum().sum()
    if total_missing == 0:
        rep.pass_(f"{dataset_name}_missing_values", "No missing values found")
    else:
        rep.warn(f"{dataset_name}_missing_values", f"Total missing values: {total_missing}")
    
    # Check critical columns specifically
    for col in critical:
        if col in df.columns:
            missing_count = df[col].isnull().sum()
            if missing_count > 0:
                rep.fail(f"{dataset_name}_missing_{col}", f"Critical column '{col}' has {missing_count} missing values")
            else:
                rep.pass_(f"{dataset_name}_missing_{col}", f"No missing values in critical column '{col}'")
        else:
            rep.fail(f"{dataset_name}_missing_{col}", f"Critical column '{col}' not found in dataset")

def check_dtypes(df: pd.DataFrame, rep: ValidationReport, dataset_name: str, expected_dtypes: Dict[str, str]) -> None:
    """Check and attempt to convert data types"""
    for col, expected_dtype in expected_dtypes.items():
        if col in df.columns:
            current_dtype = str(df[col].dtype)
            
            if expected_dtype == "float64":
                if not pd.api.types.is_numeric_dtype(df[col]):
                    try:
                        # Try to convert to numeric
                        df[col] = pd.to_numeric(df[col], errors='coerce')
                        
                        # Check if conversion introduced NaN values
                        nan_count = df[col].isna().sum()
                        if nan_count > 0:
                            rep.warn(f"{dataset_name}_dtype_{col}", f"Converted '{col}' to numeric, {nan_count} values became NaN")
                        else:
                            rep.pass_(f"{dataset_name}_dtype_{col}", f"Successfully converted '{col}' to numeric")
                    except Exception as e:
                        rep.fail(f"{dataset_name}_dtype_{col}", f"Failed to convert '{col}' to numeric: {str(e)}")
                else:
                    rep.pass_(f"{dataset_name}_dtype_{col}", f"Column '{col}' is already numeric")
            
            elif expected_dtype == "object":
                if current_dtype != "object":
                    try:
                        df[col] = df[col].astype(str)
                        rep.pass_(f"{dataset_name}_dtype_{col}", f"Converted '{col}' to string")
                    except Exception as e:
                        rep.fail(f"{dataset_name}_dtype_{col}", f"Failed to convert '{col}' to string: {str(e)}")
                else:
                    rep.pass_(f"{dataset_name}_dtype_{col}", f"Column '{col}' is already string")
        else:
            rep.warn(f"{dataset_name}_dtype_{col}", f"Expected column '{col}' not found for data type validation")

def validate_business_logic(df: pd.DataFrame, rep: ValidationReport, dataset_name: str, business_columns: List[str]) -> None:
    """Validate business-specific logic for MMM data"""
    
    # Check for negative values in business metrics
    for col in business_columns:
        if col in df.columns and pd.api.types.is_numeric_dtype(df[col]):
            negative_count = (df[col] < 0).sum()
            if negative_count > 0:
                rep.warn(f"{dataset_name}_negative_{col}", f"Column '{col}' has {negative_count} negative values")
            else:
                rep.pass_(f"{dataset_name}_negative_{col}", f"No negative values in '{col}'")
    
    # Dataset-specific business logic
    if dataset_name == "media":
        # Check for zero values in spend columns
        if "amount_spent" in df.columns:
            zero_spend = (df["amount_spent"] == 0).sum()
            if zero_spend > 0:
                rep.warn(f"{dataset_name}_zero_spend", f"Media data has {zero_spend} rows with zero spend")
            else:
                rep.pass_(f"{dataset_name}_zero_spend", "No zero spend periods found")
        
        # Check for unrealistic spend values
        if "amount_spent" in df.columns:
            max_spend = df["amount_spent"].max()
            if max_spend > 1000000:  # 1 million threshold
                rep.warn(f"{dataset_name}_high_spend", f"Maximum spend value is very high: {max_spend:,.0f}")
            else:
                rep.pass_(f"{dataset_name}_spend_range", f"Spend values are within reasonable range (max: {max_spend:,.0f})")
    
    elif dataset_name == "sales":
        # Check for zero values in sales columns
        if "sales" in df.columns:
            zero_sales = (df["sales"] == 0).sum()
            if zero_sales > 0:
                rep.warn(f"{dataset_name}_zero_sales", f"Sales data has {zero_sales} rows with zero sales")
            else:
                rep.pass_(f"{dataset_name}_zero_sales", "No zero sales periods found")
        
        # Check price consistency
        if all(col in df.columns for col in ["sales", "volume", "price"]):
            # Calculate implied price and compare with actual price
            df['implied_price'] = df['sales'] / df['volume']
            price_diff = abs(df['price'] - df['implied_price'])
            inconsistent_prices = (price_diff > 0.01).sum()  # Allow 1 cent difference
            
            if inconsistent_prices > 0:
                rep.warn(f"{dataset_name}_price_consistency", f"{inconsistent_prices} rows have inconsistent price calculations")
            else:
                rep.pass_(f"{dataset_name}_price_consistency", "Price calculations are consistent (Sales = Volume × Price)")

def validate_time_periods(df: pd.DataFrame, rep: ValidationReport, dataset_name: str) -> Set[Tuple[str, int]]:
    """Validate time period data and return set of periods"""
    periods = set()
    
    if all(col in df.columns for col in ["year", "month"]):
        try:
            # Convert year to string and month to int for consistency
            df["year"] = df["year"].astype(str)
            df["month"] = pd.to_numeric(df["month"], errors='coerce').astype(int)
            
            # Create set of (year, month) tuples
            periods = set(zip(df["year"], df["month"]))
            
            years = sorted(df["year"].unique())
            months = sorted(df["month"].unique())
            
            rep.pass_(f"{dataset_name}_time_coverage", 
                     f"Years: {years}, Months: {months}, Total periods: {len(periods)}")
            
            # Check for valid months (1-12)
            invalid_months = df[(df["month"] < 1) | (df["month"] > 12)]["month"].unique()
            if len(invalid_months) > 0:
                rep.fail(f"{dataset_name}_invalid_months", f"Invalid month values: {invalid_months}")
            else:
                rep.pass_(f"{dataset_name}_valid_months", "All month values are valid (1-12)")
            
            # Check for time continuity
            if len(periods) > 1:
                period_list = sorted(list(periods))
                gaps = []
                for i in range(len(period_list) - 1):
                    current_year, current_month = period_list[i]
                    next_year, next_month = period_list[i + 1]
                    
                    # Calculate expected next period
                    if current_month == 12:
                        expected_year, expected_month = str(int(current_year) + 1), 1
                    else:
                        expected_year, expected_month = current_year, current_month + 1
                    
                    if (next_year, next_month) != (expected_year, expected_month):
                        gaps.append(f"{current_year}-{current_month:02d} to {next_year}-{next_month:02d}")
                
                if gaps:
                    rep.warn(f"{dataset_name}_time_gaps", f"Time gaps found: {gaps[:3]}...")  # Show first 3 gaps
                else:
                    rep.pass_(f"{dataset_name}_time_continuity", "No gaps in time series")
            
        except Exception as e:
            rep.fail(f"{dataset_name}_time_periods", f"Error processing time periods: {str(e)}")
    else:
        rep.fail(f"{dataset_name}_time_columns", "Missing required time columns (year, month)")
    
    return periods

def add_main_failure_summary(rep: ValidationReport) -> None:
    """Add main failure summary at the start of results if there are failures"""
    failures = [r for r in rep.results if r['status'] == 'failed']
    
    if failures:
        # Extract main failure categories
        main_reasons = []
        
        # Check for common failure patterns
        media_failures = [f for f in failures if 'media_' in f['check']]
        sales_failures = [f for f in failures if 'sales_' in f['check']]
        alignment_failures = [f for f in failures if 'time_alignment' in f['check']]
        
        if media_failures:
            main_reasons.append(f"Media dataset issues ({len(media_failures)} problems)")
        if sales_failures:
            main_reasons.append(f"Sales dataset issues ({len(sales_failures)} problems)")
        if alignment_failures:
            main_reasons.append("Time period alignment issues")
        
        # Add other critical failures
        critical_failures = [f for f in failures if 'required_columns' in f['check'] or 'data_empty' in f['check']]
        if critical_failures:
            main_reasons.append(f"Critical data structure issues ({len(critical_failures)} problems)")
        
        # Create summary message
        if main_reasons:
            summary_message = "MMM Validation Failed - " + "; ".join(main_reasons)
        else:
            # Fallback to first 2 failure messages
            summary_message = "MMM Validation Failed - " + "; ".join([f['message'] for f in failures[:2]])
        
        # Insert summary at the start
        rep.results.insert(0, {
            "check": "mmm_main_failure_summary",
            "status": "failed",
            "message": summary_message,
            "type": "error"
        })


def validate_mmm(
    media_df: pd.DataFrame,
    sales_df: pd.DataFrame,
    *,
    media_rules: Dict[str, Any] = _MMM_MEDIA,
    sales_rules: Dict[str, Any] = _MMM_SALES,
) -> ValidationReport:
    """
    Simplified MMM validation - no cross data alignment checks
    """
    rep = ValidationReport()
    rep.media_rules = media_rules
    rep.sales_rules = sales_rules

    def _validate_dataset_simple(df: pd.DataFrame, dataset_name: str, rules: Dict[str, Any]) -> None:
        """Simplified dataset validation - individual dataset only"""
        
        # Clean column names (keep your preprocessing logic)
        clean_columns(df, rep, dataset_name)
        
        # Check required columns with flexible matching
        missing_columns = check_required_columns_flexible(df, rep, dataset_name, rules["required"])
        
        if not missing_columns:
            rep.pass_(f"{dataset_name}_required_columns", f"All {len(rules['required'])} required columns found")
        else:
            rep.fail(f"{dataset_name}_required_columns", f"Missing columns: {missing_columns}")
        
        # Check missing values in critical columns only
        check_missing(df, rep, dataset_name, critical=rules["non_null"])
        
        # Check data types only
        check_dtypes(df, rep, dataset_name, rules["dtypes"])
        
        # Record count
        if df.empty:
            rep.fail(f"{dataset_name}_data_empty", "Dataset is empty")
        else:
            rep.pass_(f"{dataset_name}_records_count", f"{len(df)} records")

    # Validate both datasets independently
    rep.pass_("validation_start", "Starting MMM validation process")
    _validate_dataset_simple(media_df, "media", media_rules)
    _validate_dataset_simple(sales_df, "sales", sales_rules)
    
    # ❌ REMOVED: All cross data alignment validation
    # ❌ REMOVED: Time period matching
    # ❌ REMOVED: Dataset consistency checks
    # ❌ REMOVED: Overlap validation
    
    # Simple summary
    failed_checks = len([r for r in rep.results if r["status"] == "failed"])
    warning_checks = len([r for r in rep.results if r["status"] == "warning"])
    
    if failed_checks == 0:
        if warning_checks == 0:
            rep.pass_("mmm_validation_summary", "Perfect! MMM validation passed - all requirements met")
        else:
            rep.warn("mmm_validation_summary", f"MMM validation completed with {warning_checks} warnings")
    else:
        rep.fail("mmm_validation_summary", f"MMM validation failed: {failed_checks} critical issues")
    
    return rep