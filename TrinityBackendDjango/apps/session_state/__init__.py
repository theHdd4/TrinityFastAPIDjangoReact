default_app_config = "apps.session_state.apps.SessionStateConfig"

# Ensure the FastAPI backend package is on the Python path so imports like
# ``from app.features...`` work when Django loads this app. ``__file__`` lives
# inside ``TrinityBackendDjango/apps/session_state`` so ``parents[3]`` resolves
# to the repository root where ``TrinityBackendFastAPI`` sits next to
# ``TrinityBackendDjango``.
import sys
from pathlib import Path

backend_root = Path(__file__).resolve().parents[3] / "TrinityBackendFastAPI"
backend_app = backend_root / "app"
for p in (backend_root, backend_app):
    s = str(p)
    if s not in sys.path:
        sys.path.insert(0, s)
