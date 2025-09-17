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
                   
                    
                    from .stack_model_data import DataPooler
                    data_pooler = DataPooler(minio_client, bucket_name)
                    
                    # Apply clustering to pooled data
                    clustered_pools = data_pooler.apply_clustering_to_pools(
                        pooled_data=pooled_data,
                        numerical_columns=numerical_columns_for_clustering,
                        n_clusters=n_clusters
                    )
                    
                    # Split clustered data by individual clusters and save to MinIO
                    split_clustered_data = data_pooler.split_clustered_data_by_clusters(
                        clustered_pools, 
                        minio_client=minio_client, 
                        bucket_name=bucket_name
                    )
                    
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
                split_clustered_data = pooled_data
            

            
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
            

            
            
            # Convert training results to match individual model format
            from .schemas import StackModelResults, StackModelResult
            split_cluster_results = []
            for split_key, result in training_results.items():
                if 'error' not in result:
                    # Convert model results to simplified format (beta coefficients only)
                    simplified_model_results = []
                    for model_result in result.get('model_results', []):
                        simplified_model = StackModelResult(
                            model_name=model_result.get('model_name', 'Unknown'),
                            mape_train=model_result.get('mape_train', 0),
                            mape_test=model_result.get('mape_test', 0),
                            r2_train=model_result.get('r2_train', 0),
                            r2_test=model_result.get('r2_test', 0),
                            coefficients=model_result.get('coefficients', {}),
                            intercept=model_result.get('intercept', 0),
                            aic=model_result.get('aic', 0),
                            bic=model_result.get('bic', 0),
                            n_parameters=model_result.get('n_parameters', 0)
                        )
                        simplified_model_results.append(simplified_model)
                    
                    # Convert to StackModelResults format
                    split_cluster_result = StackModelResults(
                        split_clustered_data_id=split_key,
                        file_key=f"stack_model_{split_key}",  # Virtual file key for stack models
                        total_records=result.get('total_records', 0),
                        model_results=simplified_model_results
                    )
                    split_cluster_results.append(split_cluster_result)
            
            # Prepare final response using the stack model schema
            from .schemas import StackModelTrainingResponse
            response = StackModelTrainingResponse(
                scope_id=f"scope_{scope_number}",
                set_name=f"Scope_{scope_number}",
                x_variables=x_variables,
                y_variable=y_variable,
                standardization=standardization,
                k_folds=k_folds,
                total_split_clusters=len(split_clustered_data),
                stack_model_results=split_cluster_results,
                summary={
                    "run_id": run_id,
                    "total_split_clusters_processed": len(split_cluster_results),
                    "total_models_trained": sum(len(result.get('model_results', [])) for result in training_results.values() if 'error' not in result),
                    "total_models_saved": 0,  # Models are not saved to MinIO in this endpoint
                    "clustering_applied": apply_clustering,
                    "interaction_terms_applied": apply_interaction_terms and apply_clustering,
                    "minio_results_file": None,  # No MinIO file saved in this endpoint
                    "clustering_result": clustering_result if apply_clustering else None
                }
            )
            
            return response
            
        except Exception as e:
            logger.error(f"Error in stack model training: {str(e)}")
            # Return error response in the same format as success
            from .schemas import StackModelTrainingResponse
            return StackModelTrainingResponse(
                scope_id=f"scope_{scope_number}",
                set_name=f"Scope_{scope_number}",
                x_variables=x_variables,
                y_variable=y_variable,
                standardization=standardization,
                k_folds=k_folds,
                total_split_clusters=0,
                stack_model_results=[],
                summary={
                    "status": "error",
                    "error": str(e),
                    "run_id": run_id,
                    "scope_number": scope_number
                }
            )
    
    
    def calculate_combination_betas(self, model_results: List[Dict[str, Any]], combinations: List[str], x_variables: List[str], numerical_columns_for_interaction: List[str], split_cluster_id: str = None) -> Dict[str, Dict[str, float]]:

        combination_betas = {}
        
        for model_result in model_results:
            model_name = model_result['model_name']
            coefficients = model_result['coefficients']
            intercept = model_result['intercept']
            
            # Extract combinations that are actually present in this model's coefficients
            available_combinations = []
            for key in coefficients.keys():
                if key.startswith('encoded_combination_') and not key.endswith('_x_'):
                    # Extract combination name from encoded_combination_{combination}
                    combination_name = key.replace('encoded_combination_', '')
                    if combination_name in combinations:
                        available_combinations.append(combination_name)
            
            logger.info(f"Model {model_name} has coefficients for {len(available_combinations)} combinations: {available_combinations}")
            logger.info(f"Intercept: {intercept}")
            
            # Calculate final betas only for combinations that are available in this model
            for combination in available_combinations:
                combination_key = f"{model_name}_{combination}"
                final_betas = {}
                # Calculate final intercept
                combination_intercept_key = f"encoded_combination_{combination}"
                combination_intercept_beta = coefficients.get(combination_intercept_key, 0.0)
                logger.info(f"Combination intercept beta: {combination_intercept_beta}")
                final_betas['intercept'] = intercept + combination_intercept_beta

                logger.info(f"Final betas: {final_betas}")
                
                # Calculate final betas for x_variables (main model variables)
                for x_var in x_variables:
                    # Common beta for this x_variable
                    common_beta = coefficients.get(x_var, 0.0)
                    
                    # Individual beta for this combination and x_variable (if interaction exists)
                    interaction_key = f"encoded_combination_{combination}_x_{x_var}"
                    individual_beta = coefficients.get(interaction_key, 0.0)
                    
                    # Final beta = common + individual
                    final_betas[x_var] = common_beta + individual_beta
                
                # Calculate final betas for numerical_columns_for_interaction (interaction variables)
                for interaction_var in numerical_columns_for_interaction:
                    # Only add if it's not already in x_variables to avoid duplication
                    if interaction_var not in x_variables:
                        # Common beta for this interaction variable
                        common_beta = coefficients.get(interaction_var, 0.0)
                        
                        # Individual beta for this combination and interaction variable
                        interaction_key = f"encoded_combination_{combination}_x_{interaction_var}"
                        individual_beta = coefficients.get(interaction_key, 0.0)
                        
                        # Final beta = common + individual
                        final_betas[interaction_var] = common_beta + individual_beta
                
                combination_betas[combination_key] = final_betas
                logger.info(f"Calculated final betas for {combination}: {final_betas}")
        
        return combination_betas
    
    async def calculate_individual_combination_metrics(
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
        Calculate MAPE, AIC, and BIC for individual combinations using betas from stack modeling.
        
        Process:
        1. Train stack models to get betas
        2. For each combination, fetch individual data
        3. Apply stack modeling betas to individual combination data
        4. Calculate predictions and metrics (MAPE, AIC, BIC)
        5. Use stack modeling MAPE as train MAPE, individual combination MAPE as test MAPE
        """
        try:
            logger.info("Starting individual combination metrics calculation")
            
            # Step 1: Train stack models to get betas
            logger.info("Step 1: Training stack models to get betas...")
            try:
                training_result = await self.train_models_for_stacked_data(
                scope_number=scope_number,
                combinations=combinations,
                pool_by_identifiers=pool_by_identifiers,
                x_variables=x_variables,
                y_variable=y_variable,
                minio_client=minio_client,
                bucket_name=bucket_name,
                apply_clustering=apply_clustering,
                numerical_columns_for_clustering=numerical_columns_for_clustering,
                n_clusters=n_clusters,
                apply_interaction_terms=apply_interaction_terms,
                numerical_columns_for_interaction=numerical_columns_for_interaction,
                standardization=standardization,
                k_folds=k_folds,
                models_to_run=models_to_run,
                custom_configs=custom_configs,
                price_column=price_column,
                run_id=run_id
                )
                logger.info("Stack model training completed successfully")
            except Exception as e:
                logger.error(f"Error in stack model training: {e}")
                raise
            
            # Step 2: Calculate combination betas from stack model results
            logger.info("Step 2: Calculating combination betas from stack model results...")
            logger.info(f"Number of stack results: {len(training_result.stack_model_results)}")
            combination_betas_list = []
            all_combinations = set()
            
            for stack_result in training_result.stack_model_results:

                for model_result in stack_result.model_results:
                    # Convert StackModelResult to dict format expected by calculate_combination_betas
                    model_result_dict = {
                        'model_name': model_result.model_name,
                        'coefficients': model_result.coefficients,
                        'intercept': model_result.intercept
                    }
                    
                    model_betas = self.calculate_combination_betas(
                        model_results=[model_result_dict],
                        combinations=combinations,
                        x_variables=x_variables,
                        numerical_columns_for_interaction=numerical_columns_for_interaction or [],
                        split_cluster_id=stack_result.split_clustered_data_id
                    )
                    
                    for combination_key, betas in model_betas.items():
                        model_name = combination_key.split('_', 1)[0]  
                        combination = combination_key.split('_', 1)[1] if '_' in combination_key else combination_key
                        
                        # Remove intercept from coefficients
                        coefficients = {k: v for k, v in betas.items() if k != 'intercept'}
                        
                        combination_beta = {
                            'combination': combination,
                            'model_name': model_name,
                            'split_cluster_id': stack_result.split_clustered_data_id,
                            'intercept': betas.get('intercept', 0.0),
                            'coefficients': coefficients
                        }
                        
                        combination_betas_list.append(combination_beta)
                        all_combinations.add(combination)
            
            try:
                individual_metrics = await self._calculate_individual_metrics(
                scope_number=scope_number,
                combinations=list(all_combinations),
                combination_betas_list=combination_betas_list,
                x_variables=x_variables,
                y_variable=y_variable,
                minio_client=minio_client,
                bucket_name=bucket_name,
                stack_model_results=training_result.stack_model_results
                )
            except Exception as e:
                logger.error(f"Error in individual metrics calculation: {e}")
                raise
            
            # Step 4: Save individual combination metrics to MinIO
            try:
                await self._save_individual_combination_metrics_to_minio(
                    individual_metrics=individual_metrics,
                    scope_number=scope_number,
                    run_id=run_id,
                    x_variables=x_variables,
                    y_variable=y_variable,
                    minio_client=minio_client,
                    bucket_name=bucket_name
                )
                logger.info(f"Successfully saved individual combination metrics to MinIO for run_id: {run_id}")
            except Exception as e:
                logger.error(f"Failed to save individual combination metrics to MinIO: {e}")
                # Don't fail the entire request if MinIO save fails
            
            # Step 5: Prepare response
            result = {
                'status': 'success',
                'scope_number': scope_number,
                'total_combinations': len(all_combinations),
                'individual_combination_metrics': individual_metrics,
                'stack_model_summary': training_result.summary,
                'run_id': run_id
            }
            return result
            
        except Exception as e:
            return {
                'status': 'error',
                'error': str(e),
                'scope_number': scope_number,
                'run_id': run_id
            }
    
    async def _calculate_individual_metrics(
        self,
        scope_number: str,
        combinations: List[str],
        combination_betas_list: List[Dict[str, Any]],
        x_variables: List[str],
        y_variable: str,
        minio_client,
        bucket_name: str,
        stack_model_results: List[Dict[str, Any]]
    ) -> Dict[str, Any]:
        """
        Calculate metrics for individual combinations using stack modeling betas.
        """
        from .stack_model_data import DataPooler
        from sklearn.metrics import mean_absolute_percentage_error
        import numpy as np
        
        data_pooler = DataPooler(minio_client, bucket_name)
        individual_metrics = {}
        
        # Create a mapping of combination -> model_name -> betas (with split cluster info)
        betas_by_combination = {}
        for beta_info in combination_betas_list:
            combination = beta_info['combination']
            model_name = beta_info['model_name']
            split_cluster_id = beta_info['split_cluster_id']
            
            if combination not in betas_by_combination:
                betas_by_combination[combination] = {}
            
            betas_by_combination[combination][model_name] = {
                'split_cluster_id': split_cluster_id,
                'intercept': beta_info['intercept'],
                'coefficients': beta_info['coefficients']
            }
        
        # Get stack model MAPE for train metrics (keyed by split_cluster_id + model_name)
        stack_mape_by_cluster_model = {}
        for stack_result in stack_model_results:
            split_cluster_id = stack_result.split_clustered_data_id
            for model_result in stack_result.model_results:
                model_name = model_result.model_name
                key = f"{split_cluster_id}_{model_name}"
                stack_mape_by_cluster_model[key] = {
                    'mape_train': model_result.mape_train,
                    'mape_test': model_result.mape_test,
                    'r2_train': model_result.r2_train,
                    'r2_test': model_result.r2_test,
                    'aic': model_result.aic,
                    'bic': model_result.bic
                }

        for combination in combinations:
            logger.info(f"Processing individual metrics for combination: {combination}")
            
            try:

                df = data_pooler._fetch_combination_file_direct(scope_number, combination)
                if df is None:
                    logger.warning(f"Could not fetch data for combination: {combination}")
                    continue
        
                
                # Convert column names to lowercase for consistency
                df.columns = df.columns.str.lower()
                
                # Filter to only include required columns
                required_columns = x_variables + [y_variable]
                available_columns = [col for col in required_columns if col in df.columns]
                missing_columns = [col for col in required_columns if col not in df.columns]
                
                if missing_columns:
                    logger.warning(f"Missing columns for {combination}: {missing_columns}")
                    continue
                
                # Prepare data
                X = df[x_variables].values
                y_actual = df[y_variable].values
                
                combination_metrics = {}
                
                # Calculate metrics for each model
                for model_name in betas_by_combination.get(combination, {}):
                    if model_name not in betas_by_combination[combination]:
                        continue
                    
                    betas = betas_by_combination[combination][model_name]
                    
                    # Make predictions using the betas
                    y_pred = self._predict_with_betas(X, betas, x_variables)
                    
                    # Calculate individual combination metrics
                    individual_mape = mean_absolute_percentage_error(y_actual, y_pred)
                    individual_r2 = self._calculate_r2(y_actual, y_pred)
                    
                    # Calculate AIC and BIC for individual combination
                    n = len(y_actual)
                    k = len(x_variables) + 1  # +1 for intercept
                    mse = np.mean((y_actual - y_pred) ** 2)
                    log_likelihood = -n/2 * np.log(2 * np.pi * mse) - n/2
                    individual_aic = 2 * k - 2 * log_likelihood
                    individual_bic = k * np.log(n) - 2 * log_likelihood
                    
                    # Calculate elasticity and contribution for individual combination
                    elasticities = {}
                    contributions = {}
                    
                    # Get variable means from the individual combination data
                    variable_means = {}
                    for x_var in x_variables:
                        variable_means[x_var] = df[x_var].mean()
                    y_mean = df[y_variable].mean()
                    
                    # Calculate elasticity and contribution for each x_variable
                    for x_var in x_variables:
                        beta_val = betas['coefficients'].get(x_var, 0.0)
                        x_mean = variable_means.get(x_var, 0)
                        
                        # Calculate elasticity: (β × X_mean) / Y_mean
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
                    
                    # Get stack model metrics for train metrics using split cluster + model name
                    split_cluster_id = betas['split_cluster_id']
                    stack_key = f"{split_cluster_id}_{model_name}"
                    stack_metrics = stack_mape_by_cluster_model.get(stack_key, {})
                    
                    logger.info(f"  Using stack metrics from split cluster: {split_cluster_id}, model: {model_name}")
                    
                    combination_metrics[model_name] = {
                        'combination': combination,
                        'model_name': model_name,
                        'individual_samples': n,
                        'mape_train': stack_metrics.get('mape_train', 0.0),  # From stack modeling
                        'mape_test': individual_mape,  # From individual combination
                        'r2_train': stack_metrics.get('r2_train', 0.0),  # From stack modeling
                        'r2_test': individual_r2,  # From individual combination
                        'aic': individual_aic,  # Individual combination AIC
                        'bic': individual_bic,  # Individual combination BIC
                        'stack_aic': stack_metrics.get('aic', 0.0),  # Stack modeling AIC for reference
                        'stack_bic': stack_metrics.get('bic', 0.0),  # Stack modeling BIC for reference
                        'elasticities': elasticities,  # Individual combination elasticities
                        'contributions': contributions,  # Individual combination contributions
                        'actual_values': y_actual.tolist(),  # Actual target values
                        'predicted_values': y_pred.tolist(),  # Predicted values using stack model betas
                        'variable_means': variable_means,  # Variable means from individual combination data
                        'y_mean': y_mean,  # Y variable mean from individual combination data
                        'betas': betas
                    }
                    
                individual_metrics[combination] = combination_metrics
                
            except Exception as e:
                logger.error(f"Error processing combination {combination}: {e}")
                individual_metrics[combination] = {'error': str(e)}
        
        return individual_metrics
    
    def _predict_with_betas(self, X: np.ndarray, betas: Dict[str, Any], x_variables: List[str]) -> np.ndarray:
        """
        Make predictions using calculated betas.
        """
        import numpy as np
        
        intercept = betas['intercept']
        coefficients = betas['coefficients']
        
        # Initialize predictions with intercept
        y_pred = np.full(X.shape[0], intercept)
        
        # Add contributions from each variable
        for i, var in enumerate(x_variables):
            if var in coefficients:
                y_pred += X[:, i] * coefficients[var]
        
        return y_pred
    
    def _calculate_r2(self, y_actual: np.ndarray, y_pred: np.ndarray) -> float:
        """
        Calculate R-squared score.
        """
        import numpy as np
        
        ss_res = np.sum((y_actual - y_pred) ** 2)
        ss_tot = np.sum((y_actual - np.mean(y_actual)) ** 2)
        
        if ss_tot == 0:
            return 0.0
        
        return 1 - (ss_res / ss_tot)
    
    async def _save_individual_combination_metrics_to_minio(
        self,
        individual_metrics: Dict[str, Any],
        scope_number: str,
        run_id: str,
        x_variables: List[str],
        y_variable: str,
        minio_client,
        bucket_name: str
    ) -> None:
        """
        Save individual combination metrics to MinIO in the same flattened format as individual combination models.
        """
        import pandas as pd
        import pyarrow as pa
        import pyarrow.feather as feather
        from io import BytesIO
        from datetime import datetime
        
        try:
            # Prepare data for saving in flattened format
            summary_data = []
            timestamp = datetime.now().strftime('%Y%m%d_%H%M%S')
            
            for combination, combination_metrics in individual_metrics.items():
                if 'error' in combination_metrics:
                    continue
                    
                for model_name, metrics in combination_metrics.items():
                    # Create base summary row (flattened format like individual combination models)
                    summary_row = {
                        'Scope': f'Scope_{scope_number}',
                        'combination_id': combination,
                        'y_variable': y_variable,
                        'x_variables': x_variables,  # Keep as list
                        'model_name': model_name,
                        'model_type': 'stack_individual_combination',
                        'mape_train': metrics.get('mape_train', 0.0),
                        'mape_test': metrics.get('mape_test', 0.0),
                        'r2_train': metrics.get('r2_train', 0.0),
                        'r2_test': metrics.get('r2_test', 0.0),
                        'aic': metrics.get('aic', 0.0),
                        'bic': metrics.get('bic', 0.0),
                        'intercept': metrics.get('betas', {}).get('intercept', 0.0),
                        'n_parameters': len(x_variables) + 1,
                        'individual_samples': metrics.get('individual_samples', 0),
                        'run_id': run_id,
                        'timestamp': timestamp
                    }
                    
                    # Stack model reference metrics are not needed in saved data
                    
                    # Add average values for each variable (from individual combination data)
                    variable_means = metrics.get('variable_means', {})
                    for x_var in x_variables:
                        avg_key = f"{x_var}_avg"
                        summary_row[avg_key] = variable_means.get(x_var, 0)
                    
                    # Add Y variable average
                    y_avg_key = f"{y_variable}_avg"
                    summary_row[y_avg_key] = metrics.get('y_mean', 0)
                    
                    # Add beta coefficients for each X-variable (flattened)
                    coefficients = metrics.get('betas', {}).get('coefficients', {})
                    for x_var in x_variables:
                        beta_key = f"{x_var}_beta"
                        summary_row[beta_key] = coefficients.get(x_var, 0)
                    
                    # Add elasticity values for each X-variable (flattened)
                    elasticities = metrics.get('elasticities', {})
                    for x_var in x_variables:
                        elasticity_key = f"{x_var}_elasticity"
                        summary_row[elasticity_key] = elasticities.get(x_var, 0)
                    
                    # Add contribution values for each X-variable (flattened)
                    contributions = metrics.get('contributions', {})
                    for x_var in x_variables:
                        contribution_key = f"{x_var}_contribution"
                        summary_row[contribution_key] = contributions.get(x_var, 0)
                          
                    summary_data.append(summary_row)
            
            if not summary_data:
                logger.warning("No valid individual combination metrics to save")
                return
            
            # Create DataFrame
            summary_df = pd.DataFrame(summary_data)
            
            # Create file key for MinIO
            file_key = f"stack-modeling/individual-combination-metrics/{run_id}/individual_combination_metrics_{timestamp}.arrow"
            
            # Convert to Arrow format
            arrow_buffer = BytesIO()
            table = pa.Table.from_pandas(summary_df)
            feather.write_feather(table, arrow_buffer)
            arrow_buffer.seek(0)
            
            # Save to MinIO
            minio_client.put_object(
                bucket_name,
                file_key,
                arrow_buffer,
                length=arrow_buffer.getbuffer().nbytes,
                content_type='application/vnd.apache.arrow.file'
            )
            
            logger.info(f"Individual combination metrics saved to MinIO: {file_key}")
            logger.info(f"Saved {len(summary_data)} individual combination metric records")
            
        except Exception as e:
            logger.error(f"Error saving individual combination metrics to MinIO: {e}")
            raise
    
    async def get_combination_betas(
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
        Get combination betas using pooled regression approach.
        This method trains models and returns only the final betas for each combination.
        """
        try:
            
            # First, train the models using the existing method
            training_result = await self.train_models_for_stacked_data(
                scope_number=scope_number,
                combinations=combinations,
                pool_by_identifiers=pool_by_identifiers,
                x_variables=x_variables,
                y_variable=y_variable,
                minio_client=minio_client,
                bucket_name=bucket_name,
                apply_clustering=apply_clustering,
                numerical_columns_for_clustering=numerical_columns_for_clustering,
                n_clusters=n_clusters,
                apply_interaction_terms=apply_interaction_terms,
                numerical_columns_for_interaction=numerical_columns_for_interaction,
                standardization=standardization,
                k_folds=k_folds,
                models_to_run=models_to_run,
                custom_configs=custom_configs,
                price_column=price_column,
                run_id=run_id
            )
            
            # Extract model results from training
            combination_betas_list = []
            all_combinations = set()
            
            for stack_result in training_result.stack_model_results:
                for model_result in stack_result.model_results:
                    model_betas = self.calculate_combination_betas(
                        model_results=[model_result.dict()],
                        combinations=combinations,
                        x_variables=x_variables,
                        numerical_columns_for_interaction=numerical_columns_for_interaction
                    )
                    
                    for combination_key, betas in model_betas.items():
                        model_name = combination_key.split('_', 1)[0]  
                        combination = combination_key.split('_', 1)[1] if '_' in combination_key else combination_key
                        
                        # Remove intercept from coefficients
                        coefficients = {k: v for k, v in betas.items() if k != 'intercept'}
                        
                        combination_beta = {
                            'combination': combination,
                            'model_name': model_name,
                            'intercept': betas.get('intercept', 0.0),
                            'coefficients': coefficients
                        }
                        
                        combination_betas_list.append(combination_beta)
                        all_combinations.add(combination)
            
            # Prepare response
            from .schemas import CombinationBetasResponse
            response = CombinationBetasResponse(
                scope_id=f"scope_{scope_number}",
                set_name=f"Scope_{scope_number}",
                x_variables=x_variables,
                y_variable=y_variable,
                standardization=standardization,
                k_folds=k_folds,
                total_combinations=len(all_combinations),
                combination_betas=combination_betas_list,
                summary={
                    "run_id": run_id,
                    "total_combinations": len(all_combinations),
                    "total_combination_betas": len(combination_betas_list),
                    "clustering_applied": apply_clustering,
                    "interaction_terms_applied": apply_interaction_terms and apply_clustering,
                    "models_used": models_to_run or ["All available models"]
                }
            )
            
            return response
            
        except Exception as e:
            logger.error(f"Error in combination betas calculation: {str(e)}")
            raise