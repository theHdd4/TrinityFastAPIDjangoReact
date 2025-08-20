import React from 'react';
import { Input } from '@/components/ui/input';
import { useLaboratoryStore } from '@/components/LaboratoryMode/store/laboratoryStore';

interface Props {
  atomId: string;
}

const ExploreProperties: React.FC<Props> = ({ atomId }) => {
  const atom = useLaboratoryStore(state => state.getAtom(atomId));
  const updateSettings = useLaboratoryStore(state => state.updateAtomSettings);
  const dataSource = (atom?.settings as any)?.dataSource || '';

  return (
    <div className="p-4 space-y-4">
      <div>
        <label className="block text-sm text-gray-600 mb-1">Data Source</label>
        <Input
          value={dataSource}
          onChange={e => updateSettings(atomId, { dataSource: e.target.value })}
          placeholder="object_name.csv"
          className="text-sm"
        />
      </div>
    </div>
  );
};

export default ExploreProperties;
