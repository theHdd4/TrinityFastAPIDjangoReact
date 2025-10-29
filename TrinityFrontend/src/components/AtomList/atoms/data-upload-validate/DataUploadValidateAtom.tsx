import React, { useState, useEffect } from 'react';
import { Info, Check, AlertCircle, Upload, Settings, ClipboardCheck, Eye, ChevronDown, Plus, Pencil } from 'lucide-react';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Input } from '@/components/ui/input';
import { Checkbox } from '@/components/ui/checkbox';
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible';
import {
  useLaboratoryStore,
  DataUploadSettings,
  createDefaultDataUploadSettings,
  ColumnClassifierColumn,
  ColumnClassifierFile,
} from '@/components/LaboratoryMode/store/laboratoryStore';
import { VALIDATE_API, CLASSIFIER_API } from '@/lib/api';
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
  const [validationResults, setValidationResults] = useState<Record<string, string>>({});
  const [validationDetails, setValidationDetails] = useState<Record<string, any[]>>({});
  const [openValidatedFile, setOpenValidatedFile] = useState<string | null>(null);
  const [saveStatus, setSaveStatus] = useState<Record<string, string>>({});
  const [allFilesSaved, setAllFilesSaved] = useState(false);
  const [isConfigStatusOpen, setIsConfigStatusOpen] = useState(false);
  
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
    }
  }, [settings.uploadedFiles, settings.filePathMap, settings.fileSizeMap, uploadedFiles.length]);

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
      const stem = file.name.replace(/\.[^/.]+$/, '').toLowerCase();
      if (
        savedNames.has(stem) ||
        uploadedFiles.some((f) => f.name === file.name) ||
        (settings.uploadedFiles || []).includes(file.name)
      ) {
        toast({
          title: 'Same file already present in the project',
          variant: 'destructive',
        });
        continue;
      }

      const form = new FormData();
      form.append('file', file);
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
        if (res.ok) {
          const data = await res.json();
          uploaded.push({ name: file.name, path: data.file_path, size: file.size });
          
          // Check for data quality warnings
          if (data.has_data_quality_issues && data.warnings && data.warnings.length > 0) {
            // Display warning toast with mixed data type information
            if (data.mixed_dtype_columns && data.mixed_dtype_columns.length > 0) {
              const colList = data.mixed_dtype_columns.slice(0, 5).join(', ');
              const moreText = data.mixed_dtype_columns.length > 5 
                ? ` and ${data.mixed_dtype_columns.length - 5} more` 
                : '';
              
              toast({
                title: `⚠️ Data Quality Warning - ${file.name}`,
                description: `File has mixed data types in columns: ${colList}${moreText}. This may lead to unstable results. Please use Dataframe Operations atom to fix column data types.`,
                variant: 'default',
                duration: 10000, // Show for 10 seconds
              });
            } else {
              // Generic warning
              toast({
                title: `⚠️ ${file.name} uploaded with warnings`,
                description: data.warnings[0] || 'Some atoms may need data type conversion.',
                variant: 'default',
                duration: 8000,
              });
            }
          } else {
            // Success without warnings
            toast({ title: `${file.name} uploaded successfully` });
          }
        } else {
          const errorData = await res.json().catch(() => ({}));
          const errorMessage = errorData.detail || `Failed to upload ${file.name}`;
          toast({ title: errorMessage, variant: 'destructive' });
        }
      } catch (error) {
        toast({ title: `Failed to upload ${file.name}`, variant: 'destructive' });
      }
    }

    if (uploaded.length === 0) return;

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

  const handleDeleteFile = (name: string) => {
    setUploadedFiles(prev => prev.filter(f => f.name !== name));
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
    const form = new FormData();
    form.append('validator_atom_id', settings.validatorId);
    const paths = uploadedFiles.map(f => f.path);
    form.append('file_paths', JSON.stringify(paths));
    const keys = uploadedFiles.map(f => {
      const assigned = fileAssignments[f.name] || '';
      return settings.fileKeyMap?.[assigned] || assigned;
    });
    form.append('file_keys', JSON.stringify(keys));
    console.log('Validating files', {
      validator_atom_id: settings.validatorId,
      file_paths: paths,
      file_keys: keys,
    });
    const res = await fetch(`${VALIDATE_API}/validate`, { method: 'POST', body: form });
    if (res.ok) {
      const data = await res.json();
      const cfgRes = await fetch(`${VALIDATE_API}/get_validator_config/${settings.validatorId}`);
      const cfg = cfgRes.ok ? await cfgRes.json() : { validations: {} };

      const results: Record<string, string> = {};
      const details: Record<string, any[]> = {};

      keys.forEach((k, idx) => {
        const fileName = uploadedFiles[idx].name;
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
        fileDetails.push({
          name: 'required columns',
          column: missingCols.join(', '),
          desc: 'all mandatory columns present',
          status: missingCount > 0 ? 'Failed' : 'Passed'
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
          if (u.validation_type === 'datatype') {
            const col = u.column.toLowerCase();
            failed =
              errors.some((e: string) =>
                e.toLowerCase().includes(`column '${col}'`)
              ) ||
              (fileRes.auto_corrections || []).some((c: string) =>
                c.toLowerCase().includes(`column '${col}'`)
              );
          } else if (u.validation_type === 'periodicity') {
            failed = failures.some((f: any) => f.column === u.column && f.operator === 'date_frequency');
          } else if (u.validation_type === 'range') {
            failed = failures.some((f: any) => f.column === u.column && f.operator !== 'date_frequency');
          } else if (u.validation_type === 'regex') {
            failed = failures.some((f: any) => f.column === u.column && f.operator === 'regex_match');
          } else if (u.validation_type === 'null_percentage') {
            failed = failures.some((f: any) => f.column === u.column && f.operator === 'null_percentage');
          } else if (u.validation_type === 'in_list') {
            failed = failures.some((f: any) => f.column === u.column && f.operator === 'in_list');
          }

          fileDetails.push({
            name: u.validation_type,
            column: u.column,
            desc,
            status: failed ? 'Failed' : 'Passed'
          });
        });
        fileDetails.sort((a, b) => (a.status === 'Failed' && b.status !== 'Failed' ? -1 : b.status === 'Failed' && a.status !== 'Failed' ? 1 : 0));
      details[fileName] = fileDetails;

        const isSuccess = fileDetails.every(d => d.status === 'Passed');
        results[fileName] = isSuccess ? 'File Validation Success' : 'File Validation Failure';
      });

      setValidationResults(results);
      setValidationDetails(details);
      logSessionState(user?.id);
    } else {
      const err = await res.text();
      console.error('Validation failed', res.status, err);
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
        const fileChanges = {
          file_path: file.path,
          dtype_changes: currentChanges.dtypeChanges[file.name] || {},
          missing_value_strategies: currentChanges.missingValueStrategies[file.name] || {},
        };
        
        console.log(`📤 Sending transformations for ${file.name}:`, {
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
    
    try {
      let query = '';
      const envStr = localStorage.getItem('env');
      if (envStr) {
        try {
          const env = JSON.parse(envStr);
          if (env.CLIENT_NAME && env.APP_NAME && env.PROJECT_NAME) {
            query =
              '?' +
              new URLSearchParams({
                client_name: env.CLIENT_NAME,
                app_name: env.APP_NAME,
                project_name: env.PROJECT_NAME
              }).toString();
          }
        } catch {
          /* ignore */
        }
      }
      if (query) {
        const check = await fetch(`${VALIDATE_API}/list_saved_dataframes${query}`);
        if (check.ok) {
          const data = await check.json();
          const existing = new Set(
            Array.isArray(data.files)
              ? data.files.map((f: any) => (f.csv_name || '').toLowerCase())
              : []
          );
          const duplicates = uploadedFiles.filter(f =>
            existing.has(f.name.replace(/\.[^/.]+$/, '').toLowerCase())
          );
          if (duplicates.length > 0) {
            toast({
              title: 'Same file already present in the project',
              variant: 'destructive',
            });
            return;
          }
        }
      }
    } catch {
      /* ignore */
    }
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
    const paths = uploadedFiles.map(f => f.path);
    form.append('file_paths', JSON.stringify(paths));
    const keys = uploadedFiles.map(f => {
      const assigned = fileAssignments[f.name] || '';
      return settings.fileKeyMap?.[assigned] || assigned;
    });
    form.append('file_keys', JSON.stringify(keys));
    form.append('overwrite', 'false');
    console.log('Saving dataframes', {
      validator_atom_id: vidSave,
      file_paths: paths,
      file_keys: keys,
      overwrite: false,
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
      if (fileResults.length === 0) {
        toast({ title: 'Dataframes Saved Successfully' });
      }
      fileResults.forEach((r: any, idx: number) => {
        const name = uploadedFiles[idx]?.name || r.file_key;
        if (!name) {
          return;
        }
        const obj = r.minio_upload?.object_name;
        if (obj) {
          const env = data.environment || {};
          const loc = `/${env.CLIENT_NAME}/${env.APP_NAME}/${env.PROJECT_NAME}`;
          console.log(`File ${name} saved as ${obj} in ${loc}`);
        }

        let statusMessage = 'Saved successfully';
        let variant: 'destructive' | undefined;
        if (r.error) {
          statusMessage = `Not saved: ${r.error}`;
          variant = 'destructive';
        } else if (r.already_saved) {
          statusMessage = 'File already saved';
          variant = 'destructive';
        }

        newStatus[name] = statusMessage;

        toast({
          title: name,
          description: statusMessage,
          variant,
        });
      });
      setSaveStatus(prev => ({ ...prev, ...newStatus }));
      // Save MinIO object names for later use (e.g., column classifier)
      const savedPaths: Record<string, string> = {};
      fileResults.forEach((result: any, idx: number) => {
        const fileName = uploadedFiles[idx]?.name || result.file_key;
        if (result.minio_upload?.object_name && fileName) {
          // Use the user's original filename as key, not the arrow filename
          savedPaths[fileName] = result.minio_upload.object_name;
          console.log(`📦 Mapped ${fileName} → ${result.minio_upload.object_name}`);
        }
      });
      updateSettings(atomId, {
        uploadedFiles: uploadedFiles.map(f => f.name),
        filePathMap: { ...(settings.filePathMap || {}), ...savedPaths },
        fileSizeMap: {
          ...(settings.fileSizeMap || {}),
          ...Object.fromEntries(uploadedFiles.map(f => [f.name, f.size])),
        },
        fileMappings: fileAssignments,
      });
      addNavigationItem(user?.id, {
        atom: 'data-upload-validate',
        files: uploadedFiles.map(f => f.name),
        settings
      });
      logSessionState(user?.id);
      setAllFilesSaved(true); // Disable save button after successful save
      
      // Auto-trigger column classification if toggle is enabled - classify ALL files
      if (settings.enableColumnClassifier && fileResults.length > 0) {
        console.log(`🔍 Auto-classifying all saved files after save`);
        handleAutoClassifyAllFiles();
      }
    } else {
      const err = await res.text();
      console.error('Save dataframes failed', res.status, err);
      toast({ title: 'Unable to Save Dataframes', variant: 'destructive' });
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
                saveEnabled={allValid && !allFilesSaved}
                disableValidation={!settings.bypassMasterUpload}
                isDragOver={isDragOver}
                requiredOptions={settings.requiredFiles || []}
                onDeleteFile={handleDeleteFile}
                saveStatus={saveStatus}
                disabled={false}
                useMasterFile={settings.bypassMasterUpload}
                onDataChanges={handleDataChanges}
                filesWithAppliedChanges={filesWithAppliedChanges}
                initialDtypeChanges={settings.dtypeChanges || {}}
                initialMissingValueStrategies={settings.missingValueStrategies || {}}
                initialFilesMetadata={settings.filesMetadata || {}}
                onMetadataChange={handleMetadataChange}
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
    </div>
  );
};

export default DataUploadValidateAtom;
