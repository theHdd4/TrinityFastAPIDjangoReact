import React, { useState, useEffect } from 'react';
import { Info, Check, AlertCircle, Upload, Settings, BarChart3, Eye, ChevronDown, Plus, Pencil } from 'lucide-react';
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
} from '@/components/LaboratoryMode/store/laboratoryStore';
import { VALIDATE_API } from '@/lib/api';
import { useToast } from '@/hooks/use-toast';
import { useAuth } from '@/contexts/AuthContext';
import { logSessionState, updateSessionState, addNavigationItem } from '@/lib/session';
import UploadSection from './components/upload/UploadSection';
import RequiredFilesSection from './components/required-files/RequiredFilesSection';

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
  const settings: DataUploadSettings =
    atom?.settings || createDefaultDataUploadSettings();

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

  useEffect(() => {
    setFileAssignments(settings.fileMappings || {});
  }, [settings.fileMappings]);

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
      updateSettings(atomId, {
        uploadedFiles: [],
        fileMappings: {},
        filePathMap: {},
        fileSizeMap: {},
        fileKeyMap: {},
      });
      updateSessionState(user?.id, { envvars: null });
    };
  }, [atomId, updateSettings, user?.id]);

  const handleFileUpload = async (files: File[]) => {
    const uploaded: UploadedFileRef[] = [];
    for (const file of files) {
      const form = new FormData();
      form.append('file', file);
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
      try {
        const res = await fetch(`${VALIDATE_API}/upload-file`, {
          method: 'POST',
          body: form,
          credentials: 'include',
        });
        if (res.ok) {
          const data = await res.json();
          uploaded.push({ name: file.name, path: data.file_path, size: file.size });
          toast({ title: `${file.name} uploaded successfully` });
        } else {
          toast({ title: `Failed to upload ${file.name}`, variant: 'destructive' });
        }
      } catch {
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
          uploaded.map(f => [
            f.name,
            settings.bypassMasterUpload ? f.name : settings.requiredFiles?.[0] || ''
          ])
        )
      },
      filePathMap: {
        ...(settings.filePathMap || {}),
        ...Object.fromEntries(uploaded.map(f => [f.name, f.path]))
      },
      fileSizeMap: {
        ...(settings.fileSizeMap || {}),
        ...Object.fromEntries(uploaded.map(f => [f.name, f.size]))
      }
    });
    setFileAssignments(prev => ({
      ...prev,
      ...Object.fromEntries(
        uploaded.map(f => [
          f.name,
          settings.bypassMasterUpload ? f.name : settings.requiredFiles?.[0] || ''
        ])
      )
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
    setFileAssignments(restAssignments);
    updateSettings(atomId, {
      uploadedFiles: newUploads,
      fileMappings: restAssignments,
      filePathMap: restPaths,
      fileSizeMap: restSizes,
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
              if (status && seen[name] !== status) {
                seen[name] = status;
                if (status !== 'saved') {
                  toast({ title: `${name}: ${status}` });
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

  const handleSaveDataFrames = async () => {
    if (!settings.validatorId && !settings.bypassMasterUpload) return;
    console.log('🔧 Running save dataframes util');
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
              title: `File with the name ${duplicates[0].name} already exists`,
              variant: 'destructive'
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
      const duplicates: string[] = [];
      data.minio_uploads.forEach((r: any, idx: number) => {
        const name = uploadedFiles[idx]?.name || r.file_key;
        const obj = r.minio_upload?.object_name;
        if (obj) {
          const env = data.environment || {};
          const loc = `/${env.CLIENT_NAME}/${env.APP_NAME}/${env.PROJECT_NAME}`;
          console.log(`File ${name} saved as ${obj} in ${loc}`);
        }
        if (r.already_saved && name) {
          newStatus[name] = 'File is already saved';
          duplicates.push(name);
        }
      });
      setSaveStatus(prev => ({ ...prev, ...newStatus }));
      // Clear temp paths so saved files persist in project state
      const cleared: Record<string, string> = {};
      uploadedFiles.forEach(f => {
        cleared[f.name] = '';
      });
      updateSettings(atomId, {
        uploadedFiles: uploadedFiles.map(f => f.name),
        filePathMap: { ...(settings.filePathMap || {}), ...cleared },
        fileSizeMap: {
          ...(settings.fileSizeMap || {}),
          ...Object.fromEntries(uploadedFiles.map(f => [f.name, f.size])),
        },
        fileMappings: fileAssignments,
      });
      if (duplicates.length > 0) {
        toast({
          title: `File with the name ${duplicates[0]} already exists`,
          variant: 'destructive'
        });
      } else {
        toast({ title: 'Dataframes Saved Successfully' });
      }
      addNavigationItem(user?.id, {
        atom: 'data-upload-validate',
        files: uploadedFiles.map(f => f.name),
        settings
      });
      logSessionState(user?.id);
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

  const allValid = settings.bypassMasterUpload || (
    Object.values(validationResults).length > 0 &&
    Object.values(validationResults).every(v => v.includes('Success'))
  );

  return (
    <div className="w-full h-full bg-gradient-to-br from-slate-50 to-blue-50 rounded-xl border border-gray-200 shadow-xl overflow-hidden flex">
      <div className="flex-1 flex flex-col">
        <div className="flex-1 p-6 bg-gray-50 overflow-y-auto scrollbar-thin scrollbar-thumb-gray-300">
          <div className="flex h-full space-x-6 overflow-hidden">
            <div className="flex-1 min-w-0">
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
                saveEnabled={allValid}
                disableValidation={settings.bypassMasterUpload}
                isDragOver={isDragOver}
                requiredOptions={settings.requiredFiles || []}
                onDeleteFile={handleDeleteFile}
                saveStatus={saveStatus}
                disabled={!settings.bypassMasterUpload && (settings.requiredFiles || []).length === 0}
              />
            </div>

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
                bypassMasterUpload={settings.bypassMasterUpload}
              />
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

export default DataUploadValidateAtom;
