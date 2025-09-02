// Test file for multiple charts functionality in AtomAIChatBot
// This file tests the AI response handling for multiple charts

// Mock AI response for multiple charts (based on the attached JSON)
const mockMultipleChartsResponse = {
  success: true,
  multiple_charts: true,
  number_of_charts: 2,
  charts: [
    {
      chart_id: "1",
      title: "Volume by Brand (Bar Chart)",
      chart_type: "bar",
      traces: [
        {
          x_column: "Brand",
          y_column: "Volume",
          name: "Volume per Brand",
          chart_type: "bar",
          aggregation: "sum",
          color: "#FFA07A"
        }
      ],
      x_axis: {
        dataKey: "Brand",
        label: "Brand",
        type: "category"
      },
      y_axis: {
        dataKey: "Volume",
        label: "Volume",
        type: "number"
      }
    },
    {
      chart_id: "2",
      title: "Volume Trend Over Time (Line Chart)",
      chart_type: "line",
      traces: [
        {
          x_column: "Year",
          y_column: "Volume",
          name: "Volume Trend",
          chart_type: "line",
          aggregation: "sum",
          color: "#458EE2"
        }
      ],
      x_axis: {
        dataKey: "Year",
        label: "Year",
        type: "category"
      },
      y_axis: {
        dataKey: "Volume",
        label: "Volume",
        type: "number"
      }
    }
  ],
  file_name: "default_client/default_app/default_project/20250825_081625_D0_KHC_UK_Mayo.arrow",
  data_source: "default_client/default_app/default_project/20250825_081625_D0_KHC_UK_Mayo.arrow",
  message: "Multiple chart configuration completed successfully",
  reasoning: "User requested two charts for UK Mayo data focusing on volume and brand. First chart shows volume by brand using bar chart, second shows volume trend over time using line chart.",
  used_memory: true
};

// Mock AI response for single chart
const mockSingleChartResponse = {
  success: true,
  multiple_charts: false,
  chart_json: {
    chart_type: "bar",
    title: "Single Chart Test",
    traces: [
      {
        x_column: "Category",
        y_column: "Value",
        name: "Test Trace",
        chart_type: "bar",
        aggregation: "sum"
      }
    ]
  },
  file_name: "test_file.arrow",
  message: "Single chart configuration completed successfully"
};

