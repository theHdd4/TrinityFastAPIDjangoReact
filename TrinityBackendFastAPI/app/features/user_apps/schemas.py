from pydantic import BaseModel
from typing import Dict, Any

class AppSelection(BaseModel):
    user_id: int
    username: str
    role: str
    client_id: int
    client_name: str
    app_id: int
    app_name: str
    project_id: int
    project_name: str
    session_id: str
    active_mode: str
    minio_prefix: str
    env_variables: Dict[str, Any]
    tenant_schema_name: str
