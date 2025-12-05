from __future__ import annotations

"""
Utility helpers to condense persisted chat transcripts into lightweight summaries.

The summarizer is intentionally heuristic (no extra LLM call) so we can safely
use it both on the API listing endpoint and inside backend agents without
impacting latency or introducing token bloat.
"""

from typing import Dict, List, Optional

DEFAULT_PAIR_WINDOW = 5
DEFAULT_CHAR_LIMIT = 1200


def _normalize_text(value: str) -> str:
    """Collapse whitespace and strip control characters."""
    return " ".join(value.split())


def _sender_label(sender: str) -> str:
    normalized = sender.lower()
    if normalized in {"user", "human", "client"}:
        return "User"
    if normalized in {"ai", "assistant", "bot", "trinity"}:
        return "Assistant"
    return sender.title() or "Assistant"


def summarize_messages(
    messages: List[Dict[str, Optional[str]]],
    *,
    max_pairs: int = DEFAULT_PAIR_WINDOW,
    max_chars: int = DEFAULT_CHAR_LIMIT,
) -> str:
    """
    Build a compact textual summary from the supplied chat transcript.

    Args:
        messages: Raw message objects saved in memory.
        max_pairs: Number of user/assistant exchange pairs to retain.
        max_chars: Hard character cap for the final summary string.

    Returns:
        Human-readable multi-line summary ready to inject into prompts.
    """
    if not messages:
        return ""

    formatted_pairs: List[str] = []
    pending_user: Optional[str] = None

    for msg in messages:
        sender_raw = str(msg.get("sender") or msg.get("role") or "").strip()
        content_raw = str(msg.get("content") or "").strip()
        if not sender_raw or not content_raw:
            continue

        content = _normalize_text(content_raw)
        sender = sender_raw.lower()

        if sender in {"user", "human", "client"}:
            pending_user = content
            continue

        if sender in {"ai", "assistant", "bot", "system"}:
            label = _sender_label(sender_raw)
            if pending_user:
                formatted_pairs.append(
                    f"User: {pending_user}\n{label}: {content}"
                )
                pending_user = None
            else:
                formatted_pairs.append(f"{label}: {content}")
            continue

        # Unknown sender types get appended as-is
        formatted_pairs.append(f"{_sender_label(sender_raw)}: {content}")

    if pending_user:
        formatted_pairs.append(f"User: {pending_user}")

    if not formatted_pairs:
        # Fallback to last few raw messages
        fallback_lines: List[str] = []
        for raw in messages[-max_pairs:]:
            sender = _sender_label(str(raw.get("sender") or raw.get("role") or ""))
            content = _normalize_text(str(raw.get("content") or ""))
            if content:
                fallback_lines.append(f"{sender}: {content}")
        summary = "\n".join(fallback_lines)
    else:
        window = formatted_pairs[-max_pairs:]
        summary = "\n\n".join(window)

    summary = summary.strip()
    if len(summary) > max_chars:
        summary = summary[: max_chars - 3].rstrip() + "..."

    return summary


__all__ = ["summarize_messages"]


