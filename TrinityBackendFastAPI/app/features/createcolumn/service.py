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

    legacy_skipped = {"options", "object_names", "bucket_name", "identifiers"}
    for key, value in form_payload.multi_items():
        if key in legacy_skipped or op_pattern.match(key):
            continue
        columns = [part.strip() for part in value.split(",") if part.strip()]
        rename_val = form_payload.get(f"{key}_rename")
        operations.append((key, columns, rename_val, None))

    new_cols_total: List[str] = []

    for op, columns, rename_val, op_idx in operations:
        if not columns:
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
            new_col = rename_val or "_times_".join(columns)
            result = df[columns[0]].copy()
            for col in columns[1:]:
                result *= df[col]
            df[new_col] = result
            new_cols_total.append(new_col)
        elif op == "divide":
            new_col = rename_val or "_dividedby_".join(columns)
            result = df[columns[0]].copy()
            for col in columns[1:]:
                result /= df[col]
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
    cfg = redis_classifier_config()
    if cfg and isinstance(cfg.get("identifiers"), list) and isinstance(cfg.get("measures"), list):
        identifiers = [i for i in cfg["identifiers"] if isinstance(i, str)]
        measures = [m for m in cfg["measures"] if isinstance(m, str)]
    else:
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

    time_keywords = {"date", "time", "month", "months", "week", "weeks", "year"}
    identifiers = [col for col in identifiers if col.lower() not in time_keywords]

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


__all__ = [
    "perform_createcolumn_task",
    "save_dataframe_task",
    "cached_dataframe_task",
    "classification_task",
    "cardinality_task",
]

