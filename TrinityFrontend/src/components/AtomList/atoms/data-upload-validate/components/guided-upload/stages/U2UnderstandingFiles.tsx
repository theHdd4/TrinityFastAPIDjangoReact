import React, { useEffect, useState } from 'react';
import { AlertTriangle, CheckCircle2, ChevronRight, RotateCcw, X, ArrowLeft } from 'lucide-react';
import { VALIDATE_API } from '@/lib/api';
import { StageLayout } from '../components/StageLayout';
import type { ReturnTypeFromUseGuidedUploadFlow } from '../useGuidedUploadFlow';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
// Removed RadioGroup - using Select dropdown instead
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Checkbox } from '@/components/ui/checkbox';
import { Input } from '@/components/ui/input';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';
import { saveFileToSavedDataFrames } from '../utils/saveFileHelper';
import { toast } from '@/hooks/use-toast';

interface U2UnderstandingFilesProps {
  flow: ReturnTypeFromUseGuidedUploadFlow;
  onNext: () => void;
  onBack: () => void;
  onRestart?: () => void;
  onCancel?: () => void;
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
  onCancel 
}) => {
  const { state, setHeaderSelection, updateFileSheetSelection, updateUploadedFilePath } = flow;
  const { uploadedFiles, headerSelections } = state;
  
  const [selectedFileIndex, setSelectedFileIndex] = useState(0);
  const [loading, setLoading] = useState(true);
  const [previewData, setPreviewData] = useState<FilePreviewResponse | null>(null);
  const [selectedHeaderRow, setSelectedHeaderRow] = useState<number>(0);
  const [selectedHeaderRows, setSelectedHeaderRows] = useState<number[]>([]); // For multi-row headers
  const [headerRowCount, setHeaderRowCount] = useState<number>(1);
  const [multiRowHeader, setMultiRowHeader] = useState(false);
  const [customHeaderRowCount, setCustomHeaderRowCount] = useState<string>('');
  const [useCustomHeaderCount, setUseCustomHeaderCount] = useState(false);
  const [error, setError] = useState<string>('');
  const [applyingHeader, setApplyingHeader] = useState(false);
  const [sheetMetadata, setSheetMetadata] = useState<{ rows: number; columns: number } | null>(null);

  const currentFile = uploadedFiles[selectedFileIndex];
  const currentHeaderSelection = currentFile ? headerSelections[currentFile.name] : null;
  const hasMultipleFiles = uploadedFiles.length > 1;
  const hasMultipleSheets = (currentFile?.sheetNames?.length || 0) > 1;
  
  // Check if current file is processed
  const isCurrentFileProcessed = currentFile ? 
    (currentFile.processed || (currentFile.path && !currentFile.path.includes('tmp/') && !currentFile.path.includes('temp_uploads/'))) : 
    false;
  
  // Check if any files are unprocessed
  const hasUnprocessedFiles = uploadedFiles.some(f => 
    !f.processed && (f.path?.includes('tmp/') || f.path?.includes('temp_uploads/'))
  );

  // Fetch preview data from backend
  useEffect(() => {
    const fetchPreview = async () => {
      if (!currentFile) return;
      
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
        
        const res = await fetch(`${VALIDATE_API}/file-preview?${queryParams.toString()}`, {
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
        
        // Store sheet metadata
        if (data.total_rows !== undefined && data.column_count !== undefined) {
          setSheetMetadata({
            rows: data.total_rows,
            columns: data.column_count,
          });
        }
        
        // Set suggested header row
        if (data.suggested_header_row_absolute !== undefined) {
          setSelectedHeaderRow(data.suggested_header_row_absolute);
          setSelectedHeaderRows([data.suggested_header_row_absolute]);
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
            setMultiRowHeader(currentHeaderSelection.headerRowCount > 1);
            
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
      } finally {
        setLoading(false);
      }
    };

    if (currentFile) {
      void fetchPreview();
    }
  }, [currentFile, currentHeaderSelection]);

  // Handle header selection change
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
    
    if (multiRowHeader) {
      // Multi-row header mode: toggle row in/out of selection
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
    } else {
      // Single row header mode - check if it looks like multi-row header
      setSelectedHeaderRow(rowIndex);
      
      // Auto-detect if this row + next rows look like multi-row headers
      let detectedMultiRow = false;
      let detectedRowCount = 1;
      let detectedRows = [rowIndex];
      
      if (previewData) {
        const selectedRowIndex = previewData.data_rows.findIndex(r => r.row_index === rowIndex);
        if (selectedRowIndex >= 0 && selectedRowIndex < previewData.data_rows.length - 1) {
          // Check next 2 rows to see if they also look like headers
          const nextRow1 = previewData.data_rows[selectedRowIndex + 1];
          
          // Simple heuristic: if next rows have mostly text (not numbers), they might be headers
          const looksLikeMultiRowHeader = (() => {
            if (!nextRow1) return false;
            
            // Check if next row has similar structure (mostly text, similar column count)
            const nextRow1Cells = nextRow1.cells || [];
            const selectedRowCells = previewData.data_rows[selectedRowIndex].cells || [];
            
            if (nextRow1Cells.length !== selectedRowCells.length) return false;
            
            // Count text vs numbers in next row
            let textCount = 0;
            let nonEmptyCount = 0;
            for (const cell of nextRow1Cells.slice(0, Math.min(10, nextRow1Cells.length))) {
              if (cell && String(cell).trim()) {
                nonEmptyCount++;
                const cellStr = String(cell).trim();
                // Check if it's NOT a number
                if (isNaN(Number(cellStr.replace(/[,$%]/g, '')))) {
                  textCount++;
                }
              }
            }
            
            // If next row is mostly text (like headers), it might be part of multi-row header
            const textRatio = nonEmptyCount > 0 ? textCount / nonEmptyCount : 0;
            return textRatio >= 0.7 && nonEmptyCount >= selectedRowCells.length * 0.5;
          })();
          
          if (looksLikeMultiRowHeader) {
            // Auto-enable multi-row header mode
            detectedMultiRow = true;
            detectedRowCount = 2; // Default to 2 rows
            detectedRows = [rowIndex, nextRow1.row_index];
            
            // Check if third row also looks like header
            const nextRow2 = previewData.data_rows[selectedRowIndex + 2];
            if (nextRow2) {
              const nextRow2Cells = nextRow2.cells || [];
              let textCount2 = 0;
              let nonEmptyCount2 = 0;
              for (const cell of nextRow2Cells.slice(0, Math.min(10, nextRow2Cells.length))) {
                if (cell && String(cell).trim()) {
                  nonEmptyCount2++;
                  const cellStr = String(cell).trim();
                  if (isNaN(Number(cellStr.replace(/[,$%]/g, '')))) {
                    textCount2++;
                  }
                }
              }
              const textRatio2 = nonEmptyCount2 > 0 ? textCount2 / nonEmptyCount2 : 0;
              if (textRatio2 >= 0.7 && nonEmptyCount2 >= selectedRowCells.length * 0.5) {
                detectedRowCount = 3;
                detectedRows = [rowIndex, nextRow1.row_index, nextRow2.row_index];
              }
            }
          }
        }
      }
      
      // Apply detected multi-row header settings
      if (detectedMultiRow) {
        setMultiRowHeader(true);
        setHeaderRowCount(detectedRowCount);
        setSelectedHeaderRows(detectedRows);
      } else {
        setSelectedHeaderRows([rowIndex]);
      }
      
      if (currentFile && previewData) {
        // Find the data row to get relative index
        const dataRow = previewData.data_rows.find(r => r.row_index === rowIndex);
        const relativeIndex = dataRow?.relative_index !== undefined 
          ? dataRow.relative_index 
          : Math.max(0, rowIndex - 1 - previewData.data_rows_start);
        
        setHeaderSelection(currentFile.name, {
          headerRowIndex: relativeIndex,
          headerRowCount: detectedMultiRow ? detectedRowCount : 1,
          noHeader: false,
        });
      }
    }
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

  const handleMultiRowHeaderToggle = (checked: boolean) => {
    setMultiRowHeader(checked);
    if (!checked) {
      // Switch back to single row mode
      setHeaderRowCount(1);
      if (selectedHeaderRow > 0) {
        setSelectedHeaderRows([selectedHeaderRow]);
        handleHeaderRowCountChange(1);
      } else {
        setSelectedHeaderRows([]);
      }
      setUseCustomHeaderCount(false);
      setCustomHeaderRowCount('');
    } else {
      // Switch to multi-row mode - initialize with current selection
      if (selectedHeaderRow > 0) {
        setSelectedHeaderRows([selectedHeaderRow]);
        setHeaderRowCount(1);
      }
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

  // Handle Continue - apply header selection
  const handleContinue = async () => {
    if (!currentFile || !previewData) return;
    
    if (selectedHeaderRow === 0) {
      setError('Please select a header row.');
      return;
    }
    
    setApplyingHeader(true);
    setError('');
    
    try {
      // Get relative index from the selected data row
      const selectedDataRow = previewData.data_rows.find(r => r.row_index === selectedHeaderRow);
      const relativeHeaderIndex = selectedDataRow?.relative_index !== undefined
        ? selectedDataRow.relative_index
        : Math.max(0, selectedHeaderRow - 1 - previewData.data_rows_start);
      
      // Call /apply-header-selection endpoint
      const form = new FormData();
      form.append('object_name', currentFile.path);
      form.append('header_row', relativeHeaderIndex.toString());
      form.append('header_row_count', headerRowCount.toString()); // Send number of header rows
      if (currentFile.selectedSheet) {
        form.append('sheet_name', currentFile.selectedSheet);
      }
      appendEnvFields(form);
      
      const res = await fetch(`${VALIDATE_API}/apply-header-selection`, {
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
        
        // Save the processed file to Saved DataFrames panel
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
        
        // Save header selection
        setHeaderSelection(currentFile.name, {
          headerRowIndex: relativeHeaderIndex,
          headerRowCount: headerRowCount,
          noHeader: false,
        });
      }
      
      // Move to next file or next stage
      if (selectedFileIndex < uploadedFiles.length - 1) {
        setSelectedFileIndex(selectedFileIndex + 1);
        setApplyingHeader(false);
      } else {
        onNext();
      }
    } catch (err: any) {
      setError(err.message || 'Failed to apply header selection');
      setApplyingHeader(false);
    }
  };

  return (
    <StageLayout
      title="Step 3: Confirm Your Column Headers"
      explanation="Some files have empty rows or notes above the headers. Select the row that contains your column names."
      helpText={
        multiRowHeader 
          ? "If your headers span multiple rows, choose how many rows they use. Trinity will combine them automatically."
          : undefined
      }
    >
      <div className="space-y-6">
        {/* Warning for unprocessed files */}
        {hasUnprocessedFiles && (
          <div className="bg-red-50 border-2 border-red-300 rounded-lg p-4">
            <div className="flex items-start gap-2">
              <AlertTriangle className="w-5 h-5 text-red-600 mt-0.5 flex-shrink-0" />
              <div className="flex-1">
                <p className="text-sm font-medium text-red-900 mb-1">
                  ⚠️ Unprocessed Files Detected
                </p>
                <p className="text-xs text-red-800 mb-2">
                  Some files are not yet processed. Files marked in <span className="font-semibold text-red-600">red</span> need to be processed before you can continue.
                </p>
                <div className="text-xs text-red-700 space-y-1">
                  {uploadedFiles
                    .filter(f => !f.processed && (f.path?.includes('tmp/') || f.path?.includes('temp_uploads/')))
                    .map((file, idx) => (
                      <div key={idx} className="flex items-center gap-2">
                        <span className="text-red-500 font-bold">●</span>
                        <span className="font-medium">{file.name}</span>
                        <span className="text-red-600">(Needs Processing)</span>
                      </div>
                    ))}
                </div>
                <p className="text-xs text-red-700 mt-2 font-medium">
                  Please process these files by selecting a header row and applying it. This will save them properly.
                </p>
              </div>
            </div>
          </div>
        )}
        
        {/* File Selection (if multiple files) */}
        {hasMultipleFiles && (
          <div className={`border-2 rounded-lg p-4 ${
            isCurrentFileProcessed 
              ? 'bg-gray-50 border-gray-200' 
              : 'bg-red-50 border-red-300'
          }`}>
            <Label className="text-sm font-medium text-gray-700 mb-2 block">
              Select File to Review
            </Label>
            <Select
              value={selectedFileIndex.toString()}
              onValueChange={(value) => setSelectedFileIndex(parseInt(value, 10))}
            >
              <SelectTrigger className={`w-full ${
                !isCurrentFileProcessed ? 'border-red-300' : ''
              }`}>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {uploadedFiles.map((file, idx) => {
                  // Check if file is processed (not in tmp/ and has been saved)
                  const isProcessed = file.processed || (file.path && !file.path.includes('tmp/') && !file.path.includes('temp_uploads/'));
                  return (
                    <SelectItem 
                      key={idx} 
                      value={idx.toString()}
                      className={!isProcessed ? 'text-red-600 font-medium' : ''}
                    >
                      <div className="flex items-center gap-2">
                        {!isProcessed && <span className="text-red-500 font-bold">●</span>}
                        <span className={!isProcessed ? 'font-semibold' : ''}>{file.name}</span>
                        {!isProcessed && (
                          <span className="text-xs text-red-500 bg-red-100 px-1.5 py-0.5 rounded">
                            Needs Processing
                          </span>
                        )}
                      </div>
                    </SelectItem>
                  );
                })}
              </SelectContent>
            </Select>
            {!isCurrentFileProcessed && (
              <div className="mt-2 flex items-start gap-2">
                <AlertTriangle className="w-4 h-4 text-red-600 mt-0.5 flex-shrink-0" />
                <p className="text-xs text-red-700">
                  <span className="font-semibold">{currentFile?.name}</span> needs to be processed. 
                  Please select a header row and apply it to process this file.
                </p>
              </div>
            )}
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
                    {sheetMetadata && (
                      <span className="ml-1 text-xs opacity-75">
                        ({sheetMetadata.rows.toLocaleString()} rows, {sheetMetadata.columns} cols)
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
          <div className="space-y-6">
            {/* Description Rows Section - Always Show */}
            <div className="bg-gray-50 border border-gray-200 rounded-lg p-4">
              <Label className="text-sm font-medium text-gray-700 mb-3 block">
                Description Rows (Metadata)
              </Label>
              {previewData.description_rows.length > 0 ? (
                <div className="border border-gray-200 rounded-lg overflow-hidden bg-white">
                  <div className="overflow-x-auto max-h-64">
                    <table className="w-full text-xs">
                      <tbody>
                        {previewData.description_rows.map((row, idx) => (
                          <tr
                            key={idx}
                            className="border-b border-gray-200 last:border-b-0 hover:bg-gray-50"
                          >
                            <td className="px-3 py-2 font-medium text-gray-600 border-r border-gray-200 w-20">
                              Row {row.row_index}
                            </td>
                            {row.cells.map((cell, cellIdx) => {
                              const cellValue = cell || '';
                              const displayValue = cellValue.length > 50 
                                ? cellValue.substring(0, 50) + '...' 
                                : cellValue;
                              return (
                                <td
                                  key={cellIdx}
                                  className="px-3 py-2 text-gray-700 border-r border-gray-200 last:border-r-0"
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
              ) : (
                <div className="bg-green-50 border border-green-200 rounded-lg p-4">
                  <div className="flex items-center gap-2">
                    <CheckCircle2 className="w-5 h-5 text-green-600 flex-shrink-0" />
                    <p className="text-sm text-green-800">
                      No description rows found. Your data is clean and ready to use.
                    </p>
                  </div>
                </div>
              )}
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
              {/* Data Rows Preview Panel */}
              <div className="space-y-4">
                <div className="flex items-center justify-between">
                  <h3 className="text-sm font-semibold text-gray-900">Data Rows</h3>
                  <span className="text-xs text-gray-500">
                    Showing first {previewData.preview_row_count} rows
                  </span>
                </div>
              
                <div className="border border-gray-200 rounded-lg overflow-hidden">
                  <div className="overflow-x-auto max-h-96">
                    <table className="w-full text-xs">
                      <tbody>
                        {previewData.data_rows.map((row) => {
                          const isHeaderRow = multiRowHeader 
                            ? selectedHeaderRows.includes(row.row_index)
                            : row.row_index === selectedHeaderRow;
                          const isInHeaderRange = multiRowHeader && selectedHeaderRow > 0
                            ? row.row_index >= selectedHeaderRow && 
                              row.row_index < selectedHeaderRow + headerRowCount
                            : false;
                          
                          return (
                            <tr
                              key={row.row_index}
                              className={`
                                ${isHeaderRow ? 'bg-yellow-100 border-2 border-yellow-400' : ''}
                                ${isInHeaderRange && !isHeaderRow ? 'bg-yellow-50' : ''}
                                ${multiRowHeader && isHeaderRow ? 'cursor-pointer' : ''}
                                ${!isHeaderRow ? 'hover:bg-gray-50 cursor-pointer' : ''}
                                border-b border-gray-200 last:border-b-0
                              `}
                              onClick={() => handleHeaderSelectionChange(row.row_index)}
                            >
                              <td className="px-3 py-2 font-medium text-gray-600 border-r border-gray-200 w-20">
                                Row {row.row_index}
                                {isHeaderRow && (
                                  <span className="ml-1 text-yellow-600 font-bold">
                                    ✓
                                  </span>
                                )}
                                {multiRowHeader && isHeaderRow && selectedHeaderRows.length > 1 && (
                                  <span className="ml-1 text-xs text-yellow-700">
                                    ({selectedHeaderRows.indexOf(row.row_index) + 1}/{selectedHeaderRows.length})
                                  </span>
                                )}
                              </td>
                              {row.cells.map((cell, cellIdx) => {
                                const cellValue = cell || '';
                                const displayValue = cellValue.length > 30 
                                  ? cellValue.substring(0, 30) + '...' 
                                  : cellValue;

                                return (
                                  <td
                                    key={cellIdx}
                                    className="px-3 py-2 text-gray-700 border-r border-gray-200 last:border-r-0"
                                    title={cellValue || ''}
                                  >
                                    {displayValue || <span className="text-gray-400">—</span>}
                                  </td>
                                );
                              })}
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>
                </div>
              </div>

              {/* Header Selection Panel */}
              <div className="space-y-6">
                <div className="bg-white border border-gray-200 rounded-lg p-4">
                  <h3 className="text-sm font-semibold text-gray-900 mb-4">Select Header Row</h3>
                  
                  {/* Header Suggestion Label */}
                  {previewData.suggested_header_row_absolute && (
                    <div className={`mb-4 p-3 rounded-lg ${
                      previewData.suggested_header_confidence === 'high' 
                        ? 'bg-green-50 border border-green-200'
                        : previewData.suggested_header_confidence === 'medium'
                        ? 'bg-yellow-50 border border-yellow-200'
                        : 'bg-gray-50 border border-gray-200'
                    }`}>
                      <div className="flex items-start gap-2">
                        {previewData.suggested_header_confidence === 'high' && (
                          <CheckCircle2 className="w-5 h-5 text-green-600 mt-0.5 flex-shrink-0" />
                        )}
                        <div className="flex-1">
                          <p className="text-xs font-medium text-gray-900 mb-1">
                            {previewData.suggested_header_confidence === 'high' 
                              ? 'Suggested Header Row'
                              : previewData.suggested_header_confidence === 'medium'
                              ? 'Possible Header Row'
                              : 'Header Detection'}
                          </p>
                          <p className="text-xs text-gray-700">
                            Row {previewData.suggested_header_row_absolute} is suggested as the header row.
                          </p>
                        </div>
                      </div>
                    </div>
                  )}

                  {/* Selected Header Row Display Box */}
                  <div className="mb-4">
                    <Label className="text-sm font-medium text-gray-700 mb-2 block">
                      {multiRowHeader ? 'Selected Header Rows' : 'Selected Header Row'}
                    </Label>
                    <div className="w-full px-4 py-3 bg-gray-50 border border-gray-300 rounded-md">
                      {selectedHeaderRow === 0 ? (
                        <span className="text-gray-500">
                          {multiRowHeader 
                            ? 'Click on rows in the table to select them as header rows'
                            : 'Click on a row in the table to select it as header'}
                        </span>
                      ) : (
                        <div className="space-y-2">
                          {multiRowHeader && selectedHeaderRows.length > 0 ? (
                            <>
                              <div className="flex items-center justify-between">
                                <span className="text-sm font-medium text-gray-900">
                                  {selectedHeaderRows.length} row{selectedHeaderRows.length !== 1 ? 's' : ''} selected
                                </span>
                                <Button
                                  type="button"
                                  variant="ghost"
                                  size="sm"
                                  onClick={() => handleHeaderSelectionChange('none')}
                                  className="text-xs h-6 px-2"
                                >
                                  Clear All
                                </Button>
                              </div>
                              <div className="flex flex-wrap gap-2 mt-2">
                                {selectedHeaderRows.map((rowNum, idx) => (
                                  <span
                                    key={rowNum}
                                    className="inline-flex items-center px-2 py-1 bg-yellow-100 border border-yellow-400 rounded text-xs font-medium text-gray-900"
                                  >
                                    Row {rowNum}
                                    {previewData.suggested_header_row_absolute === rowNum && (
                                      <span className="ml-1 text-[#458EE2]">(Suggested)</span>
                                    )}
                                    <button
                                      type="button"
                                      onClick={(e) => {
                                        e.stopPropagation();
                                        handleHeaderSelectionChange(rowNum);
                                      }}
                                      className="ml-1 text-yellow-700 hover:text-yellow-900"
                                    >
                                      ×
                                    </button>
                                  </span>
                                ))}
                              </div>
                            </>
                          ) : (
                            <div className="flex items-center justify-between">
                              <span className="text-sm font-medium text-gray-900">
                                Row {selectedHeaderRow}
                                {previewData.suggested_header_row_absolute === selectedHeaderRow && (
                                  <span className="ml-2 text-xs text-[#458EE2] font-normal">(Suggested)</span>
                                )}
                              </span>
                              <Button
                                type="button"
                                variant="ghost"
                                size="sm"
                                onClick={() => handleHeaderSelectionChange('none')}
                                className="text-xs h-6 px-2"
                              >
                                Clear
                              </Button>
                            </div>
                          )}
                        </div>
                      )}
                    </div>
                    <p className="text-xs text-gray-500 mt-1">
                      {multiRowHeader 
                        ? 'Click on rows in the data table to add/remove them from header selection'
                        : 'Click on any row in the data table to select it as the header row'}
                    </p>
                  </div>

                  {/* Auto-detected multi-row header message */}
                  {selectedHeaderRow > 0 && multiRowHeader && (
                    <div className="mb-4 p-3 bg-blue-50 border border-blue-200 rounded-lg">
                      <p className="text-sm font-medium text-gray-900 mb-2">
                        Your selected header row seems to span multiple rows.
                      </p>
                      <p className="text-xs text-gray-700 mb-3">
                        Select how many header rows you want to include. Trinity will combine them automatically (e.g., "Sales" + "2024" → "Sales_2024").
                      </p>
                      
                      {/* User Selection: Number of Header Rows */}
                      <div className="mt-3">
                        <Label className="text-sm font-medium text-gray-700 mb-2 block">
                          Number of Header Rows
                        </Label>
                        <Select
                          value={headerRowCount.toString()}
                          onValueChange={(value) => {
                            const count = parseInt(value, 10);
                            handleHeaderRowCountChange(count);
                            
                            // Update selected rows array based on count
                            if (previewData && selectedHeaderRow > 0) {
                              const selectedRowIndex = previewData.data_rows.findIndex(r => r.row_index === selectedHeaderRow);
                              if (selectedRowIndex >= 0) {
                                const newSelectedRows: number[] = [];
                                for (let i = 0; i < count && (selectedRowIndex + i) < previewData.data_rows.length; i++) {
                                  const row = previewData.data_rows[selectedRowIndex + i];
                                  if (row) {
                                    newSelectedRows.push(row.row_index);
                                  }
                                }
                                setSelectedHeaderRows(newSelectedRows);
                              }
                            }
                          }}
                        >
                          <SelectTrigger className="w-full">
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem value="1">1 row</SelectItem>
                            <SelectItem value="2">2 rows</SelectItem>
                            <SelectItem value="3">3 rows</SelectItem>
                          </SelectContent>
                        </Select>
                      </div>
                    </div>
                  )}

                  {/* Manual multi-row header toggle - for manual selection when not auto-detected */}
                  {selectedHeaderRow > 0 && !multiRowHeader && (
                    <div className="mb-4">
                      <div className="flex items-center space-x-2">
                        <Checkbox
                          id="multi-row-header"
                          checked={multiRowHeader}
                          onCheckedChange={(checked) => {
                            setMultiRowHeader(checked as boolean);
                            if (checked) {
                              // Initialize with current selection
                              setSelectedHeaderRows([selectedHeaderRow]);
                              setHeaderRowCount(1);
                            } else {
                              setSelectedHeaderRows([]);
                            }
                            setUseCustomHeaderCount(false);
                            setCustomHeaderRowCount('');
                          }}
                        />
                        <Label
                          htmlFor="multi-row-header"
                          className="text-sm text-gray-700 cursor-pointer"
                        >
                          My headers span multiple rows
                        </Label>
                      </div>
                    </div>
                  )}

                  {/* Manual row selection display (when multi-row is manually enabled) */}
                  {selectedHeaderRow > 0 && multiRowHeader && selectedHeaderRows.length > 0 && (
                    <div className="mb-4">
                      <Label className="text-sm font-medium text-gray-700 mb-2 block">
                        Selected Header Rows
                      </Label>
                      <div className="flex flex-wrap gap-2">
                        {selectedHeaderRows.map((rowNum) => (
                          <span
                            key={rowNum}
                            className="inline-flex items-center px-2 py-1 bg-yellow-100 border border-yellow-400 rounded text-xs font-medium text-gray-900"
                          >
                            Row {rowNum}
                            <button
                              type="button"
                              onClick={(e) => {
                                e.stopPropagation();
                                handleHeaderSelectionChange(rowNum);
                              }}
                              className="ml-1 text-yellow-700 hover:text-yellow-900"
                            >
                              ×
                            </button>
                          </span>
                        ))}
                      </div>
                      <p className="text-xs text-gray-500 mt-2">
                        Click rows in the table to add/remove them from header selection.
                      </p>
                    </div>
                  )}
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

                {/* Next Steps Info */}
                <div className="bg-blue-50 border border-blue-200 rounded-lg p-4">
                  <p className="text-sm text-gray-700">
                    Next, we'll review your column names and give you a chance to rename them if needed.
                  </p>
                </div>
              </div>
            </div>
          </div>
        )}

        {/* Controls */}
        <div className="flex items-center justify-between gap-4 pt-4 border-t border-gray-200">
          <div className="flex items-center gap-2">
            <Button
              variant="outline"
              onClick={onBack}
              className="flex items-center gap-2"
            >
              <ArrowLeft className="w-4 h-4" />
              Back
            </Button>
            {onRestart && (
              <Button
                variant="ghost"
                onClick={onRestart}
                className="flex items-center gap-2 text-gray-600 hover:text-gray-900"
              >
                <RotateCcw className="w-4 h-4" />
                Restart Upload
              </Button>
            )}
          </div>
          <div className="flex items-center gap-2">
            {onCancel && (
              <Button
                variant="ghost"
                onClick={onCancel}
                className="flex items-center gap-2 text-gray-600 hover:text-gray-900"
              >
                <X className="w-4 h-4" />
                Cancel
              </Button>
            )}
            <Button
              onClick={handleContinue}
              disabled={loading || applyingHeader || !currentFile || !previewData || selectedHeaderRow === 0}
              className="flex items-center gap-2 bg-[#458EE2] hover:bg-[#3a7bc7]"
            >
              {applyingHeader ? (
                <>
                  <div className="inline-block animate-spin rounded-full h-4 w-4 border-b-2 border-white mr-2"></div>
                  Processing...
                </>
              ) : (
                <>
                  Continue
                  <ChevronRight className="w-4 h-4" />
                </>
              )}
            </Button>
          </div>
        </div>
      </div>
    </StageLayout>
  );
};
