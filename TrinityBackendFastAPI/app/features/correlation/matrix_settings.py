from fastapi import APIRouter
from pydantic import BaseModel

router = APIRouter()

class MatrixSettings(BaseModel):
    theme: str = "default"
    show_axis_labels: bool = True
    show_data_labels: bool = False
    show_legend: bool = True

_saved_settings = MatrixSettings()

@router.get("", response_model=MatrixSettings)
async def get_matrix_settings() -> MatrixSettings:
    """Return saved matrix settings for the correlation atom."""
    return _saved_settings

@router.post("", response_model=MatrixSettings)
async def save_matrix_settings(settings: MatrixSettings) -> MatrixSettings:
    """Persist matrix settings for later retrieval."""
    global _saved_settings
    _saved_settings = settings
    return _saved_settings
