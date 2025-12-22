import React, { useEffect, useState, useMemo, useRef } from 'react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Sparkles, ExternalLink, Database, Table as TableIcon } from 'lucide-react';
import { StageLayout } from '../components/StageLayout';
import type { ReturnTypeFromUseMetricGuidedFlow } from '../useMetricGuidedFlow';
import type { CreatedVariable, CreatedColumn, CreatedTable } from '../useMetricGuidedFlow';
import { getActiveProjectContext } from '@/utils/projectEnv';
import { useToast } from '@/hooks/use-toast';
import { CREATECOLUMN_API } from '@/lib/api';
import { resolveTaskResponse } from '@/lib/taskQueue';
import Table from '@/templates/tables/table';

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

// Helper to convert preview data to CSV
const previewToCSV = (data: any[]): string => {
  if (!data.length) return '';
  const headers = Object.keys(data[0]);
  const rows = data.map(row => headers.map(h => JSON.stringify(row[h] ?? '')).join(','));
  return [headers.join(','), ...rows].join('\n');
};

export const M3Preview: React.FC<M3PreviewProps> = ({ flow, onSave, onClose, readOnly = false }) => {
  const { state, setState } = flow;
  const { toast } = useToast();
  const [variableValues, setVariableValues] = useState<Record<string, string>>({});
  const [loadingValues, setLoadingValues] = useState(false);
  const [saveLoading, setSaveLoading] = useState(false);
  const [showSaveAsModal, setShowSaveAsModal] = useState(false);
  const [saveAsFileName, setSaveAsFileName] = useState('');

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
    state.createdTables.length > 0 ||
    !!state.previewColumnData;

  // Dataframe-level operations that don't create new columns but transform the dataframe
  const dataframeOps = [
    'select_columns',
    'drop_columns',
    'rename',
    'reorder',
    'deduplicate',
    'sort_rows',
    'filter_rows_condition',
    'filter_top_n_per_group',
    'filter_percentile',
  ];

  // Mapping from operation_type to human-readable names
  const operationNames: Record<string, string> = {
    'filter_rows_condition': 'Filter Rows Based Condition',
    'filter_top_n_per_group': 'Filter Rows Top N Per Group',
    'filter_percentile': 'Filter Percentile',
    'select_columns': 'Select Only Special Columns',
    'drop_columns': 'Drop Columns',
    'rename': 'Rename',
    'reorder': 'Reorder',
    'deduplicate': 'Deduplicate',
    'sort_rows': 'Sort Rows',
  };

  // Helper function to build human-readable description for dataframe transformations
  const buildTransformationDescription = (op: {
    operation_type: string;
    columns: string[];
    rename?: string | Record<string, any> | null;
    param?: string | number | Record<string, any> | null;
  }): string => {
    const operationName = operationNames[op.operation_type] || op.operation_type;
    const columns = op.columns?.filter(Boolean) || [];
    
    switch (op.operation_type) {
      case 'drop_columns':
        return columns.length > 0 ? `Dropped: ${columns.join(', ')}` : 'Drop Columns';
      case 'rename':
        // Handle rename - show old -> new mapping if available
        if (op.rename && typeof op.rename === 'object') {
          const renamePairs = Object.entries(op.rename).map(([oldName, newName]) => `${oldName} → ${newName}`);
          return renamePairs.length > 0 ? renamePairs.join(', ') : operationName;
        }
        return columns.length > 0 ? `Renamed: ${columns.join(', ')}` : operationName;
      case 'reorder':
        return columns.length > 0 ? `Order: ${columns.join(', ')}` : operationName;
      case 'deduplicate':
        return columns.length > 0 ? `Based on: ${columns.join(', ')}` : operationName;
      case 'sort_rows':
        return columns.length > 0 ? `By: ${columns.join(', ')}` : operationName;
      case 'select_columns':
        return columns.length > 0 ? `Selected: ${columns.join(', ')}` : operationName;
      case 'filter_rows_condition':
        return columns.length > 0 ? `On: ${columns.join(', ')}` : operationName;
      case 'filter_top_n_per_group':
        // Show N and metric if param is available
        if (op.param && typeof op.param === 'object') {
          const param = op.param as any;
          const n = param.n || 'N';
          const metricCol = param.metric_col || '';
          return metricCol ? `Top ${n} per group by ${metricCol}` : `Top ${n} per group`;
        }
        return operationName;
      case 'filter_percentile':
        // Show percentile and metric if param is available
        if (op.param && typeof op.param === 'object') {
          const param = op.param as any;
          const percentile = param.percentile || 'N';
          const metricCol = param.metric_col || '';
          const direction = param.direction || 'top';
          return metricCol ? `${percentile}th percentile (${direction}) by ${metricCol}` : `${percentile}th percentile`;
        }
        return operationName;
      default:
        return operationName;
    }
  };

  // Get set of newly created column names for highlighting in preview table
  const newlyCreatedColumns = useMemo(() => {
    if (!state.previewColumnData?.operationDetails?.operations) {
      return new Set<string>();
    }
    const columnSet = new Set<string>();
    state.previewColumnData.operationDetails.operations.forEach((op) => {
      // Only include columns from operations that actually create new columns
      if (!dataframeOps.includes(op.operation_type) && op.created_column_name) {
        columnSet.add(op.created_column_name);
      }
    });
    return columnSet;
  }, [state.previewColumnData?.operationDetails?.operations]);

  // Categorize operations into column-creating vs dataframe transformations
  const { columnCreatingOps, dataframeTransformOps } = useMemo(() => {
    if (!state.previewColumnData?.operationDetails?.operations) {
      return { columnCreatingOps: [], dataframeTransformOps: [] };
    }

    const columnOps: typeof state.previewColumnData.operationDetails.operations = [];
    const dataframeOpsList: typeof state.previewColumnData.operationDetails.operations = [];

    state.previewColumnData.operationDetails.operations.forEach((op) => {
      if (dataframeOps.includes(op.operation_type)) {
        dataframeOpsList.push(op);
      } else {
        // Only include operations that actually create columns
        if (op.created_column_name) {
          columnOps.push(op);
        }
      }
    });

    return {
      columnCreatingOps: columnOps,
      dataframeTransformOps: dataframeOpsList,
    };
  }, [state.previewColumnData?.operationDetails?.operations]);

  // Ref for table container to control scrolling
  const tableContainerRef = useRef<HTMLDivElement>(null);

  // Auto-scroll table to rightmost position when new columns are created
  useEffect(() => {
    if (tableContainerRef.current && newlyCreatedColumns.size > 0 && state.previewColumnData?.previewResults?.length) {
      // Find the scrollable container within the table wrapper
      const scrollableContainer = tableContainerRef.current.querySelector('.table-overflow') as HTMLElement;
      if (scrollableContainer) {
        // Scroll to the rightmost position after a short delay to ensure table is rendered
        const timeoutId = setTimeout(() => {
          scrollableContainer.scrollLeft = scrollableContainer.scrollWidth;
        }, 150);
        return () => clearTimeout(timeoutId);
      }
    }
  }, [newlyCreatedColumns.size, state.previewColumnData?.previewResults?.length]);

  // Group variables by method for dynamic header
  const variablesByMethod = useMemo(() => {
    const grouped = {
      compute: state.createdVariables.filter(v => v.method === 'compute'),
      assign: state.createdVariables.filter(v => v.method === 'assign'),
      other: state.createdVariables.filter(v => v.method !== 'compute' && v.method !== 'assign')
    };
    return grouped;
  }, [state.createdVariables]);

  // Save column operations (overwrite original)
  const handleSaveColumnOperations = async () => {
    if (!state.previewColumnData) return;
    
    setSaveLoading(true);
    try {
      const csv_data = previewToCSV(state.previewColumnData.previewResults);
      let filename = state.previewColumnData.operationDetails.input_file;
      if (filename.endsWith('.arrow')) {
        filename = filename.replace('.arrow', '');
      }
      
      const projectContext = getActiveProjectContext();
      if (!projectContext) {
        throw new Error('Project context not available');
      }
      
      const envStr = localStorage.getItem('env');
      const env = envStr ? JSON.parse(envStr) : {};
      const stored = localStorage.getItem('current-project');
      const project = stored ? JSON.parse(stored) : {};
      
      const response = await fetch(`${CREATECOLUMN_API}/save`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          csv_data,
          filename,
          client_name: projectContext.client_name,
          app_name: projectContext.app_name,
          project_name: projectContext.project_name,
          user_id: env.USER_ID || '',
          project_id: project.id || null,
          operation_details: JSON.stringify(state.previewColumnData.operationDetails),
          overwrite_original: true
        }),
      });
      
      if (!response.ok) {
        throw new Error(`Save failed: ${response.statusText}`);
      }
      
      const payload = await response.json();
      const result = await resolveTaskResponse<Record<string, any>>(payload);
      const savedFile = typeof result?.result_file === 'string'
        ? result.result_file
        : filename.endsWith('.arrow')
          ? filename
          : `${filename}.arrow`;
      
      // Call onColumnCreated callback for each created column
      if (state.previewColumnData.operationDetails.operations.length > 0) {
        state.previewColumnData.operationDetails.operations.forEach((op) => {
          // We don't have onColumnCreated callback here, so we'll handle it in the parent
          // For now, just show success
        });
      }
      
      // Clear preview data
      setState(prev => ({
        ...prev,
        previewColumnData: null,
      }));
      
      toast({
        title: 'Success',
        description: 'Column operations saved successfully.',
      });
    } catch (error: any) {
      toast({
        title: 'Error',
        description: error.message || 'Failed to save column operations.',
        variant: 'destructive',
      });
    } finally {
      setSaveLoading(false);
    }
  };

  // Save As column operations (new file)
  const handleSaveAsColumnOperations = async () => {
    if (!state.previewColumnData || !saveAsFileName.trim()) return;
    
    setSaveLoading(true);
    try {
      const csv_data = previewToCSV(state.previewColumnData.previewResults);
      const filename = saveAsFileName.trim();
      
      const projectContext = getActiveProjectContext();
      if (!projectContext) {
        throw new Error('Project context not available');
      }
      
      const envStr = localStorage.getItem('env');
      const env = envStr ? JSON.parse(envStr) : {};
      const stored = localStorage.getItem('current-project');
      const project = stored ? JSON.parse(stored) : {};
      
      const response = await fetch(`${CREATECOLUMN_API}/save`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          csv_data,
          filename,
          client_name: projectContext.client_name,
          app_name: projectContext.app_name,
          project_name: projectContext.project_name,
          user_id: env.USER_ID || '',
          project_id: project.id || null,
          operation_details: JSON.stringify(state.previewColumnData.operationDetails),
          overwrite_original: false
        }),
      });
      
      if (!response.ok) {
        throw new Error(`Save failed: ${response.statusText}`);
      }
      
      const payload = await response.json();
      const result = await resolveTaskResponse<Record<string, any>>(payload);
      const savedFile = typeof result?.result_file === 'string'
        ? result.result_file
        : filename.endsWith('.arrow')
          ? filename
          : `${filename}.arrow`;
      
      // Call onTableCreated callback - we'll need to handle this in parent
      // For now, just show success
      
      // Clear preview data and close modal
      setState(prev => ({
        ...prev,
        previewColumnData: null,
      }));
      setShowSaveAsModal(false);
      setSaveAsFileName('');
      
      toast({
        title: 'Success',
        description: 'Column operations saved to new file successfully.',
      });
    } catch (error: any) {
      toast({
        title: 'Error',
        description: error.message || 'Failed to save column operations.',
        variant: 'destructive',
      });
    } finally {
      setSaveLoading(false);
    }
  };

  return (
    <StageLayout
      title=""
      explanation=""
    >
      <div className="space-y-6 w-full min-w-0">
        {/* Column Operations Preview Section */}
        {state.previewColumnData && (
          <div className="space-y-4">
            {/* New/Transformed Columns Section - Only for column-creating operations */}
            {columnCreatingOps.length > 0 && (
              <Card className="p-4">
                <div className="space-y-3">
                  <div className="text-sm text-gray-600 mb-2">New/Transformed Columns:</div>
                  <div className="flex flex-wrap gap-2">
                    {columnCreatingOps.map((op, idx) => (
                      <Badge key={idx} variant="secondary">
                        {op.created_column_name || `${op.operation_type}_${idx}`}
                      </Badge>
                    ))}
                  </div>
                </div>
              </Card>
            )}

            {/* Dataframe Transformations Section - For dataframe-level operations */}
            {dataframeTransformOps.length > 0 && (
              <Card className="p-4">
                <div className="space-y-3">
                  <div className="text-sm text-gray-600 mb-2">Dataframe Transformations:</div>
                  <div className="space-y-2">
                    {dataframeTransformOps.map((op, idx) => (
                      <div key={idx} className="flex items-center gap-2 text-sm">
                        <Badge variant="outline">{operationNames[op.operation_type] || op.operation_type}</Badge>
                        <span className="text-gray-700">{buildTransformationDescription(op)}</span>
                      </div>
                    ))}
                  </div>
                </div>
              </Card>
            )}

            {/* Preview Table */}
            {state.previewColumnData.previewResults.length > 0 && (() => {
              const headers = Object.keys(state.previewColumnData.previewResults[0]);
              
              // Find indices of newly created columns for CSS targeting
              const newColumnIndices = headers
                .map((header, index) => newlyCreatedColumns.has(header) ? index + 1 : null)
                .filter((idx): idx is number => idx !== null);
              
              // Generate CSS selector for newly created column headers
              const newColumnSelector = newColumnIndices.length > 0
                ? newColumnIndices.map(idx => `.preview-table-scrollable thead th:nth-child(${idx})`).join(', ')
                : '';
              
              return (
                <div className="preview-table-wrapper" ref={tableContainerRef}>
                  {/* Add CSS for header background color */}
                  {newColumnSelector && (
                    <style>{`
                      ${newColumnSelector} {
                        background-color: rgb(240 253 244) !important;
                      }
                    `}</style>
                  )}
                  <Table
                    headers={headers}
                    colClasses={headers.map(() => 'w-auto')}
                    bodyClassName="max-h-[350px] overflow-y-auto preview-table-scrollable"
                    defaultMinimized={false}
                    borderColor="border-green-500"
                    customHeader={{
                      title: (
                        <span className="text-sm font-semibold">Data Preview</span>
                      ),
                      subtitle: undefined,
                      subtitleClickable: false,
                      compactHeader: true,
                    }}
                  >
                    {state.previewColumnData.previewResults.slice(0, 10).map((row, rowIdx) => (
                      <tr key={rowIdx} className="table-row">
                        {headers.map((col) => {
                          const isNewColumn = newlyCreatedColumns.has(col);
                          return (
                            <td 
                              key={col} 
                              className={`table-cell ${isNewColumn ? 'bg-green-50' : ''}`}
                            >
                              {row[col] !== null && row[col] !== undefined ? (
                                typeof row[col] === 'number' ? row[col] : String(row[col])
                              ) : (
                                <span className="italic text-slate-400">null</span>
                              )}
                            </td>
                          );
                        })}
                      </tr>
                    ))}
                  </Table>
                </div>
              );
            })()}
          </div>
        )}

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
                    <TableIcon className="w-5 h-5 text-green-600" />
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

        {/* Save As Dialog */}
        <Dialog open={showSaveAsModal} onOpenChange={setShowSaveAsModal}>
          <DialogContent className="sm:max-w-[500px]">
            <DialogHeader>
              <DialogTitle>Save As</DialogTitle>
            </DialogHeader>
            <div className="py-4">
              <div className="space-y-2">
                <label className="text-sm font-medium text-gray-700">Table Name</label>
                <Input
                  value={saveAsFileName}
                  onChange={(e) => setSaveAsFileName(e.target.value)}
                  placeholder="Enter table name"
                  className="w-full"
                />
              </div>
            </div>
            <DialogFooter>
              <Button
                variant="outline"
                onClick={() => {
                  setShowSaveAsModal(false);
                  setSaveAsFileName('');
                }}
                disabled={saveLoading}
              >
                Cancel
              </Button>
              <Button
                onClick={handleSaveAsColumnOperations}
                disabled={saveLoading || !saveAsFileName.trim()}
                className="bg-blue-600 hover:bg-blue-700 text-white"
              >
                {saveLoading ? 'Saving...' : 'Save'}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </StageLayout>
  );
};
