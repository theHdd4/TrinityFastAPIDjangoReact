# Scenario Planner Atom Documentation

## Overview

The **Scenario Planner Atom** is a business intelligence tool for forecasting and scenario analysis. It enables users to create multiple "what-if" scenarios by adjusting feature values and predicting outcomes using trained machine learning models. The atom supports hierarchical aggregation, multiple views, and cluster-specific scenario tweaks.

### What is Scenario Planning?

Scenario planning allows users to:
- **Baseline Prediction**: Calculate predictions using reference (historical) feature values
- **Scenario Prediction**: Adjust feature values and predict outcomes
- **Impact Analysis**: Compare baseline vs scenario to measure delta and percentage uplift
- **Multi-View Analysis**: Aggregate results across different identifier hierarchies

**Example Use Case:**
- **Baseline**: Predict sales with current pricing and marketing spend
- **Scenario**: Predict sales with 10% price increase and 20% marketing boost
- **Result**: See delta (absolute change) and percentage uplift

---

## Features

### Core Functionality
- ✅ **Multi-Scenario Support**: Create and manage multiple scenarios per atom
- ✅ **Reference Calculation**: Auto-calculate baseline values from historical data
- ✅ **Cluster-Specific Tweaks**: Apply different scenario changes per combination
- ✅ **Feature Adjustments**: Percentage or absolute value changes
- ✅ **Hierarchical Aggregation**: Multiple views with different identifier hierarchies
- ✅ **Result Visualization**: Charts and tables for scenario comparison
- ✅ **MongoDB Persistence**: Save reference points, configurations, and results

### Advanced Features
- 🔄 **Smart Caching**: Intelligent dataset caching with freshness checks
- 📊 **Multiple Views**: Create different aggregation views (flat, hierarchy, individuals)
- 💾 **Auto-Save**: Automatic saving of reference points and configurations
- 🔍 **Date Range Selection**: Filter reference calculation by date period
- 📈 **Feature Contribution**: See individual feature contributions to predictions

---

## Architecture

### Backend Services

#### Main Service: `scenario_service.py`
- **Location**: `app/features/scenario_planner_category_forecasting/scenario_planner_category_forecasting/app/scenario/scenario_service.py`
- **Key Functions**:
  - `run_scenario()`: Execute scenario planning pipeline
  - `_calc_reference()`: Calculate reference values from historical data
  - `apply_tweaks()`: Apply cluster-specific scenario adjustments
  - `_prepare_results_dataframe()`: Flatten results for CSV export

#### Router: `routes_scenario.py`
- **Location**: `app/features/scenario_planner_category_forecasting/scenario_planner_category_forecasting/app/routes/routes_scenario.py`
- **API Endpoints**: FastAPI routes for all operations
- **Base Path**: `/api/scenario`

#### Data Service: `data_service.py`
- **Location**: `app/features/scenario_planner_category_forecasting/scenario_planner_category_forecasting/app/scenario/data_service.py`
- **Key Functions**:
  - `fetch_selected_models()`: Load model metadata from MongoDB
  - `cache_dataset_smart()`: Intelligent dataset caching
  - `get_cluster_dataframe()`: Retrieve data slices for combinations
  - `build_and_cache_cluster_slices()`: Pre-cache cluster data

### Frontend Components

#### Main Component: `ScenarioPlannerAtom.tsx`
- **Location**: `TrinityFrontend/src/components/AtomList/atoms/scenario-planner/ScenarioPlannerAtom.tsx`
- **Purpose**: Main orchestrator component
- **Integration**: Manages state and coordinates between Canvas and Settings

#### Sub-Components

1. **ScenarioPlannerCanvas.tsx**
   - **Location**: `TrinityFrontend/src/components/AtomList/atoms/scenario-planner/components/ScenarioPlannerCanvas.tsx`
   - **Purpose**: Main canvas for scenario configuration and results
   - **Backend Integration**:
     - `POST /api/scenario/run` - Execute scenario
     - `POST /api/scenario/reference` - Calculate reference values
     - `GET /api/scenario/get-reference-points` - Load saved reference points
     - `GET /api/scenario/get-reference-points-for-combinations` - Auto-populate reference values

