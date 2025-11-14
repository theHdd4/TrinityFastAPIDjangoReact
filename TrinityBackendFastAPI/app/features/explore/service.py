"""Explore feature services for Celery workers.

This module centralises the heavy Explore atom routines so they can be
executed inside Celery workers and re-used by synchronous FastAPI routes.
The functions are intentionally verbose – they mirror the behaviour of the
existing explore routes to avoid behavioural regressions while enabling
background execution.
"""

from __future__ import annotations

import json
import logging
import os
from datetime import datetime
from typing import Any, Dict, Iterable, List, Optional
from urllib.parse import quote, unquote

import pandas as pd
import pyarrow as pa
import pyarrow.ipc as ipc
from minio import Minio

from app.features.column_classifier.database import (
    get_classifier_config_from_mongo,
)
from .app.database import (
    get_dimensions_from_mongo,
    get_explore_atom_from_mongo,
    get_measures_from_mongo,
    save_chart_result_to_mongo,
    save_explore_atom_to_mongo,
    update_explore_atom_in_mongo,
)
from .app.redis_config import get_redis_client


logger = logging.getLogger("app.features.explore.service")

# ---------------------------------------------------------------------------
# Shared clients & configuration
# ---------------------------------------------------------------------------
MINIO_ENDPOINT = os.getenv("MINIO_ENDPOINT", "minio:9000")
MINIO_ACCESS_KEY = os.getenv("MINIO_ACCESS_KEY", "admin_dev")
MINIO_SECRET_KEY = os.getenv("MINIO_SECRET_KEY", "pass_dev")
MINIO_BUCKET = os.getenv("MINIO_BUCKET", "trinity")

_minio_client: Optional[Minio] = None


def _get_minio_client() -> Minio:
    global _minio_client
    if _minio_client is None:
        _minio_client = Minio(
            MINIO_ENDPOINT,
            access_key=MINIO_ACCESS_KEY,
            secret_key=MINIO_SECRET_KEY,
            secure=False,
        )
    return _minio_client


# ---------------------------------------------------------------------------
# Utility helpers reused across tasks
# ---------------------------------------------------------------------------

def _ensure_arrow_dataframe(object_name: str) -> pd.DataFrame:
    object_name = unquote(object_name)
    if not object_name.endswith(".arrow"):
        raise ValueError("Unsupported file format")

    client = _get_minio_client()
    content = client.get_object(MINIO_BUCKET, object_name).read()
    reader = ipc.RecordBatchFileReader(pa.BufferReader(content))
    df = reader.read_all().to_pandas()
    df.columns = df.columns.str.lower()
    return df


def _serialise_unique(values: Iterable[Any], limit: int) -> List[Any]:
    result: List[Any] = []
    for value in values:
        if len(result) >= limit:
            break
        if isinstance(value, (pd.Timestamp, datetime, date)):
            result.append(pd.to_datetime(value).isoformat())
        else:
            result.append(str(value))
    return result


def _fetch_explore_atom(explore_atom_id: str) -> Dict[str, Any]:
    atom = get_explore_atom_from_mongo(explore_atom_id)
    if not atom:
        raise ValueError(f"Explore atom '{explore_atom_id}' not found")
    return atom


def _normalise_filters(filters: Any) -> Dict[str, List[Any]]:
    if isinstance(filters, dict):
        normalised: Dict[str, List[Any]] = {}
        for key, value in filters.items():
            if isinstance(value, (list, tuple, set)):
                normalised[key] = list(value)
            else:
                normalised[key] = [value]
        return normalised

    normalised: Dict[str, List[Any]] = {}
    if isinstance(filters, list):
        for item in filters:
            column = item.get("column")
            values = item.get("values", [])
            if not column:
                continue
            if isinstance(values, (list, tuple, set)):
                normalised[column] = list(values)
            else:
                normalised[column] = [values]
    return normalised


# ---------------------------------------------------------------------------
# Column & summary helpers
# ---------------------------------------------------------------------------

