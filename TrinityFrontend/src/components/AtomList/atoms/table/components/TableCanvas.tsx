import React, { useMemo } from 'react';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import '@/templates/tables/table.css';
import { TableData, TableSettings } from '../TableAtom';
import BlankTableCanvas from './BlankTableCanvas';

interface TableCanvasProps {
  data: TableData;
  settings: TableSettings;
  onSettingsChange: (settings: Partial<TableSettings>) => void;
}

const TableCanvas: React.FC<TableCanvasProps> = ({
  data,
  settings,
  onSettingsChange
}) => {
  // Get visible columns
  const visibleColumns = useMemo(() => {
    if (settings.visibleColumns && settings.visibleColumns.length > 0) {
      return settings.visibleColumns.filter(col => data.columns.includes(col));
    }
    return data.columns;
  }, [data.columns, settings.visibleColumns]);

  // Get column widths
  const getColumnWidth = (column: string) => {
    return settings.columnWidths[column] || 150;
  };

  // Handle sort
  const handleSort = (column: string) => {
    const existingSort = settings.sortConfig.find(s => s.column === column);
    let newSortConfig;

    if (!existingSort) {
      // Add ascending sort
      newSortConfig = [{ column, direction: 'asc' as const }];
    } else if (existingSort.direction === 'asc') {
      // Change to descending
      newSortConfig = [{ column, direction: 'desc' as const }];
    } else {
      // Remove sort
      newSortConfig = [];
    }

    onSettingsChange({ sortConfig: newSortConfig });
  };

  // Get sort indicator
  const getSortIndicator = (column: string) => {
    const sort = settings.sortConfig.find(s => s.column === column);
    if (!sort) return null;
    return sort.direction === 'asc' ? '↑' : '↓';
  };

  // Format cell value based on type
  const formatCellValue = (value: any, columnType: string) => {
    if (value === null || value === undefined) {
      return <span className="text-gray-400 italic">null</span>;
    }

    if (columnType === 'float' && typeof value === 'number') {
      return value.toFixed(2);
    }

    if (columnType === 'integer' && typeof value === 'number') {
      return value.toLocaleString();
    }

    return String(value);
  };

  // Calculate visible rows based on pagination
  const startIdx = (settings.currentPage - 1) * settings.pageSize;
  const endIdx = startIdx + settings.pageSize;
  const visibleRows = data.rows.slice(startIdx, endIdx);

  // If blank table mode, use BlankTableCanvas
  if (settings.mode === 'blank' && settings.blankTableConfig?.created && data.table_id) {
    return (
      <BlankTableCanvas
        atomId={(settings as any).atomId || ''}
        tableId={data.table_id}
        rows={settings.blankTableConfig.rows}
        columns={settings.blankTableConfig.columns}
        columnNames={settings.blankTableConfig.columnNames || settings.visibleColumns || data.columns}
        settings={settings}
      />
    );
  }

  return (
    <div className="h-full overflow-auto">
      <div className="table-wrapper">
        <div className="table-overflow">
          <Table className="table-base">
            <TableHeader 
              className="table-header"
              style={{
                position: 'sticky',
                top: 0,
                zIndex: 1002,
                backgroundColor: 'white'
              }}
            >
              <TableRow className="table-header-row">
                {/* Column headers - plain cells, no row number column */}
                {visibleColumns.map((column) => (
                  <TableHead
                    key={column}
                    className="table-header-cell border border-gray-200"
                    style={{
                      minWidth: `${getColumnWidth(column)}px`,
                      maxWidth: `${getColumnWidth(column)}px`,
                      backgroundColor: 'white',
                      fontWeight: 'bold'
                    }}
                  >
                    {column}
                  </TableHead>
                ))}
              </TableRow>
            </TableHeader>

            <TableBody>
              {visibleRows.length === 0 ? (
                <TableRow>
                  <TableCell
                    colSpan={visibleColumns.length}
                    className="border border-gray-200 px-4 py-8 text-center text-gray-500"
                  >
                    No data to display
                  </TableCell>
                </TableRow>
              ) : (
                visibleRows.map((row, rowIdx) => (
                  <TableRow key={startIdx + rowIdx} className="table-row">
                    {/* Data cells - plain white, no row numbers */}
                    {visibleColumns.map((column) => (
                      <TableCell
                        key={column}
                        className="table-cell border border-gray-200"
                        style={{
                          minWidth: `${getColumnWidth(column)}px`,
                          maxWidth: `${getColumnWidth(column)}px`,
                          height: `${settings.rowHeight}px`,
                          backgroundColor: 'white'
                        }}
                      >
                        <div className="table-cell-content" title={String(row[column])}>
                          {formatCellValue(row[column], data.column_types[column])}
                        </div>
                      </TableCell>
                    ))}
                  </TableRow>
                ))
              )}
            </TableBody>
          </Table>
        </div>
      </div>

      {/* Info footer */}
      <div className="sticky bottom-0 px-4 py-2 bg-gray-50 border-t border-gray-200 text-xs text-gray-600">
        Showing {visibleRows.length} of {data.row_count} rows • {visibleColumns.length} columns
      </div>
    </div>
  );
};

export default TableCanvas;

