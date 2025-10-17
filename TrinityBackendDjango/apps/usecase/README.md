# UseCase App Documentation

## Overview

The UseCase app manages application definitions in the Trinity system. It stores app information including modules, molecules, and atoms in the **PostgreSQL public schema**, serving as the single source of truth for frontend applications.

**Important:** This app only stores app definitions (metadata). Workflows are stored separately in the **tenant schema** via the `apps.workflows` app.

## Database Schema

The `usecase` table contains the following columns:

```sql
CREATE TABLE usecase (
    id BIGSERIAL PRIMARY KEY,
    name VARCHAR(150) NOT NULL UNIQUE,
    slug VARCHAR(150) NOT NULL UNIQUE,
    description TEXT,
    modules JSONB DEFAULT '[]',                    -- Array of module IDs
    molecules JSONB DEFAULT '[]',                  -- Array of molecule IDs
    molecule_atoms JSONB DEFAULT '{}',             -- Mapping of molecule details with atoms
    atoms_in_molecules JSONB DEFAULT '[]'          -- Flattened list of all atoms
);
```

## Data Structure

### Molecules and Atoms
Each app can have different molecules, and each molecule contains specific atoms:

```json
{
  "molecules": ["build", "explore", "data-pre-process"],
  "molecule_atoms": {
    "build": {
      "id": "build",
      "title": "Build",
      "subtitle": "Model building and creation",
      "tag": "Modeling",
      "atoms": ["Auto-regressive models", "Model Output - Non CSF", "Single Modeling"]
    },
    "explore": {
      "id": "explore",
      "title": "Explore", 
      "subtitle": "Data exploration and analysis",
      "tag": "Exploration",
      "atoms": ["Correlation", "Depth Ladder", "EDA", "Promo Comparison"]
    }
  },
  "atoms_in_molecules": [
    "Auto-regressive models", "Model Output - Non CSF", "Single Modeling",
    "Correlation", "Depth Ladder", "EDA", "Promo Comparison"
  ]
}
```

## Management Commands

### 📋 List All Apps

```bash
# List all apps in table format
docker-compose run --rm web python manage.py list_apps

# List with detailed information
docker-compose run --rm web python manage.py list_apps --detailed

# Export as JSON
docker-compose run --rm web python manage.py list_apps --format json
```

### ➕ Add New App

```bash
# Basic app creation
docker-compose run --rm web python manage.py add_app \
  --name "New Analytics App" \
  --slug "new-analytics" \
  --description "Advanced analytics application"

# App with modules
docker-compose run --rm web python manage.py add_app \
  --name "Marketing App" \
  --slug "marketing-app" \
  --description "Marketing analysis tool" \
  --modules "module1" "module2" "module3"

# App with molecules
docker-compose run --rm web python manage.py add_app \
  --name "Data Science App" \
  --slug "data-science" \
  --description "Data science platform" \
  --molecules "build" "explore" "engineer"
```

### 📦 Populate Apps from Apps.tsx

```bash
# Populate all apps with data from frontend Apps.tsx
docker-compose run --rm web python manage.py populate_usecases
```

## Database Operations

### 🗑️ Remove Columns

```bash
# Remove specific columns from usecase table
docker-compose run --rm web python manage.py shell -c "
from django.db import connection
cursor = connection.cursor()
cursor.execute('ALTER TABLE usecase DROP COLUMN IF EXISTS column_name;')
print('✅ Column removed successfully')
"

# Remove multiple columns
docker-compose run --rm web python manage.py shell -c "
from django.db import connection
cursor = connection.cursor()
columns_to_remove = ['old_column1', 'old_column2', 'deprecated_column']
for column in columns_to_remove:
    cursor.execute(f'ALTER TABLE usecase DROP COLUMN IF EXISTS {column};')
    print(f'✅ Removed column: {column}')
"
```

### 🗑️ Remove Rows (Apps)

