import React, { useState, useEffect } from 'react';
import { ChevronDown, ChevronRight, Database, AlertCircle, RefreshCw, Check } from 'lucide-react';
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
    dtypeChanges: Record<string, Record<string, string>>;
    missingValueStrategies: Record<string, Record<string, { strategy: string; value?: string }>>;
  }) => void;
}

const FileDataPreview: React.FC<FileDataPreviewProps> = ({ uploadedFiles, onDataChanges }) => {
  const [filesMetadata, setFilesMetadata] = useState<Record<string, FileMetadata>>({});
  const [openFiles, setOpenFiles] = useState<Set<string>>(new Set());
  const [dtypeChanges, setDtypeChanges] = useState<Record<string, Record<string, string>>>({});
  const [missingValueStrategies, setMissingValueStrategies] = useState<Record<string, Record<string, { strategy: string; value?: string }>>>({});
  const [loading, setLoading] = useState<Record<string, boolean>>({});
  const { toast } = useToast();

  // Notify parent component about changes
  useEffect(() => {
    onDataChanges?.({ dtypeChanges, missingValueStrategies });
  }, [dtypeChanges, missingValueStrategies, onDataChanges]);

  // Fetch metadata for all uploaded files
  useEffect(() => {
    uploadedFiles.forEach(file => {
      if (!filesMetadata[file.name] && !loading[file.name]) {
        fetchFileMetadata(file);
      }
    });
  }, [uploadedFiles]);

  const fetchFileMetadata = async (file: { name: string; path: string; size: number }) => {
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
      }
      return newSet;
    });
  };

  const handleDtypeChange = (fileName: string, columnName: string, newDtype: string) => {
    setDtypeChanges(prev => ({
      ...prev,
      [fileName]: {
        ...(prev[fileName] || {}),
        [columnName]: newDtype,
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
    const options = [
      { value: 'string', label: 'String' },
      { value: 'int64', label: 'Integer' },
      { value: 'float64', label: 'Float' },
      { value: 'datetime64', label: 'DateTime' },
      { value: 'bool', label: 'Boolean' },
    ];
    return options;
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
    <div className="space-y-4 mt-4">
      <div className="flex items-center space-x-2 mb-2">
        <Database className="w-5 h-5 text-blue-600" />
        <h3 className="text-lg font-semibold text-gray-900">Data Preview & Configuration</h3>
      </div>

      {uploadedFiles.map(file => {
        const metadata = filesMetadata[file.name];
        const isOpen = openFiles.has(file.name);
        const isLoading = loading[file.name];
        const hasChanges = (dtypeChanges[file.name] && Object.keys(dtypeChanges[file.name]).length > 0) ||
          (missingValueStrategies[file.name] && Object.keys(missingValueStrategies[file.name]).length > 0);

        return (
          <Card key={file.name} className="border-2 border-blue-100 hover:border-blue-300 transition-all duration-200 overflow-hidden">
            <Collapsible open={isOpen} onOpenChange={() => toggleFile(file.name)}>
              <CollapsibleTrigger className="w-full">
                <div className="flex items-center justify-between p-4 hover:bg-blue-50 transition-colors">
                  <div className="flex items-center space-x-3">
                    {isOpen ? (
                      <ChevronDown className="w-5 h-5 text-blue-600" />
                    ) : (
                      <ChevronRight className="w-5 h-5 text-gray-400" />
                    )}
                    <div className="text-left">
                      <p className="font-medium text-gray-900">{file.name}</p>
                      {metadata && (
                        <p className="text-xs text-gray-500">
                          {metadata.total_rows} rows × {metadata.total_columns} columns
                        </p>
                      )}
                    </div>
                  </div>
                  {metadata && (
                    <div className="flex items-center space-x-2">
                      {hasChanges && (
                        <Badge className="bg-orange-100 text-orange-800 border-orange-300">
                          Pending Changes
                        </Badge>
                      )}
                      {metadata.columns.some(col => col.missing_count > 0) && (
                        <Badge className="bg-red-100 text-red-800 border-red-300">
                          <AlertCircle className="w-3 h-3 mr-1" />
                          Missing Values
                        </Badge>
                      )}
                    </div>
                  )}
                  {isLoading && (
                    <RefreshCw className="w-5 h-5 text-blue-500 animate-spin" />
                  )}
                </div>
              </CollapsibleTrigger>

              <CollapsibleContent>
                 {metadata ? (
                   <div className="border-t border-blue-100 bg-gradient-to-br from-white to-blue-50/30">
                     <div className="p-4 max-h-96 overflow-y-auto scrollbar-thin scrollbar-thumb-blue-300">
                       <div className="grid grid-cols-1 lg:grid-cols-2 gap-3">
                       {metadata.columns.map((column, idx) => {
                        const currentDtype = dtypeChanges[file.name]?.[column.name] || column.dtype;
                        const missingStrategy = missingValueStrategies[file.name]?.[column.name];
                        const hasMissingValues = column.missing_count > 0;

                        return (
                          <div
                            key={idx}
                            className="bg-white border border-gray-200 rounded-lg p-3 hover:shadow-md transition-all duration-200"
                          >
                            <div className="flex items-start justify-between mb-2">
                              <div className="flex-1">
                                <div className="flex items-center space-x-2 mb-1">
                                  <p className="font-medium text-gray-900">{column.name}</p>
                                  <Badge className={getDtypeBadgeColor(column.dtype)}>
                                    {column.dtype}
                                  </Badge>
                                  {hasMissingValues && (
                                    <Badge variant="outline" className="text-red-600 border-red-300">
                                      {column.missing_percentage.toFixed(1)}% missing
                                    </Badge>
                                  )}
                                </div>
                                <p className="text-xs text-gray-500">
                                  Sample: {column.sample_values.slice(0, 3).join(', ')}
                                  {column.sample_values.length > 3 && '...'}
                                </p>
                              </div>
                            </div>

                            <div className="grid grid-cols-1 md:grid-cols-2 gap-3 mt-3">
                              {/* Data Type Selector */}
                              <div>
                                <label className="text-xs font-medium text-gray-700 mb-1 block">
                                  Data Type
                                </label>
                                <Select
                                  value={currentDtype}
                                  onValueChange={(val) => handleDtypeChange(file.name, column.name, val)}
                                >
                                  <SelectTrigger className="w-full h-9 text-sm">
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
                              </div>

                              {/* Missing Value Strategy */}
                              {hasMissingValues && (
                                <div>
                                  <label className="text-xs font-medium text-gray-700 mb-1 block">
                                    Missing Values ({column.missing_count})
                                  </label>
                                  <div className="space-y-2">
                                    <Select
                                      value={missingStrategy?.strategy || 'none'}
                                      onValueChange={(val) =>
                                        handleMissingValueStrategyChange(file.name, column.name, val)
                                      }
                                    >
                                      <SelectTrigger className="w-full h-9 text-sm">
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
                                        placeholder="Enter custom value"
                                        value={missingStrategy.value || ''}
                                        onChange={(e) =>
                                          handleMissingValueCustomChange(
                                            file.name,
                                            column.name,
                                            e.target.value
                                          )
                                        }
                                        className="h-9 text-sm"
                                      />
                                    )}
                                  </div>
                                </div>
                              )}
                            </div>
                          </div>
                         );
                       })}
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

