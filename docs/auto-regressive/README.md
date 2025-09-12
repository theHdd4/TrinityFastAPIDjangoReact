# Auto Regressive Models Atom Documentation

## Overview

The Auto Regressive Models Atom is a comprehensive time series forecasting tool within the Trinity platform that enables users to build, train, and evaluate multiple autoregressive models for predictive analytics. It provides advanced capabilities for time series analysis, model training, forecasting, and growth rate calculations with support for various statistical models and performance optimization.


## Atom Overview

### Purpose
The Auto Regressive Models Atom enables users to:
- Load time series data from saved dataframes
- Train multiple autoregressive models (ARIMA, SARIMA, Holt-Winters, ETS, Prophet)
- Generate forecasts and predictions
- Calculate growth rates (fiscal, quarterly, half-yearly)
- Compare model performance and accuracy
- Save and manage trained models
- Visualize forecasting results with interactive charts

### Key Features
- **Multiple Model Support**: ARIMA, SARIMA, Holt-Winters, ETS, Prophet models
- **Time Series Analysis**: Automatic frequency detection and date column handling
- **Model Training**: Concurrent training of multiple models with progress tracking
- **Forecasting**: Generate predictions with configurable forecast horizons
- **Growth Rate Calculations**: Fiscal, quarterly, and half-yearly growth rate analysis
- **Performance Optimization**: CPU-optimized processing with concurrent execution
- **Interactive Visualization**: Real-time charts and model comparison with advanced interactions
- **Chart Filtering**: Click on legends to filter data in both line and bar charts
- **Context Menus**: Right-click on bar charts for additional options and actions
- **Expandable Charts**: All charts can be expanded for detailed viewing
- **Model Persistence**: Save and load trained models
- **Progress Tracking**: Real-time training progress with detailed status updates
- **Error Handling**: Comprehensive error handling and retry mechanisms

## Architecture

### Backend Components
- **FastAPI Application**: Main API server (`app/main.py`)
- **Routes Module**: API endpoint definitions (`app/routes.py`)
- **Database Module**: MongoDB operations (`app/database.py`)
- **Schema Module**: Data validation and structure (`app/schemas.py`)
- **Autoregressive Module**: Core forecasting algorithms (`app/autoregressive/`)
- **MongoDB Integration**: Model storage and retrieval
- **MinIO Integration**: Data storage and file management

### Frontend Components
- **Main Atom**: `AutoRegressiveModelsAtom.tsx` - Core component
- **Canvas**: `AutoRegressiveModelsCanvas.tsx` - Main interface and visualization
- **Properties**: `AutoRegressiveModelsProperties.tsx` - Settings and configuration panel
- **Settings**: `AutoRegressiveModelsSettings.tsx` - Model configuration
- **Exhibition**: `AutoRegressiveModelsExhibition.tsx` - Results display and export

### Data Flow
```
User Input → Frontend Components → API Service → Backend Routes → Model Training → MongoDB/MinIO Storage
     ↑                                                                                    ↓
UI Updates ← State Management ← Response Processing ← Forecast Generation ← Data Processing
```

## Workflow

### 1. Data Loading and Scope Selection
1. **User Action**: User selects a saved dataframe from the **Settings tab** dropdown
2. **Frontend Element**: `AutoRegressiveModelsSettings.tsx` - File selection dropdown
3. **API Call**: `GET ${VALIDATE_API}/list_saved_dataframes` - Fetches available dataframes
4. **Trigger**: `useEffect` hook in `AutoRegressiveModelsSettings.tsx` (component mount)
5. **Frontend Process**: Extracts scope numbers from filenames (e.g., `Scope_1_Combination_Date.arrow`)
6. **User Action**: User selects a scope from available scope options
7. **Frontend Element**: `AutoRegressiveModelsSettings.tsx` - Scope selection dropdown
8. **Trigger**: Scope dropdown change handler
9. **Frontend Process**: Filters files by selected scope and extracts combinations using regex pattern matching
10. **API Call**: No additional API call - combinations are derived from filename patterns
11. **Result**: Available combinations are displayed for selection

