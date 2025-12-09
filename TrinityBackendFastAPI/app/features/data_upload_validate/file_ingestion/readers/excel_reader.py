"""Robust Excel reader with multiple sheet support and header detection."""

import logging
import io
from typing import Dict, Tuple, Optional, List
import pandas as pd

from app.features.data_upload_validate.file_ingestion.processors.header_detector import HeaderDetector
from app.features.data_upload_validate.file_ingestion.processors.cleaning import DataCleaner

logger = logging.getLogger(__name__)


class ExcelReader:
    """Robust Excel reader that handles various edge cases."""

    @staticmethod
    def read(
        content: bytes,
        sheet_name: Optional[str] = None,
        auto_detect_header: bool = True,
        skip_empty_rows: bool = True,
        return_raw: bool = False,
    ) -> Tuple[Dict[str, pd.DataFrame], dict]:
        """
        Read Excel file with robust handling.
        
        Args:
            content: File content bytes
            sheet_name: Optional specific sheet name (if None, reads all sheets)
            auto_detect_header: Whether to auto-detect header row
            skip_empty_rows: Whether to skip mostly empty rows
            return_raw: If True, return raw DataFrame without header detection (all rows as data)
        
        Returns:
            Tuple of (dict of {sheet_name: DataFrame}, metadata dict)
        """
        metadata = {
            "sheet_names": [],
            "selected_sheet": None,
            "has_multiple_sheets": False,
            "header_rows": {},
            "data_start_rows": {},
        }
        
        try:
            excel_file = pd.ExcelFile(io.BytesIO(content), engine='openpyxl')
            sheet_names = excel_file.sheet_names or ["Sheet1"]
            metadata["sheet_names"] = sheet_names
            metadata["has_multiple_sheets"] = len(sheet_names) > 1
            
            # Determine which sheets to read
            sheets_to_read = [sheet_name] if sheet_name and sheet_name in sheet_names else sheet_names
            
            if sheet_name and sheet_name not in sheet_names:
                logger.warning(f"Sheet '{sheet_name}' not found, using '{sheet_names[0]}'")
                sheets_to_read = [sheet_names[0]]
            
            if sheet_name:
                metadata["selected_sheet"] = sheet_name if sheet_name in sheet_names else sheet_names[0]
            else:
                metadata["selected_sheet"] = sheets_to_read[0] if sheets_to_read else None
            
            dfs = {}
            
            for sheet in sheets_to_read:
                try:
                    # Read without header first to allow header detection
                    df_raw = pd.read_excel(
                        excel_file,
                        sheet_name=sheet,
                        header=None,
                        engine='openpyxl',
                        keep_default_na=False,  # Don't convert empty strings to NaN
                        na_values=[],  # Don't treat any values as NaN - preserve everything
                    )
                    
                    logger.info(f"Read sheet '{sheet}': {len(df_raw)} rows, {len(df_raw.columns)} columns")
                    
                    if df_raw.empty:
                        logger.warning(f"Sheet '{sheet}' is empty (no rows)")
                        dfs[sheet] = pd.DataFrame()
                        continue
                    
                    # If return_raw is True, return raw DataFrame without any header processing
                    # IMPORTANT: Return ALL rows, even if they appear empty - user needs to see everything
                    if return_raw:
                        metadata["header_rows"][sheet] = None
                        metadata["data_start_rows"][sheet] = 0
                        # Don't filter rows - return everything as-is, including empty rows
                        dfs[sheet] = df_raw.reset_index(drop=True)
                        logger.info(f"Returning raw sheet '{sheet}': {len(dfs[sheet])} rows (including empty rows)")
                        continue
                    
                    # Detect header row if requested
                    if auto_detect_header:
                        header_row = HeaderDetector.find_header_row(df_raw)
                        data_start = HeaderDetector.detect_table_start(df_raw, header_row)
                        metadata["header_rows"][sheet] = header_row
                        metadata["data_start_rows"][sheet] = data_start
                        
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
                    
                    dfs[sheet] = df
                    
                except Exception as e:
                    logger.error(f"Error reading sheet '{sheet}': {e}")
                    dfs[sheet] = pd.DataFrame()
            
            return dfs, metadata
            
        except Exception as e:
            logger.exception(f"Error reading Excel file: {e}")
            raise ValueError(f"Error parsing Excel file: {e}") from e