// Test function to simulate chart configuration creation
function testChartConfigurationCreation() {
  console.log('🧪 Testing chart configuration creation...');
  
  // Test multiple charts
  const isMultipleCharts = mockMultipleChartsResponse.multiple_charts && 
                          mockMultipleChartsResponse.charts && 
                          Array.isArray(mockMultipleChartsResponse.charts);
  
  console.log('Multiple charts detected:', isMultipleCharts);
  
  if (isMultipleCharts) {
    const charts = mockMultipleChartsResponse.charts.map((chartConfig: any, index: number) => {
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
    
    console.log('✅ Multiple charts configuration created:', charts.length);
    console.log('Chart 1:', charts[0]);
    console.log('Chart 2:', charts[1]);
    
    // Verify chart properties
    const chart1 = charts[0];
    const chart2 = charts[1];
    
    console.log('Chart 1 verification:');
    console.log('- Title:', chart1.title === 'Volume by Brand (Bar Chart)');
    console.log('- Type:', chart1.type === 'bar');
    console.log('- X-Axis:', chart1.xAxis === 'Brand');
    console.log('- Y-Axis:', chart1.yAxis === 'Volume');
    console.log('- Traces:', chart1.traces.length === 1);
    
    console.log('Chart 2 verification:');
    console.log('- Title:', chart2.title === 'Volume Trend Over Time (Line Chart)');
    console.log('- Type:', chart2.type === 'line');
    console.log('- X-Axis:', chart2.xAxis === 'Year');
    console.log('- Y-Axis:', chart2.yAxis === 'Volume');
    console.log('- Traces:', chart2.traces.length === 1);
    
  } else {
    console.log('❌ Multiple charts not detected');
  }
  
  // Test single chart
  console.log('\n🧪 Testing single chart configuration...');
  const isSingleChart = !mockSingleChartResponse.multiple_charts && mockSingleChartResponse.chart_json;
  
  if (isSingleChart) {
    const cfg = mockSingleChartResponse.chart_json;
    const chartType = cfg.chart_type || 'bar';
    const traces = cfg.traces || [];
    const title = cfg.title || 'AI Generated Chart';
    
    const singleChart = {
      id: `ai_chart_${Date.now()}`,
      title: title,
      type: chartType as 'line' | 'bar' | 'area' | 'pie' | 'scatter',
      xAxis: traces[0]?.x_column || '',
      yAxis: traces[0]?.y_column || '',
      filters: {},
      chartRendered: false,
      isAdvancedMode: traces.length > 1,
      traces: traces.map((trace: any, index: number) => ({
        id: `trace_${index}`,
        x_column: trace.x_column || traces[0]?.x_column || '',
        y_column: trace.y_column || '',
        yAxis: trace.y_column || '',
        name: trace.name || `Trace ${index + 1}`,
        color: trace.color || undefined,
        aggregation: trace.aggregation || 'sum',
        chart_type: trace.chart_type || chartType,
        filters: {}
      }))
    };
    
    console.log('✅ Single chart configuration created:', singleChart);
    console.log('Single chart verification:');
    console.log('- Title:', singleChart.title === 'Single Chart Test');
    console.log('- Type:', singleChart.type === 'bar');
    console.log('- X-Axis:', singleChart.xAxis === 'Category');
    console.log('- Y-Axis:', singleChart.yAxis === 'Value');
    console.log('- Traces:', singleChart.traces.length === 1);
  }
}

// Test function to simulate FastAPI calls for multiple charts
async function testMultipleChartsFastAPICalls() {
  console.log('\n🧪 Testing multiple charts FastAPI calls simulation...');
  
  // Simulate the file loading step
  const mockFileData = {
    file_id: 'test_file_123',
    columns: ['Brand', 'Volume', 'Year'],
    sample_data: [
      { Brand: 'Brand A', Volume: 100, Year: 2023 },
      { Brand: 'Brand B', Volume: 150, Year: 2023 }
    ],
    numeric_columns: ['Volume'],
    categorical_columns: ['Brand', 'Year'],
    unique_values: { Brand: 2, Volume: 2, Year: 1 },
    row_count: 2
  };
  
  console.log('✅ File data loaded:', mockFileData);
  
  // Simulate multiple chart generation
  const charts = [
    {
      id: 'chart_1',
      title: 'Volume by Brand (Bar Chart)',
      type: 'bar',
      xAxis: 'Brand',
      yAxis: 'Volume',
      traces: [
        {
          x_column: 'Brand',
          y_column: 'Volume',
          name: 'Volume per Brand',
          chart_type: 'bar',
          aggregation: 'sum'
        }
      ]
    },
    {
      id: 'chart_2',
      title: 'Volume Trend Over Time (Line Chart)',
      type: 'line',
      xAxis: 'Year',
      yAxis: 'Volume',
      traces: [
        {
          x_column: 'Year',
          y_column: 'Volume',
          name: 'Volume Trend',
          chart_type: 'line',
          aggregation: 'sum'
        }
      ]
    }
  ];
  
  console.log('📊 Processing multiple charts:', charts.length);
  
  const generatedCharts = [];
  let successCount = 0;
  let errorCount = 0;
  
  for (let i = 0; i < charts.length; i++) {
    const chartConfig = charts[i];
    console.log(`📊 Processing chart ${i + 1}/${charts.length}: ${chartConfig.title} (${chartConfig.type})`);
    
    // Simulate successful chart generation
    const mockChartResult = {
      chart_config: {
        data: [
          { x: 'Brand A', y: 100 },
          { x: 'Brand B', y: 150 }
        ],
        layout: {
          title: chartConfig.title,
          xaxis: { title: chartConfig.xAxis },
          yaxis: { title: chartConfig.yAxis }
        }
      }
    };
    
    const updatedChart = {
      ...chartConfig,
      chartConfig: mockChartResult.chart_config,
      filteredData: mockChartResult.chart_config.data,
      chartRendered: true,
      chartLoading: false,
      lastUpdateTime: Date.now()
    };
    
    generatedCharts.push(updatedChart);
    successCount++;
    
    console.log(`✅ Chart ${i + 1} processed successfully`);
  }
  
  console.log(`🎉 Multiple charts processing completed! Success: ${successCount}, Errors: ${errorCount}`);
  console.log('📊 Final charts configuration:', generatedCharts.map((chart, index) => ({
    index: index + 1,
    title: chart.title,
    type: chart.type,
    rendered: chart.chartRendered,
    error: chart.error || null
  })));
  
  return { generatedCharts, successCount, errorCount };
}

// Run tests
if (typeof window !== 'undefined') {
  // Browser environment
  console.log('🚀 Running multiple charts tests in browser...');
  testChartConfigurationCreation();
  testMultipleChartsFastAPICalls();
} else {
  // Node.js environment
  console.log('🚀 Running multiple charts tests in Node.js...');
  testChartConfigurationCreation();
  testMultipleChartsFastAPICalls();
}

export {
  testChartConfigurationCreation,
  testMultipleChartsFastAPICalls,
  mockMultipleChartsResponse,
  mockSingleChartResponse
};
