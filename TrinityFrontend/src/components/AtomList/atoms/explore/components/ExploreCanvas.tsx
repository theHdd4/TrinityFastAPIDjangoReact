import React, { useState, useRef, useEffect } from 'react';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';
import { Switch } from '@/components/ui/switch';
import { BarChart3, LineChart, PieChart, ScatterChartIcon as ScatterIcon, Settings, Filter, Eye, EyeOff, Edit3, Palette, ChevronDown, ChevronUp, X, Plus, RotateCcw } from 'lucide-react';
import { ExploreData } from '../ExploreAtom';
import RechartsChartRenderer from './RechartsChartRenderer';
import { EXPLORE_API } from '@/lib/api';
import { toast } from '@/components/ui/use-toast';
import './ExploreCanvas.css';

interface ExploreCanvasProps {
  data: ExploreData;
  isApplied: boolean;
  onDataChange: (data: Partial<ExploreData>) => void;
  onChartDataChange?: (chartData: ChartData | null) => void;
}

interface ChartData {
  status: string;
  chart_type: string;
  data: any[];
  metadata: any;
}

const chartTypes = [
  { id: 'bar_chart', name: 'Bar Chart', icon: BarChart3 },
  { id: 'line_chart', name: 'Line Chart', icon: LineChart },
  { id: 'pie_chart', name: 'Pie Chart', icon: PieChart }
];

