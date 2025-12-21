"""File type detection using file extension and content-based detection."""

import logging
import io
from typing import Optional

logger = logging.getLogger(__name__)

# Try to import python-magic for content-based detection
try:
    import magic
    MAGIC_AVAILABLE = True
except ImportError:
    try:
        import filetype
        FILETYPE_AVAILABLE = True
        MAGIC_AVAILABLE = False
    except ImportError:
        MAGIC_AVAILABLE = False
        FILETYPE_AVAILABLE = False
        logger.warning("Neither python-magic nor filetype available, using extension-based detection only")


class FileTypeDetector:
    """Detect file type from content and/or extension."""

    @staticmethod
    def detect_from_bytes(content: bytes, filename: Optional[str] = None) -> str:
        """
        Detect file type from content bytes and optionally filename.
        
        Returns:
            str: File type ('csv', 'excel', 'tsv', 'unknown')
        """
        # First try content-based detection
        if MAGIC_AVAILABLE:
            try:
                mime = magic.from_buffer(content[:2048], mime=True)  # Sample first 2KB
                if "excel" in mime or "spreadsheet" in mime or "ms-excel" in mime:
                    return "excel"
                if "csv" in mime or "text" in mime:
                    # Check if it's TSV by examining content
                    if FileTypeDetector._is_tsv(content[:1024]):
                        return "tsv"
                    return "csv"
            except Exception as e:
                logger.debug(f"Magic detection failed: {e}, falling back to extension")
        
        elif FILETYPE_AVAILABLE:
            try:
                kind = filetype.guess(content[:2048])
                if kind:
                    mime = kind.mime
                    if "excel" in mime or "spreadsheet" in mime:
                        return "excel"
                    if "csv" in mime or "text" in mime:
                        if FileTypeDetector._is_tsv(content[:1024]):
                            return "tsv"
                        return "csv"
            except Exception as e:
                logger.debug(f"Filetype detection failed: {e}, falling back to extension")
        
        # Fallback to extension-based detection (MOST RELIABLE)
        if filename:
            filename_lower = filename.lower()
            # Check Excel extensions first
            if filename_lower.endswith((".xlsx", ".xls", ".xlsm", ".xlsb")):
                logger.debug(f"Detected Excel file from extension: {filename}")
                return "excel"
            # Check TSV extension
            if filename_lower.endswith(".tsv"):
                logger.debug(f"Detected TSV file from extension: {filename}")
                return "tsv"
            # Check CSV extension
            if filename_lower.endswith(".csv"):
                logger.debug(f"Detected CSV file from extension: {filename}")
                return "csv"
            # Check TXT extension - try to detect delimiter
            if filename_lower.endswith(".txt"):
                # Try to detect if it's TSV-like or CSV-like
                if FileTypeDetector._is_tsv(content[:1024]):
                    logger.debug(f"Detected TSV file from .txt extension and content: {filename}")
                    return "tsv"
                logger.debug(f"Detected CSV file from .txt extension: {filename}")
                return "csv"
        
        # Default: try to detect from content structure (if no extension or extension not recognized)
        if len(content) > 0:
            if FileTypeDetector._looks_like_csv(content[:1024]):
                if FileTypeDetector._is_tsv(content[:1024]):
                    logger.debug(f"Detected TSV file from content structure: {filename}")
                    return "tsv"
                logger.debug(f"Detected CSV file from content structure: {filename}")
                return "csv"
            # Try to detect Excel by checking for ZIP signature (XLSX is a ZIP file)
            if content[:4] == b'PK\x03\x04':  # ZIP file signature
                # Check if it might be Excel (XLSX files are ZIP archives)
                try:
                    import zipfile
                    with zipfile.ZipFile(io.BytesIO(content)) as zf:
                        if 'xl/workbook.xml' in zf.namelist() or 'xl/sharedStrings.xml' in zf.namelist():
                            logger.debug(f"Detected Excel file from ZIP signature: {filename}")
                            return "excel"
                except Exception:
                    pass
        
        logger.warning(f"Could not detect file type for {filename}, returning 'unknown'")
        return "unknown"

    @staticmethod
    def _is_tsv(content_sample: bytes) -> bool:
        """Check if content looks like TSV (tab-separated)."""
        try:
            text = content_sample.decode('utf-8', errors='ignore')
            lines = text.split('\n')[:5]  # Check first 5 lines
            tab_count = sum(line.count('\t') for line in lines)
            comma_count = sum(line.count(',') for line in lines)
            return tab_count > comma_count and tab_count > 0
        except Exception:
            return False

    @staticmethod
    def _looks_like_csv(content_sample: bytes) -> bool:
        """Check if content looks like CSV."""
        try:
            text = content_sample.decode('utf-8', errors='ignore')
            lines = text.split('\n')[:5]
            if len(lines) < 2:
                return False
            # Check if lines have consistent delimiter pattern
            comma_count = sum(line.count(',') for line in lines)
            return comma_count > len(lines)  # At least one comma per line on average
        except Exception:
            return False

