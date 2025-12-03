import React, { useCallback, useEffect, useState, useRef } from 'react';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Upload, Settings } from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { CheckboxTemplate } from '@/templates/checkbox';
import { Checkbox } from '@/components/ui/checkbox';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { useToast } from '@/hooks/use-toast';
import { GROUPBY_API } from '@/lib/api';
import { resolveTaskResponse } from '@/lib/taskQueue';

import GroupByInputFiles from '../GroupByInputFiles';
import { useLaboratoryStore } from '@/components/LaboratoryMode/store/laboratoryStore';

interface GroupByPropertiesProps {
  atomId: string;
}

const GroupByProperties: React.FC<GroupByPropertiesProps> = ({ atomId }) => {
  const atom = useLaboratoryStore(state => state.getAtom(atomId));
  const updateSettings = useLaboratoryStore(state => state.updateAtomSettings);
  const settings = atom?.settings || {};
  const { toast } = useToast();
  // Tab for Input/Settings/Exhibition similar to CreateColumn
  const [tab, setTab] = useState('input');
  // Track if user has explicitly interacted with selections (to prevent useEffect from resetting)
  const userHasInteractedRef = useRef(false);
  // Track previous dataSource to detect file changes
  const previousDataSourceRef = useRef<string | undefined>(settings.dataSource);
  // State for perform button loading
  const [performLoading, setPerformLoading] = useState(false);

  // ------------------------------
  // Initial lists
  // ------------------------------
  const identifiers = settings.identifiers || [];
  const measures = settings.measures || [];
  const selectedIdentifiers = settings.selectedIdentifiers || [];
  const columns = settings.allColumns || [];

  // Fallback logic for identifiers and measures if not found in Mongo
  const categoricalColumns = columns.filter(
    (c: any) => c.data_type && (
      c.data_type.toLowerCase().includes('object') ||
      c.data_type.toLowerCase().includes('string') ||
      c.data_type.toLowerCase().includes('category')
    )
  ).map((c: any) => c.column);
  const numericalColumns = columns.filter(
    (c: any) => c.data_type && (
      c.data_type.toLowerCase().includes('int') ||
      c.data_type.toLowerCase().includes('float') ||
      c.data_type.toLowerCase().includes('number')
    )
  ).map((c: any) => c.column);

  const fallbackIdentifiers = identifiers.length === 0 ? categoricalColumns : identifiers;
  const fallbackMeasures = measures.length === 0 ? numericalColumns : measures;

  // ------------------------------
  // Get draggable lists from global store
  // ------------------------------
  // Filter identifierList to only include valid identifiers from fallbackIdentifiers
  const rawIdentifierList = settings.identifierList || fallbackIdentifiers;
  const identifierList = rawIdentifierList.filter(id => {
    const isValid = fallbackIdentifiers.includes(id);
    if (!isValid) {
      console.log('⚠️ [Filter] Removing invalid identifier from list:', id);
    }
    return isValid;
  });
  if (rawIdentifierList.length !== identifierList.length) {
    console.log('🔍 [Filter] Filtered identifierList:', {
      originalLength: rawIdentifierList.length,
      filteredLength: identifierList.length,
      removed: rawIdentifierList.filter(id => !fallbackIdentifiers.includes(id))
    });
  }
  const measureList = settings.measureList || fallbackMeasures;

  // Keep global lists in sync when fallback arrays change (e.g. after data fetch)
  useEffect(() => {
    if (fallbackIdentifiers.length > 0) {
      // Always update when data source changes, or if lists are empty
      const shouldUpdate = !settings.identifierList || 
                          settings.identifierList.length === 0 || 
                          JSON.stringify(settings.identifierList) !== JSON.stringify(fallbackIdentifiers);
      
      if (shouldUpdate) {
        updateSettings(atomId, { 
          identifierList: fallbackIdentifiers,
          identifiers: fallbackIdentifiers 
        });
      }
    }
  }, [fallbackIdentifiers, settings.identifierList, atomId, updateSettings]);

  useEffect(() => {
    if (fallbackMeasures.length > 0) {
      // Always update when data source changes, or if lists are empty
      const shouldUpdate = !settings.measureList || 
                          settings.measureList.length === 0 || 
                          JSON.stringify(settings.measureList) !== JSON.stringify(fallbackMeasures);
      
      if (shouldUpdate) {
        updateSettings(atomId, { 
          measureList: fallbackMeasures,
          measures: fallbackMeasures 
        });
      }
    }
  }, [fallbackMeasures, settings.measureList, atomId, updateSettings]);

  // Get selectedMeasures from global store
  const localSelectedMeasures = Array.isArray(settings.selectedMeasureNames) && settings.selectedMeasureNames.length > 0
    ? settings.selectedMeasureNames
    : (Array.isArray(settings.selectedMeasures) && settings.selectedMeasures.length > 0
        ? (typeof settings.selectedMeasures[0] === 'string'
            ? settings.selectedMeasures as string[]
            : (settings.selectedMeasures as any[]).map(m => m.field).filter(Boolean))
        : fallbackMeasures);

  // Ensure global selection includes all measures once they are available
  useEffect(() => {
    if (localSelectedMeasures.length === 0 && fallbackMeasures.length > 0) {
      updateSettings(atomId, { selectedMeasureNames: fallbackMeasures });
    }
  }, [fallbackMeasures, localSelectedMeasures.length, atomId, updateSettings]);

  // Update selected identifiers when data source changes (but NOT when user explicitly changes selection)
  useEffect(() => {
    if (fallbackIdentifiers.length > 0) {
      // Filter selected identifiers to only include those that exist in the new data
      const validSelectedIdentifiers = selectedIdentifiers.filter(id => 
        fallbackIdentifiers.includes(id)
      );
      
      // Only set defaults if data source actually changed (fallbackIdentifiers changed)
      // AND we have invalid identifiers (meaning data source changed)
      // Do NOT reset if user explicitly set to empty array
      const hasInvalidIdentifiers = selectedIdentifiers.length > 0 && 
        selectedIdentifiers.some(id => !fallbackIdentifiers.includes(id));
      
      // Only reset if data source changed (has invalid identifiers) and we need to clean up
      if (hasInvalidIdentifiers) {
        // Clean up invalid identifiers, keep valid ones
        console.log('⚙️ [useEffect] Cleaning invalid identifiers after data source change:', {
          validSelectedIdentifiers: validSelectedIdentifiers,
          removed: selectedIdentifiers.filter(id => !fallbackIdentifiers.includes(id))
        });
        updateSettings(atomId, { selectedIdentifiers: validSelectedIdentifiers });
      }
      // Don't set defaults here - let the initial load useEffect handle that
    }
  }, [fallbackIdentifiers, atomId, updateSettings]); // Removed selectedIdentifiers from deps to prevent reset on user actions

  // Update selected measures when data source changes
  useEffect(() => {
    if (fallbackMeasures.length > 0) {
      // Filter selected measures to only include those that exist in the new data
      const validSelectedMeasures = localSelectedMeasures.filter(measure => 
        fallbackMeasures.includes(measure)
      );
      
      // If no valid measures or data source changed, select all available measures for the settings panel
      if (validSelectedMeasures.length === 0 || 
          JSON.stringify(validSelectedMeasures) !== JSON.stringify(localSelectedMeasures)) {
        updateSettings(atomId, { 
          selectedMeasureNames: fallbackMeasures
        });
      }
    }
  }, [fallbackMeasures, localSelectedMeasures, atomId, updateSettings]);

  // 🔧 CRITICAL FIX: Automatically switch to Exhibition tab when AI results are available
  // useEffect(() => {
  //   const hasAIResults = settings.groupbyResults && 
  //                       settings.groupbyResults.unsaved_data && 
  //                       Array.isArray(settings.groupbyResults.unsaved_data) && 
  //                       settings.groupbyResults.unsaved_data.length > 0;
  //   
  //   if (hasAIResults) {
  //     console.log('🔄 AI results detected, switching to Exhibition tab');
  //     setTab('exhibition');
  //   }
  // }, [settings.groupbyResults?.unsaved_data, settings.groupbyResults?.result_file]);

  // ------------------------------
  // Drag helpers
  // ------------------------------
  type DragMeta = { item: string; source: 'identifiers' | 'measures' };

  const handleDragStart = (e: React.DragEvent<HTMLDivElement>, meta: DragMeta) => {
    e.dataTransfer.setData('text/plain', JSON.stringify(meta));
  };

  const handleDragOver = (e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault(); // Allow drop
  };

  const handleDrop = (e: React.DragEvent<HTMLDivElement>, destination: 'identifiers' | 'measures') => {
    e.preventDefault();
    const raw = e.dataTransfer.getData('text/plain');
    if (!raw) return;
    const { item, source } = JSON.parse(raw) as DragMeta;
    if (source === destination) return;

    if (source === 'identifiers' && destination === 'measures') {
      const newIdentifiers = identifierList.filter(i => i !== item);
      const newMeasures = [...measureList, item];
      // If the item was selected in identifiers, move its selection to measures
      if (selectedIdentifiers.includes(item)) {
        updateSettings(atomId, {
          selectedIdentifiers: selectedIdentifiers.filter(id => id !== item),
          selectedMeasureNames: [...localSelectedMeasures, item]
        });
      }
      updateSettings(atomId, { 
        identifiers: newIdentifiers, 
        measures: newMeasures,
        identifierList: newIdentifiers,
        measureList: newMeasures
      });
    } else if (source === 'measures' && destination === 'identifiers') {
      const newMeasures = measureList.filter(m => m !== item);
      const newIdentifiers = [...identifierList, item];
      // If the item was selected in measures, move its selection to identifiers
      if (localSelectedMeasures.includes(item)) {
        updateSettings(atomId, {
          selectedMeasureNames: localSelectedMeasures.filter(m => m !== item)
        });
      }
      updateSettings(atomId, { 
        identifiers: newIdentifiers, 
        measures: newMeasures,
        identifierList: newIdentifiers,
        measureList: newMeasures
      });
    }
  };

  // ------------------------------
  // Toggle helpers
  // ------------------------------
  const toggleIdentifier = useCallback((identifier: string) => {
    userHasInteractedRef.current = true;
    const newSelected = selectedIdentifiers.includes(identifier)
      ? selectedIdentifiers.filter(id => id !== identifier)
      : [...selectedIdentifiers, identifier];
    console.log('🔄 [Toggle Identifier]:', {
      identifier,
      wasSelected: selectedIdentifiers.includes(identifier),
      newSelected: newSelected,
      newLength: newSelected.length
    });
    updateSettings(atomId, { selectedIdentifiers: newSelected });
  }, [selectedIdentifiers, atomId, updateSettings]);

  const toggleMeasure = useCallback((measure: string) => {
    const isSelected = localSelectedMeasures.includes(measure);
    const newSelected = isSelected
      ? localSelectedMeasures.filter(m => m !== measure)
      : [...localSelectedMeasures, measure];
    // Persist selected measure names in settings so canvas dropdown updates but without altering measure rows
    updateSettings(atomId, { selectedMeasureNames: newSelected });
  }, [localSelectedMeasures, atomId, updateSettings]);

  const selectedAggregationMethods = Array.isArray(settings.selectedAggregationMethods) && settings.selectedAggregationMethods.length > 0
    ? settings.selectedAggregationMethods
    : ['Sum', 'Mean', 'Min', 'Max', 'Count', 'Median', 'Weighted Mean', 'Rank Percentile'];

  const toggleAggregationMethod = useCallback((agg: string) => {
    const newSelected = selectedAggregationMethods.includes(agg)
      ? selectedAggregationMethods.filter(a => a !== agg)
      : [...selectedAggregationMethods, agg];
    updateSettings(atomId, { selectedAggregationMethods: newSelected });
  }, [selectedAggregationMethods, atomId, updateSettings]);

  // Get selected measures configuration from settings
  const selectedMeasures = settings.selectedMeasures || [];

  // Helper to normalize column names
  const normalizeColumnName = (value: string | undefined | null) => {
    if (!value || typeof value !== 'string') return '';
    return value.trim().toLowerCase();
  };

  // Update measure configuration (aggregator, weight_by, rename_to)
  const updateMeasureConfig = useCallback((measure: string, field: 'aggregator' | 'weight_by' | 'rename_to', value: string) => {
    // Find existing measure config or create new one
    const existingIndex = selectedMeasures.findIndex((m: any) => 
      (typeof m === 'string' ? m : m.field) === measure
    );
    
    let newMeasures;
    if (existingIndex >= 0) {
      // Update existing measure config
      newMeasures = selectedMeasures.map((m: any, i: number) => {
        if (i === existingIndex) {
          const currentMeasure = typeof m === 'string' ? { field: m, aggregator: 'Sum', weight_by: '', rename_to: '' } : m;
          return { ...currentMeasure, [field]: value };
        }
        return m;
      });
    } else {
      // Add new measure config
      newMeasures = [...selectedMeasures, { field: measure, aggregator: field === 'aggregator' ? value : 'Sum', weight_by: field === 'weight_by' ? value : '', rename_to: field === 'rename_to' ? value : '' }];
    }
    
    updateSettings(atomId, { selectedMeasures: newMeasures });
  }, [selectedMeasures, atomId, updateSettings]);

  // Get measure config for a specific measure
  const getMeasureConfig = useCallback((measure: string) => {
    const config = selectedMeasures.find((m: any) => 
      (typeof m === 'string' ? m : m.field) === measure
    );
    if (!config || typeof config === 'string') {
      return { aggregator: 'Sum', weight_by: '', rename_to: '' };
    }
    return { aggregator: config.aggregator || 'Sum', weight_by: config.weight_by || '', rename_to: config.rename_to || '' };
  }, [selectedMeasures]);

  // Get numeric columns for Weight By dropdown
  const numericColumns = (settings.allColumns || []).filter(
    (c: any) => c.data_type && (
      c.data_type.toLowerCase().includes('int') ||
      c.data_type.toLowerCase().includes('float') ||
      c.data_type.toLowerCase().includes('number')
    )
  ).map((c: any) => c.column);

  // Handler for Perform button
  const handlePerform = async () => {
    setPerformLoading(true);
    try {
      // Collect identifiers, measures, aggregations, and measure config
      const identifiers = selectedIdentifiers.map((id: string) => normalizeColumnName(id)).filter(Boolean);
      
      // Build proper selectedMeasures array with configurations
      const measuresWithConfig = localSelectedMeasures.map((measure: string) => {
        const config = getMeasureConfig(measure);
        return {
          field: measure,
          aggregator: config.aggregator,
          weight_by: config.weight_by,
          rename_to: config.rename_to
        };
      });
      
      // Build aggregations object from measure config
      const aggregations: Record<string, any> = {};
      // Prepare for rename validation
      const existingColsLower = new Set(
        (settings.allColumns || []).map((c: any) => (c.column || '').toLowerCase())
      );
      const renameSeen = new Set<string>();

      // Use measuresWithConfig to build aggregations
      measuresWithConfig.forEach((measure: any) => {
        if (measure.field && measure.aggregator) {
          // Map aggregator names to backend-friendly keys
          const aggRaw = (measure.aggregator || '').toLowerCase();
          let aggKey = aggRaw;
          if (aggRaw === 'weighted mean') aggKey = 'weighted_mean';
          if (aggRaw === 'rank percentile') aggKey = 'rank_pct';

          const normalizedField = normalizeColumnName(measure.field);
          if (!normalizedField) return;

          const aggObj: any = { agg: aggKey };
          
          // Validate rename uniqueness
          if (measure.rename_to && measure.rename_to.trim()) {
            const renameLower = measure.rename_to.trim().toLowerCase();
            if (renameSeen.has(renameLower) || existingColsLower.has(renameLower)) {
              toast({
                title: 'Invalid rename',
                description: `Column name '${measure.rename_to}' is already used. Choose a unique name.`,
                variant: 'destructive',
              });
              setPerformLoading(false);
              throw new Error(`Duplicate or existing column name: ${measure.rename_to}`);
            }
            renameSeen.add(renameLower);
            aggObj.rename_to = measure.rename_to.trim();
          }
          
          if (aggKey === 'weighted_mean' && measure.weight_by) {
            aggObj.weight_by = normalizeColumnName(measure.weight_by);
          }
          aggregations[normalizedField] = aggObj;
        }
      });

      console.log('🚀 GroupBy Perform - Sending data:', {
        identifiers,
        aggregations,
        measuresWithConfig,
        dataSource: settings.dataSource,
        validator_atom_id: atomId
      });
      
      // Validate we have data to send
      if (identifiers.length === 0) {
        toast({
          title: 'Missing Identifiers',
          description: 'Please select at least one identifier.',
          variant: 'destructive',
        });
        setPerformLoading(false);
        return;
      }
      
      if (Object.keys(aggregations).length === 0) {
        toast({
          title: 'Missing Measures',
          description: 'Please select at least one measure with an aggregation method.',
          variant: 'destructive',
        });
        setPerformLoading(false);
        return;
      }
      
      // Prepare form data
      const formData = new FormData();
      formData.append('validator_atom_id', atomId);
      formData.append('file_key', settings.dataSource || '');
      formData.append('bucket_name', 'trinity');
      formData.append('object_names', settings.dataSource || '');
      formData.append('identifiers', JSON.stringify(identifiers));
      formData.append('aggregations', JSON.stringify(aggregations));
      
      console.log('📤 FormData being sent:', {
        validator_atom_id: atomId,
        file_key: settings.dataSource || '',
        bucket_name: 'trinity',
        object_names: settings.dataSource || '',
        identifiers: JSON.stringify(identifiers),
        aggregations: JSON.stringify(aggregations)
      });
      
      console.log('📤 Calling GroupBy backend:', `${GROUPBY_API}/run`);
      
      const res = await fetch(`${GROUPBY_API}/run`, { method: 'POST', body: formData });
      let payload: any = {};
      try {
        payload = await res.json();
      } catch {}

      console.log('📥 GroupBy backend response:', payload);

      if (!res.ok) {
        let detail = res.statusText;
        if (payload?.detail) {
          if (typeof payload.detail === 'string') {
            detail = payload.detail;
          } else if (Array.isArray(payload.detail)) {
            // FastAPI validation errors come as array
            detail = payload.detail.map((err: any) => {
              const loc = err.loc ? err.loc.join(' -> ') : 'unknown';
              return `${loc}: ${err.msg}`;
            }).join(', ');
          }
        }
        console.error('❌ GroupBy Error Details:', payload);
        throw new Error(detail || 'GroupBy run failed');
      }

      const data = (await resolveTaskResponse(payload)) || {};
      
      if (data.status === 'SUCCESS' && data.result_file) {
        // Check if we have results data directly
        if (data.results && Array.isArray(data.results)) {
          const allRows = data.results;
          
          // Determine identifiers that have >1 unique value
          const idWithVariety = selectedIdentifiers.filter((id: string) => {
            const uniq = new Set(allRows.map((r: any) => r[id])).size;
            return uniq > 1;
          });
          
          const headers = Object.keys(allRows[0]).filter((h) => {
            if (selectedIdentifiers.includes(h)) {
              return idWithVariety.includes(h);
            }
            return true; // keep measure columns
          });
          
          // Persist result metadata and data
          updateSettings(atomId, {
            groupbyResults: {
              result_file: data.result_file,
              result_shape: [allRows.length, headers.length],
              row_count: data.row_count,
              columns: data.columns,
              unsaved_data: allRows
            },
          });
          
          toast({
            title: 'Success',
            description: `GroupBy completed! ${allRows.length} rows processed.`,
          });
        } else {
          // Fallback: try to fetch results from the saved file
          console.log('🔄 No direct results, trying to fetch from saved file...');
          
          try {
            const totalRows = typeof data.row_count === 'number' ? data.row_count : 1000;
            const pageSize = Math.min(Math.max(totalRows, 50), 1000);
            const cachedUrl = `${GROUPBY_API}/cached_dataframe?object_name=${encodeURIComponent(
              data.result_file
            )}&page=1&page_size=${pageSize}`;
            const cachedRes = await fetch(cachedUrl);
            let cachedPayload: any = {};
            try {
              cachedPayload = await cachedRes.json();
            } catch {}
            if (cachedRes.ok) {
              const cachedData = (await resolveTaskResponse(cachedPayload)) || {};
              const csvText = String(cachedData?.data ?? '');
              const lines = csvText.split('\n');
              if (lines.length <= 1) {
                throw new Error('No data rows found in CSV');
              }

              const headers = lines[0].split(',').map(h => h.trim().replace(/"/g, ''));
              const rows = lines
                .slice(1)
                .filter(line => line.trim())
                .map(line => {
                  const values = line.split(',').map(v => v.trim().replace(/"/g, ''));
                  const row: any = {};
                  headers.forEach((header, index) => {
                    row[header] = values[index] || '';
                  });
                  return row;
                });
              
              updateSettings(atomId, {
                groupbyResults: {
                  result_file: data.result_file,
                  result_shape: [rows.length, headers.length],
                  row_count: data.row_count,
                  columns: data.columns,
                  unsaved_data: rows
                },
              });
              
              toast({
                title: 'Success',
                description: `GroupBy completed! ${rows.length} rows processed.`,
              });
            } else {
              const detail = typeof cachedPayload?.detail === 'string' ? cachedPayload.detail : undefined;
              throw new Error(detail || 'Failed to fetch cached results');
            }
          } catch (fetchError) {
            console.error('❌ Error fetching cached results:', fetchError);
            updateSettings(atomId, {
              groupbyResults: {
                result_file: data.result_file,
                result_shape: [0, 0],
                row_count: data.row_count,
                columns: data.columns
              },
            });
            
            toast({
              title: 'Partial Success',
              description: 'GroupBy operation completed, but results display failed. Check the saved file.',
            });
          }
        }
      } else {
        toast({
          title: 'Error',
          description: data.error || 'GroupBy operation failed',
          variant: 'destructive',
        });
      }
    } catch (e: any) {
      console.error('❌ GroupBy Perform Error:', e);
      toast({
        title: 'Error',
        description: e.message || 'Error performing groupby',
        variant: 'destructive',
      });
    } finally {
      setPerformLoading(false);
    }
  };

  // Sample data for visualization
  const chartData = [
    { name: 'Group 1', value: 400 },
    { name: 'Group 2', value: 300 },
    { name: 'Group 3', value: 500 },
    { name: 'Group 4', value: 200 },
    { name: 'Group 5', value: 350 },
  ];

  // Detect file/data source changes and reset interaction flag
  useEffect(() => {
    const currentDataSource = settings.dataSource;
    const previousDataSource = previousDataSourceRef.current;
    
    // If dataSource changed (and it's not the initial render)
    if (previousDataSource !== undefined && currentDataSource !== previousDataSource) {
      console.log('🔄 [File Change Detected] Resetting interaction flag and clearing old measures:', {
        previousDataSource,
        currentDataSource
      });
      userHasInteractedRef.current = false; // Reset so defaults run again
      // Clear selectedMeasures (complex objects with rename_to from previous file)
      updateSettings(atomId, { 
        selectedMeasures: [] // Clear old measure objects with rename_to from previous file
      });
    }
    
    // Update the ref for next comparison
    previousDataSourceRef.current = currentDataSource;
  }, [settings.dataSource, atomId, updateSettings]);

  // Default select identifiers with unique_count > 1, and all measures and aggregation methods
  // Runs on initial load OR when file/data source changes
  useEffect(() => {
    // Check if we have valid selected identifiers for the current file
    // If selectedIdentifiers exist and are valid, don't reset them (user has made selections)
    const hasValidSelections = selectedIdentifiers.length > 0 && 
      selectedIdentifiers.every(id => fallbackIdentifiers.includes(id));
    
    // Only set defaults if:
    // 1. We have identifiers available
    // 2. User hasn't explicitly interacted yet (or file just changed, which resets the flag)
    // 3. AND we don't have valid existing selections (to preserve user selections when returning to same file)
    const shouldSetDefaults = fallbackIdentifiers.length > 0 && 
                              !userHasInteractedRef.current && 
                              !hasValidSelections;
    
    if (shouldSetDefaults) {
      // Get identifiers with unique_count > 1
      const uniqueIdentifiers = fallbackIdentifiers.filter(identifier => {
        const colInfo = (settings.allColumns || []).find((col: any) => col.column === identifier);
        return colInfo && colInfo.unique_count > 1;
      });
      // If we found identifiers with unique_count > 1, use them, otherwise fallback to all identifiers
      const defaultIdentifiers = uniqueIdentifiers.length > 0 ? uniqueIdentifiers : fallbackIdentifiers;
      console.log('⚙️ [useEffect Default] Setting default identifiers:', {
        fallbackIdentifiersLength: fallbackIdentifiers.length,
        selectedIdentifiersLength: selectedIdentifiers.length,
        uniqueIdentifiersLength: uniqueIdentifiers.length,
        defaultIdentifiers: defaultIdentifiers,
        userHasInteracted: userHasInteractedRef.current,
        hasValidSelections: hasValidSelections,
        dataSource: settings.dataSource
      });
      updateSettings(atomId, { selectedIdentifiers: defaultIdentifiers });
    } else if (hasValidSelections) {
      // If we have valid selections, mark as interacted to prevent future resets
      userHasInteractedRef.current = true;
      console.log('✅ [useEffect Default] Preserving existing identifier selections:', {
        selectedIdentifiers: selectedIdentifiers,
        dataSource: settings.dataSource
      });
    }
    // Set default measures if needed (only if user hasn't interacted or file changed)
    if (fallbackMeasures.length > 0 && !userHasInteractedRef.current) {
      const hasValidMeasureSelections = localSelectedMeasures.length > 0 && 
        localSelectedMeasures.every(m => fallbackMeasures.includes(m));
      if (!hasValidMeasureSelections) {
        console.log('⚙️ [useEffect Default] Setting default measures:', {
          fallbackMeasures: fallbackMeasures,
          dataSource: settings.dataSource
        });
        updateSettings(atomId, { selectedMeasureNames: fallbackMeasures });
      }
    }
    
    const allAggs = ['Sum', 'Mean', 'Min', 'Max', 'Count', 'Median', 'Weighted Mean', 'Rank Percentile'];
    if ((!Array.isArray(settings.selectedAggregationMethods) || settings.selectedAggregationMethods.length === 0)) {
      updateSettings(atomId, { selectedAggregationMethods: allAggs });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [fallbackIdentifiers, fallbackMeasures, settings.dataSource]);

  return (
    <div className="h-full flex flex-col">
      <Tabs value={tab} onValueChange={setTab} className="flex-1 flex flex-col">
        <TabsList className="grid w-full grid-cols-2">
          <TabsTrigger value="input" className="text-xs font-medium">
            <Upload className="w-3 h-3 mr-1" />
            Input
          </TabsTrigger>
          <TabsTrigger value="settings" className="text-xs font-medium">
            <Settings className="w-3 h-3 mr-1" />
            Settings
          </TabsTrigger>
        </TabsList>

        {/* Input Files Tab */}
        <TabsContent value="input" className="flex-1 mt-0" forceMount>
          <GroupByInputFiles atomId={atomId} />
        </TabsContent>

        {/* Settings Tab */}
        <TabsContent value="settings" className="flex-1 mt-0" forceMount>
          <Card className="border-l-4 border-l-blue-500"
                onDragOver={handleDragOver}
                onDrop={(e) => handleDrop(e, 'identifiers')}>
            <CardHeader className="py-3">
              <CardTitle className="text-sm">Identifiers Selection</CardTitle>
            </CardHeader>
            <CardContent className="py-3">
              <div className="flex items-center space-x-2 pb-2 border-b mb-2">
                <Checkbox
                  id="select-all-identifiers"
                  checked={(() => {
                    const allSelected = identifierList.length > 0 &&
                      identifierList.every(id => selectedIdentifiers.includes(id));
                    console.log('🔍 [Identifiers Select All] Debug:', {
                      identifierListLength: identifierList.length,
                      selectedIdentifiersLength: selectedIdentifiers.length,
                      identifierList: identifierList,
                      selectedIdentifiers: selectedIdentifiers,
                      allSelected: allSelected,
                      checkResult: identifierList.every(id => {
                        const included = selectedIdentifiers.includes(id);
                        if (!included) {
                          console.log(`  ❌ Missing: ${id}`);
                        }
                        return included;
                      })
                    });
                    return allSelected;
                  })()}
                  onCheckedChange={(checked) => {
                    userHasInteractedRef.current = true;
                    console.log('🖱️ [Identifiers Select All] Clicked:', {
                      checked,
                      identifierList: identifierList,
                      willSetTo: checked ? [...identifierList] : []
                    });
                    updateSettings(atomId, {
                      selectedIdentifiers: checked ? [...identifierList] : []
                    });
                  }}
                />
                <label
                  htmlFor="select-all-identifiers"
                  className="text-xs font-medium cursor-pointer flex-1"
                >
                  Select All
                </label>
              </div>
               <div className="grid grid-cols-2 gap-2 max-h-48 overflow-y-auto pr-2 custom-scrollbar">
                 {identifierList.map((identifier: string) => {
                  const isSelected = selectedIdentifiers.includes(identifier);
                  return (
                    <div
                       key={identifier}
                       title={identifier}
                       className="cursor-pointer select-none"
                       onClick={() => toggleIdentifier(identifier)}
                       draggable
                       onDragStart={(e) => handleDragStart(e, { item: identifier, source: 'identifiers' })}
                     >
                      <CheckboxTemplate
                        id={identifier}
                        label={identifier}
                        checked={isSelected}
                        onCheckedChange={() => toggleIdentifier(identifier)}
                        labelClassName="text-xs cursor-pointer capitalize truncate max-w-full"
                      />
                    </div>
                  );
                })}
              </div>
            </CardContent>
          </Card>
          <Card className="border-l-4 border-l-green-500"
                onDragOver={handleDragOver}
                onDrop={(e) => handleDrop(e, 'measures')}>
            <CardHeader className="py-3">
              <CardTitle className="text-sm">Measures Configuration</CardTitle>
            </CardHeader>
            <CardContent className="py-3">
               <div className="space-y-2 max-h-96 overflow-y-auto pr-2 custom-scrollbar">
                 {measureList.map((measure: string) => {
                   const isSelected = localSelectedMeasures.includes(measure);
                   const config = getMeasureConfig(measure);
                   return (
                     <div
                        key={measure}
                        className={`border border-gray-200 rounded-lg bg-gradient-to-r from-green-50/50 to-emerald-50/50 ${isSelected ? 'p-2' : 'p-1.5'}`}
                      >
                       <div
                         title={measure}
                         className={`cursor-pointer select-none ${isSelected ? 'mb-1' : ''}`}
                         onClick={() => toggleMeasure(measure)}
                         draggable
                         onDragStart={(e) => handleDragStart(e, { item: measure, source: 'measures' })}
                       >
                         <CheckboxTemplate
                           id={measure}
                           label={measure}
                           checked={isSelected}
                           onCheckedChange={() => toggleMeasure(measure)}
                           labelClassName="text-xs font-medium cursor-pointer capitalize truncate max-w-full"
                         />
                       </div>
                      {isSelected && (
                        <div className="ml-5 space-y-1.5 mt-1.5">
                          <div>
                            <Label className="text-[10px] text-gray-600 mb-0.5">Method</Label>
                            <Select 
                              value={config.aggregator} 
                              onValueChange={(value) => updateMeasureConfig(measure, 'aggregator', value)}
                            >
                              <SelectTrigger className="h-7 text-[10px] bg-white">
                                <SelectValue placeholder="Select method" />
                              </SelectTrigger>
                              <SelectContent>
                                {selectedAggregationMethods.map((agg: string) => (
                                  <SelectItem key={agg} value={agg} className="text-[10px]">{agg}</SelectItem>
                                ))}
                              </SelectContent>
                            </Select>
                          </div>
                          {config.aggregator === 'Weighted Mean' && (
                            <div>
                              <Label className="text-[10px] text-gray-600 mb-0.5">Weight By</Label>
                              <Select 
                                value={config.weight_by || ''} 
                                onValueChange={(value) => updateMeasureConfig(measure, 'weight_by', value)}
                              >
                                <SelectTrigger className="h-7 text-[10px] bg-white">
                                  <SelectValue placeholder="Select weight column" />
                                </SelectTrigger>
                                <SelectContent>
                                  {numericColumns.length > 0 ? (
                                    numericColumns.map((col: string) => (
                                      <SelectItem key={col} value={col} className="text-[10px]">{col}</SelectItem>
                                    ))
                                  ) : (
                                    <div className="p-2 text-[10px] text-gray-500">No numeric columns available</div>
                                  )}
                                </SelectContent>
                              </Select>
                            </div>
                          )}
                           <div>
                             <Label className="text-[10px] text-gray-600 mb-0.5">Rename To</Label>
                             <Input
                               placeholder="New column name"
                               value={config.rename_to || ''}
                               onChange={(e) => updateMeasureConfig(measure, 'rename_to', e.target.value)}
                               className="h-7 text-[10px] bg-white placeholder:text-[9px]"
                             />
                           </div>
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            </CardContent>
          </Card>
           <Card className="hidden border-l-4 border-l-orange-500">
             <CardHeader className="py-3">
               <CardTitle className="text-sm">Aggregation Methods</CardTitle>
             </CardHeader>
             <CardContent className="py-3">
               <div className="grid grid-cols-2 gap-2 max-h-48 overflow-y-auto pr-2 custom-scrollbar">
                 {['Sum', 'Mean', 'Min', 'Max', 'Count', 'Median', 'Weighted Mean', 'Rank Percentile'].map((agg) => {
                   const isSelected = selectedAggregationMethods.includes(agg);
                   return (
                     <div key={agg} title={agg} className="cursor-pointer select-none"
                        onClick={() => toggleAggregationMethod(agg)}
                      >
                       <CheckboxTemplate
                         id={agg}
                         label={agg}
                         checked={isSelected}
                         onCheckedChange={() => toggleAggregationMethod(agg)}
                         labelClassName="text-xs cursor-pointer capitalize truncate max-w-full"
                       />
                     </div>
                   );
                 })}
               </div>
             </CardContent>
           </Card>
           
           {/* Perform Button - Sticky at bottom */}
           <div className="sticky bottom-0 left-0 right-0 mt-3 bg-white border-t pt-3 z-10">
             <Button
               onClick={handlePerform}
               disabled={performLoading || selectedIdentifiers.length === 0 || localSelectedMeasures.length === 0}
               className="w-full bg-green-600 hover:bg-green-700 text-white py-2 text-sm h-9"
             >
               {performLoading ? 'Processing...' : 'Perform'}
             </Button>
           </div>
         </TabsContent>
       </Tabs>
       {/* Custom scrollbar styles */}
       <style>{`
         .custom-scrollbar::-webkit-scrollbar {
           width: 10px;
           background: #f3f4f6;
           border-radius: 8px;
         }
         .custom-scrollbar::-webkit-scrollbar-thumb {
           background: #d1d5db;
           border-radius: 8px;
           border: 2px solid #f3f4f6;
         }
         .custom-scrollbar::-webkit-scrollbar-thumb:hover {
           background: #9ca3af;
         }
         .custom-scrollbar {
           scrollbar-color: #d1d5db #f3f4f6;
           scrollbar-width: thin;
         }
       `}</style>
     </div>
   );
 };
 
 export default GroupByProperties;