import React, { useState } from 'react';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Settings, Eye, BarChart3, Table2 } from 'lucide-react';
import { useLaboratoryStore } from '@/components/LaboratoryMode/store/laboratoryStore';
import KPIDashboardSettings from '../KPIDashboardSettings';
import KPIDashboardExhibition from '../KPIDashboardExhibition';
import KPIDashboardVisualisation from '../KPIDashboardVisualisation';
import KPIDashboardTableConfig from '../KPIDashboardTableConfig';
import type { KPIDashboardData, KPIDashboardSettings as KPISettings } from '../../KPIDashboardAtom';

interface KPIDashboardPropertiesProps {
  atomId: string;
}

const KPIDashboardProperties: React.FC<KPIDashboardPropertiesProps> = ({ atomId }) => {
  const atom = useLaboratoryStore(state => state.getAtom(atomId));
  const updateSettings = useLaboratoryStore(state => state.updateAtomSettings);
  const [tab, setTab] = useState<'settings' | 'visualisation' | 'tables' | 'exhibition'>('settings');

  // Get settings with proper fallback
  const settings: KPISettings = React.useMemo(() => {
    return (atom?.settings as KPISettings) || {
      title: 'KPI Dashboard',
      metricColumns: [],
      changeColumns: [],
      insights: ''
    };
  }, [atom?.settings]);

  // Get data from atom metadata or settings
  const data: KPIDashboardData | null = React.useMemo(() => {
    if (atom?.metadata && typeof atom.metadata === 'object') {
      const metadata = atom.metadata as any;
      if (metadata.data) {
        return metadata.data as KPIDashboardData;
      }
    }
    // Also check if data is in settings
    if ((atom?.settings as any)?.data) {
      return (atom.settings as any).data as KPIDashboardData;
    }
    return null;
  }, [atom?.metadata, atom?.settings]);

  const handleSettingsChange = React.useCallback(
    (newSettings: Partial<KPISettings>) => {
      updateSettings(atomId, {
        ...settings,
        ...newSettings
      });
    },
    [atomId, settings, updateSettings]
  );

  const handleDataUpload = React.useCallback(
    (uploadedData: KPIDashboardData) => {
      // #region agent log
      fetch('http://127.0.0.1:7242/ingest/c16dc138-1b27-4dba-8d9b-764693f664f3',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'KPIDashboardProperties.tsx:55',message:'handleDataUpload called',data:{atomId,hasHeaders:!!uploadedData.headers,hasRows:!!uploadedData.rows,fileName:uploadedData.fileName},timestamp:Date.now(),sessionId:'debug-session',runId:'post-fix',hypothesisId:'FIX'})}).catch(()=>{});
      // #endregion
      updateSettings(atomId, {
        ...settings,
        data: uploadedData
      });
    },
    [atomId, settings, updateSettings]
  );

  if (!atom) {
    return (
      <div className="w-full h-full flex items-center justify-center p-6">
        <div className="text-center">
          <div className="w-16 h-16 bg-blue-100 rounded-full flex items-center justify-center mx-auto mb-4">
            <span className="text-2xl">📊</span>
          </div>
          <h3 className="font-semibold text-gray-900 mb-2">No KPI Data</h3>
          <p className="text-sm text-gray-600">The KPI Dashboard atom needs to be configured first.</p>
        </div>
      </div>
    );
  }

  return (
    <div className="h-full flex flex-col">
      <Tabs value={tab} onValueChange={value => setTab(value as typeof tab)} className="flex-1 flex flex-col">
        <TabsList className="grid w-full grid-cols-4 m-2">
          <TabsTrigger value="settings" className="text-xs font-medium">
            <Settings className="w-3 h-3 mr-1" />
            Settings
          </TabsTrigger>
          <TabsTrigger value="visualisation" className="text-xs font-medium">
            <BarChart3 className="w-3 h-3 mr-1" />
            Charts
          </TabsTrigger>
          <TabsTrigger value="tables" className="text-xs font-medium">
            <Table2 className="w-3 h-3 mr-1" />
            Tables
          </TabsTrigger>
          <TabsTrigger value="exhibition" className="text-xs font-medium">
            <Eye className="w-3 h-3 mr-1" />
            Export
          </TabsTrigger>
        </TabsList>

        <TabsContent value="settings" className="flex-1 mt-0 overflow-y-auto" forceMount>
          <KPIDashboardSettings
            settings={settings}
            onSettingsChange={handleSettingsChange}
            onDataUpload={handleDataUpload}
            availableColumns={data?.headers || []}
          />
        </TabsContent>

        <TabsContent value="visualisation" className="flex-1 mt-0 overflow-y-auto" forceMount>
          <KPIDashboardVisualisation 
            data={data} 
            settings={settings}
            onSettingsChange={handleSettingsChange}
            onDataUpload={handleDataUpload}
          />
        </TabsContent>

        <TabsContent value="tables" className="flex-1 mt-0 overflow-y-auto" forceMount>
          <KPIDashboardTableConfig
            data={data}
            settings={settings}
            onSettingsChange={handleSettingsChange}
          />
        </TabsContent>

        <TabsContent value="exhibition" className="flex-1 mt-0 overflow-y-auto" forceMount>
          <KPIDashboardExhibition data={data} />
        </TabsContent>
      </Tabs>
    </div>
  );
};

export default KPIDashboardProperties;


