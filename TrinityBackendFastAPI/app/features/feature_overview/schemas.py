from pydantic import BaseModel
from typing import Dict, List

class FeatureOverviewRequest(BaseModel):
    dimensions: Dict[str, List[str]]
    create_hierarchy: bool = False  # Optional, defaults to True

class FeatureOverviewResponse(BaseModel):
    status: str
    message: str
