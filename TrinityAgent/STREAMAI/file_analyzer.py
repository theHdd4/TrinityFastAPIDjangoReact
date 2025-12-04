"""
File Analyzer for TrinityAI Agents
==================================

This module provides comprehensive file analysis capabilities for TrinityAI agents.
It reads files from MinIO, analyzes their structure, and generates detailed JSON
metadata including column descriptions and unique values for RAG purposes.

Author: Quant Matrix AI Solutions
"""

import os
import json
import logging
import io
from typing import Dict, List, Any, Optional, Union
from pathlib import Path
import pandas as pd
import pyarrow as pa
import pyarrow.parquet as pq
import pyarrow.feather as pf
from minio import Minio
from minio.error import S3Error
import numpy as np

# Configure logging
logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)


class FileAnalyzer:
    """
    Comprehensive file analyzer for TrinityAI agents that reads files from MinIO
    and generates detailed metadata for RAG purposes.
    """
    
    def __init__(
        self,
        minio_endpoint: str,
        access_key: str,
        secret_key: str,
        bucket: str,
        prefix: str = "",
        secure: bool = True
    ):
        """
        Initialize the FileAnalyzer with MinIO connection parameters.
        
        Args:
            minio_endpoint: MinIO server endpoint
            access_key: MinIO access key
            secret_key: MinIO secret key
            bucket: MinIO bucket name
            prefix: Prefix for file filtering (optional)
            secure: Use HTTPS connection (default: True)
        """
        self.minio_endpoint = minio_endpoint
        self.access_key = access_key
        self.secret_key = secret_key
        self.bucket = bucket
        self.prefix = prefix
        self.secure = secure
        
        # Initialize MinIO client
        try:
            self.minio_client = Minio(
                endpoint=minio_endpoint,
                access_key=access_key,
                secret_key=secret_key,
                secure=secure
            )
        except (TypeError, ValueError):
            self.minio_client = Minio(
                minio_endpoint,
                access_key=access_key,
                secret_key=secret_key,
                secure=secure
            )
        
        # Storage for analyzed files
        self.analyzed_files: Dict[str, Dict[str, Any]] = {}
        self.analyzed_files_by_object: Dict[str, Dict[str, Any]] = {}
        
        logger.info(f"FileAnalyzer initialized for bucket '{bucket}' with prefix '{prefix}'")
    
    def analyze_files(self, file_extensions: List[str] = None) -> Dict[str, Any]:
        """
        Analyze all files in the MinIO bucket and generate comprehensive metadata.
        
        Args:
            file_extensions: List of file extensions to analyze (default: ['.arrow', '.parquet', '.feather', '.csv'])
            
        Returns:
            Dictionary containing analysis results for all files
        """
        if file_extensions is None:
            file_extensions = ['.arrow', '.parquet', '.feather', '.csv']
        
        logger.info(f"Starting file analysis for extensions: {file_extensions}")
        
        try:
            objects = self.minio_client.list_objects(
                bucket_name=self.bucket, 
                prefix=self.prefix, 
                recursive=True
            )
            
            files_analyzed = 0
            analysis_results = {
                "total_files": 0,
                "successful_analyses": 0,
                "failed_analyses": 0,
                "files": {}
            }
            
            for obj in objects:
                if not any(obj.object_name.endswith(ext) for ext in file_extensions):
                    continue
                
                analysis_results["total_files"] += 1
                filename = os.path.basename(obj.object_name)
                full_object_path = obj.object_name
                
                logger.info(f"Analyzing file: {filename}")
                
                try:
                    file_analysis = self._analyze_single_file(full_object_path, filename)
                    
                    if file_analysis:
                        analysis_results["files"][filename] = file_analysis
                        analysis_results["successful_analyses"] += 1
                        files_analyzed += 1
                        
                        self.analyzed_files[filename] = file_analysis
                        self.analyzed_files_by_object[full_object_path] = file_analysis
                    else:
                        analysis_results["failed_analyses"] += 1
                        logger.warning(f"Failed to analyze file: {filename}")
                        
                except Exception as e:
                    logger.error(f"Error analyzing file {filename}: {str(e)}")
                    analysis_results["failed_analyses"] += 1
            
            return analysis_results
            
        except S3Error as e:
            logger.error(f"MinIO error during file analysis: {str(e)}")
            return {"error": f"MinIO error: {str(e)}"}
        except Exception as e:
            logger.error(f"Unexpected error during file analysis: {str(e)}")
            return {"error": f"Unexpected error: {str(e)}"}
    
    def analyze_specific_files(self, object_paths: List[str]) -> Dict[str, Dict[str, Any]]:
        """
        Analyze a specific list of files and return metadata for each.
        
        Args:
            object_paths: List of MinIO object paths (including prefix)
        
        Returns:
            Dict[filename, analysis_dict]
        """
        results: Dict[str, Dict[str, Any]] = {}
        
        for object_path in object_paths:
            if not object_path:
                continue
            
            filename = os.path.basename(object_path)
            
            cached = self.analyzed_files_by_object.get(object_path) or self.analyzed_files.get(filename)
            if cached:
                results[filename] = cached
                continue
            
            try:
                analysis = self._analyze_single_file(object_path, filename)
                if analysis:
                    self.analyzed_files[filename] = analysis
                    self.analyzed_files_by_object[object_path] = analysis
                    results[filename] = analysis
                else:
                    logger.warning(f"Failed to analyze specific file: {object_path}")
            except Exception as exc:
                logger.error(f"Error analyzing specific file {object_path}: {exc}")
        
        return results
    
    def _analyze_single_file(self, object_path: str, filename: str) -> Optional[Dict[str, Any]]:
        """Analyze a single file and extract comprehensive metadata."""
        try:
            response = self.minio_client.get_object(bucket_name=self.bucket, object_name=object_path)
            file_data = response.read()
            response.close()
            response.release_conn()
            
            table = self._read_file_data(file_data, filename)
            
            if table is None:
                logger.warning(f"Could not read file {filename} with any supported format")
                return None
            
            df = table.to_pandas()
            
            analysis = {
                "filename": filename,
                "file_path": object_path,
                "file_size_bytes": len(file_data),
                "total_rows": len(df),
                "total_columns": len(df.columns),
                "columns": self._analyze_columns(df),
                "data_types": self._get_data_types(df),
                "missing_values": self._get_missing_values(df),
                "sample_data": self._get_sample_data(df),
                "statistical_summary": self._get_statistical_summary(df)
            }
            
            return self._convert_to_json_serializable(analysis)
            
        except Exception as e:
            logger.error(f"Error analyzing file {filename}: {str(e)}")
            return None
    
    def _read_file_data(self, file_data: bytes, filename: str) -> Optional[pa.Table]:
        """Read file data using various formats."""
        buffer = io.BytesIO(file_data)
        
        readers = [
            ("Parquet", lambda: pq.read_table(buffer)),
            ("Feather", lambda: pf.read_table(buffer)),
            ("Arrow IPC", lambda: pa.ipc.open_stream(buffer).read_all()),
            ("CSV", lambda: pa.csv.read_csv(buffer))
        ]
        
        for format_name, reader_func in readers:
            try:
                buffer.seek(0)
                table = reader_func()
                return table
            except Exception as e:
                logger.debug(f"Failed to read {filename} as {format_name}: {str(e)}")
                continue
        
        return None
    
    def _analyze_columns(self, df: pd.DataFrame) -> Dict[str, Dict[str, Any]]:
        """Analyze each column in the DataFrame."""
        columns_analysis = {}
        
        for column in df.columns:
            col_data = df[column]
            
            column_info = {
                "name": column,
                "data_type": str(col_data.dtype),
                "non_null_count": col_data.count(),
                "null_count": col_data.isnull().sum(),
                "null_percentage": round((col_data.isnull().sum() / len(col_data)) * 100, 2),
                "unique_count": col_data.nunique(),
                "unique_percentage": round((col_data.nunique() / len(col_data)) * 100, 2)
            }
            
            unique_values = col_data.dropna().unique()
            if len(unique_values) <= 100:
                column_info["unique_values"] = [str(val) for val in unique_values]
            else:
                column_info["unique_values"] = [str(val) for val in unique_values[:100]]
                column_info["unique_values_truncated"] = True
                column_info["total_unique_values"] = len(unique_values)
            
            value_counts = col_data.value_counts().head(10)
            column_info["most_frequent_values"] = {
                str(k): int(v) for k, v in value_counts.items()
            }
            
            column_info["description"] = self._generate_column_description(col_data)
            
            if pd.api.types.is_numeric_dtype(col_data):
                numeric_info = self._analyze_numeric_column(col_data)
                column_info.update(numeric_info)
            elif pd.api.types.is_categorical_dtype(col_data) or col_data.dtype == 'object':
                categorical_info = self._analyze_categorical_column(col_data)
                column_info.update(categorical_info)
            elif pd.api.types.is_datetime64_any_dtype(col_data):
                datetime_info = self._analyze_datetime_column(col_data)
                column_info.update(datetime_info)
            
            columns_analysis[column] = column_info
        
        return columns_analysis
    
    def _generate_column_description(self, col_data: pd.Series) -> str:
        """Generate a human-readable description of a column."""
        if pd.api.types.is_numeric_dtype(col_data):
            return f"Numeric column with {col_data.nunique()} unique values"
        elif pd.api.types.is_categorical_dtype(col_data):
            return f"Categorical column with {col_data.nunique()} categories"
        elif col_data.dtype == 'object':
            return f"Text column with {col_data.nunique()} unique values"
        elif pd.api.types.is_datetime64_any_dtype(col_data):
            return f"Date/time column with {col_data.nunique()} unique values"
        else:
            return f"Column with {col_data.nunique()} unique values"
    
    def _analyze_numeric_column(self, col_data: pd.Series) -> Dict[str, Any]:
        """Analyze a numeric column."""
        numeric_info = {}
        
        try:
            numeric_data = col_data.dropna()
            
            if not numeric_data.empty:
                numeric_info.update({
                    "min_value": float(numeric_data.min()),
                    "max_value": float(numeric_data.max()),
                    "mean_value": float(numeric_data.mean()),
                    "median_value": float(numeric_data.median()),
                    "std_value": float(numeric_data.std()),
                    "quartiles": {
                        "q1": float(numeric_data.quantile(0.25)),
                        "q2": float(numeric_data.quantile(0.5)),
                        "q3": float(numeric_data.quantile(0.75))
                    }
                })
        except Exception as e:
            logger.warning(f"Error analyzing numeric column: {str(e)}")
        
        return numeric_info
    
    def _analyze_categorical_column(self, col_data: pd.Series) -> Dict[str, Any]:
        """Analyze a categorical column."""
        categorical_info = {}
        
        try:
            value_counts = col_data.value_counts()
            categorical_info.update({
                "value_distribution": {
                    str(k): int(v) for k, v in value_counts.head(20).items()
                },
                "is_highly_categorical": col_data.nunique() > len(col_data) * 0.5,
                "most_common_value": str(value_counts.index[0]) if not value_counts.empty else None,
                "most_common_count": int(value_counts.iloc[0]) if not value_counts.empty else 0
            })
        except Exception as e:
            logger.warning(f"Error analyzing categorical column: {str(e)}")
        
        return categorical_info
    
    def _analyze_datetime_column(self, col_data: pd.Series) -> Dict[str, Any]:
        """Analyze a datetime column."""
        datetime_info = {}
        
        try:
            if col_data.empty:
                datetime_info.update({
                    "earliest_date": None,
                    "latest_date": None,
                    "date_range_days": None,
                    "has_time_component": False
                })
            else:
                valid_dates = col_data.dropna()
                
                if len(valid_dates) > 0:
                    min_date = valid_dates.min()
                    max_date = valid_dates.max()
                    
                    if pd.notna(min_date) and pd.notna(max_date):
                        datetime_info.update({
                            "earliest_date": str(min_date),
                            "latest_date": str(max_date),
                            "date_range_days": (max_date - min_date).days,
                            "has_time_component": any(valid_dates.dt.time != pd.Timestamp('00:00:00').time())
                        })
        except Exception as e:
            logger.warning(f"Error analyzing datetime column: {str(e)}")
        
        return datetime_info
    
    def _get_data_types(self, df: pd.DataFrame) -> Dict[str, str]:
        """Get data types for all columns."""
        return {col: str(dtype) for col, dtype in df.dtypes.items()}
    
    def _get_missing_values(self, df: pd.DataFrame) -> Dict[str, int]:
        """Get missing value counts for all columns."""
        return {col: int(df[col].isnull().sum()) for col in df.columns}
    
    def _convert_to_json_serializable(self, obj):
        """Convert numpy types to Python types."""
        try:
            if pd.isna(obj):
                return None
        except (TypeError, ValueError):
            pass
        
        if hasattr(obj, 'item'):
            try:
                return obj.item()
            except (ValueError, OverflowError):
                return str(obj)
        elif hasattr(obj, 'tolist'):
            return obj.tolist()
        elif isinstance(obj, dict):
            return {k: self._convert_to_json_serializable(v) for k, v in obj.items()}
        elif isinstance(obj, list):
            return [self._convert_to_json_serializable(item) for item in obj]
        elif isinstance(obj, (pd.Timestamp, pd.Timedelta)):
            if pd.isna(obj):
                return None
            return str(obj)
        elif hasattr(obj, 'dtype'):
            return obj.tolist()
        else:
            return obj
    
    def _get_sample_data(self, df: pd.DataFrame, n_samples: int = 5) -> Dict[str, List]:
        """Get sample data from the DataFrame."""
        sample_df = df.head(n_samples)
        result = {}
        for col in sample_df.columns:
            col_data = sample_df[col]
            if pd.api.types.is_datetime64_any_dtype(col_data):
                result[col] = [None if pd.isna(val) else str(val) for val in col_data.tolist()]
            else:
                result[col] = [None if pd.isna(val) else val for val in col_data.tolist()]
        return result
    
    def _get_statistical_summary(self, df: pd.DataFrame) -> Dict[str, Any]:
        """Get statistical summary of the DataFrame."""
        try:
            numeric_cols = df.select_dtypes(include=[np.number]).columns
            
            if len(numeric_cols) == 0:
                return {}
            
            describe_df = df[numeric_cols].describe()
            
            result = {}
            for col in numeric_cols:
                col_stats = {}
                if col in describe_df.columns:
                    for stat_name in describe_df.index:
                        stat_value = describe_df.loc[stat_name, col]
                        if pd.notna(stat_value):
                            col_stats[stat_name] = float(stat_value)
                result[col] = col_stats
            
            return result
            
        except Exception as e:
            logger.warning(f"Error generating statistical summary: {str(e)}")
            return {}
    
    def get_file_analysis(self, filename: str) -> Optional[Dict[str, Any]]:
        """Get analysis for a specific file."""
        return self.analyzed_files.get(filename) or self.analyzed_files_by_object.get(filename)
    
    def get_all_analyses(self) -> Dict[str, Dict[str, Any]]:
        """Get all file analyses."""
        return self._convert_to_json_serializable(self.analyzed_files.copy())

