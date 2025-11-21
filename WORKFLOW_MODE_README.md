# Trinity Workflow Mode - Comprehensive Documentation

## Overview

Trinity Workflow Mode is a visual workflow builder that allows users to create, manage, and execute data processing workflows using a drag-and-drop interface. Users can drag molecules (predefined or custom) onto a canvas, connect them with arrows to define execution flow, assign atoms to molecules, and render the workflow to Laboratory Mode for execution.

## Architecture

### Frontend Components

```
TrinityFrontend/src/components/WorkflowMode/
├── WorkflowMode.tsx              # Main workflow component
├── WorkflowMode.css              # Styling
├── components/
│   ├── WorkflowCanvas.tsx        # Canvas for drag-and-drop workflow building
│   ├── WorkflowRightPanel.tsx    # Atom library and molecule management
│   ├── WorkflowAuxiliaryMenu.tsx # Additional tools and controls
│   ├── MoleculeNode.tsx          # Individual molecule component
│   ├── MoleculeCard.tsx          # Molecule display card
│   └── CreateMoleculeDialog.tsx   # Dialog for creating new molecules
```

### Backend Services

- **Django Backend** (`TrinityBackendDjango`): PostgreSQL database models and REST APIs
- **FastAPI Backend** (`TrinityBackendFastAPI`): MongoDB integration and workflow management
- **PostgreSQL Database**: Stores atoms, molecules, workflows, and project data
- **MongoDB Database**: Stores workflow configurations and molecule data

## Database Schema

### PostgreSQL Models

#### 1. Atoms (`apps.atoms.models`)

```python
class Atom(models.Model):
    name = models.CharField(max_length=150, unique=True)
    slug = models.SlugField(max_length=150, unique=True)
    category = models.ForeignKey(AtomCategory, on_delete=models.PROTECT)
    description = models.TextField(blank=True)
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)
```

#### 2. Molecules (`apps.molecules.models`)

```python
class Molecule(models.Model):
    molecule_id = models.CharField(max_length=100, unique=True)
    name = models.CharField(max_length=150)
    type = models.CharField(max_length=150)
    subtitle = models.CharField(max_length=255, blank=True)
    tag = models.CharField(max_length=100, blank=True)
    atoms = models.JSONField(default=list, blank=True)
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)
```

#### 3. Custom Molecules (`apps.custom_molecules.models`)

```python
class CustomMolecule(models.Model):
    project = models.ForeignKey(Project, on_delete=models.CASCADE)
    user = models.ForeignKey(User, on_delete=models.SET_NULL, null=True)
    molecule_id = models.CharField(max_length=100)
    name = models.CharField(max_length=150)
    type = models.CharField(max_length=150, default='custom')
    atoms = models.JSONField(default=list, blank=True)
    atom_order = models.JSONField(default=list, blank=True)
    selected_atoms = models.JSONField(default=dict, blank=True)
    connections = models.JSONField(default=list, blank=True)
    position = models.JSONField(default=dict, blank=True)
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)
```

#### 4. Workflows (`apps.workflows.models`)

```python
class Workflow(models.Model):
    project = models.ForeignKey(Project, on_delete=models.CASCADE)
    name = models.CharField(max_length=150)
    slug = models.SlugField(max_length=150)
    dag_spec = models.JSONField()  # DAG specification with nodes, edges, ordering
    created_by = models.ForeignKey(User, on_delete=models.SET_NULL, null=True)
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

class WorkflowAtom(models.Model):
    workflow = models.ForeignKey(Workflow, on_delete=models.CASCADE)
    atom = models.ForeignKey(Atom, on_delete=models.PROTECT)
    order = models.PositiveIntegerField()  # Execution order in DAG
    config = models.JSONField(blank=True, null=True)

class WorkflowRun(models.Model):
    workflow = models.ForeignKey(Workflow, on_delete=models.CASCADE)
    initiated_by = models.ForeignKey(User, on_delete=models.SET_NULL, null=True)
    status = models.CharField(max_length=20, choices=STATUS_CHOICES, default="pending")
    run_context = models.JSONField(blank=True, null=True)
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)
```

## API Integration

### Frontend API Configuration

The frontend uses multiple API endpoints defined in `src/lib/api.ts`:

