import io
import json
import pandas as pd
import numpy as np
import pyarrow as pa
from pyarrow import ipc
from scipy.stats import pearsonr, spearmanr, chi2_contingency
from minio import Minio
from minio.error import S3Error
from fastapi import HTTPException
from .config import settings  # Use local config instead of global config
from typing import List, Dict, Any, Literal, Optional, Union
from datetime import datetime
from .database import correlation_coll
from pymongo.errors import PyMongoError


# Initialize MinIO client (only once)
minio_client = Minio(
    settings.minio_url,
    access_key=settings.minio_access_key,
    secret_key=settings.minio_secret_key,
    secure=settings.minio_secure,
)


def parse_minio_path(file_path: str) -> tuple[str, str]:
    """Parse MinIO path into bucket and object path.

    The correlation feature expects paths relative to the ``trinity`` bucket
    but some callers may include the bucket name as a prefix (e.g.
    ``trinity/client/app/file.arrow``).  MinIO treats object paths literally,
    so we strip any leading bucket segment to avoid creating a nested
    ``trinity`` directory in the bucket root.
    """

    bucket_name = "trinity"
    object_path = file_path.strip("/")

    # Remove leading bucket name if the caller included it
    if object_path.startswith(f"{bucket_name}/"):
        object_path = object_path[len(bucket_name) + 1 :]

    if not object_path:
        raise ValueError("Invalid MinIO path. Object path cannot be empty")

    return bucket_name, object_path


async def check_bucket_and_file(file_path: str) -> dict:
    """Check if bucket exists and file is accessible"""
    try:
        bucket_name, object_path = parse_minio_path(file_path)
        
        # Check if bucket exists
        if not minio_client.bucket_exists(bucket_name):
            return {
                "exists": False,
                "bucket_name": bucket_name,
                "object_path": object_path,
                "message": f"Bucket '{bucket_name}' does not exist"
            }
        
        # Check if object exists by trying to stat it
        try:
            minio_client.stat_object(bucket_name, object_path)
            return {
                "exists": True,
                "bucket_name": bucket_name,
                "object_path": object_path,
                "message": f"File found at {file_path}"
            }
        except S3Error as e:
            if e.code == "NoSuchKey":
                return {
                    "exists": False,
                    "bucket_name": bucket_name,
                    "object_path": object_path,
                    "message": f"File '{object_path}' not found in bucket '{bucket_name}'"
                }
            raise
            
    except Exception as e:
        raise HTTPException(status_code=400, detail=str(e))


async def load_csv_from_minio(file_path: str) -> pd.DataFrame:
    """
    Load Arrow or CSV file from MinIO using full path
    Example: "dataformodel/rpi.csv" or "default_client/default_app/default_project/file.arrow"
    """
    bucket_name, object_path = parse_minio_path(file_path)
    
    # Verify bucket exists
    if not minio_client.bucket_exists(bucket_name):
        raise HTTPException(404, f"Bucket '{bucket_name}' not found")
    
    try:
        # Check if it's an Arrow file
        if object_path.endswith('.arrow'):
            # Use same pattern as feature-overview cached_dataframe (which works)
            try:
                from app.DataStorageRetrieval.arrow_client import download_dataframe
                print(f"🛫 correlation download_dataframe for: {file_path}")
                df = download_dataframe(file_path)
                print(f"✅ correlation flight success for: {file_path} rows={len(df)}")
                return df
            except Exception as exc:
                print(f"⚠️ correlation flight failed for {file_path}: {exc}")
                # Direct MinIO fallback (same as cached_dataframe endpoint)
                print(f"� correlation falling back to direct MinIO for: {file_path}")
                response = minio_client.get_object(bucket_name, object_path)
                arrow_data = response.read()
                response.close()
                response.release_conn()
                
                # Parse Arrow file to DataFrame using pyarrow
                table = ipc.RecordBatchFileReader(pa.BufferReader(arrow_data)).read_all()
                df = table.to_pandas()
                print(f"✅ correlation MinIO fallback success for: {file_path} rows={len(df)}")
                return df
        else:
            # For CSV files, use the existing CSV loading logic
            response = minio_client.get_object(bucket_name, object_path)
            
            # Read the data into pandas DataFrame
            csv_data = response.read()
            response.close()
            response.release_conn()
            
            # Convert bytes to DataFrame
            df = pd.read_csv(io.BytesIO(csv_data))
            return df
        
    except S3Error as e:
        if e.code == "NoSuchKey":
            raise HTTPException(404, f"File '{object_path}' not found in bucket '{bucket_name}'")
        raise HTTPException(500, f"MinIO error: {str(e)}")
    except Exception as e:
        # Handle Arrow parsing errors or other issues
        raise HTTPException(400, f"Failed to load file '{file_path}': {str(e)}")


