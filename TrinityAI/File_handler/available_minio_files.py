"""
available_minio_files.py - File Handler for Trinity AI
======================================================

Handles file loading from MinIO, @filename mention parsing, and context enrichment for LLM prompts.
This module integrates with Superagent and Workflow AI to provide file-aware context.

Author: Quant Matrix AI Solutions
"""

import os
import re
import json
import logging
from typing import Dict, List, Tuple, Any, Optional
from pathlib import Path
import sys

# Add parent directory to path for imports
PARENT_DIR = Path(__file__).resolve().parent.parent
if str(PARENT_DIR) not in sys.path:
    sys.path.append(str(PARENT_DIR))

from file_loader import FileLoader
from file_analyzer import FileAnalyzer

logger = logging.getLogger("trinity.file_handler")


class FileHandler:
    """
    Centralized file handler that loads MinIO files, detects @filename mentions,
    and enriches LLM context with file details.
    
    Features:
    - Loads all available files from MinIO on initialization
    - Parses user prompts for @filename mentions
    - Provides file context (columns, data types, statistics) as JSON
    - Prints available files to console for user visibility
    """
    
    def __init__(self, minio_endpoint: str, minio_access_key: str, minio_secret_key: str,
                 minio_bucket: str, object_prefix: str = ""):
        """
        Initialize FileHandler with MinIO configuration.
        
        Args:
            minio_endpoint: MinIO server endpoint
            minio_access_key: MinIO access key
            minio_secret_key: MinIO secret key
            minio_bucket: MinIO bucket name
            object_prefix: Object prefix for filtering files
        """
        logger.info("🚀 Initializing FileHandler...")
        
        self.minio_endpoint = minio_endpoint
        self.minio_access_key = minio_access_key
        self.minio_secret_key = minio_secret_key
        self.minio_bucket = minio_bucket
        self.object_prefix = object_prefix
        
        # Initialize FileLoader for basic file operations
        self.file_loader = FileLoader(
            minio_endpoint=minio_endpoint,
            minio_access_key=minio_access_key,
            minio_secret_key=minio_secret_key,
            minio_bucket=minio_bucket,
            object_prefix=object_prefix
        )
        
        # Initialize FileAnalyzer for detailed file metadata
        self.file_analyzer = FileAnalyzer(
            minio_endpoint=minio_endpoint,
            access_key=minio_access_key,
            secret_key=minio_secret_key,
            bucket=minio_bucket,
            prefix=object_prefix,
            secure=False  # Typically false for internal MinIO
        )
        
        # Storage for loaded files
        self.files_with_columns: Dict[str, Any] = {}
        self.files_metadata: Dict[str, Dict[str, Any]] = {}
        self._files_loaded = False
        
        logger.info("✅ FileHandler initialized")
    
    def set_context(self, client_name: str = "", app_name: str = "", project_name: str = "") -> None:
        """
        Set environment context for dynamic path resolution.
        EXACT SAME LOGIC AS CONCAT AGENT.
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
    
    def _maybe_update_prefix(self) -> None:
        """
        Dynamically updates the MinIO prefix using the data_upload_validate API endpoint.
        EXACT SAME LOGIC AS CONCAT AGENT.
        """
        try:
            # Method 1: Call the data_upload_validate API endpoint
            try:
                import requests
                
                client_name = os.getenv("CLIENT_NAME", "")
                app_name = os.getenv("APP_NAME", "")
                project_name = os.getenv("PROJECT_NAME", "")
                
                validate_api_url = os.getenv("VALIDATE_API_URL", "http://fastapi:8001")
                if not validate_api_url.startswith("http"):
                    validate_api_url = f"http://{validate_api_url}"
                
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
                        # Update FileLoader and FileAnalyzer too
                        self.file_loader.object_prefix = current
                        self.file_analyzer.prefix = current
                        # Reload files with new prefix
                        self._files_loaded = False
                        return
                    elif current:
                        logger.info(f"✅ Dynamic path fetched: {current} (no change needed)")
                        # Still update in case they weren't in sync
                        self.object_prefix = current
                        self.file_loader.object_prefix = current
                        self.file_analyzer.prefix = current
                        return
                    else:
                        logger.warning(f"API returned empty prefix: {data}")
                else:
                    logger.warning(f"API call failed with status {response.status_code}: {response.text}")
                        
            except Exception as e:
                logger.warning(f"Failed to fetch dynamic path from API: {e}")
            
            # Method 2: Fallback to environment variables
            client_name = os.getenv("CLIENT_NAME", "default_client")
            app_name = os.getenv("APP_NAME", "default_app")
            project_name = os.getenv("PROJECT_NAME", "default_project")
            current = f"{client_name}/{app_name}/{project_name}/"
            
            if self.object_prefix != current:
                logger.info("MinIO prefix updated from '%s' to '%s' (env fallback)", self.object_prefix, current)
                self.object_prefix = current
                self.file_loader.object_prefix = current
                self.file_analyzer.prefix = current
                self._files_loaded = False
            else:
                logger.info(f"Using current prefix: {current}")
                
        except Exception as e:
            logger.error(f"Failed to update prefix: {e}")
    
    def load_files(self) -> Dict[str, Any]:
        """
        Load all available files from MinIO with their columns and metadata.
        EXACT SAME LOGIC AS CONCAT AGENT.
        
        Returns:
            Dict with file information
        """
        if self._files_loaded:
            logger.info("📁 Files already loaded, using cached data")
            return self.files_with_columns
        
        try:
            print("\n" + "="*80)
            print("📁 Loading available MinIO files...")
            print("="*80)
            
            # Update prefix FIRST (EXACT SAME AS CONCAT)
            self._maybe_update_prefix()
            
            logger.info(f"Loading files with prefix: {self.object_prefix}")
            
            # Load files using FileLoader
            files_info = self.file_loader.load_files()
            
            # Convert to the format we need
            self.files_with_columns = {}
            for file_path, file_data in files_info.items():
                if isinstance(file_data, dict):
                    columns = file_data.get('columns', [])
                    file_name = file_data.get('file_name', os.path.basename(file_path))
                else:
                    columns = file_data
                    file_name = os.path.basename(file_path)
                
                # Store with just filename as key for easier @mention matching
                self.files_with_columns[file_name] = {
                    'columns': columns,
                    'file_path': file_path
                }
            
            # Get detailed metadata using FileAnalyzer
            try:
                analysis_results = self.file_analyzer.analyze_files()
                
                if 'error' not in analysis_results:
                    for filename, analysis in analysis_results.get('files', {}).items():
                        if filename in self.files_with_columns:
                            # Enrich with metadata
                            self.files_metadata[filename] = {
                                'columns': analysis.get('columns', {}),
                                'data_types': analysis.get('data_types', {}),
                                'row_count': int(analysis.get('total_rows', 0)),
                                'file_size_bytes': int(analysis.get('file_size_bytes', 0)),
                                'sample_values': analysis.get('sample_data', {}),
                                'statistical_summary': analysis.get('statistical_summary', {}),
                                'missing_values': analysis.get('missing_values', {})
                            }
                else:
                    logger.warning(f"File analysis failed: {analysis_results.get('error')}")
                    # Use basic metadata from FileLoader
                    self.files_metadata = {}
                    
            except Exception as e:
                logger.warning(f"Failed to get detailed file analysis: {e}")
                self.files_metadata = {}
            
            # Print summary to console
            total_files = len(self.files_with_columns)
            print(f"✅ Loaded {total_files} files:\n")
            
            # Show first 10 files with details
            for i, (filename, info) in enumerate(list(self.files_with_columns.items())[:10], 1):
                columns = info.get('columns', [])
                col_preview = ', '.join(columns[:5])
                if len(columns) > 5:
                    col_preview += f' + {len(columns)-5} more'
                
                print(f"  {i}. 📄 {filename}")
                print(f"     Columns ({len(columns)}): {col_preview}")
                
                # Add metadata if available
                if filename in self.files_metadata:
                    metadata = self.files_metadata[filename]
                    row_count = metadata.get('row_count', 0)
                    if row_count > 0:
                        print(f"     Rows: {row_count:,}")
                print()
            
            if total_files > 10:
                print(f"  ... and {total_files - 10} more files\n")
            
            print("="*80)
            print(f"✅ File loading complete. Use @filename in your prompts to reference files.")
            print("="*80 + "\n")
            
            self._files_loaded = True
            
            return self.files_with_columns
            
        except Exception as e:
            logger.error(f"❌ Error loading files: {e}")
            print(f"\n❌ Error loading files: {e}\n")
            self.files_with_columns = {}
            self.files_metadata = {}
            return {}
    
    def parse_prompt_for_files(self, prompt: str) -> List[str]:
        """
        Parse user prompt for @filename mentions.
        
        Args:
            prompt: User's input prompt
            
        Returns:
            List of mentioned filenames (without @ prefix)
            
        Example:
            Input: "Merge @sales_data.arrow with @customer_data.arrow"
            Output: ["sales_data.arrow", "customer_data.arrow"]
        """
        # Regex pattern to match @filename (supports .arrow, .parquet, .csv, .feather)
        pattern = r'@([\w\-\.]+\.(?:arrow|parquet|csv|feather|xlsx|xls))'
        matches = re.findall(pattern, prompt, re.IGNORECASE)
        
        # Also try to match without extension (user might just use @filename)
        pattern_no_ext = r'@([\w\-]+)(?![\.a-zA-Z])'
        matches_no_ext = re.findall(pattern_no_ext, prompt)
        
        # Combine and deduplicate
        all_matches = list(set(matches + matches_no_ext))
        
        if all_matches:
            logger.info(f"🔍 Detected file mentions: {all_matches}")
        
        return all_matches
    
    def get_file_context(self, filenames: List[str]) -> Dict[str, Any]:
        """
        Get detailed context for specified files.
        
        Args:
            filenames: List of filenames to get context for
            
        Returns:
            Dict with file details in JSON-serializable format
            
        Example:
            {
                "sales_data.arrow": {
                    "columns": ["date", "revenue", "region"],
                    "data_types": {"date": "datetime64", "revenue": "float64", "region": "string"},
                    "row_count": 10000,
                    "sample_values": {"region": ["North", "South", "East", "West"]}
                }
            }
        """
        file_context = {}
        
        # Ensure files are loaded
        if not self._files_loaded:
            self.load_files()
        
        for filename in filenames:
            # Try exact match first
            if filename in self.files_with_columns:
                matched_filename = filename
            else:
                # Try partial match (user might mention without extension)
                matched_filename = None
                for available_file in self.files_with_columns.keys():
                    if filename.lower() in available_file.lower():
                        matched_filename = available_file
                        break
            
            if matched_filename:
                # Get basic file info
                file_info = self.files_with_columns[matched_filename]
                columns = file_info.get('columns', [])
                
                context_entry = {
                    "columns": columns,
                    "total_columns": len(columns),
                    "file_path": file_info.get('file_path', '')
                }
                
                # Add detailed metadata if available
                if matched_filename in self.files_metadata:
                    metadata = self.files_metadata[matched_filename]
                    statistical_summary = metadata.get('statistical_summary', {})
                    
                    context_entry.update({
                        "data_types": metadata.get('data_types', {}),
                        "row_count": metadata.get('row_count', 0),
                        "file_size_bytes": metadata.get('file_size_bytes', 0),
                        "sample_values": metadata.get('sample_values', {}),
                        "statistical_summary": statistical_summary,
                        "missing_values": metadata.get('missing_values', {})
                    })
                    
                    logger.info(f"✅ Added context for: {matched_filename} with {len(statistical_summary)} statistical columns")
                else:
                    logger.warning(f"⚠️ No detailed metadata available for: {matched_filename}")
                
                file_context[matched_filename] = context_entry
                logger.info(f"✅ File context entry has {len(context_entry)} fields")
            else:
                logger.warning(f"⚠️ File not found: {filename}")
                file_context[filename] = {
                    "error": "File not found",
                    "available_files": list(self.files_with_columns.keys())[:10]
                }
        
        return file_context
    
    def enrich_prompt_with_file_context(self, prompt: str) -> Tuple[str, Dict[str, Any]]:
        """
        Parse prompt for @filename mentions and enrich with file context.
        
        Args:
            prompt: User's input prompt
            
        Returns:
            Tuple of (original_prompt, file_context_dict)
            
        Example:
            Input: "Merge @sales_data.arrow with @customer_data.arrow"
            Output: (
                "Merge @sales_data.arrow with @customer_data.arrow",
                {
                    "sales_data.arrow": {...},
                    "customer_data.arrow": {...}
                }
            )
        """
        # Update prefix first (EXACT SAME AS CONCAT)
        self._maybe_update_prefix()
        
        # Ensure files are loaded (lazy loading)
        if not self._files_loaded:
            logger.info("Loading files for the first time (lazy loading after context is set)")
            self.load_files()
        
        # Parse prompt for file mentions
        mentioned_files = self.parse_prompt_for_files(prompt)
        
        if mentioned_files:
            print(f"\n🔍 Detected file mentions: {', '.join(['@' + f for f in mentioned_files])}")
            print("📋 Enriching LLM context with file details...")
            
            # Get file context
            file_context = self.get_file_context(mentioned_files)
            
            return prompt, file_context
        else:
            # No files mentioned
            return prompt, {}
    
    def get_all_files(self) -> Dict[str, Any]:
        """
        Get all available files with their basic information.
        
        Returns:
            Dict with all files and their columns
        """
        if not self._files_loaded:
            self.load_files()
        
        return self.files_with_columns
    
    def format_file_context_for_llm(self, file_context: Dict[str, Any]) -> str:
        """
        Format file context as a string suitable for including in LLM prompts.
        Includes comprehensive statistical information and column descriptions.
        
        Args:
            file_context: File context dictionary from get_file_context()
            
        Returns:
            Formatted string for LLM prompt with detailed statistical context
        """
        if not file_context:
            return ""
        
        logger.info(f"📝 Formatting file context for {len(file_context)} file(s) for LLM")
        
        formatted = "\n\n--- MENTIONED FILES CONTEXT (@filename) ---\n"
        formatted += "Complete file information including statistical summaries for intelligent analysis:\n"
        
        for filename, context in file_context.items():
            if "error" in context:
                formatted += f"\n❌ {filename}: {context['error']}\n"
                if "available_files" in context:
                    formatted += f"   Available files: {', '.join(context['available_files'][:5])}\n"
                continue
            
            formatted += f"\n" + "="*60 + "\n"
            formatted += f"📄 FILE: {filename}\n"
            formatted += "="*60 + "\n"
            
            # Basic info
            columns = context.get('columns', [])
            row_count = context.get('row_count', 0)
            formatted += f"\n📊 OVERVIEW:\n"
            formatted += f"   Total Rows: {row_count:,}\n"
            formatted += f"   Total Columns: {len(columns)}\n"
            formatted += f"   File Size: {context.get('file_size_bytes', 0):,} bytes\n"
            
            # All column names
            formatted += f"\n📋 COLUMNS ({len(columns)}):\n"
            formatted += f"   {', '.join(columns)}\n"
            
            # Data types with detailed breakdown
            if context.get('data_types'):
                formatted += f"\n🔤 DATA TYPES:\n"
                data_types = context.get('data_types', {})
                
                # Group by type
                numeric_cols = []
                categorical_cols = []
                datetime_cols = []
                other_cols = []
                
                for col, dtype in data_types.items():
                    dtype_str = str(dtype).lower()
                    if 'int' in dtype_str or 'float' in dtype_str or 'double' in dtype_str:
                        numeric_cols.append(f"{col} ({dtype})")
                    elif 'datetime' in dtype_str or 'timestamp' in dtype_str:
                        datetime_cols.append(f"{col} ({dtype})")
                    elif 'object' in dtype_str or 'string' in dtype_str or 'category' in dtype_str:
                        categorical_cols.append(f"{col} ({dtype})")
                    else:
                        other_cols.append(f"{col} ({dtype})")
                
                if numeric_cols:
                    formatted += f"   Numeric Columns ({len(numeric_cols)}): {', '.join(numeric_cols[:10])}\n"
                    if len(numeric_cols) > 10:
                        formatted += f"      ... and {len(numeric_cols)-10} more\n"
                if categorical_cols:
                    formatted += f"   Categorical Columns ({len(categorical_cols)}): {', '.join(categorical_cols[:10])}\n"
                    if len(categorical_cols) > 10:
                        formatted += f"      ... and {len(categorical_cols)-10} more\n"
                if datetime_cols:
                    formatted += f"   DateTime Columns ({len(datetime_cols)}): {', '.join(datetime_cols)}\n"
                if other_cols:
                    formatted += f"   Other Types ({len(other_cols)}): {', '.join(other_cols)}\n"
            
            # Statistical Summary (df.describe() equivalent) - SHOW ALL COLUMNS
            if context.get('statistical_summary'):
                stats = context.get('statistical_summary', {})
                logger.info(f"   📊 Including statistical summary for ALL {len(stats)} columns")
                formatted += f"\n📈 STATISTICAL SUMMARY (df.describe()) - Complete for ALL Columns:\n"
                formatted += f"   Total Columns with Statistics: {len(stats)}\n\n"
                
                # Show ALL columns (removed the [:10] limit)
                for col_name, col_stats in stats.items():
                    formatted += f"   📊 {col_name}:\n"
                    
                    # For numeric columns
                    if isinstance(col_stats, dict):
                        if 'count' in col_stats:
                            formatted += f"      Count: {col_stats.get('count', 0):,.0f}\n"
                        if 'mean' in col_stats:
                            formatted += f"      Mean: {col_stats.get('mean', 0):,.2f}\n"
                        if 'std' in col_stats:
                            formatted += f"      Std Dev: {col_stats.get('std', 0):,.2f}\n"
                        if 'min' in col_stats:
                            formatted += f"      Min: {col_stats.get('min', 0):,.2f}\n"
                        if '25%' in col_stats:
                            formatted += f"      25th Percentile: {col_stats.get('25%', 0):,.2f}\n"
                        if '50%' in col_stats:
                            formatted += f"      Median (50%): {col_stats.get('50%', 0):,.2f}\n"
                        if '75%' in col_stats:
                            formatted += f"      75th Percentile: {col_stats.get('75%', 0):,.2f}\n"
                        if 'max' in col_stats:
                            formatted += f"      Max: {col_stats.get('max', 0):,.2f}\n"
                        # For categorical columns
                        if 'unique' in col_stats:
                            formatted += f"      Unique Values: {col_stats.get('unique', 0)}\n"
                        if 'top' in col_stats:
                            formatted += f"      Most Frequent: {col_stats.get('top', 'N/A')}\n"
                        if 'freq' in col_stats:
                            formatted += f"      Frequency: {col_stats.get('freq', 0)}\n"
                    
                    formatted += "\n"
            
            # Missing values analysis - SHOW ALL COLUMNS
            if context.get('missing_values'):
                formatted += f"\n🔍 MISSING VALUES (All Columns):\n"
                missing = context.get('missing_values', {})
                has_missing = False
                # Show ALL columns (removed the [:10] limit)
                for col, missing_count in missing.items():
                    if missing_count > 0:
                        has_missing = True
                        pct = (missing_count / row_count * 100) if row_count > 0 else 0
                        formatted += f"   {col}: {missing_count:,} missing ({pct:.1f}%)\n"
                
                if not has_missing:
                    formatted += f"   ✅ No missing values detected in any column\n"
            
            # Sample values (unique values for ALL categorical columns)
            if context.get('sample_values'):
                formatted += f"\n💡 SAMPLE VALUES - All Categorical Columns:\n"
                samples = context.get('sample_values', {})
                formatted += f"   Total Columns with Samples: {len(samples)}\n\n"
                # Show ALL columns (removed the [:5] limit)
                for col, values in samples.items():
                    if values and len(values) > 0:
                        # Show unique values or sample
                        if len(values) <= 15:
                            formatted += f"   {col}: {', '.join(str(v) for v in values)}\n"
                        else:
                            formatted += f"   {col}: {', '.join(str(v) for v in values[:15])} ... (total {len(values)} unique values)\n"
        
        formatted += "\n" + "="*60 + "\n"
        formatted += "📚 INSTRUCTIONS FOR LLM:\n"
        formatted += "- Use the file context to give answers to the user's questions if user asks genral query reagrding the dataset\n"
        formatted += "- Use the file details if user asks specific query reagrding the dataset like details of data , summary of columns , datatype , information , descriprtion etc. \n"
        formatted += "- Use the statistical summaries to understand data distribution\n"
        formatted += "- Consider data types when suggesting operations (numeric vs categorical)\n"
        formatted += "- Use min/max/mean values to provide intelligent defaults\n"
        formatted += "- Account for missing values in your recommendations\n"
        formatted += "- Refer to files by their exact names\n"
        formatted += "- Suggest appropriate visualizations based on data types\n"
        formatted += "- Use sample values to understand the nature of categorical data\n"
        formatted += "="*60 + "\n"
        
        return formatted


# Global FileHandler instance
_file_handler_instance: Optional[FileHandler] = None


def get_file_handler(minio_endpoint: str = None, minio_access_key: str = None, 
                     minio_secret_key: str = None, minio_bucket: str = None,
                     object_prefix: str = "") -> FileHandler:
    """
    Get or create the global FileHandler instance (singleton pattern).
    
    Args:
        minio_endpoint: MinIO endpoint (required for first call)
        minio_access_key: MinIO access key (required for first call)
        minio_secret_key: MinIO secret key (required for first call)
        minio_bucket: MinIO bucket (required for first call)
        object_prefix: Object prefix for filtering
        
    Returns:
        FileHandler instance
    """
    global _file_handler_instance
    
    if _file_handler_instance is None:
        if not all([minio_endpoint, minio_access_key, minio_secret_key, minio_bucket]):
            raise ValueError("MinIO configuration required for FileHandler initialization")
        
        _file_handler_instance = FileHandler(
            minio_endpoint=minio_endpoint,
            minio_access_key=minio_access_key,
            minio_secret_key=minio_secret_key,
            minio_bucket=minio_bucket,
            object_prefix=object_prefix
        )
        
        # DO NOT load files immediately - wait for context to be set
        logger.info("FileHandler instance created (files will be loaded when context is set)")
    
    return _file_handler_instance


if __name__ == "__main__":
    # Test the FileHandler
    import sys
    
    # Get MinIO config from environment or use defaults
    handler = FileHandler(
        minio_endpoint=os.getenv("MINIO_ENDPOINT", "minio:9000"),
        minio_access_key=os.getenv("MINIO_ACCESS_KEY", "minio"),
        minio_secret_key=os.getenv("MINIO_SECRET_KEY", "minio123"),
        minio_bucket=os.getenv("MINIO_BUCKET", "trinity"),
        object_prefix=os.getenv("MINIO_PREFIX", "")
    )
    
    # Load files
    files = handler.load_files()
    print(f"\n✅ Loaded {len(files)} files")
    
    # Test @mention parsing
    test_prompt = "Merge @sales_data.arrow with @customer_data.arrow on customer_id"
    print(f"\n🧪 Testing prompt: {test_prompt}")
    
    original_prompt, file_context = handler.enrich_prompt_with_file_context(test_prompt)
    print(f"\n📋 File Context:")
    print(json.dumps(file_context, indent=2))
    
    # Format for LLM
    llm_context = handler.format_file_context_for_llm(file_context)
    print(f"\n📝 LLM Context String:")
    print(llm_context)

