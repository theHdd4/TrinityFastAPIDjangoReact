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
import { PartialPrimedCard } from '@/components/LaboratoryMode/LandingScreen/PartialPrimedCard';
import { DirectReviewPanel } from '@/components/LaboratoryMode/components/DirectReviewPanel';
import { GuidedUploadFlowInline } from '@/components/AtomList/atoms/data-upload/components/guided-upload/GuidedUploadFlowInline';
import { openGuidedMode } from '@/components/LaboratoryMode/components/equalizer_icon/openGuidedMode';
import { useLaboratoryStore } from '@/components/LaboratoryMode/store/laboratoryStore';
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
  const isGuidedModeActiveForAtom = useLaboratoryStore((state) => state.isGuidedModeActiveForAtom);
  const directReviewTarget = useLaboratoryStore((state) => state.directReviewTarget);
  const setDirectReviewTarget = useLaboratoryStore((state) => state.setDirectReviewTarget);
  const removeActiveGuidedFlow = useLaboratoryStore((state) => state.removeActiveGuidedFlow);
  const updateAtomSettings = useLaboratoryStore((state) => state.updateAtomSettings);
  const setGlobalGuidedMode = useLaboratoryStore((state) => state.setGlobalGuidedMode);
  const cards = useLaboratoryStore((state) => state.cards);
  
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
  const [reloadToken, setReloadToken] = useState(0);
  
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
  const [pendingFilesQueue, setPendingFilesQueue] = useState<File[]>([]);
  const [tempUploadMeta, setTempUploadMeta] = useState<{ 
    file_path: string; 
    file_name: string; 
    workbook_path?: string | null;
    upload_session_id?: string;
    sheetNameMap?: Record<string, string>;
  } | null>(null);
  const panelContainerRef = useRef<HTMLDivElement | null>(null);

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
      
      const response = await fetch(`${VALIDATE_API}/list_saved_dataframes?${params.toString()}`, {
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

  // Listen for dataframe-saved and dataframe-deleted events to refresh the list
  useEffect(() => {
    const handleDataframeSaved = (event?: Event) => {
      console.log('[DataUploadAtom] dataframe-saved event received, refreshing...', event);
      
      // Extract file information from event detail if available
      const customEvent = event as CustomEvent;
      if (customEvent?.detail?.filePath) {
        const filePath = customEvent.detail.filePath;
        const fileName = customEvent.detail.fileName || filePath.split('/').pop() || filePath;
        
        // Update atom settings to include the newly uploaded file
        const currentFiles = settings.uploadedFiles || [];
        if (!currentFiles.includes(fileName)) {
          updateSettings(atomId, {
            uploadedFiles: [...currentFiles, fileName],
            filePathMap: {
              ...(settings.filePathMap || {}),
              [fileName]: filePath,
            },
          });
          setPrimedFiles(prev => [...prev, fileName]);
        }
      }
      
      // Trigger reload token to force refresh
      setReloadToken(prev => prev + 1);
      // Add a small delay to ensure backend has saved the file
      setTimeout(() => {
        fetchSavedDataframes();
      }, 500);
    };
    
    const handleDataframeDeleted = (event?: Event) => {
      console.log('[DataUploadAtom] dataframe-deleted event received, refreshing...', event);
      
      // Extract file information from event detail if available
      const customEvent = event as CustomEvent;
      if (customEvent?.detail?.filePath) {
        const filePath = customEvent.detail.filePath;
        const fileName = customEvent.detail.fileName || filePath.split('/').pop() || filePath;
        
        // Remove deleted file from atom settings
        const currentFiles = settings.uploadedFiles || [];
        if (currentFiles.includes(fileName)) {
          const updatedFiles = currentFiles.filter(f => f !== fileName);
          const updatedPathMap = { ...(settings.filePathMap || {}) };
          delete updatedPathMap[fileName];
          
          updateSettings(atomId, {
            uploadedFiles: updatedFiles,
            filePathMap: updatedPathMap,
          });
          setPrimedFiles(prev => prev.filter(f => f !== fileName));
        }
      }
      
      // Trigger reload token to force refresh
      setReloadToken(prev => prev + 1);
      // Refresh immediately when file is deleted, then again after a delay
      fetchSavedDataframes();
      setTimeout(() => {
        fetchSavedDataframes();
      }, 300);
    };
    
    window.addEventListener('dataframe-saved', handleDataframeSaved);
    window.addEventListener('dataframe-deleted', handleDataframeDeleted);
    return () => {
      window.removeEventListener('dataframe-saved', handleDataframeSaved);
      window.removeEventListener('dataframe-deleted', handleDataframeDeleted);
    };
  }, [fetchSavedDataframes, settings.uploadedFiles, settings.filePathMap, atomId, updateSettings]);
  
  // Refresh when reloadToken changes
  useEffect(() => {
    if (reloadToken > 0) {
      fetchSavedDataframes();
    }
  }, [reloadToken, fetchSavedDataframes]);

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

  const handleDragOver = (e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragOver(true);
  };

  const handleDragLeave = (e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragOver(false);
  };

  const handleDrop = (e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragOver(false);
    
    // Handle dropped files - use existing upload logic which dispatches dataframe-saved events
    // This keeps everything in sync with SavedDataFramesPanel
    const files = e.dataTransfer.files;
    if (files && files.length > 0) {
      const fileArray = Array.from(files) as File[];
      if (fileArray.length === 1) {
        // Single file - use existing logic
        const firstFile = fileArray[0];
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
      } else {
        // Multiple files - upload all in parallel
        void handleMultipleFiles(fileArray);
      }
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
    setPendingFilesQueue([]);
    setSheetOptions([]);
    setSelectedSheets([]);
    setUploadingFile(false);
    setUploadError('');
    setHasMultipleSheets(false);
    setTempUploadMeta(null);
    setIsUploadModalOpen(false);
  };

  // Handle multiple files upload in parallel
  const handleMultipleFiles = async (files: File[]) => {
    setUploadingFile(true);
    setUploadError('');
    
    try {
      const uploadPromises = files.map(async (file) => {
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
            // For Excel files, use multi-sheet upload endpoint
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

            // For multiple files, save all sheets automatically
            if (globalGuidedModeEnabled) {
              const excelFolderName = fileName.replace(/\.[^.]+$/, '').replace(/\s+/g, '_').replace(/\./g, '_');
              const uploadedFiles = sheetNames.map((sheetName, index) => {
                const sheetIndex = index + 1; // 1-based index
                const normalizedSheetName = sheetNameMap[sheetName] || sheetName.replace(/\s+/g, '_').replace(/[^a-zA-Z0-9_-]/g, '') || 'Sheet';
                return {
                  name: `${excelFolderName}_sheet${sheetIndex}`,
                  path: data.original_file_path || '',
                  size: file.size || 0,
                  fileKey: `${excelFolderName}_sheet${sheetIndex}`,
                  sheetNames: sheetNames,
                  selectedSheet: sheetName,
                  totalSheets: sheetNames.length,
                  processed: false,
                  uploadSessionId: uploadSessionId,
                  sheetNameMap: sheetNameMap,
                  sheetIndex: sheetIndex,
                };
              });
              return { success: true, uploadedFiles, fileName };
            } else {
              // Non-guided mode: Save all sheets
              const savedSheetFiles: Array<{ filePath: string; fileName: string }> = [];
              for (let index = 0; index < sheetNames.length; index++) {
                const sheetName = sheetNames[index];
                const sheetIndex = index + 1; // 1-based index
                const normalizedSheetName = sheetNameMap[sheetName] || sheetName.replace(/\s+/g, '_').replace(/[^a-zA-Z0-9_-]/g, '') || 'Sheet';
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
                
                if (convertRes.ok) {
                  const convertData = await convertRes.json().catch(() => null);
                  const filePath = convertData?.file_path || convertData?.object_name;
                  const displayFileName = convertData?.file_name || `${fileName}_sheet${sheetIndex}`;
                  if (filePath) {
                    savedSheetFiles.push({ filePath, fileName: displayFileName });
                  }
                } else {
                  console.warn(`Failed to convert sheet ${sheetName} from ${fileName}`);
                }
              }
              
              // Dispatch dataframe-saved events for all saved sheets
              savedSheetFiles.forEach((fileInfo, index) => {
                setTimeout(() => {
                  console.log(`[DataUploadAtom] Dispatching dataframe-saved event for Excel sheet: ${fileInfo.filePath}`);
                  window.dispatchEvent(new CustomEvent('dataframe-saved', { 
                    detail: { filePath: fileInfo.filePath, fileName: fileInfo.fileName } 
                  }));
                }, index * 100);
              });
              
              return { success: true, fileName, sheetCount: sheetNames.length };
            }
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
            const fileKey = deriveFileKey(data.file_name || sanitizedFileName);
            
            if (globalGuidedModeEnabled) {
              const uploadedFileInfo = {
                name: data.file_name || sanitizedFileName,
                path: data.file_path,
                size: file.size || 0,
                fileKey: fileKey,
                processed: false,
              };
              return { success: true, uploadedFiles: [uploadedFileInfo], fileName: data.file_name || sanitizedFileName };
            } else {
              // Non-guided mode: Save directly
              const saveForm = new FormData();
              saveForm.append('validator_atom_id', 'panel-upload');
              saveForm.append('file_paths', JSON.stringify([data.file_path]));
              saveForm.append('file_keys', JSON.stringify([fileKey]));
              saveForm.append('overwrite', 'false');
              appendEnvFields(saveForm);
              
              const saveRes = await fetch(`${VALIDATE_API}/save_dataframes`, {
                method: 'POST',
                body: saveForm,
                credentials: 'include'
              });
              
              if (!saveRes.ok) {
                throw new Error('Failed to save dataframe');
              }
              
              const saveResult = await saveRes.json().catch(() => null);
              // Dispatch dataframe-saved event to trigger scenario update
              if (saveResult?.minio_uploads && Array.isArray(saveResult.minio_uploads)) {
                saveResult.minio_uploads.forEach((upload: any, index: number) => {
                  const objectName = upload?.minio_upload?.object_name || upload?.filename;
                  if (objectName) {
                    setTimeout(() => {
                      console.log(`[DataUploadAtom] Dispatching dataframe-saved event for ${objectName}`);
                      window.dispatchEvent(new CustomEvent('dataframe-saved', { 
                        detail: { filePath: objectName, fileName: upload.filename || data.file_name || sanitizedFileName } 
                      }));
                    }, index * 100); // Stagger events slightly
                  }
                });
              } else {
                // Fallback: dispatch event with available data
                setTimeout(() => {
                  console.log(`[DataUploadAtom] Dispatching dataframe-saved event (fallback) for ${data.file_name || sanitizedFileName}`);
                  window.dispatchEvent(new CustomEvent('dataframe-saved', { 
                    detail: { filePath: data.file_path, fileName: data.file_name || sanitizedFileName } 
                  }));
                }, 100);
              }
              
              return { success: true, fileName: data.file_name || sanitizedFileName };
            }
          }
        } catch (err: any) {
          return { success: false, fileName: file.name, error: err.message || 'Upload failed' };
        }
      });

      const results = await Promise.all(uploadPromises);
      const successes = results.filter(r => r.success);
      const failures = results.filter(r => !r.success);
      
      if (globalGuidedModeEnabled && successes.length > 0) {
        // Collect all uploaded files from successful uploads
        const allUploadedFiles: any[] = [];
        successes.forEach(result => {
          if (result.uploadedFiles) {
            allUploadedFiles.push(...result.uploadedFiles);
          }
        });
        
        if (allUploadedFiles.length > 0) {
          // Start guided flow at U1 with all uploaded files
          setActiveGuidedFlow(atomId, 'U1', {
            uploadedFiles: allUploadedFiles,
            currentStage: 'U1',
          });
          
          toast({ 
            title: 'Files uploaded', 
            description: `${successes.length} file(s) ready for processing.${failures.length > 0 ? ` ${failures.length} file(s) failed.` : ''}` 
          });
        }
      } else if (successes.length > 0) {
        toast({ 
          title: 'Files uploaded successfully', 
          description: `${successes.length} file(s) uploaded.${failures.length > 0 ? ` ${failures.length} file(s) failed.` : ''}` 
        });
      }
      
      if (failures.length > 0) {
        const errorMessages = failures.map(f => `${f.fileName}: ${f.error || 'Upload failed'}`).join('; ');
        setUploadError(`Some files failed: ${errorMessages}`);
      }
      
      // Refresh saved dataframes list
      fetchSavedDataframes();
    } catch (err: any) {
      setUploadError(err.message || 'Failed to upload files');
    } finally {
      setUploadingFile(false);
    }
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
        
        // Process next file in queue if any
        setPendingFilesQueue(prev => {
          if (prev.length > 0) {
            const nextFile = prev[0];
            setTimeout(() => {
              setPendingFile(nextFile);
              setUploadError('');
              setSheetOptions([]);
              setSelectedSheets([]);
              setHasMultipleSheets(false);
              setTempUploadMeta(null);
              setIsUploadModalOpen(true);
              void uploadSelectedFile(nextFile);
            }, 100);
            return prev.slice(1);
          }
          return prev;
        });
      }
    } catch (err: any) {
      setUploadError(err.message || 'Upload failed');
      setUploadingFile(false);
    }
  };

  const finalizeSave = async (meta: { file_path: string; file_name: string }) => {
    setUploadingFile(true);
    try {
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
      
      const saveResult = await res.json().catch(() => null);
      // Dispatch dataframe-saved event to trigger scenario update
      if (saveResult?.minio_uploads && Array.isArray(saveResult.minio_uploads)) {
        saveResult.minio_uploads.forEach((upload: any, index: number) => {
          const objectName = upload?.minio_upload?.object_name || upload?.filename;
          if (objectName) {
            setTimeout(() => {
              console.log(`[DataUploadAtom] Dispatching dataframe-saved event for ${objectName}`);
              window.dispatchEvent(new CustomEvent('dataframe-saved', { 
                detail: { filePath: objectName, fileName: upload.filename || meta.file_name } 
              }));
              
              // Auto-trigger guided mode with auto-prime enabled
              const findOrCreateDataUploadAtom = () => {
                // Look for existing data-upload atom
                for (const card of cards) {
                  if (card?.atoms && Array.isArray(card.atoms)) {
                    for (const atom of card.atoms) {
                      if (atom?.atomId === 'data-upload' && atom?.id) {
                        return atom.id;
                      }
                    }
                  }
                }
                // If not found, return current atomId
                return atomId;
              };
              
              // Auto-trigger guided mode with auto-prime
              setTimeout(async () => {
                try {
                  await openGuidedMode({
                    frame: {
                      object_name: objectName,
                      csv_name: upload.filename || meta.file_name,
                      arrow_name: objectName.endsWith('.arrow') ? objectName : undefined,
                      size: upload.size || meta.file_path ? 0 : undefined,
                    },
                    findOrCreateDataUploadAtom,
                    setActiveGuidedFlow,
                    setGlobalGuidedMode,
                    cards,
                    autoPrime: true, // Enable auto-prime
                  });
                  console.log(`[DataUploadAtom] Auto-triggered guided mode with auto-prime for ${objectName}`);
                } catch (error) {
                  console.error(`[DataUploadAtom] Failed to auto-trigger guided mode for ${objectName}:`, error);
                }
              }, 500); // Small delay to ensure file is saved
            }, index * 100); // Stagger events slightly
          }
        });
      } else {
        // Fallback: dispatch event with available data
        setTimeout(() => {
          console.log(`[DataUploadAtom] Dispatching dataframe-saved event (fallback) for ${meta.file_name}`);
          window.dispatchEvent(new CustomEvent('dataframe-saved', { 
            detail: { filePath: meta.file_path, fileName: meta.file_name } 
          }));
          
          // Auto-trigger guided mode with auto-prime for fallback case
          const findOrCreateDataUploadAtom = () => {
            for (const card of cards) {
              if (card?.atoms && Array.isArray(card.atoms)) {
                for (const atom of card.atoms) {
                  if (atom?.atomId === 'data-upload' && atom?.id) {
                    return atom.id;
                  }
                }
              }
            }
            return atomId;
          };
          
          setTimeout(async () => {
            try {
              await openGuidedMode({
                frame: {
                  object_name: meta.file_path,
                  csv_name: meta.file_name,
                  arrow_name: meta.file_path.endsWith('.arrow') ? meta.file_path : undefined,
                  size: 0,
                },
                findOrCreateDataUploadAtom,
                setActiveGuidedFlow,
                setGlobalGuidedMode,
                cards,
                autoPrime: true,
              });
              console.log(`[DataUploadAtom] Auto-triggered guided mode with auto-prime (fallback) for ${meta.file_name}`);
            } catch (error) {
              console.error(`[DataUploadAtom] Failed to auto-trigger guided mode (fallback) for ${meta.file_name}:`, error);
            }
          }, 500);
        }, 100);
      }
      
      toast({ title: 'Dataframe saved', description: `${meta.file_name} uploaded successfully. Auto-priming in progress...` });
      resetUploadState();
      setReloadToken(prev => prev + 1);
      fetchSavedDataframes();
      
      // Process next file in queue if any
      setPendingFilesQueue(prev => {
        if (prev.length > 0) {
          const nextFile = prev[0];
          setTimeout(() => {
            setPendingFile(nextFile);
            setUploadError('');
            setSheetOptions([]);
            setSelectedSheets([]);
            setHasMultipleSheets(false);
            setTempUploadMeta(null);
            setIsUploadModalOpen(true);
            void uploadSelectedFile(nextFile);
          }, 100);
          return prev.slice(1);
        }
        return prev;
      });
    } catch (err: any) {
      setUploadError(err.message || 'Failed to save dataframe');
    } finally {
      setUploadingFile(false);
    }
  };

  const finalizeSaveMultiSheet = async (fileName: string, uploadSessionId: string, sheetsToSave: string[]) => {
    setUploadingFile(true);
    try {
      const excelFolderName = fileName.replace(/\.[^.]+$/, '').replace(/\s+/g, '_').replace(/\./g, '_');
      
      for (let index = 0; index < sheetsToSave.length; index++) {
        const sheetName = sheetsToSave[index];
        const sheetIndex = index + 1; // 1-based index
        
        try {
          // Get normalized sheet name from mapping or normalize it
          const normalizedSheetName = tempUploadMeta?.sheetNameMap?.[sheetName] || 
            sheetName.replace(/\s+/g, '_').replace(/[^a-zA-Z0-9_-]/g, '') || 'Sheet';
          
          // Use the convert endpoint to save sheet directly
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
            setUploadError(`Failed to save sheet "${sheetName}": ${errorText}`);
            continue;
          }
          
          const convertData = await convertRes.json();
          const sheetPath = convertData.file_path || '';
          const displayFileName = convertData.file_name || `${fileName}_sheet${sheetIndex}`;
          
          if (!sheetPath) {
            console.warn(`No file path returned for sheet ${sheetName}`);
            continue;
          }
          
          // Trigger refresh of SavedDataFramesPanel
          window.dispatchEvent(new CustomEvent('dataframe-saved', { 
            detail: { filePath: sheetPath, fileName: displayFileName } 
          }));
        } catch (err: any) {
          console.error(`Error saving sheet ${sheetName}:`, err);
          setUploadError(`Error saving sheet "${sheetName}": ${err.message || 'Unknown error'}`);
        }
      }
      
      toast({ 
        title: 'Files uploaded successfully', 
        description: `Saved ${sheetsToSave.length} sheet${sheetsToSave.length > 1 ? 's' : ''} from ${fileName}.`,
      });
      
      resetUploadState();
      setReloadToken(prev => prev + 1);
      fetchSavedDataframes();
      
      // Process next file in queue if any
      setPendingFilesQueue(prev => {
        if (prev.length > 0) {
          const nextFile = prev[0];
          setTimeout(() => {
            setPendingFile(nextFile);
            setUploadError('');
            setSheetOptions([]);
            setSelectedSheets([]);
            setHasMultipleSheets(false);
            setTempUploadMeta(null);
            setIsUploadModalOpen(true);
            void uploadSelectedFile(nextFile);
          }, 100);
          return prev.slice(1);
        }
        return prev;
      });
    } catch (err: any) {
      setUploadError(err.message || 'Failed to save sheets');
    } finally {
      setUploadingFile(false);
    }
  };

  const handleSheetConfirm = () => {
    if (!pendingFile || selectedSheets.length === 0) return;
    if (!tempUploadMeta?.upload_session_id) {
      // Fallback to single sheet upload
      uploadSelectedFile(pendingFile, [selectedSheets[0]]);
      return;
    }
    finalizeSaveMultiSheet(
      tempUploadMeta.file_name,
      tempUploadMeta.upload_session_id,
      selectedSheets
    );
  };

  const triggerFilePicker = () => {
    fileInputRef.current?.click();
  };

  const handleFileInput = (event: React.ChangeEvent<HTMLInputElement>) => {
    const files = event.target.files;
    if (!files || files.length === 0) return;

    const fileArray = Array.from(files) as File[];

    // If user selected multiple files from the picker, reuse the same
    // multi-upload pipeline that drag & drop uses.
    if (fileArray.length > 1) {
      setPendingFilesQueue([]);
      void handleMultipleFiles(fileArray);
      event.target.value = '';
      return;
    }

    // Single-file path: keep existing behavior (Excel multi-sheet modal, etc.)
    const firstFile = fileArray[0];
    
    setPendingFile(firstFile);
    setUploadError('');
    setSheetOptions([]);
    setSelectedSheets([]);
    setHasMultipleSheets(false);
    setTempUploadMeta(null);
    setIsUploadModalOpen(true);
    void uploadSelectedFile(firstFile);
    event.target.value = '';
  };

  const handleUploadAreaClick = () => {
    // Use the local hidden file input so uploads always go through
    // this atom's upload pipeline (which updates reloadToken and
    // dispatches the correct events for priming status).
    triggerFilePicker();
  };

  // Handle selecting an existing dataframe in guided mode (used by properties panel, not left layout)
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

  /**
   * Simple \"first time\" upload experience shown when there are no saved
   * dataframes yet. This mirrors the Initialize screen (image 2) with a
   * single large drop zone and the same upload behaviour.
   */
  const SimpleDataUploadEmptyState: React.FC = () => (
    <div className="w-full h-full bg-gradient-to-br from-slate-50 to-blue-50 rounded-xl border border-gray-200 shadow-xl overflow-hidden flex items-center justify-center p-4">
      <div className="w-full max-w-lg">
        <div
          className={`w-full min-h-[180px] md:min-h-[200px] border-2 border-dashed rounded-xl flex flex-col items-center justify-center text-center bg-white/70 backdrop-blur-sm transition-all duration-300 cursor-pointer ${
            isDragOver
              ? 'border-blue-400 bg-blue-50'
              : 'border-blue-200 hover:border-blue-400 hover:bg-blue-50/40'
          }`}
          onDrop={handleDrop}
          onDragOver={handleDragOver}
          onDragLeave={handleDragLeave}
          onClick={handleUploadAreaClick}
        >
          <div
            className={`mb-3 rounded-full bg-gradient-to-br from-blue-500 to-blue-600 flex items-center justify-center shadow-md transform transition-transform duration-300 ${
              isDragOver ? 'scale-110' : 'hover:scale-105'
            } w-12 h-12`}
          >
            <Upload className="text-white w-6 h-6" />
          </div>
          <p className="text-sm font-medium text-gray-800 mb-1">
            {isDragOver
              ? 'Drop files here to begin your analysis'
              : 'To begin your analysis, drag and drop files or click to upload'}
          </p>
          <p className="text-xs text-gray-500">CSV or Excel</p>
          {uploadError && (
            <div className="mt-4 max-w-xl w-full px-4">
              <div className="p-2 bg-red-50 border border-red-200 rounded-lg">
                <p className="text-xs text-red-600">{uploadError}</p>
              </div>
            </div>
          )}
        </div>

        {/* Hidden file input used by the simple empty-state panel.
            This reuses the same upload pipeline as the full layout. */}
        <input
          ref={fileInputRef}
          type="file"
          className="hidden"
          multiple
          onChange={handleFileInput}
        />
      </div>
    </div>
  );

  interface UploadPanelRightProps {
    onDrop: (event: React.DragEvent<HTMLDivElement>) => void;
    onDragOver: (event: React.DragEvent<HTMLDivElement>) => void;
    onDragLeave: (event: React.DragEvent<HTMLDivElement>) => void;
    onUploadAreaClick: () => void;
  }

  const UploadPanelRight: React.FC<UploadPanelRightProps> = ({
    onDrop,
    onDragOver,
    onDragLeave,
    onUploadAreaClick,
  }) => (
    <div className="w-full h-full bg-white rounded-lg border border-gray-200 shadow-sm overflow-hidden flex flex-col">
      <div className="px-4 py-3 border-b border-gray-100 bg-gray-50">
        <h3 className="text-sm font-semibold text-gray-800">Upload New Files</h3>
      </div>
      <div className="flex-1 p-3 flex flex-col">
        {/* Upload Drop Zone */}
        <div
          className={`flex-1 border-2 border-dashed rounded-lg flex flex-col items-center justify-center text-center transition-all duration-300 cursor-pointer m-2 ${
            isDragOver
              ? 'border-blue-400 bg-blue-50'
              : 'border-gray-300 hover:border-blue-400 hover:bg-blue-50/30'
          }`}
          onDrop={onDrop}
          onDragOver={onDragOver}
          onDragLeave={onDragLeave}
          onClick={onUploadAreaClick}
        >
          <div
            className={`rounded-full bg-gradient-to-br from-blue-500 to-blue-600 flex items-center justify-center shadow-md transform transition-transform duration-300 ${
              isDragOver ? 'scale-110' : 'hover:scale-105'
            } w-12 h-12 mb-3`}
          >
            <Upload className="text-white w-6 h-6" />
          </div>
          <p className="text-sm font-medium text-gray-700 mb-1">
            {isDragOver ? 'Drop files here' : 'Drag and drop files'}
          </p>
          <p className="text-xs text-gray-500">or click to browse</p>
        </div>

        {/* Upload Error */}
        {uploadError && (
          <div className="mt-2 p-2 bg-red-50 border border-red-200 rounded-lg">
            <p className="text-xs text-red-600">{uploadError}</p>
          </div>
        )}
      </div>
    </div>
  );

  // Check if this atom has an active guided flow
  const hasActiveGuidedFlow = activeGuidedFlows[atomId] && isGuidedModeActiveForAtom(atomId);
  const flowState = activeGuidedFlows[atomId];
  const existingDataframe = flowState?.state?.initialFile as { name: string; path: string; size?: number } | undefined;
  const hasSavedDataframes = savedDataframes.length > 0;

  // When there are no saved dataframes yet, show the simple Initialize-style
  // panel (image 2) for the very first experience in Data Upload.
  if (!hasSavedDataframes && !isLoading) {
    return <SimpleDataUploadEmptyState />;
  }

  return (
    <div className="w-full h-full bg-gradient-to-br from-slate-50 to-blue-50 rounded-xl border border-gray-200 shadow-xl overflow-hidden flex flex-col">
      {/* Top row: Priming list (left) + Upload panel (right).
          The upload panel triggers the SavedDataFramesPanel file input for synced uploads. */}
      <div className="w-full flex gap-3 p-3 flex-shrink-0">
        <div className="flex-[3] min-w-0 flex flex-col overflow-hidden" ref={panelContainerRef}>
          <div className="flex-1 overflow-hidden flex flex-col">
            <PartialPrimedCard
              atomId={atomId}
              cardId={atomId}
              files={[]}
              primingStatuses={[]}
            />
          </div>
        </div>
        <div className="flex-1 min-w-0 flex-shrink-0">
          <UploadPanelRight
            onDrop={handleDrop}
            onDragOver={handleDragOver}
            onDragLeave={handleDragLeave}
            onUploadAreaClick={handleUploadAreaClick}
          />
          {/* Hidden file input used by the right-hand upload panel.
              This ensures all uploads go through the same pipeline
              (handleFileInput -> uploadSelectedFile/finalizeSave),
              so reloadToken and priming status are always updated. */}
          <input
            ref={fileInputRef}
            type="file"
            className="hidden"
            multiple
            onChange={handleFileInput}
          />
        </div>
      </div>

      {/* Bottom row: Either DirectReviewPanel OR GuidedUploadFlowInline.
          This is a separate flex child, so it appears below the top row
          without changing how the files list/upload panel render. */}
      {directReviewTarget && !hasActiveGuidedFlow && (
        <div className="w-full border-t-2 border-gray-200 bg-white flex-1 min-h-[300px] max-h-[75vh] overflow-y-auto">
          <DirectReviewPanel
            frame={directReviewTarget}
            onClose={() => {
              setDirectReviewTarget(null);
            }}
            onSave={() => {
              // Refresh priming stats after save - dispatch event for PartialPrimedCard to pick up
              window.dispatchEvent(new CustomEvent('priming-status-changed'));
            }}
          />
        </div>
      )}

      {hasActiveGuidedFlow && globalGuidedModeEnabled && flowState && existingDataframe && !directReviewTarget && (
        <div className="w-full border-t-2 border-blue-200 bg-white flex-1 min-h-[300px] max-h-[75vh] overflow-y-auto">
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
                const fileNames = result.uploadedFiles.map((f: any) => f.name);
                const filePathMap: Record<string, string> = {};
                result.uploadedFiles.forEach((f: any) => {
                  filePathMap[f.name] = f.path;
                });
                
                updateAtomSettings(atomId, {
                  uploadedFiles: fileNames,
                  filePathMap: filePathMap,
                });
                
                // Refresh priming stats after completion - dispatch event for PartialPrimedCard to pick up
                window.dispatchEvent(new CustomEvent('priming-status-changed'));
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
