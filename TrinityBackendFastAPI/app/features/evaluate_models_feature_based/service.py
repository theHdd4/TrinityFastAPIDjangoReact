"""Task-friendly helpers for evaluate feature-based atom.

These functions mirror the light-weight service modules used by other
atoms (for example :mod:`dataframe_operations.service`) so every heavy
request path can be delegated to Celery via ``celery_task_client``.  Each
callable is intentionally self contained: it fetches its own MinIO client
and build configuration, performs the requested computation, and returns
plain dictionaries that the task queue can serialise.
"""

from __future__ import annotations

import asyncio
import json
import logging
import os
from io import BytesIO
from typing import Any, Dict, Iterable, List, Optional, Tuple

import numpy as np
import pandas as pd
from minio import Minio

from .config import settings
from .database import get_build_config, get_minio
from .schemas import (
    ActualPredictedItem,
    ActualPredictedResponse,
    ContributionsItem,
    ContributionsResponse,
    PerformanceMetrics,
    SelectedModelRow,
    SelectedModelsResponse,
)

logger = logging.getLogger("app.features.evaluate_models_feature_based.service")

MINIO_BUCKET = os.getenv("MINIO_BUCKET", settings.minio_bucket_name)


def _read_minio_dataframe(client: Minio, bucket: str, key: str) -> pd.DataFrame:
    """Load a dataframe from MinIO using common parquet/feather/csv formats."""
    resp = client.get_object(bucket, key)
    data = resp.read()
    resp.close()
    resp.release_conn()

    lower = key.lower()
    if lower.endswith(".parquet"):
        return pd.read_parquet(BytesIO(data))
    if lower.endswith(".feather") or lower.endswith(".arrow"):
        return pd.read_feather(BytesIO(data))
    if lower.endswith(".csv"):
        return pd.read_csv(BytesIO(data))

    # fall back to parquet then feather
    try:
        return pd.read_parquet(BytesIO(data))
    except Exception:
        return pd.read_feather(BytesIO(data))


def _collect_selected_rows(results_df: pd.DataFrame) -> List[Tuple[str, str]]:
    combination_col = None
    model_name_col = None
    selected_models_col = None

    for col in results_df.columns:
        col_lower = col.lower()
        if col_lower == "combination_id":
            combination_col = col
        elif col_lower == "model_name":
            model_name_col = col
        elif col_lower == "selected_models":
            selected_models_col = col

    missing: List[str] = []
    if not combination_col:
        missing.append("combination_id")
    if not model_name_col:
        missing.append("model_name")
    
    if missing:
        raise ValueError(f"Results file missing required columns: {missing}")
    
    # If selected_models column doesn't exist, use all rows (backward compatibility)
    if not selected_models_col:
        logger.warning("No selected_models column found in dataset, using all data")
        return [(str(r[combination_col]), str(r[model_name_col])) for _, r in results_df.iterrows()]

    truthy = {"selected", "true", "yes", "1", "y"}
    rows = results_df[results_df[selected_models_col].apply(lambda v: str(v).strip().lower() in truthy)]
    if rows.empty:
        logger.warning("No rows marked as selected; falling back to all models in results file")
        rows = results_df

    return [(str(r[combination_col]), str(r[model_name_col])) for _, r in rows.iterrows()]


def _extract_betas_from_results_file(results_df: pd.DataFrame, combination_id: str) -> tuple[Dict[str, float], float, Dict[str, Any]]:
    combination_id_column = None
    selected_models_column = None
    for col in results_df.columns:
        col_lower = col.lower()
        if col_lower == "combination_id" or "combination_id" in col_lower or "combo_id" in col_lower:
            combination_id_column = col
        if col_lower == "selected_models" or "selected_models" in col_lower:
            selected_models_column = col

    if not combination_id_column:
        raise ValueError("Results file missing combination_id column")
    
    # If selected_models column doesn't exist, filter only by combination_id (backward compatibility)
    if not selected_models_column:
        filtered_df = results_df[results_df[combination_id_column] == combination_id]
    else:
        filtered_df = results_df[
            (results_df[combination_id_column] == combination_id)
            & (results_df[selected_models_column].str.lower() == "yes")
        ]
        if filtered_df.empty:
            filtered_df = results_df[results_df[combination_id_column] == combination_id]
    
    if filtered_df.empty:
        raise ValueError(f"No rows found for combination_id={combination_id}")

    combination_row = filtered_df.iloc[0]

    intercept = 0.0
    if "intercept" in results_df.columns:
        value = combination_row["intercept"]
        if pd.notna(value):
            intercept = float(value)

    beta_columns = [c for c in results_df.columns if c.lower().endswith("_beta")]
    if not beta_columns:
        raise ValueError("No beta columns found in results file")

    betas: Dict[str, float] = {}
    for col in beta_columns:
        value = combination_row[col]
        if pd.notna(value):
            betas[col.replace("_beta", "").replace("_Beta", "")] = float(value)

    transformation_metadata: Dict[str, Any] = {}
    if "transformation_metadata" in results_df.columns:
        raw = combination_row["transformation_metadata"]
        if pd.notna(raw):
            if isinstance(raw, str):
                try:
                    transformation_metadata = json.loads(raw)
                except json.JSONDecodeError:
                    pass
            elif isinstance(raw, dict):
                transformation_metadata = raw

    return betas, intercept, transformation_metadata


