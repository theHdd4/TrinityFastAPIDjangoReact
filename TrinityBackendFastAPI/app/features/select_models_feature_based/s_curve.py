import pandas as pd
import numpy as np
from datetime import datetime, timedelta
from typing import Dict, List, Any, Optional, Tuple
import logging
from bson import ObjectId
import io
from .database import client

logger = logging.getLogger(__name__)
# Disable logging for S-curve
logger.disabled = True

def generate_scaled_media_series(recent_series: List[float], x_range: List[float]) -> Tuple[List[List[float]], List[float]]:
    """
    Generate scaled media series around the base series.
    
    Args:
        recent_series: Base series values
        x_range: List of percentage changes (e.g., [-170, -153, 0, 153, 170])
    
    Returns:
        Tuple of (scaled_series_list, percent_changes)
    """
    scaled_series_list = []
    percent_changes = []
    for x in x_range:
        # Convert percentage to decimal for scaling (e.g., 170 -> 1.7, -170 -> -1.7)
        decimal_change = x / 100.0
        new_series = [v * (1 + decimal_change) for v in recent_series]
        scaled_series_list.append(new_series)
        percent_changes.append(x) 
    return scaled_series_list, percent_changes

def apply_transformation_steps(series: List[float], transformation_steps: List[Dict[str, Any]]) -> List[float]:
    """
    Apply transformation steps in sequence as they were applied in the model.
    
    Args:
        series: Input series values
        transformation_steps: List of transformation steps with parameters
    
    Returns:
        Transformed series
    """
    current_series = series.copy()
    
    for step in transformation_steps:
        step_type = step.get('step', '')

        if step_type == 'adstock':
            # Adstock transformation: apply decay rate
            decay_rate = step.get('decay_rate', 0.4)
            adstock_series = []
            for i, value in enumerate(current_series):
                if i == 0:
                    adstock_series.append(value)
                else:
                    adstock_value = value + decay_rate * adstock_series[i-1]
                    adstock_series.append(adstock_value)
            current_series = adstock_series
            logger.info(f"🔍 Current series after adstock transformation: {current_series}")
        
        elif step_type == 'standardization':
            # Standard scaling: (x - scaler_mean) / scaler_scale
            scaler_mean = step.get('scaler_mean', 0)
            scaler_scale = step.get('scaler_scale', 1)
            logger.info(f"🔍 Standardization: scaler_mean={scaler_mean}, scaler_scale={scaler_scale}")
            if scaler_scale == 0:
                current_series = [0.0] * len(current_series)
            else:
                current_series = [(x - scaler_mean) / scaler_scale for x in current_series]
            logger.info(f"🔍 Current series after standardization: {current_series}")

        elif step_type == 'logistic':
            # Logistic transformation: 1 / (1 + exp(-growth_rate * (x - midpoint)))
            growth_rate = step.get('growth_rate', 1.0)
            midpoint = step.get('midpoint', 0.0)
            carryover = step.get('carryover', 0.0)
            current_series = [1 / (1 + np.exp(-growth_rate * (x - midpoint)))  for x in current_series]
        
            # logger.info(f"current series after logistic transformation: {current_series}")
        
        elif step_type == 'minmax':
            # MinMax scaling: (x - scaler_min) / scaler_scale
            scaler_min = step.get('scaler_min', 0)
            scaler_scale = step.get('scaler_scale', 1)
            if scaler_scale == 0:
                current_series = [0.0] * len(current_series)
            else:
                current_series = [(x - scaler_min) / scaler_scale for x in current_series]
            # logger.info(f"🔍 Current series after MinMax scaling: {current_series}")
            # logger.info(f"🔍 Scaler min: {scaler_min}, scaler scale: {scaler_scale}")
        
 
    
        

    
    return current_series

def get_last_12_months_data(df: pd.DataFrame, date_column: str, combination_id: str) -> pd.DataFrame:
    """
    Get the last 12 months of data for a specific combination.
    
    Args:
        df: Source dataframe
        date_column: Name of the date column
        combination_id: Combination ID to filter by
    
    Returns:
        Filtered dataframe with last 12 months of data
    """
    # Filter by combination_id if the column exists
    if 'combination_id' in df.columns:
        df_filtered = df[df['combination_id'] == combination_id].copy()
    else:
        df_filtered = df.copy()
    
    if df_filtered.empty:
        return df_filtered
    
    # Convert date column to datetime (retain original order)
    df_filtered[date_column] = pd.to_datetime(df_filtered[date_column], errors='coerce')
    df_filtered = df_filtered.dropna(subset=[date_column])

    if df_filtered.empty:
        return df_filtered

    # Do NOT sort here; simply take the last 12 rows in the existing order
    # This honors the original dataset ordering as requested
    df_last_12_months = df_filtered.tail(12).copy()

    return df_last_12_months

