"""Service helpers for the select_models_feature_based feature."""

from __future__ import annotations

import asyncio
import io
import logging
import math
import statistics
import json
from dataclasses import dataclass
from datetime import datetime
from itertools import count
from typing import Any, Dict, Iterable, List, Sequence, Optional

import pandas as pd
import numpy as np

from minio.error import S3Error
from pydantic import BaseModel, Field

from .database import MINIO_BUCKET, get_minio_df, minio_client, client, db


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


def _selected_models_column(frame: pd.DataFrame) -> str | None:
    for column in frame.columns:
        if column.lower() == "selected_models":
            return column
    return None


def _write_dataframe_to_minio(frame: pd.DataFrame, file_key: str) -> None:
    if not minio_client:
        raise RuntimeError("MinIO connection is not available")

    lower_key = file_key.lower()
    data: bytes
    content_type: str

    if lower_key.endswith(".csv"):
        buffer = io.StringIO()
        frame.to_csv(buffer, index=False)
        data = buffer.getvalue().encode("utf-8")
        content_type = "text/csv"
    elif lower_key.endswith(".xlsx"):
        buffer = io.BytesIO()
        frame.to_excel(buffer, index=False)
        data = buffer.getvalue()
        content_type = "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
    elif lower_key.endswith(".arrow") or lower_key.endswith(".feather"):
        import pyarrow as pa
        import pyarrow.ipc as ipc

        table = pa.Table.from_pandas(frame)
        buffer = io.BytesIO()
        with ipc.new_file(buffer, table.schema) as writer:
            writer.write_table(table)
        data = buffer.getvalue()
        content_type = "application/octet-stream"
    else:
        raise ValueError(f"Unsupported file type for writing: {file_key}")

    minio_client.put_object(
        MINIO_BUCKET,
        file_key,
        io.BytesIO(data),
        len(data),
        content_type=content_type,
    )