def calculate_correlations(df: pd.DataFrame, req) -> Dict[str, Any]:
    """Calculate correlations based on the specified method"""
    
    # Get all column info for debugging
    all_columns = list(df.columns)
    all_dtypes = df.dtypes.to_dict()
    
    print(f"🔍 All columns before filtering: {len(all_columns)}")
    print(f"📊 Column types: {all_dtypes}")
    
    if req.method == "pearson":
        # Pearson correlation for numeric columns only
        numeric_df = df.select_dtypes(include=[np.number])
        numeric_columns = list(numeric_df.columns)
        
        print(f"🔢 Numeric columns after filtering: {len(numeric_columns)}")
        print(f"📋 Numeric columns: {numeric_columns}")
        
        if numeric_df.shape[1] < 2:
            non_numeric = [col for col in all_columns if col not in numeric_columns]
            print(f"❌ Non-numeric columns filtered out: {non_numeric}")
            raise ValueError(f"Need at least 2 numeric columns for Pearson correlation. Found {len(numeric_columns)} numeric columns: {numeric_columns}")
        
        corr_matrix = numeric_df.corr(method='pearson')
        # Replace NaN with 0
        corr_matrix = corr_matrix.fillna(0)
        
        print(f"✅ Correlation matrix shape: {corr_matrix.shape}")
        print(f"🎯 Correlation matrix columns: {list(corr_matrix.columns)}")
        
        return {"correlation_matrix": corr_matrix.to_dict(), "method": "pearson", "numeric_columns": numeric_columns}
    
    elif req.method == "spearman":
        # Spearman correlation for numeric columns only
        numeric_df = df.select_dtypes(include=[np.number])
        numeric_columns = list(numeric_df.columns)
        
        print(f"🔢 Numeric columns after filtering: {len(numeric_columns)}")
        print(f"📋 Numeric columns: {numeric_columns}")
        
        if numeric_df.shape[1] < 2:
            non_numeric = [col for col in all_columns if col not in numeric_columns]
            print(f"❌ Non-numeric columns filtered out: {non_numeric}")
            raise ValueError(f"Need at least 2 numeric columns for Spearman correlation. Found {len(numeric_columns)} numeric columns: {numeric_columns}")
        
        corr_matrix = numeric_df.corr(method='spearman')
        # Replace NaN with 0
        corr_matrix = corr_matrix.fillna(0)
        
        print(f"✅ Correlation matrix shape: {corr_matrix.shape}")
        print(f"🎯 Correlation matrix columns: {list(corr_matrix.columns)}")
        
        return {"correlation_matrix": corr_matrix.to_dict(), "method": "spearman", "numeric_columns": numeric_columns}
    
    elif req.method == "phi_coefficient":
        # Phi coefficient for binary categorical variables
        if len(req.columns) != 2:
            raise ValueError("Phi coefficient requires exactly 2 columns")
        
        col1, col2 = req.columns[0], req.columns[1]
        crosstab = pd.crosstab(df[col1], df[col2])
        chi2, p_value, dof, expected = chi2_contingency(crosstab)
        n = crosstab.sum().sum()
        phi = np.sqrt(chi2 / n)
        
        return {
            "phi_coefficient": float(phi),
            "p_value": float(p_value),
            "columns": req.columns,
            "method": "phi_coefficient"
        }
    
    elif req.method == "cramers_v":
        # Cramér's V for categorical variables
        if len(req.columns) != 2:
            raise ValueError("Cramér's V requires exactly 2 columns")
        
        col1, col2 = req.columns[0], req.columns[1]
        crosstab = pd.crosstab(df[col1], df[col2])
        chi2, p_value, dof, expected = chi2_contingency(crosstab)
        n = crosstab.sum().sum()
        min_dim = min(crosstab.shape[0] - 1, crosstab.shape[1] - 1)
        cramers_v = np.sqrt(chi2 / (n * min_dim))
        
        return {
            "cramers_v": float(cramers_v),
            "p_value": float(p_value),
            "columns": req.columns,
            "method": "cramers_v"
        }
    
    raise ValueError("Unsupported correlation method")


async def save_correlation_results_to_db(
    df: pd.DataFrame, correlation_results: dict, file_path: str
) -> Optional[str]:
    """Persist correlation results in MongoDB.

    If MongoDB is not reachable or authentication fails, the error is
    logged and ``None`` is returned so that correlation analysis can
    continue without interruption.
    """
    document = {
        "source_path": file_path,
        "rows": len(df),
        "results": correlation_results,
        "created_at": datetime.utcnow(),
    }

    try:
        result = await correlation_coll.insert_one(document)
        return str(result.inserted_id)
    except PyMongoError as e:
        # Log the error but don't fail the entire operation
        print(f"⚠️ correlation MongoDB insert failed: {e}")
        return None


# Import schemas for filter functions
from .schema import IdentifierFilter, MeasureFilter


def apply_identifier_filters(df: pd.DataFrame, identifier_filters: List[IdentifierFilter]) -> pd.DataFrame:
    """Apply identifier value filters to dataframe"""
    for filter_item in identifier_filters:
        if filter_item.column in df.columns:
            df = df[df[filter_item.column].isin(filter_item.values)]
    return df


def apply_measure_filters(df: pd.DataFrame, measure_filters: List[MeasureFilter]) -> pd.DataFrame:
    """Apply measure value filters to dataframe"""
    for filter_item in measure_filters:
        if filter_item.column in df.columns:
            col = df[filter_item.column]
            
            if filter_item.operator == "eq":
                df = df[col == filter_item.value]
            elif filter_item.operator == "gt":
                df = df[col > filter_item.value]
            elif filter_item.operator == "lt":
                df = df[col < filter_item.value]
            elif filter_item.operator == "gte":
                df = df[col >= filter_item.value]
            elif filter_item.operator == "lte":
                df = df[col <= filter_item.value]
            elif filter_item.operator == "between":
                df = df[(col >= filter_item.min_value) & (col <= filter_item.max_value)]
    
    return df


