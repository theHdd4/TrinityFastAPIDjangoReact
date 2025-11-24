import React, { useState, useEffect } from 'react';
import { createPortal } from 'react-dom';
import { Info, Check, AlertCircle, Upload, Settings, ClipboardCheck, Eye, ChevronDown, Plus, Pencil } from 'lucide-react';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Input } from '@/components/ui/input';
import { Checkbox } from '@/components/ui/checkbox';
import { Label } from '@/components/ui/label';
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible';
import {
  useLaboratoryStore,
  DataUploadSettings,
  createDefaultDataUploadSettings,
  ColumnClassifierColumn,
  ColumnClassifierFile,
} from '@/components/LaboratoryMode/store/laboratoryStore';
import { VALIDATE_API, CLASSIFIER_API } from '@/lib/api';
import { waitForTaskResult } from '@/lib/taskQueue';
import { useToast } from '@/hooks/use-toast';
import { useAuth } from '@/contexts/AuthContext';
import { logSessionState, updateSessionState, addNavigationItem } from '@/lib/session';
import UploadSection from './components/upload/UploadSection';
import RequiredFilesSection from './components/required-files/RequiredFilesSection';
import ColumnClassifierCanvas from '../column-classifier/components/ColumnClassifierCanvas';
import ColumnClassifierDimensionMapping from '../column-classifier/components/ColumnClassifierDimensionMapping';

interface UploadedFileRef {
  name: string;
  path: string;
  size: number;
}

interface Props {
  atomId: string;
}

