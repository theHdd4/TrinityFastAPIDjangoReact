import { CORRELATION_API } from '@/lib/api';
import { AtomHandler, AtomHandlerContext, AtomHandlerResponse, Message } from './types';
import { useLaboratoryStore } from '@/components/LaboratoryMode/store/laboratoryStore';

/**
 * Extract top correlations from correlation matrix
 */
const extractTopCorrelations = (correlationMatrix: any, columns: string[], topN: number = 5): Array<{var1: string, var2: string, value: number}> => {
  const correlations: Array<{var1: string, var2: string, value: number}> = [];
  
  for (let i = 0; i < columns.length; i++) {
    for (let j = i + 1; j < columns.length; j++) {
      const var1 = columns[i];
      const var2 = columns[j];
      const rowData = correlationMatrix[var1];
      if (rowData && typeof rowData === 'object') {
        const value = rowData[var2];
        if (typeof value === 'number' && isFinite(value) && var1 !== var2) {
          correlations.push({ var1, var2, value: Math.abs(value) });
        }
      }
    }
  }
  
  // Sort by absolute value and return top N
  return correlations
    .sort((a, b) => b.value - a.value)
    .slice(0, topN)
    .map(corr => ({
      var1: corr.var1,
      var2: corr.var2,
      value: correlationMatrix[corr.var1]?.[corr.var2] || 0 // Get original signed value
    }));
};

/**
 * Calculate correlation statistics
 */
const calculateCorrelationStats = (correlationMatrix: any, columns: string[]): {
  total_pairs: number;
  strong_positive: number; // > 0.7
  moderate_positive: number; // 0.3 to 0.7
  weak: number; // -0.3 to 0.3
  moderate_negative: number; // -0.7 to -0.3
  strong_negative: number; // < -0.7
  average_correlation: number;
} => {
  const correlations: number[] = [];
  
  for (let i = 0; i < columns.length; i++) {
    for (let j = i + 1; j < columns.length; j++) {
      const var1 = columns[i];
      const var2 = columns[j];
      const rowData = correlationMatrix[var1];
      if (rowData && typeof rowData === 'object') {
        const value = rowData[var2];
        if (typeof value === 'number' && isFinite(value)) {
          correlations.push(value);
        }
      }
    }
  }
  
  const stats = {
    total_pairs: correlations.length,
    strong_positive: 0,
    moderate_positive: 0,
    weak: 0,
    moderate_negative: 0,
    strong_negative: 0,
    average_correlation: 0,
  };
  
  if (correlations.length > 0) {
    const sum = correlations.reduce((a, b) => a + b, 0);
    stats.average_correlation = sum / correlations.length;
    
    correlations.forEach(val => {
      if (val > 0.7) stats.strong_positive++;
      else if (val > 0.3) stats.moderate_positive++;
      else if (val > -0.3) stats.weak++;
      else if (val > -0.7) stats.moderate_negative++;
      else stats.strong_negative++;
    });
  }
  
  return stats;
};
import { 
  getEnvironmentContext, 
  getFilename, 
  createMessage, 
  createSuccessMessage, 
  createErrorMessage,
  processSmartResponse,
  validateFileInput,
  addCardTextBox,
  updateCardTextBox,
  formatAgentResponseForTextBox
} from './utils';
import { generateAtomInsight } from './insightGenerator';