### 2. Model Configuration
1. **User Action**: User selects combinations and models for training
2. **Frontend Element**: `AutoRegressiveModelsSettings.tsx` - Combination and model selection
3. **User Action**: User configures target variable, time variable, and exogenous variables
4. **Frontend Element**: `AutoRegressiveModelsSettings.tsx` - Variable selection dropdowns
5. **User Action**: User sets forecast horizon, validation split, and frequency
6. **Frontend Element**: `AutoRegressiveModelsSettings.tsx` - Configuration inputs
7. **Result**: Model training configuration is prepared

### 3. Column Detection and Frequency Analysis
1. **User Action**: User clicks "Run the Models" button
2. **Frontend Element**: `AutoRegressiveModelsCanvas.tsx` - "Run the Models" button
3. **Trigger**: `handleTrainModels()` function called when button is clicked
4. **API Call**: `POST /get_columns` - Fetches available columns for selected scope/combination
5. **Trigger**: Called from `handleTrainModels()` function
6. **API Call**: `POST /detect_frequency` - Detects time series frequency
7. **Trigger**: `detectFrequency()` function called from `handleTrainModels()`
8. **User Action**: User selects fiscal year month from dropdown (January-December)
9. **Frontend Element**: `AutoRegressiveModelsCanvas.tsx` - Fiscal year month selection dropdown
10. **Trigger**: Dropdown change handler
11. **Frontend Process**: Maps selected month to numeric value (1-12) for backend processing
12. **Result**: Time series configuration is validated and prepared

### 4. Model Training
1. **User Action**: User clicks "Run the Models" button
2. **Frontend Element**: `AutoRegressiveModelsCanvas.tsx` - "Run the Models" button
3. **Trigger**: `handleTrainModels()` function called when button is clicked
4. **API Call**: `POST /validate-request` - Validates training parameters (prevents 504 timeouts)
5. **Trigger**: Called from `handleTrainModels()` function
6. **API Call**: `POST /train-autoregressive-models-direct` - Initiates model training (main training endpoint)
7. **Trigger**: Called from `handleTrainModels()` function
8. **Backend Process**: Concurrent training of multiple models with progress tracking
9. **Result**: Training is initiated with run_id for progress tracking

### 5. Progress Tracking
1. **Frontend Process**: Polls training progress using run_id
2. **API Call**: `GET /training-progress/{run_id}` - Gets detailed training progress
3. **Trigger**: `pollProgress()` function called repeatedly during training
4. **API Call**: `GET /training-progress-simple/{run_id}` - Gets minimal progress for fast polling
5. **Trigger**: Called from `pollProgress()` function for faster updates
6. **Frontend Element**: `AutoRegressiveModelsCanvas.tsx` - Progress display logic
7. **Result**: Real-time progress updates are displayed to user

**Note**: During model training, the Network tab shows these primary API calls:
- `POST /validate-request` - Parameter validation (prevents timeouts)
- `POST /train-autoregressive-models-direct` - Main training endpoint
- `GET /training-progress/{run_id}` - Progress polling (repeated calls)

### 6. Results Retrieval and Visualization
1. **Frontend Process**: Detects training completion
2. **API Call**: `GET /training-results/{run_id}` - Gets final training results
3. **Trigger**: Called when training is complete
4. **Frontend Element**: `AutoRegressiveModelsCanvas.tsx` - Results processing
5. **Frontend Process**: Renders interactive charts and model comparisons
6. **Frontend Element**: `AutoRegressiveModelsCanvas.tsx` - Chart rendering with Recharts
7. **Result**: Model results are displayed with interactive visualizations

### 7. Growth Rate Calculations
1. **User Action**: User clicks growth rate calculation buttons (fiscal, quarterly, half-yearly)
2. **Frontend Element**: `AutoRegressiveModelsCanvas.tsx` - Growth rate calculation buttons
3. **Trigger**: Growth rate button click handlers
4. **API Calls**:
   - `POST /calculate-fiscal-growth` - Fiscal growth calculation
   - `POST /calculate-quarterly-growth` - Quarterly growth calculation
   - `POST /calculate-halfyearly-growth` - Half-yearly growth calculation
5. **Trigger**: Called from respective growth rate calculation functions
6. **Frontend Element**: `AutoRegressiveModelsCanvas.tsx` - Growth rate calculation functions
7. **Result**: Growth rates are calculated and displayed

