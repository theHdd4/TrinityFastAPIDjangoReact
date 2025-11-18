"""Service helpers for the select_models_feature_based feature."""

from __future__ import annotations

import asyncio
import logging
import math
import statistics
import json
from dataclasses import dataclass
from datetime import datetime
from itertools import count
from typing import Any, Dict, Iterable, List, Sequence

import pandas as pd

from minio.error import S3Error
from pydantic import BaseModel, Field

from .database import MINIO_BUCKET, client, get_minio_df, minio_client


logger = logging.getLogger("app.features.select_models_feature_based.service")


class ModelDataUnavailableError(RuntimeError):
    """Raised when model results cannot be loaded for a given request."""


@dataclass(frozen=True)
class ModelSeries:
    dates: Sequence[str]
    actual: Sequence[float]
    predicted: Sequence[float]


@dataclass(frozen=True)
class ModelRecord:
    file_key: str
    combination_id: str
    combination: Dict[str, str]
    model_name: str
    metrics: Dict[str, float | None]
    variable_impacts: Dict[str, float]
    variable_averages: Dict[str, float]
    price_variable: str
    base_price: float
    base_volume: float
    rpi_competitors: Dict[str, float]
    series: ModelSeries

    @property
    def base_revenue(self) -> float:
        return self.base_price * self.base_volume

SAVED_MODELS: Dict[str, Dict[str, Any]] = {}
_saved_counter = count(1)


METRIC_KEYS = [
    "mape_train",
    "mape_test",
    "r2_train",
    "r2_test",
    "aic",
    "bic",
    "self_elasticity",
    "self_beta",
    "self_avg",
    "self_roi",
]


class ModelFilterPayload(BaseModel):
    file_key: str
    variable: str
    method: str | None = "elasticity"
    combination_id: str | None = None
    min_mape: float | None = None
    max_mape: float | None = None
    min_r2: float | None = None
    max_r2: float | None = None
    min_self_elasticity: float | None = None
    max_self_elasticity: float | None = None
    min_mape_train: float | None = None
    max_mape_train: float | None = None
    min_mape_test: float | None = None
    max_mape_test: float | None = None
    min_r2_train: float | None = None
    max_r2_train: float | None = None
    min_r2_test: float | None = None
    max_r2_test: float | None = None
    min_aic: float | None = None
    max_aic: float | None = None
    min_bic: float | None = None
    max_bic: float | None = None
    variable_filters: Dict[str, Dict[str, float]] | None = None


class WeightedEnsemblePayload(BaseModel):
    file_key: str
    grouping_keys: List[str]
    include_numeric: List[str] | None = None
    exclude_numeric: List[str] | None = None
    filter_criteria: Dict[str, Any] | None = None
    filtered_models: List[str] | None = None


class GenericSavePayload(BaseModel):
    file_key: str
    filter_criteria: Dict[str, Any]
    model_name: str
    tags: List[str] = Field(default_factory=list)
    description: str | None = None
    client_name: str
    app_name: str
    project_name: str


class CurveRequestPayload(BaseModel):
    client_name: str
    app_name: str
    project_name: str
    file_key: str
    combination_name: str
    model_name: str


def _normalise_file_key(file_key: str) -> str:
    return file_key.strip().lstrip("/")



def _load_dataframe(file_key: str) -> pd.DataFrame | None:
    normalised = _normalise_file_key(file_key)
    if not normalised:
        return None

    try:
        return get_minio_df(MINIO_BUCKET, normalised)
    except S3Error:
        logger.warning("Failed to fetch %s from MinIO", normalised, exc_info=True)
    except Exception:  # pragma: no cover - defensive catch to keep feature usable
        logger.exception("Unexpected error loading %s from MinIO", normalised)
    return None


async def _fetch_build_config(document_id: str) -> Dict[str, Any] | None:
    if client is None:
        return None
    return await client["trinity_prod"]["build-model_featurebased_configs"].find_one({"_id": document_id})


def _load_build_config(client_name: str, app_name: str, project_name: str) -> Dict[str, Any] | None:
    document_id = f"{client_name}/{app_name}/{project_name}"
    try:
        return asyncio.run(_fetch_build_config(document_id))
    except RuntimeError:
        loop = asyncio.new_event_loop()
        try:
            return loop.run_until_complete(_fetch_build_config(document_id))
        finally:
            loop.close()


def _detect_date_column(frame: pd.DataFrame) -> str | None:
    date_candidates = [
        "Date",
        "date",
        "Invoice_Date",
        "Bill_Date",
        "Order_Date",
        "Month",
        "month",
        "Period",
        "period",
        "Year",
        "year",
    ]
    for candidate in date_candidates:
        if candidate in frame.columns:
            return candidate
    return None


def _detect_combination_column(frame: pd.DataFrame) -> str | None:
    for column in frame.columns:
        col_lower = column.lower()
        if (
            col_lower == "combination_id"
            or col_lower == "combinationid"
            or "combination_id" in col_lower
            or col_lower.endswith("_combination")
            or "combination" in col_lower
        ):
            return column
    return None


def _combination_ids_from_minio(file_key: str) -> List[str] | None:
    frame = _load_dataframe(file_key)
    if frame is None:
        return None

    column = _detect_combination_column(frame)
    if column is None:
        logger.warning(
            "Could not determine combination column for file %s (columns=%s)",
            file_key,
            list(frame.columns[:10]),
        )
        return []

    combinations = {
        str(value).strip()
        for value in frame[column].dropna().astype(str)
        if str(value).strip()
    }
    return sorted(combinations)




def _detect_model_name_column(frame: pd.DataFrame) -> str | None:
    for column in frame.columns:
        col_lower = column.lower()
        if col_lower in {"model_name", "model", "modelname"}:
            return column
        if col_lower.endswith("_model") or col_lower.startswith("model_"):
            return column
        if "model" in col_lower and "name" in col_lower:
            return column
    return None


def _coerce_optional_str(value: Any) -> str | None:
    if value is None:
        return None
    if isinstance(value, str):
        text = value.strip()
        return text or None
    try:
        if pd.isna(value):  # type: ignore[arg-type]
            return None
    except Exception:  # pragma: no cover - defensive
        pass
    text = str(value).strip()
    return text or None