async def get_unique_values(file_path: str, column: str, limit: int = 100) -> List[Any]:
    """Get unique values for a specific column"""
    df = await load_csv_from_minio(file_path)
    
    if column not in df.columns:
        raise HTTPException(404, f"Column '{column}' not found")
    
    unique_values = df[column].dropna().unique()[:limit]
    return unique_values.tolist()


async def save_filtered_data_to_minio(df: pd.DataFrame, original_path: str, filter_name: str) -> str:
    """Save filtered dataframe as a new file in MinIO"""
    bucket_name, object_path = parse_minio_path(original_path)
    
    # Create new path for filtered file
    base_name = object_path.rsplit('.', 1)[0]
    filtered_path = f"filtered/{base_name}-{filter_name}.arrow"

    # Convert dataframe to Arrow and save to MinIO
    table = pa.Table.from_pandas(df)
    sink = io.BytesIO()
    with ipc.new_file(sink, table.schema) as writer:
        writer.write_table(table)
    arrow_bytes = sink.getvalue()
    minio_client.put_object(
        bucket_name,
        filtered_path,
        io.BytesIO(arrow_bytes),
        len(arrow_bytes),
        content_type="application/vnd.apache.arrow.file",
    )

    return f"{bucket_name}/{filtered_path}"


async def load_dataframe_from_flight(file_path: str) -> pd.DataFrame:
    """
    Load dataframe using Arrow Flight for better performance
    with large datasets common in correlation analysis
    """
    try:
        # For now, fallback to MinIO - Arrow Flight integration can be added later
        # This provides a clean interface for future enhancement
        return await load_csv_from_minio(file_path)
    except Exception as e:
        raise HTTPException(500, f"Failed to load dataframe via flight: {str(e)}")


def analyze_dataframe_for_correlation(df: pd.DataFrame) -> dict:
    """
    Analyze dataframe to extract correlation-relevant information
    """
    numeric_cols = df.select_dtypes(include=[np.number]).columns.tolist()
    categorical_cols = df.select_dtypes(include=['object', 'category']).columns.tolist()
    date_cols = df.select_dtypes(include=['datetime64']).columns.tolist()
    
    # Basic statistics for numeric columns
    numeric_stats = {}
    for col in numeric_cols:
        numeric_stats[col] = {
            "mean": float(df[col].mean()),
            "std": float(df[col].std()),
            "min": float(df[col].min()),
            "max": float(df[col].max()),
            "null_count": int(df[col].isnull().sum())
        }
    
    return {
        "numeric_columns": numeric_cols,
        "categorical_columns": categorical_cols, 
        "date_columns": date_cols,
        "numeric_stats": numeric_stats,
        "total_rows": len(df),
        "total_columns": len(df.columns)
    }


# ─── Date Analysis Functions ─────────────────────────────────────────────
def analyze_date_columns(df: pd.DataFrame) -> Dict[str, Any]:
    """Analyze date columns and ranges in a dataframe"""
    from .schema import DateColumnInfo
    
    date_info = {
        "has_date_data": False,
        "date_columns": [],
        "overall_date_range": None,
        "recommended_granularity": "monthly",
        "date_format_detected": "YYYY-MM-DD"
    }
    
    potential_date_cols = []
    
    # 1. PRIORITY: Check for explicit datetime columns first
    datetime_cols = []
    for col in df.columns:
        if df[col].dtype.name.startswith('datetime'):
            datetime_cols.append(col)
            print(f"🗓️ Found explicit datetime column: {col}")
    
    # 2. PRIORITY: Look for exact "Date" column name (case-insensitive but exact match)
    exact_date_cols = []
    for col in df.columns:
        if col.lower() == 'date':
            exact_date_cols.append(col)
            print(f"🎯 Found exact 'Date' column: {col}")
    
    # 3. Look for other common exact date column names
    common_date_names = ['datetime', 'timestamp', 'created_at', 'updated_at', 'date_time']
    common_date_cols = []
    for col in df.columns:
        if col.lower() in common_date_names:
            common_date_cols.append(col)
            print(f"📅 Found common date column: {col}")
    
    # 4. Look for columns that START with date-related keywords (not just contain them)
    prefix_date_cols = []
    date_prefixes = ['date_', 'time_', 'timestamp_']
    for col in df.columns:
        col_lower = col.lower()
        if any(col_lower.startswith(prefix) for prefix in date_prefixes):
            prefix_date_cols.append(col)
            print(f"🏷️ Found prefixed date column: {col}")
    
    # 5. LAST RESORT: Check for year/month/day numeric columns for reconstruction
    numeric_date_cols = []
    year_month_day_patterns = [
        ('year', 'month', 'day'),
        ('yyyy', 'mm', 'dd'),
        ('yr', 'mon', 'day')
    ]
    
    for year_pattern, month_pattern, day_pattern in year_month_day_patterns:
        year_cols = [col for col in df.columns if year_pattern in col.lower()]
        month_cols = [col for col in df.columns if month_pattern in col.lower()]
        day_cols = [col for col in df.columns if day_pattern in col.lower()]
        
        if year_cols and month_cols:  # Day is optional
            print(f"📊 Found date component columns: Year={year_cols}, Month={month_cols}, Day={day_cols}")
            # We'll create a synthetic date column from these components
            numeric_date_cols.extend([f"SYNTHETIC_DATE_FROM_{year_cols[0]}_{month_cols[0]}"])
    
    # Prioritize columns in order of preference
    potential_date_cols = (
        datetime_cols +           # Highest priority: already datetime
        exact_date_cols +         # High priority: exact "Date" match
        common_date_cols +        # Medium priority: common date names
        prefix_date_cols +        # Lower priority: prefixed names
        numeric_date_cols         # Lowest priority: reconstructed from components
    )
    
    # Remove duplicates while preserving order
    seen = set()
    unique_potential_cols = []
    for col in potential_date_cols:
        if col not in seen:
            seen.add(col)
            unique_potential_cols.append(col)
    
    potential_date_cols = unique_potential_cols
    
    # 6. Only check object columns for date-like content if we haven't found obvious date columns
    if not potential_date_cols:
        print("⚠️ No obvious date columns found, checking object columns for date-like content...")
        for col in df.select_dtypes(include=['object']).columns:
            if _is_likely_date_column(df[col]):
                potential_date_cols.append(col)
                print(f"🔍 Object column appears to contain dates: {col}")
    
    print(f"🔍 Final potential date columns (in priority order): {potential_date_cols}")
    
    # Analyze each potential date column
    for col in potential_date_cols:
        if col.startswith("SYNTHETIC_DATE_FROM_"):
            # Handle synthetic date column reconstruction
            col_analysis = _create_synthetic_date_column(df, col)
        else:
            col_analysis = _analyze_single_date_column(df[col])
        
        if col_analysis["is_valid_date"]:
            date_info["date_columns"].append(col_analysis)
    
    if date_info["date_columns"]:
        date_info["has_date_data"] = True
        date_info = _calculate_overall_date_metrics(date_info)
    
    print(f"✅ Date analysis complete: {len(date_info['date_columns'])} valid date columns found")
    return date_info
    
    if date_info["date_columns"]:
        date_info["has_date_data"] = True
        date_info = _calculate_overall_date_metrics(date_info)
    
    print(f"✅ Date analysis complete: {len(date_info['date_columns'])} valid date columns found")
    return date_info


