"""Placeholder script used during Docker build.

The previous version downloaded a SentenceTransformer model which pulled in the
PyTorch stack. To avoid heavy dependencies we now rely on a lightweight
TF‑IDF based approach that does not require any external models.  The Docker
build still invokes this script so it simply ensures the expected directory
exists.
"""

from pathlib import Path

TARGET_DIR = Path("./models")
TARGET_DIR.mkdir(parents=True, exist_ok=True)
print("✅ No model download required – directory created.")
