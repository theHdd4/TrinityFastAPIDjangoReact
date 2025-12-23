import React, { useEffect, useState, useCallback, useMemo, useRef } from 'react';
import { AlertTriangle, CheckCircle2, ChevronRight, RotateCcw, X, ArrowLeft, ArrowRight } from 'lucide-react';
import { UPLOAD_API } from '@/lib/api';
import { StageLayout } from '../components/StageLayout';
import type { ReturnTypeFromUseGuidedUploadFlow } from '../useGuidedUploadFlow';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
// Removed RadioGroup - using Select dropdown instead
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Checkbox } from '@/components/ui/checkbox';
import { Input } from '@/components/ui/input';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { saveFileToSavedDataFrames } from '../utils/saveFileHelper';
import { toast } from '@/hooks/use-toast';
import { truncateFileName } from '@/utils/truncateFileName';

interface U2UnderstandingFilesProps {
  flow: ReturnTypeFromUseGuidedUploadFlow;
  onNext: () => void;
  onBack: () => void;
  onRestart?: () => void;
  onCancel?: () => void;
  onRegisterContinueHandler?: (handler: () => void) => void;
  onRegisterContinueDisabled?: (getDisabled: () => boolean) => void;
  isMaximized?: boolean;
}

interface FilePreviewRow {
  row_index: number; // 1-indexed absolute row number
  relative_index?: number; // 0-indexed relative to data rows
  cells: string[];
}

interface FilePreviewResponse {
  data_rows: FilePreviewRow[];
  description_rows: FilePreviewRow[];
  data_rows_count: number;
  description_rows_count: number;
  data_rows_start: number;
  preview_row_count: number;
  column_count: number;
  total_rows: number;
  suggested_header_row: number; // Relative to data rows (0-indexed)
  suggested_header_row_absolute: number; // Absolute including description rows
  suggested_header_confidence: 'high' | 'medium' | 'low';
  has_description_rows: boolean;
}

