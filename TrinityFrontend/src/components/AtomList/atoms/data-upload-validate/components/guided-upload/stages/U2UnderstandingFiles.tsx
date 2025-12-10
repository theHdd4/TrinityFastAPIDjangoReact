import React, { useEffect, useState, useMemo } from 'react';
import { FileText, AlertTriangle, CheckCircle2, ChevronRight, RotateCcw, X, ArrowLeft } from 'lucide-react';
import { VALIDATE_API } from '@/lib/api';
import { StageLayout } from '../components/StageLayout';
import type { ReturnTypeFromUseGuidedUploadFlow } from '../useGuidedUploadFlow';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Checkbox } from '@/components/ui/checkbox';
import { Input } from '@/components/ui/input';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';

interface U2UnderstandingFilesProps {
  flow: ReturnTypeFromUseGuidedUploadFlow;
  onNext: () => void;
  onBack: () => void;
  onRestart?: () => void;
  onCancel?: () => void;
}

interface PreviewRow {
  rowIndex: number;
  cells: (string | number | null)[];
  isMisaligned?: boolean;
  columnCount?: number;
  expectedColumnCount?: number;
  isDescriptionRow?: boolean; // Mark description/metadata rows
  relativeIndex?: number; // 0-indexed relative to data rows (for header selection)
}

interface HeaderDetection {
  suggestedRow: number;
  confidence: 'high' | 'medium' | 'low';
  reason?: string;
}

interface RowAlignmentIssue {
  rowIndex: number;
  issue: 'too_many_columns' | 'too_few_columns' | 'delimiter_mismatch' | 'missing_quotes';
  message: string;
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
  const [previewData, setPreviewData] = useState<PreviewRow[]>([]);
  const [headerDetection, setHeaderDetection] = useState<HeaderDetection | null>(null);
  const [selectedHeaderRow, setSelectedHeaderRow] = useState<number>(1);
  const [headerRowCount, setHeaderRowCount] = useState<number>(1);
  const [multiRowHeader, setMultiRowHeader] = useState(false);
  const [rowAlignmentIssues, setRowAlignmentIssues] = useState<RowAlignmentIssue[]>([]);
  const [delimiter, setDelimiter] = useState<string>('auto');
  const [customDelimiter, setCustomDelimiter] = useState<string>('');
  const [error, setError] = useState<string>('');
  const [columnNames, setColumnNames] = useState<string[]>([]);
  const [descriptionRows, setDescriptionRows] = useState<PreviewRow[]>([]);
  const [dataRowsStart, setDataRowsStart] = useState<number>(0);
  const [applyingHeader, setApplyingHeader] = useState(false);
  const [sheetMetadata, setSheetMetadata] = useState<{ rows: number; columns: number } | null>(null);
  const [noHeader, setNoHeader] = useState(false);

  const currentFile = uploadedFiles[selectedFileIndex];
  const currentHeaderSelection = currentFile ? headerSelections[currentFile.name] : null;
  const hasMultipleFiles = uploadedFiles.length > 1;
  const hasMultipleSheets = (currentFile?.sheetNames?.length || 0) > 1;

