# Explore Atom Documentation

## Overview

The Explore Atom is a comprehensive data exploration and visualization tool within the Trinity platform that enables users to analyze data through interactive charts, multi-dimensional grouping, and advanced filtering capabilities. It provides a powerful interface for exploring business data with support for various chart types, aggregations, and real-time data processing.

## Atom Overview

### Purpose
The Explore Atom enables users to:
- Load and analyze data from saved dataframes
- Create interactive visualizations (bar charts, line charts, pie charts etc.)
- Apply multi-dimensional grouping and filtering
- Perform various aggregations (sum, average, count, weighted average)
- Explore data through different chart types and perspectives
- Save and manage exploration configurations

### Key Features
- **File Upload & Column Classifier Integration**: Automatic detection of column classifier configurations for uploaded files
- **Cardinality View**: Toggle-able dataframe summary showing column statistics and data types
- **Multiple Chart Areas**: Create unlimited chart areas with independent configurations
- **Dual Y-Axis Support**: Up to 2 Y-axes per chart for comparing different metrics
- **5 Chart Types**: Bar, line, pie, area, and scatter charts with long-press selection
- **Interactive Chart Management**: Right-click context menus for chart customization
- **Real-time Updates**: Charts update automatically as configuration changes
- **Segregate Field Filtering**: Dropdown filtering by categorical values
- **Flexible Layout**: 1 or 2 charts per row configuration
- **Advanced Filtering**: Multi-dimensional filtering with categorical and value-based options
- **Data Persistence**: Save exploration configurations and results
- **Redis Caching**: High-performance data caching for improved performance

## Architecture

### Backend Components
- **FastAPI Application**: Main API server (`app/main.py`)
- **Routes Module**: API endpoint definitions (`app/routes.py`)
- **Database Module**: MongoDB operations (`app/database.py`)
- **Schema Module**: Data validation and structure (`app/schemas.py`)
- **Redis Integration**: Caching layer for performance optimization
- **MinIO Integration**: Data storage and retrieval

### Frontend Components
- **Main Atom**: `ExploreAtom.tsx` - Core component
- **Canvas**: `ExploreCanvas.tsx` - Main visualization interface
- **Properties**: `ExploreProperties.tsx` - Settings and configuration panel
- **Input**: `ExploreInput.tsx` - Data source selection
- **Settings**: `ExploreSettings.tsx` - Chart configuration
- **Exhibition**: `ExploreExhibition.tsx` - Results display

### Data Flow
```
User Input → Frontend Components → API Service → Backend Routes → Data Processing → MongoDB/Redis Storage
     ↑                                                                                    ↓
UI Updates ← State Management ← Response Processing ← Chart Generation ← Data Aggregation
```

## Workflow

### 1. File Upload and Column Classifier Detection
1. **User Action**: User selects a saved dataframe from the **Input tab** dropdown
2. **Frontend Element**: `ExploreInput.tsx` - File selection dropdown
3. **API Call**: `GET ${VALIDATE_API}/list_saved_dataframes` - Fetches available dataframes
4. **Trigger**: `useEffect` hook in `ExploreInput.tsx` (component mount)
5. **User Action**: User selects a specific dataframe from the dropdown
6. **Frontend Element**: `ExploreInput.tsx` - `handleFrameChange()` function
7. **API Call**: `GET /column_summary` - Loads column statistics and data types
8. **Trigger**: `fetchColumnSummary()` function called from `handleFrameChange()`
9. **API Call**: `GET /column-classifier/config/{client_name}/{app_name}/{project_name}` - Detects column classifier configuration
10. **Trigger**: `fetchColumnClassifierConfig()` function called from `handleFrameChange()`
11. **Backend Process**: Loads dimensions (with identifiers) and measures from the column classifier config
12. **Result**: Column summary and classifier config are displayed in the Input tab

### 2. Cardinality View Toggle
1. **User Action**: User toggles the dataframe summary view (cardinality view) on/off
2. **Frontend Element**: `ExploreCanvas.tsx` - Cardinality view toggle switch
3. **API Call**: `GET /column_summary` - Fetches column statistics for cardinality view
4. **Trigger**: `fetchCardinalityData()` function called when toggle is switched on
5. **Frontend Process**: Shows/hides column statistics, data types, and unique value counts
6. **Result**: Cardinality view displays column summary data in a sortable table

