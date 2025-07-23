from rest_framework import viewsets, permissions
from rest_framework.response import Response
import os
from apps.accounts.views import CsrfExemptSessionAuthentication
from apps.accounts.utils import save_env_var, get_env_dict
from .models import App, Project, Session, LaboratoryAction, ArrowDataset
from .serializers import (
    AppSerializer,
    ProjectSerializer,
    SessionSerializer,
    LaboratoryActionSerializer,
    ArrowDatasetSerializer,
)


class AppViewSet(viewsets.ModelViewSet):
    """
    CRUD for App templates.
    Admin-only for writes; read-only for all authenticated users.
    """
    queryset = App.objects.all()
    serializer_class = AppSerializer
    permission_classes = [permissions.IsAuthenticated]
    authentication_classes = [CsrfExemptSessionAuthentication]

    def get_permissions(self):
        if self.action in ("create", "update", "partial_update", "destroy"):
            return [permissions.IsAdminUser()]
        return super().get_permissions()

    def retrieve(self, request, *args, **kwargs):
        app_obj = self.get_object()
        os.environ["APP_NAME"] = app_obj.slug
        print(f"✅ app selected: APP_NAME={os.environ['APP_NAME']}")
        save_env_var(request.user, "APP_NAME", os.environ.get("APP_NAME", ""))
        serializer = self.get_serializer(app_obj)
        data = serializer.data
        data["environment"] = get_env_dict(request.user)
        return Response(data)


class ProjectViewSet(viewsets.ModelViewSet):
    """
    CRUD for Projects.
    Admins and owners may create; owners may update/delete their own.
    """
    queryset = Project.objects.select_related("owner", "app").all()
    serializer_class = ProjectSerializer
    permission_classes = [permissions.IsAuthenticated]
    authentication_classes = [CsrfExemptSessionAuthentication]

    def get_queryset(self):
        user = self.request.user
        qs = self.queryset

        # Restrict to projects owned by the user unless admin
        if not user.is_staff:
            qs = qs.filter(owner=user)

        # Optional filtering by app via query parameter
        app_param = self.request.query_params.get("app")
        if app_param:
            if app_param.isdigit():
                qs = qs.filter(app__id=app_param)
            else:
                qs = qs.filter(app__slug=app_param)

        return qs

    def perform_create(self, serializer):
        serializer.save(owner=self.request.user)

    def retrieve(self, request, *args, **kwargs):
        project_obj = self.get_object()
        os.environ["PROJECT_NAME"] = project_obj.slug
        os.environ["PROJECT_ID"] = str(project_obj.id)
        print(
            f"✅ project selected: PROJECT_ID={os.environ['PROJECT_ID']} PROJECT_NAME={os.environ['PROJECT_NAME']}"
        )
        save_env_var(request.user, "PROJECT_NAME", os.environ.get("PROJECT_NAME", ""))
        save_env_var(request.user, "PROJECT_ID", os.environ.get("PROJECT_ID", ""))
        serializer = self.get_serializer(project_obj)
        data = serializer.data
        data["environment"] = get_env_dict(request.user)
        return Response(data)


class SessionViewSet(viewsets.ModelViewSet):
    """
    CRUD for Sessions.
    Users can list/create their own; admins can view all.
    """
    queryset = Session.objects.select_related("project", "user").all()
    serializer_class = SessionSerializer
    permission_classes = [permissions.IsAuthenticated]
    authentication_classes = [CsrfExemptSessionAuthentication]

    def get_queryset(self):
        user = self.request.user
        if user.is_staff:
            return self.queryset
        return self.queryset.filter(user=user)

    def perform_create(self, serializer):
        serializer.save(user=self.request.user)


class LaboratoryActionViewSet(viewsets.ModelViewSet):
    """Create and list undo snapshots."""

    queryset = LaboratoryAction.objects.select_related("project", "user").all()
    serializer_class = LaboratoryActionSerializer
    permission_classes = [permissions.IsAuthenticated]
    authentication_classes = [CsrfExemptSessionAuthentication]

    def get_queryset(self):
        user = self.request.user
        qs = self.queryset.filter(user=user)
        project_param = self.request.query_params.get("project")
        if project_param:
            qs = qs.filter(project__id=project_param)
        return qs

    def perform_create(self, serializer):
        serializer.save(user=self.request.user)

class ArrowDatasetViewSet(viewsets.ModelViewSet):
    """CRUD for stored Arrow datasets."""

    queryset = ArrowDataset.objects.all()
    serializer_class = ArrowDatasetSerializer
    permission_classes = [permissions.IsAuthenticated]
    authentication_classes = [CsrfExemptSessionAuthentication]

    def get_queryset(self):
        qs = self.queryset
        atom = self.request.query_params.get("atom_id")
        if atom:
            qs = qs.filter(atom_id=atom)
        project = self.request.query_params.get("project")
        if project:
            qs = qs.filter(project_id=project)
        return qs
