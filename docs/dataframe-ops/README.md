# DataFrame Operations Atom Documentation

## Overview

The DataFrame Operations Atom is a comprehensive data manipulation tool that provides Excel-like functionality for working with tabular data within the Trinity platform. It allows users to load, view, edit, filter, sort, and transform dataframes through an intuitive web interface.

## Atom Overview

### Purpose
The DataFrame Operations Atom enables users to:
- Load CSV files and existing dataframes from the platform
- Perform real-time data editing and manipulation
- Apply filters, sorting, and transformations
- Save processed data back to the platform
- Visualize data through charts and tables

### Key Features
- **Data Loading**: Support for CSV uploads and loading from saved dataframes
- **Real-time Editing**: In-place cell and column editing
- **Data Manipulation**: Row/column insertion, deletion, duplication
- **Filtering & Sorting**: Advanced filtering with range and categorical options
- **Data Persistence**: Save processed dataframes to MinIO storage
- **Responsive UI**: Excel-like interface with resizable columns and rows
- **Context Menus**: Right-click operations for rows and columns
- **Pagination**: Efficient handling of large datasets

## Architecture

### Backend Components
- **FastAPI Application**: Main API server (`app/main.py`)
- **Routes Module**: API endpoint definitions (`app/routes.py`)
- **Data Processing**: Polars-based dataframe operations
- **Storage Integration**: MinIO for data persistence
- **Session Management**: In-memory dataframe sessions

### Frontend Components
- **Main Atom**: `DataFrameOperationsAtom.tsx` - Core component
- **Canvas**: `DataFrameOperationsCanvas.tsx` - Main data display and editing interface
- **Properties**: `DataFrameOperationsProperties.tsx` - Settings and configuration
- **Inputs**: `DataFrameOperationsInputs.tsx` - File selection interface
- **API Service**: `dataframeOperationsApi.ts` - Backend communication layer

### Data Flow
```
User Input → Frontend Components → API Service → Backend Routes → Polars Processing → MinIO Storage
     ↑                                                                                    ↓
UI Updates ← State Management ← Response Processing ← JSON Response ← Data Serialization
```

## Workflow

### 1. Data Loading
1. **User Action**: User selects a saved dataframe from the **Inputs tab** dropdown
2. **Frontend Element**: `DataFrameOperationsInputs.tsx` - File selection dropdown
3. **API Call**: `GET ${VALIDATE_API}/list_saved_dataframes` - Fetches available dataframes
4. **Trigger**: `useEffect` hook in `DataFrameOperationsInputs.tsx` (component mount)
5. **User Action**: User selects a specific dataframe from the dropdown
6. **Frontend Element**: `DataFrameOperationsInputs.tsx` - File selection dropdown
7. **Trigger**: `handleFileChange()` function called when dropdown selection changes
8. **API Call**: `POST /load_cached` - Loads existing dataframe from MinIO
9. **Trigger**: `loadDataframeByKey()` function called from `handleFileChange()`
10. **Backend Process**: Fetches data from MinIO and creates a session
11. **API Call**: `GET /preview` - Gets dataframe preview for display
12. **Trigger**: Called from `loadDataframeByKey()` function
13. **Frontend Element**: `DataFrameOperationsCanvas.tsx` - Data table rendering
14. **Result**: Data is displayed in the main canvas interface

### 2. Data Editing
1. **User Action**: User double-clicks on a cell in the data table
2. **Frontend Element**: `DataFrameOperationsCanvas.tsx` - Cell editing mode activation
3. **Trigger**: Cell double-click event handler
4. **User Action**: User makes changes and commits (Enter key or blur)
5. **Frontend Element**: `DataFrameOperationsCanvas.tsx` - Cell input field
6. **Trigger**: `handleCellEdit()` function called on Enter key or blur event
7. **API Call**: `POST /edit_cell` - Saves cell value changes
8. **Trigger**: Called from `handleCellEdit()` function
9. **Backend Process**: Processes the change using Polars
10. **Frontend Element**: `DataFrameOperationsCanvas.tsx` - Table cell update
11. **Result**: Updated data is returned and displayed