def _coerce_optional_float(value: Any) -> float | None:
    if value is None:
        return None
    if isinstance(value, (int, float)):
        if isinstance(value, float) and math.isnan(value):
            return None
        return float(value)
    if isinstance(value, str):
        text = value.strip()
        if not text:
            return None
        try:
            return float(text)
        except ValueError:
            return None
    return None


def _row_value(row: pd.Series, lookup: Dict[str, str], key: str) -> Any:
    """Return a row value using tolerant column matching.

    The model result exports are not always consistent with their column naming
    (e.g., "base price" vs. "base_price").  We first attempt an exact
    lower-case match and then fall back to a normalised comparison that strips
    underscores and spaces so we can still pick up the correct column when
    these minor naming differences occur.
    """

    column = lookup.get(key.lower())
    if column is None:
        normalised_key = key.lower().replace("_", "").replace(" ", "")
        for candidate_lower, column_name in lookup.items():
            candidate_normalised = candidate_lower.replace("_", "").replace(" ", "")
            if candidate_normalised == normalised_key:
                column = column_name
                break
    if column is None:
        return None
    return row.get(column)


def _parse_mapping(value: Any) -> Dict[str, float]:
    result: Dict[str, float] = {}
    if isinstance(value, dict):
        for key, raw in value.items():
            if key is None:
                continue
            number = _coerce_optional_float(raw)
            if number is None:
                continue
            key_text = _coerce_optional_str(key)
            if key_text:
                result[key_text] = number
        return result
    if isinstance(value, str):
        text = value.strip()
        if not text:
            return result
        try:
            parsed = json.loads(text)
        except json.JSONDecodeError:
            parsed = None
        if isinstance(parsed, dict):
            return _parse_mapping(parsed)
        for part in text.split(","):
            if ":" not in part:
                continue
            key, raw = part.split(":", 1)
            number = _coerce_optional_float(raw)
            key_text = _coerce_optional_str(key)
            if key_text and number is not None:
                result[key_text] = number
    return result


def _parse_float_sequence(value: Any) -> List[float]:
    if isinstance(value, (list, tuple)):
        return [num for num in (_coerce_optional_float(item) for item in value) if num is not None]
    if isinstance(value, str):
        text = value.strip()
        if not text:
            return []
        try:
            parsed = json.loads(text)
        except json.JSONDecodeError:
            parsed = None
        if isinstance(parsed, (list, tuple)):
            return _parse_float_sequence(list(parsed))
        parts = [part.strip() for part in text.split(",") if part.strip()]
        return [num for num in (_coerce_optional_float(part) for part in parts) if num is not None]
    return []


def _parse_str_sequence(value: Any) -> List[str]:
    if isinstance(value, (list, tuple)):
        return [text for text in (_coerce_optional_str(item) for item in value) if text]
    if isinstance(value, str):
        text = value.strip()
        if not text:
            return []
        try:
            parsed = json.loads(text)
        except json.JSONDecodeError:
            parsed = None
        if isinstance(parsed, (list, tuple)):
            return _parse_str_sequence(list(parsed))
        parts = [part.strip() for part in text.split(",") if part.strip()]
        return [part for part in parts if part]
    return []


def _row_variable_impacts(row: pd.Series, ignore: set[str], column_lookup: Dict[str, str]) -> Dict[str, float]:
    impacts = _parse_mapping(_row_value(row, column_lookup, "variable_impacts"))
    for column in row.index:
        column_name = str(column)
        col_lower = column_name.lower()
        if col_lower in ignore:
            continue
        if col_lower in METRIC_KEYS:
            continue
        if col_lower.startswith("variable_"):
            continue
        if col_lower.endswith("_values") or col_lower.endswith("_series"):
            continue
        if col_lower.endswith("_elasticity"):
            variable = column_name[: -len("_elasticity")]
        elif col_lower.startswith("elasticity_"):
            variable = column_name[len("elasticity_"):]
        elif col_lower.endswith("_impact"):
            variable = column_name[: -len("_impact")]
        elif col_lower.startswith("impact_"):
            variable = column_name[len("impact_"):]
        elif col_lower.endswith("_beta") and not col_lower.startswith("self_"):
            variable = column_name[: -len("_beta")]
        else:
            continue
        variable = variable.strip()
        if not variable:
            continue
        value = _coerce_optional_float(row[column])
        if value is None:
            continue
        impacts[variable] = value
    return impacts


def _row_variable_averages(row: pd.Series, ignore: set[str], column_lookup: Dict[str, str]) -> Dict[str, float]:
    averages = _parse_mapping(_row_value(row, column_lookup, "variable_averages"))
    for column in row.index:
        column_name = str(column)
        col_lower = column_name.lower()
        if col_lower in ignore:
            continue
        if col_lower.startswith("variable_"):
            continue
        if col_lower.endswith("_average"):
            variable = column_name[: -len("_average")]
        elif col_lower.endswith("_avg"):
            variable = column_name[: -len("_avg")]
        elif col_lower.startswith("avg_"):
            variable = column_name[len("avg_"):]
        else:
            continue
        variable = variable.strip()
        if not variable:
            continue
        value = _coerce_optional_float(row[column])
        if value is None:
            continue
        averages[variable] = value
    return averages


def _row_rpi_competitors(row: pd.Series, column_lookup: Dict[str, str]) -> Dict[str, float]:
    competitors = _parse_mapping(_row_value(row, column_lookup, "rpi_competitors"))
    for column in row.index:
        column_name = str(column)
        col_lower = column_name.lower()
        if not col_lower.startswith("rpi_"):
            continue
        competitor = column_name[len("rpi_"):]
        if not competitor:
            continue
        value = _coerce_optional_float(row[column])
        if value is None:
            continue
        competitors[competitor] = value
    return competitors


def _row_combination_metadata(
    row: pd.Series,
    combination_column: str,
    model_column: str,
    string_like_columns: set[str],
) -> Dict[str, str]:
    metadata: Dict[str, str] = {}
    combo_value = _coerce_optional_str(row.get(combination_column))
    if combo_value:
        metadata[combination_column] = combo_value
    for column in string_like_columns:
        if column in {combination_column, model_column}:
            continue
        col_lower = column.lower()
        if col_lower in METRIC_KEYS:
            continue
        if col_lower.startswith("variable_"):
            continue
        if col_lower.startswith("rpi_"):
            continue
        if col_lower.endswith("_values") or col_lower.endswith("_series"):
            continue
        value = _coerce_optional_str(row.get(column))
        if not value:
            continue
        metadata[column] = value
    return metadata


