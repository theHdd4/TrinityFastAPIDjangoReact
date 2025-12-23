import React, { useState, useRef, useEffect } from 'react';
import { ArrowRight, AlertTriangle, Upload } from 'lucide-react';
import { Button } from '@/components/ui/button';
import SavedDataFramesPanel from '@/components/LaboratoryMode/components/SavedDataFramesPanel';
import ConfirmationDialog from '@/templates/DialogueBox/ConfirmationDialog';
import { VALIDATE_API, CLASSIFIER_API } from '@/lib/api';
import { getActiveProjectContext } from '@/utils/projectEnv';
import { GuidedUploadFlowInline } from '@/components/AtomList/atoms/data-upload/components/guided-upload/GuidedUploadFlowInline';
import { useLaboratoryStore } from '@/components/LaboratoryMode/store/laboratoryStore';
import { DirectReviewPanel } from '@/components/LaboratoryMode/components/DirectReviewPanel';

interface PartialPrimedCardProps {
  atomId: string;
  cardId: string;
  files: Array<{
    object_name: string;
    csv_name: string;
    arrow_name?: string;
    last_modified?: string;
    size?: number;
  }>;
  primingStatuses: any[];
  onAddNewCard?: () => void;
}

export const PartialPrimedCard: React.FC<PartialPrimedCardProps> = ({
  atomId,
  onAddNewCard,
}) => {
  const [showWarningDialog, setShowWarningDialog] = useState(false);
  const [primingStats, setPrimingStats] = useState<{ total: number; primed: number; unprimed: number }>({ total: 0, primed: 0, unprimed: 0 });
  const isCheckingRef = useRef(false);
  const panelContainerRef = useRef<HTMLDivElement>(null);
  
  // Check if guided mode is active for this landing card atom
  const activeGuidedFlows = useLaboratoryStore((state) => state.activeGuidedFlows || {});
  const isGuidedModeActiveForAtom = useLaboratoryStore((state) => state.isGuidedModeActiveForAtom);
  const globalGuidedModeEnabled = useLaboratoryStore((state) => state.globalGuidedModeEnabled);
  const removeActiveGuidedFlow = useLaboratoryStore((state) => state.removeActiveGuidedFlow);
  const updateAtomSettings = useLaboratoryStore((state) => state.updateAtomSettings);
  const directReviewTarget = useLaboratoryStore((state) => state.directReviewTarget);
  const setDirectReviewTarget = useLaboratoryStore((state) => state.setDirectReviewTarget);
  
  // Check if this atom has an active guided flow
  const hasActiveGuidedFlow = activeGuidedFlows[atomId] && isGuidedModeActiveForAtom(atomId);
  const flowState = activeGuidedFlows[atomId];
  const existingDataframe = flowState?.state?.initialFile as { name: string; path: string; size?: number } | undefined;
  
  // Debug logging
  useEffect(() => {
    console.log('[PartialPrimedCard] Guided mode check:', {
      atomId,
      hasActiveGuidedFlow,
      globalGuidedModeEnabled,
      flowState: !!flowState,
      existingDataframe: !!existingDataframe,
      activeGuidedFlowsKeys: Object.keys(activeGuidedFlows),
    });
  }, [atomId, hasActiveGuidedFlow, globalGuidedModeEnabled, flowState, existingDataframe, activeGuidedFlows]);

  // Fetch priming stats for heading
  const fetchPrimingStats = async () => {
    const projectContext = getActiveProjectContext();
    if (!projectContext?.project_name) return;

    try {
      const queryParams = new URLSearchParams({
        client_name: projectContext.client_name || '',
        app_name: projectContext.app_name || '',
        project_name: projectContext.project_name || '',
      }).toString();

      const res = await fetch(
        `${VALIDATE_API}/list_saved_dataframes?${queryParams}`,
        { credentials: 'include' }
      );

      if (!res.ok) return;

      const data = await res.json();
      const files = Array.isArray(data?.files) ? data.files : [];
      const excelFolders = Array.isArray(data?.excel_folders) ? data.excel_folders : [];
      
      // Collect all files including sheets from Excel folders
      const allFiles: Array<{ object_name: string; [key: string]: any }> = [...files];
      excelFolders.forEach((folder: any) => {
        if (Array.isArray(folder.sheets)) {
          folder.sheets.forEach((sheet: any) => {
            if (sheet.object_name) {
              allFiles.push({ object_name: sheet.object_name, ...sheet });
            }
          });
        }
      });
      
      if (allFiles.length === 0) {
        setPrimingStats({ total: 0, primed: 0, unprimed: 0 });
        return;
      }

      // Check priming status for all files (including sheets in folders)
      const statusChecks = await Promise.all(allFiles.map(async (f: typeof allFiles[0]) => {
        try {
          const queryParams = new URLSearchParams({
            client_name: projectContext.client_name || '',
            app_name: projectContext.app_name || '',
            project_name: projectContext.project_name || '',
            file_name: f.object_name,
          }).toString();

          const primingRes = await fetch(
            `${VALIDATE_API}/check-priming-status?${queryParams}`,
            { credentials: 'include' }
          );

          let isPrimed = false;
          if (primingRes.ok) {
            const primingData = await primingRes.json();
            const completed = primingData?.completed === true || primingData?.is_primed === true;
            
            // Check classifier config
            try {
              const configQueryParams = new URLSearchParams({
                client_name: projectContext.client_name || '',
                app_name: projectContext.app_name || '',
                project_name: projectContext.project_name || '',
                file_name: f.object_name,
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
                  isPrimed = completed && (hasIdentifiers || hasMeasures);
                }
              }
            } catch (err) {
              console.warn('Failed to check classifier config', err);
            }
          }
          
          return isPrimed;
        } catch (err) {
          console.warn('Failed to check priming status', err);
          return false;
        }
      }));

      const primed = statusChecks.filter(s => s === true).length;
      const unprimed = statusChecks.length - primed;
      setPrimingStats({ total: statusChecks.length, primed, unprimed });
    } catch (err) {
      console.error('Failed to fetch priming stats', err);
    }
  };

  // Fetch stats on mount and when events fire
  useEffect(() => {
    fetchPrimingStats();
    
    const handleDataframeSaved = () => {
      // Fetch immediately, then again after a short delay to ensure backend has updated
      fetchPrimingStats();
      setTimeout(() => fetchPrimingStats(), 500);
    };
    const handlePrimingStatusChange = () => {
      // Fetch immediately, then again after a short delay to ensure backend has updated
      fetchPrimingStats();
      setTimeout(() => fetchPrimingStats(), 500);
    };
    const handleDataframeDeleted = () => {
      // Fetch immediately when file is deleted to update status text
      fetchPrimingStats();
      // Also fetch after a short delay to ensure backend has updated
      setTimeout(() => fetchPrimingStats(), 300);
      setTimeout(() => fetchPrimingStats(), 700);
    };
    
    window.addEventListener('dataframe-saved', handleDataframeSaved);
    window.addEventListener('priming-status-changed', handlePrimingStatusChange);
    window.addEventListener('dataframe-deleted', handleDataframeDeleted);
    return () => {
      window.removeEventListener('dataframe-saved', handleDataframeSaved);
      window.removeEventListener('priming-status-changed', handlePrimingStatusChange);
      window.removeEventListener('dataframe-deleted', handleDataframeDeleted);
    };
  }, []);

  // Check priming status only when Continue is clicked
  const checkAllFilesPrimed = async (): Promise<boolean> => {
    if (isCheckingRef.current) return false;
    isCheckingRef.current = true;

    try {
      const projectContext = getActiveProjectContext();
      if (!projectContext?.project_name) return false;

      // Fetch saved dataframes
      const queryParams = new URLSearchParams({
        client_name: projectContext.client_name || '',
        app_name: projectContext.app_name || '',
        project_name: projectContext.project_name || '',
      }).toString();

      const res = await fetch(
        `${VALIDATE_API}/list_saved_dataframes?${queryParams}`,
        { credentials: 'include' }
      );

      if (!res.ok) return false;

      const data = await res.json();
      const files = Array.isArray(data?.files) ? data.files : [];
      if (files.length === 0) return true; // No files means all are "primed" (none to check)

      // Check priming status for all files
      const statusChecks = await Promise.all(files.map(async (f: typeof files[0]) => {
        try {
          const queryParams = new URLSearchParams({
            client_name: projectContext.client_name || '',
            app_name: projectContext.app_name || '',
            project_name: projectContext.project_name || '',
            file_name: f.object_name,
          }).toString();

          const primingRes = await fetch(
            `${VALIDATE_API}/check-priming-status?${queryParams}`,
            { credentials: 'include' }
          );

          let isPrimed = false;
          if (primingRes.ok) {
            const primingData = await primingRes.json();
            const completed = primingData?.completed === true || primingData?.is_primed === true;
            
            // Check classifier config
            try {
              const configQueryParams = new URLSearchParams({
                client_name: projectContext.client_name || '',
                app_name: projectContext.app_name || '',
                project_name: projectContext.project_name || '',
                file_name: f.object_name,
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
                  isPrimed = completed && (hasIdentifiers || hasMeasures);
                }
              }
            } catch (err) {
              console.warn('Failed to check classifier config', err);
            }
          }
          
          return isPrimed;
        } catch (err) {
          console.warn('Failed to check priming status', err);
          return false;
        }
      }));

      return statusChecks.every(status => status === true);
    } catch (err) {
      console.error('Failed to check priming status', err);
      return false;
    } finally {
      isCheckingRef.current = false;
    }
  };

  const handleUploadMore = () => {
    // Trigger the same file picker as SavedDataFramesPanel uses
    // Find the file input inside SavedDataFramesPanel and click it
    if (panelContainerRef.current) {
      const fileInput = panelContainerRef.current.querySelector('input[type="file"]') as HTMLInputElement;
      if (fileInput) {
        fileInput.click();
      }
    }
  };

  const handleContinue = async () => {
    const allPrimed = await checkAllFilesPrimed();

    if (!allPrimed) {
      setShowWarningDialog(true);
    } else {
      // All primed, proceed
      if (onAddNewCard) {
        onAddNewCard();
      } else {
        window.dispatchEvent(new CustomEvent('add-new-card'));
      }
    }
  };

  return (
    <div className="w-full flex flex-col" style={{ minHeight: '100%' }}>
      {/* Priming Status Heading */}
      {primingStats.total > 0 && (
        <div className="px-6 pt-1 pb-0">
          <h3 className="text-base font-semibold text-gray-800">
            {primingStats.unprimed > 0 
              ? (primingStats.total === 1 && primingStats.unprimed === 1
                  ? `Status : File need to be prime`
                  : primingStats.unprimed === primingStats.total
                  ? `Status : All file need to prime`
                  : `Status : ${primingStats.unprimed} out of ${primingStats.total} files yet to be primed`)
              : `Status : All files primed`
            }
          </h3>
        </div>
      )}

      {/* Saved DataFrames Panel - Always open, full width */}
      {/* Override to show files in grid (2 per row), hide header icons, remove borders */}
      <style>{`
        /* Override SavedDataFramesPanel width - remove w-80 (320px) constraint completely */
        [data-saved-dataframes-panel] > div,
        [data-saved-dataframes-panel] > div > div {
          width: 100% !important;
          max-width: 100% !important;
          min-width: 0 !important;
          margin-top: 0 !important;
          padding-top: 0 !important;
        }
        
        /* Remove top margin/padding from panel container */
        [data-saved-dataframes-panel] {
          margin-top: 0 !important;
          padding-top: 0 !important;
        }
        
        /* Specifically target w-80 class and override it */
        [data-saved-dataframes-panel] .w-80 {
          width: 100% !important;
          max-width: 100% !important;
          min-width: 0 !important;
        }
        
        /* Force all nested divs to use full width */
        [data-saved-dataframes-panel] div {
          max-width: 100% !important;
        }
        
        /* Hide the three icons in header (upload, delete, chevron) */
        [data-saved-dataframes-panel] .p-2.border-b .flex.items-center.space-x-2 {
          display: none !important;
        }
        
        /* Remove border from header */
        [data-saved-dataframes-panel] .p-2.border-b {
          border-bottom: none !important;
        }
        
        /* Make file list container use grid layout - 2 files per row, full width */
        [data-saved-dataframes-panel] .flex-1.overflow-y-auto.p-3 {
          display: grid !important;
          grid-template-columns: repeat(2, minmax(250px, 1fr)) !important;
          gap: 0.5rem !important;
          width: 100% !important;
          max-width: 100% !important;
          min-width: 0 !important;
          align-content: start !important;
          align-items: start !important;
          padding: 0.25rem 0.5rem !important;
          padding-top: 0.25rem !important;
        }
        
        /* Target ALL direct children - make them grid items, remove all margins */
        [data-saved-dataframes-panel] .flex-1.overflow-y-auto.p-3 > * {
          width: 100% !important;
          margin: 0 !important;
          margin-left: 0 !important;
          margin-right: 0 !important;
          margin-top: 0 !important;
          margin-bottom: 0 !important;
          display: block !important;
        }
        
        /* Target file node divs with inline marginLeft style - override inline styles */
        [data-saved-dataframes-panel] .flex-1.overflow-y-auto.p-3 > div[style*="marginLeft"],
        [data-saved-dataframes-panel] .flex-1.overflow-y-auto.p-3 > div[style*="margin-left"],
        [data-saved-dataframes-panel] .flex-1.overflow-y-auto.p-3 > div[style*="marginLeft:"] {
          width: 100% !important;
          margin: 0 !important;
          margin-left: 0 !important;
          margin-top: 0 !important;
          margin-right: 0 !important;
          margin-bottom: 0 !important;
        }
        
        /* Remove inline marginLeft styles completely */
        [data-saved-dataframes-panel] .flex-1.overflow-y-auto.p-3 > div[style] {
          margin-left: 0 !important;
        }
        
        /* Target file entry cards - ensure they fit grid cells perfectly, blue box styling */
        [data-saved-dataframes-panel] .flex.items-center.justify-between.border {
          width: 100% !important;
          min-width: 0 !important;
          max-width: 100% !important;
          box-sizing: border-box !important;
          border: 2px solid #bfdbfe !important;
          border-radius: 0.5rem !important;
          background: linear-gradient(to bottom right, #eff6ff, #ffffff) !important;
          display: flex !important;
          flex-direction: row !important;
          align-items: center !important;
          justify-content: space-between !important;
          flex-wrap: nowrap !important;
          padding: 0.5rem !important;
        }
        
        [data-saved-dataframes-panel] .flex.items-center.justify-between.border.p-1\\.5 {
          border: 2px solid #bfdbfe !important;
          border-radius: 0.5rem !important;
          background: linear-gradient(to bottom right, #eff6ff, #ffffff) !important;
          display: flex !important;
          flex-direction: row !important;
          align-items: center !important;
          justify-content: space-between !important;
          flex-wrap: nowrap !important;
          padding: 0.5rem !important;
        }
        
        /* Remove L-shaped borders from panel container */
        [data-saved-dataframes-panel] > div {
          border-left: none !important;
          border-right: none !important;
        }
        
        [data-saved-dataframes-panel] > div > div {
          border-left: none !important;
          border-right: none !important;
        }
        
        /* Ensure file name container stays on left, doesn't wrap */
        [data-saved-dataframes-panel] .flex.items-center.justify-between.border .flex-1.min-w-0 {
          display: flex !important;
          flex-direction: row !important;
          align-items: center !important;
          flex-wrap: nowrap !important;
          min-width: 0 !important;
          flex: 1 1 auto !important;
          overflow: hidden !important;
          margin-right: 0.5rem !important;
        }
        
        /* Ensure icons container stays on right, same line - prevent wrapping */
        [data-saved-dataframes-panel] .flex.items-center.justify-between.border .flex.items-center.space-x-2 {
          display: flex !important;
          flex-direction: row !important;
          align-items: center !important;
          flex-wrap: nowrap !important;
          flex-shrink: 0 !important;
          margin-left: 0.5rem !important;
          white-space: nowrap !important;
        }
        
        /* Prevent any child elements from breaking to new line */
        [data-saved-dataframes-panel] .flex.items-center.justify-between.border > * {
          flex-shrink: 0 !important;
        }
        
        [data-saved-dataframes-panel] .flex.items-center.justify-between.border .flex-1.min-w-0 {
          flex-shrink: 1 !important;
        }
        
        /* Ensure the entire panel container uses full width */
        [data-saved-dataframes-panel] {
          width: 100% !important;
          max-width: 100% !important;
        }
      `}</style>
      {/* Saved DataFrames Panel - Always visible, but limit height when guided mode is active */}
      <div className={`overflow-y-auto w-full flex flex-col ${hasActiveGuidedFlow ? 'flex-shrink-0' : 'flex-1 min-h-0'}`} data-saved-dataframes-panel ref={panelContainerRef} style={{ maxHeight: hasActiveGuidedFlow ? '300px' : 'none' }}>
        <div className="w-full">
          <SavedDataFramesPanel 
            isOpen={true} 
            onToggle={() => {}} 
            collapseDirection="right"
          />
        </div>
      </div>

      {/* Action Buttons - Blue with text, right side - Always visible */}
      <div className="flex items-center justify-end gap-3 px-3 pt-2 pb-2 border-t border-gray-200 flex-shrink-0 bg-white">
        <Button
          onClick={handleUploadMore}
          className="bg-blue-600 hover:bg-blue-700 text-white px-4 py-2"
        >
          <Upload className="w-4 h-4 mr-2" />
          Upload More
        </Button>
        <Button
          onClick={handleContinue}
          className="bg-blue-600 hover:bg-blue-700 text-white px-4 py-2"
        >
          Continue
          <ArrowRight className="w-4 h-4 ml-2" />
        </Button>
      </div>

      {/* Direct Review Panel - Show BELOW the buttons when Directly Review is clicked */}
      {directReviewTarget && (
        <DirectReviewPanel
          frame={directReviewTarget}
          onClose={() => {
            setDirectReviewTarget(null);
          }}
          onSave={() => {
            // Refresh priming stats after save
            fetchPrimingStats();
          }}
        />
      )}

      {/* Guided Flow Steps - Show BELOW the buttons, extending the card downward */}
      {/* Only show for the selected file (existingDataframe must match the clicked file) */}
      {hasActiveGuidedFlow && globalGuidedModeEnabled && flowState && existingDataframe && (
        <div className="w-full border-t-2 border-blue-200 bg-white flex-shrink-0" style={{ minHeight: '400px', maxHeight: '70vh', overflowY: 'auto' }}>
          <div className="px-4 py-3 border-b border-gray-200 bg-gradient-to-r from-blue-50 to-indigo-50 sticky top-0 z-10">
            <h3 className="text-base font-semibold text-gray-800">Guided Priming Workflow</h3>
            <p className="text-xs text-gray-600 mt-1">
              Priming file: <span className="font-medium text-blue-700">{existingDataframe.name}</span>
            </p>
          </div>
          <div className="p-4">
            <GuidedUploadFlowInline
              atomId={atomId}
              onComplete={(result) => {
                // Handle completion - update atom settings
                // Only process the selected file (existingDataframe)
                const fileNames = result.uploadedFiles.map((f: any) => f.name);
                const filePathMap: Record<string, string> = {};
                result.uploadedFiles.forEach((f: any) => {
                  filePathMap[f.name] = f.path;
                });
                
                updateAtomSettings(atomId, {
                  uploadedFiles: fileNames,
                  filePathMap: filePathMap,
                });
              }}
              onClose={() => {
                removeActiveGuidedFlow(atomId);
              }}
              savedState={flowState.state}
              initialStage={flowState.currentStage}
              existingDataframe={existingDataframe}
            />
          </div>
        </div>
      )}

      {/* Warning Dialog */}
      <ConfirmationDialog
        open={showWarningDialog}
        onOpenChange={setShowWarningDialog}
        onConfirm={() => {
          setShowWarningDialog(false);
          // Proceed with adding new card (allows dragging cards)
          if (onAddNewCard) {
            onAddNewCard();
          } else {
            window.dispatchEvent(new CustomEvent('add-new-card'));
          }
        }}
        onCancel={() => setShowWarningDialog(false)}
        title="Files Not Primed"
        description="Some files are not primed. Non primed files will not be available for further analysis"
        icon={<AlertTriangle className="w-6 h-6 text-white" />}
        confirmLabel="Ignore and Continue"
        cancelLabel="Go Back"
        iconBgClass="bg-yellow-500"
        confirmButtonClass="bg-yellow-500 hover:bg-yellow-600"
        helpText="Click icon (equilizer icon) to prime the data"
      />
    </div>
  );
};
