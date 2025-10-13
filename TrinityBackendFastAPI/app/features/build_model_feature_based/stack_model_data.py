
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
from sklearn.preprocessing import StandardScaler, MinMaxScaler
from sklearn.model_selection import train_test_split
from sklearn.metrics import r2_score

logger = logging.getLogger("stack-model-data")

# Import global training_progress for progress tracking
def get_training_progress():
    """Import and return the global training_progress dictionary from routes."""
    try:
        from .routes import training_progress
        return training_progress
    except ImportError:
        logger.warning("Could not import training_progress from routes")
        return {}
            


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
        all_identifiers: List[str],
        clustering_columns: List[str] = None
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
                    
                    # Filter data to include identifiers, x_variables, y_variable, and clustering columns
                    filtered_df = self._filter_combination_data(df, all_identifiers, x_variables, y_variable, clustering_columns)
                    
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
    
    def _filter_combination_data(self, df: pd.DataFrame, filtered_identifiers: List[str], x_variables: List[str], y_variable: str, clustering_columns: List[str] = None) -> pd.DataFrame:

        try:
            # Include clustering columns if provided, avoiding duplicates
            clustering_cols = clustering_columns or []
            # Combine all columns and remove duplicates while preserving order
            all_columns = filtered_identifiers + x_variables + [y_variable] + clustering_cols
            required_columns = list(dict.fromkeys(all_columns))  # Remove duplicates while preserving order
            
            # Log column information for debugging
            if clustering_cols:
                overlapping_cols = set(x_variables + [y_variable]) & set(clustering_cols)
                if overlapping_cols:
                    logger.info(f"Clustering columns overlap with model variables: {list(overlapping_cols)}")
                logger.info(f"Total columns requested: {len(all_columns)}, Unique columns: {len(required_columns)}")
            
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
                logger.info(f"Combination aggregated: {combination_aggregated}")
                
                if combination_aggregated is None or len(combination_aggregated) == 0:
                    clustered_pools[pool_key] = pool_df
                    continue

                combination_clusters = self._cluster_combinations(combination_aggregated, numerical_columns, n_clusters)


                logger.info(f"Combination clusters: {combination_clusters}")

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

        from io import BytesIO
        from datetime import datetime
        
        split_data = {}
        saved_files = {}  # Track saved file paths
        
        for pool_key, df in clustered_pools.items():
            if 'cluster_id' not in df.columns:
                logger.warning(f"No cluster_id column found in {pool_key}, skipping split")
                continue
                
            # Get unique cluster IDs for this pool
            unique_clusters = df['cluster_id'].unique()
            
            for cluster_id in unique_clusters:
                # Filter data for this specific cluster
                cluster_df = df[df['cluster_id'] == cluster_id].copy()
                
                # Create unique key: pool_key_cluster_id
                unique_key = f"{pool_key}_{int(cluster_id)}"
                # Remove cluster_id column as it's no longer needed
                if 'cluster_id' in cluster_df.columns:
                    cluster_df = cluster_df.drop('cluster_id', axis=1)
                
                split_data[unique_key] = cluster_df
        
        # Log summary of saved files
        if saved_files:
            successful_saves = [k for k, v in saved_files.items() if v is not None]
        
        return split_data
    


    

    

