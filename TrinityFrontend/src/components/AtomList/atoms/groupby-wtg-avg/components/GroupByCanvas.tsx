import React, { useState } from 'react';
import { useToast } from '@/hooks/use-toast';
import { Button } from '@/components/ui/button';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';

import { Card, CardContent } from '@/components/ui/card';
import { Plus, X, Database, Settings2, BarChart, ChevronUp, ChevronDown } from 'lucide-react';
import { Input } from '@/components/ui/input';
import { useLaboratoryStore } from '@/components/LaboratoryMode/store/laboratoryStore';
import { GROUPBY_API } from '@/lib/api';

interface GroupByCanvasProps {
  atomId: string;
}

const GroupByCanvas: React.FC<GroupByCanvasProps> = ({ atomId }) => {
  const { toast } = useToast();
  const atom = useLaboratoryStore(state => state.getAtom(atomId));
  const updateSettings = useLaboratoryStore(state => state.updateAtomSettings);
  const settings = atom?.settings || {};

  const selectedMeasures = settings.selectedMeasures || [];
  const measures = settings.measures || [];
  const selectedIdentifiers = settings.selectedIdentifiers || [];
  const identifiers = settings.identifiers || [];
  const derivedIdentifiers = identifiers.length > 0 ? identifiers : (settings.allColumns || []).filter((c: any) => c.data_type && (
    c.data_type.toLowerCase().includes('object') ||
    c.data_type.toLowerCase().includes('string') ||
    c.data_type.toLowerCase().includes('category')
  )).map((c: any) => c.column);
  const availableIdentifiers = derivedIdentifiers.filter((id: string) => !selectedIdentifiers.includes(id));
  const [addingIdentifier, setAddingIdentifier] = useState(false);
  const handleAddIdentifier = (id: string) => {
    updateSettings(atomId, { selectedIdentifiers: [...selectedIdentifiers, id] });
    setAddingIdentifier(false);
  };

  // Helper: do any measures use Weighted Mean?
  const hasWeightedMean = selectedMeasures.some((m: any) => m.aggregator === 'Weighted Mean');

  // Total rows (before slicing) and Save DataFrame states
  const [totalRows, setTotalRows] = useState(0);
  const [allResults, setAllResults] = useState<Record<string, any>[]>([]);
  const [saveLoading, setSaveLoading] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [saveSuccess, setSaveSuccess] = useState(false);
  // Collapse state for configuration panel
  const [configCollapsed, setConfigCollapsed] = useState(false);

  // Helper to convert results to CSV
  const resultsToCSV = (data: Record<string, any>[]): string => {
    if (!data.length) return '';
    const headers = Object.keys(data[0]);
    const rows = data.map(r => headers.map(h => JSON.stringify(r[h] ?? '')).join(','));
    return [headers.join(','), ...rows].join('\n');
  };

  // Save DataFrame handler
  const handleSaveDataFrame = async () => {
    const dataToSave = allResults.length ? allResults : results;
  if (!dataToSave || dataToSave.length === 0) return;
    setSaveLoading(true);
    setSaveError(null);
    setSaveSuccess(false);
    try {
      const csv_data = resultsToCSV(dataToSave);
      const filename = `groupby_${settings?.dataSource?.split('/')?.pop() || 'data'}_${Date.now()}`;
      const response = await fetch(`${GROUPBY_API}/save`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ csv_data, filename }),
      });
      if (!response.ok) {
        throw new Error(`Save failed: ${response.statusText}`);
      }
      setSaveSuccess(true);
    // Mark as saved if needed or update settings
      toast({ title: 'Success', description: 'DataFrame saved successfully.' });
    } catch (err: any) {
      const msg = err instanceof Error ? err.message : 'Failed to save DataFrame';
      setSaveError(msg);
      toast({ title: 'Error', description: msg, variant: 'destructive' });
    } finally {
      setSaveLoading(false);
    }
  };

  const addGroupByLevel = () => {
    // Add logic to add new group by level
  };

  const removeIdentifier = (id: string) => {
    const newIds = selectedIdentifiers.filter((i: string) => i !== id);
    updateSettings(atomId, { selectedIdentifiers: newIds });
  };

  const removeSelectedMeasure = (index: number) => {
    const newMeasures = selectedMeasures.filter((_: any, i: number) => i !== index);
    updateSettings(atomId, { selectedMeasures: newMeasures });
  };

  const addMeasure = () => {
    const newMeasures = [...selectedMeasures, { field: '', aggregator: 'sum', weight_by: '', rename_to: '' }];
    updateSettings(atomId, { selectedMeasures: newMeasures });
  };

  const updateMeasure = (index: number, field: 'field' | 'aggregator' | 'weight_by' | 'rename_to', value: string) => {
    const newMeasures = selectedMeasures.map((measure: any, i: number) => (
      i === index ? { ...measure, [field]: value } : measure
    ));
    updateSettings(atomId, { selectedMeasures: newMeasures });
  };

  // Aggregation methods selected in settings (add this logic)
  const aggregationOptions = [
    'Sum', 'Mean', 'Min', 'Max', 'Count', 'Median', 'Weighted Mean', 'Rank Percentile'
  ];
  const selectedAggregationMethods = Array.isArray(settings.selectedAggregationMethods) && settings.selectedAggregationMethods.length > 0
    ? settings.selectedAggregationMethods
    : aggregationOptions;

  // Fallback logic for measures
  const fallbackMeasures = measures.length === 0
    ? (settings.allColumns || []).filter((c: any) => c.data_type && (
        c.data_type.toLowerCase().includes('int') ||
        c.data_type.toLowerCase().includes('float') ||
        c.data_type.toLowerCase().includes('number')
      )).map((c: any) => c.column)
    : measures;

  // Use only selected measures from settings for the Field dropdown
  const selectedMeasureNames = Array.isArray(settings.selectedMeasureNames)
    ? settings.selectedMeasureNames
    : (
        // If settings.selectedMeasures present use them
        (Array.isArray(settings.selectedMeasures) && settings.selectedMeasures.length > 0)
          ? (
              typeof settings.selectedMeasures[0] === 'string'
                ? settings.selectedMeasures as string[]
                : settings.selectedMeasures.map((m: any) => m.field).filter(Boolean)
            )
          // else fallback to full measures list loaded with file
          : (
              Array.isArray(measures) && measures.length > 0
                ? (typeof measures[0] === 'string'
                    ? measures as string[]
                    : measures.map((m: any) => m.field).filter(Boolean))
                : []
            )
      );
  // Build numeric columns list directly from allColumns for comprehensive options
  const numericColumns = (settings.allColumns || []).filter(
    (c: any) => c.data_type && (
      c.data_type.toLowerCase().includes('int') ||
      c.data_type.toLowerCase().includes('float') ||
      c.data_type.toLowerCase().includes('number')
    )
  ).map((c: any) => c.column);

  // ------------------------------------------------------------
  // Initialise measures & selectedMeasureNames once columns arrive
  React.useEffect(() => {
    if (Array.isArray(settings.allColumns) && settings.allColumns.length > 0) {
      const numericCols = settings.allColumns
        .filter((c: any) => c.data_type && (
          c.data_type.toLowerCase().includes('int') ||
          c.data_type.toLowerCase().includes('float') ||
          c.data_type.toLowerCase().includes('number')
        ))
        .map((c: any) => c.column);

      // Initialise only if not already set
      if ((measures.length === 0) && numericCols.length > 0) {
        updateSettings(atomId, {
          measures: numericCols,
          selectedMeasureNames: numericCols,
        });
      }
    }
  }, [settings.allColumns]);
  // Field dropdown options: prefer measures selected in settings, else full numeric list
  const fieldOptions = selectedMeasureNames.length > 0 ? selectedMeasureNames : fallbackMeasures;

  const [results, setResults] = useState<any[]>([]);
  const [resultsHeaders, setResultsHeaders] = useState<string[]>([]);
  const [resultsLoading, setResultsLoading] = useState(false);
  const [resultsError, setResultsError] = useState<string | null>(null);

  // Handler for Perform button
  const handlePerform = async () => {
    setResultsLoading(true);
    setResultsError(null);
    try {
      // Collect identifiers, measures, aggregations, and measure config
      const identifiers = selectedIdentifiers;
      // Build aggregations object from measure config
      const aggregations: Record<string, any> = {};
      // Prepare for rename validation
    const existingColsLower = new Set(
      (settings.allColumns || []).map((c: any) => (c.column || '').toLowerCase())
    );
    const renameSeen = new Set<string>();

    selectedMeasures.forEach((measure: any) => {
        if (typeof measure === 'string') {
          // If selectedMeasures is just strings, use default aggregator
          aggregations[measure] = { agg: (selectedAggregationMethods[0] || 'sum').toLowerCase() };
        } else if (measure.field && measure.aggregator) {
          // Map aggregator names to backend-friendly keys
          const aggRaw = (measure.aggregator || '').toLowerCase();
          let aggKey = aggRaw;
          if (aggRaw === 'weighted mean') aggKey = 'weighted_mean';
          if (aggRaw === 'rank percentile') aggKey = 'rank_pct';
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
               setResultsLoading(false);
               throw new Error(`Duplicate or existing column name: ${measure.rename_to}`);
             }
             renameSeen.add(renameLower);
             aggObj.rename_to = measure.rename_to.trim();
           }
          if (aggKey === 'weighted_mean') {
            aggObj.weight_by = measure.weight_by || '';
          }
          aggregations[measure.field] = aggObj;
        }
      });
      // Fallback: if no measure config, use all selected measures with default aggregator
      if (Object.keys(aggregations).length === 0 && Array.isArray(selectedMeasures)) {
        selectedMeasures.forEach((m: any) => {
          const field = typeof m === 'string' ? m : m.field;
          aggregations[field] = { agg: (selectedAggregationMethods[0] || 'sum').toLowerCase() };
        });
      }
      // Prepare form data
      const formData = new FormData();
      formData.append('validator_atom_id', settings.validator_atom_id || '');
      formData.append('file_key', settings.dataSource || '');
      formData.append('bucket_name', 'trinity');
      formData.append('object_names', settings.dataSource || '');
      formData.append('identifiers', JSON.stringify(identifiers));
      formData.append('aggregations', JSON.stringify(aggregations));
      const res = await fetch(`${GROUPBY_API}/run`, { method: 'POST', body: formData });
      const data = await res.json();
      if (data.status === 'SUCCESS' && data.result_file) {
        // Fetch the results from the backend
        const params = new URLSearchParams({
          validator_atom_id: settings.validator_atom_id || '',
          file_key: settings.dataSource || '',
          bucket_name: 'trinity',
        });
        const resultsRes = await fetch(`${GROUPBY_API}/results?${params.toString()}`);
        const resultsData = await resultsRes.json();
        if (resultsData && resultsData.merged_data && resultsData.merged_data.length > 0) {
          const allRows = resultsData.merged_data;
          setTotalRows(allRows.length);
          setAllResults(allRows);
          setResults(allRows.slice(0, 20));
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
          setResultsHeaders(headers);
          // Persist result metadata so Exhibition tab can reflect latest results
          updateSettings(atomId, {
            groupbyResults: {
              result_file: data.result_file,
              result_shape: [allRows.length, headers.length],
            },
          });
        } else {
          setResults([]);
          setResultsHeaders([]);
        }
      } else {
        setResultsError(data.error || 'GroupBy failed');
        setResults([]);
        setResultsHeaders([]);
      }
      setResultsLoading(false);
    } catch (e: any) {
      setResultsError(e.message || 'Error performing groupby');
      setResults([]);
      setResultsHeaders([]);
      setResultsLoading(false);
    }
  };

  return (
    <div className="p-6 space-y-6 h-full overflow-auto bg-gradient-to-br from-slate-50 to-slate-100">
      {/* Group By Section */}
      <Card className="shadow-lg border-0 bg-white/80 backdrop-blur-sm">
        <div className="flex items-center justify-between px-4 pt-4 pb-2">
          <div className="flex items-center space-x-2">
            <Settings2 className="h-5 w-5 text-green-500" />
            <span className="font-semibold text-base">Group By Configuration</span>
          </div>
          <button
            className="p-1 rounded hover:bg-green-100 transition-colors"
            onClick={() => setConfigCollapsed(v => !v)}
            aria-label={configCollapsed ? 'Expand configuration' : 'Collapse configuration'}
          >
            {configCollapsed ? <ChevronDown className="w-5 h-5" /> : <ChevronUp className="w-5 h-5" />}
          </button>
        </div>
        {/* Configuration content */}
        {!configCollapsed && (
        <CardContent className="p-6 space-y-6">
          {/* Level Header and Row (only once) */}
          <div className="bg-emerald-50 rounded-lg p-3 shadow-sm">
            <div className="flex flex-wrap gap-1 items-center">
              <div className="font-semibold text-green-600 mr-2 text-sm">Level:</div>
               {selectedIdentifiers.map((identifier: string) => (
                <div key={identifier} className="flex items-center gap-1 text-xs font-medium text-green-700 bg-gradient-to-r from-blue-50 to-indigo-50 px-2 py-1 rounded-full border border-blue-200 shadow-sm">
                <span>{identifier}</span>
                <button
                  className="text-slate-500 hover:text-red-600 focus:outline-none"
                  onClick={() => removeIdentifier(identifier)}
                  aria-label="Remove identifier"
                >
                  <X className="h-3 w-3" />
                </button>
              </div>
               ))}
               {/* Add Identifier Button / Selector */}
               {addingIdentifier ? (
                 <Select onValueChange={handleAddIdentifier} value="">
                   <SelectTrigger className="w-40 bg-white text-xs">
                     <SelectValue placeholder="Select identifier" />
                   </SelectTrigger>
                   <SelectContent className="max-h-48 overflow-auto">
                     {availableIdentifiers.map(id => (
                       <SelectItem key={id} value={id} className="text-xs">{id}</SelectItem>
                     ))}
                   </SelectContent>
                 </Select>
               ) : (
                 <Button variant="ghost" size="sm" className="text-green-700 hover:bg-green-100" onClick={() => setAddingIdentifier(true)}>
                   <Plus className="h-4 w-4" />
                 </Button>
               )}
             </div>
           </div>
          {/* Field and Aggregator Selectors */}
          <div className="space-y-4 pt-4 border-t border-slate-200">
            <h3 className="font-semibold text-slate-700 flex items-center gap-2">
              <BarChart className="h-5 w-5" />
              Measure Configuration
            </h3>
            {selectedMeasures.map((measure: any, index: number) => (
              <div key={index} className="flex items-center justify-between gap-4 p-2 bg-gradient-to-r from-green-50 to-emerald-50 rounded-lg border border-green-200">
                <div className="w-44">
                  <label className={`text-sm font-semibold mb-2 block text-green-700 ${index !== 0 ? 'sr-only' : ''}`}>Field</label>
                  <Select value={measure.field} onValueChange={(value) => updateMeasure(index, 'field', value)}>
                    <SelectTrigger className="bg-white">
                      <SelectValue placeholder="Select field" />
                    </SelectTrigger>
                    <SelectContent>
                       {fieldOptions
                         .filter((col: string) => {
                           return !selectedMeasures.some((m: any, i2: number) => i2 !== index && m.field === col);
                         })
                         .map((col: string) => (
                           <SelectItem key={col} value={col}>{col}</SelectItem>
                         ))}
                    </SelectContent>
                  </Select>
                </div>
                {/* Placeholder heading for Weight By in first row */}
                {index === 0 && hasWeightedMean && measure.aggregator !== 'Weighted Mean' && (
                  <div className="w-44"></div>
                )}
                {measure.aggregator === 'Weighted Mean' && (
                  <div className="w-44">
                    <label className={`text-sm font-semibold mb-2 block text-green-700 ${(index !== 0) ? 'sr-only' : ''}`}>Weight By</label>
                    <Select value={measure.weight_by || ''} onValueChange={(value) => updateMeasure(index, 'weight_by', value)}>
                      <SelectTrigger className="bg-white">
                        <SelectValue placeholder="Select weight column" />
                      </SelectTrigger>
                      <SelectContent>
                        {numericColumns.map((col: string) => (
                          <SelectItem key={col} value={col}>{col}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                )}
                <div className="w-44 ml-auto">
                  <label className={`text-sm font-semibold mb-2 block text-green-700 ${index !== 0 ? 'sr-only' : ''}`}>Aggregator</label>
                  <Select value={measure.aggregator} onValueChange={(value) => updateMeasure(index, 'aggregator', value)}>
                    <SelectTrigger className="bg-white">
                      <SelectValue placeholder="Select aggregation" />
                    </SelectTrigger>
                    <SelectContent>
                      {selectedAggregationMethods.map((agg: string) => (
                        <SelectItem key={agg} value={agg}>{agg}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                {/* Rename To input */}
                <div className="w-44">
                  <label className={`text-sm font-semibold mb-2 block text-green-700 ${index !== 0 ? 'sr-only' : ''}`}>Rename To</label>
                  <Input
                    placeholder="New name"
                    value={measure.rename_to || ''}
                    onChange={(e) => updateMeasure(index, 'rename_to', e.target.value)}
                    className="bg-white"
                  />
                </div>
                <Button 
                  variant="ghost" 
                  size="sm" 
                  onClick={() => removeSelectedMeasure(index)}
                  className="text-red-500 hover:text-red-700 hover:bg-red-50"
                >
                  <X className="h-4 w-4" />
                </Button>
              </div>
            ))}
            <div className="flex items-center justify-between">
              <Button 
                variant="outline" 
                size="sm" 
                onClick={addMeasure}
                className="border-green-300 text-green-700 hover:bg-green-50"
              >
                <Plus className="h-4 w-4 mr-2" />
                Add Measure
              </Button>
              <Button
                variant="default"
                size="sm"
                onClick={handlePerform}
                className="bg-green-600 hover:bg-green-700 text-white"
              >
                Perform
              </Button>
            </div>
          </div>
        </CardContent>
        )}
      </Card>
      {/* Group By Results */}
      <Card className="mt-8 shadow-lg border-0 bg-white/80 backdrop-blur-sm overflow-hidden">
        {resultsLoading ? (
          <div className="p-4 text-blue-600">Loading results...</div>
        ) : resultsError ? (
          <div className="p-4 text-red-600">{resultsError}</div>
        ) : results && results.length > 0 ? (
          <div className="bg-gradient-to-r from-green-500 to-green-600 p-1">
            <div className="bg-white rounded-sm">
              <div className="p-4">
                <div className="flex items-center justify-between mb-4">
                  <div className="flex items-center">
                    <div className="w-1 h-8 bg-gradient-to-b from-green-500 to-green-600 rounded-full mr-4"></div>
                    <h3 className="text-xl font-bold text-gray-900 flex items-center gap-2">
                      <Database className="h-5 w-5" /> Results
                    </h3>
                    <span className="ml-3 inline-block bg-green-50 border border-green-200 text-green-700 text-sm font-semibold px-3 py-1 rounded">
                      {(totalRows || results.length).toLocaleString()} rows • {resultsHeaders.length} columns
                    </span>
                  </div>
                  <div className="flex items-center">
                    <Button
                      onClick={handleSaveDataFrame}
                      disabled={saveLoading}
                      className="bg-blue-600 hover:bg-blue-700 text-white"
                    >
                      {saveLoading ? 'Saving...' : 'Save DataFrame'}
                    </Button>
                    {saveError && <span className="text-red-600 text-sm ml-2">{saveError}</span>}
                    {saveSuccess && <span className="text-green-600 text-sm ml-2">Saved!</span>}
                  </div>
                </div>

                <div className="rounded-md border border-green-100">
                  <Table className="min-w-full" maxHeight="max-h-96">
                    <TableHeader>
                      <TableRow>
                        {resultsHeaders.map((header, index) => (
                          <TableHead
                            key={index}
                            className="sticky top-0 z-30 bg-green-50 border-b border-green-200 font-bold text-gray-800 text-center py-4"
                          >
                            {header}
                          </TableHead>
                        ))}
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {results.map((row, rowIndex) => (
                        <TableRow
                          key={rowIndex}
                          className="bg-white hover:bg-gray-50 transition-all duration-200 border-b border-gray-100"
                        >
                          {resultsHeaders.map((header, colIndex) => (
                            <TableCell key={colIndex} className="py-4 text-center font-medium text-gray-700">
                              {row[header] !== null && row[header] !== undefined && row[header] !== '' ? (
                                typeof row[header] === 'number' ? row[header] : String(row[header])
                              ) : (
                                <span className="italic text-gray-500">null</span>
                              )}
                            </TableCell>
                          ))}
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                  <div className="text-sm text-gray-500 mt-2">Showing first 20 rows of {(totalRows || results.length).toLocaleString()} total rows</div>
                </div>
              </div>
            </div>
          </div>
        ) : (
          <div className="p-4 text-gray-500">No results to display. Please Configure GroupBy options.</div>
        )}
      </Card>
    </div>
  );
};

export default GroupByCanvas;