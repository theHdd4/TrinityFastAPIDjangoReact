import { GROUPBY_API, VALIDATE_API } from '@/lib/api';
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
  createProgressTracker,
  autoSaveStepResult,
  formatAgentResponseForTextBox,
  updateCardTextBox
} from './utils';
import { generateAndFormatInsight } from './insightGenerator';

const normalizeColumnName = (value: string | undefined | null) => {
  if (!value || typeof value !== 'string') return '';
  return value.trim().toLowerCase();
};

const toBackendAggregation = (agg: string) => {
  const key = (agg || '').toLowerCase();
  switch (key) {
    case 'weighted mean':
      return 'weighted_mean';
    case 'rank percentile':
      return 'rank_pct';
    default:
      return key;
  }
};

export const groupbyHandler: AtomHandler = {
  handleSuccess: async (data: any, context: AtomHandlerContext): Promise<AtomHandlerResponse> => {
    const { atomId, updateAtomSettings, setMessages, sessionId, isStreamMode = false, stepAlias } = context;
    
    // 🔧 FIX: Show smart_response in handleSuccess for success cases
    // handleFailure will handle failure cases
    // Only show messages in Individual AI mode (not in Stream AI mode)
    const smartResponseText = processSmartResponse(data);
    console.log('💬 Smart response text available:', smartResponseText ? 'Yes' : 'No');
    console.log('🔍 Has groupby_json:', !!data.groupby_json);
    console.log('🔍 Is Stream Mode:', isStreamMode);
    
    // Show smart_response for success cases (when groupby_json exists) - only in Individual AI
    if (smartResponseText && !isStreamMode) {
      const smartMsg: Message = {
        id: (Date.now() + 1).toString(),
        content: smartResponseText,
        sender: 'ai',
        timestamp: new Date(),
      };
      console.log('📤 Sending smart response message to chat (Individual AI)...');
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
    const aiSelectedIdentifiers = Array.isArray(cfg.identifiers)
      ? cfg.identifiers.map((id: string) => normalizeColumnName(id)).filter(Boolean)
      : [];
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

    // Attempt to map AI-provided filename to latest saved object (handles timestamped auto-saves)
    if (singleFileName) {
      try {
        const framesResponse = await fetch(`${VALIDATE_API}/list_saved_dataframes`);
        if (framesResponse.ok) {
          const framesData = await framesResponse.json();
          const frames = Array.isArray(framesData.files) ? framesData.files : [];

          const mapFilePathToObjectName = (aiFilePath: string) => {
            if (!aiFilePath) return aiFilePath;

            // Exact match
            let exactMatch = frames.find(f => f.object_name === aiFilePath);
            if (exactMatch) {
              return exactMatch.object_name;
            }

            const aiFileName = aiFilePath.includes('/') ? aiFilePath.split('/').pop() : aiFilePath;
            const aiFileNameLower = aiFileName?.toLowerCase() || '';

            // Filename match
            let filenameMatch = frames.find(f => {
              const frameFileName = (f.object_name?.split('/').pop() || f.csv_name?.split('/').pop() || '').toLowerCase();
              return frameFileName === aiFileNameLower;
            });
            if (filenameMatch) {
              return filenameMatch.object_name;
            }

            // Partial match
            let partialMatch = frames.find(f => {
              const objectLower = (f.object_name || '').toLowerCase();
              const csvLower = (f.csv_name || '').toLowerCase();
              return objectLower.includes(aiFileNameLower) || csvLower.includes(aiFileNameLower);
            });
            if (partialMatch) {
              return partialMatch.object_name;
            }

            // Alias match by base name (handle timestamp suffix)
            const aiBaseName = aiFileName ? aiFileName.replace(/\.[^.]+$/, '') : '';
            if (aiBaseName) {
              let aliasMatch = frames.find(f => {
                const candidate =
                  (f.object_name?.split('/').pop() ||
                    f.csv_name?.split('/').pop() ||
                    '').replace(/\.[^.]+$/, '');
                return candidate.startsWith(aiBaseName);
              });

              if (aliasMatch) {
                return aliasMatch.object_name;
              }
            }

            return aiFilePath;
          };

          const mapped = mapFilePathToObjectName(singleFileName);
          if (mapped !== singleFileName) {
            console.log('🔄 Mapped AI file path to available object for groupby:', {
              original: singleFileName,
              mapped
            });
            singleFileName = mapped;
          }
        }
      } catch (fileMapError) {
        console.warn('⚠️ Failed to map AI groupby file path to available files:', fileMapError);
      }
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
        if (!isStreamMode) {
          const errorMsg = createErrorMessage(
            'GroupBy configuration',
            `No valid file path found. AI provided: ${cfg.object_names || 'N/A'}, Atom settings: ${realDataSource || 'N/A'}`,
            'File validation'
          );
          errorMsg.content += '\n\n💡 Please ensure you have selected a data file before using AI GroupBy.';
          setMessages(prev => [...prev, errorMsg]);
        }
        
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
        const normalizedField = normalizeColumnName(field);
        if (!normalizedField) {
          return;
        }

        if (typeof aggConfig === 'object' && aggConfig !== null) {
          const agg = aggConfig.agg;
          if (agg) {
            const normalizedWeight = aggConfig.weight_by ? normalizeColumnName(aggConfig.weight_by) : '';
            aiSelectedMeasures.push({
              field: normalizedField,
          aggregator: agg === 'sum' ? 'Sum' : 
                      agg === 'mean' ? 'Mean' : 
                      agg === 'min' ? 'Min' : 
                      agg === 'max' ? 'Max' : 
                      agg === 'count' ? 'Count' : 
                      agg === 'median' ? 'Median' : 
                      agg === 'weighted_mean' ? 'Weighted Mean' : 
                      agg === 'rank_pct' ? 'Rank Percentile' : 'Sum',
              weight_by: normalizedWeight,
              rename_to: aggConfig.rename_to || normalizedField
            });
          }
        } else if (typeof aggConfig === 'string') {
          aiSelectedMeasures.push({
            field: normalizedField,
            aggregator: aggConfig === 'sum' ? 'Sum' : 
                        aggConfig === 'mean' ? 'Mean' : 
                        aggConfig === 'min' ? 'Min' : 
                        aggConfig === 'max' ? 'Max' : 
                        aggConfig === 'count' ? 'Count' : 
                        aggConfig === 'median' ? 'Median' : 
                        aggConfig === 'weighted_mean' ? 'Weighted Mean' : 
                        aggConfig === 'rank_pct' ? 'Rank Percentile' : 'Sum',
            weight_by: '',
            rename_to: normalizedField
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
      if (!isStreamMode) {
        const errorMsg = createErrorMessage(
          'GroupBy configuration',
          `Invalid file path: ${singleFileName}`,
          'File validation'
        );
        errorMsg.content += '\n\n💡 Please ensure you have selected a valid data file before using AI GroupBy.';
        setMessages(prev => [...prev, errorMsg]);
      }
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
    
    // 🔍 Generate insight for this atom step (explicitly call LLM)
    console.log('🔍 Generating insight for groupby-wtg-avg atom...');
    generateAndFormatInsight({
      data,
      atomType: 'groupby-wtg-avg',
      sessionId,
    }).then(async (result) => {
      console.log('✅ Insight generated by LLM:', result.insight);
      
      // Add insight as a message to the chat box (only in Individual AI mode)
      if (result.insight && !isStreamMode) {
        const insightMessage: Message = {
          id: `insight-${Date.now()}`,
          content: `**Insight:**\n${result.insight}`,
          sender: 'ai',
          timestamp: new Date(),
        };
        setMessages(prev => [...prev, insightMessage]);
        console.log('✅ Insight added to chat box');
      }
      
      // Update card's text box with formatted insight content (triggers add button functionality)
      try {
        await updateCardTextBox(atomId, result.formattedContent);
        console.log('✅ Card text box updated with insight');
        
        // Store insight in atom settings
        updateAtomSettings(atomId, {
          agentResponse: {
            response: data.response || '',
            reasoning: data.reasoning || '',
            smart_response: data.smart_response || '',
            insight: result.insight,
            formattedText: result.formattedContent
          }
        });
      } catch (textBoxError) {
        console.error('❌ Error updating card text box with insight:', textBoxError);
      }
    }).catch((error) => {
      console.error('❌ Error generating insight:', error);
      // Fallback: Update text box without insight if generation fails
      const textBoxContent = formatAgentResponseForTextBox(data);
      updateCardTextBox(atomId, textBoxContent).catch(err => {
        console.error('❌ Error updating card text box (fallback):', err);
      });
      
      // Store agent response in atom settings for reference (fallback)
      updateAtomSettings(atomId, {
        agentResponse: {
          response: data.response || '',
          reasoning: data.reasoning || '',
          smart_response: data.smart_response || '',
          formattedText: textBoxContent
        }
      });
    });
    
    // Add AI success message with operation completion
    const successDetails = {
      'File': singleFileName || 'N/A',
      'Identifiers': cfg.identifiers?.join(', ') || 'N/A',
      'Aggregations': aiSelectedMeasures.map(m => `${m.field} (${m.aggregator})`).join(', '),
      'Session': sessionId
    };
    if (!isStreamMode) {
      const successMsg = createSuccessMessage('AI groupby configuration completed', successDetails);
      successMsg.content += '\n\n🔄 Now executing the groupby operation...';
      setMessages(prev => [...prev, successMsg]);
    }
    
    // 🔧 CRITICAL FIX: Automatically call perform endpoint with AI configuration and validate real results
    let performResult: any = null;
    let parsedRows: any[] | null = null;
    let parsedCsv: string | null = null;
    let resultFilePath: string | null = null;

    try {
      if (GROUPBY_API) {
        const performEndpoint = `${GROUPBY_API}/run`;
        console.log('🚀 Calling groupby perform endpoint with AI config:', { 
          singleFileName, 
          aiSelectedIdentifiers, 
          aiSelectedMeasures 
        });
        
        // Convert to FormData format that GroupBy backend expects
        const normalizedObjectName = singleFileName?.startsWith('/')
          ? singleFileName.slice(1)
          : singleFileName;
        const formData = new URLSearchParams({
          validator_atom_id: atomId, // 🔧 CRITICAL: Add required validator_atom_id
          file_key: getFilename(singleFileName), // 🔧 CRITICAL: Add required file_key
          object_names: normalizedObjectName || getFilename(singleFileName),
          bucket_name: cfg.bucket_name || 'trinity',
          identifiers: JSON.stringify(aiSelectedIdentifiers),
          aggregations: JSON.stringify(aiSelectedMeasures.reduce((acc, m) => {
            // 🔧 CRITICAL FIX: Convert to backend-expected format
            // Backend expects: { "field_name": { "agg": "sum", "weight_by": "", "rename_to": "" } }
            const fieldKey = normalizeColumnName(m.field);
            if (!fieldKey) {
              return acc;
            }
            acc[fieldKey] = {
              agg: toBackendAggregation(m.aggregator),
              weight_by: normalizeColumnName(m.weight_by),
              rename_to: m.rename_to || fieldKey
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
          object_names: normalizedObjectName || getFilename(singleFileName),
          bucket_name: cfg.bucket_name || 'trinity',
          identifiers: aiSelectedIdentifiers,
          aggregations: aiSelectedMeasures.reduce((acc, m) => {
            acc[m.field] = {
              agg: toBackendAggregation(m.aggregator),
              weight_by: normalizeColumnName(m.weight_by),
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
        performResult = result;
        
        if (result.success && result.data) {
          console.log('✅ GroupBy operation successful:', result.data);
          
          // 🔧 CRITICAL FIX: Backend has completed and saved the file
          // Now we need to retrieve the actual results from the saved file
          if (result.data.status === 'SUCCESS' && result.data.result_file) {
            console.log('🔄 Backend operation completed, retrieving results from saved file:', result.data.result_file);
            resultFilePath = result.data.result_file;
          
            const directRows = Array.isArray(result.data.results) ? result.data.results : null;
            if (directRows && directRows.length > 0) {
              console.log('✅ Using direct results returned from backend without pagination');
              const headers = Object.keys(directRows[0] ?? {});
              parsedRows = directRows;

              updateAtomSettings(atomId, {
                selectedIdentifiers: aiSelectedIdentifiers,
                selectedMeasures: aiSelectedMeasures,
                selectedMeasureNames: aiSelectedMeasures.map(m => m.field),
                selectedAggregationMethods: ['Sum', 'Mean', 'Min', 'Max', 'Count', 'Median', 'Weighted Mean', 'Rank Percentile'],
                dataSource: singleFileName || cfg.file_key || '',
                bucketName: cfg.bucket_name || 'trinity',
                groupbyResults: {
                  ...result.data,
                  unsaved_data: directRows,
                  result_file: result.data.result_file,
                  row_count: directRows.length,
                  columns: headers
                },
                operationCompleted: true,
                lastUpdateTime: Date.now()
              });

              if (!isStreamMode) {
                const completionDetails = {
                  'Result File': result.data.result_file,
                  'Rows': directRows.length.toLocaleString(),
                  'Columns': headers.length
                };
                const completionMsg = createSuccessMessage('GroupBy operation', completionDetails);
                completionMsg.content += '\n\n📊 Results are ready! The data has been grouped and saved.\n\n💡 You can now view the results in the GroupBy interface - no need to click Perform again!';
                setMessages(prev => [...prev, completionMsg]);
              }
            } else {
              // 🔧 FIX: Retrieve results from the saved file using the cached_dataframe endpoint
              try {
                const rawRowCount = result.data?.row_count;
                const hasValidRowCount =
                  typeof rawRowCount === 'number' && Number.isFinite(rawRowCount) && rawRowCount > 0;
                const pageSize = hasValidRowCount ? Math.ceil(rawRowCount) : 100000;
                const cachedUrl = `${GROUPBY_API}/cached_dataframe?object_name=${encodeURIComponent(
                  result.data.result_file
                )}&page=1&page_size=${pageSize}`;
                const cachedRes = await fetch(cachedUrl);

                if (!cachedRes.ok) {
                  throw new Error(`Failed to fetch cached results: ${cachedRes.status}`);
                }

                const cachedJson = await cachedRes.json();
                const csvText = cachedJson?.data ?? '';
                console.log('📄 Retrieved CSV data from saved file, length:', csvText.length);
                parsedCsv = csvText;
                
                const lines = csvText.split('\n');
                if (lines.length <= 1) {
                  throw new Error('No data rows found in CSV');
                }

                const headers = lines[0].split(',').map(h => h.trim().replace(/"/g, ''));
                const rows = lines
                  .slice(1)
                  .filter(line => line.trim())
                  .map(line => {
                    const values = line.split(',').map(v => v.trim().replace(/"/g, ''));
                    const row: Record<string, string> = {};
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
                
                parsedRows = rows;

                updateAtomSettings(atomId, {
                  selectedIdentifiers: aiSelectedIdentifiers,
                  selectedMeasures: aiSelectedMeasures,
                  selectedMeasureNames: aiSelectedMeasures.map(m => m.field),
                  selectedAggregationMethods: ['Sum', 'Mean', 'Min', 'Max', 'Count', 'Median', 'Weighted Mean', 'Rank Percentile'],
                  dataSource: singleFileName || cfg.file_key || '',
                  bucketName: cfg.bucket_name || 'trinity',
                  groupbyResults: {
                    ...result.data,
                    unsaved_data: rows,
                    result_file: result.data.result_file,
                    row_count: rows.length,
                    columns: headers
                  },
                  operationCompleted: true,
                  lastUpdateTime: Date.now()
                });
                
                if (!isStreamMode) {
                  const completionDetails = {
                    'Result File': result.data.result_file,
                    'Rows': rows.length.toLocaleString(),
                    'Columns': headers.length
                  };
                  const completionMsg = createSuccessMessage('GroupBy operation', completionDetails);
                  completionMsg.content += '\n\n📊 Results are ready! The data has been grouped and saved.\n\n💡 You can now view the results in the GroupBy interface - no need to click Perform again!';
                  setMessages(prev => [...prev, completionMsg]);
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
                resultFilePath = result.data.result_file || resultFilePath;
                
                if (!isStreamMode) {
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
              }
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
            
            if (!isStreamMode) {
              const errorMsg = createErrorMessage(
                'GroupBy operation',
                result.data.error || 'Unknown error',
                `File: ${singleFileName}, Identifiers: ${aiSelectedIdentifiers.join(', ')}, Measures: ${aiSelectedMeasures.map(m => `${m.field} (${m.aggregator})`).join(', ')}`
              );
              errorMsg.content += '\n\n💡 Please check your configuration and try clicking the Perform button manually.';
              setMessages(prev => [...prev, errorMsg]);
            }
          }
        } else {
          console.error('❌ GroupBy operation failed:', result.error);
          
          if (!isStreamMode) {
            const errorMsg = createErrorMessage(
              'GroupBy operation',
              result.error || 'Unknown error',
              `File: ${singleFileName}, Identifiers: ${aiSelectedIdentifiers.join(', ')}, Measures: ${aiSelectedMeasures.map(m => `${m.field} (${m.aggregator})`).join(', ')}`
            );
            errorMsg.content += '\n\n💡 Please check your configuration and try clicking the Perform button manually.';
            setMessages(prev => [...prev, errorMsg]);
          }
          
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
      
      if (!isStreamMode) {
        const errorMsg = createErrorMessage(
          'GroupBy operation',
          error,
          `File: ${singleFileName}, Identifiers: ${aiSelectedIdentifiers.join(', ')}, Measures: ${aiSelectedMeasures.map(m => `${m.field} (${m.aggregator})`).join(', ')}`
        );
        errorMsg.content += '\n\n💡 Please try clicking the Perform button manually.';
        setMessages(prev => [...prev, errorMsg]);
      }
      
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

    try {
      const autoSavePayload = {
        unsaved_data: parsedRows ?? performResult?.data?.results ?? null,
        data: parsedCsv ?? null,
        result_file: resultFilePath ?? performResult?.data?.result_file ?? null,
      };

      await autoSaveStepResult({
        atomType: 'groupby-wtg-avg',
        atomId,
        stepAlias,
        result: autoSavePayload,
        updateAtomSettings,
        setMessages,
        isStreamMode
      });
    } catch (autoSaveError) {
      console.error('❌ GroupBy auto-save failed:', autoSaveError);
    }

    return { success: true };
  },

  handleFailure: async (data: any, context: AtomHandlerContext): Promise<AtomHandlerResponse> => {
    const { setMessages, atomId, updateAtomSettings, isStreamMode = false } = context;
    
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
    
    // Only add the message if we have content (and not in Stream mode)
    if (aiText && !isStreamMode) {
      const aiMsg: Message = {
        id: (Date.now() + 1).toString(),
        content: aiText,
        sender: 'ai',
        timestamp: new Date(),
      };
      setMessages(prev => [...prev, aiMsg]);
      console.log('📤 Added AI message to chat (Individual AI):', aiText.substring(0, 100) + '...');
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
    
    // 📝 Update card text box with response, reasoning, and smart_response (even for failures)
    console.log('📝 Updating card text box with agent response (failure case)...');
    const textBoxContent = formatAgentResponseForTextBox(data);
    try {
      await updateCardTextBox(atomId, textBoxContent);
      console.log('✅ Card text box updated successfully (failure case)');
    } catch (textBoxError) {
      console.error('❌ Error updating card text box:', textBoxError);
    }
    
    return { success: true };
  }
};
