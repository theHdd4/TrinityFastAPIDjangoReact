"""Service helpers for the build_autoregressive feature.

These helpers provide lightweight, deterministic implementations so that the
FastAPI layer can offload heavy work to Celery using
``celery_task_client.submit_callable``.  The real project integrates with
external data stores such as MinIO and MongoDB; for the refactor we
intentionally keep the business logic side-effect free and in-memory so the
API surface stays responsive while still returning useful, structured data for
the frontend.
"""

from __future__ import annotations

import calendar
import hashlib
from datetime import date, datetime, timedelta
from typing import Any, Dict, Iterable, List, Optional
from uuid import uuid4

from .schemas import (
    AutoregressiveTrainingResponse,
    DetectFrequencyRequest,
    GrowthRequest,
    SavedCombinationStatusResponse,
    SaveCombinationRequest,
    TrainAutoregressiveRequest,
)

# Default model list used when the client does not provide an explicit
# selection.  The names line up with the legacy implementation so the
# frontend can keep its existing presentation logic.
DEFAULT_MODELS = ["ARIMA", "ETS", "Prophet", "Holt-Winters"]


class _ScopeState(dict):
    """Internal helper that tracks save state for a given scope."""

    saved: set
    pending: set
    combinations: set


# Training runs and scope state are kept in memory – the data is deterministic
# so results remain stable across process restarts when Celery runs eagerly.
TRAINING_RUNS: Dict[str, Dict[str, Any]] = {}
RUN_HISTORY: List[str] = []
SCOPE_STATE: Dict[str, _ScopeState] = {}


def _seeded_random(*components: str) -> float:
    """Return a deterministic pseudo random number in the 0-1 range."""

    key = "::".join(components)
    digest = hashlib.sha256(key.encode("utf-8")).hexdigest()
    # Use 12 hex chars (~48 bits) for reasonably unique sampling.
    value = int(digest[:12], 16)
    return (value % 10_000_000) / 10_000_000


def _seeded_choice(options: Iterable[Any], *, key: str) -> Any:
    items = list(options)
    if not items:
        raise ValueError("Seeded choice requires at least one option")
    index = int(_seeded_random(key) * len(items)) % len(items)
    return items[index]


def _add_period(base: date, frequency: str) -> date:
    if frequency == "D":
        return base + timedelta(days=1)
    if frequency == "W":
        return base + timedelta(weeks=1)
    if frequency == "Q":
        return _add_months(base, 3)
    if frequency == "Y":
        return _add_months(base, 12)
    # Default to monthly for unknown values
    return _add_months(base, 1)


def _add_months(base: date, months: int) -> date:
    month = base.month - 1 + months
    year = base.year + month // 12
    month = month % 12 + 1
    day = min(base.day, calendar.monthrange(year, month)[1])
    return date(year, month, day)


def _time_axis(forecast_horizon: int, frequency: str, *, history: int = 18) -> Dict[str, List[str]]:
    today = date.today().replace(day=1)
    start = today
    for _ in range(history):
        start = _add_period(start, frequency)
    history_dates: List[str] = []
    current = start
    for _ in range(history):
        history_dates.append(current.isoformat())
        current = _add_period(current, frequency)
    forecast_dates: List[str] = []
    for _ in range(forecast_horizon):
        forecast_dates.append(current.isoformat())
        current = _add_period(current, frequency)
    return {"history": history_dates, "forecast": forecast_dates}


def _simulate_values(seed: str, *, count: int, base_value: float) -> List[float]:
    values: List[float] = []
    running = base_value
    for index in range(count):
        offset = (_seeded_random(seed, str(index)) - 0.5) * 8.0
        running = max(1.0, running + offset)
        values.append(round(running, 2))
    return values


def _model_metrics(seed: str) -> Dict[str, float]:
    return {
        "RMSE": round(1.5 + _seeded_random(seed, "rmse") * 4, 3),
        "MAE": round(1.0 + _seeded_random(seed, "mae") * 3, 3),
        "MAPE": round(2 + _seeded_random(seed, "mape") * 6, 2),
    }


def _model_parameters(seed: str) -> Dict[str, float]:
    return {
        "alpha": round(0.1 + _seeded_random(seed, "alpha") * 0.8, 3),
        "beta": round(0.1 + _seeded_random(seed, "beta") * 0.4, 3),
        "gamma": round(0.1 + _seeded_random(seed, "gamma") * 0.4, 3),
    }


def _update_scope_state(scope: str, combinations: Iterable[str]) -> None:
    state = SCOPE_STATE.setdefault(
        scope,
        _ScopeState(saved=set(), pending=set(), combinations=set()),
    )
    state["combinations"].update(combinations)
    state["pending"].update(combinations)