def _update_selected_models_flag(file_key: str, combination_id: str | None, model_name: str) -> bool:
    normalised_key = _normalise_file_key(file_key)
    if not normalised_key:
        logger.warning("Cannot update selected_models flag: empty file key")
        return False

    frame = _load_dataframe(normalised_key)
    if frame is None or frame.empty:
        logger.warning("Cannot update selected_models flag: dataframe empty for %s", normalised_key)
        return False

    combination_column = _detect_combination_column(frame)
    model_column = _detect_model_name_column(frame)
    if not model_column:
        logger.warning("Cannot update selected_models flag: model column not found in %s", normalised_key)
        return False

    selected_column = _selected_models_column(frame)
    if not selected_column:
        selected_column = "selected_models"
        frame[selected_column] = "no"
    else:
        frame[selected_column] = frame[selected_column].fillna("no").astype(str)

    mask = frame[model_column].astype(str) == str(model_name)

    if combination_column and combination_id is not None:
        combo_mask = frame[combination_column].astype(str) == str(combination_id)
        if combo_mask.any():
            frame.loc[combo_mask, selected_column] = "no"
        mask &= combo_mask

    if not mask.any():
        logger.warning(
            "No rows matched for selected_models update (file=%s, combination=%s, model=%s)",
            normalised_key,
            combination_id,
            model_name,
        )
        return False

    frame.loc[mask, selected_column] = "yes"

    try:
        _write_dataframe_to_minio(frame, normalised_key)
        logger.info(
            "Updated selected_models flag for %s (combination=%s, model=%s)",
            normalised_key,
            combination_id,
            model_name,
        )
        return True
    except Exception as exc:  # pragma: no cover - defensive
        logger.error("Failed to persist selected_models flag for %s: %s", normalised_key, exc)
        return False


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
    column = lookup.get(key.lower())
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
    """Filter models using a selected variable (column) and metric ranges, reading directly from file"""
    request = ModelFilterPayload(**payload)
    
    # Handle empty or missing variable - return empty array
    if not request.variable or not request.variable.strip():
        logger.warning("No variable provided, returning empty results")
        return []
    
    if not minio_client:
        raise ValueError("MinIO connection is not available")
    
    try:
        # Download file from MinIO
        response = minio_client.get_object(MINIO_BUCKET, request.file_key)
        content = response.read()
        response.close()
        response.release_conn()
        
        # Read file based on extension
        if request.file_key.endswith(".csv"):
            df = pd.read_csv(io.BytesIO(content))
        elif request.file_key.endswith(".xlsx"):
            df = pd.read_excel(io.BytesIO(content))
        elif request.file_key.endswith(".arrow"):
            import pyarrow as pa
            import pyarrow.ipc as ipc
            reader = ipc.RecordBatchFileReader(pa.BufferReader(content))
            df = reader.read_all().to_pandas()
        else:
            raise ValueError(f"Unsupported file type: {request.file_key}")
        
        # Find the method column for the selected variable
        method_column = None
        method_type = request.method or "elasticity"
        
        # Look for method column with pattern: {variable}_{method}
        # Handle special case for "average" method which uses "avg" in column names
        method_suffix = "avg" if method_type.lower() == "average" else method_type.lower()
        
        # For ROI, try multiple column name patterns
        if method_type.lower() == "roi":
            roi_patterns = [
                f"{request.variable.lower()}_{method_suffix}",
                f"{request.variable.upper()}_ROI",
                f"ROI_{request.variable}",
                f"roi_{request.variable}",
                f"{request.variable}_CPRP_VALUE",
                f"self_{method_suffix}"
            ]
            
            for pattern in roi_patterns:
                for col in df.columns:
                    if col.lower() == pattern.lower():
                        method_column = col
                        break
                if method_column:
                    break
        else:
            for col in df.columns:
                if col.lower() == f"{request.variable.lower()}_{method_suffix}":
                    method_column = col
                    break
        
        # If method column not found, return empty array instead of raising error
        # This handles cases where variable is deselected or doesn't exist
        if not method_column:
            expected_column = f"{request.variable}_{method_suffix}"
            logger.warning(f"No {method_type} column found for variable '{request.variable}'. Expected column: '{expected_column}'. Available columns: {list(df.columns)[:20]}...")
            return []
        
        # Check for model column with flexible naming
        model_column = None
        possible_model_columns = ['model_name', 'Model', 'model', 'MODEL_NAME', 'ModelName', 'model_id', 'Model_Name']
        
        for col_name in possible_model_columns:
            if col_name in df.columns:
                model_column = col_name
                break
        
        if not model_column:
            raise ValueError(f"No model identifier column found. Expected one of: {possible_model_columns}")
        
        # Prepare a DataFrame with model column and the method column
        columns_to_select = [model_column, method_column]
        
        # Add combination_id column if filtering by combination
        combination_id_column = None
        if request.combination_id:
            # Find combination_id column
            for col in df.columns:
                col_lower = col.lower()
                if (col_lower == 'combination_id' or 
                    col_lower == 'combo_id' or 
                    col_lower == 'combinationid' or
                    'combination_id' in col_lower or 
                    'combo_id' in col_lower or 
                    'combination' in col_lower):
                    combination_id_column = col
                    break
            
            if combination_id_column:
                columns_to_select.append(combination_id_column)
        
        # Add metric columns if they exist - include variations to match actual file column names
        # Based on actual file: mape_trali (mape_train), mape_pe_test (mape_test), etc.
        metric_columns = [
            'MAPE', 'mape', 'Mape',
            'Test_R2', 'R2', 'r2', 'Test_r2', 'r2_test', 'R2_test', 'R2_Test',
            'SelfElasticity', 'self_elasticity',
            'mape_train', 'MAPE_train', 'Mape_train', 'mape_trali', 'mape_train',  # Handle variations
            'mape_test', 'MAPE_test', 'Mape_test', 'mape_pe_test',  # Handle variations
            'r2_train', 'R2_train', 'R2_Train',
            'r2_test', 'R2_test', 'R2_Test',
            'aic', 'AIC', 'Aic',
            'bic', 'BIC', 'Bic'
        ]
        existing_metric_columns = []
        
        # Check all columns in dataframe for metric patterns (case-insensitive)
        for col in df.columns:
            col_lower = col.lower()
            # Check for mape variations
            if 'mape' in col_lower and ('train' in col_lower or 'trali' in col_lower):
                if col not in columns_to_select:
                    columns_to_select.append(col)
                    existing_metric_columns.append(col)
            elif 'mape' in col_lower and ('test' in col_lower or 'pe_test' in col_lower):
                if col not in columns_to_select:
                    columns_to_select.append(col)
                    existing_metric_columns.append(col)
            # Check for r2 variations
            elif ('r2' in col_lower or 'r_2' in col_lower) and ('train' in col_lower or 'test' in col_lower):
                if col not in columns_to_select:
                    columns_to_select.append(col)
                    existing_metric_columns.append(col)
            # Check for aic/bic
            elif col_lower in ['aic', 'bic']:
                if col not in columns_to_select:
                    columns_to_select.append(col)
                    existing_metric_columns.append(col)
            # Check exact matches from metric_columns list
            elif col in metric_columns:
                if col not in columns_to_select:
                    columns_to_select.append(col)
                    existing_metric_columns.append(col)
        
        # Select only the columns we need
        filtered = df[columns_to_select].copy()
        
        # Filter by combination_id if specified
        if request.combination_id and combination_id_column:
            filtered = filtered[filtered[combination_id_column] == request.combination_id]
        
        # Rename columns for consistent processing
        filtered = filtered.rename(columns={
            model_column: 'model_name',
            method_column: 'selected_variable_value'
        })
        
        # Apply metric filters
        # MAPE filtering
        mape_col = None
        for col in ['MAPE', 'mape', 'Mape']:
            if col in existing_metric_columns:
                mape_col = col
                break
        
        if mape_col and mape_col in filtered.columns:
            if request.min_mape is not None:
                filtered = filtered[filtered[mape_col] >= request.min_mape]
            if request.max_mape is not None:
                filtered = filtered[filtered[mape_col] <= request.max_mape]
        
        # R2 filtering
        r2_col = None
        for col in ['Test_R2', 'R2', 'r2', 'Test_r2']:
            if col in existing_metric_columns:
                r2_col = col
                break
                
        if r2_col and r2_col in filtered.columns:
            if request.min_r2 is not None:
                filtered = filtered[filtered[r2_col] >= request.min_r2]
            if request.max_r2 is not None:
                filtered = filtered[filtered[r2_col] <= request.max_r2]
        
        # Filter by the selected variable's values
        if request.min_self_elasticity is not None:
            filtered = filtered[filtered['selected_variable_value'] >= request.min_self_elasticity]
        if request.max_self_elasticity is not None:
            filtered = filtered[filtered['selected_variable_value'] <= request.max_self_elasticity]
        
        # MAPE Train filtering - handle variations like mape_trali
        mape_train_col = None
        # First try exact matches
        for col in ['mape_train', 'MAPE_train', 'Mape_train']:
            if col in existing_metric_columns:
                mape_train_col = col
                break
        # If not found, try pattern matching for variations
        if not mape_train_col:
            for col in existing_metric_columns:
                col_lower = col.lower()
                if 'mape' in col_lower and ('train' in col_lower or 'trali' in col_lower):
                    mape_train_col = col
                    break
        
        if mape_train_col and mape_train_col in filtered.columns:
            if request.min_mape_train is not None:
                filtered = filtered[filtered[mape_train_col] >= request.min_mape_train]
            if request.max_mape_train is not None:
                filtered = filtered[filtered[mape_train_col] <= request.max_mape_train]
        
        # MAPE Test filtering - handle variations like mape_pe_test
        mape_test_col = None
        # First try exact matches
        for col in ['mape_test', 'MAPE_test', 'Mape_test']:
            if col in existing_metric_columns:
                mape_test_col = col
                break
        # If not found, try pattern matching for variations
        if not mape_test_col:
            for col in existing_metric_columns:
                col_lower = col.lower()
                if 'mape' in col_lower and ('test' in col_lower or 'pe_test' in col_lower):
                    mape_test_col = col
                    break
        
        if mape_test_col and mape_test_col in filtered.columns:
            if request.min_mape_test is not None:
                filtered = filtered[filtered[mape_test_col] >= request.min_mape_test]
            if request.max_mape_test is not None:
                filtered = filtered[filtered[mape_test_col] <= request.max_mape_test]
        
        # R2 Train filtering
        r2_train_col = None
        for col in ['r2_train', 'R2_train', 'R2_Train']:
            if col in existing_metric_columns:
                r2_train_col = col
                break
        
        if r2_train_col and r2_train_col in filtered.columns:
            if request.min_r2_train is not None:
                filtered = filtered[filtered[r2_train_col] >= request.min_r2_train]
            if request.max_r2_train is not None:
                filtered = filtered[filtered[r2_train_col] <= request.max_r2_train]
        
        # R2 Test filtering
        r2_test_col = None
        for col in ['r2_test', 'R2_test', 'R2_Test']:
            if col in existing_metric_columns:
                r2_test_col = col
                break
        
        if r2_test_col and r2_test_col in filtered.columns:
            if request.min_r2_test is not None:
                filtered = filtered[filtered[r2_test_col] >= request.min_r2_test]
            if request.max_r2_test is not None:
                filtered = filtered[filtered[r2_test_col] <= request.max_r2_test]
        
        # AIC filtering
        aic_col = None
        for col in ['aic', 'AIC', 'Aic']:
            if col in existing_metric_columns:
                aic_col = col
                break
        
        if aic_col and aic_col in filtered.columns:
            if request.min_aic is not None:
                filtered = filtered[filtered[aic_col] >= request.min_aic]
            if request.max_aic is not None:
                filtered = filtered[filtered[aic_col] <= request.max_aic]
        
        # BIC filtering
        bic_col = None
        for col in ['bic', 'BIC', 'Bic']:
            if col in existing_metric_columns:
                bic_col = col
                break
        
        if bic_col and bic_col in filtered.columns:
            if request.min_bic is not None:
                filtered = filtered[filtered[bic_col] >= request.min_bic]
            if request.max_bic is not None:
                filtered = filtered[filtered[bic_col] <= request.max_bic]
        
        # Per-variable filtering for multiple variables
        # First, we need to add variable columns to columns_to_select if they're not already there
        if request.variable_filters:
            # Add variable columns to the dataframe before filtering
            for variable_name, variable_filter in request.variable_filters.items():
                if variable_name.lower() != request.variable.lower():
                    # This is a different variable, need to find its specific column
                    method_suffix_var = "avg" if method_type.lower() == "average" else method_type.lower()
                    
                    # Try to find the variable column for this method
                    var_method_column = None
                    for col in df.columns:
                        col_lower = col.lower()
                        # Try exact match: {variable}_{method}
                        if col_lower == f"{variable_name.lower()}_{method_suffix_var}":
                            var_method_column = col
                            break
                        # Try partial match (handle variations like tv_reach_a for tv_reach_avg)
                        elif (variable_name.lower() in col_lower and 
                              (method_suffix_var in col_lower or 
                               (method_suffix_var == "avg" and col_lower.endswith("_a")) or
                               (method_suffix_var == "beta" and col_lower.endswith("_b")) or
                               (method_suffix_var == "elasticity" and (col_lower.endswith("_e") or "elastic" in col_lower)))):
                            var_method_column = col
                            break
                    
                    # Add the variable column to columns_to_select if found and not already added
                    if var_method_column and var_method_column not in columns_to_select:
                        columns_to_select.append(var_method_column)
                        # Re-select columns to include the new variable column
                        filtered = df[columns_to_select].copy()
                        # Re-apply combination_id filter if needed
                        if request.combination_id and combination_id_column:
                            filtered = filtered[filtered[combination_id_column] == request.combination_id]
                        # Re-rename columns
                        filtered = filtered.rename(columns={
                            model_column: 'model_name',
                            method_column: 'selected_variable_value'
                        })
        
        # Now apply variable filters
        if request.variable_filters:
            for variable_name, variable_filter in request.variable_filters.items():
                # Use current_min and current_max (user-selected range) instead of min/max (full range)
                min_val = variable_filter.get('current_min') or variable_filter.get('min')
                max_val = variable_filter.get('current_max') or variable_filter.get('max')
                
                # For the current variable being processed, filter by selected_variable_value
                if variable_name.lower() == request.variable.lower():
                    
                    if min_val is not None:
                        filtered = filtered[filtered['selected_variable_value'] >= min_val]
                    if max_val is not None:
                        filtered = filtered[filtered['selected_variable_value'] <= max_val]
                else:
                    # This is a different variable, need to find its specific column
                    var_method_column = None
                    method_suffix_var = "avg" if method_type.lower() == "average" else method_type.lower()
                    
                    # First, try to find the column in the original dataframe (more reliable)
                    # Try exact match first
                    for col in df.columns:
                        col_lower = col.lower()
                        if col_lower == f"{variable_name.lower()}_{method_suffix_var}":
                            var_method_column = col
                            break
                    
                    # If not found, try partial match with variations
                    if not var_method_column:
                        for col in df.columns:
                            col_lower = col.lower()
                            if (variable_name.lower() in col_lower and 
                                (method_suffix_var in col_lower or 
                                 (method_suffix_var == "avg" and col_lower.endswith("_a")) or
                                 (method_suffix_var == "beta" and col_lower.endswith("_b")) or
                                 (method_suffix_var == "elasticity" and (col_lower.endswith("_e") or "elastic" in col_lower)))):
                                var_method_column = col
                                break
                    
                    # If column found, make sure it's in the filtered dataframe
                    if var_method_column:
                        # If column not in filtered, add it
                        if var_method_column not in filtered.columns:
                            # Re-select columns to include the variable column
                            if var_method_column not in columns_to_select:
                                columns_to_select.append(var_method_column)
                            filtered = df[columns_to_select].copy()
                            # Re-apply combination_id filter if needed
                            if request.combination_id and combination_id_column:
                                filtered = filtered[filtered[combination_id_column] == request.combination_id]
                            # Re-rename columns
                            filtered = filtered.rename(columns={
                                model_column: 'model_name',
                                method_column: 'selected_variable_value'
                            })
                        
                        # Now apply the filter using current_min/current_max (already extracted above)
                        if var_method_column in filtered.columns:
                            if min_val is not None:
                                filtered = filtered[filtered[var_method_column] >= min_val]
                            if max_val is not None:
                                filtered = filtered[filtered[var_method_column] <= max_val]
        
        # Remove rows with NaN values in critical columns
        filtered = filtered.dropna(subset=['model_name', 'selected_variable_value'])
        
        # Filter out ensemble models
        filtered = filtered[~filtered['model_name'].astype(str).str.lower().str.contains('ensemble', na=False)]
        
        # Prepare response
        results = []
        for _, row in filtered.iterrows():
            model_data = {
                "model_name": str(row["model_name"]),
                "self_elasticity": float(row["selected_variable_value"])
            }
            
            # Add method-specific field based on the method type
            if method_type == "beta":
                model_data["self_beta"] = float(row["selected_variable_value"])
            elif method_type == "average":
                model_data["self_avg"] = float(row["selected_variable_value"])
            elif method_type == "roi":
                model_data["self_roi"] = float(row["selected_variable_value"])
            
            # Add combination_id if available
            if combination_id_column and combination_id_column in row.index:
                model_data["combination_id"] = str(row[combination_id_column])
            
            results.append(model_data)
        
        # If no results found, return empty array instead of raising error
        # This handles cases where filters are too restrictive or variable doesn't match any models
        if not results:
            logger.info(f"No models found matching the criteria. Total models: {len(df)}, After filtering: {len(filtered)}")
            return []
        
        # Sort by the selected variable value (descending)
        results.sort(key=lambda item: item.get("self_elasticity", 0), reverse=True)
        return results
        
    except Exception as e:
        logger.error(f"Error filtering models: {str(e)}")
        # Return empty array on error instead of raising - allows frontend to handle gracefully
        return []