def _file_key_for_combo(build_cfg: dict, combination_name: str) -> str:
    for item in build_cfg.get("combination_file_keys", []):
        if item.get("combination") == combination_name:
            key = item.get("file_key")
            if key:
                return key
    raise ValueError(f"No file key found for combination '{combination_name}'")


def _metrics(actual: np.ndarray, pred: np.ndarray) -> Dict[str, float]:
    if len(actual) == 0:
        return {"mae": 0.0, "mse": 0.0, "rmse": 0.0, "r2": 0.0, "mape": 0.0}
    from sklearn.metrics import mean_absolute_error, mean_squared_error, r2_score

    mae = float(mean_absolute_error(actual, pred))
    mse = float(mean_squared_error(actual, pred))
    rmse = float(mse**0.5)
    r2 = float(r2_score(actual, pred)) if np.isfinite(actual).all() and np.isfinite(pred).all() else 0.0
    mape = (
        float(np.mean([abs((a - p) / a) for a, p in zip(actual, pred) if a != 0.0]) * 100)
        if np.any(actual != 0)
        else 0.0
    )
    return {"mae": mae, "mse": mse, "rmse": rmse, "r2": r2, "mape": mape}


def _truthy_selected(val: Any) -> bool:
    if val is None:
        return False
    return str(val).strip().lower() in {"selected", "true", "yes", "1", "y"}


def _year_col(df: pd.DataFrame) -> Optional[str]:
    for c in ["year"]:
        if c in df.columns:
            return c
    return None


def _table_to_records(df: pd.DataFrame) -> List[Dict[str, Any]]:
    keep = [
        "Scope",
        "combination_id",
        "y_variable",
        "x_variables",
        "model_name",
        "mape_train",
        "mape_test",
        "r2_train",
        "r2_test",
        "aic",
        "bic",
        "price_elasticity",
        "run_id",
        "timestamp",
        "selected_models",
    ]
    columns = [c for c in keep if c in df.columns]
    if columns:
        df = df[columns]
    return df.to_dict(orient="records")


async def list_selected_models(
    *,
    bucket: str = MINIO_BUCKET,
    prefix: Optional[str] = None,
    recursive: bool = True,
    limit: int = 1000,
    offset: int = 0,
    extensions: str | None = "parquet,feather,arrow",
) -> Dict[str, Any]:
    client = get_minio()
    if not client.bucket_exists(bucket):
        raise ValueError(f"Bucket '{bucket}' not found")

    allowed_ext = {"." + e.strip().lower().lstrip(".") for e in (extensions or "").split(",") if e.strip()} or {
        ".parquet",
        ".feather",
        ".arrow",
    }
    objs = client.list_objects(bucket, prefix=prefix or "", recursive=recursive)
    files_scanned = 0
    total_rows_scanned = 0
    all_rows: List[Dict[str, Any]] = []

    for obj in objs:
        key = getattr(obj, "object_name", "")
        ext = os.path.splitext(key)[1].lower()
        if ext not in allowed_ext:
            continue

        try:
            resp = client.get_object(bucket, key)
            data = resp.read()
            resp.close()
            resp.release_conn()
        except Exception as exc:
            continue

        files_scanned += 1
        try:
            table = pd.read_parquet(BytesIO(data)) if ext == ".parquet" else pd.read_feather(BytesIO(data))
        except Exception as exc:
            continue

        total_rows_scanned += len(table)
        filtered = table[table.get("selected_models", pd.Series(dtype=str)).astype(str).str.lower().isin({"selected", "true", "yes", "1"})]
        if filtered.empty:
            continue
        rows = _table_to_records(filtered)
        all_rows.extend(rows)
        if len(all_rows) >= offset + limit + 1000:
            break

    sliced = all_rows[offset : offset + limit]
    response = SelectedModelsResponse(
        bucket=bucket,
        prefix=prefix,
        files_scanned=files_scanned,
        total_rows_scanned=total_rows_scanned,
        count=len(sliced),
        items=[SelectedModelRow(**r) for r in sliced],
    )
    return response.model_dump()

