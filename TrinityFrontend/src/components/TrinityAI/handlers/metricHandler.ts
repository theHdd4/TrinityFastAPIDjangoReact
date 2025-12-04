import { LABORATORY_API, CREATECOLUMN_API, FEATURE_OVERVIEW_API, VALIDATE_API } from '@/lib/api';
import { AtomHandler, AtomHandlerContext, AtomHandlerResponse, Message } from './types';
import { 
  getEnvironmentContext, 
  getFilename,
  createMessage, 
  createSuccessMessage, 
  createErrorMessage,
  processSmartResponse,
  validateFileInput,
  formatAgentResponseForTextBox,
  updateCardTextBox,
  addCardTextBox
} from './utils';
import { useLaboratoryStore } from '@/components/LaboratoryMode/store/laboratoryStore';
import { generateAtomInsight } from './insightGenerator';
import { resolveTaskResponse } from '@/lib/taskQueue';

export const metricHandler: AtomHandler = {
  handleSuccess: async (data: any, context: AtomHandlerContext): Promise<AtomHandlerResponse> => {
    const { atomId, updateAtomSettings, setMessages, sessionId } = context;
    
    console.log('🔧 ===== METRIC HANDLER CALLED =====');
    console.log('📦 Full data structure:', JSON.stringify(data, null, 2));
    console.log('🔍 Data keys:', Object.keys(data));
    console.log('🔍 Operation type:', data.operation_type || data.data?.operation_type);
    
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
      console.error('❌ Error adding reasoning to text box:', textBoxError);
      // Continue even if text box update fails
    }
    
    // Extract operation type and configuration
    const operationType = (data.operation_type || data.data?.operation_type || '').toLowerCase();
    const operationConfig = data.operation_config || data.data?.operation_config || {};
    const dataSource = data.data_source || data.data?.data_source || '';
    const fileName = data.file_name || data.data?.file_name || '';
    
    console.log('🔍 Extracted operation details:', {
      operationType,
      operationConfig,
      dataSource,
      fileName
    });
    
    // Get environment context
    const envContext = getEnvironmentContext();
    console.log('🔍 Environment context loaded:', envContext);
    
    if (!envContext.client_name || !envContext.app_name || !envContext.project_name) {
      const errorMsg = createErrorMessage(
        'Metric operation',
        'Project context not available',
        'Please ensure you are in a valid project'
      );
      setMessages(prev => [...prev, errorMsg]);
      return { success: false, error: 'Project context not available' };
    }
    
    try {
      let resultFileId: string | null = null;
      let resultObjectName: string | null = null;
      
      // Handle different operation types
      if (operationType === 'variables') {
        // Handle Variables operation
        const variableType = operationConfig.variable_type?.toLowerCase() || 'dataframe';
        
        if (variableType === 'constant') {
          // Handle constant assignments
          const assignments = operationConfig.assignments || [];
          if (assignments.length === 0) {
            throw new Error('No assignments provided for constant variable type');
          }
          
          const payload = {
            assignments: assignments.map((a: any) => ({
              variableName: (a.variableName || a.variable_name || '').trim(),
              value: (a.value || '').trim(),
            })),
            dataSource: dataSource,
            clientName: envContext.client_name,
            appName: envContext.app_name,
            projectName: envContext.project_name,
            confirmOverwrite: false,
          };
          
          const response = await fetch(`${LABORATORY_API}/variables/assign`, {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
            },
            credentials: 'include',
            body: JSON.stringify(payload),
          });
          
          if (!response.ok) {
            const errorData = await response.json().catch(() => ({ error: 'Unknown error' }));
            throw new Error(errorData.error || `HTTP error! status: ${response.status}`);
          }
          
          const result = await response.json();
          
          if (result.success) {
            const successMsg = createSuccessMessage(
              'Variables created',
              `Successfully created ${result.newVariables?.length || assignments.length} constant variable(s)`
            );
            setMessages(prev => [...prev, successMsg]);
          } else {
            throw new Error(result.error || 'Failed to create variables');
          }
          
        } else {
          // Handle dataframe variable computation
          const operations = operationConfig.operations || [];
          if (operations.length === 0) {
            throw new Error('No operations provided for dataframe variable type');
          }
          
          const computeMode = operationConfig.compute_mode || 'whole-dataframe';
          const identifiers = computeMode === 'within-group' 
            ? (operationConfig.identifiers || [])
            : undefined;
          
          // Build operations array matching VariableTab format exactly
          const formattedOperations = operations.map((op: any) => {
            const operation: any = {
              id: op.id || `op_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
              numericalColumn: op.numericalColumn || op.numerical_column || '',
              method: op.method || 'sum',
            };
            
            // Add customName only if present
            if (op.customName || op.custom_name) {
              operation.customName = op.customName || op.custom_name;
            }
            
            // Handle secondColumn or secondValue (only include if present and not null)
            if (op.secondColumn || op.second_column) {
              operation.secondColumn = op.secondColumn || op.second_column;
            } else if (op.secondValue !== null && op.secondValue !== undefined && op.secondValue !== '') {
              // Parse as float if it's a number string
              const numValue = typeof op.secondValue === 'string' ? parseFloat(op.secondValue) : op.secondValue;
              if (!isNaN(numValue)) {
                operation.secondValue = numValue;
              }
            }
            
            return operation;
          });
          
          const payload: any = {
            dataSource: dataSource,
            computeMode: computeMode,
            operations: formattedOperations,
            clientName: envContext.client_name,
            appName: envContext.app_name,
            projectName: envContext.project_name,
          };
          
          // Only include identifiers if computeMode is within-group
          if (computeMode === 'within-group' && identifiers && identifiers.length > 0) {
            payload.identifiers = identifiers;
          }
          
          console.log('🔧 Sending variables/compute request:', JSON.stringify(payload, null, 2));
          
          const response = await fetch(`${LABORATORY_API}/variables/compute`, {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
            },
            credentials: 'include',
            body: JSON.stringify(payload),
          });
          
          console.log('🔧 Response status:', response.status, response.statusText);
          
          if (!response.ok) {
            const errorData = await response.json().catch(() => ({ error: 'Unknown error' }));
            throw new Error(errorData.error || `HTTP error! status: ${response.status}`);
          }
          
          const result = await response.json();
          
          if (result.success) {
            // Get the result file information
            resultFileId = result.file_id || null;
            resultObjectName = result.object_name || result.data_source || null;
            
            const successMsg = createSuccessMessage(
              'Variables created',
              `Successfully created ${result.newColumns?.length || operations.length} variable(s)`
            );
            setMessages(prev => [...prev, successMsg]);
          } else {
            throw new Error(result.error || 'Failed to create variables');
          }
        }
        
      } else if (operationType === 'column_ops') {
        // Handle Column Operations
        const colOpType = operationConfig.operation_type || '';
        const columns = operationConfig.columns || [];
        
        if (!colOpType) {
          throw new Error('No column operation type specified');
        }
        
        // For now, we'll use the create-column endpoint for column operations
        // This can be extended to use specific endpoints for different operation types
        const payload = {
          object_name: dataSource,
          operations: [{
            type: colOpType,
            columns: columns.map((c: string) => c.toLowerCase()),
            parameters: operationConfig.parameters || {},
          }],
        };
        
        const response = await fetch(`${CREATECOLUMN_API}/execute`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
          },
          credentials: 'include',
          body: JSON.stringify(payload),
        });
        
        if (!response.ok) {
          const errorData = await response.json().catch(() => ({ error: 'Unknown error' }));
          throw new Error(errorData.error || `HTTP error! status: ${response.status}`);
        }
        
        const raw = await response.json();
        const result = await resolveTaskResponse(raw);
        
        if (result.success) {
          resultFileId = result.file_id || null;
          resultObjectName = result.object_name || result.data_source || null;
          
          const successMsg = createSuccessMessage(
            'Column operation completed',
            `Successfully performed ${colOpType} operation`
          );
          setMessages(prev => [...prev, successMsg]);
        } else {
          throw new Error(result.error || 'Failed to perform column operation');
        }
        
      } else if (operationType === 'input') {
        // Handle Input operation (data source selection)
        // Just update the metrics input store with the selected data source
        const selectedFile = operationConfig.selected_file || dataSource;
        
        if (!selectedFile) {
          throw new Error('No file selected for input operation');
        }
        
        // Update metrics inputs store
        useLaboratoryStore.getState().updateMetricsInputs({
          dataSource: selectedFile
        });
        
        const successMsg = createSuccessMessage(
          'Data source selected',
          `Selected data source: ${getFilename(selectedFile)}`
        );
        setMessages(prev => [...prev, successMsg]);
        
        // For input operation, we don't create a new file, just update the selection
        return { success: true };
        
      } else {
        throw new Error(`Unknown operation type: ${operationType}`);
      }
      
      // If we have a result file, load it and create/update DataFrame Operations atom
      if (resultFileId && resultObjectName) {
        console.log('📥 Loading result file into DataFrame Operations...');
        
        // Try to find existing DataFrame Operations atom or create new one
        const cards = useLaboratoryStore.getState().cards;
        let dfOpsAtomId: string | null = null;
        
        // Look for existing DataFrame Operations atom
        for (const card of cards) {
          if (Array.isArray(card.atoms)) {
            const dfOpsAtom = card.atoms.find(atom => atom.atomId === 'dataframe-operations');
            if (dfOpsAtom) {
              dfOpsAtomId = dfOpsAtom.id;
              break;
            }
          }
        }
        
        // If no existing atom, we'll let the user manually add it
        // For now, just update the atom settings if we found one
        if (dfOpsAtomId) {
          updateAtomSettings(dfOpsAtomId, {
            dataSource: resultObjectName,
            selectedDataSource: resultObjectName,
            fileName: getFilename(resultObjectName),
            fileId: resultFileId,
          });
          
          const successMsg = createSuccessMessage(
            'File loaded',
            `Result file loaded into DataFrame Operations: ${getFilename(resultObjectName)}`
          );
          setMessages(prev => [...prev, successMsg]);
        } else {
          const infoMsg: Message = {
            id: (Date.now() + 2).toString(),
            content: `✅ Operation completed successfully!\n\nResult file: ${getFilename(resultObjectName)}\n\n💡 You can now add a DataFrame Operations atom and select this file to view the results.`,
            sender: 'ai',
            timestamp: new Date(),
          };
          setMessages(prev => [...prev, infoMsg]);
        }
      }
      
      // Generate insight after operation completes
      await new Promise(resolve => setTimeout(resolve, 500));
      
      let textBoxAdded = false;
      try {
        await addCardTextBox(atomId, 'Generating insight...', 'AI Insight');
        textBoxAdded = true;
        console.log('✅ Placeholder text box added for insight');
      } catch (textBoxError) {
        console.error('❌ Error adding placeholder text box:', textBoxError);
      }
      
      generateAtomInsight({
        data,
        atomType: 'metric',
        sessionId,
        atomId,
      }).catch((error) => {
        console.error('❌ Error generating insight:', error);
      });
      
      return { success: true };
      
    } catch (error: any) {
      console.error('❌ Error in metric handler:', error);
      
      const errorMsg = createErrorMessage(
        'Metric operation',
        error.message || 'Unknown error occurred',
        'Please check the operation configuration and try again'
      );
      setMessages(prev => [...prev, errorMsg]);
      
      return { success: false, error: error.message || 'Unknown error' };
    }
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

