from __future__ import annotations

import json
import logging
from datetime import datetime, timezone
from typing import Any, Dict, Iterable, List, Optional

import numpy as np
import pandas as pd
import pyarrow as pa
import pyarrow.ipc as ipc
from fastapi import HTTPException

from app.DataStorageRetrieval.arrow_client import download_dataframe
from app.DataStorageRetrieval.minio_utils import ensure_minio_bucket, upload_to_minio
from app.features.data_upload_validate.app.routes import get_object_prefix
from app.features.feature_overview.deps import redis_client

from .schemas import (
    PivotComputeRequest,
    PivotComputeResponse,
    PivotRefreshResponse,
    PivotSaveResponse,
    PivotStatusResponse,
)

logger = logging.getLogger(__name__)

PIVOT_CACHE_TTL = 3600
PIVOT_NAMESPACE = "pivot"

AGGREGATION_MAP: Dict[str, str] = {
    "sum": "sum",
    "avg": "mean",
    "average": "mean",
    "mean": "mean",
    "count": "count",
    "min": "min",
    "max": "max",
    "median": "median",
}


def _ns_key(config_id: str, suffix: str) -> str:
    return f"{PIVOT_NAMESPACE}:{config_id}:{suffix}"


def _ensure_redis_json(value: Dict[str, Any]) -> bytes:
    return json.dumps(value, default=str).encode("utf-8")


def _decode_redis_json(value: Optional[bytes]) -> Optional[Dict[str, Any]]:
    if not value:
        return None
    try:
        return json.loads(value.decode("utf-8"))
    except Exception:
        return None


async def _resolve_object_path(data_source: str) -> str:
    path = (data_source or "").strip()
    if not path:
        raise HTTPException(status_code=400, detail="data_source is required")

    if not path.lower().endswith(".arrow"):
        path = f"{path}.arrow"

    prefix = await get_object_prefix()
    if isinstance(prefix, tuple):  # function can return tuple when include_env=True
        prefix = prefix[0]

    if path.startswith(prefix):
        return path

    # Allow absolute style "client/app/project/file" without prefix slash
    if path.startswith("/"):
        path = path.lstrip("/")

    if prefix.endswith("/") and path.startswith(prefix):
        return path

    full_path = f"{prefix}{path}"
    logger.debug("Pivot table resolved data source %s -> %s", data_source, full_path)
    return full_path


def _convert_numpy(value: Any) -> Any:
    if isinstance(value, dict):
        return {k: _convert_numpy(v) for k, v in value.items()}
    if isinstance(value, list):
        return [_convert_numpy(v) for v in value]
    if isinstance(value, (np.integer,)):
        return int(value)
    if isinstance(value, (np.floating,)):
        return float(value)
    if isinstance(value, (pd.Timestamp, datetime)):
        return value.isoformat()
    if pd.isna(value):
        return None
    return value


def _ensure_column_mapping(columns: Iterable[str]) -> Dict[str, str]:
    return {col.lower(): col for col in columns}


def _resolve_columns(df: pd.DataFrame, requested: List[str]) -> List[str]:
    if not requested:
        return []
    mapping = _ensure_column_mapping(df.columns)
    resolved: List[str] = []
    for raw in requested:
        if not raw:
            continue
        col = mapping.get(raw.lower()) or (raw if raw in df.columns else None)
        if not col:
            raise HTTPException(
                status_code=404,
                detail=f"Column '{raw}' not found in dataset. Available columns: {', '.join(df.columns)}",
            )
        resolved.append(col)
    return resolved


