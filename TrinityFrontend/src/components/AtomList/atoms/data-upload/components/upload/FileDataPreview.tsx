import React, { useState, useEffect, useRef } from 'react';
import { ChevronDown, ChevronRight, Database, AlertCircle, RefreshCw, Check, Trash2, X } from 'lucide-react';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible';
import { UPLOAD_API } from '@/lib/api';
import { useToast } from '@/hooks/use-toast';
import { TruncatedFileName } from '@/components/common/TruncatedFileName';
import { DATETIME_FORMAT_OPTIONS, formatLabelWithExample } from '@/utils/datetimeFormats';

interface FileMetadata {
  columns: ColumnInfo[];
  total_rows: number;
  total_columns: number;
}

interface ColumnInfo {
  name: string;
  dtype: string;
  original_dtype?: string;
  modified_dtype?: string;
  suggested_types?: string[];
  missing_count: number;
  missing_percentage: number;
  sample_values: any[];
  datetime_format?: string;
  detection_method?: 'automatic' | 'manual' | 'none';
}

interface FileDataPreviewProps {
  uploadedFiles: { name: string; path: string; size: number }[];
  onDataChanges?: (changes: {
    dtypeChanges: Record<string, Record<string, string | { dtype: string; format: string }>>;
    missingValueStrategies: Record<string, Record<string, { strategy: string; value?: string }>>;
  }) => void;
  onDeleteFile?: (fileName: string) => void;
  useMasterFile?: boolean;
  fileAssignments?: Record<string, string>;
  onAssignmentChange?: (fileName: string, value: string) => void;
  requiredOptions?: string[];
  filesWithAppliedChanges?: Set<string>;
  initialDtypeChanges?: Record<string, Record<string, string | { dtype: string; format: string }>>;
  initialMissingValueStrategies?: Record<string, Record<string, { strategy: string; value?: string }>>;
  initialFilesMetadata?: Record<string, FileMetadata>;
  onMetadataChange?: (metadata: Record<string, FileMetadata>) => void;
  validationResults?: Record<string, string>;
  validationDetails?: Record<string, any[]>;
  filePathMap?: Record<string, string>;
}

