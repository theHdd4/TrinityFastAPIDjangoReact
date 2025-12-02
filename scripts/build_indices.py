import argparse
import json
import os
import pickle
import re
from pathlib import Path
from typing import Dict, List

import faiss
import joblib
import numpy as np
import yaml
from rank_bm25 import BM25Okapi
from sentence_transformers import SentenceTransformer
from sklearn.feature_extraction.text import TfidfVectorizer


def normalize_text(text: str) -> str:
    cleaned = re.sub(r"[^\w\s]", " ", text.lower())
    return re.sub(r"\s+", " ", cleaned).strip()


def tokenize(text: str) -> List[str]:
    return [token for token in normalize_text(text).split(" ") if token]


def load_config(path: Path) -> Dict:
    with path.open("r") as f:
        return yaml.safe_load(f)


def load_corpus(corpus_path: Path = None, use_db: bool = False) -> List[Dict]:
    documents: List[Dict] = []
    if use_db:
        os.environ.setdefault("DJANGO_SETTINGS_MODULE", "config.settings")
        import django

        django.setup()
        from TrinityBackendDjango.apps.atoms.models import RetrievalDocument

        for doc in RetrievalDocument.objects.all().iterator():
            documents.append(
                {
                    "id": str(doc.pk),
                    "title": doc.title or "",
                    "text": doc.text,
                    "metadata": doc.metadata or {},
                }
            )
    elif corpus_path and corpus_path.exists():
        with corpus_path.open("r") as f:
            for line in f:
                record = json.loads(line)
                documents.append(
                    {
                        "id": str(record.get("id")),
                        "title": record.get("title", ""),
                        "text": record.get("body", record.get("text", "")),
                        "metadata": record.get("metadata", {}),
                    }
                )
    else:
        raise ValueError("No corpus source provided")
    return documents


def build_tfidf(docs: List[Dict], config: Dict, tfidf_vectorizer_path: Path, tfidf_matrix_path: Path):
    texts = [normalize_text(doc["text"]) for doc in docs]
    vectorizer = TfidfVectorizer(
        min_df=config["lexical"].get("min_df", 2),
        ngram_range=tuple(config["lexical"].get("ngram_range", [1, 2])),
    )
    matrix = vectorizer.fit_transform(texts)
    tfidf_vectorizer_path.parent.mkdir(parents=True, exist_ok=True)
    joblib.dump(vectorizer, tfidf_vectorizer_path)
    joblib.dump(matrix, tfidf_matrix_path)
    return vectorizer, matrix


def build_bm25(docs: List[Dict], bm25_index_path: Path):
    tokenized_docs = [tokenize(doc["text"]) for doc in docs]
    bm25 = BM25Okapi(tokenized_docs)
    payload = {"bm25": bm25, "doc_ids": [doc["id"] for doc in docs]}
    bm25_index_path.parent.mkdir(parents=True, exist_ok=True)
    with bm25_index_path.open("wb") as f:
        pickle.dump(payload, f)
    return bm25


def embed_documents(docs: List[Dict], model_name: str, embeddings_path: Path, faiss_index_path: Path):
    model = SentenceTransformer(model_name)
    corpus_texts = [normalize_text(doc["text"]) for doc in docs]
    embeddings = model.encode(corpus_texts, convert_to_numpy=True, normalize_embeddings=True)
    embeddings_path.parent.mkdir(parents=True, exist_ok=True)
    np.save(embeddings_path, embeddings)
    dim = embeddings.shape[1]
    index = faiss.IndexFlatIP(dim)
    index.add(embeddings.astype(np.float32))
    faiss_index_path.parent.mkdir(parents=True, exist_ok=True)
    faiss.write_index(index, str(faiss_index_path))
    return embeddings


def store_mappings(docs: List[Dict], mapping_path: Path, meta_path: Path, embeddings: np.ndarray, model_name: str):
    mapping = {doc["id"]: idx for idx, doc in enumerate(docs)}
    mapping_path.parent.mkdir(parents=True, exist_ok=True)
    with mapping_path.open("w") as f:
        json.dump(mapping, f)
    meta = {
        "total_documents": len(docs),
        "dimension": int(embeddings.shape[1]) if embeddings.size else 0,
        "model_name": model_name,
    }
    meta_path.parent.mkdir(parents=True, exist_ok=True)
    with meta_path.open("w") as f:
        json.dump(meta, f, indent=2)


def main():
    parser = argparse.ArgumentParser(description="Build retrieval indices")
    parser.add_argument("--config", default="configs/retrieval.yaml", type=Path)
    parser.add_argument("--corpus", default=None, type=Path)
    parser.add_argument("--use-db", action="store_true", help="Load corpus from Postgres via Django")
    args = parser.parse_args()

    config = load_config(args.config)

    documents = load_corpus(args.corpus, use_db=args.use_db)

    tfidf_vectorizer_path = Path(config["paths"]["tfidf_vectorizer_path"])
    tfidf_matrix_path = Path(config["paths"]["tfidf_matrix_path"])
    bm25_index_path = Path(config["paths"]["bm25_index_path"])
    docid_mapping_path = Path(config["paths"]["docid_mapping_path"])
    metadata_path = Path(config["paths"]["metadata_path"])
    embeddings_path = Path(config["embedding"]["embeddings_path"])
    faiss_index_path = Path(config["embedding"]["faiss_index_path"])

    build_tfidf(documents, config, tfidf_vectorizer_path, tfidf_matrix_path)
    build_bm25(documents, bm25_index_path)
    embeddings = embed_documents(
        documents,
        config["embedding"]["model_name"],
        embeddings_path,
        faiss_index_path,
    )
    store_mappings(
        documents,
        docid_mapping_path,
        metadata_path,
        embeddings,
        config["embedding"]["model_name"],
    )

    print(f"Built indices for {len(documents)} documents")


if __name__ == "__main__":
    main()
