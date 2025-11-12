"""Celery tasks dedicated to cache management."""
from __future__ import annotations

import asyncio
import logging
from typing import Dict

from app.celery_app import celery_app
from app.core.feature_cache import FeatureCacheNamespace, feature_cache
from app.core.task_tracking import (
    record_task_failure,
    record_task_progress,
    record_task_started,
    record_task_success,
)
from app.core.utils import get_env_vars

logger = logging.getLogger("app.core.cache_tasks")


def _cache_proxy(feature: str, namespace: FeatureCacheNamespace = FeatureCacheNamespace.ENVIRONMENT):
    router = feature_cache.router("project_state")
    if namespace == FeatureCacheNamespace.ENVIRONMENT:
        return router.environment(feature)
    return router.for_feature(namespace, feature)


@celery_app.task(name="cache.warm_environment", bind=True)
def warm_environment(
    self,
    client_id: str,
    app_id: str,
    project_id: str,
    *,
    client_name: str = "",
    app_name: str = "",
    project_name: str = "",
) -> Dict[str, Any]:
    record_task_started(self.request.id)
    record_task_progress(self.request.id, message="Loading environment metadata")
    try:
        env = asyncio.run(
            get_env_vars(
                client_id,
                app_id,
                project_id,
                client_name=client_name,
                app_name=app_name,
                project_name=project_name,
                use_cache=True,
                return_source=True,
            )
        )
    except Exception as exc:  # pragma: no cover - defensive logging
        logger.exception("cache.warm_environment failed")
        record_task_failure(self.request.id, error=str(exc))
        raise
    env_payload, source = env if isinstance(env, tuple) else (env, "unknown")
    proxy = _cache_proxy("environment")
    proxy.set_json((client_id, app_id, project_id), env_payload)
    payload = {"source": source, "keys": list(env_payload.keys())}
    record_task_success(self.request.id, result=payload)
    return payload


@celery_app.task(name="cache.invalidate_feature", bind=True)
def invalidate_feature_cache(
    self,
    feature: str,
    *,
    namespace: str = FeatureCacheNamespace.ATOM.value,
) -> Dict[str, Any]:
    record_task_started(self.request.id)
    record_task_progress(self.request.id, message="Invalidating feature cache")
    try:
        proxy = _cache_proxy(feature, FeatureCacheNamespace(namespace))
        deleted = proxy.invalidate_all()
    except Exception as exc:  # pragma: no cover
        logger.exception("cache.invalidate_feature failed")
        record_task_failure(self.request.id, error=str(exc))
        raise
    payload = {"feature": feature, "namespace": namespace, "deleted": deleted}
    record_task_success(self.request.id, result=payload)
    return payload


__all__ = ["warm_environment", "invalidate_feature_cache"]
