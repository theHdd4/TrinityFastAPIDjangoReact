import React, { useEffect, useState } from 'react';
import { useLaboratoryStore } from '@/components/LaboratoryMode/store/laboratoryStore';
import { EXPLORE_API } from '@/lib/api';

interface ExploreAtomProps {
  atomId: string;
}

const ExploreAtom: React.FC<ExploreAtomProps> = ({ atomId }) => {
  const atom = useLaboratoryStore(state => state.getAtom(atomId));
  const dataSource = atom?.settings?.dataSource as string | undefined;
  const [result, setResult] = useState<any>();

  useEffect(() => {
    const load = async () => {
      if (!dataSource) return;
      try {
        const res = await fetch(
          `${EXPLORE_API}/summary?object_name=${encodeURIComponent(dataSource)}`,
          { credentials: 'include' }
        );
        if (res.ok) {
          const data = await res.json();
          setResult(data);
        }
      } catch (err) {
        console.error('Explore request failed', err);
      }
    };
    load();
  }, [dataSource]);

  if (!dataSource) {
    return <div className="text-sm text-gray-500">No data source selected.</div>;
  }
  if (!result) {
    return <div className="text-sm text-gray-500">Loading...</div>;
  }
  return (
    <pre className="text-xs max-h-64 overflow-auto bg-gray-50 p-2 rounded">
      {JSON.stringify(result.summary, null, 2)}
    </pre>
  );
};

export default ExploreAtom;