```typescript
// Django Backend APIs
export const WORKFLOWS_API = `${backendOrigin}${djangoPrefix}/workflows`;
export const CUSTOM_MOLECULES_API = `${backendOrigin}${djangoPrefix}/custom-molecules`;
export const USECASES_API = `${backendOrigin}${djangoPrefix}/usecases`;

// FastAPI Backend APIs
export const MOLECULES_API = `${backendOrigin.replace(new RegExp(`:${djangoPort}$`), `:${fastapiPort}`)}/api/molecules`;
export const LABORATORY_API = `${backendOrigin.replace(new RegExp(`:${djangoPort}$`), `:${fastapiPort}`)}/api/laboratory`;
```

### API Endpoints

#### 1. Molecules API (FastAPI - MongoDB)

**Base URL**: `http://localhost:8001/api/molecules`

- `POST /save` - Save molecule to MongoDB
- `POST /get` - Get molecules with filtering
- `GET /get/{molecule_id}` - Get specific molecule
- `DELETE /delete/{molecule_id}` - Delete molecule
- `GET /client-molecules` - Get client molecules
- `GET /qm-molecules` - Get QM molecules
- `POST /workflow/save` - Save workflow configuration
- `POST /workflow/get` - Get workflow configuration
- `GET /workflow/get/{workflow_id}` - Get specific workflow
- `GET /workflow/debug/all` - Debug all workflows

#### 2. Workflows API (Django - PostgreSQL)

**Base URL**: `http://localhost:8000/api/workflows`

- `POST /workflows/` - Create new workflow
- `GET /workflows/{id}/` - Get workflow details
- `PATCH /workflows/{id}/` - Update workflow
- `DELETE /workflows/{id}/` - Delete workflow
- `POST /workflows/{id}/execute/` - Execute workflow
- `GET /workflows/{id}/runs/` - Get workflow runs
- `GET /runs/` - List all workflow runs
- `GET /runs/{id}/` - Get run details

#### 3. Custom Molecules API (Django - PostgreSQL)

**Base URL**: `http://localhost:8000/api/custom-molecules`

- `GET /for_frontend/` - Get custom molecules for frontend
- `POST /save_to_library/` - Save molecule to library
- `DELETE /{id}/` - Delete custom molecule

## Data Flow

### 1. Loading Workflow Data

```typescript
// WorkflowMode.tsx - Component mount
useEffect(() => {
  const loadWorkflowData = async () => {
    // 1. Try MongoDB first (FastAPI)
    const mongoDataLoaded = await loadWorkflowConfiguration(false);
    
    if (mongoDataLoaded) {
      // MongoDB data loaded successfully
      return;
    }
    
    // 2. Fallback to localStorage
    const savedCanvasMolecules = localStorage.getItem('workflow-canvas-molecules');
    const savedCustomMolecules = localStorage.getItem('workflow-custom-molecules');
    
    if (savedCanvasMolecules) {
      setCanvasMolecules(JSON.parse(savedCanvasMolecules));
    }
    
    if (savedCustomMolecules) {
      setCustomMolecules(JSON.parse(savedCustomMolecules));
    }
  };
  
  loadWorkflowData();
}, []);
```

### 2. Fetching Molecules and Atoms

#### Molecules from PostgreSQL

```typescript
// MoleculeList.tsx
const fetchMolecules = async () => {
  try {
    // Fetch QM molecules from Django
    const qmResponse = await fetch(`${USECASES_API}/molecules/`);
    const qmMolecules = await qmResponse.json();
    
    // Fetch custom molecules from Django
    const customResponse = await fetch(`${CUSTOM_MOLECULES_API}/for_frontend/`);
    const customMolecules = await customResponse.json();
    
    setMolecules([...qmMolecules, ...customMolecules]);
  } catch (error) {
    console.error('Error fetching molecules:', error);
  }
};
```

#### Atoms from PostgreSQL

```typescript
// WorkflowRightPanel.tsx
const fetchAtoms = async () => {
  try {
    const response = await fetch(`${TRINITY_V1_ATOMS_API}/atoms/`);
    const atoms = await response.json();
    setAtoms(atoms);
  } catch (error) {
    console.error('Error fetching atoms:', error);
  }
};
```

### 3. Saving Workflow Configuration

