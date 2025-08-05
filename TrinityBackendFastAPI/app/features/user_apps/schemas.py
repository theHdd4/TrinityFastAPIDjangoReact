from pydantic import BaseModel
from typing import Dict, Any, List


class EnvVariables(BaseModel):
    """Environment metadata for a project selection.

    ``identifiers`` and ``measures`` capture the relevant columns while
    ``dimension_mapping`` links identifier columns to their dimensions.
    """

    identifiers: List[str]
    measures: List[str]
    dimension_mapping: Dict[str, str]


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
    env_variables: EnvVariables
    tenant_schema_name: str
