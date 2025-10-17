# Workflows App - Public Schema Storage

## Overview

The `workflows` app stores workflow data in the **PostgreSQL public schema** (`trinity_db.public`), not in tenant schemas. This allows workflows to be shared across the application and provides centralized tracking of which apps, projects, molecules, and atoms are being used.

## Architecture

### Models

#### 1. **Workflow** (Main Model)
Stores complete workflow definitions with:
- **Project Context**: `project_id`, `project_name`, `app_name`
- **Workflow Metadata**: `name`, `slug`, `description`, `version`
- **Structure Data**: 
  - `molecules_used`: List of molecule IDs used in the workflow
  - `atoms_in_molecules`: Mapping of molecules to their atoms `{molecule_id: [atom1, atom2, ...]}`
  - `dag_spec`: Complete DAG specification with nodes, edges, positions, and metadata
- **Execution Stats**: `execution_count`, `last_executed_at`
- **Ownership**: `user`, `created_at`, `updated_at`

#### 2. **WorkflowRun** (Execution Tracking)
Tracks individual workflow executions:
- **Status**: pending, running, completed, success, failed, failure, cancelled
- **Timing**: `started_at`, `completed_at`
- **Results**: `result_data` (JSON), `error_message`
- **Compatibility**: Compatible with `apps.orchestration.models.TaskRun`

### API Endpoints

Base URL: `/api/workflows/`

#### Workflows
- `POST /api/workflows/workflows/` - Create new workflow
- `GET /api/workflows/workflows/{id}/` - Get workflow details
- `PATCH /api/workflows/workflows/{id}/` - Update workflow
- `DELETE /api/workflows/workflows/{id}/` - Delete workflow
- `POST /api/workflows/workflows/{id}/execute/` - Execute workflow (creates WorkflowRun)
- `GET /api/workflows/workflows/{id}/runs/` - Get all runs for this workflow

#### Workflow Runs
- `GET /api/workflows/runs/` - List all workflow runs
  - Query param: `?workflow_id=<id>` - Filter by workflow
- `GET /api/workflows/runs/{id}/` - Get run details
- `PATCH /api/workflows/runs/{id}/` - Update run status/results

## Frontend Integration

### WorkflowMode Component Updates

The `WorkflowMode.tsx` component now:

1. **Auto-extracts workflow context** from:
   - `localStorage.getItem('env')` → `APP_NAME`, `PROJECT_NAME`
   - Current project → `project_id`, `project_name`
   - Canvas molecules → `molecules_used`, `atoms_in_molecules`

2. **Saves workflow data** when "Render Workflow" is clicked:
```typescript
{
  project_id: currentProject.id,
  project_name: "My Project",
  name: "Data Analysis - Q4 Report - 10/13/2025, 3:45:00 PM",
  slug: "data-analysis-q4-report-10-13-2025-3-45-00-pm",
  app_name: "Trinity Analytics",
  molecules_used: ["molecule-1", "molecule-2"],
  atoms_in_molecules: {
    "molecule-1": ["atom-a", "atom-b"],
    "molecule-2": ["atom-c"]
  },
  dag_spec: {
    nodes: [...],
    edges: [...],
    metadata: { ... }
  }
}
```

3. **Loads saved workflows** for the current project on component mount

### API Configuration

Added to `src/lib/api.ts`:
```typescript
export const WORKFLOWS_API = `${backendOrigin}${djangoPrefix}/workflows`;
```

## Database Schema

### Table: `public.workflows_workflow`

```sql
CREATE TABLE workflows_workflow (
    id BIGSERIAL PRIMARY KEY,
    project_id INTEGER NOT NULL,
    project_name VARCHAR(255) NOT NULL,
    name VARCHAR(255) NOT NULL,
    slug VARCHAR(255) NOT NULL,
    description TEXT,
    app_name VARCHAR(255),
    molecules_used JSONB DEFAULT '[]',
    atoms_in_molecules JSONB DEFAULT '{}',
    dag_spec JSONB DEFAULT '{}',
    user_id BIGINT REFERENCES accounts_user(id) ON DELETE SET NULL,
    created_at TIMESTAMP NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMP NOT NULL DEFAULT NOW(),
    is_active BOOLEAN DEFAULT TRUE,
    version INTEGER DEFAULT 1,
    execution_count INTEGER DEFAULT 0,
    last_executed_at TIMESTAMP NULL
);

CREATE INDEX ON workflows_workflow (project_id);
CREATE INDEX ON workflows_workflow (user_id);
CREATE INDEX ON workflows_workflow (slug);
CREATE INDEX ON workflows_workflow (created_at DESC);
```

### Table: `public.workflows_workflowrun`