def _is_likely_date_column(series: pd.Series) -> bool:
    """Check if a series looks like it contains dates - more strict validation"""
    if len(series) == 0:
        return False
    
    # Sample up to 20 non-null values
    sample_values = series.dropna().head(20)
    if len(sample_values) == 0:
        return False
    
    successful_parses = 0
    date_like_patterns = 0
    
    # Check for common date patterns
    date_patterns = [
        # DateTime patterns (with time component)
        r'\d{1,2}\/\d{1,2}\/\d{4}\s+\d{1,2}:\d{2}:\d{2}',  # DD/MM/YYYY HH:MM:SS
        r'\d{4}-\d{1,2}-\d{1,2}\s+\d{1,2}:\d{2}:\d{2}',     # YYYY-MM-DD HH:MM:SS
        r'\d{1,2}-\d{1,2}-\d{4}\s+\d{1,2}:\d{2}:\d{2}',     # DD-MM-YYYY HH:MM:SS
        r'\d{4}\/\d{1,2}\/\d{1,2}\s+\d{1,2}:\d{2}:\d{2}',   # YYYY/MM/DD HH:MM:SS
        r'\d{1,2}\/\d{1,2}\/\d{4}\s+\d{1,2}:\d{2}',         # DD/MM/YYYY HH:MM
        
        # Date-only patterns
        r'\d{1,2}\/\d{1,2}\/\d{4}',      # DD/MM/YYYY or MM/DD/YYYY
        r'\d{4}-\d{1,2}-\d{1,2}',        # YYYY-MM-DD
        r'\d{1,2}-\d{1,2}-\d{4}',        # DD-MM-YYYY or MM-DD-YYYY
        r'\d{4}\/\d{1,2}\/\d{1,2}',      # YYYY/MM/DD
        r'\d{1,2}\s\w{3}\s\d{4}',        # DD MMM YYYY
        r'\w{3}\s\d{1,2},?\s\d{4}',      # MMM DD, YYYY
    ]
    
    import re
    
    for value in sample_values:
        str_value = str(value).strip()
        
        # Skip if it's just a number (likely not a date)
        if str_value.replace('.', '').replace('-', '').isdigit() and len(str_value) < 8:
            continue
            
        # Check if it matches common date patterns
        pattern_matched = any(re.match(pattern, str_value) for pattern in date_patterns)
        if pattern_matched:
            date_like_patterns += 1
        
        # Try parsing as date
        try:
            parsed_date = pd.to_datetime(str_value, errors='raise')
            # Additional validation: check if the parsed date is reasonable
            if parsed_date.year >= 1900 and parsed_date.year <= 2100:
                successful_parses += 1
        except (ValueError, TypeError):
            continue
    
    # Require both pattern matching and successful parsing
    pattern_success_rate = date_like_patterns / len(sample_values)
    parse_success_rate = successful_parses / len(sample_values)
    
    print(f"🔍 Date validation - Pattern matches: {pattern_success_rate:.2%}, Parse success: {parse_success_rate:.2%}")
    
    # More strict: require high success rate for both criteria
    return pattern_success_rate > 0.8 and parse_success_rate > 0.8


