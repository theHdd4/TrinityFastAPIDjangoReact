import { VALIDATE_API } from '@/lib/api';
import { getActiveProjectContext } from '@/utils/projectEnv';

interface Frame {
  object_name: string;
  csv_name: string;
  arrow_name?: string;
  last_modified?: string;
  size?: number;
}

interface OpenGuidedModeParams {
  frame: Frame;
  findOrCreateDataUploadAtom: () => string;
  setActiveGuidedFlow: (atomId: string, currentStage: 'U0' | 'U1' | 'U2' | 'U3' | 'U4' | 'U5' | 'U6' | 'U7', state?: any) => void;
  setGlobalGuidedMode: (enabled: boolean) => void;
  // Optional: Direct dependencies in case the function approach fails
  cards?: any[];
  updateCard?: (cardId: string, updates: Partial<any>) => void;
  setCards?: (cards: any[]) => void;
}

export const openGuidedMode = async ({
  frame,
  findOrCreateDataUploadAtom,
  setActiveGuidedFlow,
  setGlobalGuidedMode,
  cards,
  updateCard,
  setCards,
}: OpenGuidedModeParams): Promise<void> => {
  try {
    console.log('[openGuidedMode] Starting with frame:', frame);
    console.log('[openGuidedMode] Functions check:', {
      findOrCreateDataUploadAtom: typeof findOrCreateDataUploadAtom,
      setActiveGuidedFlow: typeof setActiveGuidedFlow,
      setGlobalGuidedMode: typeof setGlobalGuidedMode,
    });

    if (!frame || !frame.object_name) {
      console.error('[openGuidedMode] Invalid frame provided');
      return;
    }

    // Verify all required functions are available
    if (typeof findOrCreateDataUploadAtom !== 'function') {
      console.error('[openGuidedMode] findOrCreateDataUploadAtom is not a function, type:', typeof findOrCreateDataUploadAtom);
      return;
    }
    if (typeof setActiveGuidedFlow !== 'function') {
      console.error('[openGuidedMode] setActiveGuidedFlow is not a function, type:', typeof setActiveGuidedFlow);
      return;
    }
    if (typeof setGlobalGuidedMode !== 'function') {
      console.error('[openGuidedMode] setGlobalGuidedMode is not a function, type:', typeof setGlobalGuidedMode);
      return;
    }

    // Find the landing card atom instead of creating a new data-upload atom
    // The landing card should host the guided flow
    console.log('[openGuidedMode] Looking for landing card atom...');
    console.log('[openGuidedMode] Cards available:', Array.isArray(cards) ? cards.length : 'not an array');
    let atomId: string = '';
    
    // Look for landing-screen atom in cards
    if (Array.isArray(cards)) {
      for (const card of cards) {
        if (card?.atoms && Array.isArray(card.atoms)) {
          console.log('[openGuidedMode] Checking card:', card.id, 'with', card.atoms.length, 'atoms');
          for (const atom of card.atoms) {
            console.log('[openGuidedMode] Checking atom:', atom.atomId, atom.id);
            // Use landing-screen atom if it exists
            if (atom?.atomId === 'landing-screen' && atom?.id) {
              atomId = atom.id;
              console.log('[openGuidedMode] ✅ Found landing card atom:', atomId);
              break;
            }
          }
          if (atomId) break;
        }
      }
    }
    
    // If no landing card found, try the function approach as fallback
    if (!atomId && typeof findOrCreateDataUploadAtom === 'function') {
      try {
        atomId = findOrCreateDataUploadAtom();
        console.log('[openGuidedMode] Got atomId from function (fallback):', atomId);
      } catch (error) {
        console.error('[openGuidedMode] Error calling findOrCreateDataUploadAtom:', error);
      }
    }
    
    if (!atomId || typeof atomId !== 'string' || atomId.trim() === '') {
      console.error('[openGuidedMode] ❌ Failed to find landing card atom');
      console.error('[openGuidedMode] Available cards:', cards);
      return;
    }
    
    console.log('[openGuidedMode] ✅ Using landing card atom:', atomId);
    
    // Check priming status to determine initial stage
    const projectContext = getActiveProjectContext();
    // Default to U2 (Confirm Headers) for files uploaded directly from Saved DataFrames (U1 removed)
    let startStage: 'U0' | 'U1' | 'U2' | 'U3' | 'U4' | 'U5' | 'U6' | 'U7' = 'U2';
    
    if (projectContext) {
      try {
        const queryParams = new URLSearchParams({
          client_name: projectContext.client_name || '',
          app_name: projectContext.app_name || '',
          project_name: projectContext.project_name || '',
          file_name: frame.object_name,
        }).toString();

        const primingCheckRes = await fetch(
          `${VALIDATE_API}/check-priming-status?${queryParams}`,
          { credentials: 'include' }
        );

        if (primingCheckRes.ok) {
          const primingData = await primingCheckRes.json();
          const currentStage = primingData?.current_stage;
          const isInProgress = primingData?.is_in_progress;
          const isPrimed = primingData?.is_primed;
          
          // If file is fully primed, start at U2 to allow re-processing
          if (isPrimed) {
            startStage = 'U2';
          }
          // If file is in progress (partially primed), continue from current stage
          // Skip U1 if it was the current stage, go to U2 instead
          else if (isInProgress && currentStage && ['U2', 'U3', 'U4', 'U5', 'U6'].includes(currentStage)) {
            startStage = currentStage as 'U2' | 'U3' | 'U4' | 'U5' | 'U6';
          }
          // If file has started but not in progress (U0 or U1), start at U2 (U1 removed)
          else if (currentStage === 'U0' || currentStage === 'U1') {
            startStage = 'U2';
          }
          // Default: file uploaded directly, start at U2 (Confirm Headers step)
          else {
            startStage = 'U2';
          }
        }
      } catch (err) {
        console.warn('[openGuidedMode] Failed to check priming status for guided flow', err);
        // On error, default to U2 (Confirm Headers step)
        startStage = 'U2';
      }
    }
    
    // Enable global guided mode to ensure guided flow renders
    console.log('[openGuidedMode] Calling setGlobalGuidedMode(true)...');
    try {
      if (typeof setGlobalGuidedMode === 'function') {
        setGlobalGuidedMode(true);
        console.log('[openGuidedMode] setGlobalGuidedMode called successfully');
      } else {
        console.error('[openGuidedMode] setGlobalGuidedMode is not a function at call time, type:', typeof setGlobalGuidedMode);
        return;
      }
    } catch (error) {
      console.error('[openGuidedMode] Error calling setGlobalGuidedMode:', error);
      return;
    }
    
    // Dispatch event to open the guided workflow side panel
    try {
      window.dispatchEvent(new CustomEvent('open-guided-panel'));
      console.log('[openGuidedMode] open-guided-panel event dispatched');
    } catch (error) {
      console.error('[openGuidedMode] Error dispatching open-guided-panel event:', error);
    }
    
    // Start guided flow inline in canvas area
    // This will automatically render the guided flow in the canvas when the atom is rendered
    // The state structure:
    // - initialFile: { name, path, size } - custom property extracted by CanvasArea and passed as existingDataframe to GuidedUploadFlowInline
    // - Other properties: Partial<GuidedUploadFlowState> - will be merged with saved state if available
    // CanvasArea extracts initialFile from flowState?.state?.initialFile and passes it as existingDataframe prop
    // CRITICAL: Use frame.object_name as-is - it should already contain the full MinIO path including folder structure
    // For Excel sheets in folders, this should be something like: "default_client/blank/Project/folder_name/sheets/Sheet1.arrow"
    const initialFile = {
      name: frame.arrow_name || frame.csv_name || frame.object_name,
      path: frame.object_name, // Use exact object_name - should include full folder path for sheets in Excel folders
      size: frame.size || 0,
    };
    
    console.log('[openGuidedMode] Opening guided mode with frame:', {
      object_name: frame.object_name,
      arrow_name: frame.arrow_name,
      csv_name: frame.csv_name,
      initialFilePath: initialFile.path,
      fullFrame: frame
    });
    
    console.log('[openGuidedMode] Calling setActiveGuidedFlow with:', { 
      atomId, 
      startStage,
      initialFile
    });
    
    try {
      if (typeof setActiveGuidedFlow === 'function') {
        // Set the active guided flow with the initial file information
        // This will trigger CanvasArea to:
        // 1. Check if activeGuidedFlows[atomId] exists and isGuidedModeActiveForAtom(atomId) is true
        // 2. Extract initialFile from flowState?.state?.initialFile
        // 3. Render GuidedUploadFlowInline with existingDataframe prop set to initialFile
        // 4. The GuidedUploadFlowInline will use existingDataframe to initialize the flow (skip U0, start at U1)
        setActiveGuidedFlow(atomId, startStage, {
          // Custom property: initialFile is extracted by CanvasArea and passed as existingDataframe
          // This allows GuidedUploadFlowInline to skip U0 and start directly at the appropriate stage
          initialFile: initialFile,
          // Initialize empty state for new flow (will be populated as user progresses through stages)
          // These match the GuidedUploadFlowState interface structure
          uploadedFiles: [],
          headerSelections: {},
          columnNameEdits: {},
          dataTypeSelections: {},
          missingValueStrategies: {},
          fileMetadata: {},
        });
        console.log('[openGuidedMode] setActiveGuidedFlow called successfully');
      } else {
        console.error('[openGuidedMode] setActiveGuidedFlow is not a function at call time, type:', typeof setActiveGuidedFlow);
        return;
      }
    } catch (error) {
      console.error('[openGuidedMode] Error calling setActiveGuidedFlow:', error);
      throw error;
    }
    
    console.log('[openGuidedMode] Guided flow opened for file:', frame.arrow_name || frame.csv_name, 'at stage:', startStage, 'atomId:', atomId);
    
    // Scroll to the atom card if it exists
    setTimeout(() => {
      const atomElement = document.querySelector(`[data-atom-id="${atomId}"]`);
      if (atomElement) {
        atomElement.scrollIntoView({ behavior: 'smooth', block: 'center' });
      }
    }, 100);
  } catch (error) {
    console.error('[openGuidedMode] Error in openGuidedMode:', error);
    throw error;
  }
};