def get_roi_variables_from_config(roi_config: Dict[str, Any]) -> List[str]:
    """
    Extract ROI variables from the ROI configuration.
    
    Args:
        roi_config: ROI configuration dictionary
    
    Returns:
        List of ROI variable names
    """
    roi_variables = []
    
    # Get ROI variables from roiVariables list
    if 'roiVariables' in roi_config and isinstance(roi_config['roiVariables'], list):
        roi_variables.extend(roi_config['roiVariables'])
    
    # Get ROI variables from features dict
    if 'features' in roi_config and isinstance(roi_config['features'], dict):
        for feature_name, feature_config in roi_config['features'].items():
            if isinstance(feature_config, dict) and feature_config.get('enabled', False):
                roi_variables.append(feature_name)
    
    # Remove duplicates and return
    return list(set(roi_variables))

async def get_transformation_metadata_from_mongodb(db, client_name: str, app_name: str, project_name: str, combination_name: str, model_name: str) -> Dict[str, Any]:
    """
    Get transformation metadata from MongoDB for a specific model.
    
    Args:
        db: MongoDB database connection
        client_name: Client name
        app_name: App name
        project_name: Project name
        combination_name: Combination name
        model_name: Model name
    
    Returns:
        Dictionary containing transformation metadata
    """
    
    try:
        # Get the build configuration from MongoDB (same as actual vs predicted endpoint)
        document_id = f"{client_name}/{app_name}/{project_name}"
        # logger.info(f"🔍 Querying MongoDB for document_id: {document_id}")
        build_config = await db["build-model_featurebased_configs"].find_one({"_id": document_id})
        
        if not build_config:
            logger.warning(f"⚠️ No build configuration found for {document_id}")
            logger.info(f"🔍 Available collections in database: {await db.list_collection_names()}")
            return {}
        
         
        # Get transformation metadata for the specified combination and model
        # The transformation metadata is stored in model_coefficients[combination][model]["transformation_metadata"]
        model_coefficients = build_config.get("model_coefficients", {})
        logger.info(f"🔍 Model coefficients keys: {list(model_coefficients.keys())}")
        
        combination_coefficients = model_coefficients.get(combination_name, {})

        
        model_coeffs = combination_coefficients.get(model_name, {})
        
        if not model_coeffs:
            logger.warning(f"⚠️ No model coefficients found for combination '{combination_name}' and model '{model_name}'")
            logger.info(f"🔍 Available combinations: {list(model_coefficients.keys())}")
            if combination_name in model_coefficients:
                logger.info(f"🔍 Available models for '{combination_name}': {list(model_coefficients[combination_name].keys())}")
            return {}
        
        transformation_metadata = model_coeffs.get("transformation_metadata", {})

        
        if not transformation_metadata:
            logger.warning(f"⚠️ No transformation metadata found for combination '{combination_name}' and model '{model_name}'")
            return {}
        
        
        return transformation_metadata
        
    except Exception as e:
        logger.error(f"❌ Error getting transformation metadata from MongoDB: {str(e)}")
        import traceback
        logger.error(f"❌ Traceback: {traceback.format_exc()}")
        return {}

