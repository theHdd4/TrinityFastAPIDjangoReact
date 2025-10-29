import React, { useState, useEffect } from 'react';
import { ChevronDown, ChevronRight, Database, AlertCircle, RefreshCw, Check, Trash2 } from 'lucide-react';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible';
import { VALIDATE_API } from '@/lib/api';
import { useToast } from '@/hooks/use-toast';

interface FileMetadata {
  columns: ColumnInfo[];
  total_rows: number;
  total_columns: number;
}

interface ColumnInfo {
  name: string;
  dtype: string;
  missing_count: number;
  missing_percentage: number;
  sample_values: any[];
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
  onMetadataChange
}) => {
  const [filesMetadata, setFilesMetadata] = useState<Record<string, FileMetadata>>(initialFilesMetadata);
  const [openFiles, setOpenFiles] = useState<Set<string>>(new Set());
  const [dtypeChanges, setDtypeChanges] = useState<Record<string, Record<string, string | { dtype: string; format: string }>>>(initialDtypeChanges);
  const [missingValueStrategies, setMissingValueStrategies] = useState<Record<string, Record<string, { strategy: string; value?: string }>>>(initialMissingValueStrategies);
  const [loading, setLoading] = useState<Record<string, boolean>>({});
  const [datetimeFormats, setDatetimeFormats] = useState<Record<string, Record<string, string>>>({});
  const [formatDetectionStatus, setFormatDetectionStatus] = useState<Record<string, { detecting: boolean; failed: boolean }>>({});
  const { toast } = useToast();

  // Notify parent component about changes
  useEffect(() => {
    console.log('📢 FileDataPreview - Notifying parent of changes:', {
      dtypeChanges,
      missingValueStrategies,
    });
    onDataChanges?.({ dtypeChanges, missingValueStrategies });
  }, [dtypeChanges, missingValueStrategies, onDataChanges]);

  // Notify parent component about metadata changes
  useEffect(() => {
    onMetadataChange?.(filesMetadata);
  }, [filesMetadata, onMetadataChange]);

  // Don't clear local changes for saved files - allow showing both badges

  const fetchFileMetadata = async (file: { name: string; path: string; size: number }) => {
    // Skip fetching if path is empty (file was already saved and temp path is gone)
    if (!file.path || file.path === '') {
      console.log('Skipping metadata fetch for', file.name, '- path is empty (using saved metadata)');
      return;
    }
    
    setLoading(prev => ({ ...prev, [file.name]: true }));
    try {
      const response = await fetch(`${VALIDATE_API}/file-metadata`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ file_path: file.path }),
        credentials: 'include',
      });

      if (response.ok) {
        const data = await response.json();
        setFilesMetadata(prev => ({ ...prev, [file.name]: data }));
      } else {
        console.error('Failed to fetch metadata for', file.name);
      }
    } catch (error) {
      console.error('Error fetching metadata:', error);
    } finally {
      setLoading(prev => ({ ...prev, [file.name]: false }));
    }
  };

  const toggleFile = (fileName: string) => {
    setOpenFiles(prev => {
      const newSet = new Set(prev);
      if (newSet.has(fileName)) {
        newSet.delete(fileName);
      } else {
        newSet.add(fileName);
        // Fetch metadata only when user opens the file
        const file = uploadedFiles.find(f => f.name === fileName);
        if (file && !filesMetadata[fileName] && !loading[fileName]) {
          fetchFileMetadata(file);
        }
      }
      return newSet;
    });
  };

  const detectDatetimeFormat = async (fileName: string, columnName: string) => {
    const file = uploadedFiles.find(f => f.name === fileName);
    
    // Skip detection if path is empty (file was already saved and temp path is gone)
    if (!file || !file.path || file.path === '') {
      console.log('Skipping datetime format detection for', fileName, '- path is empty');
      setFormatDetectionStatus(prev => ({
        ...prev,
        [`${fileName}-${columnName}`]: { detecting: false, failed: true }
      }));
      return null;
    }
    
    console.log('Detecting datetime format for', fileName, columnName, 'with path:', file.path);
    
    setFormatDetectionStatus(prev => ({
      ...prev,
      [`${fileName}-${columnName}`]: { detecting: true, failed: false }
    }));
    
    try {
      const response = await fetch(`${VALIDATE_API}/detect-datetime-format`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          file_path: file.path,
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
          toast({
            title: "Format Detected",
            description: `Auto-detected format: ${data.detected_format}`,
          });
          return data.detected_format;
        } else {
          toast({
            title: "Format Detection Failed",
            description: "Please select the format from the dropdown.",
            variant: "destructive",
          });
        }
      } else {
        const errorData = await response.json().catch(() => ({}));
        console.error('Datetime format detection failed:', errorData);
        toast({
          title: "Detection Error",
          description: errorData.detail || "Failed to detect datetime format",
          variant: "destructive",
        });
      }
      
      setFormatDetectionStatus(prev => ({
        ...prev,
        [`${fileName}-${columnName}`]: { detecting: false, failed: true }
      }));
      return null;
    } catch (error) {
      console.error('Error detecting datetime format:', error);
      setFormatDetectionStatus(prev => ({
        ...prev,
        [`${fileName}-${columnName}`]: { detecting: false, failed: true }
      }));
      toast({
        title: "Detection Error",
        description: "Failed to connect to detection service",
        variant: "destructive",
      });
      return null;
    }
  };

  const handleDtypeChange = async (fileName: string, columnName: string, newDtype: string) => {
    if (newDtype === 'datetime64') {
      // Auto-detect format when datetime is selected
      const detectedFormat = await detectDatetimeFormat(fileName, columnName);
      
      if (detectedFormat) {
        // Format detected successfully
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
      } else {
        // Format detection failed - user needs to provide format
        setDtypeChanges(prev => ({
          ...prev,
          [fileName]: {
            ...(prev[fileName] || {}),
            [columnName]: 'datetime64',
          },
        }));
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


  const getDtypeOptions = (currentDtype: string) => {
    const baseOptions = [
      { value: 'object', label: 'Object' },
      { value: 'int64', label: 'Integer' },
      { value: 'float64', label: 'Float' },
      { value: 'datetime64', label: 'DateTime' },
      { value: 'bool', label: 'Boolean' },
    ];
    
    // Add current dtype if it's not already in the list
    const currentDtypeExists = baseOptions.some(opt => opt.value === currentDtype);
    if (!currentDtypeExists && currentDtype) {
      // Format the label nicely
      const label = currentDtype;
      return [{ value: currentDtype, label }, ...baseOptions];
    }
    
    return baseOptions;
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
            <Collapsible open={isOpen} onOpenChange={() => toggleFile(file.name)}>
              <div className="relative">
                <button
                  onClick={(e) => {
                    e.stopPropagation();
                    onDeleteFile?.(file.name);
                  }}
                  className="absolute top-2 right-2 z-10 p-1 rounded-md hover:bg-red-50 transition-colors group"
                  title="Delete file"
                >
                  <Trash2 className="w-3.5 h-3.5 text-gray-400 group-hover:text-red-600" />
                </button>
                
                <CollapsibleTrigger className="w-full">
                  <div className="flex items-center justify-between p-2 pr-10 hover:bg-blue-50 transition-colors">
                    <div className="flex items-center space-x-2 flex-1 min-w-0">
                      {isOpen ? (
                        <ChevronDown className="w-4 h-4 text-blue-600 flex-shrink-0" />
                      ) : (
                        <ChevronRight className="w-4 h-4 text-gray-400 flex-shrink-0" />
                      )}
                      <div className="text-left flex-1 min-w-0">
                        <p className="font-medium text-sm text-gray-900 truncate">{file.name}</p>
                        <div className="flex items-center gap-2 mt-0.5 flex-wrap">
                          <p className="text-xs text-gray-500">
                            {(file.size / 1024 / 1024).toFixed(2)} MB
                          </p>
                          {metadata && (
                            <p className="text-xs text-gray-500">
                              • {metadata.total_rows} rows × {metadata.total_columns} columns
                            </p>
                          )}
                        </div>
                      </div>
                    </div>
                    <div className="flex items-center space-x-2 flex-shrink-0">
                      {hasAppliedChanges && (
                        <Badge className="bg-green-100 text-green-800 border-green-300 text-xs px-2 py-0.5">
                          <Check className="w-3 h-3 mr-1" />
                          Changes Applied
                        </Badge>
                      )}
                      {metadata && metadata.columns.some(col => {
                        // Only show badge if there are unhandled missing values
                        const hasMissingValues = col.missing_count > 0;
                        if (!hasMissingValues) return false;
                        
                        // Check if user has selected a strategy other than 'none' or 'Keep as Missing'
                        const strategy = missingValueStrategies[file.name]?.[col.name]?.strategy;
                        const isUnhandled = !strategy || strategy === 'none';
                        
                        return isUnhandled;
                      }) && (
                        <Badge className="bg-red-100 text-red-800 border-red-300 text-xs px-2 py-0.5">
                          <AlertCircle className="w-3 h-3 mr-1" />
                          Missing Values
                        </Badge>
                      )}
                      {isLoading && (
                        <RefreshCw className="w-4 h-4 text-blue-500 animate-spin" />
                      )}
                    </div>
                  </div>
                </CollapsibleTrigger>
              </div>

              {/* Master File Assignment - Only show when validation is enabled */}
            {useMasterFile && (
              <div className="px-3 py-2 bg-blue-50 border-b border-blue-100">
                <div className="flex items-center justify-between">
                  <label className="text-xs font-medium text-gray-700">
                    Assign to Master File:
                  </label>
                  <Select
                    value={fileAssignments[file.name] || ''}
                    onValueChange={(val) => onAssignmentChange?.(file.name, val)}
                  >
                    <SelectTrigger className="w-40 h-7 text-xs">
                      <SelectValue placeholder="Select file type" />
                    </SelectTrigger>
                    <SelectContent>
                      {requiredOptions.map(opt => (
                        <SelectItem key={opt} value={opt}>{opt}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              </div>
            )}

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
                                   <tr key={idx}>
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
                                       <Badge className={getDtypeBadgeColor(column.dtype) + " text-xs px-2 py-0.5"}>
                                         {column.dtype}
                                       </Badge>
                                     </td>

                                     {/* Change Type */}
                                     <td className="px-2 py-1.5">
                                       <div className="space-y-1">
                                         <Select
                                           value={currentDtype}
                                           onValueChange={(val) => handleDtypeChange(file.name, column.name, val)}
                                         >
                                           <SelectTrigger className="w-full h-7 text-xs">
                                             <SelectValue />
                                           </SelectTrigger>
                                           <SelectContent>
                                             {getDtypeOptions(column.dtype).map(opt => (
                                               <SelectItem key={opt.value} value={opt.value}>
                                                 {opt.label}
                                               </SelectItem>
                                             ))}
                                           </SelectContent>
                                         </Select>
                                         
                                         {/* DateTime Format Dropdown - Only show for datetime64 */}
                                         {currentDtype === 'datetime64' && (
                                           <div className="space-y-1">
                                             {(() => {
                                               const formatKey = `${file.name}-${column.name}`;
                                               const isDetecting = formatDetectionStatus[formatKey]?.detecting;
                                               const detectionFailed = formatDetectionStatus[formatKey]?.failed;
                                               const currentFormat = datetimeFormats[file.name]?.[column.name];
                                               
                                               const formatOptions = [
                                                 { value: '%Y-%m-%d', label: '%Y-%m-%d (2024-12-31)' },
                                                 { value: '%d/%m/%Y', label: '%d/%m/%Y (31/12/2024)' },
                                                 { value: '%m/%d/%Y', label: '%m/%d/%Y (12/31/2024)' },
                                                 { value: '%d-%m-%Y', label: '%d-%m-%Y (31-12-2024)' },
                                                 { value: '%m-%d-%Y', label: '%m-%d-%Y (12-31-2024)' },
                                                 { value: '%Y/%m/%d', label: '%Y/%m/%d (2024/12/31)' },
                                                 { value: '%d/%m/%y', label: '%d/%m/%y (31/12/24)' },
                                                 { value: '%m/%d/%y', label: '%m/%d/%y (12/31/24)' },
                                                 { value: '%Y-%m-%d %H:%M:%S', label: '%Y-%m-%d %H:%M:%S (2024-12-31 23:59:59)' },
                                                 { value: '%d/%m/%Y %H:%M:%S', label: '%d/%m/%Y %H:%M:%S (31/12/2024 23:59:59)' },
                                                 { value: '%m/%d/%Y %H:%M:%S', label: '%m/%d/%Y %H:%M:%S (12/31/2024 23:59:59)' },
                                                 { value: '%Y-%m-%dT%H:%M:%S', label: '%Y-%m-%dT%H:%M:%S (ISO 8601)' },
                                               ];
                                               
                                               return (
                                                 <div className="space-y-1">
                                                   {/* Show sample values */}
                                                   {/* {column.sample_values && column.sample_values.length > 0 && (
                                                     <div className="text-xs text-gray-600 bg-gray-50 px-2 py-1 rounded">
                                                       <span className="font-medium">Sample: </span>
                                                       <span className="font-mono">{column.sample_values.slice(0, 2).join(', ')}</span>
                                                     </div>
                                                   )} */}
                                                   
                                                   {isDetecting && (
                                                     <div className="flex items-center space-x-1 text-xs text-blue-600">
                                                       <RefreshCw className="w-3 h-3 animate-spin" />
                                                       <span>Detecting format...</span>
                                                     </div>
                                                   )}
                                                   
                                                   {detectionFailed && !currentFormat && (
                                                     <div className="text-xs text-orange-600">
                                                       Format detection failed. Please select:
                                                     </div>
                                                   )}
                                                   
                                                   <Select
                                                     value={currentFormat || ''}
                                                     onValueChange={(val) => handleDatetimeFormatChange(file.name, column.name, val)}
                                                     disabled={currentFormat && !detectionFailed}
                                                   >
                                                     <SelectTrigger className="w-full h-6 text-xs">
                                                       <SelectValue placeholder="Select format" />
                                                     </SelectTrigger>
                                                     <SelectContent>
                                                       {formatOptions.map(opt => (
                                                         <SelectItem key={opt.value} value={opt.value}>
                                                           {opt.label}
                                                         </SelectItem>
                                                       ))}
                                                     </SelectContent>
                                                   </Select>
                                                   
                                                   {/* {currentFormat && !isDetecting && (
                                                     <div className="text-xs text-green-600 flex items-center space-x-1">
                                                       <Check className="w-3 h-3" />
                                                       <span>Format: {currentFormat}</span>
                                                     </div>
                                                   )} */}
                                                 </div>
                                               );
                                             })()}
                                           </div>
                                         )}
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
            </Collapsible>
          </Card>
        );
      })}
    </div>
  );
};

export default FileDataPreview;

