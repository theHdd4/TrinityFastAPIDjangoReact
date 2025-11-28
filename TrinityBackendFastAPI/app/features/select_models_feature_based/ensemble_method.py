"""Ensemble methods for the select_models_feature_based feature."""

from __future__ import annotations

import asyncio
import io
import logging
from typing import Any, Dict

import pandas as pd
import numpy as np

from .database import MINIO_BUCKET
from .service import calculate_weighted_ensemble

logger = logging.getLogger("app.features.select_models_feature_based.ensemble_method")


async def _update_weighted_metrics_from_mongodb(
    loop_db, 
    build_config: Dict[str, Any], 
    combination_id: str, 
    weighted_metrics: Dict[str, Any], 
    model_composition: Dict[str, float]
) -> Dict[str, Any]:
    """
    Update weighted_metrics with intercepts and betas fetched from MongoDB.
    This ensures we use actual coefficients instead of deriving from impacts/averages.
    
    Args:
        loop_db: MongoDB database connection
        build_config: Build configuration from MongoDB
        combination_id: Combination ID to filter models
        weighted_metrics: Current weighted metrics (will be updated)
        model_composition: Dictionary of model_name -> weight_share
        
    Returns:
        Updated weighted_metrics dictionary
    """
    # Get model coefficients from MongoDB
    model_coefficients = build_config.get("model_coefficients", {})
    combination_coefficients = model_coefficients.get(combination_id, {})
    
    # Fetch weighted intercept
    weighted_intercept = 0.0
    intercepts_found = 0
    
    # Dictionary to store weighted betas
    weighted_betas_from_mongo = {}
    betas_found = 0
    
    for model_name, weight_share in model_composition.items():
        model_coeffs = combination_coefficients.get(model_name, {})
        
        # Fetch intercept
        intercept = model_coeffs.get("intercept", 0)
        if intercept is not None:
            weighted_intercept += intercept * weight_share
            intercepts_found += 1
        
        # Fetch betas from coefficients
        coefficients = model_coeffs.get("coefficients", {})
        x_variables = model_coeffs.get("x_variables", [])
        
        # Extract betas for each x_variable
        for x_var in x_variables:
            x_var_lower = x_var.lower() if isinstance(x_var, str) else str(x_var).lower()
            
            # Try both beta key patterns (Beta_{var} and {var}_beta)
            beta_key1 = f"Beta_{x_var}"
            beta_key2 = f"{x_var}_beta"
            
            beta_value = None
            if beta_key1 in coefficients:
                beta_value = coefficients[beta_key1]
            elif beta_key2 in coefficients:
                beta_value = coefficients[beta_key2]
            
            if beta_value is not None:
                # Initialize if not exists
                if x_var_lower not in weighted_betas_from_mongo:
                    weighted_betas_from_mongo[x_var_lower] = 0.0
                
                # Add weighted beta
                weighted_betas_from_mongo[x_var_lower] += beta_value * weight_share
                betas_found += 1
    
    # Update intercept in weighted_metrics
    if intercepts_found > 0:
        weighted_metrics["intercept"] = weighted_intercept
        logger.info(f"✅ Updated weighted intercept: {weighted_intercept:.4f} from {intercepts_found} models")
    else:
        logger.warning(f"⚠️ No intercepts found in MongoDB, keeping existing value")
    
    # Update betas in weighted_metrics (override the ones from impact/avg calculation)
    if betas_found > 0:
        for x_var_lower, weighted_beta in weighted_betas_from_mongo.items():
            # Store with both possible key patterns
            weighted_metrics[f"{x_var_lower}_beta"] = weighted_beta
            weighted_metrics[f"Beta_{x_var_lower}"] = weighted_beta
        logger.info(f"✅ Updated weighted betas from MongoDB for {len(weighted_betas_from_mongo)} variables")
    else:
        logger.warning(f"⚠️ No betas found in MongoDB, using betas derived from impacts/averages")
    
    return weighted_metrics


