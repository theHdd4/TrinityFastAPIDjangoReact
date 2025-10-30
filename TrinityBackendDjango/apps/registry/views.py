from rest_framework import viewsets, permissions, status
from rest_framework.response import Response
from rest_framework.decorators import action
from django.utils.text import slugify
import os
import logging
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
from .atom_config import (
    save_atom_list_configuration,
    load_atom_list_configuration,
    _get_env_ids,
)
from .template_config import store_template_configuration
from common.minio_utils import copy_prefix, remove_prefix
from pymongo import MongoClient
from django.conf import settings
from .serializers import (
    AppSerializer,
    ProjectSerializer,
    TemplateSerializer,
    SessionSerializer,
    LaboratoryActionSerializer,
    ArrowDatasetSerializer,
)

logger = logging.getLogger(__name__)

class AppViewSet(viewsets.ModelViewSet):
    """
    CRUD for App templates in tenant schema.
    
    This viewset controls which apps (from public.usecase) are accessible to the current tenant.
    Only enabled apps are shown to non-admin users.
    Admin users can see all apps (enabled and disabled) for tenant management.
    """
    queryset = App.objects.all()
    serializer_class = AppSerializer
    permission_classes = [permissions.IsAuthenticated]
    authentication_classes = [CsrfExemptSessionAuthentication]

    def get_queryset(self):
        qs = super().get_queryset()
        user = self.request.user
        
        # Filter to only show enabled apps for non-admin users
        if not user.is_staff:
            qs = qs.filter(is_enabled=True)
            
            # Additional role-based filtering
            try:
                from apps.roles.models import UserRole

                roles = UserRole.objects.filter(user=user)
                allowed = set()
                for role in roles:
                    allowed.update(role.allowed_apps or [])
                if allowed:
                    qs = qs.filter(id__in=allowed)
            except Exception:
                # If roles don't exist or error, just show enabled apps
                pass
        
        # Order by name for consistent display
        return qs.order_by('name')

    def get_permissions(self):
        if self.action in ("create", "update", "partial_update", "destroy"):
            return [permissions.IsAdminUser()]
        return super().get_permissions()

    def list(self, request, *args, **kwargs):
        """
        List apps accessible to this tenant with full molecule/atom data from public.usecase
        Uses API-level tenant switching based on user's environment variables.
        """
        from apps.accounts.tenant_utils import switch_to_user_tenant, get_user_tenant_schema
        from apps.usecase.models import UseCase
        
        # Get user's tenant schema
        schema_name = get_user_tenant_schema(request.user)
        if not schema_name:
            logger.warning(f"No tenant schema found for user {request.user.username}")
            return Response([])
        
        logger.info(f"🔄 Switching to tenant schema: {schema_name} for user {request.user.username}")
        
        # Switch to user's tenant schema
        with switch_to_user_tenant(request.user):
            logger.info(f"✅ Now in tenant schema: {schema_name}")
            # Get apps from the user's tenant schema
            queryset = self.filter_queryset(self.get_queryset())
            logger.info(f"📊 Queryset count: {queryset.count()}")
            
            enriched_apps = []
            for app in queryset:
                app_data = {
                    'id': app.id,
                    'name': app.name,
                    'slug': app.slug,
                    'description': app.description,
                    'modules': [],
                    'molecules': [],
                    'molecule_atoms': {},
                    'atoms_in_molecules': []
                }
                
                # Fetch data from public.usecase if linked
                if app.usecase_id:
                    try:
                        from django_tenants.utils import schema_context
                        from apps.trinity_v1_atoms.models import TrinityV1Atom
                        
                        # Access UseCase from public schema
                        with schema_context('public'):
                            usecase = UseCase.objects.prefetch_related('molecule_objects').get(id=app.usecase_id)
                            app_data['modules'] = usecase.modules or []
                            app_data['molecules'] = usecase.molecules or []
                            
                            # Build molecule_atoms and atoms_in_molecules from molecule_objects
                            molecule_atoms = {}
                            atoms_in_molecules = []
                            
                            for molecule in usecase.molecule_objects.all():
                                atom_names = molecule.atoms or []
                                matching_atoms = TrinityV1Atom.objects.filter(atom_id__in=atom_names)
                                
                                atoms_list = []
                                for atom in matching_atoms:
                                    atom_data = {
                                        'id': atom.atom_id,
                                        'name': atom.name,
                                        'description': atom.description,
                                        'category': atom.category
                                    }
                                    atoms_list.append(atom_data)
                                    if atom.atom_id not in atoms_in_molecules:
                                        atoms_in_molecules.append(atom.atom_id)
                                
                                molecule_atoms[molecule.molecule_id] = {
                                    'id': molecule.molecule_id,
                                    'name': molecule.name,
                                    'atoms': atoms_list
                                }
                            
                            app_data['molecule_atoms'] = molecule_atoms
                            app_data['atoms_in_molecules'] = atoms_in_molecules
                    except UseCase.DoesNotExist:
                        logger.warning(f"UseCase {app.usecase_id} not found for app {app.slug}")
                
                enriched_apps.append(app_data)
            
            logger.info(f"Found {len(enriched_apps)} apps for tenant {schema_name}")
            return Response(enriched_apps)
    
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
    queryset = Project.objects.select_related("owner", "app").filter(is_deleted=False)
    serializer_class = ProjectSerializer
    permission_classes = [permissions.IsAuthenticated]
    authentication_classes = [CsrfExemptSessionAuthentication]

    def get_queryset(self):
        from apps.accounts.tenant_utils import switch_to_user_tenant, get_user_tenant_schema
        
        user = self.request.user
        
        # Get user's tenant schema
        schema_name = get_user_tenant_schema(user)
        if not schema_name:
            logger.warning(f"No tenant schema found for user {user.username}")
            return Project.objects.none()
        
        # Switch to user's tenant schema before filtering projects
        with switch_to_user_tenant(user):
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
        from apps.accounts.tenant_utils import switch_to_user_tenant, get_user_tenant_schema
        
        if not self._can_edit(request.user):
            return Response({"detail": "Permission denied."}, status=status.HTTP_403_FORBIDDEN)
        
        # Get user's tenant schema
        schema_name = get_user_tenant_schema(request.user)
        if not schema_name:
            logger.warning(f"No tenant schema found for user {request.user.username}")
            return Response({"detail": "No tenant found for user"}, status=status.HTTP_404_NOT_FOUND)
        
        # Switch to user's tenant schema before updating project
        with switch_to_user_tenant(request.user):
            return super().update(request, *args, **kwargs)

    def partial_update(self, request, *args, **kwargs):
        from apps.accounts.tenant_utils import switch_to_user_tenant, get_user_tenant_schema
        
        if not self._can_edit(request.user):
            return Response({"detail": "Permission denied."}, status=status.HTTP_403_FORBIDDEN)
        
        # Get user's tenant schema
        schema_name = get_user_tenant_schema(request.user)
        if not schema_name:
            logger.warning(f"No tenant schema found for user {request.user.username}")
            return Response({"detail": "No tenant found for user"}, status=status.HTTP_404_NOT_FOUND)
        
        # Switch to user's tenant schema before updating project
        with switch_to_user_tenant(request.user):
            return super().partial_update(request, *args, **kwargs)

    def destroy(self, request, *args, **kwargs):
        from apps.accounts.tenant_utils import switch_to_user_tenant, get_user_tenant_schema
        
        if not self._can_edit(request.user):
            return Response({"detail": "Permission denied."}, status=status.HTTP_403_FORBIDDEN)
        
        # Get user's tenant schema
        schema_name = get_user_tenant_schema(request.user)
        if not schema_name:
            logger.warning(f"No tenant schema found for user {request.user.username}")
            return Response({"detail": "No tenant found for user"}, status=status.HTTP_404_NOT_FOUND)
        
        # Switch to user's tenant schema before deleting project
        with switch_to_user_tenant(request.user):
            project = self.get_object()
            project.is_deleted = True
            project.save(update_fields=["is_deleted"])

            tenant_obj = getattr(request, "tenant", None)
            client_name_env = os.getenv("CLIENT_NAME", "default_client")
            tenant_candidates = {
                client_name_env,
                client_name_env.replace(" ", "_"),
            }
            if tenant_obj:
                for attr in ("name", "slug"):
                    val = getattr(tenant_obj, attr, None)
                    if val:
                        tenant_candidates.add(val)
                        tenant_candidates.add(val.replace(" ", "_"))

            app_slug = project.app.slug if project.app else ""
            for client_slug in tenant_candidates:
                remove_prefix(f"{client_slug}/{app_slug}/{project.name}")
                remove_prefix(f"{client_slug}/{app_slug}/{project.slug}")

            try:
                client_id, app_id, project_id = _get_env_ids(project)
                mc = MongoClient(getattr(settings, "MONGO_URI", "mongodb://mongo:27017/trinity_db"))
                coll = mc["trinity_db"]["atom_list_configuration"]
                coll.update_many(
                    {"client_id": client_id, "app_id": app_id, "project_id": project_id},
                    {"$set": {"isDeleted": True}},
                )
            except Exception as exc:  # pragma: no cover - logging only
                logger.error("Failed to mark atom configuration deleted: %s", exc)

            return Response(status=status.HTTP_204_NO_CONTENT)

    def create(self, request, *args, **kwargs):
        from apps.accounts.tenant_utils import switch_to_user_tenant, get_user_tenant_schema
        
        # Get user's tenant schema
        schema_name = get_user_tenant_schema(request.user)
        if not schema_name:
            logger.warning(f"No tenant schema found for user {request.user.username}")
            return Response({"detail": "No tenant found for user"}, status=status.HTTP_404_NOT_FOUND)
        
        # Switch to user's tenant schema before creating project
        with switch_to_user_tenant(request.user):
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
        from apps.accounts.tenant_utils import switch_to_user_tenant, get_user_tenant_schema
        
        # Get user's tenant schema
        schema_name = get_user_tenant_schema(request.user)
        if not schema_name:
            logger.warning(f"No tenant schema found for user {request.user.username}")
            return Response({"detail": "No tenant found for user"}, status=status.HTTP_404_NOT_FOUND)
        
        logger.info(f"🔄 Switching to tenant schema: {schema_name} for user {request.user.username}")
        
        # Switch to user's tenant schema before accessing project
        with switch_to_user_tenant(request.user):
            logger.info(f"✅ Now in tenant schema: {schema_name}")
            
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
    def import_template(self, request, pk=None):
        """Apply a template to an existing project."""
        if not self._can_edit(request.user):
            return Response({"detail": "Permission denied."}, status=status.HTTP_403_FORBIDDEN)
        project = self.get_object()
        template_id = request.data.get("template_id")
        if not template_id:
            return Response({"detail": "template_id required."}, status=status.HTTP_400_BAD_REQUEST)
        try:
            template = Template.objects.get(id=template_id, app=project.app)
        except Template.DoesNotExist:
            return Response({"detail": "Template not found."}, status=status.HTTP_404_NOT_FOUND)
        overwrite = bool(request.data.get("overwrite"))
        if overwrite:
            project.state = template.state
            project.base_template = template
            project.save()
            state = template.state or {}
            for field, mode in [
                ("laboratory_config", "lab"),
                ("workflow_config", "workflow"),
                ("exhibition_config", "exhibition"),
            ]:
                cfg = state.get(field)
                if cfg and cfg.get("cards"):
                    save_atom_list_configuration(project, mode, cfg["cards"])

            projects = template.template_projects or []
            if not any(p.get("id") == project.id for p in projects):
                projects.append(ProjectSerializer(project).data)
                template.template_projects = projects
                template.save(update_fields=["template_projects"])
        else:
            project.base_template = template
            project.save(update_fields=["base_template"])
        serializer = self.get_serializer(project)
        return Response(serializer.data)

    @action(detail=True, methods=["post"])
    def save_template(self, request, pk=None):
        """Persist the project as a reusable template."""
        if not self._can_edit(request.user):
            return Response({"detail": "Permission denied."}, status=status.HTTP_403_FORBIDDEN)
        project = self.get_object()
        serialized = ProjectSerializer(project).data
        state = project.state or {}
        for field, mode in [
            ("laboratory_config", "lab"),
            ("workflow_config", "workflow"),
            ("exhibition_config", "exhibition"),
        ]:
            cfg = load_atom_list_configuration(project, mode)
            if cfg:
                state[field] = cfg
        template = Template.objects.create(
            name=f"{project.name} Template",
            slug=slugify(f"{project.slug}-template"),
            description=project.description,
            owner=request.user,
            app=project.app,
            state=state,
            base_project=serialized,
        )
        try:
            store_template_configuration(project=project, template=template, state=state)
        except Exception as exc:  # pragma: no cover - Mongo failures are non-fatal
            logger.error(
                "Failed to persist template configuration for template %s: %s",
                template.pk,
                exc,
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

        state = template.state or {}
        for field, mode in [
            ("laboratory_config", "lab"),
            ("workflow_config", "workflow"),
            ("exhibition_config", "exhibition"),
        ]:
            cfg = state.get(field)
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
        project = self.request.query_params.get("project")
        logger.debug(
            "ArrowDatasetViewSet.get_queryset user=%s atom=%s project=%s",
            self.request.user,
            atom,
            project,
        )
        if atom:
            qs = qs.filter(atom_id=atom)
        if project:
            qs = qs.filter(project_id=project)
        return qs

    def perform_create(self, serializer):
        instance = serializer.save()
        logger.info(
            "ArrowDataset created id=%s project=%s atom=%s key=%s",
            instance.id,
            instance.project_id,
            instance.atom_id,
            instance.file_key,
        )
