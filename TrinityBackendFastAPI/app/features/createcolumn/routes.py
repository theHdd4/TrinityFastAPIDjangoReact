# app/routes.py

from fastapi import APIRouter, Form, HTTPException, Query, Body
from fastapi.responses import Response

import json
from datetime import datetime
import numpy as np
# from .create.base import calculate_residuals, compute_rpi, apply_stl_outlier
from .create.base import calculate_residuals, compute_rpi, apply_stl_outlier

from .deps import get_minio_df,fetch_measures_list,fetch_identifiers_and_measures,get_column_classifications_collection,get_create_settings_collection,minio_client, MINIO_BUCKET, redis_client
from app.features.data_upload_validate.app.routes import get_object_prefix
from .mongodb_saver import save_create_data,save_create_data_settings,save_createandtransform_configs,get_createandtransform_config_from_mongo
import io
from sklearn.preprocessing import StandardScaler
from sklearn.preprocessing import MinMaxScaler
from pykalman import KalmanFilter
from statsmodels.tsa.seasonal import STL

router = APIRouter()

import pandas as pd



CREATE_OPTIONS = {
    "add",
    "subtract",
    "multiply",
    "divide",
    "residual",
    "dummy",
    "seasonality",
    "trend",
    "rpi",
    "datetime"
}




@router.get("/options")
async def get_create_options():
    return {"status": "SUCCESS", "available_create_operations": CREATE_OPTIONS}

# IDENTIFIER OPTIONS ENDPOINT
# ============================================================================

from app.features.column_classifier.database import get_classifier_config_from_mongo  # import here to avoid circular deps

@router.get("/identifier_options")
async def identifier_options(
    client_name: str = Query(..., description="Client name"),
    app_name: str = Query(..., description="App name"),
    project_name: str = Query(..., description="Project name"),
):
    """Return identifier column names using Redis ▶ Mongo ▶ fallback logic.

    1. Attempt to read JSON config from Redis key
       `<client>/<app>/<project>/column_classifier_config`.
    2. If missing, fetch from Mongo (`column_classifier_config` collection).
       Cache the document back into Redis.
    3. If still unavailable, return empty list – the frontend will
       fall back to its existing column_summary extraction flow.
    """
    import json
    from typing import Any
    
    key = f"{client_name}/{app_name}/{project_name}/column_classifier_config"
    cfg: dict[str, Any] | None = None

    # --- Redis lookup -------------------------------------------------------
    try:
        cached = redis_client.get(key)
        if cached:
            cfg = json.loads(cached)
    except Exception as exc:
        print(f"⚠️ Redis read error for {key}: {exc}")

    # --- Mongo fallback ------------------------------------------------------
    if cfg is None:
        cfg = get_classifier_config_from_mongo(client_name, app_name, project_name)
        if cfg:
            try:
                redis_client.setex(key, 3600, json.dumps(cfg, default=str))
            except Exception as exc:
                print(f"⚠️ Redis write error for {key}: {exc}")

    identifiers: list[str] = []
    if cfg and isinstance(cfg.get("identifiers"), list):
        identifiers = cfg["identifiers"]

    return {"identifiers": identifiers}


@router.post("/settings")
async def set_create_options(
    options: str = Form(...),
    validator_atom_id: str = Form(...),
    file_key: str = Form(...),
    ):

    options = [opt.strip() for opt in options.split(",") if opt.strip()]

    await save_create_data_settings(
        collection_name="create_settings",
        data={
            "validator_atom_id": validator_atom_id,
            "file_key": file_key,
            "operations": options
            # "result": df_transformed.to_dict(orient="records")  # optional
        }
    )

    return {"status": "SUCCESS", "message": "Options updated", "current_options": options}



from pandas import DataFrame
from typing import List
# from fastapi import Request
from starlette.requests import Request

# latest_create_data: DataFrame | None = None

