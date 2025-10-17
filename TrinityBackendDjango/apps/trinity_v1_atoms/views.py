from rest_framework import viewsets, status
from rest_framework.decorators import action
from rest_framework.response import Response
from rest_framework.permissions import AllowAny
from django.http import JsonResponse
from .models import TrinityV1Atom
from .serializers import TrinityV1AtomSerializer


class TrinityV1AtomViewSet(viewsets.ModelViewSet):
    """
    API endpoint for managing Trinity V1 atoms.
    """
    queryset = TrinityV1Atom.objects.all()
    serializer_class = TrinityV1AtomSerializer
    permission_classes = [AllowAny]  # Allow access without authentication
    lookup_field = 'atom_id'  # Allow lookup by atom_id instead of pk
    
    @action(detail=False, methods=['get'])
    def atoms_for_frontend(self, request):
        """
        API endpoint that serves atoms in the format expected by the frontend.
        Returns all atoms.
        """
        atoms = TrinityV1Atom.objects.all().order_by('name')
        
        frontend_atoms = []
        for atom in atoms:
            frontend_atoms.append({
                'id': atom.atom_id,
                'name': atom.name,
                'description': atom.description,
                'category': atom.category
            })
        
        return Response({
            'success': True,
            'atoms': frontend_atoms,
            'total': len(frontend_atoms)
        })


def atoms_api(request):
    """
    Simple API endpoint for atoms (for backward compatibility).
    """
    atoms = TrinityV1Atom.objects.all().order_by('name')
    
    atoms_data = []
    for atom in atoms:
        atoms_data.append({
            'id': atom.atom_id,
            'name': atom.name,
            'description': atom.description,
            'category': atom.category
        })
    
    return JsonResponse({
        'success': True,
        'atoms': atoms_data,
        'total': len(atoms_data)
    })


def atoms_for_frontend_api(request):
    """
    API endpoint for frontend atoms without authentication.
    """
    atoms = TrinityV1Atom.objects.all().order_by('name')
    
    atoms_data = []
    for atom in atoms:
        atoms_data.append({
            'id': atom.atom_id,
            'name': atom.name,
            'description': atom.description,
            'category': atom.category,
            'tags': atom.tags,
            'color': atom.color
        })
    
    return JsonResponse({
        'success': True,
        'atoms': atoms_data,
        'total': len(atoms_data)
    })
