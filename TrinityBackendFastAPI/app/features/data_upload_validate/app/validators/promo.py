# app/validators/promo.py
import pandas as pd
from typing import List, Optional

class ValidationReport:
    """Simple validation report class for Promo validation"""
    
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

def clean_columns(df: pd.DataFrame, rep: ValidationReport) -> None:
    """Clean column names by removing whitespace and standardizing case"""
    # Remove leading/trailing whitespace
    renamed_cols = {c: c.strip() for c in df.columns if c != c.strip()}
    if renamed_cols:
        df.rename(columns=renamed_cols, inplace=True)
        rep.pass_("cleanup", f"Cleaned whitespace from columns: {list(renamed_cols.keys())}")

def check_missing(df: pd.DataFrame, rep: ValidationReport, critical: List[str] = None) -> None:
    """Check for missing values in dataframe"""
    if critical is None:
        critical = []
    
    total_missing = df.isnull().sum().sum()
    if total_missing == 0:
        rep.pass_("missing_values", "No missing values found")
    else:
        rep.warn("missing_values", f"Total missing values: {total_missing}")
    
    # Check critical columns
    for col in critical:
        if col in df.columns:
            missing_count = df[col].isnull().sum()
            if missing_count > 0:
                rep.fail(f"missing_{col}", f"Critical column '{col}' has {missing_count} missing values")

def find_column_variations(df: pd.DataFrame, target_column: str) -> str:
    """Find column variations - checks for multiple formats of the same column"""
    variations = [
        target_column,  # exact match
        target_column.replace('_', ''),  # no underscore: "salesvalue"
        target_column.replace('_', ' '),  # with space: "sales value"
        target_column.replace('_', '-'),  # with hyphen: "sales-value"
        target_column.lower(),  # lowercase
        target_column.title(),  # title case
        target_column.upper(),  # uppercase
        # Common variations for promo data
        target_column.replace('value', 'val'),  # "salesval"
        target_column.replace('sales', 'sale'),  # "salevalue"
        target_column.replace('Price', 'price'),  # case variations
        target_column.replace('price', 'Price'),  # case variations
    ]
    
    # Additional variations for price columns
    if 'price' in target_column.lower():
        base_name = target_column.lower().replace('price', '').replace('_', '').replace(' ', '')
        variations.extend([
            f"{base_name}price",
            f"{base_name}_price", 
            f"{base_name} price",
            f"{base_name}Price",
            f"{base_name}_Price"
        ])
    
    for variation in variations:
        if variation in df.columns:
            return variation
    
    return None

def check_required_columns_flexible(df: pd.DataFrame, rep: ValidationReport, required_columns: List[str]) -> List[str]:
    """Check for required columns with flexible matching"""
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
        rep.pass_("column_mapping", f"Mapped columns: {column_mappings}")
    
    return missing_columns

# ✅ Configuration constants for Promo Intensity validation (PromoPrice removed from mandatory)
_PI_REQUIRED = ["Channel", "Brand", "PPG", "SalesValue", "Volume", "Price", "BasePrice"]
_PI_AGG = ["Variant", "PackType", "PackSize"]