@router.post("/perform")
async def perform_create(
    request: Request,
    object_names: str = Form(...),
    bucket_name: str = Form(...),
    identifiers: str = Form(None),
):
    try:
        import logging
        logger = logging.getLogger("createcolumn.perform")
        
        logger.info(f"🔵 [CREATE-PERFORM] Starting perform operation")
        logger.info(f"📂 [CREATE-PERFORM] Input file: {object_names}")
        
        # 🔧 CRITICAL FIX: Resolve the full MinIO object path
        prefix = await get_object_prefix()
        full_object_path = f"{prefix}{object_names}" if not object_names.startswith(prefix) else object_names
        
        logger.info(f"🔧 [CREATE-PERFORM] File path resolution: original={object_names}, prefix={prefix}, full_path={full_object_path}")
        
        # Load DataFrame from MinIO
        df = get_minio_df(bucket_name, full_object_path)
        
        logger.info(f"📊 [CREATE-PERFORM] INITIAL LOAD - DataFrame info:")
        logger.info(f"   - Shape: {df.shape}")
        logger.info(f"   - Columns: {list(df.columns)}")
        logger.info(f"   - Dtypes BEFORE any processing: {df.dtypes.to_dict()}")
        
        # Identify date columns before any processing
        date_columns = []
        for col in df.columns:
            if pd.api.types.is_datetime64_any_dtype(df[col]):
                date_columns.append(col)
                logger.info(f"   ✅ Found date column: '{col}' with dtype: {df[col].dtype}")
        
        logger.info(f"📅 [CREATE-PERFORM] Date columns detected: {date_columns}")
        
        # Lowercase column names
        df.columns = df.columns.str.strip().str.lower()
        
        logger.info(f"📊 [CREATE-PERFORM] AFTER lowercasing columns - Dtypes: {df.dtypes.to_dict()}")
        
        # ⚠️ CRITICAL: Only clean TEXT columns, preserve dates!
        # Only clean string columns, not all columns
        object_columns_before = df.select_dtypes(include='object').columns.tolist()
        logger.info(f"🔍 [CREATE-PERFORM] Object columns to clean: {object_columns_before}")
        
        for col in df.select_dtypes(include='object').columns:
            # Check if this is actually a date column that got converted to object
            if col in [c.lower() for c in date_columns]:
                logger.warning(f"⚠️ [CREATE-PERFORM] Skipping '{col}' - it's a date column!")
                continue
            
            logger.info(f"🧹 [CREATE-PERFORM] Cleaning text column: '{col}'")
            df[col] = df[col].astype(str).str.strip().str.lower()
        
        logger.info(f"📊 [CREATE-PERFORM] AFTER cleaning text - Dtypes: {df.dtypes.to_dict()}")
        form_data = await request.form()

        # Parse identifiers from form data
        identifiers_list = []
        if 'identifiers' in form_data and form_data['identifiers']:
            identifiers_list = [i.strip() for i in form_data['identifiers'].split(',') if i.strip()]

        # Helper to apply a function to each group defined by identifiers_list
        def group_apply(df, func):
            if identifiers_list:
                results = []
                for key, group in df.groupby(identifiers_list):
                    results.append(func(group))
                return pd.concat(results, axis=0).sort_index()
            else:
                return func(df)

        # Collect all operation keys with pattern op_{idx}
        import re
        op_pattern = re.compile(r'^(\w+)_([0-9]+)$')
        op_items = []
        for key, value in form_data.multi_items():
            m = op_pattern.match(key)
            if m:
                op_type = m.group(1)
                op_idx = m.group(2)
                columns = value.split(",")
                rename_key = f"{op_type}_{op_idx}_rename"
                rename_val = form_data.get(rename_key, None)
                op_items.append((op_type, columns, rename_val, op_idx))
        # Fallback for legacy single operations (no _idx)
        for key, value in form_data.multi_items():
            if key in ["options", "object_names", "bucket_name"]:
                continue
            if op_pattern.match(key):
                continue
            columns = value.split(",")
            rename_key = f"{key}_rename"
            rename_val = form_data.get(rename_key, None)
            op_items.append((key, columns, rename_val, None))
        new_cols_total = []
        for op, columns, rename_val, op_idx in op_items:
            if op == "add":
                new_col = rename_val if rename_val else "_plus_".join(columns)
                df[new_col] = df[columns].sum(axis=1)
                new_cols_total.append(new_col)
            elif op == "subtract":
                new_col = rename_val if rename_val else "_minus_".join(columns)
                result = df[columns[0]]
                for col in columns[1:]:
                    result -= df[col]
                df[new_col] = result
                new_cols_total.append(new_col)
            elif op == "multiply":
                new_col = rename_val if rename_val else "_times_".join(columns)
                result = df[columns[0]]
                for col in columns[1:]:
                    result *= df[col]
                df[new_col] = result
                new_cols_total.append(new_col)
            elif op == "divide":
                new_col = rename_val if rename_val else "_dividedby_".join(columns)
                result = df[columns[0]]
                for col in columns[1:]:
                    result /= df[col]
                df[new_col] = result
                new_cols_total.append(new_col)
            elif op == "residual":
                y_var = columns[0]
                x_vars = columns[1:]
                def residual_func(subdf):
                    new_col = rename_val if rename_val else f"Res_{y_var}"
                    if subdf.shape[0] < 2:
                        subdf[new_col] = np.nan
                        return subdf
                    # If any x_var is constant, skip regression for this group
                    if subdf[x_vars].std().min() == 0:
                        subdf[new_col] = np.nan
                        return subdf
                    residuals, rsq = calculate_residuals(subdf, y_var, x_vars)
                    subdf[new_col] = residuals
                    return subdf
                df = group_apply(df, residual_func)
                new_col = rename_val if rename_val else f"Res_{y_var}"
                new_cols_total.append(new_col)
            elif op == "stl_outlier":
                # STL outlier detection - applied per identifier group
                d_date = next((c for c in df.columns if c.strip().lower() == 'date'), None)
                if not d_date or d_date not in df.columns:
                    raise ValueError("Date column not found in data for STL outlier detection.")
                
                def stl_outlier_func(subdf):
                    subdf = subdf.copy()
                    subdf[d_date] = pd.to_datetime(subdf[d_date], errors='coerce')
                    subdf = subdf.sort_values(by=d_date)
                    
                    new_col = rename_val if rename_val else 'is_outlier'
                    subdf[new_col] = 0  # Default to 0 (not an outlier)
                    
                    if len(subdf) < 14:  # Need minimum data points for STL
                        return subdf
                    
                    # Check if Volume column exists
                    volume_col = next((c for c in subdf.columns if c.strip().lower() == 'volume'), None)
                    if not volume_col:
                        return subdf
                    
                    try:
                        res = STL(subdf[volume_col], seasonal=13, period=13).fit()
                        residual = res.resid
                        z_score_residual = (residual - residual.mean()) / residual.std()
                        subdf[new_col] = (z_score_residual.abs() > 3).astype(int)
                    except Exception as e:
                        print(f"STL outlier failed for group: {e}")
                    
                    return subdf
                
                df = group_apply(df, stl_outlier_func)
                new_col = rename_val if rename_val else 'is_outlier'
                new_cols_total.append(new_col)
            elif op == "dummy":
                for col in columns:
                    if col not in df.columns:
                        raise ValueError(
                            f"Column '{col}' not found in data for dummy operation. Please check your file and column selection. Available columns: {list(df.columns)}"
                        )
                    new_col = rename_val if rename_val else f"{col}_dummy"
                    df[new_col] = pd.Categorical(df[col]).codes
                    new_cols_total.append(new_col)
            elif op == "datetime":
                # Extract datetime components from a date column
                # Expects: columns[0] = date column, and a param specifying which component to extract
                # param options: "to_year", "to_month", "to_week", "to_day", "to_day_name", "to_month_name"
                date_col = columns[0]
                if date_col not in df.columns:
                    raise ValueError(
                        f"Column '{date_col}' not found in data for datetime operation. Available columns: {list(df.columns)}"
                    )
                
                # Get the datetime extraction type from param
                param = form_data.get(f"{op}_{op_idx}_param", None)
                if param is None:
                    raise HTTPException(status_code=400, detail="Missing `param` for datetime operation. Expected: to_year, to_month, to_week, or to_day")
                
                # Convert column to datetime temporarily for extraction (don't modify original)
                date_series = pd.to_datetime(df[date_col], errors='coerce')
                
                # Extract the requested component
                if param == "to_year":
                    new_col = rename_val if rename_val else f"{date_col}_year"
                    df[new_col] = date_series.dt.year
                    new_cols_total.append(new_col)
                elif param == "to_month":
                    new_col = rename_val if rename_val else f"{date_col}_month"
                    df[new_col] = date_series.dt.month
                    new_cols_total.append(new_col)
                elif param == "to_week":
                    new_col = rename_val if rename_val else f"{date_col}_week"
                    df[new_col] = date_series.dt.isocalendar().week
                    new_cols_total.append(new_col)
                elif param == "to_day":
                    new_col = rename_val if rename_val else f"{date_col}_day"
                    df[new_col] = date_series.dt.day
                    new_cols_total.append(new_col)
                elif param == "to_day_name":
                    new_col = rename_val if rename_val else f"{date_col}_day_name"
                    df[new_col] = date_series.dt.day_name()
                    new_cols_total.append(new_col)
                elif param == "to_month_name":
                    new_col = rename_val if rename_val else f"{date_col}_month_name"
                    df[new_col] = date_series.dt.month_name()
                    new_cols_total.append(new_col)
                else:
                    raise HTTPException(
                        status_code=400, 
                        detail=f"Invalid datetime param: {param}. Expected: to_year, to_month, to_week, to_day, to_day_name, or to_month_name"
                    )
            elif op == "rpi":
                try:
                    df, rpi_cols = compute_rpi(df, columns)
                    new_cols_total.extend(rpi_cols)
                except Exception as e:
                    raise ValueError(f"RPI operation failed: {str(e)}")

            # --- Power ---
            elif op == 'power':
                param = form_data.get(f"{op}_{op_idx}_param", None)
                if param is None:
                    raise HTTPException(status_code=400, detail="Missing `param` for power operation")
                try:
                    exponent = float(param)
                except ValueError:
                    raise HTTPException(status_code=400, detail=f"Invalid exponent: {param}")
                for col in columns:
                    new_col = rename_val if rename_val else f"{col}_power{param}"
                    df[new_col] = df[col] ** exponent
                    new_cols_total.append(new_col)

            # --- Log ---
            elif op == 'log':
                for col in columns:
                    new_col = rename_val if rename_val else f"{col}_log"
                    df[new_col] = np.log(df[col])
                    new_cols_total.append(new_col)

            # --- Sqrt ---
            elif op == 'sqrt':
                for col in columns:
                    new_col = rename_val if rename_val else f"{col}_sqrt"
                    df[new_col] = np.sqrt(df[col])
                    new_cols_total.append(new_col)

            # --- Exp ---
            elif op == 'exp':
                def exp_func(subdf):
                    for col in columns:
                        new_col = rename_val if rename_val else f"{col}_exp"
                        subdf[new_col] = np.exp(subdf[col])
                    return subdf
                df = group_apply(df, exp_func)
                if rename_val:
                    new_cols_total.append(rename_val)
                else:
                    for col in columns:
                        new_col = f"{col}_exp"
                        new_cols_total.append(new_col)

            # --- Logistic ---
            elif op == 'logistic':
                import json
                param = form_data.get(f"{op}_{op_idx}_param", None)
                def adstock_function(series, carryover):
                    result, prev = [], 0
                    for val in series:
                        curr = val + carryover * prev
                        result.append(curr)
                        prev = curr
                    return np.array(result)
                def logistic_function(x, gr, mp):
                    return 1 / (1 + np.exp(-gr * (x - mp)))
                logistic_params = json.loads(param)
                gr = float(logistic_params.get("gr"))
                co = float(logistic_params.get("co"))
                mp = float(logistic_params.get("mp"))
                if gr is None or co is None or mp is None:
                    raise ValueError("Missing logistic parameters")
                def logistic_func(subdf):
                    for col in columns:
                        adstocked = adstock_function(subdf[col].fillna(0), co)
                        standardized = (adstocked - np.mean(adstocked)) / np.std(adstocked)
                        new_col = rename_val if rename_val else f"{col}_logistic"
                        subdf[new_col] = logistic_function(standardized, gr, mp)
                    return subdf
                df = group_apply(df, logistic_func)
                if rename_val:
                    new_cols_total.append(rename_val)
                else:
                    for col in columns:
                        new_col = f"{col}_logistic"
                        new_cols_total.append(new_col)


            elif op in ["detrend", "deseasonalize", "detrend_deseasonalize"]:
                # Helper to detect frequency
                def detect_frequency(date_series):
                    date_series = date_series.sort_values().drop_duplicates()
                    diffs = date_series.diff().dropna()
                    if diffs.empty:
                        return "Unknown"
                    mode_diff = diffs.mode()[0]
                    mode_days = mode_diff.total_seconds() / (24 * 3600)
                    if 0.9 <= mode_days <= 1.1:
                        return "Daily"
                    elif 6 <= mode_days <= 8:
                        return "Weekly"
                    elif 25 <= mode_days <= 35:
                        return "Monthly"
                    elif 85 <= mode_days <= 95:
                        return "Quarterly"
                    elif 350 <= mode_days <= 380:
                        return "Yearly"
                    else:
                        return f"Custom ({mode_diff})"

                # 1. Find date column
                date_col = next((c for c in df.columns if c.strip().lower() == 'date'), None)
                if not date_col:
                    raise ValueError("No date column found. STL-based operations require a date column.")

                # 2. Convert and sort
                df[date_col] = pd.to_datetime(df[date_col], errors='coerce')
                df = df.sort_values(by=date_col)

                # 3. Check for user-supplied period
                period_param = form_data.get(f"{op}_{op_idx}_period", None)
                if period_param is not None:
                    try:
                        period = int(period_param)
                        if period < 2:
                            raise ValueError("Period must be at least 2.")
                    except Exception:
                        raise ValueError("Invalid period provided for STL decomposition.")
                else:
                    freq_label = detect_frequency(df[date_col])
                    if freq_label == "Unknown":
                        raise ValueError("Unable to detect frequency from the date column. Please ensure your data has a regular time interval, or specify the period manually.")
                    freq_period_map = {
                        'Daily': 7,         # 1 week
                        'Weekly': 52,       # 1 year
                        'Monthly': 12,      # 1 year
                        'Quarterly': 4,     # 1 year
                        'Yearly': 1
                    }
                    period = freq_period_map.get(freq_label, None)
                    if period is None:
                        raise ValueError(f"Unsupported or custom frequency '{freq_label}' for STL decomposition. Please use daily, weekly, monthly, quarterly, or yearly data, or specify the period manually.")

                def stl_func(subdf):
                    for col in columns:
                        stl = STL(subdf[col], period=period, robust=True)
                        res = stl.fit()
                        if op == "detrend":
                            new_col = rename_val if rename_val else f"{col}_detrended"
                            subdf[new_col] = res.resid + res.seasonal
                        elif op == "deseasonalize":
                            new_col = rename_val if rename_val else f"{col}_deseasonalized"
                            subdf[new_col] = res.resid + res.trend
                        elif op == "detrend_deseasonalize":
                            new_col = rename_val if rename_val else f"{col}_detrend_deseasonalized"
                            subdf[new_col] = res.resid
                    return subdf


                # def stl_func(subdf):
                #     for col in columns:
                #         stl = STL(subdf[col], period=period, robust=True)
                #         res = stl.fit()
                #         original_mean = subdf[col].mean()
                #         if op == "detrend":
                #             new_col = rename_val if rename_val else f"{col}_detrended"
                #             subdf[new_col] = res.resid + res.seasonal + (original_mean - (res.resid + res.seasonal).mean())
                #         elif op == "deseasonalize":
                #             new_col = rename_val if rename_val else f"{col}_deseasonalized"
                #             subdf[new_col] = res.resid + res.trend + (original_mean - (res.resid + res.trend).mean())
                #         elif op == "detrend_deseasonalize":
                #             new_col = rename_val if rename_val else f"{col}_detrend_deseasonalized"
                #             subdf[new_col] = res.resid + (original_mean - res.resid.mean())
                #     return subdf
                df = group_apply(df, stl_func)
                for col in columns:
                    if op == "detrend":
                        new_col = rename_val if rename_val else f"{col}_detrended"
                    elif op == "deseasonalize":
                        new_col = rename_val if rename_val else f"{col}_deseasonalized"
                    elif op == "detrend_deseasonalize":
                        new_col = rename_val if rename_val else f"{col}_detrend_deseasonalized"
                    new_cols_total.append(new_col)

            # --- Standardization ---
            elif op.startswith('standardize'):
                method = op.split("_")[1]  # zscore / minmax / none
                def standardize_func(subdf):
                    subdf = subdf.copy()
                    if rename_val:
                        col = columns[0]
                        new_col = rename_val
                        # Create a new scaler for this column
                        if method == 'zscore':
                            scaler = StandardScaler()
                        elif method == 'minmax':
                            scaler = MinMaxScaler()
                        else:
                            raise ValueError("Unknown standardization method")
                        
                        # Apply standardization
                        try:
                            transformed = scaler.fit_transform(subdf[[col]])
                            subdf[new_col] = transformed.flatten()
                        except Exception as e:
                            print(f"Standardization warning: {e}. Setting default values.")
                            subdf[new_col] = 0 if method == 'zscore' else 0.5
                    else:
                        for col in columns:
                            new_col = f"{col}_{method}_scaled"
                            # Create a NEW scaler for EACH column
                            if method == 'zscore':
                                scaler = StandardScaler()
                            elif method == 'minmax':
                                scaler = MinMaxScaler()
                            else:
                                raise ValueError("Unknown standardization method")
                            
                            # Apply standardization
                            try:
                                transformed = scaler.fit_transform(subdf[[col]])
                                subdf[new_col] = transformed.flatten()
                            except Exception as e:
                                print(f"Standardization warning for {col}: {e}. Setting default values.")
                                subdf[new_col] = 0 if method == 'zscore' else 0.5
                    return subdf
                df = group_apply(df, standardize_func)
                # Always add all new columns to new_cols_total
                if rename_val:
                    new_cols_total.append(rename_val)
                else:
                    for col in columns:
                        new_col = f"{col}_{method}_scaled"
                        new_cols_total.append(new_col)


        if not new_cols_total:
            raise ValueError(
                "No new columns were created. This may be due to missing required columns (e.g., 'PPU' for RPI, or selected columns not present in your file for dummy). Please check your column selection and input data.")

        logger.info(f"📊 [CREATE-PERFORM] FINAL DataFrame info AFTER all operations:")
        logger.info(f"   - Shape: {df.shape}")
        logger.info(f"   - All Columns: {list(df.columns)}")
        logger.info(f"   - New Columns created: {new_cols_total}")
        logger.info(f"   - Dtypes BEFORE CSV conversion: {df.dtypes.to_dict()}")
        
        # Check for date columns in final DataFrame
        final_date_columns = []
        for col in df.columns:
            if pd.api.types.is_datetime64_any_dtype(df[col]):
                final_date_columns.append(col)
                logger.info(f"   ✅ Date column preserved: '{col}' with dtype: {df[col].dtype}")
        
        if len(final_date_columns) != len(date_columns):
            logger.warning(f"⚠️ [CREATE-PERFORM] Date column count changed!")
            logger.warning(f"   Initial date columns: {date_columns}")
            logger.warning(f"   Final date columns: {final_date_columns}")
            logger.warning(f"   LOST: {set(date_columns) - set(final_date_columns)}")

        # Save result file using object_names only
        create_key = f"{object_names}_create.csv"
        
        logger.info(f"💾 [CREATE-PERFORM] Saving results to MinIO: {create_key}")
        
        # Clean DataFrame before saving to CSV to handle NaN, infinity values
        clean_df_for_csv = df.replace({np.nan: None, np.inf: None, -np.inf: None})
        csv_bytes = clean_df_for_csv.to_csv(index=False).encode("utf-8")
        
        logger.info(f"📄 [CREATE-PERFORM] CSV preview (first 500 chars): {csv_bytes[:500]}")
        
        minio_client.put_object(
            bucket_name=bucket_name,
            object_name=create_key,
            data=io.BytesIO(csv_bytes),
            length=len(csv_bytes),
            content_type="text/csv",
        )
        
        logger.info(f"✅ [CREATE-PERFORM] Saved to MinIO successfully")
        
        # 🔧 CRITICAL FIX: Return actual data like GroupBy does
        # Convert DataFrame to list of dictionaries for JSON serialization
        # Clean DataFrame to handle NaN, infinity, and other non-JSON-serializable values
        clean_df = df.replace({np.nan: None, np.inf: None, -np.inf: None})
        results_data = clean_df.to_dict('records')
        
        logger.info(f"🎉 [CREATE-PERFORM] Operation completed successfully")
        logger.info(f"   - Total rows: {len(df)}")
        logger.info(f"   - Total columns: {len(df.columns)}")
        logger.info(f"   - New columns: {len(new_cols_total)}")
        
        return {
            "status": "SUCCESS", 
            "new_columns": new_cols_total,
            "result_file": create_key,
            "row_count": len(df),
            "columns": list(df.columns),
            "results": results_data,  # ← KEY: Actual data included like GroupBy!
            "createResults": {
                "result_file": create_key,
                "result_shape": [len(df), len(df.columns)],
                "new_columns": new_cols_total
            }
        }
    except Exception as e:
        logger.error(f"❌ [CREATE-PERFORM] Operation failed: {e}")
        logger.error(f"❌ [CREATE-PERFORM] Exception type: {type(e)}")
        import traceback
        logger.error(f"❌ [CREATE-PERFORM] Traceback: {traceback.format_exc()}")
        return {"status": "FAILURE", "error": str(e)}

