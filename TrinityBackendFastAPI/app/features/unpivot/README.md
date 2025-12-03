# Unpivot Atom Documentation

## Overview

The **Unpivot Atom** is a data transformation tool that converts wide datasets into long format by unpivoting (melting) columns into rows. This is the inverse operation of pivoting, transforming data from a matrix-like structure to a normalized format suitable for analysis and visualization.

### What is Unpivoting?

Unpivoting (also known as "melting" in pandas) transforms data from a wide format to a long format:
- **Wide Format**: Multiple columns represent different variables (e.g., Sales_Q1, Sales_Q2, Sales_Q3)
- **Long Format**: One column contains variable names, another contains values

**Example Transformation:**

**Before (Wide):**
| Product | Region | Q1_Sales | Q2_Sales | Q3_Sales |
|---------|--------|----------|----------|----------|
| Widget  | North  | 100      | 150      | 200      |
| Gadget  | South  | 120      | 180      | 220      |

**After (Long):**
| Product | Region | variable  | value |
|---------|--------|-----------|-------|
| Widget  | North  | Q1_Sales  | 100   |
| Widget  | North  | Q2_Sales  | 150   |
| Widget  | North  | Q3_Sales  | 200   |
| Gadget  | South  | Q1_Sales  | 120   |
| Gadget  | South  | Q2_Sales  | 180   |
| Gadget  | South  | Q3_Sales  | 220   |

---

## Features

### Core Functionality
- ✅ **Column Unpivoting**: Convert multiple columns into rows
- ✅ **ID Variables**: Keep specific columns as identifiers
- ✅ **Value Variables**: Select columns to unpivot
- ✅ **Custom Column Names**: Configure variable and value column names
- ✅ **Pre/Post Filtering**: Apply filters before and after unpivoting
- ✅ **Auto-refresh**: Automatically recompute when configuration changes
- ✅ **Large Dataset Support**: Handles datasets up to 100MB+ with intelligent caching

### Advanced Features
- 🔄 **Asynchronous Processing**: Uses Celery for long-running operations
- 💾 **Smart Caching**: Redis for small results, MinIO for large results
- 📊 **Result Preview**: Preview large results without loading full dataset
- 💾 **Save Results**: Export to Parquet, Arrow, or CSV formats
- 🔍 **Data Validation**: Validates configuration before computation
- 📈 **Summary Statistics**: Provides transformation metrics

---

## Architecture

### Frontend Components

#### Main Component: `UnpivotAtom.tsx`
- **Location**: `TrinityFrontend/src/components/AtomList/atoms/unpivot/UnpivotAtom.tsx`
- **Purpose**: Main orchestrator component that manages state and API calls
- **Key Responsibilities**:
  - Manages backend atom lifecycle (create/recreate on expiration)
  - Handles computation triggers (manual apply button)
  - Manages save operations
  - Coordinates between Canvas and Properties panels

#### Sub-Components

1. **UnpivotProperties.tsx**
   - Properties panel component
   - Integrates `UnpivotInputFiles` and `UnpivotSettings`
   - Manages settings synchronization

2. **UnpivotSettings.tsx**
   - Configuration UI for unpivot parameters
   - Column selection (ID Variables, Value Variables)
   - Custom column name configuration
   - Validation error display

3. **UnpivotInputFiles.tsx**
   - Dataset selection interface
   - Column schema loading
   - Dataset path management

4. **UnpivotCanvas.tsx**
   - Results display and visualization
   - Data table with pagination, sorting, filtering
   - Save/Refresh actions
   - Summary statistics display

5. **UnpivotFilterModal.tsx**
   - Filter configuration modal
   - Pre/post filter management

### Backend Services

#### Main Service: `unpivot_service.py`
- **Location**: `app/features/unpivot/unpivot_service.py`
- **Key Functions**:
  - `create_unpivot_atom()`: Create new atom instance
  - `compute_unpivot()`: Perform unpivot transformation
  - `update_unpivot_properties()`: Update configuration
  - `save_unpivot_result()`: Save results to MinIO
  - `_store_result()`: Intelligent caching (Redis/MinIO)

