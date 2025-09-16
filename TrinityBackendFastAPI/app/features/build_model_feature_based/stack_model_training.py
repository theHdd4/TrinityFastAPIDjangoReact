import logging
import pandas as pd
import numpy as np
from typing import Dict, List, Optional, Any
from datetime import datetime
from io import BytesIO
import pyarrow as pa
import pyarrow.feather as feather

from .stack_model_data import StackModelDataProcessor
from .database import save_model_results_enhanced
from .mongodb_saver import get_scope_config_from_mongo
from ..data_upload_validate.app.routes import get_object_prefix

logger = logging.getLogger(__name__)

class StackModelTrainer:
    """
    Handles model training for stacked/clustered data.
    Separates the training logic from the API routes for better maintainability.
    """
    
    def __init__(self):
        self.processor = StackModelDataProcessor()
    
    async def train_models_for_stacked_data(
        self,
        scope_number: str,
        combinations: List[str],
        pool_by_identifiers: List[str],
        x_variables: List[str],
        y_variable: str,
        minio_client,
        bucket_name: str,
        # Clustering parameters
        apply_clustering: bool = False,
        numerical_columns_for_clustering: List[str] = None,
        n_clusters: Optional[int] = None,
        # Interaction terms parameters
        apply_interaction_terms: bool = True,
        numerical_columns_for_interaction: List[str] = None,
        # Model training parameters
        standardization: str = 'none',
        k_folds: int = 5,
        models_to_run: Optional[List[str]] = None,
        custom_configs: Optional[Dict[str, Any]] = None,
        price_column: Optional[str] = None,
        run_id: str = None
    ) -> Dict[str, Any]:
        """
        Complete stack model training workflow.
        
        Returns:
            Dictionary with training results, saved model counts, and MinIO file path
        """
        try:
            logger.info("Starting complete stack model training workflow")
            
            # Step 1: Prepare the stacked data
            logger.info("Step 1: Preparing stacked data...")
            prepare_result = await self.processor.prepare_stack_model_data(
                scope_number=scope_number,
                combinations=combinations,
                pool_by_identifiers=pool_by_identifiers,
                x_variables=x_variables,
                y_variable=y_variable,
                minio_client=minio_client,
                bucket_name=bucket_name
            )
            
            if prepare_result.get('status') != 'success':
                raise Exception(f"Failed to prepare stacked data: {prepare_result.get('error', 'Unknown error')}")
            
            # Get the pooled data for further processing
            pooled_data = prepare_result.get('pooled_data', {})
            
            # Step 2: Apply clustering if requested
            split_clustered_data = {}
            clustering_result = {}
            
            if apply_clustering and pooled_data:
                logger.info("Step 2: Applying clustering...")
                
                # Convert numerical columns to lowercase for consistent matching
                numerical_columns_for_clustering = [col.lower() for col in numerical_columns_for_clustering]
                
                # Convert interaction terms parameters to lowercase for consistent matching
                if apply_interaction_terms:
                    numerical_columns_for_interaction = [col.lower() for col in numerical_columns_for_interaction]
                
                # Apply clustering to the pooled data
                clustering_result = await self.processor.apply_clustering_to_stack_data(
                    pooled_data=pooled_data,
                    numerical_columns=numerical_columns_for_clustering,
                    minio_client=minio_client,
                    bucket_name=bucket_name,
                    n_clusters=n_clusters,
                    apply_interaction_terms=apply_interaction_terms,
                    identifiers_for_interaction=None,  # Auto-detect identifiers
                    numerical_columns_for_interaction=numerical_columns_for_interaction
                )
                
                if clustering_result.get('status') == 'success':
                    # Reconstruct split clustered data for model training
                    logger.info("Step 3: Reconstructing split clustered data for model training...")
                    
                    from .stack_model_data import DataPooler
                    data_pooler = DataPooler(minio_client, bucket_name)
                    
                    # Apply clustering to pooled data
                    clustered_pools = data_pooler.apply_clustering_to_pools(
                        pooled_data=pooled_data,
                        numerical_columns=numerical_columns_for_clustering,
                        n_clusters=n_clusters
                    )
                    
                    # Split clustered data by individual clusters
                    split_clustered_data = data_pooler.split_clustered_data_by_clusters(clustered_pools)
                    
                    # Apply interaction terms if requested
                    if apply_interaction_terms and numerical_columns_for_interaction:
                        # Get column classifier identifiers for interaction terms
                        column_config = await self.processor.get_column_classifier_config()
                        all_identifiers = column_config.get('identifiers', [])
                        
                        split_clustered_data = data_pooler.create_interaction_terms(
                            pooled_data=split_clustered_data,
                            identifiers=None,  # Will auto-detect identifiers with >1 unique value
                            numerical_columns_for_interaction=numerical_columns_for_interaction,
                            column_classifier_identifiers=all_identifiers
                        )
                else:
                    raise Exception(f"Clustering failed: {clustering_result.get('error', 'Unknown error')}")
            else:
                # No clustering - use original pooled data
                logger.info("Step 2: No clustering requested, using original pooled data...")
                split_clustered_data = pooled_data
            
            # Step 3: Train models on the data
            logger.info("Step 3: Training models on stacked data...")
            
            # Convert parameters to lowercase for consistent matching
            x_variables_lower = [col.lower() for col in x_variables]
            y_variable_lower = y_variable.lower()
            
            # Create DataPooler instance for model training
            from .stack_model_data import DataPooler
            data_pooler = DataPooler(minio_client, bucket_name)
            
            training_results = await data_pooler.train_models_for_stacked_data(
                split_clustered_data=split_clustered_data,
                x_variables=x_variables_lower,
                y_variable=y_variable_lower,
                standardization=standardization,
                k_folds=k_folds,
                models_to_run=models_to_run,
                custom_configs=custom_configs,
                price_column=price_column.lower() if price_column else None
            )
            
            # Step 4: Calculate elasticities and contributions
            logger.info("Step 4: Calculating elasticities and contributions...")
            self._calculate_elasticities_and_contributions(training_results, x_variables_lower, y_variable_lower)
            
            # Step 5: Save results to MongoDB
            logger.info("Step 5: Saving results to MongoDB...")
            total_saved = await self._save_results_to_mongodb(
                training_results=training_results,
                scope_number=scope_number,
                y_variable_lower=y_variable_lower,
                price_column=price_column,
                standardization=standardization,
                k_folds=k_folds,
                run_id=run_id
            )
            
            # Step 6: Save results to MinIO
            logger.info("Step 6: Saving results to MinIO...")
            minio_file_path = await self._save_results_to_minio(
                training_results=training_results,
                scope_number=scope_number,
                y_variable_lower=y_variable_lower,
                run_id=run_id,
                minio_client=minio_client,
                bucket_name=bucket_name
            )
            
            # Prepare final response
            response = {
                "status": "success",
                "run_id": run_id,
                "scope_number": scope_number,
                "total_split_clusters": len(split_clustered_data),
                "total_models_trained": sum(len(result.get('model_results', [])) for result in training_results.values() if 'error' not in result),
                "total_models_saved": total_saved,
                "clustering_applied": apply_clustering,
                "interaction_terms_applied": apply_interaction_terms and apply_clustering,
                "minio_results_file": minio_file_path,
                "training_results": {
                    split_key: {
                        "feature_breakdown": result.get('feature_breakdown', {}),
                        "data_shape": result.get('data_shape', (0, 0)),
                        "total_records": result.get('total_records', 0),
                        "models_trained": len(result.get('model_results', [])),
                        "model_results": result.get('model_results', []),  # Include detailed model results
                        "variable_data": result.get('variable_data', {}),  # Include variable statistics
                        "error": result.get('error', None)
                    }
                    for split_key, result in training_results.items()
                },
                "clustering_result": clustering_result if apply_clustering else None
            }
            
            logger.info("Stack model training completed successfully")
            return response
            
        except Exception as e:
            logger.error(f"Error in stack model training: {str(e)}")
            return {
                "status": "error",
                "error": str(e),
                "run_id": run_id,
                "scope_number": scope_number
            }
    
    def _calculate_elasticities_and_contributions(
        self, 
        training_results: Dict[str, Any], 
        x_variables_lower: List[str], 
        y_variable_lower: str
    ):
        """
        Calculate elasticities and contributions for all models (same logic as individual models).
        """
        for split_key, result in training_results.items():
            if 'error' in result or 'model_results' not in result:
                continue
                
            model_results = result['model_results']
            variable_data = result['variable_data']
            
            # Calculate elasticities and contributions for each model
            for model_result in model_results:
                try:
                    # Get coefficients and means that are already available
                    coefficients = model_result.get('coefficients', {})
                    variable_averages = variable_data.get('variable_averages', {})
                    
                    # Calculate elasticities using the CORRECT formula since Y is NOT standardized
                    elasticities = {}
                    contributions = {}
                    
                    # Get unstandardized coefficients (these are the correct ones since Y is not standardized)
                    unstandardized_coeffs = model_result.get('unstandardized_coefficients', {})
                    
                    # For each X variable, calculate elasticity and contribution
                    for x_var in result['feature_columns']:
                        # Skip interaction terms and encoded variables for elasticity calculation
                        if '_x_' in x_var or x_var not in x_variables_lower:
                            continue
                            
                        beta_key = f"Beta_{x_var}"
                        x_mean = variable_averages.get(x_var, 0)
                        y_mean = variable_averages.get(y_variable_lower, 0)
                        
                        # Use unstandardized coefficients for elasticity calculation
                        if unstandardized_coeffs and beta_key in unstandardized_coeffs:
                            beta_val = unstandardized_coeffs[beta_key]
                        else:
                            # Fallback to raw coefficients if unstandardized not available
                            beta_val = coefficients.get(beta_key, 0)
                        
                        # Calculate elasticity using the CORRECT formula: (β × X_mean) / Y_mean
                        if y_mean != 0 and x_mean != 0:
                            elasticity = (beta_val * x_mean) / y_mean
                        else:
                            elasticity = 0
                        
                        elasticities[x_var] = elasticity
                        
                        # Calculate contribution: (β × X_mean) / sum(all_β × X_mean)
                        contributions[x_var] = abs(beta_val * x_mean)
                    
                    # Normalize contributions to sum to 1
                    total_contribution = sum(contributions.values())
                    if total_contribution > 0:
                        for x_var in contributions:
                            contributions[x_var] = contributions[x_var] / total_contribution
                    
                    # Store results in model_result
                    model_result['elasticities'] = elasticities
                    model_result['contributions'] = contributions
                    
                    model_result['elasticity_details'] = {
                        'calculation_method': 'direct_from_model_results',
                        'variables_processed': list(elasticities.keys()),
                        'transform_data_used': False
                    }
                    model_result['contribution_details'] = {
                        'calculation_method': 'direct_from_model_results',
                        'variables_processed': list(contributions.keys()),
                        'total_contribution': total_contribution,
                        'transform_data_used': False
                    }
                    
                except Exception as e:
                    logger.warning(f"Failed to calculate elasticities/contributions for {split_key} {model_result.get('model_name', 'unknown')}: {e}")
                    model_result['elasticities'] = {}
                    model_result['contributions'] = {}
                    model_result['elasticity_details'] = {}
                    model_result['contribution_details'] = {}
    
    async def _save_results_to_mongodb(
        self,
        training_results: Dict[str, Any],
        scope_number: str,
        y_variable_lower: str,
        price_column: Optional[str],
        standardization: str,
        k_folds: int,
        run_id: str
    ) -> int:
        """
        Save model results to MongoDB (same format as individual models).
        """
        total_saved = 0
        
        for split_key, result in training_results.items():
            if 'error' in result:
                logger.warning(f"Skipping {split_key} due to error: {result['error']}")
                continue
            
            try:
                # Create combination info for saving
                combination_info = {
                    "combination_id": split_key,
                    "channel": "Stacked",  # Indicate this is stacked data
                    "brand": "Stacked",
                    "ppg": "Stacked",
                    "file_key": f"stacked_data_{split_key}",
                    "filename": f"stacked_data_{split_key}.csv",
                    "set_name": f"Scope_{scope_number}_Stacked",
                    "record_count": result.get('total_records', 0)
                }
                
                # Save results using the same function as individual models
                saved_ids = await save_model_results_enhanced(
                    scope_id=f"scope_{scope_number}_stacked",
                    scope_name=f"Scope_{scope_number}_Stacked",
                    set_name=f"Scope_{scope_number}_Stacked",
                    combination=combination_info,
                    model_results=result['model_results'],
                    x_variables=result['feature_columns'],
                    y_variable=y_variable_lower,
                    price_column=price_column.lower() if price_column else None,
                    standardization=standardization,
                    k_folds=k_folds,
                    run_id=run_id,
                    variable_data=result['variable_data']
                )
                
                total_saved += len(saved_ids)
                logger.info(f"Saved {len(saved_ids)} models for {split_key}")
                
            except Exception as e:
                logger.error(f"Failed to save results for {split_key}: {e}")
        
        return total_saved
    
    async def _save_results_to_minio(
        self,
        training_results: Dict[str, Any],
        scope_number: str,
        y_variable_lower: str,
        run_id: str,
        minio_client,
        bucket_name: str
    ) -> Optional[str]:
        """
        Save model results to MinIO as Arrow file (same format as individual models).
        """
        try:
            # Get the standard prefix using get_object_prefix
            prefix = await get_object_prefix()
            
            # Create timestamp for file naming
            timestamp = datetime.now().strftime("%Y%m%d_%H%M%S")
            
            # Generate filename for model results
            model_results_filename = f"stacked_model_results_scope_{scope_number}_{timestamp}.arrow"
            
            # Construct the full path with the standard structure
            model_results_file_key = f"{prefix}model-results/{model_results_filename}"
            
            # Get identifiers from scope configuration
            identifiers = []
            try:
                # Extract client, app, project from prefix
                prefix_parts = prefix.strip('/').split('/')
                
                if len(prefix_parts) >= 2:
                    client_name = prefix_parts[0]
                    app_name = prefix_parts[1]
                    project_name = prefix_parts[2] if len(prefix_parts) > 2 else "default_project"
                    
                    # Get scope configuration from MongoDB
                    scope_config = await get_scope_config_from_mongo(client_name, app_name, project_name)
                    
                    if scope_config and 'identifiers' in scope_config:
                        identifiers = scope_config['identifiers']
                        logger.info(f"✅ Retrieved identifiers: {identifiers}")
                    else:
                        logger.warning("⚠️ No identifiers found in scope config")
                else:
                    logger.warning(f"⚠️ Could not extract client/app/project from prefix: {prefix}")
            except Exception as e:
                logger.warning(f"❌ Failed to get identifiers from scope config: {e}")
                identifiers = []
            
            # Prepare data for MinIO storage
            summary_data = []
            for split_key, result in training_results.items():
                if 'error' in result or 'model_results' not in result:
                    continue
                    
                variable_averages = result.get('variable_data', {}).get('variable_averages', {})
                
                for model_result in result.get('model_results', []):
                    # Create base summary row
                    summary_row = {
                        'Scope': f'Scope_{scope_number}_Stacked',
                        'combination_id': split_key,
                        'y_variable': y_variable_lower,
                        'x_variables': result['feature_columns'],  # Keep as list instead of joining
                        'model_name': model_result.get('model_name', 'Unknown'),
                        'mape_train': model_result.get('mape_train', 0),
                        'mape_test': model_result.get('mape_test', 0),
                        'r2_train': model_result.get('r2_train', 0),
                        'r2_test': model_result.get('r2_test', 0),
                        'aic': model_result.get('aic', 0),
                        'bic': model_result.get('bic', 0),
                        'intercept': model_result.get('intercept', 0),
                        'n_parameters': model_result.get('n_parameters', 0),
                        'price_elasticity': model_result.get('price_elasticity', None),
                        'run_id': run_id,
                        'timestamp': timestamp
                    }
                    
                    # Add identifier column values (for stacked data, use split_key info)
                    for identifier in identifiers:
                        # Extract identifier values from split_key if possible
                        if '_' in split_key:
                            parts = split_key.split('_')
                            if len(parts) >= 2:
                                summary_row[f"{identifier}"] = f"{parts[0]}_{parts[1]}"  # e.g., "channel_convenience"
                            else:
                                summary_row[f"{identifier}"] = split_key
                        else:
                            summary_row[f"{identifier}"] = "Stacked"
                    
                    # Add average values for each variable (before any transformation)
                    for x_var in result['feature_columns']:
                        avg_key = f"{x_var}_avg"
                        summary_row[avg_key] = variable_averages.get(x_var, 0)
                    
                    # Add Y variable average
                    y_avg_key = f"{y_variable_lower}_avg"
                    summary_row[y_avg_key] = variable_averages.get(y_variable_lower, 0)
                    
                    # Add beta coefficients for each X-variable
                    coefficients = model_result.get('coefficients', {})
                    for x_var in result['feature_columns']:
                        beta_key = f"{x_var}_beta"
                        summary_row[beta_key] = coefficients.get(f"Beta_{x_var}", 0)
                    
                    # Add elasticity values for each X-variable
                    elasticities = model_result.get('elasticities', {})
                    for x_var in result['feature_columns']:
                        elasticity_key = f"{x_var}_elasticity"
                        summary_row[elasticity_key] = elasticities.get(x_var, 0)
                    
                    # Add contribution values for each X-variable
                    contributions = model_result.get('contributions', {})
                    for x_var in result['feature_columns']:
                        contribution_key = f"{x_var}_contribution"
                        summary_row[contribution_key] = contributions.get(x_var, 0)
                    
                    summary_data.append(summary_row)
            
            if summary_data:
                # Convert to DataFrame and save as Arrow file
                summary_df = pd.DataFrame(summary_data)
                
                arrow_buffer = BytesIO()
                table = pa.Table.from_pandas(summary_df)
                feather.write_feather(table, arrow_buffer)
                arrow_buffer.seek(0)
                
                # Save to MinIO
                try:
                    minio_client.put_object(
                        bucket_name,
                        model_results_file_key,
                        arrow_buffer,
                        length=arrow_buffer.getbuffer().nbytes,
                        content_type='application/vnd.apache.arrow.file'
                    )
                    
                    logger.info(f"Stacked model results saved to MinIO: {model_results_file_key}")
                    return model_results_file_key
                    
                except Exception as e:
                    logger.warning(f"Failed to save stacked model results to MinIO: {e}")
                    return None
            else:
                logger.warning("No summary data to save to MinIO")
                return None
                    
        except Exception as e:
            logger.warning(f"Failed to prepare stacked model results for MinIO: {e}")
            return None