from fastapi import Query
import numpy as np
@router.get("/results")
async def get_create_data(
    object_names: str = Query(...),
    bucket_name: str = Query(...)
):
    try:
        # 🔧 CRITICAL FIX: Resolve the full MinIO object path
        prefix = await get_object_prefix()
        full_object_path = f"{prefix}{object_names}" if not object_names.startswith(prefix) else object_names
        create_key = f"{full_object_path}_create.csv"
        
        print(f"🔧 File path resolution for results: original={object_names}, prefix={prefix}, full_path={full_object_path}, create_key={create_key}")
        
        create_obj = minio_client.get_object(bucket_name, create_key)
        create_df = pd.read_csv(io.BytesIO(create_obj.read()))
        clean_df = create_df.replace({np.nan: None, np.inf: None, -np.inf: None})
        return {
            "row_count": len(create_df),
            "create_data": clean_df.to_dict(orient="records")
        }
    except Exception as e:
        raise HTTPException(status_code=404, detail=f"Unable to fetch create data: {str(e)}")



@router.post("/save")
async def save_createcolumn_dataframe(
    csv_data: str = Body(..., embed=True),
    filename: str = Body(..., embed=True),
    client_name: str = Body(None),
    app_name: str = Body(None),
    project_name: str = Body(None),
    user_id: str = Body(None),
    project_id: int = Body(None),
    operation_details: str = Body(None)
):
    """
    Save a created column dataframe (CSV) to MinIO as Arrow file and save metadata to MongoDB.
    """
    import pandas as pd
    import pyarrow as pa
    import pyarrow.ipc as ipc
    import io
    import uuid

    # Debug: Log all received parameters
    print(f"🔍 DEBUG: /save endpoint called")
    print(f"🔍 DEBUG: client_name = '{client_name}'")
    print(f"🔍 DEBUG: app_name = '{app_name}'")
    print(f"🔍 DEBUG: project_name = '{project_name}'")
    print(f"🔍 DEBUG: user_id = '{user_id}'")
    print(f"🔍 DEBUG: project_id = {project_id}")
    print(f"🔍 DEBUG: operation_details = '{operation_details[:200]}...' (truncated)")
    print(f"🔍 DEBUG: filename = '{filename}'")

    try:
        # 🔧 DTYPE FIX: Use robust CSV parsing with better dtype inference
        # This prevents dtype errors on sparse columns, mixed types, and date columns
        import logging
        logger = logging.getLogger("createcolumn.save")
        
        try:
            # 🔧 FIX: Use intelligent content-based date detection (NO hardcoded column names!)
            # First, scan a sample to detect date columns by analyzing the CONTENT
            # Use same sampling size as DataFrame Operations (10,000 rows) for consistency
            df_preview = pd.read_csv(
                io.StringIO(csv_data),
                nrows=10000  # Sample 10,000 rows to detect patterns (same as DataFrame Operations)
            )
            
            date_columns = []
            for col in df_preview.columns:
                # Skip if column is already numeric
                if pd.api.types.is_numeric_dtype(df_preview[col]):
                    continue
                
                # Get non-null values
                non_null_values = df_preview[col].dropna()
                if len(non_null_values) == 0:
                    continue
                
                # Analyze content: try to parse as dates
                try:
                    # Attempt to parse sample values as dates (use up to 100 samples for robustness)
                    sample_size = min(100, len(non_null_values))
                    parsed = pd.to_datetime(non_null_values.head(sample_size), errors='coerce')
                    # If at least 80% of samples parse successfully, it's a date column
                    success_rate = parsed.notna().sum() / len(parsed)
                    if success_rate >= 0.8:
                        date_columns.append(col)
                except:
                    pass  # Not a date column
            
            # ✅ Improved CSV parsing with content-based date detection
            df = pd.read_csv(
                io.StringIO(csv_data),
                low_memory=False,           # Scan ALL rows for better dtype inference
                parse_dates=date_columns if date_columns else False,  # Parse detected date columns
                infer_datetime_format=True, # Faster date parsing
                na_values=['', 'None', 'null', 'NULL', 'nan', 'NaN', 'NA', 'N/A'],
            )
            
            # Verify date columns were parsed correctly
            for col in date_columns:
                if col in df.columns and not pd.api.types.is_datetime64_any_dtype(df[col]):
                    # Try manual conversion as fallback
                    try:
                        df[col] = pd.to_datetime(df[col], errors='coerce')
                    except:
                        pass  # Keep original dtype if conversion fails
            
        except Exception as parse_exc:
            logger.error(f"❌ [CREATE-SAVE] CSV parsing failed: {parse_exc}")
            logger.error(f"❌ [CREATE-SAVE] CSV preview: {csv_data[:500]}")
            raise HTTPException(status_code=400, detail=f"Invalid csv_data: {parse_exc}")
        
        # Generate unique file key if not provided
        if not filename:
            file_id = str(uuid.uuid4())[:8]
            filename = f"{file_id}_createcolumn.arrow"
        if not filename.endswith('.arrow'):
            filename += '.arrow'
        # Get consistent object prefix and construct full path
        prefix = await get_object_prefix()
        filename = f"{prefix}create-data/{filename}"
        logger.info(f"💾 [CREATE-SAVE] Target filename: {filename}")
        logger.info(f"📁 [CREATE-SAVE] MinIO bucket: {MINIO_BUCKET}")
        
        # Save to MinIO with dtype validation
        logger.info(f"🔍 [CREATE-SAVE] Pre-save DataFrame inspection:")
        logger.info(f"   - Shape: {df.shape}")
        logger.info(f"   - Columns: {list(df.columns)}")
        logger.info(f"   - Dtypes: {df.dtypes.to_dict()}")
        
        try:
            logger.info(f"🔄 [CREATE-SAVE] Converting to Arrow format...")
            table = pa.Table.from_pandas(df)
            arrow_buffer = pa.BufferOutputStream()
            with ipc.new_file(arrow_buffer, table.schema) as writer:
                writer.write_table(table)
            arrow_bytes = arrow_buffer.getvalue().to_pybytes()
            logger.info(f"✅ [CREATE-SAVE] Arrow conversion successful")
            logger.info(f"📦 [CREATE-SAVE] Arrow buffer size: {len(arrow_bytes)} bytes")
        except Exception as arrow_exc:
            logger.error(f"❌ [CREATE-SAVE] Arrow conversion failed: {arrow_exc}")
            logger.error(f"❌ [CREATE-SAVE] DataFrame info at failure:")
            logger.error(f"   - Columns: {list(df.columns)}")
            logger.error(f"   - Dtypes: {df.dtypes.to_dict()}")
            raise HTTPException(status_code=400, detail=f"Failed to convert DataFrame to Arrow format: {arrow_exc}")
        
        logger.info(f"⬆️ [CREATE-SAVE] Uploading to MinIO...")
        minio_client.put_object(
            MINIO_BUCKET,
            filename,
            data=io.BytesIO(arrow_bytes),
            length=len(arrow_bytes),
            content_type="application/octet-stream",
        )
        logger.info(f"✅ [CREATE-SAVE] Upload successful")
        
        # Cache in Redis for 1 hour
        redis_client.setex(filename, 3600, arrow_bytes)
        logger.info(f"✅ [CREATE-SAVE] Cached in Redis")
        
        # Save operation details to MongoDB if provided
        mongo_save_result = None
        if client_name and app_name and project_name and operation_details:
            try:
                # Parse operation details
                operation_data = json.loads(operation_details) if isinstance(operation_details, str) else operation_details
                
                # Get the input file from operation details
                input_file = operation_data.get("input_file", "unknown_input_file")
                operation_data["saved_file"] = filename
                operation_data["file_shape"] = df.shape
                operation_data["file_columns"] = list(df.columns)
                operation_data["saved_at"] = datetime.utcnow()
                
                # Save to MongoDB
                mongo_save_result = await save_createandtransform_configs(
                    client_name=client_name,
                    app_name=app_name,
                    project_name=project_name,
                    operation_data=operation_data,
                    user_id=user_id or "",
                    project_id=project_id
                )
                
                print(f"✅ MongoDB save result: {mongo_save_result}")
                
            except Exception as mongo_error:
                logger.warning(f"⚠️ [CREATE-SAVE] MongoDB save error: {mongo_error}")
                # Don't fail the entire operation if MongoDB save fails
                mongo_save_result = {"status": "error", "error": str(mongo_error)}
        
        logger.info(f"🎉 [CREATE-SAVE] Save operation completed successfully")
        
        return {
            "result_file": filename,
            "shape": df.shape,
            "columns": list(df.columns),
            "message": "DataFrame saved successfully",
            "mongo_save_result": mongo_save_result
        }
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"❌ [CREATE-SAVE] Save operation failed: {e}")
        logger.error(f"❌ [CREATE-SAVE] Exception type: {type(e)}")
        import traceback
        logger.error(f"❌ [CREATE-SAVE] Traceback: {traceback.format_exc()}")
        raise HTTPException(status_code=400, detail=str(e))



