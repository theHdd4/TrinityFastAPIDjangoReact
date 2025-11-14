import { CREATECOLUMN_API, FEATURE_OVERVIEW_API, VALIDATE_API } from '@/lib/api';
import { resolveTaskResponse } from '@/lib/taskQueue';
import { AtomHandler, AtomHandlerContext, AtomHandlerResponse, Message } from './types';
import { 
  getEnvironmentContext, 
  createMessage, 
  createSuccessMessage, 
  createErrorMessage,
  processSmartResponse,
  executePerformOperation,
  validateFileInput,
  constructFullPath
} from './utils';

export const createColumnHandler: AtomHandler = {
  handleSuccess: async (data: any, context: AtomHandlerContext): Promise<AtomHandlerResponse> => {
    console.log('🚀🚀🚀 CREATE COLUMN HANDLER - handleSuccess START');
    console.log('📥 Data received:', JSON.stringify(data, null, 2));
    console.log('🆔 AtomId:', context.atomId);
    console.log('🔢 SessionId:', context.sessionId);
    
    const { atomId, updateAtomSettings, setMessages, sessionId } = context;
    
    // 🔧 CRITICAL FIX: Show smart_response FIRST (like concat/merge)
    // This displays the AI's clean, user-friendly message immediately
    const smartResponseText = processSmartResponse(data);
    console.log('💬 Smart response text:', smartResponseText);
    
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
    } else {
      console.warn('⚠️ No smart response text found!');
    }
    
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
    
    // Map AI file paths to correct file paths for UI compatibility (similar to concat)
    let mappedDataSource = cfg.object_name || '';
    
    let matchedFrame: any = null;

    try {
      console.log('🔄 Fetching frames to map AI file paths for create-column...');
      const framesResponse = await fetch(`${VALIDATE_API}/list_saved_dataframes`);
      if (framesResponse.ok) {
        const framesData = await framesResponse.json();
        const frames = Array.isArray(framesData.files) ? framesData.files : [];
        
        console.log('📋 Available frames for create-column:', frames.map(f => ({ object_name: f.object_name, csv_name: f.csv_name })));
        
        // Map AI file path to correct file path for create-column UI (same logic as concat)
        const mapFilePathToObjectName = (aiFilePath: string) => {
          if (!aiFilePath) return aiFilePath;
          
          // Try exact match first
          let exactMatch = frames.find(f => f.object_name === aiFilePath);
          if (exactMatch) {
            console.log(`✅ Exact match found for create-column ${aiFilePath}: ${exactMatch.object_name}`);
            matchedFrame = exactMatch;
            return exactMatch.object_name;
          }
          
          // Try matching by filename
          const aiFileName = aiFilePath.includes('/') ? aiFilePath.split('/').pop() : aiFilePath;
          let filenameMatch = frames.find(f => {
            const frameFileName = f.csv_name.split('/').pop() || f.csv_name;
            return frameFileName === aiFileName;
          });
          
          if (filenameMatch) {
            console.log(`✅ Filename match found for create-column ${aiFilePath} -> ${filenameMatch.object_name}`);
            matchedFrame = filenameMatch;
            return filenameMatch.object_name;
          }
          
          // Try partial match
          let partialMatch = frames.find(f => 
            f.object_name.includes(aiFileName) || 
            f.csv_name.includes(aiFileName) ||
            aiFilePath.includes(f.object_name) ||
            aiFilePath.includes(f.csv_name)
          );
          
          if (partialMatch) {
            console.log(`✅ Partial match found for create-column ${aiFilePath} -> ${partialMatch.object_name}`);
            matchedFrame = partialMatch;
            return partialMatch.object_name;
          }

          // Try alias match by base name (handles timestamped auto-save filenames)
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
              console.log(`✅ Alias match found for create-column ${aiFilePath} -> ${aliasMatch.object_name}`);
              matchedFrame = aliasMatch;
              return aliasMatch.object_name;
            }
          }
          
          console.log(`⚠️ No match found for create-column ${aiFilePath}, using original value`);
          return aiFilePath;
        };
        
        mappedDataSource = mapFilePathToObjectName(cfg.object_name || '');
        
        console.log('🔧 Create-column file path mapping results:', {
          original_dataSource: cfg.object_name,
          mapped_dataSource: mappedDataSource
        });
      } else {
        console.warn('⚠️ Failed to fetch frames for create-column mapping, using original file path');
      }
    } catch (error) {
      console.error('❌ Error fetching frames for create-column mapping:', error);
    }
    
    // 🔧 Build environment context with fallbacks from matched file and AI payload
    let envWithFallback = (() => {
      const derived = { ...envContext };
      const candidatePath = matchedFrame?.object_name || mappedDataSource || cfg.object_name || '';

      if (candidatePath.includes('/')) {
        const parts = candidatePath.split('/');
        if (parts.length >= 4) {
          if (!derived.client_name) derived.client_name = parts[0];
          if (!derived.app_name) derived.app_name = parts[1];
          if (!derived.project_name) derived.project_name = parts[2];
        }
      }

      return derived;
    })();

    const hydrateEnvContext = async () => {
      try {
        const params = new URLSearchParams();
        if (envWithFallback.client_name) params.append('client_name', envWithFallback.client_name);
        if (envWithFallback.app_name) params.append('app_name', envWithFallback.app_name);
        if (envWithFallback.project_name) params.append('project_name', envWithFallback.project_name);

        const prefixUrl = params.toString()
          ? `${VALIDATE_API}/get_object_prefix?${params.toString()}`
          : `${VALIDATE_API}/get_object_prefix`;

        const prefixRes = await fetch(prefixUrl);
        if (prefixRes.ok) {
          const prefixData = await prefixRes.json();
          if (prefixData.environment) {
            envWithFallback = {
              client_name: envWithFallback.client_name || prefixData.environment.CLIENT_NAME || '',
              app_name: envWithFallback.app_name || prefixData.environment.APP_NAME || '',
              project_name: envWithFallback.project_name || prefixData.environment.PROJECT_NAME || ''
            };
          }
          if (prefixData.prefix) {
            cachedPrefix = prefixData.prefix;
          }
        }
      } catch (err) {
        console.warn('⚠️ Failed to hydrate create-column environment context:', err);
      }
    };

    let cachedPrefix: string | null = null;
    await hydrateEnvContext();
    const ensureFullObjectName = async (objectName: string): Promise<string> => {
      if (!objectName) {
        return objectName;
      }

      // Keep fully qualified paths that match the active context
      if (
        objectName.includes('/') &&
        envWithFallback.client_name &&
        envWithFallback.app_name &&
        envWithFallback.project_name &&
        objectName.startsWith(`${envWithFallback.client_name}/${envWithFallback.app_name}/${envWithFallback.project_name}/`)
      ) {
        return objectName;
      }

      if (cachedPrefix === null) {
        try {
          const params = new URLSearchParams();
          if (envWithFallback.client_name) params.append('client_name', envWithFallback.client_name);
          if (envWithFallback.app_name) params.append('app_name', envWithFallback.app_name);
          if (envWithFallback.project_name) params.append('project_name', envWithFallback.project_name);

          const prefixUrl = params.toString()
            ? `${VALIDATE_API}/get_object_prefix?${params.toString()}`
            : `${VALIDATE_API}/get_object_prefix`;

          const prefixRes = await fetch(prefixUrl);
          if (prefixRes.ok) {
            const prefixData = await prefixRes.json();
            cachedPrefix = prefixData.prefix || '';
          } else {
            cachedPrefix = '';
          }
        } catch (err) {
          console.warn('⚠️ Failed to fetch object prefix for create-column:', err);
          cachedPrefix = '';
        }
      }

      if (cachedPrefix) {
        return `${cachedPrefix}${objectName}`;
      }

      const constructed = constructFullPath(objectName, envWithFallback);
      if (constructed && constructed !== objectName) {
        return constructed;
      }

      return objectName;
    };

    const resolvedDataSource = await ensureFullObjectName(mappedDataSource || cfg.object_name || '');

    console.log('🧭 Resolved create-column data source:', {
      original: cfg.object_name,
      mappedDataSource,
      resolvedDataSource,
      client_name: envWithFallback.client_name,
      app_name: envWithFallback.app_name,
      project_name: envWithFallback.project_name
    });

    cfg.object_name = resolvedDataSource;

    const settingsToUpdate = { 
      aiConfig: cfg,
      aiMessage: data.message,
      operationCompleted: false,
      // Auto-populate the CreateColumn interface - EXACTLY like GroupBy
      dataSource: resolvedDataSource,
      bucketName: cfg.bucket_name || 'trinity',
      selectedIdentifiers: cfg.identifiers || [],
      // 🔧 CRITICAL FIX: Set the file key for column loading
      file_key: resolvedDataSource,
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
      envContext: envWithFallback,
      lastUpdateTime: Date.now()
    };
    
    console.log('🔧 Updating atom settings with:', {
      atomId,
      dataSource: resolvedDataSource,
      operationsCount: operations.length,
      operations: operations,
      fullSettings: settingsToUpdate
    });
    
    updateAtomSettings(atomId, settingsToUpdate);
    
    // 🔧 CRITICAL FIX: Load columns directly after setting dataSource
    if (resolvedDataSource) {
      try {
        console.log('🔄 Loading columns for AI-selected data source:', resolvedDataSource);
        
        // 🔧 CRITICAL FIX: Get the current prefix and construct full object name
        let fullObjectName = resolvedDataSource;
        try {
          const prefixParams = new URLSearchParams();
          if (envWithFallback.client_name) prefixParams.append('client_name', envWithFallback.client_name);
          if (envWithFallback.app_name) prefixParams.append('app_name', envWithFallback.app_name);
          if (envWithFallback.project_name) prefixParams.append('project_name', envWithFallback.project_name);

          const prefixUrl = prefixParams.toString()
            ? `${VALIDATE_API}/get_object_prefix?${prefixParams.toString()}`
            : `${VALIDATE_API}/get_object_prefix`;

          const prefixRes = await fetch(prefixUrl);
          if (prefixRes.ok) {
            const prefixData = await prefixRes.json();
            const prefix = prefixData.prefix || '';
            console.log('🔧 Current prefix:', prefix);
            
            // Construct full object name if we have a prefix
            if (prefix && !resolvedDataSource.startsWith(prefix)) {
              fullObjectName = `${prefix}${resolvedDataSource}`;
              console.log('🔧 Constructed full object name:', fullObjectName);
            }
          }
        } catch (prefixError) {
          console.warn('⚠️ Failed to get prefix, using original object name:', prefixError);
        }
        
        // Fetch column summary to populate allColumns with full object name
        const columnRes = await fetch(`${FEATURE_OVERVIEW_API}/column_summary?object_name=${encodeURIComponent(fullObjectName)}`);
        if (columnRes.ok) {
          const rawColumn = await columnRes.json();
          const columnData = await resolveTaskResponse<{ summary?: any[] }>(rawColumn);
          const allColumns = Array.isArray(columnData.summary) ? columnData.summary.filter(Boolean) : [];
          
          console.log('✅ Columns loaded successfully:', allColumns.length);
          
          // Update atom settings with the loaded columns
          updateAtomSettings(atomId, {
            allColumns: allColumns,
            // Also set the CSV display name
            csvDisplay: resolvedDataSource.split('/').pop() || resolvedDataSource
          });
          
          // 🔧 CRITICAL FIX: Also trigger the handleFrameChange logic to set up identifiers
          try {
            // Try to fetch identifiers from backend classification
            const resp = await fetch(`${CREATECOLUMN_API}/classification?validator_atom_id=${encodeURIComponent(atomId)}&file_key=${encodeURIComponent(resolvedDataSource)}`);
            console.log('🔍 Classification response status:', resp.status);
            if (resp.ok) {
              const rawClassification = await resp.json();
              const classificationData = await resolveTaskResponse<Record<string, any>>(rawClassification);
              console.log('🔍 Classification identifiers:', classificationData.identifiers);
              updateAtomSettings(atomId, {
                selectedIdentifiers: (classificationData.identifiers as string[]) || []
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
          console.warn('⚠️ Failed to load columns for data source:', resolvedDataSource);
        }
      } catch (error) {
        console.error('❌ Error loading columns for data source:', error);
      }
    }
    
    // 🔧 FIX: No need for duplicate success message - smart_response already shown at the top
    console.log('📋 Create Column configuration:', {
      file: resolvedDataSource,
      operations: operations.map(op => `${op.type}(${op.columns.join(', ')})`),
      session: sessionId
    });

    // 🔧 CRITICAL FIX: Call perform endpoint immediately (like concat - NO setTimeout)
    try {
      console.log('🚀 Calling Create Column perform endpoint immediately (like concat)');
      console.log('📋 Operations to execute:', operations);
      
      // 🔧 CRITICAL FIX: Convert to FormData format that CreateColumn backend expects
      const formData = new FormData();
      const { client_name = '', app_name = '', project_name = '' } = envWithFallback || {};

      formData.append('object_names', cfg.object_name || resolvedDataSource || '');
      formData.append('bucket_name', cfg.bucket_name || 'trinity');
      formData.append('client_name', client_name);
      formData.append('app_name', app_name);
      formData.append('project_name', project_name);
      
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
      
      console.log('📁 Auto-executing with form data:', {
        object_names: cfg.object_name || resolvedDataSource || '',
        bucket_name: cfg.bucket_name || 'trinity',
        client_name,
        app_name,
        project_name,
        operations: operations.map((op, index) => ({
          index,
          type: op.type,
          columns: op.columns,
          rename: op.rename,
          param: op.param
        })),
        identifiers: identifiers
      });
      
      const performEndpoint = `${CREATECOLUMN_API}/perform`;
      console.log('📡 Calling perform endpoint:', performEndpoint);
      console.log('📦 FormData payload (converted to object for logging):');
      const formDataObj: any = {};
      formData.forEach((value, key) => {
        formDataObj[key] = value;
      });
      console.log(formDataObj);
      
      const res2 = await fetch(performEndpoint, {
        method: 'POST',
        body: formData,
      });
      
      console.log('📨 Perform endpoint response status:', res2.status);
      
      if (res2.ok) {
        const result = await res2.json();
        console.log('✅ Auto-execution successful:', result);
        
        // 🔧 CRITICAL FIX: Update atom settings with results
        updateAtomSettings(atomId, {
          operationCompleted: true,
          createColumnResults: result,
          lastUpdateTime: Date.now()
        });
        
        // Add success message
        const completionDetails = {
          'File': resolvedDataSource || 'N/A',
          'Operations': operations.map(op => `${op.type}(${op.columns.join(', ')})`).join(', '),
          'Result': 'New columns created successfully'
        };
        const completionMsg = createSuccessMessage('Create Column operations', completionDetails);
        completionMsg.content += '\n\n📊 Results are ready! New columns have been created.\n\n💡 You can now view the results in the Create Column interface.';
        setMessages(prev => [...prev, completionMsg]);
        
      } else {
        console.error('❌ Auto-execution failed:', res2.status, res2.statusText);
        
        // Try to get detailed error message
        let errorDetail = res2.statusText;
        try {
          const errorData = await res2.json();
          errorDetail = errorData.detail || errorData.message || res2.statusText;
        } catch (e) {
          // If we can't parse error response, use status text
        }
        
        const errorMsg = createErrorMessage(
          'Create Column auto-execution',
          errorDetail,
          `File: ${mappedDataSource || 'N/A'}, Operations: ${operations.map(op => `${op.type}(${op.columns.join(', ')})`).join(', ')}`
        );
        errorMsg.content += '\n\n💡 Please try clicking the Perform button manually.';
        setMessages(prev => [...prev, errorMsg]);
        
        updateAtomSettings(atomId, {
          operationCompleted: false,
          lastError: errorDetail
        });
      }
    } catch (error) {
      console.error('❌ Error during perform operation:', error);
      
      const errorMsg = createErrorMessage(
        'Create Column auto-execution',
        error,
        `File: ${mappedDataSource || 'N/A'}, Operations: ${operations.map(op => `${op.type}(${op.columns.join(', ')})`).join(', ')}`
      );
      errorMsg.content += '\n\n💡 Please try clicking the Perform button manually.';
      setMessages(prev => [...prev, errorMsg]);
      
      updateAtomSettings(atomId, {
        operationCompleted: false,
        lastError: (error as Error).message
      });
    }
    
    console.log('🏁 CREATE COLUMN HANDLER - handleSuccess COMPLETE');
    return { success: true };
  },

  handleFailure: async (data: any, context: AtomHandlerContext): Promise<AtomHandlerResponse> => {
    const { setMessages } = context;
    
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
        if (data.file_analysis.create_transform_tips && data.file_analysis.create_transform_tips.length > 0) {
          aiText += `• Tips: ${data.file_analysis.create_transform_tips.join(', ')}\n`;
        }
      }
      
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