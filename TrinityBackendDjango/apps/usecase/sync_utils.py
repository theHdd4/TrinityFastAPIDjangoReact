"""
Dynamic sync utilities for molecules and atoms from frontend components.
This module reads molecule/atom definitions from the frontend and syncs them to the database.
"""

import os
import json
import re
from pathlib import Path
from typing import List, Dict, Any


class MoleculeAtomSync:
    """
    Syncs molecules and atoms from frontend components to the database.
    """
    
    def __init__(self, frontend_path: str = None):
        """
        Initialize the sync utility.
        
        Args:
            frontend_path: Path to the frontend directory. If None, will auto-detect.
        """
        if frontend_path is None:
            # Auto-detect frontend path relative to Django project
            current_dir = Path(__file__).parent.parent.parent.parent
            # Try different possible paths
            possible_paths = [
                current_dir / "TrinityFrontend",
                current_dir.parent / "TrinityFrontend", 
                current_dir.parent.parent / "TrinityFrontend",
                Path("/TrinityFrontend"),  # Docker container path
                Path("/code/TrinityFrontend"),  # Alternative Docker path
                Path("/app/TrinityFrontend"),  # Another Docker path
            ]
            
            for path in possible_paths:
                if path.exists():
                    self.frontend_path = path
                    break
            else:
                # Fallback to current directory structure
                self.frontend_path = current_dir / "TrinityFrontend"
                # Print debug info if frontend not found
                print(f"Frontend path not found. Tried:")
                for path in possible_paths:
                    print(f"  - {path} (exists: {path.exists()})")
                print(f"Using fallback: {self.frontend_path}")
        else:
            self.frontend_path = Path(frontend_path)
    
    def get_molecules_from_frontend(self) -> List[Dict[str, Any]]:
        """
        Read molecules from the frontend molecules.ts file.
        
        Returns:
            List of molecule dictionaries
        """
        molecules_file = self.frontend_path / "src" / "components" / "MoleculeList" / "data" / "molecules.ts"
        
        if not molecules_file.exists():
            print(f"Warning: Molecules file not found: {molecules_file}")
            print(f"Frontend path: {self.frontend_path}")
            print("Using fallback molecules...")
            return self._get_fallback_molecules()
        
        try:
            with open(molecules_file, 'r', encoding='utf-8') as f:
                content = f.read()
            
            # Extract the molecules array using regex
            # Look for: export const molecules = [...]
            pattern = r'export const molecules = \[(.*?)\];'
            match = re.search(pattern, content, re.DOTALL)
            
            if not match:
                print("Warning: Could not find molecules array in the file")
                return self._get_fallback_molecules()
            
            # Parse the JavaScript array into Python
            molecules_js = match.group(1)
            
            # Convert JavaScript object syntax to Python-compatible JSON
            # This is a simplified parser - in production you might want to use a proper JS parser
            molecules_js = molecules_js.replace('id:', '"id":')
            molecules_js = molecules_js.replace('type:', '"type":')
            molecules_js = molecules_js.replace('title:', '"title":')
            molecules_js = molecules_js.replace('subtitle:', '"subtitle":')
            molecules_js = molecules_js.replace('tag:', '"tag":')
            molecules_js = molecules_js.replace('atoms:', '"atoms":')
            
            # Handle single quotes
            molecules_js = molecules_js.replace("'", '"')
            
            try:
                molecules = json.loads(f"[{molecules_js}]")
                return molecules
            except json.JSONDecodeError as e:
                # Fallback: return hardcoded molecules if parsing fails
                print(f"Warning: Could not parse molecules file: {e}")
                return self._get_fallback_molecules()
                
        except Exception as e:
            print(f"Warning: Error reading molecules file: {e}")
            return self._get_fallback_molecules()
    
    def _get_fallback_molecules(self) -> List[Dict[str, Any]]:
        """
        Fallback molecules if frontend file cannot be parsed.
        """
        return [
            {
                'id': 'build',
                'type': 'Build',
                'title': 'Build',
                'subtitle': 'Model building and creation',
                'tag': 'Modeling',
                'atoms': [
                    'Auto-regressive models',
                    'Model Output - Non CSF',
                    'Single Modeling'
                ]
            },
            {
                'id': 'data-pre-process',
                'type': 'Data Pre-Process',
                'title': 'Data Pre-Process',
                'subtitle': 'Data preparation and processing',
                'tag': 'Data Processing',
                'atoms': [
                    'Base Price Estimator',
                    'Clustering',
                    'Data Preparation',
                    'Promo Comparison',
                    'Promotion Intensity Analysis'
                ]
            },
            {
                'id': 'explore',
                'type': 'Explore',
                'title': 'Explore',
                'subtitle': 'Data exploration and analysis',
                'tag': 'Exploration',
                'atoms': [
                    'Correlation',
                    'Depth Ladder',
                    'EDA',
                    'Promo Comparison',
                    'Promotion Intensity Analysis'
                ]
            },
            {
                'id': 'engineer',
                'type': 'Engineer',
                'title': 'Engineer',
                'subtitle': 'Model engineering and algorithm synthesis',
                'tag': 'Engineering',
                'atoms': [
                    'Bulk Model Output - CSF',
                    'Bulk Modeling',
                    'Key Selector',
                    'Model Performance',
                    'Model Selector',
                    'Concatination',
                    'Create or Transform',
                    'Delete',
                    'Merge',
                    'Rename'
                ]
            },
            {
                'id': 'pre-process',
                'type': 'Pre Process',
                'title': 'Pre Process',
                'subtitle': 'Initial data preprocessing',
                'tag': 'Preprocessing',
                'atoms': [
                    'Feature Over View',
                    'GroupBy'
                ]
            },
            {
                'id': 'evaluate',
                'type': 'Evaluate',
                'title': 'Evaluate',
                'subtitle': 'Model evaluation and results',
                'tag': 'Analysis',
                'atoms': []
            },
            {
                'id': 'plan',
                'type': 'Plan',
                'title': 'Plan',
                'subtitle': 'Planning tasks and workflows',
                'tag': 'Planning',
                'atoms': []
            },
            {
                'id': 'report',
                'type': 'Report',
                'title': 'Report',
                'subtitle': 'Reporting and presentation',
                'tag': 'Reporting',
                'atoms': []
            }
        ]
    
    def get_all_atoms_from_molecules(self, molecules: List[Dict[str, Any]]) -> List[str]:
        """
        Extract all unique atoms from molecules.
        
        Args:
            molecules: List of molecule dictionaries
            
        Returns:
            Sorted list of unique atom names
        """
        all_atoms = set()
        for molecule in molecules:
            all_atoms.update(molecule.get('atoms', []))
        return sorted(list(all_atoms))
    
    def get_apps_from_frontend(self) -> List[Dict[str, Any]]:
        """
        Read app definitions from frontend Apps.tsx file.
        This dynamically reads app information from the frontend source.
        
        Returns:
            List of app dictionaries with name, slug, and description
        """
        apps_file = self.frontend_path / "src" / "pages" / "Apps.tsx"
        
        if not apps_file.exists():
            # If frontend file not found, use fallback data
            print(f"Warning: Apps file not found: {apps_file}")
            print("Using fallback app definitions...")
            return self._get_fallback_apps()
        
        content = apps_file.read_text()
        
        # Extract the apps array using regex
        # Look for the apps array definition
        match = re.search(r'const apps = \[(.*?)\];', content, re.DOTALL)
        if not match:
            raise ValueError("Could not find 'const apps = [...];' in Apps.tsx")
        
        # Clean up the extracted string to make it valid JSON
        apps_str = f"[{match.group(1)}]"
        
        # Replace JavaScript object syntax with JSON syntax
        apps_str = apps_str.replace('id:', '"id":')
        apps_str = apps_str.replace('title:', '"title":')
        apps_str = apps_str.replace('description:', '"description":')
        apps_str = apps_str.replace('icon:', '"icon":')
        apps_str = apps_str.replace('color:', '"color":')
        apps_str = apps_str.replace('category:', '"category":')
        apps_str = apps_str.replace('featured:', '"featured":')
        apps_str = apps_str.replace('custom:', '"custom":')
        apps_str = apps_str.replace('modules:', '"modules":')
        
        # Remove trailing commas that might break JSON parsing
        apps_str = re.sub(r',\s*([}\]])', r'\1', apps_str)
        
        # Remove JavaScript-specific syntax
        apps_str = re.sub(r'Target|LineChart|Zap|Plus|PieChart|Users|TrendingUp|ShoppingCart|Brain|Database', '"icon"', apps_str)
        
        # Attempt to parse as JSON
        try:
            apps_data = json.loads(apps_str)
        except json.JSONDecodeError as e:
            raise ValueError(f"Failed to parse Apps.tsx content as JSON: {e}\nContent:\n{apps_str}")
        
        # Extract only the fields we need for the database
        extracted_apps = []
        for app in apps_data:
            if isinstance(app, dict):
                extracted_apps.append({
                    'name': app.get('title', ''),
                    'slug': app.get('id', ''),
                    'description': app.get('description', '')
                })
        
        return extracted_apps
    
    def _get_fallback_apps(self) -> List[Dict[str, Any]]:
        """
        Returns hardcoded app definitions as fallback.
        These match the apps defined in the frontend Apps.tsx file.
        """
        return [
            {
                'name': 'Marketing Mix Modeling',
                'slug': 'marketing-mix',
                'description': 'Optimize marketing spend allocation across different channels and measure incremental impact'
            },
            {
                'name': 'Forecasting Analysis',
                'slug': 'forecasting',
                'description': 'Predict future trends and patterns with advanced time series analysis and modeling'
            },
            {
                'name': 'Promo Effectiveness',
                'slug': 'promo-effectiveness',
                'description': 'Measure and analyze promotional campaign performance and ROI across touchpoints'
            },
            {
                'name': 'Exploratory Data Analysis',
                'slug': 'exploratory-data-analysis',
                'description': 'Perform comprehensive exploratory data analysis with advanced visualization and statistical insights'
            },
            {
                'name': 'Customer Segmentation',
                'slug': 'customer-segmentation',
                'description': 'Segment customers based on behavior, demographics, and purchase patterns using ML clustering'
            },
            {
                'name': 'Demand Forecasting',
                'slug': 'demand-forecasting',
                'description': 'Predict product demand and inventory requirements with machine learning models'
            },
            {
                'name': 'Price Optimization',
                'slug': 'price-optimization',
                'description': 'Optimize pricing strategies using elasticity models and competitive intelligence'
            },
            {
                'name': 'Churn Prediction',
                'slug': 'churn-prediction',
                'description': 'Identify at-risk customers and predict churn probability with ML classification models'
            },
            {
                'name': 'Data Integration Hub',
                'slug': 'data-integration',
                'description': 'Connect, transform, and consolidate data from multiple sources into unified datasets'
            },
            {
                'name': 'Create Blank App',
                'slug': 'blank',
                'description': 'Start from scratch with a clean canvas and build your custom analysis workflow'
            }
        ]
    
    def sync_apps_to_database(self, usecase_model):
        """
        Sync app definitions from frontend to the database.
        This creates/updates use cases based on frontend app definitions.
        
        Args:
            usecase_model: The UseCase model clas
            
        Returns:
            Dictionary with sync results
        """
        try:
            # Get apps from frontend
            frontend_apps = self.get_apps_from_frontend()
            
            # Get molecules and atoms for all apps
            molecules = self.get_molecules_from_frontend()
            atoms = self.get_all_atoms_from_molecules(molecules)
            
            created_count = 0
            updated_count = 0
            
            for app_data in frontend_apps:
                # Create or update the use case
                usecase, created = usecase_model.objects.get_or_create(
                    slug=app_data['slug'],
                    defaults={
                        'name': app_data['name'],
                        'description': app_data['description'],
                        'molecules': molecules,
                        'atoms': atoms
                    }
                )
                
                if created:
                    created_count += 1
                else:
                    # Update existing record with latest data
                    usecase.name = app_data['name']
                    usecase.description = app_data['description']
                    usecase.molecules = molecules
                    usecase.atoms = atoms
                    usecase.save()
                    updated_count += 1
            
            return {
                'success': True,
                'apps_count': len(frontend_apps),
                'molecules_count': len(molecules),
                'atoms_count': len(atoms),
                'created_usecases': created_count,
                'updated_usecases': updated_count
            }
            
        except Exception as e:
            return {
                'success': False,
                'error': str(e)
            }
    
    def sync_to_database(self, usecase_model):
        """
        Sync molecules and atoms to all use cases in the database.
        
        IMPORTANT: Only updates 'molecules' and 'atoms' fields.
        Does NOT create 'molecules_used' or 'atoms_in_molecules' fields.
        
        Args:
            usecase_model: The UseCase model class
        """
        try:
            # Get molecules from frontend
            molecules = self.get_molecules_from_frontend()
            atoms = self.get_all_atoms_from_molecules(molecules)
            
            # Validate that we're only updating the correct fields
            if not isinstance(molecules, list):
                raise ValueError("Molecules must be a list")
            if not isinstance(atoms, list):
                raise ValueError("Atoms must be a list")
            
            # Update all use cases with the latest molecules and atoms
            # ONLY update molecules and atoms fields - no deprecated fields
            updated_count = usecase_model.objects.update(
                molecules=molecules,
                atoms=atoms
            )
            
            return {
                'success': True,
                'molecules_count': len(molecules),
                'atoms_count': len(atoms),
                'updated_usecases': updated_count
            }
            
        except Exception as e:
            return {
                'success': False,
                'error': str(e)
            }
