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


# Initialize MinIO client (only once)
minio_client = Minio(
    settings.minio_url,
    access_key=settings.minio_access_key,
    secret_key=settings.minio_secret_key,
    secure=settings.minio_secure,
)


def parse_minio_path(file_path: str) -> tuple[str, str]:
    """Parse MinIO path into bucket and object path
    For correlation service, the bucket is always 'trinity' and 
    the entire file_path is the object path within that bucket
    """
    # The bucket is always 'trinity' for correlation service
    bucket_name = "trinity"
    object_path = file_path.strip('/')
    
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


def save_correlation_results_to_minio(df: pd.DataFrame, correlation_results: dict, file_path: str) -> str:
    """Save correlation results to MinIO"""
    bucket_name, object_path = parse_minio_path(file_path)
    
    # Create output path
    base_name = object_path.rsplit('.', 1)[0]
    out_path = f"correlations/{base_name}-correlations.json"
    
    # Save to MinIO as JSON
    json_bytes = json.dumps(correlation_results, indent=2).encode()
    minio_client.put_object(bucket_name, out_path, io.BytesIO(json_bytes), len(json_bytes))
    
    return f"{bucket_name}/{out_path}"


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
    filtered_path = f"filtered/{base_name}-{filter_name}.csv"
    
    # Save to MinIO
    csv_bytes = df.to_csv(index=False).encode()
    minio_client.put_object(bucket_name, filtered_path, io.BytesIO(csv_bytes), len(csv_bytes))
    
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
