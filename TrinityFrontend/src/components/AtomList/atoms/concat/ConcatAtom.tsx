import React from 'react';
import { useLaboratoryStore, DEFAULT_CONCAT_SETTINGS, ConcatSettings } from '@/components/LaboratoryMode/store/laboratoryStore';
import ConcatCanvas from './components/ConcatCanvas';

interface Props {
  atomId: string;
}

const ConcatAtom: React.FC<Props> = ({ atomId }) => {
  const atom = useLaboratoryStore(state => state.getAtom(atomId));
  const updateSettings = useLaboratoryStore(state => state.updateAtomSettings);
  const settings: ConcatSettings = (atom?.settings as ConcatSettings) || { ...DEFAULT_CONCAT_SETTINGS };

  return (
    <div className="w-full h-full bg-white rounded-lg overflow-hidden flex flex-col">
      <ConcatCanvas
        concatId={settings.concatId}
        resultFilePath={settings.concatResults?.result_file}
        file1={settings.file1}
        file2={settings.file2}
        direction={settings.direction}
      />
    </div>
  );
};

export default ConcatAtom;