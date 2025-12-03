from __future__ import annotations

import io
import json
import logging
import os
import re
from collections import defaultdict
from datetime import datetime
from typing import Any, Dict, List, Optional, Sequence, Tuple

import numpy as np
import pandas as pd
import pyarrow as pa
import pyarrow.ipc as ipc
from pymongo import MongoClient
from sklearn.preprocessing import MinMaxScaler, StandardScaler
from statsmodels.tsa.seasonal import STL

from .create.base import calculate_residuals, compute_rpi
from .deps import (
    MINIO_BUCKET,
    get_minio_df,
    minio_client,
    redis_client,
    redis_classifier_config,
)


logger = logging.getLogger("app.features.createcolumn.service")

MONGO_URI = os.getenv(
    "CREATECOLUMN_MONGO_URI",
    os.getenv("MONGO_URI", "mongodb://mongo:27017"),
)
MONGO_DB = os.getenv("CREATECOLUMN_MONGO_DB", os.getenv("MONGO_DB", "trinity_db"))

_mongo_client: Optional[MongoClient] = None


def _get_mongo_client() -> MongoClient:
    global _mongo_client
    if _mongo_client is None:
        _mongo_client = MongoClient(MONGO_URI)
    return _mongo_client


def _ensure_arrow_bytes(dataframe: pd.DataFrame) -> bytes:
    table = pa.Table.from_pandas(dataframe)
    buffer = pa.BufferOutputStream()
    with ipc.new_file(buffer, table.schema) as writer:
        writer.write_table(table)
    return buffer.getvalue().to_pybytes()


class FormPayload:
    """Helper to provide dict-like access to multipart form data."""

    def __init__(self, items: Sequence[Tuple[str, str]] | None = None) -> None:
        self._items: List[Tuple[str, str]] = [
            (str(key), str(value)) for key, value in (items or [])
        ]
        self._map: Dict[str, List[str]] = defaultdict(list)
        for key, value in self._items:
            self._map[key].append(value)

    def get(self, key: str, default: Optional[str] = None) -> Optional[str]:
        values = self._map.get(key)
        if not values:
            return default
        return values[-1]

    def split_csv(self, key: str) -> List[str]:
        value = self.get(key)
        if not value:
            return []
        return [part.strip() for part in value.split(",") if part.strip()]

    def multi_items(self) -> List[Tuple[str, str]]:
        return list(self._items)


def _resolve_full_object_path(object_name: str, object_prefix: str) -> str:
    if object_prefix and not object_name.startswith(object_prefix):
        return f"{object_prefix}{object_name}"
    return object_name


def _store_create_config(document_id: str, payload: Dict[str, Any]) -> Dict[str, Any]:
    client = _get_mongo_client()
    collection = client[MONGO_DB]["createandtransform_configs"]

    existing = collection.find_one({"_id": document_id})
    payload = dict(payload)
    payload.setdefault("saved_at", datetime.utcnow())

    if existing:
        updated = dict(existing)
        updated["updated_at"] = datetime.utcnow()
        files = list(updated.get("files", []))
        files.append(payload)
        updated["files"] = files
        collection.replace_one({"_id": document_id}, updated)
        operation = "updated"
    else:
        document = {
            "_id": document_id,
            "operation_type": "createcolumn",
            "created_at": datetime.utcnow(),
            "updated_at": datetime.utcnow(),
            "files": [payload],
        }
        document.update(
            {
                "client_name": payload.get("client_name", ""),
                "app_name": payload.get("app_name", ""),
                "project_name": payload.get("project_name", ""),
                "user_id": payload.get("user_id", ""),
                "project_id": payload.get("project_id"),
            }
        )
        collection.insert_one(document)
        operation = "inserted"

    return {
        "status": "success",
        "mongo_id": document_id,
        "operation": operation,
        "collection": "createandtransform_configs",
    }


def fetch_create_results_task(
    *, bucket_name: str, object_name: str, object_prefix: str
) -> Dict[str, Any]:
    prefix = object_prefix or ""
    full_object_path = (
        object_name
        if not prefix or object_name.startswith(prefix)
        else f"{prefix}{object_name}"
    )
    create_key = f"{full_object_path}_create.csv"

    create_obj = minio_client.get_object(bucket_name, create_key)
    create_df = pd.read_csv(io.BytesIO(create_obj.read()))
    clean_df = create_df.replace({np.nan: None, np.inf: None, -np.inf: None})

    return {
        "row_count": len(create_df),
        "create_data": clean_df.to_dict(orient="records"),
        "result_file": create_key,
    }


