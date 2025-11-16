from __future__ import annotations

import json
import logging
import re
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
from app.core.feature_cache import feature_cache

from .schemas import (
    PivotComputeRequest,
    PivotComputeResponse,
    PivotRefreshResponse,
    PivotSaveRequest,
    PivotSaveResponse,
    PivotStatusResponse,
)


redis_client = feature_cache.router("pivot_table")

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
    "weighted_average": "weighted_average",
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


def _sort_hierarchy_nodes(
    nodes: List[Dict[str, Any]],
    row_fields: List[str],
    sorting: Dict[str, Any],
    value_columns: List[str],
) -> List[Dict[str, Any]]:
    """Sort hierarchy nodes hierarchically, preserving parent-child relationships.
    
    This function builds a tree structure, sorts at each level based on the sorting
    configuration, then flattens back to a list while preserving hierarchical order.
    
    Args:
        nodes: Flat list of hierarchy nodes
        row_fields: List of row field names (defines hierarchy levels)
        sorting: Sorting configuration dict {fieldName: {type: 'asc'|'desc'|'value_asc'|'value_desc', level: int, preserve_hierarchy: bool}}
        value_columns: List of value column names for value-based sorting
    
    Returns:
        Sorted flat list of hierarchy nodes with preserved parent-child relationships
    """
    if not nodes or not row_fields:
        return nodes
    
    # Build tree structure
    node_map: Dict[str, Dict[str, Any]] = {}
    roots: List[Dict[str, Any]] = []
    
    for node in nodes:
        key = node.get("key", "")
        if not key:
            continue
        # Create a copy with children list
        tree_node = {**node, "children": []}
        node_map[key] = tree_node
    
    # Build parent-child relationships
    for node in node_map.values():
        parent_key = node.get("parent_key")
        if parent_key and parent_key in node_map:
            node_map[parent_key]["children"].append(node)
        else:
            roots.append(node)
    
    # Helper to get sort value for a node
    def get_sort_value(node: Dict[str, Any], field: str, sort_type: str) -> Any:
        """Get the value to sort by for a node."""
        # Find the label for this field
        labels = node.get("labels", [])
        field_label = next((l for l in labels if l.get("field") == field), None)
        
        if sort_type in ("asc", "desc"):
            # Alphabetical sorting by field value
            if field_label:
                value = field_label.get("value")
                # Handle None/NaN values
                if value is None or (isinstance(value, float) and pd.isna(value)):
                    return ""  # Sort None/NaN to end
                return str(value).lower()
            return ""
        elif sort_type in ("value_asc", "value_desc"):
            # Value-based sorting by aggregated values
            values = node.get("values", {})
            # Sum all value columns for this node
            total = 0
            for col in value_columns:
                val = values.get(col)
                if isinstance(val, (int, float)) and not pd.isna(val):
                    total += val
            return total
        return 0
    
    # Helper to sort children of a node recursively
    def sort_node_children(node: Dict[str, Any], level: int) -> None:
        """Recursively sort node and its children."""
        children = node.get("children", [])
        if not children:
            return
        
        # Determine which field to sort by at this level
        if level < len(row_fields):
            field = row_fields[level]
            
            # Check if this field has sorting configured (case-insensitive)
            sort_config = None
            field_lower = field.lower()
            
            # First, try exact match
            if field in sorting:
                sort_config = sorting[field]
            else:
                # Try case-insensitive match
                for sort_field, config in sorting.items():
                    if sort_field.lower() == field_lower:
                        sort_config = config
                        break
                
                # If still not found, check if any sorting config targets this level
                if sort_config is None:
                    for sort_field, config in sorting.items():
                        if isinstance(config, dict):
                            config_level = config.get("level")
                            if config_level is not None and config_level == level:
                                # Check if this field matches (case-insensitive)
                                if sort_field.lower() == field_lower:
                                    sort_config = config
                                    break
            
            if sort_config:
                # Extract sort type
                if isinstance(sort_config, dict):
                    sort_type = sort_config.get("type", "asc")
                    preserve = sort_config.get("preserve_hierarchy", True)
                else:
                    sort_type = str(sort_config)
                    preserve = True
                
                # Sort children at this level
                ascending = sort_type in ("asc", "value_asc")
                
                # Get sort values
                children_with_sort = [
                    (child, get_sort_value(child, field, sort_type))
                    for child in children
                ]
                
                # Sort by the sort value
                children_with_sort.sort(
                    key=lambda x: x[1],
                    reverse=not ascending
                )
                
                # Handle None/NaN values - move to end
                if ascending:
                    children_with_sort.sort(
                        key=lambda x: (x[1] == "", x[1])
                    )
                else:
                    children_with_sort.sort(
                        key=lambda x: (x[1] != "", x[1]),
                        reverse=True
                    )
                
                # Update children order
                node["children"] = [child for child, _ in children_with_sort]
        
        # Recursively sort children's children
        for child in node["children"]:
            sort_node_children(child, level + 1)
    
    # Sort root nodes
    if roots:
        # Sort root level (level 0)
        if 0 < len(row_fields):
            field = row_fields[0]
            field_lower = field.lower()
            
            # Try to find sort config (case-insensitive)
            sort_config = None
            if field in sorting:
                sort_config = sorting[field]
            else:
                for sort_field, config in sorting.items():
                    if sort_field.lower() == field_lower:
                        sort_config = config
                        break
            
            if sort_config:
                if isinstance(sort_config, dict):
                    sort_type = sort_config.get("type", "asc")
                else:
                    sort_type = str(sort_config)
                
                ascending = sort_type in ("asc", "value_asc")
                roots_with_sort = [
                    (root, get_sort_value(root, field, sort_type))
                    for root in roots
                ]
                roots_with_sort.sort(
                    key=lambda x: x[1],
                    reverse=not ascending
                )
                # Handle None/NaN
                if ascending:
                    roots_with_sort.sort(key=lambda x: (x[1] == "", x[1]))
                else:
                    roots_with_sort.sort(key=lambda x: (x[1] != "", x[1]), reverse=True)
                roots = [root for root, _ in roots_with_sort]
        
        # Recursively sort all children
        for root in roots:
            sort_node_children(root, 1)
    
    # Flatten tree back to list (depth-first traversal)
    # Update order property to reflect the new sorted order
    def flatten_tree(node: Dict[str, Any], result: List[Dict[str, Any]], order_counter: List[int]) -> None:
        """Flatten tree node and its children to result list, updating order property."""
        # Create a copy without children for the result
        node_copy = {k: v for k, v in node.items() if k != "children"}
        # Update order to reflect sorted position
        node_copy["order"] = order_counter[0]
        order_counter[0] += 1
        result.append(node_copy)
        
        # Add children (already sorted)
        for child in node.get("children", []):
            flatten_tree(child, result, order_counter)
    
    sorted_nodes: List[Dict[str, Any]] = []
    order_counter = [0]
    for root in roots:
        flatten_tree(root, sorted_nodes, order_counter)
    
    # Preserve any nodes that weren't in the tree (shouldn't happen, but defensive)
    existing_keys = {node.get("key") for node in sorted_nodes}
    for node in nodes:
        if node.get("key") not in existing_keys:
            node_copy = dict(node)
            node_copy["order"] = order_counter[0]
            order_counter[0] += 1
            sorted_nodes.append(node_copy)
    
    return sorted_nodes


