from typing import Dict, Any, List
from pydantic import BaseModel

class ExploreResponse(BaseModel):
    columns: List[str]
    row_count: int
    summary: Dict[str, Dict[str, Any]]
