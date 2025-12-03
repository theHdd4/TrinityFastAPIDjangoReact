"""Business-first atom insight generation with caching and quick stats."""

from __future__ import annotations

import hashlib
import json
import logging
import math
import os
from dataclasses import dataclass
from pathlib import Path
from statistics import mean, pstdev
from typing import Any, Dict, List, Optional, Sequence

from diskcache import Cache

from TrinityAgent.llm_client import LLMClient

logger = logging.getLogger("trinity.atoms.insights")

_CACHE_PATH = Path(os.getenv("TRINITY_ATOM_INSIGHT_CACHE", "/tmp/trinity_atom_insights"))
_CACHE_PATH.mkdir(parents=True, exist_ok=True)
_CACHE = Cache(str(_CACHE_PATH))


@dataclass
class InsightPayload:
    """Structured insight entry returned to the UI."""

    insight: str
    impact: str
    risk: str
    next_action: str

    def to_dict(self) -> Dict[str, str]:
        return {
            "insight": self.insight,
            "impact": self.impact,
            "risk": self.risk,
            "next_action": self.next_action,
        }


def _hash_facts(data_hash: Optional[str], facts: Any) -> str:
    if data_hash:
        return data_hash
    try:
        serialized = json.dumps(facts, sort_keys=True, default=str)
    except (TypeError, ValueError):
        serialized = str(facts)
    return hashlib.sha256(serialized.encode("utf-8")).hexdigest()


def _extract_numeric_columns(rows: Sequence[Dict[str, Any]]) -> Dict[str, List[float]]:
    numeric: Dict[str, List[float]] = {}
    for row in rows:
        if not isinstance(row, dict):
            continue
        for key, value in row.items():
            if isinstance(value, (int, float)) and not isinstance(value, bool):
                numeric.setdefault(key, []).append(float(value))
    return numeric


def _compute_basic_stats(rows: Sequence[Dict[str, Any]]) -> Dict[str, Dict[str, float]]:
    stats: Dict[str, Dict[str, float]] = {}
    if not rows:
        return stats

    numeric_columns = _extract_numeric_columns(rows)
    for col, values in numeric_columns.items():
        if not values:
            continue
        stats[col] = {
            "min": min(values),
            "max": max(values),
            "avg": mean(values),
            "count": len(values),
        }
    return stats


def _detect_anomalies(rows: Sequence[Dict[str, Any]]) -> Dict[str, Any]:
    anomalies: Dict[str, Any] = {"z_scores": {}, "missing_rates": {}}
    if not rows:
        return anomalies

    numeric_columns = _extract_numeric_columns(rows)
    for col, values in numeric_columns.items():
        if len(values) < 3:
            continue
        sigma = pstdev(values)
        if math.isclose(sigma, 0.0):
            continue
        mu = mean(values)
        outliers = [val for val in values if abs((val - mu) / sigma) > 3]
        if outliers:
            anomalies["z_scores"][col] = {
                "mean": mu,
                "stdev": sigma,
                "outliers": outliers[:5],
            }

    total_rows = len(rows)
    missing_counts: Dict[str, int] = {}
    for row in rows:
        if not isinstance(row, dict):
            continue
        for key, value in row.items():
            is_missing = value in (None, "", "nan")
            if isinstance(value, float) and math.isnan(value):
                is_missing = True
            if is_missing:
                missing_counts[key] = missing_counts.get(key, 0) + 1
    if total_rows > 0:
        anomalies["missing_rates"] = {
            key: count / total_rows for key, count in missing_counts.items()
        }
    return anomalies