const ExploreCanvas: React.FC<ExploreCanvasProps> = ({ data, isApplied, onDataChange, onChartDataChange }) => {
  const [chartDataSets, setChartDataSets] = useState<{ [idx: number]: any[] }>({});
  const svgRef = useRef<SVGSVGElement>(null);
  const [chartData, setChartData] = useState<ChartData | null>(null);
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
      console.log('🔍 ExploreCanvas: Executing debounced chart generation for index:', chartIndex);
      generateChart(chartIndex, false, config);
      chartGenerationTimeouts.current[chartIndex] = null;
    }, delay);
  };
  
  // State for dropdown positioning
  const [dropdownPosition, setDropdownPosition] = useState<{ top: number; left: number } | null>(null);
  
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
  const [openDropdowns, setOpenDropdowns] = useState<{ [key: string]: boolean }>({});
  const [appliedFilters, setAppliedFilters] = useState<{ [chartIndex: number]: boolean }>({});
  const [originalChartData, setOriginalChartData] = useState<{ [chartIndex: number]: any[] }>({});
  const [chartGenerated, setChartGenerated] = useState<{ [chartIndex: number]: boolean }>({});
  const [chartThemes, setChartThemes] = useState<{ [chartIndex: number]: string }>({});
  const [chartOptions, setChartOptions] = useState<{ [chartIndex: number]: { grid: boolean; legend: boolean; axisLabels: boolean; dataLabels: boolean } }>({});
  const [chartSortCounters, setChartSortCounters] = useState<{ [chartIndex: number]: number }>({});
  const [dateRanges, setDateRanges] = useState<{ [columnName: string]: { min_date: string; max_date: string } }>({});
  
  // Debouncing mechanism to prevent multiple chart generations
  const chartGenerationTimeouts = useRef<{ [chartIndex: number]: NodeJS.Timeout | null }>({});

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
    ...data
  };

  // Multi-chart state
  const [chartConfigs, setChartConfigs] = useState([
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
    }
  ]);

  // Initialize data summary collapse state
  useEffect(() => {
    setDataSummaryCollapsed({ 0: false });
    
    // Initialize chart options for the first chart
    setChartOptions({ 0: { grid: true, legend: true, axisLabels: true, dataLabels: true } });
    setChartSortCounters({ 0: 0 });
    
    // Initialize loading state for the first chart
    setIsLoading({ 0: false });
    
    // Cleanup function to clear any pending chart generation timeouts
    return () => {
      Object.values(chartGenerationTimeouts.current).forEach(timeout => {
        if (timeout) clearTimeout(timeout);
      });
    };
  }, []);

  // Update chartConfigs if layout changes
  useEffect(() => {
    // Hide all filters when layout changes
    hideAllFilters();
    
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
      
      setChartSortCounters(prev => {
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

  // Hide all filters whenever graph layout changes from settings
  useEffect(() => {
    hideAllFilters();
  }, [safeData.graphLayout.numberOfGraphsInRow]);

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
        if (originalCount !== filteredCount) {
          console.log('🔍 ExploreCanvas: Filtered allIdentifiers:', originalCount, '->', filteredCount);
        }
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
        if (!target.closest('.filter-dropdown')) {
          setOpenDropdowns({});
          setDropdownPosition(null);
        }
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
      console.log('Explore atom created:', result);
      
      // Update the dataframe reference
      onDataChange({ dataframe: result.explore_atom_id });
      
    } catch (err) {
      console.error('Error creating explore atom:', err);
      setError(err instanceof Error ? err.message : 'Unknown error occurred');
    } finally {
      setIsLoading(prev => ({ ...prev, 0: false }));
    }
  };

  const handleChartConfigChange = (field: string, value: any) => {
    onDataChange({ [field]: value });
  };

  const handleFilterChange = (dimensionId: string, values: string[]) => {
    const currentFilters = safeData.dateFilters || [];
    const updatedFilters = currentFilters.filter(f => f.column !== dimensionId);
    
    if (values.length > 0) {
      updatedFilters.push({ column: dimensionId, values });
    }
    
    onDataChange({ dateFilters: updatedFilters });
  };
  
  // Multi-selection filter handler
  const handleMultiSelectFilterChange = (chartIndex: number, identifier: string, values: string[]) => {
    console.log(`🔍 ExploreCanvas: handleMultiSelectFilterChange called for chart ${chartIndex}, identifier ${identifier} with values:`, values);
    console.log(`🔍 ExploreCanvas: Previous state for chart ${chartIndex}:`, chartFilters[chartIndex]);
    
    setChartFilters(prev => {
      const newState = {
        ...prev,
        [chartIndex]: {
          ...prev[chartIndex],
          [identifier]: values
        }
      };
      console.log(`🔍 ExploreCanvas: New chartFilters state for chart ${chartIndex}:`, newState[chartIndex]);
      return newState;
    });
    
    // Don't regenerate chart immediately - let user apply multiple filters first
    console.log('🔍 ExploreCanvas: Filter changed for', identifier, ':', values);
  };
  
  // Apply filters and regenerate chart
  const applyFilters = (chartIndex: number) => {
    if (chartConfigs[chartIndex]?.xAxis && hasValidYAxes(chartConfigs[chartIndex]?.yAxes)) {
      console.log('🔍 ExploreCanvas: Applying filters and regenerating chart for index:', chartIndex);
      console.log('🔍 ExploreCanvas: Chart type:', chartConfigs[chartIndex]?.chartType);
      console.log('🔍 ExploreCanvas: Current filters for chart:', chartFilters[chartIndex]);
      console.log('🔍 ExploreCanvas: X-axis:', chartConfigs[chartIndex]?.xAxis);
      console.log('🔍 ExploreCanvas: Y-axes:', chartConfigs[chartIndex]?.yAxes);
      
      // Set applied filters state
      setAppliedFilters(prev => ({ ...prev, [chartIndex]: true }));
      
      // Clear any existing chart data for this index to force regeneration
      setChartDataSets(prev => {
        const newData = { ...prev };
        delete newData[chartIndex];
        console.log('🔍 ExploreCanvas: Cleared chart data for index:', chartIndex);
        return newData;
      });
      
      // Generate chart with filters
      console.log('🔍 ExploreCanvas: Calling generateChart with filters for index:', chartIndex);
      generateChart(chartIndex, false);
    } else {
      console.log('🔍 ExploreCanvas: Cannot apply filters - missing X or Y axis configuration');
      console.log('🔍 ExploreCanvas: X-axis:', chartConfigs[chartIndex]?.xAxis);
      console.log('🔍 ExploreCanvas: Y-axes:', chartConfigs[chartIndex]?.yAxes);
    }
  };
  
  const resetFilters = (chartIndex: number) => {
    // Clear all filters for this chart
    setChartFilters(prev => {
      const newFilters = { ...prev };
      delete newFilters[chartIndex];
      return newFilters;
    });
    
    // Close all dropdowns for this chart
    setOpenDropdowns(prev => {
      const newDropdowns = { ...prev };
      Object.keys(newDropdowns).forEach(key => {
        if (key.startsWith(`${chartIndex}-`)) {
          delete newDropdowns[key];
        }
      });
      return newDropdowns;
    });
    
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
      console.log('🔍 ExploreCanvas: Restoring original chart data for index:', chartIndex);
      setChartDataSets(prev => ({
        ...prev,
        [chartIndex]: originalChartData[chartIndex]
      }));
    } else if (chartConfigs[chartIndex]?.xAxis && hasValidYAxes(chartConfigs[chartIndex]?.yAxes)) {
      // If no original data available, regenerate chart without filters
      console.log('🔍 ExploreCanvas: No original data, regenerating chart for index:', chartIndex);
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
        const summary = await response.json();
        const summaryData = Array.isArray(summary.summary) ? summary.summary : [];
        
        // Find the column summary for this identifier
        const columnSummary = summaryData.find((col: any) => col.column === identifier);
        
        if (columnSummary && Array.isArray(columnSummary.unique_values)) {
          setIdentifierUniqueValues(prev => ({
            ...prev,
            [identifier]: columnSummary.unique_values
          }));
          console.log(`🔍 ExploreCanvas: Fetched unique values for ${identifier}:`, columnSummary.unique_values);
        }
      }
    } catch (error) {
      console.error(`Error fetching unique values for ${identifier}:`, error);
    } finally {
      // Clear loading state
      setLoadingUniqueValues(prev => ({ ...prev, [identifier]: false }));
    }
  };

  // Generate chart data
  const generateChart = async (index: number, resetMode: boolean = false, customConfig?: any) => {
    console.log('🔍 ExploreCanvas: generateChart function called with index:', index);
    const config = customConfig || chartConfigs[index];
    console.log('🔍 ExploreCanvas: Chart config for index', index, ':', config);
    console.log('🔍 ExploreCanvas: Using custom config:', !!customConfig);
    console.log('🔍 ExploreCanvas: Custom config details:', customConfig);
    
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

      console.log('🔍 ExploreCanvas: Chart generation - allAvailableColumns:', allAvailableColumns);
      console.log('🔍 ExploreCanvas: Chart generation - hasAvailableColumns:', hasAvailableColumns);

      if (!hasAvailableColumns) {
        setError('No columns available for chart generation.');
        return;
      }

      // Allow both identifiers and measures for X and Y axes
      console.log('🔍 ExploreCanvas: Generating chart with config:', config);
      console.log('🔍 ExploreCanvas: X-axis:', config.xAxis);
      console.log('🔍 ExploreCanvas: Y-axes:', config.yAxes);
      console.log('🔍 ExploreCanvas: Legend field:', config.legendField);

      const dimensions = safeData.columnClassifierConfig
        ? Object.keys(safeData.columnClassifierConfig.dimensions || {})
        : safeData.fallbackDimensions || [];
      const measures = safeData.columnClassifierConfig
        ? safeData.columnClassifierConfig.measures || []
        : safeData.fallbackMeasures || [];
      console.log('🔍 ExploreCanvas: Available dimensions:', dimensions);
      console.log('🔍 ExploreCanvas: Available measures:', measures);

      const availableColumns = [...dimensions, ...measures];
      console.log('🔍 ExploreCanvas: Available columns for chart generation:', availableColumns);
      


      // Create explore atom with flexible structure - both X and Y can be identifiers or measures
      const selectedDimensions = {
        [safeData.dataframe]: {
          [config.xAxis]: [config.xAxis] // X-axis can be identifier or measure
        }
      };

      const selectedMeasures = {
        [safeData.dataframe]: config.yAxes.filter(y => y) // Y-axes can be identifiers or measures
      };





      // Create explore atom
      console.log('🔍 ExploreCanvas: Creating explore atom with dimensions:', selectedDimensions);
      console.log('🔍 ExploreCanvas: Creating explore atom with measures:', selectedMeasures);
      
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

      console.log('🔍 ExploreCanvas: Create explore atom response status:', createResponse.status);
      
      if (!createResponse.ok) {
        const errorText = await createResponse.text();
        console.error('🔍 ExploreCanvas: Failed to create explore atom:', errorText);
        throw new Error(`Failed to create explore atom: ${createResponse.status} - ${errorText}`);
      }

      const createResult = await createResponse.json();
      const exploreAtomId = createResult.explore_atom_id;
      console.log('🔍 ExploreCanvas: Created explore atom with ID:', exploreAtomId);
      


      // Prepare filters from chart filters
      const chartFiltersData = resetMode ? {} : (chartFilters[index] || {});
      const filtersList = Object.entries(chartFiltersData)
        .filter(([identifier, values]) => Array.isArray(values) && values.length > 0)
        .map(([identifier, values]) => ({
          column: identifier,
          values: values
        }));
      
      console.log('🔍 ExploreCanvas: Chart filters for index', index, ':', chartFiltersData);
      console.log('🔍 ExploreCanvas: Filters list:', filtersList);
      console.log('🔍 ExploreCanvas: Reset mode:', resetMode);
      
      // Specify operations for the chart - flexible for both identifiers and measures
      // Handle multiple Y-axes
      const measuresConfig: { [key: string]: string } = {};
      console.log('🔍 ExploreCanvas: Building measures config for Y-axes:', config.yAxes);
      config.yAxes.forEach((yAxis: string, index: number) => {
        if (yAxis && yAxis.trim()) {
          measuresConfig[yAxis] = config.aggregation || 'no_aggregation';
          console.log('🔍 ExploreCanvas: Added measure config for Y-axis:', yAxis, 'with aggregation:', config.aggregation || 'no_aggregation');
        }
      });
      console.log('🔍 ExploreCanvas: Final measures config:', measuresConfig);
      
      const operationsPayload = {
        file_key: safeData.dataframe,
        filters: filtersList, // Use chart filters instead of dateFilters
        group_by: config.legendField ? [config.xAxis, config.legendField] : [config.xAxis],
        measures_config: measuresConfig,
        chart_type: config.chartType,
        x_axis: config.xAxis,
        weight_column: config.weightColumn || null
      };
      
      console.log('🔍 ExploreCanvas: Operations payload:', operationsPayload);
      console.log('🔍 ExploreCanvas: Chart type being sent to API:', config.chartType);
      console.log('🔍 ExploreCanvas: Group by fields:', config.legendField ? [config.xAxis, config.legendField] : [config.xAxis]);





      // Specify operations
      console.log('🔍 ExploreCanvas: Specifying operations for explore atom ID:', exploreAtomId);
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

      console.log('🔍 ExploreCanvas: Operations response status:', operationsResponse.status);
      
      if (!operationsResponse.ok) {
        const errorText = await operationsResponse.text();
        console.error('🔍 ExploreCanvas: Operations specification failed:', errorText);
        throw new Error(`Operations specification failed: ${operationsResponse.status} - ${errorText}`);
      }
      
      const operationsResult = await operationsResponse.json();
      console.log('🔍 ExploreCanvas: Operations result:', operationsResult);

      // Get the chart data
      console.log('🔍 ExploreCanvas: Fetching chart data for explore atom ID:', exploreAtomId);
      const chartResponse = await fetch(`${EXPLORE_API}/chart-data-multidim/${exploreAtomId}`);
      
      console.log('🔍 ExploreCanvas: Chart data response status:', chartResponse.status);
      
      if (!chartResponse.ok) {
        const errorText = await chartResponse.text();
        console.error('🔍 ExploreCanvas: Chart data fetch failed:', errorText);
        throw new Error(`Chart data fetch failed: ${chartResponse.status} - ${errorText}`);
      }

      const result = await chartResponse.json();
      console.log('🔍 ExploreCanvas: Chart data response:', result);
      console.log('🔍 ExploreCanvas: Raw result.data:', result.data);
      console.log('🔍 ExploreCanvas: Raw result.data[0]:', result.data?.[0]);
      console.log('🔍 ExploreCanvas: Raw result.data keys:', result.data?.[0] ? Object.keys(result.data[0]) : 'No data');
      
      const chartData = result.data || [];
      
      console.log('🔍 ExploreCanvas: Chart generation result:', result);
      console.log('🔍 ExploreCanvas: Chart data for index', index, ':', chartData);
      console.log('🔍 ExploreCanvas: Chart data length:', chartData.length);
      console.log('🔍 ExploreCanvas: Chart data type:', typeof chartData);
      console.log('🔍 ExploreCanvas: Chart data is array:', Array.isArray(chartData));
      
      // Verify that chart data contains the expected Y-axes
      if (chartData.length > 0) {
        const firstItem = chartData[0];
        const availableKeys = Object.keys(firstItem);
        console.log('🔍 ExploreCanvas: Available keys in chart data:', availableKeys);
        console.log('🔍 ExploreCanvas: Expected Y-axes:', config.yAxes);
        const missingYAxes = config.yAxes.filter(yAxis => yAxis && !availableKeys.includes(yAxis));
        if (missingYAxes.length > 0) {
          console.warn('🔍 ExploreCanvas: Missing Y-axes in chart data:', missingYAxes);
        }
      }
      
      // Check if chart data has the expected structure
      if (chartData.length > 0) {
        console.log('🔍 ExploreCanvas: First chart data item:', chartData[0]);
        console.log('🔍 ExploreCanvas: Chart data keys:', Object.keys(chartData[0] || {}));
        console.log('🔍 ExploreCanvas: Chart data structure:', JSON.stringify(chartData[0], null, 2));
      } else {
        console.log('🔍 ExploreCanvas: No chart data returned - this might be due to filters or no matching data');
        console.log('🔍 ExploreCanvas: Full result object:', JSON.stringify(result, null, 2));
        // If no data is returned, we should still update the chart data sets to trigger a re-render
        // This will show the "No data available" message
      }
      
      console.log('🔍 ExploreCanvas: Raw chart data structure:', chartData);
      console.log('🔍 ExploreCanvas: Chart data length:', chartData?.length);
      console.log('🔍 ExploreCanvas: Chart data keys:', chartData?.[0] ? Object.keys(chartData[0]) : []);
      console.log('🔍 ExploreCanvas: Legend field in config:', config.legendField);
      console.log('🔍 ExploreCanvas: Legend field values in data:', config.legendField ? [...new Set(chartData?.map(item => item[config.legendField]) || [])] : 'N/A');
      
      setChartDataSets(prev => {
        const newData = {
          ...prev,
          [index]: chartData
        };

        console.log('🔍 ExploreCanvas: Updated chart data sets:', newData);
        console.log('🔍 ExploreCanvas: Chart data for index', index, 'after update:', newData[index]);
        console.log('🔍 ExploreCanvas: Chart data length after update:', newData[index]?.length);
        console.log('🔍 ExploreCanvas: Chart data keys after update:', newData[index] ? Object.keys(newData[index][0] || {}) : []);
        console.log('🔍 ExploreCanvas: Y-axes in config when updating data:', config.yAxes);
        console.log('🔍 ExploreCanvas: Chart data structure check:', newData[index]?.[0]);
        
        // Store original data if no filters are applied
        const hasFilters = chartFilters[index] && Object.keys(chartFilters[index]).some(key => 
          Array.isArray(chartFilters[index][key]) && chartFilters[index][key].length > 0
        );
        
        if (!hasFilters) {
          setOriginalChartData(prev => ({
            ...prev,
            [index]: chartData
          }));
          console.log('🔍 ExploreCanvas: Stored original chart data for index:', index);
        }
        
        // Force a re-render by updating the chart data state as well
        setChartData(result);
        
        return newData;
      });
      
      setChartData(result);
      
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
  const selectedDimensions = safeData.dimensions || [];
  const selectedMeasures = safeData.measures || [];
  const dimensionsWithIdentifiers = safeData.columnClassifierConfig?.dimensions || {};
  
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
      const identifiers = safeData.columnClassifierConfig?.identifiers?.length
        ? safeData.columnClassifierConfig.identifiers
        : safeData.fallbackDimensions?.length
          ? safeData.fallbackDimensions
          : safeData.allColumns || [];

      const measures = safeData.columnClassifierConfig?.measures?.length
        ? safeData.columnClassifierConfig.measures
        : safeData.fallbackMeasures?.length
          ? safeData.fallbackMeasures
          : safeData.allColumns || [];

      setAvailableIdentifiers(identifiers);
      setAvailableMeasures(measures);
    } catch (error) {
      console.error('Error loading column classifier config:', error);
      // Fall back to all columns if something goes wrong
      setAvailableIdentifiers(safeData.allColumns || []);
      setAvailableMeasures(safeData.allColumns || []);
    } finally {
      setIsLoadingColumns(false);
    }
  }, [
    safeData.dataframe,
    safeData.columnClassifierConfig,
    safeData.fallbackDimensions,
    safeData.fallbackMeasures,
    safeData.allColumns,
  ]);

  // Log available columns for debugging
  
  console.log('🔍 ExploreCanvas: Selected dimensions:', selectedDimensions);
  console.log('🔍 ExploreCanvas: Column classifier config dimensions:', dimensionsWithIdentifiers);
  console.log('🔍 ExploreCanvas: Available identifiers:', availableIdentifiers);
  console.log('🔍 ExploreCanvas: Available measures:', availableMeasures);
  console.log('🔍 ExploreCanvas: All available columns for dropdowns:', allAvailableColumns);
  console.log('🔍 ExploreCanvas: Column classifier config:', safeData.columnClassifierConfig);
  console.log('🔍 ExploreCanvas: Column classifier dimensions:', safeData.columnClassifierConfig?.dimensions);
  console.log('🔍 ExploreCanvas: Column classifier measures:', safeData.columnClassifierConfig?.measures);

  // Sample dimensions with identifiers for the filter UI - ONLY show selected dimensions
  console.log('🔍 ExploreCanvas: selectedDimensions:', selectedDimensions);
  console.log('🔍 ExploreCanvas: selectedDimensions type:', typeof selectedDimensions);
  console.log('🔍 ExploreCanvas: selectedDimensions is array:', Array.isArray(selectedDimensions));
  
  // Only process dimensions that exist in the column classifier config
  const availableDimensionKeys = Object.keys(dimensionsWithIdentifiers);
  console.log('🔍 ExploreCanvas: Available dimension keys from column classifier:', availableDimensionKeys);
  
  // Filter selectedDimensions to only include those that exist in column classifier config
  const validSelectedDimensions = Array.isArray(selectedDimensions) ? 
    selectedDimensions.filter(dimension => availableDimensionKeys.includes(dimension)) : [];
  console.log('🔍 ExploreCanvas: Valid selected dimensions:', validSelectedDimensions);
  
  const sampleDimensions = validSelectedDimensions.length > 0 ? validSelectedDimensions.map(dimension => {
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
          if (!hasMultipleValues) {
            console.log('🔍 ExploreCanvas: Filtering out identifier', identifier, 'with only', colInfo.unique_count, 'unique values');
          }
          return hasMultipleValues;
        }
        // If we can't determine unique count, include it (fallback behavior)
        console.log('🔍 ExploreCanvas: Could not determine unique count for identifier', identifier, '- including it as fallback');
        return true;
      });
      const filteredCount = identifiers.length;
      if (originalCount !== filteredCount) {
        console.log('🔍 ExploreCanvas: Filtered identifiers for dimension', dimension, ':', originalCount, '->', filteredCount);
      }
    }
    
    console.log('🔍 ExploreCanvas: Processing dimension:', dimension);
    console.log('🔍 ExploreCanvas: Identifiers for dimension (after filtering):', identifiers);
    
    return {
      id: dimension,
      name: dimension,
      identifiers: identifiers
    };
  }).filter(dimension => dimension.identifiers.length > 0) : [];
  
  console.log('🔍 ExploreCanvas: Final sample dimensions for filters:', sampleDimensions);

  // Render identifier chip for filter UI
  const renderIdentifierChip = (dimensionId: string, identifier: string) => {
    const selectedFilters = safeData.dateFilters?.find(f => f.column === `${dimensionId}_${identifier}`)?.values || [];
    
    const getUniqueValues = (dimId: string, ident: string) => {
      // Look up unique values from column summary if available
      if (Array.isArray(safeData.columnSummary)) {
        const colInfo: any = safeData.columnSummary.find((c: any) => c.column === ident);
        if (colInfo && Array.isArray(colInfo.unique_values)) {
          console.log('🔍 ExploreCanvas: Found column info for', ident, ':', colInfo);
          console.log('🔍 ExploreCanvas: Unique values count:', colInfo.unique_values.length);
          console.log('🔍 ExploreCanvas: Is numerical:', colInfo.is_numerical);
          console.log('🔍 ExploreCanvas: Data type:', colInfo.data_type);
          
          // For numerical columns, show all unique values (up to 1000)
          // For non-numerical columns, limit to 200 to avoid huge dropdowns
          const maxValues = colInfo.is_numerical ? 1000 : 200;
          const uniqueValues = colInfo.unique_values.slice(0, maxValues);
          
          console.log('🔍 ExploreCanvas: Returning', uniqueValues.length, 'values for', ident);
          console.log('🔍 ExploreCanvas: First few values:', uniqueValues.slice(0, 5));
          return uniqueValues;
        } else {
          console.log('🔍 ExploreCanvas: Column info not found or no unique values for', ident);
          console.log('🔍 ExploreCanvas: Available columns:', safeData.columnSummary.map((c: any) => c.column));
        }
      } else {
        console.log('🔍 ExploreCanvas: No column summary available');
      }
      return [];
    };

    const uniqueValues = getUniqueValues(dimensionId, identifier);

    return (
      <div key={`${dimensionId}_${identifier}`} className="relative">
        <Select 
          value={selectedFilters.length > 0 ? selectedFilters[0] : ''}
          onValueChange={(value) => {
            const currentFilters = safeData.dateFilters?.find(f => f.column === `${dimensionId}_${identifier}`)?.values || [];
            const newFilters = currentFilters.includes(value) 
              ? currentFilters.filter(f => f !== value)
              : [...currentFilters, value];
            handleFilterChange(`${dimensionId}_${identifier}`, newFilters);
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
              console.log('🔍 ExploreCanvas: Filter dropdown value:', value, 'for column:', identifier);
              
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
    
    // Debug logging for chart rendering
    console.log('🔍 ExploreCanvas: Rendering chart with data:', chartDataSets[index]);
    console.log('🔍 ExploreCanvas: Chart type:', config.chartType);
    console.log('🔍 ExploreCanvas: Data length:', chartDataSets[index]?.length);
    console.log('🔍 ExploreCanvas: Chart config for renderer:', {
      chartType: config.chartType,
      yAxes: config.yAxes,
      yAxisLabels: config.yAxisLabels,
      dataLength: chartDataSets[index]?.length
    });
    
    return (
      <div key={index} className="relative h-full w-full min-w-0 explore-chart-card">
        <Card className="border-pink-200 h-full w-full explore-chart-card">
          <CardContent className="p-4 flex flex-col h-full w-full min-w-0 explore-chart-content">
                        {/* Chart Configuration Header with Toggle */}
            <div className="flex items-center justify-between mb-4 p-3 bg-gray-50 rounded-lg">
              <div className="flex items-center space-x-2">
                <div className="flex items-center justify-center w-6 h-6 bg-pink-100 rounded-md">
                  <BarChart3 className="w-3 h-3 text-pink-600" />
                </div>
                <span className="font-semibold text-sm text-gray-800">Chart Configuration</span>
                <div className="h-px bg-gradient-to-r from-pink-200 to-transparent flex-1 ml-3"></div>
              </div>
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

            {/* Collapsible Chart Configuration Area */}
            <div className={`transition-all duration-300 ease-in-out min-w-0 w-full explore-chart-config ${chartConfigCollapsed[index] ? 'max-h-0 opacity-0 overflow-hidden' : 'max-h-none opacity-100'}`}>
              {/* Top row: Chart Type Icons and Action Icons */}
              <div className="flex items-center justify-between mb-3 p-3 bg-gray-50 rounded-lg min-w-0 w-full explore-chart-config">
                {/* Left side: Chart Type Icons */}
                <div className="flex items-center space-x-2 min-w-0">
                  {Array.isArray(chartTypes) ? chartTypes.map((type) => {
                    const Icon = type.icon;
                    return (
                      <div key={type.id} className="relative group/chart-type">
                        <Button
                          variant={config.chartType === type.id ? "default" : "outline"}
                          size="sm"
                          className={`h-8 w-8 p-0 hover:group ${
                            config.chartType === type.id 
                              ? 'bg-blue-500 text-white hover:bg-blue-600' 
                              : 'hover:bg-blue-50'
                          }`}
                          onClick={() => {
                            handleChartConfigChange('chartType', type.id);
                            // Update the chart config
                            const newConfigs = [...chartConfigs];
                            newConfigs[index] = { ...newConfigs[index], chartType: type.id };
                            setChartConfigs(newConfigs);
                            
                            // Regenerate chart when chart type changes to ensure proper rendering
                            if (config.xAxis && hasValidYAxes(config.yAxes)) {
                              console.log('🔍 ExploreCanvas: Chart type changed to:', type.id, '- regenerating chart');
                              const newConfig = { ...newConfigs[index], chartType: type.id };
                              safeTriggerChartGeneration(index, newConfig, 100);
                            }
                          }}
                        >
                          <Icon className="w-3 h-3" />
                        </Button>
                        {/* Tooltip */}
                        <div className="absolute bottom-full left-1/2 transform -translate-x-1/2 mb-2 px-2 py-1 bg-gray-900 text-white text-xs rounded opacity-0 group-hover/chart-type:opacity-100 transition-opacity duration-200 pointer-events-none whitespace-nowrap z-10">
                          {type.name}
                        </div>
                      </div>
                    );
                  }) : null}
                </div>

                {/* Right side: Action Icons */}
                <div className="flex items-center space-x-2 min-w-0 flex-shrink-0">
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
                </div>
              </div>

              {/* Bottom row: Axis Selectors and Legend Field */}
              <div className="flex items-center space-x-2 mb-3 p-3 bg-gray-50 rounded-lg min-w-0 w-full explore-axis-selectors">
                <Select 
                  value={config.xAxis}
                  onValueChange={(value) => {
                    console.log('🔍 ExploreCanvas: X-axis selected:', value);
                    const newConfigs = [...chartConfigs];
                    newConfigs[index] = { ...newConfigs[index], xAxis: value };
                    setChartConfigs(newConfigs);
                    
                    // Only trigger chart generation when both X and Y axes are available
                    if (value && hasValidYAxes(config.yAxes)) {
                      console.log('🔍 ExploreCanvas: X-axis updated, checking if chart generation is needed...');
                      console.log('🔍 ExploreCanvas: X-axis:', value);
                      console.log('🔍 ExploreCanvas: Y-axes:', config.yAxes);
                      
                      // Create the new config for chart generation
                      const newConfig = { ...newConfigs[index], xAxis: value };
                      
                      // Only generate chart if we have valid data
                      if (newConfig.xAxis && hasValidYAxes(newConfig.yAxes)) {
                        console.log('🔍 ExploreCanvas: All axes selected, auto-generating chart with debouncing');
                        safeTriggerChartGeneration(index, newConfig, 100);
                      }
                    }
                  }}
                >
                  <SelectTrigger className="w-32 h-8 text-xs" disabled={isLoadingColumns}>
                    <SelectValue placeholder={
                      isLoadingColumns ? "Loading..." : 
                      allAvailableColumns.length === 0 ? "No column classifier config" : 
                      "Select X-Axis"
                    } />
                  </SelectTrigger>
                  <SelectContent>
                    {Array.isArray(allAvailableColumns) ? allAvailableColumns.map((column, idx) => (
                      <SelectItem key={idx} value={column}>
                        <div className="flex items-center space-x-2">
                          <span>{column}</span>
                          {availableIdentifiers.includes(column) && (
                            <span className="text-xs text-blue-600 bg-blue-50 px-1 rounded">ID</span>
                          )}
                          {availableMeasures.includes(column) && (
                            <span className="text-xs text-green-600 bg-blue-50 px-1 rounded">M</span>
                          )}
                        </div>
                      </SelectItem>
                    )) : (
                      <div className="text-xs text-gray-500 p-2">No column classifier config</div>
                    )}
                  </SelectContent>
                </Select>
                
                <div className="flex items-center gap-1">
                  {Array.isArray(config.yAxes) ? config.yAxes.map((yAxis, yAxisIndex) => (
                    <div key={yAxisIndex} className="flex items-center gap-1">
                      <Select 
                        value={yAxis}
                        onValueChange={(value) => {
                          console.log('🔍 ExploreCanvas: Y-axis selected:', value);
                          const newConfigs = [...chartConfigs];
                          
                          // Update the Y-axis value
                          const updatedYAxes = Array.isArray(newConfigs[index].yAxes) ? 
                            newConfigs[index].yAxes.map((_, i) => (i === yAxisIndex ? value : _)) : 
                            [value];
                          
                          newConfigs[index] = {
                            ...newConfigs[index],
                            yAxes: updatedYAxes
                          };
                          
                          setChartConfigs(newConfigs);
                          
                          // Only trigger chart generation once when both X and Y axes are available
                          if (value && config.xAxis) {
                            console.log('🔍 ExploreCanvas: Y-axis updated, checking if chart generation is needed...');
                            console.log('🔍 ExploreCanvas: X-axis:', config.xAxis);
                            console.log('🔍 ExploreCanvas: Updated Y-axes:', updatedYAxes);
                            
                            // Create the new config for chart generation
                            const newConfig = { 
                              ...newConfigs[index],
                              yAxes: updatedYAxes
                            };
                            
                            // Only generate chart if we have valid data and haven't already triggered generation
                            const validYAxes = newConfig.yAxes.filter(y => y && y.trim() !== '');
                            if (newConfig.xAxis && validYAxes.length > 0) {
                              console.log('🔍 ExploreCanvas: All axes selected, auto-generating chart with debouncing');
                              console.log('🔍 ExploreCanvas: Valid Y-axes:', validYAxes);
                              safeTriggerChartGeneration(index, newConfig, 100);
                            }
                          }
                        }}
                      >
                        <SelectTrigger className="w-32 h-8 text-xs" disabled={isLoadingColumns}>
                          <SelectValue placeholder={
                            isLoadingColumns ? "Loading..." : 
                            allAvailableColumns.length === 0 ? "No column classifier config" : 
                            "Select Y-Axis"
                          } />
                        </SelectTrigger>
                        <SelectContent>
                          {Array.isArray(allAvailableColumns) ? allAvailableColumns.map((column, idx) => (
                            <SelectItem key={idx} value={column}>
                              <div className="flex items-center space-x-2">
                                <span>{column}</span>
                                {availableIdentifiers.includes(column) && (
                                  <span className="text-xs text-blue-600 bg-blue-50 px-1 rounded">ID</span>
                                )}
                                {availableMeasures.includes(column) && (
                                  <span className="text-xs text-green-600 bg-blue-50 px-1 rounded">M</span>
                                )}
                              </div>
                            </SelectItem>
                          )) : (
                            <div className="text-xs text-gray-500 p-2">No column classifier config</div>
                          )}
                        </SelectContent>
                      </Select>
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
                              yAxisLabels: newConfigs[index].yAxisLabels.filter((_, i) => i !== yAxisIndex)
                            };
                            setChartConfigs(newConfigs);
                            
                            // Clear chart data when Y-axis is removed to force re-render
                            setChartDataSets(prev => {
                              const newData = { ...prev };
                              delete newData[index];
                              console.log('🔍 ExploreCanvas: Cleared chart data for index', index, 'after Y-axis removal');
                              return newData;
                            });
                            
                            // Regenerate chart when Y-axis is removed to update display
                            if (newConfigs[index].xAxis && hasValidYAxes(newConfigs[index].yAxes)) {
                              console.log('🔍 ExploreCanvas: Y-axis removed - regenerating chart automatically');
                              console.log('🔍 ExploreCanvas: New config after Y-axis removal:', newConfigs[index]);
                              console.log('🔍 ExploreCanvas: Y-axes after removal:', newConfigs[index].yAxes);
                              safeTriggerChartGeneration(index, newConfigs[index], 100);
                            } else {
                              console.log('🔍 ExploreCanvas: Cannot regenerate chart - missing X or Y axis after removal');
                              console.log('🔍 ExploreCanvas: X-axis:', newConfigs[index].xAxis);
                              console.log('🔍 ExploreCanvas: Y-axes:', newConfigs[index].yAxes);
                            }
                          }}
                        >
                          <X className="w-3 h-3" />
                        </Button>
                      )}
                    </div>
                  )) : null}
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
                          yAxisLabels: [...newConfigs[index].yAxisLabels, '']
                        };
                        setChartConfigs(newConfigs);
                      }}
                    >
                      <Plus className="w-3 h-3" />
                    </Button>
                  )}
              </div>
              
                {/* Legend Field Selection - Clean version without icons */}
                <div className="flex items-center ml-4 border-l border-gray-200 pl-4">
                  <Select 
                    value={config.legendField || 'no_legend'}
                    onValueChange={(value) => {
                      console.log('🔍 ExploreCanvas: Legend field selected:', value);
                      const newConfigs = [...chartConfigs];
                      // Convert 'no_legend' back to empty string for storage
                      const actualValue = value === 'no_legend' ? '' : value;
                      newConfigs[index] = { ...newConfigs[index], legendField: actualValue };
                      setChartConfigs(newConfigs);
                      
                      // Only trigger chart generation when legend field is selected and all axes are available
                      if (actualValue && config.xAxis && hasValidYAxes(config.yAxes)) {
                        console.log('🔍 ExploreCanvas: Legend field selected, checking if chart generation is needed...');
                        console.log('🔍 ExploreCanvas: X-axis:', config.xAxis);
                        console.log('🔍 ExploreCanvas: Y-axes:', config.yAxes);
                        console.log('🔍 ExploreCanvas: Legend field:', actualValue);
                        
                        // Create the new config for chart generation
                        const newConfig = { ...newConfigs[index], legendField: actualValue };
                        
                        // Only generate chart if we have valid data
                        if (newConfig.xAxis && hasValidYAxes(newConfig.yAxes)) {
                          console.log('🔍 ExploreCanvas: All conditions met, auto-generating chart with debouncing');
                          safeTriggerChartGeneration(index, newConfig, 100);
                        }
                      }
                    }}
                  >
                    <SelectTrigger className="w-28 h-8 text-xs" disabled={isLoadingColumns}>
                      <SelectValue placeholder="Legend" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="no_legend">
                        <div className="flex items-center space-x-2">
                          <span className="text-gray-500">No Legend</span>
                        </div>
                      </SelectItem>
                      {Array.isArray(availableIdentifiers) && availableIdentifiers.length > 0 ? (
                        availableIdentifiers.map((column, idx) => (
                          <SelectItem key={idx} value={column}>
                            <div className="flex items-center space-x-2">
                              <span>{column}</span>
                              <span className="text-xs text-blue-600 bg-blue-50 px-1 rounded">ID</span>
                            </div>
                          </SelectItem>
                        ))
                      ) : (
                        <div className="text-xs text-gray-500 p-2">No categorical columns</div>
                      )}
                    </SelectContent>
                  </Select>
                </div>
              </div>
              

            </div>

            {/* Individual Chart Settings Panel */}
            {isSettingsVisible && (
              <div className="mb-4 p-3 bg-blue-50 rounded-lg border border-blue-200 min-w-0 w-full explore-chart-settings">
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4 min-w-0 w-full explore-chart-settings">
                  <div>
                    <Label className="text-xs text-gray-600">Chart Title</Label>
                    <Input
                      value={config.title || ''}
                      onChange={(e) => {
                        const newConfigs = [...chartConfigs];
                        newConfigs[index] = { ...newConfigs[index], title: e.target.value };
                        setChartConfigs(newConfigs);
                        
                                                                         // Regenerate chart when title changes to update display
                        if (config.xAxis && hasValidYAxes(config.yAxes)) {
                          console.log('🔍 ExploreCanvas: Chart title changed - regenerating chart automatically');
                          const newConfig = { ...newConfigs[index], title: e.target.value };
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
                            
                                                                                 // Regenerate chart when X-axis label changes to update display
                          if (config.xAxis && hasValidYAxes(config.yAxes)) {
                            console.log('🔍 ExploreCanvas: X-axis label changed - regenerating chart automatically');
                            const newConfig = { ...newConfigs[index], xAxisLabel: e.target.value };
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
                            
                                                                                 // Regenerate chart when Y-axis label changes to update display
                          if (config.xAxis && hasValidYAxes(config.yAxes)) {
                            console.log('🔍 ExploreCanvas: Y-axis label changed - regenerating chart automatically');
                            const newConfig = { 
                              ...newConfigs[index],
                              yAxisLabels: Array.isArray(newConfigs[index].yAxisLabels) ? 
                                newConfigs[index].yAxisLabels.map((_, i) => (i === yAxisIndex ? e.target.value : _)) : []
                            };
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
                      <Select 
                        value={config.aggregation || 'no_aggregation'}
                        onValueChange={(value) => {
                          const newConfigs = [...chartConfigs];
                          newConfigs[index] = { ...newConfigs[index], aggregation: value };
                          setChartConfigs(newConfigs);
                          
                          // Regenerate chart when aggregation changes
                          if (config.xAxis && hasValidYAxes(config.yAxes)) {
                            console.log('🔍 ExploreCanvas: Aggregation changed to:', value, '- regenerating chart');
                            const newConfig = { ...newConfigs[index], aggregation: value };
                            safeTriggerChartGeneration(index, newConfig, 100);
                          }
                        }}
                      >
                        <SelectTrigger className="h-8 text-xs">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="no_aggregation">No Aggregation</SelectItem>
                          <SelectItem value="sum">Sum</SelectItem>
                          <SelectItem value="avg">Average</SelectItem>
                          <SelectItem value="count">Count</SelectItem>
                          <SelectItem value="min">Min</SelectItem>
                          <SelectItem value="max">Max</SelectItem>
                          <SelectItem value="weighted_avg">Weighted Average</SelectItem>
                        </SelectContent>
                      </Select>
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
                            if (originalCount !== filteredCount) {
                              console.log('🔍 ExploreCanvas: Filtered chart filters for dimension', dimensionId, ':', originalCount, '->', filteredCount);
                            }
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
                              <div className="relative filter-dropdown">
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
                                
                                <div 
                                  className={`flex items-center justify-between w-28 h-6 text-xs bg-white border-2 rounded-md hover:border-gray-400 px-2 cursor-pointer transition-colors duration-200 ${dimensionColor.replace('bg-', 'border-').replace('text-', '').replace('hover:bg-', '')}`}
                                                                      onClick={(e) => {
                                      // Close all other dropdowns first, then toggle current one
                                      setOpenDropdowns(prev => {
                                        const newState = {};
                                        // Close all dropdowns for this chart
                                        Object.keys(prev).forEach(key => {
                                          if (key.startsWith(`${index}-`)) {
                                            newState[key] = false;
                                          }
                                        });
                                        // Toggle current dropdown
                                        newState[`${index}-${identifier}`] = !prev[`${index}-${identifier}`];
                                        return newState;
                                      });
                                      
                                      // Store dropdown position for proper positioning
                                      if (!openDropdowns[`${index}-${identifier}`]) {
                                        const button = e.currentTarget;
                                        const rect = button.getBoundingClientRect();
                                        setDropdownPosition({
                                          top: rect.bottom + window.scrollY + 4,
                                          left: rect.left + window.scrollX
                                        });
                                      }
                                    }}
                                >
                                  <span className="truncate font-medium">
                                    {loadingUniqueValues[identifier] ? "Loading..." : 
                                     (chartFilters[index]?.[identifier]?.length || 0) === 0 ? "All" :
                                     (chartFilters[index]?.[identifier]?.length || 0) === 1 ? 
                                       chartFilters[index]?.[identifier]?.[0] || "All" :
                                       `${chartFilters[index]?.[identifier]?.length || 0} selected`
                                    }
                                    {!appliedFilters[index] && (chartFilters[index]?.[identifier]?.length || 0) > 0 && (
                                      <span className="ml-1 text-orange-600">*</span>
                                    )}
                                  </span>
                                  <ChevronDown className="w-3 h-3" />
                                </div>
                                
                                {/* Multi-select dropdown content */}
                                                                 {openDropdowns[`${index}-${identifier}`] && dropdownPosition && (
                                    <div 
                                      className="fixed w-48 bg-white border border-gray-300 rounded-md shadow-lg z-50 max-h-32 overflow-y-auto"
                                      style={{
                                        top: `${dropdownPosition.top}px`,
                                        left: `${dropdownPosition.left}px`,
                                        position: 'fixed',
                                        zIndex: 9999
                                      }}
                                      onClick={(e) => e.stopPropagation()}
                                    >
                                  <div className="p-0.5">
                                    {/* Debug info - removed console.log from JSX */}
                                    <label className="flex items-center space-x-2 py-0.5 px-1 hover:bg-gray-50 cursor-pointer">
                                      <input
                                        type="checkbox"
                                        checked={chartFilters[index]?.[identifier] !== null && (chartFilters[index]?.[identifier]?.length || 0) === 0}
                                        onChange={() => {
                                          console.log(`🔍 "All" checkbox clicked for ${identifier}. Current state:`, chartFilters[index]?.[identifier]);
                                          const currentValues = chartFilters[index]?.[identifier] || [];
                                          const allValues = identifierUniqueValues[identifier] || [];
                                          
                                          if (currentValues.length === 0) {
                                            // "All" is currently selected, deselect it by deselecting all individual options
                                            console.log(`🔍 Deselecting "All" for ${identifier}, deselecting all individual options`);
                                            // Set to null to represent "no options selected"
                                            handleMultiSelectFilterChange(index, identifier, null);
                                          } else {
                                            // "All" is not selected (either null or specific values), select it
                                            console.log(`🔍 Selecting "All" for ${identifier}, selecting all individual options`);
                                            handleMultiSelectFilterChange(index, identifier, []);
                                          }
                                        }}
                                        className="w-3 h-3"
                                      />
                                      <span className="text-xs">All</span>
                                    </label>
                                    {identifierUniqueValues[identifier]?.map((value, idx) => (
                                      <label key={idx} className="flex items-center space-x-2 py-0.5 px-1 hover:bg-gray-50 cursor-pointer">
                                        <input
                                          type="checkbox"
                                          checked={chartFilters[index]?.[identifier] === null ? false : (chartFilters[index]?.[identifier]?.length || 0) === 0 || chartFilters[index]?.[identifier]?.includes(value) || false}
                                          onChange={(e) => {
                                            const currentValues = chartFilters[index]?.[identifier] || [];
                                            const allValues = identifierUniqueValues[identifier] || [];
                                            
                                            console.log(`🔍 Individual checkbox clicked for ${identifier}: ${value}. Current values:`, currentValues, 'All values:', allValues);
                                            
                                            if (e.target.checked) {
                                                // Adding a value
                                                let newValues;
                                                if (currentValues.length === 0) {
                                                  // Currently showing "All", so start with all values and add this one
                                                  // But since we're adding a value, we're deselecting "All"
                                                  newValues = [value];
                                                } else if (currentValues === null) {
                                                  // Currently in "none selected" state, start fresh with just this value
                                                  newValues = [value];
                                                } else {
                                                  newValues = [...currentValues, value];
                                                }
                                                console.log(`🔍 Adding value ${value} to filter ${identifier}. New values:`, newValues);
                                                
                                                // Check if all values are now selected (including this new one)
                                                if (newValues.length === allValues.length) {
                                                  // All values are selected, automatically select "All"
                                                  console.log(`🔍 All values selected for ${identifier}, automatically selecting "All"`);
                                                  handleMultiSelectFilterChange(index, identifier, []);
                                                } else {
                                                  // Keep the filter with the new values
                                                  handleMultiSelectFilterChange(index, identifier, newValues);
                                                }
                                              } else {
                                                // Removing a value
                                                const newValues = currentValues.filter(v => v !== value);
                                                console.log(`🔍 Removing value ${value} from filter ${identifier}. Remaining values:`, newValues);
                                              
                                                // If we're removing a value and currently showing "All" (empty array),
                                                // we need to start with all values and then remove this one
                                                if (currentValues.length === 0) {
                                                  // Currently showing "All", so start with all values and remove this one
                                                  const allValuesExceptThis = allValues.filter(v => v !== value);
                                                  console.log(`🔍 Was showing "All", now filtering with:`, allValuesExceptThis);
                                                  handleMultiSelectFilterChange(index, identifier, allValuesExceptThis);
                                                } else if (currentValues === null) {
                                                  // Currently in "none selected" state, stay in that state
                                                  console.log(`🔍 Already in "none selected" state for ${identifier}`);
                                                  handleMultiSelectFilterChange(index, identifier, null);
                                                } else {
                                                  // Already filtering, just remove this value
                                                  if (newValues.length === 0) {
                                                    // No values left, show "All"
                                                    console.log(`🔍 No values left for ${identifier}, setting to "All"`);
                                                    handleMultiSelectFilterChange(index, identifier, []);
                                                  } else {
                                                    // Keep the filter with remaining values
                                                    console.log(`🔍 Keeping filter for ${identifier} with values:`, newValues);
                                                    handleMultiSelectFilterChange(index, identifier, newValues);
                                                  }
                                                }
                                            }
                                          }}
                                          className="w-3 h-3"
                                        />
                                        <span className="text-xs truncate">{value}</span>
                                      </label>
                                    ))}
                                  </div>
                                </div>
                                )}
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
                            {config.xAxis && hasValidYAxes(config.yAxes) && !isChartLoading(index) && !chartDataSets[index] && !error && (
              <div className="mb-3 p-2 bg-blue-50 border border-blue-200 rounded-lg min-w-0">
                <div className="flex items-center space-x-2 text-xs text-blue-700 min-w-0">
                  <div className="w-3 h-3 border-2 border-blue-300 border-t-blue-600 rounded-full animate-spin"></div>
                  <span>Generating chart...</span>
                </div>
              </div>
            )}
            
            {/* Chart Display */}
            <div 
              className="bg-white border border-gray-200 rounded-lg p-6 cursor-pointer hover:border-pink-300 transition-colors relative flex-1 overflow-hidden flex-shrink-0 flex items-center justify-center"
              style={{ 
                minHeight: '300px', 
                height: (chartDataSets[index] && chartDataSets[index].length > 0) ? '400px' : '300px',
                maxHeight: (chartDataSets[index] && chartDataSets[index].length > 0) ? '500px' : '300px'
              }}
            >
              <div className="h-full w-full flex flex-col min-w-0 overflow-hidden">
                

                
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
                  <div className="w-full h-full min-w-0 flex-shrink-0" style={{ height: 'calc(100% - 60px)' }}>
                    {/* Check if chart data exists and has valid structure */}
                    {(!chartDataSets[index] || chartDataSets[index].length === 0 || !Array.isArray(chartDataSets[index])) ? (
                      <div className="text-center p-4 border-2 border-dashed border-gray-300 rounded-lg h-full flex items-center justify-center">
                        <div className="text-gray-500 text-sm">
                          {config.xAxis && config.yAxes && config.yAxes.length > 0 && config.yAxes.every(y => y) ? 
                            (chartDataSets[index] && chartDataSets[index].length === 0 ? 
                              'No data available for the selected filters. Try adjusting your filter criteria.' : 
                              `Chart ready: ${config.xAxis} vs ${config.yAxes.filter(y => y).join(', ')}`
                            ) : 
                            'Select X and Y axes to generate chart'
                          }
                        </div>
                      </div>
                    ) : (
                      <div className="w-full h-full min-w-0 overflow-hidden flex-shrink-0 flex items-center justify-center explore-chart-area" style={{ 
                        minHeight: config.chartType === 'pie_chart' ? '450px' : '400px', 
                        height: config.chartType === 'pie_chart' ? '500px' : '400px',
                        maxWidth: '100%'
                      }}>
                        {/* Only render the chart if we have valid xAxis and yAxes */}
                        {(() => {
                          const hasValidAxes = config.xAxis && config.yAxes && config.yAxes.length > 0 && config.yAxes.every(y => y);
                          const yAxesString = config.yAxes.join(',');
                          console.log('🔍 ExploreCanvas: Chart rendering condition check:', {
                            index,
                            xAxis: config.xAxis,
                            yAxes: config.yAxes,
                            yAxesString,
                            hasValidAxes,
                            chartData: chartDataSets[index],
                            chartDataLength: chartDataSets[index]?.length || 0
                          });
                          return hasValidAxes;
                        })() ? (
                          <RechartsChartRenderer
                            key={`chart-${index}-${config.chartType}-${chartThemes[index] || 'default'}-${chartDataSets[index]?.length || 0}-${Object.keys(chartFilters[index] || {}).length}-${appliedFilters[index] ? 'filtered' : 'unfiltered'}-theme-${chartThemes[index] || 'default'}-sort-${chartSortCounters[index] || 0}-yaxes-${config.yAxes.join('-')}`}
                            type={config.chartType as 'bar_chart' | 'line_chart' | 'pie_chart'}
                            data={chartDataSets[index] || []}
                            xField={config.xAxis || undefined}
                            yField={config.yAxes[0] || undefined}
                            title={config.title}
                            xAxisLabel={config.xAxisLabel || config.xAxis || ''}
                            yAxisLabel={config.yAxisLabels[0] || config.yAxes[0] || ''}
                            yFields={config.yAxes}
                            yAxisLabels={config.yAxes.map((yAxis: string, idx: number) => 
                              config.yAxisLabels[idx] || yAxis || ''
                            )}
                            legendField={config.legendField || undefined}
                            // Add debugging props to help troubleshoot
                            data-testid={`chart-${index}`}
                            data-yaxes={JSON.stringify(config.yAxes)}
                            data-yaxislabels={JSON.stringify(config.yAxisLabels)}
                            data-legendfield={config.legendField || 'undefined'}
                            data-chartdata={JSON.stringify(chartDataSets[index] || [])}
                            data-chartdatalength={chartDataSets[index]?.length || 0}
                            theme={chartThemes[index] || 'default'}
                            enableScroll={false}
                            onThemeChange={(theme) => handleChartThemeChange(index, theme)}
                            onGridToggle={(enabled) => handleChartGridToggle(index, enabled)}
                            onLegendToggle={(enabled) => handleChartLegendToggle(index, enabled)}
                            onAxisLabelsToggle={(enabled) => handleChartAxisLabelsToggle(index, enabled)}
                            onDataLabelsToggle={(enabled) => handleChartDataLabelsToggle(index, enabled)}
                            onSave={() => handleChartSave(index)}
                            onSortChange={(chartIndex) => {
                              console.log('🔄 ExploreCanvas: Sort change detected for chart', chartIndex);
                              console.log('🔄 Current chartDataSets:', chartDataSets);
                              console.log('🔄 Updating sort counter for chart', index);
                              setChartSortCounters(prev => ({
                                ...prev,
                                [index]: (prev[index] || 0) + 1
                              }));
                            }}
                            showLegend={chartOptions[index]?.legend}
                            showAxisLabels={chartOptions[index]?.axisLabels}
                            showDataLabels={chartOptions[index]?.dataLabels}
                            showGrid={chartOptions[index]?.grid}
                          />
                        ) : (
                          <div className="text-center p-4 border-2 border-dashed border-gray-300 rounded-lg h-full flex items-center justify-center">
                            <div className="text-gray-500 text-sm">
                              Select X and Y axes to generate chart
                            </div>
                          </div>
                        )}
                      </div>
                    )}
                  </div>
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
      console.warn('Error parsing date:', value, error);
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
            console.warn('Error parsing fetched date range:', error);
          }
        }
        
        // Fallback to parsing values if no fetched date range
        const dates = values
          .map(v => parseDate(v))
          .filter(date => date !== null)
          .sort((a, b) => a!.getTime() - b!.getTime());
        
        if (dates.length === 0) {
          console.warn('No valid dates found for column:', columnName, 'Values:', values);
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
      console.error('Error formatting time column values:', error);
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

  // If showDataSummary is true but no column summary is available, try to fetch it
  useEffect(() => {
    if (safeData.showDataSummary && summaryList.length === 0 && safeData.dataframe) {
      const fetchColumnSummary = async () => {
        try {
          const response = await fetch(`${EXPLORE_API}/column_summary?object_name=${encodeURIComponent(safeData.dataframe)}`);
          if (response.ok) {
            const summary = await response.json();
            const summaryData = Array.isArray(summary.summary) ? summary.summary.filter(Boolean) : [];
            onDataChange({ columnSummary: summaryData });
          } else {
            console.warn('ExploreCanvas - Column summary not found for:', safeData.dataframe);
          }
        } catch (error) {
          console.error('ExploreCanvas - Error fetching column summary:', error);
        }
      };
      fetchColumnSummary();
    }
  }, [safeData.showDataSummary, summaryList.length, safeData.dataframe, onDataChange]);

  // Also fetch column summary when filters are displayed but no summary is available
  useEffect(() => {
    if (isApplied && sampleDimensions.length > 0 && summaryList.length === 0 && safeData.dataframe) {
      console.log('🔍 ExploreCanvas: Fetching column summary for filters');
      setIsLoadingColumnSummary(true);
      const fetchColumnSummary = async () => {
        try {
          const response = await fetch(`${EXPLORE_API}/column_summary?object_name=${encodeURIComponent(safeData.dataframe)}`);
          if (response.ok) {
            const summary = await response.json();
            const summaryData = Array.isArray(summary.summary) ? summary.summary.filter(Boolean) : [];
            onDataChange({ columnSummary: summaryData });
            console.log('🔍 ExploreCanvas: Column summary fetched for filters:', summaryData.length, 'columns');
          } else {
            console.warn('ExploreCanvas - Column summary not found for filters:', safeData.dataframe);
          }
        } catch (error) {
          console.error('ExploreCanvas - Error fetching column summary for filters:', error);
        } finally {
          setIsLoadingColumnSummary(false);
        }
      };
      fetchColumnSummary();
    }
  }, [isApplied, sampleDimensions.length, summaryList.length, safeData.dataframe, onDataChange]);

  // Fetch date ranges for date columns when column summary is loaded
  useEffect(() => {
    if (summaryList.length > 0 && safeData.dataframe) {
      // Find date columns and fetch their date ranges
      const dateColumns = summaryList.filter(col => 
        col.column.toLowerCase().includes('date') || 
        col.data_type.toLowerCase().includes('date')
      );
      
      dateColumns.forEach(col => {
        if (!dateRanges[col.column]) {
          fetchDateRange(col.column);
        }
      });
    }
  }, [summaryList, safeData.dataframe]); // Removed dateRanges from dependencies to avoid infinite loop

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

  // Handle save action for charts
  const handleChartSave = (chartIndex: number) => {
    // Implement save functionality here
    console.log(`Saving chart ${chartIndex}`);
    // Success message removed - unnecessary notification popup
  };

  // Helper function to fetch date range for a specific column
  const fetchDateRange = async (columnName: string) => {
    if (!safeData.dataframe || !columnName.toLowerCase().includes('date')) return;
    
    try {
      const response = await fetch(`${EXPLORE_API}/date-range?object_name=${encodeURIComponent(safeData.dataframe)}&date_column=${encodeURIComponent(columnName)}`);
      if (response.ok) {
        const data = await response.json();
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
      console.warn('Failed to fetch date range for column:', columnName, error);
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
      
      onDataChange({
        selectedIdentifiers: allIdentifiers
      });
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
          if (originalCount !== filteredCount) {
            console.log('🔍 ExploreCanvas: Filtered card dimensions for dimension', dimensionId, ':', originalCount, '->', filteredCount);
          }
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

  // Hide all filters when layout changes
  const hideAllFilters = () => {
    const newFilterVisibility: { [key: number]: boolean } = {};
    chartConfigs.forEach((_, index) => {
      newFilterVisibility[index] = false;
    });
    setChartFiltersVisible(newFilterVisibility);
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
  
  // Re-initialize all existing cards when column summary changes (to apply filtering)
  useEffect(() => {
    if (safeData.columnSummary && Object.keys(cardSelectedIdentifiers).length > 0) {
      // Re-initialize all existing cards with filtered identifiers
      Object.keys(cardSelectedIdentifiers).forEach(chartIndex => {
        initializeCardDimensions(parseInt(chartIndex));
      });
    }
  }, [safeData.columnSummary]);

  // Debug: Log initial filter state
  useEffect(() => {
    console.log('🔍 ExploreCanvas: Initial chartFilters state:', chartFilters);
    console.log('🔍 ExploreCanvas: chartFilters keys:', Object.keys(chartFilters));
    Object.entries(chartFilters).forEach(([chartIndex, filters]) => {
      console.log(`🔍 ExploreCanvas: Chart ${chartIndex} filters:`, filters);
      Object.entries(filters).forEach(([identifier, values]) => {
        console.log(`🔍 ExploreCanvas: Chart ${chartIndex}, Filter ${identifier}:`, values, 'length:', values?.length);
      });
    });
  }, [chartFilters]);

  return (
    <div className="h-full flex flex-col space-y-4 p-4 min-h-0">
      {/* Data Summary Table Section - styled like Feature Overview */}
      {summaryList.length > 0 && safeData.showDataSummary && (
        <Card className="border-gray-200 bg-white shadow-sm mb-6">
          <CardContent className="p-4">
            <div className="flex items-center justify-between mb-4">
              <div className="flex items-center space-x-2">
                <div className="flex items-center justify-center w-6 h-6 bg-gray-100 rounded-md">
                  <BarChart3 className="w-3 h-3 text-gray-600" />
                </div>
                <span className="font-semibold text-sm text-gray-800">DataFrame Summary</span>
                <div className="h-px bg-gradient-to-r from-gray-200 to-transparent flex-1 ml-3"></div>
              </div>
              <div className="flex items-center gap-4">
                {/* Toggle button for "Fetch columns with more than one unique value" */}
                <div className="flex items-center gap-2">
                  <span className="text-xs text-gray-500">Fetch columns with more than one unique value</span>
                  <Switch
                    checked={safeData.filterUnique || false}
                    onCheckedChange={(val) => {
                      onDataChange({ filterUnique: val });
                    }}
                    className="data-[state=checked]:bg-[#458EE2]"
                  />
                </div>
                {/* Collapse/Expand button */}
                <button
                  onClick={() => toggleDataSummaryCollapsed(0)}
                  className="p-2 hover:bg-gray-100 rounded-lg transition-colors"
                  aria-label={dataSummaryCollapsed[0] ? 'Expand data summary' : 'Collapse data summary'}
                >
                  {dataSummaryCollapsed[0] ? (
                    <ChevronDown className="w-5 h-5 text-gray-600" />
                  ) : (
                    <ChevronUp className="w-5 h-5 text-gray-600" />
                  )}
                </button>
              </div>
            </div>

            <div className={`transition-all duration-300 ease-in-out ${dataSummaryCollapsed[0] ? 'max-h-0 opacity-0 overflow-hidden' : 'max-h-none opacity-100'}`}>
              <div className="bg-white rounded-lg border border-gray-200 overflow-hidden">
                {/* Transposed Table Layout - Matching Column Classifier Column Overview */}
                <div className="overflow-x-auto">
                  <div className="min-w-max">
                    <div className="grid grid-rows-4 gap-0">
                      {/* Row 1: Column Names */}
                      <div className="flex bg-white border-b border-gray-200">
                        <div className="w-40 font-bold text-black bg-gray-100 border-r border-gray-300 flex items-center justify-center sticky left-0 z-10">
                          Columns
                        </div>
                        {Array.isArray(summaryList) ? summaryList.map((col, index) => (
                          <div
                            key={index}
                            className="w-32 text-sm font-semibold text-black border-r border-gray-200 flex items-center justify-center"
                          >
                            {col.column}
                          </div>
                        )) : null}
                      </div>

                      {/* Row 2: Data Types */}
                      <div className="flex bg-white border-b border-gray-200">
                        <div className="w-40 font-bold text-black bg-gray-100 border-r border-gray-300 flex items-center justify-center sticky left-0 z-10">
                          Data Type
                        </div>
                        {Array.isArray(summaryList) ? summaryList.map((col, index) => (
                          <div
                            key={index}
                            className="w-32 text-sm border-r border-gray-200 flex items-center justify-center"
                          >
                            <Badge
                              className="p-0 text-xs font-medium bg-gray-50 text-black"
                            >
                              {col.data_type}
                            </Badge>
                          </div>
                        )) : null}
                      </div>

                      {/* Row 3: Unique Counts */}
                      <div className="flex bg-gray-50 border-b border-gray-200">
                        <div className="w-40 font-bold text-black bg-gray-100 border-r border-gray-300 flex items-center justify-center sticky left-0 z-10">
                          Unique Counts
                        </div>
                        {Array.isArray(summaryList) ? summaryList.map((col, index) => (
                          <div
                            key={index}
                            className="w-32 text-sm text-black border-r border-gray-200 flex items-center justify-center font-medium"
                          >
                            {col.unique_count}
                          </div>
                        )) : null}
                      </div>

                      {/* Row 4: Unique Values */}
                      <div className="flex bg-white">
                        <div className="w-40 font-bold text-black bg-gray-100 border-r border-gray-300 flex items-center justify-center sticky left-0 z-10 py-1">
                          Unique Values
                        </div>
                        {Array.isArray(summaryList) ? summaryList.map((col, index) => (
                          <div
                            key={index}
                            className="w-32 text-sm border-r border-gray-200 flex items-center justify-center py-1"
                          >
                            <div className="flex flex-col gap-px items-center">
                              {(() => {
                                // Check if this is a time column
                                const isTime = isTimeColumn(col.column, col.data_type);
                                
                                if (isTime) {
                                  // For time columns, use the new formatTimeColumnValues function
                                  const formattedValues = formatTimeColumnValues(col.column, col.unique_values, col.data_type);
                                  return (
                                    <Badge className="p-0 text-xs bg-gray-50 text-black">
                                      {formattedValues}
                                    </Badge>
                                  );
                                } else {
                                  // For non-time columns, show first 2 values + count
                                  const visibleValues = Array.isArray(col.unique_values) ? col.unique_values.slice(0, 2) : [];
                                  const hiddenCount = Array.isArray(col.unique_values) ? col.unique_values.length - 2 : 0;
                                  
                                  return (
                                    <>
                                      {visibleValues.map((val, i) => (
                                        <Badge
                                          key={i}
                                          className="p-0 text-xs bg-gray-50 text-black"
                                        >
                                          {String(val)}
                                        </Badge>
                                      ))}
                                      {hiddenCount > 0 && (
                                        <Tooltip>
                                          <TooltipTrigger asChild>
                                            <span className="flex items-center gap-0.5 text-xs text-gray-600 font-medium cursor-pointer">
                                              +{hiddenCount}
                                            </span>
                                          </TooltipTrigger>
                                          <TooltipContent className="text-xs max-w-xs whitespace-pre-wrap">
                                            {Array.isArray(col.unique_values) ? col.unique_values
                                              .slice(2)
                                              .map(val => String(val))
                                              .join(', ') : ''}
                                          </TooltipContent>
                                        </Tooltip>
                                      )}
                                    </>
                                  );
                                }
                              })()}
                              {Array.isArray(col.unique_values) && col.unique_values.length === 0 && (
                                <span className="text-xs text-gray-500 italic font-medium">
                                  No values
                                </span>
                              )}
                            </div>
                          </div>
                        )) : null}
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Show configuration message when atom is not applied but data summary is shown */}
      {safeData.showDataSummary && summaryList.length > 0 && !isApplied && (
        <div className="flex items-center justify-center py-8">
          <div className="text-center">
            <div className="w-12 h-12 bg-blue-100 rounded-full flex items-center justify-center mx-auto mb-3">
              <BarChart3 className="w-6 h-6 text-blue-600" />
            </div>
            <h3 className="text-lg font-medium text-gray-900 mb-2">Configure Explore Settings</h3>
            <p className="text-sm text-gray-600 mb-4">
              Go to the Settings tab to configure dimensions, measures, and chart layout, then click "Apply Settings"
            </p>
            <div className="flex items-center justify-center space-x-2 text-xs text-gray-500">
              <div className="w-2 h-2 bg-blue-500 rounded-full"></div>
              <span>Data summary table is visible</span>
            </div>
          </div>
        </div>
      )}



      {/* Multi-Graph Layout with Plus Button */}
      {safeData.dataframe && (isApplied || safeData.applied) && safeData.graphLayout.numberOfGraphsInRow > 0 && (
        <div className="flex-1 explore-chart-container">
          {safeData.graphLayout.numberOfGraphsInRow === 1 ? (
            // 1 graph per row: Simple vertical layout with plus button
            <div className="space-y-4">
              {Array.isArray(chartConfigs) ? chartConfigs.map((_, index) => renderChartComponent(index)) : null}
              
              {/* Plus Button - Always visible for 1 graph per row */}
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
            // 2+ graphs per row: Grid layout with centered plus button
            <div className="space-y-4">
              <div 
                className="explore-chart-grid gap-6"
                style={{
                  gridTemplateColumns: `repeat(${safeData.graphLayout.numberOfGraphsInRow}, 1fr)`
                }}
              >
                {Array.isArray(chartConfigs) ? chartConfigs.map((_, index) => renderChartComponent(index)) : null}
              </div>
              {/* Plus Button - Always centered below the grid */}
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
    </div>
  );
};

export default ExploreCanvas;