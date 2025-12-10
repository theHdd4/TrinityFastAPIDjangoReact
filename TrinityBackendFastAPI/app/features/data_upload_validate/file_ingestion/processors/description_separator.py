"""Separate description/metadata rows from actual data rows."""

import logging
from typing import Tuple, List, Optional
import pandas as pd
import numpy as np

logger = logging.getLogger(__name__)

# V2.0 Configuration Constants
STABILITY_WINDOW_SIZE = 5  # Default window size for type-consistency scoring
SC_THRESHOLD = 0.85  # Threshold for stable data block (S_C)
SH_THRESHOLD = 0.3  # Threshold for header detection (S_H)
SD_THRESHOLD = 0.65  # Threshold for description detection (S_D)
MAX_ROWS_TO_SCORE = 20  # Maximum rows to score in preliminary stage


class DescriptionSeparator:
    """Separate description/metadata rows from data table."""

    @staticmethod
    def separate_description_rows(
        df: pd.DataFrame,
        max_description_rows: int = 10,
    ) -> Tuple[List[List], pd.DataFrame]:
        """
        Identify and separate description/metadata rows from data rows.
        
        V2.0 Multi-Pass Consistency-Weighted Score Model:
        - Stage 1: Preliminary Scoring (S_H, S_D, S_C for rows 0-20)
        - Stage 2: Data Start and Header Identification
        - Stage 3: Separation and Return
        
        Args:
            df: Raw DataFrame (all rows as data, no headers applied)
            max_description_rows: Maximum number of rows to check for description (legacy param, kept for compatibility)
        
        Returns:
            Tuple of (description_rows as list of lists, cleaned DataFrame)
        """
        if df.empty:
            return [], df
        
        from app.features.data_upload_validate.file_ingestion.processors.header_detector import HeaderDetector
        
        # ====================================================================
        # STAGE 1: PRELIMINARY SCORING (Rows 0 to MAX_ROWS_TO_SCORE)
        # ====================================================================
        logger.debug("V2.0 Stage 1: Preliminary Scoring")
        scores = {
            'header': {},           # S_H scores
            'description': {},      # S_D scores
            'type_consistency': {}  # S_C scores
        }
        
        rows_to_score = min(MAX_ROWS_TO_SCORE, len(df))
        for i in range(rows_to_score):
            row = df.iloc[i]
            
            # Calculate S_C (Type-Consistency Score) first (needed for S_H cross-check)
            sc_score = DescriptionSeparator._calculate_type_consistency_score(df, i, STABILITY_WINDOW_SIZE)
            scores['type_consistency'][i] = sc_score
            
            # Calculate S_H (Header Likelihood Score) with cross-check
            # Get S_C for next row if available (for cross-check boost)
            next_sc = scores['type_consistency'].get(i + 1) if i + 1 < rows_to_score else None
            sh_score = HeaderDetector._score_header_likelihood(
                row=row,
                df=df,
                row_index=i,
                type_consistency_score=next_sc
            )
            scores['header'][i] = sh_score
            
            # Calculate S_D (Description Likelihood Score)
            sd_score = DescriptionSeparator._score_description_likelihood(
                row=row,
                columns=df.columns,
                row_index=i,
                df_total_rows=len(df),
                df=df
            )
            scores['description'][i] = sd_score
        
        logger.debug(f"Scored {rows_to_score} rows: S_C range [{min(scores['type_consistency'].values()):.3f}, {max(scores['type_consistency'].values()):.3f}], "
                    f"S_H range [{min(scores['header'].values()):.3f}, {max(scores['header'].values()):.3f}], "
                    f"S_D range [{min(scores['description'].values()):.3f}, {max(scores['description'].values()):.3f}]")
        
        # ====================================================================
        # STAGE 2: DATA START AND HEADER IDENTIFICATION
        # ====================================================================
        logger.debug("V2.0 Stage 2: Data Start and Header Identification")
        
        # Find Data Start (Start_Data): row with max S_C that exceeds threshold
        candidate_starts = [
            i for i, sc in scores['type_consistency'].items()
            if sc > SC_THRESHOLD
        ]
        
        if candidate_starts:
            # Find the candidate with highest S_C
            start_data = max(candidate_starts, key=lambda i: scores['type_consistency'][i])
            logger.info(f"V2.0: Found data start at row {start_data} (S_C: {scores['type_consistency'][start_data]:.3f})")
        else:
            # V2.0 Fallback: Use relaxed threshold (0.6) instead of old logic
            logger.warning(f"V2.0: No row found with S_C > {SC_THRESHOLD}, using relaxed threshold 0.6")
            relaxed_candidates = [
                i for i, sc in scores['type_consistency'].items()
                if sc > 0.6  # Relaxed threshold
            ]
            
            if relaxed_candidates:
                # Use best S_C from relaxed candidates
                start_data = max(relaxed_candidates, key=lambda i: scores['type_consistency'][i])
                logger.info(f"V2.0: Found data start at row {start_data} with relaxed threshold (S_C: {scores['type_consistency'][start_data]:.3f})")
            elif scores['type_consistency']:
                # Use row with highest S_C even if below 0.6
                best_sc_row = max(scores['type_consistency'].items(), key=lambda x: x[1])
                start_data = best_sc_row[0]
                best_sc_value = best_sc_row[1]
                logger.warning(f"V2.0: Using row {start_data} with best S_C {best_sc_value:.3f} (below relaxed threshold)")
            else:
                # Last resort: use row 0 (assume no description rows)
                logger.warning("V2.0: No type consistency scores available, defaulting to row 0")
                start_data = 0
        
        # Safety check: ensure start_data is valid
        if start_data >= len(df):
            logger.error(f"Data start {start_data} >= total rows {len(df)}! Using row 0.")
            start_data = 0
        
        # Find Header Row (Row_Header): search from Row 0 to Start_Data
        header_candidates = {
            i: scores['header'][i]
            for i in range(start_data + 1)
            if i in scores['header']
        }
        
        row_header = -1
        if header_candidates:
            row_header = max(header_candidates, key=header_candidates.get)
            max_header_score = header_candidates[row_header]
            if max_header_score > SH_THRESHOLD:
                logger.info(f"Found header row at index {row_header} (S_H: {max_header_score:.3f})")
            else:
                logger.debug(f"Header candidate at row {row_header} has low score {max_header_score:.3f} < {SH_THRESHOLD}, treating as no header")
                row_header = -1
        else:
            logger.debug("No header candidates found")
        
        # Determine Final Data Block Start (Row_FinalStart)
        if row_header >= 0:
            row_final_start = row_header  # Header is first row of data block
            logger.info(f"Final data block starts at row {row_final_start} (header row)")
        else:
            row_final_start = start_data  # No header, start at data block
            logger.info(f"Final data block starts at row {row_final_start} (no header detected)")
        
        # ====================================================================
        # STAGE 3: SEPARATION AND RETURN
        # ====================================================================
        logger.debug("V2.0 Stage 3: Separation and Return")
        
        # Extract Data DataFrame
        df_data = df.iloc[row_final_start:].copy()
        
        # Collect Description Rows (rows 0 to row_final_start - 1)
        description_rows = []
        for i in range(row_final_start):
            # CRITICAL: If this was the header row, skip it (it's in df_data)
            if i == row_header:
                logger.debug(f"Row {i} is the header row - skipping from description rows (it's in df_data)")
                continue
            description_rows.append(df.iloc[i].fillna("").astype(str).tolist())
        
        # ====================================================================
        # SAFETY CHECKS
        # ====================================================================
        # Check: if df_data is empty, return all rows as data
        if df_data.empty or len(df_data) == 0:
            logger.warning(f"No data rows found after separation! Total rows: {len(df)}. Returning all rows as data rows.")
            return [], df.reset_index(drop=True)
        
        # Check: if we filtered out too many rows (>90%), reset
        if len(df_data) < len(df) * 0.1:
            logger.warning(f"Too few data rows ({len(df_data)} out of {len(df)}). Resetting to treat all rows as data.")
            return [], df.reset_index(drop=True)
        
        # Check: for small files, if row_final_start is too high, reset
        if len(df) < 50 and row_final_start > max(1, len(df) * 0.1):
            logger.warning(f"Final start {row_final_start} is too high for {len(df)} row file. Resetting to 0.")
            return [], df.reset_index(drop=True)
        
        # Detect where data block ends (Rule 4) - but be VERY conservative
        data_end = DescriptionSeparator._detect_data_block_end(df_data, start_row=0)
        
        # Trim data to end of block (but be VERY conservative)
        original_len = len(df_data)
        if data_end < original_len and original_len > 100 and data_end > 50:
            trim_ratio = data_end / original_len
            if trim_ratio > 0.5:  # Keep at least 50% of data
                df_data = df_data.iloc[:data_end].copy()
                logger.debug(f"Trimmed data block: kept {data_end} rows out of {original_len} ({trim_ratio:.1%})")
            else:
                logger.debug(f"Skipping trim - would remove too much data ({trim_ratio:.1%} kept)")
        elif data_end < original_len:
            logger.debug(f"Skipping trim - not enough data to justify trimming ({original_len} rows, trim at {data_end})")
        
        # Final check: if df_data is empty after trimming, return all rows as data
        if df_data.empty or len(df_data) == 0:
            logger.warning(f"After all processing, df_data is empty! Returning all {len(df)} rows as data rows.")
            return [], df.reset_index(drop=True)
        
        # Reset index
        df_data = df_data.reset_index(drop=True)
        
        logger.info(f"V2.0 Description separation: {len(description_rows)} description rows, {len(df_data)} data rows "
                   f"(from {len(df)} total rows, header at row {row_header if row_header >= 0 else 'none'})")
        
        return description_rows, df_data

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
        
        # Final score (pattern-agnostic - no metadata pattern matching)
        data_score = fill_score + consistency_score + short_text_score - long_text_penalty
        
        return max(0.0, min(1.0, data_score))

    @staticmethod
    def _calculate_type_consistency_score(
        df: pd.DataFrame, 
        start_row: int, 
        window_size: int = STABILITY_WINDOW_SIZE
    ) -> float:
        """
        Calculate Type-Consistency Score (S_C) for a potential data block start.
        
        This metric assesses how uniform data types are across a window of rows,
        indicating the presence of a stable, homogeneous data table.
        
        Args:
            df: Raw DataFrame
            start_row: Potential start row index
            window_size: Number of rows to look ahead (default: STABILITY_WINDOW_SIZE)
        
        Returns:
            float: Score between 0.0 and 1.0 (higher = more type-consistent)
        """
        if df.empty or start_row >= len(df):
            return 0.0
        
        # Determine actual window size (may be smaller if near end of DataFrame)
        actual_window_size = min(window_size, len(df) - start_row)
        if actual_window_size == 0:
            return 0.0
        
        # Select lookahead block
        block = df.iloc[start_row:start_row + actual_window_size]
        total_cols = len(df.columns)
        
        if total_cols == 0:
            return 0.0
        
        # Track stable columns (columns where ≥50% of non-null cells match modal type)
        stable_cells = 0
        total_cells = 0
        
        # Process each column
        for col_idx in range(total_cols):
            col_data = block.iloc[:, col_idx]
            non_null_data = col_data.dropna()
            
            if len(non_null_data) == 0:
                # All NaN column - contributes 0 to score
                total_cells += actual_window_size
                continue
            
            # Determine modal type (most frequent type)
            type_counts = {}
            for val in non_null_data:
                # Infer type using pandas
                inferred_type = pd.api.types.infer_dtype(pd.Series([val]), skipna=False)
                # Normalize types: 'integer'/'floating' -> 'numeric', 'datetime' -> 'datetime', else -> 'string'
                if inferred_type in ['integer', 'floating', 'mixed-integer-float']:
                    normalized_type = 'numeric'
                elif inferred_type in ['datetime', 'datetime64']:
                    normalized_type = 'datetime'
                elif inferred_type == 'empty':
                    normalized_type = 'empty'
                else:
                    normalized_type = 'string'
                
                type_counts[normalized_type] = type_counts.get(normalized_type, 0) + 1
            
            # Find modal type
            if not type_counts:
                modal_type = None
            else:
                modal_type = max(type_counts, key=type_counts.get)
                modal_count = type_counts[modal_type]
            
            # Check if column is stable (≥50% of non-null cells match modal type)
            if modal_type and modal_count / len(non_null_data) >= 0.5:
                # Column is stable - count matching cells
                matching_cells = 0
                for val in col_data:
                    if pd.isna(val):
                        # NaN cells don't match modal type (penalized)
                        total_cells += 1
                        continue
                    
                    # Infer type of this cell
                    inferred_type = pd.api.types.infer_dtype(pd.Series([val]), skipna=False)
                    if inferred_type in ['integer', 'floating', 'mixed-integer-float']:
                        cell_type = 'numeric'
                    elif inferred_type in ['datetime', 'datetime64']:
                        cell_type = 'datetime'
                    elif inferred_type == 'empty':
                        cell_type = 'empty'
                    else:
                        cell_type = 'string'
                    
                    if cell_type == modal_type:
                        matching_cells += 1
                        stable_cells += 1
                    
                    total_cells += 1
            else:
                # Column is unstable (<50% match modal type) - contributes 0 to score
                total_cells += actual_window_size
        
        # Calculate score: ratio of stable cells to total cells
        if total_cells == 0:
            return 0.0
        
        score = stable_cells / total_cells
        return max(0.0, min(1.0, score))

    @staticmethod
    def _score_description_likelihood(
        row: pd.Series, 
        columns: pd.Index, 
        row_index: int = -1, 
        df_total_rows: int = 0, 
        df: Optional[pd.DataFrame] = None
    ) -> float:
        """
        Score how likely a row is to be a description/metadata row (S_D).
        
        Converts the boolean _is_description_row logic to a score (0.0-1.0).
        Higher score = more likely to be description row.
        
        Args:
            row: Row to analyze
            columns: Column index
            row_index: Index of row in DataFrame
            df_total_rows: Total rows in DataFrame
            df: Full DataFrame (for comparing with subsequent rows)
        
        Returns:
            float: Score between 0.0 and 1.0 (higher = more likely description)
        """
        total_cols = len(columns)
        non_null_count = row.notna().sum()
        fill_ratio = non_null_count / total_cols if total_cols > 0 else 0
        
        # Check if this row looks like column headers FIRST
        # Header rows should have LOW description score
        if row_index >= 0 and row_index < 10:
            from app.features.data_upload_validate.file_ingestion.processors.header_detector import HeaderDetector
            header_score = HeaderDetector._score_header_likelihood(
                row=row,
                df=df,
                row_index=row_index,
                type_consistency_score=None  # Not available in this context
            )
            # If row looks like headers, it's NOT a description row
            if header_score > 0.3:
                # Return low description score (inverted)
                return max(0.0, 1.0 - header_score)
        
        # Calculate text length statistics
        text_lengths = []
        numeric_count = 0
        very_long_text_count = 0  # > 200 chars
        
        for val in row:
            if pd.notna(val):
                val_str = str(val).strip()
                text_lengths.append(len(val_str))
                
                if len(val_str) > 200:
                    very_long_text_count += 1
                
                try:
                    float(val_str.replace(',', '').replace('$', '').replace('%', '').strip())
                    numeric_count += 1
                except (ValueError, AttributeError):
                    pass
        
        avg_text_length = sum(text_lengths) / len(text_lengths) if text_lengths else 0
        very_long_text_ratio = very_long_text_count / non_null_count if non_null_count > 0 else 0
        numeric_ratio = numeric_count / non_null_count if non_null_count > 0 else 0
        
        # Statistical comparison with subsequent rows
        structural_mismatch_score = 0.0
        if df is not None and row_index >= 0 and row_index < len(df) - 1:
            comparison_rows = []
            for i in range(row_index + 1, min(row_index + 4, len(df))):
                comparison_rows.append(df.iloc[i])
            
            if comparison_rows:
                avg_comparison_fill = sum(
                    comp_row.notna().sum() / len(columns) 
                    for comp_row in comparison_rows
                ) / len(comparison_rows)
                
                avg_comparison_text_length = 0
                comparison_text_count = 0
                for comp_row in comparison_rows:
                    for val in comp_row:
                        if pd.notna(val):
                            avg_comparison_text_length += len(str(val).strip())
                            comparison_text_count += 1
                avg_comparison_text_length = avg_comparison_text_length / comparison_text_count if comparison_text_count > 0 else 0
                
                fill_diff = abs(fill_ratio - avg_comparison_fill)
                text_diff = abs(avg_text_length - avg_comparison_text_length) if avg_text_length > 0 else 0
                
                if fill_diff > 0.3:
                    structural_mismatch_score += 0.3
                if text_diff > 100:
                    structural_mismatch_score += 0.3
        
        # Position-based heuristics
        position_score = 0.0
        if row_index >= 0:
            if row_index < 5:
                position_score = 0.2
            elif row_index < 10:
                position_score = 0.1
        
        # Base consistency score (inverted - lower consistency = higher description score)
        consistency_score = DescriptionSeparator._compute_data_consistency_score(row, columns)
        
        # Penalties that increase description score
        fill_penalty = 0.0
        if fill_ratio < 0.2:
            fill_penalty = 0.3
        
        long_text_penalty = very_long_text_ratio * 0.2
        mismatch_penalty = structural_mismatch_score
        sparse_penalty = 0.0
        if row_index >= 0 and row_index < 5 and fill_ratio < 0.15:
            sparse_penalty = 0.2
        
        # Calculate description score (inverted from data score)
        # Lower consistency + higher penalties + position = higher description score
        description_score = (1.0 - consistency_score) + fill_penalty + long_text_penalty + mismatch_penalty + sparse_penalty + position_score
        
        # Normalize to 0.0-1.0 range
        return max(0.0, min(1.0, description_score))

    @staticmethod
    def _is_description_row(row: pd.Series, columns: pd.Index, row_index: int = -1, df_total_rows: int = 0, df: pd.DataFrame = None) -> bool:
        """
        Determine if a row is a description/metadata row using robust structural analysis.
        
        Pattern-agnostic approach using:
        1. Structural analysis (fill ratio, text length distribution)
        2. Statistical comparison with subsequent rows
        3. Position-based heuristics (description rows are usually early)
        4. Header detection (header rows are NOT description rows)
        
        Args:
            row: Row to analyze
            columns: Column index
            row_index: Index of row in DataFrame (for position-based heuristics)
            df_total_rows: Total rows in DataFrame
            df: Full DataFrame (for comparing with subsequent rows)
        
        Returns:
            bool: True if row is likely a description/metadata row
        """
        total_cols = len(columns)
        non_null_count = row.notna().sum()
        fill_ratio = non_null_count / total_cols if total_cols > 0 else 0
        
        # CRITICAL: Check if this row looks like column headers FIRST
        # Header rows should NEVER be treated as description rows
        # Check ALL rows (not just first 3) - headers can be anywhere in first few rows
        if row_index >= 0 and row_index < 10:  # Check first 10 rows for headers
            from app.features.data_upload_validate.file_ingestion.processors.header_detector import HeaderDetector
            header_score = HeaderDetector._score_header_likelihood(
                row=row,
                df=df,
                row_index=row_index,
                type_consistency_score=None  # Not available in this context
            )
            # Lower threshold: if row looks like headers (score > 0.3), it's NOT a description row
            # This ensures rows with column names (even if they contain ':') are preserved
            if header_score > 0.3:
                logger.debug(f"Row {row_index} detected as header row (score: {header_score:.2f}), NOT description")
                return False
            
            # Additional check: if row has many non-empty values that look like column names, it's likely a header
            # This catches cases where header_score might be lower due to special characters
            non_empty_values = [str(val).strip() for val in row if pd.notna(val) and str(val).strip()]
            if len(non_empty_values) >= total_cols * 0.5:  # At least 50% of columns have values
                # Check if most values look like column names (short text, not very long)
                column_name_like_count = sum(
                    1 for val in non_empty_values 
                    if 1 <= len(val) <= 50 and not val.startswith('=') and not val.endswith('=')
                )
                column_name_ratio = column_name_like_count / len(non_empty_values) if non_empty_values else 0
                if column_name_ratio >= 0.7:  # 70%+ look like column names
                    logger.debug(f"Row {row_index} detected as header row (has {column_name_like_count} column-name-like values), NOT description")
                    return False
        
        # STRUCTURAL ANALYSIS: Analyze row structure
        # Description rows typically have:
        # - Low fill ratio (sparse data)
        # - Long text strings (metadata descriptions)
        # - Inconsistent structure compared to data rows
        
        # Calculate text length statistics
        text_lengths = []
        numeric_count = 0
        very_long_text_count = 0  # > 200 chars
        
        for val in row:
            if pd.notna(val):
                val_str = str(val).strip()
                text_lengths.append(len(val_str))
                
                # Count very long text (typical of description rows)
                if len(val_str) > 200:
                    very_long_text_count += 1
                
                # Try to parse as numeric
                try:
                    float(val_str.replace(',', '').replace('$', '').replace('%', '').strip())
                    numeric_count += 1
                except (ValueError, AttributeError):
                    pass
        
        avg_text_length = sum(text_lengths) / len(text_lengths) if text_lengths else 0
        very_long_text_ratio = very_long_text_count / non_null_count if non_null_count > 0 else 0
        numeric_ratio = numeric_count / non_null_count if non_null_count > 0 else 0
        
        # STATISTICAL COMPARISON: Compare with subsequent rows (if available)
        # Description rows have different structure than data rows
        structural_mismatch_score = 0.0
        if df is not None and row_index >= 0 and row_index < len(df) - 1:
            # Compare with next 3 rows to see if this row matches data pattern
            comparison_rows = []
            for i in range(row_index + 1, min(row_index + 4, len(df))):
                comparison_rows.append(df.iloc[i])
            
            if comparison_rows:
                # Calculate average fill ratio of comparison rows
                avg_comparison_fill = sum(
                    comp_row.notna().sum() / len(columns) 
                    for comp_row in comparison_rows
                ) / len(comparison_rows)
                
                # Calculate average text length of comparison rows
                avg_comparison_text_length = 0
                comparison_text_count = 0
                for comp_row in comparison_rows:
                    for val in comp_row:
                        if pd.notna(val):
                            avg_comparison_text_length += len(str(val).strip())
                            comparison_text_count += 1
                avg_comparison_text_length = avg_comparison_text_length / comparison_text_count if comparison_text_count > 0 else 0
                
                # If this row's structure is very different from subsequent rows, it's likely description
                fill_diff = abs(fill_ratio - avg_comparison_fill)
                text_diff = abs(avg_text_length - avg_comparison_text_length) if avg_text_length > 0 else 0
                
                # High difference indicates structural mismatch (likely description row)
                if fill_diff > 0.3:  # Fill ratio differs by >30%
                    structural_mismatch_score += 0.3
                if text_diff > 100:  # Average text length differs by >100 chars
                    structural_mismatch_score += 0.3
        
        # POSITION-BASED HEURISTICS: Description rows are usually early in file
        # But we need to be careful - header rows are also early!
        position_score = 0.0
        if row_index >= 0:
            # First 5 rows are more likely to be description (but not headers - already checked above)
            if row_index < 5:
                position_score = 0.2
            elif row_index < 10:
                position_score = 0.1
        
        # COMPUTE FINAL SCORE: Lower score = more likely description row
        # Base score from consistency
        consistency_score = DescriptionSeparator._compute_data_consistency_score(row, columns)
        
        # Penalties for description row characteristics:
        # 1. Very low fill ratio (< 20%)
        fill_penalty = 0.0
        if fill_ratio < 0.2:
            fill_penalty = 0.3
        
        # 2. Very long text (typical of description rows)
        long_text_penalty = very_long_text_ratio * 0.2
        
        # 3. Structural mismatch with subsequent rows
        mismatch_penalty = structural_mismatch_score
        
        # 4. Very sparse rows early in file (likely padded description rows)
        sparse_penalty = 0.0
        if row_index >= 0 and row_index < 5 and fill_ratio < 0.15:
            sparse_penalty = 0.2
        
        # Final score: lower = more likely description
        final_score = consistency_score - fill_penalty - long_text_penalty - mismatch_penalty - sparse_penalty + position_score
        
        # Threshold: score < 0.35 = description row (adjusted for new scoring)
        is_description = final_score < 0.35
        
        if is_description:
            logger.debug(
                f"Row {row_index} detected as description "
                f"(score: {final_score:.2f}, fill: {fill_ratio:.2f}, "
                f"avg_text_len: {avg_text_length:.1f}, very_long_ratio: {very_long_text_ratio:.2f})"
            )
        
        return is_description