async def get_model_coefficients_from_mongodb(db, client_name: str, app_name: str, project_name: str, combination_name: str, model_name: str) -> Dict[str, Any]:
    """
    Get model coefficients (intercept, betas) from MongoDB for a specific model.
    
    Args:
        db: MongoDB database connection
        client_name: Client name
        app_name: App name
        project_name: Project name
        combination_name: Combination name
        model_name: Model name
    
    Returns:
        Dictionary containing model coefficients
    """
    try:
        # Get the build configuration from MongoDB (same as actual vs predicted endpoint)
        document_id = f"{client_name}/{app_name}/{project_name}"
        # logger.info(f"🔍 Querying MongoDB for document_id: {document_id}")
        build_config = await db["build-model_featurebased_configs"].find_one({"_id": document_id})
        
        if not build_config:
            logger.warning(f"⚠️ No build configuration found for {document_id}")
            logger.info(f"🔍 Available collections in database: {await db.list_collection_names()}")
            return {}, None
        
        logger.info(f"✅ Build configuration found")
        
        # Get model coefficients for the specified combination and model
        model_coefficients = build_config.get("model_coefficients", {})
        
        # Log all available combinations for debugging
        logger.info(f"🔍 Searching for combination: '{combination_name}' and model: '{model_name}'")
        logger.info(f"🔍 All available combinations in MongoDB: {list(model_coefficients.keys())}")
        
        # Try exact match first
        combination_coefficients = model_coefficients.get(combination_name, {})
        
        # If exact match fails, try case-insensitive and whitespace-normalized matching
        if not combination_coefficients:
            logger.warning(f"⚠️ Exact match failed for combination '{combination_name}', trying fuzzy match...")
            # Normalize the search key (lowercase, strip whitespace)
            normalized_search = combination_name.strip().lower()
            for key in model_coefficients.keys():
                normalized_key = key.strip().lower()
                if normalized_key == normalized_search:
                    logger.info(f"✅ Found combination using fuzzy match: '{key}' (searched for '{combination_name}')")
                    combination_coefficients = model_coefficients[key]
                    break
        
        if not combination_coefficients:
            logger.warning(f"⚠️ No combination found matching '{combination_name}'")
            logger.info(f"🔍 Available combinations (with details):")
            for combo_key in model_coefficients.keys():
                models_in_combo = list(model_coefficients[combo_key].keys()) if isinstance(model_coefficients[combo_key], dict) else []
                logger.info(f"   - '{combo_key}' (models: {models_in_combo})")
            return {}, build_config
        
        logger.info(f"✅ Found combination, available models: {list(combination_coefficients.keys())}")
        
        # Try exact match for model name
        model_coeffs = combination_coefficients.get(model_name, {})
        
        # If exact match fails, try case-insensitive and whitespace-normalized matching
        if not model_coeffs:
            logger.warning(f"⚠️ Exact match failed for model '{model_name}', trying fuzzy match...")
            normalized_search = model_name.strip().lower()
            for key in combination_coefficients.keys():
                normalized_key = key.strip().lower()
                if normalized_key == normalized_search:
                    logger.info(f"✅ Found model using fuzzy match: '{key}' (searched for '{model_name}')")
                    model_coeffs = combination_coefficients[key]
                    break
        
        logger.info(f"🔍 Model '{model_name}' coefficients: {list(model_coeffs.keys()) if model_coeffs else 'Not found'}")
        
        if not model_coeffs:
            logger.warning(f"⚠️ No coefficients found for combination '{combination_name}' and model '{model_name}'")
            logger.info(f"🔍 Available models for this combination: {list(combination_coefficients.keys())}")
            logger.info(f"🔍 Model name searched: '{model_name}' (normalized: '{model_name.strip().lower()}')")
            logger.info(f"🔍 Available model names (normalized): {[k.strip().lower() for k in combination_coefficients.keys()]}")
            return {}, build_config
        
        # Extract model coefficients
        coefficients = {
            'intercept': model_coeffs.get('intercept', 0),
            'betas': model_coeffs.get('coefficients', {}),
            'x_variables': model_coeffs.get('x_variables', [])
        }
        
        
        return coefficients, build_config
        
    except Exception as e:
        logger.error(f"❌ Error getting model coefficients from MongoDB: {str(e)}")
        import traceback
        logger.error(f"❌ Traceback: {traceback.format_exc()}")
        return {}, None

def calculate_transformed_means(df: pd.DataFrame, transformation_metadata: Dict[str, Any]) -> tuple[Dict[str, float], Dict[str, Any]]:
    """
    Calculate transformed means for all variables using 12-month data mean and std.
    Override transformation metadata scaler_mean and scaler_scale with 12-month data.
    
    Args:
        df: Original dataframe with 12 months data
        transformation_metadata: Transformation metadata for each variable
    
    Returns:
        Tuple of (transformed_means, modified_transformation_metadata)
    """
    transformed_means = {}
    modified_transformation_metadata = {}
    
    for variable, metadata in transformation_metadata.items():
        if variable not in df.columns:
            continue
            
        # Get original series from 12-month data
        original_series = df[variable].fillna(0).tolist()
        
        if not original_series:
            continue
        
        # Calculate adstocked original mean/std for use in standardization (Streamlit-aligned)
        transformation_steps = metadata.get('transformation_steps', [])
        adstock_mean = None
        adstock_std = None
        try:
            adstock_step = next((s for s in transformation_steps if s.get('step') == 'adstock'), None)
            if adstock_step:
                decay_rate = adstock_step.get('decay_rate', 0.4)
                adstocked = []
                for i, v in enumerate(original_series):
                    if i == 0:
                        adstocked.append(v)
                    else:
                        adstocked.append(v + decay_rate * adstocked[i-1])
                adstock_mean = float(np.mean(adstocked))
                adstock_std = float(np.std(adstocked))
            else:
                # Fallback to raw series stats if no adstock step exists
                adstock_mean = float(np.mean(original_series))
                adstock_std = float(np.std(original_series))
        except Exception:
            adstock_mean = float(np.mean(original_series))
            adstock_std = float(np.std(original_series))

        logger.info(f"🔍 Standardization for {variable} will use adstock stats: mean={adstock_mean:.4f}, std={adstock_std:.4f}")

        # Override standardization steps with adstock stats
        modified_steps = []
        for step in transformation_steps:
            if step.get('step') == 'standardization':
                modified_step = step.copy()
                modified_step['scaler_mean'] = adstock_mean
                modified_step['scaler_scale'] = adstock_std if adstock_std != 0 else 1.0
                modified_steps.append(modified_step)
            else:
                modified_steps.append(step)
        
        # Store modified transformation metadata
        modified_transformation_metadata[variable] = {
            **metadata,
            'transformation_steps': modified_steps
        }
        
        # Apply modified transformations
        transformed_series = apply_transformation_steps(original_series, modified_steps)
        
        # Calculate mean of transformed series
        transformed_means[variable] = np.mean(transformed_series)
        # logger.info(f"🔍 Transformed mean for {variable}: {transformed_means[variable]}")
    
    return transformed_means, modified_transformation_metadata