def summarize_facts(goal: str, facts: Any, stats: Dict[str, Any], anomalies: Dict[str, Any]) -> str:
    lines = [
        f"Goal: {goal.strip()}",
        "Findings:"
    ]

    if isinstance(facts, str):
        lines.append(facts.strip())
    elif isinstance(facts, dict):
        for key, value in facts.items():
            if key in {"rows", "data", "samples"}:
                continue
            try:
                serialized = json.dumps(value, default=str)
            except (TypeError, ValueError):
                serialized = str(value)
            lines.append(f"- {key}: {serialized[:400]}")
    else:
        lines.append(str(facts))

    if stats:
        lines.append("Key Stats:")
        for col, metric in stats.items():
            lines.append(
                f"- {col}: min={metric.get('min')}, max={metric.get('max')}, "
                f"avg={metric.get('avg')}, count={metric.get('count')}"
            )

    if anomalies.get("z_scores"):
        lines.append("Anomalies:")
        for col, meta in anomalies["z_scores"].items():
            outlier_preview = ", ".join([f"{val:.2f}" for val in meta.get("outliers", [])])
            lines.append(
                f"- {col}: z-score outliers near mean {meta.get('mean'):.2f} "
                f"(stdev {meta.get('stdev'):.2f}) -> {outlier_preview}"
            )

    missing = anomalies.get("missing_rates") or {}
    dense_missing = {k: v for k, v in missing.items() if v > 0}
    if dense_missing:
        lines.append("Data Quality:")
        for col, rate in dense_missing.items():
            lines.append(f"- {col}: missing rate {rate:.1%}")

    return "\n".join(lines)


def _build_prompt(goal: str, facts_text: str) -> str:
    return (
        "Given the goal "
        f"<goal> {goal} </goal> and the following findings <facts> {facts_text} </facts>, "
        "list 3-5 concise business-relevant insights. Each insight should mention expected impact, "
        "risk/uncertainty, and suggested next action. Avoid industry-specific jargon. "
        "Return JSON in the form: "
        "[{\"insight\": str, \"impact\": str, \"risk\": str, \"next_action\": str}]."
    )


def _parse_insights(raw_response: str) -> List[InsightPayload]:
    cleaned = raw_response.strip()
    if cleaned.startswith("```"):
        cleaned = cleaned.strip("`\n")
    if "[" not in cleaned:
        return []
    start = cleaned.find("[")
    snippet = cleaned[start:]
    try:
        data = json.loads(snippet)
    except json.JSONDecodeError:
        return []

    insights: List[InsightPayload] = []
    if isinstance(data, list):
        for item in data:
            if not isinstance(item, dict):
                continue
            insights.append(
                InsightPayload(
                    insight=str(item.get("insight", "")),
                    impact=str(item.get("impact", "")),
                    risk=str(item.get("risk", "")),
                    next_action=str(item.get("next_action", "")),
                )
            )
    return insights


def generate_insights(
    goal: str,
    facts: Any,
    data_hash: Optional[str],
    atom_id: Optional[str] = None,
    llm_client: Optional[LLMClient] = None,
) -> List[Dict[str, str]]:
    """Generate cached business-first insights for an atom."""

    cache_key = f"{atom_id or 'atom'}:{_hash_facts(data_hash, facts)}"
    cached = _CACHE.get(cache_key)
    if cached:
        logger.debug("ℹ️ Returning cached insights for %s", cache_key)
        return cached

    rows: Sequence[Dict[str, Any]] = []
    if isinstance(facts, dict):
        for candidate in ("rows", "data", "samples", "preview"):
            if isinstance(facts.get(candidate), list):
                rows = facts.get(candidate)  # type: ignore
                break
            if isinstance(facts.get(candidate), dict) and isinstance(facts[candidate].get("data"), list):
                rows = facts[candidate]["data"]  # type: ignore
                break

    stats = _compute_basic_stats(rows)
    anomalies = _detect_anomalies(rows)
    facts_text = summarize_facts(goal, facts, stats, anomalies)
    prompt = _build_prompt(goal, facts_text)

    client = llm_client or LLMClient()
    try:
        raw = client.call(prompt, temperature=0.2, num_predict=700, top_p=0.9, repeat_penalty=1.05)
        parsed = _parse_insights(raw)
        if not parsed:
            raise ValueError("No insights parsed from LLM response")
        results = [p.to_dict() for p in parsed]
        _CACHE.set(cache_key, results, expire=60 * 60 * 6)
        return results
    except Exception as exc:  # noqa: BLE001
        logger.warning("⚠️ Insight generation failed (%s); returning fallback", exc)
        fallback = [
            {
                "insight": "No actionable insight generated.",
                "impact": "Pending more context.",
                "risk": "Low confidence due to processing error.",
                "next_action": "Review the atom output manually and retry if needed.",
            }
        ]
        _CACHE.set(cache_key, fallback, expire=60 * 10)
        return fallback
