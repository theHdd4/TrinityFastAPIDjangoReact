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
import { GROUPBY_API, CREATECOLUMN_API } from '@/lib/api';
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
import Table from '@/templates/tables/table';
import { StageLayout } from '../components/StageLayout';
import type { ReturnTypeFromUseMetricGuidedFlow } from '../useMetricGuidedFlow';
import { useLaboratoryStore } from '@/components/LaboratoryMode/store/laboratoryStore';

interface M1DatasetProps {
  flow: ReturnTypeFromUseMetricGuidedFlow;
  /** Current metrics context atom, if any (for initial dataset sync) */
  contextAtomId?: string;
  readOnly?: boolean;
}

interface ColumnMetadata {
  column: string;
  data_type: string;
  unique_count: number;
  unique_values: any[];
  classification?: 'measures' | 'identifiers';
}

interface PreviewRow {
  [column: string]: string | number | null;
}

export const M1Dataset: React.FC<M1DatasetProps> = ({ flow, contextAtomId, readOnly = false }) => {
  const { state, setState } = flow;
  const { frames, loading: framesLoading, error: framesError } = useSavedDataframes();
  
  const [cardinalityData, setCardinalityData] = useState<ColumnMetadata[]>([]);
  const [loadingCardinality, setLoadingCardinality] = useState(false);
  const [tempSelectedDataSource, setTempSelectedDataSource] = useState('');
  const [sortColumn, setSortColumn] = useState<string>('unique_count');
  const [sortDirection, setSortDirection] = useState<'asc' | 'desc'>('desc');
  const [columnFilters, setColumnFilters] = useState<Record<string, string[]>>({});
  const [previewColumns, setPreviewColumns] = useState<string[]>([]);
  const [previewRows, setPreviewRows] = useState<PreviewRow[]>([]);
  const [activeDataTab, setActiveDataTab] = useState<'summary' | 'preview'>('summary');
  const [identifiers, setIdentifiers] = useState<string[]>([]);
  const [measures, setMeasures] = useState<string[]>([]);
  const [loadingClassification, setLoadingClassification] = useState(false);

  const cardinalityRequestId = useRef(0);

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

  // One-time initialization: sync initial dataset from metrics context / most recent selection.
  // This should run only when entering M1Dataset for the first time.
  useEffect(() => {
    // If a dataset is already set (e.g. resuming a saved flow), don't override it.
    if (state.dataSource) {
      return;
    }

    try {
      const storeState = useLaboratoryStore.getState();
      const metrics = storeState.metricsInputs;

      // Prefer the explicit contextAtomId prop, then fall back to metricsInputs.contextAtomId
      const effectiveContextAtomId =
        contextAtomId || metrics.contextAtomId || undefined;

      let rawSource: string | undefined;

      // 1) If we have a context atom, prefer its per-atom dataframe mapping
      if (effectiveContextAtomId) {
        const atomDataframes = metrics.atomDataframes || {};
        rawSource = atomDataframes[effectiveContextAtomId];

        // Fallback to atom.settings if mapping is missing
        if (!rawSource) {
          const atom = storeState.getAtom(effectiveContextAtomId);
          const settings: any = (atom as any)?.settings || {};
          rawSource =
            settings.sourceFile ||
            settings.file_key ||
            settings.dataSource ||
            settings.selectedDataSource ||
            '';
        }
      }

      // 2) If still nothing, use the globally selected Metrics data source (most recently used)
      if (!rawSource) {
        rawSource = metrics.dataSource || '';
      }

      // 3) As a final fallback, let existing logic (frames[0]) handle it rather than forcing empty
      if (!rawSource) {
        return;
      }

      // Normalize to .arrow ending for backend APIs
      if (!rawSource.endsWith('.arrow')) {
        rawSource = `${rawSource}.arrow`;
      }

      // Initialize the guided-flow dataset once
      setState(prev => ({
        ...prev,
        dataSource: rawSource as string,
      }));
    } catch {
      // Best-effort sync; never block the guided flow if store access fails.
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Initialize tempSelectedDataSource from state.dataSource or first frame
  useEffect(() => {
    if (state.dataSource && frames.length > 0) {
      // Try to find matching frame
      const matchingFrame = frames.find(f => {
        const resolved = resolveObjectName(f.object_name);
        return resolved === state.dataSource || f.object_name === state.dataSource;
      });
      if (matchingFrame && !tempSelectedDataSource) {
        setTempSelectedDataSource(matchingFrame.object_name);
      }
    } else if (!tempSelectedDataSource && frames.length > 0) {
      setTempSelectedDataSource(frames[0].object_name);
    }
  }, [frames, state.dataSource, tempSelectedDataSource, resolveObjectName]);

  // Fetch identifiers and measures from API (same pattern as group by operation)
  useEffect(() => {
    async function fetchClassificationData() {
      if (!tempSelectedDataSource) {
        setIdentifiers([]);
        setMeasures([]);
        return;
      }

      setLoadingClassification(true);
      const resolvedName = resolveObjectName(tempSelectedDataSource);
      
      // Extract client/app/project and file_name from file path (same pattern as group by operation)
      const pathParts = resolvedName.split('/');
      const clientName = pathParts[0] ?? '';
      const appName = pathParts[1] ?? '';
      const projectName = pathParts[2] ?? '';
      // Extract file_name (everything after project_name, remove .arrow if present)
      let fileName = pathParts.slice(3).join('/') || null;
      if (fileName && fileName.endsWith('.arrow')) {
        fileName = fileName.slice(0, -6); // Remove .arrow extension
      }

      try {
        if (clientName && appName && projectName) {
          // Fetch identifiers (same API as group by operation)
          const urlParams = new URLSearchParams({
            client_name: clientName,
            app_name: appName,
            project_name: projectName,
          });
          if (fileName) {
            urlParams.append('file_name', fileName);
          }
          
          const resp = await fetch(`${CREATECOLUMN_API}/identifier_options?${urlParams.toString()}`);
          if (resp.ok) {
            const data = await resp.json();
            if (Array.isArray(data.identifiers)) {
              setIdentifiers(data.identifiers || []);
            }
            // Measures are also returned from the same endpoint
            if (Array.isArray(data.measures)) {
              setMeasures(data.measures || []);
            }
          }
        }
      } catch (error) {
        console.warn('Failed to fetch classification data from API', error);
        setIdentifiers([]);
        setMeasures([]);
      } finally {
        setLoadingClassification(false);
      }
    }
    
    fetchClassificationData();
  }, [tempSelectedDataSource, resolveObjectName]);

  // Auto-fetch cardinality data when tempSelectedDataSource changes
  useEffect(() => {
    if (!tempSelectedDataSource) {
      return;
    }

    const resolvedName = resolveObjectName(tempSelectedDataSource);
    fetchCardinalityData(tempSelectedDataSource);
    
    // Update flow state with selected data source
    setState(prev => ({ ...prev, dataSource: resolvedName }));

    return () => {
      cardinalityRequestId.current += 1;
    };
  }, [tempSelectedDataSource, fetchCardinalityData, resolveObjectName, setState]);

  // Classification logic - use API-fetched identifiers and measures
  const getColumnClassification = useCallback((columnName: string): 'measures' | 'identifiers' => {
    const colLower = columnName.toLowerCase();
    // Check if column is in the identifiers list from API
    if (identifiers.some(id => id.toLowerCase() === colLower)) {
      return 'identifiers';
    }
    // Everything else is measures (replacing manual numerical classification)
    // The API returns measures, but if not available, we classify non-identifiers as measures
    return 'measures';
  }, [identifiers]);

  // Transform cardinalityData to include classification based on API data
  const cardinalityWithClassification = useMemo(() => {
    return cardinalityData.map(col => ({
      ...col,
      classification: getColumnClassification(col.column)
    }));
  }, [cardinalityData, getColumnClassification]);

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

  const handleViewDataClick = useCallback(() => {
    if (!state.dataSource) return;
    try {
      const url = `/dataframe?name=${encodeURIComponent(state.dataSource)}`;
      window.open(url, '_blank');
    } catch {
      // Best-effort navigation; ignore failures
    }
  }, [state.dataSource]);

  const handleDatasetChange = (newValue: string) => {
    if (readOnly) return;
    setTempSelectedDataSource(newValue);
    setCardinalityData([]);
    // The useEffect will handle fetching new cardinality data
  };

  return (
    <StageLayout
      title=""
      explanation=""
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
            disabled={framesLoading || readOnly}
            className={cn(
              "flex-1 bg-transparent text-sm outline-none",
              readOnly ? "cursor-not-allowed opacity-60" : "cursor-pointer"
            )}
          >
            {frames.map((f) => (
              <option key={f.object_name} value={f.object_name}>
                {f.csv_name.split('/').pop()}
              </option>
            ))}
          </select>
        </div>

        {/* Data Summary & Preview */}
        {tempSelectedDataSource && (
          <div className="space-y-4 w-full min-w-0 overflow-hidden">
            {/* Data Summary tab */}
            {!loadingCardinality &&
              displayedCardinality.length > 0 &&
              activeDataTab === 'summary' && (
                <Table
                  headers={[
                    (
                      <ContextMenu key="Column">
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
                              <FilterMenu
                                column="column"
                                uniqueValues={getUniqueColumnValues('column')}
                                current={columnFilters['column'] || []}
                                onApply={(values) => handleColumnFilter('column', values)}
                              />
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
                      </ContextMenu>
                    ),
                    (
                      <ContextMenu key="Classification">
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
                              <ContextMenuItem onClick={() => handleSort('classification', 'asc')}>
                                <ArrowUp className="w-4 h-4 mr-2" /> Ascending
                              </ContextMenuItem>
                              <ContextMenuItem onClick={() => handleSort('classification', 'desc')}>
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
                                onApply={(values) => handleColumnFilter('classification', values)}
                              />
                            </ContextMenuSubContent>
                          </ContextMenuSub>
                          {columnFilters['classification']?.length > 0 && (
                            <>
                              <ContextMenuSeparator />
                              <ContextMenuItem onClick={() => clearColumnFilter('classification')}>
                                Clear Filter
                              </ContextMenuItem>
                            </>
                          )}
                        </ContextMenuContent>
                      </ContextMenu>
                    ),
                    (
                      <ContextMenu key="Unique count">
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
                              <FilterMenu
                                column="unique_count"
                                uniqueValues={getUniqueColumnValues('unique_count')}
                                current={columnFilters['unique_count'] || []}
                                onApply={(values) => handleColumnFilter('unique_count', values)}
                              />
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
                      </ContextMenu>
                    ),
                    'Sample values',
                  ]}
                  colClasses={['w-[30%]', 'w-[20%]', 'w-[15%]', 'w-[35%]']}
                  bodyClassName="max-h-[350px] overflow-y-auto"
                  defaultMinimized={false}
                  borderColor="border-green-500"
                  customHeader={{
                    title: (
                      <div className="flex items-center gap-3">
                        <div className="flex items-center gap-2">
                          <button
                            type="button"
                            onClick={() => setActiveDataTab('summary')}
                            className={
                              'text-xs font-semibold px-2 py-1 rounded-md ' +
                              (activeDataTab === 'summary'
                                ? 'bg-green-50 text-green-700 border border-green-300'
                                : 'text-slate-500 hover:text-slate-700')
                            }
                          >
                            Data Summary
                          </button>
                          <button
                            type="button"
                            onClick={() => setActiveDataTab('preview')}
                            className={
                              'text-xs font-semibold px-2 py-1 rounded-md ' +
                              (activeDataTab === 'preview'
                                ? 'bg-green-50 text-green-700 border border-green-300'
                                : 'text-slate-500 hover:text-slate-700')
                            }
                          >
                            Data Preview
                          </button>
                        </div>
                        <span className="text-slate-400">|</span>
                        <span
                          className="text-xs text-blue-500 cursor-pointer hover:text-blue-700 hover:underline"
                          onClick={handleViewDataClick}
                        >
                          Data in detail
                        </span>
                      </div>
                    ),
                    subtitle: undefined,
                    subtitleClickable: false,
                    onSubtitleClick: handleViewDataClick,
                    compactHeader: true,
                  }}
                >
                  {displayedCardinality.map(col => (
                    <tr key={col.column} className="table-row">
                      <td className="table-cell-primary">
                        <span>{col.column}</span>
                      </td>
                      <td className="table-cell">
                        {col.classification || 'identifiers'}
                      </td>
                      <td className="table-cell">
                        {col.unique_count.toLocaleString()}
                      </td>
                      <td className="table-cell">
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
                      </td>
                    </tr>
                  ))}
                </Table>
              )}

            {/* Data Preview tab */}
            {activeDataTab === 'preview' && (
              <Table
                headers={previewColumns.length ? previewColumns : ['Preview data']}
                colClasses={previewColumns.length ? previewColumns.map(() => 'w-auto') : ['w-auto']}
                bodyClassName="max-h-[350px] overflow-y-auto"
                defaultMinimized={false}
                borderColor="border-green-500"
                customHeader={{
                  title: (
                    <div className="flex items-center gap-3">
                      <div className="flex items-center gap-2">
                        <button
                          type="button"
                          onClick={() => setActiveDataTab('summary')}
                          className={
                            'text-xs font-semibold px-2 py-1 rounded-md ' +
                            (activeDataTab === 'summary'
                              ? 'bg-green-50 text-green-700 border border-green-300'
                              : 'text-slate-500 hover:text-slate-700')
                          }
                        >
                          Data Summary
                        </button>
                        <button
                          type="button"
                          onClick={() => setActiveDataTab('preview')}
                          className={
                            'text-xs font-semibold px-2 py-1 rounded-md ' +
                            (activeDataTab === 'preview'
                              ? 'bg-green-50 text-green-700 border border-green-300'
                              : 'text-slate-500 hover:text-slate-700')
                          }
                        >
                          Data Preview
                        </button>
                      </div>
                      <span className="text-slate-400">|</span>
                      <span
                        className="text-xs text-blue-500 cursor-pointer hover:text-blue-700 hover:underline"
                        onClick={handleViewDataClick}
                      >
                        Data in detail
                      </span>
                    </div>
                  ),
                  subtitle: undefined,
                  subtitleClickable: false,
                  onSubtitleClick: handleViewDataClick,
                  compactHeader: true,
                }}
              >
                {previewColumns.length > 0 && previewRows.length > 0 ? (
                  previewRows.slice(0, 7).map((row, rowIdx) => (
                    <tr key={rowIdx} className="table-row">
                      {previewColumns.map(col => (
                        <td key={col} className="table-cell">
                          {row[col] !== null && row[col] !== undefined ? (
                            typeof row[col] === 'number' ? row[col] : String(row[col])
                          ) : (
                            <span className="italic text-slate-400">null</span>
                          )}
                        </td>
                      ))}
                    </tr>
                  ))
                ) : (
                  <tr className="table-row">
                    <td className="table-cell">
                      <span className="text-xs text-slate-500">
                        No preview data available
                      </span>
                    </td>
                  </tr>
                )}
              </Table>
            )}
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

// CardinalityTable component (no longer used – Data Summary uses templates Table directly)