def _build_hierarchy_nodes(
    df: pd.DataFrame,
    row_fields: List[str],
    column_fields: List[str],
    agg_map: Dict[str, str],
    order_lookup: Dict[str, int],
    leaf_columns: List[str],
    column_meta: Dict[str, Dict[str, Any]],
    include_grand_total: bool = False,
    grand_total_values: Optional[Dict[str, Any]] = None,
) -> List[Dict[str, Any]]:
    if not row_fields:
        return []

    nodes: List[Dict[str, Any]] = []

    has_column_fields = (
        len(column_fields) > 0 and len(leaf_columns) > 0 and len(column_meta) > 0
    )

    columns_by_key: Dict[tuple, List[str]] = {}
    column_value_field_lookup: Dict[str, Optional[str]] = {}
    if has_column_fields:
        for column_name in leaf_columns:
            meta = column_meta.get(column_name, {})
            value_field = meta.get("value_field")
            if not value_field and len(agg_map) == 1:
                value_field = next(iter(agg_map.keys()))
            column_value_field_lookup[column_name] = value_field

            key_tuple = meta.get("column_key")
            if key_tuple is None:
                key_tuple = tuple("" for _ in column_fields)
            columns_by_key.setdefault(key_tuple, []).append(column_name)

    for depth in range(len(row_fields)):
        group_fields = row_fields[: depth + 1]
        aggregate_fields = (
            group_fields + column_fields if has_column_fields else group_fields
        )

        try:
            grouped = (
                df.groupby(aggregate_fields, dropna=False)
                .agg(agg_map)
                .reset_index()
            )
        except Exception as exc:  # pragma: no cover - defensive
            logger.exception(
                "Failed to build hierarchy for fields %s: %s", aggregate_fields, exc
            )
            continue

        grouped = _flatten_columns(grouped)

        totals_lookup: Dict[tuple, pd.Series] = {}
        grand_total_columns: List[str] = []

        if has_column_fields:
            if group_fields:
                grouped_iter = grouped.groupby(group_fields, dropna=False)
            else:
                grouped_iter = [(tuple(), grouped)]

            try:
                totals_grouped = (
                    df.groupby(group_fields, dropna=False).agg(agg_map).reset_index()
                )
            except Exception:  # pragma: no cover - defensive
                totals_grouped = pd.DataFrame()

            if not totals_grouped.empty:
                totals_grouped = _flatten_columns(totals_grouped)
                for _, total_row in totals_grouped.iterrows():
                    key_tuple = tuple(
                        _value_to_key(total_row.get(field)) for field in group_fields
                    )
                    totals_lookup[key_tuple] = total_row

            def _is_grand_total_column(column_name: str) -> bool:
                meta = column_meta.get(column_name, {})
                key_tuple = meta.get("column_key")
                if not key_tuple:
                    return False
                seen_total = False
                for part in key_tuple:
                    normalized = str(part).strip().lower()
                    if normalized == "grand total":
                        seen_total = True
                        continue
                    if normalized not in {"", "__na__"}:
                        return False
                return seen_total

            grand_total_columns = [
                name for name in leaf_columns if _is_grand_total_column(name)
            ]
        else:
            grouped_iter = [
                (
                    tuple(row[field] for field in group_fields),
                    pd.DataFrame([row]),
                )
                for _, row in grouped.iterrows()
            ]

        for group_key, subset in grouped_iter:
            if not isinstance(group_key, tuple):
                group_key = (group_key,)

            labels: List[Dict[str, Any]] = []
            key_parts: List[str] = []

            for field, value in zip(group_fields, group_key):
                labels.append({"field": field, "value": _convert_numpy(value)})
                key_parts.append(f"{field}:{_value_to_key(value)}")

            key = "|".join(key_parts)
            parent_key = "|".join(key_parts[:-1]) if len(key_parts) > 1 else None

            normalized_group_key = tuple(_value_to_key(value) for value in group_key)

            values: Dict[str, Any] = {}

            if has_column_fields:
                for _, row in subset.iterrows():
                    column_key = tuple(
                        _value_to_key(row.get(field)) for field in column_fields
                    )
                    matched_columns = columns_by_key.get(column_key, [])
                    for column_name in matched_columns:
                        value_field = column_value_field_lookup.get(column_name)
                        if not value_field:
                            continue
                        raw_value = row.get(column_name)
                        if raw_value is None:
                            raw_value = row.get(value_field)
                        values[column_name] = _convert_numpy(raw_value)

                if grand_total_columns and normalized_group_key in totals_lookup:
                    totals_row = totals_lookup[normalized_group_key]
                    for column_name in grand_total_columns:
                        if column_name in values:
                            continue
                        value_field = column_value_field_lookup.get(column_name)
                        if not value_field:
                            continue
                        raw_total = totals_row.get(value_field)
                        if raw_total is None:
                            raw_total = totals_row.get(column_name)
                        values[column_name] = _convert_numpy(raw_total)
            else:
                row = subset.iloc[0]
                for col in grouped.columns:
                    if col in group_fields:
                        continue
                    if col in agg_map:
                        values[col] = _convert_numpy(row[col])

            order = order_lookup.get(key, len(order_lookup) + len(nodes))

            nodes.append(
                {
                    "key": key,
                    "parent_key": parent_key,
                    "level": depth,
                    "order": order,
                    "labels": labels,
                    "values": values,
                }
            )

    if include_grand_total and row_fields:
        existing_orders = [node.get("order", 0) for node in nodes]
        next_order = (max(existing_orders) + 1) if existing_orders else 0
        labels: List[Dict[str, Any]] = [
            {"field": row_fields[0], "value": "Grand Total"}
        ]
        # Use provided grand_total_values or empty dict
        grand_total_vals = grand_total_values if grand_total_values is not None else {}
        grand_total_node = {
            "key": "__grand_total__",
            "parent_key": None,
            "level": 0,
            "order": next_order,
            "labels": labels,
            "values": grand_total_vals,
        }
        nodes.append(grand_total_node)

    return nodes