### 3. Chart Layout Configuration
1. **User Action**: User goes to **Settings tab** and chooses graph layout (1 or 2 charts per row)
2. **Frontend Element**: `ExploreSettings.tsx` - Chart layout selection controls
3. **User Action**: User clicks "Explore" button to initialize chart areas
4. **Frontend Element**: `ExploreSettings.tsx` - "Explore" button
5. **Trigger**: `handleApply()` function called when "Explore" button is clicked
6. **Frontend Process**: Creates the specified number of chart areas
7. **Result**: Chart areas are initialized in the Exhibition tab

### 4. Chart Configuration
1. **User Action**: For each chart area, user selects X-axis and Y-axis from available columns
2. **Frontend Element**: `ExploreCanvas.tsx` - Chart configuration dropdowns
3. **User Action**: User can add up to 2 Y-axes per chart using the plus (+) button
4. **Frontend Element**: `ExploreCanvas.tsx` - Y-axis plus button
5. **Trigger**: `addYAxis()` function called when plus (+) button is clicked
6. **User Action**: User uses segregate field dropdown for filtering by categorical values
7. **Frontend Element**: `ExploreCanvas.tsx` - Segregate field dropdown
8. **Result**: Chart configuration is set up for data visualization

### 5. Chart Type Selection
1. **User Action**: User long-presses at the top of any chart area to change chart type
2. **Frontend Element**: `ExploreCanvas.tsx` - Chart header long-press handler
3. **Trigger**: `openChartTypeTray()` function called on long-press
4. **Frontend Process**: Opens chart type selection context menu
5. **User Action**: User selects from 5 chart types: bar, line, pie, area, scatter
6. **Frontend Element**: `ExploreCanvas.tsx` - Chart type selection menu
7. **Trigger**: `handleChartTypeSelect()` function called when chart type is selected
8. **Result**: Chart type changes apply immediately

### 6. Real-time Chart Generation
1. **User Action**: User completes chart configuration (X/Y axes selection)
2. **Frontend Element**: `ExploreCanvas.tsx` - Chart configuration dropdowns
3. **Trigger**: `generateChart()` function called when axes are selected
4. **API Call**: `POST /select-dimensions-and-measures` - Creates explore atom configuration
5. **Trigger**: Called from `generateChart()` function
6. **API Call**: `POST /specify-operations` - Saves chart configuration
7. **Trigger**: Called from `generateChart()` function
8. **API Call**: `GET /chart-data-multidim/{explore_atom_id}` - Generates chart data
9. **Trigger**: Called from `generateChart()` function
10. **Frontend Element**: `ExploreCanvas.tsx` - Chart data processing and rendering
11. **Result**: Charts update automatically and display data visualization

### 7. Multiple Chart Areas
1. **User Action**: User clicks the plus (+) button below any existing chart
2. **Frontend Element**: `ExploreCanvas.tsx` - Plus button
3. **Trigger**: `addChart()` function called when plus (+) button is clicked
4. **Frontend Process**: Creates new chart configuration in `chartConfigs` array
5. **User Action**: User configures the new chart area independently
6. **Frontend Element**: `ExploreCanvas.tsx` - Independent chart configuration system
7. **Result**: New chart area is added with independent configuration

### 8. Context Menu Operations
1. **User Action**: User right-clicks on chart areas for context menu
2. **Frontend Element**: `ExploreCanvas.tsx` - Right-click context menu system
3. **Trigger**: Context menu appears on right-click event
4. **User Action**: User selects chart customization options
5. **Frontend Element**: `ExploreCanvas.tsx` - Context menu handlers
6. **Trigger**: Context menu option handlers called when options are selected
7. **Result**: Chart customization options are applied

