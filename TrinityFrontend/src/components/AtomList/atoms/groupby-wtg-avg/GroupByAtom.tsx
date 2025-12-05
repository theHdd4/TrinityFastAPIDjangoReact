import React from 'react';
import GroupByCanvas from './components/GroupByCanvas';
import GroupByProperties from './components/properties/GroupByProperties';

const GroupByAtom: React.FC<{ atomId: string }> = ({ atomId }) => {
  return (
    <div className="w-full h-full">
      <GroupByCanvas atomId={atomId} />
    </div>
  );
};

export { GroupByProperties };
export default GroupByAtom;