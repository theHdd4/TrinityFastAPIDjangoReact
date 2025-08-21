import React, { useState, useEffect } from 'react';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Calendar } from '@/components/ui/calendar';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Checkbox } from '@/components/ui/checkbox';
import { DateRange } from 'react-day-picker';
import { EXPLORE_API } from '@/lib/api';
import { CalendarIcon, Database, BarChart3, Info, Filter, ChevronDown, ChevronUp, ChevronRight } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Separator } from '@/components/ui/separator';
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
  const [graphLayout, setGraphLayout] = useState(defaultGraphLayout);
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
    if (settings?.dataSource && !columnNames.length) {
      fetchColumnNames();
    }
  }, [settings?.dataSource, columnNames.length]);

  // Fetch date range if data source is available
  useEffect(() => {
    if (settings?.dataSource && !availableDateRange) {
      fetchDateRange();
    }
  }, [settings?.dataSource, availableDateRange]);

  const fetchColumnNames = async () => {
    if (!settings?.dataSource) return;
    
    setIsLoadingColumns(true);
    try {
      const response = await fetch(`${EXPLORE_API}/columns?object_name=${encodeURIComponent(settings.dataSource)}`);
      if (response.ok) {
        const result = await response.json();
        if (result.columns) {
          setColumnNames(result.columns);
          console.log('🔍 ExploreSettings: Fetched columns:', result.columns);
        }
      }
    } catch (error) {
      console.error('Error fetching columns:', error);
    } finally {
      setIsLoadingColumns(false);
    }
  };

  const fetchDateRange = async () => {
    if (!settings?.dataSource) return;
    
    setIsLoadingDateRange(true);
    try {
      const response = await fetch(`${EXPLORE_API}/get-date-range?data_source=${encodeURIComponent(settings.dataSource)}`);
      if (response.ok) {
        const result = await response.json();
        if (result.status === 'success' && result.date_range) {
          setAvailableDateRange(result.date_range);
          console.log('🔍 ExploreSettings: Fetched date range:', result.date_range);
        }
      }
    } catch (error) {
      console.error('Error fetching date range:', error);
    } finally {
      setIsLoadingDateRange(false);
    }
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

  // Don't show loading state - allow rendering without column classifier config
  // The component will show fallback content when columnClassifierConfig is null

  return (
    <div className="space-y-6 p-4">
      <Card className="p-6 space-y-6">
        {/* Graph Layout Section */}
        <div className="space-y-4">
          <div className="flex items-center space-x-2">
            <BarChart3 className="w-5 h-5 text-blue-600" />
            <h3 className="text-base font-semibold text-gray-900">Graph Layout</h3>
          </div>
          
          <div className="space-y-3">
            <Label className="text-sm font-medium text-gray-700">Number of Graphs per Row</Label>
            <Select
              value={graphLayout.numberOfGraphsInRow > 0 ? graphLayout.numberOfGraphsInRow.toString() : ""}
              onValueChange={(value) => {
                const newGraphLayout = {
                  numberOfGraphsInRow: parseInt(value),
                  rows: 1
                };
                setGraphLayout(newGraphLayout);
                
                // Automatically populate selectedIdentifiers with all available identifiers from each dimension
                let updatedSelectedIdentifiers = { ...selectedIdentifiers };
                if (columnClassifierConfig?.dimensions) {
                  Object.keys(columnClassifierConfig.dimensions).forEach(dimensionId => {
                    updatedSelectedIdentifiers[dimensionId] = columnClassifierConfig.dimensions[dimensionId] || [];
                  });
                  setSelectedIdentifiers(updatedSelectedIdentifiers);
                }
                
                // Immediately apply graph layout changes and show chart cards
                const updatedData = {
                  ...data,
                  graphLayout: newGraphLayout,
                  selectedIdentifiers: updatedSelectedIdentifiers,
                  applied: true // Mark as applied so chart cards appear immediately
                };
                onDataChange(updatedData);
                onApply(); // Call onApply to ensure the changes are properly applied
              }}
            >
              <SelectTrigger className="w-full">
                <SelectValue placeholder="Select" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="1">1 graph per row</SelectItem>
                <SelectItem value="2">2 graphs per row</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </div>

      </Card>
    </div>
  );
};

export default ExploreSettings;