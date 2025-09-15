import React from 'react';
import { Loader2 } from 'lucide-react';
import {
  useLaboratoryStore,
  DEFAULT_FEATURE_OVERVIEW_SETTINGS,
  FeatureOverviewSettings as SettingsType,
} from '@/components/LaboratoryMode/store/laboratoryStore';
import FeatureOverviewCanvas from './components/FeatureOverviewCanvas';

interface Props {
  atomId: string;
}

const FeatureOverviewAtom: React.FC<Props> = ({ atomId }) => {
  const atom = useLaboratoryStore(state => state.getAtom(atomId));
  const updateSettings = useLaboratoryStore(state => state.updateAtomSettings);
  const settings: SettingsType = (atom?.settings as SettingsType) || { ...DEFAULT_FEATURE_OVERVIEW_SETTINGS };

  return (
    <div className="w-full h-full bg-white rounded-lg overflow-hidden flex flex-col">
      {settings.isLoading ? (
        <div className="flex-grow flex items-center justify-center">
          <Loader2 className="w-6 h-6 animate-spin text-gray-500" />
        </div>
      ) : (
        <FeatureOverviewCanvas
          settings={settings}
          onUpdateSettings={s => updateSettings(atomId, s)}
          atomId={atomId}
        />
      )}
    </div>
  );
};

export default FeatureOverviewAtom;