def transform_12month_and_save_parameters(df_12month: pd.DataFrame, transformation_metadata: Dict[str, Any]) -> tuple[Dict[str, float], Dict[str, Any]]:
    """
    Transform 12-month data step by step and save all parameters for S-curve use.
    
    Args:
        df_12month: 12-month dataframe
        transformation_metadata: Original transformation metadata
    
    Returns:
        Tuple of (transformed_means, saved_transformation_metadata)
    """
    transformed_means = {}
    saved_transformation_metadata = {}
    
    for variable, metadata in transformation_metadata.items():
        if variable not in df_12month.columns:
            continue
            
        # Get original series from 12-month data
        original_series = df_12month[variable].fillna(0).tolist()
        
        if not original_series:
            continue
        
        # logger.info(f"🔍 Transforming 12-month data for {variable}...")
        
        # Apply transformations step by step and save parameters
        transformation_steps = metadata.get('transformation_steps', [])
        current_series = original_series.copy()
        saved_steps = []
        
        # Track adstock stats from original after adstock step
        adstock_stats = None  # (mean, std)

        for step in transformation_steps:
            step_type = step.get('step', '')
            # logger.info(f"🔍 Applying {step_type} transformation to {variable}...")
            
            if step_type == 'adstock':
                # Use original decay_rate, apply transformation
                decay_rate = step.get('decay_rate', 0.1)
                adstock_series = []
                for i, value in enumerate(current_series):
                    if i == 0:
                        adstock_series.append(value)
                    else:
                        adstock_value = value + decay_rate * adstock_series[i-1]
                        adstock_series.append(adstock_value)
                current_series = adstock_series
                
                # Save parameters
                saved_steps.append({
                    'step': 'adstock',
                    'decay_rate': decay_rate
                })
                # logger.info(f"🔍 Adstock applied - decay_rate: {decay_rate}")

                # Capture adstock stats for use in standardization
                try:
                    adstock_mean = float(np.mean(current_series))
                    adstock_std = float(np.std(current_series))
                    adstock_stats = (adstock_mean, adstock_std)
                except Exception:
                    adstock_stats = None
                
            elif step_type == 'logistic':
                # Use original parameters, apply transformation
                growth_rate = step.get('growth_rate', 1.0)
                midpoint = step.get('midpoint', 0.0)
                # Do NOT add carryover at logistic step; carryover is handled via adstock
                logistic_series = [1 / (1 + np.exp(-growth_rate * (x - midpoint))) for x in current_series]
                current_series = logistic_series
                
                # Save parameters
                saved_steps.append({
                    'step': 'logistic',
                    'growth_rate': growth_rate,
                    'midpoint': midpoint
                })
                # logger.info(f"🔍 Logistic applied - growth_rate: {growth_rate}, midpoint: {midpoint}")
                
            elif step_type == 'standardization':
                # Use adstock stats if available to align with Streamlit behavior
                if adstock_stats is not None:
                    data_mean, data_std = adstock_stats
                else:
                    data_mean = np.mean(current_series)
                    data_std = np.std(current_series)
                if data_std == 0:
                    standardized_series = [0.0] * len(current_series)
                else:
                    standardized_series = [(x - data_mean) / data_std for x in current_series]
                current_series = standardized_series
                
                # Save fresh parameters
                saved_steps.append({
                    'step': 'standardization',
                    'scaler_mean': data_mean,
                    'scaler_scale': data_std if data_std != 0 else 1.0
                })
                # logger.info(f"🔍 Standardization applied - fresh mean: {data_mean:.4f}, fresh std: {data_std:.4f}")
                
            elif step_type == 'minmax':
                # Calculate fresh parameters from current series
                data_min = np.min(current_series)
                data_max = np.max(current_series)
                data_scale = data_max - data_min
                if data_scale == 0:
                    minmax_series = [0.0] * len(current_series)
                else:
                    minmax_series = [(x - data_min) / data_scale for x in current_series]
                current_series = minmax_series
                
                # Save fresh parameters
                saved_steps.append({
                    'step': 'minmax',
                    'scaler_min': data_min,
                    'scaler_max': data_max,
                    'scaler_scale': data_scale if data_scale != 0 else 1.0
                })
                # logger.info(f"🔍 MinMax applied - fresh min: {data_min:.4f}, fresh max: {data_max:.4f}")
        
        # Calculate transformed mean
        transformed_means[variable] = np.mean(current_series)

        
        # Save transformation metadata with all parameters
        saved_transformation_metadata[variable] = {
            'transformation_steps': saved_steps
        }
        
        # logger.info(f"✅ Saved transformation metadata for {variable} with {len(saved_steps)} steps")
    
    return transformed_means, saved_transformation_metadata

