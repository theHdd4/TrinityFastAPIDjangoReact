import pandas as pd
import numpy as np
from typing import Dict, List, Any, Optional, Tuple
import logging
from .database import client, db

logger = logging.getLogger(__name__)

async def calculate_weighted_ensemble_metrics(
    db,
    client_name: str,
    app_name: str,
    project_name: str,
    combination_name: str,
    individual_results_file_key: str
) -> Dict[str, Any]:
    """
    Calculate weighted ensemble metrics including coefficients, transformation metadata, and intercept.
    
    Args:
        db: MongoDB database connection
        client_name: Client name
        app_name: App name
        project_name: Project name
        combination_name: Combination name
        individual_results_file_key: File key for individual model results
    
    Returns:
        Dictionary containing weighted ensemble metrics
    """
    try:
        # Import the weighted ensemble function
        from .service import calculate_weighted_ensemble
        
        # Create ensemble request
        ensemble_request = {
            "file_key": individual_results_file_key,
            "grouping_keys": ['combination_id'],
            "filter_criteria": {"combination_id": combination_name},
            "include_numeric": None,
            "exclude_numeric": None,
            "filtered_models": None
        }
        
        logger.info(f"🔍 Calling calculate_weighted_ensemble for metrics calculation...")
        ensemble_result = calculate_weighted_ensemble(ensemble_request)
        
        if not ensemble_result.get("results") or len(ensemble_result.get("results", [])) == 0:
            logger.warning(f"⚠️ No ensemble data found for combination {combination_name}")
            return {
                "success": False,
                "error": f"No ensemble data found for combination {combination_name}",
                "metrics": {}
            }
        
        ensemble_data = ensemble_result["results"][0]
        weighted_metrics = ensemble_data.get("weighted", {})
        
        # Calculate weighted coefficients
        weighted_coefficients = calculate_weighted_coefficients(weighted_metrics)
        
        # Calculate weighted transformation metadata
        # Create a mock ensemble_data object for the transformation metadata function
        class MockEnsembleData:
            def __init__(self, weighted, model_composition):
                self.weighted = weighted
                self.model_composition = model_composition
        
        mock_ensemble = MockEnsembleData(
            ensemble_data.get("weighted", {}),
            ensemble_data.get("model_composition", {})
        )
        
        weighted_transformation_metadata = await calculate_weighted_transformation_metadata(
            db, client_name, app_name, project_name, combination_name, mock_ensemble
        )
        
        # Calculate weighted intercept
        weighted_intercept = weighted_metrics.get("intercept", 0)
        
        # Calculate weighted contribution and elasticity (if available)
        weighted_contribution = calculate_weighted_contribution(weighted_metrics)
        weighted_elasticity = calculate_weighted_elasticity(weighted_metrics)
        
        # Extract y_variable from weighted metrics or use a default
        y_variable = weighted_metrics.get("y_variable", "")
        
        return {
            "success": True,
            "metrics": {
                "coefficients": weighted_coefficients,
                "intercept": weighted_intercept,
                "transformation_metadata": weighted_transformation_metadata,
                "contribution": weighted_contribution,
                "elasticity": weighted_elasticity,
                "x_variables": [key.replace("Beta_", "") for key in weighted_coefficients.keys()],
                "y_variable": y_variable
            }
        }
        
    except Exception as e:
        logger.error(f"❌ Error calculating weighted ensemble metrics: {str(e)}")
        return {
            "success": False,
            "error": f"Error calculating weighted ensemble metrics: {str(e)}",
            "metrics": {}
        }

def calculate_weighted_coefficients(weighted_metrics: Dict[str, Any]) -> Dict[str, float]:
    """
    Calculate weighted coefficients from ensemble data.
    
    Args:
        weighted_metrics: Weighted metrics from ensemble calculation
    
    Returns:
        Dictionary of weighted coefficients
    """
    coefficients = {}
    
    logger.info(f"🔍 Weighted metrics keys: {list(weighted_metrics.keys())}")
    
    # Extract coefficients from weighted metrics
    for key, value in weighted_metrics.items():
        if key.endswith("_beta") and key != "intercept":
            var_name = key.replace("_beta", "")
            coefficients[f"Beta_{var_name}"] = value
    
    logger.info(f"✅ Calculated {len(coefficients)} weighted coefficients")
    return coefficients

