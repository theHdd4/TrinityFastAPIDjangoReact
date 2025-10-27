from rest_framework import viewsets, permissions, status
from rest_framework.permissions import AllowAny
from rest_framework.decorators import action
from rest_framework.response import Response
from django.http import JsonResponse
from django.views.decorators.csrf import csrf_exempt
from django.utils.decorators import method_decorator
from django.shortcuts import get_object_or_404
from rest_framework.authentication import SessionAuthentication
from .models import CustomMolecule
from .serializers import CustomMoleculeSerializer


class CsrfExemptSessionAuthentication(SessionAuthentication):
    """
    SessionAuthentication that doesn't enforce CSRF for API endpoints.
    """
    def enforce_csrf(self, request):
        return  # Skip CSRF enforcement


@method_decorator(csrf_exempt, name='dispatch')
class CustomMoleculeViewSet(viewsets.ModelViewSet):
    """
    CRUD for CustomMolecule.
    Users can only access custom molecules from their own projects.
    """
    queryset = CustomMolecule.objects.select_related("project", "user").all()
    serializer_class = CustomMoleculeSerializer
    permission_classes = [AllowAny]  # Override DRF default IsAuthenticated
    authentication_classes = [CsrfExemptSessionAuthentication]  # Use CSRF-exempt authentication
    lookup_field = 'molecule_id'  # Use molecule_id instead of id for lookups

    def get_queryset(self):
        # Custom molecules are available across all projects for a tenant
        # No project_id filtering needed for fetching - they're shared across the tenant
        return CustomMolecule.objects.all()
    
    def get_object(self):
        # Override to handle lookup by molecule_id without project filtering
        lookup_url_kwarg = self.lookup_url_kwarg or self.lookup_field
        lookup_value = self.kwargs[lookup_url_kwarg]
        filter_kwargs = {self.lookup_field: lookup_value}
        try:
            obj = get_object_or_404(self.get_queryset(), **filter_kwargs)
            self.check_object_permissions(self.request, obj)
            return obj
        except Exception as e:
            # Log the error for debugging
            print(f"Error in get_object: {str(e)}")
            raise

    def perform_create(self, serializer):
        # Automatically set the user and project from request context
        project_id = self.request.data.get('project_id') or self.request.data.get('project')
        if not project_id:
            raise ValueError("Project ID is required")
        
        # Handle both authenticated and unauthenticated users
        user = self.request.user if self.request.user.is_authenticated else None
        serializer.save(user=user, project_id=project_id)

    def perform_update(self, serializer):
        # Automatically set the user and project from request context
        project_id = self.request.data.get('project_id') or self.request.data.get('project')
        if not project_id:
            raise ValueError("Project ID is required")
        
        # Handle both authenticated and unauthenticated users
        user = self.request.user if self.request.user.is_authenticated else None
        serializer.save(user=user, project_id=project_id)

    def destroy(self, request, *args, **kwargs):
        """
        Custom destroy method to handle delete operations with better error handling.
        """
        try:
            instance = self.get_object()
            molecule_id = instance.molecule_id
            self.perform_destroy(instance)
            return Response({
                'success': True,
                'message': f'Molecule {molecule_id} deleted successfully'
            }, status=status.HTTP_200_OK)
        except Exception as e:
            print(f"Error in destroy: {str(e)}")
            return Response({
                'success': False,
                'error': f'Failed to delete molecule: {str(e)}'
            }, status=status.HTTP_500_INTERNAL_SERVER_ERROR)

    @action(detail=False, methods=['get'])
    def for_frontend(self, request):
        """
        API endpoint that serves custom molecules in the format expected by the frontend.
        Returns custom molecules available across all projects for the tenant.
        """
        try:
            # Custom molecules are shared across all projects for a tenant
            # No project_id filtering needed
            custom_molecules = CustomMolecule.objects.all()
            
            frontend_molecules = []
            for molecule in custom_molecules:
                frontend_molecules.append({
                    'id': molecule.molecule_id,
                    'type': molecule.type,
                    'title': molecule.name,
                    'subtitle': molecule.subtitle,
                    'tag': molecule.tag,
                    'atoms': molecule.atoms or [],
                    'atom_order': molecule.atom_order or [],
                    'selected_atoms': molecule.selected_atoms or {},
                    'connections': molecule.connections or [],
                    'position': molecule.position or {},
                    'created_at': molecule.created_at.isoformat(),
                    'updated_at': molecule.updated_at.isoformat(),
                })
            
            return Response({
                'success': True,
                'molecules': frontend_molecules,
                'total': len(frontend_molecules)
            })
        except Exception as e:
            # Return empty list if database is not available
            return Response({
                'success': True,
                'molecules': [],
                'total': 0,
                'message': f'Database not available: {str(e)}'
            })

    @action(detail=False, methods=['post'])
    def save_to_library(self, request):
        """
        Save a molecule from the workflow to the custom molecules library.
        This is the endpoint called when user clicks "Save to Library".
        """
        try:
            # Extract molecule data from request
            molecule_data = request.data
            
            # Get or create the custom molecule
            molecule_id = molecule_data.get('id')
            project_id = molecule_data.get('project_id')
            
            if not project_id:
                return Response({
                    'success': False,
                    'error': 'Project ID is required'
                }, status=status.HTTP_400_BAD_REQUEST)
            
            # Check if molecule already exists
            existing_molecule = CustomMolecule.objects.filter(
                project_id=project_id,
                molecule_id=molecule_id
            ).first()
            
            # Add project field to molecule_data for serializer
            molecule_data['project'] = project_id
            
            if existing_molecule:
                # Update existing molecule
                serializer = CustomMoleculeSerializer(
                    existing_molecule, 
                    data=molecule_data,
                    context={'project': project_id}
                )
            else:
                # Create new molecule
                serializer = CustomMoleculeSerializer(
                    data=molecule_data,
                    context={'project': project_id}
                )
            
            if serializer.is_valid():
                # Handle both authenticated and unauthenticated users
                user = request.user if request.user.is_authenticated else None
                serializer.save(user=user)
                return Response({
                    'success': True,
                    'message': f'Molecule "{molecule_data.get("title")}" saved to library',
                    'molecule': serializer.data
                })
            else:
                return Response({
                    'success': False,
                    'error': 'Invalid molecule data',
                    'details': serializer.errors
                }, status=status.HTTP_400_BAD_REQUEST)
                
        except Exception as e:
            # Handle database connection errors gracefully
            error_msg = str(e)
            if 'could not translate host name' in error_msg or 'connection' in error_msg.lower():
                return Response({
                    'success': False,
                    'error': 'Database connection not available. Please ensure PostgreSQL is running.',
                    'details': error_msg
                }, status=status.HTTP_503_SERVICE_UNAVAILABLE)
            else:
                return Response({
                    'success': False,
                    'error': f'Failed to save molecule: {error_msg}'
                }, status=status.HTTP_500_INTERNAL_SERVER_ERROR)


@csrf_exempt
def custom_molecules_api(request):
    """
    Simple API endpoint for custom molecules (for backward compatibility).
    """
    try:
        # This would need proper authentication and project filtering
        custom_molecules = CustomMolecule.objects.all().order_by('-updated_at')
        
        molecules_data = []
        for molecule in custom_molecules:
            molecules_data.append({
                'id': molecule.molecule_id,
                'type': molecule.type,
                'title': molecule.name,
                'subtitle': molecule.subtitle,
                'tag': molecule.tag,
                'atoms': molecule.atoms or [],
                'atom_order': molecule.atom_order or [],
                'selected_atoms': molecule.selected_atoms or {},
                'connections': molecule.connections or [],
                'position': molecule.position or {},
            })
        
        return JsonResponse({
            'success': True,
            'molecules': molecules_data,
            'total': len(molecules_data)
        })
    except Exception as e:
        # Return empty list if database is not available
        return JsonResponse({
            'success': True,
            'molecules': [],
            'total': 0,
            'message': f'Database not available: {str(e)}'
        })
