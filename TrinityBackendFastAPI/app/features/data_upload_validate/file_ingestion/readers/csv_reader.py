"""Robust CSV reader with encoding detection and header detection."""

import logging
import io
from typing import Tuple, Optional
import pandas as pd

from app.features.data_upload_validate.file_ingestion.detectors.encoding_detector import EncodingDetector
from app.features.data_upload_validate.file_ingestion.processors.header_detector import HeaderDetector
from app.features.data_upload_validate.file_ingestion.processors.cleaning import DataCleaner

logger = logging.getLogger(__name__)

# Check pandas version for compatibility
PANDAS_VERSION = tuple(map(int, pd.__version__.split('.')[:2]))
SUPPORTS_ON_BAD_LINES = PANDAS_VERSION >= (1, 3)


class CSVReader:
    """Robust CSV reader that handles various edge cases."""

    @staticmethod
    def read(
        content: bytes,
        filename: Optional[str] = None,
        delimiter: Optional[str] = None,
        auto_detect_header: bool = True,
        skip_empty_rows: bool = True,
        return_raw: bool = False,
    ) -> Tuple[pd.DataFrame, dict]:
        """
        Read CSV file with robust handling.
        
        Args:
            content: File content bytes
            filename: Optional filename for extension detection
            delimiter: Optional delimiter (auto-detected if None)
            auto_detect_header: Whether to auto-detect header row
            skip_empty_rows: Whether to skip mostly empty rows
            return_raw: If True, return raw DataFrame without header detection (all rows as data)
        
        Returns:
            Tuple of (DataFrame, metadata dict)
        """
        metadata = {
            "encoding": "utf-8",
            "delimiter": ",",
            "header_row": 0,
            "data_start_row": 1,
            "parsing_method": "standard",
        }
        
        # Detect encoding
        encoding = EncodingDetector.detect(content)
        metadata["encoding"] = encoding
        
        # Detect delimiter if not provided
        if delimiter is None:
            delimiter = CSVReader._detect_delimiter(content, encoding)
        metadata["delimiter"] = delimiter
        
        # CRITICAL FIX: Find maximum column count across all rows first
        # This prevents truncation when description rows have fewer columns than data rows
        max_cols = CSVReader._find_max_columns(content, encoding, delimiter)
        logger.debug(f"Detected maximum columns: {max_cols}")
        
        # Try reading with detected encoding
        try:
            # First, read without header to allow header detection
            # Use error_bad_lines for older pandas, on_bad_lines for newer
            read_kwargs = {
                "encoding": encoding,
                "sep": delimiter,
                "header": None,
                "low_memory": False,
                "engine": "python",  # More flexible parsing
            }
            # Handle pandas version differences
            if SUPPORTS_ON_BAD_LINES:
                # pandas >= 1.3.0
                read_kwargs["on_bad_lines"] = "skip"
            else:
                # pandas < 1.3.0
                read_kwargs["error_bad_lines"] = False
                read_kwargs["warn_bad_lines"] = False
            
            # CRITICAL: Use names parameter to ensure all columns are preserved
            # Create column names for all columns up to max_cols
            if max_cols > 0:
                read_kwargs["names"] = [f"col_{i}" for i in range(max_cols)]
            
            df_raw = pd.read_csv(io.BytesIO(content), **read_kwargs)
        except Exception as e:
            logger.warning(f"Failed to read CSV with {encoding}: {e}, trying fallback encodings")
            # Try fallback encodings
            for fallback_enc in ['latin-1', 'cp1252', 'iso-8859-1']:
                try:
                    read_kwargs = {
                        "encoding": fallback_enc,
                        "sep": delimiter,
                        "header": None,
                        "low_memory": False,
                        "engine": "python",
                    }
                    if SUPPORTS_ON_BAD_LINES:
                        read_kwargs["on_bad_lines"] = "skip"
                    else:
                        read_kwargs["error_bad_lines"] = False
                        read_kwargs["warn_bad_lines"] = False
                    
                    # CRITICAL: Use names parameter to ensure all columns are preserved
                    if max_cols > 0:
                        read_kwargs["names"] = [f"col_{i}" for i in range(max_cols)]
                    
                    df_raw = pd.read_csv(io.BytesIO(content), **read_kwargs)
                    metadata["encoding"] = fallback_enc
                    metadata["parsing_method"] = "fallback_encoding"
                    break
                except Exception:
                    continue
            else:
                # Last resort: read with errors='ignore'
                read_kwargs = {
                    "encoding": "utf-8",
                    "errors": "ignore",
                    "sep": delimiter,
                    "header": None,
                    "low_memory": False,
                    "engine": "python",
                }
                if SUPPORTS_ON_BAD_LINES:
                    read_kwargs["on_bad_lines"] = "skip"
                else:
                    read_kwargs["error_bad_lines"] = False
                    read_kwargs["warn_bad_lines"] = False
                
                # CRITICAL: Use names parameter to ensure all columns are preserved
                if max_cols > 0:
                    read_kwargs["names"] = [f"col_{i}" for i in range(max_cols)]
                
                df_raw = pd.read_csv(io.BytesIO(content), **read_kwargs)
                metadata["encoding"] = "utf-8"
                metadata["parsing_method"] = "ignore_errors"
        
        if df_raw.empty:
            return pd.DataFrame(), metadata
        
        # If return_raw is True, return raw DataFrame without any header processing
        if return_raw:
            metadata["header_row"] = None
            metadata["data_start_row"] = 0
            metadata["parsing_method"] = "raw"
            # Don't skip empty rows for raw mode - user needs to see everything
            return df_raw.reset_index(drop=True), metadata
        
        # Detect header row if requested
        if auto_detect_header:
            header_row = HeaderDetector.find_header_row(df_raw)
            data_start = HeaderDetector.detect_table_start(df_raw, header_row)
            metadata["header_row"] = header_row
            metadata["data_start_row"] = data_start
            
            # Extract headers and data
            headers = df_raw.iloc[header_row].fillna("").astype(str).tolist()
            df = df_raw.iloc[data_start:].copy()
            df.columns = headers
        else:
            # Use first row as header
            headers = df_raw.iloc[0].fillna("").astype(str).tolist()
            df = df_raw.iloc[1:].copy()
            df.columns = headers
        
        # Clean headers
        df = DataCleaner.normalize_column_names(df)
        df = DataCleaner.standardize_headers(df)
        
        # Remove empty rows/columns if requested
        if skip_empty_rows:
            df = DataCleaner.remove_empty_rows(df)
        
        df = DataCleaner.remove_empty_columns(df)
        
        # Reset index
        df = df.reset_index(drop=True)
        
        return df, metadata

    @staticmethod
    def _detect_delimiter(content: bytes, encoding: str, sample_size: int = 8192) -> str:
        """Detect CSV delimiter from content."""
        try:
            sample = content[:sample_size].decode(encoding, errors='ignore')
            lines = sample.split('\n')[:10]  # Check first 10 lines
            
            delimiters = [',', '\t', ';', '|']
            delimiter_counts = {d: 0 for d in delimiters}
            
            for line in lines:
                if not line.strip():
                    continue
                for delim in delimiters:
                    delimiter_counts[delim] += line.count(delim)
            
            # Return delimiter with highest count
            best_delimiter = max(delimiter_counts.items(), key=lambda x: x[1])[0]
            
            # Default to comma if no clear winner
            if delimiter_counts[best_delimiter] == 0:
                return ','
            
            return best_delimiter
        except Exception:
            return ','  # Default to comma
    
    @staticmethod
    def _find_max_columns(content: bytes, encoding: str, delimiter: str, sample_rows: int = 0) -> int:
        """
        Find the maximum number of columns across all rows in the CSV file.
        This prevents truncation when description rows have fewer columns than data rows.
        
        Args:
            content: File content bytes
            encoding: File encoding
            delimiter: CSV delimiter
            sample_rows: Number of rows to sample (0 = all rows, default: scan all)
        
        Returns:
            Maximum column count found
        """
        try:
            import csv as csv_module
            
            # Decode content
            text_content = content.decode(encoding, errors='ignore')
            
            # Use csv module to parse and count columns per row
            max_cols = 0
            row_count = 0
            
            # Create a StringIO object for csv reader
            csv_reader = csv_module.reader(
                io.StringIO(text_content),
                delimiter=delimiter,
                quoting=csv_module.QUOTE_MINIMAL
            )
            
            # CRITICAL: Scan ALL rows (or sample_rows if specified) to find true maximum
            # This is essential because description rows at the start may have fewer columns
            # than data rows that come later
            for row in csv_reader:
                if sample_rows > 0 and row_count >= sample_rows:
                    break
                col_count = len(row)
                if col_count > max_cols:
                    max_cols = col_count
                row_count += 1
            
            logger.debug(f"Scanned {row_count} rows, found max columns: {max_cols}")
            return max_cols if max_cols > 0 else 1  # At least 1 column
            
        except Exception as e:
            logger.warning(f"Error finding max columns: {e}, defaulting to 100")
            # Fallback: return a reasonable default
            return 100