```bash
# Remove app by ID
docker-compose run --rm web python manage.py shell -c "
from apps.usecase.models import UseCase
UseCase.objects.filter(id=12).delete()
print('✅ App with ID 12 removed')
"

# Remove app by slug
docker-compose run --rm web python manage.py shell -c "
from apps.usecase.models import UseCase
UseCase.objects.filter(slug='test-app').delete()
print('✅ App with slug test-app removed')
"

# Remove multiple apps
docker-compose run --rm web python manage.py shell -c "
from apps.usecase.models import UseCase
UseCase.objects.filter(id__in=[12, 13, 14]).delete()
print('✅ Multiple apps removed')
"

# Remove all test apps
docker-compose run --rm web python manage.py shell -c "
from apps.usecase.models import UseCase
test_apps = UseCase.objects.filter(name__icontains='test')
count = test_apps.count()
test_apps.delete()
print(f'✅ Removed {count} test apps')
"
```

### 🧬 Add Molecule to Specific App

```bash
# Add molecule to existing app
docker-compose run --rm web python manage.py shell -c "
from apps.usecase.models import UseCase

# Get the app
app = UseCase.objects.get(slug='marketing-mix')

# Add new molecule to the app
new_molecule = 'evaluate'
if new_molecule not in app.molecules:
    app.molecules.append(new_molecule)
    
    # Update molecule_atoms mapping
    app.molecule_atoms[new_molecule] = {
        'id': 'evaluate',
        'title': 'Evaluate',
        'subtitle': 'Model evaluation and results',
        'tag': 'Analysis',
        'atoms': []
    }
    
    # Update flattened atoms list
    app.atoms_in_molecules.extend(app.molecule_atoms[new_molecule]['atoms'])
    app.save()
    print(f'✅ Added molecule {new_molecule} to app {app.name}')
else:
    print(f'⚠️ Molecule {new_molecule} already exists in app {app.name}')
"
```

### ⚛️ Add Atom to Specific Molecule

```bash
# Add atom to specific molecule in an app
docker-compose run --rm web python manage.py shell -c "
from apps.usecase.models import UseCase

# Get the app
app = UseCase.objects.get(slug='marketing-mix')
molecule_id = 'build'
new_atom = 'New Atom Name'

# Check if molecule exists in the app
if molecule_id in app.molecule_atoms:
    # Add atom to the molecule
    if new_atom not in app.molecule_atoms[molecule_id]['atoms']:
        app.molecule_atoms[molecule_id]['atoms'].append(new_atom)
        
        # Update flattened atoms list
        if new_atom not in app.atoms_in_molecules:
            app.atoms_in_molecules.append(new_atom)
            
        app.save()
        print(f'✅ Added atom \"{new_atom}\" to molecule \"{molecule_id}\" in app {app.name}')
    else:
        print(f'⚠️ Atom \"{new_atom}\" already exists in molecule \"{molecule_id}\"')
else:
    print(f'❌ Molecule \"{molecule_id}\" not found in app {app.name}')
"
```

### 🗑️ Remove Molecule from App

```bash
# Remove specific molecule from app
docker-compose run --rm web python manage.py shell -c "
from apps.usecase.models import UseCase

# Get the app
app = UseCase.objects.get(slug='marketing-mix')
molecule_to_remove = 'engineer'

# Remove molecule from molecules list
if molecule_to_remove in app.molecules:
    app.molecules.remove(molecule_to_remove)
    
    # Remove molecule from molecule_atoms mapping
    if molecule_to_remove in app.molecule_atoms:
        # Remove atoms of this molecule from flattened list
        atoms_to_remove = app.molecule_atoms[molecule_to_remove]['atoms']
        for atom in atoms_to_remove:
            if atom in app.atoms_in_molecules:
                app.atoms_in_molecules.remove(atom)
        
        # Remove molecule from mapping
        del app.molecule_atoms[molecule_to_remove]
        
    app.save()
    print(f'✅ Removed molecule \"{molecule_to_remove}\" from app {app.name}')
else:
    print(f'⚠️ Molecule \"{molecule_to_remove}\" not found in app {app.name}')
"
```

