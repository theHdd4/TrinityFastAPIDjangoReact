"""Service helpers for the select_models_feature_based feature."""

from __future__ import annotations

import logging
import math
import statistics
from pathlib import PurePosixPath
from dataclasses import dataclass
from datetime import datetime
from itertools import count
from typing import Any, Dict, Iterable, List, Sequence

from minio.error import S3Error
from pydantic import BaseModel, Field

from .database import MINIO_BUCKET, minio_client


logger = logging.getLogger("app.features.select_models_feature_based.service")


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
    metrics: Dict[str, float]
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


MODEL_DATA: List[ModelRecord] = [
    ModelRecord(
        file_key="demo/results/feature-based.parquet",
        combination_id="combo-retail",
        combination={"Channel": "Retail", "Brand": "Trinity", "PPG": "Premium"},
        model_name="RetailBaseline",
        metrics={
            "mape_train": 0.07,
            "mape_test": 0.09,
            "r2_train": 0.93,
            "r2_test": 0.9,
            "aic": 124.5,
            "bic": 142.1,
            "self_elasticity": -1.18,
            "self_beta": -0.82,
            "self_avg": -1.01,
            "self_roi": 1.48,
        },
        variable_impacts={"price": -1.18, "promo": 0.42, "season": 0.26},
        variable_averages={"price": 12.4, "promo": 0.35, "season": 0.5},
        price_variable="price",
        base_price=12.4,
        base_volume=980.0,
        rpi_competitors={"Competitor A": 11.8, "Competitor B": 12.9},
        series=ModelSeries(
            dates=[f"2023-{month:02d}-01" for month in range(1, 13)],
            actual=[
                915.0,
                920.0,
                932.0,
                941.0,
                955.0,
                962.0,
                978.0,
                981.0,
                995.0,
                1001.0,
                1008.0,
                1015.0,
            ],
            predicted=[
                910.0,
                924.0,
                934.0,
                939.0,
                951.0,
                963.0,
                976.0,
                980.0,
                994.0,
                999.0,
                1006.0,
                1012.0,
            ],
        ),
    ),
    ModelRecord(
        file_key="demo/results/feature-based.parquet",
        combination_id="combo-retail",
        combination={"Channel": "Retail", "Brand": "Trinity", "PPG": "Premium"},
        model_name="RetailPromotionFocus",
        metrics={
            "mape_train": 0.09,
            "mape_test": 0.11,
            "r2_train": 0.91,
            "r2_test": 0.88,
            "aic": 131.2,
            "bic": 148.0,
            "self_elasticity": -0.94,
            "self_beta": -0.68,
            "self_avg": -0.87,
            "self_roi": 1.32,
        },
        variable_impacts={"price": -0.94, "promo": 0.56, "season": 0.31},
        variable_averages={"price": 12.4, "promo": 0.35, "season": 0.5},
        price_variable="price",
        base_price=12.4,
        base_volume=980.0,
        rpi_competitors={"Competitor A": 11.8, "Competitor B": 12.9},
        series=ModelSeries(
            dates=[f"2023-{month:02d}-01" for month in range(1, 13)],
            actual=[
                914.0,
                921.0,
                930.0,
                938.0,
                949.0,
                963.0,
                975.0,
                980.0,
                994.0,
                1000.0,
                1009.0,
                1011.0,
            ],
            predicted=[
                912.0,
                919.0,
                929.0,
                940.0,
                952.0,
                964.0,
                975.0,
                982.0,
                995.0,
                1003.0,
                1007.0,
                1013.0,
            ],
        ),
    ),
    ModelRecord(
        file_key="demo/results/feature-based.parquet",
        combination_id="combo-online",
        combination={"Channel": "Online", "Brand": "Trinity", "PPG": "Value"},
        model_name="OnlineSeasonalBlend",
        metrics={
            "mape_train": 0.06,
            "mape_test": 0.085,
            "r2_train": 0.94,
            "r2_test": 0.91,
            "aic": 117.7,
            "bic": 135.4,
            "self_elasticity": -1.32,
            "self_beta": -0.91,
            "self_avg": -1.11,
            "self_roi": 1.55,
        },
        variable_impacts={"price": -1.32, "promo": 0.38, "season": 0.45},
        variable_averages={"price": 9.8, "promo": 0.28, "season": 0.6},
        price_variable="price",
        base_price=9.8,
        base_volume=1240.0,
        rpi_competitors={"Competitor A": 9.4, "Competitor C": 10.1},
        series=ModelSeries(
            dates=[f"2023-{month:02d}-01" for month in range(1, 13)],
            actual=[
                1205.0,
                1210.0,
                1218.0,
                1222.0,
                1236.0,
                1245.0,
                1250.0,
                1255.0,
                1262.0,
                1269.0,
                1278.0,
                1284.0,
            ],
            predicted=[
                1200.0,
                1208.0,
                1215.0,
                1220.0,
                1234.0,
                1241.0,
                1249.0,
                1254.0,
                1261.0,
                1268.0,
                1274.0,
                1280.0,
            ],
        ),
    ),
]


SAVED_MODELS: Dict[str, Dict[str, Any]] = {}
_saved_counter = count(1)


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
    combination_name: str
    model_name: str


def _normalise_file_key(file_key: str) -> str:
    return file_key.strip().lstrip("/")


