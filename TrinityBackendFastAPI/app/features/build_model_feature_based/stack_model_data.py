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

logger = logging.getLogger("stack-model-data")

class CombinationParser:
    """Parse combination strings to extract identifier values."""
    
    @staticmethod
    def parse_combination_string(combination: str, identifier_names: List[str]) -> Dict[str, str]:
        try:
            # Split the combination string by underscores
            values = combination.split('_')
            
            if len(values) != len(identifier_names):
                logger.warning(f"Combination '{combination}' has {len(values)} values but {len(identifier_names)} identifier names provided")

                return {}
            
            # Map identifier names to values
            parsed_values = {}
            for i, identifier_name in enumerate(identifier_names):
                if i < len(values):
                    parsed_values[identifier_name] = values[i]
            
            return parsed_values
            
        except Exception as e:
            logger.error(f"Error parsing combination string '{combination}': {e}")
            return {}
    

    
    @staticmethod
    def get_identifier_values(combinations: List[str], identifier: str, identifier_names: List[str]) -> List[str]:

        values = set()
        
        for combination in combinations:
            parsed = CombinationParser.parse_combination_string(combination, identifier_names)
            if identifier in parsed:
                values.add(parsed[identifier])
        
        return sorted(list(values))
    
    @staticmethod
    def get_available_identifiers(combinations: List[str]) -> List[str]:

        if not combinations:
            return []
        
        # Use the first combination to determine identifier names
        # This assumes all combinations have the same structure
        first_combination = combinations[0]
        identifier_count = len(first_combination.split('_'))
        
        # Generate generic identifier names
        identifier_names = [f"identifier_{i+1}" for i in range(identifier_count)]
        
        return identifier_names


