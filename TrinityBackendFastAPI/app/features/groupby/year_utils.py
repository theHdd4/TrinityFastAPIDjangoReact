from __future__ import annotations

import logging
from typing import Iterable, List

import pandas as pd

logger = logging.getLogger("app.features.groupby.year_utils")


def _find_date_like_columns(frame: pd.DataFrame) -> List[str]:
    """Return candidate date-like columns (by dtype or name)."""

    candidates: List[str] = []
    for col in frame.columns:
        series = frame[col]
        col_lower = str(col).lower()
        if pd.api.types.is_datetime64_any_dtype(series):
            candidates.append(col)
            continue
        if any(keyword in col_lower for keyword in ["date", "time", "timestamp", "period"]):
            candidates.append(col)
            continue
    return candidates


def _ensure_year_identifier(
    frame: pd.DataFrame, identifiers: Iterable[str]
) -> tuple[pd.DataFrame, List[str], str | None]:
    """Ensure the dataframe has a usable ``year`` column when requested.

    If "year" is in the identifiers but not in the dataframe, attempt to derive it
    from a date-like column. When no date-like column exists, raise a ``ValueError``
    with guidance so the caller can surface a user-facing clarification message.
    """

    normalized_identifiers: List[str] = []
    requires_year = False

    for ident in identifiers:
        if not isinstance(ident, str):
            continue
        cleaned = ident.strip()
        if not cleaned:
            continue
        normalized_identifiers.append(cleaned)
        if cleaned.lower() == "year":
            requires_year = True

    if not requires_year:
        return frame, normalized_identifiers, None

    # Already present
    if any(str(col).lower() == "year" for col in frame.columns):
        return frame, normalized_identifiers, None

    date_candidates = _find_date_like_columns(frame)
    if not date_candidates:
        raise ValueError(
            "Unable to derive 'year' because no date-like column was found. "
            "Please add a date column or create a year column via the create-transform atom before grouping."
        )

    for candidate in date_candidates:
        parsed = pd.to_datetime(frame[candidate], errors="coerce")
        if parsed.notna().any():
            working = frame.copy()
            working["year"] = parsed.dt.year
            logger.info(
                "📅 Derived 'year' column from %s for groupby identifiers", candidate
            )
            return working, normalized_identifiers, candidate

    raise ValueError(
        "Unable to derive 'year' from available date-like columns. "
        "Please ensure a parsable date column exists or manually configure the year dimension."
    )
