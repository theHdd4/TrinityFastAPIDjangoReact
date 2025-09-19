import { DATAFRAME_OPERATIONS_API } from '@/lib/api';
import { AtomHandler, AtomHandlerContext, AtomHandlerResponse, Message } from './types';
import { 
  getEnvironmentContext, 
  getFilename, 
  createMessage, 
  createSuccessMessage, 
  createErrorMessage,
  processSmartResponse,
  validateFileInput,
  createProgressTracker 
} from './utils';

// Import the dataframe operations API functions
import { loadDataframeByKey } from '../../AtomList/atoms/dataframe-operations/services/dataframeOperationsApi';
import { useLaboratoryStore } from '../../LaboratoryMode/store/laboratoryStore';

// 🔧 Helper function to fix AI column case sensitivity and suggest alternatives
const normalizeColumnName = (aiColumnName: string, availableColumns: string[] = []): string => {
  // 🔧 CRITICAL FIX: Add type safety checks
  if (!aiColumnName || typeof aiColumnName !== 'string') {
    console.warn(`⚠️ Invalid aiColumnName:`, aiColumnName);
    return aiColumnName || '';
  }
  
  if (!availableColumns || !Array.isArray(availableColumns) || !availableColumns.length) {
    return aiColumnName;
  }
  
  // 🔧 CRITICAL FIX: Ensure all availableColumns are strings
  const stringColumns = availableColumns.filter(col => col && typeof col === 'string');
  
  // Try exact match first
  if (stringColumns.includes(aiColumnName)) {
    return aiColumnName;
  }
  
  // Try case-insensitive match
  const lowerAI = aiColumnName.toLowerCase();
  const exactMatch = stringColumns.find(col => col.toLowerCase() === lowerAI);
  
  if (exactMatch) {
    console.log(`🔧 Column case correction: "${aiColumnName}" -> "${exactMatch}"`);
    return exactMatch;
  }
  
  // 🔧 SMART MATCHING: Try to find similar columns for common AI mistakes
  const aiLower = aiColumnName.toLowerCase();
  let bestMatch = null;
  
  // Common AI column name mappings
  const commonMappings = {
    'price': ['salesvalue', 'cost', 'amount', 'value'],
    'sales': ['salesvalue', 'revenue', 'amount'],
    'revenue': ['salesvalue', 'sales', 'amount'],
    'cost': ['salesvalue', 'price', 'amount'],
    'value': ['salesvalue', 'amount', 'cost'],
    'amount': ['salesvalue', 'value', 'cost'],
    'quantity': ['volume', 'count', 'qty'],
    'qty': ['volume', 'quantity', 'count'],
    'count': ['volume', 'quantity', 'qty'],
    'name': ['brand', 'variant', 'category'],
    'type': ['category', 'subcategory', 'variant'],
    'category': ['category', 'subcategory', 'brand'],
    'region': ['region', 'market', 'channel'],
    'location': ['region', 'market', 'channel']
  };
  
  // Check if AI column has a known mapping
  if (commonMappings[aiLower]) {
    for (const suggestion of commonMappings[aiLower]) {
      const match = stringColumns.find(col => col.toLowerCase() === suggestion);
      if (match) {
        console.log(`🔧 Smart column mapping: "${aiColumnName}" -> "${match}" (${suggestion})`);
        return match;
      }
    }
  }
  
  // Try partial matching (contains)
  const partialMatch = stringColumns.find(col => 
    col.toLowerCase().includes(aiLower) || aiLower.includes(col.toLowerCase())
  );
  
  if (partialMatch) {
    console.log(`🔧 Partial column match: "${aiColumnName}" -> "${partialMatch}"`);
    return partialMatch;
  }
  
  // Return original if no match found, but log suggestions
  const suggestions = stringColumns.slice(0, 5).join(', ');
  console.warn(`⚠️ Column "${aiColumnName}" not found. Available columns: ${suggestions}...`);
  return aiColumnName;
};

