import React, { useEffect, useState } from 'react';
import { useToast } from '@/hooks/use-toast';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Checkbox } from '@/components/ui/checkbox';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Plus, Settings, Calendar, X, Loader2, Target, Check } from 'lucide-react';
import { SCOPE_SELECTOR_API } from '@/lib/api';
import { ScopeSelectorData, ScopeData } from '../ScopeSelectorAtom';

interface ScopeSelectorCanvasProps {
  data: ScopeSelectorData;
  onDataChange: (newData: Partial<ScopeSelectorData>) => void;
}

const ScopeSelectorCanvas: React.FC<ScopeSelectorCanvasProps> = ({ data, onDataChange }) => {
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
  // Preview row counts per scope after save
  type PreviewRow = { scopeId: string; values: Record<string, string>; count: number; pctPass?: boolean };
  const [previewRows, setPreviewRows] = useState<PreviewRow[]>([]);
  // Date range fetched from backend
  const [dateRange, setDateRange] = useState<{min: string|null; max: string|null; available: boolean}>({ min: null, max: null, available: false });
  
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

  // Remove identifier selections that are no longer in the global selectedIdentifiers list
  useEffect(() => {
    const cleanedScopes = data.scopes.map(scope => {
      const cleanedIdentifiers: Record<string, string | string[]> = {};
      Object.entries(scope.identifiers).forEach(([k, v]) => {
        if (data.selectedIdentifiers.includes(k)) {
          cleanedIdentifiers[k] = v;
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

      data.scopes.slice(0, 5).forEach((scope, idx) => {
        const setNum = idx + 1;
        const identifierFilters: Record<string, string[]> = {};
        Object.entries(scope.identifiers).forEach(([key, value]) => {
          if (Array.isArray(value) ? value.length : value) {
            identifierFilters[key] = Array.isArray(value) ? value : [value as string];
          }
        });
        requestBody[`identifier_filters_${setNum}`] = identifierFilters;
        if (scope.timeframe.from && scope.timeframe.to) {
          requestBody[`start_date_${setNum}`] = scope.timeframe.from;
          requestBody[`end_date_${setNum}`] = scope.timeframe.to;
        }
      });

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

      for (const scope of data.scopes) {
        const keys = Object.keys(scope.identifiers);
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
        setDateRange({ min: json.min_date, max: json.max_date, available: true });
      } catch (err) {
        console.warn('Date range unavailable:', err);
        setDateRange({ min: null, max: null, available: false });
      }
    };
    fetchRange();
    return () => controller.abort();
  }, [data.dataSource]);

  // Effect to reset state when data source or selected identifiers change
  useEffect(() => {
    console.log('Data source or selected identifiers changed:', {
      dataSource: data.dataSource,
      selectedIdentifiers: data.selectedIdentifiers
    });
    
    // Reset state to trigger new fetches
    setUniqueValues({});
    setLoadingValues({});
    
    // Force a re-render to ensure the effect runs again with the new state
    setLoadingValues(prev => ({ ...prev, _forceUpdate: !prev._forceUpdate }));
  }, [data.dataSource, data.selectedIdentifiers?.join(',')]);

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

  // Fetch unique values for each identifier when selected identifiers change
  useEffect(() => {
    let isMounted = true;
    const abortController = new AbortController();
    
    const fetchData = async () => {
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
      
      // Create a set of identifiers we already have values for or are currently loading
      const existingIdentifiers = new Set([
        ...Object.keys(uniqueValues),
        ...Object.entries(loadingValues).filter(([_, loading]) => loading).map(([id]) => id)
      ]);
      
      // Only fetch for identifiers that are selected but not yet loaded
      const identifiersToFetch = data.selectedIdentifiers.filter(id => !existingIdentifiers.has(id));
      
      console.log('\n=== Starting to fetch unique values ===');
      console.log('Data source:', data.dataSource);
      console.log('Selected identifiers:', data.selectedIdentifiers);
      console.log('Existing identifiers:', Array.from(existingIdentifiers));
      
      if (identifiersToFetch.length === 0) {
        console.log('No new identifiers to fetch, all values already loaded');
        return;
      }
      
      // Set loading state for all identifiers we're about to fetch
      const newLoadingValues = { ...loadingValues };
      identifiersToFetch.forEach(id => {
        newLoadingValues[id] = true;
      });
      setLoadingValues(newLoadingValues);
      
      try {
        // Fetch all unique values in parallel
        const fetchPromises = identifiersToFetch.map(async (identifier) => {
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
    
    // Execute the fetch
    fetchData();
    
    // Cleanup function
    return () => {
      isMounted = false;
      abortController.abort();
    };
  }, [data.dataSource, JSON.stringify(data.selectedIdentifiers)]); // Use JSON.stringify to properly compare arrays

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
      return [];
    }
    if (uniqueValues[identifier]?.length > 0) {
      return uniqueValues[identifier];
    }

    if (currentValue) {
      return [currentValue];
    }
    return ['No values available'];
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
                  <div key={identifier} className="space-y-2">
                    
                    <div className="relative">
                      <Popover>
                        <PopoverTrigger asChild>
                          <Button
                            variant="outline"
                            className="w-full max-w-[180px] justify-between truncate"
                            disabled={loadingValues[identifier] || filteredLoading[scope.id]?.[identifier]}
                          >
                            <span>
                              {(loadingValues[identifier] || filteredLoading[scope.id]?.[identifier])
                                ? 'Loading...'
                                : `${identifier}${Array.isArray(scope.identifiers[identifier]) ? (scope.identifiers[identifier] as string[]).length ? ` (${(scope.identifiers[identifier] as string[]).length})` : '' : scope.identifiers[identifier] ? ' (1)' : ''}`}
                            </span>
                            <span className="ml-2 text-gray-400">▼</span>
                          </Button>
                        </PopoverTrigger>
                        <PopoverContent className="bg-white border-blue-200 max-h-60 overflow-y-auto w-56 p-2">
                          {getIdentifierOptions(scope.id, identifier, scope.identifiers[identifier]).map((option) => {
                            const checked = scope.identifiers[identifier]?.includes(option);
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
            className={`bg-gradient-to-r from-emerald-500 to-teal-600 hover:from-emerald-600 hover:to-teal-700 text-white shadow-lg hover:shadow-xl transition-all duration-200 px-8 ${saving ? 'opacity-60 cursor-not-allowed' : ''}`}
          >
            {saving && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}
            {saving ? 'Saving...' : 'Save'}
          </Button>
        </div>

        {/* Preview Section */}
        
        {previewRows.length > 0 && (
          <div className="mt-8 p-4 bg-white rounded-lg shadow-sm border border-gray-100">
            <h3 className="text-lg font-semibold text-gray-800 mb-4 pb-2 border-b border-gray-100">Preview</h3>
            <div className="max-h-64 overflow-auto rounded-lg border border-gray-200 shadow-sm">
              <table className="min-w-full divide-y divide-gray-200 text-sm">
                <thead className="bg-gradient-to-r from-blue-50 to-blue-100">
                  <tr>
                    <th className="sticky left-0 top-0 z-20 px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider bg-gray-50">Scope</th>
                    {Array.from(new Set(data.scopes.flatMap(s => Object.keys(s.identifiers)))).map(id => (
                      <th key={id} className="sticky top-0 z-10 px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider bg-gray-50">
                        {id}
                      </th>
                    ))}
                    {data.criteria?.minDatapointsEnabled && (
                      <th className="sticky top-0 z-10 px-4 py-3 text-center text-xs font-medium text-gray-500 uppercase tracking-wider bg-gray-50">Min&nbsp;Pts&nbsp;✓/✕</th>
                    )}
                    {data.criteria?.pct90Enabled && (
                      <th className="sticky top-0 z-10 px-4 py-3 text-center text-xs font-medium text-gray-500 uppercase tracking-wider bg-gray-50">Pct&nbsp;✓/✕</th>
                    )}
                    <th className="sticky top-0 z-10 px-4 py-3 text-right text-xs font-medium text-gray-500 uppercase tracking-wider bg-gray-50">Rows</th>
                  </tr>
                </thead>
                <tbody className="bg-white divide-y divide-gray-200">
                  {previewRows.map((row, index) => (
                    <tr 
                      key={index} 
                      className={
                        row.count === 0
                          ? 'bg-red-50'
                          : (data.criteria?.minDatapointsEnabled && row.count < (data.criteria?.minDatapoints || 0))
                            ? 'bg-yellow-50'
                            : (data.criteria?.pct90Enabled && !row.pctPass)
                              ? 'bg-red-50'
                              : 'bg-white hover:bg-blue-50'
                      }
                    >
                      <td className="sticky left-0 z-10 px-4 py-3 whitespace-nowrap text-sm font-medium text-gray-900 bg-white">
                        {`Scope ${data.scopes.findIndex(s=>s.id===row.scopeId)+1}`}
                      </td>
                      {Array.from(new Set(data.scopes.flatMap(s => Object.keys(s.identifiers)))).map(id => (
                        <td key={`${row.scopeId}-${id}`} className="px-4 py-3 whitespace-nowrap text-sm text-gray-500">
                          <span className="inline-block px-2 py-1 bg-blue-50 text-blue-700 rounded-full text-xs">
                            {row.values[id] || '—'}
                          </span>
                        </td>
                      ))}

                      {data.criteria?.minDatapointsEnabled && (
                        <td className="px-4 py-3 whitespace-nowrap text-center text-sm">
                          {row.count >= (data.criteria?.minDatapoints || 0) ? (
                            <Check className="w-4 h-4 text-green-600 inline" />
                          ) : (
                            <X className="w-4 h-4 text-red-500 inline" />
                          )}
                        </td>
                      )}
                      {data.criteria?.pct90Enabled && (
                        <td className="px-4 py-3 whitespace-nowrap text-center text-sm">
                          {row.pctPass ? (
                            <Check className="w-4 h-4 text-green-600 inline" />
                          ) : (
                            <X className="w-4 h-4 text-red-500 inline" />
                          )}
                        </td>
                      )}
                      <td className="px-4 py-3 whitespace-nowrap text-right text-sm font-semibold text-gray-900">
                        <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-green-100 text-green-800">
                          {row.count}
                        </span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}

      </div>
    </div>
  );
};

export default ScopeSelectorCanvas;