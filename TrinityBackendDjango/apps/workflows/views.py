from rest_framework import viewsets, permissions, status
from rest_framework.decorators import action
from rest_framework.response import Response
from django.shortcuts import get_object_or_404
from django.contrib.auth import get_user_model
from apps.registry.models import Project
from apps.atoms.models import Atom
from .models import Workflow, WorkflowAtom, WorkflowRun
from .serializers import (
    WorkflowSerializer,
    WorkflowAtomSerializer,
    WorkflowRunSerializer,
)

User = get_user_model()


class WorkflowViewSet(viewsets.ModelViewSet):
    """
    CRUD for Workflows. 
    Users can manage workflows for their own projects.
    """
    queryset = Workflow.objects.select_related("project", "created_by").all()
    serializer_class = WorkflowSerializer
    permission_classes = [permissions.IsAuthenticated]

    def get_queryset(self):
        """Filter workflows to only show user's own projects."""
        return self.queryset.filter(project__owner=self.request.user)

    def get_permissions(self):
        # Allow users to create/update/delete their own workflows
        if self.action in ("create", "update", "partial_update", "destroy", "save_workflow", "load_workflow"):
            return [permissions.IsAuthenticated()]
        return super().get_permissions()

    def perform_create(self, serializer):
        # Ensure user owns the project
        project = serializer.validated_data.get('project')
        if project.owner != self.request.user:
            raise permissions.PermissionDenied("You can only create workflows for your own projects.")
        serializer.save(created_by=self.request.user)

    def dispatch(self, request, *args, **kwargs):
        # Exempt CSRF for save and load actions
        if request.path.endswith('/save/') or request.path.endswith('/load/'):
            print(f"🔧 CSRF exemption applied for path: {request.path}")
            setattr(request, '_dont_enforce_csrf_checks', True)
        return super().dispatch(request, *args, **kwargs)

    @action(detail=False, methods=['post'], url_path='save')
    def save_workflow(self, request):
        """
        Save a workflow from the canvas to PostgreSQL.
        Expects: { project_id, name, slug, canvas_data }
        """
        try:
            project_id = request.data.get('project_id')
            name = request.data.get('name')
            slug = request.data.get('slug')
            workflow_id = request.data.get('workflow_id')  # Format: {client_name}/{app_name}/{project_name}
            canvas_data = request.data.get('canvas_data', {})
            context = request.data.get('context', {})
            
            print(f"🔧 Received context data: {context}")
            print(f"🆔 Received workflow_id: {workflow_id}")
            
            # Validate project ownership
            project = get_object_or_404(Project, id=project_id, owner=request.user)
            
            # Create or update workflow
            workflow, created = Workflow.objects.get_or_create(
                project=project,
                slug=slug,
                defaults={
                    'name': name,
                    'dag_spec': canvas_data,
                    'created_by': request.user
                }
            )
            
            # Create enhanced dag_spec with context information
            enhanced_dag_spec = {
                **canvas_data,
                'workflow_id': workflow_id,  # Structured workflow identifier
                'context': {
                    'client_name': context.get('client_name'),
                    'app_name': context.get('app_name'),
                    'project_name': context.get('project_name'),
                    'created_at': canvas_data.get('metadata', {}).get('saved_at'),
                    'use_case': context.get('app_name', 'Unknown Use Case'),
                    'environment': {
                        'client': context.get('client_name', 'Unknown Client'),
                        'app': context.get('app_name', 'Unknown App'),
                        'project': context.get('project_name', 'Unknown Project'),
                        'workflow_id': workflow_id  # Single structured identifier
                    }
                }
            }
            
            # Always update workflow data
            workflow.name = name
            workflow.dag_spec = enhanced_dag_spec
            workflow.save()
            
            print(f"🔧 Enhanced DAG spec with context: {enhanced_dag_spec.get('context', {})}")
            
            # Always clear existing workflow atoms to avoid duplicates
            existing_count = workflow.workflow_atoms.count()
            print(f"🔧 Clearing {existing_count} existing workflow atoms for workflow {workflow.id}")
            workflow.workflow_atoms.all().delete()
            
            # Save workflow atoms from canvas data
            if 'molecules' in canvas_data:
                global_order = 0  # Global order across all molecules
                for molecule_data in canvas_data['molecules']:
                    if 'selectedAtoms' in molecule_data and 'atomOrder' in molecule_data:
                        for atom_name in molecule_data['atomOrder']:
                            if molecule_data['selectedAtoms'].get(atom_name, False):
                                try:
                                    atom = Atom.objects.get(name=atom_name)
                                    WorkflowAtom.objects.create(
                                        workflow=workflow,
                                        atom=atom,
                                        order=global_order,
                                        config=molecule_data.get('config', {})
                                    )
                                    print(f"🔧 Created WorkflowAtom: {atom.name} with order {global_order}")
                                    global_order += 1
                                except Atom.DoesNotExist:
                                    # Create a default atom if it doesn't exist
                                    try:
                                        # Try to get or create a default category
                                        from apps.atoms.models import AtomCategory
                                        default_category, _ = AtomCategory.objects.get_or_create(
                                            name='Default',
                                            defaults={'description': 'Default category for auto-created atoms'}
                                        )
                                        
                                        # Create the atom
                                        atom, _ = Atom.objects.get_or_create(
                                            name=atom_name,
                                            defaults={
                                                'slug': atom_name.lower().replace(' ', '-').replace('_', '-'),
                                                'category': default_category,
                                                'description': f'Auto-created atom: {atom_name}'
                                            }
                                        )
                                        
                                        WorkflowAtom.objects.create(
                                            workflow=workflow,
                                            atom=atom,
                                            order=global_order,
                                            config=molecule_data.get('config', {})
                                        )
                                        print(f"🔧 Created auto-generated WorkflowAtom: {atom.name} with order {global_order}")
                                        global_order += 1
                                    except Exception as e:
                                        print(f"Failed to create atom {atom_name}: {e}")
                                        continue
            
            final_count = workflow.workflow_atoms.count()
            print(f"🔧 Workflow {workflow.id} now has {final_count} atoms")
            
            serializer = self.get_serializer(workflow)
            return Response({
                'success': True,
                'message': 'Workflow saved successfully',
                'workflow': serializer.data,
                'created': created
            }, status=status.HTTP_201_CREATED if created else status.HTTP_200_OK)
            
        except Exception as e:
            return Response({
                'success': False,
                'message': f'Failed to save workflow: {str(e)}'
            }, status=status.HTTP_400_BAD_REQUEST)

    @action(detail=False, methods=['get'], url_path='load')
    def load_workflow(self, request):
        """
        Load a saved workflow for a project.
        Expects: project_id and optionally slug
        """
        try:
            project_id = request.query_params.get('project_id')
            slug = request.query_params.get('slug')
            
            # Validate project ownership
            project = get_object_or_404(Project, id=project_id, owner=request.user)
            
            if slug:
                # Load specific workflow
                workflow = get_object_or_404(Workflow, project=project, slug=slug)
                serializer = self.get_serializer(workflow)
                return Response({
                    'success': True,
                    'workflow': serializer.data
                })
            else:
                # Load all workflows for project
                workflows = Workflow.objects.filter(project=project).order_by('-updated_at')
                serializer = self.get_serializer(workflows, many=True)
                return Response({
                    'success': True,
                    'workflows': serializer.data
                })
                
        except Exception as e:
            return Response({
                'success': False,
                'message': f'Failed to load workflow: {str(e)}'
            }, status=status.HTTP_400_BAD_REQUEST)


class WorkflowAtomViewSet(viewsets.ModelViewSet):
    """
    CRUD for WorkflowAtom entries.
    Admin-only for writes; read-only for authenticated users.
    """
    queryset = WorkflowAtom.objects.select_related("workflow", "atom").all()
    serializer_class = WorkflowAtomSerializer
    permission_classes = [permissions.IsAuthenticated]

    def get_permissions(self):
        if self.action in ("create", "update", "partial_update", "destroy"):
            return [permissions.IsAdminUser()]
        return super().get_permissions()


class WorkflowRunViewSet(viewsets.ModelViewSet):
    """
    CRUD for WorkflowRun. 
    Admin-only for destructive writes; authenticated may list/retrieve their runs.
    """
    queryset = WorkflowRun.objects.select_related("workflow", "initiated_by").all()
    serializer_class = WorkflowRunSerializer
    permission_classes = [permissions.IsAuthenticated]

    def get_permissions(self):
        if self.action in ("update", "partial_update", "destroy"):
            return [permissions.IsAdminUser()]
        return super().get_permissions()

    def perform_create(self, serializer):
        serializer.save(initiated_by=self.request.user)