export const dataframeOperationsHandler: AtomHandler = {
  handleSuccess: async (data: any, context: AtomHandlerContext): Promise<AtomHandlerResponse> => {
    const { atomId, updateAtomSettings, setMessages, sessionId } = context;

    if (!data.dataframe_config) {
      return { success: false, error: 'No dataframe configuration found in AI response' };
    }

    const config = data.dataframe_config;
    console.log('🤖 DATAFRAME OPERATIONS CONFIG EXTRACTED:', config, 'Session:', sessionId);
    console.log('🔍 Execution Plan:', data.execution_plan);
    console.log('💭 AI Reasoning:', data.reasoning);
    
    // Get environment context
    const envContext = getEnvironmentContext();
    console.log('🔍 Environment context loaded:', envContext);
    
    // 🔧 CRITICAL: Check if we already have a current DataFrame from previous operations
    const currentSettings = useLaboratoryStore.getState().getAtom(atomId)?.settings;
    const existingDfId = currentSettings?.currentDfId || currentSettings?.fileId;
    const hasExistingData = currentSettings?.hasData && currentSettings?.dataLoaded;
    const lastLoadedFile = currentSettings?.lastLoadedFileName || currentSettings?.originalAIFilePath;
    const lastSessionId = currentSettings?.lastSessionId;
    
    // 🔧 SESSION ISOLATION: Check if this is a new session - if so, reset state
    const isNewSession = !lastSessionId || lastSessionId !== sessionId;
    
    console.log(`🔍 EXISTING STATE CHECK: existingDfId=${existingDfId}, hasData=${hasExistingData}, lastLoadedFile=${lastLoadedFile}`);
    console.log(`🔍 SESSION CHECK: isNewSession=${isNewSession}, lastSessionId=${lastSessionId}, currentSessionId=${sessionId}`);
    
    // 🔧 SESSION ISOLATION: Determine session-specific state
    let sessionExistingDfId: string | null = null;
    let sessionHasExistingData = false;
    let sessionLastLoadedFile: string | null = null;
    
    if (isNewSession) {
      console.log(`🆕 NEW SESSION DETECTED: Resetting all DataFrame state for fresh start`);
      // Don't use existing state for new sessions
      sessionExistingDfId = null;
      sessionHasExistingData = false;
      sessionLastLoadedFile = null;
      
      console.log(`🔄 SESSION RESET: dfId=${sessionExistingDfId}, hasData=${sessionHasExistingData}, lastFile=${sessionLastLoadedFile}`);
      
      // Update settings to mark this as the current session
      updateAtomSettings(atomId, {
        ...currentSettings,
        lastSessionId: sessionId,
        sessionStartTime: Date.now()
      });
    } else {
      console.log(`🔄 EXISTING SESSION: Using preserved DataFrame state`);
      // Use existing state for same session
      sessionExistingDfId = existingDfId;
      sessionHasExistingData = hasExistingData;
      sessionLastLoadedFile = lastLoadedFile;
    }
    
    // Update atom settings with the AI configuration
    updateAtomSettings(atomId, { 
      dataframeConfig: config,
      aiConfig: config,
      aiMessage: data.smart_response || data.message,
      executionPlan: data.execution_plan,
      reasoning: data.reasoning,
      envContext,
      lastUpdateTime: Date.now(),
      // 🔧 CRITICAL: Preserve existing DataFrame state (session-specific)
      currentDfId: sessionExistingDfId,
      existingDataAvailable: sessionHasExistingData
    });
    
    // Add AI smart response message (prioritize smart_response over generic success message)
    if (data.smart_response) {
      // Use the AI's smart response for a more conversational experience
      const aiMessage = createMessage(data.smart_response);
      setMessages(prev => [...prev, aiMessage]);
      console.log('🤖 AI Smart Response displayed:', data.smart_response);
    } else {
      // Fallback to detailed success message if no smart_response
      const operationsCount = config.operations ? config.operations.length : 0;
      const successDetails = {
        'Operations': operationsCount.toString(),
        'Auto Execute': data.execution_plan?.auto_execute ? 'Yes' : 'No',
        'Session': sessionId
      };
      
      if (data.reasoning) {
        successDetails['Reasoning'] = data.reasoning.substring(0, 100) + (data.reasoning.length > 100 ? '...' : '');
      }
      
      const successMsg = createSuccessMessage('DataFrame operations configuration completed', successDetails);
      successMsg.content += '\n\n🔄 Ready to execute operations!';
      setMessages(prev => [...prev, successMsg]);
      console.log('⚠️ No smart_response found, using fallback success message');
    }
    
    // Automatically execute operations if auto_execute is enabled
    if (data.execution_plan?.auto_execute && config.operations) {
      console.log('🚀 Auto-executing DataFrame operations...');
      const progressTracker = createProgressTracker(config.operations.length, 'operation');
      
       try {
         // Execute operations sequentially (SAME as Atom_ai_chat.tsx)
         // 🔧 CRITICAL: Start with existing DataFrame if available (for operation continuity within session)
         const currentAtomSettings = useLaboratoryStore.getState().getAtom(atomId)?.settings;
         let currentDfId: string | null = sessionExistingDfId;
         let availableColumns: string[] = currentAtomSettings?.selectedColumns || []; // Track columns for case correction
         const results: any[] = [];
         
         console.log(`🔗 OPERATION CHAINING: Starting with existingDfId=${currentDfId}, columns=${availableColumns.length}`);
        
        for (const operation of config.operations) {
          console.log(`🔄 Executing operation: ${operation.operation_name || operation.api_endpoint}`, operation);
          console.log(`🔍 Current df_id state: ${currentDfId}`);
          
          let requestBody: any = {};
          let requestMethod = operation.method || 'POST';
          let apiEndpoint = operation.api_endpoint;
          
          if (operation.parameters) {
            const opName = operation.operation_name || operation.api_endpoint?.replace('/', '');
            console.log(`🔍 Operation identification: opName="${opName}", apiEndpoint="${apiEndpoint}"`);
            
            if (operation.api_endpoint === "/load_cached" || operation.api_endpoint === "/load_file") {
              // 🔧 SMART FILE HANDLING: Check if we're loading the same file as before (within same session)
              const currentFileName = operation.parameters.object_name;
              const isSameFile = sessionLastLoadedFile && currentFileName && 
                (sessionLastLoadedFile.includes(currentFileName) || currentFileName.includes(sessionLastLoadedFile.split('/').pop() || ''));
              
              console.log(`📥 LOADING FILE: ${currentFileName}`);
              console.log(`🔍 FILE COMPARISON: isSameFile=${isSameFile}, sessionLastLoadedFile=${sessionLastLoadedFile}, currentFileName=${currentFileName}`);
              
              if (isSameFile && sessionExistingDfId && sessionHasExistingData) {
                // 🔧 SAME FILE: Skip loading, use existing DataFrame with all previous operations
                console.log(`✅ SAME FILE DETECTED: Skipping load operation, preserving existing DataFrame with ID=${sessionExistingDfId}`);
                console.log(`🔗 PRESERVING: All previous operations and changes are maintained`);
                
                // Skip this operation entirely - don't call the API
                // Just update the currentDfId to maintain the chain
                currentDfId = sessionExistingDfId;
                
                // Update available columns from existing settings to maintain column info for subsequent operations
                const currentAtomSettings = useLaboratoryStore.getState().getAtom(atomId)?.settings;
                availableColumns = currentAtomSettings?.selectedColumns || [];
                
                console.log(`🔗 MAINTAINED: df_id=${currentDfId}, columns=${availableColumns.length}`);
                
                // Mark this operation as skipped for logging
                operation._skipped = true;
                operation._reason = 'Same file as previous load, preserving existing DataFrame';
                
                // Continue to next operation
                continue;
              } else {
                // 🔧 DIFFERENT FILE: Load the new file and start fresh
                console.log(`🆕 NEW FILE DETECTED: Loading new file, starting fresh operations`);
                console.log(`📥 LOADING FILE: Getting fresh column data for accurate AI operations`);
              }
              
              // Handle both load_cached and load_file operations (SAME as Atom_ai_chat.tsx lines 2512-2535)
              if (operation.parameters.file_path && !operation.parameters.object_name) {
                console.log(`🔄 Converting file_path to object_name for ${operation.api_endpoint} operation`);
                operation.parameters.object_name = operation.parameters.file_path;
                delete operation.parameters.file_path;
              } else if (operation.parameters.filename && !operation.parameters.object_name) {
                console.log(`🔄 Converting filename to object_name for ${operation.api_endpoint} operation`);
                operation.parameters.object_name = operation.parameters.filename;
                delete operation.parameters.filename;
              }
              
              // 🔧 CRITICAL FIX: Convert /load_file to /load_cached (backend compatibility)
              if (operation.api_endpoint === "/load_file") {
                console.log(`🔄 Converting /load_file to /load_cached for backend compatibility`);
                apiEndpoint = "/load_cached";
              }
              
              // 🔧 CRITICAL FIX: Force POST method for load operations (backend requires POST)
              requestMethod = 'POST';
              
              // 🔧 CRITICAL FIX: Ensure file path ends with .arrow (backend requirement)
              if (operation.parameters.object_name) {
                let objectName = operation.parameters.object_name;
                
                // Fix common AI file path issues
                if (objectName.includes('.arrow_create.csv')) {
                  objectName = objectName.replace('.arrow_create.csv', '.arrow');
                  console.log(`🔧 Fixed file extension: ${operation.parameters.object_name} -> ${objectName}`);
                } else if (objectName.includes('_create.csv')) {
                  objectName = objectName.replace('_create.csv', '.arrow');
                  console.log(`🔧 Fixed file extension: ${operation.parameters.object_name} -> ${objectName}`);
                } else if (!objectName.endsWith('.arrow')) {
                  // If it doesn't end with .arrow, ensure it does
                  objectName = objectName.replace(/\.(csv|parquet|json)$/, '.arrow');
                  if (!objectName.endsWith('.arrow')) {
                    objectName += '.arrow';
                  }
                  console.log(`🔧 Ensured .arrow extension: ${operation.parameters.object_name} -> ${objectName}`);
                }
                
                // Update the parameters with corrected object name
                operation.parameters.object_name = objectName;
              }
              
              requestBody = operation.parameters;
            } else if (opName === 'filter_rows' || apiEndpoint === '/filter_rows') {
              // 🔧 CRITICAL FIX: Handle case sensitivity for column names with type safety
              const originalColumn = operation.parameters.column;
              const correctedColumn = (originalColumn && typeof originalColumn === 'string') ? 
                normalizeColumnName(originalColumn, availableColumns) : originalColumn;
              
              requestBody = {
                df_id: operation.parameters.df_id === 'auto_from_previous' ? currentDfId : operation.parameters.df_id,
                column: correctedColumn,
                value: operation.parameters.value,
                filter_type: operation.parameters.filter_type || 'simple'
              };
              
              if (correctedColumn !== originalColumn) {
                console.log(`🔧 Fixed filter column case: ${originalColumn} -> ${correctedColumn}`);
              }
            } else if (opName === 'sort' || apiEndpoint === '/sort') {
              let dfId = currentDfId;
              
              if (!dfId && operation.parameters.df_id && operation.parameters.df_id !== 'auto_from_previous') {
                dfId = operation.parameters.df_id;
                console.log(`🔄 Using df_id from operation parameters: ${dfId}`);
              }
              
              if (!dfId) {
                console.error(`❌ No df_id available for sort operation.`);
                throw new Error('Sort operation failed: No df_id available from previous operations');
              }
              
              // 🔧 CRITICAL FIX: Handle case sensitivity for column names with type safety
              const originalColumn = operation.parameters.column;
              const correctedColumn = (originalColumn && typeof originalColumn === 'string') ? 
                normalizeColumnName(originalColumn, availableColumns) : originalColumn;
              const direction = operation.parameters.direction || (operation.parameters.ascending !== false ? 'asc' : 'desc');
              
              requestBody = {
                df_id: dfId,
                column: correctedColumn,
                direction: direction
              };
              
              if (correctedColumn !== originalColumn) {
                console.log(`🔧 Fixed sort column case: ${originalColumn} -> ${correctedColumn}`);
              }
              
              console.log(`🔍 SORT REQUEST DEBUG:`, {
                'df_id': dfId,
                'column': correctedColumn,
                'original_column': originalColumn,
                'direction': direction,
                'currentDfId': currentDfId,
                'original_df_id': operation.parameters.df_id,
                'requestBody': requestBody
              });
            } else if (opName === 'apply_formula' || apiEndpoint === '/apply_formula') {
              // 🔧 CRITICAL FIX: For apply_formula, DON'T normalize target_column (we want to CREATE new columns)
              // Only normalize if the target column already exists (case correction)
              const originalTargetColumn = operation.parameters.target_column;
              let correctedTargetColumn = originalTargetColumn;
              
              // Only apply case correction if the column already exists (don't map to different columns)
              if (originalTargetColumn && typeof originalTargetColumn === 'string' && availableColumns.length > 0) {
                // 🔧 CRITICAL FIX: Ensure availableColumns are strings and add type safety
                const stringColumns = availableColumns.filter(col => col && typeof col === 'string');
                const exactMatch = stringColumns.find(col => col.toLowerCase() === originalTargetColumn.toLowerCase());
                
                if (exactMatch && exactMatch !== originalTargetColumn) {
                  // Only correct case, don't change to different column
                  correctedTargetColumn = exactMatch;
                  console.log(`🔧 Case correction only: ${originalTargetColumn} -> ${correctedTargetColumn}`);
                } else {
                  // Target column doesn't exist - this is a NEW column creation
                  console.log(`✨ Creating NEW column: ${originalTargetColumn} (not in existing columns)`);
                  correctedTargetColumn = originalTargetColumn; // Keep original name for new column
                }
              } else {
                console.log(`✨ Creating NEW column: ${originalTargetColumn || 'unnamed'} (no validation data)`);
              }
              
              requestBody = {
                df_id: operation.parameters.df_id === 'auto_from_previous' ? currentDfId : operation.parameters.df_id,
                target_column: correctedTargetColumn,
                formula: operation.parameters.formula
              };
              
              console.log(`📋 APPLY_FORMULA REQUEST: target_column="${correctedTargetColumn}", formula="${operation.parameters.formula}"`);
              console.log(`📋 COLUMN STATUS: ${availableColumns.includes(correctedTargetColumn) ? 'EXISTING (will overwrite)' : 'NEW (will create)'}`)
            } else {
              // Regular DataFrame operations (SAME as Atom_ai_chat.tsx)
              requestBody = { ...operation.parameters };
              
              // Replace placeholder df_ids with actual df_id from previous operations
              if (requestBody.df_id && typeof requestBody.df_id === 'string' && 
                  (requestBody.df_id.includes('auto_from_previous') || requestBody.df_id === "1" || requestBody.df_id === "existing_df_id") && 
                  currentDfId) {
                console.log(`🔄 Replacing df_id "${requestBody.df_id}" with actual df_id: "${currentDfId}"`);
                requestBody.df_id = currentDfId;
              }
            }
          }
          
          const operationEndpoint = `${DATAFRAME_OPERATIONS_API}${apiEndpoint}`;
          console.log(`📡 Calling: ${requestMethod} ${operationEndpoint}`, requestBody);
          
          // 🔧 CRITICAL FIX: Handle GET requests differently (no body allowed)
          let response: Response;
          
          if (requestMethod.toUpperCase() === 'GET') {
            // 🔧 For GET requests: Add parameters to URL, no body
            const params = new URLSearchParams();
            Object.entries(requestBody).forEach(([key, value]) => {
              if (value !== null && value !== undefined) {
                params.append(key, String(value));
              }
            });
            const urlWithParams = params.toString() ? `${operationEndpoint}?${params.toString()}` : operationEndpoint;
            console.log(`📡 GET Request URL: ${urlWithParams}`);
            
            response = await fetch(urlWithParams, {
              method: requestMethod,
              headers: {
                'Accept': 'application/json',
              }
            });
          } else {
            // 🔧 For POST/PUT/etc requests: Use body as before
            response = await fetch(operationEndpoint, {
              method: requestMethod,
              headers: {
                'Content-Type': 'application/json',
              },
              body: JSON.stringify(requestBody),
            });
          }
          
          if (!response.ok) {
            const errorText = await response.text();
            console.error(`❌ Operation ${operation.operation_name || apiEndpoint} failed:`, {
              status: response.status,
              statusText: response.statusText,
              url: operationEndpoint,
              requestBody,
              response: errorText
            });
            
            throw new Error(`Operation ${operation.operation_name || apiEndpoint} failed: ${errorText}`);
          }
          
          const result = await response.json();
          if (result.df_id) {
            currentDfId = result.df_id;
          }
          
          // 🔧 CRITICAL: Track available columns for case correction
          if (result.headers && Array.isArray(result.headers)) {
            availableColumns = result.headers;
            console.log(`📊 Updated available columns (${availableColumns.length}): ${availableColumns.join(', ')}`);
            
            // 🔧 STRATEGY: If this is a load operation and we have existing data, 
            // use the existing df_id for subsequent operations instead of the new one (within same session)
            if ((operation.api_endpoint === "/load_cached" || apiEndpoint === "/load_cached") && sessionExistingDfId && sessionHasExistingData) {
              console.log(`🔗 COLUMN INFO ACQUIRED: Using existing df_id=${sessionExistingDfId} for subsequent operations`);
              console.log(`🔗 COLUMN INFO: Fresh columns loaded, now AI operations will use correct column names`);
              currentDfId = sessionExistingDfId; // Use existing modified DataFrame, not the fresh loaded one
            }
          }
          
          // Only push results for operations that were actually executed
          if (!operation._skipped) {
            results.push(result);
            console.log(`✅ Operation completed: ${operation.operation_name}`);
          } else {
            console.log(`⏭️ Operation skipped: ${operation.operation_name} - ${operation._reason}`);
          }
          
          // 🔧 CRITICAL: Update UI after each operation if it returns data (SAME as Atom_ai_chat.tsx)
          if (result && result.headers && result.rows) {
            // 🔧 CRITICAL FIX: Always use the actual file name from the current operation or load operation
            const currentSettings = useLaboratoryStore.getState().getAtom(atomId)?.settings;
            
            // 🔧 PRIORITY: Find the load operation in current config to get the actual file being processed
            const loadOperation = config.operations.find(op => 
              op.api_endpoint === "/load_cached" || op.api_endpoint === "/load_file"
            );
            
            const actualFileName = loadOperation?.parameters?.object_name?.split('/').pop() || 
                                 operation.parameters?.object_name?.split('/').pop() || 
                                 currentSettings?.originalAIFilePath?.split('/').pop() || 
                                 currentSettings?.selectedFile?.split('/').pop() || 
                                 'Unknown_File.arrow';
            
            console.log(`🔧 USING ACTUAL FILE NAME: ${actualFileName} (from load operation: ${loadOperation?.parameters?.object_name})`);
            
            const dataFrameData = {
              headers: result.headers,
              rows: result.rows,
              fileName: actualFileName, // 🔧 CRITICAL: Use actual AI file name, not temporary
              columnTypes: Object.keys(result.types || {}).reduce((acc, col) => {
                const type = result.types[col];
                acc[col] = type.includes('Float') || type.includes('Int') ? 'number' : 'text';
                return acc;
              }, {} as { [key: string]: 'text' | 'number' | 'date' }),
              pinnedColumns: [],
              frozenColumns: 0,
              cellColors: {}
            };
            
            // 🔧 BATCH UI UPDATES: Collect all UI changes and apply at the end to reduce API calls
            // Store the operation result data but don't update UI immediately
            const isLoadOperation = (operation.api_endpoint === "/load_cached" || apiEndpoint === "/load_cached");
            const isLastOperation = config.operations.indexOf(operation) === config.operations.length - 1;
            
            if (isLoadOperation) {
              console.log(`🔧 AI PROVIDED FILE PATH: ${operation.parameters.object_name}`);
              console.log(`🔧 LOAD OPERATION: Will set selectedFile to EXACT AI path`);
              
              // Store load operation data for final UI update
              operation._uiData = {
                tableData: dataFrameData,
                selectedFile: operation.parameters.object_name,
                fileId: currentDfId,
                selectedColumns: result.headers || [],
                // 🔧 CRITICAL FIX: Don't set isTemporaryData at all - let UI handle it naturally
                hasData: true,
                dataLoaded: true,
                originalAIFilePath: operation.parameters.object_name
              };
            } else {
              console.log(`🔧 REGULAR OPERATION: Will preserve original AI file path`);
              
              // Store regular operation data for final UI update
              const currentSettings = useLaboratoryStore.getState().getAtom(atomId)?.settings;
              const originalAIFilePath = currentSettings?.originalAIFilePath || currentSettings?.selectedFile;
              
              operation._uiData = {
                tableData: dataFrameData,
                selectedFile: originalAIFilePath,
                fileId: currentDfId,
                selectedColumns: result.headers || [],
                // 🔧 CRITICAL FIX: Don't set isTemporaryData - let it show the actual file name like manual
                // isTemporaryData: true, // ❌ This causes "Temporary Data" banner instead of file name
                hasData: true,
                dataLoaded: true,
                originalAIFilePath: originalAIFilePath
              };
            }
            
            console.log(`🔄 Operation ${operation.operation_name} data prepared for batch UI update (${isLastOperation ? 'FINAL' : 'INTERMEDIATE'})`);
          }
          
        }
        
        // 🔧 BATCH UI UPDATE: Apply final UI changes from the last operation with data
        // Find the load operation first (has the correct selectedFile), then the last operation with data
        const loadOperation = config.operations.find(op => 
          (op.api_endpoint === "/load_cached" || op.api_endpoint === "/load_file") && op._uiData
        );
        const lastDataOperation = [...config.operations].reverse().find(op => op._uiData);
        
        if (loadOperation && lastDataOperation) {
          console.log(`🔄 BATCH UPDATE: Combining load operation file path with final operation data`);
          
          // Apply the final UI state combining load operation file info with last operation data
          const currentSettings = useLaboratoryStore.getState().getAtom(atomId)?.settings;
          const finalUIData = {
            ...lastDataOperation._uiData, // Final operation data (tableData, etc.)
            selectedFile: loadOperation._uiData.selectedFile, // Use load operation's file path
            originalAIFilePath: loadOperation._uiData.originalAIFilePath, // Preserve original path
          };
          
          updateAtomSettings(atomId, {
            ...currentSettings, // 🔧 CRITICAL: Preserve existing settings
            ...finalUIData, // Apply combined UI data
            execution_results: results,
            currentDfId: currentDfId,
            operationCompleted: true,
            lastLoadedFileName: loadOperation._uiData.selectedFile, // 🔧 Track last loaded file
            lastSessionId: sessionId // 🔧 Track current session
          });
          
          console.log(`✅ BATCH UPDATE COMPLETE: UI updated with combined state (${finalUIData.selectedFile})`);
        } else if (lastDataOperation) {
          // Fallback: Use last operation data only
          console.log(`🔄 BATCH UPDATE: Using last operation data only`);
          
          const currentSettings = useLaboratoryStore.getState().getAtom(atomId)?.settings;
          // Find the load operation to track the file name
          const loadOp = config.operations.find(op => 
            (op.api_endpoint === "/load_cached" || op.api_endpoint === "/load_file") && !op._skipped
          );
          
          updateAtomSettings(atomId, {
            ...currentSettings, // 🔧 CRITICAL: Preserve existing settings
            ...lastDataOperation._uiData, // Apply final operation UI data
            execution_results: results,
            currentDfId: currentDfId,
            operationCompleted: true,
            lastLoadedFileName: loadOp?.parameters?.object_name || lastDataOperation._uiData.selectedFile, // 🔧 Track last loaded file
            lastSessionId: sessionId // 🔧 Track current session
          });
          
          console.log(`✅ BATCH UPDATE COMPLETE: UI updated with last operation (${lastDataOperation._uiData.selectedFile})`);
        } else {
          // Final fallback: Update metadata only
          console.log(`⚠️ FALLBACK UPDATE: No UI data found, updating metadata only`);
          
          const currentSettings = useLaboratoryStore.getState().getAtom(atomId)?.settings;
          
          // Find the load operation to track the file name
          const loadOp = config.operations.find(op => 
            (op.api_endpoint === "/load_cached" || op.api_endpoint === "/load_file") && !op._skipped
          );
          
          updateAtomSettings(atomId, {
            ...currentSettings, // 🔧 CRITICAL: Preserve existing settings
            execution_results: results,
            currentDfId: currentDfId,
            operationCompleted: true,
            lastLoadedFileName: loadOp?.parameters?.object_name || currentSettings?.lastLoadedFileName, // 🔧 Track last loaded file
            lastSessionId: sessionId // 🔧 Track current session
          });
        }
        
        // 🔧 SMART RESPONSE FIX: Don't add duplicate message if smart_response was already shown
        // The smart_response is already displayed in the configuration phase above
        // Only add completion message if no smart_response was provided
        if (!data.smart_response) {
          // Fallback to detailed success message only if no smart response was shown
          const completionDetails = {
            'Operations': operationsCount.toString(),
            'Status': 'All completed',
            'Final DataFrame ID': currentDfId || 'N/A'
          };
          const executionSuccessMsg = createSuccessMessage('DataFrame operations auto-execution', completionDetails);
          executionSuccessMsg.content += '\n\n📊 All operations completed! The updated DataFrame should now be visible in the interface.';
          setMessages(prev => [...prev, executionSuccessMsg]);
          console.log('⚠️ No smart_response available, using fallback completion message');
        } else {
          console.log('✅ Smart response already displayed, skipping duplicate completion message');
        }
        
        console.log('📊 Final progress summary:', progressTracker.getStatus());
        
      } catch (error) {
        console.error('❌ Auto-execution failed:', error);
        progressTracker.markFailed();
        
        const executionErrorMsg = createErrorMessage(
          'DataFrame operations auto-execution',
          error,
          `Session: ${sessionId}, Operations: ${operationsCount}`
        );
        executionErrorMsg.content += '\n\n🔧 You can try executing operations manually from the DataFrame Operations interface.';
        setMessages(prev => [...prev, executionErrorMsg]);
        
        updateAtomSettings(atomId, {
          lastError: (error as Error).message,
          operationCompleted: false
        });
      }
    }

    return { success: true };
  },

  handleFailure: async (data: any, context: AtomHandlerContext): Promise<AtomHandlerResponse> => {
    const { atomId, updateAtomSettings, setMessages } = context;
    
    console.log('🔍 DEBUG: Handling dataframe operations failure');
    
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
        recommendedFiles: data.recommended_files || [],
        fileAnalysis: data.file_analysis || null,
        lastInteractionTime: Date.now()
      });
    }
    
    return { success: true };
  }
};
