"""Reusable curve calculations for the select atom.

These helpers intentionally mirror the richer logic used by the evaluate
feature so the select atom can render the YoY growth curve and the
actual-vs-predicted chart even when the results file itself does not
contain pre-computed series.  The functions are synchronous so they can
be invoked directly by Celery tasks.
"""

from __future__ import annotations

import json
import logging
from typing import Any, Dict, Iterable, List, Optional, Tuple

import numpy as np
import pandas as pd

from .database import MINIO_BUCKET, get_minio_df
from .s_curve import apply_transformation_steps

logger = logging.getLogger("app.features.select_models_feature_based.curves")


def _detect_column(cols: Iterable[str], candidates: Iterable[str]) -> Optional[str]:
    lookup = {c.lower(): c for c in cols}
    for name in candidates:
        if name.lower() in lookup:
            return lookup[name.lower()]
    return None


def _extract_row(
    results_df: pd.DataFrame, combination_id: str, model_name: str
) -> Tuple[pd.Series, Dict[str, str]]:
    """Return the matching row plus a lower-case column lookup table."""

    combo_col = _detect_column(results_df.columns, ["combination_id", "combo_id", "combination"])
    model_col = _detect_column(results_df.columns, ["model_name", "model", "modelname"])
    if not combo_col or not model_col:
        raise ValueError("Results file missing combination or model columns")

    filtered = results_df[
        (results_df[combo_col].astype(str) == str(combination_id))
        & (results_df[model_col].astype(str) == str(model_name))
    ]
    if filtered.empty:
        raise ValueError(f"No rows found for combination '{combination_id}' and model '{model_name}'")

    column_lookup = {c.lower(): c for c in results_df.columns}
    return filtered.iloc[0], column_lookup


def _extract_betas(row: pd.Series) -> Dict[str, float]:
    betas: Dict[str, float] = {}
    for col in row.index:
        name = str(col)
        if name.lower().endswith("_beta"):
            value = row[col]
            if pd.notna(value):
                betas[name[: -len("_beta")]] = float(value)
    return betas


def _transformation_metadata(row: pd.Series, lookup: Dict[str, str]) -> Dict[str, Any]:
    column = lookup.get("transformation_metadata")
    if not column:
        return {}
    raw = row[column]
    if pd.isna(raw):
        return {}
    if isinstance(raw, dict):
        return raw
    if isinstance(raw, str):
        try:
            parsed = json.loads(raw)
            return parsed if isinstance(parsed, dict) else {}
        except json.JSONDecodeError:
            logger.warning("Failed to parse transformation_metadata JSON")
    return {}


def _detect_date_column(df: pd.DataFrame) -> Optional[str]:
    column = _detect_column(
        df.columns,
        [
            "date",
            "invoice_date",
            "bill_date",
            "order_date",
            "month",
            "period",
            "year",
            "timestamp",
            "time",
            "week",
        ],
    )
    if column:
        return column

    # As a final fallback, pick any column that contains "date"-like text
    for name in df.columns:
        lower = name.lower()
        if "date" in lower or "period" in lower or "month" in lower or "year" in lower:
            return name
    return None


def _detect_target(results_row: pd.Series, lookup: Dict[str, str], df: pd.DataFrame) -> str:
    # Prefer explicit target from the results row
    for candidate in ["y_variable", "target", "dependent_variable", "dependent", "sales", "volume", "value"]:
        if candidate in lookup:
            value = str(results_row[lookup[candidate]]).strip()
            if value:
                return value.lower()

    # Fallback to common names in the dataset
    for candidate in ["target", "y", "dependent", "sales", "volume", "value"]:
        if candidate in df.columns:
            return candidate

    numeric_cols = df.select_dtypes(include=[np.number]).columns.tolist()
    if not numeric_cols:
        raise ValueError("No numeric columns available to use as target variable")
    return numeric_cols[0]


def _source_file_key(row: pd.Series, lookup: Dict[str, str]) -> str:
    for candidate in ["file_key", "object_name", "csv_name", "source_file_key"]:
        column = lookup.get(candidate)
        if column:
            value = str(row[column]).strip()
            if value:
                return value
    raise ValueError("No source file key found in results row")


