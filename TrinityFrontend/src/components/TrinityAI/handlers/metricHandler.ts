import { LABORATORY_API, CREATECOLUMN_API, VALIDATE_API, FEATURE_OVERVIEW_API } from '@/lib/api';
import { AtomHandler, AtomHandlerContext, AtomHandlerResponse, Message } from './types';
import { 
  getEnvironmentContext,
  getFilename, 
  createMessage,
  createSuccessMessage, 
  createErrorMessage,
  processSmartResponse,
  validateFileInput,
  constructFullPath,
  formatAgentResponseForTextBox,
  updateCardTextBox,
  addCardTextBox
} from './utils';
import { useLaboratoryStore } from '@/components/LaboratoryMode/store/laboratoryStore';
import { generateAtomInsight } from './insightGenerator';
import { resolveTaskResponse } from '@/lib/taskQueue';

// Helper function to safely call setMessages
const safeSetMessages = (setMessages: any, message: Message) => {
  if (typeof setMessages !== 'function') {
    console.error('❌ setMessages is not a function:', typeof setMessages);
    return;
  }
  try {
    setMessages((prev: Message[]) => {
      if (!Array.isArray(prev)) {
        console.warn('⚠️ setMessages prev is not an array:', prev);
        return [message];
      }
      return [...prev, message];
    });
  } catch (error: any) {
    console.error('❌ Error in safeSetMessages:', error);
    console.error('❌ Error stack:', error?.stack);
  }
};

