import React, { useEffect, useState, useMemo } from 'react';
import { Badge } from '@/components/ui/badge';
import { Sparkles, Table, ExternalLink, Database } from 'lucide-react';
import { StageLayout } from '../components/StageLayout';
import type { ReturnTypeFromUseMetricGuidedFlow } from '../useMetricGuidedFlow';
import type { CreatedVariable, CreatedColumn, CreatedTable } from '../useMetricGuidedFlow';
import { getActiveProjectContext } from '@/utils/projectEnv';

interface M3PreviewProps {
  flow: ReturnTypeFromUseMetricGuidedFlow;
  onSave: () => void;
  onClose?: () => void;
  readOnly?: boolean;
}

const LABORATORY_API = import.meta.env.VITE_LABORATORY_API || '/api/laboratory';

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
    desc = `${op.method} on ${op.columns.join(', ')}`;
    if (op.identifiers && op.identifiers.length > 0) {
      desc += ` grouped by ${op.identifiers.join(', ')}`;
    }
  } else if (op.columns && op.columns.length > 0) {
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

export const M3Preview: React.FC<M3PreviewProps> = ({ flow, onSave, onClose, readOnly = false }) => {
  const { state } = flow;
  const [variableValues, setVariableValues] = useState<Record<string, string>>({});
  const [loadingValues, setLoadingValues] = useState(false);

  // Fetch variable values for computed variables (only if values are not already in state)
  // This is a fallback for cases where variables were created outside the preview flow
  useEffect(() => {
    const fetchVariableValues = async () => {
      // Only fetch if we have computed variables without values in state
      const computedVars = state.createdVariables.filter(v => v.method === 'compute' && !v.value);
      if (computedVars.length === 0) return;

      setLoadingValues(true);
      try {
        const projectContext = getActiveProjectContext();
        if (!projectContext) {
          console.warn('[M3Preview] No project context found, skipping variable value fetch');
          return;
        }

        const params = new URLSearchParams({
          clientId: projectContext.client_name,
          appId: projectContext.app_name,
          projectId: projectContext.project_name,
        });

        const response = await fetch(`${LABORATORY_API}/variables?${params.toString()}`, {
          credentials: 'include',
        });

        if (response.ok) {
          const result = await response.json();
          if (result.variables && Array.isArray(result.variables)) {
            const valuesMap: Record<string, string> = {};
            result.variables.forEach((v: any) => {
              if (v.variableName && v.value !== undefined && v.value !== null) {
                valuesMap[v.variableName] = String(v.value);
              }
            });
            setVariableValues(valuesMap);
          }
        }
      } catch (error) {
        console.error('[M3Preview] Error fetching variable values:', error);
      } finally {
        setLoadingValues(false);
      }
    };

    fetchVariableValues();
  }, [state.createdVariables]);
  
  const handleViewTable = (objectName: string) => {
    const url = `/dataframe?name=${encodeURIComponent(objectName)}`;
    window.open(url, '_blank');
  };

  const getVariableValue = (variable: CreatedVariable): string | null => {
    // For both assign and compute, use value from state first (set during preview computation)
    if (variable.value) {
      return variable.value;
    }
    // Fallback: for compute variables, try fetching from backend (for legacy cases)
    if (variable.method === 'compute') {
      return variableValues[variable.name] || null;
    }
    return null;
  };

  // Group columns by tableName
  const columnsByTable = useMemo(() => {
    const grouped: Record<string, CreatedColumn[]> = {};
    state.createdColumns.forEach(col => {
      if (!grouped[col.tableName]) {
        grouped[col.tableName] = [];
      }
      grouped[col.tableName].push(col);
    });
    return grouped;
  }, [state.createdColumns]);

  // Map table names to CreatedTable objects to get original table name
  const tableMap = useMemo(() => {
    const map: Record<string, CreatedTable> = {};
    state.createdTables.forEach(table => {
      map[table.newTableName] = table;
    });
    return map;
  }, [state.createdTables]);

  // Determine if a table is new (created via Save As) or existing (modified via Save)
  const isNewTable = (tableName: string): boolean => {
    // If it exists in createdTables, it's definitely a new table
    if (tableMap[tableName]) {
      return true;
    }
    // If tableName doesn't match the original dataSource, it's a new table
    // Otherwise, it's an existing table (modified via Save)
    return tableName !== state.dataSource;
  };

  const hasCreatedItems = 
    state.createdVariables.length > 0 ||
    state.createdColumns.length > 0 ||
    state.createdTables.length > 0;

  // Group variables by method for dynamic header
  const variablesByMethod = useMemo(() => {
    const grouped = {
      compute: state.createdVariables.filter(v => v.method === 'compute'),
      assign: state.createdVariables.filter(v => v.method === 'assign'),
      other: state.createdVariables.filter(v => v.method !== 'compute' && v.method !== 'assign')
    };
    return grouped;
  }, [state.createdVariables]);

  return (
    <StageLayout
      title=""
      explanation=""
    >
      <div className="space-y-6 w-full min-w-0">
        {/* Dynamic Success Message for Variables */}
        {state.createdVariables.length > 0 && (
          <div className="text-lg font-semibold text-gray-900">
            {(() => {
              const computeCount = variablesByMethod.compute.length;
              const assignCount = variablesByMethod.assign.length;
              const otherCount = variablesByMethod.other.length;
              
              if (computeCount > 0 && assignCount === 0 && otherCount === 0) {
                return `Successfully computed ${computeCount} variable${computeCount !== 1 ? 's' : ''}`;
              } else if (assignCount > 0 && computeCount === 0 && otherCount === 0) {
                return `Successfully assigned ${assignCount} variable${assignCount !== 1 ? 's' : ''}`;
              } else if (computeCount > 0 || assignCount > 0 || otherCount > 0) {
                const total = state.createdVariables.length;
                return `Successfully created ${total} variable${total !== 1 ? 's' : ''}`;
              }
              return null;
            })()}
          </div>
        )}
          {!hasCreatedItems ? (
            <div className="text-center py-8 text-gray-500">
              <p>No metrics created yet. Go back to Operations to create variables or columns.</p>
            </div>
          ) : (
            <>
              {/* Variables Section */}
              {state.createdVariables.length > 0 && (
                <div className="space-y-2">
                  {state.createdVariables.map((variable, idx) => {
                    const value = getVariableValue(variable);
                    return (
                      <div
                        key={idx}
                        className="p-4 border rounded-lg bg-blue-50/50 border-blue-200"
                      >
                        <div className="flex-1">
                          {/* Variable name = value on top */}
                          <div className="font-medium text-gray-900">
                            {variable.name}
                            {value !== null && (
                              <span className="text-gray-600 font-normal"> = {value}</span>
                            )}
                            {loadingValues && variable.method === 'compute' && value === null && (
                              <span className="text-gray-400 font-normal text-sm ml-2">(Loading value...)</span>
                            )}
                          </div>
                          {/* Computation description below */}
                          <div className="text-sm text-gray-600 mt-1">
                            {buildVariableDescription(variable)}
                          </div>
                          {variable.description && (
                            <div className="text-xs text-gray-500 mt-1">
                              {variable.description}
                            </div>
                          )}
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}

              {/* Columns Section - Grouped by Table */}
              {state.createdColumns.length > 0 && (
                <div className="space-y-3">
                  <div className="flex items-center gap-2">
                    <Table className="w-5 h-5 text-green-600" />
                    <h4 className="text-lg font-semibold">Columns</h4>
                    <Badge variant="secondary">{state.createdColumns.length}</Badge>
                  </div>
                  <div className="space-y-3">
                    {Object.entries(columnsByTable).map(([tableName, columns]) => {
                      const isNew = isNewTable(tableName);
                      const tableInfo = tableMap[tableName];
                      const columnArray: CreatedColumn[] = columns;
                      const columnCount = columnArray.length;
                      const firstColumn = columnArray[0];
                      
                      // Determine the message
                      let headerMessage = '';
                      if (isNew && tableInfo) {
                        headerMessage = `Created ${columnCount} column${columnCount !== 1 ? 's' : ''} and saved into a new table: ${tableName} from ${tableInfo.originalTableName}`;
                      } else {
                        headerMessage = `Created ${columnCount} column${columnCount !== 1 ? 's' : ''} in this table: ${tableName}`;
                      }
                      
                      return (
                        <div
                          key={tableName}
                          className="p-4 border rounded-lg bg-green-50/50 border-green-200"
                        >
                          <div className="flex items-start justify-between mb-3">
                            <div className="flex-1">
                              <div className="text-sm font-semibold text-gray-900 mb-2">
                                {headerMessage}
                              </div>
                              <div className="space-y-2 mt-3">
                                {columnArray.map((column, colIdx) => (
                                  <div
                                    key={colIdx}
                                    className="pl-3 border-l-2 border-green-300 py-2"
                                  >
                                    <div className="font-medium text-gray-900 text-sm">
                                      {column.columnName}
                                    </div>
                                    <div className="text-xs text-gray-600 mt-1">
                                      {buildColumnDescription(column)}
                                    </div>
                                  </div>
                                ))}
                              </div>
                            </div>
                            <div className="flex items-center gap-2 ml-4">
                              <Badge className="bg-green-100 text-green-700">
                                {columnCount} {columnCount === 1 ? 'Column' : 'Columns'}
                              </Badge>
                              <button
                                onClick={() => handleViewTable(firstColumn.objectName)}
                                className="text-blue-600 hover:text-blue-800 text-sm flex items-center gap-1"
                              >
                                <ExternalLink className="w-3 h-3" />
                                View
                              </button>
                            </div>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>
              )}

              {/* Tables Section */}
              {state.createdTables.length > 0 && (
                <div className="space-y-3">
                  <div className="flex items-center gap-2">
                    <Database className="w-5 h-5 text-purple-600" />
                    <h4 className="text-lg font-semibold">Tables</h4>
                    <Badge variant="secondary">{state.createdTables.length}</Badge>
                  </div>
                  <div className="space-y-2">
                    {state.createdTables.map((table, idx) => {
                      // Find columns that belong to this table
                      const createdColumnsForTable: CreatedColumn[] = columnsByTable[table.newTableName] || [];
                      const columnCount = createdColumnsForTable.length;
                      
                      return (
                        <div key={idx} className="p-4 border rounded-lg bg-purple-50/50 border-purple-200">
                          <div className="flex items-start justify-between">
                            <div className="flex-1">
                              <div className="font-medium text-gray-900">{table.newTableName}</div>
                              <div className="text-xs text-gray-500 mt-1">
                                From: {table.originalTableName}
                              </div>
                              {columnCount > 0 && (
                                <div className="text-xs text-gray-600 mt-1">
                                  Contains {columnCount} column{columnCount !== 1 ? 's' : ''}
                                </div>
                              )}
                            </div>
                            <div className="flex items-center gap-2">
                              <Badge className="bg-purple-100 text-purple-700">Table</Badge>
                              <button
                                onClick={() => handleViewTable(table.objectName)}
                                className="text-blue-600 hover:text-blue-800 text-sm flex items-center gap-1"
                              >
                                <ExternalLink className="w-3 h-3" />
                                View
                              </button>
                            </div>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>
              )}
            </>
          )}
        </div>
      </StageLayout>
  );
};
