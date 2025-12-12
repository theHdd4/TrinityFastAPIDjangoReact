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
  createProgressTracker,
  formatAgentResponseForTextBox,
  updateCardTextBox,
  addCardTextBox
} from './utils';
import { useLaboratoryStore } from '@/components/LaboratoryMode/store/laboratoryStore';
import { generateAtomInsight } from './insightGenerator';

export const chartMakerHandler: AtomHandler = {
  handleSuccess: async (data: any, context: AtomHandlerContext): Promise<AtomHandlerResponse> => {
    const { atomId, updateAtomSettings, setMessages, sessionId } = context;
    
    console.log('🔧 ===== CHART MAKER HANDLER CALLED =====');
    console.log('📦 Full data structure:', JSON.stringify(data, null, 2));
    console.log('🔍 Data keys:', Object.keys(data));
    console.log('🔍 Has chart_json:', !!data.chart_json);
    console.log('🔍 Has file_name:', !!data.file_name);
    console.log('🔍 Has data_source:', !!data.data_source);
    
    // Show reasoning in chat box (only reasoning field now)
    const reasoningText = data.reasoning || data.data?.reasoning || '';
    
    if (reasoningText) {
      const reasoningMsg: Message = {
        id: (Date.now() + 1).toString(),
        content: `**Reasoning:**\n${reasoningText}`,
        sender: 'ai',
        timestamp: new Date(),
      };
      setMessages(prev => [...prev, reasoningMsg]);
      console.log('✅ Displayed reasoning to user');
    }
    
    // STEP 1: Add reasoning to a TEXT BOX
    const textBoxContent = formatAgentResponseForTextBox(data);
    
    try {
      await updateCardTextBox(atomId, textBoxContent);
    } catch (textBoxError) {
      console.error('❌ Error adding 3 keys to text box:', textBoxError);
      // Continue even if text box update fails
    }
    
    // 🔧 CRITICAL FIX: Handle non-chart requests (file listing, suggestions, etc.)
    // Check multiple possible locations for chart_json
    const chartJson = data.chart_json || data.chart_config || null;
    
    if (!chartJson) {
      console.log('ℹ️ No chart configuration found - this is likely a file listing or suggestion request');
      console.log('📦 Available keys:', Object.keys(data));
      
      // STEP 2: Generate insight AFTER 3 keys are shown in text box
      // This ensures the insight LLM has access to the original response
      // All detailed logging happens on backend - check terminal for logs
      
      // Add a small delay to ensure first text box is fully saved
      await new Promise(resolve => setTimeout(resolve, 500));
      
      // Add text box with placeholder, then generate insight and update it
      let textBoxAdded = false;
      try {
        // Add text box with placeholder (addCardTextBox requires non-empty content)
        await addCardTextBox(atomId, 'Generating insight...', 'AI Insight');
        textBoxAdded = true;
        console.log('✅ Placeholder text box added, now calling generateAtomInsight...');
      } catch (textBoxError) {
        console.error('❌ Error adding placeholder text box, but continuing with insight generation:', textBoxError);
        // Continue even if text box fails
      }
      
      // Generate insight - same pattern as createColumnHandler
      // Call this even if text box addition failed
      console.log('🚀🚀🚀 CHART MAKER: About to call generateAtomInsight');
      console.log('🚀🚀🚀 CHART MAKER: data keys:', Object.keys(data));
      console.log('🚀🚀🚀 CHART MAKER: sessionId:', sessionId);
      console.log('🚀🚀🚀 CHART MAKER: atomType: chart-maker');
      
      // Generate insight - uses queue manager to ensure completion even when new atoms start
      // The queue manager automatically handles text box updates with retry logic
      generateAtomInsight({
        data,
        atomType: 'chart-maker',
        sessionId,
        atomId, // Pass atomId so queue manager can track and complete this insight
      }).catch((error) => {
        console.error('❌ Error generating insight:', error);
      });
      // Note: We don't need to manually update the text box here - the queue manager handles it
      
      return { success: true }; // This is not an error for file listing requests
    }

    console.log('🔍 ===== CHART MAKER AI RESPONSE =====');
    console.log('📝 User Prompt received for session:', sessionId);
    
    // 🔧 UNIFIED APPROACH: chart_json is always an array
    // Use the extracted chartJson (which could be from chart_json or chart_config)
    const chartsList = Array.isArray(chartJson) ? chartJson : chartJson ? [chartJson] : [];
    const numberOfCharts = chartsList.length;
    
    if (numberOfCharts === 0) {
      console.warn('⚠️ Chart maker success payload did not include any chart configurations.');
      const errorMsg = createErrorMessage(
        'Chart generation',
        'No chart configuration returned from AI assistant.',
        'Please try asking for the chart again with a clear file name, x-axis, and y-axis.'
      );
      setMessages(prev => [...prev, errorMsg]);
      return { success: false, error: 'Empty chart configuration' };
    }
    
    console.log('📊 Charts in chart_json:', numberOfCharts);
    console.log('🔍 ===== END CHART ANALYSIS =====');
    
    // 🔧 GET TARGET FILE: Use the exact keys from LLM response
    let targetFile = '';
    
    // Priority 1: Use AI-provided file name (exact keys from LLM)
    // 🔧 CRITICAL FIX: Check both file_name and data_source (LLM may return either)
    if (data.file_name) {
      targetFile = data.file_name;
      console.log('🎯 Using AI-provided file_name:', targetFile);
    } else if (data.data_source) {
      targetFile = data.data_source;
      console.log('🎯 Using AI-provided data_source:', targetFile);
    } else {
      console.log('⚠️ No file name found in AI response (checked file_name and data_source)');
    }
    
    // 🔧 CRITICAL: Find the correct object_name for the dropdown
    // The dropdown expects object_name (full path), not just filename
    let dataSourceObjectName = targetFile; // Default fallback
    
    try {
       // Try to fetch the frames list to match the filename to object_name
       const framesResponse = await fetch(`${CHART_MAKER_API.replace('/chart-maker', '')}/data-validate/list_saved_dataframes`);
      if (framesResponse.ok) {
        const framesData = await framesResponse.json();
        const frames = framesData.files || [];
        
         console.log('🔍 Available frames:', frames.map((f: any) => ({ object_name: f.object_name, arrow_name: f.arrow_name })));
         
         // Find the frame that matches our target file - improved matching logic
         const matchingFrame = frames.find((f: any) => {
           const arrowName = f.arrow_name || '';
           const objectName = f.object_name || '';
           
           // Check exact matches first
           if (arrowName === targetFile) return true;
           if (arrowName === targetFile.replace('.arrow', '') + '.arrow') return true;
           if (arrowName.includes(targetFile.replace('.arrow', ''))) return true;
           
           // Check if object_name ends with our target file
           if (objectName.endsWith('/' + targetFile)) return true;
           if (objectName.endsWith('/' + targetFile.replace('.arrow', '') + '.arrow')) return true;
           
           return false;
         });
        
        if (matchingFrame) {
          dataSourceObjectName = matchingFrame.object_name;
          console.log('✅ Found matching frame:', { 
            targetFile, 
            object_name: dataSourceObjectName,
            arrow_name: matchingFrame.arrow_name 
          });
        } else {
          console.log('⚠️ No matching frame found for:', targetFile);
          console.log('Available frames:', frames.map((f: any) => f.arrow_name));
        }
      }
    } catch (error) {
      console.log('⚠️ Failed to fetch frames list, using targetFile as fallback:', error);
    }
    
    const resolvedDataSource = dataSourceObjectName || targetFile;
    
    console.log('🔍 Setting dataSource properties:', {
      targetFile,
      dataSourceObjectName,
      resolvedDataSource,
      selectedDataSource: resolvedDataSource,
      fileName: targetFile
    });
    
    // 🔧 CRITICAL: Update settings with correct dataSource immediately
    updateAtomSettings(atomId, {
      dataSource: resolvedDataSource, // 🔧 CRITICAL: Use object_name for dropdown compatibility
      selectedDataSource: resolvedDataSource, // 🔧 FIX: Use object_name for dropdown
      fileName: targetFile, // 🔧 FIX: Add fileName property for visibility in properties section
    });
    
    // 🔧 CRITICAL FIX: Only validate file input for actual chart generation requests
    if (targetFile) {
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

      // 🔧 UPDATED: Use legend_field from updated chart maker code (replaces segregated_field)
      const legendFieldCandidate =
        chartConfig.legend_field ??
        chartConfig.legendField ??
        traces[0]?.legend_field ??
        traces[0]?.legendField ??
        '';
      const normalizedLegendField =
        legendFieldCandidate && legendFieldCandidate !== 'aggregate'
          ? legendFieldCandidate
          : '';
      const legendField = normalizedLegendField || 'aggregate';
      
      // 🔧 NEW INTERFACE SUPPORT: Detect dual Y-axis (Image 3)
      // If there are 2 traces with different y_columns and same x_column, it's dual Y-axis
      const isDualYAxis = traces.length === 2 && 
                          traces[0]?.x_column === traces[1]?.x_column &&
                          traces[0]?.y_column !== traces[1]?.y_column &&
                          !traces[0]?.legend_field && !traces[1]?.legend_field;
      
      // 🔧 NEW INTERFACE SUPPORT: Detect legend field segregation (Image 2)
      // If there's 1 trace with legend_field, use simple mode with legendField
      const hasLegendField = legendField !== 'aggregate' && traces.length === 1;
      
      // 🔧 NEW INTERFACE SUPPORT: Determine if we should use simple mode (new interface)
      // Simple mode: dual Y-axis OR legend field (not advanced traces mode)
      const useSimpleMode = isDualYAxis || hasLegendField;
      
      // Extract second Y-axis value if dual Y-axis
      const secondYAxis = isDualYAxis ? traces[1]?.y_column : undefined;
      
      return {
        id: `ai_chart_${chartConfig.chart_id || index + 1}_${Date.now()}`,
        title: title,
        type: chartType as 'line' | 'bar' | 'area' | 'pie' | 'scatter',
        chart_type: chartType, // 🔧 CRITICAL FIX: Add chart_type field for backend compatibility
        xAxis: traces[0]?.x_column || '', // 🔧 FIX: Keep original case for backend validation
        yAxis: traces[0]?.y_column || '', // 🔧 FIX: Keep original case for backend validation
        // 🔧 NEW INTERFACE SUPPORT: Add secondYAxis for dual Y-axis (Image 3)
        secondYAxis: secondYAxis,
        // 🔧 NEW INTERFACE SUPPORT: Add dualAxisMode for axis mode selection
        dualAxisMode: isDualYAxis ? 'dual' as const : undefined,
        filters: filters, // 🔧 FILTER INTEGRATION: Use AI-generated filters
        // 🔧 NEW INTERFACE SUPPORT: Set legendField for segregate field values (Image 2)
        legendField: hasLegendField ? legendField : (legendField !== 'aggregate' ? legendField : 'aggregate'),
        chartRendered: false,
        // 🔧 NEW INTERFACE SUPPORT: Use simple mode for new interface features
        isAdvancedMode: !useSimpleMode && traces.length > 1,
        aggregation: traces[0]?.aggregation || 'sum', // 🔧 NEW INTERFACE SUPPORT: Add aggregation at chart level
        traces: traces.map((trace: any, traceIndex: number) => ({
          id: `trace_${traceIndex}`,
          x_column: trace.x_column || '', // 🔧 FIX: Keep original case for backend validation
          y_column: trace.y_column || '', // 🔧 FIX: Keep original case for backend validation
          yAxis: trace.y_column || '', // Keep for backward compatibility, original case
          name: trace.name || `Trace ${traceIndex + 1}`,
          color: trace.color || undefined,
          aggregation: trace.aggregation || 'sum',
          chart_type: trace.chart_type || chartType, // 🔧 CRITICAL FIX: Add chart_type to traces
          filters: filters, // 🔧 FILTER INTEGRATION: Apply same filters to traces
          // 🔧 UPDATED: Use legend_field from updated chart maker code (replaces segregated_field)
          legend_field:
            trace.legend_field ||
            trace.legendField ||
            (legendField !== 'aggregate' ? legendField : undefined)
        }))
      };
    });
    
    console.log('🔧 Processed charts:', charts.length);
    
    // 🔧 CRITICAL FIX: Get current settings and merge with new settings
    const currentAtom = useLaboratoryStore.getState().getAtom(atomId);
    const currentSettings = currentAtom?.settings || {};
    
    // 🔧 CRITICAL FIX: Update atom settings with the AI configuration
    // Set charts first so component knows something is coming
    // Set fileId even if it's just the filename - component will show loading state
    const updatedSettings = {
      ...currentSettings, // Preserve all existing settings 
      aiConfig: data,
      aiMessage: data.message,
      // Add the AI-generated charts to the charts array
      charts: charts,
      // 🔧 CRITICAL: Set proper data source and file ID for chart rendering
      dataSource: resolvedDataSource, // 🔧 CRITICAL: Use object_name for dropdown compatibility
      fileId: targetFile, // 🔧 CRITICAL: Set fileId so component knows file is being loaded
      fileName: targetFile, // 🔧 FIX: Add fileName property for visibility in properties section
      selectedDataSource: resolvedDataSource, // 🔧 FIX: Use object_name for dropdown
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
      chartLoading: true, // 🔧 FIX: Set loading to true initially
      // Include environment context
      envContext,
      lastUpdateTime: Date.now()
    };
    
    console.log('🔄 Updating atom settings with charts:', {
      atomId,
      chartsCount: charts.length,
      dataSource: resolvedDataSource,
      updatedSettings: {
        charts: updatedSettings.charts?.length || 0,
        dataSource: updatedSettings.dataSource,
        fileId: updatedSettings.fileId
      }
    });
    
    updateAtomSettings(atomId, updatedSettings);
    
    // Force a small delay to ensure state propagation, then verify
    await new Promise(resolve => setTimeout(resolve, 100));
    
    // Verify the update was successful
    const verifyAtom = useLaboratoryStore.getState().getAtom(atomId);
    console.log('✅ Atom settings updated with charts configuration:', {
      atomExists: !!verifyAtom,
      chartsCount: verifyAtom?.settings?.charts?.length || 0,
      hasDataSource: !!verifyAtom?.settings?.dataSource,
      hasFileId: !!verifyAtom?.settings?.fileId,
      fileId: verifyAtom?.settings?.fileId
    });
    
    // Connect to file system and load data
    try {
      console.log('🔄 Connecting AI chart to actual file system...');
      console.log('📥 Loading actual file data from backend:', targetFile);
      
      const loadResponse = await fetch(`${CHART_MAKER_API}/load-saved-dataframe`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ object_name: resolvedDataSource })
      });
      
      if (loadResponse.ok) {
        const fileData = await loadResponse.json();
        console.log('✅ File data loaded successfully:', fileData);
        
        updateAtomSettings(atomId, {
          dataSource: resolvedDataSource, // 🔧 CRITICAL: Use object_name for dropdown compatibility
          fileId: fileData.file_id,
          fileName: targetFile, // 🔧 FIX: Add fileName property for visibility in properties section
          selectedDataSource: resolvedDataSource, // 🔧 FIX: Use object_name for dropdown
          uploadedData: {
            columns: fileData.columns,
            allColumns: fileData.columns, // 🔧 CRITICAL FIX: Add allColumns for filter availability
            rows: fileData.sample_data,
            numeric_columns: fileData.numeric_columns,
            numericColumns: fileData.numeric_columns, // 🔧 CRITICAL FIX: Add camelCase version for compatibility
            categorical_columns: fileData.categorical_columns,
            categoricalColumns: fileData.categorical_columns, // 🔧 CRITICAL FIX: Add camelCase version for compatibility
            unique_values: fileData.unique_values,
            uniqueValuesByColumn: fileData.unique_values, // 🔧 CRITICAL FIX: Add alternative key name
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
          console.log(`🔧 Chart mode: ${chart.isAdvancedMode ? 'Advanced' : 'Simple'}, Dual Y-axis: ${chart.secondYAxis ? 'Yes' : 'No'}, Legend Field: ${chart.legendField && chart.legendField !== 'aggregate' ? chart.legendField : 'None'}`);
          
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
          
          // 🔧 NEW INTERFACE SUPPORT: Build traces based on chart mode
          // For simple mode with dual Y-axis or legend field, use chart-level fields
          let apiTraces: any[] = [];
          
          if (!chart.isAdvancedMode && chart.secondYAxis) {
            // 🔧 DUAL Y-AXIS (Image 3): Simple mode with secondYAxis
            console.log(`🔧 Building dual Y-axis traces for chart ${index + 1}`);
            apiTraces = [
              {
                x_column: chart.xAxis || '',
                y_column: chart.yAxis || '',
                name: chart.yAxis || 'Series 1',
                chart_type: chartType,
                aggregation: chart.aggregation || 'sum',
                filters: processedFilters,
                legend_field: chart.legendField && chart.legendField !== 'aggregate' ? chart.legendField : undefined
              },
              {
                x_column: chart.xAxis || '',
                y_column: chart.secondYAxis || '',
                name: chart.secondYAxis || 'Series 2',
                chart_type: chartType,
                aggregation: chart.aggregation || 'sum',
                filters: processedFilters,
                legend_field: chart.legendField && chart.legendField !== 'aggregate' ? chart.legendField : undefined
              }
            ];
          } else if (!chart.isAdvancedMode && chart.legendField && chart.legendField !== 'aggregate') {
            // 🔧 LEGEND FIELD (Image 2): Simple mode with legendField
            console.log(`🔧 Building legend field trace for chart ${index + 1} with legend_field: ${chart.legendField}`);
            apiTraces = [
              {
                x_column: chart.xAxis || '',
                y_column: chart.yAxis || '',
                name: chart.yAxis || 'Series 1',
                chart_type: chartType,
                aggregation: chart.aggregation || 'sum',
                filters: processedFilters,
                legend_field: chart.legendField
              }
            ];
          } else {
            // 🔧 ADVANCED MODE or FALLBACK: Use traces array
            apiTraces = traces.map((trace: any, traceIndex: number) => ({
              x_column: (trace.x_column || chart.xAxis) || '', // 🔧 FIX: Keep original case for backend validation
              y_column: (trace.y_column || chart.yAxis) || '', // 🔧 FIX: Keep original case for backend validation
              name: trace.name || `Trace ${traceIndex + 1}`,
              chart_type: trace.chart_type || chartType,
              aggregation: trace.aggregation || 'sum',
              filters: enhancedTraceFilters[traceIndex] || {},
              // 🔧 UPDATED: Use legend_field from updated chart maker code (replaces segregated_field)
              legend_field:
                trace.legend_field ||
                trace.legendField ||
                (chart.legendField && chart.legendField !== 'aggregate' ? chart.legendField : undefined)
            }));
          }
          
          const chartRequest = {
            file_id: fileData.file_id,
            chart_type: chartType,
            traces: apiTraces,
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
        
        // 🔧 CRITICAL FIX: Update atom settings with generated charts AND ensure all required fields are set
        // This prevents white screen when component checks for fileId/uploadedData
        updateAtomSettings(atomId, {
          charts: generatedCharts,
          currentChart: generatedCharts[0] || charts[0],
          chartRendered: generatedCharts.some(chart => chart.chartRendered),
          chartLoading: false,
          // 🔧 CRITICAL: Ensure fileId and uploadedData are still set (component requires these)
          fileId: fileData.file_id,
          uploadedData: {
            columns: fileData.columns,
            allColumns: fileData.columns, // 🔧 CRITICAL FIX: Add allColumns for filter availability
            rows: fileData.sample_data,
            numeric_columns: fileData.numeric_columns,
            numericColumns: fileData.numeric_columns, // 🔧 CRITICAL FIX: Add camelCase version for compatibility
            categorical_columns: fileData.categorical_columns,
            categoricalColumns: fileData.categorical_columns, // 🔧 CRITICAL FIX: Add camelCase version for compatibility
            unique_values: fileData.unique_values,
            uniqueValuesByColumn: fileData.unique_values, // 🔧 CRITICAL FIX: Add alternative key name
            file_id: fileData.file_id,
            row_count: fileData.row_count
          },
          // 🔧 CRITICAL: Ensure dataSource is set for component rendering
          dataSource: resolvedDataSource,
          selectedDataSource: resolvedDataSource,
          fileName: targetFile
        });
        
        console.log('🚨🚨🚨 BEFORE Charts processed log');
        console.log('🎉 Charts processed:', generatedCharts.length);
        console.log('🚨🚨🚨 AFTER Charts processed log - LINE 640');
        
        try {
          console.log('🚨🚨🚨 INSIDE TRY BLOCK AFTER CHARTS PROCESSED');
          console.log('✅ Final atom settings updated with all required fields for rendering');
          console.log('🚨🚨🚨 CRITICAL CHECKPOINT 1 - LINE 641');
          
          const successCount = generatedCharts.filter(chart => chart.chartRendered).length;
          const totalCount = generatedCharts.length;
          console.log('🚨🚨🚨 CRITICAL CHECKPOINT 2 - successCount:', successCount, 'totalCount:', totalCount);
          
          if (totalCount > 1) {
            const successMsg: Message = {
              id: (Date.now() + 4).toString(),
              content: `✅ ${successCount}/${totalCount} charts generated successfully!\n\n💡 Use the 2-chart layout option to view them simultaneously.`,
              sender: 'ai',
              timestamp: new Date(),
            };
            setMessages(prev => [...prev, successMsg]);
          } else {
            const successMsg: Message = {
              id: (Date.now() + 4).toString(),
              content: `✅ Chart generated successfully with real data!`,
              sender: 'ai',
              timestamp: new Date(),
            };
            setMessages(prev => [...prev, successMsg]);
          }
          
          console.log('🚨🚨🚨 CRITICAL CHECKPOINT 3 - AFTER SUCCESS MESSAGES');
          console.log('🚨🚨🚨 CRITICAL CHECKPOINT 4 - ABOUT TO START INSIGHT GENERATION');
        console.log('🚨🚨🚨 fileData check:', typeof fileData !== 'undefined' ? 'EXISTS' : 'UNDEFINED');
        console.log('🚨🚨🚨 generatedCharts check:', typeof generatedCharts !== 'undefined' ? 'EXISTS' : 'UNDEFINED');
        console.log('🔍🔍🔍 Current line: After success messages');
        console.log('🔍🔍🔍 generatedCharts exists:', typeof generatedCharts !== 'undefined');
        console.log('🔍🔍🔍 generatedCharts length:', generatedCharts?.length || 0);
        console.log('🔍🔍🔍 fileData exists:', typeof fileData !== 'undefined');
        console.log('🔍🔍🔍 fileData keys:', fileData ? Object.keys(fileData) : 'N/A');
        console.log('🔍🔍🔍 successCount:', successCount);
        console.log('🔍🔍🔍 targetFile:', targetFile);
        console.log('🔍🔍🔍 resolvedDataSource:', resolvedDataSource);
        
        // STEP 2: Generate insight AFTER charts are rendered and 3 keys are shown in text box
        // This ensures the insight LLM has access to both the original response AND the chart results
        // All detailed logging happens on backend - check terminal for logs
        
        console.log('🔍🔍🔍 REACHED INSIGHT GENERATION SECTION - Starting try block');
        
        try {
          // Validate required variables exist
          if (!fileData) {
            console.error('❌❌❌ fileData is undefined! Cannot generate insight.');
            throw new Error('fileData is undefined');
          }
          if (!generatedCharts) {
            console.error('❌❌❌ generatedCharts is undefined! Cannot generate insight.');
            throw new Error('generatedCharts is undefined');
          }
          
          console.log('✅✅✅ All variables validated, creating enhancedDataForInsight');
          
          // Prepare enhanced data with chart results for insight generation
          // Include reasoning from the original AI response (it's in 'data')
          // Include chart results from backend API call
          const enhancedDataForInsight = {
            ...data, // This includes reasoning
            chart_json: chartJson, // Original chart config from first LLM call
            chart_results: {
              charts: generatedCharts,
              charts_count: generatedCharts.length,
              success_count: successCount,
              file_data: {
                file_id: fileData.file_id,
                file_name: targetFile,
                columns: fileData.columns,
                row_count: fileData.row_count,
                numeric_columns: fileData.numeric_columns,
                categorical_columns: fileData.categorical_columns,
              },
            },
            file_details: {
              file_name: targetFile,
              data_source: resolvedDataSource,
            },
          };
          
          console.log('✅✅✅ enhancedDataForInsight created successfully');
          
          console.log('✅ Enhanced data prepared for insight generation');
          
          // Generate insight - this is the 2nd LLM call
          // All detailed logging happens on backend - check terminal for logs
          
          // Add a small delay to ensure first text box is fully saved
          await new Promise(resolve => setTimeout(resolve, 500));
          
          // Add text box with placeholder, then generate insight and update it
          let textBoxAdded = false;
          try {
            // Add text box with placeholder (addCardTextBox requires non-empty content)
            await addCardTextBox(atomId, 'Generating insight...', 'AI Insight');
            textBoxAdded = true;
            console.log('✅ Placeholder text box added, now calling generateAtomInsight...');
          } catch (textBoxError) {
            console.error('❌ Error adding placeholder text box, but continuing with insight generation:', textBoxError);
            // Continue even if text box fails
          }
          
          // Generate insight - same pattern as createColumnHandler
          // Call this even if text box addition failed
          console.log('🚀🚀🚀 CHART MAKER: About to call generateAtomInsight (with enhanced data)');
          console.log('🚀🚀🚀 CHART MAKER: enhancedDataForInsight keys:', Object.keys(enhancedDataForInsight));
          console.log('🚀🚀🚀 CHART MAKER: sessionId:', sessionId);
          console.log('🚀🚀🚀 CHART MAKER: atomType: chart-maker');
          
          // Generate insight - uses queue manager to ensure completion even when new atoms start
          // The queue manager automatically handles text box updates with retry logic
          generateAtomInsight({
            data: enhancedDataForInsight,
            atomType: 'chart-maker',
            sessionId,
            atomId, // Pass atomId so queue manager can track and complete this insight
          }).catch((error) => {
            console.error('❌ Error generating insight:', error);
          });
          // Note: We don't need to manually update the text box here - the queue manager handles it
        } catch (insightError) {
          console.error('❌❌❌ ERROR IN INSIGHT GENERATION SECTION:', insightError);
          console.error('❌❌❌ Error details:', insightError instanceof Error ? insightError.message : insightError);
          console.error('❌❌❌ Error stack:', insightError instanceof Error ? insightError.stack : 'N/A');
        }
        } catch (postChartsError) {
          console.error('❌❌❌ ERROR AFTER CHARTS PROCESSED:', postChartsError);
          console.error('❌❌❌ Error details:', postChartsError instanceof Error ? postChartsError.message : postChartsError);
          console.error('❌❌❌ Error stack:', postChartsError instanceof Error ? postChartsError.stack : 'N/A');
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
        
        // STEP 2: Generate insight AFTER 3 keys are shown in text box (even if file loading fails)
        // This ensures the insight LLM has access to the original response
        // All detailed logging happens on backend - check terminal for logs
        
        // Add a small delay to ensure first text box is fully saved
        await new Promise(resolve => setTimeout(resolve, 500));
        
        // Add text box with placeholder, then generate insight and update it
        let textBoxAdded = false;
        try {
          // Add text box with placeholder (addCardTextBox requires non-empty content)
          await addCardTextBox(atomId, 'Generating insight...', 'AI Insight');
          textBoxAdded = true;
          console.log('✅ Placeholder text box added (file load failed), now calling generateAtomInsight...');
        } catch (textBoxError) {
          console.error('❌ Error adding placeholder text box, but continuing with insight generation:', textBoxError);
          // Continue even if text box fails
        }
        
        // Generate insight - same pattern as createColumnHandler
        // Call this even if text box addition failed
        console.log('🚀🚀🚀 CHART MAKER: About to call generateAtomInsight (file load failed)');
        console.log('🚀🚀🚀 CHART MAKER: data keys:', Object.keys(data));
        console.log('🚀🚀🚀 CHART MAKER: sessionId:', sessionId);
        console.log('🚀🚀🚀 CHART MAKER: atomType: chart-maker');
        
        // Generate insight - uses queue manager to ensure completion even when new atoms start
        // The queue manager automatically handles text box updates with retry logic
        generateAtomInsight({
          data,
          atomType: 'chart-maker',
          sessionId,
          atomId, // Pass atomId so queue manager can track and complete this insight
        }).catch((error) => {
          console.error('❌ Error generating insight:', error);
        });
        // Note: We don't need to manually update the text box here - the queue manager handles it
        
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
      console.error('❌ Error stack:', error instanceof Error ? error.stack : 'N/A');
      
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
    
    // Smart response is already displayed above using processSmartResponse
    console.log('🚨🚨🚨 ABOUT TO RETURN FROM HANDLER - Line 951');
    console.log('🚨🚨🚨 Handler completing, returning success: true');

    return { success: true };
  },

  handleFailure: async (data: any, context: AtomHandlerContext): Promise<AtomHandlerResponse> => {
    const { setMessages } = context;
    
    // Show reasoning in chat (only reasoning field now)
    const reasoningText = data.reasoning || data.data?.reasoning || '';
    if (reasoningText) {
      const reasoningMsg: Message = {
        id: (Date.now() + 1).toString(),
        content: `**Reasoning:**\n${reasoningText}`,
        sender: 'ai',
        timestamp: new Date(),
      };
      setMessages(prev => [...prev, reasoningMsg]);
      console.log('✅ Displayed reasoning to user (failure)');
    }
    
    return { success: true };
  }
};
