import React, { useMemo } from 'react';
import { Badge } from '@/components/ui/badge';
import { BarChart3, Grid, TrendingUp, Clock, Database } from 'lucide-react';
import ExploreCanvas from './components/ExploreCanvas';

export interface ExploreData {
  dataframe?: string;
  dimensions: string[];
  measures: string[];
  graphLayout: {
    numberOfGraphsInRow: number;
    rows: number;
  };
  allColumns?: string[];
  numericalColumns?: string[];
  columnSummary?: any[];
  showDataSummary?: boolean;
  filterUnique?: boolean;
  // Chart configuration properties
  chartType?: string;
  xAxis?: string;
  yAxis?: string;
  xAxisLabel?: string;
  yAxisLabel?: string;
  title?: string;
  legendField?: string; // Field to use for creating multiple lines/series
  aggregation?: string;
  weightColumn?: string;
  // Date filtering properties
  dateFilters?: Array<{
    column: string;
    values: string[];
  }>;
  // Column classifier integration properties
  columnClassifierConfig?: {
    identifiers: string[];
    measures: string[];
    dimensions: { [key: string]: string[] };
    client_name?: string;
    app_name?: string;
    project_name?: string;
  };
  availableDimensions?: string[];
  availableMeasures?: string[];
  availableIdentifiers?: string[];
  chartReadyData?: any;
  // Fallback properties for when column classifier config is not available
  fallbackDimensions?: string[];
  fallbackMeasures?: string[];
  // Applied flag to track if settings have been applied
  applied?: boolean;
  // Additional optional properties
  [key: string]: any;
}

export interface ExploreSettings {
  dataSource: string;
  enableFiltering?: boolean;
  enableExport?: boolean;
  autoRefresh?: boolean;
  // Additional optional settings
  [key: string]: any;
}

import { useLaboratoryStore } from '@/components/LaboratoryMode/store/laboratoryStore';

const chartTypes = [
  'Line', 'Bar', 'Pie', 'Scatter', 'Area', 'Column', 'Table', 'Custom'
];

interface ExploreAtomProps {
  atomId: string;
}

