import React, { useRef, useState, useCallback, useEffect } from 'react';
import { Upload, Database, Sparkles, Loader2, RefreshCw } from 'lucide-react';
import { Card } from '@/components/ui/card';
import { useLaboratoryStore, DataUploadSettings, createDefaultDataUploadSettings } from '@/components/LaboratoryMode/store/laboratoryStore';
import { UPLOAD_API, VALIDATE_API } from '@/lib/api';
import { waitForTaskResult } from '@/lib/taskQueue';
import { getActiveProjectContext } from '@/utils/projectEnv';
import { useAuth } from '@/contexts/AuthContext';
import { useToast } from '@/hooks/use-toast';

interface Props {
  atomId: string;
}

interface SavedDataframe {
  object_name: string;
  csv_name: string;
  arrow_name?: string;
  last_modified?: string;
}

const DataUploadProperties: React.FC<Props> = ({ atomId }) => {
  const atom = useLaboratoryStore((state) => state.getAtom(atomId));
  const settings = (atom?.settings as DataUploadSettings) || createDefaultDataUploadSettings();
  const globalGuidedModeEnabled = useLaboratoryStore((state) => state.globalGuidedModeEnabled);
  const setActiveGuidedFlow = useLaboratoryStore((state) => state.setActiveGuidedFlow);
  
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const { user } = useAuth();
  const { toast } = useToast();
  
  const [savedDataframes, setSavedDataframes] = useState<SavedDataframe[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [fetchError, setFetchError] = useState<string | null>(null);
  const [uploadingFile, setUploadingFile] = useState(false);
  const [isDragOver, setIsDragOver] = useState(false);
  const hasFetchedRef = useRef(false);

  // Fetch saved dataframes
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
      const timeoutId = setTimeout(() => controller.abort(), 10000);

      // Use the same endpoint as Saved DataFrames panel so results stay in sync
      const response = await fetch(`${VALIDATE_API}/list_saved_dataframes?${params.toString()}`, {
        signal: controller.signal,
        credentials: 'include',
      });
      
      clearTimeout(timeoutId);
      
      if (response.ok) {
        const data = await response.json();
        setSavedDataframes(data.files || []);
      }
    } catch (error: any) {
      if (error.name !== 'AbortError') {
        setFetchError('Unable to fetch saved dataframes');
      }
    } finally {
      setIsLoading(false);
    }
  }, []);

  // Initial fetch
  useEffect(() => {
    if (hasFetchedRef.current || !globalGuidedModeEnabled) return;
    hasFetchedRef.current = true;
    const timeoutId = setTimeout(() => fetchSavedDataframes(), 100);
    return () => clearTimeout(timeoutId);
  }, [fetchSavedDataframes, globalGuidedModeEnabled]);

  // Refresh when the component becomes visible/active (focus)
  useEffect(() => {
    const handleFocus = () => {
      if (globalGuidedModeEnabled) {
        fetchSavedDataframes();
      }
    };
    window.addEventListener('focus', handleFocus);
    return () => window.removeEventListener('focus', handleFocus);
  }, [fetchSavedDataframes, globalGuidedModeEnabled]);

  const appendEnvFields = (form: FormData) => {
    const envStr = localStorage.getItem('env');
    if (envStr) {
      try {
        const env = JSON.parse(envStr);
        form.append('client_id', env.CLIENT_ID || '');
        form.append('app_id', env.APP_ID || '');
        form.append('project_id', env.PROJECT_ID || '');
        form.append('client_name', env.CLIENT_NAME || '');
        form.append('app_name', env.APP_NAME || '');
        form.append('project_name', env.PROJECT_NAME || '');
      } catch { /* ignore */ }
    }
    if (user?.id) {
      form.append('user_id', String(user.id));
    }
  };

  const deriveFileKey = (name: string) => {
    const base = name.replace(/\.[^.]+$/, '') || 'dataframe';
    return base.replace(/[^A-Za-z0-9_.-]+/g, '_') || 'dataframe';
  };

  const handleFileUpload = async (file: File) => {
    setUploadingFile(true);
    try {
      const sanitizedFileName = file.name.replace(/\s+/g, '_');
      const sanitizedFile = sanitizedFileName !== file.name
        ? new File([file], sanitizedFileName, { type: file.type, lastModified: file.lastModified })
        : file;

      const form = new FormData();
      form.append('file', sanitizedFile);
      appendEnvFields(form);
      
      const res = await fetch(`${VALIDATE_API}/upload-file`, {
        method: 'POST',
        body: form,
        credentials: 'include'
      });
      
      const payload = await res.json().catch(() => null);
      if (!res.ok || !payload) {
        throw new Error(payload?.detail || 'Upload failed');
      }
      
      const data = await waitForTaskResult(payload);
      const fileKey = deriveFileKey(data.file_name || sanitizedFileName);
      const uploadedFileInfo = {
        name: data.file_name || sanitizedFileName,
        path: data.file_path,
        size: file.size,
        fileKey: fileKey,
        processed: false,
      };
      
      // Start guided flow at U2 (U0 and U1 removed)
      setActiveGuidedFlow(atomId, 'U2', {
        uploadedFiles: [uploadedFileInfo],
        currentStage: 'U2',
      });
      
      toast({ title: 'File uploaded', description: `${data.file_name || sanitizedFileName} is ready for processing.` });
      // Refresh saved dataframes list in case backend saved it
      fetchSavedDataframes();
    } catch (err: any) {
      toast({ title: 'Upload failed', description: err.message, variant: 'destructive' });
    } finally {
      setUploadingFile(false);
    }
  };

  const handleSelectExistingDataframe = (dataframe: SavedDataframe) => {
    const fileKey = dataframe.object_name.replace(/\.[^.]+$/, '').split('/').pop() || 'dataframe';
    const uploadedFileInfo = {
      name: dataframe.csv_name || dataframe.object_name.split('/').pop() || 'dataframe',
      path: dataframe.object_name,
      size: 0,
      fileKey: fileKey,
      processed: true,
    };
    
    // Start guided flow at U2 (U0 and U1 removed)
    setActiveGuidedFlow(atomId, 'U2', {
      uploadedFiles: [uploadedFileInfo],
      currentStage: 'U2',
    });
    
    toast({
      title: 'File selected',
      description: `${dataframe.csv_name || dataframe.object_name} selected for processing.`,
    });
  };

  const triggerFilePicker = () => fileInputRef.current?.click();

  const handleFileInput = (event: React.ChangeEvent<HTMLInputElement>) => {
    const files = event.target.files;
    if (files && files.length > 0) {
      handleFileUpload(files[0]);
    }
    event.target.value = '';
  };

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragOver(true);
  };

  const handleDragLeave = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragOver(false);
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragOver(false);
    const files = e.dataTransfer.files;
    if (files && files.length > 0) {
      handleFileUpload(files[0]);
    }
  };

  return (
    <div className="p-4 space-y-4">
      {/* Header */}
      <div className="flex items-center gap-2 pb-3 border-b">
        <Upload className="w-5 h-5 text-blue-500" />
        <h3 className="font-semibold text-gray-800">Data Upload Settings</h3>
      </div>

      {/* Hidden file input */}
      <input
        ref={fileInputRef}
        type="file"
        className="hidden"
        accept=".csv,.xlsx,.xls"
        onChange={handleFileInput}
      />

      {/* Guided Mode: Two options - Upload New & Select Existing */}
      {globalGuidedModeEnabled ? (
        <div className="space-y-3">
          {/* Upload New File Option */}
          <Card 
            className={`p-4 cursor-pointer transition-all hover:border-blue-400 hover:bg-blue-50/50 ${
              isDragOver ? 'border-blue-400 bg-blue-50' : ''
            }`}
            onClick={triggerFilePicker}
            onDragOver={handleDragOver}
            onDragLeave={handleDragLeave}
            onDrop={handleDrop}
          >
            {uploadingFile ? (
              <div className="flex flex-col items-center py-4">
                <Loader2 className="w-8 h-8 animate-spin text-blue-500 mb-2" />
                <p className="text-sm text-blue-600">Uploading...</p>
              </div>
            ) : (
              <div className="flex flex-col items-center py-4">
                <div className="w-12 h-12 rounded-full bg-blue-100 flex items-center justify-center mb-3">
                  <Upload className="w-6 h-6 text-blue-600" />
                </div>
                <p className="text-sm font-medium text-gray-700">Upload New File</p>
                <p className="text-xs text-gray-500 mt-1">CSV, XLSX, XLS</p>
              </div>
            )}
          </Card>

          {/* Select Existing Dataframe Option */}
          <Card className="p-4">
            <div className="flex items-center gap-2 mb-3">
              <Database className="w-5 h-5 text-green-600" />
              <p className="text-sm font-medium text-gray-700">Select Existing Dataframe</p>
            </div>
            
            {isLoading ? (
              <div className="flex items-center justify-center py-4">
                <Loader2 className="w-5 h-5 animate-spin text-gray-400" />
              </div>
            ) : fetchError ? (
              <div className="text-center py-2">
                <p className="text-xs text-gray-500 mb-2">{fetchError}</p>
                <button 
                  onClick={fetchSavedDataframes}
                  className="text-xs text-blue-600 hover:underline flex items-center gap-1 mx-auto"
                >
                  <RefreshCw className="w-3 h-3" /> Retry
                </button>
              </div>
            ) : savedDataframes.length === 0 ? (
              <p className="text-xs text-gray-500 text-center py-2">No saved dataframes</p>
            ) : (
              <div className="space-y-1 max-h-40 overflow-y-auto">
                {savedDataframes.map((df, idx) => (
                  <button
                    key={idx}
                    onClick={() => handleSelectExistingDataframe(df)}
                    className="w-full text-left px-3 py-2 rounded hover:bg-green-50 text-sm text-gray-700 flex items-center gap-2 transition-colors"
                  >
                    <Database className="w-4 h-4 text-gray-400" />
                    <span className="truncate">{df.csv_name || df.object_name.split('/').pop()}</span>
                  </button>
                ))}
              </div>
            )}
          </Card>
        </div>
      ) : (
        /* Normal Mode: Only Upload Option */
        <Card 
          className={`p-4 cursor-pointer transition-all hover:border-blue-400 hover:bg-blue-50/50 ${
            isDragOver ? 'border-blue-400 bg-blue-50' : ''
          }`}
          onClick={triggerFilePicker}
          onDragOver={handleDragOver}
          onDragLeave={handleDragLeave}
          onDrop={handleDrop}
        >
          {uploadingFile ? (
            <div className="flex flex-col items-center py-6">
              <Loader2 className="w-10 h-10 animate-spin text-blue-500 mb-3" />
              <p className="text-sm text-blue-600">Uploading...</p>
            </div>
          ) : (
            <div className="flex flex-col items-center py-6">
              <div className="w-14 h-14 rounded-full bg-blue-100 flex items-center justify-center mb-3">
                <Upload className="w-7 h-7 text-blue-600" />
              </div>
              <p className="text-sm font-medium text-gray-700">Upload File</p>
              <p className="text-xs text-gray-500 mt-1">Drag & drop or click to browse</p>
              <p className="text-xs text-gray-400 mt-1">CSV, XLSX, XLS files</p>
            </div>
          )}
        </Card>
      )}

      {/* Empty State - Only show when no files and not in guided mode */}
      {(!settings.uploadedFiles || settings.uploadedFiles.length === 0) && !globalGuidedModeEnabled && (
        <div className="text-center py-4 text-gray-500">
          <p className="text-xs">No files uploaded yet</p>
        </div>
      )}
    </div>
  );
};

export default DataUploadProperties;