  // Detect header row using robust heuristics on actual data
  const detectHeaderRow = (rows: PreviewRow[]): HeaderDetection => {
    if (rows.length === 0) {
      return { suggestedRow: 1, confidence: 'low' };
    }

    // Analyze first 10 rows (headers are usually in first few rows)
    const candidates = rows.slice(0, Math.min(10, rows.length));
    let bestRow = 1;
    let bestScore = 0;
    const scores: Array<{ row: number; score: number; reasons: string[] }> = [];

    candidates.forEach((row, idx) => {
      let score = 0;
      const reasons: string[] = [];
      const rowNum = idx + 1;
      const cells = row.cells.filter(c => c !== null && String(c).trim().length > 0);
      const totalCells = row.cells.length;
      
      if (cells.length === 0) {
        // Empty row - unlikely to be header
        scores.push({ row: rowNum, score: 0, reasons: ['Empty row'] });
        return;
      }
      
      // 1. Check if row has mostly text values (headers are usually text, not numbers)
      const textCells = cells.filter(cell => {
        const str = String(cell).trim();
        // Check if it's NOT a number (or looks like text)
        const isNumber = !isNaN(Number(str)) && str !== '';
        const isDate = /^\d{4}-\d{2}-\d{2}/.test(str) || /^\d{2}\/\d{2}\/\d{4}/.test(str);
        return !isNumber && !isDate;
      });
      const textRatio = textCells.length / Math.max(1, cells.length);
      
      if (textRatio > 0.8) {
        score += 35;
        reasons.push('Mostly text values');
      } else if (textRatio > 0.5) {
        score += 20;
        reasons.push('Mix of text and numbers');
      }
      
      // 2. Check for title case, mixed case, or proper case (common in headers)
      const hasTitleCase = cells.some(cell => {
        const str = String(cell).trim();
        if (str.length === 0) return false;
        // Title case: First letter uppercase, rest lowercase or mixed
        const isTitleCase = /^[A-Z][a-z]/.test(str) || /^[A-Z][a-zA-Z\s]+$/.test(str);
        // Mixed case (not all uppercase, not all lowercase)
        const isMixedCase = str !== str.toUpperCase() && str !== str.toLowerCase() && str.length > 1;
        return isTitleCase || isMixedCase;
      });
      if (hasTitleCase) {
        score += 25;
        reasons.push('Title case or mixed case detected');
      }
      
      // 3. Check for common header patterns (words like "Name", "Date", "ID", "Total", etc.)
      const headerKeywords = ['name', 'id', 'date', 'time', 'total', 'sum', 'count', 'amount', 
                              'price', 'cost', 'value', 'type', 'category', 'status', 'description',
                              'code', 'number', 'qty', 'quantity', 'unit', 'rate', 'percent', '%'];
      const hasHeaderKeywords = cells.some(cell => {
        const str = String(cell).toLowerCase().trim();
        return headerKeywords.some(keyword => str.includes(keyword));
      });
      if (hasHeaderKeywords) {
        score += 30;
        reasons.push('Contains common header keywords');
      }
      
      // 4. Check for consistent structure (all cells filled, similar length)
      if (cells.length === totalCells && totalCells > 2) {
        score += 15;
        reasons.push('All cells filled');
      }
      
      // 5. Check if subsequent rows look like data (numbers, dates) - this row is likely header
      if (idx < rows.length - 1) {
        const nextRow = rows[idx + 1];
        const nextRowCells = nextRow.cells.filter(c => c !== null && String(c).trim().length > 0);
        const nextRowHasNumbers = nextRowCells.some(cell => {
          const str = String(cell).trim();
          return !isNaN(Number(str)) && str !== '';
        });
        if (nextRowHasNumbers && textRatio > 0.6) {
          score += 20;
          reasons.push('Next row contains data (numbers)');
        }
      }
      
      // 6. Prefer earlier rows (but not too much weight)
      if (rowNum <= 3) {
        score += 10;
        reasons.push('Early row position');
      } else if (rowNum <= 5) {
        score += 5;
      }
      
      // 7. Check for special characters that are common in headers (spaces, underscores, hyphens)
      const hasHeaderFormatting = cells.some(cell => {
        const str = String(cell).trim();
        return /[\s_\-]/.test(str) && str.length > 3;
      });
      if (hasHeaderFormatting) {
        score += 10;
        reasons.push('Header-like formatting');
      }
      
      // 8. Penalize rows that look like data (mostly numbers)
      const numberCells = cells.filter(cell => {
        const str = String(cell).trim();
        return !isNaN(Number(str)) && str !== '';
      });
      const numberRatio = numberCells.length / Math.max(1, cells.length);
      if (numberRatio > 0.7) {
        score -= 30; // Strong penalty - this looks like data, not header
        reasons.push('Mostly numeric (likely data)');
      }
      
      scores.push({ row: rowNum, score, reasons });
      
      if (score > bestScore) {
        bestScore = score;
        bestRow = rowNum;
      }
    });

    // Determine confidence based on score difference
    const sortedScores = scores.sort((a, b) => b.score - a.score);
    const topScore = sortedScores[0]?.score || 0;
    const secondScore = sortedScores[1]?.score || 0;
    const scoreDiff = topScore - secondScore;
    
    let confidence: 'high' | 'medium' | 'low' = 'low';
    if (topScore >= 70 && scoreDiff >= 20) {
      confidence = 'high';
    } else if (topScore >= 50 && scoreDiff >= 10) {
      confidence = 'medium';
    } else if (topScore >= 40) {
      confidence = 'medium';
    }

    const bestRowData = scores.find(s => s.row === bestRow);
    const reason = confidence === 'high' 
      ? `This row looks like your header based on: ${bestRowData?.reasons.slice(0, 2).join(', ')}.`
      : confidence === 'medium'
      ? `This row might be your header. ${bestRowData?.reasons[0] || ''}`
      : 'Please review and select the correct header row.';

    return {
      suggestedRow: bestRow,
      confidence,
      reason,
    };
  };