def fetch_columns_task(object_name: str) -> Dict[str, Any]:
    df = _ensure_arrow_dataframe(object_name)
    columns = list(df.columns)
    return {
        "columns": columns,
        "column_count": len(columns),
        "file_name": unquote(object_name),
    }


def column_summary_task(object_name: str) -> Dict[str, Any]:
    df = _ensure_arrow_dataframe(object_name)

    summary: List[Dict[str, Any]] = []
    for column in df.columns:
        series = df[column].dropna()
        try:
            unique_values = series.unique()
        except TypeError:
            unique_values = series.astype(str).unique()

        is_numeric = pd.api.types.is_numeric_dtype(df[column])
        limit = 1000 if is_numeric else 200
        entries = _serialise_unique(unique_values, limit)

        summary.append(
            {
                "column": column,
                "data_type": str(df[column].dtype),
                "unique_count": int(len(unique_values)),
                "entries": entries,
                "unique_values": entries,
                "is_numerical": is_numeric,
            }
        )
    return {"summary": summary}


# ---------------------------------------------------------------------------
# Dimension & measure helpers
# ---------------------------------------------------------------------------

def _load_classifier_config(
    client_name: Optional[str],
    app_name: Optional[str],
    project_name: Optional[str],
    file_key: Optional[str],
) -> Optional[Dict[str, Any]]:
    if not (client_name and app_name and project_name):
        return None

    redis_client = get_redis_client()
    base_key = f"{client_name}/{app_name}/{project_name}/column_classifier_config"
    decoded_file = unquote(file_key) if file_key else None

    if redis_client:
        specific_key = None
        if decoded_file:
            safe_file = quote(decoded_file, safe="")
            specific_key = f"{base_key}:{safe_file}"
            cached_specific = redis_client.get(specific_key)
            if cached_specific:
                return json.loads(cached_specific)

        cached = redis_client.get(base_key)
        if cached:
            config = json.loads(cached)
            stored_file = config.get("file_name")
            if not decoded_file or not stored_file or stored_file == decoded_file:
                return config

    config = get_classifier_config_from_mongo(
        client_name, app_name, project_name, decoded_file
    )
    if config and redis_client:
        redis_client.setex(base_key, 3600, json.dumps(config, default=str))
        if decoded_file:
            safe_file = quote(decoded_file, safe="")
            redis_client.setex(
                f"{base_key}:{safe_file}", 3600, json.dumps(config, default=str)
            )
    return config


def get_dimensions_task(
    validator_atom_id: str,
    client_name: Optional[str] = None,
    app_name: Optional[str] = None,
    project_name: Optional[str] = None,
    file_key: Optional[str] = None,
) -> Dict[str, Any]:
    config = _load_classifier_config(client_name, app_name, project_name, file_key)
    if config:
        actual_file_key = file_key or "file"
        dimensions_data: Dict[str, Dict[str, Any]] = {actual_file_key: {}}
        for dimension_name, identifiers in config.get("dimensions", {}).items():
            dimensions_data[actual_file_key][dimension_name] = {
                "dimension_name": dimension_name,
                "identifiers": identifiers,
                "description": f"Dimension: {dimension_name}",
                "source": "column_classifier",
            }
        identifiers = config.get("identifiers", [])
        return {
            "status": "success",
            "validator_atom_id": validator_atom_id,
            "source": "column_classifier",
            "dimensions_structure": dimensions_data,
            "column_classifier_config": {
                "client_name": client_name,
                "app_name": app_name,
                "project_name": project_name,
                "total_dimensions": len(dimensions_data[actual_file_key]),
                "total_identifiers": len(identifiers),
            },
            "summary": {
                "file_keys": [actual_file_key],
                "total_dimensions": len(dimensions_data[actual_file_key]),
                "total_identifiers": len(identifiers),
                "available_dimensions": list(dimensions_data[actual_file_key].keys()),
                "available_identifiers": identifiers,
            },
        }

    result = get_dimensions_from_mongo(validator_atom_id)
    if result.get("status") == "error":
        raise ValueError(result.get("message", "Failed to fetch dimensions"))
    return result


