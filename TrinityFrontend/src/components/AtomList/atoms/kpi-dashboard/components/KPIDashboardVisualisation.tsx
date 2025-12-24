import React from 'react';
import KPIDashboardChartConfig from './KPIDashboardChartConfig';
import type { KPIDashboardData, KPIDashboardSettings } from '../KPIDashboardAtom';

interface KPIDashboardVisualisationProps {
  data: KPIDashboardData | null;
  settings: KPIDashboardSettings;
  onSettingsChange: (settings: Partial<KPIDashboardSettings>) => void;
  onDataUpload: (data: KPIDashboardData) => void;
}

const KPIDashboardVisualisation: React.FC<KPIDashboardVisualisationProps> = ({ 
  data, 
  settings, 
  onSettingsChange,
  onDataUpload
}) => {
  return (
    <div className="h-full overflow-y-auto">
      <KPIDashboardChartConfig
        data={data}
        settings={settings}
        onSettingsChange={onSettingsChange}
        onDataUpload={onDataUpload}
      />
    </div>
  );
};

export default KPIDashboardVisualisation;
