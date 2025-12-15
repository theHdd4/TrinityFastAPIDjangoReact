import React from 'react';
import KPIDashboardChartConfig from './KPIDashboardChartConfig';
import type { KPIDashboardData, KPIDashboardSettings } from '../KPIDashboardAtom';

interface KPIDashboardVisualisationProps {
  data: KPIDashboardData | null;
  settings: KPIDashboardSettings;
  onSettingsChange: (settings: Partial<KPIDashboardSettings>) => void;
}

const KPIDashboardVisualisation: React.FC<KPIDashboardVisualisationProps> = ({ 
  data, 
  settings, 
  onSettingsChange 
}) => {
  return (
    <div className="h-full overflow-y-auto">
      <KPIDashboardChartConfig
        data={data}
        settings={settings}
        onSettingsChange={onSettingsChange}
      />
    </div>
  );
};

export default KPIDashboardVisualisation;
