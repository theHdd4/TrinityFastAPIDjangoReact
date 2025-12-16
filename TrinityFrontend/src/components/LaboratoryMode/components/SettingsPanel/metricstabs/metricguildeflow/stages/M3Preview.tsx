import React, { useEffect, useState } from 'react';
import { Badge } from '@/components/ui/badge';
import { Sparkles, Table, ExternalLink, Database } from 'lucide-react';
import { StageLayout } from '../components/StageLayout';
import type { ReturnTypeFromUseMetricGuidedFlow } from '../useMetricGuidedFlow';
import type { CreatedVariable, CreatedColumn } from '../useMetricGuidedFlow';
import { getActiveProjectContext } from '@/utils/projectEnv';

interface M3PreviewProps {
  flow: ReturnTypeFromUseMetricGuidedFlow;
  onSave: () => void;
  onClose?: () => void;
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

export const M3Preview: React.FC<M3PreviewProps> = ({ flow, onSave, onClose }) => {
  const { state } = flow;
  const [variableValues, setVariableValues] = useState<Record<string, string>>({});
  const [loadingValues, setLoadingValues] = useState(false);

  // Fetch variable values for computed variables
  useEffect(() => {
    const fetchVariableValues = async () => {
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
    if (variable.method === 'assign' && variable.value) {
      return variable.value;
    }
    if (variable.method === 'compute') {
      return variableValues[variable.name] || null;
    }
    return null;
  };

  const hasCreatedItems = 
    state.createdVariables.length > 0 ||
    state.createdColumns.length > 0 ||
    state.createdTables.length > 0;

  return (
    <StageLayout
      title="Preview & Save"
      explanation="Review your created metrics before finalizing"
    >
      <div className="space-y-6">
        {/* Success Message */}
        <div className="text-sm text-gray-600">
          {hasCreatedItems && (
            <span>
              Successfully created {state.createdVariables.length + state.createdColumns.length + state.createdTables.length} metric(s)
            </span>
          )}
        </div>
          {!hasCreatedItems ? (
            <div className="text-center py-8 text-gray-500">
              <p>No metrics created yet. Go back to Operations to create variables or columns.</p>
            </div>
          ) : (
            <>
              {/* Variables Section */}
              {state.createdVariables.length > 0 && (
                <div className="space-y-3">
                  <div className="flex items-center gap-2">
                    <Sparkles className="w-5 h-5 text-blue-600" />
                    <h4 className="text-lg font-semibold">Variables</h4>
                    <Badge variant="secondary">{state.createdVariables.length}</Badge>
                  </div>
                  <div className="space-y-2">
                    {state.createdVariables.map((variable, idx) => (
                      <div
                        key={idx}
                        className="p-4 border rounded-lg bg-blue-50/50 border-blue-200"
                      >
                        <div className="flex items-start justify-between">
                          <div className="flex-1">
                            <div className="font-medium text-gray-900">{variable.name}</div>
                            <div className="text-sm text-gray-600 mt-1">
                              {buildVariableDescription(variable)}
                            </div>
                            {(() => {
                              const value = getVariableValue(variable);
                              return value !== null ? (
                                <div className="text-sm font-semibold text-blue-700 mt-2">
                                  Value: {value}
                                </div>
                              ) : loadingValues && variable.method === 'compute' ? (
                                <div className="text-xs text-gray-400 mt-2">Loading value...</div>
                              ) : null;
                            })()}
                            {variable.description && (
                              <div className="text-xs text-gray-500 mt-1">
                                {variable.description}
                              </div>
                            )}
                          </div>
                          <Badge className="bg-blue-100 text-blue-700">
                            {variable.method === 'assign' ? 'Assigned' : 'Computed'}
                          </Badge>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* Columns Section */}
              {state.createdColumns.length > 0 && (
                <div className="space-y-3">
                  <div className="flex items-center gap-2">
                    <Table className="w-5 h-5 text-green-600" />
                    <h4 className="text-lg font-semibold">Columns</h4>
                    <Badge variant="secondary">{state.createdColumns.length}</Badge>
                  </div>
                  <div className="space-y-2">
                    {state.createdColumns.map((column, idx) => (
                      <div
                        key={idx}
                        className="p-4 border rounded-lg bg-green-50/50 border-green-200"
                      >
                        <div className="flex items-start justify-between">
                          <div className="flex-1">
                            <div className="font-medium text-gray-900">{column.columnName}</div>
                            <div className="text-sm text-gray-600 mt-1">
                              {buildColumnDescription(column)}
                            </div>
                            <div className="text-xs text-gray-500 mt-1">
                              Table: {column.tableName}
                            </div>
                          </div>
                          <div className="flex items-center gap-2">
                            <Badge className="bg-green-100 text-green-700">Column</Badge>
                            <button
                              onClick={() => handleViewTable(column.objectName)}
                              className="text-blue-600 hover:text-blue-800 text-sm flex items-center gap-1"
                            >
                              <ExternalLink className="w-3 h-3" />
                              View
                            </button>
                          </div>
                        </div>
                      </div>
                    ))}
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
                    {state.createdTables.map((table, idx) => (
                      <div
                        key={idx}
                        className="p-4 border rounded-lg bg-purple-50/50 border-purple-200"
                      >
                        <div className="flex items-start justify-between">
                          <div className="flex-1">
                            <div className="font-medium text-gray-900">{table.newTableName}</div>
                            <div className="text-xs text-gray-500 mt-1">
                              From: {table.originalTableName}
                            </div>
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
                    ))}
                  </div>
                </div>
              )}
            </>
          )}
        </div>
      </StageLayout>
  );
};
