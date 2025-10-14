# 🏗️ **New Architecture: Database-First App Management**

## 🎯 **Overview**

The system has been redesigned to make the **database the single source of truth** for apps and molecules. Instead of hardcoding apps in `Apps.tsx` and molecules in `molecules.ts`, everything is now managed through the database and served via API.

## 🔄 **Architecture Flow**

### **Old Flow (Backwards):**
```
Frontend Files → Sync to Database → Use in App
```

### **New Flow (Correct):**
```
Database → API → Frontend → Display Apps
```

## 📊 **Database Structure**

**Table:** `usecase`

| Column | Type | Description |
|--------|------|-------------|
| `id` | `bigint` | Primary key |
| `name` | `varchar(150)` | App name |
| `slug` | `varchar(150)` | URL-friendly identifier |
| `description` | `text` | App description |
| `molecules` | `jsonb` | List of all available molecules |
| `atoms` | `jsonb` | List of all available atoms |
| `created_at` | `timestamp` | Creation timestamp |
| `updated_at` | `timestamp` | Last update timestamp |

## 🚀 **API Endpoints**

### **1. Get All Apps for Frontend**
```http
GET /usecase/apps-for-frontend/
```

**Response:**
```json
{
  "success": true,
  "apps": [
    {
      "id": "marketing-mix",
      "title": "Marketing Mix Modeling",
      "description": "Optimize marketing spend allocation...",
      "molecules": [...],
      "atoms": [...],
      "slug": "marketing-mix",
      "created_at": "2024-01-01T00:00:00Z",
      "updated_at": "2024-01-01T00:00:00Z"
    }
  ],
  "total": 11
}
```

### **2. Get Molecules and Atoms**
```http
GET /usecase/molecules-and-atoms/
```

**Response:**
```json
{
  "success": true,
  "molecules": [...],
  "atoms": [...],
  "total_molecules": 8,
  "total_atoms": 23
}
```

### **3. Full CRUD API**
```http
GET    /usecase/api/usecases/          # List all apps
POST   /usecase/api/usecases/          # Create new app
GET    /usecase/api/usecases/{id}/     # Get specific app
PUT    /usecase/api/usecases/{id}/     # Update app
DELETE /usecase/api/usecases/{id}/     # Delete app
```

## 🛠️ **Management Commands**

### **1. List Apps**
```bash
# List all apps
python manage.py list_apps

# Detailed view
python manage.py list_apps --detailed

# JSON format
python manage.py list_apps --format json
```

### **2. Add New App**
```bash
# Add new app with all molecules and atoms
python manage.py add_app \
  --name "My New App" \
  --slug "my-new-app" \
  --description "Description of my new app"

# Add app with molecules only (no atoms)
python manage.py add_app \
  --name "App Name" \
  --slug "app-slug" \
  --description "Description" \
  --molecules-only
```

### **3. Sync Molecules/Atoms**
```bash
# Sync molecules and atoms to all apps
python manage.py sync_molecules

# Auto-sync during migrations
python manage.py auto_sync
```

## 🎛️ **Admin Interface**

Access Django Admin at `/admin/usecase/usecase/` to:
- ✅ View all apps
- ✅ Add new apps
- ✅ Edit existing apps
- ✅ Delete apps
- ✅ Preview molecules and atoms
- ✅ Manage app metadata

## 📱 **Frontend Integration**

### **Replace Hardcoded Apps**

**Old (Apps.tsx):**
```typescript
const apps = [
  {
    id: 'marketing-mix',
    title: 'Marketing Mix Modeling',
    description: '...',
    // hardcoded data
  }
];
```

**New (Fetch from API):**
```typescript
const [apps, setApps] = useState([]);

useEffect(() => {
  fetch('/usecase/apps-for-frontend/')
    .then(response => response.json())
    .then(data => setApps(data.apps));
}, []);
```

### **Replace Hardcoded Molecules**

**Old (molecules.ts):**
```typescript
export const molecules = [
  {
    id: 'build',
    type: 'Build',
    // hardcoded data
  }
];
```

**New (Fetch from API):**
```typescript
const [molecules, setMolecules] = useState([]);

useEffect(() => {
  fetch('/usecase/molecules-and-atoms/')
    .then(response => response.json())
    .then(data => setMolecules(data.molecules));
}, []);
```

## 🎯 **How to Add New Apps**

### **Method 1: Management Command (Recommended)**
```bash
python manage.py add_app \
  --name "Customer Analytics" \
  --slug "customer-analytics" \
  --description "Analyze customer behavior and preferences"
```

### **Method 2: Django Admin**
1. Go to `/admin/usecase/usecase/`
2. Click "Add Use Case"
3. Fill in the form
4. Save

### **Method 3: API**
```bash
curl -X POST /usecase/api/usecases/ \
  -H "Content-Type: application/json" \
  -d '{
    "name": "Customer Analytics",
    "slug": "customer-analytics",
    "description": "Analyze customer behavior",
    "molecules": [],
    "atoms": []
  }'
```

### **Method 4: Programmatically**
```python
from apps.usecase.models import UseCase

# Create new app
app = UseCase.objects.create(
    name="Customer Analytics",
    slug="customer-analytics",
    description="Analyze customer behavior and preferences",
    molecules=[],  # Will be populated by sync
    atoms=[]       # Will be populated by sync
)

# Sync molecules and atoms to all apps
from apps.usecase.sync_utils import MoleculeAtomSync
sync_util = MoleculeAtomSync()
sync_util.sync_to_database(UseCase)
```

## 🔧 **How to Update Molecules/Atoms**

### **For All Apps:**
```bash
# Update molecules/atoms for all apps
python manage.py sync_molecules
```

### **For Specific App:**
1. Go to Django Admin
2. Edit the app
3. Modify molecules/atoms JSON
4. Save

## 📋 **Benefits of New Architecture**

1. **✅ Single Source of Truth:** Database is the authoritative source
2. **✅ Dynamic Updates:** Add apps without frontend changes
3. **✅ API-First:** Clean separation between backend and frontend
4. **✅ Admin Interface:** Easy management through Django Admin
5. **✅ Version Control:** All changes tracked in database
6. **✅ Scalability:** Easy to add new features and fields
7. **✅ Consistency:** All apps have same molecules/atoms
8. **✅ Flexibility:** Can have app-specific molecules/atoms in future

## 🚀 **Next Steps**

1. **Update Frontend:** Modify `Apps.tsx` to fetch from API
2. **Update Molecules:** Modify `molecules.ts` to fetch from API
3. **Test API:** Verify all endpoints work correctly
4. **Deploy:** Push changes to production
5. **Migrate:** Remove hardcoded data from frontend

## 📞 **Support**

- **API Docs:** Available at `/usecase/api/` (if DRF browsable API is enabled)
- **Admin Interface:** `/admin/usecase/usecase/`
- **Management Commands:** `python manage.py help` for list of commands

This new architecture makes your system much more maintainable and scalable! 🎯
