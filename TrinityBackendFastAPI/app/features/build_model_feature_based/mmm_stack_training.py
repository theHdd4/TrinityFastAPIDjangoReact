
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
            
            for obj in all_objects:
                obj_name = obj.object_name
                
                # Check if file contains the scope number
                scope_pattern = f"Scope_{scope_number}"
                has_scope = scope_pattern in obj_name
                
                # Check if file contains the combination string
                has_combination = combination in obj_name
                
                if has_scope and has_combination:
                    matching_objects.append(obj_name)
            
            if not matching_objects:
                pass
                return None
            
            # Use the first matching file
            target_file_key = matching_objects[0]
            
            # Read the file using the existing method
            return self.read_combination_file(target_file_key)
            
        except Exception as e:
            pass
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
            logger.error(f"Error finding optimal clusters: {e}")
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
                    logger.warning(f"No valid aggregated data for clustering in {pool_key}")
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
                logger.warning(f"Missing columns for aggregation: {missing_columns}")
                return None
            
            # Group by combination and aggregate numerical columns
            aggregation_dict = {}
            for col in numerical_columns:
                aggregation_dict[col] = 'mean'  # Use mean for aggregation
            
            aggregated_df = pool_df.groupby('combination').agg(aggregation_dict).reset_index()
            
            return aggregated_df
                
        except Exception as e:
            logger.error(f"Error aggregating combinations for clustering: {e}")
            return None
    
    def _cluster_combinations(self, aggregated_df: pd.DataFrame, numerical_columns: List[str], n_clusters: Optional[int] = None) -> Dict[str, int]:

        try:
  
            clustering_data = aggregated_df[numerical_columns].copy()
            clustering_data = clustering_data.dropna()
            if len(clustering_data) == 0:
                logger.warning("No valid data for clustering after removing NaN values")
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
            logger.error(f"Error clustering combinations: {e}")
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
                            logger.error(f"Failed to save split cluster {unique_key} to MinIO: {e}")
                            saved_files[unique_key] = None
                    
                    # Remove cluster_id column as it's no longer needed
                    if 'cluster_id' in cluster_df.columns:
                        cluster_df = cluster_df.drop('cluster_id', axis=1)
                    
                    split_data[unique_key] = cluster_df
            
            # Log summary of saved files
            if saved_files:
                successful_saves = [k for k, v in saved_files.items() if v is not None]
                logger.info(f"Successfully saved {len(successful_saves)} split clusters to MinIO")
            
            logger.info(f"Successfully split {len(split_data)} clusters from {len(clustered_pools)} pools")
            return split_data
            
        except Exception as e:
            logger.error(f"Error splitting clustered data by clusters: {e}")
            return {}
    
   
