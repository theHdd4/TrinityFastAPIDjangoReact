from __future__ import annotations

"""Lightweight helpers to submit Unpivot tasks to the Celery queue.

These helpers allow routes to delegate heavy unpivot computation to workers
while keeping submission metadata consistent.
"""

from typing import Any, Dict, Optional

from app.core.task_queue import TaskSubmission, celery_task_client


def submit_compute_task(
    *,
    atom_id: str,
    force_recompute: bool = False,
    preview_limit: Optional[int] = None,
) -> TaskSubmission:
    """Submit an unpivot computation task to Celery."""
    kwargs: Dict[str, Any] = {
        "atom_id": atom_id,
        "force_recompute": force_recompute,
    }
    if preview_limit is not None:
        kwargs["preview_limit"] = preview_limit
    
    return celery_task_client.submit_callable(
        name="unpivot.compute",
        dotted_path="app.features.unpivot.unpivot_service.compute_unpivot_task",
        kwargs=kwargs,
        metadata={
            "atom": "unpivot",
            "operation": "compute",
            "atom_id": atom_id,
            "force_recompute": force_recompute,
            "preview_limit": preview_limit,
        },
    )


def submit_save_task(
    *,
    atom_id: str,
    format: str = "arrow",
    filename: Optional[str] = None,
) -> TaskSubmission:
    """Submit an unpivot save task to Celery."""
    kwargs: Dict[str, Any] = {
        "atom_id": atom_id,
        "format": format,
    }
    if filename is not None:
        kwargs["filename"] = filename
    
    return celery_task_client.submit_callable(
        name="unpivot.save",
        dotted_path="app.features.unpivot.unpivot_service.save_unpivot_result_task",
        kwargs=kwargs,
        metadata={
            "atom": "unpivot",
            "operation": "save",
            "atom_id": atom_id,
            "format": format,
            "filename": filename,
        },
    )


__all__ = [
    "submit_compute_task",
    "submit_save_task",
]

