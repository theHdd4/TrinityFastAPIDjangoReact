"""
Generic file-to-DataFrame loader.
Supports: CSV / TXT, Excel, Parquet, Feather / Arrow.
"""

import logging, os
from io import BytesIO

import pandas as pd
import pyarrow as pa

# Try to import chardet for better encoding detection, fallback to pandas default
try:
    import chardet
    CHARDET_AVAILABLE = True
except ImportError:
    CHARDET_AVAILABLE = False
    logging.warning("chardet not available, using pandas default encoding detection")

logger = logging.getLogger(__name__)

# --------------------------------------------------------------------------- #
# Helpers                                                                     #
# --------------------------------------------------------------------------- #

def _detect_encoding(sample: bytes) -> str:
    """Return best-guess text encoding for CSV/TXT."""
    if CHARDET_AVAILABLE:
        try:
            return chardet.detect(sample)["encoding"] or "utf-8"
        except Exception:
            return "utf-8"
    else:
        # Fallback to pandas default encoding detection
        return "utf-8"

# --------------------------------------------------------------------------- #
# Public API                                                                  #
# --------------------------------------------------------------------------- #

class FileLoader:
    """Static helpers to load various file formats into a pandas DataFrame."""

    @staticmethod
    def load_bytes(fp: bytes, filename: str) -> pd.DataFrame:
        """
        Parameters
        ----------
        fp        : raw file bytes (whole file in memory).
        filename  : used only for extension sniffing.
        """
        ext = os.path.splitext(filename.lower())[1]

        if ext in (".parquet", ".pq"):
            return pd.read_parquet(BytesIO(fp))

        if ext in (".feather", ".arrow"):
            # Arrow IPC/Feather
            return pd.read_feather(BytesIO(fp))

        if ext in (".xls", ".xlsx", ".xlsm", ".xlsb"):
            return pd.read_excel(BytesIO(fp))

        # --- CSV / TXT fallback --------------------------------------------
        if ext in (".csv", ".txt", ".tsv"):
            enc = _detect_encoding(fp[:4096])   # sample first 4 KB
            sep = "\t" if ext == ".tsv" else ","
            try:
                return pd.read_csv(BytesIO(fp), encoding=enc, sep=sep)
            except UnicodeDecodeError:
                # retry with latin-1 as last resort
                return pd.read_csv(BytesIO(fp), encoding="latin-1", sep=sep)

        raise ValueError(f"Unsupported file extension: {ext}")

    # ------------------------------------------------------------------ #
    @staticmethod
    def load_minio_object(minio_client, bucket: str, key: str) -> pd.DataFrame:
        """Fetch an object from MinIO and return it as DataFrame."""
        logger.info("Downloading %s from bucket %s", key, bucket)
        obj = minio_client.get_object(bucket, key)
        data = obj.read()
        return FileLoader.load_bytes(data, filename=key)
