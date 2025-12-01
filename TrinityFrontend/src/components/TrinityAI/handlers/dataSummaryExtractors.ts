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
    },
    metadata: {
      file_name: data.file_name || data.data_source || '',
    }
  };
  
  return summary;
};

/**
 * Extract data summary for merge atom
 */
export const getMergeDataSummary = (data: any): StandardizedDataSummary => {
  const mergeJson = data.merge_json || {};
  
  const summary: StandardizedDataSummary = {
    atom_type: 'merge',
    summary_data: {
      file1: Array.isArray(mergeJson.file1) ? mergeJson.file1[0] : mergeJson.file1,
      file2: Array.isArray(mergeJson.file2) ? mergeJson.file2[0] : mergeJson.file2,
      join_type: mergeJson.join_type || 'inner',
      merge_keys: Array.isArray(mergeJson.join_columns) ? mergeJson.join_columns : [],
    },
    metadata: {
      file_name: mergeJson.output_file_name || '',
    }
  };
  
  return summary;
};

/**
 * Extract data summary for concat atom
 */
export const getConcatDataSummary = (data: any): StandardizedDataSummary => {
  const concatJson = data.concat_json || {};
  
  const summary: StandardizedDataSummary = {
    atom_type: 'concat',
    summary_data: {
      files: Array.isArray(concatJson.files) ? concatJson.files : [],
      axis: concatJson.axis || 'vertical',
    },
    metadata: {
      file_name: concatJson.output_file_name || '',
    }
  };
  
  return summary;
};

/**
 * Extract data summary for groupby-wtg-avg atom
 */
export const getGroupbyDataSummary = (data: any): StandardizedDataSummary => {
  const groupbyJson = data.groupby_json || {};
  
  const summary: StandardizedDataSummary = {
    atom_type: 'groupby-wtg-avg',
    summary_data: {
      file_name: groupbyJson.file_name || groupbyJson.object_names || '',
      group_by: Array.isArray(groupbyJson.identifiers) ? groupbyJson.identifiers : [],
      aggregations: Array.isArray(groupbyJson.aggregations) ? groupbyJson.aggregations : [],
    },
    metadata: {
      file_name: groupbyJson.file_name || groupbyJson.object_names || '',
    }
  };
  
  return summary;
};

/**
 * Extract data summary for create-column atom
 */
export const getCreateColumnDataSummary = (data: any): StandardizedDataSummary => {
  const createColumnJson = data.json || {};
  
  const summary: StandardizedDataSummary = {
    atom_type: 'create-column',
    summary_data: {
      column_name: createColumnJson.column_name || '',
      formula: createColumnJson.formula || '',
      data_type: createColumnJson.data_type || '',
    },
    metadata: {
      file_name: createColumnJson.file_name || '',
    }
  };
  
  return summary;
};

/**
 * Extract data summary for dataframe-operations atom
 */
export const getDataframeOperationsDataSummary = (data: any): StandardizedDataSummary => {
  const dfConfig = data.dataframe_config || {};
  
  const summary: StandardizedDataSummary = {
    atom_type: 'dataframe-operations',
    summary_data: {
      operations_count: Array.isArray(dfConfig.operations) ? dfConfig.operations.length : 0,
      operations: Array.isArray(dfConfig.operations) ? dfConfig.operations : [],
      execution_mode: dfConfig.execution_mode || 'sequential',
    },
    metadata: {
      file_name: dfConfig.file_name || '',
    }
  };
  
  return summary;
};

/**
 * Extract data summary for explore atom
 */
export const getExploreDataSummary = (data: any): StandardizedDataSummary => {
  const explorationConfig = data.exploration_config || {};
  
  const summary: StandardizedDataSummary = {
    atom_type: 'explore',
    summary_data: {
      chart_count: Array.isArray(explorationConfig.charts) ? explorationConfig.charts.length : 0,
      charts: Array.isArray(explorationConfig.charts) ? explorationConfig.charts : [],
    },
    metadata: {
      file_name: explorationConfig.file_name || '',
    }
  };
  
  return summary;
};

/**
 * Extract data summary for correlation atom
 */
export const getCorrelationDataSummary = (data: any): StandardizedDataSummary => {
  const correlationConfig = data.correlation_config || {};
  
  // Extract file name from file_path if available
  const filePath = correlationConfig.file_path || data.file_name || '';
  const fileName = filePath.includes('/') 
    ? filePath.split('/').pop() || filePath 
    : filePath;
  
  // Extract column information
  const measureColumns = Array.isArray(correlationConfig.measure_columns) 
    ? correlationConfig.measure_columns 
    : [];
  const identifierColumns = Array.isArray(correlationConfig.identifier_columns)
    ? correlationConfig.identifier_columns
    : [];
  
  const summary: StandardizedDataSummary = {
    atom_type: 'correlation',
    summary_data: {
      method: correlationConfig.method || 'pearson',
      measure_columns: measureColumns,
      identifier_columns: identifierColumns,
      has_filters: !!(correlationConfig.identifier_filters?.length || correlationConfig.measure_filters?.length),
      include_date_analysis: correlationConfig.include_date_analysis || false,
    },
    metadata: {
      file_name: fileName || correlationConfig.file_name || data.file_name || '',
      file_path: filePath,
    }
  };
  
  return summary;
};

/**
 * Extract data summary for data-upload-validate atom
 */
export const getDfValidateDataSummary = (data: any): StandardizedDataSummary => {
  const validateJson = data.validate_json || {};
  
  const summary: StandardizedDataSummary = {
    atom_type: 'data-upload-validate',
    summary_data: {
      validation_status: validateJson.status || 'unknown',
      dtype_changes: validateJson.dtype_changes || {},
    },
    metadata: {
      file_name: validateJson.file_name || '',
      row_count: validateJson.rows_affected || validateJson.rows,
      column_count: validateJson.columns_affected || validateJson.columns,
    }
  };
  
  return summary;
};

/**
 * Get the appropriate data summary extractor based on atom type
 */
export const getDataSummary = (atomType: string, data: any): StandardizedDataSummary => {
  switch (atomType) {
    case 'chart-maker':
      return getChartMakerDataSummary(data);
    case 'merge':
      return getMergeDataSummary(data);
    case 'concat':
      return getConcatDataSummary(data);
    case 'groupby-wtg-avg':
      return getGroupbyDataSummary(data);
    case 'create-column':
      return getCreateColumnDataSummary(data);
    case 'dataframe-operations':
      return getDataframeOperationsDataSummary(data);
    case 'explore':
      return getExploreDataSummary(data);
    case 'correlation':
      return getCorrelationDataSummary(data);
    case 'data-upload-validate':
      return getDfValidateDataSummary(data);
    default:
      // Return a generic summary for unknown atom types
      return {
        atom_type: atomType,
        summary_data: {},
        metadata: {
          file_name: data.file_name || data.data_source || '',
        }
      };
  }
};

