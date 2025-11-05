import React, { useState, useEffect, useRef } from "react";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";
import Table from "@/templates/tables/table";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { FEATURE_OVERVIEW_API } from "@/lib/api";
import { resolvePalette } from "@/components/AtomList/atoms/feature-overview/utils/colorPalettes";
import { fetchDimensionMapping } from "@/lib/dimensions";
import { BarChart3, TrendingUp, Maximize2, ArrowUp, ArrowDown, Filter as FilterIcon, Plus, X } from "lucide-react";
import { Dialog, DialogContent, DialogTrigger } from "@/components/ui/dialog";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import {
  ContextMenu,
  ContextMenuContent,
  ContextMenuItem,
  ContextMenuSeparator,
  ContextMenuSub,
  ContextMenuSubContent,
  ContextMenuSubTrigger,
  ContextMenuTrigger,
} from "@/components/ui/context-menu";
import D3LineChart from "./D3LineChart";
import RechartsChartRenderer from "@/templates/charts/RechartsChartRenderer";
import { useAuth } from "@/contexts/AuthContext";
import { logSessionState, addNavigationItem } from "@/lib/session";
import {
  useLaboratoryStore,
  type FeatureOverviewExhibitionSelection,
  type FeatureOverviewExhibitionComponentType,
  type FeatureOverviewExhibitionSelectionChartState,
  type FeatureOverviewExhibitionSelectionContext,
  type FeatureOverviewVisualizationManifest,
} from "@/components/LaboratoryMode/store/laboratoryStore";
import { useToast } from "@/hooks/use-toast";
import { csvParse } from "d3-dsv";
import { tableFromIPC, Type } from "apache-arrow";

interface ColumnInfo {
  column: string;
  data_type: string;
  unique_count: number;
  unique_values: string[];
}

interface FeatureOverviewCanvasProps {
  settings: any;
  onUpdateSettings: (s: any) => void;
  atomId?: string;
}

const filterUnattributed = (mapping: Record<string, string[]>) =>
  Object.fromEntries(
    Object.entries(mapping || {}).filter(
      ([key]) => key.toLowerCase() !== "unattributed",
    ),
  );

const numericTextPattern =
  /^[\s$€£₹¥₩₽+-]*\(?[0-9.,eE%]+\)?[\s$€£₹¥₩₽+-]*$/;

const parseNumericValue = (raw: string): number | null => {
  if (raw == null) return null;
  const trimmed = raw.trim();
  if (!trimmed) return null;

  const hasParens = trimmed.startsWith("(") && trimmed.endsWith(")");
  let normalized = hasParens ? trimmed.slice(1, -1) : trimmed;

  normalized = normalized.replace(/\s+/g, "");
  normalized = normalized.replace(/[^0-9.,eE+-]/g, "");

  const hasComma = normalized.includes(",");
  const hasDot = normalized.includes(".");
  if (hasComma) {
    const commaParts = normalized.split(",");
    if (hasDot) {
      normalized = normalized.replace(/,/g, "");
    } else if (commaParts.length === 2 && commaParts[1].length > 0 && commaParts[1].length !== 3) {
      normalized = `${commaParts[0].replace(/,/g, "")}.${commaParts[1]}`;
    } else {
      normalized = normalized.replace(/,/g, "");
    }
  }

  if (hasParens && normalized && !normalized.startsWith("-")) {
    normalized = `-${normalized}`;
  }

  if (!normalized || normalized === "-" || normalized === "+") {
    return null;
  }

  const value = Number(normalized);
  return Number.isFinite(value) ? value : null;
};

const humanizeAxisLabel = (value?: string | null): string | undefined => {
  if (!value) {
    return undefined;
  }

  const trimmed = value.trim();
  if (!trimmed) {
    return undefined;
  }

  return trimmed
    .replace(/[_-]+/g, " ")
    .replace(/([a-z])([A-Z])/g, "$1 $2")
    .replace(/\s+/g, " ")
    .replace(/^./, char => char.toUpperCase());
};

type LoadedSkuDataset = {
  rows: Record<string, any>[];
  columns: string[];
  numericColumns: string[];
  originalNumericColumns: string[];
};

const arrowNumericTypeIds = new Set<Type>([
  Type.Int,
  Type.Int8,
  Type.Int16,
  Type.Int32,
  Type.Int64,
  Type.Uint8,
  Type.Uint16,
  Type.Uint32,
  Type.Uint64,
  Type.Float,
  Type.Float16,
  Type.Float32,
  Type.Float64,
  Type.Decimal,
]);

type ArrowColumnMeta = {
  original: string;
  lower: string;
  vector: any;
  isNumeric: boolean;
  isDimension: boolean;
};

const convertDimensionValue = (value: any): string => {
  if (value == null) {
    return "";
  }
  if (value instanceof Date) {
    return value.toISOString();
  }
  if (typeof value === "string") {
    return value;
  }
  if (typeof value === "number" || typeof value === "bigint") {
    return String(value);
  }
  if (typeof value === "boolean") {
    return value ? "true" : "false";
  }
  if (typeof value === "object") {
    if (typeof value.toString === "function") {
      const str = value.toString();
      if (str && str !== "[object Object]") {
        return str;
      }
    }
    try {
      return JSON.stringify(value);
    } catch {
      return String(value);
    }
  }
  return String(value);
};

const convertArrowValue = (
  rawValue: any,
  meta: ArrowColumnMeta,
  numericColumns: Set<string>,
): any => {
  if (rawValue == null) {
    return "";
  }

  const markNumeric = () => {
    meta.isNumeric = true;
    numericColumns.add(meta.lower);
  };

  if (rawValue instanceof Date) {
    return rawValue.toISOString();
  }

  if (typeof rawValue === "number") {
    markNumeric();
    return rawValue;
  }

  if (typeof rawValue === "bigint") {
    const numeric = Number(rawValue);
    if (Number.isFinite(numeric)) {
      markNumeric();
      return numeric;
    }
    return rawValue.toString();
  }

  if (typeof rawValue === "string") {
    const trimmed = rawValue.trim();
    if (meta.isNumeric || numericColumns.has(meta.lower) || numericTextPattern.test(trimmed)) {
      const parsed = parseNumericValue(trimmed);
      if (parsed != null) {
        markNumeric();
        return parsed;
      }
    }
    return rawValue;
  }

  if (typeof rawValue === "boolean") {
    return rawValue ? "true" : "false";
  }

  if (typeof rawValue === "object") {
    const toNumber = (rawValue as any).toNumber;
    if (typeof toNumber === "function") {
      const numeric = toNumber.call(rawValue);
      if (typeof numeric === "number" && Number.isFinite(numeric)) {
        markNumeric();
        return numeric;
      }
    }

    const valueOf = (rawValue as any).valueOf?.();
    if (valueOf !== undefined && valueOf !== rawValue) {
      if (typeof valueOf === "number" && Number.isFinite(valueOf)) {
        markNumeric();
        return valueOf;
      }
      if (typeof valueOf === "bigint") {
        const numeric = Number(valueOf);
        if (Number.isFinite(numeric)) {
          markNumeric();
          return numeric;
        }
        return valueOf.toString();
      }
      if (typeof valueOf === "string") {
        const trimmed = valueOf.trim();
        if (meta.isNumeric || numericColumns.has(meta.lower) || numericTextPattern.test(trimmed)) {
          const parsed = parseNumericValue(trimmed);
          if (parsed != null) {
            markNumeric();
            return parsed;
          }
        }
        return trimmed;
      }
    }

    const str = (rawValue as any).toString?.();
    if (typeof str === "string" && str && str !== "[object Object]") {
      const trimmed = str.trim();
      if (meta.isNumeric || numericColumns.has(meta.lower) || numericTextPattern.test(trimmed)) {
        const parsed = parseNumericValue(trimmed);
        if (parsed != null) {
          markNumeric();
          return parsed;
        }
      }
      return trimmed;
    }

    try {
      return JSON.stringify(rawValue);
    } catch {
      return String(rawValue);
    }
  }

  return rawValue;
};

