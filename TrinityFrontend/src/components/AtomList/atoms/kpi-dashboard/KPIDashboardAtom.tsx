import React from 'react';
import { useLaboratoryStore } from '@/components/LaboratoryMode/store/laboratoryStore';
import KPIDashboardCanvas from './components/KPIDashboardCanvas';
import KPIDashboardProperties from './components/KPIDashboardProperties';

export interface KPIMetric {
  id: string;
  label: string;
  value: string | number;
  change?: number;
  unit?: string;
  subtitle?: string;
}

export interface KPIDashboardData {
  headers: string[];
  rows: any[];
  fileName: string;
  metrics: KPIMetric[];
}

export interface KPIDashboardSettings {
  title: string;
  metricColumns: string[];
  changeColumns: string[];
  insights: string;
}

interface KPIDashboardAtomProps {
  atomId: string;
}

const KPIDashboardAtom: React.FC<KPIDashboardAtomProps> = ({ atomId }) => {
  const atom = useLaboratoryStore(state => state.getAtom(atomId));
  const updateSettings = useLaboratoryStore(state => state.updateAtomSettings);
  
  // Get settings with proper fallback
  const settings: KPIDashboardSettings = React.useMemo(() => {
    return (atom?.settings as KPIDashboardSettings) || {
      title: 'KPI Dashboard',
      metricColumns: [],
      changeColumns: [],
      insights: ''
    };
  }, [atom?.settings]);

  // Get data from atom metadata or settings
  // If no data, KPIDashboardCanvas will use its built-in mockData
  const data: KPIDashboardData | null = React.useMemo(() => {
    // First check settings.data (where we store uploaded data)
    if ((atom?.settings as any)?.data) {
      return (atom.settings as any).data as KPIDashboardData;
    }
    // Then check metadata
    if (atom?.metadata && typeof atom.metadata === 'object') {
      const metadata = atom.metadata as any;
      if (metadata.data) {
        return metadata.data as KPIDashboardData;
      }
    }
    // Return null - KPIDashboardCanvas will use mockData by default
    return null;
  }, [atom?.metadata, atom?.settings]);

  const handleDataUpload = (uploadedData: KPIDashboardData) => {
    updateSettings(atomId, {
      ...settings,
      data: uploadedData
    });
  };

  const handleSettingsChange = (newSettings: Partial<KPIDashboardSettings>) => {
    updateSettings(atomId, {
      ...settings,
      ...newSettings
    });
  };

  // Always render the canvas - it will use mockData when data is null
  // Ensure it has proper dimensions and can render even if atom is not found yet
  return (
    <div className="w-full h-full min-h-[600px] bg-background relative">
      <KPIDashboardCanvas
        data={data}
        settings={settings}
        onDataUpload={handleDataUpload}
        onSettingsChange={handleSettingsChange}
      />
    </div>
  );
};

export default KPIDashboardAtom;
export { KPIDashboardProperties };