#### Router: `unpivot_router.py`
- **Location**: `app/features/unpivot/unpivot_router.py`
- **API Endpoints**: FastAPI routes for all operations
- **Task Queue Integration**: Celery task submission for async operations

#### Utilities: `unpivot_utils.py`
- **Location**: `app/features/unpivot/unpivot_utils.py`
- **Helper Functions**:
  - `resolve_columns()`: Case-insensitive column resolution
  - `apply_filters()`: Filter application logic
  - `validate_unpivot_config()`: Configuration validation
  - `get_dataset_schema_info()`: Schema extraction

#### Models: `unpivot_models.py`
- **Location**: `app/features/unpivot/unpivot_models.py`
- **Pydantic Models**: Request/Response schemas for all API endpoints

---

## API Endpoints

### Base URL
```
/api/v1/atoms/unpivot
```

### A. Atom Lifecycle

#### Create Atom
```http
POST /create
Content-Type: application/json

{
  "project_id": "string",
  "workflow_id": "string",
  "atom_name": "string",
  "dataset_path": "string"
}
```

**Response:**
```json
{
  "atom_id": "unpivot_abc123",
  "project_id": "string",
  "workflow_id": "string",
  "atom_name": "string",
  "created_at": "2024-01-01T00:00:00Z",
  "status": "created"
}
```

#### Get Metadata
```http
GET /{atom_id}/metadata
```

**Response:**
```json
{
  "atom_id": "unpivot_abc123",
  "project_id": "string",
  "workflow_id": "string",
  "atom_name": "string",
  "dataset_path": "string",
  "id_vars": ["Product", "Region"],
  "value_vars": ["Q1_Sales", "Q2_Sales", "Q3_Sales"],
  "variable_column_name": "variable",
  "value_column_name": "value",
  "pre_filters": [],
  "post_filters": [],
  "auto_refresh": true,
  "created_at": "2024-01-01T00:00:00Z",
  "updated_at": "2024-01-01T00:00:00Z",
  "last_computed_at": "2024-01-01T00:00:00Z"
}
```

#### Delete Atom
```http
DELETE /{atom_id}
```

---

### B. Configuration

#### Update Properties
```http
PATCH /{atom_id}/properties
Content-Type: application/json

{
  "id_vars": ["Product", "Region"],
  "value_vars": ["Q1_Sales", "Q2_Sales", "Q3_Sales"],
  "variable_column_name": "quarter",
  "value_column_name": "sales",
  "pre_filters": [
    {
      "field": "Region",
      "include": ["North", "South"]
    }
  ],
  "post_filters": [],
  "auto_refresh": true
}
```

**Note**: If `auto_refresh` is `true`, computation is automatically triggered after property update.

---

### C. Computation

#### Compute Unpivot
```http
POST /{atom_id}/compute
Content-Type: application/json

{
  "force_recompute": false
}
```

**Response** (Celery Task):
```json
{
  "task_id": "celery-task-id",
  "status": "pending",
  "metadata": {
    "feature": "unpivot",
    "operation": "compute",
    "atom_id": "unpivot_abc123"
  }
}
```

**Resolved Response**:
```json
{
  "atom_id": "unpivot_abc123",
  "status": "success",
  "updated_at": "2024-01-01T00:00:00Z",
  "row_count": 1500,
  "dataframe": [
    {
      "Product": "Widget",
      "Region": "North",
      "variable": "Q1_Sales",
      "value": 100
    },
    ...
  ],
  "summary": {
    "original_rows": 500,
    "original_columns": 5,
    "unpivoted_rows": 1500,
    "unpivoted_columns": 4,
    "id_vars_count": 2,
    "value_vars_count": 3
  },
  "computation_time": 2.45
}
```

