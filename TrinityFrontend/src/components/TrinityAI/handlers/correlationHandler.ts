import { CORRELATION_API } from '@/lib/api';
import { AtomHandler, AtomHandlerContext, AtomHandlerResponse, Message } from './types';
import { 
  getEnvironmentContext, 
  getFilename, 
  createMessage, 
  createSuccessMessage, 
  createErrorMessage,
  processSmartResponse,
  validateFileInput,
  updateCardTextBox
} from './utils';
import { generateAndFormatInsight } from './insightGenerator';

export const correlationHandler: AtomHandler = {
  handleSuccess: async (data: any, context: AtomHandlerContext): Promise<AtomHandlerResponse> => {
    const { atomId, updateAtomSettings, setMessages, sessionId } = context;
    
    // Show smart_response FIRST (user-friendly message)
    const smartResponseText = processSmartResponse(data);
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
    
    // Show response and reasoning in chat box (3 keys total: smart_response, response, reasoning)
    const responseText = data.response || data.data?.response || '';
    const reasoningText = data.reasoning || data.data?.reasoning || '';
    
    if (responseText) {
      const responseMsg: Message = {
        id: (Date.now() + 2).toString(),
        content: `**Response:**\n${responseText}`,
        sender: 'ai',
        timestamp: new Date(),
      };
      setMessages(prev => [...prev, responseMsg]);
      console.log('✅ Displayed response to user');
    }
    
    if (reasoningText) {
      const reasoningMsg: Message = {
        id: (Date.now() + 3).toString(),
        content: `**Reasoning:**\n${reasoningText}`,
        sender: 'ai',
        timestamp: new Date(),
      };
      setMessages(prev => [...prev, reasoningMsg]);
      console.log('✅ Displayed reasoning to user');
    }
    
    if (!data.correlation_config) {
      return { success: false, error: 'No correlation configuration found in AI response' };
    }

    console.log('🔍 ===== CORRELATION AI RESPONSE =====');
    console.log('📝 User Prompt received for session:', sessionId);
    console.log('🔧 Correlation Config:', data.correlation_config);
    
    const correlationConfig = data.correlation_config;
    
    // Get target file from AI response - use the FULL path (as it appears in available files)
    // This matches manual mode behavior where full object path is used
    let filePathForRequest = '';
    if (correlationConfig.file_path || data.file_name) {
      const filePath = correlationConfig.file_path || data.file_name;
      
      // Check if it's already a full path (contains '/') or just a filename
      // Manual mode uses full paths like "Quant_Matrix_AI_Schema/churn-prediction/New Projects Project/D0_KHC_UK_Beans.arrow"
      if (filePath.includes('/')) {
        // It's already a full path - use it as-is (matches manual mode)
        filePathForRequest = filePath;
        console.log('📄 Using full path from AI response:', filePathForRequest);
      } else {
        // It's just a filename - we need to find the full path
        // This shouldn't happen if LLM returns full paths, but handle it gracefully
        console.warn('⚠️ LLM returned just filename, not full path. Filename:', filePath);
        console.warn('⚠️ Attempting to use filename directly - this may fail if file not in root bucket');
        filePathForRequest = filePath; // Use filename and hope backend can find it
      }
    } else {
      console.log('⚠️ No file_path found in correlation config');
      const errorMsg = createMessage(
        data.smart_response || `I couldn't find a data file to analyze. Please make sure you have selected or uploaded a data file first, then try your correlation request again.`
      );
      setMessages(prev => [...prev, errorMsg]);
      return { success: false, error: 'No file path in correlation configuration' };
    }
    
    try {
      console.log('🎯 Processing correlation configuration...');
      console.log('📋 Using full file path (like manual mode):', filePathForRequest);
      
      // Build the filter and correlate request - match manual mode structure
      // Backend will auto-detect columns if not provided (like manual mode)
      const request: any = {
        file_path: filePathForRequest, // Full path as shown in available files (matches manual mode)
        method: correlationConfig.method || 'pearson',
        include_preview: correlationConfig.include_preview !== false,
        preview_limit: 10,
        save_filtered: true,
        include_date_analysis: correlationConfig.include_date_analysis !== false, // Default to true like manual
      };
      
      // Only add identifier columns if explicitly provided and non-empty
      // If empty, backend will auto-detect (like manual mode)
      if (correlationConfig.identifier_columns && Array.isArray(correlationConfig.identifier_columns) && correlationConfig.identifier_columns.length > 0) {
        request.identifier_columns = correlationConfig.identifier_columns;
        console.log('📋 Using AI-provided identifier_columns:', correlationConfig.identifier_columns);
      } else {
        console.log('📋 No identifier_columns provided - backend will auto-detect (like manual mode)');
      }
      
      // Only add measure columns if explicitly provided and non-empty
      // If empty, backend will auto-detect all numeric columns (like manual mode)
      if (correlationConfig.measure_columns && Array.isArray(correlationConfig.measure_columns) && correlationConfig.measure_columns.length > 0) {
        request.measure_columns = correlationConfig.measure_columns;
        console.log('📋 Using AI-provided measure_columns:', correlationConfig.measure_columns);
      } else {
        console.log('📋 No measure_columns provided - backend will auto-detect all numeric columns (like manual mode)');
      }
      
      // Add identifier filters if specified
      if (correlationConfig.identifier_filters && Array.isArray(correlationConfig.identifier_filters) && correlationConfig.identifier_filters.length > 0) {
        request.identifier_filters = correlationConfig.identifier_filters;
      }
      
      // Add measure filters if specified
      if (correlationConfig.measure_filters && Array.isArray(correlationConfig.measure_filters) && correlationConfig.measure_filters.length > 0) {
        request.measure_filters = correlationConfig.measure_filters;
      }
      
      // Add date column and range filter if specified
      if (correlationConfig.date_column) {
        request.date_column = correlationConfig.date_column;
      }
      
      if (correlationConfig.date_range_filter) {
        request.date_range_filter = correlationConfig.date_range_filter;
      }
      
      // Add aggregation level if specified
      if (correlationConfig.aggregation_level) {
        request.aggregation_level = correlationConfig.aggregation_level;
      }
      
      console.log('📋 Correlation request (matching manual mode structure):', JSON.stringify(request, null, 2));
      
      // Call the filter-and-correlate endpoint
      console.log('🔄 Calling filter-and-correlate endpoint...');
      const response = await fetch(`${CORRELATION_API}/filter-and-correlate`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(request),
      });
      
      if (!response.ok) {
        const errorText = await response.text();
        console.error('❌ Correlation request failed:', {
          status: response.status,
          statusText: response.statusText,
          error: errorText
        });
        throw new Error(`Correlation request failed: ${response.status} - ${errorText}`);
      }
      
      const correlationResult = await response.json();
      console.log('✅ Correlation result received:', correlationResult);
      
      // Transform correlation matrix from dict to 2D array
      const correlationMatrix = correlationResult.correlation_results?.correlation_matrix || {};
      const columnsUsed = correlationResult.columns_used || [];
      
      // Build 2D matrix
      const matrix: number[][] = columnsUsed.map((rowVar: string) => {
        return columnsUsed.map((colVar: string) => {
          if (rowVar === colVar) return 1.0;
          const rowData = correlationMatrix[rowVar];
          if (rowData && typeof rowData === 'object') {
            const value = rowData[colVar];
            return (typeof value === 'number' && isFinite(value)) ? value : 0.0;
          }
          return 0.0;
        });
      });
      
      // Update atom settings with correlation configuration (matching manual mode structure)
      const updatedSettings: any = {
        selectedFile: filePathForRequest, // Use filename (like manual mode)
        variables: columnsUsed,
        correlationMatrix: matrix,
        selectedVar1: null,
        selectedVar2: null,
        timeSeriesData: [],
        timeSeriesIsDate: true,
        isUsingFileData: true,
        fileData: {
          fileName: correlationResult.filtered_file_path || filePathForRequest,
          rawData: correlationResult.preview_data || [],
          numericColumns: columnsUsed,
          dateColumns: correlationResult.date_analysis?.date_columns?.map((c: any) => c.column_name) || [],
          categoricalColumns: correlationResult.columns_used?.filter((col: string) => !columnsUsed.includes(col)) || [],
          isProcessed: true,
        },
        settings: {
          ...correlationConfig,
          correlationMethod: correlationConfig.method || 'pearson',
          filterDimensions: correlationConfig.identifier_filters?.reduce((acc: any, filter: any) => {
            if (filter.column && filter.values) {
              acc[filter.column] = filter.values;
            }
            return acc;
          }, {}) || {},
        },
      };
      
      // Initialize selected numeric columns for matrix (first 15 if > 15, else all)
      updatedSettings.selectedNumericColumnsForMatrix = columnsUsed.length > 15 
        ? columnsUsed.slice(0, 15) 
        : columnsUsed;
      
      // Add date analysis if available
      if (correlationResult.date_analysis) {
        updatedSettings.dateAnalysis = correlationResult.date_analysis;
        
        // Set date range if available
        if (correlationResult.date_analysis.overall_date_range) {
          updatedSettings.settings = {
            ...updatedSettings.settings,
            dateFrom: correlationResult.date_analysis.overall_date_range.min_date || '',
            dateTo: correlationResult.date_analysis.overall_date_range.max_date || '',
          };
        }
      }
      
      // Add filtered file path if available
      if (correlationResult.filtered_file_path) {
        updatedSettings.filteredFilePath = correlationResult.filtered_file_path;
      }
      
      console.log('✅ Updating correlation atom settings...');
      updateAtomSettings(atomId, updatedSettings);
      
      // Create success message
      const successMsg = createMessage(
        `✅ Correlation analysis completed successfully! I've calculated correlations using the ${correlationConfig.method || 'pearson'} method on ${columnsUsed.length} numeric columns. The correlation matrix is now displayed in the heatmap. You can click on any cell to view the time series comparison.`,
        'ai'
      );
      setMessages(prev => [...prev, successMsg]);
      
      // Generate and display insight in text box (using smart_response, response, reasoning)
      console.log('🔍 Generating insight with 3 keys (smart_response, response, reasoning)...');
      generateAndFormatInsight({
        data,
        atomType: 'correlation',
        sessionId,
      }).then(async (result) => {
        console.log('✅ Insight generated by LLM - will be displayed in text box');
        try {
          await updateCardTextBox(atomId, result.formattedContent);
          console.log('✅ Card text box updated with insight');
        } catch (textBoxError) {
          console.error('❌ Error updating card text box with insight:', textBoxError);
        }
      }).catch((error) => {
        console.error('❌ Error generating insight:', error);
      });
      
      return {
        success: true,
        atomSettings: updatedSettings
      };
      
    } catch (error: any) {
      console.error('❌ Correlation handler error:', error);
      const errorMsg = createErrorMessage(error, 'Correlation analysis');
      setMessages(prev => [...prev, errorMsg]);
      return {
        success: false,
        error: error.message || 'Failed to process correlation configuration'
      };
    }
  },
  
  handleFailure: async (data: any, context: AtomHandlerContext): Promise<AtomHandlerResponse> => {
    const { setMessages } = context;
    
    // Show smart_response if available
    const smartResponseText = processSmartResponse(data);
    const errorMessage = smartResponseText || data.error || data.message || 'I encountered an issue processing your correlation request. Please try again with more specific details.';
    
    const errorMsg = createMessage(errorMessage, 'ai');
    setMessages(prev => [...prev, errorMsg]);
    
    return {
      success: false,
      error: errorMessage
    };
  }
};

