import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { ArrowLeft, RotateCcw, CheckCircle2, ChevronDown, ChevronUp, XIcon, AlertCircle } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { useMetricGuidedFlow, type MetricStage, type MetricGuidedFlowState, type CreatedColumn, type CreatedTable, STEP_ORDER } from './useMetricGuidedFlow';
import { M0Type } from './stages/M0Type';
import { M1Dataset } from './stages/M1Dataset';
import { M2Operations, type M2OperationsRef } from './stages/M2Operations';
import { M3Preview } from './stages/M3Preview';
import { useLaboratoryStore } from '@/components/LaboratoryMode/store/laboratoryStore';
import { getActiveProjectContext } from '@/utils/projectEnv';
import { LABORATORY_API, CREATECOLUMN_API } from '@/lib/api';
import { resolveTaskResponse } from '@/lib/taskQueue';
import { useToast } from '@/hooks/use-toast';

interface MetricGuidedFlowInlineProps {
  /** Optional callback when the full flow completes on preview save */
  onComplete?: (result: {
    createdVariables: any[];
    createdColumns: any[];
    createdTables: any[];
  }) => void;
  /** Initial stage to start from (default: 'type') */
  initialStage?: MetricStage;
  /** Saved state to restore (for resuming) */
  savedState?: Partial<MetricGuidedFlowState>;
  /** Callback when flow should be closed (e.g. user cancels) */
  onClose?: () => void;
  /** Current metrics context atom (if any), used for dataset preselection */
  contextAtomId?: string;
}

const STAGE_COMPONENTS: Record<MetricStage, React.ComponentType<any>> = {
  type: M0Type,
  dataset: M1Dataset,
  operations: M2Operations,
  preview: M3Preview,
};

const STAGE_TITLES: Record<MetricStage, string> = {
  type: 'Select The Type Of Metric You Want To Create',
  dataset: 'Confirm Your Data Source',
  operations: 'Select Operation',
  preview: 'Preview ans Save Your Created Metrics',
};

const STAGE_ORDER: MetricStage[] = ['type', 'dataset', 'operations', 'preview'];

// Helper function to get the title for a stage, with conditional logic for operations stage
const getStageTitle = (stage: MetricStage, selectedType: string | null | undefined): string => {
  if (stage === 'operations') {
    if (!selectedType) {
      return 'Select Operation';
    } else if (selectedType === 'variable') {
      return 'Create new variable';
    } else if (selectedType === 'column') {
      return 'Create new columns by applying transformations on your dataset';
    }
  }
  return STAGE_TITLES[stage];
};

const getStageIndex = (stage: MetricStage): number => STAGE_ORDER.indexOf(stage);
const isStageCompleted = (stage: MetricStage, currentStage: MetricStage): boolean =>
  getStageIndex(stage) < getStageIndex(currentStage);

// Helper to convert preview data to CSV
const previewToCSV = (data: any[]): string => {
  if (!data.length) return '';
  const headers = Object.keys(data[0]);
  const rows = data.map(row => headers.map(h => JSON.stringify(row[h] ?? '')).join(','));
  return [headers.join(','), ...rows].join('\n');
};

