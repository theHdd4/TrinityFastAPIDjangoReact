import React, { useEffect, useState, useCallback, useRef, useMemo } from 'react';
import {
  Database,
  Loader2,
  Check,
  ChevronDown,
  ChevronUp,
  Plus,
  ArrowUp,
  ArrowDown,
  Filter as FilterIcon,
  Hash,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { GROUPBY_API } from '@/lib/api';
import { resolveTaskResponse } from '@/lib/taskQueue';
import { useSavedDataframes } from '../../hooks/useSavedDataframes';
import type { SavedFrame } from '../../hooks/useSavedDataframes';
import { cn } from '@/lib/utils';
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from '@/components/ui/tooltip';
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
import { Badge } from '@/components/ui/badge';
import {
  Table,
  TableHeader,
  TableBody,
  TableHead,
  TableRow,
  TableCell,
} from '@/components/ui/table';
import { StageLayout } from '../components/StageLayout';
import type { ReturnTypeFromUseMetricGuidedFlow } from '../useMetricGuidedFlow';

interface M1DatasetProps {
  flow: ReturnTypeFromUseMetricGuidedFlow;
}

interface ColumnMetadata {
  column: string;
  data_type: string;
  unique_count: number;
  unique_values: any[];
  classification?: 'numerical' | 'identifiers';
}

interface PreviewRow {
  [column: string]: string | number | null;
}

export const M1Dataset: React.FC<M1DatasetProps> = ({ flow }) => {
  const { state, setState } = flow;
  const { frames, loading: framesLoading, error: framesError } = useSavedDataframes();
  
  const [cardinalityData, setCardinalityData] = useState<ColumnMetadata[]>([]);
  const [loadingCardinality, setLoadingCardinality] = useState(false);
  const [isSelectionConfirmed, setIsSelectionConfirmed] = useState(false);
  const [tempSelectedDataSource, setTempSelectedDataSource] = useState('');
  const [isCardinalityExpanded, setIsCardinalityExpanded] = useState(true);
  const [isPreviewExpanded, setIsPreviewExpanded] = useState(true);
  const [sortColumn, setSortColumn] = useState<string>('unique_count');
  const [sortDirection, setSortDirection] = useState<'asc' | 'desc'>('desc');
  const [columnFilters, setColumnFilters] = useState<Record<string, string[]>>({});
  const [previewColumns, setPreviewColumns] = useState<string[]>([]);
  const [previewRows, setPreviewRows] = useState<PreviewRow[]>([]);

  const cardinalityRequestId = useRef(0);

  const PreviewTable = ({
    columns,
    rows,
  }: {
    columns: string[];
    rows: PreviewRow[];
  }) => {
    if (!columns.length || !rows.length) return null;

    return (
      <Table className="min-w-max" maxHeight="max-h-[260px]">
        <TableHeader>
          <TableRow>
            {columns.map((col) => (
              <TableHead
                key={col}
                className="border-r last:border-r-0 whitespace-nowrap min-w-[120px]"
              >
                {col}
              </TableHead>
            ))}
          </TableRow>
        </TableHeader>

        <TableBody>
          {rows.map((row, idx) => (
            <TableRow key={idx}>
              {columns.map((col) => (
                <TableCell
                  key={col}
                  className="border-r last:border-r-0 whitespace-nowrap min-w-[120px]"
                >
                  {row[col] !== null && row[col] !== undefined ? (
                    String(row[col])
                  ) : (
                    <span className="text-slate-400 italic">null</span>
                  )}
                </TableCell>
              ))}
            </TableRow>
          ))}
        </TableBody>
      </Table>
    );
  };
  
  const resolveObjectName = useCallback((objectName: string) => {
    if (!objectName) return objectName;
    if (objectName.includes('/')) return objectName;
    try {
      const env = JSON.parse(localStorage.getItem('env') || '{}');
      const { CLIENT_NAME, APP_NAME, PROJECT_NAME } = env;
      if (CLIENT_NAME && APP_NAME && PROJECT_NAME) {
        return `${CLIENT_NAME}/${APP_NAME}/${PROJECT_NAME}/${objectName}`;
      }
    } catch {}
    return objectName;
  }, []);

  const fetchCardinalityData = useCallback(async (objectName: string) => {
    const id = ++cardinalityRequestId.current;
    setLoadingCardinality(true);
    try {
      const res = await fetch(
        `${GROUPBY_API}/cardinality?object_name=${encodeURIComponent(
          resolveObjectName(objectName)
        )}`
      );
      const payload = await res.json();
      const data = await resolveTaskResponse(payload);
      if (id === cardinalityRequestId.current) {
        setCardinalityData(data.cardinality || []);
      }
    } finally {
      if (id === cardinalityRequestId.current) setLoadingCardinality(false);
    }
  }, [resolveObjectName]);

  useEffect(() => {
    if (!tempSelectedDataSource && frames.length) {
      setTempSelectedDataSource(frames[0].object_name);
    }
  }, [frames, tempSelectedDataSource]);

  // Initialize confirmation state if dataSource is already set
  useEffect(() => {
    if (state.dataSource && !isSelectionConfirmed && frames.length > 0) {
      const matchingFrame = frames.find(f => {
        const resolved = resolveObjectName(f.object_name);
        return resolved === state.dataSource || f.object_name === state.dataSource;
      });
      if (matchingFrame) {
        setTempSelectedDataSource(matchingFrame.object_name);
        setIsSelectionConfirmed(true);
      }
    }
  }, [state.dataSource, frames.length, isSelectionConfirmed, resolveObjectName]);

  useEffect(() => {
    if (!isSelectionConfirmed || !tempSelectedDataSource) {
      return;
    }

    const resolvedName = resolveObjectName(tempSelectedDataSource);
    fetchCardinalityData(tempSelectedDataSource);
    
    // Update flow state with selected data source
    setState(prev => ({ ...prev, dataSource: resolvedName }));

    return () => {
      cardinalityRequestId.current += 1;
    };
  }, [isSelectionConfirmed, tempSelectedDataSource, fetchCardinalityData, resolveObjectName, setState]);

  // Classification logic
  const classifyColumn = useCallback((dataType: string): 'numerical' | 'identifiers' => {
    const t = dataType.toLowerCase();
    if (t.includes('int') || t.includes('float') || t.includes('number')) {
      return 'numerical';
    }
    return 'identifiers';
  }, []);

  // Transform cardinalityData to include classification
  const cardinalityWithClassification = useMemo(() => {
    return cardinalityData.map(col => ({
      ...col,
      classification: classifyColumn(col.data_type)
    }));
  }, [cardinalityData, classifyColumn]);

  // Build simple preview rows from cardinality API data (unique_values)
  useEffect(() => {
    if (!cardinalityData || cardinalityData.length === 0) {
      setPreviewColumns([]);
      setPreviewRows([]);
      return;
    }

    const columns = cardinalityData.map((col) => col.column);
    setPreviewColumns(columns);

    const maxSamples = Math.max(
      ...cardinalityData.map((col) =>
        Array.isArray(col.unique_values) ? col.unique_values.length : 0
      )
    );

    const rowCount = Math.min(maxSamples || 0, 20);

    if (!rowCount || !Number.isFinite(rowCount)) {
      setPreviewRows([]);
      return;
    }

    const rows: PreviewRow[] = [];

    for (let i = 0; i < rowCount; i++) {
      const row: PreviewRow = {};

      cardinalityData.forEach((col) => {
        const values = Array.isArray(col.unique_values) ? col.unique_values : [];

        if (values.length > 0) {
          const value = values[i % values.length];
          row[col.column] =
            typeof value === 'number' || value === null ? value : String(value);
        } else {
          row[col.column] = null;
        }
      });

      rows.push(row);
    }

    setPreviewRows(rows);
  }, [cardinalityData]);

  // Filter and sort cardinality data
  const displayedCardinality = useMemo(() => {
    let filtered = cardinalityWithClassification;

    // Apply column filters
    Object.entries(columnFilters).forEach(([column, filterValues]) => {
      if (filterValues && Array.isArray(filterValues) && filterValues.length > 0) {
        filtered = filtered.filter(row => {
          const cellValue = String(row[column as keyof ColumnMetadata] || '');
          return filterValues.includes(cellValue);
        });
      }
    });

    // Apply sorting
    if (sortColumn) {
      filtered = [...filtered].sort((a, b) => {
        const aVal = a[sortColumn as keyof ColumnMetadata];
        const bVal = b[sortColumn as keyof ColumnMetadata];
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
  }, [cardinalityWithClassification, columnFilters, sortColumn, sortDirection]);

  const getUniqueColumnValues = useCallback((column: string): string[] => {
    if (!cardinalityWithClassification.length) return [];
    
    let filteredData = cardinalityWithClassification;

    // Apply all other column filters except the current one
    Object.entries(columnFilters).forEach(([col, filterValues]) => {
      if (col !== column && filterValues && Array.isArray(filterValues) && filterValues.length > 0) {
        filteredData = filteredData.filter(row => {
          const cellValue = String(row[col as keyof ColumnMetadata] || '');
          return filterValues.includes(cellValue);
        });
      }
    });

    const values = filteredData.map(row => String(row[column as keyof ColumnMetadata] || '')).filter(Boolean);
    return Array.from(new Set(values)).sort() as string[];
  }, [cardinalityWithClassification, columnFilters]);

  const handleSort = useCallback((column: string, direction?: 'asc' | 'desc') => {
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
  }, [sortColumn, sortDirection]);

  const handleColumnFilter = useCallback((column: string, values: string[]) => {
    setColumnFilters(prev => ({
      ...prev,
      [column]: values
    }));
  }, []);

  const clearColumnFilter = useCallback((column: string) => {
    setColumnFilters(prev => {
      const cpy = { ...prev };
      delete cpy[column];
      return cpy;
    });
  }, []);

  const handleConfirmSelection = () => {
    setIsSelectionConfirmed(true);
  };

  const handleDatasetChange = (newValue: string) => {
    setTempSelectedDataSource(newValue);
    // If already confirmed, automatically update without requiring confirmation again
    if (isSelectionConfirmed) {
      setCardinalityData([]);
      // Keep confirmed state but update the data source
      // The useEffect will handle fetching new cardinality data
    } else {
      // If not confirmed yet, just update the temp selection
      setCardinalityData([]);
    }
  };

  return (
    <StageLayout
      title=""
      explanation="Select the dataset you want to work with"
    >
      <div className="space-y-4 w-full min-w-0 overflow-hidden">
        {/* Dataset Selector */}
        <div className="flex items-center gap-3 h-12 border rounded-md">
          <div className="ml-2 h-9 w-9 rounded-lg bg-blue-50 text-blue-600 flex items-center justify-center">
            <Database className="w-4 h-4" />
          </div>
          <select
            value={tempSelectedDataSource}
            onChange={(e) => handleDatasetChange(e.target.value)}
            disabled={framesLoading}
            className="flex-1 bg-transparent text-sm outline-none cursor-pointer"
          >
            {frames.map((f) => (
              <option key={f.object_name} value={f.object_name}>
                {f.csv_name.split('/').pop()}
              </option>
            ))}
          </select>
        </div>

        {!isSelectionConfirmed && (
          <div className="flex justify-end">
            <Button onClick={handleConfirmSelection}>
              Confirm Selection
            </Button>
          </div>
        )}

        {isSelectionConfirmed && (
          <div className="flex items-center gap-2 p-3 bg-green-50 border rounded-lg">
            <Check className="w-4 h-4 text-green-600" />
            <span className="text-sm text-green-800">
              Dataset selected and confirmed
            </span>
          </div>
        )}

        {/* Cardinality & Preview (only after dataset is confirmed) */}
        {isSelectionConfirmed && (
          <div className="space-y-4 w-full min-w-0 overflow-hidden">
            {/* Cardinality View Section */}
            <div className="space-y-3">
              <button
                type="button"
                onClick={() => setIsCardinalityExpanded((prev) => !prev)}
                className="flex items-center justify-between w-full p-3 bg-blue-50 border border-blue-200 rounded-lg hover:bg-blue-100 transition-colors"
              >
                <div className="flex items-center gap-2">
                  <div className="h-8 w-8 rounded-md bg-blue-100 text-blue-600 flex items-center justify-center flex-shrink-0">
                    <Hash className="w-4 h-4" />
                  </div>
                  <span className="text-sm font-semibold text-slate-900">
                    Cardinality View
                  </span>
                </div>
                {isCardinalityExpanded ? (
                  <ChevronUp className="w-4 h-4 text-slate-600" />
                ) : (
                  <ChevronDown className="w-4 h-4 text-slate-600" />
                )}
              </button>
              {isCardinalityExpanded && (
                <>
                  {loadingCardinality ? (
                    <div className="flex items-center justify-center p-8">
                      <Loader2 className="w-5 h-5 animate-spin text-blue-600 mr-0.5" />
                      <span className="text-sm text-slate-600">
                        Loading cardinality data...
                      </span>
                    </div>
                  ) : displayedCardinality.length > 0 ? (
                    <CardinalityTable
                      data={displayedCardinality}
                      sortColumn={sortColumn}
                      sortDirection={sortDirection}
                      columnFilters={columnFilters}
                      onSort={handleSort}
                      onColumnFilter={handleColumnFilter}
                      onClearFilter={clearColumnFilter}
                      getUniqueColumnValues={getUniqueColumnValues}
                    />
                  ) : (
                    <div className="p-4 text-center text-sm text-slate-500">
                      No cardinality data available
                    </div>
                  )}
                </>
              )}
            </div>

            {/* Preview Data Section */}
            <div className="space-y-3">
              <button
                type="button"
                onClick={() => setIsPreviewExpanded((prev) => !prev)}
                className="flex items-center justify-between p-3 bg-slate-50 border rounded-lg hover:bg-slate-100 transition-colors"
              >
                <span className="text-sm font-semibold text-slate-900">
                  Preview Data
                </span>
                {isPreviewExpanded ? (
                  <ChevronUp className="w-4 h-4 text-slate-600" />
                ) : (
                  <ChevronDown className="w-4 h-4 text-slate-600" />
                )}
              </button>

              {isPreviewExpanded && (
                <div className="border rounded-lg p-2 bg-white max-w-[1050px] overflow-auto">
                  {previewColumns.length > 0 && previewRows.length > 0 ? (
                    <PreviewTable columns={previewColumns} rows={previewRows} />
                  ) : (
                    <div className="p-4 text-center text-sm text-slate-500">
                      No preview data available
                    </div>
                  )}
                </div>
              )}
            </div>
          </div>
        )}
      </div>
    </StageLayout>
  );
};

// FilterMenu component for cardinality view
const FilterMenu = ({ 
  column, 
  uniqueValues, 
  current, 
  onApply 
}: { 
  column: string; 
  uniqueValues: string[]; 
  current: string[]; 
  onApply: (values: string[]) => void;
}) => {
  const [temp, setTemp] = useState<string[]>(current);

  const toggleVal = (val: string) => {
    setTemp(prev => (prev.includes(val) ? prev.filter(v => v !== val) : [...prev, val]));
  };

  const selectAll = () => {
    setTemp(temp.length === uniqueValues.length ? [] : uniqueValues);
  };

  const apply = () => {
    onApply(temp);
  };

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

// CardinalityTable component
const CardinalityTable = ({
  data,
  sortColumn,
  sortDirection,
  columnFilters,
  onSort,
  onColumnFilter,
  onClearFilter,
  getUniqueColumnValues,
}: {
  data: ColumnMetadata[];
  sortColumn: string;
  sortDirection: 'asc' | 'desc';
  columnFilters: Record<string, string[]>;
  onSort: (column: string, direction?: 'asc' | 'desc') => void;
  onColumnFilter: (column: string, values: string[]) => void;
  onClearFilter: (column: string) => void;
  getUniqueColumnValues: (column: string) => string[];
}) => {
  return (
    <Table maxHeight="max-h-[300px]">
      <TableHeader>
        <TableRow>
          {/* Column header */}
          <TableHead className="w-[30%]">
            <ContextMenu>
              <ContextMenuTrigger asChild>
                <div className="flex items-center gap-1 cursor-pointer">
                  Column
                  {sortColumn === 'column' && (
                    sortDirection === 'asc' ? (
                      <ArrowUp className="w-3 h-3" />
                    ) : (
                      <ArrowDown className="w-3 h-3" />
                    )
                  )}
                </div>
              </ContextMenuTrigger>
              <ContextMenuContent className="w-48 bg-white border border-gray-200 shadow-lg rounded-md">
                <ContextMenuSub>
                  <ContextMenuSubTrigger className="flex items-center">
                    <ArrowUp className="w-4 h-4 mr-2" /> Sort
                  </ContextMenuSubTrigger>
                  <ContextMenuSubContent className="bg-white border border-gray-200 shadow-lg rounded-md">
                    <ContextMenuItem onClick={() => onSort('column', 'asc')}>
                      <ArrowUp className="w-4 h-4 mr-2" /> Ascending
                    </ContextMenuItem>
                    <ContextMenuItem onClick={() => onSort('column', 'desc')}>
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
                    <FilterMenu
                      column="column"
                      uniqueValues={getUniqueColumnValues('column')}
                      current={columnFilters['column'] || []}
                      onApply={(values) => onColumnFilter('column', values)}
                    />
                  </ContextMenuSubContent>
                </ContextMenuSub>
                {columnFilters['column']?.length > 0 && (
                  <>
                    <ContextMenuSeparator />
                    <ContextMenuItem onClick={() => onClearFilter('column')}>
                      Clear Filter
                    </ContextMenuItem>
                  </>
                )}
              </ContextMenuContent>
            </ContextMenu>
          </TableHead>

          {/* Classification header */}
          <TableHead className="w-[20%]">
            <ContextMenu>
              <ContextMenuTrigger asChild>
                <div className="flex items-center gap-1 cursor-pointer">
                  Classification
                  {sortColumn === 'classification' && (
                    sortDirection === 'asc' ? (
                      <ArrowUp className="w-3 h-3" />
                    ) : (
                      <ArrowDown className="w-3 h-3" />
                    )
                  )}
                </div>
              </ContextMenuTrigger>
              <ContextMenuContent className="w-48 bg-white border border-gray-200 shadow-lg rounded-md">
                <ContextMenuSub>
                  <ContextMenuSubTrigger className="flex items-center">
                    <ArrowUp className="w-4 h-4 mr-2" /> Sort
                  </ContextMenuSubTrigger>
                  <ContextMenuSubContent className="bg-white border border-gray-200 shadow-lg rounded-md">
                    <ContextMenuItem onClick={() => onSort('classification', 'asc')}>
                      <ArrowUp className="w-4 h-4 mr-2" /> Ascending
                    </ContextMenuItem>
                    <ContextMenuItem onClick={() => onSort('classification', 'desc')}>
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
                    <FilterMenu
                      column="classification"
                      uniqueValues={getUniqueColumnValues('classification')}
                      current={columnFilters['classification'] || []}
                      onApply={(values) => onColumnFilter('classification', values)}
                    />
                  </ContextMenuSubContent>
                </ContextMenuSub>
                {columnFilters['classification']?.length > 0 && (
                  <>
                    <ContextMenuSeparator />
                    <ContextMenuItem onClick={() => onClearFilter('classification')}>
                      Clear Filter
                    </ContextMenuItem>
                  </>
                )}
              </ContextMenuContent>
            </ContextMenu>
          </TableHead>

          {/* Unique count header */}
          <TableHead className="w-[15%]">
            <ContextMenu>
              <ContextMenuTrigger asChild>
                <div className="flex items-center gap-1 cursor-pointer">
                  Unique count
                  {sortColumn === 'unique_count' && (
                    sortDirection === 'asc' ? (
                      <ArrowUp className="w-3 h-3" />
                    ) : (
                      <ArrowDown className="w-3 h-3" />
                    )
                  )}
                </div>
              </ContextMenuTrigger>
              <ContextMenuContent className="w-48 bg-white border border-gray-200 shadow-lg rounded-md">
                <ContextMenuSub>
                  <ContextMenuSubTrigger className="flex items-center">
                    <ArrowUp className="w-4 h-4 mr-2" /> Sort
                  </ContextMenuSubTrigger>
                  <ContextMenuSubContent className="bg-white border border-gray-200 shadow-lg rounded-md">
                    <ContextMenuItem onClick={() => onSort('unique_count', 'asc')}>
                      <ArrowUp className="w-4 h-4 mr-2" /> Ascending
                    </ContextMenuItem>
                    <ContextMenuItem onClick={() => onSort('unique_count', 'desc')}>
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
                    <FilterMenu
                      column="unique_count"
                      uniqueValues={getUniqueColumnValues('unique_count')}
                      current={columnFilters['unique_count'] || []}
                      onApply={(values) => onColumnFilter('unique_count', values)}
                    />
                  </ContextMenuSubContent>
                </ContextMenuSub>
                {columnFilters['unique_count']?.length > 0 && (
                  <>
                    <ContextMenuSeparator />
                    <ContextMenuItem onClick={() => onClearFilter('unique_count')}>
                      Clear Filter
                    </ContextMenuItem>
                  </>
                )}
              </ContextMenuContent>
            </ContextMenu>
          </TableHead>

        {/* Sample values header */}
        <TableHead className="w-[35%]">Sample values</TableHead>
      </TableRow>
      </TableHeader>

      <TableBody>
        {data.map(col => (
          <TableRow key={col.column} className="table-row">
            <TableCell className="table-cell-primary">
              <span>{col.column}</span>
            </TableCell>
            <TableCell className="table-cell">
              {col.classification || 'identifiers'}
            </TableCell>
            <TableCell className="table-cell">
              {col.unique_count.toLocaleString()}
            </TableCell>
            <TableCell className="table-cell">
              <div className="flex flex-wrap items-center gap-1">
                {col.unique_values?.slice(0, 2).map((val, i) => (
                  <Badge
                    key={i}
                    className="p-0 px-1 text-xs bg-gray-50 text-slate-700 hover:bg-gray-50"
                  >
                    {String(val)}
                  </Badge>
                ))}
                {col.unique_values && col.unique_values.length > 2 && (
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
            </TableCell>
          </TableRow>
        ))}
      </TableBody>
    </Table>
  );
};
