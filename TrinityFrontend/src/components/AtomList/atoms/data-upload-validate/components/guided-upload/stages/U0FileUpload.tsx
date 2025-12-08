import React, { useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { Upload, FileText } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { useToast } from '@/hooks/use-toast';
import { VALIDATE_API } from '@/lib/api';
import { waitForTaskResult } from '@/lib/taskQueue';
import { StageLayout } from '../components/StageLayout';
import type { ReturnTypeFromUseGuidedUploadFlow } from '../useGuidedUploadFlow';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Label } from '@/components/ui/label';
import { getActiveProjectContext } from '@/utils/projectEnv';
import { useToast } from '@/hooks/use-toast';

interface U0FileUploadProps {
  flow: ReturnTypeFromUseGuidedUploadFlow;
  onNext: () => void;
  onBack: () => void;
}

export const U0FileUpload: React.FC<U0FileUploadProps> = ({ flow, onNext }) => {
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [isDragging, setIsDragging] = useState(false);
  const [isUploading, setIsUploading] = useState(false);
  const [pendingFile, setPendingFile] = useState<File | null>(null);
  const [pendingFilesQueue, setPendingFilesQueue] = useState<File[]>([]);
  const [isUploadModalOpen, setIsUploadModalOpen] = useState(false);
  const [sheetOptions, setSheetOptions] = useState<string[]>([]);
  const [selectedSheet, setSelectedSheet] = useState('');
  const [uploadError, setUploadError] = useState('');
  const [hasMultipleSheets, setHasMultipleSheets] = useState(false);
  const [tempUploadMeta, setTempUploadMeta] = useState<{ file_path: string; file_name: string; workbook_path?: string | null } | null>(null);
  const { toast } = useToast();
  const { addUploadedFiles } = flow;
  
  // Track saved files to ensure they're saved even if user cancels
  const [savedFiles, setSavedFiles] = useState<Array<{ name: string; path: string; size: number }>>([]);

  // Reuse the same helper functions from SavedDataFramesPanel
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
      } catch {
        /* ignore */
      }
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
    setSelectedSheet('');
    setIsUploading(false);
    setUploadError('');
    setHasMultipleSheets(false);
    setTempUploadMeta(null);
    setIsUploadModalOpen(false);
  };

  const finalizeSave = async (meta: { file_path: string; file_name: string }) => {
    setIsUploading(true);
    try {
      const form = new FormData();
      form.append('validator_atom_id', 'panel-upload');
      form.append('file_paths', JSON.stringify([meta.file_path]));
      const fileKey = deriveFileKey(meta.file_name);
      form.append('file_keys', JSON.stringify([fileKey]));
      form.append('overwrite', 'false');
      const workbookPathsPayload =
        tempUploadMeta?.workbook_path ? [tempUploadMeta.workbook_path] : [];
      const sheetMetadataPayload =
        tempUploadMeta?.workbook_path
          ? [
              {
                sheet_names: sheetOptions.length ? sheetOptions : [selectedSheet || ''],
                selected_sheet: selectedSheet || sheetOptions[0] || '',
                original_filename: pendingFile?.name || tempUploadMeta.file_name || '',
              },
            ]
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
      const data = await res.json();
      
      // Construct the actual object_name using prefix + fileKey + .arrow extension (same as SavedDataFramesPanel)
      // First, get the prefix from the API
      const projectContext = getActiveProjectContext();
      let prefix = '';
      
      if (projectContext) {
        try {
          const queryParams = new URLSearchParams({
            client_name: projectContext.client_name || '',
            app_name: projectContext.app_name || '',
            project_name: projectContext.project_name || '',
          }).toString();
          
          const prefixRes = await fetch(
            `${VALIDATE_API}/get_object_prefix?${queryParams}`,
            { credentials: 'include' }
          );
          
          if (prefixRes.ok) {
            const prefixData = await prefixRes.json();
            prefix = prefixData.prefix || '';
          }
        } catch (err) {
          console.warn('Failed to get prefix', err);
        }
      }
      
      // Construct object_name: prefix + fileKey + .arrow
      const expectedObjectName = prefix ? `${prefix}${fileKey}.arrow` : `${fileKey}.arrow`;
      
      // Show success toast
      toast({ 
        title: 'File uploaded successfully', 
        description: `${meta.file_name} has been saved. You can continue with priming steps or cancel - the file is already saved.`,
      });
      
      // Trigger a refresh of SavedDataFramesPanel by dispatching a custom event
      // This ensures the file appears immediately in the panel, even if user cancels
      window.dispatchEvent(new CustomEvent('dataframe-saved', { 
        detail: { filePath: expectedObjectName, fileName: meta.file_name } 
      }));
      
      // Track this saved file
      const savedFileInfo = {
        name: meta.file_name,
        path: expectedObjectName,
        size: pendingFile?.size || 0,
      };
      setSavedFiles(prev => [...prev, savedFileInfo]);
      
      // Add to guided flow state
      const uploadedFileInfo = {
        name: meta.file_name,
        path: expectedObjectName,
        size: pendingFile?.size || 0,
        fileKey: fileKey,
        sheetNames: sheetOptions.length > 0 ? sheetOptions : (selectedSheet ? [selectedSheet] : undefined),
        selectedSheet: selectedSheet || sheetOptions[0],
        totalSheets: sheetOptions.length,
      };
      
      addUploadedFiles([uploadedFileInfo]);
      setIsUploading(false);
      resetUploadState();
      
      // Process next file in queue if any
      if (pendingFilesQueue.length > 0) {
        const nextFile = pendingFilesQueue[0];
        setPendingFilesQueue(prev => prev.slice(1));
        setTimeout(() => {
          setPendingFile(nextFile);
          setUploadError('');
          setSheetOptions([]);
          setSelectedSheet('');
          setHasMultipleSheets(false);
          setTempUploadMeta(null);
          setIsUploadModalOpen(true);
          void uploadSelectedFile(nextFile);
        }, 100);
      } else {
        // All files processed, proceed to next stage
        // Note: Files are already saved, so even if user cancels later, files will be in SavedDataFramesPanel
        onNext();
      }
    } catch (err: any) {
      setUploadError(err.message || 'Failed to save dataframe');
      setIsUploading(false);
    }
  };

  const uploadSelectedFile = async (file: File, sheet?: string) => {
    setIsUploading(true);
    setUploadError('');
    try {
      // Replace spaces with underscores in filename
      const sanitizedFileName = file.name.replace(/\s+/g, '_');
      const sanitizedFile = sanitizedFileName !== file.name 
        ? new File([file], sanitizedFileName, { type: file.type, lastModified: file.lastModified })
        : file;
      
      const form = new FormData();
      form.append('file', sanitizedFile);
      if (sheet) {
        form.append('sheet_name', sheet);
      }
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
      setTempUploadMeta({
        file_path: data.file_path,
        file_name: data.file_name || sanitizedFileName,
        workbook_path: data.workbook_path || null,
      });
      const sheetNames = Array.isArray(data.sheet_names) ? data.sheet_names : [];
      const multi = Boolean(data.has_multiple_sheets && sheetNames.length > 1);
      setSheetOptions(sheetNames.length ? sheetNames : data.selected_sheet ? [data.selected_sheet] : []);
      setSelectedSheet(data.selected_sheet || sheetNames[0] || '');
      setHasMultipleSheets(multi);

      if (multi && !sheet) {
        setIsUploading(false);
        setIsUploadModalOpen(true);
        return;
      }
      await finalizeSave({ file_path: data.file_path, file_name: data.file_name || sanitizedFileName });
    } catch (err: any) {
      setUploadError(err.message || 'Upload failed');
      setIsUploading(false);
    }
  };

  const handleSheetConfirm = () => {
    if (!pendingFile || !selectedSheet) return;
    uploadSelectedFile(pendingFile, selectedSheet);
  };

  const handleFileSelect = async (files: FileList | null) => {
    if (!files || files.length === 0) return;

    const validFiles = Array.from(files).filter(file => {
      const ext = file.name.split('.').pop()?.toLowerCase();
      return ['csv', 'xlsx', 'xls', 'tsv'].includes(ext || '');
    });

    if (validFiles.length === 0) {
      toast({
        title: 'Invalid file type',
        description: 'Please upload CSV, XLSX, XLS, or TSV files only.',
        variant: 'destructive',
      });
      return;
    }

    const fileArray = Array.from(validFiles) as File[];
    const firstFile = fileArray[0];
    const remainingFiles = fileArray.slice(1);
    
    // Store remaining files in queue
    if (remainingFiles.length > 0) {
      setPendingFilesQueue(remainingFiles);
    }
    
    setPendingFile(firstFile);
    setUploadError('');
    setSheetOptions([]);
    setSelectedSheet('');
    setHasMultipleSheets(false);
    setTempUploadMeta(null);
    setIsUploadModalOpen(true);
    void uploadSelectedFile(firstFile);
  };

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(true);
  };

  const handleDragLeave = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);
    handleFileSelect(e.dataTransfer.files);
  };

  const handleFileInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    handleFileSelect(e.target.files);
  };

  return (
    <StageLayout
      title="Upload Your Dataset"
      explanation="What Trinity needs: Select your dataset file to begin the priming process."
      helpText="Supported formats: CSV, XLSX, TSV. You can upload multiple files at once."
    >

      {/* Single Key Action: Select File */}
      <div
        className={`border-2 border-dashed rounded-lg p-12 text-center transition-all duration-300 ${
          isDragging
            ? 'border-[#458EE2] bg-blue-50'
            : 'border-gray-300 hover:border-[#458EE2] hover:bg-gray-50'
        } ${isUploading ? 'opacity-50 pointer-events-none' : 'cursor-pointer'}`}
        onDragOver={handleDragOver}
        onDragLeave={handleDragLeave}
        onDrop={handleDrop}
        onClick={() => fileInputRef.current?.click()}
      >
        <div className="flex flex-col items-center gap-4">
          <div className="w-16 h-16 rounded-full bg-gradient-to-br from-[#458EE2] to-[#3a7bc7] flex items-center justify-center shadow-lg">
            <Upload className="w-8 h-8 text-white" />
          </div>
          {isUploading ? (
            <div className="space-y-2">
              <p className="text-gray-700 font-medium">Uploading files...</p>
              <div className="w-48 h-1 bg-gray-200 rounded-full overflow-hidden">
                <div className="h-full bg-[#458EE2] animate-pulse" style={{ width: '60%' }} />
              </div>
            </div>
          ) : (
            <>
              <div>
                <p className="text-gray-700 font-medium mb-1">Click to select files</p>
                <p className="text-sm text-gray-500">or drag and drop files here</p>
              </div>
              <Button
                variant="outline"
                className="mt-2"
                onClick={(e) => {
                  e.stopPropagation();
                  fileInputRef.current?.click();
                }}
              >
                <FileText className="w-4 h-4 mr-2" />
                Select File
              </Button>
            </>
          )}
        </div>
      </div>

      <input
        ref={fileInputRef}
        type="file"
        multiple
        accept=".csv,.xlsx,.xls,.tsv"
        onChange={(e) => {
          handleFileSelect(e.target.files);
          e.target.value = ''; // Reset input
        }}
        className="hidden"
      />

      {uploadError && (
        <div className="mt-4 p-3 bg-red-50 border border-red-200 rounded-lg">
          <p className="text-sm text-red-600">{uploadError}</p>
        </div>
      )}

      <div className="text-center">
        <button
          type="button"
          className="text-sm text-gray-500 hover:text-[#458EE2] hover:underline"
          onClick={(e) => {
            e.preventDefault();
            // TODO: Implement sample dataset loading
            toast({
              title: 'Coming soon',
              description: 'Sample dataset feature will be available soon.',
            });
          }}
        >
          Optional: Use Sample Dataset
        </button>
      </div>

      {/* Sheet Selection Modal - Same as SavedDataFramesPanel */}
      {isUploadModalOpen && createPortal(
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40">
          <div className="bg-white rounded-lg shadow-xl w-96 max-w-[90vw] p-4">
            <h4 className="text-lg font-semibold text-gray-900 mb-2">Upload DataFrame</h4>
            <p className="text-sm text-gray-600 truncate">{pendingFile?.name || 'No file selected'}</p>
            {uploadError && <p className="text-xs text-red-500 mt-2">{uploadError}</p>}
            {hasMultipleSheets ? (
              <div className="mt-4">
                <Label className="text-xs text-gray-600 mb-1 block">Select worksheet</Label>
                <Select value={selectedSheet} onValueChange={setSelectedSheet}>
                  <SelectTrigger className="w-full">
                    <SelectValue placeholder="Select sheet" />
                  </SelectTrigger>
                  <SelectContent>
                    {sheetOptions.map(sheet => (
                      <SelectItem key={sheet} value={sheet}>
                        {sheet}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            ) : (
              <div className="mt-4 text-sm text-gray-600">
                {isUploading ? 'Processing file…' : 'Preparing upload…'}
              </div>
            )}
            <div className="flex justify-end gap-2 mt-6">
              <Button
                variant="outline"
                size="sm"
                onClick={resetUploadState}
                disabled={isUploading}
              >
                Cancel
              </Button>
              {hasMultipleSheets && (
                <Button
                  size="sm"
                  onClick={handleSheetConfirm}
                  disabled={isUploading || !selectedSheet}
                >
                  Upload Sheet
                </Button>
              )}
            </div>
          </div>
        </div>,
        document.body
      )}
    </StageLayout>
  );
};

