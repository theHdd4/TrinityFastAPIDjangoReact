// File: MetricTabs/PreviewTab.tsx
import React from 'react';
import { Badge } from '@/components/ui/badge';
import { Sparkles, Table, ExternalLink, Database } from 'lucide-react';
import type { MetricFlowState, CreatedVariable, CreatedColumn } from '../MetricGuideFlowModal';

interface Props {
  flowState: MetricFlowState;
  onSave: () => void;
}

// Helper function to build human-readable variable descriptions
const buildVariableDescription = (variable: CreatedVariable): string => {
  if (variable.method === 'assign') {
    return `Assigned constant value: ${variable.value}`;
  }
  
  if (!variable.operationDetails) {
    return 'Computed from dataset operations';
  }
  
  const { operationMethod, column, groupBy, secondColumn } = variable.operationDetails;
  const methodName = operationMethod.charAt(0).toUpperCase() + operationMethod.slice(1);
  
  let desc = `Applied ${methodName.toLowerCase()}`;
  
  if (column) {
    desc += ` to ${column} column`;
  }
  
  if (secondColumn) {
    desc += ` with ${secondColumn}`;
  }
  
  if (groupBy && groupBy.length > 0) {
    desc += ` with group by on ${groupBy.join(', ')}`;
  }
  
  return desc;
};

// Helper function to build human-readable column operation descriptions
const buildColumnOperationDescription = (op: {
  type: string;
  columns: string[];
  method?: string;
  identifiers?: string[];
}): string => {
  let desc = '';
  
  // Map operation types to readable names
  const operationNames: Record<string, string> = {
    'compute_metrics_within_group': 'Group Metrics',
    'group_share_of_total': 'Group Share',
    'group_contribution': 'Group Contribution',
    'add': 'Add',
    'subtract': 'Subtract',
    'multiply': 'Multiply',
    'divide': 'Divide',
    'rolling_mean': 'Rolling Mean',
    'lag': 'Lag',
    'lead': 'Lead',
  };
  
  const opName = operationNames[op.type] || op.type;
  
  if (op.method && op.columns && op.columns.length > 0) {
    // For grouped operations with method
    desc = `${op.method} on ${op.columns.join(', ')}`;
    if (op.identifiers && op.identifiers.length > 0) {
      desc += ` grouped by ${op.identifiers.join(', ')}`;
    }
  } else if (op.columns && op.columns.length > 0) {
    // For operations with columns
    desc = `${opName} on ${op.columns.join(', ')}`;
    if (op.identifiers && op.identifiers.length > 0) {
      desc += ` grouped by ${op.identifiers.join(', ')}`;
    }
  } else {
    desc = opName;
  }
  
  return desc;
};

// Helper function to build column description
const buildColumnDescription = (column: CreatedColumn): string => {
  if (!column.operationDetails || column.operationDetails.length === 0) {
    return `Created using ${column.operations.join(', ')}`;
  }
  
  return column.operationDetails.map(op => buildColumnOperationDescription(op)).join('; ');
};