2. **ScenarioPlannerInputFiles.tsx**
   - **Location**: `TrinityFrontend/src/components/AtomList/atoms/scenario-planner/components/ScenarioPlannerInputFiles.tsx`
   - **Purpose**: Dataset selection and cache initialization
   - **Backend Integration**:
     - `GET /api/scenario/init-cache` - Initialize dataset cache
     - `GET /api/scenario/identifiers` - Fetch available identifiers
     - `GET /api/scenario/features` - Fetch available features
     - `GET /api/scenario/combinations` - Fetch available combinations
     - `DELETE /api/scenario/cache/{d0_key}` - Clear dataset cache

3. **ScenarioPlannerSettings.tsx**
   - **Location**: `TrinityFrontend/src/components/AtomList/atoms/scenario-planner/components/ScenarioPlannerSettings.tsx`
   - **Purpose**: Configuration UI for scenarios, features, and views
   - **Backend Integration**:
     - `GET /api/scenario/init-cache` - Initialize cache with force refresh
     - `GET /api/scenario/identifiers` - Load identifiers
     - `GET /api/scenario/features` - Load features
     - `GET /api/scenario/combinations` - Load combinations
     - `GET /api/scenario/y-variable` - Get target variable info
     - `GET /api/scenario/get-date-range` - Get available date range

4. **ScenarioPlannerProperties.tsx**
   - **Location**: `TrinityFrontend/src/components/AtomList/atoms/scenario-planner/components/properties/ScenarioPlannerProperties.tsx`
   - **Purpose**: Properties panel wrapper

---

## API Endpoints

### Base URL
```
/api/scenario
```

### A. Cache Management

#### Initialize Cache
```http
GET /init-cache?d0_key={file_key}&model_id={model_id}&force_refresh={bool}
```

**Frontend Integration**: 
- `ScenarioPlannerInputFiles.tsx` (line 233)
- `ScenarioPlannerSettings.tsx` (line 556)

**Response:**
```json
{
  "message": "Cache refreshed - data changed",
  "models_cached": 10,
  "d0_rows": 5000,
  "d0_cols": 15,
  "missing_clusters": 2,
  "action": "refreshed"
}
```

#### Clear Dataset Cache
```http
DELETE /cache/{d0_key}
```

**Frontend Integration**: `ScenarioPlannerInputFiles.tsx` (line 182)

#### Clear All Cache
```http
DELETE /cache/all
```

---

### B. Metadata Endpoints

#### Get Identifiers
```http
GET /identifiers?model_id={model_id}
```

**Frontend Integration**:
- `ScenarioPlannerInputFiles.tsx` (line 92)
- `ScenarioPlannerSettings.tsx` (line 595)
- `scenarioPlannerUtils.ts` (line 32)

**Response:**
```json
{
  "identifier_columns": ["Category", "SubCategory", "Region"],
  "identifier_values": {
    "Category": ["Electronics", "Clothing"],
    "SubCategory": ["Phones", "Laptops"],
    "Region": ["North", "South"]
  },
  "total_combinations": 10,
  "message": "Available identifiers from 10 models"
}
```

#### Get Features
```http
GET /features?model_id={model_id}
```

**Frontend Integration**:
- `ScenarioPlannerInputFiles.tsx` (line 117)
- `ScenarioPlannerSettings.tsx` (line 624)
- `scenarioPlannerUtils.ts` (line 40)

**Response:**
```json
{
  "features_by_model": {
    "combo1_model": {
      "x_variables": ["Price", "Marketing", "Season"],
      "y_variable": "Sales",
      "model_type": "Linear",
      "combination": "combo1"
    }
  },
  "all_unique_features": ["Price", "Marketing", "Season"],
  "message": "Features extracted from 10 models"
}
```

#### Get Combinations
```http
GET /combinations?model_id={model_id}
```

**Frontend Integration**:
- `ScenarioPlannerInputFiles.tsx` (line 142)
- `ScenarioPlannerSettings.tsx` (line 654)

