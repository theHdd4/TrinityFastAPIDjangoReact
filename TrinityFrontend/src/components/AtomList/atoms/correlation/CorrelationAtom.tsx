import React from 'react';
import { useLaboratoryStore, DEFAULT_CORRELATION_SETTINGS, CorrelationSettings } from '@/components/LaboratoryMode/store/laboratoryStore';
import CorrelationCanvas from './components/CorrelationCanvas';

interface Props {
  atomId: string;
}

const CorrelationAtom: React.FC<Props> = ({ atomId }) => {
  const atom = useLaboratoryStore(state => state.getAtom(atomId));
  const settings: CorrelationSettings = (atom?.settings as CorrelationSettings) || { ...DEFAULT_CORRELATION_SETTINGS };

  return (
    <div className="w-full h-full bg-white rounded-lg overflow-hidden flex flex-col">
      <CorrelationCanvas
        atomId={atomId}
        data={settings}
        onDataChange={(newData) => {
          const updateSettings = useLaboratoryStore.getState().updateAtomSettings;
          updateSettings(atomId, newData);
        }}
      />
    </div>
  );
};

export default CorrelationAtom;