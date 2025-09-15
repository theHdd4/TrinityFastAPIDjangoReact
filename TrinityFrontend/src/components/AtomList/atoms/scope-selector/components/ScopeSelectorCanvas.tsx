import React, { useEffect, useState, useMemo } from 'react';
import { useToast } from '@/hooks/use-toast';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Checkbox } from '@/components/ui/checkbox';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Plus, Settings, Calendar, X, Loader2, Target, Check, BarChart3, ArrowUp, ArrowDown, Filter as FilterIcon } from 'lucide-react';
import { SCOPE_SELECTOR_API, CLASSIFIER_API, FEATURE_OVERVIEW_API, GROUPBY_API } from '@/lib/api';
import { ScopeSelectorData, ScopeData } from '../ScopeSelectorAtom';
import Table from '@/templates/tables/table';
import scopeSelector from '../index';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';
import {
  ContextMenu,
  ContextMenuContent,
  ContextMenuItem,
  ContextMenuSeparator,
  ContextMenuSub,
  ContextMenuSubContent,
  ContextMenuSubTrigger,
  ContextMenuTrigger,
} from '@/components/ui/context-menu';
import { useLaboratoryStore } from '@/components/LaboratoryMode/store/laboratoryStore';

interface ScopeSelectorCanvasProps {
  data: ScopeSelectorData;
  onDataChange: (newData: Partial<ScopeSelectorData>) => void;
  atomId?: string;
}

