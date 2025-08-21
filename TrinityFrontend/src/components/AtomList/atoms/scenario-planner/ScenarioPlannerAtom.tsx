import React from 'react';
import { useLaboratoryStore, DEFAULT_SCENARIO_PLANNER_SETTINGS, ScenarioPlannerSettings } from '@/components/LaboratoryMode/store/laboratoryStore';
import { ScenarioPlannerCanvas } from './components/ScenarioPlannerCanvas';

interface Props {
  atomId: string;
}

const ScenarioPlannerAtom: React.FC<Props> = ({ atomId }) => {
  // Use the same pattern as ClusteringAtom - direct store subscription
  const atom = useLaboratoryStore(state => state.getAtom(atomId));
  const updateSettings = useLaboratoryStore(state => state.updateAtomSettings);
  const settings: ScenarioPlannerSettings = (atom?.settings as ScenarioPlannerSettings) || { ...DEFAULT_SCENARIO_PLANNER_SETTINGS };

  return (
    <div className="w-full h-full bg-white rounded-lg overflow-hidden flex flex-col">
      <ScenarioPlannerCanvas
        atomId={atomId}
        settings={settings}
        onSettingsChange={(newSettings) => {
          updateSettings(atomId, newSettings);
        }}
      />
    </div>
  );
};

export default ScenarioPlannerAtom;