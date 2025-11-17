"""Service helpers for the build_feature_based feature.

These helpers mirror the light-weight dataframe service module so that each
operation can easily be delegated to Celery via ``celery_task_client``.
"""
from __future__ import annotations

import logging
from dataclasses import dataclass
from typing import Any, Dict, Iterable, List, Sequence

import numpy as np
import polars as pl

from app.features.dataframe_operations.service import (
    SESSIONS,
    dataframe_payload,
    get_session_dataframe,
)

logger = logging.getLogger("app.features.build_feature_based.service")


@dataclass
class ColumnSummary:
    name: str
    dtype: str
    null_count: int
    unique_count: int
    mean: float | None = None
    stddev: float | None = None

    def as_dict(self) -> Dict[str, Any]:
        payload: Dict[str, Any] = {
            "name": self.name,
            "dtype": self.dtype,
            "null_count": self.null_count,
            "unique_count": self.unique_count,
        }
        if self.mean is not None:
            payload["mean"] = self.mean
        if self.stddev is not None:
            payload["stddev"] = self.stddev
        return payload


def list_sessions() -> Dict[str, Any]:
    """Return identifiers for dataframe sessions managed by the platform."""

    datasets: List[Dict[str, Any]] = []
    for df_id, df in SESSIONS.items():
        try:
            datasets.append(
                {
                    "df_id": df_id,
                    "row_count": df.height,
                    "column_count": df.width,
                    "columns": df.columns,
                }
            )
        except Exception as exc:  # pragma: no cover - defensive
            logger.exception("Failed to describe dataframe session %s", df_id)
            raise ValueError(f"Unable to describe dataframe {df_id}: {exc}") from exc
    return {"datasets": datasets}


def list_columns(df_id: str) -> Dict[str, Any]:
    """Return column metadata for a dataframe session."""

    df = get_session_dataframe(df_id)
    summaries: List[Dict[str, Any]] = []
    for column, dtype in df.schema.items():
        series = df.get_column(column)
        nulls = int(series.null_count())
        uniques = int(series.n_unique())
        mean_val: float | None = None
        std_val: float | None = None
        if pl.datatypes.is_numeric(dtype):
            try:
                mean_val = float(series.mean())
            except Exception:  # pragma: no cover - numeric conversion guard
                mean_val = None
            try:
                std_val = float(series.std())
            except Exception:  # pragma: no cover - numeric conversion guard
                std_val = None
        summaries.append(
            ColumnSummary(
                name=column,
                dtype=str(dtype),
                null_count=nulls,
                unique_count=uniques,
                mean=mean_val,
                stddev=std_val,
            ).as_dict()
        )
    return {"columns": summaries}


def _ensure_columns_exist(df: pl.DataFrame, columns: Iterable[str]) -> None:
    missing = [col for col in columns if col not in df.columns]
    if missing:
        raise ValueError(f"Columns not found: {', '.join(missing)}")


def summarise_features(
    *,
    df_id: str,
    feature_columns: Sequence[str],
    target_column: str | None = None,
) -> Dict[str, Any]:
    """Return summary statistics for feature columns (and optional target)."""

    if not feature_columns:
        raise ValueError("At least one feature column must be provided")

    df = get_session_dataframe(df_id)
    _ensure_columns_exist(df, feature_columns)
    if target_column:
        _ensure_columns_exist(df, [target_column])

    summaries: List[Dict[str, Any]] = []
    correlations: Dict[str, float] = {}

    for column in feature_columns:
        series = df.get_column(column)
        summary = ColumnSummary(
            name=column,
            dtype=str(series.dtype),
            null_count=int(series.null_count()),
            unique_count=int(series.n_unique()),
        ).as_dict()
        if pl.datatypes.is_numeric(series.dtype):
            try:
                summary["mean"] = float(series.mean())
            except Exception:  # pragma: no cover - numeric guard
                summary["mean"] = None
            try:
                summary["stddev"] = float(series.std())
            except Exception:  # pragma: no cover - numeric guard
                summary["stddev"] = None
        summaries.append(summary)

        if target_column and pl.datatypes.is_numeric(series.dtype):
            try:
                corr_df = df.select(
                    pl.corr(pl.col(column), pl.col(target_column)).alias("corr")
                )
                corr_value = corr_df.get_column("corr")[0]
                if corr_value is not None:
                    correlations[column] = float(corr_value)
            except Exception as exc:  # pragma: no cover - correlation failure
                logger.warning("Correlation failed for %s -> %s: %s", column, target_column, exc)

    payload: Dict[str, Any] = {"summary": summaries}
    if target_column:
        payload["target_column"] = target_column
        payload["correlations"] = correlations
    return payload


