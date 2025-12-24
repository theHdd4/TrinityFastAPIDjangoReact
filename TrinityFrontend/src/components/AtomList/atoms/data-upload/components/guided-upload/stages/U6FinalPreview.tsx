import React, { useState, useEffect, useRef } from 'react';
import { Loader2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { UPLOAD_API, VALIDATE_API, CLASSIFIER_API } from '@/lib/api';
import { StageLayout } from '../components/StageLayout';
import type { ReturnTypeFromUseGuidedUploadFlow } from '../useGuidedUploadFlow';
import { getActiveProjectContext } from '@/utils/projectEnv';
import { useGuidedFlowPersistence } from '@/components/LaboratoryMode/hooks/useGuidedFlowPersistence';
import { useGuidedFlowFootprints } from '@/components/LaboratoryMode/hooks/useGuidedFlowFootprints';
import { useLaboratoryStore } from '@/components/LaboratoryMode/store/laboratoryStore';

// Helper to extract filename from path
const getFileName = (path: string): string => {
  const parts = path.split('/');
  return parts[parts.length - 1] || path;
};

interface U6FinalPreviewProps {
  flow: ReturnTypeFromUseGuidedUploadFlow;
  onNext: () => void;
  onBack: () => void;
  onGoToStage?: (stage: 'U5' | 'U4' | 'U3') => void;
  isMaximized?: boolean;
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

export const U6FinalPreview: React.FC<U6FinalPreviewProps> = ({ flow, onNext, onBack, isMaximized = false }) => {
  const { state, setColumnNameEdits, setDataTypeSelections, setMissingValueStrategies } = flow;
  const { uploadedFiles, selectedFileIndex, columnNameEdits, dataTypeSelections, missingValueStrategies } = state;
  const chosenIndex = selectedFileIndex !== undefined && selectedFileIndex < uploadedFiles.length ? selectedFileIndex : 0;
  const currentFile = uploadedFiles[chosenIndex];
  
  // CRITICAL: Log the currentFile path immediately to see if it's correct
  if (currentFile) {
    console.log('🔍 [U6FinalPreview] currentFile from uploadedFiles:', {
      name: currentFile.name,
      path: currentFile.path,
      fullFile: currentFile,
      allUploadedFiles: uploadedFiles.map(f => ({ name: f.name, path: f.path }))
    });
  }
  
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
  const { trackEvent } = useGuidedFlowFootprints();
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
    // Track priming action
    trackEvent({
      event_type: 'click',
      stage: 'U6',
      action: 'priming_save',
      target: 'save_button',
      details: {
        file_name: currentFile?.name,
      },
    }, { immediate: true });
    if (!currentFile) return;

    setSaving(true);
    setError('');

    try {
      // Build instructions array exactly like Direct Review mode does
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

      // Extract identifiers and measures exactly like Direct Review mode does
      // After processing, columns will have their new names, so use newName (final name after rename)
      const identifiers = columns
        .filter(c => !c.dropColumn && c.classification === 'identifiers')
        .map(c => {
          // If column was renamed, use newName (final name), otherwise use original name
          const finalName = c.newName && c.newName.trim() && c.newName !== c.name ? c.newName.trim() : c.name;
          return finalName;
        });
      const measures = columns
        .filter(c => !c.dropColumn && c.classification === 'measures')
        .map(c => {
          // If column was renamed, use newName (final name), otherwise use original name
          const finalName = c.newName && c.newName.trim() && c.newName !== c.name ? c.newName.trim() : c.name;
          return finalName;
        });

      const hasProcessingChanges = instructions.length > 0;
      const canSaveClassifications = columns.length > 0;

      if (!hasProcessingChanges && !canSaveClassifications) {
        setError('No changes detected. Adjust at least one column before saving.');
        setSaving(false);
        return;
      }

      // CRITICAL: Extract and validate the exact MinIO path ONCE at the start
      // This path will be used for ALL operations (processing, classification, status updates)
      // For Excel sheets in folders, this should be: "Quant Matrix AI/blank/New Custom Project/folder_name/sheets/Sheet1.arrow"
      let exactMinIOPath = currentFile.path || '';
      
      // CRITICAL DIAGNOSIS: Log the path we're about to use to diagnose path issues
      console.error('🔴 [U6FinalPreview] DIAGNOSIS - currentFile.path at save time:', {
        path: exactMinIOPath,
        name: currentFile.name,
        segmentCount: exactMinIOPath.split('/').filter(s => s.length > 0).length,
        expectedSegmentCount: '>= 6 for Excel sheets in folders (client/app/project/folder/sheets/file.arrow)',
        fullCurrentFile: currentFile,
        allUploadedFiles: uploadedFiles.map(f => ({ name: f.name, path: f.path }))
      });
      
      if (!exactMinIOPath) {
        throw new Error('File path is missing - cannot save dataframe');
      }

      // Process dataframe if there are changes (exactly like Direct Review mode)
      // CRITICAL: Use the exact MinIO path from currentFile.path (includes full folder structure)
      // This ensures files in subfolders (like folder_name/sheets/Sheet1.arrow) stay in the same location
      if (hasProcessingChanges) {
        
        console.log('🔧 [U6FinalPreview] Processing dataframe with path:', exactMinIOPath);
        console.log('🔧 [U6FinalPreview] Current file object:', { name: currentFile.name, path: currentFile.path, fullFile: currentFile });
        
        // CRITICAL CHECK: Detect if file is from an Excel folder structure
        // Excel folders have structure: client/app/project/folder_name/sheets/sheet_name.arrow
        const pathSegments = exactMinIOPath.split('/').filter(s => s.length > 0);
        const isExcelFolderFile = pathSegments.length >= 5 && pathSegments[pathSegments.length - 3] === 'sheets';
        const isInFolderStructure = pathSegments.length >= 4; // At least client/app/project/filename or client/app/project/folder/filename
        
        console.log('🔍 [U6FinalPreview] Path analysis:', {
          path: exactMinIOPath,
          segments: pathSegments,
          segmentCount: pathSegments.length,
          isExcelFolderFile,
          isInFolderStructure,
          lastThreeSegments: pathSegments.slice(-3)
        });
        
        // If file is from an Excel folder, ensure we preserve the exact folder structure
        if (isExcelFolderFile) {
          // File is in: client/app/project/folder_name/sheets/sheet_name.arrow
          // Verify the path structure is correct
          const folderName = pathSegments[pathSegments.length - 3]; // Should be the folder name before 'sheets'
          const sheetName = pathSegments[pathSegments.length - 1]; // The .arrow file
          
          if (pathSegments[pathSegments.length - 2] !== 'sheets') {
            console.error('❌ [U6FinalPreview] Invalid Excel folder structure - expected "sheets" directory:', pathSegments);
            throw new Error(`Invalid Excel folder structure in path: ${exactMinIOPath}`);
          }
          
          console.log('✅ [U6FinalPreview] Detected Excel folder file - preserving folder structure:', {
            folderName,
            sheetName,
            fullPath: exactMinIOPath
          });
        } else if (isInFolderStructure) {
          // File is in a folder but not an Excel folder structure
          console.log('✅ [U6FinalPreview] Detected file in folder structure - preserving path:', exactMinIOPath);
        } else {
          // File is at root level (client/app/project/filename.arrow)
          console.warn('⚠️ [U6FinalPreview] File appears to be at root level (not in folder):', exactMinIOPath);
        }
        
        // Use the exact path as-is - backend will overwrite at this exact location
        console.log('📤 [U6FinalPreview] Sending process_saved_dataframe request with object_name:', exactMinIOPath);
        const res = await fetch(`${VALIDATE_API}/process_saved_dataframe`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          credentials: 'include',
          body: JSON.stringify({
            object_name: exactMinIOPath, // Use exact MinIO path - file will be overwritten in-place at this exact location
            instructions,
          }),
        });

        if (!res.ok) {
          const data = await res.json().catch(() => null);
          const detail = data?.detail || (typeof data === 'string' ? data : '');
          throw new Error(detail || 'Failed to process dataframe');
        }
      }

      // Save classification config (exactly like Direct Review mode)
      const projectContext = getActiveProjectContext();
      if (projectContext) {
        const stored = localStorage.getItem('current-project');
        const envStr = localStorage.getItem('env');
        const project = stored ? JSON.parse(stored) : {};
        const env = envStr ? JSON.parse(envStr) : {};
        // CRITICAL: Use exact MinIO path for classification save (same as process_saved_dataframe)
        // This ensures the classification is saved for the exact file location in MinIO
        // IMPORTANT: exactMinIOPath is already declared at function scope level above - use that same variable
        // This ensures consistency across all operations (processing, classification, status updates)
        console.log('🔧 [U6FinalPreview] Saving classification config with exact MinIO path:', exactMinIOPath);

        const payload: Record<string, any> = {
          project_id: project.id || null,
          client_name: env.CLIENT_NAME || '',
          app_name: env.APP_NAME || '',
          project_name: env.PROJECT_NAME || '',
          identifiers,
          measures,
          dimensions: {},
        };
        if (exactMinIOPath) {
          payload.file_name = exactMinIOPath; // Use exact MinIO path for classification save
        }

        const saveRes = await fetch(`${CLASSIFIER_API}/save_config`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(payload),
          credentials: 'include',
        });

        if (saveRes.ok) {
          // Mark file as primed (exactly like Direct Review mode)
          // CRITICAL: Use exact MinIO path for all status updates to ensure UI matches the actual file location
          // This MUST be the same path used for process_saved_dataframe to ensure files in folders stay in folders
          if (exactMinIOPath) {
            // Final verification: ensure path contains folder structure if it should
            const pathSegments = exactMinIOPath.split('/').filter(s => s.length > 0);
            const isExcelFolderFile = pathSegments.length >= 5 && pathSegments[pathSegments.length - 3] === 'sheets';
            
            if (isExcelFolderFile) {
              console.log('✅ [U6FinalPreview] Confirmed: File is from Excel folder, using exact path:', exactMinIOPath);
              console.log('✅ [U6FinalPreview] Path segments:', pathSegments);
            } else {
              console.log('ℹ️ [U6FinalPreview] File path (may or may not be in folder):', exactMinIOPath);
            }
            
            console.log('✅ [U6FinalPreview] Marking file as primed with exact MinIO path:', exactMinIOPath);
            await markFileAsPrimed(exactMinIOPath);
            window.dispatchEvent(
              new CustomEvent('dataframe-saved', {
                detail: { filePath: exactMinIOPath, fileName: exactMinIOPath },
              })
            );
            window.dispatchEvent(
              new CustomEvent('priming-status-changed', {
                detail: { filePath: exactMinIOPath, fileName: exactMinIOPath },
              })
            );
            window.dispatchEvent(
              new CustomEvent('force-refresh-priming-status', {
                detail: { objectName: exactMinIOPath, isPrimed: true },
              })
            );
            console.log('✅ [U6FinalPreview] File marked as primed and events dispatched for:', exactMinIOPath);
          } else {
            console.error('❌ [U6FinalPreview] Cannot mark file as primed - path is missing!');
          }

          // After successful save, update col.name to col.newName for all renamed columns
          // This makes the renamed value become the new "original" name
          setColumns(prev => prev.map(col => {
            const trimmedNewName = col.newName?.trim();
            if (trimmedNewName && trimmedNewName !== col.name) {
              return { ...col, name: trimmedNewName };
            }
            return col;
          }));

          // Close guided mode (exactly like Direct Review mode calls onClose)
          setSaving(false);
          setTimeout(() => {
            try {
              setGlobalGuidedMode(false);
              removeActiveGuidedFlow(atomId);
            } catch (closeError) {
              console.error('U6 Approve: Error closing guided mode:', closeError);
            }
            onNext();
          }, 100);
        } else {
          throw new Error('Failed to save configuration');
        }
      }
    } catch (err: any) {
      console.error('U6 Approve: Error:', err);
      setError(err.message || 'Failed to save changes');
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

        {/* Column Table - Using same compact format as U3/U4 */}
        <div className="border border-gray-200 rounded-lg overflow-hidden">
          <div 
            className="overflow-x-auto" 
            style={{ 
              maxHeight: isMaximized ? 'calc(100vh - 300px)' : '8.75rem',
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
              <thead className="sticky top-0 z-10 bg-gradient-to-r from-blue-50 to-blue-100">
                <tr className="bg-gradient-to-r from-blue-50 to-blue-100" style={{ height: '1.75rem' }}>
                  <th className="px-0.5 py-0 text-left font-medium text-gray-900 border border-gray-300 text-[10px] leading-tight bg-gradient-to-r from-blue-50 to-blue-100 whitespace-nowrap overflow-hidden">
                    <div className="truncate">
                      Column Name
                    </div>
                  </th>
                  <th className="px-0.5 py-0 text-left font-medium text-gray-900 border border-gray-300 text-[10px] leading-tight bg-gradient-to-r from-blue-50 to-blue-100 whitespace-nowrap overflow-hidden">
                    <div className="truncate">
                      Rename
                    </div>
                  </th>
                  <th className="px-0.5 py-0 text-left font-medium text-gray-900 border border-gray-300 text-[10px] leading-tight bg-gradient-to-r from-blue-50 to-blue-100 whitespace-nowrap overflow-hidden">
                    <div className="truncate">
                      Current Type
                    </div>
                  </th>
                  <th className="px-0.5 py-0 text-left font-medium text-gray-900 border border-gray-300 text-[10px] leading-tight bg-gradient-to-r from-blue-50 to-blue-100 whitespace-nowrap overflow-hidden">
                    <div className="truncate">
                      Change Type
                    </div>
                  </th>
                  <th className="px-0.5 py-0 text-left font-medium text-gray-900 border border-gray-300 text-[10px] leading-tight bg-gradient-to-r from-blue-50 to-blue-100 whitespace-nowrap overflow-hidden">
                    <div className="truncate">
                      Missing
                    </div>
                  </th>
                  <th className="px-0.5 py-0 text-left font-medium text-gray-900 border border-gray-300 text-[10px] leading-tight bg-gradient-to-r from-blue-50 to-blue-100 whitespace-nowrap overflow-hidden">
                    <div className="truncate">
                      Strategy
                    </div>
                  </th>
                  <th className="px-0.5 py-0 text-left font-medium text-gray-900 border border-gray-300 text-[10px] leading-tight bg-gradient-to-r from-blue-50 to-blue-100 whitespace-nowrap overflow-hidden">
                    <div className="truncate">
                      Classification
                    </div>
                  </th>
                  <th className="px-0.5 py-0 text-left font-medium text-gray-900 border border-gray-300 text-[10px] leading-tight bg-gradient-to-r from-blue-50 to-blue-100 whitespace-nowrap overflow-hidden">
                    <div className="truncate">
                      Drop
                    </div>
                  </th>
                </tr>
              </thead>
              <tbody>
                {columns.map((col, idx) => {
                  const dtypeOptions = getDtypeOptions(col.originalDtype);
                  const missingOptions = getMissingOptions(col.selectedDtype);
                  const hasMissingValues = col.missingCount > 0;
                  const inputsDisabled = col.dropColumn;

                  // Build unique sample values preview (match behavior from U3/U4 tables)
                  const uniqueSampleValues = Array.from(new Set(col.sampleValues || []));
                  const maxSampleValues = isMaximized ? 20 : 5;
                  const previewSampleValues = uniqueSampleValues.slice(0, maxSampleValues).join(', ');
                  const fullSampleValuesText = uniqueSampleValues.join(', ');

                  return (
                    <tr
                      key={`col-${col.name}-${idx}`}
                      className={col.dropColumn ? 'bg-gray-50 opacity-60 hover:bg-gray-50' : 'hover:bg-gray-50'}
                      style={{ height: '1.75rem' }}
                    >
                      <td className="px-0.5 py-0 border border-gray-300 text-[10px] leading-tight whitespace-nowrap overflow-hidden" title={col.name}>
                        <div className="truncate">
                          <div className="text-gray-700 text-[10px] leading-tight truncate">
                            {col.name}
                          </div>
                          {uniqueSampleValues.length === 0 ? (
                            <div className="text-gray-400 text-[9px] leading-tight truncate">No samples</div>
                          ) : (
                            <div 
                              className="text-gray-500 text-[9px] leading-tight truncate" 
                              title={fullSampleValuesText}
                            >
                              {previewSampleValues}
                              {uniqueSampleValues.length > maxSampleValues && '...'}
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
