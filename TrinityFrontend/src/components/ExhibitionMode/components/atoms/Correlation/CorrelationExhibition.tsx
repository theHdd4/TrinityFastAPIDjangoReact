import React, { useEffect, useRef, useMemo, useState } from 'react';
import * as d3 from 'd3';
import { Badge } from '@/components/ui/badge';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Checkbox } from '@/components/ui/checkbox';
import { Button } from '@/components/ui/button';
import { Loader2 } from 'lucide-react';
import { CorrelationExhibitionProps } from './types';
import { formatCorrelationValue } from './shared';
import { correlationAPI } from '@/components/AtomList/atoms/correlation/helpers/correlationAPI';
import MatrixSettingsTray, { MatrixSettings } from '@/components/AtomList/atoms/correlation/components/MatrixSettingsTray';
import TimeSeriesPopup from './TimeSeriesPopup';
import { useIsMobile } from '@/hooks/use-mobile';

// Color themes from Lab Mode
export const COLOR_THEMES: Record<string, { name: string; primary: string; secondary: string; tertiary: string; }> = {
  default: {
    name: 'Default',
    primary: '#41C185', // Trinity green
    secondary: '#458EE2', // Trinity blue
    tertiary: '#E0E7FF',
  },
  multicolor: {
    name: 'Multicolor 1',
    primary: '#6366f1',
    secondary: '#FF8042',
    tertiary: '#FFBB28',
  },
  blue: {
    name: 'Blue',
    primary: '#3b82f6',
    secondary: '#60a5fa',
    tertiary: '#dbeafe',
  },
  green: {
    name: 'Green',
    primary: '#10b981',
    secondary: '#6ee7b7',
    tertiary: '#d1fae5',
  },
  purple: {
    name: 'Purple',
    primary: '#8b5cf6',
    secondary: '#c4b5fd',
    tertiary: '#ede9fe',
  },
  orange: {
    name: 'Orange',
    primary: '#f59e0b',
    secondary: '#fcd34d',
    tertiary: '#fef3c7',
  },
  red: {
    name: 'Red',
    primary: '#ef4444',
    secondary: '#f87171',
    tertiary: '#fecaca',
  },
  teal: {
    name: 'Teal',
    primary: '#14b8a6',
    secondary: '#5eead4',
    tertiary: '#ccfbf1',
  },
  pink: {
    name: 'Pink',
    primary: '#ec4899',
    secondary: '#f9a8d4',
    tertiary: '#fce7f3',
  },
  gray: {
    name: 'Gray',
    primary: '#6b7280',
    secondary: '#9ca3af',
    tertiary: '#f3f4f6',
  },
  yellow: {
    name: 'Yellow',
    primary: '#facc15',
    secondary: '#fde047',
    tertiary: '#fef9c3',
  },
};

const FONT_FAMILY = 'Inter, system-ui, -apple-system, sans-serif';

// FilterMenu component (copied from ChartMaker)
const FilterMenu = ({ 
  column, 
  uniqueValues, 
  current, 
  onColumnFilter,
  disabled = false
}: { 
  column: string;
  uniqueValues: string[];
  current: string[];
  onColumnFilter: (column: string, values: string[]) => void;
  disabled?: boolean;
}) => {
  const [temp, setTemp] = useState<string[]>(current);

  useEffect(() => {
    setTemp(current);
  }, [current]);

  const toggleVal = (val: string) => {
    setTemp(prev => (prev.includes(val) ? prev.filter(v => v !== val) : [...prev, val]));
  };

  const selectAll = () => {
    setTemp(temp.length === uniqueValues.length ? [] : uniqueValues);
  };

  const apply = () => {
    onColumnFilter(column, temp);
  };

  const cancel = () => {
    setTemp(current);
  };

  if (uniqueValues.length === 0) {
    return (
      <div className="w-64 p-4 text-sm text-muted-foreground">
        No values available for this column.
      </div>
    );
  }

  return (
    <div className="w-64 max-h-80 overflow-y-auto">
      <div className="p-2 border-b border-white/10">
        <div className="flex items-center space-x-2 mb-2">
          <Checkbox 
            checked={temp.length === uniqueValues.length && uniqueValues.length > 0} 
            onCheckedChange={selectAll}
            className="border-white/30"
          />
          <span className="text-sm font-medium text-white/90">Select All</span>
        </div>
      </div>
      <div className="p-2 space-y-1 max-h-60 overflow-y-auto">
        {uniqueValues.map((v, i) => (
          <div key={i} className="flex items-center space-x-2">
            <Checkbox 
              checked={temp.includes(v)} 
              onCheckedChange={() => !disabled && toggleVal(v)}
              className="border-white/30"
              disabled={disabled}
            />
            <span className="text-sm text-white/90">{v}</span>
          </div>
        ))}
      </div>
      <div className="p-2 border-t border-white/10 flex space-x-2">
        <Button size="sm" onClick={apply} className="flex-1" disabled={disabled}>
          Apply
        </Button>
        <Button 
          size="sm" 
          variant="outline" 
          onClick={cancel} 
          className="flex-1 border-white/20 text-black hover:bg-white/10 bg-white/90" 
          disabled={disabled}
        >
          Cancel
        </Button>
      </div>
    </div>
  );
};

