import React, { useState, useEffect, useRef } from 'react';
import { X, Sparkles, Minimize2, Maximize2, GripVertical } from 'lucide-react';
import { VerticalProgressStepper } from '@/components/AtomList/atoms/data-upload/components/guided-upload/VerticalProgressStepper';
import { useLaboratoryStore } from '@/components/LaboratoryMode/store/laboratoryStore';
import type { UploadStage } from '@/components/AtomList/atoms/data-upload/components/guided-upload/useGuidedUploadFlow';
import { Button } from '@/components/ui/button';

interface GuidedFlowFloatingPanelProps {
  onClose?: () => void;
}

type PanelState = 'minimized' | 'maximized';

export const GuidedFlowFloatingPanel: React.FC<GuidedFlowFloatingPanelProps> = ({
  onClose,
}) => {
  const activeGuidedFlows = useLaboratoryStore((state) => state.activeGuidedFlows || {});
  const getAtom = useLaboratoryStore((state) => state.getAtom);
  
  const [panelState, setPanelState] = useState<PanelState>('maximized');
  const [position, setPosition] = useState({ x: 0, y: 0 });
  const [isDragging, setIsDragging] = useState(false);
  const [dragStart, setDragStart] = useState({ x: 0, y: 0 });
  const panelRef = useRef<HTMLDivElement>(null);

  // Auto-open when flows become active
  const hasActiveFlows = Object.keys(activeGuidedFlows).length > 0;

  // Initialize position to right side
  useEffect(() => {
    if (panelRef.current && position.x === 0 && position.y === 0) {
      const rect = panelRef.current.getBoundingClientRect();
      const viewportWidth = window.innerWidth;
      const viewportHeight = window.innerHeight;
      // Position on right side, slightly overlapping
      setPosition({
        x: viewportWidth - 320 - 60, // 320px panel width + 60px offset
        y: 100, // Top offset
      });
    }
  }, []);

  // Handle drag start
  const handleMouseDown = (e: React.MouseEvent) => {
    if (panelState === 'minimized') return;
    setIsDragging(true);
    setDragStart({
      x: e.clientX - position.x,
      y: e.clientY - position.y,
    });
  };

  // Handle drag
  useEffect(() => {
    const handleMouseMove = (e: MouseEvent) => {
      if (!isDragging || panelState === 'minimized') return;
      
      const newX = e.clientX - dragStart.x;
      const newY = e.clientY - dragStart.y;
      
      // Constrain to viewport
      const maxX = window.innerWidth - (panelState === 'maximized' ? 320 : 60);
      const maxY = window.innerHeight - (panelState === 'maximized' ? 400 : 40);
      
      setPosition({
        x: Math.max(0, Math.min(newX, maxX)),
        y: Math.max(0, Math.min(newY, maxY)),
      });
    };

    const handleMouseUp = () => {
      setIsDragging(false);
    };

    if (isDragging) {
      document.addEventListener('mousemove', handleMouseMove);
      document.addEventListener('mouseup', handleMouseUp);
      return () => {
        document.removeEventListener('mousemove', handleMouseMove);
        document.removeEventListener('mouseup', handleMouseUp);
      };
    }
  }, [isDragging, dragStart, panelState]);

  const activeFlowEntries = Object.entries(activeGuidedFlows);
  const [selectedAtomId, setSelectedAtomId] = React.useState<string | null>(
    activeFlowEntries.length > 0 ? activeFlowEntries[0][0] : null
  );

  const selectedFlow = selectedAtomId ? activeGuidedFlows[selectedAtomId] : null;
  const selectedAtom = selectedAtomId ? getAtom(selectedAtomId) : null;

  // Update selected atom when flows change
  useEffect(() => {
    if (activeFlowEntries.length > 0 && !selectedAtomId) {
      setSelectedAtomId(activeFlowEntries[0][0]);
    }
  }, [activeFlowEntries.length, selectedAtomId]);

  if (!hasActiveFlows) {
    return null;
  }

  const toggleMinimize = () => {
    setPanelState(panelState === 'minimized' ? 'maximized' : 'minimized');
  };

  return (
    <div
      ref={panelRef}
      className="fixed z-50 transition-all duration-200"
      style={{
        left: `${position.x}px`,
        top: `${position.y}px`,
        width: panelState === 'maximized' ? '320px' : '60px',
        height: panelState === 'maximized' ? 'auto' : '40px',
        maxHeight: panelState === 'maximized' ? '80vh' : '40px',
      }}
    >
      <div className="bg-white border-2 border-gray-200 shadow-2xl rounded-lg flex flex-col overflow-hidden">
        {/* Header - Always visible */}
        <div
          className={`flex items-center justify-between p-2 border-b border-gray-200 bg-gradient-to-r from-blue-50 to-indigo-50 ${
            isDragging ? 'cursor-move' : 'cursor-default'
          }`}
          onMouseDown={handleMouseDown}
        >
          <div className="flex items-center gap-2 flex-1 min-w-0">
            <GripVertical className="w-4 h-4 text-gray-400 flex-shrink-0" />
            {panelState === 'maximized' && (
              <>
                <Sparkles className="w-4 h-4 text-blue-600 flex-shrink-0" />
                <h3 className="text-xs font-semibold text-gray-900 truncate">Guided Workflow</h3>
              </>
            )}
            {panelState === 'minimized' && (
              <Sparkles className="w-4 h-4 text-blue-600" />
            )}
          </div>
          <div className="flex items-center gap-1 flex-shrink-0">
            <Button
              variant="ghost"
              size="icon"
              onClick={toggleMinimize}
              className="h-6 w-6"
              title={panelState === 'minimized' ? 'Maximize' : 'Minimize'}
            >
              {panelState === 'minimized' ? (
                <Maximize2 className="w-3 h-3" />
              ) : (
                <Minimize2 className="w-3 h-3" />
              )}
            </Button>
            {onClose && (
              <Button
                variant="ghost"
                size="icon"
                onClick={onClose}
                className="h-6 w-6"
                title="Close"
              >
                <X className="w-3 h-3" />
              </Button>
            )}
          </div>
        </div>

        {/* Content - Only visible when maximized */}
        {panelState === 'maximized' && (
          <>
            {/* Atom Selector (if multiple flows) */}
            {activeFlowEntries.length > 1 && (
              <div className="p-3 border-b border-gray-200 bg-gray-50">
                <div className="text-xs font-medium text-gray-700 mb-2">Active Flows:</div>
                <div className="space-y-1">
                  {activeFlowEntries.map(([atomId, flow]) => {
                    const atom = getAtom(atomId);
                    return (
                      <button
                        key={atomId}
                        onClick={() => setSelectedAtomId(atomId)}
                        className={`w-full text-left px-2 py-1.5 rounded text-xs transition-colors ${
                          selectedAtomId === atomId
                            ? 'bg-blue-100 text-blue-700 font-medium'
                            : 'bg-white text-gray-600 hover:bg-gray-100'
                        }`}
                      >
                        {atom?.title || `Atom ${atomId.slice(0, 8)}`}
                      </button>
                    );
                  })}
                </div>
              </div>
            )}

            {/* Step Tracker */}
            <div className="flex-1 overflow-y-auto p-4 max-h-[60vh]">
              {selectedFlow ? (
                <div>
                  {selectedAtom && (
                    <div className="mb-4 pb-3 border-b border-gray-200">
                      <div className="text-xs text-gray-500 mb-1">Current Atom</div>
                      <div className="text-sm font-medium text-gray-900">{selectedAtom.title}</div>
                    </div>
                  )}
                  <VerticalProgressStepper
                    currentStage={selectedFlow.currentStage}
                    className="w-full"
                  />
                </div>
              ) : (
                <div className="text-center text-sm text-gray-500 py-8">
                  No active guided flow
                </div>
              )}
            </div>

            {/* Footer */}
            <div className="p-3 border-t border-gray-200 bg-gray-50">
              <p className="text-xs text-gray-500 italic">
                This guide is purely advisory. All decisions remain under your control.
              </p>
            </div>
          </>
        )}
      </div>
    </div>
  );
};




