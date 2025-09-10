import React, { useEffect, useRef, useState } from "react";
import * as d3 from "d3";
import {
  ChevronDown,
  TrendingUp,
  BarChart3,
  Target,
  Zap,
  X,
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
import { CorrelationSettings } from "@/components/LaboratoryMode/store/laboratoryStore";
import { useLaboratoryStore } from "@/components/LaboratoryMode/store/laboratoryStore";
import { correlationAPI } from "../helpers/correlationAPI";
import type { FilterAndCorrelateRequest } from "../helpers/correlationAPI";
import MatrixSettingsTray, {
  MatrixSettings,
  COLOR_THEMES,
} from "./MatrixSettingsTray";

interface CorrelationCanvasProps {
  data: CorrelationSettings;
  onDataChange: (newData: Partial<CorrelationSettings>) => void;
}

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
  const [isOpen, setIsOpen] = useState(false);

  const getButtonText = () => {
    if (selectedValues.length === 0) return "All";
    if (selectedValues.length === 1) return selectedValues[0];
    return `${selectedValues.length} selected`;
  };

  return (
    <div className="flex flex-col gap-1">
      <label className="text-xs font-medium text-muted-foreground truncate">
        {columnName}
      </label>

      <Popover open={isOpen} onOpenChange={setIsOpen}>
        <PopoverTrigger asChild>
          <Button
            variant="outline"
            size="sm"
            className="h-8 text-xs justify-between w-full"
          >
            <span className="truncate">{getButtonText()}</span>
            <div className="flex items-center gap-1 ml-1">
              <ChevronDown className="h-3 w-3" />
              <X
                className="h-3 w-3 hover:bg-destructive hover:text-destructive-foreground rounded"
                onClick={(e) => {
                  e.stopPropagation();
                  onRemove();
                }}
              />
            </div>
          </Button>
        </PopoverTrigger>

        <PopoverContent className="w-60 p-0" align="start">
          <MultiSelectValues
            columnName={columnName}
            selectedValues={selectedValues}
            availableValues={availableValues}
            onValuesChange={onValuesChange}
          />
        </PopoverContent>
      </Popover>
    </div>
  );
};