const PreviewTab: React.FC<Props> = ({ flowState, onSave }) => {
  const handleViewTable = (objectName: string) => {
    const url = `/dataframe?name=${encodeURIComponent(objectName)}`;
    window.open(url, '_blank');
  };

  const totalItems = 
    flowState.createdVariables.length +
    flowState.createdColumns.length +
    flowState.createdTables.length;

  // Get display name for table (extract from objectName or use tableName)
  const getTableDisplayName = (tableName: string, objectName?: string) => {
    if (objectName) {
      const parts = objectName.split('/');
      return parts[parts.length - 1] || tableName;
    }
    return tableName;
  };

  return (
    <div className="space-y-6 pb-4">
      {/* Header */}
      <div className="text-center space-y-1">
        <h3 className="text-lg font-semibold">Preview & Complete</h3>
        <p className="text-sm text-muted-foreground">
          Review all changes that have been created
        </p>
      </div>

      {totalItems === 0 ? (
        <div className="rounded-lg border border-dashed border-slate-200 bg-slate-50 p-6 text-center space-y-2">
          <h4 className="text-sm font-semibold text-slate-900">No changes to preview</h4>
          <p className="text-xs text-slate-600">
            Please go back and create variables, columns, or tables in the Operations step.
          </p>
        </div>
      ) : (
        <div className="space-y-6">
          {/* Summary Card */}
          <div className="rounded-xl border border-slate-200 bg-gradient-to-r from-blue-50 to-indigo-50 p-5">
            <div className="flex items-center gap-3">
              <div className="h-10 w-10 rounded-lg bg-[#458EE2] text-white flex items-center justify-center">
                <Database className="w-5 h-5" />
              </div>
              <div>
                <h4 className="text-base font-semibold text-slate-900">Summary</h4>
                <p className="text-sm text-slate-600">
                  {flowState.createdVariables.length > 0 && `${flowState.createdVariables.length} variable${flowState.createdVariables.length > 1 ? 's' : ''}`}
                  {flowState.createdVariables.length > 0 && (flowState.createdColumns.length > 0 || flowState.createdTables.length > 0) && ', '}
                  {flowState.createdColumns.length > 0 && `${flowState.createdColumns.length} column${flowState.createdColumns.length > 1 ? 's' : ''}`}
                  {flowState.createdColumns.length > 0 && flowState.createdTables.length > 0 && ', '}
                  {flowState.createdTables.length > 0 && `${flowState.createdTables.length} table${flowState.createdTables.length > 1 ? 's' : ''}`}
                  {' '}have been created
                </p>
              </div>
            </div>
          </div>

          {/* Created Variables */}
          {flowState.createdVariables.length > 0 && (
            <div className="rounded-xl border border-slate-200 bg-white p-5 space-y-4">
              <div className="flex items-center gap-2">
                <Sparkles className="w-5 h-5 text-[#458EE2]" />
                <h4 className="text-base font-semibold text-slate-900">
                  Created Variables ({flowState.createdVariables.length})
                </h4>
              </div>
              <div className="space-y-3">
                {flowState.createdVariables.map((variable, index) => (
                  <div
                    key={index}
                    className="flex items-start justify-between p-4 bg-slate-50 rounded-lg border border-slate-200 hover:border-slate-300 transition-colors"
                  >
                    <div className="flex-1 space-y-2">
                      <div className="flex items-center gap-2">
                        <span className="font-semibold text-slate-900">{variable.name}</span>
                        <Badge
                          variant="outline"
                          className={
                            variable.method === 'assign'
                              ? 'bg-blue-50 text-blue-700 border-blue-200'
                              : 'bg-green-50 text-green-700 border-green-200'
                          }
                        >
                          {variable.method === 'assign' ? 'Assign' : 'Compute'}
                        </Badge>
                      </div>
                      {variable.value && (
                        <p className="text-sm text-slate-600">
                          <span className="font-medium">Value:</span> {variable.value}
                        </p>
                      )}
                      {variable.description && (
                        <p className="text-xs text-slate-500 italic">{variable.description}</p>
                      )}
                      {!variable.value && variable.method === 'compute' && (
                        <p className="text-xs text-slate-600 font-medium">
                          {buildVariableDescription(variable)}
                        </p>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Created Columns */}
          {flowState.createdColumns.length > 0 && (
            <div className="rounded-xl border border-slate-200 bg-white p-5 space-y-4">
              <div className="flex items-center gap-2">
                <Table className="w-5 h-5 text-[#458EE2]" />
                <h4 className="text-base font-semibold text-slate-900">
                  Created Columns ({flowState.createdColumns.length})
                </h4>
              </div>
              <div className="space-y-3">
                {flowState.createdColumns.map((column, index) => (
                  <div
                    key={index}
                    className="flex items-start justify-between p-4 bg-slate-50 rounded-lg border border-slate-200 hover:border-slate-300 transition-colors"
                  >
                    <div className="flex-1 space-y-2">
                      <p className="text-sm font-medium text-slate-900">
                        New column <span className="font-semibold text-[#458EE2]">'{column.columnName}'</span> in table{' '}
                        <span className="font-semibold">'{getTableDisplayName(column.tableName, column.objectName)}'</span>
                      </p>
                      {column.operationDetails && column.operationDetails.length > 0 ? (
                        <div className="space-y-1">
                          <div className="flex flex-wrap gap-1">
                            <span className="text-xs text-slate-500 font-medium">Operations:</span>
                            {column.operationDetails.map((op, opIndex) => (
                              <Badge key={opIndex} variant="outline" className="text-xs bg-slate-100 text-slate-700 border-slate-300">
                                {buildColumnOperationDescription(op)}
                              </Badge>
                            ))}
                          </div>
                          <p className="text-xs text-slate-600">
                            {buildColumnDescription(column)}
                          </p>
                        </div>
                      ) : column.operations.length > 0 ? (
                        <div className="flex flex-wrap gap-1">
                          <span className="text-xs text-slate-500">Operations:</span>
                          {column.operations.map((op, opIndex) => (
                            <Badge key={opIndex} variant="outline" className="text-xs bg-slate-100 text-slate-700 border-slate-300">
                              {op}
                            </Badge>
                          ))}
                        </div>
                      ) : null}
                    </div>
                    {column.objectName && (
                      <button
                        onClick={() => handleViewTable(column.objectName)}
                        className="ml-4 flex items-center gap-1.5 px-3 py-1.5 text-sm text-[#458EE2] hover:text-[#3c7ac5] hover:bg-blue-50 rounded-md transition-colors border border-transparent hover:border-blue-200"
                        title={`View table: ${column.objectName}`}
                      >
                        <ExternalLink className="w-4 h-4" />
                        View Table
                      </button>
                    )}
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Created Tables */}
          {flowState.createdTables.length > 0 && (
            <div className="rounded-xl border border-slate-200 bg-white p-5 space-y-4">
              <div className="flex items-center gap-2">
                <Table className="w-5 h-5 text-[#458EE2]" />
                <h4 className="text-base font-semibold text-slate-900">
                  Created Tables ({flowState.createdTables.length})
                </h4>
              </div>
              <div className="space-y-3">
                {flowState.createdTables.map((table, index) => (
                  <div
                    key={index}
                    className="flex items-start justify-between p-4 bg-slate-50 rounded-lg border border-slate-200 hover:border-slate-300 transition-colors"
                  >
                    <div className="flex-1 space-y-2">
                      <p className="text-sm font-medium text-slate-900">
                        New table <span className="font-semibold text-[#458EE2]">'{getTableDisplayName(table.newTableName, table.objectName)}'</span> created from{' '}
                        <span className="font-semibold">'{getTableDisplayName(table.originalTableName)}'</span>
                      </p>
                      <p className="text-xs text-slate-500">
                        This is a new table derived from the original dataset
                      </p>
                    </div>
                    {table.objectName && (
                      <button
                        onClick={() => handleViewTable(table.objectName)}
                        className="ml-4 flex items-center gap-1.5 px-3 py-1.5 text-sm text-[#458EE2] hover:text-[#3c7ac5] hover:bg-blue-50 rounded-md transition-colors border border-transparent hover:border-blue-200"
                        title={`View table: ${table.objectName}`}
                      >
                        <ExternalLink className="w-4 h-4" />
                        View Table
                      </button>
                    )}
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
};

export default PreviewTab;