**Response:**
```json
{
  "combinations": [
    {
      "combination_id": "Category_Electronics_Region_North",
      "identifiers": {
        "Category": "Electronics",
        "Region": "North"
      }
    }
  ],
  "total_combinations": 10,
  "message": "Found 10 combinations with trained models"
}
```

#### Get Y-Variable
```http
GET /y-variable?model_id={model_id}
```

**Frontend Integration**: `ScenarioPlannerSettings.tsx` (line 685)

**Response:**
```json
{
  "y_variable": "Sales",
  "model_info": {
    "model_type": "Linear",
    "training_id": "train_123",
    "combination": "combo1",
    "x_variables_count": 3,
    "x_variables": ["Price", "Marketing", "Season"]
  },
  "models_count": 10,
  "message": "Target variable: Sales"
}
```

#### Get Date Range
```http
GET /get-date-range?model_id={model_id}
```

**Frontend Integration**: `ScenarioPlannerSettings.tsx` (line 239)

**Response:**
```json
{
  "success": true,
  "message": "Date range retrieved successfully",
  "data": {
    "start_date": "2024-01-01",
    "end_date": "2024-12-31",
    "date_column": "Date",
    "total_rows": 365
  }
}
```

---

### C. Reference Calculation

#### Calculate Reference Values
```http
POST /reference
Content-Type: application/json

{
  "model_id": "client/app/project",
  "stat": "period-mean",
  "start_date": "2024-01-01",
  "end_date": "2024-12-31"
}
```

**Frontend Integration**: `ScenarioPlannerCanvas.tsx` (lines 1783, 2066)

**Response:**
```json
{
  "reference_values_by_combination": {
    "combo1": {
      "features": ["Price", "Marketing"],
      "reference_values": {
        "Price": 100.0,
        "Marketing": 5000.0
      },
      "data_slice_rows": 1000
    }
  },
  "statistic_used": "period-mean",
  "date_range": {
    "start_date": "2024-01-01",
    "end_date": "2024-12-31"
  },
  "data_info": {
    "dataset_key": "path/to/data.arrow",
    "total_rows": 5000,
    "combinations_processed": 10,
    "total_features": 20
  },
  "mongo_save": {
    "status": "success",
    "mongo_id": "ref_123",
    "operation": "created"
  }
}
```

#### Get Saved Reference Points
```http
GET /get-reference-points?client_name={client}&app_name={app}&project_name={project}
```

**Frontend Integration**: `ScenarioPlannerCanvas.tsx` (lines 2484, 2731, 3407)

#### Get Reference Points for Combinations
```http
GET /get-reference-points-for-combinations?model_id={model_id}&combination_ids={ids}&feature_names={names}
```

**Frontend Integration**: `ScenarioPlannerCanvas.tsx` (line 3276)

---

### D. Scenario Execution

#### Run Scenario
```http
POST /run
Content-Type: application/json

{
  "model_id": "client/app/project",
  "scenario_id": "scenario-1",
  "start_date": "2024-01-01",
  "end_date": "2024-12-31",
  "stat": "period-mean",
  "clusters": [
    {
      "combination_id": "combo1",
      "scenario_defs": {
        "Price": {"type": "pct", "value": 10},
        "Marketing": {"type": "abs", "value": 6000}
      }
    }
  ],
  "views": {
    "view-1": {
      "selected_identifiers": [
        {"Category": ["Electronics"]}
      ]
    }
  }
}
```

**Frontend Integration**: `ScenarioPlannerCanvas.tsx` (line 1382)

**Response:**
```json
{
  "run_id": "uuid-123",
  "dataset_used": "path/to/data.arrow",
  "created_at": "2024-01-01T00:00:00Z",
  "models_processed": 10,
  "y_variable": "Sales",
  "view_results": {
    "view-1": {
      "flat": [...],
      "hierarchy": {...},
      "individuals": [...]
    }
  }
}
```

---

### E. MongoDB Persistence

#### Get Scenario Configurations
```http
GET /get-scenario-configurations?client_name={client}&app_name={app}&project_name={project}
```

#### Update Reference Points
```http
PUT /update-reference-points?client_name={client}&app_name={app}&project_name={project}
```

