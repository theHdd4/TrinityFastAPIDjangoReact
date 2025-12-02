/**
 * Standardized Data Summary Extractors
 * Extracts relevant data summaries from atom handler responses in a standardized format
 */

export interface StandardizedDataSummary {
  atom_type: string;
  summary_data: {
    [key: string]: any;
  };
  metadata: {
    file_name?: string;
    row_count?: number;
    column_count?: number;
    [key: string]: any;
  };
}

/**
 * Extract data summary for chart-maker atom
 */
export const getChartMakerDataSummary = (data: any): StandardizedDataSummary => {
  const chartJson = data.chart_json || data.chart_config || null;
  const chartsList = Array.isArray(chartJson) ? chartJson : chartJson ? [chartJson] : [];
  
  const summary: StandardizedDataSummary = {
    atom_type: 'chart-maker',
    summary_data: {
      chart_count: chartsList.length,
      chart_config: chartsList.length > 0 ? chartsList[0] : null,
      chart_configs: chartsList,
      chart_results: data.chart_results || null,
    },
    metadata: {
      file_name: data.file_name || data.data_source || data.file_details?.file_name || '',
      row_count: data.chart_results?.file_data?.row_count,
      column_count: data.chart_results?.file_data?.columns?.length,
    }
  };
  
  return summary;
};

/**
 * Extract data summary for correlation atom
 */
export const getCorrelationDataSummary = (data: any): StandardizedDataSummary => {
  const correlationConfig = data.correlation_config || {};
  const correlationResults = data.correlation_results || {};
  
  const summary: StandardizedDataSummary = {
    atom_type: 'correlation',
    summary_data: {
      correlation_method: correlationConfig.method || 'pearson',
      correlation_matrix: correlationResults.correlation_matrix || {},
      columns_analyzed: correlationResults.columns_used || [],
      correlation_statistics: correlationResults.correlation_statistics || {},
      top_correlations: correlationResults.top_correlations || [],
    },
    metadata: {
      file_name: data.file_details?.file_name || correlationConfig.file_path || '',
      row_count: correlationResults.filtered_rows || correlationResults.original_rows,
      column_count: correlationResults.columns_used?.length || 0,
    }
  };
  
  return summary;
};

/**
 * Extract data summary for concat atom
 */
export const getConcatDataSummary = (data: any): StandardizedDataSummary => {
  const concatConfig = data.concat_json || {};
  const concatResults = data.concat_results || {};
  
  const summary: StandardizedDataSummary = {
    atom_type: 'concat',
    summary_data: {
      file1: concatConfig.file1 || data.file_details?.file1 || '',
      file2: concatConfig.file2 || data.file_details?.file2 || '',
      direction: concatConfig.concat_direction || data.file_details?.direction || 'vertical',
      concat_results: {
        concat_id: concatResults.concat_id || '',
        result_shape: concatResults.result_shape || '',
        columns: concatResults.columns || [],
        row_count: concatResults.row_count || 0,
      },
    },
    metadata: {
      file1_name: concatConfig.file1 || data.file_details?.file1 || '',
      file2_name: concatConfig.file2 || data.file_details?.file2 || '',
      row_count: concatResults.row_count || 0,
      column_count: concatResults.columns?.length || 0,
    }
  };
  
  return summary;
};

/**
 * Extract data summary for create-transform atom
 */
export const getCreateTransformDataSummary = (data: any): StandardizedDataSummary => {
  const jsonData = data.json || data.create_json || data.create_transform_json || data.config || null;
  const operations = data.operations || [];
  const operationResults = data.operation_results || {};
  
  const summary: StandardizedDataSummary = {
    atom_type: 'create-transform',
    summary_data: {
      operations_count: operations.length,
      operations: operations.map((op: any) => ({
        type: op.type,
        columns: op.columns || [],
        new_column_name: op.newColumnName || op.rename || '',
      })),
      operation_results: {
        result_file: operationResults.result_file || '',
        row_count: operationResults.row_count || 0,
        columns: operationResults.columns || [],
        new_columns: operationResults.new_columns || [],
        operations_executed: operationResults.operations_executed || [],
      },
    },
    metadata: {
      file_name: data.file_details?.file_name || data.file_name || '',
      row_count: operationResults.row_count || data.metadata?.row_count || 0,
      column_count: operationResults.columns?.length || data.metadata?.column_count || 0,
      new_column_count: operationResults.new_columns?.length || data.metadata?.new_column_count || 0,
    }
  };
  
  return summary;
};

/**
 * Extract data summary for groupby atom
 */
export const getGroupbyDataSummary = (data: any): StandardizedDataSummary => {
  const groupbyConfig = data.groupby_json || {};
  const groupbyResults = data.groupby_results || {};
  
  const summary: StandardizedDataSummary = {
    atom_type: 'groupby-wtg-avg',
    summary_data: {
      identifiers: groupbyConfig.identifiers || data.file_details?.identifiers || [],
      aggregations: groupbyConfig.aggregations || data.file_details?.aggregations || [],
      groupby_results: {
        result_file: groupbyResults.result_file || '',
        row_count: groupbyResults.row_count || 0,
        columns: groupbyResults.columns || [],
        unsaved_data: groupbyResults.unsaved_data || null,
      },
    },
    metadata: {
      file_name: data.file_details?.file_name || groupbyConfig.file_name || groupbyConfig.object_names || '',
      row_count: groupbyResults.row_count || 0,
      column_count: groupbyResults.columns?.length || 0,
      identifiers_count: (groupbyConfig.identifiers || data.file_details?.identifiers || []).length,
      aggregations_count: (groupbyConfig.aggregations || data.file_details?.aggregations || []).length,
    }
  };
  
  return summary;
};

