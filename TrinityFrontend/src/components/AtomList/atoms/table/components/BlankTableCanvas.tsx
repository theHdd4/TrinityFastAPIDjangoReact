import React, { useState, useRef, useEffect, useCallback, useMemo } from 'react';
import { createPortal } from 'react-dom';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import '@/templates/tables/table.css';
import { editTableCell } from '../services/tableApi';
import { cn } from '@/lib/utils';
// Rich text disabled for testing. Uncomment to restore.
// import { TableRichTextEditor, TableRichTextToolbar } from './rich-text';
import { getTheme } from './design/tableThemes';
import { calculateAggregation, formatAggregation, getBorderClasses } from '../utils/tableUtils';

const STRETCH_COLUMN_THRESHOLD = 8; // Up to this many columns, auto-stretch to fill width
const STRETCH_MIN_WIDTH = 80;
const STRETCH_MAX_WIDTH = 240;

interface BlankTableCanvasProps {
  atomId: string;
  tableId: string;
  rows: number;
  columns: number;
  columnNames: string[]; // Internal identifiers (col_0, col_1, etc.)
  settings: any;
  onSettingsChange?: (settings: any) => void;
}

const BlankTableCanvas: React.FC<BlankTableCanvasProps> = ({
  atomId,
  tableId,
  rows,
  columns,
  columnNames,
  settings,
  onSettingsChange
}) => {
  const [editingCell, setEditingCell] = useState<{row: number, colIdx: number} | null>(null);
  const [editingCellValue, setEditingCellValue] = useState<string>('');
  const [editingCellHtml, setEditingCellHtml] = useState<string>('');
  const [cellValues, setCellValues] = useState<Record<string, Record<number, any>>>({});
  const editInputRef = useRef<HTMLInputElement>(null);
  const toolbarRef = useRef<HTMLDivElement>(null);
  const [showToolbar, setShowToolbar] = useState(false);
  const portalTarget = typeof document !== 'undefined' ? document.body : null;
  const [toolbarCellRect, setToolbarCellRect] = useState<{ top: number; left: number; width: number } | null>(null);
  const containerRef = useRef<HTMLDivElement | null>(null);
  const [containerWidth, setContainerWidth] = useState<number>(0);
  
  // Resize state
  const [resizingCol, setResizingCol] = useState<{colIdx: number, startX: number, startWidth: number} | null>(null);
  const [resizingRow, setResizingRow] = useState<{rowIdx: number, startY: number, startHeight: number} | null>(null);
  const rowRefs = useRef<{ [key: number]: HTMLTableRowElement | null }>({});

  // Rich text formatting state for current editing cell
  const [cellFormatting, setCellFormatting] = useState<{
    fontFamily: string;
    fontSize: number;
    bold: boolean;
    italic: boolean;
    underline: boolean;
    strikethrough: boolean;
    textColor: string;
    backgroundColor: string;
    textAlign: 'left' | 'center' | 'right';
  }>({
    fontFamily: 'Arial',
    fontSize: 12,
    bold: false,
    italic: false,
    underline: false,
    strikethrough: false,
    textColor: '#000000',
    backgroundColor: 'transparent',
    textAlign: 'left',
  });

  // Get layout and design settings with defaults
  const layout = settings.layout || {
    headerRow: false,
    totalRow: false,
    bandedRows: false,
    bandedColumns: false,
    firstColumn: false,
    lastColumn: false,
  };
  const design = settings.design || {
    theme: 'plain',
    borderStyle: 'all',
  };
  const totalRowConfig = settings.totalRowConfig || {};
  const useHeaderRow = layout.headerRow || false;
  
  // Get theme
  const theme = getTheme(design.theme);
  
  // Calculate actual data rows (if header row is ON, first row is header, not data)
  const dataRowCount = useHeaderRow ? rows : rows;
  const actualDataRows = useHeaderRow ? rows - 1 : rows; // If header row, first row is header

  // Get column identifier (internal: col_0, col_1, etc.)
  const getColumnId = (colIdx: number) => {
    return columnNames[colIdx] || `col_${colIdx}`;
  };

  // Observe container width for auto-stretching when column count is small
  useEffect(() => {
    const node = containerRef.current;
    if (!node) return;

    const measure = () => setContainerWidth(node.clientWidth || 0);
    measure();

    let ro: ResizeObserver | undefined;
    if (typeof ResizeObserver !== 'undefined') {
      ro = new ResizeObserver(() => measure());
      ro.observe(node);
    }
    window.addEventListener('resize', measure);

    return () => {
      if (ro && node) ro.unobserve(node);
      window.removeEventListener('resize', measure);
    };
  }, []);

  const hasCustomColumnWidths = useMemo(() => {
    return !!settings.columnWidths && Object.keys(settings.columnWidths).length > 0;
  }, [settings.columnWidths]);

  // Get column widths with auto-stretch when few columns and no custom widths
  const getColumnWidth = (colIdx: number) => {
    const colId = getColumnId(colIdx);

    // Custom width wins
    const custom = settings.columnWidths?.[colId];
    if (custom) return custom;

    const shouldStretch = columns <= STRETCH_COLUMN_THRESHOLD;
    if (shouldStretch && containerWidth > 0 && columns > 0) {
      const stretchWidth = Math.min(
        STRETCH_MAX_WIDTH,
        Math.max(STRETCH_MIN_WIDTH, containerWidth / columns)
      );
      return stretchWidth;
    }

    // Default width
    return 112.5;
  };

  // Get row height (default: 10 units = 30px for blank tables)
  const getRowHeight = (rowIdx?: number) => {
    if (rowIdx !== undefined && settings.rowHeights?.[rowIdx]) {
      return settings.rowHeights[rowIdx];
    }
    return settings.rowHeight || 30;
  };

  // Helper function to darken a color
  const darkenColor = (color: string, percent: number): string => {
    // Handle hex colors
    if (color.startsWith('#')) {
      const num = parseInt(color.replace('#', ''), 16);
      const r = Math.max(0, Math.floor((num >> 16) * (1 - percent / 100)));
      const g = Math.max(0, Math.floor(((num >> 8) & 0x00FF) * (1 - percent / 100)));
      const b = Math.max(0, Math.floor((num & 0x0000FF) * (1 - percent / 100)));
      return `#${((r << 16) | (g << 8) | b).toString(16).padStart(6, '0')}`;
    }
    // Handle rgb/rgba colors
    if (color.startsWith('rgb')) {
      const matches = color.match(/\d+/g);
      if (matches && matches.length >= 3) {
        const r = Math.max(0, Math.floor(parseInt(matches[0]) * (1 - percent / 100)));
        const g = Math.max(0, Math.floor(parseInt(matches[1]) * (1 - percent / 100)));
        const b = Math.max(0, Math.floor(parseInt(matches[2]) * (1 - percent / 100)));
        return `rgb(${r}, ${g}, ${b})`;
      }
    }
    // Fallback: return original color
    return color;
  };

  // Start column resize
  const startColumnResize = (colIdx: number, e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    
    const colId = getColumnId(colIdx);
    const currentWidth = getColumnWidth(colIdx);
    const startX = e.clientX;
    
    setResizingCol({ colIdx, startX, startWidth: currentWidth });
    document.body.style.cursor = 'col-resize';
    document.body.style.userSelect = 'none';
  };

  // Start row resize
  const startRowResize = (rowIdx: number, e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    
    const rowElement = rowRefs.current[rowIdx];
    const currentHeight = rowElement?.offsetHeight || getRowHeight(rowIdx);
    const startY = e.clientY;
    
    setResizingRow({ rowIdx, startY, startHeight: currentHeight });
    document.body.style.cursor = 'row-resize';
    document.body.style.userSelect = 'none';
  };

  // Handle mouse move during resize
  useEffect(() => {
    const handleMouseMove = (e: MouseEvent) => {
      if (resizingCol) {
        const delta = e.clientX - resizingCol.startX;
        const newWidth = Math.max(Math.min(resizingCol.startWidth + delta, 500), 50);
        const colId = getColumnId(resizingCol.colIdx);
        
        if (onSettingsChange) {
          onSettingsChange({
            columnWidths: {
              ...settings.columnWidths,
              [colId]: newWidth,
            },
          });
        }
      }
      
      if (resizingRow) {
        const deltaY = e.clientY - resizingRow.startY;
        const newHeight = Math.max(resizingRow.startHeight + deltaY, 20);
        
        if (onSettingsChange) {
          const currentRowHeights = settings.rowHeights || {};
          onSettingsChange({
            rowHeights: {
              ...currentRowHeights,
              [resizingRow.rowIdx]: newHeight,
            },
          });
        }
      }
    };
    
    const handleMouseUp = () => {
      if (resizingCol) {
        setResizingCol(null);
        document.body.style.cursor = '';
        document.body.style.userSelect = '';
      }
      if (resizingRow) {
        setResizingRow(null);
        document.body.style.cursor = '';
        document.body.style.userSelect = '';
      }
    };
    
    if (resizingCol || resizingRow) {
      document.addEventListener('mousemove', handleMouseMove);
      document.addEventListener('mouseup', handleMouseUp);
    }
    
    return () => {
      document.removeEventListener('mousemove', handleMouseMove);
      document.removeEventListener('mouseup', handleMouseUp);
      document.body.style.cursor = '';
      document.body.style.userSelect = '';
    };
  }, [resizingCol, resizingRow, settings.columnWidths, settings.rowHeights, onSettingsChange, columnNames]);

  // Get cell value
  const getCellValue = (rowIdx: number, colIdx: number) => {
    return cellValues[rowIdx]?.[colIdx] ?? '';
  };

  // Get header value for a column (when header row is ON, use first row cell value)
  const getHeaderValue = (colIdx: number): string => {
    if (!useHeaderRow) {
      return getColumnId(colIdx); // Return colId if header row is OFF
    }
    // Get value from row 0 (header row)
    const headerValue = getCellValue(0, colIdx);
    // If header value is empty, fallback to colId
    return headerValue && headerValue.trim() !== '' ? headerValue.trim() : getColumnId(colIdx);
  };

  // Create mapping: headerValue → colId (for total row config lookup)
  const headerToColIdMap = useMemo(() => {
    const map: Record<string, string> = {};
    columnNames.forEach((colId, colIdx) => {
      const headerValue = getHeaderValue(colIdx);
      map[headerValue] = colId;
    });
    return map;
  }, [columnNames, useHeaderRow, cellValues, settings.tableData]);
  
  // Get data rows for aggregation (exclude header row if present)
  // Moved after getCellValue to avoid initialization error
  const dataRowsForAggregation = useMemo(() => {
    const startRow = useHeaderRow ? 1 : 0;
    return Array.from({ length: actualDataRows }, (_, idx) => {
      const rowIdx = startRow + idx;
      const row: Record<string, any> = {};
      columnNames.forEach((colId, colIdx) => {
        // Get value from cellValues (local state) or from settings.tableData (persisted)
        // Inline the getCellValue logic to avoid dependency issues
        const localValue = cellValues[rowIdx]?.[colIdx];
        if (localValue !== '' && localValue !== null && localValue !== undefined) {
          row[colId] = localValue;
        } else if (settings.tableData?.rows?.[rowIdx]?.[colId]) {
          row[colId] = settings.tableData.rows[rowIdx][colId];
        }
      });
      return row;
    });
  }, [actualDataRows, useHeaderRow, columnNames, cellValues, settings.tableData]);

  // Get cell formatting from settings
  const getCellFormatting = useCallback((rowIdx: number, colIdx: number) => {
    const rowKey = `row_${rowIdx}`;
    const colKey = `col_${colIdx}`;
    const cellFormat = settings.cellFormatting?.[rowKey]?.[colKey];
    
    if (cellFormat) {
      return {
        fontFamily: cellFormat.fontFamily || 'Arial',
        fontSize: cellFormat.fontSize || 12,
        bold: cellFormat.bold || false,
        italic: cellFormat.italic || false,
        underline: cellFormat.underline || false,
        strikethrough: cellFormat.strikethrough || false,
        textColor: cellFormat.textColor || '#000000',
        backgroundColor: cellFormat.backgroundColor || 'transparent',
        textAlign: (cellFormat.textAlign || 'left') as TextAlignOption,
      };
    }
    
    // Return default formatting
    return {
      fontFamily: 'Arial',
      fontSize: 12,
      bold: false,
      italic: false,
      underline: false,
      strikethrough: false,
      textColor: '#000000',
      backgroundColor: 'transparent',
      textAlign: 'left' as TextAlignOption,
    };
  }, [settings.cellFormatting]);

  // Handle cell edit (internal function - called by commitCellEdit)
  const handleCellEdit = async (rowIdx: number, colIdx: number, newValue: string) => {
    const colId = getColumnId(colIdx);

    // Update local state immediately for responsiveness
    setCellValues(prev => ({
      ...prev,
      [rowIdx]: {
        ...(prev[rowIdx] || {}),
        [colIdx]: newValue
      }
    }));

    // Call backend to update session (use internal column identifier)
    await editTableCell(tableId, rowIdx, colId, newValue);

    // Update settings.tableData for persistence (like DataFrame Operations)
    if (onSettingsChange) {
      const currentTableData = settings.tableData || { rows: [], columns: [], row_count: rows };
      const updatedRows = [...(currentTableData.rows || [])];
      
      // Ensure row exists
      if (!updatedRows[rowIdx]) {
        updatedRows[rowIdx] = {};
      }
      
      // Update cell value
      updatedRows[rowIdx] = {
        ...updatedRows[rowIdx],
        [colId]: newValue
      };
      
      // Update settings
      onSettingsChange({
        tableData: {
          ...currentTableData,
          rows: updatedRows
        }
      });
    }
  };

  // Commit cell edit (like DataFrame Operations - clear state before API call)
  const commitCellEdit = async (rowIdx: number, colIdx: number) => {
    // Prevent multiple commits if already committing or cell doesn't match
    if (!editingCell || (editingCell.row !== rowIdx || editingCell.colIdx !== colIdx)) {
      return;
    }
    
    // Save the value before clearing state
    const valueToSave = editingCellValue || '';
    const htmlToSave = editingCellHtml || valueToSave;
    
    // Clear editing state immediately to prevent double-commits
    setEditingCell(null);
    setEditingCellValue('');
    setEditingCellHtml('');
    setShowToolbar(false);
    
    // Call API to save the value
    try {
      await handleCellEdit(rowIdx, colIdx, valueToSave);
      
      // Save formatting to settings
      if (onSettingsChange) {
        const rowKey = `row_${rowIdx}`;
        const colKey = `col_${colIdx}`;
        const currentFormatting = settings.cellFormatting || {};
        const updatedFormatting = {
          ...currentFormatting,
          [rowKey]: {
            ...(currentFormatting[rowKey] || {}),
            [colKey]: {
              html: htmlToSave,
              fontFamily: cellFormatting.fontFamily,
              fontSize: cellFormatting.fontSize,
              bold: cellFormatting.bold,
              italic: cellFormatting.italic,
              underline: cellFormatting.underline,
              strikethrough: cellFormatting.strikethrough,
              textColor: cellFormatting.textColor,
              backgroundColor: cellFormatting.backgroundColor,
              textAlign: cellFormatting.textAlign,
            }
          }
        };
        
        onSettingsChange({
          cellFormatting: updatedFormatting
        });
      }
    } catch (error) {
      // If save fails, restore editing state so user can try again
      setEditingCell({ row: rowIdx, colIdx: colIdx });
      setEditingCellValue(valueToSave);
      setEditingCellHtml(htmlToSave);
      setShowToolbar(true);
      // Don't show alert - just restore state
    }
  };

  const handleCellClick = (rowIdx: number, colIdx: number) => {
    const currentValue = getCellValue(rowIdx, colIdx);
    setEditingCell({ row: rowIdx, colIdx: colIdx });
    setEditingCellValue(String(currentValue ?? ''));
    
    // Load formatting for this cell
    const formatting = getCellFormatting(rowIdx, colIdx);
    setCellFormatting(formatting);
    
    // Load HTML if available
    const rowKey = `row_${rowIdx}`;
    const colKey = `col_${colIdx}`;
    const cellFormat = settings.cellFormatting?.[rowKey]?.[colKey];
    setEditingCellHtml(cellFormat?.html || String(currentValue ?? ''));
    
    // Show toolbar
    setShowToolbar(true);
  };

  // Restore cell values from settings on mount (for persistence)
  useEffect(() => {
    if (settings.tableData?.rows && Array.isArray(settings.tableData.rows)) {
      const restoredValues: Record<string, Record<number, any>> = {};
      
      settings.tableData.rows.forEach((row: Record<string, any>, rowIdx: number) => {
        if (row && typeof row === 'object') {
          Object.entries(row).forEach(([colKey, value]) => {
            // Find column index from column name (col_0, col_1, etc.)
            const colIdx = columnNames.findIndex(col => col === colKey);
            if (colIdx >= 0 && value !== null && value !== undefined && value !== '') {
              if (!restoredValues[rowIdx]) {
                restoredValues[rowIdx] = {};
              }
              restoredValues[rowIdx][colIdx] = value;
            }
          });
        }
      });
      
      if (Object.keys(restoredValues).length > 0) {
        setCellValues(restoredValues);
      }
    }
  }, []); // Run once on mount

  // Position toolbar near editing cell
  useEffect(() => {
    if (!editingCell || !showToolbar) {
      setToolbarCellRect(null);
      return;
    }
    
    const editorElements = document.querySelectorAll('[contenteditable="true"]');
    const activeEditor = Array.from(editorElements).find(el => 
      el === document.activeElement || el.contains(document.activeElement)
    );
    
    if (activeEditor) {
      const rect = activeEditor.getBoundingClientRect();
      setToolbarCellRect({
        top: rect.top + window.scrollY,
        left: rect.left + window.scrollX,
        width: rect.width,
      });
    } else {
      setToolbarCellRect(null);
    }
  }, [editingCell, showToolbar]);

  return (
    <div className="flex-1 overflow-auto min-h-0 w-full" ref={containerRef}>
      <div className="table-wrapper w-full min-w-full">
        <div className="table-overflow w-full min-w-full">
          <Table className="table-base w-full" style={{ width: '100%', minWidth: '100%' }}>
            {/* Header row (if enabled) - first row becomes column headers */}
            {useHeaderRow && (
              <TableHeader>
                <TableRow className="table-row">
                  {Array.from({ length: columns }, (_, colIdx) => {
                    const isEditing = editingCell?.row === 0 && editingCell?.colIdx === colIdx;
                    const value = getCellValue(0, colIdx);

                      // Apply theme and layout styles
                      const isFirstCol = colIdx === 0 && layout.firstColumn;
                      const isLastCol = colIdx === columns - 1 && layout.lastColumn;
                      const isBandedCol = layout.bandedColumns && colIdx % 2 === 0;
                      
                      // Determine background color for header row
                      let headerBgColor = theme.colors.headerBg;
                      
                      // Apply banded columns to header
                      if (layout.bandedColumns && !layout.bandedRows) {
                        headerBgColor = isBandedCol ? theme.colors.evenRowBg : theme.colors.oddRowBg;
                      }
                      
                      // Apply column emphasis (use darkened banded color)
                      if (isFirstCol && layout.firstColumn) {
                        // Use the current headerBgColor (which already accounts for banded columns)
                        headerBgColor = darkenColor(headerBgColor, 15);
                      } else if (isLastCol && layout.lastColumn) {
                        // Use the current headerBgColor (which already accounts for banded columns)
                        headerBgColor = darkenColor(headerBgColor, 15);
                      }
                      
                      return (
                        <TableHead
                          key={colIdx}
                          className={cn(
                            "table-cell cursor-pointer font-semibold",
                            getBorderClasses(design.borderStyle, true, true, isFirstCol, isLastCol),
                            isEditing && "p-0",
                            isFirstCol && "sticky left-0 z-10",
                            isLastCol && layout.lastColumn && "font-bold"
                          )}
                          style={{ 
                            backgroundColor: headerBgColor,
                            color: theme.colors.headerText,
                            fontWeight: (isFirstCol && layout.firstColumn) || (isLastCol && layout.lastColumn) ? 'bold' : 'semibold',
                            minWidth: `${getColumnWidth(colIdx)}px`,
                            maxWidth: `${getColumnWidth(colIdx)}px`,
                            height: `${getRowHeight()}px`,
                            position: 'relative',
                           ...(isFirstCol && layout.firstColumn && { position: 'sticky', left: 0, zIndex: 10 }),
                          }}
                        onClick={() => !isEditing && handleCellClick(0, colIdx)}
                      >
                        {isEditing ? (
                          <input
                            className="w-full h-full px-2 py-1 text-xs"
                            style={{ minHeight: `${getRowHeight()}px` }}
                            autoFocus
                            value={editingCellValue}
                            onChange={(e) => {
                              setEditingCellValue(e.target.value);
                              setEditingCellHtml(e.target.value);
                            }}
                            onBlur={() => commitCellEdit(0, colIdx)}
                            onKeyDown={(e) => {
                              if (e.key === 'Enter') {
                                commitCellEdit(0, colIdx);
                              }
                              if (e.key === 'Escape') {
                                setEditingCell(null);
                                setShowToolbar(false);
                              }
                            }}
                          />
                        ) : (
                          <div 
                            className="table-cell-content h-full flex items-center text-left overflow-hidden font-semibold"
                            style={{
                              whiteSpace: 'nowrap',
                              textOverflow: 'ellipsis',
                              padding: '2px 4px',
                              width: '100%',
                              boxSizing: 'border-box',
                              ...(() => {
                                const format = getCellFormatting(0, colIdx);
                                const rowKey = `row_0`;
                                const colKey = `col_${colIdx}`;
                                const cellFormat = settings.cellFormatting?.[rowKey]?.[colKey];
                                return {
                                  fontFamily: format.fontFamily,
                                  fontSize: `${format.fontSize}px`,
                                  color: format.textColor,
                                  backgroundColor: format.backgroundColor,
                                  textAlign: format.textAlign,
                                  fontWeight: format.bold ? 'bold' : 'normal',
                                  fontStyle: format.italic ? 'italic' : 'normal',
                                  textDecoration: [
                                    format.underline ? 'underline' : '',
                                    format.strikethrough ? 'line-through' : ''
                                  ].filter(Boolean).join(' ') || 'none'
                                };
                              })()
                            }}
                            dangerouslySetInnerHTML={{ 
                              __html: (() => {
                                const rowKey = `row_0`;
                                const colKey = `col_${colIdx}`;
                                const cellFormat = settings.cellFormatting?.[rowKey]?.[colKey];
                                return cellFormat?.html || (value || `Column ${colIdx + 1}`);
                              })()
                            }}
                          />
                        )}
                        
                        {/* Column Resize Handle */}
                        <div
                          className="absolute top-0 right-0 h-full cursor-col-resize bg-blue-300 opacity-0 hover:opacity-100 transition-opacity duration-150"
                          onMouseDown={(e) => {
                            e.stopPropagation();
                            e.preventDefault();
                            startColumnResize(colIdx, e);
                          }}
                          style={{
                            zIndex: 20,
                            pointerEvents: 'auto',
                            right: '-2px',
                            width: '4px',
                          }}
                          title="Drag to resize column"
                        />
                      </TableHead>
                    );
                  })}
                </TableRow>
              </TableHeader>
            )}
            
            {/* Data rows */}
            <TableBody>
              {Array.from({ length: actualDataRows }, (_, rowOffset) => {
                // If header row is ON, data rows start from index 1 (skip row 0 which is header)
                // If header row is OFF, data rows start from index 0
                const actualRowIdx = useHeaderRow ? rowOffset + 1 : rowOffset;
                
                return (
                  <TableRow 
                    key={actualRowIdx} 
                    className="table-row"
                    ref={(el) => {
                      rowRefs.current[actualRowIdx] = el;
                    }}
                    style={{ position: 'relative' }}
                  >
                    {Array.from({ length: columns }, (_, colIdx) => {
                      const isEditing = editingCell?.row === actualRowIdx && editingCell?.colIdx === colIdx;
                      const value = getCellValue(actualRowIdx, colIdx);

                      // Apply theme and layout styles
                      const isFirstCol = colIdx === 0 && layout.firstColumn;
                      const isLastCol = colIdx === columns - 1 && layout.lastColumn;
                      const isBandedRow = layout.bandedRows && rowOffset % 2 === 0;
                      const isBandedCol = layout.bandedColumns && colIdx % 2 === 0;
                      const isFirstRow = rowOffset === 0;
                      
                      // Determine background color based on theme and layout
                      let backgroundColor = theme.colors.oddRowBg;
                      
                      // Apply banded rows only
                      if (layout.bandedRows && !layout.bandedColumns) {
                        backgroundColor = isBandedRow ? theme.colors.evenRowBg : theme.colors.oddRowBg;
                      }
                      // Apply banded columns only
                      else if (layout.bandedColumns && !layout.bandedRows) {
                        backgroundColor = isBandedCol ? theme.colors.evenRowBg : theme.colors.oddRowBg;
                      }
                      // Both banded: combine row and column banding (4 color combinations)
                      else if (layout.bandedRows && layout.bandedColumns) {
                        // Create 4 distinct color combinations:
                        // Even row + Even column → evenRowBg (lightest)
                        // Even row + Odd column → oddRowBg (darker)
                        // Odd row + Even column → oddRowBg (darker)
                        // Odd row + Odd column → evenRowBg (lightest)
                        if (isBandedRow && isBandedCol) {
                          // Even row + Even column
                          backgroundColor = theme.colors.evenRowBg;
                        } else if (isBandedRow && !isBandedCol) {
                          // Even row + Odd column
                          backgroundColor = theme.colors.oddRowBg;
                        } else if (!isBandedRow && isBandedCol) {
                          // Odd row + Even column
                          backgroundColor = theme.colors.oddRowBg;
                        } else {
                          // Odd row + Odd column
                          backgroundColor = theme.colors.evenRowBg;
                        }
                      }
                      
                      // Override with column emphasis colors if enabled (use darkened banded color)
                      if (isFirstCol && layout.firstColumn) {
                        // Use the current backgroundColor (which already accounts for banded rows/columns)
                        backgroundColor = darkenColor(backgroundColor, 15);
                      } else if (isLastCol && layout.lastColumn) {
                        // Use the current backgroundColor (which already accounts for banded rows/columns)
                        backgroundColor = darkenColor(backgroundColor, 15);
                      }
                      
                      return (
                        <TableCell
                          key={colIdx}
                          className={cn(
                            "table-cell cursor-pointer",
                            getBorderClasses(design.borderStyle, false, isFirstRow, isFirstCol, isLastCol),
                            isEditing && "p-0",
                            isFirstCol && "sticky left-0 z-10",
                            (isFirstCol && layout.firstColumn) || (isLastCol && layout.lastColumn) ? "font-bold" : ""
                          )}
                          style={{ 
                            backgroundColor: backgroundColor,
                            color: theme.colors.cellText,
                            fontWeight: (isFirstCol && layout.firstColumn) || (isLastCol && layout.lastColumn) ? 'bold' : 'normal',
                            minWidth: `${getColumnWidth(colIdx)}px`,
                            maxWidth: `${getColumnWidth(colIdx)}px`,
                            height: `${getRowHeight(actualRowIdx)}px`,
                            position: 'relative',
                           ...(isFirstCol && layout.firstColumn && { position: 'sticky', left: 0, zIndex: 10 }),
                          }}
                          onClick={() => !isEditing && handleCellClick(actualRowIdx, colIdx)}
                        >
                          {isEditing ? (
                            <input
                              className="w-full h-full px-2 py-1 text-xs"
                              style={{ minHeight: `${getRowHeight(actualRowIdx)}px` }}
                              autoFocus
                              value={editingCellValue}
                              onChange={(e) => {
                                setEditingCellValue(e.target.value);
                                setEditingCellHtml(e.target.value);
                              }}
                              onBlur={() => commitCellEdit(actualRowIdx, colIdx)}
                              onKeyDown={(e) => {
                                if (e.key === 'Enter') {
                                  commitCellEdit(actualRowIdx, colIdx);
                                }
                                if (e.key === 'Escape') {
                                  setEditingCell(null);
                                  setShowToolbar(false);
                                }
                              }}
                            />
                          ) : (
                            <div 
                              className="table-cell-content h-full flex items-center text-left overflow-hidden"
                              style={{
                                whiteSpace: 'nowrap',
                                textOverflow: 'ellipsis',
                                padding: '2px 4px',
                                width: '100%',
                                boxSizing: 'border-box',
                                ...(() => {
                                  const format = getCellFormatting(actualRowIdx, colIdx);
                                  const rowKey = `row_${actualRowIdx}`;
                                  const colKey = `col_${colIdx}`;
                                  return {
                                    fontFamily: format.fontFamily,
                                    fontSize: `${format.fontSize}px`,
                                    color: format.textColor,
                                    backgroundColor: format.backgroundColor,
                                    textAlign: format.textAlign,
                                    fontWeight: format.bold ? 'bold' : 'normal',
                                    fontStyle: format.italic ? 'italic' : 'normal',
                                    textDecoration: [
                                      format.underline ? 'underline' : '',
                                      format.strikethrough ? 'line-through' : ''
                                    ].filter(Boolean).join(' ') || 'none'
                                  };
                                })()
                              }}
                              dangerouslySetInnerHTML={{ 
                                __html: (() => {
                                  const rowKey = `row_${actualRowIdx}`;
                                  const colKey = `col_${colIdx}`;
                                  const cellFormat = settings.cellFormatting?.[rowKey]?.[colKey];
                                  return cellFormat?.html || (value || '');
                                })()
                            }}
                          />
                          )}
                          
                          {/* Column Resize Handle */}
                          <div
                            className="absolute top-0 right-0 h-full cursor-col-resize bg-blue-300 opacity-0 hover:opacity-100 transition-opacity duration-150"
                            onMouseDown={(e) => {
                              e.stopPropagation();
                              e.preventDefault();
                              startColumnResize(colIdx, e);
                            }}
                            style={{
                              zIndex: 20,
                              pointerEvents: 'auto',
                              right: '-2px',
                              width: '4px',
                            }}
                            title="Drag to resize column"
                          />
                        </TableCell>
                      );
                    })}
                    
                    {/* Row Resize Handle */}
                    <div
                      className="absolute bottom-0 left-0 w-full h-1 cursor-row-resize bg-blue-300 opacity-0 hover:opacity-100 transition-opacity duration-150 z-20"
                      onMouseDown={(e) => {
                        e.stopPropagation();
                        e.preventDefault();
                        startRowResize(actualRowIdx, e);
                      }}
                      style={{
                        zIndex: 20,
                      }}
                      title="Drag to resize row"
                    />
                  </TableRow>
                );
              })}
            </TableBody>
            
            {/* Total Row (if enabled) */}
            {layout.totalRow && (
              <tfoot>
                <TableRow className="table-row total-row">
                  {Array.from({ length: columns }, (_, colIdx) => {
                    const colId = getColumnId(colIdx);
                    // Use header value for totalRowConfig lookup when header row is ON
                    const headerValue = getHeaderValue(colIdx);
                    const configKey = useHeaderRow ? headerValue : colId;
                    const aggType = totalRowConfig[configKey] || 'none';
                    const aggValue = aggType !== 'none' 
                      ? calculateAggregation(dataRowsForAggregation, colId, aggType)
                      : '';
                    const formattedValue = aggType !== 'none' && aggValue !== ''
                      ? formatAggregation(aggValue, aggType)
                      : '';
                    
                    const isFirstCol = colIdx === 0 && layout.firstColumn;
                    const isLastCol = colIdx === columns - 1 && layout.lastColumn;
                    
                    // Determine background color for total row
                    let totalRowBgColor = theme.colors.totalRowBg || theme.colors.headerBg;
                    
                    // Apply column emphasis (use darkened banded color)
                    if (isFirstCol && layout.firstColumn) {
                      const baseColor = theme.colors.evenRowBg; // Use even row as base
                      totalRowBgColor = darkenColor(baseColor, 15);
                    } else if (isLastCol && layout.lastColumn) {
                      const baseColor = theme.colors.evenRowBg; // Use even row as base
                      totalRowBgColor = darkenColor(baseColor, 15);
                    }
                    
                    return (
                      <TableCell
                        key={colIdx}
                        className={cn(
                          "table-cell",
                          getBorderClasses(design.borderStyle, false, false, isFirstCol, isLastCol),
                          isFirstCol && "sticky left-0 z-10",
                          (isFirstCol && layout.firstColumn) || (isLastCol && layout.lastColumn) ? "font-bold" : ""
                        )}
                        style={{
                          backgroundColor: totalRowBgColor,
                          color: theme.colors.headerText,
                          fontWeight: 'bold',
                          minWidth: `${getColumnWidth(colIdx)}px`,
                          maxWidth: `${getColumnWidth(colIdx)}px`,
                          height: `${getRowHeight()}px`,
                          position: 'relative',
                           ...(isFirstCol && layout.firstColumn && { position: 'sticky', left: 0, zIndex: 10 }),
                        }}
                      >
                        <div className="h-full flex items-center px-1">
                          {formattedValue}
                        </div>
                      </TableCell>
                    );
                  })}
                </TableRow>
              </tfoot>
            )}
          </Table>
        </div>
      </div>

      {/* Info footer */}
      <div className="sticky bottom-0 px-4 py-2 bg-gray-50 border-t border-gray-200 text-xs text-gray-600">
        Blank Table: {rows} rows × {columns} columns {useHeaderRow ? '(with header row)' : ''} • Click any cell to edit
      </div>

      {/* Rich Text Formatting Toolbar disabled for testing. Uncomment to restore.
      {showToolbar && editingCell && toolbarCellRect && portalTarget && createPortal(
        <TableRichTextToolbar
          formatting={cellFormatting as any}
          onFormattingChange={(fmt) => setCellFormatting(prev => ({ ...prev, ...fmt }))}
          cellPosition={toolbarCellRect}
          isVisible={true}
        />,
        portalTarget
      )}
      */}
    </div>
  );
};

export default BlankTableCanvas;


