from pydantic import BaseModel
from typing import List, Optional

class MergeInitRequest(BaseModel):
    bucket: str
    file1: str
    file2: str

class MergeSelectionRequest(BaseModel):
    join_columns: List[str]
    join_method: str  
    merge_id: Optional[str] = "default_merge"
