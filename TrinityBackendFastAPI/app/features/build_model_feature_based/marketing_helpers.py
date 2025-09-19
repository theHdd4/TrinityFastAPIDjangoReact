# marketing_helpers.py
import pandas as pd
import numpy as np
from io import StringIO, BytesIO
from datetime import datetime
from sklearn.preprocessing import StandardScaler, MinMaxScaler
from sklearn.metrics import mean_absolute_percentage_error, r2_score
from sklearn.linear_model import Ridge, Lasso, LinearRegression, ElasticNet
from typing import List, Dict, Tuple, Optional, Any
import logging
import openpyxl
from .config import settings
from .database import minio_client, build_collection  # Use existing build_collection
# Add to the imports section of marketing_helpers.py
from .models import CustomConstrainedRidge, ConstrainedLinearRegression


logger = logging.getLogger(__name__)



def create_constrained_model(
    model_type: str,
    variable_constraints: List[Dict[str, str]],
    x_columns: List[str],
    learning_rate: float = 0.001,
    iterations: int = 10000,
    l2_penalty: float = 0.1
):
    """Create a constrained model with specified constraints."""
    
    # Map variable names to indices and constraint types
    constraint_map = {}
    for constraint in variable_constraints:
        var_name = constraint['variable_name']
        constraint_type = constraint['constraint_type']
        if var_name in x_columns:
            idx = x_columns.index(var_name)
            constraint_map[idx] = constraint_type
    
    if model_type in ["Ridge", "CONSTRAINED_RIDGE"]:
        # Custom Constrained Ridge
        class MarketingConstrainedRidge(CustomConstrainedRidge):
            def __init__(self, **kwargs):
                super().__init__(**kwargs)
                self.constraint_map = constraint_map
            
            def update_weights(self):
                # Call parent update
                super().update_weights()
                
                # Apply custom constraints
                for idx, constraint_type in self.constraint_map.items():
                    if constraint_type == "negative" and self.W[idx] > 0:
                        self.W[idx] = 0
                    elif constraint_type == "positive" and self.W[idx] < 0:
                        self.W[idx] = 0
        
        return MarketingConstrainedRidge(
            l2_penalty=l2_penalty,
            learning_rate=learning_rate,
            iterations=iterations
        )
    
    else:  # Linear Regression
        # Custom Constrained Linear Regression
        class MarketingConstrainedLinear(ConstrainedLinearRegression):
            def __init__(self, **kwargs):
                super().__init__(**kwargs)
                self.constraint_map = constraint_map
            
            def update_weights(self):
                # Call parent update
                super().update_weights()
                
                # Apply custom constraints
                for idx, constraint_type in self.constraint_map.items():
                    if constraint_type == "negative":
                        self.W[idx] = min(self.W[idx], 0)
                    elif constraint_type == "positive":
                        self.W[idx] = max(self.W[idx], 0)
        
        return MarketingConstrainedLinear(
            learning_rate=learning_rate,
            iterations=iterations
        )


# Transformation functions
def adstock_function(x: np.ndarray, carryover_rate: float) -> np.ndarray:
    """Apply adstock transformation with carryover effect."""
    x = np.array(x)
    result = np.zeros_like(x)
    result[0] = x[0]
    for i in range(1, len(x)):
        result[i] = x[i] + carryover_rate * result[i - 1]
    return result

def logistic_function(x: np.ndarray, growth_rate: float, midpoint: float) -> np.ndarray:
    """Apply logistic transformation."""
    return 1 / (1 + np.exp(-growth_rate * (x - midpoint)))

def power_function(x: np.ndarray, power: float) -> np.ndarray:
    """Apply power transformation."""
    return np.power(np.maximum(x, 0), power)

