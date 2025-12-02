import json
import logging
import os
import re
from functools import lru_cache
from pathlib import Path
from typing import Callable, Dict, Iterable, List, Optional

import requests
import yaml

logger = logging.getLogger(__name__)

REPO_ROOT = Path(__file__).resolve().parents[2]
DEFAULT_CONFIG_PATH = REPO_ROOT / "configs" / "retrieval.yaml"


@lru_cache(maxsize=1)
def load_config(config_path: Path = DEFAULT_CONFIG_PATH) -> Dict:
    path = Path(config_path)
    with path.open("r") as f:
        return yaml.safe_load(f)


def _batch(items: Iterable[Dict], size: int) -> Iterable[List[Dict]]:
    batch: List[Dict] = []
    for item in items:
        batch.append(item)
        if len(batch) >= size:
            yield batch
            batch = []
    if batch:
        yield batch


@lru_cache(maxsize=1)
def _load_corpus_lookup(config_path: str) -> Dict[str, Dict[str, str]]:
    config = load_config(Path(config_path))
    lookup: Dict[str, Dict[str, str]] = {}
    corpus_path = REPO_ROOT / config.get("paths", {}).get("corpus_jsonl", "")
    if corpus_path.exists():
        with corpus_path.open("r") as f:
            for line in f:
                try:
                    record = json.loads(line)
                except json.JSONDecodeError:
                    continue
                doc_id = str(record.get("id"))
                lookup[doc_id] = {
                    "title": record.get("title", ""),
                    "text": record.get("body", record.get("text", "")),
                }
    return lookup


def _snippet(doc: Dict, lookup: Dict[str, Dict[str, str]], max_chars: int) -> Dict[str, str]:
    doc_id = str(doc.get("doc_id") or doc.get("id"))
    corpus_entry = lookup.get(doc_id, {})
    title = doc.get("title") or corpus_entry.get("title", "")
    text = (
        doc.get("text")
        or doc.get("body")
        or doc.get("snippet")
        or corpus_entry.get("text", "")
    )
    cleaned = re.sub(r"\s+", " ", text or "").strip()
    snippet = cleaned[:max_chars]
    return {"doc_id": doc_id, "title": title, "snippet": snippet}


def _format_prompt(query: str, docs: List[Dict]) -> str:
    doc_lines = []
    for doc in docs:
        doc_lines.append(
            f"- id: {doc['doc_id']}\n  title: {doc.get('title', '')}\n  snippet: {doc.get('snippet', '')}"
        )
    prompt = (
        "You are re-ranking search results. Given a query and candidate documents, "
        "assign an integer relevance score from 1 (irrelevant) to 5 (highly relevant) "
        "for each document. Respond ONLY with a JSON list of objects with keys 'doc_id' "
        "and 'score'. Do not include any extra commentary.\n"
        f"Query: {query}\n"
        "Documents:\n"
        f"{os.linesep.join(doc_lines)}\n"
        "Return JSON like: [{\"doc_id\": \"123\", \"score\": 4}]."
    )
    return prompt


def _call_llm(prompt: str, rerank_config: Dict) -> str:
    api_url = os.getenv("LLM_RERANK_API_URL") or rerank_config.get("api_url") or os.getenv("LLM_API_URL")
    if not api_url:
        raise ValueError("No LLM API URL configured for reranking")

    model = os.getenv("LLM_RERANK_MODEL") or rerank_config.get("model_name", "gpt-3.5-turbo")
    token = os.getenv("LLM_RERANK_API_KEY") or rerank_config.get("api_key") or os.getenv("LLM_BEARER_TOKEN")
    temperature = rerank_config.get("temperature", 0.0)
    timeout = rerank_config.get("timeout", 30)

    headers = {"Content-Type": "application/json"}
    if token:
        headers["Authorization"] = f"Bearer {token}"

    payload = {
        "model": model,
        "messages": [{"role": "user", "content": prompt}],
        "temperature": temperature,
    }

    response = requests.post(api_url, json=payload, headers=headers, timeout=timeout)
    response.raise_for_status()
    data = response.json()
    if isinstance(data, dict):
        choices = data.get("choices", [])
        if choices:
            message = choices[0].get("message") or {}
            return message.get("content") or choices[0].get("text", "")
    return ""


def _parse_scores(raw: str, allowed_ids: List[str]) -> Dict[str, float]:
    scores: Dict[str, float] = {}
    try:
        parsed = json.loads(raw)
        candidates = parsed.get("scores") if isinstance(parsed, dict) else parsed
        if isinstance(candidates, list):
            for item in candidates:
                if not isinstance(item, dict):
                    continue
                doc_id = str(item.get("doc_id"))
                score = item.get("score")
                if doc_id in allowed_ids and isinstance(score, (int, float)):
                    scores[doc_id] = float(score)
    except json.JSONDecodeError:
        pattern = re.compile(r"(?P<id>[\w\-]+)\s*[:=]\s*(?P<score>[1-5])")
        for match in pattern.finditer(raw):
            doc_id = match.group("id")
            score = float(match.group("score"))
            if doc_id in allowed_ids:
                scores[doc_id] = score
    return scores


def rerank(
    query: str,
    docs: List[Dict],
    client: Optional[Callable[[str, Dict], str]] = None,
    config_path: Path = DEFAULT_CONFIG_PATH,
) -> List[Dict]:
    if not docs:
        return []

    config = load_config(config_path)
    rerank_config = config.get("rerank", {})
    batch_size = rerank_config.get("batch_size", 5)
    snippet_chars = rerank_config.get("snippet_chars", 300)
    hybrid_weight = rerank_config.get("hybrid_weight", 0.7)
    llm_weight = rerank_config.get("llm_weight", 0.3)

    lookup = _load_corpus_lookup(str(config_path))

    prepared_docs = []
    for doc in docs:
        enriched = {**doc, **_snippet(doc, lookup, snippet_chars)}
        prepared_docs.append(enriched)

    llm_scores: Dict[str, float] = {}
    for batch_docs in _batch(prepared_docs, batch_size):
        prompt = _format_prompt(query, batch_docs)
        caller = client or (lambda p, cfg=rerank_config: _call_llm(p, cfg))
        raw = caller(prompt, rerank_config) if client else caller(prompt)
        parsed = _parse_scores(raw, [d["doc_id"] for d in batch_docs])
        llm_scores.update(parsed)

    results: List[Dict] = []
    for doc in prepared_docs:
        doc_id = doc.get("doc_id") or doc.get("id")
        llm_score = llm_scores.get(str(doc_id))
        scaled_llm = (llm_score / 5.0) if llm_score is not None else 0.0
        hybrid_score = float(doc.get("hybrid_score", 0.0))
        final_score = hybrid_weight * hybrid_score + llm_weight * scaled_llm
        results.append(
            {
                **doc,
                "llm_score": llm_score,
                "final_score": final_score,
            }
        )

    results.sort(key=lambda x: x.get("final_score", 0.0), reverse=True)
    logger.info(
        "LLM rerank completed",
        extra={
            "query": query,
            "top_ids": [r.get("doc_id") for r in results[:5]],
            "weights": {"hybrid": hybrid_weight, "llm": llm_weight},
        },
    )
    return results


__all__ = ["rerank"]
