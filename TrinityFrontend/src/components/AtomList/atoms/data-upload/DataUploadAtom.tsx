import React, { useState, useEffect, useRef, useCallback } from 'react';
import { Upload, FileUp, FolderOpen, Sparkles, Database, CheckCircle2, AlertCircle, RefreshCw } from 'lucide-react';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { GuidedUploadFlow } from './components/guided-upload';
import { useLaboratoryStore, DataUploadSettings, createDefaultDataUploadSettings } from '@/components/LaboratoryMode/store/laboratoryStore';
import { UPLOAD_API } from '@/lib/api';
import { getActiveProjectContext } from '@/utils/projectEnv';
import ErrorBoundary from '@/components/ErrorBoundary';

interface DataUploadAtomProps {
  atomId: string;
}

interface SavedDataframe {
  object_name: string;
  csv_name: string;
  arrow_name?: string;
  last_modified?: string;
}

const DataUploadAtomContent: React.FC<DataUploadAtomProps> = ({ atomId }) => {
  const updateSettings = useLaboratoryStore((state) => state.updateAtomSettings);
  
  const settings = useLaboratoryStore((state) => {
    const currentAtom = state.getAtom(atomId);
    return currentAtom?.settings as DataUploadSettings || createDefaultDataUploadSettings();
  });

  const [isGuidedFlowOpen, setIsGuidedFlowOpen] = useState(false);
  const [savedDataframes, setSavedDataframes] = useState<SavedDataframe[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [primedFiles, setPrimedFiles] = useState<string[]>(() => {
    // Initialize from settings if available
    return settings.uploadedFiles || [];
  });
  const [fetchError, setFetchError] = useState<string | null>(null);
  
  // Use ref to track if we've already synced from settings to prevent infinite loop
  const lastSyncedFilesRef = useRef<string>(JSON.stringify(settings.uploadedFiles || []));
  const hasFetchedRef = useRef(false);

  // Sync primed files from settings only when they actually change
  useEffect(() => {
    const currentFilesJson = JSON.stringify(settings.uploadedFiles || []);
    if (currentFilesJson !== lastSyncedFilesRef.current) {
      lastSyncedFilesRef.current = currentFilesJson;
      setPrimedFiles(settings.uploadedFiles || []);
    }
  }, [settings.uploadedFiles]);

  // Memoized fetch function
  const fetchSavedDataframes = useCallback(async () => {
    setFetchError(null);
    setIsLoading(true);
    
    try {
      const projectCtx = getActiveProjectContext();
      const params = new URLSearchParams();
      if (projectCtx.client_name) params.append('client_name', projectCtx.client_name);
      if (projectCtx.app_name) params.append('app_name', projectCtx.app_name);
      if (projectCtx.project_name) params.append('project_name', projectCtx.project_name);
      
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 10000); // 10s timeout
      
      const response = await fetch(`${UPLOAD_API}/list_saved_dataframes?${params.toString()}`, {
        signal: controller.signal,
        credentials: 'include',
      });
      
      clearTimeout(timeoutId);
      
      if (response.ok) {
        const data = await response.json();
        setSavedDataframes(data.files || []);
      } else {
        // Non-critical error - just log it, don't crash
        console.warn('Failed to fetch saved dataframes:', response.status);
      }
    } catch (error: any) {
      // Handle network errors gracefully - this is non-critical for the component to work
      if (error.name === 'AbortError') {
        console.warn('Fetch saved dataframes timed out');
      } else {
        console.error('Error fetching saved dataframes:', error);
      }
      // Set error only for display purposes, don't throw
      setFetchError('Unable to fetch saved dataframes');
    } finally {
      setIsLoading(false);
    }
  }, []);

  // Fetch saved dataframes after initial render (deferred, non-blocking)
  useEffect(() => {
    if (hasFetchedRef.current) return;
    hasFetchedRef.current = true;
    
    // Delay the API call slightly to ensure the component renders first
    const timeoutId = setTimeout(() => {
      fetchSavedDataframes();
    }, 100);
    
    return () => clearTimeout(timeoutId);
  }, [fetchSavedDataframes]);

  const handleGuidedFlowComplete = (result: {
    uploadedFiles: any[];
    headerSelections: Record<string, any>;
    columnNameEdits: Record<string, any[]>;
    dataTypeSelections: Record<string, any[]>;
    missingValueStrategies: Record<string, any[]>;
  }) => {
    console.log('Data Upload completed:', result);
    
    // Update settings with the uploaded files
    const fileNames = result.uploadedFiles.map(f => f.name);
    const filePathMap: Record<string, string> = {};
    result.uploadedFiles.forEach(f => {
      filePathMap[f.name] = f.path;
    });
    
    updateSettings(atomId, {
      uploadedFiles: fileNames,
      filePathMap: filePathMap,
    });
    
    setPrimedFiles(fileNames);
    setIsGuidedFlowOpen(false);
    
    // Refresh saved dataframes list
    fetchSavedDataframes();
  };

  return (
    <Card className="h-full flex flex-col bg-gradient-to-br from-blue-50 to-white border-2 border-blue-200">
      <div className="p-6 flex-1 flex flex-col">
        {/* Header */}
        <div className="flex items-center gap-3 mb-6">
          <div className="p-3 rounded-xl bg-gradient-to-br from-blue-500 to-blue-600 shadow-lg">
            <Upload className="w-6 h-6 text-white" />
          </div>
          <div>
            <h2 className="text-xl font-bold text-gray-900">Data Upload</h2>
            <p className="text-sm text-gray-500">Upload and prime your data files</p>
          </div>
        </div>

        {/* Primed Files Summary */}
        {primedFiles.length > 0 && (
          <div className="mb-6 p-4 bg-green-50 rounded-lg border border-green-200">
            <div className="flex items-center gap-2 mb-2">
              <CheckCircle2 className="w-5 h-5 text-green-600" />
              <span className="font-medium text-green-800">Primed Files ({primedFiles.length})</span>
            </div>
            <div className="space-y-1">
              {primedFiles.slice(0, 3).map((file, idx) => (
                <div key={idx} className="text-sm text-green-700 flex items-center gap-2">
                  <Database className="w-4 h-4" />
                  {file}
                </div>
              ))}
              {primedFiles.length > 3 && (
                <div className="text-sm text-green-600 italic">
                  +{primedFiles.length - 3} more files
                </div>
              )}
            </div>
          </div>
        )}

        {/* Saved Dataframes Count */}
        {savedDataframes.length > 0 && (
          <div className="mb-6 p-4 bg-blue-50 rounded-lg border border-blue-200">
            <div className="flex items-center gap-2">
              <FolderOpen className="w-5 h-5 text-blue-600" />
              <span className="text-sm text-blue-800">
                <strong>{savedDataframes.length}</strong> dataframe{savedDataframes.length !== 1 ? 's' : ''} saved in project
              </span>
            </div>
          </div>
        )}

        {/* Error notice (non-blocking) */}
        {fetchError && savedDataframes.length === 0 && (
          <div className="mb-4 p-3 bg-amber-50 rounded-lg border border-amber-200">
            <div className="flex items-center gap-2">
              <AlertCircle className="w-4 h-4 text-amber-600 flex-shrink-0" />
              <span className="text-sm text-amber-700">
                Could not load saved dataframes. You can still upload files.
              </span>
              <button
                onClick={fetchSavedDataframes}
                className="ml-auto text-amber-700 hover:text-amber-800 text-sm underline"
              >
                Retry
              </button>
            </div>
          </div>
        )}

        {/* Main Action Area */}
        <div className="flex-1 flex flex-col items-center justify-center">
          {primedFiles.length === 0 ? (
            <>
              <div className="text-center mb-8">
                <div className="w-20 h-20 mx-auto mb-4 rounded-full bg-gradient-to-br from-blue-100 to-blue-200 flex items-center justify-center">
                  <FileUp className="w-10 h-10 text-blue-600" />
                </div>
                <h3 className="text-lg font-semibold text-gray-800 mb-2">
                  Ready to Upload Your Data
                </h3>
                <p className="text-gray-600 max-w-sm">
                  Use our guided workflow to upload, clean, and prime your data files for analysis
                </p>
              </div>
            </>
          ) : (
            <div className="text-center mb-6">
              <p className="text-gray-600">
                Upload additional files or re-run the guided workflow
              </p>
            </div>
          )}

          {/* Start Guided Flow Button */}
          <Button
            size="lg"
            className="bg-gradient-to-r from-blue-500 to-blue-600 hover:from-blue-600 hover:to-blue-700 text-white shadow-lg hover:shadow-xl transition-all duration-300 flex items-center gap-2 px-8 py-6 text-lg"
            onClick={() => setIsGuidedFlowOpen(true)}
          >
            <Sparkles className="w-5 h-5" />
            {primedFiles.length === 0 ? 'Start Guided Upload' : 'Upload More Files'}
          </Button>
        </div>
      </div>

      {/* Guided Upload Flow Modal */}
      <GuidedUploadFlow
        open={isGuidedFlowOpen}
        onOpenChange={setIsGuidedFlowOpen}
        onComplete={handleGuidedFlowComplete}
      />
    </Card>
  );
};

