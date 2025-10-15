#!/usr/bin/env python3
import os
import django

# Configure Django
os.environ.setdefault("DJANGO_SETTINGS_MODULE", "config.settings")
django.setup()

from apps.molecules.models import Molecule

print("Checking molecule data...")

molecule = Molecule.objects.first()
print(f"Molecule: {molecule.name}")
print(f"Atoms: {molecule.atoms}")
if molecule.atoms:
    print(f"First atom: {molecule.atoms[0]}")
    print(f"Type: {type(molecule.atoms[0])}")

print("Done!")