def _file_key_tokens(file_key: str) -> set[str]:
    """Return a set of match tokens for the provided object path.

    We normalise the incoming MinIO object name and create multiple variants so
    that deterministic demo data (``demo/results/feature-based.parquet``)
    continues to work even when the UI now supplies Arrow artefacts from the
    ``model-results`` directory.
    """

    if not file_key:
        return set()

    normalised = _normalise_file_key(file_key)
    path = PurePosixPath(normalised)

    tokens = {normalised, path.name}
    if path.stem:
        tokens.add(path.stem)
    return {token.lower() for token in tokens if token}


def _models_for_file(file_key: str, combination_id: str | None = None) -> List[ModelRecord]:
    target_tokens = _file_key_tokens(file_key)
    if not target_tokens:
        models = list(MODEL_DATA)
    else:
        models = [
            record
            for record in MODEL_DATA
            if target_tokens & _file_key_tokens(record.file_key)
        ]
    if combination_id and combination_id != "all":
        models = [record for record in models if record.combination_id == combination_id]
    if not models:
        raise ValueError(f"No models available for file '{file_key}'")
    return models


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
    models = _models_for_file(file_key)
    combo_ids = sorted({record.combination_id for record in models})
    return {
        "file_key": file_key,
        "unique_combination_ids": combo_ids,
        "total_combinations": len(combo_ids),
    }


def list_variables(file_key: str, mode: str | None = None) -> Dict[str, Any]:
    models = _models_for_file(file_key)
    variables = sorted({var for record in models for var in record.variable_impacts})
    if mode == "base":
        variables = [var for var in variables if not var.endswith("_beta")]
    return {
        "file_key": file_key,
        "variables": variables,
        "total_variables": len(variables),
    }


def _collect_metric_values(models: Iterable[ModelRecord], key: str) -> List[float]:
    values = [record.metrics.get(key) for record in models]
    return [value for value in values if value is not None]


def get_filter_options(file_key: str, combination_id: str | None, variable: str) -> Dict[str, Any]:
    models = _models_for_file(file_key, combination_id)
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
    models = _models_for_file(file_key, combination_id)
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
    }


def get_saved_combinations_status(file_key: str, atom_id: str) -> Dict[str, Any]:
    models = _models_for_file(file_key)
    combos = sorted({record.combination_id for record in models})
    saved_for_file = [
        details
        for details in SAVED_MODELS.values()
        if details["file_key"] == file_key
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
        "note": "Demo data – persisted in memory only",
    }


def save_model(payload: Dict[str, Any]) -> Dict[str, Any]:
    request = GenericSavePayload(**payload)
    combination_id = request.filter_criteria.get("combination_id")
    models = _models_for_file(request.file_key, combination_id)
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
        "file_key": record.file_key,
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
    request = CurveRequestPayload(**payload)
    models = _models_for_file("demo/results/feature-based.parquet", request.combination_name)
    record = next((model for model in models if model.model_name == request.model_name), None)
    if record is None:
        raise ValueError("Requested model not found")
    return _actual_vs_predicted_payload(record)


def _compute_year_over_year(series: Sequence[float]) -> List[float]:
    yoy: List[float] = []
    for index in range(12):
        previous = series[index - 1] if index > 0 else series[index]
        current = series[index]
        change = ((current - previous) / previous) * 100 if previous else 0
        yoy.append(round(change, 3))
    return yoy


def calculate_yoy(payload: Dict[str, Any]) -> Dict[str, Any]:
    request = CurveRequestPayload(**payload)
    models = _models_for_file("demo/results/feature-based.parquet", request.combination_name)
    record = next((model for model in models if model.model_name == request.model_name), None)
    if record is None:
        raise ValueError("Requested model not found")

    actual_yoy = _compute_year_over_year(record.series.actual)
    predicted_yoy = _compute_year_over_year(record.series.predicted)

    return {
        "success": True,
        "dates": list(record.series.dates),
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
    mae = statistics.fmean(abs(residual) for residual in residuals)
    rmse = math.sqrt(statistics.fmean(residual ** 2 for residual in residuals))

    return {
        "success": True,
        "actual_values": actual,
        "predicted_values": predicted,
        "dates": dates,
        "rmse": round(rmse, 3),
        "mae": round(mae, 3),
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


def generate_s_curve(payload: Dict[str, Any]) -> Dict[str, Any]:
    request = CurveRequestPayload(**payload)
    models = _models_for_file("demo/results/feature-based.parquet", request.combination_name)
    record = next((model for model in models if model.model_name == request.model_name), None)
    if record is None:
        raise ValueError("Requested model not found")

    prices = [round(record.base_price * (0.8 + 0.05 * index), 2) for index in range(9)]
    curve_data = []
    elasticity = record.metrics.get("self_elasticity", -1.0)
    for price in prices:
        demand = record.base_volume * (price / record.base_price) ** elasticity
        revenue = demand * price
        curve_data.append(
            {
                "price": round(price, 2),
                "demand": round(demand, 2),
                "revenue": round(revenue, 2),
                "elasticity": round(elasticity, 3),
            }
        )

    optimal = max(curve_data, key=lambda item: item["revenue"])

    return {
        "selection": {
            "method": "model_name",
            "model_name": request.model_name,
            "filters": {"combination_id": request.combination_name},
        },
        "price_variable": record.price_variable,
        "intercept": record.metrics.get("self_beta", -0.8),
        "base_price": record.base_price,
        "base_volume": record.base_volume,
        "base_revenue": record.base_revenue,
        "elasticity_at_base": record.metrics.get("self_elasticity"),
        "rpi_competitor_prices": record.rpi_competitors,
        "quality": {
            "mape_test": record.metrics.get("mape_test"),
            "r2_test": record.metrics.get("r2_test"),
            "best_model": record.model_name,
        },
        "curve_data": curve_data,
        "optimal_revenue": optimal,
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
