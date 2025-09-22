import motor.motor_asyncio
from minio import Minio
from minio.error import S3Error
from .config import settings
import logging
from datetime import timedelta
from typing import Any, Dict, List, Optional
from bson import ObjectId
import io
import pandas as pd
import numpy as np
from sklearn.model_selection import KFold
from sklearn.preprocessing import StandardScaler, MinMaxScaler
from sklearn.metrics import r2_score
from .models import get_models, safe_mape, CustomConstrainedRidge, ConstrainedLinearRegression
import uuid
from datetime import datetime
import csv
from io import StringIO, BytesIO
from datetime import datetime
import csv
from io import StringIO, BytesIO
from datetime import datetime




logging.basicConfig(level=logging.INFO)
logger = logging.getLogger("build-atom")

# MongoDB Connection
mongo_client = None
scope_db = None
build_db = None
scopes_collection = None
build_collection = None

try:
    mongo_client = motor.motor_asyncio.AsyncIOMotorClient(
        settings.mongo_details,
        serverSelectionTimeoutMS=5000,
        connectTimeoutMS=5000,
        socketTimeoutMS=5000,
        maxPoolSize=10,
    )
    
    # Scope selection database and collection
    scope_db = mongo_client["Scope_selection"]
    scopes_collection = scope_db["Scopes"]

    # Build database and collection
    build_db = mongo_client[settings.database_name]
    build_collection = build_db[settings.collection_name]

    # ADD MARKETING COLLECTIONS HERE
    marketing_db = mongo_client["Marketing"]  # Create new database for marketing
    metadata_collection = marketing_db["marketing_metadata"]
    marketing_collection = marketing_db["marketing_models"]

    # ADD CREATEANDTRANSFORM COLLECTION HERE
    trinity_db_db = mongo_client["trinity_db"]
    createandtransform_configs_collection = trinity_db_db["createandtransform_configs"]

    logger.info("✅ MongoDB connected - collections ready:")
    logger.info("    • Scope_selection.Scopes")
    logger.info("    • Builddatabase.simple")  # Assuming these are your settings
    logger.info("    • Marketing.marketing_metadata")
    logger.info("    • Marketing.marketing_models")
    logger.info("    • trinity_db.createandtransform_configs")

    logger.info(f"    • {settings.database_name}.{settings.collection_name}")
    
except Exception as e:
    logger.error(f"❌ MongoDB connection failed: {e}")
    mongo_client = None
    scope_db = None
    build_db = None
    trinity_db_db = None
    scopes_collection = None
    build_collection = None
    createandtransform_configs_collection = None

# MinIO Client Connection
try:
    minio_client = Minio(
        settings.minio_url,
        access_key=settings.minio_access_key,
        secret_key=settings.minio_secret_key,
        secure=settings.minio_secure,
    )
    
    # Verify source bucket (dataformodel)
    if minio_client.bucket_exists(settings.minio_source_bucket):
        logger.info(f"✅ Source bucket verified: {settings.minio_source_bucket}")
    else:
        logger.warning(f"⚠️ Source bucket {settings.minio_source_bucket} does not exist")
    
    # Verify future use bucket (createddata)
    if minio_client.bucket_exists(settings.minio_bucket_name):
        logger.info(f"✅ Created data bucket verified: {settings.minio_bucket_name}")
    else:
        logger.warning(f"⚠️ Created data bucket {settings.minio_bucket_name} does not exist")
        # Create it if it doesn't exist
        try:
            minio_client.make_bucket(settings.minio_bucket_name)
            logger.info(f"✅ Created bucket: {settings.minio_bucket_name}")
        except Exception as e:
            logger.error(f"Could not create bucket: {e}")
        
except Exception as e:
    logger.error(f"❌ MinIO connection failed: {e}")
    minio_client = None

# Utility functions
def file_exists(file_key: str) -> bool:
    """Check if file exists in MinIO bucket."""
    if minio_client is None:
        return False
    try:
        minio_client.stat_object(settings.minio_bucket_name, file_key)
        return True
    except S3Error:
        return False

def presign(file_key: str, hours: int = 24) -> str:
    """Generate presigned URL for file download."""
    if minio_client is None:
        raise Exception("MinIO client not available")
    return minio_client.presigned_get_object(
        settings.minio_bucket_name, 
        file_key, 
        expires=timedelta(hours=hours)
    )

async def fetch_scope_by_id(scope_id: str) -> Optional[Dict[str, Any]]:
    """Fetch a specific scope by ID from Scope_selection.Scopes."""
    if scopes_collection is None:
        raise Exception("MongoDB scopes collection not available")
    
    # Try to find by scope_id field
    scope_doc = await scopes_collection.find_one({"scope_id": scope_id})
    
    # If not found and scope_id is a valid ObjectId, try by _id
    if scope_doc is None and ObjectId.is_valid(scope_id):
        scope_doc = await scopes_collection.find_one({"_id": ObjectId(scope_id)})
    
    return scope_doc