def _build_column_hierarchy_nodes(
    df: pd.DataFrame,
    column_fields: List[str],
    value_columns: List[str],
) -> tuple[List[Dict[str, Any]], List[str], Dict[str, Dict[str, Any]]]:
    include_value_level = len(value_columns) > 1 or not column_fields
    total_levels = len(column_fields) + (1 if include_value_level else 0)
    if total_levels == 0:
        return [], [], {}

    if isinstance(df.columns, pd.MultiIndex):
        column_iterable = [tuple(col) for col in df.columns.tolist()]
    else:
        column_iterable = [(col,) for col in df.columns.tolist()]

    nodes: Dict[str, Dict[str, Any]] = {}
    leaf_columns: List[str] = []
    column_meta: Dict[str, Dict[str, Any]] = {}

    normalized_fields = [field or "" for field in column_fields]
    field_count = len(normalized_fields)

    for order, col_tuple in enumerate(column_iterable):
        tuple_parts = list(col_tuple)
        if not tuple_parts:
            continue

        column_name = _format_column_label(col_tuple)

        # Pandas returns MultiIndex columns with value fields leading, followed by
        # the configured column field hierarchy. Extract the value portion and the
        # column field values so we can build a tree that mirrors the desired
        # header layout (column fields first, value fields last).
        column_values: List[Any] = []
        value_label: Any = None

        if field_count:
            column_values = tuple_parts[-field_count:]
            remaining = tuple_parts[: len(tuple_parts) - field_count]
        else:
            column_values = []
            remaining = tuple_parts

        if include_value_level:
            if remaining:
                value_label = remaining[-1]
            else:
                # When pandas flattens the columns into a single level (e.g. only
                # one value field with no column fields), reuse the column name so
                # the frontend can still render a value header.
                value_label = tuple_parts[-1] if tuple_parts else ""

        path_entries: List[tuple[str, Any]] = []

        for index, field in enumerate(normalized_fields):
            value = column_values[index] if index < len(column_values) else ""
            path_entries.append((field, value))

        if include_value_level:
            fallback_value = value_columns[0] if value_columns else ""
            path_entries.append(("__value__", value_label if value_label is not None else fallback_value))

        if not path_entries:
            continue

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
                if column_name not in leaf_columns:
                    leaf_columns.append(column_name)

                labels = node.get("labels", [])
                value_field: Optional[str] = None
                for label in labels:
                    if label.get("field") == "__value__":
                        raw_value = label.get("value")
                        value_field = str(raw_value) if raw_value is not None else None

                if not value_field and len(value_columns) == 1:
                    value_field = value_columns[0]

                column_values_map: Dict[str, Any] = {}
                for idx, field in enumerate(normalized_fields):
                    column_values_map[field] = _convert_numpy(
                        column_values[idx] if idx < len(column_values) else ""
                    )

                column_meta[column_name] = {
                    "value_field": value_field,
                    "column_fields": column_values_map,
                    "column_key": tuple(
                        _value_to_key(column_values[idx] if idx < len(column_values) else "")
                        for idx in range(field_count)
                    ),
                }

    ordered_nodes = sorted(
        nodes.values(), key=lambda item: (item["level"], item["order"])
    )
    return ordered_nodes, leaf_columns, column_meta


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