def perform_createcolumn_task(
    *,
    bucket_name: str,
    object_name: str,
    object_prefix: str,
    identifiers: Optional[str],
    form_items: Sequence[Tuple[str, str]],
    client_name: str = "",
    app_name: str = "",
    project_name: str = "",
) -> Dict[str, Any]:
    logger.info("🔵 [CREATE-PERFORM] Starting perform operation")
    logger.info("📂 [CREATE-PERFORM] Input file: %s", object_name)
    logger.info(
        "🔧 [CREATE-PERFORM] Context: client=%s app=%s project=%s",
        client_name,
        app_name,
        project_name,
    )

    full_object_path = _resolve_full_object_path(object_name, object_prefix)
    logger.info(
        "🔧 [CREATE-PERFORM] File path resolution: original=%s prefix=%s full_path=%s",
        object_name,
        object_prefix,
        full_object_path,
    )

    df = get_minio_df(bucket_name, full_object_path)
    logger.info("📊 [CREATE-PERFORM] INITIAL LOAD - Shape: %s", df.shape)
    logger.info("📊 [CREATE-PERFORM] Columns: %s", list(df.columns))

    date_columns: List[str] = []
    for col in df.columns:
        if pd.api.types.is_datetime64_any_dtype(df[col]):
            date_columns.append(col)
            logger.info("   ✅ Date column detected: %s", col)

    df.columns = df.columns.str.strip().str.lower()
    form_payload = FormPayload(form_items)

    identifiers_list: List[str] = []
    if identifiers:
        identifiers_list = [i.strip() for i in identifiers.split(",") if i.strip()]
    else:
        identifiers_raw = form_payload.get("identifiers")
        if identifiers_raw:
            identifiers_list = [i.strip() for i in identifiers_raw.split(",") if i.strip()]

    # Filter out generated columns from identifiers (created by operations)
    # These should not be used as identifiers even if they're in MongoDB
    generated_suffixes = ['_dummy', '_detrended', '_deseasonalized', '_detrend_deseasonalized', 
                         '_log', '_sqrt', '_exp', '_power', '_logistic', '_abs', '_scaled', 
                         '_zscore', '_minmax', '_residual', '_outlier', '_rpi']
    identifiers_list = [id for id in identifiers_list 
                       if not any(id.lower().endswith(suffix) for suffix in generated_suffixes)]

    object_columns_before = df.select_dtypes(include="object").columns.tolist()
    logger.info("🔍 [CREATE-PERFORM] Object columns to clean: %s", object_columns_before)

    date_lookup = {col.lower(): col for col in date_columns}
    for col in df.select_dtypes(include="object").columns:
        if col in date_lookup:
            logger.warning("⚠️ [CREATE-PERFORM] Skipping date column during cleaning: %s", col)
            continue
        df[col] = df[col].astype(str).str.strip().str.lower()

    def group_apply(frame: pd.DataFrame, func):
        if identifiers_list:
            results = []
            for _, group in frame.groupby(identifiers_list):
                results.append(func(group))
            if not results:
                return frame
            return pd.concat(results, axis=0).sort_index()
        return func(frame)

    operations: List[Tuple[str, List[str], Optional[str], Optional[str]]] = []
    op_pattern = re.compile(r"^(\w+)_([0-9]+)$")
    for key, value in form_payload.multi_items():
        match = op_pattern.match(key)
        if not match:
            continue
        op_type = match.group(1)
        op_idx = match.group(2)
        columns = [part.strip() for part in value.split(",") if part.strip()]
        rename_val = form_payload.get(f"{op_type}_{op_idx}_rename")
        operations.append((op_type, columns, rename_val, op_idx))

    # 🔧 CRITICAL FIX: Skip environment context fields and other non-operation fields
    legacy_skipped = {
        "options", "object_names", "bucket_name", "identifiers",
        "client_name", "app_name", "project_name"  # Environment context fields
    }
    for key, value in form_payload.multi_items():
        # Skip if it's in the skipped list, matches the operation pattern, or is a parameter field
        if (key in legacy_skipped or 
            op_pattern.match(key) or 
            key.endswith("_rename") or 
            key.endswith("_param") or 
            key.endswith("_period") or
            key.endswith("_oldValue") or
            key.endswith("_newValue") or
            key.endswith("_strategy") or
            key.endswith("_customValue") or
            key.endswith("_frequency") or
            key.endswith("_comparison_type") or
            key.endswith("_fiscal_start_month") or  # For fiscal_mapping
            "_condition_" in key or  # For filter_rows_condition: condition_0_operator, condition_0_value, etc.
            (key.endswith("_operator") and "_condition_" in key) or  # Only skip operator if it's part of condition
            (key.endswith("_value") and "_condition_" in key) or  # Only skip value if it's part of condition
            key.endswith("_n") or  # For filter_top_n_per_group
            key.endswith("_metric_col") or
            key.endswith("_metric_cols") or  # For compute_metrics_within_group (multiple columns)
            key.endswith("_ascending") or
            key.endswith("_percentile") or  # For filter_percentile
            key.endswith("_direction") or  # For filter_percentile
            key.endswith("_method")):  # For compute_metrics_within_group (backward compatibility)
            continue
        columns = [part.strip() for part in value.split(",") if part.strip()]
        rename_val = form_payload.get(f"{key}_rename")
        operations.append((key, columns, rename_val, None))

    new_cols_total: List[str] = []

    for op, columns, rename_val, op_idx in operations:
        # filter_percentile doesn't require columns - it only needs metric_col parameter
        if not columns and op != "filter_percentile":
            raise ValueError(f"No columns provided for operation {op}")

        if op == "add":
            new_col = rename_val or "_plus_".join(columns)
            df[new_col] = df[columns].sum(axis=1)
            new_cols_total.append(new_col)
        elif op == "subtract":
            new_col = rename_val or "_minus_".join(columns)
            result = df[columns[0]].copy()
            for col in columns[1:]:
                result -= df[col]
            df[new_col] = result
            new_cols_total.append(new_col)
        elif op == "multiply":
            new_col = rename_val or "_x_".join(columns)
            result = df[columns[0]].copy()
            for col in columns[1:]:
                result *= df[col]
            df[new_col] = result
            new_cols_total.append(new_col)
        elif op == "divide":
            new_col = rename_val or "_div_".join(columns)
            result = df[columns[0]].copy()
            for col in columns[1:]:
                result /= df[col]
            df[new_col] = result
            new_cols_total.append(new_col)
        elif op == "pct_change":
            if len(columns) != 2:
                raise ValueError("pct_change requires exactly 2 columns")
            col1 = columns[0]
            col2 = columns[1]
            if col1 not in df.columns or col2 not in df.columns:
                raise ValueError(f"Columns '{col1}' or '{col2}' not found for pct_change operation")
            new_col = rename_val or f"{col2}_pct_change_from_{col1}"
            # Formula: ((col2-col1)/col1)*100
            numerator = df[col2] - df[col1]
            denominator = df[col1]
            # Handle division by zero
            result = (numerator / denominator.replace(0, np.nan)) * 100
            df[new_col] = result
            new_cols_total.append(new_col)
        elif op == "residual":
            y_var = columns[0]
            x_vars = columns[1:]

            def residual_func(subdf: pd.DataFrame) -> pd.DataFrame:
                new_col = rename_val or f"Res_{y_var}"
                if subdf.shape[0] < 2:
                    subdf[new_col] = np.nan
                    return subdf
                if x_vars and subdf[x_vars].std().min() == 0:
                    subdf[new_col] = np.nan
                    return subdf
                residuals, _ = calculate_residuals(subdf, y_var, x_vars)
                subdf[new_col] = residuals
                return subdf

            df = group_apply(df, residual_func)
            new_cols_total.append(rename_val or f"Res_{y_var}")
        elif op == "stl_outlier":
            date_col = next((c for c in df.columns if c.strip().lower() == "date"), None)
            if not date_col:
                raise ValueError("Date column not found for STL outlier detection")

            def stl_outlier_func(subdf: pd.DataFrame) -> pd.DataFrame:
                working = subdf.copy()
                working[date_col] = pd.to_datetime(working[date_col], errors="coerce")
                working = working.sort_values(by=date_col)
                new_col = rename_val or "is_outlier"
                working[new_col] = 0
                if len(working) < 14:
                    return working
                volume_col = next((c for c in working.columns if c.strip().lower() == "volume"), None)
                if not volume_col:
                    return working
                res = STL(working[volume_col], seasonal=13, period=13).fit()
                residual = res.resid
                z_score = (residual - residual.mean()) / residual.std()
                working[new_col] = (np.abs(z_score) > 3).astype(int)
                return working

            df = group_apply(df, stl_outlier_func)
            new_cols_total.append(rename_val or "is_outlier")
        elif op == "dummy":
            for col in columns:
                if col not in df.columns:
                    raise ValueError(f"Column '{col}' not found for dummy operation")
                new_col = rename_val or f"{col}_dummy"
                df[new_col] = pd.Categorical(df[col]).codes
                new_cols_total.append(new_col)
        elif op == "datetime":
            date_col = columns[0]
            if date_col not in df.columns:
                raise ValueError(f"Column '{date_col}' not found for datetime operation")
            param = form_payload.get(f"{op}_{op_idx}_param")
            if param is None:
                raise ValueError("Missing `param` for datetime operation")
            date_series = pd.to_datetime(df[date_col], errors="coerce")
            if param == "to_year":
                new_col = rename_val or f"{date_col}_year"
                df[new_col] = date_series.dt.year
            elif param == "to_month":
                new_col = rename_val or f"{date_col}_month"
                df[new_col] = date_series.dt.month
            elif param == "to_week":
                new_col = rename_val or f"{date_col}_week"
                df[new_col] = date_series.dt.isocalendar().week
            elif param == "to_day":
                new_col = rename_val or f"{date_col}_day"
                df[new_col] = date_series.dt.day
            elif param == "to_day_name":
                new_col = rename_val or f"{date_col}_day_name"
                df[new_col] = date_series.dt.day_name()
            elif param == "to_month_name":
                new_col = rename_val or f"{date_col}_month_name"
                df[new_col] = date_series.dt.month_name()
            else:
                raise ValueError(f"Invalid datetime param: {param}")
            new_cols_total.append(new_col)
        elif op == "fiscal_mapping":
            date_col = columns[0]
            if date_col not in df.columns:
                raise ValueError(f"Column '{date_col}' not found for fiscal_mapping operation")
            
            # Get parameters
            param = form_payload.get(f"{op}_{op_idx}_param")  # e.g., "fiscal_year", "fiscal_quarter", "fiscal_month"
            fiscal_start_month = int(form_payload.get(f"{op}_{op_idx}_fiscal_start_month", 1))  # default January
            
            if param is None:
                raise ValueError("Missing `param` for fiscal_mapping operation")
            
            # Convert to datetime
            date_series = pd.to_datetime(df[date_col], errors="coerce")
            
            if param == "fiscal_year":
                # Map to fiscal year (e.g., FY23, FY24)
                new_col = rename_val or f"{date_col}_fiscal_year"
                # Check if column name already exists
                if new_col in df.columns:
                    raise ValueError(f"Column name '{new_col}' already exists in the uploaded file. Please provide a unique name.")
                df[new_col] = date_series.apply(
                    lambda x: f"FY{(x.year + 1) % 100:02d}" if pd.notna(x) and x.month >= fiscal_start_month 
                    else f"FY{x.year % 100:02d}" if pd.notna(x) else None
                )
            elif param == "fiscal_quarter":
                # Map to fiscal quarter (e.g., FY23-Q1, FY23-Q2)
                def get_fiscal_quarter(dt):
                    if pd.isna(dt):
                        return None
                    # Calculate fiscal year
                    fiscal_year = (dt.year + 1) if dt.month >= fiscal_start_month else dt.year
                    # Calculate quarter based on fiscal start month
                    fiscal_month = (dt.month - fiscal_start_month) % 12 + 1
                    fiscal_quarter = (fiscal_month - 1) // 3 + 1
                    return f"FY{fiscal_year % 100:02d}-Q{fiscal_quarter}"
                
                new_col = rename_val or f"{date_col}_fiscal_quarter"
                # Check if column name already exists
                if new_col in df.columns:
                    raise ValueError(f"Column name '{new_col}' already exists in the uploaded file. Please provide a unique name.")
                df[new_col] = date_series.apply(get_fiscal_quarter)
            elif param == "fiscal_month":
                # Map to fiscal month (e.g., FY23-M01, FY23-M02)
                def get_fiscal_month(dt):
                    if pd.isna(dt):
                        return None
                    # Calculate fiscal year
                    fiscal_year = (dt.year + 1) if dt.month >= fiscal_start_month else dt.year
                    # Calculate fiscal month
                    fiscal_month = (dt.month - fiscal_start_month) % 12 + 1
                    return f"FY{fiscal_year % 100:02d}-M{fiscal_month:02d}"
                
                new_col = rename_val or f"{date_col}_fiscal_month"
                # Check if column name already exists
                if new_col in df.columns:
                    raise ValueError(f"Column name '{new_col}' already exists in the uploaded file. Please provide a unique name.")
                df[new_col] = date_series.apply(get_fiscal_month)
            elif param == "fiscal_year_full":
                # Map to full fiscal year (e.g., FY2023, FY2024)
                new_col = rename_val or f"{date_col}_fiscal_year_full"
                # Check if column name already exists
                if new_col in df.columns:
                    raise ValueError(f"Column name '{new_col}' already exists in the uploaded file. Please provide a unique name.")
                df[new_col] = date_series.apply(
                    lambda x: f"FY{x.year + 1}" if pd.notna(x) and x.month >= fiscal_start_month 
                    else f"FY{x.year}" if pd.notna(x) else None
                )
            else:
                raise ValueError(f"Invalid fiscal_mapping param: {param}")
            
            new_cols_total.append(new_col)
        elif op == "is_weekend":
            date_col = columns[0]
            if date_col not in df.columns:
                raise ValueError(f"Column '{date_col}' not found for is_weekend operation")
            
            # Convert to datetime
            date_series = pd.to_datetime(df[date_col], errors="coerce")
            
            # Check if day of week is Saturday (5) or Sunday (6)
            new_col = rename_val or f"{date_col}_is_weekend"
            # Check if column name already exists
            if new_col in df.columns:
                raise ValueError(f"Column name '{new_col}' already exists in the uploaded file. Please provide a unique name.")
            df[new_col] = date_series.dt.dayofweek.isin([5, 6])
            
            new_cols_total.append(new_col)
        elif op == "is_month_end":
            date_col = columns[0]
            if date_col not in df.columns:
                raise ValueError(f"Column '{date_col}' not found for is_month_end operation")
            
            # Convert to datetime
            date_series = pd.to_datetime(df[date_col], errors="coerce")
            
            # Check if date is the last day of the month
            new_col = rename_val or f"{date_col}_is_month_end"
            # Check if column name already exists
            if new_col in df.columns:
                raise ValueError(f"Column name '{new_col}' already exists in the uploaded file. Please provide a unique name.")
            df[new_col] = date_series.dt.is_month_end
            
            new_cols_total.append(new_col)
        elif op == "is_qtr_end":
            date_col = columns[0]
            if date_col not in df.columns:
                raise ValueError(f"Column '{date_col}' not found for is_qtr_end operation")
            
            # Convert to datetime
            date_series = pd.to_datetime(df[date_col], errors="coerce")
            
            # Check if date is the last day of the quarter
            new_col = rename_val or f"{date_col}_is_qtr_end"
            # Check if column name already exists
            if new_col in df.columns:
                raise ValueError(f"Column name '{new_col}' already exists in the uploaded file. Please provide a unique name.")
            df[new_col] = date_series.dt.is_quarter_end
            
            new_cols_total.append(new_col)
        elif op == "date_builder":
            # Build date from components: supports multiple modes
            # Mode is determined by the 'param' field
            if len(columns) < 1:
                raise ValueError("date_builder requires at least one column (year)")
            
            # Get the mode parameter (default: from_year_month_day)
            mode = form_payload.get(f"{op}_{op_idx}_param") or "from_year_month_day"
            
            year_col = columns[0] if len(columns) > 0 else None
            second_col = columns[1] if len(columns) > 1 else None  # month or week
            third_col = columns[2] if len(columns) > 2 else None   # day, week, or dayofweek
            
            # Validate year column exists
            if year_col and year_col not in df.columns:
                raise ValueError(f"Year column '{year_col}' not found for date_builder operation")
            
            # Build the date column name
            new_col = rename_val or "built_date"
            
            # Check if column name already exists
            if new_col in df.columns:
                raise ValueError(f"Column name '{new_col}' already exists in the uploaded file. Please provide a unique name.")
            
            # Build date from components
            try:
                if mode == "from_year_week":
                    # Build from year + ISO week (defaults to Monday of that week)
                    if not year_col:
                        raise ValueError("Year column is required")
                    
                    if second_col and second_col not in df.columns:
                        raise ValueError(f"Week column '{second_col}' not found")
                    
                    if year_col and second_col:
                        # Year + Week (defaults to Monday - day 1)
                        date_string = (
                            df[year_col].astype(str) + '-W' + 
                            df[second_col].astype(str).str.zfill(2) + '-1'
                        )
                        df[new_col] = pd.to_datetime(date_string, format='%Y-W%W-%w', errors='coerce')
                    else:
                        raise ValueError("Year and week columns are required")
                elif mode == "from_year_week_dayofweek":
                    # Build from year + ISO week + day of week
                    # second_col = week, third_col = dayofweek (1=Monday, 7=Sunday)
                    if not year_col:
                        raise ValueError("Year column is required for week-based date building")
                    
                    if second_col and second_col not in df.columns:
                        raise ValueError(f"Week column '{second_col}' not found")
                    if third_col and third_col not in df.columns:
                        raise ValueError(f"Day of week column '{third_col}' not found")
                    
                    if year_col and second_col and third_col:
                        # Year + Week + Day of Week
                        # Use ISO week date format: combine year, week, dayofweek into string
                        date_string = (
                            df[year_col].astype(str) + '-W' + 
                            df[second_col].astype(str).str.zfill(2) + '-' + 
                            df[third_col].astype(str)
                        )
                        df[new_col] = pd.to_datetime(date_string, format='%Y-W%W-%w', errors='coerce')
                    elif year_col and second_col:
                        # Year + Week (defaults to Monday)
                        date_string = (
                            df[year_col].astype(str) + '-W' + 
                            df[second_col].astype(str).str.zfill(2) + '-1'
                        )
                        df[new_col] = pd.to_datetime(date_string, format='%Y-W%W-%w', errors='coerce')
                    else:
                        raise ValueError("Week-based date building requires at least year and week columns")
                elif mode == "from_year_month_week":
                    # Build from year + month + week (week number within the month)
                    # Creates date for the first day of that week within the month
                    if not year_col or not second_col or not third_col:
                        raise ValueError("Year, month, and week columns are all required")
                    
                    month_col = second_col
                    week_col = third_col
                    
                    if month_col not in df.columns:
                        raise ValueError(f"Month column '{month_col}' not found")
                    if week_col not in df.columns:
                        raise ValueError(f"Week column '{week_col}' not found")
                    
                    # Calculate the date: first day of month + (week-1) * 7 days
                    # But ensure the date stays within the same month
                    temp_df = df[[year_col, month_col]].copy()
                    temp_df['day'] = 1
                    first_day = pd.to_datetime(
                        temp_df.rename(columns={year_col: 'year', month_col: 'month'}),
                        errors='coerce'
                    )
                    
                    # Add (week_number - 1) * 7 days to get to that week
                    weeks_to_add = (df[week_col].astype(int) - 1) * 7
                    result_date = first_day + pd.to_timedelta(weeks_to_add, unit='D')
                    
                    # Get the last day of the specified month
                    # (first day of next month - 1 day)
                    next_month = first_day + pd.offsets.MonthEnd(0)
                    
                    # Clamp the result date to stay within the same month
                    # If result_date is beyond the month, use the last day of the month
                    df[new_col] = pd.Series([
                        min(rd, nm) if pd.notna(rd) and pd.notna(nm) else rd
                        for rd, nm in zip(result_date, next_month)
                    ])
                else:
                    # Default mode: Build from year + month + day
                    month_col = second_col
                    day_col = third_col
                    
                    if month_col and month_col not in df.columns:
                        raise ValueError(f"Month column '{month_col}' not found")
                    if day_col and day_col not in df.columns:
                        raise ValueError(f"Day column '{day_col}' not found")
                    
                    if year_col and month_col and day_col:
                        # Full date: year + month + day
                        df[new_col] = pd.to_datetime(
                            df[[year_col, month_col, day_col]].rename(
                                columns={year_col: 'year', month_col: 'month', day_col: 'day'}
                            ),
                            errors='coerce'
                        )
                    elif year_col and month_col:
                        # Year + month only (day defaults to 1)
                        temp_df = df[[year_col, month_col]].copy()
                        temp_df['day'] = 1
                        df[new_col] = pd.to_datetime(
                            temp_df.rename(columns={year_col: 'year', month_col: 'month'}),
                            errors='coerce'
                        )
                    elif year_col:
                        # Year only (month and day default to 1)
                        temp_df = df[[year_col]].copy()
                        temp_df['month'] = 1
                        temp_df['day'] = 1
                        df[new_col] = pd.to_datetime(
                            temp_df.rename(columns={year_col: 'year'}),
                            errors='coerce'
                        )
                    else:
                        raise ValueError("date_builder requires at least a year column")
            except Exception as e:
                raise ValueError(f"Failed to build date from components: {str(e)}")
            
            new_cols_total.append(new_col)
        elif op == "rpi":
            df, rpi_cols = compute_rpi(df, columns)
            new_cols_total.extend(rpi_cols)
        elif op == "abs":
            for col in columns:
                if col not in df.columns:
                    raise ValueError(f"Column '{col}' not found for abs operation")
                new_col = rename_val or f"{col}_abs"
                df[new_col] = df[col].abs()
                new_cols_total.append(new_col)
        elif op == "power":
            param = form_payload.get(f"{op}_{op_idx}_param")
            if param is None:
                raise ValueError("Missing `param` for power operation")
            exponent = float(param)
            for col in columns:
                new_col = rename_val or f"{col}_power{param}"
                df[new_col] = df[col] ** exponent
                new_cols_total.append(new_col)
        elif op == "log":
            for col in columns:
                new_col = rename_val or f"{col}_log"
                df[new_col] = np.log(df[col])
                new_cols_total.append(new_col)
        elif op == "sqrt":
            for col in columns:
                new_col = rename_val or f"{col}_sqrt"
                df[new_col] = np.sqrt(df[col])
                new_cols_total.append(new_col)
        elif op == "lower":
            for col in columns:
                if col not in df.columns:
                    raise ValueError(f"Column '{col}' not found for lower operation")
                df[col] = df[col].astype(str).str.lower()
                new_cols_total.append(col)
        elif op == "upper":
            for col in columns:
                if col not in df.columns:
                    raise ValueError(f"Column '{col}' not found for upper operation")
                df[col] = df[col].astype(str).str.upper()
                new_cols_total.append(col)
        elif op == "strip":
            for col in columns:
                if col not in df.columns:
                    raise ValueError(f"Column '{col}' not found for strip operation")
                df[col] = df[col].astype(str).str.strip()
                new_cols_total.append(col)
        elif op == "replace":
            old_value = form_payload.get(f"{op}_{op_idx}_oldValue")
            new_value = form_payload.get(f"{op}_{op_idx}_newValue")
            if old_value is None:
                raise ValueError("Missing `oldValue` for replace operation")
            if new_value is None:
                raise ValueError("Missing `newValue` for replace operation")
            for col in columns:
                if col not in df.columns:
                    raise ValueError(f"Column '{col}' not found for replace operation")
                # Check if column is numeric
                is_numeric = pd.api.types.is_numeric_dtype(df[col])
                if is_numeric:
                    # Try to convert old_value and new_value to numeric
                    try:
                        old_num = float(old_value) if old_value else None
                        new_num = float(new_value) if new_value else None
                        # Replace numeric values directly (preserves numeric type)
                        df[col] = df[col].replace(old_num, new_num)
                        # Try to convert back to original numeric type
                        if pd.api.types.is_integer_dtype(df[col].dtype) and new_num is not None:
                            try:
                                df[col] = df[col].astype(int)
                            except (ValueError, TypeError):
                                pass
                    except (ValueError, TypeError):
                        # If conversion fails, fall back to string replacement
                        df[col] = df[col].astype(str).str.replace(str(old_value), str(new_value), regex=False)
                else:
                    # For non-numeric columns, use string replacement
                    df[col] = df[col].astype(str).str.replace(str(old_value), str(new_value), regex=False)
                new_cols_total.append(col)
        elif op == "fill_na":
            strategy = form_payload.get(f"{op}_{op_idx}_strategy")
            custom_value = form_payload.get(f"{op}_{op_idx}_customValue")
            if strategy is None:
                raise ValueError("Missing `strategy` for fill_na operation")
            
            for col in columns:
                if col not in df.columns:
                    raise ValueError(f"Column '{col}' not found for fill_na operation")
                
                series = df[col]
                strategy_lower = str(strategy).lower()
                
                if strategy_lower == "drop":
                    # Drop rows where this column has missing values
                    df = df[series.notna()]
                else:
                    fill_value = None
                    if strategy_lower == "mean":
                        if pd.api.types.is_numeric_dtype(series):
                            fill_value = pd.to_numeric(series, errors="coerce").mean()
                    elif strategy_lower == "median":
                        if pd.api.types.is_numeric_dtype(series):
                            fill_value = pd.to_numeric(series, errors="coerce").median()
                    elif strategy_lower == "zero":
                        fill_value = 0
                    elif strategy_lower == "mode":
                        mode_series = series.mode(dropna=True)
                        fill_value = mode_series.iloc[0] if not mode_series.empty else ""
                    elif strategy_lower == "empty":
                        fill_value = ""
                    elif strategy_lower == "custom":
                        if custom_value is None:
                            raise ValueError("Missing `customValue` for fill_na operation with custom strategy")
                        fill_value = custom_value
                        # Try to convert custom value to match column dtype
                        if pd.api.types.is_numeric_dtype(series):
                            try:
                                fill_value = float(custom_value)
                            except (ValueError, TypeError):
                                pass
                    
                    if fill_value is not None:
                        df[col] = series.fillna(fill_value)
                
                new_cols_total.append(col)
        elif op == "exp":

            def exp_func(subdf: pd.DataFrame) -> pd.DataFrame:
                for col in columns:
                    new_col_inner = rename_val or f"{col}_exp"
                    subdf[new_col_inner] = np.exp(subdf[col])
                return subdf

            df = group_apply(df, exp_func)
            if rename_val:
                new_cols_total.append(rename_val)
            else:
                for col in columns:
                    new_cols_total.append(f"{col}_exp")
        elif op == "logistic":
            param = form_payload.get(f"{op}_{op_idx}_param")
            if not param:
                raise ValueError("Missing logistic parameters")
            logistic_params = json.loads(param)
            gr = float(logistic_params.get("gr"))
            co = float(logistic_params.get("co"))
            mp = float(logistic_params.get("mp"))

            def adstock(series: pd.Series, carryover: float) -> np.ndarray:
                result: List[float] = []
                prev = 0.0
                for val in series.fillna(0):
                    curr = val + carryover * prev
                    result.append(curr)
                    prev = curr
                return np.asarray(result)

            def logistic_func(x: np.ndarray, gr_val: float, mp_val: float) -> np.ndarray:
                return 1 / (1 + np.exp(-gr_val * (x - mp_val)))

            def logistic_apply(subdf: pd.DataFrame) -> pd.DataFrame:
                for col in columns:
                    adstocked = adstock(subdf[col], co)
                    std = np.std(adstocked)
                    if std == 0:
                        standardized = adstocked - np.mean(adstocked)
                    else:
                        standardized = (adstocked - np.mean(adstocked)) / std
                    new_col_inner = rename_val or f"{col}_logistic"
                    subdf[new_col_inner] = logistic_func(standardized, gr, mp)
                return subdf

            df = group_apply(df, logistic_apply)
            if rename_val:
                new_cols_total.append(rename_val)
            else:
                for col in columns:
                    new_cols_total.append(f"{col}_logistic")
        elif op in {"detrend", "deseasonalize", "detrend_deseasonalize"}:
            date_col = next((c for c in df.columns if c.strip().lower() == "date"), None)
            if not date_col:
                raise ValueError("No date column found for STL operations")
            df[date_col] = pd.to_datetime(df[date_col], errors="coerce")
            df.sort_values(by=date_col, inplace=True)
            period_param = form_payload.get(f"{op}_{op_idx}_period")
            if period_param is not None:
                period = int(period_param)
                if period < 2:
                    raise ValueError("Period must be at least 2")
            else:
                date_series = df[date_col].sort_values().drop_duplicates()
                diffs = date_series.diff().dropna()
                if diffs.empty:
                    raise ValueError("Unable to detect frequency from the date column")
                mode_diff = diffs.mode()[0]
                mode_days = mode_diff.total_seconds() / (24 * 3600)
                if 0.9 <= mode_days <= 1.1:
                    period = 7
                elif 6 <= mode_days <= 8:
                    period = 52
                elif 25 <= mode_days <= 35:
                    period = 12
                elif 85 <= mode_days <= 95:
                    period = 4
                elif 350 <= mode_days <= 380:
                    period = 1
                else:
                    raise ValueError("Unsupported or custom frequency for STL decomposition")

            def stl_transform(subdf: pd.DataFrame) -> pd.DataFrame:
                for col in columns:
                    stl = STL(subdf[col], period=period, robust=True)
                    res = stl.fit()
                    if op == "detrend":
                        new_col_inner = rename_val or f"{col}_detrended"
                        subdf[new_col_inner] = res.resid + res.seasonal
                    elif op == "deseasonalize":
                        new_col_inner = rename_val or f"{col}_deseasonalized"
                        subdf[new_col_inner] = res.resid + res.trend
                    else:
                        new_col_inner = rename_val or f"{col}_detrend_deseasonalized"
                        subdf[new_col_inner] = res.resid
                return subdf

            df = group_apply(df, stl_transform)
            for col in columns:
                if op == "detrend":
                    new_cols_total.append(rename_val or f"{col}_detrended")
                elif op == "deseasonalize":
                    new_cols_total.append(rename_val or f"{col}_deseasonalized")
                else:
                    new_cols_total.append(rename_val or f"{col}_detrend_deseasonalized")
        elif op.startswith("standardize"):
            method = op.split("_", 1)[1]

            def standardize(subdf: pd.DataFrame) -> pd.DataFrame:
                target_columns = columns if not rename_val else [columns[0]]
                for col in target_columns:
                    new_col_inner = rename_val or f"{col}_{method}_scaled"
                    scaler = StandardScaler() if method == "zscore" else MinMaxScaler()
                    try:
                        transformed = scaler.fit_transform(subdf[[col]])
                        subdf[new_col_inner] = transformed.flatten()
                    except Exception:
                        subdf[new_col_inner] = 0 if method == "zscore" else 0.5
                return subdf

            df = group_apply(df, standardize)
            if rename_val:
                new_cols_total.append(rename_val)
            else:
                for col in columns:
                    new_cols_total.append(f"{col}_{method}_scaled")
        elif op == "lag":
            date_col = next((c for c in df.columns if c.strip().lower() == "date"), None)
            if not date_col:
                raise ValueError("No date column found for lag operation")
            df[date_col] = pd.to_datetime(df[date_col], errors="coerce")
            df.sort_values(by=date_col, inplace=True)
            
            param = form_payload.get(f"{op}_{op_idx}_param")
            if param is None:
                raise ValueError("Missing `param` for lag operation")
            period = int(param)
            if period < 1:
                raise ValueError("Period must be at least 1 for lag operation")
            
            def lag_func(subdf: pd.DataFrame) -> pd.DataFrame:
                for col in columns:
                    new_col_inner = rename_val or f"{col}_lag"
                    subdf[new_col_inner] = subdf[col].shift(period)
                return subdf
            
            df = group_apply(df, lag_func)
            if rename_val:
                new_cols_total.append(rename_val)
            else:
                for col in columns:
                    new_cols_total.append(f"{col}_lag")
        elif op == "lead":
            date_col = next((c for c in df.columns if c.strip().lower() == "date"), None)
            if not date_col:
                raise ValueError("No date column found for lead operation")
            df[date_col] = pd.to_datetime(df[date_col], errors="coerce")
            df.sort_values(by=date_col, inplace=True)
            
            param = form_payload.get(f"{op}_{op_idx}_param")
            if param is None:
                raise ValueError("Missing `param` for lead operation")
            period = int(param)
            if period < 1:
                raise ValueError("Period must be at least 1 for lead operation")
            
            def lead_func(subdf: pd.DataFrame) -> pd.DataFrame:
                for col in columns:
                    new_col_inner = rename_val or f"{col}_lead"
                    subdf[new_col_inner] = subdf[col].shift(-period)
                return subdf
            
            df = group_apply(df, lead_func)
            if rename_val:
                new_cols_total.append(rename_val)
            else:
                for col in columns:
                    new_cols_total.append(f"{col}_lead")
        elif op == "diff":
            date_col = next((c for c in df.columns if c.strip().lower() == "date"), None)
            if not date_col:
                raise ValueError("No date column found for diff operation")
            df[date_col] = pd.to_datetime(df[date_col], errors="coerce")
            df.sort_values(by=date_col, inplace=True)
            
            param = form_payload.get(f"{op}_{op_idx}_param")
            if param is None:
                raise ValueError("Missing `param` for diff operation")
            period = int(param)
            if period < 1:
                raise ValueError("Period must be at least 1 for diff operation")
            
            def diff_func(subdf: pd.DataFrame) -> pd.DataFrame:
                for col in columns:
                    new_col_inner = rename_val or f"{col}_diff"
                    # Formula: x(t) - x(t-n)
                    subdf[new_col_inner] = subdf[col] - subdf[col].shift(period)
                return subdf
            
            df = group_apply(df, diff_func)
            if rename_val:
                new_cols_total.append(rename_val)
            else:
                for col in columns:
                    new_cols_total.append(f"{col}_diff")
        elif op == "growth_rate":
            date_col = next((c for c in df.columns if c.strip().lower() == "date"), None)
            if not date_col:
                raise ValueError("No date column found for growth_rate operation")
            df[date_col] = pd.to_datetime(df[date_col], errors="coerce")
            df.sort_values(by=date_col, inplace=True)
            
            # Parse parameters - can be JSON string or simple period number
            param = form_payload.get(f"{op}_{op_idx}_param")
            frequency_param = form_payload.get(f"{op}_{op_idx}_frequency")
            comparison_type_param = form_payload.get(f"{op}_{op_idx}_comparison_type")
            
            # Default values
            period = 1
            frequency = None
            comparison_type = "period"  # "period" for consecutive periods, "yoy" for year-over-year
            
            # Parse param - can be JSON with frequency and period, or just period number
            if param:
                try:
                    # Try parsing as JSON first
                    param_dict = json.loads(param) if isinstance(param, str) else param
                    if isinstance(param_dict, dict):
                        period = int(param_dict.get("period", 1))
                        frequency = param_dict.get("frequency")
                        comparison_type = param_dict.get("comparison_type", "period")
                    else:
                        # If not dict, treat as period number
                        period = int(param)
                except (json.JSONDecodeError, ValueError, TypeError):
                    # If parsing fails, treat as period number
                    period = int(param)
            
            # Override frequency if explicitly provided
            if frequency_param:
                frequency = frequency_param
            
            # Override comparison_type if explicitly provided
            if comparison_type_param:
                comparison_type = comparison_type_param
            
            if period < 1:
                raise ValueError("Period must be at least 1 for growth_rate operation")
            
            # Frequency mapping for pandas resample
            freq_map = {
                'daily': 'D',
                'weekly': 'W',
                'monthly': 'M',
                'quarterly': 'Q',
                'yearly': 'Y',
                'D': 'D',
                'W': 'W',
                'M': 'M',
                'Q': 'Q',
                'Y': 'Y',
            }
            
            def growth_rate_func(subdf: pd.DataFrame) -> pd.DataFrame:
                for col in columns:
                    new_col_inner = rename_val or f"{col}_growth_rate"
                    
                    if frequency and frequency.lower() in freq_map:
                        # Frequency-based growth rate (e.g., this month vs last month, this year vs last year)
                        freq_code = freq_map[frequency.lower()]
                        
                        # Create period labels (e.g., '2024-01' for monthly, '2024' for yearly)
                        subdf_copy = subdf[[date_col, col]].copy()
                        subdf_copy['period'] = subdf_copy[date_col].dt.to_period(freq_code)
                        
                        # Aggregate values within each period (using mean as default aggregation)
                        # This handles cases where there are multiple rows per period
                        period_agg = subdf_copy.groupby('period')[col].mean().reset_index()
                        period_agg.columns = ['period', 'agg_value']
                        
                        # Calculate growth rate based on comparison type
                        if comparison_type.lower() in ['yoy', 'year_over_year', 'year-over-year']:
                            # Year-over-Year: Compare same period, previous year
                            # For monthly: Jan 2024 vs Jan 2023
                            # For quarterly: Q1 2024 vs Q1 2023
                            # For yearly: 2024 vs 2023 (same as period-over-period)
                            
                            if freq_code == 'Y':
                                # For yearly frequency, YoY is same as period-over-period
                                period_agg['lagged_value'] = period_agg['agg_value'].shift(period)
                            elif freq_code == 'M':
                                # For monthly: group by month number, compare across years
                                # Extract year and month from Period object
                                period_agg['year'] = period_agg['period'].dt.year
                                period_agg['month'] = period_agg['period'].dt.month
                                period_agg = period_agg.sort_values(['month', 'year'])
                                # Group by month and shift by period (years)
                                period_agg['lagged_value'] = period_agg.groupby('month')['agg_value'].shift(period)
                            elif freq_code == 'Q':
                                # For quarterly: group by quarter number, compare across years
                                period_agg['year'] = period_agg['period'].dt.year
                                period_agg['quarter'] = period_agg['period'].dt.quarter
                                period_agg = period_agg.sort_values(['quarter', 'year'])
                                # Group by quarter and shift by period (years)
                                period_agg['lagged_value'] = period_agg.groupby('quarter')['agg_value'].shift(period)
                            elif freq_code == 'W':
                                # For weekly: group by week number, compare across years
                                period_agg['year'] = period_agg['period'].dt.year
                                # Get ISO week number
                                period_agg['week'] = period_agg['period'].dt.isocalendar().week
                                period_agg = period_agg.sort_values(['week', 'year'])
                                # Group by week and shift by period (years)
                                period_agg['lagged_value'] = period_agg.groupby('week')['agg_value'].shift(period)
                            else:
                                # For daily or other frequencies, use period-over-period
                                period_agg['lagged_value'] = period_agg['agg_value'].shift(period)
                        else:
                            # Period-over-Period: Compare consecutive periods (default behavior)
                            # Compare period n with period n-period
                            period_agg['lagged_value'] = period_agg['agg_value'].shift(period)
                        
                        period_agg['growth_rate'] = ((period_agg['agg_value'] - period_agg['lagged_value']) / period_agg['lagged_value']) * 100
                        
                        # Map growth rates back to original rows based on period
                        period_map = dict(zip(period_agg['period'], period_agg['growth_rate']))
                        subdf[new_col_inner] = subdf_copy['period'].map(period_map)
                    else:
                        # Simple period-based growth rate (original behavior)
                        # Formula: ((x(t) - x(t-n)) / x(t-n)) * 100
                        # This calculates percentage growth rate over n periods
                        lagged_col = subdf[col].shift(period)
                        subdf[new_col_inner] = ((subdf[col] - lagged_col) / lagged_col) * 100
                
                return subdf
            
            df = group_apply(df, growth_rate_func)
            if rename_val:
                new_cols_total.append(rename_val)
            else:
                for col in columns:
                    new_cols_total.append(f"{col}_growth_rate")
        elif op in {"rolling_mean", "rolling_sum", "rolling_min", "rolling_max"}:
            date_col = next((c for c in df.columns if c.strip().lower() == "date"), None)
            if not date_col:
                raise ValueError(f"No date column found for {op} operation")
            df[date_col] = pd.to_datetime(df[date_col], errors="coerce")
            df.sort_values(by=date_col, inplace=True)
            
            param = form_payload.get(f"{op}_{op_idx}_param")
            if param is None:
                raise ValueError(f"Missing `param` for {op} operation")
            window = int(param)
            if window < 1:
                raise ValueError(f"Window must be at least 1 for {op} operation")
            
            def rolling_func(subdf: pd.DataFrame) -> pd.DataFrame:
                for col in columns:
                    if op == "rolling_mean":
                        new_col_inner = rename_val or f"{col}_rolling_mean"
                        subdf[new_col_inner] = subdf[col].rolling(window=window, min_periods=1).mean()
                    elif op == "rolling_sum":
                        new_col_inner = rename_val or f"{col}_rolling_sum"
                        subdf[new_col_inner] = subdf[col].rolling(window=window, min_periods=1).sum()
                    elif op == "rolling_min":
                        new_col_inner = rename_val or f"{col}_rolling_min"
                        subdf[new_col_inner] = subdf[col].rolling(window=window, min_periods=1).min()
                    elif op == "rolling_max":
                        new_col_inner = rename_val or f"{col}_rolling_max"
                        subdf[new_col_inner] = subdf[col].rolling(window=window, min_periods=1).max()
                return subdf
            
            df = group_apply(df, rolling_func)
            if rename_val:
                new_cols_total.append(rename_val)
            else:
                for col in columns:
                    if op == "rolling_mean":
                        new_cols_total.append(f"{col}_rolling_mean")
                    elif op == "rolling_sum":
                        new_cols_total.append(f"{col}_rolling_sum")
                    elif op == "rolling_min":
                        new_cols_total.append(f"{col}_rolling_min")
                    elif op == "rolling_max":
                        new_cols_total.append(f"{col}_rolling_max")
        elif op == "cumulative_sum":
            date_col = next((c for c in df.columns if c.strip().lower() == "date"), None)
            if not date_col:
                raise ValueError("No date column found for cumulative_sum operation")
            df[date_col] = pd.to_datetime(df[date_col], errors="coerce")
            df.sort_values(by=date_col, inplace=True)
            
            def cumulative_sum_func(subdf: pd.DataFrame) -> pd.DataFrame:
                for col in columns:
                    new_col_inner = rename_val or f"{col}_cumulative_sum"
                    subdf[new_col_inner] = subdf[col].cumsum()
                return subdf
            
            df = group_apply(df, cumulative_sum_func)
            if rename_val:
                new_cols_total.append(rename_val)
            else:
                    for col in columns:
                        new_cols_total.append(f"{col}_cumulative_sum")
        elif op == "select_columns":
            # Select only the specified columns, removing all others
            if not columns:
                raise ValueError("No columns provided for select_columns operation")
            
            # Validate that all selected columns exist in the dataframe
            missing_cols = [col for col in columns if col not in df.columns]
            if missing_cols:
                raise ValueError(f"Columns not found for select_columns operation: {missing_cols}")
            
            # Select only the specified columns
            df = df[columns].copy()
            
            # Note: select_columns doesn't create new columns, it filters existing ones
            # So we don't add to new_cols_total, but we track the columns that remain
            new_cols_total.extend(columns)
        elif op == "drop_columns":
            # Drop the specified columns, keeping all others
            if not columns:
                raise ValueError("No columns provided for drop_columns operation")
            
            # Validate that all columns to drop exist in the dataframe
            missing_cols = [col for col in columns if col not in df.columns]
            if missing_cols:
                raise ValueError(f"Columns not found for drop_columns operation: {missing_cols}")
            
            # Drop the specified columns
            df = df.drop(columns=columns)
            
            # Track the columns that remain after dropping
            remaining_cols = [col for col in df.columns]
            new_cols_total.extend(remaining_cols)
        elif op == "rename":
            # Rename the specified columns
            if not columns:
                raise ValueError("No columns provided for rename operation")
            
            # Validate that all columns to rename exist in the dataframe
            missing_cols = [col for col in columns if col not in df.columns]
            if missing_cols:
                raise ValueError(f"Columns not found for rename operation: {missing_cols}")
            
            # Check if rename_val is provided
            if not rename_val:
                raise ValueError("No rename value provided for rename operation")
            
            # If single column, rename to the provided name
            if len(columns) == 1:
                df = df.rename(columns={columns[0]: rename_val})
                new_cols_total.append(rename_val)
            else:
                # For multiple columns, rename_val should be a comma-separated list or we rename sequentially
                # For simplicity, we'll rename each column with a suffix based on index
                # But if rename_val contains commas, split it
                new_names = [name.strip() for name in rename_val.split(',')] if ',' in rename_val else [f"{rename_val}_{i}" for i in range(len(columns))]
                
                # Ensure we have enough names
                if len(new_names) < len(columns):
                    # Pad with indexed names if not enough
                    new_names.extend([f"{rename_val}_{i}" for i in range(len(new_names), len(columns))])
                
                # Create rename mapping
                rename_mapping = {columns[i]: new_names[i] for i in range(len(columns))}
                df = df.rename(columns=rename_mapping)
                new_cols_total.extend(new_names)
        elif op == "reorder":
            # Reorder columns: keep all columns but reorder them according to the specified order
            if not columns:
                raise ValueError("No columns provided for reorder operation")
            
            # Validate that all specified columns exist in the dataframe
            missing_cols = [col for col in columns if col not in df.columns]
            if missing_cols:
                raise ValueError(f"Columns not found for reorder operation: {missing_cols}")
            
            # Get all columns in the dataframe
            all_cols = list(df.columns)
            
            # Get columns that are not in the reorder list (to append at the end)
            remaining_cols = [col for col in all_cols if col not in columns]
            
            # Reorder: first the specified columns in order, then the remaining columns
            new_column_order = columns + remaining_cols
            
            # Reorder the dataframe
            df = df[new_column_order]
            
            # Track all columns that remain after reordering
            new_cols_total.extend(new_column_order)
        elif op == "deduplicate":
            # Deduplicate rows based on the specified columns (subset)
            if not columns:
                raise ValueError("No columns provided for deduplicate operation")
            
            # Validate that all specified columns exist in the dataframe
            missing_cols = [col for col in columns if col not in df.columns]
            if missing_cols:
                raise ValueError(f"Columns not found for deduplicate operation: {missing_cols}")
            
            # Remove duplicate rows based on the specified columns
            # keep='first' keeps the first occurrence of each duplicate group
            df = df.drop_duplicates(subset=columns, keep='first')
            
            # Track all columns that remain after deduplication
            remaining_cols = [col for col in df.columns]
            new_cols_total.extend(remaining_cols)
        elif op == "sort_rows":
            # Sort rows based on the specified columns
            if not columns:
                raise ValueError("No columns provided for sort_rows operation")
            
            # Validate that all specified columns exist in the dataframe
            missing_cols = [col for col in columns if col not in df.columns]
            if missing_cols:
                raise ValueError(f"Columns not found for sort_rows operation: {missing_cols}")
            
            # Sort the dataframe by the specified columns (in the order provided)
            df = df.sort_values(by=columns)
            
            # Reset index after sorting (optional, but keeps index clean)
            df.reset_index(drop=True, inplace=True)
            
            # Track all columns that remain after sorting
            remaining_cols = [col for col in df.columns]
            new_cols_total.extend(remaining_cols)
        elif op == "filter_rows_condition":
            # Filter rows based on conditions
            if not columns:
                raise ValueError("No columns provided for filter_rows_condition operation")
            
            # Validate that all specified columns exist in the dataframe
            missing_cols = [col for col in columns if col not in df.columns]
            if missing_cols:
                raise ValueError(f"Columns not found for filter_rows_condition operation: {missing_cols}")
            
            # Get condition parameters from form_payload
            # Expected format: condition_0_operator, condition_0_value for first column
            # condition_1_operator, condition_1_value for second column, etc.
            conditions = []
            for idx, col in enumerate(columns):
                operator_key = f"{op}_{op_idx}_condition_{idx}_operator"
                value_key = f"{op}_{op_idx}_condition_{idx}_value"
                
                operator = form_payload.get(operator_key)
                value = form_payload.get(value_key)
                
                if operator is None or value is None:
                    raise ValueError(f"Missing condition parameters for column '{col}' in filter_rows_condition operation")
                
                conditions.append((col, operator, value))
            
            # Apply conditions to filter rows
            mask = pd.Series([True] * len(df))
            
            for col, operator, value in conditions:
                try:
                    # Try to convert value to numeric if column is numeric
                    if pd.api.types.is_numeric_dtype(df[col]):
                        try:
                            value = float(value)
                        except (ValueError, TypeError):
                            pass
                    
                    # Apply condition based on operator
                    if operator == "==" or operator == "equals":
                        mask = mask & (df[col] == value)
                    elif operator == "!=" or operator == "not_equals":
                        mask = mask & (df[col] != value)
                    elif operator == ">" or operator == "greater_than":
                        mask = mask & (df[col] > value)
                    elif operator == ">=" or operator == "greater_equal":
                        mask = mask & (df[col] >= value)
                    elif operator == "<" or operator == "less_than":
                        mask = mask & (df[col] < value)
                    elif operator == "<=" or operator == "less_equal":
                        mask = mask & (df[col] <= value)
                    elif operator == "contains" or operator == "in":
                        mask = mask & (df[col].astype(str).str.contains(str(value), case=False, na=False))
                    elif operator == "not_contains" or operator == "not_in":
                        mask = mask & (~df[col].astype(str).str.contains(str(value), case=False, na=False))
                    else:
                        raise ValueError(f"Unsupported operator '{operator}' for filter_rows_condition operation")
                except Exception as e:
                    raise ValueError(f"Error applying condition to column '{col}': {str(e)}")
            
            # Filter the dataframe
            df = df[mask].copy()
            
            # Track all columns that remain after filtering
            remaining_cols = [col for col in df.columns]
            new_cols_total.extend(remaining_cols)
        elif op == "filter_top_n_per_group":
            # Filter top N rows per group by metric
            if not columns:
                raise ValueError("No columns provided for filter_top_n_per_group operation")
            
            # Validate that all specified columns exist in the dataframe
            missing_cols = [col for col in columns if col not in df.columns]
            if missing_cols:
                raise ValueError(f"Columns not found for filter_top_n_per_group operation: {missing_cols}")
            
            # Get parameters from form_payload
            n_param = form_payload.get(f"{op}_{op_idx}_n")
            metric_col_param = form_payload.get(f"{op}_{op_idx}_metric_col")
            ascending_param = form_payload.get(f"{op}_{op_idx}_ascending")
            
            if n_param is None:
                raise ValueError("Missing 'n' parameter for filter_top_n_per_group operation")
            
            try:
                n = int(n_param)
                if n < 1:
                    raise ValueError("'n' must be at least 1 for filter_top_n_per_group operation")
            except (ValueError, TypeError):
                raise ValueError(f"Invalid 'n' parameter for filter_top_n_per_group operation: {n_param}")
            
            # Determine metric column (first column if not specified, or use metric_col_param)
            if metric_col_param and metric_col_param in df.columns:
                metric_col = metric_col_param
            elif len(columns) > 0:
                # Use first column as metric if not specified
                metric_col = columns[0]
            else:
                raise ValueError("No metric column specified for filter_top_n_per_group operation")
            
            # Determine sort order (default: descending to get top N)
            ascending = False
            if ascending_param:
                ascending_str = str(ascending_param).lower()
                if ascending_str in ['true', '1', 'yes', 'asc', 'ascending']:
                    ascending = True
            
            # Get identifiers (all columns except the metric column)
            identifier_cols = [col for col in columns if col != metric_col]
            
            if not identifier_cols:
                # If no identifiers, just sort by metric and take top N
                df = df.sort_values(by=metric_col, ascending=ascending).head(n)
            else:
                # Group by identifiers and get top N per group
                def get_top_n_per_group(subdf: pd.DataFrame) -> pd.DataFrame:
                    return subdf.nlargest(n, metric_col) if not ascending else subdf.nsmallest(n, metric_col)
                
                df = df.groupby(identifier_cols, as_index=False).apply(get_top_n_per_group).reset_index(drop=True)
            
            # Track all columns that remain after filtering
            remaining_cols = [col for col in df.columns]
            new_cols_total.extend(remaining_cols)
        elif op == "filter_percentile":
            # Filter rows by percentile - only needs metric_col, not columns selection
            # Get parameters from form_payload
            percentile_param = form_payload.get(f"{op}_{op_idx}_percentile")
            metric_col_param = form_payload.get(f"{op}_{op_idx}_metric_col")
            direction_param = form_payload.get(f"{op}_{op_idx}_direction")  # 'top' or 'bottom'
            
            if percentile_param is None:
                raise ValueError("Missing 'percentile' parameter for filter_percentile operation")
            
            try:
                percentile = float(percentile_param)
                if percentile < 0 or percentile > 100:
                    raise ValueError("Percentile must be between 0 and 100 for filter_percentile operation")
            except (ValueError, TypeError):
                raise ValueError(f"Invalid 'percentile' parameter for filter_percentile operation: {percentile_param}")
            
            # Determine metric column - required parameter
            if not metric_col_param or metric_col_param not in df.columns:
                # Fallback to first column from columns array if provided (for backward compatibility)
                if columns and len(columns) > 0 and columns[0] in df.columns:
                    metric_col = columns[0]
                else:
                    raise ValueError("No metric column specified for filter_percentile operation. Please provide metric_col parameter.")
            else:
                metric_col = metric_col_param
            
            # Validate metric column is numeric
            if not pd.api.types.is_numeric_dtype(df[metric_col]):
                raise ValueError(f"Metric column '{metric_col}' must be numeric for filter_percentile operation")
            
            # Determine direction (default: 'top' to get top percentile)
            direction = 'top'
            if direction_param:
                direction_str = str(direction_param).lower()
                if direction_str in ['bottom', 'lower', 'min']:
                    direction = 'bottom'
            
            # Calculate percentile threshold
            if direction == 'top':
                # Top percentile: keep rows above (100 - percentile) threshold
                threshold = df[metric_col].quantile(1 - (percentile / 100))
                mask = df[metric_col] >= threshold
            else:
                # Bottom percentile: keep rows below percentile threshold
                threshold = df[metric_col].quantile(percentile / 100)
                mask = df[metric_col] <= threshold
            
            # Filter the dataframe
            df = df[mask].copy()
            
            # Track all columns that remain after filtering
            remaining_cols = [col for col in df.columns]
            new_cols_total.extend(remaining_cols)
        elif op == "compute_metrics_within_group":
            # Compute metrics within group using operation-specific identifiers
            if not columns:
                raise ValueError("No columns provided for compute_metrics_within_group operation")
            
            # Validate that all specified columns exist in the dataframe
            missing_cols = [col for col in columns if col not in df.columns]
            if missing_cols:
                raise ValueError(f"Columns not found for compute_metrics_within_group operation: {missing_cols}")
            
            # Get parameters from form_payload - support multiple metric columns
            import json
            
            metric_cols_param = form_payload.get(f"{op}_{op_idx}_metric_cols")
            
            # Parse JSON array of metric columns (new format) or fall back to single metric_col (backward compatibility)
            metric_cols_list = []
            if metric_cols_param:
                try:
                    metric_cols_list = json.loads(metric_cols_param) if isinstance(metric_cols_param, str) else metric_cols_param
                    if not isinstance(metric_cols_list, list):
                        metric_cols_list = []
                except (json.JSONDecodeError, TypeError):
                    metric_cols_list = []
            
            # Backward compatibility: if no metric_cols array, try single metric_col + method
            if not metric_cols_list:
                method_param = form_payload.get(f"{op}_{op_idx}_method")
                metric_col_param = form_payload.get(f"{op}_{op_idx}_metric_col")
                if method_param and metric_col_param:
                    metric_cols_list = [{"metric_col": metric_col_param, "method": method_param}]
            
            if not metric_cols_list:
                raise ValueError("Missing 'metric_cols' parameter for compute_metrics_within_group operation")
            
            # Validate all metric columns and methods
            valid_methods = ['sum', 'mean', 'median', 'max', 'min', 'count', 'nunique', 'rank_pct']
            for item in metric_cols_list:
                if not isinstance(item, dict) or 'metric_col' not in item or 'method' not in item:
                    raise ValueError("Invalid metric_cols format. Each item must have 'metric_col' and 'method'")
                
                metric_col = item['metric_col']
                method = str(item['method']).lower()
                
                if method not in valid_methods:
                    raise ValueError(f"Invalid 'method' parameter '{method}' for compute_metrics_within_group operation. Must be one of: {valid_methods}")
                
                if metric_col not in df.columns:
                    raise ValueError(f"Metric column '{metric_col}' not found in dataframe")
                
                # Validate metric column is numeric (except for count and nunique which work on any column)
                if method not in ['count', 'nunique']:
                    if not pd.api.types.is_numeric_dtype(df[metric_col]):
                        raise ValueError(f"Metric column '{metric_col}' must be numeric for compute_metrics_within_group operation with method '{method}'")
            
            # Use identifiers exactly as provided from frontend (no filtering)
            # Exclude all metric columns from identifiers
            metric_col_names = [item['metric_col'] for item in metric_cols_list]
            operation_identifiers = [col for col in columns if col not in metric_col_names]
            
            if not operation_identifiers:
                raise ValueError("No identifiers found for compute_metrics_within_group operation")
            
            # Reset index if any identifier is in the index (similar to groupby atom)
            df = df.reset_index() if any(x in df.index.names for x in operation_identifiers) else df
            
            # Build aggregation dictionary for all metric columns (single groupby for efficiency)
            agg_dict = {}
            new_col_names = []
            metric_col_mapping = {}  # Map (metric_col, method) to new_col name
            
            # First pass: generate all column names and check for duplicates
            for item in metric_cols_list:
                metric_col = item['metric_col']
                method = str(item['method']).lower()
                
                # Generate new column name (use rename if provided, otherwise default)
                new_col = item.get('rename', '').strip() if item.get('rename') else f"{metric_col}_group_{method}"
                if not new_col:
                    new_col = f"{metric_col}_group_{method}"
                
                # Check if column name already exists in dataframe
                if new_col in df.columns:
                    raise ValueError(f"Column name '{new_col}' already exists in dataframe. Please use a different name.")
                
                # Check for duplicates in the list
                if new_col in new_col_names:
                    raise ValueError(f"Duplicate column name '{new_col}'. Each metric column must have a unique name.")
                
                new_col_names.append(new_col)
                metric_col_mapping[(metric_col, method)] = new_col
            
            # Second pass: build aggregation dictionary
            for item in metric_cols_list:
                metric_col = item['metric_col']
                method = str(item['method']).lower()
                new_col = metric_col_mapping[(metric_col, method)]
                
                if method == 'count':
                    # Count: number of rows per group - handled separately
                    continue
                elif method == 'nunique':
                    # Nunique: number of unique values - handled separately
                    continue
                elif method == 'rank_pct':
                    # Rank percentile: first aggregate with 'first', then apply rank(pct=True) - handled separately
                    agg_dict[f"{new_col}_for_rank"] = pd.NamedAgg(column=metric_col, aggfunc="first")
                    continue
                else:
                    # For sum, mean, median, max, min: use standard aggregation
                    agg_func_map = {
                        'sum': 'sum',
                        'mean': 'mean',
                        'median': 'median',
                        'max': 'max',
                        'min': 'min'
                    }
                    agg_func = agg_func_map.get(method, 'sum')
                    agg_dict[new_col] = pd.NamedAgg(column=metric_col, aggfunc=agg_func)
            
            # Perform groupby aggregation for standard methods
            if agg_dict:
                grouped = df.groupby(operation_identifiers).agg(**agg_dict).reset_index()
            else:
                # If only count/nunique, create empty grouped dataframe with identifiers
                grouped = df[operation_identifiers].drop_duplicates().reset_index(drop=True)
            
            # Handle count, nunique, and rank_pct separately (they need special handling)
            for item in metric_cols_list:
                metric_col = item['metric_col']
                method = str(item['method']).lower()
                new_col = metric_col_mapping[(metric_col, method)]
                
                if method == 'count':
                    # Count: number of rows per group
                    count_grouped = df.groupby(operation_identifiers).size().reset_index(name=new_col)
                    grouped = grouped.merge(count_grouped, on=operation_identifiers, how='left')
                elif method == 'nunique':
                    # Nunique: number of unique values in metric_col per group
                    nunique_grouped = df.groupby(operation_identifiers)[metric_col].nunique().reset_index(name=new_col)
                    grouped = grouped.merge(nunique_grouped, on=operation_identifiers, how='left')
                elif method == 'rank_pct':
                    # Rank percentile: apply rank(pct=True) on the aggregated values
                    if f"{new_col}_for_rank" in grouped.columns:
                        grouped[new_col] = grouped[f"{new_col}_for_rank"].rank(pct=True)
                        grouped.drop(columns=[f"{new_col}_for_rank"], inplace=True)
            
            # Merge all aggregated values back to the original dataframe
            # This maps the group-level aggregated values to each row in that group
            merge_cols = [*operation_identifiers] + new_col_names
            df = df.merge(
                grouped[merge_cols],
                on=operation_identifiers,
                how='left'
            )
            
            new_cols_total.extend(new_col_names)
        elif op == "group_share_of_total":
            # Group share of total: column / group sum(column)
            # Structure similar to compute_metrics_within_group
            if not columns:
                raise ValueError("No columns provided for group_share_of_total operation")
            
            # Validate that all specified columns exist in the dataframe
            missing_cols = [col for col in columns if col not in df.columns]
            if missing_cols:
                raise ValueError(f"Columns not found for group_share_of_total operation: {missing_cols}")
            
            # Get parameters from form_payload - support multiple metric columns
            import json
            
            metric_cols_param = form_payload.get(f"{op}_{op_idx}_metric_cols")
            
            # Parse JSON array of metric columns (new format) or fall back to single metric_col (backward compatibility)
            metric_cols_list = []
            if metric_cols_param:
                try:
                    metric_cols_list = json.loads(metric_cols_param) if isinstance(metric_cols_param, str) else metric_cols_param
                    if not isinstance(metric_cols_list, list):
                        metric_cols_list = []
                except (json.JSONDecodeError, TypeError):
                    metric_cols_list = []
            
            # Backward compatibility: if no metric_cols array, try single metric_col
            if not metric_cols_list:
                metric_col_param = form_payload.get(f"{op}_{op_idx}_metric_col")
                if metric_col_param:
                    metric_cols_list = [{"metric_col": metric_col_param, "rename": ""}]
            
            if not metric_cols_list:
                raise ValueError("Missing 'metric_cols' parameter for group_share_of_total operation")
            
            # Validate all metric columns
            for item in metric_cols_list:
                if not isinstance(item, dict) or 'metric_col' not in item:
                    raise ValueError("Invalid metric_cols format. Each item must have 'metric_col'")
                
                metric_col = item['metric_col']
                
                if metric_col not in df.columns:
                    raise ValueError(f"Metric column '{metric_col}' not found in dataframe")
                
                # Validate metric column is numeric
                if not pd.api.types.is_numeric_dtype(df[metric_col]):
                    raise ValueError(f"Metric column '{metric_col}' must be numeric for group_share_of_total operation")
            
            # Use identifiers exactly as provided from frontend (no filtering)
            # Exclude all metric columns from identifiers
            metric_col_names = [item['metric_col'] for item in metric_cols_list]
            operation_identifiers = [col for col in columns if col not in metric_col_names]
            
            if not operation_identifiers:
                raise ValueError("No identifiers found for group_share_of_total operation")
            
            # Reset index if any identifier is in the index (similar to groupby atom)
            df = df.reset_index() if any(x in df.index.names for x in operation_identifiers) else df
            
            # Build aggregation dictionary for group sums
            agg_dict = {}
            new_col_names = []
            metric_col_mapping = {}  # Map metric_col to new_col name
            
            # First pass: generate all column names and check for duplicates
            for item in metric_cols_list:
                metric_col = item['metric_col']
                
                # Generate new column name (use rename if provided, otherwise default)
                new_col = item.get('rename', '').strip() if item.get('rename') else f"{metric_col}_share_of_total"
                if not new_col:
                    new_col = f"{metric_col}_share_of_total"
                
                # Check if column name already exists in dataframe
                if new_col in df.columns:
                    raise ValueError(f"Column name '{new_col}' already exists in dataframe. Please use a different name.")
                
                # Check for duplicates in the list
                if new_col in new_col_names:
                    raise ValueError(f"Duplicate column name '{new_col}'. Each metric column must have a unique name.")
                
                new_col_names.append(new_col)
                metric_col_mapping[metric_col] = new_col
                
                # Add sum aggregation for each metric column
                agg_dict[f"{new_col}_group_sum"] = pd.NamedAgg(column=metric_col, aggfunc="sum")
            
            # Perform groupby aggregation to get group sums
            if agg_dict:
                grouped = df.groupby(operation_identifiers).agg(**agg_dict).reset_index()
            else:
                # If no aggregations, create empty grouped dataframe with identifiers
                grouped = df[operation_identifiers].drop_duplicates().reset_index(drop=True)
            
            # Merge group sums back to the original dataframe
            merge_cols = [*operation_identifiers] + [f"{metric_col_mapping[mc]}_group_sum" for mc in metric_col_names]
            df = df.merge(
                grouped[merge_cols],
                on=operation_identifiers,
                how='left'
            )
            
            # Calculate share of total for each metric column: column_value / group_sum(column)
            for item in metric_cols_list:
                metric_col = item['metric_col']
                new_col = metric_col_mapping[metric_col]
                group_sum_col = f"{new_col}_group_sum"
                
                # Calculate: column_value / group_sum(column)
                # Handle division by zero: if group_sum is 0 or NaN, result is NaN
                df[new_col] = df[metric_col] / df[group_sum_col].replace(0, np.nan)
                
                # Drop the temporary group_sum column
                df.drop(columns=[group_sum_col], inplace=True)
            
            new_cols_total.extend(new_col_names)
        elif op == "group_contribution":
            # Group contribution: (Group Sum / Overall Sum) × 100
            # Structure similar to compute_metrics_within_group and group_share_of_total
            if not columns:
                raise ValueError("No columns provided for group_contribution operation")
            
            # Validate that all specified columns exist in the dataframe
            missing_cols = [col for col in columns if col not in df.columns]
            if missing_cols:
                raise ValueError(f"Columns not found for group_contribution operation: {missing_cols}")
            
            # Get parameters from form_payload - support multiple metric columns
            import json
            
            metric_cols_param = form_payload.get(f"{op}_{op_idx}_metric_cols")
            
            # Parse JSON array of metric columns (new format) or fall back to single metric_col (backward compatibility)
            metric_cols_list = []
            if metric_cols_param:
                try:
                    metric_cols_list = json.loads(metric_cols_param) if isinstance(metric_cols_param, str) else metric_cols_param
                    if not isinstance(metric_cols_list, list):
                        metric_cols_list = []
                except (json.JSONDecodeError, TypeError):
                    metric_cols_list = []
            
            # Backward compatibility: if no metric_cols array, try single metric_col
            if not metric_cols_list:
                metric_col_param = form_payload.get(f"{op}_{op_idx}_metric_col")
                if metric_col_param:
                    metric_cols_list = [{"metric_col": metric_col_param, "rename": ""}]
            
            if not metric_cols_list:
                raise ValueError("Missing 'metric_cols' parameter for group_contribution operation")
            
            # Validate all metric columns
            for item in metric_cols_list:
                if not isinstance(item, dict) or 'metric_col' not in item:
                    raise ValueError("Invalid metric_cols format. Each item must have 'metric_col'")
                
                metric_col = item['metric_col']
                
                if metric_col not in df.columns:
                    raise ValueError(f"Metric column '{metric_col}' not found in dataframe")
                
                # Validate metric column is numeric
                if not pd.api.types.is_numeric_dtype(df[metric_col]):
                    raise ValueError(f"Metric column '{metric_col}' must be numeric for group_contribution operation")
            
            # Use identifiers exactly as provided from frontend (no filtering)
            # Exclude all metric columns from identifiers
            metric_col_names = [item['metric_col'] for item in metric_cols_list]
            operation_identifiers = [col for col in columns if col not in metric_col_names]
            
            if not operation_identifiers:
                raise ValueError("No identifiers found for group_contribution operation")
            
            # Reset index if any identifier is in the index (similar to groupby atom)
            df = df.reset_index() if any(x in df.index.names for x in operation_identifiers) else df
            
            # Build aggregation dictionary for group sums
            agg_dict = {}
            new_col_names = []
            metric_col_mapping = {}  # Map metric_col to new_col name
            
            # Calculate overall sums for each metric column (across entire dataframe)
            overall_sums = {}
            for item in metric_cols_list:
                metric_col = item['metric_col']
                overall_sums[metric_col] = df[metric_col].sum()
            
            # First pass: generate all column names and check for duplicates
            for item in metric_cols_list:
                metric_col = item['metric_col']
                
                # Generate new column name (use rename if provided, otherwise default)
                new_col = item.get('rename', '').strip() if item.get('rename') else f"{metric_col}_contribution"
                if not new_col:
                    new_col = f"{metric_col}_contribution"
                
                # Check if column name already exists in dataframe
                if new_col in df.columns:
                    raise ValueError(f"Column name '{new_col}' already exists in dataframe. Please use a different name.")
                
                # Check for duplicates in the list
                if new_col in new_col_names:
                    raise ValueError(f"Duplicate column name '{new_col}'. Each metric column must have a unique name.")
                
                new_col_names.append(new_col)
                metric_col_mapping[metric_col] = new_col
                
                # Add sum aggregation for each metric column
                agg_dict[f"{new_col}_group_sum"] = pd.NamedAgg(column=metric_col, aggfunc="sum")
            
            # Perform groupby aggregation to get group sums
            if agg_dict:
                grouped = df.groupby(operation_identifiers).agg(**agg_dict).reset_index()
            else:
                # If no aggregations, create empty grouped dataframe with identifiers
                grouped = df[operation_identifiers].drop_duplicates().reset_index(drop=True)
            
            # Merge group sums back to the original dataframe
            merge_cols = [*operation_identifiers] + [f"{metric_col_mapping[mc]}_group_sum" for mc in metric_col_names]
            df = df.merge(
                grouped[merge_cols],
                on=operation_identifiers,
                how='left'
            )
            
            # Calculate contribution for each metric column: (Group Sum / Overall Sum) × 100
            for item in metric_cols_list:
                metric_col = item['metric_col']
                new_col = metric_col_mapping[metric_col]
                group_sum_col = f"{new_col}_group_sum"
                overall_sum = overall_sums[metric_col]
                
                # Calculate: (Group Sum / Overall Sum) × 100
                # Handle division by zero: if overall_sum is 0 or NaN, result is NaN
                if overall_sum == 0 or pd.isna(overall_sum):
                    df[new_col] = np.nan
                else:
                    df[new_col] = (df[group_sum_col] / overall_sum) * 100
                
                # Drop the temporary group_sum column
                df.drop(columns=[group_sum_col], inplace=True)
            
            new_cols_total.extend(new_col_names)
        else:
            raise ValueError(f"Unsupported operation: {op}")

    if not new_cols_total:
        raise ValueError("No new columns were created")

    create_key = f"{full_object_path}_create.csv"
    clean_df = df.replace({np.nan: None, np.inf: None, -np.inf: None})
    csv_bytes = clean_df.to_csv(index=False).encode("utf-8")
    minio_client.put_object(
        bucket_name=bucket_name,
        object_name=create_key,
        data=io.BytesIO(csv_bytes),
        length=len(csv_bytes),
        content_type="text/csv",
    )

    return {
        "status": "SUCCESS",
        "new_columns": new_cols_total,
        "result_file": create_key,
        "row_count": len(df),
        "columns": list(df.columns),
        "results": clean_df.to_dict("records"),
        "createResults": {
            "result_file": create_key,
            "result_shape": [len(df), len(df.columns)],
            "new_columns": new_cols_total,
        },
    }


