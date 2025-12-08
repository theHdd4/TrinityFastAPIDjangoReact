import { useCallback, useEffect, useRef } from 'react';
import { VALIDATE_API } from '@/lib/api';
import { getActiveProjectContext, type ProjectContext } from '@/utils/projectEnv';
import type { GuidedUploadFlowState, UploadStage } from '@/components/AtomList/atoms/data-upload-validate/components/guided-upload/useGuidedUploadFlow';

interface PersistedFlowState extends GuidedUploadFlowState {
  projectContext: ProjectContext;
  completedFiles?: string[];
  lastUpdated?: string;
}

const getStorageKey = (projectContext: ProjectContext | null): string => {
  if (!projectContext) return 'guided_flow_state_default';
  return `guided_flow_state_${projectContext.client_name}_${projectContext.app_name}_${projectContext.project_name}`;
};

export function useGuidedFlowPersistence() {
  const projectContextRef = useRef<ProjectContext | null>(null);

  useEffect(() => {
    projectContextRef.current = getActiveProjectContext();
  }, []);

  // Load state from localStorage
  const loadFromLocalStorage = useCallback((): PersistedFlowState | null => {
    const context = projectContextRef.current || getActiveProjectContext();
    const key = getStorageKey(context);
    
    try {
      const stored = localStorage.getItem(key);
      if (stored) {
        const parsed = JSON.parse(stored);
        // Verify it's for the current project context
        if (parsed.projectContext && context) {
          const matches = 
            parsed.projectContext.client_name === context.client_name &&
            parsed.projectContext.app_name === context.app_name &&
            parsed.projectContext.project_name === context.project_name;
          
          if (matches) {
            return parsed;
          }
        }
      }
    } catch (err) {
      console.warn('Failed to load flow state from localStorage', err);
    }
    
    return null;
  }, []);

  // Save state to localStorage
  const saveToLocalStorage = useCallback((state: GuidedUploadFlowState) => {
    const context = projectContextRef.current || getActiveProjectContext();
    if (!context) return;

    const key = getStorageKey(context);
    const persisted: PersistedFlowState = {
      ...state,
      projectContext: context,
      lastUpdated: new Date().toISOString(),
    };

    try {
      localStorage.setItem(key, JSON.stringify(persisted));
    } catch (err) {
      console.warn('Failed to save flow state to localStorage', err);
    }
  }, []);

  // Load state from backend Redis
  const loadFromBackend = useCallback(async (): Promise<PersistedFlowState | null> => {
    const context = projectContextRef.current || getActiveProjectContext();
    if (!context) return null;

    try {
      const queryParams = new URLSearchParams({
        client_name: context.client_name || '',
        app_name: context.app_name || '',
        project_name: context.project_name || '',
      }).toString();

      const res = await fetch(
        `${VALIDATE_API}/get-guided-flow-state?${queryParams}`,
        { credentials: 'include' }
      );

      if (res.ok) {
        const data = await res.json();
        if (data?.state) {
          return {
            ...data.state,
            projectContext: context,
          };
        }
      }
    } catch (err) {
      console.warn('Failed to load flow state from backend', err);
    }

    return null;
  }, []);

  // Save state to backend Redis
  const saveToBackend = useCallback(async (state: GuidedUploadFlowState) => {
    const context = projectContextRef.current || getActiveProjectContext();
    if (!context) return;

    try {
      const payload = {
        client_name: context.client_name || '',
        app_name: context.app_name || '',
        project_name: context.project_name || '',
        state: {
          ...state,
          lastUpdated: new Date().toISOString(),
        },
      };

      const res = await fetch(`${VALIDATE_API}/save-guided-flow-state`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify(payload),
      });

      if (!res.ok) {
        console.warn('Failed to save flow state to backend', await res.text());
      }
    } catch (err) {
      console.warn('Failed to save flow state to backend', err);
    }
  }, []);

  // Mark file as primed (completed U7)
  const markFileAsPrimed = useCallback(async (fileName: string) => {
    const context = projectContextRef.current || getActiveProjectContext();
    if (!context) return;

    try {
      const payload = {
        client_name: context.client_name || '',
        app_name: context.app_name || '',
        project_name: context.project_name || '',
        file_name: fileName,
        completed: true,
      };

      const res = await fetch(`${VALIDATE_API}/mark-file-primed`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify(payload),
      });

      if (!res.ok) {
        console.warn('Failed to mark file as primed', await res.text());
      }
    } catch (err) {
      console.warn('Failed to mark file as primed', err);
    }
  }, []);

  // Save state to both localStorage and backend
  const saveState = useCallback(async (state: GuidedUploadFlowState) => {
    saveToLocalStorage(state);
    await saveToBackend(state);
  }, [saveToLocalStorage, saveToBackend]);

  // Load state (try localStorage first, then backend)
  const loadState = useCallback(async (): Promise<PersistedFlowState | null> => {
    // Try localStorage first for quick access
    const localState = loadFromLocalStorage();
    if (localState) {
      // Also sync from backend in background
      loadFromBackend().then(backendState => {
        if (backendState && backendState.lastUpdated) {
          const localUpdated = localState.lastUpdated ? new Date(localState.lastUpdated) : new Date(0);
          const backendUpdated = new Date(backendState.lastUpdated);
          // Use backend if it's newer
          if (backendUpdated > localUpdated) {
            saveToLocalStorage(backendState);
          }
        }
      }).catch(() => {
        // Ignore errors in background sync
      });
      return localState;
    }

    // Fallback to backend
    return await loadFromBackend();
  }, [loadFromLocalStorage, loadFromBackend, saveToLocalStorage]);

  // Clear state
  const clearState = useCallback(() => {
    const context = projectContextRef.current || getActiveProjectContext();
    const key = getStorageKey(context);
    localStorage.removeItem(key);
    // Also clear from backend
    saveToBackend({
      currentStage: 'U0',
      uploadedFiles: [],
      headerSelections: {},
      columnNameEdits: {},
      dataTypeSelections: {},
      missingValueStrategies: {},
      fileMetadata: {},
    });
  }, [saveToBackend]);

  return {
    saveState,
    loadState,
    markFileAsPrimed,
    clearState,
  };
}

