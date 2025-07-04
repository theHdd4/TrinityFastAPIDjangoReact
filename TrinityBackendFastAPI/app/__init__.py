import sys
from pathlib import Path

# Ensure the shared contexts package is importable
root = Path(__file__).resolve().parents[2]
src_path = root / "src"
if str(src_path) not in sys.path:
    sys.path.insert(0, str(src_path))

from .main import app

