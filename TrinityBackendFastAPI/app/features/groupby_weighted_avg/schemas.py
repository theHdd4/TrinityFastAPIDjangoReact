from pydantic import BaseModel
from typing import List, Optional


# For /init route
class InitRequest(BaseModel):
    bucket_name: str
    object_names: str
    validator_atom_id: str
    file_key: str


# For /perform_groupby route
class GroupByRequest(BaseModel):
    bucket_name: str
    object_names: str
    validator_atom_id: str
    file_key: str
    identifiers: List[str]
    aggregations: str  # Expected to be JSON string like '{"column1": "sum", "column2": "mean"}'
    resample_to: Optional[str] = None  # e.g., "M", "W", "Q"