async def get_scope_combinations(scope_id: str) -> Dict[str, Any]:
    """Get scope details and extract all combinations."""
    scope_doc = await fetch_scope_by_id(scope_id)
    
    if scope_doc is None:
        return None
    
    # Extract combinations from filter_set_results
    combinations = []
    for fset in scope_doc.get("filter_set_results", []):
        set_name = fset.get("set_name", "")
        for cfile in fset.get("combination_files", []):
            combo = cfile.get("combination", {})
            combinations.append({
                "combination_id": f"{combo.get('Channel','')}_{combo.get('Brand','')}_{combo.get('PPG','')}",
                "file_key": cfile.get("file_key", ""),
                "filename": cfile.get("filename", ""),
                "set_name": set_name,
                "record_count": cfile.get("record_count", 0)
            })
    
    return {
        "scope_id": str(scope_doc.get("_id", scope_doc.get("scope_id", ""))),
        "scope_name": scope_doc.get("name", ""),
        "scope_type": scope_doc.get("scope_type", ""),
        "validator_id": scope_doc.get("validator_id", ""),
        "status": scope_doc.get("status", ""),
        "total_combinations": len(combinations),
        "combinations": combinations
    }

def get_file_from_source(file_key: str) -> io.BytesIO:
    """
    Get file from source bucket (dataformodel).
    Returns file as BytesIO object.
    """
    if minio_client is None:
        raise Exception("MinIO client not available")
    
    try:
        logger.info(f"Reading file from {settings.minio_source_bucket}: {file_key}")
        response = minio_client.get_object(settings.minio_source_bucket, file_key)
        data = io.BytesIO(response.read())
        response.close()
        response.release_conn()
        return data
    except Exception as e:
        logger.error(f"Error reading file {file_key} from {settings.minio_source_bucket}: {e}")
        raise

async def get_scope_set_with_columns(scope_id: str, set_name: str) -> Optional[Dict[str, Any]]:
    """
    Get scope combinations filtered by set_name and extract columns from first file.
    """
    if scopes_collection is None:
        raise Exception("MongoDB scopes collection not available")
    
    # Fetch the scope document
    scope_doc = await fetch_scope_by_id(scope_id)
    
    if scope_doc is None:
        return None
    
    # Filter combinations by set_name
    filtered_combinations = []
    for fset in scope_doc.get("filter_set_results", []):
        for cfile in fset.get("combination_files", []):
            if fset.get("set_name", "") == set_name:
                combo = cfile.get("combination", {})
                filtered_combinations.append({
                    "combination_id": f"{combo.get('Channel','')}_{combo.get('Brand','')}_{combo.get('PPG','')}",
                    "file_key": cfile.get("file_key", ""),
                    "filename": cfile.get("filename", ""),
                    "set_name": fset.get("set_name", ""),
                    "record_count": cfile.get("record_count", 0)
                })
    
    if not filtered_combinations:
        return None
    
    # Get columns from the first file
    columns = []
    columns_source = ""
    
    if minio_client is not None and filtered_combinations:
        first_file = filtered_combinations[0]
        file_key = first_file["file_key"]
        
        try:
            logger.info(f"Reading columns from bucket: {settings.minio_source_bucket}, file: {file_key}")
            
            # Check if file exists first
            stat = minio_client.stat_object(settings.minio_source_bucket, file_key)
            logger.info(f"File found: size={stat.size} bytes")
            
            # Get the file and properly handle the response
            response = minio_client.get_object(settings.minio_source_bucket, file_key)
            file_data = response.read()
            response.close()
            response.release_conn()
            
            if not file_data:
                raise Exception("File is empty")
            
            # Create properly positioned BytesIO buffer
            buffer = io.BytesIO(file_data)
            buffer.seek(0)  # Critical: Reset buffer position to beginning
            
            # Read CSV headers
            df = pd.read_csv(buffer, nrows=0)
            columns = df.columns.tolist()
            columns_source = first_file["filename"]
            buffer.close()
            
            logger.info(f"Successfully read {len(columns)} columns from {columns_source}")
            
        except Exception as e:
            logger.error(f"Could not read columns from file {file_key}: {type(e).__name__}: {e}")
            columns = []
            columns_source = f"Failed to read: {str(e)}"
    
    return {
        "scope_id": str(scope_doc.get("_id", scope_doc.get("scope_id", ""))),
        "scope_name": scope_doc.get("name", ""),
        "set_name": set_name,
        "total_combinations": len(filtered_combinations),
        "combinations": filtered_combinations,
        "columns": columns,
        "columns_source": columns_source
    }


def calculate_aic_bic(y_true, y_pred, n_parameters):
    """
    Calculate AIC and BIC for a model.
    
    Parameters:
    - y_true: Actual values
    - y_pred: Predicted values
    - n_parameters: Number of model parameters (including intercept)
    
    Returns:
    - aic: Akaike Information Criterion
    - bic: Bayesian Information Criterion
    """
    n = len(y_true)
    
    # Calculate residual sum of squares
    residuals = y_true - y_pred
    rss = np.sum(residuals ** 2)
    
    # Avoid log(0) by adding small epsilon
    if rss == 0:
        rss = 1e-10
    
    # Calculate log-likelihood for linear regression
    log_likelihood = -n/2 * np.log(2 * np.pi) - n/2 * np.log(rss/n) - n/2
    
    # Calculate AIC and BIC
    aic = 2 * n_parameters - 2 * log_likelihood
    bic = n_parameters * np.log(n) - 2 * log_likelihood
    
    return float(aic), float(bic)



