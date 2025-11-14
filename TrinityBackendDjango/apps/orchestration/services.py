import logging
from dataclasses import dataclass
from typing import Any, Dict

import requests

from .models import EngineRegistry, TaskRun

logger = logging.getLogger(__name__)


class EngineExecutionError(Exception):
    """Represents a failure while invoking a compute engine."""

    def __init__(self, message: str, *, engine: EngineRegistry | None = None) -> None:
        super().__init__(message)
        self.engine = engine


@dataclass(slots=True)
class EngineExecutionResult:
    engine: EngineRegistry
    payload: Dict[str, Any]


class OrchestratorService:
    @staticmethod
    def select_engine() -> EngineRegistry:
        engines = EngineRegistry.objects.filter(is_active=True)
        if not engines:
            raise RuntimeError("No active compute engines")
        return engines.first()  # or implement round-robin / load-aware logic

    @staticmethod
    def run_task(task_run: TaskRun) -> EngineExecutionResult:
        engine = OrchestratorService.select_engine()
        url = f"{engine.base_url.rstrip('/')}{engine.run_endpoint}"
        payload = {
            "atom_slug": task_run.atom_slug,
            "config": task_run.input.get("config"),
            "data": task_run.input.get("data"),
        }

        try:
            resp = requests.post(url, json=payload, timeout=60)
            resp.raise_for_status()
        except requests.RequestException as exc:
            logger.exception("TaskRun %s failed to reach engine", task_run.id)
            raise EngineExecutionError(str(exc), engine=engine) from exc

        try:
            result = resp.json()
        except ValueError as exc:
            logger.exception("TaskRun %s returned invalid JSON", task_run.id)
            raise EngineExecutionError("Engine response was not valid JSON", engine=engine) from exc

        return EngineExecutionResult(engine=engine, payload=result)