def _build_series_from_row(row: pd.Series, column_lookup: Dict[str, str]) -> ModelSeries:
    actual = _parse_float_sequence(_row_value(row, column_lookup, "actual_values"))
    if not actual:
        actual = _parse_float_sequence(_row_value(row, column_lookup, "actual"))
    predicted = _parse_float_sequence(_row_value(row, column_lookup, "predicted_values"))
    if not predicted:
        predicted = _parse_float_sequence(_row_value(row, column_lookup, "predicted"))
    dates = _parse_str_sequence(_row_value(row, column_lookup, "dates"))
    if not dates:
        dates = _parse_str_sequence(_row_value(row, column_lookup, "periods"))
    length = min(len(actual), len(predicted))
    if length == 0:
        return ModelSeries(dates=[], actual=[], predicted=[])
    actual = actual[:length]
    predicted = predicted[:length]
    if dates:
        dates = dates[:length]
    else:
        dates = [f"Period {index + 1}" for index in range(length)]
    return ModelSeries(dates=dates, actual=actual, predicted=predicted)


def _models_for_file(file_key: str, combination_id: str | None = None) -> List[ModelRecord]:
    frame = _load_dataframe(file_key)
    if frame is None or frame.empty:
        raise ModelDataUnavailableError(f"Model data not available for file '{file_key}'")

    combination_column = _detect_combination_column(frame)
    if combination_column is None:
        raise ModelDataUnavailableError(
            f"Unable to determine combination column for file '{file_key}'"
        )

    model_column = _detect_model_name_column(frame)
    if model_column is None:
        raise ModelDataUnavailableError(
            f"Unable to determine model column for file '{file_key}'"
        )

    ignore_columns = {
        combination_column.lower(),
        model_column.lower(),
        "file_key",
        "object_name",
        "csv_name",
        "price_variable",
        "base_price",
        "base_volume",
    }
    ignore_columns.update(METRIC_KEYS)

    string_like_columns = {
        column
        for column in frame.columns
        if pd.api.types.is_string_dtype(frame[column])
    }
    column_lookup = {column.lower(): column for column in frame.columns}

    normalised_key = _normalise_file_key(file_key)
    records: List[ModelRecord] = []

    for _, row in frame.iterrows():
        combo_value = _coerce_optional_str(row.get(combination_column))
        if not combo_value:
            continue
        if combination_id and combination_id != "all" and combo_value != combination_id:
            continue

        model_name = _coerce_optional_str(row.get(model_column)) or f"model-{len(records) + 1}"
        metrics = {
            key: _coerce_optional_float(_row_value(row, column_lookup, key))
            for key in METRIC_KEYS
        }
        impacts = _row_variable_impacts(row, ignore_columns, column_lookup)
        averages = _row_variable_averages(row, ignore_columns, column_lookup)
        competitors = _row_rpi_competitors(row, column_lookup)
        combination_meta = _row_combination_metadata(
            row,
            combination_column,
            model_column,
            string_like_columns,
        )

        price_variable = _coerce_optional_str(_row_value(row, column_lookup, "price_variable"))
        if not price_variable:
            price_variable = next((name for name in impacts if "price" in name.lower()), "price")

        base_price = _coerce_optional_float(_row_value(row, column_lookup, "base_price")) or 0.0
        base_volume = _coerce_optional_float(_row_value(row, column_lookup, "base_volume")) or 0.0
        series = _build_series_from_row(row, column_lookup)

        records.append(
            ModelRecord(
                file_key=normalised_key,
                combination_id=combo_value,
                combination=combination_meta,
                model_name=model_name,
                metrics=metrics,
                variable_impacts=impacts,
                variable_averages=averages,
                price_variable=price_variable,
                base_price=base_price,
                base_volume=base_volume,
                rpi_competitors=competitors,
                series=series,
            )
        )

    if not records:
        message = f"Model data not available for file '{file_key}'"
        if combination_id and combination_id != "all":
            message += f" and combination '{combination_id}'"
        raise ModelDataUnavailableError(message)

    return records


def _normalise_prefix(prefix: str) -> str:
    cleaned = prefix.strip()
    if not cleaned:
        return ""
    return cleaned.lstrip("/")


def list_model_results_files(
    client_name: str,
    app_name: str,
    project_name: str,
    prefix: str = "model-results/",
    limit: int = 100,
) -> Dict[str, Any]:
    """Return Arrow model result files for the provided project.

    The previous deterministic implementation surfaced a static parquet file which
    caused the Select Models UI to point at an unrelated dataset.  We now mirror the
    legacy router by asking MinIO for files that live within the project's
    ``model-results`` directory and only return Arrow artefacts that represent model
    outputs.
    """

    if not client_name or not app_name or not project_name:
        raise ValueError("Client, app, and project names are required to list model results")

    cleaned_prefix = _normalise_prefix(prefix or "")
    project_prefix = "/".join(part.strip("/") for part in (client_name, app_name, project_name))
    base_prefix = f"{project_prefix}/"
    full_prefix = f"{base_prefix}{cleaned_prefix}" if cleaned_prefix else base_prefix

    try:
        objects = minio_client.list_objects(
            MINIO_BUCKET,
            prefix=full_prefix,
            recursive=True,
        )
    except S3Error as exc:
        logger.exception(
            "select_models_feature_based.minio_list_failed bucket=%s prefix=%s", MINIO_BUCKET, full_prefix
        )
        raise ValueError(f"Unable to list model results for prefix '{full_prefix}': {exc}") from exc

    files: List[Dict[str, Any]] = []
    for obj in objects:
        if len(files) >= limit:
            break
        if getattr(obj, "is_dir", False):
            continue
        object_name = getattr(obj, "object_name", "")
        if not object_name.lower().endswith(".arrow"):
            continue
        files.append(
            {
                "object_name": object_name,
                "csv_name": object_name,
                "file_size": getattr(obj, "size", None),
                "last_modified": (
                    obj.last_modified.isoformat() if getattr(obj, "last_modified", None) else None
                ),
            }
        )

    return {
        "total_files": len(files),
        "files": files,
        "bucket": MINIO_BUCKET,
        "prefix": full_prefix,
    }


