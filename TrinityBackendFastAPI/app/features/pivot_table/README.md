# Pivot Table API

Base URL: `/api/pivot`

## Endpoints

### POST `/{config_id}/compute`
Generate pivot table from dataset.

**Request Body:**
```json
{
  "data_source": "path/to/data.arrow",
  "rows": ["Region", "Country"],
  "columns": ["Product", "Category"],
  "values": [
    {"field": "Sales", "aggregation": "sum"},
    {"field": "Quantity", "aggregation": "avg", "weight_column": "Weight"}
  ],
  "filters": [
    {"field": "Year", "include": ["2023", "2024"]},
    {"field": "Status", "exclude": ["Cancelled"]}
  ],
  "sorting": {
    "Region": {"type": "asc"},
    "Sales": {"type": "value_desc", "level": 0, "preserve_hierarchy": true}
  },
  "dropna": true,
  "fill_value": 0,
  "limit": 1000,
  "grand_totals": "both"
}
```

**Response:**
```json
{
  "config_id": "pivot_abc123",
  "status": "success",
  "updated_at": "2024-01-01T00:00:00Z",
  "rows": 150,
  "data": [...],
  "hierarchy": [...],
  "column_hierarchy": [...]
}
```

### GET `/{config_id}/data`
Retrieve cached pivot results.

### POST `/{config_id}/refresh`
Recompute pivot using last cached configuration.

### POST `/{config_id}/save`
Save pivot results to MinIO as Arrow file. **Always saves full dataset regardless of limit setting.**

**Request Body:**
```json
{
  "filename": "optional_custom_name.arrow",
  "data": [{"optional": "pre-calculated data with percentages"}]
}
```

**Response:**
```json
{
  "config_id": "pivot_abc123",
  "status": "success",
  "object_name": "pivot/pivot_abc123.arrow",
  "updated_at": "2024-01-01T00:00:00Z",
  "rows": 1500
}
```

**Note:** If `data` is provided, it's saved directly. Otherwise, the pivot table is recomputed without limit to ensure the full dataset is saved.

### GET `/{config_id}/status`
Get computation status: `pending`, `success`, `failed`, `unknown`.

## Features

### Aggregations
- `sum`, `avg`/`average`/`mean`, `count`, `min`, `max`, `median`, `weighted_average`
- Weighted average requires `weight_column` in value config
- Object columns auto-converted to numeric for aggregation

### Filters
- `include`: Whitelist values
- `exclude`: Blacklist values
- Applied before aggregation

### Sorting
- `asc`/`desc`: Alphabetical by field value
- `value_asc`/`value_desc`: By aggregated value
- `level`: Hierarchy level (0-based)
- `preserve_hierarchy`: Keep parent-child relationships

### Subtotals
Control display of subtotals for grouped row fields:
- `off`: Do not show subtotals
- `top`: Show all subtotals at top of group
- `bottom`: Show all subtotals at bottom of group

**Frontend:** `subtotalsMode` setting in `PivotTableAtom`

### Grand Totals
Control visibility of grand totals (overall totals):
- `off`: Off for rows and columns
- `rows`: On for rows only (footer row)
- `columns`: On for columns only (summary column)
- `both`: On for rows and columns

**API:** `grand_totals` parameter in `PivotComputeRequest`  
**Frontend:** `grandTotalsMode` setting

### Show Values As
Display values as percentages or calculations:
- `off`: No calculation (show raw values)
- `row`: % of Row Total (each cell as % of its row)
- `column`: % of Column Total (each cell as % of its column)
- `grand_total`: % of Grand Total (each cell as % of overall total)

**Frontend:** `percentageMode` setting with `percentageDecimals` (default: 2)  
**Note:** Percentage calculations exclude Grand Total rows/columns to avoid double-counting. When saving with percentages, canonicalized duplicate columns are automatically removed.

### Report Layout
Visual structure of the pivot table:
- `compact`: Show in compact form (nested fields in single column)
- `outline`: Show in outline form (indented hierarchy with subtotals)
- `tabular`: Show in tabular form (each field in separate column)

**Frontend:** `reportLayout` setting  
**Note:** Compact and outline layouts require hierarchical row fields. Tabular layout is always available.

### Pivot Options
Display and formatting options:
- **Row Headers**: Show/hide row header column (default: true)
- **Column Headers**: Show/hide column header rows (default: true)
- **Banded Rows**: Apply alternating row colors for readability (default: false)

**Frontend:** `pivotStyleOptions` object with `rowHeaders`, `columnHeaders`, `bandedRows` boolean flags

### PivotTable Styles
Visual themes for the pivot table with predefined color schemes:
- Multiple theme groups (Light, Dark, Accent, etc.)
- Each theme defines colors for:
  - Header background/text
  - Row background/alternate background
  - Total row background
  - Border colors

**Frontend:** `pivotStyleId` setting (theme ID) and `pivotStyleOptions` for customization

### Data Handling
- `dropna`: Remove rows/columns with all NaN
- `fill_value`: Replace NaN with specified value
- `limit`: Max rows returned for display (1-20000). **Note: Save operation always saves full dataset regardless of limit.**
- Results cached in Redis (TTL: 3600s)

### Column Formatting
- Multi-level columns formatted as `"Field1 | Field2 | Value"`
- Canonicalized duplicates removed when saving percentage data
- Original formatted names preserved

## Frontend Integration

Frontend uses `PIVOT_API` from `src/lib/api.ts`. The `PivotTableAtom` component provides:

### UI Features
- **Toolbar Controls:**
  - Subtotals dropdown (off/top/bottom)
  - Grand Totals dropdown (off/rows/columns/both)
  - Show Values As dropdown (off/row/column/grand_total)
  - Report Layout dropdown (compact/outline/tabular)
  - Pivot Options menu (row headers, column headers, banded rows)
  - PivotTable Styles gallery (multiple theme groups)

### Functionality
- Percentage calculations (row/column/grand_total modes) with configurable decimal places
- Hierarchical row/column display with expand/collapse
- Save/Save As with optional percentage conversion
- Real-time computation via Celery tasks
- Automatic removal of canonicalized duplicate columns when saving percentage data
- Full dataset saved regardless of display limit

### Settings Structure
```typescript
{
  subtotalsMode: 'off' | 'top' | 'bottom',
  grandTotalsMode: 'off' | 'rows' | 'columns' | 'both',
  percentageMode: 'off' | 'row' | 'column' | 'grand_total',
  percentageDecimals: number, // default: 2
  reportLayout: 'compact' | 'outline' | 'tabular',
  pivotStyleId: string, // theme identifier
  pivotStyleOptions: {
    rowHeaders: boolean,
    columnHeaders: boolean,
    bandedRows: boolean
  }
}
```

