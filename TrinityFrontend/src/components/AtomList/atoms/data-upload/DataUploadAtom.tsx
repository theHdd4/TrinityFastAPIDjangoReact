import React, { useState, useEffect, useRef, useCallback } from 'react';
import { Upload, FolderOpen, Database, CheckCircle2, AlertCircle, RefreshCw, Loader2 } from 'lucide-react';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { useLaboratoryStore, DataUploadSettings, createDefaultDataUploadSettings } from '@/components/LaboratoryMode/store/laboratoryStore';
import { UPLOAD_API, VALIDATE_API } from '@/lib/api';
import { waitForTaskResult } from '@/lib/taskQueue';
import { getActiveProjectContext } from '@/utils/projectEnv';
import ErrorBoundary from '@/components/ErrorBoundary';
import { useAuth } from '@/contexts/AuthContext';
import { useToast } from '@/hooks/use-toast';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Checkbox } from '@/components/ui/checkbox';
import { Label } from '@/components/ui/label';

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
  const updateGuidedFlowStage = useLaboratoryStore((state) => state.updateGuidedFlowStage);
  const activeGuidedFlows = useLaboratoryStore((state) => state.activeGuidedFlows);
  const isGuidedModeActive = useLaboratoryStore((state) => state.isGuidedModeActiveForAtom(atomId));
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

  // File upload state
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const { user } = useAuth();
  const { toast } = useToast();
  const [pendingFile, setPendingFile] = useState<File | null>(null);
  const [isUploadModalOpen, setIsUploadModalOpen] = useState(false);
  const [sheetOptions, setSheetOptions] = useState<string[]>([]);
  const [selectedSheets, setSelectedSheets] = useState<string[]>([]);
  const [uploadingFile, setUploadingFile] = useState(false);
  const [uploadError, setUploadError] = useState('');
  const [hasMultipleSheets, setHasMultipleSheets] = useState(false);
  const [tempUploadMeta, setTempUploadMeta] = useState<{ 
    file_path: string; 
    file_name: string; 
    workbook_path?: string | null;
    upload_session_id?: string;
    sheetNameMap?: Record<string, string>;
  } | null>(null);

  // Sync primed files from settings only when they actually change
  useEffect(() => {
    const currentFilesJson = JSON.stringify(settings.uploadedFiles || []);
    if (currentFilesJson !== lastSyncedFilesRef.current) {
      lastSyncedFilesRef.current = currentFilesJson;
      setPrimedFiles(settings.uploadedFiles || []);
    }
  }, [settings.uploadedFiles]);

  // Note: We no longer auto-start the guided flow at U0
  // The atom's upload area IS step 1 (U0), so the guided flow only starts at U1 after file upload

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
    
    // Handle dropped files
    const files = e.dataTransfer.files;
    if (files && files.length > 0) {
      const firstFile = files[0];
      setPendingFile(firstFile);
      setUploadError('');
      setSheetOptions([]);
      setSelectedSheets([]);
      setHasMultipleSheets(false);
      setTempUploadMeta(null);
      // In guided mode, don't show modal - just upload directly
      if (!globalGuidedModeEnabled) {
        setIsUploadModalOpen(true);
      }
      void uploadSelectedFile(firstFile);
    }
  };

  // Helper functions for non-guided upload (same as SavedDataFramesPanel)
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
    const sanitized = base.replace(/[^A-Za-z0-9_.-]+/g, '_');
    return sanitized || 'dataframe';
  };

  const resetUploadState = () => {
    setPendingFile(null);
    setSheetOptions([]);
    setSelectedSheets([]);
    setUploadingFile(false);
    setUploadError('');
    setHasMultipleSheets(false);
    setTempUploadMeta(null);
    setIsUploadModalOpen(false);
  };

  const uploadSelectedFile = async (file: File, sheets?: string[]) => {
    setUploadingFile(true);
    setUploadError('');
    try {
      // Sanitize filename
      const sanitizedFileName = file.name.replace(/\s+/g, '_');
      const sanitizedFile = sanitizedFileName !== file.name
        ? new File([file], sanitizedFileName, { type: file.type, lastModified: file.lastModified })
        : file;

      // Check if it's an Excel file
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
        const sheetDetails = Array.isArray(data.sheet_details) ? data.sheet_details : [];
        const uploadSessionId = data.upload_session_id || data.session_id;
        const fileName = data.file_name || sanitizedFileName;

        if (sheetNames.length === 0) {
          throw new Error('No sheets found in Excel file');
        }

        // Create a map of original sheet names to normalized names
        const sheetNameMap: Record<string, string> = {};
        sheetDetails.forEach((detail: any) => {
          if (detail.original_name && detail.normalized_name) {
            sheetNameMap[detail.original_name] = detail.normalized_name;
          }
        });

        // If no details, normalize names ourselves
        if (Object.keys(sheetNameMap).length === 0) {
          sheetNames.forEach((name: string) => {
            const normalized = name.replace(/\s+/g, '_').replace(/[^a-zA-Z0-9_-]/g, '') || 'Sheet';
            sheetNameMap[name] = normalized;
          });
        }

        setTempUploadMeta({
          file_path: data.original_file_path || '',
          file_name: fileName,
          workbook_path: data.original_file_path || null,
          upload_session_id: uploadSessionId,
          sheetNameMap,
        });

        setSheetOptions(sheetNames);
        setSelectedSheets(sheets || sheetNames);
        setHasMultipleSheets(sheetNames.length > 1);

        if (sheetNames.length > 1 && !sheets) {
          // Show modal to select sheets
          setUploadingFile(false);
          setIsUploadModalOpen(true);
          return;
        }

        // Save all selected sheets
        await finalizeSaveMultiSheet(fileName, uploadSessionId, sheets || sheetNames);
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
          const detail = payload?.detail || (typeof payload === 'string' ? payload : '');
          throw new Error(detail || 'Upload failed');
        }
        const data = await waitForTaskResult(payload);
        await finalizeSave({ file_path: data.file_path, file_name: data.file_name || sanitizedFileName });
      }
    } catch (err: any) {
      setUploadError(err.message || 'Upload failed');
      setUploadingFile(false);
    }
  };

  const finalizeSave = async (meta: { file_path: string; file_name: string }) => {
    setUploadingFile(true);
    try {
      if (globalGuidedModeEnabled) {
        // Guided mode: Don't save yet, start guided flow at U1 (Structural Scan)
        const fileKey = deriveFileKey(meta.file_name);
        const uploadedFileInfo = {
          name: meta.file_name,
          path: meta.file_path,
          size: pendingFile?.size || 0,
          fileKey: fileKey,
          processed: false,
        };
        
        // Start guided flow at U1 (Structural Scan) - atom split panel is Step 1
        setActiveGuidedFlow(atomId, 'U1', {
          uploadedFiles: [uploadedFileInfo],
          currentStage: 'U1',
        });
        
        toast({ title: 'File uploaded', description: `${meta.file_name} is ready for processing.` });
        resetUploadState();
        // Refresh saved dataframes list in case backend saved it
        fetchSavedDataframes();
      } else {
        // Non-guided mode: Save directly
        const form = new FormData();
        form.append('validator_atom_id', 'panel-upload');
        form.append('file_paths', JSON.stringify([meta.file_path]));
        const fileKey = deriveFileKey(meta.file_name);
        form.append('file_keys', JSON.stringify([fileKey]));
        form.append('overwrite', 'false');
        const workbookPathsPayload = tempUploadMeta?.workbook_path ? [tempUploadMeta.workbook_path] : [];
        const sheetMetadataPayload = tempUploadMeta?.workbook_path
          ? [{ sheet_names: sheetOptions.length ? sheetOptions : selectedSheets.length > 0 ? selectedSheets : [], selected_sheet: selectedSheets.length > 0 ? selectedSheets[0] : sheetOptions[0] || '', original_filename: pendingFile?.name || tempUploadMeta.file_name || '' }]
          : [];
        if (workbookPathsPayload.length) {
          form.append('workbook_paths', JSON.stringify(workbookPathsPayload));
        }
        if (sheetMetadataPayload.length) {
          form.append('sheet_metadata', JSON.stringify(sheetMetadataPayload));
        }
        appendEnvFields(form);
        const res = await fetch(`${VALIDATE_API}/save_dataframes`, {
          method: 'POST',
          body: form,
          credentials: 'include'
        });
        if (!res.ok) {
          const txt = await res.text().catch(() => '');
          throw new Error(txt || 'Failed to save dataframe');
        }
        toast({ title: 'Dataframe saved', description: `${meta.file_name} uploaded successfully.` });
        resetUploadState();
        fetchSavedDataframes();
      }
    } catch (err: any) {
      setUploadError(err.message || 'Failed to save dataframe');
    } finally {
      setUploadingFile(false);
    }
  };

  const finalizeSaveMultiSheet = async (fileName: string, uploadSessionId: string, sheetsToSave: string[]) => {
    setUploadingFile(true);
    try {
      if (globalGuidedModeEnabled) {
        // Guided mode: Create file info for each sheet and start guided flow at U1 (Structural Scan)
        const uploadedFiles = sheetsToSave.map((sheetName) => {
          const normalizedSheetName = tempUploadMeta?.sheetNameMap?.[sheetName] || sheetName.replace(/\s+/g, '_').replace(/[^a-zA-Z0-9_-]/g, '') || 'Sheet';
          const excelFolderName = fileName.replace(/\.[^.]+$/, '').replace(/\s+/g, '_').replace(/\./g, '_');
          return {
            name: `${fileName} (${sheetName})`,
            path: tempUploadMeta?.file_path || '',
            size: pendingFile?.size || 0,
            fileKey: `${excelFolderName}_${normalizedSheetName}`,
            sheetNames: sheetsToSave,
            selectedSheet: sheetName,
            totalSheets: sheetsToSave.length,
            processed: false,
            uploadSessionId: uploadSessionId,
            sheetNameMap: tempUploadMeta?.sheetNameMap,
          };
        });
        
        // Start guided flow at U1 (Structural Scan) - atom split panel is Step 1
        setActiveGuidedFlow(atomId, 'U1', {
          uploadedFiles: uploadedFiles,
          currentStage: 'U1',
        });
        
        toast({ title: 'Files uploaded', description: `${sheetsToSave.length} sheet(s) ready for processing.` });
        resetUploadState();
        // Refresh saved dataframes list in case backend saved it
        fetchSavedDataframes();
      } else {
        // Non-guided mode: Save directly
        for (const sheetName of sheetsToSave) {
          try {
            const normalizedSheetName = tempUploadMeta?.sheetNameMap?.[sheetName] || sheetName.replace(/\s+/g, '_').replace(/[^a-zA-Z0-9_-]/g, '') || 'Sheet';
            const convertForm = new FormData();
            convertForm.append('upload_session_id', uploadSessionId);
            convertForm.append('sheet_name', normalizedSheetName);
            convertForm.append('original_filename', fileName);
            convertForm.append('use_folder_structure', 'true');
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
              setUploadError(`Failed to save sheet "${sheetName}": ${errorText}`);
              continue;
            }
          } catch (err: any) {
            console.error(`Error saving sheet ${sheetName}:`, err);
            setUploadError(`Error saving sheet "${sheetName}": ${err.message || 'Unknown error'}`);
          }
        }
        
        toast({ title: 'Files uploaded successfully', description: `Saved ${sheetsToSave.length} sheet${sheetsToSave.length > 1 ? 's' : ''} from ${fileName}.` });
        resetUploadState();
        fetchSavedDataframes();
      }
    } catch (err: any) {
      setUploadError(err.message || 'Failed to save');
    } finally {
      setUploadingFile(false);
    }
  };

  const handleSheetConfirm = () => {
    if (!pendingFile || selectedSheets.length === 0) return;
    if (!tempUploadMeta?.upload_session_id) {
      uploadSelectedFile(pendingFile, [selectedSheets[0]]);
      return;
    }
    finalizeSaveMultiSheet(tempUploadMeta.file_name, tempUploadMeta.upload_session_id, selectedSheets);
  };

  const triggerFilePicker = () => {
    fileInputRef.current?.click();
  };

  const handleFileInput = (event: React.ChangeEvent<HTMLInputElement>) => {
    const files = event.target.files;
    if (!files || files.length === 0) return;
    
    const firstFile = files[0];
    setPendingFile(firstFile);
    setUploadError('');
    setSheetOptions([]);
    setSelectedSheets([]);
    setHasMultipleSheets(false);
    setTempUploadMeta(null);
    // In guided mode, don't show modal - just upload directly
    if (!globalGuidedModeEnabled) {
      setIsUploadModalOpen(true);
    }
    void uploadSelectedFile(firstFile);
    event.target.value = '';
  };

  const handleUploadAreaClick = () => {
    // Always trigger file picker
    // In guided mode, after upload completes, the guided flow will start at U1
    // In non-guided mode, files are saved directly
    triggerFilePicker();
  };



  // Handle selecting an existing dataframe in guided mode
  const handleSelectExistingDataframe = (dataframe: SavedDataframe) => {
    if (!globalGuidedModeEnabled) return;
    
    const fileKey = dataframe.object_name.replace(/\.[^.]+$/, '').split('/').pop() || 'dataframe';
    const uploadedFileInfo = {
      name: dataframe.csv_name || dataframe.object_name.split('/').pop() || 'dataframe',
      path: dataframe.object_name,
      size: 0,
      fileKey: fileKey,
      processed: true,
    };
    
    // Start guided flow at U1 (Structural Scan) - atom split panel is Step 1
    setActiveGuidedFlow(atomId, 'U1', {
      uploadedFiles: [uploadedFileInfo],
      currentStage: 'U1',
    });
    
    toast({
      title: 'File selected',
      description: `${dataframe.csv_name || dataframe.object_name} selected for processing.`,
    });
  };

  // Render guided mode split panel
  const renderGuidedModeSplitPanel = () => (
    <div className="w-full h-full flex gap-3 p-3">
      {/* Left Panel - Select from Saved Dataframes */}
      <div className="flex-1 bg-white rounded-lg border border-gray-200 shadow-sm overflow-hidden flex flex-col">
        <div className="px-4 py-3 border-b border-gray-100 bg-gray-50">
          <h3 className="text-sm font-semibold text-gray-800">Select from Saved Dataframes</h3>
        </div>
        <div className="flex-1 overflow-y-auto p-3">
          {isLoading ? (
            <div className="flex items-center justify-center py-8">
              <Loader2 className="w-6 h-6 animate-spin text-blue-500" />
            </div>
          ) : fetchError ? (
            <div className="text-center py-4">
              <p className="text-xs text-gray-500 mb-2">{fetchError}</p>
              <Button variant="outline" size="sm" onClick={fetchSavedDataframes}>
                <RefreshCw className="w-3 h-3 mr-1" />
                Retry
              </Button>
            </div>
          ) : savedDataframes.length === 0 ? (
            <div className="text-center py-4 text-gray-500">
              <Database className="w-8 h-8 mx-auto mb-2 text-gray-300" />
              <p className="text-xs">No saved dataframes available</p>
            </div>
          ) : (
            <div className="space-y-2">
              {savedDataframes.map((df, idx) => (
                <button
                  key={idx}
                  onClick={() => handleSelectExistingDataframe(df)}
                  className="w-full text-left p-3 rounded-lg border border-gray-200 hover:border-blue-300 hover:bg-blue-50 transition-colors group"
                >
                  <div className="flex items-center gap-2">
                    <Database className="w-4 h-4 text-gray-400 group-hover:text-blue-500" />
                    <span className="text-sm font-medium text-gray-700 truncate group-hover:text-blue-700">
                      {df.csv_name || df.object_name.split('/').pop()}
                    </span>
                  </div>
                  {df.last_modified && (
                    <p className="text-xs text-gray-400 mt-1 ml-6">
                      Modified: {new Date(df.last_modified).toLocaleDateString()}
                    </p>
                  )}
                </button>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* Right Panel - Upload New Files */}
      <div className="flex-1 bg-white rounded-lg border border-gray-200 shadow-sm overflow-hidden flex flex-col">
        <div className="px-4 py-3 border-b border-gray-100 bg-gray-50">
          <h3 className="text-sm font-semibold text-gray-800">Upload New Files</h3>
        </div>
        <div className="flex-1 p-3 flex flex-col">
          {/* Hidden file input */}
          <input
            ref={fileInputRef}
            type="file"
            className="hidden"
            accept=".csv,.xlsx,.xls"
            multiple
            onChange={handleFileInput}
          />
          
          {/* Upload Drop Zone or Loading State */}
          {uploadingFile ? (
            <div className="flex-1 border-2 border-dashed border-blue-300 rounded-lg flex flex-col items-center justify-center text-center bg-blue-50/50">
              <Loader2 className="w-10 h-10 animate-spin text-blue-500 mb-3" />
              <p className="text-sm font-medium text-blue-700 mb-1">Uploading...</p>
              <p className="text-xs text-blue-500">{pendingFile?.name || 'Processing file'}</p>
            </div>
          ) : (
            <div
              className={`flex-1 border-2 border-dashed rounded-lg flex flex-col items-center justify-center text-center transition-all duration-300 cursor-pointer ${
                isDragOver 
                  ? 'border-blue-400 bg-blue-50' 
                  : 'border-gray-300 hover:border-blue-400 hover:bg-blue-50/30'
              }`}
              onDrop={handleDrop}
              onDragOver={handleDragOver}
              onDragLeave={handleDragLeave}
              onClick={handleUploadAreaClick}
            >
              <div className={`rounded-full bg-gradient-to-br from-blue-500 to-blue-600 flex items-center justify-center shadow-md transform transition-transform duration-300 ${
                isDragOver ? 'scale-110' : 'hover:scale-105'
              } w-12 h-12 mb-3`}>
                <Upload className="text-white w-6 h-6" />
              </div>
              <p className="text-sm font-medium text-gray-700 mb-1">
                {isDragOver ? 'Drop files here' : 'Drag and drop files'}
              </p>
              <p className="text-xs text-gray-500">or click to browse</p>
            </div>
          )}
          
          {/* Upload Error */}
          {uploadError && (
            <div className="mt-2 p-2 bg-red-50 border border-red-200 rounded-lg">
              <p className="text-xs text-red-600">{uploadError}</p>
            </div>
          )}
        </div>
      </div>
    </div>
  );

  // Render normal mode (original layout)
  const renderNormalMode = () => (
    <Card className="h-full flex flex-col shadow-sm border-2 border-blue-200 bg-white flex-1">
      <div className="flex-1 p-4 space-y-3 overflow-y-auto overflow-x-hidden">
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

        {/* Hidden file input for non-guided upload */}
        <input
          ref={fileInputRef}
          type="file"
          className="hidden"
          accept=".csv,.xlsx,.xls"
          multiple
          onChange={handleFileInput}
        />

        {/* Drag and Drop Area - Compact */}
        <div
          className={`border-2 border-dashed rounded-lg text-center transition-all duration-300 p-4 cursor-pointer ${
            isDragOver 
              ? 'border-blue-400 bg-blue-50' 
              : 'border-blue-300 hover:border-blue-400 bg-blue-50/50'
          }`}
          onDrop={handleDrop}
          onDragOver={handleDragOver}
          onDragLeave={handleDragLeave}
          onClick={handleUploadAreaClick}
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
              Upload CSV or Excel files directly
            </p>
          </div>
        </div>
      </div>
    </Card>
  );

  return (
    <div className="w-full h-full bg-gradient-to-br from-slate-50 to-blue-50 rounded-xl border border-gray-200 shadow-xl overflow-hidden flex">
      {globalGuidedModeEnabled ? renderGuidedModeSplitPanel() : renderNormalMode()}

      {/* Upload Modal for non-guided mode (Excel sheet selection) */}
      <Dialog open={isUploadModalOpen} onOpenChange={(open) => { if (!open) resetUploadState(); }}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Upload File</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            {uploadingFile && !hasMultipleSheets && (
              <div className="flex items-center justify-center py-8">
                <Loader2 className="w-8 h-8 animate-spin text-blue-500" />
                <span className="ml-2 text-sm text-gray-600">Uploading...</span>
              </div>
            )}
            {uploadError && (
              <div className="p-3 bg-red-50 border border-red-200 rounded-lg text-sm text-red-700">
                {uploadError}
              </div>
            )}
            {hasMultipleSheets && sheetOptions.length > 0 && (
              <div className="space-y-3">
                <p className="text-sm text-gray-600">
                  This Excel file has multiple sheets. Select which sheets to upload:
                </p>
                <div className="max-h-48 overflow-y-auto space-y-2 border rounded-lg p-3">
                  {sheetOptions.map((sheet) => (
                    <div key={sheet} className="flex items-center space-x-2">
                      <Checkbox
                        id={`sheet-${sheet}`}
                        checked={selectedSheets.includes(sheet)}
                        onCheckedChange={(checked) => {
                          if (checked) {
                            setSelectedSheets(prev => [...prev, sheet]);
                          } else {
                            setSelectedSheets(prev => prev.filter(s => s !== sheet));
                          }
                        }}
                      />
                      <Label htmlFor={`sheet-${sheet}`} className="text-sm cursor-pointer">
                        {sheet}
                      </Label>
                    </div>
                  ))}
                </div>
                <div className="flex justify-end gap-2">
                  <Button variant="outline" size="sm" onClick={resetUploadState} disabled={uploadingFile}>
                    Cancel
                  </Button>
                  <Button 
                    size="sm" 
                    onClick={handleSheetConfirm} 
                    disabled={selectedSheets.length === 0 || uploadingFile}
                  >
                    {uploadingFile ? <Loader2 className="w-4 h-4 animate-spin mr-2" /> : null}
                    Upload {selectedSheets.length} Sheet{selectedSheets.length !== 1 ? 's' : ''}
                  </Button>
                </div>
              </div>
            )}
          </div>
        </DialogContent>
      </Dialog>
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
