import React, { useCallback, useEffect, useState } from 'react';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Upload, Settings, Eye } from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { CheckboxTemplate } from '@/templates/checkbox';
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

  // 🔧 CRITICAL FIX: Automatically switch to Exhibition tab when AI results are available
  useEffect(() => {
    const hasAIResults = settings.groupbyResults && 
                        settings.groupbyResults.unsaved_data && 
                        Array.isArray(settings.groupbyResults.unsaved_data) && 
                        settings.groupbyResults.unsaved_data.length > 0;
    
    if (hasAIResults) {
      console.log('🔄 AI results detected, switching to Exhibition tab');
      setTab('exhibition');
    }
  }, [settings.groupbyResults?.unsaved_data, settings.groupbyResults?.result_file]);

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

  // Default select identifiers with unique_count > 1, and all measures and aggregation methods
  useEffect(() => {
    if (fallbackIdentifiers.length > 0 && selectedIdentifiers.length === 0) {
      // Get identifiers with unique_count > 1
      const uniqueIdentifiers = fallbackIdentifiers.filter(identifier => {
        const colInfo = (settings.allColumns || []).find((col: any) => col.column === identifier);
        return colInfo && colInfo.unique_count > 1;
      });
      // If we found identifiers with unique_count > 1, use them, otherwise fallback to all identifiers
      const defaultIdentifiers = uniqueIdentifiers.length > 0 ? uniqueIdentifiers : fallbackIdentifiers;
      updateSettings(atomId, { selectedIdentifiers: defaultIdentifiers });
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
    <div className="h-full flex flex-col">
      <Tabs value={tab} onValueChange={setTab} className="flex-1 flex flex-col">
        <TabsList className="grid w-full grid-cols-3">
          <TabsTrigger value="input" className="text-xs font-medium">
            <Upload className="w-3 h-3 mr-1" />
            Input
          </TabsTrigger>
          <TabsTrigger value="settings" className="text-xs font-medium">
            <Settings className="w-3 h-3 mr-1" />
            Settings
          </TabsTrigger>
          <TabsTrigger value="exhibition" className="text-xs font-medium">
            <Eye className="w-3 h-3 mr-1" />
            Exhibition
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
                       className="cursor-pointer select-none"
                       onClick={() => toggleMeasure(measure)}
                       draggable
                       onDragStart={(e) => handleDragStart(e, { item: measure, source: 'measures' })}
                     >
                      <CheckboxTemplate
                        id={measure}
                        label={measure}
                        checked={isSelected}
                        onCheckedChange={() => toggleMeasure(measure)}
                      />
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
                    <div key={agg} title={agg} className="cursor-pointer select-none"
                       onClick={() => toggleAggregationMethod(agg)}
                     >
                      <CheckboxTemplate
                        id={agg}
                        label={agg}
                        checked={isSelected}
                        onCheckedChange={() => toggleAggregationMethod(agg)}
                      />
                    </div>
                  );
                })}
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        {/* Exhibition Tab */}
        <TabsContent value="exhibition" className="flex-1 mt-0" forceMount>
          <GroupByExhibition settings={settings} />
        </TabsContent>
      </Tabs>
    </div>
  );
};

export default GroupByProperties;