@router.get("/cached_dataframe")
async def cached_dataframe(
    object_name: str,
    page: int = Query(1, ge=1, description="Page number (1-based)"),
    page_size: int = Query(50, ge=1, le=1000, description="Number of rows per page")
):
    """Return the saved dataframe as CSV text from Redis or MinIO with pagination."""
    from urllib.parse import unquote
    object_name = unquote(object_name)
    print(f"➡️ createcolumn cached_dataframe request: {object_name}, page={page}, page_size={page_size}")
    # Prefix validation removed as we now use consistent paths from get_object_prefix
    try:
        content = redis_client.get(object_name)
        if content is None:
            response = minio_client.get_object(MINIO_BUCKET, object_name)
            content = response.read()
            redis_client.setex(object_name, 3600, content)

        if object_name.endswith(".arrow"):
            reader = ipc.RecordBatchFileReader(pa.BufferReader(content))
            df = reader.read_all().to_pandas()
            total_rows = len(df)
            start_idx = (page - 1) * page_size
            end_idx = start_idx + page_size
            df_subset = df.iloc[start_idx:end_idx]
            csv_text = df_subset.to_csv(index=False)
            return {
                "data": csv_text,
                "pagination": {
                    "current_page": page,
                    "page_size": page_size,
                    "total_rows": total_rows,
                    "total_pages": (total_rows + page_size - 1) // page_size,
                    "start_row": start_idx + 1,
                    "end_row": min(end_idx, total_rows)
                }
            }
        try:
            text = content.decode()
        except Exception:
            text = content
        import pandas as pd
        import io
        df = pd.read_csv(io.StringIO(text))
        total_rows = len(df)
        start_idx = (page - 1) * page_size
        end_idx = start_idx + page_size
        df_subset = df.iloc[start_idx:end_idx]
        csv_text = df_subset.to_csv(index=False)
        return {
            "data": csv_text,
            "pagination": {
                "current_page": page,
                "page_size": page_size,
                "total_rows": total_rows,
                "total_pages": (total_rows + page_size - 1) // page_size,
                "start_row": start_idx + 1,
                "end_row": min(end_idx, total_rows)
            }
        }
    except Exception as e:
        print(f"⚠️ createcolumn cached_dataframe error for {object_name}: {e}")
        raise HTTPException(status_code=400, detail=str(e))

