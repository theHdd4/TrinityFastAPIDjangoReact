import sys
from pathlib import Path

# Add the FastAPI backend package to the Python path
backend_path = Path(__file__).resolve().parents[1] / "TrinityBackendFastAPI" / "app"
sys.path.append(str(backend_path))

from app.main import app  # type: ignore