def calculate_price_elasticity(
    coefficients: Dict[str, float],
    intercept: float,
    x_variables: List[str],
    price_column: str,
    variable_averages: Dict[str, float],
    df: pd.DataFrame
) -> float:
    """
    Calculate price elasticity at mean values.
    
    Parameters:
    - coefficients: Unstandardized model coefficients
    - intercept: Unstandardized intercept
    - x_variables: List of feature variables
    - price_column: Name of the price column
    - variable_averages: Dictionary of variable averages
    - df: Original dataframe for calculating RPI averages
    
    Returns:
    - price_elasticity: Calculated elasticity value
    """
    # Calculate predicted quantity at mean values
    predicted_Q = intercept
    for var in x_variables:
        beta_key = f"Beta_{var}"
        if beta_key in coefficients:
            predicted_Q += coefficients[beta_key] * variable_averages.get(var, 0.0)
    
    # Calculate derivative with respect to price
    derivative = 0.0
    
    # Direct price effect
    if price_column in x_variables:
        beta_key = f"Beta_{price_column}"
        if beta_key in coefficients:
            derivative += coefficients[beta_key]
    
    # RPI effects (competitor price ratios)
    rpi_cols = [var for var in x_variables if var.endswith("_RPI")]
    avg_own_price = variable_averages.get(price_column, 0.0)
    
    for rpi_col in rpi_cols:
        beta_key = f"Beta_{rpi_col}"
        if beta_key in coefficients:
            ratio_beta = coefficients[beta_key]
            ratio_avg = df[rpi_col].mean() if rpi_col in df.columns else 0.0
            
            if ratio_avg and not np.isnan(ratio_avg) and avg_own_price > 0:
                competitor_price = avg_own_price / ratio_avg
                if competitor_price > 0:
                    derivative += ratio_beta / competitor_price
    
    # Calculate elasticity
    if predicted_Q > 0 and avg_own_price > 0:
        elasticity = derivative * (avg_own_price / predicted_Q)
    else:
        elasticity = np.nan
    
    return float(elasticity)



    """
    The function `train_models_for_combination_enhanced` trains machine learning models with enhanced
    result tracking, including elasticity calculations if applicable, and returns model results and
    variable statistics.
    
    :param file_key: The `file_key` parameter is a string that represents the key or identifier of the
    file from which the data will be read for training the models. It is used to retrieve the file data
    from a data source (MinIO in this case) in order to perform the training process
    :type file_key: str
    :param x_variables: The `x_variables` parameter in the `train_models_for_combination_enhanced`
    function refers to a list of independent variables (features) that will be used to train the machine
    learning models. These variables are the input features that the models will use to make predictions
    on the target variable `y
    :type x_variables: List[str]
    :param y_variable: The `y_variable` parameter in the `train_models_for_combination_enhanced`
    function refers to the dependent variable (target variable) in your dataset. This variable is the
    one you want to predict or model based on the independent variables (features) specified in the
    `x_variables` list
    :type y_variable: str
    :param price_column: The `price_column` parameter in the `train_models_for_combination_enhanced`
    function refers to the column in your dataset that contains the prices of the products or services
    you are analyzing. This column is used to calculate price elasticity if it is included in the list
    of `x_variables`
    :type price_column: Optional[str]
    :param standardization: The `standardization` parameter in the
    `train_models_for_combination_enhanced` function determines the type of standardization to apply to
    the input features before training the models. It can take two possible values:
    :type standardization: str
    :param k_folds: The `k_folds` parameter in the `train_models_for_combination_enhanced` function
    represents the number of folds to use in the k-fold cross-validation process. It determines how many
    subsets the data will be split into for training and testing the models during cross-validation.
    Increasing the number of
    :type k_folds: int
    :param models_to_run: The `models_to_run` parameter in the `train_models_for_combination_enhanced`
    function is a list of strings that specifies the names of the models to be trained. If this
    parameter is provided, only the models with names matching the strings in this list will be trained.
    If this parameter
    :type models_to_run: Optional[List[str]]
    :param custom_configs: The `custom_configs` parameter in the `train_models_for_combination_enhanced`
    function allows you to provide custom configurations for specific models. These configurations can
    include parameters that are specific to certain models to customize their behavior during training
    :type custom_configs: Optional[Dict[str, Any]]
    :return: The function `train_models_for_combination_enhanced` returns a tuple containing two
    elements:
    1. `model_results`: A list of dictionaries, each containing results and statistics for the trained
    models. Each dictionary includes metrics like MAPE (Mean Absolute Percentage Error), R-squared
    scores, coefficients, intercept, AIC (Akaike Information Criterion), BIC (Bayesian Information
    Criterion), and
    """
    
    
