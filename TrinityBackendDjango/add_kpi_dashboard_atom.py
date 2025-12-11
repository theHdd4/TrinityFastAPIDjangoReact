#!/usr/bin/env python
"""
Script to add kpi-dashboard atom to the trinity_v1_atoms table in PostgreSQL.
This can be run directly or via Django management command.

Usage:
    python manage.py shell < add_kpi_dashboard_atom.py
    OR
    python add_kpi_dashboard_atom.py (if Django is configured)
"""

import os
import sys
import django

# Setup Django
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
os.environ.setdefault('DJANGO_SETTINGS_MODULE', 'config.settings')
django.setup()

from apps.trinity_v1_atoms.models import TrinityV1Atom

def add_kpi_dashboard_atom():
    """Add kpi-dashboard atom to the database"""
    atom_data = {
        'atom_id': 'kpi-dashboard',
        'name': 'KPI Dashboard',
        'description': 'Display key performance indicators with metrics, trends, and insights',
        'category': 'Business Intelligence',
        'tags': ['kpi', 'dashboard', 'metrics', 'insights', 'analytics'],
        'color': 'bg-emerald-500',
        'available_atoms': True
    }
    
    atom, created = TrinityV1Atom.objects.get_or_create(
        atom_id=atom_data['atom_id'],
        defaults=atom_data
    )
    
    if created:
        print(f"✅ Created: {atom.name} ({atom.atom_id})")
    else:
        # Update existing record
        atom.name = atom_data['name']
        atom.description = atom_data['description']
        atom.category = atom_data['category']
        atom.tags = atom_data['tags']
        atom.color = atom_data['color']
        atom.available_atoms = True
        atom.save()
        print(f"🔄 Updated: {atom.name} ({atom.atom_id})")
    
    print(f"\n✅ KPI Dashboard atom is now in the database!")
    print(f"   - Atom ID: {atom.atom_id}")
    print(f"   - Name: {atom.name}")
    print(f"   - Category: {atom.category}")
    print(f"   - Available: {atom.available_atoms}")
    print(f"   - Tags: {atom.tags}")
    print(f"   - Color: {atom.color}")

if __name__ == '__main__':
    add_kpi_dashboard_atom()