@router.get("/export_csv")
async def export_csv(object_name: str):
    """Export the saved dataframe as CSV file."""
    from urllib.parse import unquote
    object_name = unquote(object_name)
    print(f"➡️ createcolumn export_csv request: {object_name}")
    
    try:
        content = redis_client.get(object_name)
        if content is None:
            response = minio_client.get_object(MINIO_BUCKET, object_name)
            content = response.read()
            redis_client.setex(object_name, 3600, content)

        if object_name.endswith(".arrow"):
            reader = ipc.RecordBatchFileReader(pa.BufferReader(content))
            df = reader.read_all().to_pandas()
        else:
            import pandas as pd
            import io
            df = pd.read_csv(io.BytesIO(content))
        
        # Convert to CSV bytes
        csv_bytes = df.to_csv(index=False).encode("utf-8")
        
        return Response(
            content=csv_bytes,
            media_type="text/csv",
            headers={
                "Content-Disposition": f"attachment; filename=createcolumn_result_{object_name.split('/')[-1].replace('.arrow', '')}.csv"
            }
        )
    except Exception as e:
        print(f"⚠️ createcolumn export_csv error for {object_name}: {e}")
        raise HTTPException(status_code=400, detail=str(e))

@router.get("/export_excel")
async def export_excel(object_name: str):
    """Export the saved dataframe as Excel file."""
    from urllib.parse import unquote
    object_name = unquote(object_name)
    print(f"➡️ createcolumn export_excel request: {object_name}")
    
    try:
        content = redis_client.get(object_name)
        if content is None:
            response = minio_client.get_object(MINIO_BUCKET, object_name)
            content = response.read()
            redis_client.setex(object_name, 3600, content)

        if object_name.endswith(".arrow"):
            reader = ipc.RecordBatchFileReader(pa.BufferReader(content))
            df = reader.read_all().to_pandas()
        else:
            import pandas as pd
            import io
            df = pd.read_csv(io.BytesIO(content))
        
        # Convert to Excel bytes
        import io
        excel_buffer = io.BytesIO()
        df.to_excel(excel_buffer, index=False, engine='openpyxl')
        excel_bytes = excel_buffer.getvalue()
        
        return Response(
            content=excel_bytes,
            media_type="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
            headers={
                "Content-Disposition": f"attachment; filename=createcolumn_result_{object_name.split('/')[-1].replace('.arrow', '')}.xlsx"
            }
        )
    except Exception as e:
        print(f"⚠️ createcolumn export_excel error for {object_name}: {e}")
        raise HTTPException(status_code=400, detail=str(e))

