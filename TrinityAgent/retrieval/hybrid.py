"""Hybrid retrieval pipeline utilities."""
from __future__ import annotations

import json
import logging
import re
import string
from functools import lru_cache
from pathlib import Path
from typing import Dict, List, Tuple

import faiss
import joblib
import numpy as np
import yaml
from rank_bm25 import BM25Okapi
from scipy import sparse
from sentence_transformers import SentenceTransformer
from sklearn.feature_extraction.text import TfidfVectorizer
from sklearn.metrics.pairwise import cosine_similarity

logger = logging.getLogger("trinity.hybrid_retrieval")


@lru_cache(maxsize=1)
def load_config(config_path: str = "configs/retrieval.yaml") -> Dict:
    path = Path(config_path)
    if not path.exists():
        raise FileNotFoundError(f"Retrieval config not found at {path}")
    return yaml.safe_load(path.read_text())


def normalize_text(text: str) -> str:
    text = text or ""
    text = text.lower()
    text = re.sub(f"[{re.escape(string.punctuation)}]", " ", text)
    text = re.sub(r"\s+", " ", text).strip()
    return text


@lru_cache(maxsize=1)
def _load_corpus(config_path: str) -> List[Dict]:
    config = load_config(config_path)
    corpus_path = Path(config["paths"]["corpus"])
    documents: List[Dict] = []
    with corpus_path.open("r", encoding="utf-8") as f:
        for idx, line in enumerate(f):
            record = json.loads(line)
            documents.append(
                {
                    "doc_id": str(record.get("doc_id") or record.get("id") or idx),
                    "title": record.get("title", ""),
                    "body": record.get("body") or record.get("text") or "",
                    "metadata": record.get("metadata", {}),
                }
            )
    return documents


@lru_cache(maxsize=1)
def _load_tfidf_assets(config_path: str) -> Tuple[TfidfVectorizer, sparse.spmatrix]:
    config = load_config(config_path)
    vectorizer = joblib.load(config["paths"]["tfidf_vectorizer"])
    matrix = sparse.load_npz(config["paths"]["tfidf_matrix"])
    return vectorizer, matrix


@lru_cache(maxsize=1)
def _load_bm25(config_path: str) -> BM25Okapi:
    config = load_config(config_path)
    return joblib.load(config["paths"]["bm25_index"])


@lru_cache(maxsize=1)
def _load_embeddings(config_path: str) -> np.ndarray:
    config = load_config(config_path)
    return np.load(config["paths"]["embeddings"])


@lru_cache(maxsize=1)
def _load_faiss_index(config_path: str):
    config = load_config(config_path)
    return faiss.read_index(config["paths"]["faiss_index"])


@lru_cache(maxsize=1)
def _load_id_mapping(config_path: str) -> Dict[str, int]:
    config = load_config(config_path)
    mapping_path = Path(config["paths"]["doc_id_mapping"])
    return json.loads(mapping_path.read_text())


@lru_cache(maxsize=1)
def _load_embedder(config_path: str) -> SentenceTransformer:
    config = load_config(config_path)
    model_name = config["embedding"].get("model", "sentence-transformers/all-MiniLM-L6-v2")
    return SentenceTransformer(model_name)


def _normalize_array(values: np.ndarray) -> np.ndarray:
    if values.size == 0:
        return values
    max_v = np.max(values)
    min_v = np.min(values)
    if max_v == min_v:
        return np.zeros_like(values)
    return (values - min_v) / (max_v - min_v)


def _score_lexical(query: str, config_path: str) -> List[Tuple[str, float, float, float]]:
    config = load_config(config_path)
    documents = _load_corpus(config_path)
    bm25 = _load_bm25(config_path)
    tfidf_vectorizer, tfidf_matrix = _load_tfidf_assets(config_path)

    tokenized_query = query.split()
    bm25_scores = np.array(bm25.get_scores(tokenized_query))
    tfidf_query = tfidf_vectorizer.transform([query])
    tfidf_scores = cosine_similarity(tfidf_query, tfidf_matrix).flatten()

    bm25_norm = _normalize_array(bm25_scores)
    tfidf_norm = _normalize_array(tfidf_scores)

    bm25_weight = float(config["lexical"].get("bm25_weight", 0.6))
    tfidf_weight = float(config["lexical"].get("tfidf_weight", 0.4))
    lexical_scores = bm25_weight * bm25_norm + tfidf_weight * tfidf_norm

    top_k = int(config["lexical"].get("top_k", 200))
    top_indices = np.argsort(lexical_scores)[::-1][: min(top_k, len(documents))]

    results: List[Tuple[str, float, float, float]] = []
    for idx in top_indices:
        doc = documents[idx]
        results.append((doc["doc_id"], float(bm25_norm[idx]), float(tfidf_norm[idx]), float(lexical_scores[idx])))
    return results