def get_measures_task(
    validator_atom_id: str,
    client_name: Optional[str] = None,
    app_name: Optional[str] = None,
    project_name: Optional[str] = None,
    file_key: Optional[str] = None,
) -> Dict[str, Any]:
    config = _load_classifier_config(client_name, app_name, project_name, file_key)
    if config:
        actual_file_key = file_key or "file"
        measures = config.get("measures", [])
        identifiers = config.get("identifiers", [])
        measures_data = {
            actual_file_key: {
                "measures": measures,
                "identifiers": identifiers,
                "source": "column_classifier",
            }
        }
        return {
            "status": "success",
            "validator_atom_id": validator_atom_id,
            "source": "column_classifier",
            "measures_structure": measures_data,
            "column_classifier_config": {
                "client_name": client_name,
                "app_name": app_name,
                "project_name": project_name,
                "total_measures": len(measures),
                "total_identifiers": len(identifiers),
            },
            "summary": {
                "file_keys": [actual_file_key],
                "total_measures": len(measures),
                "total_identifiers": len(identifiers),
                "available_measures": measures,
                "available_identifiers": identifiers,
            },
        }

    result = get_measures_from_mongo(validator_atom_id)
    if result.get("status") == "error":
        raise ValueError(result.get("message", "Failed to fetch measures"))
    return result


def save_dimensions_and_measures_task(
    validator_atom_id: str,
    atom_name: str,
    selected_dimensions: str,
    selected_measures: str,
) -> Dict[str, Any]:
    try:
        dims = json.loads(selected_dimensions)
        measures = json.loads(selected_measures)
    except json.JSONDecodeError as exc:  # noqa: BLE001
        raise ValueError(f"Invalid JSON format: {exc}") from exc

    if not isinstance(dims, dict) or not isinstance(measures, dict):
        raise ValueError("Both dimensions and measures must be JSON objects")

    timestamp = datetime.now().strftime("%Y%m%d_%H%M%S")
    explore_atom_id = f"explore_{timestamp}"

    explore_atom_data = {
        "explore_atom_id": explore_atom_id,
        "atom_name": atom_name,
        "validator_atom_id": validator_atom_id,
        "selected_dimensions": dims,
        "selected_measures": measures,
        "operations": {},
        "created_at": datetime.now().isoformat(),
        "status": "dimensions_and_measures_selected",
    }

    mongo_result = save_explore_atom_to_mongo(explore_atom_data)
    return {
        "status": "success",
        "message": f"Explore atom '{atom_name}' created and saved successfully",
        "explore_atom_id": explore_atom_id,
        "validator_atom_id": validator_atom_id,
        "selected_dimensions": dims,
        "selected_measures": measures,
        "summary": {
            "dimensions_selected": sum(
                len(dim_ids)
                for file_data in dims.values()
                for dim_ids in file_data.values()
            )
            if dims
            else 0,
            "measures_selected": sum(len(measure_list) for measure_list in measures.values()),
            "file_keys": list(dims.keys()),
        },
        "mongodb_saved": mongo_result.get("status") == "success",
        "mongo_id": mongo_result.get("mongo_id", ""),
        "next_step": (
            "Define operations using POST /explore/specify-operations with "
            f"explore_atom_id: {explore_atom_id}"
        ),
    }


# ---------------------------------------------------------------------------
# Operation configuration helpers
# ---------------------------------------------------------------------------