async def train_models_for_combination_enhanced(
    file_key: str,
    x_variables: List[str],
    y_variable: str,
    price_column: Optional[str],
    standardization: str,
    k_folds: int,
    models_to_run: Optional[List[str]],
    custom_configs: Optional[Dict[str, Any]],
    bucket_name: Optional[str] = None
) -> tuple[List[Dict[str, Any]], Dict[str, Any]]:
    """
    Train models with enhanced result tracking including elasticities (only if price is in X variables).
    Returns: (model_results, variable_statistics)
    """
    
    # Check if price elasticity calculation is applicable
    calculate_elasticity = False
    if price_column and price_column in x_variables:
        calculate_elasticity = True
        logger.info(f"Price elasticity will be calculated using column: {price_column}")
    elif price_column and price_column not in x_variables:
        logger.warning(f"Price column '{price_column}' specified but not in x_variables. Elasticity will not be calculated.")
    
    # Read data from MinIO
    try:
        if bucket_name:
            # Use the passed bucket name instead of hardcoded one
            logger.info(f"Reading file from custom bucket {bucket_name}: {file_key}")
            if minio_client is None:
                raise Exception("MinIO client not available")
            
            response = minio_client.get_object(bucket_name, file_key)
            file_data = response.read()
            response.close()
            response.release_conn()
            
            # Handle different file formats
            if file_key.endswith('.arrow'):
                try:
                    import pyarrow as pa
                    import pyarrow.ipc as ipc
                    reader = ipc.RecordBatchFileReader(pa.BufferReader(file_data))
                    df = reader.read_all().to_pandas()
                    # Convert columns to lowercase for consistency
                    df.columns = df.columns.str.lower()
                    logger.info(f"Successfully read Arrow file: {file_key}, shape: {df.shape}")
                except Exception as arrow_error:
                    logger.error(f"Error reading Arrow file: {arrow_error}")
                    raise
            elif file_key.endswith('.csv'):
                df = pd.read_csv(io.BytesIO(file_data))
                # Convert columns to lowercase for consistency
                df.columns = df.columns.str.lower()
                logger.info(f"Successfully read CSV file: {file_key}, shape: {df.shape}")
            else:
                # Try CSV as fallback
                df = pd.read_csv(io.BytesIO(file_data))
                # Convert columns to lowercase for consistency
                df.columns = df.columns.str.lower()
                logger.info(f"Read file as CSV (fallback): {file_key}, shape: {df.shape}")
        else:
            # Fallback to original method
            file_data = get_file_from_source(file_key)
            df = pd.read_csv(file_data)
            # Convert columns to lowercase for consistency
            df.columns = df.columns.str.lower()
        
        # Debug: Log available columns and required variables
        logger.info(f"Available columns in data: {list(df.columns)}")
        logger.info(f"Required X variables: {x_variables}")
        logger.info(f"Required Y variable: {y_variable}")
        
        # Calculate variable statistics
        variable_stats = {}
        variable_averages = {}
        
        # Statistics for X variables
        for var in x_variables:
            if var in df.columns:
                var_data = df[var]
                variable_stats[var] = {
                    "variable_name": var,
                    "mean": float(var_data.mean()),
                    "std": float(var_data.std()),
                    "min": float(var_data.min()),
                    "max": float(var_data.max()),
                    "q25": float(var_data.quantile(0.25)),
                    "median": float(var_data.median()),
                    "q75": float(var_data.quantile(0.75)),
                    "count": int(var_data.count())
                }
                variable_averages[var] = float(var_data.mean())
        
        # Statistics for Y variable
        y_data = df[y_variable]
        variable_stats[y_variable] = {
            "variable_name": y_variable,
            "mean": float(y_data.mean()),
            "std": float(y_data.std()),
            "min": float(y_data.min()),
            "max": float(y_data.max()),
            "q25": float(y_data.quantile(0.25)),
            "median": float(y_data.median()),
            "q75": float(y_data.quantile(0.75)),
            "count": int(y_data.count())
        }
        variable_averages[y_variable] = float(y_data.mean())
        
        # Prepare features and target
        X_original = df[x_variables]
        y_original = df[y_variable]
        
        X = X_original.values
        y = y_original.values
        
        # Store original statistics for back-transformation
        x_means = X_original.mean().values
        x_stds = X_original.std().values
        y_mean = y_original.mean()
        y_std = y_original.std()
        
        # Apply standardization
        scaler = None
        if standardization == 'standard':
            scaler = StandardScaler()
            X = scaler.fit_transform(X)
        elif standardization == 'minmax':
            scaler = MinMaxScaler()
            X = scaler.fit_transform(X)
        
        # Get models
        all_models = get_models()
        
        # Filter models if specified
        if models_to_run:
            models_dict = {name: model for name, model in all_models.items() if name in models_to_run}
        else:
            models_dict = all_models
        
        # Apply custom configurations
        if custom_configs:
            for model_name, config in custom_configs.items():
                if model_name in models_dict:
                    if model_name == "Custom Constrained Ridge":
                        # Extract constraints from parameters object
                        parameters = config.get('parameters', {})
                        negative_constraints = parameters.get('negative_constraints', [])
                        positive_constraints = parameters.get('positive_constraints', [])
                        print(f"🔍 Custom Constrained Ridge - Negative constraints: {negative_constraints}")
                        print(f"🔍 Custom Constrained Ridge - Positive constraints: {positive_constraints}")
                        models_dict[model_name] = CustomConstrainedRidge(
                            l2_penalty=parameters.get('l2_penalty', 0.1),
                            learning_rate=parameters.get('learning_rate', 0.001),
                            iterations=parameters.get('iterations', 10000),
                            adam=parameters.get('adam', False),
                            negative_constraints=negative_constraints,
                            positive_constraints=positive_constraints
                        )
                    elif model_name == "Constrained Linear Regression":
                        # Extract constraints from parameters object
                        parameters = config.get('parameters', {})
                        negative_constraints = parameters.get('negative_constraints', [])
                        positive_constraints = parameters.get('positive_constraints', [])
                        print(f"🔍 Constrained Linear Regression - Negative constraints: {negative_constraints}")
                        print(f"🔍 Constrained Linear Regression - Positive constraints: {positive_constraints}")
                        models_dict[model_name] = ConstrainedLinearRegression(
                            learning_rate=parameters.get('learning_rate', 0.001),
                            iterations=parameters.get('iterations', 10000),
                            adam=parameters.get('adam', False),
                            negative_constraints=negative_constraints,
                            positive_constraints=positive_constraints
                        )
        
        # K-fold cross validation with fold tracking
        kfold = KFold(n_splits=k_folds, shuffle=True, random_state=42)
        
        results = []
        
        for model_name, model in models_dict.items():
            fold_results = []
            mape_train_scores = []
            mape_test_scores = []
            r2_train_scores = []
            r2_test_scores = []
            fold_elasticities = []
            
            for fold_idx, (train_idx, test_idx) in enumerate(kfold.split(X)):
                X_train, X_test = X[train_idx], X[test_idx]
                y_train, y_test = y[train_idx], y[test_idx]
                
                # Train model
                if model_name in ["Custom Constrained Ridge", "Constrained Linear Regression"]:
                    model.fit(X_train, y_train, x_variables)
                else:
                    model.fit(X_train, y_train)
                
                # Predictions
                y_train_pred = model.predict(X_train)
                y_test_pred = model.predict(X_test)
                
                # Calculate metrics
                mape_train = safe_mape(y_train, y_train_pred)
                mape_test = safe_mape(y_test, y_test_pred)
                r2_train = r2_score(y_train, y_train_pred)
                r2_test = r2_score(y_test, y_test_pred)
                
                mape_train_scores.append(mape_train)
                mape_test_scores.append(mape_test)
                r2_train_scores.append(r2_train)
                r2_test_scores.append(r2_test)
                
                # Calculate elasticity for this fold ONLY if price is in x_variables
                fold_elasticity = None
                if calculate_elasticity and hasattr(model, 'coef_'):
                    # Get fold-specific coefficients
                    fold_coefs = {}
                    fold_intercept = model.intercept_ if hasattr(model, 'intercept_') else 0.0
                    
                    # Back-transform coefficients for elasticity calculation
                    if standardization == 'standard':
                        for i, var in enumerate(x_variables):
                            if x_stds[i] != 0:
                                unstandardized_coef = model.coef_[i] / x_stds[i]
                            else:
                                unstandardized_coef = model.coef_[i]
                            fold_coefs[f"Beta_{var}"] = float(unstandardized_coef)
                        
                        fold_intercept = y_mean - np.sum(
                            [fold_coefs[f"Beta_{var}"] * x_means[i] 
                             for i, var in enumerate(x_variables)]
                        )
                    elif standardization == 'minmax':
                        for i, var in enumerate(x_variables):
                            # Get original data statistics for proper destandardization
                            X_original_fold = X_original.iloc[train_idx]
                            x_mins = X_original_fold.min().values
                            x_ranges = X_original_fold.max().values - x_mins
                            
                            # Correct min-max destandardization: β_original = β_scaled * (1/range(X))
                            if x_ranges[i] != 0:
                                unstandardized_coef = model.coef_[i] * (1 / x_ranges[i])
                            else:
                                unstandardized_coef = model.coef_[i]
                            fold_coefs[f"Beta_{var}"] = float(unstandardized_coef)
                        
                        # Calculate intercept using original data statistics
                        fold_intercept = fold_intercept - np.sum(
                            [fold_coefs[f"Beta_{var}"] * x_mins[i] 
                             for i, var in enumerate(x_variables)]
                        )
                    else:
                        for i, var in enumerate(x_variables):
                            fold_coefs[f"Beta_{var}"] = float(model.coef_[i])
                    
                    # Calculate elasticity
                    fold_elasticity = calculate_price_elasticity(
                        coefficients=fold_coefs,
                        intercept=float(fold_intercept),
                        x_variables=x_variables,
                        price_column=price_column,
                        variable_averages=variable_averages,
                        df=df
                    )
                
                if fold_elasticity is not None:
                    fold_elasticities.append(fold_elasticity)
                
                # Store fold results - NO CSF/MCV HERE
                fold_results.append({
                    "fold_index": fold_idx,
                    "mape_train": mape_train,
                    "mape_test": mape_test,
                    "r2_train": r2_train,
                    "r2_test": r2_test,
                    "train_size": len(train_idx),
                    "test_size": len(test_idx),
                    "price_elasticity": fold_elasticity if calculate_elasticity else None
                })
            
            # Train final model on full data for coefficients and AIC/BIC
            if model_name in ["Custom Constrained Ridge", "Constrained Linear Regression"]:
                model.fit(X, y, x_variables)
            else:
                model.fit(X, y)
            
            # Get predictions on full dataset for AIC/BIC calculation
            y_pred_full = model.predict(X)
            
            # Calculate number of parameters (coefficients + intercept)
            n_parameters = len(x_variables) + 1  # +1 for intercept
            
            # Calculate AIC and BIC
            aic, bic = calculate_aic_bic(y, y_pred_full, n_parameters)
            
            # Extract and back-transform coefficients
            coefficients = {}
            unstandardized_coefficients = {}
            unstandardized_intercept = 0.0
            
            if hasattr(model, 'coef_'):
                standardized_coefs = model.coef_
                standardized_intercept = model.intercept_ if hasattr(model, 'intercept_') else 0.0
                
                if standardization == 'standard':
                    for i, var in enumerate(x_variables):
                        if x_stds[i] != 0:
                            unstandardized_coef = standardized_coefs[i] / x_stds[i]
                        else:
                            unstandardized_coef = standardized_coefs[i]
                        
                        coefficients[f"Beta_{var}"] = float(standardized_coefs[i])
                        unstandardized_coefficients[f"Beta_{var}"] = float(unstandardized_coef)
                    
                    unstandardized_intercept = y_mean - np.sum(
                        [unstandardized_coefficients[f"Beta_{var}"] * x_means[i] 
                         for i, var in enumerate(x_variables)]
                    )
                elif standardization == 'minmax':
                    for i, var in enumerate(x_variables):
                        # Get original data statistics for proper destandardization
                        x_mins = X_original.min().values
                        x_ranges = X_original.max().values - x_mins
                        
                        # Correct min-max destandardization: β_original = β_scaled * (1/range(X))
                        if x_ranges[i] != 0:
                            unstandardized_coef = standardized_coefs[i] * (1 / x_ranges[i])
                        else:
                            unstandardized_coef = standardized_coefs[i]
                        unstandardized_coefficients[f"Beta_{var}"] = float(unstandardized_coef)
                        coefficients[f"Beta_{var}"] = float(standardized_coefs[i])
                    
                    # Calculate intercept using original data statistics
                    unstandardized_intercept = standardized_intercept - np.sum(
                        [unstandardized_coefficients[f"Beta_{var}"] * x_mins[i] 
                         for i, var in enumerate(x_variables)]
                    )
                else:
                    for i, var in enumerate(x_variables):
                        coefficients[f"Beta_{var}"] = float(standardized_coefs[i])
                        unstandardized_coefficients[f"Beta_{var}"] = float(standardized_coefs[i])
                    unstandardized_intercept = standardized_intercept
            
            # Calculate overall elasticity ONLY if price is in x_variables
            overall_elasticity = None
            elasticity_std = None
            csf = None
            mcv = None
            ppu_at_elasticity = None
            
            if calculate_elasticity and unstandardized_coefficients:
                overall_elasticity = calculate_price_elasticity(
                    coefficients=unstandardized_coefficients,
                    intercept=float(unstandardized_intercept),
                    x_variables=x_variables,
                    price_column=price_column,
                    variable_averages=variable_averages,
                    df=df
                )
                
                # Calculate elasticity statistics only if we have valid fold elasticities
                if fold_elasticities:
                    valid_elasticities = [e for e in fold_elasticities if e is not None and not np.isnan(e)]
                    if valid_elasticities:
                        elasticity_std = float(np.std(valid_elasticities))
                
                # Calculate CSF and MCV only if elasticity was calculated successfully
                if overall_elasticity is not None and not np.isnan(overall_elasticity) and overall_elasticity != 0:
                    # Calculate CSF (Consumer Surplus Fraction)
                    csf = 1 - (1 / overall_elasticity)
                    
                    # Get average PPU for MCV calculation
                    ppu_at_elasticity = variable_averages.get(price_column, 0)
                    
                    # Calculate MCV (Marginal Consumer Value)
                    if ppu_at_elasticity > 0:
                        mcv = csf * ppu_at_elasticity
            
            results.append({
                "model_name": model_name,
                "mape_train": np.mean(mape_train_scores),
                "mape_test": np.mean(mape_test_scores),
                "r2_train": np.mean(r2_train_scores),
                "r2_test": np.mean(r2_test_scores),
                "mape_train_std": np.std(mape_train_scores),
                "mape_test_std": np.std(mape_test_scores),
                "r2_train_std": np.std(r2_train_scores),
                "r2_test_std": np.std(r2_test_scores),
                "coefficients": unstandardized_coefficients,
                "standardized_coefficients": coefficients,
                "intercept": float(unstandardized_intercept),
                "fold_results": fold_results,
                "aic": aic,
                "bic": bic,
                "n_parameters": n_parameters,
                "price_elasticity": overall_elasticity,
                "price_elasticity_std": elasticity_std,
                "elasticity_calculated": calculate_elasticity,
                "csf": csf,
                "mcv": mcv,
                "ppu_at_elasticity": ppu_at_elasticity
            })
        
        return results, {"variable_statistics": list(variable_stats.values()), "variable_averages": variable_averages}
        
    except Exception as e:
        logger.error(f"Error training models for {file_key}: {e}")
        raise

    
    
    

