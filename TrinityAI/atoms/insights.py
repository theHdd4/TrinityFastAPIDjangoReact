"""Business-focused insight generator for atom outputs.

This module summarizes atom outputs, derives lightweight statistics,
checks for simple anomalies, and asks a language model for concise,
actionable insights. Results are cached by (atom_id, data_hash) to
avoid recomputation when the same payload is seen again.
"""
from __future__ import annotations

import json
import math
from dataclasses import dataclass
from hashlib import md5
from pathlib import Path
from typing import Any, Dict, List, Optional

import pandas as pd
import requests

try:
    from diskcache import Cache
except Exception:  # pragma: no cover - optional dependency
    Cache = None  # type: ignore

try:  # pragma: no cover - optional async client
    import aiohttp
except Exception:
    aiohttp = None  # type: ignore

CACHE_DIR = Path.home() / ".trinity_ai" / "atom_insights_cache"
CACHE_DIR.mkdir(parents=True, exist_ok=True)

_fallback_cache: Dict[str, List[Dict[str, str]]] = {}
_cache: Optional[Cache] = None


@dataclass
class InsightConfig:
    """LLM and prompt configuration for insight generation."""

    llm_api_url: Optional[str]
    llm_model: Optional[str]
    bearer_token: Optional[str] = None
    timeout_seconds: float = 45.0
    snippet_chars: int = 300


@dataclass
class TableSummary:
    """Lightweight profile of tabular content."""

    columns: List[str]
    sample_rows: List[Dict[str, Any]]
    stats: List[Dict[str, Any]]
    anomalies: List[Dict[str, Any]]


async def generate_insights(
    goal: str,
    facts: Dict[str, Any],
    data_hash: str,
    atom_id: Optional[str] = None,
    config: Optional[InsightConfig] = None,
) -> List[Dict[str, str]]:
    """Generate business-first insights for an atom output."""

    cache_key = f"{atom_id or 'unknown'}::{data_hash}"
    cached = _get_cache_entry(cache_key)
    if cached is not None:
        return cached

    table_summary = _extract_table_summary(facts.get("result"))
    metrics = _extract_numeric_metrics(facts.get("result"))
    chart_meta = _extract_chart_meta(facts.get("result"))

    facts_block = _format_facts(
        facts=facts,
        table_summary=table_summary,
        metrics=metrics,
        chart_meta=chart_meta,
    )
    prompt = _build_prompt(goal=goal, facts_block=facts_block)

    if not config or not config.llm_api_url or not config.llm_model:
        insights = [_fallback_insight("LLM config missing")]
        _store_cache_entry(cache_key, insights)
        return insights

    try:
        raw_response = await _call_llm(prompt=prompt, config=config)
        parsed = _parse_insight_response(raw_response)
        insights = parsed or [_fallback_insight("LLM returned empty response")]
    except Exception as insight_error:  # pragma: no cover - defensive
        insights = [_fallback_insight(str(insight_error))]

    _store_cache_entry(cache_key, insights)
    return insights


def _get_cache_entry(key: str) -> Optional[List[Dict[str, str]]]:
    cache = _ensure_cache()
    if cache is None:
        return _fallback_cache.get(key)
    try:
        return cache.get(key)
    except Exception:
        return None


def _store_cache_entry(key: str, value: List[Dict[str, str]]) -> None:
    cache = _ensure_cache()
    if cache is None:
        _fallback_cache[key] = value
        return
    try:
        cache.set(key, value, expire=24 * 3600)
    except Exception:
        _fallback_cache[key] = value


def _ensure_cache() -> Optional[Cache]:
    global _cache
    if Cache is None:
        return None
    if _cache is None:
        _cache = Cache(str(CACHE_DIR))
    return _cache