def _create_synthetic_date_column(df: pd.DataFrame, synthetic_col_name: str) -> Dict[str, Any]:
    """Create a synthetic date column from year/month/day components"""
    result = {
        "column_name": synthetic_col_name,
        "min_date": None,
        "max_date": None,
        "format_detected": "YYYY-MM-DD",
        "granularity": "daily",
        "sample_values": [],
        "is_valid_date": False
    }
    
    try:
        # Extract component column names from synthetic name
        parts = synthetic_col_name.replace("SYNTHETIC_DATE_FROM_", "").split("_")
        if len(parts) < 2:
            return result
            
        year_col = parts[0]
        month_col = parts[1]
        day_col = parts[2] if len(parts) > 2 else None
        
        # Check if these columns exist
        if year_col not in df.columns or month_col not in df.columns:
            return result
        
        # Create synthetic dates
        year_data = df[year_col]
        month_data = df[month_col]
        day_data = df[day_col] if day_col and day_col in df.columns else 1  # Default to 1st day
        
        # Build date strings
        synthetic_dates = []
        for i in range(len(df)):
            try:
                year = int(year_data.iloc[i]) if pd.notna(year_data.iloc[i]) else 2000
                month = int(month_data.iloc[i]) if pd.notna(month_data.iloc[i]) else 1
                day = int(day_data.iloc[i] if hasattr(day_data, 'iloc') else day_data) if pd.notna(day_data) else 1
                
                # Validate ranges
                if 1900 <= year <= 2100 and 1 <= month <= 12 and 1 <= day <= 31:
                    date_obj = pd.Timestamp(year=year, month=month, day=day)
                    synthetic_dates.append(date_obj)
                else:
                    synthetic_dates.append(pd.NaT)
            except (ValueError, TypeError):
                synthetic_dates.append(pd.NaT)
        
        # Convert to series for analysis
        synthetic_series = pd.Series(synthetic_dates)
        valid_dates = synthetic_series.dropna()
        
        if len(valid_dates) > 0:
            result.update({
                "min_date": valid_dates.min().strftime("%Y-%m-%d"),
                "max_date": valid_dates.max().strftime("%Y-%m-%d"),
                "is_valid_date": True,
                "sample_values": [d.strftime("%Y-%m-%d") for d in valid_dates.head(5)],
                "granularity": _detect_granularity(valid_dates)
            })
            
            print(f"✅ Successfully created synthetic date column from {year_col}, {month_col}, {day_col}")
        
    except Exception as e:
        print(f"⚠️ Failed to create synthetic date column: {e}")
    
    return result


def _analyze_single_date_column(series: pd.Series) -> Dict[str, Any]:
    """Analyze a single date column for format, range, granularity"""
    result = {
        "column_name": series.name,
        "min_date": None,
        "max_date": None,
        "format_detected": "YYYY-MM-DD",
        "granularity": "irregular",
        "sample_values": [],
        "is_valid_date": False
    }
    
    try:
        # Convert to datetime with improved handling
        if series.dtype.name.startswith('datetime'):
            date_series = series
            print(f"📅 Column {series.name} is already datetime type")
        else:
            print(f"🔄 Converting column {series.name} to datetime...")
            # Try multiple datetime conversion strategies
            date_series = None
            
            # Strategy 1: Direct pandas conversion with inference
            try:
                date_series = pd.to_datetime(series, errors='coerce', infer_datetime_format=True)
                successful_conversions = date_series.notna().sum()
                print(f"✅ Strategy 1 success: {successful_conversions}/{len(series)} conversions")
            except Exception as e:
                print(f"⚠️ Strategy 1 failed: {e}")
            
            # Strategy 2: Handle specific datetime formats if strategy 1 didn't work well
            if date_series is None or date_series.notna().sum() < len(series) * 0.8:
                print("🔄 Trying specific format parsing...")
                
                # Common datetime formats to try
                datetime_formats = [
                    '%d/%m/%Y %H:%M:%S',     # 23/12/2021 00:00:00
                    '%d/%m/%Y',              # 23/12/2021
                    '%m/%d/%Y %H:%M:%S',     # 12/23/2021 00:00:00
                    '%m/%d/%Y',              # 12/23/2021
                    '%Y-%m-%d %H:%M:%S',     # 2021-12-23 00:00:00
                    '%Y-%m-%d',              # 2021-12-23
                    '%d-%m-%Y %H:%M:%S',     # 23-12-2021 00:00:00
                    '%d-%m-%Y',              # 23-12-2021
                    '%Y/%m/%d %H:%M:%S',     # 2021/12/23 00:00:00
                    '%Y/%m/%d',              # 2021/12/23
                ]
                
                best_format = None
                best_series = None
                best_success_rate = 0
                
                for fmt in datetime_formats:
                    try:
                        test_series = pd.to_datetime(series, format=fmt, errors='coerce')
                        success_rate = test_series.notna().sum() / len(series)
                        print(f"📊 Format {fmt}: {success_rate:.2%} success rate")
                        
                        if success_rate > best_success_rate:
                            best_success_rate = success_rate
                            best_series = test_series
                            best_format = fmt
                    except Exception:
                        continue
                
                if best_series is not None and best_success_rate > 0.7:
                    date_series = best_series
                    result["format_detected"] = best_format
                    print(f"✅ Best format found: {best_format} with {best_success_rate:.2%} success")
                else:
                    # Fall back to coerce method
                    date_series = pd.to_datetime(series, errors='coerce')
                    print(f"⚠️ Falling back to coerce method")
        
        # Remove NaT values
        valid_dates = date_series.dropna()
        
        if len(valid_dates) == 0:
            print(f"❌ No valid dates found in column {series.name}")
            return result
        
        conversion_rate = len(valid_dates) / len(series)
        print(f"📊 Date conversion success: {len(valid_dates)}/{len(series)} ({conversion_rate:.2%})")
        
        # Require at least 70% successful conversion for a valid date column
        if conversion_rate < 0.7:
            print(f"⚠️ Low conversion rate ({conversion_rate:.2%}) - not considering as date column")
            return result
        
        # Get date range
        min_date = valid_dates.min()
        max_date = valid_dates.max()
        
        # Validate date range is reasonable
        if min_date.year < 1900 or max_date.year > 2100:
            print(f"⚠️ Date range seems unrealistic: {min_date} to {max_date}")
            return result
        
        result.update({
            "min_date": min_date.strftime("%Y-%m-%d"),
            "max_date": max_date.strftime("%Y-%m-%d"),
            "is_valid_date": True
        })
        
        # Detect format from original values (if not already detected)
        if result["format_detected"] == "YYYY-MM-DD" and not series.dtype.name.startswith('datetime'):
            detected_format = _detect_date_format(series.dropna().head(10))
            result["format_detected"] = detected_format
        
        # Detect granularity
        result["granularity"] = _detect_granularity(valid_dates)
        
        # Get sample values - show both original and converted
        sample_size = min(5, len(valid_dates))
        sample_dates = valid_dates.head(sample_size)
        result["sample_values"] = [d.strftime("%Y-%m-%d") for d in sample_dates]
        
        print(f"✅ Successfully analyzed date column {series.name}: {min_date.strftime('%Y-%m-%d')} to {max_date.strftime('%Y-%m-%d')}")
        
    except Exception as e:
        print(f"💥 Error analyzing date column {series.name}: {e}")
        import traceback
        print(f"🔍 Traceback: {traceback.format_exc()}")
    
    return result