async def save_model_results_enhanced(
    scope_id: str,
    scope_name: str,
    set_name: str,
    combination: Dict[str, Any],
    model_results: List[Dict[str, Any]],
    x_variables: List[str],
    y_variable: str,
    price_column: Optional[str],  # ADD THIS PARAMETER
    standardization: str,
    k_folds: int,
    run_id: str,
    variable_data: Dict[str, Any]
) -> List[str]:

    """Save enhanced model results including fold details, variable statistics, and AIC/BIC."""
    if build_collection is None:
        raise Exception("MongoDB build collection not available")
    
    inserted_ids = []
    try:
        documents = []
        total_records = combination.get("record_count", 0)
        
        for model_result in model_results:
            # Main aggregated result document
            doc = {
                "scope_id": scope_id,
                "scope_name": scope_name,
                "set_name": set_name,
                "combination_id": combination["combination_id"],
                "file_key": combination["file_key"],
                "model_name": model_result["model_name"],
                "model_type": "regression",
                
                # Training configuration
                "x_variables": [f"{var}_{standardization}" for var in x_variables] if standardization != 'none' else x_variables,
                "y_variable": y_variable,
                "standardization": standardization,
                "k_folds": k_folds,
                
                # Model performance (aggregated)
                "mape_train": model_result["mape_train"],
                "mape_test": model_result["mape_test"],
                "r2_train": model_result["r2_train"],
                "r2_test": model_result["r2_test"],
                
                # Standard deviations
                "mape_train_std": model_result.get("mape_train_std", 0),
                "mape_test_std": model_result.get("mape_test_std", 0),
                "r2_train_std": model_result.get("r2_train_std", 0),
                "r2_test_std": model_result.get("r2_test_std", 0),
                
                # AIC and BIC
                "aic": model_result.get("aic", float('inf')),
                "bic": model_result.get("bic", float('inf')),
                "n_parameters": model_result.get("n_parameters", len(x_variables) + 1),
                
                # Coefficients
                "coefficients": model_result["coefficients"],
                "standardized_coefficients": model_result.get("standardized_coefficients", {}),
                "intercept": model_result["intercept"],
                
                # ADD PRICE ELASTICITY FIELDS
                "price_column": price_column,
                "price_elasticity": model_result.get("price_elasticity"),
                "price_elasticity_std": model_result.get("price_elasticity_std"),
                "elasticity_calculated": model_result.get("elasticity_calculated", False),
                "fold_elasticities": model_result.get("fold_elasticities", []),
                
                # ADD THESE NEW FIELDS
                "csf": model_result.get("csf"),
                "mcv": model_result.get("mcv"),
                "ppu_at_elasticity": model_result.get("ppu_at_elasticity"),
                
                
                
                
                # Variable statistics
                "variable_statistics": variable_data.get("variable_statistics", []),
                "variable_averages": variable_data.get("variable_averages", {}),
                
                # Fold results
                "fold_results": model_result.get("fold_results", []),
                "is_fold_result": False,
                
                # Metadata
                "created_at": datetime.now(),
                "training_date": datetime.now(),
                "total_records": total_records,
                "custom_model_config": model_result.get("custom_config", None),
                
                # Tracking
                "run_id": run_id,
                "status": "completed"
            }
            
            documents.append(doc)
        
        # Insert all documents
        if documents:
            result = await build_collection.insert_many(documents)
            inserted_ids = [str(id) for id in result.inserted_ids]
            logger.info(f"Saved {len(inserted_ids)} enhanced model results to MongoDB")
        
        return inserted_ids
        
    except Exception as e:
        logger.error(f"Error saving enhanced model results to MongoDB: {e}")
        raise


