# Tenant Migration Fixes

This document describes the fixes applied to resolve tenant creation and migration issues in the Trinity Django application.

## Issues Encountered

### 1. Cross-Schema Foreign Key Constraint Error

**Error:** `django.db.utils.ProgrammingError: relation "atoms_atom" does not exist`

**Root Cause:** 
- The `apps.atoms` app was configured in `SHARED_APPS` (public schema only)
- The `apps.atom_configs` and `apps.workflows` apps were in `TENANT_APPS` (tenant schemas)
- Both tenant apps had foreign key references to `atoms.Atom`
- When Django tried to create tenant schemas, it couldn't find the `atoms_atom` table because it only existed in the public schema

**Solution Applied:** **Option 1 - Move atoms to TENANT_APPS**

**File Modified:** `TrinityBackendDjango/config/settings.py`

**Changes:**
- Moved `apps.atoms` from `SHARED_APPS` to `TENANT_APPS`
- This ensures that atom tables are created in each tenant schema
- Maintains referential integrity for foreign key relationships

```python
# Before
SHARED_APPS = [
    # ... other apps ...
    "apps.atoms",  # ← Removed from here
]

TENANT_APPS = [
    "apps.registry",
    "apps.atom_configs",  # Has FK to atoms.Atom
    "apps.workflows",     # Has FK to atoms.Atom
    # ... other apps ...
]

# After
SHARED_APPS = [
    # ... other apps ...
    # atoms removed from shared apps
]

TENANT_APPS = [
    "apps.atoms",         # ← Added here
    "apps.registry",
    "apps.atom_configs",  # Has FK to atoms.Atom
    "apps.workflows",     # Has FK to atoms.Atom
    # ... other apps ...
]
```

### 2. Domain Constraint Violation Error

**Error:** `django.db.utils.IntegrityError: duplicate key value violates unique constraint "tenants_domain_domain_key"`

**Root Cause:**
- The tenant creation script attempted to create domains for "localhost" and "127.0.0.1"
- These domains already existed for other tenants
- The script didn't handle the case where domains exist with different tenant assignments

**Solution Applied:** **Enhanced Error Handling in Domain Creation**

**File Modified:** `TrinityBackendDjango/create_tenant.py`

**Changes:**
1. **Added try-catch blocks** around domain creation operations
2. **Improved error handling** for both localhost aliases and additional domains
3. **Enhanced logging** to show when domains are skipped due to existing constraints

```python
# Before - Would crash on duplicate domains
alias, created = Domain.objects.get_or_create(
    domain=extra,
    tenant=tenant_obj,
    defaults={"is_primary": False},
)

# After - Graceful handling with informative logging
try:
    alias, created = Domain.objects.get_or_create(
        domain=extra,
        tenant=tenant_obj,
        defaults={"is_primary": False},
    )
    if created:
        print(f"   → Added alias domain: {alias}")
    else:
        print(f"   → Alias domain already exists for this tenant: {alias}")
except Exception as e:
    existing_domain = Domain.objects.filter(domain=extra).first()
    if existing_domain:
        print(f"   → Domain '{extra}' already exists for tenant '{existing_domain.tenant.name}', skipping")
    else:
        print(f"   → Error creating domain '{extra}': {e}")
```

## Alternative Solutions Considered

### For Cross-Schema Foreign Key Issue:

**Option 2:** Move `atom_configs` to `SHARED_APPS`
- Would work if atom configurations should be shared across all tenants
- Rejected because atom configs are project-specific and should be tenant-isolated

**Option 3:** Use CharField instead of ForeignKey
- Replace foreign key relationships with slug/UUID references
- Would require significant code changes and loss of referential integrity
- Rejected due to complexity and reduced data consistency

## Benefits of Applied Solutions

### Option 1 Implementation Benefits:
- ✅ **Maintains referential integrity** - Foreign key constraints work properly
- ✅ **Tenant isolation** - Each tenant has its own atom catalog
- ✅ **Minimal code changes** - Only required settings modification
- ✅ **Consistent architecture** - All related apps in same schema type

### Domain Error Handling Benefits:
- ✅ **Robust script execution** - Won't crash on domain conflicts
- ✅ **Clear feedback** - Informative messages about domain creation status
- ✅ **Flexibility** - Allows multiple tenants to coexist with shared development domains
- ✅ **Debugging support** - Shows which tenant owns conflicting domains

## Impact Assessment

### Database Schema Changes:
- Atom tables (`atoms_atom`, `atoms_atomcategory`, `atoms_atomversion`) are now created in each tenant schema
- Existing shared atom data needs to be migrated to tenant schemas if upgrading

### Application Behavior:
- Each tenant now has its own atom catalog
- Atom configurations and workflows maintain proper foreign key relationships
- Domain creation is more resilient to existing domain constraints

## Verification Steps

After applying these fixes:

1. **Verify tenant creation succeeds:**
   ```bash
   docker compose exec web python create_tenant.py
   ```

2. **Check tenant schema contains atom tables:**
   - Verify `atoms_atom` table exists in tenant schema
   - Confirm foreign key relationships work

3. **Test domain handling:**
   - Script should handle existing "localhost" domains gracefully
   - Additional domains from environment variables should be processed correctly

## Future Considerations

- **Atom Data Seeding:** Consider implementing atom catalog synchronization across tenants
- **Migration Strategy:** For production deployments, plan data migration from shared to tenant schemas
- **Domain Management:** Consider implementing domain management UI for tenant administrators