def _apply_filters(df: pd.DataFrame, filters: List[Dict[str, Any]]) -> pd.DataFrame:
    if not filters:
        return df

    result = df.copy()
    mapping = _ensure_column_mapping(result.columns)

    for entry in filters:
        field = entry.get("field")
        if not field:
            continue
        include_values = entry.get("include")
        exclude_values = entry.get("exclude")

        resolved = mapping.get(field.lower()) or (field if field in result.columns else None)
        if not resolved:
            raise HTTPException(status_code=404, detail=f"Filter column '{field}' not found")

        as_text = result[resolved].astype(str)
        if include_values:
            include_set = {str(v) for v in include_values}
            result = result[as_text.isin(include_set)]
        if exclude_values:
            exclude_set = {str(v) for v in exclude_values}
            result = result[~as_text.isin(exclude_set)]

    return result


def _format_column_label(parts: Iterable[Any]) -> str:
    return " | ".join([str(part) for part in parts if str(part) != ""])


def _flatten_columns(df: pd.DataFrame) -> pd.DataFrame:
    if isinstance(df.columns, pd.MultiIndex):
        df.columns = [_format_column_label(col) for col in df.columns]
    else:
        df.columns = [str(col) for col in df.columns]
    return df


def _value_to_key(value: Any) -> str:
    if value is None:
        return "__NA__"
    if isinstance(value, (float, np.floating)) and pd.isna(value):
        return "__NA__"
    return str(value)


def _build_hierarchy_nodes(
    df: pd.DataFrame,
    row_fields: List[str],
    agg_map: Dict[str, str],
    order_lookup: Dict[str, int],
) -> List[Dict[str, Any]]:
    if not row_fields:
        return []

    nodes: List[Dict[str, Any]] = []

    for depth in range(len(row_fields)):
        group_fields = row_fields[: depth + 1]
        try:
            grouped = (
                df.groupby(group_fields, dropna=False)
                .agg(agg_map)
                .reset_index()
            )
        except Exception as exc:  # pragma: no cover - defensive
            logger.exception(
                "Failed to build hierarchy for fields %s: %s", group_fields, exc
            )
            continue

        grouped = _flatten_columns(grouped)
        value_columns = [col for col in grouped.columns if col not in group_fields]

        for _, row in grouped.iterrows():
            labels: List[Dict[str, Any]] = []
            key_parts: List[str] = []

            for field in group_fields:
                raw_value = row[field]
                labels.append(
                    {"field": field, "value": _convert_numpy(raw_value)}
                )
                key_parts.append(f"{field}:{_value_to_key(raw_value)}")

            key = "|".join(key_parts)
            parent_key = "|".join(key_parts[:-1]) if len(key_parts) > 1 else None
            values = _convert_numpy({col: row[col] for col in value_columns})

            nodes.append(
                {
                    "key": key,
                    "parent_key": parent_key,
                    "level": depth,
                    "order": order_lookup.get(key, len(order_lookup) + len(nodes)),
                    "labels": labels,
                    "values": values,
                }
            )

    return nodes


def _build_column_hierarchy_nodes(
    df: pd.DataFrame,
    column_fields: List[str],
    value_columns: List[str],
) -> List[Dict[str, Any]]:
    include_value_level = bool(column_fields) or len(value_columns) > 1
    total_levels = len(column_fields) + (1 if include_value_level else 0)
    if total_levels == 0:
        return []

    if isinstance(df.columns, pd.MultiIndex):
        column_iterable = [tuple(col) for col in df.columns.tolist()]
    else:
        column_iterable = [(col,) for col in df.columns.tolist()]

    nodes: Dict[str, Dict[str, Any]] = {}

    for order, col_tuple in enumerate(column_iterable):
        parts = list(col_tuple)
        if include_value_level and not parts:
            parts = [""]

        path_entries: List[tuple[str, Any]] = []
        remaining = parts

        if include_value_level:
            value_part = remaining[0] if remaining else ""
            path_entries.append(("__value__", value_part))
            remaining = remaining[1:]

        for index, field in enumerate(column_fields):
            value = remaining[index] if index < len(remaining) else ""
            path_entries.append((field, value))

        if not path_entries:
            continue

        column_name = _format_column_label(col_tuple)

        for depth in range(1, len(path_entries) + 1):
            prefix = path_entries[:depth]
            key = "|".join(
                f"{field}:{_value_to_key(value)}" for field, value in prefix
            )
            parent_key = (
                "|".join(
                    f"{field}:{_value_to_key(value)}" for field, value in prefix[:-1]
                )
                if depth > 1
                else None
            )

            node = nodes.get(key)
            if not node:
                node = {
                    "key": key,
                    "parent_key": parent_key,
                    "level": depth - 1,
                    "order": order,
                    "labels": [
                        {"field": field, "value": _convert_numpy(value)}
                        for field, value in prefix
                    ],
                }
                nodes[key] = node
            else:
                node["order"] = min(node["order"], order)

            if depth == len(path_entries):
                node["column"] = column_name

    ordered_nodes = sorted(
        nodes.values(), key=lambda item: (item["level"], item["order"])
    )
    return ordered_nodes