#### Get Result
```http
GET /{atom_id}/result
```

Returns the last computed result without recomputing.

---

### D. Validation & Schema

#### Validate Configuration
```http
POST /validate
Content-Type: application/json

{
  "dataset_path": "minio://datasets/sales.parquet",
  "id_vars": ["Product", "Region"],
  "value_vars": ["Q1_Sales", "Q2_Sales"],
  "variable_column_name": "quarter",
  "value_column_name": "sales"
}
```

**Response:**
```json
{
  "valid": true,
  "errors": [],
  "warnings": ["Unspecified columns will be dropped: ['Notes']"],
  "column_info": {
    "total_columns": 5,
    "id_vars_resolved": ["Product", "Region"],
    "value_vars_resolved": ["Q1_Sales", "Q2_Sales"]
  }
}
```

#### Get Dataset Schema
```http
POST /dataset-schema
Content-Type: application/json

{
  "dataset_path": "minio://datasets/sales.parquet"
}
```

**Response:**
```json
{
  "columns": ["Product", "Region", "Q1_Sales", "Q2_Sales", "Q3_Sales"],
  "dtypes": {
    "Product": "object",
    "Region": "object",
    "Q1_Sales": "float64",
    "Q2_Sales": "float64",
    "Q3_Sales": "float64"
  },
  "null_stats": {
    "Product": 0,
    "Region": 0,
    "Q1_Sales": 5,
    "Q2_Sales": 3,
    "Q3_Sales": 2
  },
  "row_count": 1000,
  "id_vars_candidates": ["Product", "Region"],
  "value_vars_candidates": ["Q1_Sales", "Q2_Sales", "Q3_Sales"]
}
```

---

### E. Save & Auto Mechanisms

#### Save Result
```http
POST /{atom_id}/save
Content-Type: application/json

{
  "format": "parquet",
  "filename": "unpivot_result_20240101"
}
```

**Response:**
```json
{
  "atom_id": "unpivot_abc123",
  "status": "success",
  "minio_path": "projects/proj123/workflows/wf123/unpivot/unpivot_result_20240101.parquet",
  "updated_at": "2024-01-01T00:00:00Z",
  "row_count": 1500
}
```

**Supported Formats:**
- `parquet` (default)
- `arrow`
- `csv`

#### Dataset Updated (Auto-refresh)
```http
POST /{atom_id}/dataset-updated
Content-Type: application/json

{
  "dataset_path": "minio://datasets/sales_updated.parquet"
}
```

Triggers automatic recomputation with current configuration.

#### Autosave State
```http
POST /{atom_id}/autosave
```

Creates a snapshot of the current atom state for recovery.

---

### F. Cache

#### Get Cached Result
```http
GET /{atom_id}/cache
```

Returns cached result if available, without recomputing.

---

## Configuration Options

### ID Variables (`id_vars`)
- **Type**: `List[str]`
- **Description**: Columns that will remain as identifier columns in the unpivoted result
- **Example**: `["Product", "Region", "Date"]`
- **Behavior**: If empty, a `row_number` column is automatically added

### Value Variables (`value_vars`)
- **Type**: `List[str]`
- **Description**: Columns that will be unpivoted (converted from columns to rows)
- **Example**: `["Q1_Sales", "Q2_Sales", "Q3_Sales"]`
- **Behavior**: If empty, all columns not in `id_vars` are used

### Variable Column Name (`variable_column_name`)
- **Type**: `str`
- **Default**: `"variable"`
- **Description**: Name for the column containing variable names (original column names)
- **Validation**: Must not conflict with existing columns

### Value Column Name (`value_column_name`)
- **Type**: `str`
- **Default**: `"value"`
- **Description**: Name for the column containing values
- **Validation**: Must not conflict with existing columns

### Pre-Filters (`pre_filters`)
- **Type**: `List[UnpivotFilterConfig]`
- **Description**: Filters applied to the dataset before unpivoting
- **Example**:
```json
[
  {
    "field": "Region",
    "include": ["North", "South"]
  },
  {
    "field": "Product",
    "exclude": ["Discontinued"]
  }
]
```

