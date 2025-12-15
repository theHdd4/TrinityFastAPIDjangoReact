// File: MetricTabs/DatasetTab.tsx
import React, { useEffect, useState, useCallback, useRef, useMemo } from 'react';
import {
  Database,
  Loader2,
  Check,
  ChevronDown,
  Info,
  Hash,
  Type,
  Table,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { loadTable, TableResponse } from '@/components/AtomList/atoms/table/services/tableApi';
import { GROUPBY_API } from '@/lib/api';
import { resolveTaskResponse } from '@/lib/taskQueue';
import type { SavedFrame } from '../../hooks/useSavedDataframes';
import { cn } from '@/lib/utils';
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from '@/components/ui/tooltip';

interface Props {
  frames: SavedFrame[];
  framesLoading?: boolean;
  framesError?: string | null;
  onDataSourceChange?: (dataSource: string) => void;
  dataSource?: string;
  isActive?: boolean;
}

interface ColumnMetadata {
  column: string;
  data_type: string;
  unique_count: number;
  unique_values: any[];
}

const DatasetTab: React.FC<Props> = ({
  frames,
  framesLoading = false,
  onDataSourceChange,
  dataSource,
  isActive = true,
}) => {
    // collapsed by default
  const [previewOpen, setPreviewOpen] = useState(false);
  const [previewData, setPreviewData] = useState<TableResponse | null>(null);
  const [cardinalityData, setCardinalityData] = useState<ColumnMetadata[]>([]);
  const [loadingPreview, setLoadingPreview] = useState(false);
  const [loadingCardinality, setLoadingCardinality] = useState(false);

  const [isSelectionConfirmed, setIsSelectionConfirmed] = useState(false);
  const [tempSelectedDataSource, setTempSelectedDataSource] = useState('');
  const [confirmedDataSource, setConfirmedDataSource] = useState('');

  // collapsed by default
  const [summaryOpen, setSummaryOpen] = useState(false);

  const previewRequestId = useRef(0);
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

  const fetchPreviewData = useCallback(async (objectName: string) => {
    const id = ++previewRequestId.current;
    setLoadingPreview(true);
    try {
      const data = await loadTable(resolveObjectName(objectName));
      if (id === previewRequestId.current) setPreviewData(data);
    } finally {
      if (id === previewRequestId.current) setLoadingPreview(false);
    }
  }, [resolveObjectName]);

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
    if (dataSource && !isSelectionConfirmed && frames.length > 0) {
      // Find matching frame
      const matchingFrame = frames.find(f => {
        const resolved = resolveObjectName(f.object_name);
        return resolved === dataSource || f.object_name === dataSource;
      });
      if (matchingFrame && matchingFrame.object_name !== confirmedDataSource) {
        setTempSelectedDataSource(matchingFrame.object_name);
        setConfirmedDataSource(matchingFrame.object_name);
        setIsSelectionConfirmed(true);
      }
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [dataSource, frames.length]); // Only depend on dataSource and frames.length to avoid loops

  useEffect(() => {
    // Only fetch data when tab is active and selection is confirmed
    if (!isActive || !isSelectionConfirmed || !confirmedDataSource) {
      return;
    }

    const resolvedName = resolveObjectName(confirmedDataSource);
    fetchPreviewData(confirmedDataSource);
    fetchCardinalityData(confirmedDataSource);
    onDataSourceChange?.(resolvedName);

    // Cleanup: cancel pending requests when tab becomes inactive
    return () => {
      previewRequestId.current += 1;
      cardinalityRequestId.current += 1;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [
    isActive,
    isSelectionConfirmed,
    confirmedDataSource,
    // Excluding callbacks from deps to prevent infinite loops - they're stable via useCallback
  ]);

  const groupedColumns = useMemo(() => {
    const numeric: ColumnMetadata[] = [];
    const categorical: ColumnMetadata[] = [];

    cardinalityData.forEach((col) => {
      const t = col.data_type.toLowerCase();
      if (t.includes('int') || t.includes('float') || t.includes('number')) {
        numeric.push(col);
      } else {
        // All non-numerical columns go into categorical (including date, identifiers, etc.)
        categorical.push(col);
      }
    });

    return { numeric, categorical };
  }, [cardinalityData]);

  const previewRows = previewData?.rows.slice(0, 10) || [];
  const previewColumns = previewData?.columns || [];


  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="text-center">
        <h3 className="text-xl font-semibold">Confirm Input Dataset</h3>
        <p className="text-sm text-muted-foreground">
          Select the dataset you want to work with
        </p>
      </div>

      {/* Dataset Selector */}
      <div className="rounded-xl border p-5 space-y-4">
        <div className="flex items-center gap-3 h-12 border rounded-md">
          <div className="ml-2 h-9 w-9 rounded-lg bg-blue-50 text-blue-600 flex items-center justify-center">
            <Database className="w-4 h-4" />
          </div>
          <select
            value={tempSelectedDataSource}
            onChange={(e) => {
              setTempSelectedDataSource(e.target.value);
              setIsSelectionConfirmed(false);
            }}
            disabled={framesLoading}
            className="flex-1 bg-transparent text-sm outline-none"
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
            <Button onClick={() => {
              setConfirmedDataSource(tempSelectedDataSource);
              setIsSelectionConfirmed(true);
            }}>
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

        {/* Column Summary */}
        {isSelectionConfirmed && (
          <div className="space-y-2">
            <div
              className={cn(
                "flex items-center justify-between cursor-pointer p-3 rounded-lg border transition-all",
                summaryOpen 
                  ? "bg-slate-50 border-slate-300 shadow-sm" 
                  : "bg-white border-slate-200 hover:border-slate-300 hover:shadow-sm"
              )}
              onClick={() => setSummaryOpen((v) => !v)}
            >
              <div className="flex items-center gap-3">
                <div className="h-8 w-8 rounded-md bg-blue-50 text-blue-600 flex items-center justify-center flex-shrink-0">
                  <Hash className="w-4 h-4" />
                </div>
                <span className="text-sm font-semibold">Column Summary</span>
              </div>
              <ChevronDown
                className={cn(
                  'w-4 h-4 transition-transform text-slate-500',
                  summaryOpen && 'rotate-180'
                )}
              />
            </div>

            {summaryOpen && (
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <SummaryCard
                  title="Numeric Columns"
                  icon={<Hash className="w-4 h-4" />}
                  columns={groupedColumns.numeric}
                />
                <SummaryCard
                  title="Categorical Columns"
                  icon={<Type className="w-4 h-4" />}
                  columns={groupedColumns.categorical}
                  showTooltip
                />
              </div>
            )}
          </div>
        )}

        {/* Data Preview */}
        {isSelectionConfirmed && (
          <div className="space-y-2">
            <div
              className={cn(
                "flex items-center justify-between cursor-pointer p-3 rounded-lg border transition-all",
                previewOpen 
                  ? "bg-slate-50 border-slate-300 shadow-sm" 
                  : "bg-white border-slate-200 hover:border-slate-300 hover:shadow-sm"
              )}
              onClick={() => setPreviewOpen((v) => !v)}
            >
              <div className="flex items-center gap-3">
                <div className="h-8 w-8 rounded-md bg-green-50 text-green-600 flex items-center justify-center flex-shrink-0">
                  <Table className="w-4 h-4" />
                </div>
                <span className="text-sm font-semibold text-slate-900">
                  Data Preview (10 rows)
                </span>
              </div>
              <ChevronDown
                className={cn(
                  'w-4 h-4 transition-transform text-slate-500',
                  previewOpen && 'rotate-180'
                )}
              />
            </div>

    {previewOpen && (
      <div className="rounded-lg border border-slate-200 overflow-x-auto">
        <table className="min-w-full divide-y divide-slate-200 text-sm">
          <thead className="bg-slate-50">
            <tr>
              {previewColumns.map((c) => (
                <th
                  key={c}
                  className="px-4 py-2 text-left text-xs uppercase text-slate-600"
                >
                  {c}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {previewRows.map((row, i) => (
              <tr key={i} className="hover:bg-slate-50">
                {previewColumns.map((c) => (
                  <td key={c} className="px-4 py-2">
                    {String(row[c] ?? '')}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    )}
  </div>
)}

      </div>
    </div>
  );
};

/* ----------------------------- */
/* Summary Card Component */
/* ----------------------------- */

const SummaryCard = ({
  title,
  icon,
  columns,
  showTooltip = false,
}: {
  title: string;
  icon: React.ReactNode;
  columns: ColumnMetadata[];
  showTooltip?: boolean;
}) => (
  <div className="rounded-xl border p-4 space-y-3">
    <div className="flex items-center gap-2 font-medium text-sm">
      <div className="h-7 w-7 rounded-md bg-slate-100 flex items-center justify-center">
        {icon}
      </div>
      {title}
    </div>

    <div className="flex flex-wrap gap-2">
      {columns.length === 0 && (
        <span className="text-xs text-muted-foreground">None</span>
      )}

      {columns.map((col) => (
        <div
          key={col.column}
          className="flex items-center gap-1 px-2 py-1 bg-slate-100 rounded text-xs"
        >
          {col.column}
          {showTooltip && col.unique_values?.length > 0 && (
            <TooltipProvider>
              <Tooltip>
                <TooltipTrigger asChild>
                  <Info className="w-3 h-3 text-slate-400 cursor-help" />
                </TooltipTrigger>
                <TooltipContent className="max-h-40 overflow-y-auto">
                  <div className="text-xs space-y-1">
                    {col.unique_values.map((v, i) => (
                      <div key={i}>{String(v)}</div>
                    ))}
                  </div>
                </TooltipContent>
              </Tooltip>
            </TooltipProvider>
          )}
        </div>
      ))}
    </div>
  </div>
);

export default DatasetTab;