def _drop_margin_rows(df: pd.DataFrame) -> pd.DataFrame:
    if isinstance(df.index, pd.MultiIndex):
        mask = df.index.map(
            lambda idx: any(
                str(part) == "Grand Total"
                for part in (idx if isinstance(idx, tuple) else (idx,))
            )
        )
        if mask.any():
            df = df.loc[~mask]
    else:
        if "Grand Total" in df.index:
            df = df.drop(index="Grand Total")
    return df


def _drop_margin_columns(df: pd.DataFrame) -> pd.DataFrame:
    if isinstance(df.columns, pd.MultiIndex):
        keep_mask = [
            not any(str(part) == "Grand Total" for part in col if str(part) != "")
            for col in df.columns
        ]
        if not all(keep_mask):
            df = df.loc[:, keep_mask]
    else:
        if "Grand Total" in df.columns:
            df = df.drop(columns=["Grand Total"])
    return df


def _store_status(config_id: str, status: str, message: Optional[str], rows: Optional[int]) -> None:
    payload = {
        "config_id": config_id,
        "status": status,
        "updated_at": datetime.now(timezone.utc).isoformat(),
    }
    if message:
        payload["message"] = message
    if rows is not None:
        payload["rows"] = rows

    redis_client.setex(_ns_key(config_id, "status"), PIVOT_CACHE_TTL, _ensure_redis_json(payload))


def _store_data(config_id: str, data: Dict[str, Any]) -> None:
    redis_client.setex(_ns_key(config_id, "data"), PIVOT_CACHE_TTL, _ensure_redis_json(data))


def _store_config(config_id: str, config: Dict[str, Any]) -> None:
    redis_client.setex(_ns_key(config_id, "config"), PIVOT_CACHE_TTL, _ensure_redis_json(config))


def _load_config(config_id: str) -> Optional[Dict[str, Any]]:
    raw = redis_client.get(_ns_key(config_id, "config"))
    return _decode_redis_json(raw)


def _load_data(config_id: str) -> Optional[Dict[str, Any]]:
    raw = redis_client.get(_ns_key(config_id, "data"))
    return _decode_redis_json(raw)


def _load_status(config_id: str) -> PivotStatusResponse:
    data = _decode_redis_json(redis_client.get(_ns_key(config_id, "status"))) or {}
    status = data.get("status", "unknown")
    updated_at_raw = data.get("updated_at")
    updated_at = None
    if isinstance(updated_at_raw, str):
        try:
            updated_at = datetime.fromisoformat(updated_at_raw)
        except ValueError:
            updated_at = None

    return PivotStatusResponse(
        config_id=config_id,
        status=status,  # type: ignore[arg-type]
        updated_at=updated_at,
        message=data.get("message"),
        rows=data.get("rows"),
    )


