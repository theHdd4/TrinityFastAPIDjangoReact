import React, { useState, useMemo, useRef } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Checkbox } from '@/components/ui/checkbox';
import { Plus, PlusCircle, RotateCcw, ArrowUpDown, Filter, Download, FileText, FileSpreadsheet } from 'lucide-react';

function safeToString(val: any): string {
  if (val === undefined || val === null) return '';
  try {
    return val.toString();
  } catch {
    return '';
  }
}

const DataFrameOperationsExhibition = ({ data, settings, onSettingsChange, onDataChange, onClearAll }: any) => {
  const [currentPage, setCurrentPage] = useState(1);
  const rowsPerPage = settings.rowsPerPage || 15;
  const [editingCell, setEditingCell] = useState<{row: number, col: string} | null>(null);

  // Processed data (search, filter, sort)
  const processedData = useMemo(() => {
    if (!data || !Array.isArray(data.headers) || !Array.isArray(data.rows)) {
      return { filteredRows: [], totalRows: 0, uniqueValues: {} };
    }
    let filteredRows = [...data.rows];
    // Search
    if (settings?.searchTerm?.trim()) {
      const searchTerm = settings.searchTerm.toLowerCase().trim();
      filteredRows = filteredRows.filter(row =>
        (settings?.selectedColumns || data.headers).some(column => {
          const cellValue = row[column];
          return safeToString(cellValue).toLowerCase().includes(searchTerm);
        })
      );
    }
    // Filters
    Object.entries(settings?.filters || {}).forEach(([column, filterValues]) => {
      if (filterValues && Array.isArray(filterValues) && filterValues.length > 0) {
        filteredRows = filteredRows.filter(row => {
          return filterValues.includes(safeToString(row[column]));
        });
      }
    });
    // Sorting
    if (Array.isArray(settings?.sortColumns) && settings.sortColumns.length > 0) {
      filteredRows.sort((a, b) => {
        for (const sort of settings.sortColumns) {
          const aVal = a[sort.column];
          const bVal = b[sort.column];
          if (aVal === bVal) continue;
          let comparison = 0;
          if (typeof aVal === 'number' && typeof bVal === 'number') {
            comparison = aVal - bVal;
          } else {
            comparison = safeToString(aVal).localeCompare(safeToString(bVal));
          }
          return sort.direction === 'desc' ? -comparison : comparison;
        }
        return 0;
      });
    }
    // Unique values for filters
    const uniqueValues: {[key: string]: string[]} = {};
    data.headers.forEach(header => {
      const values = Array.from(new Set(data.rows.map(row => safeToString(row[header]))))
        .filter(val => val !== '')
        .sort();
      uniqueValues[header] = values.slice(0, 50);
    });
    return { filteredRows, totalRows: filteredRows.length, uniqueValues };
  }, [data, settings]);

  const totalPages = Math.ceil(processedData.totalRows / rowsPerPage);
  const startIndex = (currentPage - 1) * rowsPerPage;
  const paginatedRows = processedData.filteredRows.slice(startIndex, startIndex + rowsPerPage);

  // Add row/column
  const handleAddRow = () => {
    if (!data) return;
    const newRow: any = {};
    data.headers.forEach(header => {
      newRow[header] = data.columnTypes[header] === 'number' ? 0 : '';
    });
    onDataChange({ ...data, rows: [...data.rows, newRow] });
  };
  const handleAddColumn = () => {
    if (!data) return;
    const newColumnName = `Column_${data.headers.length + 1}`;
    onDataChange({
      ...data,
      headers: [...data.headers, newColumnName],
      columnTypes: { ...data.columnTypes, [newColumnName]: 'text' },
      rows: data.rows.map(row => ({ ...row, [newColumnName]: '' }))
    });
  };
  // Helper to export CSV
  const handleExportCSV = () => {
    if (!data) return;
    const csvContent = [
      data.headers.join(','),
      ...data.rows.map(row => data.headers.map(header => String(row[header] ?? '')).join(','))
    ].join('\n');
    const blob = new Blob([csvContent], { type: 'text/csv' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = (data.fileName || 'data') + '.csv';
    a.click();
    URL.revokeObjectURL(url);
  };
  // Helper to export XLSX (simple, CSV-based)
  const handleExportXLSX = () => {
    if (!data) return;
    const csvContent = [
      data.headers.join(','),
      ...data.rows.map(row => data.headers.map(header => String(row[header] ?? '')).join(','))
    ].join('\n');
    const blob = new Blob([csvContent], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = (data.fileName || 'data') + '.xlsx';
    a.click();
    URL.revokeObjectURL(url);
  };
  // Cell edit
  const handleCellEdit = (rowIndex: number, column: string, newValue: string) => {
    if (!data) return;
    const updatedRows = [...data.rows];
    const globalRowIndex = startIndex + rowIndex;
    let parsedValue: any = newValue;
    if (data.columnTypes[column] === 'number' && newValue) {
      const numValue = parseFloat(newValue);
      if (!isNaN(numValue)) parsedValue = numValue;
    }
    updatedRows[globalRowIndex] = { ...updatedRows[globalRowIndex], [column]: parsedValue };
    onDataChange({ ...data, rows: updatedRows });
  };
  // Column filter
  const handleColumnFilter = (column: string, selectedValues: string[]) => {
    const newFilters = { ...settings.filters };
    if (selectedValues.length === 0) {
      delete newFilters[column];
    } else {
      newFilters[column] = selectedValues;
    }
    onSettingsChange({ filters: newFilters });
    setCurrentPage(1);
  };
  // Sort
  const handleSort = (column: string) => {
    const existingSort = settings.sortColumns.find((s: any) => s.column === column);
    let newSortColumns;
    if (existingSort) {
      if (existingSort.direction === 'asc') {
        newSortColumns = settings.sortColumns.map((s: any) => s.column === column ? { ...s, direction: 'desc' } : s);
      } else {
        newSortColumns = settings.sortColumns.filter((s: any) => s.column !== column);
      }
    } else {
      newSortColumns = [...settings.sortColumns, { column, direction: 'asc' }];
    }
    onSettingsChange({ sortColumns: newSortColumns });
  };
  // Clear all filters/search/sort
  const handleClearAll = () => {
    onSettingsChange({ searchTerm: '', sortColumns: [], filters: {} });
    setCurrentPage(1);
  };
  // Pagination
  const handlePageChange = (page: number) => setCurrentPage(page);

  if (!data || !Array.isArray(data.headers) || data.headers.length === 0) return <div className="text-green-700 text-xs p-2">No data loaded.</div>;

  const selectedColumns = Array.isArray(settings.selectedColumns) ? settings.selectedColumns : data.headers;
  const sortColumns = Array.isArray(settings.sortColumns) ? settings.sortColumns : [];
  const filters = typeof settings.filters === 'object' && settings.filters !== null ? settings.filters : {};

  return (
    <div className="w-full p-4">
      <div className="flex flex-col gap-4">
        {data && data.headers && data.rows && data.rows.length > 0 ? (
          <>
            <div className="flex gap-2">
              <Button className="bg-green-600 hover:bg-green-700 text-white flex items-center gap-2" onClick={handleExportCSV}>
                <FileText className="w-4 h-4" /> Export as CSV
              </Button>
              <Button className="bg-blue-600 hover:bg-blue-700 text-white flex items-center gap-2" onClick={handleExportXLSX}>
                <FileSpreadsheet className="w-4 h-4" /> Export as Excel
              </Button>
            </div>
            <div className="bg-blue-50 p-4 rounded-lg border border-blue-200 mt-4">
              <div className="flex items-center space-x-2 mb-2">
                <div className="w-2 h-2 bg-blue-500 rounded-full"></div>
                <span className="text-sm font-medium text-blue-900">Result Summary</span>
              </div>
              <p className="text-sm text-blue-700">
                Shape: {data.rows.length} rows × {data.headers.length} columns
              </p>
            </div>
          </>
        ) : (
          <div className="flex flex-col items-center justify-center h-40 text-gray-400">
            <Download className="w-10 h-10 mb-2" />
            <div className="font-semibold text-lg">No Data Available</div>
            <div className="text-xs">Upload data to enable export options</div>
          </div>
        )}
      </div>
    </div>
  );
};
export default DataFrameOperationsExhibition; 