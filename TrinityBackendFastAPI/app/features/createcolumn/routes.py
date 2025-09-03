# app/routes.py

from fastapi import APIRouter, Form, HTTPException, Query, Body
from fastapi.responses import Response

import json
from datetime import datetime
# from .create.base import calculate_residuals, compute_rpi, apply_stl_outlier
from .create.base import calculate_residuals, compute_rpi, apply_stl_outlier

from .deps import get_minio_df,fetch_measures_list,fetch_identifiers_and_measures,get_column_classifications_collection,get_create_settings_collection,minio_client, MINIO_BUCKET, redis_client
from app.features.data_upload_validate.app.routes import get_object_prefix
from .mongodb_saver import save_create_data,save_create_data_settings,save_createandtransform_configs
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
    "rpi"
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
    2. If missing, fetch from Mongo (`column_classifier_configs` collection).
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
        # 🔧 CRITICAL FIX: Resolve the full MinIO object path
        prefix = await get_object_prefix()
        full_object_path = f"{prefix}{object_names}" if not object_names.startswith(prefix) else object_names
        
        print(f"🔧 File path resolution: original={object_names}, prefix={prefix}, full_path={full_object_path}")
        
        df = get_minio_df(bucket_name, full_object_path)
        df.columns = df.columns.str.strip().str.lower()
        # Only clean string columns, not all columns
        for col in df.select_dtypes(include='object').columns:
            df[col] = df[col].astype(str).str.strip().str.lower()
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
                op_items.append((op_type, columns, rename_val))
        # Fallback for legacy single operations (no _idx)
        for key, value in form_data.multi_items():
            if key in ["options", "object_names", "bucket_name"]:
                continue
            if op_pattern.match(key):
                continue
            columns = value.split(",")
            rename_key = f"{key}_rename"
            rename_val = form_data.get(rename_key, None)
            op_items.append((key, columns, rename_val))
        new_cols_total = []
        for op, columns, rename_val in op_items:
            op_idx = None
            # Try to extract op_idx from op_items if available
            # op_items is built from (op_type, columns, rename_val), but we need op_idx for param
            # So, let's reconstruct op_idx from the key pattern
            # We'll use the same regex as above
            import re
            op_pattern = re.compile(r'^(\w+)_([0-9]+)$')
            for key, value in form_data.multi_items():
                m = op_pattern.match(key)
                if m and m.group(1) == op:
                    op_idx = m.group(2)
                    break

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
                df, outlier_col = apply_stl_outlier(df, columns)
                if rename_val:
                    df = df.rename(columns={outlier_col: rename_val})
                    new_cols_total.append(rename_val)
                else:
                    new_cols_total.append(outlier_col)
            elif op == "dummy":
                for col in columns:
                    if col not in df.columns:
                        raise ValueError(
                            f"Column '{col}' not found in data for dummy operation. Please check your file and column selection. Available columns: {list(df.columns)}"
                        )
                    new_col = rename_val if rename_val else f"{col}_dummy"
                    df[new_col] = pd.Categorical(df[col]).codes
                    new_cols_total.append(new_col)
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
                    if method == 'zscore':
                        scaler = StandardScaler()
                    elif method == 'minmax':
                        scaler = MinMaxScaler()
                    else:
                        raise ValueError("Unknown standardization method")
                    if rename_val:
                        col = columns[0]
                        new_col = rename_val
                        subdf[new_col] = scaler.fit_transform(subdf[[col]]) if scaler else subdf[col]
                    else:
                        for col in columns:
                            new_col = f"{col}_{method}_scaled"
                            subdf[new_col] = scaler.fit_transform(subdf[[col]]) if scaler else subdf[col]
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


        # Save result file using object_names only
        create_key = f"{object_names}_create.csv"
        csv_bytes = df.to_csv(index=False).encode("utf-8")
        minio_client.put_object(
            bucket_name=bucket_name,
            object_name=create_key,
            data=io.BytesIO(csv_bytes),
            length=len(csv_bytes),
            content_type="text/csv",
        )
        # 🔧 CRITICAL FIX: Return actual data like GroupBy does
        # Convert DataFrame to list of dictionaries for JSON serialization
        results_data = df.to_dict('records')
        
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
    Save a created column dataframe (CSV) to MinIO as Arrow file and return file info.
    """
    import pandas as pd
    import pyarrow as pa
    import pyarrow.ipc as ipc
    import io
    import uuid

    try:
        # Parse CSV to DataFrame
        df = pd.read_csv(io.StringIO(csv_data))
        # Generate unique file key if not provided
        if not filename:
            file_id = str(uuid.uuid4())[:8]
            filename = f"{file_id}_createcolumn.arrow"
        if not filename.endswith('.arrow'):
            filename += '.arrow'
        # Get consistent object prefix and construct full path
        prefix = await get_object_prefix()
        filename = f"{prefix}create-data/{filename}"
        print(f"[DEBUG] Saving to MinIO: bucket={MINIO_BUCKET}, filename={filename}")
        # Save to MinIO
        table = pa.Table.from_pandas(df)
        arrow_buffer = pa.BufferOutputStream()
        with ipc.new_file(arrow_buffer, table.schema) as writer:
            writer.write_table(table)
        arrow_bytes = arrow_buffer.getvalue().to_pybytes()
        minio_client.put_object(
            MINIO_BUCKET,
            filename,
            data=io.BytesIO(arrow_bytes),
            length=len(arrow_bytes),
            content_type="application/octet-stream",
        )
        # Cache in Redis for 1 hour
        redis_client.setex(filename, 3600, arrow_bytes)
        
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
                print(f"⚠️ MongoDB save error: {mongo_error}")
                # Don't fail the entire operation if MongoDB save fails
                mongo_save_result = {"status": "error", "error": str(mongo_error)}
        
        return {
            "result_file": filename,
            "shape": df.shape,
            "columns": list(df.columns),
            "message": "DataFrame saved successfully",
            "mongo_save_result": mongo_save_result
        }
    except Exception as e:
        print(f"⚠️ save_createcolumn_dataframe error: {e}")
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