"""LLM-based re-ranking utilities for hybrid retrieval."""
from __future__ import annotations

import json
import logging
from typing import Any, Dict, Iterable, List, Optional

import numpy as np

from TrinityAI.retrieval.hybrid import load_config
from TrinityAgent.llm_client import LLMClient

logger = logging.getLogger("trinity.llm_rerank")


def _chunks(items: List[Dict[str, Any]], size: int) -> Iterable[List[Dict[str, Any]]]:
    for start in range(0, len(items), size):
        yield items[start : start + size]


def _normalize(values: List[float]) -> List[float]:
    if not values:
        return values
    arr = np.array(values, dtype=float)
    max_v = np.max(arr)
    min_v = np.min(arr)
    if max_v == min_v:
        return [0.0 for _ in values]
    return list((arr - min_v) / (max_v - min_v))


def _build_prompt(query: str, docs: List[Dict[str, Any]], snippet_len: int) -> str:
    lines = [
        "Rate each document for relevance to the query on a 1-5 scale (5 = highly relevant).",
        "Return a JSON array sorted best-first with objects: {\"doc_id\": str, \"score\": int}.",
        f"Query: {query}",
        "Documents:",
    ]
    for idx, doc in enumerate(docs, 1):
        title = (doc.get("title") or "Untitled").replace("\n", " ")
        body = (doc.get("body") or "").replace("\n", " ")
        snippet = (body[:snippet_len]).strip()
        lines.append(f"{idx}) id={doc.get('doc_id')} | title={title} | snippet={snippet}")
    lines.append("Return only JSON.")
    return "\n".join(lines)


def _parse_scores(raw: str, allowed_ids: List[str]) -> Dict[str, float]:
    scores: Dict[str, float] = {}
    try:
        payload = json.loads(raw)
        if not isinstance(payload, list):
            return scores
        for item in payload:
            if not isinstance(item, dict):
                continue
            doc_id = str(item.get("doc_id"))
            score = item.get("score")
            if doc_id in allowed_ids and isinstance(score, (int, float)):
                scores[doc_id] = float(score)
    except Exception as exc:  # pragma: no cover - defensive parsing
        logger.warning("LLM rerank response parse failed: %s", exc)
    return scores


def rerank(
    query: str,
    docs: List[Dict[str, Any]],
    *,
    config_path: str = "configs/retrieval.yaml",
    llm_client: Optional[LLMClient] = None,
) -> List[Dict[str, Any]]:
    """
    Re-rank documents using an LLM relevance grader.

    Args:
        query: Original user query.
        docs: Documents with at least doc_id, title, body, hybrid_score.
        config_path: Retrieval configuration path.
        llm_client: Optional preconfigured LLM client.

    Returns:
        Docs sorted by blended hybrid + LLM score with added fields.
    """

    if not docs:
        return docs

    config = load_config(config_path)
    rerank_cfg = config.get("rerank", {})
    batch_size = int(rerank_cfg.get("batch_size", 5))
    snippet_len = int(rerank_cfg.get("snippet_chars", 300))
    hybrid_weight = float(rerank_cfg.get("hybrid_weight", 0.7))
    llm_weight = float(rerank_cfg.get("llm_weight", 0.3))

    client = llm_client or LLMClient()

    # Normalize hybrid scores for blending
    hybrid_scores = [float(doc.get("hybrid_score", 0.0)) for doc in docs]
    hybrid_norm = _normalize(hybrid_scores)
    for doc, score in zip(docs, hybrid_norm):
        doc["hybrid_score_normalized"] = score

    llm_scores: Dict[str, float] = {}
    for batch in _chunks(docs, batch_size):
        prompt = _build_prompt(query, batch, snippet_len)
        try:
            response = client.call(prompt, temperature=0.2, num_predict=512, top_p=0.9)
            batch_scores = _parse_scores(response, [d["doc_id"] for d in batch])
            llm_scores.update(batch_scores)
        except Exception as exc:  # pragma: no cover - resilient to API failures
            logger.warning("LLM call failed during rerank: %s", exc)

    llm_norm = _normalize([llm_scores.get(doc["doc_id"], 0.0) for doc in docs])
    for doc, score in zip(docs, llm_norm):
        doc["llm_score"] = float(llm_scores.get(doc["doc_id"], 0.0))
        doc["llm_score_normalized"] = float(score)
        doc["final_score"] = hybrid_weight * doc.get("hybrid_score_normalized", 0.0) + llm_weight * score

    docs.sort(key=lambda d: d.get("final_score", d.get("hybrid_score", 0.0)), reverse=True)
    return docs


__all__ = ["rerank"]
