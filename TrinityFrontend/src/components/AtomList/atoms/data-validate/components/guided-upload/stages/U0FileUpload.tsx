import React, { useRef, useState, useCallback } from 'react';
import { createPortal } from 'react-dom';
import { Upload, FileText, AlertTriangle, Clock, Zap } from 'lucide-react';
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

// Upload progress state interface
interface UploadProgress {
  fileName: string;
  progress: number; // 0-100
  bytesUploaded: number;
  totalBytes: number;
  speed: number; // bytes per second
  estimatedTimeRemaining: number; // seconds
  status: 'uploading' | 'processing' | 'done' | 'error';
  startTime: number;
}

// Helper: Format bytes to human readable
const formatBytes = (bytes: number): string => {
  if (bytes === 0) return '0 B';
  const k = 1024;
  const sizes = ['B', 'KB', 'MB', 'GB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
};

// Helper: Format time remaining
const formatTimeRemaining = (seconds: number): string => {
  if (seconds <= 0 || !isFinite(seconds)) return 'calculating...';
  if (seconds < 60) return `${Math.ceil(seconds)}s remaining`;
  if (seconds < 3600) return `${Math.ceil(seconds / 60)}m ${Math.ceil(seconds % 60)}s remaining`;
  return `${Math.floor(seconds / 3600)}h ${Math.ceil((seconds % 3600) / 60)}m remaining`;
};

// Helper: Format speed
const formatSpeed = (bytesPerSecond: number): string => {
  if (bytesPerSecond <= 0) return '0 B/s';
  return formatBytes(bytesPerSecond) + '/s';
};

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
  
  // Upload progress tracking
  const [uploadProgress, setUploadProgress] = useState<UploadProgress[]>([]);
  const [overallProgress, setOverallProgress] = useState<{
    totalFiles: number;
    completedFiles: number;
    totalBytes: number;
    uploadedBytes: number;
    averageSpeed: number;
    overallProgress: number;
  } | null>(null);

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
      
      // All files uploaded (to tmp/), proceed to next stage
      // Files will be processed and saved in U2 stage
      onNext();
    } catch (err: any) {
      // Comprehensive error handling with user-friendly messages
      const errorMessage = err.message || 'Failed to upload file';
      console.error('[U0FileUpload] Error in finalizeSave:', err);
      setUploadError(errorMessage);
      setIsUploading(false);
      // Don't reset state on error - allow user to retry
    }
  };

  // Upload a single file with progress tracking using XMLHttpRequest
  const uploadSingleFile = useCallback(async (
    file: File, 
    fileIndex: number
  ): Promise<{ success: boolean; error?: string }> => {
    const startTime = Date.now();
    
    // Initialize progress for this file
    const initialProgress: UploadProgress = {
      fileName: file.name,
      progress: 0,
      bytesUploaded: 0,
      totalBytes: file.size,
      speed: 0,
      estimatedTimeRemaining: 0,
      status: 'uploading',
      startTime,
    };
    
    setUploadProgress(prev => {
      const updated = [...prev];
      updated[fileIndex] = initialProgress;
      return updated;
    });
    
    try {
      // Replace spaces with underscores in filename
      const sanitizedFileName = file.name.replace(/\s+/g, '_');
      const sanitizedFile = sanitizedFileName !== file.name 
        ? new File([file], sanitizedFileName, { type: file.type, lastModified: file.lastModified })
        : file;
      
      // Check if it's an Excel file - use multi-sheet endpoint
      const isExcelFile = sanitizedFileName.toLowerCase().endsWith('.xlsx') || 
                         sanitizedFileName.toLowerCase().endsWith('.xls');
      
      const endpoint = isExcelFile 
        ? `${VALIDATE_API}/upload-excel-multi-sheet`
        : `${VALIDATE_API}/upload-file`;
      
      // Create FormData
      const form = new FormData();
      form.append('file', sanitizedFile);
      appendEnvFields(form);
      
      // Use XMLHttpRequest for progress tracking
      const uploadResult = await new Promise<any>((resolve, reject) => {
        const xhr = new XMLHttpRequest();
        
        // Track upload progress
        xhr.upload.addEventListener('progress', (event) => {
          if (event.lengthComputable) {
            const elapsed = (Date.now() - startTime) / 1000; // seconds
            const bytesUploaded = event.loaded;
            const totalBytes = event.total;
            const progress = Math.round((bytesUploaded / totalBytes) * 100);
            const speed = elapsed > 0 ? bytesUploaded / elapsed : 0;
            const remainingBytes = totalBytes - bytesUploaded;
            const estimatedTimeRemaining = speed > 0 ? remainingBytes / speed : 0;
            
            setUploadProgress(prev => {
              const updated = [...prev];
              updated[fileIndex] = {
                ...updated[fileIndex],
                progress,
                bytesUploaded,
                totalBytes,
                speed,
                estimatedTimeRemaining,
                status: 'uploading',
              };
              return updated;
            });
            
            // Update overall progress
            setOverallProgress(prev => {
              if (!prev) return prev;
              const allProgress = uploadProgress.map((p, i) => 
                i === fileIndex ? bytesUploaded : (p?.bytesUploaded || 0)
              );
              const totalUploaded = allProgress.reduce((a, b) => a + b, 0);
              return {
                ...prev,
                uploadedBytes: totalUploaded,
                averageSpeed: speed,
                overallProgress: Math.round((totalUploaded / prev.totalBytes) * 100),
              };
            });
          }
        });
        
        // Handle completion
        xhr.addEventListener('load', () => {
          if (xhr.status >= 200 && xhr.status < 300) {
            try {
              const response = JSON.parse(xhr.responseText);
              // Update progress to processing state
              setUploadProgress(prev => {
                const updated = [...prev];
                updated[fileIndex] = {
                  ...updated[fileIndex],
                  progress: 100,
                  status: 'processing',
                };
                return updated;
              });
              resolve(response);
            } catch (e) {
              reject(new Error('Invalid response from server'));
            }
          } else {
            try {
              const errorData = JSON.parse(xhr.responseText);
              reject(new Error(errorData?.detail || 'Upload failed'));
            } catch {
              reject(new Error(`Upload failed with status ${xhr.status}`));
            }
          }
        });
        
        // Handle errors
        xhr.addEventListener('error', () => {
          setUploadProgress(prev => {
            const updated = [...prev];
            updated[fileIndex] = {
              ...updated[fileIndex],
              status: 'error',
            };
            return updated;
          });
          reject(new Error('Network error during upload'));
        });
        
        xhr.addEventListener('timeout', () => {
          setUploadProgress(prev => {
            const updated = [...prev];
            updated[fileIndex] = {
              ...updated[fileIndex],
              status: 'error',
            };
            return updated;
          });
          reject(new Error('Upload timed out. Please try again with a smaller file or check your connection.'));
        });
        
        // Configure request - 10 minute timeout for large files
        xhr.timeout = 600000; // 10 minutes
        xhr.open('POST', endpoint);
        xhr.withCredentials = true;
        xhr.send(form);
      });
      
      // Process the response based on file type
      if (isExcelFile) {
        const data = uploadResult;
        const sheetNames = Array.isArray(data.sheets) ? data.sheets : [];
        const sheetDetails = Array.isArray(data.sheet_details) ? data.sheet_details : [];
        const fileName = data.file_name || sanitizedFileName;
        
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
        
        // If no details, normalize names ourselves as fallback
        if (sheetNameMap.size === 0) {
          sheetNames.forEach((name: string) => {
            const normalized = name.replace(/\s+/g, '_').replace(/[^a-zA-Z0-9_-]/g, '') || 'Sheet';
            sheetNameMap.set(name, normalized);
          });
        }
        
        // Store temp path (will be processed in U2 stage)
        const tempPath = data.original_file_path || '';
        const fileKey = deriveFileKey(fileName);
        
        // Auto-select all sheets for parallel uploads
        const uploadedFileInfo = {
          name: fileName,
          path: tempPath,
          size: file.size || 0,
          fileKey: fileKey,
          sheetNames: sheetNames.length > 0 ? sheetNames : undefined,
          selectedSheet: sheetNames.length > 0 ? sheetNames[0] : undefined,
          totalSheets: sheetNames.length,
          processed: false,
        };
        
        addUploadedFiles([uploadedFileInfo]);
      } else {
        // CSV - wait for task result
        const data = await waitForTaskResult(uploadResult);
        
        const fileKey = deriveFileKey(data.file_name || sanitizedFileName);
        const tempPath = data.file_path || '';
        
        const uploadedFileInfo = {
          name: data.file_name || sanitizedFileName,
          path: tempPath,
          size: file.size || 0,
          fileKey: fileKey,
          processed: false,
        };
        
        addUploadedFiles([uploadedFileInfo]);
      }
      
      // Mark as done
      setUploadProgress(prev => {
        const updated = [...prev];
        updated[fileIndex] = {
          ...updated[fileIndex],
          progress: 100,
          status: 'done',
        };
        return updated;
      });
      
      return { success: true };
    } catch (err: any) {
      const errorMessage = err.message || 'Upload failed';
      setUploadProgress(prev => {
        const updated = [...prev];
        updated[fileIndex] = {
          ...updated[fileIndex],
          status: 'error',
        };
        return updated;
      });
      return { success: false, error: errorMessage };
    }
  }, [addUploadedFiles, uploadProgress]);

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
      
      // All files processed, proceed to next stage
      console.log(`[U0FileUpload] All files processed, proceeding to next stage`);
      onNext();
    } catch (err: any) {
      // Comprehensive error handling with user-friendly messages
      const errorMessage = err.message || 'Failed to save sheets';
      console.error(`[U0FileUpload] Error in finalizeSaveMultiSheet:`, err);
      setUploadError(errorMessage);
      setIsUploading(false);
      // Don't reset state on error - allow user to retry
    }
  };

  // Note: handleSheetConfirm is kept for backward compatibility but is not used in parallel upload flow
  // The modal is not shown in the new parallel upload flow
  const handleSheetConfirm = async () => {
    // This function is not used in the new parallel upload flow
    // Files are uploaded directly without modal interaction
    console.warn('[U0FileUpload] handleSheetConfirm called but not used in parallel upload flow');
  };

  const handleFileSelect = async (files: FileList | null) => {
    if (!files || files.length === 0) return;

    // Maximum file size: 2GB
    const MAX_FILE_SIZE = 2 * 1024 * 1024 * 1024; // 2 GB
    const MAX_FILE_SIZE_MB = 2048;

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

    // Check file sizes
    const oversizedFiles = validFiles.filter(file => file.size > MAX_FILE_SIZE);
    if (oversizedFiles.length > 0) {
      const fileNames = oversizedFiles.map(f => `${f.name} (${(f.size / (1024*1024*1024)).toFixed(2)}GB)`).join(', ');
      toast({
        title: 'File too large',
        description: `Files exceed ${MAX_FILE_SIZE_MB}MB limit: ${fileNames}`,
        variant: 'destructive',
      });
      return;
    }

    // Calculate total size
    const totalBytes = validFiles.reduce((acc, f) => acc + f.size, 0);
    const totalSizeMB = totalBytes / (1024 * 1024);

    // Show info for large files
    if (totalSizeMB > 100) {
      toast({
        title: 'Large file upload',
        description: `Uploading ${totalSizeMB.toFixed(1)}MB total. Progress will be shown below.`,
      });
    }

    // Initialize progress tracking
    setUploadProgress(validFiles.map(file => ({
      fileName: file.name,
      progress: 0,
      bytesUploaded: 0,
      totalBytes: file.size,
      speed: 0,
      estimatedTimeRemaining: 0,
      status: 'uploading' as const,
      startTime: Date.now(),
    })));
    
    setOverallProgress({
      totalFiles: validFiles.length,
      completedFiles: 0,
      totalBytes,
      uploadedBytes: 0,
      averageSpeed: 0,
      overallProgress: 0,
    });

    // Upload all files in parallel
    setIsUploading(true);
    setUploadError('');
    
    try {
      // Upload all files in parallel with progress tracking
      const uploadPromises = validFiles.map((file, index) => uploadSingleFile(file, index));
      const results = await Promise.allSettled(uploadPromises);
      
      // Check results
      const successes = results.filter(r => r.status === 'fulfilled' && r.value.success);
      const failures = results.filter(r => 
        r.status === 'rejected' || (r.status === 'fulfilled' && !r.value.success)
      );
      
      const successCount = successes.length;
      const failureCount = failures.length;
      
      // Update overall progress
      setOverallProgress(prev => prev ? {
        ...prev,
        completedFiles: successCount,
        overallProgress: 100,
      } : null);
      
      if (successCount > 0) {
        toast({
          title: successCount === validFiles.length ? 'All files uploaded' : 'Some files uploaded',
          description: `${successCount} file(s) uploaded successfully.${failureCount > 0 ? ` ${failureCount} file(s) failed.` : ''} Continue to next step to process them.`,
        });
        
        // Automatically move to next stage after successful uploads
        // Small delay to ensure state updates are complete
        setTimeout(() => {
          setIsUploading(false);
          setUploadProgress([]);
          setOverallProgress(null);
          onNext();
        }, 1000);
      } else {
        // All uploads failed
        const errorMessages = failures.map((f, idx) => {
          if (f.status === 'rejected') {
            return `${validFiles[idx].name}: ${f.reason?.message || 'Upload failed'}`;
          } else if (f.status === 'fulfilled' && f.value.error) {
            return `${validFiles[idx].name}: ${f.value.error}`;
          }
          return `${validFiles[idx].name}: Upload failed`;
        }).join('; ');
        
        setUploadError(`All file uploads failed: ${errorMessages}`);
        setIsUploading(false);
        setUploadProgress([]);
        setOverallProgress(null);
      }
    } catch (err: any) {
      setUploadError(err.message || 'Failed to upload files');
      setIsUploading(false);
      setUploadProgress([]);
      setOverallProgress(null);
    }
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
      explanation="Choose one or more CSV or Excel files from your computer. You can upload multiple files at once."
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
            Select File{uploadedFiles.length > 0 ? 's' : ''}
          </Button>
          
          {/* Real-time Upload Progress */}
          {isUploading && uploadProgress.length > 0 && (
            <div className="w-full max-w-lg space-y-4 bg-gray-50 border border-gray-200 rounded-lg p-4">
              {/* Overall Progress Header */}
              {overallProgress && (
                <div className="space-y-2">
                  <div className="flex items-center justify-between">
                    <span className="text-sm font-semibold text-gray-900">
                      {uploadProgress.some(p => p.status === 'processing') 
                        ? `Processing ${overallProgress.totalFiles} file${overallProgress.totalFiles > 1 ? 's' : ''} on server...`
                        : `Uploading ${overallProgress.totalFiles} file${overallProgress.totalFiles > 1 ? 's' : ''}`
                      }
                    </span>
                    <span className={`text-sm font-medium ${
                      uploadProgress.some(p => p.status === 'processing') ? 'text-amber-600' : 'text-[#458EE2]'
                    }`}>
                      {uploadProgress.some(p => p.status === 'processing') 
                        ? 'Processing...'
                        : `${overallProgress.overallProgress}%`
                      }
                    </span>
                  </div>
                  
                  {/* Overall progress bar */}
                  <div className="w-full h-2 bg-gray-200 rounded-full overflow-hidden">
                    <div 
                      className={`h-full transition-all duration-300 ease-out ${
                        uploadProgress.some(p => p.status === 'processing') 
                          ? 'bg-amber-500 animate-pulse' 
                          : 'bg-[#458EE2]'
                      }`}
                      style={{ width: `${Math.max(overallProgress.overallProgress, uploadProgress.some(p => p.status === 'processing') ? 100 : 0)}%` }}
                    />
                  </div>
                  
                  {/* Overall stats */}
                  <div className="flex items-center justify-between text-xs text-gray-500">
                    <span>
                      {formatBytes(overallProgress.uploadedBytes)} / {formatBytes(overallProgress.totalBytes)}
                    </span>
                    {uploadProgress.some(p => p.status === 'processing') ? (
                      <span className="flex items-center gap-1 text-amber-600">
                        <Clock className="w-3 h-3 animate-spin" />
                        Extracting sheets & converting...
                      </span>
                    ) : overallProgress.averageSpeed > 0 ? (
                      <span className="flex items-center gap-1">
                        <Zap className="w-3 h-3" />
                        {formatSpeed(overallProgress.averageSpeed)}
                      </span>
                    ) : null}
                  </div>
                </div>
              )}
              
              {/* Individual file progress */}
              <div className="space-y-3 max-h-48 overflow-y-auto">
                {uploadProgress.map((progress, idx) => (
                  <div key={idx} className="space-y-1">
                    <div className="flex items-center justify-between">
                      <span className="text-xs font-medium text-gray-700 truncate max-w-[60%]">
                        {progress.fileName}
                      </span>
                      <span className={`text-xs font-medium ${
                        progress.status === 'done' ? 'text-green-600' :
                        progress.status === 'error' ? 'text-red-600' :
                        progress.status === 'processing' ? 'text-amber-600' :
                        'text-[#458EE2]'
                      }`}>
                        {progress.status === 'done' ? '✓ Complete' :
                         progress.status === 'error' ? '✗ Failed' :
                         progress.status === 'processing' ? '⏳ Server processing...' :
                         `${progress.progress}%`}
                      </span>
                    </div>
                    
                    {/* Individual file progress bar */}
                    <div className="w-full h-1.5 bg-gray-200 rounded-full overflow-hidden">
                      <div 
                        className={`h-full transition-all duration-300 ease-out ${
                          progress.status === 'done' ? 'bg-green-500' :
                          progress.status === 'error' ? 'bg-red-500' :
                          progress.status === 'processing' ? 'bg-amber-500 animate-pulse' :
                          'bg-[#458EE2]'
                        }`}
                        style={{ width: `${progress.progress}%` }}
                      />
                    </div>
                    
                    {/* File stats */}
                    {progress.status === 'uploading' && (
                      <div className="flex items-center justify-between text-[10px] text-gray-400">
                        <span>
                          {formatBytes(progress.bytesUploaded)} / {formatBytes(progress.totalBytes)}
                        </span>
                        <span className="flex items-center gap-1">
                          <Clock className="w-2.5 h-2.5" />
                          {formatTimeRemaining(progress.estimatedTimeRemaining)}
                        </span>
                      </div>
                    )}
                    
                    {/* Processing message for large files */}
                    {progress.status === 'processing' && progress.totalBytes > 50 * 1024 * 1024 && (
                      <div className="text-[10px] text-amber-600">
                        Large file ({formatBytes(progress.totalBytes)}) - extracting sheets may take 1-5 minutes...
                      </div>
                    )}
                  </div>
                ))}
              </div>
              
              {/* Upload tip for large files */}
              {overallProgress && overallProgress.totalBytes > 100 * 1024 * 1024 && (
                <p className="text-[10px] text-gray-400 text-center border-t border-gray-200 pt-2">
                  {uploadProgress.some(p => p.status === 'processing') 
                    ? '⏳ Server is extracting sheets and converting to optimized format. Please wait...'
                    : '💡 Large files supported up to 2GB. Upload speed depends on your connection.'
                  }
                </p>
              )}
            </div>
          )}
          
          {/* Simple uploading state when no progress yet */}
          {isUploading && uploadProgress.length === 0 && (
            <div className="space-y-2 w-full max-w-xs">
              <p className="text-gray-700 font-medium text-center">Preparing upload...</p>
              <div className="w-full h-1 bg-gray-200 rounded-full overflow-hidden">
                <div className="h-full bg-[#458EE2] animate-pulse" style={{ width: '30%' }} />
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
            Supported formats: <span className="font-medium">CSV, XLSX, XLS, TSV</span> (up to 2GB)
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