def _detect_date_format(sample_values) -> str:
    """Detect the most common date format in sample values"""
    formats_to_try = [
        # DateTime formats (with time component)
        "%d/%m/%Y %H:%M:%S",    # 23/12/2021 00:00:00
        "%m/%d/%Y %H:%M:%S",    # 12/23/2021 00:00:00
        "%Y-%m-%d %H:%M:%S",    # 2021-12-23 00:00:00
        "%d-%m-%Y %H:%M:%S",    # 23-12-2021 00:00:00
        "%Y/%m/%d %H:%M:%S",    # 2021/12/23 00:00:00
        "%d/%m/%Y %H:%M",       # 23/12/2021 00:00
        "%m/%d/%Y %H:%M",       # 12/23/2021 00:00
        "%Y-%m-%d %H:%M",       # 2021-12-23 00:00
        
        # Date-only formats
        "%d/%m/%Y",             # 23/12/2021
        "%m/%d/%Y",             # 12/23/2021
        "%Y-%m-%d",             # 2021-12-23
        "%d-%m-%Y",             # 23-12-2021
        "%Y/%m/%d",             # 2021/12/23
        "%b %d, %Y",            # Dec 23, 2021
        "%d %b %Y",             # 23 Dec 2021
        "%B %d, %Y",            # December 23, 2021
        
        # Partial date formats
        "%Y-%m",                # 2021-12 (year-month)
        "%Y",                   # 2021 (year only)
        "%m/%Y",                # 12/2021 (month/year)
    ]
    
    format_scores = {}
    total_samples = len(sample_values)
    
    print(f"🔍 Analyzing {total_samples} sample values for date format detection...")
    
    for fmt in formats_to_try:
        score = 0
        for value in sample_values:
            try:
                parsed = pd.to_datetime(str(value), format=fmt, errors='raise')
                # Additional validation: check if year is reasonable
                if 1900 <= parsed.year <= 2100:
                    score += 1
            except (ValueError, TypeError):
                continue
        
        if score > 0:
            success_rate = score / total_samples
            format_scores[fmt] = score
            print(f"📊 Format {fmt}: {score}/{total_samples} matches ({success_rate:.2%})")
    
    if not format_scores:
        print("⚠️ No format matched the sample values, using default")
        return "%Y-%m-%d"
    
    # Return format with highest score
    best_format = max(format_scores, key=format_scores.get)
    best_score = format_scores[best_format]
    success_rate = best_score / total_samples
    
    print(f"✅ Best format detected: {best_format} with {success_rate:.2%} success rate")
    return best_format


def _detect_granularity(date_series: pd.Series) -> str:
    """Detect if data is daily, monthly, yearly based on patterns"""
    if len(date_series) < 2:
        return "irregular"
    
    # Sort dates and calculate differences
    sorted_dates = date_series.sort_values()
    differences = sorted_dates.diff().dropna()
    
    if len(differences) == 0:
        return "irregular"
    
    # Analyze the differences
    avg_diff_days = differences.dt.days.mean()
    
    if 0.8 <= avg_diff_days <= 1.2:
        return "daily"
    elif 28 <= avg_diff_days <= 31:
        return "monthly"
    elif 88 <= avg_diff_days <= 95:  # ~3 months
        return "quarterly"
    elif 360 <= avg_diff_days <= 370:
        return "yearly"
    else:
        return "irregular"


def _calculate_overall_date_metrics(date_info: Dict[str, Any]) -> Dict[str, Any]:
    """Calculate overall date range and recommended granularity"""
    if not date_info["date_columns"]:
        return date_info
    
    # Find overall date range across all date columns
    all_min_dates = []
    all_max_dates = []
    granularities = []
    
    for col_info in date_info["date_columns"]:
        if col_info["min_date"]:
            all_min_dates.append(pd.to_datetime(col_info["min_date"]))
        if col_info["max_date"]:
            all_max_dates.append(pd.to_datetime(col_info["max_date"]))
        granularities.append(col_info["granularity"])
    
    if all_min_dates and all_max_dates:
        overall_min = min(all_min_dates)
        overall_max = max(all_max_dates)
        
        date_info["overall_date_range"] = {
            "min_date": overall_min.strftime("%Y-%m-%d"),
            "max_date": overall_max.strftime("%Y-%m-%d")
        }
    
    # Determine recommended granularity (most common or finest available)
    if granularities:
        granularity_priority = {"daily": 4, "monthly": 3, "quarterly": 2, "yearly": 1, "irregular": 0}
        best_granularity = max(granularities, key=lambda g: granularity_priority.get(g, 0))
        date_info["recommended_granularity"] = best_granularity
    
    return date_info