def save_dataframe_task(
    *,
    csv_data: str,
    filename: str,
    object_prefix: str,
    overwrite_original: bool,
    client_name: Optional[str] = None,
    app_name: Optional[str] = None,
    project_name: Optional[str] = None,
    user_id: Optional[str] = None,
    project_id: Optional[int] = None,
    operation_details: Optional[Any] = None,
) -> Dict[str, Any]:
    logger.info("🔍 [CREATE-SAVE] Saving dataframe filename=%s", filename)

    try:
        preview = pd.read_csv(io.StringIO(csv_data), nrows=10000)
    except Exception as exc:
        raise ValueError(f"Invalid csv_data: {exc}") from exc

    date_columns: List[str] = []
    for col in preview.columns:
        if pd.api.types.is_numeric_dtype(preview[col]):
            continue
        non_null = preview[col].dropna()
        if non_null.empty:
            continue
        sample = pd.to_datetime(non_null.head(100), errors="coerce")
        if sample.notna().sum() / len(sample) >= 0.8:
            date_columns.append(col)

    df = pd.read_csv(
        io.StringIO(csv_data),
        low_memory=False,
        parse_dates=date_columns if date_columns else False,
        infer_datetime_format=True,
        na_values=['', 'None', 'null', 'NULL', 'nan', 'NaN', 'NA', 'N/A'],
    )

    for col in date_columns:
        if col in df.columns and not pd.api.types.is_datetime64_any_dtype(df[col]):
            df[col] = pd.to_datetime(df[col], errors="coerce")

    if overwrite_original:
        if not filename:
            raise ValueError("filename is required when overwriting original file")
        if not filename.endswith('.arrow'):
            filename = f"{filename}.arrow"
        final_filename = filename
        message = "Original file updated successfully"
    else:
        if not filename:
            filename = f"{datetime.utcnow().timestamp():.0f}_createcolumn.arrow"
        if not filename.endswith('.arrow'):
            filename = f"{filename}.arrow"
        prefix = object_prefix or ""
        if prefix and not prefix.endswith('/'):
            prefix = f"{prefix}/"
        final_filename = f"{prefix}create-data/{filename}" if prefix else f"create-data/{filename}"
        message = "DataFrame saved successfully"

    arrow_bytes = _ensure_arrow_bytes(df)
    minio_client.put_object(
        MINIO_BUCKET,
        final_filename,
        data=io.BytesIO(arrow_bytes),
        length=len(arrow_bytes),
        content_type="application/octet-stream",
    )
    redis_client.setex(final_filename, 3600, arrow_bytes)

    mongo_save_result: Optional[Dict[str, Any]] = None
    if client_name and app_name and project_name and operation_details:
        document_id = f"{client_name}/{app_name}/{project_name}"
        if isinstance(operation_details, str):
            try:
                operation_payload = json.loads(operation_details)
            except json.JSONDecodeError:
                operation_payload = {"raw": operation_details}
        else:
            operation_payload = dict(operation_details)
        operation_payload.update(
            {
                "saved_file": final_filename,
                "file_shape": df.shape,
                "file_columns": list(df.columns),
                "client_name": client_name,
                "app_name": app_name,
                "project_name": project_name,
                "user_id": user_id or "",
                "project_id": project_id,
            }
        )
        try:
            mongo_save_result = _store_create_config(document_id, operation_payload)
        except Exception as exc:
            logger.warning("⚠️ [CREATE-SAVE] MongoDB save error: %s", exc)
            mongo_save_result = {"status": "error", "error": str(exc)}

    return {
        "result_file": final_filename,
        "shape": df.shape,
        "columns": list(df.columns),
        "message": message,
        "overwrite_original": overwrite_original,
        "mongo_save_result": mongo_save_result,
    }