def _apply_sorting(
    pivot_df: pd.DataFrame,
    row_fields: List[str],
    column_fields: List[str],
    sorting: Dict[str, Any],
    value_columns: List[str],
    agg_map: Dict[str, Any],
) -> pd.DataFrame:
    """Apply sorting to pivot table based on sorting configuration.
    
    Args:
        pivot_df: The computed pivot DataFrame (may have MultiIndex)
        row_fields: List of row field names
        column_fields: List of column field names
        sorting: Dict mapping field names to sort configs {type: 'asc'|'desc'|'value_asc'|'value_desc'}
        value_columns: List of value column names for value-based sorting
        agg_map: Aggregation map for identifying value columns
    
    Returns:
        Sorted pivot DataFrame
    """
    if not sorting:
        return pivot_df
    
    result_df = pivot_df.copy()
    
    # Apply row field sorting
    for field in row_fields:
        if field not in sorting:
            continue
        
        sort_config = sorting[field]
        sort_type = sort_config.get("type") if isinstance(sort_config, dict) else sort_config
        
        if sort_type in ("asc", "desc"):
            # Alphabetical sorting on row index
            if isinstance(result_df.index, pd.MultiIndex):
                # Find the level of this field
                field_level = None
                for level_idx, level_name in enumerate(result_df.index.names):
                    if level_name == field:
                        field_level = level_idx
                        break
                
                if field_level is not None:
                    ascending = sort_type == "asc"
                    result_df = result_df.sort_index(level=field_level, ascending=ascending, sort_remaining=False)
            else:
                # Single index
                if result_df.index.name == field:
                    ascending = sort_type == "asc"
                    result_df = result_df.sort_index(ascending=ascending)
        
        elif sort_type in ("value_asc", "value_desc"):
            # Sort by aggregated value
            ascending = sort_type == "value_asc"
            
            # Use first value column for sorting (or sum of all if multiple)
            if value_columns:
                # Calculate sum across all value columns for each row
                if isinstance(result_df.index, pd.MultiIndex):
                    # For MultiIndex, we need to sort by the sum of value columns
                    sort_values = result_df[value_columns].sum(axis=1, numeric_only=True)
                    sort_indices = sort_values.argsort()
                    if not ascending:
                        sort_indices = sort_indices[::-1]
                    result_df = result_df.iloc[sort_indices]
                else:
                    # Single index
                    sort_values = result_df[value_columns].sum(axis=1, numeric_only=True)
                    sort_indices = sort_values.argsort()
                    if not ascending:
                        sort_indices = sort_indices[::-1]
                    result_df = result_df.iloc[sort_indices]
    
    # Apply column field sorting
    for field in column_fields:
        if field not in sorting:
            continue
        
        sort_config = sorting[field]
        sort_type = sort_config.get("type") if isinstance(sort_config, dict) else sort_config
        
        if sort_type in ("asc", "desc"):
            # Alphabetical sorting on column index
            if isinstance(result_df.columns, pd.MultiIndex):
                # Find the level of this field
                field_level = None
                for level_idx, level_name in enumerate(result_df.columns.names):
                    if level_name == field:
                        field_level = level_idx
                        break
                
                if field_level is not None:
                    ascending = sort_type == "asc"
                    result_df = result_df.sort_index(axis=1, level=field_level, ascending=ascending, sort_remaining=False)
            else:
                # Single column index (shouldn't happen with column fields, but handle it)
                ascending = sort_type == "asc"
                result_df = result_df.sort_index(axis=1, ascending=ascending)
        
        elif sort_type in ("value_asc", "value_desc"):
            # Sort columns by aggregated value (sum across rows)
            ascending = sort_type == "value_asc"
            
            if isinstance(result_df.columns, pd.MultiIndex):
                # Calculate sum across rows for each column
                column_sums = result_df.sum(axis=0, numeric_only=True)
                sorted_cols = column_sums.sort_values(ascending=ascending).index
                result_df = result_df.reindex(columns=sorted_cols)
            else:
                # Single column index
                column_sums = result_df.sum(axis=0, numeric_only=True)
                sorted_cols = column_sums.sort_values(ascending=ascending).index
                result_df = result_df.reindex(columns=sorted_cols)
    
    return result_df


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

    # Pass parts separately so cache router can normalize them properly
    # The cache router already adds the feature name, so we just need config_id and suffix
    redis_client.setex((config_id, "status"), PIVOT_CACHE_TTL, _ensure_redis_json(payload))