### Post-Filters (`post_filters`)
- **Type**: `List[UnpivotFilterConfig]`
- **Description**: Filters applied to the unpivoted result
- **Example**:
```json
[
  {
    "field": "value",
    "include": ["100", "200", "300"]
  }
]
```

### Auto-Refresh (`auto_refresh`)
- **Type**: `bool`
- **Default**: `true`
- **Description**: Automatically recompute when properties change

---

## Data Flow

### 1. Atom Creation
```
User selects dataset → Frontend calls POST /create → Backend creates atom → Returns atom_id
```

### 2. Configuration
```
User selects columns → Frontend calls PATCH /{atom_id}/properties → Backend updates metadata
→ If auto_refresh=true → Triggers computation
```

### 3. Computation
```
User clicks Apply → Frontend calls POST /{atom_id}/compute → Backend submits Celery task
→ Task executes: Load dataset → Apply pre-filters → Unpivot → Apply post-filters
→ Store result (Redis/MinIO) → Return result
```

### 4. Result Display
```
Frontend receives result → Displays in UnpivotCanvas → User can sort/filter/paginate
```

### 5. Save
```
User clicks Save → Frontend calls POST /{atom_id}/save → Backend loads result
→ Converts to requested format → Uploads to MinIO → Returns path
```

---

## Storage & Caching Strategy

### Small Results (≤20MB)
- **Storage**: Redis (full data)
- **TTL**: 3600 seconds (1 hour)
- **Access**: Fast, direct retrieval

### Large Results (20MB - 100MB)
- **Storage**: 
  - Redis: Metadata only
  - MinIO: Full data (Arrow format)
- **Access**: Load from MinIO on demand

### Very Large Results (>100MB)
- **Storage**:
  - Redis: Preview (first 1000 rows)
  - MinIO: Full data (Arrow format)
- **Access**: Preview shown immediately, full data available in MinIO

### Cache Keys
- `unpivot:{atom_id}:metadata` - Atom metadata
- `unpivot:{atom_id}:result` - Computation result
- `unpivot:{atom_id}:config` - Configuration snapshot

### MinIO Paths
- **Cache**: `{prefix}/unpivot/cache/{atom_id}_result.arrow`
- **Saved Results**: `{prefix}/unpivot/{filename}.{ext}`

---

## Error Handling

### Common Errors

#### 404 - Atom Not Found
```json
{
  "detail": "Unpivot atom 'unpivot_abc123' not found"
}
```
**Solution**: Atom expired (TTL). Frontend automatically recreates.

#### 400 - Invalid Configuration
```json
{
  "detail": "Invalid configuration: Column 'variable' conflicts with existing column"
}
```
**Solution**: Change `variable_column_name` or `value_column_name`.

#### 400 - Empty Dataset
```json
{
  "detail": "Dataset is empty"
}
```
**Solution**: Select a valid dataset with data.

#### 400 - No Rows After Filters
```json
{
  "detail": "No rows remain after applying pre-filters"
}
```
**Solution**: Adjust filter criteria.

---

## Performance Considerations

### Timeout Settings
- **Default Timeout**: 5 minutes (300,000ms)
- **Unpivot Timeout**: 15 minutes (900,000ms)
- **Max Attempts**: 180 (for unpivot tasks)

### Optimization Strategies
1. **Column Selection**: Only select necessary columns
2. **Pre-filtering**: Use pre-filters to reduce dataset size before unpivoting
3. **Caching**: Results are cached to avoid recomputation
4. **Large Dataset Handling**: Very large results use preview mode

### Memory Management
- Large results are streamed to MinIO
- Preview mode limits frontend memory usage
- Arrow format used for efficient storage

---

## Usage Examples

### Example 1: Basic Unpivot
**Goal**: Unpivot quarterly sales data

