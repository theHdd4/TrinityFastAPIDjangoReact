import React, { useState, useEffect } from 'react';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Calendar } from '@/components/ui/calendar';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { CheckboxTemplate } from '@/templates/checkbox';
import { Switch } from '@/components/ui/switch';
import { DateRange } from 'react-day-picker';
import { EXPLORE_API } from '@/lib/api';
import { resolveTaskResponse } from '@/lib/taskQueue';
import { CalendarIcon, Database, BarChart3, Info, Filter, ChevronDown, ChevronUp, ChevronRight, Plus, Minus } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Label } from '@/components/ui/label';
import { format } from 'date-fns';
import { EnhancedCalendar } from '@/components/ui/enhanced-calendar';

const defaultGraphLayout = { numberOfGraphsInRow: 1, rows: 1 };

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
  
  // Ensure graphLayout.numberOfGraphsInRow is always between 1 and 2
  useEffect(() => {
    if (graphLayout.numberOfGraphsInRow < 1) {
      setGraphLayout(prev => ({ ...prev, numberOfGraphsInRow: 1 }));
    } else if (graphLayout.numberOfGraphsInRow > 2) {
      setGraphLayout(prev => ({ ...prev, numberOfGraphsInRow: 2 }));
    }
  }, [graphLayout.numberOfGraphsInRow]);
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
  // COMMENTED OUT - causing excessive API calls
  // useEffect(() => {
  //   if (data?.dataframe && !availableDateRange) {
  //     fetchDateRange();
  //   }
  // }, [data?.dataframe, availableDateRange]);

  const fetchColumnNames = async () => {
    if (!data?.dataframe) return;
    
    setIsLoadingColumns(true);
    try {
      const response = await fetch(`${EXPLORE_API}/columns?object_name=${encodeURIComponent(data.dataframe)}`);
      if (response.ok) {
        const raw = await response.json();
        const result = await resolveTaskResponse<{ columns?: string[] }>(raw);
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
      const response = await fetch(`${EXPLORE_API}/date-range?object_name=${encodeURIComponent(data.dataframe)}`);
      if (response.ok) {
        const raw = await response.json();
        const result = await resolveTaskResponse<{ status?: string; min_date?: string; max_date?: string }>(raw);
        if (result.status === 'success' && result.min_date && result.max_date) {
          setAvailableDateRange({ min_date: result.min_date, max_date: result.max_date });
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
              <div className="max-h-40 overflow-y-auto space-y-2">
                {categoricalColumns.map(col => (
                  <CheckboxTemplate
                    key={col}
                    id={`col-${col}`}
                    label={col}
                    checked={selectedFilterColumns.includes(col)}
                    onCheckedChange={(checked) => {
                      setSelectedFilterColumns(prev =>
                        checked ? [...prev, col] : prev.filter(c => c !== col)
                      );
                    }}
                  />
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