import React, { useState, useEffect } from 'react';
import { Database, FileText, Info, Check, AlertCircle, Upload, Settings, BarChart3, Eye, ChevronDown, Plus, Pencil } from 'lucide-react';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Input } from '@/components/ui/input';
import { Checkbox } from '@/components/ui/checkbox';
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible';
import { useLaboratoryStore, DEFAULT_DATAUPLOAD_SETTINGS, DataUploadSettings } from '@/components/LaboratoryMode/store/laboratoryStore';
import { VALIDATE_API } from '@/lib/api';

interface Props {
  atomId: string;
}

const DataUploadValidateAtom: React.FC<Props> = ({ atomId }) => {
  const atom = useLaboratoryStore((state) => state.getAtom(atomId));
  const updateSettings = useLaboratoryStore((state) => state.updateAtomSettings);
  const settings: DataUploadSettings = atom?.settings || { ...DEFAULT_DATAUPLOAD_SETTINGS };

  const [uploadedFiles, setUploadedFiles] = useState<File[]>([]);
  const [isDragOver, setIsDragOver] = useState(false);
  const [openSections, setOpenSections] = useState<string[]>(['setting1', 'fileValidation']);
  const [openFile, setOpenFile] = useState<string | null>(null);
  const [renameTarget, setRenameTarget] = useState<string | null>(null);
  const [renameValue, setRenameValue] = useState('');
  const [fileAssignments, setFileAssignments] = useState<Record<string, string>>(settings.fileMappings || {});
  const [validationResults, setValidationResults] = useState<Record<string, string>>({});
  const [validationDetails, setValidationDetails] = useState<Record<string, any[]>>({});
  const [openValidatedFile, setOpenValidatedFile] = useState<string | null>(null);

  useEffect(() => {
    setFileAssignments(settings.fileMappings || {});
  }, [settings.fileMappings]);

  const handleFileUpload = (files: File[]) => {
    setUploadedFiles((prev) => [...prev, ...files]);
    updateSettings(atomId, {
      uploadedFiles: [...(settings.uploadedFiles || []), ...files.map((f) => f.name)],
      fileMappings: { ...fileAssignments, ...Object.fromEntries(files.map(f => [f.name, settings.requiredFiles?.[0] || ''])) }
    });
    setFileAssignments(prev => ({ ...prev, ...Object.fromEntries(files.map(f => [f.name, settings.requiredFiles?.[0] || ''])) }));
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragOver(false);
    const files = Array.from(e.dataTransfer.files);
    handleFileUpload(files);
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
      handleFileUpload(files);
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
    const newRequired = (settings.requiredFiles || []).map(n => (n === oldName ? newName : n));
    const newValidations: Record<string, any> = {};
    Object.entries(settings.validations || {}).forEach(([k, v]) => {
      newValidations[k === oldName ? newName : k] = v;
    });
    const newColumnConfig: Record<string, Record<string, string>> = {};
    Object.entries(settings.columnConfig || {}).forEach(([k, v]) => {
      newColumnConfig[k === oldName ? newName : k] = v as Record<string, string>;
    });
    updateSettings(atomId, {
      requiredFiles: newRequired,
      validations: newValidations,
      columnConfig: newColumnConfig
    });
    if (openFile === oldName) setOpenFile(newName);
    setRenameTarget(null);
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
    validations: settings.validations?.[name] || { ranges: [], periodicities: [] }
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
    uploadedFiles.forEach(f => form.append('files', f));
    const keys = uploadedFiles.map(f => fileAssignments[f.name] || '');
    form.append('file_keys', JSON.stringify(keys));
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

          let failed = false;
          if (u.validation_type === 'datatype') {
            failed = errors.some((e: string) => e.includes(`Column '${u.column}'`));
          } else if (u.validation_type === 'periodicity') {
            failed = failures.some((f: any) => f.column === u.column && f.operator === 'date_frequency');
          } else if (u.validation_type === 'range') {
            failed = failures.some((f: any) => f.column === u.column && f.operator !== 'date_frequency');
          }

          fileDetails.push({
            name: u.validation_type,
            column: u.column,
            desc,
          status: failed ? 'Failed' : 'Passed',
        });
      });
      fileDetails.sort((a, b) => (a.status === 'Failed' && b.status !== 'Failed' ? -1 : b.status === 'Failed' && a.status !== 'Failed' ? 1 : 0));
      details[fileName] = fileDetails;

        const isSuccess = fileDetails.every(d => d.status === 'Passed');
        results[fileName] = isSuccess ? 'File Validation Success' : 'File Validation Failure';
      });

      setValidationResults(results);
      setValidationDetails(details);
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

  return (
    <div className="w-full h-full bg-gradient-to-br from-gray-50 via-white to-gray-50 rounded-xl border border-gray-200 shadow-lg overflow-hidden flex">
      <div className="flex-1 flex flex-col">
        <div className="bg-gradient-to-r from-blue-500 to-blue-600 text-white p-4 flex-shrink-0">
          <div className="flex items-center space-x-3">
            <div className="w-10 h-10 bg-white/20 rounded-lg flex items-center justify-center backdrop-blur-sm">
              <Database className="w-5 h-5" />
            </div>
            <div>
              <h2 className="text-lg font-semibold">Data Upload & Validate</h2>
              <p className="text-blue-100 text-sm">Upload and validate data with automatic type detection</p>
            </div>
          </div>
        </div>

        <div className="flex-1 p-6 bg-gray-50 overflow-y-auto scrollbar-thin scrollbar-thumb-gray-300">
          <div className="flex h-full space-x-6">
            <div className="flex-1">
              <Card className="h-full flex flex-col shadow-sm border-0 bg-white">
                <div className="p-4 border-b border-gray-100">
                  <h3 className="text-lg font-semibold text-gray-900 mb-1">Uploaded Files</h3>
                  <p className="text-sm text-gray-600">Manage your uploaded data files</p>
                </div>

                <div className="flex-1 p-4 space-y-3 overflow-y-auto">
                  {uploadedFilesList.map((file, index) => (
                    <div key={index}>
                      <div className="flex items-center justify-between p-3 border border-gray-200 rounded-lg bg-white hover:bg-gray-50 transition-colors">
                        <div className="flex items-center space-x-3">
                          <FileText className="w-5 h-5 text-blue-500" />
                          <div>
                            <p className="text-sm font-medium text-gray-900">{file.name}</p>
                            <p className="text-xs text-gray-600">{file.type} • {file.size}</p>
                            {validationResults[file.name] && (
                              <p
                                onClick={() =>
                                  setOpenValidatedFile(openValidatedFile === file.name ? null : file.name)
                                }
                                className={`text-xs mt-1 cursor-pointer ${
                                  validationResults[file.name].includes('Success') ? 'text-green-600' : 'text-red-600'
                                }`}
                              >
                                {validationResults[file.name]}
                              </p>
                            )}
                          </div>
                        </div>
                        <div className="flex items-center space-x-3">
                          <Select value={fileAssignments[file.name] || ''} onValueChange={val => handleAssignmentChange(file.name, val)}>
                            <SelectTrigger className="w-32 h-8 text-xs">
                              <SelectValue placeholder="Select" />
                            </SelectTrigger>
                            <SelectContent>
                              {(settings.requiredFiles || []).map(req => (
                                <SelectItem key={req} value={req}>{req}</SelectItem>
                              ))}
                            </SelectContent>
                          </Select>
                        </div>
                      </div>
                      {openValidatedFile === file.name && validationDetails[file.name] && (
                        <div className="mt-2 border-t border-gray-200 pt-2 w-full overflow-x-auto">
                          <div className="flex space-x-2 w-max">
                            {validationDetails[file.name].map((v, i) => (
                              <div
                                key={i}
                                className="border border-gray-200 rounded p-2 min-w-[150px] flex-shrink-0"
                              >
                                <p className="text-xs font-semibold mb-1">{v.name}</p>
                                <p className="text-xs mb-1">
                                  {v.column} - {v.desc}
                                </p>
                                <p className={`text-xs ${v.status === 'Passed' ? 'text-green-600' : 'text-red-600'}`}>{v.status}</p>
                              </div>
                            ))}
                          </div>
                        </div>
                      )}
                    </div>
                  ))}

                  <div
                    className={`border-2 border-dashed rounded-lg p-8 text-center transition-all duration-300 ${isDragOver ? 'border-blue-400 bg-blue-50' : 'border-gray-300 hover:border-blue-300'}`}
                    onDrop={handleDrop}
                    onDragOver={handleDragOver}
                    onDragLeave={handleDragLeave}
                  >
                    <div className="mb-4">
                      <Upload className={`w-8 h-8 mx-auto mb-2 ${isDragOver ? 'text-blue-600' : 'text-gray-400'}`} />
                      <p className="text-sm font-medium text-gray-900 mb-1">{isDragOver ? 'Drop files here' : 'Drag and Drop your File'}</p>
                      <p className="text-xs text-gray-600 mb-4">OR</p>
                    </div>

                    <input type="file" multiple accept=".csv,.xlsx,.xls,.json" onChange={handleFileSelect} className="hidden" id="file-upload" />
                  <label htmlFor="file-upload">
                    <Button asChild className="cursor-pointer">
                      <span>Browse</span>
                    </Button>
                  </label>
                </div>
                {uploadedFiles.length > 0 && (
                  <Button className="w-full mt-4" onClick={handleValidateFiles}>
                    Validate Files
                  </Button>
                )}
              </div>
            </Card>
          </div>

            <div className="w-80">
              <Card className="h-full shadow-sm border-0 bg-white">
                <div className="p-4 border-b border-gray-100">
                  <h4 className="font-semibold text-gray-900 flex items-center space-x-2">
                    <FileText className="w-4 h-4 text-blue-500" />
                    <span>Required Files</span>
                  </h4>
                  <p className="text-xs text-gray-600 mt-1">Upload these files for complete data validation</p>
                </div>

                <div className="p-4 space-y-3 overflow-y-auto h-[calc(100%-80px)]">
                  {requiredFiles.map((file, index) => {
                    const types = (settings.columnConfig || {})[file.name] || {};
                    return (
                      <div key={index} className="border border-gray-200 rounded-lg">
                        <div className="flex items-center justify-between p-3 hover:border-gray-300 hover:bg-gray-50">
                          <div className="flex items-center space-x-3">
                            <div className="flex-shrink-0">{getStatusIcon(file.status, file.required)}</div>
                            <div className="flex-1 min-w-0">
                              {renameTarget === file.name ? (
                                <Input
                                  value={renameValue}
                                  onChange={e => setRenameValue(e.target.value)}
                                  onBlur={() => commitRename(file.name)}
                                  className="h-6 text-xs"
                                />
                              ) : (
                                <p className="text-sm font-medium text-gray-900">{file.name}</p>
                              )}
                              {file.required && (
                                <Badge variant="outline" className="text-xs bg-orange-50 text-orange-700 border-orange-200 mt-1">
                                  Required
                                </Badge>
                              )}
                            </div>
                          </div>
                          <div className="flex items-center space-x-2">
                            <Pencil className="w-4 h-4 text-gray-400 cursor-pointer" onClick={() => startRename(file.name)} />
                            <Info className="w-4 h-4 text-gray-400 cursor-pointer" onClick={() => setOpenFile(openFile === file.name ? null : file.name)} />
                          </div>
                        </div>
                        {openFile === file.name && (
                          <div className="p-3 border-t border-gray-200 overflow-x-auto">
                            <div className="flex space-x-2">
                              {Object.entries(types).map(([col, dt]) => (
                                <Badge key={col} variant="outline" className="text-xs">
                                  {col}: {dt}
                                </Badge>
                              ))}
                              {file.validations.ranges.map((r: any, i: number) => (
                                <Badge key={`r-${i}`} variant="outline" className="text-xs">
                                  {r.column}: {r.min}-{r.max}
                                </Badge>
                              ))}
                              {file.validations.periodicities.map((p: any, i: number) => (
                                <Badge key={`p-${i}`} variant="outline" className="text-xs">
                                  {p.column}: {p.periodicity}
                                </Badge>
                              ))}
                            </div>
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
              </Card>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

export default DataUploadValidateAtom;
