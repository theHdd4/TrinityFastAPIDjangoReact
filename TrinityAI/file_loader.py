# file_loader.py - Standardized file loading utility for all Trinity AI agents

import os
import json
import logging
from typing import Dict, Any, Optional, List
from minio import Minio
from minio.error import S3Error
import pyarrow as pa
import pyarrow.parquet as pq
import pyarrow.feather as pf
import pyarrow.csv as csv
import requests

logger = logging.getLogger("trinity.file_loader")

class FileLoader:
    """
    Standardized file loading utility for all Trinity AI agents.
    Provides consistent file handling across all agents with support for:
    - Multiple file formats (Arrow, Parquet, Feather, CSV)
    - Dynamic prefix resolution
    - Error handling and logging
    - Column extraction
    """
    
    def __init__(self, minio_endpoint: str, minio_access_key: str, minio_secret_key: str, 
                 minio_bucket: str, object_prefix: str = ""):
        self.minio_endpoint = minio_endpoint
        self.minio_access_key = minio_access_key
        self.minio_secret_key = minio_secret_key
        self.minio_bucket = minio_bucket
        self.object_prefix = object_prefix
        
        # Initialize MinIO client
        self.minio_client = Minio(
            minio_endpoint,
            access_key=minio_access_key,
            secret_key=minio_secret_key,
            secure=False
        )
        
        logger.info(f"FileLoader initialized with bucket: {minio_bucket}, prefix: {object_prefix}")
    
    def set_context(self, client_name: str = "", app_name: str = "", project_name: str = "") -> None:
        """
        Set environment context for dynamic path resolution.
        This ensures the API call will fetch the correct path for the current project.
        """
        if client_name or app_name or project_name:
            if client_name:
                os.environ["CLIENT_NAME"] = client_name
            if app_name:
                os.environ["APP_NAME"] = app_name
            if project_name:
                os.environ["PROJECT_NAME"] = project_name
            logger.info(f"🔧 Environment context set for dynamic path resolution: {client_name}/{app_name}/{project_name}")
        else:
            logger.info("🔧 Using existing environment context for dynamic path resolution")
    
    def load_files(self) -> Dict[str, Any]:
        """
        Load available files from MinIO with their columns using dynamic paths.
        Works exactly like the explore agent for perfect compatibility.
        
        Returns:
            Dict[str, Any]: Dictionary with file paths as keys and metadata as values
                Format: {file_path: {"columns": [col1, col2, ...], "file_name": "filename.arrow"}}
        """
        try:
            # Update prefix to current path before loading files (like explore agent)
            self._maybe_update_prefix()
            
            logger.info(f"Loading files with prefix: {self.object_prefix}")
            
            # List objects in bucket with current prefix
            objects = self.minio_client.list_objects(self.minio_bucket, prefix=self.object_prefix, recursive=True)
            
            files_with_columns = {}
            
            for obj in objects:
                # Only load .arrow files like explore agent (for consistency with SavedDataFramesPanel)
                if not obj.object_name.endswith('.arrow'):
                    continue
                    
                try:
                    # Get object data
                    response = self.minio_client.get_object(self.minio_bucket, obj.object_name)
                    data = response.read()
                    
                    # Read Arrow file exactly like explore agent
                    import pyarrow as pa
                    import pyarrow.ipc as ipc
                    
                    with pa.ipc.open_file(pa.BufferReader(data)) as reader:
                        table = reader.read_all()
                        columns = table.column_names
                        files_with_columns[obj.object_name] = {
                            "columns": columns,
                            "file_name": os.path.basename(obj.object_name)
                        }
                        
                        logger.info(f"Loaded file {obj.object_name} with {len(columns)} columns")
                    
                except Exception as e:
                    logger.warning(f"Failed to load file {obj.object_name}: {e}")
                    continue
                finally:
                    if 'response' in locals():
                        response.close()
                        response.release_conn()
            
            logger.info(f"Successfully loaded {len(files_with_columns)} files from MinIO")
            return files_with_columns
            
        except Exception as e:
            logger.error(f"Error loading files from MinIO: {e}")
            return {}
    
    def _extract_columns(self, data: bytes, file_path: str) -> List[str]:
        """
        Extract columns from file data using multiple format readers.
        
        Args:
            data: File data as bytes
            file_path: Path to the file for logging
            
        Returns:
            List[str]: List of column names
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
    
    def _maybe_update_prefix(self) -> None:
        """Dynamically updates the MinIO prefix by fetching the REAL-TIME path from backend API.
        This ensures we always load files from the correct project location."""
        try:
            # Method 1: Call the data_upload_validate API endpoint to get the CURRENT dynamic prefix
            try:
                # Get environment context from environment variables
                client_name = os.getenv("CLIENT_NAME", "")
                app_name = os.getenv("APP_NAME", "")
                project_name = os.getenv("PROJECT_NAME", "")
                
                # Use the correct backend API endpoint for dynamic path resolution
                validate_api_url = os.getenv("VALIDATE_API_URL", "http://fastapi:8001")
                if not validate_api_url.startswith("http"):
                    validate_api_url = f"http://{validate_api_url}"
                
                # Call the correct API endpoint that returns the current dynamic path
                url = f"{validate_api_url}/api/data-upload-validate/get_object_prefix"
                params = {
                    "client_name": client_name,
                    "app_name": app_name,
                    "project_name": project_name
                }
                
                logger.info(f"🔍 Fetching dynamic path from: {url}")
                logger.info(f"🔍 With params: {params}")
                
                response = requests.get(url, params=params, timeout=30)
                if response.status_code == 200:
                    data = response.json()
                    current = data.get("prefix", "")
                    if current and current != self.object_prefix:
                        logger.info(f"✅ Dynamic path fetched successfully: {current}")
                        logger.info("MinIO prefix updated from '%s' to '%s'", self.object_prefix, current)
                        self.object_prefix = current
                        return
                    elif current:
                        logger.info(f"✅ Dynamic path fetched: {current} (no change needed)")
                        return
                    else:
                        logger.warning(f"API returned empty prefix: {data}")
                else:
                    logger.warning(f"API call failed with status {response.status_code}: {response.text}")
                        
            except Exception as e:
                logger.warning(f"Failed to fetch dynamic path from API: {e}")
            
            # Method 2: Fallback to environment variables if API fails
            client_name = os.getenv("CLIENT_NAME", "default_client")
            app_name = os.getenv("APP_NAME", "default_app")
            project_name = os.getenv("PROJECT_NAME", "default_project")
            current = f"{client_name}/{app_name}/{project_name}/"
            
            if self.object_prefix != current:
                logger.info("MinIO prefix updated from '%s' to '%s' (env fallback)", self.object_prefix, current)
                self.object_prefix = current
            else:
                logger.info(f"Using current prefix: {current}")
                
        except Exception as e:
            logger.error(f"Failed to update prefix: {e}")
            # Keep the existing prefix if all methods fail
    
    def get_file_info_string(self, files_with_columns: Dict[str, Any]) -> str:
        """
        Build a formatted string with file names and their columns for display.
        
        Args:
            files_with_columns: Dictionary of files with their metadata
            
        Returns:
            str: Formatted string with file information
        """
        if not files_with_columns:
            return "No files available"
        
        file_info_parts = []
        for file_path, file_data in files_with_columns.items():
            # Handle both dict and list formats
            if isinstance(file_data, dict):
                columns = file_data.get('columns', [])
                file_name = file_data.get('file_name', os.path.basename(file_path))
            elif isinstance(file_data, list):
                columns = file_data
                file_name = os.path.basename(file_path)
            else:
                logger.warning(f"Unexpected file_data type for {file_path}: {type(file_data)}")
                columns = []
                file_name = os.path.basename(file_path)
            
            # Show just the filename for cleaner display
            display_name = file_name.split('/')[-1] if '/' in file_name else file_name
            
            file_info_parts.append(f"{display_name} (columns: {', '.join(columns)})")
        
        return ', '.join(file_info_parts)
    
    def list_available_files(self) -> Dict[str, Any]:
        """
        List all available files from MinIO with their columns.
        
        Returns:
            Dict[str, Any]: Result dictionary with success status and file information
        """
        try:
            files_with_columns = self.load_files()
            return {
                "success": True,
                "files": files_with_columns,
                "total_files": len(files_with_columns),
                "dynamic_prefix": self.object_prefix
            }
        except Exception as e:
            logger.error(f"Error listing available files: {e}")
            return {
                "success": False,
                "message": f"Failed to list files: {str(e)}",
                "files": {},
                "total_files": 0
            }
