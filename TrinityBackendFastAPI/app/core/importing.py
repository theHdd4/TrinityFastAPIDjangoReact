"""Utility helpers for dynamic import operations used across the task queue."""

from __future__ import annotations

from importlib import import_module


def import_callable(dotted_path: str):
    """Import a dotted-path callable and return it.

    This helper is shared between the Celery task submission helpers and the
    worker runtime so that importing the module does not trigger any circular
    dependencies during application start-up.
    """

    module_path, _, attribute = dotted_path.rpartition(".")
    if not module_path:
        raise ImportError(f"Invalid callable path: {dotted_path}")

    module = import_module(module_path)

    try:
        return getattr(module, attribute)
    except AttributeError as exc:  # pragma: no cover - defensive
        raise ImportError(
            f"Callable '{attribute}' not found in '{module_path}'"
        ) from exc


__all__ = ["import_callable"]
