from __future__ import annotations

from typing import Any, Dict, Iterable, Optional, Sequence, Tuple

from app.core.task_queue import CeleryTaskClient, TaskSubmission, celery_task_client


def _submit(
    *,
    client: CeleryTaskClient,
    name: str,
    dotted_path: str,
    args: Optional[Iterable[Any]] = None,
    kwargs: Optional[Dict[str, Any]] = None,
    metadata: Optional[Dict[str, Any]] = None,
) -> TaskSubmission:
    return client.submit_callable(
        name=name,
        dotted_path=dotted_path,
        args=args,
        kwargs=kwargs,
        metadata=metadata,
    )


def submit_perform_createcolumn(
    *,
    bucket_name: str,
    object_name: str,
    object_prefix: str,
    identifiers: Optional[str],
    form_items: Sequence[Tuple[str, str]],
    client_name: str,
    app_name: str,
    project_name: str,
    client: CeleryTaskClient = celery_task_client,
) -> TaskSubmission:
    return _submit(
        client=client,
        name="createcolumn.perform",
        dotted_path="app.features.createcolumn.service.perform_createcolumn_task",
        kwargs={
            "bucket_name": bucket_name,
            "object_name": object_name,
            "object_prefix": object_prefix,
            "identifiers": identifiers,
            "form_items": form_items,
            "client_name": client_name,
            "app_name": app_name,
            "project_name": project_name,
        },
        metadata={
            "atom": "createcolumn",
            "operation": "perform",
            "object_name": object_name,
            "bucket": bucket_name,
        },
    )


def submit_save_dataframe(
    *,
    csv_data: str,
    filename: str,
    object_prefix: str,
    overwrite_original: bool,
    client_name: Optional[str],
    app_name: Optional[str],
    project_name: Optional[str],
    user_id: Optional[str],
    project_id: Optional[int],
    operation_details: Optional[str],
    client: CeleryTaskClient = celery_task_client,
) -> TaskSubmission:
    return _submit(
        client=client,
        name="createcolumn.save",
        dotted_path="app.features.createcolumn.service.save_dataframe_task",
        kwargs={
            "csv_data": csv_data,
            "filename": filename,
            "object_prefix": object_prefix,
            "overwrite_original": overwrite_original,
            "client_name": client_name,
            "app_name": app_name,
            "project_name": project_name,
            "user_id": user_id,
            "project_id": project_id,
            "operation_details": operation_details,
        },
        metadata={
            "atom": "createcolumn",
            "operation": "save",
            "filename": filename,
            "overwrite_original": overwrite_original,
        },
    )


def submit_cached_dataframe(
    *,
    object_name: str,
    page: int,
    page_size: int,
    client: CeleryTaskClient = celery_task_client,
) -> TaskSubmission:
    return _submit(
        client=client,
        name="createcolumn.cached_dataframe",
        dotted_path="app.features.createcolumn.service.cached_dataframe_task",
        kwargs={
            "object_name": object_name,
            "page": page,
            "page_size": page_size,
        },
        metadata={
            "atom": "createcolumn",
            "operation": "cached_dataframe",
            "object_name": object_name,
            "page": page,
            "page_size": page_size,
        },
    )


def submit_classification(
    *,
    validator_atom_id: str,
    file_key: str,
    client: CeleryTaskClient = celery_task_client,
) -> TaskSubmission:
    return _submit(
        client=client,
        name="createcolumn.classification",
        dotted_path="app.features.createcolumn.service.classification_task",
        kwargs={
            "validator_atom_id": validator_atom_id,
            "file_key": file_key,
        },
        metadata={
            "atom": "createcolumn",
            "operation": "classification",
            "validator_atom_id": validator_atom_id,
            "file_key": file_key,
        },
    )


def submit_cardinality(
    *,
    bucket_name: str,
    object_name: str,
    client: CeleryTaskClient = celery_task_client,
) -> TaskSubmission:
    return _submit(
        client=client,
        name="createcolumn.cardinality",
        dotted_path="app.features.createcolumn.service.cardinality_task",
        kwargs={
            "bucket_name": bucket_name,
            "object_name": object_name,
        },
        metadata={
            "atom": "createcolumn",
            "operation": "cardinality",
            "object_name": object_name,
        },
    )


__all__ = [
    "submit_perform_createcolumn",
    "submit_save_dataframe",
    "submit_cached_dataframe",
    "submit_classification",
    "submit_cardinality",
]
