from sentence_transformers import SentenceTransformer
from pathlib import Path

# ✅ Make sure this matches your local folder structure
model_path = Path("./models/all-MiniLM-L6-v2").resolve().as_posix()

model = SentenceTransformer(model_path)
print("✅ Model loaded successfully from:", model_path)
