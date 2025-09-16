import React, { useState, useEffect, useCallback, useRef } from 'react';
import { X, Play, Save, Filter, ChevronDown, ArrowUp, ArrowDown, FilterIcon, Plus } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Slider } from '@/components/ui/slider';
import { Card } from '@/components/ui/card';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Checkbox } from '@/components/ui/checkbox';
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, PieChart, Pie, Cell, ScatterChart, Scatter, Legend } from 'recharts';
import { useLaboratoryStore } from '@/components/LaboratoryMode/store/laboratoryStore';
import { SELECT_API, EXPLORE_API, FEATURE_OVERVIEW_API, GROUPBY_API } from '@/lib/api';
import { useToast } from '@/hooks/use-toast';
import { ContextMenu, ContextMenuContent, ContextMenuItem, ContextMenuSub, ContextMenuSubContent, ContextMenuSubTrigger, ContextMenuTrigger, ContextMenuSeparator } from '@/components/ui/context-menu';
import { Tooltip as UITooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';
import Table from '@/templates/tables/table';
import RechartsChartRenderer from '@/templates/charts/RechartsChartRenderer';

interface SelectModelsFeatureCanvasProps {
  atomId: string;
  data: any;
}

// Dynamic color palette function
const getColor = (index: number) => {
  const colors = [
    'hsl(217 91% 60%)',   // Blue
  'hsl(197 92% 61%)',   // Teal blue
  'hsl(262 83% 58%)',   // Purple
  'hsl(173 58% 39%)',   // Dark teal
  'hsl(43 74% 66%)',    // Golden yellow
    'hsl(215 28% 17%)',   // Navy blue
    'hsl(142 76% 36%)',   // Green
    'hsl(0 84% 60%)',     // Red
    'hsl(280 65% 60%)',   // Magenta
    'hsl(32 95% 44%)',    // Orange
    'hsl(200 98% 39%)',   // Dark blue
    'hsl(120 61% 34%)',   // Dark green
    'hsl(340 82% 52%)',   // Pink
    'hsl(60 100% 50%)',   // Yellow
    'hsl(180 100% 25%)',  // Dark cyan
    'hsl(300 100% 25%)'   // Dark magenta
  ];
  
  // If we have more models than colors, cycle through the palette
  return colors[index % colors.length];
};

const SelectModelsFeatureCanvas: React.FC<SelectModelsFeatureCanvasProps> = ({
  atomId,
  data
}) => {
  const { toast } = useToast();
  // State for variable selection popover
  const [variablePopoverOpen, setVariablePopoverOpen] = useState(false);
  // State for filter stats collapsible section
  const [filterStatsOpen, setFilterStatsOpen] = useState(true);
  // State for filter variables collapsible section
  const [filterVariablesOpen, setFilterVariablesOpen] = useState(false);
  // State for combination status
  const [combinationStatus, setCombinationStatus] = useState<any>(() => {
    return data.combinationStatus || null;
  });
  const [isLoadingCombinationStatus, setIsLoadingCombinationStatus] = useState(false);
  const [combinationStatusMinimized, setCombinationStatusMinimized] = useState(() => {
    return data.combinationStatusMinimized || false;
  });
  // Refs to track previous values for auto-update
  const prevSelectedVariable = useRef<any>(null);
  const prevSelectedMethod = useRef<string | null>(null);
  const prevSelectedCombinationId = useRef<string | null>(null);
  // Flag to prevent auto-update when updating with filtered data
  const isUpdatingWithFilters = useRef(false);

  // Cardinality View state
  const [cardinalityData, setCardinalityData] = useState<any[]>([]);
  const [cardinalityLoading, setCardinalityLoading] = useState(false);
  const [cardinalityError, setCardinalityError] = useState<string | null>(null);
  
  // Sorting and filtering state for Cardinality View
  const [sortColumn, setSortColumn] = useState<string>('');
  const [sortDirection, setSortDirection] = useState<'asc' | 'desc'>('asc');
  const [columnFilters, setColumnFilters] = useState<Record<string, string[]>>({});

  // Chart settings for contribution chart
  const [contributionChartType, setContributionChartType] = useState<'bar_chart' | 'line_chart' | 'pie_chart' | 'area_chart' | 'scatter_chart'>('pie_chart');
  const [contributionChartTheme, setContributionChartTheme] = useState<string>('default');
  const [contributionChartDataLabels, setContributionChartDataLabels] = useState<boolean>(false);
  const [contributionChartSortOrder, setContributionChartSortOrder] = useState<'asc' | 'desc' | null>(null);

  // Chart settings for Y-O-Y chart
  const [yoyChartType, setYoyChartType] = useState<'bar_chart' | 'line_chart' | 'pie_chart' | 'area_chart' | 'scatter_chart'>('bar_chart');
  const [yoyChartTheme, setYoyChartTheme] = useState<string>('default');
  const [yoyChartDataLabels, setYoyChartDataLabels] = useState<boolean>(false);
  const [yoyChartSortOrder, setYoyChartSortOrder] = useState<'asc' | 'desc' | null>(null);

  // Chart settings for predicted vs actual chart
  const [predictedVsActualChartType, setPredictedVsActualChartType] = useState<'bar_chart' | 'line_chart' | 'pie_chart' | 'area_chart' | 'scatter_chart'>('scatter_chart');
  const [predictedVsActualChartTheme, setPredictedVsActualChartTheme] = useState<string>('default');
  const [predictedVsActualChartDataLabels, setPredictedVsActualChartDataLabels] = useState<boolean>(false);
  const [predictedVsActualChartSortOrder, setPredictedVsActualChartSortOrder] = useState<'asc' | 'desc' | null>(null);

  // Chart settings for method by model chart
  const [methodByModelChartType, setMethodByModelChartType] = useState<'bar_chart' | 'line_chart' | 'pie_chart' | 'area_chart' | 'scatter_chart'>('bar_chart');
  const [methodByModelChartTheme, setMethodByModelChartTheme] = useState<string>('default');
  const [methodByModelChartDataLabels, setMethodByModelChartDataLabels] = useState<boolean>(false);
  const [methodByModelChartSortOrder, setMethodByModelChartSortOrder] = useState<'asc' | 'desc' | null>(null);

  const updateSettings = useLaboratoryStore(state => state.updateAtomSettings);

  const handleDataChange = (newData: Partial<any>) => {
    updateSettings(atomId, newData);
  };

  // Chart settings handlers
  const handleContributionChartTypeChange = (newType: 'bar_chart' | 'line_chart' | 'pie_chart' | 'area_chart' | 'scatter_chart') => {
    setContributionChartType(newType);
  };

  const handleContributionChartThemeChange = (newTheme: string) => {
    setContributionChartTheme(newTheme);
  };

  const handleContributionChartDataLabelsChange = (newShowDataLabels: boolean) => {
    setContributionChartDataLabels(newShowDataLabels);
  };

  const handleContributionChartSortOrderChange = (newSortOrder: 'asc' | 'desc' | null) => {
    setContributionChartSortOrder(newSortOrder);
  };

  // Y-O-Y chart settings handlers
  const handleYoyChartTypeChange = (newType: 'bar_chart' | 'line_chart' | 'pie_chart' | 'area_chart' | 'scatter_chart') => {
    setYoyChartType(newType);
  };

  const handleYoyChartThemeChange = (newTheme: string) => {
    setYoyChartTheme(newTheme);
  };

  const handleYoyChartDataLabelsChange = (newShowDataLabels: boolean) => {
    setYoyChartDataLabels(newShowDataLabels);
  };

  const handleYoyChartSortOrderChange = (newSortOrder: 'asc' | 'desc' | null) => {
    setYoyChartSortOrder(newSortOrder);
  };

  // Predicted vs actual chart settings handlers
  const handlePredictedVsActualChartTypeChange = (newType: 'bar_chart' | 'line_chart' | 'pie_chart' | 'area_chart' | 'scatter_chart') => {
    setPredictedVsActualChartType(newType);
  };

  const handlePredictedVsActualChartThemeChange = (newTheme: string) => {
    setPredictedVsActualChartTheme(newTheme);
  };

  const handlePredictedVsActualChartDataLabelsChange = (newShowDataLabels: boolean) => {
    setPredictedVsActualChartDataLabels(newShowDataLabels);
  };

  const handlePredictedVsActualChartSortOrderChange = (newSortOrder: 'asc' | 'desc' | null) => {
    setPredictedVsActualChartSortOrder(newSortOrder);
  };

  // Method by model chart settings handlers
  const handleMethodByModelChartTypeChange = (newType: 'bar_chart' | 'line_chart' | 'pie_chart' | 'area_chart' | 'scatter_chart') => {
    setMethodByModelChartType(newType);
  };

  const handleMethodByModelChartThemeChange = (newTheme: string) => {
    setMethodByModelChartTheme(newTheme);
  };

  const handleMethodByModelChartDataLabelsChange = (newShowDataLabels: boolean) => {
    setMethodByModelChartDataLabels(newShowDataLabels);
  };

  const handleMethodByModelChartSortOrderChange = (newSortOrder: 'asc' | 'desc' | null) => {
    setMethodByModelChartSortOrder(newSortOrder);
  };

  // Helper function to transform data for method by model chart
  const transformMethodByModelData = () => {
    if (!data.elasticityData || data.elasticityData.length === 0 || !Array.isArray(data.selectedVariable)) {
      return [];
    }

    // Get the chart data (including ensemble if enabled)
    const chartData = (() => {
      if (data.ensembleMethod && data.weightedEnsembleData && data.weightedEnsembleData.length > 0) {
        const ensemble = data.weightedEnsembleData[0];
        const ensembleData = { name: 'Ensemble' };
        
        if (Array.isArray(data.selectedVariable)) {
          data.selectedVariable.forEach(variable => {
            let value = null;
            
            if (data.selectedMethod === 'elasticity') {
              value = ensemble.weighted_metrics[`${variable}_elasticity`] || 
                     ensemble.weighted_metrics[`Weighted_Elasticity_${variable}`] || 
                     ensemble.weighted_metrics[`Elasticity_${variable}`] ||
                     ensemble.weighted_metrics[variable];
            } else if (data.selectedMethod === 'beta') {
              value = ensemble.weighted_metrics[`${variable}_beta`] || 
                     ensemble.weighted_metrics[`Weighted_Beta_${variable}`] || 
                     ensemble.weighted_metrics[`Beta_${variable}`] ||
                     ensemble.weighted_metrics[variable];
            } else if (data.selectedMethod === 'average') {
              value = ensemble.weighted_metrics[`${variable}_avg`] || 
                     ensemble.weighted_metrics[`Weighted_Avg_${variable}`] || 
                     ensemble.weighted_metrics[`Avg_${variable}`] ||
                     ensemble.weighted_metrics[variable];
            }
            
            ensembleData[variable] = value;
          });
        }
        
        return [ensembleData, ...data.elasticityData];
      }
      return data.elasticityData;
    })();

    // Transform data for RechartsChartRenderer with legend support
    // Convert from wide format to long format for legend support
    const transformedData: any[] = [];
    
    chartData.forEach((model: any) => {
      data.selectedVariable.forEach((variable: string) => {
        transformedData.push({
          name: model.name, // X-axis (model name)
          variable: variable, // Legend field (variable name)
          value: model[variable] || 0 // Y-axis (value)
        });
      });
    });

    return transformedData;
  };

  // Initialize default method if not set
  useEffect(() => {
    if (!data.selectedMethod) {
      handleDataChange({ selectedMethod: 'elasticity' });
    }
  }, [data.selectedMethod]);

  // Sync with global store changes
  useEffect(() => {
    if (data.combinationStatus !== undefined) {
      setCombinationStatus(data.combinationStatus);
    }
  }, [data.combinationStatus]);

  useEffect(() => {
    if (data.combinationStatusMinimized !== undefined) {
      setCombinationStatusMinimized(data.combinationStatusMinimized);
    }
  }, [data.combinationStatusMinimized]);

  // Fetch combination status when dataset changes
  useEffect(() => {
    if (data.selectedDataset && atomId) {
      fetchCombinationStatus();
    }
  }, [data.selectedDataset, atomId]);

  // Fetch weighted ensemble data when filtered models change
  useEffect(() => {
    if (data.selectedDataset && data.selectedCombinationId && data.ensembleMethod && data.elasticityData) {
      fetchWeightedEnsembleData(data.selectedDataset, data.selectedCombinationId);
    }
  }, [data.elasticityData, data.selectedDataset, data.selectedCombinationId, data.ensembleMethod]);

  // Fetch cardinality data when dataset is selected
  useEffect(() => {
    if (data.selectedDataset) {
      fetchCardinalityData();
    }
  }, [data.selectedDataset]);

  // Function to fetch variables when combination ID changes
  const fetchVariablesForCombination = async (combinationId: string, fileKey: string) => {
    if (combinationId === 'all' || !fileKey) return;
    
    try {
      const envStr = localStorage.getItem('env');
      const env = envStr ? JSON.parse(envStr) : {};

      const baseUrl = `${SELECT_API}/models/variables`;
      const params = new URLSearchParams({
        file_key: fileKey,
        mode: 'base', // Get base predictor names without beta suffixes
        client_id: env.CLIENT_ID || '',
        app_id: env.APP_ID || '',
        project_id: env.PROJECT_ID || '',
        client_name: env.CLIENT_NAME || '',
        app_name: env.APP_NAME || '',
        project_name: env.PROJECT_NAME || ''
      });
      const url = `${baseUrl}?${params.toString()}`;
      

      const response = await fetch(url);
      
      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.detail || 'Failed to fetch variables');
      }
      
      const result = await response.json();
      
      if (result.variables && result.variables.length > 0) {
        handleDataChange({ 
          availableVariables: result.variables,
          selectedVariable: result.variables // Auto-select all variables by default
        });
      } else {
        throw new Error('No variables found for this combination');
      }
      
    } catch (error) {
      // Don't show error to user, just log it
    }
  };

  // Handle combination ID change
  const handleCombinationChange = (value: string) => {
    handleDataChange({ 
      selectedCombinationId: value,
      selectedModel: 'Select Model to View Model Performance',
      selectedModelPerformance: [],
      actualVsPredictedData: [],
      contributionData: [],
      yoyData: [],
      weightedEnsembleData: [],
      elasticityData: [], // Clear graph data
      modelFilters: {} // Clear filter data
    });
    
    // Fetch variables for the selected combination
    if (data.selectedDataset) {
      fetchVariablesForCombination(value, data.selectedDataset);
    }
  };

  // Handle variable selection (multi-select)
  const toggleVariable = (variable: string, checked: boolean) => {
    const currentSelectedVariables = Array.isArray(data.selectedVariable) ? data.selectedVariable : [];
    
    if (checked) {
      // Add variable if not already selected
      if (!currentSelectedVariables.includes(variable)) {
        handleDataChange({ 
          selectedVariable: [...currentSelectedVariables, variable]
        });
      }
    } else {
      // Remove variable if selected
      const newSelectedVariables = currentSelectedVariables.filter(v => v !== variable);
      handleDataChange({ 
        selectedVariable: newSelectedVariables
      });
    }
  };

  // Function to fetch available filters for a combination and variable
  const fetchAvailableFilters = async (variable: string, combinationId: string, fileKey: string) => {
    if (combinationId === 'all' || !fileKey) {
      return;
    }
    
    try {
      const envStr = localStorage.getItem('env');
      const env = envStr ? JSON.parse(envStr) : {};

      const baseUrl = `${SELECT_API}/models/filters`;
      const params = new URLSearchParams({
        file_key: fileKey,
        combination_id: combinationId,
        variable: variable,
        client_id: env.CLIENT_ID || '',
        app_id: env.APP_ID || '',
        project_id: env.PROJECT_ID || '',
        client_name: env.CLIENT_NAME || '',
        app_name: env.APP_NAME || '',
        project_name: env.PROJECT_NAME || ''
      });
      const url = `${baseUrl}?${params.toString()}`;
      
      const response = await fetch(url);
      
      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.detail || 'Failed to fetch available filters');
      }
      
      const result = await response.json();
      
      if (result.available_filters) {
        // Update the model filters with the fetched ranges
        const updatedFilters = { ...data.modelFilters };
        
        Object.keys(result.available_filters).forEach(filterKey => {
          const filterData = result.available_filters[filterKey];
          updatedFilters[filterKey] = {
            min: filterData.min,
            max: filterData.max,
            current_min: filterData.min,
            current_max: filterData.max
          };
        });
        
        handleDataChange({ modelFilters: updatedFilters });
      }
      
    } catch (error) {
    }
  };

  // Function to fetch elasticity data when variable changes
  const fetchElasticityData = async (variable: string, combinationId: string, fileKey: string) => {
    if (!variable || !fileKey) return;
    
    try {
      const envStr = localStorage.getItem('env');
      const env = envStr ? JSON.parse(envStr) : {};

      const baseUrl = `${SELECT_API}/models/filter`;
      const params = new URLSearchParams({
        file_key: fileKey,
        variable: variable,
        client_id: env.CLIENT_ID || '',
        app_id: env.APP_ID || '',
        project_id: env.PROJECT_ID || '',
        client_name: env.CLIENT_NAME || '',
        app_name: env.APP_NAME || '',
        project_name: env.PROJECT_NAME || ''
      });
      const url = `${baseUrl}?${params.toString()}`;
      

      const response = await fetch(url, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          file_key: fileKey,
          variable: variable,
          method: data.selectedMethod || 'elasticity',
          combination_id: combinationId,
          min_self_elasticity: null,
          max_self_elasticity: null,
          min_mape: null,
          max_mape: null,
          min_r2: null,
          max_r2: null,
          min_mape_train: null,
          max_mape_train: null,
          min_mape_test: null,
          max_mape_test: null,
          min_r2_train: null,
          max_r2_train: null,
          min_r2_test: null,
          max_r2_test: null,
          min_aic: null,
          max_aic: null,
          min_bic: null,
          max_bic: null
        })
      });
      
      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.detail || 'Failed to fetch elasticity data');
      }
      
      const result = await response.json();
      
      if (result && result.length > 0) {
        // Transform data for the vertical bar chart
        const chartData = result.map((item: any) => ({
          name: item.model_name || 'Unknown Model',
          value: item.self_elasticity || 0
        }));
        
        handleDataChange({ 
          elasticityData: chartData,
          selectedVariable: variable
        });
      } else {
        handleDataChange({ elasticityData: [] });
      }
      
    } catch (error) {
    }
  };

  // Function to fetch and display graph data
  const handleShowGraph = useCallback(async () => {

    
          if (!Array.isArray(data.selectedVariable) || data.selectedVariable.length === 0 || !data.selectedMethod || !data.selectedCombinationId || !data.selectedDataset) {
        return;
      }

    try {
      const allModelData: { [modelName: string]: { [variable: string]: number } } = {};
      
      // Fetch overall filters for the combination (not per variable)
      await fetchOverallFilters(data.selectedCombinationId, data.selectedDataset);
      
      // For each selected variable, fetch data with the format 'variablename_methodname'
      for (const variable of data.selectedVariable) {
        const columnName = `${variable}_${data.selectedMethod}`;
        
        // Fetch elasticity data and collect it directly
        const elasticityData = await fetchElasticityDataDirect(variable, data.selectedCombinationId, data.selectedDataset);
        
        // Collect data for multi-variable chart
        if (elasticityData && elasticityData.length > 0) {
          elasticityData.forEach((modelData: any) => {
            if (!allModelData[modelData.name]) {
              allModelData[modelData.name] = {};
            }
            allModelData[modelData.name][variable] = modelData.value;
          });
        }
      }
      
      // Transform data for multi-variable chart
      const chartData = Object.keys(allModelData).map(modelName => ({
        name: modelName,
        ...allModelData[modelName]
      }));
      

      handleDataChange({ 
        elasticityData: chartData,
        selectedMethod: data.selectedMethod
      });
      
    } catch (error) {
    }
  }, [data.selectedVariable, data.selectedMethod, data.selectedCombinationId, data.selectedDataset]);

  // Auto-update graph when inputs change (but not when filters change)
  // Uses refs to track previous values and only triggers when specific inputs change
  useEffect(() => {
    // Check if we have all required inputs
    const hasRequiredInputs = Array.isArray(data.selectedVariable) && 
        data.selectedVariable.length > 0 && 
        data.selectedMethod && 
        data.selectedCombinationId && 
        data.selectedDataset;
    
    if (!hasRequiredInputs) {
      return;
    }
    

    
    // Check if the specific inputs have actually changed
    const variableChanged = JSON.stringify(prevSelectedVariable.current) !== JSON.stringify(data.selectedVariable);
    const methodChanged = prevSelectedMethod.current !== data.selectedMethod;
    const combinationChanged = prevSelectedCombinationId.current !== data.selectedCombinationId;
    
    // Trigger if something changed OR if this is the first time we have all inputs (initial load)
    const isInitialLoad = prevSelectedVariable.current === null && 
                         prevSelectedMethod.current === null && 
                         prevSelectedCombinationId.current === null;
    
    // Don't trigger if we're currently updating with filtered data
    if ((variableChanged || methodChanged || combinationChanged || isInitialLoad) && !isUpdatingWithFilters.current) {
      handleShowGraph();
      
      // Update refs with current values
      prevSelectedVariable.current = data.selectedVariable;
      prevSelectedMethod.current = data.selectedMethod;
      prevSelectedCombinationId.current = data.selectedCombinationId;
    }
  }, [data.selectedVariable, data.selectedMethod, data.selectedCombinationId, handleShowGraph]);

  // Function to fetch overall filters for the combination
  const fetchOverallFilters = async (combinationId: string, fileKey: string) => {
    if (combinationId === 'all' || !fileKey || !Array.isArray(data.selectedVariable) || data.selectedVariable.length === 0) {
      return;
    }
    
    try {
      // Use the first selected variable to get filter ranges as representative
      const firstVariable = data.selectedVariable[0];
      
      const envStr = localStorage.getItem('env');
      const env = envStr ? JSON.parse(envStr) : {};

      const baseUrl = `${SELECT_API}/models/filters`;
      const params = new URLSearchParams({
        file_key: fileKey,
        combination_id: combinationId,
        variable: firstVariable, // Use single variable parameter as API expects
        client_id: env.CLIENT_ID || '',
        app_id: env.APP_ID || '',
        project_id: env.PROJECT_ID || '',
        client_name: env.CLIENT_NAME || '',
        app_name: env.APP_NAME || '',
        project_name: env.PROJECT_NAME || ''
      });
      const url = `${baseUrl}?${params.toString()}`;
      
      const response = await fetch(url);
      
      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.detail || 'Failed to fetch overall filters');
      }
      
      const result = await response.json();
      
      if (result.available_filters) {
        // Update the model filters with the fetched ranges
        const updatedFilters = { ...data.modelFilters };
        
        Object.keys(result.available_filters).forEach(filterKey => {
          const filterData = result.available_filters[filterKey];
          updatedFilters[filterKey] = {
            min: filterData.min,
            max: filterData.max,
            current_min: filterData.min,
            current_max: filterData.max
          };
        });
        
        // Calculate ranges for each selected variable from the backend
        if (data.selectedMethod && Array.isArray(data.selectedVariable) && data.selectedVariable.length > 0) {
          try {
            const envStr = localStorage.getItem('env');
            const env = envStr ? JSON.parse(envStr) : {};

            const baseUrl = `${SELECT_API}/models/variable-ranges`;
            const params = new URLSearchParams({
              file_key: fileKey,
              combination_id: combinationId,
              variables: data.selectedVariable.join(','),
              method: data.selectedMethod,
              client_id: env.CLIENT_ID || '',
              app_id: env.APP_ID || '',
              project_id: env.PROJECT_ID || '',
              client_name: env.CLIENT_NAME || '',
              app_name: env.APP_NAME || '',
              project_name: env.PROJECT_NAME || ''
            });
            const url = `${baseUrl}?${params.toString()}`;
            
            const response = await fetch(url);
            
            if (response.ok) {
              const result = await response.json();
              
              if (result.variable_ranges) {
                Object.keys(result.variable_ranges).forEach(variable => {
                  const rangeData = result.variable_ranges[variable];
                  const variableFilterKey = `variable_${variable}`;
                  updatedFilters[variableFilterKey] = {
                    min: rangeData.min,
                    max: rangeData.max,
                    current_min: rangeData.current_min,
                    current_max: rangeData.current_max
                  };
                });
              }
            }
          } catch (error) {
          }
        }
        
        handleDataChange({ modelFilters: updatedFilters });
      }
      
    } catch (error) {
    }
  };

  // Direct fetch function that returns the data instead of updating store
  const fetchElasticityDataDirect = async (variable: string, combinationId: string, fileKey: string) => {
    if (!variable || !fileKey) return [];
    
    try {
      const envStr = localStorage.getItem('env');
      const env = envStr ? JSON.parse(envStr) : {};

              const baseUrl = `${SELECT_API}/models/filter`;
      const params = new URLSearchParams({
        file_key: fileKey,
        variable: variable,
        client_id: env.CLIENT_ID || '',
        app_id: env.APP_ID || '',
        project_id: env.PROJECT_ID || '',
        client_name: env.CLIENT_NAME || '',
        app_name: env.APP_NAME || '',
        project_name: env.PROJECT_NAME || ''
      });
      const url = `${baseUrl}?${params.toString()}`;
      

      const response = await fetch(url, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          file_key: fileKey,
          variable: variable,
          method: data.selectedMethod || 'elasticity',
          combination_id: combinationId,
          min_self_elasticity: null,
          max_self_elasticity: null,
          min_mape: null,
          max_mape: null,
          min_r2: null,
          max_r2: null,
          min_mape_train: null,
          max_mape_train: null,
          min_mape_test: null,
          max_mape_test: null,
          min_r2_train: null,
          max_r2_train: null,
          min_r2_test: null,
          max_r2_test: null,
          min_aic: null,
          max_aic: null,
          min_bic: null,
          max_bic: null
        })
      });
      
      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.detail || 'Failed to fetch elasticity data');
      }
      
      const result = await response.json();
      
              if (result && result.length > 0) {
          // Transform data for the vertical bar chart based on selected method
          const chartData = result.map((item: any) => {
            let value = 0;
            
            // Get the correct column value based on selected method
            // Handle special case for "average" method which uses "avg" in field names
            const methodSuffix = data.selectedMethod === 'average' ? 'avg' : data.selectedMethod;
            const columnName = `self_${methodSuffix}`;
            value = item[columnName] || 0;
          
          return {
            name: item.model_name || 'Unknown Model',
            value: value
          };
        });
        
        return chartData;
      } else {
        return [];
      }
      
    } catch (error) {
      return [];
    }
  };

  // Handle variable change (for backward compatibility)
  const handleVariableChange = (value: string) => {
    handleDataChange({ selectedVariable: [value] });
    
    // Fetch filters and elasticity data for the selected variable
    if (data.selectedDataset && data.selectedCombinationId && value !== 'no-variables') {
      fetchAvailableFilters(value, data.selectedCombinationId, data.selectedDataset);
      fetchElasticityData(value, data.selectedCombinationId, data.selectedDataset);
    }
  };

  const performanceData = [
    { name: 'Model A', value: 85 },
    { name: 'Model B', value: 78 },
    { name: 'Model C', value: 92 }
  ];

  const predictedVsActual = [
    { actual: 10, predicted: 12 },
    { actual: 20, predicted: 18 },
    { actual: 15, predicted: 16 },
    { actual: 25, predicted: 24 },
    { actual: 30, predicted: 28 }
  ];

  const contributionData = [
    { name: 'Feature A', value: 35 },
    { name: 'Feature B', value: 25 },
    { name: 'Feature C', value: 20 },
    { name: 'Feature D', value: 20 }
  ];

  const yoyGrowthData = data.yoyData && data.yoyData.length > 0 ? data.yoyData : [
    { name: 'Q1', value: 12 },
    { name: 'Q2', value: -8 },
    { name: 'Q3', value: 15 },
    { name: 'Q4', value: 6 }
  ];

  // Debounce function to prevent too many API calls
  const [filterTimeout, setFilterTimeout] = useState<ReturnType<typeof setTimeout> | null>(null);
  const [isSaving, setIsSaving] = useState(false);

  const handleFilterChange = (filterType: string, value: number[]) => {
    const updatedFilters = { ...data.modelFilters };
    
    if (filterType.includes('_range')) {
      const baseFilter = filterType.replace('_range', '');
      updatedFilters[baseFilter] = {
        ...updatedFilters[baseFilter],
        current_min: value[0],
        current_max: value[1]
      };
    } else if (filterType.includes('_min')) {
      const baseFilter = filterType.replace('_min', '');
      updatedFilters[baseFilter] = {
        ...updatedFilters[baseFilter],
        current_min: value[0]
      };
    } else if (filterType.includes('_max')) {
      const baseFilter = filterType.replace('_max', '');
      updatedFilters[baseFilter] = {
        ...updatedFilters[baseFilter],
        current_max: value[0]
      };
    }
    
    // Set flag BEFORE updating store to prevent auto-update
    isUpdatingWithFilters.current = true;
    
    // Update filters in store immediately for UI responsiveness
    handleDataChange({ modelFilters: updatedFilters });
    
    // Clear existing timeout
    if (filterTimeout) {
      clearTimeout(filterTimeout);
    }
    
    // Set new timeout to debounce the API call
    const newTimeout = setTimeout(async () => {
      // Update graph with new filters for all selected variables
      if (data.selectedDataset && data.selectedCombinationId && Array.isArray(data.selectedVariable) && data.selectedVariable.length > 0) {
        await updateGraphWithFilters(updatedFilters);
      }
    }, 300); // 300ms delay for responsive filtering
    
    setFilterTimeout(newTimeout);
  };

  // Handle per-variable filter changes
  const handleVariableFilterChange = (variable: string, filterType: string, value: number[]) => {
    const updatedFilters = { ...data.modelFilters };
    const variableFilterKey = `variable_${variable}`;
    
    if (filterType === 'range') {
      updatedFilters[variableFilterKey] = {
        ...updatedFilters[variableFilterKey],
        current_min: value[0],
        current_max: value[1]
      };
    }
    
    // Set flag BEFORE updating store to prevent auto-update
    isUpdatingWithFilters.current = true;
    
    // Update filters in store immediately for UI responsiveness
    handleDataChange({ modelFilters: updatedFilters });
    
    // Clear existing timeout
    if (filterTimeout) {
      clearTimeout(filterTimeout);
    }
    
    // Set new timeout to debounce the API call
    const newTimeout = setTimeout(async () => {
      // Update graph with new filters for all selected variables
      if (data.selectedDataset && data.selectedCombinationId && Array.isArray(data.selectedVariable) && data.selectedVariable.length > 0) {
        await updateGraphWithVariableFilters(updatedFilters);
      }
    }, 300); // 300ms delay for responsive filtering
    
    setFilterTimeout(newTimeout);
  };

  // Function to update graph with filters for all selected variables
  const updateGraphWithFilters = async (filters: any) => {
    if (!Array.isArray(data.selectedVariable) || data.selectedVariable.length === 0 || !data.selectedMethod || !data.selectedCombinationId || !data.selectedDataset) {
      return;
    }

    // Flag is already set in handleFilterChange

    try {
      const allModelData: { [modelName: string]: { [variable: string]: number } } = {};
      
      // For each selected variable, fetch filtered data with ALL filters (both model stats and variable filters)
      for (const variable of data.selectedVariable) {
        const elasticityData = await fetchElasticityDataWithVariableFiltersDirect(variable, data.selectedCombinationId, data.selectedDataset, filters);
        
        // Collect data for multi-variable chart
        if (elasticityData && elasticityData.length > 0) {
          elasticityData.forEach((modelData: any) => {
            if (!allModelData[modelData.name]) {
              allModelData[modelData.name] = {};
            }
            allModelData[modelData.name][variable] = modelData.value;
          });
        }
      }
      
      // Transform data for multi-variable chart
      const chartData = Object.keys(allModelData).map(modelName => ({
        name: modelName,
        ...allModelData[modelName]
      }));
      
    handleDataChange({
        elasticityData: chartData,
        selectedMethod: data.selectedMethod
      });
      
    } catch (error) {
    } finally {
      // Reset flag after update is complete
      isUpdatingWithFilters.current = false;
    }
  };

  // Function to update graph with per-variable filters
  const updateGraphWithVariableFilters = async (filters: any) => {
    if (!Array.isArray(data.selectedVariable) || data.selectedVariable.length === 0 || !data.selectedMethod || !data.selectedCombinationId || !data.selectedDataset) {
      return;
    }

    // Flag is already set in handleVariableFilterChange

    try {
      const allModelData: { [modelName: string]: { [variable: string]: number } } = {};
      
      // For each selected variable, fetch filtered data with per-variable filters
      for (const variable of data.selectedVariable) {
        const elasticityData = await fetchElasticityDataWithVariableFiltersDirect(variable, data.selectedCombinationId, data.selectedDataset, filters);
        
        // Collect data for multi-variable chart
        if (elasticityData && elasticityData.length > 0) {
          elasticityData.forEach((modelData: any) => {
            if (!allModelData[modelData.name]) {
              allModelData[modelData.name] = {};
            }
            allModelData[modelData.name][variable] = modelData.value;
          });
        }
      }
      
      // Transform data for multi-variable chart
      const chartData = Object.keys(allModelData).map(modelName => ({
        name: modelName,
        ...allModelData[modelName]
      }));
      
    handleDataChange({
        elasticityData: chartData,
        selectedMethod: data.selectedMethod
      });
      
    } catch (error) {
    } finally {
      // Reset flag after update is complete
      isUpdatingWithFilters.current = false;
    }
  };

  // Direct fetch function with filters that returns the data
  const fetchElasticityDataWithFiltersDirect = async (variable: string, combinationId: string, fileKey: string, filters: any) => {
    if (!variable || !fileKey) return [];
    
    try {
      const envStr = localStorage.getItem('env');
      const env = envStr ? JSON.parse(envStr) : {};

      const baseUrl = `${SELECT_API}/models/filter-filtered`;
      const params = new URLSearchParams({
        file_key: fileKey,
        variable: variable,
        client_id: env.CLIENT_ID || '',
        app_id: env.APP_ID || '',
        project_id: env.PROJECT_ID || '',
        client_name: env.CLIENT_NAME || '',
        app_name: env.APP_NAME || '',
        project_name: env.PROJECT_NAME || ''
      });
      const url = `${baseUrl}?${params.toString()}`;
      
      // Prepare filter values for the request body
      const filterBody = {
        file_key: fileKey,
        variable: variable,
        method: data.selectedMethod || 'elasticity',
        combination_id: combinationId,
        min_self_elasticity: filters.self_elasticity?.current_min || null,
        max_self_elasticity: filters.self_elasticity?.current_max || null,
        min_mape: filters.mape?.current_min || null,
        max_mape: filters.mape?.current_max || null,
        min_r2: filters.r2?.current_min || null,
        max_r2: filters.r2?.current_max || null,
        min_mape_train: filters.mape_train?.current_min || null,
        max_mape_train: filters.mape_train?.current_max || null,
        min_mape_test: filters.mape_test?.current_min || null,
        max_mape_test: filters.mape_test?.current_max || null,
        min_r2_train: filters.r2_train?.current_min || null,
        max_r2_train: filters.r2_train?.current_max || null,
        min_r2_test: filters.r2_test?.current_min || null,
        max_r2_test: filters.r2_test?.current_max || null,
        min_aic: filters.aic?.current_min || null,
        max_aic: filters.aic?.current_max || null,
        min_bic: filters.bic?.current_min || null,
        max_bic: filters.bic?.current_max || null
      };

      const response = await fetch(url, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(filterBody)
      });
      
      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.detail || 'Failed to fetch filtered elasticity data');
      }
      
      const result = await response.json();
      
      if (result && result.length > 0) {
        // Transform data for the vertical bar chart based on selected method
        const chartData = result.map((item: any) => {
          let value = 0;
          
          // Get the correct column value based on selected method
          // Handle special case for "average" method which uses "avg" in field names
          const methodSuffix = data.selectedMethod === 'average' ? 'avg' : data.selectedMethod;
          const columnName = `self_${methodSuffix}`;
          value = item[columnName] || 0;
          
          return {
            name: item.model_name || 'Unknown Model',
            value: value
          };
        });
        
        return chartData;
      } else {
        return [];
      }
      
    } catch (error) {
      return [];
    }
  };

  // Direct fetch function with per-variable filters that returns the data
  const fetchElasticityDataWithVariableFiltersDirect = async (variable: string, combinationId: string, fileKey: string, filters: any) => {
    if (!variable || !fileKey) return [];
    
    try {
      const envStr = localStorage.getItem('env');
      const env = envStr ? JSON.parse(envStr) : {};

      const baseUrl = `${SELECT_API}/models/filter-filtered`;
      const params = new URLSearchParams({
        file_key: fileKey,
        variable: variable,
        client_id: env.CLIENT_ID || '',
        app_id: env.APP_ID || '',
        project_id: env.PROJECT_ID || '',
        client_name: env.CLIENT_NAME || '',
        app_name: env.APP_NAME || '',
        project_name: env.PROJECT_NAME || ''
      });
      const url = `${baseUrl}?${params.toString()}`;
      
      // Prepare per-variable filter values for the request body
      const variableFilters: { [key: string]: { min: number | null, max: number | null } } = {};
      
      // Extract per-variable filters - only include filters for variables other than the current one
      // since the current variable is already filtered by the main variable parameter
      Object.keys(filters).forEach(filterKey => {
        if (filterKey.startsWith('variable_')) {
          const variableName = filterKey.replace('variable_', '');
          const filter = filters[filterKey];
          if (filter && (filter.current_min !== undefined || filter.current_max !== undefined)) {
            variableFilters[variableName] = {
              min: filter.current_min !== undefined ? filter.current_min : null,
              max: filter.current_max !== undefined ? filter.current_max : null
            };
          }
        }
      });
      
             const filterBody = {
         file_key: fileKey,
         variable: variable,
         method: data.selectedMethod || 'elasticity',
         combination_id: combinationId,
         min_self_elasticity: filters.self_elasticity?.current_min || null,
         max_self_elasticity: filters.self_elasticity?.current_max || null,
         min_mape: filters.mape?.current_min || null,
         max_mape: filters.mape?.current_max || null,
         min_r2: filters.r2?.current_min || null,
         max_r2: filters.r2?.current_max || null,
         min_mape_train: filters.mape_train?.current_min || null,
         max_mape_train: filters.mape_train?.current_max || null,
         min_mape_test: filters.mape_test?.current_min || null,
         max_mape_test: filters.mape_test?.current_max || null,
         min_r2_train: filters.r2_train?.current_min || null,
         max_r2_train: filters.r2_train?.current_max || null,
         min_r2_test: filters.r2_test?.current_min || null,
         max_r2_test: filters.r2_test?.current_max || null,
         min_aic: filters.aic?.current_min || null,
         max_aic: filters.aic?.current_max || null,
         min_bic: filters.bic?.current_min || null,
         max_bic: filters.bic?.current_max || null,
         variable_filters: Object.keys(variableFilters).length > 0 ? variableFilters : null
       };

      const response = await fetch(url, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(filterBody)
      });
      
      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.detail || 'Failed to fetch variable filtered elasticity data');
      }
      
      const result = await response.json();
      
      if (result && result.length > 0) {
        // Transform data for the vertical bar chart based on selected method
        const chartData = result.map((item: any) => {
          let value = 0;
          
          // Get the correct column value based on selected method
          // Handle special case for "average" method which uses "avg" in field names
          const methodSuffix = data.selectedMethod === 'average' ? 'avg' : data.selectedMethod;
          const columnName = `self_${methodSuffix}`;
          value = item[columnName] || 0;
          
          return {
            name: item.model_name || 'Unknown Model',
            value: value
          };
        });
        
        return chartData;
      } else {
        return [];
      }
      
    } catch (error) {
      return [];
    }
  };

  // Function to fetch combination status
  const fetchCombinationStatus = async () => {
    if (!data.selectedDataset || !atomId) {
      return;
    }

    setIsLoadingCombinationStatus(true);
    
    try {
      const envStr = localStorage.getItem('env');
      const env = envStr ? JSON.parse(envStr) : {};

      const baseUrl = `${SELECT_API}/models/saved-combinations-status`;
      const params = new URLSearchParams({
        file_key: data.selectedDataset,
        atom_id: atomId,
        client_id: env.CLIENT_ID || '',
        app_id: env.APP_ID || '',
        project_id: env.PROJECT_ID || '',
        client_name: env.CLIENT_NAME || '',
        app_name: env.APP_NAME || '',
        project_name: env.PROJECT_NAME || ''
      });
      const url = `${baseUrl}?${params.toString()}`;
      
      const response = await fetch(url);
      
      if (!response.ok) {
        throw new Error(`Failed to fetch combination status: ${response.statusText}`);
      }

      const result = await response.json();
      setCombinationStatus(result);
      
      // Save to global store
      handleDataChange({ combinationStatus: result });
      
    } catch (error) {
      setCombinationStatus(null);
    } finally {
      setIsLoadingCombinationStatus(false);
    }
  };

  // Function to save selected model
  const handleSaveModel = async () => {
    if (!data.selectedModel || data.selectedModel === 'Select Model to View Model Performance' || !data.selectedDataset) {
      return;
    }



    setIsSaving(true);
    
    try {
      const envStr = localStorage.getItem('env');
      const env = envStr ? JSON.parse(envStr) : {};

      const baseUrl = `${SELECT_API}/models/select-save-generic`;
      
      const saveRequest = {
        file_key: data.selectedDataset,
        filter_criteria: {
          model_name: data.selectedModel,
          combination_id: data.selectedCombinationId
        },
        model_name: data.selectedModel,
        tags: [`select-models-feature-${atomId}`, 'saved-model'],
        description: `Model saved from Select Models Feature atom - ${data.selectedModel} (${data.selectedCombinationId})`,
        client_name: env.CLIENT_NAME || '',
        app_name: env.APP_NAME || '',
        project_name: env.PROJECT_NAME || ''
      };

      const response = await fetch(baseUrl, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(saveRequest)
      });

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.detail || 'Failed to save model');
      }

      const result = await response.json();
      
      // Show success message
      toast({
        title: "Model Saved Successfully",
        description: `Model "${data.selectedModel}" has been saved.`,
        variant: "default"
      });
      
      // Refresh combination status after saving
      await fetchCombinationStatus();
      
    } catch (error) {
      // Show error message
      toast({
        title: "Error Saving Model",
        description: error instanceof Error ? error.message : "Failed to save model",
        variant: "destructive"
      });
    } finally {
      setIsSaving(false);
    }
  };

  // Function to fetch model contribution data
  const fetchModelContribution = async (modelName: string, combinationId: string, fileKey: string) => {
    if (!modelName || combinationId === 'all' || !fileKey) {
      return;
    }
    
    try {
      const envStr = localStorage.getItem('env');
      const env = envStr ? JSON.parse(envStr) : {};

      const baseUrl = `${SELECT_API}/models/contribution`;
      const params = new URLSearchParams({
        file_key: fileKey,
        combination_id: combinationId,
        model_name: modelName,
        client_id: env.CLIENT_ID || '',
        app_id: env.APP_ID || '',
        project_id: env.PROJECT_ID || '',
        client_name: env.CLIENT_NAME || '',
        app_name: env.APP_NAME || '',
        project_name: env.PROJECT_NAME || ''
      });
      const url = `${baseUrl}?${params.toString()}`;
      
      const response = await fetch(url);
      
      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.detail || 'Failed to fetch model contribution data');
      }
      
      const result = await response.json();
      
      if (result && result.contribution_data) {
    handleDataChange({
          contributionData: result.contribution_data
        });
      }
      
    } catch (error) {
    }
  };

  // Function to fetch model performance metrics
  const fetchModelPerformance = async (modelName: string, combinationId: string, fileKey: string) => {
    if (!modelName || combinationId === 'all' || !fileKey) {
      return;
    }
    
    try {
      const envStr = localStorage.getItem('env');
      const env = envStr ? JSON.parse(envStr) : {};

      const baseUrl = `${SELECT_API}/models/performance`;
      const params = new URLSearchParams({
        file_key: fileKey,
        combination_id: combinationId,
        model_name: modelName,
        client_id: env.CLIENT_ID || '',
        app_id: env.APP_ID || '',
        project_id: env.PROJECT_ID || '',
        client_name: env.CLIENT_NAME || '',
        app_name: env.APP_NAME || '',
        project_name: env.PROJECT_NAME || ''
      });
      const url = `${baseUrl}?${params.toString()}`;
      
      const response = await fetch(url);
      
      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.detail || 'Failed to fetch model performance data');
      }
      
      const result = await response.json();
      
      if (result && result.performance_metrics) {
        // Extract performance metrics from the dedicated endpoint
        const performanceMetrics = [
          { name: 'MAPE Train', value: result.performance_metrics.mape_train || 0 },
          { name: 'MAPE Test', value: result.performance_metrics.mape_test || 0 },
          { name: 'R² Train', value: result.performance_metrics.r2_train || 0 },
          { name: 'R² Test', value: result.performance_metrics.r2_test || 0 },
          { name: 'AIC', value: result.performance_metrics.aic || 0 },
          { name: 'BIC', value: result.performance_metrics.bic || 0 }
        ];
        
        handleDataChange({
          selectedModelPerformance: performanceMetrics,
          selectedModel: modelName
        });
      }
      
    } catch (error) {
    }
  };

  // Function to fetch actual vs predicted data
  const fetchActualVsPredicted = async (modelName: string, combinationId: string) => {
    if (!modelName || combinationId === 'all') {
      return;
    }
    
    try {
      const envStr = localStorage.getItem('env');
      const env = envStr ? JSON.parse(envStr) : {};

      const baseUrl = `${SELECT_API}/actual-vs-predicted`;
      const params = new URLSearchParams({
        client_name: env.CLIENT_NAME || '',
        app_name: env.APP_NAME || '',
        project_name: env.PROJECT_NAME || '',
        combination_name: combinationId,
        model_name: modelName
      });
      const url = `${baseUrl}?${params.toString()}`;
      
      const response = await fetch(url, {
        method: 'POST'
      });
      
      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.detail || 'Failed to fetch actual vs predicted data');
      }
      
      const result = await response.json();
      
      if (result && result.success && result.actual_values && result.predicted_values) {
        
        // Check for extreme values
        const maxActual = Math.max(...result.actual_values);
        const minActual = Math.min(...result.actual_values);
        const maxPredicted = Math.max(...result.predicted_values);
        const minPredicted = Math.min(...result.predicted_values);
        
        
        // Find extreme outliers that might be causing axis scaling issues
        const sortedPredicted = [...result.predicted_values].sort((a, b) => b - a);
        const sortedActual = [...result.actual_values].sort((a, b) => b - a);
        
        
        // Check for any values that are extremely large (beyond reasonable range)
        const extremePredicted = result.predicted_values.filter(val => Math.abs(val) > 10000);
        const extremeActual = result.actual_values.filter(val => Math.abs(val) > 10000);
        
        
        // Check for NaN, Infinity, or other problematic values
        const nanPredicted = result.predicted_values.filter(val => isNaN(val) || !isFinite(val));
        const nanActual = result.actual_values.filter(val => isNaN(val) || !isFinite(val));
        
        
        // Check for any values that are suspiciously large (even if not extreme)
        const suspiciousPredicted = result.predicted_values.filter(val => Math.abs(val) > 1000);
        const suspiciousActual = result.actual_values.filter(val => Math.abs(val) > 1000);
        
        
        // Convert arrays to scatter chart format
        const actualVsPredictedData = result.actual_values.map((actual: number, index: number) => ({
          actual: actual,
          predicted: result.predicted_values[index] || 0
        })).sort((a, b) => a.actual - b.actual); // Sort by actual values (low to high)
        
        
        // Use all data points without filtering extreme outliers
        const chartData = actualVsPredictedData;
        
        handleDataChange({
          actualVsPredictedData: chartData,  // Use all data points
          actualVsPredictedMetrics: result.performance_metrics
        });
        
        // Calculate dynamic domain ranges based on all data
        const actualMin = Math.min(...chartData.map(d => d.actual));
        const actualMax = Math.max(...chartData.map(d => d.actual));
        const predictedMin = Math.min(...chartData.map(d => d.predicted));
        const predictedMax = Math.max(...chartData.map(d => d.predicted));
        
        // Add 10% padding to the ranges for better visualization
        const actualPadding = (actualMax - actualMin) * 0.1;
        const predictedPadding = (predictedMax - predictedMin) * 0.1;
        
        const xDomain = [Math.max(0, actualMin - actualPadding), actualMax + actualPadding];
        const yDomain = [Math.max(0, predictedMin - predictedPadding), predictedMax + predictedPadding];
        
        
        // Update domains in state
        handleDataChange({
          scatterChartDomains: { x: xDomain, y: yDomain }
        });
      }
      
    } catch (error) {
    }
  };

  // Function to fetch YoY data
  const fetchYoYData = async (modelName: string, combinationId: string) => {
    if (!modelName || combinationId === 'all') {
      return;
    }
    
    try {
      const envStr = localStorage.getItem('env');
      const env = envStr ? JSON.parse(envStr) : {};

      const baseUrl = `${SELECT_API}/yoy-calculation`;
      const params = new URLSearchParams({
        client_name: env.CLIENT_NAME || '',
        app_name: env.APP_NAME || '',
        project_name: env.PROJECT_NAME || '',
        combination_name: combinationId,
        model_name: modelName
      });
      const url = `${baseUrl}?${params.toString()}`;
      
      const response = await fetch(url, {
        method: 'POST'
      });
      
      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.detail || 'Failed to fetch YoY data');
      }
      
      const result = await response.json();
      
      if (result && result.success && result.waterfall && result.waterfall.labels && result.waterfall.values) {
        
        // Transform waterfall data for the bar chart
        const chartData = result.waterfall.labels.map((label: string, index: number) => ({
          name: label,
          value: result.waterfall.values[index] || 0
        }));
        
        handleDataChange({ yoyData: chartData });
      } else {
        handleDataChange({ yoyData: [] });
      }
      
    } catch (error) {
      handleDataChange({ yoyData: [] });
    }
  };

  // Function to fetch actual vs predicted data for ensemble
  const fetchActualVsPredictedEnsemble = async (combinationId: string) => {
    if (!data.selectedDataset || combinationId === 'all' || !data.weightedEnsembleData || data.weightedEnsembleData.length === 0) {
      return;
    }
    
    try {
      const ensemble = data.weightedEnsembleData[0];
      const envStr = localStorage.getItem('env');
      const env = envStr ? JSON.parse(envStr) : {};

      // Use the ensemble-specific endpoint
      const baseUrl = `${SELECT_API}/models/actual-vs-predicted-ensemble`;
      const params = new URLSearchParams({
        file_key: data.selectedDataset,
        combination_id: combinationId,
        client_id: env.CLIENT_ID || '',
        app_id: env.APP_ID || '',
        project_id: env.PROJECT_ID || '',
        client_name: env.CLIENT_NAME || '',
        app_name: env.APP_NAME || '',
        project_name: env.PROJECT_NAME || ''
      });
      const url = `${baseUrl}?${params.toString()}`;
      
      const response = await fetch(url);
      
      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.detail || 'Failed to fetch actual vs predicted data');
      }
      
      const result = await response.json();
      
      // Transform the data to match the expected format
      if (result.actual_values && result.predicted_values && Array.isArray(result.actual_values)) {
        const actualVsPredictedData = result.actual_values.map((actual: number, index: number) => ({
          actual: actual,
          predicted: result.predicted_values[index] || 0
        })).sort((a, b) => a.actual - b.actual); // Sort by actual values (low to high)
        
        
        handleDataChange({
          actualVsPredictedData: actualVsPredictedData,
          actualVsPredictedMetrics: result.performance_metrics
        });
        
        // Calculate dynamic domain ranges based on all data
        const actualMin = Math.min(...actualVsPredictedData.map(d => d.actual));
        const actualMax = Math.max(...actualVsPredictedData.map(d => d.actual));
        const predictedMin = Math.min(...actualVsPredictedData.map(d => d.predicted));
        const predictedMax = Math.max(...actualVsPredictedData.map(d => d.predicted));
        
        // Add 10% padding to the ranges for better visualization
        const actualPadding = (actualMax - actualMin) * 0.1;
        const predictedPadding = (predictedMax - predictedMin) * 0.1;
        
        const xDomain = [Math.max(0, actualMin - actualPadding), actualMax + actualPadding];
        const yDomain = [Math.max(0, predictedMin - predictedPadding), predictedMax + predictedPadding];
        
        
        // Update domains in state
        handleDataChange({
          scatterChartDomains: { x: xDomain, y: yDomain }
        });
      }
      
    } catch (error) {
      handleDataChange({ actualVsPredictedData: [] });
    }
  };

  // Function to fetch contribution data for ensemble
  const fetchModelContributionEnsemble = async (combinationId: string, fileKey: string) => {
    if (!fileKey || combinationId === 'all') {
      return;
    }
    
    try {
      const envStr = localStorage.getItem('env');
      const env = envStr ? JSON.parse(envStr) : {};

      // Use the ensemble-specific endpoint
      const baseUrl = `${SELECT_API}/models/contribution-ensemble`;
      const params = new URLSearchParams({
        file_key: fileKey,
        combination_id: combinationId,
        client_id: env.CLIENT_ID || '',
        app_id: env.APP_ID || '',
        project_id: env.PROJECT_ID || '',
        client_name: env.CLIENT_NAME || '',
        app_name: env.APP_NAME || '',
        project_name: env.PROJECT_NAME || ''
      });
      const url = `${baseUrl}?${params.toString()}`;
      
      const response = await fetch(url);
      
      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.detail || 'Failed to fetch ensemble contribution data');
      }
      
      const result = await response.json();
      
      // Transform the data to match the expected format for pie chart
      if (result.contribution_data && Array.isArray(result.contribution_data)) {
        const transformedData = result.contribution_data.map((item: any) => ({
          name: item.name,
          value: item.value
        }));
        
        handleDataChange({ contributionData: transformedData });
      } else {
        handleDataChange({ contributionData: [] });
      }
      
    } catch (error) {
      handleDataChange({ contributionData: [] });
    }
  };

  // Function to fetch YoY data for ensemble
  const fetchYoYDataEnsemble = async (combinationId: string) => {
    if (!data.selectedDataset || combinationId === 'all' || !data.weightedEnsembleData || data.weightedEnsembleData.length === 0) {
      return;
    }
    
    try {
      const ensemble = data.weightedEnsembleData[0];
      const envStr = localStorage.getItem('env');
      const env = envStr ? JSON.parse(envStr) : {};

      // Use the ensemble-specific endpoint
      const baseUrl = `${SELECT_API}/models/yoy-calculation-ensemble`;
      const params = new URLSearchParams({
        file_key: data.selectedDataset,
        combination_id: combinationId,
        client_id: env.CLIENT_ID || '',
        app_id: env.APP_ID || '',
        project_id: env.PROJECT_ID || '',
        client_name: env.CLIENT_NAME || '',
        app_name: env.APP_NAME || '',
        project_name: env.PROJECT_NAME || ''
      });
      const url = `${baseUrl}?${params.toString()}`;
      
      const response = await fetch(url);
      
      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.detail || 'Failed to fetch YoY data');
      }
      
      const result = await response.json();
      
      // Transform the data to match the expected format
      if (result && result.success && result.waterfall && result.waterfall.labels && result.waterfall.values) {
        
        // Transform waterfall data for the bar chart
        const chartData = result.waterfall.labels.map((label: string, index: number) => ({
          name: label,
          value: result.waterfall.values[index] || 0
        }));
        
        handleDataChange({ yoyData: chartData });
      } else {
        handleDataChange({ yoyData: [] });
      }
      
    } catch (error) {
      handleDataChange({ yoyData: [] });
    }
  };

  // Function to fetch weighted ensemble data
  const fetchWeightedEnsembleData = async (fileKey: string, combinationId: string) => {
    if (!fileKey || combinationId === 'all' || !data.ensembleMethod) {
      return;
    }
    
    try {
      const envStr = localStorage.getItem('env');
      const env = envStr ? JSON.parse(envStr) : {};

      const baseUrl = `${SELECT_API}/models/weighted-ensemble`;
      const url = `${baseUrl}`;
      
      // Prepare request body
      const requestBody = {
        file_key: fileKey,
        grouping_keys: ['combination_id'],
        filter_criteria: {
          combination_id: combinationId
        },
        include_numeric: null,
        exclude_numeric: null,
        filtered_models: data.elasticityData && data.elasticityData.length > 0 ? data.elasticityData.map((model: any) => model.name) : null
      };
      
      const response = await fetch(url, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(requestBody)
      });
      
      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.detail || 'Failed to fetch weighted ensemble data');
      }
      
      const result = await response.json();
      
      if (result && result.results && result.results.length > 0) {
        
        // Transform the results for display
        const ensembleData = result.results.map((item: any) => ({
          combination: item.combo,
          models_used: item.models_used,
          best_model: item.best_model,
          best_mape: item.best_mape,
          weight_concentration: item.weight_concentration,
          weighted_metrics: item.weighted,
          aliases: item.aliases,
          y_pred_at_mean: item.y_pred_at_mean
        }));
        
        handleDataChange({ weightedEnsembleData: ensembleData });
      } else {
        handleDataChange({ weightedEnsembleData: [] });
      }
      
    } catch (error) {
      handleDataChange({ weightedEnsembleData: [] });
    }
  };

  // Fetch cardinality data function
  const fetchCardinalityData = async () => {
    if (!data.selectedDataset) {
      return;
    }
    
    setCardinalityLoading(true);
    setCardinalityError(null);
    
    try {
      // Extract the object name by removing the prefix (default_client/default_app/default_project/)
      // The groupby endpoint will add the prefix back, so we need to pass the path without the prefix
      let objectName = data.selectedDataset;
      if (data.selectedDataset.includes('/')) {
        const parts = data.selectedDataset.split('/');
        // Remove the first 3 parts (default_client/default_app/default_project)
        if (parts.length > 3) {
          objectName = parts.slice(3).join('/');
        } else {
          // If less than 3 parts, just use the last part
          objectName = parts[parts.length - 1];
        }
      }
      
      // Use GROUPBY_API cardinality endpoint instead of FEATURE_OVERVIEW_API
      const formData = new FormData();
      formData.append('validator_atom_id', atomId); // Use atomId as validator_atom_id
      formData.append('file_key', objectName);
      formData.append('bucket_name', 'trinity');
      formData.append('object_names', objectName);
      
      const res = await fetch(`${GROUPBY_API}/cardinality`, { method: 'POST', body: formData });
      const data_result = await res.json();
      
      if (data_result.status === 'SUCCESS' && data_result.cardinality) {
        setCardinalityData(data_result.cardinality);
      } else {
        setCardinalityError(data_result.error || 'Failed to fetch cardinality data');
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

    // Don't filter out columns with unique_count = 0, show all columns
    // filtered = filtered.filter(c => c.unique_count > 0);

    // Apply column filters
    Object.entries(columnFilters).forEach(([column, filterValues]) => {
      if (filterValues && Array.isArray(filterValues) && filterValues.length > 0) {
        filtered = filtered.filter(row => {
          const cellValue = String(row[column as keyof typeof row] || '');
          return filterValues.includes(cellValue);
        });
      }
    });

    // Apply sorting
    if (sortColumn) {
      filtered.sort((a, b) => {
        const aVal = a[sortColumn as keyof typeof a];
        const bVal = b[sortColumn as keyof typeof b];
        
        if (typeof aVal === 'number' && typeof bVal === 'number') {
          return sortDirection === 'asc' ? aVal - bVal : bVal - aVal;
        }
        
        const aStr = String(aVal || '');
        const bStr = String(bVal || '');
        return sortDirection === 'asc' ? aStr.localeCompare(bStr) : bStr.localeCompare(aStr);
      });
    }

    console.log('🔍 SelectModelsFeature: displayedCardinality after filtering:', filtered);
    return filtered;
  }, [cardinalityData, columnFilters, sortColumn, sortDirection]);

  // Cardinality sorting and filtering functions
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

  const getUniqueColumnValues = (column: string) => {
    const allColumns = Array.isArray(cardinalityData) ? cardinalityData : [];
    let filteredData = allColumns; // Show all columns, don't filter by unique_count

    // Apply all other column filters except the current one
    Object.entries(columnFilters).forEach(([col, filterValues]) => {
      if (col !== column && filterValues && Array.isArray(filterValues) && filterValues.length > 0) {
        filteredData = filteredData.filter(row => {
          const cellValue = String(row[col as keyof typeof row] || '');
          return filterValues.includes(cellValue);
        });
      }
    });

    // Get unique values from the filtered data
    const values = filteredData.map(row => String(row[column as keyof typeof row] || '')).filter(Boolean);
    return Array.from(new Set(values)).sort();
  };

  // FilterMenu component for cardinality view
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

  // Function to fetch elasticity data with filters
  const fetchElasticityDataWithFilters = async (variable: string, combinationId: string, fileKey: string, filters: any) => {
    if (combinationId === 'all' || !fileKey) {
      return;
    }
    
    try {
      const envStr = localStorage.getItem('env');
      const env = envStr ? JSON.parse(envStr) : {};

      const baseUrl = `${SELECT_API}/models/filter`;
      const params = new URLSearchParams({
        file_key: fileKey,
        variable: variable,
        client_id: env.CLIENT_ID || '',
        app_id: env.APP_ID || '',
        project_id: env.PROJECT_ID || '',
        client_name: env.CLIENT_NAME || '',
        app_name: env.APP_NAME || '',
        project_name: env.PROJECT_NAME || ''
      });
      const url = `${baseUrl}?${params.toString()}`;
      
      // Prepare filter values
      const filterBody: any = {
        file_key: fileKey,
        variable: variable,
        combination_id: combinationId,
        min_self_elasticity: null,
        max_self_elasticity: null,
        min_mape: null,
        max_mape: null,
        min_r2: null,
        max_r2: null
      };

      // Add filter values if they exist
      if (filters.self_elasticity) {
        filterBody.min_self_elasticity = filters.self_elasticity.current_min;
        filterBody.max_self_elasticity = filters.self_elasticity.current_max;
      }
      if (filters.mape_train) {
        filterBody.min_mape_train = filters.mape_train.current_min;
        filterBody.max_mape_train = filters.mape_train.current_max;
      }
      if (filters.mape_test) {
        filterBody.min_mape_test = filters.mape_test.current_min;
        filterBody.max_mape_test = filters.mape_test.current_max;
      }
      if (filters.r2_train) {
        filterBody.min_r2_train = filters.r2_train.current_min;
        filterBody.max_r2_train = filters.r2_train.current_max;
      }
      if (filters.r2_test) {
        filterBody.min_r2_test = filters.r2_test.current_min;
        filterBody.max_r2_test = filters.r2_test.current_max;
      }
      if (filters.aic) {
        filterBody.min_aic = filters.aic.current_min;
        filterBody.max_aic = filters.aic.current_max;
      }
      if (filters.bic) {
        filterBody.min_bic = filters.bic.current_min;
        filterBody.max_bic = filters.bic.current_max;
      }

      const response = await fetch(url, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(filterBody)
      });
      
      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.detail || 'Failed to fetch elasticity data');
      }
      
      const result = await response.json();
      
      if (result && result.length > 0) {
        // Transform data for the vertical bar chart
        const chartData = result.map((item: any) => ({
          name: item.model_name || 'Unknown Model',
          value: item.self_elasticity || 0
        }));
        
        handleDataChange({ 
          elasticityData: chartData,
          selectedVariable: variable
        });
      } else {
        handleDataChange({ elasticityData: [] });
      }
      
    } catch (error) {
      console.error('Error fetching elasticity data with filters:', error);
    }
  };

  return (
    <div className="w-full h-full bg-gradient-to-br from-orange-50/30 via-background to-blue-50/20">
      <div className="p-6 overflow-y-auto">
        {/* Cardinality View */}
        {data.selectedDataset && (
          <div className="w-full mb-6">
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
                              uniqueValues={getUniqueColumnValues('column')} 
                              current={columnFilters['column'] || []} 
                              onColumnFilter={handleColumnFilter} 
                            />
                          </ContextMenuSubContent>
                        </ContextMenuSub>
                        {columnFilters['column']?.length > 0 && (
                          <>
                            <ContextMenuSeparator />
                            <ContextMenuItem onClick={() => clearColumnFilter('column')}>
                              <X className="w-4 h-4 mr-2" /> Clear Filter
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
                            <FilterMenu 
                              column="data_type" 
                              uniqueValues={getUniqueColumnValues('data_type')} 
                              current={columnFilters['data_type'] || []} 
                              onColumnFilter={handleColumnFilter} 
                            />
                          </ContextMenuSubContent>
                        </ContextMenuSub>
                        {columnFilters['data_type']?.length > 0 && (
                          <>
                            <ContextMenuSeparator />
                            <ContextMenuItem onClick={() => clearColumnFilter('data_type')}>
                              <X className="w-4 h-4 mr-2" /> Clear Filter
                            </ContextMenuItem>
                          </>
                        )}
                      </ContextMenuContent>
                    </ContextMenu>,
                    <ContextMenu key="Unique Count">
                      <ContextMenuTrigger asChild>
                        <div className="flex items-center gap-1 cursor-pointer">
                          Unique Count
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
                              current={columnFilters['unique_count'] || []} 
                              onColumnFilter={handleColumnFilter} 
                            />
                          </ContextMenuSubContent>
                        </ContextMenuSub>
                        {columnFilters['unique_count']?.length > 0 && (
                          <>
                            <ContextMenuSeparator />
                            <ContextMenuItem onClick={() => clearColumnFilter('unique_count')}>
                              <X className="w-4 h-4 mr-2" /> Clear Filter
                            </ContextMenuItem>
                          </>
                        )}
                      </ContextMenuContent>
                    </ContextMenu>,
                    <ContextMenu key="Unique Values">
                      <ContextMenuTrigger asChild>
                        <div className="flex items-center gap-1 cursor-pointer">
                          Unique Values
                          {sortColumn === 'unique_values' && (
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
                            <ContextMenuItem onClick={() => handleSort('unique_values', 'asc')}>
                              <ArrowUp className="w-4 h-4 mr-2" /> Ascending
                            </ContextMenuItem>
                            <ContextMenuItem onClick={() => handleSort('unique_values', 'desc')}>
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
                              column="unique_values" 
                              uniqueValues={getUniqueColumnValues('unique_values')} 
                              current={columnFilters['unique_values'] || []} 
                              onColumnFilter={handleColumnFilter} 
                            />
                          </ContextMenuSubContent>
                        </ContextMenuSub>
                        {columnFilters['unique_values']?.length > 0 && (
                          <>
                            <ContextMenuSeparator />
                            <ContextMenuItem onClick={() => clearColumnFilter('unique_values')}>
                              <X className="w-4 h-4 mr-2" /> Clear Filter
                            </ContextMenuItem>
                          </>
                        )}
                      </ContextMenuContent>
                    </ContextMenu>
                  ]}
                  colClasses={["w-[30%]", "w-[20%]", "w-[15%]", "w-[35%]"]}
                  bodyClassName="max-h-[484px] overflow-y-auto"
                  defaultMinimized={true}
                  borderColor="border-orange-500"
                  customHeader={{
                    title: "Cardinality View",
                    subtitle: "Click Here to View Data",
                    subtitleClickable: !!data.selectedDataset,
                    onSubtitleClick: () => {
                      if (data.selectedDataset) {
                        const objectName = data.selectedDataset.endsWith('.arrow') ? data.selectedDataset : `${data.selectedDataset}.arrow`;
                        window.open(`/dataframe?name=${encodeURIComponent(objectName)}`, '_blank');
                      }
                    }
                  }}
                >
                  {displayedCardinality.map((col, index) => (
                    <tr key={index} className="table-row">
                      <td className="table-cell">{col.column || ''}</td>
                      <td className="table-cell">{col.data_type || ''}</td>
                      <td className="table-cell">{col.unique_count || 0}</td>
                      <td className="table-cell">
                        <div className="flex flex-wrap items-center gap-1">
                          {Array.isArray(col.unique_values) && col.unique_values.slice(0, 2).map((val, i) => (
                            <Badge
                              key={i}
                              className="p-0 px-1 text-xs bg-gray-50 text-slate-700 hover:bg-gray-50"
                            >
                              {String(val)}
                            </Badge>
                          ))}
                          {Array.isArray(col.unique_values) && col.unique_values.length > 2 && (
                            <UITooltip>
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
                              </UITooltip>
                          )}
                        </div>
                      </td>
                    </tr>
                  ))}
                </Table>
            ) : (
              <div className="p-4 text-gray-500">No cardinality data available</div>
            )}
          </div>
        )}

        {/* Top Section: Results and Filters */}
        <div className="flex gap-6 mb-8">
          {/* Results Section */}
          <div className="flex-1 bg-white/80 backdrop-blur-sm rounded-xl border border-orange-200/30 p-6 shadow-lg">
            {/* Combination ID Dropdown */}
            <div className="mb-6">
              <Select 
                value={data.selectedCombinationId || undefined} 
                onValueChange={handleCombinationChange}
              >
                <SelectTrigger className="border-orange-200 focus:border-orange-400">
                  <SelectValue placeholder="Select a combination" />
                </SelectTrigger>
                <SelectContent>
                  {data.availableCombinationIds && data.availableCombinationIds.length > 0 ? (
                    data.availableCombinationIds.map((comboId: string) => {
                      const isSaved = combinationStatus?.saved_combinations?.includes(comboId);
                      return (
                        <SelectItem 
                          key={comboId} 
                          value={comboId}
                          className={isSaved ? "bg-green-50 hover:bg-green-100 text-green-800" : ""}
                        >
                          {comboId}
                        </SelectItem>
                      );
                    })
                  ) : (
                    <SelectItem value="no-data" disabled>
                      No combination IDs available
                    </SelectItem>
                  )}
                </SelectContent>
              </Select>
              </div>

            {/* Variable Selector and Method - Multi-select */}
            <div className="mb-6 flex gap-4">
              <div className="flex-1">
                <Popover open={variablePopoverOpen} onOpenChange={setVariablePopoverOpen}>
                  <PopoverTrigger asChild>
                    <Button 
                      variant="outline" 
                      className="w-full justify-between border-orange-200 focus:border-orange-400"
                      disabled={!data.availableVariables || data.availableVariables.length === 0}
                    >
                      <span>
                        {Array.isArray(data.selectedVariable) && data.selectedVariable.length > 0
                          ? `${data.selectedVariable.length} variable${data.selectedVariable.length > 1 ? 's' : ''} selected`
                          : "Select variables"
                        }
                      </span>
                      <ChevronDown className="w-4 h-4" />
                    </Button>
                  </PopoverTrigger>
                  <PopoverContent className="bg-white border-gray-200 max-h-60 overflow-y-auto w-56 p-2" onPointerDownOutside={(e) => e.preventDefault()}>
                    {data.availableVariables && data.availableVariables.length > 0 ? (
                      <>
                        <div className="flex items-center gap-2 py-1 border-b mb-2">
                          <Checkbox
                            checked={Array.isArray(data.selectedVariable) && data.selectedVariable.length === data.availableVariables.length}
                            onCheckedChange={(checked) => {
                              handleDataChange({ selectedVariable: checked ? data.availableVariables : [] });
                            }}
                          />
                          <span className="text-sm font-medium">Select All</span>
                        </div>
                        {data.availableVariables.map((variable: string) => {
                          const isChecked = Array.isArray(data.selectedVariable) ? data.selectedVariable.includes(variable) : false;
                          return (
                            <div key={variable} className="flex items-center gap-2 py-1">
                              <Checkbox
                                checked={isChecked}
                                onCheckedChange={(checked) => toggleVariable(variable, !!checked)}
                              />
                              <span className="text-sm">{variable}</span>
                            </div>
                          );
                        })}
                      </>
                    ) : (
                      <div className="px-2 py-1.5 text-sm text-muted-foreground">
                        No variables available - select a combination ID first
                      </div>
                    )}
                  </PopoverContent>
                </Popover>
            </div>

                            {/* Method Selector */}
              <div className="w-32">
              <Select 
                  value={data.selectedMethod || 'elasticity'} 
                  onValueChange={(value) => {
                    handleDataChange({ 
                      selectedMethod: value
                    });
                  }}
                  onOpenChange={(open) => {
                    if (open && !data.selectedMethod) {
                      // Set default method if none is selected
                      handleDataChange({ 
                        selectedMethod: 'elasticity'
                      });
                    }
                  }}
              >
                <SelectTrigger className="border-orange-200 focus:border-orange-400">
                    <SelectValue placeholder="Method" />
                </SelectTrigger>
                <SelectContent>
                    <SelectItem value="elasticity">Elasticity</SelectItem>
                    <SelectItem value="beta">Beta</SelectItem>
                    <SelectItem value="average">Average</SelectItem>
                </SelectContent>
              </Select>
            </div>


            </div>

                {/* Multi-Variable Method Chart */}
    <div className="mb-6 mt-12">
      <h4 className="text-sm font-medium text-orange-800 mb-6">
        {Array.isArray(data.selectedVariable) && data.selectedVariable.length > 0 && data.selectedMethod 
          ? `${data.selectedMethod.charAt(0).toUpperCase() + data.selectedMethod.slice(1)} by Model` 
          : 'Select variables and method to view data'
        }
      </h4>
              
              {data.elasticityData && data.elasticityData.length > 0 ? (
                <div className="w-full h-[300px]">
                  <RechartsChartRenderer
                    type={methodByModelChartType}
                    data={transformMethodByModelData()}
                    xField="name"
                    yField="value"
                    legendField="variable"
                    xAxisLabel="Model"
                    yAxisLabel={data.selectedMethod ? data.selectedMethod.charAt(0).toUpperCase() + data.selectedMethod.slice(1) : 'Value'}
                    theme={methodByModelChartTheme}
                    enableScroll={false}
                    width="100%"
                    height={300}
                    showDataLabels={methodByModelChartDataLabels}
                    showLegend={true}
                    sortOrder={methodByModelChartSortOrder}
                    onThemeChange={handleMethodByModelChartThemeChange}
                    onChartTypeChange={handleMethodByModelChartTypeChange}
                    onDataLabelsToggle={handleMethodByModelChartDataLabelsChange}
                    onSortChange={handleMethodByModelChartSortOrderChange}
                  />
                </div>
              ) : (
                <div className="h-[300px] bg-gray-50 rounded-lg flex items-center justify-center border border-gray-200">
                  <p className="text-gray-500 text-sm">
                    {Array.isArray(data.selectedVariable) && data.selectedVariable.length > 0
                      ? 'No data available for selected variables' 
                      : 'Select variables and method to view data'
                    }
                  </p>
                </div>
              )}
            </div>
          </div>

          {/* Filters Section */}
          <div className="w-80 bg-white/80 backdrop-blur-sm rounded-xl border border-orange-200/30 p-6 shadow-lg">
            <div className="flex items-center gap-2 mb-4">
              <Filter className="h-4 w-4 text-orange-600" />
              <h3 className="text-lg font-semibold text-orange-900">Model Filters</h3>
            </div>

            {/* Filter by Model Stats - Collapsible Section */}
            <div className="mb-4">
              <button
                onClick={() => {
                  setFilterStatsOpen(!filterStatsOpen);
                  if (!filterStatsOpen) {
                    setFilterVariablesOpen(false);
                  }
                }}
                className="flex items-center justify-between w-full p-2 text-sm font-medium text-orange-800 bg-orange-50 rounded-lg hover:bg-orange-100 transition-colors"
              >
                <span>Filter by Model Stats</span>
                <ChevronDown className={`h-4 w-4 transition-transform ${filterStatsOpen ? 'rotate-180' : ''}`} />
              </button>
              
              {filterStatsOpen && (
                <div 
                  className="space-y-2 mt-2 max-h-[350px] overflow-y-auto pr-2 scrollbar-thin scrollbar-thumb-orange-300 scrollbar-track-orange-100"
                  ref={(el) => {
                    if (el) {
                      // Preserve scroll position on re-render
                      const savedScrollTop = sessionStorage.getItem('filterScrollPosition');
                      if (savedScrollTop) {
                        el.scrollTop = parseInt(savedScrollTop);
                      }
                    }
                  }}
                  onScroll={(e) => {
                    // Save scroll position when user scrolls
                    sessionStorage.setItem('filterScrollPosition', e.currentTarget.scrollTop.toString());
                  }}
                >
                  {Array.isArray(data.selectedVariable) && data.selectedVariable.length > 0 ? (
                <>
                  {/* MAPE Train Filter */}
                  {data.modelFilters.mape_train && data.modelFilters.mape_train.current_min !== undefined && (
              <div className="bg-white/80 rounded-lg p-3 shadow-sm border border-orange-100/50">
                                    <label className="text-sm font-medium text-orange-800 mb-2 block">MAPE Train</label>
              <div className="space-y-2">
                <div className="flex justify-between text-xs text-black mb-2">
                          <span>Min: {data.modelFilters.mape_train.current_min.toFixed(3)}</span>
                          <span>Max: {data.modelFilters.mape_train.current_max.toFixed(3)}</span>
                        </div>
                        <div className="flex-1">
                          <div className="relative mb-2">
                            <div className="w-full h-1 bg-gray-300 rounded-lg relative">
                              <div 
                                className="absolute h-1 bg-orange-500 rounded-lg"
                                style={{
                                  left: `${((data.modelFilters.mape_train.current_min - data.modelFilters.mape_train.min) / (data.modelFilters.mape_train.max - data.modelFilters.mape_train.min)) * 100}%`,
                                  right: `${100 - ((data.modelFilters.mape_train.current_max - data.modelFilters.mape_train.min) / (data.modelFilters.mape_train.max - data.modelFilters.mape_train.min)) * 100}%`
                                }}
                              ></div>
                              <input
                                type="range"
                                min={data.modelFilters.mape_train.min}
                                max={data.modelFilters.mape_train.max}
                                step={0.001}
                                value={data.modelFilters.mape_train.current_min}
                                onChange={(e) => {
                                  const newMin = parseFloat(e.target.value);
                                  if (newMin <= data.modelFilters.mape_train.current_max) {
                                    handleFilterChange('mape_train_range', [newMin, data.modelFilters.mape_train.current_max]);
                                  }
                                }}
                                className="absolute w-full h-1 opacity-0 cursor-pointer z-10"
                              />
                              <input
                                type="range"
                                min={data.modelFilters.mape_train.min}
                                max={data.modelFilters.mape_train.max}
                                step={0.001}
                                value={data.modelFilters.mape_train.current_max}
                                onChange={(e) => {
                                  const newMax = parseFloat(e.target.value);
                                  if (newMax >= data.modelFilters.mape_train.current_min) {
                                    handleFilterChange('mape_train_range', [data.modelFilters.mape_train.current_min, newMax]);
                                  }
                                }}
                                className="absolute w-full h-1 opacity-0 cursor-pointer z-10"
                              />
                              <div 
                                className="absolute w-3 h-3 bg-orange-500 border-2 border-orange-600 rounded-full cursor-pointer shadow-lg transform -translate-x-1/2 -translate-y-1/2 z-20"
                                style={{
                                  left: `${((data.modelFilters.mape_train.current_min - data.modelFilters.mape_train.min) / (data.modelFilters.mape_train.max - data.modelFilters.mape_train.min)) * 100}%`,
                                  top: '50%'
                                }}
                                onMouseDown={(e) => {
                                  const slider = e.currentTarget.parentElement?.querySelector('input:first-of-type') as HTMLInputElement;
                                  if (slider) {
                                    const rect = slider.getBoundingClientRect();
                                    const handleMouseMove = (moveEvent: MouseEvent) => {
                                      const newValue = ((moveEvent.clientX - rect.left) / rect.width) * (data.modelFilters.mape_train.max - data.modelFilters.mape_train.min) + data.modelFilters.mape_train.min;
                                      const clampedValue = Math.max(data.modelFilters.mape_train.min, Math.min(data.modelFilters.mape_train.current_max, newValue));
                                      handleFilterChange('mape_train_range', [clampedValue, data.modelFilters.mape_train.current_max]);
                                    };
                                    const handleMouseUp = () => {
                                      document.removeEventListener('mousemove', handleMouseMove);
                                      document.removeEventListener('mouseup', handleMouseUp);
                                    };
                                    document.addEventListener('mousemove', handleMouseMove);
                                    document.addEventListener('mouseup', handleMouseUp);
                                  }
                                }}
                              ></div>
                              <div 
                                className="absolute w-3 h-3 bg-orange-500 border-2 border-orange-600 rounded-full cursor-pointer shadow-lg transform -translate-x-1/2 -translate-y-1/2 z-20"
                                style={{
                                  left: `${((data.modelFilters.mape_train.current_max - data.modelFilters.mape_train.min) / (data.modelFilters.mape_train.max - data.modelFilters.mape_train.min)) * 100}%`,
                                  top: '50%'
                                }}
                                onMouseDown={(e) => {
                                  const slider = e.currentTarget.parentElement?.querySelector('input:last-of-type') as HTMLInputElement;
                                  if (slider) {
                                    const rect = slider.getBoundingClientRect();
                                    const handleMouseMove = (moveEvent: MouseEvent) => {
                                      const newValue = ((moveEvent.clientX - rect.left) / rect.width) * (data.modelFilters.mape_train.max - data.modelFilters.mape_train.min) + data.modelFilters.mape_train.min;
                                      const clampedValue = Math.min(data.modelFilters.mape_train.max, Math.max(data.modelFilters.mape_train.current_min, newValue));
                                      handleFilterChange('mape_train_range', [data.modelFilters.mape_train.current_min, clampedValue]);
                                    };
                                    const handleMouseUp = () => {
                                      document.removeEventListener('mousemove', handleMouseMove);
                                      document.removeEventListener('mouseup', handleMouseUp);
                                    };
                                    document.addEventListener('mousemove', handleMouseMove);
                                    document.addEventListener('mouseup', handleMouseUp);
                                  }
                                }}
                              ></div>
              </div>
                          </div>
                        </div>
                      </div>
                    </div>
                  )}

                  {/* MAPE Test Filter */}
                  {data.modelFilters.mape_test && data.modelFilters.mape_test.current_min !== undefined && (
              <div className="bg-white/80 rounded-lg p-3 shadow-sm border border-orange-100/50">
                                    <label className="text-sm font-medium text-orange-800 mb-2 block">MAPE Test</label>
              <div className="space-y-2">
                <div className="flex justify-between text-xs text-black mb-2">
                          <span>Min: {data.modelFilters.mape_test.current_min.toFixed(3)}</span>
                          <span>Max: {data.modelFilters.mape_test.current_max.toFixed(3)}</span>
                        </div>
                                                <div className="flex-1">
                          <div className="relative mb-2">
                            <div className="w-full h-1 bg-gray-300 rounded-lg relative">
                              <div 
                                className="absolute h-1 bg-orange-500 rounded-lg"
                                style={{
                                  left: `${((data.modelFilters.mape_test.current_min - data.modelFilters.mape_test.min) / (data.modelFilters.mape_test.max - data.modelFilters.mape_test.min)) * 100}%`,
                                  right: `${100 - ((data.modelFilters.mape_test.current_max - data.modelFilters.mape_test.min) / (data.modelFilters.mape_test.max - data.modelFilters.mape_test.min)) * 100}%`
                                }}
                              ></div>
                              <input
                                type="range"
                                min={data.modelFilters.mape_test.min}
                                max={data.modelFilters.mape_test.max}
                                step={0.001}
                                value={data.modelFilters.mape_test.current_min}
                                onChange={(e) => {
                                  const newMin = parseFloat(e.target.value);
                                  if (newMin <= data.modelFilters.mape_test.current_max) {
                                    handleFilterChange('mape_test_range', [newMin, data.modelFilters.mape_test.current_max]);
                                  }
                                }}
                                className="absolute w-full h-1 opacity-0 cursor-pointer z-10"
                              />
                              <input
                                type="range"
                                min={data.modelFilters.mape_test.min}
                                max={data.modelFilters.mape_test.max}
                                step={0.001}
                                value={data.modelFilters.mape_test.current_max}
                                onChange={(e) => {
                                  const newMax = parseFloat(e.target.value);
                                  if (newMax >= data.modelFilters.mape_test.current_min) {
                                    handleFilterChange('mape_test_range', [data.modelFilters.mape_test.current_min, newMax]);
                                  }
                                }}
                                className="absolute w-full h-1 opacity-0 cursor-pointer z-10"
                              />
                              <div 
                                className="absolute w-3 h-3 bg-orange-500 border-2 border-orange-600 rounded-full cursor-pointer shadow-lg transform -translate-x-1/2 -translate-y-1/2 z-20"
                                style={{
                                  left: `${((data.modelFilters.mape_test.current_min - data.modelFilters.mape_test.min) / (data.modelFilters.mape_test.max - data.modelFilters.mape_test.min)) * 100}%`,
                                  top: '50%'
                                }}
                                onMouseDown={(e) => {
                                  const slider = e.currentTarget.parentElement?.querySelector('input:first-of-type') as HTMLInputElement;
                                  if (slider) {
                                    const rect = slider.getBoundingClientRect();
                                    const handleMouseMove = (moveEvent: MouseEvent) => {
                                      const newValue = ((moveEvent.clientX - rect.left) / rect.width) * (data.modelFilters.mape_test.max - data.modelFilters.mape_test.min) + data.modelFilters.mape_test.min;
                                      const clampedValue = Math.max(data.modelFilters.mape_test.min, Math.min(data.modelFilters.mape_test.current_max, newValue));
                                      handleFilterChange('mape_test_range', [clampedValue, data.modelFilters.mape_test.current_max]);
                                    };
                                    const handleMouseUp = () => {
                                      document.removeEventListener('mousemove', handleMouseMove);
                                      document.removeEventListener('mouseup', handleMouseUp);
                                    };
                                    document.addEventListener('mousemove', handleMouseMove);
                                    document.addEventListener('mouseup', handleMouseUp);
                                  }
                                }}
                              ></div>
                              <div 
                                className="absolute w-3 h-3 bg-orange-500 border-2 border-orange-600 rounded-full cursor-pointer shadow-lg transform -translate-x-1/2 -translate-y-1/2 z-20"
                                style={{
                                  left: `${((data.modelFilters.mape_test.current_max - data.modelFilters.mape_test.min) / (data.modelFilters.mape_test.max - data.modelFilters.mape_test.min)) * 100}%`,
                                  top: '50%'
                                }}
                                onMouseDown={(e) => {
                                  const slider = e.currentTarget.parentElement?.querySelector('input:last-of-type') as HTMLInputElement;
                                  if (slider) {
                                    const rect = slider.getBoundingClientRect();
                                    const handleMouseMove = (moveEvent: MouseEvent) => {
                                      const newValue = ((moveEvent.clientX - rect.left) / rect.width) * (data.modelFilters.mape_test.max - data.modelFilters.mape_test.min) + data.modelFilters.mape_test.min;
                                      const clampedValue = Math.min(data.modelFilters.mape_test.max, Math.max(data.modelFilters.mape_test.current_min, newValue));
                                      handleFilterChange('mape_test_range', [data.modelFilters.mape_test.current_min, clampedValue]);
                                    };
                                    const handleMouseUp = () => {
                                      document.removeEventListener('mousemove', handleMouseMove);
                                      document.removeEventListener('mouseup', handleMouseUp);
                                    };
                                    document.addEventListener('mousemove', handleMouseMove);
                                    document.addEventListener('mouseup', handleMouseUp);
                                  }
                                }}
                              ></div>
              </div>
                          </div>
                        </div>
                      </div>
              </div>
                  )}

                  {/* R² Train Filter */}
                  {data.modelFilters.r2_train && data.modelFilters.r2_train.current_min !== undefined && (
              <div className="bg-white/80 rounded-lg p-3 shadow-sm border border-orange-100/50">
                                    <label className="text-sm font-medium text-orange-800 mb-2 block">R² Train</label>
              <div className="space-y-2">
                <div className="flex justify-between text-xs text-black mb-2">
                          <span>Min: {data.modelFilters.r2_train.current_min.toFixed(3)}</span>
                          <span>Max: {data.modelFilters.r2_train.current_max.toFixed(3)}</span>
                        </div>
                                                <div className="flex-1">
                          <div className="relative mb-2">
                            <div className="w-full h-1 bg-gray-300 rounded-lg relative">
                              <div 
                                className="absolute h-1 bg-orange-500 rounded-lg"
                                style={{
                                  left: `${((data.modelFilters.r2_train.current_min - data.modelFilters.r2_train.min) / (data.modelFilters.r2_train.max - data.modelFilters.r2_train.min)) * 100}%`,
                                  right: `${100 - ((data.modelFilters.r2_train.current_max - data.modelFilters.r2_train.min) / (data.modelFilters.r2_train.max - data.modelFilters.r2_train.min)) * 100}%`
                                }}
                              ></div>
                              <input
                                type="range"
                                min={data.modelFilters.r2_train.min}
                                max={data.modelFilters.r2_train.max}
                                step={0.001}
                                value={data.modelFilters.r2_train.current_min}
                                onChange={(e) => {
                                  const newMin = parseFloat(e.target.value);
                                  if (newMin <= data.modelFilters.r2_train.current_max) {
                                    handleFilterChange('r2_train_range', [newMin, data.modelFilters.r2_train.current_max]);
                                  }
                                }}
                                className="absolute w-full h-1 opacity-0 cursor-pointer z-10"
                              />
                              <input
                                type="range"
                                min={data.modelFilters.r2_train.min}
                                max={data.modelFilters.r2_train.max}
                                step={0.001}
                                value={data.modelFilters.r2_train.current_max}
                                onChange={(e) => {
                                  const newMax = parseFloat(e.target.value);
                                  if (newMax >= data.modelFilters.r2_train.current_min) {
                                    handleFilterChange('r2_train_range', [data.modelFilters.r2_train.current_min, newMax]);
                                  }
                                }}
                                className="absolute w-full h-1 opacity-0 cursor-pointer z-10"
                              />
                              <div 
                                className="absolute w-3 h-3 bg-orange-500 border-2 border-orange-600 rounded-full cursor-pointer shadow-lg transform -translate-x-1/2 -translate-y-1/2 z-20"
                                style={{
                                  left: `${((data.modelFilters.r2_train.current_min - data.modelFilters.r2_train.min) / (data.modelFilters.r2_train.max - data.modelFilters.r2_train.min)) * 100}%`,
                                  top: '50%'
                                }}
                                onMouseDown={(e) => {
                                  const slider = e.currentTarget.parentElement?.querySelector('input:first-of-type') as HTMLInputElement;
                                  if (slider) {
                                    const rect = slider.getBoundingClientRect();
                                    const handleMouseMove = (moveEvent: MouseEvent) => {
                                      const newValue = ((moveEvent.clientX - rect.left) / rect.width) * (data.modelFilters.r2_train.max - data.modelFilters.r2_train.min) + data.modelFilters.r2_train.min;
                                      const clampedValue = Math.max(data.modelFilters.r2_train.min, Math.min(data.modelFilters.r2_train.current_max, newValue));
                                      handleFilterChange('r2_train_range', [clampedValue, data.modelFilters.r2_train.current_max]);
                                    };
                                    const handleMouseUp = () => {
                                      document.removeEventListener('mousemove', handleMouseMove);
                                      document.removeEventListener('mouseup', handleMouseUp);
                                    };
                                    document.addEventListener('mousemove', handleMouseMove);
                                    document.addEventListener('mouseup', handleMouseUp);
                                  }
                                }}
                              ></div>
                              <div 
                                className="absolute w-3 h-3 bg-orange-500 border-2 border-orange-600 rounded-full cursor-pointer shadow-lg transform -translate-x-1/2 -translate-y-1/2 z-20"
                                style={{
                                  left: `${((data.modelFilters.r2_train.current_max - data.modelFilters.r2_train.min) / (data.modelFilters.r2_train.max - data.modelFilters.r2_train.min)) * 100}%`,
                                  top: '50%'
                                }}
                                onMouseDown={(e) => {
                                  const slider = e.currentTarget.parentElement?.querySelector('input:last-of-type') as HTMLInputElement;
                                  if (slider) {
                                    const rect = slider.getBoundingClientRect();
                                    const handleMouseMove = (moveEvent: MouseEvent) => {
                                      const newValue = ((moveEvent.clientX - rect.left) / rect.width) * (data.modelFilters.r2_train.max - data.modelFilters.r2_train.min) + data.modelFilters.r2_train.min;
                                      const clampedValue = Math.min(data.modelFilters.r2_train.max, Math.max(data.modelFilters.r2_train.current_min, newValue));
                                      handleFilterChange('r2_train_range', [data.modelFilters.r2_train.current_min, clampedValue]);
                                    };
                                    const handleMouseUp = () => {
                                      document.removeEventListener('mousemove', handleMouseMove);
                                      document.removeEventListener('mouseup', handleMouseUp);
                                    };
                                    document.addEventListener('mousemove', handleMouseMove);
                                    document.addEventListener('mouseup', handleMouseUp);
                                  }
                                }}
                              ></div>
              </div>
                          </div>
                        </div>
                      </div>
              </div>
                  )}

                  {/* R² Test Filter */}
                  {data.modelFilters.r2_test && data.modelFilters.r2_test.current_min !== undefined && (
              <div className="bg-white/80 rounded-lg p-3 shadow-sm border border-orange-100/50">
                                    <label className="text-sm font-medium text-orange-800 mb-2 block">R² Test</label>
              <div className="space-y-2">
                <div className="flex justify-between text-xs text-black mb-2">
                          <span>Min: {data.modelFilters.r2_test.current_min.toFixed(3)}</span>
                          <span>Max: {data.modelFilters.r2_test.current_max.toFixed(3)}</span>
                        </div>
                                                <div className="flex-1">
                          <div className="relative mb-2">
                            <div className="w-full h-1 bg-gray-300 rounded-lg relative">
                              <div 
                                className="absolute h-1 bg-orange-500 rounded-lg"
                                style={{
                                  left: `${((data.modelFilters.r2_test.current_min - data.modelFilters.r2_test.min) / (data.modelFilters.r2_test.max - data.modelFilters.r2_test.min)) * 100}%`,
                                  right: `${100 - ((data.modelFilters.r2_test.current_max - data.modelFilters.r2_test.min) / (data.modelFilters.r2_test.max - data.modelFilters.r2_test.min)) * 100}%`
                                }}
                              ></div>
                              <input
                                type="range"
                                min={data.modelFilters.r2_test.min}
                                max={data.modelFilters.r2_test.max}
                                step={0.001}
                                value={data.modelFilters.r2_test.current_min}
                                onChange={(e) => {
                                  const newMin = parseFloat(e.target.value);
                                  if (newMin <= data.modelFilters.r2_test.current_max) {
                                    handleFilterChange('r2_test_range', [newMin, data.modelFilters.r2_test.current_max]);
                                  }
                                }}
                                className="absolute w-full h-1 opacity-0 cursor-pointer z-10"
                              />
                              <input
                                type="range"
                                min={data.modelFilters.r2_test.min}
                                max={data.modelFilters.r2_test.max}
                                step={0.001}
                                value={data.modelFilters.r2_test.current_max}
                                onChange={(e) => {
                                  const newMax = parseFloat(e.target.value);
                                  if (newMax >= data.modelFilters.r2_test.current_min) {
                                    handleFilterChange('r2_test_range', [data.modelFilters.r2_test.current_min, newMax]);
                                  }
                                }}
                                className="absolute w-full h-1 opacity-0 cursor-pointer z-10"
                              />
                              <div 
                                className="absolute w-3 h-3 bg-orange-500 border-2 border-orange-600 rounded-full cursor-pointer shadow-lg transform -translate-x-1/2 -translate-y-1/2 z-20"
                                style={{
                                  left: `${((data.modelFilters.r2_test.current_min - data.modelFilters.r2_test.min) / (data.modelFilters.r2_test.max - data.modelFilters.r2_test.min)) * 100}%`,
                                  top: '50%'
                                }}
                                onMouseDown={(e) => {
                                  const slider = e.currentTarget.parentElement?.querySelector('input:first-of-type') as HTMLInputElement;
                                  if (slider) {
                                    const rect = slider.getBoundingClientRect();
                                    const handleMouseMove = (moveEvent: MouseEvent) => {
                                      const newValue = ((moveEvent.clientX - rect.left) / rect.width) * (data.modelFilters.r2_test.max - data.modelFilters.r2_test.min) + data.modelFilters.r2_test.min;
                                      const clampedValue = Math.max(data.modelFilters.r2_test.min, Math.min(data.modelFilters.r2_test.current_max, newValue));
                                      handleFilterChange('r2_test_range', [clampedValue, data.modelFilters.r2_test.current_max]);
                                    };
                                    const handleMouseUp = () => {
                                      document.removeEventListener('mousemove', handleMouseMove);
                                      document.removeEventListener('mouseup', handleMouseUp);
                                    };
                                    document.addEventListener('mousemove', handleMouseMove);
                                    document.addEventListener('mouseup', handleMouseUp);
                                  }
                                }}
                              ></div>
                              <div 
                                className="absolute w-3 h-3 bg-orange-500 border-2 border-orange-600 rounded-full cursor-pointer shadow-lg transform -translate-x-1/2 -translate-y-1/2 z-20"
                                style={{
                                  left: `${((data.modelFilters.r2_test.current_max - data.modelFilters.r2_test.min) / (data.modelFilters.r2_test.max - data.modelFilters.r2_test.min)) * 100}%`,
                                  top: '50%'
                                }}
                                onMouseDown={(e) => {
                                  const slider = e.currentTarget.parentElement?.querySelector('input:last-of-type') as HTMLInputElement;
                                  if (slider) {
                                    const rect = slider.getBoundingClientRect();
                                    const handleMouseMove = (moveEvent: MouseEvent) => {
                                      const newValue = ((moveEvent.clientX - rect.left) / rect.width) * (data.modelFilters.r2_test.max - data.modelFilters.r2_test.min) + data.modelFilters.r2_test.min;
                                      const clampedValue = Math.min(data.modelFilters.r2_test.max, Math.max(data.modelFilters.r2_test.current_min, newValue));
                                      handleFilterChange('r2_test_range', [data.modelFilters.r2_test.current_min, clampedValue]);
                                    };
                                    const handleMouseUp = () => {
                                      document.removeEventListener('mousemove', handleMouseMove);
                                      document.removeEventListener('mouseup', handleMouseUp);
                                    };
                                    document.addEventListener('mousemove', handleMouseMove);
                                    document.addEventListener('mouseup', handleMouseUp);
                                  }
                                }}
                              ></div>
              </div>
              </div>
                        </div>
                      </div>
              </div>
                  )}

              {/* AIC Filter */}
                  {data.modelFilters.aic && data.modelFilters.aic.current_min !== undefined && (
              <div className="bg-white/80 rounded-lg p-3 shadow-sm border border-orange-100/50">
                <label className="text-sm font-medium text-orange-800 mb-2 block">AIC</label>
              <div className="space-y-2">
                <div className="flex justify-between text-xs text-black mb-2">
                          <span>Min: {data.modelFilters.aic.current_min.toFixed(1)}</span>
                          <span>Max: {data.modelFilters.aic.current_max.toFixed(1)}</span>
              </div>
                                                <div className="flex-1">
                          <div className="relative mb-2">
                            <div className="w-full h-1 bg-gray-300 rounded-lg relative">
                              <div 
                                className="absolute h-1 bg-orange-500 rounded-lg"
                                style={{
                                  left: `${((data.modelFilters.aic.current_min - data.modelFilters.aic.min) / (data.modelFilters.aic.max - data.modelFilters.aic.min)) * 100}%`,
                                  right: `${100 - ((data.modelFilters.aic.current_max - data.modelFilters.aic.min) / (data.modelFilters.aic.max - data.modelFilters.aic.min)) * 100}%`
                                }}
                              ></div>
                              <input
                                type="range"
                                min={data.modelFilters.aic.min}
                                max={data.modelFilters.aic.max}
                                step={0.1}
                                value={data.modelFilters.aic.current_min}
                                onChange={(e) => {
                                  const newMin = parseFloat(e.target.value);
                                  if (newMin <= data.modelFilters.aic.current_max) {
                                    handleFilterChange('aic_range', [newMin, data.modelFilters.aic.current_max]);
                                  }
                                }}
                                className="absolute w-full h-1 opacity-0 cursor-pointer z-10"
                              />
                              <input
                                type="range"
                                min={data.modelFilters.aic.min}
                                max={data.modelFilters.aic.max}
                                step={0.1}
                                value={data.modelFilters.aic.current_max}
                                onChange={(e) => {
                                  const newMax = parseFloat(e.target.value);
                                  if (newMax >= data.modelFilters.aic.current_min) {
                                    handleFilterChange('aic_range', [data.modelFilters.aic.current_min, newMax]);
                                  }
                                }}
                                className="absolute w-full h-1 opacity-0 cursor-pointer z-10"
                              />
                              <div 
                                className="absolute w-3 h-3 bg-orange-500 border-2 border-orange-600 rounded-full cursor-pointer shadow-lg transform -translate-x-1/2 -translate-y-1/2 z-20"
                                style={{
                                  left: `${((data.modelFilters.aic.current_min - data.modelFilters.aic.min) / (data.modelFilters.aic.max - data.modelFilters.aic.min)) * 100}%`,
                                  top: '50%'
                                }}
                                onMouseDown={(e) => {
                                  const slider = e.currentTarget.parentElement?.querySelector('input:first-of-type') as HTMLInputElement;
                                  if (slider) {
                                    const rect = slider.getBoundingClientRect();
                                    const handleMouseMove = (moveEvent: MouseEvent) => {
                                      const newValue = ((moveEvent.clientX - rect.left) / rect.width) * (data.modelFilters.aic.max - data.modelFilters.aic.min) + data.modelFilters.aic.min;
                                      const clampedValue = Math.max(data.modelFilters.aic.min, Math.min(data.modelFilters.aic.current_max, newValue));
                                      handleFilterChange('aic_range', [clampedValue, data.modelFilters.aic.current_max]);
                                    };
                                    const handleMouseUp = () => {
                                      document.removeEventListener('mousemove', handleMouseMove);
                                      document.removeEventListener('mouseup', handleMouseUp);
                                    };
                                    document.addEventListener('mousemove', handleMouseMove);
                                    document.addEventListener('mouseup', handleMouseUp);
                                  }
                                }}
                              ></div>
                              <div 
                                className="absolute w-3 h-3 bg-orange-500 border-2 border-orange-600 rounded-full cursor-pointer shadow-lg transform -translate-x-1/2 -translate-y-1/2 z-20"
                                style={{
                                  left: `${((data.modelFilters.aic.current_max - data.modelFilters.aic.min) / (data.modelFilters.aic.max - data.modelFilters.aic.min)) * 100}%`,
                                  top: '50%'
                                }}
                                onMouseDown={(e) => {
                                  const slider = e.currentTarget.parentElement?.querySelector('input:last-of-type') as HTMLInputElement;
                                  if (slider) {
                                    const rect = slider.getBoundingClientRect();
                                    const handleMouseMove = (moveEvent: MouseEvent) => {
                                      const newValue = ((moveEvent.clientX - rect.left) / rect.width) * (data.modelFilters.aic.max - data.modelFilters.aic.min) + data.modelFilters.aic.min;
                                      const clampedValue = Math.min(data.modelFilters.aic.max, Math.max(data.modelFilters.aic.current_min, newValue));
                                      handleFilterChange('aic_range', [data.modelFilters.aic.current_min, clampedValue]);
                                    };
                                    const handleMouseUp = () => {
                                      document.removeEventListener('mousemove', handleMouseMove);
                                      document.removeEventListener('mouseup', handleMouseUp);
                                    };
                                    document.addEventListener('mousemove', handleMouseMove);
                                    document.addEventListener('mouseup', handleMouseUp);
                                  }
                                }}
                              ></div>
              </div>
                          </div>
                        </div>
                      </div>
              </div>
                  )}

                  {/* BIC Filter */}
                  {data.modelFilters.bic && data.modelFilters.bic.current_min !== undefined && (
              <div className="bg-white/80 rounded-lg p-3 shadow-sm border border-orange-100/50">
                                    <label className="text-sm font-medium text-orange-800 mb-2 block">BIC</label>
              <div className="space-y-2">
                <div className="flex justify-between text-xs text-black mb-2">
                          <span>Min: {data.modelFilters.bic.current_min.toFixed(1)}</span>
                          <span>Max: {data.modelFilters.bic.current_max.toFixed(1)}</span>
              </div>
                                                <div className="flex-1">
                          <div className="relative mb-2">
                            <div className="w-full h-1 bg-gray-300 rounded-lg relative">
                              <div 
                                className="absolute h-1 bg-orange-500 rounded-lg"
                                style={{
                                  left: `${((data.modelFilters.bic.current_min - data.modelFilters.bic.min) / (data.modelFilters.bic.max - data.modelFilters.bic.min)) * 100}%`,
                                  right: `${100 - ((data.modelFilters.bic.current_max - data.modelFilters.bic.min) / (data.modelFilters.bic.max - data.modelFilters.bic.min)) * 100}%`
                                }}
                              ></div>
                              <input
                                type="range"
                                min={data.modelFilters.bic.min}
                                max={data.modelFilters.bic.max}
                                step={0.1}
                                value={data.modelFilters.bic.current_min}
                                onChange={(e) => {
                                  const newMin = parseFloat(e.target.value);
                                  if (newMin <= data.modelFilters.bic.current_max) {
                                    handleFilterChange('bic_range', [newMin, data.modelFilters.bic.current_max]);
                                  }
                                }}
                                className="absolute w-full h-1 opacity-0 cursor-pointer z-10"
                              />
                              <input
                                type="range"
                                min={data.modelFilters.bic.min}
                                max={data.modelFilters.bic.max}
                                step={0.1}
                                value={data.modelFilters.bic.current_max}
                                onChange={(e) => {
                                  const newMax = parseFloat(e.target.value);
                                  if (newMax >= data.modelFilters.bic.current_min) {
                                    handleFilterChange('bic_range', [data.modelFilters.bic.current_min, newMax]);
                                  }
                                }}
                                className="absolute w-full h-1 opacity-0 cursor-pointer z-10"
                              />
                              <div 
                                className="absolute w-3 h-3 bg-orange-500 border-2 border-orange-600 rounded-full cursor-pointer shadow-lg transform -translate-x-1/2 -translate-y-1/2 z-20"
                                style={{
                                  left: `${((data.modelFilters.bic.current_min - data.modelFilters.bic.min) / (data.modelFilters.bic.max - data.modelFilters.bic.min)) * 100}%`,
                                  top: '50%'
                                }}
                                onMouseDown={(e) => {
                                  const slider = e.currentTarget.parentElement?.querySelector('input:first-of-type') as HTMLInputElement;
                                  if (slider) {
                                    const rect = slider.getBoundingClientRect();
                                    const handleMouseMove = (moveEvent: MouseEvent) => {
                                      const newValue = ((moveEvent.clientX - rect.left) / rect.width) * (data.modelFilters.bic.max - data.modelFilters.bic.min) + data.modelFilters.bic.min;
                                      const clampedValue = Math.max(data.modelFilters.bic.min, Math.min(data.modelFilters.bic.current_max, newValue));
                                      handleFilterChange('bic_range', [clampedValue, data.modelFilters.bic.current_max]);
                                    };
                                    const handleMouseUp = () => {
                                      document.removeEventListener('mousemove', handleMouseMove);
                                      document.removeEventListener('mouseup', handleMouseUp);
                                    };
                                    document.addEventListener('mousemove', handleMouseMove);
                                    document.addEventListener('mouseup', handleMouseUp);
                                  }
                                }}
                              ></div>
                              <div 
                                className="absolute w-3 h-3 bg-orange-500 border-2 border-orange-600 rounded-full cursor-pointer shadow-lg transform -translate-x-1/2 -translate-y-1/2 z-20"
                                style={{
                                  left: `${((data.modelFilters.bic.current_max - data.modelFilters.bic.min) / (data.modelFilters.bic.max - data.modelFilters.bic.min)) * 100}%`,
                                  top: '50%'
                                }}
                                onMouseDown={(e) => {
                                  const slider = e.currentTarget.parentElement?.querySelector('input:last-of-type') as HTMLInputElement;
                                  if (slider) {
                                    const rect = slider.getBoundingClientRect();
                                    const handleMouseMove = (moveEvent: MouseEvent) => {
                                      const newValue = ((moveEvent.clientX - rect.left) / rect.width) * (data.modelFilters.bic.max - data.modelFilters.bic.min) + data.modelFilters.bic.min;
                                      const clampedValue = Math.min(data.modelFilters.bic.max, Math.max(data.modelFilters.bic.current_min, newValue));
                                      handleFilterChange('bic_range', [data.modelFilters.bic.current_min, clampedValue]);
                                    };
                                    const handleMouseUp = () => {
                                      document.removeEventListener('mousemove', handleMouseMove);
                                      document.removeEventListener('mouseup', handleMouseUp);
                                    };
                                    document.addEventListener('mousemove', handleMouseMove);
                                    document.addEventListener('mouseup', handleMouseUp);
                                  }
                                }}
                              ></div>
                            </div>
                          </div>
                        </div>
              </div>
              </div>
                  )}
                </>
              ) : (
              <div className="bg-white/80 rounded-lg p-4 shadow-sm border border-orange-100/50">
                  <p className="text-sm text-orange-600 text-center">
                    Select a variable to view available filters
                  </p>
              </div>
              )}
                </div>
              )}
              </div>

                        {/* Filter by Variables - Collapsible Section */}
            <div className="mb-4">
              <button
                onClick={() => {
                  setFilterVariablesOpen(!filterVariablesOpen);
                  if (!filterVariablesOpen) {
                    setFilterStatsOpen(false);
                  }
                }}
                className="flex items-center justify-between w-full p-2 text-sm font-medium text-orange-800 bg-orange-50 rounded-lg hover:bg-orange-100 transition-colors"
              >
                <span>Filter by Variables</span>
                <ChevronDown className={`h-4 w-4 transition-transform ${filterVariablesOpen ? 'rotate-180' : ''}`} />
              </button>
              
              {filterVariablesOpen && (
                <div className="space-y-2 mt-2 max-h-[350px] overflow-y-auto pr-2 scrollbar-thin scrollbar-thumb-orange-300 scrollbar-track-orange-100">
                  {Array.isArray(data.selectedVariable) && data.selectedVariable.length > 0 && data.selectedMethod ? (
                    <>
                      {/* Per-Variable Method Filters */}
                      {data.selectedVariable.map((variable: string, index: number) => {
                        const variableFilterKey = `variable_${variable}`;
                        const variableFilter = data.modelFilters[variableFilterKey];
                        
                        return (
                          <div key={variable} className="bg-white/80 rounded-lg p-3 shadow-sm border border-orange-100/50">
                            <label className="text-sm font-medium text-orange-800 mb-2 block">
                              {variable} - {data.selectedMethod.charAt(0).toUpperCase() + data.selectedMethod.slice(1)} Range
                            </label>
                            <div className="space-y-2">
                              <div className="flex justify-between text-xs text-black mb-2">
                                <span>Min: {variableFilter?.current_min?.toFixed(3) || '0.000'}</span>
                                <span>Max: {variableFilter?.current_max?.toFixed(3) || '0.000'}</span>
                              </div>
                              <div className="flex-1">
                                <div className="relative mb-2">
                                  <div className="w-full h-1 bg-gray-300 rounded-lg relative">
                                    <div 
                                      className="absolute h-1 bg-orange-500 rounded-lg"
                                      style={{
                                        left: variableFilter ? 
                                          `${((variableFilter.current_min - variableFilter.min) / (variableFilter.max - variableFilter.min)) * 100}%` : '0%',
                                        right: variableFilter ? 
                                          `${100 - ((variableFilter.current_max - variableFilter.min) / (variableFilter.max - variableFilter.min)) * 100}%` : '100%'
                                      }}
                                    ></div>
                                    <input
                                      type="range"
                                      min={variableFilter?.min || 0}
                                      max={variableFilter?.max || 100}
                                      step={0.001}
                                      value={variableFilter?.current_min || 0}
                                      onChange={(e) => {
                                        const newMin = parseFloat(e.target.value);
                                        if (variableFilter && newMin <= variableFilter.current_max) {
                                          handleVariableFilterChange(variable, 'range', [newMin, variableFilter.current_max]);
                                        }
                                      }}
                                      className="absolute w-full h-1 opacity-0 cursor-pointer z-10"
                                    />
                                    <input
                                      type="range"
                                      min={variableFilter?.min || 0}
                                      max={variableFilter?.max || 100}
                                      step={0.001}
                                      value={variableFilter?.current_max || 100}
                                      onChange={(e) => {
                                        const newMax = parseFloat(e.target.value);
                                        if (variableFilter && newMax >= variableFilter.current_min) {
                                          handleVariableFilterChange(variable, 'range', [variableFilter.current_min, newMax]);
                                        }
                                      }}
                                      className="absolute w-full h-1 opacity-0 cursor-pointer z-10"
                                    />
                                    <div 
                                      className="absolute w-3 h-3 bg-orange-500 border-2 border-orange-600 rounded-full cursor-pointer shadow-lg transform -translate-x-1/2 -translate-y-1/2 z-20"
                                      style={{
                                        left: variableFilter ? 
                                          `${((variableFilter.current_min - variableFilter.min) / (variableFilter.max - variableFilter.min)) * 100}%` : '0%',
                                        top: '50%'
                                      }}
                                      onMouseDown={(e) => {
                                        if (variableFilter) {
                                          const slider = e.currentTarget.parentElement?.querySelector('input:first-of-type') as HTMLInputElement;
                                          if (slider) {
                                            const rect = slider.getBoundingClientRect();
                                            const handleMouseMove = (moveEvent: MouseEvent) => {
                                              const newValue = ((moveEvent.clientX - rect.left) / rect.width) * (variableFilter.max - variableFilter.min) + variableFilter.min;
                                              const clampedValue = Math.max(variableFilter.min, Math.min(variableFilter.current_max, newValue));
                                              handleVariableFilterChange(variable, 'range', [clampedValue, variableFilter.current_max]);
                                            };
                                            const handleMouseUp = () => {
                                              document.removeEventListener('mousemove', handleMouseMove);
                                              document.removeEventListener('mouseup', handleMouseUp);
                                            };
                                            document.addEventListener('mousemove', handleMouseMove);
                                            document.addEventListener('mouseup', handleMouseUp);
                                          }
                                        }
                                      }}
                                    ></div>
                                    <div 
                                      className="absolute w-3 h-3 bg-orange-500 border-2 border-orange-600 rounded-full cursor-pointer shadow-lg transform -translate-x-1/2 -translate-y-1/2 z-20"
                                      style={{
                                        left: variableFilter ? 
                                          `${((variableFilter.current_max - variableFilter.min) / (variableFilter.max - variableFilter.min)) * 100}%` : '100%',
                                        top: '50%'
                                      }}
                                      onMouseDown={(e) => {
                                        if (variableFilter) {
                                          const slider = e.currentTarget.parentElement?.querySelector('input:last-of-type') as HTMLInputElement;
                                          if (slider) {
                                            const rect = slider.getBoundingClientRect();
                                            const handleMouseMove = (moveEvent: MouseEvent) => {
                                              const newValue = ((moveEvent.clientX - rect.left) / rect.width) * (variableFilter.max - variableFilter.min) + variableFilter.min;
                                              const clampedValue = Math.min(variableFilter.max, Math.max(variableFilter.current_min, newValue));
                                              handleVariableFilterChange(variable, 'range', [variableFilter.current_min, clampedValue]);
                                            };
                                            const handleMouseUp = () => {
                                              document.removeEventListener('mousemove', handleMouseMove);
                                              document.removeEventListener('mouseup', handleMouseUp);
                                            };
                                            document.addEventListener('mousemove', handleMouseMove);
                                            document.addEventListener('mouseup', handleMouseUp);
                                          }
                                        }
                                      }}
                                    ></div>
                                  </div>
                                </div>
                              </div>
                            </div>
                          </div>
                        );
                      })}
                    </>
                  ) : (
                    <div className="bg-white/80 rounded-lg p-4 shadow-sm border border-orange-100/50">
                      <p className="text-sm text-orange-600 text-center">
                        Select variables and method to view variable filters
                      </p>
                    </div>
                  )}
                </div>
              )}
            </div>
          </div>
        </div>

        {/* Separator Line */}
        <div className="flex items-center my-8">
          <div className="flex-1 h-px bg-gradient-to-r from-transparent via-orange-300 to-transparent"></div>
          <span className="px-4 text-sm text-orange-600 font-medium">Model Performance Analysis</span>
          <div className="flex-1 h-px bg-gradient-to-r from-transparent via-orange-300 to-transparent"></div>
        </div>

        {/* Model Performance Section - Full Width */}
        <div className="bg-white/80 backdrop-blur-sm rounded-xl border border-orange-200/30 p-6 shadow-lg">
          <div className="mb-6">
            <h3 className="text-lg font-semibold text-orange-900 mb-4">Model Performance</h3>
                          <Select value={data.selectedModel} onValueChange={(value) => {
                handleDataChange({ selectedModel: value });
                if (value && value !== 'no-models' && data.selectedDataset && data.selectedCombinationId) {
                  if (value === 'Ensemble') {
                    // Use ensemble data for all calculations
                    if (data.weightedEnsembleData && data.weightedEnsembleData.length > 0) {
                      const ensemble = data.weightedEnsembleData[0];
                      
                      // Set ensemble performance metrics
                      const ensemblePerformance = [
                        { name: 'MAPE Train', value: ensemble.weighted_metrics?.mape_train || 0 },
                        { name: 'MAPE Test', value: ensemble.weighted_metrics?.mape_test || 0 },
                        { name: 'R² Train', value: ensemble.weighted_metrics?.r2_train || 0 },
                        { name: 'R² Test', value: ensemble.weighted_metrics?.r2_test || 0 },
                        { name: 'AIC', value: ensemble.weighted_metrics?.aic || 0 },
                        { name: 'BIC', value: ensemble.weighted_metrics?.bic || 0 }
                      ];
                      handleDataChange({ selectedModelPerformance: ensemblePerformance });
                      
                      // Calculate actual vs predicted using ensemble betas but same source file concept
                      fetchActualVsPredictedEnsemble(data.selectedCombinationId);
                      
                      // Fetch ensemble contribution data
                      fetchModelContributionEnsemble(data.selectedCombinationId, data.selectedDataset);
                      
                      // Calculate YoY using ensemble betas but same source file concept
                      fetchYoYDataEnsemble(data.selectedCombinationId);
                    }
                  } else {
                    // Use individual model data
                    fetchModelPerformance(value, data.selectedCombinationId, data.selectedDataset);
                    fetchActualVsPredicted(value, data.selectedCombinationId);
                    fetchModelContribution(value, data.selectedCombinationId, data.selectedDataset);
                    fetchYoYData(value, data.selectedCombinationId);
                    fetchWeightedEnsembleData(data.selectedDataset, data.selectedCombinationId);
                  }
                }
              }}>
              <SelectTrigger className="w-full max-w-md border-orange-200 focus:border-orange-500 focus:ring-orange-200">
                <SelectValue placeholder="Select Model to View Model Performance" />
              </SelectTrigger>
              <SelectContent className="border-orange-200">
                {data.elasticityData && data.elasticityData.length > 0 ? (
                  <>
                    {/* Ensemble option when ensemble method is enabled */}
                    {data.ensembleMethod && data.weightedEnsembleData && data.weightedEnsembleData.length > 0 && (
                      <SelectItem key="ensemble" value="Ensemble">
                        Ensemble
                      </SelectItem>
                    )}
                    {data.elasticityData.map((model: any) => (
                      <SelectItem key={model.name} value={model.name}>
                        {model.name}
                      </SelectItem>
                    ))}
                  </>
                ) : (
                  <SelectItem value="no-models" disabled>
                    No models available - select a variable and apply filters first
                  </SelectItem>
                )}
              </SelectContent>
            </Select>
          </div>

          {/* Performance Charts Grid */}
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-2 gap-4 mb-6">
            {/* Performance Metrics Table */}
            <div className="bg-white rounded-lg p-4 shadow-sm border border-orange-100/50 hover:shadow-md transition-all duration-200">
              <h5 className="text-sm font-medium text-orange-800 mb-3">
                Performance
              </h5>
              {data.selectedModelPerformance && data.selectedModelPerformance.length > 0 ? (
                <div className="space-y-2">
                  {data.selectedModelPerformance.map((metric: any, index: number) => (
                    <div key={index} className="flex justify-between items-center py-1 border-b border-orange-100/50 last:border-b-0">
                      <span className="text-xs text-orange-700 font-medium">{metric.name}</span>
                      <span className="text-xs text-orange-900 font-semibold">
                        {typeof metric.value === 'number' ? metric.value.toFixed(2) : metric.value}
                      </span>
                    </div>
                  ))}
                </div>
              ) : (
                <div className="h-[150px] flex items-center justify-center">
                  <p className="text-xs text-orange-600 text-center">
                    {data.selectedModel && data.selectedModel !== 'no-models' 
                      ? 'Loading performance metrics...' 
                      : 'Select a model to view performance metrics'
                    }
                  </p>
                </div>
              )}
            </div>

            {/* Predicted vs Actual */}
            <div className="bg-white rounded-lg p-4 shadow-sm border border-orange-100/50 hover:shadow-md transition-all duration-200">
              <h5 className="text-sm font-medium text-orange-800 mb-3">Predicted vs Actual</h5>
              {data.actualVsPredictedData && data.actualVsPredictedData.length > 0 ? (
                <div className="w-full h-[300px]">
                  <RechartsChartRenderer
                    type={predictedVsActualChartType}
                    data={data.actualVsPredictedData}
                    xField="actual"
                    yField="predicted"
                    xAxisLabel="Actual"
                    yAxisLabel="Predicted"
                    theme={predictedVsActualChartTheme}
                    enableScroll={false}
                    width="100%"
                    height={300}
                    showDataLabels={predictedVsActualChartDataLabels}
                    showLegend={predictedVsActualChartType === 'pie_chart'}
                    sortOrder={predictedVsActualChartSortOrder}
                    onThemeChange={handlePredictedVsActualChartThemeChange}
                    onChartTypeChange={handlePredictedVsActualChartTypeChange}
                    onDataLabelsToggle={handlePredictedVsActualChartDataLabelsChange}
                    onSortChange={handlePredictedVsActualChartSortOrderChange}
                  />
                </div>
              ) : (
                <div className="h-[300px] flex items-center justify-center">
                  <p className="text-xs text-orange-600 text-center">
                    {data.selectedModel && data.selectedModel !== 'no-models' 
                      ? 'Loading actual vs predicted data...' 
                      : 'Select a model to view actual vs predicted'
                    }
                  </p>
                </div>
              )}
            </div>

            {/* Contribution Chart */}
            <div className="bg-white rounded-lg p-4 shadow-sm border border-orange-100/50 hover:shadow-md transition-all duration-200">
                <h5 className="text-sm font-medium text-orange-800 mb-3">
                  Contribution
                </h5>
                {data.contributionData && data.contributionData.length > 0 ? (
                  <div className="w-full h-[300px]">
                    <RechartsChartRenderer
                      type={contributionChartType}
                      data={data.contributionData}
                      xField="name"
                      yField="value"
                      xAxisLabel="Variable"
                      yAxisLabel="Contribution"
                      theme={contributionChartTheme}
                      enableScroll={false}
                      width="100%"
                      height={300}
                      showDataLabels={contributionChartDataLabels}
                      showLegend={contributionChartType === 'pie_chart'}
                      sortOrder={contributionChartSortOrder}
                      onThemeChange={handleContributionChartThemeChange}
                      onChartTypeChange={handleContributionChartTypeChange}
                      onDataLabelsToggle={handleContributionChartDataLabelsChange}
                      onSortChange={handleContributionChartSortOrderChange}
                    />
                  </div>
                ) : (
                  <div className="h-[300px] flex items-center justify-center">
                    <p className="text-xs text-orange-600 text-center">
                      {data.selectedModel && data.selectedModel !== 'no-models' 
                        ? 'Loading contribution data...' 
                        : 'Select a model to view contribution'
                      }
                    </p>
                  </div>
                )}
            </div>

            {/* Y-O-Y Growth */}
            <div className="bg-white rounded-lg p-4 shadow-sm border border-orange-100/50 hover:shadow-md transition-all duration-200">
              <h5 className="text-sm font-medium text-orange-800 mb-3">Y-O-Y Growth</h5>
              {data.yoyData && data.yoyData.length > 0 ? (
                <div className="w-full h-[300px]">
                  <RechartsChartRenderer
                    type={yoyChartType}
                    data={data.yoyData}
                    xField="name"
                    yField="value"
                    xAxisLabel="Period"
                    yAxisLabel="Growth Value"
                    theme={yoyChartTheme}
                    enableScroll={false}
                    width="100%"
                    height={300}
                    showDataLabels={yoyChartDataLabels}
                    showLegend={yoyChartType === 'pie_chart'}
                    sortOrder={yoyChartSortOrder}
                    onThemeChange={handleYoyChartThemeChange}
                    onChartTypeChange={handleYoyChartTypeChange}
                    onDataLabelsToggle={handleYoyChartDataLabelsChange}
                    onSortChange={handleYoyChartSortOrderChange}
                  />
                </div>
              ) : (
                <div className="h-[300px] flex items-center justify-center">
                  <p className="text-xs text-orange-600 text-center">
                    {data.selectedModel && data.selectedModel !== 'no-models' 
                      ? 'Loading YoY data...' 
                      : 'Select a model to view YoY growth'
                    }
                  </p>
                </div>
              )}
            </div>




          </div>

          {/* Save Results */}
          <div className="pt-4 border-t border-orange-200/50">
            <Button 
              onClick={handleSaveModel}
              disabled={isSaving || !data.selectedModel || data.selectedModel === 'Select Model to View Model Performance'}
              className="bg-gradient-to-r from-orange-500 to-orange-600 hover:from-orange-600 hover:to-orange-700 text-white shadow-lg hover:shadow-xl transition-all duration-200 hover:scale-105 disabled:opacity-50 disabled:cursor-not-allowed"
            >
              <Save className="h-4 w-4 mr-2" />
              {isSaving ? 'Saving...' : 'Save Results'}
            </Button>
          </div>

          {/* Combination Status */}
          {data.selectedDataset && (
            <div className="pt-4 border-t border-orange-200/50">
              <div className="flex items-center justify-between mb-3">
                <div className="flex items-center gap-2">
                  <h5 className="text-sm font-medium text-orange-800">Combination Save Status</h5>
                  {combinationStatus && !combinationStatusMinimized && (
                    <div className="flex items-center gap-2 text-xs">
                      <span className="text-green-600 font-medium">
                        {combinationStatus.saved_count} saved
                      </span>
                      <span className="text-orange-600 font-medium">
                        {combinationStatus.pending_count} pending
                      </span>
                    </div>
                  )}
                  {combinationStatus && combinationStatusMinimized && (
                    <div className="flex items-center gap-2 text-xs">
                      <Badge variant="secondary" className="bg-green-200 text-green-800">
                        {combinationStatus.saved_count} saved
                      </Badge>
                      <Badge variant="secondary" className="bg-orange-200 text-orange-800">
                        {combinationStatus.pending_count} pending
                      </Badge>
                    </div>
                  )}
                </div>
                <div className="flex items-center gap-2">
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={fetchCombinationStatus}
                    disabled={isLoadingCombinationStatus}
                    className="text-xs"
                  >
                    {isLoadingCombinationStatus ? 'Loading...' : 'Refresh'}
                  </Button>
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => {
                      const newMinimized = !combinationStatusMinimized;
                      setCombinationStatusMinimized(newMinimized);
                      handleDataChange({ combinationStatusMinimized: newMinimized });
                    }}
                    className="text-xs p-1 h-6 w-6"
                  >
                    {combinationStatusMinimized ? (
                      <ChevronDown className="h-3 w-3" />
                    ) : (
                      <ChevronDown className="h-3 w-3 rotate-180" />
                    )}
                  </Button>
                </div>
              </div>
              
              {!combinationStatusMinimized && (
                <>
                  {isLoadingCombinationStatus ? (
                    <div className="text-center py-4">
                      <p className="text-xs text-orange-600">Loading combination status...</p>
                    </div>
                  ) : combinationStatus ? (
                <div className="space-y-3">
                  {/* Progress Bar */}
                  <div className="w-full bg-orange-100 rounded-full h-2">
                    <div 
                      className="bg-orange-500 h-2 rounded-full transition-all duration-300"
                      style={{ width: `${combinationStatus.completion_percentage}%` }}
                    ></div>
                  </div>
                  

                  
                  
                  {/* Combination Count Summary */}
                  <div className="text-center">
                    <div className="text-lg font-medium text-orange-600">
                      {combinationStatus.saved_count} of {combinationStatus.total_combinations} combinations saved
                    </div>
                  </div>
                  
                  {/* Detailed Lists */}
                  {combinationStatus.saved_combinations.length > 0 && (
                    <div className="bg-green-50 border border-green-200 rounded-lg p-3">
                      <div className="font-medium text-green-800 mb-2">Saved Combinations:</div>
                      <div className="flex flex-wrap gap-1">
                        {combinationStatus.saved_combinations.slice(0, 10).map((combo: string, index: number) => (
                          <Badge key={index} variant="secondary" className="text-xs bg-green-200 text-green-800">
                            {combo}
                          </Badge>
                        ))}
                        {combinationStatus.saved_combinations.length > 10 && (
                          <Badge variant="secondary" className="text-xs bg-green-200 text-green-800">
                            +{combinationStatus.saved_combinations.length - 10} more
                          </Badge>
                        )}
                      </div>
                    </div>
                  )}
                  
                  {combinationStatus.pending_combinations.length > 0 && (
                    <div className="bg-orange-50 border border-orange-200 rounded-lg p-3">
                      <div className="font-medium text-orange-800 mb-2">Pending Combinations:</div>
                      <div className="flex flex-wrap gap-1">
                        {combinationStatus.pending_combinations.slice(0, 10).map((combo: string, index: number) => (
                          <Badge key={index} variant="secondary" className="text-xs bg-orange-200 text-orange-800">
                            {combo}
                          </Badge>
                        ))}
                        {combinationStatus.pending_combinations.length > 10 && (
                          <Badge variant="secondary" className="text-xs bg-orange-200 text-orange-800">
                            +{combinationStatus.pending_combinations.length - 10} more
                          </Badge>
                        )}
                      </div>
                    </div>
                  )}
                  
                  {combinationStatus.note && (
                    <div className="text-xs text-orange-600 bg-orange-50 border border-orange-200 rounded-lg p-2">
                      Note: {combinationStatus.note}
                    </div>
                  )}
                </div>
              ) : (
                <div className="text-center py-4">
                  <p className="text-xs text-orange-600">
                    No combination status available. Select a dataset and save a model to see progress.
                  </p>
                </div>
              )}
                </>
              )}
            </div>
          )}
        </div>

      </div>
    </div>
  );
};

export default SelectModelsFeatureCanvas;