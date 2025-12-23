"""
Robust File Ingestion Pipeline
Handles CSV, Excel files with various edge cases:
- Multiple sheets
- Description/header text before the table
- Column names not in the first row
- Mixed types
- Missing values
- Wrong encodings
- Large files
"""

from app.features.data_upload_validate.file_ingestion.robust_file_reader import RobustFileReader

__all__ = ["RobustFileReader"]