def get_ensemble_actual_vs_predicted(file_key: str, combination_id: str, client_name: str, app_name: str, project_name: str) -> Dict[str, Any]:
    """Calculate actual vs predicted values using ensemble weighted metrics and source file data"""
    logger.info(f"🔍 Getting ensemble actual vs predicted for combination: {combination_id}")
    async def _calculate():
        # Create a new MongoDB client for this event loop to avoid "attached to different loop" errors
        from motor.motor_asyncio import AsyncIOMotorClient
        from .database import MONGO_URI, MONGO_DB, MINIO_ENDPOINT, MINIO_ACCESS_KEY, MINIO_SECRET_KEY, MINIO_SECURE, MINIO_BUCKET
        from minio import Minio
        
        # Create a new MongoDB client for this event loop with proper authentication
        loop_client = AsyncIOMotorClient(
            MONGO_URI,
            serverSelectionTimeoutMS=5000,
            connectTimeoutMS=5000,
            socketTimeoutMS=5000,
            maxPoolSize=10,
            minPoolSize=1
        )
        loop_db = loop_client[MONGO_DB]
        
        # Create a new MinIO client (MinIO is synchronous, but create fresh instance for consistency)
        loop_minio_client = Minio(
            MINIO_ENDPOINT,
            access_key=MINIO_ACCESS_KEY,
            secret_key=MINIO_SECRET_KEY,
            secure=MINIO_SECURE
        )
        
        try:
            document_id = f"{client_name}/{app_name}/{project_name}"
            build_config = await loop_db["build-model_featurebased_configs"].find_one({"_id": document_id})
            
            if not build_config:
                raise ValueError(f"No build configuration found for {document_id}")

            combination_file_keys = build_config.get("combination_file_keys", [])
            source_file_key = None
            for combo_info in combination_file_keys:
                if combo_info.get("combination") == combination_id:
                    source_file_key = combo_info.get("file_key")
                    break
            
            if not source_file_key:
                raise ValueError(f"No source file key found for combination '{combination_id}'")
            
            # Get weighted ensemble data
            ensemble_request = {
                "file_key": file_key,
                "grouping_keys": ['combination_id'],
                "filter_criteria": {"combination_id": combination_id},
                "include_numeric": None,
                "exclude_numeric": None,
                "filtered_models": None
            }
            
            ensemble_result = calculate_weighted_ensemble(ensemble_request)
            
            if not ensemble_result.get("results") or len(ensemble_result["results"]) == 0:
                raise ValueError("No ensemble data found for the given combination")
            
            ensemble_data = ensemble_result["results"][0]
            weighted_metrics = ensemble_data.get("weighted", {})
            model_composition = ensemble_data.get("model_composition", {})
            
            # Update weighted_metrics with intercepts and betas from MongoDB
            logger.info(f"🔍 Fetching intercepts and betas from MongoDB for {len(model_composition)} models...")
            weighted_metrics = await _update_weighted_metrics_from_mongodb(
                loop_db, build_config, combination_id, weighted_metrics, model_composition
            )
            
            # Get weighted transformation metadata
            from .ensemble_metric_calculation import calculate_weighted_transformation_metadata
            
            # Create a mock ensemble_data object for the transformation metadata function
            class MockEnsembleData:
                def __init__(self, weighted, model_composition):
                    self.weighted = weighted
                    self.model_composition = model_composition
            
            mock_ensemble = MockEnsembleData(weighted_metrics, model_composition)
            
            logger.info(f"🔍 Calculating weighted transformation metadata for ensemble...")
            transformation_metadata = await calculate_weighted_transformation_metadata(
                loop_db, client_name, app_name, project_name, combination_id, mock_ensemble
            )
            logger.info(f"✅ Weighted transformation metadata calculated: {len(transformation_metadata)} variables")
            
            # Import apply_transformation_steps from s_curve.py
            try:
                from .s_curve import apply_transformation_steps
            except ImportError:
                apply_transformation_steps = None
            
            # Get the source file data
            response = loop_minio_client.get_object(MINIO_BUCKET, source_file_key)
            content = response.read()
            response.close()
            response.release_conn()
            
            # Read file based on extension (matching old implementation)
            if source_file_key.lower().endswith('.csv'):
                df = pd.read_csv(io.BytesIO(content))
            elif source_file_key.lower().endswith('.xlsx'):
                df = pd.read_excel(io.BytesIO(content))
            elif source_file_key.lower().endswith('.arrow'):
                import pyarrow as pa
                import pyarrow.ipc as ipc
                reader = ipc.RecordBatchFileReader(pa.BufferReader(content))
                df = reader.read_all().to_pandas()
            elif source_file_key.lower().endswith(('.parquet', '.feather')):
                try:
                    df = pd.read_parquet(io.BytesIO(content))
                except:
                    df = pd.read_feather(io.BytesIO(content))
            else:
                # Try common formats as fallback
                try:
                    df = pd.read_csv(io.BytesIO(content))
                except:
                    try:
                        df = pd.read_parquet(io.BytesIO(content))
                    except:
                        df = pd.read_feather(io.BytesIO(content))
            
            # Filter data for the specific combination
            if "combination_id" in df.columns:
                df = df[df["combination_id"] == combination_id]
            
            if df.empty:
                raise ValueError(f"No data found for combination {combination_id}")
            
            df.columns = df.columns.str.lower()
            
            # Find date column
            date_column = None
            for col in df.columns:
                if col.lower() in ['date', "DATE", "Date"]:
                    date_column = col
                    break
            
            # Get dates if available
            dates = []
            if date_column and date_column in df.columns:
                dates = df[date_column].tolist()
            else:
                dates = [f"Period {i+1}" for i in range(len(df))]
            
            # Get the target variable (Y variable)
            y_variable = None
            for col in df.columns:
                if col.lower() in ['target', 'y', 'dependent', 'sales', 'volume', 'value']:
                    y_variable = col
                    break
            
            if not y_variable:
                numeric_cols = df.select_dtypes(include=[np.number]).columns.tolist()
                if numeric_cols:
                    y_variable = numeric_cols[0]
            
            if not y_variable:
                raise ValueError("Could not identify target variable")
            
            # Get ensemble intercept and betas
            intercept = weighted_metrics.get("intercept", 0)
            
            # Extract x_variables from weighted_metrics (variables that have betas)
            x_variables = [key.replace('_beta', '') for key in weighted_metrics.keys() if key.endswith('_beta')]
            # Also try Beta_ pattern
            x_variables.extend([key.replace('Beta_', '') for key in weighted_metrics.keys() if key.startswith('Beta_')])
            # Remove duplicates and convert to lowercase for matching
            x_variables = list(set([x.lower() for x in x_variables if x]))
            
            logger.info(f"🔍 Using {len(x_variables)} x_variables for prediction: {x_variables[:5]}...")
            
            # Calculate predicted values using ensemble betas
            actual_values = df[y_variable].tolist()
            predicted_values = []
            
            # Check if transformations are available
            has_transformations = transformation_metadata and len(transformation_metadata) > 0 and apply_transformation_steps
            
            for index, row in df.iterrows():
                predicted_value = intercept
                
                # Add contribution from each x_variable using ensemble betas
                for x_var in x_variables:
                    # Try to find the column in dataframe (case-insensitive)
                    col = None
                    for df_col in df.columns:
                        if df_col.lower() == x_var.lower():
                            col = df_col
                            break
                    
                    if col is None:
                        continue
                    
                    # Try both beta key patterns
                    beta_key = f"{x_var}_beta"
                    if beta_key not in weighted_metrics:
                        beta_key = f"Beta_{x_var}"
                    
                    if beta_key in weighted_metrics:
                        x_value = row[col] if pd.notna(row[col]) else 0
                        
                        # Apply transformations if available
                        if has_transformations and col in transformation_metadata:
                            transformation_steps = transformation_metadata[col].get('transformation_steps', [])
                            if transformation_steps:
                                try:
                                    transformed_result = apply_transformation_steps([x_value], transformation_steps)
                                    if transformed_result and len(transformed_result) > 0:
                                        x_value = transformed_result[0]
                                except (IndexError, TypeError, ValueError) as e:
                                    logger.warning(f"Transformation failed for {col}: {e}, using original value")
                        
                        beta_value = weighted_metrics[beta_key]
                        contribution = beta_value * x_value
                        predicted_value += contribution
                
                predicted_values.append(predicted_value)
            
            # Filter out extreme outliers
            if len(predicted_values) > 0 and len(actual_values) > 0:
                predicted_array = np.array(predicted_values)
                actual_array = np.array(actual_values)
                
                if len(predicted_array) > 0 and len(actual_array) > 0:
                    try:
                        pred_99th = np.percentile(predicted_array, 99)
                        pred_1st = np.percentile(predicted_array, 1)
                        actual_99th = np.percentile(actual_array, 99)
                        actual_1st = np.percentile(actual_array, 1)
                    except (ValueError, IndexError) as e:
                        logger.warning(f"Error calculating percentiles: {e}, skipping outlier filtering")
                        pred_99th = pred_1st = actual_99th = actual_1st = None
                else:
                    pred_99th = pred_1st = actual_99th = actual_1st = None
                
                filtered_data = []
                if pred_99th is not None and pred_1st is not None and actual_99th is not None and actual_1st is not None:
                    for i, (actual, predicted) in enumerate(zip(actual_values, predicted_values)):
                        if (predicted <= pred_99th and predicted >= pred_1st and 
                            actual <= actual_99th and actual >= actual_1st):
                            filtered_data.append((actual, predicted))
                else:
                    filtered_data = [(a, p) for a, p in zip(actual_values, predicted_values)]
                
                if filtered_data and len(filtered_data) > 0:
                    if len(filtered_data) < len(actual_values):
                        logger.warning(f"⚠️ Filtered out {len(actual_values) - len(filtered_data)} extreme outliers")
                    actual_values = [item[0] for item in filtered_data]
                    predicted_values = [item[1] for item in filtered_data]
                    if len(dates) > len(actual_values):
                        dates = dates[:len(actual_values)]
                    elif len(dates) < len(actual_values):
                        dates.extend([f"Period {i+1}" for i in range(len(dates), len(actual_values))])
            
            # Calculate performance metrics
            if len(actual_values) > 0 and len(predicted_values) > 0:
                from sklearn.metrics import mean_absolute_error, mean_squared_error, r2_score
                
                mae = mean_absolute_error(actual_values, predicted_values)
                mse = mean_squared_error(actual_values, predicted_values)
                rmse = mse ** 0.5
                r2 = r2_score(actual_values, predicted_values)
                
                mape = 0
                if sum(actual_values) != 0:
                    mape = (sum(abs((actual - pred) / actual) for actual, pred in zip(actual_values, predicted_values) if actual != 0) / len(actual_values)) * 100
            else:
                mae = mse = rmse = r2 = mape = 0
            
            # Extract x_variables from weighted_metrics
            x_variables = [key.replace('_beta', '') for key in weighted_metrics.keys() if key.endswith('_beta')]

            return {
                "success": True,
                "combination_name": combination_id,
                "model_name": "Ensemble",
                "file_key": source_file_key,
                "dates": dates,
                "actual_values": actual_values,
                "predicted_values": predicted_values,
                "performance_metrics": {
                    "mae": mae,
                    "mse": mse,
                    "rmse": rmse,
                    "r2": r2,
                    "mape": mape
                },
                "model_info": {
                    "intercept": intercept,
                    "coefficients": weighted_metrics,
                    "x_variables": x_variables,
                    "y_variable": y_variable
                },
                "data_points": len(actual_values)
            }
        finally:
            # Close the MongoDB client
            loop_client.close()
    
    # Run async function - handle event loop properly
    try:
        # Try to get the current event loop
        loop = asyncio.get_running_loop()
        # If we're in an async context, we need to run in a thread
        import threading
        result_container = {}
        exception_container = {}
        
        def run_in_thread():
            try:
                new_loop = asyncio.new_event_loop()
                asyncio.set_event_loop(new_loop)
                result_container['result'] = new_loop.run_until_complete(_calculate())
                new_loop.close()
            except Exception as e:
                exception_container['exception'] = e
        
        thread = threading.Thread(target=run_in_thread)
        thread.start()
        thread.join()
        
        if 'exception' in exception_container:
            raise exception_container['exception']
        return result_container['result']
    except RuntimeError:
        # No running event loop, we can use asyncio.run
        return asyncio.run(_calculate())


