import React, { useState, useRef, useEffect } from 'react';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';
import { Switch } from '@/components/ui/switch';
import { BarChart3, Settings, Filter, Eye, EyeOff, Edit3, Palette, ChevronDown, ChevronUp, X, Plus, RotateCcw, Database, Maximize2, ArrowUp, ArrowDown, FilterIcon, TrendingUp } from 'lucide-react';
import { ExploreData } from '../ExploreAtom';
import RechartsChartRenderer from '@/templates/charts/RechartsChartRenderer';
import { EXPLORE_API, TEXT_API, INSIGHT_API } from '@/lib/api';
import { resolveTaskResponse } from '@/lib/taskQueue';
import { toast } from '@/components/ui/use-toast';
import './ExploreCanvas.css';
import ChatBubble from '../../chart-maker/components/ChatBubble';
import { Dialog, DialogContent, DialogTrigger } from '@/components/ui/dialog';
import { ContextMenu, ContextMenuContent, ContextMenuItem, ContextMenuSub, ContextMenuSubContent, ContextMenuSubTrigger, ContextMenuTrigger, ContextMenuSeparator } from '@/components/ui/context-menu';
import { Checkbox } from '@/components/ui/checkbox';
import Table from '@/templates/tables/table';
import { SingleSelectDropdown, MultiSelectDropdown } from '@/templates/dropdown';
import { safeStringify } from '@/utils/safeStringify';

// Chart color palette using specified base colors and lighter shades
const CHART_COLORS = [
  '#FFBD59', '#FFC878', '#FFD897',
  '#41C185', '#5CD29A', '#78E3AF',
  '#458EE2', '#6BA4E8', '#91BAEE',
  '#F5F5F5', '#E0E0E0', '#C5C5C5'
];

const CHART_FONT = `'Inter', 'Segoe UI', sans-serif`;

const toComparableString = (value: unknown): string => {
  const serialized = safeStringify(value);
  if (typeof serialized === 'string') {
    return serialized;
  }
  return String(serialized);
};

const deepEqual = (a: unknown, b: unknown): boolean => toComparableString(a) === toComparableString(b);

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

interface ExploreCanvasProps {
  data: ExploreData;
  isApplied: boolean;
  onDataChange: (data: Partial<ExploreData>) => void;
  onChartDataChange?: (chartData: ChartData | null) => void;
}

interface ChartData {
  status: string;
  chart_type: string;
  data: any; // can be array or object depending on chart type
  metadata: any;
}

const normaliseChartTaskResult = (payload: any): { rows: any[]; full: ChartData | null } => {
  if (!payload) {
    return { rows: [], full: null };
  }

  let current = payload;
  const seen = new Set<object>();
  while (current && typeof current === 'object' && 'result' in current && typeof current.result === 'object') {
    const next = (current as { result: any }).result;
    if (!next || typeof next !== 'object' || seen.has(next)) {
      break;
    }
    seen.add(next);
    current = next;
  }

  const extractArray = (entry: any): any[] | undefined => {
    if (!entry || typeof entry !== 'object') {
      return Array.isArray(entry) ? entry : undefined;
    }

    if (Array.isArray(entry)) {
      return entry;
    }

    if (Array.isArray(entry.rows)) {
      return entry.rows;
    }

    if (Array.isArray(entry.data)) {
      return entry.data;
    }

    if (Array.isArray(entry.values)) {
      return entry.values;
    }

    return undefined;
  };

  const candidateData = [
    extractArray(current?.data),
    extractArray(current?.chart_data),
    extractArray(current?.result?.data),
    extractArray(current?.result?.chart_data),
    Array.isArray(current) ? current : undefined,
  ];

  const resolvedRows = candidateData.find((entry) => Array.isArray(entry) && entry.length > 0) ?? [];

  const metadata =
    current?.chart_metadata ||
    current?.chart_data?.metadata ||
    current?.metadata ||
    current?.result?.chart_metadata ||
    current?.result?.chart_data?.metadata ||
    current?.result?.metadata ||
    null;

  const chartType =
    current?.chart_type ||
    current?.chart_data?.chart_type ||
    current?.result?.chart_type ||
    current?.result?.chart_data?.chart_type ||
    payload?.chart_type ||
    'bar_chart';

  const fullResult: ChartData = {
    status: current?.status || payload?.status || 'success',
    chart_type: chartType,
    data: resolvedRows,
    metadata,
  };

  return { rows: resolvedRows, full: fullResult };
};