const loadArrowDataset = async (
  source: string,
  numericColumns: Set<string>,
  dimensionSet: Set<string>,
): Promise<LoadedSkuDataset | null> => {
  const response = await fetch(
    `${FEATURE_OVERVIEW_API}/flight_table?object_name=${encodeURIComponent(source)}`,
    {
      cache: "no-store",
      credentials: "include",
    },
  );

  if (!response.ok) {
    throw new Error(`Failed to load Arrow dataset (${response.status})`);
  }

  const buffer = await response.arrayBuffer();
  if (!buffer || buffer.byteLength === 0) {
    return {
      rows: [],
      columns: [],
      numericColumns: Array.from(numericColumns),
      originalNumericColumns: [],
    };
  }

  const table = tableFromIPC(new Uint8Array(buffer));
  if (!table) {
    return null;
  }

  const fields = table.schema?.fields ?? [];
  if (fields.length === 0) {
    return {
      rows: [],
      columns: [],
      numericColumns: Array.from(numericColumns),
      originalNumericColumns: [],
    };
  }

  const columnMetas: ArrowColumnMeta[] = [];
  const originalNumericNames = new Set<string>();

  fields.forEach((field, index) => {
    if (!field) return;
    const originalName = `${field.name ?? ""}`.trim();
    if (!originalName) return;
    const lowerName = originalName.toLowerCase();
    const vector = table.getChildAt(index);
    const isDimension = dimensionSet.has(lowerName);
    const numericByType =
      !isDimension && (arrowNumericTypeIds.has(field.typeId as Type) || numericColumns.has(lowerName));
    if (numericByType) {
      numericColumns.add(lowerName);
      originalNumericNames.add(originalName);
    }
    columnMetas.push({
      original: originalName,
      lower: lowerName,
      vector,
      isNumeric: numericByType,
      isDimension,
    });
  });

  if (columnMetas.length === 0) {
    return {
      rows: [],
      columns: [],
      numericColumns: Array.from(numericColumns),
      originalNumericColumns: Array.from(originalNumericNames),
    };
  }

  const rows: Record<string, any>[] = [];
  const rowCount =
    typeof (table as any).numRows === "number"
      ? (table as any).numRows
      : typeof (table as any).length === "number"
      ? (table as any).length
      : 0;

  for (let rowIndex = 0; rowIndex < rowCount; rowIndex++) {
    const normalized: Record<string, any> = {};
    columnMetas.forEach((meta) => {
      const vector = meta.vector;
      const rawValue = vector ? vector.get(rowIndex) : undefined;
      if (meta.isDimension) {
        normalized[meta.lower] = convertDimensionValue(rawValue);
        return;
      }
      const value = convertArrowValue(rawValue, meta, numericColumns);
      normalized[meta.lower] = value;
      if (meta.isNumeric && value !== "" && value != null) {
        originalNumericNames.add(meta.original);
      }
    });
    rows.push(normalized);
  }

  const numericLower = new Set<string>(numericColumns);
  columnMetas.forEach((meta) => {
    if (meta.isNumeric) {
      numericLower.add(meta.lower);
      originalNumericNames.add(meta.original);
    }
  });

  return {
    rows,
    columns: columnMetas.map((meta) => meta.lower),
    numericColumns: Array.from(numericLower),
    originalNumericColumns: Array.from(originalNumericNames),
  };
};

const loadCsvDataset = async (
  source: string,
  numericColumns: Set<string>,
  dimensionSet: Set<string>,
): Promise<LoadedSkuDataset> => {
  const response = await fetch(
    `${FEATURE_OVERVIEW_API}/cached_dataframe?object_name=${encodeURIComponent(source)}`,
    {
      credentials: "include",
    },
  );
  if (!response.ok) {
    throw new Error("Failed to load data");
  }

  const text = await response.text();
  if (!text || !text.trim()) {
    return {
      rows: [],
      columns: [],
      numericColumns: Array.from(numericColumns),
      originalNumericColumns: [],
    };
  }

  const parsed = csvParse(text);
  const rawColumns = (parsed.columns ?? []).filter(
    (col): col is string => typeof col === "string" && col.trim().length > 0,
  );
  const columnKeys =
    rawColumns.length > 0
      ? rawColumns
      : parsed.length > 0
      ? Object.keys(parsed[0] as Record<string, any>)
      : [];
  const trimmedColumns = columnKeys
    .map((col) => (typeof col === "string" ? col.trim() : col))
    .filter((col): col is string => typeof col === "string" && col.length > 0);

  const originalNameMap = new Map<string, string>();
  const normalizedColumns = trimmedColumns
    .map((col) => {
      const lower = col.toLowerCase();
      if (!originalNameMap.has(lower)) {
        originalNameMap.set(lower, col);
      }
      return lower;
    })
    .filter((col) => col);

  const normalizedRows = parsed.map((row) => {
    const normalized: Record<string, any> = {};
    trimmedColumns.forEach((col) => {
      const lower = col.toLowerCase();
      const rawValue = (row as Record<string, any>)[col];
      if (dimensionSet.has(lower)) {
        normalized[lower] = convertDimensionValue(rawValue);
        return;
      }

      if (rawValue == null || rawValue === "") {
        normalized[lower] = "";
        return;
      }

      const stringValue = String(rawValue);
      const trimmedValue = stringValue.trim();
      const shouldAttemptNumeric =
        numericColumns.has(lower) || numericTextPattern.test(trimmedValue);

      if (shouldAttemptNumeric) {
        const parsedValue = parseNumericValue(trimmedValue);
        if (parsedValue != null) {
          numericColumns.add(lower);
          normalized[lower] = parsedValue;
          return;
        }
      }

      normalized[lower] = stringValue;
    });
    return normalized;
  });

  const numericColumnList = Array.from(numericColumns);
  const originalNumericColumns = Array.from(
    new Set(
      numericColumnList
        .map((lower) => originalNameMap.get(lower) ?? lower)
        .filter((name) => typeof name === "string" && name.length > 0),
    ),
  );

  return {
    rows: normalizedRows,
    columns: normalizedColumns,
    numericColumns: numericColumnList,
    originalNumericColumns,
  };
};

function cloneDeep<T>(value: T): T {
  if (value === undefined) {
    return value;
  }

  try {
    return JSON.parse(JSON.stringify(value)) as T;
  } catch (error) {
    return value;
  }
}