def cached_dataframe_task(
    *,
    object_name: str,
    page: int = 1,
    page_size: int = 50,
) -> Dict[str, Any]:
    from urllib.parse import unquote

    object_name = unquote(object_name)
    content = redis_client.get(object_name)
    if content is None:
        response = minio_client.get_object(MINIO_BUCKET, object_name)
        content = response.read()
        redis_client.setex(object_name, 3600, content)

    if object_name.endswith(".arrow"):
        reader = ipc.RecordBatchFileReader(pa.BufferReader(content))
        df = reader.read_all().to_pandas()
    else:
        df = pd.read_csv(io.BytesIO(content))

    total_rows = len(df)
    start_idx = (page - 1) * page_size
    end_idx = start_idx + page_size
    subset = df.iloc[start_idx:end_idx]
    csv_text = subset.to_csv(index=False)

    return {
        "data": csv_text,
        "pagination": {
            "current_page": page,
            "page_size": page_size,
            "total_rows": total_rows,
            "total_pages": (total_rows + page_size - 1) // page_size,
            "start_row": start_idx + 1,
        "end_row": min(end_idx, total_rows),
    },
}


def classification_task(
    *,
    validator_atom_id: str,
    file_key: str,
) -> Dict[str, Any]:
    identifiers: List[str] = []
    measures: List[str] = []
    
    # Fetch directly from MongoDB (bypass Redis) to get latest identifiers
    from app.features.column_classifier.database import get_classifier_config_from_mongo
    
    # Extract client/app/project from file_key path
    path_parts = file_key.split('/')
    client_name = path_parts[0] if len(path_parts) > 0 else ""
    app_name = path_parts[1] if len(path_parts) > 1 else ""
    project_name = path_parts[2] if len(path_parts) > 2 else ""
    
    # Try to get from column_classifier_config collection first (latest source)
    if client_name and app_name and project_name:
        cfg = get_classifier_config_from_mongo(client_name, app_name, project_name)
        if cfg and isinstance(cfg.get("identifiers"), list) and isinstance(cfg.get("measures"), list):
            identifiers = [i for i in cfg["identifiers"] if isinstance(i, str)]
            measures = [m for m in cfg["measures"] if isinstance(m, str)]
    
    # Fallback to legacy collection if not found in classifier_config
    if not identifiers:
        client = _get_mongo_client()
        collection = client["validator_atoms_db"]["column_classifications"]
        document = collection.find_one(
            {
                "validator_atom_id": validator_atom_id,
                "file_key": file_key,
            }
        )
        if document and "final_classification" in document:
            final = document["final_classification"] or {}
            identifiers = [
                i for i in final.get("identifiers", []) if isinstance(i, str)
            ]
            measures = [m for m in final.get("measures", []) if isinstance(m, str)]

    time_keywords = {"date", "time", "month", "months", "week", "weeks", "year", "day", "days"}
    # Filter out any column that contains "date" in its name, or matches time keywords
    identifiers = [
        col for col in identifiers 
        if "date" not in col.lower() and col.lower() not in time_keywords
    ]

    unclassified: List[str] = []
    try:
        client = _get_mongo_client()
        collection = client["validator_atoms_db"]["column_classifications"]
        document = collection.find_one(
            {
                "validator_atom_id": validator_atom_id,
                "file_key": file_key,
            }
        )
        if document and "final_classification" in document:
            final = document["final_classification"] or {}
            values = final.get("unclassified", [])
            if isinstance(values, list):
                unclassified = [str(v) for v in values]
    except Exception as exc:
        logger.warning("⚠️ classification_task fallback: %s", exc)

    return {
        "identifiers": identifiers,
        "measures": measures,
        "unclassified": unclassified,
    }