def validate_training_request(payload: Dict[str, Any]) -> Dict[str, Any]:
    request = TrainAutoregressiveRequest.model_validate(payload)
    missing: List[str] = []
    if not request.combinations:
        missing.append("combinations")
    if not request.y_variable:
        missing.append("y_variable")
    if missing:
        return {
            "status": "error",
            "detail": f"Missing required fields: {', '.join(missing)}",
        }
    return {
        "status": "success",
        "detail": "Request is valid",
        "summary": {
            "scope_number": request.scope_number,
            "combination_count": len(request.combinations),
            "models": request.models_to_run or DEFAULT_MODELS,
            "forecast_horizon": request.forecast_horizon,
        },
    }


def list_numeric_columns(scope: str, combination: str) -> Dict[str, Any]:
    base_columns = [
        "Sales",
        "Revenue",
        "Volume",
        "Demand",
        "Profit",
        "Units",
    ]
    chosen = sorted({
        base_columns[int(_seeded_random(scope, combination, str(i)) * len(base_columns)) % len(base_columns)]
        for i in range(4)
    })
    if not chosen:
        chosen = base_columns[:3]
    return {
        "scope": scope,
        "combination": combination,
        "numerical_columns": chosen,
        "categorical_columns": ["Channel", "Variant", "Brand"],
    }


def detect_frequency(payload: Dict[str, Any]) -> Dict[str, Any]:
    request = DetectFrequencyRequest.model_validate(payload)
    freq_key = f"{request.scope}:{request.combination}:{request.date_column or 'date'}"
    frequency = _seeded_choice(
        ["Monthly", "Quarterly", "Weekly", "Daily", "Yearly"],
        key=freq_key,
    )
    confidence = "high" if frequency in {"Monthly", "Weekly"} else "medium"
    return {
        "status": "success",
        "frequency": frequency,
        "confidence": confidence,
        "source": freq_key,
    }


def train_autoregressive_models(payload: Dict[str, Any]) -> Dict[str, Any]:
    request = TrainAutoregressiveRequest.model_validate(payload)
    run_id = request.run_id or uuid4().hex
    models = request.models_to_run or DEFAULT_MODELS
    axis = _time_axis(request.forecast_horizon, request.frequency)
    results: List[Dict[str, Any]] = []

    for combination in request.combinations:
        seed_prefix = f"{run_id}:{combination}"
        base_value = 90 + _seeded_random(seed_prefix, "base") * 30
        actual_values = _simulate_values(seed_prefix, count=len(axis["history"]), base_value=base_value)
        forecast_values = _simulate_values(
            f"{seed_prefix}:forecast",
            count=len(axis["forecast"]),
            base_value=actual_values[-1] if actual_values else base_value,
        )

        rows: List[Dict[str, Any]] = []
        for index, (dt_str, actual) in enumerate(zip(axis["history"], actual_values)):
            row: Dict[str, Any] = {"date": dt_str, "Actual": actual}
            for model in models:
                jitter = (actual * 0.05) * (_seeded_random(seed_prefix, model, str(index)) - 0.5)
                row[model] = round(max(1.0, actual + jitter), 2)
            rows.append(row)

        previous = actual_values[-1] if actual_values else base_value
        for index, dt_str in enumerate(axis["forecast"]):
            row = {"date": dt_str, "Actual": None}
            for model in models:
                growth = 1 + (_seeded_random(seed_prefix, model, "forecast", str(index)) - 0.45) / 8
                previous = max(1.0, previous * growth)
                row[model] = round(previous, 2)
            rows.append(row)

        metrics = {model: _model_metrics(f"{seed_prefix}:{model}") for model in models}
        model_params = {model: _model_parameters(f"{seed_prefix}:{model}:params") for model in models}

        results.append(
            {
                "combination_id": combination,
                "file_key": f"scope_{request.scope_number}/{combination.replace(' ', '_')}.csv",
                "status": "success",
                "result": {
                    "models_run": models,
                    "forecast_df": rows,
                    "metrics": metrics,
                    "model_params": model_params,
                    "combination": {
                        "scope": request.scope_number,
                        "combination": combination,
                        "y_variable": request.y_variable,
                    },
                },
            }
        )

    response = AutoregressiveTrainingResponse(
        run_id=run_id,
        status="completed",
        message=f"Training completed for {len(results)} combinations",
        scope_id=f"scope_{request.scope_number}",
        set_name="simulated_training",
        total_combinations=len(request.combinations),
        processed_combinations=len(results),
        results=results,
    )

    TRAINING_RUNS[run_id] = {
        "created_at": datetime.utcnow().isoformat(),
        "request": request.model_dump(),
        "results": results,
    }
    RUN_HISTORY.append(run_id)
    _update_scope_state(request.scope_number, request.combinations)

    return response.model_dump()


