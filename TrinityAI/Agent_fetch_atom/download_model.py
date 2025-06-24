"""Utility for downloading the sentence-transformers model used by the agent.

This script checks if the local model directory exists and contains the files
required by :class:`SentenceTransformer`. If not, it downloads the model from
Hugging Face and saves it under ``./models/all-MiniLM-L6-v2`` so other modules
can load it via ``SentenceTransformer('./models/all-MiniLM-L6-v2')``.
"""

from pathlib import Path
from sentence_transformers import SentenceTransformer


MODEL_NAME = "sentence-transformers/all-MiniLM-L6-v2"
MODEL_DIR = Path(__file__).resolve().parent / "models" / "all-MiniLM-L6-v2"


def ensure_model() -> Path:
    """Download the model if it is not already present.

    Returns
    -------
    Path
        The path to the local model directory.
    """

    if not MODEL_DIR.exists() or not any(MODEL_DIR.iterdir()):
        print(f"⬇️  Downloading '{MODEL_NAME}' to {MODEL_DIR} ...")
        MODEL_DIR.mkdir(parents=True, exist_ok=True)
        model = SentenceTransformer(MODEL_NAME)
        model.save(str(MODEL_DIR))
        print("✅ Model downloaded")
    else:
        print(f"✅ Model already available at {MODEL_DIR}")

    return MODEL_DIR


if __name__ == "__main__":
    ensure_model()
