"""Separate description/metadata rows from actual data rows."""

import logging
from typing import Tuple, List
import pandas as pd
import numpy as np

logger = logging.getLogger(__name__)


class DescriptionSeparator:
    """Separate description/metadata rows from data table."""

    @staticmethod
    def separate_description_rows(
        df: pd.DataFrame,
        max_description_rows: int = 10,
    ) -> Tuple[List[List], pd.DataFrame]:
        """
        Identify and separate description/metadata rows from data rows.
        
        Enhanced with:
        - Rule 1: Data Consistency Score for better row classification
        - Rule 2: Stable Block Detection to find where data actually starts
        - Rule 4: Data Block Ending Detection to trim footnotes/summaries
        
        Args:
            df: Raw DataFrame (all rows as data, no headers applied)
            max_description_rows: Maximum number of rows to check for description
        
        Returns:
            Tuple of (description_rows as list of lists, cleaned DataFrame)
        """
        if df.empty:
            return [], df
        
        # Step 1: Find stable data block start (Rule 2)
        # But be lenient - if we can't find a stable block, assume data starts at row 0
        stable_start = DescriptionSeparator._find_stable_data_block(df, start_row=0)
        
        # CRITICAL SAFETY CHECK: For simple files, data usually starts at row 0 or 1
        # If stable_start is too high (more than 3 rows), it's likely wrong for simple files
        if stable_start > 3:
            logger.warning(f"Stable block found at row {stable_start}, which seems high. Checking first rows...")
            # Check if first few rows look like data (be VERY lenient)
            for i in range(min(10, len(df))):
                row = df.iloc[i]
                score = DescriptionSeparator._compute_data_consistency_score(row, df.columns)
                # Very lenient threshold - if score > 0.15, consider it data
                if score >= 0.15:
                    logger.info(f"Row {i} looks like data (score: {score:.2f}), using it as start instead of {stable_start}")
                    stable_start = i
                    break
            
            # If still too high, just use row 0 (assume no description rows)
            if stable_start > 3:
                logger.warning(f"Stable start still at {stable_start}, defaulting to row 0 (no description rows)")
                stable_start = 0
        
        # EXTRA SAFETY: If stable_start >= len(df), something is very wrong - use row 0
        if stable_start >= len(df):
            logger.error(f"Stable start {stable_start} >= total rows {len(df)}! Using row 0.")
            stable_start = 0
        
        # Step 2: Collect description rows before stable start
        # IMPORTANT: Check first few rows carefully for description rows
        # Even if stable_start is 0, we should check first 3-5 rows for description rows
        description_rows = []
        rows_to_check = min(max(stable_start, 5), max_description_rows)  # Check at least first 5 rows
        
        for i in range(rows_to_check):
            row = df.iloc[i]
            # Use enhanced scoring to identify description rows
            # Pass row index and total rows for better detection
            if DescriptionSeparator._is_description_row(row, df.columns, row_index=i, df_total_rows=len(df)):
                description_rows.append(row.fillna("").astype(str).tolist())
                logger.debug(f"Row {i} identified as description row")
        
        # If we found description rows, update stable_start to skip them
        if description_rows:
            # stable_start should be at least after the last description row
            new_stable_start = max(stable_start, len(description_rows))
            if new_stable_start != stable_start:
                logger.info(f"Updated stable_start from {stable_start} to {new_stable_start} (after {len(description_rows)} description rows)")
                stable_start = new_stable_start
        
        # Step 3: Extract data rows starting from stable block
        df_data = df.iloc[stable_start:].copy()
        
        # CRITICAL SAFETY CHECK: If stable_start is too high, we'll lose too many rows
        # For files with < 50 rows, if stable_start > 10% of rows, reset to 0
        if len(df) < 50 and stable_start > max(1, len(df) * 0.1):
            logger.warning(f"Stable start {stable_start} is too high for {len(df)} row file. Resetting to 0.")
            stable_start = 0
            df_data = df.iloc[stable_start:].copy()
            description_rows = []  # Reset description rows too
        
        # Safety check: if df_data is empty, something went wrong - return all rows as data
        if df_data.empty or len(df_data) == 0:
            logger.warning(f"No data rows found after separation! Total rows: {len(df)}. Returning all rows as data rows.")
            return [], df.reset_index(drop=True)
        
        # Safety check: if we filtered out too many rows (>90%), reset
        if len(df_data) < len(df) * 0.1:
            logger.warning(f"Too few data rows ({len(df_data)} out of {len(df)}). Resetting to treat all rows as data.")
            return [], df.reset_index(drop=True)
        
        # Step 4: Detect where data block ends (Rule 4)
        # But be VERY conservative - only trim if we're very confident
        data_end = DescriptionSeparator._detect_data_block_end(df_data, start_row=0)
        
        # Step 5: Trim data to end of block (but be VERY conservative)
        # Only trim if:
        # 1. We have enough rows (> 100) to justify trimming
        # 2. The trim point is clearly defined (not too early)
        original_len = len(df_data)
        if data_end < original_len and original_len > 100 and data_end > 50:
            # Only trim if we're keeping at least 50 rows and trimming less than 50% of data
            trim_ratio = data_end / original_len
            if trim_ratio > 0.5:  # Keep at least 50% of data
                df_data = df_data.iloc[:data_end].copy()
                logger.debug(f"Trimmed data block: kept {data_end} rows out of {original_len} ({trim_ratio:.1%})")
            else:
                logger.debug(f"Skipping trim - would remove too much data ({trim_ratio:.1%} kept)")
        elif data_end < original_len:
            logger.debug(f"Skipping trim - not enough data to justify trimming ({original_len} rows, trim at {data_end})")
        
        # CRITICAL FINAL CHECK: If we ended up with no data rows, return all rows as data
        if df_data.empty or len(df_data) == 0:
            logger.warning(f"After all processing, df_data is empty! Returning all {len(df)} rows as data rows.")
            return [], df.reset_index(drop=True)
        
        # Reset index
        df_data = df_data.reset_index(drop=True)
        
        logger.info(f"Description separation: {len(description_rows)} description rows, {len(df_data)} data rows (from {len(df)} total rows)")
        
        return description_rows, df_data

    @staticmethod
    def _find_stable_data_block(df: pd.DataFrame, start_row: int = 0, min_consecutive: int = 3) -> int:
        """
        Find the first stable block of consistent tabular data (Rule 2).
        
        A stable block is ≥3 consecutive rows with:
        - Fill ratio ≥ 40-60%
        - Similar column structure
        - No text > 200 chars
        - No metadata keywords
        
        Args:
            df: Raw DataFrame
            start_row: Row index to start scanning from
            min_consecutive: Minimum consecutive rows needed for stable block
            
        Returns:
            int: Row index where stable data block starts, or start_row if not found
        """
        if df.empty or start_row >= len(df):
            return start_row
        
        # For very small files (< 50 rows), be very lenient - just return start_row
        # This prevents filtering out all rows for simple files
        if len(df) < 50:
            logger.debug(f"Small file ({len(df)} rows), using start_row {start_row} without strict checking")
            return start_row
        
        rows_to_check = min(len(df), start_row + 50)  # Check up to 50 rows
        consecutive_count = 0
        stable_start = start_row
        
        for i in range(start_row, rows_to_check):
            row = df.iloc[i]
            score = DescriptionSeparator._compute_data_consistency_score(row, df.columns)
            
            # Check additional criteria for stable block
            non_null_count = row.notna().sum()
            total_cols = len(df.columns)
            fill_ratio = non_null_count / total_cols if total_cols > 0 else 0
            
            # Check for very long text (>200 chars)
            has_very_long_text = False
            for val in row:
                if pd.notna(val):
                    if len(str(val)) > 200:
                        has_very_long_text = True
                        break
            
            # Check for metadata patterns
            metadata_patterns = ['=', '[', ']', ':', 'Brand=', 'Reporting Range=', 'Select week']
            has_metadata = False
            for val in row:
                if pd.notna(val):
                    val_str = str(val)
                    if any(pattern in val_str for pattern in metadata_patterns):
                        has_metadata = True
                        break
            
            # Row qualifies as stable data if:
            # - Good data consistency score (≥0.2, very lenient for simple files)
            # - Fill ratio at least 10% (very lenient for sparse files)
            # - No very long text
            # - No metadata patterns
            # Be VERY lenient for simple files - they might have lower scores
            is_stable = (
                score >= 0.2 and  # Lowered from 0.3 - very lenient
                fill_ratio >= 0.1 and  # Lowered from 0.2 - very lenient
                not has_very_long_text and
                not has_metadata
            )
            
            if is_stable:
                if consecutive_count == 0:
                    stable_start = i
                consecutive_count += 1
                
                # Found stable block (but require fewer consecutive rows for small files)
                required_consecutive = min(min_consecutive, 2) if len(df) < 100 else min_consecutive
                if consecutive_count >= required_consecutive:
                    logger.debug(f"Found stable data block starting at row {stable_start}")
                    return stable_start
            else:
                # Reset counter if row doesn't qualify
                consecutive_count = 0
        
        # If we didn't find a stable block, return original start (don't filter anything)
        logger.debug(f"No stable block found, using start_row {start_row} (all rows will be treated as data)")
        return start_row

    @staticmethod
    def _detect_data_block_end(df: pd.DataFrame, start_row: int = 0) -> int:
        """
        Detect where the data block ends (Rule 4).
        
        Stops reading after:
        - ≥3 consecutive sparse rows (<30% filled)
        - Rows containing termination patterns: "Total", "End of Report", "% Complete"
        - Rows where 70% of values are long text (>50 chars)
        
        Args:
            df: Raw DataFrame
            start_row: Row index where data starts
            
        Returns:
            int: Row index where data block ends (exclusive), or len(df) if data continues to end
        """
        if df.empty or start_row >= len(df):
            return len(df)
        
        consecutive_sparse = 0
        sparse_threshold = 0.3  # 30% fill ratio
        
        termination_patterns = [
            'Total Revenue', 'Total', 'End of Report', 'End of', '% Complete',
            'Summary', 'Grand Total', 'Generated On', 'Report Generated'
        ]
        
        # Scan from start_row to end
        for i in range(start_row, len(df)):
            row = df.iloc[i]
            non_null_count = row.notna().sum()
            total_cols = len(df.columns)
            fill_ratio = non_null_count / total_cols if total_cols > 0 else 0
            
            # Check if row is sparse
            is_sparse = fill_ratio < sparse_threshold
            
            # Check for termination patterns
            has_termination_pattern = False
            long_text_count = 0
            
            for val in row:
                if pd.notna(val):
                    val_str = str(val)
                    # Check for termination patterns
                    if any(pattern.lower() in val_str.lower() for pattern in termination_patterns):
                        has_termination_pattern = True
                    # Count long text
                    if len(val_str) > 50:
                        long_text_count += 1
            
            long_text_ratio = long_text_count / non_null_count if non_null_count > 0 else 0
            is_mostly_long_text = long_text_ratio >= 0.7
            
            # If sparse row, increment counter
            if is_sparse:
                consecutive_sparse += 1
                # Found 3+ consecutive sparse rows - data likely ended
                if consecutive_sparse >= 3:
                    logger.debug(f"Data block ends at row {i - 2} (found {consecutive_sparse} consecutive sparse rows)")
                    return i - 2
            else:
                consecutive_sparse = 0
            
            # Check for termination patterns or mostly long text
            if has_termination_pattern or is_mostly_long_text:
                logger.debug(f"Data block ends at row {i} (found termination pattern or mostly long text)")
                return i
        
        # Data continues to end of file
        return len(df)

    @staticmethod
    def _compute_data_consistency_score(row: pd.Series, columns: pd.Index) -> float:
        """
        Compute data consistency score for a row (Rule 1).
        
        Higher score = more likely to be data row
        Lower score = more likely to be description/metadata row
        
        Args:
            row: Row to score
            columns: Column index
            
        Returns:
            float: Score between 0.0 and 1.0
        """
        values = row.tolist()
        total_cols = len(columns)
        if total_cols == 0:
            return 0.0
        
        non_null_count = row.notna().sum()
        column_fill_ratio = non_null_count / total_cols if total_cols > 0 else 0
        
        # Count cell types and text lengths
        short_text_count = 0  # 1-50 chars
        long_text_count = 0  # >50 chars
        very_long_text_count = 0  # >200 chars
        numeric_count = 0
        type_consistency_score = 0.0
        
        for val in values:
            if pd.notna(val):
                val_str = str(val)
                val_len = len(val_str)
                
                # Categorize by length
                if val_len <= 50:
                    short_text_count += 1
                elif val_len <= 200:
                    long_text_count += 1
                else:
                    very_long_text_count += 1
                
                # Check if numeric
                try:
                    float(val_str.replace(',', '').replace('$', '').replace('%', '').strip())
                    numeric_count += 1
                except (ValueError, AttributeError):
                    pass
        
        # Calculate ratios
        short_text_ratio = short_text_count / non_null_count if non_null_count > 0 else 0
        long_text_ratio = long_text_count / non_null_count if non_null_count > 0 else 0
        very_long_text_ratio = very_long_text_count / non_null_count if non_null_count > 0 else 0
        numeric_ratio = numeric_count / non_null_count if non_null_count > 0 else 0
        
        # Type consistency: prefer rows with consistent types (all numeric or all short text)
        if non_null_count > 0:
            dominant_type_ratio = max(numeric_ratio, short_text_ratio)
            type_consistency_score = dominant_type_ratio
        
        # Compute weighted score (Rule 1)
        # Column fill ratio (weight: 0.3)
        fill_score = column_fill_ratio * 0.3
        
        # Type consistency score (weight: 0.3)
        consistency_score = type_consistency_score * 0.3
        
        # Short text ratio (weight: 0.2) - data rows have more short text
        short_text_score = short_text_ratio * 0.2
        
        # Penalize long text ratio (weight: -0.2) - description rows have more long text
        long_text_penalty = very_long_text_ratio * 0.2
        
        # Check for metadata patterns (additional penalty)
        metadata_patterns = ['=', '[', ']', ':', 'Brand=', 'Reporting Range=', 'Select week', 
                           'Total Revenue', 'End of Report', '% Complete']
        pattern_count = 0
        for val in values:
            if pd.notna(val):
                val_str = str(val)
                if any(pattern in val_str for pattern in metadata_patterns):
                    pattern_count += 1
        
        metadata_penalty = (pattern_count / total_cols) * 0.1 if total_cols > 0 else 0
        
        # Final score
        data_score = fill_score + consistency_score + short_text_score - long_text_penalty - metadata_penalty
        
        return max(0.0, min(1.0, data_score))

    @staticmethod
    def _is_description_row(row: pd.Series, columns: pd.Index, row_index: int = -1, df_total_rows: int = 0) -> bool:
        """
        Determine if a row is a description/metadata row using enhanced scoring.
        
        Uses Rule 1: Data Consistency Score + metadata pattern detection
        Threshold: score < 0.3 = description row
        
        Enhanced to detect:
        - Rows with metadata patterns (Brand=, Reporting Range=, etc.)
        - Rows with significantly fewer non-null values (padded rows)
        - Rows in first few positions with low fill ratio
        """
        total_cols = len(columns)
        non_null_count = row.notna().sum()
        fill_ratio = non_null_count / total_cols if total_cols > 0 else 0
        
        # CRITICAL: Check for metadata patterns FIRST (strongest indicator)
        # Common metadata patterns found in description rows
        metadata_patterns = [
            'Brand=', 'Reporting Range=', 'Select week=', 'Select Week=',
            'Report Generated', 'Generated On', 'Date Range=',
            'Filter=', 'Filters=', 'Parameters=', 'Parameter=',
            '=', '[', ']', ':',  # Common separators in metadata
        ]
        
        has_metadata_pattern = False
        metadata_value_count = 0
        
        for val in row:
            if pd.notna(val):
                val_str = str(val).strip()
                # Check for metadata patterns (case-insensitive)
                for pattern in metadata_patterns:
                    if pattern.lower() in val_str.lower():
                        has_metadata_pattern = True
                        metadata_value_count += 1
                        break
        
        # If row contains metadata patterns, it's definitely a description row
        if has_metadata_pattern:
            logger.debug(f"Row {row_index} detected as description (has metadata patterns: {metadata_value_count} matches)")
            return True
        
        # Check for padded rows: rows with very low fill ratio (< 20%) in first few rows
        # This indicates the row was padded with NaN (original row had fewer columns)
        if row_index >= 0 and row_index < 5 and fill_ratio < 0.2:
            # Check if non-null values contain metadata-like content
            non_null_values = [str(val).strip() for val in row if pd.notna(val)]
            if len(non_null_values) > 0:
                # Check if non-null values look like metadata (contain =, [], etc.)
                has_metadata_like_content = any(
                    '=' in val or '[' in val or ']' in val or ':' in val
                    for val in non_null_values
                )
                if has_metadata_like_content:
                    logger.debug(f"Row {row_index} detected as description (padded row with metadata-like content, fill_ratio: {fill_ratio:.2f})")
                    return True
        
        # Use consistency score as fallback
        score = DescriptionSeparator._compute_data_consistency_score(row, columns)
        
        # For first few rows, be more aggressive in detecting description rows
        # If score is low AND fill ratio is low, it's likely a description row
        if row_index >= 0 and row_index < 5:
            if score < 0.4 and fill_ratio < 0.3:
                logger.debug(f"Row {row_index} detected as description (low score: {score:.2f}, low fill: {fill_ratio:.2f})")
                return True
        
        # Standard threshold for other rows
        return score < 0.3