def validate_promo_intensity(
    df: pd.DataFrame,
    *,
    required: List[str] = _PI_REQUIRED,
    aggregators: List[str] = _PI_AGG,
) -> ValidationReport:
    """
    Validates data for Promotional Intensity analysis.
    PromoPrice is now optional (not mandatory).
    
    Parameters
    ----------
    df : pd.DataFrame
        DataFrame containing promotional data
    required : List[str], optional
        List of required columns (Price, BasePrice mandatory; PromoPrice optional)
    aggregators : List[str], optional
        List of potential aggregator columns
        
    Returns
    -------
    ValidationReport
        Validation results
    """
    rep = ValidationReport()
    
    # Start validation
    rep.pass_("validation_start", "Starting Promo Intensity validation with mandatory price columns (PromoPrice optional)")
    
    # Clean column names (remove whitespace)
    clean_columns(df, rep)
    
    # Use flexible column matching for all required columns
    missing_columns = check_required_columns_flexible(df, rep, required)
    
    if not missing_columns:
        rep.pass_("required_cols", f"All {len(required)} required columns found (Price, BasePrice mandatory)")
    else:
        rep.fail("required_cols", f"Missing required columns: {missing_columns}. Available columns: {list(df.columns)}")

    # Check for missing values in critical columns
    check_missing(df, rep, critical=required)

    # Enhanced price column validation (PromoPrice now optional)
    mandatory_price_columns = ["Price", "BasePrice"]
    optional_price_columns = ["PromoPrice"]
    
    # Validate mandatory price columns
    for price_col in mandatory_price_columns:
        if price_col in df.columns:
            if pd.api.types.is_numeric_dtype(df[price_col]):
                # Check for negative prices
                negative_prices = (df[price_col] < 0).sum()
                if negative_prices > 0:
                    rep.fail(f"negative_{price_col}", f"'{price_col}' has {negative_prices} negative values - not allowed for pricing data")
                else:
                    rep.pass_(f"positive_{price_col}", f"'{price_col}' has no negative values")
                
                # Check for zero prices
                zero_prices = (df[price_col] == 0).sum()
                if zero_prices > 0:
                    rep.warn(f"zero_{price_col}", f"'{price_col}' has {zero_prices} zero values")
                else:
                    rep.pass_(f"non_zero_{price_col}", f"'{price_col}' has no zero values")
                
                # Check price ranges for reasonableness
                max_price = df[price_col].max()
                min_price = df[price_col].min()
                
                if max_price > 10000:  # Threshold for unusually high prices
                    rep.warn(f"high_{price_col}", f"'{price_col}' has very high values (max: {max_price:,.2f})")
                
                rep.pass_(f"numeric_{price_col}", f"'{price_col}' is numeric with range: {min_price:.2f} to {max_price:.2f}")
            else:
                rep.fail(f"non_numeric_{price_col}", f"'{price_col}' must be numeric for price analysis (current type: {df[price_col].dtype})")
        else:
            # This should not happen since we check required columns above, but just in case
            rep.fail(f"missing_{price_col}", f"Mandatory price column '{price_col}' is missing from the dataset")
    
    # Validate optional price columns
    for price_col in optional_price_columns:
        found_price_col = find_column_variations(df, price_col)
        if found_price_col:
            if found_price_col != price_col:
                df.rename(columns={found_price_col: price_col}, inplace=True)
                rep.pass_(f"optional_price_mapping_{price_col}", f"Found and mapped '{found_price_col}' to '{price_col}'")
            
            if pd.api.types.is_numeric_dtype(df[price_col]):
                # Check for negative prices
                negative_prices = (df[price_col] < 0).sum()
                if negative_prices > 0:
                    rep.warn(f"negative_{price_col}", f"Optional column '{price_col}' has {negative_prices} negative values")
                else:
                    rep.pass_(f"positive_{price_col}", f"Optional column '{price_col}' has no negative values")
                
                # Check for zero prices
                zero_prices = (df[price_col] == 0).sum()
                if zero_prices > 0:
                    rep.warn(f"zero_{price_col}", f"Optional column '{price_col}' has {zero_prices} zero values")
                
                rep.pass_(f"optional_numeric_{price_col}", f"Optional column '{price_col}' is numeric and available for analysis")
            else:
                rep.warn(f"non_numeric_{price_col}", f"Optional column '{price_col}' is not numeric (type: {df[price_col].dtype})")
        else:
            rep.pass_(f"optional_missing_{price_col}", f"Optional price column '{price_col}' not found - analysis will use available price columns")
    

    # Check time granularity with flexible matching
    date_col = find_column_variations(df, "Date")
    year_col = find_column_variations(df, "Year")
    week_col = find_column_variations(df, "Week")
    
    has_date = date_col is not None
    has_week = year_col is not None and week_col is not None
    
    if has_date:
        if date_col != "Date":
            df.rename(columns={date_col: "Date"}, inplace=True)
            rep.pass_("date_mapping", f"Mapped '{date_col}' to 'Date'")
        rep.pass_("granularity", "Time granularity check passed. Data is at daily level.")
    elif has_week:
        if year_col != "Year":
            df.rename(columns={year_col: "Year"}, inplace=True)
        if week_col != "Week":
            df.rename(columns={week_col: "Week"}, inplace=True)
        rep.pass_("granularity", "Time granularity check passed. Data is at weekly level.")
    else:
        rep.fail("granularity", "Missing time columns. Need either 'Date' column or both 'Year' and 'Week' columns.")

    # Check for aggregator columns with flexible matching
    found_aggregators = []
    aggregator_mappings = {}
    
    for agg_col in aggregators:
        found_agg = find_column_variations(df, agg_col)
        if found_agg:
            found_aggregators.append(agg_col)
            if found_agg != agg_col:
                aggregator_mappings[found_agg] = agg_col
                df.rename(columns={found_agg: agg_col}, inplace=True)
    
    if aggregator_mappings:
        rep.pass_("aggregator_mapping", f"Mapped aggregator columns: {aggregator_mappings}")
    
    if found_aggregators:
        rep.pass_("aggregators", f"Found {len(found_aggregators)} aggregator columns: {found_aggregators}")
    else:
        rep.warn("aggregators", f"No aggregator columns found. Looked for: {aggregators}")

    # Check for promotion indicators (excluding mandatory price columns)
    promo_indicators = []
    for col in df.columns:
        col_lower = col.lower()
        if any(keyword in col_lower for keyword in ['promo', 'promotion', 'discount', 'offer', 'deal']) and col not in mandatory_price_columns:
            promo_indicators.append(col)
    
    if promo_indicators:
        rep.pass_("promotion_indicator", f"Found promotion indicators: {promo_indicators}")
        
        # Analyze promotion indicators
        for indicator in promo_indicators:
            if pd.api.types.is_numeric_dtype(df[indicator]):
                non_zero_promos = (df[indicator] != 0).sum()
                promo_percentage = (non_zero_promos / len(df)) * 100
                rep.pass_(f"promo_analysis_{indicator}", f"'{indicator}': {non_zero_promos} promotional periods ({promo_percentage:.1f}%)")
            elif pd.api.types.is_bool_dtype(df[indicator]):
                true_promos = df[indicator].sum()
                promo_percentage = (true_promos / len(df)) * 100
                rep.pass_(f"promo_analysis_{indicator}", f"'{indicator}': {true_promos} promotional periods ({promo_percentage:.1f}%)")
    else:
        rep.warn("promotion_indicator", "No additional promotion indicator columns found")

    # Business logic validation for promo data
    if "SalesValue" in df.columns and "Volume" in df.columns:
        # Check for consistency between sales and volume
        if pd.api.types.is_numeric_dtype(df["SalesValue"]) and pd.api.types.is_numeric_dtype(df["Volume"]):
            # Calculate implied price
            non_zero_volume = df["Volume"] > 0
            if non_zero_volume.any():
                df.loc[non_zero_volume, 'implied_price'] = df.loc[non_zero_volume, "SalesValue"] / df.loc[non_zero_volume, "Volume"]
                
                # Check for negative sales or volume
                negative_sales = (df["SalesValue"] < 0).sum()
                negative_volume = (df["Volume"] < 0).sum()
                
                if negative_sales > 0:
                    rep.fail("negative_sales", f"SalesValue has {negative_sales} negative values - not allowed")
                if negative_volume > 0:
                    rep.fail("negative_volume", f"Volume has {negative_volume} negative values - not allowed")
                
                if negative_sales == 0 and negative_volume == 0:
                    rep.pass_("sales_volume_validation", "SalesValue and Volume have no negative values")
    
    # Check if dataframe is empty
    if df.empty:
        rep.fail("data_empty", "Dataset is empty after validation")
    else:
        rep.pass_("records_count", f"Dataset contains {len(df)} records")
        
        # Check for sufficient data for promo analysis
        if len(df) < 12:
            rep.warn("data_sufficiency", f"Only {len(df)} records - may be insufficient for robust promotional analysis")
        else:
            rep.pass_("data_sufficiency", f"Sufficient data for promotional analysis: {len(df)} records")

    # Enhanced date range analysis
    if "Date" in df.columns:
        try:
            # Convert to datetime if not already
            if not pd.api.types.is_datetime64_any_dtype(df["Date"]):
                df["Date"] = pd.to_datetime(df["Date"], errors="coerce")
            
            if not df["Date"].isna().all():
                min_date = df["Date"].min().date()
                max_date = df["Date"].max().date()
                date_range = (max_date - min_date).days + 1
                
                rep.pass_("date_range", f"Date range: {min_date} to {max_date} ({date_range} days)")
        except Exception as e:
            rep.warn("date_range", f"Error analyzing date range: {str(e)}")
    
    # Final validation summary
    total_checks = len(rep.results)
    failed_checks = len([r for r in rep.results if r["status"] == "failed"])
    warning_checks = len([r for r in rep.results if r["status"] == "warning"])
    
    if failed_checks == 0:
        if warning_checks == 0:
            rep.pass_("promo_validation_summary", f"Perfect! All {total_checks} Promo validation checks passed (PromoPrice optional)")
        else:
            rep.warn("promo_validation_summary", f"Promo validation completed with {warning_checks} warnings out of {total_checks} checks")
    else:
        rep.fail("promo_validation_summary", f"Promo validation failed: {failed_checks} errors and {warning_checks} warnings out of {total_checks} total checks")
    
    return rep