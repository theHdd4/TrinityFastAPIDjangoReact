# UseCase App

This Django app manages use case applications that can be selected by users. The data is stored in the public schema as `trinity_db_public_table_usecase`.

## Purpose

The UseCase app provides a centralized registry of available application templates that users can select from when creating new projects. This replaces the need to query the `registry_app` table across different tenant schemas.

## Database Schema

**Table**: `trinity_db_public_table_usecase`

| Column | Type | Description |
|--------|------|-------------|
| id | bigint | Primary key |
| name | varchar(150) | Application name (unique) |
| slug | varchar(150) | URL-friendly identifier (unique) |
| description | text | Application description |
| created_at | timestamp | Creation timestamp |
| updated_at | timestamp | Last update timestamp |

## Models

### UseCase

Represents a use case application template.

**Fields:**
- `name`: Application name (max 150 chars, unique)
- `slug`: URL-friendly identifier (max 150 chars, unique)
- `description`: Application description (optional)
- `created_at`: Auto-generated creation timestamp
- `updated_at`: Auto-generated update timestamp

## Management Commands

### populate_usecases

Populates the UseCase table with predefined use cases:

```bash
python manage.py populate_usecases
```

**Predefined Use Cases:**
1. **Marketing Mix Modeling** (`marketing-mix`)
   - Description: "Preset: Pre-process + Build"

2. **Forecasting Analysis** (`forecasting`)
   - Description: "Preset: Pre-process + Explore"

3. **Promo Effectiveness** (`promo-effectiveness`)
   - Description: "Preset: Explore + Build"

4. **Blank App** (`blank`)
   - Description: "Start from an empty canvas"

## API Endpoints

The app provides REST API endpoints through Django REST Framework:

- `GET /api/usecases/` - List all use cases
- `GET /api/usecases/{id}/` - Get specific use case
- `GET /api/usecases/list_available/` - List available use cases for selection

## Usage

### In Django Shell

```python
from apps.usecase.models import UseCase

# Get all use cases
usecases = UseCase.objects.all()

# Get specific use case by slug
usecase = UseCase.objects.get(slug='marketing-mix')

# Create new use case
usecase = UseCase.objects.create(
    name='New App',
    slug='new-app',
    description='A new application template'
)
```

### In FastAPI

```python
# Query the usecase table from FastAPI
import asyncpg

async def get_usecases():
    conn = await asyncpg.connect(
        host=POSTGRES_HOST,
        user=POSTGRES_USER,
        password=POSTGRES_PASSWORD,
        database=POSTGRES_DB,
    )
    try:
        rows = await conn.fetch(
            "SELECT id, name, slug, description FROM trinity_db_public_table_usecase ORDER BY name"
        )
        return [dict(row) for row in rows]
    finally:
        await conn.close()
```

## Migration

The app includes an initial migration that creates the `trinity_db_public_table_usecase` table in the public schema.

To apply migrations:
```bash
python manage.py migrate usecase
```

## Testing

Run the test script to populate and verify data:
```bash
python test_usecase_data.py
```

## Integration with Existing Code

This app provides a centralized alternative to the `registry_app` table queries in:

- `TrinityBackendFastAPI/app/DataStorageRetrieval/db/client_project.py`
- `TrinityBackendFastAPI/app/DataStorageRetrieval/db/registry.py`

Instead of joining with `registry_app`, you can now query the `trinity_db_public_table_usecase` table directly from any schema context.
