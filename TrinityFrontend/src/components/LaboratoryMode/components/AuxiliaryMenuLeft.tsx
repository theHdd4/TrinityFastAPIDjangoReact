import React from 'react';
import { Grid3X3, List, GalleryHorizontal } from 'lucide-react';
import AtomLibrary from '@/components/AtomList/AtomLibrary';
import ExhibitionPanel from './ExhibitionPanel';
import { useLaboratoryStore } from '../store/laboratoryStore';

interface Props {
  onAtomDragStart?: (e: React.DragEvent, atomId: string) => void;
  active?: 'settings' | 'frames' | 'help' | 'trinity' | 'exhibition' | null;
  onActiveChange?: (
    active: 'settings' | 'frames' | 'help' | 'trinity' | 'exhibition' | null,
  ) => void;
  isExhibitionOpen?: boolean;
  setIsExhibitionOpen?: (open: boolean) => void;
  canEdit?: boolean;
  showFloatingNavigationList?: boolean;
  setShowFloatingNavigationList?: (show: boolean) => void;
}

const AuxiliaryMenuLeft: React.FC<Props> = ({ 
  onAtomDragStart,
  active,
  onActiveChange,
  isExhibitionOpen = false,
  setIsExhibitionOpen,
  canEdit = true,
  showFloatingNavigationList = true,
  setShowFloatingNavigationList
}) => {
  const open = useLaboratoryStore((state) => state.auxiliaryMenuLeftOpen);
  const setOpen = useLaboratoryStore((state) => state.setAuxiliaryMenuLeftOpen);

  const handleAtomLibraryToggle = () => {
    if (!open) {
      // Opening AtomLibrary - close Exhibition if open
      if (isExhibitionOpen) {
        setIsExhibitionOpen?.(false);
      }
      setOpen(true);
    } else {
      setOpen(false);
    }
  };

  const openExhibition = () => {
    if (isExhibitionOpen) {
      // Closing Exhibition
      setIsExhibitionOpen?.(false);
    } else {
      // Opening Exhibition - close AtomLibrary if open
      if (open) {
        setOpen(false);
      }
      setIsExhibitionOpen?.(true);
    }
  };

  return (
    <div className="relative z-30 flex h-full">
      {/* Icons Column - Always visible and stays on the left */}
      <div className="bg-white border-r border-gray-200 transition-all duration-300 flex flex-col h-full w-12 flex-shrink-0 relative z-50">
        <div className="p-3 border-b border-gray-200 flex items-center justify-center">
          <button
            onClick={handleAtomLibraryToggle}
            className={`w-9 h-9 rounded-lg hover:bg-muted transition-all group relative hover:scale-105 hover:shadow-lg flex items-center justify-center ${
              open ? 'bg-muted text-foreground' : ''
            }`}
            title="Open Atom List"
            data-atom-sidebar-toggle="true"
            type="button"
          >
            <Grid3X3 className="w-3.5 h-3.5" />
            <span className="absolute left-full ml-2 px-2 py-1 bg-popover text-popover-foreground text-xs rounded opacity-0 group-hover:opacity-100 transition-opacity whitespace-nowrap z-[100] pointer-events-none shadow-lg border border-border">
              Atom List
            </span>
          </button>
        </div>
        {/* Navigation List Toggle */}
        {setShowFloatingNavigationList && (
          <div className="p-3 border-b border-gray-200 flex items-center justify-center">
            <button
              onClick={() => canEdit && setShowFloatingNavigationList(!showFloatingNavigationList)}
              disabled={!canEdit}
              className={`w-9 h-9 rounded-lg hover:bg-muted transition-all group relative hover:scale-105 hover:shadow-lg flex items-center justify-center ${
                !canEdit ? 'opacity-50 cursor-not-allowed' : showFloatingNavigationList ? 'bg-muted text-foreground' : ''
              }`}
              title={showFloatingNavigationList ? 'Hide Navigation List' : 'Show Navigation List'}
              type="button"
            >
              <List className="w-3.5 h-3.5" />
              <span className="absolute left-full ml-2 px-2 py-1 bg-popover text-popover-foreground text-xs rounded opacity-0 group-hover:opacity-100 transition-opacity whitespace-nowrap z-[100] pointer-events-none shadow-lg border border-border">
                {showFloatingNavigationList ? 'Hide' : 'Show'} Navigation List
              </span>
            </button>
          </div>
        )}
        {/* Exhibition */}
        <div className="p-3 border-b border-gray-200 flex items-center justify-center">
          <button
            onClick={openExhibition}
            className={`w-9 h-9 rounded-lg hover:bg-muted transition-all group relative hover:scale-105 hover:shadow-lg flex items-center justify-center ${
              isExhibitionOpen ? 'bg-muted text-foreground' : ''
            }`}
            title="Exhibition"
            data-exhibition-panel-toggle="true"
            type="button"
          >
            <GalleryHorizontal className="w-3.5 h-3.5 text-gray-600" />
            <span className="absolute left-full ml-2 px-2 py-1 bg-popover text-popover-foreground text-xs rounded opacity-0 group-hover:opacity-100 transition-opacity whitespace-nowrap z-[100] pointer-events-none shadow-lg border border-border">
              Exhibition
            </span>
          </button>
        </div>
      </div>

      {/* AtomLibrary - Shows when open and Exhibition is not active */}
      {open && !isExhibitionOpen && (
        <div className="relative z-30">
          <AtomLibrary
            onAtomDragStart={onAtomDragStart}
            onCollapse={() => setOpen(false)}
          />
        </div>
      )}

      {/* Exhibition Panel - Shows when active and AtomLibrary is not open */}
      {isExhibitionOpen && !open && (
        <div className="relative z-30">
          <ExhibitionPanel onToggle={() => setIsExhibitionOpen?.(false)} />
        </div>
      )}
    </div>
  );
};

export default AuxiliaryMenuLeft;
