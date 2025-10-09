# app/features/build_model_feature_based/ensemble_calculation.py

import numpy as np
import pandas as pd
import logging
from typing import Dict, List, Any, Tuple
from collections import defaultdict, Counter

logger = logging.getLogger(__name__)

class EnsembleCalculator:
    """
    Ensemble Calculator for MMM Model Results
    
    This class handles the ensemble calculation for different model types by:
    1. Grouping models by model type (e.g., Linear Regression, Ridge Regression)
    2. Finding the best MAPE for each model type
    3. Calculating weights using exponential weighting based on MAPE performance
    4. Computing weighted averages for all metrics (betas, elasticities, contributions, ROI)
    5. Producing single ensemble results for each model type
    """
    
    def __init__(self):
        self.ensemble_results = {}
        
    def _generate_model_key(self, model_result: Dict[str, Any], combination_id: str) -> str:
        """
        Generate unique key for model result to ensure proper identification.
        
        Args:
            model_result: Model result dictionary
            combination_id: The combination ID
            
        Returns:
            Unique string key for this model result
        """
        model_name = model_result.get('model_name', 'unknown')
        parameter_combination = model_result.get('parameter_combination', {})
        variable_configs = model_result.get('variable_configs', {})
        
        # Create hash of parameter combination and variable configs for uniqueness
        import hashlib
        import json
        
        # Combine all identifying parameters
        identifying_data = {
            'model_name': model_name,
            'parameter_combination': parameter_combination,
            'variable_configs': variable_configs,
            'combination_id': combination_id
        }
        
        # Create deterministic hash
        data_string = json.dumps(identifying_data, sort_keys=True, default=str)
        param_hash = hashlib.md5(data_string.encode()).hexdigest()[:8]
        
        model_key = f"{combination_id}_{model_name}_{param_hash}"
        logger.debug(f"Generated model key: {model_key} for {model_name} in {combination_id}")
        
        return model_key
        
    def calculate_ensemble_results(self, combination_results: List[Dict[str, Any]]) -> Dict[str, Any]:
        """
        Calculate ensemble results for all combinations and model types.
        
        Args:
            combination_results: List of combination results from MMM training
            
        Returns:
            Dict containing ensemble results for each combination and model type
        """
        logger.info("Starting ensemble calculation for MMM model results")
        
        ensemble_results = {}
        
        for combo_result in combination_results:
            combination_id = combo_result.get('combination_id')
            
            # Validate combination_id exists and is not None/empty
            if not combination_id or combination_id == 'unknown':
                logger.error(f"Invalid combination_id found: {combination_id}")
                continue
                
            # Ensure this combination_id is unique in our processing
            if combination_id in ensemble_results:
                logger.warning(f"Duplicate combination_id found: {combination_id}")
                continue
                
            model_results = combo_result.get('model_results', [])
            
            logger.info(f"Processing combination: {combination_id} with {len(model_results)} models")
            
            if not model_results:
                logger.warning(f"No model results found for combination: {combination_id}")
                continue
            
            # Validate model_results belong to this combination and add tracking
            validated_model_results = []
            for i, model_result in enumerate(model_results):
                # Add combination_id to each model result for validation
                model_result_copy = model_result.copy()
                model_result_copy['_source_combination'] = combination_id
                model_result_copy['_model_index'] = i
                
                # Generate unique model key for this model result
                model_key = self._generate_model_key(model_result_copy, combination_id)
                model_result_copy['_model_key'] = model_key
                
                validated_model_results.append(model_result_copy)
            
            # Calculate ensemble results for this combination
            combination_ensemble = self._calculate_combination_ensemble(validated_model_results, combination_id)
            ensemble_results[combination_id] = combination_ensemble
            
        logger.info(f"Completed ensemble calculation for {len(ensemble_results)} combinations")
        return ensemble_results
    
    def _calculate_combination_ensemble(self, model_results: List[Dict[str, Any]], combination_id: str) -> Dict[str, Any]:
        """
        Calculate ensemble results for a single combination.
        
        Args:
            model_results: List of model results for a single combination
            combination_id: The combination ID for validation
            
        Returns:
            Dict containing ensemble results grouped by model type
        """
        # Group models by model type with validation
        models_by_type = defaultdict(list)
        
        for model_result in model_results:
            # Validate model belongs to this combination
            if model_result.get('_source_combination') != combination_id:
                logger.error(f"Model result from wrong combination: {model_result.get('_source_combination')} != {combination_id}")
                continue
                
            model_name = model_result.get('model_name', 'unknown')
            model_key = model_result.get('_model_key', 'unknown_key')
            
            logger.info(f"Adding model {model_name} with key {model_key} to ensemble for combination {combination_id}")
            models_by_type[model_name].append(model_result)
        
        logger.info(f"Grouped models by type for combination {combination_id}: {list(models_by_type.keys())}")
        
        ensemble_by_type = {}
        
        # Calculate ensemble for each model type
        for model_type, type_models in models_by_type.items():
            logger.info(f"Calculating ensemble for {model_type} in combination {combination_id} with {len(type_models)} parameter combinations")
            
            # Log all model keys for this type
            model_keys = [model.get('_model_key') for model in type_models]
            logger.info(f"Model keys for {model_type}: {model_keys}")
            
            ensemble_result = self._calculate_model_type_ensemble(model_type, type_models, combination_id)
            ensemble_by_type[model_type] = ensemble_result
            
        return ensemble_by_type
    
    def _calculate_model_type_ensemble(self, model_type: str, model_results: List[Dict[str, Any]], combination_id: str) -> Dict[str, Any]:
        """
        Calculate ensemble result for a single model type with multiple parameter combinations.
        
        Args:
            model_type: Name of the model type (e.g., "Linear Regression")
            model_results: List of model results for this model type
            combination_id: The combination ID for validation
            
        Returns:
            Dict containing weighted ensemble result
        """
        logger.info(f"🔍 _calculate_model_type_ensemble called for {model_type} in {combination_id} with {len(model_results)} results")
        
        if not model_results:
            logger.warning(f"No model results provided for {model_type} in combination {combination_id}")
            return {}
            
        # Validate all models belong to same combination
        for model_result in model_results:
            if model_result.get('_source_combination') != combination_id:
                logger.error(f"Model {model_result.get('_model_key')} from wrong combination in {model_type} ensemble!")
                return {}
        
        logger.info(f"✅ All models validated for {model_type} in {combination_id}")
            
        # Extract MAPE test values for weighting
        logger.info(f"🔍 Extracting MAPE test values for {model_type}")
        mape_test_values = []
        for i, model_result in enumerate(model_results):
            mape_test = model_result.get('mape_test', float('inf'))
            logger.info(f"🔍 Model {i}: mape_test = {mape_test}")
            if mape_test != float('inf'):
                mape_test_values.append(mape_test)
        
        logger.info(f"🔍 Valid MAPE test values: {mape_test_values}")
        
        if not mape_test_values:
            logger.warning(f"No valid MAPE test values found for {model_type}")
            return {}
            
        # Find best MAPE for this model type
        best_mape = min(mape_test_values)
        logger.info(f"Best MAPE for {model_type}: {best_mape}")
        
        # Calculate weights using exponential weighting formula
        logger.info(f"🔍 Calculating weights for {model_type}")
        weights = []
        valid_results = []
        
        for i, model_result in enumerate(model_results):
            mape_test = model_result.get('mape_test', float('inf'))
            logger.info(f"🔍 Model {i}: mape_test = {mape_test}, best_mape = {best_mape}")
            if mape_test != float('inf'):
                # Weight formula: exp(-0.5 * (mape_test - best_mape))
                weight = np.exp(-0.5 * (mape_test - best_mape))
                logger.info(f"🔍 Model {i}: calculated weight = {weight}")
                weights.append(weight)
                valid_results.append(model_result)
            else:
                logger.warning(f"⚠️ Model {i}: mape_test is inf, skipping")
        
        logger.info(f"🔍 Calculated {len(weights)} weights: {weights}")
        logger.info(f"🔍 Valid results count: {len(valid_results)}")
        
        # Normalize weights
        total_weight = sum(weights)
        if total_weight > 0:
            normalized_weights = [w / total_weight for w in weights]
        else:
            normalized_weights = [1.0 / len(weights)] * len(weights)
            
        logger.info(f"Calculated {len(normalized_weights)} weights for {model_type}: {normalized_weights}")
        
        # Calculate weighted ensemble metrics
        logger.info(f"🔍 Starting weighted metrics calculation for {model_type} with {len(valid_results)} results")
        try:
            ensemble_result = self._calculate_weighted_metrics(valid_results, normalized_weights)
            logger.info(f"✅ Successfully calculated weighted metrics for {model_type}")
        except Exception as e:
            logger.error(f"❌ Error in weighted metrics calculation for {model_type}: {str(e)}")
            import traceback
            logger.error(f"   Traceback: {traceback.format_exc()}")
            return {}
        
        # Add ensemble metadata with model keys and combination tracking
        logger.info(f"🔍 Creating ensemble metadata for {model_type}")
        try:
            ensemble_result['ensemble_metadata'] = {
                'model_type': model_type,
                'combination_id': combination_id,
                'num_combinations': len(valid_results),
                'best_mape': best_mape,
                'weights': normalized_weights,
                'mape_values': [r.get('mape_test') for r in valid_results],
                'model_keys': [r.get('_model_key') for r in valid_results],
                'model_indices': [r.get('_model_index') for r in valid_results],
                'source_combinations': [r.get('_source_combination') for r in valid_results]
            }
            logger.info(f"✅ Successfully created ensemble metadata for {model_type}")
        except Exception as e:
            logger.error(f"❌ Error creating ensemble metadata for {model_type}: {str(e)}")
            ensemble_result['ensemble_metadata'] = {}
        
        logger.info(f"🔍 Returning ensemble result for {model_type}")
        return ensemble_result
    
    def _calculate_weighted_metrics(self, model_results: List[Dict[str, Any]], weights: List[float]) -> Dict[str, Any]:
        """
        Calculate weighted averages for all metrics.
        
        Args:
            model_results: List of model results
            weights: List of normalized weights
            
        Returns:
            Dict containing weighted ensemble metrics
        """
        logger.info(f"🔍 _calculate_weighted_metrics called with {len(model_results)} results and {len(weights)} weights")
        
        if not model_results or not weights:
            logger.warning("⚠️ Empty model_results or weights, returning empty dict")
            return {}
            
        # Initialize weighted metrics
        weighted_metrics = {}
        logger.info("🔍 Initialized weighted_metrics dict")
        
        # Performance metrics (most should be weighted averages)
        performance_metrics = ['mape_train', 'mape_test', 'r2_train', 'r2_test', 'aic', 'bic']
        logger.info(f"🔍 Processing {len(performance_metrics)} performance metrics: {performance_metrics}")
        
        for metric in performance_metrics:
            logger.info(f"🔍 Processing metric: {metric}")
            values = [result.get(metric, 0) for result in model_results]
            logger.info(f"🔍 Extracted values for {metric}: {values}")
            try:
                weighted_metrics[metric] = self._weighted_average(values, weights)
                logger.info(f"✅ Calculated weighted average for {metric}: {weighted_metrics[metric]}")
            except Exception as e:
                logger.error(f"❌ Error calculating weighted average for {metric}: {str(e)}")
                weighted_metrics[metric] = 0
        
        # n_parameters should be an integer (use the mode or average rounded)
        n_parameters_values = [result.get('n_parameters', 0) for result in model_results]
        if n_parameters_values:
            # Use the most common value, or if tied, use the average rounded
            param_counts = Counter(n_parameters_values)
            most_common = param_counts.most_common(1)[0]
            if most_common[1] > 1:  # If there's a clear mode
                weighted_metrics['n_parameters'] = int(most_common[0])
            else:  # Use weighted average rounded
                weighted_metrics['n_parameters'] = int(round(self._weighted_average(n_parameters_values, weights)))
        else:
            weighted_metrics['n_parameters'] = 0
        
        # Intercept
        intercepts = [result.get('intercept', 0) for result in model_results]
        weighted_metrics['intercept'] = self._weighted_average(intercepts, weights)
        
        # Coefficients (weighted average of standardized coefficient dictionaries)
        weighted_metrics['coefficients'] = self._weighted_standardized_coefficients(model_results, weights)
        
        # Price elasticity
        elasticities = [result.get('price_elasticity', 0) for result in model_results]
        weighted_metrics['price_elasticity'] = self._weighted_average(elasticities, weights)
        
        # Elasticities dictionary (per-variable elasticities)
        weighted_metrics['elasticities'] = self._weighted_elasticities(model_results, weights)
        
        # Contributions
        weighted_metrics['contributions'] = self._weighted_contributions(model_results, weights)
        
        # ROI results
        weighted_metrics['roi_results'] = self._weighted_roi_results(model_results, weights)
        
        # Transformation metadata (calculate weighted averages for all transformation parameters)
        weighted_metrics['transformation_metadata'] = self._calculate_weighted_transformation_metadata(model_results, weights)
        
        # Variable configs (use the best performing model's configs)
        best_idx = weights.index(max(weights))
        weighted_metrics['variable_configs'] = model_results[best_idx].get('variable_configs', {})
        
        # Calculate weighted transformation parameters
        weighted_metrics['weighted_transformation_parameters'] = self._calculate_weighted_transformation_parameters(model_results, weights)
        
        # Ensure all values are proper Python types (not numpy types)
        weighted_metrics = self._convert_to_python_types(weighted_metrics)
        
        return weighted_metrics
    
    def _convert_to_python_types(self, data: Any) -> Any:
        """Convert numpy types to Python native types for Pydantic compatibility."""
        import numpy as np
        
        if isinstance(data, dict):
            return {key: self._convert_to_python_types(value) for key, value in data.items()}
        elif isinstance(data, list):
            return [self._convert_to_python_types(item) for item in data]
        elif isinstance(data, np.integer):
            return int(data)
        elif isinstance(data, np.floating):
            return float(data)
        elif isinstance(data, np.ndarray):
            return data.tolist()
        else:
            return data
    
    def _calculate_weighted_transformation_parameters(self, model_results: List[Dict[str, Any]], weights: List[float]) -> Dict[str, Any]:
        """
        Calculate weighted averages of transformation parameters.
        
        Args:
            model_results: List of model results with variable_configs
            weights: List of normalized weights
            
        Returns:
            Dict containing weighted transformation parameters
        """
        if not model_results or not weights:
            return {}
        
        # Collect all variable names from all model results
        all_variables = set()
        for result in model_results:
            variable_configs = result.get('variable_configs', {})
            all_variables.update(variable_configs.keys())
        
        weighted_params = {}
        
        for var_name in all_variables:
            var_params = {}
            var_weights = []
            valid_results = []
            
            # Collect parameters for this variable across all model results
            for result in model_results:
                variable_configs = result.get('variable_configs', {})
                if var_name in variable_configs:
                    var_config = variable_configs[var_name]
                    var_params[var_name] = var_config
                    var_weights.append(weights[len(valid_results)])
                    valid_results.append(var_config)
            
            if not valid_results:
                continue
            
            # Calculate weighted parameters for this variable
            weighted_var_config = {
                "type": valid_results[0].get("type", "none")  # Type should be the same for all
            }
            
            # Weighted average for numeric parameters
            numeric_params = [
                "adstock_decay", "logistic_growth", "logistic_midpoint", "logistic_carryover",
                "standardization_mean", "standardization_scale", "minmax_min", "minmax_scale"
            ]
            
            for param in numeric_params:
                values = []
                for config in valid_results:
                    if param in config:
                        try:
                            value = float(config[param])
                            values.append(value)
                        except (ValueError, TypeError):
                            continue
                
                if values:
                    weighted_var_config[param] = self._weighted_average(values, var_weights)
            
            weighted_params[var_name] = weighted_var_config
        
        return weighted_params
    
    def _weighted_average(self, values: List[float], weights: List[float]) -> float:
        """Calculate weighted average of values."""
        logger.info(f"🔍 _weighted_average called with values: {values}, weights: {weights}")
        
        if not values or not weights:
            logger.warning("⚠️ Empty values or weights in _weighted_average, returning 0.0")
            return 0.0
        
        # Check for None values that could cause multiplication errors
        none_values = [i for i, v in enumerate(values) if v is None]
        if none_values:
            logger.error(f"❌ Found None values at indices {none_values} in values: {values}")
            # Replace None values with 0
            values = [0.0 if v is None else v for v in values]
            logger.info(f"🔧 Replaced None values with 0: {values}")
        
        try:
            result = sum(v * w for v, w in zip(values, weights))
            logger.info(f"✅ Calculated weighted average: {result}")
            return result
        except Exception as e:
            logger.error(f"❌ Error in weighted average calculation: {str(e)}")
            logger.error(f"   Values: {values}")
            logger.error(f"   Weights: {weights}")
            return 0.0
    

    
    def _weighted_standardized_coefficients(self, model_results: List[Dict[str, Any]], weights: List[float]) -> Dict[str, float]:
        """Calculate weighted standardized coefficients."""
        # Get all standardized coefficient keys
        all_coef_keys = set()
        for result in model_results:
            standardized_coefficients = result.get('standardized_coefficients', {})
            all_coef_keys.update(standardized_coefficients.keys())
        
        weighted_coefficients = {}
        for key in all_coef_keys:
            values = []
            for result in model_results:
                standardized_coefficients = result.get('standardized_coefficients', {})
                values.append(standardized_coefficients.get(key, 0))
            weighted_coefficients[key] = self._weighted_average(values, weights)
        
        logger.info(f"Weighted coefficients: {weighted_coefficients}")
        logger.info(f"Weights: {weights}")
        logger.info(f"values: {values}")
        
        return weighted_coefficients
    
    def _weighted_elasticities(self, model_results: List[Dict[str, Any]], weights: List[float]) -> Dict[str, float]:
        """Calculate weighted elasticities."""
        # Get all elasticity keys
        all_elasticity_keys = set()
        for result in model_results:
            elasticities = result.get('elasticities', {})
            all_elasticity_keys.update(elasticities.keys())
        
        weighted_elasticities = {}
        for key in all_elasticity_keys:
            values = []
            for result in model_results:
                elasticities = result.get('elasticities', {})
                values.append(elasticities.get(key, 0))
            weighted_elasticities[key] = self._weighted_average(values, weights)
        
        return weighted_elasticities
    
    def _weighted_contributions(self, model_results: List[Dict[str, Any]], weights: List[float]) -> Dict[str, float]:
        """Calculate weighted contributions."""
        # Get all contribution keys
        all_contribution_keys = set()
        for result in model_results:
            contributions = result.get('contributions', {})
            all_contribution_keys.update(contributions.keys())
        
        weighted_contributions = {}
        for key in all_contribution_keys:
            values = []
            for result in model_results:
                contributions = result.get('contributions', {})
                values.append(contributions.get(key, 0))
            weighted_contributions[key] = self._weighted_average(values, weights)
        
        return weighted_contributions
    
    def _weighted_roi_results(self, model_results: List[Dict[str, Any]], weights: List[float]) -> Dict[str, Any]:
        """Calculate weighted ROI results."""
        # Get all ROI result keys
        all_roi_keys = set()
        for result in model_results:
            roi_results = result.get('roi_results', {})
            all_roi_keys.update(roi_results.keys())
        
        weighted_roi_results = {}
        for key in all_roi_keys:
            # Check if ROI results are dictionaries (which they should be based on MMM training)
            roi_results_sample = None
            for result in model_results:
                roi_results = result.get('roi_results', {})
                if key in roi_results:
                    roi_results_sample = roi_results[key]
                    break
            
            if isinstance(roi_results_sample, dict):
                # For nested ROI results, calculate weighted average of numeric values
                weighted_nested = {}
                # Get all nested keys from the first non-empty ROI result
                nested_keys = set()
                for result in model_results:
                    roi_results = result.get('roi_results', {})
                    if key in roi_results and isinstance(roi_results[key], dict):
                        nested_keys.update(roi_results[key].keys())
                
                for nested_key in nested_keys:
                    values_for_key = []
                    for result in model_results:
                        roi_results = result.get('roi_results', {})
                        roi_value = roi_results.get(key, {})
                        if isinstance(roi_value, dict):
                            nested_val = roi_value.get(nested_key, 0)
                            if isinstance(nested_val, (int, float)):
                                values_for_key.append(nested_val)
                    
                    if values_for_key:
                        weighted_nested[nested_key] = self._weighted_average(values_for_key, weights)
                    else:
                        weighted_nested[nested_key] = 0
                
                weighted_roi_results[key] = weighted_nested
            else:
                # Fallback for non-dictionary ROI results (shouldn't happen with MMM)
                values = []
                for result in model_results:
                    roi_results = result.get('roi_results', {})
                    roi_value = roi_results.get(key, 0)
                    if isinstance(roi_value, (int, float)):
                        values.append(roi_value)
                
                if values:
                    weighted_roi_results[key] = self._weighted_average(values, weights)
                else:
                    weighted_roi_results[key] = 0
        
        return weighted_roi_results
    
    def create_ensemble_summary(self, ensemble_results: Dict[str, Any]) -> Dict[str, Any]:
        """
        Create a summary of ensemble results.
        
        Args:
            ensemble_results: Results from calculate_ensemble_results
            
        Returns:
            Dict containing summary statistics
        """
        summary = {
            'total_combinations': len(ensemble_results),
            'model_types': {},
            'overall_performance': {}
        }
        
        all_model_types = set()
        all_mape_values = []
        
        for combination_name, combination_data in ensemble_results.items():
            for model_type, model_data in combination_data.items():
                all_model_types.add(model_type)
                mape_test = model_data.get('mape_test', float('inf'))
                if mape_test != float('inf'):
                    all_mape_values.append(mape_test)
        
        summary['model_types'] = list(all_model_types)
        summary['total_model_types'] = len(all_model_types)
        
        if all_mape_values:
            summary['overall_performance'] = {
                'best_mape': min(all_mape_values),
                'worst_mape': max(all_mape_values),
                'average_mape': np.mean(all_mape_values),
                'mape_std': np.std(all_mape_values)
            }
        
        return summary
    
    def create_validation_summary(self, ensemble_results: Dict[str, Any]) -> Dict[str, Any]:
        """
        Create a comprehensive validation summary for ensemble results.
        
        Args:
            ensemble_results: The ensemble results dictionary
            
        Returns:
            Dict containing validation summary information
        """
        validation_summary = {
            'total_combinations_processed': len(ensemble_results),
            'combination_validation': {},
            'model_validation': {},
            'ensemble_metadata': {}
        }
        
        for combination_id, combination_ensemble in ensemble_results.items():
            validation_summary['combination_validation'][combination_id] = {
                'model_types': list(combination_ensemble.keys()),
                'total_model_types': len(combination_ensemble)
            }
            
            for model_type, ensemble_metrics in combination_ensemble.items():
                ensemble_metadata = ensemble_metrics.get('ensemble_metadata', {})
                
                validation_summary['model_validation'][f"{combination_id}_{model_type}"] = {
                    'combination_id': ensemble_metadata.get('combination_id'),
                    'model_type': ensemble_metadata.get('model_type'),
                    'num_parameter_combinations': ensemble_metadata.get('num_combinations', 0),
                    'model_keys': ensemble_metadata.get('model_keys', []),
                    'source_combinations': ensemble_metadata.get('source_combinations', []),
                    'validation_passed': ensemble_metadata.get('combination_id') == combination_id,
                    'best_mape': ensemble_metadata.get('best_mape'),
                    'weights_count': len(ensemble_metadata.get('weights', []))
                }
                
                # Check for validation issues
                source_combinations = ensemble_metadata.get('source_combinations', [])
                if not all(sc == combination_id for sc in source_combinations):
                    logger.warning(f"Validation issue in {combination_id}_{model_type}: Source combinations don't match!")
                    validation_summary['model_validation'][f"{combination_id}_{model_type}"]['validation_passed'] = False
        
        # Calculate overall validation statistics
        total_models = sum(len(combo) for combo in ensemble_results.values())
        validation_passed_count = sum(
            1 for model_val in validation_summary['model_validation'].values() 
            if model_val.get('validation_passed', False)
        )
        
        validation_summary['overall_stats'] = {
            'total_model_types': total_models,
            'validation_passed': validation_passed_count,
            'validation_failed': total_models - validation_passed_count,
            'validation_success_rate': validation_passed_count / total_models if total_models > 0 else 0
        }
        
        return validation_summary
    
    def _calculate_weighted_transformation_metadata(self, model_results: List[Dict[str, Any]], weights: List[float]) -> Dict[str, Any]:
        """
        Calculate weighted transformation metadata for ensemble results.
        
        Args:
            model_results: List of model results with transformation_metadata
            weights: List of normalized weights
            
        Returns:
            Dict containing weighted transformation metadata
        """
        logger.info(f"🔍 Calculating weighted transformation metadata for {len(model_results)} models")
        
        if not model_results or not weights:
            logger.warning("⚠️ Empty model_results or weights for transformation metadata")
            return {}
        
        # Collect all transformation metadata from all models
        all_transformation_metadata = []
        for i, result in enumerate(model_results):
            metadata = result.get('transformation_metadata', {})
            if metadata:
                all_transformation_metadata.append(metadata)
                logger.info(f"🔍 Model {i}: Found transformation metadata for {len(metadata)} variables")
            else:
                logger.warning(f"⚠️ Model {i}: No transformation metadata found")
        
        if not all_transformation_metadata:
            logger.warning("⚠️ No transformation metadata found in any model")
            return {}
        
        # Get all unique variable names across all models
        all_variables = set()
        for metadata in all_transformation_metadata:
            all_variables.update(metadata.keys())
        
        logger.info(f"🔍 Found {len(all_variables)} unique variables: {list(all_variables)}")
        
        weighted_metadata = {}
        
        for var_name in all_variables:
            logger.info(f"🔍 Processing variable: {var_name}")
            
            # Collect metadata for this variable from all models
            var_metadata_list = []
            var_weights = []
            
            for i, metadata in enumerate(all_transformation_metadata):
                if var_name in metadata:
                    var_metadata_list.append(metadata[var_name])
                    var_weights.append(weights[i])
                    logger.info(f"🔍 Model {i}: Found metadata for {var_name}")
                else:
                    logger.warning(f"⚠️ Model {i}: No metadata for {var_name}")
            
            if not var_metadata_list:
                logger.warning(f"⚠️ No metadata found for variable {var_name}")
                continue
            
            # Calculate weighted averages for this variable
            weighted_var_metadata = self._calculate_weighted_variable_metadata(var_name, var_metadata_list, var_weights)
            weighted_metadata[var_name] = weighted_var_metadata
            
        logger.info(f"✅ Calculated weighted transformation metadata for {len(weighted_metadata)} variables")
        return weighted_metadata
    
    def _calculate_weighted_variable_metadata(self, var_name: str, var_metadata_list: List[Dict[str, Any]], weights: List[float]) -> Dict[str, Any]:
        """
        Calculate weighted metadata for a single variable.
        
        Args:
            var_name: Name of the variable
            var_metadata_list: List of metadata dictionaries for this variable
            weights: List of weights for each metadata
            
        Returns:
            Dict containing weighted metadata for the variable
        """
        logger.info(f"🔍 Calculating weighted metadata for variable: {var_name}")
        
        if not var_metadata_list or not weights:
            logger.warning(f"⚠️ Empty metadata or weights for {var_name}")
            return {}
        
        # Normalize weights for this variable
        total_weight = sum(weights)
        if total_weight > 0:
            normalized_weights = [w / total_weight for w in weights]
        else:
            normalized_weights = [1.0 / len(weights)] * len(weights)
        
        weighted_metadata = {}
        
        # Calculate weighted averages for basic statistics
        basic_stats = ['original_mean', 'original_std', 'original_min', 'original_max', 
                       'final_mean', 'final_std', 'final_min', 'final_max',
                       'adstock_std', 'logistic_mean', 'logistic_max', 'logistic_min']
        
        for stat in basic_stats:
            values = []
            for metadata in var_metadata_list:
                if stat in metadata:
                    try:
                        value = float(metadata[stat])
                        values.append(value)
                    except (ValueError, TypeError):
                        continue
            
            if values:
                weighted_metadata[stat] = self._weighted_average(values, normalized_weights)
                logger.info(f"🔍 {stat}: {weighted_metadata[stat]}")
        
        # Handle transformation_steps (weighted average of each step)
        weighted_metadata['transformation_steps'] = self._calculate_weighted_transformation_steps(var_metadata_list, normalized_weights)
        
        logger.info(f"✅ Calculated weighted metadata for {var_name}")
        return weighted_metadata
    
    def _calculate_weighted_transformation_steps(self, var_metadata_list: List[Dict[str, Any]], weights: List[float]) -> List[Dict[str, Any]]:
        """
        Calculate weighted transformation steps.
        
        Args:
            var_metadata_list: List of metadata dictionaries
            weights: List of normalized weights
            
        Returns:
            List of weighted transformation steps
        """
        logger.info(f"🔍 Calculating weighted transformation steps")
        
        # Collect all transformation steps from all models
        all_steps = []
        for metadata in var_metadata_list:
            steps = metadata.get('transformation_steps', [])
            all_steps.extend(steps)
        
        if not all_steps:
            logger.warning("⚠️ No transformation steps found")
            return []
        
        # Group steps by step type (adstock, standardization, logistic, minmax)
        steps_by_type = {}
        for step in all_steps:
            step_type = step.get('step', 'unknown')
            if step_type not in steps_by_type:
                steps_by_type[step_type] = []
            steps_by_type[step_type].append(step)
        
        weighted_steps = []
        
        # Calculate weighted averages for each step type
        for step_type, steps in steps_by_type.items():
            logger.info(f"🔍 Processing {len(steps)} {step_type} steps")
            
            # Calculate weighted averages for step parameters
            weighted_step = {'step': step_type}
            
            # Common parameters for all steps
            common_params = ['mean', 'std']
            for param in common_params:
                values = []
                for step in steps:
                    if param in step:
                        try:
                            value = float(step[param])
                            values.append(value)
                        except (ValueError, TypeError):
                            continue
                
                if values:
                    # Use equal weights for steps within the same type
                    step_weights = [1.0 / len(values)] * len(values)
                    weighted_step[param] = self._weighted_average(values, step_weights)
            
            # Step-specific parameters
            if step_type == 'adstock':
                param_values = {}
                for param in ['decay_rate']:
                    values = []
                    for step in steps:
                        if param in step:
                            try:
                                value = float(step[param])
                                values.append(value)
                            except (ValueError, TypeError):
                                continue
                    if values:
                        step_weights = [1.0 / len(values)] * len(values)
                        param_values[param] = self._weighted_average(values, step_weights)
                weighted_step.update(param_values)
            
            elif step_type == 'standardization':
                param_values = {}
                for param in ['scaler_mean', 'scaler_scale']:
                    values = []
                    for step in steps:
                        if param in step:
                            try:
                                value = float(step[param])
                                values.append(value)
                            except (ValueError, TypeError):
                                continue
                    if values:
                        step_weights = [1.0 / len(values)] * len(values)
                        param_values[param] = self._weighted_average(values, step_weights)
                weighted_step.update(param_values)
            
            elif step_type == 'logistic':
                param_values = {}
                for param in ['growth_rate', 'midpoint', 'carryover']:
                    values = []
                    for step in steps:
                        if param in step:
                            try:
                                value = float(step[param])
                                values.append(value)
                            except (ValueError, TypeError):
                                continue
                    if values:
                        step_weights = [1.0 / len(values)] * len(values)
                        param_values[param] = self._weighted_average(values, step_weights)
                weighted_step.update(param_values)
            
            elif step_type == 'minmax':
                param_values = {}
                for param in ['scaler_min', 'scaler_scale']:
                    values = []
                    for step in steps:
                        if param in step:
                            try:
                                value = float(step[param])
                                values.append(value)
                            except (ValueError, TypeError):
                                continue
                    if values:
                        step_weights = [1.0 / len(values)] * len(values)
                        param_values[param] = self._weighted_average(values, step_weights)
                weighted_step.update(param_values)
            
            weighted_steps.append(weighted_step)
            logger.info(f"✅ Calculated weighted {step_type} step: {weighted_step}")
        
        logger.info(f"✅ Calculated {len(weighted_steps)} weighted transformation steps")
        return weighted_steps


# Global instance
ensemble_calculator = EnsembleCalculator()
