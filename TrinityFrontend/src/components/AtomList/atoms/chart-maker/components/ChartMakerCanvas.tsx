import React, { useState, useRef, useEffect, useCallback } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import RechartsChartRenderer from '@/templates/charts/RechartsChartRenderer';
import { useIsMobile } from '@/hooks/use-mobile';
import { BarChart3, TrendingUp, BarChart2, Triangle, Zap, Maximize2, ChevronDown, ChevronUp, ChevronLeft, ChevronRight, Filter, X, LineChart as LineChartIcon, PieChart as PieChartIcon, ArrowUp, ArrowDown, FilterIcon, Plus } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Checkbox } from '@/components/ui/checkbox';
import { Badge } from '@/components/ui/badge';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Label } from '@/components/ui/label';
import { ChartData, ChartMakerConfig, useLaboratoryStore, type ChartMakerExhibitionSelection, type ChartMakerExhibitionComponentType, type ChartMakerExhibitionSelectionChartState, type ChartMakerExhibitionSelectionContext } from '@/components/LaboratoryMode/store/laboratoryStore';
import './ChartMakerCanvas.css';
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group';
import { useResponsiveChartLayout } from '@/hooks/useResponsiveChartLayout';
import { migrateLegacyChart, DEFAULT_TRACE_COLORS } from '../utils/traceUtils';
import ChatBubble from './ChatBubble';
import AtomAIChatBot from '@/components/TrinityAI/AtomAIChatBot';
import { ContextMenu, ContextMenuContent, ContextMenuItem, ContextMenuSub, ContextMenuSubContent, ContextMenuSubTrigger, ContextMenuTrigger, ContextMenuSeparator } from '@/components/ui/context-menu';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';
import Table from '@/templates/tables/table';
import { MultiSelectDropdown } from '@/templates/dropdown';
import { CHART_MAKER_API } from '@/lib/api';
import { useToast } from '@/hooks/use-toast';
import { Input } from '@/components/ui/input';