def compute_actual_vs_predicted(
    *,
    results_file_key: str,
    client_name: str,
    app_name: str,
    project_name: str,
    bucket: str = MINIO_BUCKET,
    limit_models: int = 1000,
) -> Dict[str, Any]:
    """Calculate actual vs predicted values for selected models. Non-async wrapper for async operations."""
    from ..select_models_feature_based.s_curve import apply_transformation_steps
    
    # Use asyncio to run async MongoDB operations
    async def _compute():
        # Create a new MongoDB client for this event loop to avoid "attached to different loop" errors
        # Use the same pattern as select atom
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
            # Create MinIO client
            client = get_minio()
            results_df = _read_minio_dataframe(client, bucket, results_file_key)
            results_df.columns = results_df.columns.str.lower()
            
            selected_pairs = _collect_selected_rows(results_df)[:limit_models]
            
            # Get build config using the new MongoDB client
            document_id = f"{client_name}/{app_name}/{project_name}"
            build_cfg = await loop_db["build-model_featurebased_configs"].find_one({"_id": document_id})
            
            if not build_cfg:
                raise ValueError(f"No build configuration found for {document_id}")

            items: List[Dict[str, Any]] = []
            for idx, (combination_id, model_name) in enumerate(selected_pairs):
                file_key = _file_key_for_combo(build_cfg, combination_id)
                src_df = _read_minio_dataframe(client, bucket, file_key)
                src_df.columns = src_df.columns.str.lower()

                betas, intercept, _ = _extract_betas_from_results_file(results_df, combination_id)

                transformation_metadata: Dict[str, Any] = {}
                model_coeffs = build_cfg.get("model_coefficients", {}).get(combination_id, {}).get(model_name, {})
                transformation_metadata = model_coeffs.get("transformation_metadata", {}) if isinstance(model_coeffs, dict) else {}

                x_vars = list(betas.keys())
                y_var = (build_cfg.get("y_variable") or "Volume").lower()
                if y_var not in src_df.columns:
                    raise ValueError(f"y_variable '{y_var}' not in source for {combination_id}")
                actual = pd.to_numeric(src_df[y_var], errors="coerce").fillna(0.0).to_numpy(dtype=float)

                date_column = next((c for c in ["date", "invoice_date", "bill_date", "order_date", "month", "period", "year"] if c in src_df.columns), None)
                dates_list: Optional[List[str]] = None
                if date_column:
                    parsed = pd.to_datetime(src_df[date_column], errors="coerce")
                    dates_list = [d.isoformat() if pd.notna(d) else None for d in parsed]

                has_transformations = bool(transformation_metadata)
                predicted_values: List[float] = []
                for row_idx, row in src_df.iterrows():
                    predicted_value = intercept
                    for x_var in x_vars:
                        if x_var in src_df.columns:
                            x_value = row[x_var]
                            if has_transformations:
                                transformation_steps = None
                                for key in (x_var, x_var.lower(), x_var.upper()):
                                    if key in transformation_metadata and isinstance(transformation_metadata[key], dict):
                                        transformation_steps = transformation_metadata[key].get("transformation_steps")
                                        break
                                if transformation_steps:
                                    try:
                                        x_value = apply_transformation_steps([x_value], transformation_steps)[0]
                                    except Exception as exc:
                                        pass
                            predicted_value += betas.get(x_var, 0.0) * x_value
                    predicted_values.append(predicted_value)

                pred = np.array(predicted_values)
                original_count = len(actual)
                if len(predicted_values) > 0:
                    predicted_array = np.array(predicted_values)
                    actual_array = np.array(actual)
                    pred_99th = np.percentile(predicted_array, 99)
                    pred_1st = np.percentile(predicted_array, 1)
                    actual_99th = np.percentile(actual_array, 99)
                    actual_1st = np.percentile(actual_array, 1)
                    filtered_data = [
                        (a, p, dates_list[i] if dates_list else None)
                        for i, (a, p) in enumerate(zip(actual, predicted_values))
                        if (pred_1st <= p <= pred_99th and actual_1st <= a <= actual_99th)
                    ]
                    if len(filtered_data) < len(actual):
                        actual = np.array([item[0] for item in filtered_data])
                        pred = np.array([item[1] for item in filtered_data])
                        if dates_list is not None:
                            dates_list = [item[2] for item in filtered_data]

                if len(pred) > 0 and len(actual) > 0:
                    p99, p01 = np.percentile(pred, 99), np.percentile(pred, 1)
                    a99, a01 = np.percentile(actual, 99), np.percentile(actual, 1)
                    mask = (pred <= p99) & (pred >= p01) & (actual <= a99) & (actual >= a01)
                    final_count = mask.sum()
                    actual = actual[mask]
                    pred = pred[mask]
                    if dates_list is not None:
                        dates_array = np.array(dates_list, dtype=object)
                        dates_list = dates_array[mask].tolist()
                    
                    metrics = _metrics(actual, pred)
                else:
                    metrics = {"mae": 0.0, "mse": 0.0, "rmse": 0.0, "r2": 0.0, "mape": 0.0}
                    # Ensure actual and pred are arrays even if empty
                    if len(actual) == 0:
                        actual = np.array([], dtype=float)
                    if len(pred) == 0:
                        pred = np.array([], dtype=float)

                # Only append if we have at least some data points
                if len(actual) > 0 and len(pred) > 0:
                    items.append(
                        ActualPredictedItem(
                            combination_id=combination_id,
                            model_name=model_name,
                            file_key=file_key,
                            actual_values=actual.tolist(),
                            predicted_values=pred.tolist(),
                            dates=dates_list,
                            performance_metrics=PerformanceMetrics(**metrics),
                            data_points=int(len(actual)),
                        ).model_dump()
                    )

            # Validate items before creating response
            validated_items = []
            for item_dict in items:
                try:
                    # Items are already dictionaries from .model_dump(), so we can use them directly
                    # But validate them to ensure they're correct
                    validated_items.append(ActualPredictedItem(**item_dict))
                except Exception as e:
                    # Skip invalid items
                    continue
            
            if not validated_items:
                return {
                    "results_file_key": results_file_key,
                    "bucket": bucket,
                    "models_count": 0,
                    "items": []
                }
            
            response = ActualPredictedResponse(
                results_file_key=results_file_key,
                bucket=bucket,
                models_count=len(validated_items),
                items=validated_items,
            )
            result = response.model_dump()
            return result
        except Exception as e:
            raise
        finally:
            # Close the MongoDB client for this event loop
            loop_client.close()
    
    # Run async function - handle both sync and async contexts
    try:
        # Check if there's a running event loop
        loop = asyncio.get_running_loop()
        # If we get here, there's a running loop, so we need to use a different approach
        import concurrent.futures
        import threading
        
        def run_in_thread():
            # Create a new event loop in this thread
            new_loop = asyncio.new_event_loop()
            asyncio.set_event_loop(new_loop)
            try:
                return new_loop.run_until_complete(_compute())
            finally:
                new_loop.close()
        
        with concurrent.futures.ThreadPoolExecutor() as executor:
            future = executor.submit(run_in_thread)
            result = future.result()
    except RuntimeError:
        # No running event loop, safe to use asyncio.run()
        result = asyncio.run(_compute())
    
    return result