### 🔄 Update App Data

```bash
# Update app name and description
docker-compose run --rm web python manage.py shell -c "
from apps.usecase.models import UseCase

app = UseCase.objects.get(slug='marketing-mix')
app.name = 'Updated Marketing Mix Modeling'
app.description = 'Enhanced marketing spend optimization tool'
app.save()
print(f'✅ Updated app: {app.name}')
"

# Update modules
docker-compose run --rm web python manage.py shell -c "
from apps.usecase.models import UseCase

app = UseCase.objects.get(slug='marketing-mix')
app.modules = ['new-module1', 'new-module2', 'enhanced-module3']
app.save()
print(f'✅ Updated modules for app: {app.name}')
"
```

### 📊 Database Queries

```bash
# Count total apps
docker-compose run --rm web python manage.py shell -c "
from apps.usecase.models import UseCase
print(f'Total apps: {UseCase.objects.count()}')
"

# Find apps with specific molecule
docker-compose run --rm web python manage.py shell -c "
from apps.usecase.models import UseCase
apps_with_build = UseCase.objects.filter(molecules__contains=['build'])
for app in apps_with_build:
    print(f'- {app.name} ({app.slug})')
"

# Find apps with specific atom
docker-compose run --rm web python manage.py shell -c "
from apps.usecase.models import UseCase
apps_with_eda = UseCase.objects.filter(atoms_in_molecules__contains=['EDA'])
for app in apps_with_eda:
    print(f'- {app.name} ({app.slug})')
"

# Get app details
docker-compose run --rm web python manage.py shell -c "
from apps.usecase.models import UseCase
app = UseCase.objects.get(slug='marketing-mix')
print(f'App: {app.name}')
print(f'Molecules: {app.molecules}')
print(f'Total atoms: {len(app.atoms_in_molecules)}')
"
```

## Available Molecules

The system supports the following molecules:

| Molecule ID | Title | Tag | Atoms Count |
|-------------|-------|-----|-------------|
| `build` | Build | Modeling | 3 |
| `data-pre-process` | Data Pre-Process | Data Processing | 5 |
| `explore` | Explore | Exploration | 5 |
| `engineer` | Engineer | Engineering | 10 |
| `pre-process` | Pre Process | Preprocessing | 2 |
| `evaluate` | Evaluate | Analysis | 0 |
| `plan` | Plan | Planning | 0 |
| `report` | Report | Reporting | 0 |

## API Endpoints

The usecase app provides REST API endpoints:

### 📋 Core CRUD Endpoints
- `GET /api/usecases/usecases/` - List all use cases
- `GET /api/usecases/usecases/{id}/` - Get specific use case
- `POST /api/usecases/usecases/` - Create new use case
- `PUT /api/usecases/usecases/{id}/` - Update use case
- `DELETE /api/usecases/usecases/{id}/` - Delete use case

### 🎨 Frontend-Specific Endpoints
- `GET /api/usecases/apps-for-frontend/` - Frontend-optimized app list (used by Apps.tsx)
- `GET /api/usecases/molecules-by-slug/{slug}/` - Get molecules for specific app by slug (used by MoleculeList.tsx)
- `GET /api/usecases/apps/` - Backward compatible apps endpoint

### 🧬 Molecules API Example

**Get molecules for Marketing Mix app:**
```bash
curl http://localhost:8000/api/usecases/molecules-by-slug/marketing-mix/
```

**Response:**
```json
{
  "success": true,
  "app_name": "Marketing Mix Modeling",
  "app_slug": "marketing-mix",
  "molecules": [
    {
      "id": "build",
      "type": "Build",
      "title": "Build",
      "subtitle": "Model building and creation",
      "tag": "Modeling",
      "atoms": ["Auto-regressive models", "Model Output - Non CSF", "Single Modeling"]
    },
    {
      "id": "explore",
      "type": "Explore",
      "title": "Explore",
      "subtitle": "Data exploration and analysis",
      "tag": "Exploration",
      "atoms": ["Correlation", "Depth Ladder", "EDA", "Promo Comparison", "Promotion Intensity Analysis"]
    }
  ],
  "total": 4
}
```

