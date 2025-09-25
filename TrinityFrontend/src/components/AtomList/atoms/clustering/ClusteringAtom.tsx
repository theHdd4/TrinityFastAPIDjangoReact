import React from 'react';
import { useLaboratoryStore, DEFAULT_CLUSTERING_SETTINGS, ClusteringSettings } from '@/components/LaboratoryMode/store/laboratoryStore';
import ClusteringCanvas from './components/ClusteringCanvas';

interface Props {
  atomId: string;
}

const ClusteringAtom: React.FC<Props> = ({ atomId }) => {
  const atom = useLaboratoryStore(state => state.getAtom(atomId));
  const updateSettings = useLaboratoryStore(state => state.updateAtomSettings);
  const settings: ClusteringSettings = (atom?.settings as ClusteringSettings) || { ...DEFAULT_CLUSTERING_SETTINGS };

  return (
    <div className="w-full h-full bg-white rounded-lg overflow-hidden flex flex-col">
      <ClusteringCanvas
        atomId={atomId}
        settings={settings}
        onSettingsChange={(newSettings) => {
          updateSettings(atomId, newSettings);
        }}
      />
    </div>
  );
};

export default ClusteringAtom;