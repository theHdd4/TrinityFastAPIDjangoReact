from sentence_transformers import models, SentenceTransformer
from pathlib import Path

# Set path safely and convert to POSIX-style
base_path = Path("./models/all-MiniLM-L6-v2").resolve()
transformer_path = str(base_path / "0_Transformer").replace("\\", "/")
pooling_path = str(base_path / "1_Pooling").replace("\\", "/")

# Load modules (no local_files_only here)
word_embedding_model = models.Transformer(transformer_path)
pooling_model = models.Pooling(pooling_path)

# Load full model
model = SentenceTransformer(modules=[word_embedding_model, pooling_model])

print("✅ Model loaded successfully from:", base_path)