def specify_operations_task(explore_atom_id: str, operations: str) -> Dict[str, Any]:
    try:
        ops = json.loads(operations)
    except json.JSONDecodeError as exc:  # noqa: BLE001
        raise ValueError(f"Invalid JSON format for operations: {exc}") from exc

    required_keys = ["file_key", "filters", "group_by", "measures_config", "chart_type"]
    for key in required_keys:
        if key not in ops:
            raise ValueError(f"Missing required operation key: '{key}'")

    valid_chart_types = ["bar_chart", "stacked_bar_chart", "line_chart", "pie_chart", "table"]
    if ops["chart_type"] not in valid_chart_types:
        raise ValueError(
            "Invalid chart_type '" + ops["chart_type"] + "'. Valid options: " + str(valid_chart_types)
        )

    valid_aggregations = [
        "sum",
        "avg",
        "count",
        "min",
        "max",
        "weighted_avg",
        "null",
        "no_aggregation",
    ]
    for measure, agg_type in ops["measures_config"].items():
        if agg_type not in valid_aggregations:
            raise ValueError(
                f"Invalid aggregation '{agg_type}' for measure '{measure}'. Valid options: {valid_aggregations}"
            )

    has_weighted_avg = any(
        agg_type == "weighted_avg" for agg_type in ops["measures_config"].values()
    )
    if has_weighted_avg:
        if "weight_column" not in ops or not isinstance(ops["weight_column"], str) or not ops["weight_column"]:
            raise ValueError("'weight_column' is required when using 'weighted_avg' aggregation")

    if ops["chart_type"] == "line_chart":
        if "x_axis" not in ops:
            raise ValueError("'x_axis' is required for line_chart type")
        x_axis = ops["x_axis"]
        if x_axis not in ops["group_by"]:
            raise ValueError(
                f"'x_axis' value '{x_axis}' must be in 'group_by' list: {ops['group_by']}"
            )

    mongo_result = update_explore_atom_in_mongo(explore_atom_id, ops)
    if mongo_result.get("status") == "error":
        raise ValueError(mongo_result.get("message", "Failed to update operations"))

    operation_summary: Dict[str, Any] = {
        "file_key": ops["file_key"],
        "filters_count": len(ops["filters"]),
        "group_by_dimensions": ops["group_by"],
        "measures_count": len(ops["measures_config"]),
        "chart_type": ops["chart_type"],
    }
    if has_weighted_avg:
        operation_summary["weighted_avg_used"] = True
        operation_summary["weight_column"] = ops["weight_column"]
    if ops["chart_type"] == "line_chart":
        operation_summary["x_axis"] = ops["x_axis"]

    return {
        "status": "success",
        "message": "Operations specified successfully",
        "explore_atom_id": explore_atom_id,
        "operations": ops,
        "mongodb_updated": mongo_result.get("status") == "success",
        "operation_summary": operation_summary,
        "validation_passed": {
            "weighted_avg_validation": has_weighted_avg,
            "line_chart_validation": ops["chart_type"] == "line_chart",
        },
        "next_step": f"Get chart data using GET /explore/chart-data-multidim/{explore_atom_id}",
    }


# ---------------------------------------------------------------------------
# Chart generation helpers (extensive logic copied from routes)
# ---------------------------------------------------------------------------

