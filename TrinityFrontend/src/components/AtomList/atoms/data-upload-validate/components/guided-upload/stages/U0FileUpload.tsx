import React, { useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { Upload, FileText, AlertTriangle } from 'lucide-react';
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
    sheetNameMap?: Record<string, string>;
  } | null>(null);
  const { toast } = useToast();
  const { addUploadedFiles, state } = flow;
  const { uploadedFiles } = state;
  
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
      // CRITICAL CHANGE: Do NOT call /save_dataframes here!
      // Files are uploaded to tmp/ and will be processed and saved in U2 stage
      // We only store the temp path here for use in U1 and U2 stages
      
      const fileKey = deriveFileKey(meta.file_name);
      const tempPath = meta.file_path; // This is the tmp/ path from /upload-file
      
      console.log('[U0FileUpload] Storing temp file path (will be processed in U2):', tempPath);
      
      // Validate temp path exists
      if (!tempPath || !tempPath.includes('tmp/')) {
        console.warn('[U0FileUpload] Warning: File path does not contain tmp/. Path:', tempPath);
      }
      
      // Show success toast (file uploaded, but not yet processed)
      toast({ 
        title: 'File uploaded', 
        description: `${meta.file_name} is ready for processing. Continue to next steps to process the file.`,
      });
      
      // Add to guided flow state with temp path
      // The file will be processed and saved in U2 stage
      // Mark as unprocessed (processed: false) since it's still in tmp/
      const uploadedFileInfo = {
        name: meta.file_name,
        path: tempPath, // Temp path - will be updated in U2 after processing
        size: pendingFile?.size || 0,
        fileKey: fileKey,
        sheetNames: sheetOptions.length > 0 ? sheetOptions : (selectedSheets.length > 0 ? selectedSheets : undefined),
        selectedSheet: selectedSheets.length > 0 ? selectedSheets[0] : sheetOptions[0],
        totalSheets: sheetOptions.length,
        processed: false, // Explicitly mark as unprocessed - file is in tmp/ and needs processing
      };
      
      addUploadedFiles([uploadedFileInfo]);
      
      // Reset state AFTER all async operations complete
      setIsUploading(false);
      resetUploadState();
      
      // Process next file in queue if any
      if (pendingFilesQueue.length > 0) {
        const nextFile = pendingFilesQueue[0];
        setPendingFilesQueue(prev => prev.slice(1));
        // Use setTimeout to ensure state is reset before processing next file
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
        // All files uploaded (to tmp/), proceed to next stage
        // Files will be processed and saved in U2 stage
        onNext();
      }
    } catch (err: any) {
      // Comprehensive error handling with user-friendly messages
      const errorMessage = err.message || 'Failed to upload file';
      console.error('[U0FileUpload] Error in finalizeSave:', err);
      setUploadError(errorMessage);
      setIsUploading(false);
      // Don't reset state on error - allow user to retry
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
        // Use normalized_name from backend sheet_details instead of re-normalizing
        const sheetNameMap = new Map<string, string>();
        sheetDetails.forEach((detail: any) => {
          if (detail.original_name && detail.normalized_name) {
            sheetNameMap.set(detail.original_name, detail.normalized_name);
          }
        });
        
        // If no details, normalize names ourselves as fallback
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
        
        // CRITICAL CHANGE: Do NOT save files immediately!
        // Store temp paths for Excel files (same as CSV files)
        // Files will be processed and saved in U2 stage
        const tempPath = data.original_file_path || ''; // This is the tmp/ path from /upload-excel-multi-sheet
        
        console.log('[U0FileUpload] Storing temp Excel file path (will be processed in U2):', tempPath);
        
        // Validate temp path exists
        if (!tempPath || !tempPath.includes('tmp/')) {
          console.warn('[U0FileUpload] Warning: Excel file path does not contain tmp/. Path:', tempPath);
        }
        
        // Show success toast (file uploaded, but not yet processed)
        toast({ 
          title: 'File uploaded', 
          description: `${fileName} with ${sheetNames.length} sheet${sheetNames.length > 1 ? 's' : ''} is ready for processing. Continue to next steps to process the file.`,
        });
        
        // Add to guided flow state with temp path
        // The file will be processed and saved in U2 stage
        const fileKey = deriveFileKey(fileName);
        const uploadedFileInfo = {
          name: fileName,
          path: tempPath, // Temp path - will be updated in U2 after processing
          size: pendingFile?.size || 0,
          fileKey: fileKey,
          sheetNames: sheetNames.length > 0 ? sheetNames : undefined,
          selectedSheet: sheetNames.length > 0 ? sheetNames[0] : undefined,
          totalSheets: sheetNames.length,
        };
        
        addUploadedFiles([uploadedFileInfo]);
        
        // Reset state AFTER all async operations complete
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
          // All files uploaded (to tmp/), proceed to next stage
          // Files will be processed and saved in U2 stage
          onNext();
        }
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
    
    // Validate upload_session_id before proceeding
    if (!uploadSessionId || uploadSessionId.trim() === '') {
      const errorMsg = 'Invalid upload session ID. Please try uploading again.';
      setUploadError(errorMsg);
      setIsUploading(false);
      throw new Error(errorMsg);
    }
    
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
          // Validate sheet name
          if (!sheetName || sheetName.trim() === '') {
            console.warn(`[U0FileUpload] Skipping empty sheet name`);
            continue;
          }
          
          // Get normalized sheet name from mapping (use normalized_name from backend sheet_details)
          const normalizedSheetName = tempUploadMeta?.sheetNameMap?.[sheetName] || 
            sheetName.replace(/\s+/g, '_').replace(/[^a-zA-Z0-9_-]/g, '') || 'Sheet';
          
          console.log(`[U0FileUpload] Converting sheet: ${sheetName} -> ${normalizedSheetName} (use_folder_structure: ${useFolderStructure})`);
          
          // Use the convert endpoint to save sheet directly
          const convertForm = new FormData();
          convertForm.append('upload_session_id', uploadSessionId);
          convertForm.append('sheet_name', normalizedSheetName); // Use normalized name from backend
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
          
          // Use backend file_path directly instead of reconstructing
          const sheetPath = convertData.file_path || '';
          
          if (!sheetPath) {
            console.error(`[U0FileUpload] No file path returned for sheet ${sheetName}`);
            setUploadError(`No file path returned for sheet "${sheetName}"`);
            continue;
          }
          
          // Use backend file_name and file_key directly
          const sheetDisplayName = convertData.file_name || (useFolderStructure 
            ? `${fileName} (${sheetName})`
            : fileName);
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
          // Comprehensive error handling with user-friendly messages
          const errorMessage = err.message || 'Unknown error';
          console.error(`[U0FileUpload] Error saving sheet ${sheetName}:`, err);
          setUploadError(`Error saving sheet "${sheetName}": ${errorMessage}`);
          // Continue processing other sheets even if one fails
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
      
      // Debounce event dispatching - only dispatch once per file to avoid rapid events
      // Dispatch immediately for first file, then debounce subsequent dispatches
      savedFiles.forEach((file, index) => {
        const delay = index * 100; // Stagger events by 100ms
        setTimeout(() => {
          console.log(`[U0FileUpload] Dispatching dataframe-saved event for ${file.path} (delay: ${delay}ms)`);
          window.dispatchEvent(new CustomEvent('dataframe-saved', { 
            detail: { filePath: file.path, fileName: file.name } 
          }));
        }, delay);
      });
      
      // Reset state AFTER all async operations complete
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
      // Comprehensive error handling with user-friendly messages
      const errorMessage = err.message || 'Failed to save sheets';
      console.error(`[U0FileUpload] Error in finalizeSaveMultiSheet:`, err);
      setUploadError(errorMessage);
      setIsUploading(false);
      // Don't reset state on error - allow user to retry
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
    
    // CRITICAL CHANGE: Do NOT save files immediately!
    // Store temp paths and proceed to next stage (files will be processed in U2)
    console.log(`[U0FileUpload] handleSheetConfirm: Storing temp paths for ${selectedSheets.length} sheet(s)`);
    setIsUploadModalOpen(false); // Close modal
    
    const tempPath = tempUploadMeta.file_path || '';
    const fileKey = deriveFileKey(tempUploadMeta.file_name);
    
    // Add to guided flow state with temp path
    // Mark as unprocessed (processed: false) since it's still in tmp/
    const uploadedFileInfo = {
      name: tempUploadMeta.file_name,
      path: tempPath, // Temp path - will be updated in U2 after processing
      size: pendingFile?.size || 0,
      fileKey: fileKey,
      sheetNames: selectedSheets.length > 0 ? selectedSheets : undefined,
      selectedSheet: selectedSheets.length > 0 ? selectedSheets[0] : undefined,
      totalSheets: selectedSheets.length,
      processed: false, // Explicitly mark as unprocessed - file is in tmp/ and needs processing
    };
    
    addUploadedFiles([uploadedFileInfo]);
    
    // Show success toast
    toast({ 
      title: 'File uploaded', 
      description: `${tempUploadMeta.file_name} with ${selectedSheets.length} sheet${selectedSheets.length > 1 ? 's' : ''} is ready for processing. Continue to next steps.`,
    });
    
    // Reset state and proceed to next stage
    setIsUploading(false);
    resetUploadState();
    onNext();
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
      explanation="Choose a CSV or Excel file from your computer."
    >
      <div 
        className="space-y-6"
        onDragOver={handleDragOver}
        onDragLeave={handleDragLeave}
        onDrop={handleDrop}
      >
        {/* Single Key Action: Select File */}
        <div className="flex flex-col items-center gap-4">
          <Button
            onClick={() => fileInputRef.current?.click()}
            disabled={isUploading}
            className="bg-[#458EE2] hover:bg-[#3a7bc7] text-white px-8 py-6 text-base"
          >
            <FileText className="w-5 h-5 mr-2" />
            Select File
          </Button>
          
          {isUploading && (
            <div className="space-y-2 w-full max-w-xs">
              <p className="text-gray-700 font-medium text-center">Uploading files...</p>
              <div className="w-full h-1 bg-gray-200 rounded-full overflow-hidden">
                <div className="h-full bg-[#458EE2] animate-pulse" style={{ width: '60%' }} />
              </div>
            </div>
          )}
        </div>

        {/* Hidden file input */}
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
          <div className="p-3 bg-red-50 border border-red-200 rounded-lg">
            <p className="text-sm text-red-600">{uploadError}</p>
          </div>
        )}

        {/* Uploaded Files List with Status */}
        {uploadedFiles.length > 0 && (
          <div className="bg-gray-50 border border-gray-200 rounded-lg p-4">
            <h3 className="text-sm font-semibold text-gray-900 mb-3 flex items-center gap-2">
              <FileText className="w-4 h-4 text-gray-600" />
              Uploaded Files ({uploadedFiles.length})
            </h3>
            <div className="space-y-2 max-h-64 overflow-y-auto">
              {uploadedFiles.map((file, idx) => {
                // Check if file is processed (not in tmp/ and has been saved)
                const isProcessed = file.processed || (file.path && !file.path.includes('tmp/') && !file.path.includes('temp_uploads/'));
                const borderColor = isProcessed ? 'border-gray-200 bg-white' : 'border-red-300 bg-red-50';
                const iconColor = isProcessed ? 'text-blue-600' : 'text-red-600';
                return (
                  <div key={idx} className={`rounded p-3 border-2 ${borderColor}`}>
                    <div className="flex items-start gap-2">
                      <FileText className={`w-4 h-4 ${iconColor} mt-0.5 flex-shrink-0`} />
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2">
                          <p className={`text-sm font-medium truncate ${!isProcessed ? 'text-red-900' : 'text-gray-900'}`}>
                            {file.name}
                          </p>
                          {!isProcessed && (
                            <span className="inline-flex items-center px-2 py-0.5 rounded text-xs font-medium bg-red-100 text-red-800 whitespace-nowrap">
                              Needs Processing
                            </span>
                          )}
                          {isProcessed && (
                            <span className="inline-flex items-center px-2 py-0.5 rounded text-xs font-medium bg-green-100 text-green-800 whitespace-nowrap">
                              Processed
                            </span>
                          )}
                        </div>
                        {!isProcessed && (
                          <p className="text-xs text-red-700 mt-1 font-medium">
                            ⚠️ This file needs to be processed in the next steps
                          </p>
                        )}
                        {file.sheetNames && file.sheetNames.length > 0 && (
                          <div className="mt-2 flex flex-wrap gap-1">
                            {file.sheetNames.map((sheet, sheetIdx) => (
                              <span
                                key={sheetIdx}
                                className="inline-flex items-center px-2 py-0.5 rounded text-xs font-medium bg-blue-100 text-blue-800"
                              >
                                {sheet}
                              </span>
                            ))}
                          </div>
                        )}
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
            {/* Warning for unprocessed files */}
            {uploadedFiles.some(f => !f.processed && (f.path?.includes('tmp/') || f.path?.includes('temp_uploads/'))) && (
              <div className="mt-4 bg-red-50 border border-red-200 rounded-lg p-3">
                <p className="text-sm text-red-800 font-medium">
                  ⚠️ Some files are not yet processed
                </p>
                <p className="text-xs text-red-700 mt-1">
                  Files marked in <span className="font-semibold text-red-600">red</span> need to be processed. 
                  Click "Continue" to proceed to the next step where you can process these files.
                </p>
              </div>
            )}
          </div>
        )}

        {/* Secondary link: Supported formats */}
        <div className="text-center">
          <p className="text-sm text-gray-500">
            Supported formats: <span className="font-medium">CSV, XLSX, TSV</span>
          </p>
        </div>

        {/* Optional: Use Sample Dataset */}
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

