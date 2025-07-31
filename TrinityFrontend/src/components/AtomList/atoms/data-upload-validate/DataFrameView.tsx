import React, { useEffect, useMemo, useState } from 'react';
import { logMinioPrefix } from '@/utils/logPrefix';
import { Link, useSearchParams } from 'react-router-dom';
import { FEATURE_OVERVIEW_API } from '@/lib/api';
import { TrinityAssets } from '@/components/PrimaryMenu';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Checkbox } from '@/components/ui/checkbox';
import {
  Pagination,
  PaginationContent,
  PaginationItem,
  PaginationLink,
  PaginationNext,
  PaginationPrevious,
} from '@/components/ui/pagination';
import {
  ContextMenu,
  ContextMenuContent,
  ContextMenuItem,
  ContextMenuSeparator,
  ContextMenuSub,
  ContextMenuSubContent,
  ContextMenuSubTrigger,
  ContextMenuTrigger,
} from '@/components/ui/context-menu';
// Popover removed in favor of ContextMenu submenus for filtering
import {
  Search,
  ChevronUp,
  ChevronDown,
  Filter as FilterIcon,
  Grid3X3,
  Eye,
  ArrowUp,
  ArrowDown,
} from 'lucide-react';

interface DataTableData {
  headers: string[];
  rows: Record<string, any>[];
  fileName: string;
}

