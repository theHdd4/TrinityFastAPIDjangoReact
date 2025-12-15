"""
Robust File Reader - Main entry point for file ingestion pipeline.
Handles CSV, Excel files with automatic header detection, encoding detection, etc.
"""

import logging
from typing import Dict, Tuple, Optional
import pandas as pd
import polars as pl

from app.features.data_upload_validate.file_ingestion.detectors.file_type_detector import FileTypeDetector
from app.features.data_upload_validate.file_ingestion.readers.csv_reader import CSVReader
from app.features.data_upload_validate.file_ingestion.readers.excel_reader import ExcelReader

logger = logging.getLogger(__name__)


class RobustFileReader:
    """
    Robust file reader that handles various file formats and edge cases.
    
    Features:
    - Automatic file type detection
    - Encoding detection for CSV files
    - Header row detection (headers not in first row)
    - Multiple sheet support for Excel
    - Automatic cleaning and normalization
    """

    @staticmethod
    def read_file(
        content: bytes,
        filename: str,
        sheet_name: Optional[str] = None,
        auto_detect_header: bool = True,
        return_polars: bool = False,
        return_raw: bool = False,
    ) -> Tuple[pl.DataFrame | pd.DataFrame | Dict[str, pd.DataFrame], Dict]:
        """
        Read file with robust handling.
        
        Args:
            content: File content bytes
            filename: Filename (used for type detection)
            sheet_name: Optional sheet name for Excel files
            auto_detect_header: Whether to auto-detect header row
            return_polars: If True, return Polars DataFrame(s), else Pandas
            return_raw: If True, return raw DataFrame without header detection (all rows as data)
        
        Returns:
            Tuple of (DataFrame or dict of DataFrames, metadata dict)
        """
        # Detect file type
        file_type = FileTypeDetector.detect_from_bytes(content, filename)
        
        metadata = {
            "file_type": file_type,
            "filename": filename,
            "auto_detect_header": auto_detect_header,
        }
        
        if file_type == "csv" or file_type == "tsv":
            delimiter = "\t" if file_type == "tsv" else None
            df, csv_metadata = CSVReader.read(
                content=content,
                filename=filename,
                delimiter=delimiter,
                auto_detect_header=auto_detect_header if not return_raw else False,
                return_raw=return_raw,
            )
            metadata.update(csv_metadata)
            
            if return_polars:
                df = pl.from_pandas(df)
            
            return df, metadata
        
        elif file_type == "excel":
            dfs_dict, excel_metadata = ExcelReader.read(
                content=content,
                sheet_name=sheet_name,
                auto_detect_header=auto_detect_header if not return_raw else False,
                return_raw=return_raw,
            )
            metadata.update(excel_metadata)
            
            if return_polars:
                dfs_dict = {k: pl.from_pandas(v) for k, v in dfs_dict.items()}
            
            # If only one sheet, return DataFrame directly; otherwise return dict
            if len(dfs_dict) == 1:
                return list(dfs_dict.values())[0], metadata
            return dfs_dict, metadata
        
        else:
            raise ValueError(f"Unsupported file type: {file_type}")

    @staticmethod
    def read_file_to_polars(
        content: bytes,
        filename: str,
        sheet_name: Optional[str] = None,
        auto_detect_header: bool = True,
        return_raw: bool = False,
    ) -> Tuple[pl.DataFrame | Dict[str, pl.DataFrame], Dict]:
        """Convenience method to read file and return Polars DataFrame(s)."""
        return RobustFileReader.read_file(
            content=content,
            filename=filename,
            sheet_name=sheet_name,
            auto_detect_header=auto_detect_header,
            return_polars=True,
            return_raw=return_raw,
        )

    @staticmethod
    def read_file_to_pandas(
        content: bytes,
        filename: str,
        sheet_name: Optional[str] = None,
        auto_detect_header: bool = True,
        return_raw: bool = False,
    ) -> Tuple[pd.DataFrame | Dict[str, pd.DataFrame], Dict]:
        """Convenience method to read file and return Pandas DataFrame(s)."""
        return RobustFileReader.read_file(
            content=content,
            filename=filename,
            sheet_name=sheet_name,
            auto_detect_header=auto_detect_header,
            return_polars=False,
            return_raw=return_raw,
        )

