default_app_config = "apps.session_state.apps.SessionStateConfig"

# Ensure the FastAPI backend package is on the Python path so imports like
# ``from app.features...`` work when Django loads this app. We search upward
# from this file's location until we find the ``TrinityBackendFastAPI`` folder
# that sits alongside ``TrinityBackendDjango`` and add both that directory and
# its inner ``app`` package to ``sys.path``.
import sys
from pathlib import Path

root_path = Path(__file__).resolve()
backend_root = None
for parent in root_path.parents:
    candidate = parent / "TrinityBackendFastAPI"
    if candidate.exists():
        backend_root = candidate
        break
if backend_root is None:
    backend_root = root_path.parents[2] / "TrinityBackendFastAPI"
backend_app = backend_root / "app"
for p in (backend_root, backend_app):
    s = str(p)
    if s not in sys.path:
        sys.path.insert(0, s)
