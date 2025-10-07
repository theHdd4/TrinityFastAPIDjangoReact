import { GROUPBY_API } from '@/lib/api';
import { useLaboratoryStore } from '@/components/LaboratoryMode/store/laboratoryStore';
import { AtomHandler, AtomHandlerContext, AtomHandlerResponse, Message } from './types';
import { 
  getEnvironmentContext, 
  getFilename, 
  createMessage, 
  createSuccessMessage, 
  createErrorMessage,
  processSmartResponse,
  executePerformOperation,
  validateFileInput,
  createProgressTracker 
} from './utils';

export const groupbyHandler: AtomHandler = {
  handleSuccess: async (data: any, context: AtomHandlerContext): Promise<AtomHandlerResponse> => {
    const { atomId, updateAtomSettings, setMessages, sessionId } = context;
    
    // 🔧 FIX: Show smart_response in handleSuccess for success cases
    // handleFailure will handle failure cases
    const smartResponseText = processSmartResponse(data);
    console.log('💬 Smart response text available:', smartResponseText ? 'Yes' : 'No');
    console.log('🔍 Has groupby_json:', !!data.groupby_json);
    
    // Show smart_response for success cases (when groupby_json exists)
    if (smartResponseText) {
      const smartMsg: Message = {
        id: (Date.now() + 1).toString(),
        content: smartResponseText,
        sender: 'ai',
        timestamp: new Date(),
      };
      console.log('📤 Sending smart response message to chat...');
      setMessages(prev => [...prev, smartMsg]);
      console.log('✅ Displayed smart_response to user:', smartResponseText);
    }
    
    if (!data.groupby_json) {
      return { success: false, error: 'No groupby configuration found in AI response' };
    }

    const cfg = data.groupby_json;
    console.log('🤖 AI GROUPBY CONFIG EXTRACTED:', cfg, 'Session:', sessionId);
    console.log('🔍 AI CONFIG DETAILS:', {
      object_names: cfg.object_names,
      file_name: cfg.file_name,
      file_key: cfg.file_key,
      identifiers: cfg.identifiers,
      aggregations: cfg.aggregations
    });
    
    // 🔧 CRITICAL FIX: Automatically populate GroupBy settings with AI configuration
    const aiSelectedIdentifiers = cfg.identifiers || [];
    const aiSelectedMeasures: any[] = [];
    
    // 🔧 FIX: Ensure we have a single file, not multiple files
    let singleFileName = '';
    
    // Try multiple possible fields from AI response
    const possibleFileFields = [
      cfg.object_names,
      cfg.file_name,
      cfg.file_key,
      cfg.source_file
    ].filter(Boolean);
    
    if (possibleFileFields.length > 0) {
      singleFileName = possibleFileFields[0];
      // If object_names contains multiple files (comma-separated), take only the first one
      if (singleFileName.includes(',')) {
        singleFileName = singleFileName.split(',')[0].trim();
        console.log('🔧 Multiple files detected, using first file:', singleFileName);
      }
      console.log('🔧 Using file path from AI response:', singleFileName);
    }
    
    // 🔧 CRITICAL FIX: If AI didn't provide a real file path, try to get it from atom settings
    if (!singleFileName || singleFileName === 'your_file.csv' || singleFileName === 'N/A') {
      console.log('⚠️ AI provided placeholder filename, trying to get real file path from atom settings');
      
      // Try to get the real data source from the current atom settings
      const currentAtom = useLaboratoryStore.getState().getAtom(atomId);
      const realDataSource = currentAtom?.settings?.dataSource;
      
      if (realDataSource && realDataSource !== 'your_file.csv' && realDataSource !== 'N/A') {
        singleFileName = realDataSource;
        console.log('✅ Using real file path from atom settings:', singleFileName);
      } else {
        // Still no real file path - show error and don't proceed
        const errorMsg = createErrorMessage(
          'GroupBy configuration',
          `No valid file path found. AI provided: ${cfg.object_names || 'N/A'}, Atom settings: ${realDataSource || 'N/A'}`,
          'File validation'
        );
        errorMsg.content += '\n\n💡 Please ensure you have selected a data file before using AI GroupBy.';
        setMessages(prev => [...prev, errorMsg]);
        
        updateAtomSettings(atomId, { 
          aiConfig: cfg,
          aiMessage: data.message,
          operationCompleted: false,
          selectedIdentifiers: aiSelectedIdentifiers,
          selectedMeasures: aiSelectedMeasures,
          selectedMeasureNames: aiSelectedMeasures.map(m => m.field),
          selectedAggregationMethods: ['Sum', 'Mean', 'Min', 'Max', 'Count', 'Median', 'Weighted Mean', 'Rank Percentile'],
          dataSource: '',
          bucketName: cfg.bucket_name || 'trinity'
        });
        
        return { success: false, error: 'No valid file path found' };
      }
    }
    
    // Convert AI aggregations to selectedMeasures format
    if (cfg.aggregations && typeof cfg.aggregations === 'object') {
      Object.entries(cfg.aggregations).forEach(([field, aggConfig]: [string, any]) => {
        if (typeof aggConfig === 'object' && aggConfig !== null) {
          const agg = aggConfig.agg;
          if (agg) {
            aiSelectedMeasures.push({
              field: field,
              aggregator: agg === 'sum' ? 'Sum' : 
                          agg === 'mean' ? 'Mean' : 
                          agg === 'min' ? 'Min' : 
                          agg === 'max' ? 'Max' : 
                          agg === 'count' ? 'Count' : 
                          agg === 'median' ? 'Median' : 
                          agg === 'weighted_mean' ? 'Weighted Mean' : 
                          agg === 'rank_pct' ? 'Rank Percentile' : 'Sum',
              weight_by: aggConfig.weight_by || '',
              rename_to: aggConfig.rename_to || field
            });
          }
        } else if (typeof aggConfig === 'string') {
          aiSelectedMeasures.push({
            field: field,
            aggregator: aggConfig === 'sum' ? 'Sum' : 
                        aggConfig === 'mean' ? 'Mean' : 
                        aggConfig === 'min' ? 'Min' : 
                        aggConfig === 'max' ? 'Max' : 
                        aggConfig === 'count' ? 'Count' : 
                        aggConfig === 'median' ? 'Median' : 
                        aggConfig === 'weighted_mean' ? 'Weighted Mean' : 
                        aggConfig === 'rank_pct' ? 'Rank Percentile' : 'Sum',
            weight_by: '',
            rename_to: field
          });
        }
      });
    }
    
    // Default aggregation if none specified
    if (aiSelectedMeasures.length === 0 && aiSelectedIdentifiers.length > 0) {
      aiSelectedMeasures.push({
        field: 'volume',
        aggregator: 'Sum',
        weight_by: '',
        rename_to: 'total_volume'
      });
    }
    
    console.log('🔧 AUTO-POPULATED GROUPBY SETTINGS:', {
      selectedIdentifiers: aiSelectedIdentifiers,
      selectedMeasures: aiSelectedMeasures,
      singleFileName: singleFileName
    });
    
    // 🔧 CRITICAL FIX: Final validation - ensure we have a valid file path
    if (!singleFileName || singleFileName === 'your_file.csv' || singleFileName === 'N/A') {
      const errorMsg = createErrorMessage(
        'GroupBy configuration',
        `Invalid file path: ${singleFileName}`,
        'File validation'
      );
      errorMsg.content += '\n\n💡 Please ensure you have selected a valid data file before using AI GroupBy.';
      setMessages(prev => [...prev, errorMsg]);
      return { success: false, error: 'Invalid file path' };
    }
    
    // Get environment context
    const envContext = getEnvironmentContext();
    console.log('🔍 Environment context loaded:', envContext);
    
    // Update atom settings with the AI configuration and auto-populated options
    updateAtomSettings(atomId, { 
      aiConfig: cfg,
      aiMessage: data.message,
      operationCompleted: false,
      // Auto-populate the interface
      selectedIdentifiers: aiSelectedIdentifiers,
      selectedMeasures: aiSelectedMeasures,
      selectedMeasureNames: aiSelectedMeasures.map(m => m.field),
      // Set default aggregation methods
      selectedAggregationMethods: ['Sum', 'Mean', 'Min', 'Max', 'Count', 'Median', 'Weighted Mean', 'Rank Percentile'],
      // Set data source if available - use single file only
      dataSource: singleFileName || cfg.file_key || '',
      // Set bucket name
      bucketName: cfg.bucket_name || 'trinity',
      // Include environment context
      envContext,
      lastUpdateTime: Date.now()
    });
    
    // Add AI success message with operation completion
    const successDetails = {
      'File': singleFileName || 'N/A',
      'Identifiers': cfg.identifiers?.join(', ') || 'N/A',
      'Aggregations': aiSelectedMeasures.map(m => `${m.field} (${m.aggregator})`).join(', '),
      'Session': sessionId
    };
    const successMsg = createSuccessMessage('AI groupby configuration completed', successDetails);
    successMsg.content += '\n\n🔄 Now executing the groupby operation...';
    setMessages(prev => [...prev, successMsg]);
    
    // 🔧 CRITICAL FIX: Automatically call perform endpoint with AI configuration and validate real results
    try {
      if (GROUPBY_API) {
        const performEndpoint = `${GROUPBY_API}/run`;
        console.log('🚀 Calling groupby perform endpoint with AI config:', { 
          singleFileName, 
          aiSelectedIdentifiers, 
          aiSelectedMeasures 
        });
        
        // Convert to FormData format that GroupBy backend expects
        const formData = new URLSearchParams({
          validator_atom_id: atomId, // 🔧 CRITICAL: Add required validator_atom_id
          file_key: getFilename(singleFileName), // 🔧 CRITICAL: Add required file_key
          object_names: getFilename(singleFileName),
          bucket_name: cfg.bucket_name || 'trinity',
          identifiers: JSON.stringify(aiSelectedIdentifiers),
          aggregations: JSON.stringify(aiSelectedMeasures.reduce((acc, m) => {
            // 🔧 CRITICAL FIX: Convert to backend-expected format
            // Backend expects: { "field_name": { "agg": "sum", "weight_by": "", "rename_to": "" } }
            acc[m.field] = {
              agg: m.aggregator.toLowerCase(),
              weight_by: m.weight_by || '',
              rename_to: m.rename_to || m.field
            };
            return acc;
          }, {})),
          // Include session context for tracking
          session_id: sessionId,
          // Include environment context for path resolution
          client_name: envContext.client_name,
          app_name: envContext.app_name,
          project_name: envContext.project_name
        });
        
        console.log('📁 Sending groupby data to backend:', {
          validator_atom_id: atomId,
          file_key: getFilename(singleFileName),
          object_names: getFilename(singleFileName),
          bucket_name: cfg.bucket_name || 'trinity',
          identifiers: aiSelectedIdentifiers,
          aggregations: aiSelectedMeasures.reduce((acc, m) => {
            acc[m.field] = {
              agg: m.aggregator.toLowerCase(),
              weight_by: m.weight_by || '',
              rename_to: m.rename_to || m.field
            };
            return acc;
          }, {}),
          session_id: sessionId
        });
        
        const result = await executePerformOperation(performEndpoint, formData, {
          method: 'POST',
          contentType: 'application/x-www-form-urlencoded'
        });
        
        if (result.success && result.data) {
          console.log('✅ GroupBy operation successful:', result.data);
          
          // 🔧 CRITICAL FIX: Backend has completed and saved the file
          // Now we need to retrieve the actual results from the saved file
          if (result.data.status === 'SUCCESS' && result.data.result_file) {
            console.log('🔄 Backend operation completed, retrieving results from saved file:', result.data.result_file);
          
            // 🔧 FIX: Retrieve results from the saved file using the cached_dataframe endpoint
            try {
              const cachedRes = await fetch(`${GROUPBY_API}/cached_dataframe?object_name=${encodeURIComponent(result.data.result_file)}`);
              if (cachedRes.ok) {
                const csvText = await cachedRes.text();
                console.log('📄 Retrieved CSV data from saved file, length:', csvText.length);
                
                // Parse CSV to get actual results
                const lines = csvText.split('\n');
                if (lines.length > 1) {
                  const headers = lines[0].split(',').map(h => h.trim().replace(/"/g, ''));
                  const rows = lines.slice(1).filter(line => line.trim()).map(line => {
                    const values = line.split(',').map(v => v.trim().replace(/"/g, ''));
                    const row: any = {};
                    headers.forEach((header, index) => {
                      row[header] = values[index] || '';
                    });
                    return row;
                  });
                  
                  console.log('✅ Successfully parsed results from saved file:', {
                    rowCount: rows.length,
                    columns: headers.length,
                    sampleData: rows.slice(0, 2)
                  });
                  
                  // ✅ REAL RESULTS AVAILABLE - Update atom settings with actual data
                  updateAtomSettings(atomId, {
                    selectedIdentifiers: aiSelectedIdentifiers,
                    selectedMeasures: aiSelectedMeasures,
                    selectedMeasureNames: aiSelectedMeasures.map(m => m.field),
                    selectedAggregationMethods: ['Sum', 'Mean', 'Min', 'Max', 'Count', 'Median', 'Weighted Mean', 'Rank Percentile'],
                    dataSource: singleFileName || cfg.file_key || '',
                    bucketName: cfg.bucket_name || 'trinity',
                    groupbyResults: {
                      ...result.data,
                      // 🔧 CRITICAL: Store the actual grouped data from saved file
                      unsaved_data: rows,
                      result_file: result.data.result_file,
                      row_count: rows.length,
                      columns: headers
                    },
                    operationCompleted: true,
                    lastUpdateTime: Date.now()
                  });
                  
                  // ✅ SUCCESS MESSAGE WITH REAL DATA FROM SAVED FILE
                  const completionDetails = {
                    'Result File': result.data.result_file,
                    'Rows': rows.length.toLocaleString(),
                    'Columns': headers.length
                  };
                  const completionMsg = createSuccessMessage('GroupBy operation', completionDetails);
                  completionMsg.content += '\n\n📊 Results are ready! The data has been grouped and saved.\n\n💡 You can now view the results in the GroupBy interface - no need to click Perform again!';
                  setMessages(prev => [...prev, completionMsg]);
                
              } else {
                throw new Error('No data rows found in CSV');
              }
            } else {
              throw new Error(`Failed to fetch cached results: ${cachedRes.status}`);
            }
          } catch (fetchError) {
            console.error('❌ Error fetching results from saved file:', fetchError);
            
            updateAtomSettings(atomId, {
              selectedIdentifiers: aiSelectedIdentifiers,
              selectedMeasures: aiSelectedMeasures,
              selectedMeasureNames: aiSelectedMeasures.map(m => m.field),
              selectedAggregationMethods: ['Sum', 'Mean', 'Min', 'Max', 'Count', 'Median', 'Weighted Mean', 'Rank Percentile'],
              dataSource: singleFileName || cfg.file_key || '',
              bucketName: cfg.bucket_name || 'trinity',
              groupbyResults: {
                ...result.data,
                result_file: result.data.result_file,
                row_count: result.data.row_count || 0,
                columns: result.data.columns || []
              },
              operationCompleted: true
            });
            
            const warningDetails = {
              'Result File': result.data.result_file,
              'Rows': result.data.row_count || 'Unknown',
              'Columns': result.data.columns?.length || 'Unknown'
            };
            const warningMsg = createErrorMessage(
              'GroupBy operation completed and file saved, but results display failed',
              'Could not retrieve results for display',
              Object.entries(warningDetails).map(([k,v]) => `${k}: ${v}`).join(', ')
            );
            warningMsg.content += '\n\n📁 File has been saved successfully. Please click the Perform button to view the results.';
            setMessages(prev => [...prev, warningMsg]);
          }
          
          } else {
            // ❌ Backend operation failed
            console.error('❌ GroupBy backend operation failed:', result.data);
            
            updateAtomSettings(atomId, {
              selectedIdentifiers: aiSelectedIdentifiers,
              selectedMeasures: aiSelectedMeasures,
              selectedMeasureNames: aiSelectedMeasures.map(m => m.field),
              selectedAggregationMethods: ['Sum', 'Mean', 'Min', 'Max', 'Count', 'Median', 'Weighted Mean', 'Rank Percentile'],
              dataSource: singleFileName || cfg.file_key || '',
              bucketName: cfg.bucket_name || 'trinity',
              operationCompleted: false
            });
            
            const errorMsg = createErrorMessage(
              'GroupBy operation',
              result.data.error || 'Unknown error',
              `File: ${singleFileName}, Identifiers: ${aiSelectedIdentifiers.join(', ')}, Measures: ${aiSelectedMeasures.map(m => `${m.field} (${m.aggregator})`).join(', ')}`
            );
            errorMsg.content += '\n\n💡 Please check your configuration and try clicking the Perform button manually.';
            setMessages(prev => [...prev, errorMsg]);
          }
        } else {
          console.error('❌ GroupBy operation failed:', result.error);
          
          const errorMsg = createErrorMessage(
            'GroupBy operation',
            result.error || 'Unknown error',
            `File: ${singleFileName}, Identifiers: ${aiSelectedIdentifiers.join(', ')}, Measures: ${aiSelectedMeasures.map(m => `${m.field} (${m.aggregator})`).join(', ')}`
          );
          errorMsg.content += '\n\n💡 Please check your configuration and try clicking the Perform button manually.';
          setMessages(prev => [...prev, errorMsg]);
          
          updateAtomSettings(atomId, {
            selectedIdentifiers: aiSelectedIdentifiers,
            selectedMeasures: aiSelectedMeasures,
            selectedMeasureNames: aiSelectedMeasures.map(m => m.field),
            selectedAggregationMethods: ['Sum', 'Mean', 'Min', 'Max', 'Count', 'Median', 'Weighted Mean', 'Rank Percentile'],
            dataSource: singleFileName || cfg.file_key || '',
            bucketName: cfg.bucket_name || 'trinity',
            operationCompleted: false
          });
        }
      }
    } catch (error) {
      console.error('❌ Error calling groupby perform endpoint:', error);
      
      const errorMsg = createErrorMessage(
        'GroupBy operation',
        error,
        `File: ${singleFileName}, Identifiers: ${aiSelectedIdentifiers.join(', ')}, Measures: ${aiSelectedMeasures.map(m => `${m.field} (${m.aggregator})`).join(', ')}`
      );
      errorMsg.content += '\n\n💡 Please try clicking the Perform button manually.';
      setMessages(prev => [...prev, errorMsg]);
      
      updateAtomSettings(atomId, {
        selectedIdentifiers: aiSelectedIdentifiers,
        selectedMeasures: aiSelectedMeasures,
        selectedMeasureNames: aiSelectedMeasures.map(m => m.field),
        selectedAggregationMethods: ['Sum', 'Mean', 'Min', 'Max', 'Count', 'Median', 'Weighted Mean', 'Rank Percentile'],
        dataSource: singleFileName || cfg.file_key || '',
        bucketName: cfg.bucket_name || 'trinity',
        operationCompleted: false,
        lastError: (error as Error).message
      });
    }

    return { success: true };
  },

  handleFailure: async (data: any, context: AtomHandlerContext): Promise<AtomHandlerResponse> => {
    const { setMessages, atomId, updateAtomSettings } = context;
    
    // 🔧 FIX: This function now handles BOTH success and failure cases
    // Always show the smart_response message once, regardless of success/failure
    let aiText = '';
    if (data.smart_response) {
      aiText = data.smart_response;
    } else if (data.suggestions && Array.isArray(data.suggestions)) {
      aiText = `${data.message || 'Here\'s what I can help you with:'}\n\n${data.suggestions.join('\n\n')}`;
      
      if (data.file_analysis) {
        aiText += `\n\n📊 File Analysis:\n`;
        if (data.file_analysis.total_files) {
          aiText += `• Total files available: ${data.file_analysis.total_files}\n`;
        }
        if (data.file_analysis.groupby_tips && data.file_analysis.groupby_tips.length > 0) {
          aiText += `• Tips: ${data.file_analysis.groupby_tips.join(', ')}\n`;
        }
      }
      
      if (data.next_steps && data.next_steps.length > 0) {
        aiText += `\n\n🎯 Next Steps:\n${data.next_steps.map((step: string, idx: number) => `${idx + 1}. ${step}`).join('\n')}`;
      }
    } else {
      aiText = data.smart_response || data.message || 'AI response received';
    }
    
    // Only add the message if we have content
    if (aiText) {
      const aiMsg: Message = {
        id: (Date.now() + 1).toString(),
        content: aiText,
        sender: 'ai',
        timestamp: new Date(),
      };
      setMessages(prev => [...prev, aiMsg]);
      console.log('📤 Added AI message to chat:', aiText.substring(0, 100) + '...');
    }
    
    // 🔧 CRITICAL FIX: Load available files into atom settings for dropdown population
    // This ensures files appear in the groupby interface even for failure cases
    if (data.available_files && typeof data.available_files === 'object') {
      console.log('📁 Loading available files into atom settings for groupby interface');
      console.log('📋 Available files:', Object.keys(data.available_files));
      
      // Update atom settings with available files
      updateAtomSettings(atomId, {
        availableFiles: data.available_files,
        fileSuggestions: data.suggestions || [],
        nextSteps: data.next_steps || [],
        recommendedAggregations: data.recommended_aggregations || [],
        recommendedIdentifiers: data.recommended_identifiers || [],
        fileAnalysis: data.file_analysis || null,
        lastUpdateTime: Date.now()
      });
      
      console.log('✅ Files loaded into groupby interface');
    }
    
    return { success: true };
  }
};