def _score_embeddings(query_vec: np.ndarray, shortlist_ids: List[str], config_path: str) -> List[Tuple[str, float]]:
    config = load_config(config_path)
    id_mapping = _load_id_mapping(config_path)
    embeddings = _load_embeddings(config_path)

    offsets = [id_mapping[doc_id] for doc_id in shortlist_ids if doc_id in id_mapping]
    if not offsets:
        return []

    subset_vectors = embeddings[offsets]
    subset_ids = [shortlist_ids[i] for i, doc_id in enumerate(shortlist_ids) if doc_id in id_mapping]
    top_m = int(config["embedding"].get("top_m", 80))

    if len(subset_vectors) == 0:
        return []

    search_size = min(top_m, len(subset_vectors))
    if search_size == 0:
        return []

    index = faiss.IndexFlatIP(subset_vectors.shape[1])
    index.add(subset_vectors.astype(np.float32))
    scores, indices = index.search(query_vec.astype(np.float32).reshape(1, -1), search_size)

    results: List[Tuple[str, float]] = []
    for pos, score in zip(indices[0], scores[0]):
        doc_id = subset_ids[pos]
        results.append((doc_id, float(score)))
    return results


def _load_docs_by_id(config_path: str) -> Dict[str, Dict]:
    return {doc["doc_id"]: doc for doc in _load_corpus(config_path)}


def hybrid_search(query: str, k: int = 30, config_path: str = "configs/retrieval.yaml") -> List[Dict]:
    config = load_config(config_path)
    documents = _load_docs_by_id(config_path)
    embedder = _load_embedder(config_path)

    normalized_query = normalize_text(query)
    lexical_scores = _score_lexical(normalized_query, config_path)
    shortlist_ids = [doc_id for doc_id, *_ in lexical_scores]

    query_vec = embedder.encode([normalized_query], convert_to_numpy=True, show_progress_bar=False)
    query_vec = query_vec / (np.linalg.norm(query_vec, axis=1, keepdims=True) + 1e-9)
    embedding_scores = _score_embeddings(query_vec[0], shortlist_ids, config_path)

    lexical_dict = {doc_id: score for doc_id, _, _, score in lexical_scores}
    embedding_dict = {doc_id: score for doc_id, score in embedding_scores}

    embed_norm = _normalize_array(np.array(list(embedding_dict.values())))
    for idx, doc_id in enumerate(embedding_dict.keys()):
        embedding_dict[doc_id] = float(embed_norm[idx])

    lexical_norm = _normalize_array(np.array(list(lexical_dict.values())))
    for idx, doc_id in enumerate(lexical_dict.keys()):
        lexical_dict[doc_id] = float(lexical_norm[idx])

    combined_scores: List[Tuple[str, float, float]] = []
    lexical_weight = float(config["weights"].get("lexical", 0.5))
    embedding_weight = float(config["weights"].get("embedding", 0.5))

    candidate_ids = set(lexical_dict.keys()) | set(embedding_dict.keys())
    for doc_id in candidate_ids:
        lex_score = lexical_dict.get(doc_id, 0.0)
        emb_score = embedding_dict.get(doc_id, 0.0)
        combined = lexical_weight * lex_score + embedding_weight * emb_score
        combined_scores.append((doc_id, combined, lex_score, emb_score))

    top_n = min(k, int(config["retrieval"].get("top_n", 30)))
    top_sorted = sorted(combined_scores, key=lambda x: x[1], reverse=True)[:top_n]

    results: List[Dict] = []
    for doc_id, combined, lex_score, emb_score in top_sorted:
        doc = documents.get(doc_id, {"title": "", "body": "", "metadata": {}})
        results.append(
            {
                "doc_id": doc_id,
                "title": doc.get("title", ""),
                "body": doc.get("body", ""),
                "metadata": doc.get("metadata", {}),
                "lexical_score": lex_score,
                "embedding_score": emb_score,
                "hybrid_score": combined,
            }
        )

    rerank_enabled = config.get("rerank", {}).get("enabled") or config.get("retrieval", {}).get("llm_rerank")
    if rerank_enabled:
        try:
            from TrinityAgent.rerank.llm_rerank import rerank

            results = rerank(query, results, config_path=config_path)
        except Exception as exc:  # pragma: no cover - resilient fallback
            logger.warning("LLM rerank failed, using hybrid scores: %s", exc)

    return results


__all__ = ["hybrid_search", "load_config"]