const FileDataPreview: React.FC<FileDataPreviewProps> = ({ 
  uploadedFiles, 
  onDataChanges, 
  onDeleteFile,
  useMasterFile = false,
  fileAssignments = {},
  onAssignmentChange,
  requiredOptions = [],
  filesWithAppliedChanges = new Set(),
  initialDtypeChanges = {},
  initialMissingValueStrategies = {},
  initialFilesMetadata = {},
  onMetadataChange,
  validationResults = {},
  validationDetails = {},
  filePathMap = {}
}) => {
  const [filesMetadata, setFilesMetadata] = useState<Record<string, FileMetadata>>(initialFilesMetadata);
  const [openFiles, setOpenFiles] = useState<Set<string>>(new Set());
  const [dtypeChanges, setDtypeChanges] = useState<Record<string, Record<string, string | { dtype: string; format: string }>>>(initialDtypeChanges);
  const [missingValueStrategies, setMissingValueStrategies] = useState<Record<string, Record<string, { strategy: string; value?: string }>>>(initialMissingValueStrategies);
  const [loading, setLoading] = useState<Record<string, boolean>>({});
  const [datetimeFormats, setDatetimeFormats] = useState<Record<string, Record<string, string>>>({});
  const [formatDetectionMethods, setFormatDetectionMethods] = useState<Record<string, Record<string, 'automatic' | 'manual' | 'none'>>>({});
  const [formatDetectionStatus, setFormatDetectionStatus] = useState<Record<string, { detecting: boolean; failed: boolean }>>({});
  const { toast } = useToast();

  // Refs to track previous values and prevent infinite loops
  const prevDtypeChangesRef = useRef<string>('');
  const prevMissingValueStrategiesRef = useRef<string>('');
  const prevFilesMetadataRef = useRef<string>('');
  const isSyncingFromPropsRef = useRef(false);
  const prevInitialDtypeChangesRef = useRef<string>('');
  const prevInitialMissingValueStrategiesRef = useRef<string>('');

  // Notify parent component about changes (only when data actually changes)
  useEffect(() => {
    // Skip if we're currently syncing from props to prevent circular updates
    if (isSyncingFromPropsRef.current) {
      return;
    }

    const currentDtypeStr = JSON.stringify(dtypeChanges);
    const currentMissingStr = JSON.stringify(missingValueStrategies);
    
    // Only call callback if data actually changed
    if (
      currentDtypeStr !== prevDtypeChangesRef.current ||
      currentMissingStr !== prevMissingValueStrategiesRef.current
    ) {
      prevDtypeChangesRef.current = currentDtypeStr;
      prevMissingValueStrategiesRef.current = currentMissingStr;
      onDataChanges?.({ dtypeChanges, missingValueStrategies });
    }
  }, [dtypeChanges, missingValueStrategies]); // Removed onDataChanges from deps

  // Notify parent component about metadata changes (only when data actually changes)
  useEffect(() => {
    const currentMetadataStr = JSON.stringify(filesMetadata);
    
    // Only call callback if data actually changed
    if (currentMetadataStr !== prevFilesMetadataRef.current) {
      prevFilesMetadataRef.current = currentMetadataStr;
      onMetadataChange?.(filesMetadata);
    }
  }, [filesMetadata]); // Removed onMetadataChange from deps

  // Sync metadata when initialFilesMetadata changes (e.g., when cleared for reload)
  useEffect(() => {
    // If a file's metadata is cleared in initialFilesMetadata (set to undefined), clear it from local state
    Object.keys(initialFilesMetadata).forEach(fileName => {
      if (initialFilesMetadata[fileName] === undefined && filesMetadata[fileName]) {
        setFilesMetadata(prev => {
          const updated = { ...prev };
          delete updated[fileName];
          return updated;
        });
      }
    });
  }, [initialFilesMetadata]);

  // Sync dtypeChanges and missingValueStrategies when initialDtypeChanges prop changes (e.g., after validation)
  useEffect(() => {
    const currentInitialDtypeStr = JSON.stringify(initialDtypeChanges);
    const currentInitialMissingStr = JSON.stringify(initialMissingValueStrategies);
    
    // Only update if the prop actually changed
    if (
      currentInitialDtypeStr !== prevInitialDtypeChangesRef.current ||
      currentInitialMissingStr !== prevInitialMissingValueStrategiesRef.current
    ) {
      prevInitialDtypeChangesRef.current = currentInitialDtypeStr;
      prevInitialMissingValueStrategiesRef.current = currentInitialMissingStr;

      if (initialDtypeChanges && Object.keys(initialDtypeChanges).length > 0) {
        isSyncingFromPropsRef.current = true;
        setDtypeChanges(prev => {
          // Merge with existing changes, but allow new values from initialDtypeChanges to override
          const merged = { ...prev };
          Object.keys(initialDtypeChanges).forEach(fileName => {
            merged[fileName] = {
              ...(merged[fileName] || {}),
              ...initialDtypeChanges[fileName],
            };
          });
          // Only return merged if it's actually different from prev
          const prevStr = JSON.stringify(prev);
          const mergedStr = JSON.stringify(merged);
          return prevStr === mergedStr ? prev : merged;
        });
        // Reset flag after state update completes
        requestAnimationFrame(() => {
          isSyncingFromPropsRef.current = false;
        });
      }

      if (initialMissingValueStrategies && Object.keys(initialMissingValueStrategies).length > 0) {
        isSyncingFromPropsRef.current = true;
        setMissingValueStrategies(prev => {
          const merged = { ...prev };
          Object.keys(initialMissingValueStrategies).forEach(fileName => {
            merged[fileName] = {
              ...(merged[fileName] || {}),
              ...initialMissingValueStrategies[fileName],
            };
          });
          // Only return merged if it's actually different from prev
          const prevStr = JSON.stringify(prev);
          const mergedStr = JSON.stringify(merged);
          return prevStr === mergedStr ? prev : merged;
        });
        // Reset flag after state update completes
        requestAnimationFrame(() => {
          isSyncingFromPropsRef.current = false;
        });
      }
    }
  }, [initialDtypeChanges, initialMissingValueStrategies]);

  // Don't clear local changes for saved files - allow showing both badges

  const fetchFileMetadata = async (file: { name: string; path: string; size: number }) => {
    // Skip fetching if path is empty (file was already saved and temp path is gone)
    if (!file.path || file.path === '') {
      console.log('Skipping metadata fetch for', file.name, '- path is empty (using saved metadata)');
      return;
    }
    
    setLoading(prev => ({ ...prev, [file.name]: true }));
    try {
      const response = await fetch(`${UPLOAD_API}/file-metadata`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ file_path: file.path }),
        credentials: 'include',
      });

      if (response.ok) {
        const data = await response.json();
        setFilesMetadata(prev => ({ ...prev, [file.name]: data }));
        
        // Extract datetime formats and detection methods from metadata
        if (data.columns) {
          const formats: Record<string, string> = {};
          const methods: Record<string, 'automatic' | 'manual' | 'none'> = {};
          
          data.columns.forEach((col: ColumnInfo) => {
            // Check if this is a datetime column
            const isDatetime = col.dtype && (
              col.dtype.startsWith('datetime64') || 
              col.dtype === 'datetime64[ns]' ||
              col.dtype.includes('datetime')
            );
            
            if (isDatetime) {
              // If format is provided, use it
              if (col.datetime_format) {
                formats[col.name] = col.datetime_format;
              }
              
              // Set detection method
              if (col.detection_method) {
                methods[col.name] = col.detection_method;
              } else {
                // If column was auto-detected as datetime64 but no detection_method specified,
                // it means automatic detection succeeded but format detection may have failed
                // We'll try manual detection if format is missing
                methods[col.name] = 'automatic';
                
                // If format is missing, trigger manual detection
                if (!col.datetime_format && file.path) {
                  // Trigger format detection asynchronously
                  setTimeout(() => {
                    detectDatetimeFormat(file.name, col.name).then((detectedFormat) => {
                      if (detectedFormat) {
                        // Format was detected via manual detection
                        setFormatDetectionMethods(prev => ({
                          ...prev,
                          [file.name]: {
                            ...(prev[file.name] || {}),
                            [col.name]: 'manual',
                          },
                        }));
                      }
                    }).catch(() => {
                      // Silently fail - format detection will remain as automatic
                    });
                  }, 100);
                }
              }
            }
          });
          
          if (Object.keys(formats).length > 0) {
            setDatetimeFormats(prev => ({
              ...prev,
              [file.name]: { ...(prev[file.name] || {}), ...formats },
            }));
          }
          
          if (Object.keys(methods).length > 0) {
            setFormatDetectionMethods(prev => ({
              ...prev,
              [file.name]: { ...(prev[file.name] || {}), ...methods },
            }));
          }
        }
      } else {
        console.error('Failed to fetch metadata for', file.name);
      }
    } catch (error) {
      console.error('Error fetching metadata:', error);
    } finally {
      setLoading(prev => ({ ...prev, [file.name]: false }));
    }
  };

  // Auto-fetch metadata for all uploaded files immediately after upload
  useEffect(() => {
    uploadedFiles.forEach(file => {
      // Only fetch if we don't have metadata yet and we're not currently loading
      if (!filesMetadata[file.name] && !loading[file.name] && file.path && file.path !== '') {
        fetchFileMetadata(file);
      }
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [uploadedFiles.map(f => f.name).join(',')]);

  const toggleFile = (fileName: string) => {
    setOpenFiles(prev => {
      const newSet = new Set(prev);
      if (newSet.has(fileName)) {
        newSet.delete(fileName);
      } else {
        newSet.add(fileName);
        // When validation steps are enabled, always fetch fresh metadata when opening
        const file = uploadedFiles.find(f => f.name === fileName);
        if (file && useMasterFile) {
          // Clear existing metadata to force fresh fetch
          setFilesMetadata(prev => {
            const updated = { ...prev };
            delete updated[fileName];
            return updated;
          });
          // Always fetch fresh metadata when opening configuration (force reload)
          fetchFileMetadata(file);
        } else if (file && !filesMetadata[fileName] && !loading[fileName]) {
          // Only fetch if we don't have metadata yet (when validation steps disabled)
          fetchFileMetadata(file);
        }
      }
      return newSet;
    });
  };

  const detectDatetimeFormat = async (fileName: string, columnName: string) => {
    const file = uploadedFiles.find(f => f.name === fileName);
    
    if (!file) {
      console.log('Skipping datetime format detection for', fileName, '- file not found');
      setFormatDetectionStatus(prev => ({
        ...prev,
        [`${fileName}-${columnName}`]: { detecting: false, failed: true }
      }));
      return null;
    }
    
    // Determine the file path to use
    // Strategy:
    // 1. If filePathMap has a saved (non-temp) path, use it (file was already saved)
    // 2. If filePathMap has a temp path, check if file was saved via API
    // 3. If no saved path found and file.path is temp, use temp path (file not saved yet - this is OK)
    // 4. If file.path is temp but file was saved, find saved path or skip
    
    let filePath = filePathMap?.[fileName];
    const filePathIsTemporary = file.path && (file.path.includes('/tmp/') || file.path.includes('tmp/'));
    const savedPathIsTemporary = filePath && (filePath.includes('/tmp/') || filePath.includes('tmp/'));
    
    // If we have a saved path in filePathMap that's not temporary, use it
    if (filePath && !savedPathIsTemporary) {
      // File was saved, use saved path
      console.log(`✅ Using saved path from filePathMap for ${fileName}: ${filePath}`);
    } 
    // If filePathMap has temp path or no path, but file.path is temp, check if file was actually saved
    else if (filePathIsTemporary) {
      // File path is temporary - check if file was saved
      console.log(`🔍 File ${fileName} has temporary path: ${file.path}, checking if it was saved...`);
      
      // Try to find in saved dataframes via API
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
              const check = await fetch(`${UPLOAD_API}/list_saved_dataframes${query}`);
              if (check.ok) {
                const data = await check.json();
                const fileNameStem = fileName.replace(/\.[^/.]+$/, '').toLowerCase();
                const savedFile = Array.isArray(data.files)
                  ? data.files.find((f: any) => {
                      const savedStem = (f.csv_name || '').toLowerCase().replace(/\.[^/.]+$/, '');
                      return savedStem === fileNameStem;
                    })
                  : null;
                if (savedFile?.object_name) {
                  // File was saved, use saved path
                  filePath = savedFile.object_name;
                  console.log(`📦 Found saved path for datetime detection ${fileName}: ${filePath}`);
                } else {
                  // File not saved yet, use temp path (this is OK before save)
                  filePath = file.path;
                  console.log(`📝 File ${fileName} not saved yet, using temporary path: ${filePath}`);
                }
              } else {
                // API call failed, use temp path as fallback
                filePath = file.path;
                console.log(`⚠️ Failed to check saved dataframes, using temp path: ${filePath}`);
              }
            } else {
              // No env vars, use temp path
              filePath = file.path;
            }
          } catch (err) {
            console.error('❌ Error looking up saved path:', err);
            // On error, use temp path
            filePath = file.path;
          }
        } else {
          // No env vars, use temp path
          filePath = file.path;
        }
      } catch (err) {
        console.error('❌ Error in saved path lookup:', err);
        // On error, use temp path
        filePath = file.path;
      }
    } else {
      // No temp path, use file.path (might be saved path or other valid path)
      filePath = file.path;
    }
    
    // Final validation: only skip if path is empty
    if (!filePath || filePath === '') {
      console.log('❌ Skipping datetime format detection for', fileName, '- path is empty');
      setFormatDetectionStatus(prev => ({
        ...prev,
        [`${fileName}-${columnName}`]: { detecting: false, failed: false }
      }));
      return null;
    }
    
    console.log('Detecting datetime format for', fileName, columnName, 'with path:', filePath);
    
    setFormatDetectionStatus(prev => ({
      ...prev,
      [`${fileName}-${columnName}`]: { detecting: true, failed: false }
    }));
    
    try {
      const response = await fetch(`${UPLOAD_API}/detect-datetime-format`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          file_path: filePath,
          column_name: columnName
        }),
        credentials: 'include',
      });
      
      if (response.ok) {
        const data = await response.json();
        console.log('Datetime format detection result:', data);
        
        setFormatDetectionStatus(prev => ({
          ...prev,
          [`${fileName}-${columnName}`]: { detecting: false, failed: !data.can_detect }
        }));
        
        if (data.can_detect && data.detected_format) {
          const detectionMethod = data.detection_method || 'manual';
          toast({
            title: "Format Detected",
            description: `Auto-detected format: ${data.detected_format}`,
          });
          // Store detection method
          setFormatDetectionMethods(prev => ({
            ...prev,
            [fileName]: {
              ...(prev[fileName] || {}),
              [columnName]: detectionMethod,
            },
          }));
          return data.detected_format;
        } else {
          // Format detection failed - silently enable dropdown (no error message)
          // Don't show toast or set failed status
        }
      } else {
        const errorData = await response.json().catch(() => ({}));
        console.error('Datetime format detection failed:', errorData);
        // Silently fail - don't show error toast
      }
      
      setFormatDetectionStatus(prev => ({
        ...prev,
        [`${fileName}-${columnName}`]: { detecting: false, failed: false }
      }));
      return null;
    } catch (error) {
      console.error('Error detecting datetime format:', error);
      // Silently fail - don't show error toast
      setFormatDetectionStatus(prev => ({
        ...prev,
        [`${fileName}-${columnName}`]: { detecting: false, failed: false }
      }));
      return null;
    }
  };

  const handleDtypeChange = async (fileName: string, columnName: string, newDtype: string) => {
    if (newDtype === 'datetime64') {
      // Check if column was already datetime64 (automatic detection)
      const file = uploadedFiles.find(f => f.name === fileName);
      const metadata = filesMetadata[fileName];
      const column = metadata?.columns?.find((col: ColumnInfo) => col.name === columnName);
      const wasAutoDetected = column?.dtype && (
        column.dtype.startsWith('datetime64') || 
        column.dtype === 'datetime64[ns]' ||
        column.dtype.includes('datetime')
      );
      
      // If column was auto-detected and already has format, use it
      if (wasAutoDetected && column?.datetime_format) {
        setDtypeChanges(prev => ({
          ...prev,
          [fileName]: {
            ...(prev[fileName] || {}),
            [columnName]: { dtype: 'datetime64', format: column.datetime_format },
          },
        }));
        setDatetimeFormats(prev => ({
          ...prev,
          [fileName]: {
            ...(prev[fileName] || {}),
            [columnName]: column.datetime_format,
          },
        }));
        // Set detection method from metadata
        if (column.detection_method) {
          setFormatDetectionMethods(prev => ({
            ...prev,
            [fileName]: {
              ...(prev[fileName] || {}),
              [columnName]: column.detection_method,
            },
          }));
        }
      } else {
        // Auto-detect format when datetime is selected (manual detection)
        const detectedFormat = await detectDatetimeFormat(fileName, columnName);
        
        if (detectedFormat) {
          // Format detected successfully via manual detection
          setDtypeChanges(prev => ({
            ...prev,
            [fileName]: {
              ...(prev[fileName] || {}),
              [columnName]: { dtype: 'datetime64', format: detectedFormat },
            },
          }));
          setDatetimeFormats(prev => ({
            ...prev,
            [fileName]: {
              ...(prev[fileName] || {}),
              [columnName]: detectedFormat,
            },
          }));
          // Detection method is already set in detectDatetimeFormat
        } else {
          // Format detection failed - user needs to provide format
          setDtypeChanges(prev => ({
            ...prev,
            [fileName]: {
              ...(prev[fileName] || {}),
              [columnName]: 'datetime64',
            },
          }));
          // Set detection method to none if format detection failed
          setFormatDetectionMethods(prev => ({
            ...prev,
            [fileName]: {
              ...(prev[fileName] || {}),
              [columnName]: 'none',
            },
          }));
        }
      }
    } else {
      // Non-datetime dtype change
      console.log(`🔧 FileDataPreview - Setting dtype change: ${fileName}.${columnName} = ${newDtype}`);
      setDtypeChanges(prev => {
        const updated = {
          ...prev,
          [fileName]: {
            ...(prev[fileName] || {}),
            [columnName]: newDtype,
          },
        };
        console.log('🔧 FileDataPreview - Updated dtypeChanges:', updated);
        return updated;
      });
    }
  };
  
  const handleDatetimeFormatChange = (fileName: string, columnName: string, format: string) => {
    setDatetimeFormats(prev => ({
      ...prev,
      [fileName]: {
        ...(prev[fileName] || {}),
        [columnName]: format,
      },
    }));
    
    // Update dtypeChanges with the format
    setDtypeChanges(prev => ({
      ...prev,
      [fileName]: {
        ...(prev[fileName] || {}),
        [columnName]: { dtype: 'datetime64', format },
      },
    }));
  };

  const handleMissingValueStrategyChange = (
    fileName: string,
    columnName: string,
    strategy: string
  ) => {
    setMissingValueStrategies(prev => ({
      ...prev,
      [fileName]: {
        ...(prev[fileName] || {}),
        [columnName]: { strategy },
      },
    }));
  };

  const handleMissingValueCustomChange = (
    fileName: string,
    columnName: string,
    value: string
  ) => {
    setMissingValueStrategies(prev => ({
      ...prev,
      [fileName]: {
        ...(prev[fileName] || {}),
        [columnName]: {
          ...(prev[fileName]?.[columnName] || { strategy: 'custom' }),
          value,
        },
      },
    }));
  };


  const getDtypeOptions = (currentDtype: string, suggestedTypes?: string[]) => {
    const baseOptions = [
      { value: 'object', label: 'Object' },
      { value: 'int64', label: 'Integer' },
      { value: 'float64', label: 'Float' },
      { value: 'datetime64', label: 'DateTime' },
      { value: 'bool', label: 'Boolean' },
    ];
    
    // Create a map for quick lookup
    const optionMap = new Map(baseOptions.map(opt => [opt.value, opt]));
    
    // Normalize datetime64 variants to 'datetime64' for matching
    const normalizeDtype = (dtype: string): string => {
      const lower = dtype.toLowerCase();
      if (lower.includes('datetime64') || lower.includes('datetime')) {
        return 'datetime64';
      }
      return lower;
    };
    
    // Build suggested options first (if provided)
    // Filter out datetime64 variants from suggested types - they should only appear as 'datetime64'
    const suggestedOptions: Array<{ value: string; label: string; isSuggested: boolean }> = [];
    if (suggestedTypes && suggestedTypes.length > 0) {
      suggestedTypes.forEach(dtype => {
        // Skip datetime64 variants - they should only appear as 'datetime64'
        if (dtype && (dtype.toLowerCase().includes('datetime64') || dtype.toLowerCase().includes('datetime'))) {
          // Map datetime variants to 'datetime64'
          if (optionMap.has('datetime64')) {
            suggestedOptions.push({ ...optionMap.get('datetime64')!, isSuggested: true });
          }
        } else {
          const normalizedDtype = normalizeDtype(dtype);
          if (optionMap.has(normalizedDtype)) {
            suggestedOptions.push({ ...optionMap.get(normalizedDtype)!, isSuggested: true });
          } else {
            // Only add non-datetime types that aren't in base options
            suggestedOptions.push({ value: dtype, label: dtype, isSuggested: true });
          }
        }
      });
    }
    
    // Remove duplicates from suggestedOptions (in case datetime64 appears multiple times)
    const seenValues = new Set<string>();
    const uniqueSuggestedOptions = suggestedOptions.filter(opt => {
      const normalized = normalizeDtype(opt.value);
      if (seenValues.has(normalized)) {
        return false;
      }
      seenValues.add(normalized);
      return true;
    });
    
    // Add remaining base options (excluding already suggested ones)
    const suggestedValues = new Set(uniqueSuggestedOptions.map(opt => normalizeDtype(opt.value)));
    const remainingOptions: Array<{ value: string; label: string; isSuggested: boolean }> = baseOptions
      .filter(opt => !suggestedValues.has(normalizeDtype(opt.value)))
      .map(opt => ({ ...opt, isSuggested: false }));
    
    // Normalize currentDtype - if it's a datetime variant, map it to 'datetime64'
    const normalizedCurrentDtype = normalizeDtype(currentDtype);
    const currentDtypeExists = uniqueSuggestedOptions.some(opt => normalizeDtype(opt.value) === normalizedCurrentDtype) ||
                               remainingOptions.some(opt => normalizeDtype(opt.value) === normalizedCurrentDtype);
    
    // Don't add datetime64 variants to the dropdown - they should only appear as 'datetime64'
    // Only add non-datetime types that aren't already in the list
    if (!currentDtypeExists && currentDtype && !currentDtype.toLowerCase().includes('datetime')) {
      remainingOptions.unshift({ value: currentDtype, label: currentDtype, isSuggested: false });
    }
    
    // Combine: suggested first, then remaining
    return [...uniqueSuggestedOptions, ...remainingOptions];
  };

  const getMissingValueOptions = (dtype: string) => {
    const commonOptions = [
      { value: 'none', label: 'Keep as Missing' },
      { value: 'drop', label: 'Drop Rows' },
      { value: 'custom', label: 'Custom Value' },
    ];

    if (dtype.includes('int') || dtype.includes('float')) {
      return [
        ...commonOptions,
        { value: 'mean', label: 'Fill with Mean' },
        { value: 'median', label: 'Fill with Median' },
        { value: 'zero', label: 'Fill with 0' },
      ];
    } else if (dtype.includes('str') || dtype === 'object') {
      return [
        ...commonOptions,
        { value: 'mode', label: 'Fill with Mode' },
        { value: 'empty', label: 'Fill with Empty String' },
      ];
    }
    return commonOptions;
  };

  const getDtypeBadgeColor = (dtype: string) => {
    if (dtype.includes('int') || dtype.includes('float')) return 'bg-blue-100 text-blue-800';
    if (dtype.includes('str') || dtype === 'object') return 'bg-green-100 text-green-800';
    if (dtype.includes('datetime')) return 'bg-purple-100 text-purple-800';
    if (dtype.includes('bool')) return 'bg-orange-100 text-orange-800';
    return 'bg-gray-100 text-gray-800';
  };

  if (uploadedFiles.length === 0) return null;

  return (
    <div className="space-y-3 mt-4">
      {uploadedFiles.map(file => {
        const metadata = filesMetadata[file.name];
        const isOpen = openFiles.has(file.name);
        const isLoading = loading[file.name];
        const hasChanges = (dtypeChanges[file.name] && Object.keys(dtypeChanges[file.name]).length > 0) ||
          (missingValueStrategies[file.name] && Object.keys(missingValueStrategies[file.name]).length > 0);
        const hasAppliedChanges = filesWithAppliedChanges.has(file.name);

        return (
          <Card key={file.name} className="border border-blue-100 hover:border-blue-300 transition-all duration-200 overflow-hidden relative">
            <Collapsible open={useMasterFile ? isOpen : false} onOpenChange={useMasterFile ? () => toggleFile(file.name) : undefined}>
              <div className="relative">
                {onDeleteFile && (
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      onDeleteFile(file.name);
                    }}
                    className="absolute top-2 right-2 z-10 p-1 rounded-md hover:bg-red-50 transition-colors group"
                    title="Delete file"
                  >
                    <Trash2 className="w-3.5 h-3.5 text-gray-400 group-hover:text-red-600" />
                  </button>
                )}
                
                <CollapsibleTrigger className="w-full" disabled={!useMasterFile}>
                  <div className={`flex items-center justify-between p-2 pr-10 transition-colors ${useMasterFile ? 'hover:bg-blue-50 cursor-pointer' : 'cursor-default'}`}>
                    <div className="flex items-center space-x-2 flex-1 min-w-0">
                      {useMasterFile && (isOpen ? (
                        <ChevronDown className="w-4 h-4 text-blue-600 flex-shrink-0" />
                      ) : (
                        <ChevronRight className="w-4 h-4 text-gray-400 flex-shrink-0" />
                      ))}
                      <div className="text-left flex-1 min-w-0">
                        <p className="font-medium text-sm text-gray-900">
                          <TruncatedFileName fileName={file.name} />
                        </p>
                        {metadata && (
                          <div className="flex items-center gap-2 mt-0.5 flex-wrap">
                            <p className="text-xs text-gray-500">
                              {metadata.total_rows} rows × {metadata.total_columns} columns
                            </p>
                          </div>
                        )}
                      </div>
                    </div>
                    <div className="flex items-center space-x-2 flex-shrink-0">
                      {/* {hasAppliedChanges && (
                        <Badge className="bg-green-100 text-green-800 border-green-300 text-xs px-2 py-0.5">
                          <Check className="w-3 h-3 mr-1" />
                          Changes Applied
                        </Badge>
                      )} */}
                      {useMasterFile && (
                        <Select
                          value={fileAssignments[file.name] || ''}
                          onValueChange={(val) => onAssignmentChange?.(file.name, val)}
                        >
                          <SelectTrigger className="w-32 h-7 text-xs">
                            <SelectValue placeholder="Select file type" />
                          </SelectTrigger>
                          <SelectContent>
                            {requiredOptions.map(opt => (
                              <SelectItem key={opt} value={opt}>{opt}</SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      )}
                      {isLoading && (
                        <RefreshCw className="w-4 h-4 text-blue-500 animate-spin" />
                      )}
                    </div>
                  </div>
                </CollapsibleTrigger>
              </div>

              {/* Validation Report - Only show when validation is enabled */}
            {useMasterFile && (
              <div className="px-3 py-2 bg-blue-50 border-b border-blue-100">
                {/* <label className="text-xs font-medium text-gray-700 block mb-2">
                  Assign to Master File:
                </label> */}
                {validationResults[file.name] ? (
                  <div className="mt-2">
                    <p
                      className={`text-xs font-semibold mb-2 ${
                        validationResults[file.name].toLowerCase().includes('success')
                          ? 'text-green-600'
                          : 'text-red-600'
                      }`}
                    >
                      {validationResults[file.name]}
                    </p>
                    {validationResults[file.name].toLowerCase().includes('failure') && (
                      <div className="space-y-2">
                        {validationDetails[file.name] && validationDetails[file.name].length > 0 && (
                          <div className="space-y-1">
                            <p className="text-xs font-medium text-gray-700">Validation Failures:</p>
                            {validationDetails[file.name]
                              .filter((detail: any) => detail.status === 'Failed')
                              .map((detail: any, idx: number) => (
                                <div key={idx} className="text-xs text-red-700 bg-red-50 border border-red-200 rounded p-2">
                                  <div className="font-medium">
                                    {detail.name} - Column: {detail.column || 'N/A'}
                                  </div>
                                  {detail.errorMessage && (
                                    <div className="mt-1 text-red-600">
                                      <strong>Error:</strong> {detail.errorMessage}
                                    </div>
                                  )}
                                  {detail.desc && (
                                    <div className="mt-1 text-gray-600">
                                      <strong>Expected:</strong> {detail.desc}
                                    </div>
                                  )}
                                </div>
                              ))}
                          </div>
                        )}
                        {/* {dtypeChanges[file.name] && Object.keys(dtypeChanges[file.name]).length > 0 && (
                          <div className="mt-2">
                            <p className="text-xs font-medium text-gray-700 mb-1">Required Data Type:</p>
                            <div className="space-y-1">
                              {Object.entries(dtypeChanges[file.name]).map(([columnName, dtype]) => {
                                const dtypeStr = typeof dtype === 'string' ? dtype : (typeof dtype === 'object' && dtype !== null && 'dtype' in dtype ? (dtype as { dtype: string }).dtype : String(dtype));
                                return (
                                  <div key={columnName} className="text-xs text-blue-700 bg-blue-50 border border-blue-200 rounded p-2">
                                    <span className="font-medium">{columnName}:</span> Should be <span className="font-semibold">{dtypeStr}</span>
                                  </div>
                                );
                              })}
                            </div>
                          </div>
                        )} */}
                      </div>
                    )}
                  </div>
                ) : (
                  <p className="text-xs text-gray-500 mt-1">Click "Validate Files" to see validation report</p>
                )}
              </div>
            )}

              {!useMasterFile && (
                <CollapsibleContent>
                 {metadata ? (
                   <div className="border-t border-blue-100 bg-gradient-to-br from-white to-blue-50/30">
                     <div className="p-2 max-h-64 overflow-y-auto scrollbar-thin scrollbar-thumb-blue-300">
                       {/* Table Header */}
                       <div className="bg-white rounded-lg border border-gray-200 overflow-hidden">
                         <div className="overflow-x-auto">
                           <table className="w-full">
                             <thead className="bg-gradient-to-r from-blue-50 to-blue-100">
                               <tr>
                                 <th className="px-2 py-1.5 text-left text-xs font-semibold text-gray-700 border-b border-gray-200">
                                   Column Name
                                 </th>
                                 <th className="px-2 py-1.5 text-left text-xs font-semibold text-gray-700 border-b border-gray-200">
                                   Current Type
                                 </th>
                                 <th className="px-2 py-1.5 text-left text-xs font-semibold text-gray-700 border-b border-gray-200">
                                   Change Type
                                 </th>
                                 <th className="px-2 py-1.5 text-left text-xs font-semibold text-gray-700 border-b border-gray-200">
                                   Missing Values
                                 </th>
                                 <th className="px-2 py-1.5 text-left text-xs font-semibold text-gray-700 border-b border-gray-200">
                                   Replace Option
                                 </th>
                               </tr>
                             </thead>
                             <tbody className="divide-y divide-gray-100">
                               {metadata.columns.map((column, idx) => {
                                 const dtypeChange = dtypeChanges[file.name]?.[column.name];
                                 const currentDtype = typeof dtypeChange === 'object' ? dtypeChange.dtype : (dtypeChange || column.dtype);
                                 const missingStrategy = missingValueStrategies[file.name]?.[column.name];
                                 const hasMissingValues = column.missing_count > 0;

                                 return (
                                   <tr key={idx} style={{ minHeight: currentDtype === 'datetime64' ? 'auto' : 'auto' }}>
                                     {/* Column Name */}
                                     <td className="px-2 py-1.5">
                                       <div>
                                         <p className="font-medium text-gray-900 text-xs">{column.name}</p>
                                         <p className="text-xs text-gray-500 mt-0.5">
                                           {column.sample_values.slice(0, 2).join(', ')}
                                           {column.sample_values.length > 2 && '...'}
                                         </p>
                                       </div>
                                     </td>

                                     {/* Current Type */}
                                     <td className="px-2 py-1.5">
                                       <div className="flex items-center gap-1 flex-wrap">
                                         <Badge className={getDtypeBadgeColor(column.original_dtype || column.dtype) + " text-xs px-2 py-0.5"}>
                                           {column.original_dtype || column.dtype}
                                         </Badge>
                                         {column.modified_dtype && column.modified_dtype !== column.original_dtype && (
                                           <Badge className="bg-yellow-100 text-yellow-800 border-yellow-300 text-xs px-1.5 py-0.5" title={`Modified to: ${column.modified_dtype}`}>
                                             Modified
                                           </Badge>
                                         )}
                                       </div>
                                     </td>

                                     {/* Change Type */}
                                     <td className="px-2 py-1.5 align-top">
                                       <div className="space-y-0.5">
                                         <div 
                                           className="relative inline-block w-full" 
                                           onClick={(e) => e.stopPropagation()}
                                         >
                                           <select
                                             value={(() => {
                                               const dtype = typeof currentDtype === 'string' ? currentDtype : (typeof currentDtype === 'object' && currentDtype !== null ? currentDtype.dtype : column.dtype);
                                               // Normalize datetime64 variants to 'datetime64' for display
                                               if (dtype && (dtype.toLowerCase().includes('datetime64') || dtype.toLowerCase().includes('datetime'))) {
                                                 return 'datetime64';
                                               }
                                               return dtype;
                                             })()}
                                             onChange={(e) => {
                                               e.stopPropagation();
                                               const newDtype = e.target.value;
                                               handleDtypeChange(file.name, column.name, newDtype);
                                               // Clear format if changing away from datetime64
                                               if (newDtype !== 'datetime64') {
                                                 handleDatetimeFormatChange(file.name, column.name, '');
                                               }
                                             }}
                                             onClick={(e) => e.stopPropagation()}
                                             onMouseDown={(e) => e.stopPropagation()}
                                             className="w-full h-7 px-2 py-0 text-xs rounded border border-gray-300 bg-white focus:outline-none focus:ring-1 focus:ring-[#458EE2] focus:border-[#458EE2] cursor-pointer appearance-none text-gray-900"
                                             style={{
                                               backgroundImage: `url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' fill='none' viewBox='0 0 20 20'%3E%3Cpath stroke='%236b7280' stroke-linecap='round' stroke-linejoin='round' stroke-width='1.5' d='M6 8l4 4 4-4'/%3E%3C/svg%3E")`,
                                               backgroundSize: '1em 1em',
                                               backgroundPosition: 'right 0.5rem center',
                                               backgroundRepeat: 'no-repeat',
                                               paddingRight: '2rem'
                                             }}
                                           >
                                             {getDtypeOptions(column.dtype, column.suggested_types).map((opt) => (
                                               <option key={opt.value} value={opt.value}>
                                                 {opt.isSuggested ? `✨ ${opt.label}` : opt.label}
                                               </option>
                                             ))}
                                           </select>
                                         </div>
                                         
                                         {/* DateTime Format Dropdown - Only show when datetime64 is explicitly selected */}
                                         {(() => {
                                           const rawDtype = typeof currentDtype === 'string' ? currentDtype : (typeof currentDtype === 'object' && currentDtype !== null ? currentDtype.dtype : column.dtype);
                                           // Normalize datetime64 variants to 'datetime64' for checking
                                           const selectedDtype = rawDtype && (rawDtype.toLowerCase().includes('datetime64') || rawDtype.toLowerCase().includes('datetime')) 
                                             ? 'datetime64' 
                                             : rawDtype;
                                           const isDateTime = selectedDtype === 'datetime64';
                                           
                                           if (!isDateTime) return null;
                                           
                                           const formatKey = `${file.name}-${column.name}`;
                                           const isDetecting = formatDetectionStatus[formatKey]?.detecting;
                                           // Get format from state or from column metadata
                                           const currentFormat = datetimeFormats[file.name]?.[column.name] || 
                                                                 (column as ColumnInfo).datetime_format || 
                                                                 '';
                                           // Get detection method from state or from column metadata
                                           const detectionMethod = formatDetectionMethods[file.name]?.[column.name] || 
                                                                   (column as ColumnInfo).detection_method || 
                                                                   (currentFormat ? 'manual' : 'none');
                                           
                                           return (
                                             <div className="space-y-0.5 mt-0.5">
                                               {isDetecting && (
                                                 <div className="flex items-center space-x-1 text-[9px] text-blue-600">
                                                   <RefreshCw className="w-2 h-2 animate-spin" />
                                                   <span>Detecting...</span>
                                                 </div>
                                               )}
                                               <div className="flex items-center space-x-0.5">
                                                 <select
                                                   value={currentFormat || ''}
                                                   onChange={(e) => {
                                                     e.stopPropagation();
                                                     handleDatetimeFormatChange(file.name, column.name, e.target.value);
                                                   }}
                                                   onClick={(e) => e.stopPropagation()}
                                                   onMouseDown={(e) => e.stopPropagation()}
                                                   disabled={isDetecting}
                                                   className="flex-1 h-4 px-0.5 py-0 text-[9px] rounded border border-gray-300 bg-white focus:outline-none focus:ring-1 focus:ring-[#458EE2] focus:border-[#458EE2] cursor-pointer appearance-none text-gray-900 disabled:bg-gray-100 disabled:cursor-not-allowed"
                                                   style={{
                                                     backgroundImage: `url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' fill='none' viewBox='0 0 20 20'%3E%3Cpath stroke='%236b7280' stroke-linecap='round' stroke-linejoin='round' stroke-width='1.5' d='M6 8l4 4 4-4'/%3E%3C/svg%3E")`,
                                                     backgroundSize: '0.75em 0.75em',
                                                     backgroundPosition: 'right 0.15rem center',
                                                     backgroundRepeat: 'no-repeat',
                                                     paddingRight: '1rem'
                                                   }}
                                                 >
                                                   <option value="">Select format...</option>
                                                   {DATETIME_FORMAT_OPTIONS.map(format => (
                                                     <option key={format.value} value={format.value}>
                                                       {formatLabelWithExample(format)}
                                                     </option>
                                                   ))}
                                                 </select>
                                                 {currentFormat && !isDetecting && (
                                                   <div 
                                                     className={`w-1.5 h-1.5 rounded-full flex-shrink-0 ${
                                                       detectionMethod === 'manual' ? 'bg-green-500' : 
                                                       detectionMethod === 'automatic' ? 'bg-red-500' : 
                                                       'bg-gray-400'
                                                     }`}
                                                     title={
                                                       detectionMethod === 'manual' ? 'Format detected via manual logic' :
                                                       detectionMethod === 'automatic' ? 'Format detected automatically' :
                                                       'Format not detected'
                                                     }
                                                   />
                                                 )}
                                                 {currentFormat && !isDetecting && (
                                                   <button
                                                     type="button"
                                                     onClick={(e) => {
                                                       e.stopPropagation();
                                                       handleDatetimeFormatChange(file.name, column.name, '');
                                                     }}
                                                     className="flex-shrink-0 p-0.5 hover:bg-gray-100 rounded text-gray-500 hover:text-gray-700"
                                                     title="Clear format"
                                                   >
                                                     <X className="w-2 h-2" />
                                                   </button>
                                                 )}
                                               </div>
                                               {currentFormat && !isDetecting && (
                                                 <div className="text-[8px] text-gray-500 truncate flex items-center gap-1">
                                                   <span>{currentFormat}</span>
                                                   <div 
                                                     className={`w-1.5 h-1.5 rounded-full flex-shrink-0 ${
                                                       detectionMethod === 'manual' ? 'bg-green-500' : 
                                                       detectionMethod === 'automatic' ? 'bg-red-500' : 
                                                       'bg-gray-400'
                                                     }`}
                                                     title={
                                                       detectionMethod === 'manual' ? 'Format detected via manual logic' :
                                                       detectionMethod === 'automatic' ? 'Format detected automatically' :
                                                       'Format not detected'
                                                     }
                                                   />
                                                 </div>
                                               )}
                                             </div>
                                           );
                                         })()}
                                       </div>
                                     </td>

                                     {/* Missing Values */}
                                     <td className="px-2 py-1.5">
                                       {hasMissingValues ? (
                                         <div className="flex items-center space-x-1.5">
                                           <Badge variant="outline" className="text-red-600 border-red-300 text-xs px-2 py-0.5">
                                             {column.missing_count}
                                           </Badge>
                                           <span className="text-xs text-gray-500">
                                             ({column.missing_percentage.toFixed(1)}%)
                                           </span>
                                         </div>
                                       ) : (
                                         <span className="text-xs text-gray-500">None</span>
                                       )}
                                     </td>

                                     {/* Replace Option */}
                                     <td className="px-2 py-1.5">
                                       {hasMissingValues ? (
                                         <div className="space-y-1.5">
                                           <Select
                                             value={missingStrategy?.strategy || 'none'}
                                             onValueChange={(val) =>
                                               handleMissingValueStrategyChange(file.name, column.name, val)
                                             }
                                           >
                                             <SelectTrigger className="w-full h-7 text-xs">
                                               <SelectValue />
                                             </SelectTrigger>
                                             <SelectContent>
                                               {getMissingValueOptions(currentDtype).map(opt => (
                                                 <SelectItem key={opt.value} value={opt.value}>
                                                   {opt.label}
                                                 </SelectItem>
                                               ))}
                                             </SelectContent>
                                           </Select>

                                           {missingStrategy?.strategy === 'custom' && (
                                             <Input
                                               placeholder="Enter value"
                                               value={missingStrategy.value || ''}
                                               onChange={(e) =>
                                                 handleMissingValueCustomChange(
                                                   file.name,
                                                   column.name,
                                                   e.target.value
                                                 )
                                               }
                                               className="h-7 text-xs"
                                             />
                                           )}
                                         </div>
                                       ) : (
                                         <span className="text-xs text-gray-400">N/A</span>
                                       )}
                                     </td>
                                   </tr>
                                 );
                               })}
                             </tbody>
                           </table>
                         </div>
                       </div>
                     </div>

                     {hasChanges && (
                       <div className="border-t border-blue-100 bg-blue-50 p-3">
                         <p className="text-sm text-blue-800 font-medium flex items-center">
                           <AlertCircle className="w-4 h-4 mr-2" />
                           Changes will be applied when you click "Save Data Frame"
                         </p>
                       </div>
                     )}
                   </div>
                ) : (
                  <div className="p-8 text-center text-gray-500">
                    {isLoading ? (
                      <div className="flex items-center justify-center space-x-2">
                        <RefreshCw className="w-5 h-5 animate-spin" />
                        <p>Loading file metadata...</p>
                      </div>
                    ) : (
                      <p>No metadata available</p>
                    )}
                  </div>
                )}
              </CollapsibleContent>
              )}
            </Collapsible>
          </Card>
        );
      })}
    </div>
  );
};

export default FileDataPreview;

