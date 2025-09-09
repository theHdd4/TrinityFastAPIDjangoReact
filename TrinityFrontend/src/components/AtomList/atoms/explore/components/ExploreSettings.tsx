import React, { useState, useEffect } from 'react';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Calendar } from '@/components/ui/calendar';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Checkbox } from '@/components/ui/checkbox';
import { Switch } from '@/components/ui/switch';
import { DateRange } from 'react-day-picker';
import { EXPLORE_API } from '@/lib/api';
import { CalendarIcon, Database, BarChart3, Info, Filter, ChevronDown, ChevronUp, ChevronRight, Plus, Minus } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Label } from '@/components/ui/label';
import { format } from 'date-fns';
import { EnhancedCalendar } from '@/components/ui/enhanced-calendar';

const defaultGraphLayout = { numberOfGraphsInRow: 0, rows: 1 };

interface DateRangeData {
  min_date: string;
  max_date: string;
  row_count: number;
}

interface ColumnSummary {
  column: string;
  data_type: string;
  unique_count: number;
  unique_values: string[];
  is_numerical?: boolean;
}

interface ColumnClassifierConfig {
  identifiers: string[];
  measures: string[];
  dimensions: { [key: string]: string[] };
  client_name?: string;
  app_name?: string;
  project_name?: string;
}

