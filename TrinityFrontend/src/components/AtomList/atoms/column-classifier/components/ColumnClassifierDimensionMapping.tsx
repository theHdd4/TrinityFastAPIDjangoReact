import React, { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Tag, X, GripVertical } from 'lucide-react';
import {
  DndContext,
  DragOverlay,
  PointerSensor,
  useSensor,
  useSensors,
  DragEndEvent,
  DragStartEvent,
  closestCenter,
  useDraggable,
  useDroppable
} from '@dnd-kit/core';

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
  const [activeId, setActiveId] = useState<string | null>(null);

  const sensors = useSensors(
    useSensor(PointerSensor, {
      activationConstraint: { distance: 8 }
    })
  );

  const handleDragStart = (event: DragStartEvent) => {
    setActiveId(event.active.id as string);
  };

  const handleDragEnd = (event: DragEndEvent) => {
    const { active, over } = event;
    setActiveId(null);
    if (!over) return;
    const activeData = active.data.current;
    const overId = over.id as string;
    const column = activeData?.column as string;
    const fromSection = activeData?.section as string;
    if (fromSection === overId) return;
    const updated = { ...customDimensions };
    Object.keys(updated).forEach(key => {
      updated[key] = updated[key].filter(c => c !== column);
    });
    if (!updated[overId]) updated[overId] = [];
    updated[overId].push(column);
    onDimensionUpdate(updated);
  };

  const DraggableColumnPill: React.FC<{ name: string; section: string }> = ({
    name,
    section
  }) => {
    const { attributes, listeners, setNodeRef, transform, isDragging } =
      useDraggable({ id: `${section}-${name}`, data: { column: name, section } });

    const style = transform
      ? { transform: `translate3d(${transform.x}px, ${transform.y}px, 0)` }
      : undefined;

    return (
      <div
        ref={setNodeRef}
        style={style}
        {...listeners}
        {...attributes}
        className={`group relative flex items-center gap-2 px-3 py-2 bg-white border border-blue-400 text-black hover:bg-blue-50 rounded-full text-sm font-medium cursor-grab active:cursor-grabbing transition-all duration-200 hover:scale-[1.02] hover:shadow-lg backdrop-blur-sm ${
          isDragging ? 'opacity-70 shadow-2xl scale-105 rotate-2' : 'hover:shadow-md'
        }`}
      >
        <GripVertical className="w-3 h-3 opacity-40 group-hover:opacity-60 transition-opacity flex-shrink-0" />
        <span className="select-none font-medium tracking-wide whitespace-nowrap" title={name}>
          {name}
        </span>
        <div className="absolute inset-0 rounded-full bg-black/5 opacity-0 group-hover:opacity-100 transition-opacity duration-300" />
      </div>
    );
  };

  const DimensionDropZone: React.FC<{
    id: string;
    title: string;
    columns: string[];
    onRemoveDimension: (name: string) => void;
  }> = ({ id, title, columns, onRemoveDimension }) => {
    const { setNodeRef, isOver } = useDroppable({ id });

    return (
      <div
        ref={setNodeRef}
        className={`relative overflow-hidden bg-white border-2 ${
          isOver ? 'border-blue-400 shadow-xl scale-105' : 'border-blue-200'
        } rounded-xl transition-all duration-300 hover:shadow-lg group h-64 flex flex-col`}
      >
        <div className="relative px-4 py-3 border-b border-blue-200 bg-white">
          <div className="flex items-center justify-between">
            <h4 className="text-sm font-bold text-foreground capitalize flex items-center gap-2">
              <div className="w-2 h-2 rounded-full bg-blue-500 animate-pulse" />
              {title}
            </h4>
            {id !== 'unattributed' && (
              <Button
                variant="ghost"
                size="sm"
                onClick={() => onRemoveDimension(id)}
                className="h-6 w-6 p-0 opacity-0 group-hover:opacity-100 transition-opacity hover:bg-destructive/10 hover:text-destructive"
              >
                <X className="w-3 h-3" />
              </Button>
            )}
          </div>
        </div>
        <div
          className={`relative p-4 flex-1 bg-white transition-all duration-300 ${
            isOver ? 'bg-blue-50' : ''
          } overflow-y-auto`}
        >
          <div className="flex flex-wrap gap-2">
            {columns.map((column, index) => (
              <DraggableColumnPill
                key={`${id}-${column}-${index}`}
                name={column}
                section={id}
              />
            ))}
          </div>
          {columns.length === 0 && (
            <div className="flex flex-col items-center justify-center h-full text-muted-foreground">
              <Tag className="w-8 h-8 mb-2 opacity-40" />
              <span className="text-xs italic text-center">
                Drag identifier columns here
                <br />
                to map them to this dimension
              </span>
            </div>
          )}
          {isOver && (
            <div className="absolute inset-4 border-2 border-dashed border-blue-400/50 rounded-xl bg-blue-400/5 flex items-center justify-center animate-pulse">
              <span className="text-blue-600 font-medium text-sm">Drop identifier here</span>
            </div>
          )}
        </div>
      </div>
    );
  };

  return (
    <DndContext
      sensors={sensors}
      collisionDetection={closestCenter}
      onDragStart={handleDragStart}
      onDragEnd={handleDragEnd}
    >
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

      {customDimensions['unattributed'] && (
        <div className="mb-6">
          <DimensionDropZone
            id="unattributed"
            title="unattributed"
            columns={customDimensions['unattributed']}
            onRemoveDimension={onRemoveDimension}
          />
        </div>
      )}

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-6">
        {Object.entries(customDimensions)
          .filter(([name]) => name !== 'unattributed')
          .map(([dimensionName, assignedColumns]) => (
            <DimensionDropZone
              key={dimensionName}
              id={dimensionName}
              title={dimensionName}
              columns={assignedColumns}
              onRemoveDimension={onRemoveDimension}
            />
          ))}
      </div>
      <DragOverlay>
        {activeId ? (
          <div className="group relative inline-flex items-center gap-2 px-4 py-2.5 bg-gradient-to-r from-blue-200 to-blue-100 text-blue-700 border border-blue-200 rounded-full text-sm font-medium shadow-2xl backdrop-blur-sm scale-110 rotate-3">
            <GripVertical className="w-3 h-3 opacity-60" />
            <span className="select-none font-medium tracking-wide">
              {activeId.split('-').slice(1).join('-')}
            </span>
          </div>
        ) : null}
      </DragOverlay>
    </DndContext>
  );
};

export default ColumnClassifierDimensionMapping;