const DataFrameView = () => {
  const [params] = useSearchParams();
  const name = params.get('name') || '';

  const [data, setData] = useState<DataTableData | null>(null);
  const [settings, setSettings] = useState({
    rowsPerPage: 25,
    searchTerm: '',
    sortColumn: '',
    sortDirection: 'asc' as 'asc' | 'desc',
    selectedColumns: [] as string[],
  });
  const [currentPage, setCurrentPage] = useState(1);
  const [columnFilters, setColumnFilters] = useState<Record<string, string[]>>({});

  useEffect(() => {
    if (!name) return;
    logMinioPrefix(name);
    fetch(`${FEATURE_OVERVIEW_API}/cached_dataframe?object_name=${encodeURIComponent(name)}`)
      .then(res => res.text())
      .then(text => {
        const parsed = parseCSV(text);
        const tableData: DataTableData = {
          headers: parsed.headers,
          rows: parsed.rows,
          fileName: name.split('/').pop() || name,
        };
        setData(tableData);
        setSettings(prev => ({ ...prev, selectedColumns: parsed.headers }));
        setColumnFilters({});
        setCurrentPage(1);
      })
      .catch(() => {
        setData(null);
      });
  }, [name]);

  const parseCSV = (text: string): { headers: string[]; rows: any[] } => {
    const lines = text.split(/\r?\n/).filter(line => line.trim());
    if (lines.length === 0) return { headers: [], rows: [] };
    const headers = lines[0].split(',').map(h => h.trim().replace(/"/g, ''));
    const numeric = /^-?\d+(?:\.\d+)?$/;
    const rows = lines.slice(1).map(line => {
      const values = line.split(',').map(v => v.trim().replace(/"/g, ''));
      const row: Record<string, any> = {};
      headers.forEach((h, i) => {
        const value = values[i] ?? '';
        row[h] = numeric.test(value) ? parseFloat(value) : value;
      });
      return row;
    });
    return { headers, rows };
  };

  const getUniqueColumnValues = (column: string): string[] => {
    if (!data) return [];
    const values = data.rows.map(row => String(row[column] ?? '')).filter(Boolean);
    return Array.from(new Set(values)).sort();
  };

  const processedData = useMemo(() => {
    if (!data) return { filteredRows: [] as Record<string, any>[], totalRows: 0 };

    let filteredRows = data.rows;

    Object.entries(columnFilters).forEach(([col, vals]) => {
      if (vals.length > 0) {
        filteredRows = filteredRows.filter(r => vals.includes(String(r[col] ?? '')));
      }
    });

    if (settings.searchTerm) {
      const term = settings.searchTerm.toLowerCase();
      filteredRows = filteredRows.filter(row =>
        Object.values(row).some(v => String(v).toLowerCase().includes(term))
      );
    }

    if (settings.sortColumn) {
      filteredRows = [...filteredRows].sort((a, b) => {
        const aVal = a[settings.sortColumn];
        const bVal = b[settings.sortColumn];
        if (aVal === null) return 1;
        if (bVal === null) return -1;
        const cmp = String(aVal).localeCompare(String(bVal), undefined, { numeric: true });
        return settings.sortDirection === 'asc' ? cmp : -cmp;
      });
    }

    return { filteredRows, totalRows: filteredRows.length };
  }, [data, settings.searchTerm, settings.sortColumn, settings.sortDirection, columnFilters]);

  const totalPages = Math.ceil(processedData.totalRows / settings.rowsPerPage) || 1;
  const startIndex = (currentPage - 1) * settings.rowsPerPage;
  const endIndex = startIndex + settings.rowsPerPage;
  const currentRows = processedData.filteredRows.slice(startIndex, endIndex);

  const handleSort = (column: string, direction?: 'asc' | 'desc') => {
    const newDirection =
      direction ||
      (settings.sortColumn === column && settings.sortDirection === 'asc' ? 'desc' : 'asc');
    setSettings(prev => ({ ...prev, sortColumn: column, sortDirection: newDirection }));
  };

  const handleSearch = (term: string) => {
    setSettings(prev => ({ ...prev, searchTerm: term }));
    setCurrentPage(1);
  };

  const handleColumnFilter = (column: string, values: string[]) => {
    setColumnFilters(prev => ({ ...prev, [column]: values }));
    setCurrentPage(1);
  };

  const clearColumnFilter = (column: string) => {
    setColumnFilters(prev => {
      const cpy = { ...prev };
      delete cpy[column];
      return cpy;
    });
    setCurrentPage(1);
  };

  const FilterMenu = ({ column }: { column: string }) => {
    const uniqueValues = getUniqueColumnValues(column);
    const current = columnFilters[column] || [];
    const [temp, setTemp] = useState<string[]>(current);

    const toggleVal = (val: string) => {
      setTemp(prev => (prev.includes(val) ? prev.filter(v => v !== val) : [...prev, val]));
    };

    const selectAll = () => {
      setTemp(temp.length === uniqueValues.length ? [] : uniqueValues);
    };

    const apply = () => handleColumnFilter(column, temp);

    return (
      <div className="w-64 max-h-80 overflow-y-auto">
        <div className="p-2 border-b">
          <div className="flex items-center space-x-2 mb-2">
            <Checkbox checked={temp.length === uniqueValues.length} onCheckedChange={selectAll} />
            <span className="text-sm font-medium">Select All</span>
          </div>
        </div>
        <div className="p-2 space-y-1">
          {uniqueValues.map((v, i) => (
            <div key={i} className="flex items-center space-x-2">
              <Checkbox checked={temp.includes(v)} onCheckedChange={() => toggleVal(v)} />
              <span className="text-sm">{v}</span>
            </div>
          ))}
        </div>
        <div className="p-2 border-t flex space-x-2">
          <Button size="sm" onClick={apply}>Apply</Button>
          <Button size="sm" variant="outline" onClick={() => setTemp(current)}>
            Cancel
          </Button>
        </div>
      </div>
    );
  };

  if (!name) return <div className="p-4">No dataframe specified</div>;

  if (!data) return <div className="p-4">Loading...</div>;

  return (
    <div className="min-h-screen bg-gray-50 flex flex-col">
      <header className="bg-white border-b border-gray-200 px-8 py-4">
        <Link to="/" className="flex items-center space-x-3 group">
          <TrinityAssets.AnimatedLogo className="w-12 h-12 group-hover:shadow-xl transition-all duration-300" />
          <TrinityAssets.LogoText />
        </Link>
      </header>
      <div className="p-4 flex-1">
        <div className="h-full bg-white rounded-lg border border-gray-200 flex flex-col">
      <div className="border-b border-gray-200 bg-gradient-to-r from-blue-50 to-purple-50 px-6 py-4">
        <div className="flex items-center justify-between mb-4">
          <div className="flex items-center space-x-3">
            <div className="w-10 h-10 bg-gradient-to-br from-blue-500 to-purple-600 rounded-xl flex items-center justify-center">
              <Grid3X3 className="w-5 h-5 text-white" />
            </div>
            <div>
              <h2 className="text-lg font-semibold text-gray-800">{data.fileName}</h2>
              <p className="text-sm text-gray-600">
                {processedData.totalRows.toLocaleString()} rows × {data.headers.length} columns
              </p>
            </div>
          </div>
          <Badge variant="secondary" className="bg-blue-100 text-blue-800 border-blue-200">
            <Eye className="w-3 h-3 mr-1" /> Interactive Table
          </Badge>
        </div>

        <div className="flex items-center space-x-4">
          <div className="relative flex-1 max-w-md">
            <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400 w-4 h-4" />
            <Input
              placeholder="Search data..."
              value={settings.searchTerm}
              onChange={e => handleSearch(e.target.value)}
              className="pl-10 bg-white border-gray-300 focus:border-blue-500 focus:ring-blue-500"
            />
          </div>
          <div className="flex items-center space-x-2 text-sm text-gray-600">
            <FilterIcon className="w-4 h-4" />
            <span>
              Showing {currentRows.length} of {processedData.totalRows} rows
            </span>
          </div>
        </div>

        {Object.entries(columnFilters).length > 0 && (
          <div className="mt-3 flex flex-wrap gap-2">
            {Object.entries(columnFilters).map(([col, vals]) =>
              vals.length > 0 ? (
                <Badge key={col} variant="secondary" className="bg-blue-100 text-blue-800">
                  {col}: {vals.length} selected
                  <button onClick={() => clearColumnFilter(col)} className="ml-1 text-blue-600 hover:text-blue-800">
                    ×
                  </button>
                </Badge>
              ) : null
            )}
          </div>
        )}
      </div>

      <div className="flex-1 overflow-hidden">
        <div className="h-full overflow-auto">
          <Table>
            <TableHeader className="sticky top-0 z-10 bg-gray-50 border-b-2 border-gray-200">
              <TableRow>
                {settings.selectedColumns.map(header => (
                  <ContextMenu key={header}>
                    <ContextMenuTrigger asChild>
                      <TableHead
                        className="px-4 py-3 text-left text-xs font-semibold text-gray-700 uppercase tracking-wider cursor-pointer hover:bg-gray-100 transition-colors select-none"
                        onClick={() => handleSort(header)}
                      >
                        <div className="flex items-center space-x-1">
                          <span>{header}</span>
                          {columnFilters[header]?.length > 0 && (
                            <FilterIcon className="w-3 h-3 text-blue-500" />
                          )}
                          {settings.sortColumn === header && (
                            settings.sortDirection === 'asc' ? (
                              <ChevronUp className="w-3 h-3 text-blue-500" />
                            ) : (
                              <ChevronDown className="w-3 h-3 text-blue-500" />
                            )
                          )}
                        </div>
                      </TableHead>
                    </ContextMenuTrigger>
                    <ContextMenuContent className="w-48 bg-white border border-gray-200 shadow-lg rounded-md">
                      <ContextMenuSub>
                        <ContextMenuSubTrigger className="flex items-center">
                          <ArrowUp className="w-4 h-4 mr-2" /> Sort
                        </ContextMenuSubTrigger>
                        <ContextMenuSubContent className="bg-white border border-gray-200 shadow-lg rounded-md">
                          <ContextMenuItem onClick={() => handleSort(header, 'asc')}>
                            <ArrowUp className="w-4 h-4 mr-2" /> Ascending
                          </ContextMenuItem>
                          <ContextMenuItem onClick={() => handleSort(header, 'desc')}>
                            <ArrowDown className="w-4 h-4 mr-2" /> Descending
                          </ContextMenuItem>
                        </ContextMenuSubContent>
                      </ContextMenuSub>
                      <ContextMenuSeparator />
                      <ContextMenuSub>
                        <ContextMenuSubTrigger className="flex items-center">
                          <FilterIcon className="w-4 h-4 mr-2" /> Filter
                        </ContextMenuSubTrigger>
                        <ContextMenuSubContent className="bg-white border border-gray-200 shadow-lg rounded-md p-0">
                          <FilterMenu column={header} />
                        </ContextMenuSubContent>
                      </ContextMenuSub>
                      {columnFilters[header]?.length > 0 && (
                        <>
                          <ContextMenuSeparator />
                          <ContextMenuItem onClick={() => clearColumnFilter(header)}>
                            Clear Filter
                          </ContextMenuItem>
                        </>
                      )}
                    </ContextMenuContent>
                  </ContextMenu>
                ))}
              </TableRow>
            </TableHeader>
            <TableBody>
              {currentRows.map((row, index) => (
                <TableRow key={startIndex + index} className="hover:bg-blue-50 transition-colors border-b border-gray-100">
                  {settings.selectedColumns.map(header => (
                    <TableCell key={header} className="px-4 py-3 text-sm text-gray-800 whitespace-nowrap">
                      {row[header] !== null && row[header] !== undefined ? (
                        String(row[header])
                      ) : (
                        <span className="text-gray-400 italic">—</span>
                      )}
                    </TableCell>
                  ))}
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      </div>

      {totalPages > 1 && (
        <div className="border-t border-gray-200 bg-gray-50 px-6 py-4">
          <div className="flex items-center justify-between">
            <div className="text-sm text-gray-600">Page {currentPage} of {totalPages}</div>
            <Pagination>
              <PaginationContent>
                <PaginationItem>
                  <PaginationPrevious
                    onClick={() => setCurrentPage(Math.max(1, currentPage - 1))}
                    className={currentPage === 1 ? 'pointer-events-none opacity-50' : 'cursor-pointer'}
                  />
                </PaginationItem>
                {Array.from({ length: Math.min(5, totalPages) }, (_, i) => {
                  let pageNum;
                  if (totalPages <= 5) {
                    pageNum = i + 1;
                  } else if (currentPage <= 3) {
                    pageNum = i + 1;
                  } else if (currentPage >= totalPages - 2) {
                    pageNum = totalPages - 4 + i;
                  } else {
                    pageNum = currentPage - 2 + i;
                  }
                  return (
                    <PaginationItem key={pageNum}>
                      <PaginationLink
                        onClick={() => setCurrentPage(pageNum)}
                        isActive={currentPage === pageNum}
                        className="cursor-pointer"
                      >
                        {pageNum}
                      </PaginationLink>
                    </PaginationItem>
                  );
                })}
                <PaginationItem>
                  <PaginationNext
                    onClick={() => setCurrentPage(Math.min(totalPages, currentPage + 1))}
                    className={currentPage === totalPages ? 'pointer-events-none opacity-50' : 'cursor-pointer'}
                  />
                </PaginationItem>
              </PaginationContent>
            </Pagination>
          </div>
        </div>
      )}
        </div>
      </div>
    </div>
  );
};

export default DataFrameView;
