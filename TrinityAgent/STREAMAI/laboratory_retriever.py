"""
Laboratory Retrieval Pipeline
=============================

Hybrid retrieval stack for Laboratory Mode ReAct workflows.
Combines lexical filtering (BM25 + TF-IDF), dense embeddings, and
LLM-based re-ranking while generating business-focused insight snippets
for each atom loop.
"""

from __future__ import annotations

import json
import logging
import re
import string
from dataclasses import dataclass
from pathlib import Path
from typing import Any, Dict, List, Optional, Tuple

import numpy as np
from sklearn.feature_extraction.text import TfidfVectorizer
from sklearn.metrics.pairwise import cosine_similarity

logger = logging.getLogger("trinity.trinityai.lab_retriever")

try:  # Optional heavy dependencies
    from rank_bm25 import BM25Okapi  # type: ignore
    import faiss  # type: ignore
    from sentence_transformers import SentenceTransformer  # type: ignore
except Exception:  # pragma: no cover - handled at runtime
    BM25Okapi = None  # type: ignore
    faiss = None  # type: ignore
    SentenceTransformer = None  # type: ignore

try:  # LLM client is optional for reranking
    from TrinityAgent.llm_client import LLMClient
except Exception:  # pragma: no cover
    try:
        from llm_client import LLMClient  # type: ignore
    except Exception:  # pragma: no cover
        LLMClient = None  # type: ignore


@dataclass
class CorpusDocument:
    """Structured document for the Laboratory corpus."""

    doc_id: str
    title: str
    body: str
    metadata: Dict[str, Any]


