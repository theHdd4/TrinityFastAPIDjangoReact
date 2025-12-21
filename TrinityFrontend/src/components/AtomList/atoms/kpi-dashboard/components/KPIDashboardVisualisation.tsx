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
  // #region agent log
  fetch('http://127.0.0.1:7242/ingest/c16dc138-1b27-4dba-8d9b-764693f664f3',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'KPIDashboardVisualisation.tsx:12',message:'KPIDashboardVisualisation render',data:{onDataUploadType:typeof onDataUpload,onDataUploadIsFunc:typeof onDataUpload==='function'},timestamp:Date.now(),sessionId:'debug-session',runId:'run2',hypothesisId:'A'})}).catch(()=>{});
  // #endregion
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