def chart_data_multidim_task(explore_atom_id: str) -> Dict[str, Any]:
    explore_atom_data = _fetch_explore_atom(explore_atom_id)
    operations = explore_atom_data.get("operations", {})
    if not operations:
        raise ValueError("Operations not specified for explore atom")

    chart_type = operations.get("chart_type", "table")
    group_by = operations.get("group_by", [])
    filters = _normalise_filters(operations.get("filters", {}))
    measures_config = operations.get("measures_config", {})
    x_axis = operations.get("x_axis", group_by[0] if group_by else None)
    weight_column = operations.get("weight_column")
    sort_order = operations.get("sort_order", "desc")

    file_key = operations.get("file_key")
    if not file_key:
        dims = explore_atom_data.get("selected_dimensions", {})
        file_keys = list(dims.keys())
        if not file_keys:
            raise ValueError("No file key found in explore atom configuration")
        file_key = file_keys[0]

    df = _ensure_arrow_dataframe(file_key)

    if filters:
        debug_filters: Dict[str, Any] = {}
        for column, values in filters.items():
            column_lower = column.lower()
            if column_lower in df.columns:
                debug_filters[column_lower] = values
                df = df[df[column_lower].isin(values)]
        logger.info("🔍 [EXPLORE] Applied filters: %s", debug_filters)

    df.columns = df.columns.str.lower()

    actual_group_cols: List[str] = []
    for col in group_by:
        lower_col = col.lower()
        match = next((c for c in df.columns if c.lower() == lower_col), None)
        if match:
            actual_group_cols.append(match)

    if not actual_group_cols:
        raise ValueError("No valid group_by columns found in dataframe")

    measures = list(measures_config.keys())
    if not measures:
        raise ValueError("No measures specified for operations")

    primary_measure = measures[0]

    def _find_column(column_name: str) -> Optional[str]:
        lower = column_name.lower()
        for column in df.columns:
            if column.lower() == lower:
                return column
        return None

    actual_measure = _find_column(primary_measure)
    if not actual_measure:
        raise ValueError(f"Measure column '{primary_measure}' not found")

    processed_df = df.copy()

    if weight_column:
        actual_weight = _find_column(weight_column)
        if not actual_weight:
            raise ValueError(f"Weight column '{weight_column}' not found")
    else:
        actual_weight = None

    # Collect multiple measures (dual axis support)
    multiple_measures: List[Dict[str, Any]] = []
    for measure_name, agg_type in measures_config.items():
        actual_col = _find_column(measure_name)
        if actual_col:
            multiple_measures.append(
                {"name": measure_name, "column": actual_col, "agg_type": agg_type}
            )

    if not multiple_measures:
        multiple_measures = [
            {
                "name": primary_measure,
                "column": actual_measure,
                "agg_type": measures_config.get(primary_measure, "sum"),
            }
        ]

    agg_type = measures_config.get(primary_measure, "sum")

    if agg_type == "no_aggregation":
        agg_type = "null"

    try:
        is_numeric = pd.api.types.is_numeric_dtype(processed_df[actual_measure])
        is_identifier = (
            (not is_numeric and agg_type not in ["count", "null"]) or agg_type in ["null"]
        )

        if is_numeric and agg_type not in ["null"]:
            processed_df[actual_measure] = pd.to_numeric(
                processed_df[actual_measure], errors="coerce"
            )
        elif is_identifier:
            pass
        elif agg_type == "null":
            pass
        else:
            agg_type = "count"

        if agg_type == "weighted_avg":
            if not actual_weight:
                raise ValueError("weight_column required for weighted_avg")
            processed_df[actual_weight] = pd.to_numeric(
                processed_df[actual_weight], errors="coerce"
            )
            processed_df = processed_df.dropna(subset=[actual_measure, actual_weight])
        else:
            processed_df = processed_df.dropna(subset=[actual_measure])
    except Exception as exc:  # noqa: BLE001 - diagnostics only
        logger.warning("⚠️ Data cleaning warning: %s", exc)

    def _aggregate(df_to_group: pd.DataFrame, measure: str, agg: str) -> pd.DataFrame:
        if agg == "sum":
            return df_to_group.groupby(actual_group_cols)[measure].sum().reset_index()
        if agg == "avg":
            return df_to_group.groupby(actual_group_cols)[measure].mean().reset_index()
        if agg == "count":
            return df_to_group.groupby(actual_group_cols)[measure].count().reset_index()
        if agg == "min":
            return df_to_group.groupby(actual_group_cols)[measure].min().reset_index()
        if agg == "max":
            return df_to_group.groupby(actual_group_cols)[measure].max().reset_index()
        if agg == "weighted_avg":
            if not actual_weight:
                raise ValueError("weight column not available")

            def weighted_avg_func(group: pd.DataFrame) -> float:
                numerator = (group[measure] * group[actual_weight]).sum()
                denominator = group[actual_weight].sum()
                return float(numerator / denominator) if denominator != 0 else 0.0

            result = (
                processed_df.groupby(actual_group_cols)
                .apply(weighted_avg_func)
                .reset_index()
            )
            result.columns = actual_group_cols + [measure]
            return result
        if agg == "null":
            grouped = (
                processed_df.groupby(actual_group_cols)[measure]
                .apply(lambda x: list(dict.fromkeys(x.dropna().tolist())))
                .reset_index()
            )
            grouped[measure] = grouped[measure].apply(
                lambda items: items[0] if items else "Unknown"
            )
            return grouped
        raise ValueError(f"Unsupported aggregation '{agg}'")

    if len(multiple_measures) > 1:
        first_measure = multiple_measures[0]
        grouped_result = _aggregate(
            processed_df, first_measure["column"], first_measure["agg_type"]
        )
        for measure_info in multiple_measures[1:]:
            interim = _aggregate(
                processed_df, measure_info["column"], measure_info["agg_type"]
            )
            grouped_result = pd.merge(
                grouped_result,
                interim,
                on=actual_group_cols,
                how="left",
                suffixes=(None, f"_{measure_info['name']}")
            )
    else:
        grouped_result = _aggregate(processed_df, actual_measure, agg_type)

    if sort_order == "asc":
        grouped_result = grouped_result.sort_values(
            multiple_measures[0]["column"], ascending=True
        )
    elif sort_order == "desc":
        grouped_result = grouped_result.sort_values(
            multiple_measures[0]["column"], ascending=False
        )

    chart_data: List[Dict[str, Any]] = []
    chart_metadata: Dict[str, Any] = {}

    def _append_chart_row(row: pd.Series, mapping: Dict[str, Any]) -> None:
        payload: Dict[str, Any] = {}
        for key, value in mapping.items():
            if isinstance(value, str) and value in row.index:
                payload[key] = row[value]
            else:
                payload[key] = value
        chart_data.append(payload)

    if chart_type == "table":
        chart_data = grouped_result.to_dict(orient="records")
    elif chart_type == "line_chart":
        for _, row in grouped_result.iterrows():
            base = {
                "category": str(row[x_axis]) if x_axis and x_axis in row.index else None
            }
            for measure_info in multiple_measures:
                column_name = measure_info["column"]
                key = measure_info["name"]
                base[key] = (
                    float(row[column_name])
                    if pd.api.types.is_numeric_dtype(grouped_result[column_name])
                    else row[column_name]
                )
            if len(actual_group_cols) > 1:
                base["label"] = " | ".join(
                    str(row[col]) for col in actual_group_cols if col != x_axis
                )
            chart_data.append(base)
    elif chart_type in {"bar_chart", "stacked_bar_chart"}:
        for _, row in grouped_result.iterrows():
            base = {
                "category": str(row[actual_group_cols[0]])
                if actual_group_cols
                else "Category"
            }
            if len(actual_group_cols) > 1:
                base["label"] = " | ".join(
                    str(row[col]) for col in actual_group_cols[1:]
                )
            for measure_info in multiple_measures:
                column_name = measure_info["column"]
                key = measure_info["name"]
                base[key] = (
                    float(row[column_name])
                    if pd.api.types.is_numeric_dtype(grouped_result[column_name])
                    else row[column_name]
                )
            chart_data.append(base)
    elif chart_type == "pie_chart":
        for _, row in grouped_result.iterrows():
            payload = {
                "label": str(row[actual_group_cols[0]])
                if actual_group_cols
                else "Category",
            }
            for measure_info in multiple_measures:
                column_name = measure_info["column"]
                key = measure_info["name"]
                payload[key] = (
                    float(row[column_name])
                    if pd.api.types.is_numeric_dtype(grouped_result[column_name])
                    else row[column_name]
                )
            chart_data.append(payload)
    else:
        raise ValueError(f"Unsupported chart type '{chart_type}'")

    response = {
        "status": "success",
        "chart_type": chart_type,
        "group_by": group_by,
        "measures": measures,
        "x_axis": x_axis,
        "data": chart_data,
        "chart_metadata": chart_metadata,
        "row_count": len(chart_data),
        "operations": operations,
    }
    return response