// Interactive filter tabs (copied from ChartMaker)
const InteractiveFilterTabs = ({ 
  filters, 
  uniqueValuesByColumn,
  onFilterChange,
  disabled = false
}: { 
  filters: Record<string, string[]>;
  uniqueValuesByColumn: Record<string, string[]>;
  onFilterChange: (column: string, values: string[]) => void;
  disabled?: boolean;
}) => {
  const activeFilters = Object.keys(filters).filter(col => 
    filters[col] && Array.isArray(filters[col]) && filters[col].length > 0
  );

  if (activeFilters.length === 0) {
    return null;
  }

  return (
    <div className="flex flex-wrap gap-2 mb-4">
      {activeFilters.map((column) => {
        const selectedValues = filters[column] || [];
        const uniqueValues = uniqueValuesByColumn[column] || [];
        const allSelected = selectedValues.length === uniqueValues.length && uniqueValues.length > 0;
        
        return (
          <Popover key={column}>
            <PopoverTrigger asChild>
              <button 
                className={`px-4 py-1.5 bg-gradient-to-r from-blue-500/20 via-purple-500/20 to-blue-500/20 border border-blue-400/30 dark:border-purple-400/30 rounded-full text-sm font-medium text-blue-700 dark:text-purple-300 backdrop-blur-sm transition-colors ${
                  disabled 
                    ? 'opacity-50 cursor-not-allowed' 
                    : 'hover:border-blue-500/50 dark:hover:border-purple-500/50 cursor-pointer'
                }`}
                disabled={disabled}
              >
                {column} {allSelected ? '(All)' : `(${selectedValues.length} selected)`}
              </button>
            </PopoverTrigger>
            <PopoverContent className="w-auto p-0 bg-slate-900/95 border-white/20 backdrop-blur-sm" align="start">
              <FilterMenu 
                column={column}
                uniqueValues={uniqueValues}
                current={selectedValues}
                onColumnFilter={onFilterChange}
                disabled={disabled}
              />
            </PopoverContent>
          </Popover>
        );
      })}
    </div>
  );
};