/**
 * Extract data summary for merge atom
 */
export const getMergeDataSummary = (data: any): StandardizedDataSummary => {
  const mergeConfig = data.merge_json || {};
  const mergeResults = data.merge_results || {};
  
  const summary: StandardizedDataSummary = {
    atom_type: 'merge',
    summary_data: {
      file1: mergeConfig.file1 || data.file_details?.file1 || '',
      file2: mergeConfig.file2 || data.file_details?.file2 || '',
      join_columns: mergeConfig.join_columns || data.file_details?.joinColumns || [],
      join_type: mergeConfig.join_type || data.file_details?.joinType || 'inner',
      merge_results: {
        merge_id: mergeResults.merge_id || '',
        result_shape: mergeResults.result_shape || '',
        columns: mergeResults.columns || [],
        row_count: mergeResults.row_count || 0,
      },
    },
    metadata: {
      file1_name: mergeConfig.file1 || data.file_details?.file1 || '',
      file2_name: mergeConfig.file2 || data.file_details?.file2 || '',
      row_count: mergeResults.row_count || 0,
      column_count: mergeResults.columns?.length || 0,
      join_columns_count: (mergeConfig.join_columns || data.file_details?.joinColumns || []).length,
    }
  };
  
  return summary;
};

/**
 * Extract data summary for dataframe-operations atom
 */
export const getDataframeOperationsDataSummary = (data: any): StandardizedDataSummary => {
  const dataframeConfig = data.dataframe_config || {};
  const executionResults = data.execution_results || [];
  const operationSummary = data.operation_summary || {};
  
  const summary: StandardizedDataSummary = {
    atom_type: 'dataframe-operations',
    summary_data: {
      operations_count: operationSummary.total_operations || dataframeConfig.operations?.length || 0,
      completed_operations: operationSummary.completed_operations || executionResults.length,
      operations: dataframeConfig.operations?.map((op: any, idx: number) => ({
        index: idx + 1,
        operation_name: op.operation_name || op.api_endpoint,
        description: op.description || '',
        parameters: op.parameters || {},
        success: executionResults[idx] ? true : false,
      })) || [],
      execution_results: executionResults,
      final_df_id: operationSummary.final_df_id || '',
    },
    metadata: {
      file_name: dataframeConfig.operations?.[0]?.parameters?.object_name || '',
      row_count: operationSummary.final_row_count || executionResults[executionResults.length - 1]?.rows?.length || 0,
      column_count: operationSummary.final_column_count || executionResults[executionResults.length - 1]?.headers?.length || 0,
    }
  };
  
  return summary;
};

/**
 * Extract data summary for explore atom
 */
export const getExploreDataSummary = (data: any): StandardizedDataSummary => {
  const explorationConfig = data.exploration_config || {};
  const chartDataSets = data.chartDataSets || {};
  const chartConfigs = data.chartConfigs || [];
  
  const summary: StandardizedDataSummary = {
    atom_type: 'explore',
    summary_data: {
      chart_count: chartConfigs.length,
      chart_configs: chartConfigs,
      chart_data_sets: chartDataSets,
      exploration_config: explorationConfig,
    },
    metadata: {
      file_name: data.dataframe || explorationConfig.file_name || '',
      chart_count: chartConfigs.length,
    }
  };
  
  return summary;
};

/**
 * Extract data summary for data-upload-validate atom
 */
export const getDataUploadValidateDataSummary = (data: any): StandardizedDataSummary => {
  const validateConfig = data.validate_json || {};
  const validationResults = data.validation_results || {};
  
  const summary: StandardizedDataSummary = {
    atom_type: 'data-upload-validate',
    summary_data: {
      validation_rules: validateConfig.validation_rules || [],
      validation_results: {
        is_valid: validationResults.is_valid || false,
        errors: validationResults.errors || [],
        warnings: validationResults.warnings || [],
        file_info: validationResults.file_info || {},
      },
    },
    metadata: {
      file_name: validateConfig.file_name || validationResults.file_info?.file_name || '',
      row_count: validationResults.file_info?.row_count || 0,
      column_count: validationResults.file_info?.column_count || 0,
    }
  };
  
  return summary;
};

/**
 * Main function to get data summary based on atom type
 */
export const getDataSummary = (atomType: string, data: any): StandardizedDataSummary => {
  switch (atomType) {
    case 'chart-maker':
      return getChartMakerDataSummary(data);
    case 'correlation':
      return getCorrelationDataSummary(data);
    case 'concat':
      return getConcatDataSummary(data);
    case 'create-transform':
    case 'create-column':
      return getCreateTransformDataSummary(data);
    case 'groupby-wtg-avg':
    case 'groupby':
      return getGroupbyDataSummary(data);
    case 'merge':
      return getMergeDataSummary(data);
    case 'dataframe-operations':
      return getDataframeOperationsDataSummary(data);
    case 'explore':
      return getExploreDataSummary(data);
    case 'data-upload-validate':
      return getDataUploadValidateDataSummary(data);
    default:
      // Default summary for unknown atom types
      return {
        atom_type: atomType,
        summary_data: {},
        metadata: {
          file_name: data.file_name || data.data_source || '',
        }
      };
  }
};

