import React, { useMemo, useState } from 'react';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
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
import Table from '@/templates/tables/table';
import { DataSummaryView } from '@/components/shared/DataSummaryView';

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

  const handleViewDataClick = () => {
    if (data.datasetPath && atomId) {
      window.open(`/dataframe?name=${encodeURIComponent(data.datasetPath)}`, '_blank');
    }
  };

  return (
    <div className="w-full h-full flex flex-col">
      {/* Data Summary - Unified component with metadata support */}
      {data.datasetPath && data.showDataSummary && (
        <div className="border-b border-slate-200 px-5 py-4">
          <DataSummaryView
            objectName={data.datasetPath}
            atomId={atomId || ''}
            title="Data Summary"
            subtitle="Data in detail"
            subtitleClickable={!!data.datasetPath && !!atomId}
            onSubtitleClick={handleViewDataClick}
          />
        </div>
      )}

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

      {/* Summary Card - Unpivoted data summary (always shown when available) */}
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
        <div className="mt-0">
          <Table
            headers={columns.map((col) => renderHeaderWithSortFilter(col))}
            colClasses={columns.map(() => "w-auto")}
            bodyClassName="max-h-[300px] overflow-y-auto"
            borderColor="border-green-500"
            customHeader={{
              title: "Results",
              controls: (
                <div className="flex items-center gap-2">
                  <span className="inline-block bg-green-50 border border-green-200 text-green-700 text-xs font-semibold px-2 py-0.5 rounded">
                    {sortedAndFilteredResults.length.toLocaleString()} rows • {columns.length} columns
                  </span>
                  <Button
                    onClick={onSaveAs}
                    disabled={isSaving}
                    className="bg-blue-600 hover:bg-blue-700 text-white text-xs h-7 px-3"
                  >
                    {isSaving ? 'Saving...' : 'Save As'}
                  </Button>
                  {saveError && <span className="text-red-600 text-xs">{saveError}</span>}
                  {saveMessage && <span className="text-green-600 text-xs">{saveMessage}</span>}
                </div>
              )
            }}
          >
            {paginatedResults.map((row: any, rowIndex: number) => (
              <tr key={rowIndex} className="table-row">
                {columns.map((header, colIndex) => (
                  <td key={colIndex} className="table-cell font-medium text-gray-700">
                    {row[header] !== null && row[header] !== undefined && row[header] !== '' ? (
                      typeof row[header] === 'number' ? row[header] : String(row[header])
                    ) : (
                      <span className="italic text-gray-500">null</span>
                    )}
                  </td>
                ))}
              </tr>
            ))}
          </Table>
          
          {/* Pagination */}
          {totalPages > 1 && (
            <Card className="mt-2">
              <CardContent className="p-2">
                <div className="flex items-center justify-between">
                  <div className="text-xs text-gray-600">
                    Page {currentPage} of {totalPages}
                  </div>
                  <Pagination>
                    <PaginationContent>
                      <PaginationItem>
                        <PaginationPrevious
                          onClick={() => setCurrentPage((p) => Math.max(1, p - 1))}
                          className={`cursor-pointer text-xs h-7 ${currentPage === 1 ? 'pointer-events-none opacity-50' : ''}`}
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
                              className="cursor-pointer text-xs h-7 w-7"
                            >
                              {pageNum}
                            </PaginationLink>
                          </PaginationItem>
                        );
                      })}
                      <PaginationItem>
                        <PaginationNext
                          onClick={() => setCurrentPage((p) => Math.min(totalPages, p + 1))}
                          className={`cursor-pointer text-xs h-7 ${currentPage === totalPages ? 'pointer-events-none opacity-50' : ''}`}
                        />
                      </PaginationItem>
                    </PaginationContent>
                  </Pagination>
                </div>
              </CardContent>
            </Card>
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

