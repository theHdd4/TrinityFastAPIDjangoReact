#!/usr/bin/env python3
import os
import django

# Configure Django
os.environ.setdefault("DJANGO_SETTINGS_MODULE", "config.settings")
django.setup()

from apps.accounts.tenant_utils import switch_to_user_tenant, get_user_tenant_schema
from django.contrib.auth import get_user_model
from apps.registry.models import App
from apps.usecase.models import UseCase
from django_tenants.utils import schema_context
from apps.trinity_v1_atoms.models import TrinityV1Atom

User = get_user_model()
user = User.objects.get(username='abhishek.sahu@quantmatrix.ai')

print(f"User: {user.username}")
print(f"Schema: {get_user_tenant_schema(user)}")

try:
    with switch_to_user_tenant(user):
        print("✅ Successfully switched to tenant schema")
        
        # Get apps from the tenant schema
        apps = App.objects.all()
        print(f"✅ Registry Apps count: {apps.count()}")
        
        enriched_apps = []
        for app in apps:
            print(f"Processing app: {app.name} (usecase_id: {app.usecase_id})")
            
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
                    # Access UseCase from public schema
                    with schema_context('public'):
                        usecase = UseCase.objects.prefetch_related('molecule_objects').get(id=app.usecase_id)
                        app_data['modules'] = usecase.modules or []
                        app_data['molecules'] = usecase.molecules or []
                        
                        print(f"  ✅ UseCase found: {usecase.name}")
                        print(f"  ✅ Modules: {len(app_data['modules'])}")
                        print(f"  ✅ Molecules: {len(app_data['molecules'])}")
                        
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
                        
                        print(f"  ✅ Molecule atoms: {len(molecule_atoms)}")
                        print(f"  ✅ Atoms in molecules: {len(atoms_in_molecules)}")
                        
                except UseCase.DoesNotExist:
                    print(f"  ❌ UseCase {app.usecase_id} not found for app {app.slug}")
                except Exception as e:
                    print(f"  ❌ Error processing UseCase: {e}")
            
            enriched_apps.append(app_data)
        
        print(f"\n✅ Successfully processed {len(enriched_apps)} apps")
        
except Exception as e:
    print(f"❌ Error: {e}")
    import traceback
    traceback.print_exc()

print("Done!")