const ExploreSettings = ({ data, settings, onDataChange, onApply }) => {
  const [dateRange, setDateRange] = useState<DateRange>({
    from: new Date('2020-07-01'),
    to: new Date('2025-03-30'),
  });
  const [availableDateRange, setAvailableDateRange] = useState<DateRangeData | null>(null);
  const [graphLayout, setGraphLayout] = useState(data.graphLayout || defaultGraphLayout);
  const [fromOpen, setFromOpen] = useState(false);
  const [toOpen, setToOpen] = useState(false);
  const [isLoadingDateRange, setIsLoadingDateRange] = useState(false);
  const [columnNames, setColumnNames] = useState<string[]>([]);
  const [isLoadingColumns, setIsLoadingColumns] = useState(false);
  const [dateFilters, setDateFilters] = useState<{ column: string; from: Date; to: Date }[]>([]);
  
  // Column classifier related state
  const [columnClassifierConfig, setColumnClassifierConfig] = useState<ColumnClassifierConfig | null>(null);
  const [availableDimensions, setAvailableDimensions] = useState<string[]>([]);
  const [availableMeasures, setAvailableMeasures] = useState<string[]>([]);
  const [availableIdentifiers, setAvailableIdentifiers] = useState<string[]>([]);
  const [usingColumnClassifier, setUsingColumnClassifier] = useState(false);
  const [isLoadingClassifier, setIsLoadingClassifier] = useState(false);

  // Dimensions & Identifiers selection state
  const [selectedDimensions, setSelectedDimensions] = useState<string[]>([]);
  const [selectedIdentifiers, setSelectedIdentifiers] = useState<{ [dimensionId: string]: string[] }>({});
  const [expandedDimensions, setExpandedDimensions] = useState<string[]>([]);

  // Settings panel filter selection state
  const [showFilterSelector, setShowFilterSelector] = useState(false);
  const [selectedFilterColumns, setSelectedFilterColumns] = useState<string[]>([]);
  
  // AI filter integration state
  const [aiFilterWorkflow, setAiFilterWorkflow] = useState<any>(null);
  const [aiFilterProcessing, setAiFilterProcessing] = useState(false);

  // Function to sync AI filter changes with manual selection
  const syncAiFiltersWithManual = (aiWorkflow: any) => {
    console.log(`🔍 SYNCING AI FILTERS WITH MANUAL SELECTION:`, aiWorkflow);
    
    if (aiWorkflow.selected_filter_columns && Array.isArray(aiWorkflow.selected_filter_columns)) {
      // Update selected filter columns to match AI selection
      setSelectedFilterColumns(aiWorkflow.selected_filter_columns);
      
      // Update dimensions and identifiers to include AI-selected columns
      const currentConfig = data.columnClassifierConfig || { identifiers: [], measures: [], dimensions: {} };
      const newDims = { ...currentConfig.dimensions };
      const newIdentifiers = { ...(data.selectedIdentifiers || {}) };
      
      aiWorkflow.selected_filter_columns.forEach(col => {
        newDims[col] = [col];
        newIdentifiers[col] = [col];
      });
      
      const updatedConfig = { ...currentConfig, dimensions: newDims };
      
      // Update parent data
      onDataChange({
        columnClassifierConfig: updatedConfig,
        selectedIdentifiers: newIdentifiers,
        dimensions: Array.from(new Set([...(data.dimensions || []), ...aiWorkflow.selected_filter_columns]))
      });
      
      console.log(`🔍 AI FILTERS SYNCED: Updated dimensions and identifiers`);
    }
  };

  // Prevent rendering if basic data is not available
  if (!data || !settings) {
    return (
      <div className="space-y-6 p-4">
        <Card className="p-6">
          <div className="text-center text-gray-500">
            <Database className="w-12 h-12 mx-auto mb-4 text-gray-400" />
            <p>No data or settings available</p>
          </div>
        </Card>
      </div>
    );
  }

  // Initialize dimensions and measures from data
  useEffect(() => {
    if (data.columnClassifierConfig) {
      setColumnClassifierConfig(data.columnClassifierConfig);
      setUsingColumnClassifier(true);
      
      // Set available dimensions and measures
      if (data.columnClassifierConfig.dimensions) {
        const dims = Object.keys(data.columnClassifierConfig.dimensions);
        setAvailableDimensions(dims);
        setSelectedDimensions(dims); // Auto-select all dimensions
      }
      
      if (data.columnClassifierConfig.measures) {
        setAvailableMeasures(data.columnClassifierConfig.measures);
      }
      
      if (data.columnClassifierConfig.identifiers) {
        setAvailableIdentifiers(data.columnClassifierConfig.identifiers);
      }
    } else if (data.dimensions && data.measures) {
      // Fallback to legacy data structure
      setUsingColumnClassifier(false);
    }
  }, [data, data?.columnClassifierConfig]);

  // AI Filter Workflow Integration
  useEffect(() => {
    console.log(`🔍 AI FILTER WORKFLOW TRIGGERED:`, {
      hasAiConfig: !!data.aiConfig,
      hasChartJson: !!(data.aiConfig && data.aiConfig.chart_json),
      aiFilterUpdateTime: data.aiFilterUpdateTime,
      timestamp: new Date().toISOString()
    });
    
    // Check if AI has provided filter workflow configuration
    if (data.aiConfig && data.aiConfig.chart_json) {
      const charts = Array.isArray(data.aiConfig.chart_json) ? data.aiConfig.chart_json : [data.aiConfig.chart_json];
      
      // Look for UI filter workflow OR direct filters in any chart
      let workflowFound = false;
      charts.forEach((chart, index) => {
        // Check for explicit UI filter workflow first
        if (chart.ui_filter_workflow) {
          console.log(`🔍 AI FILTER WORKFLOW DETECTED - Chart ${index + 1}:`, chart.ui_filter_workflow);
          setAiFilterWorkflow(chart.ui_filter_workflow);
          setAiFilterProcessing(true);
          workflowFound = true;
          
          // Process the AI filter workflow
          const workflow = chart.ui_filter_workflow;
          
          // Step 1: Enable filter selector if requested
          if (workflow.enable_filter_selector) {
            console.log(`🔍 AI FILTER: Enabling filter selector`);
            setShowFilterSelector(true);
          }
          
          // Step 2 & 3: Sync AI filter workflow with manual selection
          syncAiFiltersWithManual(workflow);
        }
        // Check for direct filters object (fallback for when ui_filter_workflow is not present)
        else if (chart.filters && typeof chart.filters === 'object' && Object.keys(chart.filters).length > 0) {
          console.log(`🔍 AI DIRECT FILTERS DETECTED - Chart ${index + 1}:`, chart.filters);
          
          // Create a synthetic workflow from direct filters
          const syntheticWorkflow = {
            enable_filter_selector: true,
            selected_filter_columns: Object.keys(chart.filters),
            filter_values: chart.filters,
            auto_apply_filters: true
          };
          
          setAiFilterWorkflow(syntheticWorkflow);
          setAiFilterProcessing(true);
          workflowFound = true;
          
          // Enable filter selector
          console.log(`🔍 AI FILTER: Enabling filter selector for direct filters`);
          setShowFilterSelector(true);
          
          // Sync with manual selection
          syncAiFiltersWithManual(syntheticWorkflow);
        }
      });
      
      if (!workflowFound) {
        console.log(`🔍 AI FILTER: No filters found in AI response`);
      }
    }
  }, [data.aiConfig, data.columnClassifierConfig, data.selectedIdentifiers, data.dimensions, data.aiFilterUpdateTime, onDataChange]);

  // Keep local graph layout in sync with external data
  useEffect(() => {
    setGraphLayout(data.graphLayout || defaultGraphLayout);
  }, [data.graphLayout]);

  // Automatically populate selectedIdentifiers on component load if not already set
  useEffect(() => {
    if (columnClassifierConfig?.dimensions && 
        (!selectedIdentifiers || Object.keys(selectedIdentifiers).length === 0)) {
      const allIdentifiers: { [dimensionId: string]: string[] } = {};
      Object.keys(columnClassifierConfig.dimensions).forEach(dimensionId => {
        allIdentifiers[dimensionId] = columnClassifierConfig.dimensions[dimensionId] || [];
      });
      setSelectedIdentifiers(allIdentifiers);
    }
  }, [columnClassifierConfig?.dimensions, selectedIdentifiers]);

  // Fetch column names if data source is available
  useEffect(() => {
    if (data?.dataframe && !columnNames.length) {
      fetchColumnNames();
    }
  }, [data?.dataframe, columnNames.length]);

  // Fetch date range if data source is available
  useEffect(() => {
    if (data?.dataframe && !availableDateRange) {
      fetchDateRange();
    }
  }, [data?.dataframe, availableDateRange]);

  const fetchColumnNames = async () => {
    if (!data?.dataframe) return;
    
    setIsLoadingColumns(true);
    try {
      const response = await fetch(`${EXPLORE_API}/columns?object_name=${encodeURIComponent(data.dataframe)}`);
      if (response.ok) {
        const result = await response.json();
        if (result.columns) {
          setColumnNames(result.columns);
        }
      }
    } catch (error) {
    } finally {
      setIsLoadingColumns(false);
    }
  };

  const fetchDateRange = async () => {
    if (!data?.dataframe) return;
    
    setIsLoadingDateRange(true);
    try {
      const response = await fetch(`${EXPLORE_API}/get-date-range?data_source=${encodeURIComponent(data.dataframe)}`);
      if (response.ok) {
        const result = await response.json();
        if (result.status === 'success' && result.date_range) {
          setAvailableDateRange(result.date_range);
        }
      }
    } catch (error) {
    } finally {
      setIsLoadingDateRange(false);
    }
  };

  const existingDims = Object.values(data.columnClassifierConfig?.dimensions || {})
    .flat();
  const categoricalColumns = Array.isArray(data.columnSummary)
    ? data.columnSummary
        .filter((col: any) => !col.is_numerical && !existingDims.includes(col.column))
        .map((col: any) => col.column)
    : [];

  const handleAddFilters = () => {
    if (selectedFilterColumns.length === 0) return;
    const currentConfig = data.columnClassifierConfig || { identifiers: [], measures: [], dimensions: {} };
    const newDims = { ...currentConfig.dimensions };
    selectedFilterColumns.forEach(col => {
      newDims[col] = [col];
    });
    const updatedConfig = { ...currentConfig, dimensions: newDims };
    const newSelectedIdentifiers = {
      ...(data.selectedIdentifiers || {}),
      ...selectedFilterColumns.reduce((acc, col) => ({ ...acc, [col]: [col] }), {})
    };

    // 🔍 CONSOLE LOGGING: Manual filter addition
    console.log(`🔍 MANUAL FILTER ADDITION:`);
    console.log(`   Selected columns: ${selectedFilterColumns.join(', ')}`);
    console.log(`   AI workflow active: ${aiFilterProcessing}`);
    if (aiFilterWorkflow) {
      console.log(`   AI workflow:`, aiFilterWorkflow);
    }

    // Update parent data without resetting applied state so filters appear immediately
    onDataChange({
      columnClassifierConfig: updatedConfig,
      selectedIdentifiers: newSelectedIdentifiers,
      dimensions: Array.from(new Set([...(data.dimensions || []), ...selectedFilterColumns]))
    });

    // Keep local dimension and identifier state in sync
    setSelectedDimensions(prev =>
      Array.from(new Set([...prev, ...selectedFilterColumns]))
    );
    setSelectedIdentifiers(prev => ({
      ...prev,
      ...selectedFilterColumns.reduce((acc, col) => ({ ...acc, [col]: [col] }), {})
    }));

    // 🔍 CONSOLE LOGGING: Filter state synchronization
    console.log(`🔍 FILTER STATE SYNCHRONIZATION:`);
    console.log(`   Updated dimensions: ${Array.from(new Set([...(data.dimensions || []), ...selectedFilterColumns])).join(', ')}`);
    console.log(`   Updated identifiers:`, newSelectedIdentifiers);

    setSelectedFilterColumns([]);
    setShowFilterSelector(false);
  };

  // Handle apply button click
  const handleApply = () => {
    // Update the data with selected dimensions and their identifiers
    const updatedData = {
      dimensions: selectedDimensions,
      measures: availableMeasures,
      graphLayout: graphLayout,
      columnClassifierConfig: {
        ...data.columnClassifierConfig,
        dimensions: selectedIdentifiers
      },
      selectedIdentifiers: selectedIdentifiers, // Add selectedIdentifiers at the top level
      applied: true // Mark as applied so charts show the filters
    };

    onDataChange(updatedData);
    onApply();
  };

  const handleNumberOfChartsChange = (delta: number) => {
    const newNumber = Math.max(1, Math.min(2, graphLayout.numberOfGraphsInRow + delta));
    if (newNumber === graphLayout.numberOfGraphsInRow) return;

    const newGraphLayout = {
      numberOfGraphsInRow: newNumber,
      rows: 1
    };
    setGraphLayout(newGraphLayout);

    let updatedSelectedIdentifiers = { ...selectedIdentifiers };
    if (columnClassifierConfig?.dimensions) {
      Object.keys(columnClassifierConfig.dimensions).forEach(dimensionId => {
        updatedSelectedIdentifiers[dimensionId] = columnClassifierConfig.dimensions[dimensionId] || [];
      });
      setSelectedIdentifiers(updatedSelectedIdentifiers);
    }

    onDataChange({
      graphLayout: newGraphLayout,
      selectedIdentifiers: updatedSelectedIdentifiers,
      applied: false
    });
  };

  // Don't show loading state - allow rendering without column classifier config
  // The component will show fallback content when columnClassifierConfig is null

  return (
    <div className="space-y-6 p-4">
      <Card className="p-6 space-y-6">
        {/* Chart Configuration Section */}
        <div className="space-y-4">
          <div className="flex items-center space-x-2">
            <BarChart3 className="w-5 h-5 text-blue-600" />
            <h3 className="text-base font-semibold text-gray-900">Chart Configuration</h3>
          </div>

          <div className="space-y-3">
            <Label className="text-sm font-medium text-gray-700">Number of Charts (Max 2)</Label>
            <div className="flex items-center gap-2 mt-1">
              <Button
                variant="outline"
                size="sm"
                onClick={() => handleNumberOfChartsChange(-1)}
                disabled={graphLayout.numberOfGraphsInRow <= 1}
              >
                <Minus className="w-3 h-3" />
              </Button>
              <span className="w-8 text-center font-medium">{graphLayout.numberOfGraphsInRow}</span>
              <Button
                variant="outline"
                size="sm"
                onClick={() => handleNumberOfChartsChange(1)}
                disabled={graphLayout.numberOfGraphsInRow >= 2}
              >
                <Plus className="w-3 h-3" />
              </Button>
            </div>
          </div>
        </div>
        {/* Add Filter Toggle */}
        <div className="space-y-4">
          <div className="flex items-center space-x-2">
            <Filter className="w-5 h-5 text-blue-600" />
            <h3 className="text-base font-semibold text-gray-900">Add Filters</h3>
            {aiFilterProcessing && (
              <div className="flex items-center space-x-1 text-sm text-green-600">
                <div className="w-2 h-2 bg-green-500 rounded-full animate-pulse"></div>
                <span>AI Processing</span>
              </div>
            )}
          </div>
          <div className="flex items-center space-x-2">
            <Switch
              id="show-filter-selector"
              checked={showFilterSelector}
              onCheckedChange={setShowFilterSelector}
            />
            <Label htmlFor="show-filter-selector">Select Additional Filters</Label>
          </div>
          {showFilterSelector && (
            <div className="space-y-2">
              {aiFilterWorkflow && (
                <div className="p-3 bg-green-50 border border-green-200 rounded-lg">
                  <div className="flex items-center space-x-2 text-sm text-green-700">
                    <div className="w-2 h-2 bg-green-500 rounded-full animate-pulse"></div>
                    <span className="font-medium">AI Filter Workflow Active</span>
                  </div>
                  <div className="mt-2 text-xs text-green-600">
                    {aiFilterWorkflow.selected_filter_columns && aiFilterWorkflow.selected_filter_columns.length > 0 ? (
                      <div>
                        <div>✅ Selected columns: {aiFilterWorkflow.selected_filter_columns.join(', ')}</div>
                        {aiFilterWorkflow.filter_values && Object.keys(aiFilterWorkflow.filter_values).length > 0 && (
                          <div>✅ Filter values: {Object.entries(aiFilterWorkflow.filter_values).map(([col, vals]) => 
                            `${col}: ${Array.isArray(vals) ? vals.join(', ') : 'All'}`
                          ).join('; ')}</div>
                        )}
                        <div className="mt-1 text-green-500">🔄 AI filters are now integrated with manual selection</div>
                      </div>
                    ) : (
                      <div>No specific filter columns selected by AI</div>
                    )}
                  </div>
                </div>
              )}
              <div className="max-h-40 overflow-y-auto space-y-2">
                {categoricalColumns.map(col => (
                  <div key={col} className="flex items-center space-x-2">
                    <Checkbox
                      id={`col-${col}`}
                      checked={selectedFilterColumns.includes(col)}
                      onCheckedChange={(checked) => {
                        setSelectedFilterColumns(prev =>
                          checked ? [...prev, col] : prev.filter(c => c !== col)
                        );
                      }}
                    />
                    <Label htmlFor={`col-${col}`} className={selectedFilterColumns.includes(col) ? "font-medium text-blue-600" : ""}>
                      {col}
                      {aiFilterWorkflow && aiFilterWorkflow.selected_filter_columns && aiFilterWorkflow.selected_filter_columns.includes(col) && (
                        <span className="ml-1 text-xs text-green-600">(AI Selected)</span>
                      )}
                    </Label>
                  </div>
                ))}
              </div>
              <Button size="sm" onClick={handleAddFilters}>Add Filter</Button>
            </div>
          )}
        </div>

      </Card>
    </div>
  );
};

export default ExploreSettings;