### 3. Data Manipulation
1. **User Action**: User right-clicks on rows/columns for context menu
2. **Frontend Element**: `DataFrameOperationsCanvas.tsx` - Context menu system
3. **Trigger**: Right-click event handler shows context menu
4. **User Action**: User selects operation (insert, delete, duplicate, etc.)
5. **Frontend Element**: `DataFrameOperationsCanvas.tsx` - Context menu options
6. **Trigger**: Context menu option handlers called when options are selected
7. **API Calls**:
   - **Row Operations**:
     - `POST /insert_row` - `handleInsertRow()` function
     - `POST /delete_row` - `handleDeleteRow()` function
     - `POST /duplicate_row` - `handleDuplicateRow()` function
   - **Column Operations**:
     - `POST /insert_column` - `handleInsertColumn()` function
     - `POST /delete_column` - `handleDeleteColumn()` function
     - `POST /duplicate_column` - `handleDuplicateColumn()` function
     - `POST /rename_column` - `handleRenameColumn()` function
     - `POST /move_column` - `handleMoveColumn()` function
     - `POST /retype_column` - `handleRetypeColumn()` function
8. **Backend Process**: Performs the operation using Polars
9. **Frontend Element**: `DataFrameOperationsCanvas.tsx` - Table structure update
10. **Result**: UI updates to reflect changes

### 4. Data Operations
1. **User Action**: User applies filters or sorting
2. **Frontend Element**: `DataFrameOperationsCanvas.tsx` - Filter/sort controls
3. **API Calls**:
   - `POST /filter_rows` - `handleFilter()` function
   - `POST /sort` - `handleSort()` function
4. **Backend Process**: Processes the operation using Polars
5. **Frontend Element**: `DataFrameOperationsCanvas.tsx` - Table data update
6. **Result**: Filtered/sorted data is returned and displayed

### 5. Data Persistence
1. **User Action**: User clicks "Save DataFrame" button
2. **Frontend Element**: `DataFrameOperationsCanvas.tsx` - Save button (`handleSaveDataFrame()`)
3. **Frontend Process**: Converts current data to CSV format using `toCSV()` function
4. **API Call**: `POST /save` - Saves data to MinIO in Arrow format
5. **Backend Process**: Processes CSV data and saves as Arrow file
6. **Frontend Element**: `DataFrameOperationsCanvas.tsx` - Success notification
7. **Result**: Success notification is displayed to user

## Key API Endpoints

### Data Loading
- `POST /load` - Upload CSV file and create new dataframe session
- `POST /load_cached` - Load existing dataframe from MinIO storage
- `GET /cached_dataframe` - Get CSV representation of cached dataframe

### Data Manipulation
- `POST /edit_cell` - Edit specific cell value
- `POST /insert_row` - Insert new row at specified position
- `POST /delete_row` - Delete row at specified index
- `POST /duplicate_row` - Duplicate row at specified index
- `POST /insert_column` - Insert new column at specified position
- `POST /delete_column` - Delete column by name
- `POST /duplicate_column` - Duplicate column with new name
- `POST /rename_column` - Rename column
- `POST /move_column` - Move column to new position
- `POST /retype_column` - Change column data type

### Data Operations
- `POST /sort` - Sort dataframe by column
- `POST /filter_rows` - Filter rows based on column values
- `POST /ai/execute_operations` - Execute multiple operations in sequence

### Data Persistence
- `POST /save` - Save current dataframe to MinIO storage

### Utility
- `GET /preview` - Get dataframe preview (first N rows)
- `GET /info` - Get dataframe metadata
- `GET /test_alive` - Health check endpoint

## Frontend Components

