import React, { useState, useRef, useEffect } from 'react';
import { ArrowRight, AlertTriangle, Upload, SlidersHorizontal } from 'lucide-react';
import { Button } from '@/components/ui/button';
import SavedDataFramesPanel from '@/components/LaboratoryMode/components/SavedDataFramesPanel';
import ConfirmationDialog from '@/templates/DialogueBox/ConfirmationDialog';
import { VALIDATE_API, CLASSIFIER_API } from '@/lib/api';
import { getActiveProjectContext } from '@/utils/projectEnv';
import { useLaboratoryStore } from '@/components/LaboratoryMode/store/laboratoryStore';

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
  // Optional token that forces a stats refresh when it changes (e.g. after uploads)
  refreshToken?: number;
}

export const PartialPrimedCard: React.FC<PartialPrimedCardProps> = ({
  atomId,
  onAddNewCard,
  refreshToken,
}) => {
  const [showWarningDialog, setShowWarningDialog] = useState(false);
  const [primingStats, setPrimingStats] = useState<{ total: number; primed: number; unprimed: number }>({ total: 0, primed: 0, unprimed: 0 });
  const isCheckingRef = useRef(false);
  const panelContainerRef = useRef<HTMLDivElement>(null);
  const [panelRefreshKey, setPanelRefreshKey] = useState(0);
  
  // Note: We still access store state to update it when needed (e.g., when "Direct review" is chosen),
  // but we don't render DirectReviewPanel or GuidedUploadFlowInline here anymore.
  // Those are now rendered in DataUploadAtom.tsx as separate bottom row.
  const setDirectReviewTarget = useLaboratoryStore((state) => state.setDirectReviewTarget);

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
            // Only trust is_primed flag - don't use completed flag as it can be true even if file hasn't been primed
            // Check if flow has been completed by checking if current_stage is U6 (final step)
            const hasCompletedFlow = primingData?.current_stage === 'U6';
            const isPrimedFromAPI = primingData?.is_primed === true;
            
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
                  const hasClassifierConfig = hasIdentifiers || hasMeasures;
                  // ONLY trust is_primed flag from API - this is the authoritative source
                  // Do NOT use fallback logic as it can incorrectly mark files as primed
                  isPrimed = isPrimedFromAPI;
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

  // Fetch stats on mount and when events fire or when an explicit refresh token changes
  useEffect(() => {
    fetchPrimingStats();
  }, [refreshToken]);

  // Event listeners that also trigger stats + panel refresh
  useEffect(() => {
    const handleDataframeSaved = () => {
      // Optimistically mark that there is at least one new unprimed file
      // so the heading switches from "All files primed" to the unprimed message
      // immediately after upload, without needing a full page refresh.
      setPrimingStats(prev => ({
        total: prev.total + 1,
        primed: prev.primed,
        unprimed: prev.unprimed + 1,
      }));

      // Force refresh of SavedDataFramesPanel by updating key
      setPanelRefreshKey(prev => prev + 1);
      // Fetch immediately, then again after a short delay to ensure backend has updated
      fetchPrimingStats();
      setTimeout(() => {
        fetchPrimingStats();
        setPanelRefreshKey(prev => prev + 1); // Force another refresh after delay
      }, 500);
    };
    const handlePrimingStatusChange = () => {
      // Force refresh of SavedDataFramesPanel by updating key
      setPanelRefreshKey(prev => prev + 1);
      // Fetch immediately, then again after a short delay to ensure backend has updated
      fetchPrimingStats();
      setTimeout(() => {
        fetchPrimingStats();
        setPanelRefreshKey(prev => prev + 1); // Force another refresh after delay
      }, 500);
    };
    const handleDataframeDeleted = () => {
      // Force refresh of SavedDataFramesPanel by updating key
      setPanelRefreshKey(prev => prev + 1);
      // Fetch immediately when file is deleted to update status text
      fetchPrimingStats();
      // Also fetch after a short delay to ensure backend has updated
      setTimeout(() => {
        fetchPrimingStats();
        setPanelRefreshKey(prev => prev + 1); // Force another refresh after delay
      }, 300);
      setTimeout(() => {
        fetchPrimingStats();
        setPanelRefreshKey(prev => prev + 1); // Force another refresh after delay
      }, 700);
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
            // Only trust is_primed flag - don't use completed flag as it can be true even if file hasn't been primed
            // Check if flow has been completed by checking if current_stage is U6 (final step)
            const hasCompletedFlow = primingData?.current_stage === 'U6';
            const isPrimedFromAPI = primingData?.is_primed === true;
            
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
                  const hasClassifierConfig = hasIdentifiers || hasMeasures;
                  // ONLY trust is_primed flag from API - this is the authoritative source
                  // Do NOT use fallback logic as it can incorrectly mark files as primed
                  isPrimed = isPrimedFromAPI;
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
    <div className="w-full flex flex-col" style={{ height: '100%', overflowY: 'auto' }}>
      {/* Priming Status Heading */}
      {primingStats.total > 0 && (
        <div className="px-6 pt-1 pb-0">
          <h3 className="text-base font-semibold text-gray-800 flex items-center gap-2">
            {primingStats.unprimed > 0 
              ? (
                  <>
                    <span>Unprimed files detected. Click on</span>
                    <SlidersHorizontal className="w-4 h-4 text-gray-700" />
                    <span>icon to prime them</span>
                  </>
                )
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
        
        /* Make file list container use grid layout - 2 files per row, full width, limit to 4 rows with scroll */
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
          max-height: calc((4 * 3.5rem) + (3 * 0.5rem)) !important; /* 4 rows: 4 cards at 3.5rem each + 3 gaps at 0.5rem each = 15.5rem */
          overflow-y: auto !important;
          overflow-x: hidden !important;
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
        
        /* Target file entry cards - ensure they fit grid cells perfectly, blue box styling, fixed height */
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
          min-height: 3.5rem !important;
          max-height: 3.5rem !important;
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
      {/* Saved DataFrames Panel - Always visible */}
      <div className="overflow-y-auto w-full flex flex-col flex-1 min-h-0" data-saved-dataframes-panel ref={panelContainerRef}>
        <div className="w-full" key={panelRefreshKey}>
          <SavedDataFramesPanel 
            isOpen={true} 
            onToggle={() => {}} 
            collapseDirection="right"
          />
        </div>
      </div>

      {/* Action Buttons - Only Continue (upload handled by Upload atom) */}
      <div className="flex items-center justify-end gap-3 px-3 pt-2 pb-2 border-t border-gray-200 flex-shrink-0 bg-white">
        <Button
          onClick={handleContinue}
          className="bg-blue-600 hover:bg-blue-700 text-white px-4 py-2"
        >
          Continue
          <ArrowRight className="w-4 h-4 ml-2" />
        </Button>
      </div>

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