def cardinality_task(
    *,
    bucket_name: str,
    object_name: str,
) -> Dict[str, Any]:
    dataframe = get_minio_df(bucket_name, object_name)
    dataframe.columns = dataframe.columns.str.strip().str.lower()

    cardinality_data: List[Dict[str, Any]] = []
    for col in dataframe.columns:
        series = dataframe[col].dropna()
        try:
            values = series.unique()
        except TypeError:
            values = series.astype(str).unique()

        def _serialize(value: Any) -> str:
            if isinstance(value, (pd.Timestamp, datetime)):
                return pd.to_datetime(value).isoformat()
            return str(value)

        safe_values = [_serialize(v) for v in values]
        cardinality_data.append(
            {
                "column": col,
                "data_type": str(dataframe[col].dtype),
                "unique_count": int(len(values)),
                "unique_values": safe_values,
            }
        )

    return {"status": "SUCCESS", "cardinality": cardinality_data}


def columns_with_missing_values_task(
    *,
    bucket_name: str,
    object_name: str,
) -> Dict[str, Any]:
    """Return list of column names that have missing values."""
    logger.info("🔍 [CREATE-MISSING-VALUES] Checking for columns with missing values: %s", object_name)
    
    dataframe = get_minio_df(bucket_name, object_name)
    dataframe.columns = dataframe.columns.str.strip().str.lower()
    
    columns_with_missing: List[str] = []
    for col in dataframe.columns:
        null_count = dataframe[col].isnull().sum()
        if null_count > 0:
            columns_with_missing.append(col)
            logger.info("   ✅ Column '%s' has %d missing values", col, null_count)
    
    logger.info("📊 [CREATE-MISSING-VALUES] Found %d columns with missing values", len(columns_with_missing))
    
    return {
        "status": "SUCCESS",
        "columns_with_missing_values": columns_with_missing
    }


__all__ = [
    "perform_createcolumn_task",
    "fetch_create_results_task",
    "save_dataframe_task",
    "cached_dataframe_task",
    "classification_task",
    "cardinality_task",
    "columns_with_missing_values_task",
]