const ScopeSelectorCanvas: React.FC<ScopeSelectorCanvasProps> = ({ data, onDataChange, atomId }) => {
  // Debug log to track data updates
  useEffect(() => {
    console.log('ScopeSelectorCanvas data updated:', {
      dataSource: data.dataSource,
      selectedIdentifiers: data.selectedIdentifiers,
      hasRequiredData: data.dataSource && data.selectedIdentifiers?.length > 0
    });
  }, [data]);
  const [uniqueValues, setUniqueValues] = useState<{ [key: string]: string[] }>({});
  // Scope-specific filtered values and their loading flags
  const [filteredValues, setFilteredValues] = useState<{ [scopeId: string]: { [key: string]: string[] } }>({});
  const [loadingValues, setLoadingValues] = useState<{ [key: string]: boolean }>({});
  const [filteredLoading, setFilteredLoading] = useState<{ [scopeId: string]: { [key: string]: boolean } }>({});
  const { toast } = useToast();
  const [saving, setSaving] = useState(false);
  // Get atom settings to access the input file name
  const atom = useLaboratoryStore(state => atomId ? state.getAtom(atomId) : undefined);
  const updateAtomSettings = useLaboratoryStore(state => state.updateAtomSettings);
  const atomSettings = (atom?.settings as any) || {};
  const inputFileName = atomSettings.dataSource || data.dataSource || '';

  // Preview row counts per scope after save
  type PreviewRow = { scopeId: string; values: Record<string, string>; count: number; pctPass?: boolean };
  const [previewRows, setPreviewRows] = useState<PreviewRow[]>(() => {
    return atomSettings.previewRows || [];
  });

  // Sync with global store changes
  React.useEffect(() => {
    if (atomSettings.previewRows) {
      setPreviewRows(atomSettings.previewRows);
    }
  }, [atomSettings.previewRows]);

  // Handle opening the input file in a new tab
  const handleViewDataClick = () => {
    if (inputFileName && atomId) {
      window.open(`/dataframe?name=${encodeURIComponent(inputFileName)}`, '_blank');
    }
  };
  
  // Date range fetched from backend
  const [dateRange, setDateRange] = useState<{min: string|null; max: string|null; available: boolean}>({ min: null, max: null, available: false });
  
  // Data preview sorting and filtering state
  const [previewSortColumn, setPreviewSortColumn] = useState<string>('');
  const [previewSortDirection, setPreviewSortDirection] = useState<'asc' | 'desc'>('asc');
  const [previewColumnFilters, setPreviewColumnFilters] = useState<{ [key: string]: string[] }>({});
  
  // Cardinality view state
  const [cardinalityData, setCardinalityData] = useState<any[]>([]);
  const [cardinalityLoading, setCardinalityLoading] = useState(false);
  const [cardinalityError, setCardinalityError] = useState<string | null>(null);
  const [sortColumn, setSortColumn] = useState<string>('unique_count');
  const [sortDirection, setSortDirection] = useState<'asc' | 'desc'>('desc');
  const [columnFilters, setColumnFilters] = useState<{ [key: string]: string[] }>({});
  
  // Drag and drop state
  const [draggedIdentifier, setDraggedIdentifier] = useState<string | null>(null);
  const [dragOverIdentifier, setDragOverIdentifier] = useState<string | null>(null);
  
  // Debug log
  useEffect(() => {
    console.log('ScopeSelectorCanvas data updated', {
      dataSource: data.dataSource,
      selectedIdentifiers: data.selectedIdentifiers,
      scopes: data.scopes,
      uniqueValues: Object.keys(uniqueValues),
      filteredValuesKeys: Object.keys(filteredValues),
      loadingValues: Object.entries(loadingValues).filter(([_, v]) => v).map(([k]) => k),
      filteredLoading: Object.entries(filteredLoading).flatMap(([s, obj]) => Object.entries(obj).filter(([_, v]) => v).map(([k]) => `${s}:${k}`))
    });
  }, [data, uniqueValues, loadingValues]);

  // Drag and drop handlers
  const handleDragStart = (e: React.DragEvent, identifier: string) => {
    setDraggedIdentifier(identifier);
    e.dataTransfer.effectAllowed = 'move';
    e.dataTransfer.setData('text/plain', identifier);
  };

  const handleDragOver = (e: React.DragEvent, identifier: string) => {
    e.preventDefault();
    e.dataTransfer.dropEffect = 'move';
    setDragOverIdentifier(identifier);
  };

  const handleDragLeave = (e: React.DragEvent) => {
    e.preventDefault();
    setDragOverIdentifier(null);
  };

  const handleDrop = (e: React.DragEvent, targetIdentifier: string) => {
    e.preventDefault();
    setDragOverIdentifier(null);
    
    if (draggedIdentifier && draggedIdentifier !== targetIdentifier) {
      const currentIndex = data.selectedIdentifiers.indexOf(draggedIdentifier);
      const targetIndex = data.selectedIdentifiers.indexOf(targetIdentifier);
      
      if (currentIndex !== -1 && targetIndex !== -1) {
        const newIdentifiers = [...data.selectedIdentifiers];
        newIdentifiers.splice(currentIndex, 1);
        newIdentifiers.splice(targetIndex, 0, draggedIdentifier);
        
        onDataChange({ selectedIdentifiers: newIdentifiers });
      }
    }
    
    setDraggedIdentifier(null);
  };

  const handleDragEnd = () => {
    setDraggedIdentifier(null);
    setDragOverIdentifier(null);
  };

  // Remove identifier selections that are no longer in the global selectedIdentifiers list
  useEffect(() => {
    const cleanedScopes = data.scopes.map(scope => {
      const cleanedIdentifiers: Record<string, string | string[]> = {};
      Object.entries(scope.identifiers).forEach(([k, v]) => {
        if (data.selectedIdentifiers.includes(k)) {
          cleanedIdentifiers[k] = v as string | string[];
        }
      });
      return { ...scope, identifiers: cleanedIdentifiers };
    });
    onDataChange({ scopes: cleanedScopes });
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [data.selectedIdentifiers]);

  // =============================
  // SAVE HANDLER
  // =============================
  const handleSave = async () => {
    if (!data.dataSource) {
      console.warn('No dataSource selected');
      return;
    }

    setSaving(true);
    try {
      // Generate a scope_id (simple timestamp for now)
      const scopeId = `${Date.now()}`;

      // Build request body dynamically based on number of scopes (max 5)
      const requestBody: any = {
        file_key: data.dataSource,
        description: 'Scope generated from Scope Selector',
      };

      const scopeEntries = data.scopes.slice(0, 5).map((scope, idx) => {
        const setNum = idx + 1;
        const identifierFilters: Record<string, string[]> = {};
        Object.entries(scope.identifiers).forEach(([key, value]) => {
          if (Array.isArray(value) ? value.length : value) {
            identifierFilters[key] = Array.isArray(value) ? value : [value as string];
          }
        });
        return { scope, setNum, identifierFilters };
      });

      const validScopes = scopeEntries.filter(
        (entry) => Object.keys(entry.identifierFilters).length > 0
      );

      if (validScopes.length === 0) {
        toast({ title: 'No identifier filters selected', variant: 'destructive' });
        setSaving(false);
        return;
      }

      validScopes.forEach(({ scope, setNum, identifierFilters }) => {
        requestBody[`identifier_filters_${setNum}`] = identifierFilters;
        if (scope.timeframe.from && scope.timeframe.to) {
          requestBody[`start_date_${setNum}`] = scope.timeframe.from;
          requestBody[`end_date_${setNum}`] = scope.timeframe.to;
        }
      });

      // Add criteria to the request body
      if (data.criteria) {
        requestBody.criteria = {
          min_datapoints_enabled: data.criteria.minDatapointsEnabled,
          min_datapoints: data.criteria.minDatapoints,
          pct90_enabled: data.criteria.pct90Enabled,
          pct_percentile: data.criteria.pctPercentile,
          pct_threshold: data.criteria.pctThreshold,
          pct_base: data.criteria.pctBase,
          pct_column: data.criteria.pctColumn
        };
      }

      const response = await fetch(`${SCOPE_SELECTOR_API}/scopes/${scopeId}/create-multi-filtered-scope`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(requestBody),
      });

      if (!response.ok) {
        const errText = await response.text();
        throw new Error(`Save failed: ${response.status} ${errText}`);
      }

      const result = await response.json();
      console.log('Save successful:', result);
      // Generate preview rows per combination
      const previewRowsAccum: PreviewRow[] = [];
      const comboPromises: Promise<void>[] = [];

      const cartesian = (arrays: string[][]): string[][] => {
        return arrays.reduce<string[][]>((acc, curr) => {
          const res: string[][] = [];
          acc.forEach(a => {
            curr.forEach(c => res.push([...a, c]));
          });
          return res;
        }, [[]]);
      };

      for (const { scope } of validScopes) {
        // Use selectedIdentifiers to maintain the correct order from canvas
        const keys = data.selectedIdentifiers.filter(key => scope.identifiers[key]);
        const valueArrays: string[][] = keys.map(k => {
          const v = scope.identifiers[k];
          return Array.isArray(v) ? v : v ? [v] : [];
        });
        if (valueArrays.some(arr => arr.length === 0)) continue; // skip incomplete
        const combos = cartesian(valueArrays);

        combos.forEach(valuesArr => {
          const comboFilters: Record<string, string[]> = {};
          valuesArr.forEach((val, idx) => {
            comboFilters[keys[idx]] = [val];
          });

          comboPromises.push(
            (async () => {
              try {
                const rowRes = await fetch(`${SCOPE_SELECTOR_API}/row_count`, {
                  method: 'POST',
                  headers: { 'Content-Type': 'application/json' },
                  body: JSON.stringify({
                    file_key: data.dataSource,
                    identifier_filters: comboFilters,
                    start_date: scope.timeframe.from || null,
                    end_date: scope.timeframe.to || null
                  })
                });
                const rowJson = rowRes.ok ? await rowRes.json() : { record_count: 0 };

                let pctPass: boolean | undefined = undefined;
                if (data.criteria?.pct90Enabled) {
                  const query = new URLSearchParams({
                    percentile: String(data.criteria?.pctPercentile ?? 90),
                    threshold_pct: String(data.criteria?.pctThreshold ?? 0),
                    base: data.criteria?.pctBase ?? 'max',
                    column: data.criteria?.pctColumn ?? ''
                  }).toString();

                  const pctRes = await fetch(`${SCOPE_SELECTOR_API}/percentile_check?${query}`, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({
                      file_key: data.dataSource,
                      identifier_filters: comboFilters,
                      start_date: scope.timeframe.from || null,
                      end_date: scope.timeframe.to || null
                    })
                  });
                  const pctJson = pctRes.ok ? await pctRes.json() : { pass: false };
                  pctPass = pctJson.pass;
                }

                previewRowsAccum.push({
                  scopeId: scope.id,
                  values: Object.fromEntries(valuesArr.map((v, i) => [keys[i], v])),
                  count: rowJson.record_count ?? 0,
                  pctPass
                });
              } catch (err) {
                console.error('Preview generation error', err);
                previewRowsAccum.push({
                  scopeId: scope.id,
                  values: Object.fromEntries(valuesArr.map((v, i) => [keys[i], v])),
                  count: 0,
                  pctPass: false
                });
              }
            })()
          );
        });
      }

      await Promise.all(comboPromises);
      setPreviewRows(previewRowsAccum);
      
      // Save preview data to global store
      if (atomId) {
        updateAtomSettings(atomId, {
          previewRows: previewRowsAccum
        });
      }
      
      toast({ title: 'Success', description: 'Scope saved successfully.' });
      // Notify other components (e.g., SavedDataFramesPanel) to refresh list
      window.dispatchEvent(new CustomEvent('savedDataFrame'));
    } catch (error) {
      console.error('Error saving scope:', error);
      const message = (error instanceof Error ? error.message : 'Failed to save scope');
      toast({ title: 'Error', description: message, variant: 'destructive' });
    } finally {
      setSaving(false);
    }
  };

  // Helper function to compare arrays
  const arraysEqual = (a: any[] = [], b: any[] = []) => {
    if (a === b) return true;
    if (a == null || b == null) return false;
    if (a.length !== b.length) return false;
    return a.every((val, index) => val === b[index]);
  };

  // Fetch min/max date whenever the data source changes
  useEffect(() => {
    if (!data.dataSource) {
      setDateRange({ min: null, max: null, available: false });
      return;
    }

    const controller = new AbortController();
    const fetchRange = async () => {
      try {
        const url = `${SCOPE_SELECTOR_API}/date_range?object_name=${encodeURIComponent(data.dataSource)}&column_name=date`;
        const res = await fetch(url, { signal: controller.signal });
        if (!res.ok) {
          throw new Error(`Status ${res.status}`);
        }
        const json = await res.json();
        const fetchedRange = { min: json.min_date, max: json.max_date, available: true };
        setDateRange(fetchedRange);
        if (data.scopes?.length) {
          const updatedScopes = data.scopes.map(scope => ({
            ...scope,
            timeframe: {
              from:
                fetchedRange.min ??
                scope.timeframe?.from ??
                new Date().toISOString().split('T')[0],
              to:
                fetchedRange.max ??
                scope.timeframe?.to ??
                new Date(
                  new Date().setFullYear(new Date().getFullYear() + 1)
                )
                  .toISOString()
                  .split('T')[0]
            }
          }));
          onDataChange({ scopes: updatedScopes });
        }
      } catch (err) {
        console.warn('Date range unavailable:', err);
        setDateRange({ min: null, max: null, available: false });
      }
    };
    fetchRange();
    return () => controller.abort();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [data.dataSource]);

  // Fetch cardinality data when data source changes
  useEffect(() => {
    if (data.dataSource) {
      fetchCardinalityData();
    }
  }, [data.dataSource]);

  // Combined effect to handle data source and identifier changes
  useEffect(() => {
    console.log('Data source or selected identifiers changed:', {
      dataSource: data.dataSource,
      selectedIdentifiers: data.selectedIdentifiers
    });
    
    let isMounted = true;
    const abortController = new AbortController();
    
    const handleIdentifierChanges = async () => {
      // Reset state first
      setUniqueValues({});
      setLoadingValues({});
      setFilteredValues({});
      setFilteredLoading({});
      
      // Skip if no data source or no selected identifiers
      if (!data.dataSource || !data.selectedIdentifiers || !Array.isArray(data.selectedIdentifiers)) {
        console.log('Missing required data, skipping fetch:', {
          hasDataSource: !!data.dataSource,
          hasSelectedIdentifiers: !!data.selectedIdentifiers,
          isArray: Array.isArray(data.selectedIdentifiers)
        });
        return;
      }
      
      // Skip if no identifiers to fetch
      if (data.selectedIdentifiers.length === 0) {
        console.log('No identifiers selected, skipping fetch');
        return;
      }
      
      console.log('\n=== Starting to fetch unique values ===');
      console.log('Data source:', data.dataSource);
      console.log('Selected identifiers:', data.selectedIdentifiers);
      
      // Set loading state for all selected identifiers
      const newLoadingValues: Record<string, boolean> = {};
      data.selectedIdentifiers.forEach(id => {
        newLoadingValues[id] = true;
      });
      setLoadingValues(newLoadingValues);
      
      try {
        // Fetch all unique values in parallel
        const fetchPromises = data.selectedIdentifiers.map(async (identifier) => {
          try {
            console.log(`\n=== Fetching unique values for ${identifier} ===`);
            console.log(`URL: ${SCOPE_SELECTOR_API}/unique_values?object_name=${encodeURIComponent(data.dataSource || '')}&column_name=${encodeURIComponent(identifier)}`);
            
            const response = await fetch(
              `${SCOPE_SELECTOR_API}/unique_values?object_name=${encodeURIComponent(data.dataSource || '')}&column_name=${encodeURIComponent(identifier)}`,
              { 
                signal: abortController.signal,
                headers: {
                  'Content-Type': 'application/json',
                }
              }
            );
            
            console.log(`Response status for ${identifier}:`, response.status);
            
            if (response.ok) {
              const result = await response.json();
              console.log(`API Response for ${identifier}:`, result);
              
              if (result.unique_values && isMounted) {
                console.log(`✅ Successfully received ${result.unique_values.length} unique values for ${identifier}`);
                
                // Update the unique values in state
                setUniqueValues(prev => ({
                  ...prev,
                  [identifier]: result.unique_values
                }));
                
                return { identifier, success: true };
              } else {
                console.warn(`⚠️ No unique_values in response for ${identifier}:`, result);
                return { identifier, success: false, error: 'No unique_values in response' };
              }
            } else {
              console.error(`❌ Error fetching unique values for ${identifier}:`, response.statusText);
              return { identifier, success: false, error: response.statusText };
            }
          } catch (error) {
            console.error(`❌ Error fetching unique values for ${identifier}:`, error);
            return { identifier, success: false, error: error.message };
          } finally {
            // Update loading state when done
            if (isMounted) {
              setLoadingValues(prev => ({
                ...prev,
                [identifier]: false
              }));
            }
          }
        });
        
        // Wait for all fetches to complete
        const results = await Promise.all(fetchPromises);
        console.log('All fetches completed:', results);
        
      } catch (error) {
        console.error('Error in fetchUniqueValues:', error);
      }
    };
    
    // Execute the combined logic
    handleIdentifierChanges();
    
    // Cleanup function
    return () => {
      isMounted = false;
      abortController.abort();
    };
  }, [data.dataSource, data.selectedIdentifiers ? JSON.stringify([...data.selectedIdentifiers].sort()) : null]);

  // Auto-select default value if only one unique option is available for an identifier
  useEffect(() => {
    if (!data?.scopes?.length) return;

    let hasUpdates = false;
    const updatedScopes = data.scopes.map(scope => {
      const updatedIdentifiers = { ...scope.identifiers };

      data.selectedIdentifiers.forEach(identifier => {
        const values = uniqueValues[identifier];
        if (values && values.length === 1 && (updatedIdentifiers[identifier] === '' || updatedIdentifiers[identifier] === undefined)) {
          updatedIdentifiers[identifier] = values[0];
          hasUpdates = true;
        }
      });

      return hasUpdates ? { ...scope, identifiers: updatedIdentifiers } : scope;
    });

    if (hasUpdates) {
      onDataChange({ scopes: updatedScopes });
    }
  }, [uniqueValues, data.scopes, data.selectedIdentifiers]);

  const addScope = () => {
    // Initialize identifiers with empty strings for all selected identifiers
    const initialIdentifiers = Object.fromEntries(
      data.selectedIdentifiers.map(id => [id, ''])
    );

    const newScope: ScopeData = {
      id: Date.now().toString(),
      name: `Scope ${data.scopes.length + 1}`,
      identifiers: initialIdentifiers,
      timeframe: {
        from: dateRange.available
          ? (dateRange.min ?? new Date().toISOString().split('T')[0])
          : new Date().toISOString().split('T')[0],
        to: dateRange.available
          ? (dateRange.max ?? new Date(new Date().setFullYear(new Date().getFullYear() + 1)).toISOString().split('T')[0])
          : new Date(new Date().setFullYear(new Date().getFullYear() + 1)).toISOString().split('T')[0]
      }
    };
    
    onDataChange({
      scopes: [...data.scopes, newScope]
    });

    // Trigger fetching of unique values for the selected identifiers
    if (data.dataSource && data.selectedIdentifiers.length > 0) {
      const fetchPromises = data.selectedIdentifiers.map(async (identifier) => {
        if (!uniqueValues[identifier] && !loadingValues[identifier]) {
          setLoadingValues(prev => ({ ...prev, [identifier]: true }));
          
          try {
            const response = await fetch(
              `${SCOPE_SELECTOR_API}/unique_values?object_name=${encodeURIComponent(data.dataSource || '')}&column_name=${encodeURIComponent(identifier)}`
            );
            
            if (response.ok) {
              const result = await response.json();
              if (result.unique_values) {
                setUniqueValues(prev => ({
                  ...prev,
                  [identifier]: result.unique_values
                }));
              }
            }
          } catch (error) {
            console.error(`Error fetching unique values for ${identifier}:`, error);
          } finally {
            setLoadingValues(prev => ({ ...prev, [identifier]: false }));
          }
        }
      });

      Promise.all(fetchPromises);
    }
  };

  const updateScope = (scopeId: string, updates: Partial<ScopeData>) => {
    const updatedScopes = data.scopes.map(scope =>
      scope.id === scopeId ? { ...scope, ...updates } : scope
    );
    onDataChange({ scopes: updatedScopes });
  };

  const updateScopeIdentifier = (scopeId: string, identifierKey: string, value: string | string[]) => {
    const scope = data.scopes.find(s => s.id === scopeId);
    if (scope) {
      const updatedIdentifiers = { ...scope.identifiers };
      const isEmpty = Array.isArray(value) ? value.length === 0 : !value;
      if (isEmpty) {
        delete updatedIdentifiers[identifierKey];
      } else {
        updatedIdentifiers[identifierKey] = value;
      }
      updateScope(scopeId, { identifiers: updatedIdentifiers });

    // Cascade: update options for the other identifiers *within this scope* based on this selection
    if (data.dataSource) {
      data.selectedIdentifiers.forEach(async (otherId) => {
        if (otherId === identifierKey) return; // skip the one we just set

        // mark loading for this scope/identifier
        setFilteredLoading(prev => ({
          ...prev,
          [scopeId]: { ...(prev[scopeId] || {}), [otherId]: true }
        }));

        try {
          const url = `${SCOPE_SELECTOR_API}/unique_values_filtered?object_name=${encodeURIComponent(
            data.dataSource
          )}&target_column=${encodeURIComponent(otherId)}&filter_column=${encodeURIComponent(
            identifierKey
          )}&filter_value=${encodeURIComponent(Array.isArray(value) ? value[0] : value)}`;
          const res = await fetch(url);
          if (res.ok) {
            const json = await res.json();
            if (json.unique_values) {
              setFilteredValues(prev => ({
                ...prev,
                [scopeId]: { ...(prev[scopeId] || {}), [otherId]: json.unique_values }
              }));
            }
          } else {
            console.warn('Filtered unique values failed', res.status);
          }
        } catch (err) {
          console.error('Error fetching filtered unique values', err);
        } finally {
          setFilteredLoading(prev => ({
            ...prev,
            [scopeId]: { ...(prev[scopeId] || {}), [otherId]: false }
          }));
        }
      });
    }
    }
  };

  const updateTimeframe = (scopeId: string, field: 'from' | 'to', value: string) => {
    const scope = data.scopes.find(s => s.id === scopeId);
    if (scope) {
      const updatedTimeframe = { ...scope.timeframe, [field]: value };
      updateScope(scopeId, { timeframe: updatedTimeframe });
    }
  };

  

  const removeScope = (scopeId: string) => {
    const updatedScopes = data.scopes.filter(scope => scope.id !== scopeId);
    
    // Renumber remaining scopes
    const renumberedScopes = updatedScopes.map((scope, index) => ({
      ...scope,
      name: `Scope ${index + 1}`
    }));
    
    onDataChange({
      scopes: renumberedScopes
    });
  };

  const getIdentifierOptions = (scopeId: string, identifier: string, currentValue: string) => {
    // Only return values for identifiers that are currently selected
    if (!data.selectedIdentifiers.includes(identifier)) {
      return [];
    }
    
    // Prefer scope-specific filtered values first
    if (filteredLoading[scopeId]?.[identifier]) {
      return [];
    }
    const scoped = filteredValues[scopeId]?.[identifier];
    if (scoped && scoped.length > 0) {
      return scoped;
    }

    // fall back to globally fetched (unfiltered) values
    if (loadingValues[identifier]) {
      return currentValue ? [currentValue] : [];
    }
    if (uniqueValues[identifier]?.length > 0) {
      return uniqueValues[identifier];
    }

    // If we have a current value but no other options, return it
    if (currentValue && currentValue !== '') {
      return [currentValue];
    }
    
    return [];
  };

  // Cardinality functions
  const fetchCardinalityData = async () => {
    if (!data.dataSource) return;
    
    setCardinalityLoading(true);
    setCardinalityError(null);
    
    try {
      const formData = new FormData();
      formData.append('validator_atom_id', '');
      formData.append('file_key', data.dataSource);
      formData.append('bucket_name', 'trinity');
      formData.append('object_names', data.dataSource);
      
      const res = await fetch(`${GROUPBY_API}/cardinality`, { method: 'POST', body: formData });
      const data_result = await res.json();
      
      if (data_result.status === 'SUCCESS' && data_result.cardinality) {
        setCardinalityData(data_result.cardinality);
      } else {
        setCardinalityError(data_result.error || 'Failed to fetch cardinality data');
      }
    } catch (e: any) {
      setCardinalityError(e.message || 'Error fetching cardinality data');
    } finally {
      setCardinalityLoading(false);
    }
  };

  const displayedCardinality = useMemo(() => {
    let filtered = cardinalityData.filter(c => c.unique_count > 0);
    
    // Apply column filters
    Object.entries(columnFilters).forEach(([column, filterValues]) => {
      if (Array.isArray(filterValues) && filterValues.length > 0) {
        filtered = filtered.filter(row => {
          const cellValue = String(row[column] || '');
          return filterValues.includes(cellValue);
        });
      }
    });
    
    // Apply sorting
    if (sortColumn) {
      filtered = [...filtered].sort((a, b) => {
        const aVal = a[sortColumn];
        const bVal = b[sortColumn];
        if (aVal === bVal) return 0;
        let comparison = 0;
        if (typeof aVal === 'number' && typeof bVal === 'number') {
          comparison = aVal - bVal;
        } else {
          comparison = String(aVal).localeCompare(String(bVal));
        }
        return sortDirection === 'desc' ? -comparison : comparison;
      });
    }
    
    return filtered;
  }, [cardinalityData, columnFilters, sortColumn, sortDirection]);

  const getUniqueColumnValues = (column: string): string[] => {
    if (!cardinalityData.length) return [];
    
    // Apply other active filters to get hierarchical filtering
    const otherFilters = Object.entries(columnFilters).filter(([key]) => key !== column);
    let dataToUse = cardinalityData;
    
    if (otherFilters.length > 0) {
      dataToUse = cardinalityData.filter(item => {
        return otherFilters.every(([filterColumn, filterValues]) => {
          if (!Array.isArray(filterValues) || filterValues.length === 0) return true;
          const cellValue = String(item[filterColumn] || '');
          return filterValues.includes(cellValue);
        });
      });
    }
    
    const values = dataToUse.map(item => String(item[column] || ''));
    const uniqueValues = Array.from(new Set(values));
    return uniqueValues.sort();
  };

  const handleSort = (column: string, direction?: 'asc' | 'desc') => {
    if (sortColumn === column) {
      if (sortDirection === 'asc') {
        setSortDirection('desc');
      } else if (sortDirection === 'desc') {
        setSortColumn('');
        setSortDirection('asc');
      }
    } else {
      setSortColumn(column);
      setSortDirection(direction || 'asc');
    }
  };

  const handleColumnFilter = (column: string, values: string[]) => {
    setColumnFilters(prev => ({
      ...prev,
      [column]: values
    }));
  };

  const clearColumnFilter = (column: string) => {
    setColumnFilters(prev => {
      const cpy = { ...prev };
      delete cpy[column];
      return cpy;
    });
  };

  const FilterMenu = ({ column }: { column: string }) => {
    const uniqueValues = getUniqueColumnValues(column);
    const current = columnFilters[column] || [];
    const [temp, setTemp] = useState<string[]>(current);

    const toggleVal = (val: string) => {
      setTemp(prev => (prev.includes(val) ? prev.filter(v => v !== val) : [...prev, val]));
    };

    const selectAll = () => {
      setTemp(temp.length === uniqueValues.length ? [] : uniqueValues);
    };

    const apply = () => handleColumnFilter(column, temp);

    return (
      <div className="w-64 max-h-80 overflow-y-auto">
        <div className="p-2 border-b">
          <div className="flex items-center space-x-2 mb-2">
            <Checkbox checked={temp.length === uniqueValues.length} onCheckedChange={selectAll} />
            <span className="text-sm font-medium">Select All</span>
          </div>
        </div>
        <div className="p-2 space-y-1">
          {uniqueValues.map((v, i) => (
            <div key={i} className="flex items-center space-x-2">
              <Checkbox checked={temp.includes(v)} onCheckedChange={() => toggleVal(v)} />
              <span className="text-sm">{v}</span>
            </div>
          ))}
        </div>
        <div className="p-2 border-t flex space-x-2">
          <Button size="sm" onClick={apply}>Apply</Button>
          <Button size="sm" variant="outline" onClick={() => setTemp(current)}>
            Cancel
          </Button>
        </div>
      </div>
    );
  };

  // Preview sorting and filtering functions
  const displayedPreviewRows = useMemo(() => {
    let filtered = [...previewRows];
    
    // Apply column filters
    Object.entries(previewColumnFilters).forEach(([column, filterValues]) => {
      if (Array.isArray(filterValues) && filterValues.length > 0) {
        filtered = filtered.filter(row => {
          let cellValue = '';
          if (column === 'Scope') {
            cellValue = `Scope ${data.scopes.findIndex(s => s.id === row.scopeId) + 1}`;
          } else if (column === 'Row Count') {
            cellValue = String(row.count);
          } else if (data.selectedIdentifiers.includes(column)) {
            cellValue = String(row.values[column] || '—');
          } else if (column === 'Min Pts' && data.criteria?.minDatapointsEnabled) {
            cellValue = row.count >= (data.criteria?.minDatapoints || 0) ? 'Pass' : 'Fail';
          } else if (column === 'Pct Check' && data.criteria?.pct90Enabled) {
            cellValue = row.pctPass ? 'Pass' : 'Fail';
          }
          return filterValues.includes(cellValue);
        });
      }
    });
    
    // Apply sorting
    if (previewSortColumn) {
      filtered = [...filtered].sort((a, b) => {
        let aVal: any = '';
        let bVal: any = '';
        
        if (previewSortColumn === 'Scope') {
          aVal = data.scopes.findIndex(s => s.id === a.scopeId);
          bVal = data.scopes.findIndex(s => s.id === b.scopeId);
        } else if (previewSortColumn === 'Row Count') {
          aVal = a.count;
          bVal = b.count;
        } else if (data.selectedIdentifiers.includes(previewSortColumn)) {
          aVal = a.values[previewSortColumn] || '—';
          bVal = b.values[previewSortColumn] || '—';
        } else if (previewSortColumn === 'Min Pts' && data.criteria?.minDatapointsEnabled) {
          aVal = a.count >= (data.criteria?.minDatapoints || 0) ? 'Pass' : 'Fail';
          bVal = b.count >= (data.criteria?.minDatapoints || 0) ? 'Pass' : 'Fail';
        } else if (previewSortColumn === 'Pct Check' && data.criteria?.pct90Enabled) {
          aVal = a.pctPass ? 'Pass' : 'Fail';
          bVal = b.pctPass ? 'Pass' : 'Fail';
        }
        
        if (aVal === bVal) return 0;
        let comparison = 0;
        if (typeof aVal === 'number' && typeof bVal === 'number') {
          comparison = aVal - bVal;
        } else {
          comparison = String(aVal).localeCompare(String(bVal));
        }
        return previewSortDirection === 'desc' ? -comparison : comparison;
      });
    }
    
    return filtered;
  }, [previewRows, previewColumnFilters, previewSortColumn, previewSortDirection, data.scopes, data.selectedIdentifiers, data.criteria]);

  const getPreviewUniqueColumnValues = (column: string): string[] => {
    if (!previewRows.length) return [];
    
    // Apply other active filters to get hierarchical filtering
    const otherFilters = Object.entries(previewColumnFilters).filter(([key]) => key !== column);
    let dataToUse = previewRows;
    
    if (otherFilters.length > 0) {
      dataToUse = previewRows.filter(row => {
        return otherFilters.every(([filterColumn, filterValues]) => {
          if (!Array.isArray(filterValues) || filterValues.length === 0) return true;
          let cellValue = '';
          if (filterColumn === 'Scope') {
            cellValue = `Scope ${data.scopes.findIndex(s => s.id === row.scopeId) + 1}`;
          } else if (filterColumn === 'Row Count') {
            cellValue = String(row.count);
          } else if (data.selectedIdentifiers.includes(filterColumn)) {
            cellValue = String(row.values[filterColumn] || '—');
          } else if (filterColumn === 'Min Pts' && data.criteria?.minDatapointsEnabled) {
            cellValue = row.count >= (data.criteria?.minDatapoints || 0) ? 'Pass' : 'Fail';
          } else if (filterColumn === 'Pct Check' && data.criteria?.pct90Enabled) {
            cellValue = row.pctPass ? 'Pass' : 'Fail';
          }
          return filterValues.includes(cellValue);
        });
      });
    }
    
    const values: string[] = [];
    dataToUse.forEach(row => {
      let cellValue = '';
      if (column === 'Scope') {
        cellValue = `Scope ${data.scopes.findIndex(s => s.id === row.scopeId) + 1}`;
      } else if (column === 'Row Count') {
        cellValue = String(row.count);
      } else if (data.selectedIdentifiers.includes(column)) {
        cellValue = String(row.values[column] || '—');
      } else if (column === 'Min Pts' && data.criteria?.minDatapointsEnabled) {
        cellValue = row.count >= (data.criteria?.minDatapoints || 0) ? 'Pass' : 'Fail';
      } else if (column === 'Pct Check' && data.criteria?.pct90Enabled) {
        cellValue = row.pctPass ? 'Pass' : 'Fail';
      }
      if (cellValue && !values.includes(cellValue)) {
        values.push(cellValue);
      }
    });
    
    return values.sort();
  };

  const handlePreviewSort = (column: string, direction?: 'asc' | 'desc') => {
    if (previewSortColumn === column) {
      if (previewSortDirection === 'asc') {
        setPreviewSortDirection('desc');
      } else if (previewSortDirection === 'desc') {
        setPreviewSortColumn('');
        setPreviewSortDirection('asc');
      }
    } else {
      setPreviewSortColumn(column);
      setPreviewSortDirection(direction || 'asc');
    }
  };

  const handlePreviewColumnFilter = (column: string, values: string[]) => {
    setPreviewColumnFilters(prev => ({
      ...prev,
      [column]: values
    }));
  };

  const clearPreviewColumnFilter = (column: string) => {
    setPreviewColumnFilters(prev => {
      const cpy = { ...prev };
      delete cpy[column];
      return cpy;
    });
  };

  const PreviewFilterMenu = ({ column }: { column: string }) => {
    const uniqueValues = getPreviewUniqueColumnValues(column);
    const current = previewColumnFilters[column] || [];
    const [temp, setTemp] = useState<string[]>(current);

    const toggleVal = (val: string) => {
      setTemp(prev => (prev.includes(val) ? prev.filter(v => v !== val) : [...prev, val]));
    };

    const selectAll = () => {
      setTemp(temp.length === uniqueValues.length ? [] : uniqueValues);
    };

    const apply = () => handlePreviewColumnFilter(column, temp);

    return (
      <div className="w-64 max-h-80 overflow-y-auto">
        <div className="p-2 border-b">
          <div className="flex items-center space-x-2 mb-2">
            <Checkbox checked={temp.length === uniqueValues.length} onCheckedChange={selectAll} />
            <span className="text-sm font-medium">Select All</span>
          </div>
        </div>
        <div className="p-2 space-y-1">
          {uniqueValues.map((v, i) => (
            <div key={i} className="flex items-center space-x-2">
              <Checkbox checked={temp.includes(v)} onCheckedChange={() => toggleVal(v)} />
              <span className="text-sm">{v}</span>
            </div>
          ))}
        </div>
        <div className="p-2 border-t flex space-x-2">
          <Button size="sm" onClick={apply}>Apply</Button>
          <Button size="sm" variant="outline" onClick={() => setTemp(current)}>
            Cancel
          </Button>
        </div>
      </div>
    );
  };

  // Check if we have the required data - add debug logging
  const hasRequiredData = Boolean(data.dataSource && data.selectedIdentifiers?.length > 0);
  console.log('hasRequiredData check:', {
    hasRequiredData,
    dataSource: data.dataSource,
    selectedIdentifiers: data.selectedIdentifiers,
    selectedIdentifiersLength: data.selectedIdentifiers?.length
  });
  
  // Show a message if we don't have the required data
  const renderNoDataSourceMessage = () => (
    <div className="mb-6 p-4 bg-yellow-50 border-l-4 border-yellow-400 rounded-r">
      <div className="flex">
        <div className="flex-shrink-0">
          <Target className="h-5 w-5 text-yellow-400" />
        </div>
        <div className="ml-3">
          <p className="text-sm text-yellow-700">
            Please select a data source and identifiers in the Input Files and Settings tabs
          </p>
        </div>
      </div>
    </div>
  );

  // If no scopes exist, show a message to add one
  if (data.scopes.length === 0) {
    return (
      <div className="w-full h-full bg-gradient-to-br from-blue-50 via-white to-indigo-50 rounded-lg border border-blue-200 overflow-auto p-6">
        <div className="flex items-center justify-between mb-6">
          <div className="flex items-center space-x-3">
            <div className="w-10 h-10 bg-gradient-to-br from-blue-500 to-indigo-600 rounded-xl flex items-center justify-center shadow-lg">
              <Settings className="w-5 h-5 text-white" />
            </div>
            <div>
              <h3 className="font-bold text-gray-900 text-lg">Manage Scopes</h3>
              <p className="text-sm text-gray-600">Define data scopes with identifier selections</p>
            </div>
          </div>
          <Button 
            onClick={addScope}
            disabled={!hasRequiredData}
            className={`bg-gradient-to-r from-blue-500 to-indigo-600 text-white shadow-lg hover:shadow-xl transition-all duration-200 ${
              !hasRequiredData ? 'opacity-50 cursor-not-allowed' : 'hover:from-blue-600 hover:to-indigo-700'
            }`}
          >
            <Plus className="w-4 h-4 mr-2" />
            Add Scope
          </Button>
        </div>

        {!hasRequiredData && renderNoDataSourceMessage()}

        <div className="w-full flex-1 flex flex-col items-center justify-center p-8 text-center">
          <p className="text-gray-500 text-lg">
            Please Configure scope-selector options.
          </p>
        </div>


      </div>
    );
  }

  return (
    <div className="w-full h-full bg-gradient-to-br from-blue-50 via-white to-indigo-50 rounded-lg border border-blue-200 overflow-auto">
      {!hasRequiredData && (
        <div className="m-4 flex items-center text-sm text-yellow-700 bg-yellow-50 px-3 py-1.5 rounded-md">
          <Target className="w-4 h-4 mr-1.5 text-yellow-500" />
          Select a data source and identifiers first
        </div>
      )}

      <div className="p-4 space-y-6">
        {/* Cardinality View */}
        {data.dataSource && (
          <div className="space-y-4">
            {cardinalityLoading && (
              <div className="flex items-center justify-center p-8">
                <div className="text-center">
                  <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-green-500 mx-auto mb-2"></div>
                  <span className="text-green-600">Loading cardinality data...</span>
                </div>
              </div>
            )}
            
            {cardinalityError && (
              <div className="p-4 bg-red-50 border border-red-200 rounded-md">
                <p className="text-red-600 text-sm">Error loading cardinality data: {cardinalityError}</p>
              </div>
            )}
            
            {!cardinalityLoading && !cardinalityError && displayedCardinality.length > 0 && (
              <Table
                headers={[
                  <ContextMenu key="Column">
                    <ContextMenuTrigger asChild>
                      <div className="flex items-center gap-1 cursor-pointer">
                        Column
                        {sortColumn === 'column' && (
                          sortDirection === 'asc' ? <ArrowUp className="w-3 h-3" /> : <ArrowDown className="w-3 h-3" />
                        )}
                      </div>
                    </ContextMenuTrigger>
                    <ContextMenuContent className="w-48 bg-white border border-gray-200 shadow-lg rounded-md">
                      <ContextMenuSub>
                        <ContextMenuSubTrigger className="flex items-center">
                          <ArrowUp className="w-4 h-4 mr-2" /> Sort
                        </ContextMenuSubTrigger>
                        <ContextMenuSubContent className="bg-white border border-gray-200 shadow-lg rounded-md">
                          <ContextMenuItem onClick={() => handleSort('column', 'asc')}>
                            <ArrowUp className="w-4 h-4 mr-2" /> Ascending
                          </ContextMenuItem>
                          <ContextMenuItem onClick={() => handleSort('column', 'desc')}>
                            <ArrowDown className="w-4 h-4 mr-2" /> Descending
                          </ContextMenuItem>
                        </ContextMenuSubContent>
                      </ContextMenuSub>
                      <ContextMenuSeparator />
                      <ContextMenuSub>
                        <ContextMenuSubTrigger className="flex items-center">
                          <FilterIcon className="w-4 h-4 mr-2" /> Filter
                        </ContextMenuSubTrigger>
                        <ContextMenuSubContent className="bg-white border border-gray-200 shadow-lg rounded-md p-0">
                          <FilterMenu column="column" />
                        </ContextMenuSubContent>
                      </ContextMenuSub>
                      {columnFilters['column']?.length > 0 && (
                        <>
                          <ContextMenuSeparator />
                          <ContextMenuItem onClick={() => clearColumnFilter('column')}>
                            Clear Filter
                          </ContextMenuItem>
                        </>
                      )}
                    </ContextMenuContent>
                  </ContextMenu>,
                  <ContextMenu key="Data type">
                    <ContextMenuTrigger asChild>
                      <div className="flex items-center gap-1 cursor-pointer">
                        Data type
                        {sortColumn === 'data_type' && (
                          sortDirection === 'asc' ? <ArrowUp className="w-3 h-3" /> : <ArrowDown className="w-3 h-3" />
                        )}
                      </div>
                    </ContextMenuTrigger>
                    <ContextMenuContent className="w-48 bg-white border border-gray-200 shadow-lg rounded-md">
                      <ContextMenuSub>
                        <ContextMenuSubTrigger className="flex items-center">
                          <ArrowUp className="w-4 h-4 mr-2" /> Sort
                        </ContextMenuSubTrigger>
                        <ContextMenuSubContent className="bg-white border border-gray-200 shadow-lg rounded-md">
                          <ContextMenuItem onClick={() => handleSort('data_type', 'asc')}>
                            <ArrowUp className="w-4 h-4 mr-2" /> Ascending
                          </ContextMenuItem>
                          <ContextMenuItem onClick={() => handleSort('data_type', 'desc')}>
                            <ArrowDown className="w-4 h-4 mr-2" /> Descending
                          </ContextMenuItem>
                        </ContextMenuSubContent>
                      </ContextMenuSub>
                      <ContextMenuSeparator />
                      <ContextMenuSub>
                        <ContextMenuSubTrigger className="flex items-center">
                          <FilterIcon className="w-4 h-4 mr-2" /> Filter
                        </ContextMenuSubTrigger>
                        <ContextMenuSubContent className="bg-white border border-gray-200 shadow-lg rounded-md p-0">
                          <FilterMenu column="data_type" />
                        </ContextMenuSubContent>
                      </ContextMenuSub>
                      {columnFilters['data_type']?.length > 0 && (
                        <>
                          <ContextMenuSeparator />
                          <ContextMenuItem onClick={() => clearColumnFilter('data_type')}>
                            Clear Filter
                          </ContextMenuItem>
                        </>
                      )}
                    </ContextMenuContent>
                  </ContextMenu>,
                  <ContextMenu key="Unique count">
                    <ContextMenuTrigger asChild>
                      <div className="flex items-center gap-1 cursor-pointer">
                        Unique count
                        {sortColumn === 'unique_count' && (
                          sortDirection === 'asc' ? <ArrowUp className="w-3 h-3" /> : <ArrowDown className="w-3 h-3" />
                        )}
                      </div>
                    </ContextMenuTrigger>
                    <ContextMenuContent className="w-48 bg-white border border-gray-200 shadow-lg rounded-md">
                      <ContextMenuSub>
                        <ContextMenuSubTrigger className="flex items-center">
                          <ArrowUp className="w-4 h-4 mr-2" /> Sort
                        </ContextMenuSubTrigger>
                        <ContextMenuSubContent className="bg-white border border-gray-200 shadow-lg rounded-md">
                          <ContextMenuItem onClick={() => handleSort('unique_count', 'asc')}>
                            <ArrowUp className="w-4 h-4 mr-2" /> Ascending
                          </ContextMenuItem>
                          <ContextMenuItem onClick={() => handleSort('unique_count', 'desc')}>
                            <ArrowDown className="w-4 h-4 mr-2" /> Descending
                          </ContextMenuItem>
                        </ContextMenuSubContent>
                      </ContextMenuSub>
                      <ContextMenuSeparator />
                      <ContextMenuSub>
                        <ContextMenuSubTrigger className="flex items-center">
                          <FilterIcon className="w-4 h-4 mr-2" /> Filter
                        </ContextMenuSubTrigger>
                        <ContextMenuSubContent className="bg-white border border-gray-200 shadow-lg rounded-md p-0">
                          <FilterMenu column="unique_count" />
                        </ContextMenuSubContent>
                      </ContextMenuSub>
                      {columnFilters['unique_count']?.length > 0 && (
                        <>
                          <ContextMenuSeparator />
                          <ContextMenuItem onClick={() => clearColumnFilter('unique_count')}>
                            Clear Filter
                          </ContextMenuItem>
                        </>
                      )}
                    </ContextMenuContent>
                  </ContextMenu>,
                  "Sample values"
                ]}
                colClasses={["w-[30%]", "w-[20%]", "w-[15%]", "w-[35%]"]}
                bodyClassName="max-h-[484px] overflow-y-auto"
                defaultMinimized={true}
                borderColor={`border-${scopeSelector.color.replace('bg-', '')}`}
                customHeader={{
                  title: "Cardinality View",
                  subtitle: "Click Here to View Data",
                  subtitleClickable: !!inputFileName && !!atomId,
                  onSubtitleClick: handleViewDataClick
                }}
              >
                {displayedCardinality.map((col, index) => (
                  <tr key={index} className="table-row">
                    <td className="table-cell">{col.column || col.Column || ''}</td>
                    <td className="table-cell">{col.data_type || col['Data type'] || ''}</td>
                    <td className="table-cell">{col.unique_count || col['Unique count'] || 0}</td>
                    <td className="table-cell">
                      {col.unique_values ? (
                        <div className="flex flex-wrap items-center gap-1">
                          {Array.isArray(col.unique_values) ? (
                            <>
                              {col.unique_values.slice(0, 2).map((val: any, i: number) => (
                                <span
                                  key={i}
                                  className="inline-flex items-center px-1.5 py-0.5 rounded text-xs font-medium bg-gray-50 text-slate-700 border border-gray-200"
                                >
                                  {String(val)}
                                </span>
                              ))}
                              {col.unique_values.length > 2 && (
                                <Tooltip>
                                  <TooltipTrigger asChild>
                                    <span className="flex items-center gap-0.5 text-xs text-slate-600 font-medium cursor-pointer">
                                      <Plus className="w-3 h-3" />
                                      {col.unique_values.length - 2}
                                    </span>
                                  </TooltipTrigger>
                                  <TooltipContent className="text-xs max-w-xs whitespace-pre-wrap">
                                    {col.unique_values
                                      .slice(2)
                                      .map(val => String(val))
                                      .join(', ')}
                                  </TooltipContent>
                                </Tooltip>
                              )}
                            </>
                          ) : (
                            <span className="inline-flex items-center px-1.5 py-0.5 rounded text-xs font-medium bg-gray-50 text-slate-700 border border-gray-200">
                              {String(col.unique_values)}
                            </span>
                          )}
                        </div>
                      ) : (
                        <span className="text-gray-500 italic">No samples</span>
                      )}
                    </td>
                  </tr>
                ))}
              </Table>
            )}
          </div>
        )}

        {data.scopes.map((scope, index) => (
          <Card key={scope.id} className="group relative bg-gradient-to-br from-white to-blue-50/50 border-2 border-blue-200/50 shadow-lg hover:shadow-2xl hover:border-blue-300 transition-all duration-300 transform hover:-translate-y-1">

            
            <CardHeader className="pb-4 bg-gradient-to-r from-blue-50 to-indigo-50 rounded-t-lg border-b border-blue-100">
              <CardTitle className="text-lg font-bold text-gray-800 flex items-center justify-between">
              <div className="flex items-center gap-3">
                <div className="w-3 h-3 bg-gradient-to-r from-blue-500 to-indigo-600 rounded-full shadow-md animate-pulse"></div>
                <span className="bg-gradient-to-r from-blue-600 to-indigo-600 bg-clip-text text-transparent">
                  {scope.name}
                </span>
              </div>
              <Button
                onClick={(e) => {
                  e.stopPropagation();
                  removeScope(scope.id);
                }}
                variant="ghost"
                size="sm"
                className="w-6 h-6 p-0 text-gray-500 hover:text-red-500 hover:bg-red-50 rounded-full"
              >
                <X className="w-3.5 h-3.5" />
              </Button>
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-6">
              {/* Identifiers Grid */}
              <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-6 gap-3">
                {data.selectedIdentifiers.map((identifier) => (
                  <div
                    key={identifier}
                    className={`space-y-2 relative ${draggedIdentifier === identifier ? 'opacity-50' : ''} ${dragOverIdentifier === identifier ? 'ring-2 ring-blue-400 ring-opacity-50' : ''}`}
                    onDragStart={(e) => handleDragStart(e, identifier)}
                    onDragOver={(e) => handleDragOver(e, identifier)}
                    onDragLeave={handleDragLeave}
                    onDrop={(e) => handleDrop(e, identifier)}
                    onDragEnd={handleDragEnd}
                    draggable={true}
                  >
                    
                    <div className="relative">
                      <Popover>
                        <PopoverTrigger asChild>
                          <Button
                            variant="outline"
                            className="w-full max-w-[180px] justify-between truncate group"
                            disabled={loadingValues[identifier] || filteredLoading[scope.id]?.[identifier]}
                          >
                            <div className="flex items-center gap-2">
                              <div 
                                className="w-4 h-4 text-gray-400 hover:text-gray-600 cursor-grab active:cursor-grabbing opacity-0 group-hover:opacity-100 transition-opacity"
                                onMouseDown={(e) => {
                                  e.stopPropagation();
                                  e.preventDefault();
                                }}
                              >
                                ⋮⋮
                              </div>
                              <span>
                                {(loadingValues[identifier] || filteredLoading[scope.id]?.[identifier])
                                  ? 'Loading...'
                                  : `${identifier}${scope.identifiers[identifier] ? (Array.isArray(scope.identifiers[identifier]) ? (scope.identifiers[identifier] as string[]).length ? ` (${(scope.identifiers[identifier] as string[]).length})` : '' : ' (1)') : ''}`}
                              </span>
                            </div>
                            <span className="ml-2 text-gray-400">▼</span>
                          </Button>
                        </PopoverTrigger>
                        <PopoverContent className="bg-white border-blue-200 max-h-60 overflow-y-auto w-56 p-2">
                          {(() => {
                              const options = getIdentifierOptions(scope.id, identifier, scope.identifiers[identifier]);
                              const allChecked = scope.identifiers[identifier] && Array.isArray(scope.identifiers[identifier]) && options.length > 0 && (scope.identifiers[identifier] as string[]).length === options.length;
                              
                              if (options.length === 0) {
                                return (
                                  <div className="text-sm text-gray-500 py-2 text-center">
                                    {loadingValues[identifier] || filteredLoading[scope.id]?.[identifier] 
                                      ? 'Loading values...' 
                                      : 'No values available'}
                                  </div>
                                );
                              }
                              
                              return (
                                <>
                                  <div key="select-all" className="flex items-center gap-2 py-1">
                                    <Checkbox
                                      id={`${scope.id}-${identifier}-all`}
                                      checked={allChecked}
                                      onCheckedChange={(isChecked) => {
                                        updateScopeIdentifier(scope.id, identifier, isChecked ? options : []);
                                      }}
                                    />
                                    <label htmlFor={`${scope.id}-${identifier}-all`} className="text-sm text-gray-700">
                                      Select All
                                    </label>
                                  </div>
                                  {options.map((option) => {
                            const checked = scope.identifiers[identifier] ? scope.identifiers[identifier]?.includes(option) : false;
                                                                    return (
                                          <div key={option} className="flex items-center gap-2 py-1">
                                <Checkbox
                                  id={`${scope.id}-${identifier}-${option}`}
                                  checked={checked}
                                  onCheckedChange={(isChecked) => {
                                    const prev = scope.identifiers[identifier] || [];
                                    const newVals = isChecked
                                      ? [...prev, option]
                                      : prev.filter((v: string) => v !== option);
                                    updateScopeIdentifier(scope.id, identifier, newVals);
                                  }}
                                />
                                <label htmlFor={`${scope.id}-${identifier}-${option}`} className="text-sm text-gray-700">
                                  {option}
                                </label>
                              </div>
                            );
                          })}
                                  </>
                                );
                              })()}
                         </PopoverContent>
                      </Popover>
                    </div>
                  </div>
                ))}
              </div>

              {/* Timeframe Section */}
              <div className="bg-gradient-to-r from-blue-50 to-indigo-50 p-2 rounded-lg border border-blue-200">
                <div className="flex items-center justify-between w-full">
                  {/* Left side - Title */}
                  <div className="flex items-center gap-2 bg-white px-3 py-1 rounded-md border border-blue-200 h-9">
                    <Calendar className="w-4 h-4 text-blue-600" />
                    <span className="font-semibold text-gray-800 text-sm">Timeframe</span>
                  </div>
                  
                  {/* Right side - Date inputs */}
                  <div className="flex items-center gap-3">
                    <div className="flex items-center gap-1">
                      <Label className="text-xs font-medium text-gray-700 whitespace-nowrap">From</Label>
                      <div className="relative">
                        <Input
                          type="date"
                          disabled={!dateRange.available}
                          min={dateRange.min ?? undefined}
                          max={dateRange.max ?? undefined}
                          value={scope.timeframe.from}
                          onChange={(e) => updateTimeframe(scope.id, 'from', e.target.value)}
                          className="bg-white border-blue-200 hover:border-blue-300 focus:border-blue-500 w-[140px] h-9 text-sm cursor-pointer appearance-none [&::-webkit-calendar-picker-indicator]:opacity-0"
                        />
                        <div className="absolute right-2 top-1/2 -translate-y-1/2 pointer-events-none">
                          <Calendar className="w-4 h-4 text-gray-400" />
                        </div>
                      </div>
                    </div>
                    <div className="flex items-center gap-1">
                      <Label className="text-xs font-medium text-gray-700 whitespace-nowrap">To</Label>
                      <div className="relative">
                        <Input
                          type="date"
                          disabled={!dateRange.available}
                          min={dateRange.min ?? undefined}
                          max={dateRange.max ?? undefined}
                          value={scope.timeframe.to}
                          onChange={(e) => updateTimeframe(scope.id, 'to', e.target.value)}
                          className="bg-white border-blue-200 hover:border-blue-300 focus:border-blue-500 w-[140px] h-9 text-sm cursor-pointer appearance-none [&::-webkit-calendar-picker-indicator]:opacity-0"
                        />
                        <div className="absolute right-2 top-1/2 -translate-y-1/2 pointer-events-none">
                          <Calendar className="w-4 h-4 text-gray-400" />
                        </div>
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            </CardContent>
          </Card>
        ))}

        {/* Buttons Row */}
        <div className="flex justify-between items-center pt-4">
          {/* Add Scope Button */}
          <Button
            onClick={addScope}
            className="bg-gradient-to-r from-blue-500 to-indigo-600 hover:from-blue-600 hover:to-indigo-700 text-white shadow-lg hover:shadow-xl transition-all duration-200"
          >
            <Plus className="w-4 h-4 mr-2" />
            Add a Scope
          </Button>

          {/* Save Button */}
          <Button
            size="lg"
            onClick={handleSave}
            disabled={saving}
            className={`bg-gradient-to-r from-emerald-500 to-teal-400 hover:from-emerald-500 hover:to-teal-500 text-white shadow-lg hover:shadow-xl transition-all duration-200 px-8 ${saving ? 'opacity-60 cursor-not-allowed' : ''}`}
          >
            {saving && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}
            {saving ? 'Saving...' : 'Save'}
          </Button>
        </div>

        {/* Preview Section */}
        {previewRows.length > 0 && (
                      <div className="mt-8">
              <Table
                headers={[
                  <ContextMenu key="Scope">
                    <ContextMenuTrigger asChild>
                      <div className="flex items-center gap-1 cursor-pointer">
                        Scope
                        {previewSortColumn === 'Scope' && (
                          previewSortDirection === 'asc' ? <ArrowUp className="w-3 h-3" /> : <ArrowDown className="w-3 h-3" />
                        )}
                      </div>
                    </ContextMenuTrigger>
                    <ContextMenuContent className="w-48 bg-white border border-gray-200 shadow-lg rounded-md">
                      <ContextMenuSub>
                        <ContextMenuSubTrigger className="flex items-center">
                          <ArrowUp className="w-4 h-4 mr-2" /> Sort
                        </ContextMenuSubTrigger>
                        <ContextMenuSubContent className="bg-white border border-gray-200 shadow-lg rounded-md">
                          <ContextMenuItem onClick={() => handlePreviewSort('Scope', 'asc')}>
                            <ArrowUp className="w-4 h-4 mr-2" /> Ascending
                          </ContextMenuItem>
                          <ContextMenuItem onClick={() => handlePreviewSort('Scope', 'desc')}>
                            <ArrowDown className="w-4 h-4 mr-2" /> Descending
                          </ContextMenuItem>
                        </ContextMenuSubContent>
                      </ContextMenuSub>
                      <ContextMenuSeparator />
                      <ContextMenuSub>
                        <ContextMenuSubTrigger className="flex items-center">
                          <FilterIcon className="w-4 h-4 mr-2" /> Filter
                        </ContextMenuSubTrigger>
                        <ContextMenuSubContent className="bg-white border border-gray-200 shadow-lg rounded-md p-0">
                          <PreviewFilterMenu column="Scope" />
                        </ContextMenuSubContent>
                      </ContextMenuSub>
                      {previewColumnFilters['Scope']?.length > 0 && (
                        <>
                          <ContextMenuSeparator />
                          <ContextMenuItem onClick={() => clearPreviewColumnFilter('Scope')}>
                            Clear Filter
                          </ContextMenuItem>
                        </>
                      )}
                    </ContextMenuContent>
                  </ContextMenu>,
                  ...data.selectedIdentifiers.map(id => (
                    <ContextMenu key={id}>
                      <ContextMenuTrigger asChild>
                        <div className="flex items-center gap-1 cursor-pointer">
                          {id}
                          {previewSortColumn === id && (
                            previewSortDirection === 'asc' ? <ArrowUp className="w-3 h-3" /> : <ArrowDown className="w-3 h-3" />
                          )}
                        </div>
                      </ContextMenuTrigger>
                      <ContextMenuContent className="w-48 bg-white border border-gray-200 shadow-lg rounded-md">
                        <ContextMenuSub>
                          <ContextMenuSubTrigger className="flex items-center">
                            <ArrowUp className="w-4 h-4 mr-2" /> Sort
                          </ContextMenuSubTrigger>
                          <ContextMenuSubContent className="bg-white border border-gray-200 shadow-lg rounded-md">
                            <ContextMenuItem onClick={() => handlePreviewSort(id, 'asc')}>
                              <ArrowUp className="w-4 h-4 mr-2" /> Ascending
                            </ContextMenuItem>
                            <ContextMenuItem onClick={() => handlePreviewSort(id, 'desc')}>
                              <ArrowDown className="w-4 h-4 mr-2" /> Descending
                            </ContextMenuItem>
                          </ContextMenuSubContent>
                        </ContextMenuSub>
                        <ContextMenuSeparator />
                        <ContextMenuSub>
                          <ContextMenuSubTrigger className="flex items-center">
                            <FilterIcon className="w-4 h-4 mr-2" /> Filter
                          </ContextMenuSubTrigger>
                          <ContextMenuSubContent className="bg-white border border-gray-200 shadow-lg rounded-md p-0">
                            <PreviewFilterMenu column={id} />
                          </ContextMenuSubContent>
                        </ContextMenuSub>
                        {previewColumnFilters[id]?.length > 0 && (
                          <>
                            <ContextMenuSeparator />
                            <ContextMenuItem onClick={() => clearPreviewColumnFilter(id)}>
                              Clear Filter
                            </ContextMenuItem>
                          </>
                        )}
                      </ContextMenuContent>
                    </ContextMenu>
                  )),
                  ...(data.criteria?.minDatapointsEnabled ? [
                    <ContextMenu key="Min Pts">
                      <ContextMenuTrigger asChild>
                        <div className="flex items-center gap-1 cursor-pointer">
                          Min Pts
                          {previewSortColumn === 'Min Pts' && (
                            previewSortDirection === 'asc' ? <ArrowUp className="w-3 h-3" /> : <ArrowDown className="w-3 h-3" />
                          )}
                        </div>
                      </ContextMenuTrigger>
                      <ContextMenuContent className="w-48 bg-white border border-gray-200 shadow-lg rounded-md">
                        <ContextMenuSub>
                          <ContextMenuSubTrigger className="flex items-center">
                            <ArrowUp className="w-4 h-4 mr-2" /> Sort
                          </ContextMenuSubTrigger>
                          <ContextMenuSubContent className="bg-white border border-gray-200 shadow-lg rounded-md">
                            <ContextMenuItem onClick={() => handlePreviewSort('Min Pts', 'asc')}>
                              <ArrowUp className="w-4 h-4 mr-2" /> Ascending
                            </ContextMenuItem>
                            <ContextMenuItem onClick={() => handlePreviewSort('Min Pts', 'desc')}>
                              <ArrowDown className="w-4 h-4 mr-2" /> Descending
                            </ContextMenuItem>
                          </ContextMenuSubContent>
                        </ContextMenuSub>
                        <ContextMenuSeparator />
                        <ContextMenuSub>
                          <ContextMenuSubTrigger className="flex items-center">
                            <FilterIcon className="w-4 h-4 mr-2" /> Filter
                          </ContextMenuSubTrigger>
                          <ContextMenuSubContent className="bg-white border border-gray-200 shadow-lg rounded-md p-0">
                            <PreviewFilterMenu column="Min Pts" />
                          </ContextMenuSubContent>
                        </ContextMenuSub>
                        {previewColumnFilters['Min Pts']?.length > 0 && (
                          <>
                            <ContextMenuSeparator />
                            <ContextMenuItem onClick={() => clearPreviewColumnFilter('Min Pts')}>
                              Clear Filter
                            </ContextMenuItem>
                          </>
                        )}
                      </ContextMenuContent>
                    </ContextMenu>
                  ] : []),
                  ...(data.criteria?.pct90Enabled ? [
                    <ContextMenu key="Pct Check">
                      <ContextMenuTrigger asChild>
                        <div className="flex items-center gap-1 cursor-pointer">
                          Pct Check
                          {previewSortColumn === 'Pct Check' && (
                            previewSortDirection === 'asc' ? <ArrowUp className="w-3 h-3" /> : <ArrowDown className="w-3 h-3" />
                          )}
                        </div>
                      </ContextMenuTrigger>
                      <ContextMenuContent className="w-48 bg-white border border-gray-200 shadow-lg rounded-md">
                        <ContextMenuSub>
                          <ContextMenuSubTrigger className="flex items-center">
                            <ArrowUp className="w-4 h-4 mr-2" /> Sort
                          </ContextMenuSubTrigger>
                          <ContextMenuSubContent className="bg-white border border-gray-200 shadow-lg rounded-md">
                            <ContextMenuItem onClick={() => handlePreviewSort('Pct Check', 'asc')}>
                              <ArrowUp className="w-4 h-4 mr-2" /> Ascending
                            </ContextMenuItem>
                            <ContextMenuItem onClick={() => handlePreviewSort('Pct Check', 'desc')}>
                              <ArrowDown className="w-4 h-4 mr-2" /> Descending
                            </ContextMenuItem>
                          </ContextMenuSubContent>
                        </ContextMenuSub>
                        <ContextMenuSeparator />
                        <ContextMenuSub>
                          <ContextMenuSubTrigger className="flex items-center">
                            <FilterIcon className="w-4 h-4 mr-2" /> Filter
                          </ContextMenuSubTrigger>
                          <ContextMenuSubContent className="bg-white border border-gray-200 shadow-lg rounded-md p-0">
                            <PreviewFilterMenu column="Pct Check" />
                          </ContextMenuSubContent>
                        </ContextMenuSub>
                        {previewColumnFilters['Pct Check']?.length > 0 && (
                          <>
                            <ContextMenuSeparator />
                            <ContextMenuItem onClick={() => clearPreviewColumnFilter('Pct Check')}>
                              Clear Filter
                            </ContextMenuItem>
                          </>
                        )}
                      </ContextMenuContent>
                    </ContextMenu>
                  ] : []),
                  <ContextMenu key="Row Count">
                    <ContextMenuTrigger asChild>
                      <div className="flex items-center gap-1 cursor-pointer">
                        Row Count
                        {previewSortColumn === 'Row Count' && (
                          previewSortDirection === 'asc' ? <ArrowUp className="w-3 h-3" /> : <ArrowDown className="w-3 h-3" />
                        )}
                      </div>
                    </ContextMenuTrigger>
                    <ContextMenuContent className="w-48 bg-white border border-gray-200 shadow-lg rounded-md">
                      <ContextMenuSub>
                        <ContextMenuSubTrigger className="flex items-center">
                          <ArrowUp className="w-4 h-4 mr-2" /> Sort
                        </ContextMenuSubTrigger>
                        <ContextMenuSubContent className="bg-white border border-gray-200 shadow-lg rounded-md">
                          <ContextMenuItem onClick={() => handlePreviewSort('Row Count', 'asc')}>
                            <ArrowUp className="w-4 h-4 mr-2" /> Ascending
                          </ContextMenuItem>
                          <ContextMenuItem onClick={() => handlePreviewSort('Row Count', 'desc')}>
                            <ArrowDown className="w-4 h-4 mr-2" /> Descending
                          </ContextMenuItem>
                        </ContextMenuSubContent>
                      </ContextMenuSub>
                      <ContextMenuSeparator />
                      <ContextMenuSub>
                        <ContextMenuSubTrigger className="flex items-center">
                          <FilterIcon className="w-4 h-4 mr-2" /> Filter
                        </ContextMenuSubTrigger>
                        <ContextMenuSubContent className="bg-white border border-gray-200 shadow-lg rounded-md p-0">
                          <PreviewFilterMenu column="Row Count" />
                        </ContextMenuSubContent>
                      </ContextMenuSub>
                      {previewColumnFilters['Row Count']?.length > 0 && (
                        <>
                          <ContextMenuSeparator />
                          <ContextMenuItem onClick={() => clearPreviewColumnFilter('Row Count')}>
                            Clear Filter
                          </ContextMenuItem>
                        </>
                      )}
                    </ContextMenuContent>
                  </ContextMenu>
                ]}
                colClasses={[
                  "w-[15%]",
                  ...data.selectedIdentifiers.map(() => "w-[12%]"),
                  ...(data.criteria?.minDatapointsEnabled ? ["w-[10%]"] : []),
                  ...(data.criteria?.pct90Enabled ? ["w-[10%]"] : []),
                  "w-[15%]"
                ]}
                bodyClassName="max-h-80 overflow-y-auto"
                borderColor={`border-${scopeSelector.color.replace('bg-', '')}`}
                customHeader={{
                  title: "Data Preview"
                }}
              >
                {displayedPreviewRows.map((row, index) => (
                <tr key={index}>
                  <td className="table-cell">
                    <div className="flex items-center gap-3">
                      <div className={`w-3 h-3 rounded-full ${
                        row.count === 0
                          ? 'bg-red-500'
                          : (data.criteria?.minDatapointsEnabled && row.count < (data.criteria?.minDatapoints || 0))
                            ? 'bg-red-500'
                            : (data.criteria?.pct90Enabled && row.pctPass === false)
                              ? 'bg-red-500'
                              : 'bg-blue-500'
                      }`}></div>
                      <span className="bg-gradient-to-r from-blue-600 to-indigo-600 bg-clip-text text-transparent font-bold">
                        {`Scope ${data.scopes.findIndex(s=>s.id===row.scopeId)+1}`}
                      </span>
                    </div>
                  </td>
                  {data.selectedIdentifiers.map(id => (
                    <td key={`${row.scopeId}-${id}`} className="table-cell">
                      {row.values[id as string] || '—'}
                    </td>
                  ))}

                  {data.criteria?.minDatapointsEnabled && (
                    <td className="table-cell text-center">
                      {row.count >= (data.criteria?.minDatapoints || 0) ? (
                        <div className="inline-flex items-center justify-center w-8 h-8 bg-gradient-to-r from-green-100 to-emerald-100 rounded-full border border-green-200">
                          <Check className="w-4 h-4 text-green-600" />
                        </div>
                      ) : (
                        <div className="inline-flex items-center justify-center w-8 h-8 bg-gradient-to-r from-red-100 to-pink-100 rounded-full border border-red-200">
                          <X className="w-4 h-4 text-red-600" />
                        </div>
                      )}
                    </td>
                  )}
                  {data.criteria?.pct90Enabled && (
                    <td className="table-cell text-center">
                      {row.pctPass ? (
                        <div className="inline-flex items-center justify-center w-8 h-8 bg-gradient-to-r from-green-100 to-emerald-100 rounded-full border border-green-200">
                          <Check className="w-4 h-4 text-green-600" />
                        </div>
                      ) : (
                        <div className="inline-flex items-center justify-center w-8 h-8 bg-gradient-to-r from-red-100 to-pink-100 rounded-full border border-red-200">
                          <X className="w-4 h-4 text-red-600" />
                        </div>
                      )}
                    </td>
                  )}
                  <td className="table-cell text-right">
                    <span className={`inline-flex items-center px-3 py-1.5 rounded-full text-xs font-bold shadow-sm border ${
                      row.count === 0 
                        ? 'bg-gradient-to-r from-red-100 to-pink-100 text-red-800 border-red-200' 
                        : (() => {
                            // Check if all criteria are met
                            const minDatapointsMet = !data.criteria?.minDatapointsEnabled || row.count >= (data.criteria?.minDatapoints || 0);
                            const pctCheckMet = !data.criteria?.pct90Enabled || row.pctPass;
                            
                            if (minDatapointsMet && pctCheckMet) {
                              return 'bg-gradient-to-r from-green-100 to-emerald-100 text-green-800 border-green-200';
                            } else if (row.count < 100) {
                              return 'bg-gradient-to-r from-amber-100 to-yellow-100 text-amber-800 border-amber-200';
                            } else {
                              return 'bg-gradient-to-r from-blue-100 to-indigo-100 text-blue-800 border-blue-200';
                            }
                          })()
                    }`}>
                      {row.count.toLocaleString()}
                    </span>
                  </td>
                </tr>
              ))}
            </Table>
          </div>
        )}

      </div>
    </div>
  );
};

export default ScopeSelectorCanvas;