async def compute_pivot(config_id: str, payload: PivotComputeRequest) -> PivotComputeResponse:
    logger.info("Pivot compute requested for %s", config_id)
    _store_status(config_id, "pending", "Computing pivot table", None)

    try:
        resolved_path = await _resolve_object_path(payload.data_source)
        df = download_dataframe(resolved_path)
    except HTTPException:
        raise
    except Exception as exc:  # pragma: no cover - external service
        logger.exception("Failed to load dataframe for %s", config_id)
        _store_status(config_id, "failed", f"Unable to load dataset: {exc}", None)
        raise HTTPException(status_code=500, detail=f"Unable to load dataset: {exc}")

    if df.empty:
        message = "Dataset is empty."
        _store_status(config_id, "failed", message, 0)
        raise HTTPException(status_code=400, detail=message)

    df_columns = df.columns.tolist()
    logger.debug("Pivot dataset columns: %s", df_columns)

    filtered_df = _apply_filters(df, [f.dict() for f in payload.filters])

    if filtered_df.empty:
        message = "No rows remain after applying filters."
        _store_status(config_id, "failed", message, 0)
        raise HTTPException(status_code=400, detail=message)

    row_fields = _resolve_columns(filtered_df, payload.rows)
    column_fields = _resolve_columns(filtered_df, payload.columns)

    if not payload.values:
        message = "At least one value field is required."
        _store_status(config_id, "failed", message, None)
        raise HTTPException(status_code=400, detail=message)

    value_columns = _resolve_columns(filtered_df, [value.field for value in payload.values])

    agg_map = {}
    for value_cfg, col in zip(payload.values, value_columns):
        agg_name = AGGREGATION_MAP.get(value_cfg.aggregation.lower())
        if not agg_name:
            _store_status(config_id, "failed", f"Unsupported aggregation {value_cfg.aggregation}", None)
            raise HTTPException(status_code=400, detail=f"Unsupported aggregation '{value_cfg.aggregation}'")
        agg_map[col] = agg_name

    try:
        include_margins = payload.grand_totals != "off"

        pivot_df = pd.pivot_table(
            filtered_df,
            index=row_fields if row_fields else None,
            columns=column_fields if column_fields else None,
            values=list(agg_map.keys()),
            aggfunc=agg_map,
            dropna=payload.dropna,
            fill_value=payload.fill_value,
            margins=include_margins,
            margins_name="Grand Total",
        )
    except Exception as exc:
        logger.exception("Pivot computation failed for %s", config_id)
        _store_status(config_id, "failed", f"Pivot computation failed: {exc}", None)
        raise HTTPException(status_code=400, detail=f"Pivot computation failed: {exc}")

    if include_margins:
        if payload.grand_totals in ("columns", "off") and row_fields:
            pivot_df = _drop_margin_rows(pivot_df)
        if payload.grand_totals in ("rows", "off"):
            pivot_df = _drop_margin_columns(pivot_df)

    series_converted = False
    if isinstance(pivot_df, pd.Series):
        pivot_df = pivot_df.to_frame(name=list(agg_map.keys())[0])
        series_converted = True

    column_hierarchy_nodes = _build_column_hierarchy_nodes(
        pivot_df, column_fields, list(agg_map.keys())
    )

    if row_fields:
        pivot_df = pivot_df.reset_index()
    else:
        if series_converted:
            pivot_df = pivot_df.T.reset_index(drop=True)
        else:
            pivot_df = pivot_df.reset_index(drop=True)

    pivot_df = _flatten_columns(pivot_df)

    records = [_convert_numpy(record) for record in pivot_df.to_dict(orient="records")]

    if payload.limit and len(records) > payload.limit:
        records = records[: payload.limit]

    order_lookup: Dict[str, int] = {}
    if row_fields:
        order_counter = 0
        for record in records:
            key_parts: List[str] = []
            for field in row_fields:
                raw_value = record.get(field)
                key_parts.append(f"{field}:{_value_to_key(raw_value)}")
                key = "|".join(key_parts)
                if key not in order_lookup:
                    order_lookup[key] = order_counter
                    order_counter += 1

    hierarchy_nodes = _build_hierarchy_nodes(
        filtered_df, row_fields, agg_map, order_lookup
    )

    updated_at = datetime.now(timezone.utc)

    _store_data(
        config_id,
        {
            "config_id": config_id,
            "status": "success",
            "updated_at": updated_at.isoformat(),
            "rows": len(records),
            "data": records,
            "hierarchy": hierarchy_nodes,
            "column_hierarchy": column_hierarchy_nodes,
        },
    )

    existing_config = _load_config(config_id) or {}
    config_to_save = {**existing_config, **payload.dict()}
    config_to_save["data_source"] = resolved_path
    config_to_save["updated_at"] = updated_at.isoformat()
    if "pivot_last_saved_path" in existing_config:
        config_to_save["pivot_last_saved_path"] = existing_config.get("pivot_last_saved_path")
    if "pivot_last_saved_at" in existing_config:
        config_to_save["pivot_last_saved_at"] = existing_config.get("pivot_last_saved_at")
    _store_config(config_id, config_to_save)

    _store_status(config_id, "success", None, len(records))

    return PivotComputeResponse(
        config_id=config_id,
        status="success",
        updated_at=updated_at,
        rows=len(records),
        data=records,
        hierarchy=hierarchy_nodes,
        column_hierarchy=column_hierarchy_nodes,
    )