**Configuration:**
```json
{
  "id_vars": ["Product", "Region"],
  "value_vars": ["Q1_Sales", "Q2_Sales", "Q3_Sales", "Q4_Sales"],
  "variable_column_name": "Quarter",
  "value_column_name": "Sales"
}
```

**Result**: Each product/region combination becomes 4 rows (one per quarter).

### Example 2: Unpivot with Filters
**Goal**: Unpivot only for specific regions

**Configuration:**
```json
{
  "id_vars": ["Product", "Region"],
  "value_vars": ["Q1_Sales", "Q2_Sales", "Q3_Sales"],
  "pre_filters": [
    {
      "field": "Region",
      "include": ["North", "South"]
    }
  ]
}
```

### Example 3: Unpivot All Columns
**Goal**: Unpivot all columns except ID columns

**Configuration:**
```json
{
  "id_vars": ["Product_ID", "Date"],
  "value_vars": []
}
```

**Note**: When `value_vars` is empty, all columns except `id_vars` are unpivoted.

### Example 4: No ID Variables
**Goal**: Unpivot all columns

**Configuration:**
```json
{
  "id_vars": [],
  "value_vars": ["Col1", "Col2", "Col3"]
}
```

**Result**: A `row_number` column is automatically added as the identifier.

---

## Integration with Laboratory Mode

The Unpivot Atom integrates with the Trinity Laboratory Mode workflow:

1. **Atom Creation**: User drags Unpivot atom onto canvas
2. **Dataset Selection**: User selects input dataset from Input Files tab
3. **Configuration**: User configures columns in Settings tab
4. **Computation**: User clicks Apply to trigger computation
5. **Results**: Results displayed in Canvas tab
6. **Save**: User can save results for use in downstream atoms

### State Management
- Atom state stored in `laboratoryStore` (Zustand)
- Settings synchronized between Properties and Canvas
- Backend atom ID managed automatically

---

## Testing

### Manual Testing Checklist
- [ ] Create atom with valid dataset
- [ ] Configure ID and Value variables
- [ ] Apply pre-filters
- [ ] Compute unpivot
- [ ] Verify results display correctly
- [ ] Test sorting and filtering in results
- [ ] Save result to MinIO
- [ ] Test with large dataset (>100MB)
- [ ] Test error handling (invalid columns, empty dataset)
- [ ] Test auto-refresh functionality

### API Testing
Use the FastAPI interactive docs at `/docs` to test endpoints directly.

---

## Troubleshooting

### Issue: Results not updating
**Solution**: 
- Check if `auto_refresh` is enabled
- Manually click Apply button
- Check browser console for errors

### Issue: Slow computation
**Solution**:
- Reduce number of value_vars
- Apply pre-filters to reduce dataset size
- Check dataset size (very large datasets take longer)

### Issue: Memory errors
**Solution**:
- Results >100MB use preview mode automatically
- Full data available in MinIO
- Consider filtering data before unpivoting

### Issue: Column not found
**Solution**:
- Column names are case-insensitive but must match
- Check dataset schema using `/dataset-schema` endpoint
- Verify column names in Input Files tab

---

## Future Enhancements

Potential improvements:
- [ ] Support for multiple datasets
- [ ] Advanced aggregation options
- [ ] Real-time preview during computation
- [ ] Export to additional formats (Excel, JSON)
- [ ] Undo/Redo functionality
- [ ] Batch processing multiple configurations
- [ ] Performance metrics dashboard

---

## Related Documentation

- [Laboratory Mode Documentation](../LaboratoryMode/README.md)
- [Task Queue Documentation](../../core/task_queue/README.md)
- [Data Storage Documentation](../../DataStorageRetrieval/README.md)

---

## Support

For issues or questions:
1. Check this documentation
2. Review error messages in browser console
3. Check backend logs for detailed error information
4. Contact the development team

---

**Last Updated**: 2024-01-01
**Version**: 1.0.0

