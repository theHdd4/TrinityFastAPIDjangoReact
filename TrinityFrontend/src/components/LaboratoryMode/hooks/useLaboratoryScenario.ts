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

        if (!cancelled) {
          setFiles(fetchedFiles);
        }

        // Scenario A: No files exist
        if (fetchedFiles.length === 0) {
          if (!cancelled) {
            setScenario('A');
            setPrimingStatuses([]);
          }
          return;
        }

        // Step 2: Check priming status for each file
        const statusChecks: FilePrimingStatus[] = [];

        for (const file of fetchedFiles) {
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
            }
          } catch (err) {
            console.warn('Failed to check flow state for', fileName, err);
          }

          const isPrimed = hasClassifierConfig && hasCompletedFlow;

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

    return () => {
      cancelled = true;
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

