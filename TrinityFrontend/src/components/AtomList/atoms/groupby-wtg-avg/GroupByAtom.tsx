import React from 'react';
import GroupByCanvas from './components/GroupByCanvas';
import GroupByProperties from './components/properties/GroupByProperties';

const GroupByAtom: React.FC<{ atomId: string }> = ({ atomId }) => {
  return (
    <div className="w-full h-full bg-white rounded-lg border border-gray-200">
      <div className="p-4 h-full">
        <GroupByCanvas atomId={atomId} />
      </div>
    </div>
  );
};

export { GroupByProperties };
export default GroupByAtom;