#### Update Scenario Configurations
```http
PUT /update-scenario-configurations?client_name={client}&app_name={app}&project_name={project}
```

#### Get Scenario Results
```http
GET /get-scenario-results?client_name={client}&app_name={app}&project_name={project}&scenario_id={id}
```

---

## Frontend-Backend Integration Map

### ScenarioPlannerInputFiles.tsx
| Endpoint | Method | Line | Purpose |
|----------|--------|------|---------|
| `/init-cache` | GET | 233 | Initialize dataset cache |
| `/identifiers` | GET | 92 | Load available identifiers |
| `/features` | GET | 117 | Load available features |
| `/combinations` | GET | 142 | Load available combinations |
| `/cache/{d0_key}` | DELETE | 182 | Clear dataset cache |

### ScenarioPlannerSettings.tsx
| Endpoint | Method | Line | Purpose |
|----------|--------|------|---------|
| `/init-cache` | GET | 556 | Initialize/refresh cache |
| `/identifiers` | GET | 595 | Load identifiers |
| `/features` | GET | 624 | Load features |
| `/combinations` | GET | 654 | Load combinations |
| `/y-variable` | GET | 685 | Get target variable info |
| `/get-date-range` | GET | 239 | Get available date range |

### ScenarioPlannerCanvas.tsx
| Endpoint | Method | Line | Purpose |
|----------|--------|------|---------|
| `/run` | POST | 1382 | Execute scenario |
| `/reference` | POST | 1783, 2066 | Calculate reference values |
| `/get-reference-points` | GET | 2484, 2731, 3407 | Load saved reference points |
| `/get-reference-points-for-combinations` | GET | 3276 | Auto-populate reference values |

---

## Configuration Options

### Scenario Configuration
- **scenario_id**: Unique identifier for the scenario
- **start_date / end_date**: Date range for reference calculation
- **stat**: Statistic type (`period-mean`, `period-median`, `mean`, `median`)
- **clusters**: Array of cluster-specific scenario definitions
  - `combination_id`: Target combination
  - `scenario_defs`: Feature adjustments
    - `type`: `"pct"` (percentage) or `"abs"` (absolute)
    - `value`: Adjustment value

### View Configuration
- **selected_identifiers**: Array of identifier groups for aggregation
- **identifier_order**: Order of identifiers in hierarchy
- **aggregation_type**: Type of aggregation (sum, mean, etc.)

---

## Data Flow

### 1. Initialization
```
User selects dataset → Frontend calls GET /init-cache → Backend caches dataset
→ Frontend calls GET /identifiers, /features, /combinations → Backend returns metadata
→ Frontend stores in Zustand store
```

### 2. Reference Calculation
```
User configures date range → Frontend calls POST /reference → Backend calculates reference values
→ Backend saves to MongoDB → Frontend displays reference values
→ User can adjust scenario tweaks
```

### 3. Scenario Execution
```
User clicks Run → Frontend calls POST /run → Backend:
  1. Loads cached dataset
  2. Calculates reference values per combination
  3. Applies cluster-specific tweaks
  4. Transforms features
  5. Calculates predictions (baseline, scenario, delta, % uplift)
  6. Aggregates results by views
  7. Saves to MongoDB
→ Returns aggregated results → Frontend displays charts/tables
```

### 4. Result Display
```
Backend returns view_results → Frontend renders:
  - Flat view: All combinations in single table
  - Hierarchy view: Aggregated by identifier hierarchy
  - Individuals view: Per-combination breakdown
```

---

## Storage & Caching

### Redis Cache
- **Dataset Cache**: `d0:{d0_key}` - Full dataset (6 hour TTL)
- **Cluster Slices**: `d0:{d0_key}:cluster:{hash}` - Per-combination data
- **Model Metadata**: `models:selected` - Flattened model metadata
- **Cache Metadata**: `cache_metadata:{d0_key}` - Cache freshness info

### MongoDB Collections
- **scenario_reference_points**: Saved reference values
- **scenario_configurations**: Saved scenario configurations
- **scenario_results**: Scenario execution results
- **select_configs**: Model metadata
- **saved_predictions**: Individual prediction records

