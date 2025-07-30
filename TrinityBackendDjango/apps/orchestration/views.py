from rest_framework import viewsets, permissions, status
from rest_framework.decorators import action
from rest_framework.response import Response
from .models import EngineRegistry, TaskRun
from .serializers import EngineRegistrySerializer, TaskRunSerializer
from .tasks import execute_task

class EngineRegistryViewSet(viewsets.ModelViewSet):
    queryset = EngineRegistry.objects.all()
    serializer_class = EngineRegistrySerializer
    permission_classes = [permissions.IsAuthenticated]

    def get_permissions(self):
        # only admins may create/update/delete engines
        if self.action in ("create","update","partial_update","destroy"):
            return [permissions.IsAdminUser()]
        return super().get_permissions()

class TaskRunViewSet(viewsets.ModelViewSet):
    queryset = TaskRun.objects.select_related("engine").all()
    serializer_class = TaskRunSerializer
    permission_classes = [permissions.IsAuthenticated]

    def create(self, request, *args, **kwargs):
        # enqueue a new TaskRun
        serializer = self.get_serializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        task_run = serializer.save()  # status="pending"
        execute_task.delay(task_run.id)
        return Response(TaskRunSerializer(task_run).data, status=status.HTTP_201_CREATED)

    @action(detail=True, methods=["post"], permission_classes=[permissions.IsAdminUser])
    def retry(self, request, pk=None):
        tr = self.get_object()
        if tr.status != TaskRun.STATUS_FAILURE:
            return Response({"detail":"Can only retry failures."}, status=status.HTTP_400_BAD_REQUEST)
        tr.status = TaskRun.STATUS_PENDING
        tr.error = ""
        tr.output = None
        tr.save(update_fields=["status","error","output","updated_at"])
        execute_task.delay(tr.id)
        return Response(TaskRunSerializer(tr).data)