def _find_combination_result(combination: str, run_id: Optional[str]) -> Optional[Dict[str, Any]]:
    if run_id and run_id in TRAINING_RUNS:
        for result in TRAINING_RUNS[run_id]["results"]:
            if result.get("combination_id") == combination:
                return result
    for stored_id in reversed(RUN_HISTORY):
        results = TRAINING_RUNS.get(stored_id, {}).get("results", [])
        for result in results:
            if result.get("combination_id") == combination:
                return result
    return None


def _growth_rows(request: GrowthRequest, *, period_labels: List[str], seed_suffix: str) -> List[Dict[str, Any]]:
    result = _find_combination_result(request.combination, request.run_id)
    models = result.get("result", {}).get("models_run", DEFAULT_MODELS) if result else DEFAULT_MODELS
    rows: List[Dict[str, Any]] = []
    for period_index, label in enumerate(period_labels):
        for model in models:
            seed = f"{request.combination}:{model}:{seed_suffix}:{period_index}"
            baseline = _find_baseline_growth(result, model)
            swing = (_seeded_random(seed) - 0.5) * 6
            rows.append(
                {
                    "period": label,
                    "model": model,
                    "growth": round(baseline + swing, 2),
                }
            )
    return rows


def _find_baseline_growth(result: Optional[Dict[str, Any]], model: str) -> float:
    if not result:
        return 5.0
    metrics = result.get("result", {}).get("metrics", {})
    rmse = metrics.get(model, {}).get("RMSE", 2.5)
    # Invert RMSE to obtain a pseudo performance score between 2 and 10.
    return round(10 / (1 + rmse), 2)


def calculate_fiscal_growth(payload: Dict[str, Any]) -> Dict[str, Any]:
    request = GrowthRequest.model_validate(payload)
    start_year = request.start_year or date.today().year
    labels = [f"FY{start_year + index}" for index in range(max(1, min(request.forecast_horizon, 5)))]
    rows = _growth_rows(request, period_labels=labels, seed_suffix="fiscal")
    return {"status": "success", "data": rows, "combination": request.combination}


def calculate_halfyearly_growth(payload: Dict[str, Any]) -> Dict[str, Any]:
    request = GrowthRequest.model_validate(payload)
    labels = [f"H{index + 1}" for index in range(max(1, min(request.forecast_horizon // 6 + 1, 4)))]
    rows = _growth_rows(request, period_labels=labels, seed_suffix="halfyear")
    return {"status": "success", "data": rows, "combination": request.combination}


def calculate_quarterly_growth(payload: Dict[str, Any]) -> Dict[str, Any]:
    request = GrowthRequest.model_validate(payload)
    labels = [f"Q{index + 1}" for index in range(max(1, min(request.forecast_horizon // 3 + 1, 6)))]
    rows = _growth_rows(request, period_labels=labels, seed_suffix="quarter")
    return {"status": "success", "data": rows, "combination": request.combination}


def save_single_combination(payload: Dict[str, Any]) -> Dict[str, Any]:
    request = SaveCombinationRequest.model_validate(payload)
    scope = request.scope or "global"
    state = SCOPE_STATE.setdefault(
        scope,
        _ScopeState(saved=set(), pending=set(), combinations=set()),
    )
    state["combinations"].add(request.combination_id)
    state["saved"].add(request.combination_id)
    state["pending"].discard(request.combination_id)

    return {
        "status": "success",
        "saved_combination": request.combination_id,
        "saved_count": len(state["saved"]),
    }


def get_saved_combinations_status(scope: str) -> Dict[str, Any]:
    state = SCOPE_STATE.setdefault(
        scope,
        _ScopeState(saved=set(), pending=set(), combinations=set()),
    )
    total = len(state["combinations"]) or (len(state["saved"]) + len(state["pending"]))
    pending = state["pending"] or (state["combinations"] - state["saved"])
    completion = (len(state["saved"]) / total * 100) if total else 0.0
    response = SavedCombinationStatusResponse(
        scope=scope,
        saved_combinations=sorted(state["saved"]),
        pending_combinations=sorted(pending),
        saved_count=len(state["saved"]),
        pending_count=len(pending),
        total_combinations=total,
        completion_percentage=round(completion, 2),
        note="Simulated status based on in-memory activity",
    )
    return response.model_dump()


__all__ = [
    "calculate_fiscal_growth",
    "calculate_halfyearly_growth",
    "calculate_quarterly_growth",
    "detect_frequency",
    "get_saved_combinations_status",
    "list_numeric_columns",
    "save_single_combination",
    "train_autoregressive_models",
    "validate_training_request",
]

