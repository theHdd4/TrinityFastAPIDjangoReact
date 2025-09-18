import { CHART_MAKER_API } from '@/lib/api';
import { AtomHandler, AtomHandlerContext, AtomHandlerResponse, Message } from './types';
import { 
  getEnvironmentContext, 
  getFilename, 
  createMessage, 
  createSuccessMessage, 
  createErrorMessage,
  processSmartResponse,
  validateFileInput,
  createDebouncer,
  createProgressTracker 
} from './utils';

export const chartMakerHandler: AtomHandler = {
  handleSuccess: async (data: any, context: AtomHandlerContext): Promise<AtomHandlerResponse> => {
    const { atomId, updateAtomSettings, setMessages, sessionId } = context;
    
    if (!data.chart_json) {
      return { success: false, error: 'No chart configuration found in AI response' };
    }

    console.log('🔍 ===== CHART MAKER AI RESPONSE =====');
    console.log('📝 User Prompt received for session:', sessionId);
    
    // 🔧 UNIFIED APPROACH: chart_json is always an array
    const chartsList = Array.isArray(data.chart_json) ? data.chart_json : [data.chart_json];
    const numberOfCharts = chartsList.length;
    
    console.log('📊 Charts in chart_json:', numberOfCharts);
    console.log('🔍 ===== END CHART ANALYSIS =====');
    
    // 🔧 GET TARGET FILE: Use the exact keys from LLM response
    let targetFile = '';
    
    // Priority 1: Use AI-provided file name (exact keys from LLM)
    if (data.file_name) {
      targetFile = data.file_name;
      console.log('🎯 Using AI-provided file name:', targetFile);
    } else {
      console.log('⚠️ No file name found in AI response');
    }
    
    // Validate target file
    const fileValidation = validateFileInput(targetFile, 'AI Chart Maker');
    if (!fileValidation.isValid) {
      const errorMsg = createErrorMessage(
        'Chart generation',
        fileValidation.message || 'No valid file found',
        `AI provided: ${data.file_name || 'N/A'}, Context: ${data.file_context?.available_files?.join(', ') || 'N/A'}`
      );
      errorMsg.content += '\n\n💡 Please ensure you have selected a data file before using AI Chart Maker.';
      setMessages(prev => [...prev, errorMsg]);
      return { success: false, error: 'Invalid file input' };
    }
    
    // Get environment context
    const envContext = getEnvironmentContext();
    console.log('🔍 Environment context loaded:', envContext);
    
    // 🔧 CREATE CHART CONFIGURATIONS: chart_json is always a list
    let charts: any[] = [];
    
    console.log('🔧 Processing charts from chart_json list...');
    
    charts = chartsList.map((chartConfig: any, index: number) => {
      const chartType = chartConfig.chart_type || 'bar';
      const traces = chartConfig.traces || [];
      const title = chartConfig.title || `Chart ${index + 1}`;
      
      // 🔧 FILTER INTEGRATION: Process AI-generated filters
      let filters: Record<string, string[]> = {};
      if (chartConfig.filter_columns && chartConfig.filter_values) {
        const filterColumn = chartConfig.filter_columns;
        const filterValues = chartConfig.filter_values.split(',').map((v: string) => v.trim());
        filters[filterColumn] = filterValues;
        console.log('🔧 AI-generated filters applied:', { filterColumn, filterValues });
      }
      
      // 🔧 ADDITIONAL FILTER SUPPORT: Check for direct filters object
      if (chartConfig.filters && typeof chartConfig.filters === 'object') {
        filters = { ...filters, ...chartConfig.filters };
        console.log('🔧 Additional filters from chartConfig.filters:', chartConfig.filters);
      }
      
      return {
        id: `ai_chart_${chartConfig.chart_id || index + 1}_${Date.now()}`,
        title: title,
        type: chartType as 'line' | 'bar' | 'area' | 'pie' | 'scatter',
        chart_type: chartType, // 🔧 CRITICAL FIX: Add chart_type field for backend compatibility
        xAxis: traces[0]?.x_column || '',
        yAxis: traces[0]?.y_column || '',
        filters: filters, // 🔧 FILTER INTEGRATION: Use AI-generated filters
        chartRendered: false,
        isAdvancedMode: traces.length > 1,
        traces: traces.map((trace: any, traceIndex: number) => ({
          id: `trace_${traceIndex}`,
          x_column: trace.x_column || '', // 🔧 FIX: Use correct property name
          y_column: trace.y_column || '', // 🔧 FIX: Use correct property name
          yAxis: trace.y_column || '', // Keep for backward compatibility
          name: trace.name || `Trace ${traceIndex + 1}`,
          color: trace.color || undefined,
          aggregation: trace.aggregation || 'sum',
          chart_type: trace.chart_type || chartType, // 🔧 CRITICAL FIX: Add chart_type to traces
          filters: filters // 🔧 FILTER INTEGRATION: Apply same filters to traces
        }))
      };
    });
    
    console.log('🔧 Processed charts:', charts.length);
    
    // 🔧 CRITICAL FIX: Update atom settings with the AI configuration AND load data
    updateAtomSettings(atomId, { 
      aiConfig: data,
      aiMessage: data.message,
      // Add the AI-generated charts to the charts array
      charts: charts,
      // 🔧 CRITICAL: Set proper data source and file ID for chart rendering
      dataSource: targetFile,
      fileId: targetFile,
      // Set the first chart as active
      currentChart: charts[0],
      // Mark that AI has configured the chart(s)
      aiConfigured: true,
      // Set multiple charts configuration based on list length
      multipleCharts: numberOfCharts > 1,
      numberOfCharts: numberOfCharts,
      // Set chart type and basic settings for first chart
      chartType: charts[0].type,
      chartTitle: charts[0].title,
      xAxisColumn: charts[0].xAxis,
      yAxisColumn: charts[0].yAxis,
      // 🔧 CRITICAL: Set chart rendering state to trigger data loading
      chartRendered: false,
      chartLoading: false,
      // Include environment context
      envContext,
      lastUpdateTime: Date.now()
    });
    
    // Connect to file system and load data
    try {
      console.log('🔄 Connecting AI chart to actual file system...');
      console.log('📥 Loading actual file data from backend:', targetFile);
      
      const loadResponse = await fetch(`${CHART_MAKER_API}/load-saved-dataframe`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ object_name: targetFile })
      });
      
      if (loadResponse.ok) {
        const fileData = await loadResponse.json();
        console.log('✅ File data loaded successfully:', fileData);
        
        updateAtomSettings(atomId, {
          dataSource: targetFile,
          fileId: fileData.file_id,
          uploadedData: {
            columns: fileData.columns,
            rows: fileData.sample_data,
            numeric_columns: fileData.numeric_columns,
            categorical_columns: fileData.categorical_columns,
            unique_values: fileData.unique_values,
            file_id: fileData.file_id,
            row_count: fileData.row_count
          },
          chartRendered: false,
          chartLoading: false
        });
        
        // Generate charts using the backend
        console.log('🚀 Generating charts with backend data...');
        
        const generatedCharts = [];
        
        const generateChartWithDelay = async (chart: any, index: number, delay: number) => {
          return new Promise((resolve) => {
            setTimeout(async () => {
              try {
                const result = await generateSingleChart(chart, index, fileData);
                resolve(result);
              } catch (error) {
                resolve({ ...chart, error: (error as Error).message, chartRendered: false });
              }
            }, delay);
          });
        };
        
        const generateSingleChart = async (chart: any, index: number, fileData: any) => {
          const chartType = chart.type || chart.chart_type || 'bar';
          const traces = chart.traces || [];
          const title = chart.title;
          
          console.log(`📊 Generating chart ${index + 1}/${charts.length}: ${title} (${chartType})`);
          
          const processedFilters = chart.filters || {};
          const processedTraceFilters = traces.map((trace: any) => {
            const traceFilters = trace.filters || {};
            const formattedTraceFilters: Record<string, string[]> = {};
            for (const [key, value] of Object.entries(traceFilters)) {
              if (Array.isArray(value)) {
                formattedTraceFilters[key] = value.filter((v: any) => typeof v === 'string' && v.trim() !== '');
              } else if (typeof value === 'string' && value.trim() !== '') {
                formattedTraceFilters[key] = [value.trim()];
              }
            }
            return formattedTraceFilters;
          });
          
          const enhancedTraceFilters = traces.map((trace: any, traceIndex: number) => {
            const traceFilters = processedTraceFilters[traceIndex] || {};
            const mergedFilters = { ...processedFilters, ...traceFilters };
            return mergedFilters;
          });
          
          if (Object.keys(processedFilters).length > 0) {
            console.log(`✅ Chart ${index + 1} chart-level filters processed:`, processedFilters);
          }
          if (enhancedTraceFilters.some(tf => Object.keys(tf).length > 0)) {
            console.log(`✅ Chart ${index + 1} enhanced trace-level filters processed:`, enhancedTraceFilters);
          }
          
          const chartRequest = {
            file_id: fileData.file_id,
            chart_type: chartType,
            traces: traces.map((trace: any, traceIndex: number) => ({
              x_column: trace.x_column || chart.xAxis,
              y_column: trace.y_column || chart.yAxis,
              name: trace.name || `Trace ${traceIndex + 1}`,
              chart_type: trace.chart_type || chartType,
              aggregation: trace.aggregation || 'sum',
              filters: enhancedTraceFilters[traceIndex] || {}
            })),
            title: title,
            filters: processedFilters
          };
          
          console.log(`📊 Chart ${index + 1} request payload:`, chartRequest);
          
          try {
            const chartResponse = await fetch(`${CHART_MAKER_API}/charts`, {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify(chartRequest)
            });
            
            if (chartResponse.ok) {
              const chartResult = await chartResponse.json();
              console.log(`✅ Chart ${index + 1} generated successfully:`, chartResult);
              
              const updatedChart = {
                ...chart,
                chartConfig: chartResult.chart_config,
                filteredData: chartResult.chart_config.data,
                chartRendered: true,
                chartLoading: false,
                lastUpdateTime: Date.now()
              };
              
              return updatedChart;
              
            } else {
              console.error(`❌ Chart ${index + 1} generation failed:`, chartResponse.status);
              
              let errorDetail = chartResponse.statusText;
              try {
                const errorData = await chartResponse.json();
                errorDetail = errorData.detail || errorData.message || chartResponse.statusText;
              } catch (e) {
                // Use status text if can't parse error response
              }
              
              const isFilterError = errorDetail.toLowerCase().includes('filter') || 
                                 errorDetail.toLowerCase().includes('column') ||
                                 errorDetail.toLowerCase().includes('not found');
              
              const errorMsg: Message = {
                id: (Date.now() + index).toString(),
                content: `⚠️ Chart ${index + 1} generation failed: ${chartResponse.status}\n\nError: ${errorDetail}\n\nChart: ${title} (${chartType})\n${isFilterError ? '\n🔍 This might be a filter-related issue. Check if the filter columns exist in your data.' : ''}\n\n💡 This chart may need manual generation.`,
                sender: 'ai',
                timestamp: new Date(),
              };
              setMessages(prev => [...prev, errorMsg]);
              
              return {
                ...chart,
                chartRendered: false,
                chartLoading: false,
                error: errorDetail
              };
            }
          } catch (error) {
            console.error(`❌ Error generating chart ${index + 1}:`, error);
            
            const errorMsg: Message = {
              id: (Date.now() + index).toString(),
              content: `❌ Error generating chart ${index + 1}: ${(error as Error).message || 'Unknown error occurred'}\n\nChart: ${title} (${chartType})\n\n💡 This chart may need manual generation.`,
              sender: 'ai',
              timestamp: new Date(),
            };
            setMessages(prev => [...prev, errorMsg]);
            
            return {
              ...chart,
              chartRendered: false,
              chartLoading: false,
              error: (error as Error).message || 'Unknown error'
            };
          }
        };
        
        // Generate charts with debouncing
        const chartPromises = charts.map((chart, index) => 
          generateChartWithDelay(chart, index, index * 1000) // 1 second delay between each chart
        );
        
        const chartResults = await Promise.all(chartPromises);
        generatedCharts.push(...chartResults);
        
        // Update atom settings with generated charts
        updateAtomSettings(atomId, {
          charts: generatedCharts,
          currentChart: generatedCharts[0] || charts[0],
          chartRendered: generatedCharts.some(chart => chart.chartRendered),
          chartLoading: false
        });
        
        console.log('🎉 Charts processed:', generatedCharts.length);
        
        const successCount = generatedCharts.filter(chart => chart.chartRendered).length;
        const totalCount = generatedCharts.length;
        
        if (totalCount > 1) {
          const successMsg: Message = {
            id: (Date.now() + 3).toString(),
            content: `✅ ${successCount}/${totalCount} charts generated successfully!\n\n💡 Use the 2-chart layout option to view them simultaneously.`,
            sender: 'ai',
            timestamp: new Date(),
          };
          setMessages(prev => [...prev, successMsg]);
        } else {
          const successMsg: Message = {
            id: (Date.now() + 3).toString(),
            content: `✅ Chart generated successfully with real data!`,
            sender: 'ai',
            timestamp: new Date(),
          };
          setMessages(prev => [...prev, successMsg]);
        }
        
      } else {
        console.error('❌ Failed to load file data:', loadResponse.status);
        
        let errorDetail = loadResponse.statusText;
        try {
          const errorData = await loadResponse.json();
          errorDetail = errorData.detail || errorData.message || loadResponse.statusText;
        } catch (e) {
          // Use status text if can't parse error response
        }
        
        updateAtomSettings(atomId, {
          chartRendered: false,
          chartLoading: false
        });
        
        const errorMsg: Message = {
          id: (Date.now() + 1).toString(),
          content: `⚠️ Failed to load file data: ${errorDetail}\n\n💡 Please ensure the file exists and try again.`,
          sender: 'ai',
          timestamp: new Date(),
        };
        setMessages(prev => [...prev, errorMsg]);
      }
      
    } catch (error) {
      console.error('❌ Error in AI chart setup:', error);
      
      updateAtomSettings(atomId, {
        chartRendered: false,
        chartLoading: false
      });
      
      const errorMsg: Message = {
        id: (Date.now() + 1).toString(),
        content: `❌ Error setting up chart: ${(error as Error).message || 'Unknown error occurred'}\n\n💡 Please try generating the chart manually.`,
        sender: 'ai',
        timestamp: new Date(),
      };
      setMessages(prev => [...prev, errorMsg]);
    }
    
    // Add smart response message
    let aiContent = '';
    
    if (data.smart_response) {
      aiContent = data.smart_response;
    } else if (numberOfCharts > 1) {
      aiContent = `💡 ${data.message || 'Multiple chart configuration completed successfully'}\n\n`;
      
      if (data.suggestions && Array.isArray(data.suggestions)) {
        aiContent += `${data.suggestions.join('\n')}\n\n`;
      }
      
      if (data.next_steps && Array.isArray(data.next_steps)) {
        aiContent += `🎯 Next Steps:\n${data.next_steps.join('\n')}`;
      }
      
    } else {
      aiContent = `💡 ${data.message || 'Chart configuration completed successfully'}\n\n`;
      
      if (data.suggestions && Array.isArray(data.suggestions)) {
        aiContent += `${data.suggestions.join('\n')}\n\n`;
      }
      
      if (data.next_steps && Array.isArray(data.next_steps)) {
        aiContent += `🎯 Next Steps:\n${data.next_steps.join('\n')}`;
      }
    }
    
    const aiMsg: Message = {
      id: (Date.now() + 1).toString(),
      content: aiContent,
      sender: 'ai',
      timestamp: new Date(),
    };
    setMessages(prev => [...prev, aiMsg]);

    return { success: true };
  },

  handleFailure: async (data: any, context: AtomHandlerContext): Promise<AtomHandlerResponse> => {
    const { setMessages } = context;
    
    let aiText = '';
    if (data.smart_response) {
      aiText = data.smart_response;
    } else if (data.suggestions && Array.isArray(data.suggestions)) {
      aiText = `${data.message || 'Here\'s what I can help you with:'}\n\n${data.suggestions.join('\n\n')}`;
      
      if (data.next_steps && data.next_steps.length > 0) {
        aiText += `\n\n🎯 Next Steps:\n${data.next_steps.map((step: string, idx: number) => `${idx + 1}. ${step}`).join('\n')}`;
      }
    } else {
      aiText = data.smart_response || data.message || 'AI response received';
    }
    
    const aiMsg: Message = {
      id: (Date.now() + 1).toString(),
      content: aiText,
      sender: 'ai',
      timestamp: new Date(),
    };
    setMessages(prev => [...prev, aiMsg]);
    
    return { success: true };
  }
};