```typescript
// WorkflowMode.tsx
const saveWorkflowConfiguration = async () => {
  try {
    const envStr = localStorage.getItem('env');
    const env = envStr ? JSON.parse(envStr) : {};
    const client_name = env.CLIENT_NAME || 'default_client';
    const app_name = env.APP_NAME || 'default_app';
    const project_name = env.PROJECT_NAME || 'default_project';
    
    const response = await fetch(`${MOLECULES_API}/workflow/save`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      credentials: 'include',
      body: JSON.stringify({
        canvas_molecules: canvasMolecules,
        custom_molecules: customMolecules,
        user_id: '',
        client_name: client_name,
        app_name: app_name,
        project_name: project_name
      })
    });
    
    if (response.ok) {
      const result = await response.json();
      toast({ title: "Workflow Saved", description: "Workflow configuration saved successfully" });
    }
  } catch (error) {
    console.error('Error saving workflow:', error);
    toast({ title: "Save Failed", description: "Failed to save workflow configuration" });
  }
};
```

### 4. Rendering Workflow to Laboratory Mode

```typescript
// WorkflowMode.tsx
const handleRenderWorkflow = useCallback(() => {
  // Validate workflow
  const moleculesWithAtoms = canvasMolecules.filter(mol => mol.atoms && mol.atoms.length > 0);
  
  if (moleculesWithAtoms.length === 0) {
    toast({ title: 'No Atoms Assigned', description: 'Please assign atoms to at least one molecule' });
    return;
  }
  
  // Convert atom names to IDs for Laboratory mode
  const convertAtomNameToId = (atomName: string) => {
    return atomName.toLowerCase().replace(/\s+/g, '-').replace(/[^a-z0-9-]/g, '');
  };
  
  // Prepare workflow data
  const workflowData = {
    molecules: moleculesWithAtoms.map(mol => ({
      id: mol.id,
      title: mol.title,
      atoms: mol.atoms.map(atomName => convertAtomNameToId(atomName)),
      atomOrder: (mol.atomOrder || mol.atoms).map(atomName => convertAtomNameToId(atomName))
    })),
    timestamp: new Date().toISOString(),
    type: 'workflow'
  };
  
  // Save to localStorage for Laboratory mode
  localStorage.setItem('workflow-data', JSON.stringify(workflowData));
  
  // Navigate to Laboratory mode
  navigate('/laboratory');
}, [canvasMolecules, toast, navigate]);
```

## Key Features

### 1. Drag-and-Drop Interface

- **Molecule Library**: Left sidebar with predefined QM molecules and custom molecules
- **Canvas**: Main area for building workflows with drag-and-drop functionality
- **Atom Library**: Right panel for assigning atoms to molecules

### 2. Molecule Management

- **QM Molecules**: Predefined molecules from PostgreSQL (`apps.molecules.models.Molecule`)
- **Custom Molecules**: User-created molecules stored in PostgreSQL (`apps.custom_molecules.models.CustomMolecule`)
- **Molecule Creation**: Users can create new molecules and assign atoms to them

### 3. Workflow Building

- **Visual Connections**: Draw arrows between molecules to define execution flow
- **Atom Assignment**: Assign atoms to molecules from the atom library
- **Position Management**: Molecules can be positioned anywhere on the canvas
- **Validation**: Ensures all molecules have atoms assigned before rendering

### 4. Data Persistence

- **MongoDB**: Stores workflow configurations via FastAPI
- **PostgreSQL**: Stores molecules, atoms, and workflow definitions
- **localStorage**: Fallback storage for workflow state
- **Session Management**: Tracks active workflow sessions

### 5. Integration with Laboratory Mode

- **Workflow Rendering**: Converts workflow to Laboratory mode format
- **Atom Conversion**: Converts atom names to IDs for Laboratory mode
- **State Transfer**: Passes workflow data via localStorage

## Environment Configuration

### Frontend Environment Variables

```bash
# API Configuration
VITE_HOST_IP=10.2.1.170
VITE_DJANGO_PORT=8000
VITE_FASTAPI_PORT=8001
VITE_AI_PORT=8002
VITE_FRONTEND_PORT=8080

# Backend Origins
VITE_BACKEND_ORIGIN=http://10.2.1.170:8000
VITE_MOLECULES_API=http://10.2.1.170:8001/api/molecules
VITE_WORKFLOWS_API=http://10.2.1.170:8000/api/workflows
VITE_CUSTOM_MOLECULES_API=http://10.2.1.170:8000/api/custom-molecules
```

### Database Configuration

#### PostgreSQL (Django)

