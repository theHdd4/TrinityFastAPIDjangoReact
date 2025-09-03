import React from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Loader2 } from 'lucide-react';
import { SCOPE_SELECTOR_API } from '@/lib/api';
import { Label } from '@/components/ui/label';
import { Checkbox } from '@/components/ui/checkbox';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Target, X, Check } from 'lucide-react';
import { ScopeSelectorData } from '../ScopeSelectorAtom';

interface ScopeSelectorSettingsProps {
  data: Partial<ScopeSelectorData>;
  onDataChange: (newData: Partial<ScopeSelectorData>) => void;
}

const ScopeSelectorSettings: React.FC<ScopeSelectorSettingsProps> = ({ data, onDataChange }) => {
  // Ensure we have valid arrays
  const availableIdentifiers = React.useMemo(() => 
    Array.isArray(data.availableIdentifiers) ? data.availableIdentifiers : [], 
    [data.availableIdentifiers]
  );
  
  const selectedIdentifiers = React.useMemo(() => 
    Array.isArray(data.selectedIdentifiers) ? data.selectedIdentifiers : [], 
    [data.selectedIdentifiers]
  );

  const numericColumns = React.useMemo(() => {
    return (Array.isArray(data.allColumns) ? data.allColumns : [])
      .filter(col => {
        const t = col.dtype?.toLowerCase() || col.data_type?.toLowerCase() || '';
        return t.includes('int') || t.includes('float') || t.includes('number');
      })
      .map(col => col.column_name || col.column);
  }, [data.allColumns]);

  const toggleIdentifier = React.useCallback((identifier: string) => {
    const newSelected = selectedIdentifiers.includes(identifier)
      ? selectedIdentifiers.filter(id => id !== identifier)
      : [...selectedIdentifiers, identifier];
    
    onDataChange({ selectedIdentifiers: newSelected });
  }, [selectedIdentifiers, onDataChange]);

  const selectAllIdentifiers = React.useCallback(() => {
    onDataChange({ selectedIdentifiers: [...availableIdentifiers] });
  }, [availableIdentifiers, onDataChange]);

  const clearAllIdentifiers = React.useCallback(() => {
    onDataChange({ selectedIdentifiers: [] });
  }, [onDataChange]);

  // =============================
  // CRITERIA STATE
  // =============================
  const [criteria, setCriteria] = React.useState(() => ({
    minDatapointsEnabled: true,
    minDatapoints: 24,
    pct90Enabled: false,
    pctPercentile: 90,
    pctThreshold: 10,
    pctBase: 'max',
    pctColumn: ''
  }));

  // push defaults once on mount
  React.useEffect(() => {
    onDataChange({ criteria });
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const updateCriteria = (patch: Partial<typeof criteria>) => {
    setCriteria(prev => ({ ...prev, ...patch }));
    onDataChange({ criteria: { ...criteria, ...patch } });
  };

  // =============================
  // Select identifiers that have more than one unique value in the data source
  const [multiLoading, setMultiLoading] = React.useState(false);
  const selectMultiValueIdentifiers = React.useCallback(async () => {
    if (!data.dataSource) return;
    try {
      setMultiLoading(true);
      const results: string[] = [];
      await Promise.all(
        availableIdentifiers.map(async (identifier) => {
          try {
            const res = await fetch(
              `${SCOPE_SELECTOR_API}/unique_values?object_name=${encodeURIComponent(
                data.dataSource || ''
              )}&column_name=${encodeURIComponent(identifier)}`
            );
            if (res.ok) {
              const json = await res.json();
              if (Array.isArray(json.unique_values) && json.unique_values.length > 1) {
                results.push(identifier);
              }
            }
          } catch (err) {
            console.error('Error fetching unique values', err);
          }
        })
      );
      onDataChange({ selectedIdentifiers: results });
    } finally {
      setMultiLoading(false);
    }
  }, [availableIdentifiers, data.dataSource, onDataChange]);


  if (!data.allColumns?.length) {
    return (
      <div className="p-6 text-center text-gray-500">
        <Target className="w-10 h-10 mx-auto mb-3 text-gray-400" />
        <h3 className="text-lg font-medium mb-1">No Data Source Selected</h3>
        <p className="text-sm">Please select a data source in the Input Files tab</p>
      </div>
    );
  }

  if (availableIdentifiers.length === 0) {
    return (
      <div className="p-6 text-center text-gray-500">
        <Target className="w-10 h-10 mx-auto mb-3 text-gray-400" />
        <h3 className="text-lg font-medium mb-1">No Categorical Columns Found</h3>
        <p className="text-sm">The selected data source doesn't contain any suitable categorical columns</p>
      </div>
    );
  }

  return (
    <div className="h-full flex flex-col">
      <div className="flex items-center justify-between mb-2">
        <h3 className="text-sm font-medium text-gray-700">Identifiers</h3>
        <div className="flex gap-2">
          <Button 
            variant="outline" 
            size="sm"
            onClick={selectedIdentifiers.length === availableIdentifiers.length ? clearAllIdentifiers : selectAllIdentifiers}
            className="text-blue-600 border-blue-200 hover:bg-blue-50 text-xs h-7 px-2"
          >
            {selectedIdentifiers.length === availableIdentifiers.length ? 'Deselect All' : 'Select All'}
          </Button>
          <Button
            variant="outline"
            size="sm"
            onClick={selectMultiValueIdentifiers}
            disabled={multiLoading}
            className="text-blue-600 border-blue-200 hover:bg-blue-50 text-xs h-7 px-2 flex items-center"
          >
            {multiLoading && <Loader2 className="w-3 h-3 mr-1 animate-spin" />}
            {multiLoading ? 'Loading' : 'Unique >1'}
          </Button>
        </div>
      </div>
      
      <div className="flex-1 overflow-y-auto pr-1">
        <div className="grid grid-cols-1 gap-2">
          {availableIdentifiers.map((identifier) => (
            <div 
              key={identifier} 
              className={`flex items-center p-2 rounded-md border ${
                selectedIdentifiers.includes(identifier) 
                  ? 'bg-blue-50 border-blue-200' 
                  : 'border-gray-200 hover:border-blue-200 hover:bg-gray-50'
              } transition-colors cursor-pointer`}
              onClick={() => toggleIdentifier(identifier)}
            >
              <Checkbox
                id={`checkbox-${identifier}`}
                checked={selectedIdentifiers.includes(identifier)}
                onCheckedChange={() => toggleIdentifier(identifier)}
                className="data-[state=checked]:bg-blue-600 data-[state=checked]:border-blue-600 mr-2"
              />
              <Label 
                htmlFor={`checkbox-${identifier}`}
                className="flex-1 text-sm font-normal cursor-pointer truncate"
                title={identifier}
              >
                {identifier}
              </Label>
            </div>
          ))}
        </div>
      </div>

      {/* Criteria Section */}
      <div className="mt-4 pt-4 border-t border-gray-200 space-y-4 grid gap-4 overflow-x-auto">
        <h4 className="text-sm font-medium text-gray-700">Criteria</h4>
        {/* Min datapoints */}
        <div className="flex items-center gap-3">
          <Checkbox
            id="chk-min-dp"
            checked={criteria.minDatapointsEnabled}
            onCheckedChange={(v) => updateCriteria({ minDatapointsEnabled: Boolean(v) })}
            className="data-[state=checked]:bg-blue-600 data-[state=checked]:border-blue-600"
          />
          <Label htmlFor="chk-min-dp" className="text-sm flex-1">Min datapoints</Label>
          <Input
            type="number"
            min={0}
            value={criteria.minDatapoints}
            disabled={!criteria.minDatapointsEnabled}
            onChange={(e) => updateCriteria({ minDatapoints: Number(e.target.value) })}
            className="w-24 h-8 text-sm"
          />
        </div>
        {/* Percentile criterion */}
        <div className="flex items-center gap-3 flex-nowrap overflow-x-auto">
          <Checkbox
            id="chk-pct"
            checked={criteria.pct90Enabled}
            onCheckedChange={(v) => updateCriteria({ pct90Enabled: Boolean(v) })}
            className="data-[state=checked]:bg-blue-600 data-[state=checked]:border-blue-600"
          />
          <Input
            type="number"
            min={0}
            max={100}
            value={criteria.pctPercentile}
            disabled={!criteria.pct90Enabled}
            onChange={(e) => updateCriteria({ pctPercentile: Number(e.target.value) })}
            className="w-16 h-8 text-sm"
          />
          <span className="text-sm whitespace-nowrap">th percentile &gt;</span>
          <Input
            type="number"
            min={0}
            max={100}
            value={criteria.pctThreshold}
            disabled={!criteria.pct90Enabled}
            onChange={(e) => updateCriteria({ pctThreshold: Number(e.target.value) })}
            className="w-16 h-8 text-sm"
          />
          <span className="text-sm whitespace-nowrap">% of</span>
          <Select
            value={criteria.pctBase}
            onValueChange={(val) => updateCriteria({ pctBase: val as any })}
            disabled={!criteria.pct90Enabled}
          >
            <SelectTrigger className="w-24 h-8 text-sm bg-white border-gray-300">
              <SelectValue placeholder="base" />
            </SelectTrigger>
            <SelectContent>
              {['max','min','mean','dist'].map(opt => (
                <SelectItem key={opt} value={opt} className="capitalize">{opt}</SelectItem>
              ))}
            </SelectContent>
          </Select>
          <span className="text-sm whitespace-nowrap">data of</span>
          <Select
            value={criteria.pctColumn}
            onValueChange={(val) => updateCriteria({ pctColumn: val })}
            disabled={!criteria.pct90Enabled}
          >
            <SelectTrigger className="w-32 h-8 text-sm bg-white border-gray-300">
              <SelectValue placeholder="column" />
            </SelectTrigger>
            <SelectContent className="max-h-60 overflow-auto">
              {numericColumns.map(col=> (
                <SelectItem key={col} value={col}>{col}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      </div>
    </div>
  );
};

export default ScopeSelectorSettings;