import React, { useRef, useEffect, useImperativeHandle, forwardRef } from 'react';
import { StageLayout } from '../components/StageLayout';
import type { ReturnTypeFromUseMetricGuidedFlow } from '../useMetricGuidedFlow';
import OperationsTab, { OperationsTabRef } from './OperationsTab';

interface M2OperationsProps {
  flow: ReturnTypeFromUseMetricGuidedFlow;
  readOnly?: boolean;
}

export interface M2OperationsRef {
  saveVariable: () => Promise<void>;
  saveColumn: () => void;
  saveColumnAs: () => void;
  canSaveVariable: () => boolean;
  canSaveColumn: () => boolean;
  isSaving: () => boolean;
}

export const M2Operations = forwardRef<M2OperationsRef, M2OperationsProps>(({ flow, readOnly = false }, ref) => {
  const { state, setState, goToStage } = flow;
  const operationsTabRef = useRef<OperationsTabRef>(null);
  const hasNavigatedRef = useRef(false);

  // Expose save methods to parent component
  useImperativeHandle(ref, () => ({
    saveVariable: async () => {
      if (operationsTabRef.current) {
        await operationsTabRef.current.saveVariable();
      }
    },
    saveColumn: () => {
      if (operationsTabRef.current) {
        operationsTabRef.current.saveColumn();
      }
    },
    saveColumnAs: () => {
      if (operationsTabRef.current) {
        operationsTabRef.current.saveColumnAs();
      }
    },
    canSaveVariable: () => {
      if (operationsTabRef.current) {
        return operationsTabRef.current.canSaveVariable();
      }
      return false;
    },
    canSaveColumn: () => {
      if (operationsTabRef.current) {
        return operationsTabRef.current.canSaveColumn();
      }
      return false;
    },
    isSaving: () => {
      if (operationsTabRef.current) {
        return operationsTabRef.current.isSaving();
      }
      return false;
    },
  }), []);

  // Check if we navigated back from preview - if so, disable auto-navigation
  // This uses the explicit navigatedBackFrom flag set by handleBack
  useEffect(() => {
    // If we navigated back from preview, disable auto-navigation
    if (state.navigatedBackFrom === 'preview' && state.currentStage === 'operations') {
      console.log('[M2Operations] User navigated back from preview, disabling auto-navigation');
      hasNavigatedRef.current = true;
      
      // Clear the navigatedBackFrom flag after processing
      setState(prev => ({
        ...prev,
        navigatedBackFrom: null,
      }));
    }
    
    // Reset navigation flag when stage changes away from operations
    if (state.currentStage !== 'operations') {
      hasNavigatedRef.current = false;
    }
  }, [state.currentStage, state.navigatedBackFrom, setState]);

  // Auto-navigate to preview after column/table/variable is created
  // Only auto-navigate if we haven't already navigated AND we're not coming back from preview
  useEffect(() => {
    // Don't auto-navigate if we're not on operations stage
    if (state.currentStage !== 'operations') {
      return;
    }
    
    const hasCreatedItems = 
      state.createdVariables.length > 0 ||
      state.createdColumns.length > 0 ||
      state.createdTables.length > 0;
    
    // Only auto-navigate if:
    // 1. We have created items
    // 2. We're on operations stage (already checked above)
    // 3. We haven't already auto-navigated (hasNavigatedRef is set to true when coming back from preview)
    if (hasCreatedItems && !hasNavigatedRef.current) {
      console.log('[M2Operations] Created items detected, auto-navigating to preview', {
        variables: state.createdVariables.length,
        columns: state.createdColumns.length,
        tables: state.createdTables.length,
        currentStage: state.currentStage,
        hasNavigated: hasNavigatedRef.current,
      });
      hasNavigatedRef.current = true;
      // Small delay to ensure state is fully updated and user sees the success
      setTimeout(() => {
        console.log('[M2Operations] Navigating to preview stage');
        goToStage('preview');
      }, 500);
    }
  }, [state.createdVariables.length, state.createdColumns.length, state.createdTables.length, state.currentStage, goToStage]);

  return (
    <StageLayout
      title=""
      explanation={
        state.selectedType === 'variable'
          ? ''
          : ''
      }
    >
      <OperationsTab
        ref={operationsTabRef}
        selectedType={state.selectedType}
        dataSource={state.dataSource}
        readOnly={readOnly}
        operationsState={state.operationsState}
        onOperationsStateChange={(opsState) => {
          setState(prev => ({
            ...prev,
            operationsState: opsState,
          }));
        }}
        onVariableCreated={(vars) => {
          setState(prev => ({ 
            ...prev, 
            createdVariables: [...prev.createdVariables, ...vars] 
          }));
        }}
        onColumnCreated={(column) => {
          console.log('[M2Operations] onColumnCreated callback called', column);
          setState(prev => {
            const newState = { 
              ...prev, 
              createdColumns: [...prev.createdColumns, column] 
            };
            console.log('[M2Operations] Updated state with column:', {
              previousColumnsCount: prev.createdColumns.length,
              newColumnsCount: newState.createdColumns.length,
            });
            return newState;
          });
        }}
        onTableCreated={(table) => {
          console.log('[M2Operations] onTableCreated callback called', table);
          setState(prev => {
            const newState = { 
              ...prev, 
              createdTables: [...prev.createdTables, table] 
            };
            console.log('[M2Operations] Updated state with table:', {
              previousTablesCount: prev.createdTables.length,
              newTablesCount: newState.createdTables.length,
            });
            return newState;
          });
        }}
      />
    </StageLayout>
  );
});
