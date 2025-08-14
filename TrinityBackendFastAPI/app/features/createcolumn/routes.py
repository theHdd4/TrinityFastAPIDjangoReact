# app/routes.py

from fastapi import APIRouter, Form, HTTPException, Body
from fastapi.responses import Response
from datetime import datetime

import json
import numpy as np
# from .create.base import calculate_residuals, compute_rpi, apply_stl_outlier
from .create.base import calculate_residuals, compute_rpi, apply_stl_outlier

from .deps import get_minio_df,fetch_measures_list,fetch_measures_list_with_context,get_column_classifications_collection,get_create_settings_collection,minio_client, MINIO_BUCKET, redis_client
from app.features.data_upload_validate.app.routes import get_object_prefix
from app.core.utils import get_env_vars
from .mongodb_saver import save_create_data,save_create_data_settings,save_createandtransform_configs,get_createandtransform_config_from_mongo
import io
from sklearn.preprocessing import StandardScaler
from sklearn.preprocessing import MinMaxScaler
from pykalman import KalmanFilter
from statsmodels.tsa.seasonal import STL

router = APIRouter()

import pandas as pd
import datetime



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

@router.get("/")
async def root():
    """Root endpoint for createcolumn backend."""
    return {"message": "CreateColumn backend is running", "endpoints": ["/ping", "/options", "/init", "/perform", "/settings", "/export_csv", "/export_excel", "/classification", "/cached_dataframe", "/column_summary", "/save"]}

@router.get("/ping")
async def ping():
    """Health check endpoint for createcolumn backend."""
    return {"msg": "CreateColumn backend is alive"}

