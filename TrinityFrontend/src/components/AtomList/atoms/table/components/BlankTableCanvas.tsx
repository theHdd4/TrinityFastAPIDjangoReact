import React, { useState, useRef, useEffect, useCallback, useMemo } from 'react';
import { createPortal } from 'react-dom';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import '@/templates/tables/table.css';
import { editTableCell } from '../services/tableApi';
import { cn } from '@/lib/utils';
import RichTextCellEditor from './RichTextCellEditor';
import TextBoxToolbar from '@/components/LaboratoryMode/components/CanvasArea/text-box/TextBoxToolbar';
import type { TextAlignOption } from '@/components/LaboratoryMode/components/CanvasArea/text-box/types';
import { getTheme } from './design/tableThemes';
import { calculateAggregation, formatAggregation, getBorderClasses } from '../utils/tableUtils';

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
    textAlign: TextAlignOption;
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

  // Get column widths (reduced by 25%: 150px → 112.5px)
  const getColumnWidth = (colIdx: number) => {
    const colId = getColumnId(colIdx);
    return settings.columnWidths?.[colId] || 112.5;
  };

  // Get row height (reduced by 25%: 32px → 24px)
  const getRowHeight = () => {
    return settings.rowHeight || 24;
  };

  // Get cell value
  const getCellValue = (rowIdx: number, colIdx: number) => {
    return cellValues[rowIdx]?.[colIdx] ?? '';
  };
  
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
    if (!toolbarRef.current || !editingCell || !showToolbar) return;
    
    // Find the editing cell element by searching for the RichTextCellEditor
    const editorElements = document.querySelectorAll('[contenteditable="true"]');
    const activeEditor = Array.from(editorElements).find(el => 
      el === document.activeElement || el.contains(document.activeElement)
    );
    
    if (activeEditor) {
      const rect = activeEditor.getBoundingClientRect();
      if (toolbarRef.current) {
        toolbarRef.current.style.left = `${rect.left + window.scrollX}px`;
        toolbarRef.current.style.top = `${rect.bottom + window.scrollY + 8}px`;
      }
    }
  }, [editingCell, showToolbar]);

  return (
    <div className="h-full overflow-auto">
      <div className="table-wrapper">
        <div className="table-overflow">
          <Table className="table-base">
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
                    
                    return (
                      <TableHead
                        key={colIdx}
                        className={cn(
                          "table-cell cursor-pointer font-semibold",
                          getBorderClasses(design.borderStyle, true, true, isFirstCol, isLastCol),
                          isEditing && "p-0",
                          isFirstCol && "sticky left-0 z-10",
                          isLastCol && "bg-opacity-90"
                        )}
                        style={{ 
                          backgroundColor: theme.colors.headerBg,
                          color: theme.colors.headerText,
                          minWidth: `${getColumnWidth(colIdx)}px`,
                          maxWidth: `${getColumnWidth(colIdx)}px`,
                          height: `${getRowHeight()}px`,
                          ...(isFirstCol && { position: 'sticky', left: 0, zIndex: 10 }),
                        }}
                        onClick={() => !isEditing && handleCellClick(0, colIdx)}
                      >
                        {isEditing ? (
                          <RichTextCellEditor
                            value={editingCellValue}
                            html={editingCellHtml}
                            formatting={cellFormatting}
                            isEditing={true}
                            onValueChange={(val, html) => {
                              setEditingCellValue(val);
                              setEditingCellHtml(html);
                            }}
                            onCommit={() => commitCellEdit(0, colIdx)}
                            onCancel={() => {
                              setEditingCell(null);
                              setShowToolbar(false);
                            }}
                            className="w-full h-full"
                            style={{
                              padding: '2px 4px',
                              minHeight: `${getRowHeight()}px`,
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
                  <TableRow key={actualRowIdx} className="table-row">
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
                      if (isBandedRow) {
                        backgroundColor = theme.colors.evenRowBg;
                      }
                      if (isBandedCol && isBandedRow) {
                        // Both banded - use a mix or prefer row banding
                        backgroundColor = theme.colors.evenRowBg;
                      }
                      
                      return (
                        <TableCell
                          key={colIdx}
                          className={cn(
                            "table-cell cursor-pointer",
                            getBorderClasses(design.borderStyle, false, isFirstRow, isFirstCol, isLastCol),
                            isEditing && "p-0",
                            isFirstCol && "sticky left-0 z-10",
                            isLastCol && "bg-opacity-90"
                          )}
                          style={{ 
                            backgroundColor: backgroundColor,
                            color: theme.colors.cellText,
                            minWidth: `${getColumnWidth(colIdx)}px`,
                            maxWidth: `${getColumnWidth(colIdx)}px`,
                            height: `${getRowHeight()}px`,
                            ...(isFirstCol && { position: 'sticky', left: 0, zIndex: 10 }),
                          }}
                          onClick={() => !isEditing && handleCellClick(actualRowIdx, colIdx)}
                        >
                          {isEditing ? (
                            <RichTextCellEditor
                              value={editingCellValue}
                              html={editingCellHtml}
                              formatting={cellFormatting}
                              isEditing={true}
                              onValueChange={(val, html) => {
                                setEditingCellValue(val);
                                setEditingCellHtml(html);
                              }}
                              onCommit={() => commitCellEdit(actualRowIdx, colIdx)}
                              onCancel={() => {
                                setEditingCell(null);
                                setShowToolbar(false);
                              }}
                              className="w-full h-full"
                              style={{
                                padding: '2px 4px',
                                minHeight: `${getRowHeight()}px`,
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
                        </TableCell>
                      );
                    })}
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
                    const aggType = totalRowConfig[colId] || 'none';
                    const aggValue = aggType !== 'none' 
                      ? calculateAggregation(dataRowsForAggregation, colId, aggType)
                      : '';
                    const formattedValue = aggType !== 'none' && aggValue !== ''
                      ? formatAggregation(aggValue, aggType)
                      : '';
                    
                    const isFirstCol = colIdx === 0 && layout.firstColumn;
                    const isLastCol = colIdx === columns - 1 && layout.lastColumn;
                    
                    return (
                      <TableCell
                        key={colIdx}
                        className={cn(
                          "table-cell",
                          getBorderClasses(design.borderStyle, false, false, isFirstCol, isLastCol),
                          isFirstCol && "sticky left-0 z-10",
                          isLastCol && "bg-opacity-90"
                        )}
                        style={{
                          backgroundColor: theme.colors.totalRowBg || theme.colors.headerBg,
                          color: theme.colors.headerText,
                          fontWeight: 'bold',
                          minWidth: `${getColumnWidth(colIdx)}px`,
                          maxWidth: `${getColumnWidth(colIdx)}px`,
                          height: `${getRowHeight()}px`,
                          ...(isFirstCol && { position: 'sticky', left: 0, zIndex: 10 }),
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

      {/* Rich Text Formatting Toolbar */}
      {showToolbar && editingCell && portalTarget && createPortal(
        <div
          ref={toolbarRef}
          className="fixed z-[5000]"
        >
          <TextBoxToolbar
            fontFamily={cellFormatting.fontFamily}
            onFontFamilyChange={(font) => setCellFormatting(prev => ({ ...prev, fontFamily: font }))}
            fontSize={cellFormatting.fontSize}
            onIncreaseFontSize={() => {
              const newSize = Math.min(cellFormatting.fontSize + 1, 72);
              setCellFormatting(prev => ({ ...prev, fontSize: newSize }));
            }}
            onDecreaseFontSize={() => {
              const newSize = Math.max(cellFormatting.fontSize - 1, 8);
              setCellFormatting(prev => ({ ...prev, fontSize: newSize }));
            }}
            onApplyTextStyle={(preset) => {
              setCellFormatting(prev => ({
                ...prev,
                fontSize: preset.fontSize,
                bold: preset.bold ?? prev.bold,
                italic: preset.italic ?? prev.italic,
                underline: preset.underline ?? prev.underline,
                strikethrough: preset.strikethrough ?? prev.strikethrough,
              }));
            }}
            bold={cellFormatting.bold}
            italic={cellFormatting.italic}
            underline={cellFormatting.underline}
            strikethrough={cellFormatting.strikethrough}
            onToggleBold={() => setCellFormatting(prev => ({ ...prev, bold: !prev.bold }))}
            onToggleItalic={() => setCellFormatting(prev => ({ ...prev, italic: !prev.italic }))}
            onToggleUnderline={() => setCellFormatting(prev => ({ ...prev, underline: !prev.underline }))}
            onToggleStrikethrough={() => setCellFormatting(prev => ({ ...prev, strikethrough: !prev.strikethrough }))}
            align={cellFormatting.textAlign}
            onAlign={(align) => setCellFormatting(prev => ({ ...prev, textAlign: align }))}
            color={cellFormatting.textColor}
            onColorChange={(color) => setCellFormatting(prev => ({ ...prev, textColor: color }))}
            backgroundColor={cellFormatting.backgroundColor}
            onBackgroundColorChange={(color) => setCellFormatting(prev => ({ ...prev, backgroundColor: color }))}
          />
        </div>,
        portalTarget
      )}
    </div>
  );
};

export default BlankTableCanvas;