def list_combination_ids(file_key: str) -> Dict[str, Any]:
    note: str | None = None
    combo_ids = _combination_ids_from_minio(file_key)
    if combo_ids is None:
        try:
            models = _models_for_file(file_key)
        except ModelDataUnavailableError as exc:
            combo_ids = []
            note = str(exc)
        else:
            combo_ids = sorted({record.combination_id for record in models})
    return {
        "file_key": file_key,
        "unique_combination_ids": combo_ids,
        "total_combinations": len(combo_ids),
        "note": note,
    }


def list_variables(file_key: str, mode: str | None = None) -> Dict[str, Any]:
    try:
        models = _models_for_file(file_key)
    except ModelDataUnavailableError as exc:
        return {
            "file_key": file_key,
            "variables": [],
            "total_variables": 0,
            "note": str(exc),
        }
    variables = sorted({var for record in models for var in record.variable_impacts})
    if mode == "base":
        variables = [var for var in variables if not var.endswith("_beta")]
    return {
        "file_key": file_key,
        "variables": variables,
        "total_variables": len(variables),
        "note": None,
    }


def _collect_metric_values(models: Iterable[ModelRecord], key: str) -> List[float]:
    values = [record.metrics.get(key) for record in models]
    return [value for value in values if value is not None]


def get_filter_options(file_key: str, combination_id: str | None, variable: str) -> Dict[str, Any]:
    try:
        models = _models_for_file(file_key, combination_id)
    except ModelDataUnavailableError as exc:
        return {
            "file_key": file_key,
            "combination_id": combination_id,
            "variable": variable,
            "available_filters": {},
            "note": str(exc),
        }
    available_filters: Dict[str, Dict[str, float]] = {}

    metric_keys = [
        "self_elasticity",
        "mape_train",
        "mape_test",
        "r2_train",
        "r2_test",
        "aic",
        "bic",
    ]
    for key in metric_keys:
        values = _collect_metric_values(models, key)
        if not values:
            continue
        available_filters[key] = {
            "min": min(values),
            "max": max(values),
            "current_min": min(values),
            "current_max": max(values),
        }

    variable_values = [
        record.variable_impacts.get(variable)
        for record in models
        if variable in record.variable_impacts
    ]
    if variable_values:
        available_filters[f"variable_{variable}"] = {
            "min": min(variable_values),
            "max": max(variable_values),
            "current_min": min(variable_values),
            "current_max": max(variable_values),
        }

    return {
        "file_key": file_key,
        "combination_id": combination_id,
        "variable": variable,
        "available_filters": available_filters,
        "note": None,
    }


def _within_range(value: float | None, minimum: float | None, maximum: float | None) -> bool:
    if value is None:
        return True
    if minimum is not None and value < minimum:
        return False
    if maximum is not None and value > maximum:
        return False
    return True


def filter_models(payload: Dict[str, Any]) -> List[Dict[str, Any]]:
    request = ModelFilterPayload(**payload)
    models = _models_for_file(request.file_key, request.combination_id)

    results: List[Dict[str, Any]] = []
    for record in models:
        if request.variable not in record.variable_impacts:
            continue
        metrics = record.metrics
        if not all(
            [
                _within_range(metrics.get("mape_train"), request.min_mape_train, request.max_mape_train),
                _within_range(metrics.get("mape_test"), request.min_mape_test, request.max_mape_test),
                _within_range(metrics.get("mape_test"), request.min_mape, request.max_mape),
                _within_range(metrics.get("r2_train"), request.min_r2_train, request.max_r2_train),
                _within_range(metrics.get("r2_test"), request.min_r2_test, request.max_r2_test),
                _within_range(metrics.get("r2_test"), request.min_r2, request.max_r2),
                _within_range(metrics.get("self_elasticity"), request.min_self_elasticity, request.max_self_elasticity),
                _within_range(metrics.get("aic"), request.min_aic, request.max_aic),
                _within_range(metrics.get("bic"), request.min_bic, request.max_bic),
            ]
        ):
            continue

        if request.variable_filters:
            keep = True
            for variable, bounds in request.variable_filters.items():
                value = record.variable_impacts.get(variable)
                if not _within_range(value, bounds.get("min"), bounds.get("max")):
                    keep = False
                    break
            if not keep:
                continue

        impact = record.variable_impacts[request.variable]
        results.append(
            {
                "model_name": record.model_name,
                "self_elasticity": impact,
                "self_beta": metrics.get("self_beta"),
                "self_avg": metrics.get("self_avg"),
                "self_roi": metrics.get("self_roi"),
                "combination_id": record.combination_id,
            }
        )

    results.sort(key=lambda item: item.get("self_elasticity", 0), reverse=True)
    return results


def filter_models_with_existing(payload: Dict[str, Any]) -> Dict[str, Any]:
    results = filter_models(payload)
    return {"results": results, "total": len(results)}


def get_variable_ranges(file_key: str, combination_id: str | None, variables: Iterable[str]) -> Dict[str, Any]:
    try:
        models = _models_for_file(file_key, combination_id)
    except ModelDataUnavailableError as exc:
        return {
            "file_key": file_key,
            "combination_id": combination_id,
            "variable_ranges": {},
            "note": str(exc),
        }
    ranges: Dict[str, Dict[str, float]] = {}

    for variable in variables:
        values = [
            record.variable_impacts.get(variable)
            for record in models
            if variable in record.variable_impacts
        ]
        if not values:
            continue
        ranges[variable] = {
            "min": min(values),
            "max": max(values),
            "current_min": min(values),
            "current_max": max(values),
        }

    return {
        "file_key": file_key,
        "combination_id": combination_id,
        "variable_ranges": ranges,
        "note": None,
    }


