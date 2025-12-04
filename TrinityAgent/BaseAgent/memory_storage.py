"""
Standard Memory Storage for Trinity AI Base Agent
Provides consistent memory management across all agents.
Integrates with memory_service for Redis caching.
"""

import json
import logging
import os
import sys
from datetime import datetime
from pathlib import Path
from typing import Dict, Any, Optional, List
from minio import Minio
from minio.error import S3Error

from .config import settings
from .exceptions import ConfigurationError

logger = logging.getLogger("trinity.memory_storage")

# Try to import memory_service functions for Redis cache integration
MEMORY_SERVICE_AVAILABLE = False
load_session_from_service = None
save_session_to_service = None
delete_session_from_service = None

try:
    # Add parent directory to path to import memory_service
    parent_dir = Path(__file__).resolve().parent.parent
    if str(parent_dir) not in sys.path:
        sys.path.insert(0, str(parent_dir))
    
    try:
        from memory_service.storage import load_session as load_session_from_service
        from memory_service.storage import save_session as save_session_to_service
        from memory_service.storage import delete_session as delete_session_from_service
        MEMORY_SERVICE_AVAILABLE = True
        logger.info("✅ Memory service (with Redis cache) available for BaseAgent")
    except ImportError:
        try:
            from TrinityAgent.memory_service.storage import load_session as load_session_from_service
            from TrinityAgent.memory_service.storage import save_session as save_session_to_service
            from TrinityAgent.memory_service.storage import delete_session as delete_session_from_service
            MEMORY_SERVICE_AVAILABLE = True
            logger.info("✅ Memory service (with Redis cache) available for BaseAgent (absolute import)")
        except ImportError:
            logger.debug("Memory service not available, using MinIO-only storage")
            MEMORY_SERVICE_AVAILABLE = False
except Exception as e:
    logger.debug(f"Memory service not available: {e}, using MinIO-only storage")
    MEMORY_SERVICE_AVAILABLE = False


