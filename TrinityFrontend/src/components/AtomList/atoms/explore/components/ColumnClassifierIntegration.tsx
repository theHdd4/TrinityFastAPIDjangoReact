import React, { useState, useEffect } from 'react';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Checkbox } from '@/components/ui/checkbox';
import { Separator } from '@/components/ui/separator';
import { Database, BarChart3, TrendingUp, Settings, RefreshCw, CheckCircle, AlertCircle } from 'lucide-react';
import { EXPLORE_API } from '@/lib/api';
import { ExploreData } from '../ExploreAtom';

interface ColumnClassifierConfig {
  client_name: string;
  app_name: string;
  project_name: string;
}

interface DimensionData {
  dimension_name: string;
  identifiers: string[];
  description: string;
}

interface MeasuresData {
  measures: string[];
  identifiers: string[];
}

interface ColumnClassifierIntegrationProps {
  data: ExploreData;
  onDataChange: (data: Partial<ExploreData>) => void;
  onDimensionsLoaded?: (dimensions: string[]) => void;
  onMeasuresLoaded?: (measures: string[]) => void;
}

const ColumnClassifierIntegration: React.FC<ColumnClassifierIntegrationProps> = ({
  data,
  onDataChange,
  onDimensionsLoaded,
  onMeasuresLoaded
}) => {
  const [config, setConfig] = useState<ColumnClassifierConfig>({
    client_name: '',
    app_name: '',
    project_name: ''
  });
  
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  
  const [dimensionsData, setDimensionsData] = useState<Record<string, DimensionData>>({});
  const [measuresData, setMeasuresData] = useState<MeasuresData>({ measures: [], identifiers: [] });
  
  const [selectedDimensions, setSelectedDimensions] = useState<string[]>([]);
  const [selectedMeasures, setSelectedMeasures] = useState<string[]>([]);
  
  const [availableConfigs, setAvailableConfigs] = useState<Array<{
    client_name: string;
    app_name: string;
    project_name: string;
    last_updated?: string;
  }>>([]);

  // Load available configurations
  useEffect(() => {
    const loadAvailableConfigs = async () => {
      try {
        // This would be a new endpoint to list available column classifier configs
        // For now, we'll use a mock or you can implement this endpoint
        const response = await fetch(`${EXPLORE_API}/column-classifier/configs`);
        if (response.ok) {
          const configs = await response.json();
          setAvailableConfigs(configs.configs || []);
        }
      } catch (error) {
        console.log('No pre-saved configs available, users can enter manually');
      }
    };

    loadAvailableConfigs();
  }, []);

  const handleConfigChange = (field: keyof ColumnClassifierConfig, value: string) => {
    setConfig(prev => ({ ...prev, [field]: value }));
    setError(null);
    setSuccess(null);
  };

  const fetchDimensionsAndMeasures = async () => {
    if (!config.client_name || !config.app_name || !config.project_name) {
      setError('Please fill in all configuration fields');
      return;
    }

    setIsLoading(true);
    setError(null);
    setSuccess(null);

    try {
      // Fetch dimensions
      const dimensionsResponse = await fetch(
        `${EXPLORE_API}/get-dimensions-and-identifiers/test_validator_id?` +
        `client_name=${encodeURIComponent(config.client_name)}&` +
        `app_name=${encodeURIComponent(config.app_name)}&` +
        `project_name=${encodeURIComponent(config.project_name)}`
      );

      // Fetch measures
      const measuresResponse = await fetch(
        `${EXPLORE_API}/get-measures/test_validator_id?` +
        `client_name=${encodeURIComponent(config.client_name)}&` +
        `app_name=${encodeURIComponent(config.app_name)}&` +
        `project_name=${encodeURIComponent(config.project_name)}`
      );

      if (dimensionsResponse.ok && measuresResponse.ok) {
        const dimensionsData = await dimensionsResponse.json();
        const measuresData = await measuresResponse.json();

        console.log('Column Classifier Data:', { dimensionsData, measuresData });

        // Process dimensions data
        if (dimensionsData.status === 'success' && dimensionsData.dimensions_structure) {
          const fileKey = Object.keys(dimensionsData.dimensions_structure)[0] || 'file';
          const dimensions = dimensionsData.dimensions_structure[fileKey] || {};
          setDimensionsData(dimensions);
          
          // Extract dimension names for selection
          const dimensionNames = Object.keys(dimensions);
          setSelectedDimensions(dimensionNames);
          
          // Update explore atom data
          onDataChange({
            dimensions: dimensionNames,
            columnSummary: dimensionNames
          });
          
          if (onDimensionsLoaded) {
            onDimensionsLoaded(dimensionNames);
          }
        }

        // Process measures data
        if (measuresData.status === 'success' && measuresData.measures_structure) {
          const fileKey = Object.keys(measuresData.measures_structure)[0] || 'file';
          const measures = measuresData.measures_structure[fileKey] || {};
          setMeasuresData({
            measures: measures.measures || [],
            identifiers: measures.identifiers || []
          });
          
          // Update explore atom data
          const measureNames = measures.measures || [];
          setSelectedMeasures(measureNames);
          
          onDataChange({
            measures: measureNames,
            numericalColumns: measureNames
          });
          
          if (onMeasuresLoaded) {
            onMeasuresLoaded(measureNames);
          }
        }

        setSuccess(`Successfully loaded ${Object.keys(dimensionsData).length} dimensions and ${measuresData.measures?.length || 0} measures`);
      } else {
        const errorText = await dimensionsResponse.text();
        setError(`Failed to fetch data: ${errorText}`);
      }
    } catch (error) {
      console.error('Error fetching column classifier data:', error);
      setError('Failed to connect to column classifier service');
    } finally {
      setIsLoading(false);
    }
  };

  const handleDimensionToggle = (dimensionName: string) => {
    setSelectedDimensions(prev => 
      prev.includes(dimensionName) 
        ? prev.filter(d => d !== dimensionName)
        : [...prev, dimensionName]
    );
  };

  const handleMeasureToggle = (measureName: string) => {
    setSelectedMeasures(prev => 
      prev.includes(measureName) 
        ? prev.filter(m => m !== measureName)
        : [...prev, measureName]
    );
  };

  const applySelection = () => {
    onDataChange({
      dimensions: selectedDimensions,
      measures: selectedMeasures,
      numericalColumns: selectedMeasures
    });
    setSuccess('Selection applied to explore atom');
  };

  return (
    <div className="space-y-4">
      <Card className="p-4">
        <div className="flex items-center space-x-2 mb-4">
          <Settings className="w-5 h-5 text-blue-600" />
          <h3 className="text-sm font-semibold">Column Classifier Integration</h3>
        </div>

        {/* Configuration Input */}
        <div className="space-y-3 mb-4">
          <div className="grid grid-cols-3 gap-2">
            <div>
              <Label htmlFor="client_name" className="text-xs">Client Name</Label>
              <Input
                id="client_name"
                value={config.client_name}
                onChange={(e) => handleConfigChange('client_name', e.target.value)}
                placeholder="e.g., client1"
                className="text-xs"
              />
            </div>
            <div>
              <Label htmlFor="app_name" className="text-xs">App Name</Label>
              <Input
                id="app_name"
                value={config.app_name}
                onChange={(e) => handleConfigChange('app_name', e.target.value)}
                placeholder="e.g., app1"
                className="text-xs"
              />
            </div>
            <div>
              <Label htmlFor="project_name" className="text-xs">Project Name</Label>
              <Input
                id="project_name"
                value={config.project_name}
                onChange={(e) => handleConfigChange('project_name', e.target.value)}
                placeholder="e.g., project1"
                className="text-xs"
              />
            </div>
          </div>

          <Button 
            onClick={fetchDimensionsAndMeasures}
            disabled={isLoading || !config.client_name || !config.app_name || !config.project_name}
            className="w-full"
            size="sm"
          >
            {isLoading ? (
              <>
                <RefreshCw className="w-4 h-4 mr-2 animate-spin" />
                Loading...
              </>
            ) : (
              <>
                <Database className="w-4 h-4 mr-2" />
                Fetch Dimensions & Measures
              </>
            )}
          </Button>
        </div>

        {/* Status Messages */}
        {error && (
          <div className="flex items-center space-x-2 p-2 bg-red-50 border border-red-200 rounded text-red-700 text-xs">
            <AlertCircle className="w-4 h-4" />
            <span>{error}</span>
          </div>
        )}

        {success && (
          <div className="flex items-center space-x-2 p-2 bg-green-50 border border-green-200 rounded text-green-700 text-xs">
            <CheckCircle className="w-4 h-4" />
            <span>{success}</span>
          </div>
        )}

        {/* Dimensions Section */}
        {Object.keys(dimensionsData).length > 0 && (
          <div className="space-y-3">
            <Separator />
            <div className="flex items-center space-x-2">
              <BarChart3 className="w-4 h-4 text-blue-600" />
              <h4 className="text-sm font-medium">Dimensions</h4>
            </div>
            
            <div className="space-y-2">
              {Array.isArray(Object.entries(dimensionsData)) ? Object.entries(dimensionsData).map(([dimensionName, dimensionData]) => (
                <div key={dimensionName} className="border rounded p-2">
                  <div className="flex items-center space-x-2 mb-2">
                    <Checkbox
                      checked={selectedDimensions.includes(dimensionName)}
                      onCheckedChange={() => handleDimensionToggle(dimensionName)}
                    />
                    <span className="text-sm font-medium">{dimensionName}</span>
                  </div>
                  <div className="flex flex-wrap gap-1">
                    {Array.isArray(dimensionData.identifiers) ? dimensionData.identifiers.map((identifier, index) => (
                      <Badge key={index} variant="outline" className="text-xs">
                        {identifier}
                      </Badge>
                    )) : null}
                  </div>
                </div>
              )) : null}
            </div>
          </div>
        )}

        {/* Measures Section */}
        {measuresData.measures.length > 0 && (
          <div className="space-y-3">
            <Separator />
            <div className="flex items-center space-x-2">
              <TrendingUp className="w-4 h-4 text-green-600" />
              <h4 className="text-sm font-medium">Measures</h4>
            </div>
            
            <div className="space-y-2">
              {Array.isArray(measuresData.measures) ? measuresData.measures.map((measure, index) => (
                <div key={index} className="flex items-center space-x-2">
                  <Checkbox
                    checked={selectedMeasures.includes(measure)}
                    onCheckedChange={() => handleMeasureToggle(measure)}
                  />
                  <span className="text-sm">{measure}</span>
                </div>
              )) : null}
            </div>
          </div>
        )}

        {/* Apply Selection Button */}
        {(selectedDimensions.length > 0 || selectedMeasures.length > 0) && (
          <div className="pt-3">
            <Button onClick={applySelection} className="w-full" size="sm">
              Apply Selection to Explore Atom
            </Button>
          </div>
        )}
      </Card>
    </div>
  );
};

export default ColumnClassifierIntegration; 