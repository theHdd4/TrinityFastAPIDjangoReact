
import pandas as pd
import numpy as np
import io
import logging
from typing import Dict, List, Optional, Tuple, Any
from minio import Minio
from minio.error import S3Error
import re
from motor.motor_asyncio import AsyncIOMotorClient
from sklearn.cluster import KMeans
from sklearn.preprocessing import StandardScaler
from sklearn.model_selection import train_test_split
from sklearn.metrics import r2_score

logger = logging.getLogger("stack-model-data")



class MMMStackDataPooler:
    """Handle pooling of data from multiple combinations."""
    
    def __init__(self, minio_client: Minio, bucket_name: str):
        self.minio_client = minio_client
        self.bucket_name = bucket_name
    
    def read_combination_file(self, file_key: str) -> Optional[pd.DataFrame]:
        """Read combination file from MinIO and return as DataFrame."""
        try:
            response = self.minio_client.get_object(self.bucket_name, file_key)
            file_data = response.read()
            response.close()
            response.release_conn()
            
            # Handle different file formats
            if file_key.endswith('.arrow'):
                try:
                    import pyarrow as pa
                    import pyarrow.ipc as ipc
                    reader = ipc.RecordBatchFileReader(pa.BufferReader(file_data))
                    df = reader.read_all().to_pandas()
                    # Convert columns to lowercase for consistency
                    df.columns = df.columns.str.lower()
                except Exception as arrow_error:
                    return None
            elif file_key.endswith('.csv'):
                df = pd.read_csv(io.BytesIO(file_data))
                # Convert columns to lowercase for consistency
                df.columns = df.columns.str.lower()
            else:
                return None
            
            return df
            
        except Exception as e:
            return None
    
    def find_combination_files(self, scope_number: str, combinations: List[str]) -> Dict[str, str]:
        combination_files = {}
        
        try:
            # List all objects in the bucket
            all_objects = list(self.minio_client.list_objects(self.bucket_name, recursive=True))
            
            for combination in combinations:
                # Search for files containing both Scope_X and the combination
                scope_pattern = f"Scope_{scope_number}"
                
                for obj in all_objects:
                    obj_name = obj.object_name
                    
                    # Check if file contains the scope number and combination
                    if scope_pattern in obj_name and combination in obj_name:
                        combination_files[combination] = obj_name
                        break
                
                if combination not in combination_files:
                    pass
            
            return combination_files
            
        except Exception as e:
            return {}
    
    def pool_data_by_identifiers(
        self, 
        scope_number: str, 
        combinations: List[str], 
        pool_by_identifiers: List[str], 
        x_variables: List[str], 
        y_variable: str,
        all_identifiers: List[str]
    ) -> Dict[str, pd.DataFrame]:
        """
        Pool data from multiple combinations based on selected identifiers.
        
        Process:
        1. First fetch all the files (using the same method as train-models-direct)
        2. Add combination column to each DataFrame before merging
        3. Merge all the data from those files
        4. Filter the merged data using pool-identifiers selection
        
        Args:
            scope_number: Scope number
            combinations: List of combination strings
            pool_by_identifiers: List of identifiers to pool by (e.g., ['Channel', 'Brand'])
            x_variables: List of feature variables
            y_variable: Target variable
            
        Returns:
            Dictionary mapping pool keys to pooled DataFrames (with combination column)
        """
        try:
            
            # Step 1: First fetch all the files (using the same method as train-models-direct)
            all_dataframes = []
            combination_info = []
            
            for combination in combinations:
                
                # Use the same file fetching logic as train-models-direct
                df = self._fetch_combination_file_direct(scope_number, combination)
                if df is not None:
                    # Convert all column names to lowercase for consistent matching
                    df.columns = df.columns.str.lower()
                    
                    # Filter data to only include identifiers, x_variables, and y_variable
                    filtered_df = self._filter_combination_data(df, all_identifiers, x_variables, y_variable)
                    
                    if filtered_df is not None and not filtered_df.empty:
                        all_dataframes.append(filtered_df)
                        combination_info.append({
                            'combination': combination,
                            'file_path': f"scope_{scope_number}/combination_{combination}"
                        })
            if not all_dataframes:
                raise ValueError("No valid data found for any combination")
            
            # Step 2: Add combination column to each DataFrame before merging
            for i, (df, combo_info) in enumerate(zip(all_dataframes, combination_info)):
                df['combination'] = combo_info['combination']
            
            # Step 3: Merge all the data from those files
            merged_df = pd.concat(all_dataframes, ignore_index=True)
            
            # Print unique values for pool_by_identifiers after merging
            
            # Step 4: Filter the merged data using pool-identifiers selection
            pooled_data = self._filter_by_pool_identifiers(
                merged_df, combinations, pool_by_identifiers
            )
                
            return pooled_data
            
        except Exception as e:
            import traceback
            raise  # Re-raise the exception instead of returning empty dict
    
    def _fetch_combination_file_direct(self, scope_number: str, combination: str) -> Optional[pd.DataFrame]:
        """Fetch data file for a specific combination using the same method as train-models-direct."""
        try:
            # Use the same file fetching logic as train-models-direct
            matching_objects = []
            
            # Search for files containing both Scope_X and the combination
            all_objects = list(self.minio_client.list_objects(self.bucket_name, recursive=True))
            
            scope_pattern = f"Scope_{scope_number}"
            for obj in all_objects:
                obj_name = obj.object_name
                
                # Check if file contains the scope number
                has_scope = scope_pattern in obj_name
                
                # Check if file contains the combination string
                has_combination = combination in obj_name
                
                if has_scope and has_combination:
                    matching_objects.append(obj_name)
            
            if not matching_objects:
                return None
            
            # Use the first matching file
            target_file_key = matching_objects[0]
            
            # Read the file using the existing method
            df = self.read_combination_file(target_file_key)
            return df
            
        except Exception as e:
            return None
    
    def _filter_by_pool_identifiers(
        self, 
        merged_df: pd.DataFrame, 
        combinations: List[str], 
        pool_by_identifiers: List[str]
   
    ) -> Dict[str, pd.DataFrame]:
 
        try:
            # Step 1: Get unique values for each identifier from the merged data
            identifier_values = {}
            for identifier in pool_by_identifiers:
                if identifier in merged_df.columns:
                    unique_values = merged_df[identifier].unique().tolist()
                    identifier_values[identifier] = unique_values
                else:
                    pass
                    identifier_values[identifier] = []

            pool_groups = {}
            import itertools
            value_combinations = list(itertools.product(*[identifier_values[identifier] for identifier in pool_by_identifiers]))

            for value_combo in value_combinations:
                pool_key_parts = []
                for i, identifier in enumerate(pool_by_identifiers):
                    value = value_combo[i]
                    clean_value = str(value).replace(" ", "_").replace("/", "_").replace("\\", "_")
                    pool_key_parts.append(f"{identifier}_{clean_value}")
                
                pool_key = "_".join(pool_key_parts)
                matching_combinations = []
                for combination in combinations:
                    # Check if this combination's values match the pool values
                    if self._combination_matches_pool_values(combination, pool_by_identifiers, value_combo):
                        matching_combinations.append(combination)
                
                if matching_combinations:
                    pool_groups[pool_key] = {
                        'values': value_combo,
                        'combinations': matching_combinations
                    }
            
            pooled_data = {}
            for pool_key, pool_info in pool_groups.items():
                filter_conditions = []
                
                for i, identifier in enumerate(pool_by_identifiers):
                    value = pool_info['values'][i]
                    if identifier in merged_df.columns:
                        filter_conditions.append(merged_df[identifier] == value)
                else:
                        pass
                
                if filter_conditions:
                    # Combine all conditions with AND (all must be true)
                    final_condition = filter_conditions[0]
                    for condition in filter_conditions[1:]:
                        final_condition = final_condition & condition
                    
                    # Apply the filter
                    filtered_df = merged_df[final_condition].copy()
                    
                    if len(filtered_df) > 0:
                        pooled_data[pool_key] = filtered_df
                    else:
                        pass
            
            return pooled_data
            
        except Exception as e:
            raise
    
    def _combination_matches_pool_values(self, combination: str, pool_by_identifiers: List[str], pool_values: tuple) -> bool:

        try:
            pool_value_strings = [str(value) for value in pool_values]
            
            # Debug logging
            for pool_value in pool_value_strings:
                pool_value_with_underscores = pool_value.replace(" ", "_")
                if pool_value_with_underscores in combination:
                    pass
                else:
                    return False
            
            return True
            
        except Exception as e:
            return False
    
    def _filter_combination_data(self, df: pd.DataFrame, filtered_identifiers: List[str], x_variables: List[str], y_variable: str) -> pd.DataFrame:

        try:
            required_columns = filtered_identifiers + x_variables + [y_variable]
            
            available_columns = [col for col in required_columns if col in df.columns]
            missing_columns = [col for col in required_columns if col not in df.columns]
            
            if missing_columns:
                pass
            
            filtered_df = df[available_columns].copy()
            
            return filtered_df
            
        except Exception as e:
            pass
            return df


    
    def find_optimal_clusters_elbow(self, data: pd.DataFrame, max_clusters: int = 10) -> int:
        """
        Find optimal number of clusters using elbow method.
        
        Args:
            data: DataFrame with numerical features for clustering
            max_clusters: Maximum number of clusters to test
            
        Returns:
            Optimal number of clusters
        """
        try:
            if len(data) < 2:
                pass
                return 1
            
            # Standardize the data
            scaler = StandardScaler()
            scaled_data = scaler.fit_transform(data)
            
            # Calculate WCSS for different number of clusters
            wcss = []
            cluster_range = range(1, min(max_clusters + 1, len(data)))
            
            for k in cluster_range:
                kmeans = KMeans(n_clusters=k, random_state=42, n_init=10)
                kmeans.fit(scaled_data)
                wcss.append(kmeans.inertia_)
            
            # Find elbow point (simplified method - find the point with maximum second derivative)
            if len(wcss) < 3:
                optimal_k = 2 if len(wcss) >= 2 else 1
            else:
                # Calculate second derivative to find elbow
                second_derivative = np.diff(wcss, 2)
                optimal_k = np.argmax(second_derivative) + 2  # +2 because of double differentiation
            
            
            return optimal_k
            
        except Exception as e:
            return 2  # Default fallback
    
    def perform_kmeans_clustering(self, df: pd.DataFrame, numerical_columns: List[str], n_clusters: Optional[int] = None) -> pd.DataFrame:
        """
        Perform K-means clustering on the DataFrame.
        
        Args:
            df: Input DataFrame
            numerical_columns: List of numerical columns to use for clustering (subset of x_variables + y_variables)
            n_clusters: Number of clusters (if None, will use elbow method)
            
        Returns:
            DataFrame with added cluster_id column
        """
        try:
            
            # Check if all numerical columns exist
            missing_columns = [col for col in numerical_columns if col not in df.columns]
            if missing_columns:
                raise ValueError(f"Missing numerical columns: {missing_columns}")
            
            # Extract numerical data
            clustering_data = df[numerical_columns].copy()
            
            # Remove any rows with NaN values
            clustering_data = clustering_data.dropna()
            if len(clustering_data) == 0:
                raise ValueError("No valid data for clustering after removing NaN values")
            
            # Get row indices for valid data
            valid_indices = clustering_data.index
            
            # Standardize the data
            scaler = StandardScaler()
            scaled_data = scaler.fit_transform(clustering_data)
            
            # Determine number of clusters
            if n_clusters is None:
                n_clusters = self.find_optimal_clusters_elbow(clustering_data)
            
            # Perform K-means clustering
            kmeans = KMeans(n_clusters=n_clusters, random_state=42, n_init=10)
            cluster_labels = kmeans.fit_predict(scaled_data)
            
            # Add cluster_id to the original DataFrame
            df_with_clusters = df.copy()
            df_with_clusters['cluster_id'] = -1  # Default value for invalid rows
            
            # Assign cluster labels to valid rows
            df_with_clusters.loc[valid_indices, 'cluster_id'] = cluster_labels
            
            
            return df_with_clusters
            
        except Exception as e:
            pass
            # Return original DataFrame with default cluster_id
            df_with_clusters = df.copy()
            df_with_clusters['cluster_id'] = 0
            return df_with_clusters
    
    def apply_clustering_to_pools(self, pooled_data: Dict[str, pd.DataFrame], numerical_columns: List[str], n_clusters: Optional[int] = None) -> Dict[str, pd.DataFrame]:

        try:
            clustered_pools = {}
            
            for pool_key, pool_df in pooled_data.items():
                
                if 'combination' not in pool_df.columns:
                    pass
                    clustered_pools[pool_key] = pool_df
                    continue

                combination_aggregated = self._aggregate_combinations_for_clustering(pool_df, numerical_columns)
                
                if combination_aggregated is None or len(combination_aggregated) == 0:
                    clustered_pools[pool_key] = pool_df
                    continue

                combination_clusters = self._cluster_combinations(combination_aggregated, numerical_columns, n_clusters)

                clustered_df = self._merge_cluster_id_to_pool_data(pool_df, combination_clusters)
                clustered_pools[pool_key] = clustered_df
                
                cluster_counts = clustered_df['cluster_id'].value_counts().to_dict()
            
            return clustered_pools
            
        except Exception as e:
            pass
            return pooled_data
    
    def _aggregate_combinations_for_clustering(self, pool_df: pd.DataFrame, numerical_columns: List[str]) -> Optional[pd.DataFrame]:
        """
        Group by combination and aggregate numerical columns for clustering.
        Returns DataFrame with combination and aggregated numerical values.
        """
        try:
            # Check if all required columns exist
            required_columns = ['combination'] + numerical_columns
            missing_columns = [col for col in required_columns if col not in pool_df.columns]
            
            if missing_columns:
                return None
            
            # Group by combination and aggregate numerical columns
            aggregation_dict = {}
            for col in numerical_columns:
                aggregation_dict[col] = 'mean'  # Use mean for aggregation
            
            aggregated_df = pool_df.groupby('combination').agg(aggregation_dict).reset_index()
            
            return aggregated_df
                
        except Exception as e:
            return None
    
    def _cluster_combinations(self, aggregated_df: pd.DataFrame, numerical_columns: List[str], n_clusters: Optional[int] = None) -> Dict[str, int]:

        try:
  
            clustering_data = aggregated_df[numerical_columns].copy()
            clustering_data = clustering_data.dropna()
            if len(clustering_data) == 0:
                return {}
            
            valid_combinations = aggregated_df.loc[clustering_data.index, 'combination'].tolist()
            
            scaler = StandardScaler()
            scaled_data = scaler.fit_transform(clustering_data)
            
            if n_clusters is None:
                n_clusters = self.find_optimal_clusters_elbow(clustering_data)
            kmeans = KMeans(n_clusters=n_clusters, random_state=42, n_init=10)
            cluster_labels = kmeans.fit_predict(scaled_data)
            
            combination_clusters = {}
            for i, combination in enumerate(valid_combinations):
                combination_clusters[combination] = int(cluster_labels[i])
            
            
            unique_combinations = set(valid_combinations)
            if len(unique_combinations) != len(valid_combinations):
                from collections import Counter
                combo_counts = Counter(valid_combinations)
                duplicates = {combo: count for combo, count in combo_counts.items() if count > 1}
            
            return combination_clusters
                
        except Exception as e:
            return {}
    
    def _merge_cluster_id_to_pool_data(self, pool_df: pd.DataFrame, combination_clusters: Dict[str, int]) -> pd.DataFrame:
        """
        Merge cluster_id back to the original pool data based on combination using pandas merge.
        """
        try:
            # Create a DataFrame from the combination_clusters dictionary
            cluster_mapping_df = pd.DataFrame([
                {'combination': combination, 'cluster_id': cluster_id}
                for combination, cluster_id in combination_clusters.items()
            ])
            
            # Debug: Log the cluster mapping before merge
            
            # Merge with the original pool data
            result_df = pool_df.merge(
                cluster_mapping_df, 
                on='combination', 
                how='left'
            )
            
            # Fill NaN values with -1 for combinations not found in clustering
            result_df['cluster_id'] = result_df['cluster_id'].fillna(-1).astype(int)
            
            # Debug: Check the final cluster assignments
            cluster_assignments = result_df.groupby('combination')['cluster_id'].unique()
            
            # Check for combinations with multiple cluster_ids
            multiple_clusters = cluster_assignments[cluster_assignments.apply(len) > 1]
            if len(multiple_clusters) > 0:
                logger.error(f"ERROR: Combinations with multiple cluster_ids: {multiple_clusters.to_dict()}")
            
            # Check for unmapped combinations
            unmapped_count = (result_df['cluster_id'] == -1).sum()
            if unmapped_count > 0:
                error_msg = f"{unmapped_count} records have unmapped combinations - this indicates a clustering error"
                logger.error(error_msg)
                raise ValueError(error_msg)
            
            return result_df
            
        except Exception as e:
            logger.error(f"Error merging cluster_id to pool data: {e}")
            return pool_df
    

    
    def split_clustered_data_by_clusters(self, clustered_pools: Dict[str, pd.DataFrame], minio_client=None, bucket_name=None) -> Dict[str, pd.DataFrame]:
        """
        Split clustered data by individual clusters.
        
        Args:
            clustered_pools: Dictionary of DataFrames with cluster_id column
            minio_client: Optional MinIO client for saving files
            bucket_name: Optional bucket name for saving files
            
        Returns:
            Dictionary of DataFrames split by clusters
        """
        try:
            from io import BytesIO
            from datetime import datetime
            
            split_data = {}
            saved_files = {}  # Track saved file paths
            
            for pool_key, df in clustered_pools.items():
                if 'cluster_id' not in df.columns:
                    logger.warning(f"No cluster_id column found in {pool_key}, skipping split")
                    continue
                
                unique_clusters = df['cluster_id'].unique()
                
                for cluster_id in unique_clusters:
                    cluster_df = df[df['cluster_id'] == cluster_id].copy()
                    
                    unique_key = f"{pool_key}_{int(cluster_id)}"
                    
                    # Save to MinIO if client is provided
                    if minio_client and bucket_name:
                        try:
                            # Generate timestamp for file naming
                            timestamp = datetime.now().strftime("%Y%m%d_%H%M%S")
                            
                            # Create filename
                            filename = f"split_cluster_{unique_key}_{timestamp}.csv"
                            
                            # Create file path (you may want to adjust this path structure)
                            file_key = f"stack_modeling/split_clusters/{filename}"
                        
                            # Convert DataFrame to CSV
                            csv_buffer = BytesIO()
                            cluster_df.to_csv(csv_buffer, index=False)
                            csv_buffer.seek(0)
                            
                            # Save to MinIO
                            minio_client.put_object(
                                bucket_name,
                                file_key,
                                csv_buffer,
                                length=csv_buffer.getbuffer().nbytes,
                                content_type='text/csv'
                            )
                            
                            saved_files[unique_key] = file_key
                            
                        except Exception as e:
                            saved_files[unique_key] = None
                    
                    # Remove cluster_id column as it's no longer needed
                    if 'cluster_id' in cluster_df.columns:
                        cluster_df = cluster_df.drop('cluster_id', axis=1)
                    
                    split_data[unique_key] = cluster_df
            
            return split_data
            
        except Exception as e:
            return {}
    
   
