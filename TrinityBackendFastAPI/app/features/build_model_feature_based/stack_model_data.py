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
        """
        Get all unique values for a specific identifier across combinations.
        
        Args:
            combinations: List of combination strings
            identifier: Identifier name (e.g., 'Channel', 'Brand')
            identifier_names: List of all identifier names in order
            
        Returns:
            List of unique values for the identifier
        """
        values = set()
        
        for combination in combinations:
            parsed = CombinationParser.parse_combination_string(combination, identifier_names)
            if identifier in parsed:
                values.add(parsed[identifier])
        
        return sorted(list(values))


class DataPooler:
    """Handle pooling of data from multiple combinations."""
    
    def __init__(self, minio_client: Minio, bucket_name: str):
        self.minio_client = minio_client
        self.bucket_name = bucket_name
    
    def read_combination_file(self, file_key: str) -> Optional[pd.DataFrame]:
        """
        Read a single combination file from MinIO.
        
        Args:
            file_key: MinIO file key
            
        Returns:
            DataFrame or None if error
        """
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
        """
        Find MinIO file keys for given combinations.
        
        Args:
            scope_number: Scope number (e.g., "3")
            combinations: List of combination strings
            
        Returns:
            Dictionary mapping combination strings to file keys
        """
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
        2. Merge all the data from those files
        3. Filter the merged data using pool-identifiers selection
        
        Args:
            scope_number: Scope number
            combinations: List of combination strings
            pool_by_identifiers: List of identifiers to pool by (e.g., ['Channel', 'Brand'])
            x_variables: List of feature variables
            y_variable: Target variable
            
        Returns:
            Dictionary mapping pool keys to pooled DataFrames
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
            
            # Step 2: Merge all the data from those files
            merged_df = pd.concat(all_dataframes, ignore_index=True)
            
            # Step 3: Filter the merged data using pool-identifiers selection
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
        """
        Filter the merged data using pool-identifiers selection.
        
        Since combination names are just values (e.g., "Convenience_Small_Multi_HEINZ_Standard"),
        we use the user-provided pool_by_identifiers to find unique values and filter accordingly.
        """
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
            
            # Step 2: Create pool groups based on unique combinations of identifier values
            pool_groups = {}
            
            # Generate all possible combinations of identifier values
            import itertools
            
            # Get all value combinations for the pool identifiers
            value_combinations = list(itertools.product(*[identifier_values[identifier] for identifier in pool_by_identifiers]))
            
            
            # Create pool groups
            for value_combo in value_combinations:
                # Create pool key from the value combination
                pool_key_parts = []
                for i, identifier in enumerate(pool_by_identifiers):
                    value = value_combo[i]
                    clean_value = str(value).replace(" ", "_").replace("/", "_").replace("\\", "_")
                    pool_key_parts.append(f"{identifier}_{clean_value}")
                
                pool_key = "_".join(pool_key_parts)
                
                # Find which combinations from the input list match this pool
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
            
            
            # Step 3: Filter the merged data for each pool
            pooled_data = {}
            for pool_key, pool_info in pool_groups.items():
                # Create filter conditions for this pool
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
                        # Add pool metadata
                        filtered_df['pool_key'] = pool_key
                        filtered_df['pool_combinations'] = ', '.join(pool_info['combinations'])
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
        """
        Check if a combination string matches the pool values.
        
        Since combination names are just values (e.g., "Convenience_Small_Multi_HEINZ_Standard"),
        we need to check if the combination contains the pool values in the right order.
        """
        try:
            # Split the combination by underscores to get individual values
            combination_parts = combination.split('_')           
            pool_value_strings = [str(value) for value in pool_values]
            
            # Check if all pool values are present in the combination
            for pool_value in pool_value_strings:
                if pool_value not in combination_parts:
                    return False
            
            return True
            
        except Exception as e:
            logger.error(f"Error checking combination match: {e}")
            return False
    
    def _filter_combination_data(self, df: pd.DataFrame, filtered_identifiers: List[str], x_variables: List[str], y_variable: str) -> pd.DataFrame:
        """
        Filter DataFrame to only include identifiers, x_variables, and y_variable columns.
        
        Args:
            df: Input DataFrame
            filtered_identifiers: List of identifier column names (excluding date-related ones)
            x_variables: List of feature variable column names
            y_variable: Target variable column name
            
        Returns:
            Filtered DataFrame with only required columns
        """
        try:
            # Get all required columns
            required_columns = filtered_identifiers + x_variables + [y_variable]
            
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
                
                # Apply clustering to this pool
                clustered_df = self.perform_kmeans_clustering(pool_df, numerical_columns, n_clusters)
                clustered_pools[pool_key] = clustered_df
                
                # Log cluster distribution for this pool
                cluster_counts = clustered_df['cluster_id'].value_counts().to_dict()
            
            return clustered_pools
            
        except Exception as e:
            logger.error(f"Error applying clustering to pools: {e}")
            return pooled_data  # Return original data if clustering fails
    
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
                if col.startswith('pool_') and col != 'pool_combination' and col != 'pool_key' and col != 'pool_size':
                    identifier = col.replace('pool_', '')
                    # Convert numpy types to Python types for JSON serialization
                    unique_values = df[col].unique().tolist()
                    # Convert any numpy types to Python types
                    unique_values = [str(val) if hasattr(val, 'item') else val for val in unique_values]
                    pool_summary[f'{identifier}_values'] = unique_values
            
            summary['pool_details'][pool_key] = pool_summary
        
        return summary
    
    def split_clustered_data_by_clusters(self, clustered_pools: Dict[str, pd.DataFrame]) -> Dict[str, pd.DataFrame]:

        split_data = {}
        
        for pool_key, df in clustered_pools.items():
            if 'cluster_id' not in df.columns:
                logger.warning(f"No cluster_id column found in {pool_key}, skipping split")
                continue
                
            # Get unique cluster IDs for this pool
            unique_clusters = df['cluster_id'].unique()
            
            for cluster_id in unique_clusters:
                # Filter data for this specific cluster
                cluster_df = df[df['cluster_id'] == cluster_id].copy()
                
                # Remove cluster_id column as it's no longer needed
                if 'cluster_id' in cluster_df.columns:
                    cluster_df = cluster_df.drop('cluster_id', axis=1)
                
                # Create unique key: pool_key_cluster_id
                unique_key = f"{pool_key}_{int(cluster_id)}"
                split_data[unique_key] = cluster_df
                
        
        return split_data
    
    def create_interaction_terms(self, 
                                pooled_data: Dict[str, pd.DataFrame], 
                                identifiers: List[str], 
                                numerical_columns_for_interaction: List[str],
                                column_classifier_identifiers: List[str] = None) -> Dict[str, pd.DataFrame]:

        enhanced_pools = {}
        
        print(f"DEBUG: create_interaction_terms called with {len(pooled_data)} pools")
        print(f"DEBUG: Identifiers: {identifiers}")
        print(f"DEBUG: Numerical columns: {numerical_columns_for_interaction}")
        
        for pool_key, df in pooled_data.items():
            print(f"DEBUG: Processing pool {pool_key} with columns: {df.columns.tolist()}")
            # Make a copy to avoid modifying original data
            enhanced_df = df.copy()
            
            # Auto-detect identifiers if not provided
            if identifiers is None:
                # Use column classifier identifiers if provided
                if column_classifier_identifiers:
                    # Filter out date-related identifiers
                    date_related_identifiers = ['date', 'year', 'week', 'month']
                    categorical_identifiers = [id for id in column_classifier_identifiers if id not in date_related_identifiers]
                else:
                    # Fallback: get all non-numerical, non-metadata columns
                    categorical_identifiers = []
                
                # Get all columns from the dataframe
                all_columns = df.columns.tolist()
                metadata_columns = ['pool_key', 'pool_combinations', 'cluster_id']
                
                # Filter to only include columns that are in both the dataframe and the column classifier identifiers
                potential_identifiers = [col for col in all_columns 
                                       if col in categorical_identifiers 
                                       and col not in numerical_columns_for_interaction 
                                       and col not in metadata_columns]
                print(f"DEBUG: Column classifier identifiers: {categorical_identifiers}")
                print(f"DEBUG: Auto-detected potential identifiers: {potential_identifiers}")
            else:
                potential_identifiers = identifiers
            
            # Find identifiers that have more than 1 unique value
            identifiers_to_encode = []
            for identifier in potential_identifiers:
                if identifier in df.columns:
                    unique_values = df[identifier].nunique()
                    print(f"DEBUG: Identifier {identifier} has {unique_values} unique values")
                    if unique_values > 1:
                        identifiers_to_encode.append(identifier)
                        print(f"DEBUG: Added {identifier} to encode list")
                else:
                    print(f"DEBUG: Identifier {identifier} not found in columns")
            
            print(f"DEBUG: Identifiers to encode: {identifiers_to_encode}")
            
            # One-hot encode identifiers with more than 1 unique value
            for identifier in identifiers_to_encode:
                # Create one-hot encoded columns with 'encoded_' prefix
                dummies = pd.get_dummies(df[identifier], prefix=f"encoded_{identifier}", drop_first=False)
                
                # Add one-hot encoded columns to the dataframe
                for dummy_col in dummies.columns:
                    enhanced_df[dummy_col] = dummies[dummy_col]
            
            # Create interaction terms
            interaction_columns_created = []
            
            # Get all one-hot encoded columns (now with 'encoded_' prefix)
            one_hot_columns = [col for col in enhanced_df.columns if any(col.startswith(f"encoded_{id_col}_") for id_col in identifiers_to_encode)]
            
            # Create interactions between one-hot encoded identifiers and numerical columns
            for one_hot_col in one_hot_columns:
                for numerical_col in numerical_columns_for_interaction:
                    if numerical_col in enhanced_df.columns:
                        # Create interaction term: one_hot_col * numerical_col
                        interaction_col_name = f"{one_hot_col}_x_{numerical_col}"
                        enhanced_df[interaction_col_name] = enhanced_df[one_hot_col] * enhanced_df[numerical_col]
                        interaction_columns_created.append(interaction_col_name)
            
            enhanced_pools[pool_key] = enhanced_df
            print(f"DEBUG: Final columns for {pool_key}: {enhanced_df.columns.tolist()}")
        
        print(f"DEBUG: Returning {len(enhanced_pools)} enhanced pools")
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
        
        # Initialize K-fold cross-validation
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
        
        # Train each model
        for model_name, model_class in models_dict.items():
            print(f"Training {model_name}...")
            
            fold_results = []
            fold_elasticities = []
            
            for fold_idx, (train_idx, val_idx) in enumerate(kf.split(X)):
                X_train, X_val = X[train_idx], X[val_idx]
                y_train, y_val = y[train_idx], y[val_idx]
                
                # Train model (create a fresh copy for each fold)
                model = clone(model_class)
                if model_name in ["Custom Constrained Ridge", "Constrained Linear Regression"]:
                    model.fit(X_train, y_train, x_variables)
                else:
                    model.fit(X_train, y_train)
                
                # Make predictions
                y_pred = model.predict(X_val)
                
                # Calculate metrics
                mape = mean_absolute_percentage_error(y_val, y_pred)
                r2 = r2_score(y_val, y_pred)
                
                fold_results.append({
                    'fold': fold_idx + 1,
                    'mape': mape,
                    'r2': r2,
                    'predictions': y_pred.tolist(),
                    'actual': y_val.tolist()
                })
                
                # Calculate elasticities if price column is specified
                if price_column and price_column in x_variables:
                    price_idx = x_variables.index(price_column)
                    if hasattr(model, 'coef_'):
                        # Calculate price elasticity
                        price_coef = model.coef_[price_idx]
                        price_mean = df[price_column].mean()
                        quantity_mean = df[y_variable].mean()
                        elasticity = price_coef * (price_mean / quantity_mean)
                        fold_elasticities.append(elasticity)
            
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
            
            model_result = {
                'model_name': model_name,
                'mape': avg_mape,
                'r2': avg_r2,
                'aic': aic,
                'bic': bic,
                'fold_results': fold_results,
                'elasticities': fold_elasticities if fold_elasticities else None,
                'coefficients': final_model.coef_.tolist() if hasattr(final_model, 'coef_') else None,
                'intercept': final_model.intercept_ if hasattr(final_model, 'intercept_') else None
            }
            
            model_results.append(model_result)
        
        return model_results, variable_data
    
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
            print(f"DEBUG: Training models for split cluster: {split_key}")
            print(f"DEBUG: DataFrame shape: {df.shape}")
            print(f"DEBUG: Available columns: {df.columns.tolist()}")
            
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
            
            # Combine all feature columns
            all_feature_columns = feature_columns + encoded_columns + interaction_columns
            
            print(f"DEBUG: Feature columns breakdown:")
            print(f"  - Original x_variables: {feature_columns}")
            print(f"  - Encoded variables: {encoded_columns}")
            print(f"  - Interaction terms: {interaction_columns}")
            print(f"  - Total features: {all_feature_columns}")
            
            # Validate that we have features and target
            if not all_feature_columns:
                print(f"WARNING: No features found for {split_key}, skipping...")
                continue
                
            if y_variable not in df.columns:
                print(f"WARNING: Target variable {y_variable} not found in {split_key}, skipping...")
                continue
            
            # Train models directly with DataFrame (no need for temporary files)
            try:
                # Select only the columns we need for training
                training_df = df[all_feature_columns + [y_variable]].copy()
                
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
                
                print(f"DEBUG: Successfully trained {len(model_results)} models for {split_key}")
                
            except Exception as e:
                print(f"ERROR: Failed to train models for {split_key}: {e}")
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
                print(f"DEBUG: Applying interaction terms to {len(split_clustered_data)} split clusters")
                print(f"DEBUG: Numerical columns: {numerical_columns_for_interaction}")
                print(f"DEBUG: Split clustered data keys: {list(split_clustered_data.keys())}")
                
                # Get column classifier identifiers for interaction terms
                column_config = await self.get_column_classifier_config()
                all_identifiers = column_config.get('identifiers', [])
                logger.info(f"DEBUG: Column classifier identifiers: {all_identifiers}")
                
                split_clustered_data = data_pooler.create_interaction_terms(
                    pooled_data=split_clustered_data,
                    identifiers=None,  # Will auto-detect identifiers with >1 unique value
                    numerical_columns_for_interaction=numerical_columns_for_interaction,
                    column_classifier_identifiers=all_identifiers
                )
                
                print(f"DEBUG: After interaction terms - keys: {list(split_clustered_data.keys())}")
                if split_clustered_data:
                    first_key = list(split_clustered_data.keys())[0]
                    print(f"DEBUG: First cluster columns: {split_clustered_data[first_key].columns.tolist()}")
            else:
                print(f"DEBUG: Interaction terms not applied - apply_interaction_terms: {apply_interaction_terms}, numerical: {numerical_columns_for_interaction}")
            
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
            logger.info(f"DEBUG: Split clustered columns info: {split_clustered_columns_info}")
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