@router.get("/classification")
async def get_column_classification(
    validator_atom_id: str = Query(...),
    file_key: str = Query(...)
):
    """
    Fetch column classification (identifiers, measures, unclassified) from Redis-first fallback then MongoDB for a given validator_atom_id and file_key.
    """
    print(f"🔍 Classification endpoint called with validator_atom_id={validator_atom_id}, file_key={file_key}")
    
    try:
        collection = await get_column_classifications_collection()
        print(f"✅ MongoDB collection obtained: {collection}")

        # 1️⃣  Try Redis via the shared helper; if not available it will fall back to MongoDB
        print(f"🔍 Calling fetch_measures_list with validator_atom_id={validator_atom_id}, file_key={file_key}")
        identifiers, measures = await fetch_measures_list(
            validator_atom_id=validator_atom_id,
            file_key=file_key,
            collection=collection,
        )
        print(f"✅ fetch_measures_list returned: identifiers={identifiers}, measures={measures}")

        # 2️⃣  Filter out common time-related identifiers
        time_keywords = {"date", "time", "month", "months", "week", "weeks", "year"}
        identifiers = [col for col in identifiers if col.lower() not in time_keywords]

        # 3️⃣  Attempt to retrieve *unclassified* list from MongoDB; if missing, default to []
        unclassified: list = []
        try:
            document = await collection.find_one({
                "validator_atom_id": validator_atom_id,
                "file_key": file_key,
            })
            if document and "final_classification" in document:
                unclassified = document["final_classification"].get("unclassified", [])
        except Exception:
            # Fallback silently – unclassified will remain [] if MongoDB is unreachable
            pass

        return {
            "identifiers": identifiers,
            "measures": measures,
            "unclassified": unclassified,
        }
    except Exception as e:
        print(f"❌ Error in classification endpoint: {e}")
        # 🔧 CRITICAL FIX: Return fallback data instead of crashing
        # This prevents the 404 error and allows the frontend to continue working
        return {
            "identifiers": [],
            "measures": [],
            "unclassified": [],
        }