const ExploreAtom: React.FC<ExploreAtomProps> = ({ atomId }) => {
  // Grab atom data from global laboratory store so we always stay in sync with the Settings panel
  const atom = useLaboratoryStore(state => state.getAtom(atomId));
  const data: ExploreData = useMemo(() => ({
    dimensions: [],
    measures: [],
    graphLayout: { numberOfGraphsInRow: 1, rows: 1 },
    chartType: 'line_chart',
    xAxis: '',
    yAxis: '',
    xAxisLabel: '',
    yAxisLabel: '',
    title: '',
    legendField: '', // Field to use for creating multiple lines/series
    ...(atom?.settings?.data || {}),
  }), [atom?.settings?.data]);

  const isApplied = useMemo(() => {
    // Check if settings have been explicitly applied within the atom's data
    return atom?.settings?.data?.applied === true;
  }, [atom?.settings?.data?.applied]);

  const appliedConfig = data;

  // Render the card preview
  const renderCardPreview = () => {
    if (!isApplied) {
      return (
        <div className="flex items-center justify-center h-full text-gray-400 text-sm p-4">
          <div className="text-center">
            <Database className="w-8 h-8 mx-auto mb-2 text-gray-300" />
            <p className="text-xs">Configure in settings</p>
          </div>
        </div>
      );
    }

    // Get selected dimensions and measures from settings, fallback to available ones if no selections
    const selectedDimensions = data.dimensions && data.dimensions.length > 0 
      ? data.dimensions 
      : (data.availableDimensions || ['Date', 'Product', 'Region', 'Category']);
    
    const selectedMeasures = data.measures && data.measures.length > 0 
      ? data.measures 
      : (data.availableMeasures || ['Sales', 'Profit', 'Cost', 'Revenue']);

    // Get dimensions with their associated identifiers from column classifier config
    const dimensionsWithIdentifiers = data.columnClassifierConfig?.dimensions || {};

    return (
      <div className="h-full flex flex-col space-y-3 p-3">
        {/* Dimensions and Measures Section */}
        <div className="grid grid-cols-2 gap-3">
          {/* Dimensions & Identifiers */}
          <div className="space-y-1">
            <div className="flex items-center space-x-2">
              <div className="w-4 h-4 bg-pink-100 rounded flex items-center justify-center">
                <Grid className="w-2 h-2 text-pink-600" />
              </div>
              <span className="text-xs font-medium text-gray-700">Dimensions & Identifiers</span>
            </div>
            <div className="text-xs space-y-1">
              {/* Show selected dimensions with their identifiers */}
              {Array.isArray(selectedDimensions) ? selectedDimensions.slice(0, 3).map((dimension, index) => {
                const dimensionIdentifiers = dimensionsWithIdentifiers[dimension] || [];
                return (
                  <div key={`dim-${index}`} className="text-xs">
                    {/* Dimension with badge */}
                    <div 
                      className="inline-block bg-pink-50 text-pink-700 text-xs px-2 py-1 rounded-full border border-pink-200 mr-2 mb-1 font-medium"
                    >
                      {dimension}
                    </div>
                    {/* Identifiers as simple text */}
                    {Array.isArray(dimensionIdentifiers) && dimensionIdentifiers.length > 0 && (
                      <span className="text-blue-700">
                        {dimensionIdentifiers.slice(0, 2).join(', ')}
                      </span>
                    )}
                  </div>
                );
              }) : null}
              {(!Array.isArray(selectedDimensions) || selectedDimensions.length === 0) && Object.keys(dimensionsWithIdentifiers).length === 0 && (
                <div className="text-xs text-gray-400 italic">No dimensions or identifiers</div>
              )}
            </div>
          </div>

          {/* Measures */}
          <div className="space-y-1">
            <div className="flex items-center space-x-2">
              <div className="w-4 h-4 bg-green-100 rounded flex items-center justify-center">
                <BarChart3 className="w-2 h-2 text-green-600" />
              </div>
              <span className="text-xs font-medium text-gray-700">Measures</span>
            </div>
            <div className="text-xs space-y-1">
              {Array.isArray(selectedMeasures) ? selectedMeasures.slice(0, 3).map((measure, index) => (
                <div key={`measure-${index}`} className="text-xs">
                  <div 
                    className="inline-block bg-green-50 text-green-700 text-xs px-2 py-1 rounded-full border border-green-200 mr-2 mb-1 font-medium"
                  >
                    {measure}
                  </div>
                </div>
              )) : null}
              {(!Array.isArray(selectedMeasures) || selectedMeasures.length === 0) && (
                <div className="text-xs text-gray-400 italic">No measures selected</div>
              )}
            </div>
          </div>
        </div>

        {/* Chart Configuration Preview */}
        <div className="space-y-3">
          {/* Chart Type and Layout */}
          <div className="flex items-center justify-between">
            <div className="flex items-center space-x-2">
              <span className="text-xs text-gray-600">Chart Type:</span>
              <div className="w-20 h-6 bg-blue-500 text-white text-xs rounded flex items-center justify-center">
                {data.chartType || 'Line'}
              </div>
            </div>
            <div className="flex items-center space-x-1">
              <div className="w-6 h-6 bg-blue-500 rounded flex items-center justify-center">
                <BarChart3 className="w-3 h-3 text-white" />
              </div>
              <div className="w-6 h-6 bg-gray-200 rounded flex items-center justify-center">
                <TrendingUp className="w-3 h-3 text-gray-500" />
              </div>
              <div className="w-6 h-6 bg-gray-200 rounded flex items-center justify-center">
                <TrendingUp className="w-3 h-3 text-gray-500" />
              </div>
              <div className="w-6 h-6 bg-gray-200 rounded flex items-center justify-center">
                <Clock className="w-3 h-3 text-gray-500" />
              </div>
            </div>
          </div>
          
          <div className="flex items-center space-x-2">
            <div className="flex items-center space-x-1">
              <span className="text-xs text-gray-600">X:</span>
              <div className="w-16 h-6 bg-white border border-gray-300 rounded text-xs flex items-center justify-center text-gray-600">
                {data.xAxis || 'X'}
              </div>
            </div>
            <div className="flex items-center space-x-1">
              <span className="text-xs text-gray-600">Y:</span>
              <div className="w-16 h-6 bg-white border border-gray-300 rounded text-xs flex items-center justify-center text-gray-600">
                {data.yAxis || 'Y'}
              </div>
            </div>
          </div>

          <div className="flex items-center space-x-1">
            <div className="w-6 h-6 bg-gray-200 rounded flex items-center justify-center">
              <div className="w-3 h-3 text-gray-500">⚙️</div>
            </div>
            <div className="w-6 h-6 bg-gray-200 rounded flex items-center justify-center">
              <div className="w-3 h-3 text-gray-500">🔍</div>
            </div>
          </div>
        </div>

        {/* Chart Configuration Table */}
        <div className="bg-blue-50 rounded border border-blue-200 p-3 space-y-3">
          <div className="grid grid-cols-4 gap-2">
            <div>
              <div className="text-xs text-gray-600 mb-1">Chart Title</div>
              <div className="w-full h-6 bg-white border border-gray-300 rounded text-xs flex items-center px-2 text-gray-600">
                {data.title || 'Chart Title'}
              </div>
            </div>
            <div>
              <div className="text-xs text-gray-600 mb-1">X-Axis Label</div>
              <div className="w-full h-6 bg-white border border-gray-300 rounded text-xs flex items-center px-2 text-gray-600">
                {data.xAxisLabel || 'X Axis'}
              </div>
            </div>
            <div>
              <div className="text-xs text-gray-600 mb-1">Y-Axis Label</div>
              <div className="w-full h-6 bg-white border border-gray-300 rounded text-xs flex items-center px-2 text-gray-600">
                {data.yAxisLabel || 'Y Axis'}
              </div>
            </div>
            <div>
              <div className="text-xs text-gray-600 mb-1">Aggregation</div>
              <div className="w-full h-6 bg-white border border-gray-300 rounded text-xs flex items-center px-2 text-gray-600">
                {data.aggregation || 'Sum'}
              </div>
            </div>
          </div>

          {/* Chart Element Toggles */}
          <div className="flex items-center space-x-3">
            <div className="bg-green-500 text-white text-xs px-2 py-1 rounded flex items-center space-x-1">
              <div className="w-3 h-3">📊</div>
              <span>Legend</span>
            </div>
            <div className="bg-green-500 text-white text-xs px-2 py-1 rounded flex items-center space-x-1">
              <div className="w-3 h-3">📐</div>
              <span>Grid</span>
            </div>
            <div className="bg-gray-200 text-gray-600 text-xs px-2 py-1 rounded flex items-center space-x-1">
              <div className="w-3 h-3">T</div>
              <span>Labels</span>
            </div>
          </div>
        </div>

        {/* Chart Display Area */}
        <div className="flex-1 bg-white border border-gray-200 rounded-lg flex items-center justify-center">
          <span className="text-sm text-gray-500">{data.title || 'Chart Title'}</span>
        </div>
      </div>
    );
  };

  return (
    <div className="w-full h-full bg-white border border-gray-200 rounded-lg">
      {/* Header */}
      <div className="flex items-center justify-between p-3 border-b border-gray-200 bg-gray-50">
        <div className="flex items-center space-x-2">
          <BarChart3 className="w-4 h-4 text-pink-500" />
          <span className="font-medium text-gray-900 text-sm">Explore</span>
        </div>
        <Badge variant="secondary" className="bg-pink-100 text-pink-700 border-pink-200 text-xs">
          Visualization
        </Badge>
      </div>
      
      {/* Content */}
      <div className="flex-1 min-h-0">
        {!data.dataframe ? (
          renderCardPreview()
        ) : (
          <ExploreCanvas 
            data={data} 
            isApplied={isApplied}
            onDataChange={(newData) => {
              // Update the atom data in the laboratory store
              const currentSettings = atom?.settings || {};
              useLaboratoryStore.getState().updateAtomSettings(atomId, { 
                data: { ...(currentSettings.data || {}), ...newData } 
              });
            }}
          />
        )}
      </div>
    </div>
  );
};

export default ExploreAtom;