### 8. Model Persistence
1. **User Action**: User clicks "Save Result" button for specific combinations
2. **Frontend Element**: `AutoRegressiveModelsCanvas.tsx` - "Save Result" button
3. **Trigger**: `handleSaveSingleCombination()` function called when button is clicked
4. **API Call**: `POST /models/save-single-combination` - Saves individual combination result
5. **Trigger**: Called from `handleSaveSingleCombination()` function
6. **API Call**: `GET /models/saved-combinations-status` - Gets updated save status
7. **Trigger**: Called from `handleSaveSingleCombination()` function
8. **Frontend Element**: `AutoRegressiveModelsCanvas.tsx` - Status checking
9. **Result**: Models are saved to MongoDB and status is tracked

**Note**: When clicking "Save Result", the Network tab shows these API calls:
- `POST /models/save-single-combination` - Saves the specific combination result
- `GET /models/saved-combinations-status` - Updates the save status display

## Key API Endpoints

### Model Training (Primary Network Tab APIs)
- `POST /train-autoregressive-models-direct` - Train autoregressive models (main endpoint in network tab)
- `POST /validate-request` - Validate training parameters (appears in network tab)
- `GET /training-progress/{run_id}` - Get detailed training progress (repeated polling in network tab)

### Model Persistence (Save Result Network Tab APIs)
- `POST /models/save-single-combination` - Save individual combination result (appears in network tab)
- `GET /models/saved-combinations-status` - Get save status (appears in network tab)

### Additional Training Endpoints
- `GET /training-progress-simple/{run_id}` - Get minimal training progress
- `GET /training-results/{run_id}` - Get final training results
- `GET /training-status/{run_id}` - Get training status
- `GET /active-runs` - List active training runs

### Data Management
- `GET /get_saved_dataframes` - Get list of saved dataframes (used to derive scope and combinations from filenames)
- `POST /get_columns` - Get columns for scope/combination
- `GET /get_columns` - Get columns (GET version)
- `POST /detect_frequency` - Detect time series frequency
- `POST /get_date_columns` - Get available date columns
- `GET /get_file_path` - Get file path for scope/combination

**Note**: Scope and combinations are derived from filename patterns (e.g., `Scope_1_Combination_Date.arrow`) rather than separate API calls.

### Growth Rate Calculations
- `POST /calculate-fiscal-growth` - Calculate fiscal growth rates
- `POST /calculate-quarterly-growth` - Calculate quarterly growth rates
- `POST /calculate-halfyearly-growth` - Calculate half-yearly growth rates

### Model Persistence
- `POST /models/save-single-combination` - Save single combination
- `POST /models/save-all-combinations` - Save all combinations
- `GET /models/saved-combinations-status` - Get saved combinations status

### Utility
- `GET /test` - Health check endpoint
- `GET /performance-stats` - Get performance statistics
- `GET /training-progress-detailed/{run_id}` - Get detailed progress

## Frontend Components

### Main Components
- **AutoRegressiveModelsAtom**: Main container managing state and data flow
- **AutoRegressiveModelsCanvas**: Main interface with training, visualization, and model management
- **AutoRegressiveModelsProperties**: Tabbed interface (Settings, Exhibition)
- **AutoRegressiveModelsSettings**: Model configuration and data selection
- **AutoRegressiveModelsExhibition**: Results display and export options

## API Integration

### Configuration
API endpoints configured in `src/lib/api.ts` with environment variable support.

### Service Functions
- Model training: `trainAutoregressiveModels()`, `validateRequest()`
- Progress tracking: `getTrainingProgress()`, `getTrainingResults()`
- Growth calculations: `calculateFiscalGrowth()`, `calculateQuarterlyGrowth()`, `calculateHalfYearlyGrowth()`
- Data management: `getColumns()`, `detectFrequency()`, `getDateColumns()`

### Error Handling
- Network error detection and HTTP status validation
- User-friendly error messages via toast notifications
- Retry mechanisms for failed requests
- Timeout handling for long-running operations

### State Management
- Laboratory store for settings persistence
- Real-time progress tracking
- Model results caching
- Training status management

## Configuration

### Environment Variables
- `VITE_AUTO_REGRESSIVE_API`: Custom API endpoint URL
- `VITE_HOST_IP`: Backend host IP address
- `VITE_FASTAPI_PORT`: FastAPI server port

### Backend Configuration
- **MongoDB**: Model storage and results persistence
- **MinIO**: Data file storage and retrieval
- **Performance**: CPU-optimized concurrent processing

