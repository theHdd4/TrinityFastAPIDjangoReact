import React, { useMemo } from 'react';
import ExploreCanvas from './components/ExploreCanvas';
import { useLaboratoryStore, ExploreData } from '@/components/LaboratoryMode/store/laboratoryStore';

interface ExploreAtomProps {
  atomId: string;
}

const ExploreAtom: React.FC<ExploreAtomProps> = ({ atomId }) => {
  const atom = useLaboratoryStore(state => state.getAtom(atomId));
  const data: ExploreData = useMemo(() => ({
    dimensions: [],
    measures: [],
    graphLayout: { numberOfGraphsInRow: 1, rows: 1 },
    chartType: 'line_chart',
    xAxis: '',
    yAxis: '',
    xAxisLabel: '',
    yAxisLabel: '',
    title: '',
    legendField: '',
    ...(atom?.settings?.data || {}),
  }), [atom?.settings?.data]);

  const isApplied = useMemo(() => atom?.settings?.data?.applied === true, [atom?.settings?.data?.applied]);

  return (
    <div className="w-full h-full">
      <ExploreCanvas
        data={data}
        isApplied={isApplied}
        onDataChange={(newData) => {
          const currentSettings = atom?.settings || {};
          useLaboratoryStore.getState().updateAtomSettings(atomId, {
            data: { ...(currentSettings.data || {}), ...newData },
          });
        }}
      />
    </div>
  );
};

export default ExploreAtom;