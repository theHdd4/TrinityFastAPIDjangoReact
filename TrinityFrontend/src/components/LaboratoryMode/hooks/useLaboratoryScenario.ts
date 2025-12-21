import { useState, useEffect } from 'react';
import { VALIDATE_API, CLASSIFIER_API } from '@/lib/api';
import { getActiveProjectContext, type ProjectContext } from '@/utils/projectEnv';
import type { UploadStage } from '@/components/AtomList/atoms/data-validate/components/guided-upload/useGuidedUploadFlow';

export type LaboratoryScenario = 'A' | 'B' | 'C' | 'D' | 'loading';

export interface FilePrimingStatus {
  object_name: string;
  file_name: string;
  hasClassifierConfig: boolean;
  hasCompletedFlow: boolean;
  isPrimed: boolean;
  currentStage?: UploadStage;
}

export interface ScenarioData {
  scenario: LaboratoryScenario;
  files: Array<{
    object_name: string;
    csv_name: string;
    arrow_name?: string;
    last_modified?: string;
    size?: number;
  }>;
  primingStatuses: FilePrimingStatus[];
  unprimedFiles: FilePrimingStatus[];
  inProgressFiles: FilePrimingStatus[];
  primedFiles: FilePrimingStatus[];
  savedFlowState?: {
    currentStage: UploadStage;
    uploadedFiles: any[];
    [key: string]: any;
  };
}

