import React, { useState, useEffect } from 'react';
import { Upload, FileUp, FolderOpen, Sparkles, Database, CheckCircle2 } from 'lucide-react';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { GuidedUploadFlow } from './components/guided-upload';
import { useLaboratoryStore, DataUploadSettings, createDefaultDataUploadSettings } from '@/components/LaboratoryMode/store/laboratoryStore';
import { UPLOAD_API } from '@/lib/api';
import { getActiveProjectContext } from '@/utils/projectEnv';

interface DataUploadAtomProps {
  atomId: string;
}

interface SavedDataframe {
  object_name: string;
  csv_name: string;
  arrow_name?: string;
  last_modified?: string;
}

const DataUploadAtom: React.FC<DataUploadAtomProps> = ({ atomId }) => {
  const atom = useLaboratoryStore((state) => state.getAtom(atomId));
  const updateSettings = useLaboratoryStore((state) => state.updateAtomSettings);
  
  const settings = useLaboratoryStore((state) => {
    const currentAtom = state.getAtom(atomId);
    return currentAtom?.settings as DataUploadSettings || createDefaultDataUploadSettings();
  });

  const [isGuidedFlowOpen, setIsGuidedFlowOpen] = useState(false);
  const [savedDataframes, setSavedDataframes] = useState<SavedDataframe[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [primedFiles, setPrimedFiles] = useState<string[]>([]);
  const [isInitialized, setIsInitialized] = useState(false);
  const [initError, setInitError] = useState<string | null>(null);

  // Fetch saved dataframes on mount with retry logic
  useEffect(() => {
    let cancelled = false;
    let retryCount = 0;
    const maxRetries = 3;
    const retryDelay = 1000;

    const initializeComponent = async () => {
      // Wait for atom to be registered in the store
      if (!atom) {
        if (retryCount < maxRetries) {
          retryCount++;
          setTimeout(initializeComponent, retryDelay);
          return;
        } else {
          // Atom still not available after retries, but continue anyway
          // as settings will use default values
          console.warn(`[DataUploadAtom] Atom ${atomId} not found after ${maxRetries} retries, using defaults`);
        }
      }

      if (!cancelled) {
        setIsInitialized(true);
        fetchSavedDataframes();
      }
    };

    initializeComponent();

    return () => {
      cancelled = true;
    };
  }, [atomId, atom]);

  // Track primed files from settings
  useEffect(() => {
    if (settings.uploadedFiles && settings.uploadedFiles.length > 0) {
      setPrimedFiles(settings.uploadedFiles);
    }
  }, [settings.uploadedFiles]);

  const fetchSavedDataframes = async () => {
    setIsLoading(true);
    setInitError(null);
    try {
      const projectCtx = getActiveProjectContext();
      const params = new URLSearchParams();
      if (projectCtx?.client_name) params.append('client_name', projectCtx.client_name);
      if (projectCtx?.app_name) params.append('app_name', projectCtx.app_name);
      if (projectCtx?.project_name) params.append('project_name', projectCtx.project_name);
      
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 10000); // 10 second timeout
      
      try {
        const response = await fetch(`${UPLOAD_API}/list_saved_dataframes?${params.toString()}`, {
          signal: controller.signal,
          credentials: 'include',
        });
        clearTimeout(timeoutId);
        
        if (response.ok) {
          const data = await response.json();
          setSavedDataframes(data.files || []);
        } else {
          // Non-OK response, but don't crash - just log and continue
          console.warn(`[DataUploadAtom] list_saved_dataframes returned ${response.status}`);
        }
      } catch (fetchError: any) {
        clearTimeout(timeoutId);
        if (fetchError.name === 'AbortError') {
          console.warn('[DataUploadAtom] Fetch timed out');
        } else {
          throw fetchError;
        }
      }
    } catch (error) {
      console.error('[DataUploadAtom] Error fetching saved dataframes:', error);
      // Don't set error state for network issues - just continue with empty list
      // The user can still use the upload functionality
    } finally {
      setIsLoading(false);
    }
  };

  // Show loading state while initializing
  if (!isInitialized) {
    return (
      <Card className="h-full flex flex-col bg-gradient-to-br from-blue-50 to-white border-2 border-blue-200">
        <div className="p-6 flex-1 flex flex-col items-center justify-center">
          <div className="animate-pulse flex flex-col items-center">
            <div className="w-16 h-16 rounded-full bg-blue-200 mb-4"></div>
            <div className="h-4 w-32 bg-blue-200 rounded mb-2"></div>
            <div className="h-3 w-48 bg-blue-100 rounded"></div>
          </div>
        </div>
      </Card>
    );
  }

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

export default DataUploadAtom;
