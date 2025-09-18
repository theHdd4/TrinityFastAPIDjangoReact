import { CREATECOLUMN_API, FEATURE_OVERVIEW_API, VALIDATE_API } from '@/lib/api';
import { AtomHandler, AtomHandlerContext, AtomHandlerResponse, Message } from './types';
import { 
  getEnvironmentContext, 
  getFilename, 
  createMessage, 
  createSuccessMessage, 
  createErrorMessage,
  processSmartResponse,
  executePerformOperation,
  validateFileInput 
} from './utils';

export const createColumnHandler: AtomHandler = {
  handleSuccess: async (data: any, context: AtomHandlerContext): Promise<AtomHandlerResponse> => {
    const { atomId, updateAtomSettings, setMessages, sessionId } = context;
    
    if (!data.json) {
      return { success: false, error: 'No create column configuration found in AI response' };
    }

    const cfg = data.json[0]; // Get first configuration object
    console.log('🤖 AI CREATE COLUMN CONFIG EXTRACTED:', cfg, 'Session:', sessionId);
    
    // Validate data source
    const dataSourceValidation = validateFileInput(cfg.object_name, 'AI data source');
    if (!dataSourceValidation.isValid) {
      const errorMsg = createErrorMessage(
        'Create Column configuration',
        dataSourceValidation.message || 'Invalid data source',
        'Data source validation'
      );
      setMessages(prev => [...prev, errorMsg]);
      return { success: false, error: 'Invalid data source' };
    }
    
    // 🔧 CRITICAL FIX: Convert AI config to proper CreateColumn format
    const operations: any[] = [];
    
    // Parse operations from the new AI format (add_0, add_0_rename, etc.)
    const operationKeys = Object.keys(cfg).filter(key => 
      key.match(/^(add|subtract|multiply|divide|power|sqrt|log|abs|dummy|rpi|residual|stl_outlier|logistic|detrend|deseasonalize|detrend_deseasonalize|exp|standardize_zscore|standardize_minmax)_\d+$/)
    );
    
    operationKeys.forEach((opKey) => {
      const match = opKey.match(/^(\w+)_(\d+)$/);
      if (match) {
        const opType = match[1];
        const opIndex = parseInt(match[2]);
        const columns = cfg[opKey].split(',').map((col: string) => col.trim());
        const renameKey = `${opType}_${opIndex}_rename`;
        const rename = cfg[renameKey] || '';
        
        operations.push({
          id: `${opType}_${opIndex}_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
          type: opType,
          name: opType.charAt(0).toUpperCase() + opType.slice(1),
          columns: columns,
          newColumnName: rename || `${opType}_${columns.join('_')}`,
          rename: rename,
          param: null // Will be added if param exists
        });
        
        // Check if there are parameters
        const paramKey = `${opType}_${opIndex}_param`;
        if (cfg[paramKey]) {
          operations[operations.length - 1].param = cfg[paramKey];
        }
        
        // Check if there are period parameters
        const periodKey = `${opType}_${opIndex}_period`;
        if (cfg[periodKey]) {
          operations[operations.length - 1].param = cfg[periodKey];
        }
      }
    });
    
    // Validate operations
    if (operations.length === 0) {
      const errorMsg = createErrorMessage(
        'Create Column configuration',
        'No valid operations found in AI response',
        'Operations validation'
      );
      setMessages(prev => [...prev, errorMsg]);
      return { success: false, error: 'No valid operations found' };
    }
    
    console.log('🔧 Parsed operations from AI:', operations);
    
    // Get environment context
    const envContext = getEnvironmentContext();
    console.log('🔍 Environment context loaded:', envContext);
    
    // 🔧 CRITICAL FIX: Set dataSource first to trigger column loading, then load columns
    updateAtomSettings(atomId, { 
      aiConfig: cfg,
      aiMessage: data.message,
      operationCompleted: false,
      // Auto-populate the CreateColumn interface - EXACTLY like GroupBy
      dataSource: cfg.object_name || '', // Note: AI uses object_name (singular)
      bucketName: cfg.bucket_name || 'trinity',
      selectedIdentifiers: cfg.identifiers || [],
      // 🔧 CRITICAL FIX: Set the file key for column loading
      file_key: cfg.object_name || '',
      // 🔧 CRITICAL FIX: Set operations in the format expected by CreateColumnCanvas
      // This ensures the UI automatically displays the AI-configured operations
      operations: operations.map((op, index) => ({
        id: op.id,
        type: op.type,
        name: op.name,
        columns: op.columns,
        newColumnName: op.newColumnName,
        rename: op.rename,
        param: op.param
      })),
      // Include environment context
      envContext,
      lastUpdateTime: Date.now()
    });
    
    // 🔧 CRITICAL FIX: Load columns directly after setting dataSource
    if (cfg.object_name) {
      try {
        console.log('🔄 Loading columns for AI-selected data source:', cfg.object_name);
        
        // 🔧 CRITICAL FIX: Get the current prefix and construct full object name
        let fullObjectName = cfg.object_name;
        try {
          const prefixRes = await fetch(`${VALIDATE_API}/get_object_prefix`);
          if (prefixRes.ok) {
            const prefixData = await prefixRes.json();
            const prefix = prefixData.prefix || '';
            console.log('🔧 Current prefix:', prefix);
            
            // Construct full object name if we have a prefix
            if (prefix && !cfg.object_name.startsWith(prefix)) {
              fullObjectName = `${prefix}${cfg.object_name}`;
              console.log('🔧 Constructed full object name:', fullObjectName);
            }
          }
        } catch (prefixError) {
          console.warn('⚠️ Failed to get prefix, using original object name:', prefixError);
        }
        
        // Fetch column summary to populate allColumns with full object name
        const columnRes = await fetch(`${FEATURE_OVERVIEW_API}/column_summary?object_name=${encodeURIComponent(fullObjectName)}`);
        if (columnRes.ok) {
          const columnData = await columnRes.json();
          const allColumns = Array.isArray(columnData.summary) ? columnData.summary.filter(Boolean) : [];
          
          console.log('✅ Columns loaded successfully:', allColumns.length);
          
          // Update atom settings with the loaded columns
          updateAtomSettings(atomId, {
            allColumns: allColumns,
            // Also set the CSV display name
            csvDisplay: cfg.object_name.split('/').pop() || cfg.object_name
          });
          
          // 🔧 CRITICAL FIX: Also trigger the handleFrameChange logic to set up identifiers
          try {
            // Try to fetch identifiers from backend classification
            const resp = await fetch(`${CREATECOLUMN_API}/classification?validator_atom_id=${encodeURIComponent(atomId)}&file_key=${encodeURIComponent(cfg.object_name)}`);
            console.log('🔍 Classification response status:', resp.status);
            if (resp.ok) {
              const classificationData = await resp.json();
              console.log('🔍 Classification identifiers:', classificationData.identifiers);
              updateAtomSettings(atomId, {
                selectedIdentifiers: classificationData.identifiers || []
              });
            } else {
              // Fallback to categorical columns
              const cats = allColumns.filter((c: any) =>
                c.data_type && (
                  c.data_type.toLowerCase().includes('object') ||
                  c.data_type.toLowerCase().includes('string') ||
                  c.data_type.toLowerCase().includes('category')
                )
              ).map((c: any) => c.column)
              .filter((id: string) => !['date','time','month','months','week','weeks','year'].includes(id.toLowerCase()));
              
              console.log('🔧 Fallback categorical columns:', cats);
              updateAtomSettings(atomId, {
                selectedIdentifiers: cats
              });
            }
          } catch (err) {
            console.warn('⚠️ Failed to fetch classification, using fallback:', err);
            // Fallback to categorical columns
            const cats = allColumns.filter((c: any) =>
              c.data_type && (
                c.data_type.toLowerCase().includes('object') ||
                c.data_type.toLowerCase().includes('string') ||
                c.data_type.toLowerCase().includes('category')
              )
            ).map((c: any) => c.column)
            .filter((id: string) => !['date','time','month','months','week','weeks','year'].includes(id.toLowerCase()));
            
            console.log('🔧 Fallback categorical columns (catch):', cats);
            updateAtomSettings(atomId, {
              selectedIdentifiers: cats
            });
          }
          
        } else {
          console.warn('⚠️ Failed to load columns for data source:', cfg.object_name);
        }
      } catch (error) {
        console.error('❌ Error loading columns for data source:', error);
      }
    }
    
    // Add AI success message with operation completion
    const successDetails = {
      'File': cfg.object_name || 'N/A',
      'Operations': operations.map(op => `${op.type}(${op.columns.join(', ')})`).join(', '),
      'Session': sessionId
    };
    const successMsg = createSuccessMessage('AI create column configuration completed', successDetails);
    successMsg.content += '\n\n🔄 Now executing the Create Column operations...';
    setMessages(prev => [...prev, successMsg]);

    // 🔧 CRITICAL FIX: Automatically execute the operations (like GroupBy)
    // Wait a bit for the UI to update, then automatically perform the operations
    setTimeout(async () => {
      try {
        console.log('🚀 Auto-executing Create Column operations with AI config');
        
        // 🔧 CRITICAL FIX: Convert to FormData format that CreateColumn backend expects
        const formData = new FormData();
        formData.append('object_names', getFilename(cfg.object_name || ''));
        formData.append('bucket_name', cfg.bucket_name || 'trinity');
        
        // Add operations in the format backend expects
        operations.forEach((op, index) => {
          if (op.columns && op.columns.filter(Boolean).length > 0) {
            const colString = op.columns.filter(Boolean).join(',');
            const rename = op.rename && op.rename.trim() ? op.rename.trim() : '';
            const key = `${op.type}_${index}`;
            
            // Add the operation
            formData.append(key, colString);
            
            // Add rename if specified
            if (rename) {
              formData.append(`${key}_rename`, rename);
            }
            
            // Add parameters if specified
            if (op.param) {
              if (['detrend', 'deseasonalize', 'detrend_deseasonalize'].includes(op.type)) {
                formData.append(`${key}_period`, String(op.param));
              } else if (op.type === 'power') {
                formData.append(`${key}_param`, String(op.param));
              } else if (op.type === 'logistic') {
                formData.append(`${key}_param`, JSON.stringify(op.param));
              }
            }
          }
        });
        
        // Add identifiers
        const identifiers = cfg.identifiers || [];
        formData.append('identifiers', identifiers.join(','));
        
        // Add session context for tracking
        formData.append('session_id', sessionId);
        
        console.log('📁 Auto-executing with form data:', {
          object_names: getFilename(cfg.object_name || ''),
          bucket_name: cfg.bucket_name || 'trinity',
          operations: operations.map((op, index) => ({
            index,
            type: op.type,
            columns: op.columns,
            rename: op.rename,
            param: op.param
          })),
          identifiers: identifiers,
          session_id: sessionId
        });
        
        const performEndpoint = `${CREATECOLUMN_API}/perform`;
        const result = await executePerformOperation(performEndpoint, formData, {
          method: 'POST',
          isFormData: true
        });
        
        if (result.success && result.data) {
          console.log('✅ Auto-execution successful:', result.data);
          
          // 🔧 CRITICAL FIX: Update atom settings with results
          updateAtomSettings(atomId, {
            operationCompleted: true,
            createColumnResults: result.data,
            lastUpdateTime: Date.now()
          });
          
          // Add success message
          const completionDetails = {
            'File': cfg.object_name || 'N/A',
            'Operations': operations.map(op => `${op.type}(${op.columns.join(', ')})`).join(', '),
            'Result': 'New columns created successfully'
          };
          const completionMsg = createSuccessMessage('Create Column operations', completionDetails);
          completionMsg.content += '\n\n📊 Results are ready! New columns have been created.\n\n💡 You can now view the results in the Create Column interface.';
          setMessages(prev => [...prev, completionMsg]);
          
        } else {
          console.error('❌ Auto-execution failed:', result.error);
          
          const errorMsg = createErrorMessage(
            'Create Column auto-execution',
            result.error || 'Unknown error',
            `File: ${cfg.object_name || 'N/A'}, Operations: ${operations.map(op => `${op.type}(${op.columns.join(', ')})`).join(', ')}`
          );
          errorMsg.content += '\n\n💡 Please try clicking the Perform button manually.';
          setMessages(prev => [...prev, errorMsg]);
          
          updateAtomSettings(atomId, {
            operationCompleted: false,
            lastError: result.error
          });
        }
        
      } catch (error) {
        console.error('❌ Error during auto-execution:', error);
        
        const errorMsg = createErrorMessage(
          'Create Column auto-execution',
          error,
          `File: ${cfg.object_name || 'N/A'}, Operations: ${operations.map(op => `${op.type}(${op.columns.join(', ')})`).join(', ')}`
        );
        errorMsg.content += '\n\n💡 Please try clicking the Perform button manually.';
        setMessages(prev => [...prev, errorMsg]);
        
        updateAtomSettings(atomId, {
          operationCompleted: false,
          lastError: (error as Error).message
        });
      }
    }, 1000); // Wait 1 second for UI to update

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
        recommendedOperations: data.recommended_operations || [],
        fileAnalysis: data.file_analysis || null,
        lastInteractionTime: Date.now()
      });
    }
    
    return { success: true };
  }
};
