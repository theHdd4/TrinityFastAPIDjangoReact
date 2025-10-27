from rest_framework import viewsets, status
from rest_framework.decorators import action
from rest_framework.response import Response
from rest_framework.permissions import AllowAny
from django.http import JsonResponse
from .models import Molecule
from .serializers import MoleculeSerializer


class MoleculeViewSet(viewsets.ModelViewSet):
    """
    API endpoint for managing molecules.
    """
    queryset = Molecule.objects.all()
    serializer_class = MoleculeSerializer
    permission_classes = [AllowAny]  # Adjust as needed for your auth system
    lookup_field = 'molecule_id'  # Allow lookup by molecule_id instead of pk
    
    @action(detail=False, methods=['get'])
    def molecules_for_frontend(self, request):
        """
        API endpoint that serves molecules in the format expected by the frontend.
        Returns all molecules with their specific atoms (only atoms that have matching IDs).
        """
        from apps.trinity_v1_atoms.models import TrinityV1Atom
        
        molecules = Molecule.objects.all().order_by('name')
        
        frontend_molecules = []
        for molecule in molecules:
            # Get only the atoms that have matching IDs in this molecule
            atom_ids = molecule.atoms or []
            matching_atoms = TrinityV1Atom.objects.filter(id__in=atom_ids)
            
            atoms_list = []
            for atom in matching_atoms:
                atoms_list.append({
                    'id': atom.atom_id,
                    'name': atom.name,
                    'description': atom.description,
                    'category': atom.category
                })
            
            frontend_molecules.append({
                'id': molecule.molecule_id,
                'type': molecule.type,
                'title': molecule.name,
                'subtitle': molecule.subtitle,
                'tag': molecule.tag,
                'atoms': atoms_list  # Only atoms with matching IDs
            })
        
        return Response({
            'success': True,
            'molecules': frontend_molecules,
            'total': len(frontend_molecules)
        })
    
    @action(detail=True, methods=['get'], url_path='atoms')
    def get_atoms(self, request, molecule_id=None):
        """
        Get atoms for a specific molecule (only atoms with matching IDs).
        """
        from apps.trinity_v1_atoms.models import TrinityV1Atom
        
        try:
            molecule = Molecule.objects.get(molecule_id=molecule_id)
            
            # Get only the atoms that have matching IDs in this molecule
            atom_ids = molecule.atoms or []
            matching_atoms = TrinityV1Atom.objects.filter(id__in=atom_ids)
            
            atoms_list = []
            for atom in matching_atoms:
                atoms_list.append({
                    'id': atom.atom_id,
                    'name': atom.name,
                    'description': atom.description,
                    'category': atom.category
                })
            
            return Response({
                'success': True,
                'molecule_id': molecule.molecule_id,
                'molecule_name': molecule.name,
                'atoms': atoms_list,  # Only atoms with matching IDs
                'total_atoms': len(atoms_list)
            })
        except Molecule.DoesNotExist:
            return Response({
                'success': False,
                'error': f'Molecule with ID "{molecule_id}" not found'
            }, status=status.HTTP_404_NOT_FOUND)


def molecules_api(request):
    """
    Simple API endpoint for molecules (for backward compatibility).
    """
    molecules = Molecule.objects.all().order_by('name')
    
    molecules_data = []
    for molecule in molecules:
        molecules_data.append({
            'id': molecule.molecule_id,
            'type': molecule.type,
            'title': molecule.name,
            'subtitle': molecule.subtitle,
            'tag': molecule.tag,
            'atoms': molecule.atoms or []
        })
    
    return JsonResponse({
        'success': True,
        'molecules': molecules_data,
        'total': len(molecules_data)
    })