def compute_contributions_yoy(
    *,
    results_file_key: str,
    client_name: str,
    app_name: str,
    project_name: str,
    bucket: str = MINIO_BUCKET,
) -> Dict[str, Any]:
    """Calculate contributions YoY for selected models. Non-async wrapper for async operations."""
    
    async def _compute():
        # Create a new MongoDB client for this event loop to avoid "attached to different loop" errors
        # Use the same pattern as select atom
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
            # Create MinIO client
            client = get_minio()
            results_df = _read_minio_dataframe(client, bucket, results_file_key)
            results_df.columns = results_df.columns.str.lower()
            selected_pairs = _collect_selected_rows(results_df)
            
            # Get build config using the new MongoDB client
            document_id = f"{client_name}/{app_name}/{project_name}"
            build_cfg = await loop_db["build-model_featurebased_configs"].find_one({"_id": document_id})
            
            if not build_cfg:
                raise ValueError(f"No build configuration found for {document_id}")

            out_items: List[Dict[str, Any]] = []
            for combination_id, model_name in selected_pairs:
                file_key = _file_key_for_combo(build_cfg, combination_id)
                df = _read_minio_dataframe(client, bucket, file_key)

                betas, intercept, _ = _extract_betas_from_results_file(results_df, combination_id)
                x_vars = list(betas.keys())

                year_col = _year_col(df)
                if not year_col:
                    raise ValueError(f"Source for {combination_id} has no Year column")

                contrib_cols: Dict[str, pd.Series] = {}
                for x in x_vars:
                    if x in df.columns:
                        vec = pd.to_numeric(df[x], errors="coerce").fillna(0.0)
                        contrib_cols[x] = (betas.get(x, 0.0) * vec).astype(float)

                if not contrib_cols:
                    continue

                contrib_df = pd.DataFrame(contrib_cols)
                contrib_df[year_col] = df[year_col]

                yearly = contrib_df.groupby(year_col).sum(numeric_only=True).sort_index()
                yoy = yearly.pct_change().replace([np.inf, -np.inf], np.nan) * 100.0

                years_list: List[Any]
                if np.issubdtype(yearly.index.dtype, np.number):
                    years_list = yearly.index.astype(int).tolist()
                else:
                    years_list = yearly.index.astype(str).tolist()

                out_items.append(
                    ContributionsItem(
                        combination_id=combination_id,
                        model_name=model_name,
                        file_key=file_key,
                        years=years_list,
                        yearly_contributions={col: yearly[col].round(6).tolist() for col in yearly.columns},
                        yoy_contributions_pct={col: yoy[col].round(4).fillna(0.0).tolist() for col in yearly.columns},
                    ).model_dump()
                )

            if not out_items:
                raise ValueError("No selected models (or no contribution variables) found")

            response = ContributionsResponse(
                results_file_key=results_file_key,
                bucket=bucket,
                models_count=len(out_items),
                items=[ContributionsItem(**i) for i in out_items],
            )
            return response.model_dump()
        finally:
            # Close the MongoDB client for this event loop
            loop_client.close()
    
    return _run_async_in_sync_context(_compute())


