"""
Task service for cardinality-view feature
Handles Celery task submission and management
"""
from typing import Optional

from app.core.task_queue import TaskSubmission, celery_task_client

from .deps import MINIO_BUCKET


def submit_unified_cardinality_task(
    *, 
    bucket_name: str, 
    object_name: str,
    client_name: Optional[str] = None,
    app_name: Optional[str] = None,
    project_name: Optional[str] = None,
) -> TaskSubmission:
    """
    Submit unified cardinality task with metadata support
    
    Args:
        bucket_name: MinIO bucket name
        object_name: File path/name
        client_name: Client name for metadata lookup
        app_name: App name for metadata lookup
        project_name: Project name for metadata lookup
        
    Returns:
        TaskSubmission object with task details
    """
    kwargs = {
        "bucket_name": bucket_name,
        "object_name": object_name,
    }
    
    # Add metadata parameters if provided
    if client_name:
        kwargs["client_name"] = client_name
    if app_name:
        kwargs["app_name"] = app_name
    if project_name:
        kwargs["project_name"] = project_name
    
    return celery_task_client.submit_callable(
        name="cardinality_view.unified_cardinality",
        dotted_path="app.features.cardinality_view.service.unified_cardinality_task",
        kwargs=kwargs,
        metadata={
            "atom": "cardinality_view",
            "operation": "unified_cardinality",
            "object_name": object_name,
        },
    )


__all__ = [
    "submit_unified_cardinality_task"
]