const CorrelationExhibition: React.FC<CorrelationExhibitionProps> = ({ data, variant = 'full' }) => {
  const heatmapRef = useRef<SVGSVGElement>(null);
  const prevMatrixRef = useRef<string>('');
  const [canvasWidth, setCanvasWidth] = useState(0);
  const isMobile = useIsMobile();
  const [localFilters, setLocalFilters] = useState<Record<string, string[]>>(data.filterDimensions || {});
  const [uniqueValuesByColumn, setUniqueValuesByColumn] = useState<Record<string, string[]>>({});
  const [isRegenerating, setIsRegenerating] = useState(false);
  const [correlationData, setCorrelationData] = useState({
    matrix: data.correlationMatrix || [],
    variables: data.variables || [],
  });

  // Matrix settings state (for right-click menu)
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [settingsPosition, setSettingsPosition] = useState<{ x: number; y: number } | null>(null);
  const [matrixSettings, setMatrixSettings] = useState<MatrixSettings>(
    data.matrixSettings || {
      theme: 'default',
      showAxisLabels: true,
      showDataLabels: true,
      showLegend: true,
      showGrid: true,
    }
  );

  // Time Series Modal state
  const [timeSeriesModalOpen, setTimeSeriesModalOpen] = useState(false);
  const [timeSeriesLoading, setTimeSeriesLoading] = useState(false);
  const [selectedVariables, setSelectedVariables] = useState<{
    var1: string;
    var2: string;
    correlation: number;
  } | null>(null);
  const [timeSeriesData, setTimeSeriesData] = useState<Array<{ date: number; var1Value: number; var2Value: number }> | null>(null);
  const [isDateAxis, setIsDateAxis] = useState(false);
  
  // Popup positioning state
  const [popupPosition, setPopupPosition] = useState<{ top: number; left: number } | null>(null);
  const [selectedCellPosition, setSelectedCellPosition] = useState<{ x: number; y: number; width: number; height: number } | null>(null);

  // Determine compact mode
  const isCompactMode = variant === 'compact';

  // Debug: Check filter status on mount and updates
  useEffect(() => {
    console.log('🔍 Correlation Filters Debug:', {
      fromData: data.filterDimensions,
      localFilters: localFilters,
      filterCount: Object.keys(localFilters).length,
      filterKeys: Object.keys(localFilters),
      uniqueValuesByColumn: uniqueValuesByColumn,
    });
  }, [data.filterDimensions, localFilters, uniqueValuesByColumn]);

  // Load unique values for filter dropdowns
  useEffect(() => {
    const loadUniqueValues = async () => {
      if (!data.fileData?.columnValues) {
        // Try to load from selectedFile if available
        if (data.selectedFile || data.filteredFilePath) {
          try {
            const filePath = data.filteredFilePath || data.selectedFile;
            // Load column values for all filter columns
            const filterColumns = Object.keys(localFilters);
            const values: Record<string, string[]> = {};
            
            for (const column of filterColumns) {
              try {
                const response = await correlationAPI.getColumnValues(filePath!, column, 1000);
                values[column] = response.values || [];
              } catch (err) {
                console.error(`Failed to load values for ${column}:`, err);
                values[column] = localFilters[column] || [];
              }
            }
            
            setUniqueValuesByColumn(values);
          } catch (err) {
            console.error('Failed to load unique values:', err);
          }
        }
      } else {
        setUniqueValuesByColumn(data.fileData.columnValues);
      }
    };

    loadUniqueValues();
  }, [data.selectedFile, data.filteredFilePath, data.fileData?.columnValues, localFilters]);

  // Fetch time series data for two variables
  const fetchTimeSeriesData = async (
    var1: string,
    var2: string,
    startDate?: string,
    endDate?: string,
  ): Promise<{ data: Array<{ date: number; var1Value: number; var2Value: number }>; isDate: boolean }> => {
    const filePath = data.filteredFilePath || data.selectedFile;
    if (!filePath) {
      return { data: [], isDate: false };
    }

    try {
      // 1. Get axis data (datetime or indices)
      const axisData = await correlationAPI.getTimeSeriesAxis(
        filePath,
        startDate,
        endDate,
      );
      const isDate = axisData.has_datetime;

      // 2. Get Y-values for the selected columns
      const seriesRequest = {
        column1: var1,
        column2: var2,
        start_date: startDate,
        end_date: endDate,
        datetime_column: axisData.datetime_column,
      };

      const seriesData = await correlationAPI.getTimeSeriesData(
        filePath,
        seriesRequest,
      );

      // 3. Transform to chart format
      const chartData = axisData.x_values
        .map((x: any, index: number) => {
          const v1Raw = seriesData.column1_values[index];
          const v2Raw = seriesData.column2_values[index];
          if (v1Raw === undefined || v1Raw === null || v2Raw === undefined || v2Raw === null) return null;
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
      console.error('Failed to fetch time series data:', error);
      return { data: [], isDate: false };
    }
  };

  // Handle filter change and regenerate matrix
  const handleFilterChange = async (column: string, values: string[]) => {
    const newFilters = { ...localFilters, [column]: values };
    setLocalFilters(newFilters);
    setIsRegenerating(true);

    try {
      const filePath = data.filteredFilePath || data.selectedFile;
      if (!filePath) {
        console.error('No file path available for correlation');
        setIsRegenerating(false);
        return;
      }

      // Call correlation API with new filters
      const result = await correlationAPI.filterAndCorrelate({
        file_path: filePath,
        filter_dimensions: newFilters,
        correlation_method: 'pearson',
      });

      if (result && result.correlation_matrix) {
        const resultVariables = result.columns_used || [];
        
        // Transform correlation matrix if it's in dictionary format
        let matrix: number[][] = [];
        if (typeof result.correlation_matrix === 'object' && !Array.isArray(result.correlation_matrix)) {
          matrix = resultVariables.map((rowVar: string) => {
            const rowData = result.correlation_matrix[rowVar];
            return resultVariables.map((colVar: string) => {
              if (rowVar === colVar) return 1.0;
              const value = rowData[colVar];
              return typeof value === 'number' && isFinite(value) ? value : 0.0;
            });
          });
        } else {
          matrix = result.correlation_matrix;
        }

        setCorrelationData({
          matrix,
          variables: resultVariables,
        });
      }
    } catch (err) {
      console.error('Failed to regenerate correlation:', err);
    } finally {
      setIsRegenerating(false);
    }
  };

  // Handle cell click to show time series popup
  const handleCellClick = async (var1: string, var2: string, correlation: number, cellData: any, event: any) => {
    setSelectedVariables({ var1, var2, correlation });
    setTimeSeriesModalOpen(true);
    setTimeSeriesLoading(true);
    setTimeSeriesData(null);

    // Calculate popup position based on cell location
    if (heatmapRef.current) {
      if (isMobile) {
        // MOBILE: Fixed positioning at top of viewport
        // Simple and always visible - user can scroll matrix behind it
        setPopupPosition({ 
          top: 80,  // Below any header
          left: 10,
        });
        // No need to track cell position on mobile
        setSelectedCellPosition(null);
      } else {
        // DESKTOP: Original relative positioning logic
        const svgRect = heatmapRef.current.getBoundingClientRect();
        const svgParent = heatmapRef.current.parentElement;
        const parentRect = svgParent ? svgParent.getBoundingClientRect() : svgRect;
        
        const margin = { top: 130, right: 60, bottom: 200, left: 200 };
        
        // Calculate cell dimensions
        const containerWidth = canvasWidth || 900;
        const width = containerWidth - margin.left - margin.right;
        const allVariables = currentVariables || [];
        let filteredBySelection = allVariables;
        if (data.selectedNumericColumnsForMatrix && data.selectedNumericColumnsForMatrix.length > 0) {
          filteredBySelection = allVariables.filter(v => data.selectedNumericColumnsForMatrix!.includes(v));
        }
        const variables = getFilteredVariables(filteredBySelection, currentMatrix);
        const baseHeight = isCompactMode ? 300 : 550;
        const cellWidth = Math.max(width / variables.length, 60);
        const cellHeight = Math.max(baseHeight / variables.length, 60);
        
        // Cell position within SVG
        const cellX = cellData.x * cellWidth;
        const cellY = cellData.y * cellHeight;
        
        // Position RELATIVE to the parent container (for absolute positioning)
        const svgOffsetLeft = svgRect.left - parentRect.left;
        const svgOffsetTop = svgRect.top - parentRect.top;
        
        const popupWidth = 800;
        const popupHeight = 390;
        
        // Calculate position relative to parent (not window)
        let top = svgOffsetTop + margin.top + cellY + cellHeight + 20;
        let left = svgOffsetLeft + margin.left + cellX;
        
        // Adjust if popup would go off visible area
        const parentWidth = svgParent?.clientWidth || window.innerWidth;
        if (left + popupWidth > parentWidth) {
          left = Math.max(0, parentWidth - popupWidth - 20);
        }
        
        setPopupPosition({ top, left });
        setSelectedCellPosition({
          x: svgOffsetLeft + margin.left + cellX,
          y: svgOffsetTop + margin.top + cellY,
          width: cellWidth,
          height: cellHeight,
        });
      }
    }

    try {
      const result = await fetchTimeSeriesData(var1, var2);
      setTimeSeriesData(result.data);
      setIsDateAxis(result.isDate);
    } catch (err) {
      console.error('Failed to load time series:', err);
      setTimeSeriesData([]);
    } finally {
      setTimeSeriesLoading(false);
    }
  };

  // Close time series popup
  const closeTimeSeries = () => {
    setTimeSeriesModalOpen(false);
    setPopupPosition(null);
    setSelectedCellPosition(null);
    
    // Reset cell highlighting via D3
    if (heatmapRef.current) {
      const svg = d3.select(heatmapRef.current);
      svg.selectAll(".correlation-cell")
        .style("filter", "drop-shadow(0 2px 6px rgba(0,0,0,0.15))")
        .style("opacity", 1);
      svg.selectAll(".correlation-text").style("opacity", 1);
      svg.selectAll(".x-label, .y-label, .top-label").style("opacity", 1);
    }
  };

  // Right-click context menu handler
  const handleMatrixContextMenu = (e: React.MouseEvent) => {
    e.preventDefault();
    
    // MOBILE-ONLY: Adaptive menu sizing and positioning
    // Desktop keeps original 240x200 sizing
    const viewportWidth = window.innerWidth;
    const viewportHeight = window.innerHeight;
    const padding = 10;
    
    const menuWidth = isMobile 
      ? Math.min(170, viewportWidth - (padding * 2))  // Mobile: compact 170px (was 200px)
      : 240; // Desktop: unchanged
    
    const menuHeight = isMobile
      ? Math.min(220, viewportHeight - (padding * 2)) // Mobile: compact (was 240px)
      : 200; // Desktop: unchanged
    
    let x = e.clientX;
    let y = e.clientY;
    
    if (isMobile) {
      // MOBILE-ONLY: Enhanced boundary detection with padding
      const maxX = viewportWidth - menuWidth - padding;
      const maxY = viewportHeight - menuHeight - padding;
      
      // Clamp to safe viewport bounds
      x = Math.max(padding, Math.min(x, maxX));
      y = Math.max(padding, Math.min(y, maxY));
      
      // Smart positioning: if tap is on right side, position menu to the left
      if (e.clientX > viewportWidth / 2) {
        x = Math.max(padding, e.clientX - menuWidth);
      }
      // If tap is near bottom, position menu above
      if (e.clientY > viewportHeight * 0.7) {
        y = Math.max(padding, e.clientY - menuHeight);
      }
    } else {
      // DESKTOP: Keep original simple boundary check (unchanged)
      if (window.innerWidth - x < menuWidth) {
        x = window.innerWidth - menuWidth;
      }
      if (window.innerHeight - y < menuHeight) {
        y = window.innerHeight - menuHeight;
      }
    }
    
    setSettingsPosition({ x, y });
    setSettingsOpen(true);
  };

  // Handle settings save
  const handleSaveSettings = (newSettings: MatrixSettings) => {
    setMatrixSettings(newSettings);
    setSettingsOpen(false);
    setSettingsPosition(null);
    
    // Save to localStorage for persistence
    try {
      localStorage.setItem('correlation-exhibition-settings', JSON.stringify(newSettings));
    } catch (err) {
      console.error('Failed to save settings:', err);
    }
  };

  // Load settings from localStorage on mount
  useEffect(() => {
    try {
      const saved = localStorage.getItem('correlation-exhibition-settings');
      if (saved) {
        const parsed = JSON.parse(saved);
        setMatrixSettings(prev => ({ ...prev, ...parsed }));
      }
    } catch (err) {
      console.error('Failed to load settings:', err);
    }
  }, []);

  // Update canvas width on mount and resize
  useEffect(() => {
    const updateWidth = () => {
      if (heatmapRef.current?.parentElement) {
        setCanvasWidth(heatmapRef.current.parentElement.clientWidth);
      }
    };

    updateWidth();
    window.addEventListener('resize', updateWidth);
    return () => window.removeEventListener('resize', updateWidth);
  }, []);

  // Helper function to filter variables (same as Lab Mode)
  const getFilteredVariables = (
    variables: string[],
    correlationMatrix: number[][],
  ) => {
    const safeVariables = variables || [];

    if (data.showAllColumns) {
      return safeVariables;
    }

    return safeVariables.filter((variable, index) => {
      if (!correlationMatrix || !correlationMatrix[index]) return true;

      // Check if this variable has any meaningful correlation with other variables
      const hasOtherCorrelations = correlationMatrix[index].some(
        (correlation, corrIndex) => {
          return corrIndex !== index && Math.abs(correlation) > 0.1;
        },
      );

      return hasOtherCorrelations;
    });
  };

  // Use correlation data from state (updated by filter changes) or initial data
  const currentMatrix = correlationData.matrix.length > 0 ? correlationData.matrix : (data.correlationMatrix || []);
  const currentVariables = correlationData.variables.length > 0 ? correlationData.variables : (data.variables || []);

  // Draw enhanced full-width correlation heatmap with Trinity styling (MOBILE ADAPTIVE)
  useEffect(() => {
    if (!heatmapRef.current || !currentMatrix || currentMatrix.length === 0) return;

    const dataKey = JSON.stringify({
      matrix: currentMatrix,
      variables: currentVariables,
      theme: matrixSettings.theme,
      filters: localFilters,
      isMobile,
    });
    const shouldAnimate = prevMatrixRef.current !== dataKey;
    prevMatrixRef.current = dataKey;

    const svg = d3.select(heatmapRef.current);
    svg.selectAll("*").remove();

    // Resolve variables
    const allVariables = currentVariables || [];
    
    // CORRECTED ORDER: Apply ALL filtering logic FIRST (same for desktop and mobile)
    
    // Step 1: Filter by selected numeric columns if specified
    let filteredBySelection = allVariables;
    if (data.selectedNumericColumnsForMatrix && data.selectedNumericColumnsForMatrix.length > 0) {
      filteredBySelection = allVariables.filter(v => data.selectedNumericColumnsForMatrix!.includes(v));
    }
    
    // Step 2: Filter out variables with no meaningful correlations
    // This is what DESKTOP would show (the "desktop count")
    const filteredVariables = getFilteredVariables(
      filteredBySelection,
      currentMatrix,
    );
    
    // PHASE 1: INTELLIGENT DATA LIMITING (Mobile Only)
    // AFTER filtering, limit to top 10 on mobile if needed
    const desktopCount = filteredVariables.length; // What desktop shows
    let displayVariables = filteredVariables;
    
    if (isMobile && filteredVariables.length > 10) {
      displayVariables = filteredVariables.slice(0, 10);
    }
    
    const mobileCount = displayVariables.length; // What mobile shows
    const isMobileLimited = isMobile && desktopCount > 10;
    
    // Final variables to render
    const variables = displayVariables;

    // PHASE 2: DYNAMIC LABEL ORIENTATION
    // Calculate label strategy based on displayed item count
    const displayCount = variables.length;
    const useDiagonalLabels = isMobile && displayCount > 5;
    const labelRotation = useDiagonalLabels ? -45 : 0;
    const textAnchor = useDiagonalLabels ? "end" : "middle";

    // Determine container width for responsive layout
    const containerWidth = (canvasWidth || 900);
    
    // PHASE 3: MOBILE-ADAPTIVE MARGINS
    const margin = isMobile 
      ? { 
          top: 80, 
          right: 20, 
          bottom: useDiagonalLabels ? 150 : 120,  // Increased to fit legend
          left: 80 
        }
      : { top: 130, right: 60, bottom: 200, left: 200 };
    
    const width = containerWidth - margin.left - margin.right;

    const g = svg
      .append("g")
      .attr("transform", `translate(${margin.left},${margin.top})`);

    // PHASE 3: FLUID TYPOGRAPHY - Calculate cell dimensions
    let cellWidth: number;
    let cellHeight: number;
    let actualWidth: number;
    let actualHeight: number;

    if (isMobile) {
      // MOBILE: Fluid sizing - scale naturally with viewport
      cellWidth = width / variables.length;
      cellHeight = cellWidth; // Perfect squares
      actualWidth = cellWidth * variables.length;
      actualHeight = actualWidth; // Square matrix
    } else {
      // DESKTOP: Original logic (unchanged)
      const baseHeight = isCompactMode ? 300 : 550;
      const minCellSize = 60;
      cellWidth = Math.max(width / variables.length, minCellSize);
      cellHeight = Math.max(baseHeight / variables.length, minCellSize);
      actualWidth = cellWidth * variables.length;
      actualHeight = cellHeight * variables.length;
    }

    // Store accurate counts for smart footer note
    // desktopCount = what desktop would show (after all filtering)
    // mobileCount = what mobile shows (after filtering + limiting)
    svg.attr('data-desktop-count', desktopCount.toString());
    svg.attr('data-mobile-count', mobileCount.toString());
    svg.attr('data-is-limited', isMobileLimited ? 'true' : 'false');

    // PHASE 4: Ensure no horizontal scroll on mobile
    const svgWidth = isMobile 
      ? canvasWidth  // Exact fit to viewport
      : actualWidth + margin.left + margin.right;
    
    svg
      .attr("width", svgWidth)
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

    // PHASE 4: Background grid (hide on mobile for cleaner look)
    if (!isMobile && matrixSettings.showGrid) {
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
    }

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
          currentMatrix &&
          Array.isArray(currentMatrix) &&
          originalYIndex >= 0 &&
          originalXIndex >= 0 &&
          currentMatrix[originalYIndex] &&
          currentMatrix[originalYIndex][originalXIndex] !== undefined
        ) {
          const value = currentMatrix[originalYIndex][originalXIndex];
          correlation =
            typeof value === "number" && isFinite(value) ? value : 0;
        }
        cellData.push({ x: j, y: i, xVar, yVar, correlation });
      });
    });

    // PHASE 4: Maximize cell fill on mobile
    const cellPadding = isMobile ? 0.5 : 2;
    
    const cells = g
      .selectAll(".correlation-cell")
      .data(cellData)
      .enter()
      .append("rect")
      .attr("class", "correlation-cell")
      .attr("x", (d) => d.x * cellWidth + cellPadding)
      .attr("y", (d) => d.y * cellHeight + cellPadding)
      .attr("width", shouldAnimate ? 0 : cellWidth - (cellPadding * 2))
      .attr("height", shouldAnimate ? 0 : cellHeight - (cellPadding * 2))
      .attr("fill", (d) => colorScale(d.correlation))
      .attr("stroke", "#ffffff")
      .attr("stroke-width", isMobile ? 1 : 2)
      .attr("rx", isMobile ? 3 : 6)
      .attr("ry", isMobile ? 3 : 6)
      .style("cursor", "pointer")
      .style("filter", "drop-shadow(0 2px 6px rgba(0,0,0,0.15))")
      .on("mouseover", function (event, d) {
        // Skip hover tooltips on mobile - they interfere with tap interactions
        if (isMobile) return;
        
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
        // Skip hover tooltip cleanup on mobile
        if (isMobile) return;
        
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

        // Open time series popup with selected variables and position
        handleCellClick(d.yVar, d.xVar, d.correlation, d, event);
      });

    // Animate cells only when data changes
    if (shouldAnimate) {
      cells
        .transition()
        .duration(800)
        .delay((_, i) => i * 30)
        .ease(d3.easeBounceOut)
        .attr("width", cellWidth - (cellPadding * 2))
        .attr("height", cellHeight - (cellPadding * 2));
    }

    // PHASE 3: FLUID TYPOGRAPHY FOR CORRELATION VALUES (THE PRIORITY)
    if (matrixSettings.showDataLabels) {
      // Calculate proportional font size
      let fontSize: number;
      
      if (isMobile) {
        // MOBILE: Fluid typography - scales with cell size
        // Formula: cellWidth * 0.27, bounded between 9px and 18px
        // Adjusted for better readability at 6+ variables
        const dynamicFontSize = Math.max(9, Math.min(18, cellWidth * 0.27));
        fontSize = dynamicFontSize;
      } else {
        // DESKTOP: Original formula (unchanged)
        fontSize = Math.max(10, Math.min(Math.min(cellWidth, cellHeight) / 3.5, 16));
      }
      
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
        .attr("font-size", `${fontSize}px`)
        .attr("font-weight", "700")
        .attr("letter-spacing", isMobile ? "-0.05em" : "normal") // tracking-tighter on mobile
        .attr("fill", isMobile ? "rgba(255, 255, 255, 0.85)" : "#ffffff")
        .attr("stroke", isMobile ? "rgba(0, 0, 0, 0.6)" : "#000000")
        .attr("stroke-width", isMobile ? 0.8 : 1.5)
        .style("paint-order", "stroke")
        .style("pointer-events", "none")
        .style("opacity", shouldAnimate ? 0 : 1)
        .text((d) => d.correlation.toFixed(2));
      if (shouldAnimate) {
        textElements.transition().duration(600).delay(1000).style("opacity", 1);
      }
    }

    // Helper function to truncate text
    const truncateText = (text: string, maxLength: number = 15): string => {
      if (text.length <= maxLength) return text;
      return text.substring(0, maxLength) + "...";
    };

    // PHASE 2 & 3: Axis labels with dynamic orientation and proportional fonts
    if (matrixSettings.showAxisLabels) {
      // Calculate proportional font size for axis labels
      // Reduced scaling factor for better readability at 6+ variables
      const axisLabelSize = isMobile 
        ? Math.max(7, Math.min(10, cellWidth * 0.20))  // Scales with cell
        : 14;

      // Mobile-adaptive label offsets - tighter spacing for small fonts
      const xLabelOffset = isMobile 
        ? (useDiagonalLabels ? 25 : 15)  // Tight on mobile
        : (useDiagonalLabels ? 60 : 50); // Desktop unchanged
      
      const topLabelOffset = isMobile
        ? (useDiagonalLabels ? 25 : 15)  // Tight on mobile
        : (useDiagonalLabels ? 60 : 50); // Desktop unchanged

      const xLabels = g
        .selectAll(".x-label")
        .data(variables)
        .enter()
        .append("text")
        .attr("class", "x-label")
        .attr("x", (_, i) => {
          return i * cellWidth + cellWidth / 2;
        })
        .attr("y", actualHeight + xLabelOffset)
        .attr("text-anchor", textAnchor)
        .attr("dominant-baseline", "hanging")
        .attr("font-size", `${axisLabelSize}px`)
        .attr("font-weight", "600")
        .attr("fill", isMobile ? "rgba(255, 255, 255, 0.90)" : "rgba(255, 255, 255, 0.95)")
        .attr(
          "transform",
          (_, i) => {
            const centerX = i * cellWidth + cellWidth / 2;
            const yPos = actualHeight + xLabelOffset;
            return `rotate(${labelRotation}, ${centerX}, ${yPos})`;
          }
        )
        .style("font-style", "italic")
        .style("opacity", shouldAnimate ? 0 : 1)
        .style("cursor", "pointer")
        .text((d) => truncateText(d, isMobile ? 8 : 15))
        .each(function(d) {
          d3.select(this).append("title").text(d);
        });
      if (shouldAnimate) {
        xLabels.transition().duration(600).delay(1200).style("opacity", 1);
      }

      // Top labels (same orientation as bottom labels)
      const topLabels = g
        .selectAll(".top-label")
        .data(variables)
        .enter()
        .append("text")
        .attr("class", "top-label")
        .attr("x", (_, i) => {
          return i * cellWidth + cellWidth / 2;
        })
        .attr("y", -topLabelOffset)
        .attr("text-anchor", textAnchor)
        .attr("dominant-baseline", "baseline")
        .attr("font-size", `${axisLabelSize}px`)
        .attr("font-weight", "600")
        .attr("fill", isMobile ? "rgba(255, 255, 255, 0.90)" : "rgba(255, 255, 255, 0.95)")
        .attr(
          "transform",
          (_, i) => {
            const centerX = i * cellWidth + cellWidth / 2;
            const yPos = -topLabelOffset;
            return `rotate(${labelRotation}, ${centerX}, ${yPos})`;
          }
        )
        .style("font-style", "italic")
        .style("opacity", shouldAnimate ? 0 : 1)
        .style("cursor", "pointer")
        .text((d) => truncateText(d, isMobile ? 8 : 15))
        .each(function(d) {
          d3.select(this).append("title").text(d);
        });
      if (shouldAnimate) {
        topLabels.transition().duration(600).delay(1200).style("opacity", 1);
      }

      const yLabels = g
        .selectAll(".y-label")
        .data(variables)
        .enter()
        .append("text")
        .attr("class", "y-label")
        .attr("x", -20)
        .attr("text-anchor", "end")
        .attr("dominant-baseline", "middle")
        .attr("font-size", `${axisLabelSize}px`)
        .attr("font-weight", "600")
        .attr("fill", isMobile ? "rgba(255, 255, 255, 0.90)" : "rgba(255, 255, 255, 0.95)")
        .style("font-style", "italic")
        .style("opacity", shouldAnimate ? 0 : 1)
        .style("cursor", "pointer");
      yLabels.each(function (d, i) {
        const fullText = String(d);
        const maxLength = isMobile ? 8 : 15;
        const truncatedText = truncateText(fullText, maxLength);
        const words = truncatedText.replace(/_/g, " ").split(/\s+/);
        const lineHeight = isMobile ? 9 : 14;
        const text = d3.select(this);
        const yPos = i * cellHeight + cellHeight / 2 - ((words.length - 1) * lineHeight) / 2;
        text.attr("y", yPos);
        text.text(null);
        words.forEach((word, idx) => {
          text
            .append("tspan")
            .attr("x", -20)
            .attr("dy", idx === 0 ? 0 : lineHeight)
            .text(word);
        });
        text.append("title").text(fullText);
      });
      if (shouldAnimate) {
        yLabels.transition().duration(600).delay(1400).style("opacity", 1);
      }
    }

    // Color legend (with mobile-adaptive font sizes)
    if (matrixSettings.showLegend) {
      const legendWidth = Math.min(450, actualWidth);
      const legendHeight = isMobile ? 15 : 20;
      const legendFontSize = isMobile ? 10 : 12;
      // Adjusted legend offset to match tighter label positioning
      const legendOffset = isMobile 
        ? (useDiagonalLabels ? 80 : 65)  // Optimized for 25px label gap
        : 120;
      
      const legend = svg
        .append("g")
        .attr("class", "color-legend")
        .attr(
          "transform",
          `translate(${margin.left + (actualWidth - legendWidth) / 2}, ${margin.top + actualHeight + legendOffset})`,
        );

      const gradient = svg
        .append("defs")
        .append("linearGradient")
        .attr("id", "correlation-gradient-exhibition")
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
        .attr("fill", "url(#correlation-gradient-exhibition)")
        .attr("stroke", "hsl(var(--border))")
        .attr("stroke-width", 1)
        .attr("rx", 4);

      legend
        .append("text")
        .attr("x", 0)
        .attr("y", legendHeight + (isMobile ? 15 : 20))
        .attr("text-anchor", "start")
        .attr("font-size", `${legendFontSize}px`)
        .attr("font-weight", "600")
        .attr("fill", "rgba(255, 255, 255, 0.9)")
        .text(isMobile ? "+1" : "Strong Positive (+1)");

      legend
        .append("text")
        .attr("x", legendWidth / 2)
        .attr("y", legendHeight + (isMobile ? 15 : 20))
        .attr("text-anchor", "middle")
        .attr("font-size", `${legendFontSize}px`)
        .attr("font-weight", "600")
        .attr("fill", "rgba(255, 255, 255, 0.9)")
        .text(isMobile ? "0" : "No Correlation (0)");

      legend
        .append("text")
        .attr("x", legendWidth)
        .attr("y", legendHeight + (isMobile ? 15 : 20))
        .attr("text-anchor", "end")
        .attr("font-size", `${legendFontSize}px`)
        .attr("font-weight", "600")
        .attr("fill", "rgba(255, 255, 255, 0.9)")
        .text(isMobile ? "-1" : "Strong Negative (-1)");
    }
  }, [
    currentMatrix,
    currentVariables,
    data.showAllColumns,
    data.selectedNumericColumnsForMatrix,
    localFilters,
    isCompactMode,
    canvasWidth,
    matrixSettings,
    isMobile,
  ]);

  // Apply selective blur to cells when time series opens
  useEffect(() => {
    if (!heatmapRef.current) return;
    
    const svg = d3.select(heatmapRef.current);
    const allCells = svg.selectAll(".correlation-cell");
    const allTexts = svg.selectAll(".correlation-text");
    const allLabels = svg.selectAll(".x-label, .y-label, .top-label");
    
    if (timeSeriesModalOpen && selectedVariables) {
      // Apply blur to all cells except the selected one
      allCells.each(function(d: any) {
        const isSelected = selectedVariables.var1 === d.yVar && selectedVariables.var2 === d.xVar;
        
        d3.select(this)
          .transition()
          .duration(400)
          .style("filter", isSelected 
            ? "drop-shadow(0 8px 30px rgba(251, 191, 36, 0.8))"
            : "blur(2px)"
          )
          .style("opacity", isSelected ? 1 : 0.3);
      });
      
      // Blur correlation values
      allTexts.each(function(d: any) {
        const isSelected = selectedVariables.var1 === d.yVar && selectedVariables.var2 === d.xVar;
        d3.select(this)
          .transition()
          .duration(400)
          .style("opacity", isSelected ? 1 : 0.2);
      });
      
      // Blur axis labels
      allLabels
        .transition()
        .duration(400)
        .style("opacity", 0.3);
    } else {
      // Reset all to normal
      allCells
        .transition()
        .duration(400)
        .style("filter", "drop-shadow(0 2px 6px rgba(0,0,0,0.15))")
        .style("opacity", 1);
      
      allTexts
        .transition()
        .duration(400)
        .style("opacity", 1);
      
      allLabels
        .transition()
        .duration(400)
        .style("opacity", 1);
    }
  }, [timeSeriesModalOpen, selectedVariables]);

  // No data state
  if (!currentMatrix || !currentVariables || currentVariables.length === 0) {
    return (
      <div className="flex items-center justify-center p-12 bg-muted/30 rounded-lg">
        <p className="text-muted-foreground">No correlation data available</p>
      </div>
    );
  }

  return (
    <div className={`w-full relative ${isMobile ? 'px-0' : ''}`}>
      {/* Title - matching ChartMaker style */}
      <div className="text-left mb-4">
        <h3 className="text-lg sm:text-xl font-semibold text-white/95">
          Correlation
        </h3>
      </div>

      {/* Blur Overlay (when time series is open) - Click to close */}
      {timeSeriesModalOpen && (
        <div 
          className="fixed inset-0 bg-black/30 z-[100] transition-all duration-400"
          onClick={closeTimeSeries}
        />
      )}

      {/* Interactive Filter Tabs - ACTIVE (like ChartMaker) */}
      <div className={timeSeriesModalOpen ? 'opacity-30 blur-sm pointer-events-none transition-all duration-400' : 'transition-all duration-400'}>
        {localFilters && Object.keys(localFilters).length > 0 && (
          <div className="relative">
            {isRegenerating && (
              <div className="absolute inset-0 bg-slate-900/50 backdrop-blur-sm z-10 rounded-lg pointer-events-none" />
            )}
            <InteractiveFilterTabs 
              filters={localFilters}
              uniqueValuesByColumn={uniqueValuesByColumn}
              onFilterChange={handleFilterChange}
              disabled={isRegenerating}
            />
          </div>
        )}
      </div>

      {/* Correlation Matrix Heatmap - Direct render, NO square div background */}
      {/* Blur applied via D3 selectively to cells, not wrapper */}
      <div 
        className={`relative mb-4 ${isMobile ? 'overflow-hidden' : ''}`}
        onContextMenu={handleMatrixContextMenu}
      >
        {isRegenerating && (
          <div className="absolute inset-0 bg-slate-900/80 backdrop-blur-sm flex items-center justify-center z-10 rounded-lg">
            <div className="flex flex-col items-center gap-3">
              <Loader2 className="h-6 w-6 animate-spin text-blue-400" />
              <p className="text-sm text-white/70">Updating correlation matrix...</p>
            </div>
          </div>
        )}
        <svg ref={heatmapRef} className={`block mx-auto ${isMobile ? 'w-full' : ''}`}></svg>
      </div>

      {/* PHASE 1: Smart Footer Note - Shows mobile vs desktop count (after filtering) */}
      {isMobile && heatmapRef.current && (() => {
        const desktopCount = parseInt(heatmapRef.current.getAttribute('data-desktop-count') || '0');
        const mobileCount = parseInt(heatmapRef.current.getAttribute('data-mobile-count') || '0');
        const isLimited = heatmapRef.current.getAttribute('data-is-limited') === 'true';
        
        // Only show note if mobile is limited (desktop would show more)
        if (!isLimited) return null;
        
        return (
          <div className="text-xs text-white/60 text-center mt-2 mb-4 italic px-4">
            Showing {mobileCount} of {desktopCount} features on mobile (limited for readability).
            {' '}View full correlation matrix in dashboard mode to see all {desktopCount}.
          </div>
        );
      })()}

      {/* Matrix Settings Tray (Right-click menu) */}
      <MatrixSettingsTray
        open={settingsOpen}
        position={settingsPosition}
        onOpenChange={(open) => {
          setSettingsOpen(open);
          if (!open) setSettingsPosition(null);
        }}
        settings={matrixSettings}
        onSave={handleSaveSettings}
        isMobile={isMobile}
      />

      {/* Connection Line (from cell to popup) - Desktop only */}
      {!isMobile && timeSeriesModalOpen && selectedCellPosition && popupPosition && (
        <div 
          className="absolute z-[150] pointer-events-none transition-all duration-400"
          style={{
            top: `${selectedCellPosition.y + selectedCellPosition.height}px`,
            left: `${selectedCellPosition.x + selectedCellPosition.width / 2 - 1}px`,
            width: '2px',
            height: '20px',
            background: 'linear-gradient(to bottom, hsl(var(--trinity-yellow)), transparent)',
          }}
        />
      )}

      {/* Time Series Popup (Click cell - positioned below, sticky to cell) */}
      {timeSeriesModalOpen && popupPosition && (
        <TimeSeriesPopup
          var1={selectedVariables?.var1 || ''}
          var2={selectedVariables?.var2 || ''}
          correlation={selectedVariables?.correlation || 0}
          timeSeriesData={timeSeriesData}
          isDateAxis={isDateAxis}
          isLoading={timeSeriesLoading}
          theme={matrixSettings.theme}
          variant={variant}
          position={popupPosition}
          onClose={closeTimeSeries}
          isMobile={isMobile}
        />
      )}

      {/* Note section - if note exists and showNote is true */}
      {data.showNote && data.note && typeof data.note === 'string' && data.note.trim().length > 0 && (
        <div className="mt-4 pt-4 border-t border-white/10 px-4 pb-4">
          <div className="text-sm font-medium text-white/70 mb-2">Note:</div>
          <div className="text-sm text-white/60 whitespace-pre-wrap leading-relaxed">
            {data.note}
          </div>
        </div>
      )}
    </div>
  );
};

export default CorrelationExhibition;