export function useLaboratoryScenario(): ScenarioData {
  const [scenario, setScenario] = useState<LaboratoryScenario>('loading');
  const [files, setFiles] = useState<Array<{
    object_name: string;
    csv_name: string;
    arrow_name?: string;
    last_modified?: string;
    size?: number;
  }>>([]);
  const [primingStatuses, setPrimingStatuses] = useState<FilePrimingStatus[]>([]);
  const [savedFlowState, setSavedFlowState] = useState<any>(null);

  useEffect(() => {
    let cancelled = false;

    const detectScenario = async () => {
      const projectContext = getActiveProjectContext();
      if (!projectContext || !projectContext.project_name) {
        if (!cancelled) {
          setScenario('loading');
        }
        return;
      }

      try {
        // Step 1: Fetch saved dataframes
        const queryParams = new URLSearchParams({
          client_name: projectContext.client_name || '',
          app_name: projectContext.app_name || '',
          project_name: projectContext.project_name || '',
        }).toString();

        const filesRes = await fetch(
          `${VALIDATE_API}/list_saved_dataframes?${queryParams}`,
          { credentials: 'include' }
        );

        if (!filesRes.ok) {
          if (!cancelled) {
            setScenario('loading');
          }
          return;
        }

        const filesData = await filesRes.json();
        const fetchedFiles = Array.isArray(filesData?.files) ? filesData.files : [];
        const excelFolders = Array.isArray(filesData?.excel_folders) ? filesData.excel_folders : [];
        
        // Collect all files including sheets from Excel folders
        const allFiles: Array<{ object_name: string; [key: string]: any }> = [...fetchedFiles];
        excelFolders.forEach((folder: any) => {
          if (Array.isArray(folder.sheets)) {
            folder.sheets.forEach((sheet: any) => {
              if (sheet.object_name) {
                allFiles.push({ object_name: sheet.object_name, ...sheet });
              }
            });
          }
        });

        if (!cancelled) {
          setFiles(allFiles);
        }

        // Scenario A: No files exist
        if (allFiles.length === 0) {
          if (!cancelled) {
            setScenario('A');
            setPrimingStatuses([]);
          }
          return;
        }

        // Step 2: Check priming status for each file (including sheets in folders)
        const statusChecks: FilePrimingStatus[] = [];

        for (const file of allFiles) {
          const fileName = file.object_name || file.arrow_name || file.csv_name;

          // Check classifier config in MongoDB
          let hasClassifierConfig = false;
          try {
            const configQueryParams = new URLSearchParams({
              client_name: projectContext.client_name || '',
              app_name: projectContext.app_name || '',
              project_name: projectContext.project_name || '',
              file_name: fileName,
              bypass_cache: 'true',
            }).toString();

            const configRes = await fetch(
              `${CLASSIFIER_API}/get_config?${configQueryParams}`,
              { credentials: 'include' }
            );

            if (configRes.ok) {
              const configData = await configRes.json();
              if (configData?.data) {
                const hasIdentifiers = Array.isArray(configData.data.identifiers) && configData.data.identifiers.length > 0;
                const hasMeasures = Array.isArray(configData.data.measures) && configData.data.measures.length > 0;
                hasClassifierConfig = hasIdentifiers || hasMeasures;
              }
            }
          } catch (err) {
            console.warn('Failed to check classifier config for', fileName, err);
          }

          // Check guided flow completion status from Redis
          let hasCompletedFlow = false;
          let isPrimedFromAPI = false;
          let currentStage: UploadStage | undefined;
          try {
            const flowStateQueryParams = new URLSearchParams({
              client_name: projectContext.client_name || '',
              app_name: projectContext.app_name || '',
              project_name: projectContext.project_name || '',
              file_name: fileName,
            }).toString();

            const flowStateRes = await fetch(
              `${VALIDATE_API}/check-priming-status?${flowStateQueryParams}`,
              { credentials: 'include' }
            );

            if (flowStateRes.ok) {
              const flowStateData = await flowStateRes.json();
              hasCompletedFlow = flowStateData?.completed === true;
              currentStage = flowStateData?.current_stage;
              // Check the is_primed flag from Redis (set when file is approved via processing modal)
              // This is the authoritative source for priming status
              isPrimedFromAPI = flowStateData?.is_primed === true || flowStateData?.completed === true;
            }
          } catch (err) {
            console.warn('Failed to check flow state for', fileName, err);
          }

          // Prioritize is_primed flag from API, but also check classifier config for consistency
          // If API says it's primed, trust that. Otherwise, require both classifier config and completed flow
          const isPrimed = isPrimedFromAPI || (hasClassifierConfig && hasCompletedFlow);

          statusChecks.push({
            object_name: file.object_name,
            file_name: fileName,
            hasClassifierConfig,
            hasCompletedFlow,
            isPrimed,
            currentStage,
          });
        }

        if (!cancelled) {
          setPrimingStatuses(statusChecks);
        }

        // Step 3: Check for saved flow state (Scenario C)
        try {
          const flowStateQueryParams = new URLSearchParams({
            client_name: projectContext.client_name || '',
            app_name: projectContext.app_name || '',
            project_name: projectContext.project_name || '',
          }).toString();

          const savedStateRes = await fetch(
            `${VALIDATE_API}/get-guided-flow-state?${flowStateQueryParams}`,
            { credentials: 'include' }
          );

          if (savedStateRes.ok) {
            const savedStateData = await savedStateRes.json();
            if (savedStateData?.state && savedStateData.state.currentStage && savedStateData.state.currentStage !== 'U7') {
              // Flow state exists and is incomplete
              if (!cancelled) {
                setSavedFlowState(savedStateData.state);
                setScenario('C');
                return;
              }
            }
          }
        } catch (err) {
          console.warn('Failed to check saved flow state', err);
        }

        // Step 4: Determine scenario based on priming statuses
        const unprimedFiles = statusChecks.filter(s => !s.isPrimed && !s.currentStage);
        const inProgressFiles = statusChecks.filter(s => s.currentStage && s.currentStage !== 'U7');
        const primedFiles = statusChecks.filter(s => s.isPrimed);

        if (!cancelled) {
          if (primedFiles.length === statusChecks.length && statusChecks.length > 0) {
            // All files are primed
            setScenario('D');
          } else if (unprimedFiles.length > 0 || inProgressFiles.length > 0) {
            // Some files are not primed
            setScenario('B');
          } else {
            // Fallback to B if we have files but couldn't determine status
            setScenario('B');
          }
        }
      } catch (err) {
        console.error('Failed to detect scenario', err);
        if (!cancelled) {
          setScenario('loading');
        }
      }
    };

    detectScenario();

    // Listen for dataframe-saved events to refresh status
    const handleDataframeSaved = () => {
      if (!cancelled) {
        console.log('[useLaboratoryScenario] dataframe-saved event received, refreshing scenario...');
        // Refresh immediately, then multiple times with increasing delays to ensure backend has updated
        detectScenario();
        
        // Very aggressive polling for the first few seconds after upload
        const checkDelays = [100, 200, 300, 500, 700, 1000, 1500, 2000, 3000];
        checkDelays.forEach((delay) => {
          setTimeout(() => {
            if (!cancelled) {
              console.log(`[useLaboratoryScenario] Re-checking scenario after ${delay}ms...`);
              detectScenario();
            }
          }, delay);
        });
      }
    };

    // Listen for priming status changes
    const handlePrimingStatusChange = () => {
      if (!cancelled) {
        console.log('[useLaboratoryScenario] priming-status-changed event received, refreshing scenario...');
        // Refresh immediately, then multiple times with increasing delays to ensure backend has updated
        detectScenario();
        setTimeout(() => {
          if (!cancelled) {
            console.log('[useLaboratoryScenario] Re-checking scenario after 150ms (priming)...');
            detectScenario();
          }
        }, 150);
        setTimeout(() => {
          if (!cancelled) {
            console.log('[useLaboratoryScenario] Re-checking scenario after 400ms (priming)...');
            detectScenario();
          }
        }, 400);
        setTimeout(() => {
          if (!cancelled) {
            console.log('[useLaboratoryScenario] Re-checking scenario after 800ms (priming)...');
            detectScenario();
          }
        }, 800);
      }
    };

    // Listen for dataframe deletion events
    const handleDataframeDeleted = () => {
      if (!cancelled) {
        console.log('[useLaboratoryScenario] dataframe-deleted event received, refreshing scenario...');
        // Refresh immediately, then multiple times with increasing delays to ensure backend has updated
        detectScenario();
        // Very aggressive polling after deletion to detect scenario change (A if all deleted, or B if some remain)
        const checkDelays = [100, 200, 300, 500, 700, 1000, 1500, 2000];
        checkDelays.forEach((delay) => {
          setTimeout(() => {
            if (!cancelled) {
              console.log(`[useLaboratoryScenario] Re-checking scenario after ${delay}ms (deletion)...`);
              detectScenario();
            }
          }, delay);
        });
      }
    };

    window.addEventListener('dataframe-saved', handleDataframeSaved);
    window.addEventListener('priming-status-changed', handlePrimingStatusChange);
    window.addEventListener('dataframe-deleted', handleDataframeDeleted);

    return () => {
      cancelled = true;
      window.removeEventListener('dataframe-saved', handleDataframeSaved);
      window.removeEventListener('priming-status-changed', handlePrimingStatusChange);
      window.removeEventListener('dataframe-deleted', handleDataframeDeleted);
    };
  }, []);

  const unprimedFiles = primingStatuses.filter(s => !s.isPrimed && !s.currentStage);
  const inProgressFiles = primingStatuses.filter(s => s.currentStage && s.currentStage !== 'U7');
  const primedFiles = primingStatuses.filter(s => s.isPrimed);

  return {
    scenario,
    files,
    primingStatuses,
    unprimedFiles,
    inProgressFiles,
    primedFiles,
    savedFlowState,
  };
}

