# CSV File Upload Implementation for Correlation Atom

## Overview
The correlation atom now supports CSV file upload functionality that replaces the mock data with real data processing. Users can upload CSV files and see actual correlation analysis based on their data.

## Features Implemented

### 1. File Upload Interface
- Drag & drop CSV file upload area
- Real-time processing status with loading indicators
- Error handling with user-friendly messages
- File validation (CSV files only)

### 2. CSV Processing
- Automatic column type detection (numeric, date, categorical)
- Support for Pearson and Spearman correlation methods
- Real-time correlation matrix calculation
- Time series data generation from actual data

### 3. Dynamic Data Switching
- Toggle between uploaded file data and mock data
- Automatic recalculation when correlation method changes
- Visual indicators for data source (File Data vs Mock Data)

### 4. Enhanced Visualizations
- Correlation heatmap uses actual variable names from CSV
- Time series charts plot real data values
- Variable selection dropdowns populate with actual column names

## Usage Instructions

### Step 1: Upload CSV File
1. Go to the Correlation atom settings tab
2. Click "Choose CSV File" in the Data Input section
3. Select a CSV file with at least 2 numeric columns
4. Wait for processing to complete

### Step 2: View Results
- The correlation matrix will automatically update with real correlations
- Variable names will change to match your CSV columns
- Time series chart will show actual data relationships

### Step 3: Customize Analysis
- Change correlation method (Pearson/Spearman) for different analysis types
- Select different variable pairs from the dropdowns
- Switch back to mock data anytime for comparison

## CSV File Requirements

### Minimum Requirements
- Must be a valid CSV file (.csv extension)
- At least 2 numeric columns for correlation analysis
- At least 2 rows of data (header + data)

### Recommended Format
```csv
Date,Sales,Marketing_Spend,Website_Traffic,Customer_Satisfaction
2023-01-01,1000,200,500,4.5
2023-02-01,1200,250,600,4.7
2023-03-01,1100,220,550,4.6
...
```

### Column Types Supported
- **Numeric**: For correlation analysis (integers, decimals)
- **Date**: For time series visualization (various date formats)
- **Categorical**: For filtering and grouping (text values)

## Example Test CSV
Create a file named `sample_data.csv` with this content to test:

```csv
Month,Sales,Marketing,Traffic,Satisfaction,Price,Revenue
Jan,1000,200,500,4.5,10.99,11000
Feb,1200,250,600,4.7,10.99,13200
Mar,1100,220,550,4.6,11.99,13189
Apr,1300,280,650,4.8,11.99,15587
May,1150,230,575,4.4,12.99,14939
Jun,1400,300,700,4.9,12.99,18186
Jul,1250,260,625,4.7,13.99,17488
Aug,1350,290,675,4.8,13.99,18877
Sep,1200,240,600,4.6,14.99,17988
Oct,1450,320,725,5.0,14.99,21731
Nov,1300,270,650,4.7,15.99,20787
Dec,1600,350,800,4.9,15.99,25584
```

This will create correlations between Sales, Marketing, Traffic, Satisfaction, Price, and Revenue.

## Technical Implementation

### Files Modified
1. `laboratoryStore.ts` - Extended CorrelationSettings interface
2. `CorrelationSettings.tsx` - Added file upload UI and processing
3. `CorrelationCanvas.tsx` - Updated to use file data dynamically
4. `csvProcessor.ts` - New utility for CSV processing and correlation calculation

### Key Functions
- `processCSVFile()` - Parses CSV and analyzes column types
- `calculateCorrelationMatrix()` - Computes correlations with different methods
- `generateTimeSeriesData()` - Creates time series from file data
- `analyzeColumns()` - Detects numeric, date, and categorical columns

## Error Handling
- Invalid file formats are rejected with clear messages
- Files without sufficient numeric columns show helpful errors
- Processing errors are displayed with specific problem descriptions
- Failed uploads don't affect existing data

## Future Enhancements
- Support for Excel files (.xlsx, .xls)
- Advanced filtering options for categorical columns
- Export functionality for correlation results
- Batch processing for multiple files