const DataUploadValidateAtom: React.FC<Props> = ({ atomId }) => {
  const atom = useLaboratoryStore((state) => state.getAtom(atomId));
  const updateSettings = useLaboratoryStore((state) => state.updateAtomSettings);
  
  // Make settings reactive by using it directly from the atom with a selector
  const settings = useLaboratoryStore((state) => {
    const currentAtom = state.getAtom(atomId);
    return currentAtom?.settings as DataUploadSettings || createDefaultDataUploadSettings();
  });

  const { toast } = useToast();
  const { user } = useAuth();

  const [uploadedFiles, setUploadedFiles] = useState<UploadedFileRef[]>([]);
  const [isDragOver, setIsDragOver] = useState(false);
  const [openSections, setOpenSections] = useState<string[]>(['setting1', 'fileValidation']);
  const [openFile, setOpenFile] = useState<string | null>(null);
  const [renameTarget, setRenameTarget] = useState<string | null>(null);
  const [renameValue, setRenameValue] = useState('');
  const [fileAssignments, setFileAssignments] = useState<Record<string, string>>(settings.fileMappings || {});
  const [validationResults, setValidationResults] = useState<Record<string, string>>(settings.validationResults || {});
  const [validationDetails, setValidationDetails] = useState<Record<string, any[]>>(settings.validationDetails || {});
  const [openValidatedFile, setOpenValidatedFile] = useState<string | null>(null);
  const [saveStatus, setSaveStatus] = useState<Record<string, string>>({});
  const [allFilesSaved, setAllFilesSaved] = useState(false);
  const [isConfigStatusOpen, setIsConfigStatusOpen] = useState(false);
  const [savedDataframes, setSavedDataframes] = useState<Array<{ object_name: string; csv_name: string; arrow_name?: string }>>([]);
  const [isLoadingSavedDataframes, setIsLoadingSavedDataframes] = useState(false);
  const [hasMultipleSheetsByFile, setHasMultipleSheetsByFile] = useState<Record<string, boolean>>({});
  const [workbookPathMap, setWorkbookPathMap] = useState<Record<string, string>>({});
  const [sheetMetadataMap, setSheetMetadataMap] = useState<Record<string, { sheet_names: string[]; selected_sheet: string; original_filename: string }>>({});
  const [pendingUploadFile, setPendingUploadFile] = useState<{ file: File; sanitizedFileName: string; data: any } | null>(null);
  const [isUploadModalOpen, setIsUploadModalOpen] = useState(false);
  const [uploadSheetOptions, setUploadSheetOptions] = useState<string[]>([]);
  const [uploadSelectedSheet, setUploadSelectedSheet] = useState('');
  const [uploadingFile, setUploadingFile] = useState(false);
  const [uploadError, setUploadError] = useState('');
  const [filesFromSavedDataframes, setFilesFromSavedDataframes] = useState<Set<string>>(new Set());
  const [refreshTrigger, setRefreshTrigger] = useState(0); // Trigger to force refresh (like SavedDataFramesPanel's reloadToken)
  
  // Use ref to store current data changes without triggering re-renders
  const dataChangesRef = React.useRef<{
    dtypeChanges: Record<string, Record<string, string | { dtype: string; format: string }>>;
    missingValueStrategies: Record<string, Record<string, { strategy: string; value?: string }>>;
  }>({
    dtypeChanges: settings.dtypeChanges || {},
    missingValueStrategies: settings.missingValueStrategies || {},
  });

  // Function to update data changes in global store only (child manages UI state)
  const handleDataChanges = React.useCallback((changes: {
    dtypeChanges: Record<string, Record<string, string | { dtype: string; format: string }>>;
    missingValueStrategies: Record<string, Record<string, { strategy: string; value?: string }>>;
  }) => {
    dataChangesRef.current = changes;
    updateSettings(atomId, {
      dtypeChanges: changes.dtypeChanges,
      missingValueStrategies: changes.missingValueStrategies,
    });
  }, [atomId, updateSettings]);

  // Function to update metadata in global store
  const handleMetadataChange = React.useCallback((metadata: Record<string, any>) => {
    updateSettings(atomId, {
      filesMetadata: metadata,
    });
  }, [atomId, updateSettings]);
  
  // Read filesWithAppliedChanges from global store
  const filesWithAppliedChanges = new Set(settings.filesWithAppliedChanges || []);

  useEffect(() => {
    setFileAssignments(settings.fileMappings || {});
  }, [settings.fileMappings]);

  // Keep save button disabled and "Changes Applied" badge visible after saving
  // Do NOT re-enable button or remove badge when new changes are made

  useEffect(() => {
    if (uploadedFiles.length === 0 && (settings.uploadedFiles?.length || 0) > 0) {
      const files: UploadedFileRef[] = (settings.uploadedFiles || []).map(name => ({
        name,
        path: settings.filePathMap?.[name] || '',
        size: settings.fileSizeMap?.[name] || 0,
      }));
      setUploadedFiles(files);
      
      // When validation steps are enabled, restore filesFromSavedDataframes from validatedFiles
      if (settings.bypassMasterUpload && settings.validatedFiles && settings.validatedFiles.length > 0) {
        setFilesFromSavedDataframes(new Set(settings.validatedFiles));
      }
    }
  }, [settings.uploadedFiles, settings.filePathMap, settings.fileSizeMap, settings.bypassMasterUpload, settings.validatedFiles, uploadedFiles.length]);

  // Update uploadedFiles paths when filePathMap changes (after save)
  useEffect(() => {
    if (settings.filePathMap && Object.keys(settings.filePathMap).length > 0) {
      setUploadedFiles(prev => prev.map(file => {
        const savedPath = settings.filePathMap?.[file.name];
        // Update path if we have a saved path and current path is temporary or empty
        if (savedPath && (file.path.includes('/tmp/') || file.path.includes('tmp/') || !file.path)) {
          console.log(`🔄 Updating path for ${file.name} from ${file.path} to ${savedPath}`);
          return { ...file, path: savedPath };
        }
        return file;
      }));
    }
  }, [settings.filePathMap]);

  // Function to refresh saved dataframes list
  // Always fetches from API - no dependency on settings to avoid stale closures
  const refreshSavedDataframes = React.useCallback(async () => {
    setIsLoadingSavedDataframes(true);
    const envStr = localStorage.getItem('env');
    let query = '';
    if (envStr) {
      try {
        const env = JSON.parse(envStr);
        query = '?' + new URLSearchParams({
          client_id: env.CLIENT_ID || '',
          app_id: env.APP_ID || '',
          project_id: env.PROJECT_ID || '',
          client_name: env.CLIENT_NAME || '',
          app_name: env.APP_NAME || '',
          project_name: env.PROJECT_NAME || ''
        }).toString();
      } catch {
        /* ignore */
      }
    }
    try {
      const res = await fetch(`${VALIDATE_API}/list_saved_dataframes${query}`, {
        credentials: 'include',
      });
      const d = await res.json();
      const files = Array.isArray(d.files) ? d.files : [];
      setSavedDataframes(files);
      
      // Check workbook metadata for files to determine if they have multiple sheets
      const checkWorkbookMetadata = async () => {
        const metadataChecks: Record<string, boolean> = {};
        for (const f of files) {
          // Check if workbook metadata exists (which means it was uploaded from a multi-sheet Excel file)
          try {
            const queryParams = new URLSearchParams({ object_name: f.object_name }).toString();
            const metaRes = await fetch(`${VALIDATE_API}/workbook_metadata?${queryParams}`, {
              credentials: 'include',
            });
            if (metaRes.ok) {
              const metaData = await metaRes.json();
              const sheetNames = Array.isArray(metaData.sheet_names) ? metaData.sheet_names : [];
              // Check if has_multiple_sheets is true, or if sheet_names has more than 1 sheet
              metadataChecks[f.object_name] = Boolean(
                metaData.has_multiple_sheets === true || sheetNames.length > 1
              );
            } else {
              metadataChecks[f.object_name] = false;
            }
          } catch {
            metadataChecks[f.object_name] = false;
          }
        }
        setHasMultipleSheetsByFile(metadataChecks);
      };
      void checkWorkbookMetadata();
    } catch {
      setSavedDataframes([]);
    } finally {
      setIsLoadingSavedDataframes(false);
    }
  }, []); // No dependencies - always fetches fresh from API

  // Fetch saved dataframes when validation steps are enabled
  useEffect(() => {
    if (settings.bypassMasterUpload) {
      void refreshSavedDataframes();
    }
  }, [settings.bypassMasterUpload, refreshSavedDataframes]);
  
  // Force refresh when refreshTrigger changes (similar to SavedDataFramesPanel's reloadToken)
  useEffect(() => {
    if (settings.bypassMasterUpload && refreshTrigger > 0) {
      void refreshSavedDataframes();
    }
  }, [refreshTrigger, settings.bypassMasterUpload, refreshSavedDataframes]);

  // Track previous bypassMasterUpload value to detect when it changes to true
  const prevBypassMasterUploadRef = React.useRef<boolean>(settings.bypassMasterUpload || false);

  // Sync validation data from settings when they change (e.g., loaded from MongoDB)
  useEffect(() => {
    if (settings.bypassMasterUpload) {
      if (settings.validationResults) {
        setValidationResults(settings.validationResults);
      }
      if (settings.validationDetails) {
        setValidationDetails(settings.validationDetails);
      }
    }
  }, [settings.bypassMasterUpload, settings.validationResults, settings.validationDetails]);

  // Clear configurations when validation steps are enabled (only when it changes from false to true)
  useEffect(() => {
    const prevValue = prevBypassMasterUploadRef.current;
    const currentValue = settings.bypassMasterUpload || false;
    prevBypassMasterUploadRef.current = currentValue;

    if (currentValue && !prevValue) {
      // Validation steps just got enabled - clear all configurations
      updateSettings(atomId, {
        dtypeChanges: {},
        missingValueStrategies: {},
        filesMetadata: {},
        filesWithAppliedChanges: [],
      });
      // Clear ref
      dataChangesRef.current = {
        dtypeChanges: {},
        missingValueStrategies: {},
      };
      // Clear uploaded files that came from uploads (not from saved dataframes)
      setUploadedFiles(prev => prev.filter(f => filesFromSavedDataframes.has(f.name)));
      updateSettings(atomId, {
        uploadedFiles: (settings.uploadedFiles || []).filter((name: string) => filesFromSavedDataframes.has(name)),
        fileMappings: Object.fromEntries(
          Object.entries(settings.fileMappings || {}).filter(([name]) => filesFromSavedDataframes.has(name))
        ),
        filePathMap: Object.fromEntries(
          Object.entries(settings.filePathMap || {}).filter(([name]) => filesFromSavedDataframes.has(name))
        ),
        fileSizeMap: Object.fromEntries(
          Object.entries(settings.fileSizeMap || {}).filter(([name]) => filesFromSavedDataframes.has(name))
        ),
      });
    }
  }, [settings.bypassMasterUpload, atomId, updateSettings, filesFromSavedDataframes, settings.uploadedFiles, settings.fileMappings, settings.filePathMap, settings.fileSizeMap]);

  useEffect(() => {
    return () => {
      const envStr = localStorage.getItem('env');
      if (envStr) {
        try {
          const env = JSON.parse(envStr);
          const params = new URLSearchParams({
            client_name: env.CLIENT_NAME || '',
            app_name: env.APP_NAME || '',
            project_name: env.PROJECT_NAME || ''
          });
          fetch(`${VALIDATE_API}/temp-uploads?${params.toString()}`, {
            method: 'DELETE',
            credentials: 'include'
          }).catch(() => {});
        } catch {
          /* ignore */
        }
      }
      // Clear global store (no need to update local state on unmount)
      updateSettings(atomId, {
        uploadedFiles: [],
        fileMappings: {},
        filePathMap: {},
        fileSizeMap: {},
        fileKeyMap: {},
        dtypeChanges: {},
        missingValueStrategies: {},
        filesWithAppliedChanges: [],
        filesMetadata: {},
      });
      updateSessionState(user?.id, { envvars: null });
    };
  }, [atomId, updateSettings, user?.id]);

  // Auto-save a single file immediately after upload (like SavedDataFramesPanel)
  const autoSaveFile = async (filePath: string, fileName: string, workbookPath?: string, sheetMetadata?: { sheet_names: string[]; selected_sheet: string; original_filename: string }) => {
    try {
      const form = new FormData();
      const vidSave = settings.validatorId || 'bypass_upload';
      form.append('validator_atom_id', vidSave);
      form.append('file_paths', JSON.stringify([filePath]));
      
      // Derive file key from filename (same logic as SavedDataFramesPanel)
      const deriveFileKey = (name: string) => {
        const base = name.replace(/\.[^.]+$/, '') || 'dataframe';
        const sanitized = base.replace(/[^A-Za-z0-9_.-]+/g, '_');
        return sanitized || 'dataframe';
      };
      form.append('file_keys', JSON.stringify([deriveFileKey(fileName)]));
      form.append('overwrite', 'false');
      
      // Include workbook_paths and sheet_metadata if available
      if (workbookPath) {
        form.append('workbook_paths', JSON.stringify([workbookPath]));
        if (sheetMetadata) {
          form.append('sheet_metadata', JSON.stringify([sheetMetadata]));
        } else {
          form.append('sheet_metadata', JSON.stringify([{
            sheet_names: [],
            selected_sheet: '',
            original_filename: fileName,
          }]));
        }
      }
      
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
        } catch {
          /* ignore */
        }
      }
      if (user?.id) form.append('user_id', String(user.id));
      if (user?.username) form.append('user_name', user.username);
      
      const res = await fetch(`${VALIDATE_API}/save_dataframes`, {
        method: 'POST',
        body: form,
        credentials: 'include'
      });
      
      if (!res.ok) {
        const txt = await res.text().catch(() => '');
        throw new Error(txt || 'Failed to save dataframe');
      }
      
      const data = await res.json();
      const fileResults = Array.isArray(data.minio_uploads) ? data.minio_uploads : [];
      const result = fileResults[0];
      
      if (result?.minio_upload?.object_name) {
        const savedPath = result.minio_upload.object_name;
        // Update filePathMap with saved path
        updateSettings(atomId, {
          filePathMap: {
            ...(settings.filePathMap || {}),
            [fileName]: savedPath,
          },
        });
        return savedPath;
      }
      return filePath; // Return original path if save didn't return new path
    } catch (error: any) {
      console.error('Auto-save failed:', error);
      // Don't show error toast - just log it, upload was successful
      return filePath; // Return original path on error
    }
  };

  const handleFileUpload = async (files: File[]) => {
    // Don't reset allFilesSaved - keep button disabled if already saved
    const uploaded: UploadedFileRef[] = [];

    const envStr = localStorage.getItem('env');
    let env: any = null;
    if (envStr) {
      try {
        env = JSON.parse(envStr);
      } catch {
        /* ignore */
      }
    }

    let savedNames = new Set<string>();
    try {
      if (env && env.CLIENT_NAME && env.APP_NAME && env.PROJECT_NAME) {
        const query =
          '?' +
          new URLSearchParams({
            client_name: env.CLIENT_NAME,
            app_name: env.APP_NAME,
            project_name: env.PROJECT_NAME,
          }).toString();
        const check = await fetch(`${VALIDATE_API}/list_saved_dataframes${query}`);
        if (check.ok) {
          const data = await check.json();
          savedNames = new Set(
            Array.isArray(data.files)
              ? data.files.map((f: any) => (f.csv_name || '').toLowerCase())
              : []
          );
        }
      }
    } catch {
      /* ignore */
    }

    for (const file of files) {
      // Replace spaces with underscores in filename
      const sanitizedFileName = file.name.replace(/\s+/g, '_');
      const sanitizedFile = sanitizedFileName !== file.name 
        ? new File([file], sanitizedFileName, { type: file.type, lastModified: file.lastModified })
        : file;
      
      const stem = sanitizedFileName.replace(/\.[^/.]+$/, '').toLowerCase();
      if (
        savedNames.has(stem) ||
        uploadedFiles.some((f) => f.name === sanitizedFileName) ||
        (settings.uploadedFiles || []).includes(sanitizedFileName)
      ) {
        toast({
          title: 'Same file already present in the project',
          variant: 'destructive',
        });
        continue;
      }

      // Show upload modal with processing state
      setPendingUploadFile({ file: sanitizedFile, sanitizedFileName, data: null });
      setUploadSheetOptions([]);
      setUploadSelectedSheet('');
      setUploadError('');
      setUploadingFile(true);
      setIsUploadModalOpen(true);

      const form = new FormData();
      form.append('file', sanitizedFile);
      if (env) {
        form.append('client_id', env.CLIENT_ID || '');
        form.append('app_id', env.APP_ID || '');
        form.append('project_id', env.PROJECT_ID || '');
        form.append('client_name', env.CLIENT_NAME || '');
        form.append('app_name', env.APP_NAME || '');
        form.append('project_name', env.PROJECT_NAME || '');
      }
      try {
        const res = await fetch(`${VALIDATE_API}/upload-file`, {
          method: 'POST',
          body: form,
          credentials: 'include',
        });
        if (!res.ok) {
          const errorData = await res.json().catch(() => ({}));
          const errorMessage = errorData.detail || `Failed to upload ${sanitizedFileName}`;
          setUploadingFile(false);
          setUploadError(errorMessage);
          toast({ title: errorMessage, variant: 'destructive' });
          continue;
        }

        const payload = await res.json();
        const data = await waitForTaskResult(payload);
        const filePath = (data as any).file_path as string | undefined;
        if (!filePath) {
          setUploadingFile(false);
          toast({ title: `Upload response missing file path for ${sanitizedFileName}`, variant: 'destructive' });
          setIsUploadModalOpen(false);
          continue;
        }

        // Store workbook_path and sheet metadata if available
        const workbookPath = (data as any).workbook_path as string | undefined;
        const sheetNames = Array.isArray((data as any).sheet_names) ? (data as any).sheet_names : [];
        const selectedSheet = (data as any).selected_sheet as string | undefined;
        const hasMultipleSheets = Boolean((data as any).has_multiple_sheets && sheetNames.length > 1);
        
        // If file has multiple sheets and no sheet was specified, show modal for sheet selection
        if (hasMultipleSheets && !form.has('sheet_name')) {
          setPendingUploadFile({ file: sanitizedFile, sanitizedFileName, data });
          setUploadSheetOptions(sheetNames.length ? sheetNames : selectedSheet ? [selectedSheet] : []);
          setUploadSelectedSheet(selectedSheet || sheetNames[0] || '');
          setUploadError('');
          setUploadingFile(false);
          // Modal is already open, just update it for sheet selection
          continue; // Skip adding to uploaded array for now, will be added after sheet selection
        }
        
        // Determine final selected sheet
        const finalSelectedSheet = form.has('sheet_name') ? (form.get('sheet_name') as string) : selectedSheet;
        
        if (workbookPath) {
          setWorkbookPathMap(prev => ({ ...prev, [sanitizedFileName]: workbookPath }));
          if (sheetNames.length > 0 && finalSelectedSheet) {
            setSheetMetadataMap(prev => ({
              ...prev,
              [sanitizedFileName]: {
                sheet_names: sheetNames,
                selected_sheet: finalSelectedSheet,
                original_filename: sanitizedFileName,
              }
            }));
          }
        }

        // Auto-save the file immediately after upload (like SavedDataFramesPanel)
        const sheetMetadata = workbookPath && sheetNames.length > 0 && finalSelectedSheet ? {
          sheet_names: sheetNames,
          selected_sheet: finalSelectedSheet,
          original_filename: sanitizedFileName,
        } : undefined;
        
        const savedPath = await autoSaveFile(filePath, sanitizedFileName, workbookPath, sheetMetadata);
        // Use saved path if available, otherwise use original filePath
        const finalPath = savedPath || filePath;

        uploaded.push({ name: sanitizedFileName, path: finalPath, size: file.size });
        
        // Close modal after successful upload
        setUploadingFile(false);
        setIsUploadModalOpen(false);

        if ((data as any).has_data_quality_issues && Array.isArray((data as any).warnings) && (data as any).warnings.length > 0) {
          const warnings = (data as any).warnings as string[];
          const mixedCols = Array.isArray((data as any).mixed_dtype_columns) ? (data as any).mixed_dtype_columns as string[] : [];
          if (mixedCols.length > 0) {
            const colList = mixedCols.slice(0, 5).join(', ');
            const moreText = mixedCols.length > 5 ? ` and ${mixedCols.length - 5} more` : '';
            toast({
              title: `⚠️ Data Quality Warning - ${sanitizedFileName}`,
              description: `File has mixed data types in columns: ${colList}${moreText}. This may lead to unstable results. Please use Dataframe Operations atom to fix column data types.`,
              variant: 'default',
              duration: 10000,
            });
          } else {
            toast({
              title: `⚠️ ${sanitizedFileName} uploaded with warnings`,
              description: warnings[0] || 'Some atoms may need data type conversion.',
              variant: 'default',
              duration: 8000,
            });
          }
        } else {
          toast({ title: `${sanitizedFileName} uploaded successfully` });
        }
      } catch (error: any) {
        setUploadingFile(false);
        setUploadError(error?.message || 'Upload failed');
        toast({
          title: `Failed to upload ${sanitizedFileName}`,
          description: error?.message,
          variant: 'destructive',
        });
      }
    }

    if (uploaded.length === 0) return;

    // When validation steps are enabled, mark uploaded files as coming from saved dataframes
    // This ensures they show in the canvas and are not filtered out
    if (settings.bypassMasterUpload) {
      setFilesFromSavedDataframes(prev => {
        const newSet = new Set(prev);
        uploaded.forEach(f => newSet.add(f.name));
        return newSet;
      });
    }

    setUploadedFiles((prev) => [...prev, ...uploaded]);
    updateSettings(atomId, {
      uploadedFiles: [...(settings.uploadedFiles || []), ...uploaded.map((f) => f.name)],
      fileMappings: {
        ...fileAssignments,
        ...Object.fromEntries(
          uploaded.map((f) => [
            f.name,
            !settings.bypassMasterUpload ? f.name : settings.requiredFiles?.[0] || '',
          ])
        ),
      },
      filePathMap: {
        ...(settings.filePathMap || {}),
        ...Object.fromEntries(uploaded.map((f) => [f.name, f.path])),
      },
      fileSizeMap: {
        ...(settings.fileSizeMap || {}),
        ...Object.fromEntries(uploaded.map((f) => [f.name, f.size])),
      },
    });
    setFileAssignments((prev) => ({
      ...prev,
      ...Object.fromEntries(
        uploaded.map((f) => [
          f.name,
          !settings.bypassMasterUpload ? f.name : settings.requiredFiles?.[0] || '',
        ])
      ),
    }));

    // Refresh saved dataframes list after upload when validation steps are enabled
    // Use a delay to ensure backend has processed all saves, then trigger refresh
    if (settings.bypassMasterUpload && uploaded.length > 0) {
      setTimeout(() => {
        setRefreshTrigger(prev => prev + 1);
      }, 500);
    }
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragOver(false);
    const files = Array.from(e.dataTransfer.files);
    void handleFileUpload(files);
  };

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragOver(true);
  };

  const handleDragLeave = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragOver(false);
  };

  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files) {
      const files = Array.from(e.target.files);
      void handleFileUpload(files);
      // allow selecting the same file again by resetting the input value
      e.target.value = '';
    }
  };

  const handleUploadSheetConfirm = async () => {
    if (!pendingUploadFile || !uploadSelectedSheet) return;
    
    setUploadingFile(true);
    setUploadError('');
    
    try {
      const { file, sanitizedFileName, data: initialData } = pendingUploadFile;
      
      // Re-upload with selected sheet
      const form = new FormData();
      form.append('file', file);
      form.append('sheet_name', uploadSelectedSheet);
      
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
        } catch {
          /* ignore */
        }
      }
      
      const res = await fetch(`${VALIDATE_API}/upload-file`, {
        method: 'POST',
        body: form,
        credentials: 'include',
      });
      
      if (!res.ok) {
        const errorData = await res.json().catch(() => ({}));
        const errorMessage = errorData.detail || `Failed to upload ${sanitizedFileName}`;
        setUploadError(errorMessage);
        setUploadingFile(false);
        return;
      }

      const payload = await res.json();
      const data = await waitForTaskResult(payload);
      const filePath = (data as any).file_path as string | undefined;
      if (!filePath) {
        setUploadError(`Upload response missing file path for ${sanitizedFileName}`);
        setUploadingFile(false);
        return;
      }

      // Store workbook_path and sheet metadata
      const workbookPath = (data as any).workbook_path as string | undefined;
      const sheetNames = Array.isArray((data as any).sheet_names) ? (data as any).sheet_names : [];
      const selectedSheet = uploadSelectedSheet;
      
      if (workbookPath) {
        setWorkbookPathMap(prev => ({ ...prev, [sanitizedFileName]: workbookPath }));
        if (sheetNames.length > 0 && selectedSheet) {
          setSheetMetadataMap(prev => ({
            ...prev,
            [sanitizedFileName]: {
              sheet_names: sheetNames,
              selected_sheet: selectedSheet,
              original_filename: sanitizedFileName,
            }
          }));
        }
      }

      // Auto-save the file immediately after upload (like SavedDataFramesPanel)
      const sheetMetadata = workbookPath && sheetNames.length > 0 && selectedSheet ? {
        sheet_names: sheetNames,
        selected_sheet: selectedSheet,
        original_filename: sanitizedFileName,
      } : undefined;
      
      const savedPath = await autoSaveFile(filePath, sanitizedFileName, workbookPath, sheetMetadata);
      // Use saved path if available, otherwise use original filePath
      const finalPath = savedPath || filePath;

      // Add to uploaded files
      const newFile: UploadedFileRef = {
        name: sanitizedFileName,
        path: finalPath,
        size: file.size,
      };

      // When validation steps are enabled, mark uploaded file as coming from saved dataframes
      // This ensures it shows in the canvas and is not filtered out
      if (settings.bypassMasterUpload) {
        setFilesFromSavedDataframes(prev => new Set([...prev, sanitizedFileName]));
      }

      setUploadedFiles((prev) => [...prev, newFile]);
      updateSettings(atomId, {
        uploadedFiles: [...(settings.uploadedFiles || []), sanitizedFileName],
        fileMappings: {
          ...fileAssignments,
          [sanitizedFileName]: !settings.bypassMasterUpload ? sanitizedFileName : settings.requiredFiles?.[0] || '',
        },
        filePathMap: {
          ...(settings.filePathMap || {}),
          [sanitizedFileName]: finalPath,
        },
        fileSizeMap: {
          ...(settings.fileSizeMap || {}),
          [sanitizedFileName]: file.size,
        },
      });
      setFileAssignments((prev) => ({
        ...prev,
        [sanitizedFileName]: !settings.bypassMasterUpload ? sanitizedFileName : settings.requiredFiles?.[0] || '',
      }));

      toast({ title: `${sanitizedFileName} uploaded successfully` });
      
      // Refresh saved dataframes list after upload when validation steps are enabled
      // Use a delay to ensure backend has processed the save, then trigger refresh
      if (settings.bypassMasterUpload) {
        setTimeout(() => {
          setRefreshTrigger(prev => prev + 1);
        }, 500);
      }
      
      // Reset modal state
      setPendingUploadFile(null);
      setIsUploadModalOpen(false);
      setUploadSheetOptions([]);
      setUploadSelectedSheet('');
      setUploadError('');
    } catch (error: any) {
      setUploadError(error?.message || 'Upload failed');
    } finally {
      setUploadingFile(false);
    }
  };

  const handleUploadSheetCancel = () => {
    setPendingUploadFile(null);
    setIsUploadModalOpen(false);
    setUploadSheetOptions([]);
    setUploadSelectedSheet('');
    setUploadError('');
    setUploadingFile(false);
  };

  const toggleSection = (sectionId: string) => {
    setOpenSections((prev) =>
      prev.includes(sectionId) ? prev.filter((id) => id !== sectionId) : [...prev, sectionId]
    );
  };

  const startRename = (name: string) => {
    setRenameTarget(name);
    setRenameValue(name);
  };

  const commitRename = (oldName: string) => {
    if (!renameValue.trim()) {
      setRenameTarget(null);
      return;
    }
    const newName = renameValue.trim();
    const newValidations: Record<string, any> = {};
    Object.entries(settings.validations || {}).forEach(([k, v]) => {
      newValidations[k === oldName ? newName : k] = v;
    });
    const newColumnConfig: Record<string, Record<string, string>> = {};
    Object.entries(settings.columnConfig || {}).forEach(([k, v]) => {
      newColumnConfig[k === oldName ? newName : k] = v as Record<string, string>;
    });
    const newFileKeyMap = { ...(settings.fileKeyMap || {}) } as Record<string, string>;
    const original = newFileKeyMap[oldName] || oldName;
    newFileKeyMap[newName] = original;
    delete newFileKeyMap[oldName];
    const newFilePathMap = { ...(settings.filePathMap || {}) } as Record<string, string>;
    if (newFilePathMap[oldName]) {
      newFilePathMap[newName] = newFilePathMap[oldName];
      delete newFilePathMap[oldName];
    }
    const newFileSizeMap = { ...(settings.fileSizeMap || {}) } as Record<string, number>;
    if (newFileSizeMap[oldName] !== undefined) {
      newFileSizeMap[newName] = newFileSizeMap[oldName];
      delete newFileSizeMap[oldName];
    }
    updateSettings(atomId, {
      validations: newValidations,
      columnConfig: newColumnConfig,
      fileKeyMap: newFileKeyMap,
      filePathMap: newFilePathMap,
      fileSizeMap: newFileSizeMap,
    });
    if (openFile === oldName) setOpenFile(newName);
    setRenameTarget(null);
  };

  const handleSelectSavedDataframe = async (objectName: string) => {
    const savedFile = savedDataframes.find(f => f.object_name === objectName);
    if (!savedFile) return;

    let fileName = savedFile.csv_name.split('/').pop() || savedFile.object_name.split('/').pop() || objectName;
    // Replace spaces with underscores in filename
    fileName = fileName.replace(/\s+/g, '_');
    
    // Check if file already exists
    if (uploadedFiles.some((f) => f.name === fileName) || (settings.uploadedFiles || []).includes(fileName)) {
      toast({
        title: 'Same file already present in the project',
        variant: 'destructive',
      });
      return;
    }

    // Add saved dataframe as an uploaded file
    const newFile: UploadedFileRef = {
      name: fileName,
      path: savedFile.object_name,
      size: 0, // Size not available for saved dataframes
    };

    // Mark this file as coming from saved dataframes
    setFilesFromSavedDataframes(prev => new Set([...prev, fileName]));

    // Clear metadata for this file to force reload (avoid caching issues)
    updateSettings(atomId, {
      uploadedFiles: [...(settings.uploadedFiles || []), fileName],
      fileMappings: {
        ...fileAssignments,
        [fileName]: !settings.bypassMasterUpload ? fileName : settings.requiredFiles?.[0] || '',
      },
      filePathMap: {
        ...(settings.filePathMap || {}),
        [fileName]: savedFile.object_name,
      },
      fileSizeMap: {
        ...(settings.fileSizeMap || {}),
        [fileName]: 0,
      },
      // Clear metadata for this file to force reload
      filesMetadata: {
        ...(settings.filesMetadata || {}),
        [fileName]: undefined,
      },
    });
    setFileAssignments((prev) => ({
      ...prev,
      [fileName]: !settings.bypassMasterUpload ? fileName : settings.requiredFiles?.[0] || '',
    }));

    setUploadedFiles((prev) => {
      const updated = [...prev, newFile];
      // Auto-open the file when validation steps are enabled
      if (settings.bypassMasterUpload) {
        // File will be opened automatically by FileDataPreview when metadata is fetched
      }
      return updated;
    });

    toast({ title: `${fileName} selected from saved dataframes` });
  };

  const handleDeleteFile = (name: string) => {
    setUploadedFiles(prev => prev.filter(f => f.name !== name));
    // Remove from filesFromSavedDataframes if it was there
    setFilesFromSavedDataframes(prev => {
      const newSet = new Set(prev);
      newSet.delete(name);
      return newSet;
    });
    const newUploads = (settings.uploadedFiles || []).filter(n => n !== name);
    const { [name]: _, ...restAssignments } = fileAssignments;
    const { [name]: __, ...restPaths } = settings.filePathMap || {};
    const { [name]: ___, ...restSizes } = settings.fileSizeMap || {};
    const { [name]: ____, ...restDtypeChanges } = settings.dtypeChanges || {};
    const { [name]: _____, ...restMissingValueStrategies } = settings.missingValueStrategies || {};
    const { [name]: ______, ...restMetadata } = settings.filesMetadata || {};
    const newFilesWithAppliedChanges = (settings.filesWithAppliedChanges || []).filter(f => f !== name);
    
    setFileAssignments(restAssignments);
    
    // Update ref
    const { [name]: _______, ...refRestDtypeChanges } = dataChangesRef.current.dtypeChanges;
    const { [name]: ________, ...refRestMissingValueStrategies } = dataChangesRef.current.missingValueStrategies;
    dataChangesRef.current = {
      dtypeChanges: refRestDtypeChanges,
      missingValueStrategies: refRestMissingValueStrategies,
    };
    
    // Update global store
    updateSettings(atomId, {
      uploadedFiles: newUploads,
      fileMappings: restAssignments,
      filePathMap: restPaths,
      fileSizeMap: restSizes,
      dtypeChanges: restDtypeChanges,
      missingValueStrategies: restMissingValueStrategies,
      filesWithAppliedChanges: newFilesWithAppliedChanges,
      filesMetadata: restMetadata,
    });
    setValidationResults(prev => {
      const { [name]: _, ...rest } = prev;
      return rest;
    });
    setValidationDetails(prev => {
      const { [name]: _, ...rest } = prev;
      return rest;
    });
    setSaveStatus(prev => {
      const { [name]: _, ...rest } = prev;
      return rest;
    });
    if (openValidatedFile === name) setOpenValidatedFile(null);
  };

  const uploadedFilesList = uploadedFiles.map(file => ({
    name: file.name,
    type: 'User Upload',
    size: `${(file.size / 1024 / 1024).toFixed(1)} MB`,
    status: validationResults[file.name] || 'pending'
  }));

  type FileInfo = { name: string; status: string; required: boolean; validations: any };
  const requiredFiles: FileInfo[] = (settings.requiredFiles || []).map(name => ({
    name,
    required: true,
    status: settings.uploadedFiles?.includes(name) ? 'uploaded' : 'pending',
    validations: settings.validations?.[name] || { ranges: [], periodicities: [], regex: [], nulls: [], referentials: [] }
  }));

  const getStatusIcon = (status: string, required: boolean) => {
    if (status === 'uploaded') return <Check className="w-4 h-4 text-green-500" />;
    if (required) return <AlertCircle className="w-4 h-4 text-orange-500" />;
    return <Info className="w-4 h-4 text-gray-400" />;
  };

  const handleAssignmentChange = (fileName: string, value: string) => {
    const newAssignments = { ...fileAssignments, [fileName]: value };
    setFileAssignments(newAssignments);
    updateSettings(atomId, { fileMappings: newAssignments });
  };

  const handleValidateFiles = async () => {
    if (!settings.validatorId) return;
    
    // When validation steps are enabled, only validate files from saved dataframes
    const filesToValidate = settings.bypassMasterUpload 
      ? uploadedFiles.filter(f => filesFromSavedDataframes.has(f.name))
      : uploadedFiles;
    
    if (filesToValidate.length === 0) {
      toast({
        title: 'No files to validate',
        description: settings.bypassMasterUpload 
          ? 'Please select files from "Select from Saved Dataframes" to validate them against their master files.'
          : 'Please upload files to validate.',
        variant: 'default',
      });
      return;
    }
    
    const form = new FormData();
    form.append('validator_atom_id', settings.validatorId);
    const paths = filesToValidate.map(f => f.path);
    form.append('file_paths', JSON.stringify(paths));
    
    // Generate keys ensuring uniqueness
    // First pass: get the assigned keys
    const initialKeys = filesToValidate.map(f => {
      const assigned = fileAssignments[f.name] || '';
      return settings.fileKeyMap?.[assigned] || assigned || f.name;
    });
    
    // Sanitize file name to match FILE_KEY_RE pattern: [A-Za-z0-9_.-]+
    const sanitizeKey = (name: string): string => {
      return name.replace(/[^A-Za-z0-9_.-]/g, '_').replace(/^\.+|\.+$/g, '');
    };
    
    // Ensure uniqueness: if there are duplicates, append index or use sanitized file name
    const keyCount = new Map<string, number>();
    initialKeys.forEach(key => {
      keyCount.set(key, (keyCount.get(key) || 0) + 1);
    });
    
    const keys = filesToValidate.map((f, idx) => {
      const initialKey = initialKeys[idx];
      // If this key is used by multiple files, make it unique
      if ((keyCount.get(initialKey) || 0) > 1) {
        // Try to preserve the assigned key by appending index
        if (initialKey && initialKey.trim()) {
          return `${initialKey}_${idx}`;
        }
        // Fallback to sanitized file name
        const sanitized = sanitizeKey(f.name);
        return sanitized || `file_${idx}`;
      }
      // Ensure key is valid and non-empty
      if (!initialKey || !initialKey.trim()) {
        const sanitized = sanitizeKey(f.name);
        return sanitized || `file_${idx}`;
      }
      return initialKey;
    });
    
    form.append('file_keys', JSON.stringify(keys));
    console.log('Validating files', {
      validator_atom_id: settings.validatorId,
      file_paths: paths,
      file_keys: keys,
    });
    try {
      const res = await fetch(`${VALIDATE_API}/validate`, { method: 'POST', body: form });
      if (!res.ok) {
        const errorText = await res.text();
        toast({
          title: 'Failed to validate files',
          description: errorText || undefined,
          variant: 'destructive',
        });
        logSessionState(user?.id);
        return;
      }

      const payload = await res.json();
      const data = await waitForTaskResult(payload);
      const cfgRes = await fetch(`${VALIDATE_API}/get_validator_config/${settings.validatorId}`);
      const cfg = cfgRes.ok ? await cfgRes.json() : { validations: {} };

      // Map backend types to frontend dtype format (matching apply-data-transformations expectations)
      const mapBackendTypeToDtype = (backendType: string): string => {
        const t = backendType.toLowerCase();
        if (t === "integer") return "int64";
        if (t === "numeric" || t === "number") return "float64";
        if (t.includes("date") || t === "datetime") return "datetime64";
        if (t === "string" || t === "object") return "object";
        if (t === "boolean" || t === "bool") return "bool";
        return "object"; // default
      };

      // Update dtypeChanges based on master file column types after validation
      // Start with existing dtypeChanges to preserve any manual changes
      const updatedDtypeChanges: Record<string, Record<string, string>> = { ...(settings.dtypeChanges || {}) };
      
      // Helper function to normalize column names (same as backend)
      const normalizeColumnName = (colName: string): string => {
        return colName.trim().toLowerCase().replace(/(?<!_)\s+(?!_)/g, '');
      };
      
      // Process each file to validate - ensure ALL files are processed
      filesToValidate.forEach((file, idx) => {
        const fileName = file.name;
        const key = keys[idx];
        
        // Get the master file assignment for this uploaded file
        // Use settings.fileMappings directly to ensure we have the latest assignments
        const masterFileAssignment = settings.fileMappings?.[fileName] || fileAssignments[fileName] || '';
        
        // Try multiple strategies to find the master file schema for THIS specific uploaded file
        // Strategy 1: Use fileKeyMap to get the backend key for the assigned master file
        // Strategy 2: Try the master file assignment directly (in case it's the actual master file name)
        // Strategy 3: Try the validation key (fallback)
        let masterSchema: any = null;
        let masterColumnTypes: Record<string, string> = {};
        
        // Try strategy 1: fileKeyMap lookup (most reliable - uses the saved mapping)
        if (masterFileAssignment) {
          const masterFileKey = settings.fileKeyMap?.[masterFileAssignment] || masterFileAssignment;
          if (masterFileKey && cfg.schemas?.[masterFileKey]) {
            masterSchema = cfg.schemas[masterFileKey];
            masterColumnTypes = cfg.column_types?.[masterFileKey] || {};
          }
          // Try strategy 2: direct assignment name (in case fileKeyMap doesn't have it)
          else if (cfg.schemas?.[masterFileAssignment]) {
            masterSchema = cfg.schemas[masterFileAssignment];
            masterColumnTypes = cfg.column_types?.[masterFileAssignment] || {};
          }
        }
        
        // Try strategy 3: validation key (fallback if assignment lookup failed)
        if (!masterSchema && cfg.schemas?.[key]) {
          masterSchema = cfg.schemas[key];
          masterColumnTypes = cfg.column_types?.[key] || {};
        }
        
        // Get uploaded file's actual column names from metadata
        const uploadedFileMetadata = settings.filesMetadata?.[fileName];
        const uploadedColumns = uploadedFileMetadata?.columns || [];
        
        // Initialize dtypeChanges for this file if not exists (even if no schema found)
        if (!updatedDtypeChanges[fileName]) {
          updatedDtypeChanges[fileName] = {};
        }
        
        // Process dtype mapping if we found a schema and have columns
        if (masterSchema && masterSchema.columns && uploadedColumns.length > 0) {
          // Create a map of normalized column names to actual column names from uploaded file
          const normalizedToActual: Record<string, string> = {};
          uploadedColumns.forEach((col: any) => {
            const normalized = normalizeColumnName(col.name);
            normalizedToActual[normalized] = col.name;
          });
          
          // For each column in master file schema, find matching uploaded file column and set dtype
          masterSchema.columns.forEach((col: any) => {
            const masterColName = col.column; // This is already normalized from backend
            const masterType = masterColumnTypes[masterColName] || col.type || "string";
            const dtype = mapBackendTypeToDtype(masterType);
            
            // Find the actual column name in uploaded file that matches this normalized master column name
            const actualColName = normalizedToActual[masterColName];
            
            if (actualColName) {
              // Update dtypeChanges using the actual column name from uploaded file
              updatedDtypeChanges[fileName][actualColName] = dtype;
            } else {
              // Fallback: use normalized name if actual name not found
              updatedDtypeChanges[fileName][masterColName] = dtype;
            }
          });
        }
      });
      
      // Update settings with the dtypeChanges from master file
      if (Object.keys(updatedDtypeChanges).length > 0) {
        updateSettings(atomId, {
          dtypeChanges: updatedDtypeChanges,
        });
        // Also update the ref so it's immediately available
        dataChangesRef.current = {
          ...dataChangesRef.current,
          dtypeChanges: updatedDtypeChanges,
        };
      }

      const results: Record<string, string> = {};
      const details: Record<string, any[]> = {};

      keys.forEach((k, idx) => {
        const fileName = filesToValidate[idx].name;
        const fileRes = data.file_validation_results?.[k] || {};

        const units = cfg.validations?.[k] || [];
        const failures = fileRes.condition_failures || [];
        const errors = fileRes.errors || [];
        const fileDetails: any[] = [];

        const missingCount = fileRes.mandatory_columns_missing || 0;
        const missingMsg = errors.find((e: string) =>
          e.toLowerCase().startsWith('missing mandatory columns')
        );
        const missingCols = missingMsg
          ? missingMsg
              .split(':')[1]
              .replace(/[[\]']/g, '')
              .split(',')
              .map(c => c.trim())
              .filter(Boolean)
          : [];
        const missingErrorMsg = missingCount > 0 ? missingMsg || `Missing mandatory columns: ${missingCols.join(', ')}` : '';
        fileDetails.push({
          name: 'required columns',
          column: missingCols.join(', '),
          desc: 'all mandatory columns present',
          status: missingCount > 0 ? 'Failed' : 'Passed',
          errorMessage: missingErrorMsg
        });
        units.forEach((u: any) => {
          let desc = '';
          if (u.validation_type === 'datatype') desc = u.expected;
          if (u.validation_type === 'range') {
            const parts = [] as string[];
            if (u.min !== undefined && u.min !== '' && u.min !== null) parts.push(`>= ${u.min}`);
            if (u.max !== undefined && u.max !== '' && u.max !== null) parts.push(`<= ${u.max}`);
            desc = parts.join(' ');
          }
          if (u.validation_type === 'periodicity') desc = u.periodicity;
          if (u.validation_type === 'regex') desc = u.pattern;
          if (u.validation_type === 'null_percentage') desc = `${u.value}% null`;
          if (u.validation_type === 'in_list') desc = `allowed: ${u.value?.join(', ')}`;

          let failed = false;
          let errorMessage = '';
          
          if (u.validation_type === 'datatype') {
            const col = u.column.toLowerCase();
            const datatypeError = errors.find((e: string) =>
              e.toLowerCase().includes(`column '${col}'`)
            );
            const datatypeCorrection = (fileRes.auto_corrections || []).find((c: string) =>
              c.toLowerCase().includes(`column '${col}'`)
            );
            failed = !!datatypeError || !!datatypeCorrection;
            if (failed) {
              errorMessage = datatypeError || datatypeCorrection || `Column '${u.column}' type mismatch`;
            }
          } else if (u.validation_type === 'periodicity') {
            const periodicityFailure = failures.find((f: any) => f.column === u.column && f.operator === 'date_frequency');
            failed = !!periodicityFailure;
            if (failed && periodicityFailure) {
              errorMessage = periodicityFailure.error_message || `Date frequency validation failed for column '${u.column}' (${periodicityFailure.failed_count} rows failed)`;
            }
          } else if (u.validation_type === 'range') {
            const rangeFailure = failures.find((f: any) => f.column === u.column && f.operator !== 'date_frequency');
            failed = !!rangeFailure;
            if (failed && rangeFailure) {
              errorMessage = rangeFailure.error_message || `Range validation failed for column '${u.column}' (${rangeFailure.failed_count} rows failed, expected: ${rangeFailure.operator} ${rangeFailure.expected_value})`;
            }
          } else if (u.validation_type === 'regex') {
            const regexFailure = failures.find((f: any) => f.column === u.column && f.operator === 'regex_match');
            failed = !!regexFailure;
            if (failed && regexFailure) {
              errorMessage = regexFailure.error_message || `Regex validation failed for column '${u.column}' (${regexFailure.failed_count} rows failed)`;
            }
          } else if (u.validation_type === 'null_percentage') {
            const nullFailure = failures.find((f: any) => f.column === u.column && f.operator === 'null_percentage');
            failed = !!nullFailure;
            if (failed && nullFailure) {
              errorMessage = nullFailure.error_message || `Null percentage validation failed for column '${u.column}' (${nullFailure.failed_count} rows failed, threshold: ${nullFailure.expected_value}%)`;
            }
          } else if (u.validation_type === 'in_list') {
            const inListFailure = failures.find((f: any) => f.column === u.column && f.operator === 'in_list');
            failed = !!inListFailure;
            if (failed && inListFailure) {
              errorMessage = inListFailure.error_message || `In-list validation failed for column '${u.column}' (${inListFailure.failed_count} rows failed, allowed values: ${Array.isArray(inListFailure.expected_value) ? inListFailure.expected_value.join(', ') : inListFailure.expected_value})`;
            }
          }

          fileDetails.push({
            name: u.validation_type,
            column: u.column,
            desc,
            status: failed ? 'Failed' : 'Passed',
            errorMessage: failed ? errorMessage : undefined
          });
        });
        fileDetails.sort((a, b) => (a.status === 'Failed' && b.status !== 'Failed' ? -1 : b.status === 'Failed' && a.status !== 'Failed' ? 1 : 0));
      details[fileName] = fileDetails;

        const isSuccess = fileDetails.every(d => d.status === 'Passed');
        results[fileName] = isSuccess ? 'File Validation Success' : 'File Validation Failure';
      });

      setValidationResults(results);
      setValidationDetails(details);
      
      // Save validation data to atom settings when validation steps are enabled
      if (settings.bypassMasterUpload) {
        const validatedFileNames = filesToValidate.map(f => f.name);
        updateSettings(atomId, {
          validationResults: results,
          validationDetails: details,
          validatedFiles: validatedFileNames,
        });
      }
      
      logSessionState(user?.id);
      
      // Check if all files passed validation
      const allFilesPassed = Object.values(results).every(result => result.includes('Success'));
      
      // Use the files that were validated
      const validatedFilesForSave = filesToValidate;
      
      // Create a save function that uses only validated files
      // This will be called regardless of validation success/failure to save dtype mapping changes
      const saveValidatedFiles = async () => {
          if (!settings.validatorId && settings.bypassMasterUpload) return;
          
          // Apply data transformations if any dtype changes were made during validation
          const currentChanges = dataChangesRef.current;
          const hasChanges = Object.keys(currentChanges.dtypeChanges).length > 0 || 
                            Object.keys(currentChanges.missingValueStrategies).length > 0;
          
          if (hasChanges) {
            console.log('🔧 Applying data transformations before auto-save...');
            const filesWithChangesApplied: string[] = [];
            
            for (const file of validatedFilesForSave) {
              // Use saved MinIO path if available, otherwise use temporary path
              let filePath = settings.filePathMap?.[file.name];
              
              if (filePath && !filePath.includes('/tmp/')) {
                // Use saved path
              } else if (file.path && !file.path.includes('/tmp/')) {
                filePath = file.path;
              } else {
                filePath = file.path;
              }
              
              const fileChanges = {
                file_path: filePath,
                dtype_changes: currentChanges.dtypeChanges[file.name] || {},
                missing_value_strategies: currentChanges.missingValueStrategies[file.name] || {},
              };
              
              // Only apply if there are actual changes for this file
              if (Object.keys(fileChanges.dtype_changes).length > 0 || 
                  Object.keys(fileChanges.missing_value_strategies).length > 0) {
                try {
                  const response = await fetch(`${VALIDATE_API}/apply-data-transformations`, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify(fileChanges),
                    credentials: 'include',
                  });
                  
                  if (response.ok) {
                    console.log(`✅ Transformations applied to ${file.name}`);
                    filesWithChangesApplied.push(file.name);
                  } else {
                    const error = await response.json();
                    toast({
                      title: `Failed to apply changes to ${file.name}`,
                      description: error.detail || 'An error occurred',
                      variant: 'destructive',
                    });
                    return; // Stop saving if transformation fails
                  }
                } catch (error) {
                  toast({
                    title: `Error transforming ${file.name}`,
                    description: 'Failed to apply data transformations',
                    variant: 'destructive',
                  });
                  return; // Stop saving if transformation fails
                }
              }
            }
            
            // Mark files as having changes applied
            if (filesWithChangesApplied.length > 0) {
              const newFilesWithAppliedChanges = Array.from(new Set([
                ...(settings.filesWithAppliedChanges || []),
                ...filesWithChangesApplied
              ]));
              
              updateSettings(atomId, {
                filesWithAppliedChanges: newFilesWithAppliedChanges,
              });
            }
          }
          
          const form = new FormData();
          const vidSave = settings.validatorId || 'bypass_upload';
          form.append('validator_atom_id', vidSave);
          
          // Use saved MinIO paths if available, otherwise use temporary paths
          const paths = validatedFilesForSave.map(f => {
            const savedPath = settings.filePathMap?.[f.name];
            if (savedPath && !savedPath.includes('/tmp/')) {
              return savedPath;
            }
            return f.path;
          });
          form.append('file_paths', JSON.stringify(paths));
          
          // Generate keys ensuring uniqueness (same logic as handleValidateFiles)
          const initialKeys = validatedFilesForSave.map(f => {
            const assigned = fileAssignments[f.name] || '';
            return settings.fileKeyMap?.[assigned] || assigned || f.name;
          });
          
          const sanitizeKey = (name: string): string => {
            return name.replace(/[^A-Za-z0-9_.-]/g, '_').replace(/^\.+|\.+$/g, '');
          };
          
          const keyCount = new Map<string, number>();
          initialKeys.forEach(key => {
            keyCount.set(key, (keyCount.get(key) || 0) + 1);
          });
          
          const saveKeys = validatedFilesForSave.map((f, idx) => {
            const initialKey = initialKeys[idx];
            if ((keyCount.get(initialKey) || 0) > 1) {
              if (initialKey && initialKey.trim()) {
                return `${initialKey}_${idx}`;
              }
              const sanitized = sanitizeKey(f.name);
              return sanitized || `file_${idx}`;
            }
            if (!initialKey || !initialKey.trim()) {
              const sanitized = sanitizeKey(f.name);
              return sanitized || `file_${idx}`;
            }
            return initialKey;
          });
          
          form.append('file_keys', JSON.stringify(saveKeys));
          form.append('overwrite', 'true');
          
          // Include workbook_paths and sheet_metadata if available
          const workbookPathsPayload: string[] = [];
          const sheetMetadataPayload: Array<{ sheet_names: string[]; selected_sheet: string; original_filename: string }> = [];
          
          validatedFilesForSave.forEach((file) => {
            const workbookPath = workbookPathMap[file.name];
            const sheetMetadata = sheetMetadataMap[file.name];
            
            if (workbookPath) {
              workbookPathsPayload.push(workbookPath);
              if (sheetMetadata) {
                sheetMetadataPayload.push(sheetMetadata);
              } else {
                sheetMetadataPayload.push({
                  sheet_names: [],
                  selected_sheet: '',
                  original_filename: file.name,
                });
              }
            }
          });
          
          if (workbookPathsPayload.length > 0) {
            form.append('workbook_paths', JSON.stringify(workbookPathsPayload));
          }
          if (sheetMetadataPayload.length > 0) {
            form.append('sheet_metadata', JSON.stringify(sheetMetadataPayload));
          }
          
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
            } catch {
              /* ignore */
            }
          }
          if (user?.id) form.append('user_id', String(user.id));
          if (user?.username) form.append('user_name', user.username);
          
          try {
            const saveRes = await fetch(`${VALIDATE_API}/save_dataframes`, {
              method: 'POST',
              body: form,
              credentials: 'include'
            });
            
            if (saveRes.ok) {
              const saveData = await saveRes.json();
              const fileResults = Array.isArray(saveData.minio_uploads) ? saveData.minio_uploads : [];
              
              const savedPaths: Record<string, string> = {};
              fileResults.forEach((r: any, idx: number) => {
                const name = validatedFilesForSave[idx]?.name;
                if (name && r?.minio_upload?.object_name) {
                  savedPaths[name] = r.minio_upload.object_name;
                }
              });
              
              if (Object.keys(savedPaths).length > 0) {
                updateSettings(atomId, {
                  filePathMap: { ...(settings.filePathMap || {}), ...savedPaths },
                });
              }
              
              toast({ title: 'Dataframes saved successfully after validation' });
            } else {
              const err = await saveRes.text();
              console.error('Auto-save after validation failed', saveRes.status, err);
            }
          } catch (saveError) {
            console.error('Error auto-saving after validation:', saveError);
          }
        };
      
      // Always trigger save to preserve dtype mapping changes, regardless of validation result
      if (allFilesPassed) {
        toast({ title: 'Validation completed successfully - Auto-saving dataframes...' });
      } else {
        toast({ title: 'Validation completed with failures - Auto-saving dataframes to preserve dtype changes...' });
      }
      
      // Trigger save for validated files (even if validation failed, to save dtype changes)
      await saveValidatedFiles();
      
      // Refresh saved dataframes list after save completes to update the dropdown
      if (settings.bypassMasterUpload) {
        // Use a small delay to ensure backend has processed the save, then trigger refresh
        setTimeout(() => {
          setRefreshTrigger(prev => prev + 1);
        }, 500);
      }
    } catch (error: any) {
      toast({
        title: 'Failed to validate files',
        description: error?.message,
        variant: 'destructive',
      });
      logSessionState(user?.id);
    }
  };

  const pollUploadStatus = (
    validatorId: string,
    fileKeys: string[],
    fileNames: string[],
  ) => {
    const seen: Record<string, string> = {};
    const interval = setInterval(async () => {
      await Promise.all(
        fileKeys.map(async (key, idx) => {
          try {
            const res = await fetch(
              `${VALIDATE_API}/upload-status/${validatorId}/${key}`,
              { credentials: 'include' }
            );
            if (res.ok) {
              const data = await res.json();
              const status = data.status as string | null;
              const name = fileNames[idx];
              if (status) {
                const normalized = status.toLowerCase();
                if (seen[name] !== normalized) {
                  seen[name] = normalized;
                  if (normalized !== 'saved') {
                    toast({ title: `${name}: ${status}` });
                  }
                }
              }
            }
          } catch {
            /* ignore */
          }
        })
      );
      const done = fileKeys.every((_, idx) => {
        const name = fileNames[idx];
        return seen[name] === 'saved' || seen[name] === 'rejected';
      });
      if (done) clearInterval(interval);
    }, 1000);
  };

  // Column Classifier Functions
  const handleAutoClassify = async (objectName: string) => {
    try {
      const form = new FormData();
      form.append('dataframe', objectName);
      form.append('identifiers', '[]');
      form.append('measures', '[]');
      form.append('unclassified', '[]');

      const res = await fetch(`${CLASSIFIER_API}/classify_columns`, {
        method: 'POST',
        body: form,
        credentials: 'include'
      });

      if (res.ok) {
        const data = await res.json();
        
        const cols: ColumnClassifierColumn[] = [
          ...data.final_classification.identifiers.map((name: string) => ({ name, category: 'identifiers' as const })),
          ...data.final_classification.measures.map((name: string) => ({ name, category: 'measures' as const })),
          ...data.final_classification.unclassified.map((name: string) => ({ name, category: 'unclassified' as const }))
        ];
        
        updateSettings(atomId, {
          classifierData: {
            files: [{
              fileName: objectName,
              columns: cols,
              customDimensions: {}
            }],
            activeFileIndex: 0
          },
          classifierSelectedFile: objectName,
        });
        
        toast({ title: 'Columns classified successfully' });
      } else {
        toast({ title: 'Failed to classify columns', variant: 'destructive' });
      }
    } catch (error) {
      console.error('Classification error:', error);
      toast({ title: 'Error classifying columns', variant: 'destructive' });
    }
  };

  // Auto-classify ALL files (creates tabs for each file)
  const handleAutoClassifyAllFiles = async () => {
    if (!settings.filePathMap) return;
    
    // Get all permanent paths (not temporary /tmp/ paths)
    const filesToClassify = Object.entries(settings.filePathMap)
      .filter(([_, path]) => path && !path.includes('/tmp/'))
      .map(([fileName, path]) => ({ fileName, path }));
    
    if (filesToClassify.length === 0) return;
    
    console.log(`🎯 Auto-classifying ${filesToClassify.length} file(s)`);
    
    try {
      const classifiedFiles: ColumnClassifierFile[] = [];
      
      for (const { fileName, path } of filesToClassify) {
        const form = new FormData();
        form.append('dataframe', path);
        form.append('identifiers', '[]');
        form.append('measures', '[]');
        form.append('unclassified', '[]');

        const res = await fetch(`${CLASSIFIER_API}/classify_columns`, {
          method: 'POST',
          body: form,
          credentials: 'include'
        });

        if (res.ok) {
          const data = await res.json();
          
          const cols: ColumnClassifierColumn[] = [
            ...data.final_classification.identifiers.map((name: string) => ({ name, category: 'identifiers' as const })),
            ...data.final_classification.measures.map((name: string) => ({ name, category: 'measures' as const })),
            ...data.final_classification.unclassified.map((name: string) => ({ name, category: 'unclassified' as const }))
          ];
          
          classifiedFiles.push({
            fileName: fileName, // Use original filename for tab display
            filePath: path, // Store MinIO path for saving configuration
            columns: cols,
            customDimensions: {}
          });
        }
      }
      
      if (classifiedFiles.length > 0) {
        updateSettings(atomId, {
          classifierData: {
            files: classifiedFiles,
            activeFileIndex: 0
          },
          classifierSelectedFile: filesToClassify[0].path,
        });
        
        toast({ 
          title: `${classifiedFiles.length} file(s) classified successfully`,
          description: classifiedFiles.map(f => f.fileName).join(', ')
        });
      }
    } catch (error) {
      console.error('Classification error:', error);
      toast({ title: 'Classification failed', variant: 'destructive' });
    }
  };

  const handleClassifierActiveFileChange = (fileIndex: number) => {
    const classifierData = settings.classifierData || { files: [], activeFileIndex: 0 };
    updateSettings(atomId, {
      classifierData: {
        ...classifierData,
        activeFileIndex: fileIndex
      }
    });
  };

  const handleClassifierColumnMove = (
    columnName: string | string[],
    newCategory: string,
    fileIndex?: number
  ) => {
    const classifierData = settings.classifierData || { files: [], activeFileIndex: 0 };
    const targetFileIndex = fileIndex !== undefined ? fileIndex : classifierData.activeFileIndex;
    const columnsToMove = Array.isArray(columnName) ? columnName : [columnName];

    const updatedFiles = classifierData.files.map((file, index) => {
      if (index !== targetFileIndex) return file;

      const updatedCustom = { ...file.customDimensions };
      columnsToMove.forEach(colName => {
        Object.keys(updatedCustom).forEach(key => {
          updatedCustom[key] = updatedCustom[key].filter(col => col !== colName);
        });
      });

      let updatedColumns = file.columns;
      if (newCategory === 'identifiers' || newCategory === 'measures' || newCategory === 'unclassified') {
        updatedColumns = file.columns.map(col =>
          columnsToMove.includes(col.name) ? { ...col, category: newCategory } : col
        );
      } else {
        if (!updatedCustom[newCategory]) {
          updatedCustom[newCategory] = [];
        }
        columnsToMove.forEach(colName => {
          if (!updatedCustom[newCategory].includes(colName)) {
            updatedCustom[newCategory].push(colName);
          }
        });
      }

      return {
        ...file,
        columns: updatedColumns,
        customDimensions: updatedCustom
      };
    });

    updateSettings(atomId, {
      classifierData: { ...classifierData, files: updatedFiles }
    });
  };

  const handleClassifierDimensionUpdate = (dimensions: Record<string, string[]>) => {
    const classifierData = settings.classifierData || { files: [], activeFileIndex: 0 };
    const updatedFiles = classifierData.files.map((file, index) =>
      index === classifierData.activeFileIndex
        ? { ...file, customDimensions: dimensions }
        : file
    );
    updateSettings(atomId, {
      classifierData: { ...classifierData, files: updatedFiles }
    });
  };

  const handleClassifierRemoveDimension = (dimensionName: string) => {
    const classifierData = settings.classifierData || { files: [], activeFileIndex: 0 };
    const dims = (settings.classifierDimensions || []).filter(d => d !== dimensionName);
    const updatedFiles = classifierData.files.map((file, index) => {
      if (index !== classifierData.activeFileIndex) return file;
      const updatedCustom = { ...file.customDimensions };
      const removedCols = updatedCustom[dimensionName] || [];
      delete updatedCustom[dimensionName];
      updatedCustom['unattributed'] = Array.from(
        new Set([...(updatedCustom['unattributed'] || []), ...removedCols])
      );
      return { ...file, customDimensions: updatedCustom };
    });
    updateSettings(atomId, {
      classifierDimensions: dims,
      classifierData: { ...classifierData, files: updatedFiles },
    });
  };

  const handleSaveClassifierConfig = async () => {
    const classifierData = settings.classifierData;
    if (!classifierData || !classifierData.files.length) return;
    
    const currentFile = classifierData.files[classifierData.activeFileIndex];
    const stored = localStorage.getItem('current-project');
    const envStr = localStorage.getItem('env');
    const project = stored ? JSON.parse(stored) : {};
    const env = envStr ? JSON.parse(envStr) : {};

    const identifiers = currentFile.columns
      .filter(c => c.category === 'identifiers')
      .map(c => c.name);
    const measures = currentFile.columns
      .filter(c => c.category === 'measures')
      .map(c => c.name);

    const payload: Record<string, any> = {
      project_id: project.id || null,
      client_name: env.CLIENT_NAME || '',
      app_name: env.APP_NAME || '',
      project_name: env.PROJECT_NAME || '',
      identifiers,
      measures,
      dimensions: currentFile.customDimensions
    };
    // Use filePath (MinIO path) if available, otherwise fallback to fileName
    if (currentFile.filePath) {
      payload.file_name = currentFile.filePath;
    } else if (currentFile.fileName) {
      payload.file_name = currentFile.fileName;
    }

    try {
      const res = await fetch(`${CLASSIFIER_API}/save_config`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
        credentials: 'include'
      });

      if (res.ok) {
        // Mark this file as saved
        const savedFiles = settings.classifierSavedFiles || [];
        if (!savedFiles.includes(currentFile.fileName)) {
          updateSettings(atomId, {
            classifierSavedFiles: [...savedFiles, currentFile.fileName]
          });
        }
        
        toast({ 
          title: 'Configuration Saved Successfully',
          description: `File: ${currentFile.fileName}`
        });
        localStorage.setItem('column-classifier-config', JSON.stringify(payload));
        updateSessionState(user?.id, {
          identifiers,
          measures,
          dimensions: currentFile.customDimensions,
        });
        addNavigationItem(user?.id, {
          atom: 'column-classifier',
          identifiers,
          measures,
          dimensions: currentFile.customDimensions,
        });
        logSessionState(user?.id);
      } else {
        toast({ 
          title: 'Unable to Save Configuration',
          description: `File: ${currentFile.fileName}`,
          variant: 'destructive' 
        });
        logSessionState(user?.id);
      }
    } catch (err) {
      toast({ title: 'Unable to Save Configuration', variant: 'destructive' });
      console.warn('classification save request failed', err);
      logSessionState(user?.id);
    }
  };

  // Auto-classify when toggle is turned ON after files are saved
  useEffect(() => {
    // Check if we have meaningful classification data (not just preview data)
    const hasMeaningfulClassifierData = settings.classifierData && 
      settings.classifierData.files && 
      settings.classifierData.files.length > 0 &&
      settings.classifierData.files.some(file => file.columns && file.columns.length > 0);
    
    // Only auto-classify if toggle is ON, no meaningful classification data, and files are saved with PERMANENT paths
    if (settings.enableColumnClassifier && !hasMeaningfulClassifierData && settings.filePathMap) {
      const permanentFiles = Object.entries(settings.filePathMap)
        .filter(([_, path]) => path && !path.includes('/tmp/'));
      
      if (permanentFiles.length > 0) {
        console.log(`✅ Auto-classifying ${permanentFiles.length} file(s) after toggle ON`);
        handleAutoClassifyAllFiles();
      } else {
        console.log('⏸️ Skipping auto-classify - paths are temporary (wait for save)');
      }
    }
  }, [settings.enableColumnClassifier, settings.filePathMap, settings.classifierData]);


  const handleSaveDataFrames = async () => {
    if (!settings.validatorId && settings.bypassMasterUpload) return;
    console.log('🔧 Running save dataframes util');
    
    // Apply data transformations if any changes were made
    const currentChanges = dataChangesRef.current;
    console.log('🔍 Current dataChangesRef:', currentChanges);
    console.log('🔍 Settings dtypeChanges:', settings.dtypeChanges);
    console.log('🔍 Settings missingValueStrategies:', settings.missingValueStrategies);
    
    const hasChanges = Object.keys(currentChanges.dtypeChanges).length > 0 || 
                      Object.keys(currentChanges.missingValueStrategies).length > 0;
    
    if (hasChanges) {
      console.log('🔧 Applying data transformations before saving...');
      const filesWithChangesApplied: string[] = [];
      
      for (const file of uploadedFiles) {
        // Use saved MinIO path if available, otherwise use temporary path
        // Check filePathMap first, then check if temp path exists, if not check saved dataframes
        let filePath = settings.filePathMap?.[file.name];
        
        // If we have a saved path and it's not temporary, use it
        if (filePath && !filePath.includes('/tmp/')) {
          // Use saved path
        } else if (file.path && !file.path.includes('/tmp/')) {
          // Use the file.path if it's not temporary
          filePath = file.path;
        } else {
          // If temp path doesn't exist, try to find in saved dataframes
          try {
            const envStr = localStorage.getItem('env');
            if (envStr) {
              try {
                const env = JSON.parse(envStr);
                if (env.CLIENT_NAME && env.APP_NAME && env.PROJECT_NAME) {
                  const query = '?' + new URLSearchParams({
                    client_name: env.CLIENT_NAME,
                    app_name: env.APP_NAME,
                    project_name: env.PROJECT_NAME
                  }).toString();
                  const check = await fetch(`${VALIDATE_API}/list_saved_dataframes${query}`);
                  if (check.ok) {
                    const data = await check.json();
                    const fileNameStem = file.name.replace(/\.[^/.]+$/, '').toLowerCase();
                    const savedFile = Array.isArray(data.files)
                      ? data.files.find((f: any) => {
                          const savedStem = (f.csv_name || '').toLowerCase().replace(/\.[^/.]+$/, '');
                          return savedStem === fileNameStem;
                        })
                      : null;
                    if (savedFile?.object_name) {
                      filePath = savedFile.object_name;
                      console.log(`📦 Found saved path for ${file.name}: ${filePath}`);
                    }
                  }
                }
              } catch {
                /* ignore */
              }
            }
          } catch {
            /* ignore */
          }
          
          // Fallback to file.path if we couldn't find a saved path
          if (!filePath) {
            filePath = file.path;
          }
        }
        
        const fileChanges = {
          file_path: filePath,
          dtype_changes: currentChanges.dtypeChanges[file.name] || {},
          missing_value_strategies: currentChanges.missingValueStrategies[file.name] || {},
        };
        
        console.log(`📤 Sending transformations for ${file.name}:`, {
          file_path: filePath,
          dtype_changes: fileChanges.dtype_changes,
          missing_value_strategies: fileChanges.missing_value_strategies,
        });
        
        // Only apply if there are actual changes for this file
        if (Object.keys(fileChanges.dtype_changes).length > 0 || 
            Object.keys(fileChanges.missing_value_strategies).length > 0) {
          try {
            const response = await fetch(`${VALIDATE_API}/apply-data-transformations`, {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify(fileChanges),
              credentials: 'include',
            });
            
            if (response.ok) {
              console.log(`✅ Transformations applied to ${file.name}`);
              filesWithChangesApplied.push(file.name);
            } else {
              const error = await response.json();
              toast({
                title: `Failed to apply changes to ${file.name}`,
                description: error.detail || 'An error occurred',
                variant: 'destructive',
              });
              return; // Stop saving if transformation fails
            }
          } catch (error) {
            toast({
              title: `Error transforming ${file.name}`,
              description: 'Failed to apply data transformations',
              variant: 'destructive',
            });
            return; // Stop saving if transformation fails
          }
        }
      }
      
      // Mark files as having changes applied (but keep the configuration data)
      if (filesWithChangesApplied.length > 0) {
        const newFilesWithAppliedChanges = Array.from(new Set([
          ...(settings.filesWithAppliedChanges || []),
          ...filesWithChangesApplied
        ]));
        
        // Keep the configuration in the store - don't delete it!
        // This allows it to persist when saving/reloading
        updateSettings(atomId, {
          filesWithAppliedChanges: newFilesWithAppliedChanges,
        });
      }
    }
    
    // Removed pre-check for existing files - will allow overwrite automatically
    const form = new FormData();
    const vidSave = settings.validatorId || 'bypass_upload';
    form.append('validator_atom_id', vidSave);
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
      } catch {
        /* ignore */
      }
    }
    if (user?.id) form.append('user_id', String(user.id));
    if (user?.username) form.append('user_name', user.username);
    
    // Use saved MinIO paths if available, otherwise use temporary paths
    // This prevents 500 errors when trying to read temporary paths that no longer exist
    const paths = uploadedFiles.map(f => {
      const savedPath = settings.filePathMap?.[f.name];
      // Use saved path if it exists and doesn't look like a temporary path
      if (savedPath && !savedPath.includes('/tmp/')) {
        return savedPath;
      }
      return f.path;
    });
    form.append('file_paths', JSON.stringify(paths));
    
    // Generate keys ensuring uniqueness (same logic as handleValidateFiles)
    const initialKeys = uploadedFiles.map(f => {
      const assigned = fileAssignments[f.name] || '';
      return settings.fileKeyMap?.[assigned] || assigned || f.name;
    });
    
    // Sanitize file name to match FILE_KEY_RE pattern: [A-Za-z0-9_.-]+
    const sanitizeKey = (name: string): string => {
      return name.replace(/[^A-Za-z0-9_.-]/g, '_').replace(/^\.+|\.+$/g, '');
    };
    
    const keyCount = new Map<string, number>();
    initialKeys.forEach(key => {
      keyCount.set(key, (keyCount.get(key) || 0) + 1);
    });
    
    const keys = uploadedFiles.map((f, idx) => {
      const initialKey = initialKeys[idx];
      if ((keyCount.get(initialKey) || 0) > 1) {
        // Try to preserve the assigned key by appending index
        if (initialKey && initialKey.trim()) {
          return `${initialKey}_${idx}`;
        }
        // Fallback to sanitized file name
        const sanitized = sanitizeKey(f.name);
        return sanitized || `file_${idx}`;
      }
      // Ensure key is valid and non-empty
      if (!initialKey || !initialKey.trim()) {
        const sanitized = sanitizeKey(f.name);
        return sanitized || `file_${idx}`;
      }
      return initialKey;
    });
    
    form.append('file_keys', JSON.stringify(keys));
    form.append('overwrite', 'true'); // Always allow overwrite
    
    // Include workbook_paths and sheet_metadata if available
    const workbookPathsPayload: string[] = [];
    const sheetMetadataPayload: Array<{ sheet_names: string[]; selected_sheet: string; original_filename: string }> = [];
    
    uploadedFiles.forEach((file, idx) => {
      const workbookPath = workbookPathMap[file.name];
      const sheetMetadata = sheetMetadataMap[file.name];
      
      if (workbookPath) {
        workbookPathsPayload.push(workbookPath);
        if (sheetMetadata) {
          sheetMetadataPayload.push(sheetMetadata);
        } else {
          // If we have workbook path but no metadata, create default metadata
          sheetMetadataPayload.push({
            sheet_names: [],
            selected_sheet: '',
            original_filename: file.name,
          });
        }
      }
    });
    
    if (workbookPathsPayload.length > 0) {
      form.append('workbook_paths', JSON.stringify(workbookPathsPayload));
    }
    if (sheetMetadataPayload.length > 0) {
      form.append('sheet_metadata', JSON.stringify(sheetMetadataPayload));
    }
    
    console.log('Saving dataframes', {
      validator_atom_id: vidSave,
      file_paths: paths,
      file_keys: keys,
      overwrite: true,
      workbook_paths: workbookPathsPayload,
      sheet_metadata: sheetMetadataPayload,
    });
    
    const savePromise = fetch(`${VALIDATE_API}/save_dataframes`, {
      method: 'POST',
      body: form,
      credentials: 'include'
    });
    pollUploadStatus(
      vidSave,
      keys,
      uploadedFiles.map(f => f.name)
    );
    const res = await savePromise;
    if (res.ok) {
      const data = await res.json();
      if (data.environment) {
        console.log('Fetched env vars', data.environment);
        updateSessionState(user?.id, { envvars: data.environment });
      }
      if (data.prefix) {
        console.log('Saving to MinIO prefix', data.prefix);
      }
      const newStatus: Record<string, string> = {};
      const fileResults = Array.isArray(data.minio_uploads)
        ? data.minio_uploads
        : [];
      
      // Separate files that were saved successfully from those that already exist
      const alreadySavedFiles: string[] = [];
      const successfullySavedFiles: Array<{ name: string; result: any }> = [];
      
      fileResults.forEach((r: any, idx: number) => {
        const name = uploadedFiles[idx]?.name || r.file_key;
        if (!name) {
          return;
        }
        
        if (r.already_saved) {
          alreadySavedFiles.push(name);
        } else if (r.minio_upload?.object_name || !r.error) {
          // File was saved successfully (has object_name or no error)
          successfullySavedFiles.push({ name, result: r });
        }
      });
      
      // Process successfully saved files first
      if (successfullySavedFiles.length > 0) {
        const savedPaths: Record<string, string> = {};
        // Show toast for each file with a small delay to ensure all messages appear
        successfullySavedFiles.forEach(({ name, result }, index) => {
          const obj = result.minio_upload?.object_name;
          if (obj) {
            const env = data.environment || {};
            const loc = `/${env.CLIENT_NAME}/${env.APP_NAME}/${env.PROJECT_NAME}`;
            console.log(`File ${name} saved as ${obj} in ${loc}`);
            savedPaths[name] = obj;
          }

          let statusMessage = 'Saved successfully';
          let variant: 'destructive' | undefined;
          if (result.error) {
            statusMessage = `Not saved: ${result.error}`;
            variant = 'destructive';
          }

          newStatus[name] = statusMessage;

          // Add a delay between toasts to ensure all messages are displayed
          setTimeout(() => {
            toast({
              title: name,
              description: statusMessage,
              variant,
            });
          }, index * 800); // 800ms delay between each toast
        });
        
        // Update settings with successfully saved files
        if (Object.keys(savedPaths).length > 0) {
          updateSettings(atomId, {
            uploadedFiles: uploadedFiles.map(f => f.name),
            filePathMap: { ...(settings.filePathMap || {}), ...savedPaths },
            fileSizeMap: {
              ...(settings.fileSizeMap || {}),
              ...Object.fromEntries(uploadedFiles.map(f => [f.name, f.size])),
            },
            fileMappings: fileAssignments,
          });
        }
        
        setSaveStatus(prev => ({ ...prev, ...newStatus }));
      }
      
      // If there are files that already exist, they were overwritten (overwrite=true was sent)
      if (alreadySavedFiles.length > 0) {
        // Calculate delay offset to continue after successfully saved files toasts
        const delayOffset = successfullySavedFiles.length * 800;
        alreadySavedFiles.forEach((name, index) => {
          // Add a delay between toasts to ensure all messages are displayed
          setTimeout(() => {
            toast({
              title: name,
              description: 'File was overwritten successfully',
            });
          }, delayOffset + (index * 800)); // Continue delay sequence after successfully saved files
        });
      }
      
      // Complete the save
      if (successfullySavedFiles.length > 0) {
        addNavigationItem(user?.id, {
          atom: 'data-upload-validate',
          files: uploadedFiles.map(f => f.name),
          settings
        });
        logSessionState(user?.id);
        
        // Auto-trigger column classification if toggle is enabled - classify ALL files
        if (settings.enableColumnClassifier && successfullySavedFiles.length > 0) {
          console.log(`🔍 Auto-classifying all saved files after save`);
          handleAutoClassifyAllFiles();
        }
      }
    } else {
      const err = await res.text();
      console.error('Save dataframes failed', res.status, err);
      let errorMessage = 'Unable to Save Dataframes';
      try {
        const errorJson = JSON.parse(err);
        errorMessage = errorJson.detail || errorMessage;
      } catch {
        errorMessage = err || errorMessage;
      }
      toast({ 
        title: 'Unable to Save Dataframes', 
        description: errorMessage,
        variant: 'destructive' 
      });
      logSessionState(user?.id);
    }
  };

  const dimensions = [
    'Brand',
    'Category',
    'Region',
    'Channel',
    'Season',
    'Customer_Segment',
    'Product_Type',
    'Price_Tier',
    'Market',
    'Distribution',
    'Segment',
    'SKU',
  ];

  const measures = [
    'Volume_Sales',
    'Value_Sales',
    'Revenue',
    'Profit',
    'Units_Sold',
    'Market_Share',
    'Price',
    'Cost',
    'Margin',
    'Discount',
    'Promotion_Lift',
    'Base_Sales',
  ];

  const SectionCard = ({
    id,
    title,
    children,
    icon,
  }: {
    id: string;
    title: string;
    children: React.ReactNode;
    icon?: React.ReactNode;
  }) => {
    const isOpen = openSections.includes(id);

    return (
      <Card className="border border-gray-200 shadow-sm hover:shadow-md transition-all duration-200">
        <Collapsible open={isOpen} onOpenChange={() => toggleSection(id)}>
          <CollapsibleTrigger className="flex items-center justify-between w-full p-4 hover:bg-gray-50 transition-colors">
            <div className="flex items-center space-x-2">
              {icon}
              <h4 className="font-medium text-gray-900">{title}</h4>
            </div>
            <ChevronDown className={`w-4 h-4 text-gray-500 transition-transform duration-200 ${isOpen ? 'rotate-180' : ''}`} />
          </CollapsibleTrigger>
          <CollapsibleContent>
            <div className="px-4 pb-4 border-t border-gray-100 bg-gray-50/50">{children}</div>
          </CollapsibleContent>
        </Collapsible>
      </Card>
    );
  };

  const allValid = !settings.bypassMasterUpload || (
    Object.values(validationResults).length > 0 &&
    Object.values(validationResults).every(v => v.includes('Success'))
  );

  return (
    <div className="w-full h-full bg-gradient-to-br from-slate-50 to-blue-50 rounded-xl border border-gray-200 shadow-xl overflow-hidden flex">
      <div className="flex-1 flex flex-col">
        <div className="flex-1 p-6 bg-gray-50 overflow-y-auto scrollbar-thin scrollbar-thumb-gray-300">
          <div className="flex space-x-6">
            <div className={settings.bypassMasterUpload ? "flex-1 min-w-0" : "w-full flex flex-col"}>
              <div className={settings.enableColumnClassifier && settings.classifierData && settings.classifierData.files.length > 0 ? "" : "h-full"}>
              <UploadSection
                uploadedFiles={uploadedFiles}
                files={uploadedFilesList}
                validationResults={validationResults}
                validationDetails={validationDetails}
                openValidatedFile={openValidatedFile}
                setOpenValidatedFile={setOpenValidatedFile}
                fileAssignments={fileAssignments}
                onAssignmentChange={handleAssignmentChange}
                onDrop={handleDrop}
                onDragOver={handleDragOver}
                onDragLeave={handleDragLeave}
                onFileSelect={handleFileSelect}
                onValidateFiles={handleValidateFiles}
                onSaveDataFrames={handleSaveDataFrames}
                saveEnabled={true}
                disableValidation={!settings.bypassMasterUpload || allFilesSaved}
                isDragOver={isDragOver}
                requiredOptions={settings.requiredFiles || []}
                onDeleteFile={handleDeleteFile}
                saveStatus={saveStatus}
                disabled={false}
                useMasterFile={settings.bypassMasterUpload}
                onDataChanges={handleDataChanges}
                filesWithAppliedChanges={filesWithAppliedChanges}
                filePathMap={settings.filePathMap || {}}
                initialDtypeChanges={settings.dtypeChanges || {}}
                initialMissingValueStrategies={settings.missingValueStrategies || {}}
                initialFilesMetadata={settings.filesMetadata || {}}
                onMetadataChange={handleMetadataChange}
                savedDataframes={savedDataframes}
                isLoadingSavedDataframes={isLoadingSavedDataframes}
                onSelectSavedDataframe={handleSelectSavedDataframe}
                filesFromSavedDataframes={filesFromSavedDataframes}
                onRefreshSavedDataframes={refreshSavedDataframes}
              />
              </div>

              {/* Column Classifier Section */}
              {settings.enableColumnClassifier && settings.classifierData && settings.classifierData.files.length > 0 && (
                <div className="mt-6 w-full bg-white border border-gray-200 rounded-lg shadow-sm">
                  <div className="p-4">
                    {/* File Configuration Status */}
                    {settings.classifierData.files.length > 1 && (
                      <Collapsible open={isConfigStatusOpen} onOpenChange={setIsConfigStatusOpen}>
                        <div className="mb-6 bg-gradient-to-br from-blue-50 to-indigo-50 rounded-xl border border-blue-200 shadow-sm overflow-hidden">
                          <CollapsibleTrigger className="w-full p-4 hover:bg-blue-100/50 transition-colors cursor-pointer">
                            <div className="flex items-center justify-between">
                              <div className="flex items-center gap-3">
                                <div className="w-8 h-8 bg-gradient-to-br from-blue-500 to-indigo-600 rounded-lg flex items-center justify-center shadow-md">
                                  <ClipboardCheck className="w-4 h-4 text-white" />
                                </div>
                                <div className="text-left">
                                  <h4 className="text-sm font-bold text-gray-800">Configuration Status</h4>
                                  <div className="flex items-center gap-3 text-xs text-gray-600">
                                    <span className="flex items-center gap-1.5">
                                      <span className="w-2.5 h-2.5 rounded-full border-2 border-green-500 bg-white"></span>
                                      Saved
                                    </span>
                                    <span className="flex items-center gap-1.5">
                                      <span className="w-2.5 h-2.5 rounded-full border-2 border-red-500 bg-white"></span>
                                      Pending
                                    </span>
                                    <span className="text-gray-500">•</span>
                                    <span>{(settings.classifierSavedFiles || []).length}/{settings.classifierData.files.length} completed</span>
                                  </div>
                                </div>
                              </div>
                              <ChevronDown className={`w-5 h-5 text-gray-600 transition-transform duration-200 ${isConfigStatusOpen ? 'rotate-180' : ''}`} />
                            </div>
                          </CollapsibleTrigger>
                          
                          <CollapsibleContent>
                            <div className="px-4 pb-4">
                              <div className="flex flex-wrap gap-3">
                                {settings.classifierData.files.map((file, index) => {
                                  const isSaved = (settings.classifierSavedFiles || []).includes(file.fileName);
                                  const isActive = settings.classifierData.activeFileIndex === index;
                                  const fileName = file.fileName.length > 15 ? file.fileName.substring(0, 12) + '...' : file.fileName;
                                  
                                  return (
                                    <div 
                                      key={index} 
                                      onClick={() => handleClassifierActiveFileChange(index)}
                                      title={file.fileName}
                                      className={`group relative flex items-center justify-center px-4 py-2 rounded-full border-3 transition-all duration-200 cursor-pointer ${
                                        isSaved 
                                          ? 'border-green-500 bg-green-50 hover:bg-green-100' 
                                          : 'border-red-500 bg-red-50 hover:bg-red-100'
                                      } ${
                                        isActive 
                                          ? 'ring-2 ring-blue-400 ring-offset-2 shadow-lg scale-105' 
                                          : 'hover:shadow-md hover:scale-105'
                                      }`}
                                      style={{ borderWidth: '3px' }}
                                    >
                                      <span className={`text-xs font-semibold ${
                                        isSaved ? 'text-green-700' : 'text-red-700'
                                      }`}>
                                        {fileName}
                                      </span>
                                      {isActive && (
                                        <div className="absolute -top-1 -right-1 w-3 h-3 bg-blue-500 rounded-full border-2 border-white"></div>
                                      )}
                                    </div>
                                  );
                                })}
                              </div>
                            </div>
                          </CollapsibleContent>
                        </div>
                      </Collapsible>
                    )}
                    
                    <ColumnClassifierCanvas
                      data={settings.classifierData}
                      onColumnMove={handleClassifierColumnMove}
                      onActiveFileChange={handleClassifierActiveFileChange}
                      showColumnView={false}
                      filterUnique={false}
                      onFilterToggle={() => {}}
                      hideDimensionInstructions={settings.classifierEnableDimensionMapping || false}
                    />
                    
                    {settings.classifierEnableDimensionMapping && (
                    <div className="mt-4">
                      <ColumnClassifierDimensionMapping
                        customDimensions={
                          settings.classifierData.files[settings.classifierData.activeFileIndex]?.customDimensions || {}
                        }
                        onRemoveDimension={handleClassifierRemoveDimension}
                        onDimensionUpdate={handleClassifierDimensionUpdate}
                      />
                      <Button
                        onClick={handleSaveClassifierConfig}
                        disabled={
                          !settings.classifierEnableDimensionMapping ||
                          !settings.classifierData.files.length ||
                          Object.keys(
                            settings.classifierData.files[settings.classifierData.activeFileIndex]?.customDimensions || {}
                          ).length === 0 ||
                          Object.values(
                            settings.classifierData.files[settings.classifierData.activeFileIndex]?.customDimensions || {}
                          ).every(c => c.length === 0)
                        }
                        className="w-full h-12 text-sm font-semibold bg-gradient-to-r from-gray-800 to-gray-900 hover:from-gray-900 hover:to-black mt-4"
                      >
                        Save Configuration
                      </Button>
                    </div>
                  )}
                  </div>
                </div>
              )}
            </div>

            {settings.bypassMasterUpload && (
              <div className="w-80">
                <RequiredFilesSection
                  files={requiredFiles}
                  columnConfig={settings.columnConfig || {}}
                  renameTarget={renameTarget}
                  renameValue={renameValue}
                  setRenameValue={setRenameValue}
                  startRename={startRename}
                  commitRename={commitRename}
                  openFile={openFile}
                  setOpenFile={setOpenFile}
                  getStatusIcon={getStatusIcon}
                  useMasterFile={settings.bypassMasterUpload}
                />
              </div>
            )}
          </div>
        </div>
      </div>
      
      {isUploadModalOpen && pendingUploadFile && createPortal(
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40">
          <div className="bg-white rounded-lg shadow-xl w-96 max-w-[90vw] p-4">
            <h4 className="text-lg font-semibold text-gray-900 mb-2">Upload DataFrame</h4>
            <p className="text-sm text-gray-600 truncate">{pendingUploadFile.sanitizedFileName || 'No file selected'}</p>
            {uploadError && <p className="text-xs text-red-500 mt-2">{uploadError}</p>}
            {uploadSheetOptions.length > 0 ? (
              <div className="mt-4">
                <Label className="text-xs text-gray-600 mb-1 block">Select worksheet</Label>
                <Select value={uploadSelectedSheet} onValueChange={setUploadSelectedSheet}>
                  <SelectTrigger className="w-full">
                    <SelectValue placeholder="Select sheet" />
                  </SelectTrigger>
                  <SelectContent>
                    {uploadSheetOptions.map(sheet => (
                      <SelectItem key={sheet} value={sheet}>
                        {sheet}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            ) : (
              <div className="mt-4 text-sm text-gray-600">
                {uploadingFile ? 'Processing file…' : 'Preparing upload…'}
              </div>
            )}
            <div className="flex justify-end gap-2 mt-6">
              <Button
                variant="outline"
                size="sm"
                onClick={handleUploadSheetCancel}
                disabled={uploadingFile}
              >
                Cancel
              </Button>
              {uploadSheetOptions.length > 0 && (
                <Button
                  size="sm"
                  onClick={handleUploadSheetConfirm}
                  disabled={uploadingFile || !uploadSelectedSheet}
                >
                  Upload Sheet
                </Button>
              )}
            </div>
          </div>
        </div>,
        document.body
      )}
    </div>
  );
};

export default DataUploadValidateAtom;
