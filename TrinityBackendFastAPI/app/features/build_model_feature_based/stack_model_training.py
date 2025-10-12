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
        variable_configs: Optional[Dict[str, Dict[str, Any]]] = None,
        minio_client = None,
        bucket_name: str = None,
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
        test_size: float = 0.2,
        run_id: str = None,
        # Constraint parameters
        negative_constraints: List[str] = None,
        positive_constraints: List[str] = None
    ) -> Dict[str, Any]:
        """
        Complete stack model training workflow.
        
        Returns:
            Dictionary with training results, saved model counts, and MinIO file path
        """
        try:
            # Validate clustering columns if provided

            
            prepare_result = await self.processor.prepare_stack_model_data(
                scope_number=scope_number,
                combinations=combinations,
                pool_by_identifiers=pool_by_identifiers,
                x_variables=x_variables,
                y_variable=y_variable,
                minio_client=minio_client,
                bucket_name=bucket_name,
                n_clusters=n_clusters,
                clustering_columns=numerical_columns_for_clustering
            )
            
            if prepare_result.get('status') != 'success':
                raise Exception(f"Failed to prepare stacked data: {prepare_result.get('error', 'Unknown error')}")
            
            # Get the split clustered data from prepare_result
            split_clustered_data = prepare_result.get('split_clustered_data', {})
            
            # Clustering is already handled in prepare_stack_model_data
            # No need for additional clustering logic here
        
            
            # Convert parameters to lowercase for consistent matching
            x_variables_lower = [col.lower() for col in x_variables]
            y_variable_lower = y_variable.lower()
            
            # Debug: Log constraint parameters being passed to processor
            logger.info(f"🔍 DEBUG: Passing constraints to processor:")
            logger.info(f"  - negative_constraints: {negative_constraints}")
            logger.info(f"  - positive_constraints: {positive_constraints}")
            
            # Convert variable_configs keys to lowercase for consistency
            variable_configs_lower = {}
            if variable_configs:
                for var, config in variable_configs.items():
                    variable_configs_lower[var.lower()] = config
                logger.info(f"🔧 Variable configs for stack modeling: {variable_configs_lower}")
            
            # Use the processor to train models on stacked data
            training_results = await self.processor.process_split_clustered_data(
                split_clustered_data=split_clustered_data,
                x_variables_lower=x_variables_lower,
                y_variable_lower=y_variable_lower,
                variable_configs=variable_configs_lower,  # Pass per-variable transformations
                standardization=standardization,  
                k_folds=k_folds,
                models_to_run=models_to_run,
                custom_configs=custom_configs,
                price_column=price_column.lower() if price_column else None,
                test_size=test_size,    
                apply_interaction_terms=apply_interaction_terms,
                numerical_columns_for_interaction=numerical_columns_for_interaction,
                run_id=run_id,
                negative_constraints=negative_constraints,
                positive_constraints=positive_constraints
            )
            
            # Validate training results
            if not training_results:
                raise Exception("❌ No training results returned from process_split_clustered_data")
            
            if not isinstance(training_results, dict):
                raise Exception(f"❌ Invalid training results format. Expected dict, got {type(training_results)}")
            
            # Check if we have any valid results
            # A result is valid if it has no error (error is None or missing) AND has model_results
            logger.info(f"🔍 DEBUG: Validating results...")
            for split_key, result in training_results.items():
                has_error = bool(result.get('error'))
                has_model_results = bool(result.get('model_results'))
                logger.info(f"   📊 {split_key}: has_error={has_error}, has_model_results={has_model_results}, error_value='{result.get('error')}'")
            
            valid_results = [k for k, v in training_results.items() if not v.get('error') and v.get('model_results')]
            logger.info(f"🔍 DEBUG: Found {len(valid_results)} valid results: {valid_results}")
            if not valid_results:
                error_details = []
                for split_key, result in training_results.items():
                    if result.get('error'):
                        error_details.append(f"{split_key}: {result['error']}")
                    elif not result.get('model_results'):
                        error_details.append(f"{split_key}: No model results")
                    else:
                        error_details.append(f"{split_key}: Unknown issue")
                
                raise Exception(f"❌ No valid model results found. Errors: {error_details}")
            
            logger.info(f"✅ Training completed successfully for {len(valid_results)} split clusters")
            logger.info(f"   Valid clusters: {valid_results}")
             
            # Convert training results to match individual model format
            from .schemas import StackModelResults, StackModelResult
            split_cluster_results = []
            for split_key, result in training_results.items():
                if not result.get('error'):  # No error (error is None or missing)
                    # Convert model results to simplified format (beta coefficients only)
                    simplified_model_results = []
                    for model_result in result.get('model_results', []):
                        # Debug: Log the model result structure
                 
                        
                        # Check for missing required fields
                        missing_fields = []
                        required_fields = ['coefficients', 'intercept', 'aic', 'bic', 'n_parameters']
                        for field in required_fields:
                            if field not in model_result:
                                missing_fields.append(field)
                        
                        if missing_fields:
                            logger.error(f"❌ Missing required fields in model result: {missing_fields}")
                            logger.error(f"❌ Model result: {model_result}")
                            # Provide default values for missing fields
                            for field in missing_fields:
                                if field == 'coefficients':
                                    model_result[field] = {}
                                elif field in ['intercept', 'aic', 'bic']:
                                    model_result[field] = 0.0
                                elif field == 'n_parameters':
                                    model_result[field] = 0
                                logger.warning(f"⚠️ Added default value for {field}: {model_result[field]}")
                        
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
                            n_parameters=model_result.get('n_parameters', 0),
                            # Auto-tuning results
                            best_alpha=model_result.get('best_alpha', None),
                            best_cv_score=model_result.get('best_cv_score', None),
                            best_l1_ratio=model_result.get('best_l1_ratio', None),
                            # Additional fields for consistency
   
                            train_size=model_result.get('train_size', 0),
                            test_size=model_result.get('test_size', 0)
                        )
                        simplified_model_results.append(simplified_model)
                    
                    # Convert to StackModelResults format
                    split_cluster_result = StackModelResults(
                        split_clustered_data_id=split_key,
                        file_key=f"stack_model_{split_key}",  
                        total_records=result.get('total_records', 0),
                        model_results=simplified_model_results
                    )
                    split_cluster_results.append(split_cluster_result)
            

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
                    "clustering_result": None  # Clustering is handled in prepare_stack_model_data
                }
            )
            
            return response
            
        except Exception as e:
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
    
    
     
    def calculate_combination_betas(self, model_results: List[Dict[str, Any]], combinations: List[str], x_variables: List[str], numerical_columns_for_interaction: List[str], split_cluster_id: str = None, standardization: str = 'none', apply_interaction_terms: bool = True) -> Dict[str, Dict[str, float]]:
        """
        Calculate final beta coefficients for each combination by combining common betas and interaction term betas.
        This method follows the same logic as stack_model_training.py.
        """
        combination_betas = {}
        
        for model_result in model_results:
            model_name = model_result['model_name']
            coefficients = model_result['coefficients']
            intercept = model_result['intercept']
            
            # logger.info(f"Calculating combination betas for model: {model_name}")
            # logger.info(f"Available coefficients: {list(coefficients.keys())}")
            # logger.info(f"Requested combinations: {combinations}")
            
            # Extract combinations that are actually present in this model's coefficients
            # Key patterns:
            # - Beta_encoded_combination_CombName (base combination coefficient)
            # - Beta_encoded_combination_CombName_x_variable (interaction term)
            available_combinations = []
            for key in coefficients.keys():
                if key.startswith('Beta_encoded_combination_'):
                    # Remove prefix to get the combination part
                    combination_part = key.replace('Beta_encoded_combination_', '')
                    
                    # Check if this is an interaction term (contains _x_)
                    if '_x_' in combination_part:
                        # Extract combination name before the _x_ (interaction variable part)
                        combination_name = combination_part.split('_x_')[0]
                    else:
                        # This is a base combination coefficient (no interaction)
                        combination_name = combination_part
                    
                    # Add to available combinations if it matches our requested combinations
                    if combination_name in combinations and combination_name not in available_combinations:
                        available_combinations.append(combination_name)
                        logger.info(f"Found combination: '{combination_name}' from key '{key}'")
            
            # logger.info(f"Available combinations for calculation: {available_combinations}")
            
  
            
            # logger.info(f"Final available combinations: {available_combinations}")
            
            # Calculate final betas only for combinations that are available in this model
            for combination in available_combinations:
                logger.info(f"Calculating final betas for combination: {combination}")
                combination_key = f"{model_name}_{combination}"
                final_betas = {}
                # Calculate final intercept
                combination_intercept_key = f"Beta_encoded_combination_{combination}"
                combination_intercept_beta = coefficients.get(combination_intercept_key, 0.0)
                final_betas['intercept'] = intercept + combination_intercept_beta
                # logger.info(f"Combination intercept key: {combination_intercept_key}")
                # logger.info(f"Combination intercept: {combination_intercept_beta}, Final intercept: {final_betas['intercept']}")
                
                # Calculate final betas for x_variables (main model variables)
                for x_var in x_variables:
                    # Use original variable name (mmm_stack_training.py uses original names throughout)
                    model_var_name = x_var
                    
                    # Common beta for this x_variable (use original variable name)
                    beta_key = f"Beta_{model_var_name}"
                    common_beta = coefficients.get(beta_key, 0.0)
                    # logger.info(f"Common beta for {x_var} (Beta_{model_var_name}): {common_beta}")
                    # logger.info(f"🔍 DEBUG: Looking for coefficient key '{beta_key}', found: {beta_key in coefficients}")
                    if beta_key not in coefficients:
                        logger.warning(f"❌ Coefficient key '{beta_key}' not found in coefficients!")
                        logger.info(f"Available keys containing '{model_var_name}': {[k for k in coefficients.keys() if model_var_name in k]}")

                    # Individual beta for this combination and x_variable (only if interaction terms are enabled)
                    if apply_interaction_terms:
                        interaction_key = f"encoded_combination_{combination}_x_{x_var}"
                        individual_beta = coefficients.get(f"Beta_{interaction_key}", 0.0)
                        # logger.info(f"Individual beta for {x_var} (Beta_{interaction_key}): {individual_beta}")
                    else:
                        individual_beta = 0.0
                        # logger.info(f"Individual beta for {x_var} (interaction terms disabled): {individual_beta}")
                    
                    final_beta = common_beta + individual_beta
                    final_betas[x_var] = final_beta
                    # logger.info(f"Final beta for {x_var}: {final_beta}")
                    
                
                # Calculate final betas for numerical_columns_for_interaction (interaction variables) ONLY if interaction terms are enabled
                if apply_interaction_terms:
                    for interaction_var in numerical_columns_for_interaction:
                        # Only add if it's not already in x_variables to avoid duplication
                        if interaction_var not in x_variables:
                            # Use original variable name (mmm_stack_training.py uses original names throughout)
                            model_var_name = interaction_var
                            
                            # Common beta for this interaction variable (use original variable name)
                            common_beta = coefficients.get(model_var_name, 0.0)
                            
                            # Individual beta for this combination and interaction variable
                            interaction_key = f"encoded_combination_{combination}_x_{interaction_var}"
                            individual_beta = coefficients.get(interaction_key, 0.0)
                            
                            # Final beta = common + individual
                            final_betas[interaction_var] = common_beta + individual_beta
                
                combination_betas[combination_key] = final_betas
                logger.info(f"Stored final betas for {combination_key}: {final_betas}")
        
        # logger.info(f"Final combination_betas result: {combination_betas}")
        
        # Restructure the result to use combination names as keys instead of model_combination keys
        restructured_betas = {}
        for key, betas in combination_betas.items():
            # Extract combination name from model_combination key
            if '_' in key:
                combination_name = '_'.join(key.split('_')[1:])  # Remove model name prefix
                restructured_betas[combination_name] = betas
                logger.info(f"Restructured key '{key}' -> '{combination_name}': {betas}")
        
        # logger.info(f"Restructured combination_betas: {restructured_betas}")
        return restructured_betas
    
    async def calculate_individual_combination_metrics(
        self,
        scope_number: str,
        combinations: List[str],
        pool_by_identifiers: List[str],
        x_variables: List[str],
        y_variable: str,
        variable_configs: Optional[Dict[str, Dict[str, Any]]] = None,
        minio_client = None,
        bucket_name: str = None,
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
        run_id: str = None,
        # Constraint parameters
        negative_constraints: List[str] = None,
        positive_constraints: List[str] = None
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
        # Debug: Log constraint parameters

        
        # Convert variable_configs keys to lowercase for consistency
        variable_configs_lower = {}
        if variable_configs:
            for var, config in variable_configs.items():
                variable_configs_lower[var.lower()] = config
            logger.info(f"🔧 Variable configs: {variable_configs_lower}")
        
        try:
            # Step 1: Train stack models to get betas
            try:
                training_result = await self.train_models_for_stacked_data(
                scope_number=scope_number,
                combinations=combinations,
                pool_by_identifiers=pool_by_identifiers,
                x_variables=x_variables,
                y_variable=y_variable,
                variable_configs=variable_configs,  # Pass per-variable transformations
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
                run_id=run_id,
                negative_constraints=negative_constraints,
                positive_constraints=positive_constraints
                )
            except Exception as e:
                raise
            
            # Step 2: Calculate combination betas from stack model results
            combination_betas_list = []
            all_combinations = set()
            
            for stack_result in training_result.stack_model_results:

                for model_result in stack_result.model_results:
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
                        split_cluster_id=stack_result.split_clustered_data_id,
                        standardization=standardization
                    )
                    
                    for combination_key, betas in model_betas.items():
                        # Since we restructured the keys, combination_key is now just the combination name
                        # But we still need the model_name from the original model_result_dict
                        model_name = model_result_dict['model_name']
                        combination = combination_key  # This is already the combination name after restructuring
                        
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
                stack_model_results=training_result.stack_model_results,
                standardization=standardization,
                variable_configs=variable_configs_lower  # Pass variable configs for destandardization
                )
            except Exception as e:
                raise
            
            # Step 4: Skip separate MinIO saving - results will be included in main individual model results file
            # The stack model results are now merged into the main combination_results and will be saved together
            # with individual model results in the main train-models-direct endpoint
            
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
        stack_model_results: List[Dict[str, Any]],
        standardization: str = 'none',
        variable_configs: Optional[Dict[str, Dict[str, Any]]] = None
    ) -> Dict[str, Any]:
        """
        Calculate metrics for individual combinations using stack modeling betas.
        """
        from .stack_model_data import MMMStackDataPooler
        from sklearn.metrics import mean_absolute_percentage_error
        import numpy as np
        
        data_pooler = MMMStackDataPooler(minio_client, bucket_name)
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
                     'bic': model_result.bic,
                     'coefficients': model_result.coefficients,
    
                     # Auto-tuning results
                     'best_alpha': model_result.best_alpha,
                     'best_cv_score': model_result.best_cv_score,
                     'best_l1_ratio': model_result.best_l1_ratio,
                     'train_size': model_result.train_size,
                     'test_size': model_result.test_size
                 }

        for combination in combinations:
            try:

                df = data_pooler._fetch_combination_file_direct(scope_number, combination)
                if df is None:
                    continue
        
                df.columns = df.columns.str.lower()
                
                # Filter to only include required columns
                required_columns = x_variables + [y_variable]
                available_columns = [col for col in required_columns if col in df.columns]
                missing_columns = [col for col in required_columns if col not in df.columns]
                
                if missing_columns:
                    continue
                
                # Use original data without any global standardization
                # Per-variable transformations were already applied during training
                X_original = df[x_variables].values
                y_original = df[y_variable].values
                y_actual = y_original  # Keep y in original scale for meaningful metrics
                
                combination_metrics = {}
                
                for model_name in betas_by_combination.get(combination, {}):
                    if model_name not in betas_by_combination[combination]:
                        continue
                    
                    betas = betas_by_combination[combination][model_name]
                    
                    # Collect variable statistics for fallback destandardization
                    variable_means = {}
                    variable_stds = {}
                    variable_mins = {}
                    variable_maxs = {}
                    for x_var in x_variables:
                        variable_means[x_var] = df[x_var].mean()
                        variable_stds[x_var] = df[x_var].std()
                        variable_mins[x_var] = df[x_var].min()
                        variable_maxs[x_var] = df[x_var].max()
                    
                    # Debug: Log beta values

                    destandardized_betas = self._destandardize_betas(
                        betas=betas,
                        x_variables=x_variables,
                        variable_configs=variable_configs,
                        transformation_metadata=None,  # Not available from training
                        variable_means=variable_means,
                        variable_stds=variable_stds,
                        variable_mins=variable_mins,
                        variable_maxs=variable_maxs,
                        X_original_df=df[x_variables]
                    )
                    
                    logger.info(f"✅ Using destandardized betas for predictions")
                    
                    # Use original data with destandardized betas for predictions
                    y_pred = self._predict_with_betas(X_original, destandardized_betas, x_variables)
                    

                    
                    # Calculate individual combination metrics using same safe_mape as individual models
                    from .models import safe_mape
                    individual_mape = safe_mape(y_actual, y_pred)
                    individual_r2 = self._calculate_r2(y_actual, y_pred)
                    

                    
                    # Calculate AIC and BIC for individual combination
                    # Use original scale data for meaningful AIC/BIC values
                    n = len(y_actual)
                    k = len(x_variables) + 1  # +1 for intercept
                    
                    # For AIC/BIC, use original scale data (y is already in original scale)
                    # No back-transformation needed since y_actual is in original scale
                    mse = np.mean((y_actual - y_pred) ** 2)
                    log_likelihood = -n/2 * np.log(2 * np.pi * mse) - n/2
                    individual_aic = 2 * k - 2 * log_likelihood
                    individual_bic = k * np.log(n) - 2 * log_likelihood
                    
                    logger.info(f"   AIC: {individual_aic:.2f}, BIC: {individual_bic:.2f}, MSE: {mse:.2f}")
                    
                    # Calculate elasticity and contribution for individual combination
                    elasticities = {}
                    contributions = {}
                    
                    # Get y_mean and y_std from the original individual combination data
                    # Use original data for elasticity calculations (not transformed data)
                    y_mean = df[y_variable].mean()  # Original scale
                    y_std = df[y_variable].std()    # Original scale
                    
                    # Calculate elasticity and contribution for each x_variable
                    # Use destandardized betas and original data for meaningful elasticities
                    for x_var in x_variables:
                        beta_val = destandardized_betas['coefficients'].get(x_var, 0.0)  # Use destandardized beta
                        x_mean = variable_means.get(x_var, 0)  # Original scale
                        
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
                         'variable_means': variable_means,  # Variable means from individual combination data
                         'variable_stds': variable_stds,  # Variable standard deviations from individual combination data
                         'y_mean': y_mean,  # Y variable mean from individual combination data
                         'y_std': y_std,  # Y variable standard deviation from individual combination data
                         'betas': destandardized_betas,  # Destandardized betas (original scale)
                         'standardized_betas': stack_metrics.get('standardized_coefficients', {}),  # Standardized betas from stack modeling
                         # Auto-tuning results from stack modeling
                         'best_alpha': stack_metrics.get('best_alpha', None),
                         'best_cv_score': stack_metrics.get('best_cv_score', None),
                         'best_l1_ratio': stack_metrics.get('best_l1_ratio', None),
                         'train_size': stack_metrics.get('train_size', 0),
                         'test_size': stack_metrics.get('test_size', 0)
                     }
                    
                individual_metrics[combination] = combination_metrics
                
            except Exception as e:
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
    
    
    
    def _destandardize_betas(
        self,
        betas: Dict[str, Any],
        x_variables: List[str],
        variable_configs: Optional[Dict[str, Dict[str, Any]]] = None,
        transformation_metadata: Optional[Dict[str, Any]] = None,
        variable_means: Dict[str, float] = None,
        variable_stds: Dict[str, float] = None,
        variable_mins: Dict[str, float] = None,
        variable_maxs: Dict[str, float] = None,
        X_original_df: Optional[pd.DataFrame] = None
    ) -> Dict[str, Any]:
        """
        Destandardize betas from transformed variables back to original scale using per-variable statistics.
        
        Priority:
        1. Direct statistics from data (variable_means, variable_stds, variable_mins, variable_maxs)
        2. Fallback to transformation_metadata if direct statistics not available
        
        Args:
            betas: Dictionary containing intercept and coefficients from transformed model
            x_variables: List of original x_variables
            variable_configs: Per-variable transformation configurations (type: standard/minmax/media/none)
            transformation_metadata: Metadata from MMMTransformationEngine (fallback source)
            variable_means: Mean values calculated from actual data (PRIMARY source)
            variable_stds: Standard deviation values from actual data (PRIMARY source)
            variable_mins: Minimum values from actual data (PRIMARY source)
            variable_maxs: Maximum values from actual data (PRIMARY source)
            X_original_df: Original dataframe for calculating statistics
            
        Returns:
            Dictionary with destandardized intercept and coefficients
        """
        try:
            destandardized_betas = betas.copy()
            coefficients = betas.get('coefficients', {}).copy()
            intercept = betas.get('intercept', 0.0)
            intercept_adjustment = 0.0
            
            # Per-variable destandardization based on transformation_metadata
            for x_var in x_variables:
                if x_var not in coefficients:
                    continue
                
                coef_value = coefficients[x_var]
                unstandardized_coef = coef_value
                
                # Get variable config
                var_config = variable_configs.get(x_var, {}) if variable_configs else {}
                var_type = var_config.get("type", "none")
                
                # Get transformation metadata for this variable
                transform_meta = transformation_metadata.get(x_var, {}) if transformation_metadata else {}
                
                logger.info(f"🔧 Destandardizing {x_var}: type={var_type}, coef={coef_value}")
                
                if var_type == "media":
                    # For media variables with complex transformations (adstock, logistic, etc.)
                    # The coefficients are already in the right scale for the transformed features
                    # We keep them as-is because they represent the relationship in transformed space
                    unstandardized_coef = coef_value
                    logger.info(f"   Media variable: keeping coefficient as-is = {unstandardized_coef}")
                    
                elif var_type == "standard":
                    # Back-transform from standardization
                    # Priority 1: Use direct statistics from actual data
                    if variable_stds and x_var in variable_stds:
                        std_val = variable_stds[x_var]
                        mean_val = variable_means.get(x_var, 0) if variable_means else 0
                        if std_val != 0:
                            unstandardized_coef = coef_value / std_val
                            intercept_adjustment += unstandardized_coef * mean_val
                            logger.info(f"   Standard: destandardized coef = {unstandardized_coef} (using data stats: mean={mean_val:.4f}, std={std_val:.4f})")
                    # Priority 2: Fallback to transformation metadata
                    elif transform_meta and "original_std" in transform_meta:
                        original_std = transform_meta["original_std"]
                        original_mean = transform_meta.get("original_mean", 0)
                        if original_std != 0:
                            unstandardized_coef = coef_value / original_std
                            intercept_adjustment += unstandardized_coef * original_mean
                            logger.info(f"   Standard (metadata): destandardized coef = {unstandardized_coef}, mean={original_mean}, std={original_std}")
                    
                elif var_type == "minmax":
                    # Back-transform from minmax
                    # Priority 1: Use direct statistics from actual data
                    if variable_mins and variable_maxs and x_var in variable_mins and x_var in variable_maxs:
                        min_val = variable_mins[x_var]
                        max_val = variable_maxs[x_var]
                        range_val = max_val - min_val
                        if range_val != 0:
                            unstandardized_coef = coef_value / range_val
                            intercept_adjustment += unstandardized_coef * min_val
                            logger.info(f"   MinMax: destandardized coef = {unstandardized_coef} (using data stats: min={min_val:.4f}, max={max_val:.4f}, range={range_val:.4f})")
                    # Priority 2: Fallback to transformation metadata
                    elif transform_meta and "original_min" in transform_meta and "original_max" in transform_meta:
                        original_min = transform_meta["original_min"]
                        original_max = transform_meta["original_max"]
                        original_range = original_max - original_min
                        if original_range != 0:
                            unstandardized_coef = coef_value / original_range
                            intercept_adjustment += unstandardized_coef * original_min
                            logger.info(f"   MinMax (metadata): destandardized coef = {unstandardized_coef}, range={original_range}")
                    
                else:  # "none" or unknown
                    # No transformation applied, keep coefficient as-is
                    unstandardized_coef = coef_value
                    logger.info(f"   No transformation: keeping coefficient as-is = {unstandardized_coef}")
                
                coefficients[x_var] = unstandardized_coef
            
            # Destandardize intercept
            destandardized_betas['intercept'] = intercept - intercept_adjustment
            destandardized_betas['coefficients'] = coefficients
            
            logger.info(f"✅ Destandardized betas: intercept={destandardized_betas['intercept']}, coefficients={coefficients}")
            
            return destandardized_betas
            
        except Exception as e:
            logger.error(f"❌ Error in per-variable destandardization: {e}")
            import traceback
            logger.error(traceback.format_exc())
            # Return original betas if destandardization fails
            return betas
    

    
    def _standardize_X_only(self, X, standardization):
        """Standardize only X features, not y variable."""
        try:
            import numpy as np
            from sklearn.preprocessing import StandardScaler, MinMaxScaler
            
            if standardization == 'standard':
                scaler_X = StandardScaler()
                X_scaled = scaler_X.fit_transform(X)
                return X_scaled
                
            elif standardization == 'minmax':
                scaler_X = MinMaxScaler()
                X_scaled = scaler_X.fit_transform(X)
                return X_scaled
                
            else:
                # No standardization
                return X
                
        except Exception as e:
            logger.error(f"Error standardizing X only: {e}")
            # Return original X if standardization fails
            return X
    