```sql
CREATE TABLE workflows_workflowrun (
    id BIGSERIAL PRIMARY KEY,
    workflow_id BIGINT NOT NULL REFERENCES workflows_workflow(id) ON DELETE CASCADE,
    started_at TIMESTAMP NOT NULL DEFAULT NOW(),
    completed_at TIMESTAMP NULL,
    status VARCHAR(50) DEFAULT 'pending',
    error_message TEXT,
    result_data JSONB DEFAULT '{}'
);

CREATE INDEX ON workflows_workflowrun (workflow_id, started_at DESC);
CREATE INDEX ON workflows_workflowrun (status);
```

## Why Public Schema?

1. **Cross-tenant visibility**: Workflows can be shared across different tenants/projects
2. **Centralized analytics**: Track which molecules and atoms are most used across all projects
3. **Global search**: Find workflows by app name, molecule, or atom usage
4. **Simplified reporting**: Generate usage statistics without querying multiple tenant schemas

## Permissions

- **Regular users**: Can only see/edit their own workflows
- **Staff users**: Can see all workflows across all users
- Controlled via `WorkflowViewSet.get_queryset()` and `WorkflowRunViewSet.get_queryset()`

## Migration

To apply the database migration:

```bash
# From your host machine or inside the Django container:
python manage.py migrate workflows

# Or if using Docker:
docker-compose exec web python manage.py migrate workflows
```

## Admin Interface

Both models are registered in Django Admin at `/admin/`:

- **Workflows**: View/edit workflow definitions, see execution stats
- **Workflow Runs**: Track execution history, view results and errors

## Compatibility

- **Orchestration App**: `WorkflowRun` is compatible with `apps.orchestration.models.TaskRun`
- **Backwards Compatibility**: `WorkflowExecution` is aliased to `WorkflowRun` for legacy code

## Example Usage

### Creating a Workflow (Frontend)

```typescript
const response = await fetch(`${WORKFLOWS_API}/workflows/`, {
  method: 'POST',
  credentials: 'include',
  headers: getCsrfHeaders({ 'Content-Type': 'application/json' }),
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
    dag_spec: { nodes: [...], edges: [...] }
  })
});
```

### Executing a Workflow

```typescript
const response = await fetch(`${WORKFLOWS_API}/workflows/123/execute/`, {
  method: 'POST',
  credentials: 'include',
  headers: getCsrfHeaders({ 'Content-Type': 'application/json' })
});

// Returns: { run_id: 456, workflow_id: 123, message: "Workflow execution started" }
```

### Querying Workflows

```python
# Get all workflows for a project
workflows = Workflow.objects.filter(project_id=123)

# Get most executed workflows
popular = Workflow.objects.order_by('-execution_count')[:10]

# Find workflows using a specific molecule
workflows_with_molecule = Workflow.objects.filter(
    molecules_used__contains=["data-loader"]
)

# Find workflows using a specific atom
from django.db.models import Q
workflows_with_atom = Workflow.objects.filter(
    Q(atoms_in_molecules__data_loader__contains=["csv-reader"])
)
```

## Next Steps

1. ✅ **Complete**: Workflow models, serializers, views, URLs, admin
2. ✅ **Complete**: Frontend integration in WorkflowMode.tsx
3. ✅ **Complete**: Migration file created
4. 🔲 **TODO**: Apply migration to database
5. 🔲 **TODO**: Test workflow creation from frontend
6. 🔲 **TODO**: Implement workflow execution logic (Celery tasks)
7. 🔲 **TODO**: Add workflow analytics dashboard

## Files Created/Modified

### Backend (Django)
- ✅ `apps/workflows/__init__.py`
- ✅ `apps/workflows/apps.py`
- ✅ `apps/workflows/models.py` (Workflow, WorkflowRun)
- ✅ `apps/workflows/serializers.py`
- ✅ `apps/workflows/views.py` (WorkflowViewSet, WorkflowRunViewSet)
- ✅ `apps/workflows/urls.py`
- ✅ `apps/workflows/admin.py`
- ✅ `apps/workflows/migrations/0001_initial.py`

### Frontend (React)
- ✅ `src/lib/api.ts` (added WORKFLOWS_API)
- ✅ `src/components/WorkflowMode/WorkflowMode.tsx` (updated to save workflow data)

### Configuration
- ✅ `config/settings.py` (workflows already in SHARED_APPS)
- ✅ `config/urls.py` (workflows already routed)

## Troubleshooting

### Import Error: cannot import name 'WorkflowRun'

**Fixed!** The orchestration app was importing `WorkflowRun`, but the initial model was named `WorkflowExecution`. Renamed to `WorkflowRun` throughout the codebase.

### Workflow not saving

Check:
1. User is authenticated
2. CSRF token is being sent
3. Current project is set in localStorage
4. Migration has been applied

### Molecules/atoms not being captured

The workflow saves:
- `molecules_used`: Array of molecule IDs from canvas
- `atoms_in_molecules`: Mapping of molecule ID → array of atom names
- `dag_spec`: Complete canvas state including selected atoms

All three fields provide redundant but useful data for different query patterns.