```python
# settings.py
DATABASES = {
    'default': {
        'ENGINE': 'django.db.backends.postgresql',
        'NAME': 'trinity_db',
        'USER': 'trinity_user',
        'PASSWORD': 'trinity_pass',
        'HOST': 'postgres',
        'PORT': '5432',
    }
}
```

#### MongoDB (FastAPI)

```python
# config.py
mongo_uri = "mongodb://mongo:27017/"
molecule_database = "trinity_molecules"
molecules_config_collection = "molecules_config"
workflow_collection = "workflows"
```

## Development Setup

### 1. Prerequisites

- Node.js 18+
- Python 3.9+
- PostgreSQL 15
- MongoDB 6
- Docker & Docker Compose

### 2. Backend Setup

```bash
# Django Backend
cd TrinityBackendDjango
pip install -r requirements.txt
python manage.py migrate
python manage.py runserver 8000

# FastAPI Backend
cd TrinityBackendFastAPI
pip install -r requirements.txt
uvicorn app.main:app --host 0.0.0.0 --port 8001 --reload
```

### 3. Frontend Setup

```bash
cd TrinityFrontend
npm install
npm run dev
```

### 4. Database Setup

```bash
# PostgreSQL
createdb trinity_db
psql trinity_db -c "CREATE USER trinity_user WITH PASSWORD 'trinity_pass';"
psql trinity_db -c "GRANT ALL PRIVILEGES ON DATABASE trinity_db TO trinity_user;"

# MongoDB
mongosh
use trinity_molecules
```

## API Usage Examples

### 1. Create a Workflow

```typescript
const createWorkflow = async () => {
  const response = await fetch(`${WORKFLOWS_API}/workflows/`, {
    method: 'POST',
    credentials: 'include',
    headers: {
      'Content-Type': 'application/json',
      'X-CSRFToken': getCsrfToken()
    },
    body: JSON.stringify({
      project_id: 123,
      project_name: "Sales Dashboard",
      name: "Q4 Sales Analysis",
      slug: "q4-sales-analysis",
      app_name: "Trinity Analytics",
      molecules_used: ["data-loader", "data-processor"],
      atoms_in_molecules: {
        "data-loader": ["csv-reader", "excel-reader"],
        "data-processor": ["clean-data", "aggregate"]
      },
      dag_spec: {
        nodes: [
          { id: "data-loader", type: "molecule", position: { x: 100, y: 100 } },
          { id: "data-processor", type: "molecule", position: { x: 300, y: 100 } }
        ],
        edges: [
          { source: "data-loader", target: "data-processor" }
        ]
      }
    })
  });
  
  return await response.json();
};
```

### 2. Save Molecule to MongoDB

```typescript
const saveMolecule = async (moleculeData) => {
  const response = await fetch(`${MOLECULES_API}/save`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    credentials: 'include',
    body: JSON.stringify({
      molecule: {
        id: moleculeData.id,
        title: moleculeData.title,
        type: moleculeData.type,
        atoms: moleculeData.atoms,
        atomOrder: moleculeData.atomOrder,
        selectedAtoms: moleculeData.selectedAtoms,
        connections: moleculeData.connections,
        position: moleculeData.position
      },
      user_id: "user123",
      client_id: "client456",
      app_id: "app789",
      project_id: 123
    })
  });
  
  return await response.json();
};
```

### 3. Execute Workflow

```typescript
const executeWorkflow = async (workflowId) => {
  const response = await fetch(`${WORKFLOWS_API}/workflows/${workflowId}/execute/`, {
    method: 'POST',
    credentials: 'include',
    headers: {
      'Content-Type': 'application/json',
      'X-CSRFToken': getCsrfToken()
    }
  });
  
  const result = await response.json();
  // Returns: { run_id: 456, workflow_id: 123, message: "Workflow execution started" }
  return result;
};
```

## Troubleshooting

### Common Issues

#### 1. Workflow Not Saving

**Symptoms**: Save button doesn't work, no success message

**Solutions**:
- Check user authentication status
- Verify CSRF token is being sent
- Ensure current project is set in localStorage
- Check MongoDB connection in FastAPI backend
- Verify migration has been applied to PostgreSQL

#### 2. Molecules Not Loading

**Symptoms**: Empty molecule library, loading errors

**Solutions**:
- Check Django backend is running on port 8000
- Verify PostgreSQL connection
- Check `USECASES_API` and `CUSTOM_MOLECULES_API` endpoints
- Ensure molecules exist in database

