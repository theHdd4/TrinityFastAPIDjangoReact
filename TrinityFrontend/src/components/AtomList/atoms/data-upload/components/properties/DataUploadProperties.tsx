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

  // Initial fetch when guided mode is active
  useEffect(() => {
    if (hasFetchedRef.current || !globalGuidedModeEnabled) return;
    hasFetchedRef.current = true;
    const timeoutId = setTimeout(() => fetchSavedDataframes(), 100);
    return () => clearTimeout(timeoutId);
  }, [fetchSavedDataframes, globalGuidedModeEnabled]);

  // Keep list in sync with uploads/deletes from other parts of the UI
  useEffect(() => {
    const handleDataframeChanged = () => {
      // Always use the latest handler
      fetchSavedDataframes();
    };

    window.addEventListener('dataframe-saved', handleDataframeChanged);
    window.addEventListener('dataframe-deleted', handleDataframeChanged);

    return () => {
      window.removeEventListener('dataframe-saved', handleDataframeChanged);
      window.removeEventListener('dataframe-deleted', handleDataframeChanged);
    };
  }, [fetchSavedDataframes]);

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

      // Check if it's an Excel file - use multi-sheet endpoint
      const isExcelFile = sanitizedFileName.toLowerCase().endsWith('.xlsx') || 
                         sanitizedFileName.toLowerCase().endsWith('.xls');

      if (isExcelFile) {
        // Use multi-sheet Excel upload endpoint
        const form = new FormData();
        form.append('file', sanitizedFile);
        appendEnvFields(form);
        
        const res = await fetch(`${VALIDATE_API}/upload-excel-multi-sheet`, {
          method: 'POST',
          body: form,
          credentials: 'include'
        });
        
        if (!res.ok) {
          const errorData = await res.json().catch(() => null);
          const detail = errorData?.detail || (typeof errorData === 'string' ? errorData : '');
          throw new Error(detail || 'Upload failed');
        }
        
        const data = await res.json();
        const sheetNames = Array.isArray(data.sheets) ? data.sheets : [];
        const uploadSessionId = data.upload_session_id || data.session_id;
        const fileName = data.file_name || sanitizedFileName;
        
        if (sheetNames.length === 0) {
          throw new Error('No sheets found in Excel file');
        }
        
        // For Properties panel, save the first sheet (or all sheets if only one)
        // Use convert endpoint to save sheet(s)
        for (let index = 0; index < sheetNames.length; index++) {
          const sheetName = sheetNames[index];
          const sheetIndex = index + 1; // 1-based index
          const normalizedSheetName = sheetName.replace(/\s+/g, '_').replace(/[^a-zA-Z0-9_-]/g, '') || 'Sheet';
          
          const convertForm = new FormData();
          convertForm.append('upload_session_id', uploadSessionId);
          convertForm.append('sheet_name', normalizedSheetName);
          convertForm.append('original_filename', fileName);
          convertForm.append('use_folder_structure', 'false');
          convertForm.append('sheet_index', String(sheetIndex));
          appendEnvFields(convertForm);
          
          const convertRes = await fetch(`${VALIDATE_API}/convert-session-sheet-to-arrow`, {
            method: 'POST',
            body: convertForm,
            credentials: 'include'
          });
          
          if (!convertRes.ok) {
            const errorData = await convertRes.json().catch(() => null);
            const errorText = errorData?.detail || await convertRes.text().catch(() => '');
            console.warn(`Failed to convert sheet ${sheetName}:`, errorText);
            continue;
          }
          
          const convertData = await convertRes.json();
          const sheetPath = convertData.file_path || '';
          const displayFileName = convertData.file_name || `${fileName}_sheet${sheetIndex}`;
          
          if (sheetPath) {
            // Dispatch dataframe-saved event to trigger refresh
            window.dispatchEvent(new CustomEvent('dataframe-saved', { 
              detail: { filePath: sheetPath, fileName: displayFileName } 
            }));
          }
        }
        
        toast({ 
          title: 'File uploaded', 
          description: `${sheetNames.length} sheet${sheetNames.length > 1 ? 's' : ''} from ${fileName} uploaded successfully.` 
        });
      } else {
        // CSV or other file - use regular upload endpoint
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
        
        // Save the file to saved dataframes (same as SavedDataFramesPanel)
        const saveForm = new FormData();
        saveForm.append('validator_atom_id', 'panel-upload');
        saveForm.append('file_paths', JSON.stringify([data.file_path]));
        const fileKey = deriveFileKey(data.file_name || sanitizedFileName);
        saveForm.append('file_keys', JSON.stringify([fileKey]));
        saveForm.append('overwrite', 'false');
        appendEnvFields(saveForm);
        
        const saveRes = await fetch(`${VALIDATE_API}/save_dataframes`, {
          method: 'POST',
          body: saveForm,
          credentials: 'include'
        });
        
        if (!saveRes.ok) {
          const txt = await saveRes.text().catch(() => '');
          throw new Error(txt || 'Failed to save dataframe');
        }
        
        const saveResult = await saveRes.json().catch(() => null);
        
        // Dispatch dataframe-saved event to trigger refresh
        if (saveResult?.minio_uploads && Array.isArray(saveResult.minio_uploads)) {
          saveResult.minio_uploads.forEach((upload: any) => {
            const objectName = upload?.minio_upload?.object_name || upload?.filename;
            if (objectName) {
              window.dispatchEvent(new CustomEvent('dataframe-saved', { 
                detail: { filePath: objectName, fileName: data.file_name || sanitizedFileName } 
              }));
            }
          });
        } else {
          // Fallback: dispatch event with available data
          window.dispatchEvent(new CustomEvent('dataframe-saved', { 
            detail: { filePath: data.file_path, fileName: data.file_name || sanitizedFileName } 
          }));
        }
        
        const uploadedFileInfo = {
          name: data.file_name || sanitizedFileName,
          path: data.file_path,
          size: file.size,
          fileKey: fileKey,
          processed: false,
        };
        
        // Start guided flow at U2 if guided mode is enabled
        if (globalGuidedModeEnabled) {
          setActiveGuidedFlow(atomId, 'U2', {
            uploadedFiles: [uploadedFileInfo],
            currentStage: 'U2',
          });
        }
        
        toast({ title: 'File uploaded', description: `${data.file_name || sanitizedFileName} uploaded successfully.` });
      }
      
      // Refresh saved dataframes list
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