// Wrapper component with ErrorBoundary for crash protection
const DataUploadAtom: React.FC<DataUploadAtomProps> = ({ atomId }) => {
  try {
    return (
      <ErrorBoundary>
        <DataUploadAtomContent atomId={atomId} />
      </ErrorBoundary>
    );
  } catch (err) {
    console.error('DataUploadAtom: Component error:', err);
    return (
      <Card className="h-full flex flex-col bg-gradient-to-br from-blue-50 to-white border-2 border-blue-200">
        <div className="p-6 flex-1 flex flex-col items-center justify-center">
          <div className="text-center">
            <div className="w-16 h-16 mx-auto mb-4 rounded-full bg-amber-100 flex items-center justify-center">
              <AlertCircle className="w-8 h-8 text-amber-600" />
            </div>
            <h3 className="text-lg font-semibold text-gray-800 mb-2">
              Unable to Load Data Upload
            </h3>
            <p className="text-gray-600 mb-4 text-sm">
              The component encountered an error. This might be due to network issues.
            </p>
            <Button
              onClick={() => window.location.reload()}
              className="bg-blue-500 hover:bg-blue-600 text-white"
            >
              <RefreshCw className="w-4 h-4 mr-2" />
              Reload Page
            </Button>
          </div>
        </div>
      </Card>
    );
  }
};

export default DataUploadAtom;
