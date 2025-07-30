from config.celery import celery_app
from .models import TaskRun
from .services import OrchestratorService

@celery_app.task
def execute_task(task_run_id: int):
    task_run = TaskRun.objects.get(id=task_run_id)
    OrchestratorService.run_task(task_run)
