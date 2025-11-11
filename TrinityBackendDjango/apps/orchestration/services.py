import logging
import requests
from django.utils import timezone
from .models import EngineRegistry, TaskRun

logger = logging.getLogger(__name__)

class OrchestratorService:
    @staticmethod
    def select_engine() -> EngineRegistry:
        engines = EngineRegistry.objects.filter(is_active=True)
        if not engines:
            raise RuntimeError("No active compute engines")
        return engines.first()  # or implement round-robin / load-aware logic

    @staticmethod
    def _build_payload(task_run: TaskRun) -> dict:
        input_payload = task_run.input or {}
        return {
            "atom_slug": task_run.atom_slug,
            "config": input_payload.get("config"),
            "data": input_payload.get("data"),
        }

    @staticmethod
    def run_task(
        task_run: TaskRun,
        *,
        engine: EngineRegistry | None = None,
        persist: bool = True,
        timeout: int = 60,
    ) -> dict:
        """Dispatch a ``TaskRun`` to a compute engine.

        When ``persist`` is ``False`` the database is not mutated and the caller
        receives a dictionary describing the execution result so it can be
        persisted asynchronously.
        """

        engine = engine or OrchestratorService.select_engine()
        now = timezone.now()

        if persist:
            task_run.engine = engine
            task_run.status = TaskRun.STATUS_RUNNING
            task_run.error = ""
            task_run.updated_at = now
            task_run.save(update_fields=["engine", "status", "error", "updated_at"])

        url = f"{engine.base_url.rstrip('/')}{engine.run_endpoint}"
        payload = OrchestratorService._build_payload(task_run)

        status = TaskRun.STATUS_RUNNING
        output = task_run.output
        error = ""

        try:
            resp = requests.post(url, json=payload, timeout=timeout)
            resp.raise_for_status()
            output = resp.json()
            status = TaskRun.STATUS_SUCCESS
        except Exception as exc:  # pragma: no cover - network failures are runtime dependant
            logger.exception("TaskRun %s failed", task_run.id)
            error = str(exc)
            status = TaskRun.STATUS_FAILURE
        finally:
            if persist:
                task_run.output = output
                task_run.error = error
                task_run.status = status
                task_run.updated_at = timezone.now()
                task_run.save(update_fields=["output", "error", "status", "updated_at"])

        return {
            "engine_id": engine.id if engine else None,
            "status": status,
            "output": output,
            "error": error,
            "dispatched_at": now.isoformat(),
        }