def _apply_transform(value: float, metadata: Dict[str, Any]) -> float:
    steps: List[Any] = []
    if isinstance(metadata, dict):
        steps = metadata.get("transformation_steps", []) or []
    elif isinstance(metadata, str):
        try:
            parsed = json.loads(metadata)
            if isinstance(parsed, dict):
                steps = parsed.get("transformation_steps", []) or []
        except json.JSONDecodeError:
            steps = []

    if not steps:
        return value
    try:
        return float(apply_transformation_steps([value], steps)[0])
    except Exception:
        logger.warning("Failed to apply transformation steps", exc_info=True)
        return value


def _build_prediction_series(
    df: pd.DataFrame,
    betas: Dict[str, float],
    intercept: float,
    transformation_metadata: Dict[str, Any],
) -> List[float]:
    predictions: List[float] = []
    has_transformations = bool(transformation_metadata)

    for _, row in df.iterrows():
        pred = intercept
        for variable, beta in betas.items():
            if variable in df.columns:
                value = row[variable]
                if has_transformations and variable in transformation_metadata:
                    value = _apply_transform(value, transformation_metadata[variable])
                if pd.notna(value):
                    pred += beta * float(value)
        predictions.append(float(pred))
    return predictions


def actual_vs_predicted_from_source(
    *,
    results_file_key: str,
    combination_id: str,
    model_name: str,
    bucket: str = MINIO_BUCKET,
) -> Dict[str, Any]:
    """Re-compute the actual vs predicted series using the source dataset."""

    results_df = get_minio_df(bucket, results_file_key)
    if results_df is None or results_df.empty:
        raise ValueError("Results file is empty")
    results_df.columns = results_df.columns.str.lower()

    row, lookup = _extract_row(results_df, combination_id, model_name)
    betas = _extract_betas(row)
    if not betas:
        raise ValueError("No beta coefficients found for the requested model")
    intercept = float(row[lookup.get("intercept", "intercept")] or 0.0)
    transformation_meta = _transformation_metadata(row, lookup)

    source_key = _source_file_key(row, lookup)
    df = get_minio_df(bucket, source_key)
    if df is None or df.empty:
        raise ValueError(f"Source data not found for key '{source_key}'")
    df.columns = df.columns.str.lower()

    target = _detect_target(row, lookup, df)
    if target not in df.columns:
        raise ValueError(f"Target column '{target}' not found in source data")

    date_col = _detect_date_column(df)
    dates: List[Any]
    if date_col:
        df[date_col] = pd.to_datetime(df[date_col], errors="coerce")
        df = df.dropna(subset=[date_col])
        dates = df[date_col].dt.strftime("%Y-%m-%d").tolist()
    else:
        dates = [f"Period {idx + 1}" for idx in range(len(df))]

    predicted = _build_prediction_series(df, betas, intercept, transformation_meta)
    actual = df[target].astype(float).tolist()

    length = min(len(actual), len(predicted))
    actual = actual[:length]
    predicted = predicted[:length]
    dates = dates[:length]

    residuals = [a - p for a, p in zip(actual, predicted)]
    mae = float(np.mean([abs(r) for r in residuals])) if residuals else 0.0
    rmse = float(np.sqrt(np.mean([r ** 2 for r in residuals]))) if residuals else 0.0

    return {
        "success": True,
        "combination_name": combination_id,
        "model_name": model_name,
        "file_key": source_key,
        "dates": dates,
        "actual_values": actual,
        "predicted_values": predicted,
        "rmse": round(rmse, 3),
        "mae": round(mae, 3),
        "performance_metrics": {
            "mae": mae,
            "mse": float(rmse**2),
            "rmse": rmse,
            "r2": 0.0,
            "mape": 0.0,
        },
        "data_points": length,
        "model_info": {
            "intercept": intercept,
            "coefficients": {f"Beta_{k}": v for k, v in betas.items()},
            "x_variables": list(betas.keys()),
            "y_variable": target,
        },
    }


