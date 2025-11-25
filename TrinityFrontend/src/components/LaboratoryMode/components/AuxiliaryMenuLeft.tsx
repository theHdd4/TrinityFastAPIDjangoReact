import React from 'react';
import { Grid3X3 } from 'lucide-react';
import AtomLibrary from '@/components/AtomList/AtomLibrary';
import { useLaboratoryStore } from '../store/laboratoryStore';

interface Props {
  onAtomDragStart?: (e: React.DragEvent, atomId: string) => void;
}

const AuxiliaryMenuLeft: React.FC<Props> = ({ onAtomDragStart }) => {
  const open = useLaboratoryStore((state) => state.auxiliaryMenuLeftOpen);
  const setOpen = useLaboratoryStore((state) => state.setAuxiliaryMenuLeftOpen);

  if (!open) {
    return (
      <div className="bg-white border-r border-gray-200 transition-all duration-300 flex flex-col h-full w-12">
        <div className="p-3 border-b border-gray-200 flex items-center justify-between">
          <button
            onClick={() => setOpen(true)}
            className="inline-flex items-center justify-center p-1 h-8 w-8 rounded-md hover:bg-accent hover:text-accent-foreground"
            title="Open Atom List"
            data-atom-sidebar-toggle="true"
          >
            <Grid3X3 className="w-4 h-4" />
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