def feature_matrix(
    *,
    df_id: str,
    feature_columns: Sequence[str],
    target_column: str | None = None,
    limit: int = 2000,
    include_target: bool = True,
) -> Dict[str, Any]:
    """Return a sampled feature matrix for preview purposes."""

    if limit <= 0:
        raise ValueError("limit must be positive")

    df = get_session_dataframe(df_id)
    columns: List[str] = list(feature_columns)
    if include_target and target_column:
        columns.append(target_column)

    if not columns:
        raise ValueError("At least one column must be requested")

    _ensure_columns_exist(df, columns)

    sample_df = df.select(columns)
    if sample_df.height > limit:
        sample_df = sample_df.head(limit)

    return {
        "rows": sample_df.to_dicts(),
        "row_count": sample_df.height,
        "column_count": sample_df.width,
        "columns": sample_df.columns,
    }


def _prepare_design_matrix(df: pl.DataFrame, columns: Sequence[str]) -> tuple[np.ndarray, List[str]]:
    subset = df.select(columns)
    # Polars get_dummies handles categorical expansion automatically
    encoded = subset.to_dummies()
    feature_names = encoded.columns
    matrix = encoded.to_numpy()
    matrix = matrix.astype(float, copy=False)
    return matrix, feature_names


def train_linear_model(
    *,
    df_id: str,
    target_column: str,
    feature_columns: Sequence[str],
) -> Dict[str, Any]:
    """Fit a simple least-squares regression model for quick diagnostics."""

    if not feature_columns:
        raise ValueError("feature_columns must not be empty")

    df = get_session_dataframe(df_id)
    _ensure_columns_exist(df, [target_column, *feature_columns])

    target_series = df.get_column(target_column)
    if not pl.datatypes.is_numeric(target_series.dtype):
        raise ValueError("target_column must be numeric for regression training")

    X, feature_names = _prepare_design_matrix(df, feature_columns)
    y = target_series.to_numpy().astype(float, copy=False)

    if X.shape[0] != y.shape[0]:
        raise ValueError("Feature matrix and target vector have inconsistent lengths")

    if X.shape[0] == 0:
        raise ValueError("No rows available for model training")

    ones = np.ones((X.shape[0], 1), dtype=float)
    X_augmented = np.hstack([ones, X])

    try:
        coefficients, residuals, rank, singular_values = np.linalg.lstsq(
            X_augmented, y, rcond=None
        )
    except np.linalg.LinAlgError as exc:
        raise ValueError(f"Failed to fit regression model: {exc}") from exc

    intercept = float(coefficients[0])
    beta = coefficients[1:]
    predictions = X_augmented @ coefficients
    residual_vector = y - predictions
    ss_res = float(np.sum(residual_vector ** 2))
    ss_tot = float(np.sum((y - y.mean()) ** 2))
    r_squared = 1.0 - ss_res / ss_tot if ss_tot else None
    rmse = float(np.sqrt(ss_res / len(y))) if len(y) else None

    coefficient_map = {
        name: float(value)
        for name, value in zip(feature_names, beta, strict=False)
    }

    return {
        "df_id": df_id,
        "target_column": target_column,
        "intercept": intercept,
        "coefficients": coefficient_map,
        "metrics": {
            "r_squared": r_squared,
            "rmse": rmse,
            "residual_sum_squares": ss_res,
        },
        "rows_used": len(y),
        "rank": int(rank),
        "singular_values": [float(val) for val in singular_values],
    }


def describe_dataframe(df_id: str) -> Dict[str, Any]:
    """Proxy to the dataframe_operations payload helper for convenience."""

    df = get_session_dataframe(df_id)
    return dataframe_payload(df, df_id)


__all__ = [
    "list_sessions",
    "list_columns",
    "summarise_features",
    "feature_matrix",
    "train_linear_model",
    "describe_dataframe",
]