export const MetricGuidedFlowInline: React.FC<MetricGuidedFlowInlineProps> = ({
  onComplete,
  initialStage,
  savedState,
  onClose,
  contextAtomId,
}) => {
  console.log('[MetricGuidedFlowInline] Component mounted/rendered', {
    initialStage,
    savedState,
    hasOnClose: !!onClose,
    contextAtomId,
  });
  
  const flow = useMetricGuidedFlow(savedState);
  const { state, goToNextStage, goToPreviousStage, restartFlow, goToStage, setState, restoreStageSnapshot } = flow;
  const { setActiveMetricGuidedFlow, closeMetricGuidedFlow } = useLaboratoryStore();
  const { toast } = useToast();

  // Refs to avoid excessive localStorage writes and keep last saved snapshot
  const prevStateStringRef = useRef<string>('');
  const isInitialMountRef = useRef(true);
  const saveTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const hasInitializedStageRef = useRef(false);

  const effectiveInitialStage = initialStage || 'type';

  // Stable snapshot string to detect meaningful changes
  const stateString = useMemo(
    () =>
      JSON.stringify({
        currentStage: state.currentStage,
        selectedType: state.selectedType,
        dataSource: state.dataSource,
        createdVariables: state.createdVariables,
        createdColumns: state.createdColumns,
        createdTables: state.createdTables,
      }),
    [
      state.currentStage,
      state.selectedType,
      state.dataSource,
      state.createdVariables,
      state.createdColumns,
      state.createdTables,
    ],
  );

  // Initialize currentStage from props once on mount only
  useEffect(() => {
    // Only initialize once on mount, not when navigating back to 'type'
    if (!hasInitializedStageRef.current && state.currentStage === 'type' && effectiveInitialStage !== 'type') {
      hasInitializedStageRef.current = true;
      goToStage(effectiveInitialStage);
    }
    // Only depend on effectiveInitialStage, not state.currentStage to prevent re-running on back navigation
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [effectiveInitialStage]);

  // Sync state into laboratory store and localStorage for trackers & persistence
  useEffect(() => {
    // Skip very first mount snapshot
    if (isInitialMountRef.current) {
      isInitialMountRef.current = false;
      prevStateStringRef.current = stateString;
      return;
    }
    
    if (stateString === prevStateStringRef.current) {
      // Nothing meaningful changed
      return;
    }

    prevStateStringRef.current = stateString;

    // Capture state values at the time this effect runs
    // (stateString changing guarantees these values have changed)
    const currentStage = state.currentStage;
    const selectedType = state.selectedType;
    const dataSource = state.dataSource;
    const createdVariables = state.createdVariables;
    const createdColumns = state.createdColumns;
    const createdTables = state.createdTables;

    // 1) Update laboratory store (drives GuidedWorkflowPanel & GuidedFlowStepTrackerPanel)
    setActiveMetricGuidedFlow(currentStage, {
      selectedType,
      dataSource,
      createdVariables,
      createdColumns,
      createdTables,
    });

    // 2) Persist to localStorage (mirrors MetricGuidedFlow.tsx logic)
    const projectContext = getActiveProjectContext();
    if (!projectContext) {
      return;
    }

    const metricFlowState = {
      currentStage,
      selectedType,
      dataSource,
      createdVariables,
      createdColumns,
      createdTables,
    };

    const key = `metric-guided-flow-${projectContext.client_name}-${projectContext.app_name}-${projectContext.project_name}`;

    // Debounce writes to avoid thrashing localStorage
    if (saveTimeoutRef.current) {
      clearTimeout(saveTimeoutRef.current);
    }
    saveTimeoutRef.current = setTimeout(() => {
      try {
        localStorage.setItem(key, JSON.stringify(metricFlowState));
      } catch {
        // Best-effort persistence; ignore quota errors
      }
      saveTimeoutRef.current = null;
    }, 300);
    // Note: state is intentionally not in dependencies to avoid infinite loops
    // stateString already tracks meaningful changes to the state fields we care about
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [stateString, setActiveMetricGuidedFlow]);

  // Cleanup timeout on unmount
  useEffect(() => {
    return () => {
      if (saveTimeoutRef.current) {
        clearTimeout(saveTimeoutRef.current);
      }
    };
  }, []);

  const canProceedFromStep = (step: MetricStage): boolean => {
    switch (step) {
      case 'type':
        return state.selectedType !== null;
      case 'dataset':
        return state.dataSource !== '';
      case 'operations':
        return (
          state.createdVariables.length > 0 ||
          state.createdColumns.length > 0 ||
          state.createdTables.length > 0
        );
      case 'preview':
        return true;
      default:
        return false;
    }
  };

  // Handler to save variables from preview stage
  const handleSaveFromPreview = useCallback(async () => {
    if (state.currentStage !== 'preview') return;
    
    const projectContext = getActiveProjectContext();
    if (!projectContext) {
      toast({
        title: 'Error',
        description: 'Project context not available. Please ensure you\'re in a valid project.',
        variant: 'destructive',
      });
      return;
    }

    const computeVars = state.createdVariables.filter(v => v.method === 'compute');
    const assignVars = state.createdVariables.filter(v => v.method === 'assign');

    // Reset pending state
    setPendingComputePayload(null);
    setPendingAssignPayload(null);
    setExistingVariableNames([]);

    try {
      const allExistingVariables: string[] = [];

      // Save computed variables
      if (computeVars.length > 0) {
        // Reconstruct operations from operationDetails
        const operations = computeVars
          .map((v, idx) => {
            const details = v.operationDetails || {};
            const numericalColumn = (details as any).column || '';
            const method = (details as any).operationMethod || 'sum';

            // Validate required fields
            if (!numericalColumn || !method) {
              console.warn(`[handleSaveFromPreview] Skipping variable ${v.name}: missing numericalColumn or method`, {
                numericalColumn,
                method,
                details,
              });
              return null;
            }

            const operation: any = {
              id: `op_${Date.now()}_${idx}`, // Generate unique ID
              numericalColumn: numericalColumn.trim(),
              method: method.trim(),
            };

            // Only include customName if it exists
            if ((details as any).customName && String((details as any).customName).trim()) {
              operation.customName = String((details as any).customName).trim();
            }

            // Handle secondColumn vs secondValue - only include one, and only if it exists
            // If secondColumn exists and is not empty, use it
            if ((details as any).secondColumn && String((details as any).secondColumn).trim()) {
              operation.secondColumn = String((details as any).secondColumn).trim();
              // Don't include secondValue if secondColumn is present
            } else if ((details as any).secondValue !== undefined && (details as any).secondValue !== null) {
              const secondVal = (details as any).secondValue;
              // Convert to number - handle both string and number types
              const numVal = typeof secondVal === 'number' ? secondVal : parseFloat(String(secondVal));
              if (!isNaN(numVal)) {
                operation.secondValue = numVal;
              }
              // Don't include secondColumn if secondValue is present
            }

            return operation;
          })
          .filter((op): op is any => op !== null); // Remove any null entries

        // Validate we have at least one valid operation
        if (operations.length === 0) {
          throw new Error('No valid operations found to save. Please check variable configurations.');
        }

        // Determine compute mode from first variable's operationDetails
        const firstVar = computeVars[0];
        const computeMode = (firstVar.operationDetails as any)?.groupBy && (firstVar.operationDetails as any).groupBy.length > 0 
          ? 'within-group' 
          : 'whole-dataframe';
        const identifiers = (firstVar.operationDetails as any)?.groupBy || [];

        const computePayload = {
          dataSource: state.dataSource,
          computeMode,
          identifiers: computeMode === 'within-group' ? identifiers : undefined,
          operations,
          clientName: projectContext.client_name,
          appName: projectContext.app_name,
          projectName: projectContext.project_name,
          preview: false, // Actually save this time
        };

        const computeResponse = await fetch(`${LABORATORY_API}/variables/compute`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          credentials: 'include',
          body: JSON.stringify(computePayload),
        });

        if (!computeResponse.ok) {
          const errorData = await computeResponse.json().catch(() => ({ error: 'Unknown error' }));
          throw new Error(errorData.error || `Failed to save computed variables: ${computeResponse.status}`);
        }

        const computeResult = await computeResponse.json();
        if (!computeResult.success) {
          // Check if this is an existing variables error
          if (computeResult.existingVariables && Array.isArray(computeResult.existingVariables)) {
            setPendingComputePayload(computePayload);
            allExistingVariables.push(...computeResult.existingVariables);
          } else {
            throw new Error(computeResult.error || 'Failed to save computed variables');
          }
        }
      }

      // Save assigned variables
      if (assignVars.length > 0) {
        const assignPayload = {
          assignments: assignVars.map(v => ({
            variableName: v.name,
            value: v.value || '',
          })),
          dataSource: state.dataSource,
          clientName: projectContext.client_name,
          appName: projectContext.app_name,
          projectName: projectContext.project_name,
        };

        const assignResponse = await fetch(`${LABORATORY_API}/variables/assign`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          credentials: 'include',
          body: JSON.stringify(assignPayload),
        });

        if (!assignResponse.ok) {
          const errorData = await assignResponse.json().catch(() => ({ error: 'Unknown error' }));
          throw new Error(errorData.error || `Failed to save assigned variables: ${assignResponse.status}`);
        }

        const assignResult = await assignResponse.json();
        if (!assignResult.success) {
          // Check if this is an existing variables error
          if (assignResult.existingVariables && Array.isArray(assignResult.existingVariables)) {
            setPendingAssignPayload(assignPayload);
            allExistingVariables.push(...assignResult.existingVariables);
          } else {
            throw new Error(assignResult.error || 'Failed to save assigned variables');
          }
        }
      }

      // If we have existing variables, show confirmation dialog
      if (allExistingVariables.length > 0) {
        setExistingVariableNames(allExistingVariables);
        setShowVariableOverwriteDialog(true);
        return; // Don't proceed to success - wait for user confirmation
      }

      // Success - call onComplete
      toast({
        title: 'Success',
        description: `Successfully saved ${state.createdVariables.length} variable(s).`,
      });

      onComplete?.({
        createdVariables: state.createdVariables,
        createdColumns: state.createdColumns,
        createdTables: state.createdTables,
      });

      // Close guided mode after successful save
      closeMetricGuidedFlow();
    } catch (error: any) {
      toast({
        title: 'Error',
        description: error.message || 'Failed to save variables. Please try again.',
        variant: 'destructive',
      });
    }
  }, [state, toast, onComplete, closeMetricGuidedFlow]);

  // State declarations for variable overwrite dialog - must be before handlers that use them
  const [showVariableOverwriteDialog, setShowVariableOverwriteDialog] = useState(false);
  const [existingVariableNames, setExistingVariableNames] = useState<string[]>([]);
  const [pendingComputePayload, setPendingComputePayload] = useState<any>(null);
  const [pendingAssignPayload, setPendingAssignPayload] = useState<any>(null);
  const [isSavingVariables, setIsSavingVariables] = useState(false);

  // Handler to confirm variable overwrite
  const handleConfirmVariableOverwrite = useCallback(async () => {
    setShowVariableOverwriteDialog(false);
    setIsSavingVariables(true);

    try {
      const projectContext = getActiveProjectContext();
      if (!projectContext) {
        toast({
          title: 'Error',
          description: 'Project context not available. Please ensure you\'re in a valid project.',
          variant: 'destructive',
        });
        setIsSavingVariables(false);
        return;
      }

      // Retry compute with confirmOverwrite if pending
      if (pendingComputePayload) {
        const computePayloadWithConfirm = { ...pendingComputePayload, confirmOverwrite: true };
        const computeResponse = await fetch(`${LABORATORY_API}/variables/compute`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          credentials: 'include',
          body: JSON.stringify(computePayloadWithConfirm),
        });

        if (!computeResponse.ok) {
          const errorData = await computeResponse.json().catch(() => ({ error: 'Unknown error' }));
          throw new Error(errorData.error || `Failed to save computed variables: ${computeResponse.status}`);
        }

        const computeResult = await computeResponse.json();
        if (!computeResult.success) {
          throw new Error(computeResult.error || 'Failed to save computed variables');
        }
      }

      // Retry assign with confirmOverwrite if pending
      if (pendingAssignPayload) {
        const assignPayloadWithConfirm = { ...pendingAssignPayload, confirmOverwrite: true };
        const assignResponse = await fetch(`${LABORATORY_API}/variables/assign`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          credentials: 'include',
          body: JSON.stringify(assignPayloadWithConfirm),
        });

        if (!assignResponse.ok) {
          const errorData = await assignResponse.json().catch(() => ({ error: 'Unknown error' }));
          throw new Error(errorData.error || `Failed to save assigned variables: ${assignResponse.status}`);
        }

        const assignResult = await assignResponse.json();
        if (!assignResult.success) {
          throw new Error(assignResult.error || 'Failed to save assigned variables');
        }
      }

      // Success - call onComplete
      toast({
        title: 'Success',
        description: `Successfully saved ${state.createdVariables.length} variable(s).`,
      });

      onComplete?.({
        createdVariables: state.createdVariables,
        createdColumns: state.createdColumns,
        createdTables: state.createdTables,
      });

      // Clear pending state
      setPendingComputePayload(null);
      setPendingAssignPayload(null);
      setExistingVariableNames([]);

      // Close guided mode after successful save
      closeMetricGuidedFlow();
    } catch (error: any) {
      toast({
        title: 'Error',
        description: error.message || 'Failed to save variables. Please try again.',
        variant: 'destructive',
      });
    } finally {
      setIsSavingVariables(false);
    }
  }, [pendingComputePayload, pendingAssignPayload, state, toast, onComplete, closeMetricGuidedFlow]);

  // Handler to cancel variable overwrite
  const handleCancelVariableOverwrite = useCallback(() => {
    setShowVariableOverwriteDialog(false);
    setPendingComputePayload(null);
    setPendingAssignPayload(null);
    setExistingVariableNames([]);
  }, []);

  // State declarations for save dialogs - must be before handlers that use them
  const [showOverwriteConfirmDialog, setShowOverwriteConfirmDialog] = useState(false);
  const [showSaveAsModal, setShowSaveAsModal] = useState(false);
  const [saveAsFileName, setSaveAsFileName] = useState('');
  const [isSavingColumnOperations, setIsSavingColumnOperations] = useState(false);

  // Define handleClose early so it can be used in save handlers
  const handleClose = useCallback(() => {
    // Clear localStorage persistence
    const projectContext = getActiveProjectContext();
    if (projectContext) {
      const key = `metric-guided-flow-${projectContext.client_name}-${projectContext.app_name}-${projectContext.project_name}`;
      try {
        localStorage.removeItem(key);
        console.log('[MetricGuidedFlowInline] Cleared localStorage key:', key);
      } catch (error) {
        console.warn('[MetricGuidedFlowInline] Failed to clear localStorage:', error);
      }
    }
    
    // Restart flow to clear all state
    restartFlow();
    
    // Call onClose callback to close the card and update store
    onClose?.();
  }, [onClose, restartFlow]);

  // Handler to show overwrite confirmation dialog
  const handleSaveColumnOperations = useCallback(() => {
    if (!state.previewColumnData) return;
    setShowOverwriteConfirmDialog(true);
  }, [state.previewColumnData]);

  // Confirm and save column operations (overwrite original)
  const confirmSaveColumnOperations = useCallback(async () => {
    if (!state.previewColumnData) return;
    
    setShowOverwriteConfirmDialog(false);
    setIsSavingColumnOperations(true);
    
    try {
      const csv_data = previewToCSV(state.previewColumnData.previewResults);
      let filename = state.previewColumnData.operationDetails.input_file;
      if (filename.endsWith('.arrow')) {
        filename = filename.replace('.arrow', '');
      }
      
      const projectContext = getActiveProjectContext();
      if (!projectContext) {
        toast({
          title: 'Error',
          description: 'Project context not available. Please ensure you\'re in a valid project.',
          variant: 'destructive',
        });
        return;
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
      
      // Create CreatedColumn entries for each operation
      const newColumns: CreatedColumn[] = state.previewColumnData.operationDetails.operations.map((op) => ({
        columnName: op.created_column_name || `${op.operation_type}_${op.columns.join('_')}`,
        tableName: state.dataSource,
        operations: [op.operation_type],
        objectName: savedFile,
        operationDetails: [{
          type: op.operation_type,
          columns: op.columns,
          method: undefined,
          identifiers: undefined,
          parameters: typeof op.param === 'object' && op.param !== null ? op.param : undefined,
        }],
      }));
      
      // Update state with created columns
      setState(prev => ({
        ...prev,
        createdColumns: [...prev.createdColumns, ...newColumns],
        previewColumnData: null, // Clear preview data after saving
      }));
      
      // Show success toast
      toast({
        title: 'Success',
        description: `Successfully created or modified ${newColumns.length} column(s).`,
      });
      
      // Call onComplete callback and close the flow
      onComplete?.({
        createdVariables: [],
        createdColumns: newColumns,
        createdTables: [],
      });
      
      // Close the flow
      handleClose();
    } catch (error: any) {
      toast({
        title: 'Error',
        description: error.message || 'Failed to save column operations.',
        variant: 'destructive',
      });
    } finally {
      setIsSavingColumnOperations(false);
    }
  }, [state, toast, setState, handleClose]);

  // Handler to show Save As modal
  const handleSaveAsColumnOperations = useCallback(() => {
    if (!state.previewColumnData) return;
    const defaultFilename = `createcolumn_${state.previewColumnData.operationDetails.input_file?.split('/')?.pop() || 'data'}_${Date.now()}`;
    setSaveAsFileName(defaultFilename);
    setShowSaveAsModal(true);
  }, [state.previewColumnData]);

  // Confirm and save column operations as new file
  const confirmSaveAsColumnOperations = useCallback(async () => {
    if (!state.previewColumnData || !saveAsFileName.trim()) return;
    
    setShowSaveAsModal(false);
    setIsSavingColumnOperations(true);
    
    try {
      const csv_data = previewToCSV(state.previewColumnData.previewResults);
      const filename = saveAsFileName.trim();
      
      const projectContext = getActiveProjectContext();
      if (!projectContext) {
        toast({
          title: 'Error',
          description: 'Project context not available. Please ensure you\'re in a valid project.',
          variant: 'destructive',
        });
        return;
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
      
      // Create CreatedTable entry
      const newTable: CreatedTable = {
        newTableName: filename.replace('.arrow', ''),
        originalTableName: state.dataSource,
        objectName: savedFile,
      };
      
      // Create CreatedColumn entries for each operation
      const newColumns: CreatedColumn[] = state.previewColumnData.operationDetails.operations.map((op) => ({
        columnName: op.created_column_name || `${op.operation_type}_${op.columns.join('_')}`,
        tableName: filename.replace('.arrow', ''),
        operations: [op.operation_type],
        objectName: savedFile,
        operationDetails: [{
          type: op.operation_type,
          columns: op.columns,
          method: undefined,
          identifiers: undefined,
          parameters: typeof op.param === 'object' && op.param !== null ? op.param : undefined,
        }],
      }));
      
      // Update state with created table and columns
      setState(prev => ({
        ...prev,
        createdTables: [...prev.createdTables, newTable],
        createdColumns: [...prev.createdColumns, ...newColumns],
        previewColumnData: null, // Clear preview data after saving
      }));
      
      // Show success toast
      toast({
        title: 'Success',
        description: `Successfully created or modified ${newColumns.length} column(s).`,
      });
      
      // Call onComplete callback and close the flow
      onComplete?.({
        createdVariables: [],
        createdColumns: newColumns,
        createdTables: [],
      });
      
      // Close the flow
      handleClose();
      
      // Reset modal state
      setSaveAsFileName('');
    } catch (error: any) {
      toast({
        title: 'Error',
        description: error.message || 'Failed to save column operations.',
        variant: 'destructive',
      });
    } finally {
      setIsSavingColumnOperations(false);
    }
  }, [state, toast, setState, saveAsFileName, handleClose]);

  const handleNext = useCallback(async () => {
    // Preview stage: Save variables to backend
    if (state.currentStage === 'preview') {
      await handleSaveFromPreview();
      return;
    }

    // Operations stage is handled separately with Continue button
    if (state.currentStage === 'operations') {
      // This should not be called for operations stage anymore
      // But keep as fallback for variable type
      if (state.selectedType === 'variable') {
        const canSave = m2OperationsRef.current?.canSaveVariable();
        const hasCreatedItems = 
          state.createdVariables.length > 0 ||
          state.createdColumns.length > 0 ||
          state.createdTables.length > 0;
        
        if (canSave && !hasCreatedItems && m2OperationsRef.current) {
          console.log('[MetricGuidedFlowInline] Auto-computing variable before proceeding');
          try {
            await m2OperationsRef.current.saveVariable();
            // Navigation will happen via useEffect in M2Operations after onVariableCreated
            return;
          } catch (error) {
            console.error('[MetricGuidedFlowInline] Error computing variable:', error);
            return;
          }
        }
      }
      
      // If we have created items, proceed normally
      if (!canProceedFromStep(state.currentStage)) {
        return;
      }
    } else {
      // For other stages, check normally
      if (!canProceedFromStep(state.currentStage)) {
        return;
      }
    }

    goToNextStage();
  }, [state, goToNextStage, handleSaveFromPreview, canProceedFromStep]);

  // Handlers for Save/Save As buttons in operations stage
  const handleSaveVariable = useCallback(async () => {
    if (!m2OperationsRef.current) return;
    console.log('[MetricGuidedFlowInline] Save Variable button clicked');
    try {
      await m2OperationsRef.current.saveVariable();
      // Navigation will happen via useEffect in M2Operations after onVariableCreated
    } catch (error) {
      console.error('[MetricGuidedFlowInline] Error saving variable:', error);
    }
  }, []);

  const handleSaveColumn = useCallback(() => {
    if (!m2OperationsRef.current) return;
    console.log('[MetricGuidedFlowInline] Save Column button clicked');
    m2OperationsRef.current.saveColumn();
    // Navigation will happen via useEffect in M2Operations after onColumnCreated (after confirmation dialog)
  }, []);

  const handleSaveColumnAs = useCallback(() => {
    if (!m2OperationsRef.current) return;
    console.log('[MetricGuidedFlowInline] Save Column As button clicked');
    m2OperationsRef.current.saveColumnAs();
    // Navigation will happen via useEffect in M2Operations after onTableCreated
  }, []);

  const handleContinueColumn = useCallback(async () => {
    if (!m2OperationsRef.current) return;
    console.log('[MetricGuidedFlowInline] Continue Column button clicked');
    setIsContinuingColumn(true);
    try {
      await m2OperationsRef.current.continueColumn();
      // Navigation will happen via onPreviewReady callback in M2Operations
    } catch (error) {
      console.error('[MetricGuidedFlowInline] Error continuing column operations:', error);
      // Error is already shown in MetricsColOps via toast
    } finally {
      setIsContinuingColumn(false);
    }
  }, []);

  const handleBack = useCallback(() => {
    if (state.currentStage === 'type') {
      onClose?.();
    } else {
      const currentIndex = STEP_ORDER.indexOf(state.currentStage);
      if (currentIndex <= 0) {
        return;
      }
      
      const previousStage = STEP_ORDER[currentIndex - 1];
      const currentStageBeforeNavigation = state.currentStage; // Capture the stage we're leaving
      
      // Restore snapshot for previous stage if it exists
      const restoredSnapshot = flow.restoreStageSnapshot(previousStage);
      
      // Reset changes made in current stage and restore previous stage state
      setState(prev => {
        // Determine what to reset based on current stage
        let resetFields: Partial<MetricGuidedFlowState> = {};
        switch (prev.currentStage) {
          case 'type':
            resetFields = {
              selectedType: null,
              createdVariables: [],
              createdColumns: [],
              createdTables: [],
            };
            break;
          case 'dataset':
            resetFields = {
              dataSource: '',
            };
            break;
          case 'operations':
            resetFields = {
              createdVariables: [],
              createdColumns: [],
              createdTables: [],
            };
            break;
          case 'preview':
            // When going back from preview, clear createdVariables and previewColumnData
            // The operationsState will restore the form state, and when user
            // clicks Continue again, all current variables will be sent fresh
            resetFields = {
              createdVariables: [],
              createdColumns: [],
              createdTables: [],
              previewColumnData: null,
            };
            break;
        }
        
        // If snapshot exists, restore it; otherwise use reset values
        if (restoredSnapshot) {
          // When coming back from preview, DON'T restore createdVariables from snapshot
          // (they'll be re-created when user clicks Continue again)
          const shouldClearCreatedItems = currentStageBeforeNavigation === 'preview';
          
          return {
            ...prev,
            ...resetFields,
            currentStage: previousStage,
            navigatedBackFrom: currentStageBeforeNavigation, // Set flag indicating where we came from
            selectedType: restoredSnapshot.selectedType,
            dataSource: restoredSnapshot.dataSource,
            // Only restore created items from snapshot if NOT coming from preview
            createdVariables: shouldClearCreatedItems ? [] : [...restoredSnapshot.createdVariables],
            createdColumns: shouldClearCreatedItems ? [] : [...restoredSnapshot.createdColumns],
            createdTables: shouldClearCreatedItems ? [] : [...restoredSnapshot.createdTables],
            operationsState: restoredSnapshot.operationsState ? { ...restoredSnapshot.operationsState } : null,
            previewColumnData: shouldClearCreatedItems ? null : (restoredSnapshot.previewColumnData ? { ...restoredSnapshot.previewColumnData } : null),
          };
        } else {
          // No snapshot exists, reset current stage and navigate back
          return {
            ...prev,
            ...resetFields,
            currentStage: previousStage,
            navigatedBackFrom: currentStageBeforeNavigation, // Set flag indicating where we came from
            operationsState: null, // Clear operations state if no snapshot
            previewColumnData: null, // Clear preview data if no snapshot
          };
        }
      });
    }
  }, [state.currentStage, onClose, flow, setState]);

  const handleRestart = useCallback(() => {
    console.log('[MetricGuidedFlowInline] Restart button clicked - resetting to initial state');
    // Clear localStorage persistence
    const projectContext = getActiveProjectContext();
    const storageKey = `metric-guided-flow-${projectContext.projectId || 'default'}`;
    localStorage.removeItem(storageKey);
    
    // Restart flow to clear all state and go back to type stage
    // restartFlow already clears snapshots internally
    restartFlow();
    
    // Ensure we're on the type stage (restartFlow already sets currentStage to 'type', but being explicit)
    goToStage('type');
    
    // Update store to reflect the reset state
    setActiveMetricGuidedFlow('type', {
      selectedType: null,
      dataSource: '',
      createdVariables: [],
      createdColumns: [],
      createdTables: [],
      currentStage: 'type',
    });
  }, [restartFlow, goToStage, setActiveMetricGuidedFlow]);

  // handleClose is already defined above, no need to redefine

  const CurrentStageComponent = STAGE_COMPONENTS[state.currentStage];
  const canGoBack = state.currentStage !== 'type';
  const isLastStage = state.currentStage === 'preview';

  // Track expanded/collapsed completed stages and current stage expansion
  const [expandedCompletedStages, setExpandedCompletedStages] = useState<Set<MetricStage>>(new Set());
  const [isCurrentExpanded, setIsCurrentExpanded] = useState(true);
  const stageRefs = useRef<Record<MetricStage, HTMLDivElement | null>>({} as Record<
    MetricStage,
    HTMLDivElement | null
  >);
  // Ref to access M2Operations save methods
  const m2OperationsRef = useRef<M2OperationsRef>(null);
  // State to track if operations can be saved (for button enablement)
  const [canSaveOperations, setCanSaveOperations] = useState(false);
  const [canSaveColumn, setCanSaveColumn] = useState(false);
  const [isSavingOperations, setIsSavingOperations] = useState(false);
  const [isContinuingColumn, setIsContinuingColumn] = useState(false);
  
  // Check if operations can be saved periodically when on operations stage
  useEffect(() => {
    if (state.currentStage !== 'operations') {
      setCanSaveOperations(false);
      setCanSaveColumn(false);
      setIsSavingOperations(false);
      return;
    }

    const checkCanSave = () => {
      const canSaveVar = m2OperationsRef.current?.canSaveVariable() || false;
      const canSaveCol = m2OperationsRef.current?.canSaveColumn() || false;
      const isSaving = m2OperationsRef.current?.isSaving() || false;
      
      if (canSaveVar !== canSaveOperations || canSaveCol !== canSaveColumn || isSaving !== isSavingOperations) {
        console.log('[MetricGuidedFlowInline] Operations canSave state changed:', {
          canSaveVar,
          canSaveCol,
          isSaving,
          hasCreatedItems: state.createdVariables.length > 0 || state.createdColumns.length > 0 || state.createdTables.length > 0,
        });
      }
      setCanSaveOperations(canSaveVar);
      setCanSaveColumn(canSaveCol);
      setIsSavingOperations(isSaving);
    };

    // Check immediately
    checkCanSave();

    // Check periodically while on operations stage
    const interval = setInterval(checkCanSave, 500);
    return () => clearInterval(interval);
  }, [state.currentStage, canSaveOperations, canSaveColumn, isSavingOperations, state.createdVariables.length, state.createdColumns.length, state.createdTables.length]);

  // Helper to check if column operations can continue (same as canSaveColumn)
  const canContinueColumn = useCallback(() => {
    return canSaveColumn;
  }, [canSaveColumn]);

  // Auto-scroll to current stage when it changes
  useEffect(() => {
    const currentStageElement = stageRefs.current[state.currentStage];
    if (currentStageElement) {
      setTimeout(() => {
        currentStageElement.scrollIntoView({
          behavior: 'smooth',
          block: 'start',
          inline: 'nearest',
        });
      }, 100);
    }
    // Whenever we change stages, expand the new current stage by default
    setIsCurrentExpanded(true);
  }, [state.currentStage]);

  const toggleCompletedStage = useCallback((stage: MetricStage) => {
    setExpandedCompletedStages(prev => {
      const next = new Set(prev);
      if (next.has(stage)) {
        next.delete(stage);
      } else {
        next.add(stage);
      }
      return next;
    });
  }, []);

  const renderStageItem = useCallback(
    (stage: MetricStage) => {
      const isCompleted = isStageCompleted(stage, state.currentStage);
      const isCurrent = stage === state.currentStage;
      const isUpcoming = !isCompleted && !isCurrent;
      const StageComponent = STAGE_COMPONENTS[stage];
      const isExpanded =
        (isCurrent && isCurrentExpanded) ||
        (!isCurrent && isCompleted && expandedCompletedStages.has(stage));

      let statusIcon: React.ReactNode;
      let headerBg = 'bg-white';
      let borderColor = 'border-gray-200';
      let headerTextColor = 'text-gray-900';

      if (isCompleted) {
        statusIcon = <CheckCircle2 className="w-5 h-5 text-green-600 flex-shrink-0" />;
        headerBg = 'bg-green-50';
        borderColor = 'border-green-200';
      } else if (isCurrent) {
        statusIcon = (
          <div className="w-6 h-6 rounded-full bg-blue-600 text-white flex items-center justify-center text-sm font-semibold flex-shrink-0">
            {getStageIndex(stage) + 1}
          </div>
        );
        headerBg = 'bg-blue-50';
        borderColor = 'border-blue-300';
      } else {
        statusIcon = (
          <div className="w-5 h-5 rounded-full border-2 border-dashed border-gray-300 flex-shrink-0" />
        );
        headerBg = 'bg-gray-50';
        borderColor = 'border-gray-200';
        headerTextColor = 'text-gray-500';
      }

      return (
        <div
          key={stage}
          ref={el => {
            if (el) {
              stageRefs.current[stage] = el;
            }
          }}
          className={`w-full min-w-0 overflow-hidden bg-white border-2 ${borderColor} rounded-lg shadow-sm mb-4 flex flex-col transition-all duration-200 ${
            isCurrent ? 'shadow-md' : ''
          }`}
        >
          {/* Stage Header */}
          {isCompleted ? (
            // Completed stages: clickable to expand/collapse
            <button
              onClick={() => toggleCompletedStage(stage)}
              className={`flex items-center justify-between px-6 py-4 border-b ${headerBg} hover:bg-opacity-80 transition-colors cursor-pointer w-full text-left`}
            >
              <div className="flex items-center gap-3">
                {statusIcon}
                <h3 className={`text-sm font-medium ${headerTextColor}`}>{getStageTitle(stage, state.selectedType)}</h3>
              </div>
              {isExpanded ? (
                <ChevronUp className="w-5 h-5 text-gray-500" />
              ) : (
                <ChevronDown className="w-5 h-5 text-gray-500" />
              )}
            </button>
          ) : isCurrent ? (
            // Current stage: also clickable to expand/collapse
            <button
              onClick={() => setIsCurrentExpanded(prev => !prev)}
              className={`flex items-center justify-between px-6 py-4 border-b ${headerBg} hover:bg-opacity-80 transition-colors cursor-pointer w-full text-left`}
            >
              <div className="flex items-center gap-3">
                {statusIcon}
                <h2 className={`text-sm font-medium ${headerTextColor}`}>{getStageTitle(stage, state.selectedType)}</h2>
              </div>
              {isExpanded ? (
                <ChevronUp className="w-5 h-5 text-gray-500" />
              ) : (
                <ChevronDown className="w-5 h-5 text-gray-500" />
              )}
            </button>
          ) : (
            // Upcoming stages: non-interactive (still show label)
            <div
              className={`flex items-center justify-between px-6 py-4 border-b ${headerBg} flex-shrink-0`}
            >
              <div className="flex items-center gap-3">
                {statusIcon}
                <h2 className={`text-sm font-medium ${headerTextColor}`}>{getStageTitle(stage, state.selectedType)}</h2>
              </div>
            </div>
          )}

          {/* Stage Content */}
          {isExpanded && (
            <div className="flex-1 overflow-y-auto overflow-x-hidden min-w-0">
              {isCurrent ? (
                <>
                  <div className="p-6">
                    {stage === 'preview' ? (
                      <StageComponent 
                        flow={flow} 
                        onSave={handleNext} 
                        onClose={handleClose}
                      />
                    ) : stage === 'operations' ? (
                      <StageComponent ref={m2OperationsRef} flow={flow} />
                    ) : stage === 'dataset' ? (
                      <StageComponent flow={flow} contextAtomId={contextAtomId} />
                    ) : (
                      <StageComponent flow={flow} />
                    )}
                  </div>
                  {/* Navigation Footer for current stage */}
                  <div className="flex items-center justify-between pt-4 px-6 pb-4 border-t bg-gray-50 flex-shrink-0">
                    <div className="flex gap-2">
                      {canGoBack && (
                        <Button
                          variant="outline"
                          onClick={handleBack}
                          className="flex items-center gap-2"
                        >
                          <ArrowLeft className="w-4 h-4" />
                          Back
                        </Button>
                      )}
                      {stage !== 'type' && <Button
                        variant="ghost"
                        onClick={handleRestart}
                        className="flex items-center gap-2 text-gray-600"
                      >
                        <RotateCcw className="w-4 h-4" />
                        Restart
                      </Button>}
                    </div>
                    <div className="flex gap-2">
                      {stage === 'preview' && (
                        <>
                          <Button variant="outline" onClick={handleClose}>
                            Discard
                          </Button>
                          {/* Show Save/Save As for column operations preview, otherwise show regular Save for variables */}
                          {state.previewColumnData ? (
                            <>
                              <Button
                                variant="outline"
                                onClick={handleSaveAsColumnOperations}
                                className="disabled:opacity-50 disabled:cursor-not-allowed"
                              >
                                Save As
                              </Button>
                              <Button
                                onClick={handleSaveColumnOperations}
                                className="bg-[#458EE2] hover:bg-[#3a7bc7] text-white disabled:opacity-50 disabled:cursor-not-allowed"
                              >
                                Save
                              </Button>
                            </>
                          ) : (
                            <Button
                              onClick={handleNext}
                              disabled={state.createdVariables.length === 0 && state.createdColumns.length === 0 && state.createdTables.length === 0}
                              className="bg-[#458EE2] hover:bg-[#3a7bc7] text-white disabled:opacity-50 disabled:cursor-not-allowed"
                            >
                              Save
                            </Button>
                          )}
                        </>
                      )}
                      {!isLastStage && stage === 'operations' ? (
                        // Operations stage: Show Continue button (computes with preview=true and navigates to preview)
                        state.selectedType === 'variable' ? (
                          // Variable type: Show Continue button (computes/assigns with preview)
                          <Button
                            onClick={handleNext}
                            disabled={!canSaveOperations || isSavingOperations}
                            className="bg-[#458EE2] hover:bg-[#3a7bc7] text-white disabled:opacity-50 disabled:cursor-not-allowed"
                          >
                            {isSavingOperations ? 'Computing...' : 'Continue'}
                          </Button>
                        ) : state.selectedType === 'column' ? (
                          // Column type: Show Continue button (performs operations and navigates to preview)
                          <Button
                            onClick={handleContinueColumn}
                            disabled={!canContinueColumn() || isContinuingColumn}
                            className="bg-[#458EE2] hover:bg-[#3a7bc7] text-white disabled:opacity-50 disabled:cursor-not-allowed"
                          >
                            {isContinuingColumn ? 'Computing...' : 'Continue'}
                          </Button>
                        ) : (
                          // Fallback: Show Continue button if type not set
                          <Button
                            onClick={handleNext}
                            disabled={!canProceedFromStep(stage)}
                            className="bg-[#458EE2] hover:bg-[#3a7bc7] text-white disabled:opacity-50 disabled:cursor-not-allowed"
                          >
                            Continue
                          </Button>
                        )
                      ) : !isLastStage ? (
                        // Other stages: Show Continue button
                        <Button
                          onClick={handleNext}
                          disabled={!canProceedFromStep(stage)}
                          className="bg-[#458EE2] hover:bg-[#3a7bc7] text-white disabled:opacity-50 disabled:cursor-not-allowed"
                        >
                          Continue
                        </Button>
                      ) : null}
                    </div>
                  </div>
                </>
              ) : isCompleted && isExpanded ? (
                <div className="p-6 bg-gray-50 opacity-70">
                  {stage === 'preview' ? (
                    <StageComponent 
                      flow={flow} 
                      onSave={() => {}} 
                      onClose={handleClose}
                      readOnly={true}
                    />
                  ) : stage === 'operations' ? (
                    <StageComponent ref={m2OperationsRef} flow={flow} readOnly={true} />
                  ) : stage === 'dataset' ? (
                    <StageComponent flow={flow} contextAtomId={contextAtomId} readOnly={true} />
                  ) : (
                    <StageComponent flow={flow} readOnly={true} />
                  )}
                </div>
              ) : null}
            </div>
          )}
        </div>
      );
    },
    [
      state.currentStage,
      state.selectedType,
      expandedCompletedStages,
      flow,
      handleNext,
      handleBack,
      handleRestart,
      handleClose,
      handleSaveVariable,
      handleSaveColumn,
      handleSaveColumnAs,
      handleContinueColumn,
      canContinueColumn,
      handleSaveColumnOperations,
      handleSaveAsColumnOperations,
      confirmSaveColumnOperations,
      confirmSaveAsColumnOperations,
      canGoBack,
      toggleCompletedStage,
      isLastStage,
      canSaveOperations,
      canSaveColumn,
      isSavingOperations,
      isContinuingColumn,
      canProceedFromStep,
    ],
  );

  return (
    <Card className="w-full min-w-0 overflow-hidden bg-white border-2 border-gray-200 rounded-lg shadow-sm p-6">
      <div className="w-full flex flex-col">
        {/* Header describing the inline metric workflow */}
        <div className="mb-4 px-1 flex items-center justify-between">
          <h2 className="text-lg font-semibold text-gray-900">
          Follow these steps to build and review your Metrics
          </h2>
          <button onClick={handleClose} className="text-sm text-gray-600">
            <XIcon className="w-4 h-4" />
          </button>
        </div>
        {/* Render all stages in sequence (Shopify-style), mirroring GuidedUploadFlowInline */}
        {STAGE_ORDER.map(stage => renderStageItem(stage))}
      </div>

      {/* Overwrite Confirmation Dialog */}
      <Dialog open={showOverwriteConfirmDialog} onOpenChange={setShowOverwriteConfirmDialog}>
        <DialogContent className="sm:max-w-[500px]">
          <DialogHeader>
            <DialogTitle>Confirm Overwrite</DialogTitle>
          </DialogHeader>
          <div className="py-4">
            <div className="flex items-start gap-3">
              <AlertCircle className="w-5 h-5 text-yellow-500 mt-0.5 flex-shrink-0" />
              <div>
                <p className="text-sm text-gray-700 mb-2">
                  Are you sure you want to save the changes to the original file?
                </p>
                <p className="text-sm font-medium text-gray-900 mb-1">
                  File: {state.previewColumnData?.operationDetails.input_file || 'Unknown'}
                </p>
                <p className="text-xs text-gray-600">
                  This action will overwrite the original file and cannot be undone.
                </p>
              </div>
            </div>
          </div>
          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => setShowOverwriteConfirmDialog(false)}
              disabled={isSavingColumnOperations}
            >
              Cancel
            </Button>
            <Button
              onClick={confirmSaveColumnOperations}
              disabled={isSavingColumnOperations}
              className="bg-green-600 hover:bg-green-700 text-white"
            >
              {isSavingColumnOperations ? 'Saving...' : 'Yes, Save Changes'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Save As Dialog */}
      <Dialog open={showSaveAsModal} onOpenChange={setShowSaveAsModal}>
        <DialogContent className="sm:max-w-[500px]">
          <DialogHeader>
            <DialogTitle>Save DataFrame</DialogTitle>
          </DialogHeader>
          <div className="py-4">
            <div className="space-y-2">
              <label className="text-sm font-medium text-gray-700">Filename</label>
              <Input
                value={saveAsFileName}
                onChange={(e) => setSaveAsFileName(e.target.value)}
                placeholder="Enter filename"
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
              disabled={isSavingColumnOperations}
            >
              Cancel
            </Button>
            <Button
              onClick={confirmSaveAsColumnOperations}
              disabled={isSavingColumnOperations || !saveAsFileName.trim()}
              className="bg-blue-600 hover:bg-blue-700 text-white"
            >
              {isSavingColumnOperations ? 'Saving...' : 'Save'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Variable Overwrite Confirmation Dialog */}
      <Dialog 
        open={showVariableOverwriteDialog} 
        onOpenChange={(open) => {
          if (!open) {
            handleCancelVariableOverwrite();
          }
        }}
      >
        <DialogContent className="sm:max-w-[500px]">
          <DialogHeader>
            <DialogTitle>Overwrite Existing Variables?</DialogTitle>
          </DialogHeader>
          <div className="py-4">
            <div className="flex items-start gap-3">
              <AlertCircle className="w-5 h-5 text-yellow-500 mt-0.5 flex-shrink-0" />
              <div className="flex-1">
                <p className="text-sm text-gray-700 mb-2">
                  The following variable(s) already exist and will be overwritten:
                </p>
                <ul className="list-disc list-inside text-sm text-gray-700 mt-2 max-h-40 overflow-y-auto">
                  {existingVariableNames.map((varName, idx) => (
                    <li key={idx} className="truncate" title={varName}>
                      {varName}
                    </li>
                  ))}
                </ul>
                <p className="text-sm text-gray-600 mt-2">
                  Are you sure you want to continue?
                </p>
              </div>
            </div>
          </div>
          <DialogFooter>
            <Button
              variant="outline"
              onClick={handleCancelVariableOverwrite}
              disabled={isSavingVariables}
            >
              Cancel
            </Button>
            <Button
              onClick={handleConfirmVariableOverwrite}
              disabled={isSavingVariables}
              className="bg-red-600 hover:bg-red-700 text-white"
            >
              {isSavingVariables ? 'Saving...' : 'Overwrite'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </Card>
  );
};