class MMMStackModelDataProcessor:
    
    def __init__(self):
        pass
    
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
                return config
            else:
                logger.warning(f"No column classifier config found for hardcoded _id: {hardcoded_id}")
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
        variable_constraints: List[Dict[str, Any]] = None
    ) -> Dict[str, Any]:
        """
        Train MMM models on split clustered data with full transformation pipeline.
        
        This function combines the clustering approach with sophisticated MMM transformations:
        1. Split data by unique combinations within each cluster
        2. Apply MMM transformations to each combination
        3. Merge transformed combinations back
        4. Create interaction terms if requested
        5. Train models on transformed data
        """
        try:
            logger.info(f"Starting MMM stack model training on {len(split_clustered_data)} split clusters")
            
            # Import MMM transformation engine
            from .mmm_training import MMMTransformationEngine, MMMModelTrainer
            from .models import get_models, safe_mape
            
            # Initialize transformation engine
            transformation_engine = MMMTransformationEngine()
            
            # Generate parameter combinations (same as individual MMM)
            logger.info("Generating parameter combinations...")
            parameter_combinations = transformation_engine.generate_parameter_combinations(
                variable_configs, df=None
            )
            logger.info(f"Generated {len(parameter_combinations)} parameter combinations")
            
            # Process each split cluster
            all_results = {}
            total_models_trained = 0
            
            for split_key, cluster_df in split_clustered_data.items():
                logger.info(f"Processing split cluster: {split_key} with {len(cluster_df)} records")
                
                # Validate variables exist in this cluster
                x_variables_lower = [var.lower() for var in x_variables]
                y_variable_lower = y_variable.lower()
                available_columns = cluster_df.columns.tolist()
                missing_vars = [var for var in x_variables_lower + [y_variable_lower] if var not in available_columns]
                
                if missing_vars:
                    logger.warning(f"Missing variables in {split_key}: {missing_vars}")
                    all_results[split_key] = {
                        'status': 'error',
                        'error': f"Missing variables: {missing_vars}",
                        'models_trained': 0
                    }
                    continue
                
                cluster_results = []
                best_combination = None
                best_mape = float('inf')
                best_model_name = None
                
                # Loop through parameter combinations
                for combo_idx, combo_config in enumerate(parameter_combinations):
                    logger.info(f"Processing combination {combo_idx + 1}/{len(parameter_combinations)} for {split_key}")
                    
                    try:
                        # Apply transformations and train models for this combination
                        model_results = await self._process_combination_for_stack(
                            cluster_df, combo_config, models_to_run, custom_configs,
                            x_variables_lower, y_variable_lower, test_size,
                            price_column, variable_constraints, transformation_engine,
                            apply_interaction_terms, numerical_columns_for_interaction
                        )
                        
                        # Track best combination
                        for result in model_results:
                            if result['mape_test'] < best_mape:
                                best_mape = result['mape_test']
                                best_combination = combo_idx
                                best_model_name = result['model_name']
                        
                        # Add combination info to results
                        for result in model_results:
                            result['combination_index'] = combo_idx
                            result['parameter_combination'] = combo_config
                        
                        cluster_results.extend(model_results)
                        total_models_trained += len(model_results)
                        
                        logger.info(f"Completed combination {combo_idx + 1} for {split_key}: {len(model_results)} models trained")
                        
                    except Exception as e:
                        logger.error(f"Error processing combination {combo_idx + 1} for {split_key}: {e}")
                        continue

                # Store results for this cluster
                all_results[split_key] = {
                    'status': 'success',
                    'total_combinations_tested': len(parameter_combinations),
                    'models_trained': len(cluster_results),
                    'best_combination_index': best_combination,
                    'best_model': best_model_name,
                    'best_mape': best_mape,
                    'model_results': cluster_results,
                    'data_shape': cluster_df.shape
                }
                
                logger.info(f"Completed {split_key}: {len(cluster_results)} models trained, best MAPE: {best_mape:.4f}")
            
            # Prepare final results
            final_results = {
                'status': 'success',
                'total_split_clusters': len(split_clustered_data),
                'total_parameter_combinations': len(parameter_combinations),
                'total_models_trained': total_models_trained,
                'split_cluster_results': all_results,
                'variable_configs': variable_configs,
                'models_tested': models_to_run
            }
            
            logger.info(f"Completed MMM stack model training: {total_models_trained} models trained across {len(split_clustered_data)} split clusters")
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
        variable_constraints: List[Dict[str, Any]],
        transformation_engine,
        apply_interaction_terms: bool,
        numerical_columns_for_interaction: List[str]
    ) -> List[Dict[str, Any]]:
        """Process a single parameter combination for stack MMM training."""
        try:
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
            
            # Step 3: Create interaction terms if requested
            if apply_interaction_terms and numerical_columns_for_interaction:
                logger.info("Creating interaction terms")
                merged_df = self._create_interaction_terms_for_stack(
                    merged_df, numerical_columns_for_interaction
                )
            
            # Step 4: Train models for this parameter combination
            model_results = await self._train_models_for_combination_stack(
                merged_df, combo_config, models_to_run, custom_configs,
                x_variables_lower, y_variable_lower, test_size,
                price_column, variable_constraints, combination_metadata
            )
            
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
        variable_constraints: List[Dict[str, Any]],
        transformation_metadata: Dict[str, Any]
    ) -> List[Dict[str, Any]]:
        """Train models for a specific parameter combination in stack MMM."""
        try:
            from .models import get_models, safe_mape
            
            # Prepare data for modeling
            X = df[x_variables_lower].values
            y = df[y_variable_lower].values
            
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
                        
                        # Handle constrained models
                        if model_name in ["Custom Constrained Ridge", "Constrained Linear Regression"]:
                            negative_constraints = []
                            positive_constraints = []
                            
                            if variable_constraints:
                                for constraint in variable_constraints:
                                    var_name = constraint.get('variable_name', '').lower()
                                    constraint_type = constraint.get('constraint_type', 'none')
                                    
                                    if constraint_type == 'negative':
                                        negative_constraints.append(var_name)
                                    elif constraint_type == 'positive':
                                        positive_constraints.append(var_name)
                            
                            if model_name == "Custom Constrained Ridge":
                                from .models import CustomConstrainedRidge
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
                                models_dict[model_name] = ConstrainedLinearRegression(
                                    learning_rate=parameters.get('learning_rate', 0.001),
                                    iterations=parameters.get('iterations', 10000),
                                    adam=parameters.get('adam', False),
                                    negative_constraints=negative_constraints,
                                    positive_constraints=positive_constraints
                                )
            
            # Train models
            model_results = []
            
            for model_name, model in models_dict.items():
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
                    
                    if hasattr(model, 'coef_'):
                        for i, var in enumerate(x_variables_lower):
                            coefficients[f"Beta_{var}"] = float(model.coef_[i])
                            unstandardized_coefficients[f"Beta_{var}"] = float(model.coef_[i])
                    
                    # Calculate AIC and BIC
                    n_samples = len(y_train)
                    n_params = len(x_variables_lower) + 1
                    mse = np.mean((y_test - y_test_pred) ** 2)
                    aic = n_samples * np.log(mse) + 2 * n_params
                    bic = n_samples * np.log(mse) + n_params * np.log(n_samples)
                    
                    # Calculate elasticities and contributions
                    elasticities = {}
                    contributions = {}
                    
                    for var in x_variables_lower:
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
                    
                    # Store model result
                    model_result = {
                        "model_name": model_name,
                        "mape_train": float(mape_train),
                        "mape_test": float(mape_test),
                        "r2_train": float(r2_train),
                        "r2_test": float(r2_test),
                        "coefficients": coefficients,
                        "unstandardized_coefficients": unstandardized_coefficients,
                        "intercept": float(intercept),
                        "aic": float(aic),
                        "bic": float(bic),
                        "n_parameters": n_params,
                        "elasticities": elasticities,
                        "contributions": contributions,
                        "train_size": len(y_train),
                        "test_size": len(y_test)
                    }
                    
                    model_results.append(model_result)
                
                except Exception as e:
                    logger.error(f"Error training model {model_name}: {e}")
                    continue
            
            return model_results
            
        except Exception as e:
            logger.error(f"Error in _train_models_for_combination_stack: {e}")
            return []



   