def apply_transformations_by_region(
    df: pd.DataFrame,
    media_variables: List[str],
    other_variables: List[str],
    non_scaled_variables: List[str],
    transformation_params: Dict[str, List[float]],
    standardization_method: str,
    transformation_type: str
) -> pd.DataFrame:
    """Apply transformations to variables by region."""
    transformed_data_list = []
    unique_regions = df["Region"].unique()
    
    # Choose scaler
    if standardization_method == 'minmax':
        scaler_class = MinMaxScaler
        scaler_params = {'feature_range': (0, 1)}
    elif standardization_method == 'zscore':
        scaler_class = StandardScaler
        scaler_params = {}
    else:
        scaler_class = None
    
    for region in unique_regions:
        region_df = df[df["Region"] == region].copy()
        
        # Standardize other variables
        if other_variables:
            for var in other_variables:
                if var in region_df.columns:
                    if scaler_class:
                        scaler = scaler_class(**scaler_params)
                        region_df[f"scaled_{var}"] = scaler.fit_transform(region_df[[var]])
                    else:
                        region_df[f"scaled_{var}"] = region_df[var]
        
        # Transform media variables
        for media_var in media_variables:
            if media_var not in region_df.columns:
                logger.warning(f"Media variable {media_var} not found in data")
                continue
                
            params = transformation_params.get(media_var, [])
            
            if transformation_type == 'logistic':
                if len(params) != 3:
                    raise ValueError(f"Logistic transformation requires 3 parameters for {media_var}")
                gr, co, mp = params
                
                # Apply adstock
                adstocked = adstock_function(region_df[media_var].values, co)
                region_df[f"{media_var}_adstocked"] = adstocked
                
                # Standardize
                if np.std(adstocked) > 0:
                    standardized = (adstocked - np.mean(adstocked)) / np.std(adstocked)
                else:
                    standardized = adstocked
                
                # Apply logistic
                region_df[f"{media_var}_logistic"] = logistic_function(standardized, gr, mp)
                region_df[f"{media_var}_logistic"] = np.nan_to_num(region_df[f"{media_var}_logistic"])
                
                # Final scaling
                if scaler_class:
                    scaler = scaler_class(**scaler_params)
                    region_df[f"{media_var}_transformed"] = scaler.fit_transform(
                        region_df[[f"{media_var}_logistic"]]
                    )
                else:
                    region_df[f"{media_var}_transformed"] = region_df[f"{media_var}_logistic"]
                    
            elif transformation_type == 'power':
                if len(params) != 2:
                    raise ValueError(f"Power transformation requires 2 parameters for {media_var}")
                co, pw = params
                
                # Apply adstock
                adstocked = adstock_function(region_df[media_var].values, co)
                region_df[f"{media_var}_adstocked"] = adstocked
                
                # Standardize
                if np.std(adstocked) > 0:
                    standardized = (adstocked - np.mean(adstocked)) / np.std(adstocked)
                else:
                    standardized = adstocked
                
                # Apply power
                region_df[f"{media_var}_power"] = power_function(standardized, pw)
                region_df[f"{media_var}_power"] = np.nan_to_num(region_df[f"{media_var}_power"])
                
                # Final scaling
                if scaler_class:
                    scaler = scaler_class(**scaler_params)
                    region_df[f"{media_var}_transformed"] = scaler.fit_transform(
                        region_df[[f"{media_var}_power"]]
                    )
                else:
                    region_df[f"{media_var}_transformed"] = region_df[f"{media_var}_power"]
        
        # Keep non-scaled variables
        for var in non_scaled_variables:
            if var in region_df.columns:
                region_df[f"non_scaled_{var}"] = region_df[var]
        
        transformed_data_list.append(region_df)
    
    # Add check for empty list
    if not transformed_data_list:
        raise ValueError("No data to transform. Check if regions match your data.")
    
    return pd.concat(transformed_data_list, axis=0).reset_index(drop=True)

def calculate_media_elasticity(
    beta: float,
    growth_rate: float,
    sensitivity: float,
    carryover: float,
    y_mean: float
) -> float:
    """Calculate media elasticity with zero-division protection."""
    # Check for division by zero conditions
    if carryover >= 1.0 or carryover < 0:
        logger.warning(f"Invalid carryover rate: {carryover}")
        return np.nan
    
    if y_mean == 0:
        logger.warning("Y mean is zero, cannot calculate elasticity")
        return np.nan
    
    denominator = (1 - carryover) * y_mean
    if abs(denominator) < 1e-10:  # Near-zero check
        return np.nan
    
    elasticity = (beta * growth_rate * sensitivity) / denominator
    return elasticity


def calculate_contributions(
    coefficients: Dict[str, float],
    variable_means: Dict[str, float],
    variable_ranges: Optional[Dict[str, float]] = None
) -> Dict[str, float]:
    """Calculate variable contributions."""
    contributions = {}
    
    for var, beta in coefficients.items():
        if var == "intercept":
            contributions[var] = beta
        else:
            mean_val = variable_means.get(var, 0)
            if variable_ranges and var in variable_ranges:
                contributions[var] = beta * mean_val * variable_ranges[var]
            else:
                contributions[var] = beta * mean_val
    
    # Calculate percentage contributions
    total_contrib = sum(abs(v) for v in contributions.values())
    contribution_percentages = {}
    
    if total_contrib > 0:
        for var, contrib in contributions.items():
            contribution_percentages[f"{var}_pct"] = (contrib / total_contrib) * 100
    
    contributions.update(contribution_percentages)
    return contributions

