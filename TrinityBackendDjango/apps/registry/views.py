from rest_framework import viewsets, permissions
from apps.accounts.views import CsrfExemptSessionAuthentication
from .models import App, Project, Session, LaboratoryAction, ArrowDataset
from .serializers import (
    AppSerializer,
    ProjectSerializer,
    SessionSerializer,
    LaboratoryActionSerializer,
    ArrowDatasetSerializer,
)
from .storage_utils import (
    rename_prefix,
    delete_prefix,
    project_prefix,
    ensure_prefix,
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
        prefix = project_prefix(serializer.instance.owner_id, serializer.instance.id)
        try:
            ensure_prefix(prefix)
        except Exception:
            pass

    def perform_update(self, serializer):
        instance = self.get_object()
        old_name = instance.name
        user_id = instance.owner_id
        project_id = instance.id
        old_prefix = project_prefix(user_id, project_id)
        serializer.save()
        new_name = serializer.instance.name
        if old_name != new_name:
            serializer.instance.previous_name = old_name
            serializer.instance.save(update_fields=["previous_name"])
            new_prefix = project_prefix(user_id, project_id)
            try:
                rename_prefix(old_prefix, new_prefix)
            except Exception:
                pass

    def perform_destroy(self, instance):
        instance.previous_name = instance.name
        instance.save(update_fields=["previous_name"])
        prefix = project_prefix(instance.owner_id, instance.id)
        try:
            delete_prefix(prefix)
        except Exception:
            pass
        super().perform_destroy(instance)


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