async def calculate_weighted_transformation_metadata(
    db,
    client_name: str,
    app_name: str,
    project_name: str,
    combination_name: str,
    ensemble_data: Any
) -> Dict[str, Any]:
    """
    Calculate weighted transformation metadata for ensemble models.
    
    Args:
        db: MongoDB database connection
        client_name: Client name
        app_name: App name
        project_name: Project name
        combination_name: Combination name
        ensemble_data: Ensemble data containing model weights
    
    Returns:
        Dictionary of weighted transformation metadata
    """
    try:
        # Get the ensemble weights for each model from model_composition
        ensemble_weights = {}
        if hasattr(ensemble_data, 'model_composition'):
            ensemble_weights = ensemble_data.model_composition
        elif 'model_composition' in ensemble_data:
            ensemble_weights = ensemble_data['model_composition']
        
        logger.info(f"🔍 Ensemble weights: {ensemble_weights}")
        
        if not ensemble_weights:
            logger.warning(f"⚠️ No model weights found in ensemble data")
            return {}
        
        # Get all unique variables from the ensemble data
        x_variables = []
        weighted_dict = ensemble_data.weighted if hasattr(ensemble_data, 'weighted') else ensemble_data.get('weighted', {})
        for key in weighted_dict.keys():
            if key.endswith("_beta") and key != "intercept":
                x_variables.append(key.replace("_beta", ""))
        
        weighted_transformation_metadata = {}
        
        # For each variable, calculate weighted transformation metadata
        for var_name in x_variables:
            weighted_transformation_metadata[var_name] = {
                "original_mean": 0,
                "original_std": 0,
                "original_min": 0,
                "original_max": 0,
                "transformation_steps": [],
                "final_mean": 0,
                "final_std": 0,
                "final_min": 0,
                "final_max": 0,
                "adstock_std": 0,
                "logistic_mean": 0,
                "logistic_max": 0,
                "logistic_min": 0
            }
            
            # Weight the transformation metadata from each model
            for model_name, weight in ensemble_weights.items():
                # Get transformation metadata for this model and variable
                from .s_curve import get_transformation_metadata_from_mongodb
                model_transformation = await get_transformation_metadata_from_mongodb(
                    db, client_name, app_name, project_name, combination_name, model_name
                )
                
                if var_name in model_transformation:
                    var_metadata = model_transformation[var_name]
                    
                    # Weight each statistic
                    weighted_transformation_metadata[var_name]["original_mean"] += var_metadata.get("original_mean", 0) * weight
                    weighted_transformation_metadata[var_name]["original_std"] += var_metadata.get("original_std", 0) * weight
                    weighted_transformation_metadata[var_name]["original_min"] += var_metadata.get("original_min", 0) * weight
                    weighted_transformation_metadata[var_name]["original_max"] += var_metadata.get("original_max", 0) * weight
                    weighted_transformation_metadata[var_name]["final_mean"] += var_metadata.get("final_mean", 0) * weight
                    weighted_transformation_metadata[var_name]["final_std"] += var_metadata.get("final_std", 0) * weight
                    weighted_transformation_metadata[var_name]["final_min"] += var_metadata.get("final_min", 0) * weight
                    weighted_transformation_metadata[var_name]["final_max"] += var_metadata.get("final_max", 0) * weight
                    weighted_transformation_metadata[var_name]["adstock_std"] += var_metadata.get("adstock_std", 0) * weight
                    weighted_transformation_metadata[var_name]["logistic_mean"] += var_metadata.get("logistic_mean", 0) * weight
                    weighted_transformation_metadata[var_name]["logistic_max"] += var_metadata.get("logistic_max", 0) * weight
                    weighted_transformation_metadata[var_name]["logistic_min"] += var_metadata.get("logistic_min", 0) * weight
                    
                    # For transformation steps, use the most common steps or average the parameters
                    if not weighted_transformation_metadata[var_name]["transformation_steps"]:
                        weighted_transformation_metadata[var_name]["transformation_steps"] = var_metadata.get("transformation_steps", [])
        
        logger.info(f"✅ Weighted transformation metadata calculated for {len(weighted_transformation_metadata)} variables")
        return weighted_transformation_metadata
        
    except Exception as e:
        logger.error(f"❌ Error calculating weighted transformation metadata: {str(e)}")
        return {}

def calculate_weighted_contribution(weighted_metrics: Dict[str, Any]) -> Dict[str, float]:
    """
    Calculate weighted contribution metrics.
    
    Args:
        weighted_metrics: Weighted metrics from ensemble calculation
    
    Returns:
        Dictionary of weighted contribution metrics
    """
    contribution = {}
    
    # Extract contribution metrics if available
    for key, value in weighted_metrics.items():
        if key.endswith("_contribution"):
            var_name = key.replace("_contribution", "")
            contribution[var_name] = value
    
    logger.info(f"✅ Calculated {len(contribution)} weighted contribution metrics")
    return contribution

def calculate_weighted_elasticity(weighted_metrics: Dict[str, Any]) -> Dict[str, float]:
    """
    Calculate weighted elasticity metrics.
    
    Args:
        weighted_metrics: Weighted metrics from ensemble calculation
    
    Returns:
        Dictionary of weighted elasticity metrics
    """
    elasticity = {}
    
    # Extract elasticity metrics if available
    for key, value in weighted_metrics.items():
        if key.endswith("_elasticity"):
            var_name = key.replace("_elasticity", "")
            elasticity[var_name] = value
    
    logger.info(f"✅ Calculated {len(elasticity)} weighted elasticity metrics")
    return elasticity

async def get_ensemble_build_config(
    db,
    client_name: str,
    app_name: str,
    project_name: str
) -> Dict[str, Any]:
    """
    Get build configuration for ensemble models.
    
    Args:
        db: MongoDB database connection
        client_name: Client name
        app_name: App name
        project_name: Project name
    
    Returns:
        Build configuration dictionary
    """
    try:
        document_id = f"{client_name}/{app_name}/{project_name}"
        build_config = await db["build-model_featurebased_configs"].find_one({"_id": document_id})
        
        if not build_config:
            logger.error(f"❌ No build configuration found for {document_id}")
            return {}
        
        return build_config
        
    except Exception as e:
        logger.error(f"❌ Error getting build configuration: {str(e)}")
        return {}

def get_individual_results_file_key(build_config: Dict[str, Any]) -> Optional[str]:
    """
    Get the individual results file key from build configuration.
    
    Args:
        build_config: Build configuration dictionary
    
    Returns:
        Individual results file key or None
    """
    try:
        combination_file_keys = build_config.get("combination_file_keys", [])
        
        for combo_info in combination_file_keys:
            if combo_info.get("combination") == "ensemble_results":
                return combo_info.get("file_key")
        
        logger.warning(f"⚠️ No individual results file key found in build configuration")
        return None
        
    except Exception as e:
        logger.error(f"❌ Error getting individual results file key: {str(e)}")
        return None
