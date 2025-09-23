import React, { useEffect, useRef, useState, useMemo } from "react";
import * as d3 from "d3";
import {
  ChevronDown,
  TrendingUp,
  BarChart3,
  Target,
  Zap,
  X,
  Activity,
  ArrowUp,
  ArrowDown,
  FilterIcon,
  Plus,
} from "lucide-react";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { MultiSelectDropdown } from '@/templates/dropdown';
import {
  ContextMenu,
  ContextMenuContent,
  ContextMenuItem,
  ContextMenuSub,
  ContextMenuSubContent,
  ContextMenuSubTrigger,
  ContextMenuTrigger,
  ContextMenuSeparator,
} from '@/components/ui/context-menu';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';
import { CorrelationSettings } from "@/components/LaboratoryMode/store/laboratoryStore";
import { useLaboratoryStore } from "@/components/LaboratoryMode/store/laboratoryStore";
import { correlationAPI } from "../helpers/correlationAPI";
import type { FilterAndCorrelateRequest } from "../helpers/correlationAPI";
import MatrixSettingsTray, {
  MatrixSettings,
  COLOR_THEMES,
} from "./MatrixSettingsTray";
import RechartsChartRenderer from "@/templates/charts/RechartsChartRenderer";
import Table from "@/templates/tables/table";
import { GROUPBY_API } from '@/lib/api';
import correlation from "../index";

interface CorrelationCanvasProps {
  data: CorrelationSettings;
  onDataChange: (newData: Partial<CorrelationSettings>) => void;
}

// FilterMenu component defined outside to prevent recreation on every render
const FilterMenu = ({ 
  column, 
  uniqueValues, 
  currentFilters, 
  onColumnFilter 
}: { 
  column: string;
  uniqueValues: string[];
  currentFilters: string[];
  onColumnFilter: (column: string, values: string[]) => void;
}) => {
  const [temp, setTemp] = useState<string[]>([]);
  const [selectAll, setSelectAll] = useState(false);

  React.useEffect(() => {
    setTemp(currentFilters);
    setSelectAll(currentFilters.length === uniqueValues.length && uniqueValues.length > 0);
  }, [currentFilters, uniqueValues.length]);

  const handleSelectAll = () => {
    if (selectAll) {
      setTemp([]);
      setSelectAll(false);
    } else {
      setTemp(uniqueValues);
      setSelectAll(true);
    }
  };

  const apply = () => {
    onColumnFilter(column, temp);
  };

  const cancel = () => {
    setTemp(currentFilters);
    setSelectAll(currentFilters.length === uniqueValues.length && uniqueValues.length > 0);
  };

  return (
    <div className="p-3 max-h-64 overflow-y-auto">
      <div className="flex items-center justify-between mb-2">
        <Checkbox
          checked={selectAll}
          onCheckedChange={handleSelectAll}
        />
        <span className="text-sm font-medium">Select All</span>
      </div>
      <div className="space-y-1 mb-3">
        {uniqueValues.map(value => (
          <div key={value} className="flex items-center space-x-2">
            <Checkbox
              checked={temp.includes(value)}
              onCheckedChange={(checked) => {
                if (checked) {
                  setTemp([...temp, value]);
                } else {
                  setTemp(temp.filter(v => v !== value));
                }
              }}
            />
            <span className="text-sm">{value}</span>
          </div>
        ))}
      </div>
      <div className="flex space-x-2">
        <Button size="sm" onClick={apply} className="flex-1">
          Apply
        </Button>
        <Button size="sm" variant="outline" onClick={cancel} className="flex-1">
          Cancel
        </Button>
      </div>
    </div>
  );
};

// Transform dictionary correlation matrix to 2D array, filtering out non-numeric columns
const transformCorrelationMatrix = (
  correlationDict: any,
  variables: string[],
): { matrix: number[][]; filteredVariables: string[] } => {
  if (!correlationDict || typeof correlationDict !== "object") {
    return {
      matrix: variables.map((_, i) =>
        variables.map((_, j) => (i === j ? 1.0 : 0.0)),
      ),
      filteredVariables: variables,
    };
  }

  const validVariables = variables.filter(
    (variable) =>
      correlationDict[variable] &&
      typeof correlationDict[variable] === "object",
  );

  if (validVariables.length === 0) {
    return {
      matrix: [[1.0]],
      filteredVariables: variables.length > 0 ? [variables[0]] : ["Unknown"],
    };
  }

  try {
    const matrix = validVariables.map((rowVar) => {
      const rowData = correlationDict[rowVar];

      return validVariables.map((colVar) => {
        if (rowVar === colVar) return 1.0;
        const value = rowData[colVar];
        return typeof value === "number" && isFinite(value) ? value : 0.0;
      });
    });

    return { matrix, filteredVariables: validVariables };
  } catch (error) {
    return {
      matrix: validVariables.map((_, i) =>
        validVariables.map((_, j) => (i === j ? 1.0 : 0.0)),
      ),
      filteredVariables: validVariables,
    };
  }
};

// MultiSelectValues component for filter value selection
const MultiSelectValues: React.FC<{
  columnName: string;
  selectedValues: string[];
  availableValues: string[];
  onValuesChange: (newValues: string[]) => void;
}> = ({ columnName, selectedValues, availableValues, onValuesChange }) => {
  const handleValueToggle = (value: string, checked: boolean) => {
    let newValues;
    if (checked) {
      newValues = [...selectedValues, value];
    } else {
      newValues = selectedValues.filter((v) => v !== value);
    }
    onValuesChange(newValues);
  };

  const handleSelectAll = () => {
    onValuesChange([...availableValues]);
  };

  const handleClearAll = () => {
    onValuesChange([]);
  };

  return (
    <div className="max-h-60 overflow-y-auto">
      {/* Header with controls */}
      <div className="p-2 border-b flex gap-2">
        <Button
          variant="ghost"
          size="sm"
          className="h-6 text-xs"
          onClick={handleSelectAll}
        >
          All
        </Button>
        <Button
          variant="ghost"
          size="sm"
          className="h-6 text-xs"
          onClick={handleClearAll}
        >
          None
        </Button>
        <span className="text-xs text-muted-foreground ml-auto">
          {selectedValues.length}/{availableValues.length}
        </span>
      </div>

      {/* Value checkboxes */}
      <div className="p-2 space-y-1">
        {availableValues.map((value) => (
          <div key={value} className="flex items-center space-x-2">
            <Checkbox
              id={`${columnName}-${value}`}
              checked={selectedValues.includes(value)}
              onCheckedChange={(checked) => handleValueToggle(value, !!checked)}
            />
            <label
              htmlFor={`${columnName}-${value}`}
              className="text-xs cursor-pointer truncate flex-1"
            >
              {value}
            </label>
          </div>
        ))}
      </div>
    </div>
  );
};