### Main Components
- **DataFrameOperationsAtom**: Main container managing state and data flow
- **DataFrameOperationsCanvas**: Excel-like interface with editing capabilities
- **DataFrameOperationsProperties**: Tabbed interface (Inputs, Charts, Exhibition)
- **DataFrameOperationsInputs**: File selection and data loading
- **DataFrameOperationsCharts**: Data visualization configuration
- **DataFrameOperationsExhibition**: Data display and export options

## API Integration

### Configuration
API endpoints configured in `src/lib/api.ts` with environment variable support.

### Service Functions
- Data loading: `loadDataframe`, `loadDataframeByKey`
- Data manipulation: `editCell`, `insertRow`, `deleteRow`, `insertColumn`, `deleteColumn`
- Data operations: `sortDataframe`, `filterRows`
- Data persistence: `saveDataframe`

### Error Handling
- Network error detection and HTTP status validation
- User-friendly error messages via toast notifications
- JSON parsing error handling

### State Management
- Laboratory store for settings persistence
- Data synchronization between components
- Undo/redo functionality through original data backup

## Configuration

### Environment Variables
- `VITE_DATAFRAME_OPERATIONS_API`: Custom API endpoint URL
- `VITE_HOST_IP`: Backend host IP address
- `VITE_FASTAPI_PORT`: FastAPI server port

### Backend Configuration
- **MinIO**: Object storage for dataframes
- **Polars**: Data processing engine
- **Session Storage**: In-memory dataframe sessions

## Usage Examples

### Basic Workflow
1. **Input Tab**: Select dataframe → Load data → Review in canvas
2. **Data Editing**: Double-click cells → Make changes → Auto-save
3. **Data Manipulation**: Right-click rows/columns → Select operation
4. **Data Operations**: Apply filters/sorting → View results
5. **Save Data**: Click save button → Confirm success

## Prerequisites

### Required Data
- **Saved Dataframes**: Data must be uploaded and saved as `.arrow` files in MinIO
- **CSV Files**: Can be uploaded directly for immediate editing

### System Requirements
- Modern web browser with ES6+ support
- Network access to FastAPI backend
- MinIO object storage access

## Getting Started

### Step 1: Access the DataFrame Operations Atom
1. Open the Trinity platform
2. Navigate to the Laboratory section
3. Click on "DataFrame Operations" atom from the atom list
4. The atom will open with three tabs: Inputs, Charts, Exhibition

### Step 2: Load Your Data
1. Go to the **Inputs** tab
2. Select a saved dataframe from the dropdown
3. Data will automatically load in the main canvas interface

### Step 3: Edit Your Data
1. Double-click on any cell to enter edit mode
2. Make your changes and press Enter
3. Use right-click context menus for row/column operations
4. Apply filters and sorting as needed

### Step 4: Save Your Changes
1. Click the "Save DataFrame" button
2. Your changes will be saved to MinIO storage
3. A success notification will confirm the save

## User Interface Guide

### Inputs Tab
- **Dataframe Selection**: Dropdown to choose from saved dataframes
- **File Upload**: Drag-and-drop CSV file upload
- **Data Preview**: Quick preview of selected data

### Main Canvas
- **Data Table**: Interactive table with Excel-like functionality
- **Context Menus**: Right-click on rows/columns for operations
- **Inline Editing**: Double-click cells to edit values
- **Column Management**: Resize, reorder, and manage columns
- **Row Management**: Insert, delete, and duplicate rows

### Charts Tab
- **Visualization Options**: Configure chart types and settings
- **Data Selection**: Choose columns for visualization
- **Chart Preview**: Preview charts before applying

### Exhibition Tab
- **Data Display**: View processed data
- **Export Options**: Export data in various formats
- **Summary Statistics**: View data statistics

## Technical Notes

### Performance
- Pagination for large datasets (15 rows per page by default)
- Debounced API calls to prevent excessive requests
- Optimized Polars operations for data processing
- In-memory session management for fast access

### Data Types
- **Text**: String data (Polars Utf8)
- **Number**: Numeric data (Polars Float64, Int64)
- **Date**: Date/time data (Polars Date, Datetime)

