import json
import logging
import pickle
import re
from functools import lru_cache
from pathlib import Path
from typing import Dict, List, Tuple

import faiss
import joblib
import numpy as np
import yaml
from rank_bm25 import BM25Okapi
from sentence_transformers import SentenceTransformer
from sklearn.metrics.pairwise import cosine_similarity

logger = logging.getLogger(__name__)

REPO_ROOT = Path(__file__).resolve().parents[2]
DEFAULT_CONFIG_PATH = REPO_ROOT / "configs" / "retrieval.yaml"


def normalize_text(text: str) -> str:
    cleaned = re.sub(r"[^\w\s]", " ", text.lower())
    return re.sub(r"\s+", " ", cleaned).strip()


def tokenize(text: str) -> List[str]:
    return [token for token in normalize_text(text).split(" ") if token]


def safe_min_max_scale(values: List[float]) -> List[float]:
    if not values:
        return []
    v_min = min(values)
    v_max = max(values)
    if v_max == v_min:
        return [1.0 for _ in values]
    return [(v - v_min) / (v_max - v_min) for v in values]


@lru_cache(maxsize=1)
def load_config(config_path: Path = DEFAULT_CONFIG_PATH) -> Dict:
    path = Path(config_path)
    with path.open("r") as f:
        return yaml.safe_load(f)


@lru_cache(maxsize=1)
def load_bm25() -> Tuple[BM25Okapi, List[str]]:
    config = load_config()
    bm25_path = REPO_ROOT / config["paths"]["bm25_index_path"]
    with bm25_path.open("rb") as f:
        payload = pickle.load(f)
    return payload["bm25"], payload["doc_ids"]


@lru_cache(maxsize=1)
def load_tfidf():
    config = load_config()
    vectorizer_path = REPO_ROOT / config["paths"]["tfidf_vectorizer_path"]
    matrix_path = REPO_ROOT / config["paths"]["tfidf_matrix_path"]
    vectorizer = joblib.load(vectorizer_path)
    matrix = joblib.load(matrix_path)
    return vectorizer, matrix


@lru_cache(maxsize=1)
def load_mapping() -> Dict[str, int]:
    config = load_config()
    mapping_path = REPO_ROOT / config["paths"]["docid_mapping_path"]
    with mapping_path.open("r") as f:
        return json.load(f)


@lru_cache(maxsize=1)
def load_embeddings() -> np.ndarray:
    config = load_config()
    embeddings_path = REPO_ROOT / config["embedding"]["embeddings_path"]
    return np.load(embeddings_path)


@lru_cache(maxsize=1)
def load_faiss_index():
    config = load_config()
    faiss_path = REPO_ROOT / config["embedding"]["faiss_index_path"]
    return faiss.read_index(str(faiss_path))


@lru_cache(maxsize=1)
def load_encoder() -> SentenceTransformer:
    config = load_config()
    model_name = config["embedding"]["model_name"]
    return SentenceTransformer(model_name)


def _lexical_ranking(query: str, config: Dict) -> List[Tuple[str, float, float, float]]:
    bm25, bm25_doc_ids = load_bm25()
    vectorizer, tfidf_matrix = load_tfidf()
    tokenized_query = tokenize(query)

    bm25_scores = bm25.get_scores(tokenized_query)
    tfidf_query = vectorizer.transform([normalize_text(query)])
    tfidf_scores = cosine_similarity(tfidf_query, tfidf_matrix).flatten()

    norm_bm25 = safe_min_max_scale(bm25_scores)
    norm_tfidf = safe_min_max_scale(tfidf_scores.tolist())

    bm25_weight = config["lexical"].get("bm25_weight", 0.6)
    tfidf_weight = config["lexical"].get("tfidf_weight", 0.4)

    combined = []
    for idx, doc_id in enumerate(bm25_doc_ids):
        score = bm25_weight * norm_bm25[idx] + tfidf_weight * norm_tfidf[idx]
        combined.append((doc_id, score, norm_bm25[idx], norm_tfidf[idx]))

    combined.sort(key=lambda x: x[1], reverse=True)
    top_k = config["lexical"].get("top_k", 200)
    return combined[:top_k]


def _embedding_ranking(query: str, shortlist: List[Tuple[str, float, float, float]], config: Dict):
    if not shortlist:
        return []
    encoder = load_encoder()
    query_vector = encoder.encode([normalize_text(query)], convert_to_numpy=True, normalize_embeddings=True)
    mapping = load_mapping()
    embeddings = load_embeddings()
    top_m = config["embedding"].get("top_m", 80)

    candidate_ids = [doc_id for doc_id, *_ in shortlist if doc_id in mapping]
    candidate_indices = [mapping[doc_id] for doc_id in candidate_ids]

    if not candidate_indices:
        return []

    subset_vectors = embeddings[candidate_indices]
    index = faiss.IndexFlatIP(subset_vectors.shape[1])
    index.add(subset_vectors.astype(np.float32))

    scores, positions = index.search(query_vector.astype(np.float32), min(top_m, len(candidate_indices)))
    results = []
    for score, pos in zip(scores[0].tolist(), positions[0].tolist()):
        if pos == -1:
            continue
        doc_id = candidate_ids[pos]
        results.append((doc_id, float(score)))
    results.sort(key=lambda x: x[1], reverse=True)
    return results


def hybrid_search(query: str, k: int = None) -> List[Dict]:
    config = load_config()
    target_n = k or config["hybrid"].get("top_n", 30)
    lexical = _lexical_ranking(query, config)
    embedding = _embedding_ranking(query, lexical, config)

    lexical_lookup = {doc_id: {
        "lexical_score": score,
        "bm25": bm,
        "tfidf": tfidf,
    } for doc_id, score, bm, tfidf in lexical}

    embed_lookup = {doc_id: score for doc_id, score in embedding}

    combined = []
    lexical_weight = config["hybrid"].get("lexical_weight", 0.5)
    embedding_weight = config["hybrid"].get("embedding_weight", 0.5)

    for doc_id, lex_data in lexical_lookup.items():
        emb_score = embed_lookup.get(doc_id, 0.0)
        hybrid_score = lexical_weight * lex_data["lexical_score"] + embedding_weight * emb_score
        combined.append(
            {
                "doc_id": doc_id,
                "hybrid_score": hybrid_score,
                "lexical_score": lex_data["lexical_score"],
                "bm25_score": lex_data["bm25"],
                "tfidf_score": lex_data["tfidf"],
                "embedding_score": emb_score,
            }
        )

    combined.sort(key=lambda x: x["hybrid_score"], reverse=True)
    logger.info("Hybrid search completed", extra={"query": query, "top": combined[:5]})
    return combined[:target_n]


__all__ = ["hybrid_search"]
