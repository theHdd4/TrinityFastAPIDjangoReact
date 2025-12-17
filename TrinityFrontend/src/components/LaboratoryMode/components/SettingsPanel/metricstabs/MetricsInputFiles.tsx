import React from 'react';
import { Card } from '@/components/ui/card';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Switch } from '@/components/ui/switch';
import { useLaboratoryStore } from '../../../store/laboratoryStore';

interface MetricsInputFilesProps {
  cardId?: string;
}

const MetricsInputFiles: React.FC<MetricsInputFilesProps> = ({ cardId }) => {
  const metricsInputs = useLaboratoryStore(state => state.metricsInputs);
  const updateMetricsInputs = useLaboratoryStore(state => state.updateMetricsInputs);
  const openMetricGuidedFlow = useLaboratoryStore(state => state.openMetricGuidedFlow);
  const closeMetricGuidedFlow = useLaboratoryStore(state => state.closeMetricGuidedFlow);
  const isMetricGuidedFlowOpen = useLaboratoryStore(state => state.isMetricGuidedFlowOpen);
  const getAtom = useLaboratoryStore(state => state.getAtom);
  const selectedDataSource = metricsInputs.dataSource;

  const handleFrameChange = (val: string) => {
    if (!val.endsWith('.arrow')) {
      val += '.arrow';
    }
    updateMetricsInputs({ dataSource: val });
  };

  const handleGuidedModeToggle = (checked: boolean) => {
    const { contextCardId, contextAtomId } = metricsInputs;
    const currentAtom = contextAtomId ? getAtom(contextAtomId) : undefined;

    console.log('[MetricGuidedFlow] Guided mode toggle changed in MetricsInputFiles', {
      checked,
      contextCardId: contextCardId || null,
      contextAtomId: contextAtomId || null,
      currentAtom: currentAtom
        ? {
            id: currentAtom.id,
            atomId: (currentAtom as any).atomId,
            title: (currentAtom as any).title,
          }
        : null,
    });

    if (checked) {
      openMetricGuidedFlow();
    } else {
      closeMetricGuidedFlow();
    }
  };

  return (
    <div className="space-y-4 px-2 pb-2">
      <style jsx global>{`
        .custom-scrollbar::-webkit-scrollbar {
          width: 6px;
          height: 6px;
        }
        .custom-scrollbar::-webkit-scrollbar-track {
          background: #f1f1f1;
          border-radius: 10px;
        }
        .custom-scrollbar::-webkit-scrollbar-thumb {
          background: #cbd5e0;
          border-radius: 10px;
        }
        .custom-scrollbar::-webkit-scrollbar-thumb:hover {
          background: #a0aec0;
        }
      `}</style>
      <Card className="p-4 space-y-4">
        <div className="space-y-3">
          <label className="text-sm font-medium text-gray-700 block">Data Source</label>
          <Select value={selectedDataSource} onValueChange={handleFrameChange}>
            <SelectTrigger className="bg-white border-gray-300">
              <SelectValue placeholder="Choose a saved dataframe..." />
            </SelectTrigger>
            <SelectContent>
              {(Array.isArray(frames) ? frames : []).map(f => (
                <SelectItem key={f.object_name} value={f.object_name}>
                  {f.csv_name.split('/').pop()}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        <div className="pt-3 border-t border-gray-100 flex items-center justify-between">
          <span className="text-xs font-medium text-gray-700">Guided mode</span>
          <Switch
            id="metrics-guidedmode-toggle"
            aria-label="guidedmode"
            checked={isMetricGuidedFlowOpen}
            onCheckedChange={handleGuidedModeToggle}
          />
        </div>
      </Card>
    </div>
  );
};

export default MetricsInputFiles;
