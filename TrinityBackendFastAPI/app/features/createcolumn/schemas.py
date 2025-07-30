from pydantic import BaseModel
from typing import Optional

class CreateSettingsRequest(BaseModel):
    options: str
    validator_atom_id: str
    file_key: str


class CreatePerformRequest(BaseModel):
    object_names: str
    bucket_name: str
    validator_atom_id: str
    file_key: str