def filter_models_with_existing(payload: Dict[str, Any]) -> Dict[str, Any]:
    results = filter_models(payload)
    return {"results": results, "total": len(results)}


def get_variable_ranges(file_key: str, combination_id: str | None, variables: Iterable[str], method: str | None = None) -> Dict[str, Any]:
    """Get variable ranges for a specific method (elasticity, beta, average, ROI)"""
    if not minio_client:
        raise ValueError("MinIO connection is not available")
    
    method_type = (method or "elasticity").lower()
    method_suffix = "avg" if method_type == "average" else method_type
    
    try:
        # Download file from MinIO to read column values directly
        response = minio_client.get_object(MINIO_BUCKET, file_key)
        content = response.read()
        response.close()
        response.release_conn()
        
        # Read file based on extension
        if file_key.endswith(".csv"):
            df = pd.read_csv(io.BytesIO(content))
        elif file_key.endswith(".xlsx"):
            df = pd.read_excel(io.BytesIO(content))
        elif file_key.endswith(".arrow"):
            import pyarrow as pa
            import pyarrow.ipc as ipc
            reader = ipc.RecordBatchFileReader(pa.BufferReader(content))
            df = reader.read_all().to_pandas()
        else:
            raise ValueError(f"Unsupported file type: {file_key}")
        
        # Filter by combination_id if specified
        if combination_id:
            combination_id_column = None
            for col in df.columns:
                col_lower = col.lower()
                if (col_lower == 'combination_id' or 
                    col_lower == 'combo_id' or 
                    col_lower == 'combinationid' or
                    'combination_id' in col_lower or 
                    'combo_id' in col_lower or 
                    'combination' in col_lower):
                    combination_id_column = col
                    break
            
            if combination_id_column:
                df = df[df[combination_id_column] == combination_id]
        
        ranges: Dict[str, Dict[str, float]] = {}
        
        for variable in variables:
            # Find the column for this variable and method
            var_method_column = None
            
            # Try exact match: {variable}_{method}
            for col in df.columns:
                col_lower = col.lower()
                if col_lower == f"{variable.lower()}_{method_suffix}":
                    var_method_column = col
                    break
                
            if var_method_column and var_method_column in df.columns:
                values = df[var_method_column].dropna()
                values = [float(v) for v in values if pd.notna(v) and np.isfinite(v)]
                
                if values:
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
        
    except ModelDataUnavailableError as exc:
        return {
            "file_key": file_key,
            "combination_id": combination_id,
            "variable_ranges": {},
            "note": str(exc),
        }
    except Exception as e:
        logger.error(f"Error getting variable ranges: {str(e)}")
        return {
            "file_key": file_key,
            "combination_id": combination_id,
            "variable_ranges": {},
            "note": f"Error: {str(e)}",
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

    target_combination = combination_id or record.combination_id
    try:
        updated = _update_selected_models_flag(request.file_key, target_combination, request.model_name)
        if not updated:
            logger.warning(
                "Selected model flag not updated for file=%s combination=%s model=%s",
                request.file_key,
                target_combination,
                request.model_name,
            )
    except Exception as exc:  # pragma: no cover - defensive
        logger.error(
            "Failed to update selected_models column for file=%s combination=%s model=%s: %s",
            request.file_key,
            target_combination,
            request.model_name,
            exc,
        )

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
    """Get contribution data for a specific model and combination from model results file"""
    if not minio_client:
        raise ValueError("MinIO connection is not available")
    
    try:
        # Download file from MinIO
        response = minio_client.get_object(MINIO_BUCKET, file_key)
        content = response.read()
        response.close()
        response.release_conn()
        
        # Read file based on extension
        if file_key.endswith(".csv"):
            df = pd.read_csv(io.BytesIO(content))
        elif file_key.endswith(".xlsx"):
            df = pd.read_excel(io.BytesIO(content))
        elif file_key.endswith(".arrow"):
            import pyarrow as pa
            import pyarrow.ipc as ipc
            reader = ipc.RecordBatchFileReader(pa.BufferReader(content))
            df = reader.read_all().to_pandas()
        else:
            raise ValueError(f"Unsupported file type: {file_key}")
        
            # Find combination_id column
        combination_id_column = None
        for col in df.columns:
            col_lower = col.lower()
            if (col_lower == 'combination_id' or 
                col_lower == 'combo_id' or 
                col_lower == 'combinationid' or
                'combination_id' in col_lower or 
                'combo_id' in col_lower or 
                'combination' in col_lower):
                combination_id_column = col
                break
        
        if not combination_id_column:
            raise ValueError("No combination_id column found")
        
        # Find model_name column
        model_name_column = None
        possible_model_columns = ['model_name', 'Model', 'model', 'MODEL_NAME', 'ModelName', 'model_id', 'Model_Name']
        
        for col_name in possible_model_columns:
            if col_name in df.columns:
                model_name_column = col_name
                break
        
        if not model_name_column:
            raise ValueError("No model_name column found")
        
        # Filter by combination_id and model_name
        filtered_df = df[(df[combination_id_column] == combination_id) & (df[model_name_column] == model_name)]
        
        if filtered_df.empty:
            raise ValueError(f"No data found for combination_id: {combination_id} and model_name: {model_name}")
        
        # Get the first (and should be only) row
        model_row = filtered_df.iloc[0]
        
        # Find columns that end with _contribution
        contribution_columns = []
        for col in df.columns:
            if col.lower().endswith('_contribution'):
                contribution_columns.append(col)
        
        if not contribution_columns:
            raise ValueError("No contribution columns found (columns ending with _contribution)")
        
        # Extract contribution data
        contribution_data = []
        for col in contribution_columns:
            value = model_row[col]
            if pd.notna(value):  # Check if value is not NaN
                # Extract variable name from column (remove _contribution suffix)
                variable_name = col.replace('_contribution', '').replace('_Contribution', '')
                contribution_data.append({
                    "name": variable_name,
                    "value": float(value)
                })
        
        if not contribution_data:
            raise ValueError("No valid contribution data found")
        
        return {
            "file_key": file_key,
            "combination_id": combination_id,
            "model_name": model_name,
            "contribution_data": contribution_data
        }
        
    except Exception as e:
        logger.error(f"Error getting model contribution: {str(e)}")
        raise ValueError(f"Error processing file: {str(e)}")


def get_model_performance(file_key: str, combination_id: str, model_name: str) -> Dict[str, Any]:
    """Get performance metrics for a specific model and combination from model results file"""
    if not minio_client:
        raise ValueError("MinIO connection is not available")
    
    try:
        # Download file from MinIO
        response = minio_client.get_object(MINIO_BUCKET, file_key)
        content = response.read()
        response.close()
        response.release_conn()
        
        # Read file based on extension
        if file_key.endswith(".csv"):
            df = pd.read_csv(io.BytesIO(content))
        elif file_key.endswith(".xlsx"):
            df = pd.read_excel(io.BytesIO(content))
        elif file_key.endswith(".arrow"):
            import pyarrow as pa
            import pyarrow.ipc as ipc
            reader = ipc.RecordBatchFileReader(pa.BufferReader(content))
            df = reader.read_all().to_pandas()
        else:
            raise ValueError(f"Unsupported file type: {file_key}")
        
        # Find combination_id column
        combination_id_column = None
        for col in df.columns:
            col_lower = col.lower()
            if (col_lower == 'combination_id' or 
                col_lower == 'combo_id' or 
                col_lower == 'combinationid' or
                'combination_id' in col_lower or 
                'combo_id' in col_lower or 
                'combination' in col_lower):
                combination_id_column = col
                break
        
        if not combination_id_column:
            raise ValueError("No combination_id column found")
        
        # Find model_name column
        model_name_column = None
        possible_model_columns = ['model_name', 'Model', 'model', 'MODEL_NAME', 'ModelName', 'model_id', 'Model_Name']
        
        for col_name in possible_model_columns:
            if col_name in df.columns:
                model_name_column = col_name
                break
        
        if not model_name_column:
            raise ValueError("No model_name column found")
        
        # Filter by combination_id and model_name
        filtered_df = df[(df[combination_id_column] == combination_id) & (df[model_name_column] == model_name)]
        
        if filtered_df.empty:
            raise ValueError(f"No data found for combination_id: {combination_id} and model_name: {model_name}")
        
        # Get the first (and should be only) row
        model_row = filtered_df.iloc[0]
        
        # Define the metric columns we want to check
        metric_columns = {
            'mape_train': ['mape_train', 'MAPE_train', 'Mape_train'],
            'mape_test': ['mape_test', 'MAPE_test', 'Mape_test'],
            'r2_train': ['r2_train', 'R2_train', 'R2_Train'],
            'r2_test': ['r2_test', 'R2_test', 'R2_Test'],
            'aic': ['aic', 'AIC', 'Aic'],
            'bic': ['bic', 'BIC', 'Bic']
        }
        
        performance_metrics = {}
        
        for metric_name, possible_columns in metric_columns.items():
            found_value = None
            for col in possible_columns:
                if col in model_row.index:
                    value = model_row[col]
                    if pd.notna(value):  # Check if value is not NaN
                        found_value = float(value)
                        break
            
            performance_metrics[metric_name] = found_value if found_value is not None else None
        
        # Format for frontend compatibility (return both dict and array formats)
        formatted_metrics = [
            {"label": "MAPE Train", "value": performance_metrics.get("mape_train"), "unit": "%"},
            {"label": "MAPE Test", "value": performance_metrics.get("mape_test"), "unit": "%"},
            {"label": "R2 Train", "value": performance_metrics.get("r2_train"), "unit": ""},
            {"label": "R2 Test", "value": performance_metrics.get("r2_test"), "unit": ""},
            {"label": "AIC", "value": performance_metrics.get("aic"), "unit": ""},
            {"label": "BIC", "value": performance_metrics.get("bic"), "unit": ""},
        ]
        
        return {
            "file_key": file_key,
            "combination_id": combination_id,
            "model_name": model_name,
            "performance_metrics": formatted_metrics  # Array format for frontend
        }
        
    except Exception as e:
        logger.error(f"Error getting model performance: {str(e)}")
        raise ValueError(f"Error processing file: {str(e)}")


def _actual_vs_predicted_payload(record: ModelRecord) -> Dict[str, Any]:
    residuals = [a - p for a, p in zip(record.series.actual, record.series.predicted)]
    mae = statistics.fmean(abs(residual) for residual in residuals)
    rmse = math.sqrt(statistics.fmean(residual ** 2 for residual in residuals))

    return {
        "success": True,
        "actual_values": list(record.series.actual),
        "predicted_values": list(record.series.predicted),
        "dates": list(record.series.dates),
        "rmse": round(rmse, 3),
        "mae": round(mae, 3),
    }


def calculate_actual_vs_predicted(payload: Dict[str, Any]) -> Dict[str, Any]:
    """Calculate actual vs predicted values using stored coefficients and actual X values from MongoDB"""
    request = CurveRequestPayload(**payload)
    
    # Use asyncio to run async MongoDB operations
    async def _calculate():
        # Create a new MongoDB client for this event loop to avoid "attached to different loop" errors
        # Use the same MONGO_URI and MONGO_DB from database.py to ensure proper authentication
        from motor.motor_asyncio import AsyncIOMotorClient
        import os
        from .database import MONGO_URI, MONGO_DB
        
        # Create a new client for this event loop with proper authentication
        loop_client = AsyncIOMotorClient(
            MONGO_URI,
            serverSelectionTimeoutMS=5000,
            connectTimeoutMS=5000,
            socketTimeoutMS=5000,
            maxPoolSize=10,
            minPoolSize=1
        )
        loop_db = loop_client[MONGO_DB]
        
        try:
            # Get the build configuration from MongoDB
            document_id = f"{request.client_name}/{request.app_name}/{request.project_name}"
            build_config = await loop_db["build-model_featurebased_configs"].find_one({"_id": document_id})
            
            if not build_config:
                raise ValueError(f"No build configuration found for {document_id}")
            
            # Get model coefficients for the specified combination and model
            model_coefficients = build_config.get("model_coefficients", {})
            combination_coefficients = model_coefficients.get(request.combination_name, {})
            model_coeffs = combination_coefficients.get(request.model_name, {})
            
            if not model_coeffs:
                raise ValueError(f"No coefficients found for combination '{request.combination_name}' and model '{request.model_name}'")
            
            # Get the file key for this combination
            combination_file_keys = build_config.get("combination_file_keys", [])
            file_key = None
            for combo_info in combination_file_keys:
                if combo_info.get("combination") == request.combination_name:
                    file_key = combo_info.get("file_key")
                    break
            
            if not file_key:
                raise ValueError(f"No file key found for combination '{request.combination_name}'")
            
            # Get actual values from the source file
            if not minio_client:
                raise ValueError("MinIO connection is not available")
            
            # Get the file from MinIO
            response = minio_client.get_object(MINIO_BUCKET, file_key)
            file_bytes = response.read()
            response.close()
            response.release_conn()
            
            # Read file based on extension
            if file_key.lower().endswith('.parquet'):
                df = pd.read_parquet(io.BytesIO(file_bytes))
            elif file_key.lower().endswith(('.arrow', '.feather')):
                df = pd.read_feather(io.BytesIO(file_bytes))
            else:
                # Try to read as parquet first, then fall back to arrow
                try:
                    df = pd.read_parquet(io.BytesIO(file_bytes))
                except:
                    df = pd.read_feather(io.BytesIO(file_bytes))
            
            df.columns = df.columns.str.lower()
            
            # Get coefficients and intercept
            intercept = model_coeffs.get("intercept", 0)
            coefficients = model_coeffs.get("coefficients", {})
            x_variables = model_coeffs.get("x_variables", [])
            y_variable = model_coeffs.get("y_variable", "")
            transformation_metadata = model_coeffs.get("transformation_metadata", {})
            
            # Lowercase y_variable and x_variables to match lowercased dataframe columns
            y_variable = y_variable.lower() if y_variable else ""
            x_variables = [x_var.lower() if isinstance(x_var, str) else x_var for x_var in x_variables]
            
            # Import apply_transformation_steps from s_curve.py
            try:
                from .s_curve import apply_transformation_steps
            except ImportError:
                apply_transformation_steps = None
            
            # Find date column
            date_column = None
            for col in df.columns:
                if col.lower() in ['date']:
                    date_column = col
                    break
            
            # Get dates if available
            dates = []
            if date_column and date_column in df.columns:
                date_values = df[date_column].tolist()
                # Convert dates to strings (handle pandas Timestamp objects)
                dates = [str(d) if d is not None else f"Period {i+1}" for i, d in enumerate(date_values)]
            else:
                # If no date column, create sequential dates
                dates = [f"Period {i+1}" for i in range(len(df))]
            
            # Check if y_variable exists in dataframe
            if not y_variable or y_variable not in df.columns:
                # Try to find y_variable by common names
                for col in df.columns:
                    if col.lower() in ['volume']:
                        y_variable = col
                        break
                
                # If still not found, try to find a numeric column
                if y_variable not in df.columns:
                    numeric_cols = df.select_dtypes(include=[np.number]).columns.tolist()
                    if numeric_cols:
                        y_variable = numeric_cols[0]
            
            if not y_variable or y_variable not in df.columns:
                raise ValueError(f"Y variable '{model_coeffs.get('y_variable', '')}' not found in dataframe columns: {list(df.columns)[:10]}")
            
            actual_values = df[y_variable].tolist() if y_variable in df.columns else []
            
            # Validate that we have actual values
            if not actual_values or len(actual_values) == 0:
                raise ValueError(f"No actual values found for y_variable '{y_variable}' in the dataframe")
            
            # Filter out NaN values from actual_values and keep track of valid indices
            valid_indices = []
            cleaned_actual_values = []
            for i, val in enumerate(actual_values):
                if pd.notna(val) and np.isfinite(val):
                    valid_indices.append(i)
                    cleaned_actual_values.append(float(val))
            
            if len(cleaned_actual_values) == 0:
                raise ValueError(f"All actual values are NaN or infinite for y_variable '{y_variable}'")
            
            # Update dates to match valid indices
            if valid_indices:
                dates = [dates[i] if i < len(dates) else f"Period {i+1}" for i in valid_indices]
            
            actual_values = cleaned_actual_values
            predicted_values = []
            
            # Check if transformations are available
            has_transformations = transformation_metadata and len(transformation_metadata) > 0 and apply_transformation_steps
            
            # Only process rows with valid actual values
            for idx in valid_indices:
                row = df.iloc[idx]
                
                # Calculate predicted value: intercept + sum(beta_i * x_i)
                predicted_value = intercept
                
                for x_var in x_variables:
                    # Try both Beta_x_var and x_var_beta patterns
                    beta_key = f"Beta_{x_var}"
                    if beta_key not in coefficients:
                        # Try alternative pattern
                        beta_key = f"{x_var}_beta"
                    
                    if beta_key in coefficients:
                        # Get the raw x value
                        if x_var in df.columns:
                            x_value = row[x_var]
                            
                            # Handle NaN values in x_variables
                            if pd.isna(x_value) or not np.isfinite(x_value):
                                x_value = 0.0
                            
                            # Apply transformations if available
                            if has_transformations and x_var in transformation_metadata:
                                transformation_steps = transformation_metadata[x_var].get('transformation_steps', [])
                                if transformation_steps:
                                    # Apply transformations to the single value
                                    try:
                                        transformed_result = apply_transformation_steps([x_value], transformation_steps)
                                        if transformed_result and len(transformed_result) > 0:
                                            x_value = transformed_result[0]
                                    except (IndexError, TypeError, ValueError) as e:
                                        logger.warning(f"Transformation failed for {x_var}: {e}, using original value")
                                        # Continue with original x_value
                            
                            beta_value = coefficients[beta_key]
                            contribution = beta_value * x_value
                            predicted_value += contribution
                
                predicted_values.append(float(predicted_value))
            
            # Filter out extreme outliers that might be causing axis scaling issues
            if len(predicted_values) > 0 and len(actual_values) > 0:
                predicted_array = np.array(predicted_values)
                actual_array = np.array(actual_values)
                
                # Calculate percentiles to identify extreme outliers
                # Check if arrays have valid data
                if len(predicted_array) > 0 and len(actual_array) > 0:
                    try:
                        pred_99th = np.percentile(predicted_array, 99)
                        pred_1st = np.percentile(predicted_array, 1)
                        actual_99th = np.percentile(actual_array, 99)
                        actual_1st = np.percentile(actual_array, 1)
                    except (ValueError, IndexError) as e:
                        logger.warning(f"Error calculating percentiles: {e}, skipping outlier filtering")
                        pred_99th = pred_1st = actual_99th = actual_1st = None
                else:
                    pred_99th = pred_1st = actual_99th = actual_1st = None
                
                # Filter out extreme outliers (beyond 99th percentile)
                filtered_data = []
                if pred_99th is not None and pred_1st is not None and actual_99th is not None and actual_1st is not None:
                    for i, (actual, predicted) in enumerate(zip(actual_values, predicted_values)):
                        if (predicted <= pred_99th and predicted >= pred_1st and 
                            actual <= actual_99th and actual >= actual_1st):
                            filtered_data.append((actual, predicted))
                else:
                    # If percentile calculation failed, use all data
                    filtered_data = [(a, p) for a, p in zip(actual_values, predicted_values)]
                
                # Use filtered data if available
                if filtered_data and len(filtered_data) > 0:
                    if len(filtered_data) < len(actual_values):
                        logger.warning(f"⚠️ Filtered out {len(actual_values) - len(filtered_data)} extreme outliers")
                    actual_values = [item[0] for item in filtered_data]
                    predicted_values = [item[1] for item in filtered_data]
                    if len(dates) > len(actual_values):
                        dates = dates[:len(actual_values)]
                    elif len(dates) < len(actual_values):
                        dates.extend([f"Period {i+1}" for i in range(len(dates), len(actual_values))])
            
            # Validate that we have data
            if len(actual_values) == 0 or len(predicted_values) == 0:
                raise ValueError(f"No valid data points found. Actual values: {len(actual_values)}, Predicted values: {len(predicted_values)}")
            
            # Ensure dates array matches the length of actual_values
            if len(dates) != len(actual_values):
                if len(dates) < len(actual_values):
                    dates.extend([f"Period {i+1}" for i in range(len(dates), len(actual_values))])
                else:
                    dates = dates[:len(actual_values)]
            
            # Convert dates to strings (in case they're not already)
            dates = [str(d) for d in dates]
            
            # Ensure all values are Python native types (not numpy types)
            actual_values = [float(v) for v in actual_values]
            predicted_values = [float(v) for v in predicted_values]
            
            # Calculate performance metrics
            if len(actual_values) > 0 and len(predicted_values) > 0:
                from sklearn.metrics import mean_absolute_error, mean_squared_error, r2_score
                
                mae = mean_absolute_error(actual_values, predicted_values)
                mse = mean_squared_error(actual_values, predicted_values)
                rmse = mse ** 0.5
                r2 = r2_score(actual_values, predicted_values)
                
                # Calculate MAPE
                mape = 0
                if sum(actual_values) != 0:
                    mape = (sum(abs((actual - pred) / actual) for actual, pred in zip(actual_values, predicted_values) if actual != 0) / len(actual_values)) * 100
            else:
                mae = mse = rmse = r2 = mape = 0
            
            logger.info(f"✅ Actual vs Predicted calculated: {len(actual_values)} data points, RMSE: {rmse:.3f}, R2: {r2:.3f}, MAE: {mae:.3f}")
            logger.info(f"   Combination: {request.combination_name}, Model: {request.model_name}, Y variable: {y_variable}, X variables: {x_variables}")
            
            return {
                "success": True,
                "combination_name": request.combination_name,
                "model_name": request.model_name,
                "file_key": file_key,
                "dates": dates,
                "actual_values": actual_values,
                "predicted_values": predicted_values,
                "rmse": round(rmse, 3),
                "mae": round(mae, 3),
                "performance_metrics": {
                    "mae": float(mae),
                    "mse": float(mse),
                    "rmse": float(rmse),
                    "r2": float(r2),
                    "mape": float(mape)
                },
                "model_info": {
                    "intercept": float(intercept),
                    "coefficients": {k: float(v) for k, v in coefficients.items()},
                    "x_variables": x_variables,
                    "y_variable": y_variable
                },
                "data_points": len(actual_values)
            }
        except Exception as e:
            logger.error(f"❌ Error calculating actual vs predicted: {str(e)}")
            import traceback
            logger.error(f"❌ Traceback: {traceback.format_exc()}")
            raise
        finally:
            # Close the MongoDB client for this event loop
            loop_client.close()
    
    # Run async function
    # Use asyncio.run() which creates a new event loop
    return asyncio.run(_calculate())
    # This works even when called from Celery tasks or other async contexts
    
def calculate_yoy(payload: Dict[str, Any]) -> Dict[str, Any]:
    """Calculate Year-over-Year (YoY) growth using stored coefficients and actual X values from MongoDB"""
    request = CurveRequestPayload(**payload)
    
    # Use asyncio to run async MongoDB operations
    async def _calculate():
        # Create a new MongoDB client for this event loop to avoid "attached to different loop" errors
        # Use the same MONGO_URI and MONGO_DB from database.py to ensure proper authentication
        from motor.motor_asyncio import AsyncIOMotorClient
        from .database import MONGO_URI, MONGO_DB
        
        # Create a new client for this event loop with proper authentication
        loop_client = AsyncIOMotorClient(
            MONGO_URI,
            serverSelectionTimeoutMS=5000,
            connectTimeoutMS=5000,
            socketTimeoutMS=5000,
            maxPoolSize=10,
            minPoolSize=1
        )
        loop_db = loop_client[MONGO_DB]
        
        try:
            # Get the build configuration from MongoDB
            document_id = f"{request.client_name}/{request.app_name}/{request.project_name}"
            build_config = await loop_db["build-model_featurebased_configs"].find_one({"_id": document_id})
            
            if not build_config:
                raise ValueError(f"No build configuration found for {document_id}")
            
            # Get model coefficients for the specified combination and model
            model_coefficients = build_config.get("model_coefficients", {})
            combination_coefficients = model_coefficients.get(request.combination_name, {})
            model_coeffs = combination_coefficients.get(request.model_name, {})
            
            if not model_coeffs:
                raise ValueError(f"No coefficients found for combination '{request.combination_name}' and model '{request.model_name}'")
            
            # Get transformation metadata
            transformation_metadata = model_coeffs.get("transformation_metadata", {})
            
            # Import apply_transformation_steps from s_curve.py
            try:
                from .s_curve import apply_transformation_steps
            except ImportError:
                apply_transformation_steps = None
            
            # Get the file key for this combination
            combination_file_keys = build_config.get("combination_file_keys", [])
            file_key = None
            for combo_info in combination_file_keys:
                if combo_info.get("combination") == request.combination_name:
                    file_key = combo_info.get("file_key")
                    break
            
            if not file_key:
                raise ValueError(f"No file key found for combination '{request.combination_name}'")
            
            # Get actual values from the source file
            if not minio_client:
                raise ValueError("MinIO connection is not available")
            
            # Get the file from MinIO
            response = minio_client.get_object(MINIO_BUCKET, file_key)
            file_bytes = response.read()
            response.close()
            response.release_conn()
            
            # Read file based on extension
            if file_key.lower().endswith('.parquet'):
                df = pd.read_parquet(io.BytesIO(file_bytes))
            elif file_key.lower().endswith(('.arrow', '.feather')):
                df = pd.read_feather(io.BytesIO(file_bytes))
            else:
                # Try to read as parquet first, then fall back to arrow
                try:
                    df = pd.read_parquet(io.BytesIO(file_bytes))
                except:
                    df = pd.read_feather(io.BytesIO(file_bytes))
            
            df.columns = df.columns.str.lower()
            
            # Get coefficients and intercept
            intercept = model_coeffs.get("intercept", 0)
            coefficients = model_coeffs.get("coefficients", {})
            x_variables = model_coeffs.get("x_variables", [])
            y_variable = model_coeffs.get("y_variable", "")
            
            # Detect date column
            date_column = None
            date_columns = ["Date", "date", "DATE"]
            for col in date_columns:
                if col in df.columns:
                    date_column = col
                    break
            
            if not date_column:
                raise ValueError("Could not detect date column. Please ensure a date column is present.")
            
            # Convert date column to datetime
            df[date_column] = pd.to_datetime(df[date_column], errors='coerce')
            df = df.dropna(subset=[date_column])
            
            if df.empty:
                raise ValueError("No valid date data found after conversion.")
            
            # Get unique years and ensure we have at least 2 years
            years = sorted(df[date_column].dt.year.unique())
            if len(years) < 2:
                raise ValueError("Need at least two calendar years in the dataset for YoY calculation.")
            
            year_first, year_last = int(years[0]), int(years[-1])
            
            # Split data by years
            df_first_year = df[df[date_column].dt.year == year_first]
            df_last_year = df[df[date_column].dt.year == year_last]
            
            if df_first_year.empty or df_last_year.empty:
                raise ValueError(f"No data found for year {year_first} or {year_last}.")
            
            # Calculate actual YoY change
            y_first_mean = df_first_year[y_variable].mean() if y_variable in df_first_year.columns else 0
            y_last_mean = df_last_year[y_variable].mean() if y_variable in df_last_year.columns else 0
            observed_delta = float(y_last_mean - y_first_mean)
            
            # Calculate explained YoY change using model coefficients
            explained_delta = 0.0
            contributions = []
            
            # Check if transformations are available
            has_transformations = transformation_metadata and len(transformation_metadata) > 0 and apply_transformation_steps
            
            for x_var in x_variables:
                beta_key = f"Beta_{x_var}"
                if beta_key in coefficients and x_var in df.columns:
                    beta_value = coefficients[beta_key]
                    
                    # Calculate mean values for each year
                    x_first_mean = df_first_year[x_var].mean()
                    x_last_mean = df_last_year[x_var].mean()
                    
                    # Apply transformations if available
                    if has_transformations and x_var in transformation_metadata:
                        transformation_steps = transformation_metadata[x_var].get('transformation_steps', [])
                        if transformation_steps:
                            # Apply transformations to both year means
                            try:
                                transformed_first = apply_transformation_steps([x_first_mean], transformation_steps)
                                if transformed_first and len(transformed_first) > 0:
                                    x_first_mean = transformed_first[0]
                            except (IndexError, TypeError, ValueError) as e:
                                logger.warning(f"Transformation failed for {x_var} (first year): {e}, using original value")
                            
                            try:
                                transformed_last = apply_transformation_steps([x_last_mean], transformation_steps)
                                if transformed_last and len(transformed_last) > 0:
                                    x_last_mean = transformed_last[0]
                            except (IndexError, TypeError, ValueError) as e:
                                logger.warning(f"Transformation failed for {x_var} (last year): {e}, using original value")
                    
                    # Calculate contribution: beta * (mean_last_year - mean_first_year)
                    delta_contribution = beta_value * (x_last_mean - x_first_mean)
                    explained_delta += delta_contribution
                    
                    contributions.append({
                        "variable": x_var,
                        "beta_coefficient": beta_value,
                        "mean_year1": float(x_first_mean),
                        "mean_year2": float(x_last_mean),
                        "delta_contribution": float(delta_contribution)
                    })
            
            # Sort contributions by absolute value
            contributions.sort(key=lambda x: abs(x["delta_contribution"]), reverse=True)
            
            # Calculate residual
            residual = float(observed_delta - explained_delta)
            
            # Calculate YoY percentage change
            yoy_percentage = 0.0
            if y_first_mean != 0:
                yoy_percentage = (observed_delta / y_first_mean) * 100
            
            # Create waterfall data for visualization
            waterfall_labels = [f"Base {year_first}"] + [c["variable"] for c in contributions] + ["Residual", f"Final {year_last}"]
            waterfall_values = [y_first_mean] + [c["delta_contribution"] for c in contributions] + [residual, y_last_mean]
            
            # For backward compatibility, return empty arrays (waterfall chart uses waterfall data instead)
            dates = []
            actual = []
            predicted = []
            
            return {
                "success": True,
                "combination_name": request.combination_name,
                "model_name": request.model_name,
                "file_key": file_key,
                "dates": dates,
                "actual": actual,
                "predicted": predicted,
                "date_column_used": date_column,
                "years_used": {"year1": year_first, "year2": year_last},
                "y_variable_used": y_variable,
                "observed": {
                    "year1_mean": float(y_first_mean),
                    "year2_mean": float(y_last_mean),
                    "delta_y": observed_delta,
                    "yoy_percentage": yoy_percentage
                },
                "explanation": {
                    "explained_delta_yhat": float(explained_delta),
                    "residual": residual,
                    "contributions": contributions
                },
                "waterfall": {
                    "labels": waterfall_labels,
                    "values": waterfall_values
                },
                "model_info": {
                    "intercept": intercept,
                    "coefficients": coefficients,
                    "x_variables": x_variables,
                    "y_variable": y_variable
                }
            }
        except Exception as e:
            logger.error(f"❌ Error calculating YoY: {str(e)}")
            import traceback
            logger.error(f"❌ Traceback: {traceback.format_exc()}")
            raise
        finally:
            # Close the MongoDB client for this event loop
            loop_client.close()
    
    # Run async function
    return asyncio.run(_calculate())


def _ensemble_models(file_key: str, combination_id: str) -> List[ModelRecord]:
    return _models_for_file(file_key, combination_id)


def get_ensemble_actual_vs_predicted(file_key: str, combination_id: str, client_name: str, app_name: str, project_name: str) -> Dict[str, Any]:
    """Calculate actual vs predicted values using ensemble weighted metrics and source file data"""
    async def _calculate():
        if client is None or db is None:
            raise ValueError("MongoDB connection is not available")
        
        if not minio_client:
            raise ValueError("MinIO connection is not available")

        document_id = f"{client_name}/{app_name}/{project_name}"
        build_config = await db["build-model_featurebased_configs"].find_one({"_id": document_id})
        
        if not build_config:
            raise ValueError(f"No build configuration found for {document_id}")

        combination_file_keys = build_config.get("combination_file_keys", [])
        source_file_key = None
        for combo_info in combination_file_keys:
            if combo_info.get("combination") == combination_id:
                source_file_key = combo_info.get("file_key")
                break
        
        if not source_file_key:
            raise ValueError(f"No source file key found for combination '{combination_id}'")
        
        # Get weighted ensemble data
        ensemble_request = {
            "file_key": file_key,
            "grouping_keys": ['combination_id'],
            "filter_criteria": {"combination_id": combination_id},
            "include_numeric": None,
            "exclude_numeric": None,
            "filtered_models": None
        }
        
        ensemble_result = calculate_weighted_ensemble(ensemble_request)
        
        if not ensemble_result.get("results") or len(ensemble_result["results"]) == 0:
            raise ValueError("No ensemble data found for the given combination")
        
        ensemble_data = ensemble_result["results"][0]
        weighted_metrics = ensemble_data.get("weighted", {})
        
        # Get weighted transformation metadata
        from .ensemble_metric_calculation import calculate_weighted_transformation_metadata
        
        # Create a mock ensemble_data object for the transformation metadata function
        class MockEnsembleData:
            def __init__(self, weighted, model_composition):
                self.weighted = weighted
                self.model_composition = model_composition
        
        mock_ensemble = MockEnsembleData(weighted_metrics, ensemble_data.get("model_composition", {}))
        
        logger.info(f"🔍 Calculating weighted transformation metadata for ensemble...")
        transformation_metadata = await calculate_weighted_transformation_metadata(
            db, client_name, app_name, project_name, combination_id, mock_ensemble
        )
        logger.info(f"✅ Weighted transformation metadata calculated: {len(transformation_metadata)} variables")
        
        # Import apply_transformation_steps from s_curve.py
        try:
            from .s_curve import apply_transformation_steps
        except ImportError:
            apply_transformation_steps = None
        
        # Get the source file data
        response = minio_client.get_object(MINIO_BUCKET, source_file_key)
        content = response.read()
        response.close()
        response.release_conn()
        
        # Read file based on extension
        if source_file_key.lower().endswith('.parquet'):
            df = pd.read_parquet(io.BytesIO(content))
        elif source_file_key.lower().endswith(('.arrow', '.feather')):
            df = pd.read_feather(io.BytesIO(content))
        else:
            try:
                df = pd.read_parquet(io.BytesIO(content))
            except:
                df = pd.read_feather(io.BytesIO(content))
        
        # Filter data for the specific combination
        if "combination_id" in df.columns:
            df = df[df["combination_id"] == combination_id]
        
        if df.empty:
            raise ValueError(f"No data found for combination {combination_id}")
        
        df.columns = df.columns.str.lower()
        
        # Find date column
        date_column = None
        for col in df.columns:
            if col.lower() in ['date', 'time', 'timestamp', 'period', 'month', 'year']:
                date_column = col
                break
        
        # Get dates if available
        dates = []
        if date_column and date_column in df.columns:
            dates = df[date_column].tolist()
        else:
            dates = [f"Period {i+1}" for i in range(len(df))]
        
        # Get the target variable (Y variable)
        y_variable = None
        for col in df.columns:
            if col.lower() in ['target', 'y', 'dependent', 'sales', 'volume', 'value']:
                y_variable = col
                break
        
        if not y_variable:
            numeric_cols = df.select_dtypes(include=[np.number]).columns.tolist()
            if numeric_cols:
                y_variable = numeric_cols[0]
        
        if not y_variable:
            raise ValueError("Could not identify target variable")
        
        # Get ensemble intercept and betas
        intercept = weighted_metrics.get("intercept", 0)
        
        # Calculate predicted values using ensemble betas
        actual_values = df[y_variable].tolist()
        predicted_values = []
        
        # Check if transformations are available
        has_transformations = transformation_metadata and len(transformation_metadata) > 0 and apply_transformation_steps
        
        for index, row in df.iterrows():
            predicted_value = intercept
            
            # Add contribution from each variable using ensemble betas
            for col in df.columns:
                if col != y_variable:
                    beta_key = f"{col}_beta"
                    if beta_key in weighted_metrics:
                        x_value = row[col] if pd.notna(row[col]) else 0
                        
                        # Apply transformations if available
                        if has_transformations and col in transformation_metadata:
                            transformation_steps = transformation_metadata[col].get('transformation_steps', [])
                            if transformation_steps:
                                try:
                                    transformed_result = apply_transformation_steps([x_value], transformation_steps)
                                    if transformed_result and len(transformed_result) > 0:
                                        x_value = transformed_result[0]
                                except (IndexError, TypeError, ValueError) as e:
                                    logger.warning(f"Transformation failed for {col}: {e}, using original value")
                        
                        beta_value = weighted_metrics[beta_key]
                        contribution = beta_value * x_value
                        predicted_value += contribution
            
            predicted_values.append(predicted_value)
        
        # Filter out extreme outliers
        if len(predicted_values) > 0 and len(actual_values) > 0:
            predicted_array = np.array(predicted_values)
            actual_array = np.array(actual_values)
            
            if len(predicted_array) > 0 and len(actual_array) > 0:
                try:
                    pred_99th = np.percentile(predicted_array, 99)
                    pred_1st = np.percentile(predicted_array, 1)
                    actual_99th = np.percentile(actual_array, 99)
                    actual_1st = np.percentile(actual_array, 1)
                except (ValueError, IndexError) as e:
                    logger.warning(f"Error calculating percentiles: {e}, skipping outlier filtering")
                    pred_99th = pred_1st = actual_99th = actual_1st = None
            else:
                pred_99th = pred_1st = actual_99th = actual_1st = None
            
            filtered_data = []
            if pred_99th is not None and pred_1st is not None and actual_99th is not None and actual_1st is not None:
                for i, (actual, predicted) in enumerate(zip(actual_values, predicted_values)):
                    if (predicted <= pred_99th and predicted >= pred_1st and 
                        actual <= actual_99th and actual >= actual_1st):
                        filtered_data.append((actual, predicted))
            else:
                filtered_data = [(a, p) for a, p in zip(actual_values, predicted_values)]
            
            if filtered_data and len(filtered_data) > 0:
                if len(filtered_data) < len(actual_values):
                    logger.warning(f"⚠️ Filtered out {len(actual_values) - len(filtered_data)} extreme outliers")
                actual_values = [item[0] for item in filtered_data]
                predicted_values = [item[1] for item in filtered_data]
                if len(dates) > len(actual_values):
                    dates = dates[:len(actual_values)]
                elif len(dates) < len(actual_values):
                    dates.extend([f"Period {i+1}" for i in range(len(dates), len(actual_values))])
        
        # Calculate performance metrics
        if len(actual_values) > 0 and len(predicted_values) > 0:
            from sklearn.metrics import mean_absolute_error, mean_squared_error, r2_score
            
            mae = mean_absolute_error(actual_values, predicted_values)
            mse = mean_squared_error(actual_values, predicted_values)
            rmse = mse ** 0.5
            r2 = r2_score(actual_values, predicted_values)
            
            mape = 0
            if sum(actual_values) != 0:
                mape = (sum(abs((actual - pred) / actual) for actual, pred in zip(actual_values, predicted_values) if actual != 0) / len(actual_values)) * 100
        else:
            mae = mse = rmse = r2 = mape = 0
        
        # Extract x_variables from weighted_metrics
        x_variables = [key.replace('_beta', '') for key in weighted_metrics.keys() if key.endswith('_beta')]

    return {
        "success": True,
            "combination_name": combination_id,
            "model_name": "Ensemble",
            "file_key": source_file_key,
        "dates": dates,
            "actual_values": actual_values,
            "predicted_values": predicted_values,
            "performance_metrics": {
                "mae": mae,
                "mse": mse,
                "rmse": rmse,
                "r2": r2,
                "mape": mape
            },
            "model_info": {
                "intercept": intercept,
                "coefficients": weighted_metrics,
                "x_variables": x_variables,
                "y_variable": y_variable
            },
            "data_points": len(actual_values)
        }
    
    # Run async function
    try:
        loop = asyncio.get_event_loop()
    except RuntimeError:
        loop = asyncio.new_event_loop()
        asyncio.set_event_loop(loop)
    
    return loop.run_until_complete(_calculate())


def get_ensemble_contribution(file_key: str, combination_id: str, client_name: str, app_name: str, project_name: str) -> Dict[str, Any]:
    """Get contribution data for ensemble using weighted ensemble metrics"""
    # Get weighted ensemble data
    ensemble_request = {
        "file_key": file_key,
        "grouping_keys": ['combination_id'],
        "filter_criteria": {"combination_id": combination_id},
        "include_numeric": None,
        "exclude_numeric": None,
        "filtered_models": None
    }
    
    ensemble_result = calculate_weighted_ensemble(ensemble_request)
    
    if not ensemble_result.get("results") or len(ensemble_result["results"]) == 0:
        raise ValueError("No ensemble data found for the given combination")
    
    ensemble_data = ensemble_result["results"][0]
    weighted_metrics = ensemble_data.get("weighted", {})
    
    # Extract contribution data from ensemble weighted metrics
    contribution_data = []
    
    # First, try to find contribution columns
    for key in weighted_metrics.keys():
        if key.endswith('_contribution'):
            variable_name = key.replace('_contribution', '').replace('_Contribution', '')
            value = weighted_metrics[key]
            if value is not None:
                contribution_data.append({
                    "name": variable_name,
                    "value": float(value)
                })
    
    # If no contribution data found, try to calculate from betas and means
    if not contribution_data:
        intercept = weighted_metrics.get("intercept", 0)
        
        for key in weighted_metrics.keys():
            if key.endswith('_beta'):
                variable_name = key.replace('_beta', '').replace('_Beta', '')
                beta_value = weighted_metrics[key]
                
                # Try to find corresponding mean value
                mean_key = f"{variable_name}_avg"
                if mean_key in weighted_metrics:
                    mean_value = weighted_metrics[mean_key]
                    if beta_value is not None and mean_value is not None:
                        # Calculate contribution: abs(beta * mean)
                        contribution_value = abs(float(beta_value) * float(mean_value))
                        contribution_data.append({
                            "name": variable_name,
                            "value": contribution_value
                        })
    
    # If still no data, try using elasticities
    if not contribution_data:
        for key in weighted_metrics.keys():
            if key.endswith('_elasticity'):
                variable_name = key.replace('_elasticity', '').replace('_Elasticity', '')
                elasticity_value = weighted_metrics[key]
                
                if elasticity_value is not None:
                    # Use absolute elasticity as contribution
                    contribution_value = abs(float(elasticity_value))
                    contribution_data.append({
                        "name": variable_name,
                        "value": contribution_value
                    })
    
    if not contribution_data:
        logger.error("No contribution data could be calculated from ensemble results")
        raise ValueError("No valid contribution data found in ensemble results")
    
    return {
        "file_key": file_key,
        "combination_id": combination_id,
        "model_name": "Ensemble",
        "contribution_data": contribution_data
    }


def get_ensemble_yoy(file_key: str, combination_id: str, client_name: str, app_name: str, project_name: str) -> Dict[str, Any]:
    """Calculate Year-over-Year (YoY) growth using ensemble weighted metrics and source file data"""
    async def _calculate():
        if client is None or db is None:
            raise ValueError("MongoDB connection is not available")
        
        if not minio_client:
            raise ValueError("MinIO connection is not available")
        
        # Get the build configuration from MongoDB
        document_id = f"{client_name}/{app_name}/{project_name}"
        build_config = await db["build-model_featurebased_configs"].find_one({"_id": document_id})
        
        if not build_config:
            raise ValueError(f"No build configuration found for {document_id}")
        
        # Get the source file key for this combination
        combination_file_keys = build_config.get("combination_file_keys", [])
        source_file_key = None
        for combo_info in combination_file_keys:
            if combo_info.get("combination") == combination_id:
                source_file_key = combo_info.get("file_key")
                break
        
        if not source_file_key:
            raise ValueError(f"No source file key found for combination '{combination_id}'")
        
        # Get weighted ensemble data
        ensemble_request = {
            "file_key": file_key,
            "grouping_keys": ['combination_id'],
            "filter_criteria": {"combination_id": combination_id},
            "include_numeric": None,
            "exclude_numeric": None,
            "filtered_models": None
        }
        
        ensemble_result = calculate_weighted_ensemble(ensemble_request)
        
        if not ensemble_result.get("results") or len(ensemble_result["results"]) == 0:
            raise ValueError("No ensemble data found for the given combination")
        
        ensemble_data = ensemble_result["results"][0]
        weighted_metrics = ensemble_data.get("weighted", {})
        
        # Get weighted transformation metadata
        from .ensemble_metric_calculation import calculate_weighted_transformation_metadata
        
        class MockEnsembleData:
            def __init__(self, weighted, model_composition):
                self.weighted = weighted
                self.model_composition = model_composition
        
        mock_ensemble = MockEnsembleData(weighted_metrics, ensemble_data.get("model_composition", {}))
        
        logger.info(f"🔍 Calculating weighted transformation metadata for ensemble YoY...")
        transformation_metadata = await calculate_weighted_transformation_metadata(
            db, client_name, app_name, project_name, combination_id, mock_ensemble
        )
        logger.info(f"✅ Weighted transformation metadata calculated: {len(transformation_metadata)} variables")
        
        # Import apply_transformation_steps from s_curve.py
        try:
            from .s_curve import apply_transformation_steps
        except ImportError:
            apply_transformation_steps = None
        
        # Get the source file data
        response = minio_client.get_object(MINIO_BUCKET, source_file_key)
        content = response.read()
        response.close()
        response.release_conn()
        
        # Read file based on extension
        if source_file_key.lower().endswith('.parquet'):
            df = pd.read_parquet(io.BytesIO(content))
        elif source_file_key.lower().endswith(('.arrow', '.feather')):
            df = pd.read_feather(io.BytesIO(content))
        else:
            try:
                df = pd.read_parquet(io.BytesIO(content))
            except:
                df = pd.read_feather(io.BytesIO(content))
        
        # Filter data for the specific combination
        if "combination_id" in df.columns:
            df = df[df["combination_id"] == combination_id]
        
        if df.empty:
            raise ValueError(f"No data found for combination {combination_id}")
        
        df.columns = df.columns.str.lower()
        
        # Get ensemble intercept and betas
        intercept = weighted_metrics.get("intercept", 0)
        
        # Detect date column
        date_column = None
        date_columns = ["Date", "date", "Invoice_Date", "Bill_Date", "Order_Date", "Month", "month", "Period", "period", "Year", "year"]
        for col in date_columns:
            if col in df.columns:
                date_column = col
                break
        
        if not date_column:
            raise ValueError("Could not detect date column. Please ensure a date column is present.")
        
        # Convert date column to datetime
        df[date_column] = pd.to_datetime(df[date_column], errors='coerce')
        df = df.dropna(subset=[date_column])
        
        if df.empty:
            raise ValueError("No valid date data found after conversion.")
        
        # Get unique years and ensure we have at least 2 years
        years = sorted(df[date_column].dt.year.unique())
        if len(years) < 2:
            raise ValueError("Need at least two calendar years in the dataset for YoY calculation.")
        
        year_first, year_last = int(years[0]), int(years[-1])
        
        # Split data by years
        df_first_year = df[df[date_column].dt.year == year_first]
        df_last_year = df[df[date_column].dt.year == year_last]
        
        if df_first_year.empty or df_last_year.empty:
            raise ValueError(f"No data found for year {year_first} or {year_last}.")
        
        y_variable = None
        for col in df.columns:
            if col.lower() in ['target', 'y', 'dependent', 'sales', 'volume', 'value']:
                y_variable = col
                break
        
        if not y_variable:
            numeric_cols = df.select_dtypes(include=[np.number]).columns.tolist()
            if numeric_cols:
                y_variable = numeric_cols[0]
        
        if not y_variable:
            raise ValueError("Could not identify target variable")
        
        # Calculate actual YoY change
        y_first_mean = df_first_year[y_variable].mean() if y_variable in df_first_year.columns else 0
        y_last_mean = df_last_year[y_variable].mean() if y_variable in df_last_year.columns else 0
        observed_delta = float(y_last_mean - y_first_mean)
        
        # Calculate explained YoY change using ensemble coefficients
        explained_delta = 0.0
        contributions = []
        
        # Check if transformations are available
        has_transformations = transformation_metadata and len(transformation_metadata) > 0 and apply_transformation_steps
        
        # Get all variables that have betas in the ensemble results
        for key in weighted_metrics.keys():
            if key.endswith('_beta'):
                x_var = key.replace('_beta', '')
                if x_var in df.columns:
                    beta_value = weighted_metrics[key]
                    
                    # Calculate mean values for each year
                    x_first_mean = df_first_year[x_var].mean()
                    x_last_mean = df_last_year[x_var].mean()
                    
                    # Apply transformations if available
                    if has_transformations and x_var in transformation_metadata:
                        transformation_steps = transformation_metadata[x_var].get('transformation_steps', [])
                        if transformation_steps:
                            try:
                                transformed_first = apply_transformation_steps([x_first_mean], transformation_steps)
                                if transformed_first and len(transformed_first) > 0:
                                    x_first_mean = transformed_first[0]
                            except (IndexError, TypeError, ValueError) as e:
                                logger.warning(f"Transformation failed for {x_var} (first year): {e}, using original value")
                            
                            try:
                                transformed_last = apply_transformation_steps([x_last_mean], transformation_steps)
                                if transformed_last and len(transformed_last) > 0:
                                    x_last_mean = transformed_last[0]
                            except (IndexError, TypeError, ValueError) as e:
                                logger.warning(f"Transformation failed for {x_var} (last year): {e}, using original value")
                    
                    # Calculate contribution: beta * (mean_last_year - mean_first_year)
                    delta_contribution = beta_value * (x_last_mean - x_first_mean)
                    explained_delta += delta_contribution
                    
                    contributions.append({
                        "variable": x_var,
                        "beta_coefficient": beta_value,
                        "mean_year1": float(x_first_mean),
                        "mean_year2": float(x_last_mean),
                        "delta_contribution": float(delta_contribution)
                    })
        
        # Sort contributions by absolute value
        contributions.sort(key=lambda x: abs(x["delta_contribution"]), reverse=True)
        
        # Calculate residual
        residual = float(observed_delta - explained_delta)
        
        # Calculate YoY percentage change
        yoy_percentage = 0.0
        if y_first_mean != 0:
            yoy_percentage = (observed_delta / y_first_mean) * 100
        
        # Create waterfall data for visualization
        waterfall_labels = [f"Base {year_first}"] + [c["variable"] for c in contributions] + ["Residual", f"Final {year_last}"]
        waterfall_values = [y_first_mean] + [c["delta_contribution"] for c in contributions] + [residual, y_last_mean]
        
        # For backward compatibility, return empty arrays (waterfall chart uses waterfall data instead)
        dates = []
        actual = []
        predicted = []
        
        # Extract x_variables from weighted_metrics
        x_variables = [key.replace('_beta', '') for key in weighted_metrics.keys() if key.endswith('_beta')]

        return {
            "success": True,
            "combination_name": combination_id,
            "model_name": "Ensemble",
            "file_key": source_file_key,
            "dates": dates,
            "actual": actual,
            "predicted": predicted,
            "date_column_used": date_column,
            "years_used": {"year1": year_first, "year2": year_last},
            "y_variable_used": y_variable,
            "observed": {
                "year1_mean": float(y_first_mean),
                "year2_mean": float(y_last_mean),
                "delta_y": observed_delta,
                "yoy_percentage": yoy_percentage
            },
            "explanation": {
                "explained_delta_yhat": float(explained_delta),
                "residual": residual,
                "contributions": contributions
            },
            "waterfall": {
                "labels": waterfall_labels,
                "values": waterfall_values
            },
            "model_info": {
                "intercept": intercept,
                "coefficients": weighted_metrics,
                "x_variables": x_variables,
                "y_variable": y_variable
            }
        }
    
    # Run async function
    try:
        loop = asyncio.get_event_loop()
    except RuntimeError:
        loop = asyncio.new_event_loop()
        asyncio.set_event_loop(loop)
    
    return loop.run_until_complete(_calculate())


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







def get_application_type(client_name: str, app_name: str, project_name: str) -> Dict[str, Any]:
    """Get the application type for a specific project from MongoDB build configuration."""
    async def _get():
        if db is None:
            raise ValueError("MongoDB connection is not available")
        
        # Get the build configuration document
        document_id = f"{client_name}/{app_name}/{project_name}"
        build_config = await db["build-model_featurebased_configs"].find_one({"_id": document_id})
        
        if not build_config:
            logger.warning(f"No build configuration found for {document_id}, defaulting to 'general'")
            application_type = "general"
        else:
            # Extract application type from build config
            application_type = build_config.get("application_type", "general")
            logger.info(f"Application type from build config for {document_id}: {application_type}")
        
        return {
            "client_name": client_name,
            "app_name": app_name,
            "project_name": project_name,
            "application_type": application_type,
            "is_mmm": application_type == "mmm",
        }
    
    # Run async function
    try:
        loop = asyncio.get_event_loop()
    except RuntimeError:
        loop = asyncio.new_event_loop()
        asyncio.set_event_loop(loop)
    
    return loop.run_until_complete(_get())


def generate_s_curve(payload: Dict[str, Any]) -> Dict[str, Any]:
    """Generate S-curve data for media variables with ROI calculations."""
    from .s_curve import get_s_curve_endpoint
    
    # Extract parameters from payload
    client_name = payload.get("client_name")
    app_name = payload.get("app_name")
    project_name = payload.get("project_name")
    combination_name = payload.get("combination_name")
    model_name = payload.get("model_name")
    
    if not all([client_name, app_name, project_name, combination_name, model_name]):
        raise ValueError("Missing required parameters: client_name, app_name, project_name, combination_name, model_name")
    
    # Use asyncio to run async function
    async def _generate():
        # Create a new MongoDB client for this event loop to avoid "attached to different loop" errors
        # Use the same MONGO_URI and MONGO_DB from database.py to ensure proper authentication
        from motor.motor_asyncio import AsyncIOMotorClient
        from .database import MONGO_URI, MONGO_DB, MINIO_ENDPOINT, MINIO_ACCESS_KEY, MINIO_SECRET_KEY, MINIO_SECURE, MINIO_BUCKET
        from minio import Minio
        
        # Create a new MongoDB client for this event loop with proper authentication
        loop_client = AsyncIOMotorClient(
            MONGO_URI,
            serverSelectionTimeoutMS=5000,
            connectTimeoutMS=5000,
            socketTimeoutMS=5000,
            maxPoolSize=10,
            minPoolSize=1
        )
        loop_db = loop_client[MONGO_DB]
        
        # Create a new MinIO client (MinIO is synchronous, but create fresh instance for consistency)
        loop_minio_client = Minio(
            MINIO_ENDPOINT,
            access_key=MINIO_ACCESS_KEY,
            secret_key=MINIO_SECRET_KEY,
            secure=MINIO_SECURE
        )
        
        try:
            return await get_s_curve_endpoint(
                client_name=client_name,
                app_name=app_name,
                project_name=project_name,
                combination_name=combination_name,
                model_name=model_name,
                db=loop_db,
                minio_client=loop_minio_client,
                MINIO_BUCKET=MINIO_BUCKET
            )
        finally:
            # Close the MongoDB client
            loop_client.close()
    
    try:
        loop = asyncio.get_event_loop()
    except RuntimeError:
        loop = asyncio.new_event_loop()
        asyncio.set_event_loop(loop)
    
    return loop.run_until_complete(_generate())


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