### 🔄 Frontend Integration

**Apps.tsx** - Fetches apps from database:
```typescript
const response = await fetch(`${USECASES_API}/apps-for-frontend/`);
```

**MoleculeList.tsx** - Fetches app-specific molecules:
```typescript
const response = await fetch(`${USECASES_API}/molecules-by-slug/${appSlug}/`);
```

Each app has its own set of molecules defined in the database!

## Schema Architecture

### 🏗️ Public Schema (usecase app)
**Purpose:** Store global app definitions that are shared across all tenants

**Contains:**
- App metadata (name, slug, description)
- Module configurations
- Molecule and atom definitions
- Available molecules per app

**Location:** `trinity_db.public.usecase` table

### 🏢 Tenant Schema (workflows app)
**Purpose:** Store tenant-specific workflow data

**Contains:**
- User-created workflows
- Workflow executions
- Workflow state and history
- Project-workflow relationships

**Location:** `trinity_db.{tenant_schema}.workflows_workflow` table

### 🔄 Separation of Concerns

```
Public Schema (usecase)
├── App Definitions ✅
├── Molecules & Atoms ✅
└── Shared across all tenants

Tenant Schema (workflows)
├── Workflows ✅
├── Workflow Executions ✅
└── Isolated per tenant
```

**Why this matters:**
- ✅ App definitions are centralized and consistent
- ✅ Workflows are isolated per tenant for security
- ✅ Adding molecules to an app affects all tenants
- ✅ Each tenant's workflows remain private

## Admin Interface

Access the Django admin interface to manage use cases:

1. Go to `/admin/usecase/usecase/`
2. View, add, edit, or delete use cases
3. Manage molecules and atoms through the admin interface

**Note:** You cannot manage workflows through the usecase admin - use the workflows app for that.

## Best Practices

### Adding New Apps
1. Use descriptive names and slugs
2. Assign appropriate modules based on app functionality
3. Select relevant molecules for the app's use case
4. Test the app configuration before deployment

### Managing Molecules
1. Keep molecule definitions consistent across apps
2. Use the molecule_atoms mapping for detailed molecule information
3. Update atoms_in_molecules when adding/removing molecules
4. Validate molecule IDs against the available molecules list

### Data Integrity
1. Always update both `molecules` and `molecule_atoms` together
2. Keep `atoms_in_molecules` in sync with molecule atoms
3. Use unique slugs for apps
4. Test changes in development before applying to production

## Troubleshooting

### Common Issues

**App not found:**
```bash
# Check if app exists
docker-compose run --rm web python manage.py shell -c "
from apps.usecase.models import UseCase
try:
    app = UseCase.objects.get(slug='your-slug')
    print(f'✅ App found: {app.name}')
except UseCase.DoesNotExist:
    print('❌ App not found')
"
```

**Migration issues:**
```bash
# Reset migrations
docker-compose run --rm web python manage.py migrate usecase zero
docker-compose run --rm web python manage.py migrate usecase
```

**Data corruption:**
```bash
# Backup and restore
docker-compose run --rm web python manage.py dumpdata usecase > usecase_backup.json
docker-compose run --rm web python manage.py loaddata usecase_backup.json
```

## Support

For issues or questions about the usecase app:

1. Check the Django logs: `docker-compose logs web`
2. Verify database connectivity: `docker-compose run --rm web python manage.py dbshell`
3. Test model operations: `docker-compose run --rm web python manage.py shell`
4. Review migration status: `docker-compose run --rm web python manage.py showmigrations usecase`

---

**Last Updated:** October 13, 2025  
**Version:** 1.0  
**Maintainer:** Trinity Development Team
