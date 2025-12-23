import React, { useRef, useState, useCallback, useEffect } from 'react';
import { createPortal } from 'react-dom';
import { Upload, FileText, AlertTriangle, Clock, Zap, Database, FolderOpen, ChevronRight, Check } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { useToast } from '@/hooks/use-toast';
import { UPLOAD_API, VALIDATE_API } from '@/lib/api';
import { waitForTaskResult } from '@/lib/taskQueue';
import { StageLayout } from '../components/StageLayout';
import type { ReturnTypeFromUseGuidedUploadFlow } from '../useGuidedUploadFlow';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Label } from '@/components/ui/label';
import { getActiveProjectContext } from '@/utils/projectEnv';
import { Checkbox } from '@/components/ui/checkbox';
import { cn } from '@/lib/utils';

// Upload progress state interface
interface UploadProgress {
  fileName: string;
  progress: number;
  bytesUploaded: number;
  totalBytes: number;
  speed: number;
  estimatedTimeRemaining: number;
  status: 'uploading' | 'processing' | 'done' | 'error';
  startTime: number;
}

// Saved dataframe interface
interface SavedDataFrame {
  object_name: string;
  csv_name: string;
  arrow_name?: string;
  last_modified?: string;
  size?: number;
}

// Helper functions
const formatBytes = (bytes: number): string => {
  if (bytes === 0) return '0 B';
  const k = 1024;
  const sizes = ['B', 'KB', 'MB', 'GB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
};

const formatTimeRemaining = (seconds: number): string => {
  if (seconds <= 0 || !isFinite(seconds)) return 'calculating...';
  if (seconds < 60) return `${Math.ceil(seconds)}s remaining`;
  if (seconds < 3600) return `${Math.ceil(seconds / 60)}m ${Math.ceil(seconds % 60)}s remaining`;
  return `${Math.floor(seconds / 3600)}h ${Math.ceil((seconds % 3600) / 60)}m remaining`;
};

const formatSpeed = (bytesPerSecond: number): string => {
  if (bytesPerSecond <= 0) return '0 B/s';
  return formatBytes(bytesPerSecond) + '/s';
};


interface U0FileUploadProps {
  flow: ReturnTypeFromUseGuidedUploadFlow;
  onNext: () => void;
  onBack: () => void;
}

type SourceMode = 'select' | 'upload' | null;

export const U0FileUpload: React.FC<U0FileUploadProps> = ({ flow, onNext }) => {
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [isDragging, setIsDragging] = useState(false);
  const [isUploading, setIsUploading] = useState(false);
  const [pendingFile, setPendingFile] = useState<File | null>(null);
  const [pendingFilesQueue, setPendingFilesQueue] = useState<File[]>([]);
  const [isUploadModalOpen, setIsUploadModalOpen] = useState(false);
  const [sheetOptions, setSheetOptions] = useState<string[]>([]);
  const [selectedSheets, setSelectedSheets] = useState<string[]>([]);
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
  
  // Source mode selection state
  const [sourceMode, setSourceMode] = useState<SourceMode>(null);
  
  // Saved dataframes state for "Select Existing" mode
  const [savedDataframes, setSavedDataframes] = useState<SavedDataFrame[]>([]);
  const [loadingSavedFiles, setLoadingSavedFiles] = useState(false);
  const [savedFilesError, setSavedFilesError] = useState('');
  const [selectedExistingFile, setSelectedExistingFile] = useState<SavedDataFrame | null>(null);
  
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


  // Fetch saved dataframes when "Select Existing" mode is chosen
  useEffect(() => {
    if (sourceMode === 'select') {
      fetchSavedDataframes();
    }
  }, [sourceMode]);

  const fetchSavedDataframes = async () => {
    setLoadingSavedFiles(true);
    setSavedFilesError('');
    try {
      const projectContext = getActiveProjectContext();
      const prefix = projectContext 
        ? `${projectContext.client_name}/${projectContext.app_name}/${projectContext.project_name}/`
        : '';
      
      const res = await fetch(`${VALIDATE_API}/list_saved_dataframes?prefix=${encodeURIComponent(prefix)}`, {
        credentials: 'include'
      });
      
      if (!res.ok) {
        throw new Error('Failed to load saved dataframes');
      }
      
      const data = await res.json();
      const frames = data.dataframes || data.files || [];
      setSavedDataframes(frames);
    } catch (err: any) {
      setSavedFilesError(err.message || 'Failed to load saved files');
    } finally {
      setLoadingSavedFiles(false);
    }
  };

  const handleSelectExistingFile = (frame: SavedDataFrame) => {
    setSelectedExistingFile(frame);
  };

  const handleConfirmExistingFile = () => {
    if (!selectedExistingFile) return;
    
    const fileKey = selectedExistingFile.object_name.replace(/\.[^.]+$/, '').split('/').pop() || 'dataframe';
    
    addUploadedFiles([{
      name: selectedExistingFile.csv_name || selectedExistingFile.object_name.split('/').pop() || 'dataframe',
      path: selectedExistingFile.object_name,
      size: selectedExistingFile.size || 0,
      fileKey: fileKey,
      processed: true, // Already saved, so it's processed
    }]);
    
    toast({
      title: 'File selected',
      description: `${selectedExistingFile.csv_name || selectedExistingFile.object_name} selected for processing.`,
    });
    
    onNext();
  };

  // Helper functions from original component
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


  // Upload a single file with progress tracking using XMLHttpRequest
  const uploadSingleFile = useCallback(async (
    file: File, 
    fileIndex: number
  ): Promise<{ success: boolean; error?: string }> => {
    const startTime = Date.now();
    
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
      const sanitizedFileName = file.name.replace(/\s+/g, '_');
      const sanitizedFile = sanitizedFileName !== file.name 
        ? new File([file], sanitizedFileName, { type: file.type, lastModified: file.lastModified })
        : file;
      
      const isExcelFile = sanitizedFileName.toLowerCase().endsWith('.xlsx') || 
                         sanitizedFileName.toLowerCase().endsWith('.xls');
      
      const endpoint = isExcelFile 
        ? `${UPLOAD_API}/upload-excel-multi-sheet`
        : `${UPLOAD_API}/upload-file`;
      
      const form = new FormData();
      form.append('file', sanitizedFile);
      appendEnvFields(form);
      
      const uploadResult = await new Promise<any>((resolve, reject) => {
        const xhr = new XMLHttpRequest();
        
        xhr.upload.addEventListener('progress', (event) => {
          if (event.lengthComputable) {
            const elapsed = (Date.now() - startTime) / 1000;
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
        
        xhr.addEventListener('load', () => {
          if (xhr.status >= 200 && xhr.status < 300) {
            try {
              const response = JSON.parse(xhr.responseText);
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
        
        xhr.addEventListener('error', () => {
          setUploadProgress(prev => {
            const updated = [...prev];
            updated[fileIndex] = { ...updated[fileIndex], status: 'error' };
            return updated;
          });
          reject(new Error('Network error during upload'));
        });
        
        xhr.addEventListener('timeout', () => {
          setUploadProgress(prev => {
            const updated = [...prev];
            updated[fileIndex] = { ...updated[fileIndex], status: 'error' };
            return updated;
          });
          reject(new Error('Upload timed out. Please try again with a smaller file or check your connection.'));
        });
        
        xhr.timeout = 600000;
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
        
        const sheetNameMap = new Map<string, string>();
        sheetDetails.forEach((detail: any) => {
          if (detail.original_name && detail.normalized_name) {
            sheetNameMap.set(detail.original_name, detail.normalized_name);
          }
        });
        
        if (sheetNameMap.size === 0) {
          sheetNames.forEach((name: string) => {
            const normalized = name.replace(/\s+/g, '_').replace(/[^a-zA-Z0-9_-]/g, '') || 'Sheet';
            sheetNameMap.set(name, normalized);
          });
        }
        
        const tempPath = data.original_file_path || data.folder_path || '';
        const fileKey = deriveFileKey(fileName);
        
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
      
      setUploadProgress(prev => {
        const updated = [...prev];
        updated[fileIndex] = { ...updated[fileIndex], progress: 100, status: 'done' };
        return updated;
      });
      
      return { success: true };
    } catch (err: any) {
      const errorMessage = err.message || 'Upload failed';
      setUploadProgress(prev => {
        const updated = [...prev];
        updated[fileIndex] = { ...updated[fileIndex], status: 'error' };
        return updated;
      });
      return { success: false, error: errorMessage };
    }
  }, [addUploadedFiles, uploadProgress]);


  const handleFileSelect = async (files: FileList | null) => {
    if (!files || files.length === 0) return;

    const MAX_FILE_SIZE = 2 * 1024 * 1024 * 1024;
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

    const totalBytes = validFiles.reduce((acc, f) => acc + f.size, 0);
    const totalSizeMB = totalBytes / (1024 * 1024);

    if (totalSizeMB > 100) {
      toast({
        title: 'Large file upload',
        description: `Uploading ${totalSizeMB.toFixed(1)}MB total. Progress will be shown below.`,
      });
    }

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

    setIsUploading(true);
    setUploadError('');
    
    try {
      const uploadPromises = validFiles.map((file, index) => uploadSingleFile(file, index));
      const results = await Promise.allSettled(uploadPromises);
      
      const successes = results.filter(r => r.status === 'fulfilled' && r.value.success);
      const failures = results.filter(r => 
        r.status === 'rejected' || (r.status === 'fulfilled' && !r.value.success)
      );
      
      const successCount = successes.length;
      const failureCount = failures.length;
      
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
        
        setTimeout(() => {
          setIsUploading(false);
          setUploadProgress([]);
          setOverallProgress(null);
          onNext();
        }, 1000);
      } else {
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


  // Render the source selection cards (split panel)
  const renderSourceSelection = () => (
    <div className="grid grid-cols-1 md:grid-cols-2 gap-6 h-full">
      {/* Select Existing File Card */}
      <div
        onClick={() => setSourceMode('select')}
        className={cn(
          "relative flex flex-col items-center justify-center p-8 rounded-xl border-2 cursor-pointer transition-all duration-200",
          "hover:border-[#458EE2] hover:bg-blue-50/50 hover:shadow-md",
          sourceMode === 'select' 
            ? "border-[#458EE2] bg-blue-50 shadow-md ring-2 ring-[#458EE2]/20" 
            : "border-gray-200 bg-white"
        )}
      >
        {sourceMode === 'select' && (
          <div className="absolute top-3 right-3">
            <div className="w-6 h-6 rounded-full bg-[#458EE2] flex items-center justify-center">
              <Check className="w-4 h-4 text-white" />
            </div>
          </div>
        )}
        <div className={cn(
          "w-16 h-16 rounded-full flex items-center justify-center mb-4 transition-colors",
          sourceMode === 'select' ? "bg-[#458EE2]" : "bg-gray-100"
        )}>
          <Database className={cn(
            "w-8 h-8 transition-colors",
            sourceMode === 'select' ? "text-white" : "text-gray-500"
          )} />
        </div>
        <h3 className={cn(
          "text-lg font-semibold mb-2 transition-colors",
          sourceMode === 'select' ? "text-[#458EE2]" : "text-gray-900"
        )}>
          Select Existing File
        </h3>
        <p className="text-sm text-gray-500 text-center">
          Choose from your previously saved dataframes
        </p>
        <div className="mt-4 flex items-center gap-1 text-xs text-gray-400">
          <FolderOpen className="w-3 h-3" />
          <span>Browse saved files</span>
        </div>
      </div>

      {/* Upload New File Card */}
      <div
        onClick={() => setSourceMode('upload')}
        className={cn(
          "relative flex flex-col items-center justify-center p-8 rounded-xl border-2 cursor-pointer transition-all duration-200",
          "hover:border-[#41C185] hover:bg-green-50/50 hover:shadow-md",
          sourceMode === 'upload' 
            ? "border-[#41C185] bg-green-50 shadow-md ring-2 ring-[#41C185]/20" 
            : "border-gray-200 bg-white"
        )}
      >
        {sourceMode === 'upload' && (
          <div className="absolute top-3 right-3">
            <div className="w-6 h-6 rounded-full bg-[#41C185] flex items-center justify-center">
              <Check className="w-4 h-4 text-white" />
            </div>
          </div>
        )}
        <div className={cn(
          "w-16 h-16 rounded-full flex items-center justify-center mb-4 transition-colors",
          sourceMode === 'upload' ? "bg-[#41C185]" : "bg-gray-100"
        )}>
          <Upload className={cn(
            "w-8 h-8 transition-colors",
            sourceMode === 'upload' ? "text-white" : "text-gray-500"
          )} />
        </div>
        <h3 className={cn(
          "text-lg font-semibold mb-2 transition-colors",
          sourceMode === 'upload' ? "text-[#41C185]" : "text-gray-900"
        )}>
          Upload New File
        </h3>
        <p className="text-sm text-gray-500 text-center">
          Upload a new CSV, Excel, or TSV file
        </p>
        <div className="mt-4 flex items-center gap-1 text-xs text-gray-400">
          <FileText className="w-3 h-3" />
          <span>CSV, XLSX, XLS, TSV (up to 2GB)</span>
        </div>
      </div>
    </div>
  );


  // Render the "Select Existing File" content
  const renderSelectExisting = () => (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <button
          onClick={() => { setSourceMode(null); setSelectedExistingFile(null); }}
          className="flex items-center gap-1 text-sm text-gray-500 hover:text-gray-700 transition-colors"
        >
          <ChevronRight className="w-4 h-4 rotate-180" />
          Back to options
        </button>
        <Button
          onClick={fetchSavedDataframes}
          variant="ghost"
          size="sm"
          disabled={loadingSavedFiles}
        >
          Refresh
        </Button>
      </div>
      
      <div className="border border-gray-200 rounded-lg overflow-hidden">
        <div className="bg-gray-50 px-4 py-3 border-b border-gray-200">
          <h4 className="text-sm font-medium text-gray-700 flex items-center gap-2">
            <Database className="w-4 h-4 text-[#458EE2]" />
            Saved Dataframes
          </h4>
        </div>
        
        <div className="max-h-[400px] overflow-y-auto">
          {loadingSavedFiles ? (
            <div className="flex items-center justify-center py-12">
              <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-[#458EE2]"></div>
            </div>
          ) : savedFilesError ? (
            <div className="p-4 text-center">
              <p className="text-sm text-red-600">{savedFilesError}</p>
              <Button onClick={fetchSavedDataframes} variant="outline" size="sm" className="mt-2">
                Retry
              </Button>
            </div>
          ) : savedDataframes.length === 0 ? (
            <div className="p-8 text-center">
              <Database className="w-12 h-12 text-gray-300 mx-auto mb-3" />
              <p className="text-sm text-gray-500">No saved dataframes found</p>
              <p className="text-xs text-gray-400 mt-1">Upload a new file to get started</p>
              <Button 
                onClick={() => setSourceMode('upload')} 
                variant="outline" 
                size="sm" 
                className="mt-4"
              >
                Upload New File
              </Button>
            </div>
          ) : (
            <div className="divide-y divide-gray-100">
              {savedDataframes.map((frame, idx) => {
                const displayName = frame.csv_name || frame.object_name.split('/').pop() || 'Unknown';
                const isSelected = selectedExistingFile?.object_name === frame.object_name;
                
                return (
                  <div
                    key={idx}
                    onClick={() => handleSelectExistingFile(frame)}
                    className={cn(
                      "flex items-center gap-3 px-4 py-3 cursor-pointer transition-colors",
                      isSelected 
                        ? "bg-blue-50 border-l-4 border-l-[#458EE2]" 
                        : "hover:bg-gray-50 border-l-4 border-l-transparent"
                    )}
                  >
                    <div className={cn(
                      "w-10 h-10 rounded-lg flex items-center justify-center flex-shrink-0",
                      isSelected ? "bg-[#458EE2]" : "bg-gray-100"
                    )}>
                      <FileText className={cn(
                        "w-5 h-5",
                        isSelected ? "text-white" : "text-gray-500"
                      )} />
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className={cn(
                        "text-sm font-medium truncate",
                        isSelected ? "text-[#458EE2]" : "text-gray-900"
                      )}>
                        {displayName}
                      </p>
                      {frame.last_modified && (
                        <p className="text-xs text-gray-400 mt-0.5">
                          Modified: {new Date(frame.last_modified).toLocaleDateString()}
                        </p>
                      )}
                    </div>
                    {isSelected && (
                      <div className="w-5 h-5 rounded-full bg-[#458EE2] flex items-center justify-center flex-shrink-0">
                        <Check className="w-3 h-3 text-white" />
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </div>
      
      {selectedExistingFile && (
        <div className="flex justify-end pt-2">
          <Button
            onClick={handleConfirmExistingFile}
            className="bg-[#458EE2] hover:bg-[#3a7bc7] text-white"
          >
            Continue with Selected File
            <ChevronRight className="w-4 h-4 ml-1" />
          </Button>
        </div>
      )}
    </div>
  );


  // Render the "Upload New File" content
  const renderUploadNew = () => (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <button
          onClick={() => setSourceMode(null)}
          className="flex items-center gap-1 text-sm text-gray-500 hover:text-gray-700 transition-colors"
        >
          <ChevronRight className="w-4 h-4 rotate-180" />
          Back to options
        </button>
      </div>
      
      {/* Upload Drop Zone */}
      <div
        onClick={() => fileInputRef.current?.click()}
        onDragOver={handleDragOver}
        onDragLeave={handleDragLeave}
        onDrop={handleDrop}
        className={cn(
          "relative border-2 border-dashed rounded-xl p-12 text-center cursor-pointer transition-all duration-200",
          isDragging 
            ? "border-[#41C185] bg-green-50" 
            : "border-gray-300 hover:border-[#41C185] hover:bg-green-50/30"
        )}
      >
        <div className={cn(
          "w-16 h-16 rounded-full mx-auto mb-4 flex items-center justify-center transition-colors",
          isDragging ? "bg-[#41C185]" : "bg-gray-100"
        )}>
          <Upload className={cn(
            "w-8 h-8 transition-colors",
            isDragging ? "text-white" : "text-gray-400"
          )} />
        </div>
        <p className="text-lg font-medium text-gray-700 mb-1">
          {isDragging ? 'Drop files here' : 'Drag and drop files here'}
        </p>
        <p className="text-sm text-gray-500 mb-4">or click to browse</p>
        <div className="inline-flex items-center gap-2 px-4 py-2 bg-gray-100 rounded-full text-xs text-gray-500">
          <FileText className="w-3 h-3" />
          CSV, XLSX, XLS, TSV (up to 2GB)
        </div>
      </div>

      {/* Hidden file input */}
      <input
        ref={fileInputRef}
        type="file"
        multiple
        accept=".csv,.xlsx,.xls,.tsv"
        onChange={(e) => {
          handleFileSelect(e.target.files);
          e.target.value = '';
        }}
        className="hidden"
      />

      {/* Upload Progress */}
      {isUploading && uploadProgress.length > 0 && (
        <div className="bg-gray-50 border border-gray-200 rounded-lg p-4 space-y-4">
          {overallProgress && (
            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <span className="text-sm font-semibold text-gray-900">
                  {uploadProgress.some(p => p.status === 'processing') 
                    ? `Processing ${overallProgress.totalFiles} file${overallProgress.totalFiles > 1 ? 's' : ''} on server...`
                    : `Uploading ${overallProgress.totalFiles} file${overallProgress.totalFiles > 1 ? 's' : ''}`
                  }
                </span>
                <span className={cn(
                  "text-sm font-medium",
                  uploadProgress.some(p => p.status === 'processing') ? 'text-amber-600' : 'text-[#458EE2]'
                )}>
                  {uploadProgress.some(p => p.status === 'processing') 
                    ? 'Processing...'
                    : `${overallProgress.overallProgress}%`
                  }
                </span>
              </div>
              
              <div className="w-full h-2 bg-gray-200 rounded-full overflow-hidden">
                <div 
                  className={cn(
                    "h-full transition-all duration-300 ease-out",
                    uploadProgress.some(p => p.status === 'processing') 
                      ? 'bg-amber-500 animate-pulse' 
                      : 'bg-[#458EE2]'
                  )}
                  style={{ width: `${Math.max(overallProgress.overallProgress, uploadProgress.some(p => p.status === 'processing') ? 100 : 0)}%` }}
                />
              </div>
              
              <div className="flex items-center justify-between text-xs text-gray-500">
                <span>{formatBytes(overallProgress.uploadedBytes)} / {formatBytes(overallProgress.totalBytes)}</span>
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
                  <span className={cn(
                    "text-xs font-medium",
                    progress.status === 'done' ? 'text-green-600' :
                    progress.status === 'error' ? 'text-red-600' :
                    progress.status === 'processing' ? 'text-amber-600' :
                    'text-[#458EE2]'
                  )}>
                    {progress.status === 'done' ? '✓ Complete' :
                     progress.status === 'error' ? '✗ Failed' :
                     progress.status === 'processing' ? '⏳ Server processing...' :
                     `${progress.progress}%`}
                  </span>
                </div>
                
                <div className="w-full h-1.5 bg-gray-200 rounded-full overflow-hidden">
                  <div 
                    className={cn(
                      "h-full transition-all duration-300 ease-out",
                      progress.status === 'done' ? 'bg-green-500' :
                      progress.status === 'error' ? 'bg-red-500' :
                      progress.status === 'processing' ? 'bg-amber-500 animate-pulse' :
                      'bg-[#458EE2]'
                    )}
                    style={{ width: `${progress.progress}%` }}
                  />
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {uploadError && (
        <div className="p-3 bg-red-50 border border-red-200 rounded-lg">
          <p className="text-sm text-red-600">{uploadError}</p>
        </div>
      )}
    </div>
  );


  // Render uploaded files list (shown after files are uploaded)
  const renderUploadedFiles = () => (
    <div className="space-y-4">
      <div className="bg-gray-50 border border-gray-200 rounded-lg p-4">
        <h3 className="text-sm font-semibold text-gray-900 mb-3 flex items-center gap-2">
          <FileText className="w-4 h-4 text-gray-600" />
          Uploaded Files ({uploadedFiles.length})
        </h3>
        <div className="space-y-2 max-h-64 overflow-y-auto">
          {uploadedFiles.map((file, idx) => {
            const isProcessed = file.processed || (file.path && !file.path.includes('tmp/') && !file.path.includes('temp_uploads/'));
            const borderColor = isProcessed ? 'border-gray-200 bg-white' : 'border-amber-300 bg-amber-50';
            const iconColor = isProcessed ? 'text-blue-600' : 'text-amber-600';
            return (
              <div key={idx} className={`rounded p-3 border-2 ${borderColor}`}>
                <div className="flex items-start gap-2">
                  <FileText className={`w-4 h-4 ${iconColor} mt-0.5 flex-shrink-0`} />
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      <p className={`text-sm font-medium truncate ${!isProcessed ? 'text-amber-900' : 'text-gray-900'}`}>
                        {file.name}
                      </p>
                      {!isProcessed && (
                        <span className="inline-flex items-center px-2 py-0.5 rounded text-xs font-medium bg-amber-100 text-amber-800 whitespace-nowrap">
                          Needs Processing
                        </span>
                      )}
                      {isProcessed && (
                        <span className="inline-flex items-center px-2 py-0.5 rounded text-xs font-medium bg-green-100 text-green-800 whitespace-nowrap">
                          Processed
                        </span>
                      )}
                    </div>
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
        {uploadedFiles.some(f => !f.processed && (f.path?.includes('tmp/') || f.path?.includes('temp_uploads/'))) && (
          <div className="mt-4 bg-amber-50 border border-amber-200 rounded-lg p-3">
            <p className="text-sm text-amber-800 font-medium">
              ⚠️ Some files are not yet processed
            </p>
            <p className="text-xs text-amber-700 mt-1">
              Click "Continue" to proceed to the next step where you can process these files.
            </p>
          </div>
        )}
      </div>
    </div>
  );

  return (
    <StageLayout
      title=""
      explanation=""
      className="h-full"
    >
      <div className="h-full flex flex-col">
        {/* Header */}
        <div className="mb-6">
          <h2 className="text-xl font-semibold text-gray-900">Choose Your Data Source</h2>
          <p className="text-sm text-gray-500 mt-1">
            Select an existing file from your saved dataframes or upload a new file to begin.
          </p>
        </div>

        {/* Content based on mode */}
        <div className="flex-1 overflow-y-auto">
          {uploadedFiles.length > 0 ? (
            renderUploadedFiles()
          ) : sourceMode === null ? (
            renderSourceSelection()
          ) : sourceMode === 'select' ? (
            renderSelectExisting()
          ) : (
            renderUploadNew()
          )}
        </div>
      </div>
    </StageLayout>
  );
};