const ExploreCanvas: React.FC<ExploreCanvasProps> = ({ data, isApplied, onDataChange, onChartDataChange }) => {
  const [chartDataSets, setChartDataSets] = useState<{ [idx: number]: any }>(data.chartDataSets || {});
  const svgRef = useRef<SVGSVGElement>(null);
  const [chartData, setChartData] = useState<ChartData | null>(null);
  const [chartResultsByIndex, setChartResultsByIndex] = useState<Record<number, ChartData>>({});

  const resolveChartRows = (chartIndex: number): any[] => {
    const direct = chartDataSets[chartIndex];
    if (Array.isArray(direct)) {
      return direct;
    }
    const fallback = chartResultsByIndex[chartIndex]?.data;
    if (Array.isArray(fallback)) {
      return fallback;
    }
    return Array.isArray(direct) ? direct : [];
  };
  const [isLoading, setIsLoading] = useState<{ [chartIndex: number]: boolean }>({});
  const [error, setError] = useState<string | null>(null);
  
  // Clear error when component unmounts or when new chart is generated
  const clearError = () => setError(null);
  
  // Helper function to safely check loading state for a specific chart
  const isChartLoading = (chartIndex: number) => isLoading[chartIndex] || false;
  
  // Helper function to validate Y-axes (filters out empty strings)
  const hasValidYAxes = (yAxes: string[]): boolean => {
    const validYAxes = yAxes?.filter(y => y && y.trim() !== '') || [];
    return validYAxes.length > 0;
  };

  // Helper function to safely trigger chart generation with debouncing
  const safeTriggerChartGeneration = (chartIndex: number, config: any, delay: number = 100) => {
    // Clear any existing timeout for this chart
    if (chartGenerationTimeouts.current[chartIndex]) {
      clearTimeout(chartGenerationTimeouts.current[chartIndex]!);
    }
    
    // Set new timeout
    chartGenerationTimeouts.current[chartIndex] = setTimeout(() => {
      generateChart(chartIndex, false, config);
      chartGenerationTimeouts.current[chartIndex] = null;
    }, delay);
  };

  const getTextId = (index: number) => {
    const base = (safeData.dataframe || 'explore').replace(/[^a-z0-9-_]/gi, '_').toLowerCase();
    return `${base}-chart-${index}`;
  };

  const fetchChartNote = async (index: number) => {
    const textId = getTextId(index);
    try {
      const res = await fetch(`${TEXT_API}/text/${textId}`);
      if (res.ok) {
        const data = await res.json();
        setChartNotes(prev => ({ ...prev, [index]: data?.spec?.content?.value || '' }));
      }
    } catch (err) {
      console.error('Failed to fetch note', err);
    }
  };

  const saveChartNote = async (index: number) => {
    const textId = getTextId(index);
    const value = chartNotes[index] || '';
    const payload = {
      textId,
      appId: 'explore',
      type: 'widget',
      name: 'chart-note',
      spec: { content: { format: 'plain', value } }
    };
    try {
      let res = await fetch(`${TEXT_API}/text/${textId}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
      });
      if (res.status === 404) {
        res = await fetch(`${TEXT_API}/text`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(payload)
        });
      }
      if (!res.ok) {
        throw new Error(`Failed to save note: ${res.status}`);
      }
    } catch (err) {
      console.error('Error saving note', err);
      toast({ description: 'Failed to save note', variant: 'destructive' });
    }
  };

  const handleNoteChange = (index: number, value: string) => {
    setChartNotes(prev => ({ ...prev, [index]: value }));
  };

  const handleNoteKeyDown = (index: number, e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      saveChartNote(index);
    }
  };

  // 🤖 AI Insight Generation using dedicated insight service
  const generateAIInsights = async (chartIndex: number) => {
    if (!chartDataSets[chartIndex] || !chartConfigs[chartIndex]) {
      console.log(`⚠️ No chart data available for insights generation (chart ${chartIndex})`);
      return;
    }

    const chartData = chartDataSets[chartIndex];
    const config = chartConfigs[chartIndex];
    
    try {
      // console.log(`🤖 Generating AI insights for chart ${chartIndex} using dedicated insight service...`);
      
      const insightResponse = await fetch(`${INSIGHT_API}/generate`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          chart_data: chartData,
          chart_config: {
            chart_type: config.chartType,
            x_axis: config.xAxis,
            y_axis: config.yAxes?.[0] || '',
            title: config.title || '',
            aggregation: config.aggregation || 'sum'
          },
          chart_metadata: {
            dataframe: safeData.dataframe,
            filters_applied: !!appliedFilters[chartIndex]
          },
          session_id: `chart_insights_${Date.now()}`
        })
      });
      
      if (insightResponse.ok) {
        const insightData = await insightResponse.json();
        
        if (insightData.success && insightData.insight) {
          // console.log(`✅ Generated AI insight for chart ${chartIndex}:`, insightData.insight);
          
          // Auto-populate the note box with AI insights
          setChartNotes(prev => ({ ...prev, [chartIndex]: insightData.insight }));
          
          // Auto-save the AI insight
          setTimeout(() => saveChartNote(chartIndex), 500);
          
          toast({
            description: `🤖 AI insight generated for chart ${chartIndex + 1}`,
            variant: 'default'
          });
        } else {
          console.error('AI insight generation failed:', insightData.insight || 'Unknown error');
        }
      } else {
        console.error('Failed to call insight API:', insightResponse.status);
        toast({
          description: 'Failed to generate AI insights',
          variant: 'destructive'
        });
      }
    } catch (error) {
      console.error('Error generating AI insights:', error);
      toast({
        description: 'AI insight generation error',
        variant: 'destructive'
      });
    }
  };
  
  // State for dropdown positioning
  
  // Helper function to capitalize first letter
  const capitalizeFirstLetter = (str: string) => {
    return str.charAt(0).toUpperCase() + str.slice(1);
  };
  

  const [chartSettingsVisible, setChartSettingsVisible] = useState<{ [key: number]: boolean }>({});
  const [chartFiltersVisible, setChartFiltersVisible] = useState<{ [key: number]: boolean }>({});
  const [isLoadingColumnSummary, setIsLoadingColumnSummary] = useState(false);
  
  // Per-card collapse states
  const [dataSummaryCollapsed, setDataSummaryCollapsed] = useState<{ [key: number]: boolean }>({});
  const [chartConfigCollapsed, setChartConfigCollapsed] = useState<{ [key: number]: boolean }>({});
  
  // Filter state for each chart - now supports arrays for multi-selection
  const [chartFilters, setChartFilters] = useState<{ [chartIndex: number]: { [identifier: string]: string[] } }>({});

  // Unique values for each identifier
  const [identifierUniqueValues, setIdentifierUniqueValues] = useState<{ [identifier: string]: string[] }>({});
  const [loadingUniqueValues, setLoadingUniqueValues] = useState<{ [identifier: string]: boolean }>({});
  const [appliedFilters, setAppliedFilters] = useState<{ [chartIndex: number]: boolean }>({});
  const [originalChartData, setOriginalChartData] = useState<{ [chartIndex: number]: any }>({});
  const [chartGenerated, setChartGenerated] = useState<{ [chartIndex: number]: boolean }>(data.chartGenerated || {});
  const [chartThemes, setChartThemes] = useState<{ [chartIndex: number]: string }>({});
  const [chartOptions, setChartOptions] = useState<{ [chartIndex: number]: { grid: boolean; legend: boolean; axisLabels: boolean; dataLabels: boolean } }>({});
  const [chartNotes, setChartNotes] = useState<{ [chartIndex: number]: string }>({});
  const [dateRanges, setDateRanges] = useState<{ [columnName: string]: { min_date: string; max_date: string } }>({});
  const [showUniqueToggles, setShowUniqueToggles] = useState<{ [chartIndex: number]: boolean }>({});

  // Cardinality View state
  const [cardinalityData, setCardinalityData] = useState<any[]>([]);
  const [cardinalityLoading, setCardinalityLoading] = useState(false);
  const [cardinalityError, setCardinalityError] = useState<string | null>(null);

  const getUniqueValuesForColumn = React.useCallback((identifier: string): string[] => {
    if (!identifier) {
      return [];
    }

    if (identifierUniqueValues[identifier]) {
      return identifierUniqueValues[identifier];
    }

    if (Array.isArray(safeData.columnSummary)) {
      const colInfo: any = safeData.columnSummary.find((c: any) => c && c.column === identifier);
      if (colInfo && Array.isArray(colInfo.unique_values)) {
        const maxValues = colInfo.is_numerical ? 1000 : 200;
        return colInfo.unique_values
          .slice(0, maxValues)
          .map((value: any) => String(value));
      }
    }

    return [];
  }, [identifierUniqueValues, safeData.columnSummary]);

  // Sorting and filtering state for Cardinality View
  const [sortColumn, setSortColumn] = useState<string>('unique_count');
  const [sortDirection, setSortDirection] = useState<'asc' | 'desc'>('desc');
  const [columnFilters, setColumnFilters] = useState<Record<string, string[]>>({});

  // Debouncing mechanism to prevent multiple chart generations
  const chartGenerationTimeouts = useRef<{ [chartIndex: number]: NodeJS.Timeout | null }>({});
  const persistedStateRef = useRef<string>();

  // Add error handling and default values
  const safeData = {
    dimensions: [],
    measures: [],
    graphLayout: { numberOfGraphsInRow: 1, rows: 1 },
    chartType: 'line',
    xAxis: '',
    yAxis: '',
    xAxisLabel: '',
    yAxisLabel: '',
    title: '',
    dimensionIdentifiers: {},
    selectedIdentifiers: {},
    allColumns: [],
    numericalColumns: [],
    fallbackDimensions: [],
    fallbackMeasures: [],
    dataframe: '',
    aggregation: 'no_aggregation', // Default to no aggregation
    weightColumn: '',
    dateFilters: [],
    filterUnique: false, // Default to false
    chartConfigs: [],
    chartFilters: {},
    chartThemes: {},
    chartOptions: {},
    appliedFilters: {},
    chartDataSets: {},
    chartGenerated: {},
    chartNotes: {},
    columnSummary: [],
    ...data
  };

  const summaryDerivedIdentifiers = React.useMemo<string[]>(() => {
    if (!Array.isArray(safeData.columnSummary)) {
      return [];
    }

    const numericKeywords = ['int', 'integer', 'float', 'double', 'decimal', 'number', 'numeric', 'real', 'long', 'short'];

    const identifiers = safeData.columnSummary
      .filter((col: any) => col && typeof col.column === 'string')
      .filter((col: any) => {
        const columnName = col.column;
        if (!columnName) {
          return false;
        }

        const isNumeric = typeof col.is_numerical === 'boolean'
          ? col.is_numerical
          : (typeof col.data_type === 'string'
            ? numericKeywords.some(keyword => col.data_type.toLowerCase().includes(keyword))
            : false);

        return !isNumeric;
      })
      .map((col: any) => String(col.column)) as string[];

    return Array.from(new Set(identifiers));
  }, [safeData.columnSummary]);

  const summaryDerivedMeasures = React.useMemo<string[]>(() => {
    if (!Array.isArray(safeData.columnSummary)) {
      return [];
    }

    const numericKeywords = ['int', 'integer', 'float', 'double', 'decimal', 'number', 'numeric', 'real', 'long', 'short'];

    const measures = safeData.columnSummary
      .filter((col: any) => col && typeof col.column === 'string')
      .filter((col: any) => {
        if (typeof col.is_numerical === 'boolean') {
          return col.is_numerical;
        }

        if (typeof col.data_type === 'string') {
          const lowered = col.data_type.toLowerCase();
          return numericKeywords.some(keyword => lowered.includes(keyword));
        }

        return false;
      })
      .map((col: any) => String(col.column)) as string[];

    return Array.from(new Set(measures));
  }, [safeData.columnSummary]);

  const summaryDimensionMap = React.useMemo<Record<string, string[]>>(() => {
    if (summaryDerivedIdentifiers.length === 0) {
      return {};
    }
    return { columns: summaryDerivedIdentifiers };
  }, [summaryDerivedIdentifiers]);

  const classifierDimensions = safeData.columnClassifierConfig?.dimensions as Record<string, string[]> | undefined;

  const hasClassifierDimensions = React.useMemo(() => {
    if (!classifierDimensions) {
      return false;
    }

    return Object.values(classifierDimensions).some(ids => Array.isArray(ids) && ids.length > 0);
  }, [classifierDimensions]);

  const dimensionsWithIdentifiers = React.useMemo<Record<string, string[]>>(() => {
    if (hasClassifierDimensions && classifierDimensions) {
      return classifierDimensions;
    }

    return summaryDimensionMap;
  }, [classifierDimensions, hasClassifierDimensions, summaryDimensionMap]);

  const columnSummaryColumnSet = React.useMemo(() => {
    if (!Array.isArray(safeData.columnSummary)) {
      return new Set<string>();
    }

    const columns = safeData.columnSummary
      .map((col: any) => (col && typeof col.column === 'string' ? col.column : null))
      .filter((column): column is string => Boolean(column));

    return new Set(columns);
  }, [safeData.columnSummary]);

  const normaliseFilterColumnKey = React.useCallback((key: string) => {
    if (!key) {
      return key;
    }

    if (columnSummaryColumnSet.has(key)) {
      return key;
    }

    if (key.includes('_')) {
      const parts = key.split('_');
      for (let i = parts.length - 1; i >= 0; i--) {
        const candidate = parts.slice(i).join('_');
        if (columnSummaryColumnSet.has(candidate)) {
          return candidate;
        }
      }
    }

    return key;
  }, [columnSummaryColumnSet]);

  useEffect(() => {
    const nextChartFilters = safeData.chartFilters ?? {};
    const normalisedChartFilters = Object.entries(nextChartFilters).reduce(
      (acc, [idx, filters]) => {
        const source = filters || {};
        const transformed: { [identifier: string]: string[] } = {};

        Object.entries(source).forEach(([key, values]) => {
          const columnKey = normaliseFilterColumnKey(key);
          if (Array.isArray(values) && values.length > 0) {
            transformed[columnKey] = values.map(value => String(value));
          }
        });

        const chartIndex = Number(idx);
        if (!Number.isNaN(chartIndex)) {
          acc[chartIndex] = transformed;
        } else {
          (acc as Record<string, { [identifier: string]: string[] }>)[idx] = transformed;
        }

        return acc;
      },
      {} as { [chartIndex: number]: { [identifier: string]: string[] } }
    );

    setChartFilters(prev => (deepEqual(prev, normalisedChartFilters) ? prev : normalisedChartFilters));

    const nextChartThemes = safeData.chartThemes ?? {};
    setChartThemes(prev => (deepEqual(prev, nextChartThemes) ? prev : nextChartThemes));

    const nextChartOptions = safeData.chartOptions ?? {};
    setChartOptions(prev => (deepEqual(prev, nextChartOptions) ? prev : nextChartOptions));

    const nextAppliedFilters = safeData.appliedFilters ?? {};
    setAppliedFilters(prev => (deepEqual(prev, nextAppliedFilters) ? prev : nextAppliedFilters));

    const nextChartDataSets = safeData.chartDataSets ?? {};
    setChartDataSets(prev => {
      if (
        Object.keys(nextChartDataSets).length === 0 &&
        prev &&
        Object.keys(prev).length > 0
      ) {
        return prev;
      }
      return deepEqual(prev, nextChartDataSets) ? prev : nextChartDataSets;
    });

    const nextChartGenerated = safeData.chartGenerated ?? {};
    setChartGenerated(prev => {
      if (
        Object.keys(nextChartGenerated).length === 0 &&
        prev &&
        Object.keys(prev).length > 0
      ) {
        return prev;
      }
      return deepEqual(prev, nextChartGenerated) ? prev : nextChartGenerated;
    });

    const nextChartNotes = safeData.chartNotes ?? {};
    setChartNotes(prev => (deepEqual(prev, nextChartNotes) ? prev : nextChartNotes));
  }, [
    safeData.chartFilters,
    safeData.chartThemes,
    safeData.chartOptions,
    safeData.appliedFilters,
    safeData.chartDataSets,
    safeData.chartGenerated,
    safeData.chartNotes,
    normaliseFilterColumnKey,
  ]);

  // Update chartConfigs when AI-generated data arrives
  useEffect(() => {
    if (safeData.applied && safeData.xAxis && safeData.yAxis && chartConfigs.length > 0) {
      const shouldUpdate = chartConfigs[0].xAxis === '' || chartConfigs[0].yAxes[0] === '';
      
      if (shouldUpdate) {
        // console.log('🔄 Updating chart config with AI-generated values:', {
        //   xAxis: safeData.xAxis,
        //   yAxis: safeData.yAxis,
        //   chartType: safeData.chartType
        // });
        
        setChartConfigs(prev => [
          {
            ...prev[0],
            xAxis: safeData.xAxis,
            yAxes: [safeData.yAxis],
            chartType: safeData.chartType || 'bar_chart',
            aggregation: safeData.aggregation || 'sum'
          },
          ...prev.slice(1)
        ]);
      }
    }
  }, [safeData.applied, safeData.xAxis, safeData.yAxis, safeData.chartType]);

  // 🎯 Simple AI integration: AI populates once, then manual takes over completely
  useEffect(() => {
    // Only run AI integration once when AI operation completes
    if (safeData.applied && safeData.operationCompleted && safeData.aiConfig && !safeData.aiIntegrated) {
      // console.log('📊 AI integration - one-time setup, then full manual control');
      
      // 🔧 One-time AI data integration
      if (safeData.chartConfigs && Array.isArray(safeData.chartConfigs)) {
        // console.log('✅ Integrating AI chartConfigs once:', safeData.chartConfigs);
        // console.log(`📊 Setting ${safeData.chartConfigs.length} chart configurations:`);
        
        safeData.chartConfigs.forEach((config, idx) => {
          // console.log(`📊 Chart ${idx + 1} will be set to:`, {
          //   xAxis: config.xAxis,
          //   yAxes: config.yAxes,
          //   title: config.title,
          //   chartType: config.chartType
          // });
        });
        
        setChartConfigs(safeData.chartConfigs);
        
        // 🔧 CRITICAL: Automatically generate charts for AI configurations
        safeData.chartConfigs.forEach((config, idx) => {
          if (config.xAxis && config.yAxes && config.yAxes.length > 0 && config.yAxes[0]) {
            console.log(`🎯 Auto-generating chart ${idx + 1} for AI configuration:`, config);
            // Generate chart with a small delay to ensure state is updated
            setTimeout(() => {
              generateChart(idx, false, config);
            }, 100 * (idx + 1)); // Stagger the generation to avoid conflicts
          }
        });
        
        // Verify after setting
        // setTimeout(() => {
        //   console.log(`🔍 Verification - chartConfigs after setting:`, chartConfigs);
        // }, 100);
      }
      
      if (safeData.chartDataSets) {
        // console.log('✅ Integrating AI chart data once:', Object.keys(safeData.chartDataSets));
        setChartDataSets(safeData.chartDataSets);
        setChartGenerated(safeData.chartGenerated || {});
        
        // 🔧 Also set chartFilters for multiple charts
        if (safeData.chartFilters) {
          // console.log('✅ Integrating AI chart filters:', safeData.chartFilters);
          setChartFilters(safeData.chartFilters);
        }
        
        // 🔧 Set appliedFilters if filters exist
        if (safeData.appliedFilters) {
          // console.log('✅ Integrating AI applied filters:', safeData.appliedFilters);
          setAppliedFilters(safeData.appliedFilters);
        }
        
        if (safeData.chartNotes) setChartNotes(safeData.chartNotes);
        if (safeData.chartOptions) setChartOptions(safeData.chartOptions);
      }
      
      // Mark as integrated so this only runs once
      // COMMENTED OUT - causing infinite loop
      // onDataChange({ aiIntegrated: true });
      
      // console.log('✅ AI integration complete - switching to full manual control mode');
    }
  }, [safeData.applied, safeData.operationCompleted, safeData.aiConfig, safeData.aiIntegrated]);

  // Fetch cardinality data when dataframe is selected
  useEffect(() => {
    if (safeData.dataframe) {
      fetchCardinalityData();
    }
  }, [safeData.dataframe]);

  // Fetch cardinality data function
  const fetchCardinalityData = async () => {
    if (!safeData.dataframe) return;
    
    setCardinalityLoading(true);
    setCardinalityError(null);
    
    try {
      const response = await fetch(`${EXPLORE_API}/column_summary?object_name=${encodeURIComponent(safeData.dataframe)}`);
      if (response.ok) {
        const raw = await response.json();
        const summary = await resolveTaskResponse<{ summary?: any[] }>(raw);
        const summaryData = Array.isArray(summary.summary) ? summary.summary.filter(Boolean) : [];
        
        // Transform the data to match the cardinality format expected by the table
        const cardinalityFormatted = summaryData.map((col: any) => ({
          column: col.column,
          data_type: col.data_type,
          unique_count: col.unique_count,
          unique_values: col.unique_values || []
        }));
        
        setCardinalityData(cardinalityFormatted);
      } else {
        setCardinalityError('Failed to fetch cardinality data');
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


  // Multi-chart state
  const [chartConfigs, setChartConfigs] = useState(
    safeData.chartConfigs && Array.isArray(safeData.chartConfigs) && safeData.chartConfigs.length > 0
      ? safeData.chartConfigs
      : [
          {
            xAxis: safeData.xAxis || '',
            yAxes: [safeData.yAxis || ''], // Array to support multiple Y-axes
            xAxisLabel: safeData.xAxisLabel || '',
            yAxisLabels: [safeData.yAxisLabel || ''], // Array to support multiple Y-axis labels
            chartType: safeData.chartType || 'line_chart',
            aggregation: safeData.aggregation || 'no_aggregation', // Default to no aggregation
            weightColumn: safeData.weightColumn || '',
            title: safeData.title || '',
            legendField: safeData.legendField || '', // Field to use for creating multiple lines/series
            sortOrder: null,
            sortColumn: '',
          },
        ]
  );

  const [chatBubble, setChatBubble] = useState({
    visible: false,
    chartIndex: null as number | null,
    anchor: { x: 0, y: 0 }
  });
  const [chatBubbleShouldRender, setChatBubbleShouldRender] = useState(false);

  useEffect(() => {
    const fallbackConfig = {
      xAxis: safeData.xAxis || '',
      yAxes: [safeData.yAxis || ''],
      xAxisLabel: safeData.xAxisLabel || '',
      yAxisLabels: [safeData.yAxisLabel || ''],
      chartType: safeData.chartType || 'line_chart',
      aggregation: safeData.aggregation || 'no_aggregation',
      weightColumn: safeData.weightColumn || '',
      title: safeData.title || '',
      legendField: safeData.legendField || '',
      sortOrder: null as string | null,
      sortColumn: '',
    };

    const nextConfigs =
      safeData.chartConfigs && Array.isArray(safeData.chartConfigs) && safeData.chartConfigs.length > 0
        ? safeData.chartConfigs
        : [fallbackConfig];

    setChartConfigs(prev => (deepEqual(prev, nextConfigs) ? prev : nextConfigs));
  }, [
    safeData.chartConfigs,
    safeData.xAxis,
    safeData.yAxis,
    safeData.xAxisLabel,
    safeData.yAxisLabel,
    safeData.chartType,
    safeData.aggregation,
    safeData.weightColumn,
    safeData.legendField,
    safeData.title,
  ]);

  // Persist chart state changes to parent atom settings for saving/loading
  useEffect(() => {
    const primaryConfig = chartConfigs[0] || {};
    const payload: Partial<ExploreData> = {
      chartConfigs,
      chartFilters,
      chartThemes,
      chartOptions,
      chartDataSets,
      chartGenerated,
      appliedFilters,
      chartNotes,
      xAxis: primaryConfig.xAxis || '',
      yAxis: primaryConfig.yAxes?.[0] || '',
      xAxisLabel: primaryConfig.xAxisLabel || '',
      yAxisLabel: primaryConfig.yAxisLabels?.[0] || '',
      chartType: primaryConfig.chartType || 'line_chart',
      legendField: primaryConfig.legendField || '',
      aggregation: primaryConfig.aggregation || 'no_aggregation',
      weightColumn: primaryConfig.weightColumn || '',
      title: primaryConfig.title || '',
    };

    const serialized = toComparableString(payload);
    if (persistedStateRef.current !== serialized) {
      persistedStateRef.current = serialized;
      onDataChange(payload);
    }
  }, [
    chartConfigs,
    chartFilters,
    chartThemes,
    chartOptions,
    chartDataSets,
    chartGenerated,
    appliedFilters,
    chartNotes,
    onDataChange,
  ]);

  // Auto-generate charts on mount if data and configs exist
  useEffect(() => {
    chartConfigs.forEach((cfg, index) => {
      if (resolveChartRows(index).length === 0 && cfg.xAxis && hasValidYAxes(cfg.yAxes)) {
        safeTriggerChartGeneration(index, cfg, 0);
      }
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    chartConfigs.forEach((_, idx) => fetchChartNote(idx));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [chartConfigs.length, safeData.dataframe]);

  // COMMENTED OUT: Chart configuration right-click functionality
  // const openChartTypeTray = (e: React.MouseEvent, index: number) => {
  //   e.preventDefault();
  //   e.stopPropagation();
  //   setChatBubble({ visible: true, chartIndex: index, anchor: { x: e.clientX, y: e.clientY } });
  //   setChatBubbleShouldRender(true);
  // };

  // const handleChartTypeSelect = (type: string) => {
  //   if (chatBubble.chartIndex !== null) {
  //     const newConfigs = [...chartConfigs];
  //     const mappedType = `${type}_chart` as typeof newConfigs[number]['chartType'];

  //     // Reset legendField and notify when pie charts don't support segregation
  //     let legendField = newConfigs[chatBubble.chartIndex].legendField;
  //     if (mappedType === 'pie_chart' && legendField && legendField !== 'aggregate') {
  //       legendField = 'aggregate';
  //       toast({ description: 'Segregation of Field Value is not allowed for pie chart' });
  //     }

  //     newConfigs[chatBubble.chartIndex] = {
  //       ...newConfigs[chatBubble.chartIndex],
  //       chartType: mappedType,
  //       legendField
  //     };
  //     setChartConfigs(newConfigs);
  //     const cfg = newConfigs[chatBubble.chartIndex];
  //     if (cfg.xAxis && hasValidYAxes(cfg.yAxes)) {
  //       safeTriggerChartGeneration(chatBubble.chartIndex, cfg, 100);
  //     }
  //   }
  //   setChatBubble(prev => ({ ...prev, visible: false }));
  // };

  // const closeChatBubble = () => setChatBubble(prev => ({ ...prev, visible: false }));
  // const handleBubbleExited = () => setChatBubbleShouldRender(false);

  // Individual chart type change handlers (like evaluate atom)
  const handleChartTypeChange = (index: number, newType: 'bar_chart' | 'line_chart' | 'pie_chart' | 'area_chart' | 'scatter_chart') => {
    const newConfigs = [...chartConfigs];
    const mappedType = newType;

    // Reset legendField and notify when pie charts don't support segregation
    let legendField = newConfigs[index].legendField;
    if (mappedType === 'pie_chart' && legendField && legendField !== 'aggregate') {
      legendField = 'aggregate';
      toast({ description: 'Segregation of Field Value is not allowed for pie chart' });
    }

    newConfigs[index] = {
      ...newConfigs[index],
      chartType: mappedType,
      legendField
    };
    setChartConfigs(newConfigs);
    const cfg = newConfigs[index];
    if (cfg.xAxis && hasValidYAxes(cfg.yAxes)) {
      safeTriggerChartGeneration(index, cfg, 100);
    }
  };

  const handleOverlayClick = (e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    // closeChatBubble(); // COMMENTED OUT: Chat bubble functionality
    // setChatBubbleShouldRender(false); // COMMENTED OUT: Chat bubble functionality
  };

  // COMMENTED OUT: Chat bubble functionality
  // const overlayVisible =
  //   chatBubble.visible ||
  //   chatBubbleShouldRender;
  const overlayVisible = false; // Always false since chat bubble is disabled

  useEffect(() => {
    const handleClickOutside = () => {
      // closeChatBubble(); // COMMENTED OUT: Chat bubble functionality
      // setChatBubbleShouldRender(false); // COMMENTED OUT: Chat bubble functionality
    };
    if (
      false
      // || chatBubble.visible // COMMENTED OUT: Chat bubble functionality
    ) {
      document.addEventListener('click', handleClickOutside);
    }
    return () => document.removeEventListener('click', handleClickOutside);
  }, []); // COMMENTED OUT: chatBubble.visible dependency

  // Initialize data summary collapse state
  useEffect(() => {
    setDataSummaryCollapsed({ 0: false });
    
    // Initialize chart options for the first chart if not provided
    if (!chartOptions[0]) {
      setChartOptions({ 0: { grid: true, legend: true, axisLabels: true, dataLabels: true } });
    }

    // Initialize loading state for the first chart
    if (!isLoading[0]) {
      setIsLoading({ 0: false });
    }
    
    // Cleanup function to clear any pending chart generation timeouts
    return () => {
      Object.values(chartGenerationTimeouts.current).forEach(timeout => {
        if (timeout) clearTimeout(timeout);
      });
    };
  }, []);

  // Update chartConfigs if layout changes
  useEffect(() => {
    if (safeData.graphLayout.numberOfGraphsInRow === 2 && chartConfigs.length === 1) {
      // Add a second chart card while preserving the first one
      setChartConfigs(prev => [
        ...prev, // Keep existing chart
        {
          xAxis: '',
          yAxes: [''], // Add a new empty Y-axis
          xAxisLabel: '',
          yAxisLabels: [''], // Add a new empty Y-axis label
          chartType: 'line_chart',
          aggregation: 'no_aggregation', // Default to no aggregation
          weightColumn: '',
          title: '',
          legendField: '', // Field to use for creating multiple lines/series
          sortOrder: null,
          sortColumn: '',
        }
      ]);
      
      // Initialize states for the new chart only
      const newChartIndex = 1;
      
      // Filters are hidden by default - only show when user clicks filter icon
      setChartFiltersVisible(prev => ({
        ...prev,
        [newChartIndex]: false
      }));
      
      // Initialize collapse state for new chart
      setChartConfigCollapsed(prev => ({
        ...prev,
        [newChartIndex]: false
      }));
      
      // Initialize chart options for new chart
      setChartOptions(prev => ({
        ...prev,
        [newChartIndex]: { grid: true, legend: true, axisLabels: true, dataLabels: true }
      }));
      
      // Initialize loading state for new chart
      setIsLoading(prev => ({
        ...prev,
        [newChartIndex]: false
      }));

      setShowUniqueToggles(prev => ({
        ...prev,
        [newChartIndex]: false
      }));
      
    } else if (safeData.graphLayout.numberOfGraphsInRow === 1 && chartConfigs.length > 1) {
      // Keep only the first chart when switching to 1 graph per row
      setChartConfigs(prev => prev.slice(0, 1));
      
      // Clean up states for removed charts
      setChartFiltersVisible(prev => {
        const newState = { ...prev };
        Object.keys(newState).forEach(key => {
          const keyNum = parseInt(key);
          if (keyNum > 0) {
            delete newState[keyNum];
          }
        });
        return newState;
      });
      
      setChartConfigCollapsed(prev => {
        const newState = { ...prev };
        Object.keys(newState).forEach(key => {
          const keyNum = parseInt(key);
          if (keyNum > 0) {
            delete newState[keyNum];
          }
        });
        return newState;
      });
      
      setChartOptions(prev => {
        const newState = { ...prev };
        Object.keys(newState).forEach(key => {
          const keyNum = parseInt(key);
          if (keyNum > 0) {
            delete newState[keyNum];
          }
        });
        return newState;
      });
      
      setIsLoading(prev => {
        const newState = { ...prev };
        Object.keys(newState).forEach(key => {
          const keyNum = parseInt(key);
          if (keyNum > 0) {
            delete newState[keyNum];
          }
        });
        return newState;
      });
      
      // Clean up chart data for removed charts
      setChartDataSets(prev => {
        const newState = { ...prev };
        Object.keys(newState).forEach(key => {
          const keyNum = parseInt(key);
          if (keyNum > 0) {
            delete newState[keyNum];
          }
        });
        return newState;
      });

      setChartResultsByIndex(prev => {
        const newState = { ...prev };
        Object.keys(newState).forEach(key => {
          const keyNum = parseInt(key);
          if (keyNum > 0) {
            delete newState[keyNum];
          }
        });
        return newState;
      });
      
      setChartFilters(prev => {
        const newState = { ...prev };
        Object.keys(newState).forEach(key => {
          const keyNum = parseInt(key);
          if (keyNum > 0) {
            delete newState[keyNum];
          }
        });
        return newState;
      });
      
      setAppliedFilters(prev => {
        const newState = { ...prev };
        Object.keys(newState).forEach(key => {
          const keyNum = parseInt(key);
          if (keyNum > 0) {
            delete newState[keyNum];
          }
        });
        return newState;
      });
      
      setOriginalChartData(prev => {
        const newState = { ...prev };
        Object.keys(newState).forEach(key => {
          const keyNum = parseInt(key);
          if (keyNum > 0) {
            delete newState[keyNum];
          }
        });
        return newState;
      });
      
      setChartGenerated(prev => {
        const newState = { ...prev };
        Object.keys(newState).forEach(key => {
          const keyNum = parseInt(key);
          if (keyNum > 0) {
            delete newState[keyNum];
          }
        });
        return newState;
      });
      
      setChartThemes(prev => {
        const newState = { ...prev };
        Object.keys(newState).forEach(key => {
          const keyNum = parseInt(key);
          if (keyNum > 0) {
            delete newState[keyNum];
          }
        });
        return newState;
      });
      
      setCardSelectedIdentifiers(prev => {
        const newState = { ...prev };
        Object.keys(newState).forEach(key => {
          const keyNum = parseInt(key);
          if (keyNum > 0) {
            delete newState[keyNum];
          }
        });
        return newState;
      });
      
      setOriginalDimensionsPerCard(prev => {
        const newState = { ...prev };
        Object.keys(newState).forEach(key => {
          const keyNum = parseInt(key);
          if (keyNum > 0) {
            delete newState[keyNum];
          }
        });
        return newState;
      });
      
      setShowFilterCrossButtons(prev => {
        const newState = { ...prev };
        Object.keys(newState).forEach(key => {
          const keyNum = parseInt(key);
          if (keyNum > 0) {
            delete newState[keyNum];
          }
        });
        return newState;
      });
      
      setDataSummaryCollapsed(prev => {
        const newState = { ...prev };
        Object.keys(newState).forEach(key => {
          const keyNum = parseInt(key);
          if (keyNum > 0) {
            delete newState[keyNum];
          }
        });
        return newState;
      });
    }
  }, [safeData.graphLayout.numberOfGraphsInRow, safeData.columnClassifierConfig?.dimensions]);

  // Notify parent component when chart data changes
  useEffect(() => {
    if (onChartDataChange) {
      onChartDataChange(chartData);
    }
  }, [chartData, onChartDataChange]);
  
  // Fetch unique values for selected identifiers when they change
  useEffect(() => {
    if (safeData.selectedIdentifiers && safeData.dataframe) {
      // Get all unique identifiers from all dimensions
      let allIdentifiers = Object.values(safeData.selectedIdentifiers).flat().filter((id): id is string => typeof id === 'string');
      
      // Filter out identifiers that have only 1 unique value (not useful for filtering)
      if (Array.isArray(safeData.columnSummary)) {
        const originalCount = allIdentifiers.length;
        allIdentifiers = allIdentifiers.filter(identifier => {
          const colInfo = safeData.columnSummary.find((c: any) => c.column === identifier);
          if (colInfo && typeof colInfo.unique_count === 'number') {
            // Only include identifiers with more than 1 unique value
            return colInfo.unique_count > 1;
          }
          // If we can't determine unique count, include it (fallback behavior)
          return true;
        });
        const filteredCount = allIdentifiers.length;
              }
      
      // Fetch unique values for each identifier
      allIdentifiers.forEach(identifier => {
        if (!identifierUniqueValues[identifier]) {
          fetchIdentifierUniqueValues(identifier);
        }
      });
    }
  }, [safeData.selectedIdentifiers, safeData.dataframe, safeData.columnSummary]);
  
  // Handle click outside to close dropdowns
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      const target = event.target as Element;
      
      // Check if click is outside any dropdown
      // Removed old dropdown click outside logic
    };
    
    // Add event listener
    document.addEventListener('mousedown', handleClickOutside);
    
    // Cleanup
    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
    };
  }, []);

  // Add new chart config
  const addChart = () => {
    const currentLayout = safeData.graphLayout.numberOfGraphsInRow;
    
    if (currentLayout === 2) {
      // Add 2 chart cards for 2 graphs per row layout
      setChartConfigs((prev) => [
        ...prev,
        {
          xAxis: '',
          yAxes: [''], // Add a new empty Y-axis
          xAxisLabel: '',
          yAxisLabels: [''], // Add a new empty Y-axis label
          chartType: 'line_chart',
          aggregation: 'no_aggregation', // Default to no aggregation
          weightColumn: '',
          title: '',
          legendField: '', // Field to use for creating multiple lines/series
        },
        {
          xAxis: '',
          yAxes: [''], // Add a new empty Y-axis
          xAxisLabel: '',
          yAxisLabels: [''], // Add a new empty Y-axis label
          chartType: 'line_chart',
          aggregation: 'no_aggregation', // Default to no aggregation
          weightColumn: '',
          title: '',
          legendField: '', // Field to use for creating multiple lines/series
          sortOrder: null,
          sortColumn: '',
        }
      ]);
      
      // Filters are hidden by default - only show when user clicks filter icon
      const newChartIndex = chartConfigs.length;
      setChartFiltersVisible(prev => ({
        ...prev,
        [newChartIndex]: false,
        [newChartIndex + 1]: false
      }));
      
      // Initialize dimensions for new charts
      initializeCardDimensions(newChartIndex);
      initializeCardDimensions(newChartIndex + 1);
      
      // Initialize collapse states for new charts
      setChartConfigCollapsed(prev => ({
        ...prev,
        [newChartIndex]: false,
        [newChartIndex + 1]: false
      }));
      
      // Initialize chart options for new charts
      setChartOptions(prev => ({
        ...prev,
                    [newChartIndex]: { grid: true, legend: true, axisLabels: true, dataLabels: true },
            [newChartIndex + 1]: { grid: true, legend: true, axisLabels: true, dataLabels: true }
      }));
      
      // Initialize loading states for new charts
      setIsLoading(prev => ({
        ...prev,
        [newChartIndex]: false,
        [newChartIndex + 1]: false
      }));

      setShowUniqueToggles(prev => ({
        ...prev,
        [newChartIndex]: false,
        [newChartIndex + 1]: false
      }));
    } else {
      // Add 1 chart card for 1 graph per row layout
      setChartConfigs((prev) => [
        ...prev,
        {
          xAxis: '',
          yAxes: [''], // Add a new empty Y-axis
          xAxisLabel: '',
          yAxisLabels: [''], // Add a new empty Y-axis label
          chartType: 'line_chart',
          aggregation: 'no_aggregation', // Default to no aggregation
          weightColumn: '',
          title: '',
          legendField: '', // Field to use for creating multiple lines/series
        }
      ]);
      
      // Filters are hidden by default - only show when user clicks filter icon
      const newChartIndex = chartConfigs.length;
      setChartFiltersVisible(prev => ({
        ...prev,
        [newChartIndex]: false
      }));
      
      // Initialize dimensions for new chart
      initializeCardDimensions(newChartIndex);
      
      // Initialize collapse state for new chart
      setChartConfigCollapsed(prev => ({
        ...prev,
        [newChartIndex]: false
      }));
      
      // Initialize chart options for new chart
      setChartOptions(prev => ({
        ...prev,
                    [newChartIndex]: { grid: true, legend: true, axisLabels: true, dataLabels: true }
      }));
      
      // Initialize loading state for new chart
      setIsLoading(prev => ({
        ...prev,
        [newChartIndex]: false
      }));

      setShowUniqueToggles(prev => ({
        ...prev,
        [newChartIndex]: false
      }));
    }
  };

  // Delete chart config
  const deleteChart = (index: number) => {
    setChartConfigs((prev) => prev.filter((_, i) => i !== index));
    
    // Clean up all state variables associated with the deleted chart
    setChartSettingsVisible((prev) => {
      const newState = { ...prev };
      delete newState[index];
      // Shift down the indices for charts after the deleted one
      Object.keys(newState).forEach(key => {
        const keyNum = parseInt(key);
        if (keyNum > index) {
          newState[keyNum - 1] = newState[keyNum];
          delete newState[keyNum];
        }
      });
      return newState;
    });
    
    // Clean up chart filters
    setChartFilters((prev) => {
      const newState = { ...prev };
      delete newState[index];
      // Shift down the indices for charts after the deleted one
      Object.keys(newState).forEach(key => {
        const keyNum = parseInt(key);
        if (keyNum > index) {
          newState[keyNum - 1] = newState[keyNum];
          delete newState[keyNum];
        }
      });
      return newState;
    });
    
    // Clean up chart data sets
    setChartDataSets((prev) => {
      const newState = { ...prev };
      delete newState[index];
      // Shift down the indices for charts after the deleted one
      Object.keys(newState).forEach(key => {
        const keyNum = parseInt(key);
        if (keyNum > index) {
          newState[keyNum - 1] = newState[keyNum];
          delete newState[keyNum];
        }
      });
      return newState;
    });

    setChartResultsByIndex((prev) => {
      const newState = { ...prev };
      delete newState[index];
      Object.keys(newState).forEach(key => {
        const keyNum = parseInt(key);
        if (keyNum > index) {
          newState[keyNum - 1] = newState[keyNum];
          delete newState[keyNum];
        }
      });
      return newState;
    });
    
    // Clean up applied filters
    setAppliedFilters((prev) => {
      const newState = { ...prev };
      delete newState[index];
      // Shift down the indices for charts after the deleted one
      Object.keys(newState).forEach(key => {
        const keyNum = parseInt(key);
        if (keyNum > index) {
          newState[keyNum - 1] = newState[keyNum];
          delete newState[keyNum];
        }
      });
      return newState;
    });
    
    // Clean up original chart data
    setOriginalChartData((prev) => {
      const newState = { ...prev };
      delete newState[index];
      // Shift down the indices for charts after the deleted one
      Object.keys(newState).forEach(key => {
        const keyNum = parseInt(key);
        if (keyNum > index) {
          newState[keyNum - 1] = newState[keyNum];
          delete newState[keyNum];
        }
      });
      return newState;
    });
    
    // Clean up chart generated state
    setChartGenerated((prev) => {
      const newState = { ...prev };
      delete newState[index];
      // Shift down the indices for charts after the deleted one
      Object.keys(newState).forEach(key => {
        const keyNum = parseInt(key);
        if (keyNum > index) {
          newState[keyNum - 1] = newState[keyNum];
          delete newState[keyNum];
        }
      });
      return newState;
    });
    
    // Clean up chart themes
    setChartThemes((prev) => {
      const newState = { ...prev };
      delete newState[index];
      // Shift down the indices for charts after the deleted one
      Object.keys(newState).forEach(key => {
        const keyNum = parseInt(key);
        if (keyNum > index) {
          newState[keyNum - 1] = newState[keyNum];
          delete newState[keyNum];
        }
      });
      return newState;
    });
    
    // Clean up chart options
    setChartOptions((prev) => {
      const newState = { ...prev };
      delete newState[index];
      // Shift down the indices for charts after the deleted one
      Object.keys(newState).forEach(key => {
        const keyNum = parseInt(key);
        if (keyNum > index) {
          newState[keyNum - 1] = newState[keyNum];
          delete newState[keyNum];
        }
      });
      return newState;
    });
    
    // Clean up chart filters visibility
    setChartFiltersVisible((prev) => {
      const newState = { ...prev };
      delete newState[index];
      // Shift down the indices for charts after the deleted one
      Object.keys(newState).forEach(key => {
        const keyNum = parseInt(key);
        if (keyNum > index) {
          newState[keyNum - 1] = newState[keyNum];
          delete newState[keyNum];
        }
      });
      return newState;
    });

    // Clean up per-card dimensions and identifiers
    setCardSelectedIdentifiers((prev) => {
      const newState = { ...prev };
      delete newState[index];
      // Shift down the indices for charts after the deleted one
      Object.keys(newState).forEach(key => {
        const keyNum = parseInt(key);
        if (keyNum > index) {
          newState[keyNum - 1] = newState[keyNum];
          delete newState[keyNum];
        }
      });
      return newState;
    });

    setOriginalDimensionsPerCard((prev) => {
      const newState = { ...prev };
      delete newState[index];
      // Shift down the indices for charts after the deleted one
      Object.keys(newState).forEach(key => {
        const keyNum = parseInt(key);
        if (keyNum > index) {
          newState[keyNum - 1] = newState[keyNum];
          delete newState[keyNum];
        }
      });
      return newState;
    });

    // Clean up filter cross buttons visibility
    setShowFilterCrossButtons((prev) => {
      const newState = { ...prev };
      delete newState[index];
      // Shift down the indices for charts after the deleted one
      Object.keys(newState).forEach(key => {
        const keyNum = parseInt(key);
        if (keyNum > index) {
          newState[keyNum - 1] = newState[keyNum];
          delete newState[keyNum];
        }
      });
      return newState;
    });

    // Clean up collapse states
    setChartConfigCollapsed((prev) => {
      const newState = { ...prev };
      delete newState[index];
      // Shift down the indices for charts after the deleted one
      Object.keys(newState).forEach(key => {
        const keyNum = parseInt(key);
        if (keyNum > index) {
          newState[keyNum - 1] = newState[keyNum];
          delete newState[keyNum];
        }
      });
      return newState;
    });

    setDataSummaryCollapsed((prev) => {
      const newState = { ...prev };
      delete newState[index];
      // Shift down the indices for charts after the deleted one
      Object.keys(newState).forEach(key => {
        const keyNum = parseInt(key);
        if (keyNum > index) {
          newState[keyNum - 1] = newState[keyNum];
          delete newState[keyNum];
        }
      });
      return newState;
    });
    
    // Clean up loading state
    setIsLoading((prev) => {
      const newState = { ...prev };
      delete newState[index];
      // Shift down the indices for charts after the deleted one
      Object.keys(newState).forEach(key => {
        const keyNum = parseInt(key);
        if (keyNum > index) {
          newState[keyNum - 1] = newState[keyNum];
          delete newState[keyNum];
        }
      });
      return newState;
    });

    setShowUniqueToggles(prev => {
      const newState = { ...prev };
      delete newState[index];
      Object.keys(newState).forEach(key => {
        const keyNum = parseInt(key);
        if (keyNum > index) {
          newState[keyNum - 1] = newState[keyNum];
          delete newState[keyNum];
        }
      });
      return newState;
    });

    // Clean up chart notes
    setChartNotes(prev => {
      const newState = { ...prev };
      delete newState[index];
      Object.keys(newState).forEach(key => {
        const keyNum = parseInt(key);
        if (keyNum > index) {
          newState[keyNum - 1] = newState[keyNum];
          delete newState[keyNum];
        }
      });
      return newState;
    });
  };

  // Toggle chart settings visibility
  const toggleChartSettings = (index: number) => {
    setChartSettingsVisible((prev) => ({
      ...prev,
      [index]: !prev[index]
    }));
  };

  // Toggle chart filters visibility
  const toggleChartFilters = (index: number) => {
    setChartFiltersVisible(prev => ({
      ...prev,
      [index]: !prev[index]
    }));

    if (!cardSelectedIdentifiers[index]) {
      initializeCardDimensions(index);
    }
  };

  // Toggle functions for per-card collapse states
  const toggleDataSummaryCollapsed = (index: number) => {
    setDataSummaryCollapsed(prev => ({
      ...prev,
      [index]: !prev[index]
    }));
  };

  const toggleChartConfigCollapsed = (index: number) => {
    setChartConfigCollapsed(prev => ({
      ...prev,
      [index]: !prev[index]
    }));
  };

  // API Integration Functions
  const createExploreAtom = async () => {
    try {
      setIsLoading(prev => ({ ...prev, 0: true }));
      setError(null);
      const response = await fetch('/api/explore/create-explore-atom', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          validator_atom_id: safeData.dataframe,
          atom_name: 'Explore Analysis',
          selected_dimensions: JSON.stringify({
            file: safeData.dimensions.reduce((acc, dim) => {
              acc[dim] = safeData.dimensionIdentifiers[dim] || [];
              return acc;
            }, {} as any)
          }),
          selected_measures: JSON.stringify({
            file: safeData.measures
          })
        })
      });

      if (!response.ok) {
        throw new Error(`HTTP error! status: ${response.status}`);
      }

      const result = await response.json();
      
      // Update the dataframe reference
      onDataChange({ dataframe: result.explore_atom_id });
      
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unknown error occurred');
    } finally {
      setIsLoading(prev => ({ ...prev, 0: false }));
    }
  };

  const handleChartConfigChange = (field: string, value: any) => {
    // COMMENTED OUT - causing infinite loop
    // onDataChange({ [field]: value });
  };

  const handleFilterChange = (column: string, values: string[]) => {
    const columnKey = normaliseFilterColumnKey(column);
    const currentFilters = safeData.dateFilters || [];
    const updatedFilters = currentFilters.filter(f => f.column !== columnKey);

    if (values.length > 0) {
      updatedFilters.push({ column: columnKey, values: values.map(value => String(value)) });
    }

    const updatedChartFilters: { [chartIndex: number]: { [identifier: string]: string[] } } = {};
    chartConfigs.forEach((_, idx) => {
      const existing = chartFilters[idx] || {};
      const chartFilter = { ...existing };
      if (values.length > 0) {
        chartFilter[columnKey] = values.map(value => String(value));
      } else {
        delete chartFilter[columnKey];
      }
      if (columnKey !== column) {
        delete chartFilter[column];
      }
      updatedChartFilters[idx] = chartFilter;
    });

    setChartFilters(updatedChartFilters);

    // COMMENTED OUT - causing infinite loop
    // onDataChange({ dateFilters: updatedFilters, chartFilters: updatedChartFilters });
  };
  
  // Multi-selection filter handler
  const handleMultiSelectFilterChange = (
    chartIndex: number,
    identifier: string,
    values: string[] | null
  ) => {
    const columnKey = normaliseFilterColumnKey(identifier);
    const nextValues = Array.isArray(values) ? values.map(value => String(value)) : null;
    setChartFilters(prev => {
      const existingFilters = prev[chartIndex] || {};
      const updatedFilters = { ...existingFilters };

      if (nextValues && nextValues.length > 0) {
        updatedFilters[columnKey] = nextValues;
      } else {
        delete updatedFilters[columnKey];
      }

      if (columnKey !== identifier) {
        delete updatedFilters[identifier];
      }

      return {
        ...prev,
        [chartIndex]: updatedFilters,
      };
    });

    // Don't regenerate chart immediately - let user apply multiple filters first
  };
  
  // Apply filters and regenerate chart
  const applyFilters = (chartIndex: number) => {
    if (chartConfigs[chartIndex]?.xAxis && hasValidYAxes(chartConfigs[chartIndex]?.yAxes)) {
      // Mark filters as applied so UI can reflect active filtering
      setAppliedFilters(prev => ({ ...prev, [chartIndex]: true }));

      // Regenerate the chart with the currently selected filters.
      // We intentionally keep the previous chart data while the new data
      // loads so the chart doesn't disappear if the request fails.
      generateChart(chartIndex, false);
    }
  };
  
  const resetFilters = (chartIndex: number) => {
    // Clear all filters for this chart
    setChartFilters(prev => {
      const newFilters = { ...prev };
      delete newFilters[chartIndex];
      return newFilters;
    });
    
    // Removed old dropdown state logic
    
    // Clear applied filters state
    setAppliedFilters(prev => {
      const newApplied = { ...prev };
      delete newApplied[chartIndex];
      return newApplied;
    });
    
    // Clear chart generated state
    setChartGenerated(prev => {
      const newGenerated = { ...prev };
      delete newGenerated[chartIndex];
      return newGenerated;
    });
    
    // Restore original chart data if available
    if (originalChartData[chartIndex]) {
      setChartDataSets(prev => ({
        ...prev,
        [chartIndex]: originalChartData[chartIndex]
      }));
    } else if (chartConfigs[chartIndex]?.xAxis && hasValidYAxes(chartConfigs[chartIndex]?.yAxes)) {
      // If no original data available, regenerate chart without filters
      generateChart(chartIndex, true); // Pass true to indicate reset mode
    }
  };
  
  // Fetch unique values for identifiers
  const fetchIdentifierUniqueValues = async (identifier: string) => {
    if (!safeData.dataframe) return;
    
    // Set loading state
    setLoadingUniqueValues(prev => ({ ...prev, [identifier]: true }));
    
    try {
      const objectName = safeData.dataframe.endsWith('.arrow') ? safeData.dataframe : `${safeData.dataframe}.arrow`;
      const response = await fetch(`${EXPLORE_API}/column_summary?object_name=${encodeURIComponent(objectName)}`);

      if (response.ok) {
        const raw = await response.json();
        const summary = await resolveTaskResponse<{ summary?: any[] }>(raw);
        const summaryData = Array.isArray(summary.summary) ? summary.summary : [];
        
        // Find the column summary for this identifier
        const columnSummary = summaryData.find((col: any) => col.column === identifier);
        
        if (columnSummary && Array.isArray(columnSummary.unique_values)) {
          const values = columnSummary.unique_values.map((value: any) => String(value));
          setIdentifierUniqueValues(prev => ({
            ...prev,
            [identifier]: values
          }));
        }
      }
    } catch (error) {
    } finally {
      // Clear loading state
      setLoadingUniqueValues(prev => ({ ...prev, [identifier]: false }));
    }
  };

  // Generate chart data
  const generateChart = async (index: number, resetMode: boolean = false, customConfig?: any) => {
    const config = customConfig || chartConfigs[index];
    
    try {
      setIsLoading(prev => ({ ...prev, [index]: true }));
      clearError();

      if (!config.xAxis || !hasValidYAxes(config.yAxes)) {
        setError('Please select both X and at least one Y axis');
        return;
      }

      if (!safeData.dataframe) {
        setError('No dataframe selected. Please select a data source first.');
        return;
      }

      // Check if we have any available columns for chart generation
      const hasAvailableColumns = allAvailableColumns.length > 0;


      if (!hasAvailableColumns) {
        setError('No columns available for chart generation.');
        return;
      }

      // Allow both identifiers and measures for X and Y axes

      const dimensions = safeData.columnClassifierConfig
        ? Object.keys(safeData.columnClassifierConfig.dimensions || {})
        : safeData.fallbackDimensions || [];
      const measures = safeData.columnClassifierConfig
        ? safeData.columnClassifierConfig.measures || []
        : safeData.fallbackMeasures || [];

      const availableColumns = [...dimensions, ...measures];

      // Prepare filters from chart filters early so we can include filter columns as dimensions
      const rawChartFilters = resetMode ? {} : (chartFilters[index] || {});
      const chartFiltersData = Object.entries(rawChartFilters).reduce(
        (acc, [key, values]) => {
          const columnKey = normaliseFilterColumnKey(key);
          if (Array.isArray(values) && values.length > 0) {
            acc[columnKey] = values.map(value => String(value));
          }
          return acc;
        },
        {} as { [identifier: string]: string[] }
      );

      const hasActiveFilters = Object.values(chartFiltersData).some(
        values => Array.isArray(values) && values.length > 0
      );

      // Create explore atom with flexible structure - both X and Y can be identifiers or measures
      // Include legend field and filter columns so backend can filter correctly
      const dimensionColumns = new Set<string>([config.xAxis]);
      if (config.legendField && config.legendField !== 'aggregate') {
        dimensionColumns.add(config.legendField);
      }
      Object.keys(chartFiltersData).forEach(col => dimensionColumns.add(col));

      const selectedDimensions = {
        [safeData.dataframe]: Array.from(dimensionColumns).reduce(
          (acc, col) => ({ ...acc, [col]: [col] }),
          {} as { [key: string]: string[] }
        )
      };

      const selectedMeasures = {
        [safeData.dataframe]: config.yAxes.filter(y => y) // Y-axes can be identifiers or measures
      };

      // Create explore atom

      const createResponse = await fetch(`${EXPLORE_API}/select-dimensions-and-measures`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/x-www-form-urlencoded',
        },
        body: new URLSearchParams({
          validator_atom_id: safeData.dataframe,
          atom_name: 'Chart Analysis',
          selected_dimensions: JSON.stringify(selectedDimensions),
          selected_measures: JSON.stringify(selectedMeasures)
        })
      });

      
      if (!createResponse.ok) {
        const errorText = await createResponse.text();
        throw new Error(`Failed to create explore atom: ${createResponse.status} - ${errorText}`);
      }

      const rawCreate = await createResponse.json();
      const createResult = await resolveTaskResponse<{ explore_atom_id: string }>(rawCreate);
      const exploreAtomId = createResult.explore_atom_id;
      


      // Prepare filters from chart filters
      const filtersList = Object.entries(chartFiltersData)
        .filter(([identifier, values]) => Array.isArray(values) && values.length > 0)
        .map(([identifier, values]) => ({
          column: identifier,
          values
        }));
      
      
      // Specify operations for the chart - flexible for both identifiers and measures
      // Handle multiple Y-axes
      const measuresConfig: { [key: string]: string } = {};
      config.yAxes.forEach((yAxis: string, index: number) => {
        if (yAxis && yAxis.trim()) {
          measuresConfig[yAxis] = config.aggregation || 'no_aggregation';
        }
      });
      
      const operationsPayload = {
        file_key: safeData.dataframe,
        filters: filtersList, // Use chart filters instead of dateFilters
        group_by:
          config.legendField && config.legendField !== 'aggregate'
            ? [config.legendField, config.xAxis]
            : [config.xAxis],
        measures_config: measuresConfig,
        chart_type: config.chartType,
        x_axis: config.xAxis,
        weight_column: config.weightColumn || null,
        sort_order: config.sortOrder || null
      };
      





      // Specify operations
      const operationsResponse = await fetch(`${EXPLORE_API}/specify-operations`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/x-www-form-urlencoded',
        },
        body: new URLSearchParams({
          explore_atom_id: exploreAtomId,
          operations: JSON.stringify(operationsPayload)
        })
      });

      
      if (!operationsResponse.ok) {
        const errorText = await operationsResponse.text();
        throw new Error(`Operations specification failed: ${operationsResponse.status} - ${errorText}`);
      }
      
      const rawOperations = await operationsResponse.json();
      await resolveTaskResponse(rawOperations);

      // Get the chart data
      const chartResponse = await fetch(`${EXPLORE_API}/chart-data-multidim/${exploreAtomId}`);
      
      
      if (!chartResponse.ok) {
        const errorText = await chartResponse.text();
        throw new Error(`Chart data fetch failed: ${chartResponse.status} - ${errorText}`);
      }

      const rawResult = await chartResponse.json();
      const resolved = await resolveTaskResponse<Record<string, any>>(rawResult);
      const { rows: chartRows, full: normalisedResult } = normaliseChartTaskResult(resolved);

      setChartDataSets(prev => {
        const newData = {
          ...prev,
          [index]: chartRows,
        };

        if (!hasActiveFilters) {
          setOriginalChartData(prevOriginal => ({
            ...prevOriginal,
            [index]: chartRows,
          }));
        }

        return newData;
      });

      if (normalisedResult) {
        setChartData(normalisedResult);
        setChartResultsByIndex(prev => ({
          ...prev,
          [index]: normalisedResult,
        }));
      } else {
        setChartData(null);
        setChartResultsByIndex(prev => {
          const next = { ...prev };
          delete next[index];
          return next;
        });
      }

      // Mark chart as generated
      setChartGenerated(prev => ({ ...prev, [index]: true }));
      
      // Success message removed - unnecessary notification popup
      
    } catch (err) {

      setError(err instanceof Error ? err.message : 'Unknown error occurred');
    } finally {
      setIsLoading(prev => ({ ...prev, [index]: false }));
    }
  };



  // Get selected dimensions and measures
  const selectedMeasures = safeData.measures || [];

  const availableDimensionKeys = React.useMemo(() => Object.keys(dimensionsWithIdentifiers), [dimensionsWithIdentifiers]);

  const selectedDimensions = React.useMemo(() => {
    const base = safeData.selectedIdentifiers
      ? Object.keys(safeData.selectedIdentifiers)
      : (safeData.dimensions || []);

    const baseArray = Array.isArray(base) ? base : [];
    const filtered = baseArray.filter(dimension => availableDimensionKeys.includes(dimension));

    if (filtered.length > 0) {
      return filtered;
    }

    return availableDimensionKeys;
  }, [safeData.selectedIdentifiers, safeData.dimensions, availableDimensionKeys]);
  
  // State for available columns from backend
  const [availableIdentifiers, setAvailableIdentifiers] = useState<string[]>([]);
  const [availableMeasures, setAvailableMeasures] = useState<string[]>([]);
  const [isLoadingColumns, setIsLoadingColumns] = useState(false);
  
  // Combine all available columns for both X and Y axis dropdowns
  // Deduplicate to avoid repeated entries
  const allAvailableColumns = Array.from(new Set([...availableIdentifiers, ...availableMeasures]));
  

  
  // Load available columns using column classifier config when available, falling back to column summary data
  useEffect(() => {
    if (!safeData.dataframe) {
      return;
    }

    setIsLoadingColumns(true);

    try {
      let identifiers: string[] = safeData.columnClassifierConfig?.identifiers?.length
        ? safeData.columnClassifierConfig.identifiers
        : safeData.fallbackDimensions?.length
          ? safeData.fallbackDimensions
          : Array.isArray(safeData.allColumns)
            ? safeData.allColumns
            : [];

      let measures: string[] = safeData.columnClassifierConfig?.measures?.length
        ? safeData.columnClassifierConfig.measures
        : safeData.fallbackMeasures?.length
          ? safeData.fallbackMeasures
          : Array.isArray(safeData.allColumns)
            ? safeData.allColumns
            : [];

      if ((!identifiers || identifiers.length === 0) && summaryDerivedIdentifiers.length > 0) {
        identifiers = summaryDerivedIdentifiers;
      }

      if ((!measures || measures.length === 0) && summaryDerivedMeasures.length > 0) {
        measures = summaryDerivedMeasures;
      }

      if ((!identifiers || identifiers.length === 0) && (!measures || measures.length === 0) && Array.isArray(safeData.allColumns)) {
        identifiers = safeData.allColumns;
        measures = safeData.allColumns;
      }

      setAvailableIdentifiers(Array.from(new Set((identifiers || []).filter(Boolean))));
      setAvailableMeasures(Array.from(new Set((measures || []).filter(Boolean))));
    } catch (error) {
      const fallback = Array.isArray(safeData.allColumns) ? safeData.allColumns : [];
      setAvailableIdentifiers(fallback);
      setAvailableMeasures(fallback);
    } finally {
      setIsLoadingColumns(false);
    }
  }, [
    safeData.dataframe,
    safeData.columnClassifierConfig,
    safeData.fallbackDimensions,
    safeData.fallbackMeasures,
    safeData.allColumns,
    summaryDerivedIdentifiers,
    summaryDerivedMeasures,
  ]);

  // Log available columns for debugging
  

  // Sample dimensions with identifiers for the filter UI - ONLY show selected dimensions
  const sampleDimensions = selectedDimensions.length > 0 ? selectedDimensions.map(dimension => {
    // Since we've already filtered to valid dimensions, we can directly access them
    let identifiers = dimensionsWithIdentifiers[dimension] || [];
    
    // Filter out identifiers that have only 1 unique value (not useful for filtering)
    if (Array.isArray(safeData.columnSummary)) {
      const originalCount = identifiers.length;
      identifiers = identifiers.filter(identifier => {
        const colInfo = safeData.columnSummary.find((c: any) => c.column === identifier);
        if (colInfo && typeof colInfo.unique_count === 'number') {
          // Only include identifiers with more than 1 unique value
          const hasMultipleValues = colInfo.unique_count > 1;
                    return hasMultipleValues;
        }
        // If we can't determine unique count, include it (fallback behavior)
        return true;
      });
      const filteredCount = identifiers.length;
          }
    
    
    return {
      id: dimension,
      name: dimension,
      identifiers: identifiers
    };
  }).filter(dimension => dimension.identifiers.length > 0) : [];
  

  // Render identifier chip for filter UI
  const renderIdentifierChip = (dimensionId: string, identifier: string) => {
    const selectedFilters = chartFilters[0]?.[identifier] || [];

    const uniqueValues = getUniqueValuesForColumn(identifier);

    return (
      <div key={`${dimensionId}_${identifier}`} className="relative">
        <Select
          value={selectedFilters.length > 0 ? selectedFilters[0] : ''}
          onValueChange={(value) => {
            const currentFilters = chartFilters[0]?.[identifier] || [];
            const newFilters = currentFilters.includes(value)
              ? currentFilters.filter(f => f !== value)
              : [...currentFilters, value];
            handleFilterChange(identifier, newFilters);
          }}
          disabled={isLoadingColumnSummary}
        >
          <SelectTrigger className="h-8 text-xs border-purple-200 bg-white hover:border-purple-300 hover:bg-purple-25 transition-all duration-200 min-w-[100px] max-w-[140px] rounded-md shadow-sm [&>svg]:hidden">
            <SelectValue 
              placeholder={isLoadingColumnSummary ? "Loading..." : identifier}
              className="text-xs text-gray-700"
            />
            {isLoadingColumnSummary ? (
              <div className="w-3 h-3 border-2 border-purple-300 border-t-purple-600 rounded-full animate-spin" />
            ) : (
              <ChevronDown className="w-3 h-3 text-purple-500" />
            )}
          </SelectTrigger>
          <SelectContent className="z-50 bg-white border border-purple-200 shadow-lg rounded-md max-h-60 overflow-y-auto">
            {Array.isArray(uniqueValues) ? uniqueValues.map((value: string) => {
              // Check if this is a numerical value
              const isNumerical = !isNaN(Number(value)) && value !== '';
              const colInfo = Array.isArray(safeData.columnSummary) ? 
                safeData.columnSummary.find((c: any) => c.column === identifier) : null;
              const isNumericalColumn = colInfo?.is_numerical || false;
              
              // Debug: Log the value to see if it contains "#"
              
              // Clean the value to remove any "#" symbols that might be part of the data
              const cleanValue = value.replace(/#/g, '');
              
              return (
                <SelectItem 
                  key={value}
                  value={value}
                  className="text-xs hover:bg-purple-50 focus:bg-purple-50"
                >
                  <div className="flex items-center justify-between w-full">
                    <div className="flex items-center space-x-2">
                      <span className="truncate">{cleanValue}</span>
                    </div>
                    {selectedFilters.includes(value) && (
                      <div className="w-2 h-2 bg-purple-500 rounded-full ml-2 flex-shrink-0"></div>
                    )}
                  </div>
                </SelectItem>
              );
            }) : null}
          </SelectContent>
        </Select>
        
        {/* Active Filter Indicator */}
        {selectedFilters.length > 0 && (
          <div className="absolute -top-1 -right-1 w-4 h-4 bg-purple-500 text-white text-xs rounded-full flex items-center justify-center font-medium shadow-sm">
            {selectedFilters.length}
          </div>
        )}
      </div>
    );
  };

  // Render individual chart component
  const renderChartComponent = (index: number) => {
    const config = chartConfigs[index] || chartConfigs[0];
    const isSettingsVisible = chartSettingsVisible[index] || false;
    const chartRows = resolveChartRows(index);

    const rendererProps = {
      key: `chart-${index}-${config.chartType}-${chartThemes[index] || 'default'}-${chartRows.length || 0}-${Object.keys(chartFilters[index] || {}).length}-${appliedFilters[index] ? 'filtered' : 'unfiltered'}-theme-${chartThemes[index] || 'default'}-yaxes-${(config.yAxes || []).join('-')}-sortcol-${config.sortColumn || 'none'}-sortorder-${config.sortOrder || 'none'}`,
      type: config.chartType as 'bar_chart' | 'line_chart' | 'pie_chart' | 'area_chart' | 'scatter_chart',
      data: chartRows,
      xField: config.xAxis || undefined,
      yField: (config.yAxes && config.yAxes[0]) || undefined,
      title: config.title,
      xAxisLabel: config.xAxisLabel || config.xAxis || '',
      yAxisLabel: (config.yAxisLabels && Array.isArray(config.yAxisLabels) && config.yAxisLabels[0]) || (config.yAxes && config.yAxes[0]) || '',
      yFields: config.yAxes || [],
      yAxisLabels: (config.yAxes || []).map((yAxis: string, idx: number) => (config.yAxisLabels && Array.isArray(config.yAxisLabels) && config.yAxisLabels[idx]) || yAxis || ''),
      legendField:
        config.legendField && config.legendField !== 'aggregate'
          ? config.legendField
          : undefined,
      chartsPerRow: safeData.graphLayout.numberOfGraphsInRow,
      colors: CHART_COLORS,
      theme: chartThemes[index] || 'default',
      enableScroll: false,
      onThemeChange: (theme: string) => handleChartThemeChange(index, theme),
      onGridToggle: (enabled: boolean) => handleChartGridToggle(index, enabled),
      onLegendToggle: (enabled: boolean) => handleChartLegendToggle(index, enabled),
      onAxisLabelsToggle: (enabled: boolean) => handleChartAxisLabelsToggle(index, enabled),
      onDataLabelsToggle: (enabled: boolean) => handleChartDataLabelsToggle(index, enabled),
      onSave: () => handleChartSave(index),
      sortOrder: config.sortOrder || null,
      onSortChange: (order) => handleSortOrderChange(index, order),
      sortColumn: config.sortColumn || '',
      onSortColumnChange: (column) => handleSortColumnChange(index, column),
      showLegend: chartOptions[index]?.legend,
      showAxisLabels: chartOptions[index]?.axisLabels,
      showDataLabels: chartOptions[index]?.dataLabels,
      onChartTypeChange: (newType: 'bar_chart' | 'line_chart' | 'pie_chart' | 'area_chart' | 'scatter_chart') => handleChartTypeChange(index, newType),
      showGrid: chartOptions[index]?.grid
    } as const;
    
    return (
      <div key={index} className="relative h-full w-full min-w-0 explore-chart-card">
        <Card className="border-pink-200 h-full w-full explore-chart-card">
          <CardContent className="p-4 flex flex-col h-full w-full min-w-0 explore-chart-content">
                        {/* Chart Configuration Header with Toggle */}
            <div className="flex items-center mb-4 p-3 bg-gray-50 rounded-lg">
              <div className="flex items-center space-x-2">
                <div className="flex items-center justify-center w-6 h-6 bg-pink-100 rounded-md">
                  <BarChart3 className="w-3 h-3 text-pink-600" />
                </div>
                <span className="font-semibold text-sm text-gray-800">Chart Configuration</span>
                {/* <span className="ml-2 text-xs text-gray-500 whitespace-nowrap">Right-click to change chart type</span> */}
              </div>
              <div className="flex items-center space-x-2 ml-auto">
                <Button
                  variant="outline"
                  size="sm"
                  className="h-8 w-8 p-0"
                  onClick={() => toggleChartSettings(index)}
                >
                  <Settings className="w-3 h-3" />
                </Button>
                <Button
                  variant="outline"
                  size="sm"
                  className="h-8 w-8 p-0"
                  onClick={() => toggleChartFilters(index)}
                >
                  <Filter className="w-3 h-3" />
                </Button>
                <Button
                  variant="outline"
                  size="sm"
                  className="h-8 w-8 p-0 text-red-500 hover:text-red-700 hover:bg-red-50"
                  onClick={() => deleteChart(index)}
                >
                  <X className="w-3 h-3" />
                </Button>
                <Dialog>
                  <DialogTrigger asChild>
                    <Button
                      variant="outline"
                      size="sm"
                      className="h-8 w-8 p-0"
                      aria-label="Full screen"
                    >
                      <Maximize2 className="w-3 h-3" />
                    </Button>
                  </DialogTrigger>
                  <DialogContent className="max-w-4xl">
                    <div className="h-[500px] w-full">
                      <RechartsChartRenderer {...rendererProps} />
                    </div>
                  </DialogContent>
                </Dialog>
                <button
                  onClick={() => toggleChartConfigCollapsed(index)}
                  className="p-2 hover:bg-pink-100 rounded-lg transition-colors"
                  aria-label={chartConfigCollapsed[index] ? 'Expand chart configuration' : 'Collapse chart configuration'}
                >
                  {chartConfigCollapsed[index] ? (
                    <ChevronDown className="w-5 h-5 text-pink-600" />
                  ) : (
                    <ChevronUp className="w-5 h-5 text-pink-600" />
                  )}
                </button>
              </div>
            </div>

            {/* Collapsible Chart Configuration Area */}
            <div className={`transition-all duration-300 ease-in-out min-w-0 w-full explore-chart-config ${chartConfigCollapsed[index] ? 'max-h-0 opacity-0 overflow-hidden' : 'max-h-none opacity-100'}`}>
              {/* Axis Selectors */}
              <div
                className="flex items-center mb-3 p-3 pr-2 bg-gray-50 rounded-lg min-w-0 w-full explore-axis-selectors"
                style={{ position: 'relative', zIndex: 40 }}
              >
                <div className="flex items-center space-x-2">
                  <SingleSelectDropdown
                    label=""
                    placeholder={
                      isLoadingColumns
                        ? "Loading..."
                        : allAvailableColumns.length === 0
                        ? "No column classifier config"
                        : "x-axis"
                    }
                    value={config.xAxis}
                    onValueChange={(value) => {
                      const newConfigs = [...chartConfigs];
                      newConfigs[index] = { ...newConfigs[index], xAxis: value };
                      setChartConfigs(newConfigs);

                      // Only trigger chart generation when both X and Y axes are available
                      if (value && hasValidYAxes(config.yAxes)) {

                        // Create the new config for chart generation
                        const newConfig = { ...newConfigs[index], xAxis: value };

                        // Only generate chart if we have valid data
                        if (newConfig.xAxis && hasValidYAxes(newConfig.yAxes)) {
                          safeTriggerChartGeneration(index, newConfig, 100);
                        }
                      }
                    }}
                    options={Array.isArray(allAvailableColumns) ? 
                      allAvailableColumns.map((column, idx) => ({ value: column, label: column })) : 
                      []
                    }
                    disabled={isLoadingColumns}
                    className="w-24"
                  />

                  <div className="flex items-center gap-1">
                    {Array.isArray(config.yAxes)
                      ? config.yAxes.map((yAxis, yAxisIndex) => (
                          <div key={yAxisIndex} className="flex items-center gap-1">
                            <SingleSelectDropdown
                              label=""
                              placeholder={
                                isLoadingColumns
                                  ? "Loading..."
                                  : allAvailableColumns.length === 0
                                  ? "No column classifier config"
                                  : "y-axis"
                              }
                              value={yAxis}
                              onValueChange={(value) => {
                                const newConfigs = [...chartConfigs];

                                // Update the Y-axis value
                                const updatedYAxes = Array.isArray(newConfigs[index].yAxes)
                                  ? newConfigs[index].yAxes.map((_, i) => (i === yAxisIndex ? value : _))
                                  : [value];

                                newConfigs[index] = {
                                  ...newConfigs[index],
                                  yAxes: updatedYAxes,
                                };

                                setChartConfigs(newConfigs);

                                // Only trigger chart generation once when both X and Y axes are available
                                if (value && config.xAxis) {
                                  // Create the new config for chart generation
                                  const newConfig = {
                                    ...newConfigs[index],
                                    yAxes: updatedYAxes,
                                  };

                                  // Only generate chart if we have valid data and haven't already triggered generation
                                  const validYAxes = newConfig.yAxes.filter((y) => y && y.trim() !== '');
                                  if (newConfig.xAxis && validYAxes.length > 0) {
                                    safeTriggerChartGeneration(index, newConfig, 100);
                                  }
                                }
                              }}
                              options={Array.isArray(allAvailableColumns) ? 
                                allAvailableColumns.map((column, idx) => ({ value: column, label: column })) : 
                                []
                              }
                              disabled={isLoadingColumns}
                              className="w-24"
                            />
                            {/* Remove button for additional Y-axes (not the first one) */}
                            {yAxisIndex > 0 && (
                              <Button
                                variant="outline"
                                size="sm"
                                className="h-8 w-8 p-0 text-red-500 hover:text-red-700 hover:bg-red-50"
                                onClick={() => {
                                  const newConfigs = [...chartConfigs];
                                  newConfigs[index] = {
                                    ...newConfigs[index],
                                    yAxes: newConfigs[index].yAxes.filter((_, i) => i !== yAxisIndex),
                                    yAxisLabels: newConfigs[index].yAxisLabels.filter((_, i) => i !== yAxisIndex),
                                  };
                                  setChartConfigs(newConfigs);

                                  // Clear chart data when Y-axis is removed to force re-render
                                  setChartDataSets((prev) => {
                                    const newData = { ...prev };
                                    delete newData[index];
                                    return newData;
                                  });

                                  // Regenerate chart when Y-axis is removed to update display
                                  if (newConfigs[index].xAxis && hasValidYAxes(newConfigs[index].yAxes)) {
                                    safeTriggerChartGeneration(index, newConfigs[index], 100);
                                  }
                                }}
                              >
                                <X className="w-3 h-3" />
                              </Button>
                            )}
                          </div>
                        ))
                      : null}
                    {/* Plus Button for adding additional Y-axis dropdowns - only show if less than 2 Y-axes */}
                    {Array.isArray(config.yAxes) && config.yAxes.length < 2 && (
                      <Button
                        variant="outline"
                        size="sm"
                        className="h-8 w-8 p-0"
                        onClick={() => {
                          const newConfigs = [...chartConfigs];
                          newConfigs[index] = {
                            ...newConfigs[index],
                            yAxes: [...newConfigs[index].yAxes, ''],
                            yAxisLabels: [...newConfigs[index].yAxisLabels, ''],
                          };
                          setChartConfigs(newConfigs);
                        }}
                      >
                        <Plus className="w-3 h-3" />
                      </Button>
                    )}
                  </div>
                </div>

                <div className="ml-auto">
                  <SingleSelectDropdown
                    label=""
                    placeholder="Segregate Field Values"
                    value={config.legendField || ''}
                    onValueChange={(value) => {
                      const newConfigs = [...chartConfigs];
                      if (
                        newConfigs[index].chartType === 'pie_chart' &&
                        value !== 'aggregate'
                      ) {
                        newConfigs[index] = {
                          ...newConfigs[index],
                          legendField: 'aggregate'
                        };
                        setChartConfigs(newConfigs);
                        toast({ description: 'Segregation of Field Value is not allowed for pie chart' });
                        if (config.xAxis && hasValidYAxes(config.yAxes)) {
                          safeTriggerChartGeneration(index, newConfigs[index], 100);
                        }
                        return;
                      }
                      newConfigs[index] = {
                        ...newConfigs[index],
                        legendField: value
                      };
                      setChartConfigs(newConfigs);
                      if (config.xAxis && hasValidYAxes(config.yAxes)) {
                        safeTriggerChartGeneration(index, newConfigs[index], 100);
                      }
                    }}
                    options={[
                      { value: "aggregate", label: "Show Aggregate" },
                      ...(Array.isArray(availableIdentifiers) && availableIdentifiers.length > 0 ? 
                        availableIdentifiers.map((column, idx) => ({ value: column, label: column })) : 
                        []
                      )
                    ]}
                      disabled={isLoadingColumns}
                    className="w-48 ml-2"
                  />
                </div>
              </div>
              

            </div>

            {/* Individual Chart Settings Panel */}
            {isSettingsVisible && (
              <div
                className="mb-4 p-3 bg-blue-50 rounded-lg border border-blue-200 min-w-0 w-full explore-chart-settings"
                onClick={(e) => e.stopPropagation()}
                style={{ position: 'relative', zIndex: 50 }}
              >
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4 min-w-0 w-full explore-chart-settings">
                  <div>
                    <Label className="text-xs text-gray-600">Chart Title</Label>
                    <Input
                      value={config.title || ''}
                      onChange={(e) => {
                        const newConfigs = [...chartConfigs];
                        newConfigs[index] = { ...newConfigs[index], title: e.target.value };
                        setChartConfigs(newConfigs);
                      }}
                      onKeyDown={(e) => {
                        if (e.key === 'Enter' && config.xAxis && hasValidYAxes(config.yAxes)) {
                          const newConfig = { ...chartConfigs[index], title: e.currentTarget.value };
                          safeTriggerChartGeneration(index, newConfig, 100);
                        }
                      }}
                      className="h-8 text-xs"
                      placeholder="Chart Title"
                    />
                  </div>
                  <div>
                    <Label className="text-xs text-gray-600">X-Axis Label</Label>
                    <Input
                      value={config.xAxisLabel || ''}
                      onChange={(e) => {
                        const newConfigs = [...chartConfigs];
                        newConfigs[index] = { ...newConfigs[index], xAxisLabel: e.target.value };
                        setChartConfigs(newConfigs);
                      }}
                      onKeyDown={(e) => {
                        if (e.key === 'Enter' && config.xAxis && hasValidYAxes(config.yAxes)) {
                          const newConfig = { ...chartConfigs[index], xAxisLabel: e.currentTarget.value };
                          safeTriggerChartGeneration(index, newConfig, 100);
                        }
                      }}
                      className="h-8 text-xs"
                      placeholder="X label"
                    />
                  </div>
                  <div>
                    <Label className="text-xs text-gray-600">Y-Axis Labels</Label>
                    <div className="flex flex-wrap items-center gap-2">
                      {Array.isArray(config.yAxes) ? config.yAxes.map((yAxis, yAxisIndex) => (
                        <Input
                          key={yAxisIndex}
                          value={Array.isArray(config.yAxisLabels) ? config.yAxisLabels[yAxisIndex] || '' : ''} // This will need to be updated to handle multiple labels
                          onChange={(e) => {
                            const newConfigs = [...chartConfigs];
                            newConfigs[index] = {
                              ...newConfigs[index],
                              yAxisLabels: Array.isArray(newConfigs[index].yAxisLabels) ? newConfigs[index].yAxisLabels.map((_, i) => (i === yAxisIndex ? e.target.value : _)) : []
                            };
                            setChartConfigs(newConfigs);
                          }}
                          onKeyDown={(e) => {
                            if (e.key === 'Enter' && config.xAxis && hasValidYAxes(config.yAxes)) {
                              const updatedLabels = Array.isArray(config.yAxisLabels)
                                ? config.yAxisLabels.map((label, i) => (i === yAxisIndex ? e.currentTarget.value : label))
                                : [];
                              const newConfig = { ...chartConfigs[index], yAxisLabels: updatedLabels };
                              safeTriggerChartGeneration(index, newConfig, 100);
                            }
                          }}
                          className="h-8 text-xs"
                          placeholder={`Y${yAxisIndex + 1} label`}
                        />
                      )) : null}
                    </div>
                  </div>
                  {/* Aggregation dropdown */}
                  {hasValidYAxes(config.yAxes) && (
                    <div>
                      <Label className="text-xs text-gray-600">Aggregation</Label>
                      <SingleSelectDropdown
                        label=""
                        placeholder="Select aggregation"
                        value={config.aggregation || 'no_aggregation'}
                        onValueChange={(value) => {
                          const newConfigs = [...chartConfigs];
                          newConfigs[index] = { ...newConfigs[index], aggregation: value };
                          setChartConfigs(newConfigs);
                          
                          // Regenerate chart when aggregation changes
                          if (config.xAxis && hasValidYAxes(config.yAxes)) {
                            const newConfig = { ...newConfigs[index], aggregation: value };
                            safeTriggerChartGeneration(index, newConfig, 100);
                          }
                        }}
                        options={[
                          { value: "no_aggregation", label: "No Aggregation" },
                          { value: "sum", label: "Sum" },
                          { value: "avg", label: "Average" },
                          { value: "count", label: "Count" },
                          { value: "min", label: "Min" },
                          { value: "max", label: "Max" },
                          { value: "weighted_avg", label: "Weighted Average" }
                        ]}
                        className="h-8"
                      />
                    </div>
                  )}
                </div>
              </div>
            )}

            {/* Individual Chart Filters Panel */}
            {chartFiltersVisible[index] && (
              <div
                className={`mb-4 p-3 rounded-lg border relative group transition-all duration-200 cursor-pointer hover:shadow-sm hover:border-blue-300 min-w-0 ${
                  showFilterCrossButtons[index]
                    ? 'bg-blue-100 border-2 border-blue-400 shadow-md'
                    : 'bg-blue-50 border border-blue-200'
                }`}
                onDoubleClick={() => toggleFilterCrossButtons(index)}
                onClick={(e) => e.stopPropagation()}
                style={{ position: 'relative', zIndex: 30 }}
              >
                {/* Double-click hint removed from top-right */}
                

                
                <div className="space-y-2">
                  {safeData.columnClassifierConfig?.dimensions && cardSelectedIdentifiers[index] ? (
                    <>
                      {/* Legend bar removed as requested */}
                      
                      {/* Display all identifiers in continuous rows with color coding by dimension */}
                      <div className="flex flex-wrap gap-1">
                        {Object.keys(cardSelectedIdentifiers[index]).map((dimensionId) => {
                          let dimensionIdentifiers = cardSelectedIdentifiers[index][dimensionId] || [];
                          if (dimensionIdentifiers.length === 0) return null;
                          
                          // Filter out identifiers that have only 1 unique value (not useful for filtering)
                          if (Array.isArray(safeData.columnSummary)) {
                            const originalCount = dimensionIdentifiers.length;
                            dimensionIdentifiers = dimensionIdentifiers.filter(identifier => {
                              const colInfo = safeData.columnSummary.find((c: any) => c.column === identifier);
                              if (colInfo && typeof colInfo.unique_count === 'number') {
                                // Only include identifiers with more than 1 unique value
                                return colInfo.unique_count > 1;
                              }
                              // If we can't determine unique count, include it (fallback behavior)
                              return true;
                            });
                            const filteredCount = dimensionIdentifiers.length;
                                                      }
                          
                          if (dimensionIdentifiers.length === 0) return null;
                          
                          const dimensionColor = getDimensionColor(dimensionId);
                          
                          return dimensionIdentifiers.map((identifier: string) => (
                                                          <div key={identifier} className="flex flex-col mb-1">
                              {/* Filter name above dropdown */}
                              <div className="text-xs font-medium text-gray-700 mb-0.5 text-center">
                                {capitalizeFirstLetter(identifier)}
                              </div>
                              {/* Dropdown Filter with dimension color and identifier name inside */}
                              <div className="relative">
                                {/* Cross button for removing filter - only visible when showFilterCrossButtons is true */}
                                {showFilterCrossButtons[index] && (
                                  <button
                                    onClick={(e) => {
                                      e.stopPropagation();
                                      removeFilter(index, dimensionId, identifier);
                                    }}
                                    onKeyDown={(e) => {
                                      if (e.key === 'Enter' || e.key === ' ') {
                                        e.preventDefault();
                                        removeFilter(index, dimensionId, identifier);
                                      }
                                    }}
                                    className="absolute -top-2 -right-2 w-5 h-5 bg-red-500 hover:bg-red-600 focus:bg-red-600 focus:outline-none focus:ring-2 focus:ring-red-300 focus:ring-offset-1 text-white rounded-full flex items-center justify-center text-xs font-bold z-20 cursor-pointer transition-all duration-200 shadow-md animate-in fade-in-0 zoom-in-95 hover:scale-110"
                                    title="Remove filter"
                                    aria-label={`Remove ${identifier} filter`}
                                  >
                                    ×
                                  </button>
                                )}
                                
                                <MultiSelectDropdown
                                  label=""
                                  selectedValues={chartFilters[index]?.[identifier] || []}
                                  onSelectionChange={(selectedValues) => {
                                    handleMultiSelectFilterChange(index, identifier, selectedValues);
                                  }}
                                  options={getUniqueValuesForColumn(identifier).map((value) => ({
                                    value,
                                    label: value
                                  }))}
                                  showSelectAll={true}
                                  showTrigger={true}
                                  placeholder={`Filter by ${identifier}`}
                                  className="w-full"
                                />
                              </div>
                            </div>
                          ));
                        })}
                      </div>
                    </>
                  ) : (
                    <div className="flex items-center justify-center py-4 px-4 bg-white/40 border-2 border-dashed border-gray-200 rounded-lg">
                      <div className="text-center">
                        <div className="w-6 h-6 bg-gray-100 rounded-full flex items-center justify-center mx-auto mb-2">
                          <Filter className="w-3 h-3 text-gray-500" />
                        </div>
                        <p className="text-xs text-gray-500">No filters available</p>
                      </div>
                    </div>
                  )}
                  
                  {/* Filter Action Buttons with inline double-click hint */}
                  <div className="flex justify-between items-center pt-2 min-w-0">
                    {/* Double-click hint - inline with buttons */}
                    <div className="text-xs text-gray-500">
                      💡 Double-click to {showFilterCrossButtons[index] ? 'hide' : 'show'} remove buttons
                    </div>
                    
                    {/* Action buttons */}
                    <div className="flex gap-2 min-w-0 flex-shrink-0">
                    <Button
                      variant="outline"
                      size="sm"
                      className="h-8 px-3 text-xs bg-orange-50 border border-orange-200 text-orange-700 hover:bg-orange-100 flex items-center"
                      onClick={() => resetCardFilters(index)}
                      title="Restore all removed filters for this card"
                    >
                      <RotateCcw className="w-3 h-3 mr-1" />
                      Restore Filters
                    </Button>
                    <Button
                      variant="default"
                      size="sm"
                      className="h-8 px-3 text-xs bg-blue-600 hover:bg-blue-700 text-white flex items-center"
                      onClick={() => applyFilters(index)}
                    >
                      Apply Filters
                    </Button>
                    <Button
                      variant="outline"
                      size="sm"
                      className="h-8 px-3 text-xs bg-white border border-gray-300 rounded-md hover:bg-gray-50 flex items-center"
                      onClick={() => resetFilters(index)}
                    >
                      <X className="w-3 h-3 mr-1" />
                      Reset
                    </Button>
                    </div>
                  </div>
                </div>
              </div>
            )}

            {/* Chart Status Indicator */}
                {config.xAxis && hasValidYAxes(config.yAxes) && !isChartLoading(index) && chartRows.length === 0 && !error && (
              <div className="mb-3 p-2 bg-blue-50 border border-blue-200 rounded-lg min-w-0">
                <div className="flex items-center space-x-2 text-xs text-blue-700 min-w-0">
                  <div className="w-3 h-3 border-2 border-blue-300 border-t-blue-600 rounded-full animate-spin"></div>
                  <span>Generating chart...</span>
                </div>
              </div>
            )}
            
            {/* Chart Display */}
            <div
              className="bg-white border border-gray-200 rounded-lg p-6 cursor-pointer hover:border-pink-300 transition-colors relative flex-1 overflow-y-auto flex-shrink-0 flex items-start justify-center"
              style={{
                minHeight: '300px',
                height: chartRows.length > 0 ? 'auto' : '300px',
                maxHeight: '500px'
              }}
            >
              <div className="h-full w-full flex flex-col min-w-0">
                

                
                {/* Loading State */}
                {isChartLoading(index) && (
                  <div className="flex items-center justify-center flex-1">
                    <div className="text-center">
                      <div className="w-8 h-8 border-4 border-blue-200 border-t-blue-600 rounded-full animate-spin mx-auto mb-2"></div>
                      <p className="text-sm text-gray-600">Generating chart...</p>
                    </div>
                  </div>
                )}
                
                {/* Chart Renderer */}
                {!isChartLoading(index) && (
                  <>
                  <div className="w-full h-full min-w-0 flex-shrink-0" style={{ height: 'calc(100% - 60px)' }}>
                    {/* Check if chart data exists and has valid structure */}
                    {(chartRows.length === 0) ? (
                      <div className="text-center p-4 border-2 border-dashed border-gray-300 rounded-lg h-full flex items-center justify-center">
                        <div className="text-gray-500 text-sm">
                          {config.xAxis && config.yAxes && config.yAxes.length > 0 && config.yAxes.every(y => y) ?
                            (chartRows.length === 0 ?
                              'No data available for the selected filters. Try adjusting your filter criteria.' :
                              `Chart ready: ${config.xAxis} vs ${config.yAxes.filter(y => y).join(', ')}`
                            ) :
                            'Select X and Y axes to generate chart'
                          }
                        </div>
                      </div>
                    ) : (
                      <div
                        className={`w-full min-w-0 flex-shrink-0 explore-chart-area ${
                          config.chartType === 'pie_chart'
                            ? 'pie-chart-container overflow-y-auto pr-2'
                            : 'h-full overflow-hidden flex items-center justify-center'
                        }`}
                        style={{
                          minHeight: config.chartType === 'pie_chart' ? '450px' : '400px',
                          height: config.chartType === 'pie_chart' ? '450px' : '400px',
                          maxWidth: '100%'
                        }}
                      >
                        {/* Only render the chart if we have valid xAxis and yAxes */}
                        {(() => {
                          const hasValidAxes =
                            config.xAxis &&
                            config.yAxes &&
                            config.yAxes.length > 0 &&
                            config.yAxes.every((y) => y);
                          if (!hasValidAxes) {
                            return (
                              <div className="text-center p-4 border-2 border-dashed border-gray-300 rounded-lg h-full flex items-center justify-center">
                                <div className="text-gray-500 text-sm">
                                  {config.xAxis && config.yAxes && config.yAxes.length > 0 && config.yAxes.every(y => y) ? (
                                    chartRows.length === 0 ? (
                                      'No data available for the selected filters. Try adjusting your filter criteria.'
                                    ) : (
                                      `Chart ready: ${config.xAxis} vs ${config.yAxes.filter(y => y).join(', ')}`
                                    )
                                  ) : (
                                    'Select X and Y axes to generate chart'
                                  )}
                                </div>
                              </div>
                            );
                          }
                          return (
                            <div className="relative w-full h-full">
                              <RechartsChartRenderer {...rendererProps} />
                            </div>
                          );
                        })()}
                      </div>
                    )}
                  </div>
                  <Input
                    placeholder="Add note"
                    value={chartNotes[index] || ''}
                    onChange={(e) => handleNoteChange(index, e.target.value)}
                    onKeyDown={(e) => handleNoteKeyDown(index, e)}
                    style={{ fontFamily: CHART_FONT }}
                    className="mt-2 w-full text-sm"
                  />
                  </>
                )}
              </div>
            </div>
          </CardContent>
        </Card>
      </div>
    );
  };

  // Helper function to detect time columns
  const isTimeColumn = (columnName: string, dataType: string) => {
    const timeKeywords = ['year', 'week', 'date', 'month', 'day', 'time', 'timestamp', 'datetime'];
    const columnLower = columnName.toLowerCase();
    const typeLower = dataType.toLowerCase();
    
    // Check if column name contains time-related keywords
    const hasTimeKeyword = timeKeywords.some(keyword => columnLower.includes(keyword));
    
    // Check if data type is date-related
    const isDateType = typeLower.includes('date') || typeLower.includes('time') || typeLower.includes('datetime');
    
    return hasTimeKeyword || isDateType;
  };

  // Helper function to parse dates from various formats
  const parseDate = (value: any): Date | null => {
    if (value === null || value === undefined) return null;
    
    try {
      // If it's already a Date object
      if (value instanceof Date) {
        return isNaN(value.getTime()) ? null : value;
      }
      
      // If it's a number (timestamp)
      if (typeof value === 'number') {
        const date = new Date(value);
        return isNaN(date.getTime()) ? null : date;
      }
      
      // If it's a string
      if (typeof value === 'string') {
        const trimmedValue = value.trim();
        
        // Handle ISO format strings (e.g., "2023-01-01T00:00:00")
        if (trimmedValue.includes('T') || trimmedValue.match(/^\d{4}-\d{2}-\d{2}/)) {
          const date = new Date(trimmedValue);
          return isNaN(date.getTime()) ? null : date;
        }
        
        // Handle MM/DD/YYYY format
        if (trimmedValue.match(/^\d{1,2}\/\d{1,2}\/\d{4}$/)) {
          const parts = trimmedValue.split('/');
          const month = parseInt(parts[0]) - 1; // Month is 0-indexed
          const day = parseInt(parts[1]);
          const year = parseInt(parts[2]);
          const date = new Date(year, month, day);
          return isNaN(date.getTime()) ? null : date;
        }
        
        // Handle YYYY/MM/DD format
        if (trimmedValue.match(/^\d{4}\/\d{1,2}\/\d{1,2}$/)) {
          const parts = trimmedValue.split('/');
          const year = parseInt(parts[0]);
          const month = parseInt(parts[1]) - 1; // Month is 0-indexed
          const day = parseInt(parts[2]);
          const date = new Date(year, month, day);
          return isNaN(date.getTime()) ? null : date;
        }
        
        // Handle YYYY-MM-DD format
        if (trimmedValue.match(/^\d{4}-\d{1,2}-\d{1,2}$/)) {
          const date = new Date(trimmedValue);
          return isNaN(date.getTime()) ? null : date;
        }
        
        // Try generic date parsing as last resort
        const date = new Date(trimmedValue);
        return isNaN(date.getTime()) ? null : date;
      }
      
      return null;
    } catch (error) {
      return null;
    }
  };

  // Helper function to format time column values based on column type
  const formatTimeColumnValues = (columnName: string, values: any[], dataType: string) => {
    if (!Array.isArray(values) || values.length === 0) return 'No values';
    
    const columnLower = columnName.toLowerCase();
    
    try {
      // Handle year columns - show min to max years only
      if (columnLower.includes('year')) {
        const years = values
          .map(v => {
            if (v === null || v === undefined) return null;
            const year = parseInt(String(v));
            return isNaN(year) ? null : year;
          })
          .filter(year => year !== null)
          .sort((a, b) => a - b);
        
        if (years.length === 0) return 'Invalid years';
        
        const minYear = years[0];
        const maxYear = years[years.length - 1];
        
        return minYear === maxYear ? `${minYear}` : `${minYear} - ${maxYear}`;
      }
      
      // Handle date columns - show complete start to end date
      if (columnLower.includes('date')) {
        // Check if we have fetched date range for this column
        if (dateRanges[columnName]) {
          const { min_date, max_date } = dateRanges[columnName];
          try {
            const minDate = new Date(min_date);
            const maxDate = new Date(max_date);
            
            if (!isNaN(minDate.getTime()) && !isNaN(maxDate.getTime())) {
              const formatDate = (date: Date) => {
                const year = date.getFullYear();
                const month = String(date.getMonth() + 1).padStart(2, '0');
                const day = String(date.getDate()).padStart(2, '0');
                return `${month}/${day}/${year}`;
              };
              
              return `${formatDate(minDate)} - ${formatDate(maxDate)}`;
            }
          } catch (error) {
          }
        }
        
        // Fallback to parsing values if no fetched date range
        const dates = values
          .map(v => parseDate(v))
          .filter(date => date !== null)
          .sort((a, b) => a!.getTime() - b!.getTime());
        
        if (dates.length === 0) {
          return 'Invalid dates';
        }
        
        const minDate = dates[0]!;
        const maxDate = dates[dates.length - 1]!;
        
        // Format dates as complete start to end date
        const formatDate = (date: Date) => {
          const year = date.getFullYear();
          const month = String(date.getMonth() + 1).padStart(2, '0');
          const day = String(date.getDate()).padStart(2, '0');
          return `${month}/${day}/${year}`;
        };
        
        return `${formatDate(minDate)} - ${formatDate(maxDate)}`;
      }
      
      // For other time dimensions (month, week, etc.) - treat as numerical columns
      // Show two values and rest with +rest values
      const numericValues = values
        .map(v => {
          if (v === null || v === undefined) return null;
          const num = parseFloat(String(v));
          return isNaN(num) ? null : num;
        })
        .filter(num => num !== null)
        .sort((a, b) => a - b);
      
      if (numericValues.length === 0) return 'Invalid values';
      
      if (numericValues.length <= 2) {
        return numericValues.join(', ');
      } else {
        const firstTwo = numericValues.slice(0, 2);
        const rest = numericValues.length - 2;
        return `${firstTwo.join(', ')} +${rest}`;
      }
      
    } catch (error) {
      return 'Format error';
    }
  };

  // Helper function for data type badge colors (similar to Feature Overview)
  const getDataTypeColor = (type: string) => {
    const t = type.toLowerCase();
    if (t.includes('int') || t.includes('float') || t.includes('number')) return 'bg-blue-100 text-blue-800 border-blue-200';
    if (t.includes('object') || t.includes('string') || t.includes('category')) return 'bg-green-100 text-green-800 border-green-200';
    if (t.includes('bool')) return 'bg-purple-100 text-purple-800 border-purple-200';
    if (t.includes('date')) return 'bg-orange-100 text-orange-800 border-orange-200';
    return 'bg-gray-100 text-gray-800 border-gray-200';
  };

  // Get column summary data with filtering based on filterUnique setting
  const summaryList = Array.isArray(safeData.columnSummary) ? 
    safeData.columnSummary.filter(Boolean).filter(col => {
      // If filterUnique is enabled, only show columns with more than 1 unique value
      if (safeData.filterUnique) {
        return col.unique_count > 1;
      }
      // Otherwise show all columns
      return true;
    }) : [];


  // Also fetch column summary when filters are displayed but no summary is available
  useEffect(() => {
    if (isApplied && sampleDimensions.length > 0 && summaryList.length === 0 && safeData.dataframe) {
      setIsLoadingColumnSummary(true);
      const fetchColumnSummary = async () => {
        try {
          const response = await fetch(`${EXPLORE_API}/column_summary?object_name=${encodeURIComponent(safeData.dataframe)}`);
          if (response.ok) {
            const raw = await response.json();
            const summary = await resolveTaskResponse<{ summary?: any[] }>(raw);
            const summaryData = Array.isArray(summary.summary) ? summary.summary.filter(Boolean) : [];
            onDataChange({ columnSummary: summaryData });
          }
        } catch (error) {
        } finally {
          setIsLoadingColumnSummary(false);
        }
      };
      fetchColumnSummary();
    }
  }, [isApplied, sampleDimensions.length, summaryList.length, safeData.dataframe, onDataChange]);

  // Fetch date ranges for date columns when column summary is loaded
  // COMMENTED OUT - causing excessive API calls
  // useEffect(() => {
  //   if (summaryList.length > 0 && safeData.dataframe) {
  //     // Find date columns and fetch their date ranges
  //     const dateColumns = summaryList.filter(col => 
  //       col.column.toLowerCase().includes('date') || 
  //       col.data_type.toLowerCase().includes('date')
  //     );
  //     
  //     dateColumns.forEach(col => {
  //       if (!dateRanges[col.column]) {
  //         fetchDateRange(col.column);
  //       }
  //     });
  //   }
  // }, [summaryList, safeData.dataframe]); // Removed dateRanges from dependencies to avoid infinite loop

  // Handle theme change for charts
  const handleChartThemeChange = (chartIndex: number, theme: string) => {
    setChartThemes(prev => {
      const newState = { ...prev, [chartIndex]: theme };
      return newState;
    });
  };

  // Handle grid toggle for charts
  const handleChartGridToggle = (chartIndex: number, enabled: boolean) => {
    setChartOptions(prev => ({
      ...prev,
      [chartIndex]: {
        ...prev[chartIndex],
        grid: enabled
      }
    }));
  };

  // Handle legend toggle for charts
  const handleChartLegendToggle = (chartIndex: number, enabled: boolean) => {
    setChartOptions(prev => ({
      ...prev,
      [chartIndex]: {
        ...prev[chartIndex],
        legend: enabled
      }
    }));
  };

  // Handle axis labels toggle for charts
  const handleChartAxisLabelsToggle = (chartIndex: number, enabled: boolean) => {
    setChartOptions(prev => ({
      ...prev,
      [chartIndex]: {
        ...prev[chartIndex],
        axisLabels: enabled
      }
    }));
  };

  // Handle data labels toggle for charts
  const handleChartDataLabelsToggle = (chartIndex: number, enabled: boolean) => {
    setChartOptions(prev => ({
      ...prev,
      [chartIndex]: {
        ...prev[chartIndex],
        dataLabels: enabled
      }
    }));
  };

  // Handle sort order change for charts
  const handleSortOrderChange = (chartIndex: number, order: 'asc' | 'desc' | null) => {
    const newConfigs = [...chartConfigs];
    newConfigs[chartIndex] = { ...newConfigs[chartIndex], sortOrder: order };
    setChartConfigs(newConfigs);
    safeTriggerChartGeneration(chartIndex, newConfigs[chartIndex], 100);
  };

  // Handle sort column change for charts
  const handleSortColumnChange = (chartIndex: number, column: string) => {
    console.log('🔍 EXPLORE: handleSortColumnChange called', { chartIndex, column });
    const newConfigs = [...chartConfigs];
    newConfigs[chartIndex] = { ...newConfigs[chartIndex], sortColumn: column };
    console.log('🔍 EXPLORE: Updated config', newConfigs[chartIndex]);
    setChartConfigs(newConfigs);
  };

  // Handle save action for charts
  const handleChartSave = (chartIndex: number) => {
    const config = chartConfigs[chartIndex];
    if (!config) return;
    const filters = chartFilters[chartIndex] || {};
    // COMMENTED OUT - causing infinite loop
    // onDataChange({
    //   chartConfigs,
    //   chartFilters,
    //   chartThemes,
    //   chartOptions,
    //   chartDataSets,
    //   chartGenerated,
    //   appliedFilters,
    //   xAxis: config.xAxis,
    //   yAxis: config.yAxes?.[0] || '',
    //   xAxisLabel: config.xAxisLabel || '',
    //   yAxisLabel: config.yAxisLabels?.[0] || '',
    //   chartType: config.chartType,
    //   legendField: config.legendField,
    //   aggregation: config.aggregation,
    //   weightColumn: config.weightColumn,
    //   title: config.title,
    //   filters,
    // });
  };

  // Helper function to fetch date range for a specific column
  const fetchDateRange = async (columnName: string) => {
    if (!safeData.dataframe || !columnName.toLowerCase().includes('date')) return;
    
    try {
      const response = await fetch(`${EXPLORE_API}/date-range?object_name=${encodeURIComponent(safeData.dataframe)}&date_column=${encodeURIComponent(columnName)}`);
      if (response.ok) {
        const raw = await response.json();
        const data = await resolveTaskResponse<{ status?: string; min_date?: string; max_date?: string }>(raw);
        if (data.status === 'success' && data.min_date && data.max_date) {
          setDateRanges(prev => ({
            ...prev,
            [columnName]: {
              min_date: data.min_date,
              max_date: data.max_date
            }
          }));
        }
      }
    } catch (error) {
    }
  };

  // Automatically populate selectedIdentifiers on component load if not already set
  useEffect(() => {
    if (safeData.columnClassifierConfig?.dimensions && 
        (!safeData.selectedIdentifiers || Object.keys(safeData.selectedIdentifiers).length === 0)) {
      const allIdentifiers: { [dimensionId: string]: string[] } = {};
      Object.keys(safeData.columnClassifierConfig.dimensions).forEach(dimensionId => {
        allIdentifiers[dimensionId] = safeData.columnClassifierConfig.dimensions[dimensionId] || [];
      });
      
      // COMMENTED OUT - causing infinite loop
      // onDataChange({
      //   selectedIdentifiers: allIdentifiers
      // });
    }
  }, [safeData.columnClassifierConfig?.dimensions, safeData.selectedIdentifiers]);

  // Helper function to get dimension color
  const getDimensionColor = (dimId: string) => {
    // Generate a consistent color for each dimension
    const dimensionColors = {
      'market': 'bg-green-100 border-green-300 text-green-700 hover:bg-green-200',
      'brand': 'bg-blue-100 border-blue-300 text-blue-700 hover:bg-blue-200',
      'variant': 'bg-purple-100 border-purple-300 text-purple-700 hover:bg-purple-200',
      'packtype': 'bg-orange-100 border-orange-300 text-orange-700 hover:bg-orange-200',
      'year': 'bg-red-100 border-red-300 text-red-700 hover:bg-red-200',
      'month': 'bg-indigo-100 border-indigo-300 text-indigo-700 hover:bg-indigo-200',
      'category': 'bg-teal-100 border-teal-300 text-teal-700 hover:bg-teal-200',
      'region': 'bg-pink-100 border-pink-300 text-pink-700 hover:bg-pink-200',
      'country': 'bg-yellow-100 border-yellow-300 text-yellow-700 hover:bg-yellow-200',
      'city': 'bg-cyan-100 border-cyan-300 text-cyan-700 hover:bg-cyan-200',
      'product': 'bg-lime-100 border-lime-300 text-lime-700 hover:bg-lime-200',
      'customer': 'bg-amber-100 border-amber-300 text-amber-700 hover:bg-amber-200',
      'sales': 'bg-emerald-100 border-emerald-300 text-emerald-700 hover:bg-emerald-200',
      'revenue': 'bg-rose-100 border-rose-300 text-rose-700 hover:bg-rose-200',
      'profit': 'bg-sky-100 border-sky-300 text-sky-700 hover:bg-sky-200',
      'quantity': 'bg-violet-100 border-violet-300 text-violet-700 hover:bg-violet-200',
      'price': 'bg-fuchsia-100 border-fuchsia-300 text-fuchsia-700 hover:bg-fuchsia-200',
      'date': 'bg-slate-100 border-slate-300 text-slate-700 hover:bg-slate-200',
      'time': 'bg-gray-100 border-gray-300 text-gray-700 hover:bg-gray-200'
    };
    
    const normalizedId = dimId.toLowerCase();
    for (const [key, color] of Object.entries(dimensionColors)) {
      if (normalizedId.includes(key)) {
        return color;
      }
    }
    
    // Generate a fallback color based on the dimension name hash
    const hash = dimId.split('').reduce((a, b) => {
      a = ((a << 5) - a + b.charCodeAt(0)) & 0xffffffff;
      return a;
    }, 0);
    const colors = [
      'bg-green-100 border-green-300 text-green-700 hover:bg-green-200',
      'bg-blue-100 border-blue-300 text-blue-700 hover:bg-blue-200',
      'bg-purple-100 border-purple-300 text-purple-700 hover:bg-purple-200',
      'bg-orange-100 border-orange-300 text-orange-700 hover:bg-orange-200',
      'bg-red-100 border-red-300 text-red-700 hover:bg-red-200',
      'bg-indigo-100 border-indigo-300 text-indigo-700 hover:bg-indigo-200',
      'bg-teal-100 border-teal-300 text-teal-700 hover:bg-teal-200',
      'bg-pink-100 border-pink-300 text-pink-700 hover:bg-pink-200'
    ];
    return colors[Math.abs(hash) % colors.length];
  };

  // Helper function to extract just the background color for colored dots
  const getBackgroundColor = (colorString: string) => {
    const match = colorString.match(/bg-(\w+)-(\d+)/);
    if (match) {
      return `bg-${match[1]}-${match[2]}`;
    }
    // Fallback to a default color
    return 'bg-gray-400';
  };

  // Add new state for filter cross buttons visibility
  const [showFilterCrossButtons, setShowFilterCrossButtons] = useState<{ [chartIndex: number]: boolean }>({});

  // Add function to toggle filter cross buttons visibility
  const toggleFilterCrossButtons = (chartIndex: number) => {
    setShowFilterCrossButtons(prev => ({
      ...prev,
      [chartIndex]: !prev[chartIndex]
    }));
  };

  // Add function to remove filter
  const removeFilter = (chartIndex: number, dimensionId: string, identifier: string) => {
    // Remove the identifier from this card's selectedIdentifiers only
    setCardSelectedIdentifiers(prev => {
      const updated = { ...prev };
      if (updated[chartIndex] && updated[chartIndex][dimensionId]) {
        const updatedCardIdentifiers = { ...updated[chartIndex] };
        updatedCardIdentifiers[dimensionId] = updatedCardIdentifiers[dimensionId].filter(id => id !== identifier);
        
        // If no more identifiers in this dimension, remove the dimension entirely
        if (updatedCardIdentifiers[dimensionId].length === 0) {
          delete updatedCardIdentifiers[dimensionId];
        }
        
        updated[chartIndex] = updatedCardIdentifiers;
      }
      return updated;
    });

    // Also remove any chart filters for this identifier
    setChartFilters(prev => {
      const updated = { ...prev };
      if (updated[chartIndex]) {
        const updatedChartFilters = { ...updated[chartIndex] };
        delete updatedChartFilters[identifier];
        updated[chartIndex] = updatedChartFilters;
      }
      return updated;
    });
  };

  // Store original complete dimensions and identifiers for each card
  const [originalDimensionsPerCard, setOriginalDimensionsPerCard] = useState<{ [chartIndex: number]: { [dimensionId: string]: string[] } }>({});
  
  // Store per-card selected identifiers (instead of global)
  const [cardSelectedIdentifiers, setCardSelectedIdentifiers] = useState<{ [chartIndex: number]: { [dimensionId: string]: string[] } }>({});

  // Initialize dimensions and identifiers for a specific card
  const initializeCardDimensions = (chartIndex: number) => {
    if (safeData.columnClassifierConfig?.dimensions) {
      const allIdentifiers: { [dimensionId: string]: string[] } = {};
      Object.keys(safeData.columnClassifierConfig.dimensions).forEach(dimensionId => {
        let identifiers = safeData.columnClassifierConfig.dimensions[dimensionId] || [];
        
        // Filter out identifiers that have only 1 unique value (not useful for filtering)
        if (Array.isArray(safeData.columnSummary)) {
          const originalCount = identifiers.length;
          identifiers = identifiers.filter(identifier => {
            const colInfo = safeData.columnSummary.find((c: any) => c.column === identifier);
            if (colInfo && typeof colInfo.unique_count === 'number') {
              // Only include identifiers with more than 1 unique value
              return colInfo.unique_count > 1;
            }
            // If we can't determine unique count, include it (fallback behavior)
            return true;
          });
          const filteredCount = identifiers.length;
                  }
        
        allIdentifiers[dimensionId] = identifiers;
      });
      
      // Store original dimensions for this card
      setOriginalDimensionsPerCard(prev => ({
        ...prev,
        [chartIndex]: allIdentifiers
      }));
      
      // Initialize card's selected identifiers with filtered ones
      setCardSelectedIdentifiers(prev => ({
        ...prev,
        [chartIndex]: allIdentifiers
      }));
    }
  };

  // Reset a card's filters back to original state
  const resetCardFilters = (chartIndex: number) => {
    const originalDimensions = originalDimensionsPerCard[chartIndex];
    if (originalDimensions) {
      setCardSelectedIdentifiers(prev => ({
        ...prev,
        [chartIndex]: originalDimensions
      }));
      
      // Also reset chart filters for this card
      setChartFilters(prev => ({
        ...prev,
        [chartIndex]: {}
      }));
    }
  };

  // Initialize first chart with dimensions when component mounts or columnClassifierConfig changes
  useEffect(() => {
    if (safeData.columnClassifierConfig?.dimensions && Object.keys(cardSelectedIdentifiers).length === 0) {
      initializeCardDimensions(0);
    }
  }, [safeData.columnClassifierConfig, safeData.columnSummary]);
  
  // Re-initialize all existing cards when column summary or dimensions change (to apply filtering)
  useEffect(() => {
    if (
      (safeData.columnSummary || safeData.columnClassifierConfig?.dimensions) &&
      Object.keys(cardSelectedIdentifiers).length > 0
    ) {
      // Re-initialize all existing cards with updated identifiers
      Object.keys(cardSelectedIdentifiers).forEach(chartIndex => {
        initializeCardDimensions(parseInt(chartIndex));
      });
    }
  }, [safeData.columnSummary, safeData.columnClassifierConfig?.dimensions]);

  // Debug: Log initial filter state
  useEffect(() => {
    Object.entries(chartFilters).forEach(([chartIndex, filters]) => {
      Object.entries(filters).forEach(([identifier, values]) => {
      });
    });
  }, [chartFilters]);

  return (
    <div className="h-full flex flex-col space-y-4 p-4 min-h-0">
      {!safeData.dataframe ? (
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
                <TrendingUp className="w-12 h-12 text-white drop-shadow-lg" />
              </div>
              <h3 className="text-3xl font-bold text-gray-900 mb-3 bg-gradient-to-r from-purple-500 to-purple-600 bg-clip-text text-transparent">
                Explore Operation
              </h3>
              <p className="text-gray-600 mb-6 text-lg font-medium leading-relaxed">
                Select a dataframe from the properties panel to get started
              </p>
            </div>
          </div>
        </div>
      ) : (
        <>
          {/* Cardinality View - Show when dataframe is selected */}
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
                borderColor="border-purple-500"
                customHeader={{
                  title: "Data Summary",
                  subtitle: "Data in detail",
                  subtitleClickable: !!safeData.dataframe,
                  onSubtitleClick: () => {
                    if (safeData.dataframe) {
                      window.open(`/dataframe?name=${encodeURIComponent(safeData.dataframe)}`, '_blank');
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

          {/* Chart Configuration - Only show when settings are applied */}
          {!(isApplied || safeData.applied) ? (
            <div className="flex-1 flex items-center justify-center">
              <div className="text-center">
                <div className="w-12 h-12 bg-blue-100 rounded-full flex items-center justify-center mx-auto mb-3">
                  <BarChart3 className="w-6 h-6 text-blue-600" />
                </div>
                <h3 className="text-lg font-medium text-gray-900 mb-2">Configure Explore Settings</h3>
                <p className="text-sm text-gray-600">Go to the Settings tab to configure dimensions, measures, and chart layout, then click "Apply Settings"</p>
              </div>
            </div>
          ) : safeData.graphLayout.numberOfGraphsInRow > 0 && (
            <div className="flex-1 explore-chart-container">
              {safeData.graphLayout.numberOfGraphsInRow === 1 ? (
                <div className="space-y-4">
                  {Array.isArray(chartConfigs) ? chartConfigs.map((_, index) => renderChartComponent(index)) : null}
                  <div className="flex justify-center">
                    <Button
                      onClick={addChart}
                      className="w-8 h-8 rounded-full bg-gray-200 hover:bg-gray-300 text-black border-0 shadow-sm"
                      size="sm"
                    >
                      <Plus className="w-4 h-4" />
                    </Button>
                  </div>
                </div>
              ) : (
                <div className="space-y-4">
                  <div
                    className="explore-chart-grid gap-6"
                    style={{ gridTemplateColumns: `repeat(${safeData.graphLayout.numberOfGraphsInRow}, 1fr)` }}
                  >
                    {Array.isArray(chartConfigs) ? chartConfigs.map((_, index) => renderChartComponent(index)) : null}
                  </div>
                  <div className="flex justify-center">
                    <Button
                      onClick={addChart}
                      className="w-8 h-8 rounded-full bg-gray-200 hover:bg-gray-300 text-black border-0 shadow-sm"
                      size="sm"
                    >
                      <Plus className="w-4 h-4" />
                    </Button>
                  </div>
                </div>
              )}
            </div>
          )}
        </>
      )}
      {overlayVisible && (
        <div
          style={{
            position: 'fixed',
            top: 0,
            left: 0,
            right: 0,
            bottom: 0,
            zIndex: 3000,
            background: 'transparent'
          }}
          onMouseDown={handleOverlayClick}
        />
      )}
      {/* COMMENTED OUT: Chat bubble functionality */}
      {/* {chatBubbleShouldRender && (
        <div
          style={{
            position: 'fixed',
            left: chatBubble.anchor.x,
            top: chatBubble.anchor.y,
            transform: 'translate(-50%, 0)',
            zIndex: 4000
          }}
          onMouseDown={e => {
            e.preventDefault();
            e.stopPropagation();
          }}
        >
          <ChatBubble
            visible={chatBubble.visible}
            chartType={chartConfigs[chatBubble.chartIndex ?? 0]?.chartType.replace('_chart', '') || 'line'}
            onChartTypeSelect={handleChartTypeSelect}
            onClose={closeChatBubble}
            onExited={handleBubbleExited}
          />
        </div>
      )} */}
    </div>
  );
};

export default ExploreCanvas;