### 9. Filtering and Data Management
1. **User Action**: User applies filters using segregate field dropdowns
2. **Frontend Element**: `ExploreCanvas.tsx` - Filter dropdown system
3. **Trigger**: Filter dropdown change handlers called when filter is selected
4. **API Call**: `GET /column_summary` - Fetches unique values for filtering
5. **Trigger**: `fetchUniqueValues()` function called from filter change handlers
6. **User Action**: User selects filter values
7. **Frontend Element**: `ExploreCanvas.tsx` - Filter application logic
8. **Trigger**: Filter value selection handlers called when values are selected
9. **Result**: Charts update with filtered data

## Key API Endpoints

### Data Source Management
- `GET /columns` - Get column names for a saved dataframe
- `GET /column_summary` - Get column statistics and data types
- `GET /date-range` - Get min/max dates for date range filtering

### Column Classifier Integration
- `GET /column-classifier/config/{client_name}/{app_name}/{project_name}` - Get column classifier configuration
- `GET /get-dimensions-and-identifiers/{validator_atom_id}` - Get business dimensions
- `GET /get-measures/{validator_atom_id}` - Get available measures

### Chart Operations
- `POST /specify-operations` - Save chart configuration
- `GET /chart-data-multidim/{explore_atom_id}` - Generate chart data

### Supported Chart Types
- **Bar Chart**: Vertical bar chart with dual Y-axis support
- **Line Chart**: Line chart with time series support
- **Pie Chart**: Pie chart for categorical data
- **Area Chart**: Filled area chart for trends
- **Scatter Chart**: Scatter plot for correlation analysis

### Supported Aggregations
- `sum`, `avg`, `count`, `min`, `max`, `weighted_avg`, `null`

## Frontend Components

### Main Components
- **ExploreAtom**: Main container managing state and data flow
- **ExploreCanvas**: Chart rendering with multiple chart areas, dual Y-axis, context menus
- **ExploreProperties**: Tabbed interface (Input, Settings, Exhibition)
- **ExploreInput**: File selection and column classifier integration
- **ExploreSettings**: Chart layout configuration (1 or 2 charts per row)
- **ExploreExhibition**: Results display and export options

## API Integration

### Configuration
API endpoints configured in `src/lib/api.ts` with environment variable support.

### Service Functions
- Data source functions: `getColumns`, `getColumnSummary`, `getDateRange`
- Configuration functions: `getDimensionsAndIdentifiers`, `getMeasures`
- Chart operations: `specifyOperations`, `getChartData`

### State Management
- Laboratory store for settings persistence
- Data synchronization between components
- Chart configuration management

## Configuration

### Environment Variables
- `VITE_EXPLORE_API`: Custom API endpoint URL
- `VITE_HOST_IP`: Backend host IP address
- `VITE_FASTAPI_PORT`: FastAPI server port

### Backend Configuration
- **MongoDB**: `validator_atoms_db` (source), `Explore_atom` (destination)
- **MinIO**: Object storage for dataframes
- **Redis**: Caching layer for performance

## Usage Examples

### Basic Workflow
1. **Input Tab**: Select dataframe → Column classifier auto-detected → Toggle cardinality view
2. **Settings Tab**: Choose chart layout (1 or 2 per row) → Click "Explore"
3. **Chart Configuration**: Select X-axis and Y-axis → Charts generate automatically
4. **Add More Charts**: Click plus (+) button below any chart
5. **Change Chart Type**: Long-press at top of chart area
6. **Dual Y-Axis**: Click plus (+) button next to Y-axis dropdown
7. **Filtering**: Use segregate field dropdowns for categorical filtering
8. **Context Menu**: Right-click chart areas for customization options

## Cardinality View

Toggle-able dataframe summary showing:
- Column statistics, data types, and unique value counts
- Sorting and filtering capabilities
- Right-click functionality for column operations

## Technical Notes

### Performance
- Redis caching for data retrieval
- Optimized chart rendering with Recharts
- Debounced chart generation
- Independent chart area processing

### Chart Management
- Unlimited chart areas with independent configurations
- Dual Y-axis support (up to 2 per chart)
- Long-press chart type selection
- Right-click context menus
- Plus button for adding new charts

### Data Types
- Numeric (Float64, Int64) for calculations
- Categorical (String) for dimensions
- Date/Time for time series analysis