# =============================================================================
# SAVE CONFIG ENDPOINTS
# =============================================================================

@router.post("/save-config")
async def save_createcolumn_configuration(
    client_name: str = Query(..., description="Client name"),
    app_name: str = Query(..., description="App name"),
    project_name: str = Query(..., description="Project name"),
    config_data: dict = Body(..., description="Createcolumn configuration data to save"),
    user_id: str = Query("", description="User ID"),
    project_id: int = Query(None, description="Project ID")
):
    """Save createcolumn configuration to MongoDB"""
    try:
        result = await save_createandtransform_configs(
            client_name=client_name,
            app_name=app_name,
            project_name=project_name,
            operation_data=config_data,
            user_id=user_id,
            project_id=project_id
        )
        
        if result["status"] == "success":
            return {
                "success": True,
                "message": f"Createcolumn configuration saved successfully",
                "mongo_id": result["mongo_id"],
                "operation": result["operation"],
                "collection": result["collection"]
            }
        else:
            raise HTTPException(status_code=500, detail=f"Failed to save createcolumn configuration: {result['error']}")
            
    except Exception as e:
        print(f"Error saving createcolumn configuration: {str(e)}")
        raise HTTPException(status_code=500, detail=f"Failed to save createcolumn configuration: {str(e)}")

