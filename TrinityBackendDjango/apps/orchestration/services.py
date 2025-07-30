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
    def run_task(task_run: TaskRun):
        engine = OrchestratorService.select_engine()
        task_run.engine = engine
        task_run.status = TaskRun.STATUS_RUNNING
        task_run.save(update_fields=["engine", "status", "updated_at"])

        url = f"{engine.base_url.rstrip('/')}{engine.run_endpoint}"
        payload = {
            "atom_slug": task_run.atom_slug,
            "config": task_run.input.get("config"),
            "data": task_run.input.get("data"),
        }

        try:
            resp = requests.post(url, json=payload, timeout=60)
            resp.raise_for_status()
            result = resp.json()
            task_run.output = result
            task_run.status = TaskRun.STATUS_SUCCESS
        except Exception as e:
            logger.exception("TaskRun %s failed", task_run.id)
            task_run.error = str(e)
            task_run.status = TaskRun.STATUS_FAILURE
        finally:
            task_run.updated_at = timezone.now()
            task_run.save(update_fields=["output", "error", "status", "updated_at"])
