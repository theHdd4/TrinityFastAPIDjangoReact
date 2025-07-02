from sentence_transformers import SentenceTransformer
from pathlib import Path

MODEL_NAME = "sentence-transformers/all-MiniLM-L6-v2"
TARGET_DIR = Path("./models/all-MiniLM-L6-v2")

print(f"Downloading {MODEL_NAME} ...")
model = SentenceTransformer(MODEL_NAME)
TARGET_DIR.mkdir(parents=True, exist_ok=True)
model.save(str(TARGET_DIR))
print(f"✅ Model downloaded to {TARGET_DIR}")