def apply_date_range_filter(df: pd.DataFrame, date_column: str, date_range: Dict[str, str]) -> pd.DataFrame:
    """Apply date range filter to dataframe"""
    if date_column not in df.columns:
        raise ValueError(f"Date column '{date_column}' not found in dataframe")
    
    try:
        # Convert column to datetime if not already
        if not df[date_column].dtype.name.startswith('datetime'):
            date_col = pd.to_datetime(df[date_column], errors='coerce')
        else:
            date_col = df[date_column]
        
        # Parse filter dates
        start_date = pd.to_datetime(date_range.get("start"))
        end_date = pd.to_datetime(date_range.get("end"))
        
        # Apply filter
        mask = (date_col >= start_date) & (date_col <= end_date)
        filtered_df = df[mask].copy()
        
        print(f"🗓️ Date filter applied: {len(df)} → {len(filtered_df)} rows")
        return filtered_df
        
    except Exception as e:
        print(f"⚠️ Date filtering failed: {e}")
        return df


def apply_time_aggregation(df: pd.DataFrame, date_column: str, level: str) -> pd.DataFrame:
    """Aggregate dataframe by time period"""
    if level.lower() == 'none':
        return df
    if date_column not in df.columns:
        raise ValueError(f"Date column '{date_column}' not found in dataframe")

    freq_map = {
        'daily': 'D',
        'weekly': 'W',
        'monthly': 'M',
        'quarterly': 'Q',
        'yearly': 'Y',
    }
    freq = freq_map.get(level.lower())
    if not freq:
        return df

    df = df.copy()
    df[date_column] = pd.to_datetime(df[date_column], errors='coerce')
    df = df.dropna(subset=[date_column])
    aggregated = df.set_index(date_column).resample(freq).mean(numeric_only=True).reset_index()
    print(f"⏱️ Aggregated {len(df)} → {len(aggregated)} rows using {level}")
    return aggregated


# ─── Time Series Functions ──────────────────────────────────────────────
def get_time_series_axis_data(df: pd.DataFrame, start_date: str = None, end_date: str = None) -> Dict[str, Any]:
    """Get X-axis data for time series - datetime values or indices"""
    try:
        print(f"📊 Analyzing axis data for dataframe: {df.shape}")
        
        # Analyze date columns
        date_analysis = analyze_date_columns(df)
        
        if date_analysis['has_date_data'] and date_analysis['date_columns']:
            # Use first valid date column
            date_col_info = date_analysis['date_columns'][0]
            datetime_column = date_col_info['column_name']
            
            print(f"🗓️ Using datetime column: {datetime_column}")
            
            # Convert to datetime and ensure unique, sorted dates
            date_col = pd.to_datetime(df[datetime_column], errors="coerce")
            valid_dates = (
                date_col.dropna()
                .sort_values()
                .drop_duplicates()
            )
            
            # Apply date filtering if provided
            if start_date and end_date:
                try:
                    start_dt = pd.to_datetime(start_date)
                    end_dt = pd.to_datetime(end_date)
                    valid_dates = valid_dates[(valid_dates >= start_dt) & (valid_dates <= end_dt)]
                    print(f"🗓️ Date filtering applied: {len(valid_dates)} rows")
                except Exception as e:
                    print(f"⚠️ Date filtering failed: {e}")
            
            # Convert to ISO strings for JSON serialization
            x_values = [dt.isoformat() for dt in valid_dates]
            
            return {
                "x_values": x_values,
                "has_datetime": True,
                "datetime_column": datetime_column,
                "total_rows": len(x_values),
                "date_range": {
                    "min_date": valid_dates.min().isoformat() if len(valid_dates) > 0 else None,
                    "max_date": valid_dates.max().isoformat() if len(valid_dates) > 0 else None
                }
            }
        else:
            # No datetime columns - use indices
            print(f"📊 No datetime columns found, using indices")
            
            # Apply row filtering if dates are provided (fallback behavior)
            total_rows = len(df)
            start_idx = 0
            end_idx = total_rows
            
            if start_date and end_date:
                try:
                    # Try to interpret as row indices
                    start_idx = max(0, int(start_date) if start_date.isdigit() else 0)
                    end_idx = min(total_rows, int(end_date) if end_date.isdigit() else total_rows)
                except:
                    pass
            
            x_values = list(range(start_idx, end_idx))
            
            return {
                "x_values": x_values,
                "has_datetime": False,
                "datetime_column": None,
                "total_rows": len(x_values),
                "date_range": None
            }
            
    except Exception as e:
        print(f"💥 Axis data error: {e}")
        # Fallback to indices
        return {
            "x_values": list(range(len(df))),
            "has_datetime": False,
            "datetime_column": None,
            "total_rows": len(df),
            "date_range": None
        }


