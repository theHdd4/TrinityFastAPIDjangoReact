"""
Standard File Reader for Trinity AI Base Agent
Provides consistent file reading operations across all agents.
"""

import os
import logging
import requests
from typing import Dict, Any, Optional, List
from minio import Minio
from minio.error import S3Error
import pyarrow as pa
import pyarrow.parquet as pq
import pyarrow.feather as pf
import pyarrow.csv as csv

from .config import settings
from .exceptions import FileLoadError

logger = logging.getLogger("trinity.file_reader")


class FileReader:
    """
    Standardized file reading utility for all Trinity AI agents.
    Provides consistent file handling with support for:
    - Multiple file formats (Arrow, Parquet, Feather, CSV)
    - Dynamic prefix resolution
    - Error handling and logging
    - Column extraction
    """
    
    def __init__(
        self,
        minio_endpoint: Optional[str] = None,
        access_key: Optional[str] = None,
        secret_key: Optional[str] = None,
        bucket: Optional[str] = None,
        prefix: str = ""
    ):
        """Initialize FileReader with MinIO configuration."""
        minio_config = settings.get_minio_config()
        self.minio_endpoint = minio_endpoint or minio_config["endpoint"]
        self.access_key = access_key or minio_config["access_key"]
        self.secret_key = secret_key or minio_config["secret_key"]
        self.bucket = bucket or minio_config["bucket"]
        self.prefix = prefix or minio_config["prefix"]
        
        # Initialize MinIO client
        # Handle different minio library versions
        try:
            # Try newer API (all keyword arguments)
            self.minio_client = Minio(
                endpoint=self.minio_endpoint,
                access_key=self.access_key,
                secret_key=self.secret_key,
                secure=False
            )
        except (TypeError, ValueError):
            # Fallback for older minio versions (endpoint as positional)
            self.minio_client = Minio(
                self.minio_endpoint,
                access_key=self.access_key,
                secret_key=self.secret_key,
                secure=False
            )
        
        logger.info(f"FileReader initialized with bucket: {self.bucket}, prefix: {self.prefix}")
    
    def _maybe_update_prefix(
        self,
        client_name: str = "",
        app_name: str = "",
        project_name: str = ""
    ) -> None:
        """Dynamically update MinIO prefix using backend API.
        
        Args:
            client_name: Client name (required, no fallback to env vars)
            app_name: App name (required, no fallback to env vars)
            project_name: Project name (required, no fallback to env vars)
        """
        try:
            # Use passed parameters only - no environment variable fallback
            # Context should be passed from AgentContext or request parameters
            if not client_name or not app_name or not project_name:
                logger.warning(
                    "⚠️ Missing project context for dynamic path resolution. "
                    f"client_name={client_name}, app_name={app_name}, project_name={project_name}"
                )
                return
            
            # Call backend API for dynamic path
            try:
                validate_api_url = settings.VALIDATE_API_URL
                if not validate_api_url.startswith("http"):
                    validate_api_url = f"http://{validate_api_url}"
                
                url = f"{validate_api_url}/api/data-upload-validate/get_object_prefix"
                params = {
                    "client_name": client_name,
                    "app_name": app_name,
                    "project_name": project_name
                }
                
                response = requests.get(url, params=params, timeout=30)
                if response.status_code == 200:
                    data = response.json()
                    current = data.get("prefix", "")
                    if current and current != self.prefix:
                        logger.info(f"✅ Dynamic path updated: {current}")
                        self.prefix = current
                        return
            except Exception as e:
                logger.warning(f"Failed to fetch dynamic path: {e}")
            
            # Fallback to constructed prefix
            current = f"{client_name}/{app_name}/{project_name}/"
            if self.prefix != current:
                self.prefix = current
                logger.info(f"Prefix updated to: {current}")
                
        except Exception as e:
            logger.error(f"Failed to update prefix: {e}")
    
    def load_files(
        self,
        client_name: str = "",
        app_name: str = "",
        project_name: str = ""
    ) -> Dict[str, Any]:
        """
        Load available files from MinIO with their columns.
        
        Args:
            client_name: Client name for context
            app_name: App name for context
            project_name: Project name for context
        
        Returns:
            Dictionary with file paths as keys and metadata as values
        """
        try:
            # Update prefix before loading
            self._maybe_update_prefix(client_name, app_name, project_name)
            
            logger.info(f"Loading files with prefix: {self.prefix}")
            
            # List objects in bucket
            objects = self.minio_client.list_objects(bucket_name=self.bucket, prefix=self.prefix, recursive=True)
            
            files_with_columns = {}
            supported_extensions = (".arrow", ".parquet", ".feather", ".csv")
            
            for obj in objects:
                # Only process supported file types
                if not obj.object_name.lower().endswith(supported_extensions):
                    continue
                
                response = None
                try:
                    # Get object data
                    response = self.minio_client.get_object(bucket_name=self.bucket, object_name=obj.object_name)
                    data = response.read()
                    columns = self._extract_columns(data, obj.object_name)
                    
                    if columns:
                        files_with_columns[obj.object_name] = {
                            "columns": columns,
                            "file_name": os.path.basename(obj.object_name)
                        }
                        logger.debug(f"Loaded file {obj.object_name} with {len(columns)} columns")
                    
                except Exception as e:
                    logger.warning(f"Failed to load file {obj.object_name}: {e}")
                    continue
                finally:
                    if response:
                        response.close()
                        response.release_conn()
            
            logger.info(f"Successfully loaded {len(files_with_columns)} files")
            return files_with_columns
            
        except Exception as e:
            logger.error(f"Error loading files from MinIO: {e}")
            raise FileLoadError(f"Failed to load files: {e}")
    
    def _extract_columns(self, data: bytes, file_path: str) -> List[str]:
        """
        Extract columns from file data using multiple format readers.
        
        Args:
            data: File data as bytes
            file_path: Path to the file for logging
        
        Returns:
            List of column names
        """
        # Define readers in order of likelihood
        readers = [
            ("Parquet", lambda buffer: pq.read_table(buffer)),
            ("Feather", lambda buffer: pf.read_table(buffer)),
            ("Arrow IPC", lambda buffer: pa.ipc.open_file(pa.BufferReader(buffer)).read_all()),
            ("Arrow Stream", lambda buffer: pa.ipc.open_stream(buffer).read_all()),
            ("CSV", lambda buffer: csv.read_csv(buffer))
        ]
        
        for format_name, reader_func in readers:
            try:
                table = reader_func(data)
                if table and hasattr(table, 'column_names'):
                    columns = table.column_names
                    logger.debug(f"Successfully read {file_path} as {format_name} with {len(columns)} columns")
                    return columns
            except Exception as e:
                logger.debug(f"Failed to read {file_path} as {format_name}: {e}")
                continue
        
        logger.warning(f"Could not read file {file_path} with any supported format")
        return []
    
    def get_file_columns(self, file_path: str) -> List[str]:
        """
        Get columns for a specific file.
        
        Args:
            file_path: Path to the file
        
        Returns:
            List of column names
        """
        try:
            response = self.minio_client.get_object(bucket_name=self.bucket, object_name=file_path)
            data = response.read()
            response.close()
            response.release_conn()
            
            return self._extract_columns(data, file_path)
            
        except Exception as e:
            logger.error(f"Failed to get columns for {file_path}: {e}")
            return []

