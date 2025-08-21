import React from 'react';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Upload, Settings, Eye } from 'lucide-react';
import ExploreInput from './ExploreInput';
import ExploreSettings from './ExploreSettings';
import ExploreExhibition from './ExploreExhibition';
import ErrorBoundary from '@/components/ErrorBoundary';
import { ExploreData, ExploreSettings as ExploreSettingsType } from '../ExploreAtom';

interface ExplorePropertiesProps {
  data: ExploreData;
  settings: ExploreSettingsType;
  onDataChange: (data: Partial<ExploreData>) => void;
  onSettingsChange: (settings: Partial<ExploreSettingsType>) => void;
  onDataUpload: (data: any, fileId: string) => void;
  onApply?: (config: any) => void;
  chartData?: any; // Add chart data prop
}

const ExploreProperties: React.FC<ExplorePropertiesProps> = ({
  data,
  settings,
  onDataChange,
  onSettingsChange,
  onDataUpload,
  onApply,
  chartData
}) => {
  return (
    <div className="w-80 h-full bg-background border-l border-border flex flex-col">
      <div className="flex-1 overflow-hidden">
        <Tabs defaultValue="input" className="h-full">
          <TabsList className="grid w-full grid-cols-3 m-2">
            <TabsTrigger value="input" className="text-xs">
              <Upload className="w-3 h-3 mr-1" /> Input
            </TabsTrigger>
            <TabsTrigger value="settings" className="text-xs">
              <Settings className="w-3 h-3 mr-1" /> Settings
            </TabsTrigger>
            <TabsTrigger value="exhibition" className="text-xs">
              <Eye className="w-3 h-3 mr-1" /> Exhibition
            </TabsTrigger>
          </TabsList>
          <div className="h-[calc(100%-60px)] overflow-y-auto">
            <TabsContent value="input" className="h-full m-0 p-2" forceMount>
              <ExploreInput 
                data={data}
                settings={settings}
                onDataChange={onDataChange}
                onDataUpload={onDataUpload}
              />
            </TabsContent>
            <TabsContent value="settings" className="h-full m-0 p-2" forceMount>
              <ErrorBoundary>
                <ExploreSettings 
                  data={data}
                  settings={settings}
                  onDataChange={onDataChange}
                  onApply={onApply}
                />
              </ErrorBoundary>
            </TabsContent>
            <TabsContent value="exhibition" className="h-full m-0 p-2" forceMount>
              <ExploreExhibition data={data} chartData={chartData} />
            </TabsContent>
          </div>
        </Tabs>
      </div>
    </div>
  );
};

export default ExploreProperties;