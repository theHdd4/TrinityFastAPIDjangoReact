import React, { useState, useEffect, useRef } from 'react';
import { Loader2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { UPLOAD_API } from '@/lib/api';
import { StageLayout } from '../components/StageLayout';
import type { ReturnTypeFromUseGuidedUploadFlow } from '../useGuidedUploadFlow';
import { getActiveProjectContext } from '@/utils/projectEnv';
import { useGuidedFlowPersistence } from '@/components/LaboratoryMode/hooks/useGuidedFlowPersistence';
import { useLaboratoryStore } from '@/components/LaboratoryMode/store/laboratoryStore';

interface U6FinalPreviewProps {
  flow: ReturnTypeFromUseGuidedUploadFlow;
  onNext: () => void;
  onBack: () => void;
  onGoToStage?: (stage: 'U5' | 'U4' | 'U3') => void;
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

export const U6FinalPreview: React.FC<U6FinalPreviewProps> = ({ flow, onNext, onBack }) => {
  const { state, setColumnNameEdits, setDataTypeSelections, setMissingValueStrategies } = flow;
  const { uploadedFiles, selectedFileIndex, columnNameEdits, dataTypeSelections, missingValueStrategies } = state;
  const chosenIndex = selectedFileIndex !== undefined && selectedFileIndex < uploadedFiles.length ? selectedFileIndex : 0;
  const currentFile = uploadedFiles[chosenIndex];
  
  const [columns, setColumns] = useState<ProcessingColumnConfig[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [saving, setSaving] = useState(false);
  const loadedFileRef = useRef<string | null>(null);

  const currentColumnEdits = currentFile ? (columnNameEdits[currentFile.name] || []) : [];
  const currentDataTypes = currentFile ? (dataTypeSelections[currentFile.name] || []) : [];
  const currentStrategies = currentFile ? (missingValueStrategies[currentFile.name] || []) : [];

  // Hooks for finalization and closing guided mode
  const { markFileAsPrimed } = useGuidedFlowPersistence();
  const { setGlobalGuidedMode, removeActiveGuidedFlow, activeGuidedFlows } = useLaboratoryStore();
  
  // Find atomId from active guided flows
  const atomId = Object.keys(activeGuidedFlows)[0] || 'guided-upload';

  useEffect(() => {
    const fetchColumns = async () => {
      if (!currentFile) {
        setLoading(false);
        return;
      }

      const fileKey = `${currentFile.name}-${currentFile.path}`;
      if (loadedFileRef.current === fileKey) {
        return;
      }

      setLoading(true);
      setError('');
      
      try {
        const envStr = localStorage.getItem('env');
        let env: any = {};
        if (envStr) {
          try {
            env = JSON.parse(envStr);
          } catch {
            // Ignore parse errors
          }
        }

        const filePath = currentFile.path;

        // CRITICAL: Apply all transformations from U1-U5 BEFORE fetching metadata
        // This ensures we see the final transformed state, not the original raw data
        
        // Build columns_to_drop from columnNameEdits (U3) - columns marked as keep=false
        const columnsToDrop: string[] = [];
        currentColumnEdits.forEach(edit => {
          if (edit.keep === false) {
            columnsToDrop.push(edit.originalName);
          }
        });
        
        // Build column_renames from columnNameEdits (U3) - only for kept columns
        const columnRenames: Record<string, string> = {};
        currentColumnEdits.forEach(edit => {
          if (edit.keep !== false && edit.editedName && edit.editedName !== edit.originalName) {
            columnRenames[edit.originalName] = edit.editedName;
          }
        });
        
        // Build dtype_changes from dataTypeSelections (U4)
        // Note: dt.columnName in dataTypeSelections is already the edited name (from U3)
        const dtypeChanges: Record<string, string | { dtype: string; format?: string }> = {};
        currentDataTypes.forEach(dt => {
          // Use updateType (user's selection from U4) instead of selectedType
          const userSelectedType = dt.updateType || dt.selectedType;
          if (userSelectedType && userSelectedType !== dt.detectedType) {
            // dt.columnName is already the edited name (after U3 rename)
            const columnName = dt.columnName;
            
            if ((userSelectedType === 'date' || userSelectedType === 'datetime') && dt.format) {
              dtypeChanges[columnName] = { dtype: 'datetime64', format: dt.format };
            } else {
              // Map frontend types to backend types
              const backendType = userSelectedType === 'number' ? 'float64' : 
                                 userSelectedType === 'int' ? 'int64' :
                                 userSelectedType === 'float' ? 'float64' :
                                 userSelectedType === 'category' ? 'object' :
                                 userSelectedType === 'string' ? 'object' :
                                 userSelectedType === 'date' ? 'datetime64' :
                                 userSelectedType === 'datetime' ? 'datetime64' :
                                 userSelectedType === 'boolean' ? 'bool' :
                                 userSelectedType;
              dtypeChanges[columnName] = backendType;
            }
          }
        });
        
        // Build missing_value_strategies from missingValueStrategies (U5)
        const missingValueStrategiesPayload: Record<string, { strategy: string; value?: string | number }> = {};
        currentStrategies.forEach(s => {
          if (s.strategy !== 'none') {
            const strategyConfig: { strategy: string; value?: string | number } = {
              strategy: s.strategy,
            };
            
            // Only include value for 'custom' strategy (backend requirement)
            if (s.strategy === 'custom' && s.value !== undefined) {
              strategyConfig.value = s.value;
            }
            
            missingValueStrategiesPayload[s.columnName] = strategyConfig;
          }
        });
        
        // Apply transformations if there are any changes
        let transformedFilePath = filePath;
        if (columnsToDrop.length > 0 || Object.keys(columnRenames).length > 0 || Object.keys(dtypeChanges).length > 0 || Object.keys(missingValueStrategiesPayload).length > 0) {
          try {
            console.log('U6: Applying transformations from U1-U5 before showing final preview:', { 
              columnsToDrop, 
              columnRenames, 
              dtypeChanges, 
              missingValueStrategiesPayload 
            });
            
            const transformRes = await fetch(`${UPLOAD_API}/apply-data-transformations`, {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              credentials: 'include',
              body: JSON.stringify({
                file_path: filePath,
                columns_to_drop: columnsToDrop,
                column_renames: columnRenames,
                dtype_changes: dtypeChanges,
                missing_value_strategies: missingValueStrategiesPayload,
              }),
            });
            
            if (transformRes.ok) {
              const transformResult = await transformRes.json();
              console.log('U6: Transformations applied successfully:', transformResult);
              // Use the same file path (transformations are applied in-place)
              transformedFilePath = filePath;
            } else {
              console.warn('U6: Failed to apply transformations, using original file');
            }
          } catch (transformError) {
            console.warn('U6: Error applying transformations:', transformError);
            // Continue with original file if transformation fails
          }
        }

        // Now fetch metadata from the TRANSFORMED file
        const res = await fetch(`${UPLOAD_API}/file-metadata`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          credentials: 'include',
          body: JSON.stringify({
            file_path: transformedFilePath,
            client_id: env.CLIENT_ID || '',
            app_id: env.APP_ID || '',
            project_id: env.PROJECT_ID || '',
          }),
        });

        if (!res.ok) {
          throw new Error('Failed to load dataframe metadata');
        }

        const data = await res.json();
        
        // After transformations, column names in metadata are the edited names (from U3)
        // Build mapping from current name (edited) back to original name for saving
        const currentToOriginalMap = new Map<string, string>();
        currentColumnEdits.forEach(edit => {
          if (edit.keep !== false) {
            currentToOriginalMap.set(edit.editedName, edit.originalName);
          }
        });

        const cols: ProcessingColumnConfig[] = (data.columns || []).map((col: any) => {
          // After transformations, col.name is the edited name (from U3) - this is the current name
          const currentName = col.name;
          // Map back to original name for saving
          const originalName = currentToOriginalMap.get(currentName) || currentName;
          
          // Find data type and strategy using current name (edited name from U3)
          const dataType = currentDataTypes.find(dt => dt.columnName === currentName);
          const strategy = currentStrategies.find(s => s.columnName === currentName);

          // Map backend dtype to frontend dtype
          const mapDtype = (dtype: string): string => {
            const lower = dtype.toLowerCase();
            if (lower.includes('int')) return 'int64';
            if (lower.includes('float')) return 'float64';
            if (lower.includes('datetime') || lower.includes('date')) return 'datetime64';
            if (lower.includes('bool')) return 'bool';
            return 'object';
          };

          // The dtype in metadata is after U4 transformations, so this is the current dtype
          const currentDtype = mapDtype(col.dtype || 'object');
          
          // selectedDtype should match what was set in U4, or use current dtype
          const selectedDtype = dataType?.updateType 
            ? (dataType.updateType === 'int' ? 'int64' : 
               dataType.updateType === 'float' ? 'float64' :
               dataType.updateType === 'datetime' ? 'datetime64' :
               dataType.updateType === 'boolean' ? 'bool' : 'object')
            : currentDtype;

          return {
            name: originalName, // Store original name for saving back to columnNameEdits
            newName: currentName, // Current name (after U3 rename) - this is what we display and allow editing
            originalDtype: currentDtype, // Current dtype (after U4 transformations)
            selectedDtype, // User's selected type from U4, or current dtype
            sampleValues: (col.sample_values || []).map((v: any) => String(v)),
            missingCount: col.missing_count || 0,
            missingPercentage: col.missing_percentage || 0,
            missingStrategy: strategy?.strategy || 'none',
            missingCustomValue: strategy?.strategy === 'custom' ? String(strategy.value || '') : '',
            dropColumn: false, // Dropped columns won't appear in transformed metadata
            classification: dataType?.columnRole === 'identifier' ? 'identifiers' : 
                           dataType?.columnRole === 'measure' ? 'measures' : 'unclassified',
            datetimeFormat: dataType?.format,
          };
        });

        // Sort by missing percentage descending
        const sortedCols = cols.sort((a, b) => b.missingPercentage - a.missingPercentage);
        setColumns(sortedCols);
        loadedFileRef.current = fileKey;
      } catch (err: any) {
        setError(err.message || 'Failed to load dataframe metadata');
      } finally {
        setLoading(false);
      }
    };

    void fetchColumns();
  }, [currentFile?.name, currentFile?.path, currentColumnEdits, currentDataTypes, currentStrategies]);

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
    if (!currentFile) return;

    setSaving(true);
    setError('');
    
    try {
      // Step 1: Update state with any changes made in U6
      const edits = columns.map(col => ({
        originalName: col.name,
        editedName: col.newName,
        keep: !col.dropColumn,
      }));
      setColumnNameEdits(currentFile.name, edits);

      const dataTypes = columns
        .filter(col => !col.dropColumn)
        .map(col => {
          const updateType = col.selectedDtype === 'int64' ? 'int' :
                            col.selectedDtype === 'float64' ? 'float' :
                            col.selectedDtype === 'datetime64' ? 'datetime' :
                            col.selectedDtype === 'bool' ? 'boolean' : 'string';
          return {
            columnName: col.newName,
            updateType,
            columnRole: col.classification === 'identifiers' ? 'identifier' as const :
                       col.classification === 'measures' ? 'measure' as const : 'identifier' as const,
            format: col.selectedDtype === 'datetime64' ? col.datetimeFormat : undefined,
          };
        });
      setDataTypeSelections(currentFile.name, dataTypes);

      const strategies = columns
        .filter(col => !col.dropColumn && col.missingStrategy !== 'none')
        .map(col => ({
          columnName: col.newName,
          strategy: col.missingStrategy as any,
          value: col.missingStrategy === 'custom' ? col.missingCustomValue : undefined,
        }));
      setMissingValueStrategies(currentFile.name, strategies);

      // Step 2: Apply all transformations from U1-U5 (including any changes from U6)
      // Build mapping from edited name back to original name for dtype/missing value strategies
      const editedToOriginalMap = new Map<string, string>();
      edits.forEach(edit => {
        if (edit.keep !== false) {
          editedToOriginalMap.set(edit.editedName, edit.originalName);
        }
      });

      const columnsToDrop: string[] = [];
      edits.forEach(edit => {
        if (edit.keep === false) {
          columnsToDrop.push(edit.originalName);
        }
      });
      
      const columnRenames: Record<string, string> = {};
      edits.forEach(edit => {
        if (edit.keep !== false && edit.editedName && edit.editedName !== edit.originalName) {
          columnRenames[edit.originalName] = edit.editedName;
        }
      });
      
      // dtypeChanges and missingValueStrategies need to use edited names (after rename)
      // because backend applies: drops -> renames -> dtype changes -> missing value strategies
      const dtypeChanges: Record<string, string | { dtype: string; format?: string }> = {};
      dataTypes.forEach(dt => {
        const userSelectedType = dt.updateType;
        // dt.columnName is already the edited name (from U3)
        const columnNameForDtype = dt.columnName;
        if (userSelectedType) {
          if ((userSelectedType === 'date' || userSelectedType === 'datetime') && dt.format) {
            dtypeChanges[columnNameForDtype] = { dtype: 'datetime64', format: dt.format };
          } else {
            const backendType = userSelectedType === 'number' ? 'float64' : 
                               userSelectedType === 'int' ? 'int64' :
                               userSelectedType === 'float' ? 'float64' :
                               userSelectedType === 'category' ? 'object' :
                               userSelectedType === 'string' ? 'object' :
                               userSelectedType === 'date' ? 'datetime64' :
                               userSelectedType === 'datetime' ? 'datetime64' :
                               userSelectedType === 'boolean' ? 'bool' :
                               userSelectedType;
            dtypeChanges[columnNameForDtype] = backendType;
          }
        }
      });
      
      // missingValueStrategies also use edited names (after rename)
      const missingValueStrategiesPayload: Record<string, { strategy: string; value?: string | number }> = {};
      strategies.forEach(s => {
        if (s.strategy !== 'none') {
          // s.columnName is already the edited name (from U3)
          const strategyConfig: { strategy: string; value?: string | number } = {
            strategy: s.strategy,
          };
          if (s.strategy === 'custom' && s.value !== undefined) {
            strategyConfig.value = s.value;
          }
          missingValueStrategiesPayload[s.columnName] = strategyConfig;
        }
      });

      // Apply transformations if there are any changes
      if (columnsToDrop.length > 0 || Object.keys(columnRenames).length > 0 || Object.keys(dtypeChanges).length > 0 || Object.keys(missingValueStrategiesPayload).length > 0) {
        try {
          console.log('U6 Approve: Applying final transformations:', { 
            columnsToDrop, 
            columnRenames, 
            dtypeChanges, 
            missingValueStrategiesPayload 
          });
          
          const transformRes = await fetch(`${UPLOAD_API}/apply-data-transformations`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            credentials: 'include',
            body: JSON.stringify({
              file_path: currentFile.path,
              columns_to_drop: columnsToDrop,
              column_renames: columnRenames,
              dtype_changes: dtypeChanges,
              missing_value_strategies: missingValueStrategiesPayload,
            }),
          });
          
          if (!transformRes.ok) {
            console.warn('U6: Failed to apply transformations:', await transformRes.text());
          } else {
            console.log('U6: Transformations applied successfully');
          }
        } catch (transformError) {
          console.error('U6: Error applying transformations:', transformError);
        }
      }

      // Step 3: Finalize the primed file
      const projectContext = getActiveProjectContext();
      if (projectContext) {
        try {
          console.log('U6 Approve: Finalizing primed file:', currentFile.path || currentFile.name);
          
          const columnClassifications = dataTypes.map(dt => ({
            columnName: dt.columnName,
            columnRole: dt.columnRole || 'identifier',
          }));
          
          console.log('U6 Approve: Sending column classifications:', columnClassifications);
          
          const finalizeRes = await fetch(`${UPLOAD_API}/finalize-primed-file`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            credentials: 'include',
            body: JSON.stringify({
              file_path: currentFile.path,
              file_name: currentFile.name,
              client_name: projectContext.client_name || '',
              app_name: projectContext.app_name || '',
              project_name: projectContext.project_name || '',
              validator_atom_id: atomId,
              column_classifications: columnClassifications,
            }),
          });
          
          if (finalizeRes.ok) {
            const result = await finalizeRes.json();
            console.log('U6 Approve: File finalized successfully:', result);
            
            const savedFilePath = result.saved_path || currentFile.path;
            const fileName = currentFile.name;
            
            // Mark file as primed
            await markFileAsPrimed(currentFile.path || currentFile.name);
            
            // Dispatch events immediately BEFORE closing panel to ensure UI updates
            const eventDetail = { filePath: savedFilePath, fileName: fileName };
            
            // Dispatch immediately (synchronously)
            window.dispatchEvent(new CustomEvent('dataframe-saved', { detail: eventDetail }));
            window.dispatchEvent(new CustomEvent('priming-status-changed', { detail: eventDetail }));
            
            // Use requestAnimationFrame to ensure events are processed before closing
            requestAnimationFrame(() => {
              // Dispatch again to ensure all listeners catch it
              window.dispatchEvent(new CustomEvent('dataframe-saved', { detail: eventDetail }));
              window.dispatchEvent(new CustomEvent('priming-status-changed', { detail: eventDetail }));
              
              // Dispatch again with small delays to ensure UI updates
              setTimeout(() => {
                window.dispatchEvent(new CustomEvent('dataframe-saved', { detail: eventDetail }));
                window.dispatchEvent(new CustomEvent('priming-status-changed', { detail: eventDetail }));
              }, 50);
              
              setTimeout(() => {
                window.dispatchEvent(new CustomEvent('dataframe-saved', { detail: eventDetail }));
                window.dispatchEvent(new CustomEvent('priming-status-changed', { detail: eventDetail }));
              }, 200);
            });
            
            // Step 4: Close guided mode immediately after dispatching events
            // Use setTimeout to ensure events are processed first
            setTimeout(() => {
              try {
                console.log('U6 Approve: Closing guided mode');
                setGlobalGuidedMode(false);
                removeActiveGuidedFlow(atomId);
              } catch (closeError) {
                console.error('U6 Approve: Error closing guided mode:', closeError);
              }
              
              // Step 5: Call onNext to complete the flow and close panel
              onNext();
            }, 100);
          } else {
            const errorText = await finalizeRes.text();
            console.warn('U6 Approve: Failed to finalize file:', errorText);
            // Fallback: just mark as primed
            await markFileAsPrimed(currentFile.path || currentFile.name);
            const eventDetail = { filePath: currentFile.path, fileName: currentFile.name };
            window.dispatchEvent(new CustomEvent('priming-status-changed', { detail: eventDetail }));
            setTimeout(() => {
              window.dispatchEvent(new CustomEvent('priming-status-changed', { detail: eventDetail }));
            }, 100);
            
            // Close guided mode even on error
            try {
              setGlobalGuidedMode(false);
              removeActiveGuidedFlow(atomId);
            } catch (closeError) {
              console.error('U6 Approve: Error closing guided mode:', closeError);
            }
            onNext();
          }
        } catch (finalizeError) {
          console.error('U6 Approve: Error finalizing file:', finalizeError);
          // Fallback: just mark as primed
          await markFileAsPrimed(currentFile.path || currentFile.name);
          const eventDetail = { filePath: currentFile.path, fileName: currentFile.name };
          window.dispatchEvent(new CustomEvent('priming-status-changed', { detail: eventDetail }));
          setTimeout(() => {
            window.dispatchEvent(new CustomEvent('priming-status-changed', { detail: eventDetail }));
          }, 100);
          
          // Close guided mode even on error
          try {
            setGlobalGuidedMode(false);
            removeActiveGuidedFlow(atomId);
          } catch (closeError) {
            console.error('U6 Approve: Error closing guided mode:', closeError);
          }
          onNext();
        }
      } else {
        // No project context - still close guided mode
        try {
          setGlobalGuidedMode(false);
          removeActiveGuidedFlow(atomId);
        } catch (closeError) {
          console.error('U6 Approve: Error closing guided mode:', closeError);
        }
        onNext();
      }
    } catch (err: any) {
      console.error('U6 Approve: Error:', err);
      setError(err.message || 'Failed to save and finalize changes');
      setSaving(false);
    }
  };

  if (loading) {
    return (
      <StageLayout title="" explanation="">
        <div className="text-center py-8">
          <Loader2 className="w-8 h-8 animate-spin text-[#458EE2] mx-auto" />
          <p className="mt-4 text-sm text-gray-600">Loading dataframe metadata...</p>
        </div>
      </StageLayout>
    );
  }

  if (error && columns.length === 0) {
    return (
      <StageLayout title="" explanation="">
        <div className="bg-red-50 border border-red-200 rounded-lg p-4">
          <p className="text-sm text-red-800">{error}</p>
        </div>
      </StageLayout>
    );
  }

  return (
    <StageLayout title="" explanation="">
      <div className="space-y-4">
        <div>
          <h4 className="text-lg font-semibold text-gray-900 mb-2">Dataframe Profiling (Verify details)</h4>
          <p className="text-sm text-gray-600">
            {currentFile?.name || 'No file selected'}
          </p>
        </div>

        {error && (
          <div className="bg-yellow-50 border border-yellow-200 rounded-lg p-3">
            <p className="text-xs text-yellow-800">{error}</p>
          </div>
        )}

        <div className="border border-gray-200 rounded-lg overflow-hidden">
          <div className="overflow-x-auto" style={{ maxHeight: '60vh', overflowY: 'auto' }}>
            <table className="w-full min-w-full">
              <thead className="bg-gradient-to-r from-blue-50 to-blue-100 sticky top-0 z-10">
                <tr>
                  <th className="px-3 py-2 text-left text-xs font-semibold text-gray-700 border-b border-gray-200">
                    Column Name
                  </th>
                  <th className="px-3 py-2 text-left text-xs font-semibold text-gray-700 border-b border-gray-200">
                    Rename
                  </th>
                  <th className="px-3 py-2 text-left text-xs font-semibold text-gray-700 border-b border-gray-200">
                    Current Type
                  </th>
                  <th className="px-3 py-2 text-left text-xs font-semibold text-gray-700 border-b border-gray-200">
                    Change Type
                  </th>
                  <th className="px-3 py-2 text-left text-xs font-semibold text-gray-700 border-b border-gray-200">
                    Missing Values
                  </th>
                  <th className="px-3 py-2 text-left text-xs font-semibold text-gray-700 border-b border-gray-200">
                    Strategy
                  </th>
                  <th className="px-3 py-2 text-left text-xs font-semibold text-gray-700 border-b border-gray-200">
                    Classification
                  </th>
                  <th className="px-3 py-2 text-left text-xs font-semibold text-gray-700 border-b border-gray-200">
                    Drop Column
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {columns.map((col, idx) => {
                  const dtypeOptions = getDtypeOptions(col.originalDtype);
                  const missingOptions = getMissingOptions(col.selectedDtype);
                  const hasMissingValues = col.missingCount > 0;
                  const inputsDisabled = col.dropColumn;

                  return (
                    <tr key={`col-${col.name}-${idx}`} className={col.dropColumn ? 'opacity-50' : ''}>
                      <td className="px-3 py-2 align-top">
                        <div>
                          <p className="font-medium text-xs text-gray-900">{col.newName}</p>
                          {col.sampleValues && col.sampleValues.length > 0 && (
                            <p className="text-xs text-gray-500 mt-0.5">
                              {col.sampleValues.slice(0, 5).join(', ')}
                              {col.sampleValues.length > 5 && '...'}
                            </p>
                          )}
                        </div>
                      </td>
                      <td className="px-3 py-2 align-top">
                        <Input
                          value={col.newName}
                          onChange={e => updateColumn(idx, { newName: e.target.value })}
                          className="h-7 text-xs"
                          placeholder="Rename column"
                          disabled={inputsDisabled}
                        />
                      </td>
                      <td className="px-3 py-2 align-top">
                        <span className={`inline-flex items-center rounded-full border px-2 py-0.5 text-[11px] font-semibold ${getDtypeBadgeColor(col.originalDtype)}`}>
                          {col.originalDtype}
                        </span>
                      </td>
                      <td className="px-3 py-2 align-top">
                        <div className={`space-y-2 ${inputsDisabled ? 'opacity-50 pointer-events-none' : ''}`}>
                          <Select
                            value={col.selectedDtype}
                            onValueChange={value => updateColumn(idx, { selectedDtype: value })}
                            disabled={inputsDisabled}
                          >
                            <SelectTrigger className="w-full h-7 text-xs">
                              <SelectValue placeholder="Select dtype" />
                            </SelectTrigger>
                            <SelectContent>
                              {dtypeOptions.map(opt => (
                                <SelectItem key={`dtype-${col.name}-${opt.value}`} value={opt.value}>
                                  {opt.label}
                                </SelectItem>
                              ))}
                            </SelectContent>
                          </Select>
                          {col.selectedDtype === 'datetime64' && (
                            <div className="space-y-1">
                              <Select
                                value={col.datetimeFormat || ''}
                                onValueChange={value => updateColumn(idx, { datetimeFormat: value })}
                                disabled={inputsDisabled}
                              >
                                <SelectTrigger className="w-full h-7 text-xs">
                                  <SelectValue placeholder="Select format" />
                                </SelectTrigger>
                                <SelectContent>
                                  {[
                                    { value: '%Y-%m-%d', label: '%Y-%m-%d (2024-12-31)' },
                                    { value: '%d/%m/%Y', label: '%d/%m/%Y (31/12/2024)' },
                                    { value: '%m/%d/%Y', label: '%m/%d/%Y (12/31/2024)' },
                                    { value: '%Y-%m-%d %H:%M:%S', label: '%Y-%m-%d %H:%M:%S' },
                                  ].map(opt => (
                                    <SelectItem key={`dt-format-${opt.value}`} value={opt.value}>
                                      {opt.label}
                                    </SelectItem>
                                  ))}
                                </SelectContent>
                              </Select>
                            </div>
                          )}
                        </div>
                      </td>
                      <td className="px-3 py-2 align-top">
                        {hasMissingValues ? (
                          <div className="flex items-center gap-1.5 text-xs">
                            <span className="inline-flex items-center rounded-full border border-red-300 text-red-600 px-2 py-0.5 text-[11px] font-semibold">
                              {col.missingCount}
                            </span>
                            <span className="text-gray-500">
                              ({col.missingPercentage.toFixed(1)}%)
                            </span>
                          </div>
                        ) : (
                          <span className="text-xs text-gray-500">None</span>
                        )}
                      </td>
                      <td className="px-3 py-2 align-top">
                        {hasMissingValues ? (
                          <div className={`space-y-1 ${inputsDisabled ? 'opacity-50 pointer-events-none' : ''}`}>
                            <Select
                              value={col.missingStrategy}
                              onValueChange={value => updateColumn(idx, { 
                                missingStrategy: value,
                                ...(value !== 'custom' ? { missingCustomValue: '' } : {})
                              })}
                              disabled={inputsDisabled}
                            >
                              <SelectTrigger className="w-full h-7 text-xs">
                                <SelectValue />
                              </SelectTrigger>
                              <SelectContent>
                                {missingOptions.map(opt => (
                                  <SelectItem key={`missing-${col.name}-${opt.value}`} value={opt.value}>
                                    {opt.label}
                                  </SelectItem>
                                ))}
                              </SelectContent>
                            </Select>
                            {col.missingStrategy === 'custom' && (
                              <Input
                                value={col.missingCustomValue}
                                onChange={e => updateColumn(idx, { missingCustomValue: e.target.value })}
                                placeholder="Custom value"
                                className="h-7 text-xs"
                                disabled={inputsDisabled}
                              />
                            )}
                          </div>
                        ) : (
                          <span className="text-xs text-gray-400">N/A</span>
                        )}
                      </td>
                      <td className="px-3 py-2 align-top">
                        <div className={`${inputsDisabled ? 'opacity-50 pointer-events-none' : ''}`}>
                          <Select
                            value={col.classification || 'unclassified'}
                            onValueChange={(value: 'identifiers' | 'measures' | 'unclassified') => 
                              updateColumn(idx, { classification: value })
                            }
                            disabled={inputsDisabled}
                          >
                            <SelectTrigger className={`w-full h-7 text-xs ${
                              col.classification === 'identifiers' ? 'text-blue-600 border-blue-300' :
                              col.classification === 'measures' ? 'text-green-600 border-green-300' :
                              'text-yellow-600 border-yellow-300'
                            }`}>
                              <SelectValue />
                            </SelectTrigger>
                            <SelectContent>
                              <SelectItem value="identifiers">Identifiers</SelectItem>
                              <SelectItem value="measures">Measures</SelectItem>
                              <SelectItem value="unclassified">Unclassified</SelectItem>
                            </SelectContent>
                          </Select>
                        </div>
                      </td>
                      <td className="px-3 py-2 align-top">
                        <label className="flex items-center gap-2 text-xs text-gray-700">
                          <input
                            type="checkbox"
                            className="h-4 w-4 accent-red-600"
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
                          />
                          Drop column
                        </label>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>

        <div className="flex justify-end gap-2 pt-4 border-t border-gray-200">
          <Button variant="outline" size="sm" onClick={onBack} disabled={saving}>
            Cancel
          </Button>
          <Button size="sm" onClick={handleSave} disabled={saving || loading || columns.length === 0}>
            {saving ? 'Saving…' : 'Approve'}
          </Button>
        </div>
      </div>
    </StageLayout>
  );
};
