"""Detect header row in dataframes where headers may not be in the first row."""

import logging
from typing import Optional
import pandas as pd
import numpy as np

logger = logging.getLogger(__name__)


class HeaderDetector:
    """Detect the row that contains column headers."""

    @staticmethod
    def find_header_row(df: pd.DataFrame, max_rows_to_check: int = 20) -> int:
        """
        Find the row index that contains column headers.
        
        Args:
            df: DataFrame read with header=None (all rows as data)
            max_rows_to_check: Maximum number of rows to check
            
        Returns:
            int: Row index (0-based) where headers are found
        """
        if df.empty:
            return 0
        
        rows_to_check = min(max_rows_to_check, len(df))
        
        best_row = 0
        best_score = 0
        
        for i in range(rows_to_check):
            score = HeaderDetector._score_header_likelihood(df.iloc[i])
            if score > best_score:
                best_score = score
                best_row = i
        
        # If we found a good header row (score > threshold), use it
        if best_score > 0.5:
            logger.debug(f"Detected header row at index {best_row} with score {best_score:.2f}")
            return best_row
        
        # Default to first row
        logger.debug(f"No clear header row found, using row 0")
        return 0

    @staticmethod
    def _is_probable_column_name(cell_value: any) -> bool:
        """
        Check if a cell value looks like a column name (Rule 3).
        
        Column names are usually:
        - Short text (1-25 chars, rarely > 30)
        - Alphanumeric (with underscores/spaces)
        - No metadata patterns (":", "=")
        
        Args:
            cell_value: Cell value to check
            
        Returns:
            bool: True if value looks like column name
        """
        if pd.isna(cell_value):
            return False
        
        val_str = str(cell_value).strip()
        
        # Empty strings are not column names
        if not val_str:
            return False
        
        # Check length (1-30 chars, prefer 1-25)
        if len(val_str) > 30:
            return False
        
        # Check for metadata patterns (exclude these)
        metadata_patterns = [':', '=']
        if any(pattern in val_str for pattern in metadata_patterns):
            return False
        
        # Check alphanumeric ratio (should be mostly alphanumeric)
        alphanumeric_chars = sum(1 for c in val_str if c.isalnum() or c in ['_', ' ', '-'])
        alphanumeric_ratio = alphanumeric_chars / len(val_str) if len(val_str) > 0 else 0
        
        # Column names are mostly alphanumeric
        return alphanumeric_ratio >= 0.7

    @staticmethod
    def _has_metadata_patterns(row: pd.Series) -> bool:
        """
        Check if row contains metadata patterns that indicate it's not a header.
        
        Args:
            row: Row to check
            
        Returns:
            bool: True if row contains metadata patterns
        """
        metadata_patterns = [':', '=', '[', ']', 'Brand=', 'Reporting Range=']
        
        for val in row:
            if pd.notna(val):
                val_str = str(val)
                if any(pattern in val_str for pattern in metadata_patterns):
                    return True
        
        return False

    @staticmethod
    def _score_header_likelihood(row: pd.Series) -> float:
        """
        Score how likely a row is to be a header row.
        
        Enhanced with Rule 3: Column Name Pattern Detection
        
        Returns:
            float: Score between 0 and 1 (higher = more likely to be header)
        """
        values = row.tolist()
        if not values:
            return 0.0
        
        score = 0.0
        total_cells = len(values)
        if total_cells == 0:
            return 0.0
        
        # Exclude rows with metadata patterns (Rule 3)
        if HeaderDetector._has_metadata_patterns(row):
            return 0.0
        
        # Count string cells
        string_count = 0
        empty_count = 0
        long_text_count = 0
        numeric_count = 0
        column_name_count = 0
        text_lengths = []
        
        for val in values:
            if pd.isna(val):
                empty_count += 1
            elif isinstance(val, str):
                string_count += 1
                val_len = len(val)
                text_lengths.append(val_len)
                
                # Long strings (descriptions) are less likely to be headers
                if val_len > 50:
                    long_text_count += 1
                
                # Check if it looks like a column name (Rule 3)
                if HeaderDetector._is_probable_column_name(val):
                    column_name_count += 1
            elif isinstance(val, (int, float, np.number)):
                numeric_count += 1
        
        # Headers are mostly strings (weight: 0.3, reduced from 0.4)
        string_ratio = string_count / total_cells if total_cells > 0 else 0
        score += string_ratio * 0.3
        
        # Headers have few empty cells (weight: 0.2, unchanged)
        empty_ratio = empty_count / total_cells if total_cells > 0 else 0
        score += (1 - empty_ratio) * 0.2
        
        # Headers are not long descriptive text (weight: 0.2, unchanged)
        long_text_ratio = long_text_count / total_cells if total_cells > 0 else 0
        score += (1 - long_text_ratio) * 0.2
        
        # Headers have few numeric values (weight: 0.15, reduced from 0.2)
        numeric_ratio = numeric_count / total_cells if total_cells > 0 else 0
        score += (1 - numeric_ratio) * 0.15
        
        # Column name pattern detection (Rule 3, weight: 0.15, new)
        column_name_ratio = column_name_count / total_cells if total_cells > 0 else 0
        score += column_name_ratio * 0.15
        
        # Bonus: if all cells are short strings and look like column names
        if string_count == total_cells and long_text_count == 0 and column_name_count == total_cells:
            score += 0.1
        
        # Bonus: if average text length is < 30 chars (Rule 3)
        if text_lengths:
            avg_length = sum(text_lengths) / len(text_lengths)
            if avg_length < 30:
                score += 0.05
        
        return min(score, 1.0)

    @staticmethod
    def detect_table_start(df: pd.DataFrame, header_row: int) -> int:
        """
        Detect where the actual data table starts (skip description rows).
        
        Args:
            df: DataFrame
            header_row: Row index where headers are found
            
        Returns:
            int: Row index where data starts (usually header_row + 1)
        """
        # Usually data starts right after header
        data_start = header_row + 1
        
        # Check if there are empty rows after header
        for i in range(header_row + 1, min(header_row + 5, len(df))):
            row = df.iloc[i]
            # If row has significant non-null data, this is where data starts
            non_null_count = row.notna().sum()
            if non_null_count > len(row) * 0.3:  # At least 30% non-null
                data_start = i
                break
        
        return data_start

