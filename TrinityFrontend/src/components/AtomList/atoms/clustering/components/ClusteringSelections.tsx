import React, { useEffect, useState } from 'react';
import { Card } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Calendar, X } from 'lucide-react';
import { useLaboratoryStore } from '@/components/LaboratoryMode/store/laboratoryStore';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { CheckboxTemplate } from '@/templates/checkbox';
import { CLUSTERING_API } from '@/lib/api';

interface Props {
  atomId: string;
}

interface AlgorithmParameter {
  name: string;
  label: string;
  type: 'number' | 'select';
  min?: number;
  max?: number;
  step?: number;
  default: number | string;
  description: string;
  options?: string[];
}

const ClusteringSelections: React.FC<Props> = ({ atomId }) => {
  const atom = useLaboratoryStore(state => state.getAtom(atomId));
  const updateSettings = useLaboratoryStore(state => state.updateAtomSettings);
  const settings = atom?.settings || {};
  
  console.log('🔍 Component props:', { atomId });
  console.log('🔍 Retrieved atom:', atom);
  console.log('🔍 Atom ID vs atomId:', { atomId, actualAtomId: atom?.id });
  
  // Helper function to get the correct atom ID for updates
  const getCorrectAtomId = () => atom?.id || atomId;
  
  const clusteringData = settings.clusteringData || {};
  const availableIdentifiers = clusteringData.availableIdentifiers || [];
  const selectedIdentifiers = clusteringData.selectedIdentifiers || [];
  const availableMeasures = clusteringData.availableMeasures || [];
  const selectedMeasures = clusteringData.selectedMeasures || [];
  const filterUnique = clusteringData.filterUnique || false;
  const columnSummary = clusteringData.columnSummary || [];
  
  // Date range state
  const [dateRangeData, setDateRangeData] = useState<{
    dateColumn: string | null;
    availableDates: string[];
    minDate: string | null;
    maxDate: string | null;
    isLoading: boolean;
  }>({
    dateColumn: null,
    availableDates: [],
    minDate: null,
    maxDate: null,
    isLoading: false
  });
  
  const [selectedDateRange, setSelectedDateRange] = useState<{
    fromDate: string;
    toDate: string;
  }>({
    fromDate: '',
    toDate: ''
  });

  // Unique values state for filtering identifiers
  const [uniqueValues, setUniqueValues] = useState<Record<string, string[]>>({});
  const [loadingValues, setLoadingValues] = useState<Record<string, boolean>>({});

  // Debug logging for algorithm changes
  console.log('🔍 ClusteringSelections Debug:', {
    atomId,
    actualAtomId: atom?.id,
    algorithm: clusteringData.algorithm,
    hasAlgorithm: !!clusteringData.algorithm
  });

  // Ensure algorithm is always initialized
  useEffect(() => {
    if (!clusteringData.algorithm) {
      console.log('🔧 Initializing default algorithm: kmeans');
      updateSettings(getCorrectAtomId(), {
        clusteringData: {
          ...clusteringData,
          algorithm: 'kmeans',
          // K-selection method and parameters
          k_selection: 'elbow',
          n_clusters: 3,
          k_min: 2,
          k_max: 10,
          gap_b: 10,
          // Algorithm-specific parameters
          eps: 0.5,
          min_samples: 5,
          linkage: 'ward',
          threshold: 0.5
        }
      });
    }
  }, [atomId, updateSettings]);

  // Monitor algorithm changes
  useEffect(() => {
    console.log('🔄 Component re-rendered with new algorithm:', clusteringData.algorithm);
  }, [clusteringData.algorithm]);

  // Debug logging for date range
  useEffect(() => {
    console.log('🔍 Date Range Debug:', {
      hasDateRange: !!clusteringData.dateRange,
      dateRange: clusteringData.dateRange,
      selectedDateRange,
      dateRangeData
    });
  }, [clusteringData.dateRange, selectedDateRange, dateRangeData]);

  // Fetch available dates when objectName changes
  useEffect(() => {
    const fetchAvailableDates = async () => {
      if (!clusteringData.objectName) return;
      
      setDateRangeData(prev => ({ ...prev, isLoading: true }));
      
      try {
        const response = await fetch(`${CLUSTERING_API}/available-dates?object_name=${encodeURIComponent(clusteringData.objectName)}`);
        
        if (response.ok) {
          const data = await response.json();
          console.log('📅 Available dates data:', data);
          
          setDateRangeData({
            dateColumn: data.date_column,
            availableDates: data.date_values || [],
            minDate: data.min_date,
            maxDate: data.max_date,
            isLoading: false
          });
          
          // Set default date range if dates are available
          if (data.min_date && data.max_date) {
            setSelectedDateRange({
              fromDate: data.min_date,
              toDate: data.max_date
            });
          }
        } else {
          console.error('Failed to fetch available dates:', response.status);
          setDateRangeData(prev => ({ ...prev, isLoading: false }));
        }
      } catch (error) {
        console.error('Error fetching available dates:', error);
        setDateRangeData(prev => ({ ...prev, isLoading: false }));
      }
    };
    
    fetchAvailableDates();
  }, [clusteringData.objectName]);

  // Fetch unique values for identifiers when they change
  useEffect(() => {
    if (!clusteringData.objectName || availableIdentifiers.length === 0) return;

    availableIdentifiers.forEach(async (identifier) => {
      if (uniqueValues[identifier]) return; // Already fetched
      
      setLoadingValues(prev => ({ ...prev, [identifier]: true }));
      
      try {
        const response = await fetch(`${CLUSTERING_API}/unique_values?object_name=${encodeURIComponent(clusteringData.objectName)}&column_name=${encodeURIComponent(identifier)}`);
        
        if (response.ok) {
          const data = await response.json();
          const values = Array.isArray(data.unique_values) ? data.unique_values : [];
          
          setUniqueValues(prev => ({ ...prev, [identifier]: values }));
        } else {
          console.error(`Failed to fetch unique values for ${identifier}:`, response.status);
          setUniqueValues(prev => ({ ...prev, [identifier]: [] }));
        }
      } catch (error) {
        console.error(`Error fetching unique values for ${identifier}:`, error);
        setUniqueValues(prev => ({ ...prev, [identifier]: [] }));
      } finally {
        setLoadingValues(prev => ({ ...prev, [identifier]: false }));
      }
    });
  }, [availableIdentifiers, clusteringData.objectName]);

  // Filter identifiers to only show those with more than one unique value
  const filteredIdentifiers = availableIdentifiers.filter(identifier => {
    const uniqueCount = uniqueValues[identifier]?.length || 0;
    return uniqueCount > 1; // Only show identifiers with >1 unique value
  });

  // Calculate Select All states like Excel
  const allIdentifiersSelected = filteredIdentifiers.length > 0 && 
    filteredIdentifiers.every(id => selectedIdentifiers.includes(id));
  
  const allMeasuresSelected = availableMeasures.length > 0 && 
    availableMeasures.every(m => selectedMeasures.includes(m));

  const handleIdentifierToggle = (identifier: string, checked: boolean) => {
    const currentSelected = selectedIdentifiers || [];
    const newSelected = checked
      ? [...currentSelected, identifier]
      : currentSelected.filter(id => id !== identifier);
    
    updateSettings(getCorrectAtomId(), {
      clusteringData: {
        ...clusteringData,
        selectedIdentifiers: newSelected
      }
    });
  };

  const handleMeasureToggle = (measure: string, checked: boolean) => {
    const currentSelected = selectedMeasures || [];
    const newSelected = checked
      ? [...currentSelected, measure]
      : currentSelected.filter(m => m !== measure);
    
    updateSettings(getCorrectAtomId(), {
      clusteringData: {
        ...clusteringData,
        selectedMeasures: newSelected
      }
    });
  };

  const handleSelectAllIdentifiers = () => {
    if (allIdentifiersSelected) {
      // If all are selected, deselect all
      updateSettings(getCorrectAtomId(), {
        clusteringData: {
          ...clusteringData,
          selectedIdentifiers: []
        }
      });
    } else {
      // If not all are selected, select all
      updateSettings(getCorrectAtomId(), {
        clusteringData: {
          ...clusteringData,
          selectedIdentifiers: [...filteredIdentifiers]
        }
      });
    }
  };

  const handleClearAllIdentifiers = () => {
    updateSettings(getCorrectAtomId(), {
      clusteringData: {
        ...clusteringData,
        selectedIdentifiers: []
      }
    });
  };

  const handleSelectAllMeasures = () => {
    if (allMeasuresSelected) {
      // If all are selected, deselect all
      updateSettings(getCorrectAtomId(), {
        clusteringData: {
          ...clusteringData,
          selectedMeasures: []
        }
      });
    } else {
      // If not all are selected, select all
      updateSettings(getCorrectAtomId(), {
        clusteringData: {
          ...clusteringData,
          selectedMeasures: [...availableMeasures]
        }
      });
    }
  };

  const handleClearAllMeasures = () => {
    updateSettings(getCorrectAtomId(), {
      clusteringData: {
        ...clusteringData,
        selectedMeasures: []
      }
    });
  };

  const removeIdentifier = (identifier: string) => {
    const currentSelected = selectedIdentifiers || [];
    const newSelected = currentSelected.filter(id => id !== identifier);
    
    updateSettings(getCorrectAtomId(), {
      clusteringData: {
        ...clusteringData,
        selectedIdentifiers: newSelected
      }
    });
  };

  const removeMeasure = (measure: string) => {
    const currentSelected = selectedMeasures || [];
    const newSelected = currentSelected.filter(m => m !== measure);
    
    updateSettings(getCorrectAtomId(), {
      clusteringData: {
        ...clusteringData,
        selectedMeasures: newSelected
      }
    });
  };



  const getAlgorithmParameters = (algorithm: string): AlgorithmParameter[] => {
    // Get current K-selection method
    const kSelection = clusteringData.k_selection || 'manual';
    
    switch (algorithm) {
      case 'kmeans':
        if (kSelection === 'manual') {
          return [
            { name: 'n_clusters', label: 'Number of Clusters (K)', type: 'number', min: 2, max: 20, step: 1, default: 3, description: 'Recommended: 2-10 clusters for most datasets' },
          ];
        } else {
          // Auto-K selection parameters
          const params: AlgorithmParameter[] = [
            { name: 'k_min', label: 'Minimum K', type: 'number', min: 2, max: 19, step: 1, default: 2, description: 'Minimum number of clusters to try during automatic selection. Lower values may miss natural groupings.' },
            { name: 'k_max', label: 'Maximum K', type: 'number', min: 3, max: 20, step: 1, default: 10, description: 'Maximum number of clusters to try during automatic selection. Higher values may create overly fine-grained clusters.' },
          ];
          
          // Add gap-specific parameter
          if (kSelection === 'gap') {
            params.push({ name: 'gap_b', label: 'Bootstrap Samples', type: 'number', min: 5, max: 50, step: 1, default: 10, description: 'Number of bootstrap samples for gap statistic. More samples = more reliable results but slower computation.' });
          }
          
          return params;
        }
      case 'dbscan':
        return [
          { name: 'eps', label: 'Epsilon (ε)', type: 'number', min: 0.1, max: 10.0, step: 0.1, default: 0.5, description: 'Maximum distance between points in the same cluster' },
          { name: 'min_samples', label: 'Minimum Samples', type: 'number', min: 2, max: 100, step: 1, default: 5, description: 'Minimum number of samples in a cluster' },
        ];
      case 'hac':
        if (kSelection === 'manual') {
          return [
            { name: 'n_clusters', label: 'Number of Clusters (K)', type: 'number', min: 2, max: 20, step: 1, default: 3, description: 'Recommended: 2-10 clusters for most datasets' },
            { name: 'linkage', label: 'Linkage Method', type: 'select', default: 'ward', options: ['ward', 'complete', 'average', 'single'], description: 'Method used to calculate distance between clusters' },
          ];
        } else {
          // Auto-K selection parameters
          const params: AlgorithmParameter[] = [
            { name: 'k_min', label: 'Minimum K', type: 'number', min: 2, max: 19, step: 1, default: 2, description: 'Minimum number of clusters to try during automatic selection. Lower values may miss natural groupings.' },
            { name: 'k_max', label: 'Maximum K', type: 'number', min: 3, max: 20, step: 1, default: 10, description: 'Maximum number of clusters to try during automatic selection. Higher values may create overly fine-grained clusters.' },
            { name: 'linkage', label: 'Linkage Method', type: 'select', default: 'ward', options: ['ward', 'complete', 'average', 'single'], description: 'Method used to calculate distance between clusters' },
          ];
          
          // Add gap-specific parameter
          if (kSelection === 'gap') {
            params.push({ name: 'gap_b', label: 'Bootstrap Samples', type: 'number', min: 5, max: 50, step: 1, default: 10, description: 'Number of bootstrap samples for gap statistic. More samples = more reliable results but slower computation.' });
          }
          
          return params;
        }
      case 'birch':
        if (kSelection === 'manual') {
          return [
            { name: 'n_clusters', label: 'Number of Clusters (K)', type: 'number', min: 2, max: 20, step: 1, default: 3, description: 'Recommended: 2-10 clusters for most datasets' },
            { name: 'threshold', label: 'Threshold', type: 'number', min: 0.1, max: 2.0, step: 0.1, default: 0.5, description: 'Threshold for BIRCH clustering algorithm' },
          ];
        } else {
          // Auto-K selection parameters
          const params: AlgorithmParameter[] = [
            { name: 'k_min', label: 'Minimum K', type: 'number', min: 2, max: 19, step: 1, default: 2, description: 'Minimum number of clusters to try during automatic selection. Lower values may miss natural groupings.' },
            { name: 'k_max', label: 'Maximum K', type: 'number', min: 3, max: 20, step: 1, default: 10, description: 'Maximum number of clusters to try during automatic selection. Higher values may create overly fine-grained clusters.' },
            { name: 'threshold', label: 'Threshold', type: 'number', min: 0.1, max: 2.0, step: 0.1, default: 0.5, description: 'Threshold for BIRCH clustering algorithm' },
          ];
          
          // Add gap-specific parameter
          if (kSelection === 'gap') {
            params.push({ name: 'gap_b', label: 'Bootstrap Samples', type: 'number', min: 5, max: 50, step: 1, default: 10, description: 'Number of bootstrap samples for gap statistic. More samples = more reliable results but slower computation.' });
          }
          
          return params;
        }
      case 'gmm':
        if (kSelection === 'manual') {
          return [
            { name: 'n_clusters', label: 'Number of Clusters (K)', type: 'number', min: 2, max: 20, step: 1, default: 3, description: 'Recommended: 2-10 clusters for most datasets' },
          ];
        } else {
          // Auto-K selection parameters
          const params: AlgorithmParameter[] = [
            { name: 'k_min', label: 'Minimum K', type: 'number', min: 2, max: 19, step: 1, default: 2, description: 'Minimum number of clusters to try during automatic selection. Lower values may miss natural groupings.' },
            { name: 'k_max', label: 'Maximum K', type: 'number', min: 3, max: 20, step: 1, default: 10, description: 'Maximum number of clusters to try during automatic selection. Higher values may create overly fine-grained clusters.' },
          ];
          
          // Add gap-specific parameter
          if (kSelection === 'gap') {
            params.push({ name: 'gap_b', label: 'Bootstrap Samples', type: 'number', min: 5, max: 50, step: 1, default: 10, description: 'Number of bootstrap samples for gap statistic. More samples = more reliable results but slower computation.' });
          }
          
          return params;
        }
      default:
        return [];
    }
  };

  const getParameterValue = (name: string, settings: any) => {
    // Handle K-selection method
    if (name === 'k_selection') {
      return settings.k_selection || 'elbow';
    }
    
    // Handle auto-K parameters
    if (name === 'k_min') {
      return settings.k_min || 2;
    }
    if (name === 'k_max') {
      return settings.k_max || 10;
    }
    if (name === 'gap_b') {
      return settings.gap_b || 10;
    }
    
    // Handle n_clusters parameter for algorithms that use it (manual mode only)
    if (name === 'n_clusters' && ['kmeans', 'hac', 'birch', 'gmm'].includes(settings.algorithm)) {
      return settings.n_clusters || 3;
    }
    
    // Handle DBSCAN parameters
    if (name === 'eps' && settings.algorithm === 'dbscan') {
      return settings.eps || 0.5;
    }
    if (name === 'min_samples' && settings.algorithm === 'dbscan') {
      return settings.min_samples || 5;
    }
    
    // Handle HAC linkage parameter
    if (name === 'linkage' && settings.algorithm === 'hac') {
      return settings.linkage || 'ward';
    }
    
    // Handle BIRCH threshold parameter
    if (name === 'threshold' && settings.algorithm === 'birch') {
      return settings.threshold || 0.5;
    }
    
    // Fallback to direct property access
    return settings[name];
  };

  // Helper function to validate K-selection parameters
  const validateKParameters = (k_min: number, k_max: number) => {
    // Ensure k_min < k_max (this is the main requirement)
    if (k_min >= k_max) {
      return false;
    }
    
    // Ensure reasonable bounds
    if (k_min < 2 || k_max > 20) {
      return false;
    }
    
    // Ensure we have enough range to be meaningful
    if (k_max - k_min < 1) {
      return false;
    }
    
    return true;
  };

  const handleParameterChange = (name: string, value: any) => {
    console.log('🔧 Updating parameter:', name, 'to:', value);

    // Get the most recent clusteringData (e.g., from atom or settings)
    const currentClusteringData = atom?.settings?.clusteringData || {};

    // Validate K parameters if they're being changed
    if (name === 'k_min' || name === 'k_max') {
      const newKMin = name === 'k_min' ? value : (currentClusteringData.k_min || 2);
      const newKMax = name === 'k_max' ? value : (currentClusteringData.k_max || 10);
      
      if (!validateKParameters(newKMin, newKMax)) {
        console.warn('⚠️ Invalid K parameters:', { k_min: newKMin, k_max: newKMax });
        // Still update the value but log a warning
      }
    }

    // Prepare the new parameter set
    const newClusteringData = {
      ...currentClusteringData,
      [name]: value,
      // Legacy compatibility
      clusteringConfig: currentClusteringData.clusteringConfig
        ? {
            ...currentClusteringData.clusteringConfig,
            algorithmParams: {
              ...currentClusteringData.clusteringConfig.algorithmParams,
              [name]: value,
            },
            ...(name === 'n_clusters'
              ? { numberOfClusters: value }
              : {}),
            ...(name === 'algorithm'
              ? { clusteringMethod: value.toUpperCase() }
              : {}),
          }
        : undefined,
    };

    // Special handling for K-selection method changes
    if (name === 'k_selection') {
      // When switching to manual, ensure n_clusters has a value
      if (value === 'manual' && !newClusteringData.n_clusters) {
        newClusteringData.n_clusters = 3;
      }
      // When switching to auto methods, ensure k_min and k_max have values
      if (value !== 'manual') {
        newClusteringData.k_min = newClusteringData.k_min || 2;
        newClusteringData.k_max = newClusteringData.k_max || 10;
        if (value === 'gap') {
          newClusteringData.gap_b = newClusteringData.gap_b || 10;
        }
      }
    }

    updateSettings(getCorrectAtomId(), {
      clusteringData: newClusteringData,
    });

    console.log('🔧 Updated clusteringData:', newClusteringData);
  };

  // Save date range to store when it changes
  useEffect(() => {
    if (selectedDateRange.fromDate && selectedDateRange.toDate && dateRangeData.dateColumn) {
      const newDateRange = {
        column: dateRangeData.dateColumn,
        fromDate: selectedDateRange.fromDate,
        toDate: selectedDateRange.toDate
      };
      
      // Only update if the date range has actually changed
      if (JSON.stringify(clusteringData.dateRange) !== JSON.stringify(newDateRange)) {
        updateSettings(getCorrectAtomId(), {
          clusteringData: {
            ...clusteringData,
            dateRange: newDateRange
          }
        });
      }
    }
  }, [selectedDateRange.fromDate, selectedDateRange.toDate, dateRangeData.dateColumn, clusteringData, updateSettings, getCorrectAtomId]);

  // Save date column info to store when it's detected
  useEffect(() => {
    if (dateRangeData.dateColumn) {
      const newDateColumnInfo = {
        dateColumn: dateRangeData.dateColumn,
        availableDates: dateRangeData.availableDates,
        minDate: dateRangeData.minDate,
        maxDate: dateRangeData.maxDate
      };
      
      // Only update if the date column info has actually changed
      if (JSON.stringify({
        dateColumn: clusteringData.dateColumn,
        availableDates: clusteringData.availableDates,
        minDate: clusteringData.minDate,
        maxDate: clusteringData.maxDate
      }) !== JSON.stringify(newDateColumnInfo)) {
        updateSettings(getCorrectAtomId(), {
          clusteringData: {
            ...clusteringData,
            ...newDateColumnInfo
          }
        });
      }
    }
  }, [dateRangeData.dateColumn, dateRangeData.availableDates, dateRangeData.minDate, dateRangeData.maxDate, clusteringData, updateSettings, getCorrectAtomId]);

  return (
    <div className="space-y-6 p-2">
      {/* Date Range Selection */}
      <Card className="p-4 space-y-3">
        <div className="flex items-center gap-2 mb-3">
          <Calendar className="h-4 w-4 text-primary" />
          <Label className="text-sm font-medium">Date Range</Label>
          {dateRangeData.dateColumn && (
            <Badge variant="outline" className="text-xs">
              Column: {dateRangeData.dateColumn}
            </Badge>
          )}
        </div>
        
        {dateRangeData.isLoading ? (
          <div className="text-center py-4">
            <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-primary mx-auto mb-2"></div>
            <p className="text-xs text-muted-foreground">Loading available dates...</p>
          </div>
        ) : dateRangeData.dateColumn && dateRangeData.availableDates.length > 0 ? (
          <div className="space-y-3">
            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label className="text-xs text-muted-foreground">From</Label>
                <Select 
                  value={selectedDateRange.fromDate} 
                  onValueChange={(value) => setSelectedDateRange(prev => ({ ...prev, fromDate: value }))}
                >
                  <SelectTrigger className="text-xs">
                    <SelectValue placeholder="Select start date" />
                  </SelectTrigger>
                  <SelectContent>
                    {dateRangeData.availableDates.map((date) => (
                      <SelectItem key={date} value={date}>
                        {date}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label className="text-xs text-muted-foreground">To</Label>
                <Select 
                  value={selectedDateRange.toDate} 
                  onValueChange={(value) => setSelectedDateRange(prev => ({ ...prev, toDate: value }))}
                >
                  <SelectTrigger className="text-xs">
                    <SelectValue placeholder="Select end date" />
                  </SelectTrigger>
                  <SelectContent>
                    {dateRangeData.availableDates.map((date) => (
                      <SelectItem key={date} value={date}>
                        {date}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>
            
            <div className="text-xs text-muted-foreground">
              Available range: {dateRangeData.minDate} to {dateRangeData.maxDate} 
              ({dateRangeData.availableDates.length} dates)
            </div>
          </div>
        ) : (
          <div className="text-center py-4 text-muted-foreground">
            <p className="text-xs">No date column found in the selected data file</p>
          </div>
        )}
      </Card>

      {/* Identifiers Selection */}
      <Card className="p-4 space-y-4">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Label className="text-sm font-medium">Identifiers</Label>
          </div>
          <Button 
            variant="outline" 
            size="sm" 
            onClick={handleSelectAllIdentifiers}
            className="text-blue-600 border-blue-200 hover:bg-blue-50"
          >
            {allIdentifiersSelected ? 'Deselect All' : 'Select All'}
          </Button>
        </div>
        
        <div className="max-h-40 overflow-y-auto space-y-2 border rounded-lg p-3 bg-gray-50">
          {availableIdentifiers.length > 0 && Object.keys(uniqueValues).length === 0 ? (
            // Loading state
            <div className="text-center py-4 text-gray-500">
              <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-blue-600 mx-auto mb-2"></div>
              <p className="text-xs">Loading identifier uniqueness data...</p>
            </div>
          ) : filteredIdentifiers.length === 0 ? (
            // No identifiers with multiple unique values
            <div className="text-center py-4 text-gray-500">
              <p className="text-xs">No identifiers found with multiple unique values</p>
              <p className="text-xs text-gray-400 mt-1">All available identifiers have only one unique value</p>
            </div>
          ) : (
            // Show filtered identifiers
            filteredIdentifiers.map((identifier) => (
              <CheckboxTemplate
                key={identifier}
                id={`identifier-${identifier}`}
                label={`${identifier} (${uniqueValues[identifier]?.length || 0} unique values)`}
                checked={selectedIdentifiers.includes(identifier)}
                onCheckedChange={(checked) => handleIdentifierToggle(identifier, checked)}
              />
            ))
          )}
        </div>
      </Card>

      {/* Measures Selection */}
      <Card className="p-4 space-y-4">
        <div className="flex items-center justify-between">
          <Label className="text-sm font-medium">Measures</Label>
          <Button 
            variant="outline" 
            size="sm" 
            onClick={handleSelectAllMeasures}
            className="text-emerald-600 border-emerald-200 hover:bg-emerald-50"
          >
            {allMeasuresSelected ? 'Deselect All' : 'Select All'}
          </Button>
        </div>
        
        <div className="max-h-40 overflow-y-auto space-y-2 border rounded-lg p-3 bg-gray-50">
          {/* Individual measures with checkboxes */}
          {clusteringData.availableMeasures?.map((measure) => (
            <CheckboxTemplate
              key={measure}
              id={`measure-${measure}`}
              label={measure}
              checked={selectedMeasures.includes(measure)}
              onCheckedChange={(checked) => handleMeasureToggle(measure, checked)}
            />
          ))}
        </div>
      </Card>

      {/* Clustering Method Selection */}
      <Card className="p-4 space-y-4">
        <div className="flex items-center gap-2 mb-3">
          <Label className="text-sm font-medium">Clustering Method</Label>
        </div>
        
        <div className="space-y-4">
          {/* Algorithm Selection */}
          <div className="space-y-2">
            <Label htmlFor="algorithm" className="text-xs text-muted-foreground">Algorithm</Label>
            <Select 
              value={clusteringData.algorithm || 'kmeans'} 
              onValueChange={(algorithm) => {
                console.log('🔧 Changing algorithm to:', algorithm);
                console.log('🔧 getCorrectAtomId() returns:', getCorrectAtomId());
                
                // Get current clustering data from the atom settings
                const currentClusteringData = atom?.settings?.clusteringData || {};
                
                updateSettings(getCorrectAtomId(), {
                  clusteringData: {
                    ...currentClusteringData,
                    algorithm: algorithm,
                    // Initialize K-selection parameters for K-based algorithms
                    ...(['kmeans', 'hac', 'birch', 'gmm'].includes(algorithm) ? {
                      k_selection: currentClusteringData.k_selection || 'elbow',
                      k_min: currentClusteringData.k_min || 2,
                      k_max: currentClusteringData.k_max || 10,
                      gap_b: currentClusteringData.gap_b || 10,
                      n_clusters: currentClusteringData.n_clusters || 3
                    } : {}),
                    // Update legacy clusteringConfig for backward compatibility
                    clusteringConfig: currentClusteringData.clusteringConfig
                      ? {
                          ...currentClusteringData.clusteringConfig,
                          clusteringMethod: algorithm.toUpperCase(),
                          algorithmParams: {
                            ...currentClusteringData.clusteringConfig.algorithmParams
                          }
                        }
                      : undefined
                  }
                });
                
                console.log('🔧 updateSettings called with ID:', getCorrectAtomId());
              }}
            >
              <SelectTrigger className="w-full">
                <SelectValue placeholder="Select clustering algorithm" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="kmeans">K-Means</SelectItem>
                <SelectItem value="dbscan">DBSCAN</SelectItem>
                <SelectItem value="hac">Hierarchical Agglomerative Clustering</SelectItem>
                <SelectItem value="birch">BIRCH</SelectItem>
                <SelectItem value="gmm">Gaussian Mixture Model</SelectItem>
              </SelectContent>
            </Select>
          </div>

          {/* Dynamic Algorithm Parameters */}
          {clusteringData.algorithm && (
            <div className="space-y-4">
              <div className="pt-3 border-t border-gray-200">
                <h4 className="text-sm font-medium text-gray-700 mb-3">Algorithm Parameters</h4>
                
                {/* Algorithm Status */}
                <div className="mb-2 p-2 bg-green-50 rounded border border-green-200 text-xs">
                  <strong>✓ Active:</strong> {clusteringData.algorithm?.toUpperCase()} algorithm with {getAlgorithmParameters(clusteringData.algorithm).length} parameters
                  {['kmeans', 'hac', 'birch', 'gmm'].includes(clusteringData.algorithm) && clusteringData.k_selection && (
                    <span className="ml-2 text-blue-600">
                      • K-selection: {clusteringData.k_selection === 'manual' ? 'Manual' : clusteringData.k_selection.charAt(0).toUpperCase() + clusteringData.k_selection.slice(1)}
                    </span>
                  )}
                  {clusteringData.algorithm === 'dbscan' && (
                    <span className="ml-2 text-green-600">
                      • Auto-clustering: Automatically determines number of clusters based on density
                    </span>
                  )}
                </div>

                {/* K-Selection Method (only for algorithms that use K) */}
                {['kmeans', 'hac', 'birch', 'gmm'].includes(clusteringData.algorithm) && (
                  <div className="space-y-3 mb-4 p-3 bg-blue-50 rounded border border-blue-200">
                    <div className="space-y-2">
                      <Label htmlFor="k_selection" className="text-xs text-muted-foreground">
                        K-Selection Method
                      </Label>
                      <Select 
                        value={getParameterValue('k_selection', clusteringData)}
                        onValueChange={(value) => handleParameterChange('k_selection', value)}
                      >
                        <SelectTrigger className="text-xs">
                          <SelectValue placeholder="Select K-selection method" />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="manual">Manual - Specify exact number of clusters</SelectItem>
                          <SelectItem value="elbow">Elbow Method - Automatic K selection using elbow curve (Default)</SelectItem>
                          <SelectItem value="silhouette">Silhouette Analysis - Automatic K selection using silhouette scores</SelectItem>
                          <SelectItem value="gap">Gap Statistic - Automatic K selection using gap statistic</SelectItem>
                        </SelectContent>
                      </Select>
                      
                      {/* Method-specific descriptions */}
                      <div className="text-xs text-blue-600 space-y-1">
                        {clusteringData.k_selection === 'manual' && (
                          <p>✓ You will specify the exact number of clusters below.</p>
                        )}
                        {clusteringData.k_selection === 'elbow' && (
                          <p>✓ Elbow method finds the "bend" in the within-cluster sum of squares curve. Good for finding natural breakpoints.</p>
                        )}
                        {clusteringData.k_selection === 'silhouette' && (
                          <p>✓ Silhouette analysis measures how similar an object is to its own cluster vs other clusters. Higher scores indicate better clustering.</p>
                        )}
                        {clusteringData.k_selection === 'gap' && (
                          <p>✓ Gap statistic compares the total within-cluster variation with expected values under a null reference distribution.</p>
                        )}
                        
                        {/* Additional info for auto methods */}
                        {clusteringData.k_selection !== 'manual' && (
                          <p className="text-blue-500 mt-2">
                            💡 The algorithm will try K values from {clusteringData.k_min || 2} to {clusteringData.k_max || 10} and select the optimal one.
                          </p>
                        )}
                      </div>
                    </div>
                  </div>
                )}

                {/* Dynamic Parameter Inputs */}
                <div className="space-y-3">
                  {/* K parameter validation warning */}
                  {['kmeans', 'hac', 'birch', 'gmm'].includes(clusteringData.algorithm) && 
                   clusteringData.k_selection !== 'manual' && 
                   !validateKParameters(clusteringData.k_min || 2, clusteringData.k_max || 10) && (
                    <div className="p-2 bg-red-50 border border-red-200 rounded text-xs text-red-700">
                      ⚠️ Warning: Invalid K range. Current range: {clusteringData.k_min || 2} to {clusteringData.k_max || 10}
                      <br />
                      • Minimum K must be less than Maximum K
                      <br />
                      • K range must be between 2 and 20
                      <br />
                      • Please adjust the K range parameters above.
                    </div>
                  )}
                  
                  {getAlgorithmParameters(clusteringData.algorithm).map((param) => (
                    <div key={param.name} className="space-y-2">
                      <Label htmlFor={param.name} className="text-xs text-muted-foreground">
                        {param.label}
                      </Label>
                      
                      {param.type === 'number' ? (
                        <Input
                          id={param.name}
                          type="number"
                          min={param.min}
                          max={param.max}
                          step={param.step || 1}
                          value={getParameterValue(param.name, clusteringData) || param.default}
                          onChange={(e) => handleParameterChange(param.name, parseFloat(e.target.value) || param.default)}
                          placeholder={param.default.toString()}
                          className="text-xs"
                        />
                      ) : param.type === 'select' ? (
                        <Select 
                          value={getParameterValue(param.name, clusteringData) || param.default}
                          onValueChange={(value) => handleParameterChange(param.name, value)}
                        >
                          <SelectTrigger className="text-xs">
                            <SelectValue placeholder={param.default.toString()} />
                          </SelectTrigger>
                          <SelectContent>
                            {param.options?.map((option) => (
                              <SelectItem key={option} value={option}>
                                {option}
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      ) : null}
                      
                      {param.description && (
                        <p className="text-xs text-gray-500">
                          {param.description}
                        </p>
                      )}
                    </div>
                  ))}
                </div>
              </div>
            </div>
          )}
        </div>
      </Card>
    </div>
  );
};

export default ClusteringSelections;

