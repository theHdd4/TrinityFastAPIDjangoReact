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
            combination_name = combo_result.get('combination_id', 'unknown')
            model_results = combo_result.get('model_results', [])
            
            logger.info(f"Processing combination: {combination_name} with {len(model_results)} models")
            
            if not model_results:
                logger.warning(f"No model results found for combination: {combination_name}")
                continue
                
            # Calculate ensemble results for this combination
            combination_ensemble = self._calculate_combination_ensemble(model_results)
            ensemble_results[combination_name] = combination_ensemble
            
        logger.info(f"Completed ensemble calculation for {len(ensemble_results)} combinations")
        return ensemble_results
    
    def _calculate_combination_ensemble(self, model_results: List[Dict[str, Any]]) -> Dict[str, Any]:
        """
        Calculate ensemble results for a single combination.
        
        Args:
            model_results: List of model results for a single combination
            
        Returns:
            Dict containing ensemble results grouped by model type
        """
        # Group models by model type
        models_by_type = defaultdict(list)
        
        for model_result in model_results:
            model_name = model_result.get('model_name', 'unknown')
            models_by_type[model_name].append(model_result)
        
        logger.info(f"Grouped models by type: {list(models_by_type.keys())}")
        
        ensemble_by_type = {}
        
        # Calculate ensemble for each model type
        for model_type, type_models in models_by_type.items():
            logger.info(f"Calculating ensemble for {model_type} with {len(type_models)} parameter combinations")
            
            ensemble_result = self._calculate_model_type_ensemble(model_type, type_models)
            ensemble_by_type[model_type] = ensemble_result
            
        return ensemble_by_type
    
    def _calculate_model_type_ensemble(self, model_type: str, model_results: List[Dict[str, Any]]) -> Dict[str, Any]:
        """
        Calculate ensemble result for a single model type with multiple parameter combinations.
        
        Args:
            model_type: Name of the model type (e.g., "Linear Regression")
            model_results: List of model results for this model type
            
        Returns:
            Dict containing weighted ensemble result
        """
        if not model_results:
            return {}
            
        # Extract MAPE test values for weighting
        mape_test_values = []
        for model_result in model_results:
            mape_test = model_result.get('mape_test', float('inf'))
            if mape_test != float('inf'):
                mape_test_values.append(mape_test)
        
        if not mape_test_values:
            logger.warning(f"No valid MAPE test values found for {model_type}")
            return {}
            
        # Find best MAPE for this model type
        best_mape = min(mape_test_values)
        logger.info(f"Best MAPE for {model_type}: {best_mape}")
        
        # Calculate weights using exponential weighting formula
        weights = []
        valid_results = []
        
        for model_result in model_results:
            mape_test = model_result.get('mape_test', float('inf'))
            if mape_test != float('inf'):
                # Weight formula: exp(-0.5 * (mape_test - best_mape))
                weight = np.exp(-0.5 * (mape_test - best_mape))
                weights.append(weight)
                valid_results.append(model_result)
        
        # Normalize weights
        total_weight = sum(weights)
        if total_weight > 0:
            normalized_weights = [w / total_weight for w in weights]
        else:
            normalized_weights = [1.0 / len(weights)] * len(weights)
            
        logger.info(f"Calculated {len(normalized_weights)} weights for {model_type}: {normalized_weights}")
        
        # Calculate weighted ensemble metrics
        ensemble_result = self._calculate_weighted_metrics(valid_results, normalized_weights)
        
        # Add ensemble metadata
        ensemble_result['ensemble_metadata'] = {
            'model_type': model_type,
            'num_combinations': len(valid_results),
            'best_mape': best_mape,
            'weights': normalized_weights,
            'mape_values': [r.get('mape_test') for r in valid_results]
        }
        
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
        if not model_results or not weights:
            return {}
            
        # Initialize weighted metrics
        weighted_metrics = {}
        
        # Performance metrics (most should be weighted averages)
        performance_metrics = ['mape_train', 'mape_test', 'r2_train', 'r2_test', 'aic', 'bic']
        for metric in performance_metrics:
            values = [result.get(metric, 0) for result in model_results]
            weighted_metrics[metric] = self._weighted_average(values, weights)
        
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
        
        # Transformation metadata (use the best performing model's metadata)
        best_idx = weights.index(max(weights))
        weighted_metrics['transformation_metadata'] = model_results[best_idx].get('transformation_metadata', {})
        
        # Variable configs (use the best performing model's configs)
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
        if not values or not weights:
            return 0.0
        return sum(v * w for v, w in zip(values, weights))
    

    
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


# Global instance
ensemble_calculator = EnsembleCalculator()
