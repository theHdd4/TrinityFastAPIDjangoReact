import React, { useEffect, useState } from 'react';
import { Card } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { useLaboratoryStore } from '@/components/LaboratoryMode/store/laboratoryStore';
import { VALIDATE_API, FEATURE_OVERVIEW_API, SCENARIO_PLANNER_API } from '@/lib/api';
import { useToast } from '@/hooks/use-toast';

interface Props {
  atomId: string;
  onCacheInitialized?: (d0_key: string) => void;
}

interface SavedDataFrame {
  object_name: string;
  csv_name: string;
  size?: number;
  last_modified?: string;
}

const ScenarioPlannerInputFiles: React.FC<Props> = ({ atomId, onCacheInitialized }) => {
  const atom = useLaboratoryStore(state => state.getAtom(atomId));
  const updateSettings = useLaboratoryStore(state => state.updateAtomSettings);
  const settings = atom?.settings || {};
  const { toast } = useToast();
  
  const scenarioData = settings.scenarioData || {};
  const [availableFiles, setAvailableFiles] = useState<SavedDataFrame[]>([]);
  const [selectedFile, setSelectedFile] = useState<string>('');
  const [loading, setLoading] = useState(false);
  const [initializingCache, setInitializingCache] = useState(false);

  // Fetch available files when component mounts - only once
  useEffect(() => {
    const fetchFiles = async () => {
      setLoading(true);
      try {
        console.log('Fetching files from:', `${VALIDATE_API}/list_saved_dataframes`);
        const response = await fetch(`${VALIDATE_API}/list_saved_dataframes`);
        console.log('Response status:', response.status, response.statusText);
        
        if (response.ok) {
          const data = await response.json();
          console.log('Files response data:', data);
          const files = Array.isArray(data.files) ? data.files : [];
          console.log('Processed files:', files);
          setAvailableFiles(files);
        } else {
          console.error('Failed to fetch files:', response.status, response.statusText);
        }
      } catch (error) {
        console.error('Error fetching files:', error);
      } finally {
        setLoading(false);
      }
    };

    fetchFiles();
  }, []); // Only run once on mount

  // Fetch identifiers from backend
  const fetchIdentifiers = async (fileName: string) => {
    try {
      const response = await fetch(`${SCENARIO_PLANNER_API}/identifiers`);
      if (response.ok) {
        const data = await response.json();
        console.log('Identifiers loaded:', data);
        
        // Store identifiers in shared store so Settings component can access them
        console.log('Storing identifiers in shared store:', data);
        updateSettings(atomId, {
          backendIdentifiers: data
        });
        
        return data;
      } else {
        throw new Error(`Failed to fetch identifiers: ${response.statusText}`);
      }
    } catch (error) {
      console.error('Error fetching identifiers:', error);
      throw error;
    }
  };

  // Fetch features from backend
  const fetchFeatures = async (fileName: string) => {
    try {
      const response = await fetch(`${SCENARIO_PLANNER_API}/features`);
      if (response.ok) {
        const data = await response.json();
        console.log('Features loaded:', data);
        
        // Store features in shared store so Settings component can access them
        console.log('Storing features in shared store:', data);
        updateSettings(atomId, {
          backendFeatures: data
        });
        
        return data;
      } else {
        throw new Error(`Failed to fetch features: ${response.statusText}`);
      }
    } catch (error) {
      console.error('Error fetching features:', error);
      throw error;
    }
  };

  // Initialize cache for scenario planning
  const initializeScenarioCache = async (fileName: string) => {
    try {
      setInitializingCache(true);
      
      // Step 1: Initialize cache
      const response = await fetch(`${SCENARIO_PLANNER_API}/init-cache?d0_key=${encodeURIComponent(fileName)}&force_refresh=false`, {
        method: 'GET'
      });
      
      if (response.ok) {
        const data = await response.json();
        toast({
          title: "Cache Initialized",
          description: `Dataset cached successfully: ${data.action}`,
          variant: "default",
        });
        
        // Step 2: Automatically fetch identifiers and features
        try {
          await Promise.all([
            fetchIdentifiers(fileName),
            fetchFeatures(fileName)
          ]);
          
          // Step 3: Notify parent component that cache is ready
          if (onCacheInitialized) {
            onCacheInitialized(fileName);
          }
          
          toast({
            title: "✅ Scenario Planner Ready",
            description: "Identifiers and features loaded automatically",
            variant: "default",
          });
          
        } catch (fetchError) {
          console.error('Failed to fetch identifiers/features:', fetchError);
          toast({
            title: "⚠️ Partial Success",
            description: "Cache initialized but failed to load some data",
            variant: "default",
          });
        }
        
        return data;
      } else {
        const errorData = await response.json();
        throw new Error(errorData.detail || `Failed to initialize cache: ${response.statusText}`);
      }
    } catch (error) {
      console.error('Error initializing scenario cache:', error);
      toast({
        title: "Cache Error",
        description: error instanceof Error ? error.message : "Failed to initialize scenario cache",
        variant: "destructive",
      });
      throw error;
    } finally {
      setInitializingCache(false);
    }
  };

  // Manual fetch columns when file is selected - no useEffect loop
  const handleFileSelect = async (fileName: string) => {
    console.log('File selected:', fileName);
    setSelectedFile(fileName);
    
    if (!fileName) return;
    
    setLoading(true);
    try {
      // Fetch column summary
      const response = await fetch(`${FEATURE_OVERVIEW_API}/column_summary?object_name=${encodeURIComponent(fileName)}`);
      if (response.ok) {
        const data = await response.json();
        const summaryData = Array.isArray(data.summary) ? data.summary.filter(Boolean) : [];
        
        // Auto-identify identifiers and measures based on data types (but don't auto-select)
        const identifiers = summaryData
          .filter((col: any) => {
            const dataType = col.data_type?.toLowerCase() || '';
            return (dataType === 'object' || dataType === 'category' || dataType === 'string' || 
                   dataType === 'datetime64[ns]' || dataType === 'bool') && col.column;
          })
          .map((col: any) => col.column);
        
        const measures = summaryData
          .filter((col: any) => {
            const dataType = col.data_type?.toLowerCase() || '';
            return (dataType.includes('int') || dataType.includes('float') || dataType.includes('number')) && col.column;
          })
          .map((col: any) => col.column);
        
        // Update store with selected file and available columns
        updateSettings(atomId, {
          scenarioData: {
            ...scenarioData,
            selectedDataFile: fileName,
            objectName: fileName,
            allColumns: summaryData.map((col: any) => col.column),
            availableIdentifiers: identifiers,
            availableMeasures: measures,
            selectedIdentifiers: [], // Start with empty selection
            selectedMeasures: []     // Start with empty selection
          }
        });

        // Initialize scenario planner cache with the selected file
        try {
          await initializeScenarioCache(fileName);
          toast({
            title: "Ready for Scenario Planning",
            description: "Dataset cached and ready for scenario planning",
            variant: "default",
          });
        } catch (error) {
          console.error('Failed to initialize scenario cache:', error);
        }
      } else {
        console.error('Failed to fetch columns:', response.status, response.statusText);
      }
    } catch (error) {
      console.error('Error fetching columns:', error);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="space-y-6">
      {/* File Selection */}
      <Card className="p-6">
        <div className="flex items-center justify-between mb-4">
          <h3 className="text-lg font-semibold">🚀 Auto-Initialize Scenario Planner</h3>
          {availableFiles.length > 0 && (
            <Badge variant="outline" className="text-sm">
              {availableFiles.length} file{availableFiles.length !== 1 ? 's' : ''} available
            </Badge>
          )}
        </div>
        
        <p className="text-sm text-gray-600 mb-4">
          Simply select a file and the scenario planner will automatically initialize with all identifiers and features ready to use.
        </p>
        
        {loading ? (
          <div className="text-center py-8">
            <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600 mx-auto mb-2"></div>
            <p className="text-gray-600">Loading available files...</p>
          </div>
        ) : (
          <div className="space-y-4">
            <div className="flex items-center space-x-4">
              <Label htmlFor="file-select" className="text-sm font-medium text-gray-700">
                Choose a data file:
              </Label>
              <Select onValueChange={handleFileSelect} value={selectedFile}>
                <SelectTrigger id="file-select" className="w-[300px]">
                  <SelectValue placeholder="Select a file" />
                </SelectTrigger>
                <SelectContent>
                  {availableFiles.map((file) => (
                    <SelectItem key={file.object_name} value={file.object_name}>
                      <div className="flex flex-col">
                        <span className="font-medium">{file.csv_name || file.object_name}</span>
                        {file.size && (
                          <span className="text-xs text-gray-500">
                            Size: {(file.size / 1024 / 1024).toFixed(2)} MB
                          </span>
                        )}
                      </div>
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            
            {availableFiles.length === 0 && (
              <div className="text-center py-8 text-gray-500">
                <p>No files available. Please upload a file first.</p>
              </div>
            )}
          </div>
        )}
      </Card>

      {/* Selected File Info */}
                  {selectedFile && (
              <Card className="p-4 bg-blue-50 border border-blue-200">
                <div className="flex items-center justify-between">
                  <div className="flex-1">
                    <h4 className="font-medium text-blue-900">Selected File</h4>
                    <p className="text-sm text-blue-700">{selectedFile}</p>
                    <p className="text-xs text-blue-600 mt-1">
                      {initializingCache 
                        ? "🔄 Auto-initializing scenario planner..." 
                        : "✅ File ready! Identifiers and features loaded automatically."
                      }
                    </p>
                  </div>
                  <Badge className={`${initializingCache ? 'bg-yellow-100 text-yellow-800' : 'bg-green-100 text-green-800'}`}>
                    {initializingCache ? '🔄 Auto-Initializing...' : '🚀 Ready to Plan!'}
                  </Badge>
                </div>
              </Card>
            )}
    </div>
  );
};

export default ScenarioPlannerInputFiles;