##################export tyo csv and m inio 



async def get_csv_from_minio(file_key: str) -> BytesIO:
    """
    Retrieve previously saved CSV from MinIO.
    """
    if minio_client is None:
        raise Exception("MinIO client not available")
    
    try:
        response = minio_client.get_object(settings.minio_results_bucket, file_key)
        data = BytesIO(response.read())
        response.close()
        response.release_conn()
        data.seek(0)
        return data
    except Exception as e:
        logger.error(f"Error retrieving CSV from MinIO: {e}")
        raise


async def export_results_to_csv_and_minio(
    run_id: str,
    include_fold_details: bool = False
) -> tuple[StringIO, str]:
    """
    Export model results to CSV format and save to MinIO.
    Returns: (csv_buffer, minio_file_key)
    """
    if build_collection is None:
        raise Exception("MongoDB build collection not available")
    
    # Ensure MinIO bucket exists
    if minio_client and not minio_client.bucket_exists(settings.minio_results_bucket):
        minio_client.make_bucket(settings.minio_results_bucket)
        logger.info(f"Created MinIO bucket: {settings.minio_results_bucket}")
    
    # Query for results
    query = {"run_id": run_id, "is_fold_result": False}
    results = []
    
    cursor = build_collection.find(query)
    async for doc in cursor:
        results.append(doc)
    
    if not results:
        raise Exception(f"No results found for run_id: {run_id}")
    
    # Create CSV in memory
    csv_buffer = StringIO()
    
    # Define comprehensive CSV columns
    fieldnames = [
        # Scope Information
        'run_id', 'scope_id', 'scope_name', 'set_name',
        # Combination Details
        'combination_id', 'file_key',
        # Model Information
        'model_name', 'model_type', 'total_records', 'training_date',
        # Performance Metrics
        'mape_train', 'mape_test', 'r2_train', 'r2_test',
        'mape_train_std', 'mape_test_std', 'r2_train_std', 'r2_test_std',
        # Model Selection Criteria
        'aic', 'bic', 'n_parameters',
        # Price Elasticity
        'price_column', 'price_elasticity', 'price_elasticity_std', 'elasticity_calculated', 
'csf', 'mcv', 'ppu_at_elasticity',        # Training Configuration
        'standardization', 'k_folds', 'x_variables', 'y_variable'
    ]
    
    # Add coefficient columns dynamically
    coef_names = []
    if results:
        first_result = results[0]
        coef_names = sorted(first_result.get('coefficients', {}).keys())
        fieldnames.extend(coef_names)
        fieldnames.append('intercept')
        
        # Add fold elasticities if requested
        if include_fold_details and first_result.get('fold_results'):
            num_folds = len(first_result['fold_results'])
            for i in range(num_folds):
                fieldnames.extend([
                    f'fold_{i+1}_mape_train',
                    f'fold_{i+1}_mape_test',
                    f'fold_{i+1}_r2_train',
                    f'fold_{i+1}_r2_test',
                    f'fold_{i+1}_elasticity'
                ])
    
    # Write CSV
    writer = csv.DictWriter(csv_buffer, fieldnames=fieldnames)
    writer.writeheader()
    
    for doc in results:
        row = {
            # Scope Information
            'run_id': doc.get('run_id', ''),
            'scope_id': doc.get('scope_id', ''),
            'scope_name': doc.get('scope_name', ''),
            'set_name': doc.get('set_name', ''),
            # Combination Details
            'combination_id': doc.get('combination_id', ''),
            'file_key': doc.get('file_key', ''),
            # Model Information
            'model_name': doc.get('model_name', ''),
            'model_type': doc.get('model_type', 'regression'),
            'total_records': doc.get('total_records', 0),
            'training_date': doc.get('training_date', '').strftime('%Y-%m-%d %H:%M:%S') if isinstance(doc.get('training_date'), datetime) else '',
            # Performance Metrics
            'mape_train': doc.get('mape_train', ''),
            'mape_test': doc.get('mape_test', ''),
            'r2_train': doc.get('r2_train', ''),
            'r2_test': doc.get('r2_test', ''),
            'mape_train_std': doc.get('mape_train_std', ''),
            'mape_test_std': doc.get('mape_test_std', ''),
            'r2_train_std': doc.get('r2_train_std', ''),
            'r2_test_std': doc.get('r2_test_std', ''),
            # Model Selection Criteria
            'aic': doc.get('aic', ''),
            'bic': doc.get('bic', ''),
            'n_parameters': doc.get('n_parameters', ''),
            # Price Elasticity
            'price_column': doc.get('price_column', ''),
            'price_elasticity': doc.get('price_elasticity', ''),
            'price_elasticity_std': doc.get('price_elasticity_std', ''),
            'elasticity_calculated': doc.get('elasticity_calculated', False),
            
                # ADD THESE NEW FIELDS
            'csf': doc.get('csf', ''),
            'mcv': doc.get('mcv', ''),
            'ppu_at_elasticity': doc.get('ppu_at_elasticity', ''),
            # Training Configuration
            'standardization': doc.get('standardization', ''),
            'k_folds': doc.get('k_folds', ''),
            'x_variables': ', '.join(doc.get('x_variables', [])),
            'y_variable': doc.get('y_variable', ''),
            'intercept': doc.get('intercept', '')
        }
        
        # Add coefficients
        coefficients = doc.get('coefficients', {})
        for coef_name in coef_names:
            row[coef_name] = coefficients.get(coef_name, '')
        
        # Add fold details if requested
        if include_fold_details and doc.get('fold_results'):
            for i, fold in enumerate(doc['fold_results']):
                row[f'fold_{i+1}_mape_train'] = fold.get('mape_train', '')
                row[f'fold_{i+1}_mape_test'] = fold.get('mape_test', '')
                row[f'fold_{i+1}_r2_train'] = fold.get('r2_train', '')
                row[f'fold_{i+1}_r2_test'] = fold.get('r2_test', '')
                row[f'fold_{i+1}_elasticity'] = fold.get('price_elasticity', '')
        
        writer.writerow(row)
    
    # Save to MinIO
    csv_content = csv_buffer.getvalue()
    timestamp = datetime.now().strftime('%Y%m%d_%H%M%S')
    
    # Create organized file path
    scope_name = results[0].get('scope_name', 'unknown').replace(' ', '_')
    set_name = results[0].get('set_name', 'unknown')
    file_key = f"csv-exports/{run_id}/{scope_name}_{set_name}_results_{timestamp}.csv"
    
    if minio_client:
        try:
            # Ensure bucket exists
            if not minio_client.bucket_exists(settings.minio_results_bucket):
                minio_client.make_bucket(settings.minio_results_bucket)
                logger.info(f"Created MinIO bucket: {settings.minio_results_bucket}")
            
            # Convert string to bytes for MinIO
            csv_bytes = BytesIO(csv_content.encode('utf-8'))
            csv_bytes.seek(0)
            
            # Upload to MinIO
            minio_client.put_object(
                settings.minio_results_bucket,
                file_key,
                csv_bytes,
                length=len(csv_content.encode('utf-8')),
                content_type="text/csv",
                metadata={
                    "run_id": run_id,
                    "scope_name": scope_name,
                    "set_name": set_name,
                    "export_date": timestamp,
                    "total_models": str(len(results))
                }
            )
            logger.info(f"CSV saved to MinIO: {file_key}")
        except Exception as e:
            logger.error(f"Failed to save CSV to MinIO: {type(e).__name__}: {e}")
            raise
    
    # Reset buffer for download
    csv_buffer.seek(0)
    return csv_buffer, file_key









