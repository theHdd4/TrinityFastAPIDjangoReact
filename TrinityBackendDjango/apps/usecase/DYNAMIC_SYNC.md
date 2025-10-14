# Dynamic Molecule/Atom Sync System

This system automatically syncs molecules and atoms from frontend components to the PostgreSQL database, eliminating the need for hardcoded data.

## 🚀 **How It Works**

### **1. Frontend Source Detection**
- Reads from `TrinityFrontend/src/components/MoleculeList/data/molecules.ts`
- Automatically detects new molecules and atoms
- Falls back to hardcoded data if frontend file is not found

### **2. Dynamic Database Updates**
- All use cases automatically get the same molecules and atoms
- When you add new molecules to frontend, they're automatically available to all apps
- No more hardcoding in management commands

## 📋 **Available Commands**

### **Manual Sync**
```bash
# Sync molecules from frontend to database
python manage.py sync_molecules

# Dry run to see what would be synced
python manage.py sync_molecules --dry-run

# Specify custom frontend path
python manage.py sync_molecules --frontend-path /path/to/frontend
```

### **Auto Sync**
```bash
# Automatic sync (for CI/CD or scheduled tasks)
python manage.py auto_sync

# Force sync even if no changes detected
python manage.py auto_sync --force
```

### **Populate with Dynamic Data**
```bash
# Populate use cases with dynamic sync
python manage.py populate_usecases
```

## 🔄 **Workflow**

### **Adding New Molecules/Atoms:**

1. **Add to Frontend:**
   ```typescript
   // In TrinityFrontend/src/components/MoleculeList/data/molecules.ts
   export const molecules = [
     // ... existing molecules
     {
       id: 'new-molecule',
       type: 'New Type',
       title: 'New Molecule',
       subtitle: 'Description',
       tag: 'Tag',
       atoms: ['New Atom 1', 'New Atom 2']
     }
   ];
   ```

2. **Sync to Database:**
   ```bash
   python manage.py sync_molecules
   ```

3. **All Use Cases Updated:**
   - All 4 use cases automatically get the new molecule
   - All atoms are automatically available
   - No manual database updates needed

### **Adding New Apps:**

1. **Update populate_usecases.py:**
   ```python
   use_cases_data = [
       # ... existing use cases
       {
           'name': 'New App',
           'slug': 'new-app',
           'description': 'New app description',
           'molecules': all_molecules,  # Automatically gets all molecules
           'atoms': all_atoms  # Automatically gets all atoms
       }
   ]
   ```

2. **Run Population:**
   ```bash
   python manage.py populate_usecases
   ```

## 🏗️ **Architecture**

```
Frontend Components
       ↓ (reads from)
MoleculeAtomSync
       ↓ (syncs to)
PostgreSQL Database
       ↓ (available to)
All Use Cases
```

## 📊 **Database Structure**

**Table:** `trinity_db_public_table_usecase`

| Field | Type | Description |
|-------|------|-------------|
| `molecules` | JSONField | Array of all available molecules |
| `atoms` | JSONField | Array of all available atoms |

## 🔧 **Configuration**

### **Frontend Path Detection**
The system automatically detects the frontend path by trying:
1. `./TrinityFrontend`
2. `../TrinityFrontend`
3. `/TrinityFrontend` (Docker)
4. `/code/TrinityFrontend` (Docker)

### **Fallback System**
If frontend file cannot be read, the system uses hardcoded fallback data to ensure the system continues working.

## 🚀 **Benefits**

1. **No More Hardcoding:** Molecules and atoms are read from frontend source
2. **Automatic Updates:** New molecules automatically available to all apps
3. **Consistency:** All use cases always have the same molecules and atoms
4. **Maintainability:** Single source of truth in frontend components
5. **Flexibility:** Easy to add new molecules or modify existing ones

## 🔄 **Migration Integration**

The system can be integrated with Django migrations:

```python
# In migration file
def sync_molecules_from_frontend(apps, schema_editor):
    call_command('auto_sync', verbosity=0)
```

## 🧪 **Testing**

```bash
# Test sync without making changes
python manage.py sync_molecules --dry-run

# Test auto-sync
python manage.py auto_sync

# Verify data in database
python manage.py shell -c "from apps.usecase.models import UseCase; print(UseCase.objects.first().molecules)"
```

## 📝 **Example Usage**

```python
from apps.usecase.models import UseCase
from apps.usecase.sync_utils import MoleculeAtomSync

# Get molecules from frontend
sync_util = MoleculeAtomSync()
molecules = sync_util.get_molecules_from_frontend()
atoms = sync_util.get_all_atoms_from_molecules(molecules)

# Sync to database
result = sync_util.sync_to_database(UseCase)
print(f"Synced {result['molecules_count']} molecules and {result['atoms_count']} atoms")
```

This system ensures that your PostgreSQL database is always in sync with your frontend components, making it easy to add new molecules and atoms without manual database updates!