def _store_data(config_id: str, data: Dict[str, Any]) -> None:
    # Pass parts separately so cache router can normalize them properly
    # The cache router already adds the feature name, so we just need config_id and suffix
    redis_client.setex((config_id, "data"), PIVOT_CACHE_TTL, _ensure_redis_json(data))


def _store_config(config_id: str, config: Dict[str, Any]) -> None:
    # Pass parts separately so cache router can normalize them properly
    # The cache router already adds the feature name, so we just need config_id and suffix
    redis_client.setex((config_id, "config"), PIVOT_CACHE_TTL, _ensure_redis_json(config))


def _load_config(config_id: str) -> Optional[Dict[str, Any]]:
    # Pass parts separately so cache router can normalize them properly
    # The cache router already adds the feature name, so we just need config_id and suffix
    raw = redis_client.get((config_id, "config"))
    return _decode_redis_json(raw)


def _load_data(config_id: str) -> Optional[Dict[str, Any]]:
    # Pass parts separately so cache router can normalize them properly
    # The cache router already adds the feature name, so we just need config_id and suffix
    raw = redis_client.get((config_id, "data"))
    return _decode_redis_json(raw)


def _load_status(config_id: str) -> PivotStatusResponse:
    # Pass parts separately so cache router can normalize them properly
    # The cache router already adds the feature name, so we just need config_id and suffix
    data = _decode_redis_json(redis_client.get((config_id, "status"))) or {}
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
    logger.info("Pivot compute payload - sorting: %s, rows: %s, columns: %s", payload.sorting, payload.rows, payload.columns)
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

    # Validate weighted average configurations
    weight_column_map = {}
    for value_cfg, col in zip(payload.values, value_columns):
        if value_cfg.aggregation.lower() == "weighted_average":
            if not value_cfg.weight_column:
                message = f"Weight column is required for weighted_average aggregation on field '{col}'"
                _store_status(config_id, "failed", message, None)
                raise HTTPException(status_code=400, detail=message)
            
            weight_col_resolved = _resolve_columns(filtered_df, [value_cfg.weight_column])
            if not weight_col_resolved:
                message = f"Weight column '{value_cfg.weight_column}' not found in dataset"
                _store_status(config_id, "failed", message, None)
                raise HTTPException(status_code=404, detail=message)
            
            weight_col = weight_col_resolved[0]
            
            # Validate weight column is numeric
            if not pd.api.types.is_numeric_dtype(filtered_df[weight_col]):
                message = f"Weight column '{weight_col}' must contain numeric values"
                _store_status(config_id, "failed", message, None)
                raise HTTPException(status_code=400, detail=message)
            
            weight_column_map[col] = weight_col

    def make_weighted_avg_func(weight_column_name: str, df: pd.DataFrame):
        """Factory function to create weighted average aggregator with proper closure."""
        def weighted_avg(values):
            # Get the corresponding weights for these values
            # In pandas groupby context, values is a Series with an index
            try:
                weights = df.loc[values.index, weight_column_name]
            except KeyError:
                return np.nan
            
            # Filter out null/nan values and non-positive weights
            mask = values.notna() & weights.notna() & (weights > 0)
            valid_values = values[mask]
            valid_weights = weights[mask]
            
            if len(valid_values) == 0 or valid_weights.sum() == 0:
                return np.nan
            
            return (valid_values * valid_weights).sum() / valid_weights.sum()
        
        return weighted_avg

    agg_map = {}
    for value_cfg, col in zip(payload.values, value_columns):
        agg_name = AGGREGATION_MAP.get(value_cfg.aggregation.lower())
        if not agg_name:
            _store_status(config_id, "failed", f"Unsupported aggregation {value_cfg.aggregation}", None)
            raise HTTPException(status_code=400, detail=f"Unsupported aggregation '{value_cfg.aggregation}'")
        
        if agg_name == "weighted_average":
            # Create custom weighted average function for this column
            weight_col = weight_column_map[col]
            agg_map[col] = make_weighted_avg_func(weight_col, filtered_df)
        else:
            agg_map[col] = agg_name

    try:
        include_margins = payload.grand_totals != "off"

        # Create pivot table with margins
        # When margins=True, pandas calculates grand totals by applying the aggregation
        # function to the ENTIRE dataset (not to the aggregated group values):
        # - For 'min': grand total = min(all values in dataset) = overall minimum (CORRECT)
        # - For 'max': grand total = max(all values in dataset) = overall maximum (CORRECT)
        # - For 'sum': grand total = sum(all values in dataset) = overall sum (CORRECT)
        # - For 'mean': grand total = mean(all values in dataset) = overall mean (CORRECT)
        # - For 'count': grand total = count(all values in dataset) = overall count (CORRECT)
        # This ensures grand totals accurately represent the aggregation across all data
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

    # Apply column field sorting before reset_index (columns need to be sorted on MultiIndex)
    logger.info("Checking sorting - payload.sorting: %s, type: %s", payload.sorting, type(payload.sorting))
    
    if payload.sorting and column_fields:
        sorting_dict = {}
        for k, v in payload.sorting.items():
            if hasattr(v, 'dict'):
                sorting_dict[k] = v.dict()
            elif hasattr(v, 'type'):
                sorting_dict[k] = {'type': v.type}
            else:
                sorting_dict[k] = v
        
        # Only sort columns here (rows will be sorted after reset_index)
        for field in column_fields:
            if field not in sorting_dict:
                continue
            
            sort_config = sorting_dict[field]
            sort_type = sort_config.get("type") if isinstance(sort_config, dict) else sort_config
            
            if sort_type in ("asc", "desc"):
                if isinstance(pivot_df.columns, pd.MultiIndex):
                    field_level = None
                    for level_idx, level_name in enumerate(pivot_df.columns.names):
                        if level_name == field:
                            field_level = level_idx
                            break
                    
                    if field_level is not None:
                        ascending = sort_type == "asc"
                        pivot_df = pivot_df.sort_index(axis=1, level=field_level, ascending=ascending, sort_remaining=False)
            elif sort_type in ("value_asc", "value_desc"):
                ascending = sort_type == "value_asc"
                if isinstance(pivot_df.columns, pd.MultiIndex):
                    column_sums = pivot_df.sum(axis=0, numeric_only=True)
                    sorted_cols = column_sums.sort_values(ascending=ascending).index
                    pivot_df = pivot_df.reindex(columns=sorted_cols)

    series_converted = False
    if isinstance(pivot_df, pd.Series):
        pivot_df = pivot_df.to_frame(name=list(agg_map.keys())[0])
        series_converted = True

    # Add column grand totals when requested and there are no column fields
    include_column_totals = include_margins and payload.grand_totals in ("columns", "both")
    value_columns_list = list(agg_map.keys())
    
    if include_column_totals and not column_fields:
        # Create Grand Total column for all aggregations
        # For column totals, we calculate the total across value columns for each row
        # For sum/mean/count: sum the value columns
        # For min: take the minimum across value columns
        # For max: take the maximum across value columns
        
        # Check if all columns use the same aggregation type
        agg_types = set(agg_map.get(col) for col in value_columns_list if col in pivot_df.columns)
        
        if len(agg_types) == 1:
            # All same aggregation type - create one Grand Total column
            agg_type = next(iter(agg_types))
            available_cols = [col for col in value_columns_list if col in pivot_df.columns]
            
            if available_cols and (agg_type == "sum" or (isinstance(agg_type, str) and agg_type in ["sum", "mean", "count", "min", "max"])):
                # Sum across value columns for each row
                pivot_df["Grand Total"] = pivot_df[available_cols].sum(axis=1, numeric_only=True)
                value_columns_list.append("Grand Total")
            # Note: For callable aggregations (like weighted_average), we skip creating column totals
            # as they require the original data and weights, not just the aggregated values
        else:
            # Mixed aggregation types - create separate Grand Total columns for each aggregation type
            # Group columns by aggregation type
            cols_by_agg = {}
            for col in value_columns_list:
                if col in pivot_df.columns:
                    agg_func = agg_map.get(col)
                    if agg_func not in cols_by_agg:
                        cols_by_agg[agg_func] = []
                    cols_by_agg[agg_func].append(col)
            
            # Create a Grand Total column for each aggregation type
            for agg_func, cols in cols_by_agg.items():
                if not cols:
                    continue
                
                grand_total_col_name = None
                if agg_func == "sum" or (isinstance(agg_func, str) and agg_func in ["sum", "mean", "count", "min", "max"]):
                    grand_total_col_name = "Grand Total (Sum)" if len(cols_by_agg) > 1 else "Grand Total"
                    pivot_df[grand_total_col_name] = pivot_df[cols].sum(axis=1, numeric_only=True)
                    value_columns_list.append(grand_total_col_name)
                # Note: For callable aggregations (like weighted_average), we skip creating column totals
                # as they require the original data and weights, not just the aggregated values

    (
        column_hierarchy_nodes,
        column_leaf_columns,
        column_leaf_meta,
    ) = _build_column_hierarchy_nodes(
        pivot_df, column_fields, value_columns_list
    )

    if row_fields:
        pivot_df = pivot_df.reset_index()
    else:
        if series_converted:
            pivot_df = pivot_df.T.reset_index(drop=True)
        else:
            pivot_df = pivot_df.reset_index(drop=True)

    pivot_df = _flatten_columns(pivot_df)

    # Apply sorting again after reset_index and flattening (for value-based sorting and to ensure order is preserved)
    if payload.sorting:
        sorting_dict = {}
        for k, v in payload.sorting.items():
            if hasattr(v, 'dict'):
                sorting_dict[k] = v.dict()
            elif hasattr(v, 'type'):
                sorting_dict[k] = {'type': v.type}
            elif isinstance(v, dict):
                sorting_dict[k] = v
            else:
                sorting_dict[k] = v
        
        logger.info("Sorting dict after conversion: %s", sorting_dict)
        
        # Create case-insensitive lookup for sorting
        sorting_lookup = {}
        for k, v in sorting_dict.items():
            sorting_lookup[k.lower()] = (k, v)  # Store original key and value
        
        # Get actual value columns that exist in the flattened DataFrame (exclude Grand Total and row fields)
        actual_value_cols = [
            col for col in pivot_df.columns 
            if col not in row_fields and 'grand total' not in col.lower()
        ]
        
        logger.info("Available columns for sorting: %s, Row fields: %s, Value cols: %s", 
                     list(pivot_df.columns), row_fields, actual_value_cols)
        logger.info("Sorting lookup (case-insensitive): %s", sorting_lookup)
        
        # Sort the flattened DataFrame
        for field in row_fields:
            field_lower = field.lower()
            if field_lower not in sorting_lookup:
                logger.info("Field %s (lowercase: %s) not in sorting_lookup, skipping", field, field_lower)
                continue
            
            original_key, sort_config = sorting_lookup[field_lower]
            sort_type = sort_config.get("type") if isinstance(sort_config, dict) else sort_config
            
            logger.info("Applying sort to field %s (original key: %s): type=%s", field, original_key, sort_type)
            
            if sort_type in ("asc", "desc"):
                # Alphabetical sorting on the field column
                if field in pivot_df.columns:
                    ascending = sort_type == "asc"
                    logger.info("Sorting DataFrame by field %s, ascending=%s, before shape: %s", field, ascending, pivot_df.shape)
                    # Convert column to string to handle mixed types (str and int) for alphabetical sorting
                    # Create a temporary column for sorting that converts all values to strings
                    temp_sort_col = f"__temp_sort_{field}__"
                    pivot_df[temp_sort_col] = pivot_df[field].astype(str)
                    # Replace 'nan' and 'None' strings with empty string for proper sorting
                    pivot_df[temp_sort_col] = pivot_df[temp_sort_col].replace('nan', '').replace('None', '')
                    # Sort by the temporary column
                    pivot_df = pivot_df.sort_values(by=temp_sort_col, ascending=ascending, na_position='last')
                    # Drop the temporary column
                    pivot_df = pivot_df.drop(columns=[temp_sort_col])
                    logger.info("Sorted by %s %s, after shape: %s", field, sort_type, pivot_df.shape)
                else:
                    logger.warning("Field %s not found in pivot_df.columns: %s", field, list(pivot_df.columns))
            elif sort_type in ("value_asc", "value_desc"):
                # Sort by aggregated value (sum of value columns)
                ascending = sort_type == "value_asc"
                if actual_value_cols:
                    logger.info("Sorting by value, using columns: %s", actual_value_cols)
                    # Calculate sum across value columns for each row
                    sort_values = pivot_df[actual_value_cols].sum(axis=1, numeric_only=True)
                    sort_indices = sort_values.argsort()
                    if not ascending:
                        sort_indices = sort_indices[::-1]
                    pivot_df = pivot_df.iloc[sort_indices]
                    logger.info("Sorted by value %s, shape: %s", sort_type, pivot_df.shape)
                else:
                    logger.warning("No value columns available for sorting")
        
        # For column fields, we need to sort columns (this is trickier after flattening)
        # Column sorting is mainly handled in the column hierarchy building

    records = [_convert_numpy(record) for record in pivot_df.to_dict(orient="records")]

    effective_leaf_columns = (
        column_leaf_columns if column_leaf_columns else value_columns_list
    )

    include_grand_total_row = include_margins and payload.grand_totals in ("rows", "both")

    # Extract grand total row values from pivot_df BEFORE applying limit
    # (See comment above for how pandas calculates margins for min/max)
    grand_total_values = {}
    grand_total_record = None
    if include_grand_total_row and row_fields:
        # After reset_index, the Grand Total row should be in the records
        # Find it and extract its values BEFORE applying any limit
        for record in records:
            # Check if this is the Grand Total row
            # The Grand Total row will have "Grand Total" in at least one row field
            # (typically the first one, but check all to be safe)
            is_grand_total = any(
                record.get(field) == "Grand Total" for field in row_fields
            )
            if is_grand_total:
                grand_total_record = record
                break
        
        if grand_total_record:
            # Extract all value columns from the Grand Total row
            for col in effective_leaf_columns:
                if col in grand_total_record and col not in row_fields:
                    grand_total_values[col] = grand_total_record[col]
            
            # Log the aggregations being used for verification
            agg_info = {}
            for col in effective_leaf_columns:
                if col in grand_total_values:
                    if column_leaf_meta and col in column_leaf_meta:
                        value_field = column_leaf_meta[col].get("value_field", col)
                        agg_info[col] = agg_map.get(value_field, "unknown")
                    else:
                        agg_info[col] = agg_map.get(col, "unknown")
            logger.debug(
                "Extracted grand total values for config_id=%s (aggregations: %s): %s",
                config_id,
                agg_info,
                grand_total_values,
            )
        else:
            logger.warning(
                "Grand total row requested but not found in records for config_id=%s. "
                "Total records: %d, Row fields: %s",
                config_id,
                len(records),
                row_fields,
            )

    # Apply limit AFTER extracting grand total row (if limit would cut it off, exclude grand total from limit)
    if payload.limit and len(records) > payload.limit:
        # If we have a grand total row, we need to preserve it even if it's beyond the limit
        if grand_total_record:
            # Remove grand total from records, apply limit, then add it back at the end
            records_without_total = [
                r for r in records
                if not any(r.get(field) == "Grand Total" for field in row_fields)
            ]
            records = records_without_total[: payload.limit]
            # Add grand total row at the end
            records.append(grand_total_record)
        else:
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
        filtered_df,
        row_fields,
        column_fields,
        agg_map,
        order_lookup,
        effective_leaf_columns,
        column_leaf_meta,
        include_grand_total=include_grand_total_row,
        grand_total_values=grand_total_values,
    )
    
    # Apply hierarchical sorting if sorting is configured
    if hierarchy_nodes and payload.sorting and row_fields:
        # Convert Pydantic models to dicts if needed
        sorting_dict = {}
        for k, v in payload.sorting.items():
            if hasattr(v, 'dict'):
                sorting_dict[k] = v.dict()
            elif hasattr(v, 'type'):
                sorting_dict[k] = {'type': v.type, 'level': getattr(v, 'level', None), 'preserve_hierarchy': getattr(v, 'preserve_hierarchy', True)}
            elif isinstance(v, dict):
                sorting_dict[k] = v
            else:
                sorting_dict[k] = {'type': str(v)}
        
        hierarchy_nodes = _sort_hierarchy_nodes(
            hierarchy_nodes,
            row_fields,
            sorting_dict,
            effective_leaf_columns,
        )
    elif hierarchy_nodes:
        # Fallback to simple order-based sorting
        hierarchy_nodes.sort(key=lambda node: node.get("order", 0))

    updated_at = datetime.now(timezone.utc)

    data_to_store = {
        "config_id": config_id,
        "status": "success",
        "updated_at": updated_at.isoformat(),
        "rows": len(records),
        "data": records,
        "hierarchy": hierarchy_nodes,
        "column_hierarchy": column_hierarchy_nodes,
    }
    logger.info("compute_pivot: Storing data for config_id=%s with key parts=(%s, data)", config_id, config_id)
    _store_data(config_id, data_to_store)
    # Verify data was stored correctly
    verification = _load_data(config_id)
    if verification:
        logger.info("compute_pivot: Data verified in cache for config_id=%s, rows=%s", config_id, verification.get("rows", 0))
    else:
        logger.error("compute_pivot: WARNING - Data was not found in cache immediately after storing for config_id=%s", config_id)

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