def compute_yoy_growth(
    *,
    results_file_key: str,
    client_name: str,
    app_name: str,
    project_name: str,
    bucket: str = MINIO_BUCKET,
) -> Dict[str, Any]:
    """Calculate YoY growth for selected models. Non-async wrapper for async operations."""
    from ..select_models_feature_based.s_curve import apply_transformation_steps
    
    async def _compute():
        # Create a new MongoDB client for this event loop to avoid "attached to different loop" errors
        # Use the same pattern as select atom
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
            # Create MinIO client
            client = get_minio()
            
            # Get build config using the new MongoDB client
            document_id = f"{client_name}/{app_name}/{project_name}"
            build_cfg = await loop_db["build-model_featurebased_configs"].find_one({"_id": document_id})
            
            if not build_cfg:
                raise ValueError(f"No build configuration found for {document_id}")
            
            results_df = _read_minio_dataframe(client, bucket, results_file_key)
            results_df.columns = results_df.columns.str.lower()
            
            selected_pairs = _collect_selected_rows(results_df)
            if not selected_pairs:
                raise ValueError("No selected models found in the results file")

            yoy_results: List[Dict[str, Any]] = []
            for idx, (combination_id, model_name) in enumerate(selected_pairs):
                betas, intercept, transformation_metadata = _extract_betas_from_results_file(results_df, combination_id)
                
                x_vars = list(betas.keys())
                y_var = (build_cfg.get("y_variable") or "Volume").lower()

                try:
                    combo_coeffs = build_cfg.get("model_coefficients", {}).get(combination_id, {})
                    model_coeffs = combo_coeffs.get(model_name, {}) if isinstance(combo_coeffs, dict) else {}
                    from_mongo = model_coeffs.get("transformation_metadata", {}) if isinstance(model_coeffs, dict) else {}
                    if isinstance(from_mongo, str):
                        try:
                            from_mongo = json.loads(from_mongo)
                        except json.JSONDecodeError:
                            from_mongo = {}
                    if isinstance(from_mongo, dict):
                        transformation_metadata = from_mongo
                except Exception as exc:
                    pass

                has_transformations = bool(transformation_metadata)
                
                file_key = _file_key_for_combo(build_cfg, combination_id)
                df = _read_minio_dataframe(client, bucket, file_key)
                df.columns = df.columns.str.lower()

                date_column = next((c for c in ["date", "invoice_date", "bill_date", "order_date", "month", "period", "year"] if c in df.columns), None)
                if not date_column:
                    continue
                
                df[date_column] = pd.to_datetime(df[date_column], errors="coerce")
                df = df.dropna(subset=[date_column])
                years = sorted(df[date_column].dt.year.unique())
                
                if len(years) < 2:
                    continue

                year_first, year_last = int(years[0]), int(years[-1])
                
                df_first_year = df[df[date_column].dt.year == year_first]
                df_last_year = df[df[date_column].dt.year == year_last]
                
                if df_first_year.empty or df_last_year.empty:
                    continue

                y_first_mean = df_first_year[y_var].mean() if y_var in df_first_year.columns else 0
                y_last_mean = df_last_year[y_var].mean() if y_var in df_last_year.columns else 0
                observed_delta = float(y_last_mean - y_first_mean)

                explained_delta = 0.0
                contributions: List[Dict[str, Any]] = []
                
                for x_var in x_vars:
                    if x_var in betas and x_var in df.columns:
                        beta_value = betas[x_var]
                        x_first = df_first_year[x_var].mean()
                        x_last = df_last_year[x_var].mean()

                        if has_transformations and x_var in transformation_metadata:
                            var_meta = transformation_metadata[x_var]
                            if isinstance(var_meta, dict) and "transformation_steps" in var_meta:
                                var_meta = var_meta["transformation_steps"]
                            if isinstance(var_meta, str):
                                try:
                                    parsed = json.loads(var_meta)
                                    if isinstance(parsed, dict) and "transformation_steps" in parsed:
                                        var_meta = parsed["transformation_steps"]
                                except json.JSONDecodeError:
                                    var_meta = []
                            try:
                                x_first = apply_transformation_steps([x_first], var_meta)[0]
                                x_last = apply_transformation_steps([x_last], var_meta)[0]
                            except Exception as exc:
                                pass

                        delta = float(x_last - x_first)
                        contribution = float(beta_value * delta)
                        explained_delta += contribution
                        contributions.append(
                            {
                                "variable": x_var,
                                "beta": beta_value,
                                "delta": delta,
                                "contribution": contribution,
                            }
                        )

                # Calculate residual
                residual = float(observed_delta - explained_delta)
                
                # Calculate YoY percentage change
                yoy_percentage = 0.0
                if y_first_mean != 0:
                    yoy_percentage = (observed_delta / y_first_mean) * 100
                
                # Create waterfall data for visualization (same format as select atom)
                waterfall_labels = [f"Base {year_first}"] + [c["variable"] for c in contributions] + ["Residual", f"Final {year_last}"]
                waterfall_values = [float(y_first_mean)] + [c["contribution"] for c in contributions] + [residual, float(y_last_mean)]
                
                yoy_results.append(
                    {
                        "combination_id": combination_id,
                        "model_name": model_name,
                        "file_key": file_key,
                        "year_first": year_first,
                        "year_last": year_last,
                        "observed_delta": observed_delta,
                        "explained_delta": explained_delta,
                        "contributions": contributions,
                        "waterfall": {
                            "labels": waterfall_labels,
                            "values": waterfall_values
                        }
                    }
                )

            result = {"results": yoy_results, "results_file_key": results_file_key, "bucket": bucket}
            return result
        except Exception as e:
            raise
        finally:
            # Close the MongoDB client for this event loop
            loop_client.close()
    
    # Run async function - handle both sync and async contexts
    try:
        # Check if there's a running event loop
        loop = asyncio.get_running_loop()
        # If we get here, there's a running loop, so we need to use a different approach
        import concurrent.futures
        import threading
        
        def run_in_thread():
            # Create a new event loop in this thread
            new_loop = asyncio.new_event_loop()
            asyncio.set_event_loop(new_loop)
            try:
                return new_loop.run_until_complete(_compute())
            finally:
                new_loop.close()
        
        with concurrent.futures.ThreadPoolExecutor() as executor:
            future = executor.submit(run_in_thread)
            result = future.result()
    except RuntimeError:
        # No running event loop, safe to use asyncio.run()
        result = asyncio.run(_compute())
    
    return result


__all__ = [
    "list_selected_models",
    "compute_actual_vs_predicted",
    "compute_contributions_yoy",
    "compute_yoy_growth",
]