@router.get("/get-config")
async def get_createcolumn_configuration(
    client_name: str = Query(..., description="Client name"),
    app_name: str = Query(..., description="App name"),
    project_name: str = Query(..., description="Project name")
):
    """Retrieve saved createcolumn configuration from MongoDB"""
    try:
        result = await get_createandtransform_config_from_mongo(client_name, app_name, project_name)
        
        if result:
            return {
                "success": True,
                "data": result
            }
        else:
            return {
                "success": False,
                "message": "No createcolumn configuration found",
                "data": None
            }
            
    except Exception as e:
        print(f"Error retrieving createcolumn configuration: {str(e)}")
        raise HTTPException(status_code=500, detail=f"Failed to retrieve createcolumn configuration: {str(e)}")

@router.post("/cardinality")
async def get_cardinality_data(
    validator_atom_id: str = Form(...),
    file_key: str = Form(...),
    bucket_name: str = Form(...),
    object_names: str = Form(...),
):
    """Return cardinality data for columns in the dataset."""
    try:
        # Get the current object prefix
        prefix = await get_object_prefix()
        
        # Construct the full object path
        full_object_path = f"{prefix}{object_names}" if not object_names.startswith(prefix) else object_names
        
        print(f"🔍 CreateColumn Cardinality file path resolution:")
        print(f"  Original object_names: {object_names}")
        print(f"  Current prefix: {prefix}")
        print(f"  Full object path: {full_object_path}")
        
        # Load the dataframe
        df = get_minio_df(bucket=bucket_name, file_key=full_object_path)
        df.columns = df.columns.str.strip().str.lower()
        
        print(f"✅ Successfully loaded dataframe for cardinality with shape: {df.shape}")
        
        # Generate cardinality data
        cardinality_data = []
        for col in df.columns:
            column_series = df[col].dropna()
            try:
                vals = column_series.unique()
            except TypeError:
                vals = column_series.astype(str).unique()

            def _serialize(v):
                if isinstance(v, (pd.Timestamp, datetime.datetime, datetime.date)):
                    return pd.to_datetime(v).isoformat()
                return str(v)

            safe_vals = [_serialize(v) for v in vals]
            
            cardinality_data.append({
                "column": col,
                "data_type": str(df[col].dtype),
                "unique_count": int(len(vals)),
                "unique_values": safe_vals,  # All unique values, not just samples
            })
        
        return {
            "status": "SUCCESS",
            "cardinality": cardinality_data
        }
        
    except Exception as e:
        print(f"❌ Error in CreateColumn cardinality endpoint: {e}")
        raise HTTPException(status_code=400, detail=f"Failed to get cardinality data: {str(e)}")