def get_ensemble_contribution(file_key: str, combination_id: str, client_name: str, app_name: str, project_name: str) -> Dict[str, Any]:
    """Get contribution data for ensemble using weighted ensemble metrics"""
    logger.info(f"🔍 Getting ensemble contribution for combination: {combination_id}")
    async def _calculate():
        # Create a new MongoDB client for this event loop to avoid "attached to different loop" errors
        from motor.motor_asyncio import AsyncIOMotorClient
        from .database import MONGO_URI, MONGO_DB
        
        # Create a new MongoDB client for this event loop with proper authentication
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
            # Get the build configuration from MongoDB
            document_id = f"{client_name}/{app_name}/{project_name}"
            build_config = await loop_db["build-model_featurebased_configs"].find_one({"_id": document_id})
            
            if not build_config:
                raise ValueError(f"No build configuration found for {document_id}")
            
            # Get weighted ensemble data
            ensemble_request = {
                "file_key": file_key,
                "grouping_keys": ['combination_id'],
                "filter_criteria": {"combination_id": combination_id},
                "include_numeric": None,
                "exclude_numeric": None,
                "filtered_models": None
            }
            
            logger.info(f"🔍 Calculating ensemble contribution for combination: {combination_id}")
            ensemble_result = calculate_weighted_ensemble(ensemble_request)
            
            if not ensemble_result.get("results") or len(ensemble_result["results"]) == 0:
                logger.error(f"❌ No ensemble data found for combination: {combination_id}")
                raise ValueError("No ensemble data found for the given combination")
            
            ensemble_data = ensemble_result["results"][0]
            weighted_metrics = ensemble_data.get("weighted", {})
            model_composition = ensemble_data.get("model_composition", {})
            
            if not weighted_metrics:
                logger.error(f"❌ No weighted metrics found in ensemble data for combination: {combination_id}")
                raise ValueError("No weighted metrics found in ensemble data")
            
            # Update weighted_metrics with intercepts and betas from MongoDB
            logger.info(f"🔍 Fetching intercepts and betas from MongoDB for {len(model_composition)} models...")
            weighted_metrics = await _update_weighted_metrics_from_mongodb(
                loop_db, build_config, combination_id, weighted_metrics, model_composition
            )
            
            # Extract contribution data from ensemble weighted metrics
            contribution_data = []
            
            # First, try to find contribution columns
            for key in weighted_metrics.keys():
                if key.endswith('_contribution'):
                    variable_name = key.replace('_contribution', '').replace('_Contribution', '')
                    value = weighted_metrics[key]
                    if value is not None:
                        contribution_data.append({
                            "name": variable_name,
                            "value": float(value)
                        })
            
            # If no contribution data found, try to calculate from betas and means
            if not contribution_data:
                intercept = weighted_metrics.get("intercept", 0)
                
                for key in weighted_metrics.keys():
                    if key.endswith('_beta'):
                        variable_name = key.replace('_beta', '').replace('_Beta', '')
                        beta_value = weighted_metrics[key]
                        
                        # Try to find corresponding mean value
                        mean_key = f"{variable_name}_avg"
                        if mean_key in weighted_metrics:
                            mean_value = weighted_metrics[mean_key]
                            if beta_value is not None and mean_value is not None:
                                # Calculate contribution: abs(beta * mean)
                                # Note: Using abs() to match regular method behavior
                                contribution_value = abs(float(beta_value) * float(mean_value))
                                contribution_data.append({
                                    "name": variable_name,
                                    "value": contribution_value
                                })
            
            # If still no data, try using elasticities
            if not contribution_data:
                for key in weighted_metrics.keys():
                    if key.endswith('_elasticity'):
                        variable_name = key.replace('_elasticity', '').replace('_Elasticity', '')
                        elasticity_value = weighted_metrics[key]
                        
                        if elasticity_value is not None:
                            # Use absolute elasticity as contribution
                            contribution_value = abs(float(elasticity_value))
                            contribution_data.append({
                                "name": variable_name,
                                "value": contribution_value
                            })
            
            if not contribution_data:
                logger.error("No contribution data could be calculated from ensemble results")
                raise ValueError("No valid contribution data found in ensemble results")
            
            # Calculate total contribution
            total_contribution = sum(item["value"] for item in contribution_data)
            
            logger.info(f"✅ Successfully calculated ensemble contribution: {len(contribution_data)} variables")
            return {
                "success": True,
                "combination_name": combination_id,
                "model_name": "Ensemble",
                "contribution_data": contribution_data,
                "total_contribution": total_contribution,
                "data_points": len(contribution_data)
            }
        finally:
            # Close the MongoDB client
            loop_client.close()
    
    # Run async function - handle event loop properly
    try:
        # Try to get the current event loop
        loop = asyncio.get_running_loop()
        # If we're in an async context, we need to run in a thread
        import threading
        result_container = {}
        exception_container = {}
        
        def run_in_thread():
            try:
                new_loop = asyncio.new_event_loop()
                asyncio.set_event_loop(new_loop)
                result_container['result'] = new_loop.run_until_complete(_calculate())
                new_loop.close()
            except Exception as e:
                exception_container['exception'] = e
        
        thread = threading.Thread(target=run_in_thread)
        thread.start()
        thread.join()
        
        if 'exception' in exception_container:
            raise exception_container['exception']
        return result_container['result']
    except RuntimeError:
        # No running event loop, we can use asyncio.run
        return asyncio.run(_calculate())


