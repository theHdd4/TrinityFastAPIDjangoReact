import React, { useCallback, useEffect, useState } from 'react';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Checkbox } from '@/components/ui/checkbox';
import { Button } from '@/components/ui/button';

import GroupByInputFiles from '../GroupByInputFiles';
import GroupByExhibition from '../GroupByExhibition';
import { useLaboratoryStore } from '@/components/LaboratoryMode/store/laboratoryStore';

interface GroupByPropertiesProps {
  atomId: string;
}

const GroupByProperties: React.FC<GroupByPropertiesProps> = ({ atomId }) => {
  const atom = useLaboratoryStore(state => state.getAtom(atomId));
  const updateSettings = useLaboratoryStore(state => state.updateAtomSettings);
  const settings = atom?.settings || {};
  // Tab for Input/Settings/Exhibition similar to CreateColumn
  const [tab, setTab] = useState('input');

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
  // Local draggable lists
  // ------------------------------
  const [identifierList, setIdentifierList] = useState<string[]>(fallbackIdentifiers);
  const [measureList, setMeasureList] = useState<string[]>(fallbackMeasures);

  // Keep local lists in sync when fallback arrays change (e.g. after data fetch)
  useEffect(() => {
    setIdentifierList(fallbackIdentifiers);
  }, [fallbackIdentifiers]);

  useEffect(() => {
    setMeasureList(fallbackMeasures);
  }, [fallbackMeasures]);

  // Use local state for selectedMeasures to ensure checkboxes are ticked on first render
  // Initialise localSelectedMeasures so all measures are ticked by default
  const [localSelectedMeasures, setLocalSelectedMeasures] = useState<string[]>(() => {
    if (Array.isArray(settings.selectedMeasures) && settings.selectedMeasures.length > 0) {
      return typeof settings.selectedMeasures[0] === 'string'
        ? settings.selectedMeasures as string[]
        : (settings.selectedMeasures as any[]).map(m => m.field).filter(Boolean);
    }
    // If no selection yet, default to every available measure
    return fallbackMeasures;
  });

  // Ensure local selection includes all measures once they are available
  useEffect(() => {
    if (localSelectedMeasures.length === 0 && fallbackMeasures.length > 0) {
      setLocalSelectedMeasures(fallbackMeasures);
    }
  }, [fallbackMeasures]);

  // Keep local state in sync with external updates coming **from the Settings tab only**
  useEffect(() => {
    if (Array.isArray(settings.selectedMeasureNames)) {
      setLocalSelectedMeasures(settings.selectedMeasureNames);
    }
  }, [settings.selectedMeasureNames]);

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
      setIdentifierList(newIdentifiers);
      setMeasureList(newMeasures);
      // If the item was selected in identifiers, move its selection to measures
      if (selectedIdentifiers.includes(item)) {
        updateSettings(atomId, {
          selectedIdentifiers: selectedIdentifiers.filter(id => id !== item),
        });
        setLocalSelectedMeasures(prev => [...prev, item]);
      }
      updateSettings(atomId, { identifiers: newIdentifiers, measures: newMeasures });
    } else if (source === 'measures' && destination === 'identifiers') {
      const newMeasures = measureList.filter(m => m !== item);
      const newIdentifiers = [...identifierList, item];
      setIdentifierList(newIdentifiers);
      setMeasureList(newMeasures);
      // If the item was selected in measures, move its selection to identifiers
      if (localSelectedMeasures.includes(item)) {
        setLocalSelectedMeasures(localSelectedMeasures.filter(m => m !== item));
      }
      updateSettings(atomId, { identifiers: newIdentifiers, measures: newMeasures });
    }
  };

  // ------------------------------
  // Toggle helpers
  // ------------------------------
  const toggleIdentifier = useCallback((identifier: string) => {
    const newSelected = selectedIdentifiers.includes(identifier)
      ? selectedIdentifiers.filter(id => id !== identifier)
      : [...selectedIdentifiers, identifier];
    updateSettings(atomId, { selectedIdentifiers: newSelected });
  }, [selectedIdentifiers, atomId, updateSettings]);

  const toggleMeasure = useCallback((measure: string) => {
    const isSelected = localSelectedMeasures.includes(measure);
    const newSelected = isSelected
      ? localSelectedMeasures.filter(m => m !== measure)
      : [...localSelectedMeasures, measure];
    setLocalSelectedMeasures(newSelected);
    // Persist selected measure names in settings so canvas dropdown updates but without altering measure rows
    updateSettings(atomId, { selectedMeasureNames: newSelected });
  }, [localSelectedMeasures, atomId, updateSettings, selectedIdentifiers]);

  const selectedAggregationMethods = Array.isArray(settings.selectedAggregationMethods) && settings.selectedAggregationMethods.length > 0
    ? settings.selectedAggregationMethods
    : ['Sum', 'Mean', 'Min', 'Max', 'Count', 'Median', 'Weighted Mean', 'Rank Percentile'];

  const toggleAggregationMethod = useCallback((agg: string) => {
    const newSelected = selectedAggregationMethods.includes(agg)
      ? selectedAggregationMethods.filter(a => a !== agg)
      : [...selectedAggregationMethods, agg];
    updateSettings(atomId, { selectedAggregationMethods: newSelected });
  }, [selectedAggregationMethods, atomId, updateSettings]);

  // Sample data for visualization
  const chartData = [
    { name: 'Group 1', value: 400 },
    { name: 'Group 2', value: 300 },
    { name: 'Group 3', value: 500 },
    { name: 'Group 4', value: 200 },
    { name: 'Group 5', value: 350 },
  ];

  // Default select all identifiers, measures, and aggregation methods
  useEffect(() => {
    if (fallbackIdentifiers.length > 0 && selectedIdentifiers.length === 0) {
      updateSettings(atomId, { selectedIdentifiers: fallbackIdentifiers });
    }
    if (fallbackMeasures.length > 0 && (!Array.isArray(settings.selectedMeasures) || settings.selectedMeasures.length === 0)) {
      updateSettings(atomId, { selectedMeasures: fallbackMeasures });
    }
    const allAggs = ['Sum', 'Mean', 'Min', 'Max', 'Count', 'Median', 'Weighted Mean', 'Rank Percentile'];
    if ((!Array.isArray(settings.selectedAggregationMethods) || settings.selectedAggregationMethods.length === 0)) {
      updateSettings(atomId, { selectedAggregationMethods: allAggs });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [fallbackIdentifiers, fallbackMeasures]);

  return (
    <Tabs value={tab} onValueChange={setTab} className="w-full h-full flex flex-col">
      <TabsList className="grid w-full grid-cols-3 bg-gray-50 mb-4 shrink-0 mx-4 mt-4 sticky top-0 z-10">
        <TabsTrigger value="input" className="flex items-center gap-2">
          
          Input Files
        </TabsTrigger>
        <TabsTrigger value="settings" className="flex items-center gap-2">
          
          Settings
        </TabsTrigger>
        <TabsTrigger value="exhibition" className="flex items-center gap-2">
          
          Exhibition
        </TabsTrigger>
      </TabsList>
      <div className="flex-1 overflow-auto px-4">

        {/* Input Files Tab */}
        <TabsContent value="input" className="space-y-4 h-full overflow-auto">
          <GroupByInputFiles atomId={atomId} />
        </TabsContent>

        {/* Settings Tab */}
        <TabsContent value="settings" className="space-y-4 h-full overflow-auto">
          <Card className="border-l-4 border-l-blue-500"
                onDragOver={handleDragOver}
                onDrop={(e) => handleDrop(e, 'identifiers')}>
            <CardHeader>
              <CardTitle className="text-lg">Identifiers Selection</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="grid grid-cols-2 gap-2 max-h-48 overflow-y-auto pr-2">
                {identifierList.map((identifier: string) => {
                  const isSelected = selectedIdentifiers.includes(identifier);
                  return (
                    <div
                       key={identifier}
                       title={identifier}
                       className={`flex items-center gap-2 p-2 rounded-lg transition-colors cursor-pointer select-none ${isSelected ? 'bg-blue-100 text-blue-900' : 'hover:bg-indigo-50 bg-white text-gray-900'}`}
                       onClick={() => toggleIdentifier(identifier)}
                       draggable
                       onDragStart={(e) => handleDragStart(e, { item: identifier, source: 'identifiers' })}
                     >
                      <Checkbox
                        id={identifier}
                        checked={isSelected}
                        onCheckedChange={() => toggleIdentifier(identifier)}
                        className="border-gray-300"
                      />
                      <Label htmlFor={identifier} className={`text-sm font-medium cursor-pointer truncate ${isSelected ? 'text-blue-900' : 'text-gray-900'}`}>
                        {identifier}
                      </Label>
                    </div>
                  );
                })}
              </div>
            </CardContent>
          </Card>
          <Card className="border-l-4 border-l-green-500"
                onDragOver={handleDragOver}
                onDrop={(e) => handleDrop(e, 'measures')}>
            <CardHeader>
              <CardTitle className="text-lg">Measures Selection</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="grid grid-cols-2 gap-2 max-h-48 overflow-y-auto pr-2">
                {measureList.map((measure: string) => {
                  const isSelected = localSelectedMeasures.includes(measure);
                  return (
                    <div
                       key={measure}
                       title={measure}
                       className={`flex items-center gap-2 p-2 rounded-lg transition-colors cursor-pointer select-none ${isSelected ? 'bg-green-100 text-green-900' : 'hover:bg-green-50 bg-white text-gray-900'}`}
                       onClick={() => toggleMeasure(measure)}
                       draggable
                       onDragStart={(e) => handleDragStart(e, { item: measure, source: 'measures' })}
                     >
                      <Checkbox id={measure} checked={isSelected} onCheckedChange={() => toggleMeasure(measure)} />
                      <Label htmlFor={measure} className={`text-sm font-medium cursor-pointer truncate ${isSelected ? 'text-green-900' : 'text-gray-900'}`}>
                        {measure}
                      </Label>
                    </div>
                  );
                })}
              </div>
            </CardContent>
          </Card>
          <Card className="border-l-4 border-l-orange-500">
            <CardHeader>
              <CardTitle className="text-lg">Aggregation Methods</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="grid grid-cols-2 gap-2 max-h-48 overflow-y-auto pr-2">
                {['Sum', 'Mean', 'Min', 'Max', 'Count', 'Median', 'Weighted Mean', 'Rank Percentile'].map((agg) => {
                  const isSelected = selectedAggregationMethods.includes(agg);
                  return (
                    <div key={agg} title={agg} className={`flex items-center gap-2 p-2 rounded-lg transition-colors cursor-pointer select-none ${isSelected ? 'bg-orange-100 text-orange-900' : 'hover:bg-orange-50 bg-white text-gray-900'}`}
                       onClick={() => toggleAggregationMethod(agg)}
                     >
                      <Checkbox id={agg} checked={isSelected} onCheckedChange={() => toggleAggregationMethod(agg)} />
                      <Label htmlFor={agg} className={`text-sm font-medium cursor-pointer truncate ${isSelected ? 'text-orange-900' : 'text-gray-900'}`}>{agg}</Label>
                    </div>
                  );
                })}
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        {/* Exhibition Tab */}
        <TabsContent value="exhibition" className="mt-0 h-full" forceMount>
          <GroupByExhibition settings={settings} />
        </TabsContent>
      </div>
    </Tabs>
  );
};

export default GroupByProperties;