// FilterDimensionButton component for individual filter controls
const FilterDimensionButton: React.FC<{
  columnName: string;
  selectedValues: string[];
  availableValues: string[];
  onValuesChange: (newValues: string[]) => void;
  onRemove: () => void;
}> = ({
  columnName,
  selectedValues,
  availableValues,
  onValuesChange,
  onRemove,
}) => {
  return (
    <div className="flex flex-col gap-1">
      <label className="text-xs font-medium text-muted-foreground truncate">
        {columnName}
      </label>

      <div className="flex items-center gap-2">
        <MultiSelectDropdown
          label=""
          selectedValues={selectedValues}
          onSelectionChange={onValuesChange}
          options={availableValues.map(value => ({ value, label: value }))}
          showSelectAll={true}
          showTrigger={true}
          placeholder="All"
          className="flex-1"
        />
        <Button
          variant="ghost"
          size="sm"
          className="h-8 w-8 p-0 hover:bg-destructive hover:text-destructive-foreground flex-shrink-0"
          onClick={onRemove}
        >
          <X className="h-4 w-4" />
        </Button>
      </div>
    </div>
  );
};

const CorrelationCanvas: React.FC<CorrelationCanvasProps> = ({
  data,
  onDataChange,
}) => {
  const heatmapRef = useRef<SVGSVGElement>(null);
  const prevMatrixRef = useRef<string>("");
  const [canvasWidth, setCanvasWidth] = useState(0);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [matrixSettings, setMatrixSettings] = useState<MatrixSettings>({
    theme: "default",
    showAxisLabels: true,
    showDataLabels: true,
    showLegend: true,
    showGrid: true,
  });
  const [timeSeriesSortOrder, setTimeSeriesSortOrder] = useState<'asc' | 'desc' | null>(null);
  const [settingsPosition, setSettingsPosition] = useState<{
    x: number;
    y: number;
  } | null>(null);
  const auxPanelActive = useLaboratoryStore((state) => state.auxPanelActive);

  // Cardinality View state
  const [cardinalityData, setCardinalityData] = useState<any[]>([]);
  const [cardinalityLoading, setCardinalityLoading] = useState(false);
  const [cardinalityError, setCardinalityError] = useState<string | null>(null);
  
  // Sorting and filtering state for Cardinality View
  const [sortColumn, setSortColumn] = useState<string>('unique_count');
  const [sortDirection, setSortDirection] = useState<'asc' | 'desc'>('desc');
  const [columnFilters, setColumnFilters] = useState<Record<string, string[]>>({});

  // Determine if we're in compact mode (when auxiliary panels are open)
  const isCompactMode = auxPanelActive !== null;

  // Fetch cardinality data
  const fetchCardinalityData = async () => {
    if (!data.selectedFile) return;
    
    setCardinalityLoading(true);
    setCardinalityError(null);
    
    try {
      const formData = new FormData();
      formData.append('validator_atom_id', 'correlation_atom'); // Use a default ID for correlation
      formData.append('file_key', data.selectedFile || '');
      formData.append('bucket_name', 'trinity');
      formData.append('object_names', data.selectedFile || '');
      
      const res = await fetch(`${GROUPBY_API}/cardinality`, { method: 'POST', body: formData });
      const responseData = await res.json();
      
      if (responseData.status === 'SUCCESS' && responseData.cardinality) {
        setCardinalityData(responseData.cardinality);
      } else {
        setCardinalityError(responseData.error || 'Failed to fetch cardinality data');
      }
    } catch (e: any) {
      setCardinalityError(e.message || 'Error fetching cardinality data');
    } finally {
      setCardinalityLoading(false);
    }
  };

  // Cardinality filtering and sorting logic
  const displayedCardinality = React.useMemo(() => {
    let filtered = Array.isArray(cardinalityData) ? cardinalityData : [];

    // Filter out columns with unique_count = 0 (only exclude zero values)
    filtered = filtered.filter(c => c.unique_count > 0);

    // Apply column filters
    Object.entries(columnFilters).forEach(([column, values]) => {
      if (Array.isArray(values) && values.length > 0) {
        filtered = filtered.filter(item => {
          const itemValue = item[column];
          return values.some(value => 
            String(itemValue).toLowerCase().includes(String(value).toLowerCase())
          );
        });
      }
    });

    // Apply sorting
    if (sortColumn) {
      filtered.sort((a, b) => {
        const aVal = a[sortColumn];
        const bVal = b[sortColumn];
        
        if (typeof aVal === 'number' && typeof bVal === 'number') {
          return sortDirection === 'asc' ? aVal - bVal : bVal - aVal;
        }
        
        const aStr = String(aVal).toLowerCase();
        const bStr = String(bVal).toLowerCase();
        return sortDirection === 'asc' 
          ? aStr.localeCompare(bStr)
          : bStr.localeCompare(aStr);
      });
    }

    return filtered;
  }, [cardinalityData, columnFilters, sortColumn, sortDirection]);

  // Sorting and filtering functions
  const handleSort = (column: string, direction: 'asc' | 'desc') => {
    setSortColumn(column);
    setSortDirection(direction);
  };

  // Handle sort order change for time series chart
  const handleTimeSeriesSortOrderChange = (order: 'asc' | 'desc' | null) => {
    setTimeSeriesSortOrder(order);
  };

  // Handle data labels toggle for time series chart
  const handleTimeSeriesDataLabelsToggle = (enabled: boolean) => {
    setMatrixSettings((prev) => ({ ...prev, showDataLabels: enabled }));
  };

  // Handle chart type change for time series chart
  const handleTimeSeriesChartTypeChange = (newType: 'bar_chart' | 'line_chart' | 'pie_chart' | 'area_chart' | 'scatter_chart') => {
    // For correlation atom, we typically keep it as line_chart, but we can allow the change
    console.log('Chart type change requested:', newType);
  };

  // Handle save action for time series chart
  const handleTimeSeriesSave = () => {
    // Implement save functionality if needed
    console.log('Save time series chart');
  };

  const handleColumnFilter = (column: string, values: string[]) => {
    setColumnFilters(prev => ({
      ...prev,
      [column]: values
    }));
  };

  const clearColumnFilter = (column: string) => {
    setColumnFilters(prev => {
      const newFilters = { ...prev };
      delete newFilters[column];
      return newFilters;
    });
  };

  const getUniqueColumnValues = (column: string): string[] => {
    let filteredData = Array.isArray(cardinalityData) ? cardinalityData : [];
    
    // Apply other active filters to get context-aware unique values
    Object.entries(columnFilters).forEach(([filterColumn, values]) => {
      if (filterColumn !== column && Array.isArray(values) && values.length > 0) {
        filteredData = filteredData.filter(item => {
          const itemValue = item[filterColumn];
          return values.some(value => 
            String(itemValue).toLowerCase().includes(String(value).toLowerCase())
          );
        });
      }
    });

    // Filter out columns with unique_count = 0
    filteredData = filteredData.filter(c => c.unique_count > 0);

    const uniqueValues = [...new Set(filteredData.map(item => String(item[column])))];
    return uniqueValues.sort();
  };


  // Recalculate canvas width whenever its container resizes
  useEffect(() => {
    const container = heatmapRef.current?.parentElement;
    if (!container) return;

    const observer = new ResizeObserver((entries) => {
      for (const entry of entries) {
        setCanvasWidth(entry.contentRect.width);
      }
    });

    observer.observe(container);
    setCanvasWidth(container.clientWidth);

    return () => observer.disconnect();
  }, []);


  useEffect(() => {
    (async () => {
      try {
        const saved = await correlationAPI.getMatrixSettings();
        setMatrixSettings(saved);
      } catch (e) {
        /* ignore */
      }
    })();
  }, []);

  // Fetch cardinality data on mount or when selectedFile changes
  React.useEffect(() => {
    if (data.selectedFile) {
      fetchCardinalityData();
    }
  }, [data.selectedFile]);

  const handleSaveSettings = async (newSettings: MatrixSettings) => {
    setMatrixSettings(newSettings);
    try {
      await correlationAPI.saveMatrixSettings(newSettings);
    } catch (e) {
      /* ignore */
    }
    setSettingsOpen(false);
    setSettingsPosition(null);
  };

  // Filter management functions
  const handleFilterValuesChange = (
    columnName: string,
    newValues: string[],
  ) => {
    const currentFilters = data.settings?.filterDimensions || {};
    onDataChange({
      settings: {
        ...data.settings,
        filterDimensions: {
          ...currentFilters,
          [columnName]: newValues,
        },
      },
    });
  };

  const handleRemoveFilterFromCanvas = (columnName: string) => {
    const currentFilters = data.settings?.filterDimensions || {};
    const newFilters = { ...currentFilters };
    delete newFilters[columnName];

    onDataChange({
      settings: {
        ...data.settings,
        filterDimensions: newFilters,
      },
    });
  };

  const handleMatrixContextMenu = (e: React.MouseEvent) => {
    e.preventDefault();
    const menuWidth = 240;
    const menuHeight = 200;
    let x = e.clientX;
    let y = e.clientY;
    if (window.innerWidth - x < menuWidth) {
      x = window.innerWidth - menuWidth;
    }
    if (window.innerHeight - y < menuHeight) {
      y = window.innerHeight - menuHeight;
    }
    setSettingsPosition({ x, y });
    setSettingsOpen(true);
  };

  // Apply filters to fetch new correlation data
  const handleApplyFilters = async (
    filtersOverride?: Record<string, string[]>,
  ) => {
    if (!data.selectedFile) return;

    try {
      const filterDimensions =
        filtersOverride ?? data.settings?.filterDimensions ?? {};

      const request: FilterAndCorrelateRequest = {
        file_path: data.selectedFile,
        method: (
          data.settings?.correlationMethod || "pearson"
        ).toLowerCase() as any,
        include_preview: true,
        preview_limit: 10,
        save_filtered: true,
        include_date_analysis: true,
      };

      const identifierFilters = Object.entries(filterDimensions)
        .filter(([_, values]) => Array.isArray(values) && values.length > 0)
        .map(([column, values]) => ({ column, values: values as string[] }));
      if (identifierFilters.length > 0) {
        request.identifier_filters = identifierFilters;
      }

      if (data.selectedColumns && data.selectedColumns.length > 0) {
        const selectedIdentifiers = (data.selectedColumns || []).filter((col) =>
          data.fileData?.categoricalColumns?.includes(col),
        );
        const selectedMeasures = (data.selectedColumns || []).filter((col) =>
          data.fileData?.numericColumns?.includes(col),
        );
        if (selectedIdentifiers.length > 0) {
          request.identifier_columns = selectedIdentifiers;
        }
        if (selectedMeasures.length > 0) {
          request.measure_columns = selectedMeasures;
        }
      }

      if (
        data.dateAnalysis?.has_date_data &&
        data.settings?.dateFrom &&
        data.settings?.dateTo
      ) {
        const primaryDateColumn =
          data.dateAnalysis.date_columns[0]?.column_name;
        if (primaryDateColumn) {
          request.date_column = primaryDateColumn;
          request.date_range_filter = {
            start: data.settings.dateFrom,
            end: data.settings.dateTo,
          };
        }
      }

      const result = await correlationAPI.filterAndCorrelate(request);

      if (result.date_analysis) {
        onDataChange({ dateAnalysis: result.date_analysis });
      }

      const resultVariables = result.columns_used || [];
      // correlation results may come directly from the response or be nested
      // inside a `results` field when fetched from MongoDB. Support both
      // structures to ensure the heatmap renders correctly.
      const correlationDict =
        result.correlation_results?.correlation_matrix ??
        result.correlation_results?.results?.correlation_matrix ??
        {};

      const { matrix: transformedMatrix, filteredVariables } =
        transformCorrelationMatrix(correlationDict, resultVariables);

      onDataChange({
        correlationMatrix: transformedMatrix,
        timeSeriesData: [],
        timeSeriesIsDate: true,
        variables: filteredVariables,
        selectedVar1: null,
        selectedVar2: null,
        fileData: {
          ...(data.fileData || {}),
          fileName: data.selectedFile,
          rawData: result.preview_data || [],
          numericColumns: filteredVariables,
          dateColumns:
            result.date_analysis?.date_columns.map((c: any) => c.column_name) ||
            data.fileData?.dateColumns || [],
          categoricalColumns:
            data.fileData?.categoricalColumns ||
            (result.columns_used || []).filter(
              (col: string) => !filteredVariables.includes(col),
            ),
          columnValues: data.fileData?.columnValues || {},
          isProcessed: true,
        },
      });
    } catch (error) {
      // silently fail if filters cannot be applied
    }
  };

  const handleResetFilters = async () => {
    const currentFilters = data.settings?.filterDimensions || {};
    const resetFilters: Record<string, string[]> = Object.keys(currentFilters).reduce(
      (acc, column) => ({ ...acc, [column]: [] }),
      {}
    );
    onDataChange({
      settings: { ...data.settings, filterDimensions: resetFilters },
    });
    await handleApplyFilters(resetFilters);
  };

  // Enhanced time series data fetching function
  const fetchEnhancedTimeSeriesData = async (
    filePath: string,
    startDate?: string,
    endDate?: string,
    forceColumns?: { column1: string; column2: string },
  ): Promise<{ data: Array<{ date: number; var1Value: number; var2Value: number }>; isDate: boolean }> => {
    try {
      // 1. Get axis data (datetime or indices)
      const axisData = await correlationAPI.getTimeSeriesAxis(
        filePath,
        startDate,
        endDate,
      );
      const isDate = axisData.has_datetime;

      // 2. Get highest correlation pair (unless forced columns provided)
      let pairData;
      if (forceColumns) {
        pairData = {
          column1: forceColumns.column1,
          column2: forceColumns.column2,
          correlation_value: 0,
        };
      } else {
        pairData = await correlationAPI.getHighestCorrelationPair(filePath);
      }

      // 3. Get Y-values for the selected columns
      const seriesRequest = {
        column1: pairData.column1,
        column2: pairData.column2,
        start_date: startDate,
        end_date: endDate,
        datetime_column: axisData.datetime_column,
      };

      const seriesData = await correlationAPI.getTimeSeriesData(
        filePath,
        seriesRequest,
      );

      // 4. Transform to chart format and ensure the x-axis is sorted
      const chartData = axisData.x_values
        .map((x: any, index: number) => {
          const v1Raw = seriesData.column1_values[index];
          const v2Raw = seriesData.column2_values[index];
          if (v1Raw === undefined || v2Raw === undefined) return null;
          const v1 = parseFloat(v1Raw);
          const v2 = parseFloat(v2Raw);
          if (!isFinite(v1) || !isFinite(v2)) return null;
          return {
            date: isDate ? new Date(x).getTime() : index,
            var1Value: v1,
            var2Value: v2,
          };
        })
        .filter(Boolean)
        .sort((a: any, b: any) => a.date - b.date);

      return { data: chartData, isDate };
    } catch (error) {
      return { data: [], isDate: false };
    }
  };

  // Handle variable selection change for time series
  const handleVariableSelectionChange = async (var1: string, var2: string) => {
    // Get file path from selectedFile or fileData as fallback
    const filePath = data.selectedFile || data.fileData?.fileName;

    if (!filePath || !var1 || !var2) {
      onDataChange({
        selectedVar1: var1,
        selectedVar2: var2,
      });
      return;
    }

    try {
      // Update selected variables first
      onDataChange({
        selectedVar1: var1,
        selectedVar2: var2,
      });

      // Fetch new time series data with specific columns
      const { data: enhancedTimeSeriesData, isDate } = await fetchEnhancedTimeSeriesData(
        filePath,
        data.settings?.dateFrom,
        data.settings?.dateTo,
        { column1: var1, column2: var2 }, // Force specific columns
      );

      // Update time series data
      onDataChange({
        timeSeriesData: enhancedTimeSeriesData,
        timeSeriesIsDate: isDate,
        selectedVar1: var1,
        selectedVar2: var2,
      });
    } catch (error) {
      onDataChange({
        timeSeriesData: [],
        timeSeriesIsDate: true,
        selectedVar1: var1,
        selectedVar2: var2,
      });
    }
  };

  // Helper function to check if a column only correlates with itself
  const getFilteredVariables = (
    variables: string[],
    correlationMatrix: number[][],
  ) => {
    // Ensure variables is an array
    const safeVariables = variables || [];

    if (data.showAllColumns) {
      return safeVariables;
    }

    return safeVariables.filter((variable, index) => {
      if (!correlationMatrix || !correlationMatrix[index]) return true;

      // Check if this variable has any meaningful correlation with other variables
      // (excluding perfect correlat ion with itself at index === index)
      const hasOtherCorrelations = correlationMatrix[index].some(
        (correlation, corrIndex) => {
          return corrIndex !== index && Math.abs(correlation) > 0.1; // threshold for meaningful correlation
        },
      );

      return hasOtherCorrelations;
    });
  };

  // Draw correlation heatmap
  // Draw enhanced full-width correlation heatmap with Trinity styling
  useEffect(() => {
    if (!heatmapRef.current || !data.correlationMatrix) return;

      const dataKey = JSON.stringify({
        matrix: data.correlationMatrix,
        variables: data.variables,
        theme: matrixSettings.theme,
        filters: data.settings?.filterDimensions,
        aggregation: data.settings?.aggregationLevel,
      });
    const shouldAnimate = prevMatrixRef.current !== dataKey;
    prevMatrixRef.current = dataKey;

    const svg = d3.select(heatmapRef.current);
    svg.selectAll("*").remove();

    // Determine container width for responsive layout with extra space on the left
    const containerWidth = (canvasWidth || 900);
    const margin = { top: 80, right: 60, bottom: 180, left: 150 };
    const width = containerWidth - margin.left - margin.right;

    const g = svg
      .append("g")
      .attr("transform", `translate(${margin.left},${margin.top})`);

    // Resolve variables using existing helper to honour showAllColumns logic
    const allVariables =
      data.isUsingFileData && data.fileData?.numericColumns
        ? data.fileData.numericColumns
        : data.variables || [];
    const variables = getFilteredVariables(
      allVariables,
      data.correlationMatrix,
    );

    // Maintain previous matrix height while stretching width to fit container
    const baseHeight = isCompactMode ? 300 : 550;
    const cellWidth = Math.max(width / variables.length, 60);
    const cellHeight = Math.max(baseHeight / variables.length, 60);
    const actualWidth = cellWidth * variables.length;
    const actualHeight = cellHeight * variables.length;

    svg
      .attr("width", actualWidth + margin.left + margin.right)
      .attr("height", margin.top + actualHeight + margin.bottom);

    // Scales
    const xScale = d3
      .scaleBand()
      .domain(variables)
      .range([0, actualWidth])
      .padding(0.02);
    const yScale = d3
      .scaleBand()
      .domain(variables)
      .range([0, actualHeight])
      .padding(0.02);

    // Theme-based colour scale using primary (positive), secondary (negative) and tertiary (neutral)
    const theme = COLOR_THEMES[matrixSettings.theme] || COLOR_THEMES.default;
    const colorScale = d3
      .scaleLinear<string>()
      .domain([-1, 0, 1])
      .range([theme.secondary, theme.tertiary, theme.primary]);

    // Background grid
    g.selectAll(".grid-line-h")
      .data(d3.range(variables.length + 1))
      .enter()
      .append("line")
      .attr("class", "grid-line-h")
      .attr("x1", 0)
      .attr("x2", actualWidth)
      .attr("y1", (d) => d * cellHeight)
      .attr("y2", (d) => d * cellHeight)
      .attr("stroke", "hsl(var(--border))")
      .attr("stroke-width", 0.5)
      .attr("opacity", 0.2);

    g.selectAll(".grid-line-v")
      .data(d3.range(variables.length + 1))
      .enter()
      .append("line")
      .attr("class", "grid-line-v")
      .attr("y1", 0)
      .attr("y2", actualHeight)
      .attr("x1", (d) => d * cellWidth)
      .attr("x2", (d) => d * cellWidth)
      .attr("stroke", "hsl(var(--border))")
      .attr("stroke-width", 0.5)
      .attr("opacity", 0.2);

    // Prepare cell data, mapping through original indices
    const cellData: Array<{
      x: number;
      y: number;
      xVar: string;
      yVar: string;
      correlation: number;
    }> = [];
    variables.forEach((yVar, i) => {
      variables.forEach((xVar, j) => {
        const originalYIndex = allVariables.indexOf(yVar);
        const originalXIndex = allVariables.indexOf(xVar);
        let correlation = 0;
        if (
          data.correlationMatrix &&
          Array.isArray(data.correlationMatrix) &&
          originalYIndex >= 0 &&
          originalXIndex >= 0 &&
          data.correlationMatrix[originalYIndex] &&
          data.correlationMatrix[originalYIndex][originalXIndex] !== undefined
        ) {
          const value = data.correlationMatrix[originalYIndex][originalXIndex];
          correlation =
            typeof value === "number" && isFinite(value) ? value : 0;
        }
        cellData.push({ x: j, y: i, xVar, yVar, correlation });
      });
    });

    const cells = g
      .selectAll(".correlation-cell")
      .data(cellData)
      .enter()
      .append("rect")
      .attr("class", "correlation-cell")
      .attr("x", (d) => d.x * cellWidth + 1)
      .attr("y", (d) => d.y * cellHeight + 1)
      .attr("width", shouldAnimate ? 0 : cellWidth - 2)
      .attr("height", shouldAnimate ? 0 : cellHeight - 2)
      .attr("fill", (d) => colorScale(d.correlation))
      .attr("stroke", "#ffffff")
      .attr("stroke-width", 2)
      .attr("rx", 6)
      .attr("ry", 6)
      .style("cursor", "pointer")
      .style("filter", "drop-shadow(0 2px 6px rgba(0,0,0,0.15))")
      .on("mouseover", function (event, d) {
        d3.select(this)
          .transition()
          .duration(200)
          .attr("stroke-width", 4)
          .attr("stroke", "hsl(var(--trinity-yellow))")
          .style("filter", "drop-shadow(0 6px 20px rgba(0,0,0,0.3))")
          .attr("rx", 8)
          .attr("ry", 8);

        const textBorder = "-1px 0 #000, 0 1px #000, 1px 0 #000, 0 -1px #000";

        const tooltip = d3
          .select("body")
          .append("div")
          .attr("class", "correlation-tooltip")
          .style("position", "absolute")
          .style(
            "background",
            "linear-gradient(135deg, hsl(var(--trinity-blue)), hsl(var(--trinity-green)))",
          )
          .style("color", "white")
          .style("text-shadow", textBorder)
          .style("padding", "16px 20px")
          .style("border-radius", "12px")
          .style("font-size", "14px")
          .style("font-weight", "600")
          .style("pointer-events", "none")
          .style("z-index", "1000")
          .style("box-shadow", "0 10px 25px rgba(0,0,0,0.3)")
          .style("backdrop-filter", "blur(10px)")
          .style("border", "1px solid rgba(255,255,255,0.2)");

        const strengthText =
          Math.abs(d.correlation) > 0.7
            ? "Strong"
            : Math.abs(d.correlation) > 0.3
              ? "Moderate"
              : "Weak";
        const directionText = d.correlation > 0 ? "Positive" : "Negative";

        tooltip
          .html(
            `
          <div style="font-size: 16px; margin-bottom: 8px; text-shadow: ${textBorder};">📊 ${d.xVar} ↔ ${d.yVar}</div>
          <div style="font-size: 18px; margin-bottom: 6px;">Correlation: <span style="color: #fbbf24; text-shadow: none;">${d.correlation.toFixed(3)}</span></div>
          <div style="font-size: 12px; opacity: 0.9; text-shadow: ${textBorder};">${strengthText} ${directionText} relationship</div>
        `,
          )
          .style("left", event.pageX + 15 + "px")
          .style("top", event.pageY - 10 + "px")
          .style("opacity", 0)
          .transition()
          .duration(200)
          .style("opacity", 1);
      })
      .on("mouseout", function () {
        d3.select(this)
          .transition()
          .duration(200)
          .attr("stroke-width", 2)
          .attr("stroke", "#ffffff")
          .style("filter", "drop-shadow(0 2px 6px rgba(0,0,0,0.15))")
          .attr("rx", 6)
          .attr("ry", 6);

        d3.selectAll(".correlation-tooltip")
          .transition()
          .duration(200)
          .style("opacity", 0)
          .remove();
      })
      .on("click", (event, d) => {
        const ripple = g
          .append("circle")
          .attr("cx", d.x * cellWidth + cellWidth / 2)
          .attr("cy", d.y * cellHeight + cellHeight / 2)
          .attr("r", 0)
          .attr("fill", "hsl(var(--trinity-yellow))")
          .attr("opacity", 0.6)
          .style("pointer-events", "none");

        ripple
          .transition()
          .duration(600)
          .attr("r", Math.min(cellWidth, cellHeight))
          .attr("opacity", 0)
          .remove();

        // Pass the matrix's y-axis variable first so it maps to the chart's left Y-axis
        // and the x-axis variable becomes the right Y-axis series.
        handleVariableSelectionChange(d.yVar, d.xVar);
      });

    // Animate cells only when data changes
    if (shouldAnimate) {
      cells
        .transition()
        .duration(800)
        .delay((_, i) => i * 30)
        .ease(d3.easeBounceOut)
        .attr("width", cellWidth - 2)
        .attr("height", cellHeight - 2);
    }

    // Correlation values
    if (matrixSettings.showDataLabels) {
      const textElements = g
        .selectAll(".correlation-text")
        .data(cellData)
        .enter()
        .append("text")
        .attr("class", "correlation-text")
        .attr("x", (d) => d.x * cellWidth + cellWidth / 2)
        .attr("y", (d) => d.y * cellHeight + cellHeight / 2)
        .attr("text-anchor", "middle")
        .attr("dominant-baseline", "middle")
        .attr(
          "font-size",
          `${Math.max(10, Math.min(Math.min(cellWidth, cellHeight) / 3.5, 16))}px`,
        )
        .attr("font-weight", "700")
        .attr("fill", "#ffffff")
        .attr("stroke", "#000000")
        .attr("stroke-width", 1.5)
        .style("paint-order", "stroke")
        .style("pointer-events", "none")
        .style("opacity", shouldAnimate ? 0 : 1)
        .text((d) => d.correlation.toFixed(2));
      if (shouldAnimate) {
        textElements.transition().duration(600).delay(1000).style("opacity", 1);
      }
    }

    // Axis labels
    if (matrixSettings.showAxisLabels) {
      const xLabels = g
        .selectAll(".x-label")
        .data(variables)
        .enter()
        .append("text")
        .attr("class", "x-label")
        .attr("x", (_, i) => i * cellWidth + cellWidth / 2)
        .attr("y", actualHeight + 30)
        .attr("text-anchor", "middle")
        .attr("dominant-baseline", "hanging")
        .attr("font-size", "14px")
        .attr("font-weight", "600")
        .attr("fill", "hsl(var(--foreground))")
        .attr(
          "transform",
          (_, i) =>
            `rotate(-45, ${i * cellWidth + cellWidth / 2}, ${actualHeight + 30})`,
        )
        .style("font-style", "italic")
        .style("opacity", shouldAnimate ? 0 : 1)
        .text((d) => d);
      if (shouldAnimate) {
        xLabels.transition().duration(600).delay(1200).style("opacity", 1);
      }

      const yLabels = g
        .selectAll(".y-label")
        .data(variables)
        .enter()
        .append("text")
        .attr("class", "y-label")
        .attr("x", -10)
        .attr("text-anchor", "end")
        .attr("dominant-baseline", "middle")
        .attr("font-size", "14px")
        .attr("font-weight", "600")
        .attr("fill", "hsl(var(--foreground))")
        .style("font-style", "italic")
        .style("opacity", shouldAnimate ? 0 : 1);
      yLabels.each(function (d, i) {
        const words = String(d).replace(/_/g, " ").split(/\s+/);
        const lineHeight = 14;
        const text = d3.select(this);
        const yPos = i * cellHeight + cellHeight / 2 - ((words.length - 1) * lineHeight) / 2;
        text.attr("y", yPos);
        text.text(null);
        words.forEach((word, idx) => {
          text
            .append("tspan")
            .attr("x", -10)
            .attr("dy", idx === 0 ? 0 : lineHeight)
            .text(word);
        });
      });
      if (shouldAnimate) {
        yLabels.transition().duration(600).delay(1400).style("opacity", 1);
      }
    }

    // Color legend
    if (matrixSettings.showLegend) {
      const legendWidth = Math.min(450, actualWidth);
      const legendHeight = 20;
      const legend = svg
        .append("g")
        .attr("class", "color-legend")
        .attr(
          "transform",
          `translate(${margin.left + (actualWidth - legendWidth) / 2}, ${margin.top + actualHeight + 80})`,
        );

      const gradient = svg
        .append("defs")
        .append("linearGradient")
        .attr("id", "correlation-gradient")
        .attr("x1", "0%")
        .attr("x2", "100%");

      gradient
        .selectAll("stop")
        .data([
          { offset: "0%", color: colorScale(1) },
          { offset: "50%", color: colorScale(0) },
          { offset: "100%", color: colorScale(-1) },
        ])
        .enter()
        .append("stop")
        .attr("offset", (d) => d.offset)
        .attr("stop-color", (d) => d.color);

      legend
        .append("rect")
        .attr("width", legendWidth)
        .attr("height", legendHeight)
        .attr("fill", "url(#correlation-gradient)")
        .attr("stroke", "hsl(var(--border))")
        .attr("stroke-width", 1)
        .attr("rx", 4);

      legend
        .append("text")
        .attr("x", 0)
        .attr("y", legendHeight + 20)
        .attr("text-anchor", "start")
        .attr("font-size", "12px")
        .attr("font-weight", "600")
        .attr("fill", "hsl(var(--foreground))")
        .text("Strong Positive (+1)");

      legend
        .append("text")
        .attr("x", legendWidth / 2)
        .attr("y", legendHeight + 20)
        .attr("text-anchor", "middle")
        .attr("font-size", "12px")
        .attr("font-weight", "600")
        .attr("fill", "hsl(var(--foreground))")
        .text("No Correlation (0)");

      legend
        .append("text")
        .attr("x", legendWidth)
        .attr("y", legendHeight + 20)
        .attr("text-anchor", "end")
        .attr("font-size", "12px")
        .attr("font-weight", "600")
        .attr("fill", "hsl(var(--foreground))")
        .text("Strong Negative (-1)");
    }
  }, [
    data.correlationMatrix,
    data.variables,
    data.isUsingFileData,
    data.fileData,
    data.showAllColumns,
    isCompactMode,
    canvasWidth,
    matrixSettings,
  ]);


  const getCorrelationValue = () => {
    // Return null when no variables are selected
    if (!data.selectedVar1 || !data.selectedVar2) {
      return null;
    }

    const variables =
      data.isUsingFileData && data.fileData?.numericColumns
        ? data.fileData.numericColumns
        : data.variables || [];

    if (!variables || !data.correlationMatrix) {
      return null;
    }

    const var1Index = variables.indexOf(data.selectedVar1);
    const var2Index = variables.indexOf(data.selectedVar2);

    if (
      var1Index !== -1 &&
      var2Index !== -1 &&
      data.correlationMatrix[var1Index] &&
      data.correlationMatrix[var1Index][var2Index] !== undefined
    ) {
      const value = data.correlationMatrix[var1Index][var2Index];
      return isNaN(value) ? null : value;
    }
    return null;
  };

  // Get current variables for display (filtered or all)
  const allCurrentVariables =
    data.isUsingFileData && data.fileData?.numericColumns
      ? data.fileData.numericColumns
      : data.variables || [];

  const currentVariables = getFilteredVariables(
    allCurrentVariables,
    data.correlationMatrix,
  );

  const correlationValue = getCorrelationValue();

  const MAX_TIME_SERIES_POINTS = 1000;
  const isDateAxis = data.timeSeriesIsDate !== false;
  const timeSeriesXField = isDateAxis ? "date" : "index";
  const timeSeriesChartData = useMemo(() => {
    if (!data.timeSeriesData || !data.selectedVar1 || !data.selectedVar2) {
      return [];
    }
    return data.timeSeriesData
      .map((d, idx) => {
        // Ensure date values are properly formatted as timestamps
        const xValue = isDateAxis
          ? typeof d.date === "number"
            ? d.date
            : new Date(d.date).getTime()
          : idx;
        const v1 = typeof d.var1Value === "number" ? d.var1Value : parseFloat(d.var1Value);
        const v2 = typeof d.var2Value === "number" ? d.var2Value : parseFloat(d.var2Value);
        return {
          [timeSeriesXField]: xValue,
          [data.selectedVar1!]: v1,
          [data.selectedVar2!]: v2,
        };
      })
      .filter(
        (d) =>
          typeof d[data.selectedVar1!] === "number" &&
          isFinite(d[data.selectedVar1!]) &&
          typeof d[data.selectedVar2!] === "number" &&
          isFinite(d[data.selectedVar2!]),
      )
      .sort((a, b) => a[timeSeriesXField] - b[timeSeriesXField])
      .slice(-MAX_TIME_SERIES_POINTS);
  }, [data.timeSeriesData, data.selectedVar1, data.selectedVar2, isDateAxis, timeSeriesXField]);
  const timeSeriesChartHeight = isCompactMode ? 195 : 390;

  const timeSeriesRendererProps = useMemo(() => {
    if (!data.selectedVar1 || !data.selectedVar2) return null;
    const theme = COLOR_THEMES[matrixSettings.theme] || COLOR_THEMES.default;
    return {
      key: `${data.selectedVar1}-${data.selectedVar2}-${timeSeriesXField}`,
      type: "line_chart" as const,
      data: timeSeriesChartData,
      xField: timeSeriesXField,
      yField: data.selectedVar1,
      yFields: [data.selectedVar1, data.selectedVar2],
      // Provide explicit axis labels for dual Y-axes
      yAxisLabel: data.selectedVar1,
      yAxisLabels: [data.selectedVar1, data.selectedVar2],
      xAxisLabel: isDateAxis ? "Date" : "Index",
      colors: [theme.primary, theme.secondary, theme.tertiary],
      theme: matrixSettings.theme,
      showLegend: matrixSettings.showLegend,
      showAxisLabels: matrixSettings.showAxisLabels,
      showGrid: matrixSettings.showGrid,
      initialShowDataLabels: false,
      sortOrder: timeSeriesSortOrder,
      height: timeSeriesChartHeight,
      onGridToggle: (enabled: boolean) =>
        setMatrixSettings((prev) => ({ ...prev, showGrid: enabled })),
      onLegendToggle: (enabled: boolean) =>
        setMatrixSettings((prev) => ({ ...prev, showLegend: enabled })),
      onAxisLabelsToggle: (enabled: boolean) =>
        setMatrixSettings((prev) => ({ ...prev, showAxisLabels: enabled })),
      onDataLabelsToggle: handleTimeSeriesDataLabelsToggle,
      onSave: handleTimeSeriesSave,
      onChartTypeChange: handleTimeSeriesChartTypeChange,
      onSortChange: handleTimeSeriesSortOrderChange,
    } as const;
  }, [
    data.selectedVar1,
    data.selectedVar2,
    timeSeriesChartData,
    matrixSettings,
    timeSeriesChartHeight,
    timeSeriesXField,
    isDateAxis,
    timeSeriesSortOrder,
  ]);

  const timeSeriesChartElement = useMemo(() => {
    if (!timeSeriesRendererProps) return null;
    return (
      <div className="w-full" style={{ height: timeSeriesChartHeight }}>
        <RechartsChartRenderer {...timeSeriesRendererProps} />
      </div>
    );
  }, [timeSeriesRendererProps, timeSeriesChartHeight]);

  return (
    <div
      className={`w-full h-full bg-background ${isCompactMode ? "p-4" : "p-6"} overflow-y-auto`}
    >
      {/* Show default message when no data is loaded */}
      {!data.isUsingFileData || !data.fileData ? (
        <div className="w-full h-full p-6 bg-gradient-to-br from-slate-50 via-purple-50/30 to-purple-50/50 overflow-y-auto relative">
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
              <div className="w-24 h-24 mx-auto mb-8 rounded-2xl bg-gradient-to-br from-purple-500 to-purple-600 flex items-center justify-center shadow-2xl transform rotate-3 hover:rotate-0 transition-transform duration-300">
                <Activity className="w-12 h-12 text-white drop-shadow-lg" />
              </div>
              <h3 className="text-3xl font-bold text-gray-900 mb-3 bg-gradient-to-r from-purple-500 to-purple-600 bg-clip-text text-transparent">
                Correlation Operation
              </h3>
              <p className="text-gray-600 mb-6 text-lg font-medium leading-relaxed">
                Select a dataset from the properties panel to get started
              </p>
            </div>
          </div>
        </div>
      ) : (
        <>
          {/* Cardinality View - Show immediately after dataset input */}
          {data.selectedFile && (
        <div className="space-y-4">
          {cardinalityLoading && (
            <div className="flex items-center justify-center p-8">
              <div className="text-center">
                <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-purple-500 mx-auto mb-2"></div>
                <span className="text-purple-600">Loading cardinality data...</span>
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
                        <FilterMenu 
                          column="column" 
                          uniqueValues={getUniqueColumnValues('column')}
                          currentFilters={columnFilters['column'] || []}
                          onColumnFilter={handleColumnFilter}
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
                        <FilterMenu 
                          column="data_type" 
                          uniqueValues={getUniqueColumnValues('data_type')}
                          currentFilters={columnFilters['data_type'] || []}
                          onColumnFilter={handleColumnFilter}
                        />
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
                        <FilterMenu 
                          column="unique_count" 
                          uniqueValues={getUniqueColumnValues('unique_count')}
                          currentFilters={columnFilters['unique_count'] || []}
                          onColumnFilter={handleColumnFilter}
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
                </ContextMenu>,
                "Sample values"
              ]}
              colClasses={["w-[30%]", "w-[20%]", "w-[15%]", "w-[35%]"]}
              bodyClassName="max-h-[484px] overflow-y-auto"
              defaultMinimized={true}
              borderColor={`border-${correlation.color.replace('bg-', '')}`}
              customHeader={{
                title: "Cardinality View",
                subtitle: "Click Here to View Data",
                subtitleClickable: !!data.selectedFile,
                onSubtitleClick: () => {
                  if (data.selectedFile) {
                    window.open(`/dataframe?name=${encodeURIComponent(data.selectedFile)}`, '_blank');
                  }
                }
              }}
            >
              {displayedCardinality.map((col, index) => (
                <tr key={index} className="table-row">
                  <td className="table-cell">{col.column || col.Column || ''}</td>
                  <td className="table-cell">{col.data_type || col.Data_Type || ''}</td>
                  <td className="table-cell">{col.unique_count || col.Unique_Count || 0}</td>
                  <td className="table-cell">
                    <div className="flex flex-wrap items-center gap-1">
                      {Array.isArray(col.unique_values) && col.unique_values.length > 0 ? (
                        <>
                          {col.unique_values.slice(0, 2).map((val: any, i: number) => (
                            <span
                              key={i}
                              className="inline-block bg-gray-100 text-gray-800 px-2 py-1 rounded text-xs mr-1 mb-1"
                            >
                              {String(val)}
                            </span>
                          ))}
                          {col.unique_values.length > 2 && (
                            <Tooltip>
                              <TooltipTrigger asChild>
                                <span className="flex items-center gap-0.5 text-xs text-slate-600 font-medium cursor-pointer">
                                  <Plus className="w-3 h-3" />
                                  {col.unique_values.length - 2} more
                                </span>
                              </TooltipTrigger>
                              <TooltipContent className="text-xs max-w-xs whitespace-pre-wrap">
                                {col.unique_values
                                  .slice(2)
                                  .map((val: any) => String(val))
                                  .join(', ')}
                              </TooltipContent>
                            </Tooltip>
                          )}
                        </>
                      ) : (
                        <span className="text-gray-400">—</span>
                      )}
                    </div>
                  </td>
                </tr>
              ))}
            </Table>
          )}
        </div>
      )}

        {/* Filter Dimensions - Dynamic from actual data */}
        <Card className="p-4 mb-4" onContextMenu={handleMatrixContextMenu}>
          <h3 className="text-sm font-semibold text-foreground mb-3 flex items-center gap-2">
            <Target className="w-4 h-4 text-primary" />
            Filter Dimensions
          </h3>

            {/* Show active filter dimensions */}
            {Object.keys(data.settings?.filterDimensions || {}).length > 0 ? (
              <div className="flex gap-3 overflow-x-auto pb-2 max-w-full scroll-smooth scrollbar-thin scrollbar-thumb-gray-300 scrollbar-track-gray-100">
                {Object.entries(data.settings?.filterDimensions || {}).map(
                  ([columnName, selectedValues]) => (
                    <div
                      key={columnName}
                      className="flex-shrink-0 min-w-[200px] max-w-[220px]"
                    >
                      <FilterDimensionButton
                        columnName={columnName}
                        selectedValues={
                          Array.isArray(selectedValues) ? selectedValues : []
                        }
                        availableValues={
                          data.fileData?.columnValues?.[columnName] || []
                        }
                        onValuesChange={(newValues) =>
                          handleFilterValuesChange(columnName, newValues)
                        }
                        onRemove={() =>
                          handleRemoveFilterFromCanvas(columnName)
                        }
                      />
                    </div>
                  ),
                )}
              </div>
            ) : (
              <div className="text-xs text-muted-foreground text-center py-4 border border-dashed rounded">
                No filters applied. Add filters in the settings panel to see
                them here.
              </div>
            )}
            <div className="flex gap-2 mt-4">
              <Button
                size="sm"
                onClick={() => handleApplyFilters()}
                disabled={
                  Object.keys(data.settings?.filterDimensions || {}).length ===
                  0
                }
              >
                Filter
              </Button>
          <Button
            size="sm"
            variant="outline"
            onClick={handleResetFilters}
            disabled={
              Object.keys(data.settings?.filterDimensions || {}).length ===
              0
            }
          >
            Reset
          </Button>
        </div>
      </Card>

      <div className="flex items-center justify-between w-full px-4 mb-2">
        <p className="text-xs text-gray-500">Right-click to open settings</p>
        <p className="text-xs text-gray-500 text-center flex-1">
          Click a matrix cell to view analysis below
        </p>
        <div className="flex items-center space-x-2">
          <span className="text-xs text-gray-500">Show all columns</span>
          <Switch
            checked={data.showAllColumns || false}
            onCheckedChange={(checked) =>
              onDataChange({ showAllColumns: checked })
            }
            className="data-[state=checked]:bg-[#458EE2]"
          />
        </div>
      </div>

      {/* Correlation Heatmap - Full Width */}
      <div className={isCompactMode ? "mb-4" : "mb-6"}>
        <Card
          className="overflow-hidden"
          onContextMenu={handleMatrixContextMenu}
        >
          <div
            className={
              isCompactMode ? "p-4 flex justify-center" : "p-6 flex justify-center"
            }
          >
            <svg
              ref={heatmapRef}
              height={isCompactMode ? "260" : "650"}
              className="block mx-auto"
            ></svg>
          </div>
        </Card>
      </div>

      {/* Time Series Comparison */}
      {data.selectedVar1 && data.selectedVar2 && (
        <div className={isCompactMode ? "mb-4" : "mb-6"}>
          <Card className="overflow-hidden h-full flex flex-col">
            <div
              className={`${
                isCompactMode ? "p-3" : "p-4"
              } border-b bg-muted/30 flex items-center justify-between`}
            >
              <h3
                className={`font-semibold text-foreground flex items-center gap-2 ${
                  isCompactMode ? "text-sm" : ""
                }`}
              >
                <TrendingUp
                  className={`${isCompactMode ? "w-3 h-3" : "w-4 h-4"} text-primary`}
                />
                Time Series Comparison
              </h3>
              {correlationValue !== null ? (
                <div className="flex items-center gap-2">
                  <span
                    className={`text-foreground ${
                      isCompactMode ? "text-xs" : "text-sm"
                    }`}
                  >
                    {`Correlation for ${data.selectedVar1} vs ${data.selectedVar2}:`}
                  </span>
                  <span
                    className={`font-bold text-foreground ${
                      isCompactMode ? "text-sm" : "text-lg"
                    }`}
                  >
                    {correlationValue.toFixed(3)}
                  </span>
                  <Badge
                    variant={
                      Math.abs(correlationValue) > 0.7
                        ? "destructive"
                        : Math.abs(correlationValue) > 0.3
                          ? "default"
                          : "secondary"
                    }
                    className={isCompactMode ? "text-xs" : "text-sm"}
                  >
                    {Math.abs(correlationValue) > 0.7
                      ? "Strong"
                      : Math.abs(correlationValue) > 0.3
                        ? "Moderate"
                        : "Weak"}
                  </Badge>
                </div>
              ) : (
                <Badge variant="outline" className={isCompactMode ? "text-xs" : "text-sm"}>
                  No Data
                </Badge>
              )}
            </div>
            {!isCompactMode && (
              <p className="text-sm text-muted-foreground px-4 pt-2">
                {`Visualize how ${data.selectedVar1} and ${data.selectedVar2} change over time`}
              </p>
            )}
            {timeSeriesChartElement && (
              <div className={`${isCompactMode ? "p-4" : "p-6"} flex-1`}>
                {timeSeriesChartElement}
              </div>
            )}
          </Card>
        </div>
      )}
        </>
      )}
      <MatrixSettingsTray
        open={settingsOpen}
        position={settingsPosition}
        onOpenChange={(open) => {
          setSettingsOpen(open);
          if (!open) setSettingsPosition(null);
        }}
        settings={matrixSettings}
        onSave={handleSaveSettings}
      />
    </div>
  );
};

export default CorrelationCanvas;