################################mmmmmm

# Add these marketing functions to your existing database.py

async def save_marketing_model_results(
    run_id: str,
    model_results: List[Dict[str, Any]],
    metadata: Dict[str, Any]
) -> List[str]:
    """Save marketing model results to existing build collection."""
    if build_collection is None:
        raise Exception("MongoDB build collection not available")
    
    inserted_ids = []
    try:
        documents = []
        for idx, result in enumerate(model_results):
            doc = {
                "_id": f"marketing_{run_id}_{idx}",
                "type": "marketing_model",
                "run_id": run_id,
                "model_id": idx,
                "created_at": datetime.now(),
                **result,
                **metadata
            }
            documents.append(doc)
        
        if documents:
            result = await build_collection.insert_many(documents)
            inserted_ids = [str(id) for id in result.inserted_ids]
            logger.info(f"Saved {len(inserted_ids)} marketing model results")
        
        return inserted_ids
        
    except Exception as e:
        logger.error(f"Error saving marketing model results: {e}")
        raise

async def get_marketing_results(run_id: str) -> List[Dict[str, Any]]:
    """Retrieve marketing model results from existing build collection."""
    if build_collection is None:
        raise Exception("MongoDB build collection not available")
    
    try:
        cursor = build_collection.find({
            "type": "marketing_model",
            "run_id": run_id
        })
        results = []
        async for doc in cursor:
            results.append(doc)
        return results
        
    except Exception as e:
        logger.error(f"Error retrieving marketing results: {e}")
        raise