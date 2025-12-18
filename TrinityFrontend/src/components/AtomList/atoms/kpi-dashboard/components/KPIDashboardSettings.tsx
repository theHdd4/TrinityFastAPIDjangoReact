import React, { useState, useEffect, useRef } from 'react';
import { Label } from '@/components/ui/label';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Card } from '@/components/ui/card';
import { Checkbox } from '@/components/ui/checkbox';
import { Button } from '@/components/ui/button';
import { Plus, X, Upload, ImageIcon, BarChart3, Filter, Settings2 } from 'lucide-react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { VALIDATE_API, LABORATORY_API, IMAGES_API, SCOPE_SELECTOR_API } from '@/lib/api';
import { getActiveProjectContext } from '@/utils/projectEnv';
import type { KPIDashboardData, KPIDashboardSettings as KPISettings } from '../KPIDashboardAtom';
import { useLaboratoryStore } from '@/components/LaboratoryMode/store/laboratoryStore';
import { chartMakerApi } from '@/components/AtomList/atoms/chart-maker/services/chartMakerApi';
import { migrateLegacyChart, buildTracesForAPI, validateChart } from '@/components/AtomList/atoms/chart-maker/utils/traceUtils';

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
  // State for global filter variables
  const [allVariablesForGlobalFilters, setAllVariablesForGlobalFilters] = useState<any[]>([]);
  const [loadingGlobalFilterOptions, setLoadingGlobalFilterOptions] = useState(false);
  const [renderingCharts, setRenderingCharts] = useState(false);
  // State for identifier selection dialog
  const [showIdentifierDialog, setShowIdentifierDialog] = useState(false);
  const [tempSelectedIdentifiers, setTempSelectedIdentifiers] = useState<string[]>([]);
  // State for storing global filter options per identifier
  const [globalFilterOptionsCache, setGlobalFilterOptionsCache] = useState<Record<string, string[]>>({});

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
      const fileName = frame?.arrow_name?.split('/').pop() || fileId;
      
      // Save selected file to settings so it's available for chart rendering
      onSettingsChange({ 
        ...settings,
        selectedFile: fileId,
        dataSource: fileName
      } as any);
      
      onDataUpload({
        headers: data.headers || [],
        rows: data.rows || [],
        fileName: fileName,
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

  // Fetch all variables for global filters when layouts change or when identifiers are enabled
  useEffect(() => {
    const fetchAllVariables = async () => {
      setLoadingGlobalFilterOptions(true);
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
            setAllVariablesForGlobalFilters(result.variables);
          }
        }
      } catch (error) {
        console.error('Failed to fetch variables for global filters:', error);
      } finally {
        setLoadingGlobalFilterOptions(false);
      }
    };

    // Fetch if we have enabled identifiers, metric cards, or charts
    const hasEnabledIdentifiers = settings.enabledGlobalFilterIdentifiers && settings.enabledGlobalFilterIdentifiers.length > 0;
    const hasMetricCards = settings.layouts?.some(layout => 
      layout.boxes.some(box => box.elementType === 'metric-card' && (box.variableNameKey || box.variableName))
    );
    const hasCharts = settings.layouts?.some(layout => 
      layout.boxes.some(box => box.elementType === 'chart' && box.chartConfig?.filters)
    );
    
    // Always fetch if identifiers are manually enabled, or if we have elements
    if (hasEnabledIdentifiers || hasMetricCards || hasCharts) {
      fetchAllVariables();
    }
  }, [settings.layouts, settings.enabledGlobalFilterIdentifiers]);

  // Clean up stale filters when enabled identifiers change
  useEffect(() => {
    const enabledIdentifiers = settings.enabledGlobalFilterIdentifiers || [];
    if (enabledIdentifiers.length === 0) return; // Skip if no enabled identifiers (auto-detect mode)
    
    const enabledIdentifiersSet = new Set(enabledIdentifiers.map(id => id.toLowerCase()));
    const globalFilters = settings.globalFilters || {};
    
    // Clean up layouts by removing filters for identifiers that are no longer enabled
    let updatedLayouts = settings.layouts;
    let hasChanges = false;
    
    updatedLayouts = updatedLayouts?.map(layout => ({
      ...layout,
      boxes: layout.boxes.map(box => {
        let boxChanged = false;
        
        // Clean up chart filters
        if (box.elementType === 'chart' && box.chartConfig?.filters) {
          const originalChartConfig = box.chartConfig;
          const chartConfig = migrateLegacyChart(originalChartConfig);
          const chartFilters = chartConfig.filters || {};
          const cleanedFilters: Record<string, string[]> = {};
          
          Object.entries(chartFilters).forEach(([key, val]) => {
            const normalizedKey = key.toLowerCase();
            // Check if it's a global filter by seeing if it's in the globalFilters
            const isGlobalFilter = Object.keys(globalFilters).some(gf => gf.toLowerCase() === normalizedKey);
            
            if (isGlobalFilter && !enabledIdentifiersSet.has(normalizedKey)) {
              // This is a global filter for a disabled identifier - remove it
              boxChanged = true;
            } else {
              // Keep the filter (either it's enabled or it's a user-created local filter)
              cleanedFilters[key] = val as string[];
            }
          });
          
          if (boxChanged) {
            hasChanges = true;
            return {
              ...box,
              chartConfig: {
                ...originalChartConfig,
                ...chartConfig,
                filters: cleanedFilters,
                chartRendered: false
              }
            };
          }
        }
        
        // Clean up table filters
        if (box.elementType === 'table' && box.tableSettings?.filters) {
          const tableFilters = box.tableSettings.filters || {};
          const cleanedFilters: Record<string, any> = {};
          
          Object.entries(tableFilters).forEach(([key, val]) => {
            const normalizedKey = key.toLowerCase();
            // Check if it's a global filter
            const isGlobalFilter = Object.keys(globalFilters).some(gf => gf.toLowerCase() === normalizedKey);
            
            if (isGlobalFilter && !enabledIdentifiersSet.has(normalizedKey)) {
              // This is a global filter for a disabled identifier - remove it
              boxChanged = true;
            } else {
              // Keep the filter
              cleanedFilters[key] = val;
            }
          });
          
          if (boxChanged) {
            hasChanges = true;
            return {
              ...box,
              tableSettings: {
                ...box.tableSettings,
                filters: cleanedFilters
              }
            };
          }
        }
        
        return box;
      })
    }));
    
    // Apply changes if any were made
    if (hasChanges && updatedLayouts) {
      onSettingsChange({ layouts: updatedLayouts });
    }
  }, [settings.enabledGlobalFilterIdentifiers?.join(',')]);

  // Fetch unique values from data source for global filter identifiers that have no options
  useEffect(() => {
    const fetchMissingOptions = async () => {
      const enabledIdentifiers = settings.enabledGlobalFilterIdentifiers;
      if (!enabledIdentifiers || enabledIdentifiers.length === 0) return;
      
      const dataSource = (settings as any).selectedFile || (settings as any).dataSource;
      if (!dataSource) return;
      
      const updates: Record<string, string[]> = {};
      let hasUpdates = false;
      let isLoading = false;
      
      for (const identifier of enabledIdentifiers) {
        // Skip if already in cache
        if (globalFilterOptionsCache[identifier] && globalFilterOptionsCache[identifier].length > 0) continue;
        
        // Check if we have options from variables
        const hasVariableOptions = allVariablesForGlobalFilters.some((v: any) => {
          const vKey = v.variableNameKey || v.variableName;
          if (!vKey) return false;
          const parts = vKey.split('_');
          let i = 2;
          while (i < parts.length) {
            if (parts[i]?.toLowerCase() === identifier.toLowerCase() && i + 1 < parts.length) {
              return true;
            }
            i++;
          }
          return false;
        });
        
        // Only fetch from data source if no variable options
        if (!hasVariableOptions) {
          try {
            if (!isLoading) {
              setLoadingGlobalFilterOptions(true);
              isLoading = true;
            }
            const objectName = dataSource.endsWith('.arrow') ? dataSource : `${dataSource}.arrow`;
            // Try scope-selector API first, then fallback to clustering API
            let response = await fetch(
              `${SCOPE_SELECTOR_API}/unique_values?object_name=${encodeURIComponent(objectName)}&column_name=${encodeURIComponent(identifier)}`,
              { credentials: 'include' }
            );
            // If scope-selector doesn't work, try clustering API
            if (!response.ok) {
              response = await fetch(
                `${VALIDATE_API}/clustering/unique_values?object_name=${encodeURIComponent(objectName)}&column_name=${encodeURIComponent(identifier)}`,
                { credentials: 'include' }
              );
            }
            if (response.ok) {
              const result = await response.json();
              if (result.unique_values && Array.isArray(result.unique_values) && result.unique_values.length > 0) {
                updates[identifier] = result.unique_values.map((v: any) => String(v)).sort();
                hasUpdates = true;
              }
            }
          } catch (error) {
            console.error(`Failed to fetch unique values for ${identifier}:`, error);
          }
        }
      }
      
      if (isLoading) {
        setLoadingGlobalFilterOptions(false);
      }
      
      if (hasUpdates) {
        setGlobalFilterOptionsCache(prev => ({ ...prev, ...updates }));
      }
    };
    
    fetchMissingOptions();
  }, [settings.enabledGlobalFilterIdentifiers?.join(','), allVariablesForGlobalFilters.length, (settings as any).selectedFile, (settings as any).dataSource]);

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

      {/* Global Filters */}
      {(() => {
        // Get all identifiers from availableColumns (data source columns)
        // Convert to lowercase for consistency and remove duplicates
        const allAvailableIdentifiers = Array.from(new Set(
          (availableColumns || []).map(col => col.toLowerCase())
        )).sort();
        
        // Keep the original hardcoded list as fallback/known identifiers
        const knownIdentifierTypes = ['brand', 'channel', 'year', 'month', 'week', 'region', 'category', 'segment'];
        
        // Merge available columns with known identifiers (union)
        const identifierTypes = Array.from(new Set([
          ...allAvailableIdentifiers,
          ...knownIdentifierTypes
        ])).sort();
        
        // Extract charts for use in getGlobalFilterOptions (needed regardless of selection mode)
        const allCharts = settings.layouts?.flatMap(layout => layout.boxes)
          .filter(box => box.elementType === 'chart' && box.chartConfig) || [];
        
        // Get user-selected identifiers, or auto-detect from existing elements
        const enabledIdentifiers = settings.enabledGlobalFilterIdentifiers;
        
        let allIdentifiers: string[] = [];
        
        if (enabledIdentifiers && enabledIdentifiers.length > 0) {
          // Use user-selected identifiers
          allIdentifiers = enabledIdentifiers;
        } else {
          // Auto-detect: Extract ALL identifiers from metric cards
          const allMetricCards = settings.layouts?.flatMap(layout => layout.boxes)
            .filter(box => box.elementType === 'metric-card' && (box.variableNameKey || box.variableName)) || [];
          
          const metricCardIdentifiers = new Set<string>();
          allMetricCards.forEach(box => {
            const variableKey = box.variableNameKey || box.variableName || '';
            if (variableKey) {
              const parts = variableKey.split('_');
              let i = 2; // Skip first 2 parts (measure and aggregation)
              while (i < parts.length) {
                const key = parts[i]?.toLowerCase();
                if (identifierTypes.includes(key)) {
                  metricCardIdentifiers.add(key);
                  // Skip the value and move to next identifier
                  let nextIndex = i + 2;
                  while (nextIndex < parts.length) {
                    const nextPart = parts[nextIndex]?.toLowerCase();
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
          });

          // Extract ALL identifiers from charts
          // Also check chart data columns if available (for charts without filters yet)
          const chartIdentifiers = new Set<string>();
          allCharts.forEach(box => {
            if (box.chartConfig?.filters) {
              Object.keys(box.chartConfig.filters).forEach(column => {
                const normalizedColumn = column.toLowerCase();
                if (identifierTypes.includes(normalizedColumn)) {
                  chartIdentifiers.add(normalizedColumn);
                }
              });
            }
            // Also check if chart has data with columns that match identifier types
            // This helps identify identifiers even if no filters are set yet
            if ((box.chartConfig as any)?.filteredData?.columns) {
              const columns = (box.chartConfig as any).filteredData.columns;
              columns.forEach((column: string) => {
                const normalizedColumn = column.toLowerCase();
                if (identifierTypes.includes(normalizedColumn)) {
                  chartIdentifiers.add(normalizedColumn);
                }
              });
            }
          });

          // Combine all identifiers (union - all identifiers from both metric cards and charts)
          allIdentifiers = Array.from(new Set([...metricCardIdentifiers, ...chartIdentifiers]));
        }
        
        // Note: State for global filters is declared at component level above

        // Get unique values for each identifier from all available variables
        const getGlobalFilterOptions = (identifier: string): string[] => {
          // Return cached options if available
          if (globalFilterOptionsCache[identifier]) {
            return globalFilterOptionsCache[identifier];
          }
          
          const options = new Set<string>();
          const identifierTypesLocal = ['brand', 'channel', 'year', 'month', 'week', 'region', 'category', 'segment'];
          
          // Get from all available variables (like individual filters do)
          allVariablesForGlobalFilters.forEach((v: any) => {
            const vKey = v.variableNameKey || v.variableName;
            if (vKey) {
              const parts = vKey.split('_');
              
              let i = 2; // Skip first 2 parts (measure and aggregation)
              while (i < parts.length) {
                const key = parts[i]?.toLowerCase();
                if (key === identifier && i + 1 < parts.length) {
                  let value = parts[i + 1];
                  let nextIndex = i + 2;
                  
                  while (nextIndex < parts.length) {
                    const nextPart = parts[nextIndex]?.toLowerCase();
                    if (!identifierTypesLocal.includes(nextPart)) {
                      value += '_' + parts[nextIndex];
                      nextIndex++;
                    } else {
                      break;
                    }
                  }
                  options.add(value);
                  i = nextIndex;
                } else {
                  i++;
                }
              }
            }
          });
          
          // Also get from charts (for chart-specific identifiers)
          allCharts.forEach(box => {
            if (box.chartConfig?.filters) {
              const normalizedIdentifier = identifier.toLowerCase();
              const filterValues = box.chartConfig.filters[normalizedIdentifier] || box.chartConfig.filters[identifier];
              if (Array.isArray(filterValues)) {
                filterValues.forEach(val => options.add(String(val)));
              }
            }
          });
          
          return Array.from(options).sort();
        };

        return (
          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <Label className="text-sm font-medium">Global Filters</Label>
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={() => {
                  const currentEnabled = settings.enabledGlobalFilterIdentifiers || [];
                  setTempSelectedIdentifiers(currentEnabled);
                  setShowIdentifierDialog(true);
                }}
                className="h-7 text-xs"
              >
                <Settings2 className="w-3 h-3 mr-1" />
                Select Identifiers
              </Button>
            </div>
            
            {/* Identifier Selection Dialog */}
            <Dialog open={showIdentifierDialog} onOpenChange={setShowIdentifierDialog}>
              <DialogContent className="sm:max-w-[500px]">
                <DialogHeader>
                  <DialogTitle>Select Identifiers for Global Filters</DialogTitle>
                </DialogHeader>
                <div className="space-y-3 py-4">
                  <p className="text-sm text-muted-foreground">
                    Choose which identifiers should be available for global filtering. You can select identifiers even if they're not currently used in any elements.
                  </p>
                  <div className="space-y-2 max-h-[300px] overflow-y-auto">
                    {identifierTypes.map((identifier) => (
                      <div key={identifier} className="flex items-center space-x-2">
                        <Checkbox
                          id={`select-identifier-${identifier}`}
                          checked={tempSelectedIdentifiers.includes(identifier)}
                          onCheckedChange={(checked) => {
                            if (checked) {
                              setTempSelectedIdentifiers([...tempSelectedIdentifiers, identifier]);
                            } else {
                              setTempSelectedIdentifiers(tempSelectedIdentifiers.filter(id => id !== identifier));
                            }
                          }}
                        />
                        <label
                          htmlFor={`select-identifier-${identifier}`}
                          className="text-sm font-medium capitalize cursor-pointer"
                        >
                          {identifier}
                        </label>
                      </div>
                    ))}
                  </div>
                </div>
                <DialogFooter>
                  <Button
                    variant="outline"
                    onClick={() => {
                      setShowIdentifierDialog(false);
                    }}
                  >
                    Cancel
                  </Button>
                  <Button
                    onClick={() => {
                      onSettingsChange({ enabledGlobalFilterIdentifiers: tempSelectedIdentifiers });
                      setShowIdentifierDialog(false);
                    }}
                  >
                    Apply
                  </Button>
                  <Button
                    variant="ghost"
                    onClick={() => {
                      // Clear selection to use auto-detect
                      onSettingsChange({ enabledGlobalFilterIdentifiers: [] });
                      setShowIdentifierDialog(false);
                    }}
                  >
                    Use Auto-detect
                  </Button>
                </DialogFooter>
              </DialogContent>
            </Dialog>
            <Card className="p-4 space-y-4 bg-blue-50 border-blue-200">
              <p className="text-xs text-blue-800 mb-2">
                Global filters automatically apply to all Metric Cards, Charts, and Tables. They override individual element filters.
                {settings.enabledGlobalFilterIdentifiers && settings.enabledGlobalFilterIdentifiers.length > 0 && (
                  <span className="block mt-1 font-semibold">
                    Enabled identifiers: {settings.enabledGlobalFilterIdentifiers.join(', ')}
                  </span>
                )}
              </p>
              {allIdentifiers.length === 0 ? (
                <div className="p-3 bg-white rounded-lg border border-blue-200">
                  <p className="text-xs text-muted-foreground mb-2">
                    No identifiers found. Click "Select Identifiers" to manually enable identifiers for global filtering.
                  </p>
                  <p className="text-xs text-blue-600">
                    Available identifiers: {identifierTypes.join(', ')}
                  </p>
                </div>
              ) : (
                allIdentifiers.map((identifier) => {
                // Get options from cache or variables
                const optionsFromVariables = getGlobalFilterOptions(identifier);
                const optionsFromCache = globalFilterOptionsCache[identifier] || [];
                const options = optionsFromCache.length > 0 ? optionsFromCache : optionsFromVariables;
                const currentFilter = settings.globalFilters?.[identifier];
                const currentValues = currentFilter?.values || [];
                
                if (loadingGlobalFilterOptions && options.length === 0 && !globalFilterOptionsCache[identifier]) {
                  return (
                    <div key={identifier} className="p-3 bg-white rounded-lg border border-blue-200">
                      <p className="text-xs text-muted-foreground">Loading options for {identifier}...</p>
                    </div>
                  );
                }
                
                return (
                  <div key={identifier} className="space-y-3 p-3 bg-white rounded-lg border border-blue-200">
                    <div className="flex items-center justify-between">
                      <Label htmlFor={`global-filter-${identifier}`} className="text-xs font-semibold capitalize">
                        {identifier} ({options.length} options)
                      </Label>
                    </div>
                    <Select
                      value={currentValues.length > 0 ? currentValues[0] : '__all__'}
                      onValueChange={(value) => {
                        const newGlobalFilters = { ...(settings.globalFilters || {}) };
                        const currentFilter = newGlobalFilters[identifier] || { values: [] };
                        
                        // Store previous local filter state before applying global filter
                        const previousLocalFilters = settings.previousLocalFilters || {};
                        
                        if (value === '__all__') {
                          currentFilter.values = [];
                          // Restore previous local filters when global filter is removed
                          let restoredLayouts = settings.layouts;
                          
                          // Restore chart filters
                          restoredLayouts = restoredLayouts?.map(layout => ({
                            ...layout,
                            boxes: layout.boxes.map(box => {
                              if (box.elementType === 'chart' && box.chartConfig) {
                                const originalChartConfig = box.chartConfig;
                                const chartConfig = migrateLegacyChart(originalChartConfig);
                                const previousFilters = previousLocalFilters[`chart_${box.id}`] || {};
                                
                                return {
                                  ...box,
                                  chartConfig: {
                                    ...originalChartConfig,
                                    ...chartConfig,
                                    filters: previousFilters,
                                    chartRendered: false
                                  }
                                };
                              }
                              return box;
                            })
                          }));
                          
                          // Restore table filters
                          restoredLayouts = restoredLayouts?.map(layout => ({
                            ...layout,
                            boxes: layout.boxes.map(box => {
                              if (box.elementType === 'table' && box.tableSettings) {
                                const previousFilters = previousLocalFilters[`table_${box.id}`] || {};
                                
                                return {
                                  ...box,
                                  tableSettings: {
                                    ...box.tableSettings,
                                    filters: previousFilters
                                  }
                                };
                              }
                              return box;
                            })
                          }));
                          
                          onSettingsChange({ 
                            globalFilters: newGlobalFilters,
                            layouts: restoredLayouts,
                            previousLocalFilters: {} // Clear stored previous filters
                          });
                          return;
                        } else {
                          currentFilter.values = [value];
                        }
                        
                        newGlobalFilters[identifier] = currentFilter;
                        
                        // Get currently enabled global filter identifiers
                        const enabledIdentifiers = settings.enabledGlobalFilterIdentifiers || [];
                        const enabledIdentifiersSet = new Set(enabledIdentifiers.map(id => id.toLowerCase()));
                        
                        // If no enabled identifiers specified, use all identifiers that have active filters
                        const activeGlobalFilterIdentifiers = new Set(
                          Object.entries(newGlobalFilters)
                            .filter(([_, config]: [string, any]) => config.values && config.values.length > 0 && !config.values.includes('__all__'))
                            .map(([id]) => id.toLowerCase())
                        );
                        
                        // Use enabled identifiers if available, otherwise use active filter identifiers
                        const validGlobalFilterIdentifiers = enabledIdentifiers.length > 0 
                          ? enabledIdentifiersSet 
                          : activeGlobalFilterIdentifiers;
                        
                        // Apply filters automatically to all element types
                        let updatedLayouts = settings.layouts;
                        
                        // Always apply to charts - sync global filters to chart's individual filters
                        updatedLayouts = settings.layouts?.map(layout => ({
                          ...layout,
                          boxes: layout.boxes.map(box => {
                            if (box.elementType === 'chart' && box.chartConfig) {
                              // Store previous local filters before applying global filter
                              const originalChartConfig = box.chartConfig;
                              const chartConfig = migrateLegacyChart(originalChartConfig);
                              
                              // Store previous filters if not already stored
                              if (!previousLocalFilters[`chart_${box.id}`]) {
                                previousLocalFilters[`chart_${box.id}`] = { ...(chartConfig.filters || {}) };
                              }
                              
                              // Start with existing chart-specific filters (non-global ones)
                              const chartSpecificFilters: Record<string, string[]> = {};
                              const globalFilterIdentifiers = new Set(
                                Object.entries(newGlobalFilters)
                                  .filter(([_, config]: [string, any]) => config.values && config.values.length > 0)
                                  .map(([id]) => id.toLowerCase())
                              );
                              
                              // Map to track original column names (case-preserved) for each identifier
                              const identifierToColumnName = new Map<string, string>();
                              
                              // First pass: identify which existing filters are global filters and preserve their original case
                              // Also REMOVE any filters for identifiers that are no longer in the enabled list
                              Object.entries(chartConfig.filters || {}).forEach(([key, val]) => {
                                const normalizedKey = key.toLowerCase();
                                
                                // Remove filter if it's for an identifier that's no longer enabled
                                if (enabledIdentifiers.length > 0 && !validGlobalFilterIdentifiers.has(normalizedKey)) {
                                  // This identifier is no longer enabled - skip it (remove it)
                                  return;
                                }
                                
                                if (globalFilterIdentifiers.has(normalizedKey)) {
                                  // This is a global filter - preserve the original column name
                                  identifierToColumnName.set(normalizedKey, key);
                                } else {
                                  // This is a chart-specific filter - keep it only if not overridden by global filter
                                  if (!globalFilterIdentifiers.has(normalizedKey)) {
                                    chartSpecificFilters[key] = val as string[];
                                  }
                                }
                              });
                              
                              // Add all active global filters for charts, using original column name if available
                              Object.entries(newGlobalFilters).forEach(([id, filterConfig]) => {
                                const config = filterConfig as { values: string[] };
                                // Only apply if identifier is in enabled list (or if no enabled list, apply all active filters)
                                const isEnabled = enabledIdentifiers.length === 0 || validGlobalFilterIdentifiers.has(id.toLowerCase());
                                
                                // If values exist and not "__all__", add to chart filters
                                if (isEnabled && config.values && config.values.length > 0 && !config.values.includes('__all__')) {
                                  // Use original column name if we found one
                                  let columnName = identifierToColumnName.get(id.toLowerCase());
                                  
                                  // If no existing filter found, try to find matching column name from chart data
                                  if (!columnName && (chartConfig as any)?.filteredData?.columns) {
                                    const columns = (chartConfig as any).filteredData.columns;
                                    const matchingColumn = columns.find((col: string) => 
                                      col.toLowerCase() === id.toLowerCase()
                                    );
                                    if (matchingColumn) {
                                      columnName = matchingColumn;
                                      identifierToColumnName.set(id.toLowerCase(), matchingColumn);
                                    }
                                  }
                                  
                                  // Fallback to lowercase identifier (backend handles case-insensitive matching)
                                  if (!columnName) {
                                    columnName = id;
                                  }
                                  
                                  // Override existing filter with global filter value
                                  chartSpecificFilters[columnName] = config.values;
                                }
                              });
                              
                              // Preserve ALL original chart config properties, only update filters
                              return {
                                ...box,
                                chartConfig: {
                                  ...originalChartConfig,
                                  ...chartConfig,
                                  filters: chartSpecificFilters, // Global filters override individual filters
                                  chartRendered: false // Mark as needing re-render
                                }
                              };
                            }
                            return box;
                          })
                        }));
                        
                        // Always apply to tables - sync global filters to table's column filters
                        updatedLayouts = updatedLayouts?.map(layout => ({
                          ...layout,
                          boxes: layout.boxes.map(box => {
                            if (box.elementType === 'table' && box.tableSettings) {
                              // Store previous local filters before applying global filter
                              if (!previousLocalFilters[`table_${box.id}`]) {
                                previousLocalFilters[`table_${box.id}`] = { ...(box.tableSettings.filters || {}) };
                              }
                              
                              // Get actual column names from table data to match case
                              const tableColumns: string[] = [];
                              if (box.tableSettings.tableData?.columns && Array.isArray(box.tableSettings.tableData.columns)) {
                                tableColumns.push(...box.tableSettings.tableData.columns);
                              } else if (box.tableSettings.visibleColumns && Array.isArray(box.tableSettings.visibleColumns)) {
                                tableColumns.push(...box.tableSettings.visibleColumns);
                              } else if (availableColumns && Array.isArray(availableColumns)) {
                                // Fallback to availableColumns from data upload
                                tableColumns.push(...availableColumns);
                              }
                              
                              // Create a case-insensitive mapping
                              const columnMap = new Map<string, string>();
                              tableColumns.forEach(col => {
                                columnMap.set(col.toLowerCase(), col);
                              });
                              
                              // Start with existing table-specific filters (but remove any that are global filters or no longer enabled)
                              const tableFilters: Record<string, any> = {};
                              const globalFilterKeys = new Set(Object.keys(newGlobalFilters).map(k => k.toLowerCase()));
                              
                              // Keep only non-global filters AND filters that are not for disabled identifiers
                              Object.entries(box.tableSettings.filters || {}).forEach(([key, value]) => {
                                const normalizedKey = key.toLowerCase();
                                
                                // Remove filter if it's for an identifier that's no longer enabled
                                if (enabledIdentifiers.length > 0 && !validGlobalFilterIdentifiers.has(normalizedKey)) {
                                  // This identifier is no longer enabled - skip it (remove it)
                                  return;
                                }
                                
                                // Keep only non-global filters (user-created local filters)
                                if (!globalFilterKeys.has(normalizedKey)) {
                                  tableFilters[key] = value;
                                }
                              });
                              
                              // Apply all active global filters to table filters with correct column name
                              Object.entries(newGlobalFilters).forEach(([id, filterConfig]) => {
                                const config = filterConfig as { values: string[] };
                                // Only apply if identifier is in enabled list (or if no enabled list, apply all active filters)
                                const isEnabled = enabledIdentifiers.length === 0 || validGlobalFilterIdentifiers.has(id.toLowerCase());
                                
                                if (isEnabled && config.values && config.values.length > 0 && !config.values.includes('__all__')) {
                                  // Find the actual column name (case-insensitive match)
                                  // Try exact match first, then try with different cases
                                  let actualColumnName = columnMap.get(id.toLowerCase());
                                  
                                  // If not found, try to find a column that contains the identifier (for variations like "Brand" vs "brand")
                                  if (!actualColumnName && tableColumns.length > 0) {
                                    const matchingCol = tableColumns.find(col => 
                                      col.toLowerCase() === id.toLowerCase() || 
                                      col.toLowerCase().includes(id.toLowerCase()) ||
                                      id.toLowerCase().includes(col.toLowerCase())
                                    );
                                    if (matchingCol) {
                                      actualColumnName = matchingCol;
                                      columnMap.set(id.toLowerCase(), matchingCol);
                                    }
                                  }
                                  
                                  // Fallback to identifier name if no match found
                                  if (!actualColumnName) {
                                    actualColumnName = id;
                                  }
                                  
                                  // Override table filter with global filter value
                                  tableFilters[actualColumnName] = config.values;
                                } else {
                                  // Remove global filter from table filters if set to "__all__" or not enabled
                                  const actualColumnName = columnMap.get(id.toLowerCase()) || id;
                                  delete tableFilters[actualColumnName];
                                }
                              });
                              
                              return {
                                ...box,
                                tableSettings: {
                                  ...box.tableSettings,
                                  filters: tableFilters, // Global filters override individual filters
                                  currentPage: 1 // Reset to page 1 when filters change
                                }
                              };
                            }
                            return box;
                          })
                        }));
                        
                        // Always apply to metric cards (async)
                        (async () => {
                          // Use the already fetched variables or fetch if needed
                          const variablesToUse = allVariablesForGlobalFilters.length > 0 
                            ? allVariablesForGlobalFilters 
                            : await (async () => {
                                try {
                                  const projectContext = getActiveProjectContext();
                                  if (!projectContext) return [];
                                  
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
                                    return result.variables && Array.isArray(result.variables) ? result.variables : [];
                                  }
                                } catch (error) {
                                  console.error('Error fetching variables:', error);
                                }
                                return [];
                              })();
                          
                          // Use updatedLayouts (which already has chart and table filter updates) as base for metric updates
                          const metricUpdatedLayouts = updatedLayouts?.map(layout => ({
                          ...layout,
                          boxes: layout.boxes.map(box => {
                            if (box.elementType === 'metric-card' && (box.variableNameKey || box.variableName)) {
                              const variableKey = box.variableNameKey || box.variableName || '';
                              if (variableKey) {
                                // Parse current identifiers from variable key
                                const parts = variableKey.split('_');
                                const identifierTypes = ['brand', 'channel', 'year', 'month', 'week', 'region', 'category', 'segment'];
                                const currentIdentifiers: Record<string, string> = {};
                                
                                let i = 2; // Skip first 2 parts (measure and aggregation)
                                while (i < parts.length) {
                                  const key = parts[i]?.toLowerCase();
                                  if (identifierTypes.includes(key) && i + 1 < parts.length) {
                                    let val = parts[i + 1];
                                    let nextIndex = i + 2;
                                    
                                    while (nextIndex < parts.length) {
                                      const nextPart = parts[nextIndex]?.toLowerCase();
                                      if (!identifierTypes.includes(nextPart)) {
                                        val += '_' + parts[nextIndex];
                                        nextIndex++;
                                      } else {
                                        break;
                                      }
                                    }
                                    
                                    currentIdentifiers[key] = val;
                                    i = nextIndex;
                                  } else {
                                    i++;
                                  }
                                }
                                
                                // First, remove any identifiers that are no longer in the enabled list
                                if (enabledIdentifiers.length > 0) {
                                  Object.keys(currentIdentifiers).forEach(id => {
                                    if (!validGlobalFilterIdentifiers.has(id.toLowerCase())) {
                                      // This identifier is no longer enabled - remove it
                                      delete currentIdentifiers[id];
                                    }
                                  });
                                }
                                
                                // Apply all global filters to current identifiers (override or add)
                                Object.entries(newGlobalFilters).forEach(([globalId, filterConfig]) => {
                                  const config = filterConfig as { values: string[] };
                                  // Only apply if identifier is in enabled list (or if no enabled list, apply all active filters)
                                  const isEnabled = enabledIdentifiers.length === 0 || validGlobalFilterIdentifiers.has(globalId.toLowerCase());
                                  
                                  if (isEnabled && config.values && config.values.length > 0 && !config.values.includes('__all__')) {
                                    // Override or add the global filter identifier
                                    currentIdentifiers[globalId] = config.values[0];
                                  } else {
                                    // Remove identifier if global filter is set to "__all__" or not enabled
                                    delete currentIdentifiers[globalId];
                                  }
                                });
                                
                                // Find base pattern (first 2 parts: measure and aggregation)
                                const basePattern = parts.slice(0, 2).join('_');
                                
                                // Find matching variable - either exact match or expanded version
                                // First try to find exact match with all identifiers
                                let matchingVar = variablesToUse.find((v: any) => {
                                  const vKey = v.variableNameKey || v.variableName;
                                  if (!vKey || !vKey.startsWith(basePattern + '_')) return false;
                                  
                                  const vParts = vKey.split('_');
                                  const vIdentifiers: Record<string, string> = {};
                                  
                                  let j = 2;
                                  while (j < vParts.length) {
                                    const key = vParts[j]?.toLowerCase();
                                    if (identifierTypes.includes(key) && j + 1 < vParts.length) {
                                      let val = vParts[j + 1];
                                      let nextIndex = j + 2;
                                      
                                      while (nextIndex < vParts.length) {
                                        const nextPart = vParts[nextIndex]?.toLowerCase();
                                        if (!identifierTypes.includes(nextPart)) {
                                          val += '_' + vParts[nextIndex];
                                          nextIndex++;
                                        } else {
                                          break;
                                        }
                                      }
                                      
                                      vIdentifiers[key] = val;
                                      j = nextIndex;
                                    } else {
                                      j++;
                                    }
                                  }
                                  
                                  // Check if all current identifiers match (including global filters)
                                  return Object.entries(currentIdentifiers).every(([key, val]) => 
                                    vIdentifiers[key] === val
                                  );
                                });
                                
                                // If no exact match found and we have global filters, try to find expanded variable
                                // (variable that includes the global filter identifier even if original didn't)
                                if (!matchingVar && Object.keys(currentIdentifiers).length > 0) {
                                  matchingVar = variablesToUse.find((v: any) => {
                                    const vKey = v.variableNameKey || v.variableName;
                                    if (!vKey || !vKey.startsWith(basePattern + '_')) return false;
                                    
                                    const vParts = vKey.split('_');
                                    const vIdentifiers: Record<string, string> = {};
                                    
                                    let j = 2;
                                    while (j < vParts.length) {
                                      const key = vParts[j]?.toLowerCase();
                                      if (identifierTypes.includes(key) && j + 1 < vParts.length) {
                                        let val = vParts[j + 1];
                                        let nextIndex = j + 2;
                                        
                                        while (nextIndex < vParts.length) {
                                          const nextPart = vParts[nextIndex]?.toLowerCase();
                                          if (!identifierTypes.includes(nextPart)) {
                                            val += '_' + vParts[nextIndex];
                                            nextIndex++;
                                          } else {
                                            break;
                                          }
                                        }
                                        
                                        vIdentifiers[key] = val;
                                        j = nextIndex;
                                      } else {
                                        j++;
                                      }
                                    }
                                    
                                    // Check if variable includes all current identifiers (expanded version)
                                    // This allows finding variables that have been expanded to include new identifiers
                                    return Object.entries(currentIdentifiers).every(([key, val]) => 
                                      vIdentifiers[key] === val
                                    ) && Object.keys(vIdentifiers).length >= Object.keys(currentIdentifiers).length;
                                  });
                                }
                                  
                                  if (matchingVar) {
                                    let updatedBox = {
                                      ...box,
                                      variableId: matchingVar.id,
                                      variableName: matchingVar.variableName,
                                      variableNameKey: matchingVar.variableNameKey || matchingVar.variableName,
                                      metricValue: matchingVar.value || '0',
                                      value: matchingVar.value,
                                    };
                                    
                                    // Recalculate comparison if enabled
                                    if (box.showGrowthRate && box.comparisonIdentifier && box.comparisonIdentifierValue) {
                                      const comparisonVar = variablesToUse.find((v: any) => {
                                        const vKey = v.variableNameKey || v.variableName;
                                        if (!vKey || !vKey.startsWith(basePattern + '_')) return false;
                                        
                                        const vParts = vKey.split('_');
                                        const vIdentifiers: Record<string, string> = {};
                                        
                                        let j = 2;
                                        while (j < vParts.length) {
                                          const key = vParts[j]?.toLowerCase();
                                          if (identifierTypes.includes(key) && j + 1 < vParts.length) {
                                            let val = vParts[j + 1];
                                            let nextIndex = j + 2;
                                            
                                            while (nextIndex < vParts.length) {
                                              const nextPart = vParts[nextIndex]?.toLowerCase();
                                              if (!identifierTypes.includes(nextPart)) {
                                                val += '_' + vParts[nextIndex];
                                                nextIndex++;
                                              } else {
                                                break;
                                              }
                                            }
                                            
                                            vIdentifiers[key] = val;
                                            j = nextIndex;
                                          } else {
                                            j++;
                                          }
                                        }
                                        
                                        // Check if comparison identifier matches and all other identifiers match
                                        const vIdentifierValue = vIdentifiers[box.comparisonIdentifier];
                                        if (vIdentifierValue !== box.comparisonIdentifierValue) return false;
                                        
                                        // Check all other identifiers match
                                        for (const [key, val] of Object.entries(currentIdentifiers)) {
                                          if (key !== box.comparisonIdentifier && vIdentifiers[key] !== val) {
                                            return false;
                                          }
                                        }
                                        
                                        return true;
                                      });
                                      
                                      if (comparisonVar) {
                                        const currentValue = parseFloat(matchingVar.value || '0');
                                        const comparisonValueNum = parseFloat(comparisonVar.value || '0');
                                        
                                        if (!isNaN(currentValue) && !isNaN(comparisonValueNum)) {
                                          const growthRate = comparisonValueNum !== 0 ? ((currentValue - comparisonValueNum) / comparisonValueNum) * 100 : 0;
                                          const absoluteDifference = currentValue - comparisonValueNum;
                                          updatedBox = {
                                            ...updatedBox,
                                            growthRateValue: growthRate,
                                            absoluteDifferenceValue: absoluteDifference,
                                            comparisonValue: comparisonVar.value
                                          };
                                        } else {
                                          updatedBox = {
                                            ...updatedBox,
                                            growthRateValue: undefined,
                                            absoluteDifferenceValue: undefined,
                                            comparisonValue: undefined
                                          };
                                        }
                                      } else {
                                        // Comparison variable not found
                                        updatedBox = {
                                          ...updatedBox,
                                          growthRateValue: undefined,
                                          absoluteDifferenceValue: undefined,
                                          comparisonValue: undefined
                                        };
                                      }
                                    }
                                    
                                    return updatedBox;
                                  } else {
                                    // No matching variable found - variable doesn't exist for current filter context
                                    return {
                                      ...box,
                                      metricValue: '-',
                                      value: null,
                                      growthRateValue: undefined,
                                      absoluteDifferenceValue: undefined,
                                      comparisonValue: undefined,
                                    };
                                  }
                                }
                              }
                              return box;
                            })
                          }));
                            
                            updatedLayouts = updatedLayouts?.map(layout => ({
                              ...layout,
                              boxes: layout.boxes.map(box => {
                                if (box.elementType === 'metric-card' && (box.variableNameKey || box.variableName)) {
                                  const variableKey = box.variableNameKey || box.variableName || '';
                                  if (variableKey) {
                                    // Parse current identifiers from variable key
                                    const parts = variableKey.split('_');
                                    const identifierTypes = ['brand', 'channel', 'year', 'month', 'week', 'region', 'category', 'segment'];
                                    const currentIdentifiers: Record<string, string> = {};
                                    
                                    let i = 2; // Skip first 2 parts (measure and aggregation)
                                    while (i < parts.length) {
                                      const key = parts[i]?.toLowerCase();
                                      if (identifierTypes.includes(key) && i + 1 < parts.length) {
                                        let val = parts[i + 1];
                                        let nextIndex = i + 2;
                                        
                                        while (nextIndex < parts.length) {
                                          const nextPart = parts[nextIndex]?.toLowerCase();
                                          if (!identifierTypes.includes(nextPart)) {
                                            val += '_' + parts[nextIndex];
                                            nextIndex++;
                                          } else {
                                            break;
                                          }
                                        }
                                        
                                        currentIdentifiers[key] = val;
                                        i = nextIndex;
                                      } else {
                                        i++;
                                      }
                                    }
                                    
                                    // Update with global filter (replace the identifier value)
                                    if (value !== '__all__') {
                                      currentIdentifiers[identifier] = value;
                                    } else {
                                      delete currentIdentifiers[identifier];
                                    }
                                    
                                    // Find base pattern (first 2 parts: measure and aggregation)
                                    const basePattern = parts.slice(0, 2).join('_');
                                    
                                    // Find matching variable with same structure but new identifier value
                                    const matchingVar = variablesToUse.find((v: any) => {
                                      const vKey = v.variableNameKey || v.variableName;
                                      if (!vKey || !vKey.startsWith(basePattern + '_')) return false;
                                      
                                      const vParts = vKey.split('_');
                                      const vIdentifiers: Record<string, string> = {};
                                      
                                      let j = 2;
                                      while (j < vParts.length) {
                                        const key = vParts[j]?.toLowerCase();
                                        if (identifierTypes.includes(key) && j + 1 < vParts.length) {
                                          let val = vParts[j + 1];
                                          let nextIndex = j + 2;
                                          
                                          while (nextIndex < vParts.length) {
                                            const nextPart = vParts[nextIndex]?.toLowerCase();
                                            if (!identifierTypes.includes(nextPart)) {
                                              val += '_' + vParts[nextIndex];
                                              nextIndex++;
                                            } else {
                                              break;
                                            }
                                          }
                                          
                                          vIdentifiers[key] = val;
                                          j = nextIndex;
                                        } else {
                                          j++;
                                        }
                                      }
                                      
                                      // Check if all current identifiers match (including the updated one)
                                      return Object.entries(currentIdentifiers).every(([key, val]) => 
                                        vIdentifiers[key] === val
                                      );
                                    });
                                    
                                    if (matchingVar) {
                                      let updatedBox = {
                                        ...box,
                                        variableId: matchingVar.id,
                                        variableName: matchingVar.variableName,
                                        variableNameKey: matchingVar.variableNameKey || matchingVar.variableName,
                                        metricValue: matchingVar.value || '0',
                                        value: matchingVar.value,
                                      };
                                      
                                      // Recalculate comparison if enabled
                                      if (box.showGrowthRate && box.comparisonIdentifier && box.comparisonIdentifierValue) {
                                        const comparisonVar = variablesToUse.find((v: any) => {
                                          const vKey = v.variableNameKey || v.variableName;
                                          if (!vKey || !vKey.startsWith(basePattern + '_')) return false;
                                          
                                          const vParts = vKey.split('_');
                                          const vIdentifiers: Record<string, string> = {};
                                          
                                          let j = 2;
                                          while (j < vParts.length) {
                                            const key = vParts[j]?.toLowerCase();
                                            if (identifierTypes.includes(key) && j + 1 < vParts.length) {
                                              let val = vParts[j + 1];
                                              let nextIndex = j + 2;
                                              
                                              while (nextIndex < vParts.length) {
                                                const nextPart = vParts[nextIndex]?.toLowerCase();
                                                if (!identifierTypes.includes(nextPart)) {
                                                  val += '_' + vParts[nextIndex];
                                                  nextIndex++;
                                                } else {
                                                  break;
                                                }
                                              }
                                              
                                              vIdentifiers[key] = val;
                                              j = nextIndex;
                                            } else {
                                              j++;
                                            }
                                          }
                                          
                                          // Check if comparison identifier matches and all other identifiers match
                                          const vIdentifierValue = vIdentifiers[box.comparisonIdentifier];
                                          if (vIdentifierValue !== box.comparisonIdentifierValue) return false;
                                          
                                          // Check all other identifiers match
                                          for (const [key, val] of Object.entries(currentIdentifiers)) {
                                            if (key !== box.comparisonIdentifier && vIdentifiers[key] !== val) {
                                              return false;
                                            }
                                          }
                                          
                                          return true;
                                        });
                                        
                                        if (comparisonVar) {
                                          const currentValue = parseFloat(matchingVar.value || '0');
                                          const comparisonValueNum = parseFloat(comparisonVar.value || '0');
                                          
                                          if (!isNaN(currentValue) && !isNaN(comparisonValueNum)) {
                                            const growthRate = comparisonValueNum !== 0 ? ((currentValue - comparisonValueNum) / comparisonValueNum) * 100 : 0;
                                            const absoluteDifference = currentValue - comparisonValueNum;
                                            updatedBox = {
                                              ...updatedBox,
                                              growthRateValue: growthRate,
                                              absoluteDifferenceValue: absoluteDifference,
                                              comparisonValue: comparisonVar.value
                                            };
                                          } else {
                                            updatedBox = {
                                              ...updatedBox,
                                              growthRateValue: undefined,
                                              absoluteDifferenceValue: undefined,
                                              comparisonValue: undefined
                                            };
                                          }
                                        } else {
                                          // Comparison variable not found
                                          updatedBox = {
                                            ...updatedBox,
                                            growthRateValue: undefined,
                                            absoluteDifferenceValue: undefined,
                                            comparisonValue: undefined
                                          };
                                        }
                                      }
                                      
                                      return updatedBox;
                                    } else {
                                      // No matching variable found - variable doesn't exist for current filter context
                                      return {
                                        ...box,
                                        metricValue: '-',
                                        value: null,
                                        growthRateValue: undefined,
                                        absoluteDifferenceValue: undefined,
                                        comparisonValue: undefined,
                                      };
                                    }
                                  }
                                }
                                return box;
                              })
                            }));
                            
                            onSettingsChange({ 
                              globalFilters: newGlobalFilters,
                              layouts: metricUpdatedLayouts,
                              previousLocalFilters: previousLocalFilters
                            });
                          })();
                      }}
                    >
                      <SelectTrigger className="w-full bg-white border-gray-300">
                        <SelectValue placeholder={`Select ${identifier}...`} />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="__all__">All {identifier}s</SelectItem>
                        {options.map((value) => (
                          <SelectItem key={value} value={value}>
                            {value.replace(/_/g, ' ')}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                );
              }))}
              
              {/* Apply Filters and Render Charts Buttons */}
              {(() => {
                // Check if any global filters are set (they always apply to charts)
                const hasChartFilters = Object.values(settings.globalFilters || {}).some(
                  (filter: any) => filter.values && filter.values.length > 0
                );
                const hasCharts = settings.layouts?.some(layout => 
                  layout.boxes.some(box => box.elementType === 'chart' && box.chartConfig)
                );
                
                if (!hasCharts) return null;
                
                // Function to render all charts (filters are already applied automatically)
                const handleRenderAllCharts = async () => {
                  setRenderingCharts(true);
                  try {
                    const allCharts = settings.layouts?.flatMap(layout => layout.boxes)
                      .filter(box => box.elementType === 'chart' && box.chartConfig) || [];
                    
                    // Render each chart
                    const renderedCharts = await Promise.all(
                      allCharts.map(async (box) => {
                        try {
                          const chartConfig = migrateLegacyChart(box.chartConfig);
                          
                          // Validate chart
                          if (!validateChart(chartConfig)) {
                            console.warn(`Chart ${box.id} validation failed`);
                            return { boxId: box.id, success: false, chartConfig: box.chartConfig };
                          }
                          
                          // Get file ID from data source
                          // Try multiple sources: settings, chart config, or data
                          const dataSource = (settings as any).selectedFile || (settings as any).dataSource;
                          const chartDataSource = (chartConfig as any)?.dataSource || (chartConfig as any)?.fileName;
                          let objectName = dataSource || chartDataSource;
                          
                          // If still no data source, try to get from the data prop (if available in parent)
                          if (!objectName && (chartConfig as any)?.filteredData?.fileName) {
                            objectName = (chartConfig as any).filteredData.fileName;
                          }
                          
                          if (!objectName) {
                            console.warn(`No data source found for chart ${box.id}`, {
                              settingsDataSource: dataSource,
                              chartDataSource,
                              chartConfig: Object.keys(chartConfig || {}),
                              settings: Object.keys(settings || {})
                            });
                            return { boxId: box.id, success: false, chartConfig: box.chartConfig };
                          }
                          
                          if (!objectName.endsWith('.arrow')) {
                            objectName += '.arrow';
                          }
                          
                          // Load dataframe
                          const uploadResponse = await chartMakerApi.loadSavedDataframe(objectName);
                          const fileId = uploadResponse.file_id;
                          
                          // Build chart request with filters from chart config
                          // Chart config filters already include global filters (synced in onValueChange)
                          const traces = buildTracesForAPI(chartConfig);
                          const mergedFilters = chartConfig.isAdvancedMode ? {} : chartConfig.filters || {};
                          
                          // Generate chart
                          const chartRequest = {
                            file_id: fileId,
                            chart_type: chartConfig.type === 'stacked_bar' ? 'bar' : chartConfig.type,
                            traces: traces,
                            title: chartConfig.title,
                            filters: Object.keys(mergedFilters).length > 0 ? mergedFilters : undefined,
                          };
                          
                          const chartResponse = await chartMakerApi.generateChart(chartRequest);
                          
                          const updatedChart = {
                            ...chartConfig,
                            chartConfig: chartResponse.chart_config,
                            filteredData: chartResponse.chart_config.data,
                            chartRendered: true,
                          };
                          
                          return { boxId: box.id, success: true, chartConfig: updatedChart };
                        } catch (error) {
                          console.error(`Error rendering chart ${box.id}:`, error);
                          return { boxId: box.id, success: false, chartConfig: box.chartConfig };
                        }
                      })
                    );
                    
                    // Update layouts with rendered charts
                    const updatedLayouts = settings.layouts?.map(layout => ({
                      ...layout,
                      boxes: layout.boxes.map(box => {
                        if (box.elementType === 'chart') {
                          const rendered = renderedCharts.find(r => r.boxId === box.id);
                          if (rendered && rendered.success && rendered.chartConfig) {
                            return {
                              ...box,
                              chartConfig: rendered.chartConfig
                            };
                          }
                        }
                        return box;
                      })
                    }));
                    
                    onSettingsChange({ layouts: updatedLayouts });
                  } catch (error) {
                    console.error('Error rendering charts:', error);
                  } finally {
                    setRenderingCharts(false);
                  }
                };
                
                return (
                  <div className="pt-3 border-t border-blue-200 space-y-2">
                    <Button
                      onClick={handleRenderAllCharts}
                      disabled={renderingCharts}
                      size="sm"
                      className="w-full bg-blue-600 hover:bg-blue-700"
                    >
                      <BarChart3 className="w-3 h-3 mr-1" />
                      {renderingCharts ? 'Rendering...' : 'Render All Charts'}
                    </Button>
                    <p className="text-xs text-blue-700 text-center">
                      Filters are applied automatically. Click to render all charts with the selected filters.
                    </p>
                  </div>
                );
              })()}
            </Card>
            <p className="text-xs text-muted-foreground">
              Select which element types to apply each filter to. Global filters are automatically synced to chart's individual filters. Click "Render All Charts" to see the changes.
            </p>
          </div>
        );
      })()}

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

          {/* Growth Rate / Absolute Difference */}
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
                            ...(checked ? {} : { growthRateValue: undefined, absoluteDifferenceValue: undefined, comparisonValue: undefined })
                          }
                        : box
                    )
                  }));
                  onSettingsChange({ layouts: updatedLayouts });
                }}
              />
              <Label htmlFor="showGrowthRate" className="text-sm font-medium cursor-pointer">
                Show Comparison
              </Label>
            </div>
            
            {selectedBox.showGrowthRate && (
              <div className="space-y-2 pl-6">
                {/* Comparison Display Type */}
                <div className="space-y-2">
                  <Label className="text-xs font-medium">
                    Display Type
                  </Label>
                  <Select
                    value={selectedBox.comparisonDisplayType || 'growthRate'}
                    onValueChange={(comparisonDisplayType) => {
                      const updatedLayouts = settings.layouts?.map(layout => ({
                        ...layout,
                        boxes: layout.boxes.map(box => 
                          box.id === settings.selectedBoxId 
                            ? { ...box, comparisonDisplayType: comparisonDisplayType as 'growthRate' | 'absoluteDifference' }
                            : box
                        )
                      }));
                      onSettingsChange({ layouts: updatedLayouts });
                    }}
                  >
                    <SelectTrigger className="w-full bg-white border-gray-300">
                      <SelectValue placeholder="Select display type..." />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="growthRate">Growth Rate (%)</SelectItem>
                      <SelectItem value="absoluteDifference">Absolute Difference</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
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
                          ? { ...box, comparisonIdentifier, comparisonIdentifierValue: undefined, growthRateValue: undefined, absoluteDifferenceValue: undefined, comparisonValue: undefined }
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
                              return { ...box, comparisonIdentifierValue, growthRateValue: undefined, absoluteDifferenceValue: undefined, comparisonValue: undefined };
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
                              
                              if (!isNaN(currentValue) && !isNaN(comparisonValueNum)) {
                                const growthRate = comparisonValueNum !== 0 ? ((currentValue - comparisonValueNum) / comparisonValueNum) * 100 : 0;
                                const absoluteDifference = currentValue - comparisonValueNum;
                                return {
                                  ...box,
                                  comparisonIdentifierValue,
                                  growthRateValue: growthRate,
                                  absoluteDifferenceValue: absoluteDifference,
                                  comparisonValue: comparisonVar.value
                                };
                              }
                            }
                            
                            return { ...box, comparisonIdentifierValue, growthRateValue: undefined, absoluteDifferenceValue: undefined, comparisonValue: undefined };
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
                
                {((selectedBox.comparisonDisplayType === 'growthRate' && selectedBox.growthRateValue !== undefined) || 
                  (selectedBox.comparisonDisplayType === 'absoluteDifference' && selectedBox.absoluteDifferenceValue !== undefined)) && (
                  <div className="text-xs text-muted-foreground">
                    {selectedBox.comparisonDisplayType === 'growthRate' ? (
                      <>
                        Growth Rate: {selectedBox.growthRateValue! > 0 ? '+' : ''}{selectedBox.growthRateValue!.toFixed(selectedBox.growthRateDecimalPlaces !== undefined ? selectedBox.growthRateDecimalPlaces : 1)}%
                        {selectedBox.comparisonValue && (
                          <span className="ml-2">(vs {selectedBox.comparisonValue})</span>
                        )}
                      </>
                    ) : (
                      <>
                        Absolute Difference: {selectedBox.absoluteDifferenceValue! > 0 ? '+' : ''}{selectedBox.absoluteDifferenceValue!.toFixed(selectedBox.growthRateDecimalPlaces !== undefined ? selectedBox.growthRateDecimalPlaces : 1)}
                        {selectedBox.comparisonValue && (
                          <span className="ml-2">(vs {selectedBox.comparisonValue})</span>
                        )}
                      </>
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