def find_highest_correlation_pair(df: pd.DataFrame, method: str = 'pearson') -> Dict[str, Any]:
    """Find the two columns with the highest correlation coefficient"""
    try:
        print(f"🔍 Finding highest correlation pair using {method}")
        
        # Get numeric columns only
        numeric_df = df.select_dtypes(include=[np.number])
        numeric_columns = list(numeric_df.columns)
        
        print(f"🔢 Found {len(numeric_columns)} numeric columns")
        
        if len(numeric_columns) < 2:
            raise ValueError(f"Need at least 2 numeric columns for correlation. Found {len(numeric_columns)}")
        
        # Calculate correlation matrix
        corr_matrix = numeric_df.corr(method=method)
        
        # Find highest correlation (excluding diagonal)
        # Set diagonal to NaN to exclude self-correlations
        np.fill_diagonal(corr_matrix.values, np.nan)
        
        # Find the maximum absolute correlation
        max_corr = 0
        max_pair = (numeric_columns[0], numeric_columns[1])
        
        for i, col1 in enumerate(numeric_columns):
            for j, col2 in enumerate(numeric_columns):
                if i < j:  # Only check upper triangle
                    corr_val = corr_matrix.loc[col1, col2]
                    if not pd.isna(corr_val) and abs(corr_val) > abs(max_corr):
                        max_corr = corr_val
                        max_pair = (col1, col2)
        
        print(f"🎯 Highest correlation: {max_pair[0]} - {max_pair[1]} = {max_corr:.3f}")
        
        return {
            "column1": max_pair[0],
            "column2": max_pair[1],
            "correlation_value": float(max_corr),
            "method": method
        }
        
    except Exception as e:
        print(f"💥 Correlation pair error: {e}")
        # Fallback to first two numeric columns
        numeric_columns = df.select_dtypes(include=[np.number]).columns.tolist()
        if len(numeric_columns) >= 2:
            return {
                "column1": numeric_columns[0],
                "column2": numeric_columns[1],
                "correlation_value": 0.0,
                "method": method
            }
        else:
            raise ValueError("No numeric columns available for correlation")


def get_filtered_time_series_values(
    df: pd.DataFrame, 
    column1: str, 
    column2: str, 
    datetime_column: str = None,
    start_date: str = None, 
    end_date: str = None
) -> Dict[str, Any]:
    """Get Y-axis values for time series with date averaging for duplicates"""
    try:
        print(f"📈 Getting time series values: {column1} vs {column2}")
        
        # Validate columns exist
        if column1 not in df.columns:
            raise ValueError(f"Column '{column1}' not found in dataframe")
        if column2 not in df.columns:
            raise ValueError(f"Column '{column2}' not found in dataframe")
        
        # Start with full dataframe
        working_df = df.copy()
        has_duplicates_averaged = False
        
        # Apply date filtering if datetime column and dates provided
        if datetime_column and datetime_column in df.columns and start_date and end_date:
            try:
                print(f"🗓️ Applying date filter using column: {datetime_column}")
                date_col = pd.to_datetime(working_df[datetime_column], errors='coerce')
                start_dt = pd.to_datetime(start_date)
                end_dt = pd.to_datetime(end_date)
                
                mask = (date_col >= start_dt) & (date_col <= end_dt)
                working_df = working_df[mask].copy()
                print(f"🗓️ Date filter applied: {len(df)} → {len(working_df)} rows")
            except Exception as e:
                print(f"⚠️ Date filtering failed: {e}")
        
        # Handle duplicate dates by averaging if datetime column exists
        if datetime_column and datetime_column in working_df.columns:
            try:
                print(f"📊 Checking for duplicate dates in {datetime_column}")
                
                # Convert datetime column
                working_df[datetime_column] = pd.to_datetime(working_df[datetime_column], errors='coerce')
                
                # Check for duplicates
                date_counts = working_df[datetime_column].value_counts()
                duplicates = date_counts[date_counts > 1]
                
                if len(duplicates) > 0:
                    print(f"📊 Found {len(duplicates)} dates with duplicates, averaging values")
                    has_duplicates_averaged = True
                    
                    # Group by date and average the numeric columns
                    averaged_df = working_df.groupby(datetime_column).agg({
                        column1: 'mean',
                        column2: 'mean'
                    }).reset_index()
                    
                    # Sort by date
                    averaged_df = averaged_df.sort_values(datetime_column)
                    working_df = averaged_df
                    
                    print(f"📊 After averaging: {len(working_df)} unique dates")
                
            except Exception as e:
                print(f"⚠️ Date averaging failed: {e}")
        
        # Extract numeric values for the specified columns while preserving index alignment
        col1_series = pd.to_numeric(working_df[column1], errors="coerce")
        col2_series = pd.to_numeric(working_df[column2], errors="coerce")

        # Ensure both lists have same length and replace NaN with None for JSON serialization
        min_length = min(len(col1_series), len(col2_series))
        col1_values = [
            (v if pd.notna(v) else None)
            for v in col1_series.iloc[:min_length].tolist()
        ]
        col2_values = [
            (v if pd.notna(v) else None)
            for v in col2_series.iloc[:min_length].tolist()
        ]
        
        print(f"✅ Extracted {len(col1_values)} value pairs")
        
        return {
            "column1_values": col1_values,
            "column2_values": col2_values,
            "column1_name": column1,
            "column2_name": column2,
            "filtered_rows": len(col1_values),
            "has_duplicates_averaged": has_duplicates_averaged
        }
        
    except Exception as e:
        print(f"💥 Time series values error: {e}")
        raise ValueError(f"Failed to get time series values: {str(e)}")