def save_dataframe_to_minio(df: pd.DataFrame, file_key: str, format: str = "excel") -> str:
    """Save DataFrame to MinIO - ALWAYS USE dataformodel bucket."""
    if minio_client is None:
        raise Exception("MinIO client not available")
    
    try:
        # ALWAYS USE dataformodel bucket
        bucket = settings.minio_source_bucket  # This is "dataformodel"
        
        # Ensure bucket exists
        if not minio_client.bucket_exists(bucket):
            minio_client.make_bucket(bucket)
            logger.info(f"Created bucket: {bucket}")
        
        if format == "excel":
            # Convert DataFrame to Excel
            excel_buffer = BytesIO()
            with pd.ExcelWriter(excel_buffer, engine='openpyxl') as writer:
                df.to_excel(writer, sheet_name='Data', index=False)
            excel_content = excel_buffer.getvalue()
            
            # Ensure file key has correct extension
            if not file_key.endswith('.xlsx'):
                file_key = file_key.replace('.csv', '.xlsx')
            
            # Upload to MinIO
            excel_buffer.seek(0)
            minio_client.put_object(
                bucket,
                file_key,
                excel_buffer,
                length=len(excel_content),
                content_type="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
                metadata={
                    "upload_date": datetime.now().isoformat(),
                    "rows": str(len(df)),
                    "columns": str(len(df.columns)),
                    "format": "excel"
                }
            )
        else:
            # CSV format (fallback)
            csv_buffer = StringIO()
            df.to_csv(csv_buffer, index=False)
            csv_content = csv_buffer.getvalue()
            
            csv_bytes = BytesIO(csv_content.encode('utf-8'))
            csv_bytes.seek(0)
            
            minio_client.put_object(
                bucket,
                file_key,
                csv_bytes,
                length=len(csv_content.encode('utf-8')),
                content_type="text/csv",
                metadata={
                    "upload_date": datetime.now().isoformat(),
                    "rows": str(len(df)),
                    "columns": str(len(df.columns)),
                    "format": "csv"
                }
            )
        
        logger.info(f"Saved DataFrame to MinIO bucket '{bucket}' as {format}: {file_key}")
        return file_key
        
    except Exception as e:
        logger.error(f"Error saving DataFrame to MinIO: {e}")
        raise

async def save_transformation_metadata(transform_id: str, metadata: Dict[str, Any]):
    """Save transformation metadata to existing MongoDB build collection."""
    if build_collection is None:
        raise Exception("MongoDB build collection not available")
    
    doc = {
        "_id": f"marketing_transform_{transform_id}",
        "type": "marketing_transformation",
        "created_at": datetime.now(),
        **metadata
    }
    await build_collection.insert_one(doc)
    logger.info(f"Saved transformation metadata for ID: {transform_id}")

async def get_transformation_metadata(transform_id: str) -> Dict[str, Any]:
    """Retrieve transformation metadata from MongoDB."""
    if build_collection is None:
        raise Exception("MongoDB build collection not available")
    
    doc = await build_collection.find_one({"_id": f"marketing_transform_{transform_id}"})
    if not doc:
        raise ValueError(f"Transformation metadata not found for ID: {transform_id}")
    return doc

def get_file_from_source(file_key: str) -> BytesIO:
    """Get file from MinIO - ALWAYS USE dataformodel bucket."""
    if minio_client is None:
        raise Exception("MinIO client not available")
    
    try:
        # ALWAYS USE dataformodel bucket
        bucket = settings.minio_source_bucket  # This is "dataformodel"
        
        response = minio_client.get_object(bucket, file_key)
        data = BytesIO(response.read())
        response.close()
        response.release_conn()
        data.seek(0)
        logger.info(f"Successfully retrieved file from bucket '{bucket}': {file_key}")
        return data
    except Exception as e:
        logger.error(f"Error getting file from MinIO bucket '{bucket}': {e}")
        raise

def calculate_model_metrics(y_true: np.ndarray, y_pred: np.ndarray, n_features: int) -> Dict[str, float]:
    """Calculate all model metrics with zero-division protection."""
    n_samples = len(y_true)
    
    # Protect against insufficient samples
    if n_samples <= n_features + 1:
        logger.warning(f"Insufficient samples ({n_samples}) for {n_features} features")
        return {
            "mape": np.inf,
            "r2": -np.inf,
            "adjusted_r2": -np.inf,
            "aic": np.inf,
            "bic": np.inf,
            "rss": np.inf,
            "n_samples": n_samples,
            "n_features": n_features
        }
    
    # Basic metrics with protection
    try:
        mape = mean_absolute_percentage_error(y_true, y_pred)
    except (ValueError, ZeroDivisionError):
        mape = np.inf
    
    r2 = r2_score(y_true, y_pred)
    
    # Adjusted R2 with zero-division protection
    denominator = n_samples - n_features - 1
    if denominator > 0:
        adjusted_r2 = 1 - ((1 - r2) * (n_samples - 1) / denominator)
    else:
        adjusted_r2 = -np.inf
    
    # Information criteria
    rss = np.sum((y_true - y_pred) ** 2)
    if n_samples > 0 and rss > 0:
        aic = n_samples * np.log(rss / n_samples) + 2 * n_features
        bic = n_samples * np.log(rss / n_samples) + np.log(n_samples) * n_features
    else:
        aic = np.inf
        bic = np.inf
    
    return {
        "mape": float(mape),
        "r2": float(r2),
        "adjusted_r2": float(adjusted_r2),
        "aic": float(aic),
        "bic": float(bic),
        "rss": float(rss),
        "n_samples": n_samples,
        "n_features": n_features
    }