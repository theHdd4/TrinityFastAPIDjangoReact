import { CREATECOLUMN_API, FEATURE_OVERVIEW_API, VALIDATE_API } from '@/lib/api';
import { AtomHandler, AtomHandlerContext, AtomHandlerResponse, Message } from './types';
import { 
  getEnvironmentContext, 
  createMessage, 
  createSuccessMessage, 
  createErrorMessage,
  processSmartResponse,
  executePerformOperation,
  validateFileInput,
  constructFullPath,
  autoSaveStepResult
} from './utils';
import { useLaboratoryStore } from '@/components/LaboratoryMode/store/laboratoryStore';

export const createColumnHandler: AtomHandler = {
  handleSuccess: async (data: any, context: AtomHandlerContext): Promise<AtomHandlerResponse> => {
    console.log('🚀🚀🚀 CREATE COLUMN HANDLER - handleSuccess START');
    console.log('📥 Data received:', JSON.stringify(data, null, 2));
    console.log('🆔 AtomId:', context.atomId);
    console.log('🔢 SessionId:', context.sessionId);
    console.log('🔍 Data keys:', Object.keys(data));
    console.log('🔍 Has json:', !!data.json);
    console.log('🔍 Has create_json:', !!data.create_json);
    console.log('🔍 Has config:', !!data.config);
    
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
    
    // Extract json - check multiple possible locations
    const jsonData = data.json || data.create_json || data.config || null;
    
    if (!jsonData || !Array.isArray(jsonData) || jsonData.length === 0) {
      console.error('❌ No create column configuration found in AI response');
      console.error('📦 Available keys:', Object.keys(data));
      const errorMsg = createErrorMessage(
        'Create Column configuration',
        'No create column configuration found in AI response',
        'Configuration validation'
      );
      setMessages(prev => [...prev, errorMsg]);
      return { success: false, error: 'No create column configuration found in AI response' };
    }

    const cfg = jsonData[0]; // Get first configuration object
    if (!cfg || typeof cfg !== 'object') {
      const errorMsg = createErrorMessage(
        'Create Column configuration',
        'Invalid configuration format in AI response',
        'Configuration validation'
      );
      setMessages(prev => [...prev, errorMsg]);
      return { success: false, error: 'Invalid configuration format' };
    }
    
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
    
    // Parse and sort operations by index to ensure correct order
    const operationsWithIndex: Array<{op: any, index: number}> = [];
    
    operationKeys.forEach((opKey) => {
      const match = opKey.match(/^(\w+)_(\d+)$/);
      if (match) {
        const opType = match[1];
        const opIndex = parseInt(match[2]);
        const rawColumns = cfg[opKey];
        console.log(`🔍 Parsing operation ${opKey}: type=${opType}, index=${opIndex}, rawColumns=${rawColumns}`);
        
        // Parse columns - handle both string and array formats
        let columns: string[] = [];
        if (Array.isArray(rawColumns)) {
          columns = rawColumns.map((col: any) => String(col).trim()).filter(Boolean);
        } else if (typeof rawColumns === 'string') {
          columns = rawColumns.split(',').map((col: string) => col.trim()).filter(Boolean);
        }
        
        console.log(`🔍 Parsed columns for ${opKey}:`, columns);
        
        // Skip if no columns
        if (columns.length === 0) {
          console.warn(`⚠️ Skipping operation ${opKey} - no columns provided (raw: ${rawColumns})`);
          return;
        }
        
        const renameKey = `${opType}_${opIndex}_rename`;
        const rename = cfg[renameKey] || '';
        
        const operation = {
          id: `${opType}_${opIndex}_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
          type: opType,
          name: opType.charAt(0).toUpperCase() + opType.slice(1),
          columns: columns,
          newColumnName: rename || `${opType}_${columns.join('_')}`,
          rename: rename,
          param: null // Will be added if param exists
        };
        
        // Check if there are parameters
        const paramKey = `${opType}_${opIndex}_param`;
        if (cfg[paramKey]) {
          operation.param = cfg[paramKey];
        }
        
        // Check if there are period parameters
        const periodKey = `${opType}_${opIndex}_period`;
        if (cfg[periodKey]) {
          operation.param = cfg[periodKey];
        }
        
        operationsWithIndex.push({ op: operation, index: opIndex });
      }
    });
    
    // Sort by index to ensure correct order
    operationsWithIndex.sort((a, b) => a.index - b.index);
    operations.push(...operationsWithIndex.map(item => item.op));
    
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
      // Validate and ensure all required fields are present
      operations: operations.map((op, index) => {
        // Ensure columns is always an array
        const columns = Array.isArray(op.columns) ? op.columns.filter(Boolean) : [];
        return {
          id: op.id || `${op.type}_${index}_${Date.now()}`,
          type: op.type,
          name: op.name || (op.type.charAt(0).toUpperCase() + op.type.slice(1)),
          columns: columns,
          newColumnName: op.newColumnName || op.rename || `${op.type}_${columns.join('_')}`,
          rename: op.rename || '',
          param: op.param || null
        };
      }).filter(op => {
        // Filter out operations with no columns
        return op.columns && op.columns.length > 0;
      }),
      // Include environment context
      envContext: envWithFallback,
      lastUpdateTime: Date.now()
    };
    
    // 🔧 CRITICAL FIX: Get current settings and merge with new settings
    const currentAtom = useLaboratoryStore.getState().getAtom(atomId);
    const currentSettings = currentAtom?.settings || {};
    
    // Merge with existing settings
    const mergedSettings = {
      ...currentSettings, // Preserve all existing settings
      ...settingsToUpdate // Apply new settings
    };
    
    console.log('🔧 Updating atom settings with:', {
      atomId,
      dataSource: resolvedDataSource,
      operationsCount: operations.length,
      operations: operations,
      mergedSettings: {
        operations: mergedSettings.operations?.length || 0,
        dataSource: mergedSettings.dataSource,
        object_name: mergedSettings.object_name
      }
    });
    
    updateAtomSettings(atomId, mergedSettings);
    
    // Force a small delay to ensure state propagation, then verify
    await new Promise(resolve => setTimeout(resolve, 100));
    
    // Verify the update was successful
    const verifyAtom = useLaboratoryStore.getState().getAtom(atomId);
    console.log('✅ Atom settings updated with create-column configuration:', {
      atomExists: !!verifyAtom,
      operationsCount: verifyAtom?.settings?.operations?.length || 0,
      hasDataSource: !!verifyAtom?.settings?.dataSource,
      hasObjectName: !!verifyAtom?.settings?.object_name,
      dataSource: verifyAtom?.settings?.dataSource
    });
    
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
          const columnData = await columnRes.json();
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
      // EXACTLY match the manual perform logic from CreateColumnCanvas.tsx
      const formData = new FormData();
      const { client_name = '', app_name = '', project_name = '' } = envWithFallback || {};

      // 🔧 CRITICAL FIX: Always use resolvedDataSource (full path) - never use cfg.object_name which might be just filename
      formData.append('object_names', resolvedDataSource || '');
      formData.append('bucket_name', cfg.bucket_name || 'trinity');
      // 🔧 CRITICAL FIX: Match manual perform exactly - don't add client_name/app_name/project_name to FormData
      // The backend gets these from the request context, not from FormData
      // Only add them if they're actually needed (but manual perform doesn't send them)
      // formData.append('client_name', client_name);
      // formData.append('app_name', app_name);
      // formData.append('project_name', project_name);
      
      // 🔧 CRITICAL FIX: Validate and add operations EXACTLY like manual perform
      // Track how many operations were actually added
      console.log('🔍 Starting operations validation and FormData building...');
      console.log('🔍 Total operations to process:', operations.length);
      console.log('🔍 Operations details:', operations.map((op, idx) => ({
        index: idx,
        type: op.type,
        columns: op.columns,
        columnsCount: op.columns ? op.columns.filter(Boolean).length : 0,
        rename: op.rename,
        param: op.param
      })));
      
      let operationsAdded = 0;
      operations.forEach((op, idx) => {
        const filteredColumns = op.columns ? op.columns.filter(Boolean) : [];
        console.log(`🔍 Processing operation ${idx}: type=${op.type}, columns=${filteredColumns.length}, filteredColumns=${filteredColumns.join(',')}`);
        
        if (op.columns && filteredColumns.length > 0) {
          const colString = filteredColumns.join(',');
          const rename = op.rename && op.rename.trim() ? op.rename.trim() : '';
          const key = `${op.type}_${idx}`;
          console.log(`🔍 Operation ${idx} passed initial check: key=${key}, colString=${colString}, rename=${rename}`);
          
          // 🔧 CRITICAL FIX: Validate operations before adding (EXACTLY like manual perform)
          // For multi-column operations (add, subtract, multiply, divide, residual)
          if (["add", "subtract", "multiply", "divide", "residual"].includes(op.type)) {
            if (op.type === "residual") {
              if (op.columns.filter(Boolean).length >= 2) {
                if (rename) {
                  formData.append(`${key}_rename`, rename);
                }
                formData.append(key, colString);
                operationsAdded++;
              }
            } else {
              const colCount = filteredColumns.length;
              console.log(`🔍 Operation ${idx} (${op.type}): checking if ${colCount} >= 2`);
              if (colCount >= 2) {
                if (rename) {
                  formData.append(`${key}_rename`, rename);
                  console.log(`✅ Added ${key}_rename=${rename}`);
                }
                formData.append(key, colString);
                console.log(`✅ Added ${key}=${colString}`);
                operationsAdded++;
                console.log(`✅ Operation ${idx} added successfully. Total added: ${operationsAdded}`);
              } else {
                console.warn(`⚠️ Operation ${idx} (${op.type}) skipped: needs 2+ columns, got ${colCount}`);
              }
            }
          } else if (op.type === "stl_outlier") {
            if (op.columns.filter(Boolean).length >= 1) {
              if (rename) {
                formData.append(`${key}_rename`, rename);
              }
              formData.append(key, colString);
              operationsAdded++;
            }
          } else if (op.type === 'power') {
            if (op.param) {
              formData.append(`${key}_param`, String(op.param));
            }
            if (rename) {
              formData.append(`${key}_rename`, rename);
            }
            formData.append(key, colString);
            operationsAdded++;
          } else if (op.type === 'logistic') {
            if (op.param) {
              formData.append(`${key}_param`, JSON.stringify(op.param));
            }
            if (rename) {
              formData.append(`${key}_rename`, rename);
            }
            formData.append(key, colString);
            operationsAdded++;
          } else if (op.type === 'datetime') {
            if (op.param) {
              formData.append(`${key}_param`, String(op.param));
            }
            if (rename) {
              formData.append(`${key}_rename`, rename);
            }
            formData.append(key, colString);
            operationsAdded++;
          } else {
            // For dummy, rpi, etc., require at least 1 column
            if (rename) {
              formData.append(`${key}_rename`, rename);
            }
            formData.append(key, colString);
            operationsAdded++;
          }
          
          // Add period if user supplied for this op
          if (['detrend', 'deseasonalize', 'detrend_deseasonalize'].includes(op.type) && op.param) {
            formData.append(`${key}_period`, String(op.param));
          }
        }
      });
      
      // 🔧 CRITICAL FIX: Validate that at least one operation was added
      if (operationsAdded === 0) {
        throw new Error('No valid operations to perform. Please ensure all operations have the required columns selected.');
      }
      
      // 🔧 CRITICAL FIX: Add options field with ONLY validated operations (EXACTLY like manual perform)
      // Filter to only include operations that passed validation
      const addedOperationTypes = operations
        .map((op, idx) => {
          return op.type;
        })
        .filter((type, idx) => {
          // Filter to only include operations that passed validation
          const op = operations[idx];
          if (!op.columns || op.columns.filter(Boolean).length === 0) return false;
          
          if (["add", "subtract", "multiply", "divide", "residual"].includes(op.type)) {
            return op.columns.filter(Boolean).length >= 2;
          } else if (op.type === "stl_outlier") {
            return op.columns.filter(Boolean).length >= 1;
          }
          return true; // power, logistic, datetime, dummy, rpi, etc. are always added if they have columns
        });
      
      formData.append('options', addedOperationTypes.join(','));
      
      // 🔧 CRITICAL FIX: Match manual perform exactly - get identifiers from atom settings or use empty array
      // Manual perform uses: atom?.settings?.selectedIdentifiers || selectedIdentifiers (local state) || []
      // Don't use cfg.identifiers which might not match what's in the UI
      const currentAtom = useLaboratoryStore.getState().getAtom(atomId);
      const identifiersFromSettings = currentAtom?.settings?.selectedIdentifiers || [];
      const identifiersToUse = Array.isArray(identifiersFromSettings) && identifiersFromSettings.length > 0
        ? identifiersFromSettings
        : (cfg.identifiers || []);
      formData.append('identifiers', identifiersToUse.join(','));
      
      console.log('🔍 Identifiers being sent:', {
        fromSettings: identifiersFromSettings,
        fromConfig: cfg.identifiers,
        final: identifiersToUse,
        joined: identifiersToUse.join(',')
      });
      
      console.log('📁 Auto-executing with form data:', {
        object_names: resolvedDataSource || '',
        bucket_name: cfg.bucket_name || 'trinity',
        client_name,
        app_name,
        project_name,
        operations_count: operations.length,
        operations_added: operationsAdded,
        operations_types: addedOperationTypes,
        options: addedOperationTypes.join(','),
        operations: operations.map((op, idx) => ({
          index: idx,
          type: op.type,
          columns: op.columns,
          rename: op.rename,
          param: op.param,
          valid: (() => {
            if (!op.columns || op.columns.filter(Boolean).length === 0) return false;
            if (["add", "subtract", "multiply", "divide", "residual"].includes(op.type)) {
              return op.columns.filter(Boolean).length >= 2;
            } else if (op.type === "stl_outlier") {
              return op.columns.filter(Boolean).length >= 1;
            }
            return true;
          })()
        })),
        identifiers: identifiersToUse
      });
      
      const performEndpoint = `${CREATECOLUMN_API}/perform`;
      console.log('📡 Calling perform endpoint:', performEndpoint);
      
      // 🔧 CRITICAL DEBUG: Log FormData contents in detail
      console.log('📦 FormData payload (converted to object for logging):');
      const formDataObj: any = {};
      const formDataEntries: Array<{key: string, value: any}> = [];
      formData.forEach((value, key) => {
        formDataObj[key] = value;
        formDataEntries.push({ key, value });
      });
      console.log('📋 FormData entries:', formDataEntries);
      console.log('📋 FormData object:', formDataObj);
      
      // 🔧 CRITICAL DEBUG: Verify operations are in FormData
      const operationKeys = formDataEntries.filter(entry => /^(add|subtract|multiply|divide|power|sqrt|log|abs|dummy|rpi|residual|stl_outlier|logistic|detrend|deseasonalize|detrend_deseasonalize|exp|standardize_zscore|standardize_minmax)_\d+$/.test(entry.key));
      console.log('🔍 Operation keys found in FormData:', operationKeys);
      console.log('🔍 Options field value:', formDataObj.options);
      console.log('🔍 Operations added count:', operationsAdded);
      
      if (operationKeys.length === 0) {
        console.error('❌ CRITICAL: No operation keys found in FormData!');
        throw new Error('No operations were added to FormData. Please check operation validation.');
      }
      
      if (!formDataObj.options || formDataObj.options === '') {
        console.error('❌ CRITICAL: Options field is empty!');
        throw new Error('Options field is required but was empty.');
      }
      
      const res2 = await fetch(performEndpoint, {
        method: 'POST',
        body: formData,
      });
      
      console.log('📨 Perform endpoint response status:', res2.status);
      
      // 🔧 CRITICAL DEBUG: Get error details from backend
      if (!res2.ok) {
        let errorDetail = res2.statusText;
        try {
          const errorData = await res2.json();
          errorDetail = errorData.detail || errorData.message || errorData.error || res2.statusText;
          console.error('❌ Backend error details:', errorDetail);
          console.error('❌ Full error response:', errorData);
        } catch (e) {
          const errorText = await res2.text();
          console.error('❌ Backend error (text):', errorText);
          errorDetail = errorText || res2.statusText;
        }
        
        // Log what we sent vs what backend expects
        console.error('❌ FormData that was sent:', {
          object_names: formDataObj.object_names,
          bucket_name: formDataObj.bucket_name,
          operations: operationKeys.map(k => ({ key: k.key, value: k.value })),
          options: formDataObj.options,
          identifiers: formDataObj.identifiers,
          client_name: formDataObj.client_name,
          app_name: formDataObj.app_name,
          project_name: formDataObj.project_name
        });
      }
      
      if (res2.ok) {
        const result = await res2.json();
        console.log('✅ Auto-execution successful:', result);
        
        // 🔧 CRITICAL FIX: Extract result data and file path (like groupby)
        let parsedRows: any[] | null = null;
        let parsedCsv: string | null = null;
        let resultFilePath: string | null = null;
        
        if (result.status === 'SUCCESS' && result.result_file) {
          resultFilePath = result.result_file;
          console.log('🔄 Backend operation completed, retrieving results from saved file:', result.result_file);
          
          // Extract results from response if available
          if (result.results && Array.isArray(result.results)) {
            parsedRows = result.results;
            console.log('✅ Results extracted from perform response:', {
              rowCount: parsedRows.length,
              columns: result.columns?.length || 0
            });
          }
          
          // Try to get CSV data from cached_dataframe endpoint (like groupby)
          try {
            const rawRowCount = typeof result.row_count === 'number' && Number.isFinite(result.row_count) && result.row_count > 0
              ? Math.ceil(result.row_count)
              : parsedRows?.length;
            const pageSize = rawRowCount && rawRowCount > 0 ? rawRowCount : 100000;
            const cachedUrl = `${CREATECOLUMN_API}/cached_dataframe?object_name=${encodeURIComponent(result.result_file)}&page=1&page_size=${pageSize}`;
            const cachedRes = await fetch(cachedUrl);
            if (!cachedRes.ok) {
              throw new Error(`cached_dataframe responded with ${cachedRes.status}`);
            }

            const cachedJson = await cachedRes.json();
            parsedCsv = cachedJson?.data ?? '';
            console.log('📄 Retrieved CSV data from saved file, length:', parsedCsv.length);
            
            // Parse CSV to get actual results if not already available
            if (!parsedRows && parsedCsv) {
              const lines = parsedCsv.split('\n');
              if (lines.length > 1) {
                const headers = lines[0].split(',').map(h => h.trim().replace(/"/g, ''));
                parsedRows = lines
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
              }
            }
          } catch (fetchError) {
            console.warn('⚠️ Could not fetch cached results, using perform response data:', fetchError);
          }
        }
        
        // 🔧 CRITICAL FIX: Update atom settings with results (like groupby)
        // Use 'createResults' (not 'createColumnResults') to match CreateColumnCanvas expectations
        const finalResultFile = resultFilePath || result.result_file;
        const finalResults = parsedRows || result.results || [];
        
        updateAtomSettings(atomId, {
          operationCompleted: true,
          createResults: {
            ...(result.createResults || {}),
            result_file: finalResultFile,
            results: finalResults, // 🔧 CRITICAL: Set 'results' array for UI display
            row_count: result.row_count || finalResults.length || 0,
            columns: result.columns || [],
            new_columns: result.new_columns || []
          },
          // Also set previewFile so UI can display paginated results
          previewFile: finalResultFile,
          // Also keep createColumnResults for backward compatibility
          createColumnResults: {
            ...result,
            unsaved_data: finalResults,
            result_file: finalResultFile,
            row_count: result.row_count || finalResults.length || 0,
            columns: result.columns || []
          },
          lastUpdateTime: Date.now()
        });
        
        console.log('✅ Updated atom settings with results:', {
          result_file: finalResultFile,
          results_count: finalResults.length,
          columns: result.columns?.length || 0,
          new_columns: result.new_columns?.length || 0
        });
        
        // 🔧 CRITICAL FIX: Auto-save the result (like groupby)
        // Always save as Arrow file - perform endpoint saves CSV, we need to convert to Arrow
        try {
          // Ensure we have CSV data for auto-save
          let csvDataForSave = parsedCsv;
          if (!csvDataForSave && parsedRows && parsedRows.length > 0) {
            // Convert parsedRows to CSV if we don't have CSV data
            const headers = Object.keys(parsedRows[0]);
            const csvLines = [
              headers.join(','),
              ...parsedRows.map(row => headers.map(h => {
                const val = row[h];
                return val !== null && val !== undefined ? String(val).replace(/"/g, '""') : '';
              }).join(','))
            ];
            csvDataForSave = csvLines.join('\n');
            console.log('✅ Converted parsedRows to CSV for auto-save');
          }
          
          // If still no CSV data, try fetching from cached_dataframe
          if (!csvDataForSave && resultFilePath) {
            try {
              const cachedRes = await fetch(`${CREATECOLUMN_API}/cached_dataframe?object_name=${encodeURIComponent(resultFilePath)}`);
              if (cachedRes.ok) {
                const cachedJson = await cachedRes.json();
                csvDataForSave = cachedJson?.data ?? null;
                console.log('✅ Retrieved CSV data from cached_dataframe for auto-save');
              }
            } catch (fetchError) {
              console.warn('⚠️ Could not fetch CSV from cached_dataframe:', fetchError);
            }
          }

          const autoSavePayload = {
            unsaved_data: parsedRows || result.results || null,
            data: csvDataForSave || parsedCsv || null, // 🔧 CRITICAL: Ensure CSV data is available
            result_file: resultFilePath || result.result_file || null,
          };

          console.log('💾 Calling autoSaveStepResult with:', {
            hasUnsavedData: !!autoSavePayload.unsaved_data,
            hasCsvData: !!autoSavePayload.data,
            resultFile: autoSavePayload.result_file
          });

          await autoSaveStepResult({
            atomType: 'create-column',
            atomId,
            stepAlias: `create_transform`, // 🔧 FIX: Use simple alias without atomId/timestamp to avoid duplication (timestamp added in utils)
            result: autoSavePayload,
            updateAtomSettings,
            setMessages,
            isStreamMode: context.isStreamMode || false
          });
          
          console.log('✅ Auto-save completed successfully');
        } catch (autoSaveError) {
          console.error('❌ Create Column auto-save failed:', autoSaveError);
          // Don't fail the whole operation if auto-save fails
        }
        
        // Add success message (only in Individual AI mode, not Stream mode)
        if (!context.isStreamMode) {
          const completionDetails = {
            'Result File': resultFilePath || result.result_file || 'N/A',
            'Rows': (parsedRows?.length || result.row_count || 0).toLocaleString(),
            'Columns': (result.columns?.length || 0).toLocaleString(),
            'New Columns': result.new_columns?.length || 0
          };
          const completionMsg = createSuccessMessage('Create Column operations', completionDetails);
          completionMsg.content += '\n\n📊 Results are ready! New columns have been created and saved.\n\n💡 You can now view the results in the Create Column interface - no need to click Perform again!';
          setMessages(prev => [...prev, completionMsg]);
        }
        
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