@router.get("/options")
async def get_create_options():
    return {"status": "SUCCESS", "available_create_operations": CREATE_OPTIONS}


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
        from app.features.data_upload_validate.app.routes import get_object_prefix
        
        # Get the current object prefix
        prefix = await get_object_prefix()
        
        # Construct the full object path
        full_object_path = f"{prefix}{object_names}" if not object_names.startswith(prefix) else object_names
        
        print(f"🔍 CreateColumn file path resolution:")
        print(f"  Original object_names: {object_names}")
        print(f"  Current prefix: {prefix}")
        print(f"  Full object path: {full_object_path}")
        
        # Use the full path to load the dataframe
        df = get_minio_df(bucket_name, full_object_path)
        df.columns = df.columns.str.strip().str.lower()
        # Only clean string columns, not all columns
        for col in df.select_dtypes(include='object').columns:
            df[col] = df[col].astype(str).str.strip().str.lower()
        form_data = await request.form()

        print(f"✅ Successfully loaded dataframe with shape: {df.shape}")
        print(f"  Columns: {list(df.columns)}")

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
            elif op == "sqrt":
                for col in columns:
                    if col not in df.columns:
                        raise ValueError(
                            f"Column '{col}' not found in data for sqrt operation. Please check your file and column selection. Available columns: {list(df.columns)}"
                        )
                    new_col = rename_val if rename_val else f"{col}_sqrt"
                    df[new_col] = np.sqrt(df[col])
                    new_cols_total.append(new_col)
            elif op == "log":
                for col in columns:
                    if col not in df.columns:
                        raise ValueError(
                            f"Column '{col}' not found in data for log operation. Please check your file and column selection. Available columns: {list(df.columns)}"
                        )
                    new_col = rename_val if rename_val else f"{col}_log"
                    df[new_col] = np.log(df[col])
                    new_cols_total.append(new_col)
            elif op == "abs":
                for col in columns:
                    if col not in df.columns:
                        raise ValueError(
                            f"Column '{col}' not found in data for abs operation. Please check your file and column selection. Available columns: {list(df.columns)}"
                        )
                    new_col = rename_val if rename_val else f"{col}_abs"
                    df[new_col] = np.abs(df[col])
                    new_cols_total.append(new_col)
            elif op == "power":
                for col in columns:
                    if col not in df.columns:
                        raise ValueError(
                            f"Column '{col}' not found in data for power operation. Please check your file and column selection. Available columns: {list(df.columns)}"
                        )
                    new_col = rename_val if rename_val else f"{col}_power"
                    # Extract power from rename_val if it's a number, otherwise use 2
                    try:
                        power = float(rename_val) if rename_val and rename_val.replace('.', '').replace('-', '').isdigit() else 2
                    except ValueError:
                        power = 2
                    df[new_col] = np.power(df[col], power)
                    new_cols_total.append(new_col)
            elif op == "standardize_zscore":
                for col in columns:
                    if col not in df.columns:
                        raise ValueError(
                            f"Column '{col}' not found in data for standardize_zscore operation. Please check your file and column selection. Available columns: {list(df.columns)}"
                        )
                    new_col = rename_val if rename_val else f"{col}_zscore"
                    df[new_col] = (df[col] - df[col].mean()) / df[col].std()
                    new_cols_total.append(new_col)
            elif op == "standardize_minmax":
                for col in columns:
                    if col not in df.columns:
                        raise ValueError(
                            f"Column '{col}' not found in data for standardize_minmax operation. Please check your file and column selection. Available columns: {list(df.columns)}"
                        )
                    new_col = rename_val if rename_val else f"{col}_minmax"
                    df[new_col] = (df[col] - df[col].min()) / (df[col].max() - df[col].min())
                    new_cols_total.append(new_col)
            elif op == "detrend":
                for col in columns:
                    if col not in df.columns:
                        raise ValueError(
                            f"Column '{col}' not found in data for detrend operation. Please check your file and column selection. Available columns: {list(df.columns)}"
                        )
                    new_col = rename_val if rename_val else f"{col}_detrend"
                    df[new_col] = df[col] - df[col].rolling(window=min(12, len(df)//4), center=True).mean()
                    new_cols_total.append(new_col)
            elif op == "deseasonalize":
                for col in columns:
                    if col not in df.columns:
                        raise ValueError(
                            f"Column '{col}' not found in data for deseasonalize operation. Please check your file and column selection. Available columns: {list(df.columns)}"
                        )
                    new_col = rename_val if rename_val else f"{col}_deseasonalize"
                    # Simple seasonal adjustment using rolling mean
                    seasonal_period = 12  # Assuming monthly data
                    df[new_col] = df[col] - df[col].rolling(window=seasonal_period, center=True).mean()
                    new_cols_total.append(new_col)
            elif op == "detrend_deseasonalize":
                for col in columns:
                    if col not in df.columns:
                        raise ValueError(
                            f"Column '{col}' not found in data for detrend_deseasonalize operation. Please check your file and column selection. Available columns: {list(df.columns)}"
                        )
                    new_col = rename_val if rename_val else f"{col}_detrend_deseasonalize"
                    # First detrend
                    detrended = df[col] - df[col].rolling(window=min(12, len(df)//4), center=True).mean()
                    # Then deseasonalize
                    seasonal_period = 12  # Assuming monthly data
                    df[new_col] = detrended - detrended.rolling(window=seasonal_period, center=True).mean()
                    new_cols_total.append(new_col)
            elif op == "exp":
                for col in columns:
                    if col not in df.columns:
                        raise ValueError(
                            f"Column '{col}' not found in data for exp operation. Please check your file and column selection. Available columns: {list(df.columns)}"
                        )
                    new_col = rename_val if rename_val else f"{col}_exp"
                    df[new_col] = np.exp(df[col])
                    new_cols_total.append(new_col)
            elif op == "logistic":
                for col in columns:
                    if col not in df.columns:
                        raise ValueError(
                            f"Column '{col}' not found in data for logistic operation. Please check your file and column selection. Available columns: {list(df.columns)}"
                        )
                    new_col = rename_val if rename_val else f"{col}_logistic"
                    df[new_col] = 1 / (1 + np.exp(-df[col]))
                    new_cols_total.append(new_col)
            elif op == "rpi":
                for col in columns:
                    if col not in df.columns:
                        raise ValueError(
                            f"Column '{col}' not found in data for rpi operation. Please check your file and column selection. Available columns: {list(df.columns)}"
                        )
                    new_col = rename_val if rename_val else f"{col}_rpi"
                    df[new_col] = compute_rpi(df, col)
                    new_cols_total.append(new_col)
            elif op == "seasonality":
                for col in columns:
                    if col not in df.columns:
                        raise ValueError(
                            f"Column '{col}' not found in data for seasonality operation. Please check your file and column selection. Available columns: {list(df.columns)}"
                        )
                    new_col = rename_val if rename_val else f"{col}_seasonality"
                    # Simple seasonal component using rolling mean
                    seasonal_period = 12  # Assuming monthly data
                    df[new_col] = df[col].rolling(window=seasonal_period, center=True).mean()
                    new_cols_total.append(new_col)
            elif op == "trend":
                for col in columns:
                    if col not in df.columns:
                        raise ValueError(
                            f"Column '{col}' not found in data for trend operation. Please check your file and column selection. Available columns: {list(df.columns)}"
                        )
                    new_col = rename_val if rename_val else f"{col}_trend"
                    # Simple trend using rolling mean
                    trend_window = min(12, len(df)//4)
                    df[new_col] = df[col].rolling(window=trend_window, center=True).mean()
                    new_cols_total.append(new_col)

        # Save the result to MinIO
        timestamp = datetime.datetime.now().strftime("%Y%m%d_%H%M%S")
        result_filename = f"create_{timestamp}_{len(new_cols_total)}_cols.csv"
        
        # Save to MinIO
        csv_bytes = df.to_csv(index=False).encode("utf-8")
        minio_client.put_object(
            bucket_name=bucket_name,
            object_name=result_filename,
            data=io.BytesIO(csv_bytes),
            length=len(csv_bytes),
            content_type="text/csv"
        )


        if not new_cols_total:
            raise ValueError(
                "No new columns were created. This may be due to missing required columns (e.g., 'PPU' for RPI, or selected columns not present in your file for dummy). Please check your column selection and input data.")

        # Convert DataFrame to CSV for preview
        csv_data = df.to_csv(index=False)
        
        # Prepare operation details for MongoDB saving
        operation_details = {
            "operations": [
                {
                    "operation_type": op,
                    "columns": columns,
                    "rename": rename_val
                }
                for op, columns, rename_val in op_items
            ],
            "new_columns": new_cols_total,
            "identifiers_used": identifiers_list
        }
        
        return {
            "status": "SUCCESS",
            "message": f"Created {len(new_cols_total)} new columns successfully",
            "new_columns": new_cols_total,
            "result_file": result_filename,
            "row_count": len(df),
            "columns": list(df.columns)
            "createResults": {
                "result_shape": [len(df), len(df.columns)],
                "new_columns": new_cols_total
            },
            "preview_data": {
                "data": csv_data,
                "row_count": len(df),
                "columns": list(df.columns)
            },
            "operation_details": operation_details
        }
    except Exception as e:
        print(f"❌ CreateColumn operation failed: {e}")
        import traceback
        traceback.print_exc()
        raise HTTPException(status_code=500, detail=str(e))

from fastapi import Query
import numpy as np
@router.get("/results")
async def get_create_data(
    object_names: str = Query(...),
    bucket_name: str = Query(...)
):
    try:
        create_key = f"{object_names}_create.csv"
        create_obj = minio_client.get_object(bucket_name, create_key)
        create_df = pd.read_csv(io.BytesIO(create_obj.read()))
        clean_df = create_df.replace({np.nan: None, np.inf: None, -np.inf: None})
        return {
            "row_count": len(create_df),
            "create_data": clean_df.to_dict(orient="records")
        }
    except Exception as e:
        raise HTTPException(status_code=404, detail=f"Unable to fetch create data: {str(e)}")



from fastapi import Body


@router.post("/save")
async def save_createcolumn_dataframe(
    csv_data: str = Body(..., embed=True),
    filename: str = Body(..., embed=True),
    validator_atom_id: str = Body("", embed=True),
    file_key: str = Body("", embed=True),
    operation_details: str = Body("{}", embed=True),
    user_id: str = Body("", embed=True),
    client_name: str = Body("", embed=True),
    app_name: str = Body("", embed=True),
    project_name: str = Body("", embed=True),
    project_id: int = Body(None, embed=True)
):
    """
    Save a created column dataframe (CSV) to MinIO as Arrow file and save operation details to MongoDB.
    """
    import pandas as pd
    import pyarrow as pa
    import pyarrow.ipc as ipc
    import io
    import uuid
    import json

    try:
        # Parse CSV to DataFrame
        df = pd.read_csv(io.StringIO(csv_data))
        
        # Parse operation details
        try:
            operation_data = json.loads(operation_details) if operation_details else {}
        except json.JSONDecodeError:
            operation_data = {"operations": [], "new_columns": []}
        
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
        
        # Save operation details to MongoDB if required parameters are provided
        mongo_result = None
        print(f"🔍 DEBUG: client_name = {client_name}")
        print(f"🔍 DEBUG: app_name = {app_name}")
        print(f"🔍 DEBUG: project_name = {project_name}")
        print(f"🔍 DEBUG: user_id = {user_id}")
        print(f"🔍 DEBUG: project_id = {project_id}")
        
        if client_name:  # Use client_name directly
            print(f"🔍 DEBUG: client_name provided, proceeding with MongoDB save")
            
            mongo_data = {
                "operations": operation_data.get("operations", []),
                # "new_columns": operation_data.get("new_columns", []),
                "result_file": filename,
                "shape": df.shape,
                "columns": list(df.columns),
                "timestamp": datetime.now().isoformat(),
            }
            
            print(f"🔍 DEBUG: mongo_data = {mongo_data}")
            
            mongo_result = await save_createandtransform_configs(
                client_name=client_name,
                app_name=app_name,
                project_name=project_name,
                operation_data=mongo_data,
                user_id=user_id,
                project_id=project_id
            )
            
            print(f"🔍 DEBUG: mongo_result = {mongo_result}")
        else:
            print(f"🔍 DEBUG: client_id not provided, skipping MongoDB save")
        
        return {
            "result_file": filename,
            "shape": df.shape,
            "columns": list(df.columns),
            "message": "DataFrame saved successfully",
            "mongodb_saved": mongo_result.get("status") == "success" if mongo_result else False,
            "mongo_id": mongo_result.get("mongo_id") if mongo_result else None
        }
    except Exception as e:
        print(f"⚠️ save_createcolumn_dataframe error: {e}")
        raise HTTPException(status_code=400, detail=str(e))


@router.get("/get_createandtransform_config")
async def get_createandtransform_config(
    client_name: str = Query(...),
    app_name: str = Query(...),
    project_name: str = Query(...)
):
    """Retrieve saved createandtransform configuration."""
    try:
        mongo_data = await get_createandtransform_config_from_mongo(client_name, app_name, project_name)
        if mongo_data:
            return {"status": "success", "source": "mongo", "data": mongo_data}
        else:
            raise HTTPException(status_code=404, detail="Createandtransform configuration not found")
    except Exception as e:
        print(f"⚠️ get_createandtransform_config error: {e}")
        raise HTTPException(status_code=500, detail=str(e))


@router.get("/debug_mongo")
async def debug_mongo():
    """Debug endpoint to test MongoDB connection and list collections."""
    try:
        from .mongodb_saver import client
        print(f"🔍 DEBUG: Testing MongoDB connection...")
        
        # Test connection
        await client.admin.command('ping')
        print(f"🔍 DEBUG: MongoDB connection successful")
        
        # List databases
        databases = await client.list_database_names()
        print(f"🔍 DEBUG: Available databases: {databases}")
        
        # Check trinity_prod database
        if "trinity_prod" in databases:
            trinity_prod_db = client["trinity_prod"]
            collections = await trinity_prod_db.list_collection_names()
            print(f"🔍 DEBUG: Collections in trinity_prod: {collections}")
            
            # Check if createandtransform_configs collection exists
            if "createandtransform_configs" in collections:
                count = await trinity_prod_db["createandtransform_configs"].count_documents({})
                print(f"🔍 DEBUG: Documents in createandtransform_configs: {count}")
                
                # Show a few documents
                docs = await trinity_prod_db["createandtransform_configs"].find().limit(3).to_list(length=3)
                print(f"🔍 DEBUG: Sample documents: {docs}")
            else:
                print(f"🔍 DEBUG: createandtransform_configs collection does not exist")
        else:
            print(f"🔍 DEBUG: trinity_prod database does not exist")
        
        return {
            "status": "success",
            "databases": databases,
            "trinity_prod_exists": "trinity_prod" in databases,
            "collections": collections if "trinity_prod" in databases else [],
            "createandtransform_configs_exists": "createandtransform_configs" in collections if "trinity_prod" in databases else False,
            "document_count": count if "trinity_prod" in databases and "createandtransform_configs" in collections else 0
        }
    except Exception as e:
        print(f"❌ DEBUG: MongoDB test failed: {e}")
        return {
            "status": "error",
            "error": str(e),
            "error_type": type(e).__name__
        }

from fastapi import Query
import pyarrow as pa
import pyarrow.ipc as ipc
import numpy as np

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

@router.get("/identifier_options")
async def identifier_options(
    client_name: str = Query(..., description="Client name"),
    app_name: str = Query(..., description="App name"),
    project_name: str = Query(..., description="Project name"),
):
    """Return identifier column names using Redis ▶ Mongo ▶ fallback logic.

    1. Attempt to read JSON config from Redis key
       `<client>/<app>/<project>/column_classifier_config`.
    2. If missing, fetch from Mongo (`classifier_configs` collection).
       Cache the document back into Redis.
    3. If still unavailable, return empty list – the frontend will
       fall back to its existing column_summary extraction flow.
    """
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
        try:
            from app.features.column_classifier.database import get_classifier_config_from_mongo
            cfg = get_classifier_config_from_mongo(client_name, app_name, project_name)
            if cfg and redis_client:
                try:
                    redis_client.setex(key, 3600, json.dumps(cfg, default=str))
                except Exception as exc:
                    print(f"⚠️ Redis write error for {key}: {exc}")
        except Exception as exc:
            print(f"⚠️ Mongo classifier config lookup failed: {exc}")

    identifiers: list[str] = []
    if cfg and isinstance(cfg.get("identifiers"), list):
        identifiers = cfg["identifiers"]

    # Filter out common time-related identifiers
    time_keywords = {"date", "time", "month", "months", "week", "weeks", "year", "years"}
    identifiers = [col for col in identifiers if col.lower() not in time_keywords]

    return {"identifiers": identifiers}


@router.get("/classification")
async def get_column_classification(
    validator_atom_id: str = Query(...),
    file_key: str = Query(...),
    client_name: str = Query(..., description="Client name"),
    app_name: str = Query(..., description="App name"),
    project_name: str = Query(..., description="Project name")
):
    """
    Fetch column classification (identifiers, measures, unclassified) from Redis-first fallback then MongoDB for a given validator_atom_id and file_key.
    Updated to use client/app/project context like scope_selector.
    """
    collection = await get_column_classifications_collection()

    # 1️⃣  Try Redis via the shared helper with correct client/app/project context
    identifiers, measures = await fetch_measures_list_with_context(
        validator_atom_id=validator_atom_id,
        file_key=file_key,
        collection=collection,
        client_name=client_name,
        app_name=app_name,
        project_name=project_name,
    )

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