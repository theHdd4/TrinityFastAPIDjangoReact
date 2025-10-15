from rest_framework import viewsets, status
from rest_framework.decorators import action
from rest_framework.response import Response
from rest_framework.permissions import AllowAny
from django.http import JsonResponse
from .models import UseCase
from .serializers import UseCaseSerializer


class UseCaseViewSet(viewsets.ModelViewSet):
    """
    API endpoint for managing use cases (apps).
    This serves as the source of truth for frontend apps.
    """
    queryset = UseCase.objects.all()
    serializer_class = UseCaseSerializer
    permission_classes = [AllowAny]  # Adjust as needed for your auth system
    
    @action(detail=False, methods=['get'])
    def apps_for_frontend(self, request):
        """
        API endpoint that serves apps in the format expected by the frontend.
        This replaces the hardcoded apps array in Apps.tsx
        """
        apps = UseCase.objects.prefetch_related('molecule_objects').all().order_by('name')
        
        frontend_apps = []
        for app in apps:
            # Get molecule details from the many-to-many relationship
            molecule_details = []
            for mol in app.molecule_objects.all():
                molecule_details.append({
                    'id': mol.molecule_id,
                    'type': mol.type,
                    'title': mol.name,
                    'subtitle': mol.subtitle,
                    'tag': mol.tag,
                    'atoms': mol.atoms
                })
            
            frontend_apps.append({
                'id': app.id,
                'name': app.name,
                'slug': app.slug,
                'description': app.description,
                'modules': app.modules or [],
                'molecules': app.molecules or [],  # JSON array of molecule IDs
                'molecule_details': molecule_details
            })
        
        return Response({
            'success': True,
            'apps': frontend_apps,
            'total': len(frontend_apps)
        })
    
    @action(detail=False, methods=['get'], url_path='molecules-by-slug/(?P<slug>[^/.]+)')
    def molecules_by_slug(self, request, slug=None):
        """
        Get molecules for a specific app by slug.
        Used by the workflow area to display app-specific molecules.
        """
        try:
            from apps.trinity_v1_atoms.models import TrinityV1Atom
            
            app = UseCase.objects.prefetch_related('molecule_objects').get(slug=slug)
            
            # Get molecules from the many-to-many relationship
            molecules_list = []
            for mol in app.molecule_objects.all():
                # Get atom names from trinity_v1_atoms table
                atom_ids = mol.atoms or []
                matching_atoms = TrinityV1Atom.objects.filter(id__in=atom_ids)
                atom_names = [atom.name for atom in matching_atoms]
                
                molecules_list.append({
                    'id': mol.molecule_id,
                    'type': mol.type,
                    'title': mol.name,
                    'subtitle': mol.subtitle,
                    'tag': mol.tag,
                    'atoms': atom_names  # Return atom names instead of IDs
                })
            
            return Response({
                'success': True,
                'app_name': app.name,
                'app_slug': app.slug,
                'molecules': molecules_list,
                'total': len(molecules_list)
            })
        except UseCase.DoesNotExist:
            return Response({
                'success': False,
                'error': f'App with slug "{slug}" not found'
            }, status=status.HTTP_404_NOT_FOUND)


def apps_api(request):
    """
    Simple API endpoint for apps (for backward compatibility)
    """
    apps = UseCase.objects.all().order_by('name')
    
    apps_data = []
    for app in apps:
        apps_data.append({
            'id': app.id,
            'slug': app.slug,
            'name': app.name,
            'description': app.description,
            'modules': app.modules or [],
            'molecules': app.molecules or []  # JSON array of molecule IDs
        })
    
    return JsonResponse({
        'success': True,
        'apps': apps_data,
        'total': len(apps_data)
    })