def get_ensemble_yoy(file_key: str, combination_id: str, client_name: str, app_name: str, project_name: str) -> Dict[str, Any]:
    """Calculate Year-over-Year (YoY) growth using ensemble weighted metrics and source file data"""
    logger.info(f"🔍 Getting ensemble YoY for combination: {combination_id}")
    async def _calculate():
        # Create a new MongoDB client for this event loop to avoid "attached to different loop" errors
        from motor.motor_asyncio import AsyncIOMotorClient
        from .database import MONGO_URI, MONGO_DB, MINIO_ENDPOINT, MINIO_ACCESS_KEY, MINIO_SECRET_KEY, MINIO_SECURE, MINIO_BUCKET
        from minio import Minio
        
        # Create a new MongoDB client for this event loop with proper authentication
        loop_client = AsyncIOMotorClient(
            MONGO_URI,
            serverSelectionTimeoutMS=5000,
            connectTimeoutMS=5000,
            socketTimeoutMS=5000,
            maxPoolSize=10,
            minPoolSize=1
        )
        loop_db = loop_client[MONGO_DB]
        
        # Create a new MinIO client (MinIO is synchronous, but create fresh instance for consistency)
        loop_minio_client = Minio(
            MINIO_ENDPOINT,
            access_key=MINIO_ACCESS_KEY,
            secret_key=MINIO_SECRET_KEY,
            secure=MINIO_SECURE
        )
        
        try:
            # Get the build configuration from MongoDB
            document_id = f"{client_name}/{app_name}/{project_name}"
            build_config = await loop_db["build-model_featurebased_configs"].find_one({"_id": document_id})
            
            if not build_config:
                raise ValueError(f"No build configuration found for {document_id}")
            
            # Get the source file key for this combination
            combination_file_keys = build_config.get("combination_file_keys", [])
            source_file_key = None
            for combo_info in combination_file_keys:
                if combo_info.get("combination") == combination_id:
                    source_file_key = combo_info.get("file_key")
                    break
            
            if not source_file_key:
                raise ValueError(f"No source file key found for combination '{combination_id}'")
            
            # Get weighted ensemble data
            ensemble_request = {
                "file_key": file_key,
                "grouping_keys": ['combination_id'],
                "filter_criteria": {"combination_id": combination_id},
                "include_numeric": None,
                "exclude_numeric": None,
                "filtered_models": None
            }
            
            ensemble_result = calculate_weighted_ensemble(ensemble_request)
            
            if not ensemble_result.get("results") or len(ensemble_result["results"]) == 0:
                raise ValueError("No ensemble data found for the given combination")
            
            ensemble_data = ensemble_result["results"][0]
            weighted_metrics = ensemble_data.get("weighted", {})
            model_composition = ensemble_data.get("model_composition", {})
            
            # Update weighted_metrics with intercepts and betas from MongoDB
            logger.info(f"🔍 Fetching intercepts and betas from MongoDB for {len(model_composition)} models...")
            weighted_metrics = await _update_weighted_metrics_from_mongodb(
                loop_db, build_config, combination_id, weighted_metrics, model_composition
            )
            
            # Get weighted transformation metadata
            from .ensemble_metric_calculation import calculate_weighted_transformation_metadata
            
            class MockEnsembleData:
                def __init__(self, weighted, model_composition):
                    self.weighted = weighted
                    self.model_composition = model_composition
            
            mock_ensemble = MockEnsembleData(weighted_metrics, ensemble_data.get("model_composition", {}))
            
            logger.info(f"🔍 Calculating weighted transformation metadata for ensemble YoY...")
            transformation_metadata = await calculate_weighted_transformation_metadata(
                loop_db, client_name, app_name, project_name, combination_id, mock_ensemble
            )
            logger.info(f"✅ Weighted transformation metadata calculated: {len(transformation_metadata)} variables")
            
            # Import apply_transformation_steps from s_curve.py
            try:
                from .s_curve import apply_transformation_steps
            except ImportError:
                apply_transformation_steps = None
            
            # Get the source file data
            response = loop_minio_client.get_object(MINIO_BUCKET, source_file_key)
            content = response.read()
            response.close()
            response.release_conn()
            
            # Read file based on extension (matching old implementation)
            if source_file_key.lower().endswith('.csv'):
                df = pd.read_csv(io.BytesIO(content))
            elif source_file_key.lower().endswith('.xlsx'):
                df = pd.read_excel(io.BytesIO(content))
            elif source_file_key.lower().endswith('.arrow'):
                import pyarrow as pa
                import pyarrow.ipc as ipc
                reader = ipc.RecordBatchFileReader(pa.BufferReader(content))
                df = reader.read_all().to_pandas()
            elif source_file_key.lower().endswith(('.parquet', '.feather')):
                try:
                    df = pd.read_parquet(io.BytesIO(content))
                except:
                    df = pd.read_feather(io.BytesIO(content))
            else:
                # Try common formats as fallback
                try:
                    df = pd.read_csv(io.BytesIO(content))
                except:
                    try:
                        df = pd.read_parquet(io.BytesIO(content))
                    except:
                        df = pd.read_feather(io.BytesIO(content))
            
            # Filter data for the specific combination
            if "combination_id" in df.columns:
                df = df[df["combination_id"] == combination_id]
            
            if df.empty:
                raise ValueError(f"No data found for combination {combination_id}")
            
            df.columns = df.columns.str.lower()
            
            # Get ensemble intercept and betas
            intercept = weighted_metrics.get("intercept", 0)
            
            # Detect date column
            date_column = None
            date_columns = ["Date", "date", "DATE"]
            for col in date_columns:
                if col in df.columns:
                    date_column = col
                    break
            
            if not date_column:
                raise ValueError("Could not detect date column. Please ensure a date column is present.")
            
            # Convert date column to datetime
            df[date_column] = pd.to_datetime(df[date_column], errors='coerce')
            df = df.dropna(subset=[date_column])
            
            if df.empty:
                raise ValueError("No valid date data found after conversion.")
            
            # Get unique years and ensure we have at least 2 years
            years = sorted(df[date_column].dt.year.unique())
            if len(years) < 2:
                raise ValueError("Need at least two calendar years in the dataset for YoY calculation.")
            
            year_first, year_last = int(years[0]), int(years[-1])
            
            # Split data by years
            df_first_year = df[df[date_column].dt.year == year_first]
            df_last_year = df[df[date_column].dt.year == year_last]
            
            if df_first_year.empty or df_last_year.empty:
                raise ValueError(f"No data found for year {year_first} or {year_last}.")
            
            y_variable = None
            for col in df.columns:
                if col.lower() in ['target', 'y', 'dependent', 'sales', 'volume', 'value']:
                    y_variable = col
                    break
            
            if not y_variable:
                numeric_cols = df.select_dtypes(include=[np.number]).columns.tolist()
                if numeric_cols:
                    y_variable = numeric_cols[0]
            
            if not y_variable:
                raise ValueError("Could not identify target variable")
            
            # Calculate actual YoY change
            y_first_mean = df_first_year[y_variable].mean() if y_variable in df_first_year.columns else 0
            y_last_mean = df_last_year[y_variable].mean() if y_variable in df_last_year.columns else 0
            observed_delta = float(y_last_mean - y_first_mean)
            
            # Calculate explained YoY change using ensemble coefficients
            explained_delta = 0.0
            contributions = []
            
            # Check if transformations are available
            has_transformations = transformation_metadata and len(transformation_metadata) > 0 and apply_transformation_steps
            
            # Get x_variables from MongoDB (like regular method) instead of iterating all _beta keys
            # This ensures we only process variables that are actually in the model
            x_variables = []
            model_coefficients = build_config.get("model_coefficients", {})
            combination_coefficients = model_coefficients.get(combination_id, {})
            
            # Collect x_variables from all models in the ensemble
            all_x_variables_set = set()
            for model_name in model_composition.keys():
                model_coeffs = combination_coefficients.get(model_name, {})
                model_x_vars = model_coeffs.get("x_variables", [])
                all_x_variables_set.update([x.lower() if isinstance(x, str) else str(x).lower() for x in model_x_vars])
            
            x_variables = list(all_x_variables_set)
            
            if not x_variables:
                # Fallback: extract from weighted_metrics keys
                logger.warning("⚠️ No x_variables found in MongoDB, falling back to weighted_metrics keys")
                x_variables = [key.replace('_beta', '').replace('Beta_', '') for key in weighted_metrics.keys() 
                              if key.endswith('_beta') or key.startswith('Beta_')]
                x_variables = [x.lower() for x in x_variables if x]
            
            logger.info(f"🔍 Processing {len(x_variables)} x_variables for YoY calculation")
            
            # Process each x_variable (like regular method)
            for x_var_lower in x_variables:
                # Try to find the column in dataframe (case-insensitive)
                x_var = None
                for df_col in df.columns:
                    if df_col.lower() == x_var_lower.lower():
                        x_var = df_col
                        break
                
                if x_var is None:
                    continue
                
                # Try both beta key patterns
                beta_key = f"{x_var_lower}_beta"
                if beta_key not in weighted_metrics:
                    beta_key = f"Beta_{x_var_lower}"
                
                if beta_key in weighted_metrics:
                        beta_value = weighted_metrics[beta_key]
                        
                        # Calculate mean values for each year
                        x_first_mean = df_first_year[x_var].mean()
                        x_last_mean = df_last_year[x_var].mean()
                        
                        # Apply transformations if available
                        if has_transformations and x_var in transformation_metadata:
                            transformation_steps = transformation_metadata[x_var].get('transformation_steps', [])
                            if transformation_steps:
                                try:
                                    transformed_first = apply_transformation_steps([x_first_mean], transformation_steps)
                                    if transformed_first and len(transformed_first) > 0:
                                        x_first_mean = transformed_first[0]
                                except (IndexError, TypeError, ValueError) as e:
                                    logger.warning(f"Transformation failed for {x_var} (first year): {e}, using original value")
                                
                                try:
                                    transformed_last = apply_transformation_steps([x_last_mean], transformation_steps)
                                    if transformed_last and len(transformed_last) > 0:
                                        x_last_mean = transformed_last[0]
                                except (IndexError, TypeError, ValueError) as e:
                                    logger.warning(f"Transformation failed for {x_var} (last year): {e}, using original value")
                        
                        # Calculate contribution: beta * (transformed_mean_last - transformed_mean_first)
                        # Note: Transformations are already applied to x_first_mean and x_last_mean above
                        delta_contribution = beta_value * (x_last_mean - x_first_mean)
                        explained_delta += delta_contribution
                        
                        contributions.append({
                            "variable": x_var_lower,  # Use lowercase for consistency
                            "beta_coefficient": beta_value,
                            "mean_year1": float(x_first_mean),
                            "mean_year2": float(x_last_mean),
                            "delta_contribution": float(delta_contribution)
                        })
            
            # Sort contributions by absolute value
            contributions.sort(key=lambda x: abs(x["delta_contribution"]), reverse=True)
            
            # Calculate residual
            residual = float(observed_delta - explained_delta)
            
            # Calculate YoY percentage change
            yoy_percentage = 0.0
            if y_first_mean != 0:
                yoy_percentage = (observed_delta / y_first_mean) * 100
            
            # Create waterfall data for visualization
            waterfall_labels = [f"Base {year_first}"] + [c["variable"] for c in contributions] + ["Residual", f"Final {year_last}"]
            waterfall_values = [y_first_mean] + [c["delta_contribution"] for c in contributions] + [residual, y_last_mean]
            
            # For backward compatibility, return empty arrays (waterfall chart uses waterfall data instead)
            dates = []
            actual = []
            predicted = []

            return {
                "success": True,
                "combination_name": combination_id,
                "model_name": "Ensemble",
                "file_key": source_file_key,
                "dates": dates,
                "actual": actual,
                "predicted": predicted,
                "date_column_used": date_column,
                "years_used": {"year1": year_first, "year2": year_last},
                "y_variable_used": y_variable,
                "observed": {
                    "year1_mean": float(y_first_mean),
                    "year2_mean": float(y_last_mean),
                    "delta_y": observed_delta,
                    "yoy_percentage": yoy_percentage
                },
                "explanation": {
                    "explained_delta_yhat": float(explained_delta),
                    "residual": residual,
                    "contributions": contributions
                },
                "waterfall": {
                    "labels": waterfall_labels,
                    "values": waterfall_values
                },
                "model_info": {
                    "intercept": intercept,
                    "coefficients": weighted_metrics,
                    "x_variables": x_variables,
                    "y_variable": y_variable
                }
            }
        finally:
            # Close the MongoDB client
            loop_client.close()
    
    # Run async function - handle event loop properly
    try:
        # Try to get the current event loop
        loop = asyncio.get_running_loop()
        # If we're in an async context, we need to run in a thread
        import threading
        result_container = {}
        exception_container = {}
        
        def run_in_thread():
            try:
                new_loop = asyncio.new_event_loop()
                asyncio.set_event_loop(new_loop)
                result_container['result'] = new_loop.run_until_complete(_calculate())
                new_loop.close()
            except Exception as e:
                exception_container['exception'] = e
        
        thread = threading.Thread(target=run_in_thread)
        thread.start()
        thread.join()
        
        if 'exception' in exception_container:
            raise exception_container['exception']
        return result_container['result']
    except RuntimeError:
        # No running event loop, we can use asyncio.run
        return asyncio.run(_calculate())


__all__ = [
    "get_ensemble_actual_vs_predicted",
    "get_ensemble_contribution",
    "get_ensemble_yoy",
]

