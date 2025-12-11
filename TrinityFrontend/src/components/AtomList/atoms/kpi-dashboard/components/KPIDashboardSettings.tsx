import React, { useState, useEffect, useRef } from 'react';
import { Label } from '@/components/ui/label';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Card } from '@/components/ui/card';
import { Checkbox } from '@/components/ui/checkbox';
import { Button } from '@/components/ui/button';
import { Plus, X, Upload, ImageIcon, BarChart3 } from 'lucide-react';
import { VALIDATE_API, LABORATORY_API, IMAGES_API } from '@/lib/api';
import { getActiveProjectContext } from '@/utils/projectEnv';
import type { KPIDashboardData, KPIDashboardSettings as KPISettings } from '../KPIDashboardAtom';
import { useLaboratoryStore } from '@/components/LaboratoryMode/store/laboratoryStore';

interface KPIDashboardSettingsProps {
  settings: KPISettings;
  onSettingsChange: (settings: Partial<KPISettings>) => void;
  onDataUpload: (data: KPIDashboardData) => void;
  availableColumns: string[];
}

interface Frame {
  object_name: string;
  arrow_name?: string;
  csv_name?: string;
}


const KPIDashboardSettings: React.FC<KPIDashboardSettingsProps> = ({
  settings,
  onSettingsChange,
  onDataUpload,
  availableColumns
}) => {
  const [frames, setFrames] = useState<Frame[]>([]);
  const [selectedFile, setSelectedFile] = useState<string>('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  // State for variable identifier filters
  const [identifierOptions, setIdentifierOptions] = useState<Record<string, string[]>>({});
  const [selectedFilters, setSelectedFilters] = useState<Record<string, string>>({});
  const [loadingFilters, setLoadingFilters] = useState(false);
  const [availableVariables, setAvailableVariables] = useState<any[]>([]);
  // Image upload state
  const [uploadingImage, setUploadingImage] = useState(false);
  const [imageUploadError, setImageUploadError] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Fetch available dataframes from database
  useEffect(() => {
    fetch(`${VALIDATE_API}/list_saved_dataframes`)
      .then(r => r.json())
      .then(d => {
        // Filter to only show Arrow files
        const allFiles = Array.isArray(d.files) ? d.files : [];
        const arrowFiles = allFiles.filter(f => 
          f.object_name && f.object_name.endsWith('.arrow')
        );
        setFrames(arrowFiles);
      })
      .catch((err) => {
        console.error('Failed to fetch dataframes:', err);
        setFrames([]);
      });
  }, []);


  // Load dataframe data when file is selected
  const handleFileSelect = async (fileId: string) => {
    setSelectedFile(fileId);
    setLoading(true);
    setError(null);

    try {
      const response = await fetch(`${VALIDATE_API}/load_dataframe_by_key`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ key: fileId })
      });

      if (!response.ok) {
        throw new Error('Failed to load dataframe');
      }

      const data = await response.json();
      const frame = frames.find(f => f.object_name === fileId);
      
      onDataUpload({
        headers: data.headers || [],
        rows: data.rows || [],
        fileName: frame?.arrow_name?.split('/').pop() || fileId,
        metrics: []
      });

      setLoading(false);
    } catch (err) {
      console.error('Error loading dataframe:', err);
      setError('Failed to load dataframe');
      setLoading(false);
    }
  };

  const toggleMetricColumn = (column: string) => {
    const current = settings.metricColumns || [];
    const updated = current.includes(column)
      ? current.filter(c => c !== column)
      : [...current, column];
    onSettingsChange({ metricColumns: updated });
  };

  // Find the selected box (for metric-card, image, or chart)
  const selectedBox = settings.layouts?.flatMap(layout => layout.boxes)
    .find(box => box.id === settings.selectedBoxId && (box.elementType === 'metric-card' || box.elementType === 'image' || box.elementType === 'chart'));
  
  // Find the selected image box specifically
  const selectedImageBox = settings.layouts?.flatMap(layout => layout.boxes)
    .find(box => box.id === settings.selectedBoxId && box.elementType === 'image');
  

  // Fetch variable options when a metric card with variable is selected
  useEffect(() => {
    console.log('🔍 useEffect triggered - selectedBox:', {
      hasBox: !!selectedBox,
      variableNameKey: selectedBox?.variableNameKey,
      variableId: selectedBox?.variableId,
      variableName: selectedBox?.variableName,
      elementType: selectedBox?.elementType
    });
    
    // Use variableNameKey if available, otherwise fall back to variableName
    // The variableName often contains the same information as variableNameKey
    const variableKey = selectedBox?.variableNameKey || selectedBox?.variableName;
    
    if (!variableKey) {
      console.log('⚠️ No variableNameKey or variableName found, clearing filters');
      setIdentifierOptions({});
      setSelectedFilters({});
      setAvailableVariables([]);
      return;
    }
    
    console.log('🔍 Using variable key for filtering:', variableKey);
    
    const fetchVariableOptions = async () => {
      setLoadingFilters(true);
      try {
        const projectContext = getActiveProjectContext();
        if (!projectContext) return;

        const params = new URLSearchParams({
          clientId: projectContext.client_name,
          appId: projectContext.app_name,
          projectId: projectContext.project_name,
        });

        const response = await fetch(`${LABORATORY_API}/variables?${params.toString()}`, {
          credentials: 'include',
        });

        if (response.ok) {
          const result = await response.json();
          if (result.variables && Array.isArray(result.variables)) {
            // Use variableNameKey if available, otherwise use variableName
            const currentKey = selectedBox.variableNameKey || selectedBox.variableName || '';
            const currentKeyParts = currentKey.split('_');
            
            console.log('🔍 Current variable key for matching:', currentKey);
            console.log('🔍 Total variables available:', result.variables.length);
            
            // Find all variables with similar base structure
            // Match variables that start with the same measure/aggregation (first 2 parts)
            // e.g., "salesvalue_sum" should match "salesvalue_sum_brand_*_year_*"
            const basePattern = currentKeyParts.slice(0, 2).join('_'); // e.g., "salesvalue_sum"
            
            console.log('🔍 Base pattern for matching:', basePattern);
            
            const relatedVariables = result.variables.filter((v: any) => {
              // Use variableNameKey if available, otherwise use variableName
              const vKey = v.variableNameKey || v.variableName;
              if (!vKey) return false;
              // Match if it starts with the same base pattern
              return vKey.startsWith(basePattern + '_') || vKey === basePattern;
            });
            
            console.log('🔍 Found related variables:', relatedVariables.length, 'for base pattern:', basePattern);
            console.log('🔍 Sample variables:', relatedVariables.slice(0, 5).map((v: any) => ({
              key: v.variableNameKey,
              name: v.variableName,
              value: v.value
            })));
            
            if (relatedVariables.length === 0) {
              console.warn('⚠️ No related variables found! Current key:', currentKey);
              console.warn('⚠️ All available variables:', result.variables.slice(0, 5).map((v: any) => v.variableNameKey));
            }
            
            setAvailableVariables(relatedVariables);
            
            // First, parse identifiers ONLY from the current variable to determine which identifiers exist
            // Use variableNameKey if available, otherwise use variableName
            const currentVariableKey = selectedBox.variableNameKey || selectedBox.variableName;
            const currentVariableIdentifiers: Set<string> = new Set();
            
            if (currentVariableKey) {
              const parts = currentVariableKey.split('_');
              const identifierTypes = ['brand', 'channel', 'year', 'month', 'week', 'region', 'category', 'segment'];
              
              // Skip the first 2 parts (measure and aggregation method: salesvalue_sum)
              let i = 2;
              while (i < parts.length) {
                const key = parts[i].toLowerCase();
                
                // Check if this is an identifier type
                if (identifierTypes.includes(key) && i + 1 < parts.length) {
                  currentVariableIdentifiers.add(key);
                  
                  // Skip the value and move to next identifier
                  let nextIndex = i + 2;
                  while (nextIndex < parts.length) {
                    const nextPart = parts[nextIndex].toLowerCase();
                    if (!identifierTypes.includes(nextPart)) {
                      nextIndex++;
                    } else {
                      break;
                    }
                  }
                  i = nextIndex;
                } else {
                  i++;
                }
              }
            }
            
            console.log('🔍 Current variable identifiers:', Array.from(currentVariableIdentifiers));
            
            // Now parse identifier values from ALL related variables, but ONLY for identifiers that exist in current variable
            // Pattern: salesvalue_sum_brand_svelty_year_2024_channel_traditional trade
            const identifierMap: Record<string, Set<string>> = {};
            
            relatedVariables.forEach((v: any) => {
              // Use variableNameKey if available, otherwise use variableName
              const vKey = v.variableNameKey || v.variableName;
              if (vKey) {
                const parts = vKey.split('_');
                const identifierTypes = ['brand', 'channel', 'year', 'month', 'week', 'region', 'category', 'segment'];
                
                // Skip the first 2 parts (measure and aggregation method: salesvalue_sum)
                let i = 2;
                while (i < parts.length) {
                  const key = parts[i].toLowerCase();
                  
                  // Only process identifiers that exist in the current variable
                  if (identifierTypes.includes(key) && currentVariableIdentifiers.has(key) && i + 1 < parts.length) {
                    // Get the value - might be single word or multi-word
                    let value = parts[i + 1];
                    let nextIndex = i + 2;
                    
                    // Collect all consecutive non-identifier parts as the value
                    while (nextIndex < parts.length) {
                      const nextPart = parts[nextIndex].toLowerCase();
                      if (!identifierTypes.includes(nextPart)) {
                        value += '_' + parts[nextIndex];
                        nextIndex++;
                      } else {
                        break;
                      }
                    }
                    
                    if (!identifierMap[key]) {
                      identifierMap[key] = new Set();
                    }
                    identifierMap[key].add(value);
                    
                    i = nextIndex; // Move to next identifier
                  } else {
                    i++; // Skip non-identifier parts
                  }
                }
              }
            });
            
            console.log('🔍 Parsed identifier map (only for current variable identifiers):', identifierMap);
            console.log('🔍 Identifier map keys:', Object.keys(identifierMap));
            console.log('🔍 Identifier map values:', Object.entries(identifierMap).map(([k, v]) => [k, Array.from(v as Set<string>)]));
            
            // Convert Sets to Arrays - only include identifiers that exist in current variable
            const options: Record<string, string[]> = {};
            currentVariableIdentifiers.forEach(key => {
              if (identifierMap[key]) {
                options[key] = Array.from(identifierMap[key]).sort();
              }
            });
            
            console.log('🔍 Extracted identifier options:', options);
            console.log('🔍 Number of identifier types found:', Object.keys(options).length);
            console.log('🔍 Will show filters:', Object.keys(options).length > 0);
            
            setIdentifierOptions(options);
            
            // Set initial filter values from current variable
            if (currentVariableKey) {
              const parts = currentVariableKey.split('_');
              const currentFilters: Record<string, string> = {};
              const identifierTypes = ['brand', 'channel', 'year', 'month', 'week', 'region', 'category', 'segment'];
              
              let i = 2;
              while (i < parts.length) {
                const key = parts[i].toLowerCase();
                
                if (identifierTypes.includes(key) && currentVariableIdentifiers.has(key) && i + 1 < parts.length) {
                  let value = parts[i + 1];
                  let nextIndex = i + 2;
                  
                  // Collect multi-word values
                  while (nextIndex < parts.length) {
                    const nextPart = parts[nextIndex].toLowerCase();
                    if (!identifierTypes.includes(nextPart)) {
                      value += '_' + parts[nextIndex];
                      nextIndex++;
                    } else {
                      break;
                    }
                  }
                  
                  if (options[key]) {
                    currentFilters[key] = value;
                  }
                  
                  i = nextIndex;
                } else {
                  i++;
                }
              }
              
              console.log('🔍 Current filters:', currentFilters);
              setSelectedFilters(currentFilters);
            }
          }
        }
      } catch (error) {
        console.error('Failed to fetch variable options:', error);
      } finally {
        setLoadingFilters(false);
      }
    };

    fetchVariableOptions();
  }, [selectedBox?.variableNameKey, selectedBox?.variableName]);

  // Find matching variable based on selected filters
  const findMatchingVariable = (filters: Record<string, string>) => {
    const activeFilters = Object.entries(filters).filter(([_, val]) => val !== '');
    if (activeFilters.length === 0) return null;
    
    const identifierTypes = ['brand', 'channel', 'year', 'month', 'week', 'region', 'category', 'segment'];
    
    return availableVariables.find((v: any) => {
      // Use variableNameKey if available, otherwise use variableName
      const vKey = v.variableNameKey || v.variableName;
      if (!vKey) return false;
      const parts = vKey.split('_');
      const varIdentifiers: Record<string, string> = {};
      
      // Parse identifiers from variable (skip first 2 parts: measure and aggregation)
      let i = 2;
      while (i < parts.length) {
        const key = parts[i].toLowerCase();
        
        if (identifierTypes.includes(key) && i + 1 < parts.length) {
          let value = parts[i + 1];
          let nextIndex = i + 2;
          
          // Collect multi-word values
          while (nextIndex < parts.length) {
            const nextPart = parts[nextIndex].toLowerCase();
            if (!identifierTypes.includes(nextPart)) {
              value += '_' + parts[nextIndex];
              nextIndex++;
            } else {
              break;
            }
          }
          
          if (identifierOptions[key]) {
            varIdentifiers[key] = value;
          }
          
          i = nextIndex;
        } else {
          i++;
        }
      }
      
      // Check if all selected filters match
      const allMatch = activeFilters.every(([key, val]) => 
        varIdentifiers[key] === val
      );
      
      if (allMatch) {
        console.log('✅ Found matching variable:', v.variableNameKey, 'with value:', v.value);
      }
      
      return allMatch;
    });
  };

  // Handle filter change
  const handleFilterChange = (identifier: string, value: string) => {
    // Handle "All" option (value === "__all__")
    const filterValue = value === '__all__' ? '' : value;
    const newFilters = { ...selectedFilters, [identifier]: filterValue };
    setSelectedFilters(newFilters);
    
    // Find matching variable (only if we have active filters)
    const matchingVar = findMatchingVariable(newFilters);
    if (matchingVar && selectedBox) {
            // Update the box with the new variable
            // Preserve the metricLabel (display label) - don't overwrite user's custom label
            const updatedLayouts = settings.layouts?.map(layout => ({
              ...layout,
              boxes: layout.boxes.map(box => 
                box.id === settings.selectedBoxId 
                  ? {
                      ...box,
                      variableId: matchingVar.id,
                      variableName: matchingVar.variableName, // Update actual variable name
                      variableNameKey: matchingVar.variableNameKey || matchingVar.variableName, // Update key for filtering (use variableNameKey or variableName)
                      metricValue: matchingVar.value || '0',
                      value: matchingVar.value,
                      // Keep existing metricLabel if user has customized it, otherwise use variable name
                      metricLabel: box.metricLabel || matchingVar.variableName,
                    }
                  : box
              )
            }));
            onSettingsChange({ layouts: updatedLayouts });
    }
  };

  return (
    <div className="space-y-6 p-2">
      {/* Select Dataframe from Database */}
      <div className="space-y-2">
        <Label className="text-sm font-medium">Data Source</Label>
        <Card className="p-4 space-y-3">
          <Select value={selectedFile} onValueChange={handleFileSelect}>
            <SelectTrigger className="w-full bg-white border-gray-300">
              <SelectValue placeholder="Select a saved dataframe..." />
            </SelectTrigger>
            <SelectContent>
              {frames.length === 0 ? (
                <SelectItem value="no-data" disabled>
                  No dataframes available
                </SelectItem>
              ) : (
                frames.map(f => (
                  <SelectItem key={f.object_name} value={f.object_name}>
                    {f.arrow_name?.split('/').pop() || f.csv_name || f.object_name}
                  </SelectItem>
                ))
              )}
            </SelectContent>
          </Select>
          {loading && (
            <p className="text-xs text-blue-600">Loading dataframe...</p>
          )}
          {error && (
            <p className="text-xs text-red-600">{error}</p>
          )}
        </Card>
        <p className="text-xs text-muted-foreground">
          Select a dataframe from the database to use as data source
        </p>
      </div>

      {/* Dashboard Title */}
      <div className="space-y-2">
        <Label htmlFor="title" className="text-sm font-medium">
          Dashboard Title
        </Label>
        <Input
          id="title"
          value={settings.title}
          onChange={(e) => onSettingsChange({ title: e.target.value })}
          placeholder="Enter dashboard title"
          className="w-full"
        />
      </div>

      {/* Select Metric Columns */}
      {availableColumns.length > 0 && (
        <div className="space-y-3">
          <Label className="text-sm font-medium">Select Metrics to Display</Label>
          <div className="space-y-2 max-h-64 overflow-y-auto pr-2">
            {availableColumns.map((column) => (
              <div
                key={column}
                className="flex items-center space-x-2 p-2 rounded-md hover:bg-muted/50 transition-colors"
              >
                <Checkbox
                  id={`metric-${column}`}
                  checked={settings.metricColumns.includes(column)}
                  onCheckedChange={() => toggleMetricColumn(column)}
                />
                <label
                  htmlFor={`metric-${column}`}
                  className="text-sm cursor-pointer flex-1"
                >
                  {column}
                </label>
              </div>
            ))}
          </div>
          <p className="text-xs text-muted-foreground">
            Selected: {settings.metricColumns.length} metrics
          </p>
        </div>
      )}

      {/* Element Format Setting - Only show when a metric card is selected */}
      {!selectedBox ? (
        <div className="space-y-2 p-4 bg-gray-50 rounded-lg border border-gray-200">
          <p className="text-xs text-muted-foreground text-center">
            Select a metric card element to configure its number format
          </p>
        </div>
      ) : (
        <div className="space-y-4">
          {/* Variable Info */}
          {!selectedBox.variableNameKey && !selectedBox.variableName ? (
            <div className="p-3 bg-orange-50 rounded-lg border border-orange-200">
              <p className="text-xs font-semibold text-orange-900 mb-1">⚠️ No Variable Selected</p>
              <p className="text-xs text-orange-800">
                Click "Add Variable" on the metric card to select a variable. Filters will appear after a variable is selected.
              </p>
            </div>
          ) : (selectedBox.variableNameKey || selectedBox.variableName) ? (
            <div className="p-3 bg-blue-50 rounded-lg border border-blue-200">
              <p className="text-xs font-semibold text-blue-900 mb-1">Variable Name</p>
              <p className="text-sm text-blue-800 break-all">{selectedBox.variableName}</p>
              {selectedBox.variableNameKey && (
                <p className="text-xs text-blue-700 mt-1 break-all">Key: {selectedBox.variableNameKey}</p>
              )}
              <p className="text-xs text-blue-600 mt-2 italic">
                Display Label: "{selectedBox.metricLabel || selectedBox.variableName}"
              </p>
            </div>
          ) : null}

          {/* Identifier Filters */}
          {loadingFilters ? (
            <div className="p-3 bg-gray-50 rounded-lg border border-gray-200">
              <p className="text-xs text-muted-foreground text-center">Loading filter options...</p>
            </div>
          ) : Object.keys(identifierOptions).length > 0 ? (
            <div className="space-y-3">
              <Label className="text-sm font-medium">Filter by Identifiers</Label>
              {Object.keys(identifierOptions).map((identifier) => (
                <div key={identifier} className="space-y-2">
                  <Label htmlFor={`filter-${identifier}`} className="text-xs font-medium capitalize">
                    {identifier} ({identifierOptions[identifier].length} options)
                  </Label>
                  <Select
                    value={selectedFilters[identifier] ? selectedFilters[identifier] : '__all__'}
                    onValueChange={(value) => handleFilterChange(identifier, value)}
                    disabled={loadingFilters}
                  >
                    <SelectTrigger className="w-full bg-white border-gray-300">
                      <SelectValue placeholder={`Select ${identifier}...`} />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="__all__">All {identifier}s</SelectItem>
                      {identifierOptions[identifier].map((value) => (
                        <SelectItem key={value} value={value}>
                          {value.replace(/_/g, ' ')}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              ))}
              <p className="text-xs text-muted-foreground">
                Select identifier values to filter the variable. The metric card will update automatically.
              </p>
            </div>
          ) : (selectedBox.variableNameKey || selectedBox.variableName) ? (
            <div className="p-3 bg-yellow-50 rounded-lg border border-yellow-200">
              <p className="text-xs text-yellow-800 text-center font-semibold">
                No identifier filters found.
              </p>
              <p className="text-xs text-yellow-700 text-center mt-1 break-all">
                Variable key: {selectedBox.variableNameKey}
              </p>
              <p className="text-xs text-yellow-700 text-center mt-1">
                Found {availableVariables.length} related variables.
              </p>
              {availableVariables.length > 0 && (
                <div className="mt-2 p-2 bg-yellow-100 rounded text-xs">
                  <p className="font-semibold mb-1">Sample related variables:</p>
                  {availableVariables.slice(0, 3).map((v: any, idx: number) => (
                    <p key={idx} className="break-all">{v.variableNameKey}</p>
                  ))}
                </div>
              )}
              <p className="text-xs text-yellow-700 text-center mt-2">
                Make sure variables have identifier patterns like brand_*, year_*, channel_* after the base pattern (e.g., salesvalue_sum_*).
              </p>
            </div>
          ) : null}

          {/* Number Format */}
          <div className="space-y-2">
            <Label htmlFor="elementValueFormat" className="text-sm font-medium">
              Number Format
            </Label>
            <Select
              value={selectedBox.valueFormat || 'none'}
              onValueChange={(value) => {
                // Update the specific box's valueFormat
                const updatedLayouts = settings.layouts?.map(layout => ({
                  ...layout,
                  boxes: layout.boxes.map(box => 
                    box.id === settings.selectedBoxId 
                      ? { ...box, valueFormat: value as 'none' | 'thousands' | 'millions' | 'billions' | 'lakhs' }
                      : box
                  )
                }));
                onSettingsChange({ layouts: updatedLayouts });
              }}
            >
              <SelectTrigger className="w-full bg-white border-gray-300">
                <SelectValue placeholder="Select format..." />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="none">No Format</SelectItem>
                <SelectItem value="thousands">Thousands (K)</SelectItem>
                <SelectItem value="millions">Millions (M)</SelectItem>
                <SelectItem value="billions">Billions (B)</SelectItem>
                <SelectItem value="lakhs">Lakhs (L)</SelectItem>
              </SelectContent>
            </Select>
            
            <div className="space-y-2">
              <Label htmlFor="valueDecimalPlaces" className="text-xs font-medium">
                Decimal Places
              </Label>
              <Input
                id="valueDecimalPlaces"
                type="number"
                min="0"
                max="10"
                value={selectedBox.valueDecimalPlaces !== undefined ? selectedBox.valueDecimalPlaces : 1}
                onChange={(e) => {
                  const decimalPlaces = parseInt(e.target.value) || 1;
                  const updatedLayouts = settings.layouts?.map(layout => ({
                    ...layout,
                    boxes: layout.boxes.map(box => 
                      box.id === settings.selectedBoxId 
                        ? { ...box, valueDecimalPlaces: decimalPlaces }
                        : box
                    )
                  }));
                  onSettingsChange({ layouts: updatedLayouts });
                }}
                className="w-full"
              />
              <p className="text-xs text-muted-foreground">
                Number of decimal places for the main value (0-10)
              </p>
            </div>
            
            <p className="text-xs text-muted-foreground">
              Format for displaying values in the selected metric card
            </p>
          </div>

          {/* Additional Line */}
          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <Label className="text-sm font-medium">
                Additional Line
              </Label>
              {selectedBox.additionalLine === undefined || selectedBox.additionalLine === null ? (
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={() => {
                    const updatedLayouts = settings.layouts?.map(layout => ({
                      ...layout,
                      boxes: layout.boxes.map(box => 
                        box.id === settings.selectedBoxId 
                          ? { ...box, additionalLine: '' }
                          : box
                      )
                    }));
                    onSettingsChange({ layouts: updatedLayouts });
                  }}
                  className="h-7 text-xs"
                >
                  <Plus className="w-3 h-3 mr-1" />
                  Add Line
                </Button>
              ) : (
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={() => {
                    const updatedLayouts = settings.layouts?.map(layout => ({
                      ...layout,
                      boxes: layout.boxes.map(box => 
                        box.id === settings.selectedBoxId 
                          ? { ...box, additionalLine: undefined }
                          : box
                      )
                    }));
                    onSettingsChange({ layouts: updatedLayouts });
                  }}
                  className="h-7 text-xs text-red-600 hover:text-red-700"
                >
                  <X className="w-3 h-3 mr-1" />
                  Remove
                </Button>
              )}
            </div>
            {selectedBox.additionalLine !== undefined && selectedBox.additionalLine !== null && (
              <Input
                value={selectedBox.additionalLine || ''}
                onChange={(e) => {
                  const updatedLayouts = settings.layouts?.map(layout => ({
                    ...layout,
                    boxes: layout.boxes.map(box => 
                      box.id === settings.selectedBoxId 
                        ? { ...box, additionalLine: e.target.value }
                        : box
                    )
                  }));
                  onSettingsChange({ layouts: updatedLayouts });
                }}
                placeholder="Enter additional information..."
                className="w-full"
              />
            )}
            <p className="text-xs text-muted-foreground">
              Add an optional third line of gray text below the project name
            </p>
          </div>

          {/* Growth Rate */}
          <div className="space-y-3">
            <div className="flex items-center space-x-2">
              <Checkbox
                id="showGrowthRate"
                checked={selectedBox.showGrowthRate || false}
                onCheckedChange={(checked) => {
                  const updatedLayouts = settings.layouts?.map(layout => ({
                    ...layout,
                    boxes: layout.boxes.map(box => 
                      box.id === settings.selectedBoxId 
                        ? { 
                            ...box, 
                            showGrowthRate: checked as boolean,
                            // Clear growth rate data if disabling
                            ...(checked ? {} : { growthRateValue: undefined, comparisonValue: undefined })
                          }
                        : box
                    )
                  }));
                  onSettingsChange({ layouts: updatedLayouts });
                }}
              />
              <Label htmlFor="showGrowthRate" className="text-sm font-medium cursor-pointer">
                Show Growth Rate
              </Label>
            </div>
            
            {selectedBox.showGrowthRate && (
              <div className="space-y-2 pl-6">
                <Label htmlFor="comparisonIdentifier" className="text-xs font-medium">
                  Compare By Identifier
                </Label>
                <Select
                  value={selectedBox.comparisonIdentifier || ''}
                  onValueChange={(comparisonIdentifier) => {
                    const updatedLayouts = settings.layouts?.map(layout => ({
                      ...layout,
                      boxes: layout.boxes.map(box => 
                        box.id === settings.selectedBoxId 
                          ? { ...box, comparisonIdentifier, comparisonIdentifierValue: undefined, growthRateValue: undefined, comparisonValue: undefined }
                          : box
                      )
                    }));
                    onSettingsChange({ layouts: updatedLayouts });
                  }}
                >
                  <SelectTrigger className="w-full bg-white border-gray-300">
                    <SelectValue placeholder="Select identifier to vary..." />
                  </SelectTrigger>
                  <SelectContent>
                    {Object.keys(identifierOptions).map((identifier) => (
                      <SelectItem key={identifier} value={identifier}>
                        {identifier.charAt(0).toUpperCase() + identifier.slice(1)}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                
                {selectedBox.comparisonIdentifier && identifierOptions[selectedBox.comparisonIdentifier] && (
                  <div className="space-y-2">
                    <Label htmlFor="comparisonIdentifierValue" className="text-xs font-medium">
                      Comparison Value
                    </Label>
                    <Select
                      value={selectedBox.comparisonIdentifierValue || ''}
                      onValueChange={(comparisonIdentifierValue) => {
                        const updatedLayouts = settings.layouts?.map(layout => ({
                          ...layout,
                          boxes: layout.boxes.map(box => {
                            if (box.id !== settings.selectedBoxId) return box;
                            
                            // Find comparison variable and calculate growth rate
                            const currentKey = box.variableNameKey || box.variableName || '';
                            const comparisonIdentifier = box.comparisonIdentifier || '';
                            if (!currentKey || !comparisonIdentifier || !comparisonIdentifierValue) {
                              return { ...box, comparisonIdentifierValue, growthRateValue: undefined, comparisonValue: undefined };
                            }
                            
                            // Find variable with same structure but different identifier value
                            // Use the same identifier parsing logic as findMatchingVariable
                            const currentKeyParts = currentKey.split('_');
                            const identifierTypes = ['brand', 'channel', 'year', 'month', 'week', 'region', 'category', 'segment'];
                            
                            // Extract identifiers from current variable (only those in identifierOptions)
                            const currentIdentifiers: Record<string, string> = {};
                            let i = 2;
                            while (i < currentKeyParts.length) {
                              const key = currentKeyParts[i]?.toLowerCase();
                              
                              // Only process if it's a known identifier type AND exists in identifierOptions
                              if (identifierTypes.includes(key) && identifierOptions[key] && i + 1 < currentKeyParts.length) {
                                let value = currentKeyParts[i + 1];
                                let nextIndex = i + 2;
                                
                                // Collect multi-word values
                                while (nextIndex < currentKeyParts.length) {
                                  const nextPart = currentKeyParts[nextIndex]?.toLowerCase();
                                  if (!identifierTypes.includes(nextPart)) {
                                    value += '_' + currentKeyParts[nextIndex];
                                    nextIndex++;
                                  } else {
                                    break;
                                  }
                                }
                                
                                currentIdentifiers[key] = value;
                                i = nextIndex;
                              } else {
                                i++;
                              }
                            }
                            
                            // Find comparison variable - same structure but different identifier value
                            const comparisonVar = availableVariables.find((v: any) => {
                              const vKey = v.variableNameKey || v.variableName;
                              if (!vKey) return false;
                              
                              const vParts = vKey.split('_');
                              
                              // Must start with same base pattern (first 2 parts)
                              if (vParts.length < 2 || currentKeyParts.length < 2) return false;
                              if (vParts[0] !== currentKeyParts[0] || vParts[1] !== currentKeyParts[1]) return false;
                              
                              // Extract identifiers from comparison variable (only those in identifierOptions)
                              const vIdentifiers: Record<string, string> = {};
                              i = 2;
                              while (i < vParts.length) {
                                const key = vParts[i]?.toLowerCase();
                                
                                // Only process if it's a known identifier type AND exists in identifierOptions
                                if (identifierTypes.includes(key) && identifierOptions[key] && i + 1 < vParts.length) {
                                  let value = vParts[i + 1];
                                  let nextIndex = i + 2;
                                  
                                  // Collect multi-word values
                                  while (nextIndex < vParts.length) {
                                    const nextPart = vParts[nextIndex]?.toLowerCase();
                                    if (!identifierTypes.includes(nextPart)) {
                                      value += '_' + vParts[nextIndex];
                                      nextIndex++;
                                    } else {
                                      break;
                                    }
                                  }
                                  
                                  vIdentifiers[key] = value;
                                  i = nextIndex;
                                } else {
                                  i++;
                                }
                              }
                              
                              // Check if all identifiers match except the comparison identifier
                              // and the comparison identifier matches comparisonIdentifierValue
                              const currentIdentifierValue = currentIdentifiers[comparisonIdentifier];
                              const vIdentifierValue = vIdentifiers[comparisonIdentifier];
                              
                              if (vIdentifierValue !== comparisonIdentifierValue) return false;
                              if (currentIdentifierValue === comparisonIdentifierValue) return false; // Must be different value
                              
                              // Check all other identifiers (that exist in identifierOptions) match
                              for (const [key, value] of Object.entries(currentIdentifiers)) {
                                if (key !== comparisonIdentifier && vIdentifiers[key] !== value) {
                                  return false;
                                }
                              }
                              
                              return true;
                            });
                            
                            if (comparisonVar) {
                              const currentValue = parseFloat(box.value || box.metricValue || '0');
                              const comparisonValueNum = parseFloat(comparisonVar.value || '0');
                              
                              if (!isNaN(currentValue) && !isNaN(comparisonValueNum) && comparisonValueNum !== 0) {
                                const growthRate = ((currentValue - comparisonValueNum) / comparisonValueNum) * 100;
                                return {
                                  ...box,
                                  comparisonIdentifierValue,
                                  growthRateValue: growthRate,
                                  comparisonValue: comparisonVar.value
                                };
                              }
                            }
                            
                            return { ...box, comparisonIdentifierValue, growthRateValue: undefined, comparisonValue: undefined };
                          })
                        }));
                        onSettingsChange({ layouts: updatedLayouts });
                      }}
                    >
                      <SelectTrigger className="w-full bg-white border-gray-300">
                        <SelectValue placeholder="Select comparison value..." />
                      </SelectTrigger>
                      <SelectContent>
                        {identifierOptions[selectedBox.comparisonIdentifier].map((value) => (
                          <SelectItem key={value} value={value}>
                            {value.replace(/_/g, ' ')}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                )}
                
                {selectedBox.growthRateValue !== undefined && (
                  <div className="text-xs text-muted-foreground">
                    Growth Rate: {selectedBox.growthRateValue > 0 ? '+' : ''}{selectedBox.growthRateValue.toFixed(selectedBox.growthRateDecimalPlaces !== undefined ? selectedBox.growthRateDecimalPlaces : 1)}%
                    {selectedBox.comparisonValue && (
                      <span className="ml-2">(vs {selectedBox.comparisonValue})</span>
                    )}
                  </div>
                )}
                
                <div className="space-y-2">
                  <Label htmlFor="growthRateDecimalPlaces" className="text-xs font-medium">
                    Growth Rate Decimal Places
                  </Label>
                  <Input
                    id="growthRateDecimalPlaces"
                    type="number"
                    min="0"
                    max="10"
                    value={selectedBox.growthRateDecimalPlaces !== undefined ? selectedBox.growthRateDecimalPlaces : 1}
                    onChange={(e) => {
                      const decimalPlaces = parseInt(e.target.value) || 1;
                      const updatedLayouts = settings.layouts?.map(layout => ({
                        ...layout,
                        boxes: layout.boxes.map(box => 
                          box.id === settings.selectedBoxId 
                            ? { ...box, growthRateDecimalPlaces: decimalPlaces }
                            : box
                        )
                      }));
                      onSettingsChange({ layouts: updatedLayouts });
                    }}
                    className="w-full"
                  />
                  <p className="text-xs text-muted-foreground">
                    Number of decimal places for growth rate (0-10)
                  </p>
                </div>
                
                <p className="text-xs text-muted-foreground">
                  Select an identifier to vary and choose the comparison value. All other identifiers must match.
                </p>
              </div>
            )}
          </div>
        </div>
      )}


      {/* Image Element Settings - Only show when an image element is selected */}
      {selectedImageBox && (
        <div className="space-y-4 p-4 bg-purple-50 rounded-lg border border-purple-200">
          <div className="flex items-center gap-2 mb-4">
            <ImageIcon className="w-5 h-5 text-purple-600" />
            <Label className="text-sm font-semibold text-purple-900">
              Image Settings
            </Label>
          </div>

          {/* Image Upload */}
          <div className="space-y-3">
            <Label className="text-sm font-medium">Upload Image</Label>
            <input
              ref={fileInputRef}
              type="file"
              accept="image/*"
              className="hidden"
              onChange={async (e) => {
                const file = e.target.files?.[0];
                if (!file) return;

                // Validate file type
                if (!file.type.startsWith('image/')) {
                  setImageUploadError('Please select a valid image file');
                  return;
                }

                // Validate file size (max 10MB)
                if (file.size > 10 * 1024 * 1024) {
                  setImageUploadError('Image size must be less than 10MB');
                  return;
                }

                setUploadingImage(true);
                setImageUploadError(null);

                try {
                  const projectContext = getActiveProjectContext();
                  if (!projectContext) {
                    throw new Error('Project context not available');
                  }

                  const formData = new FormData();
                  formData.append('file', file);
                  formData.append('client_name', projectContext.client_name);
                  formData.append('app_name', projectContext.app_name);
                  formData.append('project_name', projectContext.project_name);

                  const response = await fetch(`${IMAGES_API}/upload`, {
                    method: 'POST',
                    body: formData,
                    credentials: 'include',
                  });

                  if (!response.ok) {
                    let errorMessage = 'Failed to upload image';
                    try {
                      const errorData = await response.json();
                      errorMessage = errorData.detail || errorMessage;
                    } catch {
                      // Ignore JSON parse errors
                    }
                    throw new Error(errorMessage);
                  }

                  const result = await response.json();
                  console.log('📸 Image upload response:', result);
                  
                  // Always use object_name to construct the content URL (consistent with Exhibition mode)
                  // This ensures the image is accessible through the API endpoint
                  const objectName = result.image?.object_name;
                  
                  if (!objectName) {
                    throw new Error('Upload response did not include object_name');
                  }
                  
                  // Construct the display URL using the content endpoint
                  const encoded = encodeURIComponent(objectName);
                  const imageUrl = `${IMAGES_API}/content?object_name=${encoded}`;
                  
                  console.log('📸 Object name:', objectName);
                  console.log('📸 Final image URL:', imageUrl);

                  // Update the selected image box with the uploaded image URL
                  const updatedLayouts = settings.layouts?.map(layout => ({
                    ...layout,
                    boxes: layout.boxes.map(box =>
                      box.id === settings.selectedBoxId
                        ? {
                            ...box,
                            imageUrl: imageUrl,
                            imageAlt: file.name || 'Uploaded image',
                            imageWidth: '100%',
                            imageHeight: 'auto',
                            imageObjectFit: 'contain',
                            imageBorderRadius: '8px',
                          }
                        : box
                    )
                  }));

                  onSettingsChange({ layouts: updatedLayouts });
                } catch (error: any) {
                  console.error('Image upload error:', error);
                  setImageUploadError(error.message || 'Failed to upload image');
                } finally {
                  setUploadingImage(false);
                  // Reset file input
                  if (fileInputRef.current) {
                    fileInputRef.current.value = '';
                  }
                }
              }}
            />
            <div className="flex items-center gap-2 flex-wrap">
              <Button
                type="button"
                onClick={() => fileInputRef.current?.click()}
                disabled={uploadingImage}
                className="flex items-center gap-2 bg-purple-600 hover:bg-purple-700 text-white flex-shrink-0"
              >
                <Upload className="w-4 h-4" />
                {uploadingImage ? 'Uploading...' : 'Choose Image'}
              </Button>
              {selectedImageBox.imageUrl && (
                <Button
                  type="button"
                  variant="outline"
                  onClick={() => {
                    const updatedLayouts = settings.layouts?.map(layout => ({
                      ...layout,
                      boxes: layout.boxes.map(box =>
                        box.id === settings.selectedBoxId
                          ? {
                              ...box,
                              imageUrl: '',
                              imageAlt: '',
                            }
                          : box
                      )
                    }));
                    onSettingsChange({ layouts: updatedLayouts });
                  }}
                  className="flex items-center gap-1 text-red-600 hover:text-red-700 hover:bg-red-50 border-red-200 flex-shrink-0"
                >
                  <X className="w-4 h-4" />
                  Remove
                </Button>
              )}
            </div>
            {uploadingImage && (
              <p className="text-xs text-blue-600">Uploading image...</p>
            )}
            {imageUploadError && (
              <p className="text-xs text-red-600">{imageUploadError}</p>
            )}
            {selectedImageBox.imageUrl && (
              <div className="mt-3 p-3 bg-white rounded-lg border border-purple-200">
                <p className="text-xs text-muted-foreground mb-2">Current Image:</p>
                {(() => {
                  // Use the stored imageUrl directly (should already be in correct format)
                  const previewUrl = selectedImageBox.imageUrl;
                  return (
                    <img
                      src={previewUrl}
                      alt={selectedImageBox.imageAlt || 'Uploaded image'}
                      className="max-w-full h-auto max-h-32 rounded border border-gray-200"
                      onError={(e) => {
                        console.error('❌ Preview image failed to load:', previewUrl);
                        console.error('❌ Check if URL is correct and accessible');
                      }}
                      onLoad={() => {
                        console.log('✅ Preview image loaded:', previewUrl);
                      }}
                    />
                  );
                })()}
              </div>
            )}
            <p className="text-xs text-muted-foreground">
              Upload an image from your device. Supported formats: JPG, PNG, GIF. Max size: 10MB.
            </p>
          </div>

          {/* Image Display Options - Only show if image is uploaded */}
          {selectedImageBox.imageUrl && (
            <div className="space-y-3 mt-4 pt-4 border-t border-purple-200">
              <Label className="text-sm font-medium">Image Display Options</Label>
              
              {/* Object Fit */}
              <div className="space-y-2">
                <Label htmlFor="imageObjectFit" className="text-xs font-medium">
                  Fit Mode
                </Label>
                <Select
                  value={selectedImageBox.imageObjectFit || 'contain'}
                  onValueChange={(value) => {
                    const updatedLayouts = settings.layouts?.map(layout => ({
                      ...layout,
                      boxes: layout.boxes.map(box =>
                        box.id === settings.selectedBoxId
                          ? { ...box, imageObjectFit: value as 'cover' | 'contain' | 'fill' }
                          : box
                      )
                    }));
                    onSettingsChange({ layouts: updatedLayouts });
                  }}
                >
                  <SelectTrigger className="w-full bg-white border-gray-300">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="contain">Contain (fit entire image)</SelectItem>
                    <SelectItem value="cover">Cover (fill container)</SelectItem>
                    <SelectItem value="fill">Fill (stretch to fit)</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              {/* Border Radius */}
              <div className="space-y-2">
                <Label htmlFor="imageBorderRadius" className="text-xs font-medium">
                  Border Radius
                </Label>
                <Input
                  id="imageBorderRadius"
                  value={selectedImageBox.imageBorderRadius || '8px'}
                  onChange={(e) => {
                    const updatedLayouts = settings.layouts?.map(layout => ({
                      ...layout,
                      boxes: layout.boxes.map(box =>
                        box.id === settings.selectedBoxId
                          ? { ...box, imageBorderRadius: e.target.value }
                          : box
                      )
                    }));
                    onSettingsChange({ layouts: updatedLayouts });
                  }}
                  placeholder="8px"
                  className="w-full"
                />
                <p className="text-xs text-muted-foreground">
                  CSS border-radius value (e.g., 8px, 50%, 0)
                </p>
              </div>

              {/* Alt Text */}
              <div className="space-y-2">
                <Label htmlFor="imageAlt" className="text-xs font-medium">
                  Alt Text
                </Label>
                <Input
                  id="imageAlt"
                  value={selectedImageBox.imageAlt || ''}
                  onChange={(e) => {
                    const updatedLayouts = settings.layouts?.map(layout => ({
                      ...layout,
                      boxes: layout.boxes.map(box =>
                        box.id === settings.selectedBoxId
                          ? { ...box, imageAlt: e.target.value }
                          : box
                      )
                    }));
                    onSettingsChange({ layouts: updatedLayouts });
                  }}
                  placeholder="Image description"
                  className="w-full"
                />
                <p className="text-xs text-muted-foreground">
                  Descriptive text for accessibility
                </p>
              </div>

              <p className="text-xs text-muted-foreground mt-2">
                💡 Tip: You can resize the image directly in the canvas by dragging the resize handle in the bottom-right corner.
              </p>
            </div>
          )}
        </div>
      )}

      {/* Insights */}
      <div className="space-y-2">
        <Label htmlFor="insights" className="text-sm font-medium">
          Key Insights
        </Label>
        <Textarea
          id="insights"
          value={settings.insights}
          onChange={(e) => onSettingsChange({ insights: e.target.value })}
          placeholder="Add key insights and observations..."
          className="min-h-32 resize-y"
        />
        <p className="text-xs text-muted-foreground">
          Add textual insights to provide context to your KPIs
        </p>
      </div>
    </div>
  );
};

export default KPIDashboardSettings;

