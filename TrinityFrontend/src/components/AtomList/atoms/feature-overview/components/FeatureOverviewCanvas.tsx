import React, { useState, useEffect, useRef } from "react";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";
import Table from "@/templates/tables/table";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { FEATURE_OVERVIEW_API } from "@/lib/api";
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
import { useLaboratoryStore } from "@/components/LaboratoryMode/store/laboratoryStore";
import { useToast } from "@/hooks/use-toast";

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
  
  // Sorting and filtering state for Cardinality View
  const [sortColumn, setSortColumn] = useState<string>('unique_count');
  const [sortDirection, setSortDirection] = useState<'asc' | 'desc'>('desc');
  const [columnFilters, setColumnFilters] = useState<Record<string, string[]>>({});

  // Chart type and theme state for chart type changes
  const [chartType, setChartType] = useState<string>('line_chart');
  const [chartTheme, setChartTheme] = useState<string>('default');
  
  // Chart display options state
  const [showDataLabels, setShowDataLabels] = useState<boolean>(false);
  const [showAxisLabels, setShowAxisLabels] = useState<boolean>(true);
  
  // State for managing expanded views
  const [showStatsSummary, setShowStatsSummary] = useState<boolean>(false);
  const [expandedMetrics, setExpandedMetrics] = useState<Set<string>>(new Set());

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
      
      try {
        const { mapping: rawMapping } = await fetchDimensionMapping({
          objectName: settings.dataSource,
        });
        if (!active) return;
        const mapping = filterUnattributed(rawMapping);
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
        onUpdateSettings({ dimensionMap: trimmedMapping });

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
        console.error("Failed to fetch dimension mapping:", error);
        const message =
          "Column Classifier is not configured for the selected dataframe. Configure it to view hierarchical dimensions.";
        setDimensionError(message);
      }
    };
    loadMapping();
    return () => {
      active = false;
    };
  }, [settings.dataSource]);

   useEffect(() => {
     if (!settings.dataSource) {
       lastFetchedSource.current = null;
       return;
     }

     if (hasMappedIdentifiers) {
       if (
         lastFetchedSource.current === settings.dataSource &&
         skuRows.length > 0
       ) {
         return;
       }
       lastFetchedSource.current = settings.dataSource;
       displaySkus();
     }
     // eslint-disable-next-line react-hooks/exhaustive-deps
   }, [settings.dataSource, hasMappedIdentifiers, skuRows.length, dimensionMap]);

  useEffect(() => {
    setSkuRows(Array.isArray(settings.skuTable) ? settings.skuTable : []);
  }, [settings.skuTable]);

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
  };

  // Handle chart theme change
  const handleChartThemeChange = (newTheme: string) => {
    setChartTheme(newTheme);
  };

  // Handle data labels toggle
  const handleDataLabelsToggle = (show: boolean) => {
    setShowDataLabels(show);
  };

  // Handle axis labels toggle
  const handleAxisLabelsToggle = (show: boolean) => {
    setShowAxisLabels(show);
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
  const colSpan = dimensionCols.length + 2; // SR NO. + View Stat

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

  const displaySkus = async () => {
    if (!settings.dataSource || !hasMappedIdentifiers) {
      console.warn("displaySkus called without data source or mapped identifiers");
      return;
    }
    setError(null);
    try {
      console.log("🔎 fetching cached dataframe for", settings.dataSource);
      const res = await fetch(
        `${FEATURE_OVERVIEW_API}/cached_dataframe?object_name=${encodeURIComponent(
          settings.dataSource,
        )}`,
        { credentials: 'include' }
      );
      if (!res.ok) {
        console.warn("⚠️ cached dataframe request failed", res.status);
        throw new Error("Failed to load data");
      }
      const text = await res.text();
      const [headerLine, ...rows] = text.trim().split(/\r?\n/);
      const headers = headerLine.split(",");
      const rowLines = Array.isArray(rows) ? rows : [];
      const data = rowLines.map((r) => {
        const vals = r.split(",");
        const obj: Record<string, string> = {};
        headers.forEach((h, i) => {
          obj[h.toLowerCase()] = vals[i];
        });
        return obj;
      });
      const idCols = Object.values(dimensionMap).flat();
      const combos = new Map<string, any>();
      data.forEach((row) => {
        const key = idCols.map((k) => row[k.toLowerCase()] || "").join("||");
        if (!combos.has(key)) combos.set(key, row);
      });
      const table = Array.from(combos.values()).map((row, i) => ({
        id: i + 1,
        ...row,
      }));
    setSkuRows(table);
    const newSettings: any = { skuTable: table };
       if (!Array.isArray(settings.yAxes) || settings.yAxes.length === 0) {
         const lower = Array.isArray(settings.numericColumns)
           ? settings.numericColumns.map((c) => c.toLowerCase())
           : [];
         const defaults = ["salesvalue", "volume"].filter((d) =>
           lower.includes(d),
         );
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
      console.error("⚠️ failed to display SKUs", e);
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
        result[y] = await res.json();
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
           className="mb-4 p-4 bg-yellow-50 border border-yellow-200 rounded-lg text-sm text-yellow-800 font-medium"
           data-testid="fo-dimension-error"
         >
           <div className="flex items-center gap-2">
             <div className="w-2 h-2 bg-yellow-500 rounded-full"></div>
             <span className="font-semibold">Column Classifier Required:</span>
           </div>
           <div className="mt-1 ml-4">
             {dimensionError}
           </div>
           {/* <div className="mt-2 text-xs text-yellow-700">
             Run Column Classifier on this dataset to enable hierarchical dimension analysis.
           </div> */}
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
            <div className="mt-8 mx-auto max-w-screen-2xl rounded-2xl border border-slate-200 bg-white shadow-sm">
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
                  ...dimensionCols.map(col => (
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
                  )),
                  "View Stat"
                ]}
                bodyClassName="max-h-[600px] overflow-y-auto"
                borderColor="border-green-500"
                customHeader={{
                  title: "SKU Table"
                }}
              >
                {displayedSkuRows.map((row) => (
                  <React.Fragment key={row.id}>
                    <tr className="table-row">
                      <td className="table-cell">{row.id}</td>
                      {dimensionCols.map((d) => (
                        <td key={d} className="table-cell">
                          {row[d.toLowerCase()]}
                        </td>
                      ))}
                      <td className="table-cell">
                        <Button size="sm" onClick={() => viewStats(row)}>
                          View Stat
                        </Button>
                      </td>
                    </tr>
                    {activeRow === row.id && showStatsSummary && (
                      <tr className="table-row">
                        <td className="table-cell" colSpan={colSpan}>
                          <Card className="border border-black shadow-xl bg-white/95 backdrop-blur-sm overflow-hidden transform hover:scale-[1.02] hover:-translate-y-1 transition-all duration-300 relative flex flex-col group hover:shadow-2xl">
                            <div className="bg-white border-b border-black px-4 py-2 flex items-center justify-between relative flex-shrink-0 group-hover:shadow-lg transition-shadow duration-300">
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
                                    {(Array.isArray(settings.yAxes) ? settings.yAxes : []).map((m) => (
                                      <React.Fragment key={m}>
                                        <tr className="border-b last:border-0 hover:bg-gray-50">
                                          <td className="p-3 whitespace-nowrap sticky left-0 bg-white z-10 font-medium">{m}</td>
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
                                        {expandedMetrics.has(m) && (
                                          <tr className="border-b last:border-0">
                                            <td className="p-0" colSpan={5}>
                                              <Card className="border border-gray-200 shadow-lg bg-white/95 backdrop-blur-sm overflow-hidden transform transition-all duration-300 relative flex flex-col group hover:shadow-xl m-4">
                                                <div className="bg-white border-b border-gray-200 p-4 flex items-center justify-between relative flex-shrink-0">
                                                  <h6 className="font-bold text-gray-900 text-md flex items-center">
                                                    <TrendingUp className="w-4 h-4 mr-2 text-gray-900" />
                                                    {m} - Trend Analysis
                                                  </h6>
                                                  <div className="flex items-center gap-2">
                                                    <Dialog>
                                                      <DialogTrigger asChild>
                                                        <button type="button" aria-label="Full screen" className="text-gray-500 hover:text-gray-700 transition-colors">
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
                                                              showAxisLabels={showAxisLabels}
                                                              theme={chartTheme}
                                                              onChartTypeChange={handleChartTypeChange}
                                                              onThemeChange={handleChartThemeChange}
                                                              onDataLabelsToggle={handleDataLabelsToggle}
                                                              onAxisLabelsToggle={handleAxisLabelsToggle}
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
                                                        showAxisLabels={showAxisLabels}
                                                        theme={chartTheme}
                                                        onChartTypeChange={handleChartTypeChange}
                                                        onThemeChange={handleChartThemeChange}
                                                        onDataLabelsToggle={handleDataLabelsToggle}
                                                        onAxisLabelsToggle={handleAxisLabelsToggle}
                                                      />
                                                    </div>
                                                  </div>
                                                </div>
                                              </Card>
                                            </td>
                                          </tr>
                                        )}
                                      </React.Fragment>
                                    ))}
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