def get_saved_combinations_status(file_key: str, atom_id: str) -> Dict[str, Any]:
    combos_from_file = _combination_ids_from_minio(file_key)
    note: str | None
    if combos_from_file is None:
        try:
            models = _models_for_file(file_key)
        except ModelDataUnavailableError as exc:
            combos = []
            note = str(exc)
        else:
            combos = sorted({record.combination_id for record in models})
            note = "Derived from available model rows"
    else:
        combos = combos_from_file
        note = "Computed from MinIO model results"
    normalised_key = _normalise_file_key(file_key)
    saved_for_file = [
        details
        for details in SAVED_MODELS.values()
        if details["file_key"] == normalised_key
    ]
    saved_combo_ids = {entry["combination_id"] for entry in saved_for_file}
    pending = [combo for combo in combos if combo not in saved_combo_ids]
    completion = (len(saved_combo_ids) / len(combos)) * 100 if combos else 0.0

    return {
        "file_key": file_key,
        "atom_id": atom_id,
        "total_combinations": len(combos),
        "saved_combinations": sorted(saved_combo_ids),
        "pending_combinations": pending,
        "saved_count": len(saved_combo_ids),
        "pending_count": len(pending),
        "completion_percentage": round(completion, 2),
        "note": note,
    }


def save_model(payload: Dict[str, Any]) -> Dict[str, Any]:
    request = GenericSavePayload(**payload)
    combination_id = request.filter_criteria.get("combination_id")
    try:
        models = _models_for_file(request.file_key, combination_id)
    except ModelDataUnavailableError as exc:
        raise ValueError(str(exc)) from exc
    try:
        record = next(
            model
            for model in models
            if model.model_name == request.model_name
        )
    except StopIteration as exc:  # pragma: no cover - defensive
        raise ValueError("Model not found for the provided criteria") from exc

    model_id = f"saved-{next(_saved_counter):05d}"
    saved_entry = {
        "model_id": model_id,
        "model_name": record.model_name,
        "combination_id": record.combination_id,
        "file_key": _normalise_file_key(request.file_key),
        "saved_at": datetime.utcnow().isoformat() + "Z",
        "filter_criteria": request.filter_criteria,
        "description": request.description,
        "tags": list(request.tags or []),
        "row_data": {
            "combination": record.combination,
            "metrics": record.metrics,
            "variables": record.variable_impacts,
        },
    }
    SAVED_MODELS[model_id] = saved_entry

    return {
        "model_id": model_id,
        "saved_at": saved_entry["saved_at"],
        "status": "saved",
        "row_data": saved_entry["row_data"],
    }


def _build_contributions(record: ModelRecord) -> List[Dict[str, Any]]:
    contributions: List[Dict[str, Any]] = []
    totals = [
        abs(value * record.variable_averages.get(variable, 1.0))
        for variable, value in record.variable_impacts.items()
    ]
    total_contribution = sum(totals) or 1.0

    for variable, impact in record.variable_impacts.items():
        avg_value = record.variable_averages.get(variable, 1.0)
        contribution_value = impact * avg_value
        relative = contribution_value / total_contribution
        contributions.append(
            {
                "variable_name": variable,
                "beta_coefficient": impact,
                "average_value": avg_value,
                "contribution_value": contribution_value,
                "relative_contribution": relative,
                "percentage_contribution": round(relative * 100, 2),
            }
        )
    return contributions


def get_model_contribution(file_key: str, combination_id: str, model_name: str) -> Dict[str, Any]:
    models = _models_for_file(file_key, combination_id)
    record = next((model for model in models if model.model_name == model_name), None)
    if record is None:
        raise ValueError("Requested model not found")

    contributions = _build_contributions(record)
    contributions.sort(key=lambda item: item["percentage_contribution"], reverse=True)
    total_contribution = sum(item["contribution_value"] for item in contributions)
    summary = {
        "total_variables": len(contributions),
        "sum_of_contributions": total_contribution,
        "top_5_contributors": [
            {
                "variable": item["variable_name"],
                "percentage": item["percentage_contribution"],
            }
            for item in contributions[:5]
        ],
        "positive_contributors": sum(1 for item in contributions if item["contribution_value"] >= 0),
        "negative_contributors": sum(1 for item in contributions if item["contribution_value"] < 0),
        "performance_summary": {
            "has_mape_train": True,
            "has_mape_test": True,
            "has_r2_train": True,
            "has_r2_test": True,
            "has_actual_vs_predicted": True,
        },
        "y_variable_detected": "Sales",
        "x_variables_used": list(record.variable_impacts.keys()),
    }

    return {
        "file_key": file_key,
        "combination_id": combination_id,
        "model_name": model_name,
        "model_performance": {
            "mape_train": record.metrics.get("mape_train"),
            "mape_test": record.metrics.get("mape_test"),
            "r2_train": record.metrics.get("r2_train"),
            "r2_test": record.metrics.get("r2_test"),
        },
        "total_contribution": total_contribution,
        "contribution_data": contributions,
        "summary": summary,
    }


def get_model_performance(file_key: str, combination_id: str, model_name: str) -> Dict[str, Any]:
    models = _models_for_file(file_key, combination_id)
    record = next((model for model in models if model.model_name == model_name), None)
    if record is None:
        raise ValueError("Requested model not found")

    metrics = record.metrics
    return {
        "file_key": file_key,
        "combination_id": combination_id,
        "model_name": model_name,
        "performance_metrics": [
            {"label": "MAPE Train", "value": metrics.get("mape_train"), "unit": "%"},
            {"label": "MAPE Test", "value": metrics.get("mape_test"), "unit": "%"},
            {"label": "R2 Train", "value": metrics.get("r2_train"), "unit": ""},
            {"label": "R2 Test", "value": metrics.get("r2_test"), "unit": ""},
            {"label": "AIC", "value": metrics.get("aic"), "unit": ""},
            {"label": "BIC", "value": metrics.get("bic"), "unit": ""},
        ],
    }


def _actual_vs_predicted_payload(record: ModelRecord) -> Dict[str, Any]:
    metrics = _compute_performance_metrics(record.series.actual, record.series.predicted)

    return {
        "success": True,
        "actual_values": list(record.series.actual),
        "predicted_values": list(record.series.predicted),
        "dates": list(record.series.dates),
        "rmse": metrics["rmse"],
        "mae": metrics["mae"],
        "performance_metrics": metrics,
    }


