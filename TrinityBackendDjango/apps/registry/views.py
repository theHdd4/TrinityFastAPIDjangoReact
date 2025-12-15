from rest_framework import viewsets, permissions, status
from rest_framework.response import Response
from rest_framework.decorators import action
from django.utils.text import slugify
from django.utils import timezone
from django.db import models as django_models
from typing import Any, Dict
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
    ProjectModificationHistory,
)
from .atom_config import (
    save_atom_list_configuration,
    load_atom_list_configuration,
    _get_env_ids,
)
from .template_config import (
    store_template_configuration,
    apply_template_configuration,
    remap_state_molecule_ids,
)
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

                role_obj = UserRole.objects.filter(user=user).first()
                if role_obj and role_obj.allowed_apps:
                    qs = qs.filter(id__in=role_obj.allowed_apps)
            except Exception:
                # If roles don't exist or error, just show enabled apps
                pass
        
        # Order by name for consistent display
        return qs.order_by('name')

    def get_permissions(self):
        if self.action in ("create", "update", "partial_update", "destroy"):
            return [permissions.IsAdminUser()]
        return super().get_permissions()

    def _enrich_app_data(self, app):
        """
        Helper method to enrich app data with modules, molecules, and atoms from public.usecase.
        """
        app_data = {
            'id': app.id,
            'name': app.name,
            'slug': app.slug,
            'description': app.description,
            'usecase_id': app.usecase_id,  # Include usecase_id to allow filtering by tenant's allowed_apps
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
                from apps.usecase.models import UseCase
                
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
            except Exception as e:
                logger.error(f"Error enriching app {app.slug}: {e}")
        
        return app_data

    def _enrich_usecase_data(self, usecase):
        """
        Helper method to enrich UseCase data with modules, molecules, and atoms.
        Similar to _enrich_app_data but works directly with UseCase objects from public schema.
        This method should be called within a public schema context.
        """
        try:
            usecase_data = {
                'usecase_id': usecase.id,  # Use usecase_id instead of id to avoid clashing
                'name': usecase.name or '',
                'slug': usecase.slug or '',
                'description': usecase.description or '',
                'modules': usecase.modules or [],
                'molecules': usecase.molecules or [],
                'molecule_atoms': {},
                'atoms_in_molecules': []
            }
        except Exception as e:
            logger.error(f"Error extracting basic UseCase data: {e}")
            return {
                'usecase_id': getattr(usecase, 'id', 0),
                'name': getattr(usecase, 'name', 'Unknown'),
                'slug': getattr(usecase, 'slug', 'unknown'),
                'description': getattr(usecase, 'description', ''),
                'modules': [],
                'molecules': [],
                'molecule_atoms': {},
                'atoms_in_molecules': []
            }
        
        try:
            from apps.trinity_v1_atoms.models import TrinityV1Atom
            from django_tenants.utils import schema_context
            
            # Ensure we're in public schema context for accessing TrinityV1Atom
            with schema_context('public'):
                # Build molecule_atoms and atoms_in_molecules from molecule_objects
                molecule_atoms = {}
                atoms_in_molecules = []
                
                # UseCase already has prefetch_related('molecule_objects') if called correctly
                try:
                    for molecule in usecase.molecule_objects.all():
                        atom_names = molecule.atoms or []
                        if atom_names:
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
                except Exception as e:
                    logger.warning(f"Error processing molecules for UseCase {usecase.slug}: {e}")
                
                usecase_data['molecule_atoms'] = molecule_atoms
                usecase_data['atoms_in_molecules'] = atoms_in_molecules
        except Exception as e:
            logger.error(f"Error enriching UseCase {getattr(usecase, 'slug', 'unknown')}: {e}")
        
        return usecase_data

    def list(self, request, *args, **kwargs):
        """
        List apps accessible to this tenant with full molecule/atom data from public.usecase
        Uses API-level tenant switching based on user's environment variables.
        
        Query Parameters:
        - include_restricted: If 'true', returns both allowed and restricted apps with is_allowed flag.
                             Restricted apps are apps in tenant registry but not accessible to user.
                             Default: 'false' (only returns allowed apps for backward compatibility).
        """
        from apps.accounts.tenant_utils import switch_to_user_tenant, get_user_tenant_schema
        
        # Get user's tenant schema
        schema_name = get_user_tenant_schema(request.user)
        if not schema_name:
            logger.warning(f"No tenant schema found for user {request.user.username}")
            return Response([])
        
        logger.info(f"🔄 Switching to tenant schema: {schema_name} for user {request.user.username}")
        
        # Check if we should include restricted apps
        include_restricted = request.query_params.get('include_restricted', 'false').lower() == 'true'
        
        # Switch to user's tenant schema
        with switch_to_user_tenant(request.user):
            logger.info(f"✅ Now in tenant schema: {schema_name}")
            
            if include_restricted:
                # Get all tenant apps (no permission filtering)
                all_tenant_apps = App.objects.all().order_by('name')
                
                # Get allowed app IDs using current filtering logic
                allowed_queryset = self.filter_queryset(self.get_queryset())
                allowed_ids = set(allowed_queryset.values_list('id', flat=True))
                
                # Get restricted apps (all apps not in allowed set, excluding custom apps)
                restricted_apps = all_tenant_apps.exclude(id__in=allowed_ids).exclude(slug='blank')
                
                # Enrich allowed apps
                enriched_allowed = []
                for app in allowed_queryset:
                    app_data = self._enrich_app_data(app)
                    app_data['is_allowed'] = True
                    enriched_allowed.append(app_data)
                
                # Enrich restricted apps
                enriched_restricted = []
                for app in restricted_apps:
                    app_data = self._enrich_app_data(app)
                    app_data['is_allowed'] = False
                    enriched_restricted.append(app_data)
                
                # Combine and return
                all_enriched = enriched_allowed + enriched_restricted
                logger.info(f"Found {len(enriched_allowed)} allowed and {len(enriched_restricted)} restricted apps for tenant {schema_name}")
                return Response(all_enriched)
            else:
                # Default behavior: return only allowed apps (backward compatible)
                queryset = self.filter_queryset(self.get_queryset())
                logger.info(f"📊 Queryset count: {queryset.count()}")
                
                enriched_apps = []
                for app in queryset:
                    app_data = self._enrich_app_data(app)
                    enriched_apps.append(app_data)
                
                logger.info(f"Found {len(enriched_apps)} apps for tenant {schema_name}")
                return Response(enriched_apps)
    
    def retrieve(self, request, *args, **kwargs):
        from apps.accounts.tenant_utils import switch_to_user_tenant, get_user_tenant_schema
        
        # Get user's tenant schema
        schema_name = get_user_tenant_schema(request.user)
        if not schema_name:
            logger.warning(f"No tenant schema found for user {request.user.username}")
            return Response({"detail": "No tenant found for user"}, status=status.HTTP_404_NOT_FOUND)
        
        logger.info(f"🔄 Switching to tenant schema: {schema_name} for app retrieve (user: {request.user.username})")
        
        # Switch to user's tenant schema before getting app object
        with switch_to_user_tenant(request.user):
            logger.info(f"✅ Now in tenant schema: {schema_name}")
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

    @action(detail=False, methods=['get'])
    def unavailable(self, request):
        """
        Get apps from public.trinity_v1_apps (UseCase) that are not in tenant registry.
        Returns apps with usecase_id (not id) to avoid clashing with registry app IDs.
        """
        from apps.accounts.tenant_utils import switch_to_user_tenant, get_user_tenant_schema
        from django_tenants.utils import schema_context
        from apps.usecase.models import UseCase
        
        # Get user's tenant schema
        schema_name = get_user_tenant_schema(request.user)
        if not schema_name:
            logger.warning(f"No tenant schema found for user {request.user.username}")
            return Response([])
        
        logger.info(f"🔄 Fetching unavailable apps for tenant {schema_name} (user: {request.user.username})")
        
        # Step 1: Get all registry app usecase_ids from tenant schema
        with switch_to_user_tenant(request.user):
            # Get all registry apps (including disabled ones) to see what usecase_ids are already in registry
            registry_apps = App.objects.exclude(usecase_id__isnull=True).exclude(usecase_id=0)
            registry_usecase_ids = set(registry_apps.values_list('usecase_id', flat=True))
            logger.info(f"📊 Found {len(registry_usecase_ids)} usecase_ids in tenant registry")
        
        # Step 2: Query all UseCase objects from public schema and filter out ones in registry
        enriched_unavailable = []
        try:
            with schema_context('public'):
                # Get all UseCase objects, excluding those already in tenant registry
                unavailable_usecases = UseCase.objects.exclude(id__in=registry_usecase_ids).prefetch_related('molecule_objects').order_by('name')
                logger.info(f"📊 Found {unavailable_usecases.count()} unavailable UseCases")
                
                # Step 3: Enrich each UseCase with modules, molecules, and atoms
                for usecase in unavailable_usecases:
                    try:
                        usecase_data = self._enrich_usecase_data(usecase)
                        if usecase_data and usecase_data.get('usecase_id'):
                            enriched_unavailable.append(usecase_data)
                    except Exception as e:
                        logger.error(f"Error enriching UseCase {getattr(usecase, 'id', 'unknown')}: {e}")
                        continue
        except Exception as e:
            logger.error(f"Error fetching unavailable apps from public schema: {e}")
        
        logger.info(f"✅ Returning {len(enriched_unavailable)} unavailable apps for tenant {schema_name}")
        return Response(enriched_unavailable)


class ProjectViewSet(viewsets.ModelViewSet):
    """
    CRUD for Projects.
    Admins and owners may create; owners may update/delete their own.
    
    Query Parameters:
    - scope: Filter projects by scope (default: "tenant")
        - "tenant": Returns all tenant projects (existing behavior)
        - "user": Returns projects where owner=user OR user appears in ProjectModificationHistory
    - limit: Limit the number of results without pagination
    - offset: Number of records to skip before returning results (for pagination)
    - ordering: Sort order (e.g., "-updated_at", "name", "created_at")
    - app: Filter by app ID or slug
    
    The ProjectModificationHistory table tracks all users who have modified each project,
    allowing multiple users to see a project in their "My Projects" tab if they've both modified it.
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

            # Handle scope parameter for filtering projects
            # scope=tenant: Returns all tenant projects (not filtered by allowed_apps for non-staff)
            # scope=user: Returns projects where owner=user OR user appears in ProjectModificationHistory (filtered by allowed_apps)
            scope = self.request.query_params.get("scope", "tenant")  # default to tenant
            
            if not user.is_staff:
                # For user scope, filter by allowed_apps (existing behavior)
                # For tenant scope, don't filter by allowed_apps (show all tenant projects)
                if scope == "user":
                    try:
                        from apps.roles.models import UserRole

                        role_obj = UserRole.objects.filter(user=user).first()
                        if role_obj and role_obj.allowed_apps:
                            qs = qs.filter(app_id__in=role_obj.allowed_apps)
                        else:
                            return Project.objects.none()
                    except Exception:
                        return Project.objects.none()
                # For tenant scope, skip allowed_apps filtering - show all tenant projects

            app_param = self.request.query_params.get("app")
            if app_param:
                if app_param.isdigit():
                    qs = qs.filter(app__id=app_param)
                else:
                    qs = qs.filter(app__slug=app_param)

            if scope == "user":
                # Get project IDs from modification history where user has modified
                modified_project_ids = list(
                    ProjectModificationHistory.objects.filter(user=user).values_list('project_id', flat=True)
                )
                
                # Filter to show projects owned OR modified by the current user
                qs = qs.filter(
                    django_models.Q(owner=user) | django_models.Q(id__in=modified_project_ids)
                ).distinct()
                
                logger.info(
                    f"🔍 User scope filter: User {user.username} - "
                    f"Found {len(modified_project_ids)} projects in modification history, "
                    f"Total projects after filter: {qs.count()}"
                )
            # If scope == "tenant", no additional filtering (existing behavior)

            # Handle ordering parameter (for sorting)
            ordering = self.request.query_params.get("ordering")
            if ordering:
                # Validate ordering to prevent SQL injection
                allowed_fields = ["updated_at", "-updated_at", "created_at", "-created_at", "name", "-name"]
                if ordering in allowed_fields:
                    qs = qs.order_by(ordering)
                # If invalid ordering, don't apply any ordering (use model default)

            return qs

    def list(self, request, *args, **kwargs):
        """
        Override list method to handle limit and offset parameters for pagination.
        When limit or offset is provided, return paginated results without standard pagination.
        
        Query Parameters:
        - scope: Filter projects by scope
            - "tenant" (default): Returns all tenant projects
            - "user": Returns projects where owner=user OR user appears in ProjectModificationHistory
        - limit: Limit the number of results (no pagination when provided)
        - offset: Number of records to skip before returning results (default: 0)
        - ordering: Sort order (e.g., "-updated_at", "name")
        - app: Filter by app ID or slug
        """
        from apps.accounts.tenant_utils import switch_to_user_tenant, get_user_tenant_schema
        
        # Get user's tenant schema
        user = request.user
        schema_name = get_user_tenant_schema(user)
        if not schema_name:
            logger.warning(f"No tenant schema found for user {user.username}")
            return Response([])
        
        logger.info(f"🔄 Switching to tenant schema: {schema_name} for projects list (user: {user.username})")
        
        # Switch to user's tenant schema - wrap entire method logic inside context
        # This ensures queryset evaluation happens in the correct schema
        with switch_to_user_tenant(user):
            logger.info(f"✅ Now in tenant schema: {schema_name}")
            
            # Get the queryset inside tenant context
            queryset = self.filter_queryset(self.get_queryset())
            
            scope = request.query_params.get("scope", "tenant")
            
            # Console logging for debugging
            logger.info(
                f"📋 Projects API Request - "
                f"User: {user.username} | "
                f"Client/Tenant: {schema_name} | "
                f"Scope: {scope} | "
                f"Total projects: {queryset.count()}"
            )
            
            # Log project details for debugging
            if queryset.exists():
                projects_list = list(queryset.values('id', 'name', 'owner__username', 'app__slug', 'updated_at')[:10])
                logger.info(f"📊 Sample projects (first 10): {projects_list}")
            
            # Handle limit and offset parameters (for pagination)
            limit_param = request.query_params.get("limit")
            offset_param = request.query_params.get("offset")

            if limit_param or offset_param:
                try:
                    limit = int(limit_param) if limit_param else None
                    offset = int(offset_param) if offset_param else 0
                    
                    # Validate values
                    if limit is not None and limit <= 0:
                        limit = None
                    if offset < 0:
                        offset = 0
                    
                    # Apply pagination
                    if limit is not None:
                        # Both limit and offset provided
                        paginated_queryset = list(queryset[offset:offset+limit])
                        logger.info(f"✅ Returning {len(paginated_queryset)} projects (offset={offset}, limit={limit})")
                    elif offset > 0:
                        # Only offset provided (no limit)
                        paginated_queryset = list(queryset[offset:])
                        logger.info(f"✅ Returning {len(paginated_queryset)} projects (offset={offset}, no limit)")
                    else:
                        # Only limit provided (no offset)
                        paginated_queryset = list(queryset[:limit])
                        logger.info(f"✅ Returning {len(paginated_queryset)} projects (limit={limit})")
                    
                    serializer = self.get_serializer(paginated_queryset, many=True)
                    return Response(serializer.data)
                except (ValueError, TypeError):
                    # Invalid parameter, ignore it and continue with normal pagination
                    pass
            
            # Normal pagination flow when no limit is provided
            page = self.paginate_queryset(queryset)
            if page is not None:
                serializer = self.get_serializer(page, many=True)
                logger.info(f"✅ Returning paginated projects (page size: {len(page)})")
                return self.get_paginated_response(serializer.data)
            
            serializer = self.get_serializer(queryset, many=True)
            logger.info(f"✅ Returning {len(serializer.data)} projects (all)")
            return Response(serializer.data)

    def _can_edit(self, user):
        """
        Check if user can edit projects.
        First checks UserRole table (within tenant schema), then falls back to is_staff.
        """
        if not user.is_authenticated:
            return False
        
        # Check UserRole table first (tenant-specific)
        try:
            from apps.roles.models import UserRole
            from apps.accounts.tenant_utils import switch_to_user_tenant, get_user_tenant_schema
            
            schema_name = get_user_tenant_schema(user)
            if schema_name:
                # Query UserRole within tenant schema context
                with switch_to_user_tenant(user):
                    role_obj = UserRole.objects.filter(user=user).first()
                    if role_obj:
                        # Admin and editor roles can edit
                        if role_obj.role in [UserRole.ROLE_ADMIN, UserRole.ROLE_EDITOR]:
                            return True
                        # Viewer role cannot edit
                        return False
        except Exception:
            # If UserRole query fails, fall back to is_staff check
            pass
        
        # Fallback to is_staff for backward compatibility
        perms = [
            "permissions.workflow_edit",
            "permissions.laboratory_edit",
            "permissions.exhibition_edit",
        ]
        return user.is_staff or any(user.has_perm(p) for p in perms)

    def _record_modification(self, project, user):
        """
        Record that a user has modified a project.
        Creates a new entry if it's the user's first time modifying the project,
        or updates the modified_at timestamp if the entry already exists.
        """
        ProjectModificationHistory.objects.update_or_create(
            project=project,
            user=user,
            defaults={'modified_at': timezone.now()}
        )
        logger.info(
            f"📝 Recorded modification: User {user.username} modified project '{project.name}' (ID: {project.id})"
        )

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
                coll = mc["trinity_db"]["django_atom_list_configuration"]
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

        project = serializer.save(owner=user, slug=slug_val)
        # Record that the user created/modified this project
        self._record_modification(project, user)

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

            # Get app information from project object (not from os.environ)
            app_obj = project_obj.app
            app_name = app_obj.slug
            app_id = f"{app_obj.slug}_{app_obj.id}"

            # Get client info from environment or tenant
            client_name = os.environ.get("CLIENT_NAME", "")
            client_id = os.environ.get("CLIENT_ID", "")

            # Set project info
            project_name = project_obj.name
            project_id = f"{project_obj.name}_{project_obj.id}"

            # Set in os.environ for backward compatibility
            os.environ["APP_NAME"] = app_name
            os.environ["APP_ID"] = app_id
            os.environ["PROJECT_NAME"] = project_name
            os.environ["PROJECT_ID"] = project_id

            print(
                f"✅ project selected: PROJECT_ID={project_id} PROJECT_NAME={project_name} "
                f"APP_NAME={app_name} APP_ID={app_id}"
            )

            # Save all env vars
            save_env_var(request.user, "CLIENT_NAME", client_name)
            save_env_var(request.user, "CLIENT_ID", client_id)
            save_env_var(request.user, "APP_NAME", app_name)
            save_env_var(request.user, "APP_ID", app_id)
            save_env_var(request.user, "PROJECT_NAME", project_name)
            save_env_var(request.user, "PROJECT_ID", project_id)

            # Explicitly update Redis currentenv to ensure all fields are stored
            from redis_store.env_cache import set_current_env
            set_current_env(
                str(request.user.id),
                client_id=client_id,
                app_id=app_id,
                project_id=project_id,
                client_name=client_name,
                app_name=app_name,
                project_name=project_name,
            )

            print("Current env vars after project select", get_env_dict(request.user))
            serializer = self.get_serializer(project_obj)
            data = serializer.data
            data["environment"] = get_env_dict(request.user)

            state = data.get("state") or {}
            for field, mode in [
                ("laboratory_config", "laboratory"),
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
        
        # Record that the user modified this project
        self._record_modification(project, self.request.user)
        
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
                save_atom_list_configuration(project, "laboratory", cards)
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
        
        # Record that the user created this duplicated project
        self._record_modification(new_project, request.user)

        for mode in ["laboratory", "workflow", "exhibition"]:
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
                ("laboratory_config", "laboratory"),
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
            ("laboratory_config", "laboratory"),
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

                role_obj = UserRole.objects.filter(user=user).first()
                if role_obj and role_obj.allowed_apps:
                    qs = qs.filter(app_id__in=role_obj.allowed_apps)
                else:
                    return Template.objects.none()
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
        """
        Check if user can edit templates.
        First checks UserRole table (within tenant schema), then falls back to is_staff.
        """
        if not user.is_authenticated:
            return False
        
        # Check UserRole table first (tenant-specific)
        try:
            from apps.roles.models import UserRole
            from apps.accounts.tenant_utils import switch_to_user_tenant, get_user_tenant_schema
            
            schema_name = get_user_tenant_schema(user)
            if schema_name:
                # Query UserRole within tenant schema context
                with switch_to_user_tenant(user):
                    role_obj = UserRole.objects.filter(user=user).first()
                    if role_obj:
                        # Admin and editor roles can edit
                        if role_obj.role in [UserRole.ROLE_ADMIN, UserRole.ROLE_EDITOR]:
                            return True
                        # Viewer role cannot edit
                        return False
        except Exception:
            # If UserRole query fails, fall back to is_staff check
            pass
        
        # Fallback to is_staff for backward compatibility
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
            ("laboratory_config", "laboratory"),
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

        remap_result: Dict[str, Any] | None = None
        try:
            remap_result = apply_template_configuration(project=new_project, template=template)
        except Exception as exc:  # pragma: no cover - Mongo failures are non-fatal
            logger.error(
                "Failed to apply template configuration for project %s (template %s): %s",
                new_project.pk,
                template.pk,
                exc,
            )

        molecule_id_map = (remap_result or {}).get("molecule_id_map") or {}
        if molecule_id_map:
            updated_state = remap_state_molecule_ids(state, molecule_id_map)
            if updated_state != state:
                state = updated_state
                new_project.state = updated_state
                new_project.save(update_fields=["state"])

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
