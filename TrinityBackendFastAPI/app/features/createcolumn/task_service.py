from __future__ import annotations

"""Lightweight helpers to submit Create/Transform tasks to the Celery queue.

These helpers mirror the dataframe_operations service layer so routes can
delegate heavy work to workers while keeping submission metadata consistent.
"""

from typing import Any, Sequence, Tuple

from app.core.task_queue import TaskSubmission, celery_task_client


def submit_perform_task(
    *,
    bucket_name: str,
    object_name: str,
    object_prefix: str,
    identifiers: str | None,
    form_items: Sequence[Tuple[str, str]],
    client_name: str,
    app_name: str,
    project_name: str,
) -> TaskSubmission:
    return celery_task_client.submit_callable(
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


def submit_results_task(
    *, bucket_name: str, object_name: str, object_prefix: str
) -> TaskSubmission:
    return celery_task_client.submit_callable(
        name="createcolumn.results",
        dotted_path="app.features.createcolumn.service.fetch_create_results_task",
        kwargs={
            "bucket_name": bucket_name,
            "object_name": object_name,
            "object_prefix": object_prefix,
        },
        metadata={
            "atom": "createcolumn",
            "operation": "results",
            "object_name": object_name,
            "bucket": bucket_name,
        },
    )


def submit_save_task(
    *,
    csv_data: str,
    filename: str,
    object_prefix: str,
    overwrite_original: bool,
    client_name: str | None,
    app_name: str | None,
    project_name: str | None,
    user_id: str | None,
    project_id: int | None,
    operation_details: Any,
) -> TaskSubmission:
    return celery_task_client.submit_callable(
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


def submit_cached_dataframe_task(
    *, object_name: str, page: int, page_size: int
) -> TaskSubmission:
    return celery_task_client.submit_callable(
        name="createcolumn.cached_dataframe",
        dotted_path="app.features.createcolumn.service.cached_dataframe_task",
        kwargs={"object_name": object_name, "page": page, "page_size": page_size},
        metadata={
            "atom": "createcolumn",
            "operation": "cached_dataframe",
            "object_name": object_name,
            "page": page,
            "page_size": page_size,
        },
    )


def submit_classification_task(
    *, validator_atom_id: str, file_key: str
) -> TaskSubmission:
    return celery_task_client.submit_callable(
        name="createcolumn.classification",
        dotted_path="app.features.createcolumn.service.classification_task",
        kwargs={"validator_atom_id": validator_atom_id, "file_key": file_key},
        metadata={
            "atom": "createcolumn",
            "operation": "classification",
            "validator_atom_id": validator_atom_id,
            "file_key": file_key,
        },
    )


def submit_cardinality_task(*, bucket_name: str, object_name: str) -> TaskSubmission:
    return celery_task_client.submit_callable(
        name="createcolumn.cardinality",
        dotted_path="app.features.createcolumn.service.cardinality_task",
        kwargs={"bucket_name": bucket_name, "object_name": object_name},
        metadata={
            "atom": "createcolumn",
            "operation": "cardinality",
            "object_name": object_name,
        },
    )


__all__ = [
    "submit_perform_task",
    "submit_results_task",
    "submit_save_task",
    "submit_cached_dataframe_task",
    "submit_classification_task",
    "submit_cardinality_task",
]
