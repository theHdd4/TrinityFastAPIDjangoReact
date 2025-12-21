import { AtomHandler } from './types';
import { concatHandler } from './concatHandler';
import { mergeHandler } from './mergeHandler';
import { dataframeOperationsHandler } from './dataframeOperationsHandler';
import { createColumnHandler } from './createColumnHandler';
import { groupbyHandler } from './groupbyHandler';
import { chartMakerHandler } from './chartMakerHandler';
import { exploreHandler } from './exploreHandler';
import { correlationHandler } from './correlationHandler';
import { dfValidateHandler } from './dfValidateHandler';
import { metricHandler } from './metricHandler';

// Registry of all atom handlers
export const atomHandlers: Record<string, AtomHandler> = {
  'concat': concatHandler,
  'merge': mergeHandler,
  'dataframe-operations': dataframeOperationsHandler,
  'create-column': createColumnHandler,
  'create-transform': createColumnHandler, // create-transform uses the same handler as create-column
  'groupby-wtg-avg': groupbyHandler,
  'chart-maker': chartMakerHandler,
  'explore': exploreHandler,
  'correlation': correlationHandler,
  'data-validate': dfValidateHandler,
  'metric': metricHandler,
  'metrics': metricHandler, // Support both singular and plural
};

// Helper function to check if an atom type has a specific handler
export const hasAtomHandler = (atomType: string): boolean => {
  return atomType in atomHandlers;
};

// Helper function to get handler for an atom type
export const getAtomHandler = (atomType: string): AtomHandler | null => {
  console.log('🔍 getAtomHandler called with atomType:', atomType);
  console.log('🔍 Available handlers:', Object.keys(atomHandlers));
  console.log('🔍 Looking up:', atomType, 'in atomHandlers');
  const handler = atomHandlers[atomType] || null;
  console.log('🔍 Handler found:', !!handler);
  if (handler) {
    console.log('🔍 Handler has handleSuccess:', typeof handler.handleSuccess === 'function');
    console.log('🔍 Handler has handleFailure:', typeof handler.handleFailure === 'function');
  }
  return handler;
};

// Helper function to check if response has data for specific atom type
export const hasAtomData = (atomType: string, data: any): boolean => {
  // If data has success=true and specific JSON structure, it's a success case
  if (data.success) {
    switch (atomType) {
      case 'concat':
        return !!(data.concat_json);
      case 'merge':
        return !!(data.merge_json);
      case 'create-column':
      case 'create-transform':
        return !!(data.json);
      case 'groupby-wtg-avg':
        return !!(data.groupby_json);
      case 'chart-maker':
        return !!(data.chart_json);
      case 'explore':
        return !!(data.exploration_config);
      case 'correlation':
        return !!(data.correlation_config);
      case 'dataframe-operations':
        return !!(data.dataframe_config);
      case 'data-validate':
        return !!(data.validate_json);
      case 'metric':
      case 'metrics':
        const hasMetricData = !!(data.operation_type || data.operation_config || data.metrics_json || 
                                 data.data?.operation_type || data.data?.operation_config || data.data?.metrics_json ||
                                 data.data?.data?.operation_type || data.data?.data?.operation_config);
        console.log('🔍 hasAtomData check for metric:', {
          'data.operation_type': !!data.operation_type,
          'data.operation_config': !!data.operation_config,
          'data.metrics_json': !!data.metrics_json,
          'data.data?.operation_type': !!data.data?.operation_type,
          'data.data?.operation_config': !!data.data?.operation_config,
          'data.data?.data?.operation_type': !!data.data?.data?.operation_type,
          result: hasMetricData
        });
        return hasMetricData;
      default:
        return false;
    }
  }
  
  // If no success flag, check for the presence of specific JSON structures
  switch (atomType) {
    case 'concat':
      return !!(data.concat_json);
    case 'merge':
      return !!(data.merge_json);
    case 'create-column':
    case 'create-transform':
      return !!(data.json);
    case 'groupby-wtg-avg':
      return !!(data.groupby_json);
    case 'chart-maker':
      return !!(data.chart_json);
    case 'explore':
      return !!(data.exploration_config);
    case 'correlation':
      return !!(data.correlation_config);
    case 'dataframe-operations':
      return !!(data.dataframe_config);
    case 'data-validate':
      return !!(data.validate_json);
    case 'metric':
    case 'metrics':
      return !!(data.operation_type || data.operation_config || data.metrics_json);
    default:
      return false;
  }
};

export * from './types';
export { 
  concatHandler, 
  mergeHandler, 
  dataframeOperationsHandler, 
  createColumnHandler, 
  groupbyHandler, 
  chartMakerHandler, 
  exploreHandler,
  correlationHandler,
  dfValidateHandler,
  metricHandler 
};
export { detectCommand, getAvailableCommands, type CommandResult, type CommandContext } from './commandHandler';
