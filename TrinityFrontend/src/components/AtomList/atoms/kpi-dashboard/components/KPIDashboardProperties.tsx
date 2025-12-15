import React from 'react';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Settings, Eye, BarChart3, Table2 } from 'lucide-react';
import KPIDashboardSettings from './KPIDashboardSettings';
import KPIDashboardExhibition from './KPIDashboardExhibition';
import KPIDashboardVisualisation from './KPIDashboardVisualisation';
import KPIDashboardTableConfig from './KPIDashboardTableConfig';
import type { KPIDashboardData, KPIDashboardSettings as KPISettings } from '../KPIDashboardAtom';

interface KPIDashboardPropertiesProps {
  data: KPIDashboardData | null;
  settings: KPISettings;
  onSettingsChange: (settings: Partial<KPISettings>) => void;
  onDataUpload: (data: KPIDashboardData) => void;
}

const KPIDashboardProperties: React.FC<KPIDashboardPropertiesProps> = ({
  data,
  settings,
  onSettingsChange,
  onDataUpload
}) => {
  return (
    <div className="w-80 h-full bg-background border-l border-border flex flex-col">
      <div className="p-3 border-b border-border">
        <h3 className="font-semibold text-foreground flex items-center space-x-2">
          <Settings className="w-4 h-4" />
          <span>Properties</span>
        </h3>
      </div>
      <div className="flex-1 overflow-hidden">
        <Tabs defaultValue="settings" className="h-full">
          <TabsList className="grid w-full grid-cols-4 m-2">
            <TabsTrigger value="settings" className="text-xs">
              <Settings className="w-3 h-3 mr-1" /> Settings
            </TabsTrigger>
            <TabsTrigger value="visualisation" className="text-xs">
              <BarChart3 className="w-3 h-3 mr-1" /> Charts
            </TabsTrigger>
            <TabsTrigger value="tables" className="text-xs">
              <Table2 className="w-3 h-3 mr-1" /> Tables
            </TabsTrigger>
            <TabsTrigger value="exhibition" className="text-xs">
              <Eye className="w-3 h-3 mr-1" /> Export
            </TabsTrigger>
          </TabsList>
          <div className="h-[calc(100%-60px)] overflow-y-auto">
            <TabsContent value="settings" className="h-full m-0 p-2" forceMount>
              <KPIDashboardSettings
                settings={settings}
                onSettingsChange={onSettingsChange}
                onDataUpload={onDataUpload}
                availableColumns={data?.headers || []}
              />
            </TabsContent>
            <TabsContent value="visualisation" className="h-full m-0 p-2" forceMount>
              <KPIDashboardVisualisation 
                data={data} 
                settings={settings}
                onSettingsChange={onSettingsChange}
                onDataUpload={onDataUpload}
              />
            </TabsContent>
            <TabsContent value="tables" className="h-full m-0 p-2" forceMount>
              <KPIDashboardTableConfig
                data={data}
                settings={settings}
                onSettingsChange={onSettingsChange}
              />
            </TabsContent>
            <TabsContent value="exhibition" className="h-full m-0 p-2" forceMount>
              <KPIDashboardExhibition data={data} />
            </TabsContent>
          </div>
        </Tabs>
      </div>
    </div>
  );
};

export default KPIDashboardProperties;
