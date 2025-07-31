from pydantic import BaseModel
from typing import Optional, List, Dict, Any

class UploadResponse(BaseModel):
    file_id: str
    filename: str
    minio_url: str
    headers: List[str]
    rows: List[Dict[str, Any]]
    fileName: str
    columnTypes: Dict[str, str]
    pinnedColumns: List[str]
    frozenColumns: int
    cellColors: Dict[str, str]

class SaveAndDownloadResponse(BaseModel):
    file_id: str
    download_url: str 