#### 3. Atoms Not Loading

**Symptoms**: Empty atom library in right panel

**Solutions**:
- Check Django backend is running
- Verify `TRINITY_V1_ATOMS_API` endpoint
- Ensure atoms exist in `apps.atoms.models.Atom` table
- Check atom categories are properly configured

#### 4. Workflow Rendering Fails

**Symptoms**: "Render Workflow" button doesn't work

**Solutions**:
- Ensure all molecules have at least one atom assigned
- Check for workflow cycles (molecules must form a DAG)
- Verify all molecules are connected
- Check localStorage permissions

#### 5. MongoDB Connection Issues

**Symptoms**: Workflow save/load fails, MongoDB errors

**Solutions**:
- Check MongoDB is running on port 27017
- Verify MongoDB connection string in FastAPI config
- Check database and collection names
- Ensure MongoDB user has proper permissions

### Debug Endpoints

#### MongoDB Debug

```bash
# Check MongoDB connection and collections
curl http://localhost:8001/api/molecules/debug/mongodb

# Get all workflow configurations
curl http://localhost:8001/api/molecules/workflow/debug/all
```

#### PostgreSQL Debug

```bash
# Check Django admin interface
http://localhost:8000/admin/

# Check API endpoints
curl http://localhost:8000/api/workflows/workflows/
curl http://localhost:8000/api/custom-molecules/for_frontend/
```

## Performance Considerations

### 1. Database Optimization

- **PostgreSQL Indexes**: Ensure proper indexes on frequently queried fields
- **MongoDB Indexes**: Create indexes on workflow query fields
- **Connection Pooling**: Use connection pooling for database connections

### 2. Frontend Optimization

- **State Management**: Use React state efficiently to avoid unnecessary re-renders
- **API Caching**: Cache molecule and atom data to reduce API calls
- **Lazy Loading**: Load molecules and atoms on demand

### 3. Memory Management

- **localStorage Cleanup**: Regularly clean up old workflow data
- **Session Management**: Properly manage workflow sessions
- **Component Unmounting**: Clean up event listeners and timers

## Security Considerations

### 1. Authentication

- **User Authentication**: Ensure users are authenticated before saving workflows
- **CSRF Protection**: Use CSRF tokens for all state-changing operations
- **Session Management**: Properly manage user sessions

### 2. Data Validation

- **Input Validation**: Validate all user inputs on both frontend and backend
- **SQL Injection Prevention**: Use Django ORM to prevent SQL injection
- **XSS Prevention**: Sanitize user inputs to prevent XSS attacks

### 3. Data Privacy

- **Tenant Isolation**: Ensure proper tenant isolation in multi-tenant setup
- **Data Encryption**: Encrypt sensitive data in transit and at rest
- **Access Control**: Implement proper access control for workflow data

## Future Enhancements

### 1. Planned Features

- **Workflow Templates**: Pre-built workflow templates for common use cases
- **Workflow Sharing**: Share workflows between users and projects
- **Version Control**: Track workflow versions and changes
- **Real-time Collaboration**: Multiple users working on the same workflow
- **Workflow Analytics**: Track workflow usage and performance metrics

### 2. Technical Improvements

- **WebSocket Integration**: Real-time updates for collaborative editing
- **Workflow Validation**: Advanced workflow validation and error checking
- **Performance Monitoring**: Built-in performance monitoring and optimization
- **API Rate Limiting**: Implement rate limiting for API endpoints
- **Caching Layer**: Add Redis caching layer for improved performance

## Contributing

### Development Guidelines

1. **Code Style**: Follow existing code style and conventions
2. **Testing**: Write tests for new features and bug fixes
3. **Documentation**: Update documentation for new features
4. **Database Migrations**: Create proper migrations for database changes
5. **API Versioning**: Use proper API versioning for breaking changes

### Pull Request Process

1. Fork the repository
2. Create a feature branch
3. Make your changes
4. Write tests
5. Update documentation
6. Submit a pull request

## Support

For issues and questions:

1. **GitHub Issues**: Create an issue in the repository
2. **Documentation**: Check this README and other documentation
3. **Debug Endpoints**: Use the debug endpoints for troubleshooting
4. **Logs**: Check application logs for error details

---

*Last updated: January 2025*
*Version: 1.0.0*
