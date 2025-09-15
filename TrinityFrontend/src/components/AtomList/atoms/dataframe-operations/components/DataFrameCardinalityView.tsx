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
import { DataFrameData } from '../DataFrameOperationsAtom';
import dataframeOperations from '../index';
import { useLaboratoryStore } from '@/components/LaboratoryMode/store/laboratoryStore';

interface ColumnInfo {
  column: string;
  data_type: string;
  unique_count: number;
  unique_values: string[];
}

interface DataFrameCardinalityViewProps {
  data: DataFrameData | null;
  atomId?: string;
}

const DataFrameCardinalityView: React.FC<DataFrameCardinalityViewProps> = ({
  data,
  atomId,
}) => {
  const [sortColumn, setSortColumn] = useState<string>('unique_count');
  const [sortDirection, setSortDirection] = useState<'asc' | 'desc'>('desc');
  const [columnFilters, setColumnFilters] = useState<Record<string, string[]>>({});

  // Get atom settings to access the selected file name
  const atom = useLaboratoryStore(state => atomId ? state.getAtom(atomId) : undefined);
  const settings = (atom?.settings as any) || {};
  const inputFileName = settings.selectedFile || '';

  // Handle opening the dataframe in a new tab
  const handleViewDataClick = () => {
    if (inputFileName && atomId) {
      window.open(`/dataframe?name=${encodeURIComponent(inputFileName)}`, '_blank');
    }
  };

  const columnSummary = useMemo(() => {
    if (!data || !data.headers || !data.rows) {
      return [];
    }

    return data.headers.map(header => {
      const values = data.rows.map(row => row[header]).filter(val => val !== null && val !== undefined && val !== '');
      const uniqueValues = Array.from(new Set(values.map(val => String(val))));
      
      // Analyze actual data to determine pandas-style data types like column-classifier
      let pandasDataType = 'object'; // default
      
      if (values.length > 0) {
        // Check if all values are numeric
        const numericValues = values.filter(val => {
          const num = Number(val);
          return !isNaN(num) && isFinite(num);
        });
        
        if (numericValues.length === values.length) {
          // All values are numeric
          if (numericValues.every(val => Number.isInteger(Number(val)))) {
            pandasDataType = 'int64';
          } else {
            pandasDataType = 'float64';
          }
        } else {
          // Check if all values are dates
          const dateValues = values.filter(val => {
            const date = new Date(val);
            return !isNaN(date.getTime());
          });
          
          if (dateValues.length === values.length) {
            pandasDataType = 'datetime64[ns]';
          } else {
            pandasDataType = 'object';
          }
        }
      }

      return {
        column: header,
        data_type: pandasDataType,
        unique_count: uniqueValues.length,
        unique_values: uniqueValues, // No truncation - show all values
      } as ColumnInfo;
    });
  }, [data]);

  const displayed = useMemo(() => {
    let filtered = columnSummary;

    // Apply column filters
    Object.entries(columnFilters).forEach(([column, filterValues]) => {
      if (filterValues && Array.isArray(filterValues) && filterValues.length > 0) {
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
  }, [columnSummary, columnFilters, sortColumn, sortDirection]);

  const getUniqueColumnValues = (column: string): string[] => {
    if (!columnSummary.length) return [];
    
    // Get the currently filtered data (before applying the current column's filter)
    let filteredData = columnSummary;

    // Apply all other column filters except the current one
    Object.entries(columnFilters).forEach(([col, filterValues]) => {
      if (col !== column && filterValues && Array.isArray(filterValues) && filterValues.length > 0) {
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

  if (!data || !displayed.length) return null;

  return (
    <div className="w-full mb-4">
      <div className="mx-auto max-w-screen-2xl rounded-2xl border border-slate-200 bg-white shadow-sm">
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
          bodyClassName="max-h-[300px] overflow-y-auto"
          defaultMinimized={true}
          borderColor={`border-${dataframeOperations.color.replace('bg-', '')}`}
          customHeader={{
            title: "Cardinality View",
            subtitle: "Click Here to View Data",
            subtitleClickable: !!inputFileName && !!atomId,
            onSubtitleClick: handleViewDataClick
          }}
        >
          {displayed.map(col => (
            <tr key={col.column} className="table-row">
              <td className="table-cell-primary">{col.column}</td>
              <td className="table-cell">{col.data_type}</td>
              <td className="table-cell">{col.unique_count.toLocaleString()}</td>
              <td className="table-cell">
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
      </div>
    </div>
  );
};

export default DataFrameCardinalityView;
