import logging
import pandas as pd
import numpy as np
from typing import Dict, List, Optional, Any, Tuple
from datetime import datetime
from io import BytesIO
import pyarrow as pa
import pyarrow.ipc as ipc
from sklearn.model_selection import KFold, train_test_split
from sklearn.preprocessing import StandardScaler, MinMaxScaler
from sklearn.metrics import r2_score, mean_absolute_percentage_error
from sklearn.linear_model import RidgeCV, LassoCV, ElasticNetCV, Ridge, Lasso, ElasticNet, LinearRegression, BayesianRidge

from .models import get_models, safe_mape, CustomConstrainedRidge, ConstrainedLinearRegression
from .database import minio_client, save_model_results_enhanced

logger = logging.getLogger("mmm-training")

class MMMTransformationEngine:
    """
    Marketing Mix Modeling Transformation Engine
    Handles per-variable transformations with the following pipeline:
    1. Adstock transformation (for media variables)
    2. Standardization (StandardScaler)
    3. Logistic transformation (S-curve)
    4. MinMax scaling (final normalization)
    """
    
    def __init__(self):
        self.transformation_metadata = {}
    
    def _detect_data_frequency(self, df: pd.DataFrame) -> str:
        """
        Detect if data is weekly or monthly using statistical analysis.
        Automatically looks for 'date' or 'Date' columns.
        
        Args:
            df: DataFrame with date column
            
        Returns:
            "weekly" or "monthly"
        """
        try:
            # Find date column (case insensitive)
            date_column = None
            for col in df.columns:
                if col.lower() == 'date':
                    date_column = col
                    break
            
            if date_column is None:
                logger.warning("No 'date' or 'Date' column found. Defaulting to monthly frequency.")
                return "monthly"
            
            # Sort by date first
            df_sorted = df.sort_values(date_column)
            dates = pd.to_datetime(df_sorted[date_column])
            
            # Calculate time differences between consecutive dates
            time_diffs = dates.diff().dropna()
            
            # Convert to days
            time_diffs_days = time_diffs.dt.days
            
            # Calculate statistics
            mean_diff = time_diffs_days.mean()
            median_diff = time_diffs_days.median()
            std_diff = time_diffs_days.std()
            
            # Determine frequency based on statistics
            if mean_diff <= 7 and std_diff <= 3:
                return "weekly"
            elif mean_diff <= 31 and std_diff <= 10:
                return "monthly"
            else:
                # Default to monthly if unclear
                return "monthly"
                
        except Exception as e:
            logger.warning(f"Failed to detect data frequency: {e}. Defaulting to monthly.")
            return "monthly"
    
    def generate_parameter_combinations(self, variable_configs: Dict[str, Dict[str, Any]], df: pd.DataFrame = None) -> List[Dict[str, Dict[str, Any]]]:
        import itertools
        
        # Detect data frequency if DataFrame is provided
        data_frequency = "monthly"  # default
        if df is not None:
            data_frequency = self._detect_data_frequency(df)
            logger.info(f"Detected data frequency: {data_frequency}")
        
        # Find media variables with parameter lists
        media_vars = {}
        for var_name, config in variable_configs.items():
            if config.get("type") == "media":
                # Auto-generate default parameter ranges based on data frequency
                if data_frequency == "weekly":
                    adstock_decay = config.get("adstock_decay", [0.70])  # Weekly decay values
                else:  # monthly
                    adstock_decay = config.get("adstock_decay", [0.4])  # Monthly decay values
                
                logistic_growth = config.get("logistic_growth", [1.5,2.5])  # Default range
                logistic_midpoint = config.get("logistic_midpoint", [0.0])  # Default range
                logistic_carryover = config.get("logistic_carryover", [0.0])  # Single value since it's not used
                
                # Ensure parameters are lists
                if not isinstance(adstock_decay, list):
                    adstock_decay = [adstock_decay]
                if not isinstance(logistic_growth, list):
                    logistic_growth = [logistic_growth]
                if not isinstance(logistic_midpoint, list):
                    logistic_midpoint = [logistic_midpoint]
                if not isinstance(logistic_carryover, list):
                    logistic_carryover = [logistic_carryover]
                
                media_vars[var_name] = {
                    "adstock_decay": adstock_decay,
                    "logistic_growth": logistic_growth,
                    "logistic_midpoint": logistic_midpoint,
                    "logistic_carryover": logistic_carryover
                }
        
        if not media_vars:
            # No media variables, return single combination
            return [variable_configs]
        
        # Check if all media variables have the same parameter lists
        first_var_params = list(media_vars.values())[0]
        all_same_params = all(
            var_params["adstock_decay"] == first_var_params["adstock_decay"] and
            var_params["logistic_growth"] == first_var_params["logistic_growth"] and
            var_params["logistic_midpoint"] == first_var_params["logistic_midpoint"] and
            var_params["logistic_carryover"] == first_var_params["logistic_carryover"]
            for var_params in media_vars.values()
        )
        
        combinations = []
        
        if all_same_params:
            # Scenario 1: All media variables have the same parameter combinations
            # Generate CROSS-PRODUCT combinations for all variables
            # logger.info("All media variables have the same parameter combinations - generating cross-product")
            
            # Generate parameter combinations for one variable
            # Note: logistic_carryover is not used in the transformation, so we use single value
            param_combinations = list(itertools.product(
                first_var_params["adstock_decay"],
                first_var_params["logistic_growth"],
                first_var_params["logistic_midpoint"],
                first_var_params["logistic_carryover"]
            ))
            
            # Generate cross-product of parameter combinations across all media variables
            # This creates combinations where each variable can have different parameter values
            media_var_names = list(media_vars.keys())
            
            # Create all possible combinations of parameter sets for each variable
            var_param_combinations = list(itertools.product(*[param_combinations for _ in media_var_names]))
            
            for var_combo in var_param_combinations:
                # Create new config with different parameters for each media variable
                new_config = variable_configs.copy()
                
                for i, var_name in enumerate(media_var_names):
                    adstock_decay, logistic_growth, logistic_midpoint, logistic_carryover = var_combo[i]
                    new_config[var_name] = {
                        "type": "media",
                        "adstock_decay": adstock_decay,
                        "logistic_growth": logistic_growth,
                        "logistic_midpoint": logistic_midpoint,
                        "logistic_carryover": logistic_carryover
                    }
                
                combinations.append(new_config)
            
            # logger.info(f"Generated {len(combinations)} cross-product parameter combinations for {len(media_vars)} media variables")
            # logger.info(f"Each variable can have different parameter values in each combination")
            
        else:
            # Scenario 2: Different parameter combinations for each media variable
            # Generate all possible combinations across variables
            logger.info("Media variables have different parameter combinations")
            
            # Get all parameter combinations for each media variable
            var_combinations = {}
            for var_name, params in media_vars.items():
                var_combinations[var_name] = list(itertools.product(
                    params["adstock_decay"],
                    params["logistic_growth"],
                    params["logistic_midpoint"],
                    params["logistic_carryover"]
                ))
            
            # Generate all possible combinations across variables
            all_combinations = list(itertools.product(*var_combinations.values()))
            
            for combo in all_combinations:
                # Create a new config for this combination
                new_config = variable_configs.copy()
                
                for i, var_name in enumerate(media_vars.keys()):
                    adstock_decay, logistic_growth, logistic_midpoint, logistic_carryover = combo[i]
                    new_config[var_name] = {
                        "type": "media",
                        "adstock_decay": adstock_decay,
                        "logistic_growth": logistic_growth,
                        "logistic_midpoint": logistic_midpoint,
                        "logistic_carryover": logistic_carryover
                    }
                
                combinations.append(new_config)
            
            # Log combination details
            var_combination_counts = {var: len(combs) for var, combs in var_combinations.items()}
            total_combinations = len(combinations)
            
            # logger.info(f"Generated {total_combinations} parameter combinations:")
            for var_name, count in var_combination_counts.items():
                logger.info(f"  {var_name}: {count} combinations")
        
        return combinations
    
    def apply_adstock_transform(self, x: np.ndarray, decay_rate: float) -> np.ndarray:
        """
        Apply adstock transformation with decay rate
        Formula: adstock_t = x_t + decay_rate * adstock_{t-1}
        
        Args:
            x: Input time series data
            decay_rate: Decay rate (0-1, typically 0.1-0.9)
        
        Returns:
            Adstock transformed values
        """
        if decay_rate <= 0 or decay_rate >= 1:
            logger.warning(f"Invalid decay_rate {decay_rate}, using 0.5")
            decay_rate = 0.5
        
        adstock_values = np.zeros_like(x)
        for i in range(len(x)):
            if i == 0:
                adstock_values[i] = x[i]
            else:
                adstock_values[i] = x[i] + decay_rate * adstock_values[i-1]
        
        return adstock_values
    
    def apply_logistic_transform(self, x: np.ndarray, growth_rate: float, midpoint: float, carryover: float) -> np.ndarray:
        """
        Apply logistic transformation (S-curve)
        Formula: 1 / (1 + exp(-growth_rate * (x - midpoint)))
        
        Args:
            x: Input data
            growth_rate: Growth rate parameter
            midpoint: Midpoint parameter
            carryover: Carryover parameter (NOT USED - kept for API compatibility)
        
        Returns:
            Logistic transformed values
        """
        # Ensure growth_rate is positive
        if growth_rate <= 0:
            growth_rate = 1.0
        
        # Apply logistic transformation
        logistic_values = 1 / (1 + np.exp(-growth_rate * (x - midpoint)))
        
        return logistic_values
    
    def _calculate_original_beta_for_media(self, transformed_beta: float, var: str, combo_config: dict, 
                                         transformation_metadata: dict, X_transformed: pd.DataFrame) -> float:
        """
        Calculate original beta for media variables using the transformation formula.
        
        Formula: β_original = β_transformed × (k ⋅ L_t ⋅ (1 - L_t)) / (σ_A ⋅ (L_max - L_min))
        
        Where:
        - β_transformed: The transformed beta coefficient
        - k: Logistic growth parameter
        - L_t: Mean value after adstock → standard → logistic transformations (BEFORE MinMax)
        - σ_A: Standard deviation after adstock transformation (BEFORE standard → logistic → MinMax)
        - L_max, L_min: Maximum and minimum values after adstock → standard → logistic (BEFORE MinMax)
        
        Args:
            transformed_beta: The transformed beta coefficient
            var: Variable name
            combo_config: Configuration for this combination
            transformation_metadata: Metadata about transformations (contains intermediate values)
            X_transformed: Transformed data (after all transformations including MinMax)
            
        Returns:
            Original beta coefficient
        """
        try:
            var_config = combo_config.get(var, {})
            
            # Get logistic parameters
            k = var_config.get('logistic_growth', 1.0)
            
            # Get L_t (mean value after adstock, standard, and logistic transformations - BEFORE MinMax)
            if var in transformation_metadata:
                L_t = transformation_metadata[var].get('logistic_mean', 0.5)
            else:
                # Fallback to 0.5 if data not available
                L_t = 0.5
            
            # Get σ_A (standard deviation after adstock transformation - BEFORE standard→logistic→MinMax)
            if var in transformation_metadata:
                sigma_A = transformation_metadata[var].get('adstock_std', 1.0)
            else:
                sigma_A = 1.0
            
            # Get L_max and L_min (max and min values after adstock→standard→logistic - BEFORE MinMax)
            if var in transformation_metadata:
                L_max = transformation_metadata[var].get('logistic_max', 1.0)
                L_min = transformation_metadata[var].get('logistic_min', 0.0)
            else:
                L_max = 1.0
                L_min = 0.0
            
            # Calculate the transformation factor
            # (k ⋅ L_t ⋅ (1 - L_t)) / (σ_A ⋅ (L_max - L_min))
            numerator = k * L_t * (1 - L_t)
            denominator = sigma_A * (L_max - L_min)

            logger.info(f"Numerator: {numerator}, Denominator: {denominator}")
            
            if denominator != 0:
                transformation_factor = numerator / denominator
                original_beta = transformed_beta * transformation_factor
            else:
                # Fallback to transformed beta if denominator is 0
                original_beta = transformed_beta
            
            return float(original_beta)
            
        except Exception as e:
            # Fallback to transformed beta if calculation fails
            logger.warning(f"Failed to calculate original beta for {var}: {e}. Using transformed beta.")
            return transformed_beta
    
    def apply_standardization(self, x: np.ndarray) -> Tuple[np.ndarray, StandardScaler]:
        """
        Apply StandardScaler transformation
        
        Args:
            x: Input data
            
        Returns:
            Tuple of (transformed_data, scaler_object)
        """
        scaler = StandardScaler()
        # Reshape for scaler (expects 2D array)
        x_reshaped = x.reshape(-1, 1)
        transformed = scaler.fit_transform(x_reshaped).flatten()
        return transformed, scaler
    
    def apply_minmax_scaling(self, x: np.ndarray) -> Tuple[np.ndarray, MinMaxScaler]:
        """
        Apply MinMaxScaler transformation
        
        Args:
            x: Input data
            
        Returns:
            Tuple of (transformed_data, scaler_object)
        """
        scaler = MinMaxScaler()
        # Reshape for scaler (expects 2D array)
        x_reshaped = x.reshape(-1, 1)
        transformed = scaler.fit_transform(x_reshaped).flatten()
        return transformed, scaler
    
    def apply_variable_transformations(self, df: pd.DataFrame, variable_configs: Dict[str, Dict[str, Any]]) -> Tuple[pd.DataFrame, Dict[str, Any], Dict[str, Dict[str, Any]]]:
        """
        Apply per-variable transformations based on configuration
        
        Args:
            df: Input DataFrame
            variable_configs: Configuration for each variable
                Example: {
                    "TV_Spend": {
                        "type": "media",  # media, standard, minmax, none
                        "adstock_decay": [0.3, 0.5, 0.7],  # List of decay rates to test
                        "logistic_growth": [1.5, 2.0, 2.5],  # List of growth rates to test
                        "logistic_midpoint": [0.0, 0.5, 1.0]  # List of midpoints to test
                    },
                    "Price": {
                        "type": "standard"
                    },
                    "Distribution": {
                        "type": "minmax"
                    }
                }
        
        Returns:
            Tuple of (transformed_dataframe, transformation_metadata, updated_variable_configs_with_actual_params)
        """
        transformed_df = df.copy()
        transformation_metadata = {}
        # Create a copy of variable_configs to store actual parameters used
        updated_variable_configs = variable_configs.copy()
        
        for var_name, config in variable_configs.items():
            if var_name not in df.columns:
                logger.warning(f"Variable {var_name} not found in DataFrame")
                continue
            
            var_type = config.get("type", "none")
            original_data = df[var_name].values
            

            
            # Store original statistics
            var_metadata = {
                "original_mean": float(original_data.mean()),
                "original_std": float(original_data.std()),
                "original_min": float(original_data.min()),
                "original_max": float(original_data.max()),
                "transformation_steps": [],
                "final_mean": 0.0,
                "final_std": 0.0,
                "final_min": 0.0,
                "final_max": 0.0,
                # Store intermediate values for media elasticity calculation
                "adstock_std": 0.0,  # σ_A: std after adstock
                "logistic_mean": 0.0,  # L_t: mean after adstock→standard→logistic
                "logistic_max": 0.0,  # L_max: max after adstock→standard→logistic
                "logistic_min": 0.0   # L_min: min after adstock→standard→logistic
            }
            
            current_data = original_data.copy()
            
            if var_type == "media":
                # Media transformation pipeline: Adstock -> Standard -> Logistic -> MinMax
                
                # Step 1: Adstock transformation
                adstock_decay = config.get("adstock_decay", 0.5)
                # Handle both single values and lists (take first value if list)
                if isinstance(adstock_decay, list):
                    adstock_decay = adstock_decay[0]
                current_data = self.apply_adstock_transform(current_data, adstock_decay)
                # Store σ_A: standard deviation after adstock transformation
                var_metadata["adstock_std"] = float(current_data.std())
                var_metadata["transformation_steps"].append({
                    "step": "adstock",
                    "decay_rate": adstock_decay,
                    "mean": float(current_data.mean()),
                    "std": float(current_data.std())
                })
                
                # Step 2: Standardization
                current_data, standard_scaler = self.apply_standardization(current_data)
                var_metadata["transformation_steps"].append({
                    "step": "standardization",
                    "scaler_mean": float(standard_scaler.mean_[0]),
                    "scaler_scale": float(standard_scaler.scale_[0]),
                    "mean": float(current_data.mean()),
                    "std": float(current_data.std())
                })
                
                # Step 3: Logistic transformation
                logistic_growth = config.get("logistic_growth", 2.0)
                logistic_midpoint = config.get("logistic_midpoint", 0.0)
                logistic_carryover = config.get("logistic_carryover", 0.0)
                
                # Handle both single values and lists (take first value if list)
                if isinstance(logistic_growth, list):
                    logistic_growth = logistic_growth[0]
                if isinstance(logistic_midpoint, list):
                    logistic_midpoint = logistic_midpoint[0]
                if isinstance(logistic_carryover, list):
                    logistic_carryover = logistic_carryover[0]
                
                current_data = self.apply_logistic_transform(current_data, logistic_growth, logistic_midpoint, logistic_carryover)
                # Store L_t, L_max, L_min: values after adstock→standard→logistic (BEFORE MinMax)
                var_metadata["logistic_mean"] = float(current_data.mean())  # L_t
                var_metadata["logistic_max"] = float(current_data.max())    # L_max
                var_metadata["logistic_min"] = float(current_data.min())    # L_min
                var_metadata["transformation_steps"].append({
                    "step": "logistic",
                    "growth_rate": logistic_growth,
                    "midpoint": logistic_midpoint,
                    "carryover": logistic_carryover,
                    "mean": float(current_data.mean()),
                    "std": float(current_data.std())
                })
                
                # Step 4: MinMax scaling
                current_data, minmax_scaler = self.apply_minmax_scaling(current_data)
                var_metadata["transformation_steps"].append({
                    "step": "minmax",
                    "scaler_min": float(minmax_scaler.data_min_[0]),
                    "scaler_scale": float(minmax_scaler.scale_[0]),
                    "mean": float(current_data.mean()),
                    "std": float(current_data.std())
                })
                
                # Update variable_configs with actual parameters used for this transformation
                updated_variable_configs[var_name] = {
                    "type": "media",
                    "adstock_decay": adstock_decay,
                    "logistic_growth": logistic_growth,
                    "logistic_midpoint": logistic_midpoint,
                    "logistic_carryover": logistic_carryover,
                    "standardization_mean": float(standard_scaler.mean_[0]),
                    "standardization_scale": float(standard_scaler.scale_[0]),
                    "minmax_min": float(minmax_scaler.data_min_[0]),
                    "minmax_scale": float(minmax_scaler.scale_[0])
                }
                
            elif var_type == "standard":
                # Only StandardScaler
                current_data, standard_scaler = self.apply_standardization(current_data)
                var_metadata["transformation_steps"].append({
                    "step": "standardization",
                    "scaler_mean": float(standard_scaler.mean_[0]),
                    "scaler_scale": float(standard_scaler.scale_[0]),
                    "mean": float(current_data.mean()),
                    "std": float(current_data.std())
                })
                
                # Update variable_configs with actual parameters used for this transformation
                updated_variable_configs[var_name] = {
                    "type": "standard",
                    "standardization_mean": float(standard_scaler.mean_[0]),
                    "standardization_scale": float(standard_scaler.scale_[0])
                }
                
            elif var_type == "minmax":
                # Only MinMaxScaler
                current_data, minmax_scaler = self.apply_minmax_scaling(current_data)
                var_metadata["transformation_steps"].append({
                    "step": "minmax",
                    "scaler_min": float(minmax_scaler.data_min_[0]),
                    "scaler_scale": float(minmax_scaler.scale_[0]),
                    "mean": float(current_data.mean()),
                    "std": float(current_data.std())
                })
                
                # Update variable_configs with actual parameters used for this transformation
                updated_variable_configs[var_name] = {
                    "type": "minmax",
                    "minmax_min": float(minmax_scaler.data_min_[0]),
                    "minmax_scale": float(minmax_scaler.scale_[0])
                }
                
            else:  # "none"
                # No transformation
                var_metadata["transformation_steps"].append({
                    "step": "none",
                    "mean": float(current_data.mean()),
                    "std": float(current_data.std())
                })
                
                # Update variable_configs with actual parameters used for this transformation
                updated_variable_configs[var_name] = {
                    "type": "none"
                }
            
            # Update final statistics
            var_metadata["final_mean"] = float(current_data.mean())
            var_metadata["final_std"] = float(current_data.std())
            var_metadata["final_min"] = float(current_data.min())
            var_metadata["final_max"] = float(current_data.max())
            
            # Update DataFrame
            transformed_df[var_name] = current_data
            transformation_metadata[var_name] = var_metadata
        
        return transformed_df, transformation_metadata, updated_variable_configs


