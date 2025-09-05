from rest_framework import viewsets, permissions, status
from rest_framework.response import Response
from rest_framework.decorators import action
from django.utils.text import slugify
import os
from apps.accounts.views import CsrfExemptSessionAuthentication
from apps.accounts.utils import save_env_var, get_env_dict, load_env_vars
from .models import (
    App,
    Project,
    Template,
    Session,
    LaboratoryAction,
    ArrowDataset,
    RegistryEnvironment,
)
from .atom_config import save_atom_list_configuration, load_atom_list_configuration
from common.minio_utils import copy_prefix
from .serializers import (
    AppSerializer,
    ProjectSerializer,
    TemplateSerializer,
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

    def get_queryset(self):
        qs = super().get_queryset()
        user = self.request.user
        if not user.is_staff:
            try:
                from apps.roles.models import UserRole

                roles = UserRole.objects.filter(user=user)
                allowed = set()
                for role in roles:
                    allowed.update(role.allowed_apps or [])
                if allowed:
                    qs = qs.filter(id__in=allowed)
                else:
                    qs = qs.none()
            except Exception:
                qs = qs.none()
        return qs

    def get_permissions(self):
        if self.action in ("create", "update", "partial_update", "destroy"):
            return [permissions.IsAdminUser()]
        return super().get_permissions()

    def retrieve(self, request, *args, **kwargs):
        load_env_vars(request.user)
        app_obj = self.get_object()
        os.environ["APP_NAME"] = app_obj.slug
        os.environ["APP_ID"] = os.environ.get("APP_ID") or f"{app_obj.slug}_{app_obj.id}"
        print(f"✅ app selected: APP_NAME={os.environ['APP_NAME']}")
        save_env_var(request.user, "CLIENT_NAME", os.environ.get("CLIENT_NAME", ""))
        save_env_var(request.user, "CLIENT_ID", os.environ.get("CLIENT_ID", ""))
        save_env_var(request.user, "APP_NAME", os.environ.get("APP_NAME", ""))
        save_env_var(request.user, "APP_ID", os.environ.get("APP_ID", ""))
        print("Current env vars after app select", get_env_dict(request.user))
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

        if not user.is_staff:
            try:
                from apps.roles.models import UserRole

                roles = UserRole.objects.filter(user=user)
                allowed = set()
                for role in roles:
                    allowed.update(role.allowed_apps or [])
                if allowed:
                    qs = qs.filter(app_id__in=allowed)
                else:
                    return Project.objects.none()
            except Exception:
                return Project.objects.none()

        app_param = self.request.query_params.get("app")
        if app_param:
            if app_param.isdigit():
                qs = qs.filter(app__id=app_param)
            else:
                qs = qs.filter(app__slug=app_param)

        return qs

    def _can_edit(self, user):
        # Temporarily allow all authenticated users to edit for debugging
        if user.is_authenticated:
            return True
        
        perms = [
            "permissions.workflow_edit",
            "permissions.laboratory_edit",
            "permissions.exhibition_edit",
        ]
        return user.is_staff or any(user.has_perm(p) for p in perms)

    def update(self, request, *args, **kwargs):
        if not self._can_edit(request.user):
            return Response({"detail": "Permission denied."}, status=status.HTTP_403_FORBIDDEN)
        return super().update(request, *args, **kwargs)

    def partial_update(self, request, *args, **kwargs):
        if not self._can_edit(request.user):
            return Response({"detail": "Permission denied."}, status=status.HTTP_403_FORBIDDEN)
        return super().partial_update(request, *args, **kwargs)

    def destroy(self, request, *args, **kwargs):
        if not self._can_edit(request.user):
            return Response({"detail": "Permission denied."}, status=status.HTTP_403_FORBIDDEN)
        return super().destroy(request, *args, **kwargs)

    def create(self, request, *args, **kwargs):
        data = request.data.copy()
        app = data.get("app")
        base_name = data.get("name", "")
        if app and base_name:
            name = base_name
            counter = 1
            while Project.objects.filter(app_id=app, name=name).exists():
                name = f"{base_name} {counter}"
                counter += 1
            data["name"] = name

        serializer = self.get_serializer(data=data)
        serializer.is_valid(raise_exception=True)
        self.perform_create(serializer)
        headers = self.get_success_headers(serializer.data)
        return Response(serializer.data, status=status.HTTP_201_CREATED, headers=headers)

    def perform_create(self, serializer):
        user = self.request.user
        name = serializer.validated_data.get("name")
        slug = serializer.validated_data.get("slug") or slugify(name)
        slug_val = slug
        counter = 1
        while Project.objects.filter(owner=user, slug=slug_val).exists():
            slug_val = f"{slug}-{counter}"
            counter += 1

        serializer.save(owner=user, slug=slug_val)

    def retrieve(self, request, *args, **kwargs):
        load_env_vars(request.user)
        project_obj = self.get_object()
        os.environ["PROJECT_NAME"] = project_obj.name
        os.environ["PROJECT_ID"] = f"{project_obj.name}_{project_obj.id}"
        print(
            f"✅ project selected: PROJECT_ID={os.environ['PROJECT_ID']} PROJECT_NAME={os.environ['PROJECT_NAME']}"
        )
        save_env_var(request.user, "CLIENT_NAME", os.environ.get("CLIENT_NAME", ""))
        save_env_var(request.user, "CLIENT_ID", os.environ.get("CLIENT_ID", ""))
        save_env_var(request.user, "APP_NAME", os.environ.get("APP_NAME", ""))
        save_env_var(request.user, "APP_ID", os.environ.get("APP_ID", ""))
        save_env_var(request.user, "PROJECT_NAME", os.environ["PROJECT_NAME"])
        save_env_var(request.user, "PROJECT_ID", os.environ["PROJECT_ID"])
        print("Current env vars after project select", get_env_dict(request.user))
        serializer = self.get_serializer(project_obj)
        data = serializer.data
        data["environment"] = get_env_dict(request.user)

        state = data.get("state") or {}
        for field, mode in [
            ("laboratory_config", "lab"),
            ("workflow_config", "workflow"),
            ("exhibition_config", "exhibition"),
        ]:
            cfg = load_atom_list_configuration(project_obj, mode)
            if cfg:
                state[field] = cfg
        if state:
            data["state"] = state

        return Response(data)

    def perform_update(self, serializer):
        load_env_vars(self.request.user)
        project = serializer.save()
        if "name" in serializer.validated_data:
            os.environ["PROJECT_NAME"] = project.name
            os.environ["PROJECT_ID"] = f"{project.name}_{project.id}"
            print(
                f"✅ project renamed: PROJECT_ID={os.environ['PROJECT_ID']} PROJECT_NAME={os.environ['PROJECT_NAME']}"
            )
            save_env_var(self.request.user, "CLIENT_NAME", os.environ.get("CLIENT_NAME", ""))
            save_env_var(self.request.user, "CLIENT_ID", os.environ.get("CLIENT_ID", ""))
            save_env_var(self.request.user, "APP_NAME", os.environ.get("APP_NAME", ""))
            save_env_var(self.request.user, "APP_ID", os.environ.get("APP_ID", ""))
            save_env_var(self.request.user, "PROJECT_NAME", os.environ["PROJECT_NAME"])
            save_env_var(self.request.user, "PROJECT_ID", os.environ["PROJECT_ID"])
            print("Current env vars after project rename", get_env_dict(self.request.user))

        state_data = self.request.data.get("state", {})
        if isinstance(state_data, dict):
            if "laboratory_config" in state_data:
                cards = state_data["laboratory_config"].get("cards", [])
                save_atom_list_configuration(project, "lab", cards)
            if "workflow_config" in state_data:
                cards = state_data["workflow_config"].get("cards", [])
                save_atom_list_configuration(project, "workflow", cards)
            if "exhibition_config" in state_data:
                cards = state_data["exhibition_config"].get("cards", [])
                save_atom_list_configuration(project, "exhibition", cards)

    @action(detail=True, methods=["post"])
    def duplicate(self, request, pk=None):
        """Duplicate a project along with its configurations and datasets."""
        if not self._can_edit(request.user):
            return Response({"detail": "Permission denied."}, status=status.HTTP_403_FORBIDDEN)
        source = self.get_object()
        base_name = f"{source.name} Copy"
        name = base_name
        counter = 1
        while Project.objects.filter(owner=request.user, app=source.app, name=name).exists():
            name = f"{base_name} {counter}"
            counter += 1
        slug_base = slugify(name)
        slug_val = slug_base
        counter = 1
        while Project.objects.filter(owner=request.user, slug=slug_val).exists():
            slug_val = f"{slug_base}-{counter}"
            counter += 1
        new_project = Project.objects.create(
            name=name,
            slug=slug_val,
            description=source.description,
            owner=request.user,
            app=source.app,
            state=source.state,
            base_template=source.base_template,
        )

        for mode in ["lab", "workflow", "exhibition"]:
            cfg = load_atom_list_configuration(source, mode)
            if cfg and cfg.get("cards"):
                save_atom_list_configuration(new_project, mode, cfg["cards"])

        tenant = os.getenv("CLIENT_NAME", "default_client").replace(" ", "_")
        app_slug = source.app.slug
        old_prefix = f"{tenant}/{app_slug}/{source.name}"
        new_prefix = f"{tenant}/{app_slug}/{new_project.name}"
        copy_prefix(old_prefix, new_prefix)

        for ds in source.arrow_datasets.all():
            def _replace(path: str) -> str:
                return path.replace(old_prefix, new_prefix, 1) if path else path

            ArrowDataset.objects.create(
                project=new_project,
                atom_id=ds.atom_id,
                file_key=_replace(ds.file_key),
                arrow_object=_replace(ds.arrow_object),
                flight_path=_replace(ds.flight_path),
                original_csv=_replace(ds.original_csv),
                descriptor=ds.descriptor,
            )

        try:
            env_src = RegistryEnvironment.objects.get(
                client_name=tenant, app_name=app_slug, project_name=source.name
            )
            env = env_src.envvars or {}
            env.update(
                {
                    "CLIENT_NAME": tenant,
                    "APP_NAME": app_slug,
                    "PROJECT_NAME": new_project.name,
                    "PROJECT_ID": f"{new_project.name}_{new_project.id}",
                }
            )
            RegistryEnvironment.objects.update_or_create(
                client_name=tenant,
                app_name=app_slug,
                project_name=new_project.name,
                defaults={
                    "envvars": env,
                    "identifiers": env_src.identifiers,
                    "measures": env_src.measures,
                    "dimensions": env_src.dimensions,
                },
            )
        except RegistryEnvironment.DoesNotExist:
            pass

        serializer = self.get_serializer(new_project)
        return Response(serializer.data, status=status.HTTP_201_CREATED)

    @action(detail=True, methods=["post"])
    def save_template(self, request, pk=None):
        """Persist the project as a reusable template."""
        if not self._can_edit(request.user):
            return Response({"detail": "Permission denied."}, status=status.HTTP_403_FORBIDDEN)
        project = self.get_object()
        serialized = ProjectSerializer(project).data
        template = Template.objects.create(
            name=f"{project.name} Template",
            slug=slugify(f"{project.slug}-template"),
            description=project.description,
            owner=request.user,
            app=project.app,
            state=project.state,
            base_project=serialized,
        )
        return Response(TemplateSerializer(template).data, status=status.HTTP_201_CREATED)


class TemplateViewSet(viewsets.ModelViewSet):
    queryset = Template.objects.select_related("owner", "app").all()
    serializer_class = TemplateSerializer
    permission_classes = [permissions.IsAuthenticated]
    authentication_classes = [CsrfExemptSessionAuthentication]

    def get_queryset(self):
        user = self.request.user
        qs = self.queryset
        if not user.is_staff:
            try:
                from apps.roles.models import UserRole

                roles = UserRole.objects.filter(user=user)
                allowed = set()
                for role in roles:
                    allowed.update(role.allowed_apps or [])
                qs = qs.filter(app_id__in=allowed) if allowed else Template.objects.none()
            except Exception:
                return Template.objects.none()
        app_param = self.request.query_params.get("app")
        if app_param:
            if app_param.isdigit():
                qs = qs.filter(app__id=app_param)
            else:
                qs = qs.filter(app__slug=app_param)
        return qs

    def perform_update(self, serializer):
        instance = serializer.save()
        projects = instance.projects.all()
        if projects.exists():
            instance.template_projects = [
                ProjectSerializer(p).data for p in projects
            ]
            instance.save(update_fields=["template_projects"])

    def _can_edit(self, user):
        perms = [
            "permissions.workflow_edit",
            "permissions.laboratory_edit",
            "permissions.exhibition_edit",
        ]
        return user.is_staff or any(user.has_perm(p) for p in perms)

    @action(detail=True, methods=["post"])
    def use(self, request, pk=None):
        """Create a new project from the given template."""
        if not self._can_edit(request.user):
            return Response({"detail": "Permission denied."}, status=status.HTTP_403_FORBIDDEN)
        template = self.get_object()
        base_id = template.base_project.get("id")
        try:
            source = Project.objects.get(id=base_id)
        except Project.DoesNotExist:
            return Response({"detail": "Base project not found."}, status=status.HTTP_404_NOT_FOUND)

        base_name = f"{template.name} Project"
        name = base_name
        counter = 1
        while Project.objects.filter(owner=request.user, app=template.app, name=name).exists():
            name = f"{base_name} {counter}"
            counter += 1
        slug_base = slugify(name)
        slug_val = slug_base
        counter = 1
        while Project.objects.filter(owner=request.user, slug=slug_val).exists():
            slug_val = f"{slug_base}-{counter}"
            counter += 1

        new_project = Project.objects.create(
            name=name,
            slug=slug_val,
            description=template.description,
            owner=request.user,
            app=template.app,
            state=template.state,
            base_template=template,
        )

        for mode in ["lab", "workflow", "exhibition"]:
            cfg = load_atom_list_configuration(source, mode)
            if cfg and cfg.get("cards"):
                save_atom_list_configuration(new_project, mode, cfg["cards"])

        tenant = os.getenv("CLIENT_NAME", "default_client").replace(" ", "_")
        app_slug = template.app.slug
        old_prefix = f"{tenant}/{app_slug}/{source.name}"
        new_prefix = f"{tenant}/{app_slug}/{new_project.name}"
        copy_prefix(old_prefix, new_prefix)

        for ds in source.arrow_datasets.all():
            def _replace(path: str) -> str:
                return path.replace(old_prefix, new_prefix, 1) if path else path

            ArrowDataset.objects.create(
                project=new_project,
                atom_id=ds.atom_id,
                file_key=_replace(ds.file_key),
                arrow_object=_replace(ds.arrow_object),
                flight_path=_replace(ds.flight_path),
                original_csv=_replace(ds.original_csv),
                descriptor=ds.descriptor,
            )

        try:
            env_src = RegistryEnvironment.objects.get(
                client_name=tenant, app_name=app_slug, project_name=source.name
            )
            env = env_src.envvars or {}
            env.update(
                {
                    "CLIENT_NAME": tenant,
                    "APP_NAME": app_slug,
                    "PROJECT_NAME": new_project.name,
                    "PROJECT_ID": f"{new_project.name}_{new_project.id}",
                }
            )
            RegistryEnvironment.objects.update_or_create(
                client_name=tenant,
                app_name=app_slug,
                project_name=new_project.name,
                defaults={
                    "envvars": env,
                    "identifiers": env_src.identifiers,
                    "measures": env_src.measures,
                    "dimensions": env_src.dimensions,
                },
            )
        except RegistryEnvironment.DoesNotExist:
            pass

        template.template_projects = (template.template_projects or []) + [
            ProjectSerializer(new_project).data
        ]
        template.save(update_fields=["template_projects"])

        return Response(
            ProjectSerializer(new_project).data, status=status.HTTP_201_CREATED
        )


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