# ---------------------------------------------------------------------------
# Date range helper
# ---------------------------------------------------------------------------

def date_range_task(
    object_name: Optional[str] = None,
    file_key: Optional[str] = None,
    date_column: Optional[str] = None,
) -> Dict[str, Any]:
    target = object_name or file_key
    if not target:
        raise ValueError("object_name or file_key is required")

    df = _ensure_arrow_dataframe(target)

    search_order: List[str] = []
    if date_column:
        search_order.append(date_column.lower())
    search_order.extend(["date", "caldate", "period", "timestamp", "time", "day"])

    seen = set()
    ordered = [c for c in search_order if not (c in seen or seen.add(c))]

    chosen_col = None
    parsed_series = None
    for col in ordered + list(df.columns):
        if col in df.columns:
            candidate = pd.to_datetime(df[col], errors="coerce").dropna()
            if not candidate.empty:
                chosen_col = col
                parsed_series = candidate
                break

    if parsed_series is None or parsed_series.empty:
        raise ValueError("No valid date column found in file")

    return {
        "status": "success",
        "bucket": MINIO_BUCKET,
        "file_key": target,
        "date_column": chosen_col,
        "min_date": parsed_series.min().isoformat(),
        "max_date": parsed_series.max().isoformat(),
        "row_count": int(len(df)),
    }