def _compute_performance_metrics(actual: Sequence[float], predicted: Sequence[float]) -> Dict[str, float]:
    pairs = list(zip(actual, predicted))
    if not pairs:
        return {"mae": 0.0, "mse": 0.0, "rmse": 0.0, "r2": 0.0, "mape": 0.0}

    absolute_errors = [abs(a - p) for a, p in pairs]
    squared_errors = [(a - p) ** 2 for a, p in pairs]
    mae = statistics.fmean(absolute_errors)
    mse = statistics.fmean(squared_errors)
    rmse = math.sqrt(mse)

    actual_mean = statistics.fmean(actual) if actual else 0.0
    ss_tot = sum((a - actual_mean) ** 2 for a in actual)
    ss_res = sum(squared_errors)
    r2 = 1 - (ss_res / ss_tot) if ss_tot else 0.0

    mape_values = [abs((a - p) / a) * 100 for a, p in pairs if a]
    mape = statistics.fmean(mape_values) if mape_values else 0.0

    return {
        "mae": round(mae, 3),
        "mse": round(mse, 3),
        "rmse": round(rmse, 3),
        "r2": round(r2, 3),
        "mape": round(mape, 3),
    }


def calculate_actual_vs_predicted(payload: Dict[str, Any]) -> Dict[str, Any]:
    request = CurveRequestPayload(**payload)
    try:
        models = _models_for_file(request.file_key, request.combination_name)
        record = next((model for model in models if model.model_name == request.model_name), None)
        if record is None:
            raise ValueError("Requested model not found")
        if not record.series.actual or not record.series.predicted:
            raise ModelDataUnavailableError(
                f"Actual vs predicted series unavailable for model '{request.model_name}'"
            )
        return _actual_vs_predicted_payload(record)
    except Exception:
        return _calculate_curves_from_coefficients(request)


def _compute_year_over_year(series: Sequence[float]) -> List[float]:
    yoy: List[float] = []
    length = min(len(series), 12)
    for index in range(length):
        previous = series[index - 1] if index > 0 else series[index]
        current = series[index]
        change = ((current - previous) / previous) * 100 if previous else 0
        yoy.append(round(change, 3))
    return yoy


def _calculate_curves_from_coefficients(request: CurveRequestPayload) -> Dict[str, Any]:
    build_config = _load_build_config(request.client_name, request.app_name, request.project_name)
    if not build_config:
        raise ModelDataUnavailableError("Model configuration not available")

    model_coefficients = build_config.get("model_coefficients", {})
    combination_coefficients = model_coefficients.get(request.combination_name, {})
    model_coeffs = combination_coefficients.get(request.model_name, {})
    if not model_coeffs:
        raise ModelDataUnavailableError("Model coefficients unavailable for requested model")

    combination_file_keys = build_config.get("combination_file_keys", [])
    resolved_file_key = _normalise_file_key(request.file_key)
    for combo_info in combination_file_keys:
        if combo_info.get("combination") == request.combination_name and combo_info.get("file_key"):
            resolved_file_key = _normalise_file_key(str(combo_info.get("file_key")))
            break

    try:
        frame = get_minio_df(MINIO_BUCKET, resolved_file_key)
    except Exception as exc:  # pragma: no cover - defensive catch around I/O
        raise ModelDataUnavailableError(f"Unable to load source data: {exc}") from exc

    intercept = model_coeffs.get("intercept", 0.0)
    coefficients = model_coeffs.get("coefficients", {})
    x_variables = model_coeffs.get("x_variables", []) or []
    y_variable = model_coeffs.get("y_variable", "")

    if not y_variable or y_variable not in frame.columns:
        raise ModelDataUnavailableError("Target variable missing from source data")

    date_column = _detect_date_column(frame)
    dates: List[str] = []
    if date_column:
        frame[date_column] = pd.to_datetime(frame[date_column], errors="coerce")
        frame = frame.dropna(subset=[date_column])
        dates = [value.isoformat() for value in frame[date_column]]

    actual_values = frame[y_variable].tolist()
    predicted_values: List[float] = []

    for _, row in frame.iterrows():
        predicted_value = intercept
        for x_var in x_variables:
            beta_key = f"Beta_{x_var}"
            if beta_key in coefficients and x_var in frame.columns:
                beta_value = coefficients[beta_key]
                x_value = row[x_var]
                try:
                    predicted_value += beta_value * x_value
                except Exception:
                    continue
        predicted_values.append(predicted_value)

    metrics = _compute_performance_metrics(actual_values, predicted_values)
    return {
        "success": True,
        "actual_values": actual_values,
        "predicted_values": predicted_values,
        "dates": dates or [f"Period {index + 1}" for index in range(len(actual_values))],
        "rmse": metrics["rmse"],
        "mae": metrics["mae"],
        "performance_metrics": metrics,
    }


def calculate_yoy(payload: Dict[str, Any]) -> Dict[str, Any]:
    request = CurveRequestPayload(**payload)
    try:
        models = _models_for_file(request.file_key, request.combination_name)
        record = next((model for model in models if model.model_name == request.model_name), None)
        if record is None:
            raise ValueError("Requested model not found")
        if not record.series.actual or not record.series.predicted:
            raise ModelDataUnavailableError(
                f"Series data unavailable for model '{request.model_name}'"
            )

        actual_series = record.series.actual
        predicted_series = record.series.predicted
        dates = list(record.series.dates)
    except Exception:
        fallback = _calculate_curves_from_coefficients(request)
        actual_series = fallback["actual_values"]
        predicted_series = fallback["predicted_values"]
        dates = fallback.get("dates", [])

    if not actual_series or not predicted_series:
        raise ModelDataUnavailableError(
            f"Series data unavailable for model '{request.model_name}'"
        )

    actual_yoy = _compute_year_over_year(actual_series)
    predicted_yoy = _compute_year_over_year(predicted_series)

    if not dates or len(dates) < len(actual_yoy):
        dates = dates[:len(actual_yoy)] if dates else [f"Period {index + 1}" for index in range(len(actual_yoy))]

    return {
        "success": True,
        "dates": dates,
        "actual": actual_yoy,
        "predicted": predicted_yoy,
    }


def _ensemble_models(file_key: str, combination_id: str) -> List[ModelRecord]:
    return _models_for_file(file_key, combination_id)