export const correlationHandler: AtomHandler = {
  handleSuccess: async (data: any, context: AtomHandlerContext): Promise<AtomHandlerResponse> => {
    const { atomId, updateAtomSettings, setMessages, sessionId } = context;
    
    // All detailed logging happens on backend - check terminal for logs
    
    // Show smart_response in chat FIRST (user-friendly message)
    const smartResponseText = processSmartResponse(data);
    if (smartResponseText) {
      const smartMsg: Message = {
        id: (Date.now() + 1).toString(),
        content: smartResponseText,
        sender: 'ai',
        timestamp: new Date(),
      };
      setMessages(prev => [...prev, smartMsg]);
    }
    
    // Show response and reasoning in chat
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
    }
    
    if (reasoningText) {
      const reasoningMsg: Message = {
        id: (Date.now() + 3).toString(),
        content: `**Reasoning:**\n${reasoningText}`,
        sender: 'ai',
        timestamp: new Date(),
      };
      setMessages(prev => [...prev, reasoningMsg]);
    }
    
    // STEP 1: Add the 3 keys (smart_response, response, reasoning) to a TEXT BOX
    const textBoxContent = formatAgentResponseForTextBox(data);
    
    try {
      await updateCardTextBox(atomId, textBoxContent);
    } catch (textBoxError) {
      console.error('❌ Error adding 3 keys to text box:', textBoxError);
      // Continue even if text box update fails
    }
    
    if (!data.correlation_config) {
      return { success: false, error: 'No correlation configuration found in AI response' };
    }

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
      } else {
        // It's just a filename - we need to find the full path
        // This shouldn't happen if LLM returns full paths, but handle it gracefully
        filePathForRequest = filePath; // Use filename and hope backend can find it
      }
    } else {
      const errorMsg = createMessage(
        data.smart_response || `I couldn't find a data file to analyze. Please make sure you have selected or uploaded a data file first, then try your correlation request again.`
      );
      setMessages(prev => [...prev, errorMsg]);
      return { success: false, error: 'No file path in correlation configuration' };
    }
    
    try {
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
      }
      
      // Only add measure columns if explicitly provided and non-empty
      // If empty, backend will auto-detect all numeric columns (like manual mode)
      if (correlationConfig.measure_columns && Array.isArray(correlationConfig.measure_columns) && correlationConfig.measure_columns.length > 0) {
        request.measure_columns = correlationConfig.measure_columns;
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
      
      // Call the filter-and-correlate endpoint
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
      
      // Transform correlation matrix from dict to 2D array
      const correlationMatrixDict = correlationResult.correlation_results?.correlation_matrix || {};
      const columnsUsed = correlationResult.columns_used || [];
      
      // Build 2D matrix
      const matrix: number[][] = columnsUsed.map((rowVar: string) => {
        return columnsUsed.map((colVar: string) => {
          if (rowVar === colVar) return 1.0;
          const rowData = correlationMatrixDict[rowVar];
          if (rowData && typeof rowData === 'object') {
            const value = rowData[colVar];
            return (typeof value === 'number' && isFinite(value)) ? value : 0.0;
          }
          return 0.0;
        });
      });
      
      // Calculate top correlations and statistics for insights
      const topCorrelations = extractTopCorrelations(correlationMatrixDict, columnsUsed);
      const correlationStats = calculateCorrelationStats(correlationMatrixDict, columnsUsed);
      
      // Update atom settings with correlation configuration (matching manual mode structure)
      const updatedSettings: any = {
        selectedFile: filePathForRequest, // Use full path
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
        // Store correlation results for insight generation
        correlationResults: {
          correlationMatrixDict: correlationMatrixDict, // Original dict format
          correlationMatrix2D: matrix, // 2D array format
          columnsUsed: columnsUsed,
          topCorrelations: topCorrelations,
          correlationStats: correlationStats,
          originalRows: correlationResult.original_rows,
          filteredRows: correlationResult.filtered_rows,
          processingTimeMs: correlationResult.processing_time_ms,
          dateAnalysis: correlationResult.date_analysis,
        }
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
      
      updateAtomSettings(atomId, updatedSettings);
      
      // Create success message
      const successMsg = createMessage(
        `✅ Correlation analysis completed successfully! I've calculated correlations using the ${correlationConfig.method || 'pearson'} method on ${columnsUsed.length} numeric columns. The correlation matrix is now displayed in the heatmap. You can click on any cell to view the time series comparison.`,
        'ai'
      );
      setMessages(prev => [...prev, successMsg]);
      
      // STEP 2: Generate insight AFTER all 3 keys are shown in text box and correlation results are obtained
      // This ensures the insight LLM has access to both the original response AND the correlation results
      // All detailed logging happens on backend - check terminal for logs
      
      // Prepare enhanced data with correlation results for insight generation
      // Include the 3 keys from the original AI response (they're in 'data')
      // Include correlation results from backend API call
      const enhancedDataForInsight = {
        ...data, // This includes smart_response, response, reasoning (the 3 keys)
        correlation_config: correlationConfig, // Original config from first LLM call
        correlation_results: {
          correlation_matrix: correlationMatrixDict, // Original dict format from backend
          correlation_matrix_2d: matrix, // 2D array format for UI
          columns_used: columnsUsed,
          method: correlationConfig.method || 'pearson',
          original_rows: correlationResult.original_rows,
          filtered_rows: correlationResult.filtered_rows,
          processing_time_ms: correlationResult.processing_time_ms,
          date_analysis: correlationResult.date_analysis,
          preview_data: correlationResult.preview_data,
          filtered_file_path: correlationResult.filtered_file_path,
          top_correlations: topCorrelations,
          correlation_statistics: correlationStats,
        },
        file_details: {
          file_path: filePathForRequest,
          file_name: getFilename(filePathForRequest),
          filtered_file_path: correlationResult.filtered_file_path,
        },
        metadata: {
          original_rows: correlationResult.original_rows,
          filtered_rows: correlationResult.filtered_rows,
          row_count: correlationResult.filtered_rows || correlationResult.original_rows,
        }
      };
      
      // Generate insight - this is the 2nd LLM call
      // All detailed logging happens on backend - check terminal for logs
      
      // Add a small delay to ensure first text box is fully saved
      await new Promise(resolve => setTimeout(resolve, 500));
      
      generateAtomInsight({
        data: enhancedDataForInsight,
        atomType: 'correlation',
        sessionId,
      }).then(async (result) => {
        if (result.success && result.insight) {
          try {
            // Add insight to a NEW text box (separate from the text box with 3 keys)
            await addCardTextBox(atomId, result.insight, 'AI Insight');
          } catch (textBoxError) {
            console.error('❌ Error adding new text box with insight:', textBoxError);
          }
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