### Model Configuration
- **Supported Models**: ARIMA, SARIMA, Holt-Winters, ETS, Prophet
- **Default Parameters**: Pre-configured model parameters
- **Customization**: User-configurable model parameters

## Usage Examples

### Basic Workflow
1. **Settings Tab**: Select dataframe → Choose scope → Select combinations → Configure models
2. **Canvas**: Click "Train Models" → Monitor progress → View results → Calculate growth rates
3. **Exhibition Tab**: Export results → Share analysis → View model summary

## Prerequisites

### Required Data
- **Saved Dataframes**: Time series data must be uploaded and saved as `.arrow` files in MinIO
- **Scope Files**: Data should be organized by scope (e.g., `Scope_1_Combination_Date.arrow`)
- **Time Series Format**: Data must have proper time/date columns and target variables

### System Requirements
- Modern web browser with ES6+ support
- Network access to FastAPI backend
- MongoDB database connection
- MinIO object storage access

## Getting Started

### Step 1: Access the Auto Regressive Models Atom
1. Open the Trinity platform
2. Navigate to the Laboratory section
3. Click on "Auto Regressive Models" atom from the atom list
4. The atom will open with two tabs: Settings and Exhibition

### Step 2: Configure Your Data
1. Go to the **Settings** tab
2. Select a saved dataframe from the dropdown
3. Choose a scope from available options
4. Select combinations for training
5. Configure target variable, time variable, and model parameters

### Step 3: Train Models
1. Go to the **Canvas** area
2. Click "Train Models" button
3. Monitor training progress in real-time
4. View results and model comparisons

### Step 4: Analyze Results
1. Review model performance metrics
2. Calculate growth rates as needed
3. Save models for future use
4. Export results from the Exhibition tab

## User Interface Guide

### Settings Tab
- **Dataframe Selection**: Choose from saved time series data
- **Scope Selection**: Select data scope for analysis
- **Combination Selection**: Choose specific combinations to train
- **Model Configuration**: Select models and configure parameters
- **Variable Selection**: Choose target, time, and exogenous variables

### Canvas Area
- **Training Controls**: Start/stop model training
- **Progress Tracking**: Real-time training progress with detailed status
- **Model Results**: Interactive charts and performance metrics
- **Chart Interactions**: 
  - Click legends to filter data in line and bar charts
  - Right-click bar charts for context menu options
  - Expand all charts for detailed viewing
- **Growth Rate Calculations**: Fiscal, quarterly, and half-yearly analysis
- **Model Management**: Save individual or all combinations
- **Fiscal Year Month Selection**: Dropdown to select fiscal year start month (January-December)
- **Forecast Horizon**: Input field for setting prediction period
- **Frequency Selection**: Dropdown for time series frequency (monthly, quarterly, yearly, custom)

### Exhibition Tab
- **Export Options**: Export model results and analysis
- **Model Summary**: Overview of selected models and configuration
- **Performance Metrics**: Model accuracy and performance statistics

## Technical Notes

### Performance
- **Concurrent Processing**: Up to 19 combinations processed simultaneously
- **CPU Optimization**: Uses all available CPU cores
- **Memory Management**: Optimized for large datasets
- **Caching**: Result caching for improved performance

### Model Support
- **ARIMA**: AutoRegressive Integrated Moving Average
- **SARIMA**: Seasonal ARIMA with seasonal components
- **Holt-Winters**: Exponential smoothing with trend and seasonality
- **ETS**: Error, Trend, Seasonal exponential smoothing
- **Prophet**: Facebook's forecasting tool with holiday support

### Data Processing
- **Frequency Detection**: Automatic time series frequency detection
- **Date Handling**: Multiple date column format support
- **Fiscal Year Mapping**: Maps fiscal year month selection (January-December) to numeric values (1-12)
- **Validation**: Comprehensive parameter validation
- **Error Handling**: Robust error handling and retry mechanisms

## Troubleshooting

### Common Issues
- **Training Timeout**: Check data size and model complexity
- **Memory Issues**: Reduce number of combinations or models
- **Data Format**: Ensure proper time series format with date columns
- **API Errors**: Check backend service status and logs
- **Progress Not Updating**: Verify run_id and polling mechanism

### Performance Optimization
- Use smaller datasets for initial testing
- Reduce number of concurrent combinations
- Enable caching for repeated operations
- Monitor system resources during training
