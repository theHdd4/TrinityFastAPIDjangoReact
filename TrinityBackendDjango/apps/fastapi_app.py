import sys
from pathlib import Path

# Add the FastAPI backend package to the Python path
# We append the parent directory of the "app" package so that
# "import app" resolves correctly when Uvicorn loads this file.
# `parents[2]` resolves to the repository root so we can locate the
# `TrinityBackendFastAPI` folder next to `TrinityBackendDjango`.
backend_root = Path(__file__).resolve().parents[2] / "TrinityBackendFastAPI"
sys.path.append(str(backend_root))

from app.main import app  # type: ignore

