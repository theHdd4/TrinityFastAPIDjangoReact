import React, { useState } from 'react';
import { Grid3X3 } from 'lucide-react';
import AtomLibrary from '@/components/AtomList/AtomLibrary';

interface Props {
  onAtomDragStart?: (e: React.DragEvent, atomId: string) => void;
}

const AuxiliaryMenuLeft: React.FC<Props> = ({ onAtomDragStart }) => {
  const [open, setOpen] = useState(true);

  if (!open) {
    return (
      <div className="bg-white border-r border-gray-200 transition-all duration-300 flex flex-col h-full w-12">
        <div className="p-3 border-b border-gray-200 flex items-center justify-between">
          <button
            onClick={() => setOpen(true)}
            className="group relative inline-flex items-center justify-center p-1 h-8 w-8 rounded-md hover:bg-accent hover:text-accent-foreground"
            title="Open Atom List"
            data-atom-sidebar-toggle="true"
          >
            <Grid3X3 className="w-4 h-4" />
            <span className="pointer-events-none absolute right-full mr-2 px-2 py-1 bg-popover text-popover-foreground text-xs rounded opacity-0 group-hover:opacity-100 transition-opacity whitespace-nowrap z-50 shadow-lg border border-border">
              Open Atom List
            </span>
          </button>
        </div>
      </div>
    );
  }

  return (
    <AtomLibrary
      onAtomDragStart={onAtomDragStart}
      onCollapse={() => setOpen(false)}
    />
  );
};

export default AuxiliaryMenuLeft;