export const metricHandler: AtomHandler = {
  handleSuccess: async (data: any, context: AtomHandlerContext): Promise<AtomHandlerResponse> => {
    // IMMEDIATE LOG - This should appear first
    console.log('🚀🚀🚀 METRIC HANDLER CALLED - FIRST LINE');
    console.log('📥 Data received:', JSON.stringify(data, null, 2));
    console.log('📥 Context received:', {
      atomId: context?.atomId,
      atomType: context?.atomType,
      hasUpdateAtomSettings: typeof context?.updateAtomSettings === 'function',
      hasSetMessages: typeof context?.setMessages === 'function',
      sessionId: context?.sessionId
    });
    
    // Validate context IMMEDIATELY
    if (!context || typeof context !== 'object') {
      console.error('❌ Context is invalid:', context);
      return { success: false, error: 'Invalid context' };
    }
    
    if (!context.setMessages || typeof context.setMessages !== 'function') {
      console.error('❌ setMessages is missing or not a function:', typeof context.setMessages);
      return { success: false, error: 'setMessages is not available' };
    }
    
    // Track error location for better debugging
    const errorLocation: string[] = [];
    
    try {
      errorLocation.push('STEP 0: Handler entry');
      console.log('🚀🚀🚀 METRIC HANDLER - handleSuccess START');
      
      // Validate data exists and is an object
      errorLocation.push('STEP 0.1: Validate data');
      if (!data || typeof data !== 'object') {
        console.error('❌ Invalid data received:', data, typeof data);
        return { success: false, error: 'Invalid data received from LLM' };
      }
      
      // Validate context exists
      errorLocation.push('STEP 0.2: Validate context');
      if (!context || typeof context !== 'object') {
        console.error('❌ Invalid context received:', context, typeof context);
        return { success: false, error: 'Invalid context received' };
      }
      
      errorLocation.push('STEP 0.3: Log data structure');
      console.log('📥 RAW DATA RECEIVED FROM LLM:', JSON.stringify(data, null, 2));
      console.log('📥 Data structure analysis:', {
        hasData: !!data.data,
        topLevelKeys: data && typeof data === 'object' ? Object.keys(data) : [],
        dataKeys: data.data && typeof data.data === 'object' ? Object.keys(data.data) : [],
        dataDataKeys: data.data?.data && typeof data.data.data === 'object' ? Object.keys(data.data.data) : [],
        operationType: data.operation_type || data.data?.operation_type || data.data?.data?.operation_type,
        hasOperationConfig: !!(data.operation_config || data.data?.operation_config || data.data?.data?.operation_config),
        hasApiEndpoint: !!(data.api_endpoint || data.data?.api_endpoint || data.data?.data?.api_endpoint)
      });
      console.log('🔍 DEBUGGING - Full data structure:');
      console.log('  - data:', data);
      console.log('  - data.data:', data.data);
      console.log('  - data.data?.data:', data.data?.data);
      console.log('  - data.operation_type:', data.operation_type);
      console.log('  - data.data?.operation_type:', data.data?.operation_type);
      console.log('  - data.data?.data?.operation_type:', data.data?.data?.operation_type);
      console.log('🆔 AtomId:', context.atomId);
      console.log('🔢 SessionId:', context.sessionId);
      
      errorLocation.push('STEP 0.4: Destructure context');
    const { atomId, updateAtomSettings, setMessages, sessionId } = context;
    
      // Validate context
      errorLocation.push('STEP 1: Validate context properties');
      if (!atomId || !updateAtomSettings || !setMessages) {
        console.error('❌ Invalid context provided to metricHandler:', { atomId, hasUpdateAtomSettings: !!updateAtomSettings, hasSetMessages: !!setMessages });
        return { success: false, error: 'Invalid handler context' };
      }
      
      // Validate setMessages is a function
      errorLocation.push('STEP 1.1: Validate setMessages function');
      if (typeof setMessages !== 'function') {
        console.error('❌ setMessages is not a function:', typeof setMessages, setMessages);
        return { success: false, error: 'setMessages is not a function' };
      }
      
      // 🔧 CRITICAL FIX: Show smart_response FIRST (like concat/merge/create-column)
      // Validate processSmartResponse exists before calling
      errorLocation.push('STEP 2: Process smart response');
      let smartResponseText = '';
      try {
        if (typeof processSmartResponse === 'function') {
          smartResponseText = processSmartResponse(data);
          console.log('💬 Smart response text:', smartResponseText);
        } else {
          console.warn('⚠️ processSmartResponse is not a function, using fallback');
          smartResponseText = data.smart_response || data.data?.smart_response || '';
        }
      } catch (smartResponseError: any) {
        console.error('❌ Error calling processSmartResponse:', smartResponseError);
        console.error('❌ Error stack:', smartResponseError?.stack);
        console.error('❌ Error location:', errorLocation.join(' -> '));
        smartResponseText = data.smart_response || data.data?.smart_response || '';
      }
    
      if (smartResponseText) {
        errorLocation.push('STEP 2.1: Add smart response to chat');
        try {
          const smartMsg: Message = {
            id: (Date.now() + 1).toString(),
            content: smartResponseText,
            sender: 'ai',
            timestamp: new Date(),
          };
          console.log('📤 Sending smart response message to chat...');
          if (typeof setMessages === 'function') {
            setMessages((prev: Message[]) => {
              if (!Array.isArray(prev)) {
                console.warn('⚠️ setMessages prev is not an array:', prev);
                return [smartMsg];
              }
              return [...prev, smartMsg];
            });
          } else {
            console.error('❌ setMessages is not a function when trying to add smart response');
          }
          console.log('✅ Displayed smart_response to user:', smartResponseText);
        } catch (msgError: any) {
          console.error('❌ Error setting smart response message:', msgError);
          console.error('❌ Error stack:', msgError?.stack);
          console.error('❌ Error location:', errorLocation.join(' -> '));
          throw msgError; // Re-throw to be caught by outer catch
        }
      }
    
      // Extract operation type and configuration
      errorLocation.push('STEP 3: Extract operation data');
      // Handle nested data structure: data.data contains the actual response from backend
      let responseData: any = {};
      let operationType = '';
      let operationConfig: any = {};
      let dataSource = '';
      let apiEndpoint = '';
      let apiEndpointSave = '';
      
      try {
        // Handle nested structure: API returns {success: true, data: {actual_json}, ...}
        // OR top-level structure: {success: true, operation_type: "...", operation_config: {...}, ...}
        // The actual JSON from AI can be in data.data, data, or at top level
        responseData = data.data?.data || data.data || data;
        
        console.log('🔍 DEBUGGING - Extraction check:');
        console.log('  - Full data object:', JSON.stringify(data, null, 2));
        console.log('  - data.data:', data.data);
        console.log('  - data.data?.data:', data.data?.data);
        console.log('  - responseData:', responseData);
        console.log('  - responseData.operation_type:', responseData.operation_type);
        console.log('  - responseData.operation_config:', responseData.operation_config);
        console.log('  - responseData.columns:', responseData.operation_config?.columns);
        console.log('  - Top-level data.operation_type:', data.operation_type);
        console.log('  - Top-level data.operation_config:', data.operation_config);
        
        // Extract with fallback chain - check all possible locations
        operationType = (
          responseData.operation_type || 
          data.operation_type || 
          data.data?.operation_type || 
          data.data?.data?.operation_type || 
          ''
        ).toLowerCase();
        
        operationConfig = 
          responseData.operation_config || 
          data.operation_config || 
          data.data?.operation_config || 
          data.data?.data?.operation_config || 
          {};
        
        dataSource = 
          responseData.data_source || 
          data.data_source || 
          data.data?.data_source || 
          data.data?.data?.data_source || 
          '';
        
        apiEndpoint = 
          responseData.api_endpoint || 
          data.api_endpoint || 
          data.data?.api_endpoint || 
          data.data?.data?.api_endpoint || 
          '';
        
        apiEndpointSave = 
          responseData.api_endpoint_save || 
          data.api_endpoint_save || 
          data.data?.api_endpoint_save || 
          data.data?.data?.api_endpoint_save || 
          '';
        
        console.log('✅ Extracted values:', {
          operationType,
          hasOperationConfig: !!operationConfig,
          operationConfigKeys: operationConfig && typeof operationConfig === 'object' ? Object.keys(operationConfig) : [],
          dataSource,
          apiEndpoint,
          apiEndpointSave,
          columnsType: operationConfig.columns ? typeof operationConfig.columns : 'undefined',
          columnsIsArray: Array.isArray(operationConfig.columns),
          operationConfigMethod: operationConfig.method,
          operationConfigColumns: operationConfig.columns,
          operationConfigRename: operationConfig.rename
        });
        
        // CRITICAL VALIDATION: Ensure we have required data
        if (!operationType) {
          console.error('❌ CRITICAL: operationType is empty after extraction!');
          console.error('❌ Available data keys:', Object.keys(data || {}));
          console.error('❌ responseData keys:', Object.keys(responseData || {}));
          throw new Error('Failed to extract operation_type from response');
        }
        
        if (!operationConfig || typeof operationConfig !== 'object' || Object.keys(operationConfig).length === 0) {
          console.error('❌ CRITICAL: operationConfig is empty or invalid after extraction!');
          throw new Error('Failed to extract operation_config from response');
        }
        
        console.log('✅ Validation passed - proceeding with operation type:', operationType);
      } catch (extractError: any) {
        console.error('❌ Error extracting operation data:', extractError);
        console.error('❌ Error stack:', extractError?.stack);
        console.error('❌ Error location:', errorLocation.join(' -> '));
        throw new Error(`Failed to extract operation data: ${extractError?.message || 'Unknown error'}`);
      }
    
    console.log('🔍 Extracted metric operation details:', {
      hasResponseData: !!responseData,
      responseDataKeys: responseData && typeof responseData === 'object' ? Object.keys(responseData) : [],
      operationType,
      hasOperationConfig: !!operationConfig,
      operationConfigKeys: operationConfig && typeof operationConfig === 'object' ? Object.keys(operationConfig) : [],
      dataSource,
      apiEndpoint,
      apiEndpointSave,
      columnsType: operationConfig && operationConfig.columns ? typeof operationConfig.columns : 'undefined',
      columnsIsArray: Array.isArray(operationConfig?.columns)
    });
    
    // Show reasoning in chat
      errorLocation.push('STEP 4: Show reasoning');
      const reasoningText = responseData.reasoning || data.reasoning || data.data?.reasoning || data.data?.data?.reasoning || '';
    if (reasoningText) {
        try {
      const reasoningMsg: Message = {
            id: (Date.now() + 2).toString(),
        content: `**Reasoning:**\n${reasoningText}`,
        sender: 'ai',
        timestamp: new Date(),
      };
          // Add defensive check for setMessages
          setMessages((prev: Message[]) => {
            if (!Array.isArray(prev)) {
              console.warn('⚠️ setMessages prev is not an array in reasoning:', prev);
              return [reasoningMsg];
            }
            return [...prev, reasoningMsg];
          });
        } catch (msgError: any) {
          console.error('❌ Error setting reasoning message:', msgError);
          console.error('❌ Error stack:', msgError?.stack);
          console.error('❌ Error location:', errorLocation.join(' -> '));
        }
      }
      
      // Format and update card text box (optional - skip if atom doesn't exist)
      errorLocation.push('STEP 5: Format and update text box');
      let textBoxContent = '';
      try {
        if (typeof formatAgentResponseForTextBox === 'function') {
          textBoxContent = formatAgentResponseForTextBox(data);
        } else {
          console.warn('⚠️ formatAgentResponseForTextBox is not a function, using fallback');
          textBoxContent = reasoningText || 'No response data available.';
        }
        
        // Try to update card text box, but don't fail if atom doesn't exist
        if (typeof updateCardTextBox === 'function') {
    try {
      await updateCardTextBox(atomId, textBoxContent);
          } catch (textBoxError: any) {
            // Atom might not exist - that's okay for metric handler
            if (textBoxError?.message?.includes('Atom not found')) {
              console.log('ℹ️ Atom not found for text box update (expected for metric handler)');
            } else {
              console.warn('⚠️ Error updating card text box:', textBoxError);
            }
          }
        } else {
          console.warn('⚠️ updateCardTextBox is not a function, skipping');
        }
      } catch (error: any) {
        console.error('❌ Error formatting/updating text box:', error);
        console.error('❌ Error stack:', error?.stack);
        console.error('❌ Error location:', errorLocation.join(' -> '));
        textBoxContent = reasoningText || 'No response data available.';
      }
      
      // Store agent response in atom settings
      errorLocation.push('STEP 6: Store agent response');
      try {
    updateAtomSettings(atomId, {
          agentResponse: { reasoning: reasoningText, formattedText: textBoxContent }
    });
      } catch (settingsError: any) {
        console.error('❌ Error updating atom settings:', settingsError);
        console.error('❌ Error stack:', settingsError?.stack);
        console.error('❌ Error location:', errorLocation.join(' -> '));
      }
    
      // Add "Generating insight..." message (optional - skip if atom doesn't exist)
      errorLocation.push('STEP 7: Add insight text box');
    await new Promise(resolve => setTimeout(resolve, 500));
      try {
        if (typeof addCardTextBox === 'function') {
    try {
      await addCardTextBox(atomId, 'Generating insight...', 'AI Insight');
          } catch (textBoxError: any) {
            // Atom might not exist - that's okay for metric handler
            if (textBoxError?.message?.includes('Atom not found')) {
              console.log('ℹ️ Atom not found for insight text box (expected for metric handler)');
            } else {
              console.warn('⚠️ Error adding insight text box:', textBoxError);
            }
          }
        } else {
          console.warn('⚠️ addCardTextBox is not a function, skipping');
        }
      } catch (error: any) {
        console.error('❌ Error adding card text box:', error);
        console.error('❌ Error stack:', error?.stack);
        console.error('❌ Error location:', errorLocation.join(' -> '));
        // Continue on error
      }
      
      // Get environment context
      errorLocation.push('STEP 8: Get environment context');
      let envContext: any = {};
      try {
        if (typeof getEnvironmentContext === 'function') {
          envContext = getEnvironmentContext();
        } else {
          console.warn('⚠️ getEnvironmentContext is not a function, using empty object');
          envContext = {};
        }
      } catch (envError: any) {
        console.error('❌ Error getting environment context:', envError);
        console.error('❌ Error stack:', envError?.stack);
        console.error('❌ Error location:', errorLocation.join(' -> '));
        envContext = {};
      }
    
    // Map AI file paths to correct file paths for UI compatibility (same as create-column/merge)
    let mappedDataSource = dataSource;
    let matchedFrame: any = null;
    
    try {
      console.log('🔄 Fetching frames to map AI file paths for metric...');
      const framesResponse = await fetch(`${VALIDATE_API}/list_saved_dataframes`);
      if (framesResponse.ok) {
        const framesData = await framesResponse.json();
        const frames = Array.isArray(framesData.files) ? framesData.files : [];
        
        console.log('📋 Available frames for metric:', frames.map((f: any) => ({ object_name: f.object_name, csv_name: f.csv_name })));
        
        const mapFilePathToObjectName = (aiFilePath: string) => {
          if (!aiFilePath) return aiFilePath;
          
          // Try exact match first
          let exactMatch = frames.find((f: any) => f.object_name === aiFilePath);
          if (exactMatch) {
            console.log(`✅ Exact match found for metric ${aiFilePath}: ${exactMatch.object_name}`);
            matchedFrame = exactMatch;
            return exactMatch.object_name;
          }
          
          // Try matching by filename
          const aiFileName = aiFilePath.includes('/') ? aiFilePath.split('/').pop() : aiFilePath;
          let filenameMatch = frames.find((f: any) => {
            const frameFileName = f.csv_name.split('/').pop() || f.csv_name;
            return frameFileName === aiFileName;
          });
          
          if (filenameMatch) {
            console.log(`✅ Filename match found for metric ${aiFilePath} -> ${filenameMatch.object_name}`);
            matchedFrame = filenameMatch;
            return filenameMatch.object_name;
          }
          
          // Try partial match
          let partialMatch = frames.find((f: any) => 
            f.object_name.includes(aiFileName) || 
            f.csv_name.includes(aiFileName) ||
            aiFilePath.includes(f.object_name) ||
            aiFilePath.includes(f.csv_name)
          );
          
          if (partialMatch) {
            console.log(`✅ Partial match found for metric ${aiFilePath} -> ${partialMatch.object_name}`);
            matchedFrame = partialMatch;
            return partialMatch.object_name;
          }

          // Try alias match by base name (handles timestamped auto-save filenames)
          const aiBaseName = aiFileName ? aiFileName.replace(/\.[^.]+$/, '') : '';
          if (aiBaseName) {
            let aliasMatch = frames.find((f: any) => {
              const candidate =
                (f.object_name?.split('/').pop() ||
                  f.csv_name?.split('/').pop() ||
                  '').replace(/\.[^.]+$/, '');
              return candidate.startsWith(aiBaseName);
            });

            if (aliasMatch) {
              console.log(`✅ Alias match found for metric ${aiFilePath} -> ${aliasMatch.object_name}`);
              matchedFrame = aliasMatch;
              return aliasMatch.object_name;
            }
          }
          
          console.log(`⚠️ No match found for metric ${aiFilePath}, using original value`);
          return aiFilePath;
        };
        
        mappedDataSource = mapFilePathToObjectName(dataSource);
        
        console.log('🔧 Metric file path mapping results:', {
          original_dataSource: dataSource,
          mapped_dataSource: mappedDataSource
        });
      } else {
        console.warn('⚠️ Failed to fetch frames for metric mapping, using original file path');
      }
    } catch (error) {
      console.error('❌ Error fetching frames for metric mapping:', error);
    }
    
    // Build environment context with fallbacks from matched file and AI payload
    let envWithFallback = (() => {
      const derived = { ...envContext };
      const candidatePath = matchedFrame?.object_name || mappedDataSource || dataSource || '';

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

    // Hydrate environment context
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
        }
      } catch (err) {
        console.warn('⚠️ Failed to hydrate metric environment context:', err);
      }
    };

    await hydrateEnvContext();
    
    // Ensure full object name
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

      const constructed = constructFullPath(objectName, envWithFallback);
      if (constructed && constructed !== objectName) {
        return constructed;
      }

      return objectName;
    };

    const resolvedDataSource = await ensureFullObjectName(mappedDataSource || dataSource || '');

    console.log('🧭 Resolved metric data source:', {
      original: dataSource,
      mappedDataSource,
      resolvedDataSource,
      client_name: envWithFallback.client_name,
      app_name: envWithFallback.app_name,
      project_name: envWithFallback.project_name
    });

    // STEP 1: Handle Input Operation (no backend call)
    if (operationType === 'input') {
      console.log('📋 Handling Input operation - updating state only');
      
      if (!resolvedDataSource) {
        const errorMsg = createErrorMessage('Input operation', 'No data source specified', '');
        try {
          setMessages((prev: Message[]) => {
            if (!Array.isArray(prev)) {
              console.warn('⚠️ setMessages prev is not an array:', prev);
              return [errorMsg];
            }
            return [...prev, errorMsg];
          });
        } catch (msgError) {
          console.error('❌ Error setting error message:', msgError);
        }
        return { success: false, error: 'No data source specified' };
      }
      
      // Update Properties Panel state
      try {
        const store = useLaboratoryStore.getState();
        if (store && typeof store.updateMetricsInputs === 'function') {
          store.updateMetricsInputs({
            currentTab: 'input',
            dataSource: resolvedDataSource,
          });
        }
      } catch (storeError) {
        console.warn('Failed to update Properties Panel state:', storeError);
      }
      
      // Update atom settings
      updateAtomSettings(atomId, {
        operationType: 'input',
        operationConfig,
        operationCompleted: true,
        dataSource: resolvedDataSource,
        file_key: resolvedDataSource,
        envContext: envWithFallback,
        lastUpdateTime: Date.now()
        });
        
        const successMsg = createSuccessMessage(
          'Data source selected',
        { message: `Selected data source: ${getFilename(resolvedDataSource)}`, fileName: getFilename(resolvedDataSource) }
      );
      try {
        setMessages((prev: Message[]) => {
          if (!Array.isArray(prev)) {
            console.warn('⚠️ setMessages prev is not an array:', prev);
            return [successMsg];
          }
          return [...prev, successMsg];
        });
      } catch (msgError) {
        console.error('❌ Error setting success message:', msgError);
      }
      
      // Generate insight
      generateAtomInsight({
        data,
        atomType: 'metric',
        sessionId,
        atomId,
      }).catch((error) => {
        console.error('❌ Error generating insight:', error);
      });
      
      return { success: true };
    }
    
    // STEP 2: Handle Variables Operation
    if (operationType === 'variables') {
      console.log('📋 Handling Variables operation');
      
      if (!resolvedDataSource) {
        const errorMsg = createErrorMessage('Variables operation', 'No data source specified', '');
        try {
          setMessages((prev: Message[]) => {
            if (!Array.isArray(prev)) {
              console.warn('⚠️ setMessages prev is not an array:', prev);
              return [errorMsg];
            }
            return [...prev, errorMsg];
          });
        } catch (msgError) {
          console.error('❌ Error setting error message:', msgError);
        }
        return { success: false, error: 'No data source specified' };
      }
      
      // Determine endpoint from api_endpoint or variable_type
      let endpoint = apiEndpoint;
      const variableType = operationConfig.variable_type?.toLowerCase() || 'dataframe';
      
      if (!endpoint || endpoint === 'null' || endpoint === 'None') {
        // Fallback: determine based on variable_type
        endpoint = variableType === 'constant' 
          ? `${LABORATORY_API}/variables/assign`
          : `${LABORATORY_API}/variables/compute`;
        console.log('⚠️ No api_endpoint in JSON, using fallback:', endpoint);
      } else {
        // Ensure full URL if relative path provided
        // Remove duplicate /laboratory prefix if present
        if (endpoint.startsWith('/laboratory/')) {
          endpoint = endpoint.replace('/laboratory', '');
        }
        if (endpoint.startsWith('/')) {
          endpoint = `${LABORATORY_API}${endpoint}`;
        } else if (!endpoint.startsWith('http')) {
          endpoint = `${LABORATORY_API}/${endpoint}`;
        }
        console.log('✅ Using api_endpoint from JSON:', endpoint);
      }
      
      try {
        let backendResult: any;
        
        // Constant mode: POST /laboratory/variables/assign
        if (variableType === 'constant' || endpoint.includes('/assign')) {
          const assignments = operationConfig.assignments || [];
          if (!Array.isArray(assignments) || assignments.length === 0) {
            const errorMsg = createErrorMessage(
              'Variables operation',
              'No assignments specified',
              'Please ensure at least one assignment is provided for constant variables'
            );
            try {
              setMessages((prev: Message[]) => {
                if (!Array.isArray(prev)) {
                  console.warn('⚠️ setMessages prev is not an array:', prev);
                  return [errorMsg];
                }
                return [...prev, errorMsg];
              });
            } catch (msgError) {
              console.error('❌ Error setting error message:', msgError);
            }
            return { success: false, error: 'No assignments specified' };
          }
          
          // Build payload EXACTLY as backend expects (from MANUAL_SELECTION_BACKEND_FLOW.md)
          const assignPayload = {
            assignments: assignments.map((a: any) => ({
              variableName: a.variableName || a.variable_name || '',  // camelCase
              value: a.value || ''
            })),
            dataSource: resolvedDataSource,  // camelCase
            clientName: envWithFallback.client_name,  // camelCase
            appName: envWithFallback.app_name,  // camelCase
            projectName: envWithFallback.project_name,  // camelCase
            confirmOverwrite: false
          };
          
          console.log('📤 SENDING TO BACKEND (/laboratory/variables/assign):');
          console.log('  Endpoint:', endpoint);
          console.log('  Method: POST');
          console.log('  Content-Type: application/json');
          console.log('  Payload:', JSON.stringify(assignPayload, null, 2));
          console.log('  Extracted from LLM JSON:', {
            variableType,
            assignments: operationConfig.assignments,
            dataSource: resolvedDataSource
          });
          
          const assignResponse = await fetch(endpoint, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            credentials: 'include',
            body: JSON.stringify(assignPayload)
          });
          
          if (!assignResponse.ok) {
            const errorText = await assignResponse.text();
            throw new Error(`Variables assign failed: ${assignResponse.status} ${errorText}`);
          }
          
          backendResult = await assignResponse.json();
          console.log('✅ Variables assign successful:', backendResult);
          
        } else {
          // Dataframe mode: POST /laboratory/variables/compute
          const operations = operationConfig.operations || [];
          if (!Array.isArray(operations) || operations.length === 0) {
            const errorMsg = createErrorMessage(
              'Variables operation',
              'No operations specified',
              'Please ensure at least one operation is provided'
            );
            try {
              setMessages((prev: Message[]) => {
                if (!Array.isArray(prev)) {
                  console.warn('⚠️ setMessages prev is not an array:', prev);
                  return [errorMsg];
                }
                return [...prev, errorMsg];
              });
            } catch (msgError) {
              console.error('❌ Error setting error message:', msgError);
            }
            return { success: false, error: 'No operations specified' };
          }
          
          // Fetch actual column names from backend to map LLM column names (case-insensitive)
          let actualColumnMap: Record<string, string> = {};
          try {
            console.log('🔍 Fetching actual column names for variables operation...');
            const columnSummaryRes = await fetch(`${FEATURE_OVERVIEW_API}/column_summary?object_name=${encodeURIComponent(resolvedDataSource)}`);
            if (columnSummaryRes.ok) {
              const columnSummaryRaw = await columnSummaryRes.json();
              const columnSummaryData = await resolveTaskResponse<{ summary?: any[] }>(columnSummaryRaw);
              const columnSummary = (columnSummaryData.summary || []).filter(Boolean);
              
              // Create case-insensitive map: lowercase -> actual case
              columnSummary.forEach((col: any) => {
                const actualName = (col.column || '').trim();
                if (actualName) {
                  const lowerName = actualName.toLowerCase();
                  actualColumnMap[lowerName] = actualName;
                }
              });
              
              console.log('✅ Column name mapping created:', Object.keys(actualColumnMap).length, 'columns');
            }
          } catch (colMapError) {
            console.warn('⚠️ Failed to fetch column names for mapping, using LLM names as-is:', colMapError);
          }
          
          // Format operations - backend expects exact camelCase field names, correct column case, and id field
          const formattedOperations = operations.map((op: any, index: number) => {
            // Map numericalColumn to actual case from backend
            const llmNumericalCol = (op.numericalColumn || op.numerical_column || '').trim();
            const lowerNumericalCol = llmNumericalCol.toLowerCase();
            const mappedNumericalColumn = actualColumnMap[lowerNumericalCol] || llmNumericalCol;
            
            const formatted: any = {
              id: op.id || String(index + 1),  // Backend requires id field (use provided or generate)
              numericalColumn: mappedNumericalColumn,  // camelCase + correct case
                method: op.method || 'sum'
              };
              
            // Map secondColumn to actual case from backend (if present)
              if (op.secondColumn || op.second_column) {
              const llmSecondCol = (op.secondColumn || op.second_column).trim();
              const lowerSecondCol = llmSecondCol.toLowerCase();
              formatted.secondColumn = actualColumnMap[lowerSecondCol] || llmSecondCol;  // camelCase + correct case
            } else if (op.secondValue !== undefined && op.secondValue !== null) {
              formatted.secondValue = op.secondValue;  // camelCase
            } else if (op.second_value !== undefined && op.second_value !== null) {
              formatted.secondValue = op.second_value;
            }
            
              if (op.customName || op.custom_name) {
              formatted.customName = op.customName || op.custom_name;  // camelCase
            }
            
            // Log mapping if it changed
            if (mappedNumericalColumn !== llmNumericalCol) {
              console.log(`  - Mapped numericalColumn: "${llmNumericalCol}" -> "${mappedNumericalColumn}"`);
            }
            if (formatted.secondColumn && formatted.secondColumn !== (op.secondColumn || op.second_column)) {
              console.log(`  - Mapped secondColumn: "${op.secondColumn || op.second_column}" -> "${formatted.secondColumn}"`);
            }
            
            return formatted;
          }).filter((op: any) => op.numericalColumn);
          
          if (formattedOperations.length === 0) {
            const errorMsg = createErrorMessage(
              'Variables operation',
              'No valid operations found',
              'Operations must have numericalColumn field'
            );
            try {
              setMessages((prev: Message[]) => {
                if (!Array.isArray(prev)) {
                  console.warn('⚠️ setMessages prev is not an array:', prev);
                  return [errorMsg];
                }
                return [...prev, errorMsg];
              });
            } catch (msgError) {
              console.error('❌ Error setting error message:', msgError);
            }
            return { success: false, error: 'No valid operations' };
          }
          
          const computeMode = operationConfig.compute_mode || operationConfig.computeMode || 'whole-dataframe';
          const computePayload: any = {
            dataSource: resolvedDataSource,  // camelCase
            computeMode: computeMode,  // camelCase
            operations: formattedOperations,
            clientName: envWithFallback.client_name,  // camelCase
            appName: envWithFallback.app_name,  // camelCase
            projectName: envWithFallback.project_name  // camelCase
          };
          
          // Add identifiers only if within-group mode
          if (computeMode === 'within-group' && operationConfig.identifiers) {
            computePayload.identifiers = operationConfig.identifiers;
          }
          
          console.log('📤 SENDING TO BACKEND (/laboratory/variables/compute):');
          console.log('  Endpoint:', endpoint);
          console.log('  Method: POST');
          console.log('  Content-Type: application/json');
          console.log('  Payload:', JSON.stringify(computePayload, null, 2));
          console.log('  Extracted from LLM JSON:', {
            variableType,
            computeMode: operationConfig.compute_mode || operationConfig.computeMode,
            operations: operationConfig.operations,
            identifiers: operationConfig.identifiers,
            dataSource: resolvedDataSource
          });
          
          const computeResponse = await fetch(endpoint, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            credentials: 'include',
            body: JSON.stringify(computePayload)
          });
          
          if (!computeResponse.ok) {
            const errorText = await computeResponse.text();
            throw new Error(`Variables compute failed: ${computeResponse.status} ${errorText}`);
          }
          
          backendResult = await computeResponse.json();
          console.log('✅ Variables compute successful:', backendResult);
          
          // Refresh saved variables list after successful creation
          // Trigger refresh by updating a timestamp in the store
          try {
            const store = useLaboratoryStore.getState();
            if (store && typeof store.updateMetricsInputs === 'function') {
              // Update with a refresh trigger timestamp
              store.updateMetricsInputs({
                variablesRefreshTrigger: Date.now(), // This will trigger VariableTab to refresh
              });
            }
          } catch (refreshError) {
            console.warn('Failed to trigger variables refresh:', refreshError);
          }
        }
        
        // Update atom settings
        updateAtomSettings(atomId, {
          operationType: 'variables',
          variableType,
          operationConfig,
          operationCompleted: backendResult.success !== false,
          dataSource: resolvedDataSource,
          file_key: resolvedDataSource,
          envContext: envWithFallback,
          lastUpdateTime: Date.now()
        });
        
        // Sync Properties Panel state
        try {
          const store = useLaboratoryStore.getState();
          if (store && typeof store.updateMetricsInputs === 'function') {
            store.updateMetricsInputs({
              currentTab: 'variables',
              variableType: variableType,
              computeWithinGroup: operationConfig.compute_mode === 'within-group',
              variableOperations: operationConfig.operations || [],
              constantAssignments: operationConfig.assignments || [],
              selectedVariableIdentifiers: operationConfig.identifiers || [],
              dataSource: resolvedDataSource,
              variablesRefreshTrigger: Date.now(), // Trigger refresh of saved variables
            });
          }
        } catch (storeError) {
          console.warn('Failed to update Properties Panel state:', storeError);
        }
        
        const successMsg = variableType === 'constant'
          ? createSuccessMessage('Variables created', { 
              message: `Successfully created ${(backendResult.newVariables || backendResult.new_variables || []).length} constant variable(s)`
            })
          : createSuccessMessage('Variables created', { 
              message: `Successfully created ${(backendResult.newColumns || backendResult.new_columns || []).length} variable(s)`
            });
        try {
          setMessages((prev: Message[]) => {
            if (!Array.isArray(prev)) {
              console.warn('⚠️ setMessages prev is not an array:', prev);
              return [successMsg];
            }
            return [...prev, successMsg];
          });
        } catch (msgError) {
          console.error('❌ Error setting success message:', msgError);
        }
        
        // Generate insight
        generateAtomInsight({
          data: { ...data, backend_result: backendResult, operation_type: operationType },
          atomType: 'metric',
          sessionId,
          atomId
        }).catch(() => {});
        
        return { success: true };
        
      } catch (error) {
        console.error('❌ Error calling variables endpoint:', error);
        try {
        const errorMsg = createErrorMessage(
          'Variables operation',
          (error as Error).message || 'Unknown error',
            ''
          );
          setMessages((prev: Message[]) => {
            if (!Array.isArray(prev)) {
              console.warn('⚠️ setMessages prev is not an array:', prev);
              return [errorMsg];
            }
            return [...prev, errorMsg];
          });
        } catch (msgError) {
          console.error('❌ Error setting error message:', msgError);
        }
        return { success: false, error: (error as Error).message };
      }
    }
    
    // STEP 3: Handle Column Ops Operation
    console.log('🔍 Checking operation type:', {
      operationType,
      isColumnOps: operationType === 'column_ops',
      operationTypeLower: operationType?.toLowerCase(),
      allOperationTypes: ['input', 'variables', 'column_ops']
    });
    
    if (operationType === 'column_ops') {
      console.log('✅ MATCHED: Column Ops operation detected - proceeding with handler');
      console.log('📋 Handling Column Ops operation');
      
      if (!resolvedDataSource) {
        const errorMsg = createErrorMessage('Column operation', 'No data source specified', '');
        try {
          setMessages((prev: Message[]) => {
            if (!Array.isArray(prev)) {
              console.warn('⚠️ setMessages prev is not an array:', prev);
              return [errorMsg];
            }
            return [...prev, errorMsg];
          });
        } catch (msgError) {
          console.error('❌ Error setting error message:', msgError);
        }
        return { success: false, error: 'No data source specified' };
      }
      
      // Build endpoints
      // Handle endpoint construction - LLM returns paths like "/create-column/perform"
      // but CREATECOLUMN_API already includes "/api/create-column"
      let performEndpoint = apiEndpoint;
      let saveEndpoint = apiEndpointSave;
      
      if (!performEndpoint || performEndpoint === 'null' || performEndpoint === 'None') {
        performEndpoint = `${CREATECOLUMN_API}/perform`;
        console.log('⚠️ No api_endpoint in JSON, using fallback:', performEndpoint);
      } else if (performEndpoint.startsWith('http')) {
        // Already a full URL, use as-is
        // Do nothing
      } else if (performEndpoint.startsWith('/create-column/')) {
        // LLM returned "/create-column/perform" - strip "/create-column" prefix
        const path = performEndpoint.replace(/^\/create-column/, '');
        performEndpoint = `${CREATECOLUMN_API}${path}`;
      } else if (performEndpoint.startsWith('/')) {
        // Other absolute path like "/perform" - append to CREATECOLUMN_API
        performEndpoint = `${CREATECOLUMN_API}${performEndpoint}`;
      } else {
        // Relative path like "perform" - append with /
        performEndpoint = `${CREATECOLUMN_API}/${performEndpoint}`;
      }
      console.log('✅ Using perform endpoint:', performEndpoint);
      
      if (!saveEndpoint || saveEndpoint === 'null' || saveEndpoint === 'None') {
        saveEndpoint = `${CREATECOLUMN_API}/save`;
        console.log('⚠️ No api_endpoint_save in JSON, using fallback:', saveEndpoint);
      } else if (saveEndpoint.startsWith('http')) {
        // Already a full URL, use as-is
        // Do nothing
      } else if (saveEndpoint.startsWith('/create-column/')) {
        // LLM returned "/create-column/save" - strip "/create-column" prefix
        const path = saveEndpoint.replace(/^\/create-column/, '');
        saveEndpoint = `${CREATECOLUMN_API}${path}`;
      } else if (saveEndpoint.startsWith('/')) {
        // Other absolute path like "/save" - append to CREATECOLUMN_API
        saveEndpoint = `${CREATECOLUMN_API}${saveEndpoint}`;
      } else {
        // Relative path like "save" - append with /
        saveEndpoint = `${CREATECOLUMN_API}/${saveEndpoint}`;
      }
      console.log('✅ Using save endpoint:', saveEndpoint);
      
      const method = operationConfig.method || operationConfig.operation_type || '';
      // Ensure columns is always an array
      let columns: any[] = [];
      if (Array.isArray(operationConfig.columns)) {
        columns = operationConfig.columns;
      } else if (operationConfig.columns) {
        // If it's not an array but exists, try to convert it
        columns = [operationConfig.columns].filter(Boolean);
      }
      
      const rename = operationConfig.rename || operationConfig.new_column_name || operationConfig.newColumnName || '';
      const parameters = operationConfig.parameters || {};
      
      // Ensure identifiers is always an array
      let identifiers: any[] = [];
      if (Array.isArray(operationConfig.identifiers)) {
        identifiers = operationConfig.identifiers;
      } else if (operationConfig.identifiers) {
        identifiers = [operationConfig.identifiers].filter(Boolean);
      }
      
      console.log('🔍 Column Ops extracted values:', {
        method,
        columns,
        columnsIsArray: Array.isArray(columns),
        columnsLength: columns.length,
        rename,
        parameters,
        identifiers,
        identifiersIsArray: Array.isArray(identifiers)
      });
      
      if (!method || !Array.isArray(columns) || columns.length === 0) {
        const errorMsg = createErrorMessage(
          'Column operation',
          'Missing required fields: method and columns',
          'Please ensure the operation configuration includes method and columns'
        );
        try {
          setMessages((prev: Message[]) => {
            if (!Array.isArray(prev)) {
              console.warn('⚠️ setMessages prev is not an array:', prev);
              return [errorMsg];
            }
            return [...prev, errorMsg];
          });
        } catch (msgError) {
          console.error('❌ Error setting error message:', msgError);
        }
        return { success: false, error: 'Missing required fields' };
      }
      
      try {
        console.log('🚀 ABOUT TO BUILD FORMDATA AND SEND TO BACKEND');
        console.log('🔍 Operation config before processing:', {
          method: operationConfig.method,
          columns: operationConfig.columns,
          columnsType: typeof operationConfig.columns,
          columnsIsArray: Array.isArray(operationConfig.columns),
          rename: operationConfig.rename,
          parameters: operationConfig.parameters,
          identifiers: operationConfig.identifiers
        });
        
        // STEP 3.1: Perform operations (POST /create-column/perform)
        // First, fetch actual column names from backend to map LLM column names correctly
        console.log('🔍 Fetching actual column names from backend...');
        let actualColumnMap: Record<string, string> = {}; // Maps lowercase -> actual case
        try {
          const columnSummaryRes = await fetch(`${FEATURE_OVERVIEW_API}/column_summary?object_name=${encodeURIComponent(resolvedDataSource)}`);
          if (columnSummaryRes.ok) {
            const columnSummaryRaw = await columnSummaryRes.json();
            const columnSummaryData = await resolveTaskResponse<{ summary?: any[] }>(columnSummaryRaw);
            const columnSummary = (columnSummaryData.summary || []).filter(Boolean);
            
            // Build map: lowercase column name -> actual column name
            columnSummary.forEach((col: any) => {
              if (col.column) {
                const actualName = String(col.column).trim();
                const lowerName = actualName.toLowerCase();
                actualColumnMap[lowerName] = actualName;
              }
            });
            
            console.log('✅ Fetched column names:', {
              totalColumns: columnSummary.length,
              sampleColumns: columnSummary.slice(0, 5).map((c: any) => c.column),
              columnMapSample: Object.entries(actualColumnMap).slice(0, 5)
            });
          } else {
            console.warn('⚠️ Failed to fetch column summary, will use LLM column names as-is');
          }
        } catch (columnFetchError: any) {
          console.warn('⚠️ Error fetching column summary:', columnFetchError);
          // Continue with LLM column names as-is
        }
        
        // Build FormData EXACTLY as MetricsColOps.tsx does (from MANUAL_SELECTION_BACKEND_FLOW.md)
        const formData = new FormData();
        formData.append('object_names', resolvedDataSource);
        formData.append('bucket_name', 'trinity');
        
        // Filter and validate columns, then map to actual column names
        // Ensure columns is an array before calling array methods
        if (!Array.isArray(columns)) {
          console.error('❌ Columns is not an array:', columns, typeof columns);
          throw new Error(`Columns must be an array, got ${typeof columns}`);
        }
        
        // Map LLM column names to actual column names from backend (case-insensitive)
        const mappedColumns = columns
          .filter((c: any) => c !== null && c !== undefined && String(c).trim())
          .map((c: any) => {
            const llmColumnName = String(c).trim();
            const lowerName = llmColumnName.toLowerCase();
            
            // Try to find actual column name from backend
            if (actualColumnMap[lowerName]) {
              const actualName = actualColumnMap[lowerName];
              console.log(`  - Mapping "${llmColumnName}" -> "${actualName}"`);
              return actualName;
            } else {
              // If not found in map, use LLM name as-is (might be correct already)
              console.log(`  - Using LLM column name as-is: "${llmColumnName}"`);
              return llmColumnName;
            }
          });
        
        const filteredColumns = mappedColumns.filter(Boolean);
        
        console.log('🔍 Column mapping results:', {
          originalColumns: columns,
          mappedColumns: filteredColumns,
          mappingApplied: Object.keys(actualColumnMap).length > 0
        });
        
        // Validate column count requirements
        if (filteredColumns.length === 0) {
          throw new Error('No valid columns provided');
        }
        
        // Validate: pct_change requires EXACTLY 2 columns (backend requirement)
        if (method === 'pct_change' && filteredColumns.length !== 2) {
          throw new Error(`pct_change operation requires exactly 2 columns, got ${filteredColumns.length}`);
        }
        
        // Validate: Operations requiring at least 2 columns
        if (filteredColumns.length < 2 && ['add', 'subtract', 'multiply', 'divide', 'residual'].includes(method)) {
          throw new Error(`${method} operation requires at least 2 columns`);
        }
        
        // Validate: residual requires identifiers for grouping (backend uses group_apply)
        if (method === 'residual') {
          const hasIdentifiers = identifiers && Array.isArray(identifiers) && identifiers.length > 0;
          if (!hasIdentifiers) {
            console.warn('⚠️ Residual operation requires identifiers for grouping. Backend will compute globally without grouping, which may not be desired.');
            // Don't throw error, but warn - backend will handle it
          }
        }
        
        // Format: {method}_0 = comma-separated columns (use actual column names from backend)
        const colString = filteredColumns.join(',');
        const operationKey = `${method}_0`;
        formData.append(operationKey, colString);
        
        // Add rename if provided (format: {method}_0_rename)
        if (rename && typeof rename === 'string' && rename.trim()) {
          formData.append(`${operationKey}_rename`, rename.trim());
        }
        
        // Add additional parameters
        // Special handling for datetime: backend expects {method}_0_param with the parameter name as value
        if (method === 'datetime') {
          // For datetime, find the parameter key that is true (e.g., "to_year": true -> param = "to_year")
          const paramKey = Object.keys(parameters).find(key => parameters[key] === true || parameters[key] === 'true');
          if (paramKey) {
            formData.append(`${operationKey}_param`, paramKey);
          } else {
            // Fallback: use first parameter key if no boolean true found
            const firstParam = Object.keys(parameters)[0];
            if (firstParam) {
              formData.append(`${operationKey}_param`, firstParam);
            }
          }
        } else {
          // For other operations, use standard format: {method}_0_{paramName}
        Object.entries(parameters).forEach(([key, value]) => {
            if (value !== null && value !== undefined) {
          formData.append(`${operationKey}_${key}`, String(value));
            }
        });
        }
        
        // Add options field (required) - operation type
        formData.append('options', method);
        
        // Add identifiers if provided (comma-separated string)
        if (identifiers && Array.isArray(identifiers) && identifiers.length > 0) {
          try {
            const identifierString = identifiers
              .filter((i: any) => i !== null && i !== undefined && String(i).trim())
              .map((i: any) => String(i).trim())
              .join(',');
            if (identifierString) {
              formData.append('identifiers', identifierString);
            }
          } catch (idError) {
            console.warn('⚠️ Error processing identifiers:', idError);
            // Continue without identifiers
          }
        }
        
        // Debug: Log FormData entries (same as MetricsColOps)
        console.log('🔍 Metric Handler - FormData entries:');
        const formDataEntries: Array<{key: string, value: any}> = [];
        for (const [key, value] of formData.entries()) {
          console.log(`  ${key}: ${value}`);
          formDataEntries.push({ key, value: String(value) });
        }
        
        // Log the complete payload being sent
        console.log('📤 SENDING TO BACKEND (/create-column/perform):');
        console.log('  Endpoint:', performEndpoint);
        console.log('  Method: POST');
        console.log('  Content-Type: multipart/form-data');
        console.log('  FormData entries:', formDataEntries);
        console.log('  Extracted from LLM JSON:', {
          method,
          columns,
          rename,
          parameters,
          identifiers,
          dataSource: resolvedDataSource
        });
        
        // Call backend EXACTLY as MetricsColOps.tsx does
        const performResponse = await fetch(performEndpoint, {
          method: 'POST',
          body: formData
        });
        
        if (!performResponse.ok) {
          // Try to get error details from response
          let errorDetail = `Backend error ${performResponse.status}`;
          try {
            const errorData = await performResponse.json();
            errorDetail = errorData.detail || errorData.error || errorData.message || errorDetail;
          } catch (e) {
            // If response is not JSON, use status text
            errorDetail = performResponse.statusText || errorDetail;
          }
          throw new Error(errorDetail);
        }
        
        const raw = await performResponse.json();
        
        // Validate resolveTaskResponse is available
        if (typeof resolveTaskResponse !== 'function') {
          console.error('❌ resolveTaskResponse is not a function:', typeof resolveTaskResponse, resolveTaskResponse);
          throw new Error('resolveTaskResponse is not available');
        }
        
        const performData = await resolveTaskResponse<Record<string, any>>(raw);
        
        console.log('📥 Raw perform response:', raw);
        console.log('📥 Resolved perform data:', performData);
        console.log('📥 Perform data keys:', Object.keys(performData || {}));
        
        if (performData.status && performData.status !== 'SUCCESS') {
          console.error('❌ Perform operation failed:', {
            status: performData.status,
            error: performData.error,
            fullData: performData
          });
          if (performData.error && performData.error.includes('Unsupported or custom frequency')) {
            throw new Error('The frequency of your data could not be detected. Please enter the period (number of intervals in a season) for your data.');
          }
          throw new Error(performData.error || 'Backend error');
        }
        
        // Extract results - backend returns data.results or data directly
        let results: any[] = [];
        if (performData.results && Array.isArray(performData.results)) {
          results = performData.results;
          console.log('✅ Found results in performData.results');
        } else if (Array.isArray(performData)) {
          results = performData;
          console.log('✅ Found results as array in performData');
        } else if (performData.data && Array.isArray(performData.data)) {
          results = performData.data;
          console.log('✅ Found results in performData.data');
        } else {
          console.warn('⚠️ No results array found in performData. Available keys:', Object.keys(performData || {}));
          console.warn('⚠️ performData structure:', performData);
        }
        
        if (results.length === 0) {
          console.warn('⚠️ Perform operation returned empty results. This might indicate an issue.');
        }
        
        console.log('✅ Perform operation successful, results count:', results.length);
        console.log('📊 Perform operation details:', {
          status: performData.status,
          newColumns: performData.new_columns,
          rowCount: performData.row_count,
          columns: performData.columns,
          resultFile: performData.result_file,
          hasResults: results.length > 0,
          firstResultSample: results.length > 0 ? results[0] : null
        });
        
        // STEP 3.2: Save results (POST /create-column/save)
        // Convert preview data to CSV (EXACTLY as MetricsColOps.tsx previewToCSV function)
        const previewData = results;
        if (!Array.isArray(previewData) || previewData.length === 0) {
          throw new Error('No data to save');
        }
        
        // CSV conversion matching MetricsColOps.tsx previewToCSV (line 699-704)
        const previewToCSV = (data: any[]): string => {
          if (!data.length) return '';
          const headers = Object.keys(data[0]);
          const rows = data.map(row => headers.map(h => JSON.stringify(row[h] ?? '')).join(','));
          return [headers.join(','), ...rows].join('\n');
        };
        
        const csv_data = previewToCSV(previewData);
        
        // Get environment variables (EXACTLY as MetricsColOps.tsx line 1275-1278)
        const envStr = localStorage.getItem('env');
        const env = envStr ? JSON.parse(envStr) : {};
        const stored = localStorage.getItem('current-project');
        const project = stored ? JSON.parse(stored) : {};
        
        // Prepare operation details (EXACTLY as MetricsColOps.tsx line 1281-1298)
        const operation_details = {
          input_file: resolvedDataSource || 'unknown_input_file',
          operations: [{
            operation_type: method,
            columns: columns.filter((c: any) => c && String(c).trim()), // Use original columns, not filteredColumns
            rename: (rename && typeof rename === 'string' && rename.trim()) ? rename.trim() : null,
            param: Object.keys(parameters).length > 0 ? parameters : null,
            created_column_name: (rename && typeof rename === 'string' && rename.trim()) 
              ? rename.trim() 
              : `${filteredColumns.join('_')}_${method}`
          }]
        };
        
        // Generate new filename for the saved file (don't overwrite original)
        // Use file_name from JSON if provided, otherwise create a new name based on operation
        let baseFilename = data.file_name || data.data?.file_name || resolvedDataSource;
        
        // Extract just the filename part (without path) for the new file name
        // But preserve the directory structure
        let basePath = '';
        let baseNameOnly = baseFilename;
        if (baseFilename.includes('/')) {
          const lastSlashIndex = baseFilename.lastIndexOf('/');
          basePath = baseFilename.substring(0, lastSlashIndex + 1); // Include the slash
          baseNameOnly = baseFilename.substring(lastSlashIndex + 1);
        }
        
        // Remove .arrow extension if present
        if (baseNameOnly.endsWith('.arrow')) {
          baseNameOnly = baseNameOnly.replace('.arrow', '');
        }
        
        // Create a new filename with timestamp to avoid overwriting
        // Format: original_filename_operation_timestamp
        const timestamp = Date.now();
        const operationSuffix = rename || method || 'operation';
        const newNameOnly = `${baseNameOnly}_${operationSuffix}_${timestamp}`;
        const newFilename = basePath ? `${basePath}${newNameOnly}` : newNameOnly;
        
        console.log('📝 File naming:', {
          baseFilename,
          basePath,
          baseNameOnly,
          newNameOnly,
          newFilename,
          rename,
          method
        });
        
        // Backend expects just the filename (without path) in the save payload
        // The backend will construct the full path using client_name, app_name, project_name
        const filenameForBackend = newNameOnly; // Just the filename part, not the full path
        
        const savePayload = {
          csv_data,
          filename: filenameForBackend, // Use just filename (backend constructs full path)
          client_name: env.CLIENT_NAME || '',
          app_name: env.APP_NAME || '',
          project_name: env.PROJECT_NAME || '',
          user_id: env.USER_ID || '',
          project_id: project.id || null,
          operation_details: JSON.stringify(operation_details), // Must be JSON string, not object
          overwrite_original: false // Create new file, don't overwrite original
        };
        
        console.log('📤 SENDING TO BACKEND (/create-column/save):');
        console.log('  Endpoint:', saveEndpoint);
        console.log('  Method: POST');
        console.log('  Content-Type: application/json');
        console.log('  Payload (excluding csv_data):', {
          ...savePayload,
          csv_data: `[${csv_data.length} chars]`,
          operation_details: savePayload.operation_details ? 'JSON string (see below)' : 'null'
        });
        console.log('  operation_details (parsed):', JSON.parse(savePayload.operation_details || '{}'));
        console.log('  Extracted from LLM JSON:', {
          method,
          columns,
          rename,
          parameters,
          identifiers,
          dataSource: resolvedDataSource,
          filename: data.file_name || data.data?.file_name
        });
        
        const saveResponse = await fetch(saveEndpoint, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(savePayload)
        });
        
        if (!saveResponse.ok) {
          throw new Error(`Save failed: ${saveResponse.statusText}`);
        }
        
        const rawSaveResult = await saveResponse.json();
        
        // Validate resolveTaskResponse is available
        if (typeof resolveTaskResponse !== 'function') {
          console.error('❌ resolveTaskResponse is not a function:', typeof resolveTaskResponse, resolveTaskResponse);
          throw new Error('resolveTaskResponse is not available');
        }
        
        const saveResult = await resolveTaskResponse<Record<string, any>>(rawSaveResult);
        
        // Get the saved file name from result
        // Backend returns result_file which should be the full path
        let savedFile = typeof saveResult?.result_file === 'string'
          ? saveResult.result_file
          : null;
        
        // If backend didn't return result_file, construct it from the filename we sent
        if (!savedFile) {
          // Construct full path: basePath + newNameOnly + .arrow
          savedFile = basePath 
            ? `${basePath}${newNameOnly}.arrow`
            : `${newNameOnly}.arrow`;
        }
        
        // Ensure savedFile has full path (if it's just a filename, construct full path)
        savedFile = await ensureFullObjectName(savedFile);
        
        const objectName = savedFile || resolvedDataSource;
        
        console.log('✅ Save operation successful, result file:', objectName);
        console.log('  - saveResult:', saveResult);
        console.log('  - savedFile (raw from backend):', saveResult?.result_file);
        console.log('  - savedFile (constructed/validated):', savedFile);
        console.log('  - objectName:', objectName);
        console.log('  - newNameOnly used:', newNameOnly);
        console.log('  - basePath:', basePath);
        
        // Update atom settings
        updateAtomSettings(atomId, {
          operationType: 'column_ops',
          operationConfig,
          operationCompleted: true,
          fileId: saveResult.file_id,
          objectName,
          dataSource: objectName, // Use saved file as new data source
          file_key: objectName,
          envContext: envWithFallback,
          lastUpdateTime: Date.now()
        });
        
        // Sync Properties Panel state - IMPORTANT: Update dataSource to saved file
        // Always let backend logic fetch identifiers - never preserve or hardcode identifiers
        // The MetricsColOps component will fetch identifiers from backend when dataSource changes
        try {
          const store = useLaboratoryStore.getState();
          if (store && typeof store.updateMetricsInputs === 'function') {
            console.log('🔄 Updating metrics section UI with saved file:', objectName);
            
            // Update dataSource only - let MetricsColOps useEffect fetch identifiers from backend
            // This ensures identifiers always follow backend logic, not AI-provided or hardcoded values
            store.updateMetricsInputs({
              currentTab: 'column-operations',
              dataSource: objectName, // Update to saved file so it shows in UI
              // Don't set identifiers - let backend logic handle it via useEffect in MetricsColOps
            });
            console.log('✅ Metrics section UI updated - backend will fetch identifiers');
          }
        } catch (storeError) {
          console.warn('Failed to update Properties Panel state:', storeError);
        }
        
        if (objectName) {
          try {
            const successMsg = createSuccessMessage('Column operation completed', {
              message: 'Successfully performed column operation',
              fileName: getFilename(objectName)
            });
            setMessages((prev: Message[]) => {
              if (!Array.isArray(prev)) {
                console.warn('⚠️ setMessages prev is not an array:', prev);
                return [successMsg];
              }
              return [...prev, successMsg];
            });
          } catch (msgError) {
            console.error('❌ Error setting success message:', msgError);
          }
          
          // Update DataFrame Operations atom if it exists
          if (saveResult.file_id) {
            try {
              const store = useLaboratoryStore.getState();
              const cards = store?.cards || [];
              const dfOpsAtom = cards
                .flatMap(card => Array.isArray(card.atoms) ? card.atoms : [])
                .find(atom => atom.atomId === 'dataframe-operations');
              
              if (dfOpsAtom) {
                updateAtomSettings(dfOpsAtom.id, {
                dataSource: objectName,
                selectedDataSource: objectName,
                fileName: getFilename(objectName),
                  fileId: saveResult.file_id
                });
                try {
                  const fileLoadedMsg = createSuccessMessage('File loaded', {
                    message: 'Result file loaded into DataFrame Operations',
                    fileName: getFilename(objectName)
                  });
                  setMessages((prev: Message[]) => {
                    if (!Array.isArray(prev)) {
                      console.warn('⚠️ setMessages prev is not an array:', prev);
                      return [fileLoadedMsg];
                    }
                    return [...prev, fileLoadedMsg];
                  });
                } catch (msgError) {
                  console.error('❌ Error setting file loaded message:', msgError);
                }
              }
            } catch (dfOpsError) {
              console.warn('Failed to update DataFrame Operations atom:', dfOpsError);
            }
          }
        }

        // ========================================================================
        // AUTO-DISPLAY IN TABLE ATOM
        // ========================================================================
        // After successful column operation save, automatically display in Table atom
        console.log('🎯 [Table Atom Auto-Display] Entry check:', {
          hasObjectName: !!objectName,
          objectName,
          hasFileId: !!saveResult?.file_id,
          fileId: saveResult?.file_id
        });
        
        if (objectName && saveResult?.file_id) {
          try {
            const store = useLaboratoryStore.getState();
            const metricsInputs = store.metricsInputs;
            
            // Get context from metrics settings
            const contextCardId = metricsInputs.contextCardId;
            const contextAtomId = metricsInputs.contextAtomId;
            
            console.log('🎯 [Table Atom Auto-Display] Checking context:', {
              contextCardId,
              contextAtomId,
              objectName,
              allMetricsInputs: metricsInputs
            });
            
            if (contextCardId && contextAtomId) {
              // Context available - check atom type
              const card = store.findCardByAtomId?.(contextAtomId);
              const currentAtom = card?.atoms.find(a => a.id === contextAtomId);
              
              console.log('🎯 [Table Atom Auto-Display] Context found:', {
                cardFound: !!card,
                cardId: card?.id,
                currentAtomType: currentAtom?.atomId,
                currentAtomId: currentAtom?.id
              });
              
              if (currentAtom?.atomId === 'table') {
                // Update existing Table atom
                console.log('✅ [Table Atom Auto-Display] Updating existing Table atom');
                await store.updateTableAtomWithFile?.(contextAtomId, objectName);
                
                const tableMsg = createSuccessMessage('Table updated', {
                  message: 'The updated dataframe has been displayed in the Table atom',
                  fileName: getFilename(objectName)
                });
                setMessages((prev: Message[]) => {
                  if (!Array.isArray(prev)) return [tableMsg];
                  return [...prev, tableMsg];
                });
              } else if (currentAtom) {
                // Replace atom with Table, move original to next card
                console.log('🔄 [Table Atom Auto-Display] Replacing atom with Table, moving original to next card');
                const result = await store.replaceAtomWithTable?.(
                  contextCardId,
                  contextAtomId,
                  objectName
                );
                
                if (result.success && result.tableAtomId) {
                  console.log('✅ [Table Atom Auto-Display] Atom replaced successfully');
                  
                  const tableMsg = createSuccessMessage('Data displayed in Table', {
                    message: 'The updated dataframe has been displayed in a Table atom. The original atom has been moved to the next card.',
                    fileName: getFilename(objectName)
                  });
                  setMessages((prev: Message[]) => {
                    if (!Array.isArray(prev)) return [tableMsg];
                    return [...prev, tableMsg];
                  });
                } else {
                  console.warn('⚠️ [Table Atom Auto-Display] Failed to replace atom:', result.error);
                }
              } else {
                console.warn('⚠️ [Table Atom Auto-Display] Atom not found in card, creating new card');
                // Atom not found, create new card
                const tableAtomId = await store.createCardWithTableAtom?.(objectName);
                if (tableAtomId) {
                  console.log('✅ [Table Atom Auto-Display] Created new card with Table atom');
                  
                  const tableMsg = createSuccessMessage('Data displayed in Table', {
                    message: 'The updated dataframe has been displayed in a new Table atom',
                    fileName: getFilename(objectName)
                  });
                  setMessages((prev: Message[]) => {
                    if (!Array.isArray(prev)) return [tableMsg];
                    return [...prev, tableMsg];
                  });
                }
              }
            } else {
              // No context - create new card with Table atom
              console.log('🆕 [Table Atom Auto-Display] No context, creating new card');
              const tableAtomId = await store.createCardWithTableAtom?.(objectName);
              if (tableAtomId) {
                console.log('✅ [Table Atom Auto-Display] Created new card with Table atom');
                
                const tableMsg = createSuccessMessage('Data displayed in Table', {
                  message: 'The updated dataframe has been displayed in a new Table atom',
                  fileName: getFilename(objectName)
                });
                setMessages((prev: Message[]) => {
                  if (!Array.isArray(prev)) return [tableMsg];
                  return [...prev, tableMsg];
                });
              } else {
                console.warn('⚠️ [Table Atom Auto-Display] Failed to create new card');
              }
            }
          } catch (tableError) {
            console.error('❌ [Table Atom Auto-Display] Error:', tableError);
            // Don't fail the metric operation if table display fails
          }
        }
        
        // Generate insight
        generateAtomInsight({
          data: {
          ...data,
            backend_result: saveResult,
          operation_type: operationType,
            file_id: saveResult.file_id,
            object_name: objectName
          },
          atomType: 'metric',
          sessionId,
          atomId
        }).catch(() => {});
        
        return { success: true };
        
      } catch (error) {
        console.error('❌ Error calling create-column endpoint:', error);
        const errorMsg = createErrorMessage(
          'Column operation',
          (error as Error).message || 'Unknown error',
          'Please check the operation configuration and try again'
        );
        try {
          setMessages((prev: Message[]) => {
            if (!Array.isArray(prev)) {
              console.warn('⚠️ setMessages prev is not an array:', prev);
              return [errorMsg];
            }
            return [...prev, errorMsg];
          });
        } catch (msgError) {
          console.error('❌ Error setting error message:', msgError);
        }
        return { success: false, error: (error as Error).message };
      }
    }
    
    // Unknown operation type or no operation - just show reasoning
      console.log('⚠️ WARNING: Unknown operation type or no operation matched');
      console.log('  - operationType:', operationType);
      console.log('  - Expected types: input, variables, column_ops');
      console.log('  - Showing reasoning only');
      
      // Show a message to the user about the unknown operation
      try {
        const unknownOpMsg: Message = {
          id: Date.now().toString(),
          content: `Unknown operation type: ${operationType || 'none'}. Please check the operation configuration.`,
          sender: 'ai',
          timestamp: new Date(),
        };
        setMessages((prev: Message[]) => {
          if (!Array.isArray(prev)) return [unknownOpMsg];
          return [...prev, unknownOpMsg];
        });
      } catch (msgError) {
        console.error('❌ Error setting unknown operation message:', msgError);
      }
      
    return { success: true };
    } catch (error: any) {
      console.error('='.repeat(80));
      console.error('❌ CRITICAL ERROR in metricHandler.handleSuccess');
      console.error('='.repeat(80));
      console.error('❌ Error message:', error?.message);
      console.error('❌ Error name:', error?.name);
      console.error('❌ Error stack:', error?.stack);
      console.error('❌ Error location trace:', errorLocation.join(' -> '));
      console.error('❌ Error details:', {
        message: error?.message,
        name: error?.name,
        cause: error?.cause,
        toString: error?.toString(),
        context: {
          atomId: context?.atomId,
          hasUpdateAtomSettings: typeof context?.updateAtomSettings === 'function',
          hasSetMessages: typeof context?.setMessages === 'function',
          sessionId: context?.sessionId
        },
        dataKeys: data && typeof data === 'object' ? Object.keys(data) : 'N/A',
        dataDataType: typeof data,
        contextType: typeof context
      });
      console.error('='.repeat(80));
      
      // Try to show error message if setMessages is available
      if (context?.setMessages && typeof context.setMessages === 'function') {
        try {
          const errorMsg: Message = {
            id: `error_${Date.now()}`,
            content: `**Error:** ${error?.message || 'Unknown error occurred while processing metric operation'}`,
            sender: 'ai',
            timestamp: new Date(),
          };
          context.setMessages((prev: Message[]) => {
            if (!Array.isArray(prev)) return [errorMsg];
            return [...prev, errorMsg];
          });
        } catch (msgError) {
          console.error('❌ Failed to set error message:', msgError);
        }
      }
      
      return { success: false, error: error?.message || 'Unknown error in metric handler' };
    }
  },

  handleFailure: async (data: any, context: AtomHandlerContext): Promise<AtomHandlerResponse> => {
    const { setMessages, updateAtomSettings, atomId } = context;
    
    // Update card text box with reasoning even on failure
    const textBoxContent = formatAgentResponseForTextBox(data);
    try {
      await updateCardTextBox(atomId, textBoxContent);
    } catch (textBoxError) {
      console.error('❌ Error updating card text box:', textBoxError);
    }
    
    // Store in atom settings for reference
    updateAtomSettings(atomId, {
      agentResponse: {
        reasoning: data.reasoning || data.data?.reasoning || '',
        formattedText: textBoxContent
      }
    });
    
    // Show reasoning in chat
    const reasoningText = data.reasoning || data.data?.reasoning || data.data?.data?.reasoning || '';
    if (reasoningText) {
      try {
      const reasoningMsg: Message = {
        id: (Date.now() + 1).toString(),
        content: `**Reasoning:**\n${reasoningText}`,
        sender: 'ai',
        timestamp: new Date(),
      };
        setMessages((prev: Message[]) => {
          if (!Array.isArray(prev)) {
            console.warn('⚠️ setMessages prev is not an array:', prev);
            return [reasoningMsg];
          }
          return [...prev, reasoningMsg];
        });
      } catch (msgError) {
        console.error('❌ Error setting reasoning message:', msgError);
      }
    }
    
    return { success: true };
  }
};

