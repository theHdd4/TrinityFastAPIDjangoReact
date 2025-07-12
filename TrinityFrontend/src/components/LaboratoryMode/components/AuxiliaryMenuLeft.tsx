import React, { useState } from 'react';
import { Grid3X3, ChevronLeft } from 'lucide-react';
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
            className="inline-flex items-center justify-center p-1 h-8 w-8 rounded-md hover:bg-accent hover:text-accent-foreground"
            title="Open Atom List"
          >
            <Grid3X3 className="w-4 h-4" />
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="relative">
      <div className="absolute top-2 right-2 z-10">
        <button
          onClick={() => setOpen(false)}
          className="p-1 hover:bg-gray-100 rounded"
          title="Collapse"
        >
          <ChevronLeft className="w-4 h-4 text-gray-500" />
        </button>
      </div>
      <AtomLibrary onAtomDragStart={onAtomDragStart} />
    </div>
  );
};

export default AuxiliaryMenuLeft;
