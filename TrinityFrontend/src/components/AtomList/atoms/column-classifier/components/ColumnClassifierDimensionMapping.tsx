import React, { useState, useRef, useEffect, useLayoutEffect } from 'react';
import { createPortal } from 'react-dom';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Tag, X, GripVertical } from 'lucide-react';
// import {
//   DndContext,
//   DragOverlay,
//   PointerSensor,
//   useSensor,
//   useSensors,
//   DragEndEvent,
//   DragStartEvent,
//   closestCenter,
//   useDraggable,
//   useDroppable
// } from '@dnd-kit/core';

interface DimensionMappingProps {
  customDimensions: Record<string, string[]>;
  onRemoveDimension: (dimensionName: string) => void;
  onDimensionUpdate: (dimensions: Record<string, string[]>) => void;
}

const ColumnClassifierDimensionMapping: React.FC<DimensionMappingProps> = ({
  customDimensions,
  onRemoveDimension,
  onDimensionUpdate
}) => {
  const [selectedColumns, setSelectedColumns] = useState<Set<string>>(new Set());
  const [contextMenu, setContextMenu] = useState<{ visible: boolean; x: number; y: number }>({ visible: false, x: 0, y: 0 });
  const [portalContainer, setPortalContainer] = useState<HTMLElement | null>(null);
  const contextMenuRef = useRef<HTMLDivElement>(null);

  // const sensors = useSensors(
  //   useSensor(PointerSensor, {
  //     activationConstraint: { distance: 8 }
  //   })
  // );

  // const handleDragStart = (event: DragStartEvent) => {
  //   setActiveId(event.active.id as string);
  // };

  // const handleDragEnd = (event: DragEndEvent) => {
  //   const { active, over } = event;
  //   setActiveId(null);
  //   if (!over) return;
  //   const activeData = active.data.current;
  //   const overId = over.id as string;
  //   const column = activeData?.column as string;
  //   const fromSection = activeData?.section as string;
  //   if (fromSection === overId) return;
  //   const updated = { ...customDimensions };
  //   Object.keys(updated).forEach(key => {
  //     updated[key] = updated[key].filter(c => c !== column);
  //   });
  //   if (!updated[overId]) updated[overId] = [];
  //   updated[overId].push(column);
  //   onDimensionUpdate(updated);
  // };

  const handleDimensionChange = (newDimension: string) => {
    const columnsToMove = Array.from(selectedColumns);
    console.log('Moving columns:', columnsToMove, 'to dimension:', newDimension);
    
    const updated = { ...customDimensions };
    
    // Remove columns from all dimensions first
    columnsToMove.forEach(column => {
      Object.keys(updated).forEach(key => {
        updated[key] = updated[key].filter(c => c !== column);
      });
    });
    
    // Add columns to new dimension
    if (!updated[newDimension]) updated[newDimension] = [];
    columnsToMove.forEach(column => {
      if (!updated[newDimension].includes(column)) {
        updated[newDimension].push(column);
      }
    });
    
    onDimensionUpdate(updated);
    setSelectedColumns(new Set());
    setContextMenu({ visible: false, x: 0, y: 0 });
  };

  useEffect(() => {
    if (typeof document !== 'undefined') {
      setPortalContainer(document.body);
    }
  }, []);

  useLayoutEffect(() => {
    if (!contextMenu.visible || !contextMenuRef.current) {
      return;
    }
    const menu = contextMenuRef.current.getBoundingClientRect();
    const { innerWidth, innerHeight } = window;
    const padding = 12;
    let nextX = contextMenu.x;
    let nextY = contextMenu.y;

    if (menu.right > innerWidth) {
      nextX = Math.max(padding, innerWidth - menu.width - padding);
    }
    if (menu.bottom > innerHeight) {
      nextY = Math.max(padding, innerHeight - menu.height - padding);
    }

    if (nextX !== contextMenu.x || nextY !== contextMenu.y) {
      setContextMenu(prev => (prev.visible ? { ...prev, x: nextX, y: nextY } : prev));
    }
  }, [contextMenu.visible, contextMenu.x, contextMenu.y]);

  // Close context menu when clicking outside
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (contextMenuRef.current && !contextMenuRef.current.contains(event.target as Node)) {
        setContextMenu({ visible: false, x: 0, y: 0 });
      }
    };

    if (contextMenu.visible) {
      document.addEventListener('mousedown', handleClickOutside);
      return () => document.removeEventListener('mousedown', handleClickOutside);
    }
  }, [contextMenu.visible]);

  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        setContextMenu({ visible: false, x: 0, y: 0 });
      }
    };

    if (contextMenu.visible) {
      document.addEventListener('keydown', handleKeyDown);
      return () => document.removeEventListener('keydown', handleKeyDown);
    }
  }, [contextMenu.visible]);

  // Color palette for different dimensions
  const getDimensionColor = (dimensionName: string, index: number) => {
    const colors = [
      { bg: 'bg-gradient-to-r from-purple-500 to-purple-600', border: 'border-purple-400' },
      { bg: 'bg-gradient-to-r from-orange-500 to-orange-600', border: 'border-orange-400' },
      { bg: 'bg-gradient-to-r from-pink-500 to-pink-600', border: 'border-pink-400' },
      { bg: 'bg-gradient-to-r from-cyan-500 to-cyan-600', border: 'border-cyan-400' },
      { bg: 'bg-gradient-to-r from-indigo-500 to-indigo-600', border: 'border-indigo-400' },
      { bg: 'bg-gradient-to-r from-teal-500 to-teal-600', border: 'border-teal-400' },
      { bg: 'bg-gradient-to-r from-rose-500 to-rose-600', border: 'border-rose-400' },
      { bg: 'bg-gradient-to-r from-amber-500 to-amber-600', border: 'border-amber-400' },
    ];
    
    if (dimensionName === 'unattributed') {
      return { bg: 'bg-gradient-to-r from-gray-400 to-gray-500', border: 'border-gray-400' };
    }
    
    return colors[index % colors.length];
  };

  const SelectableColumnPill: React.FC<{ 
    name: string; 
    section: string; 
    dimensionName: string;
    dimensionIndex: number;
  }> = ({ name, section, dimensionName, dimensionIndex }) => {
    const isSelected = selectedColumns.has(name);
    const colors = getDimensionColor(dimensionName, dimensionIndex);
    
    const handleClick = (e: React.MouseEvent) => {
      e.preventDefault();
      e.stopPropagation();
      
      // Multi-select without requiring Ctrl/Cmd
      setSelectedColumns(prev => {
        const newSet = new Set(prev);
        if (newSet.has(name)) {
          newSet.delete(name);
        } else {
          newSet.add(name);
        }
        return newSet;
      });
    };

    const handleRightClick = (e: React.MouseEvent) => {
      e.preventDefault();
      e.stopPropagation();
      
      if (!isSelected) {
        setSelectedColumns(new Set([name]));
      }
      
      setContextMenu({
        visible: true,
        x: e.clientX,
        y: e.clientY
      });
    };

    return (
      <div
        onClick={handleClick}
        onContextMenu={handleRightClick}
        className={`group relative flex items-center gap-2 px-3 py-2 bg-white border-2 ${colors.border} rounded-full text-sm font-medium cursor-pointer select-none transition-all duration-200 hover:scale-[1.02] hover:shadow-lg backdrop-blur-sm ${
          isSelected ? 'ring-2 ring-primary ring-offset-2 bg-primary/5' : 'hover:shadow-md'
        }`}
      >
        <div className={`w-2 h-2 rounded-full ${colors.bg}`} />
        <span className="select-none font-medium tracking-wide whitespace-nowrap" title={name}>
          {name}
        </span>
        <div className="absolute inset-0 rounded-full bg-black/5 opacity-0 group-hover:opacity-100 transition-opacity duration-300" />
      </div>
    );
  };

  // Remove the old DimensionDropZone component as we'll use a unified layout

  return (
    // <DndContext
    //   sensors={sensors}
    //   collisionDetection={closestCenter}
    //   onDragStart={handleDragStart}
    //   onDragEnd={handleDragEnd}
    // >
      <div>
        <div className="flex items-center gap-3 mb-6">
          <div className="p-2 bg-gradient-to-br from-blue-500/20 to-blue-400/10 rounded-xl">
            <Tag className="w-5 h-5 text-blue-600" />
          </div>
          <h3 className="text-xl font-bold text-foreground">Dimension Mapping</h3>
          <Badge
            variant="secondary"
            className="bg-gradient-to-r from-blue-100 to-blue-50 text-blue-700 border-blue-200"
          >
            Assign identifiers to business dimensions
          </Badge>
        </div>

        {/* Unified Dimension Mapping Box */}
        <div className="w-full">
          <div className="bg-white/80 backdrop-blur-sm overflow-hidden border-2 border-gray-200 rounded-xl">
            <div className="flex items-center gap-3 border-b border-slate-200 px-5 py-3">
              <div className="w-2 h-4 rounded-full bg-gradient-to-r from-blue-500/60 to-blue-600/80" />
              <h4 className="text-base font-semibold text-gray-900">Apply Dimension Mapping</h4>
            </div>
            <div className="p-5">
              <div className="rounded-lg bg-white/50 p-4">
                <div className="space-y-4">
                  {/* Unattributed Section */}
                  {customDimensions['unattributed'] && customDimensions['unattributed'].length > 0 && (
                    <>
                      <div className="space-y-3">
                        <div className="flex items-center gap-2">
                          <div className="w-2 h-2 rounded-full bg-gradient-to-r from-gray-400 to-gray-500" />
                          <span className="text-sm font-medium text-gray-600">Unattributed</span>
                        </div>
                        <div className="flex flex-wrap gap-3">
                          {customDimensions['unattributed'].map((column, index) => (
                            <SelectableColumnPill
                              key={`unattributed-${column}-${index}`}
                              name={column}
                              section="unattributed"
                              dimensionName="unattributed"
                              dimensionIndex={0}
                            />
                          ))}
                        </div>
                      </div>
                      
                      {/* Horizontal Separator with padding */}
                      <div className="py-2">
                        <div className="border-t border-gray-200"></div>
                      </div>
                    </>
                  )}
                  
                  {/* Other Dimensions */}
                  {Object.entries(customDimensions)
                    .filter(([name]) => name !== 'unattributed')
                    .map(([dimensionName, assignedColumns], index) => (
                      <div key={dimensionName}>
                        <div className="space-y-3">
                          <div className="flex items-center gap-2">
                            <div className={`w-2 h-2 rounded-full ${getDimensionColor(dimensionName, index).bg}`} />
                            <span className="text-sm font-medium text-gray-600">{dimensionName}</span>
                          </div>
                          <div className="flex flex-wrap gap-3">
                            {assignedColumns.map((column, colIndex) => (
                              <SelectableColumnPill
                                key={`${dimensionName}-${column}-${colIndex}`}
                                name={column}
                                section={dimensionName}
                                dimensionName={dimensionName}
                                dimensionIndex={index}
                              />
                            ))}
                          </div>
                        </div>
                        
                        {/* Horizontal Separator with padding (except for last item) */}
                        {index < Object.entries(customDimensions).filter(([name]) => name !== 'unattributed').length - 1 && (
                          <div className="py-2">
                            <div className="border-t border-gray-200"></div>
                          </div>
                        )}
                      </div>
                    ))}
                </div>
                
                {/* Empty state */}
                {Object.values(customDimensions).every(columns => columns.length === 0) && (
                  <div className="flex items-center justify-center h-32 text-muted-foreground">
                    <span className="text-sm italic">No columns assigned to dimensions</span>
                  </div>
                )}
              </div>
            </div>
          </div>
        </div>
        
        {/* Context Menu */}
        {contextMenu.visible && portalContainer
          ? createPortal(
              <div
                ref={contextMenuRef}
                className="fixed z-50 bg-white border border-gray-200 rounded-lg shadow-lg py-1 min-w-[200px]"
                style={{
                  left: contextMenu.x,
                  top: contextMenu.y,
                }}
              >
                <div className="px-3 py-2 text-sm font-medium text-gray-500 border-b border-gray-100">
                  Assign to dimension:
                </div>
                <button
                  onClick={() => handleDimensionChange('unattributed')}
                  className="w-full px-3 py-2 text-left text-sm hover:bg-gray-50 flex items-center gap-2"
                >
                  <div className="w-2 h-2 rounded-full bg-gray-500" />
                  Unattributed
                </button>
                {Object.keys(customDimensions)
                  .filter(name => name !== 'unattributed')
                  .map((dimensionName, index) => (
                    <button
                      key={dimensionName}
                      onClick={() => handleDimensionChange(dimensionName)}
                      className="w-full px-3 py-2 text-left text-sm hover:bg-gray-50 flex items-center gap-2"
                    >
                      <div className={`w-2 h-2 rounded-full ${getDimensionColor(dimensionName, index).bg}`} />
                      {dimensionName}
                    </button>
                  ))}
              </div>,
              portalContainer
            )
          : null}
      </div>
    // </DndContext>
  );
};

export default ColumnClassifierDimensionMapping;