class StackModelDataProcessor:

    
    def __init__(self):
        pass
    
    async def get_column_classifier_config(self) -> Dict[str, Any]:
        """Get column classifier configuration using the same pattern as routes."""
        try:
            from .mongodb_saver import get_column_classifier_config_from_mongo
            from ..data_upload_validate.app.routes import get_object_prefix
            
            # Get the current prefix
            prefix = await get_object_prefix()
            
            # Extract client/app/project from prefix
            prefix_parts = prefix.strip('/').split('/')
            if len(prefix_parts) >= 2:
                client_name = prefix_parts[0]
                app_name = prefix_parts[1]
                project_name = prefix_parts[2] if len(prefix_parts) > 2 else "default_project"
                
                # Use the same function as routes
                config = await get_column_classifier_config_from_mongo(client_name, app_name, project_name)
                
                if config:
                    logger.info(f"✅ Retrieved column classifier config for {client_name}/{app_name}/{project_name}")
                    return config
                else:
                    logger.warning(f"No column classifier config found for {client_name}/{app_name}/{project_name}")
                    return {}
            else:
                logger.error(f"Invalid prefix format: {prefix}")
                return {}
                
        except Exception as e:
            logger.error(f"Error fetching column classifier config: {e}")
            return {}

    
    def filter_combination_data(self, df: pd.DataFrame, identifiers: List[str], x_variables: List[str], y_variable: str) -> pd.DataFrame:

        try:
            # Get all required columns
            required_columns = identifiers + x_variables + [y_variable]
            
            # Filter to only include columns that exist in the DataFrame
            available_columns = [col for col in required_columns if col in df.columns]
            missing_columns = [col for col in required_columns if col not in df.columns]
            
            if missing_columns:
                pass
            
            # Create filtered DataFrame
            filtered_df = df[available_columns].copy()
            
            
            return filtered_df
            
        except Exception as e:
            pass
            return df
    
    async def apply_clustering_to_stack_data(
        self,
        pooled_data: Dict[str, pd.DataFrame],
        numerical_columns: List[str],
        minio_client: Minio,
        bucket_name: str,
        n_clusters: Optional[int] = None,
        apply_interaction_terms: bool = True,
        identifiers_for_interaction: List[str] = None,
        numerical_columns_for_interaction: List[str] = None,
        standardization: str = 'none'
    ) -> Dict[str, Any]:

        try:
            
            # Create data pooler instance
            data_pooler = DataPooler(minio_client, bucket_name)
            
            # Apply clustering to all pools
            clustered_pools = data_pooler.apply_clustering_to_pools(pooled_data, numerical_columns, n_clusters)
            
            # Get summary of clustered data
            summary = data_pooler.get_pool_summary(clustered_pools)
            
            # Split clustered data by individual clusters
            split_clustered_data = data_pooler.split_clustered_data_by_clusters(clustered_pools)

            
            # Apply interaction terms to split clustered data if requested
            if apply_interaction_terms and numerical_columns_for_interaction:
                
                # Get column classifier identifiers for interaction terms
                column_config = await self.get_column_classifier_config()
                all_identifiers = column_config.get('identifiers', [])
                
                split_clustered_data = data_pooler.create_interaction_terms(
                    pooled_data=split_clustered_data,
                    identifiers=None,  # Will auto-detect identifiers with >1 unique value
                    numerical_columns_for_interaction=numerical_columns_for_interaction,
                    column_classifier_identifiers=all_identifiers,
                    standardization=standardization
                )
                
            
            # Prepare detailed clustering information for each pool using split_clustered_data
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
            # Prepare response
            result = {
                'status': 'success',
                'clustered_pool_keys': list(clustered_pools.keys()),
                'split_clustered_keys': list(split_clustered_data.keys()),
                'split_clustered_columns_info': split_clustered_columns_info,
                'numerical_columns_used': numerical_columns,
                'n_clusters': n_clusters,
                'pool_clustering_details': pool_clustering_details
            }
            
            return result
            
        except Exception as e:
            logger.error(f"Error applying clustering to stack data: {e}")
            return {
                'status': 'error',
                'error': str(e),
                'total_pools': len(pooled_data) if pooled_data else 0
            }
    
    
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
            
            
            # Create data pooler instance
            data_pooler = MMMStackDataPooler(minio_client, bucket_name)
            
            # Step 1: Pool the data
            pooled_data = data_pooler.pool_data_by_identifiers(
                scope_number=scope_number,
                combinations=combinations,
                pool_by_identifiers=pool_by_identifiers,
                x_variables=x_variables,
                y_variable=y_variable,
                all_identifiers=filtered_identifiers,
                clustering_columns=clustering_columns
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
            
            clustered_pools = data_pooler.apply_clustering_to_pools(pooled_data, numerical_columns, n_clusters)
            
            if not clustered_pools:
                raise ValueError("Clustering failed - no clustered pools created")
            
            
            split_clustered_data = data_pooler.split_clustered_data_by_clusters(clustered_pools)
            
            if not split_clustered_data:
                raise ValueError("Split clustering failed - no split clusters created")
            
            
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
            
            return result
            
        except Exception as e:
            logger.error(f"Error preparing stack model data: {e}")
            return {
                'status': 'error',
                'error': str(e),
                'scope_number': scope_number,
                'pool_by_identifiers': pool_by_identifiers
            }
    

   

    async def process_split_clustered_data(
        self,
        split_clustered_data: Dict[str, pd.DataFrame],
        x_variables_lower: List[str],
        y_variable_lower: str,
        variable_configs: Optional[Dict[str, Dict[str, Any]]] = None,
        standardization: str = 'none',
        k_folds: int = 5,
        models_to_run: Optional[List[str]] = None,
        custom_configs: Optional[Dict[str, Any]] = None,
        price_column: Optional[str] = None,
        test_size: float = 0.2,
        apply_interaction_terms: bool = True,
        numerical_columns_for_interaction: List[str] = None,
        run_id: str = None,
        negative_constraints: List[str] = None,
        positive_constraints: List[str] = None
    ) -> Dict[str, Any]:
        """Process all split clustered data for stack MMM training."""
        try:
            # Debug: Log constraint parameters received

            
            # Validate input parameters
            if not split_clustered_data:
                raise Exception("❌ No split clustered data provided")
            
            if not x_variables_lower:
                raise Exception("❌ No x_variables provided")
            
            if not y_variable_lower:
                raise Exception("❌ No y_variable provided")

            
            results = {}
            training_progress = get_training_progress()
            successful_clusters = 0
            failed_clusters = 0
            
            for split_key, cluster_df in split_clustered_data.items():
                # logger.info(f"Processing split cluster: {split_key}")
                
                # Validate cluster data
                if cluster_df is None or cluster_df.empty:
                    error_msg = f"Empty or None cluster data for {split_key}"
                    logger.error(f"❌ {error_msg}")
                    results[split_key] = {
                        'model_results': [],
                        'total_records': 0,
                        'error': error_msg
                    }
                    failed_clusters += 1
                    continue
                
                # Check if required columns exist
                missing_columns = []
                for var in x_variables_lower + [y_variable_lower]:
                    if var not in cluster_df.columns:
                        missing_columns.append(var)
                
                if missing_columns:
                    error_msg = f"Missing columns in {split_key}: {missing_columns}"
                    logger.error(f"❌ {error_msg}")
                    results[split_key] = {
                        'model_results': [],
                        'total_records': len(cluster_df),
                        'error': error_msg
                    }
                    failed_clusters += 1
                    continue
                
                # Create combo_config for standardization
                combo_config = {}
                for var in x_variables_lower + [y_variable_lower]:
                    combo_config[var] = {'standardization': standardization}
                
                try:
                    # Process this cluster
                    cluster_results = await self._process_combination_for_stack(
                        cluster_df=cluster_df,
                        combo_config=combo_config,
                        variable_configs=variable_configs,  # Pass per-variable transformations
                        models_to_run=models_to_run or [],
                        custom_configs=custom_configs or {},
                        x_variables_lower=x_variables_lower,
                        y_variable_lower=y_variable_lower,
                        test_size=test_size,
                        price_column=price_column,
                        apply_interaction_terms=apply_interaction_terms,
                        numerical_columns_for_interaction=numerical_columns_for_interaction or [],
                        run_id=run_id,
                        training_progress=training_progress,
                        cluster_info=split_key,
                        negative_constraints=negative_constraints,
                        positive_constraints=positive_constraints
                    )
                    
                    if not cluster_results:
                        error_msg = f"No model results returned for {split_key}"
                        logger.error(f"❌ {error_msg}")
                        results[split_key] = {
                            'model_results': [],
                            'total_records': len(cluster_df),
                            'error': error_msg
                        }
                        failed_clusters += 1
                    else:
                        results[split_key] = {
                            'model_results': cluster_results,
                            'total_records': len(cluster_df),
                            'error': None
                        }
                        successful_clusters += 1
                        logger.info(f"✅ Completed processing {split_key}: {len(cluster_results)} models trained")
                
                except Exception as e:
                    error_msg = f"Error processing {split_key}: {str(e)}"
                    logger.error(f"❌ {error_msg}")
                    results[split_key] = {
                        'model_results': [],
                        'total_records': len(cluster_df),
                        'error': error_msg
                    }
                    failed_clusters += 1
            
            # Summary logging
            # logger.info(f"📊 Processing Summary:")
            # logger.info(f"   ✅ Successful clusters: {successful_clusters}")
            # logger.info(f"   ❌ Failed clusters: {failed_clusters}")
            # logger.info(f"   📈 Total clusters: {len(split_clustered_data)}")
            
            if successful_clusters == 0:
                raise Exception(f"❌ All {len(split_clustered_data)} clusters failed processing. Check logs for details.")
  
            for split_key, result in results.items():
                if 'error' in result:
                    logger.info(f"      - Error: {result['error']}")
            
            return results
            
        except Exception as e:
            logger.error(f"Error processing split clustered data: {e}")
            return {}

    async def _process_combination_for_stack(
        self,
        cluster_df: pd.DataFrame,
        combo_config: Dict[str, Dict[str, Any]],
        variable_configs: Optional[Dict[str, Dict[str, Any]]] = None,
        models_to_run: List[str] = None,
        custom_configs: Optional[Dict[str, Any]] = None,
        x_variables_lower: List[str] = None,
        y_variable_lower: str = None,
        test_size: float = 0.2,
        price_column: Optional[str] = None,
        apply_interaction_terms: bool = True,
        numerical_columns_for_interaction: List[str] = None,
        run_id: str = None,
        training_progress: Dict = None,
        cluster_info: str = None,
        negative_constraints: List[str] = None,
        positive_constraints: List[str] = None
    ) -> List[Dict[str, Any]]:
        """Process a single parameter combination for stack MMM training."""
        try:

            
            # Step 1: Split by unique combinations and apply transformations
            transformed_combinations = []
            combination_metadata = {}
            
            # Get unique combinations in this cluster
            if 'combination' in cluster_df.columns:
                unique_combinations = cluster_df['combination'].unique()
                # logger.info(f"Found {len(unique_combinations)} unique combinations")
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
                
                # Apply per-variable transformations if provided (adstock, logistic, etc.)
                transformation_metadata_dict = {}
                if variable_configs and len(variable_configs) > 0:
                    # logger.info(f"🔧 Applying per-variable transformations for stack modeling")
                    
                    # Import transformation engine
                    from .mmm_training import MMMTransformationEngine
                    transformation_engine = MMMTransformationEngine()
                    
                    # Apply transformations
                    try:
                        transformed_combo, transformation_metadata_dict, updated_variable_configs = transformation_engine.apply_variable_transformations(
                            combo_data, variable_configs
                        )
                        # logger.info(f"✅ Applied per-variable transformations successfully")
                        combo_data = transformed_combo  # Use transformed data
                    except Exception as transform_error:
                        logger.error(f"❌ Error applying transformations: {transform_error}")
                        logger.warning("⚠️ Proceeding without per-variable transformations")
                else:
                    logger.info("ℹ️ No variable_configs provided for stack modeling, skipping per-variable transformations")
                
                # Store transformed data and metadata
                transformed_combinations.append(combo_data)
                combination_metadata[combination] = transformation_metadata_dict
            
            if not transformed_combinations:
                logger.warning("No valid transformed combinations")
                return []
            
            # Step 2: Merge transformed combinations
            merged_df = pd.concat(transformed_combinations, ignore_index=True)

            
            # Step 3: Create encoded combination features (always needed for stack modeling)
            if not apply_interaction_terms:
                # logger.info("Creating encoded combination features")
                merged_df = self._create_encoded_combination_features(merged_df)
            
            # Step 4: Create interaction terms if requested
            if apply_interaction_terms and numerical_columns_for_interaction:
                # logger.info("Creating interaction terms")
                merged_df = self._create_interaction_terms_for_stack(
                    merged_df, numerical_columns_for_interaction
                )

            # Debug: Log constraint parameters being passed to model training
            model_results = await self._train_models_for_combination_stack(
                merged_df, combo_config, models_to_run, custom_configs,
                x_variables_lower, y_variable_lower, test_size,
                price_column, combination_metadata,
                apply_interaction_terms, numerical_columns_for_interaction,
                run_id, training_progress, cluster_info,
                negative_constraints, positive_constraints
            )
            
            logger.info(f"Model training completed: {len(model_results)} models trained")
            
            # Debug logging for model results
            if model_results:
                for i, model_result in enumerate(model_results):
                    logger.info(f"   - Model {i+1}: {model_result.get('model_name', 'Unknown')} with keys {list(model_result.keys())}")
            
            return model_results
            
        except Exception as e:
            logger.error(f"Error in _process_combination_for_stack: {e}")
            return []
    



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
            numerical_columns_for_interaction: List[str] = None,
            run_id: str = None,
            training_progress: Dict = None,
            cluster_info: str = None,
            negative_constraints: List[str] = None,
            positive_constraints: List[str] = None
        ) -> List[Dict[str, Any]]:
            """Train models for a specific parameter combination in stack MMM."""
            try:

                
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
                
                # Add interaction variables (ending with x_variable names) ONLY if interaction terms are enabled
                if apply_interaction_terms:
                    for var in x_variables_lower:
                        for col in df.columns:
                            if col.endswith(f'_x_{var}') and col not in feature_columns:
                                feature_columns.append(col)
                
                # Sort to ensure consistent order
                feature_columns.sort()
                
                # # Log feature information for debugging
                # logger.info(f"   - Total features for modeling: {len(feature_columns)}")
                # logger.info(f"   - Main x_variables: {x_variables_lower}")
                encoded_features = [col for col in feature_columns if col.startswith('encoded_combination_')]
                interaction_features = [col for col in feature_columns if any(col.endswith(f'_x_{var}') for var in x_variables_lower)]
                # logger.info(f"   - Encoded combination features: {encoded_features}")
                # logger.info(f"   - Interaction features: {interaction_features}")
                # logger.info(f"   - All features: {feature_columns}")
                
                # Clean data - remove rows with missing values for ALL features
                all_columns = feature_columns + [y_variable_lower]
                # Preserve combination column if it exists
                if 'combination' in df.columns:
                    all_columns.append('combination')
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
                X = df_clean[feature_columns].values.astype(np.float64)
                y = df_clean[y_variable_lower].values.astype(np.float64)
                
                # Store original data statistics for elasticity calculation (only for main x_variables)
                X_original = df_clean[x_variables_lower]
                y_original = df_clean[y_variable_lower]
                

                
                # Final validation before train/test split
                if len(X) < 10:  # Need minimum samples for meaningful training
                    logger.error(f"❌ Insufficient data for stack MMM training: {len(X)} samples")
                    return []
                
                # Train/test split - use combination-aware split if combination column exists
                if 'combination' in df_clean.columns:
                    # logger.info("Using combination-aware train/test split")
                    train_indices, test_indices = self._create_combination_aware_train_test_split(
                        df_clean, test_size=test_size, random_state=42
                    )
                    X_train = X[train_indices]
                    X_test = X[test_indices]
                    y_train = y[train_indices]
                    y_test = y[test_indices]
                else:
                    logger.info("Using standard train/test split (no combination column found)")
                    X_train, X_test, y_train, y_test = train_test_split(
                        X, y, test_size=test_size, random_state=42, shuffle=True
                    )
                
                # Convert boolean columns to numeric (encoded combination variables)
                # logger.info("Converting boolean columns to numeric for validation")
                # Note: feature_columns does not include 'combination' column, so it's automatically excluded
                X_train_df = pd.DataFrame(X_train, columns=feature_columns)
                X_test_df = pd.DataFrame(X_test, columns=feature_columns)
                
                # Convert boolean columns to numeric
                for col in X_train_df.columns:
                    if X_train_df[col].dtype == 'bool':
                        X_train_df[col] = X_train_df[col].astype(int)
                        X_test_df[col] = X_test_df[col].astype(int)
                        logger.info(f"Converted boolean column '{col}' to numeric")
                
                # Convert back to numpy arrays with explicit float64 dtype
                X_train = X_train_df.values.astype(np.float64)
                X_test = X_test_df.values.astype(np.float64)
                y_train = y_train.astype(np.float64)
                y_test = y_test.astype(np.float64)

                
                # Add constraints to custom_configs for constrained models
                if negative_constraints or positive_constraints:
                    # logger.info(f"🔍 DEBUG: Adding constraints to custom_configs:")
                    # logger.info(f"  - negative_constraints: {negative_constraints}")
                    # logger.info(f"  - positive_constraints: {positive_constraints}")
                    
                    # Convert constraints to the format expected by the models
                    variable_constraints = []
                    if negative_constraints:
                        for var in negative_constraints:
                            variable_constraints.append({
                                'variable_name': var,
                                'constraint_type': 'negative'
                            })
                    if positive_constraints:
                        for var in positive_constraints:
                            variable_constraints.append({
                                'variable_name': var,
                                'constraint_type': 'positive'
                            })
                    
                    # Add constraints to custom_configs for constrained models
                    for model_name, config in custom_configs.items():
                        if 'Constrained' in model_name:
                            config['variable_constraints'] = variable_constraints
                            config['use_constraints'] = True
                            logger.info(f"🔍 DEBUG: Added constraints to {model_name}: {variable_constraints}")
                
                # Get models
                all_models = get_models()
                # logger.info(f"Available models: {list(all_models.keys())}")
                
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
                                # logger.info(f"🔧 {model_name} - Auto tuning with alpha range: {alphas[0]:.6f} to {alphas[-1]:.6f} ({len(alphas)} values)")
                                models_dict[model_name] = LassoCV(alphas=alphas, cv=5, random_state=42)
                                
                            elif model_name == "ElasticNet Regression" and tuning_mode == 'auto':
                                # Use ElasticNetCV for automatic alpha and l1_ratio tuning with reasonable ranges
                                from sklearn.linear_model import ElasticNetCV
                                alphas = np.logspace(-3, 2, 50)  # 0.0001 to 10 (reasonable range for ElasticNet)
                                l1_ratios = np.linspace(0.1, 0.9, 9)  # Default l1_ratio range
                                # logger.info(f"🔧 {model_name} - Auto tuning with alpha range: {alphas[0]:.6f} to {alphas[-1]:.6f} ({len(alphas)} values), l1_ratio range: {l1_ratios[0]:.2f} to {l1_ratios[-1]:.2f} ({len(l1_ratios)} values)")
                                models_dict[model_name] = ElasticNetCV(
                                    alphas=alphas, l1_ratio=l1_ratios, cv=5, random_state=42
                                )
                            
                            # Handle constrained models (extract constraints from parameters, not variable_constraints)
                            elif model_name == "Constrained Ridge":
                                # Check if we have interaction terms (stack modeling) or just base features (individual modeling)
                                has_interaction_terms = any('_x_' in col for col in feature_columns)
                                
                                if has_interaction_terms:
                                    # Stack modeling: use StackConstrainedRidge for interaction terms
                                    from .models import StackConstrainedRidge
                                    # logger.info(f"🔍 Using StackConstrainedRidge for stack modeling with interaction terms")
                                else:
                                    # Individual modeling: use CustomConstrainedRidge for base features only
                                    from .models import CustomConstrainedRidge
                                    # logger.info(f"🔍 Using CustomConstrainedRidge for individual modeling with base features only")
                                
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
                                
                                # Debug logging for constraints
                                
                                if has_interaction_terms:
                                    models_dict[model_name] = StackConstrainedRidge(
                                        l2_penalty=parameters.get('l2_penalty', 0.1),
                                        learning_rate=parameters.get('learning_rate', 0.001),
                                        iterations=parameters.get('iterations', 10000),
                                        adam=parameters.get('adam', False),
                                        negative_constraints=negative_constraints,
                                        positive_constraints=positive_constraints
                                    )
                                else:
                                    models_dict[model_name] = CustomConstrainedRidge(
                                        l2_penalty=parameters.get('l2_penalty', 0.1),
                                        learning_rate=parameters.get('learning_rate', 0.001),
                                        iterations=parameters.get('iterations', 10000),
                                        adam=parameters.get('adam', False),
                                        negative_constraints=negative_constraints,
                                        positive_constraints=positive_constraints
                                    )
                            
                            elif model_name == "Constrained Linear Regression":
                                # Check if we have interaction terms (stack modeling) or just base features (individual modeling)
                                has_interaction_terms = any('_x_' in col for col in feature_columns)
                                
                                if has_interaction_terms:
                                    # Stack modeling: use StackConstrainedLinearRegression for interaction terms
                                    from .models import StackConstrainedLinearRegression
                                    # logger.info(f"🔍 Using StackConstrainedLinearRegression for stack modeling with interaction terms")
                                else:
                                    # Individual modeling: use ConstrainedLinearRegression for base features only
                                    from .models import ConstrainedLinearRegression
                                    # logger.info(f"🔍 Using ConstrainedLinearRegression for individual modeling with base features only")
                                
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

                                
                                if has_interaction_terms:
                                    models_dict[model_name] = StackConstrainedLinearRegression(
                                        learning_rate=parameters.get('learning_rate', 0.001),
                                        iterations=parameters.get('iterations', 10000),
                                        adam=parameters.get('adam', False),
                                        negative_constraints=negative_constraints,
                                        positive_constraints=positive_constraints
                                    )
                                else:
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
                
                for model_idx, (model_name, model) in enumerate(models_dict.items()):
                    logger.info(f"Training model: {model_name}")
                    
                    # Update progress for each model training
                    if run_id:
                        progress_dict = get_training_progress()
                        if run_id in progress_dict:
                            cluster_display = cluster_info if cluster_info else "Unknown"
                            progress_dict[run_id]["current_step"] = f"Training {model_name} on cluster: {cluster_display}"
                            progress_dict[run_id]["status"] = f"Stack Modeling: {model_name} ({model_idx + 1}/{len(models_dict)})"
                            # logger.info(f"📊 Progress: Training {model_name} on cluster: {cluster_display} ({model_idx + 1}/{len(models_dict)})")
                        else:
                            logger.warning(f"❌ Run ID {run_id} not found in progress tracking")
                    
                    try:
                        # Train model
                        if hasattr(model, 'fit'):
                            if model_name in ["Custom Constrained Ridge", "Constrained Linear Regression", "Constrained Ridge"]:
                                model.fit(X_train, y_train, feature_names=feature_columns)
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
                            # Auto-tuning results (not implemented in stack models, set to None)
                            "best_alpha": None,
                            "best_cv_score": None,
                            "best_l1_ratio": None
                        }
                        
                        model_results.append(model_result)
                        logger.info(f"Successfully added model result for {model_name}")
                        
                        # Update progress when model completes
                        if run_id:
                            progress_dict = get_training_progress()
                            if run_id in progress_dict:
                                cluster_display = cluster_info if cluster_info else "Unknown"
                                progress_dict[run_id]["current_step"] = f"Completed {model_name} on cluster: {cluster_display}"
                                progress_dict[run_id]["status"] = f"Stack Modeling: Completed {model_name} ({model_idx + 1}/{len(models_dict)})"
                                logger.info(f"📊 Progress: Completed {model_name} on cluster: {cluster_display} ({model_idx + 1}/{len(models_dict)})")
                
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

    def _create_combination_aware_train_test_split(
        self, 
        df: pd.DataFrame, 
        test_size: float = 0.2, 
        random_state: int = 42
    ) -> Tuple[np.ndarray, np.ndarray]:
        """
        Create train/test split that ensures combinations are properly distributed.
        This prevents data leakage by ensuring combinations don't appear in both train and test.
        """
        try:
            if 'combination' not in df.columns:
                # Fallback to standard split if no combination column
                from sklearn.model_selection import train_test_split
                indices = np.arange(len(df))
                train_indices, test_indices = train_test_split(
                    indices, test_size=test_size, random_state=random_state
                )
                return train_indices, test_indices
            
            # Get unique combinations
            unique_combinations = df['combination'].unique()
            # logger.info(f"Creating combination-aware split for {len(unique_combinations)} combinations")
            
            # Split combinations into train/test
            from sklearn.model_selection import train_test_split
            train_combinations, test_combinations = train_test_split(
                unique_combinations, 
                test_size=test_size, 
                random_state=random_state
            )
            
            # Get indices for train and test combinations
            train_mask = df['combination'].isin(train_combinations)
            test_mask = df['combination'].isin(test_combinations)
            
            train_indices = df[train_mask].index.values
            test_indices = df[test_mask].index.values
            
            return train_indices, test_indices
            
        except Exception as e:
            logger.error(f"Error in combination-aware train/test split: {e}")
            # Fallback to standard split
            from sklearn.model_selection import train_test_split
            indices = np.arange(len(df))
            train_indices, test_indices = train_test_split(
                indices, test_size=test_size, random_state=random_state
            )
            return train_indices, test_indices
    
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
    


    def _create_encoded_combination_features(self, df: pd.DataFrame) -> pd.DataFrame:
        """Create encoded combination features for stack MMM data."""
        try:
            logger.info("Creating encoded combination features")
            
            # Check if combination column exists
            if 'combination' not in df.columns:
                logger.warning("No 'combination' column found, skipping encoded combination features")
                return df
            
            # Create a copy to avoid modifying original
            enhanced_df = df.copy()
            
            # Get unique combinations
            unique_combinations = df['combination'].unique()

            
            # Check if we have enough combinations
            combination_unique_values = len(unique_combinations)
            if combination_unique_values <= 1:
                logger.info(f"Only {combination_unique_values} unique combination(s), skipping encoded combination features")
                return enhanced_df
            
            # One-hot encode the combination column
            combination_dummies = pd.get_dummies(df['combination'], prefix="encoded_combination", drop_first=False)
            
            # Add one-hot encoded combination columns to the dataframe
            for dummy_col in combination_dummies.columns:
                enhanced_df[dummy_col] = combination_dummies[dummy_col]
            
            # logger.info(f"Created {len(combination_dummies.columns)} encoded combination features: {list(combination_dummies.columns)}")
            return enhanced_df
            
        except Exception as e:
            logger.error(f"Error creating encoded combination features: {e}")
            return df