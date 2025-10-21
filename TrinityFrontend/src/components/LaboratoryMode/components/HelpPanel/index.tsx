import React from 'react';
import { Button } from '@/components/ui/button';
import { ChevronRight } from 'lucide-react';
import { useLaboratoryStore } from '../../store/laboratoryStore';
import DataUploadValidateHelp from '@/components/AtomList/atoms/data-upload-validate/components/help/DataUploadValidateHelp';
import ColumnClassifierHelp from '@/components/AtomList/atoms/column-classifier/components/help/ColumnClassifierHelp';

interface HelpPanelProps {
  isCollapsed: boolean;
  onToggle: () => void;
  selectedAtomId?: string;
  selectedCardId?: string;
}

const HelpPanel: React.FC<HelpPanelProps> = ({
  isCollapsed,
  onToggle,
  selectedAtomId,
  selectedCardId,
}) => {
  const atom = useLaboratoryStore((state) =>
    selectedAtomId ? state.getAtom(selectedAtomId) : undefined
  );
  return (
    <div
      className={`bg-white border-l border-gray-200 transition-all duration-300 flex flex-col h-full ${
        isCollapsed ? 'w-12' : 'w-80'
      }`}
    >
      {/* Toggle / Header */}
      <div className="p-3 border-b border-gray-200 flex items-center justify-between">
        {!isCollapsed && (
          <h3 className="font-semibold text-gray-900 flex items-center space-x-2">
            <span className="text-base font-bold">?</span>
            <span>Help</span>
          </h3>
        )}
        <Button variant="ghost" size="sm" onClick={onToggle} className="p-1 h-8 w-8">
          <ChevronRight className="w-4 h-4" />
        </Button>
      </div>

      {!isCollapsed && (
        <div className="flex-1 overflow-y-auto scrollbar-thin scrollbar-thumb-gray-300">
          {!selectedAtomId && !selectedCardId ? (
            <div className="p-4 text-gray-600 text-sm">Please select a Card/Atom</div>
          ) : selectedAtomId && atom?.atomId === 'data-upload-validate' ? (
            <DataUploadValidateHelp atomId={selectedAtomId} />
          ) : selectedAtomId && atom?.atomId === 'column-classifier' ? (
            <ColumnClassifierHelp atomId={selectedAtomId} />
          ) : (
            <div className="p-4 text-gray-600 text-sm">
              <div className="text-center py-8">
                <span className="text-base font-bold text-gray-400">?</span>
                <p className="mt-2">Help content for {atom?.title || 'this atom'} coming soon</p>
                <p className="text-xs text-gray-500 mt-1">
                  Help documentation is being prepared for this atom type
                </p>
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
};

export default HelpPanel;
