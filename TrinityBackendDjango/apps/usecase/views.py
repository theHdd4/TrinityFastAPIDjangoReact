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
        apps = UseCase.objects.all()
        
        frontend_apps = []
        for app in apps:
            frontend_apps.append({
                'id': app.slug,
                'title': app.name,
                'description': app.description,
                'molecules': app.molecules,
                'atoms': app.atoms,
                'slug': app.slug,
                'created_at': app.created_at.isoformat() if app.created_at else None,
                'updated_at': app.updated_at.isoformat() if app.updated_at else None
            })
        
        return Response({
            'success': True,
            'apps': frontend_apps,
            'total': len(frontend_apps)
        })
    
    @action(detail=False, methods=['get'])
    def molecules_and_atoms(self, request):
        """
        API endpoint that serves molecules and atoms for all apps.
        This replaces the hardcoded molecules.ts file.
        """
        # Get molecules and atoms from any use case (they should all be the same)
        usecase = UseCase.objects.first()
        if not usecase:
            return Response({
                'success': False,
                'error': 'No use cases found'
            }, status=status.HTTP_404_NOT_FOUND)
        
        return Response({
            'success': True,
            'molecules': usecase.molecules,
            'atoms': usecase.atoms,
            'total_molecules': len(usecase.molecules),
            'total_atoms': len(usecase.atoms)
        })


def apps_api(request):
    """
    Simple API endpoint for apps (for backward compatibility)
    """
    apps = UseCase.objects.all()
    
    apps_data = []
    for app in apps:
        apps_data.append({
            'id': app.id,
            'slug': app.slug,
            'name': app.name,
            'description': app.description,
            'molecules': app.molecules,
            'atoms': app.atoms
        })
    
    return JsonResponse({
        'success': True,
        'apps': apps_data,
        'total': len(apps_data)
    })