async def save_pivot(config_id: str, payload: Optional[PivotSaveRequest] = None) -> PivotSaveResponse:
    logger.info("save_pivot called with config_id=%s", config_id)
    cached = _load_data(config_id)
    logger.info("save_pivot: cached data exists=%s", cached is not None)
    if not cached:
        # Try to get more info about what's in Redis
        import urllib.parse
        decoded_config_id = urllib.parse.unquote(config_id)
        if decoded_config_id != config_id:
            logger.info("save_pivot: trying decoded config_id=%s", decoded_config_id)
            cached = _load_data(decoded_config_id)
            if cached:
                config_id = decoded_config_id
        if not cached:
            # Log what keys exist in Redis for debugging
            # Note: FeatureCacheRouter doesn't have a keys() method, so we can't list keys
            logger.warning("save_pivot: No data found for config_id=%s. Key parts used: (%s, data)", config_id, config_id)
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

    # Determine filename: use provided filename for save_as, or standard filename for save (always overwrites)
    config = _load_config(config_id) or {}
    
    if payload and payload.filename:
        # Save As: create new file with provided filename
        file_name = payload.filename.strip()
        if not file_name.endswith('.arrow'):
            file_name = f"{file_name}.arrow"
    else:
        # Save: always use the same filename (creates or overwrites)
        # Remove numbers from config_id for cleaner filename
        clean_config_id = re.sub(r'\d+', '', config_id).strip('-').strip('_')
        file_name = f"{clean_config_id}.arrow" if clean_config_id else f"pivot_{config_id}.arrow"

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

    # Update config with saved path
    # Always update last_saved_path
    config["pivot_last_saved_path"] = object_name
    config["pivot_last_saved_at"] = timestamp.isoformat()
    
    # Update first_saved_path only if this is a Save operation (not Save As)
    if not (payload and payload.filename):
        config["pivot_first_saved_path"] = object_name
        config["pivot_first_saved_at"] = timestamp.isoformat()
    
    _store_config(config_id, config)

    rows = cached.get("rows") or len(records)
    return PivotSaveResponse(
        config_id=config_id,
        status="success",
        object_name=object_name,
        updated_at=timestamp,
        rows=rows,
    )