export const U2UnderstandingFiles: React.FC<U2UnderstandingFilesProps> = ({ 
  flow, 
  onNext, 
  onBack,
  onRestart,
  onCancel,
  onRegisterContinueHandler,
  onRegisterContinueDisabled,
  isMaximized = false
}) => {
  const { state, setHeaderSelection, updateFileSheetSelection, updateUploadedFilePath } = flow;
  const { uploadedFiles, headerSelections, selectedFileIndex: savedSelectedIndex } = state;
  
  // Get the selected file from U1 - this is the ONLY file we process in steps 3-8
  const selectedFileIndex = savedSelectedIndex !== undefined && savedSelectedIndex < uploadedFiles.length
    ? savedSelectedIndex
    : 0;
  const currentFile = uploadedFiles[selectedFileIndex];
  const currentHeaderSelection = currentFile ? headerSelections[currentFile.name] : null;
  const hasMultipleSheets = (currentFile?.sheetNames?.length || 0) > 1;
  
  const [loading, setLoading] = useState(true);
  const [previewData, setPreviewData] = useState<FilePreviewResponse | null>(null);
  const [selectedHeaderRow, setSelectedHeaderRow] = useState<number>(0);
  const [selectedHeaderRows, setSelectedHeaderRows] = useState<number[]>([]); // For multi-row headers
  const [headerRowCount, setHeaderRowCount] = useState<number>(1);
  const [multiRowHeader, setMultiRowHeader] = useState(true); // Always enabled
  const [customHeaderRowCount, setCustomHeaderRowCount] = useState<string>('');
  const [useCustomHeaderCount, setUseCustomHeaderCount] = useState(false);
  const [error, setError] = useState<string>('');
  const [applyingHeader, setApplyingHeader] = useState(false);
  const [showMergeDialog, setShowMergeDialog] = useState(false);
  const [sheetMetadata, setSheetMetadata] = useState<Record<string, { rows: number; columns: number }>>({});
  
  // Check if current file is processed
  const isCurrentFileProcessed = currentFile ? 
    (currentFile.processed || (currentFile.path && !currentFile.path.includes('tmp/') && !currentFile.path.includes('temp_uploads/'))) : 
    false;
  
  // Check if current file is unprocessed
  const hasUnprocessedFiles = currentFile ? 
    (!currentFile.processed && (currentFile.path?.includes('tmp/') || currentFile.path?.includes('temp_uploads/'))) :
    false;

  // Create stable file key to prevent unnecessary re-fetches
  const fileKey = useMemo(() => {
    if (!currentFile) return null;
    return `${currentFile.path}:${currentFile.selectedSheet || ''}`;
  }, [currentFile?.path, currentFile?.selectedSheet]);

  // Track last fetched file to prevent duplicate calls
  const lastFetchedFileKeyRef = useRef<string | null>(null);

  // Fetch preview data from backend
  useEffect(() => {
    // #region agent log
    fetch('http://127.0.0.1:7242/ingest/f74def83-6ab6-4eaa-b691-535eeb501a5a',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'U2UnderstandingFiles.tsx:98',message:'U2 fetchPreview effect triggered',data:{hasCurrentFile:!!currentFile,fileKey,lastFetchedKey:lastFetchedFileKeyRef.current,selectedFileIndex},timestamp:Date.now(),sessionId:'debug-session',runId:'run1',hypothesisId:'E'})}).catch(()=>{});
    // #endregion
    
    const fetchPreview = async () => {
      if (!currentFile || !fileKey) return;
      
      // Prevent duplicate calls for the same file
      if (lastFetchedFileKeyRef.current === fileKey) {
        // #region agent log
        fetch('http://127.0.0.1:7242/ingest/f74def83-6ab6-4eaa-b691-535eeb501a5a',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'U2UnderstandingFiles.tsx:103',message:'Skipping duplicate fetch',data:{fileKey},timestamp:Date.now(),sessionId:'debug-session',runId:'run1',hypothesisId:'E'})}).catch(()=>{});
        // #endregion
        return;
      }
      
      // #region agent log
      fetch('http://127.0.0.1:7242/ingest/f74def83-6ab6-4eaa-b691-535eeb501a5a',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'U2UnderstandingFiles.tsx:107',message:'Starting file preview fetch',data:{fileKey,filePath:currentFile.path},timestamp:Date.now(),sessionId:'debug-session',runId:'run1',hypothesisId:'E'})}).catch(()=>{});
      // #endregion
      
      // Validate file path before making API call
      if (!currentFile.path || !currentFile.path.trim()) {
        setError('File path is missing. The file may not have been uploaded correctly. Please go back and re-upload the file.');
        setLoading(false);
        return;
      }
      
      lastFetchedFileKeyRef.current = fileKey;
      setLoading(true);
      setError('');

      try {
        const envStr = localStorage.getItem('env');
        let queryParams = new URLSearchParams({
          object_name: currentFile.path,
        });
        
        if (currentFile.selectedSheet) {
          queryParams.append('sheet_name', currentFile.selectedSheet);
        }
        
        if (envStr) {
          try {
            const env = JSON.parse(envStr);
            queryParams.append('client_id', env.CLIENT_ID || '');
            queryParams.append('app_id', env.APP_ID || '');
            queryParams.append('project_id', env.PROJECT_ID || '');
          } catch {
            // Ignore env parse errors
          }
        }
        
        const res = await fetch(`${UPLOAD_API}/file-preview?${queryParams.toString()}`, {
          method: 'GET',
          credentials: 'include',
        });

        if (!res.ok) {
          const errorText = await res.text();
          console.error('File preview error:', errorText);
          throw new Error(`Failed to load file preview: ${res.status} ${errorText}`);
        }

        const data: FilePreviewResponse = await res.json();
        console.log('File preview response:', data);
        
        setPreviewData(data);
        
        // Store sheet metadata scoped to sheet
        if (data.total_rows !== undefined && data.column_count !== undefined) {
          const sheetKey = currentFile.selectedSheet || currentFile.sheetNames?.[0] || '__default';
          setSheetMetadata((prev) => ({
            ...prev,
            [sheetKey]: {
              rows: data.total_rows,
              columns: data.column_count,
            },
          }));
        }
        
        // Set suggested header row
        if (data.suggested_header_row_absolute !== undefined) {
          setSelectedHeaderRow(data.suggested_header_row_absolute);
          setSelectedHeaderRows([data.suggested_header_row_absolute]);
          setMultiRowHeader(true); // Always enable multi-row selection
        }
        
        // Load saved header selection if exists
        if (currentHeaderSelection) {
          if (currentHeaderSelection.noHeader) {
            setSelectedHeaderRow(0);
            setSelectedHeaderRows([]);
          } else {
            // Convert relative index to absolute
            const absoluteIndex = data.data_rows_start + (currentHeaderSelection.headerRowIndex || 0) + 1;
            setSelectedHeaderRow(absoluteIndex);
            setHeaderRowCount(currentHeaderSelection.headerRowCount || 1);
            setMultiRowHeader(true); // Always enable multi-row selection
            
            // For multi-row headers, reconstruct the selected rows array
            if (currentHeaderSelection.headerRowCount > 1) {
              const savedRows: number[] = [];
              for (let i = 0; i < (currentHeaderSelection.headerRowCount || 1); i++) {
                savedRows.push(absoluteIndex + i);
              }
              setSelectedHeaderRows(savedRows);
            } else {
              setSelectedHeaderRows([absoluteIndex]);
            }
          }
        }
      } catch (err: any) {
        setError(err.message || 'Failed to load preview');
        lastFetchedFileKeyRef.current = null; // Reset on error to allow retry
      } finally {
        setLoading(false);
      }
    };

    if (currentFile && fileKey) {
      void fetchPreview();
    }
  }, [fileKey, currentFile, currentHeaderSelection]);

  // Handle header selection change - always in multi-row mode
  const handleHeaderSelectionChange = (rowIndex: number | 'none') => {
    if (rowIndex === 'none') {
      setSelectedHeaderRow(0);
      setSelectedHeaderRows([]);
      if (currentFile && previewData) {
        setHeaderSelection(currentFile.name, {
          headerRowIndex: -1,
          headerRowCount: 0,
          noHeader: true,
        });
      }
      return;
    }
    
    // Always use multi-row selection mode - toggle row in/out of selection
    setSelectedHeaderRows(prev => {
      const isSelected = prev.includes(rowIndex);
      let newSelection: number[];
      
      if (isSelected) {
        // Remove from selection
        newSelection = prev.filter(r => r !== rowIndex).sort((a, b) => a - b);
      } else {
        // Add to selection (keep sorted)
        newSelection = [...prev, rowIndex].sort((a, b) => a - b);
      }
      
      // Update single header row to first selected row
      if (newSelection.length > 0) {
        setSelectedHeaderRow(newSelection[0]);
        setHeaderRowCount(newSelection.length);
        
        // Save selection
        if (currentFile && previewData) {
          const firstRow = previewData.data_rows.find(r => r.row_index === newSelection[0]);
          const relativeIndex = firstRow?.relative_index !== undefined 
            ? firstRow.relative_index 
            : Math.max(0, newSelection[0] - 1 - previewData.data_rows_start);
          
          setHeaderSelection(currentFile.name, {
            headerRowIndex: relativeIndex,
            headerRowCount: newSelection.length,
            noHeader: false,
          });
        }
      } else {
        setSelectedHeaderRow(0);
        setHeaderRowCount(1);
      }
      
      return newSelection;
    });
  };

  const handleHeaderRowCountChange = (count: number) => {
    setHeaderRowCount(count);
    if (currentFile && previewData) {
      const dataRow = previewData.data_rows.find(r => r.row_index === selectedHeaderRow);
      const relativeIndex = dataRow?.relative_index !== undefined 
        ? dataRow.relative_index 
        : Math.max(0, selectedHeaderRow - 1 - previewData.data_rows_start);
      
      setHeaderSelection(currentFile.name, {
        headerRowIndex: relativeIndex,
        headerRowCount: count,
        noHeader: false,
      });
    }
  };

  // Helper to append env fields to FormData
  const appendEnvFields = (form: FormData) => {
    const envStr = localStorage.getItem('env');
    if (envStr) {
      try {
        const env = JSON.parse(envStr);
        form.append('client_id', env.CLIENT_ID || '');
        form.append('app_id', env.APP_ID || '');
        form.append('project_id', env.PROJECT_ID || '');
      } catch {
        /* ignore */
      }
    }
  };

  // Apply header selection (used by both direct continue and merge dialog)
  const applyHeaderSelection = useCallback(async () => {
    if (!currentFile || !previewData) return;
    
    setShowMergeDialog(false);
    setApplyingHeader(true);
    setError('');
    
    try {
      // Get relative index from the selected data row
      const selectedDataRow = previewData.data_rows.find(r => r.row_index === selectedHeaderRow);
      const relativeHeaderIndex = selectedDataRow?.relative_index !== undefined
        ? selectedDataRow.relative_index
        : Math.max(0, selectedHeaderRow - 1 - previewData.data_rows_start);
      
      // Use selectedHeaderRows.length or headerRowCount for multi-row headers
      const finalHeaderRowCount = selectedHeaderRows.length > 1 ? selectedHeaderRows.length : headerRowCount;
      
      // Call /apply-header-selection endpoint
      const form = new FormData();
      form.append('object_name', currentFile.path);
      form.append('header_row', relativeHeaderIndex.toString());
      form.append('header_row_count', finalHeaderRowCount.toString()); // Send number of header rows
      if (currentFile.selectedSheet) {
        form.append('sheet_name', currentFile.selectedSheet);
      }
      appendEnvFields(form);
      
      const res = await fetch(`${UPLOAD_API}/apply-header-selection`, {
        method: 'POST',
        credentials: 'include',
        body: form,
      });

      if (!res.ok) {
        const errorData = await res.json().catch(() => ({ detail: 'Failed to apply header selection' }));
        throw new Error(errorData.detail || 'Failed to apply header selection');
      }

      const result = await res.json();
      
      // Update flow state with processed file path
      if (result.file_path && currentFile) {
        const oldFilePath = currentFile.path;

        // Detect Excel-sheet-in-folder paths – they contain '/sheets/'
        const isExcelFolderFile =
          (oldFilePath && oldFilePath.includes('/sheets/')) ||
          (result.file_path && result.file_path.includes('/sheets/'));

        if (isExcelFolderFile) {
          // ✅ Existing Excel sheet in a folder: do NOT re-save via save_dataframes.
          // Keep using the exact path so the sheet stays inside its folder.
          const newPath = result.file_path || oldFilePath;
          updateUploadedFilePath(currentFile.name, newPath);
        } else {
          // Regular files: save processed file to Saved DataFrames as before
          const savedPath = await saveFileToSavedDataFrames(
            result.file_path,
            currentFile.name,
            oldFilePath
          );
          
          if (savedPath) {
            updateUploadedFilePath(currentFile.name, savedPath);
          } else {
            updateUploadedFilePath(currentFile.name, result.file_path);
            toast({
              title: 'Warning',
              description: 'File processed but may not be visible in Saved DataFrames panel.',
              variant: 'destructive',
            });
          }
        }
        
        // Save header selection
        setHeaderSelection(currentFile.name, {
          headerRowIndex: relativeHeaderIndex,
          headerRowCount: finalHeaderRowCount,
          noHeader: false,
        });
      }
      
      // After U1, we only process one file, so always move to next stage
      onNext();
    } catch (err: any) {
      setError(err.message || 'Failed to apply header selection');
      setApplyingHeader(false);
    }
  }, [currentFile, previewData, selectedHeaderRow, selectedHeaderRows, headerRowCount, setHeaderSelection, updateUploadedFilePath, onNext]);

  // Handle Continue - apply header selection
  const handleContinue = useCallback(async () => {
    if (!currentFile || !previewData) return;
    
    if (selectedHeaderRow === 0) {
      setError('Please select a header row.');
      return;
    }
    
    // Check if multiple rows are selected
    if (selectedHeaderRows.length > 1) {
      setShowMergeDialog(true);
      return;
    }
    
    // Proceed with single row selection
    await applyHeaderSelection();
  }, [currentFile, previewData, selectedHeaderRow, selectedHeaderRows, applyHeaderSelection, setError, setShowMergeDialog]);

  // Register handleContinue with parent component for external footer
  useEffect(() => {
    if (onRegisterContinueHandler) {
      onRegisterContinueHandler(handleContinue);
    }
  }, [onRegisterContinueHandler, handleContinue]);

  // Register disabled state for Continue button
  useEffect(() => {
    if (onRegisterContinueDisabled) {
      onRegisterContinueDisabled(() => {
        return loading || applyingHeader || !currentFile || !previewData || selectedHeaderRow === 0;
      });
    }
  }, [onRegisterContinueDisabled, loading, applyingHeader, currentFile, previewData, selectedHeaderRow]);

  return (
    <StageLayout
      title=""
    >
      <div className="space-y-4">
        {/* File + sheet context */}
        {currentFile && (
          <div className="flex flex-wrap items-center gap-3 rounded-lg border border-gray-200 bg-white px-4 py-2 shadow-sm -mt-2">
            <div className="flex items-center gap-2 text-xs text-gray-800">
              <span className="font-semibold text-gray-900">File:</span>
              <span title={currentFile.name} className="truncate max-w-[200px]">
                {truncateFileName(currentFile.name)}
              </span>
            </div>
            {currentFile.selectedSheet && (
              <div className="flex items-center gap-2 text-xs text-gray-700">
                <span className="font-semibold text-gray-900">Sheet:</span>
                <span>{currentFile.selectedSheet}</span>
              </div>
            )}
            {(() => {
              const sheetKey = currentFile.selectedSheet || currentFile.sheetNames?.[0] || '__default';
              const meta = sheetMetadata[sheetKey];
              if (!meta) return null;
              return (
                <div className="flex items-center gap-2 text-xs text-gray-700">
                  <span className="font-semibold text-gray-900">Shape:</span>
                  <span>{meta.rows.toLocaleString()} rows · {meta.columns} cols</span>
                </div>
              );
            })()}
          </div>
        )}

        {/* Warning for unprocessed file */}
        {hasUnprocessedFiles && currentFile && (
          <div className="bg-red-50 border-2 border-red-300 rounded-lg p-4">
            <div className="flex items-start gap-2">
              <AlertTriangle className="w-5 h-5 text-red-600 mt-0.5 flex-shrink-0" />
              <div className="flex-1">
                <p className="text-sm font-medium text-red-900 mb-1">
                  ⚠️ File Needs Processing
                </p>
                <p className="text-xs text-red-800 mb-2">
                  <span className="font-semibold" title={currentFile.name}>{truncateFileName(currentFile.name)}</span> needs to be processed before you can continue.
                </p>
                <p className="text-xs text-red-700 mt-2 font-medium">
                  Please select a header row and apply it to process this file.
                </p>
              </div>
            </div>
          </div>
        )}
        

        {/* Sheet Selection (if Excel with multiple sheets) */}
        {hasMultipleSheets && currentFile && (
          <div className="bg-gray-50 border border-gray-200 rounded-lg p-4">
            <div className="flex items-center justify-between mb-2">
              <Label className="text-sm font-medium text-gray-700">
                Select Sheet
              </Label>
              <TooltipProvider>
                <Tooltip>
                  <TooltipTrigger>
                    <span className="text-xs text-gray-500">ℹ️</span>
                  </TooltipTrigger>
                  <TooltipContent>
                    <p>Sheets you don't need can be removed later.</p>
                  </TooltipContent>
                </Tooltip>
              </TooltipProvider>
            </div>
            <div className="flex gap-2 flex-wrap">
              {currentFile.sheetNames?.map((sheet, idx) => {
                const isSelected = currentFile.selectedSheet === sheet || 
                  (!currentFile.selectedSheet && idx === 0);
                const isRecommended = idx === 0;
                const meta = sheetMetadata[sheet];
                return (
                  <button
                    key={idx}
                    onClick={() => updateFileSheetSelection(currentFile.name, sheet)}
                    className={`px-3 py-1.5 rounded text-sm font-medium transition-colors ${
                      isSelected
                        ? 'bg-[#458EE2] text-white'
                        : 'bg-white text-gray-700 border border-gray-300 hover:bg-gray-50'
                    }`}
                  >
                    {sheet}
                    {meta && (
                      <span className="ml-1 text-xs opacity-75">
                        ({meta.rows.toLocaleString()} rows, {meta.columns} cols)
                      </span>
                    )}
                    {isRecommended && (
                      <span className="ml-1 text-xs">⭐</span>
                    )}
                  </button>
                );
              })}
            </div>
          </div>
        )}

        {/* Loading State */}
        {loading && (
          <div className="text-center py-8 border border-gray-200 rounded-lg bg-gray-50">
            <div className="inline-block animate-spin rounded-full h-8 w-8 border-b-2 border-[#458EE2]"></div>
            <p className="mt-4 text-sm text-gray-600">Loading file preview...</p>
          </div>
        )}
        
        {/* Error State */}
        {error && (
          <div className="bg-red-50 border border-red-200 rounded-lg p-4">
            <p className="text-sm text-red-600">{error}</p>
          </div>
        )}
        
        {/* Preview Data */}
        {!loading && !error && previewData && (
          <div className="space-y-4">
            {/* Description Rows Section - Only show if there are description rows */}
            {previewData.description_rows.length > 0 && (
              <div className="bg-gray-50 border border-gray-200 rounded-lg p-2">
                <Label className="text-xs font-medium text-gray-700 mb-1.5 block">
                  Description Rows (Metadata)
                </Label>
                <div className="border border-gray-200 rounded-lg overflow-hidden bg-white">
                  <div className="overflow-x-auto max-h-32">
                    <table className="w-full text-xs">
                      <tbody>
                        {previewData.description_rows.map((row, idx) => (
                          <tr
                            key={idx}
                            className="border-b border-gray-200 last:border-b-0 hover:bg-gray-50"
                          >
                            {row.cells.map((cell, cellIdx) => {
                              const cellValue = cell || '';
                              const displayValue = cellValue.length > 30 
                                ? cellValue.substring(0, 30) + '...' 
                                : cellValue;
                              return (
                                <td
                                  key={cellIdx}
                                  className="px-1.5 py-1 text-gray-700 border-r border-gray-200 last:border-r-0 text-xs"
                                  title={cellValue || ''}
                                >
                                  {displayValue || <span className="text-gray-400">—</span>}
                                </td>
                              );
                            })}
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              </div>
            )}

            <div className="space-y-4">
              {/* Data Rows Preview Panel */}
              <div className="space-y-4">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <h3 className="text-xs text-gray-900">
                      <span className="text-[#458EE2] font-semibold">Select header row</span>
                      <span className="font-normal"> (Click on row to change selection)</span>
                    </h3>
                    {selectedHeaderRows.length > 1 && (
                      <span className="text-xs text-red-600">
                        {selectedHeaderRows.length} headers selected
                      </span>
                    )}
                  </div>
                  <span className="text-[10px] text-gray-500">
                    {previewData.data_rows.length} rows (scroll to see all)
                  </span>
                </div>
              
                <div className="border border-gray-200 rounded-lg overflow-hidden">
                  <div 
                    className="overflow-x-auto" 
                    style={{ 
                      maxHeight: isMaximized ? 'calc(100vh - 300px)' : '8.75rem',
                      overflowY: 'auto',
                      scrollbarGutter: 'stable'
                    }}
                  >
                    <Table className="text-[10px]">
                      <TableBody>
                        {previewData.data_rows.map((row) => {
                          const isHeaderRow = selectedHeaderRows.includes(row.row_index);
                          const isInHeaderRange = false; // Not needed since we always use multi-row mode
                          
                          return (
                            <TableRow
                              key={row.row_index}
                              className={`
                                ${isHeaderRow ? 'bg-blue-100 border-2 border-blue-400 cursor-pointer' : 'hover:bg-muted/50 cursor-pointer'}
                              `}
                              onClick={() => handleHeaderSelectionChange(row.row_index)}
                              style={{ height: '1.75rem' }}
                            >
                              {row.cells.map((cell, cellIdx) => {
                                const cellValue = cell || '';
                                const displayValue = cellValue.length > 20 
                                  ? cellValue.substring(0, 20) + '...' 
                                  : cellValue;
                                const isFirstCell = cellIdx === 0;

                                return (
                                  <TableCell
                                    key={cellIdx}
                                    className={`text-gray-700 border border-gray-300 px-0.5 py-0 text-[10px] leading-tight whitespace-nowrap ${isFirstCell ? 'relative' : ''}`}
                                    title={cellValue || ''}
                                  >
                                    {isHeaderRow && isFirstCell && (
                                      <ArrowRight className="absolute left-0.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-[#458EE2] stroke-[3]" />
                                    )}
                                    <span className={isHeaderRow && isFirstCell ? 'ml-4' : ''}>
                                      {displayValue || <span className="text-gray-400">—</span>}
                                    </span>
                                    {isHeaderRow && selectedHeaderRows.length > 1 && isFirstCell && (
                                      <span className="ml-1 text-[9px] text-yellow-700">
                                        ({selectedHeaderRows.indexOf(row.row_index) + 1}/{selectedHeaderRows.length})
                                      </span>
                                    )}
                                  </TableCell>
                                );
                              })}
                            </TableRow>
                          );
                        })}
                      </TableBody>
                    </Table>
                  </div>
                </div>
              </div>

              {/* Warnings */}
              {previewData.suggested_header_confidence === 'low' && selectedHeaderRow > 0 && (
                <div className="bg-yellow-50 border border-yellow-200 rounded-lg p-4">
                  <div className="flex items-start gap-2">
                    <AlertTriangle className="w-5 h-5 text-yellow-600 mt-0.5 flex-shrink-0" />
                    <p className="text-sm text-yellow-800">
                      I'm not fully sure where your column names are. Please select the correct row.
                    </p>
                  </div>
                </div>
              )}
            </div>
          </div>
        )}
      </div>

      {/* Merge Dialog for Multiple Header Rows */}
      <Dialog open={showMergeDialog} onOpenChange={setShowMergeDialog}>
        <DialogContent className="sm:max-w-[425px]">
          <DialogHeader>
            <DialogTitle>Multiple Header Rows Selected</DialogTitle>
          </DialogHeader>
          <div className="py-4">
            <p className="text-sm text-gray-700">
              You have selected {selectedHeaderRows.length} row{selectedHeaderRows.length !== 1 ? 's' : ''} as header{selectedHeaderRows.length !== 1 ? 's' : ''}. 
              Trinity will merge them automatically (e.g., "Sales" + "2024" → "Sales_2024").
            </p>
          </div>
          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => setShowMergeDialog(false)}
              disabled={applyingHeader}
            >
              Go Back
            </Button>
            <Button
              onClick={applyHeaderSelection}
              disabled={applyingHeader}
              className="bg-[#458EE2] hover:bg-[#3a7bc7]"
            >
              {applyingHeader ? (
                <>
                  <div className="inline-block animate-spin rounded-full h-4 w-4 border-b-2 border-white mr-2"></div>
                  Merging...
                </>
              ) : (
                'Merge and Continue'
              )}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </StageLayout>
  );
};
