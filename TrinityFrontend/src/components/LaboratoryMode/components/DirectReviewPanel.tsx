import React, { useState, useEffect } from 'react';
import { createPortal } from 'react-dom';
import { Loader2, X, Maximize2, Minimize2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { VALIDATE_API, CLASSIFIER_API, PIPELINE_API } from '@/lib/api';
import { getActiveProjectContext } from '@/utils/projectEnv';
import { useGuidedFlowPersistence } from '@/components/LaboratoryMode/hooks/useGuidedFlowPersistence';

interface Frame {
  object_name: string;
  csv_name: string;
  arrow_name?: string;
  last_modified?: string;
  size?: number;
}

interface ProcessingColumnConfig {
  name: string;
  newName: string;
  originalDtype: string;
  selectedDtype: string;
  sampleValues: string[];
  missingCount: number;
  missingPercentage: number;
  missingStrategy: string;
  missingCustomValue: string;
  datetimeFormat?: string;
  formatDetecting?: boolean;
  formatFailed?: boolean;
  dropColumn: boolean;
  classification?: 'identifiers' | 'measures' | 'unclassified';
}

interface DirectReviewPanelProps {
  frame: Frame;
  onClose: () => void;
  onSave?: () => void;
}

export const DirectReviewPanel: React.FC<DirectReviewPanelProps> = ({ frame, onClose, onSave }) => {
  const [columns, setColumns] = useState<ProcessingColumnConfig[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [saving, setSaving] = useState(false);
  const [isMaximized, setIsMaximized] = useState(false);
  const { markFileAsPrimed } = useGuidedFlowPersistence();

  useEffect(() => {
    const fetchColumns = async () => {
      setLoading(true);
      setError('');
      
      try {
        const res = await fetch(`${VALIDATE_API}/file-metadata`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          credentials: 'include',
          body: JSON.stringify({ file_path: frame.object_name })
        });
        
        if (!res.ok) {
          const txt = await res.text().catch(() => '');
          throw new Error(txt || 'Failed to load dataframe metadata');
        }
        
        const data = await res.json();
        
        // Load saved config from mongo FIRST (same logic as SavedDataFramesPanel)
        let savedConfig: { identifiers: string[]; measures: string[] } | null = null;
        const fileName = frame.object_name || '';
        
        try {
          const envStr = localStorage.getItem('env');
          const env = envStr ? JSON.parse(envStr) : {};
          
          const queryParams = new URLSearchParams({
            client_name: env.CLIENT_NAME || '',
            app_name: env.APP_NAME || '',
            project_name: env.PROJECT_NAME || '',
            bypass_cache: 'true',
          });
          if (fileName) {
            queryParams.append('file_name', fileName);
          }
          
          const configRes = await fetch(`${CLASSIFIER_API}/get_config?${queryParams.toString()}`, {
            credentials: 'include'
          });
          
          if (configRes.ok) {
            const configData = await configRes.json();
            if (configData?.data) {
              savedConfig = {
                identifiers: Array.isArray(configData.data.identifiers) ? configData.data.identifiers : [],
                measures: Array.isArray(configData.data.measures) ? configData.data.measures : []
              };
            }
          }
        } catch (err) {
          console.warn('Error fetching saved config:', err);
        }
        
        // Get default classification if no saved config
        let base: { identifiers: string[]; measures: string[]; unclassified: string[] } | null = null;
        const hasSavedConfig = savedConfig && (savedConfig.identifiers.length > 0 || savedConfig.measures.length > 0);
        
        if (!hasSavedConfig) {
          // For now, we'll classify all columns as unclassified if no saved config
          // In a full implementation, you'd call runClassification here
          base = { identifiers: [], measures: [], unclassified: [] };
        }
        
        const baseSet = base || { identifiers: [], measures: [], unclassified: [] };
        const idSet = new Set<string>(savedConfig?.identifiers || baseSet.identifiers || []);
        const msSet = new Set<string>(savedConfig?.measures || baseSet.measures || []);
        
        const allColumns = (data.columns || []).map((col: any) => col.name || '').filter(Boolean);
        const classificationMap: Record<string, 'identifiers' | 'measures' | 'unclassified'> = {};
        
        const idMap = new Map<string, string>();
        const msMap = new Map<string, string>();
        idSet.forEach(id => {
          idMap.set(id.toLowerCase(), id);
        });
        msSet.forEach(ms => {
          msMap.set(ms.toLowerCase(), ms);
        });
        
        allColumns.forEach((colName: string) => {
          const colLower = colName.toLowerCase();
          if (idSet.has(colName)) {
            classificationMap[colName] = 'identifiers';
          } else if (msSet.has(colName)) {
            classificationMap[colName] = 'measures';
          } else if (idMap.has(colLower)) {
            classificationMap[colName] = 'identifiers';
          } else if (msMap.has(colLower)) {
            classificationMap[colName] = 'measures';
          } else {
            classificationMap[colName] = 'unclassified';
          }
        });
        
        const cols: ProcessingColumnConfig[] = (data.columns || []).map((col: any) => {
          const dtype = typeof col.dtype === 'string' && col.dtype ? col.dtype : 'object';
          return {
            name: col.name || '',
            newName: col.name || '',
            originalDtype: dtype,
            selectedDtype: dtype,
            sampleValues: Array.isArray(col.sample_values)
              ? col.sample_values.map((val: unknown) => (val === null || val === undefined ? '' : String(val)))
              : [],
            missingCount: typeof col.missing_count === 'number' ? col.missing_count : 0,
            missingPercentage: typeof col.missing_percentage === 'number' ? col.missing_percentage : 0,
            missingStrategy: 'none',
            missingCustomValue: '',
            datetimeFormat: undefined,
            formatDetecting: false,
            formatFailed: false,
            dropColumn: false,
            classification: classificationMap[col.name || ''] || 'unclassified',
          };
        });
        
        // Sort by missing percentage descending
        const sortedCols = cols.sort((a, b) => b.missingPercentage - a.missingPercentage);
        setColumns(sortedCols);
      } catch (err: any) {
        setError(err.message || 'Failed to load dataframe metadata');
      } finally {
        setLoading(false);
      }
    };

    void fetchColumns();
  }, [frame]);

  const updateColumn = (index: number, changes: Partial<ProcessingColumnConfig>) => {
    setColumns(prev =>
      prev.map((col, idx) => (idx === index ? { ...col, ...changes } : col))
    );
  };

  const getDtypeOptions = (currentDtype: string) => {
    const baseOptions = [
      { value: 'object', label: 'Object' },
      { value: 'int64', label: 'Integer' },
      { value: 'float64', label: 'Float' },
      { value: 'datetime64', label: 'DateTime' },
      { value: 'bool', label: 'Boolean' },
    ];
    const exists = baseOptions.some(opt => opt.value === currentDtype);
    if (!exists && currentDtype) {
      return [{ value: currentDtype, label: currentDtype }, ...baseOptions];
    }
    return baseOptions;
  };

  const getMissingOptions = (dtype: string) => {
    const base = [
      { value: 'none', label: 'Keep as Missing' },
      { value: 'drop', label: 'Drop Rows' },
      { value: 'custom', label: 'Custom Value' },
    ];
    if (dtype.includes('int') || dtype.includes('float')) {
      return [
        ...base,
        { value: 'mean', label: 'Fill with Mean' },
        { value: 'median', label: 'Fill with Median' },
        { value: 'zero', label: 'Fill with 0' },
      ];
    }
    if (dtype.includes('str') || dtype === 'object' || dtype === 'string') {
      return [
        ...base,
        { value: 'mode', label: 'Fill with Mode' },
        { value: 'empty', label: 'Fill with Empty String' },
      ];
    }
    return base;
  };

  const getDtypeBadgeColor = (dtype: string) => {
    const lower = dtype.toLowerCase();
    if (lower.includes('int') || lower.includes('float')) return 'bg-blue-100 text-blue-800 border-blue-300';
    if (lower.includes('datetime') || lower.includes('date')) return 'bg-purple-100 text-purple-800 border-purple-300';
    if (lower.includes('bool')) return 'bg-green-100 text-green-800 border-green-300';
    return 'bg-gray-100 text-gray-800 border-gray-300';
  };

  const handleSave = async () => {
    if (!frame) return;

    setSaving(true);
    setError('');
    
    try {
      // Build processing instructions
      const instructions = columns
        .map(col => {
          const instruction: Record<string, any> = { column: col.name };
          if (col.dropColumn) {
            instruction.drop_column = true;
            return instruction;
          }
          const trimmedNewName = col.newName?.trim();
          if (trimmedNewName && trimmedNewName !== col.name) {
            instruction.new_name = trimmedNewName;
          }
          if (col.selectedDtype && col.selectedDtype !== col.originalDtype) {
            instruction.dtype = col.selectedDtype;
            if (col.selectedDtype === 'datetime64' && col.datetimeFormat) {
              instruction.datetime_format = col.datetimeFormat;
            }
          }
          if (col.missingStrategy && col.missingStrategy !== 'none') {
            instruction.missing_strategy = col.missingStrategy;
            if (col.missingStrategy === 'custom') {
              instruction.custom_value = col.missingCustomValue || '';
            }
          }
          return instruction;
        })
        .filter(inst => Object.keys(inst).length > 1);

      // Extract identifiers and measures
      const identifiers = columns
        .filter(c => !c.dropColumn && c.classification === 'identifiers')
        .map(c => c.name);
      const measures = columns
        .filter(c => !c.dropColumn && c.classification === 'measures')
        .map(c => c.name);

      const hasProcessingChanges = instructions.length > 0;
      const canSaveClassifications = columns.length > 0;

      if (!hasProcessingChanges && !canSaveClassifications) {
        setError('No changes detected. Adjust at least one column before saving.');
        setSaving(false);
        return;
      }

      // Process dataframe if there are changes
      if (hasProcessingChanges) {
        const res = await fetch(`${VALIDATE_API}/process_saved_dataframe`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          credentials: 'include',
          body: JSON.stringify({
            object_name: frame.object_name,
            instructions,
          }),
        });
        
        if (!res.ok) {
          const data = await res.json().catch(() => null);
          const detail = data?.detail || (typeof data === 'string' ? data : '');
          throw new Error(detail || 'Failed to process dataframe');
        }
      }

      // Save classification config
      const projectContext = getActiveProjectContext();
      if (projectContext) {
        const stored = localStorage.getItem('current-project');
        const envStr = localStorage.getItem('env');
        const project = stored ? JSON.parse(stored) : {};
        const env = envStr ? JSON.parse(envStr) : {};
        const fileName = frame.object_name || '';
        
        const payload: Record<string, any> = {
          project_id: project.id || null,
          client_name: env.CLIENT_NAME || '',
          app_name: env.APP_NAME || '',
          project_name: env.PROJECT_NAME || '',
          identifiers,
          measures,
          dimensions: {}
        };
        if (fileName) {
          payload.file_name = fileName;
        }

        const saveRes = await fetch(`${CLASSIFIER_API}/save_config`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(payload),
          credentials: 'include'
        });

        if (saveRes.ok) {
          // ========================================================================
          // SAVE PRIMING STEPS TO PIPELINE EXECUTION
          // ========================================================================
          // Save priming steps (renames, dtypes, missing values, drop columns) to pipeline
          // This ensures replacement files get the same transformations during pipeline execution
          try {
            // Build priming steps from instructions
            const columnsToDrop: string[] = [];
            const columnRenames: Record<string, string> = {};
            const dtypeChanges: Record<string, string | { dtype: string; format?: string }> = {};
            const missingValueStrategies: Record<string, { strategy: string; value?: string | number }> = {};

            instructions.forEach(inst => {
              const colName = inst.column;
              
              // Drop columns
              if (inst.drop_column) {
                columnsToDrop.push(colName);
              }
              
              // Renames
              if (inst.new_name && inst.new_name !== colName) {
                columnRenames[colName] = inst.new_name;
              }
              
              // Dtype changes
              if (inst.dtype) {
                if (inst.dtype === 'datetime64' && inst.datetime_format) {
                  dtypeChanges[colName] = { dtype: 'datetime64', format: inst.datetime_format };
                } else {
                  dtypeChanges[colName] = inst.dtype;
                }
              }
              
              // Missing value strategies
              if (inst.missing_strategy && inst.missing_strategy !== 'none') {
                const strategyConfig: { strategy: string; value?: string | number } = {
                  strategy: inst.missing_strategy,
                };
                if (inst.missing_strategy === 'custom' && inst.custom_value !== undefined) {
                  strategyConfig.value = inst.custom_value;
                }
                missingValueStrategies[colName] = strategyConfig;
              }
            });

            const primingSteps = {
              renames: columnRenames,
              dtypes: dtypeChanges,
              missing_values: missingValueStrategies,
              columns_to_drop: columnsToDrop,
              stage: 'direct_review',
              applied_at: new Date().toISOString()
            };

            const fileKey = frame.object_name || fileName || '';

            if (fileKey && (columnsToDrop.length > 0 || Object.keys(columnRenames).length > 0 || Object.keys(dtypeChanges).length > 0 || Object.keys(missingValueStrategies).length > 0)) {
              console.log('🔍 [DirectReview] Saving priming steps to pipeline:', {
                fileKey,
                hasRenames: Object.keys(columnRenames).length > 0,
                hasDtypes: Object.keys(dtypeChanges).length > 0,
                hasMissingValues: Object.keys(missingValueStrategies).length > 0,
                hasDrops: columnsToDrop.length > 0
              });

              const pipelineRes = await fetch(
                `${PIPELINE_API}/save-priming-steps?client_name=${encodeURIComponent(env.CLIENT_NAME || '')}&app_name=${encodeURIComponent(env.APP_NAME || '')}&project_name=${encodeURIComponent(env.PROJECT_NAME || '')}&mode=laboratory`,
                {
                  method: 'POST',
                  headers: { 'Content-Type': 'application/json' },
                  credentials: 'include',
                  body: JSON.stringify({
                    file_key: fileKey,
                    priming_steps: primingSteps
                  })
                }
              );

              if (pipelineRes.ok) {
                const result = await pipelineRes.json();
                console.log('✅ [DirectReview] Priming steps saved to pipeline MongoDB:', result);
              } else {
                const errorText = await pipelineRes.text();
                console.warn('⚠️ [DirectReview] Failed to save priming steps to pipeline MongoDB:', {
                  status: pipelineRes.status,
                  statusText: pipelineRes.statusText,
                  error: errorText
                });
              }
            } else {
              console.log('ℹ️ [DirectReview] No priming steps to save (no transformations)');
            }
          } catch (pipelineError) {
            console.warn('⚠️ [DirectReview] Error saving priming steps to pipeline:', pipelineError);
            // Don't fail the save if pipeline saving fails
          }

          // Mark file as primed
          if (fileName) {
            await markFileAsPrimed(fileName);
            window.dispatchEvent(new CustomEvent('dataframe-saved', { 
              detail: { filePath: frame.object_name, fileName: fileName } 
            }));
            window.dispatchEvent(new CustomEvent('priming-status-changed', { 
              detail: { filePath: frame.object_name, fileName: fileName } 
            }));
          }
          
          if (onSave) {
            onSave();
          }
          onClose();
        } else {
          throw new Error('Failed to save configuration');
        }
      }
    } catch (err: any) {
      setError(err.message || 'Failed to save changes');
      setSaving(false);
    }
  };

  if (loading) {
    return (
      <div className="w-full border-t-2 border-gray-200 bg-white">
        <div className="px-4 py-3 border-b border-gray-200 bg-gray-50">
          <h3 className="text-base font-semibold text-gray-800">Preview of data set</h3>
        </div>
        <div className="flex items-center justify-center py-10">
          <Loader2 className="w-8 h-8 animate-spin text-[#458EE2]" />
          <p className="ml-4 text-sm text-gray-600">Loading dataframe metadata...</p>
        </div>
      </div>
    );
  }

  if (error && columns.length === 0) {
    return (
      <div className="w-full border-t-2 border-gray-200 bg-white">
        <div className="px-4 py-3 border-b border-gray-200 bg-gray-50">
          <h3 className="text-base font-semibold text-gray-800">Preview of data set</h3>
        </div>
        <div className="p-4 bg-red-50 border border-red-200 rounded-lg m-4">
          <p className="text-sm text-red-800">{error}</p>
        </div>
      </div>
    );
  }

  // Render the preview content (used in both normal and maximized views)
  const renderPreviewContent = (isMaximizedView: boolean = false) => (
    <>
      {error && (
        <div className="bg-yellow-50 border border-yellow-200 rounded-lg p-3">
          <p className="text-xs text-yellow-800">{error}</p>
        </div>
      )}

      {/* Column Table - Using same compact format as U6 */}
      <div className="border border-gray-200 rounded-lg overflow-hidden">
        <div 
          className="overflow-x-auto" 
          style={{ 
            maxHeight: isMaximizedView ? 'calc(100vh - 250px)' : '8.75rem',
            overflowY: 'auto',
            scrollbarGutter: 'stable'
          }}
        >
            <table className="text-[10px] table-fixed w-full">
              <colgroup>
                <col style={{ width: '100px' }} />
                <col style={{ width: '100px' }} />
                <col style={{ width: '80px' }} />
                <col style={{ width: '100px' }} />
                <col style={{ width: '80px' }} />
                <col style={{ width: '100px' }} />
                <col style={{ width: '100px' }} />
                <col style={{ width: '70px' }} />
              </colgroup>
              <thead className="sticky top-0 z-10 bg-gray-50">
                <tr className="bg-gray-50" style={{ height: '1.75rem' }}>
                  <th className="px-0.5 py-0 text-left font-medium text-gray-900 border border-gray-300 text-[10px] leading-tight bg-gray-50 whitespace-nowrap overflow-hidden">
                    <div className="truncate">Column Name</div>
                  </th>
                  <th className="px-0.5 py-0 text-left font-medium text-gray-900 border border-gray-300 text-[10px] leading-tight bg-gray-50 whitespace-nowrap overflow-hidden">
                    <div className="truncate">Rename</div>
                  </th>
                  <th className="px-0.5 py-0 text-left font-medium text-gray-900 border border-gray-300 text-[10px] leading-tight bg-gray-50 whitespace-nowrap overflow-hidden">
                    <div className="truncate">Current Type</div>
                  </th>
                  <th className="px-0.5 py-0 text-left font-medium text-gray-900 border border-gray-300 text-[10px] leading-tight bg-gray-50 whitespace-nowrap overflow-hidden">
                    <div className="truncate">Change Type</div>
                  </th>
                  <th className="px-0.5 py-0 text-left font-medium text-gray-900 border border-gray-300 text-[10px] leading-tight bg-gray-50 whitespace-nowrap overflow-hidden">
                    <div className="truncate">Missing</div>
                  </th>
                  <th className="px-0.5 py-0 text-left font-medium text-gray-900 border border-gray-300 text-[10px] leading-tight bg-gray-50 whitespace-nowrap overflow-hidden">
                    <div className="truncate">Strategy</div>
                  </th>
                  <th className="px-0.5 py-0 text-left font-medium text-gray-900 border border-gray-300 text-[10px] leading-tight bg-gray-50 whitespace-nowrap overflow-hidden">
                    <div className="truncate">Classification</div>
                  </th>
                  <th className="px-0.5 py-0 text-left font-medium text-gray-900 border border-gray-300 text-[10px] leading-tight bg-gray-50 whitespace-nowrap overflow-hidden">
                    <div className="truncate">Drop</div>
                  </th>
                </tr>
              </thead>
              <tbody>
                {columns.map((col, idx) => {
                  const dtypeOptions = getDtypeOptions(col.originalDtype);
                  const missingOptions = getMissingOptions(col.selectedDtype);
                  const hasMissingValues = col.missingCount > 0;
                  const inputsDisabled = col.dropColumn;

                  const uniqueSampleValues = Array.from(new Set(col.sampleValues || []));
                  const previewSampleValues = uniqueSampleValues.slice(0, 5).join(', ');
                  const fullSampleValuesText = uniqueSampleValues.join(', ');

                  return (
                    <tr
                      key={`col-${col.name}-${idx}`}
                      className={col.dropColumn ? 'bg-gray-50 opacity-60 hover:bg-gray-50' : 'hover:bg-gray-50'}
                      style={{ height: '1.75rem' }}
                    >
                      <td className="px-0.5 py-0 border border-gray-300 text-[10px] leading-tight whitespace-nowrap overflow-hidden" title={col.newName}>
                        <div className="truncate">
                          <div className="text-gray-700 text-[10px] leading-tight truncate">
                            {col.newName}
                          </div>
                          {uniqueSampleValues.length === 0 ? (
                            <div className="text-gray-400 text-[9px] leading-tight truncate">No samples</div>
                          ) : (
                            <div 
                              className="text-gray-500 text-[9px] leading-tight truncate" 
                              title={fullSampleValuesText}
                            >
                              {previewSampleValues}
                              {uniqueSampleValues.length > 5 && '...'}
                            </div>
                          )}
                        </div>
                      </td>
                      <td className="px-0.5 py-0 border border-gray-300 text-[10px] leading-tight whitespace-nowrap overflow-hidden">
                        <input
                          type="text"
                          value={col.newName}
                          onChange={e => updateColumn(idx, { newName: e.target.value })}
                          disabled={inputsDisabled}
                          className="w-full h-5 px-1 py-0 text-[10px] rounded border border-gray-300 bg-white focus:outline-none focus:ring-1 focus:ring-[#458EE2] focus:border-[#458EE2] disabled:bg-gray-100 disabled:cursor-not-allowed"
                          onClick={(e) => e.stopPropagation()}
                        />
                      </td>
                      <td className="px-0.5 py-0 border border-gray-300 text-[10px] leading-tight whitespace-nowrap overflow-hidden">
                        <div className="truncate">
                          <span className={`inline-flex items-center rounded-full border px-1 py-0 text-[9px] font-semibold ${getDtypeBadgeColor(col.originalDtype)}`}>
                            {col.originalDtype}
                          </span>
                        </div>
                      </td>
                      <td className="px-0.5 py-0 border border-gray-300 text-[10px] leading-tight whitespace-nowrap overflow-hidden">
                        <div 
                          className="relative inline-block w-full max-w-[90px]" 
                          onClick={(e) => e.stopPropagation()}
                        >
                          <select
                            value={col.selectedDtype}
                            onChange={e => {
                              e.stopPropagation();
                              updateColumn(idx, { selectedDtype: e.target.value });
                            }}
                            disabled={inputsDisabled}
                            onClick={(e) => e.stopPropagation()}
                            onMouseDown={(e) => e.stopPropagation()}
                            className={`w-full h-5 px-1 py-0 text-[10px] rounded border border-gray-300 bg-white focus:outline-none focus:ring-1 focus:ring-[#458EE2] focus:border-[#458EE2] cursor-pointer appearance-none text-gray-900 disabled:bg-gray-100 disabled:cursor-not-allowed`}
                            style={{
                              backgroundImage: `url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' fill='none' viewBox='0 0 20 20'%3E%3Cpath stroke='%236b7280' stroke-linecap='round' stroke-linejoin='round' stroke-width='1.5' d='M6 8l4 4 4-4'/%3E%3C/svg%3E")`,
                              backgroundSize: '1em 1em',
                              backgroundPosition: 'right 0.25rem center',
                              backgroundRepeat: 'no-repeat',
                              paddingRight: '1.5rem'
                            }}
                          >
                            {dtypeOptions.map(opt => (
                              <option key={`dtype-${col.name}-${opt.value}`} value={opt.value}>
                                {opt.label}
                              </option>
                            ))}
                          </select>
                        </div>
                      </td>
                      <td className="px-0.5 py-0 border border-gray-300 text-[10px] leading-tight whitespace-nowrap overflow-hidden">
                        {hasMissingValues ? (
                          <div className="truncate">
                            <span className="text-red-600 text-[9px] font-semibold">
                              {col.missingCount}
                            </span>
                            <span className="text-gray-500 text-[9px]">
                              ({col.missingPercentage.toFixed(1)}%)
                            </span>
                          </div>
                        ) : (
                          <span className="text-gray-400 text-[10px]">None</span>
                        )}
                      </td>
                      <td className="px-0.5 py-0 border border-gray-300 text-[10px] leading-tight whitespace-nowrap overflow-hidden">
                        {hasMissingValues ? (
                          <div 
                            className="relative inline-block w-full max-w-[90px]" 
                            onClick={(e) => e.stopPropagation()}
                          >
                            <select
                              value={col.missingStrategy}
                              onChange={e => {
                                e.stopPropagation();
                                updateColumn(idx, { 
                                  missingStrategy: e.target.value,
                                  ...(e.target.value !== 'custom' ? { missingCustomValue: '' } : {})
                                });
                              }}
                              disabled={inputsDisabled}
                              onClick={(e) => e.stopPropagation()}
                              onMouseDown={(e) => e.stopPropagation()}
                              className="w-full h-5 px-1 py-0 text-[10px] rounded border border-gray-300 bg-white focus:outline-none focus:ring-1 focus:ring-[#458EE2] focus:border-[#458EE2] cursor-pointer appearance-none text-gray-900 disabled:bg-gray-100 disabled:cursor-not-allowed"
                              style={{
                                backgroundImage: `url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' fill='none' viewBox='0 0 20 20'%3E%3Cpath stroke='%236b7280' stroke-linecap='round' stroke-linejoin='round' stroke-width='1.5' d='M6 8l4 4 4-4'/%3E%3C/svg%3E")`,
                                backgroundSize: '1em 1em',
                                backgroundPosition: 'right 0.25rem center',
                                backgroundRepeat: 'no-repeat',
                                paddingRight: '1.5rem'
                              }}
                            >
                              {missingOptions.map(opt => (
                                <option key={`missing-${col.name}-${opt.value}`} value={opt.value}>
                                  {opt.label}
                                </option>
                              ))}
                            </select>
                          </div>
                        ) : (
                          <span className="text-gray-400 text-[10px]">N/A</span>
                        )}
                      </td>
                      <td className="px-0.5 py-0 border border-gray-300 text-[10px] leading-tight whitespace-nowrap overflow-hidden">
                        <div 
                          className="relative inline-block w-full max-w-[90px]" 
                          onClick={(e) => e.stopPropagation()}
                        >
                          <select
                            value={col.classification || 'unclassified'}
                            onChange={e => {
                              e.stopPropagation();
                              const value = e.target.value as 'identifiers' | 'measures' | 'unclassified';
                              updateColumn(idx, { classification: value });
                            }}
                            disabled={inputsDisabled}
                            onClick={(e) => e.stopPropagation()}
                            onMouseDown={(e) => e.stopPropagation()}
                            className={`w-full h-5 px-1 py-0 text-[10px] rounded border border-gray-300 bg-white focus:outline-none focus:ring-1 focus:ring-[#458EE2] focus:border-[#458EE2] cursor-pointer appearance-none disabled:bg-gray-100 disabled:cursor-not-allowed ${
                              col.classification === 'identifiers' ? 'text-blue-600 border-blue-300' :
                              col.classification === 'measures' ? 'text-green-600 border-green-300' :
                              'text-yellow-600 border-yellow-300'
                            }`}
                            style={{
                              backgroundImage: `url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' fill='none' viewBox='0 0 20 20'%3E%3Cpath stroke='%236b7280' stroke-linecap='round' stroke-linejoin='round' stroke-width='1.5' d='M6 8l4 4 4-4'/%3E%3C/svg%3E")`,
                              backgroundSize: '1em 1em',
                              backgroundPosition: 'right 0.25rem center',
                              backgroundRepeat: 'no-repeat',
                              paddingRight: '1.5rem'
                            }}
                          >
                            <option value="identifiers">Identifiers</option>
                            <option value="measures">Measures</option>
                            <option value="unclassified">Unclassified</option>
                          </select>
                        </div>
                      </td>
                      <td className="px-0.5 py-0 border border-gray-300 text-[10px] leading-tight whitespace-nowrap overflow-hidden">
                        <div className="flex items-center justify-center">
                          <input
                            type="checkbox"
                            className="h-3 w-3 accent-red-600 cursor-pointer"
                            checked={col.dropColumn}
                            onChange={e => {
                              const checked = e.target.checked;
                              updateColumn(idx, {
                                dropColumn: checked,
                                ...(checked ? {
                                  missingStrategy: 'none',
                                  missingCustomValue: '',
                                  datetimeFormat: undefined,
                                } : {})
                              });
                            }}
                            onClick={(e) => e.stopPropagation()}
                          />
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>

      <div className="flex justify-end gap-2 pt-4 border-t border-gray-200">
        <Button variant="outline" size="sm" onClick={onClose} disabled={saving}>
          Cancel
        </Button>
        <Button size="sm" onClick={handleSave} disabled={saving || loading || columns.length === 0}>
          {saving ? 'Saving…' : 'Approve'}
        </Button>
      </div>
    </>
  );

  return (
    <>
      {/* Normal View - Embedded in panel */}
      <div className="w-full border-t-2 border-gray-200 bg-white flex-shrink-0" style={{ maxHeight: '70vh', overflowY: 'auto' }}>
        <div className="px-4 py-3 border-b border-gray-200 bg-gray-50 sticky top-0 z-10 flex items-center justify-between">
          <div>
            <h3 className="text-base font-semibold text-gray-800">Preview of data set</h3>
            <p className="text-xs text-gray-600 mt-1">
              {frame.arrow_name || frame.csv_name || frame.object_name}
            </p>
          </div>
          <div className="flex items-center gap-2">
            <Button
              variant="ghost"
              size="sm"
              onClick={() => setIsMaximized(true)}
              className="h-8 w-8 p-0"
              title="Maximize preview"
            >
              <Maximize2 className="h-4 w-4" />
            </Button>
            <Button
              variant="ghost"
              size="sm"
              onClick={onClose}
              className="h-8 w-8 p-0"
            >
              <X className="h-4 w-4" />
            </Button>
          </div>
        </div>

        <div className="p-4 space-y-4">
          {renderPreviewContent(false)}
        </div>
      </div>

      {/* Maximized View - Full screen Modal (using same pattern as card maximization) */}
      {isMaximized &&
        typeof document !== 'undefined' &&
        createPortal(
          <div
            className="fixed inset-0 z-40 pointer-events-none"
            role="dialog"
            aria-modal="true"
          >
            <div
              className="absolute inset-0 bg-black/40 pointer-events-auto"
              aria-hidden="true"
              onClick={() => setIsMaximized(false)}
            />
            <div className="relative flex h-full w-full flex-col bg-gray-50 shadow-2xl pointer-events-auto">
              <div className="flex items-center justify-between p-4 border-b border-gray-200 bg-white shadow-sm">
                <div>
                  <span className="text-lg font-semibold text-gray-900">
                    Preview of data set
                  </span>
                  <p className="text-xs text-gray-600 mt-1">
                    {frame.arrow_name || frame.csv_name || frame.object_name}
                  </p>
                </div>
                <button
                  onClick={() => setIsMaximized(false)}
                  className="p-2 hover:bg-gray-100 rounded-lg transition-colors"
                  title="Close Fullscreen"
                >
                  <X className="w-5 h-5 text-gray-500" />
                </button>
              </div>

              {/* Fullscreen Content */}
              <div className="flex-1 flex flex-col px-8 py-4 space-y-4 overflow-auto">
                {renderPreviewContent(true)}
              </div>
            </div>
          </div>,
          document.body
        )}
    </>
  );
};