def get_ensemble_actual_vs_predicted(file_key: str, combination_id: str) -> Dict[str, Any]:
    models = _ensemble_models(file_key, combination_id)
    if not models:
        raise ValueError("No models available for ensemble")

    predicted = [
        statistics.fmean(values)
        for values in zip(*(model.series.predicted for model in models))
    ]
    actual = list(models[0].series.actual)
    dates = list(models[0].series.dates)
    residuals = [a - p for a, p in zip(actual, predicted)]
    metrics = _compute_performance_metrics(actual, predicted)

    return {
        "success": True,
        "actual_values": actual,
        "predicted_values": predicted,
        "dates": dates,
        "rmse": metrics["rmse"],
        "mae": metrics["mae"],
        "performance_metrics": metrics,
        "models_used": [model.model_name for model in models],
    }


def get_ensemble_contribution(file_key: str, combination_id: str) -> Dict[str, Any]:
    models = _ensemble_models(file_key, combination_id)
    if not models:
        raise ValueError("No models available for ensemble")

    aggregated: Dict[str, List[float]] = {}
    for model in models:
        for item in _build_contributions(model):
            aggregated.setdefault(item["variable_name"], []).append(item["percentage_contribution"])

    contributions = [
        {
            "variable_name": variable,
            "percentage_contribution": round(statistics.fmean(values), 2),
        }
        for variable, values in aggregated.items()
    ]
    contributions.sort(key=lambda item: item["percentage_contribution"], reverse=True)
    return {
        "success": True,
        "contribution_data": contributions,
        "models_used": [model.model_name for model in models],
    }


def get_ensemble_yoy(file_key: str, combination_id: str) -> Dict[str, Any]:
    models = _ensemble_models(file_key, combination_id)
    if not models:
        raise ValueError("No models available for ensemble")

    actual = _compute_year_over_year(models[0].series.actual)
    predicted = _compute_year_over_year([
        statistics.fmean(values)
        for values in zip(*(model.series.predicted for model in models))
    ])

    return {
        "success": True,
        "dates": list(models[0].series.dates),
        "actual": actual,
        "predicted": predicted,
        "models_used": [model.model_name for model in models],
    }


def calculate_weighted_ensemble(payload: Dict[str, Any]) -> Dict[str, Any]:
    request = WeightedEnsemblePayload(**payload)
    combination_id = None
    if request.filter_criteria:
        combination_id = request.filter_criteria.get("combination_id")

    models = _models_for_file(request.file_key, combination_id)
    if request.filtered_models:
        models = [
            model
            for model in models
            if model.model_name in set(request.filtered_models)
        ]
    if not models:
        raise ValueError("No models available for weighting")

    weights = []
    for model in models:
        mape = model.metrics.get("mape_test") or 0.1
        weights.append((model, 1 / max(mape, 0.01)))

    weight_sum = sum(weight for _, weight in weights)
    combos: List[Dict[str, Any]] = []
    for model, weight in weights:
        share = weight / weight_sum
        combos.append(
            {
                "combo": model.combination,
                "models_used": 1,
                "best_model": model.model_name,
                "best_mape": model.metrics.get("mape_test"),
                "weight_concentration": round(share, 4),
                "model_composition": {model.model_name: round(share, 4)},
                "weighted": {
                    "mape_test": model.metrics.get("mape_test"),
                    "r2_test": model.metrics.get("r2_test"),
                },
                "aliases": {
                    "elasticity": model.metrics.get("self_elasticity"),
                    "roi": model.metrics.get("self_roi"),
                },
                "y_pred_at_mean": statistics.fmean(model.series.predicted),
            }
        )

    return {
        "grouping_keys": request.grouping_keys,
        "total_combos": len(combos),
        "results": combos,
    }


def _curve_analysis(
    media_values: Sequence[float],
    total_volumes: Sequence[float],
    percent_changes: Sequence[float],
) -> Dict[str, Any]:
    if not media_values or not total_volumes:
        return {}

    def _point(index: int) -> Dict[str, float | None]:
        return {
            "media_value": round(float(media_values[index]), 4),
            "volume_prediction": round(float(total_volumes[index]), 4),
            "percent_change": round(float(percent_changes[index]), 4)
            if index < len(percent_changes)
            else None,
        }

    max_index = max(range(len(total_volumes)), key=lambda idx: total_volumes[idx])
    min_index = min(range(len(total_volumes)), key=lambda idx: total_volumes[idx])
    base_index = min(
        range(len(percent_changes)),
        key=lambda idx: abs(percent_changes[idx]),
    )

    analysis: Dict[str, Any] = {
        "max_point": _point(max_index),
        "min_point": _point(min_index),
    }
    analysis["base_point"] = _point(base_index)
    return analysis


def _resolve_base_values(
    record: ModelRecord, request: CurveRequestPayload
) -> tuple[float, float]:
    """Fill in missing base price/volume values using available metadata."""

    base_price = record.base_price
    base_volume = record.base_volume

    if base_price <= 0:
        avg_price = record.variable_averages.get(record.price_variable)
        if avg_price and avg_price > 0:
            base_price = float(avg_price)

    if base_volume <= 0:
        self_avg = record.metrics.get("self_avg")
        if self_avg and self_avg > 0:
            base_volume = float(self_avg)

    if base_volume <= 0 and record.series.actual:
        valid_actual = [value for value in record.series.actual if value is not None]
        if valid_actual:
            base_volume = float(statistics.mean(valid_actual))

    if base_volume <= 0 and record.series.predicted:
        valid_predicted = [value for value in record.series.predicted if value is not None]
        if valid_predicted:
            base_volume = float(statistics.mean(valid_predicted))

    if base_price > 0 and base_volume > 0:
        return base_price, base_volume

    build_config = _load_build_config(
        request.client_name, request.app_name, request.project_name
    )
    if build_config:
        resolved_file_key = _normalise_file_key(request.file_key)
        for combo_info in build_config.get("combination_file_keys", []):
            if (
                combo_info.get("combination") == request.combination_name
                and combo_info.get("file_key")
            ):
                resolved_file_key = _normalise_file_key(str(combo_info.get("file_key")))
                break

        try:
            frame = get_minio_df(MINIO_BUCKET, resolved_file_key)

            if base_price <= 0 and record.price_variable in frame.columns:
                price_series = pd.to_numeric(
                    frame[record.price_variable], errors="coerce"
                ).dropna()
                if not price_series.empty:
                    base_price = float(price_series.mean())

            combination_models = build_config.get("model_coefficients", {}).get(
                request.combination_name, {}
            )
            model_coeffs = (
                combination_models.get(request.model_name, {})
                if isinstance(combination_models, dict)
                else {}
            )
            y_variable = (
                model_coeffs.get("y_variable")
                if isinstance(model_coeffs, dict)
                else None
            )

            if base_volume <= 0 and y_variable and y_variable in frame.columns:
                volume_series = pd.to_numeric(frame[y_variable], errors="coerce").dropna()
                if not volume_series.empty:
                    base_volume = float(volume_series.mean())

        except Exception:
            logger.exception(
                "Failed to derive base values from build config for %s", resolved_file_key
            )

    return base_price, base_volume


