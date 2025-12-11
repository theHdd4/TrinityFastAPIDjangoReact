import React, { useMemo } from 'react';
import { Table2 } from 'lucide-react';
import TableCanvas from '@/components/AtomList/atoms/table/components/TableCanvas';
import TablePagination from '@/components/AtomList/atoms/table/components/TablePagination';
import type { TableSettings } from '@/components/AtomList/atoms/table/TableAtom';

interface TableElementProps {
  tableSettings?: {
    mode?: 'load' | 'blank';
    sourceFile?: string;
    tableId?: string;
    tableData?: any;
    visibleColumns?: string[];
    columnOrder?: string[];
    columnWidths?: Record<string, number>;
    rowHeight?: number;
    showRowNumbers?: boolean;
    showSummaryRow?: boolean;
    frozenColumns?: number;
    filters?: Record<string, any>;
    sortConfig?: Array<{column: string; direction: 'asc' | 'desc'}>;
    currentPage?: number;
    pageSize?: number;
    layout?: {
      headerRow?: boolean;
      totalRow?: boolean;
      bandedRows?: boolean;
      bandedColumns?: boolean;
      firstColumn?: boolean;
      lastColumn?: boolean;
    };
    design?: {
      theme?: string;
      borderStyle?: 'all' | 'none' | 'outside' | 'horizontal' | 'vertical' | 'header';
    };
    totalRowConfig?: Record<string, 'sum' | 'average' | 'count' | 'min' | 'max' | 'none'>;
    blankTableConfig?: {
      rows?: number;
      columns?: number;
      columnNames?: string[];
      useHeaderRow?: boolean;
      created?: boolean;
    };
  };
  width?: number;
  height?: number;
  onSettingsChange?: (newSettings: Partial<typeof tableSettings>) => void;
}

const TableElement: React.FC<TableElementProps> = ({ 
  tableSettings, 
  width, 
  height = 300,
  onSettingsChange
}) => {
  // If no table settings or table data, show placeholder
  if (!tableSettings || !tableSettings.tableData || !tableSettings.tableId) {
    return (
      <div className="flex flex-col items-center justify-center h-full p-4 space-y-3">
        <Table2 className="w-8 h-8 text-teal-500" />
        <p className="text-sm font-medium text-foreground">Table</p>
        <p className="text-xs text-muted-foreground text-center px-4">
          {!tableSettings 
            ? 'Configure a table in the Tables tab to display data'
            : 'Create a blank table or load from dataframe to get started'}
        </p>
      </div>
    );
  }

  // Convert tableSettings to TableSettings format expected by TableCanvas
  const settings: TableSettings = useMemo(() => {
    return {
      mode: tableSettings.mode || 'blank',
      sourceFile: tableSettings.sourceFile,
      tableId: tableSettings.tableId,
      tableData: tableSettings.tableData,
      visibleColumns: tableSettings.visibleColumns || [],
      columnOrder: tableSettings.columnOrder || [],
      columnWidths: tableSettings.columnWidths || {},
      rowHeight: tableSettings.rowHeight || 24,
      showRowNumbers: tableSettings.showRowNumbers ?? true,
      showSummaryRow: tableSettings.showSummaryRow ?? false,
      frozenColumns: tableSettings.frozenColumns || 0,
      filters: tableSettings.filters || {},
      sortConfig: tableSettings.sortConfig || [],
      currentPage: tableSettings.currentPage || 1,
      pageSize: tableSettings.pageSize || 50,
      layout: tableSettings.layout || {
        headerRow: true,
        totalRow: false,
        bandedRows: false,
        bandedColumns: false,
        firstColumn: false,
        lastColumn: false,
      },
      design: tableSettings.design || {
        theme: 'plain',
        borderStyle: 'all',
      },
      totalRowConfig: tableSettings.totalRowConfig || {},
      blankTableConfig: tableSettings.blankTableConfig,
    };
  }, [tableSettings]);

  // Check if table data is valid
  if (!tableSettings.tableData || !tableSettings.tableData.columns || tableSettings.tableData.columns.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center h-full p-4 space-y-3">
        <Table2 className="w-8 h-8 text-teal-500" />
        <p className="text-sm font-medium text-foreground">No Table Data</p>
        <p className="text-xs text-muted-foreground text-center px-4">
          Table data is not available. Please create or load a table.
        </p>
      </div>
    );
  }

  // Handle page change
  const handlePageChange = (page: number) => {
    if (onSettingsChange) {
      onSettingsChange({ currentPage: page });
    }
  };

  // Render the table in a constrained container with pagination
  return (
    <div className="w-full h-full flex flex-col overflow-hidden" style={{ maxHeight: height, maxWidth: width }}>
      {/* Table Canvas with horizontal and vertical scrolling */}
      <div className="flex-1 overflow-auto min-h-0">
        <TableCanvas
          data={tableSettings.tableData}
          settings={settings}
          onSettingsChange={() => {
            // Settings changes are handled in KPIDashboardTableConfig
            // This is a read-only view in the canvas
          }}
        />
      </div>
      
      {/* Pagination - only for load mode */}
      {tableSettings.mode === 'load' && tableSettings.tableData?.row_count && (
        <TablePagination
          currentPage={tableSettings.currentPage || 1}
          pageSize={tableSettings.pageSize || 50}
          totalRows={tableSettings.tableData.row_count}
          onPageChange={handlePageChange}
        />
      )}
    </div>
  );
};

export default TableElement;