class MMMModelTrainer:
    """
    Marketing Mix Modeling Model Trainer
    Handles model training with per-variable transformations and MMM-specific features
    """
    
    def __init__(self):
        self.transformation_engine = MMMTransformationEngine()
    
    def _filter_last_12_months(self, df: pd.DataFrame) -> pd.DataFrame:

        try:
            # Simply return the last 12 rows without any date sorting
            # This ensures consistent results every time
            if len(df) <= 12:
                return df.copy()
            else:
                return df.tail(12).copy()
            
        except Exception as e:
            logger.warning(f"Error filtering last 12 data points: {e}")
            return df

    def calculate_roi_for_features(
        self,
        roi_config: Optional[Dict[str, Any]],
        x_variables: List[str],
        unstandardized_coefficients: Dict[str, float],
        transformed_df: pd.DataFrame,
        X_original: pd.DataFrame,
        full_original_df: pd.DataFrame,  # Add full original dataframe for price column
        combination_name: str,
        price_column: Optional[str] = None
    ) -> Dict[str, Any]:
        """
        Calculate ROI for selected features using the formula:
        roi_for_feature_i = (sigma_j(beta * transformed(xij)) / sigma_j(cprp * xij)) * avg_price_column
        
        Args:
            roi_config: ROI configuration containing selected features and CPRP values
            x_variables: List of feature variables
            unstandardized_coefficients: Model coefficients
            transformed_df: Transformed data for beta * transformed(xij) calculation
            X_original: Original data for x_variables only (for cprp * xij calculation)
            full_original_df: Full original dataframe (for price column access)
            combination_name: Name of the combination being processed
            price_column: Price column name for average calculation
            
        Returns:
            Dict containing ROI calculations for each selected feature
        """
        roi_results = {}
        
        if not roi_config or not roi_config.get('enabled', False):
            return roi_results
        
        # ===== NEW: Build features_config from roiVariables and costPerUnit if using new structure =====
        roi_variables = roi_config.get('roiVariables', [])
        global_cost_per_unit = roi_config.get('costPerUnit', {})

        if roi_variables and global_cost_per_unit:
            # Build features_config from new structure
            features_config = {}
            for variable in roi_variables:
                if variable:  # Skip empty strings
                    cost_value = global_cost_per_unit.get(variable, 0)
                    features_config[variable] = {
                        'type': 'CPRP',  # Use CPRP type for compatibility
                        'value': cost_value  # Use cost per unit as CPRP value
                    }
                    logger.info(f"   Added {variable} with cost value: {cost_value}")
            logger.info(f"✓ Built features_config from roiVariables: {features_config}")
        else:
            # Use old structure
            features_config = roi_config.get('features', {})
            logger.info(f"Using features from old structure: {list(features_config.keys())}")
        
        per_combination_cprp = roi_config.get('perCombinationCPRP', False)
        combination_cprp_values = roi_config.get('combinationCPRPValues', {})
        
        # ===== NEW: Also check for per-combination cost per unit =====
        per_combination_cost = roi_config.get('perCombinationCostPerUnit', False)
        combination_cost_per_unit_values = roi_config.get('combinationCostPerUnit', {})
        
        # Merge per-combination cost per unit into combination_cprp_values if using new structure
        if per_combination_cost and combination_cost_per_unit_values:
            per_combination_cprp = True  # Enable per-combination mode
            # Merge with existing CPRP values
            for combo_name, costs in combination_cost_per_unit_values.items():
                if combo_name not in combination_cprp_values:
                    combination_cprp_values[combo_name] = {}
                combination_cprp_values[combo_name].update(costs)
            logger.info(f"Merged per-combination cost per unit into CPRP values for {len(combination_cost_per_unit_values)} combinations")
        
        matched_combination_name = None
        if per_combination_cprp and combination_cprp_values:
            if combination_name in combination_cprp_values:
                matched_combination_name = combination_name
            else:
                for config_combination in combination_cprp_values.keys():
                    if config_combination.lower() == combination_name.lower():
                        matched_combination_name = config_combination
                        break
                
                # If still no match, try partial matching
                if not matched_combination_name:
                    for config_combination in combination_cprp_values.keys():
                        if (combination_name.lower() in config_combination.lower() or 
                            config_combination.lower() in combination_name.lower()):
                            matched_combination_name = config_combination
                            # logger.info(f"Partial match found: '{combination_name}' -> '{matched_combination_name}'")
                            break
        
        # Log combination matching results
        if per_combination_cprp:
            if matched_combination_name:
                pass
                # logger.info(f"✓ Combination match found: '{combination_name}' -> '{matched_combination_name}'")
            else:
                logger.warning(f"⚠ No combination match found for '{combination_name}'")
        
        # ===== NEW: Get average price value (handles both column and manual entry) =====
        avg_price_column = 1.0  # Default to 1
        
        # Check if manual price entry is enabled
        manual_price_entry = roi_config.get('manualPriceEntry', False)
        per_combination_manual_price = roi_config.get('perCombinationManualPrice', False)
        
        if manual_price_entry:
            # Use manual price values
            if per_combination_manual_price:
                # Get combination-specific manual price
                combination_manual_prices = roi_config.get('combinationManualPriceValues', {})
                if matched_combination_name and matched_combination_name in combination_manual_prices:
                    avg_price_column = float(combination_manual_prices[matched_combination_name])
                    # logger.info(f"Using manual price for combination '{matched_combination_name}': {avg_price_column}")
                elif combination_name in combination_manual_prices:
                    avg_price_column = float(combination_manual_prices[combination_name])
                    # logger.info(f"Using manual price for combination '{combination_name}': {avg_price_column}")
                else:
                    # Fallback to global manual price
                    avg_price_column = float(roi_config.get('manualPriceValue', 1.0))
                    # logger.warning(f"No manual price found for combination '{combination_name}', using global: {avg_price_column}")
            else:
                # Use global manual price
                avg_price_column = float(roi_config.get('manualPriceValue', 1.0))
                # logger.info(f"Using global manual price: {avg_price_column}")
        else:
            # Use price column from data
            if price_column and price_column.lower() in full_original_df.columns:
                price_series = full_original_df[price_column.lower()]
                
                # Apply rolling average if specified
                average_months = roi_config.get('averageMonths', None)
                if average_months and average_months > 0:
                    # Calculate rolling average and then take mean
                    avg_price_column = float(price_series.rolling(window=average_months, min_periods=1).mean().mean())
                    # logger.info(f"Price column '{price_column}' with {average_months}-month rolling average: {avg_price_column}")
                else:
                    avg_price_column = float(price_series.mean())
            else:
                logger.warning(f"Price column '{price_column}' not found in dataframe columns: {list(full_original_df.columns)}")
                logger.warning(f"Using default avg_price_column = {avg_price_column}")
        
        # ===== Calculate for all features (already filtered by roiVariables above) =====
        features_to_calculate = features_config
        
        if not features_to_calculate:
            # logger.warning(f"⚠️ No features to calculate ROI for in combination '{combination_name}'")
            # logger.warning(f"   roi_variables: {roi_variables}")
            # logger.warning(f"   global_cost_per_unit: {global_cost_per_unit}")
            # logger.warning(f"   features from config: {roi_config.get('features', {})}")
            return roi_results
        
        # logger.info(f"📊 Calculating ROI for {len(features_to_calculate)} features: {list(features_to_calculate.keys())}")
        
        # Calculate ROI for each selected feature
        for feature_name, feature_config in features_to_calculate.items():
            # ===== Determine cost metric to use (Cost Per Unit or CPRP) =====
            use_cost_per_unit = feature_name in global_cost_per_unit or (
                per_combination_cost and matched_combination_name and 
                matched_combination_name in combination_cost_per_unit_values and 
                feature_name in combination_cost_per_unit_values.get(matched_combination_name, {})
            )
            
            if use_cost_per_unit:
                # Use Cost Per Unit instead of CPRP
                if per_combination_cost:
                    # Get combination-specific cost per unit
                    if matched_combination_name and matched_combination_name in combination_cost_per_unit_values:
                        cprp_value = combination_cost_per_unit_values[matched_combination_name].get(feature_name, 0)
                        # logger.info(f"Using per-combination cost per unit for '{feature_name}' in '{matched_combination_name}': {cprp_value}")
                    elif combination_name in combination_cost_per_unit_values:
                        cprp_value = combination_cost_per_unit_values[combination_name].get(feature_name, 0)
                        # logger.info(f"Using per-combination cost per unit for '{feature_name}' in '{combination_name}': {cprp_value}")
                    else:
                        # Fallback to global cost per unit
                        cprp_value = global_cost_per_unit.get(feature_name, 0)
                        # logger.warning(f"No per-combination cost found for '{combination_name}', using global: {cprp_value}")
                else:
                    # Use global cost per unit
                    cprp_value = global_cost_per_unit.get(feature_name, 0)
                    # logger.info(f"Using global cost per unit for '{feature_name}': {cprp_value}")
            else:
                # Use CPRP values (original logic)
                if feature_config.get('type') != 'CPRP':
                    continue  # Skip non-CPRP features
                    

                if per_combination_cprp and matched_combination_name:
                    # Use matched combination name to get CPRP values
                    combination_values = combination_cprp_values[matched_combination_name]
                    cprp_value = combination_values.get(feature_name, 0)
                    # logger.info(f"Using per-combination CPRP for '{feature_name}' in '{matched_combination_name}': {cprp_value}")
                else:
                    cprp_value = feature_config.get('value', 0)
                    if per_combination_cprp:
                        logger.info(f"Using global CPRP for '{feature_name}' (no combination match): {cprp_value}")
                    else:
                        logger.info(f"Using global CPRP for '{feature_name}': {cprp_value}")
            
            # Check if feature exists in variables
            feature_lower = feature_name.lower()
            if feature_lower not in x_variables:
                logger.warning(f"ROI feature {feature_name} not found in x_variables: {x_variables}")
                continue
            
            # Get coefficient for this feature
            beta_key = f"Beta_{feature_lower}"
            beta = unstandardized_coefficients.get(beta_key, 0)
            
            
            # Calculate sigma_j(beta * transformed(xij)) - sum of beta * transformed values
            if feature_lower in transformed_df.columns:
                transformed_values = transformed_df[feature_lower].values
                beta_transformed_sum = np.sum(beta * transformed_values)
                # logger.info(f"   {feature_name}: beta_transformed_sum = {beta_transformed_sum} (from {len(transformed_values)} values)")
            else:
                logger.warning(f"   Feature {feature_lower} not found in transformed_df columns: {list(transformed_df.columns)}")
                beta_transformed_sum = 0

            if feature_lower in X_original.columns:
                original_values = X_original[feature_lower].values
                cprp_original_sum = np.sum(cprp_value * original_values)
                # logger.info(f"   {feature_name}: cprp_original_sum = {cprp_original_sum} (cprp={cprp_value} * sum of {len(original_values)} values)")
            else:
                cprp_original_sum = 0
            
            # Calculate ROI using the formula
            if cprp_original_sum != 0:
                roi = (beta_transformed_sum / cprp_original_sum) * avg_price_column
                # logger.info(f"   {feature_name}: ROI = ({beta_transformed_sum} / {cprp_original_sum}) * {avg_price_column} = {roi}")
            else:
                roi = 0
            
            roi_results[feature_name] = {
                'cprp_value': float(cprp_value),
                'beta_coefficient': float(beta),
                'beta_transformed_sum': float(beta_transformed_sum),
                'cprp_original_sum': float(cprp_original_sum),
                'avg_price_column': float(avg_price_column),
                'roi': float(roi)
            }
            
            logger.info(f"ROI for {feature_name}: beta={beta:.6f}, cprp={cprp_value:.6f}, "
                       f"beta_transformed_sum={beta_transformed_sum:.6f}, "
                       f"cprp_original_sum={cprp_original_sum:.6f}, "
                       f"avg_price={avg_price_column:.6f}, roi={roi:.6f}")
        
        return roi_results

    async def train_mmm_models_for_combination(
        self,
        file_key: str,
        x_variables: List[str],
        y_variable: str,
        variable_configs: Dict[str, Dict[str, Any]],
        models_to_run: List[str],
        custom_configs: Optional[Dict[str, Any]] = None,
        k_folds: int = 5,
        test_size: float = 0.2,
        bucket_name: str = None,
        price_column: Optional[str] = None,
        roi_config: Optional[Dict[str, Any]] = None,
        combination_name: Optional[str] = None
    ) -> Tuple[List[Dict[str, Any]], Dict[str, Any]]:
        
        logger.info(f"Starting MMM model training for file: {file_key}")
        
        # Read data from MinIO
        try:
            if minio_client is None:
                raise Exception("MinIO client not available")
            
            response = minio_client.get_object(bucket_name, file_key)
            file_data = response.read()
            response.close()
            response.release_conn()
            
            # Handle different file formats
            if file_key.endswith('.arrow'):
                reader = ipc.RecordBatchFileReader(pa.BufferReader(file_data))
                df = reader.read_all().to_pandas()
                df.columns = df.columns.str.lower()
                logger.info(f"Successfully read Arrow file: {file_key}, shape: {df.shape}")
            elif file_key.endswith('.csv'):
                df = pd.read_csv(BytesIO(file_data))
                df.columns = df.columns.str.lower()
            else:
                raise Exception(f"Unsupported file format: {file_key}")
                
        except Exception as e:
            logger.error(f"Error reading file {file_key}: {e}")
            raise
        
        # Validate variables exist
        available_columns = df.columns.tolist()
        x_variables_lower = [var.lower() for var in x_variables]
        y_variable_lower = y_variable.lower()
        all_variables = x_variables_lower + [y_variable_lower]
        missing_vars = [var for var in all_variables if var not in available_columns]
        
        if missing_vars:
            raise Exception(f"Variables not found in {file_key}: {missing_vars}")
        

        parameter_combinations = self.transformation_engine.generate_parameter_combinations(
            variable_configs, df=df
        )
        # logger.info(f"Generated {len(parameter_combinations)} combinations")
        
        # Log default parameters being used for media variables
        media_vars = [var for var, config in variable_configs.items() if config.get("type") == "media"]

        
        # Train models for each parameter combination
        all_model_results = []
        all_variable_stats = []
        
        for combo_idx, combo_config in enumerate(parameter_combinations):
  
            
            # Apply per-variable transformations for this combination
            transformed_df, transformation_metadata, updated_combo_config = self.transformation_engine.apply_variable_transformations(
                df, combo_config
            )
        
            # Prepare data for modeling
            X = transformed_df[x_variables_lower].values
            y = transformed_df[y_variable_lower].values
            
            # Store original data statistics for elasticity calculation
            X_original = df[x_variables_lower]
            y_original = df[y_variable_lower]
            
            # Train/test split
            X_train, X_test, y_train, y_test = train_test_split(
                X, y, test_size=test_size, random_state=42, shuffle=True
            )
            
            # Get models
            all_models = get_models()
            
            # Filter models if specified
            if models_to_run:
                models_dict = {name: model for name, model in all_models.items() if name in models_to_run}
            else:
                models_dict = all_models
            
            # Apply custom configurations and constraints
            if custom_configs:
                for model_name, config in custom_configs.items():
                    if model_name in models_dict:
                        parameters = config.get('parameters', {})
                        tuning_mode = config.get('tuning_mode', 'manual')
                        
                        # Handle CV models and constrained models - use same approach as database.py
                        if model_name == "Ridge Regression" and tuning_mode == 'auto':
                            # Use RidgeCV for automatic alpha tuning with reasonable alpha range
                            alphas = np.logspace(-2, 3, 50)  # 0.0001 to 10000 (reasonable range)
                            models_dict[model_name] = RidgeCV(alphas=alphas, cv=k_folds)
                            
                        elif model_name == "Lasso Regression" and tuning_mode == 'auto':
                            # Use LassoCV for automatic alpha tuning with reasonable alpha range
                            alphas = np.logspace(-3, 2, 50)  # 0.0001 to 10 (reasonable range for Lasso)
                            models_dict[model_name] = LassoCV(alphas=alphas, cv=k_folds, random_state=42)
                            
                        elif model_name == "ElasticNet Regression" and tuning_mode == 'auto':
                            # Use ElasticNetCV for automatic alpha and l1_ratio tuning with reasonable ranges
                            alphas = np.logspace(-3, 2, 50)  # 0.0001 to 10 (reasonable range for ElasticNet)
                            l1_ratios = np.linspace(0.1, 0.9, 9)  # Default l1_ratio range
                            models_dict[model_name] = ElasticNetCV(
                                alphas=alphas, l1_ratio=l1_ratios, cv=k_folds, random_state=42
                            )
                            
                        elif model_name == "Custom Constrained Ridge":
                            # Extract constraints from parameters object - handle both old and new formats
                            variable_constraints = parameters.get('variable_constraints', [])
                            
                            # Convert new format to old format for compatibility
                            negative_constraints = []
                            positive_constraints = []
                            
                            if variable_constraints:
                                for constraint in variable_constraints:
                                    if constraint.get('constraint_type') == 'negative':
                                        negative_constraints.append(constraint.get('variable_name'))
                                    elif constraint.get('constraint_type') == 'positive':
                                        positive_constraints.append(constraint.get('variable_name'))
                            else:
                                # Fallback to old format if new format not available
                                negative_constraints = parameters.get('negative_constraints', [])
                                positive_constraints = parameters.get('positive_constraints', [])
                            
                            # Check if we should use auto-tuning for l2_penalty
                            if tuning_mode == 'auto':
                                # First run RidgeCV to find optimal alpha, then use it as l2_penalty
                                logger.info(f"🔧 {model_name} - Auto tuning: Running RidgeCV to find optimal l2_penalty")
                                alphas = np.logspace(-2, 3, 50)  # Same range as Ridge Regression
                                ridge_cv = RidgeCV(alphas=alphas, cv=k_folds)
                                ridge_cv.fit(X_train, y_train)
                                optimal_l2_penalty = ridge_cv.alpha_
                                logger.info(f"🎯 {model_name} - Optimal l2_penalty from RidgeCV: {optimal_l2_penalty:.6f}")
                                
                                models_dict[model_name] = CustomConstrainedRidge(
                                    l2_penalty=optimal_l2_penalty,
                                    learning_rate=parameters.get('learning_rate', 0.001),
                                    iterations=parameters.get('iterations', 10000),
                                    adam=parameters.get('adam', False),
                                    negative_constraints=negative_constraints,
                                    positive_constraints=positive_constraints
                                )
                            else:
                                # Manual tuning - use provided l2_penalty
                                l2_penalty = parameters.get('l2_penalty', 0.1)
                                logger.info(f"🔧 {model_name} - Manual tuning with l2_penalty: {l2_penalty}")
                                models_dict[model_name] = CustomConstrainedRidge(
                                    l2_penalty=float(l2_penalty),
                                    learning_rate=parameters.get('learning_rate', 0.001),
                                    iterations=parameters.get('iterations', 10000),
                                    adam=parameters.get('adam', False),
                                    negative_constraints=negative_constraints,
                                    positive_constraints=positive_constraints
                                )
                        else:
                            # Manual parameter tuning - use provided parameters (same as database.py)
                            if model_name == "Ridge Regression":
                                alpha = parameters.get('Alpha', 1.0)
                                logger.info(f"🔧 {model_name} - Manual tuning with alpha: {alpha}")
                                models_dict[model_name] = Ridge(alpha=float(alpha))
                            elif model_name == "Lasso Regression":
                                alpha = parameters.get('Alpha', 1.0)
                                logger.info(f"🔧 {model_name} - Manual tuning with alpha: {alpha}")
                                models_dict[model_name] = Lasso(alpha=float(alpha), random_state=42)
                            elif model_name == "ElasticNet Regression":
                                alpha = parameters.get('Alpha', 1.0)
                                l1_ratio = parameters.get('L1_ratio', 0.5)
                                logger.info(f"🔧 {model_name} - Manual tuning with alpha: {alpha}, l1_ratio: {l1_ratio}")
                                models_dict[model_name] = ElasticNet(alpha=float(alpha), l1_ratio=float(l1_ratio), random_state=42)
                        
                            elif model_name == "Constrained Linear Regression":
                                # Extract constraints from parameters object - handle both old and new formats
                                variable_constraints = parameters.get('variable_constraints', [])
                                
                                # Convert new format to old format for compatibility
                                negative_constraints = []
                                positive_constraints = []
                                
                                if variable_constraints:
                                    for constraint in variable_constraints:
                                        if constraint.get('constraint_type') == 'negative':
                                            negative_constraints.append(constraint.get('variable_name'))
                                        elif constraint.get('constraint_type') == 'positive':
                                            positive_constraints.append(constraint.get('variable_name'))
                                else:
                                    # Fallback to old format if new format not available
                                    negative_constraints = parameters.get('negative_constraints', [])
                                    positive_constraints = parameters.get('positive_constraints', [])
                                
                                logger.info(f"🔍 MMM Constrained Linear Regression - Negative constraints: {negative_constraints}")
                                logger.info(f"🔍 MMM Constrained Linear Regression - Positive constraints: {positive_constraints}")
                                
                                models_dict[model_name] = ConstrainedLinearRegression(
                                    learning_rate=parameters.get('learning_rate', 0.001),
                                    iterations=parameters.get('iterations', 10000),
                                    adam=parameters.get('adam', False),
                                    negative_constraints=negative_constraints,
                                    positive_constraints=positive_constraints
                                )
            
            # Train models for this combination
            model_results = []
            
            for model_name, model in models_dict.items():
                logger.info(f"Training model: {model_name}")
                
                try:
                    # Train model
                    if hasattr(model, 'fit'):
                        if model_name in ["Custom Constrained Ridge", "Constrained Linear Regression"]:
                            model.fit(X_train, y_train, feature_names=x_variables_lower)
                        else:
                            model.fit(X_train, y_train)
                    
                    # Make predictions
                    y_train_pred = model.predict(X_train)
                    y_test_pred = model.predict(X_test)
                    
                    # Calculate metrics
                    mape_train = safe_mape(y_train, y_train_pred)
                    mape_test = safe_mape(y_test, y_test_pred)
                    r2_train = r2_score(y_train, y_train_pred)
                    r2_test = r2_score(y_test, y_test_pred)
                    
                    # Get coefficients
                    coefficients = {}
                    unstandardized_coefficients = {}
                    intercept = model.intercept_ if hasattr(model, 'intercept_') else 0.0
                    
                    # Initialize intercept destandardization components
                    unstandardized_intercept = intercept
                    y_mean = y_original.mean()
                    intercept_adjustment = 0.0
                    
                    if hasattr(model, 'coef_'):
    
                        for i, var in enumerate(x_variables_lower):
                            coefficients[f"Beta_{var}"] = float(model.coef_[i])
    
                            
                            # Attempt back-transformation based on transformation type
                            var_config = combo_config.get(var, {})
                            var_type = var_config.get("type", "none")
                            
                            if var_type == "media":
                                # For media variables, back-transformation is complex
                                # We'll use the coefficient as-is for now
                                unstandardized_coef = float(model.coef_[i])
                                unstandardized_coefficients[f"Beta_{var}"] = unstandardized_coef
                                
                            elif var_type == "standard":
                                # Back-transform from standardization
                                transform_meta = transformation_metadata[var]
                                if transform_meta["original_std"] != 0:
                                    unstandardized_coef = model.coef_[i] / transform_meta["original_std"]
                                else:
                                    unstandardized_coef = model.coef_[i]
                                unstandardized_coefficients[f"Beta_{var}"] = float(unstandardized_coef)
                                
                                # Accumulate intercept adjustment for standard transformation
                                intercept_adjustment += unstandardized_coef * X_original[var].mean()
                                
                            elif var_type == "minmax":
                                # Back-transform from minmax
                                transform_meta = transformation_metadata[var]
                                original_range = transform_meta["original_max"] - transform_meta["original_min"]
                                if original_range != 0:
                                    unstandardized_coef = model.coef_[i] / original_range
                                else:
                                    unstandardized_coef = model.coef_[i]
                                unstandardized_coefficients[f"Beta_{var}"] = float(unstandardized_coef)
                                
                                # Accumulate intercept adjustment for minmax transformation
                                intercept_adjustment += unstandardized_coef * X_original[var].min()
                                
                            else:  # "none"
                                unstandardized_coefficients[f"Beta_{var}"] = float(model.coef_[i])
                    
                    # Apply intercept destandardization based on transformation types
                    has_standardized_vars = any(
                        combo_config.get(var, {}).get("type") == "standard" 
                        for var in x_variables_lower
                    )
                    has_minmax_vars = any(
                        combo_config.get(var, {}).get("type") == "minmax" 
                        for var in x_variables_lower
                    )
                    
                    if has_standardized_vars:
                        # For standard transformation: intercept = intercept - sum(beta_i * x_mean_i)
                        unstandardized_intercept = intercept - intercept_adjustment
                    elif has_minmax_vars:
                        unstandardized_intercept = intercept - intercept_adjustment
                    # For "none" or "media" transformations, intercept remains as-is
                    

                    # logger.info(f"Unstandardized coefficients: {unstandardized_coefficients}")
                    # logger.info(f"standardized coefficients: {coefficients}")
                    # Calculate AIC and BIC
                    n_samples = len(y_train)
                    n_params = len(x_variables_lower) + 1  # +1 for intercept
                    mse = np.mean((y_test - y_test_pred) ** 2)
                    
                    # AIC = 2k - 2ln(L), where k = number of parameters, L = likelihood
                    # For linear regression: AIC = n*ln(mse) + 2k
                    aic = n_samples * np.log(mse) + 2 * n_params
                    
                    # BIC = n*ln(mse) + k*ln(n)
                    bic = n_samples * np.log(mse) + n_params * np.log(n_samples)
                    
                    # Calculate elasticities and contributions
                    elasticities = {}
                    contributions = {}
                    
                    if price_column and price_column.lower() in x_variables_lower:
                        # Calculate price elasticity
                        price_idx = x_variables_lower.index(price_column.lower())
                        price_coef = unstandardized_coefficients.get(f"Beta_{price_column.lower()}", 0)
                        price_mean = X_original[price_column.lower()].mean()
                        y_mean = y_original.mean()
                        
                        if y_mean != 0 and price_mean != 0:
                            price_elasticity = (price_coef * price_mean) / y_mean
                        else:
                            price_elasticity = 0
                    else:
                        price_elasticity = None
                    
                    # Calculate elasticities for all variables
                    for var in x_variables_lower:
                        var_config = combo_config.get(var, {})
                        var_type = var_config.get("type", "none")
                        
                        if var_type == "media":
                            # For media variables, calculate original beta using the transformation formula
                            original_beta = self.transformation_engine._calculate_original_beta_for_media(
                                transformed_beta=unstandardized_coefficients.get(f"Beta_{var}", 0),
                                var=var,
                                combo_config=combo_config,
                                transformation_metadata=transformation_metadata,
                                X_transformed=transformed_df
                            )
                            var_mean = X_original[var].mean()
                            y_mean = y_original.mean()
                            adstock_decay = combo_config.get(var, {}).get('adstock_decay', 0.5)

                            if isinstance(adstock_decay, list):
                                adstock_decay = adstock_decay[0]
                            
                            if y_mean != 0 and var_mean != 0 and adstock_decay < 1.0:
                                elasticity = original_beta * (var_mean / y_mean) * (1 / (1 - adstock_decay))
                            else:
                                elasticity = 0
                            
                            # For contributions, use transformed beta with transformed mean (consistent scaling)
                            transformed_mean = transformed_df[var].mean() if var in transformed_df.columns else var_mean
                            contributions[var] = abs(unstandardized_coefficients.get(f"Beta_{var}", 0) * transformed_mean)
                            
                        else:
                            # For non-media variables, use the simple approach
                            var_coef = unstandardized_coefficients.get(f"Beta_{var}", 0)
                            var_mean = X_original[var].mean()
                            y_mean = y_original.mean()
                            
                            if y_mean != 0 and var_mean != 0:
                                elasticity = (var_coef * var_mean) / y_mean
                            else:
                                elasticity = 0
                            
                            contributions[var] = abs(var_coef * var_mean)
                        
                        elasticities[var] = elasticity
                    
                    # Normalize contributions
                    total_contribution = sum(contributions.values())
                    if total_contribution > 0:
                        for var in contributions:
                            contributions[var] = contributions[var] / total_contribution
                    
                    # Extract actual parameter values used for this combination
                    actual_params = {}
                    for var_name, config in combo_config.items():
                        if config.get("type") == "media":
                            actual_params[var_name] = {
                                "type": "media",
                                "adstock_decay": config.get("adstock_decay", "N/A"),
                                "logistic_growth": config.get("logistic_growth", "N/A"),
                                "logistic_midpoint": config.get("logistic_midpoint", "N/A"),
                                "logistic_carryover": config.get("logistic_carryover", "N/A")
                            }
                        else:
                            actual_params[var_name] = config
                    
                    
                    # Calculate ROI for selected features if ROI config is provided
                    roi_results = {}
                    if roi_config and combination_name:   
                        # Apply transformations to FULL dataset first for consistent standardization
                        transformed_df_full, transformation_metadata, updated_combo_config = self.transformation_engine.apply_variable_transformations(
                            df, combo_config
                        )
 
                        transformed_df_last_12_months = self._filter_last_12_months(transformed_df_full)
                        
                        df_last_12_months = self._filter_last_12_months(df)

                        
                        roi_results = self.calculate_roi_for_features(
                            roi_config=roi_config,
                            x_variables=x_variables_lower,
                            unstandardized_coefficients=coefficients,  # Use transformed coefficients
                            transformed_df=transformed_df_last_12_months,
                            X_original=df_last_12_months[x_variables_lower],
                            full_original_df=df_last_12_months,  # Pass the filtered original dataframe
                            combination_name=combination_name,
                            price_column=price_column
                        )
                        
                        logger.info(f"ROI calculation completed for {model_name} in combination {combination_name}: {len(roi_results)} features processed")
                        
                        # # Log ROI results for verification
                        # if roi_results:
                        #     logger.info("=" * 80)
                        #     logger.info(f"🎯 ROI RESULTS FOR {model_name} - {combination_name}")
                        #     logger.info("=" * 80)
                        #     for feature_name, roi_data in roi_results.items():
                        #         logger.info(f"📊 {feature_name}:")
                        #         logger.info(f"   🎯 FINAL ROI: {roi_data['roi']:.6f}")
                        #         logger.info("-" * 40)
                        #     logger.info("=" * 80)
                        # else:
                        #     logger.warning(f"⚠️ No ROI results generated for {model_name} in {combination_name}")
                            
                    elif roi_config:
                        logger.warning("ROI config provided but combination_name is missing. Skipping ROI calculation.")
                    
                    # Store model result with combination info
                    model_result = {
                        "model_name": model_name,
                        "combination_index": combo_idx,
                        "parameter_combination": updated_combo_config,
                        "actual_parameters_used": actual_params,
                        "mape_train": float(mape_train),
                        "mape_test": float(mape_test),
                        "r2_train": float(r2_train),
                        "r2_test": float(r2_test),
                        "coefficients": unstandardized_coefficients,
                        "standardized_coefficients": coefficients,
                        "intercept": float(intercept),
                        "unstandardized_intercept": float(unstandardized_intercept),
                        "aic": float(aic),
                        "bic": float(bic),
                        "n_parameters": n_params,
                        "price_elasticity": price_elasticity,
                        "elasticities": elasticities,
                        "contributions": contributions,
                        "roi_results": roi_results,  # Add ROI results
                        "transformation_metadata": transformation_metadata,
                        "variable_configs": updated_combo_config
                    }
                    
                    # Debug: Log final coefficients being returned
                    # logger.info(f"Final coefficients for {model_name}: {coefficients}")
                    # logger.info(f"Final unstandardized coefficients for {model_name}: {unstandardized_coefficients}")
                    
                    model_results.append(model_result)
                    # logger.info(f"Completed training {model_name} (combo {combo_idx + 1}): MAPE={mape_test:.4f}, R²={r2_test:.4f}")
                    
                except Exception as e:
                    logger.error(f"Error training model {model_name} (combo {combo_idx + 1}): {e}")
                    continue
            
            # Store results for this combination
            all_model_results.extend(model_results)
            
            # Store variable statistics for this combination
            variable_statistics = {
                "combination_index": combo_idx,
                "parameter_combination": updated_combo_config,
                "variable_averages": {**{var: float(X_original[var].mean()) for var in x_variables_lower}, 
                                    y_variable_lower: float(y_original.mean())},
                "transformation_metadata": transformation_metadata,
                "original_data_shape": df.shape,
                "transformed_data_shape": transformed_df.shape
            }
            all_variable_stats.append(variable_statistics)
        
        # Prepare final variable statistics summary
        final_variable_statistics = {
            "total_combinations": len(parameter_combinations),
            "total_models_trained": len(all_model_results),
            "parameter_combinations": parameter_combinations,
            "combination_results": all_variable_stats,
            "original_data_shape": df.shape
        }
        
        logger.info(f"Completed MMM model training for {file_key}: {len(all_model_results)} models trained across {len(parameter_combinations)} parameter combinations")
        
        return all_model_results, final_variable_statistics


# Global instance
mmm_trainer = MMMModelTrainer()
    