def calculate_volume_series(
    scaled_series: List[float], 
    variable_name: str,
    intercept: float,
    betas: Dict[str, float],
    transformed_means: Dict[str, float],
    transformation_metadata: Dict[str, Any]
) -> List[float]:
    """
    Calculate volume series using the complete model equation.
    
    The prediction formula is:
    Volume = Intercept + (Target_Variable × Beta_Target) + Σ(Other_Variable_Mean × Beta_Other)
    
    Args:
        scaled_series: Scaled series for the variable of interest
        variable_name: Name of the variable for which we're calculating volume
        intercept: Model intercept
        betas: Model coefficients (betas)
        transformed_means: Transformed means for all variables
        transformation_metadata: Transformation metadata
    
    Returns:
        List of volume values
    """
    # Apply transformations to the scaled series
    if variable_name in transformation_metadata:
        transformation_steps = transformation_metadata[variable_name].get('transformation_steps', [])
        transformed_scaled_series = apply_transformation_steps(scaled_series, transformation_steps)
    else:
        transformed_scaled_series = scaled_series
    
    # Find the beta for the variable of interest
    variable_beta = None
    for var_name, beta in betas.items():
        actual_var_name = var_name.replace("Beta_", "").lower()
        if actual_var_name == variable_name.lower():
            variable_beta = beta
            break
    
    if variable_beta is None:
        logger.warning(f"⚠️ No beta found for variable {variable_name}")
        return [intercept] * len(transformed_scaled_series)

    # If the target beta is negative, clamp it to zero as per requirement
    if variable_beta < 0:
        logger.info(f"🔧 Clamping negative beta for '{variable_name}' from {variable_beta:.4f} to 0.0")
        variable_beta = 0.0
    
    # Calculate the constant contribution from all other variables
    # This represents the baseline contribution when the target variable is at its mean
    other_variables_contribution = 0.0
    for var_name, beta in betas.items():
        actual_var_name = var_name.replace("Beta_", "").lower()
        if actual_var_name != variable_name.lower():
            # Use transformed mean for this variable
            if actual_var_name in transformed_means:
                other_variables_contribution += transformed_means[actual_var_name] * beta
                logger.info(f"🔍 Other variable '{actual_var_name}': mean={transformed_means[actual_var_name]:.4f}, beta={beta:.4f}, contribution={transformed_means[actual_var_name] * beta:.4f}")
            else:
                logger.warning(f"⚠️ No transformed mean found for other variable '{actual_var_name}'")
    
    logger.info(f"🔍 Target variable '{variable_name}': beta={variable_beta:.4f}")
    logger.info(f"🔍 Other variables total contribution: {other_variables_contribution:.4f}")
    
    # Calculate volume for each point using the complete model equation:
    # Volume = Intercept + (Target_Variable × Beta_Target) + Σ(Other_Variable_Mean × Beta_Other)
    volume_series = []
    for i, transformed_value in enumerate(transformed_scaled_series):
        volume = intercept + (transformed_value * variable_beta) + other_variables_contribution
        volume_series.append(volume)
        if i == 0:  # Log first calculation for debugging
            logger.info(f"🔍 First volume calculation: intercept={intercept:.4f} + (target={transformed_value:.4f} × {variable_beta:.4f}) + others={other_variables_contribution:.4f} = {volume:.4f}")

    
    return volume_series

def find_diminishing_point(media_values: List[float], predictions: List[float]) -> Tuple[float, float]:
    """
    Find the point where the curve starts to diminish in the second half.
    Based on the original Streamlit implementation.
    
    Args:
        media_values: List of media investment values (dummy_media_values)
        predictions: List of corresponding volume predictions
    
    Returns:
        Tuple of (diminishing_point_value, diminishing_point_prediction)
    """
    import numpy as np
    
    slopes = np.diff(predictions) / np.diff(media_values)
    second_half_start = len(slopes) // 2
    second_half_slopes = slopes[second_half_start:]
    diminishing_point_index = np.argmax(second_half_slopes < np.percentile(second_half_slopes, 70))
    diminishing_point_value = media_values[second_half_start + diminishing_point_index]
    diminishing_point_prediction = predictions[second_half_start + diminishing_point_index]
    return diminishing_point_value, diminishing_point_prediction

