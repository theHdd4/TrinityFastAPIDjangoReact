# Multiple Charts Implementation for AtomAIChatBot

## Overview

This document describes the implementation of multiple charts functionality in the `AtomAIChatBot` component. The feature allows the AI to generate multiple complementary charts from a single user request, with each chart being processed separately through the FastAPI backend.

## Architecture

### AI Response Format

The AI now sends responses with a `multiple_charts` flag and an array of chart configurations:

```json
{
  "success": true,
  "multiple_charts": true,
  "number_of_charts": 2,
  "charts": [
    {
      "chart_id": "1",
      "title": "Volume by Brand (Bar Chart)",
      "chart_type": "bar",
      "traces": [
        {
          "x_column": "Brand",
          "y_column": "Volume",
          "name": "Volume per Brand",
          "chart_type": "bar",
          "aggregation": "sum",
          "color": "#FFA07A"
        }
      ],
      "x_axis": { "dataKey": "Brand", "label": "Brand", "type": "category" },
      "y_axis": { "dataKey": "Volume", "label": "Volume", "type": "number" }
    },
    {
      "chart_id": "2",
      "title": "Volume Trend Over Time (Line Chart)",
      "chart_type": "line",
      "traces": [
        {
          "x_column": "Year",
          "y_column": "Volume",
          "name": "Volume Trend",
          "chart_type": "line",
          "aggregation": "sum",
          "color": "#458EE2"
        }
      ],
      "x_axis": { "dataKey": "Year", "label": "Year", "type": "category" },
      "y_axis": { "dataKey": "Volume", "label": "Volume", "type": "number" }
    }
  ],
  "file_name": "data_file.arrow",
  "message": "Multiple chart configuration completed successfully"
}
```

### Processing Flow

1. **AI Response Detection**: The component detects `multiple_charts: true` in the AI response
2. **Chart Configuration Creation**: Creates individual chart configurations for each chart in the array
3. **File Loading**: Loads the target data file using the chart-maker backend
4. **Multiple FastAPI Calls**: Makes separate calls to `/charts` endpoint for each chart
5. **Result Aggregation**: Combines all chart results and updates the atom settings
6. **User Feedback**: Provides detailed feedback on success/failure for each chart

## Implementation Details

### Chart Configuration Creation

```typescript
if (isMultipleCharts) {
  charts = data.charts.map((chartConfig: any, index: number) => {
    const chartType = chartConfig.chart_type || 'bar';
    const traces = chartConfig.traces || [];
    const title = chartConfig.title || `Chart ${index + 1}`;
    
    return {
      id: `ai_chart_${index + 1}_${Date.now()}`,
      title: title,
      type: chartType as 'line' | 'bar' | 'area' | 'pie' | 'scatter',
      xAxis: traces[0]?.x_column || '',
      yAxis: traces[0]?.y_column || '',
      filters: {},
      chartRendered: false,
      isAdvancedMode: traces.length > 1,
      traces: traces.map((trace: any, traceIndex: number) => ({
        id: `trace_${traceIndex}`,
        x_column: trace.x_column || traces[0]?.x_column || '',
        y_column: trace.y_column || '',
        yAxis: trace.y_column || '',
        name: trace.name || `Trace ${traceIndex + 1}`,
        color: trace.color || undefined,
        aggregation: trace.aggregation || 'sum',
        chart_type: trace.chart_type || chartType,
        filters: {}
      }))
    };
  });
}
```

### Multiple Charts Processing

