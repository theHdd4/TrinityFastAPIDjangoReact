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
import { Checkbox } from '@/components/ui/checkbox';

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
  const [selectedSheets, setSelectedSheets] = useState<string[]>([]); // Changed to array for multi-select
  const [uploadError, setUploadError] = useState('');
  const [hasMultipleSheets, setHasMultipleSheets] = useState(false);
  const [tempUploadMeta, setTempUploadMeta] = useState<{ 
    file_path: string; 
    file_name: string; 
    workbook_path?: string | null;
    upload_session_id?: string;
  } | null>(null);
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
    setSelectedSheets([]);
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
                sheet_names: sheetOptions.length ? sheetOptions : selectedSheets.length > 0 ? selectedSheets : [],
                selected_sheet: selectedSheets.length > 0 ? selectedSheets[0] : sheetOptions[0] || '',
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
        sheetNames: sheetOptions.length > 0 ? sheetOptions : (selectedSheets.length > 0 ? selectedSheets : undefined),
        selectedSheet: selectedSheets.length > 0 ? selectedSheets[0] : sheetOptions[0],
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
          setSelectedSheets([]);
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

  const uploadSelectedFile = async (file: File, sheets?: string[]) => {
    setIsUploading(true);
    setUploadError('');
    try {
      // Replace spaces with underscores in filename
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
        const sheetDetails = Array.isArray(data.sheet_details) ? data.sheet_details : [];
        const uploadSessionId = data.upload_session_id || data.session_id;
        const fileName = data.file_name || sanitizedFileName;
        const sheetCount = data.sheet_count || sheetNames.length;
        
        if (sheetNames.length === 0) {
          throw new Error('No sheets found in Excel file');
        }
        
        // Create a map of original sheet names to normalized names
        const sheetNameMap = new Map<string, string>();
        sheetDetails.forEach((detail: any) => {
          if (detail.original_name && detail.normalized_name) {
            sheetNameMap.set(detail.original_name, detail.normalized_name);
          }
        });
        
        // If no details, normalize names ourselves
        if (sheetNameMap.size === 0) {
          sheetNames.forEach((name: string) => {
            const normalized = name.replace(/\s+/g, '_').replace(/[^a-zA-Z0-9_-]/g, '') || 'Sheet';
            sheetNameMap.set(name, normalized);
          });
        }
        
        setTempUploadMeta({
          file_path: data.original_file_path || '',
          file_name: fileName,
          workbook_path: data.original_file_path || null,
          upload_session_id: uploadSessionId,
          sheetNameMap: Object.fromEntries(sheetNameMap), // Store mapping
        });
        
        setSheetOptions(sheetNames);
        setSelectedSheets(sheets || sheetNames); // Default to all sheets
        setHasMultipleSheets(sheetNames.length > 1);
        
        // Auto-save all sheets immediately (like when uploading through icon)
        // This ensures files appear in SavedDataFramesPanel right away
        console.log(`[U0FileUpload] Auto-saving ${sheetNames.length} sheet(s) from ${fileName}`);
        await finalizeSaveMultiSheet(fileName, uploadSessionId, sheets || sheetNames);
        
        // Note: We no longer show the modal and wait - files are saved immediately
        // Users can delete unwanted sheets later from SavedDataFramesPanel if needed
      } else {
        // CSV or other file - use regular upload endpoint (simplified)
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
      setIsUploading(false);
    }
  };

  const finalizeSaveMultiSheet = async (fileName: string, uploadSessionId: string, sheetsToSave: string[]) => {
    console.log(`[U0FileUpload] finalizeSaveMultiSheet called for ${sheetsToSave.length} sheet(s)`);
    setIsUploading(true);
    try {
      const projectContext = getActiveProjectContext();
      // Extract filename without extension
      const excelFolderName = fileName.replace(/\.[^.]+$/, '').replace(/\s+/g, '_').replace(/\./g, '_');
      
      // Determine if we should use folder structure:
      // - Single sheet: Save as regular file (no folder structure)
      // - Multiple sheets: Save in folder structure
      const useFolderStructure = sheetsToSave.length > 1;
      
      // Save each selected sheet
      const savedFiles: Array<{ name: string; path: string; size: number }> = [];
      const uploadedFileInfos: Array<{
        name: string;
        path: string;
        size: number;
        fileKey: string;
        sheetNames?: string[];
        selectedSheet?: string;
        totalSheets?: number;
      }> = [];
      
      for (const sheetName of sheetsToSave) {
        try {
          // Get normalized sheet name from mapping or normalize it
          const normalizedSheetName = tempUploadMeta?.sheetNameMap?.[sheetName] || 
            sheetName.replace(/\s+/g, '_').replace(/[^a-zA-Z0-9_-]/g, '') || 'Sheet';
          
          console.log(`[U0FileUpload] Converting sheet: ${sheetName} -> ${normalizedSheetName} (use_folder_structure: ${useFolderStructure})`);
          
          // Use the convert endpoint to save sheet directly
          const convertForm = new FormData();
          convertForm.append('upload_session_id', uploadSessionId);
          convertForm.append('sheet_name', normalizedSheetName); // Use normalized name
          convertForm.append('original_filename', fileName);
          convertForm.append('use_folder_structure', useFolderStructure ? 'true' : 'false');
          appendEnvFields(convertForm);
          
          const convertRes = await fetch(`${VALIDATE_API}/convert-session-sheet-to-arrow`, {
            method: 'POST',
            body: convertForm,
            credentials: 'include'
          });
          
          if (!convertRes.ok) {
            const errorData = await convertRes.json().catch(() => null);
            const errorText = errorData?.detail || await convertRes.text().catch(() => '');
            console.error(`[U0FileUpload] Failed to convert sheet ${sheetName} (normalized: ${normalizedSheetName}):`, errorText);
            setUploadError(`Failed to save sheet "${sheetName}": ${errorText}`);
            continue;
          }
          
          const convertData = await convertRes.json();
          console.log(`[U0FileUpload] Convert response for ${sheetName}:`, convertData);
          const sheetPath = convertData.file_path || '';
          
          if (!sheetPath) {
            console.error(`[U0FileUpload] No file path returned for sheet ${sheetName}`);
            setUploadError(`No file path returned for sheet "${sheetName}"`);
            continue;
          }
          
          // For single sheet, use original filename; for multiple sheets, use sheet name in display
          const sheetDisplayName = useFolderStructure 
            ? (convertData.file_name || `${fileName} (${sheetName})`)
            : (convertData.file_name || fileName);
          const fileKey = convertData.file_key || (useFolderStructure 
            ? `${excelFolderName}_${normalizedSheetName}`
            : excelFolderName);
          
          console.log(`[U0FileUpload] Successfully saved sheet: ${sheetDisplayName} at ${sheetPath}`);
          
          savedFiles.push({
            name: sheetDisplayName,
            path: sheetPath,
            size: 0,
          });
          
          uploadedFileInfos.push({
            name: sheetDisplayName,
            path: sheetPath,
            size: 0,
            fileKey: fileKey,
            sheetNames: useFolderStructure ? sheetsToSave : undefined,
            selectedSheet: useFolderStructure ? sheetName : undefined,
            totalSheets: useFolderStructure ? sheetsToSave.length : undefined,
          });
          
          // Trigger refresh of SavedDataFramesPanel immediately
          console.log(`[U0FileUpload] Dispatching dataframe-saved event for ${sheetPath}`);
          window.dispatchEvent(new CustomEvent('dataframe-saved', { 
            detail: { filePath: sheetPath, fileName: sheetDisplayName } 
          }));
        } catch (err: any) {
          console.error(`[U0FileUpload] Error saving sheet ${sheetName}:`, err);
          setUploadError(`Error saving sheet "${sheetName}": ${err.message || 'Unknown error'}`);
        }
      }
      
      if (savedFiles.length === 0) {
        throw new Error('Failed to save any sheets');
      }
      
      console.log(`[U0FileUpload] Successfully saved ${savedFiles.length} sheet(s), adding to flow state`);
      
      toast({ 
        title: 'Files uploaded successfully', 
        description: `Saved ${savedFiles.length} sheet${savedFiles.length > 1 ? 's' : ''} from ${fileName}. Files are now visible in Saved DataFrames panel.`,
      });
      
      setSavedFiles(prev => [...prev, ...savedFiles]);
      addUploadedFiles(uploadedFileInfos);
      
      // Force multiple refreshes to ensure SavedDataFramesPanel picks up the files
      // The panel uses polling, so we trigger events at intervals to catch the next poll cycle
      [500, 1000, 2000].forEach((delay) => {
        setTimeout(() => {
          console.log(`[U0FileUpload] Triggering refresh ${delay}ms after save`);
          window.dispatchEvent(new CustomEvent('dataframe-saved', { 
            detail: { filePath: savedFiles[0]?.path || '', fileName: savedFiles[0]?.name || '' } 
          }));
        }, delay);
      });
      
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
          setSelectedSheets([]);
          setHasMultipleSheets(false);
          setTempUploadMeta(null);
          setIsUploadModalOpen(true);
          void uploadSelectedFile(nextFile);
        }, 100);
      } else {
        console.log(`[U0FileUpload] All files processed, proceeding to next stage`);
        onNext();
      }
    } catch (err: any) {
      console.error(`[U0FileUpload] Error in finalizeSaveMultiSheet:`, err);
      setUploadError(err.message || 'Failed to save sheets');
      setIsUploading(false);
    }
  };

  const handleSheetConfirm = async () => {
    if (!pendingFile || selectedSheets.length === 0) {
      console.warn('[U0FileUpload] handleSheetConfirm: No file or no sheets selected');
      return;
    }
    if (!tempUploadMeta?.upload_session_id) {
      console.warn('[U0FileUpload] handleSheetConfirm: No upload_session_id, falling back to single sheet upload');
      // Fallback to single sheet upload
      await uploadSelectedFile(pendingFile, [selectedSheets[0]]);
      return;
    }
    console.log(`[U0FileUpload] handleSheetConfirm: Saving ${selectedSheets.length} sheet(s)`);
    setIsUploadModalOpen(false); // Close modal immediately
    await finalizeSaveMultiSheet(
      tempUploadMeta.file_name,
      tempUploadMeta.upload_session_id,
      selectedSheets
    );
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
    setSelectedSheets([]);
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
                <Label className="text-xs text-gray-600 mb-2 block">
                  Select worksheets to upload (all selected by default)
                </Label>
                <div className="max-h-64 overflow-y-auto border rounded p-2 space-y-2">
                  {sheetOptions.map(sheet => (
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
                      <label
                        htmlFor={`sheet-${sheet}`}
                        className="text-sm text-gray-700 cursor-pointer flex-1"
                      >
                        {sheet}
                      </label>
                    </div>
                  ))}
                </div>
                <p className="text-xs text-gray-500 mt-2">
                  {selectedSheets.length} of {sheetOptions.length} sheet{sheetOptions.length !== 1 ? 's' : ''} selected
                </p>
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
              {hasMultipleSheets ? (
                <Button
                  size="sm"
                  onClick={handleSheetConfirm}
                  disabled={isUploading || selectedSheets.length === 0}
                >
                  {isUploading ? 'Uploading...' : `Upload ${selectedSheets.length} Sheet${selectedSheets.length !== 1 ? 's' : ''}`}
                </Button>
              ) : (
                <Button
                  size="sm"
                  onClick={handleSheetConfirm}
                  disabled={isUploading || selectedSheets.length === 0}
                >
                  {isUploading ? 'Processing...' : 'Upload'}
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