def _extract_table_summary(result: Any, sample_limit: int = 5) -> Optional[TableSummary]:
    df = _coerce_dataframe(result)
    if df is None or df.empty:
        return None

    sample_rows = df.head(sample_limit).to_dict(orient="records")
    stats: List[Dict[str, Any]] = []
    anomalies: List[Dict[str, Any]] = []
    for column in df.columns:
        series = df[column]
        non_null = series.dropna()
        total_count = len(series)
        missing_rate = 1 - (len(non_null) / total_count) if total_count else 0
        column_stats: Dict[str, Any] = {
            "column": column,
            "count": int(len(non_null)),
            "missing_rate": round(missing_rate, 3),
        }
        if pd.api.types.is_numeric_dtype(series):
            column_stats.update(
                {
                    "min": _safe_number(non_null.min()),
                    "max": _safe_number(non_null.max()),
                    "avg": _safe_number(non_null.mean()),
                }
            )
            std = float(non_null.std()) if len(non_null) else 0.0
            if std > 0:
                z_scores = ((non_null - non_null.mean()) / std).abs()
                outliers = non_null[z_scores > 3]
                if not outliers.empty:
                    anomalies.append(
                        {
                            "column": column,
                            "type": "z-score-outlier",
                            "count": int(outliers.shape[0]),
                            "examples": [
                                _safe_number(v) for v in outliers.head(3).tolist()
                            ],
                        }
                    )
        stats.append(column_stats)

    return TableSummary(
        columns=[str(col) for col in df.columns],
        sample_rows=sample_rows,
        stats=stats,
        anomalies=anomalies,
    )


def _extract_numeric_metrics(result: Any) -> Dict[str, float]:
    metrics: Dict[str, float] = {}
    if isinstance(result, dict):
        for key, value in result.items():
            if isinstance(value, (int, float)) and math.isfinite(value):
                metrics[key] = float(value)
    return metrics


def _extract_chart_meta(result: Any) -> Dict[str, Any]:
    if not isinstance(result, dict):
        return {}
    chart_payload = result.get("chart_json") or result.get("chart_data")
    if not chart_payload:
        return {}
    try:
        chart = json.loads(chart_payload) if isinstance(chart_payload, str) else chart_payload
    except Exception:
        return {}

    traces = chart.get("data") if isinstance(chart, dict) else None
    layout = chart.get("layout") if isinstance(chart, dict) else None
    return {
        "trace_count": len(traces) if isinstance(traces, list) else 0,
        "has_layout": bool(layout),
    }


def _format_facts(
    facts: Dict[str, Any],
    table_summary: Optional[TableSummary],
    metrics: Dict[str, float],
    chart_meta: Dict[str, Any],
) -> str:
    lines: List[str] = []
    atom_id = facts.get("atom_id") or "unknown_atom"
    description = facts.get("description") or ""
    output_alias = facts.get("output_alias") or ""
    files_used = facts.get("files_used") or []

    lines.append(f"Atom: {atom_id} | Description: {description}")
    if output_alias:
        lines.append(f"Output handle: {output_alias}")
    if files_used:
        lines.append(f"Files referenced: {', '.join(files_used)}")

    if table_summary:
        lines.append(
            f"Tabular columns: {', '.join(table_summary.columns)} | Sample rows: {table_summary.sample_rows}"
        )
        lines.append(f"Column stats: {table_summary.stats}")
        if table_summary.anomalies:
            lines.append(f"Detected anomalies: {table_summary.anomalies}")
    if metrics:
        lines.append(f"Numeric metrics: {metrics}")
    if chart_meta:
        lines.append(f"Chart metadata: {chart_meta}")

    parameters = facts.get("parameters")
    if parameters:
        try:
            parameters_preview = json.dumps(parameters)[:300]
        except Exception:
            parameters_preview = str(parameters)[:300]
        lines.append(f"Parameters: {parameters_preview}")

    return "\n".join(lines)


def _build_prompt(goal: str, facts_block: str) -> str:
    return (
        "Given the goal <goal> and the following findings <facts>, list 3-5 concise "
        "business-relevant insights. Each insight should mention expected impact, "
        "risk/uncertainty, and suggested next action. Avoid industry-specific jargon.\n"
        f"<goal> {goal}\n"
        f"<facts> {facts_block}"
    )


def _parse_insight_response(raw_response: str) -> List[Dict[str, str]]:
    if not raw_response:
        return []
    try:
        parsed = json.loads(raw_response)
    except Exception:
        parsed = None
    if isinstance(parsed, dict):
        parsed = [parsed]
    if isinstance(parsed, list):
        cleaned: List[Dict[str, str]] = []
        for item in parsed:
            if not isinstance(item, dict):
                continue
            cleaned.append(
                {
                    "insight": str(item.get("insight", "")),
                    "impact": str(item.get("impact", "")),
                    "risk": str(item.get("risk", "")),
                    "next_action": str(item.get("next_action", "")),
                }
            )
        return cleaned
    return []