```typescript
if (isMultipleCharts) {
  console.log('🚀 Generating multiple charts with separate backend calls...');
  
  const generatedCharts = [];
  let successCount = 0;
  let errorCount = 0;
  
  for (let i = 0; i < charts.length; i++) {
    const chartConfig = charts[i];
    console.log(`📊 Generating chart ${i + 1}/${charts.length}: ${chartConfig.title} (${chartConfig.type})`);
    
    const chartRequest = {
      file_id: fileData.file_id,
      chart_type: chartConfig.type,
      traces: chartConfig.traces.map(trace => ({
        x_column: trace.x_column || chartConfig.xAxis,
        y_column: trace.y_column || trace.yAxis,
        name: trace.name || `Trace ${traces.indexOf(trace) + 1}`,
        chart_type: trace.chart_type || chartConfig.type,
        aggregation: trace.aggregation || 'sum'
      })),
      title: chartConfig.title
    };
    
    try {
      const chartResponse = await fetch(`${CHART_MAKER_API}/charts`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(chartRequest)
      });
      
      if (chartResponse.ok) {
        const chartResult = await chartResponse.json();
        const updatedChart = {
          ...chartConfig,
          chartConfig: chartResult.chart_config,
          filteredData: chartResult.chart_config.data,
          chartRendered: true,
          chartLoading: false,
          lastUpdateTime: Date.now()
        };
        
        generatedCharts.push(updatedChart);
        successCount++;
      } else {
        // Handle error case
        const errorChart = {
          ...chartConfig,
          chartRendered: false,
          chartLoading: false,
          error: errorDetail
        };
        
        generatedCharts.push(errorChart);
        errorCount++;
      }
    } catch (error) {
      // Handle exception case
      const errorChart = {
        ...chartConfig,
        chartRendered: false,
        chartLoading: false,
        error: error.message || 'Unknown error occurred'
      };
      
      generatedCharts.push(errorChart);
      errorCount++;
    }
  }
}
```

## Key Features

### 1. Separate FastAPI Calls
- Each chart is processed independently through the `/charts` endpoint
- Individual error handling for each chart
- Success/failure tracking per chart

### 2. Comprehensive Error Handling
- File loading errors
- Individual chart generation errors
- Network/API errors
- Graceful fallback to manual generation

### 3. User Feedback
- Detailed progress messages for each chart
- Summary of successful vs failed charts
- Clear guidance on next steps
- Error details for troubleshooting

### 4. State Management
- Updates atom settings with all chart configurations
- Maintains multiple charts state
- Tracks rendering status for each chart

## Usage

### User Request Example
```
"Create two charts for my UK Mayo data: one showing volume by brand as a bar chart, and another showing volume trend over time as a line chart"
```

### AI Response Processing
1. AI detects the request for multiple charts
2. Generates configurations for both charts
3. Sets `multiple_charts: true` and `number_of_charts: 2`
4. Provides detailed chart specifications

### Frontend Processing
1. Component detects multiple charts mode
2. Creates chart configurations for both charts
3. Loads the target data file
4. Makes separate FastAPI calls for each chart
5. Aggregates results and updates UI
6. Provides user feedback and guidance

## Benefits

1. **Efficiency**: Single AI request generates multiple complementary charts
2. **Flexibility**: Each chart can have different types, configurations, and data mappings
3. **Reliability**: Individual chart processing with independent error handling
4. **User Experience**: Clear feedback and guidance throughout the process
5. **Scalability**: Easy to extend to support more than 2 charts

## Testing

A test file `test_multiple_charts.ts` is provided to verify the functionality:

- Tests chart configuration creation
- Simulates multiple FastAPI calls
- Validates chart properties and structure
- Tests both single and multiple chart modes

## Future Enhancements

1. **Chart Templates**: Predefined chart combinations for common use cases
2. **Batch Operations**: Support for generating more than 2 charts
3. **Chart Relationships**: Define relationships between multiple charts
4. **Layout Optimization**: Automatic layout suggestions for multiple charts
5. **Performance Metrics**: Track generation time and success rates

## Troubleshooting

### Common Issues

1. **File Loading Failures**: Check file path and permissions
2. **Chart Generation Errors**: Verify column names and data types
3. **Network Issues**: Check API endpoint availability
4. **Memory Issues**: Large datasets may require optimization

### Debug Information

The component provides extensive logging:
- Chart generation mode detection
- Individual chart processing status
- API call details and responses
- Error details and fallback actions

### Manual Fallback

If automatic generation fails:
1. Chart configurations are still loaded
2. Users can manually click "Generate Chart" for each chart
3. Error messages provide specific guidance
4. State is preserved for retry attempts
