from pydantic import BaseModel
from typing import Literal

class ConcatInitRequest(BaseModel):
    file1: str
    file2: str
    bucket_name: str


class ConcatPerformRequest(BaseModel):
    file1: str
    file2: str
    bucket_name: str
    concat_direction: Literal["vertical", "horizontal"]
    mismatch_handling: Literal["common", "all", "left", "right"]
    concat_id: str
