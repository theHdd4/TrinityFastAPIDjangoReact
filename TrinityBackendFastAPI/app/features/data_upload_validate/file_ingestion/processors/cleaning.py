"""Data cleaning and normalization utilities."""

import logging
import re
from typing import List
import pandas as pd

logger = logging.getLogger(__name__)


class DataCleaner:
    """Clean and normalize dataframes."""

    @staticmethod
    def standardize_headers(df: pd.DataFrame) -> pd.DataFrame:
        """
        Standardize column names:
        - Strip whitespace
        - Convert to lowercase
        - Replace special characters with underscores
        - Remove duplicate underscores
        """
        new_columns = []
        for col in df.columns:
            # Convert to string and strip
            col_str = str(col).strip()
            
            # Convert to lowercase
            col_str = col_str.lower()
            
            # Replace non-alphanumeric characters (except underscores) with underscores
            col_str = re.sub(r'[^a-z0-9_]+', '_', col_str)
            
            # Remove duplicate underscores
            col_str = re.sub(r'_+', '_', col_str)
            
            # Remove leading/trailing underscores
            col_str = col_str.strip('_')
            
            # Handle empty column names
            if not col_str:
                col_str = f"unnamed_{len(new_columns)}"
            
            new_columns.append(col_str)
        
        # Handle duplicate column names
        seen = {}
        final_columns = []
        for col in new_columns:
            if col in seen:
                seen[col] += 1
                final_columns.append(f"{col}_{seen[col]}")
            else:
                seen[col] = 0
                final_columns.append(col)
        
        df.columns = final_columns
        return df

    @staticmethod
    def normalize_column_names(df: pd.DataFrame) -> pd.DataFrame:
        """
        Normalize column names: replace blank/empty names with 'Unnamed: 0', 'Unnamed: 1', etc.
        Similar to Excel behavior.
        """
        columns = df.columns.tolist()
        new_columns = []
        unnamed_counter = 0
        
        for col in columns:
            col_str = str(col).strip()
            if not col_str or col_str == "":
                new_col = f"Unnamed: {unnamed_counter}"
                unnamed_counter += 1
                new_columns.append(new_col)
            else:
                new_columns.append(col_str)
        
        if new_columns != columns:
            df = df.rename(dict(zip(columns, new_columns)))
        
        return df

    @staticmethod
    def remove_empty_rows(df: pd.DataFrame, threshold: float = 0.9) -> pd.DataFrame:
        """
        Remove rows that are mostly empty.
        
        Args:
            df: DataFrame
            threshold: Fraction of cells that must be empty for row to be removed (default 0.9)
        
        Returns:
            DataFrame with empty rows removed
        """
        if df.empty:
            return df
        
        # Count non-null values per row
        non_null_counts = df.notna().sum(axis=1)
        total_cols = len(df.columns)
        
        # Keep rows where at least (1-threshold) cells are non-null
        min_non_null = int(total_cols * (1 - threshold))
        mask = non_null_counts >= min_non_null
        
        removed_count = (~mask).sum()
        if removed_count > 0:
            logger.debug(f"Removed {removed_count} empty rows")
        
        return df[mask].reset_index(drop=True)

    @staticmethod
    def remove_empty_columns(df: pd.DataFrame, threshold: float = 0.9) -> pd.DataFrame:
        """
        Remove columns that are mostly empty.
        
        Args:
            df: DataFrame
            threshold: Fraction of cells that must be empty for column to be removed (default 0.9)
        
        Returns:
            DataFrame with empty columns removed
        """
        if df.empty:
            return df
        
        # Count non-null values per column
        non_null_counts = df.notna().sum(axis=0)
        total_rows = len(df)
        
        # Keep columns where at least (1-threshold) cells are non-null
        min_non_null = int(total_rows * (1 - threshold))
        mask = non_null_counts >= min_non_null
        
        removed_count = (~mask).sum()
        if removed_count > 0:
            logger.debug(f"Removed {removed_count} empty columns")
        
        return df.loc[:, mask]