const CorrelationCanvas: React.FC<CorrelationCanvasProps> = ({
  data,
  onDataChange,
}) => {
  const heatmapRef = useRef<SVGSVGElement>(null);
  const timeSeriesRef = useRef<SVGSVGElement>(null);
  const prevMatrixRef = useRef<string>("");
  const [canvasWidth, setCanvasWidth] = useState(0);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [matrixSettings, setMatrixSettings] = useState<MatrixSettings>({
    theme: "default",
    showAxisLabels: true,
    showDataLabels: true,
    showLegend: true,
  });
  const [settingsPosition, setSettingsPosition] = useState<{
    x: number;
    y: number;
  } | null>(null);
  const auxPanelActive = useLaboratoryStore((state) => state.auxPanelActive);

  // Determine if we're in compact mode (when auxiliary panels are open)
  const isCompactMode = auxPanelActive !== null;

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

  const handleMatrixDoubleClick = (e: React.MouseEvent) => {
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
    console.log("MatrixSettingsTray opened via double click", { x, y });
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
      const { matrix: transformedMatrix, filteredVariables } =
        transformCorrelationMatrix(
          result.correlation_results.correlation_matrix,
          resultVariables,
        );

      onDataChange({
        correlationMatrix: transformedMatrix,
        timeSeriesData: [],
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
      console.error("Error applying filters:", error);
    }
  };

  const handleResetFilters = async () => {
    onDataChange({
      settings: { ...data.settings, filterDimensions: {} },
    });
    await handleApplyFilters({});
  };

  // Enhanced time series data fetching function
  const fetchEnhancedTimeSeriesData = async (
    filePath: string,
    startDate?: string,
    endDate?: string,
    forceColumns?: { column1: string; column2: string },
  ): Promise<
    Array<{ date: Date | number; var1Value: number; var2Value: number }>
  > => {
    try {
      // 1. Get axis data (datetime or indices)
      const axisData = await correlationAPI.getTimeSeriesAxis(
        filePath,
        startDate,
        endDate,
      );

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

      // 4. Transform to chart format
      const chartData = axisData.x_values.map((x: any, index: number) => ({
        date: axisData.has_datetime ? new Date(x) : index,
        var1Value: seriesData.column1_values[index] || 0,
        var2Value: seriesData.column2_values[index] || 0,
      }));

      return chartData;
    } catch (error) {
      return [];
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
      const enhancedTimeSeriesData = await fetchEnhancedTimeSeriesData(
        filePath,
        data.settings?.dateFrom,
        data.settings?.dateTo,
        { column1: var1, column2: var2 }, // Force specific columns
      );

      // Update time series data
      onDataChange({
        timeSeriesData: enhancedTimeSeriesData,
        selectedVar1: var1,
        selectedVar2: var2,
      });
    } catch (error) {
      onDataChange({
        timeSeriesData: [],
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

    // Determine container width for responsive layout
    const containerWidth = canvasWidth || 800;
    const margin = { top: 80, right: 80, bottom: 180, left: 100 };
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
    const baseHeight = isCompactMode ? 220 : 400;
    const cellWidth = Math.max(width / variables.length, 45);
    const cellHeight = Math.max(baseHeight / variables.length, 45);
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
          <div style="font-size: 18px; margin-bottom: 6px;">Correlation: <span style="color: #fbbf24; text-shadow: ${textBorder};">${d.correlation.toFixed(3)}</span></div>
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

        handleVariableSelectionChange(d.xVar, d.yVar);
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
          `${Math.max(8, Math.min(Math.min(cellWidth, cellHeight) / 4.5, 11))}px`,
        )
        .attr("font-weight", "700")
        .attr("fill", "#ffffff")
        .attr("stroke", "#000000")
        .attr("stroke-width", 0.8)
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
        .attr("x", -20)
        .attr("y", (_, i) => i * cellHeight + cellHeight / 2)
        .attr("text-anchor", "end")
        .attr("dominant-baseline", "middle")
        .attr("font-size", "14px")
        .attr("font-weight", "600")
        .attr("fill", "hsl(var(--foreground))")
        .attr(
          "transform",
          (_, i) => `rotate(-45, -20, ${i * cellHeight + cellHeight / 2})`,
        )
        .style("font-style", "italic")
        .style("opacity", shouldAnimate ? 0 : 1)
        .text((d) => d);
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

  // Draw time series chart
  useEffect(() => {
    if (!timeSeriesRef.current || !data.timeSeriesData?.length) return;

    const svg = d3.select(timeSeriesRef.current);
    svg.selectAll("*").remove();

    // Adjust dimensions based on compact mode
    const margin = isCompactMode
      ? { top: 10, right: 60, bottom: 25, left: 35 }
      : { top: 20, right: 120, bottom: 40, left: 60 };

    const container = timeSeriesRef.current.parentElement;
    const containerWidth =
      container?.clientWidth || canvasWidth || (isCompactMode ? 350 : 600);
    const baseHeight = isCompactMode ? 150 : 300;

    svg.attr("width", containerWidth).attr("height", baseHeight);

    const width = containerWidth - margin.left - margin.right;
    const height = baseHeight - margin.top - margin.bottom;

    const g = svg
      .append("g")
      .attr("transform", `translate(${margin.left},${margin.top})`);

    // Validate and clean time series data
    const validData = data.timeSeriesData.filter(
      (d) =>
        (d.date instanceof Date || typeof d.date === "number") &&
        typeof d.var1Value === "number" &&
        !isNaN(d.var1Value) &&
        isFinite(d.var1Value) &&
        typeof d.var2Value === "number" &&
        !isNaN(d.var2Value) &&
        isFinite(d.var2Value),
    );

    if (validData.length === 0) {
      // Display message when no valid data
      g.append("text")
        .attr("x", width / 2)
        .attr("y", height / 2)
        .attr("text-anchor", "middle")
        .style("font-size", isCompactMode ? "12px" : "14px")
        .style("fill", "#666")
        .text("No valid time series data available");
      return;
    }

    // Determine if we're using dates or indices
    const hasDatetime =
      validData.length > 0 && validData[0].date instanceof Date;

    // Create appropriate scales based on data type
    let xScale: any;

    if (hasDatetime) {
      // Use time scale for datetime data
      const dateExtent = d3.extent(validData, (d) => d.date as Date) as [
        Date,
        Date,
      ];
      if (!dateExtent[0] || !dateExtent[1]) {
        // No valid date extent, show empty chart message
        g.append("text")
          .attr("x", width / 2)
          .attr("y", height / 2)
          .attr("text-anchor", "middle")
          .style("font-size", isCompactMode ? "12px" : "14px")
          .style("fill", "#666")
          .text("Invalid date range in time series data");
        return;
      }
      xScale = d3.scaleTime().domain(dateExtent).range([0, width]);
    } else {
      // Use linear scale for index data
      const indexExtent = d3.extent(validData, (d) => d.date as number) as [
        number,
        number,
      ];
      if (indexExtent[0] === undefined || indexExtent[1] === undefined) {
        // No valid index extent, show empty chart message
        g.append("text")
          .attr("x", width / 2)
          .attr("y", height / 2)
          .attr("text-anchor", "middle")
          .style("font-size", isCompactMode ? "12px" : "14px")
          .style("fill", "#666")
          .text("Invalid index range in time series data");
        return;
      }
      xScale = d3.scaleLinear().domain(indexExtent).range([0, width]);
    }

    // Get visualization options from data or use defaults
    const vizOptions = data.visualizationOptions || {
      heatmapColorScheme: "RdBu",
      var1Color: "#41C185",
      var2Color: "#458EE2",
      normalizeValues: false,
      selectedVizType: "heatmap",
    };

    // MinMax normalization based on highest absolute value across both variables
    const applyMinMaxNormalization = (
      var1Values: number[],
      var2Values: number[],
    ): { var1: number[]; var2: number[] } => {
      if (!vizOptions.normalizeValues) {
        return { var1: var1Values, var2: var2Values };
      }

      // Find the maximum absolute value across both variables
      const allValues = [...var1Values, ...var2Values];
      const maxAbsValue = Math.max(...allValues.map((v) => Math.abs(v)));

      // If maxAbsValue is 0, return original values to avoid division by zero
      if (maxAbsValue === 0) {
        return { var1: var1Values, var2: var2Values };
      }

      // Normalize both variables by dividing by the max absolute value
      const normalizedVar1 = var1Values.map((value) => value / maxAbsValue);
      const normalizedVar2 = var2Values.map((value) => value / maxAbsValue);

      return { var1: normalizedVar1, var2: normalizedVar2 };
    };

    // Apply MinMax normalization to both variables
    const var1RawValues = validData.map((d) => d.var1Value);
    const var2RawValues = validData.map((d) => d.var2Value);
    const { var1: normalizedVar1Values, var2: normalizedVar2Values } =
      applyMinMaxNormalization(var1RawValues, var2RawValues);

    // Create normalized data array
    const normalizedData = validData.map((d, i) => ({
      ...d,
      var1Value: normalizedVar1Values[i],
      var2Value: normalizedVar2Values[i],
    }));

    // Let D3 automatically calculate extents (no forced ranges)
    const var1Extent = d3.extent(normalizedData, (d) => d.var1Value) as [
      number,
      number,
    ];
    const var2Extent = d3.extent(normalizedData, (d) => d.var2Value) as [
      number,
      number,
    ];

    const yScale1 = d3
      .scaleLinear()
      .domain(
        var1Extent[0] !== undefined &&
          var1Extent[1] !== undefined &&
          var1Extent[0] !== var1Extent[1]
          ? var1Extent
          : [0, Math.max(...normalizedData.map((d) => d.var1Value)) || 100],
      )
      .range([height, 0]);

    const yScale2 = d3
      .scaleLinear()
      .domain(
        var2Extent[0] !== undefined &&
          var2Extent[1] !== undefined &&
          var2Extent[0] !== var2Extent[1]
          ? var2Extent
          : [0, Math.max(...normalizedData.map((d) => d.var2Value)) || 100],
      )
      .range([height, 0]);

    // Create line generators with validation using normalized data
    const line1 = d3
      .line<(typeof normalizedData)[0]>()
      .x((d) => {
        const x = xScale(d.date);
        return isNaN(x) ? 0 : x;
      })
      .y((d) => {
        const y = yScale1(d.var1Value);
        return isNaN(y) ? height : y;
      })
      .curve(d3.curveMonotoneX);

    const line2 = d3
      .line<(typeof normalizedData)[0]>()
      .x((d) => {
        const x = xScale(d.date);
        return isNaN(x) ? 0 : x;
      })
      .y((d) => {
        const y = yScale2(d.var2Value);
        return isNaN(y) ? height : y;
      })
      .curve(d3.curveMonotoneX);

    // Add lines with error handling using normalized data and selected colors
    try {
      g.append("path")
        .datum(normalizedData)
        .attr("fill", "none")
        .attr("stroke", vizOptions.var1Color)
        .attr("stroke-width", 2)
        .attr("d", line1);

      g.append("path")
        .datum(normalizedData)
        .attr("fill", "none")
        .attr("stroke", vizOptions.var2Color)
        .attr("stroke-width", 2)
        .attr("d", line2);

      // Add axes with appropriate formatting
      const xAxis = hasDatetime
        ? d3.axisBottom(xScale).tickFormat(d3.timeFormat("%b %d"))
        : d3.axisBottom(xScale).tickFormat(d3.format("d"));

      const xAxisG = g
        .append("g")
        .attr("transform", `translate(0,${height})`)
        .call(xAxis);

      xAxisG
        .selectAll("text")
        .style("font-style", "normal")
        .attr("text-anchor", "end")
        .attr("transform", "rotate(-15)")
        .attr("dx", "-0.8em")
        .attr("dy", "0.15em");

      g.append("g").call(d3.axisLeft(yScale1));

      // Add legend
      const legend = g
        .append("g")
        .attr("transform", `translate(${width + 20}, 20)`);

      legend
        .append("line")
        .attr("x1", 0)
        .attr("x2", 20)
        .attr("y1", 0)
        .attr("y2", 0)
        .attr("stroke", vizOptions.var1Color)
        .attr("stroke-width", 2);

      legend
        .append("text")
        .attr("x", 25)
        .attr("y", 0)
        .attr("dy", "0.35em")
        .style("font-size", "12px")
        .style("fill", "#666")
        .text(data.selectedVar1);

      legend
        .append("line")
        .attr("x1", 0)
        .attr("x2", 20)
        .attr("y1", 20)
        .attr("y2", 20)
        .attr("stroke", vizOptions.var2Color)
        .attr("stroke-width", 2);

      legend
        .append("text")
        .attr("x", 25)
        .attr("y", 20)
        .attr("dy", "0.35em")
        .style("font-size", "12px")
        .style("fill", "#666")
        .text(data.selectedVar2);
    } catch (error) {
      g.append("text")
        .attr("x", width / 2)
        .attr("y", height / 2)
        .attr("text-anchor", "middle")
        .style("font-size", "14px")
        .style("fill", "hsl(var(--destructive))")
        .text("Error rendering time series chart");
    }
  }, [
    data.timeSeriesData,
    data.selectedVar1,
    data.selectedVar2,
    data.visualizationOptions,
    isCompactMode,
    canvasWidth,
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

  return (
    <div
      className={`w-full h-full bg-background ${isCompactMode ? "p-4" : "p-6"} overflow-y-auto`}
    >
      {/* Show default message when no data is loaded */}
      {!data.isUsingFileData || !data.fileData ? (
        <div className="flex flex-col items-center justify-center py-12 space-y-4 bg-muted/20 rounded-lg border-2 border-dashed border-muted-foreground/25">
          <div className="p-4 bg-muted/50 rounded-full">
            <BarChart3 className="w-8 h-8 text-muted-foreground" />
          </div>
          <div className="text-center space-y-2">
            <h3 className="text-lg font-semibold text-foreground">
              No Dataset Loaded
            </h3>
            <p className="text-muted-foreground max-w-md">
              Select a dataset through the Settings tab to start analyzing
              correlations between your variables.
            </p>
          </div>
        </div>
      ) : (
        <>
          {/* Show All Columns toggle */}
          <div
            className="flex justify-end w-full pr-4 mb-2"
            style={{ width: canvasWidth }}
          >
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

          {/* Filter Dimensions - Dynamic from actual data */}
          <Card className="p-4 mb-4" onDoubleClick={handleMatrixDoubleClick}>
            <h3 className="text-sm font-semibold text-foreground mb-1 flex items-center gap-2">
              <Target className="w-4 h-4 text-primary" />
              Filter Dimensions
            </h3>
            <p className="text-xs text-gray-500 mb-3">
              Double-click to open settings
            </p>

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

          {/* Correlation Heatmap - Full Width */}
          <div className={isCompactMode ? "mb-4" : "mb-6"}>
            <Card
              className="overflow-hidden"
              onDoubleClick={handleMatrixDoubleClick}
            >
              <div
                className={
                  isCompactMode
                    ? "p-4 flex justify-center"
                    : "p-6 flex justify-center"
                }
              >
                <svg
                  ref={heatmapRef}
                  height={isCompactMode ? "260" : "650"}
                  className="block"
                ></svg>
              </div>
            </Card>
          </div>

          {/* Time Series + Analysis Setup */}
          <div
            className={`grid ${isCompactMode ? "grid-cols-1 gap-4" : "grid-cols-12 gap-6"}`}
          >
            {/* Time Series Chart */}
            <div className={`${isCompactMode ? "" : "col-span-8"} h-full`}>
              <Card className="overflow-hidden h-full flex flex-col">
                <div
                  className={`${isCompactMode ? "p-3" : "p-4"} border-b bg-muted/30`}
                >
                  <h3
                    className={`font-semibold text-foreground flex items-center gap-2 ${isCompactMode ? "text-sm" : ""}`}
                  >
                    <TrendingUp
                      className={`${isCompactMode ? "w-3 h-3" : "w-4 h-4"} text-primary`}
                    />
                    Time Series Comparison
                  </h3>
                  {!isCompactMode && (
                    <p className="text-sm text-muted-foreground mt-1">
                      {data.selectedVar1 && data.selectedVar2
                        ? `Visualize how ${data.selectedVar1} and ${data.selectedVar2} change over time`
                        : "Click on a heatmap cell to compare variables over time"}
                    </p>
                  )}
                </div>
                <div className={`${isCompactMode ? "p-4" : "p-6"} flex-1`}>
                  <svg
                    ref={timeSeriesRef}
                    width="100%"
                    height={isCompactMode ? "150" : "300"}
                    className="w-full"
                  ></svg>
                </div>
              </Card>
            </div>

            {/* Analysis Setup */}
            <div className={`${isCompactMode ? "" : "col-span-4"} h-full`}>
              <Card className="overflow-hidden h-full flex flex-col">
                <div
                  className={`${isCompactMode ? "p-2" : "p-4"} border-b bg-muted/30`}
                >
                  <h3
                    className={`font-semibold text-foreground flex items-center gap-2 ${isCompactMode ? "text-sm" : ""}`}
                  >
                    <BarChart3
                      className={`${isCompactMode ? "w-3 h-3" : "w-4 h-4"} text-primary`}
                    />
                    Analysis Setup
                  </h3>
                </div>
                <div
                  className={`${isCompactMode ? "p-3 space-y-2" : "p-4 space-y-4"} flex-1`}
                >
                  {/* Correlation Result */}
                  <div
                    className={`bg-muted/50 rounded-lg ${isCompactMode ? "p-3" : "p-4"} border`}
                  >
                    <div className="text-center">
                      <div
                        className={`font-bold text-foreground mb-1 ${isCompactMode ? "text-lg" : "text-2xl"}`}
                      >
                        {getCorrelationValue() !== null
                          ? getCorrelationValue().toFixed(3)
                          : "---"}
                      </div>
                      <div
                        className={`text-muted-foreground ${isCompactMode ? "text-xs" : "text-sm"}`}
                      >
                        Correlation Coefficient
                      </div>
                      {getCorrelationValue() !== null ? (
                        <Badge
                          variant={
                            Math.abs(getCorrelationValue()) > 0.7
                              ? "destructive"
                              : Math.abs(getCorrelationValue()) > 0.3
                                ? "default"
                                : "secondary"
                          }
                          className="mt-2"
                        >
                          {Math.abs(getCorrelationValue()) > 0.7
                            ? "Strong"
                            : Math.abs(getCorrelationValue()) > 0.3
                              ? "Moderate"
                              : "Weak"}{" "}
                          Correlation
                        </Badge>
                      ) : (
                        <Badge variant="outline" className="mt-2">
                          No Variables Selected
                        </Badge>
                      )}
                    </div>
                  </div>

                  {/* Current Analysis */}
                  <div className="space-y-2">
                    <div
                      className={`text-muted-foreground ${isCompactMode ? "text-xs" : "text-sm"}`}
                    >
                      Current Analysis:
                    </div>
                    {data.selectedVar1 && data.selectedVar2 ? (
                      <div
                        className={`text-foreground ${isCompactMode ? "text-sm" : ""}`}
                      >
                        <span className="font-medium">{data.selectedVar1}</span>
                        <span className="text-muted-foreground mx-2">vs</span>
                        <span className="font-medium">{data.selectedVar2}</span>
                      </div>
                    ) : (
                      <div
                        className={`text-muted-foreground italic ${isCompactMode ? "text-sm" : ""}`}
                      >
                        No variables selected. Click a heatmap cell to analyze
                        correlation.
                      </div>
                    )}
                  </div>
                </div>
              </Card>
            </div>
          </div>
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
