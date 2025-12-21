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
// DataSummaryView now uses CARDINALITY_VIEW_API internally (no imports needed)
import { DataSummaryView } from '@/components/shared/DataSummaryView';
import { useToast } from '@/hooks/use-toast';
import ChartNoteEditor from './rich-text-note/ChartNoteEditor';
import { TextBoxToolbar } from '@/components/LaboratoryMode/components/CanvasArea/text-box/TextBoxToolbar';
import { DEFAULT_CHART_NOTE_FORMATTING } from './rich-text-note/types';
import type { TextAlignOption } from '@/components/LaboratoryMode/components/CanvasArea/text-box/types';
import { TEXT_STYLE_PRESETS } from '@/components/LaboratoryMode/components/CanvasArea/text-box/constants';

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

  // State for rich text note editing
  const [editingNoteChartId, setEditingNoteChartId] = useState<string | null>(null);
  const [showNoteToolbar, setShowNoteToolbar] = useState(false);
  
  // Local state for note editing - prevents lag by not saving on every keystroke
  const [localNoteState, setLocalNoteState] = useState<Record<string, { value: string; html?: string }>>({});

  // Handle note input change - update LOCAL state only (no store update = no lag)
  const handleNoteChange = (chartId: string, value: string, html?: string) => {
    // Only update local state - don't call updateSettings to prevent lag
    setLocalNoteState(prev => ({
      ...prev,
      [chartId]: { value, html }
    }));
  };

  // Handle note commit - save to store on blur/commit
  const handleNoteCommit = (chartId: string, value: string, html: string) => {
    // Now save to store - this only happens on blur/commit, not every keystroke
    const chart = charts.find(c => c.id === chartId);
    if (chart) {
      const updatedCharts = charts.map(c =>
        c.id === chartId ? { ...c, note: value, noteHtml: html } : c
      );
      updateSettings(atomId, { charts: updatedCharts });
    }
    
    // Clear local state for this chart
    setLocalNoteState(prev => {
      const next = { ...prev };
      delete next[chartId];
      return next;
    });
    
    setEditingNoteChartId(null);
    setShowNoteToolbar(false);
  };

  // Handle note cancel - discard local changes
  const handleNoteCancel = (chartId: string) => {
    // Clear local state without saving
    setLocalNoteState(prev => {
      const next = { ...prev };
      delete next[chartId];
      return next;
    });
    
    setEditingNoteChartId(null);
    setShowNoteToolbar(false);
  };

  // Get current note value - use local state if editing, otherwise use persisted state
  const getNoteValue = (chartId: string) => {
    if (editingNoteChartId === chartId && localNoteState[chartId]) {
      return localNoteState[chartId].value;
    }
    const chart = charts.find(c => c.id === chartId);
    return chart?.note || '';
  };

  // Get current note HTML - use local state if editing, otherwise use persisted state
  const getNoteHtml = (chartId: string) => {
    if (editingNoteChartId === chartId && localNoteState[chartId]) {
      return localNoteState[chartId].html;
    }
    const chart = charts.find(c => c.id === chartId);
    return chart?.noteHtml;
  };

  // Get current note formatting for a chart
  const getNoteFormatting = (chartId: string) => {
    const chart = charts.find(c => c.id === chartId);
    return chart?.noteFormatting || DEFAULT_CHART_NOTE_FORMATTING;
  };

  // Handle note formatting change - map to TextBoxToolbar format
  // Also capture updated HTML from editor if it's currently being edited
  const handleNoteFormattingChange = (chartId: string, updates: {
    fontFamily?: string;
    fontSize?: number;
    bold?: boolean;
    italic?: boolean;
    underline?: boolean;
    strikethrough?: boolean;
    textColor?: string;
    backgroundColor?: string;
    textAlign?: 'left' | 'center' | 'right';
  }) => {
    const chart = charts.find(c => c.id === chartId);
    if (chart) {
      const currentFormatting = chart.noteFormatting || DEFAULT_CHART_NOTE_FORMATTING;
      
      // If editor is active, capture current HTML to preserve formatting applied via execCommand
      let updatedHtml = chart.noteHtml;
      if (editingNoteChartId === chartId) {
        const editorElement = document.querySelector('[data-chart-note-editor="true"]') as HTMLElement;
        if (editorElement) {
          updatedHtml = editorElement.innerHTML;
          // Also update local state with the new HTML
          setLocalNoteState(prev => {
            const current = prev[chartId];
            if (current) {
              return {
                ...prev,
                [chartId]: {
                  ...current,
                  html: updatedHtml
                }
              };
            }
            return prev;
          });
        }
      }
      
      // Save formatting to store immediately (formatting changes are less frequent than typing)
      const updatedCharts = charts.map(c =>
        c.id === chartId 
          ? { 
              ...c, 
              noteFormatting: { 
                ...currentFormatting,
                ...updates
              },
              // Update HTML if editor is active to preserve formatting
              ...(updatedHtml && updatedHtml !== c.noteHtml ? { noteHtml: updatedHtml } : {})
            } 
          : c
      );
      updateSettings(atomId, { charts: updatedCharts });
    }
  };

  // Helper to check if editor has selection
  const hasNoteEditorSelection = (chartId: string): boolean => {
    if (editingNoteChartId !== chartId) return false;
    const editorElement = document.querySelector('[data-chart-note-editor="true"]') as HTMLElement;
    if (!editorElement) return false;
    const selection = window.getSelection();
    return !!(selection && selection.rangeCount > 0 && !selection.isCollapsed);
  };

  // Helper to run execCommand on note editor
  const runNoteEditorCommand = (chartId: string, command: string, value?: string): boolean => {
    if (editingNoteChartId !== chartId) return false;
    const editorElement = document.querySelector('[data-chart-note-editor="true"]') as HTMLElement;
    if (!editorElement) return false;
    
    editorElement.focus();
    try {
      return document.execCommand(command, false, value);
    } catch (e) {
      return false;
    }
  };

  // Sync HTML after formatting command - ensures HTML is captured after execCommand
  const syncNoteHtmlAfterFormatting = (chartId: string) => {
    if (editingNoteChartId === chartId) {
      setTimeout(() => {
        const editorElement = document.querySelector('[data-chart-note-editor="true"]') as HTMLElement;
        if (editorElement) {
          const updatedHtml = editorElement.innerHTML;
          const chart = charts.find(c => c.id === chartId);
          if (chart && updatedHtml !== chart.noteHtml) {
            const updatedCharts = charts.map(c =>
              c.id === chartId ? { ...c, noteHtml: updatedHtml } : c
            );
            updateSettings(atomId, { charts: updatedCharts });
          }
        }
      }, 0);
    }
  };

  // TextBoxToolbar handlers for chart notes - apply via execCommand when possible
  const handleNoteFontFamilyChange = (chartId: string, font: string) => {
    const hasSelection = hasNoteEditorSelection(chartId);
    if (hasSelection) {
      runNoteEditorCommand(chartId, 'fontName', font);
      syncNoteHtmlAfterFormatting(chartId);
    }
    handleNoteFormattingChange(chartId, { fontFamily: font });
  };

  const handleNoteIncreaseFontSize = (chartId: string) => {
    const formatting = getNoteFormatting(chartId);
    const newSize = Math.min(formatting.fontSize + 1, 72);
    // Note: execCommand fontSize uses 1-7 scale, so we apply via CSS instead
    handleNoteFormattingChange(chartId, { fontSize: newSize });
  };

  const handleNoteDecreaseFontSize = (chartId: string) => {
    const formatting = getNoteFormatting(chartId);
    const newSize = Math.max(formatting.fontSize - 1, 8);
    handleNoteFormattingChange(chartId, { fontSize: newSize });
  };

  const handleNoteToggleBold = (chartId: string) => {
    const formatting = getNoteFormatting(chartId);
    const newBold = !formatting.bold;
    const hasSelection = hasNoteEditorSelection(chartId);
    if (hasSelection) {
      runNoteEditorCommand(chartId, 'bold');
      syncNoteHtmlAfterFormatting(chartId);
    }
    handleNoteFormattingChange(chartId, { bold: newBold });
  };

  const handleNoteToggleItalic = (chartId: string) => {
    const formatting = getNoteFormatting(chartId);
    const newItalic = !formatting.italic;
    const hasSelection = hasNoteEditorSelection(chartId);
    if (hasSelection) {
      runNoteEditorCommand(chartId, 'italic');
      syncNoteHtmlAfterFormatting(chartId);
    }
    handleNoteFormattingChange(chartId, { italic: newItalic });
  };

  const handleNoteToggleUnderline = (chartId: string) => {
    const formatting = getNoteFormatting(chartId);
    const newUnderline = !formatting.underline;
    const hasSelection = hasNoteEditorSelection(chartId);
    if (hasSelection) {
      runNoteEditorCommand(chartId, 'underline');
      syncNoteHtmlAfterFormatting(chartId);
    }
    handleNoteFormattingChange(chartId, { underline: newUnderline });
  };

  const handleNoteToggleStrikethrough = (chartId: string) => {
    const formatting = getNoteFormatting(chartId);
    const newStrikethrough = !formatting.strikethrough;
    const hasSelection = hasNoteEditorSelection(chartId);
    if (hasSelection) {
      runNoteEditorCommand(chartId, 'strikeThrough');
      syncNoteHtmlAfterFormatting(chartId);
    }
    handleNoteFormattingChange(chartId, { strikethrough: newStrikethrough });
  };

  const handleNoteAlign = (chartId: string, align: TextAlignOption) => {
    const hasSelection = hasNoteEditorSelection(chartId);
    if (hasSelection) {
      const command = align === 'center' ? 'justifyCenter' : align === 'right' ? 'justifyRight' : 'justifyLeft';
      runNoteEditorCommand(chartId, command);
      syncNoteHtmlAfterFormatting(chartId);
    }
    handleNoteFormattingChange(chartId, { textAlign: align });
  };

  const handleNoteColorChange = (chartId: string, color: string) => {
    const hasSelection = hasNoteEditorSelection(chartId);
    if (hasSelection) {
      runNoteEditorCommand(chartId, 'foreColor', color);
      syncNoteHtmlAfterFormatting(chartId);
    }
    handleNoteFormattingChange(chartId, { textColor: color });
  };

  const handleNoteBackgroundColorChange = (chartId: string, color: string) => {
    const hasSelection = hasNoteEditorSelection(chartId);
    if (hasSelection) {
      runNoteEditorCommand(chartId, 'backColor', color) || runNoteEditorCommand(chartId, 'hiliteColor', color);
      syncNoteHtmlAfterFormatting(chartId);
    }
    handleNoteFormattingChange(chartId, { backgroundColor: color });
  };

  const handleNoteApplyTextStyle = (chartId: string, preset: typeof TEXT_STYLE_PRESETS[number]) => {
    const hasSelection = hasNoteEditorSelection(chartId);
    if (hasSelection) {
      if (preset.bold) runNoteEditorCommand(chartId, 'bold');
      if (preset.italic) runNoteEditorCommand(chartId, 'italic');
      if (preset.underline) runNoteEditorCommand(chartId, 'underline');
      if (preset.strikethrough) runNoteEditorCommand(chartId, 'strikeThrough');
      syncNoteHtmlAfterFormatting(chartId);
    }
    handleNoteFormattingChange(chartId, {
      fontSize: preset.fontSize,
      bold: preset.bold ?? false,
      italic: preset.italic ?? false,
      underline: preset.underline ?? false,
      strikethrough: preset.strikethrough ?? false,
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
      // 🔧 CRITICAL FIX: Get fresh charts from store to avoid stale state and prevent duplicates
      const currentAtom = useLaboratoryStore.getState().getAtom(atomId);
      const currentSettings = (currentAtom?.settings as any) || {};
      const currentCharts = currentSettings.charts || charts;
      
      // Find the exact chart by ID to ensure we're updating the right one
      const chartIndex = currentCharts.findIndex(c => c.id === chart.id);
      if (chartIndex === -1) {
        console.warn('⚠️ [TITLE-CHANGE] Chart not found, skipping title update', { chartId: chart.id });
        return;
      }
      
      // Update by index to prevent duplicates
      const updatedCharts = [...currentCharts];
      updatedCharts[chartIndex] = {
        ...currentCharts[chartIndex], // Preserve all properties
        title: newTitle // Only update title
      };
      
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
        {/* Data Summary - Unified component with metadata support */}
        {dataSource && (atom?.settings as any)?.showDataSummary && (
          <DataSummaryView
            objectName={dataSource}
            atomId={atomId}
            title="Data Summary"
            subtitle="Data in detail"
            subtitleClickable={!!dataSource}
            onSubtitleClick={() => {
              if (dataSource) {
                window.open(`/dataframe?name=${encodeURIComponent(dataSource)}`, '_blank');
              }
            }}
          />
        )}

        {/* Legacy cardinality view removed - using DataSummaryView instead */}

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
                          if (!chart.filters || Object.keys(chart.filters).length === 0) return null;
                          
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
                         <div 
                           className="mt-2 w-full flex-shrink-0 relative" 
                           onClick={(e) => e.stopPropagation()}
                           onFocusCapture={() => {
                             if (editingNoteChartId === chart.id) {
                               setShowNoteToolbar(true);
                             }
                           }}
                           onBlurCapture={(e) => {
                             const relatedTarget = e.relatedTarget as HTMLElement;
                             // Don't hide toolbar if focus is moving to toolbar
                             if (relatedTarget && (
                               relatedTarget.closest('[data-text-toolbar-root]') ||
                               relatedTarget.closest('[role="popover"]') ||
                               relatedTarget.closest('[data-radix-popover-content]')
                             )) {
                               return;
                             }
                             // Delay to allow toolbar interactions
                             setTimeout(() => {
                               if (!document.activeElement?.closest('[data-text-toolbar-root]') &&
                                   !document.activeElement?.closest('[data-chart-note-editor="true"]')) {
                                 setShowNoteToolbar(false);
                               }
                             }, 200);
                           }}
                         >
                           {showNoteToolbar && editingNoteChartId === chart.id && (
                             <div className="absolute left-1/2 top-0 z-10 -translate-x-1/2 -translate-y-full mb-2">
                               <TextBoxToolbar
                                 fontFamily={chart.noteFormatting?.fontFamily || DEFAULT_CHART_NOTE_FORMATTING.fontFamily}
                                 onFontFamilyChange={(font) => handleNoteFontFamilyChange(chart.id, font)}
                                 fontSize={chart.noteFormatting?.fontSize || DEFAULT_CHART_NOTE_FORMATTING.fontSize}
                                 onIncreaseFontSize={() => handleNoteIncreaseFontSize(chart.id)}
                                 onDecreaseFontSize={() => handleNoteDecreaseFontSize(chart.id)}
                                 onApplyTextStyle={(preset) => handleNoteApplyTextStyle(chart.id, preset)}
                                 bold={chart.noteFormatting?.bold || false}
                                 italic={chart.noteFormatting?.italic || false}
                                 underline={chart.noteFormatting?.underline || false}
                                 strikethrough={chart.noteFormatting?.strikethrough || false}
                                 onToggleBold={() => handleNoteToggleBold(chart.id)}
                                 onToggleItalic={() => handleNoteToggleItalic(chart.id)}
                                 onToggleUnderline={() => handleNoteToggleUnderline(chart.id)}
                                 onToggleStrikethrough={() => handleNoteToggleStrikethrough(chart.id)}
                                 align={(chart.noteFormatting?.textAlign || 'left') as TextAlignOption}
                                 onAlign={(align) => handleNoteAlign(chart.id, align)}
                                 color={chart.noteFormatting?.textColor || DEFAULT_CHART_NOTE_FORMATTING.textColor}
                                 onColorChange={(color) => handleNoteColorChange(chart.id, color)}
                                 backgroundColor={chart.noteFormatting?.backgroundColor || DEFAULT_CHART_NOTE_FORMATTING.backgroundColor}
                                 onBackgroundColorChange={(color) => handleNoteBackgroundColorChange(chart.id, color)}
                               />
                             </div>
                           )}
                           <ChartNoteEditor
                             value={getNoteValue(chart.id)}
                             html={getNoteHtml(chart.id)}
                             formatting={chart.noteFormatting || DEFAULT_CHART_NOTE_FORMATTING}
                             isEditing={editingNoteChartId === chart.id}
                             onValueChange={(value, html) => handleNoteChange(chart.id, value, html)}
                             onCommit={(value, html) => handleNoteCommit(chart.id, value, html)}
                             onCancel={() => handleNoteCancel(chart.id)}
                             onFormattingChange={(formatting) => handleNoteFormattingChange(chart.id, formatting)}
                             onClick={() => {
                               setEditingNoteChartId(chart.id);
                               setShowNoteToolbar(true);
                               // Initialize local state with current note when starting to edit
                               if (!localNoteState[chart.id]) {
                                 setLocalNoteState(prev => ({
                                   ...prev,
                                   [chart.id]: {
                                     value: chart.note || '',
                                     html: chart.noteHtml
                                   }
                                 }));
                               }
                             }}
                           />
                         </div>
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
                        