def _price_curve_series(
    record: ModelRecord,
    *,
    base_price: float | None = None,
    base_volume: float | None = None,
) -> Dict[str, Any]:
    percent_steps = [-50, -25, -10, 0, 10, 25, 50]
    elasticity = record.metrics.get("self_elasticity") or -1.0

    resolved_price = base_price if base_price is not None else record.base_price
    resolved_volume = base_volume if base_volume is not None else record.base_volume

    media_values: List[float] = []
    total_volumes: List[float] = []
    percent_changes: List[float] = []
    for change in percent_steps:
        multiplier = 1 + change / 100.0
        price = max(resolved_price * multiplier, 0.0)
        demand = max(resolved_volume * multiplier ** elasticity, 0.0)
        media_values.append(round(price, 4))
        total_volumes.append(round(demand, 4))
        percent_changes.append(float(change))

    return {
        "media_values": media_values,
        "total_volumes": total_volumes,
        "percent_changes": percent_changes,
        "curve_analysis": _curve_analysis(media_values, total_volumes, percent_changes),
    }


def _variable_curve_series(
    record: ModelRecord,
    variable: str,
    impact: float,
) -> Dict[str, Any]:
    percent_steps = [-50, -25, -10, 0, 10, 25, 50]
    base_metric = record.variable_averages.get(variable)
    if base_metric is None or base_metric == 0:
        base_metric = 1.0

    media_values: List[float] = []
    total_volumes: List[float] = []
    percent_changes: List[float] = []
    for change in percent_steps:
        multiplier = 1 + change / 100.0
        media_value = max(base_metric * multiplier, 0.0)
        demand_multiplier = 1 + (impact or 0.0) * (change / 100.0)
        demand = max(record.base_volume * demand_multiplier, 0.0)
        media_values.append(round(media_value, 4))
        total_volumes.append(round(demand, 4))
        percent_changes.append(float(change))

    return {
        "media_values": media_values,
        "total_volumes": total_volumes,
        "percent_changes": percent_changes,
        "curve_analysis": _curve_analysis(media_values, total_volumes, percent_changes),
    }


def generate_s_curve(payload: Dict[str, Any]) -> Dict[str, Any]:
    request = CurveRequestPayload(**payload)
    models = _models_for_file(request.file_key, request.combination_name)
    record = next((model for model in models if model.model_name == request.model_name), None)
    if record is None:
        raise ValueError("Requested model not found")
    base_price, base_volume = _resolve_base_values(record, request)
    if base_price <= 0 or base_volume <= 0:
        raise ModelDataUnavailableError(
            f"Base price or volume missing for model '{request.model_name}'"
        )

    price_series = _price_curve_series(
        record, base_price=base_price, base_volume=base_volume
    )

    revenues = [
        round(media * volume, 4)
        for media, volume in zip(
            price_series["media_values"], price_series["total_volumes"]
        )
    ]
    optimal_index = max(range(len(revenues)), key=lambda idx: revenues[idx])
    optimal_revenue = {
        "price": price_series["media_values"][optimal_index],
        "demand": price_series["total_volumes"][optimal_index],
        "revenue": revenues[optimal_index],
        "percent_change": price_series["percent_changes"][optimal_index],
    }

    s_curves: Dict[str, Any] = {record.price_variable: price_series}
    for variable, impact in record.variable_impacts.items():
        if variable == record.price_variable:
            continue
        try:
            s_curves[variable] = _variable_curve_series(record, variable, impact)
        except Exception:  # pragma: no cover - safeguard unexpected input
            logger.exception(
                "Failed to construct curve series for variable %s", variable
            )

    return {
        "success": True,
        "file_key": request.file_key,
        "combination_id": request.combination_name,
        "model_name": request.model_name,
        "price_variable": record.price_variable,
        "intercept": record.metrics.get("self_beta", -0.8),
        "base_price": base_price,
        "base_volume": base_volume,
        "base_revenue": base_price * base_volume,
        "elasticity_at_base": record.metrics.get("self_elasticity"),
        "rpi_competitor_prices": record.rpi_competitors,
        "quality": {
            "mape_test": record.metrics.get("mape_test"),
            "r2_test": record.metrics.get("r2_test"),
            "best_model": record.model_name,
        },
        "s_curves": s_curves,
        "curve_data": [
            {
                "price": media,
                "demand": volume,
                "revenue": revenue,
                "elasticity": record.metrics.get("self_elasticity"),
                "percent_change": change,
            }
            for media, volume, revenue, change in zip(
                price_series["media_values"],
                price_series["total_volumes"],
                revenues,
                price_series["percent_changes"],
            )
        ],
        "optimal_revenue": optimal_revenue,
    }


def get_application_type(client_name: str, app_name: str, project_name: str) -> Dict[str, Any]:
    application_type = "mmm" if "mmm" in project_name.lower() else "general"
    return {
        "client_name": client_name,
        "app_name": app_name,
        "project_name": project_name,
        "application_type": application_type,
        "is_mmm": application_type == "mmm",
    }


__all__ = [
    "calculate_actual_vs_predicted",
    "calculate_weighted_ensemble",
    "calculate_yoy",
    "filter_models",
    "filter_models_with_existing",
    "generate_s_curve",
    "get_application_type",
    "get_ensemble_actual_vs_predicted",
    "get_ensemble_contribution",
    "get_ensemble_yoy",
    "get_filter_options",
    "get_model_contribution",
    "get_model_performance",
    "get_saved_combinations_status",
    "get_variable_ranges",
    "list_combination_ids",
    "list_model_results_files",
    "list_variables",
    "save_model",
]