def yoy_growth_from_source(
    *,
    results_file_key: str,
    combination_id: str,
    model_name: str,
    bucket: str = MINIO_BUCKET,
) -> Dict[str, Any]:
    """Compute YoY growth using betas + source data for a single model."""

    results_df = get_minio_df(bucket, results_file_key)
    if results_df is None or results_df.empty:
        raise ValueError("Results file is empty")
    results_df.columns = results_df.columns.str.lower()

    row, lookup = _extract_row(results_df, combination_id, model_name)
    betas = _extract_betas(row)
    if not betas:
        raise ValueError("No beta coefficients found for the requested model")
    intercept = float(row[lookup.get("intercept", "intercept")] or 0.0)
    transformation_meta = _transformation_metadata(row, lookup)

    source_key = _source_file_key(row, lookup)
    df = get_minio_df(bucket, source_key)
    if df is None or df.empty:
        raise ValueError(f"Source data not found for key '{source_key}'")
    df.columns = df.columns.str.lower()

    target = _detect_target(row, lookup, df)
    date_col = _detect_date_column(df)
    if not date_col:
        raise ValueError("Date column is required for YoY calculation")

    df[date_col] = pd.to_datetime(df[date_col], errors="coerce")
    df = df.dropna(subset=[date_col])
    years = sorted(df[date_col].dt.year.unique())
    if len(years) < 2:
        raise ValueError("Need at least two calendar years in the dataset for YoY calculation")

    year_first, year_last = int(years[0]), int(years[-1])
    df_first = df[df[date_col].dt.year == year_first]
    df_last = df[df[date_col].dt.year == year_last]
    if df_first.empty or df_last.empty:
        raise ValueError(f"No data found for year {year_first} or {year_last}")

    y_first = df_first[target].mean() if target in df_first.columns else 0.0
    y_last = df_last[target].mean() if target in df_last.columns else 0.0
    observed_delta = float(y_last - y_first)

    explained_delta = 0.0
    contributions: List[Dict[str, Any]] = []
    has_transformations = bool(transformation_meta)
    for variable, beta in betas.items():
        if variable not in df.columns:
            continue
        first_mean = df_first[variable].mean()
        last_mean = df_last[variable].mean()

        if has_transformations and variable in transformation_meta:
            first_mean = _apply_transform(first_mean, transformation_meta[variable])
            last_mean = _apply_transform(last_mean, transformation_meta[variable])

        delta = float(last_mean - first_mean)
        contribution = float(beta * delta)
        explained_delta += contribution
        contributions.append(
            {
                "variable": variable,
                "beta_coefficient": beta,
                "mean_year1": float(first_mean),
                "mean_year2": float(last_mean),
                "delta_contribution": contribution,
            }
        )

    contributions.sort(key=lambda item: abs(item["delta_contribution"]), reverse=True)
    residual = float(observed_delta - explained_delta)
    yoy_percentage = (observed_delta / y_first * 100.0) if y_first else 0.0

    waterfall_labels = [f"Base {year_first}"] + [c["variable"] for c in contributions] + ["Residual", f"Final {year_last}"]
    waterfall_values = [y_first] + [c["delta_contribution"] for c in contributions] + [residual, y_last]

    return {
        "success": True,
        "combination_name": combination_id,
        "model_name": model_name,
        "file_key": source_key,
        "date_column_used": date_col,
        "years_used": {"year1": year_first, "year2": year_last},
        "y_variable_used": target,
        "observed": {
            "year1_mean": float(y_first),
            "year2_mean": float(y_last),
            "delta_y": observed_delta,
            "yoy_percentage": yoy_percentage,
        },
        "explanation": {
            "explained_delta_yhat": float(explained_delta),
            "residual": residual,
            "contributions": contributions,
        },
        "waterfall": {
            "labels": waterfall_labels,
            "values": waterfall_values,
        },
        "model_info": {
            "intercept": intercept,
            "coefficients": {f"Beta_{k}": v for k, v in betas.items()},
            "x_variables": list(betas.keys()),
            "y_variable": target,
        },
    }


__all__ = [
    "actual_vs_predicted_from_source",
    "yoy_growth_from_source",
]