  // Detect row alignment issues
  const detectAlignmentIssues = (rows: PreviewRow[], expectedColumnCount: number): RowAlignmentIssue[] => {
    const issues: RowAlignmentIssue[] = [];
    
    rows.forEach((row, idx) => {
      const rowNum = idx + 1;
      const actualCount = row.cells.length;
      
      if (actualCount > expectedColumnCount) {
        issues.push({
          rowIndex: rowNum,
          issue: 'too_many_columns',
          message: `Row ${rowNum.toLocaleString()} has ${actualCount} columns, expected ${expectedColumnCount}. This might be due to unquoted text containing delimiters.`,
        });
      } else if (actualCount < expectedColumnCount && actualCount > 0) {
        issues.push({
          rowIndex: rowNum,
          issue: 'too_few_columns',
          message: `Row ${rowNum.toLocaleString()} has ${actualCount} columns, expected ${expectedColumnCount}.`,
        });
      }
    });

    return issues;
  };

  // Fetch preview data using new /file-preview endpoint
  useEffect(() => {
    const fetchPreview = async () => {
      if (!currentFile) return;
      
      setLoading(true);
      setError('');

        try {
        // Build query string for file-preview endpoint
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

        const data = await res.json();
        console.log('File preview data:', { 
          total_rows: data.total_rows, 
          data_rows_count: data.data_rows_count || data.data_rows?.length || 0,
          description_rows_count: data.description_rows?.length || 0,
          data_rows_start: data.data_rows_start,
          preview_row_count: data.preview_row_count,
          has_data_rows: !!data.data_rows && data.data_rows.length > 0,
          has_description_rows: !!data.description_rows && data.description_rows.length > 0,
        });
        
        // Store sheet metadata (rows, columns)
        if (data.total_rows !== undefined && data.column_count !== undefined) {
          setSheetMetadata({
            rows: data.total_rows,
            columns: data.column_count,
          });
        }
        
        // Check if we have data rows
        if (!data.data_rows || data.data_rows.length === 0) {
          if (data.error) {
            throw new Error(data.error);
          }
          throw new Error('No data rows found. The file may be empty or could not be parsed correctly.');
        }
        
        // STEP 1: Extract description rows (if any exist)
        const descRows: PreviewRow[] = [];
        if (data.description_rows && Array.isArray(data.description_rows)) {
          data.description_rows.forEach((descRow: any) => {
            descRows.push({
              rowIndex: descRow.row_index || 0, // 1-indexed absolute row number
              cells: descRow.cells || [],
              columnCount: descRow.cells?.length || 0,
              expectedColumnCount: data.column_count || 0,
              isDescriptionRow: true,
            });
          });
        }
        setDescriptionRows(descRows);
        setDataRowsStart(data.data_rows_start || 0);
        
        // STEP 2: Extract DATA ROWS ONLY (these are the rows user can select as header)
        const dataRows: PreviewRow[] = [];
        if (data.data_rows && Array.isArray(data.data_rows)) {
          data.data_rows.forEach((dataRow: any) => {
            dataRows.push({
              rowIndex: dataRow.row_index || 0, // 1-indexed absolute row number (for display)
              relativeIndex: dataRow.relative_index || 0, // 0-indexed relative to data rows (for header selection)
              cells: dataRow.cells || [],
              columnCount: dataRow.cells?.length || 0,
              expectedColumnCount: data.column_count || 0,
              isDescriptionRow: false, // These are data rows, not description rows
            });
          });
        }
        
        if (dataRows.length === 0) {
          throw new Error(data.error || 'No data rows found. Please check the file format.');
        }
        
        // STEP 3: Use backend's suggested header row (relative to data rows, 0-indexed)
        const suggestedHeaderRelative = data.suggested_header_row !== undefined ? data.suggested_header_row : 0;
        const suggestedHeaderAbsolute = data.suggested_header_row_absolute !== undefined 
          ? data.suggested_header_row_absolute + 1  // Convert to 1-indexed for display
          : (data.data_rows_start || 0) + suggestedHeaderRelative + 1;
        
        setHeaderDetection({
          suggestedRow: suggestedHeaderAbsolute,
          confidence: data.suggested_header_confidence || 'low',
          reason: `Backend detection suggests row ${suggestedHeaderAbsolute} (data row ${suggestedHeaderRelative + 1}) with ${data.suggested_header_confidence || 'low'} confidence.`,
        });
        
        // Set selected header row to the suggested one (using absolute row index for display)
        setSelectedHeaderRow(suggestedHeaderAbsolute);
        
        // STEP 4: Detect alignment issues (on data rows only)
        const columnCount = data.column_count || 0;
        const issues = detectAlignmentIssues(dataRows, columnCount);
        setRowAlignmentIssues(issues);
        
        // Mark misaligned rows
        const rowsWithIssues = dataRows.map(row => ({
          ...row,
          isMisaligned: issues.some(issue => issue.rowIndex === row.rowIndex),
        }));
        
        // Set preview data to DATA ROWS ONLY (description rows are shown separately)
        setPreviewData(rowsWithIssues);
        
        // Set column names (use Col 1, Col 2, etc. as placeholders)
        // Fix: Use dataRows instead of undefined allRows
        if (dataRows.length > 0 && dataRows[0].cells.length > 0) {
          setColumnNames(dataRows[0].cells.map((_, idx) => `Col ${idx + 1}`));
        }
        
        // Load saved header selection if exists
        if (currentHeaderSelection) {
          if (currentHeaderSelection.noHeader) {
            setNoHeader(true);
            setSelectedHeaderRow(0);
          } else {
            setNoHeader(false);
            setSelectedHeaderRow(currentHeaderSelection.headerRowIndex + 1);
            setHeaderRowCount(currentHeaderSelection.headerRowCount || 1);
            setMultiRowHeader(currentHeaderSelection.headerRowCount > 1);
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

  // Save header selection - rowIndex is absolute (1-indexed) for display
  // CRITICAL: Only data rows can be selected as headers (description rows are excluded)
  const handleHeaderSelectionChange = (rowIndex: number | 'none') => {
    if (rowIndex === 'none') {
      setNoHeader(true);
      setSelectedHeaderRow(0);
      if (currentFile) {
        setHeaderSelection(currentFile.name, {
          headerRowIndex: -1, // -1 indicates no header
          headerRowCount: 0,
          noHeader: true,
        });
      }
      return;
    }
    
    setNoHeader(false);
    // Find the data row - previewData only contains data rows now (description rows are separate)
    const dataRow = previewData.find(r => r.rowIndex === rowIndex);
    if (!dataRow || dataRow.isDescriptionRow) {
      return; // Safety check: Don't allow selecting description rows
    }
    
    setSelectedHeaderRow(rowIndex);
    if (currentFile) {
      // Store relative_index (0-indexed relative to data rows) for backend
      // This is what we'll send to /apply-header-selection
      const relativeIndex = dataRow.relativeIndex !== undefined 
        ? dataRow.relativeIndex 
        : (rowIndex - 1 - dataRowsStart); // Fallback calculation
      
      setHeaderSelection(currentFile.name, {
        headerRowIndex: relativeIndex, // 0-indexed relative to data rows
        headerRowCount: headerRowCount,
        noHeader: false,
      });
    }
  };

  const handleHeaderRowCountChange = (count: number) => {
    setHeaderRowCount(count);
    if (currentFile) {
      setHeaderSelection(currentFile.name, {
        headerRowIndex: selectedHeaderRow - 1,
        headerRowCount: count,
        noHeader: false,
      });
    }
  };

  const handleMultiRowHeaderToggle = (checked: boolean) => {
    setMultiRowHeader(checked);
    if (!checked) {
      setHeaderRowCount(1);
      handleHeaderRowCountChange(1);
    }
  };

  const handleDelimiterFix = (newDelimiter: string) => {
    setDelimiter(newDelimiter);
    // In production, this would re-fetch preview with new delimiter
    // For now, we'll just update the state
    if (newDelimiter === 'custom' && customDelimiter) {
      // Apply custom delimiter
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

  // Handle Continue - apply header selection and process file
  const handleContinue = async () => {
    if (!currentFile) return;
    
    // If no header selected, warn user or proceed with no header
    if (noHeader) {
      // TODO: Handle no header case - may need backend support
      setError('Please select a header row or contact support for files without headers.');
      return;
    }
    
    setApplyingHeader(true);
    setError('');
    
    try {
      // Get relative index from the selected data row
      // CRITICAL: header_row must be relative to data rows (0-indexed), not absolute
      const selectedDataRow = previewData.find(r => r.rowIndex === selectedHeaderRow);
      const relativeHeaderIndex = selectedDataRow?.relativeIndex !== undefined
        ? selectedDataRow.relativeIndex
        : Math.max(0, (selectedHeaderRow - 1) - dataRowsStart); // Fallback calculation
      
      // Call /apply-header-selection endpoint with FormData (backend expects Form, not JSON)
      const form = new FormData();
      form.append('object_name', currentFile.path);
      form.append('header_row', relativeHeaderIndex.toString()); // Backend expects 'header_row', not 'header_row_index'
      if (currentFile.selectedSheet) {
        form.append('sheet_name', currentFile.selectedSheet);
      }
      appendEnvFields(form);
      
      const res = await fetch(`${VALIDATE_API}/apply-header-selection`, {
        method: 'POST',
        credentials: 'include',
        body: form, // FormData - don't set Content-Type header, browser will set it with boundary
      });

      if (!res.ok) {
        const errorData = await res.json().catch(() => ({ detail: 'Failed to apply header selection' }));
        throw new Error(errorData.detail || 'Failed to apply header selection');
      }

      const result = await res.json();
      
      // Update flow state with processed file path
      if (result.file_path && currentFile) {
        // Update the uploaded file with processed path
        updateUploadedFilePath(currentFile.name, result.file_path);
        
        // Save header selection
        setHeaderSelection(currentFile.name, {
          headerRowIndex: selectedHeaderRow - 1,
          headerRowCount: headerRowCount,
          noHeader: false,
        });
      }
      
      // Move to next file or next stage
      if (selectedFileIndex < uploadedFiles.length - 1) {
        setSelectedFileIndex(selectedFileIndex + 1);
        setApplyingHeader(false);
      } else {
        // All files processed, move to next stage
        onNext();
      }
    } catch (err: any) {
      setError(err.message || 'Failed to apply header selection');
      setApplyingHeader(false);
    }
  };

  const expectedColumnCount = previewData.length > 0 
    ? previewData[0].expectedColumnCount || previewData[0].cells.length 
    : 0;

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
        {/* File Selection (if multiple files) */}
        {hasMultipleFiles && (
          <div className="bg-blue-50 border border-blue-200 rounded-lg p-4">
            <Label className="text-sm font-medium text-gray-700 mb-2 block">
              Select File to Review
            </Label>
            <Select
              value={selectedFileIndex.toString()}
              onValueChange={(value) => setSelectedFileIndex(parseInt(value, 10))}
            >
              <SelectTrigger className="w-full">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {uploadedFiles.map((file, idx) => (
                  <SelectItem key={idx} value={idx.toString()}>
                    {file.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
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
                const isRecommended = idx === 0; // First sheet is recommended
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

      {/* Data Preview - MANDATORY - Always shown */}
      <div className="space-y-6">
        {loading && (
          <div className="text-center py-8 border border-gray-200 rounded-lg bg-gray-50">
            <div className="inline-block animate-spin rounded-full h-8 w-8 border-b-2 border-[#458EE2]"></div>
            <p className="mt-4 text-sm text-gray-600">Loading file preview...</p>
          </div>
        )}
        
        {error && (
          <div className="bg-red-50 border border-red-200 rounded-lg p-4">
            <p className="text-sm text-red-600">{error}</p>
          </div>
        )}
        
        {!loading && !error && (
          <div className="space-y-6">
            {/* Description Rows Section */}
            {descriptionRows.length > 0 && (
              <div className="bg-gray-50 border border-gray-200 rounded-lg p-4">
                <Label className="text-sm font-medium text-gray-700 mb-3 block">
                  File Metadata / Description Rows
                </Label>
                <div className="space-y-2">
                  {descriptionRows.map((row, idx) => (
                    <div
                      key={idx}
                      className="bg-white border border-gray-200 rounded p-2 text-xs"
                    >
                      <div className="font-medium text-gray-600 mb-1">
                        Row {row.rowIndex} (Original file)
                      </div>
                      <div className="text-gray-700 flex flex-wrap gap-2">
                        {row.cells.map((cell, cellIdx) => {
                          const cellValue = cell !== null && cell !== undefined 
                            ? String(cell) 
                            : '';
                          return cellValue ? (
                            <span key={cellIdx} className="px-2 py-1 bg-gray-100 rounded">
                              {cellValue.length > 30 ? cellValue.substring(0, 30) + '...' : cellValue}
                            </span>
                          ) : null;
                        })}
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}

            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
              {/* Preview Panel */}
        <div className="space-y-4">
                <div className="flex items-center justify-between">
                  <h3 className="text-sm font-semibold text-gray-900">File Preview</h3>
                  <span className="text-xs text-gray-500">
                    Showing first {Math.min(previewData.length, 15)} rows
                  </span>
                </div>
              
              <div className="border border-gray-200 rounded-lg overflow-hidden">
                <div className="overflow-x-auto max-h-96">
                  <table className="w-full text-xs">
                    <thead className="bg-gray-50 sticky top-0">
                      <tr>
                        <th className="px-2 py-1.5 text-left font-medium text-gray-600 border-r border-gray-200">
                          Row
                        </th>
                        {previewData.length > 0 && previewData[0].cells.map((_, colIdx) => (
                          <th
                            key={colIdx}
                            className="px-2 py-1.5 text-left font-medium text-gray-600 border-r border-gray-200 last:border-r-0"
                            title={columnNames[colIdx] || `Column ${colIdx + 1}`}
                          >
                            {columnNames[colIdx] || `Col ${colIdx + 1}`}
                          </th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {previewData.map((row) => {
                        const isHeaderRow = row.rowIndex === selectedHeaderRow;
                        const isInHeaderRange = row.rowIndex >= selectedHeaderRow && 
                          row.rowIndex < selectedHeaderRow + headerRowCount;
                        const isDescRow = row.isDescriptionRow || false;
                        
                        return (
                          <tr
                            key={row.rowIndex}
                            className={`
                              ${isHeaderRow ? 'bg-[#458EE2] bg-opacity-10 border-2 border-[#458EE2]' : ''}
                              ${isInHeaderRange && !isHeaderRow ? 'bg-blue-50' : ''}
                              ${row.isMisaligned ? 'bg-yellow-50 border-l-4 border-yellow-400' : ''}
                              ${isDescRow ? 'bg-gray-100 opacity-75' : ''}
                              hover:bg-gray-50
                              ${!isDescRow ? 'cursor-pointer' : 'cursor-not-allowed'}
                            `}
                            onClick={() => !isDescRow && handleHeaderSelectionChange(row.rowIndex)}
                          >
                            <td className="px-2 py-1.5 font-medium text-gray-600 border-r border-gray-200">
                              {row.rowIndex}
                              {isHeaderRow && (
                                <span className="ml-1 text-[#458EE2]">✓</span>
                              )}
                              {isDescRow && (
                                <span className="ml-1 text-xs text-gray-500">(Metadata)</span>
                              )}
                            </td>
                            {row.cells.map((cell, cellIdx) => {
                              const cellValue = cell !== null && cell !== undefined 
                                ? (typeof cell === 'number' ? cell.toString() : String(cell))
                                : '';
                              const displayValue = cellValue.length > 20 
                                ? cellValue.substring(0, 20) + '...' 
                                : cellValue;

            return (
                                <td
                                  key={cellIdx}
                                  className="px-2 py-1.5 text-gray-700 border-r border-gray-200 last:border-r-0 truncate max-w-[120px]"
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

              {/* Row Alignment Issues */}
              {rowAlignmentIssues.length > 0 && (
                <div className="bg-yellow-50 border border-yellow-200 rounded-lg p-4">
                  <div className="flex items-start gap-2 mb-3">
                    <AlertTriangle className="w-5 h-5 text-yellow-600 mt-0.5 flex-shrink-0" />
                    <div className="flex-1">
                      <p className="text-sm font-medium text-yellow-900 mb-1">
                        Some rows appear misaligned
                      </p>
                      <p className="text-xs text-yellow-700">
                        This might be due to delimiter or formatting issues. Let's fix that before continuing.
                      </p>
                    </div>
                  </div>
                  
                  <div className="space-y-2">
                    {rowAlignmentIssues.slice(0, 3).map((issue, idx) => (
                      <p key={idx} className="text-xs text-yellow-800">
                        {issue.message}
                      </p>
                    ))}
                    {rowAlignmentIssues.length > 3 && (
                      <p className="text-xs text-yellow-600">
                        ...and {rowAlignmentIssues.length - 3} more issue{rowAlignmentIssues.length - 3 !== 1 ? 's' : ''}
                      </p>
                    )}
                  </div>

                  <div className="mt-4 space-y-2">
                    <p className="text-xs font-medium text-yellow-900 mb-2">Fix Options:</p>
                    <div className="flex flex-wrap gap-2">
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={() => handleDelimiterFix('quoted')}
                        className="text-xs"
                      >
                        Apply quoted CSV mode
                      </Button>
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={() => handleDelimiterFix('semicolon')}
                        className="text-xs"
                      >
                        Try semicolon delimiter
                      </Button>
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={() => handleDelimiterFix('pipe')}
                        className="text-xs"
                      >
                        Try pipe delimiter
                      </Button>
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={() => handleDelimiterFix('auto')}
                        className="text-xs"
                      >
                        Auto-detect delimiter
                      </Button>
                    </div>
                    <div className="flex items-center gap-2 mt-2">
                      <Input
                        placeholder="Custom delimiter"
                        value={customDelimiter}
                        onChange={(e) => setCustomDelimiter(e.target.value)}
                        className="h-8 text-xs"
                        onKeyDown={(e) => {
                          if (e.key === 'Enter' && customDelimiter) {
                            handleDelimiterFix('custom');
                          }
                        }}
                      />
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={() => handleDelimiterFix('custom')}
                        disabled={!customDelimiter}
                        className="text-xs"
                      >
                        Apply
                      </Button>
                    </div>
                  </div>
                        </div>
                      )}
              </div>
                        </div>

            {/* Header Selection Panel */}
            <div className="space-y-6">
              <div className="bg-white border border-gray-200 rounded-lg p-4">
                <h3 className="text-sm font-semibold text-gray-900 mb-4">Select Header Row</h3>
                
                {headerDetection && (
                  <div className={`mb-4 p-3 rounded-lg ${
                    headerDetection.confidence === 'high' 
                      ? 'bg-green-50 border border-green-200'
                      : headerDetection.confidence === 'medium'
                      ? 'bg-yellow-50 border border-yellow-200'
                      : 'bg-gray-50 border border-gray-200'
                  }`}>
                    <div className="flex items-start gap-2">
                      {headerDetection.confidence === 'high' && (
                        <CheckCircle2 className="w-5 h-5 text-green-600 mt-0.5 flex-shrink-0" />
                      )}
                      <div className="flex-1">
                        <p className="text-xs font-medium text-gray-900 mb-1">
                          {headerDetection.confidence === 'high' 
                            ? 'Suggested Header Row'
                            : headerDetection.confidence === 'medium'
                            ? 'Possible Header Row'
                            : 'Header Detection'}
                        </p>
                        <p className="text-xs text-gray-700">
                          {headerDetection.confidence === 'high' 
                            ? `This row looks like your header based on similar files uploaded earlier.`
                            : headerDetection.reason || `This row might be your header.`}
                        </p>
                      </div>
                    </div>
                        </div>
                      )}

                <RadioGroup
                  value={noHeader ? 'none' : selectedHeaderRow.toString()}
                  onValueChange={(value) => handleHeaderSelectionChange(value === 'none' ? 'none' : parseInt(value, 10))}
                >
                  {previewData.slice(0, Math.min(15, previewData.length)).map((row) => {
                    const isDescRow = row.isDescriptionRow || false;
                    return (
                      <div key={row.rowIndex} className="flex items-center space-x-2 mb-2">
                        <RadioGroupItem 
                          value={row.rowIndex.toString()} 
                          id={`row-${row.rowIndex}`}
                          disabled={isDescRow}
                        />
                        <Label
                          htmlFor={`row-${row.rowIndex}`}
                          className={`text-sm cursor-pointer flex-1 ${
                            isDescRow ? 'text-gray-400 cursor-not-allowed' : 'text-gray-700'
                          }`}
                        >
                          Row {row.rowIndex}
                          {headerDetection?.suggestedRow === row.rowIndex && (
                            <span className="ml-2 text-xs text-[#458EE2]">(Suggested)</span>
                          )}
                          {isDescRow && (
                            <span className="ml-2 text-xs text-gray-400">(Metadata - cannot be header)</span>
                          )}
                        </Label>
                      </div>
                    );
                  })}
                  {/* None of these are headers option */}
                  <div className="flex items-center space-x-2 mb-2 mt-4 pt-4 border-t border-gray-200">
                    <RadioGroupItem 
                      value="none" 
                      id="row-none"
                    />
                    <Label
                      htmlFor="row-none"
                      className="text-sm cursor-pointer flex-1 text-gray-700"
                    >
                      None of these are headers
                    </Label>
                  </div>
                </RadioGroup>

                <div className="mt-4 pt-4 border-t border-gray-200">
                  <div className="flex items-center space-x-2">
                    <Checkbox
                      id="multi-row-header"
                      checked={multiRowHeader}
                      onCheckedChange={handleMultiRowHeaderToggle}
                    />
                    <Label
                      htmlFor="multi-row-header"
                      className="text-sm text-gray-700 cursor-pointer"
                    >
                      My headers span multiple rows
                    </Label>
                  </div>

                  {multiRowHeader && (
                    <div className="mt-3">
                      <p className="text-xs text-gray-700 mb-2">
                        Your selected header row seems to span multiple rows. Select how many header rows you want to include.
                      </p>
                      <Select
                        value={headerRowCount.toString()}
                        onValueChange={(value) => handleHeaderRowCountChange(parseInt(value, 10))}
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
                      <p className="text-xs text-gray-500 mt-2">
                        Trinity will combine them automatically (e.g., "Sales" + "2024" → "Sales_2024").
                      </p>
                    </div>
                  )}
                </div>
              </div>

              {/* Warnings */}
              {headerDetection?.confidence === 'low' && !noHeader && (
                <div className="bg-yellow-50 border border-yellow-200 rounded-lg p-4">
                  <div className="flex items-start gap-2">
                    <AlertTriangle className="w-5 h-5 text-yellow-600 mt-0.5 flex-shrink-0" />
                    <p className="text-sm text-yellow-800">
                      I'm not fully sure where your column names are. Please select the correct row.
                    </p>
                  </div>
                </div>
              )}
              
              {/* Multiple likely rows warning */}
              {headerDetection && headerDetection.confidence === 'medium' && !noHeader && (
                <div className="bg-yellow-50 border border-yellow-200 rounded-lg p-4">
                  <div className="flex items-start gap-2">
                    <AlertTriangle className="w-5 h-5 text-yellow-600 mt-0.5 flex-shrink-0" />
                    <p className="text-sm text-yellow-800">
                      Two rows look like they could be your header. Please choose the correct one.
                    </p>
                  </div>
                </div>
              )}
              
              {/* Row alignment warning */}
              {rowAlignmentIssues.length > 0 && (
                <div className="bg-yellow-50 border border-yellow-200 rounded-lg p-4">
                  <div className="flex items-start gap-2">
                    <AlertTriangle className="w-5 h-5 text-yellow-600 mt-0.5 flex-shrink-0" />
                    <p className="text-sm text-yellow-800">
                      Some rows appear misaligned. Once headers are confirmed, I'll help you fix any formatting issues.
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
        )}
      </div>

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
              disabled={loading || applyingHeader || !currentFile || noHeader}
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