# ---------------------------------------------------------------------------
# AI assisted exploration helper
# ---------------------------------------------------------------------------

def perform_explore_task(
    exploration_config: str,
    file_name: str,
    bucket_name: str = "trinity",
) -> Dict[str, Any]:
    try:
        config = json.loads(exploration_config)
    except json.JSONDecodeError as exc:  # noqa: BLE001
        raise ValueError(f"Invalid exploration_config JSON: {exc}") from exc

    if not isinstance(config, list):
        config = [config]

    results: List[Dict[str, Any]] = []

    for idx, exploration in enumerate(config):
        chart_type = exploration.get("chart_type", "table")
        dimensions = exploration.get("dimensions", [])
        measures = exploration.get("measures", [])
        x_axis = exploration.get("x_axis", "")
        aggregation = exploration.get("aggregation", "sum")
        filters = exploration.get("filters", {})
        weight_column = exploration.get("weight_column")
        title = exploration.get("title", f"Exploration {idx + 1}")
        description = exploration.get("description", "")
        add_note = exploration.get("add_note", "")

        explore_atom_id = f"explore_perform_{datetime.now().strftime('%Y%m%d_%H%M%S')}_{idx}"

        operations = {
            "file_key": file_name,
            "chart_type": chart_type,
            "group_by": dimensions,
            "measures_config": {measure: aggregation for measure in measures},
            "filters": filters,
            "x_axis": x_axis if x_axis else (dimensions[0] if dimensions else None),
            "weight_column": weight_column,
            "sort_order": "desc",
        }

        explore_atom_data = {
            "explore_atom_id": explore_atom_id,
            "atom_name": "explore_perform",
            "validator_atom_id": file_name,
            "selected_dimensions": {
                file_name: {dim: dimensions for dim in dimensions}
            }
            if dimensions
            else {},
            "selected_measures": {file_name: measures},
            "operations": operations,
            "created_at": datetime.now().isoformat(),
            "status": "ai_generated_and_performing",
            "ai_config": exploration,
        }

        save_explore_atom_to_mongo(explore_atom_data)
        update_explore_atom_in_mongo(explore_atom_id, operations)

        chart_result = chart_data_multidim_task(explore_atom_id)

        chart_metadata = {
            "chart_type": chart_type,
            "x_axis": x_axis,
            "measure": measures[0] if measures else None,
            "grouped_by": dimensions,
            "aggregation": aggregation,
            "weight_column": weight_column,
            "title": title,
            "description": description,
            "created_at": datetime.now().isoformat(),
            "operations": operations,
        }
        save_chart_result_to_mongo(
            explore_atom_id=explore_atom_id,
            chart_data=chart_result,
            metadata=chart_metadata,
        )

        results.append(
            {
                "exploration_id": exploration.get("exploration_id", str(idx + 1)),
                "explore_atom_id": explore_atom_id,
                "chart_type": chart_type,
                "title": title,
                "description": description,
                "chart_data": chart_result,
                "ai_note": add_note,
                "status": "success",
            }
        )

    return {
        "status": "success",
        "results": results,
        "explorations_processed": len(results),
        "bucket_name": bucket_name,
        "file_name": file_name,
    }


__all__ = [
    "fetch_columns_task",
    "column_summary_task",
    "get_dimensions_task",
    "get_measures_task",
    "save_dimensions_and_measures_task",
    "specify_operations_task",
    "chart_data_multidim_task",
    "date_range_task",
    "perform_explore_task",
]