class MMMStackModelDataProcessor:
    
    def __init__(self):
        pass
    

    
    def calculate_combination_betas(self, model_results: List[Dict[str, Any]], combinations: List[str], x_variables: List[str], numerical_columns_for_interaction: List[str], split_cluster_id: str = None, standardization: str = 'none') -> Dict[str, Dict[str, float]]:
        """
        Calculate final beta coefficients for each combination by combining common betas and interaction term betas.
        This method follows the same logic as stack_model_training.py.
        """
        combination_betas = {}
        
        for model_result in model_results:
            model_name = model_result['model_name']
            coefficients = model_result['coefficients']
            intercept = model_result['intercept']
            
            logger.info(f"Calculating combination betas for model: {model_name}")
            logger.info(f"Available coefficients: {list(coefficients.keys())}")
            logger.info(f"Requested combinations: {combinations}")
            
            # Extract combinations that are actually present in this model's coefficients
            available_combinations = []
            for key in coefficients.keys():
                if key.startswith('Beta_encoded_combination_') and not key.endswith('_x_price') and not key.endswith('_x_d1'):
                    combination_name = key.replace('Beta_encoded_combination_', '')
                    logger.info(f"Found encoded combination: '{combination_name}' from key '{key}'")
                    if combination_name in combinations:
                        available_combinations.append(combination_name)
                        logger.info(f"Added combination '{combination_name}' to available_combinations")
            
            logger.info(f"Available combinations for calculation: {available_combinations}")
            
            # Calculate final betas only for combinations that are available in this model
            for combination in available_combinations:
                logger.info(f"Calculating final betas for combination: {combination}")
                combination_key = f"{model_name}_{combination}"
                final_betas = {}
                # Calculate final intercept
                combination_intercept_key = f"Beta_encoded_combination_{combination}"
                combination_intercept_beta = coefficients.get(combination_intercept_key, 0.0)
                final_betas['intercept'] = intercept + combination_intercept_beta
                logger.info(f"Combination intercept key: {combination_intercept_key}")
                logger.info(f"Combination intercept: {combination_intercept_beta}, Final intercept: {final_betas['intercept']}")
                
                # Calculate final betas for x_variables (main model variables)
                for x_var in x_variables:
                    # Use original variable name (mmm_stack_training.py uses original names throughout)
                    model_var_name = x_var
                    
                    # Common beta for this x_variable (use original variable name)
                    common_beta = coefficients.get(f"Beta_{model_var_name}", 0.0)
                    logger.info(f"Common beta for {x_var} (Beta_{model_var_name}): {common_beta}")

                    interaction_key = f"encoded_combination_{combination}_x_{x_var}"
                    individual_beta = coefficients.get(f"Beta_{interaction_key}", 0.0)
                    logger.info(f"Individual beta for {x_var} (Beta_{interaction_key}): {individual_beta}")
                    
                    final_beta = common_beta + individual_beta
                    final_betas[x_var] = final_beta
                    logger.info(f"Final beta for {x_var}: {final_beta}")
                    
                
                # Calculate final betas for numerical_columns_for_interaction (interaction variables)
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
        
        logger.info(f"Final combination_betas result: {combination_betas}")
        
        # Restructure the result to use combination names as keys instead of model_combination keys
        restructured_betas = {}
        for key, betas in combination_betas.items():
            # Extract combination name from model_combination key
            if '_' in key:
                combination_name = '_'.join(key.split('_')[1:])  # Remove model name prefix
                restructured_betas[combination_name] = betas
                logger.info(f"Restructured key '{key}' -> '{combination_name}': {betas}")
        
        logger.info(f"Restructured combination_betas: {restructured_betas}")
        return restructured_betas
    
    def unstandardize_coefficients(
        self, 
        coefficients: Dict[str, float], 
        combo_config: Dict[str, Dict[str, Any]], 
        transformation_metadata: Dict[str, Any],
        x_variables_lower: List[str],
        X_original: pd.DataFrame,
        original_intercept: float = 0.0
    ) -> Tuple[Dict[str, float], float]:
        """
        Unstandardize coefficients back to original scale, similar to MMM training.
        
        Args:
            coefficients: Transformed coefficients
            combo_config: Parameter combination configuration
            transformation_metadata: Metadata about transformations
            x_variables_lower: List of variable names
            X_original: Original data for calculating means
            
        Returns:
            Tuple of (unstandardized_coefficients, unstandardized_intercept)
        """
        try:
            unstandardized_coefficients = {}
            intercept = original_intercept  # Use the original intercept from combination betas
            
            # Initialize intercept destandardization components
            intercept_adjustment = 0.0
            
            for i, var in enumerate(x_variables_lower):
                # Look for coefficient using original variable name (combination betas use original names)
                if f"Beta_{var}" in coefficients:
                    coef_value = coefficients[f"Beta_{var}"]
                    coef_key = f"Beta_{var}"
                    
                    # Get variable configuration
                    var_config = combo_config.get(var, {})
                    var_type = var_config.get("type", "none")
                    
                    if var_type == "media":
                        # For media variables, use the coefficient as-is (complex back-transformation)
                        unstandardized_coef = float(coef_value)
                        unstandardized_coefficients[f"Beta_{var}"] = unstandardized_coef
                        
                    elif var_type == "standard":
                        # Back-transform from standardization
                        if var in transformation_metadata:
                            transform_meta = transformation_metadata[var]
                            if transform_meta.get("original_std", 0) != 0:
                                unstandardized_coef = coef_value / transform_meta["original_std"]
                            else:
                                unstandardized_coef = coef_value
                        else:
                            unstandardized_coef = coef_value
                        
                        unstandardized_coefficients[f"Beta_{var}"] = float(unstandardized_coef)
                        
                        # Accumulate intercept adjustment for standard transformation
                        if var in X_original.columns:
                            intercept_adjustment += unstandardized_coef * X_original[var].mean()
                        
                    elif var_type == "minmax":
                        # Back-transform from minmax
                        if var in transformation_metadata:
                            transform_meta = transformation_metadata[var]
                            original_range = transform_meta.get("original_max", 1) - transform_meta.get("original_min", 0)
                            if original_range != 0:
                                unstandardized_coef = coef_value / original_range
                            else:
                                unstandardized_coef = coef_value
                        else:
                            unstandardized_coef = coef_value
                        
                        unstandardized_coefficients[f"Beta_{var}"] = float(unstandardized_coef)
                        
                        # Accumulate intercept adjustment for minmax transformation
                        if var in X_original.columns:
                            intercept_adjustment += unstandardized_coef * X_original[var].min()
                        
                    else:  # "none"
                        unstandardized_coefficients[f"Beta_{var}"] = float(coef_value)
                else:
                    # No coefficient found for this variable
                    # Set to 0 as fallback
                    unstandardized_coefficients[f"Beta_{var}"] = 0.0
            
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
                # For minmax transformation: intercept = intercept - sum(beta_i * x_min_i)
                unstandardized_intercept = intercept - intercept_adjustment
            else:
                # For "none" or "media" transformations, intercept remains as-is
                unstandardized_intercept = intercept
            
            return unstandardized_coefficients, float(unstandardized_intercept)
            
        except Exception as e:
            return coefficients, 0.0
    
    def calculate_elasticities_and_contributions(
        self,
        unstandardized_coefficients: Dict[str, float],
        combo_config: Dict[str, Dict[str, Any]],
        transformation_metadata: Dict[str, Any],
        X_original: pd.DataFrame,
        y_original: pd.Series,
        x_variables_lower: List[str],
        price_column: Optional[str] = None
    ) -> Tuple[Dict[str, float], Dict[str, float], Optional[float]]:
        """
        Calculate elasticities and contributions for all variables, similar to MMM training.
        
        Args:
            unstandardized_coefficients: Unstandardized coefficients
            combo_config: Parameter combination configuration
            transformation_metadata: Metadata about transformations
            X_original: Original feature data
            y_original: Original target data
            x_variables_lower: List of variable names
            price_column: Optional price column name
            
        Returns:
            Tuple of (elasticities, contributions, price_elasticity)
        """
        try:
            elasticities = {}
            contributions = {}
            price_elasticity = None
            
            # Calculate price elasticity if price column is specified
            if price_column and price_column.lower() in x_variables_lower:
                price_coef = unstandardized_coefficients.get(f"Beta_{price_column.lower()}", 0)
                price_mean = X_original[price_column.lower()].mean()
                y_mean = y_original.mean()
                
                if y_mean != 0 and price_mean != 0:
                    price_elasticity = (price_coef * price_mean) / y_mean
                else:
                    price_elasticity = 0
            
            # Calculate elasticities for all variables
            for var in x_variables_lower:
                var_config = combo_config.get(var, {})
                var_type = var_config.get("type", "none")
                
                if var_type == "media":
                    # For media variables, calculate original beta using the transformation formula
                    from .mmm_training import MMMTransformationEngine
                    transformation_engine = MMMTransformationEngine()
                    
                    original_beta = transformation_engine._calculate_original_beta_for_media(
                        transformed_beta=unstandardized_coefficients.get(f"Beta_{var}", 0),
                        var=var,
                        combo_config=combo_config,
                        transformation_metadata=transformation_metadata,
                        X_transformed=X_original  # Using original data as fallback
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
                    # Get transformed mean from transformation_metadata
                    transformed_mean = transformation_metadata.get(var, {}).get("final_mean", var_mean)
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
            
            return elasticities, contributions, price_elasticity
            
        except Exception as e:
            return {}, {}, None
    
    async def _train_stack_models_for_betas(
        self,
        split_clustered_data: Dict[str, pd.DataFrame],
        x_variables: List[str],
        y_variable: str,
        variable_configs: Dict[str, Dict[str, Any]],
        models_to_run: List[str],
        custom_configs: Optional[Dict[str, Any]] = None,
        apply_interaction_terms: bool = True,
        numerical_columns_for_interaction: List[str] = None,
        test_size: float = 0.2,
        price_column: Optional[str] = None
    ) -> List[Dict[str, Any]]:
        """
        Train stack models on pooled data to get betas (similar to stack_model_training.py approach).
        """
        try:
            
            # Import MMM transformation engine
            from .mmm_training import MMMTransformationEngine
            from .models import get_models, safe_mape
            
            # Initialize transformation engine
            transformation_engine = MMMTransformationEngine()
            
            # Generate parameter combinations
            parameter_combinations = transformation_engine.generate_parameter_combinations(
                variable_configs, df=None
            )
            logger.info(f"Generated {len(parameter_combinations)} parameter combinations")
            
            stack_model_results = []
            
            # split_clustered_data is already the actual dictionary of cluster data
            logger.info(f"Split clustered data keys: {list(split_clustered_data.keys())}")
            
            if not split_clustered_data:
                logger.warning("No split clustered data found")
                return []
            
            for split_key, cluster_df in split_clustered_data.items():
                logger.info(f"Processing split cluster: {split_key} with {len(cluster_df)} records")
                
                # Extract unique combinations in this cluster
                cluster_combinations = []
                logger.info(f"Cluster {split_key} columns: {cluster_df.columns.tolist()}")
                if 'combination' in cluster_df.columns:
                    cluster_combinations = cluster_df['combination'].unique().tolist()
                    logger.info(f"Cluster {split_key} contains combinations: {cluster_combinations}")
                else:
                    logger.warning(f"No 'combination' column found in cluster {split_key}")
                
                # Validate variables exist in this cluster
                x_variables_lower = [var.lower() for var in x_variables]
                y_variable_lower = y_variable.lower()
                available_columns = cluster_df.columns.tolist()
                missing_vars = [var for var in x_variables_lower + [y_variable_lower] if var not in available_columns]
                
                logger.info(f"Available columns in {split_key}: {available_columns}")
                logger.info(f"Required variables: {x_variables_lower + [y_variable_lower]}")
                
                if missing_vars:
                    logger.warning(f"Missing variables in {split_key}: {missing_vars}")
                    continue
                
                # Process each parameter combination
                for combo_idx, combo_config in enumerate(parameter_combinations):
                    logger.info(f"Processing parameter combination {combo_idx + 1}/{len(parameter_combinations)} for {split_key}")
                    
                    try:
                        # Apply transformations and train models for this combination
                        model_results = await self._process_combination_for_stack(
                            cluster_df, combo_config, models_to_run, custom_configs,
                            x_variables_lower, y_variable_lower, test_size,
                            price_column, transformation_engine,
                            apply_interaction_terms, numerical_columns_for_interaction
                        )
                        
                        logger.info(f"Completed combination {combo_idx + 1} for {split_key}: {len(model_results)} models trained")
                        
                        # Add combination info to results
                        for result in model_results:
                            result['combination_index'] = combo_idx
                            result['parameter_combination'] = combo_config
                            result['split_clustered_data_id'] = split_key
                            result['cluster_combinations'] = cluster_combinations  # Store which combinations are in this cluster
                        
                        stack_model_results.extend(model_results)
                        
                    except Exception as e:
                        logger.error(f"Error processing combination {combo_idx + 1} for {split_key}: {e}")
                        continue
            
            return stack_model_results
            
        except Exception as e:
            return []
    
    async def _calculate_individual_combination_metrics(
        self,
        scope_number: str,
        combinations: List[str],
        x_variables: List[str],
        y_variable: str,
        minio_client,
        bucket_name: str,
        stack_model_results: List[Dict[str, Any]],
        variable_configs: Dict[str, Dict[str, Any]],
        price_column: Optional[str] = None,
        roi_config: Optional[Dict[str, Any]] = None,
        run_id: str = None,
        training_progress: Dict = None,
        models_to_run: List[str] = None
    ) -> Dict[str, Any]:
        """
        Calculate metrics for individual combinations using stack modeling betas (similar to stack_model_training.py).
        """
        try:
            logger.info(f"🎯 Starting _calculate_individual_combination_metrics")
            logger.info(f"   Received {len(stack_model_results)} stack model results")
            logger.info(f"   Target combinations: {combinations}")
            
            from .models import safe_mape
            import numpy as np
            
            individual_metrics = {}
            
            # Create a mapping of combination -> parameter_combination_index -> model_name -> betas
            betas_by_combination = {}
            logger.info(f"📊 Processing {len(stack_model_results)} stack model results for beta organization")
            
            for result in stack_model_results:
                split_cluster_id = result.get('split_clustered_data_id', '')
                model_name = result['model_name']
                cluster_combinations = result.get('cluster_combinations', [])
                combination_index = result.get('combination_index', 0)
                
                logger.info(f"   Processing result: {model_name} in cluster {split_cluster_id}")
                logger.info(f"   Cluster combinations: {cluster_combinations}")
                logger.info(f"   Combination index: {combination_index}")
                logger.info(f"   Has combination betas: {'combination_betas' in result}")
                parameter_combination = result.get('parameter_combination', {})
                
                # For each combination in this cluster, create a mapping
                for combination_name in cluster_combinations:
                    if combination_name not in betas_by_combination:
                        betas_by_combination[combination_name] = {}
                    
                    if combination_index not in betas_by_combination[combination_name]:
                        betas_by_combination[combination_name][combination_index] = {}
                    
                    logger.info(f"Storing betas for {combination_name}[{combination_index}][{model_name}]")
                    logger.info(f"Result unstandardized_coefficients: {result.get('unstandardized_coefficients', {})}")
                    
                    betas_by_combination[combination_name][combination_index][model_name] = {
                        'split_cluster_id': split_cluster_id,
                        'parameter_combination': parameter_combination,
                        'intercept': result.get('intercept', 0.0),
                        'coefficients': result.get('coefficients', {}),
                        "combination_betas": result.get('combination_betas', {})
                    }
            
            # Get stack model metrics for train metrics (keyed by combination + parameter_index + model_name)
            stack_metrics_by_combination_model = {}
            for result in stack_model_results:
                split_cluster_id = result.get('split_clustered_data_id', '')
                model_name = result['model_name']
                cluster_combinations = result.get('cluster_combinations', [])
                combination_index = result.get('combination_index', 0)
                
                # Create metrics for each combination in this cluster
                for combination_name in cluster_combinations:
                    key = f"{combination_name}_{combination_index}_{model_name}"
                    stack_metrics_by_combination_model[key] = {
                        'mape_train': result.get('mape_train', 0.0),
                        'mape_test': result.get('mape_test', 0.0),
                        'r2_train': result.get('r2_train', 0.0),
                        'r2_test': result.get('r2_test', 0.0),
                        'aic': result.get('aic', 0.0),
                        'bic': result.get('bic', 0.0),
                        'mse_train': result.get('mse_train', 0.0),
                        'mse_test': result.get('mse_test', 0.0),
                        'train_size': result.get('train_size', 0),
                        'test_size': result.get('test_size', 0)
                    }
            

            logger.info(f"🔄 Processing {len(combinations)} combinations for individual metrics")
            for combination_idx, combination in enumerate(combinations):
                try:
                    # Update progress for stack modeling
                    if run_id and training_progress and run_id in training_progress:
                        current_combination_idx = combination_idx + 1
                        num_models = len(models_to_run) if models_to_run else 1
                        training_progress[run_id]["current_combination"] = combination
                        training_progress[run_id]["status"] = f"Stack Modeling: Processing {combination} ({current_combination_idx}/{len(combinations)})"
                        # Update current to reflect starting this combination
                        training_progress[run_id]["current"] = combination_idx * num_models
                        training_progress[run_id]["percentage"] = int((training_progress[run_id]["current"] / training_progress[run_id]["total"]) * 100) if training_progress[run_id]["total"] > 0 else 0
                        logger.info(f"📊 Updated progress: {combination} ({current_combination_idx}/{len(combinations)}) - {training_progress[run_id]['percentage']}%")
                    
                    logger.info(f"📁 Fetching data for combination: {combination}")
                    # Fetch individual combination data
                    df = self._fetch_combination_file_direct(scope_number, combination, minio_client, bucket_name)
                    if df is None:
                        logger.warning(f"❌ No data found for combination: {combination}")
                        continue
                    logger.info(f"✅ Successfully fetched data for {combination}: {len(df)} rows")
                    
                    df.columns = df.columns.str.lower()
                    logger.info(f"Available columns in {combination}: {df.columns.tolist()}")
                    
                    # Filter to only include required columns
                    required_columns = [var.lower() for var in x_variables] + [y_variable.lower()]
                    available_columns = [col for col in required_columns if col in df.columns]
                    missing_columns = [col for col in required_columns if col not in df.columns]
                    
                    if missing_columns:
                        logger.warning(f"Missing columns for {combination}: {missing_columns}")
                        continue
                    
                    # Use original X variables for predictions
                    x_variables_lower = [var.lower() for var in x_variables]
                    X = df[x_variables_lower].values
                    y_actual = df[y_variable.lower()].values
                    
                    combination_metrics = {}
                    
                    available_parameter_combinations = betas_by_combination.get(combination, {})
                    if not available_parameter_combinations:
                        continue
                    
                    for param_index, param_models in available_parameter_combinations.items():
                        
                        for model_idx, (model_name, betas) in enumerate(param_models.items()):
                            
                            # Update progress for current model
                            if run_id and training_progress and run_id in training_progress:
                                current_model_idx = model_idx + 1
                                total_models_in_combination = len(param_models)
                                training_progress[run_id]["current_model"] = model_name
                                training_progress[run_id]["status"] = f"Stack Modeling: {combination} - {model_name} ({current_model_idx}/{total_models_in_combination})"
                                logger.info(f"📊 Processing model: {model_name} ({current_model_idx}/{total_models_in_combination})")
                            
                            # Get the parameter combination configuration for this model
                            combo_config = betas.get('parameter_combination', {})
                            
                            # Create a modified combo_config that removes standard and minmax transformations
                            # This ensures we can use unstandardized betas on original data
                            modified_combo_config = {}
                            for var, config in combo_config.items():
                                var_type = config.get('type', 'none')
                                if var_type in ['standard', 'minmax']:
                                    # Remove standard and minmax transformations
                                    modified_config = config.copy()
                                    modified_config['type'] = 'none'
                                    modified_combo_config[var] = modified_config
                                    logger.info(f"   Removed {var_type} transformation for {var}, set to 'none'")
                                else:
                                    # Keep media and none transformations as-is
                                    modified_combo_config[var] = config
                                    logger.info(f"   Kept {var_type} transformation for {var}")
                            
                            # Apply transformations using the modified config
                            from .mmm_training import MMMTransformationEngine
                            transformation_engine = MMMTransformationEngine()
                            
                            # Generate transformation metadata for this individual combination
                            # This is crucial for proper unstandardization
                            transformed_df, transformation_metadata = transformation_engine.apply_variable_transformations(
                                df, modified_combo_config
                            )
                            
                            logger.info(f"   Applied transformations with modified config: {list(modified_combo_config.keys())}")
                            
                            # Use the combination betas that were already calculated in stack training
                            combination_betas_from_stack = betas.get('combination_betas', {})
                            logger.info(f"   Using combination betas from stack: {list(combination_betas_from_stack.keys())}")
                            
                            if combination in combination_betas_from_stack:
                                combination_coefficients = combination_betas_from_stack[combination].copy()
                                combination_intercept = combination_coefficients.get('intercept', 0.0)
                                logger.info(f"   Found combination betas for {combination}: {combination_coefficients}")
                                logger.info(f"   Combination intercept: {combination_intercept}")
                            else:
                                logger.warning(f"   No combination betas found for {combination}, using fallback")
                                # Fallback to raw coefficients if combination betas not available
                                combination_coefficients = betas.get('coefficients', {}).copy()
                                combination_intercept = betas.get('intercept', 0.0)
                            
                            # STEP 1: Unstandardize the combination-specific coefficients FIRST
                            # This is crucial - we need to convert transformed betas back to original scale
                            # Format coefficients for unstandardization (exclude intercept)
                            formatted_coefficients = {}
                            for var, coef in combination_coefficients.items():
                                if var != 'intercept':  # Don't include intercept in coefficient formatting
                                    formatted_coefficients[f"Beta_{var}"] = coef
                            
                            logger.info(f"   Formatted coefficients for unstandardization: {list(formatted_coefficients.keys())}")
                            
                            unstandardized_coefficients, unstandardized_intercept = self.unstandardize_coefficients(
                                coefficients=formatted_coefficients,
                                combo_config=combo_config,
                                transformation_metadata=transformation_metadata,
                                x_variables_lower=x_variables_lower,
                                X_original=df,  # Use individual combination data
                                original_intercept=combination_intercept  # Pass the combination intercept
                            )
                            
                            logger.info(f"   Unstandardized coefficients: {unstandardized_coefficients}")
                            logger.info(f"   Unstandardized intercept: {unstandardized_intercept}")
                            
                            from .mmm_training import MMMTransformationEngine
                            transformation_engine = MMMTransformationEngine()

                            transformed_individual_df = df.copy()
                            
                            y_pred = self._predict_with_betas(
                                X=transformed_individual_df[x_variables_lower].values,  # Use ORIGINAL individual data
                                coefficients=unstandardized_coefficients,  # Use unstandardized coefficients
                                x_variables=x_variables_lower,
                                intercept=unstandardized_intercept
                            )
                            
                            individual_mape = safe_mape(y_actual, y_pred)
                            individual_r2 = self._calculate_r2(y_actual, y_pred)
                            
                            # Calculate AIC and BIC for individual combination
                            n = len(y_actual)
                            k = len(x_variables_lower) + 1  # +1 for intercept
                            mse = np.mean((y_actual - y_pred) ** 2)
                            individual_aic = n * np.log(mse) + 2 * k
                            individual_bic = n * np.log(mse) + k * np.log(n)
                            
                            # Get stack model metrics for train metrics
                            stack_key = f"{combination}_{param_index}_{model_name}"
                            stack_metrics = stack_metrics_by_combination_model.get(stack_key, {})
                            
                            # STEP 4: Calculate elasticities and contributions using unstandardized coefficients
                            elasticities, contributions, individual_price_elasticity = self.calculate_elasticities_and_contributions(
                                unstandardized_coefficients=unstandardized_coefficients,
                                combo_config=modified_combo_config,  # Use modified config (without standard/minmax)
                                transformation_metadata=transformation_metadata,
                                X_original=df,  # Use individual combination data
                                y_original=df[y_variable.lower()],  # Use individual combination target
                                x_variables_lower=x_variables_lower,
                                price_column=price_column
                            )
                            
                            # STEP 5: Calculate ROI for selected features
                            roi_results = {}
                            if roi_config and roi_config.get('enabled', False):
                                # Filter data to last 12 months for ROI calculation
                                df_last_12_months = self._filter_last_12_months(df)
                                transformed_df_last_12_months, transformation_metadata = transformation_engine.apply_variable_transformations(
                                    df_last_12_months, modified_combo_config
                                )
                                
                                # Import the ROI calculation function from mmm_training
                                from .mmm_training import MMMModelTrainer
                                trainer = MMMModelTrainer()
                                roi_results = trainer.calculate_roi_for_features(
                                    roi_config=roi_config,
                                    x_variables=x_variables_lower,
                                    unstandardized_coefficients=unstandardized_coefficients,
                                    transformed_df=transformed_df_last_12_months,
                                    X_original=df_last_12_months[x_variables_lower],
                                    full_original_df=df_last_12_months,
                                    combination_name=combination,
                                    price_column=price_column
                                )
                            
                            # Create a unique key for this parameter combination and model
                            param_model_key = f"param_{param_index}_{model_name}"
                            
                            combination_metrics[param_model_key] = {
                                'combination': combination,
                                'parameter_combination_index': param_index,
                                'parameter_combination': betas.get('parameter_combination', {}),
                                'model_name': model_name,
                                'individual_samples': n,
                                'mape_train': stack_metrics.get('mape_train', 0.0),  # From stack modeling
                                'mape_test': individual_mape,  # From individual combination
                                'r2_train': stack_metrics.get('r2_train', 0.0),  # From stack modeling
                                'r2_test': individual_r2,  # From individual combination
                                'mse_train': stack_metrics.get('mse_train', 0.0),  # From stack modeling
                                'mse_test': mse,  # From individual combination
                                'aic': individual_aic,  # Individual combination AIC
                                'bic': individual_bic,  # Individual combination BIC
                                'elasticities': elasticities,  # Individual combination elasticities
                                'contributions': contributions,  # Individual combination contributions
                                'price_elasticity': individual_price_elasticity,  # Individual combination price elasticity
                                'coefficients': combination_coefficients,  # Combination-specific coefficients (common + interaction)
                                'intercept': combination_intercept,  # Combination-specific intercept
                                'unstandardized_coefficients': unstandardized_coefficients,  # Unstandardized coefficients for individual combination
                                'unstandardized_intercept': unstandardized_intercept,  # Unstandardized intercept for individual combination
                                'roi_results': roi_results,  # ROI results for selected features
                                'train_size': stack_metrics.get('train_size', 0),
                                'test_size': n
                            }
                    
                    individual_metrics[combination] = combination_metrics
                    logger.info(f"✅ Successfully calculated metrics for {combination}: {len(combination_metrics)} parameter combinations")
                    
                    # Update progress - mark combination as completed
                    if run_id and training_progress and run_id in training_progress:
                        training_progress[run_id]["completed_combinations"] += 1
                        completed = training_progress[run_id]["completed_combinations"]
                        total = training_progress[run_id]["total_combinations"]
                        # Update current based on models per combination
                        num_models = len(models_to_run) if models_to_run else 1
                        training_progress[run_id]["current"] = completed * num_models
                        training_progress[run_id]["percentage"] = int((training_progress[run_id]["current"] / training_progress[run_id]["total"]) * 100) if training_progress[run_id]["total"] > 0 else 0
                        logger.info(f"📊 Progress: Completed {completed}/{total} combinations ({training_progress[run_id]['percentage']}%)")
                    
                except Exception as e:
                    logger.error(f"❌ Error calculating metrics for {combination}: {str(e)}")
                    import traceback
                    logger.error(f"Traceback: {traceback.format_exc()}")
                    continue
            
            logger.info(f"🎉 Completed individual metrics calculation. Total combinations with metrics: {len(individual_metrics)}")
            return individual_metrics
            
        except Exception as e:
            logger.error(f"❌ Error in _calculate_individual_combination_metrics: {str(e)}")
            import traceback
            logger.error(f"Traceback: {traceback.format_exc()}")
            return {}
    
    def _filter_last_12_months(self, df: pd.DataFrame) -> pd.DataFrame:
        """
        Filter dataframe to include only the last 12 months of data.
        
        Args:
            df: DataFrame with date information
            
        Returns:
            DataFrame filtered to last 12 months
        """
        try:
            # Common date column names to check
            date_columns = ['date', 'Date', 'DATE', 'date_index', 'Date_Index', 'DATE_INDEX', 
                          'month', 'Month', 'MONTH', 'year', 'Year', 'YEAR',
                          'fiscal_year', 'Fiscal_Year', 'FISCAL_YEAR']
            
            date_col = None
            for col in date_columns:
                if col in df.columns:
                    date_col = col
                    break
            
            if date_col is None:
                # If no date column found, return original dataframe
                return df
            
            # Convert to datetime if not already
            if not pd.api.types.is_datetime64_any_dtype(df[date_col]):
                try:
                    df[date_col] = pd.to_datetime(df[date_col])
                except:
                    # If conversion fails, return original dataframe
                    return df
            
            # Sort by date column and take the last 12 months worth of data
            # Assuming monthly data, so we take the last 12 rows
            filtered_df = df.sort_values(by=date_col).tail(12).copy()
            
            return filtered_df
            
        except Exception as e:
            # If any error occurs, return original dataframe
            return df
    
    def _fetch_combination_file_direct(self, scope_number: str, combination: str, minio_client, bucket_name: str) -> Optional[pd.DataFrame]:
        """Fetch individual combination file for metrics calculation."""
        try:
            # Use the same file fetching logic as in the data pooler
            matching_objects = []
            
            # Search for files containing both Scope_X and the combination
            all_objects = list(minio_client.list_objects(bucket_name, recursive=True))
            
            scope_pattern = f"Scope_{scope_number}"
            logger.info(f"🔍 Searching for files with scope pattern: '{scope_pattern}' and combination: '{combination}' in bucket: '{bucket_name}'")
            
            for obj in all_objects:
                obj_name = obj.object_name
                
                # Check if file contains the scope number and combination
                has_scope = scope_pattern in obj_name
                has_combination = combination in obj_name
                
                if has_scope and has_combination:
                    matching_objects.append(obj_name)
                    logger.info(f"✅ Found matching file: {obj_name}")
            
            if not matching_objects:
                logger.warning(f"❌ No files found for scope '{scope_pattern}' and combination '{combination}'")
                return None
            
            # Use the first matching file
            target_file_key = matching_objects[0]
            logger.info(f"📖 Reading file: {target_file_key}")
            
            # Read the file
            response = minio_client.get_object(bucket_name, target_file_key)
            file_data = response.read()
            response.close()
            response.release_conn()
            
            # Handle different file formats
            if target_file_key.endswith('.arrow'):
                try:
                    import pyarrow as pa
                    import pyarrow.ipc as ipc
                    reader = ipc.RecordBatchFileReader(pa.BufferReader(file_data))
                    df = reader.read_all().to_pandas()
                    df.columns = df.columns.str.lower()
                except Exception as arrow_error:
                    return None
            elif target_file_key.endswith('.csv'):
                df = pd.read_csv(io.BytesIO(file_data))
                df.columns = df.columns.str.lower()
            else:
                return None
            
            logger.info(f"✅ Successfully read file with shape: {df.shape}")
            return df
            
        except Exception as e:
            logger.error(f"❌ Error fetching combination file for scope '{scope_number}' and combination '{combination}': {e}")
            return None
    
    def _predict_with_betas(self, X: np.ndarray, coefficients: Dict[str, float], x_variables: List[str], intercept: float = 0.0) -> np.ndarray:
        """Make predictions using betas."""
        try:
            y_pred = np.full(X.shape[0], intercept)
            
            for i, var in enumerate(x_variables):
                if i < X.shape[1]:
                    beta_key = f"Beta_{var}"
                    beta_val = coefficients.get(beta_key, 0.0)
                    y_pred += beta_val * X[:, i]
            
            return y_pred
            
        except Exception as e:
            logger.error(f"Error making predictions with betas: {e}")
            return np.zeros(X.shape[0])
    
    def _calculate_r2(self, y_actual: np.ndarray, y_pred: np.ndarray) -> float:
        """Calculate R-squared."""
        try:
            from sklearn.metrics import r2_score
            return float(r2_score(y_actual, y_pred))
        except Exception as e:
            logger.error(f"Error calculating R2: {e}")
            return 0.0
    
    async def get_column_classifier_config(self) -> Dict[str, Any]:
        """Get column classifier configuration using hardcoded _id for testing."""
        try:
            from .mongodb_saver import get_column_classifier_config_from_mongo
            
            # Hardcoded _id for testing: Quant_Matrix_AI_Schema/marketing-mix/New Marketing Mix Modeling Project
            hardcoded_id = "Quant_Matrix_AI_Schema/marketing-mix/New Marketing Mix Modeling Project"
            prefix_parts = hardcoded_id.strip('/').split('/')
            client_name = prefix_parts[0]
            app_name = prefix_parts[1]
            project_name = prefix_parts[2]   
            
            # Use the hardcoded _id to get the config
            config = await get_column_classifier_config_from_mongo(client_name, app_name, project_name)
            
            if config:
                logger.info(f"✅ Retrieved column classifier config for hardcoded _id: {hardcoded_id}")
                logger.info(f"   Config keys: {list(config.keys())}")
                if 'identifiers' in config:
                    logger.info(f"   Identifiers: {config['identifiers']}")
                return config
            else:
                logger.warning(f"❌ No column classifier config found for hardcoded _id: {hardcoded_id}")
                return {}
            
        except Exception as e:
            logger.error(f"Error fetching column classifier config: {e}")
            return {}
    
    
    async def prepare_stack_model_data(
        self,
        scope_number: str,
        combinations: List[str],
        pool_by_identifiers: List[str],
        x_variables: List[str],
        y_variable: str,
        minio_client: Minio,
        bucket_name: str,
        n_clusters: Optional[int] = None,
        clustering_columns: Optional[List[str]] = None
    ) -> Dict[str, Any]:

        try:
            # Validate inputs
            if not combinations:
                raise ValueError("No combinations provided")
            
            if not pool_by_identifiers:
                raise ValueError("No pooling identifiers provided")
            
            # Fetch column classifier configuration
            column_config = await self.get_column_classifier_config()
            if not column_config:
                raise ValueError("No column classifier config found")
            
            # Get identifiers from column classifier
            all_identifiers = column_config.get('identifiers', [])
            
            # Filter out date-related identifiers
            date_related_identifiers = ['date', 'year', 'week', 'month']
            filtered_identifiers = [id for id in all_identifiers if id not in date_related_identifiers]
           
            
            # Validate that pool_by_identifiers are valid identifiers (case-insensitive)
            all_identifiers_lower = [id.lower() for id in all_identifiers]
            invalid_identifiers = [id for id in pool_by_identifiers if id.lower() not in all_identifiers_lower]
            if invalid_identifiers:
                raise ValueError(f"Invalid pooling identifiers: {invalid_identifiers}. Available identifiers: {all_identifiers}")
            
            logger.info(f"Preparing stack model data for scope {scope_number} with {len(combinations)} combinations")
            
            # Create data pooler instance
            data_pooler = MMMStackDataPooler(minio_client, bucket_name)
            
            # Step 1: Pool the data
            pooled_data = data_pooler.pool_data_by_identifiers(
                scope_number=scope_number,
                combinations=combinations,
                pool_by_identifiers=pool_by_identifiers,
                x_variables=x_variables,
                y_variable=y_variable,
                all_identifiers=filtered_identifiers
            )
            
            if not pooled_data:
                raise ValueError("No pooled data created")
            
            logger.info(f"Created {len(pooled_data)} pools")
            
            # Step 2: Apply clustering to pooled data
            # Use user-specified clustering columns or default to all variables
            if clustering_columns is None:
                numerical_columns = [var.lower() for var in x_variables + [y_variable]]
            else:
                numerical_columns = [var.lower() for var in clustering_columns]
                # Validate that clustering columns are subset of available variables
                available_variables = [var.lower() for var in x_variables + [y_variable]]
                invalid_columns = [col for col in numerical_columns if col not in available_variables]
                if invalid_columns:
                    raise ValueError(f"Clustering columns {invalid_columns} are not available in x_variables + y_variable")
            
            logger.info(f"Using columns for clustering: {numerical_columns}")
            clustered_pools = data_pooler.apply_clustering_to_pools(pooled_data, numerical_columns, n_clusters)
            
            split_clustered_data = data_pooler.split_clustered_data_by_clusters(clustered_pools)
            
            
            # Prepare detailed clustering information for each pool
            pool_clustering_details = {}
            for pool_key, df in clustered_pools.items():
                # Get unique cluster IDs for this pool
                unique_clusters = df['cluster_id'].unique().tolist()
                unique_clusters = [int(cluster) for cluster in unique_clusters]  # Convert to int
                
                # Get clustered data (x_variables + y_variable) for each cluster
                cluster_data = {}
                for cluster_id in unique_clusters:
                    # Use the split_clustered_data instead of re-splitting
                    split_key = f"{pool_key}_{cluster_id}"
                    if split_key in split_clustered_data:
                        cluster_df = split_clustered_data[split_key]
                        
                        # Extract x_variables and y_variable data
                        cluster_info = {
                            'cluster_id': int(cluster_id),
                            'rows': int(len(cluster_df)),
                            'data': {}
                        }
                        
                        # Add x_variables and y_variable data
                        for col in numerical_columns:
                            if col in cluster_df.columns:
                                cluster_info['data'][col] = {
                                    'mean': float(cluster_df[col].mean()),
                                    'min': float(cluster_df[col].min()),
                                    'max': float(cluster_df[col].max()),
                                    'std': float(cluster_df[col].std())
                                }
                        
                        cluster_data[f'cluster_{cluster_id}'] = cluster_info
                
                pool_clustering_details[pool_key] = {
                    'total_clusters': len(unique_clusters),
                    'cluster_ids': unique_clusters,
                    'cluster_data': cluster_data
                }
            
            # Prepare split clustered keys and their column names
            split_clustered_columns_info = {}
            for split_key, df in split_clustered_data.items():
                split_clustered_columns_info[split_key] = {
                    'columns': df.columns.tolist(),
                    'total_columns': len(df.columns)
                }
            
            # Prepare response with split clustered data
            result = {
                'status': 'success',
                'scope_number': scope_number,
                'pool_by_identifiers': pool_by_identifiers,
                'total_combinations': len(combinations),
                'total_pools': len(pooled_data),
                'total_split_clusters': len(split_clustered_data),
                'x_variables': x_variables,
                'y_variable': y_variable,
                'numerical_columns_used': numerical_columns,
                'n_clusters': n_clusters,
                'clustered_pool_keys': list(clustered_pools.keys()),
                'split_clustered_keys': list(split_clustered_data.keys()),
                'split_clustered_columns_info': split_clustered_columns_info,
                'pool_clustering_details': pool_clustering_details,
                'split_clustered_data': split_clustered_data  # Return the actual split clustered data
            }
            
            logger.info(f"Successfully prepared stack model data: {len(split_clustered_data)} split clusters ready for modeling")
            return result
            
        except Exception as e:
            logger.error(f"Error preparing stack model data: {e}")
            return {
                'status': 'error',
                'error': str(e),
                'scope_number': scope_number,
                'pool_by_identifiers': pool_by_identifiers
            }
    
    async def train_mmm_models_for_stack_data(
        self,
        split_clustered_data: Dict[str, pd.DataFrame],
        x_variables: List[str],
        y_variable: str,
        variable_configs: Dict[str, Dict[str, Any]],
        models_to_run: List[str],
        custom_configs: Optional[Dict[str, Any]] = None,
        apply_interaction_terms: bool = True,
        numerical_columns_for_interaction: List[str] = None,
        test_size: float = 0.2,
        price_column: Optional[str] = None,
        scope_number: str = None,
        combinations: List[str] = None,
        minio_client = None,
        bucket_name: str = None,
        roi_config: Optional[Dict[str, Any]] = None,
        run_id: str = None,
        training_progress: Dict = None
    ) -> Dict[str, Any]:
        """
        Train MMM models on split clustered data following the stack_model_training.py approach:
        1. Train stack models on pooled data to get betas
        2. For each combination individually:
           - Fetch individual combination data
           - Use stack model betas to make predictions
           - Calculate metrics (MAPE, R², AIC, BIC, elasticities, contributions) for each combination
        """
        try:
            logger.info(f"Starting MMM stack model training on {len(split_clustered_data)} split clusters")
            
            # Step 1: Train stack models on pooled data to get betas
            stack_model_results = await self._train_stack_models_for_betas(
                split_clustered_data, x_variables, y_variable, variable_configs,
                models_to_run, custom_configs, apply_interaction_terms,
                numerical_columns_for_interaction, test_size, price_column
            )
            
            # Step 2: Calculate individual combination metrics using stack betas
            logger.info(f"📊 Checking parameters for individual combination metrics:")
            logger.info(f"   scope_number: {scope_number} (type: {type(scope_number)})")
            logger.info(f"   combinations: {combinations} (length: {len(combinations) if combinations else 0})")
            logger.info(f"   minio_client: {minio_client is not None}")
            logger.info(f"   bucket_name: {bucket_name}")
            
            if scope_number and combinations and minio_client and bucket_name:
                logger.info(f"🔍 Calling _calculate_individual_combination_metrics with:")
                logger.info(f"   Scope: {scope_number}")
                logger.info(f"   Combinations: {combinations}")
                logger.info(f"   X variables: {x_variables}")
                logger.info(f"   Y variable: {y_variable}")
                logger.info(f"   Stack model results count: {len(stack_model_results)}")
                
                # Log sample of stack model results
                if stack_model_results:
                    sample_result = stack_model_results[0]
                    logger.info(f"   Sample stack result keys: {list(sample_result.keys())}")
                    logger.info(f"   Sample model name: {sample_result.get('model_name', 'unknown')}")
                    logger.info(f"   Sample cluster combinations: {sample_result.get('cluster_combinations', [])}")
                    logger.info(f"   Has combination betas: {'combination_betas' in sample_result}")
                    if 'combination_betas' in sample_result:
                        logger.info(f"   Sample combination betas: {sample_result['combination_betas']}")
                
                individual_metrics = await self._calculate_individual_combination_metrics(
                    scope_number=scope_number,
                    combinations=combinations,
                    x_variables=x_variables,
                    y_variable=y_variable,
                    minio_client=minio_client,
                    bucket_name=bucket_name,
                    stack_model_results=stack_model_results,
                    variable_configs=variable_configs,
                    price_column=price_column,
                    roi_config=roi_config,
                    run_id=run_id,
                    training_progress=training_progress,
                    models_to_run=models_to_run
                )
            else:
                logger.warning("Missing parameters for individual combination metrics calculation")
                individual_metrics = {}
            
            # Prepare final results
            final_results = {
                'status': 'success',
                'total_split_clusters': len(split_clustered_data),
                'stack_model_results': stack_model_results,
                'individual_combination_metrics': individual_metrics,
                'variable_configs': variable_configs,
                'models_tested': models_to_run
            }
            
            logger.info(f"Completed MMM stack model training with individual combination metrics")
            return final_results
            
        except Exception as e:
            logger.error(f"Error in MMM stack model training: {e}")
            return {
                'status': 'error',
                'error': str(e),
                'total_split_clusters': len(split_clustered_data) if split_clustered_data else 0
            }
    
    async def _process_combination_for_stack(
        self,
        cluster_df: pd.DataFrame,
        combo_config: Dict[str, Dict[str, Any]],
        models_to_run: List[str],
        custom_configs: Optional[Dict[str, Any]],
        x_variables_lower: List[str],
        y_variable_lower: str,
        test_size: float,
        price_column: Optional[str],
        transformation_engine,
        apply_interaction_terms: bool,
        numerical_columns_for_interaction: List[str]
    ) -> List[Dict[str, Any]]:
        """Process a single parameter combination for stack MMM training."""
        try:
            logger.info(f"Starting _process_combination_for_stack with {len(cluster_df)} records")
            logger.info(f"Cluster columns: {list(cluster_df.columns)}")
            logger.info(f"X variables: {x_variables_lower}")
            logger.info(f"Y variable: {y_variable_lower}")
            
            # Step 1: Split by unique combinations and apply transformations
            transformed_combinations = []
            combination_metadata = {}
            
            # Get unique combinations in this cluster
            if 'combination' in cluster_df.columns:
                unique_combinations = cluster_df['combination'].unique()
                logger.info(f"Found {len(unique_combinations)} unique combinations")
            else:
                # If no combination column, treat entire cluster as one combination
                unique_combinations = ['default_combination']
                cluster_df_copy = cluster_df.copy()
                cluster_df_copy['combination'] = 'default_combination'
                cluster_df = cluster_df_copy
            
            # Apply transformations to each unique combination
            for combination in unique_combinations:
                combo_data = cluster_df[cluster_df['combination'] == combination].copy()
                
                if len(combo_data) == 0:
                    continue
                
                logger.info(f"Transforming combination '{combination}' with {len(combo_data)} records")
                
                # Apply MMM transformations
                transformed_combo, metadata = transformation_engine.apply_variable_transformations(
                    combo_data, combo_config
                )
                
                transformed_combinations.append(transformed_combo)
                combination_metadata[combination] = metadata
            
            if not transformed_combinations:
                logger.warning("No valid transformed combinations")
                return []
            
            # Step 2: Merge transformed combinations
            merged_df = pd.concat(transformed_combinations, ignore_index=True)
            logger.info(f"Merged {len(transformed_combinations)} combinations into {len(merged_df)} records")
            logger.info(f"Merged dataframe columns: {list(merged_df.columns)}")
            
            # Step 3: Create interaction terms if requested
            if apply_interaction_terms and numerical_columns_for_interaction:
                logger.info("Creating interaction terms")
                merged_df = self._create_interaction_terms_for_stack(
                    merged_df, numerical_columns_for_interaction
                )
            
            # Step 4: Train models for this parameter combination
            logger.info(f"About to train models for combination with {len(merged_df)} records")
            model_results = await self._train_models_for_combination_stack(
                merged_df, combo_config, models_to_run, custom_configs,
                x_variables_lower, y_variable_lower, test_size,
                price_column, combination_metadata,
                apply_interaction_terms, numerical_columns_for_interaction
            )
            
            logger.info(f"Model training completed: {len(model_results)} models trained")
            return model_results
            
        except Exception as e:
            logger.error(f"Error in _process_combination_for_stack: {e}")
            return []
    
    def _create_interaction_terms_for_stack(
        self, 
        df: pd.DataFrame, 
        numerical_columns_for_interaction: List[str]
    ) -> pd.DataFrame:
        """Create interaction terms for stack MMM data."""
        try:
            enhanced_df = df.copy()
            
            # Check if combination column exists and has more than 1 unique value
            if 'combination' not in df.columns:
                logger.warning("No 'combination' column found, skipping interaction terms")
                return enhanced_df
            
            combination_unique_values = df['combination'].nunique()
            
            if combination_unique_values <= 1:
                logger.info(f"Only {combination_unique_values} unique combination(s), skipping interaction terms")
                return enhanced_df
            
            # One-hot encode the combination column
            combination_dummies = pd.get_dummies(df['combination'], prefix="encoded_combination", drop_first=False)
            
            # Add one-hot encoded combination columns to the dataframe
            for dummy_col in combination_dummies.columns:
                enhanced_df[dummy_col] = combination_dummies[dummy_col]
            
            # Create interaction terms
            interaction_columns_created = []
            encoded_combination_columns = [col for col in enhanced_df.columns if col.startswith("encoded_combination_")]
            
            # Create interactions between encoded combinations and numerical columns
            for encoded_combination_col in encoded_combination_columns:
                for numerical_col in numerical_columns_for_interaction:
                    if numerical_col in enhanced_df.columns:
                        interaction_col_name = f"{encoded_combination_col}_x_{numerical_col}"
                        enhanced_df[interaction_col_name] = enhanced_df[encoded_combination_col] * enhanced_df[numerical_col]
                        interaction_columns_created.append(interaction_col_name)
                
            logger.info(f"Created {len(interaction_columns_created)} interaction terms")
            return enhanced_df
            
        except Exception as e:
            logger.error(f"Error creating interaction terms: {e}")
            return df
    
    async def _train_models_for_combination_stack(
        self,
        df: pd.DataFrame,
        combo_config: Dict[str, Dict[str, Any]],
        models_to_run: List[str],
        custom_configs: Optional[Dict[str, Any]],
        x_variables_lower: List[str],
        y_variable_lower: str,
        test_size: float,
        price_column: Optional[str],
        transformation_metadata: Dict[str, Any],
        apply_interaction_terms: bool = True,
        numerical_columns_for_interaction: List[str] = None
    ) -> List[Dict[str, Any]]:
        """Train models for a specific parameter combination in stack MMM."""
        try:
            logger.info(f"Starting _train_models_for_combination_stack with {len(df)} records")
            logger.info(f"Dataframe columns: {list(df.columns)}")
            logger.info(f"X variables: {x_variables_lower}")
            logger.info(f"Y variable: {y_variable_lower}")
            
            import numpy as np
            from .models import get_models, safe_mape
            

            
            # Check for missing values
            missing_x = df[x_variables_lower].isnull().sum()
            missing_y = df[y_variable_lower].isnull().sum()
   
            
            # Check data types
            x_dtypes = df[x_variables_lower].dtypes
            y_dtype = df[y_variable_lower].dtype

      
            feature_columns = []
            
            # Add main x_variables first
            for var in x_variables_lower:
                if var in df.columns:
                    feature_columns.append(var)
            
            # Add encoded combination variables (encoded_combination_*)
            for col in df.columns:
                if col.startswith('encoded_combination_') and col not in feature_columns:
                    feature_columns.append(col)
            
            # Add interaction variables (ending with x_variable names)
            for var in x_variables_lower:
                for col in df.columns:
                    if col.endswith(f'_x_{var}') and col not in feature_columns:
                        feature_columns.append(col)
            
            # Sort to ensure consistent order
            feature_columns.sort()
            
            # Log feature information for debugging
            logger.info(f"   - Total features for modeling: {len(feature_columns)}")
            logger.info(f"   - Main x_variables: {x_variables_lower}")
            encoded_features = [col for col in feature_columns if col.startswith('encoded_combination_')]
            interaction_features = [col for col in feature_columns if any(col.endswith(f'_x_{var}') for var in x_variables_lower)]
            logger.info(f"   - Encoded combination features: {encoded_features}")
            logger.info(f"   - Interaction features: {interaction_features}")
            logger.info(f"   - All features: {feature_columns}")
            
            # Clean data - remove rows with missing values for ALL features
            all_columns = feature_columns + [y_variable_lower]
            df_clean = df[all_columns].dropna()
            
            if df_clean.empty:
                return []
            
            # Convert to numeric, coercing errors to NaN
            for col in feature_columns:
                df_clean[col] = pd.to_numeric(df_clean[col], errors='coerce')
            df_clean[y_variable_lower] = pd.to_numeric(df_clean[y_variable_lower], errors='coerce')
            
            # Remove rows with NaN after conversion
            df_clean = df_clean.dropna()
            
            if df_clean.empty:
                return []
            
            # Prepare data for modeling using ALL features
            X = df_clean[feature_columns].values
            y = df_clean[y_variable_lower].values
            
            # Store original data statistics for elasticity calculation (only for main x_variables)
            X_original = df_clean[x_variables_lower]
            y_original = df_clean[y_variable_lower]
            

            
            # Final validation before train/test split
            if len(X) < 10:  # Need minimum samples for meaningful training
                logger.error(f"❌ Insufficient data for stack MMM training: {len(X)} samples")
                return []
            
            # Train/test split
            X_train, X_test, y_train, y_test = train_test_split(
                X, y, test_size=test_size, random_state=42, shuffle=True
            )
            
            # Convert boolean columns to numeric (encoded combination variables)
            logger.info("Converting boolean columns to numeric for validation")
            X_train_df = pd.DataFrame(X_train, columns=feature_columns)
            X_test_df = pd.DataFrame(X_test, columns=feature_columns)
            
            # Convert boolean columns to numeric
            for col in X_train_df.columns:
                if X_train_df[col].dtype == 'bool':
                    X_train_df[col] = X_train_df[col].astype(int)
                    X_test_df[col] = X_test_df[col].astype(int)
                    logger.info(f"Converted boolean column '{col}' to numeric")
            
            # Convert back to numpy arrays
            X_train = X_train_df.values
            X_test = X_test_df.values
            
            # Validate split data
            logger.info(f"X_train shape: {X_train.shape}, y_train shape: {y_train.shape}")
            logger.info(f"X_train dtype: {X_train.dtype}, y_train dtype: {y_train.dtype}")
            
            # Get models
            all_models = get_models()
            logger.info(f"Available models: {list(all_models.keys())}")
            
            # Filter models if specified
            if models_to_run:
                models_dict = {name: model for name, model in all_models.items() if name in models_to_run}
                logger.info(f"Filtered models to run: {list(models_dict.keys())}")
            else:
                models_dict = all_models
                logger.info(f"Using all available models: {list(models_dict.keys())}")
            
            # Apply custom configurations (same approach as individual MMM training)
            if custom_configs:
                for model_name, config in custom_configs.items():
                    if model_name in models_dict:
                        parameters = config.get('parameters', {})
                        tuning_mode = config.get('tuning_mode', 'manual')
                        
                        # Handle automatic tuning with CV models (same as individual MMM)
                        if model_name == "Ridge Regression" and tuning_mode == 'auto':
                            # Use RidgeCV for automatic alpha tuning with reasonable alpha range
                            from sklearn.linear_model import RidgeCV
                            alphas = np.logspace(-2, 3, 50)  # 0.0001 to 10000 (reasonable range)
                            logger.info(f"🔧 {model_name} - Auto tuning with alpha range: {alphas[0]:.6f} to {alphas[-1]:.6f} ({len(alphas)} values)")
                            models_dict[model_name] = RidgeCV(alphas=alphas, cv=5)  # Default CV folds
                            
                        elif model_name == "Lasso Regression" and tuning_mode == 'auto':
                            # Use LassoCV for automatic alpha tuning with reasonable alpha range
                            from sklearn.linear_model import LassoCV
                            alphas = np.logspace(-3, 2, 50)  # 0.0001 to 10 (reasonable range for Lasso)
                            logger.info(f"🔧 {model_name} - Auto tuning with alpha range: {alphas[0]:.6f} to {alphas[-1]:.6f} ({len(alphas)} values)")
                            models_dict[model_name] = LassoCV(alphas=alphas, cv=5, random_state=42)
                            
                        elif model_name == "ElasticNet Regression" and tuning_mode == 'auto':
                            # Use ElasticNetCV for automatic alpha and l1_ratio tuning with reasonable ranges
                            from sklearn.linear_model import ElasticNetCV
                            alphas = np.logspace(-3, 2, 50)  # 0.0001 to 10 (reasonable range for ElasticNet)
                            l1_ratios = np.linspace(0.1, 0.9, 9)  # Default l1_ratio range
                            logger.info(f"🔧 {model_name} - Auto tuning with alpha range: {alphas[0]:.6f} to {alphas[-1]:.6f} ({len(alphas)} values), l1_ratio range: {l1_ratios[0]:.2f} to {l1_ratios[-1]:.2f} ({len(l1_ratios)} values)")
                            models_dict[model_name] = ElasticNetCV(
                                alphas=alphas, l1_ratio=l1_ratios, cv=5, random_state=42
                            )
                        
                        # Handle constrained models (extract constraints from parameters, not variable_constraints)
                        elif model_name == "Custom Constrained Ridge":
                            from .models import CustomConstrainedRidge
                            # Extract constraints from parameters object (same as individual MMM)
                            negative_constraints = parameters.get('negative_constraints', [])
                            positive_constraints = parameters.get('positive_constraints', [])
                            
                            models_dict[model_name] = CustomConstrainedRidge(
                                l2_penalty=parameters.get('l2_penalty', 0.1),
                                learning_rate=parameters.get('learning_rate', 0.001),
                                iterations=parameters.get('iterations', 10000),
                                adam=parameters.get('adam', False),
                                negative_constraints=negative_constraints,
                                positive_constraints=positive_constraints
                            )
                        
                        elif model_name == "Constrained Linear Regression":
                            from .models import ConstrainedLinearRegression
                            # Extract constraints from parameters object (same as individual MMM)
                            negative_constraints = parameters.get('negative_constraints', [])
                            positive_constraints = parameters.get('positive_constraints', [])
                            
                            models_dict[model_name] = ConstrainedLinearRegression(
                                learning_rate=parameters.get('learning_rate', 0.001),
                                iterations=parameters.get('iterations', 10000),
                                adam=parameters.get('adam', False),
                                negative_constraints=negative_constraints,
                                positive_constraints=positive_constraints
                            )
                        
                        # Handle other models with manual parameter tuning
                        elif tuning_mode == 'manual' and parameters:
                            # Apply manual parameters to existing model instances
                            try:
                                if hasattr(models_dict[model_name], 'set_params'):
                                    models_dict[model_name].set_params(**parameters)
                                    logger.info(f"🔧 {model_name} - Applied manual parameters: {parameters}")
                            except Exception as e:
                                logger.warning(f"Failed to apply parameters to {model_name}: {e}")
                                # Keep original model if parameter application fails
            
            # Train models
            model_results = []
            logger.info(f"Starting to train {len(models_dict)} models")
            
            for model_name, model in models_dict.items():
                logger.info(f"Training model: {model_name}")
                try:
                    # Train model
                    if hasattr(model, 'fit'):
                        if model_name in ["Custom Constrained Ridge", "Constrained Linear Regression"]:
                            model.fit(X_train, y_train, feature_names=x_variables_lower)
                        else:
                            model.fit(X_train, y_train)
                        logger.info(f"Successfully trained {model_name}")
                    else:
                        logger.error(f"Model {model_name} does not have fit method")
                        continue
                    
                    # Make predictions
                    y_train_pred = model.predict(X_train)
                    y_test_pred = model.predict(X_test)
                    
                    # Validate predictions
                    if np.isnan(y_train_pred).any() or np.isnan(y_test_pred).any():
                        logger.error(f"❌ NaN values in predictions for {model_name}")
                        continue
                    
                    if np.isinf(y_train_pred).any() or np.isinf(y_test_pred).any():
                        logger.error(f"❌ Infinite values in predictions for {model_name}")
                        continue
                    
                    # Calculate core metrics only
                    mape_train = safe_mape(y_train, y_train_pred)
                    mape_test = safe_mape(y_test, y_test_pred)
                    r2_train = r2_score(y_train, y_train_pred)
                    r2_test = r2_score(y_test, y_test_pred)
                    
                    # Calculate MSE
                    mse_train = np.mean((y_train - y_train_pred) ** 2)
                    mse_test = np.mean((y_test - y_test_pred) ** 2)
                    
                    # Calculate AIC and BIC
                    n_samples = len(y_train)
                    n_params = len(feature_columns) + 1  # Include interaction terms and encoded combination columns
                    aic = n_samples * np.log(mse_test) + 2 * n_params
                    bic = n_samples * np.log(mse_test) + n_params * np.log(n_samples)
                    
                    # Get basic coefficients for all features (x_variables + interaction terms + encoded combination columns)
                    coefficients = {}
                    intercept = model.intercept_ if hasattr(model, 'intercept_') else 0.0
                    
                    if hasattr(model, 'coef_'):
                        for i, var in enumerate(feature_columns):
                            coefficients[f"Beta_{var}"] = float(model.coef_[i])
                    
                    # Calculate combination-specific betas
                    logger.info(f"Calculating combination betas for {model_name}")
                    
                    # Get unique combinations from the data
                    unique_combinations = []
                    if 'combination' in df.columns:
                        unique_combinations = df['combination'].unique().tolist()
                        logger.info(f"Found combinations: {unique_combinations}")
                    else:
                        logger.warning("No 'combination' column found in dataframe")
                    
                    combination_betas = {}
                    for combination in unique_combinations:
                        # Create a temporary model result with the required structure
                        temp_model_result = {
                            "model_name": model_name,
                            "coefficients": coefficients,
                            "intercept": float(intercept)
                        }
                        
                        combination_beta = self.calculate_combination_betas(
                            model_results=[temp_model_result],  # Pass complete model result structure
                            combinations=[combination],
                            x_variables=x_variables_lower,
                            numerical_columns_for_interaction=numerical_columns_for_interaction or [],
                            split_cluster_id=None,
                            standardization='none'
                        )
                        combination_betas[combination] = combination_beta.get(combination, {})
                        logger.info(f"Combination betas for '{combination}': {combination_betas[combination]}")
                    
                    # Store enhanced model result
                    model_result = {
                        "model_name": model_name,
                        "mape_train": float(mape_train),
                        "mape_test": float(mape_test),
                        "r2_train": float(r2_train),
                        "r2_test": float(r2_test),
                        "mse_train": float(mse_train),
                        "mse_test": float(mse_test),
                        "coefficients": coefficients,
                        "intercept": float(intercept),
                        "aic": float(aic),
                        "bic": float(bic),
                        "n_parameters": n_params,
                        "train_size": len(y_train),
                        "test_size": len(y_test),
                        "combination_betas": combination_betas,  # Add combination-specific betas
                    }
                    
                    model_results.append(model_result)
                    logger.info(f"Successfully added model result for {model_name}")
            
                except Exception as e:
                    logger.error(f"Error training model {model_name}: {e}")
                    import traceback
                    logger.error(f"Traceback: {traceback.format_exc()}")
                    continue
            
            return model_results
            
        except Exception as e:
            logger.error(f"Error in _train_models_for_combination_stack: {e}")
            import traceback
            logger.error(f"Traceback: {traceback.format_exc()}")
            return []



   