// FilterMenu component moved outside to prevent recreation on every render
const FilterMenu = ({ 
  column, 
  uniqueValues, 
  current, 
  onColumnFilter 
}: { 
  column: string;
  uniqueValues: string[];
  current: string[];
  onColumnFilter: (column: string, values: string[]) => void;
}) => {
  const [temp, setTemp] = useState<string[]>(current);

  const toggleVal = (val: string) => {
    setTemp(prev => (prev.includes(val) ? prev.filter(v => v !== val) : [...prev, val]));
  };

  const selectAll = () => {
    setTemp(temp.length === uniqueValues.length ? [] : uniqueValues);
  };

  const apply = () => onColumnFilter(column, temp);

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

// Extend ChartData type to include uniqueValuesByColumn for type safety
interface ChartDataWithUniqueValues extends ChartData {
  uniqueValuesByColumn?: Record<string, string[]>;
}

interface ChartMakerCanvasProps {
  atomId: string;
  charts: ChartMakerConfig[];
  data: ChartData | null;
  onChartTypeChange?: (chartId: string, newType: ChartMakerConfig['type']) => void;
  onChartFilterChange?: (chartId: string, column: string, values: string[]) => void;
  onTraceFilterChange?: (chartId: string, traceIndex: number, column: string, values: string[]) => void;
  isFullWidthMode?: boolean; // When atom list and global properties tabs are hidden
}

const ChartMakerCanvas: React.FC<ChartMakerCanvasProps> = ({ atomId, charts, data, onChartTypeChange, onChartFilterChange, onTraceFilterChange, isFullWidthMode = false }) => {
  const typedData = data as ChartDataWithUniqueValues | null;
  const isMobile = useIsMobile();
  
  // Get dataSource and settings from store
  const atom = useLaboratoryStore(state => state.getAtom(atomId));
  const updateSettings = useLaboratoryStore(state => state.updateAtomSettings);
  const dataSource = (atom?.settings as any)?.dataSource;
  const numberOfCharts = (atom?.settings as any)?.numberOfCharts || 1;
  const { toast } = useToast();
  
  const [fullscreenChart, setFullscreenChart] = useState<ChartMakerConfig | null>(null);
  const [fullscreenIndex, setFullscreenIndex] = useState<number | null>(null);
  const [lastSelectedIdx, setLastSelectedIdx] = useState<number | null>(null);
  const [previewTypes, setPreviewTypes] = useState<Record<string, ChartMakerConfig['type'] | null>>({});
  const [currentTraceIndex, setCurrentTraceIndex] = useState<Record<string, number>>({});
  const [currentTracePages, setCurrentTracePages] = useState<Record<string, number>>({});
  const [emphasizedTrace, setEmphasizedTrace] = useState<Record<string, string | null>>({});
  const [dimmedXValues, setDimmedXValues] = useState<Record<string, Set<string>>>({});

  // Chart sort order state
  const [chartSortOrder, setChartSortOrder] = useState<Record<string, 'asc' | 'desc' | null>>({});

  // Cardinality View state
  const [cardinalityData, setCardinalityData] = useState<any[]>([]);
  const [cardinalityLoading, setCardinalityLoading] = useState(false);
  const [cardinalityError, setCardinalityError] = useState<string | null>(null);
  const [originalFileName, setOriginalFileName] = useState<string | null>(null);
  
  // Sorting and filtering state for Cardinality View
  const [sortColumn, setSortColumn] = useState<string>('unique_count');
  const [sortDirection, setSortDirection] = useState<'asc' | 'desc'>('desc');
  const [columnFilters, setColumnFilters] = useState<Record<string, string[]>>({});
  
  // Filter collapse state for each chart (chartId -> boolean)
  const [filtersCollapsed, setFiltersCollapsed] = useState<Record<string, boolean>>({});

  // Chat bubble state management
  const [chatBubble, setChatBubble] = useState<{
    visible: boolean;
    chartId: string | null;
    anchor: { x: number; y: number };
  }>({
    visible: false,
    chartId: null,
    anchor: { x: 0, y: 0 }
  });
  const [chatBubbleShouldRender, setChatBubbleShouldRender] = useState(false);
  const [overlayActive, setOverlayActive] = useState(false);

  const debounceTimers = useRef<Record<string, NodeJS.Timeout | number | null>>({});
  
  // Container ref for responsive layout
  const containerRef = useRef<HTMLDivElement>(null);

  // Handle note input change - save directly to chart config
  const handleNoteChange = (chartId: string, value: string) => {
    const chart = charts.find(c => c.id === chartId);
    if (chart) {
      const updatedCharts = charts.map(c =>
        c.id === chartId ? { ...c, note: value } : c
      );
      updateSettings(atomId, { charts: updatedCharts });
    }
  };

  // Handle note input keydown - save and blur on Enter
  const handleNoteKeyDown = (chartId: string, e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      // Blur the input to trigger save and remove focus
      e.currentTarget.blur();
    }
  };

  // Fetch cardinality data when data is available
  useEffect(() => {
    if (typedData && typedData.file_id && dataSource) {
      fetchCardinalityData();
    }
  }, [typedData?.file_id, dataSource]);

  // Fetch cardinality data function
  const fetchCardinalityData = async () => {
    if (!typedData?.file_id) return;
    
    setCardinalityLoading(true);
    setCardinalityError(null);
    
    try {
      // Use dataSource (original Arrow filename) if available, otherwise fall back to file_id
      // This allows the backend to reload from the saved file even if in-memory storage is cleared
      const objectName = dataSource || typedData.file_id;
      const url = `${CHART_MAKER_API}/column_summary?object_name=${encodeURIComponent(objectName)}`;
      const response = await fetch(url);
      if (response.ok) {
        const summary = await response.json();
        const summaryData = Array.isArray(summary.summary) ? summary.summary.filter(Boolean) : [];
        
        // Transform the data to match the cardinality format expected by the table
        const cardinalityFormatted = summaryData.map((col: any) => ({
          column: col.column,
          data_type: col.data_type,
          unique_count: col.unique_count,
          unique_values: col.unique_values || []
        }));
        
        setCardinalityData(cardinalityFormatted);
        setOriginalFileName(summary.original_name || typedData.file_id);
      } else {
        const errorText = await response.text();
        setCardinalityError(`Failed to fetch cardinality data: ${response.status} - ${errorText}`);
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
    Object.entries(columnFilters).forEach(([column, filterValues]) => {
      if (filterValues && filterValues.length > 0) {
        filtered = filtered.filter(row => {
          const cellValue = String(row[column.toLowerCase()] || '');
          return filterValues.includes(cellValue);
        });
      }
    });

    // Apply sorting
    if (sortColumn) {
      filtered = [...filtered].sort((a, b) => {
        const aVal = a[sortColumn.toLowerCase()];
        const bVal = b[sortColumn.toLowerCase()];
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
  }, [cardinalityData, columnFilters, sortColumn, sortDirection]);

  const getUniqueColumnValues = (column: string): string[] => {
    if (!Array.isArray(cardinalityData) || cardinalityData.length === 0) return [];
    
    // Get the currently filtered data (before applying the current column's filter)
    let filteredData = Array.isArray(cardinalityData) ? cardinalityData : [];

    // Filter out columns with unique_count = 0 (only exclude zero values)
    filteredData = filteredData.filter(c => c.unique_count > 0);

    // Apply all other column filters except the current one
    Object.entries(columnFilters).forEach(([col, filterValues]) => {
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

  const handleSort = (column: string, direction?: 'asc' | 'desc') => {
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
  
  // Add new charts based on layout configuration
  const addChart = () => {
    const currentCharts = (atom?.settings as any)?.charts || [];
    const chartsToAdd = numberOfCharts; // 1 or 2 based on layout setting
    
    const newCharts = [...currentCharts];
    for (let i = 0; i < chartsToAdd; i++) {
      newCharts.push({
        id: (currentCharts.length + i + 1).toString(),
        title: `Chart ${currentCharts.length + i + 1}`,
        type: 'line',
        xAxis: '',
        yAxis: '',
        filters: {},
        aggregation: 'sum',
        legendField: 'aggregate',
        chartRendered: false,
        chartLoading: false,
        isAdvancedMode: false,
        traces: [],
      });
    }
    
    updateSettings(atomId, { charts: newCharts });
  };
  
  // Get responsive layout configuration based on numberOfCharts (charts per row) setting
  const getLayoutConfig = () => {
    const columns = numberOfCharts; // Use numberOfCharts setting to determine columns per row
    const rows = Math.max(1, Math.ceil(charts.length / columns));
    const containerClass = columns === 1 ? 'grid-cols-1' : 'grid-cols-2';
    const layout = columns === 1 ? 'vertical' : 'horizontal';
    
    return { layout, containerClass, rows };
  };
  
  const layoutConfig = getLayoutConfig();
  const { isCompact } = useResponsiveChartLayout(charts.length, containerRef);

  // Cleanup timers on unmount
  useEffect(() => {
    return () => {
      Object.values(debounceTimers.current).forEach(timer => {
        if (timer) clearTimeout(timer as number);
      });
    };
  }, []);


  // Debounce utility
  const debounce = (fn: () => void, delay: number, chartId: string) => {
    if (debounceTimers.current[chartId]) clearTimeout(debounceTimers.current[chartId] as number);
    debounceTimers.current[chartId] = setTimeout(fn, delay);
  };

  const getUniqueValuesForColumn = (column: string) => {
    // Use backend-provided unique values if available
    // Prioritize uniqueValuesByColumn (new) over unique_values (legacy)
    if (typedData && (typedData.uniqueValuesByColumn || typedData.unique_values)) {
      const uniqueMap = typedData.uniqueValuesByColumn || typedData.unique_values;
      if (uniqueMap && uniqueMap[column]) {
        return uniqueMap[column];
      }
    }
    // Fallback to frontend calculation
    if (!typedData || !Array.isArray(typedData.rows)) return [];
    const values = new Set(typedData.rows.map(row => String(row[column])));
    return Array.from(values).filter(v => v !== '');
  };

  const chartTypeIcons = {
    line: TrendingUp,
    bar: BarChart2,
    area: Triangle,
    pie: PieChartIcon,
    scatter: Zap
  };

  const chartTypeLabels = {
    line: 'Line',
    bar: 'Bar',
    area: 'Area',
    pie: 'Pie',
    scatter: 'Scatter'
  };

  const getFilteredData = (chart: ChartMakerConfig) => {
    // Prefer backend-provided data when available
    if (chart.chartConfig && chart.chartConfig.data) {
      return chart.chartConfig.data;
    }
    // Fallback to filtering uploaded data based on selected identifiers
    if (!typedData || !Array.isArray(typedData.rows)) return [];

    const { filters = {} } = chart;
    return typedData.rows.filter(row =>
      Object.entries(filters).every(([col, values]) => {
        if (!values || values.length === 0) return true;
        return values.includes(String(row[col]));
      })
    );
  };

  const getChartColors = (index: number) => {
    const colorSchemes = [
      {
        primary: "#6366f1", // modern indigo
        secondary: "#a5b4fc",
        tertiary: "#e0e7ff",
        gradient: "from-blue-500 to-blue-600",
        darkAccent: "#4338ca",
        lightAccent: "#f0f9ff"
      },
      {
        primary: "#06b6d4", // modern cyan
        secondary: "#67e8f9",
        tertiary: "#cffafe",
        gradient: "from-cyan-500 via-cyan-600 to-blue-600",
        darkAccent: "#0891b2",
        lightAccent: "#f0fdfa"
      },
      {
        primary: "#8b5cf6", // modern violet
        secondary: "#c4b5fd",
        tertiary: "#ede9fe",
        gradient: "from-blue-500 to-blue-600",
        darkAccent: "#7c3aed",
        lightAccent: "#faf5ff"
      },
      {
        primary: "#f59e0b", // modern amber
        secondary: "#fcd34d",
        tertiary: "#fef3c7",
        gradient: "from-amber-500 via-orange-500 to-red-500",
        darkAccent: "#d97706",
        lightAccent: "#fffbeb"
      },
      {
        primary: "#ef4444", // modern red
        secondary: "#f87171",
        tertiary: "#fecaca",
        gradient: "from-red-500 via-red-600 to-pink-600",
        darkAccent: "#dc2626",
        lightAccent: "#fef2f2"
      },
      {
        primary: "#10b981", // modern emerald
        secondary: "#6ee7b7",
        tertiary: "#d1fae5",
        gradient: "from-emerald-500 via-green-500 to-teal-600",
        darkAccent: "#059669",
        lightAccent: "#f0fdf4"
      }
    ];
    return colorSchemes[index % colorSchemes.length];
  };

  // Calculate optimal chart height based on visible elements for better space utilization
  const calculateOptimalChartHeight = (
    chart: ChartMakerConfig | undefined,
    isCompact: boolean,
    hasFilters: boolean,
    hasNote: boolean
  ): number => {
    // Safety check
    if (!chart) return isCompact ? 384 : 512;
    
    // Base height for graph visualization (optimized for content)
    let baseHeight = isCompact ? 300 : 420;
    
    // Adjustments based on visible elements to maintain optimal graph-to-content ratio
    
    // 1. Filter section: Reduce graph height to accommodate filter UI
    if (hasFilters) {
      const filterCount = Object.keys(chart.filters || {}).length;
      // Don't reduce too much - maintain minimum graph visibility
      const reduction = Math.min(40, filterCount * 8);
      baseHeight = Math.max(280, baseHeight - reduction);
    }
    
    // 2. Note section: Minor reduction for note display
    if (hasNote && chart.showNote && chart.note) {
      baseHeight = Math.max(280, baseHeight - 25);
    }
    
    // 3. Legend: Reclaim space if hidden
    const legendShown = chart.chartConfig?.showLegend !== false;
    if (!legendShown) {
      baseHeight += 20;  // No legend = more graph space
    }
    
    // 4. Axis labels: Reclaim space if hidden
    const xAxisShown = chart.chartConfig?.showXAxisLabels !== false;
    const yAxisShown = chart.chartConfig?.showYAxisLabels !== false;
    
    if (!xAxisShown) {
      baseHeight += 30;  // No X-axis label = significant space reclaimed
    }
    if (!yAxisShown) {
      baseHeight += 20;  // No Y-axis label = space reclaimed
    }
    
    // 5. Data labels: Need extra vertical space
    if (chart.chartConfig?.showDataLabels === true) {
      baseHeight += 20;  // Extra space for labels above elements
    }
    
    // 6. Chart type optimization
    if (chart.type === 'pie') {
      baseHeight = Math.min(baseHeight, 380);  // Pie charts are more compact
    }
    
    // Clamp to reasonable bounds (prevent extreme sizes)
    return Math.max(280, Math.min(550, baseHeight));
  };

  const chartConfig = {
    data: {
      label: "Data",
      color: "hsl(var(--chart-1))",
    },
  };

  // Chat bubble handler - trigger chart type tray on right click
  const handleContextMenu = (e: React.MouseEvent, chartId: string) => {
    e.preventDefault();
    e.stopPropagation();

    // Viewport bounds checking to keep ChatBubble on screen
    const padding = 8;
    const bubbleWidth = isMobile ? 180 : 200;   // Approximate ChatBubble width
    const bubbleHeight = isMobile ? 280 : 320;  // Approximate ChatBubble height
    
    let x = e.clientX;
    let y = e.clientY;
    
    // The ChatBubble uses transform: translate(-50%, 0) to center horizontally
    // So we need to check if half the bubble extends beyond viewport edges
    
    // Check right edge (accounting for center transform)
    if (x + bubbleWidth / 2 > window.innerWidth - padding) {
      x = window.innerWidth - bubbleWidth / 2 - padding;
    }
    
    // Check left edge (accounting for center transform)
    if (x - bubbleWidth / 2 < padding) {
      x = bubbleWidth / 2 + padding;
    }
    
    // Check bottom edge
    if (y + bubbleHeight > window.innerHeight - padding) {
      y = Math.max(padding, window.innerHeight - bubbleHeight - padding);
    }
    
    // Check top edge
    if (y < padding) {
      y = padding;
    }

    setChatBubble({
      visible: true,
      chartId,
      anchor: { x, y }
    });
    setChatBubbleShouldRender(true);
    setOverlayActive(false);
  };

  const handleChartTypeSelect = (type: string) => {
    if (chatBubble.chartId) {
      onChartTypeChange?.(chatBubble.chartId, type as ChartMakerConfig['type']);
      setChatBubble({ ...chatBubble, visible: false });
    }
  };

  // Handle chart sort order changes
  const handleChartSortOrderChange = (chartId: string, sortOrder: 'asc' | 'desc' | null) => {
    setChartSortOrder(prev => ({
      ...prev,
      [chartId]: sortOrder
    }));
  };

  const handleCloseChatBubble = () => {
    setChatBubble({ ...chatBubble, visible: false });
  };

  const handleBubbleExited = () => {
    setChatBubbleShouldRender(false);
  };

  // Activate overlay after bubble entry animation completes, deactivate immediately on exit
  useEffect(() => {
    if (chatBubble.visible && chatBubbleShouldRender) {
      // Delay overlay activation to allow bubble entry animation to complete (300ms + buffer)
      const timer = setTimeout(() => {
        setOverlayActive(true);
      }, 350); // Slightly longer than entry animation duration (300ms)
      return () => clearTimeout(timer);
    } else {
      // Immediately deactivate overlay when bubble starts hiding
      if (overlayActive) {
        setOverlayActive(false);
      }
    }
  }, [chatBubble.visible, chatBubbleShouldRender, overlayActive]);

  // Exhibition functionality
  const exhibitionSelections = React.useMemo<ChartMakerExhibitionSelection[]>(() => {
    return Array.isArray(atom?.settings?.exhibitionSelections)
      ? atom.settings.exhibitionSelections
      : [];
  }, [atom?.settings?.exhibitionSelections]);

  const createSelectionDescriptor = React.useCallback(
    (chart: ChartMakerConfig, componentType: ChartMakerExhibitionComponentType) => {
      const key = `chart::${chart.id}`;
      const label = chart.title;

      return {
        key,
        label,
        componentType,
        chart
      };
    },
    [],
  );

  const cloneDeep = <T,>(value: T): T => {
    if (value === undefined) {
      return value;
    }
    try {
      return JSON.parse(JSON.stringify(value)) as T;
    } catch (error) {
      return value;
    }
  };

  const updateExhibitionSelection = React.useCallback(
    (
      chart: ChartMakerConfig,
      componentType: ChartMakerExhibitionComponentType,
      checked: boolean | "indeterminate",
    ) => {
      const descriptor = createSelectionDescriptor(chart, componentType);
      const existingIndex = exhibitionSelections.findIndex((entry) => entry.key === descriptor.key);
      const nextChecked = checked === true;

      if (nextChecked) {
        const chartStateSnapshot: ChartMakerExhibitionSelectionChartState = {
          chartType: chart.type,
          xAxis: chart.xAxis,
          yAxis: chart.yAxis,
          secondYAxis: chart.secondYAxis,
          dualAxisMode: chart.dualAxisMode,
          filters: chart.filters,
          aggregation: chart.aggregation,
          legendField: chart.legendField,
          isAdvancedMode: chart.isAdvancedMode,
          traces: chart.traces ? cloneDeep(chart.traces) : undefined,
          note: chart.note, // Include note in exhibition metadata (for future use)
        };

        const chartContextSnapshot: ChartMakerExhibitionSelectionContext = {
          dataSource: dataSource,
          uploadedData: typedData ? cloneDeep(typedData) : null,
          chartConfig: chart.chartConfig ? cloneDeep(chart.chartConfig) : undefined,
        };

        const selectionSnapshot: ChartMakerExhibitionSelection = {
          key: descriptor.key,
          chartId: chart.id,
          chartTitle: chart.title,
          componentType,
          chartState: chartStateSnapshot,
          chartContext: chartContextSnapshot,
          capturedAt: new Date().toISOString(),
        };

        const nextSelections = [...exhibitionSelections];
        if (existingIndex >= 0) {
          nextSelections[existingIndex] = {
            ...nextSelections[existingIndex],
            ...selectionSnapshot,
          };
        } else {
          nextSelections.push(selectionSnapshot);
        }
        updateSettings(atomId, { exhibitionSelections: nextSelections });
      } else if (existingIndex >= 0) {
        const nextSelections = exhibitionSelections.filter((entry) => entry.key !== descriptor.key);
        updateSettings(atomId, { exhibitionSelections: nextSelections });
      }
    },
    [
      createSelectionDescriptor,
      exhibitionSelections,
      updateSettings,
      atomId,
      dataSource,
      typedData,
    ],
  );

  const stageSelectionForExhibition = React.useCallback(
    (chart: ChartMakerConfig, componentType: ChartMakerExhibitionComponentType) => {
      const descriptor = createSelectionDescriptor(chart, componentType);
      const alreadySelected = exhibitionSelections.some((entry) => entry.key === descriptor.key);

      updateExhibitionSelection(chart, componentType, true);
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


const renderChart = (
  chart: ChartMakerConfig,
  index: number,
  chartKey?: string,
  heightClass?: string,
  _isFullscreen = false
) => {
  if ((chart as any).chartLoading) {
    const loadingHeight = heightClass || (isCompact ? 'h-96' : 'h-[32rem]');
    const loadingHeightValue = heightClass ? undefined : (isCompact ? 384 : 512);
    const colors = getChartColors(index);
    return (
      <div
        className={`flex flex-col items-center justify-center ${loadingHeight} bg-gradient-to-br from-white/50 to-gray-50/50 backdrop-blur-sm relative overflow-hidden`}
        style={{ minHeight: loadingHeightValue }}
      >
        <div className="absolute inset-0 chart-loading"></div>
        <div className="relative z-10 flex flex-col items-center space-y-4">
          <div className="relative">
            <div className="w-12 h-12 rounded-full border-4 border-gray-200 animate-spin"></div>
            <div
              className="absolute inset-0 w-12 h-12 rounded-full border-4 border-transparent animate-spin"
              style={{ borderTopColor: colors.primary, borderRightColor: colors.primary, animationDuration: '1s', animationDirection: 'reverse' }}
            ></div>
          </div>
          <div className="text-center">
            <div className="text-sm font-medium text-gray-700 mb-1">Rendering Chart</div>
            <div className="text-xs text-gray-500">Creating beautiful visualization...</div>
          </div>
        </div>
      </div>
    );
  }

  const previewType = previewTypes[chart.id];
  const config = chart.chartConfig || {};
  // Prioritize chart.type (user selection) over config.chart_type (backend response)
  // since backend converts stacked_bar to bar, but we want to preserve user's selection
  const rawType = previewType || chart.type || config.chart_type;
  const legendActive = chart.legendField && chart.legendField !== 'aggregate';
  const typeMap: Record<string, string> = {
    line: 'line_chart',
    bar: 'bar_chart',
    stacked_bar: 'stacked_bar_chart',
    area: 'area_chart',
    pie: 'pie_chart',
    scatter: 'scatter_chart',
    line_chart: 'line_chart',
    bar_chart: 'bar_chart',
    stacked_bar_chart: 'stacked_bar_chart',
    area_chart: 'area_chart',
    pie_chart: 'pie_chart',
    scatter_chart: 'scatter_chart',
  };
  const normalizedType = legendActive && rawType === 'pie' ? 'line' : rawType;
  const rendererType = typeMap[normalizedType] || 'line_chart';
  const chartData = config.data || getFilteredData(chart);
  const traces = config.traces || [];
  const xAxisConfig = chart.chartRendered && config.x_axis
    ? {
        ...config.x_axis,
        dataKey: (config.x_axis as any).dataKey || (config.x_axis as any).data_key || chart.xAxis,
      }
    : { dataKey: chart.xAxis };
  const yAxisConfig = chart.chartRendered && config.y_axis
    ? {
        ...config.y_axis,
        dataKey: (config.y_axis as any).dataKey || (config.y_axis as any).data_key || chart.yAxis,
      }
    : { dataKey: chart.yAxis };
  const key = chartKey || chart.lastUpdateTime || chart.id;
  
  // Calculate optimal height based on chart content for better space utilization
  const hasFilters = Object.keys(chart.filters || {}).length > 0 || 
                     (chart.traces && chart.traces.some(t => t.filters && Object.keys(t.filters).length > 0));
  const hasNote = chart.showNote && chart.note;
  
  // Use dynamic height calculation for better adaptive behavior
  const chartHeightValue = heightClass 
    ? undefined 
    : calculateOptimalChartHeight(chart, isCompact, hasFilters, hasNote);
  
  // Use inline style for dynamic heights (more precise than Tailwind classes)
  const chartHeightClass = heightClass;

  if (
    !chart.chartRendered ||
    !chartData.length ||
    !xAxisConfig.dataKey ||
    (!yAxisConfig.dataKey && traces.length === 0)
  ) {
    return (
      <div
        className={`flex items-center justify-center ${chartHeightClass || ''} text-muted-foreground`}
        style={{ minHeight: chartHeightValue, height: chartHeightValue }}
      >
        <div className="text-center">
          <div className="w-16 h-16 mx-auto mb-4 rounded-full bg-gradient-to-br from-slate-100 to-slate-200 flex items-center justify-center">
            <LineChartIcon className="w-8 h-8 text-slate-400" />
          </div>
          <p className="font-medium">Configure chart settings</p>
          <p className="text-sm">Select X-axis and Y-axis to display data</p>
        </div>
      </div>
    );
  }

  const colors = getChartColors(index);
  const rendererProps = {
    key,
    type: rendererType as 'bar_chart' | 'line_chart' | 'pie_chart' | 'area_chart' | 'scatter_chart' | 'stacked_bar_chart',
    data: chartData,
    xField: xAxisConfig.dataKey,
    yField: traces.length ? traces[0]?.dataKey : yAxisConfig.dataKey,
    yFields: traces.length ? traces.map((t: any) => t.dataKey) : undefined,
    title: chart.title,
    xAxisLabel: xAxisConfig.label || xAxisConfig.dataKey,
    yAxisLabel: yAxisConfig.label || yAxisConfig.dataKey,
    yAxisLabels: traces.length ? traces.map((t: any) => t.name || t.dataKey) : undefined,
    legendField: chart.legendField && chart.legendField !== 'aggregate' ? chart.legendField : undefined,
    colors: [colors.primary, colors.secondary, colors.tertiary],
    theme: chart.chartConfig?.theme,
    showLegend: chart.chartConfig?.showLegend,
    // showAxisLabels: chart.chartConfig?.showAxisLabels,
    showXAxisLabels: chart.chartConfig?.showXAxisLabels,
    showYAxisLabels: chart.chartConfig?.showYAxisLabels,
    showDataLabels: chart.chartConfig?.showDataLabels,
    showGrid: chart.chartConfig?.showGrid,
    height: chartHeightValue,
    sortOrder: (chart.sortOrder ?? chart.chartConfig?.sortOrder) || chartSortOrder[chart.id] || null,
    sortColumn: chart.sortColumn ?? chart.chartConfig?.sortColumn,
    onSortColumnChange: (column: string) => {
      const updatedCharts = charts.map(c => 
        c.id === chart.id 
          ? { 
              ...c, 
              sortColumn: column,
              chartConfig: { ...c.chartConfig, sortColumn: column } 
            }
          : c
      );
      updateSettings(atomId, { charts: updatedCharts });
    },
    onChartTypeChange: (newType: 'bar_chart' | 'line_chart' | 'pie_chart' | 'area_chart' | 'scatter_chart' | 'stacked_bar_chart') => {
      const mappedType = newType === 'stacked_bar_chart' ? 'stacked_bar' : newType.replace('_chart', '');
      onChartTypeChange?.(chart.id, mappedType as ChartMakerConfig['type']);
    },
    onSortChange: (newSortOrder: 'asc' | 'desc' | null) => {
      handleChartSortOrderChange(chart.id, newSortOrder);
      // Also save to chart config for persistence
      const updatedCharts = charts.map(c => 
        c.id === chart.id 
          ? { 
              ...c, 
              sortOrder: newSortOrder,
              chartConfig: { ...c.chartConfig, sortOrder: newSortOrder } 
            }
          : c
      );
      updateSettings(atomId, { charts: updatedCharts });
    },
    seriesSettings: chart.chartConfig?.seriesSettings || {},
    onSeriesSettingsChange: (newSeriesSettings: Record<string, { color?: string; showDataLabels?: boolean }>) => {
      // Defer the update to avoid updating during render
      // Use setTimeout instead of requestAnimationFrame to ensure it's truly deferred
      setTimeout(() => {
        // Get fresh charts from store to avoid stale closure
        const currentAtom = useLaboratoryStore.getState().getAtom(atomId);
        const currentCharts = (currentAtom?.settings as any)?.charts || charts;
        const updatedCharts = currentCharts.map((c: any) => 
          c.id === chart.id 
            ? { ...c, chartConfig: { ...c.chartConfig, seriesSettings: newSeriesSettings } }
            : c
        );
        updateSettings(atomId, { charts: updatedCharts });
      }, 0);
    },
    onThemeChange: (theme: string) => {
      const updatedCharts = charts.map(c => 
        c.id === chart.id 
          ? { ...c, chartConfig: { ...c.chartConfig, theme } }
          : c
      );
      updateSettings(atomId, { charts: updatedCharts });
    },
    onGridToggle: (enabled: boolean) => {
      const updatedCharts = charts.map(c => 
        c.id === chart.id 
          ? { ...c, chartConfig: { ...c.chartConfig, showGrid: enabled } }
          : c
      );
      updateSettings(atomId, { charts: updatedCharts });
    },
    onLegendToggle: (enabled: boolean) => {
      const updatedCharts = charts.map(c => 
        c.id === chart.id 
          ? { ...c, chartConfig: { ...c.chartConfig, showLegend: enabled } }
          : c
      );
      updateSettings(atomId, { charts: updatedCharts });
    },
    // onAxisLabelsToggle: (enabled: boolean) => {
    //   const updatedCharts = charts.map(c => 
    //     c.id === chart.id 
    //       ? { ...c, chartConfig: { ...c.chartConfig, showAxisLabels: enabled } }
    //       : c
    //   );
    //   updateSettings(atomId, { charts: updatedCharts });
    // },
    onXAxisLabelsToggle: (enabled: boolean) => {
      const updatedCharts = charts.map(c => 
        c.id === chart.id 
          ? { ...c, chartConfig: { ...c.chartConfig, showXAxisLabels: enabled } }
          : c
      );
      updateSettings(atomId, { charts: updatedCharts });
    },
    onYAxisLabelsToggle: (enabled: boolean) => {
      const updatedCharts = charts.map(c => 
        c.id === chart.id 
          ? { ...c, chartConfig: { ...c.chartConfig, showYAxisLabels: enabled } }
          : c
      );
      updateSettings(atomId, { charts: updatedCharts });
    },
    onDataLabelsToggle: (enabled: boolean) => {
      const updatedCharts = charts.map(c => 
        c.id === chart.id 
          ? { ...c, chartConfig: { ...c.chartConfig, showDataLabels: enabled } }
          : c
      );
      updateSettings(atomId, { charts: updatedCharts });
    },
    onTitleChange: (newTitle: string) => {
      const updatedCharts = charts.map(c => 
        c.id === chart.id 
          ? { ...c, title: newTitle }
          : c
      );
      updateSettings(atomId, { charts: updatedCharts });
    },
    forceSingleAxis: chart.dualAxisMode === 'single',
  } as const;

  return (
    <div 
      className={`w-full ${chartHeightClass || ''}`} 
      style={{ minHeight: chartHeightValue, height: chartHeightValue, cursor: 'context-menu' }}
      onContextMenu={(e) => handleContextMenu(e, chart.id)}
    >
      <RechartsChartRenderer {...rendererProps} />
    </div>
  );
};


  if (!data) {
    return (
      <div className="w-full h-full p-6 bg-gradient-to-br from-slate-50 via-pink-50/30 to-pink-50/50 overflow-y-auto relative">
        {/* Subtle background pattern */}
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
            <div className="w-24 h-24 mx-auto mb-8 rounded-2xl bg-gradient-to-br from-pink-500 to-pink-600 flex items-center justify-center shadow-2xl transform rotate-3 hover:rotate-0 transition-transform duration-300">
              <PieChartIcon className="w-12 h-12 text-white drop-shadow-lg" />
            </div>
            <h3 className="text-3xl font-bold text-gray-900 mb-3 bg-gradient-to-r from-pink-500 to-pink-600 bg-clip-text text-transparent">
              Chart Maker Operation
            </h3>
            <p className="text-gray-600 mb-6 text-lg font-medium leading-relaxed">
              Select a file from the properties panel to get started
            </p>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div ref={containerRef} className="w-full h-full min-h-[28rem] flex flex-col bg-gradient-to-br from-slate-50 via-blue-50/30 to-blue-50/50 relative overflow-hidden">
      {/* Subtle background pattern */}
      <div className="absolute inset-0 opacity-30">
        <svg width="60" height="60" viewBox="0 0 60 60" className="absolute inset-0 w-full h-full">
          <defs>
            <pattern id="grid" width="60" height="60" patternUnits="userSpaceOnUse">
              <path d="M 60 0 L 0 0 0 60" fill="none" stroke="rgb(148 163 184 / 0.1)" strokeWidth="1"/>
            </pattern>
          </defs>
          <rect width="100%" height="100%" fill="url(#grid)" />
        </svg>
      </div>
      
      <div className="relative z-10 p-6 overflow-hidden">
        {/* Cardinality View */}
        {cardinalityLoading ? (
          <div className="p-4 text-blue-600">Loading cardinality data...</div>
        ) : cardinalityError ? (
          <div className="p-4 text-red-600">{cardinalityError}</div>
        ) : cardinalityData && cardinalityData.length > 0 ? (
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
                          uniqueValues={getUniqueColumnValues("column")}
                          current={columnFilters["column"] || []}
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
                          uniqueValues={getUniqueColumnValues("data_type")}
                          current={columnFilters["data_type"] || []}
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
                          uniqueValues={getUniqueColumnValues("unique_count")}
                          current={columnFilters["unique_count"] || []}
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
              borderColor="border-pink-500"
              customHeader={{
                title: "Data Summary",
                subtitle: "Data in detail",
                subtitleClickable: !!originalFileName,
                onSubtitleClick: () => {
                  if (originalFileName) {
                    window.open(`/dataframe?name=${encodeURIComponent(originalFileName)}`, '_blank');
                  }
                }
              }}
            >
              {displayedCardinality.map((col, index) => (
                <tr key={index} className="table-row">
                  <td className="table-cell">{col.column || col.Column || ''}</td>
                  <td className="table-cell">{col.data_type || col['Data type'] || ''}</td>
                  <td className="table-cell">{col.unique_count || col['Unique count'] || 0}</td>
                  <td className="table-cell">
                    {col.unique_values ? (
                      <div className="flex flex-wrap items-center gap-1">
                        {Array.isArray(col.unique_values) ? (
                          <>
                            {col.unique_values.slice(0, 2).map((val: any, i: number) => (
                              <Badge
                                key={i}
                                className="p-0 px-1 text-xs bg-gray-50 text-slate-700 hover:bg-gray-50"
                              >
                                {String(val)}
                              </Badge>
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
                          <Badge className="p-0 px-1 text-xs bg-gray-50 text-slate-700 hover:bg-gray-50">
                            {String(col.unique_values)}
                          </Badge>
                        )}
                      </div>
                    ) : (
                      <span className="text-gray-500 italic">No samples</span>
                    )}
                  </td>
                </tr>
              ))}
            </Table>
        ) : null}

        {/* Instructional text for exhibition */}
        <div className="mt-6 text-center">
          <p className="text-sm text-gray-600">Right-click a chart title to stage it for exhibition.</p>
        </div>

        <div
          className={`grid gap-6 mt-8 ${layoutConfig.containerClass} transition-all duration-300 ease-in-out`}
          style={{
            gridTemplateRows: layoutConfig.layout === 'horizontal' ? '1fr' : 'auto'
          }}
        >
          {charts.map((chart, index) => {
            const colors = getChartColors(index);
            
            // Check if this chart is selected for exhibition
            const descriptor = createSelectionDescriptor(chart, 'chart');
            const isChartSelected = exhibitionSelections.some((entry) => entry.key === descriptor.key);
            
            return (
                   <Card
                     key={chart.id}
                    className={`chart-card border ${
                      isChartSelected ? "border-amber-400" : "border-pink-200"
                    } bg-white/95 backdrop-blur-sm overflow-hidden transform hover:scale-[1.02] transition-all duration-300 relative flex flex-col group hover:shadow-2xl cursor-pointer`}
                    onClick={() => {
                      // Set selectedChartIndex to expand this chart's settings
                      updateSettings(atomId, { selectedChartIndex: index } as any);
                      
                      // Scroll to the chart settings section after a brief delay to allow expansion
                      setTimeout(() => {
                        const chartSettingsElement = document.querySelector(`[data-chart-settings="${index}"]`);
                        if (chartSettingsElement) {
                          chartSettingsElement.scrollIntoView({ 
                            behavior: 'smooth', 
                            block: 'start',
                            inline: 'nearest'
                          });
                        }
                      }, 150);
                    }}
                   >
                    <div className="bg-white border-b border-pink-200 p-4 relative flex-shrink-0 group-hover:shadow-lg transition-shadow duration-300">
                      <ContextMenu>
                        <ContextMenuTrigger asChild>
                          <CardTitle className={`font-bold text-gray-900 flex items-center justify-between ${isCompact ? 'text-base' : 'text-lg'}`}>
                            <div className="flex items-center">
                              <BarChart3 className={`mr-2 ${isCompact ? 'w-4 h-4' : 'w-5 h-5'} text-gray-900`} />
                              {chart.title}
                            </div>
                            {/* Hints container - aligned in same row */}
                            <div className="flex items-center gap-2">
                              {/* Expand icon */}
                              <Button
                                variant="ghost"
                                size="sm"
                                className="h-6 w-6 p-0 hover:bg-gray-200/60 relative"
                                style={{ zIndex: 20 }}
                                onClick={(e) => {
                                  e.stopPropagation();
                                  setFullscreenChart(chart);
                                  setFullscreenIndex(index);
                                }}
                                title="Click to expand"
                              >
                                <Maximize2 className="w-3 h-3" />
                              </Button>
                            </div>
                          </CardTitle>
                        </ContextMenuTrigger>
                        <ContextMenuContent className="w-56 bg-white border border-gray-200 shadow-lg rounded-md p-1">
                          <ContextMenuItem
                            onClick={() =>
                              stageSelectionForExhibition(chart, "chart")
                            }
                            className="cursor-pointer"
                          >
                            Exhibit this component
                          </ContextMenuItem>
                        </ContextMenuContent>
                      </ContextMenu>
                     </div>
                     
                      {/* Filter Controls - Support both simple and multi-series modes */}
                      {(() => {
                        const migratedChart = migrateLegacyChart(chart);
                        
                        if (migratedChart.isAdvancedMode && migratedChart.traces && migratedChart.traces.length > 0) {
                          // Multi-series mode: Show filters by column with series pagination
                          const allFilterColumns = new Set<string>();
                          migratedChart.traces.forEach(trace => {
                            Object.keys(trace.filters || {}).forEach(column => allFilterColumns.add(column));
                          });
                          
                          if (allFilterColumns.size === 0) return null;
                          
                          return (
                            <div 
                              className="bg-gradient-to-r from-white/80 via-gray-50/90 to-white/80 backdrop-blur-sm p-4 border-b border-gray-200/60 shadow-inner relative overflow-hidden"
                              onClick={(e) => e.stopPropagation()}
                            >
                              {/* Subtle texture overlay */}
                              <div className="absolute inset-0 bg-gradient-to-r from-transparent via-white/20 to-transparent"></div>
                              
                              {/* Responsive grid layout for filter columns */}
                              <div className="relative z-10 grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
                                {Array.from(allFilterColumns).map(column => {
                                  // Find traces that use this column for filtering
                                  const tracesWithColumn = migratedChart.traces!.map((trace, idx) => ({ trace, idx }))
                                    .filter(({ trace }) => trace.filters && trace.filters[column]);
                                  
                                  if (tracesWithColumn.length === 0) return null;
                                  
                                  // Get current trace index for this column
                                  const currentIdx = currentTraceIndex[`${chart.id}-${column}`] || 0;
                                  const currentTraceInfo = tracesWithColumn[currentIdx] || tracesWithColumn[0];
                                  const selectedValues = currentTraceInfo.trace.filters[column] || [];
                                  const uniqueValues = getUniqueValuesForColumn(column);
                                  
                                  return (
                                    <div key={column} className="flex flex-col space-y-2">
                                      {/* Filter dropdown with compact layout */}
                                      <div className="flex flex-col gap-2">
                                        <Label className={`font-semibold text-gray-800 ${isCompact ? 'text-xs' : 'text-sm'} bg-gradient-to-r from-gray-700 to-gray-600 bg-clip-text text-transparent truncate`}>
                                          {column}
                                        </Label>
                                        <Popover>
                                          <PopoverTrigger asChild>
                                            <Button
                                              variant="outline"
                                              size="sm"
                                              className={`justify-between w-full font-medium ${isCompact ? 'h-8 text-xs' : 'h-9 text-sm'} 
                                                bg-gradient-to-r from-white to-gray-50/50 hover:from-gray-50 hover:to-white 
                                                border-gray-300/60 hover:border-gray-400/60 shadow-sm hover:shadow-md 
                                                transition-all duration-200 backdrop-blur-sm group`}
                                              title={(() => {
                                                // Create detailed tooltip showing all series selections
                                                const allSeriesSelections = tracesWithColumn.map(({ trace, idx }) => {
                                                  const seriesName = trace.name || `Series ${idx + 1}`;
                                                  const seriesValues = trace.filters?.[column] || [];
                                                  return `${seriesName}: ${seriesValues.length > 0 ? seriesValues.join(', ') : 'No values'}`;
                                                }).join('\n');
                                                return allSeriesSelections;
                                              })()}
                                            >
                                              <span className="truncate font-medium text-gray-700 group-hover:text-gray-900 transition-colors text-left">
                                                {(() => {
                                                  // Group selections by series for display
                                                  const seriesGroups = tracesWithColumn.map(({ trace, idx }) => {
                                                    const seriesName = trace.name || `S${idx + 1}`;
                                                    const seriesValues = trace.filters?.[column] || [];
                                                    if (seriesValues.length === 0) return `${seriesName}: None`;
                                                    if (seriesValues.length === 1) return `${seriesName}: ${seriesValues[0]}`;
                                                    return `${seriesName}: ${seriesValues.length} selected`;
                                                  });
                                                  
                                                  if (seriesGroups.length === 0) return "No filters";
                                                  if (seriesGroups.length === 1) return seriesGroups[0];
                                                  
                                                  // For multiple series, show a compact summary
                                                  const totalSelected = tracesWithColumn.reduce((sum, { trace }) => 
                                                    sum + (trace.filters?.[column]?.length || 0), 0);
                                                  return `${tracesWithColumn.length} series (${totalSelected} filters)`;
                                                })()}
                                              </span>
                                              <ChevronDown className="h-3 w-3 text-gray-500 group-hover:text-gray-700 transition-colors flex-shrink-0 ml-2" />
                                            </Button>
                                          </PopoverTrigger>
                                          <PopoverContent className="w-80 p-0 bg-white/95 backdrop-blur-lg border-gray-200/60 shadow-2xl rounded-lg overflow-hidden" align="start">
                                            <div className="p-4 border-b border-gray-200/60 bg-gradient-to-r from-gray-50/80 to-white/80">
                                              <div className="flex items-center justify-between">
                                                <span className="text-sm font-semibold text-gray-800 bg-gradient-to-r from-gray-700 to-gray-600 bg-clip-text text-transparent">
                                                  Filter by {column}
                                                </span>
                                                <Button
                                                  variant="ghost"
                                                  size="sm"
                                                  className="h-7 px-3 text-xs font-medium text-gray-600 hover:text-gray-800 hover:bg-gray-100/60 transition-all duration-200"
                                                  onClick={() => {
                                                    // Clear all series filters for this column
                                                    tracesWithColumn.forEach(({ idx }) => {
                                                      onTraceFilterChange?.(chart.id, idx, column, []);
                                                    });
                                                  }}
                                                >
                                                  Clear All
                                                </Button>
                                              </div>
                                            </div>
                                            
                                            {/* Series pagination inside dropdown */}
                                            {tracesWithColumn.length > 1 && (
                                              <div className="p-4 border-b border-gray-200/60 bg-gradient-to-r from-white/50 to-gray-50/50">
                                                <div className="flex items-center justify-between mb-3">
                                                  <span className="text-xs text-gray-700 font-semibold">Series:</span>
                                                </div>
                                                <div className="flex flex-wrap gap-2">
                                                  {tracesWithColumn.map(({ trace, idx }, seriesIdx) => {
                                                    const isCurrentSeries = currentIdx === seriesIdx;
                                                    const seriesName = trace.name || `Series ${idx + 1}`;
                                                    const seriesFilters = trace.filters?.[column] || [];
                                                    const seriesColor = trace.color || DEFAULT_TRACE_COLORS[idx % DEFAULT_TRACE_COLORS.length];
                                                    
                                                    return (
                                                      <Button
                                                        key={idx}
                                                        variant={isCurrentSeries ? "default" : "outline"}
                                                        size="sm"
                                                        className={`h-7 px-3 text-xs flex items-center gap-2 font-medium transition-all duration-200 ${
                                                          isCurrentSeries 
                                                            ? 'bg-gradient-to-r from-blue-500 to-blue-600 text-white shadow-md hover:shadow-lg' 
                                                            : 'bg-white/80 hover:bg-gray-50 border-gray-300/60 hover:border-gray-400/60'
                                                        }`}
                                                        onClick={() => setCurrentTraceIndex(prev => ({
                                                          ...prev,
                                                          [`${chart.id}-${column}`]: seriesIdx
                                                        }))}
                                                        title={`${seriesName} (${seriesColor}) - ${seriesFilters.length > 0 ? `${seriesFilters.length} values selected` : 'No values selected'}`}
                                                      >
                                                        {/* Color indicator */}
                                                        <div 
                                                          className="w-2.5 h-2.5 rounded-full border border-white/60 flex-shrink-0 shadow-sm"
                                                          style={{ backgroundColor: seriesColor }}
                                                        />
                                                        <span className="truncate font-medium">{seriesName}</span>
                                                        {seriesFilters.length > 0 && (
                                                          <Badge variant="secondary" className="ml-1 h-4 px-1.5 text-[10px] font-semibold bg-white/80 text-gray-700">
                                                            {seriesFilters.length}
                                                          </Badge>
                                                        )}
                                                      </Button>
                                                    );
                                                  })}
                                                </div>
                                              </div>
                                            )}
                                            
                                            <div className="flex gap-2 p-3 border-b border-gray-200/60 bg-gradient-to-r from-gray-50/40 to-white/40">
                                              <Button
                                                variant="outline"
                                                size="sm"
                                                className="flex-1 h-7 text-xs font-medium bg-white/80 hover:bg-gray-50 border-gray-300/60 hover:border-gray-400/60 transition-all duration-200"
                                                onClick={() => onTraceFilterChange?.(chart.id, currentTraceInfo.idx, column, uniqueValues)}
                                              >
                                                All
                                              </Button>
                                              <Button
                                                variant="outline"
                                                size="sm"
                                                className="flex-1 h-7 text-xs font-medium bg-white/80 hover:bg-gray-50 border-gray-300/60 hover:border-gray-400/60 transition-all duration-200"
                                                onClick={() => onTraceFilterChange?.(chart.id, currentTraceInfo.idx, column, [])}
                                              >
                                                None
                                              </Button>
                                            </div>
                                            <ScrollArea className="filter-scroll-area max-h-48 bg-white/50">
                                              <div className="p-3">
                                                <div className="text-xs text-gray-700 mb-3 font-semibold bg-gradient-to-r from-gray-600 to-gray-500 bg-clip-text text-transparent">
                                                  Values for {currentTraceInfo.trace.name || `Series ${currentTraceInfo.idx + 1}`}:
                                                </div>
                                                <RadioGroup value="" onValueChange={() => {}}>
                                                  <div className="space-y-1.5">
                                                    {uniqueValues.map((value, valueIdx) => (
                                                      <div key={value} className="flex items-center space-x-2 cursor-pointer p-2 rounded-md hover:bg-gray-50/80 transition-colors group"
                                                        onClick={e => {
                                                          if (!onTraceFilterChange) return;
                                                          const selectedValues = currentTraceInfo.trace.filters?.[column] || [];
                                                          if (e.shiftKey && lastSelectedIdx !== null) {
                                                            // Range select
                                                            const [start, end] = [lastSelectedIdx, valueIdx].sort((a, b) => a - b);
                                                            const range = uniqueValues.slice(start, end + 1);
                                                            const newSelected = Array.from(new Set([...selectedValues, ...range]));
                                                            onTraceFilterChange(chart.id, currentTraceInfo.idx, column, newSelected);
                                                            setLastSelectedIdx(valueIdx);
                                                          } else if (e.ctrlKey || e.metaKey) {
                                                            // Toggle selection
                                                            const isSelected = selectedValues.includes(value);
                                                            const newSelected = isSelected
                                                              ? selectedValues.filter(v => v !== value)
                                                              : [...selectedValues, value];
                                                            onTraceFilterChange(chart.id, currentTraceInfo.idx, column, newSelected);
                                                            setLastSelectedIdx(valueIdx);
                                                          } else {
                                                            // Single select (radio behavior)
                                                            onTraceFilterChange(chart.id, currentTraceInfo.idx, column, [value]);
                                                            setLastSelectedIdx(valueIdx);
                                                          }
                                                        }}
                                                        tabIndex={0}
                                                        onKeyDown={e => {
                                                          if (e.key === ' ' || e.key === 'Enter') {
                                                            e.preventDefault();
                                                            if (!onTraceFilterChange) return;
                                                            const selectedValues = currentTraceInfo.trace.filters?.[column] || [];
                                                            if (e.shiftKey && lastSelectedIdx !== null) {
                                                              const [start, end] = [lastSelectedIdx, valueIdx].sort((a, b) => a - b);
                                                              const range = uniqueValues.slice(start, end + 1);
                                                              const newSelected = Array.from(new Set([...selectedValues, ...range]));
                                                              onTraceFilterChange(chart.id, currentTraceInfo.idx, column, newSelected);
                                                              setLastSelectedIdx(valueIdx);
                                                            } else if (e.ctrlKey || e.metaKey) {
                                                              const isSelected = selectedValues.includes(value);
                                                              const newSelected = isSelected
                                                                ? selectedValues.filter(v => v !== value)
                                                                : [...selectedValues, value];
                                                              onTraceFilterChange(chart.id, currentTraceInfo.idx, column, newSelected);
                                                              setLastSelectedIdx(valueIdx);
                                                            } else {
                                                              onTraceFilterChange(chart.id, currentTraceInfo.idx, column, [value]);
                                                              setLastSelectedIdx(valueIdx);
                                                            }
                                                          }
                                                        }}
                                                      >
                                                        <RadioGroupItem 
                                                          value={value} 
                                                          checked={(currentTraceInfo.trace.filters?.[column] || []).includes(value)} 
                                                          tabIndex={-1} 
                                                        />
                                                        <label className="text-xs cursor-pointer flex-1 truncate font-medium text-gray-700 group-hover:text-gray-900 transition-colors">
                                                          {value || '(empty)'}
                                                        </label>
                                                      </div>
                                                    ))}
                                                  </div>
                                                </RadioGroup>
                                              </div>
                                            </ScrollArea>
                                          </PopoverContent>
                                        </Popover>
                                      </div>
                                    </div>
                                  );
                                })}
                              </div>
                            </div>
                          );
                        } else {
                          // Simple mode: Original filter controls
                          if (Object.keys(chart.filters).length === 0) return null;
                          
                          const isCollapsed = filtersCollapsed[chart.id] || false;
                          
                          return (
                            <div 
                              className="bg-gradient-to-r from-white/80 via-gray-50/90 to-white/80 backdrop-blur-sm p-4 border-b border-gray-200/60 shadow-inner relative overflow-hidden"
                              onClick={(e) => e.stopPropagation()}
                            >
                              {/* Subtle texture overlay */}
                              <div className="absolute inset-0 bg-gradient-to-r from-transparent via-white/20 to-transparent"></div>
                              
                              {/* Header with collapse toggle */}
                              <div className="relative z-10 flex items-center justify-between mb-3">
                                {/* <Label className="text-sm font-semibold text-gray-700">Filters</Label> */}
                                <Label className="text-sm font-semibold text-gray-700"> </Label>
                                <Button
                                  variant="ghost"
                                  size="sm"
                                  className="h-6 w-6 p-0 hover:bg-gray-200/60"
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    setFiltersCollapsed(prev => ({ ...prev, [chart.id]: !prev[chart.id] }));
                                  }}
                                >
                                  {isCollapsed ? <ChevronDown className="w-4 h-4" /> : <ChevronUp className="w-4 h-4" />}
                                </Button>
                              </div>
                              
                              {/* Responsive grid layout for simple filter columns */}
                              {!isCollapsed && (
                                <div className="relative z-10 flex flex-wrap gap-2">
                                  {Object.entries(chart.filters).map(([column, selectedValues]) => {
                                    const uniqueValues = getUniqueValuesForColumn(column);
                                    return (
                                      <div key={column} className="flex flex-col space-y-2 w-auto">
                                        <Label className={`font-semibold text-gray-800 ${isCompact ? 'text-xs' : 'text-sm'} bg-gradient-to-r from-gray-700 to-gray-600 bg-clip-text text-transparent truncate`}>
                                          {column}
                                        </Label>
                                        <MultiSelectDropdown
                                          label=""
                                          selectedValues={selectedValues}
                                          onSelectionChange={(newSelectedValues) => {
                                            onChartFilterChange?.(chart.id, column, newSelectedValues);
                                          }}
                                          options={uniqueValues.map(value => ({ 
                                            value, 
                                            label: value || '(empty)' 
                                          }))}
                                          showSelectAll={true}
                                          showTrigger={true}
                                          placeholder={`Filter by ${column}`}
                                          className="w-full"
                                        />
                                      </div>
                                    );
                                  })}
                                </div>
                              )}
                            </div>
                          );
                        }
                      })()}
                     
                    <CardContent 
                      className={`${isCompact ? 'px-2 pb-2 pt-1' : 'px-4 pb-4 pt-1'} flex flex-col`}
                      onClick={(e) => e.stopPropagation()}
                    >
                       <div className="overflow-hidden flex-shrink-0">
                         {renderChart(chart, index)}
                       </div>
                       {chart.showNote && (
                         <Input
                           placeholder="Add note"
                           value={chart.note || ''}
                           onChange={(e) => handleNoteChange(chart.id, e.target.value)}
                           onKeyDown={(e) => handleNoteKeyDown(chart.id, e)}
                           className="mt-2 w-full text-sm flex-shrink-0"
                           onClick={(e) => e.stopPropagation()}
                         />
                       )}
                     </CardContent>
                   </Card>
            );
          })}
        </div>
        
        {/* Add Chart Button */}
        <div className="flex justify-center mt-6">
          <Button
            onClick={addChart}
            className="w-8 h-8 rounded-full bg-gray-200 hover:bg-gray-300 text-black border-0 shadow-sm"
            size="sm"
          >
            <Plus className="w-4 h-4" />
          </Button>
        </div>
      </div>

      {/* Fullscreen Modal */}
      <Dialog open={!!fullscreenChart} onOpenChange={() => setFullscreenChart(null)}>
        <DialogContent className="chart-container max-w-6xl h-[80vh] p-6">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <BarChart3 className="w-5 h-5" />
              {fullscreenChart?.title}
            </DialogTitle>
          </DialogHeader>
          <div className="flex-1 overflow-hidden">
            {fullscreenChart && fullscreenIndex !== null && (
              <div className="h-full">
                {renderChart(fullscreenChart, fullscreenIndex, `fullscreen-${fullscreenChart.id}`, 'h-full', true)}
              </div>
            )}
          </div>
        </DialogContent>
      </Dialog>

      {/* Chat Bubble Portal */}
      {chatBubbleShouldRender && (
        <>
          {/* Overlay for outside click detection */}
          {overlayActive && (
            <div
              style={{
                position: 'fixed',
                top: 0,
                left: 0,
                right: 0,
                bottom: 0,
                zIndex: 3000,
                background: 'transparent',
                pointerEvents: 'auto',
                cursor: 'default'
              }}
              onMouseDown={(e) => {
                // Prevent the click from propagating to other components
                e.preventDefault();
                e.stopPropagation();
                handleCloseChatBubble();
              }}
            />
          )}
          
          {/* Bubble container */}
          <div 
            style={{
              position: 'fixed',
              left: chatBubble.anchor.x,
              top: chatBubble.anchor.y,
              transform: 'translate(-50%, 0)',
              zIndex: 4000,
            }}
            onMouseDown={(e) => {
              // Prevent clicks on bubble from propagating to overlay or other components
              e.preventDefault();
              e.stopPropagation();
            }}
          >
            <ChatBubble
              visible={chatBubble.visible}
              chartType={chatBubble.chartId ? charts.find(c => c.id === chatBubble.chartId)?.type || 'line' : 'line'}
              onChartTypeSelect={handleChartTypeSelect}
              onClose={handleCloseChatBubble}
              onExited={handleBubbleExited}
            />
          </div>
        </>
      )}
    </div>
  );
};

export default ChartMakerCanvas;
                        