class DataPooler:
    """Handle pooling of data from multiple combinations."""
    
    def __init__(self, minio_client: Minio, bucket_name: str):
        self.minio_client = minio_client
        self.bucket_name = bucket_name
    
    def read_combination_file(self, file_key: str) -> Optional[pd.DataFrame]:

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
                except Exception as arrow_error:
                    logger.error(f"Error reading Arrow file: {arrow_error}")
                    return None
            elif file_key.endswith('.csv'):
                df = pd.read_csv(io.BytesIO(file_data))
            else:
                logger.warning(f"Unsupported file format: {file_key}")
                return None
            
            return df
            
        except Exception as e:
            logger.error(f"Error reading file {file_key}: {e}")
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
                    logger.warning(f"No file found for combination: {combination}")
            
            return combination_files
            
        except Exception as e:
            logger.error(f"Error finding combination files: {e}")
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
                    
                    # Validate required variables exist
                    if self._validate_variables(filtered_df, x_variables, y_variable):
                        all_dataframes.append(filtered_df)
                        combination_info.append({
                            'combination': combination,
                            'records': len(filtered_df),
                            'columns': list(filtered_df.columns)
                        })
                    else:
                        logger.warning(f"❌ {combination} missing required variables after filtering")
                else:
                    logger.warning(f"❌ Could not fetch data for {combination}")
            
            if not all_dataframes:
                raise ValueError("No valid data found for any combination")
            
            # Step 2: Add combination column to each DataFrame before merging
            for i, (df, combo_info) in enumerate(zip(all_dataframes, combination_info)):
                df['combination'] = combo_info['combination']
            
            # Step 3: Merge all the data from those files
            merged_df = pd.concat(all_dataframes, ignore_index=True)
            
            # Print unique values for pool_by_identifiers after merging
            print(f"\n🔍 MERGED DATA - Unique values for pool_by_identifiers:")
            for identifier in pool_by_identifiers:
                if identifier in merged_df.columns:
                    unique_values = merged_df[identifier].unique()
                    print(f"  {identifier}: {unique_values.tolist()}")
                else:
                    print(f"  {identifier}: Column not found in merged data")
            print(f"Total merged records: {len(merged_df)}")
            print(f"Available columns: {list(merged_df.columns)}")
            
            # Step 4: Filter the merged data using pool-identifiers selection
            pooled_data = self._filter_by_pool_identifiers(
                merged_df, combinations, pool_by_identifiers
            )
            
            
            return pooled_data
            
        except Exception as e:
            logger.error(f"Error pooling data: {e}")
            logger.error(f"Exception details: {type(e).__name__}: {str(e)}")
            import traceback
            logger.error(f"Traceback: {traceback.format_exc()}")
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
                logger.warning(f"Could not find file for combination: {combination}")
                return None
            
            # Use the first matching file
            target_file_key = matching_objects[0]
            
            # Read the file using the existing method
            return self.read_combination_file(target_file_key)
            
        except Exception as e:
            logger.error(f"Error fetching combination file {combination}: {e}")
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
                    logger.warning(f"Identifier column '{identifier}' not found in merged data")
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
                        logger.warning(f"Identifier column '{identifier}' not found in merged data")
                
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
                        logger.warning(f"⚠️ Pool {pool_key}: No records found after filtering")
                else:
                    logger.warning(f"⚠️ Pool {pool_key}: No valid filter conditions created")
            
            return pooled_data
            
        except Exception as e:
            logger.error(f"Error filtering by pool identifiers: {e}")
            raise
    
    def _combination_matches_pool_values(self, combination: str, pool_by_identifiers: List[str], pool_values: tuple) -> bool:

        try:
            pool_value_strings = [str(value) for value in pool_values]
            
            # Debug logging
            print(f"🔍 MATCHING DEBUG:")
            print(f"  Combination: '{combination}'")
            print(f"  Pool values: {pool_value_strings}")
            print(f"  Pool identifiers: {pool_by_identifiers}")
 
            for pool_value in pool_value_strings:
                pool_value_with_underscores = pool_value.replace(" ", "_")
                if pool_value_with_underscores in combination:
                    print(f"  ✅ '{pool_value}' (as '{pool_value_with_underscores}') found in combination")
                else:
                    print(f"  ❌ '{pool_value}' (as '{pool_value_with_underscores}') not found in combination")
                    return False
            
            print(f"  ✅ All pool values matched!")
            return True
            
        except Exception as e:
            logger.error(f"Error checking combination match: {e}")
            return False
    
    def _filter_combination_data(self, df: pd.DataFrame, filtered_identifiers: List[str], x_variables: List[str], y_variable: str) -> pd.DataFrame:

        try:
            required_columns = filtered_identifiers + x_variables + [y_variable]
            
            available_columns = [col for col in required_columns if col in df.columns]
            missing_columns = [col for col in required_columns if col not in df.columns]
            
            if missing_columns:
                logger.warning(f"Missing columns in data: {missing_columns}")
            
            filtered_df = df[available_columns].copy()
            
            
            return filtered_df
            
        except Exception as e:
            logger.error(f"Error filtering combination data: {e}")
            return df
    
    def _validate_variables(self, df: pd.DataFrame, x_variables: List[str], y_variable: str) -> bool:
        """Validate that required variables exist in the DataFrame."""
        available_columns = df.columns.tolist()
        all_variables = x_variables + [y_variable]
        missing_vars = [var for var in all_variables if var not in available_columns]
        
        if missing_vars:
            logger.warning(f"Missing variables: {missing_vars}")
            return False
        
        return True
    
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
                logger.warning("Not enough data points for clustering")
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
            logger.error(f"Error performing K-means clustering: {e}")
            # Return original DataFrame with default cluster_id
            df_with_clusters = df.copy()
            df_with_clusters['cluster_id'] = 0
            return df_with_clusters
    
    def apply_clustering_to_pools(self, pooled_data: Dict[str, pd.DataFrame], numerical_columns: List[str], n_clusters: Optional[int] = None) -> Dict[str, pd.DataFrame]:

        try:
            clustered_pools = {}
            
            for pool_key, pool_df in pooled_data.items():
                
                if 'combination' not in pool_df.columns:
                    logger.warning(f"No 'combination' column found in {pool_key}, skipping clustering")
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
            logger.error(f"Error applying clustering to pools: {e}")
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
                logger.warning(f"Found duplicate combinations! Unique: {len(unique_combinations)}, Total: {len(valid_combinations)}")
                from collections import Counter
                combo_counts = Counter(valid_combinations)
                duplicates = {combo: count for combo, count in combo_counts.items() if count > 1}
                logger.warning(f"Duplicate combinations: {duplicates}")
            
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
    
    def get_pool_summary(self, pooled_data: Dict[str, pd.DataFrame]) -> Dict[str, Any]:

        summary = {
            'total_pools': len(pooled_data),
            'pool_details': {}
        }
        
        for pool_key, df in pooled_data.items():
            pool_summary = {
                'rows': int(len(df)),  # Convert to int to avoid numpy.int64
                'columns': int(len(df.columns))  # Convert to int to avoid numpy.int64
            }           
            # Add identifier value counts
            for col in df.columns:
                if col.startswith('pool_') and col != 'pool_combination' and col != 'pool_size':
                    identifier = col.replace('pool_', '')
                    # Convert numpy types to Python types for JSON serialization
                    unique_values = df[col].unique().tolist()
                    # Convert any numpy types to Python types
                    unique_values = [str(val) if hasattr(val, 'item') else val for val in unique_values]
                    pool_summary[f'{identifier}_values'] = unique_values
            
            summary['pool_details'][pool_key] = pool_summary
        
        return summary
    
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
        
        return split_data
    
    def create_interaction_terms(self, 
                                pooled_data: Dict[str, pd.DataFrame], 
                                identifiers: List[str], 
                                numerical_columns_for_interaction: List[str],
                                column_classifier_identifiers: List[str] = None) -> Dict[str, pd.DataFrame]:
        """
        Create interaction terms by encoding combinations and interacting with numerical columns.
        
        Process:
        1. One-hot encode the 'combination' column (not individual identifiers)
        2. Create interaction terms between encoded combinations and numerical columns
        
        Args:
            pooled_data: Dictionary of DataFrames with combination column
            identifiers: Not used (kept for compatibility)
            numerical_columns_for_interaction: List of numerical columns to create interactions with
            column_classifier_identifiers: Not used (kept for compatibility)
            
        Returns:
            Dictionary of enhanced DataFrames with interaction terms
        """
        enhanced_pools = {}
        
        
        for pool_key, df in pooled_data.items():
            # Make a copy to avoid modifying original data
            enhanced_df = df.copy()
            
            # Check if combination column exists and has more than 1 unique value
            if 'combination' not in df.columns:
                enhanced_pools[pool_key] = enhanced_df
                continue
            
            combination_unique_values = df['combination'].nunique()
            
            if combination_unique_values <= 1:
                enhanced_pools[pool_key] = enhanced_df
                continue
            
            # One-hot encode the combination column
            combination_dummies = pd.get_dummies(df['combination'], prefix="encoded_combination", drop_first=False)
            
            # Add one-hot encoded combination columns to the dataframe
            for dummy_col in combination_dummies.columns:
                enhanced_df[dummy_col] = combination_dummies[dummy_col]
            
            
            # Create interaction terms
            interaction_columns_created = []
            
            # Get all one-hot encoded combination columns
            encoded_combination_columns = [col for col in enhanced_df.columns if col.startswith("encoded_combination_")]
            
            # Create interactions between encoded combinations and numerical columns
            for encoded_combination_col in encoded_combination_columns:
                for numerical_col in numerical_columns_for_interaction:
                    if numerical_col in enhanced_df.columns:
                        # Create interaction term: encoded_combination_col * numerical_col
                        interaction_col_name = f"{encoded_combination_col}_x_{numerical_col}"
                        enhanced_df[interaction_col_name] = enhanced_df[encoded_combination_col] * enhanced_df[numerical_col]
                        interaction_columns_created.append(interaction_col_name)
            
            
            enhanced_pools[pool_key] = enhanced_df
        return enhanced_pools
    
    async def _train_models_with_dataframe(
        self,
        df: pd.DataFrame,
        x_variables: List[str],
        y_variable: str,
        price_column: Optional[str],
        standardization: str,
        k_folds: int,
        models_to_run: Optional[List[str]],
        custom_configs: Optional[Dict[str, Any]]
    ) -> tuple[List[Dict[str, Any]], Dict[str, Any]]:
        """
        Train models directly with a DataFrame instead of reading from MinIO.
        This is a simplified version of train_models_for_combination_enhanced that works with DataFrames.
        """
        from .models import get_models
        from sklearn.model_selection import KFold
        from sklearn.preprocessing import StandardScaler, MinMaxScaler
        from sklearn.metrics import mean_absolute_percentage_error, r2_score
        from sklearn.base import clone
        import numpy as np
        
        # Get models
        all_models = get_models()
        if models_to_run:
            models_dict = {name: model for name, model in all_models.items() if name in models_to_run}
        else:
            models_dict = all_models
        
        # Prepare data
        X = df[x_variables].values
        y = df[y_variable].values
        
        # Apply standardization if requested
        if standardization == 'standard':
            scaler = StandardScaler()
            X = scaler.fit_transform(X)
        elif standardization == 'minmax':
            scaler = MinMaxScaler()
            X = scaler.fit_transform(X)
        
        # Initialize K-fold cross-validation with combination-aware splitting
        kf = KFold(n_splits=k_folds, shuffle=True, random_state=42)
        
        model_results = []
        variable_data = {
            'x_variables': x_variables,
            'y_variable': y_variable,
            'total_samples': len(df),
            'feature_means': df[x_variables].mean().to_dict(),
            'feature_stds': df[x_variables].std().to_dict(),
            'target_mean': df[y_variable].mean(),
            'target_std': df[y_variable].std()
        }
        
        # Check if we have combination column for stratified splitting
        has_combination_column = 'combination' in df.columns
        if has_combination_column:
            print(f"🔍 Using combination-aware splitting for {df['combination'].nunique()} unique combinations")
            print(f"  Combinations: {df['combination'].unique().tolist()}")
        else:
            print(f"⚠️ No 'combination' column found, using standard K-fold splitting")

        for model_name, model_class in models_dict.items():
            
            fold_results = []
            fold_elasticities = []
            
            if has_combination_column:
                # Use combination-aware splitting
                fold_splits = self._create_combination_aware_splits(df, k_folds, random_state=42)
            else:
                # Use standard K-fold splitting
                fold_splits = list(kf.split(X))
            
            for fold_idx, (train_idx, val_idx) in enumerate(fold_splits):
                X_train, X_val = X[train_idx], X[val_idx]
                y_train, y_val = y[train_idx], y[val_idx]
                
                # Debug: Check combination distribution in train/val sets
                if has_combination_column:
                    train_combinations = df.iloc[train_idx]['combination'].unique()
                    val_combinations = df.iloc[val_idx]['combination'].unique()
                    print(f"  Fold {fold_idx + 1}: Train combinations: {len(train_combinations)}, Val combinations: {len(val_combinations)}")
                    print(f"    Train: {train_combinations.tolist()}")
                    print(f"    Val: {val_combinations.tolist()}")
                
                model = clone(model_class)
                if model_name in ["Custom Constrained Ridge", "Constrained Linear Regression"]:
                    model.fit(X_train, y_train, x_variables)
                else:
                    model.fit(X_train, y_train)

                y_pred = model.predict(X_val)
                
                mape = mean_absolute_percentage_error(y_val, y_pred)
                r2 = r2_score(y_val, y_pred)
                
                fold_results.append({
                    'fold': fold_idx + 1,
                    'mape': mape,
                    'r2': r2,
                    'predictions': y_pred.tolist(),
                    'actual': y_val.tolist()
                })
                
                # Skip elasticity calculations for now
            
            # Calculate average metrics
            avg_mape = np.mean([fold['mape'] for fold in fold_results])
            avg_r2 = np.mean([fold['r2'] for fold in fold_results])
            
            # Calculate AIC and BIC (simplified)
            # Train on full dataset for final model
            final_model = clone(model_class)
            if model_name in ["Custom Constrained Ridge", "Constrained Linear Regression"]:
                final_model.fit(X, y, x_variables)
            else:
                final_model.fit(X, y)
            y_pred_full = final_model.predict(X)
            
            # Calculate AIC and BIC
            n = len(y)
            k = len(x_variables)
            mse = np.mean((y - y_pred_full) ** 2)
            log_likelihood = -n/2 * np.log(2 * np.pi * mse) - n/2
            aic = 2 * k - 2 * log_likelihood
            bic = k * np.log(n) - 2 * log_likelihood
            
            # Calculate train metrics (using full dataset)
            y_pred_train = final_model.predict(X)
            mape_train = mean_absolute_percentage_error(y, y_pred_train)
            r2_train = r2_score(y, y_pred_train)
            
            # Calculate test metrics (average across folds)
            mape_test = avg_mape
            r2_test = avg_r2
            
            # Prepare coefficients in the expected format
            coefficients = {}
            if hasattr(final_model, 'coef_') and hasattr(final_model, 'feature_names_in_'):
                for i, feature in enumerate(final_model.feature_names_in_):
                    coefficients[feature] = float(final_model.coef_[i])
            elif hasattr(final_model, 'coef_'):
                for i, feature in enumerate(x_variables):
                    coefficients[feature] = float(final_model.coef_[i])
            
            # Skip elasticity and contribution calculations for now - only return betas
            model_result = {
                'model_name': model_name,
                'mape_train': float(mape_train),
                'mape_test': float(mape_test),
                'r2_train': float(r2_train),
                'r2_test': float(r2_test),
                'mape_train_std': 0.0,  # Not calculated in simplified version
                'mape_test_std': float(np.std([fold['mape'] for fold in fold_results])),
                'r2_train_std': 0.0,  # Not calculated in simplified version
                'r2_test_std': float(np.std([fold['r2'] for fold in fold_results])),
                'aic': float(aic),
                'bic': float(bic),
                'n_parameters': len(x_variables) + 1,  # +1 for intercept
                'coefficients': coefficients,
                'intercept': float(final_model.intercept_) if hasattr(final_model, 'intercept_') else 0.0,

            }
            
            model_results.append(model_result)
        
        return model_results, variable_data
    
    def _create_combination_aware_splits(self, df: pd.DataFrame, n_splits: int, random_state: int = 42) -> List[Tuple[np.ndarray, np.ndarray]]:
        """
        Create K-fold splits that ensure each combination is represented in both training and validation sets.
        
        Strategy:
        1. For each combination, split its data into n_splits parts
        2. For each fold, use 1/n_splits of each combination's data for validation
        3. Use the remaining (n_splits-1)/n_splits of each combination's data for training
        
        Args:
            df: DataFrame with 'combination' column
            n_splits: Number of folds
            random_state: Random seed for reproducibility
            
        Returns:
            List of (train_indices, val_indices) tuples
        """
        import numpy as np
        from sklearn.model_selection import KFold
        
        np.random.seed(random_state)
        
        # Get unique combinations
        combinations = df['combination'].unique()
        print(f"🔍 Creating combination-aware splits for {len(combinations)} combinations")
        
        fold_splits = []
        
        for fold_idx in range(n_splits):
            train_indices = []
            val_indices = []
            
            for combination in combinations:
                # Get all indices for this combination
                combination_mask = df['combination'] == combination
                combination_indices = df[combination_mask].index.values
                
                # Shuffle the indices for this combination
                np.random.shuffle(combination_indices)
                
                # Calculate split point for this fold
                n_samples = len(combination_indices)
                val_size = max(1, n_samples // n_splits)  # Ensure at least 1 sample in validation
                
                # Calculate start and end indices for validation set
                val_start = fold_idx * val_size
                val_end = min((fold_idx + 1) * val_size, n_samples)
                
                # If this is the last fold, include any remaining samples
                if fold_idx == n_splits - 1:
                    val_end = n_samples
                
                # Split indices
                val_indices_fold = combination_indices[val_start:val_end]
                train_indices_fold = np.concatenate([
                    combination_indices[:val_start],
                    combination_indices[val_end:]
                ])
                
                train_indices.extend(train_indices_fold)
                val_indices.extend(val_indices_fold)
                
                print(f"  Fold {fold_idx + 1}, Combination '{combination}': {len(train_indices_fold)} train, {len(val_indices_fold)} val")
            
            # Convert to numpy arrays and ensure proper indexing
            train_indices = np.array(train_indices)
            val_indices = np.array(val_indices)
            
            # Convert to positional indices (0-based)
            train_positions = np.searchsorted(df.index, train_indices)
            val_positions = np.searchsorted(df.index, val_indices)
            
            fold_splits.append((train_positions, val_positions))
            
            print(f"  Fold {fold_idx + 1} total: {len(train_positions)} train, {len(val_positions)} val")
        
        return fold_splits
    
    async def train_models_for_stacked_data(
        self,
        split_clustered_data: Dict[str, pd.DataFrame],
        x_variables: List[str],
        y_variable: str,
        standardization: str = 'none',
        k_folds: int = 5,
        models_to_run: Optional[List[str]] = None,
        custom_configs: Optional[Dict[str, Any]] = None,
        price_column: Optional[str] = None
    ) -> Dict[str, Any]:
        """
        Train models on split clustered data using the same models as individual combinations.
        
        Args:
            split_clustered_data: Dictionary of DataFrames with keys like 'pool_key_cluster_id'
            x_variables: Original x variables from user
            y_variable: Target variable
            standardization: Type of standardization ('none', 'standard', 'minmax')
            k_folds: Number of cross-validation folds
            models_to_run: Optional list of specific models to run
            custom_configs: Optional custom model configurations
            price_column: Optional price column for elasticity calculation
            
        Returns:
            Dictionary with training results for each split cluster
        """
        from .models import get_models
        
        results = {}
        all_models = get_models()
        
        # Filter models if specified
        if models_to_run:
            models_dict = {name: model for name, model in all_models.items() if name in models_to_run}
        else:
            models_dict = all_models
        
        for split_key, df in split_clustered_data.items():
            
            # Determine feature set based on available columns
            feature_columns = []
            
            # 1. Add original x_variables (if they exist in the data)
            for var in x_variables:
                if var in df.columns:
                    feature_columns.append(var)
            
            # 2. Add encoded variables (one-hot encoded identifiers with 'encoded_' prefix)
            encoded_columns = [col for col in df.columns 
                             if col.startswith('encoded_') 
                             and col not in feature_columns 
                             and not col.endswith('_x_')]  # Exclude interaction terms for now
            
            # 3. Add interaction terms (if they exist)
            interaction_columns = [col for col in df.columns 
                                 if col.endswith('_x_') and col not in feature_columns]
            
            all_feature_columns = feature_columns + encoded_columns + interaction_columns
            if not all_feature_columns:
                continue
                
            if y_variable not in df.columns:
                continue
            
            # Train models directly with DataFrame (no need for temporary files)
            try:
                # Select only the columns we need for training (include combination column for stratified splitting)
                training_columns = all_feature_columns + [y_variable]
                if 'combination' in df.columns:
                    training_columns.append('combination')
                training_df = df[training_columns].copy()
                
                # Train models using the new DataFrame-based function
                model_results, variable_data = await self._train_models_with_dataframe(
                    df=training_df,
                    x_variables=all_feature_columns,
                    y_variable=y_variable,
                    price_column=price_column,
                    standardization=standardization,
                    k_folds=k_folds,
                    models_to_run=models_to_run,
                    custom_configs=custom_configs
                )
                
                # Store results
                results[split_key] = {
                    'model_results': model_results,
                    'variable_data': variable_data,
                    'feature_columns': all_feature_columns,
                    'feature_breakdown': {
                        'original_x_variables': feature_columns,
                        'encoded_variables': encoded_columns,
                        'interaction_terms': interaction_columns
                    },
                    'data_shape': df.shape,
                    'total_records': len(df)
                }
                
                
            except Exception as e:
                results[split_key] = {
                    'error': str(e),
                    'feature_columns': all_feature_columns,
                    'data_shape': df.shape
                }
        
        return results


class StackModelDataProcessor:

    
    def __init__(self):
        pass
    
    async def get_column_classifier_config(self) -> Dict[str, Any]:

        try:
            from .mongodb_saver import client
            from ..data_upload_validate.app.routes import get_object_prefix
            import os
            
            # Get the current prefix
            prefix = await get_object_prefix()
            
            # Extract client/app/project from prefix
            prefix_parts = prefix.strip('/').split('/')
            if len(prefix_parts) >= 2:
                client_name = prefix_parts[0]
                app_name = prefix_parts[1]
                project_name = prefix_parts[2] if len(prefix_parts) > 2 else "default_project"
                
                # Create the document ID
                doc_id = f"Quant_Matrix_AI_Schema/forecasting/New Forecasting Analysis Project"
                
                # Fetch from column_classifier_config collection
                collection = client["trinity_db"]["column_classifier_config"]
                config = await collection.find_one({"_id": doc_id})
                
                if config:
                    return config
                else:
                    logger.warning(f"No column classifier config found for {doc_id}")
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
                logger.warning(f"Missing columns in data: {missing_columns}")
            
            # Create filtered DataFrame
            filtered_df = df[available_columns].copy()
            
            
            return filtered_df
            
        except Exception as e:
            logger.error(f"Error filtering combination data: {e}")
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
        numerical_columns_for_interaction: List[str] = None
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
                    column_classifier_identifiers=all_identifiers
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
        bucket_name: str
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
           
            
            # Validate that pool_by_identifiers are valid identifiers
            invalid_identifiers = [id for id in pool_by_identifiers if id not in all_identifiers]
            if invalid_identifiers:
                raise ValueError(f"Invalid pooling identifiers: {invalid_identifiers}. Available identifiers: {all_identifiers}")
            
            # Create data pooler instance
            data_pooler = DataPooler(minio_client, bucket_name)
            
            # Pool the data
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
            
            # Get summary
            summary = data_pooler.get_pool_summary(pooled_data)
            
            # Prepare pool keys and their column names
            pool_columns_info = {}
            for pool_key, df in pooled_data.items():
                pool_columns_info[pool_key] = {
                    'columns': df.columns.tolist(),
                    'total_columns': len(df.columns)
                }
            
            # Prepare response
            result = {
                'status': 'success',
                'scope_number': scope_number,
                'pool_by_identifiers': pool_by_identifiers,
                'total_combinations': len(combinations),
                'total_pools': len(pooled_data),
                'pool_columns_info': pool_columns_info,
                'x_variables': x_variables,
                'y_variable': y_variable,
                'pooled_data': pooled_data  # Include the actual pooled data for clustering (will be removed from final response)
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
    
    def get_pooled_dataframe(self, pooled_data: Dict[str, pd.DataFrame], pool_key: str) -> Optional[pd.DataFrame]:

        return pooled_data.get(pool_key)
    
    def get_identifier_combinations(self, combinations: List[str]) -> Dict[str, List[str]]:

        available_identifiers = CombinationParser.get_available_identifiers(combinations)
        
        identifier_combinations = {}
        for identifier in available_identifiers:
            values = CombinationParser.get_identifier_values(combinations, identifier)
            identifier_combinations[identifier] = values
        
        return identifier_combinations


# Utility functions for external use
def create_pool_key(identifiers: Dict[str, str], pool_by_identifiers: List[str]) -> str:

    pool_key_parts = []
    for identifier in pool_by_identifiers:
        value = identifiers.get(identifier, 'Unknown')
        pool_key_parts.append(f"{identifier}_{value}")
    
    return "_".join(pool_key_parts)


def validate_pooling_request(
    combinations: List[str],
    pool_by_identifiers: List[str],
    x_variables: List[str],
    y_variable: str
) -> Tuple[bool, str]:

    try:
        if not combinations:
            return False, "No combinations provided"
        
        if not pool_by_identifiers:
            return False, "No pooling identifiers provided"
        
        if not x_variables:
            return False, "No x_variables provided"
        
        if not y_variable:
            return False, "No y_variable provided"
        
        # Check if pooling identifiers are available
        available_identifiers = CombinationParser.get_available_identifiers(combinations)
        invalid_identifiers = [id for id in pool_by_identifiers if id not in available_identifiers]
        
        if invalid_identifiers:
            return False, f"Invalid pooling identifiers: {invalid_identifiers}. Available: {available_identifiers}"
        
        return True, ""
        
    except Exception as e:
        return False, f"Validation error: {str(e)}"
