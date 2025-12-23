import React, { useMemo, useState, useEffect } from 'react';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import {
  Pagination,
  PaginationContent,
  PaginationItem,
  PaginationLink,
  PaginationNext,
  PaginationPrevious,
} from '@/components/ui/pagination';
import { cn } from '@/lib/utils';
import {
  AlertTriangle,
  Info,
  Loader2,
  Save,
  RefreshCcw,
  ArrowUpDown,
  ArrowUp,
  ArrowDown,
  Download,
  Filter,
  Filter as FilterIcon,
  Plus,
} from 'lucide-react';
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
import { Checkbox } from '@/components/ui/checkbox';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';
import { UnpivotSettings } from '@/components/LaboratoryMode/store/laboratoryStore';
import { GROUPBY_API } from '@/lib/api';
import Table from '@/templates/tables/table';

interface UnpivotCanvasProps {
  data: UnpivotSettings;
  onDataChange: (data: Partial<UnpivotSettings>) => void;
  isLoading: boolean;
  error: string | null;
  infoMessage: string | null;
  isSaving: boolean;
  saveError: string | null;
  saveMessage: string | null;
  onRefresh: () => void;
  onSaveAs: () => void;
  atomId?: string;
}

type SortConfig = {
  column: string;
  direction: 'asc' | 'desc';
};

const ITEMS_PER_PAGE = 15;