const FeatureOverviewCanvas: React.FC<FeatureOverviewCanvasProps> = ({
  settings,
  onUpdateSettings,
  atomId,
}) => {
  const { user } = useAuth();
  const { toast } = useToast();
  const [dimensionMap, setDimensionMap] = useState<Record<string, string[]>>(
    filterUnattributed(settings.dimensionMap || {}),
  );
  const hasMappedIdentifiers = Object.values(dimensionMap).some(
    (ids) => Array.isArray(ids) && ids.length > 0,
  );
  
  const [skuRows, setSkuRows] = useState<any[]>(
    Array.isArray(settings.skuTable) ? settings.skuTable : [],
  );
  const [activeRow, setActiveRow] = useState<number | null>(
    settings.activeRow ?? null,
  );
  const [statDataMap, setStatDataMap] = useState<
    Record<
      string,
      {
        timeseries: { date: string; value: number }[];
        summary: { avg: number; min: number; max: number };
      }
    >
  >(settings.statDataMap || {});
  const [activeMetric, setActiveMetric] = useState<string>(
    settings.activeMetric || settings.yAxes?.[0] || "",
  );
  const [error, setError] = useState<string | null>(null);
  const [dimensionError, setDimensionError] = useState<string | null>(null);
  
  // Ref to track the last fetched data source
  const lastFetchedSource = useRef<string | null>(null);
  // Ref to track the last dimension mapping string
  const lastDimensionMapString = useRef<string | null>(null);
  
  // Sorting and filtering state for Cardinality View
  const [sortColumn, setSortColumn] = useState<string>('unique_count');
  const [sortDirection, setSortDirection] = useState<'asc' | 'desc'>('desc');
  const [columnFilters, setColumnFilters] = useState<Record<string, string[]>>({});

  // Chart type and theme state for chart type changes
  const [chartType, setChartType] = useState<string>('line_chart');
  const [chartTheme, setChartTheme] = useState<string>('default');
  const [chartSortOrder, setChartSortOrder] = useState<'asc' | 'desc' | null>(null);
  
  // Chart display options state
  const [showDataLabels, setShowDataLabels] = useState<boolean>(false);
  // const [showAxisLabels, setShowAxisLabels] = useState<boolean>(true);
  const [showXAxisLabels, setShowXAxisLabels] = useState<boolean>(true);
  const [showYAxisLabels, setShowYAxisLabels] = useState<boolean>(true);
  const [showGrid, setShowGrid] = useState<boolean>(true);
  const [showLegend, setShowLegend] = useState<boolean>(true);

  // State for managing expanded views
  const [showStatsSummary, setShowStatsSummary] = useState<boolean>(false);
  const [expandedMetrics, setExpandedMetrics] = useState<Set<string>>(new Set());

  const dataSourceName = typeof settings?.dataSource === "string" ? settings.dataSource : "";
  const xAxisField = settings?.xAxis || "date";
  const availableMetrics = React.useMemo(
    () => (Array.isArray(settings?.yAxes) ? [...settings.yAxes] : []),
    [settings?.yAxes],
  );

  const numericColumnSet = React.useMemo(() => {
    const set = new Set<string>();
    if (Array.isArray(settings.numericColumns)) {
      settings.numericColumns.forEach((col) => {
        if (typeof col === "string" && col.trim()) {
          set.add(col.toLowerCase());
        }
      });
    }
    if (Array.isArray(settings.columnSummary)) {
      settings.columnSummary.forEach((info: any) => {
        const columnName = info?.column;
        const dataType = info?.data_type;
        if (
          typeof columnName === "string" &&
          columnName.trim() &&
          typeof dataType === "string" &&
          /int|float|double|decimal|numeric|number|currency|money/i.test(dataType)
        ) {
          set.add(columnName.toLowerCase());
        }
      });
    }
    Object.values(dimensionMap || {})
      .flat()
      .forEach((col) => {
        if (typeof col === "string") {
          set.delete(col.toLowerCase());
        }
      });
    return set;
  }, [settings.numericColumns, settings.columnSummary, dimensionMap]);

  // Get atom settings to access the input file name
  const atom = useLaboratoryStore(state => atomId ? state.getAtom(atomId) : undefined);
  const atomSettings = (atom?.settings as any) || {};
  const inputFileName = atomSettings.dataSource || '';

  // Handle opening the input file in a new tab
  const handleViewDataClick = () => {
    if (inputFileName && atomId) {
      window.open(`/dataframe?name=${encodeURIComponent(inputFileName)}`, '_blank');
    }
  };

  // Sorting and filtering state for SKU Table
  const [skuSortColumn, setSkuSortColumn] = useState<string>('');
  const [skuSortDirection, setSkuSortDirection] = useState<'asc' | 'desc'>('asc');
  const [skuColumnFilters, setSkuColumnFilters] = useState<Record<string, string[]>>({});
  const [hideSingleValueColumns, setHideSingleValueColumns] = useState<boolean>(true);

  useEffect(() => {
    if (Array.isArray(settings.yAxes) && settings.yAxes.length > 0) {
      setActiveMetric((prev) =>
        prev && settings.yAxes.includes(prev) ? prev : settings.yAxes[0],
      );
    } else {
      setActiveMetric("");
    }
  }, [settings.yAxes]);

  useEffect(() => {
    setDimensionMap(filterUnattributed(settings.dimensionMap || {}));
  }, [settings.dimensionMap]);

  useEffect(() => {
    let active = true;
    const loadMapping = async () => {
      if (!settings.dataSource) {
        setDimensionError(null);
        lastFetchedSource.current = null;
        return;
      }
      
      // Wait for column data to be loaded before processing dimension mapping
      const hasColumnData = 
        (Array.isArray(settings.allColumns) && settings.allColumns.length > 0) ||
        (Array.isArray(settings.columnSummary) && settings.columnSummary.length > 0);
      
      if (!hasColumnData) {
        // Column data not loaded yet, skip dimension mapping for now
        return;
      }
      
      try {
        // First check if dimension mapping is already in settings (from manual file selection)
        let mapping = filterUnattributed(settings.dimensionMap || {});
        
        // If no mapping in settings, fetch from backend
        if (!mapping || Object.keys(mapping).length === 0) {
          const { mapping: rawMapping } = await fetchDimensionMapping({
            objectName: settings.dataSource,
          });
          if (!active) return;
          mapping = filterUnattributed(rawMapping);
        }
        
        const summaryColumns = new Set(
          (
            Array.isArray(settings.allColumns) && settings.allColumns.length > 0
              ? settings.allColumns
              : Array.isArray(settings.columnSummary)
              ? settings.columnSummary
              : []
          )
            .map((c: ColumnInfo) => c?.column)
            .filter(Boolean),
        );
        const trimmedMapping = summaryColumns.size
          ? Object.fromEntries(
              Object.entries(mapping)
                .map(([dimension, values]) => {
                  const cols = Array.isArray(values)
                    ? Array.from(
                        new Set(values.filter((val) => summaryColumns.has(val))),
                      )
                    : [];
                  return [dimension, cols];
                })
                .filter(([, cols]) => cols.length > 0),
            )
          : mapping;
        setDimensionMap(trimmedMapping);
        
        // Only update settings if the mapping changed
        const currentMapping = filterUnattributed(settings.dimensionMap || {});
        if (JSON.stringify(currentMapping) !== JSON.stringify(trimmedMapping)) {
          onUpdateSettings({ dimensionMap: trimmedMapping });
        }

        // Check if mapping has any valid entries
        const hasValidMapping = Object.values(trimmedMapping).some(
          (ids) => Array.isArray(ids) && ids.length > 0,
        );

        if (hasValidMapping) {
          setDimensionError(null);
        } else {
          const message =
            "Column Classifier is not configured for the selected dataframe. Configure it to view hierarchical dimensions.";
          setDimensionError(message);
        }
      } catch (error) {
        if (!active) return;
        const message =
          "Column Classifier is not configured for the selected dataframe. Configure it to view hierarchical dimensions.";
        setDimensionError(message);
      }
    };
    loadMapping();
    return () => {
      active = false;
    };
  }, [settings.dataSource, settings.allColumns, settings.columnSummary, settings.dimensionMap]);

   useEffect(() => {
     if (!settings.dataSource) {
       lastFetchedSource.current = null;
       lastDimensionMapString.current = null;
       return;
     }

     if (hasMappedIdentifiers) {
       // Check if we need to regenerate SKU analysis
       const dimensionMapString = JSON.stringify(dimensionMap);
       
       if (
         lastFetchedSource.current === settings.dataSource &&
         skuRows.length > 0 &&
         dimensionMapString === lastDimensionMapString.current
       ) {
         return;
       }
       lastFetchedSource.current = settings.dataSource;
       lastDimensionMapString.current = dimensionMapString;
       displaySkus();
     }
     // eslint-disable-next-line react-hooks/exhaustive-deps
   }, [settings.dataSource, hasMappedIdentifiers, skuRows.length, dimensionMap]);

  useEffect(() => {
    if (!Array.isArray(settings.skuTable)) {
      setSkuRows([]);
      return;
    }

    if (settings.skuTable.length === 0 || numericColumnSet.size === 0) {
      setSkuRows(settings.skuTable);
      return;
    }

    let changed = false;
    const normalized = settings.skuTable.map((row: any) => {
      if (!row || typeof row !== "object") {
        return row;
      }

      let updated: Record<string, any> | null = null;
      numericColumnSet.forEach((col) => {
        const rawValue = row[col];
        if (typeof rawValue === "string") {
          const parsedValue = parseNumericValue(rawValue);
          if (parsedValue != null) {
            if (!updated) {
              updated = { ...row };
            }
            updated[col] = parsedValue;
          }
        }
      });

      if (updated) {
        changed = true;
        return updated;
      }

      return row;
    });

    if (changed) {
      setSkuRows(normalized);
      onUpdateSettings({ skuTable: normalized });
    } else {
      setSkuRows(settings.skuTable);
    }
  }, [settings.skuTable, numericColumnSet, onUpdateSettings]);

  useEffect(() => {
    setStatDataMap(settings.statDataMap || {});
  }, [settings.statDataMap]);

  useEffect(() => {
    setActiveRow(settings.activeRow ?? null);
  }, [settings.activeRow]);

  useEffect(() => {
    if (settings.activeMetric) {
      setActiveMetric(settings.activeMetric);
    }
  }, [settings.activeMetric]);

  useEffect(() => {
    if (settings.activeRow && settings.skuTable) {
      const row = settings.skuTable.find((r) => r.id === settings.activeRow);
      if (row) {
        viewStats(row);
      }
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [settings.yAxes, settings.xAxis]);

  const summaryList: ColumnInfo[] = Array.isArray(settings.columnSummary)
    ? settings.columnSummary.filter(Boolean)
    : [];

  const filterUnique = settings.filterUnique ?? false;
  
  const displayedSummary = React.useMemo(() => {
    let filtered = filterUnique
      ? summaryList.filter((c) => c.unique_count > 0)
      : summaryList;

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
  }, [summaryList, filterUnique, columnFilters, sortColumn, sortDirection]);

  const getUniqueColumnValues = (column: string): string[] => {
    if (!summaryList.length) return [];
    
    // Get the currently filtered data (before applying the current column's filter)
    let filteredData = filterUnique
      ? summaryList.filter((c) => c.unique_count > 0)
      : summaryList;

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

  const handleSort = (column: string, direction: 'asc' | 'desc') => {
    setSortColumn(column);
    setSortDirection(direction);
  };

  // Handle chart type change
  const handleChartTypeChange = (newType: 'bar_chart' | 'line_chart' | 'pie_chart' | 'area_chart' | 'scatter_chart') => {
    setChartType(newType);
    // Save to global settings to persist configuration
    onUpdateSettings({ chartType: newType });
  };

  // Handle chart theme change
  const handleChartThemeChange = (newTheme: string) => {
    setChartTheme(newTheme);
    // Save to global settings to persist configuration
    onUpdateSettings({ chartTheme: newTheme });
  };

  // Handle chart sort order change
  const handleChartSortOrderChange = (order: 'asc' | 'desc' | null) => {
    setChartSortOrder(order);
    // Save to global settings to persist configuration
    onUpdateSettings({ chartSortOrder: order });
  };

  // Handle data labels toggle
  const handleDataLabelsToggle = (show: boolean) => {
    setShowDataLabels(show);
    // Save to global settings to persist configuration
    onUpdateSettings({ showDataLabels: show });
  };

  // Handle axis labels toggle
  // const handleAxisLabelsToggle = (show: boolean) => {
  //   setShowAxisLabels(show);
  //   // Save to global settings to persist configuration
  //   onUpdateSettings({ showAxisLabels: show });
  // };

  const handleXAxisLabelsToggle = (show: boolean) => {
    setShowXAxisLabels(show);
    // Save to global settings to persist configuration
    onUpdateSettings({ showXAxisLabels: show });
  };

  const handleYAxisLabelsToggle = (show: boolean) => {
    setShowYAxisLabels(show);
    // Save to global settings to persist configuration
    onUpdateSettings({ showYAxisLabels: show });
  };

  const handleGridToggle = (show: boolean) => {
    setShowGrid(show);
    // Save to global settings to persist configuration
    onUpdateSettings({ showGrid: show });
  };

  const handleLegendToggle = (show: boolean) => {
    setShowLegend(show);
    // Save to global settings to persist configuration
    onUpdateSettings({ showLegend: show });
  };

  // Handle metric graph expansion
  const handleMetricView = (metric: string) => {
    setActiveMetric(metric);
    onUpdateSettings({ activeMetric: metric });
    setExpandedMetrics(prev => new Set(prev).add(metric));
  };

  // Handle closing metric graph
  const handleCloseMetric = (metric: string) => {
    setExpandedMetrics(prev => {
      const newSet = new Set(prev);
      newSet.delete(metric);
      return newSet;
    });
  };

  // Handle closing stats summary
  const handleCloseStatsSummary = () => {
    setShowStatsSummary(false);
    setExpandedMetrics(new Set());
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

  const handleFilterToggle = (val: boolean) => {
    onUpdateSettings({ filterUnique: val });
  };

  const dimensionCols = Object.values(dimensionMap)
    .filter(Array.isArray)
    .flat();
  
  // Calculate unique counts for each dimension column in SKU table
  const skuColumnUniqueCount = React.useMemo(() => {
    const counts: Record<string, number> = {};
    if (!Array.isArray(skuRows) || skuRows.length === 0) {
      return counts;
    }
    
    dimensionCols.forEach((col) => {
      const uniqueValues = new Set(
        skuRows.map(row => String(row[col.toLowerCase()] || ''))
      );
      counts[col] = uniqueValues.size;
    });
    
    return counts;
  }, [skuRows, dimensionCols]);
  
  // Filter dimension columns based on toggle setting
  const filteredDimensionCols = React.useMemo(() => {
    if (!hideSingleValueColumns) {
      return dimensionCols;
    }
    return dimensionCols.filter(col => (skuColumnUniqueCount[col] || 0) > 1);
  }, [dimensionCols, hideSingleValueColumns, skuColumnUniqueCount]);
  
  const colSpan = filteredDimensionCols.length + 2; // SR NO. + View Stat

  // SKU Table filtering and sorting logic
  const displayedSkuRows = React.useMemo(() => {
    let filtered = Array.isArray(skuRows) ? skuRows : [];

    // Apply column filters
    Object.entries(skuColumnFilters).forEach(([column, filterValues]) => {
      if (filterValues && filterValues.length > 0) {
        filtered = filtered.filter(row => {
          const cellValue = String(row[column.toLowerCase()] || '');
          return filterValues.includes(cellValue);
        });
      }
    });

    // Apply sorting
    if (skuSortColumn) {
      filtered = [...filtered].sort((a, b) => {
        const aVal = a[skuSortColumn.toLowerCase()];
        const bVal = b[skuSortColumn.toLowerCase()];
        if (aVal === bVal) return 0;
        let comparison = 0;
        if (typeof aVal === 'number' && typeof bVal === 'number') {
          comparison = aVal - bVal;
        } else {
          comparison = String(aVal).localeCompare(String(bVal));
        }
        return skuSortDirection === 'desc' ? -comparison : comparison;
      });
    }

    return filtered;
  }, [skuRows, skuColumnFilters, skuSortColumn, skuSortDirection]);

  const exhibitionSelections = React.useMemo<FeatureOverviewExhibitionSelection[]>(() => {
    return Array.isArray(settings.exhibitionSelections)
      ? settings.exhibitionSelections
      : [];
  }, [settings.exhibitionSelections]);

  const createSelectionDescriptor = React.useCallback(
    (row: any, metric: string, componentType: FeatureOverviewExhibitionComponentType) => {
      const dimensionEntries = dimensionCols
        .map((column) => {
          const rawValue = row?.[column.toLowerCase()];
          const value = rawValue == null ? "" : String(rawValue);
          return { name: column, value };
        })
        .filter((entry) => entry.name);

      const combination = dimensionEntries.reduce<Record<string, string>>((acc, entry) => {
        acc[entry.name] = entry.value;
        return acc;
      }, {});

      const keyParts = dimensionEntries
        .map((entry) => `${entry.name.toLowerCase()}=${entry.value}`)
        .sort((a, b) => a.localeCompare(b));
      const key = `${componentType}::${(metric || "").toString().toLowerCase()}::${keyParts.join("|")}`;

      const labelValues = dimensionEntries
        .map((entry) => entry.value)
        .filter((value) => value !== "");
      const label = labelValues.length > 0 ? `${metric} · ${labelValues.join(" / ")}` : metric;

      return {
        key,
        combination,
        dimensions: dimensionEntries,
        label,
        componentType,
      };
    },
    [dimensionCols],
  );

  const buildVisualizationManifest = React.useCallback(
    (
      descriptor: ReturnType<typeof createSelectionDescriptor>,
      options: {
        componentType: FeatureOverviewExhibitionComponentType;
        metric: string;
        chartState?: FeatureOverviewExhibitionSelectionChartState;
        metricSnapshot?: any;
        row?: Record<string, any>;
        featureContext?: FeatureOverviewExhibitionSelectionContext;
        capturedAt: string;
      },
    ): FeatureOverviewVisualizationManifest => {
      const { componentType, metric, chartState, metricSnapshot, row, featureContext, capturedAt } = options;
      const manifestId = `${descriptor.key}::manifest`;

      const summarySnapshot = metricSnapshot?.summary ? cloneDeep(metricSnapshot.summary) : undefined;
      const timeseriesSnapshot = Array.isArray(metricSnapshot?.timeseries)
        ? cloneDeep(metricSnapshot?.timeseries)
        : undefined;
      const fullSnapshot = metricSnapshot ? cloneDeep(metricSnapshot) : undefined;
      const skuSnapshot = row ? cloneDeep(row) : undefined;
      const combinationSnapshot = descriptor?.combination ? { ...descriptor.combination } : {};

      const yFieldCandidates = new Set<string>();
      if (chartState?.yAxisField) {
        yFieldCandidates.add(chartState.yAxisField);
      }
      if (metric) {
        yFieldCandidates.add(metric);
      }

        const chart =
          componentType === "trend_analysis" && chartState
            ? {
                type: chartState.chartType,
                theme: chartState.theme,
                showLegend: chartState.showLegend,
                // showAxisLabels: chartState.showAxisLabels,
                showXAxisLabels: chartState.showXAxisLabels,
                showYAxisLabels: chartState.showYAxisLabels,
                showDataLabels: chartState.showDataLabels,
                showGrid: chartState.showGrid,
                xField: chartState.xAxisField,
                yField: chartState.yAxisField ?? metric,
                yFields: Array.from(yFieldCandidates).filter(Boolean),
                colorPalette: chartState.colorPalette,
                legendField: chartState.legendField,
                xAxisLabel: chartState.xAxisLabel,
                yAxisLabel: chartState.yAxisLabel,
                sortOrder: chartState.sortOrder ?? null,
              }
            : undefined;

      const table =
        componentType === "statistical_summary" && skuSnapshot
          ? {
              columns: Object.keys(skuSnapshot),
              rows: [cloneDeep(skuSnapshot)],
            }
          : undefined;

      return {
        id: manifestId,
        version: "1.0.0",
        componentType,
        metric,
        label: descriptor?.label,
        dimensions: Array.isArray(descriptor?.dimensions)
          ? descriptor.dimensions.map((entry) => ({ name: entry.name, value: entry.value }))
          : [],
        capturedAt,
        data: {
          summary: summarySnapshot,
          timeseries: timeseriesSnapshot,
          skuRow: skuSnapshot,
          combination: combinationSnapshot,
          statisticalFull: fullSnapshot,
        },
        chart,
        table,
        featureContext: featureContext ? cloneDeep(featureContext) : undefined,
      };
    },
    [createSelectionDescriptor],
  );

  const updateExhibitionSelection = React.useCallback(
    (
      row: any,
      metric: string,
      componentType: FeatureOverviewExhibitionComponentType,
      checked: boolean | "indeterminate",
    ) => {
      const descriptor = createSelectionDescriptor(row, metric, componentType);
      const existingIndex = exhibitionSelections.findIndex((entry) => entry.key === descriptor.key);
      const nextChecked = checked === true;

      if (nextChecked) {
        const metricData = statDataMap?.[metric];
        const metricSnapshot = metricData ? cloneDeep(metricData) : undefined;
        const dimensionContext = Object.entries(dimensionMap || {}).reduce<Record<string, string[]>>(
          (acc, [key, values]) => {
            if (Array.isArray(values)) {
              acc[key] = [...values];
            }
            return acc;
          },
          {},
        );

        const capturedAt = new Date().toISOString();
        const resolvedXAxisLabel = humanizeAxisLabel(settings?.xAxis) || humanizeAxisLabel(xAxisField) || xAxisField;
        const resolvedYAxisLabel = humanizeAxisLabel(metric) || metric;
        const chartStateSnapshot:
          | FeatureOverviewExhibitionSelectionChartState
          | undefined =
          componentType === "trend_analysis"
            ? {
                chartType,
                theme: chartTheme,
                showDataLabels,
                // showAxisLabels,
                showXAxisLabels,
                showYAxisLabels,
                showGrid,
                showLegend,
                xAxisField,
                yAxisField: metric,
                xAxisLabel: resolvedXAxisLabel,
                yAxisLabel: resolvedYAxisLabel,
                sortOrder: chartSortOrder ?? null,
                colorPalette: resolvePalette(chartTheme),
              }
            : undefined;

        const selectionSnapshot: FeatureOverviewExhibitionSelection = {
          key: descriptor.key,
          metric,
          componentType,
          combination: descriptor.combination,
          dimensions: descriptor.dimensions,
          rowId: row?.id ?? undefined,
          label: descriptor.label,
          statisticalDetails: metricSnapshot
            ? {
                summary:
                  componentType === "statistical_summary"
                    ? metricSnapshot.summary
                      ? cloneDeep(metricSnapshot.summary)
                      : undefined
                    : undefined,
                timeseries: Array.isArray(metricSnapshot.timeseries)
                  ? cloneDeep(metricSnapshot.timeseries)
                  : undefined,
                full: metricSnapshot,
              }
            : undefined,
          chartState: chartStateSnapshot,
          featureContext: {
            dataSource: dataSourceName,
            availableMetrics: [...availableMetrics],
            xAxis: xAxisField,
            dimensionMap: dimensionContext,
          },
          skuRow: row ? cloneDeep(row) : undefined,
          capturedAt,
        };

        const visualizationManifest = buildVisualizationManifest(descriptor, {
          componentType,
          metric,
          chartState: chartStateSnapshot,
          metricSnapshot,
          row,
          featureContext: selectionSnapshot.featureContext,
          capturedAt,
        });

        selectionSnapshot.manifestId = visualizationManifest.id;
        selectionSnapshot.visualizationManifest = visualizationManifest;

        const nextSelections = [...exhibitionSelections];
        if (existingIndex >= 0) {
          nextSelections[existingIndex] = {
            ...nextSelections[existingIndex],
            ...selectionSnapshot,
          };
        } else {
          nextSelections.push(selectionSnapshot);
        }
        onUpdateSettings({ exhibitionSelections: nextSelections });
      } else if (existingIndex >= 0) {
        const nextSelections = exhibitionSelections.filter((entry) => entry.key !== descriptor.key);
        onUpdateSettings({ exhibitionSelections: nextSelections });
      }
    },
    [
      availableMetrics,
      chartTheme,
      chartType,
      createSelectionDescriptor,
      dataSourceName,
      dimensionMap,
      exhibitionSelections,
      onUpdateSettings,
      showXAxisLabels,
      showYAxisLabels,
      showDataLabels,
      statDataMap,
      xAxisField,
    ],
  );

  const stageSelectionForExhibition = React.useCallback(
    (row: any, metric: string, componentType: FeatureOverviewExhibitionComponentType) => {
      const descriptor = createSelectionDescriptor(row, metric, componentType);
      const alreadySelected = exhibitionSelections.some((entry) => entry.key === descriptor.key);

      updateExhibitionSelection(row, metric, componentType, true);
      toast({
        title: alreadySelected ? "Exhibition staging updated" : "Component staged for exhibition",
        description:
          descriptor.label
            ? `${descriptor.label} is now available in the Exhibition panel.`
            : "This component is now available in the Exhibition panel.",
      });
    },
    [createSelectionDescriptor, exhibitionSelections, toast, updateExhibitionSelection],
  );

  const getSkuUniqueColumnValues = (column: string): string[] => {
    if (!Array.isArray(skuRows) || skuRows.length === 0) return [];
    
    // Get the currently filtered data (before applying the current column's filter)
    let filteredData = Array.isArray(skuRows) ? skuRows : [];

    // Apply all other column filters except the current one
    Object.entries(skuColumnFilters).forEach(([col, filterValues]) => {
      if (col !== column && filterValues && filterValues.length > 0) {
        filteredData = filteredData.filter(row => {
          const cellValue = String(row[col.toLowerCase()] || '');
          return filterValues.includes(cellValue);
        });
      }
    });

    // Get unique values from the filtered data
    const values = filteredData.map(row => String(row[column.toLowerCase()] || '')).filter(Boolean);
    return Array.from(new Set(values)).sort();
  };

  const handleSkuSort = (column: string, direction?: 'asc' | 'desc') => {
    if (skuSortColumn === column) {
      if (skuSortDirection === 'asc') {
        setSkuSortDirection('desc');
      } else if (skuSortDirection === 'desc') {
        setSkuSortColumn('');
        setSkuSortDirection('asc');
      }
    } else {
      setSkuSortColumn(column);
      setSkuSortDirection(direction || 'asc');
    }
  };

  const handleSkuColumnFilter = (column: string, values: string[]) => {
    setSkuColumnFilters(prev => ({
      ...prev,
      [column]: values
    }));
  };

  const clearSkuColumnFilter = (column: string) => {
    setSkuColumnFilters(prev => {
      const cpy = { ...prev };
      delete cpy[column];
      return cpy;
    });
  };

  const SkuFilterMenu = ({ column }: { column: string }) => {
    const uniqueValues = getSkuUniqueColumnValues(column);
    const current = skuColumnFilters[column] || [];
    const [temp, setTemp] = useState<string[]>(current);

    const toggleVal = (val: string) => {
      setTemp(prev => (prev.includes(val) ? prev.filter(v => v !== val) : [...prev, val]));
    };

    const selectAll = () => {
      setTemp(temp.length === uniqueValues.length ? [] : uniqueValues);
    };

    const apply = () => handleSkuColumnFilter(column, temp);

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

  const getDataTypeColor = (type: string) => {
    switch (type.toLowerCase()) {
      case "string":
        return "bg-blue-100 text-blue-800 border-blue-200";
      case "int64":
      case "float64":
      case "numeric":
        return "bg-green-100 text-green-800 border-green-200";
      default:
        return "bg-gray-100 text-gray-800 border-gray-200";
    }
  };

  const loadSkuDataset = async (
    dimensionColumns: string[],
  ): Promise<LoadedSkuDataset> => {
    const dimensionSet = new Set(
      dimensionColumns.map((col) => col.toLowerCase()).filter((col) => col),
    );

    const baseNumericColumns = new Set<string>();
    numericColumnSet.forEach((col) => {
      if (!dimensionSet.has(col)) {
        baseNumericColumns.add(col);
      }
    });

    const source =
      typeof settings.dataSource === "string" ? settings.dataSource.trim() : "";
    if (!source) {
      return {
        rows: [],
        columns: [],
        numericColumns: Array.from(baseNumericColumns),
        originalNumericColumns: [],
      };
    }

    const lowerSource = source.toLowerCase();
    if (lowerSource.endsWith(".arrow")) {
      try {
        const arrowResult = await loadArrowDataset(
          source,
          new Set(baseNumericColumns),
          dimensionSet,
        );
        if (arrowResult) {
          return arrowResult;
        }
      } catch (err) {
      }
    }

    return loadCsvDataset(source, baseNumericColumns, dimensionSet);
  };

  const aggregateSkuData = (
    rows: Record<string, any>[],
    dimensionColumns: string[],
    numericColumns: Set<string>,
    columnOrder: string[],
  ): Record<string, any>[] => {
    if (dimensionColumns.length === 0) {
      return rows.map((row, index) => ({ id: index + 1, ...row }));
    }

    const dimensionSet = new Set(dimensionColumns);
    const aggregates = new Map<string, { base: Record<string, any>; sums: Record<string, number> }>();

    rows.forEach((row) => {
      if (!row || typeof row !== "object") return;
      const keyParts = dimensionColumns.map((col) => {
        const value = row[col];
        return value == null ? "" : value;
      });
      const mapKey = keyParts.join("||");
      let entry = aggregates.get(mapKey);
      if (!entry) {
        const base: Record<string, any> = {};
        dimensionColumns.forEach((col, idx) => {
          base[col] = keyParts[idx];
        });
        entry = { base, sums: {} };
        aggregates.set(mapKey, entry);
      }

      Object.entries(row).forEach(([col, rawValue]) => {
        if (rawValue == null || rawValue === "") return;
        if (typeof col !== "string") return;
        const lowerCol = col.toLowerCase();
        if (numericColumns.has(lowerCol)) {
          let numericValue: number | null = null;
          if (typeof rawValue === "number") {
            numericValue = rawValue;
          } else if (typeof rawValue === "bigint") {
            numericValue = Number(rawValue);
          } else if (typeof rawValue === "string") {
            numericValue = parseNumericValue(rawValue);
          } else {
            const maybeNumber = Number(rawValue);
            if (Number.isFinite(maybeNumber)) {
              numericValue = maybeNumber;
            }
          }

          if (numericValue != null && Number.isFinite(numericValue)) {
            entry!.sums[lowerCol] = (entry!.sums[lowerCol] ?? 0) + numericValue;
          }
        } else if (!dimensionSet.has(lowerCol)) {
          if (!(lowerCol in entry!.base) || entry!.base[lowerCol] == null || entry!.base[lowerCol] === "") {
            entry!.base[lowerCol] = rawValue;
          }
        }
      });
    });

    const order = columnOrder.length > 0 ? columnOrder : Array.from(numericColumns);

    return Array.from(aggregates.values()).map((entry, index) => {
      const result: Record<string, any> = { id: index + 1 };
      order.forEach((col) => {
        if (!col) return;
        const lowerCol = col.toLowerCase();
        if (lowerCol === "id") return;
        if (numericColumns.has(lowerCol)) {
          if (entry.sums[lowerCol] != null) {
            result[lowerCol] = entry.sums[lowerCol];
          } else if (entry.base[lowerCol] != null) {
            result[lowerCol] = entry.base[lowerCol];
          } else {
            result[lowerCol] = 0;
          }
        } else if (entry.base[lowerCol] != null) {
          result[lowerCol] = entry.base[lowerCol];
        }
      });

      dimensionColumns.forEach((col) => {
        if (!(col in result)) {
          result[col] = entry.base[col] ?? "";
        }
      });

      numericColumns.forEach((col) => {
        if (!(col in result) && entry.sums[col] != null) {
          result[col] = entry.sums[col];
        }
      });

      return result;
    });
  };

  const displaySkus = async () => {
    if (!settings.dataSource || !hasMappedIdentifiers) {
      return;
    }
    setError(null);
    try {
      const dimensionColumns = Object.values(dimensionMap)
        .flat()
        .map((col) => (typeof col === "string" ? col.toLowerCase() : ""))
        .filter((col) => col);
      

      const loaded = await loadSkuDataset(dimensionColumns);
      const rows = Array.isArray(loaded.rows) ? loaded.rows : [];
      if (rows.length === 0) {
        setSkuRows([]);
        onUpdateSettings({ skuTable: [] });
        return;
      }

      const numericColumns = new Set(
        loaded.numericColumns.map((col) => col.toLowerCase()).filter((col) => col),
      );
      numericColumnSet.forEach((col) => numericColumns.add(col));

      const additionalOrder = rows.reduce<string[]>((acc, row) => {
        Object.keys(row || {}).forEach((key) => {
          if (!acc.includes(key)) acc.push(key);
        });
        return acc;
      }, []);
      const normalizedOrder = Array.from(
        new Set([
          ...dimensionColumns,
          ...loaded.columns.map((col) => col.toLowerCase()),
          ...additionalOrder,
          ...Array.from(numericColumns),
        ]),
      ).filter((col) => col && col !== "id");

      const table = aggregateSkuData(rows, dimensionColumns, numericColumns, normalizedOrder);

      setSkuRows(table);
      const newSettings: any = { skuTable: table };

      if (Array.isArray(loaded.originalNumericColumns) && loaded.originalNumericColumns.length > 0) {
        const existingNumeric = Array.isArray(settings.numericColumns)
          ? settings.numericColumns.slice()
          : [];
        const existingLower = new Set(existingNumeric.map((col) => col.toLowerCase()));
        let changed = false;
        loaded.originalNumericColumns.forEach((col) => {
          const lowerCol = col.toLowerCase();
          if (!existingLower.has(lowerCol)) {
            existingNumeric.push(col);
            existingLower.add(lowerCol);
            changed = true;
          }
        });
        if (changed) {
          newSettings.numericColumns = existingNumeric;
        }
      }

      if (!Array.isArray(settings.yAxes) || settings.yAxes.length === 0) {
        const candidateSet = new Set(
          Array.isArray(newSettings.numericColumns)
            ? newSettings.numericColumns.map((col: string) => col.toLowerCase())
            : Array.isArray(settings.numericColumns)
            ? settings.numericColumns.map((col) => col.toLowerCase())
            : [],
        );
        numericColumns.forEach((col) => candidateSet.add(col));
        const defaults = ["salesvalue", "volume"].filter((d) => candidateSet.has(d));
        if (defaults.length > 0) {
          newSettings.yAxes = defaults;
        }
      }
      onUpdateSettings(newSettings);
      addNavigationItem(user?.id, {
        atom: 'feature-overview',
        action: 'displaySkus',
        dataSource: settings.dataSource,
        dimensionMap,
      });
      logSessionState(user?.id);
    } catch (e: any) {
      setError(e.message || "Error displaying SKUs");
      logSessionState(user?.id);
    }
  };

  const viewStats = async (row: any) => {
    const combo: Record<string, string> = {};
    Object.values(dimensionMap)
      .flat()
      .forEach((d) => {
        combo[d] = row[d.toLowerCase()];
      });
      
     if (!Array.isArray(settings.yAxes) || settings.yAxes.length === 0) {
       toast({
         title:
           "Can not display trend - configure Dependant Variables in properties section to view stat.",
         variant: "destructive",
       });
       return;
     }
    setError(null);
    try {
      const result: Record<
        string,
        {
          timeseries: { date: string; value: number }[];
          summary: { avg: number; min: number; max: number };
        }
      > = {};
      for (const y of settings.yAxes) {
        const params = new URLSearchParams({
          object_name: settings.dataSource,
          y_column: y,
          combination: JSON.stringify(combo),
          x_column: settings.xAxis || "date",
        });
        
        const res = await fetch(
          `${FEATURE_OVERVIEW_API}/sku_stats?${params.toString()}`,
        );
        
        if (!res.ok) {
          throw new Error("Failed to fetch statistics");
        }
        
        const responseData = await res.json();
        result[y] = responseData;
      }
      setStatDataMap(result);
      setActiveMetric(settings.yAxes[0]);
      setActiveRow(row.id);
      setShowStatsSummary(true);
      setExpandedMetrics(new Set());
      onUpdateSettings({
        statDataMap: result,
        activeMetric: settings.yAxes[0],
        activeRow: row.id,
      });
      addNavigationItem(user?.id, {
        atom: 'feature-overview',
        action: 'viewStats',
        metric: settings.yAxes[0],
        combination: combo,
      });
      logSessionState(user?.id);
    } catch (e: any) {
      setError(e.message || "Error fetching statistics");
      logSessionState(user?.id);
    }
  };

  // Show placeholder or error messaging when data isn't available yet
  if (summaryList.length === 0) {
    if (settings.dataSource && dimensionError) {
      return (
        <div className="w-full h-full flex items-center justify-center text-gray-500">
          <div className="text-center">
            <div className="text-lg font-medium text-yellow-700 mb-2">
              {dimensionError}
            </div>
            <div className="text-sm text-gray-600">
              Please run Column Classifier on this dataset first
            </div>
          </div>
        </div>
      );
    }

    if (!settings.dataSource) {
      return (
        <div className="w-full h-full p-6 bg-gradient-to-br from-slate-50 via-green-50/30 to-green-50/50 overflow-y-auto relative">
          <div className="absolute inset-0 opacity-20">
            <svg width="80" height="80" viewBox="0 0 80 80" className="absolute inset-0 w-full h-full">
              <defs>
                <pattern id="emptyGrid" width="80" height="80" patternUnits="userSpaceOnUse">
                  <path d="M 80 0 L 0 0 0 80" fill="none" stroke="rgb(148 163 184 / 0.15)" strokeWidth="1"/>
                </pattern>
              </defs>
              <rect width="100%" height="100%" fill="url(#emptyGrid)" />
            </svg>
          </div>

          <div className="relative z-10 flex items-center justify-center h-full">
            <div className="text-center max-w-md">
              <div className="w-24 h-24 mx-auto mb-8 rounded-2xl bg-gradient-to-br from-green-500 to-green-600 flex items-center justify-center shadow-2xl transform rotate-3 hover:rotate-0 transition-transform duration-300">
                <BarChart3 className="w-12 h-12 text-white drop-shadow-lg" />
              </div>
              <h3 className="text-3xl font-bold text-gray-900 mb-3 bg-gradient-to-r from-green-500 to-green-600 bg-clip-text text-transparent">
                Feature Overview Operation
              </h3>
              <p className="text-gray-600 mb-6 text-lg font-medium leading-relaxed">
                Select a data source from the properties panel to get started
              </p>
            </div>
          </div>
        </div>
      );
    }

    return (
      <div className="w-full h-full flex items-center justify-center text-gray-500">
        {error || "Loading data..."}
      </div>
    );
  }

  return (
    <div className="w-full h-full p-6 pb-[50px] bg-gradient-to-br from-slate-50 to-blue-50 overflow-y-auto">
       {error && (
         <div
           className="mb-4 text-sm text-red-600 font-medium"
           data-testid="fo-error"
         >
           {error}
         </div>
       )}
      {summaryList.length > 0 && (
        <div className="mb-8">
          <Table
              headers={[
                <ContextMenu key="Columns">
                  <ContextMenuTrigger asChild>
                    <div className="flex items-center gap-1 cursor-pointer">
                      Columns
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
                <ContextMenu key="Data Type">
                  <ContextMenuTrigger asChild>
                    <div className="flex items-center gap-1 cursor-pointer">
                      Data Type
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
                <ContextMenu key="Unique Counts">
                  <ContextMenuTrigger asChild>
                    <div className="flex items-center gap-1 cursor-pointer">
                      Unique Counts
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
                "Unique Values"
              ]}
              colClasses={["w-[30%]", "w-[20%]", "w-[15%]", "w-[35%]"]}
              bodyClassName="max-h-[484px] overflow-y-auto"
              defaultMinimized={true}
              borderColor="border-green-500"
              customHeader={{
                title: "Cardinality View",
                subtitle: "Click Here to View Data",
                subtitleClickable: !!inputFileName && !!atomId,
                onSubtitleClick: handleViewDataClick
              }}
            >
              {Array.isArray(displayedSummary) &&
                displayedSummary.map((c: ColumnInfo) => (
                  <tr key={c.column} className="table-row">
                    <td className="table-cell-primary">{c.column}</td>
                     <td className="table-cell">
                       <Badge
                         variant="outline"
                         className="text-xs font-medium shadow-sm"
                       >
                         {c.data_type}
                       </Badge>
                     </td>
                    <td className="table-cell">{c.unique_count}</td>
                    <td className="table-cell">
                      <div className="flex flex-wrap items-center gap-1">
                        {Array.isArray(c.unique_values) ? (
                          <>
                            {c.unique_values.slice(0, 2).map((v, i) => (
                              <Badge
                                key={i}
                                className="p-0 px-1 text-xs bg-gray-50 text-slate-700 hover:bg-gray-50"
                              >
                                {String(v)}
                              </Badge>
                            ))}
                            {c.unique_values.length > 2 && (
                              <Tooltip>
                                <TooltipTrigger asChild>
                                  <span className="flex items-center gap-0.5 text-xs text-slate-600 font-medium cursor-pointer">
                                    <Plus className="w-3 h-3" />
                                    {c.unique_values.length - 2}
                                  </span>
                                </TooltipTrigger>
                                <TooltipContent className="text-xs max-w-xs whitespace-pre-wrap">
                                  {c.unique_values
                                    .slice(2)
                                    .map(val => String(val))
                                    .join(', ')}
                                </TooltipContent>
                              </Tooltip>
                            )}
                          </>
                        ) : (
                          <span className="text-gray-500 italic">No samples</span>
                        )}
                      </div>
                    </td>
                  </tr>
                 ))}
             </Table>
         </div>
       )}
       
       {dimensionError && (
         <div
           className="mb-4 text-sm text-red-600 font-medium"
           data-testid="fo-dimension-error"
         >
           {dimensionError}
         </div>
       )}

       {settings.selectedColumns?.length > 0 && (
        <div className="space-y-4">
          {/* <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
            {Object.keys(dimensionMap).length > 0 ? (
              Object.entries(dimensionMap).map(([dim, ids]) => (
                <Card
                  key={dim}
                  className="relative overflow-hidden bg-white border-2 border-blue-200 rounded-xl shadow-sm transition-all duration-300 hover:shadow-lg"
                >
                  <div className="relative px-4 py-3 border-b border-blue-200 bg-white">
                    <h4 className="text-sm font-bold text-foreground capitalize flex items-center gap-2">
                      <div className="w-2 h-2 rounded-full bg-blue-500" />
                      {dim}
                    </h4>
                  </div>
                  <div className="p-4">
                    <div className="flex flex-wrap gap-2">
                      {ids.map((id) => (
                        <span
                          key={id}
                          className="px-3 py-1.5 bg-white rounded-full text-sm shadow-sm border border-blue-200"
                        >
                          {id}
                        </span>
                      ))}
                    </div>
                  </div>
                </Card>
              ))
            ) : (
              !dimensionError && (
                <div className="col-span-1 text-sm font-medium text-red-600">
                  Please configure dimensions using Column Classifier
                </div>
              )
            )}
          </div> */}

          {skuRows.length > 0 && (
            <div className="mt-8 rounded-2xl border border-slate-200 bg-white shadow-sm">
              <Table
                headers={[
                  <ContextMenu key="SR NO.">
                    <ContextMenuTrigger asChild>
                      <div className="flex items-center gap-1 cursor-pointer">
                        SR NO.
                        {skuSortColumn === 'id' && (
                          skuSortDirection === 'asc' ? <ArrowUp className="w-3 h-3" /> : <ArrowDown className="w-3 h-3" />
                        )}
                      </div>
                    </ContextMenuTrigger>
                    <ContextMenuContent className="w-48 bg-white border border-gray-200 shadow-lg rounded-md">
                      <ContextMenuSub>
                        <ContextMenuSubTrigger className="flex items-center">
                          <ArrowUp className="w-4 h-4 mr-2" /> Sort
                        </ContextMenuSubTrigger>
                        <ContextMenuSubContent className="bg-white border border-gray-200 shadow-lg rounded-md">
                          <ContextMenuItem onClick={() => handleSkuSort('id', 'asc')}>
                            <ArrowUp className="w-4 h-4 mr-2" /> Ascending
                          </ContextMenuItem>
                          <ContextMenuItem onClick={() => handleSkuSort('id', 'desc')}>
                            <ArrowDown className="w-4 h-4 mr-2" /> Descending
                          </ContextMenuItem>
                        </ContextMenuSubContent>
                      </ContextMenuSub>
                    </ContextMenuContent>
                  </ContextMenu>,
                  "View Stat",
                  ...filteredDimensionCols.map(col => (
                    <ContextMenu key={col}>
                      <ContextMenuTrigger asChild>
                        <div className="flex items-center gap-1 cursor-pointer">
                          {col}
                          {skuSortColumn === col && (
                            skuSortDirection === 'asc' ? <ArrowUp className="w-3 h-3" /> : <ArrowDown className="w-3 h-3" />
                          )}
                        </div>
                      </ContextMenuTrigger>
                      <ContextMenuContent className="w-48 bg-white border border-gray-200 shadow-lg rounded-md">
                        <ContextMenuSub>
                          <ContextMenuSubTrigger className="flex items-center">
                            <ArrowUp className="w-4 h-4 mr-2" /> Sort
                          </ContextMenuSubTrigger>
                          <ContextMenuSubContent className="bg-white border border-gray-200 shadow-lg rounded-md">
                            <ContextMenuItem onClick={() => handleSkuSort(col, 'asc')}>
                              <ArrowUp className="w-4 h-4 mr-2" /> Ascending
                            </ContextMenuItem>
                            <ContextMenuItem onClick={() => handleSkuSort(col, 'desc')}>
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
                            <SkuFilterMenu column={col} />
                          </ContextMenuSubContent>
                        </ContextMenuSub>
                        {skuColumnFilters[col]?.length > 0 && (
                          <>
                            <ContextMenuSeparator />
                            <ContextMenuItem onClick={() => clearSkuColumnFilter(col)}>
                              Clear Filter
                            </ContextMenuItem>
                          </>
                        )}
                      </ContextMenuContent>
                    </ContextMenu>
                  ))
                ]}
                bodyClassName="max-h-[600px] overflow-y-auto"
                borderColor="border-green-500"
                customHeader={{
                  title: "SKU Table",
                  controls: (
                    <div className="flex items-center gap-2">
                      <label className="text-sm font-medium text-gray-700 whitespace-nowrap">
                        Hide Single Value Columns
                      </label>
                      <Switch
                        checked={hideSingleValueColumns}
                        onCheckedChange={setHideSingleValueColumns}
                      />
                    </div>
                  )
                }}
              >
                {displayedSkuRows.map((row) => (
                  <React.Fragment key={row.id}>
                    <tr className="table-row">
                      <td className="table-cell">{row.id}</td>
                      <td className="table-cell">
                        <Button size="sm" onClick={() => viewStats(row)}>
                          View Stat
                        </Button>
                      </td>
                      {filteredDimensionCols.map((d) => (
                        <td key={d} className="table-cell">
                          {row[d.toLowerCase()]}
                        </td>
                      ))}
                    </tr>
                    {activeRow === row.id && showStatsSummary && (
                      <tr className="table-row">
                        <td className="table-cell" colSpan={colSpan}>
                          <Card className="border border-green-300 shadow-xl bg-white/95 backdrop-blur-sm overflow-hidden transform hover:scale-[1.02] hover:-translate-y-1 transition-all duration-300 relative flex flex-col group hover:shadow-2xl">
                            <div className="bg-white border-b border-green-300 px-4 py-2 flex items-center justify-between relative flex-shrink-0 group-hover:shadow-lg transition-shadow duration-300">
                              <h5 className="font-bold text-gray-900 text-sm flex items-center">
                                <BarChart3 className="w-4 h-4 mr-2 text-gray-900" />
                                Statistical Summary
                              </h5>
                              <button
                                onClick={handleCloseStatsSummary}
                                className="text-gray-500 hover:text-gray-700 transition-colors"
                                aria-label="Close statistical summary"
                              >
                                <X className="w-5 h-5" />
                              </button>
                            </div>
                            <div className="p-4 overflow-auto flex-1">
                              <p className="text-xs text-gray-500 mb-3">
                                Right-click a metric row or its trend chart to stage it for exhibition.
                              </p>
                              <div className="overflow-x-auto">
                                <table className="min-w-full text-sm whitespace-nowrap">
                                  <thead>
                                    <tr className="border-b border-gray-200">
                                      <th className="p-3 text-left whitespace-nowrap sticky left-0 bg-white z-10 font-semibold">
                                        Metric
                                      </th>
                                      <th className="p-3 text-right whitespace-nowrap font-semibold">Avg</th>
                                      <th className="p-3 text-right whitespace-nowrap font-semibold">Min</th>
                                      <th className="p-3 text-right whitespace-nowrap font-semibold">Max</th>
                                      <th className="p-3 text-right whitespace-nowrap font-semibold">Action</th>
                                    </tr>
                                  </thead>
                                  <tbody>
                                    {(Array.isArray(settings.yAxes) ? settings.yAxes : []).map((m) => {
                                      const summaryDescriptor = createSelectionDescriptor(
                                        row,
                                        m,
                                        "statistical_summary",
                                      );
                                      const chartDescriptor = createSelectionDescriptor(
                                        row,
                                        m,
                                        "trend_analysis",
                                      );
                                      const isSummarySelected = exhibitionSelections.some(
                                        (entry) => entry.key === summaryDescriptor.key,
                                      );
                                      const isChartSelected = exhibitionSelections.some(
                                        (entry) => entry.key === chartDescriptor.key,
                                      );

                                      return (
                                        <React.Fragment key={m}>
                                          <ContextMenu>
                                            <ContextMenuTrigger asChild>
                                              <tr
                                                className={`border-b last:border-0 hover:bg-gray-50 transition-colors ${
                                                  isSummarySelected ? "bg-amber-50/60" : ""
                                                }`}
                                              >
                                                <td className="p-3 whitespace-nowrap sticky left-0 bg-white z-10 font-medium">
                                                  <div className="flex items-center gap-2">
                                                    <span>{m}</span>
                                                    {isSummarySelected && (
                                                      <Badge
                                                        variant="outline"
                                                        className="text-[10px] uppercase tracking-wide text-amber-700 border-amber-300 bg-amber-50"
                                                      >
                                                        Staged
                                                      </Badge>
                                                    )}
                                                  </div>
                                                </td>
                                                <td className="p-3 text-right whitespace-nowrap">
                                                  {statDataMap[m]?.summary.avg?.toFixed(2) ?? "-"}
                                                </td>
                                                <td className="p-3 text-right whitespace-nowrap">
                                                  {statDataMap[m]?.summary.min?.toFixed(2) ?? "-"}
                                                </td>
                                                <td className="p-3 text-right whitespace-nowrap">
                                                  {statDataMap[m]?.summary.max?.toFixed(2) ?? "-"}
                                                </td>
                                                <td className="p-3 text-right whitespace-nowrap">
                                                  <button
                                                    className="text-blue-600 hover:text-blue-800 font-medium underline transition-colors"
                                                    onClick={() => handleMetricView(m)}
                                                  >
                                                    View
                                                  </button>
                                                </td>
                                              </tr>
                                            </ContextMenuTrigger>
                                            <ContextMenuContent className="w-56 bg-white border border-gray-200 shadow-lg rounded-md p-1">
                                              <ContextMenuItem
                                                onClick={() =>
                                                  stageSelectionForExhibition(
                                                    row,
                                                    m,
                                                    "statistical_summary",
                                                  )
                                                }
                                                className="cursor-pointer"
                                              >
                                                Exhibit this component
                                              </ContextMenuItem>
                                            </ContextMenuContent>
                                          </ContextMenu>
                                          {expandedMetrics.has(m) && (
                                            <tr className="border-b last:border-0">
                                              <td className="p-0" colSpan={5}>
                                                <ContextMenu>
                                                  <ContextMenuTrigger asChild>
                                                    <Card
                                                      className={`border ${
                                                        isChartSelected ? "border-amber-400" : "border-gray-200"
                                                      } shadow-lg bg-white/95 backdrop-blur-sm overflow-hidden transform transition-all duration-300 relative flex flex-col group hover:shadow-xl m-4`}
                                                    >
                                                      <div className="bg-white border-b border-gray-200 p-4 flex items-center justify-between relative flex-shrink-0">
                                                        <h6 className="font-bold text-gray-900 text-md flex items-center">
                                                          <TrendingUp className="w-4 h-4 mr-2 text-gray-900" />
                                                          {m} - Trend Analysis
                                                        </h6>
                                                        <div className="flex items-center gap-2">
                                                          <Dialog>
                                                            <DialogTrigger asChild>
                                                              <button
                                                                type="button"
                                                                aria-label="Full screen"
                                                                className="text-gray-500 hover:text-gray-700 transition-colors"
                                                              >
                                                                <Maximize2 className="w-4 h-4" />
                                                              </button>
                                                            </DialogTrigger>
                                                            <DialogContent className="max-w-7xl w-[95vw] h-[90vh]">
                                                              <div className="w-full h-full flex flex-col">
                                                                <div className="flex-1 min-h-0">
                                                                  <RechartsChartRenderer
                                                                    type={chartType as 'bar_chart' | 'line_chart' | 'pie_chart' | 'area_chart' | 'scatter_chart'}
                                                                    data={statDataMap[m]?.timeseries || []}
                                                                    xField="date"
                                                                    yField="value"
                                                                    width={undefined}
                                                                    height={undefined}
                                                                    title=""
                                                                    xAxisLabel={settings.xAxis || "Date"}
                                                                    yAxisLabel={m || "Value"}
                                                                    showDataLabels={showDataLabels}
                                                                    // showAxisLabels={showAxisLabels}
                                                                    showXAxisLabels={showXAxisLabels}
                                                                    showYAxisLabels={showYAxisLabels}
                                                                    showGrid={showGrid}
                                                                    showLegend={showLegend}
                                                                    theme={chartTheme}
                                                                    onChartTypeChange={handleChartTypeChange}
                                                                    onThemeChange={handleChartThemeChange}
                                                                    onDataLabelsToggle={handleDataLabelsToggle}
                                                                    // onAxisLabelsToggle={handleAxisLabelsToggle}
                                                                    onXAxisLabelsToggle={handleXAxisLabelsToggle}
                                                                    onYAxisLabelsToggle={handleYAxisLabelsToggle}
                                                                    onGridToggle={handleGridToggle}
                                                                    onLegendToggle={handleLegendToggle}
                                                                    sortOrder={chartSortOrder}
                                                                    onSortChange={handleChartSortOrderChange}
                                                                  />
                                                                </div>
                                                              </div>
                                                            </DialogContent>
                                                          </Dialog>
                                                          <button
                                                            onClick={() => handleCloseMetric(m)}
                                                            className="text-gray-500 hover:text-gray-700 transition-colors"
                                                            aria-label="Close graph"
                                                          >
                                                            <X className="w-4 h-4" />
                                                          </button>
                                                        </div>
                                                      </div>
                                                      <div className="p-4 flex-1 flex items-center justify-center min-h-0">
                                                        <div className="w-full h-[400px] flex items-center justify-center">
                                                          <div className="w-full h-full">
                                                            <RechartsChartRenderer
                                                              type={chartType as 'bar_chart' | 'line_chart' | 'pie_chart' | 'area_chart' | 'scatter_chart'}
                                                              data={statDataMap[m]?.timeseries || []}
                                                              xField="date"
                                                              yField="value"
                                                              width={undefined}
                                                              height={undefined}
                                                              title=""
                                                              xAxisLabel={settings.xAxis || "Date"}
                                                              yAxisLabel={m || "Value"}
                                                              showDataLabels={showDataLabels}
                                                              // showAxisLabels={showAxisLabels}
                                                              showXAxisLabels={showXAxisLabels}
                                                              showYAxisLabels={showYAxisLabels}
                                                              showGrid={showGrid}
                                                              showLegend={showLegend}
                                                              theme={chartTheme}
                                                              onChartTypeChange={handleChartTypeChange}
                                                              onThemeChange={handleChartThemeChange}
                                                              onDataLabelsToggle={handleDataLabelsToggle}
                                                              // onAxisLabelsToggle={handleAxisLabelsToggle}
                                                              onXAxisLabelsToggle={handleXAxisLabelsToggle}
                                                              onYAxisLabelsToggle={handleYAxisLabelsToggle}
                                                              onGridToggle={handleGridToggle}
                                                              onLegendToggle={handleLegendToggle}
                                                              sortOrder={chartSortOrder}
                                                              onSortChange={handleChartSortOrderChange}
                                                            />
                                                          </div>
                                                        </div>
                                                      </div>
                                                    </Card>
                                                  </ContextMenuTrigger>
                                                 <ContextMenuContent className="w-56 bg-white border border-gray-200 shadow-lg rounded-md p-1">
                                                   <ContextMenuItem
                                                      onClick={() =>
                                                        stageSelectionForExhibition(
                                                          row,
                                                          m,
                                                          "trend_analysis",
                                                        )
                                                      }
                                                      className="cursor-pointer"
                                                    >
                                                      Exhibit this component
                                                    </ContextMenuItem>
                                                  </ContextMenuContent>
                                                </ContextMenu>
                                              </td>
                                            </tr>
                                          )}
                                        </React.Fragment>
                                      );
                                    })}
                                  </tbody>
                                </table>
                              </div>
                            </div>
                          </Card>
                        </td>
                      </tr>
                    )}
                  </React.Fragment>
                ))}
              </Table>
            </div>
          )}
        </div>
      )}
    </div>
  );
};

export default FeatureOverviewCanvas;