def get_pivot_data(config_id: str) -> Dict[str, Any]:
    cached = _load_data(config_id)
    if not cached:
        raise HTTPException(status_code=404, detail="Pivot result not found")
    return cached


async def refresh_pivot(config_id: str) -> PivotRefreshResponse:
    config = _load_config(config_id)
    if not config:
        raise HTTPException(status_code=404, detail="No cached configuration for refresh")

    request = PivotComputeRequest(**config)
    result = await compute_pivot(config_id, request)
    return PivotRefreshResponse(
        config_id=config_id,
        status=result.status,
        updated_at=result.updated_at,
        rows=result.rows,
    )


def get_pivot_status(config_id: str) -> PivotStatusResponse:
    return _load_status(config_id)


async def save_pivot(config_id: str) -> PivotSaveResponse:
    cached = _load_data(config_id)
    if not cached:
        raise HTTPException(status_code=404, detail="No pivot data available to save")

    records = cached.get("data")
    if not records:
        raise HTTPException(status_code=400, detail="Cannot save empty pivot results")

    df = pd.DataFrame(records)
    timestamp = datetime.now(timezone.utc)

    prefix = await get_object_prefix()
    if isinstance(prefix, tuple):
        prefix = prefix[0]
    if not prefix.endswith("/"):
        prefix = f"{prefix}/"
    object_prefix = f"{prefix}pivot/"

    file_name = f"{config_id}_{timestamp.strftime('%Y%m%d_%H%M%S')}.arrow"

    table = pa.Table.from_pandas(df)
    sink = pa.BufferOutputStream()
    with ipc.new_file(sink, table.schema) as writer:
        writer.write_table(table)
    arrow_bytes = sink.getvalue().to_pybytes()

    ensure_minio_bucket()
    upload_result = upload_to_minio(arrow_bytes, file_name, object_prefix)
    if upload_result.get("status") != "success":
        raise HTTPException(
            status_code=500,
            detail=upload_result.get("error_message", "Failed to store pivot table"),
        )

    object_name = upload_result["object_name"]

    config = _load_config(config_id) or {}
    config["pivot_last_saved_path"] = object_name
    config["pivot_last_saved_at"] = timestamp.isoformat()
    _store_config(config_id, config)

    rows = cached.get("rows") or len(records)
    return PivotSaveResponse(
        config_id=config_id,
        status="success",
        object_name=object_name,
        updated_at=timestamp,
        rows=rows,
    )