const UnpivotCanvas: React.FC<UnpivotCanvasProps> = ({
  data,
  onDataChange,
  isLoading,
  error,
  infoMessage,
  isSaving,
  saveError,
  saveMessage,
  onRefresh,
  onSaveAs,
  atomId,
}) => {
  const [currentPage, setCurrentPage] = useState(1);
  const [sortConfig, setSortConfig] = useState<SortConfig | null>(null);
  const [filterSelections, setFilterSelections] = useState<Record<string, string[]>>({});

  // Cardinality view state
  const [cardinalityData, setCardinalityData] = useState<any[]>([]);
  const [cardinalityLoading, setCardinalityLoading] = useState(false);
  const [cardinalityError, setCardinalityError] = useState<string | null>(null);
  const [cardinalitySortColumn, setCardinalitySortColumn] = useState<string>('unique_count');
  const [cardinalitySortDirection, setCardinalitySortDirection] = useState<'asc' | 'desc'>('desc');
  const [cardinalityColumnFilters, setCardinalityColumnFilters] = useState<{ [key: string]: string[] }>({});

  const results = data.unpivotResults || [];
  const columns = useMemo(() => {
    if (results.length === 0) return [];
    return Object.keys(results[0]);
  }, [results]);

  // Get unique values for each column (for filter options)
  const columnFilterOptions = useMemo(() => {
    const options: Record<string, string[]> = {};
    columns.forEach((col) => {
      const uniqueValues = new Set<string>();
      results.forEach((row: any) => {
        const value = row[col];
        if (value !== null && value !== undefined) {
          uniqueValues.add(String(value));
        }
      });
      options[col] = Array.from(uniqueValues).sort();
    });
    return options;
  }, [results, columns]);

  const sortedAndFilteredResults = useMemo(() => {
    let filtered = results;

    // Apply column filters
    Object.entries(filterSelections).forEach(([column, selectedValues]) => {
      if (Array.isArray(selectedValues) && selectedValues.length > 0) {
        filtered = filtered.filter((row: any) => {
          const value = String(row[column] ?? '');
          return selectedValues.includes(value);
        });
      }
    });

    // Apply sorting
    if (sortConfig) {
      filtered = [...filtered].sort((a: any, b: any) => {
        const aVal = a[sortConfig.column];
        const bVal = b[sortConfig.column];
        
        if (aVal === null || aVal === undefined) return 1;
        if (bVal === null || bVal === undefined) return -1;
        
        const comparison = String(aVal).localeCompare(String(bVal), undefined, { numeric: true });
        return sortConfig.direction === 'asc' ? comparison : -comparison;
      });
    }

    return filtered;
  }, [results, sortConfig, filterSelections]);

  const totalPages = Math.ceil(sortedAndFilteredResults.length / ITEMS_PER_PAGE);
  const paginatedResults = sortedAndFilteredResults.slice(
    (currentPage - 1) * ITEMS_PER_PAGE,
    currentPage * ITEMS_PER_PAGE
  );


  const handleFilterSelectionsChange = (column: string, selections: string[]) => {
    const uniqueValues = getUniqueColumnValuesForFilter(column);
    setFilterSelections((prev) => {
      if (selections.length === 0 || selections.length === uniqueValues.length) {
        // If all or none selected, remove filter
        const newFilters = { ...prev };
        delete newFilters[column];
        return newFilters;
      }
      return { ...prev, [column]: selections };
    });
    setCurrentPage(1);
  };

  const handleSort = (column: string, direction?: 'asc' | 'desc') => {
    if (sortConfig?.column === column) {
      if (sortConfig.direction === 'asc') {
        setSortConfig({ column, direction: 'desc' });
      } else if (sortConfig.direction === 'desc') {
        setSortConfig(null);
      }
    } else {
      setSortConfig({ column, direction: direction || 'asc' });
    }
    setCurrentPage(1);
  };

  const clearColumnFilter = (column: string) => {
    setFilterSelections((prev) => {
      const cpy = { ...prev };
      delete cpy[column];
      return cpy;
    });
    setCurrentPage(1);
  };

  const getUniqueColumnValuesForFilter = (column: string): string[] => {
    if (!results.length) return [];
    
    // Apply other active filters to get hierarchical filtering
    const otherFilters = Object.entries(filterSelections).filter(([key]) => key !== column);
    let dataToUse = results;
    
    if (otherFilters.length > 0) {
      dataToUse = results.filter((row: any) => {
        return otherFilters.every(([filterColumn, filterValues]) => {
          if (!Array.isArray(filterValues) || filterValues.length === 0) return true;
          const cellValue = String(row[filterColumn] ?? '');
          return filterValues.includes(cellValue);
        });
      });
    }
    
    const values = dataToUse.map((row: any) => String(row[column] ?? ''));
    const uniqueValues = Array.from(new Set(values)) as string[];
    return uniqueValues.sort();
  };

  const TableFilterMenu = ({ column }: { column: string }) => {
    const uniqueValues = getUniqueColumnValuesForFilter(column);
    const currentSelections = filterSelections[column] || [];
    
    const allSelected = uniqueValues.length > 0 && uniqueValues.every(value => 
      Array.isArray(currentSelections) && currentSelections.includes(value)
    );

    return (
      <div className="max-h-48 overflow-y-auto space-y-1">
        {/* Select All / Deselect All */}
        <div className="border-b border-gray-200 pb-2 mb-2">
          <label className="flex items-center space-x-2 text-xs cursor-pointer font-medium" style={{userSelect:'none'}} onMouseDown={e => e.stopPropagation()}>
            <input
              type="checkbox"
              checked={allSelected}
              onMouseDown={e => e.stopPropagation()}
              onChange={e => {
                const allValues = uniqueValues || [];
                if (e.target.checked) {
                  setFilterSelections(prev => ({
                    ...prev,
                    [column]: allValues
                  }));
                } else {
                  setFilterSelections(prev => ({
                    ...prev,
                    [column]: []
                  }));
                }
              }}
              style={{ accentColor: '#222' }}
            />
            <span className="truncate font-semibold">
              {allSelected ? 'Deselect All' : 'Select All'}
            </span>
          </label>
        </div>
        
        {/* Individual filter options */}
        {uniqueValues.map((value, i) => (
          <label key={i} className="flex items-center space-x-2 text-xs cursor-pointer" style={{userSelect:'none'}} onMouseDown={e => e.stopPropagation()}>
            <input
              type="checkbox"
              checked={Array.isArray(currentSelections) && currentSelections.includes(value)}
              onMouseDown={e => e.stopPropagation()}
              onChange={e => {
                const newSelections = e.target.checked
                  ? [...currentSelections, value]
                  : currentSelections.filter(v => v !== value);
                // Update local selections without applying
                setFilterSelections(prev => ({
                  ...prev,
                  [column]: newSelections
                }));
              }}
              style={{ accentColor: '#222' }}
            />
            <span className="truncate">{value}</span>
          </label>
        ))}
        
        {/* Action buttons */}
        <div className="mt-3 flex gap-2">
          <button
            className="px-2 py-1 text-xs rounded bg-blue-600 hover:bg-blue-700 text-white flex-1"
            onClick={e => {
              e.preventDefault();
              e.stopPropagation();
              const selections = filterSelections[column] || [];
              handleFilterSelectionsChange(column, selections);
            }}
          >Apply</button>
          <button
            className="px-2 py-1 text-xs rounded bg-blue-500 hover:bg-blue-600 text-white flex-1"
            onClick={e => {
              e.preventDefault();
              e.stopPropagation();
              clearColumnFilter(column);
              setFilterSelections(prev => {
                const newFilters = { ...prev };
                delete newFilters[column];
                return newFilters;
              });
            }}
          >Clear</button>
        </div>
      </div>
    );
  };

  const renderHeaderWithSortFilter = (column: string) => {
    const sorting = sortConfig?.column === column ? sortConfig.direction : null;
    const hasFilter = filterSelections[column] && filterSelections[column].length > 0;

    return (
      <ContextMenu>
        <ContextMenuTrigger asChild>
          <div className="flex items-center gap-1 cursor-pointer">
            {column}
            {sorting && (
              sorting === 'asc' ? <ArrowUp className="w-3 h-3" /> : <ArrowDown className="w-3 h-3" />
            )}
          </div>
        </ContextMenuTrigger>
        <ContextMenuContent className="w-48 bg-white border border-gray-200 shadow-lg rounded-md">
          <ContextMenuSub>
            <ContextMenuSubTrigger className="flex items-center">
              <ArrowUp className="w-4 h-4 mr-2" /> Sort
            </ContextMenuSubTrigger>
            <ContextMenuSubContent className="bg-white border border-gray-200 shadow-lg rounded-md">
              <ContextMenuItem onClick={() => handleSort(column, 'asc')}>
                <ArrowUp className="w-4 h-4 mr-2" /> Sort Ascending
              </ContextMenuItem>
              <ContextMenuItem onClick={() => handleSort(column, 'desc')}>
                <ArrowDown className="w-4 h-4 mr-2" /> Sort Descending
              </ContextMenuItem>
            </ContextMenuSubContent>
          </ContextMenuSub>
          {sorting && (
            <>
              <ContextMenuSeparator />
              <ContextMenuItem onClick={() => setSortConfig(null)}>
                Clear Sort
              </ContextMenuItem>
            </>
          )}
          <ContextMenuSeparator />
          <ContextMenuSub>
            <ContextMenuSubTrigger className="flex items-center">
              <FilterIcon className="w-4 h-4 mr-2" /> Filter
            </ContextMenuSubTrigger>
            <ContextMenuSubContent className="bg-white border border-gray-200 shadow-lg rounded-md p-2">
              <TableFilterMenu column={column} />
            </ContextMenuSubContent>
          </ContextMenuSub>
          {hasFilter && (
            <>
              <ContextMenuSeparator />
              <ContextMenuItem onClick={() => clearColumnFilter(column)}>
                Clear Filter
              </ContextMenuItem>
            </>
          )}
        </ContextMenuContent>
      </ContextMenu>
    );
  };

  const formatValue = (value: any): string => {
    if (value === null || value === undefined) return '';
    if (typeof value === 'number') {
      return Number.isInteger(value) ? value.toString() : value.toFixed(2);
    }
    return String(value);
  };

  // Cardinality functions
  const fetchCardinalityData = async () => {
    if (!data.datasetPath) return;
    
    setCardinalityLoading(true);
    setCardinalityError(null);
    
    try {
      const url = `${GROUPBY_API}/cardinality?object_name=${encodeURIComponent(data.datasetPath)}`;
      const res = await fetch(url);
      const data_result = await res.json();
      
      if (data_result.status === 'SUCCESS' && data_result.cardinality) {
        setCardinalityData(data_result.cardinality);
      } else {
        setCardinalityError(data_result.error || 'Failed to fetch cardinality data');
      }
    } catch (e: any) {
      setCardinalityError(e.message || 'Error fetching cardinality data');
    } finally {
      setCardinalityLoading(false);
    }
  };

  // Fetch cardinality data when datasetPath changes
  useEffect(() => {
    if (data.datasetPath) {
      fetchCardinalityData();
    }
  }, [data.datasetPath]);

  const displayedCardinality = useMemo(() => {
    let filtered = cardinalityData.filter(c => c.unique_count > 0);
    
    // Apply column filters
    Object.entries(cardinalityColumnFilters).forEach(([column, filterValues]) => {
      if (Array.isArray(filterValues) && filterValues.length > 0) {
        filtered = filtered.filter(row => {
          const cellValue = String(row[column] || '');
          return filterValues.includes(cellValue);
        });
      }
    });
    
    // Apply sorting
    if (cardinalitySortColumn) {
      filtered = [...filtered].sort((a, b) => {
        const aVal = a[cardinalitySortColumn];
        const bVal = b[cardinalitySortColumn];
        if (aVal === bVal) return 0;
        let comparison = 0;
        if (typeof aVal === 'number' && typeof bVal === 'number') {
          comparison = aVal - bVal;
        } else {
          comparison = String(aVal).localeCompare(String(bVal));
        }
        return cardinalitySortDirection === 'desc' ? -comparison : comparison;
      });
    }
    
    return filtered;
  }, [cardinalityData, cardinalityColumnFilters, cardinalitySortColumn, cardinalitySortDirection]);

  const getUniqueColumnValues = (column: string): string[] => {
    if (!cardinalityData.length) return [];
    
    // Apply other active filters to get hierarchical filtering
    const otherFilters = Object.entries(cardinalityColumnFilters).filter(([key]) => key !== column);
    let dataToUse = cardinalityData;
    
    if (otherFilters.length > 0) {
      dataToUse = cardinalityData.filter(item => {
        return otherFilters.every(([filterColumn, filterValues]) => {
          if (!Array.isArray(filterValues) || filterValues.length === 0) return true;
          const cellValue = String(item[filterColumn] || '');
          return filterValues.includes(cellValue);
        });
      });
    }
    
    const values = dataToUse.map(item => String(item[column] || ''));
    const uniqueValues = Array.from(new Set(values)) as string[];
    return uniqueValues.sort();
  };

  const handleCardinalitySort = (column: string, direction?: 'asc' | 'desc') => {
    if (cardinalitySortColumn === column) {
      if (cardinalitySortDirection === 'asc') {
        setCardinalitySortDirection('desc');
      } else if (cardinalitySortDirection === 'desc') {
        setCardinalitySortColumn('');
        setCardinalitySortDirection('asc');
      }
    } else {
      setCardinalitySortColumn(column);
      setCardinalitySortDirection(direction || 'asc');
    }
  };

  const handleCardinalityColumnFilter = (column: string, values: string[]) => {
    setCardinalityColumnFilters(prev => ({
      ...prev,
      [column]: values
    }));
  };

  const clearCardinalityColumnFilter = (column: string) => {
    setCardinalityColumnFilters(prev => {
      const cpy = { ...prev };
      delete cpy[column];
      return cpy;
    });
  };

  const FilterMenu = ({ column }: { column: string }) => {
    const uniqueValues = getUniqueColumnValues(column);
    const current = cardinalityColumnFilters[column] || [];
    // Initialize with all values selected if no filter is active
    const [temp, setTemp] = useState<string[]>(() => {
      return current.length > 0 ? current : uniqueValues;
    });

    // Update temp when uniqueValues change (e.g., when other filters change)
    React.useEffect(() => {
      if (current.length === 0 && uniqueValues.length > 0) {
        // If no filter is active, select all values
        setTemp(uniqueValues);
      } else if (current.length > 0) {
        // If filter is active, keep current selection but update if values changed
        setTemp(current);
      }
    }, [uniqueValues.join(','), current.join(',')]);

    const toggleVal = (val: string) => {
      setTemp(prev => (prev.includes(val) ? prev.filter(v => v !== val) : [...prev, val]));
    };

    const selectAll = () => {
      setTemp(temp.length === uniqueValues.length ? [] : uniqueValues);
    };

    const apply = () => handleCardinalityColumnFilter(column, temp);

    return (
      <div className="w-64 max-h-80 overflow-y-auto">
        <div className="p-2 border-b">
          <div className="flex items-center space-x-2 mb-2">
            <Checkbox checked={temp.length === uniqueValues.length && temp.length > 0} onCheckedChange={selectAll} />
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
          <Button size="sm" variant="outline" onClick={() => setTemp(current.length > 0 ? current : uniqueValues)}>
            Cancel
          </Button>
        </div>
      </div>
    );
  };

  const handleViewDataClick = () => {
    if (data.datasetPath && atomId) {
      window.open(`/dataframe?name=${encodeURIComponent(data.datasetPath)}`, '_blank');
    }
  };

  return (
    <div className="w-full h-full flex flex-col">
      {/* Cardinality View */}
      {data.datasetPath && (
        <div className="mx-4 mt-4 space-y-4">
          {cardinalityLoading && (
            <div className="flex items-center justify-center p-8">
              <div className="text-center">
                <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-green-500 mx-auto mb-2"></div>
                <span className="text-green-600">Loading cardinality data...</span>
              </div>
            </div>
          )}
          
          {cardinalityError && (
            <div className="p-4 bg-red-50 border border-red-200 rounded-md">
              <p className="text-red-600 text-sm">Error loading cardinality data: {cardinalityError}</p>
            </div>
          )}
          
          {!cardinalityLoading && !cardinalityError && displayedCardinality.length > 0 && (
            <Table
              headers={[
                <ContextMenu key="Column">
                  <ContextMenuTrigger asChild>
                    <div className="flex items-center gap-1 cursor-pointer">
                      Column
                      {cardinalitySortColumn === 'column' && (
                        cardinalitySortDirection === 'asc' ? <ArrowUp className="w-3 h-3" /> : <ArrowDown className="w-3 h-3" />
                      )}
                    </div>
                  </ContextMenuTrigger>
                  <ContextMenuContent className="w-48 bg-white border border-gray-200 shadow-lg rounded-md">
                    <ContextMenuSub>
                      <ContextMenuSubTrigger className="flex items-center">
                        <ArrowUp className="w-4 h-4 mr-2" /> Sort
                      </ContextMenuSubTrigger>
                      <ContextMenuSubContent className="bg-white border border-gray-200 shadow-lg rounded-md">
                        <ContextMenuItem onClick={() => handleCardinalitySort('column', 'asc')}>
                          <ArrowUp className="w-4 h-4 mr-2" /> Sort Ascending
                        </ContextMenuItem>
                        <ContextMenuItem onClick={() => handleCardinalitySort('column', 'desc')}>
                          <ArrowDown className="w-4 h-4 mr-2" /> Sort Descending
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
                    {cardinalityColumnFilters['column']?.length > 0 && (
                      <>
                        <ContextMenuSeparator />
                        <ContextMenuItem onClick={() => clearCardinalityColumnFilter('column')}>
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
                      {cardinalitySortColumn === 'data_type' && (
                        cardinalitySortDirection === 'asc' ? <ArrowUp className="w-3 h-3" /> : <ArrowDown className="w-3 h-3" />
                      )}
                    </div>
                  </ContextMenuTrigger>
                  <ContextMenuContent className="w-48 bg-white border border-gray-200 shadow-lg rounded-md">
                    <ContextMenuSub>
                      <ContextMenuSubTrigger className="flex items-center">
                        <ArrowUp className="w-4 h-4 mr-2" /> Sort
                      </ContextMenuSubTrigger>
                      <ContextMenuSubContent className="bg-white border border-gray-200 shadow-lg rounded-md">
                        <ContextMenuItem onClick={() => handleCardinalitySort('data_type', 'asc')}>
                          <ArrowUp className="w-4 h-4 mr-2" /> Sort Ascending
                        </ContextMenuItem>
                        <ContextMenuItem onClick={() => handleCardinalitySort('data_type', 'desc')}>
                          <ArrowDown className="w-4 h-4 mr-2" /> Sort Descending
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
                    {cardinalityColumnFilters['data_type']?.length > 0 && (
                      <>
                        <ContextMenuSeparator />
                        <ContextMenuItem onClick={() => clearCardinalityColumnFilter('data_type')}>
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
                      {cardinalitySortColumn === 'unique_count' && (
                        cardinalitySortDirection === 'asc' ? <ArrowUp className="w-3 h-3" /> : <ArrowDown className="w-3 h-3" />
                      )}
                    </div>
                  </ContextMenuTrigger>
                  <ContextMenuContent className="w-48 bg-white border border-gray-200 shadow-lg rounded-md">
                    <ContextMenuSub>
                      <ContextMenuSubTrigger className="flex items-center">
                        <ArrowUp className="w-4 h-4 mr-2" /> Sort
                      </ContextMenuSubTrigger>
                      <ContextMenuSubContent className="bg-white border border-gray-200 shadow-lg rounded-md">
                        <ContextMenuItem onClick={() => handleCardinalitySort('unique_count', 'asc')}>
                          <ArrowUp className="w-4 h-4 mr-2" /> Sort Ascending
                        </ContextMenuItem>
                        <ContextMenuItem onClick={() => handleCardinalitySort('unique_count', 'desc')}>
                          <ArrowDown className="w-4 h-4 mr-2" /> Sort Descending
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
                    {cardinalityColumnFilters['unique_count']?.length > 0 && (
                      <>
                        <ContextMenuSeparator />
                        <ContextMenuItem onClick={() => clearCardinalityColumnFilter('unique_count')}>
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
              borderColor="border-blue-500"
              customHeader={{
                title: "Data Summary",
                subtitle: "Data in detail",
                subtitleClickable: !!data.datasetPath && !!atomId,
                onSubtitleClick: handleViewDataClick
              }}
            >
              {displayedCardinality.map((col, index) => (
                <tr key={index} className="table-row">
                  <td className="table-cell">{col.column || col.Column || ''}</td>
                  <td className="table-cell">{col.data_type || col['Data type'] || col.Data_Type || ''}</td>
                  <td className="table-cell">{col.unique_count || col['Unique count'] || col.Unique_Count || 0}</td>
                  <td className="table-cell">
                    {col.unique_values ? (
                      <div className="flex flex-wrap items-center gap-1">
                        {Array.isArray(col.unique_values) ? (
                          <>
                            {col.unique_values.slice(0, 2).map((val: any, i: number) => (
                              <span
                                key={i}
                                className="inline-flex items-center px-1.5 py-0.5 rounded text-xs font-medium bg-gray-50 text-slate-700 border border-gray-200"
                              >
                                {String(val)}
                              </span>
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
                          </>
                        ) : (
                          <span className="inline-flex items-center px-1.5 py-0.5 rounded text-xs font-medium bg-gray-50 text-slate-700 border border-gray-200">
                            {String(col.unique_values)}
                          </span>
                        )}
                      </div>
                    ) : (
                      <span className="text-gray-400">—</span>
                    )}
                  </td>
                </tr>
              ))}
            </Table>
          )}
        </div>
      )}

      {/* Toolbar */}
      <div className="flex flex-col gap-2 border-t border-border px-4 py-3 md:flex-row md:items-center md:justify-end">
        <div className="flex items-center gap-2">
          <Button
            onClick={onSaveAs}
            disabled={isSaving || results.length === 0 || isLoading}
            className="bg-blue-600 hover:bg-blue-700 text-white flex items-center space-x-2 px-4"
          >
            {isSaving ? (
              <>
                <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin"></div>
                <span>Saving...</span>
              </>
            ) : (
              <>
                <Save className="w-4 h-4" />
                <span>Save As</span>
              </>
            )}
          </Button>
          <Button
            variant="outline"
            size="sm"
            onClick={onRefresh}
            disabled={isLoading || !data.datasetPath}
            className="h-8 px-3 border-[#D0D0D0] text-[#1A73E8] hover:bg-[#E8F0FE]"
          >
            {isLoading ? <Loader2 className="h-4 w-4 animate-spin" /> : <RefreshCcw className="h-4 w-4" />}
          </Button>
        </div>
      </div>

      {/* Status Messages */}
      {error && (
        <div className="mx-4 mt-4 p-3 bg-red-50 border border-red-200 rounded flex items-start gap-2">
          <AlertTriangle className="h-5 w-5 text-red-600 flex-shrink-0 mt-0.5" />
          <div className="flex-1">
            <p className="text-sm font-medium text-red-800">Error</p>
            <p className="text-sm text-red-700">{error}</p>
          </div>
        </div>
      )}

      {saveError && (
        <div className="mx-4 mt-4 p-3 bg-red-50 border border-red-200 rounded flex items-start gap-2">
          <AlertTriangle className="h-5 w-5 text-red-600 flex-shrink-0 mt-0.5" />
          <div className="flex-1">
            <p className="text-sm font-medium text-red-800">Save Error</p>
            <p className="text-sm text-red-700">{saveError}</p>
          </div>
        </div>
      )}

      {infoMessage && (
        <div className="mx-4 mt-4 p-3 bg-blue-50 border border-blue-200 rounded flex items-start gap-2">
          <Info className="h-5 w-5 text-blue-600 flex-shrink-0 mt-0.5" />
          <p className="text-sm text-blue-800">{infoMessage}</p>
        </div>
      )}

      {/* Summary Card */}
      {data.unpivotSummary && Object.keys(data.unpivotSummary).length > 0 && (
        <div className="mx-4 mt-4">
          <Card className="p-3 bg-gray-50">
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4 text-xs">
              {data.unpivotSummary.original_rows !== undefined && (
                <div>
                  <div className="text-gray-500">Original Rows</div>
                  <div className="font-semibold">{data.unpivotSummary.original_rows.toLocaleString()}</div>
                </div>
              )}
              {data.unpivotSummary.original_columns !== undefined && (
                <div>
                  <div className="text-gray-500">Original Columns</div>
                  <div className="font-semibold">{data.unpivotSummary.original_columns}</div>
                </div>
              )}
              {data.unpivotSummary.unpivoted_rows !== undefined && (
                <div>
                  <div className="text-gray-500">Unpivoted Rows</div>
                  <div className="font-semibold">{data.unpivotSummary.unpivoted_rows.toLocaleString()}</div>
                </div>
              )}
              {data.unpivotSummary.unpivoted_columns !== undefined && (
                <div>
                  <div className="text-gray-500">Unpivoted Columns</div>
                  <div className="font-semibold">{data.unpivotSummary.unpivoted_columns}</div>
                </div>
              )}
            </div>
          </Card>
        </div>
      )}

      {/* Loading State */}
      {isLoading && (
        <div className="flex-1 flex items-center justify-center">
          <div className="text-center">
            <Loader2 className="h-8 w-8 animate-spin text-blue-600 mx-auto mb-2" />
            <p className="text-sm text-gray-600">Computing unpivot...</p>
          </div>
        </div>
      )}

      {/* Data Table */}
      {!isLoading && results.length > 0 && (
        <div className="flex-1 flex flex-col overflow-hidden">
          {/* Table */}
          <div className="flex-1 overflow-auto">
            <Table
              headers={columns.map((col) => renderHeaderWithSortFilter(col))}
              borderColor="border-blue-500"
            >
              {paginatedResults.map((row: any, idx: number) => (
                <tr key={idx} className="table-row">
                  {columns.map((col) => (
                    <td key={col} className="table-cell font-mono text-xs">
                      {formatValue(row[col])}
                    </td>
                  ))}
                </tr>
              ))}
            </Table>
          </div>

          {/* Pagination */}
          {totalPages > 1 && (
            <div className="p-4 border-t">
              <Pagination>
                <PaginationContent>
                  <PaginationItem>
                    <PaginationPrevious
                      onClick={() => setCurrentPage((p) => Math.max(1, p - 1))}
                      className={cn(currentPage === 1 && 'pointer-events-none opacity-50')}
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
                        >
                          {pageNum}
                        </PaginationLink>
                      </PaginationItem>
                    );
                  })}
                  <PaginationItem>
                    <PaginationNext
                      onClick={() => setCurrentPage((p) => Math.min(totalPages, p + 1))}
                      className={cn(currentPage === totalPages && 'pointer-events-none opacity-50')}
                    />
                  </PaginationItem>
                </PaginationContent>
              </Pagination>
              <div className="text-xs text-gray-500 text-center mt-2">
                Showing {(currentPage - 1) * ITEMS_PER_PAGE + 1} to{' '}
                {Math.min(currentPage * ITEMS_PER_PAGE, sortedAndFilteredResults.length)} of{' '}
                {sortedAndFilteredResults.length} results
              </div>
            </div>
          )}
        </div>
      )}

      {/* Empty State */}
      {!isLoading && results.length === 0 && !error && !infoMessage && (
        <div className="flex-1 flex items-center justify-center">
          <div className="text-center">
            <Info className="h-12 w-12 text-gray-400 mx-auto mb-4" />
            <p className="text-sm text-gray-600">
              No results to display. Configure settings and compute to see unpivoted data.
            </p>
          </div>
        </div>
      )}

    </div>
  );
};

export default UnpivotCanvas;