def find_start_point(media_values: List[float], predictions: List[float]) -> Tuple[float, float]:
    """
    Find the start point where the curve begins to show meaningful response.
    Based on the original Streamlit implementation.
    
    Args:
        media_values: List of media investment values (dummy_media_values)
        predictions: List of corresponding volume predictions
    
    Returns:
        Tuple of (start_point_value, start_point_prediction)
    """
    import numpy as np
    
    slopes = np.diff(predictions) / np.diff(media_values)
    
    # Define first half dynamically
    first_half_start = len(slopes) // 4  # Adjust starting point
    first_half_end = len(slopes) // 2    # Midpoint as the end of first half
    
    first_half_slopes = slopes[first_half_start:first_half_end]
    
    # Compute the threshold (30th percentile)
    threshold = np.percentile(first_half_slopes, 30)
    
    # Find the first index where the slope is above the threshold
    valid_indices = np.where(first_half_slopes > threshold)[0]
    
    if len(valid_indices) > 0:
        diminishing_point_index = valid_indices[0]  # First valid index
    else:
        diminishing_point_index = 0  # Default to 0 if no valid index is found
    
    start_point_value = media_values[first_half_start + diminishing_point_index]
    start_point_prediction = predictions[first_half_start + diminishing_point_index]
    
    return start_point_value, start_point_prediction