### MinIO Storage
- **CSV Results**: `scenario-outputs-promo/{run_id}_results_flat.csv`
- **Cache Snapshots**: `cache/{d0_key}/missing_cluster_{hash}.parquet`

---

## Usage Examples

### Example 1: Basic Scenario
**Goal**: Increase price by 10% and marketing by 20%

**Configuration:**
```json
{
  "clusters": [{
    "combination_id": "combo1",
    "scenario_defs": {
      "Price": {"type": "pct", "value": 10},
      "Marketing": {"type": "pct", "value": 20}
    }
  }]
}
```

### Example 2: Mixed Adjustments
**Goal**: Set absolute price and percentage marketing

**Configuration:**
```json
{
  "clusters": [{
    "combination_id": "combo1",
    "scenario_defs": {
      "Price": {"type": "abs", "value": 150},
      "Marketing": {"type": "pct", "value": 25}
    }
  }]
}
```

### Example 3: Multiple Combinations
**Goal**: Different scenarios for different combinations

**Configuration:**
```json
{
  "clusters": [
    {
      "combination_id": "combo1",
      "scenario_defs": {"Price": {"type": "pct", "value": 10}}
    },
    {
      "combination_id": "combo2",
      "scenario_defs": {"Price": {"type": "pct", "value": 5}}
    }
  ]
}
```

---

## Error Handling

### Common Errors

#### 404 - No Dataset Cached
```json
{
  "detail": "No dataset cached. Please call GET /init-cache first."
}
```
**Solution**: Call `/init-cache` before running scenarios.

#### 400 - No Models Found
```json
{
  "detail": "No selected models found. Please ensure models are configured."
}
```
**Solution**: Verify model_id is correct and models exist in MongoDB.

#### 500 - Cache Error
```json
{
  "detail": "Failed to load dataset: File not found"
}
```
**Solution**: Check d0_key path and file exists in MinIO.

---

## Performance Considerations

### Caching Strategy
- **Smart Cache**: Only refreshes when data changes or cache expires (>6 hours)
- **Cluster Pre-caching**: Pre-caches cluster slices for faster access
- **Model Metadata**: Cached in Redis to avoid repeated MongoDB queries

### Optimization Tips
1. **Reuse Cache**: Don't clear cache unnecessarily
2. **Batch Operations**: Calculate reference for all combinations at once
3. **View Selection**: Only create views you need
4. **Date Range**: Use appropriate date ranges to reduce computation

---

## Integration with Laboratory Mode

The Scenario Planner integrates with Trinity Laboratory Mode:

1. **Atom Creation**: User drags Scenario Planner atom onto canvas
2. **Dataset Selection**: User selects dataset in Input Files tab
3. **Cache Initialization**: Automatic cache initialization on file selection
4. **Configuration**: User configures scenarios in Settings tab
5. **Execution**: User runs scenarios in Canvas tab
6. **Results**: Results displayed with charts and tables
7. **Persistence**: Reference points and configurations auto-saved to MongoDB

---

## Testing Checklist

- [ ] Initialize cache with valid dataset
- [ ] Load identifiers, features, combinations
- [ ] Calculate reference values
- [ ] Create scenario with percentage adjustments
- [ ] Create scenario with absolute adjustments
- [ ] Run scenario for single combination
- [ ] Run scenario for multiple combinations
- [ ] Create and test different views
- [ ] Verify MongoDB persistence
- [ ] Test cache refresh functionality
- [ ] Test error handling (missing dataset, invalid model_id)

---

## Troubleshooting

### Issue: Reference values not loading
**Solution**: 
- Check date range is valid
- Verify dataset is cached
- Check model_id format

### Issue: Scenario results incorrect
**Solution**:
- Verify scenario_defs format (type: "pct" or "abs")
- Check feature names match model features
- Verify combination_id matches available combinations

### Issue: Cache not refreshing
**Solution**:
- Use `force_refresh=true` parameter
- Clear cache manually with DELETE endpoint
- Check cache metadata in Redis

---

**Last Updated**: 2024-01-01  
**Version**: 1.0.0

