from pydantic import BaseModel
from typing import List, Dict, Any, Optional

class DataFrameUploadResponse(BaseModel):
    file_id: str
    headers: List[str]
    rows: List[Dict[str, Any]]
    column_types: Dict[str, str]

class DataFrameSaveRequest(BaseModel):
    file_id: str
    headers: List[str]
    rows: List[Dict[str, Any]]
    column_types: Dict[str, str]
    file_format: Optional[str] = "csv"  # 'csv' or 'xlsx' 