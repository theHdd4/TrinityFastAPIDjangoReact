import React, { useState, useEffect, useRef, useCallback } from 'react';
import { Upload, FileUp, FolderOpen, Sparkles, Database, CheckCircle2, AlertCircle, RefreshCw } from 'lucide-react';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Switch } from '@/components/ui/switch';
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
  const setActiveGuidedFlow = useLaboratoryStore((state) => state.setActiveGuidedFlow);
  const isGuidedModeActive = useLaboratoryStore((state) => state.isGuidedModeActiveForAtom(atomId));
  const toggleAtomGuidedMode = useLaboratoryStore((state) => state.toggleAtomGuidedMode);
  const globalGuidedModeEnabled = useLaboratoryStore((state) => state.globalGuidedModeEnabled);
  
  const settings = useLaboratoryStore((state) => {
    const currentAtom = state.getAtom(atomId);
    return currentAtom?.settings as DataUploadSettings || createDefaultDataUploadSettings();
  });
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
    
    // Refresh saved dataframes list
    fetchSavedDataframes();
  };

  const [isDragOver, setIsDragOver] = useState(false);

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragOver(true);
  };

  const handleDragLeave = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragOver(false);
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragOver(false);
    // Start guided flow when files are dropped
    handleStartGuidedFlow();
  };

  const handleStartGuidedFlow = () => {
    // Set active guided flow in store - CanvasArea will render the inline component
    setActiveGuidedFlow(atomId, 'U0', {});
  };

  return (
    <div className="w-full h-full bg-gradient-to-br from-slate-50 to-blue-50 rounded-xl border border-gray-200 shadow-xl overflow-hidden flex">
      <Card className="h-full flex flex-col shadow-sm border-2 border-blue-200 bg-white flex-1">
        <div className="flex-1 p-4 space-y-3 overflow-y-auto overflow-x-hidden">
          {/* Header - Compact */}
          <div className="flex items-center gap-2 mb-2">
            <div className="p-2 rounded-lg bg-gradient-to-br from-blue-500 to-blue-600 shadow-md">
              <Upload className="w-4 h-4 text-white" />
          </div>
          <div>
              <h2 className="text-sm font-bold text-gray-900">Data Upload</h2>
              <p className="text-xs text-gray-500">Upload and prime your data files</p>
          </div>
        </div>

          {/* Saved Dataframes Count - Compact */}
          {savedDataframes.length > 0 && (
            <div className="p-3 bg-blue-50 rounded-lg border border-blue-200">
              <div className="flex items-center gap-2">
                <FolderOpen className="w-4 h-4 text-blue-600" />
                <span className="text-xs text-blue-800">
                  <strong>{savedDataframes.length}</strong> dataframe{savedDataframes.length !== 1 ? 's' : ''} saved in project
                </span>
              </div>
            </div>
          )}

          {/* Primed Files Summary - Compact */}
        {primedFiles.length > 0 && (
            <div className="p-3 bg-green-50 rounded-lg border border-green-200">
              <div className="flex items-center gap-2 mb-1">
                <CheckCircle2 className="w-4 h-4 text-green-600" />
                <span className="text-xs font-medium text-green-800">Primed Files ({primedFiles.length})</span>
            </div>
              <div className="space-y-0.5">
                {primedFiles.slice(0, 2).map((file, idx) => (
                  <div key={idx} className="text-xs text-green-700 flex items-center gap-1.5">
                    <Database className="w-3 h-3" />
                    <span className="truncate">{file}</span>
                </div>
              ))}
                {primedFiles.length > 2 && (
                  <div className="text-xs text-green-600 italic">
                    +{primedFiles.length - 2} more files
                </div>
              )}
            </div>
          </div>
        )}

          {/* Error notice (non-blocking) - Compact */}
        {fetchError && savedDataframes.length === 0 && (
            <div className="p-2 bg-amber-50 rounded-lg border border-amber-200">
            <div className="flex items-center gap-2">
                <AlertCircle className="w-3 h-3 text-amber-600 flex-shrink-0" />
                <span className="text-xs text-amber-700 flex-1">
                Could not load saved dataframes. You can still upload files.
              </span>
              <button
                onClick={fetchSavedDataframes}
                  className="text-amber-700 hover:text-amber-800 text-xs underline"
              >
                Retry
              </button>
            </div>
          </div>
        )}

          {/* Drag and Drop Area - Compact */}
          <div
            className={`border-2 border-dashed rounded-lg text-center transition-all duration-300 p-4 ${
              isDragOver 
                ? 'border-blue-400 bg-blue-50' 
                : 'border-blue-300 hover:border-blue-400 bg-blue-50/50'
            }`}
            onDrop={handleDrop}
            onDragOver={handleDragOver}
            onDragLeave={handleDragLeave}
          >
            <div className="mb-3">
              <div className={`mx-auto rounded-xl bg-gradient-to-br from-blue-500 to-blue-600 flex items-center justify-center shadow-md transform transition-transform duration-300 ${
                isDragOver ? 'scale-110' : 'hover:scale-105'
              } w-12 h-12 mb-2`}>
                <Upload className="text-white drop-shadow-lg w-6 h-6" />
                </div>
              <p className="text-xs font-medium text-gray-700 mb-1">
                {isDragOver ? 'Drop files here' : 'Drag and drop files or click to upload'}
              </p>
              <p className="text-xs text-gray-500">
                Use our guided workflow to upload, clean, and prime your data files
                </p>
              </div>
            </div>

          {/* Per-Atom Guided Mode Toggle */}
          <div className="flex items-center justify-between p-2 bg-gray-50 rounded-lg border border-gray-200">
            <div className="flex items-center gap-2">
              <Sparkles className={`w-3.5 h-3.5 ${isGuidedModeActive ? 'text-purple-600' : 'text-gray-400'}`} />
              <span className="text-xs text-gray-600 font-medium">Guided Mode</span>
              {globalGuidedModeEnabled && (
                <span className="text-xs text-gray-400">(Global ON)</span>
              )}
            </div>
            <Switch
              checked={isGuidedModeActive}
              onCheckedChange={() => toggleAtomGuidedMode(atomId)}
              className="scale-[0.7]"
            />
          </div>

          {/* Start Guided Flow Button - Compact */}
          <Button
            className="w-full bg-gradient-to-r from-blue-500 to-blue-600 hover:from-blue-600 hover:to-blue-700 text-white shadow-md hover:shadow-lg transition-all duration-300 flex items-center justify-center gap-2 py-2.5 text-sm"
            onClick={handleStartGuidedFlow}
            disabled={!isGuidedModeActive}
          >
            <Sparkles className="w-4 h-4" />
            {primedFiles.length === 0 ? 'Start Guided Upload' : 'Upload More Files'}
          </Button>
        </div>
      </Card>
      </div>
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
      <div className="w-full h-full bg-gradient-to-br from-slate-50 to-blue-50 rounded-xl border border-gray-200 shadow-xl overflow-hidden flex items-center justify-center">
        <Card className="shadow-sm border-2 border-blue-200 bg-white p-4">
          <div className="text-center">
            <div className="w-12 h-12 mx-auto mb-3 rounded-full bg-amber-100 flex items-center justify-center">
              <AlertCircle className="w-6 h-6 text-amber-600" />
            </div>
            <h3 className="text-sm font-semibold text-gray-800 mb-2">
              Unable to Load Data Upload
            </h3>
            <p className="text-gray-600 mb-3 text-xs">
              The component encountered an error. This might be due to network issues.
            </p>
            <Button
              onClick={() => window.location.reload()}
              className="bg-blue-500 hover:bg-blue-600 text-white text-xs py-1.5 px-4"
            >
              <RefreshCw className="w-3 h-3 mr-2" />
              Reload Page
            </Button>
          </div>
        </Card>
        </div>
    );
  }
};

export default DataUploadAtom;