class LaboratoryRetrievalPipeline:
    """Hybrid retrieval pipeline tailored for Laboratory Mode."""

    def __init__(
        self,
        corpus_path: Optional[Path] = None,
        embedding_model: str = "sentence-transformers/all-MiniLM-L6-v2",
    ) -> None:
        self.corpus_path = corpus_path or Path(__file__).resolve().parent / "lab_corpus.jsonl"
        self.embedding_model_name = embedding_model
        self.documents: List[CorpusDocument] = []
        self._bm25 = None
        self._tfidf_vectorizer: Optional[TfidfVectorizer] = None
        self._tfidf_matrix = None
        self._embedder = None
        self._faiss_index = None
        self._embeddings: Dict[str, np.ndarray] = {}
        self._trace_log: List[Dict[str, Any]] = []
        self._llm_client = LLMClient() if LLMClient else None

        self._load_corpus()
        self._rebuild_indexes()

    # ------------------------------------------------------------------
    # Corpus utilities
    # ------------------------------------------------------------------
    @staticmethod
    def normalize_text(text: str) -> str:
        """Normalize text for consistent indexing."""

        text = text or ""
        text = text.lower()
        text = re.sub(f"[{re.escape(string.punctuation)}]", " ", text)
        text = re.sub(r"\s+", " ", text).strip()
        return text

    def _load_corpus(self) -> None:
        if not self.corpus_path.exists():
            logger.info("⚙️ No existing laboratory corpus found; starting fresh")
            return

        try:
            with open(self.corpus_path, "r", encoding="utf-8") as f:
                for line in f:
                    record = json.loads(line)
                    self.documents.append(
                        CorpusDocument(
                            doc_id=record.get("doc_id"),
                            title=record.get("title", "Untitled"),
                            body=record.get("body", ""),
                            metadata=record.get("metadata", {}),
                        )
                    )
            logger.info("✅ Loaded %s documents into Laboratory corpus", len(self.documents))
        except Exception as exc:  # pragma: no cover - safety net
            logger.error("❌ Failed to load laboratory corpus: %s", exc)

    def ingest_documents(self, docs: List[Dict[str, Any]]) -> None:
        """Append documents to the corpus and rebuild indexes."""

        if not docs:
            return

        self.corpus_path.parent.mkdir(parents=True, exist_ok=True)
        with open(self.corpus_path, "a", encoding="utf-8") as f:
            for doc in docs:
                record = CorpusDocument(
                    doc_id=str(doc.get("doc_id")),
                    title=doc.get("title", "Untitled"),
                    body=doc.get("body", ""),
                    metadata=doc.get("metadata", {}),
                )
                self.documents.append(record)
                f.write(
                    json.dumps(
                        {
                            "doc_id": record.doc_id,
                            "title": record.title,
                            "body": record.body,
                            "metadata": record.metadata,
                        }
                    )
                    + "\n"
                )

        self._rebuild_indexes()

    # ------------------------------------------------------------------
    # Index building
    # ------------------------------------------------------------------
    def _rebuild_indexes(self) -> None:
        if not self.documents:
            return

        if BM25Okapi:
            tokenized = [self.normalize_text(d.title + " " + d.body).split() for d in self.documents]
            self._bm25 = BM25Okapi(tokenized)
        else:  # pragma: no cover - fallback when dependency missing
            self._bm25 = None
            logger.warning("⚠️ rank-bm25 not available; lexical ranking will be TF-IDF only")

        texts = [self.normalize_text(d.title + " " + d.body) for d in self.documents]
        min_df = 2 if len(texts) >= 2 else 1
        self._tfidf_vectorizer = TfidfVectorizer(ngram_range=(1, 2), min_df=min_df)
        self._tfidf_matrix = self._tfidf_vectorizer.fit_transform(texts)

        if SentenceTransformer and self.documents:
            self._embedder = self._embedder or SentenceTransformer(self.embedding_model_name)
            corpus_embeddings = self._embedder.encode(texts, convert_to_numpy=True, show_progress_bar=False)
            corpus_embeddings = self._normalize_embeddings(corpus_embeddings)
            self._embeddings = {doc.doc_id: corpus_embeddings[idx] for idx, doc in enumerate(self.documents)}
            if faiss:
                dim = corpus_embeddings.shape[1]
                self._faiss_index = faiss.IndexFlatIP(dim)
                self._faiss_index.add(corpus_embeddings.astype(np.float32))
        else:
            logger.warning("⚠️ Embedding model unavailable; skipping FAISS index build")

    @staticmethod
    def _normalize_embeddings(vectors: np.ndarray) -> np.ndarray:
        norms = np.linalg.norm(vectors, axis=1, keepdims=True) + 1e-9
        return vectors / norms

    # ------------------------------------------------------------------
    # Retrieval stages
    # ------------------------------------------------------------------
    def search(
        self,
        query: str,
        top_k: int = 200,
        top_m: int = 80,
        top_n: int = 30,
    ) -> List[Dict[str, Any]]:
        if not self.documents:
            return []

        normalized_query = self.normalize_text(query)
        lexical_scores = self._score_lexical(normalized_query, top_k)
        shortlist_ids = [doc_id for doc_id, _ in lexical_scores]

        embedding_scores = self._score_embeddings(normalized_query, shortlist_ids, top_m)
        combined = self._hybrid_combine(lexical_scores, embedding_scores, top_n)
        reranked = self._llm_rerank(normalized_query, combined)

        self._log_trace(
            stage="search",
            details={
                "query": normalized_query,
                "lexical_candidates": len(lexical_scores),
                "embedding_candidates": len(embedding_scores),
                "returned": len(reranked),
            },
        )
        return reranked

    def _score_lexical(self, query: str, top_k: int) -> List[Tuple[str, float]]:
        tokens = query.split()
        bm25_scores = np.zeros(len(self.documents))
        if self._bm25 and tokens:
            bm25_scores = np.array(self._bm25.get_scores(tokens))
        tfidf_scores = np.zeros(len(self.documents))
        if self._tfidf_vectorizer is not None and self._tfidf_matrix is not None:
            query_vec = self._tfidf_vectorizer.transform([query])
            tfidf_scores = cosine_similarity(query_vec, self._tfidf_matrix).flatten()

        if bm25_scores.max() > 0:
            bm25_scores = bm25_scores / (bm25_scores.max() + 1e-9)
        if tfidf_scores.max() > 0:
            tfidf_scores = tfidf_scores / (tfidf_scores.max() + 1e-9)

        combined = 0.6 * bm25_scores + 0.4 * tfidf_scores
        ranked_indices = np.argsort(combined)[::-1][:top_k]

        results = []
        for idx in ranked_indices:
            doc = self.documents[idx]
            results.append((doc.doc_id, float(combined[idx])))
        return results

    def _score_embeddings(
        self,
        query: str,
        shortlist_ids: List[str],
        top_m: int,
    ) -> Dict[str, float]:
        if not self._embedder or not shortlist_ids:
            return {}

        query_vec = self._embedder.encode([query], convert_to_numpy=True, show_progress_bar=False)[0]
        query_vec = self._normalize_embeddings(np.array([query_vec]))[0]

        shortlist_embeddings = []
        shortlist_map: List[str] = []
        for doc_id in shortlist_ids:
            emb = self._embeddings.get(doc_id)
            if emb is not None:
                shortlist_embeddings.append(emb)
                shortlist_map.append(doc_id)

        if not shortlist_embeddings:
            return {}

        shortlist_matrix = np.vstack(shortlist_embeddings).astype(np.float32)
        scores = np.dot(shortlist_matrix, query_vec.astype(np.float32))

        if faiss and len(shortlist_embeddings) >= top_m:
            dim = shortlist_matrix.shape[1]
            index = faiss.IndexFlatIP(dim)
            index.add(shortlist_matrix)
            scores, indices = index.search(
                np.expand_dims(query_vec.astype(np.float32), axis=0),
                min(top_m, len(shortlist_embeddings)),
            )
            indices = indices[0]
            scores = scores[0]
            return {shortlist_map[i]: float(scores[pos]) for pos, i in enumerate(indices)}

        return {doc_id: float(score) for doc_id, score in zip(shortlist_map, scores)}

    def _hybrid_combine(
        self,
        lexical_scores: List[Tuple[str, float]],
        embedding_scores: Dict[str, float],
        top_n: int,
    ) -> List[Dict[str, Any]]:
        lex_dict = {doc_id: score for doc_id, score in lexical_scores}
        if embedding_scores:
            max_emb = max(embedding_scores.values()) or 1.0
            emb_norm = {k: v / max_emb for k, v in embedding_scores.items()}
        else:
            emb_norm = {}

        combined = []
        for doc_id, lex_score in lex_dict.items():
            emb_score = emb_norm.get(doc_id, 0.0)
            hybrid_score = 0.5 * lex_score + 0.5 * emb_score
            doc = next((d for d in self.documents if d.doc_id == doc_id), None)
            if not doc:
                continue
            combined.append(
                {
                    "doc_id": doc_id,
                    "title": doc.title,
                    "body": doc.body,
                    "metadata": doc.metadata,
                    "lexical_score": lex_score,
                    "embedding_score": emb_score,
                    "hybrid_score": hybrid_score,
                }
            )

        combined.sort(key=lambda x: x["hybrid_score"], reverse=True)
        return combined[:top_n]

    # ------------------------------------------------------------------
    # Re-ranking and insight helpers
    # ------------------------------------------------------------------
    def _llm_rerank(self, query: str, candidates: List[Dict[str, Any]]) -> List[Dict[str, Any]]:
        if not self._llm_client or not candidates:
            return candidates

        prompt_lines = [
            "You are a precision reranker for a Laboratory retrieval system.",
            "Reorder the documents to maximize business relevance to the query.",
            "Return a JSON array of document IDs in best-first order.",
            f"Query: {query}",
            "Documents:",
        ]
        for idx, cand in enumerate(candidates, 1):
            snippet = self.normalize_text(cand.get("body", ""))[:280]
            prompt_lines.append(
                f"{idx}. id={cand['doc_id']} | title={cand.get('title', 'Untitled')} | snippet={snippet}"
            )
        prompt_lines.append("JSON array only, no explanation.")
        prompt = "\n".join(prompt_lines)

        try:
            response = self._llm_client.call(prompt, temperature=0.2, num_predict=512, top_p=0.9)
            ordered_ids = json.loads(response) if response else []
            ordered_lookup = {doc_id: i for i, doc_id in enumerate(ordered_ids)}
            reranked = sorted(
                candidates,
                key=lambda c: ordered_lookup.get(c["doc_id"], len(ordered_lookup) + candidates.index(c)),
            )
            return reranked
        except Exception as exc:  # pragma: no cover - resilient fallback
            logger.warning("⚠️ LLM rerank failed, using hybrid scores: %s", exc)
            return candidates

    def generate_business_insights(
        self,
        atom_id: str,
        query: str,
        execution_result: Optional[Dict[str, Any]] = None,
        top_n: int = 3,
    ) -> str:
        candidates = self.search(query, top_n=top_n)
        if not candidates:
            return ""

        lines = ["## Business-Focused Signals"]
        for cand in candidates:
            rationale = cand.get("metadata", {}).get("business_value") or cand.get("metadata", {}).get("summary")
            rationale = rationale or cand.get("body", "")[:180]
            lines.append(
                f"- [{cand['title']}] Score={cand['hybrid_score']:.3f}: {rationale}"
            )

        if execution_result:
            preview_keys = list(execution_result.keys())[:4]
            lines.append("## Atom Output Highlights")
            lines.append(
                f"Atom `{atom_id}` produced keys {preview_keys}. Connect these outputs to the business signals above."
            )

        return "\n".join(lines)

    # ------------------------------------------------------------------
    # Observability
    # ------------------------------------------------------------------
    def _log_trace(self, stage: str, details: Dict[str, Any]) -> None:
        self._trace_log.append({"stage": stage, **details})

    def get_traces(self) -> List[Dict[str, Any]]:
        return self._trace_log[-50:]


__all__ = ["LaboratoryRetrievalPipeline", "CorpusDocument"]
