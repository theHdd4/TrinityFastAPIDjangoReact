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
  'data-upload-validate': dfValidateHandler,
};

// Helper function to check if an atom type has a specific handler
export const hasAtomHandler = (atomType: string): boolean => {
  return atomType in atomHandlers;
};

// Helper function to get handler for an atom type
export const getAtomHandler = (atomType: string): AtomHandler | null => {
  return atomHandlers[atomType] || null;
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
      case 'data-upload-validate':
        return !!(data.validate_json);
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
    case 'data-upload-validate':
      return !!(data.validate_json);
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
  dfValidateHandler 
};