async def get_s_curve_endpoint(
    client_name: str,
    app_name: str,
    project_name: str,
    combination_name: str,
    model_name: str,
    db=None,
    minio_client=None,
    MINIO_BUCKET: str = "main-bucket"
) -> Dict[str, Any]:
    """
    Generate S-curve data for media variables with ROI calculations.
    
    Args:
        client_name: Client name
        app_name: App name
        project_name: Project name
        combination_name: Combination name
        model_name: Model name
        db: MongoDB database connection
        minio_client: MinIO client
        MINIO_BUCKET: MinIO bucket name
    
    Returns:
        Dictionary containing S-curve data for each media variable
    """

    
    try:
        # Get transformation metadata from MongoDB
        # logger.info(f"🔍 Getting transformation metadata from MongoDB...")
        transformation_metadata = await get_transformation_metadata_from_mongodb(
            db, client_name, app_name, project_name, combination_name, model_name
        )
 
        try:
            if  transformation_metadata:
                logger.info(f"🔍 Transformation metadata: {transformation_metadata}")
        except Exception as e:
            logger.warning(f"⚠️ No transformation metadata found for {client_name}/{app_name}/{project_name}/{combination_name}/{model_name}")
            raise Exception(f"No transformation metadata found for {client_name}/{app_name}/{project_name}/{combination_name}/{model_name}")
            return {
                "success": False,
                "error": "No transformation metadata found",
                "s_curves": {}
            }
        
        # Check if this is an ensemble model
        is_ensemble = model_name.lower() in ['ensemble', 'weighted ensemble', 'ensemble model']
        
        if is_ensemble:
            logger.info(f"🔍 Detected ensemble model, calculating weighted ensemble metrics...")
            # For ensemble models, use the dedicated ensemble metric calculation module
            try:
                from .ensemble_metric_calculation import (
                    calculate_weighted_ensemble_metrics,
                    get_ensemble_build_config,
                    get_individual_results_file_key
                )
                
                # Get build configuration
                build_config = await get_ensemble_build_config(db, client_name, app_name, project_name)
                if not build_config:
                    return {
                        "success": False,
                        "error": f"No build configuration found for {client_name}/{app_name}/{project_name}",
                        "s_curves": {}
                    }
                
                # Get individual results file key
                individual_results_file_key = get_individual_results_file_key(build_config)
                if not individual_results_file_key:
                    return {
                        "success": False,
                        "error": "No individual results file key found in build configuration",
                        "s_curves": {}
                    }
                
                # Calculate weighted ensemble metrics
                ensemble_metrics_result = await calculate_weighted_ensemble_metrics(
                    db, client_name, app_name, project_name, combination_name, individual_results_file_key
                )
                
                if not ensemble_metrics_result["success"]:
                    return {
                        "success": False,
                        "error": ensemble_metrics_result["error"],
                        "s_curves": {}
                    }
                
                ensemble_metrics = ensemble_metrics_result["metrics"]
                
                # Convert to model coefficients format
                model_coefficients = {
                    "intercept": ensemble_metrics["intercept"],
                    "betas": ensemble_metrics["coefficients"],
                    "x_variables": ensemble_metrics["x_variables"],
                    "y_variable": ensemble_metrics["y_variable"]
                }
                
                # Update transformation metadata with weighted values
                transformation_metadata = ensemble_metrics["transformation_metadata"]

                
            except Exception as e:
                logger.error(f"❌ Error calculating ensemble metrics: {str(e)}")
                return {
                    "success": False,
                    "error": f"Error calculating ensemble metrics: {str(e)}",
                    "s_curves": {}
                }
        else:
            # Regular model - get coefficients from MongoDB
            logger.info(f"🔍 Getting model coefficients from MongoDB...")
            try:
                model_coefficients, build_config = await get_model_coefficients_from_mongodb(
                    db, client_name, app_name, project_name, combination_name, model_name
                )
                
                # Check if we got valid coefficients
                if not model_coefficients or not build_config:
                    logger.warning(f"⚠️ No model coefficients or build config found for {combination_name}/{model_name}")
                    return {
                        "success": False,
                        "error": f"No model coefficients found for combination '{combination_name}' and model '{model_name}'",
                        "s_curves": {}
                    }
            except ValueError as ve:
                # Handle unpacking errors
                logger.error(f"❌ Error unpacking model coefficients: {str(ve)}")
                return {
                    "success": False,
                    "error": f"Error getting model coefficients: {str(ve)}",
                    "s_curves": {}
                }
            except Exception as e:
                logger.error(f"❌ Error getting model coefficients: {str(e)}")
                return {
                    "success": False,
                    "error": f"Error getting model coefficients: {str(e)}",
                    "s_curves": {}
                }
        
        
        # Get ROI configuration from the already fetched build_config
        roi_config = {}
        try:
            if build_config:
                # Get ROI config from the top level of build configuration
                roi_config = build_config.get("roi_config", {})
            else:
                logger.warning(f"⚠️ No build config available for ROI config extraction")
        except Exception as e:
            logger.error(f"Error getting ROI config from build_config: {str(e)}")
        

        roi_variables = get_roi_variables_from_config(roi_config)
  
        
        if not roi_variables:
            logger.warning(f"⚠️ No ROI variables found in model configuration")
            return {
                "success": False,
                "error": "No ROI variables found in model configuration",
                "s_curves": {}
            }
        
        # Get source file path from the already fetched build_config
        logger.info(f"🔍 Getting source file path from build configuration...")
        source_file_key = None
        try:

            # Get the source file key for this combination
            combination_file_keys = build_config.get("combination_file_keys", [])
            logger.info(f"🔍 Found {len(combination_file_keys)} combination file keys")
            for combo_info in combination_file_keys:
                if combo_info.get("combination") == combination_name:
                    source_file_key = combo_info.get("file_key")
                    # logger.info(f"✅ Found source file key for combination '{combination_name}': {source_file_key}")
                    break
            
            if not source_file_key:
                logger.warning(f"⚠️ No source file key found for combination '{combination_name}'")
                return {
                    "success": False,
                    "error": f"No source file key found for combination '{combination_name}'",
                    "s_curves": {}
                }
                
        except Exception as e:
            logger.error(f"Error getting source file path: {str(e)}")
            return {
                "success": False,
                "error": "Could not determine source file path",
                "s_curves": {}
            }
        
        # Download source file from MinIO
        logger.info(f"🔍 Downloading source file from MinIO: {source_file_key}")
        if not minio_client:
            logger.error(f"❌ MinIO client not available")
            return {
                "success": False,
                "error": "MinIO client not available",
                "s_curves": {}
            }
        
        try:
            response = minio_client.get_object(MINIO_BUCKET, source_file_key)
            content = response.read()
            response.close()
            response.release_conn()
            logger.info(f"✅ File downloaded successfully, size: {len(content)} bytes")
            
            # Read file based on extension
            logger.info(f"🔍 Reading file with extension: {source_file_key.split('.')[-1]}")
            if source_file_key.endswith(".csv"):
                df = pd.read_csv(io.BytesIO(content))
            elif source_file_key.endswith(".xlsx"):
                df = pd.read_excel(io.BytesIO(content))
            elif source_file_key.endswith(".arrow"):
                import pyarrow as pa
                import pyarrow.ipc as ipc
                reader = ipc.RecordBatchFileReader(pa.BufferReader(content))
                df = reader.read_all().to_pandas()
            else:
                logger.error(f"❌ Unsupported file type: {source_file_key}")
                return {
                    "success": False,
                    "error": f"Unsupported file type: {source_file_key}",
                    "s_curves": {}
                }

        except Exception as e:
            logger.error(f"Error reading source file: {str(e)}")
            return {
                "success": False,
                "error": f"Error reading source file: {str(e)}",
                "s_curves": {}
            }
        df.columns = df.columns.str.lower()

        date_column = None
        for col in df.columns:
            if col.lower() in ['date', 'time', 'timestamp', 'period', 'month', 'year']:
                date_column = col
                logger.info(f"✅ Found date column: {date_column}")
                break
        
        if not date_column:
            logger.warning(f"⚠️ No date column found in source data")
            return {
                "success": False,
                "error": "No date column found in source data",
                "s_curves": {}
            }
        

        df_last_12_months = get_last_12_months_data(df, date_column, combination_name)
        logger.info(f"✅ Last 12 months data shape: {df_last_12_months.shape}")
        
        if df_last_12_months.empty:
            logger.warning(f"⚠️ No data found for combination {combination_name} in the last 12 months")
            return {
                "success": False,
                "error": f"No data found for combination {combination_name} in the last 12 months",
                "s_curves": {}
            }
        
 
        # Transform 12-month data and save parameters for S-curve use
        # logger.info(f"🔍 Transforming 12-month data and saving parameters...")
        transformed_means, saved_transformation_metadata = transform_12month_and_save_parameters(df_last_12_months, transformation_metadata)
        # logger.info(f"✅ Transformed means calculated for {len(transformed_means)} variables")

        
        # Extract model coefficients
        intercept = model_coefficients.get('intercept', 0)
        betas = model_coefficients.get('betas', {})
        
        # Generate S-curves for each ROI variable
        # logger.info(f"🔍 Generating S-curves for {len(roi_variables)} ROI variables...")
        s_curves = {}
        
        for variable in roi_variables:
            variable = variable.lower()
            if variable not in df_last_12_months.columns:
                logger.warning(f"Variable {variable} not found in source data")
                continue
            
            # Get the recent series for this variable (this is our x_range - original 12 months data)
            original_series = df_last_12_months[variable].fillna(0).tolist()
            
            if not original_series or all(v == 0 for v in original_series):
                logger.warning(f"No valid data for variable {variable}")
                continue
            
            # Generate 51 points so that 0 is guaranteed to be included
            x_range_values = np.linspace(-100, 100, 51).tolist()
            

            scaled_series_list, percent_changes = generate_scaled_media_series(original_series, x_range_values)
            
            # Calculate volume series for each scaled series
            volume_series_list = []
            for scaled_series in scaled_series_list:
                volume_series = calculate_volume_series(
                    scaled_series, 
                    variable, 
                    intercept, 
                    betas, 
                    transformed_means, 
                    saved_transformation_metadata
                )
                volume_series_list.append(volume_series)
            
            # Calculate total volume for each scaled series (sum of all points)
            total_volumes = [sum(volume_series) for volume_series in volume_series_list]
            logger.info(f"🔍 Total volumes: {total_volumes}")
            
            # Find max and min points using the diminishing return analysis
            # We need to use the media values (reach/investment) and predictions separately
            # The media values are the sum of each scaled series (total media investment)
            media_values = [sum(scaled_series) for scaled_series in scaled_series_list]
            # Explicit log for media_values (use CRITICAL so it shows while other logs are suppressed)
            try:
                logger.critical(f"S-CURVE media_values for {variable}: {media_values}")
            except Exception:
                pass
            diminishing_point_value, diminishing_point_prediction = find_diminishing_point(media_values, total_volumes)
            start_point_value, start_point_prediction = find_start_point(media_values, total_volumes)

            # Base/original point at 0% change
            base_idx = None
            try:
                base_idx = percent_changes.index(0)
            except ValueError:
                if percent_changes:
                    base_idx = int(np.argmin([abs(pc) for pc in percent_changes]))
            base_point = None
            if base_idx is not None and 0 <= base_idx < len(media_values):
                base_point = {
                    "media_value": media_values[base_idx],
                    "volume_prediction": total_volumes[base_idx],
                    "percent_change": percent_changes[base_idx]
                }
            
            # Get date range
            date_range = {
                "start": df_last_12_months[date_column].min().isoformat(),
                "end": df_last_12_months[date_column].max().isoformat()
            }
            
            # Store S-curve data
            s_curves[variable] = {
                "original_series": original_series,
                "scaled_series": scaled_series_list,  # Original scaled series (before transformation)
                "volume_series": volume_series_list,  # Volume series for each scaled series
                "total_volumes": total_volumes,       # Total volume for each percentage change
                "media_values": media_values,         # Sum of each scaled series (reach/investment)
                "percent_changes": percent_changes,
                "date_range": date_range,
                "transformation_applied": variable in transformation_metadata,
                "transformation_steps": transformation_metadata.get(variable, {}).get('transformation_steps', []) if variable in transformation_metadata else [],
                "model_info": {
                    "intercept": intercept,
                    "coefficients": betas,
                    "transformed_means": transformed_means
                },
                "curve_analysis": {
                    "max_point": {
                        "media_value": diminishing_point_value,
                        "volume_prediction": diminishing_point_prediction,
                        "percent_change": percent_changes[media_values.index(diminishing_point_value)] if diminishing_point_value in media_values else None
                    },
                    "min_point": {
                        "media_value": start_point_value,
                        "volume_prediction": start_point_prediction,
                        "percent_change": percent_changes[media_values.index(start_point_value)] if start_point_value in media_values else None
                    },
                    "base_point": base_point
                }
            }
           
                
        # logger.info(f"✅ S-curve generation completed successfully for {len(s_curves)} variables")
        return {
            "success": True,
            "combination_name": combination_name,
            "model_name": model_name,
            "roi_variables": roi_variables,
            "x_range": x_range_values,  # 21 series: 10 below + original + 10 above
            "s_curves": s_curves,
            "date_range": {
                "start": df_last_12_months[date_column].min().isoformat(),
                "end": df_last_12_months[date_column].max().isoformat()
            },
            "total_data_points": len(df_last_12_months)
        }
        
    except Exception as e:
        logger.error(f"Error generating S-curve data: {str(e)}")
        return {
            "success": False,
            "error": f"Error generating S-curve data: {str(e)}",
            "s_curves": {}
        }
