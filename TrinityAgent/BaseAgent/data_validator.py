"""
Data Validator for Trinity AI Base Agent
Validates columns and filter values against actual file data.
Provides 100% guarantee that data exists before sending to backend.
"""

import os
import logging
from typing import Dict, Any, List, Optional, Set, Tuple
from minio import Minio
from minio.error import S3Error
import pyarrow as pa
import pyarrow.parquet as pq
import pyarrow.feather as pf
import pyarrow.csv as csv

from .exceptions import ValidationError

logger = logging.getLogger("trinity.data_validator")


class DataValidator:
    """
    Validates columns and filter values against actual file data.
    Ensures 100% guarantee that all referenced data exists in files.
    """
    
    def __init__(
        self,
        minio_client: Minio,
        bucket: str,
        files_with_columns: Dict[str, Any],
        prefix: str = ""
    ):
        """
        Initialize DataValidator.
        
        Args:
            minio_client: MinIO client instance
            bucket: MinIO bucket name
            files_with_columns: Dictionary of files with their column metadata
            prefix: MinIO prefix for path resolution
        """
        self.minio_client = minio_client
        self.bucket = bucket
        self.files_with_columns = files_with_columns
        self.prefix = prefix
        # Cache for file data to avoid repeated reads
        self._file_data_cache: Dict[str, pa.Table] = {}
        self._file_values_cache: Dict[str, Any] = {}  # Stores both sets and lookup maps
    
    def _resolve_file_path(self, file_path: str) -> Optional[str]:
        """
        Resolve file path to the actual path used in MinIO.
        First checks if it exists in files_with_columns, then tries to resolve with prefix.
        
        Args:
            file_path: Path to the file (can be filename, relative path, or full path)
            
        Returns:
            Resolved file path (full MinIO object name) or None if not found
        """
        if not file_path:
            return None
        
        # Step 1: Check if file_path is already in files_with_columns (exact match)
        if file_path in self.files_with_columns:
            logger.debug(f"✅ Found exact match in files_with_columns: '{file_path}'")
            return file_path
        
        # Step 2: Try to find by filename (basename)
        file_basename = os.path.basename(file_path)
        for actual_path in self.files_with_columns.keys():
            if os.path.basename(actual_path) == file_basename:
                logger.debug(f"✅ Found by filename match: '{file_path}' -> '{actual_path}'")
                return actual_path
        
        # Step 3: Try to resolve with prefix
        # If file_path doesn't start with prefix, try adding it
        if self.prefix and not file_path.startswith(self.prefix):
            prefixed_path = f"{self.prefix}{file_path}" if not file_path.startswith("/") else f"{self.prefix.rstrip('/')}{file_path}"
            if prefixed_path in self.files_with_columns:
                logger.debug(f"✅ Found with prefix: '{file_path}' -> '{prefixed_path}'")
                return prefixed_path
        
        # Step 4: Try removing leading slash if present
        if file_path.startswith("/"):
            path_no_slash = file_path.lstrip("/")
            if path_no_slash in self.files_with_columns:
                logger.debug(f"✅ Found after removing leading slash: '{file_path}' -> '{path_no_slash}'")
                return path_no_slash
        
        # Step 5: Try with prefix and no leading slash
        if self.prefix:
            path_no_slash = file_path.lstrip("/")
            prefixed_path = f"{self.prefix}{path_no_slash}" if not path_no_slash.startswith(self.prefix) else path_no_slash
            if prefixed_path in self.files_with_columns:
                logger.debug(f"✅ Found with prefix (no slash): '{file_path}' -> '{prefixed_path}'")
                return prefixed_path
        
        logger.warning(f"⚠️ Could not resolve file path: '{file_path}'. Available files: {list(self.files_with_columns.keys())[:5]}")
        return None
    
    def _file_exists_in_minio(self, file_path: str) -> bool:
        """
        Check if file actually exists in MinIO.
        First resolves the file path to the actual MinIO object name.
        
        Args:
            file_path: Path to the file (will be resolved to actual path)
            
        Returns:
            True if file exists, False otherwise
        """
        # First resolve the file path
        resolved_path = self._resolve_file_path(file_path)
        if not resolved_path:
            logger.warning(f"⚠️ Could not resolve file path for validation: '{file_path}'")
            return False
        
        try:
            # Try to stat the object (this checks if it exists)
            self.minio_client.stat_object(bucket_name=self.bucket, object_name=resolved_path)
            logger.debug(f"✅ File exists in MinIO: '{resolved_path}'")
            return True
        except S3Error as e:
            if e.code == "NoSuchKey":
                logger.warning(f"⚠️ File '{resolved_path}' does not exist in MinIO bucket '{self.bucket}'")
                return False
            else:
                logger.error(f"❌ Error checking file existence in MinIO: {e}")
                return False
        except Exception as e:
            logger.error(f"❌ Unexpected error checking file existence: {e}")
            return False
    
    def validate_columns_exist(
        self,
        file_path: str,
        columns: List[str],
        context: str = ""
    ) -> Tuple[bool, List[str], Dict[str, str]]:
        """
        Validate that all columns exist in the file.
        Uses case-insensitive matching but returns original case from file.
        First checks if file exists in MinIO, then validates columns.
        
        Args:
            file_path: Path to the file
            columns: List of column names to validate
            context: Context for error messages (e.g., "Chart 1", "GroupBy")
        
        Returns:
            Tuple of (is_valid, list_of_missing_columns, dict_mapping_input_to_original_case)
            The mapping dict helps convert user/AI input to actual column name from file
        """
        if not file_path:
            return False, ["File path is empty"], {}
        
        # Step 1: Resolve file path to actual MinIO object name
        resolved_path = self._resolve_file_path(file_path)
        if not resolved_path:
            return False, [f"File '{file_path}' not found in available files. Please check the file path."], {}
        
        # Step 2: Check if resolved file exists in MinIO
        if not self._file_exists_in_minio(resolved_path):
            return False, [f"File '{resolved_path}' does not exist in MinIO bucket '{self.bucket}'"], {}
        
        # Step 3: Get actual columns from file metadata (use resolved path)
        file_info = self.files_with_columns.get(resolved_path)
        if not file_info:
            return False, [f"File '{resolved_path}' not found in available files metadata"], {}
        
        actual_columns = file_info.get("columns", [])
        if not actual_columns:
            return False, [f"File '{resolved_path}' has no columns"], {}
        
        # Step 3: Create case-insensitive lookup map (lowercase -> original case)
        column_lookup = {}
        for actual_col in actual_columns:
            actual_col_lower = actual_col.lower()
            if actual_col_lower not in column_lookup:
                column_lookup[actual_col_lower] = actual_col
        
        # Step 4: Check each column exists (case-insensitive matching with fuzzy matching fallback)
        missing_columns = []
        column_mapping = {}  # Maps user input -> original case from file
        
        for col in columns:
            col_lower = col.lower()
            if col_lower in column_lookup:
                # Found a match - use the original case from file
                original_case = column_lookup[col_lower]
                column_mapping[col] = original_case
                logger.debug(f"✅ Found case-insensitive column match: '{col}' -> '{original_case}'")
            elif col in actual_columns:
                # Exact match (case-sensitive) - use as is
                column_mapping[col] = col
                logger.debug(f"✅ Found exact column match: '{col}'")
            else:
                # 🔧 FUZZY MATCHING: Try to find closest match
                closest_match = self._find_closest_column(col, actual_columns)
                if closest_match:
                    column_mapping[col] = closest_match
                    logger.warning(
                        f"⚠️ FUZZY MATCH: Column '{col}' not found, using closest match '{closest_match}' "
                        f"(similarity: {self._string_similarity(col.lower(), closest_match.lower()):.2f})"
                    )
                else:
                    # No match found even with fuzzy matching
                    missing_columns.append(col)
        
        if missing_columns:
            context_msg = f" in {context}" if context else ""
            logger.error(
                f"❌ VALIDATION FAILED{context_msg}: "
                f"Columns not found in file '{resolved_path}': {missing_columns}. "
                f"Available columns: {actual_columns}"
            )
            return False, missing_columns, column_mapping
        
        logger.info(f"✅ All columns validated (case-insensitive): {len(columns)} columns matched")
        return True, [], column_mapping
    
    def _read_file_data(self, file_path: str) -> Optional[pa.Table]:
        """
        Read file data and cache it.
        First resolves the file path to the actual MinIO object name.
        
        Args:
            file_path: Path to the file (will be resolved to actual path)
            
        Returns:
            PyArrow Table or None if read fails
        """
        # Resolve file path first
        resolved_path = self._resolve_file_path(file_path)
        if not resolved_path:
            logger.error(f"❌ Could not resolve file path for reading: '{file_path}'")
            return None
        
        # Check cache first (use resolved path)
        if resolved_path in self._file_data_cache:
            return self._file_data_cache[resolved_path]
        
        try:
            # Get object data from MinIO (use resolved path)
            response = self.minio_client.get_object(
                bucket_name=self.bucket,
                object_name=resolved_path
            )
            data = response.read()
            response.close()
            response.release_conn()
            
            # Try different formats
            readers = [
                ("Parquet", lambda buffer: pq.read_table(buffer)),
                ("Feather", lambda buffer: pf.read_table(buffer)),
                ("Arrow IPC", lambda buffer: pa.ipc.open_file(pa.BufferReader(buffer)).read_all()),
                ("Arrow Stream", lambda buffer: pa.ipc.open_stream(buffer).read_all()),
                ("CSV", lambda buffer: csv.read_csv(buffer))
            ]
            
            for format_name, reader_func in readers:
                try:
                    table = reader_func(data)
                    if table and hasattr(table, 'column_names'):
                        # Cache the table (use resolved path)
                        self._file_data_cache[resolved_path] = table
                        logger.debug(f"✅ Read file '{resolved_path}' as {format_name} with {len(table.column_names)} columns")
                        return table
                except Exception as e:
                    logger.debug(f"Failed to read {resolved_path} as {format_name}: {e}")
                    continue
            
            logger.error(f"❌ Could not read file '{resolved_path}' with any supported format")
            return None
            
        except Exception as e:
            logger.error(f"❌ Failed to read file '{resolved_path}': {e}")
            return None
    
    def _get_column_unique_values(
        self,
        file_path: str,
        column_name: str
    ) -> Tuple[Set[str], Dict[str, str]]:
        """
        Get unique values for a column from the file.
        Returns both the original values and a case-insensitive lookup map.
        
        Args:
            file_path: Path to the file
            column_name: Name of the column
            
        Returns:
            Tuple of (set_of_original_values, dict_mapping_lowercase_to_original)
        """
        # Resolve file path first
        resolved_path = self._resolve_file_path(file_path)
        if not resolved_path:
            logger.error(f"❌ Could not resolve file path for getting column values: '{file_path}'")
            return set(), {}
        
        # Check cache first (use resolved path for cache key)
        cache_key = f"{resolved_path}:{column_name}"
        cache_key_lookup = f"{resolved_path}:{column_name}:lookup"
        
        if cache_key in self._file_values_cache:
            # Return cached values and lookup
            original_values = self._file_values_cache[cache_key]
            lookup_map = self._file_values_cache.get(cache_key_lookup, {})
            return original_values, lookup_map
        
        # Resolve file path first
        resolved_path = self._resolve_file_path(file_path)
        if not resolved_path:
            logger.error(f"❌ Could not resolve file path for getting column values: '{file_path}'")
            return set(), {}
        
        # Read file data (uses resolved path internally)
        table = self._read_file_data(resolved_path)
        if not table:
            return set(), {}
        
        # Get column index
        if column_name not in table.column_names:
            logger.warning(f"Column '{column_name}' not found in table columns: {table.column_names}")
            return set(), {}
        
        try:
            # Extract unique values from the column
            column_index = table.column_names.index(column_name)
            column_data = table.column(column_index)
            
            # Store original values (as strings) and create case-insensitive lookup
            original_values = set()
            lookup_map = {}  # Maps lowercase -> original case
            
            for i in range(len(column_data)):
                value = column_data[i].as_py()
                # Convert to string for comparison (handles None, NaN, etc.)
                if value is not None:
                    value_str = str(value)
                    original_values.add(value_str)
                    # Create case-insensitive lookup (preserve original case)
                    value_lower = value_str.lower()
                    if value_lower not in lookup_map:
                        lookup_map[value_lower] = value_str
                    # If there are multiple cases, keep the first one encountered
            
            # Cache the values and lookup map (use resolved path for cache key)
            resolved_cache_key = f"{resolved_path}:{column_name}"
            resolved_cache_key_lookup = f"{resolved_path}:{column_name}:lookup"
            self._file_values_cache[resolved_cache_key] = original_values
            self._file_values_cache[resolved_cache_key_lookup] = lookup_map
            
            logger.debug(f"✅ Extracted {len(original_values)} unique values from column '{column_name}' in file '{resolved_path}'")
            return original_values, lookup_map
            
        except Exception as e:
            logger.error(f"❌ Failed to extract values from column '{column_name}' in file '{file_path}': {e}")
            return set(), {}
    
    def validate_filter_values_exist(
        self,
        file_path: str,
        filter_column: str,
        filter_values: List[str],
        context: str = ""
    ) -> Tuple[bool, List[str], Dict[str, str]]:
        """
        Validate that all filter values exist in the specified column.
        Uses case-insensitive matching but preserves original case from file.
        
        Args:
            file_path: Path to the file
            filter_column: Name of the filter column
            filter_values: List of filter values to validate
            context: Context for error messages (e.g., "Chart 1", "GroupBy")
        
        Returns:
            Tuple of (is_valid, list_of_invalid_values, dict_mapping_input_to_original_case)
            The mapping dict helps convert user/AI input to actual case from file
        """
        if not file_path:
            return False, ["File path is empty"], {}
        
        if not filter_column:
            return False, ["Filter column is empty"], {}
        
        if not filter_values:
            return True, [], {}  # Empty filter values are valid
        
        # Step 1: First validate column exists (returns 3 values: is_valid, missing_cols, column_mapping)
        is_valid, missing_cols, _ = self.validate_columns_exist(file_path, [filter_column], context)
        if not is_valid:
            return False, [f"Filter column '{filter_column}' not found in file"], {}
        
        # Step 2: Get unique values from the column (with case-insensitive lookup)
        original_values, lookup_map = self._get_column_unique_values(file_path, filter_column)
        
        if not original_values:
            logger.warning(f"⚠️ Column '{filter_column}' in file '{file_path}' has no values")
            return False, [f"Column '{filter_column}' has no data"], {}
        
        # Step 3: Check each filter value exists (case-insensitive matching)
        invalid_values = []
        value_mapping = {}  # Maps user input -> original case from file
        
        for val in filter_values:
            val_str = str(val).strip()
            val_lower = val_str.lower()
            
            # Check case-insensitive match
            if val_lower in lookup_map:
                # Found a match - use the original case from file
                original_case = lookup_map[val_lower]
                value_mapping[val_str] = original_case
                logger.debug(f"✅ Found case-insensitive match: '{val_str}' -> '{original_case}'")
            elif val_str in original_values:
                # Exact match (case-sensitive) - use as is
                value_mapping[val_str] = val_str
                logger.debug(f"✅ Found exact match: '{val_str}'")
            else:
                # 🔧 FUZZY MATCHING: Try to find closest match
                closest_match = self._find_closest_value(val_str, original_values, lookup_map)
                if closest_match:
                    value_mapping[val_str] = closest_match
                    similarity = self._string_similarity(val_str.lower(), closest_match.lower())
                    logger.warning(
                        f"⚠️ FUZZY MATCH: Filter value '{val_str}' not found, using closest match '{closest_match}' "
                        f"(similarity: {similarity:.2f})"
                    )
                else:
                    # No match found even with fuzzy matching
                    invalid_values.append(val)
        
        if invalid_values:
            context_msg = f" in {context}" if context else ""
            sample_values = list(original_values)[:10]
            logger.error(
                f"❌ VALIDATION FAILED{context_msg}: "
                f"Filter values not found in column '{filter_column}' of file '{file_path}': {invalid_values}. "
                f"Available values (sample): {sample_values}"
            )
            return False, invalid_values, value_mapping
        
        logger.info(f"✅ All filter values validated (case-insensitive): {len(filter_values)} values matched")
        return True, [], value_mapping
    
    def validate_chart_config(
        self,
        chart: Dict[str, Any],
        file_path: str,
        context: str = ""
    ) -> Tuple[bool, List[str], Dict[str, Dict[str, str]], Dict[str, str]]:
        """
        Validate a complete chart configuration against file data.
        Uses case-insensitive matching for columns and filter values but preserves original case.
        
        Args:
            chart: Chart configuration dictionary
            file_path: Path to the file
            context: Context for error messages (e.g., "Chart 1")
        
        Returns:
            Tuple of (is_valid, list_of_errors, value_mapping_dict, column_mapping_dict)
            value_mapping_dict maps filter columns to dict of {user_input: original_case_from_file}
            column_mapping_dict maps user_input_column to original_case_from_file
        """
        errors = []
        value_mapping = {}  # Maps filter_column -> {user_input: original_case}
        column_mapping = {}  # Maps user_input_column -> original_case_from_file
        
        # Step 1: Resolve file path to actual MinIO object name
        resolved_path = self._resolve_file_path(file_path)
        if not resolved_path:
            errors.append(f"File '{file_path}' not found in available files. Please check the file path.")
            return False, errors, value_mapping, column_mapping
        
        # Step 2: Validate resolved file exists in MinIO
        if not self._file_exists_in_minio(resolved_path):
            errors.append(f"File '{resolved_path}' does not exist in MinIO bucket '{self.bucket}'")
            return False, errors, value_mapping, column_mapping
        
        # Step 3: Validate resolved file is in metadata
        if resolved_path not in self.files_with_columns:
            errors.append(f"File '{resolved_path}' not found in available files metadata")
            return False, errors, value_mapping, column_mapping
        
        # Step 4: Validate traces (columns) - case-insensitive matching
        traces = chart.get("traces", [])
        if not traces:
            errors.append("Chart has no traces")
            return False, errors, value_mapping, column_mapping
        
        all_columns = []
        for trace in traces:
            if isinstance(trace, dict):
                x_col = trace.get("x_column")
                y_col = trace.get("y_column")
                if x_col:
                    all_columns.append(x_col)
                if y_col:
                    all_columns.append(y_col)
        
        # Validate all columns exist (case-insensitive matching) - use resolved path
        if all_columns:
            is_valid, missing_cols, col_mapping = self.validate_columns_exist(resolved_path, all_columns, context)
            if not is_valid:
                errors.extend([f"Column '{col}' not found in file" for col in missing_cols])
            else:
                # Store column mapping
                column_mapping.update(col_mapping)
        
        # Step 5: Validate filters (case-insensitive for values)
        filters = chart.get("filters", {})
        if isinstance(filters, dict):
            for filter_col, filter_vals in filters.items():
                if isinstance(filter_vals, list):
                    is_valid, invalid_vals, col_mapping = self.validate_filter_values_exist(
                        resolved_path, filter_col, filter_vals, context
                    )
                    if not is_valid:
                        errors.extend([f"Filter value '{val}' not found in column '{filter_col}'" for val in invalid_vals])
                    else:
                        # Store mapping for this filter column
                        value_mapping[filter_col] = col_mapping
        
        # Also check filter_columns and filter_values format
        if "filter_columns" in chart and "filter_values" in chart:
            filter_col = chart.get("filter_columns")
            filter_vals = chart.get("filter_values")
            if filter_col and filter_vals:
                if isinstance(filter_vals, str):
                    filter_vals_list = [v.strip() for v in filter_vals.split(",") if v.strip()]
                elif isinstance(filter_vals, list):
                    filter_vals_list = [str(v).strip() for v in filter_vals if v]
                else:
                    filter_vals_list = []
                
                if filter_vals_list:
                    is_valid, invalid_vals, col_mapping = self.validate_filter_values_exist(
                        resolved_path, filter_col, filter_vals_list, context
                    )
                    if not is_valid:
                        errors.extend([f"Filter value '{val}' not found in column '{filter_col}'" for val in invalid_vals])
                    else:
                        # Store mapping for this filter column
                        value_mapping[filter_col] = col_mapping
        
        return len(errors) == 0, errors, value_mapping, column_mapping
    
    def validate_groupby_config(
        self,
        group_by_columns: List[str],
        aggregation_functions: Dict[str, Any],
        file_path: str,
        context: str = ""
    ) -> Tuple[bool, List[str], Dict[str, str]]:
        """
        Validate a complete GroupBy configuration against file data.
        Uses case-insensitive matching for columns.
        First checks if file exists in MinIO, then validates columns.
        
        Args:
            group_by_columns: List of columns to group by
            aggregation_functions: Dictionary of aggregation functions
            file_path: Path to the file
            context: Context for error messages (e.g., "GroupBy")
        
        Returns:
            Tuple of (is_valid, list_of_errors, column_mapping_dict)
            column_mapping_dict maps user_input_column to original_case_from_file
        """
        errors = []
        column_mapping = {}  # Maps user_input_column -> original_case_from_file
        
        # Step 1: Resolve file path to actual MinIO object name
        resolved_path = self._resolve_file_path(file_path)
        if not resolved_path:
            errors.append(f"File '{file_path}' not found in available files. Please check the file path.")
            return False, errors, column_mapping
        
        # Step 2: Validate resolved file exists in MinIO
        if not self._file_exists_in_minio(resolved_path):
            errors.append(f"File '{resolved_path}' does not exist in MinIO bucket '{self.bucket}'")
            return False, errors, column_mapping
        
        # Step 3: Validate resolved file is in metadata
        if resolved_path not in self.files_with_columns:
            errors.append(f"File '{resolved_path}' not found in available files metadata")
            return False, errors, column_mapping
        
        # Step 3: Validate group_by_columns exist (case-insensitive matching) - use resolved path
        if group_by_columns:
            is_valid, missing_cols, col_mapping = self.validate_columns_exist(resolved_path, group_by_columns, context)
            if not is_valid:
                errors.extend([f"GroupBy column '{col}' not found in file" for col in missing_cols])
            else:
                column_mapping.update(col_mapping)
        
        # Step 4: Validate aggregation function columns exist (case-insensitive matching) - use resolved path
        if aggregation_functions:
            agg_columns = list(aggregation_functions.keys())
            is_valid, missing_cols, col_mapping = self.validate_columns_exist(resolved_path, agg_columns, context)
            if not is_valid:
                errors.extend([f"Aggregation column '{col}' not found in file" for col in missing_cols])
            else:
                column_mapping.update(col_mapping)
        
        return len(errors) == 0, errors, column_mapping
    
    def _string_similarity(self, str1: str, str2: str) -> float:
        """
        Calculate simple string similarity ratio (0.0 to 1.0).
        Uses a combination of:
        - Exact match: 1.0
        - Contains match: 0.8
        - Character overlap: ratio of common characters
        """
        if not str1 or not str2:
            return 0.0
        
        str1_lower = str1.lower().strip()
        str2_lower = str2.lower().strip()
        
        # Exact match
        if str1_lower == str2_lower:
            return 1.0
        
        # Contains match (one string contains the other)
        if str1_lower in str2_lower or str2_lower in str1_lower:
            # Calculate ratio based on length
            min_len = min(len(str1_lower), len(str2_lower))
            max_len = max(len(str1_lower), len(str2_lower))
            return 0.8 * (min_len / max_len) if max_len > 0 else 0.0
        
        # Character overlap ratio
        set1 = set(str1_lower)
        set2 = set(str2_lower)
        if not set1 or not set2:
            return 0.0
        
        intersection = len(set1 & set2)
        union = len(set1 | set2)
        return (intersection / union) if union > 0 else 0.0
    
    def _find_closest_column(self, input_col: str, actual_columns: List[str], threshold: float = 0.6) -> Optional[str]:
        """
        Find the closest matching column name using fuzzy matching.
        Returns the closest match if similarity is above threshold, else None.
        """
        if not input_col or not actual_columns:
            return None
        
        input_lower = input_col.lower().strip()
        best_match = None
        best_similarity = 0.0
        
        for actual_col in actual_columns:
            similarity = self._string_similarity(input_lower, actual_col.lower())
            if similarity > best_similarity:
                best_similarity = similarity
                best_match = actual_col
        
        # Only return match if similarity is above threshold
        if best_similarity >= threshold:
            return best_match
        return None
    
    def _find_closest_value(
        self,
        input_val: str,
        original_values: Set[str],
        lookup_map: Dict[str, str],
        threshold: float = 0.6
    ) -> Optional[str]:
        """
        Find the closest matching filter value using fuzzy matching.
        Returns the closest match if similarity is above threshold, else None.
        """
        if not input_val or not original_values:
            return None
        
        input_lower = input_val.lower().strip()
        best_match = None
        best_similarity = 0.0
        
        # Check against all original values
        for orig_val in original_values:
            similarity = self._string_similarity(input_lower, orig_val.lower())
            if similarity > best_similarity:
                best_similarity = similarity
                best_match = orig_val
        
        # Only return match if similarity is above threshold
        if best_similarity >= threshold:
            return best_match
        return None
    
    def clear_cache(self) -> None:
        """Clear the file data cache."""
        self._file_data_cache.clear()
        self._file_values_cache.clear()
        logger.debug("✅ Cleared data validator cache")

