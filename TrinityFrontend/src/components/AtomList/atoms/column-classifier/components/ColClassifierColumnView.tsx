import React, { useEffect, useState, useMemo } from 'react';
import { Badge } from '@/components/ui/badge';
import { Switch } from '@/components/ui/switch';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';
import { Plus, ArrowUp, ArrowDown, Filter as FilterIcon } from 'lucide-react';
import { Checkbox } from '@/components/ui/checkbox';
import { Button } from '@/components/ui/button';
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
import { FEATURE_OVERVIEW_API, GROUPBY_API } from '@/lib/api';
import { useLaboratoryStore } from '@/components/LaboratoryMode/store/laboratoryStore';
import columnClassifier from '../index';

interface ColumnInfo {
  column: string;
  data_type: string;
  unique_count: number;
  unique_values: string[];
}

interface ColumnInfoWithCategory extends ColumnInfo {
  category: 'unclassified' | 'identifiers' | 'measures';
}

interface ColClassifierColumnViewProps {
  objectName: string;
  columns: {
    unclassified: string[];
    identifiers: string[];
    measures: string[];
  };
  filterUnique: boolean;
  onFilterToggle: (val: boolean) => void;
  atomId?: string;
}

const ColClassifierColumnView: React.FC<ColClassifierColumnViewProps> = ({
  objectName,
  columns,
  filterUnique,
  onFilterToggle,
  atomId,
}) => {
  const [summary, setSummary] = useState<ColumnInfo[]>([]);
  const [sortColumn, setSortColumn] = useState<string>('unique_count');
  const [sortDirection, setSortDirection] = useState<'asc' | 'desc'>('desc');
  const [columnFilters, setColumnFilters] = useState<Record<string, string[]>>({});

  // Get atom settings to access the input file name
  const atom = useLaboratoryStore(state => atomId ? state.getAtom(atomId) : undefined);
  const settings = (atom?.settings as any) || {};
  const inputFileName = settings.validatorId || '';

  // Handle opening the input file in a new tab
  const handleViewDataClick = () => {
    if (inputFileName && atomId) {
      window.open(`/dataframe?name=${encodeURIComponent(inputFileName)}`, '_blank');
    }
  };

  useEffect(() => {
    if (!objectName) return;
    const fetchSummary = async () => {
      try {
        const url = `${GROUPBY_API}/cardinality?object_name=${encodeURIComponent(objectName)}`;
        const res = await fetch(url);
        const data = await res.json();
        
        if (data.status === 'SUCCESS' && data.cardinality) {
          setSummary(data.cardinality);
        } else {
          setSummary([]);
        }
      } catch {
        setSummary([]);
      }
    };
    fetchSummary();
  }, [objectName]);

  const allColumns = useMemo(() => {
    const mapWithCategory = (
      names: string[],
      category: ColumnInfoWithCategory['category']
    ) =>
      names
        .map(name => {
          const info = summary.find(s => s.column === name);
          return info ? { ...info, category } : null;
        })
        .filter(Boolean) as ColumnInfoWithCategory[];

    return [
      ...mapWithCategory(columns.unclassified, 'unclassified'),
      ...mapWithCategory(columns.identifiers, 'identifiers'),
      ...mapWithCategory(columns.measures, 'measures'),
    ];
  }, [columns, summary]);

  const displayed = useMemo(() => {
    let filtered = filterUnique
      ? allColumns.filter(c => c.unique_count > 0)
      : allColumns;

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
  }, [allColumns, filterUnique, columnFilters, sortColumn, sortDirection]);

  const getUniqueColumnValues = (column: string): string[] => {
    if (!allColumns.length) return [];
    
    // Get the currently filtered data (before applying the current column's filter)
    let filteredData = filterUnique
      ? allColumns.filter(c => c.unique_count > 0)
      : allColumns;

    // Apply all other column filters except the current one
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

  if (!displayed.length) return null;

  return (
    <div className="w-full">
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
          bodyClassName="max-h-[484px] overflow-y-auto"
          defaultMinimized={true}
          borderColor={`border-${columnClassifier.color.replace('bg-', '')}`}
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
  );
};

export default ColClassifierColumnView;