class MemoryStorage:
    """Standardized memory storage for agent sessions and context."""
    
    def __init__(
        self,
        minio_endpoint: Optional[str] = None,
        access_key: Optional[str] = None,
        secret_key: Optional[str] = None,
        bucket: Optional[str] = None,
        prefix: str = "trinity_ai_memory"
    ):
        """Initialize memory storage with MinIO backend."""
        minio_config = settings.get_minio_config()
        self.minio_endpoint = minio_endpoint or minio_config["endpoint"]
        self.access_key = access_key or minio_config["access_key"]
        self.secret_key = secret_key or minio_config["secret_key"]
        self.bucket = bucket or minio_config["bucket"]
        self.prefix = prefix or settings.TRINITY_AI_MEMORY_PREFIX
        
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
            self._ensure_bucket()
            logger.info(f"MemoryStorage initialized with bucket: {self.bucket}")
        except Exception as e:
            logger.error(f"Failed to initialize MinIO client: {e}")
            raise ConfigurationError(f"Failed to initialize memory storage: {e}")
    
    def _ensure_bucket(self):
        """Ensure the bucket exists."""
        try:
            if not self.minio_client.bucket_exists(self.bucket):
                self.minio_client.make_bucket(self.bucket)
                logger.info(f"Created bucket: {self.bucket}")
        except Exception as e:
            logger.error(f"Failed to ensure bucket {self.bucket}: {e}")
            raise
    
    def _get_session_path(
        self,
        session_id: str,
        client_name: str = "",
        app_name: str = "",
        project_name: str = ""
    ) -> str:
        """Generate session storage path."""
        path_parts = [self.prefix]
        
        if client_name:
            path_parts.append(client_name)
        if app_name:
            path_parts.append(app_name)
        if project_name:
            path_parts.append(project_name)
        
        path_parts.append("sessions")
        path_parts.append(session_id)
        path_parts.append("context.json")
        
        return "/".join(path_parts)
    
    def save_session(
        self,
        session_id: str,
        data: Dict[str, Any],
        client_name: str = "",
        app_name: str = "",
        project_name: str = ""
    ) -> bool:
        """
        Save session data to memory storage.
        Uses memory_service (with Redis cache) if available, otherwise falls back to MinIO-only.
        
        Args:
            session_id: Unique session identifier
            data: Session data to save
            client_name: Client name for context
            app_name: App name for context
            project_name: Project name for context
        
        Returns:
            True if successful, False otherwise
        """
        # Try memory_service first (includes Redis cache)
        if MEMORY_SERVICE_AVAILABLE and save_session_to_service:
            try:
                result = save_session_to_service(
                    session_id=session_id,
                    data=data,
                    metadata={
                        "client_name": client_name,
                        "app_name": app_name,
                        "project_name": project_name,
                        "updated_at": datetime.now().isoformat()
                    },
                    client_name=client_name or None,
                    app_name=app_name or None,
                    project_name=project_name or None
                )
                if result:
                    logger.info(f"Saved session {session_id} via memory_service (with Redis cache)")
                    return True
                else:
                    logger.warning(f"memory_service returned None for session {session_id}, falling back to MinIO-only")
            except Exception as e:
                logger.warning(f"Failed to save session {session_id} via memory_service: {e}, falling back to MinIO-only")
        
        # Fallback to MinIO-only storage
        try:
            object_name = self._get_session_path(session_id, client_name, app_name, project_name)
            
            payload = {
                "session_id": session_id,
                "data": data,
                "metadata": {
                    "client_name": client_name,
                    "app_name": app_name,
                    "project_name": project_name,
                    "updated_at": datetime.now().isoformat()
                }
            }
            
            json_data = json.dumps(payload, ensure_ascii=False).encode("utf-8")
            from io import BytesIO
            stream = BytesIO(json_data)
            
            self.minio_client.put_object(
                bucket_name=self.bucket,
                object_name=object_name,
                data=stream,
                length=len(json_data),
                content_type="application/json"
            )
            
            logger.info(f"Saved session {session_id} to MinIO-only storage")
            return True
            
        except Exception as e:
            logger.error(f"Failed to save session {session_id}: {e}")
            return False
    
    def load_session(
        self,
        session_id: str,
        client_name: str = "",
        app_name: str = "",
        project_name: str = ""
    ) -> Optional[Dict[str, Any]]:
        """
        Load session data from memory storage.
        Uses memory_service (with Redis cache) if available, otherwise falls back to MinIO-only.
        
        Args:
            session_id: Unique session identifier
            client_name: Client name for context
            app_name: App name for context
            project_name: Project name for context
        
        Returns:
            Session data dictionary or None if not found
        """
        # Try memory_service first (includes Redis cache)
        if MEMORY_SERVICE_AVAILABLE and load_session_from_service:
            try:
                session_data = load_session_from_service(
                    session_id=session_id,
                    client_name=client_name or None,
                    app_name=app_name or None,
                    project_name=project_name or None
                )
                if session_data:
                    logger.info(f"Loaded session {session_id} via memory_service (with Redis cache)")
                    return session_data.get("data")
                logger.debug(f"Session {session_id} not found in memory_service")
            except Exception as e:
                logger.warning(f"Failed to load session {session_id} via memory_service: {e}, falling back to MinIO-only")
        
        # Fallback to MinIO-only storage
        try:
            object_name = self._get_session_path(session_id, client_name, app_name, project_name)
            
            response = self.minio_client.get_object(bucket_name=self.bucket, object_name=object_name)
            data = response.read()
            response.close()
            response.release_conn()
            
            payload = json.loads(data.decode("utf-8"))
            logger.info(f"Loaded session {session_id} from MinIO-only storage")
            return payload.get("data")
            
        except S3Error as e:
            if e.code in {"NoSuchKey", "NoSuchObject"}:
                logger.debug(f"Session {session_id} not found in memory storage")
                return None
            logger.error(f"Failed to load session {session_id}: {e}")
            return None
        except Exception as e:
            logger.error(f"Failed to load session {session_id}: {e}")
            return None
    
    def delete_session(
        self,
        session_id: str,
        client_name: str = "",
        app_name: str = "",
        project_name: str = ""
    ) -> bool:
        """
        Delete session from memory storage.
        Uses memory_service (with Redis cache) if available, otherwise falls back to MinIO-only.
        
        Args:
            session_id: Unique session identifier
            client_name: Client name for context
            app_name: App name for context
            project_name: Project name for context
        
        Returns:
            True if successful, False otherwise
        """
        # Try memory_service first (includes Redis cache)
        if MEMORY_SERVICE_AVAILABLE and delete_session_from_service:
            try:
                delete_session_from_service(
                    session_id=session_id,
                    client_name=client_name or None,
                    app_name=app_name or None,
                    project_name=project_name or None
                )
                logger.info(f"Deleted session {session_id} via memory_service (with Redis cache)")
                return True
            except Exception as e:
                logger.warning(f"Failed to delete session {session_id} via memory_service: {e}, falling back to MinIO-only")
        
        # Fallback to MinIO-only storage
        try:
            object_name = self._get_session_path(session_id, client_name, app_name, project_name)
            self.minio_client.remove_object(self.bucket, object_name)
            logger.info(f"Deleted session {session_id} from MinIO-only storage")
            return True
            
        except S3Error as e:
            if e.code in {"NoSuchKey", "NoSuchObject"}:
                logger.debug(f"Session {session_id} not found for deletion")
                return True  # Already deleted
            logger.error(f"Failed to delete session {session_id}: {e}")
            return False
        except Exception as e:
            logger.error(f"Failed to delete session {session_id}: {e}")
            return False
    
    def list_sessions(
        self,
        client_name: str = "",
        app_name: str = "",
        project_name: str = ""
    ) -> List[str]:
        """
        List all session IDs for the given context.
        
        Args:
            client_name: Client name for context
            app_name: App name for context
            project_name: Project name for context
        
        Returns:
            List of session IDs
        """
        try:
            path_parts = [self.prefix]
            if client_name:
                path_parts.append(client_name)
            if app_name:
                path_parts.append(app_name)
            if project_name:
                path_parts.append(project_name)
            path_parts.append("sessions")
            
            prefix = "/".join(path_parts) + "/"
            
            session_ids = []
            objects = self.minio_client.list_objects(bucket_name=self.bucket, prefix=prefix, recursive=True)
            
            for obj in objects:
                if obj.object_name.endswith("context.json"):
                    # Extract session_id from path
                    parts = obj.object_name.split("/")
                    if len(parts) >= 2:
                        session_id = parts[-2]
                        if session_id not in session_ids:
                            session_ids.append(session_id)
            
            logger.info(f"Found {len(session_ids)} sessions")
            return session_ids
            
        except Exception as e:
            logger.error(f"Failed to list sessions: {e}")
            return []

