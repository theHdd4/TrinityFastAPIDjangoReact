"""One-time index builder for hybrid retrieval.

Steps:
1) Load and normalize corpus.
2) Fit TF-IDF + persist matrix/vectorizer.
3) Build BM25 over tokenized docs.
4) Embed corpus and persist embeddings + FAISS index.
5) Persist doc_id -> embedding row mapping.
"""
from __future__ import annotations

import argparse
import json
import logging
import re
import string
from pathlib import Path
from typing import Dict, List

import faiss
import joblib
import numpy as np
import yaml
from rank_bm25 import BM25Okapi
from scipy import sparse
from sentence_transformers import SentenceTransformer
from sklearn.feature_extraction.text import TfidfVectorizer

logger = logging.getLogger("trinity.build_indices")
logging.basicConfig(level=logging.INFO, format="%(asctime)s %(levelname)s %(message)s")


def normalize_text(text: str) -> str:
    """Normalize text (lowercase, strip punctuation, collapse whitespace)."""

    text = text or ""
    text = text.lower()
    text = re.sub(f"[{re.escape(string.punctuation)}]", " ", text)
    text = re.sub(r"\s+", " ", text).strip()
    return text


def load_corpus(corpus_path: Path) -> List[Dict]:
    """Load corpus from JSONL; ensures required keys are present."""

    documents: List[Dict] = []
    if not corpus_path.exists():
        raise FileNotFoundError(f"Corpus not found at {corpus_path}")

    with corpus_path.open("r", encoding="utf-8") as f:
        for idx, line in enumerate(f):
            record = json.loads(line)
            doc_id = str(record.get("doc_id") or record.get("id") or idx)
            documents.append(
                {
                    "doc_id": doc_id,
                    "title": record.get("title", ""),
                    "body": record.get("body") or record.get("text") or "",
                    "metadata": record.get("metadata", {}),
                }
            )
    logger.info("Loaded %s documents from %s", len(documents), corpus_path)
    return documents


def ensure_dirs(paths: Dict[str, str]) -> None:
    Path(paths["artifacts"]).mkdir(parents=True, exist_ok=True)


def build_tfidf(documents: List[Dict], config: Dict, tfidf_vectorizer_path: Path, tfidf_matrix_path: Path):
    texts = [normalize_text(f"{d['title']} {d['body']}") for d in documents]
    vectorizer = TfidfVectorizer(
        ngram_range=tuple(config["lexical"].get("ngram_range", [1, 2])),
        min_df=config["lexical"].get("min_df", 2),
    )
    matrix = vectorizer.fit_transform(texts)
    tfidf_matrix_path.parent.mkdir(parents=True, exist_ok=True)
    sparse.save_npz(tfidf_matrix_path, matrix)
    joblib.dump(vectorizer, tfidf_vectorizer_path)
    logger.info("TF-IDF vectorizer and matrix saved to %s and %s", tfidf_vectorizer_path, tfidf_matrix_path)
    return matrix, vectorizer


def build_bm25(documents: List[Dict], bm25_path: Path):
    tokenized = [normalize_text(f"{d['title']} {d['body']}").split() for d in documents]
    bm25 = BM25Okapi(tokenized)
    joblib.dump(bm25, bm25_path)
    logger.info("BM25 index saved to %s", bm25_path)
    return bm25


def embed_corpus(documents: List[Dict], config: Dict, embeddings_path: Path):
    model_name = config["embedding"].get("model", "sentence-transformers/all-MiniLM-L6-v2")
    model = SentenceTransformer(model_name)
    texts = [normalize_text(f"{d['title']} {d['body']}") for d in documents]
    embeddings = model.encode(texts, convert_to_numpy=True, show_progress_bar=True)
    embeddings = normalize_embeddings(embeddings)
    embeddings_path.parent.mkdir(parents=True, exist_ok=True)
    np.save(embeddings_path, embeddings)
    logger.info("Embeddings saved to %s", embeddings_path)
    return embeddings


def build_faiss_index(embeddings: np.ndarray, config: Dict, faiss_path: Path):
    dim = embeddings.shape[1]
    index_type = config["embedding"].get("index_type", "flat")
    if index_type == "hnsw":
        m = int(config["embedding"].get("hnsw_m", 32))
        index = faiss.IndexHNSWFlat(dim, m)
        index.hnsw.efConstruction = int(config["embedding"].get("hnsw_ef_construction", 200))
        index.hnsw.efSearch = int(config["embedding"].get("hnsw_ef_search", 64))
    else:
        index = faiss.IndexFlatIP(dim)
    index.add(embeddings.astype(np.float32))
    faiss.write_index(index, str(faiss_path))
    logger.info("FAISS index saved to %s", faiss_path)
    return index


def save_id_mapping(documents: List[Dict], mapping_path: Path):
    mapping = {doc["doc_id"]: idx for idx, doc in enumerate(documents)}
    mapping_path.parent.mkdir(parents=True, exist_ok=True)
    with mapping_path.open("w", encoding="utf-8") as f:
        json.dump(mapping, f, indent=2)
    logger.info("Doc ID mapping saved to %s", mapping_path)
    return mapping


def normalize_embeddings(vectors: np.ndarray) -> np.ndarray:
    norms = np.linalg.norm(vectors, axis=1, keepdims=True) + 1e-9
    return vectors / norms


def main():
    parser = argparse.ArgumentParser(description="Build hybrid retrieval indices")
    parser.add_argument("--config", default="configs/retrieval.yaml", help="Path to retrieval config")
    args = parser.parse_args()

    config_path = Path(args.config)
    config = yaml.safe_load(config_path.read_text())
    paths = config["paths"]
    ensure_dirs(paths)

    corpus = load_corpus(Path(paths["corpus"]))
    tfidf_matrix, _ = build_tfidf(corpus, config, Path(paths["tfidf_vectorizer"]), Path(paths["tfidf_matrix"]))
    build_bm25(corpus, Path(paths["bm25_index"]))
    embeddings = embed_corpus(corpus, config, Path(paths["embeddings"]))
    build_faiss_index(embeddings, config, Path(paths["faiss_index"]))
    save_id_mapping(corpus, Path(paths["doc_id_mapping"]))

    logger.info(
        "Completed index build: tfidf=%s docs=%s dims=%s", tfidf_matrix.shape, len(corpus), embeddings.shape[1]
    )


if __name__ == "__main__":
    main()
