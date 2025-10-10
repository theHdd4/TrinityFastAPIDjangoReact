import { EXPLORE_API } from '@/lib/api';
import { AtomHandler, AtomHandlerContext, AtomHandlerResponse, Message } from './types';
import { 
  getEnvironmentContext, 
  getFilename, 
  createMessage, 
  createSuccessMessage, 
  createErrorMessage,
  processSmartResponse,
  validateFileInput 
} from './utils';
import { useLaboratoryStore } from '../../LaboratoryMode/store/laboratoryStore';

export const exploreHandler: AtomHandler = {
  handleSuccess: async (data: any, context: AtomHandlerContext): Promise<AtomHandlerResponse> => {
    const { atomId, updateAtomSettings, setMessages, sessionId } = context;
    
    // 🔧 CRITICAL FIX: Show smart_response FIRST (user-friendly message)
    const smartResponseText = processSmartResponse(data);
    const showedSmartResponse = !!smartResponseText; // Prevent duplicate chat messages
    if (smartResponseText) {
      const smartMsg: Message = {
        id: (Date.now() + 1).toString(),
        content: smartResponseText,
        sender: 'ai',
        timestamp: new Date(),
      };
      setMessages(prev => [...prev, smartMsg]);
      console.log('✅ Displayed smart_response to user:', smartResponseText);
    }
    
    if (!data.exploration_config) {
      return { success: false, error: 'No exploration configuration found in AI response' };
    }

    console.log('🔍 ===== EXPLORE AI RESPONSE =====');
    console.log('📝 User Prompt received for session:', sessionId);
    console.log('🔧 Exploration Config:', data.exploration_config);
    
    // Parse exploration configurations (always expect a list)
    const explorationsList = Array.isArray(data.exploration_config) ? data.exploration_config : [data.exploration_config];
    const numberOfExplorations = explorationsList.length;
    
    console.log('📊 Explorations in config:', numberOfExplorations);
    
    // Get target file from AI response - use just the filename
    let targetFile = '';
    let fileName = '';
    if (data.file_name) {
      fileName = getFilename(data.file_name); // Extract just the filename
      const envContext = getEnvironmentContext();
      targetFile = envContext.client_name && envContext.app_name && envContext.project_name
        ? `${envContext.client_name}/${envContext.app_name}/${envContext.project_name}/${fileName}`
        : fileName;
      console.log('🎯 Constructed full file path:', targetFile);
      console.log('📄 File name only:', fileName);
    } else {
      console.log('⚠️ No file_name found in AI response');
    }
    
    // Validate target file
    const fileValidation = validateFileInput(targetFile, 'AI Explore');
    if (!fileValidation.isValid) {
      const errorMsg = createMessage(
        data.smart_response || `I couldn't find a data file to analyze. Please make sure you have selected or uploaded a data file first, then try your exploration request again. I'll be able to help you create meaningful visualizations once the data is available.`
      );
      setMessages(prev => [...prev, errorMsg]);
      return { success: false, error: 'Invalid file input' };
    }
    
    // 🔧 CRITICAL FIX: Use the SAME 3-step backend flow as the working old AtomAIChatBot.tsx
    try {
      console.log('🎯 Using SAME backend endpoints as manual workflow (from old AtomAIChatBot.tsx)');
      
      // Process each exploration using manual's 3-step flow
      const explorationsList = Array.isArray(data.exploration_config) ? data.exploration_config : [data.exploration_config];
      let processedResults = [];
      
      console.log(`🎯 Processing ${explorationsList.length} exploration(s) via manual flow`);
      
      for (let i = 0; i < explorationsList.length; i++) {
        const exploration = explorationsList[i];
        console.log(`📊 Processing exploration ${i + 1}/${explorationsList.length} via manual flow:`, exploration);
        
        try {
          // 🎯 STEP 1: Create same JSON structures as manual
          const dimensionColumns = new Set<string>([exploration.x_axis]);
          if (exploration.legend_field && exploration.legend_field !== 'aggregate') {
            dimensionColumns.add(exploration.legend_field);
          }
          
          const selectedDimensions = {
            [targetFile]: Array.from(dimensionColumns).reduce(
              (acc, col) => ({ ...acc, [col]: [col] }),
              {} as { [key: string]: string[] }
            )
          };
          
          const selectedMeasures = {
            [targetFile]: [exploration.y_axis]
          };
          
          console.log('📋 Step 1 - selectedDimensions:', selectedDimensions);
          console.log('📋 Step 1 - selectedMeasures:', selectedMeasures);
          
          // 🎯 STEP 2: Call /select-dimensions-and-measures (SAME as manual)
          console.log(`🔄 Step 2 - Creating explore atom for chart ${i + 1}...`);
          const createResponse = await fetch(`${EXPLORE_API}/select-dimensions-and-measures`, {
            method: 'POST',
            headers: {
              'Content-Type': 'application/x-www-form-urlencoded',
            },
            body: new URLSearchParams({
              validator_atom_id: targetFile,
              atom_name: `AI Chart Analysis ${i + 1}`,
              selected_dimensions: JSON.stringify(selectedDimensions),
              selected_measures: JSON.stringify(selectedMeasures)
            })
          });
          
          if (!createResponse.ok) {
            const errorText = await createResponse.text();
            console.error(`❌ Failed to create explore atom for chart ${i + 1}:`, {
              status: createResponse.status,
              statusText: createResponse.statusText,
              error: errorText
            });
            throw new Error(`Failed to create explore atom for chart ${i + 1}: ${createResponse.status} - ${errorText}`);
          }
          
          const createResult = await createResponse.json();
          const exploreAtomId = createResult.explore_atom_id;
          console.log('✅ Step 2 - Explore atom created:', exploreAtomId);
          
          // 🎯 STEP 3: Create operationsPayload JSON (SAME as manual)
          const measuresConfig: { [key: string]: string } = {};
          if (exploration.y_axis) {
            measuresConfig[exploration.y_axis] = exploration.aggregation || 'sum';
          }
          
          const operationsPayload = {
            file_key: targetFile,
            filters: exploration.filters || [],
            group_by: exploration.legend_field && exploration.legend_field !== 'aggregate'
              ? [exploration.legend_field, exploration.x_axis]
              : [exploration.x_axis],
            measures_config: measuresConfig,
            chart_type: exploration.chart_type,
            x_axis: exploration.x_axis,
            weight_column: exploration.weight_column || null,
            sort_order: exploration.sort_order || null
          };
          
          console.log('📋 Step 3 - operationsPayload:', operationsPayload);
          
          // 🎯 STEP 4: Call /specify-operations (SAME as manual)
          console.log(`🔄 Step 4 - Specifying operations for chart ${i + 1}...`);
          const operationsResponse = await fetch(`${EXPLORE_API}/specify-operations`, {
            method: 'POST',
            headers: {
              'Content-Type': 'application/x-www-form-urlencoded',
            },
            body: new URLSearchParams({
              explore_atom_id: exploreAtomId,
              operations: JSON.stringify(operationsPayload)
            })
          });
          
          if (!operationsResponse.ok) {
            const errorText = await operationsResponse.text();
            console.error(`❌ Operations specification failed for chart ${i + 1}:`, {
              status: operationsResponse.status,
              statusText: operationsResponse.statusText,
              error: errorText,
              operationsPayload
            });
            throw new Error(`Operations specification failed for chart ${i + 1}: ${operationsResponse.status} - ${errorText}`);
          }
          console.log('✅ Step 4 - Operations specified');
          
          // 🎯 STEP 5: Call /chart-data-multidim (SAME as manual)
          console.log(`🔄 Step 5 - Fetching chart data for chart ${i + 1}...`);
          const chartResponse = await fetch(`${EXPLORE_API}/chart-data-multidim/${exploreAtomId}`);
          
          if (!chartResponse.ok) {
            const errorText = await chartResponse.text();
            console.error(`❌ Chart data fetch failed for chart ${i + 1}:`, {
              status: chartResponse.status,
              statusText: chartResponse.statusText,
              error: errorText,
              exploreAtomId
            });
            throw new Error(`Chart data fetch failed for chart ${i + 1}: ${chartResponse.status} - ${errorText}`);
          }
          
          const chartResult = await chartResponse.json();
          console.log(`✅ Step 5 - Chart data received for chart ${i + 1}:`, chartResult);
          
          // Store result in same format as manual
          const chartData = chartResult.data || [];
          processedResults.push({
            ...exploration,
            chart_data: chartData,
            explore_atom_id: exploreAtomId,
            ai_note: exploration.description || exploration.title || ''
          });
          
          console.log(`✅ Chart ${i + 1} processed successfully:`, {
            title: exploration.title,
            hasData: chartData.length > 0,
            dataLength: chartData.length,
            exploreAtomId: exploreAtomId
          });
          
        } catch (chartError) {
          console.error(`❌ Failed to process chart ${i + 1}:`, chartError);
          // Continue with next chart instead of failing completely
          processedResults.push({
            ...exploration,
            chart_data: [],
            explore_atom_id: null,
            ai_note: `Failed to process: ${chartError.message}`,
            error: chartError.message
          });
        }
      }
      
      console.log('🎉 All explorations processed via SAME manual backend flow:', processedResults);
      
      // 🎯 Now fetch REAL column classifier config like manual workflow does
      try {
        console.log('📋 Fetching REAL column classifier config like manual workflow...');
        
        // Extract path components for API call (same as manual)
        const pathParts = targetFile.split('/');
        const fileName = pathParts.pop();
        const projectPath = pathParts.join('/');
        
        const classifierResponse = await fetch(
          `${EXPLORE_API}/column-classifier/config/${encodeURIComponent(projectPath)}?file=${encodeURIComponent(fileName || '')}`
        );
        
        let columnClassifierConfig = null;
        if (classifierResponse.ok) {
          columnClassifierConfig = await classifierResponse.json();
          console.log('✅ Got REAL column classifier config:', columnClassifierConfig);
        }
        
        // Also fetch column summary for complete manual experience
        const summaryResponse = await fetch(`${EXPLORE_API}/column_summary?object_name=${encodeURIComponent(targetFile)}`);
        let columnSummary = [];
        if (summaryResponse.ok) {
          const summary = await summaryResponse.json();
          columnSummary = Array.isArray(summary.summary) ? summary.summary.filter(Boolean) : [];
          console.log('✅ Got REAL column summary:', columnSummary.length, 'columns');
        }
        
        // 🎯 Create exploreData using REAL backend data (same as manual)
        const result = { explorations: processedResults };
        const firstExploration = result.explorations?.[0];
        const numberOfCharts = result.explorations?.length || 1;
        
        console.log('🎯 Final processed results:', {
          totalCharts: numberOfCharts,
          charts: result.explorations?.map((exp: any, idx: number) => ({
            index: idx,
            title: exp.title,
            hasData: !!exp.chart_data,
            dataLength: exp.chart_data?.length || 0,
            exploreAtomId: exp.explore_atom_id
          }))
        });
        
        // 🔧 Convert AI column names to match manual casing (lowercase)
        const normalizeColumnName = (colName: string) => {
          if (!colName || typeof colName !== 'string') return '';
          return colName.toLowerCase();
        };
        
        // 🎯 STRICT: Extract ONLY explicit filters from AI JSON (no automatic detection)
        const allFilterColumns = new Set<string>();
        
        console.log('🔍 Using ONLY explicit AI JSON filters - no automatic detection');
        console.log('🔍 Original AI exploration_config:', data.exploration_config);
        
        result.explorations?.forEach((exp: any, idx: number) => {
          console.log(`🔍 Exploration ${idx + 1} - ONLY explicit filters from AI JSON:`, exp.filters);
          
          // STRICT: ONLY add explicit filter columns from AI JSON filters section
          if (exp.filters && typeof exp.filters === 'object') {
            Object.keys(exp.filters).forEach(filterCol => {
              const normalized = normalizeColumnName(filterCol);
              allFilterColumns.add(normalized);
              console.log(`✅ STRICT: Using explicit AI filter: ${filterCol} → ${normalized}`);
            });
          }
          // NO other automatic additions - stick strictly to AI JSON
        });
        
        console.log('🎯 STRICT: Only AI JSON filters will be used:', Array.from(allFilterColumns));
        
        // 🎯 Smart Filter Value Processing based on AI data
        const smartFilterValues: { [column: string]: string[] } = {};
        
        result.explorations?.forEach((exp: any) => {
          if (exp.filters && typeof exp.filters === 'object') {
            Object.keys(exp.filters).forEach(filterCol => {
              const normalizedCol = normalizeColumnName(filterCol);
              const aiValues = exp.filters[filterCol];
              
              console.log(`🔍 Processing filter for ${filterCol}:`, aiValues);
              
              // Find the column in dataset to get available values
              const columnData = columnSummary.find((col: any) => 
                col.column?.toLowerCase() === normalizedCol
              );
              
              if (columnData && columnData.unique_values) {
                const availableValues = columnData.unique_values;
                console.log(`📋 Available values for ${normalizedCol}:`, availableValues);
                
                // 🎯 Apply user's logic for filter value selection
                if (!aiValues || aiValues.length === 0) {
                  // Case 1: Only column specified, no values → Select "All" (empty array)
                  smartFilterValues[normalizedCol] = [];
                  console.log(`✅ ${normalizedCol}: No values specified → Selecting "All"`);
                  allFilterColumns.add(normalizedCol);
                } else {
                  // Check if AI values match actual dataset values
                  const matchingValues = aiValues.filter((val: any) => 
                    availableValues.some((avail: any) => 
                      String(avail).toLowerCase() === String(val).toLowerCase()
                    )
                  );
                  
                  if (matchingValues.length === 0) {
                    // Case 2: Values don't match dataset → Select "All"
                    smartFilterValues[normalizedCol] = [];
                    console.log(`✅ ${normalizedCol}: Values don't match dataset → Selecting "All"`);
                    console.log(`   AI provided: ${aiValues}, Available: ${availableValues.slice(0, 5)}...`);
                    allFilterColumns.add(normalizedCol);
                  } else {
                    // Case 3: Values match dataset → Use specific values
                    smartFilterValues[normalizedCol] = matchingValues;
                    console.log(`✅ ${normalizedCol}: Using matched values:`, matchingValues);
                    allFilterColumns.add(normalizedCol);
                  }
                }
              } else {
                console.log(`⚠️ Column ${normalizedCol} not found in dataset or no unique values`);
              }
            });
          }
        });
        
        console.log('🎯 Smart filter values processed:', smartFilterValues);
        console.log('🎯 Smart filter values details:', Object.entries(smartFilterValues).map(([col, vals]) => ({
          column: col,
          values: vals,
          isEmpty: vals.length === 0,
          isAllSelected: vals.length === 0
        })));
        
        // 🎯 Replicate manual filter setup process with smart values
        let updatedColumnClassifierConfig = columnClassifierConfig;
        let selectedIdentifiers: { [key: string]: string[] } = {};
        let dimensions: string[] = [];
        
        if (allFilterColumns.size > 0 && columnClassifierConfig) {
          // Step 1: Update columnClassifierConfig.dimensions like manual does
          const newDimensions = { ...columnClassifierConfig.dimensions };
          allFilterColumns.forEach(col => {
            newDimensions[col] = [col];  // Same format as manual handleAddFilters()
          });
          
          updatedColumnClassifierConfig = {
            ...columnClassifierConfig,
            dimensions: newDimensions
          };
          
          // Step 2: Create selectedIdentifiers like manual does
          allFilterColumns.forEach(col => {
            selectedIdentifiers[col] = [col];
          });
          
          // Step 3: Create dimensions array like manual does
          dimensions = Array.from(allFilterColumns);
          
          console.log('🔧 Manual filter setup replicated with smart values:', {
            filterColumns: Array.from(allFilterColumns),
            smartFilterValues: smartFilterValues,
            updatedDimensions: newDimensions,
            selectedIdentifiers: selectedIdentifiers
          });
        }
        
        // 🔧 FIX: Only filter out explorations with explicit errors, keep all others
        const validExplorations = result.explorations?.filter((exp: any, idx: number) => {
          // Only filter out if there's an explicit error or completely missing required fields
          const hasError = exp.error && exp.error.trim() !== '';
          const hasRequiredFields = exp.x_axis && exp.y_axis;
          
          const isValid = !hasError && hasRequiredFields;
          
          if (!isValid) {
            console.log(`⚠️ Filtering out invalid exploration ${idx + 1}:`, {
              hasError: !!hasError,
              hasRequiredFields,
              error: exp.error,
              title: exp.title,
              x_axis: exp.x_axis,
              y_axis: exp.y_axis
            });
          } else {
            console.log(`✅ Keeping exploration ${idx + 1}:`, {
              title: exp.title,
              x_axis: exp.x_axis,
              y_axis: exp.y_axis,
              hasChartData: !!exp.chart_data,
              dataLength: exp.chart_data?.length || 0
            });
          }
          
          return isValid;
        }) || [];
        
        console.log(`🔧 Filtered explorations: ${result.explorations?.length || 0} → ${validExplorations.length} valid charts`);
        
        // 🔧 FALLBACK: If filtering removed all charts, use original explorations
        const finalExplorations = validExplorations.length > 0 ? validExplorations : (result.explorations || []);
        
        if (validExplorations.length === 0 && result.explorations && result.explorations.length > 0) {
          console.log(`⚠️ All explorations were filtered out, using original explorations as fallback`);
        }
        
        // 🔧 Create chartConfigs with normalized column names (same as manual)
        const chartConfigs = finalExplorations.map((exp: any, idx: number) => {
          const config = {
            xAxis: normalizeColumnName(exp.x_axis),
            yAxes: [normalizeColumnName(exp.y_axis)],
            xAxisLabel: exp.x_axis_label || normalizeColumnName(exp.x_axis),
            yAxisLabels: [exp.y_axis_label || normalizeColumnName(exp.y_axis)],
            chartType: exp.chart_type || 'bar_chart',
            aggregation: exp.aggregation || 'sum',
            weightColumn: normalizeColumnName(exp.weight_column) || '',
            title: exp.title || `Chart ${idx + 1}`,
            legendField: normalizeColumnName(exp.legend_field) || '',
            sortOrder: exp.sort_order || null,
          };
          console.log(`📊 Chart ${idx + 1} config created:`, {
            chartIndex: idx,
            title: config.title,
            xAxis: config.xAxis,
            yAxis: config.yAxes[0],
            chartType: config.chartType
          });
          return config;
        });
        
        console.log('📊 Generated chartConfigs with normalized casing:', chartConfigs);
        console.log('📊 Number of charts generated:', numberOfCharts);
        
        // 🔧 DEBUG: Log each chart config to verify both are created
        chartConfigs.forEach((config, idx) => {
          console.log(`📊 Chart ${idx + 1} config:`, {
            xAxis: config.xAxis,
            yAxis: config.yAxes[0],
            title: config.title,
            chartType: config.chartType
          });
        });
        
        const exploreData = {
          dataframe: targetFile,
          applied: true,  // 🎯 Same as manual Step 3: applied: true makes filters appear
          
          // 🎯 Individual properties for backward compatibility (use first chart)
          chartType: firstExploration?.chart_type || 'bar_chart',
          xAxis: normalizeColumnName(firstExploration?.x_axis),
          yAxis: normalizeColumnName(firstExploration?.y_axis),
          xAxisLabel: firstExploration?.x_axis_label || '',
          yAxisLabel: firstExploration?.y_axis_label || '',
          title: firstExploration?.title || 'AI Generated Chart',
          aggregation: firstExploration?.aggregation || 'sum',
          legendField: normalizeColumnName(firstExploration?.legend_field),
          weightColumn: normalizeColumnName(firstExploration?.weight_column),
          
          // 🎯 Use REAL backend data (same as manual)
          columnClassifierConfig: updatedColumnClassifierConfig,  // ✅ With filter columns
          columnSummary: columnSummary,
          
          // 🎯 Replicate manual filter setup data structure
          selectedIdentifiers: selectedIdentifiers,  // ✅ Same as manual Step 2
          dimensions: dimensions,                    // ✅ Same as manual Step 3
          
          // 🎯 FIX: Proper graph layout for Properties panel (match manual behavior)
          graphLayout: {
            numberOfGraphsInRow: numberOfCharts >= 2 ? 2 : numberOfCharts,
            rows: 1
          },
          
          // 🎯 KEY: Add chartConfigs with correct casing
          chartConfigs: chartConfigs,
            
          // 🎯 Store chart data exactly like manual workflow using final explorations
          chartDataSets: finalExplorations.reduce((acc: any, exp: any, idx: number) => {
            acc[idx] = exp.chart_data;
            console.log(`📊 Chart ${idx + 1} data stored:`, {
              chartIndex: idx,
              hasData: !!exp.chart_data,
              dataLength: exp.chart_data?.length || 0,
              title: exp.title
            });
            return acc;
          }, {}),
          chartGenerated: finalExplorations.reduce((acc: any, exp: any, idx: number) => {
            acc[idx] = true;
            return acc;
          }, {}),
          chartNotes: finalExplorations.reduce((acc: any, exp: any, idx: number) => {
            acc[idx] = exp.ai_note || '';
            return acc;
          }, {}),
          
          // 🎯 Set up smart filter values for EACH chart individually using pre-calculated smartFilterValues
          chartFilters: finalExplorations.reduce((acc: any, exp: any, idx: number) => {
            // Use the pre-calculated smartFilterValues instead of recalculating
            const chartSmartFilters: { [column: string]: string[] } = {};
            
            if (exp.filters && typeof exp.filters === 'object') {
              Object.keys(exp.filters).forEach(filterCol => {
                const normalizedCol = normalizeColumnName(filterCol);
                
                // Use the pre-calculated smart filter values
                if (smartFilterValues[normalizedCol] !== undefined) {
                  chartSmartFilters[normalizedCol] = smartFilterValues[normalizedCol];
                  console.log(`📊 Chart ${idx + 1} - ${normalizedCol}: Using pre-calculated values:`, smartFilterValues[normalizedCol]);
                } else {
                  // Fallback to "All" if not found
                  chartSmartFilters[normalizedCol] = [];
                  console.log(`📊 Chart ${idx + 1} - ${normalizedCol}: No pre-calculated values → "All"`);
                }
              });
            }
            
            acc[idx] = chartSmartFilters;
            return acc;
          }, {}),
          
          chartThemes: {},
          chartOptions: finalExplorations.reduce((acc: any, exp: any, idx: number) => {
            acc[idx] = { grid: true, legend: true, axisLabels: true, dataLabels: true };
            return acc;
          }, {}),
          appliedFilters: Object.keys(smartFilterValues).length > 0 ? 
            finalExplorations.reduce((acc: any, exp: any, idx: number) => {
              acc[idx] = true;  // Mark filters as applied if we have smart filters
              return acc;
            }, {}) : {},
          
          // Store original AI config for reference
          aiConfig: data,
          aiMessage: data.message,
          exploration_config: data.exploration_config,
          operationCompleted: true
        };
        
        console.log('📊 Final exploreData with manual filter setup and REAL backend config:', exploreData);
        console.log('📊 Chart data sets:', exploreData.chartDataSets);
        console.log('📊 Chart configs:', exploreData.chartConfigs);
        console.log('📊 Chart generated flags:', exploreData.chartGenerated);
        
        // 🔧 CRITICAL FIX: Merge with existing state instead of overwriting
        const currentAtom = useLaboratoryStore.getState().getAtom(atomId);
        const currentData = currentAtom?.settings?.data || {};
        
        const mergedData = {
          ...currentData,  // ✅ Preserve ALL existing manual settings
          
          // Only override specific AI-generated properties
          dataframe: exploreData.dataframe,
          applied: exploreData.applied,
          
          // Merge column configurations carefully
          columnClassifierConfig: {
            ...(currentData.columnClassifierConfig || {}),
            ...(exploreData.columnClassifierConfig || {}),
            dimensions: {
              ...(currentData.columnClassifierConfig?.dimensions || {}),
              ...(exploreData.columnClassifierConfig?.dimensions || {})
            }
          },
          
          columnSummary: exploreData.columnSummary || currentData.columnSummary,
          
          // Merge filter setup without overwriting manual filters
          selectedIdentifiers: {
            ...(currentData.selectedIdentifiers || {}),
            ...(exploreData.selectedIdentifiers || {})
          },
          
          dimensions: Array.from(new Set([
            ...(currentData.dimensions || []),
            ...(exploreData.dimensions || [])
          ])),
          
          // 🔧 CRITICAL FIX: Preserve manual chart filters and merge with AI filters
          chartFilters: {
            ...(currentData.chartFilters || {}),
            ...(exploreData.chartFilters || {})
          },
          
          // 🔧 FIX: Use AI chart data completely when AI generates charts
          chartDataSets: exploreData.chartDataSets || {},
          
          chartGenerated: exploreData.chartGenerated || {},
          
          chartNotes: exploreData.chartNotes || {},
          
          // 🔧 FIX: Use AI chartConfigs completely when AI generates charts
          chartConfigs: exploreData.chartConfigs || [],
          
          // Preserve other manual settings
          graphLayout: exploreData.graphLayout || currentData.graphLayout,
          
          // Store AI config without overriding manual data
          aiConfig: exploreData.aiConfig,
          operationCompleted: exploreData.operationCompleted
        };
        
        console.log('🔧 Merging AI data with existing manual state (preserving manual functionality):', {
          currentKeys: Object.keys(currentData),
          aiKeys: Object.keys(exploreData),
          mergedKeys: Object.keys(mergedData),
          preservedManualChartConfigs: !!currentData.chartConfigs?.length,
          aiChartCount: exploreData.chartConfigs?.length || 0,
          currentChartCount: currentData.chartConfigs?.length || 0,
          finalChartCount: mergedData.chartConfigs?.length || 0
        });
        
        // 🔧 DEBUG: Log chart counts to identify extra chart creation
        console.log('📊 Chart Count Debug:', {
          aiExplorations: result.explorations?.length || 0,
          validExplorations: validExplorations.length,
          finalExplorations: finalExplorations.length,
          aiChartConfigs: exploreData.chartConfigs?.length || 0,
          currentChartConfigs: currentData.chartConfigs?.length || 0,
          finalChartConfigs: mergedData.chartConfigs?.length || 0,
          chartDataSetsKeys: Object.keys(mergedData.chartDataSets || {}),
          chartGeneratedKeys: Object.keys(mergedData.chartGenerated || {})
        });
        
    updateAtomSettings(atomId, { 
          data: mergedData  // ✅ Merged data instead of overwriting
        });
        
        // Add completion message ONLY if smart_response wasn't already shown
        if (!showedSmartResponse) {
          const completionContent = (finalExplorations.length > 1 
            ? `I've successfully generated ${finalExplorations.length} complementary charts for your analysis. These visualizations will provide different perspectives on your data, allowing you to identify patterns, trends, and relationships. You can use the 2-chart layout to view both visualizations simultaneously for better comparison.`
            : `I've successfully generated your chart analysis. The visualization is now ready and will help you understand the patterns and insights in your data. You can click to view the chart and explore the findings.`);
          const completionMsg: Message = {
            id: (Date.now() + 2).toString(),
            content: completionContent,
            sender: 'ai',
            timestamp: new Date(),
          };
          setMessages(prev => [...prev, completionMsg]);
        }
        
      } catch (configError: any) {
        console.error('❌ Failed to fetch column config:', configError);
        
        // Fallback: Use basic exploreData without column config
        const result = { explorations: processedResults || [] };
        const firstExploration = result.explorations?.[0];
        
        // Define normalizeColumnName function for fallback case
        const normalizeColumnName = (colName: string) => {
          if (!colName || typeof colName !== 'string') return '';
          return colName.toLowerCase();
        };
        
        const exploreData = {
      dataframe: targetFile,
      applied: true,
          chartType: firstExploration?.chart_type || 'bar_chart',
          xAxis: normalizeColumnName(firstExploration?.x_axis),
          yAxis: normalizeColumnName(firstExploration?.y_axis),
          title: firstExploration?.title || 'AI Generated Chart',
          aggregation: firstExploration?.aggregation || 'sum',
          
          chartDataSets: result.explorations?.reduce((acc: any, exp: any, idx: number) => {
            acc[idx] = exp.chart_data || [];
            return acc;
          }, {}),
          chartGenerated: result.explorations?.reduce((acc: any, exp: any, idx: number) => {
            acc[idx] = true;
            return acc;
          }, {}),
          
          aiConfig: data,
          operationCompleted: true
        };
        
        updateAtomSettings(atomId, {
          data: exploreData
        });
        
        // Note: Completion message already added above
      }
          
    } catch (error: any) {
      console.error('❌ AI exploration via manual flow failed:', error);
      
      // 🔧 CRITICAL FIX: Add more specific error handling based on error type
      let errorMessage = `❌ Failed to process exploration: ${error.message || 'Unknown error'}`;
      
      if (error.message?.includes('normalizeColumnName is not defined')) {
        errorMessage = `❌ Configuration error: Column processing failed. Please try again.`;
      } else if (error.message?.includes('toLowerCase is not a function')) {
        errorMessage = `❌ Data processing error: Invalid column data format. Please check your data file.`;
      } else if (error.message?.includes('Failed to fetch')) {
        errorMessage = `❌ Network error: Could not connect to backend services. Please try again.`;
      }
      
      // Only add error message if no smart_response was already added
      if (!data.smart_response) {
        const errorMsg: Message = {
          id: (Date.now() + 2).toString(),
          content: `${errorMessage} Please try again or use the manual configuration options to set up your analysis.`,
          sender: 'ai',
          timestamp: new Date(),
        };
        setMessages(prev => [...prev, errorMsg]);
      }
      
      updateAtomSettings(atomId, {
        dataframe: targetFile,
        applied: false,
      aiConfig: data,
      aiMessage: data.message,
      exploration_config: data.exploration_config,
        operationCompleted: false
      });
    }

    return { success: true };
  },

  handleFailure: async (data: any, context: AtomHandlerContext): Promise<AtomHandlerResponse> => {
    const { setMessages, updateAtomSettings, atomId } = context;
    
    // Process smart response with enhanced logic
    const aiText = processSmartResponse(data);
    
    // Create and add AI message
    const aiMsg = createMessage(aiText);
    setMessages(prev => [...prev, aiMsg]);
    
    // Store suggestions for potential use
    if (data.suggestions || data.next_steps || data.file_analysis) {
      updateAtomSettings(atomId, {
        aiSuggestions: data.suggestions || [],
        aiNextSteps: data.next_steps || [],
        recommendedChartTypes: data.recommended_chart_types || [],
        recommendedColumns: data.recommended_columns || [],
        fileAnalysis: data.file_analysis || null,
        lastInteractionTime: Date.now()
      });
    }
    
    return { success: true };
  }
};