async def _call_llm(prompt: str, config: InsightConfig) -> str:
    if aiohttp is None:
        return _call_llm_sync(prompt, config)
    headers = {"Content-Type": "application/json"}
    if config.bearer_token:
        headers["Authorization"] = f"Bearer {config.bearer_token}"

    payload = {
        "model": config.llm_model,
        "messages": [
            {
                "role": "system",
                "content": (
                    "You generate structured JSON insights with keys: insight, impact, risk, next_action."
                ),
            },
            {
                "role": "user",
                "content": prompt[: config.snippet_chars * 4],
            },
        ],
        "temperature": 0.2,
        "max_tokens": 400,
    }

    async with aiohttp.ClientSession() as session:
        async with session.post(
            config.llm_api_url,
            json=payload,
            headers=headers,
            timeout=aiohttp.ClientTimeout(total=config.timeout_seconds),
        ) as response:
            response.raise_for_status()
            body = await response.json()
            return _extract_content_from_body(body)


def _call_llm_sync(prompt: str, config: InsightConfig) -> str:
    headers = {"Content-Type": "application/json"}
    if config.bearer_token:
        headers["Authorization"] = f"Bearer {config.bearer_token}"

    payload = {
        "model": config.llm_model,
        "messages": [
            {
                "role": "system",
                "content": (
                    "You generate structured JSON insights with keys: insight, impact, risk, next_action."
                ),
            },
            {
                "role": "user",
                "content": prompt[: config.snippet_chars * 4],
            },
        ],
        "temperature": 0.2,
        "max_tokens": 400,
    }

    response = requests.post(
        config.llm_api_url,
        headers=headers,
        json=payload,
        timeout=config.timeout_seconds,
    )
    response.raise_for_status()
    return _extract_content_from_body(response.json())


def _extract_content_from_body(body: Any) -> str:
    if isinstance(body, dict):
        if "choices" in body:
            choice = body.get("choices") or []
            if choice:
                return (
                    choice[0].get("message", {}).get("content")
                    or choice[0].get("text", "")
                    or ""
                )
        if "message" in body:
            return body.get("message", {}).get("content", "")
    return str(body)


def _safe_number(value: Any) -> Optional[float]:
    try:
        number = float(value)
    except Exception:
        return None
    if math.isfinite(number):
        return round(number, 4)
    return None


def _coerce_dataframe(result: Any) -> Optional[pd.DataFrame]:
    if isinstance(result, pd.DataFrame):
        return result
    if isinstance(result, dict):
        for key in [
            "data",
            "rows",
            "table",
            "table_json",
            "groupby_json",
            "merge_json",
            "concat_json",
            "preview",
            "validated_data",
        ]:
            candidate = result.get(key)
            df = _frame_from_candidate(candidate, result)
            if df is not None and not df.empty:
                return df
    if isinstance(result, list):
        if result and isinstance(result[0], dict):
            return pd.DataFrame(result)
    return None


def _frame_from_candidate(candidate: Any, container: Dict[str, Any]) -> Optional[pd.DataFrame]:
    if candidate is None:
        return None
    try:
        if isinstance(candidate, str):
            candidate = json.loads(candidate)
        if isinstance(candidate, list):
            if candidate and isinstance(candidate[0], dict):
                return pd.DataFrame(candidate)
            columns = container.get("columns") if isinstance(container.get("columns"), list) else None
            if columns and candidate and isinstance(candidate[0], list):
                return pd.DataFrame(candidate, columns=columns)
        if isinstance(candidate, dict):
            if "data" in candidate and isinstance(candidate["data"], list):
                if candidate["data"] and isinstance(candidate["data"][0], dict):
                    return pd.DataFrame(candidate["data"])
    except Exception:
        return None
    return None


def _fallback_insight(reason: str) -> Dict[str, str]:
    return {
        "insight": "No actionable insight generated.",
        "impact": "n/a",
        "risk": reason,
        "next_action": "Review the atom output manually and retry if needed.",
    }


def hash_payload(payload: Any) -> str:
    """Create a stable hash for caching purposes."""
    try:
        serialized = json.dumps(payload, sort_keys=True, default=str)
    except Exception:
        serialized = str(payload)
    return md5(serialized.encode("utf-8")).hexdigest()
