"use client";

import React from 'react';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Button } from '@/components/ui/button';
import { useToast } from '@/components/ui/use-toast';
import { Upload, Settings, Eye } from 'lucide-react';
import ExploreInput from '../ExploreInput';
import ExploreSettings from '../ExploreSettings';
import ExploreExhibition from '../ExploreExhibition';
import ErrorBoundary from '@/components/ErrorBoundary';
import {
  useLaboratoryStore,
  DEFAULT_EXPLORE_SETTINGS,
  DEFAULT_EXPLORE_DATA,
  ExploreSettings as ExploreSettingsType,
  ExploreData,
} from '@/components/LaboratoryMode/store/laboratoryStore';

interface Props {
  atomId: string;
}

const ExploreProperties: React.FC<Props> = ({ atomId }) => {
  const atom = useLaboratoryStore(state => state.getAtom(atomId));
  const updateSettings = useLaboratoryStore(state => state.updateAtomSettings);
  const { toast } = useToast();

  // Safely extract settings data to avoid circular reference issues
  const atomSettings = atom?.settings;
  const rawData = atomSettings?.data as ExploreData | undefined;
  const rawSettings = atomSettings?.settings as ExploreSettingsType | undefined;
  
  // Extract array values first to avoid multiple property accesses
  const rawDimensions = rawData?.dimensions;
  const rawMeasures = rawData?.measures;
  const rawAllColumns = rawData?.allColumns;
  const rawNumericalColumns = rawData?.numericalColumns;
  const rawColumnSummary = rawData?.columnSummary;
  const rawAvailableDimensions = rawData?.availableDimensions;
  const rawAvailableMeasures = rawData?.availableMeasures;
  const rawAvailableIdentifiers = rawData?.availableIdentifiers;
  const rawFallbackDimensions = rawData?.fallbackDimensions;
  const rawFallbackMeasures = rawData?.fallbackMeasures;
  
  // Ensure all array properties are properly initialized to avoid undefined access errors
  const data: ExploreData = {
    ...DEFAULT_EXPLORE_DATA,
    ...(rawData || {}),
    dimensions: Array.isArray(rawDimensions) ? rawDimensions : (rawDimensions || DEFAULT_EXPLORE_DATA.dimensions),
    measures: Array.isArray(rawMeasures) ? rawMeasures : (rawMeasures || DEFAULT_EXPLORE_DATA.measures),
    allColumns: Array.isArray(rawAllColumns) ? rawAllColumns : (rawAllColumns || []),
    numericalColumns: Array.isArray(rawNumericalColumns) ? rawNumericalColumns : (rawNumericalColumns || []),
    columnSummary: Array.isArray(rawColumnSummary) ? rawColumnSummary : (rawColumnSummary || []),
    availableDimensions: Array.isArray(rawAvailableDimensions) ? rawAvailableDimensions : (rawAvailableDimensions || []),
    availableMeasures: Array.isArray(rawAvailableMeasures) ? rawAvailableMeasures : (rawAvailableMeasures || []),
    availableIdentifiers: Array.isArray(rawAvailableIdentifiers) ? rawAvailableIdentifiers : (rawAvailableIdentifiers || []),
    fallbackDimensions: Array.isArray(rawFallbackDimensions) ? rawFallbackDimensions : (rawFallbackDimensions || []),
    fallbackMeasures: Array.isArray(rawFallbackMeasures) ? rawFallbackMeasures : (rawFallbackMeasures || []),
  };
  
  const settings: ExploreSettingsType = {
    ...DEFAULT_EXPLORE_SETTINGS,
    ...(rawSettings || {}),
  };
  const chartData = atomSettings?.chartData;

  const handleDataChange = (newData: Partial<ExploreData>) => {
    updateSettings(atomId, {
      data: { ...data, ...newData },
    });
  };

  const handleDataUpload = (summary: any, fileId: string) => {
    updateSettings(atomId, {
      data: { ...data, columnSummary: summary, dataframe: fileId },
    });
  };

  const handleApply = (config?: any) => {
    updateSettings(atomId, {
      data: { ...data, ...(config || {}), applied: true },
    });
  };

  return (
    <div className="w-80 h-full bg-background border-l border-border flex flex-col">
      <div className="flex-1 overflow-hidden">
        <Tabs defaultValue="input" className="flex-1 flex flex-col">
          <TabsList className="grid w-full grid-cols-3">
            <TabsTrigger value="input" className="text-xs font-medium">
              <Upload className="w-3 h-3 mr-1" /> Input
            </TabsTrigger>
            <TabsTrigger value="settings" className="text-xs font-medium">
              <Settings className="w-3 h-3 mr-1" /> Settings
            </TabsTrigger>
            <TabsTrigger value="exhibition" className="text-xs font-medium">
              <Eye className="w-3 h-3 mr-1" /> Exhibition
            </TabsTrigger>
          </TabsList>
          <TabsContent value="input" className="flex-1 mt-0" forceMount>
            <ExploreInput
              data={data}
              settings={settings}
              onDataChange={handleDataChange}
              onDataUpload={handleDataUpload}
            />
          </TabsContent>
          <TabsContent value="settings" className="flex-1 mt-0" forceMount>
            <ErrorBoundary>
              <ExploreSettings
                data={data}
                settings={settings}
                onDataChange={handleDataChange}
                onApply={() => handleApply()}
              />
            </ErrorBoundary>
          </TabsContent>
          <TabsContent value="exhibition" className="flex-1 mt-0" forceMount>
            <ExploreExhibition data={data} chartData={chartData} />
          </TabsContent>
        </Tabs>
      </div>
      <div className="p-2 border-t">
        <Button
          className="w-full"
          onClick={() => {
            if (data.dataframe) {
              handleApply();
            } else {
              toast({
                title: 'Select a dataframe',
                description: 'Choose a dataframe before exploring',
              });
            }
          }}
        >
          Explore
        </Button>
      </div>
    </div>
  );
};

export default ExploreProperties;
