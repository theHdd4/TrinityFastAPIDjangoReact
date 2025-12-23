/**
 * Reusable Data Summary Table Component
 * Displays cardinality data with metadata support for derived columns
 */
import React, { useMemo, useState } from 'react';
import { Badge } from '@/components/ui/badge';
import { Plus, ArrowUp, ArrowDown, Filter as FilterIcon } from 'lucide-react';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
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
import Table from '@/templates/tables/table';
import { ColumnInfoIcon } from '@/components/AtomList/atoms/table/components/ColumnInfoIcon';
import { ColumnInfo } from './types';

interface DataSummaryTableProps {
  data: ColumnInfo[];
  loading: boolean;
  error: string | null;
  metadataAvailable: boolean;
  borderColor?: string;
  title?: string;
  subtitle?: string;
  subtitleClickable?: boolean;
  onSubtitleClick?: () => void;
  controls?: React.ReactNode;
  defaultMinimized?: boolean;
}

export const DataSummaryTable: React.FC<DataSummaryTableProps> = ({
  data,
  loading,
  error,
  metadataAvailable,
  borderColor = "border-gray-500",
  title = "Data Summary",
  subtitle = "Data in detail",
  subtitleClickable = false,
  onSubtitleClick,
  controls,
  defaultMinimized,
}) => {
  // Sorting and filtering state
  const [sortColumn, setSortColumn] = useState<string>('unique_count');
  const [sortDirection, setSortDirection] = useState<'asc' | 'desc'>('desc');
  const [columnFilters, setColumnFilters] = useState<Record<string, string[]>>({});

  // Handle sorting
  const handleSort = (column: string, direction?: 'asc' | 'desc') => {
    if (sortColumn === column) {
      if (sortDirection === 'asc') {
        setSortDirection('desc');
      } else if (sortDirection === 'desc') {
        setSortColumn('');
        setSortDirection('asc');
      }
    } else {
      setSortColumn(column);
      setSortDirection(direction || 'asc');
    }
  };

  // Handle column filtering
  const handleColumnFilter = (column: string, values: string[]) => {
    setColumnFilters(prev => ({
      ...prev,
      [column]: values
    }));
  };

  const clearColumnFilter = (column: string) => {
    setColumnFilters(prev => {
      const cpy = { ...prev };
      delete cpy[column];
      return cpy;
    });
  };

  // Get unique values for filtering
  const getUniqueColumnValues = (column: string): string[] => {
    if (!data.length) return [];
    
    // Apply other active filters to get hierarchical filtering
    let filteredData = data;
    Object.entries(columnFilters).forEach(([col, filterValues]) => {
      if (col !== column && filterValues && filterValues.length > 0) {
        filteredData = filteredData.filter(row => {
          const cellValue = String(row[col as keyof ColumnInfo] || '');
          return filterValues.includes(cellValue);
        });
      }
    });

    // Get unique values from the filtered data
    const values = filteredData.map(row => String(row[column as keyof ColumnInfo] || '')).filter(Boolean);
    return Array.from(new Set(values)).sort();
  };

  // Apply filtering and sorting
  const displayedData = useMemo(() => {
    let filtered = Array.isArray(data) ? data : [];

    // Filter out columns with unique_count = 0
    filtered = filtered.filter(c => c.unique_count > 0);

    // Apply column filters
    Object.entries(columnFilters).forEach(([column, filterValues]) => {
      if (filterValues && filterValues.length > 0) {
        filtered = filtered.filter(row => {
          const cellValue = String(row[column as keyof ColumnInfo] || '');
          return filterValues.includes(cellValue);
        });
      }
    });

    // Apply sorting
    if (sortColumn) {
      filtered = [...filtered].sort((a, b) => {
        const aVal = a[sortColumn as keyof ColumnInfo];
        const bVal = b[sortColumn as keyof ColumnInfo];
        if (aVal === bVal) return 0;
        let comparison = 0;
        if (typeof aVal === 'number' && typeof bVal === 'number') {
          comparison = aVal - bVal;
        } else {
          comparison = String(aVal).localeCompare(String(bVal));
        }
        return sortDirection === 'desc' ? -comparison : comparison;
      });
    }

    return filtered;
  }, [data, columnFilters, sortColumn, sortDirection]);

  // Filter menu component
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

  // Loading state
  if (loading) {
    return (
      <div className="p-4 text-blue-600">
        Loading {title.toLowerCase()}...
      </div>
    );
  }

  // Error state
  if (error) {
    return (
      <div className="p-4 text-red-600">
        {error}
      </div>
    );
  }

  // No data state
  if (!data || data.length === 0) {
    return (
      <div className="p-4 text-gray-600">
        No data available for {title.toLowerCase()}
      </div>
    );
  }

  return (
    <Table
      headers={[
        <ContextMenu key="Column">
          <ContextMenuTrigger asChild>
            <div className="flex items-center gap-1 cursor-pointer">
              Column
              {sortColumn === 'column' && (
                sortDirection === 'asc' ? <ArrowUp className="w-3 h-3" /> : <ArrowDown className="w-3 h-3" />
              )}
            </div>
          </ContextMenuTrigger>
          <ContextMenuContent className="w-48 bg-white border border-gray-200 shadow-lg rounded-md">
            <ContextMenuSub>
              <ContextMenuSubTrigger className="flex items-center">
                <ArrowUp className="w-4 h-4 mr-2" /> Sort
              </ContextMenuSubTrigger>
              <ContextMenuSubContent className="bg-white border border-gray-200 shadow-lg rounded-md">
                <ContextMenuItem onClick={() => handleSort('column', 'asc')}>
                  <ArrowUp className="w-4 h-4 mr-2" /> Ascending
                </ContextMenuItem>
                <ContextMenuItem onClick={() => handleSort('column', 'desc')}>
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
                <FilterMenu column="column" />
              </ContextMenuSubContent>
            </ContextMenuSub>
            {columnFilters['column']?.length > 0 && (
              <>
                <ContextMenuSeparator />
                <ContextMenuItem onClick={() => clearColumnFilter('column')}>
                  Clear Filter
                </ContextMenuItem>
              </>
            )}
          </ContextMenuContent>
        </ContextMenu>,
        <ContextMenu key="Data type">
          <ContextMenuTrigger asChild>
            <div className="flex items-center gap-1 cursor-pointer">
              Data type
              {sortColumn === 'data_type' && (
                sortDirection === 'asc' ? <ArrowUp className="w-3 h-3" /> : <ArrowDown className="w-3 h-3" />
              )}
            </div>
          </ContextMenuTrigger>
          <ContextMenuContent className="w-48 bg-white border border-gray-200 shadow-lg rounded-md">
            <ContextMenuSub>
              <ContextMenuSubTrigger className="flex items-center">
                <ArrowUp className="w-4 h-4 mr-2" /> Sort
              </ContextMenuSubTrigger>
              <ContextMenuSubContent className="bg-white border border-gray-200 shadow-lg rounded-md">
                <ContextMenuItem onClick={() => handleSort('data_type', 'asc')}>
                  <ArrowUp className="w-4 h-4 mr-2" /> Ascending
                </ContextMenuItem>
                <ContextMenuItem onClick={() => handleSort('data_type', 'desc')}>
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
                <FilterMenu column="data_type" />
              </ContextMenuSubContent>
            </ContextMenuSub>
            {columnFilters['data_type']?.length > 0 && (
              <>
                <ContextMenuSeparator />
                <ContextMenuItem onClick={() => clearColumnFilter('data_type')}>
                  Clear Filter
                </ContextMenuItem>
              </>
            )}
          </ContextMenuContent>
        </ContextMenu>,
        <ContextMenu key="Unique count">
          <ContextMenuTrigger asChild>
            <div className="flex items-center gap-1 cursor-pointer">
              Unique count
              {sortColumn === 'unique_count' && (
                sortDirection === 'asc' ? <ArrowUp className="w-3 h-3" /> : <ArrowDown className="w-3 h-3" />
              )}
            </div>
          </ContextMenuTrigger>
          <ContextMenuContent className="w-48 bg-white border border-gray-200 shadow-lg rounded-md">
            <ContextMenuSub>
              <ContextMenuSubTrigger className="flex items-center">
                <ArrowUp className="w-4 h-4 mr-2" /> Sort
              </ContextMenuSubTrigger>
              <ContextMenuSubContent className="bg-white border border-gray-200 shadow-lg rounded-md">
                <ContextMenuItem onClick={() => handleSort('unique_count', 'asc')}>
                  <ArrowUp className="w-4 h-4 mr-2" /> Ascending
                </ContextMenuItem>
                <ContextMenuItem onClick={() => handleSort('unique_count', 'desc')}>
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
                <FilterMenu column="unique_count" />
              </ContextMenuSubContent>
            </ContextMenuSub>
            {columnFilters['unique_count']?.length > 0 && (
              <>
                <ContextMenuSeparator />
                <ContextMenuItem onClick={() => clearColumnFilter('unique_count')}>
                  Clear Filter
                </ContextMenuItem>
              </>
            )}
          </ContextMenuContent>
        </ContextMenu>,
        "Sample values"
      ]}
      colClasses={["w-[30%]", "w-[20%]", "w-[15%]", "w-[35%]"]}
      bodyClassName="max-h-[350px] overflow-y-auto"
      defaultMinimized={defaultMinimized !== undefined ? defaultMinimized : true}
      borderColor={borderColor}
      customHeader={{
        title: (
          <span className="flex items-center gap-2">
            <span>{title}</span>
            {subtitle && (
              <>
                <span className="text-slate-400">|</span>
                <span
                  className={subtitleClickable ? 'text-blue-500 cursor-pointer hover:text-blue-700 hover:underline' : 'text-slate-500'}
                  onClick={subtitleClickable ? onSubtitleClick : undefined}
                >
                  {subtitle}
                </span>
              </>
            )}
          </span>
        ),
        subtitle: undefined, // Remove subtitle since it's now part of title
        subtitleClickable: false,
        onSubtitleClick: undefined,
        controls,
        compactHeader: true, // Use compact header for smaller tabs
      }}
    >
      {displayedData.map((col, index) => (
        <tr key={index} className="table-row">
          <td className="table-cell border-b border-slate-200">
            <div className="flex items-center gap-1 min-w-0">
              <span className="truncate min-w-0">{col.column}</span>
              {/* 🎯 FIXED: Column name and icon are now adjacent with minimal gap */}
              {col.metadata?.is_created && (
                <div className="flex-shrink-0">
                  <ColumnInfoIcon metadata={col.metadata} />
                </div>
              )}
            </div>
          </td>
          <td className="table-cell border-b border-slate-200">{col.data_type}</td>
          <td className="table-cell border-b border-slate-200">{col.unique_count.toLocaleString()}</td>
          <td className="table-cell border-b border-slate-200">
            <div className="flex flex-wrap items-center gap-1">
              {col.unique_values.slice(0, 2).map((val, i) => (
                <Badge
                  key={i}
                  className="p-0 px-1 text-xs bg-gray-50 text-slate-700 hover:bg-gray-50"
                >
                  {String(val)}
                </Badge>
              ))}
              {col.unique_values.length > 2 && (
                <Tooltip>
                  <TooltipTrigger asChild>
                    <span className="flex items-center gap-0.5 text-xs text-slate-600 font-medium cursor-pointer">
                      <Plus className="w-3 h-3" />
                      {col.unique_values.length - 2}
                    </span>
                  </TooltipTrigger>
                  <TooltipContent className="text-xs max-w-xs whitespace-pre-wrap">
                    {col.unique_values
                      .slice(2)
                      .map(val => String(val))
                      .join(', ')}
                  </TooltipContent>
                </Tooltip>
              )}
            </div>
          </td>
        </tr>
      ))}
    </Table>
  );
};