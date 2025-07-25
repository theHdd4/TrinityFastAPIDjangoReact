import React, { useState } from 'react';
import { Badge } from '@/components/ui/badge';
import { Database, FileText, GripVertical } from 'lucide-react';
import { ClassifierData } from '../ColumnClassifierAtom';
import {
  DndContext,
  DragEndEvent,
  DragOverlay,
  DragStartEvent,
  PointerSensor,
  closestCenter,
  useDraggable,
  useDroppable,
  useSensor,
  useSensors,
} from '@dnd-kit/core';

interface ColumnClassifierCanvasProps {
  data: ClassifierData;
  onColumnMove: (
    columnName: string,
    newCategory: string,
    fileIndex?: number
  ) => void;
  onActiveFileChange: (fileIndex: number) => void;
}

const ColumnClassifierCanvas: React.FC<ColumnClassifierCanvasProps> = ({
  data,
  onColumnMove,
  onActiveFileChange,
}) => {
  const [activeId, setActiveId] = useState<string | null>(null);

  const sensors = useSensors(
    useSensor(PointerSensor, {
      activationConstraint: { distance: 8 },
    })
  );

  const currentFile = data.files[data.activeFileIndex];
  const columnsByCategory = {
    unclassified:
      currentFile?.columns
        .filter(c => c.category === 'unclassified')
        .map(c => c.name) || [],
    identifiers:
      currentFile?.columns
        .filter(c => c.category === 'identifiers')
        .map(c => c.name) || [],
    measures:
      currentFile?.columns
        .filter(c => c.category === 'measures')
        .map(c => c.name) || [],
  } as const;

  const DraggableColumnPill: React.FC<{ name: string; section: string }> = ({
    name,
    section,
  }) => {
    const { attributes, listeners, setNodeRef, transform, isDragging } =
      useDraggable({ id: `${section}-${name}`, data: { column: name, section } });

    const style = transform
      ? { transform: `translate3d(${transform.x}px, ${transform.y}px, 0)` }
      : undefined;

    const sectionColors = {
      unclassified:
        'from-slate-100/80 to-slate-50/60 border-slate-200/70 text-slate-700 hover:from-slate-200/90 hover:to-slate-100/70 hover:border-slate-300 hover:text-slate-800',
      identifiers:
        'from-blue-100/80 to-blue-50/60 border-blue-200/70 text-blue-700 hover:from-blue-200/90 hover:to-blue-100/70 hover:border-blue-300 hover:text-blue-800',
      measures:
        'from-emerald-100/80 to-emerald-50/60 border-emerald-200/70 text-emerald-700 hover:from-emerald-200/90 hover:to-emerald-100/70 hover:border-emerald-300 hover:text-emerald-800',
    } as const;

    return (
      <div
        ref={setNodeRef}
        style={style}
        {...listeners}
        {...attributes}
        className={`group relative flex items-center gap-2 px-3 py-2 bg-gradient-to-r ${
          sectionColors[section as keyof typeof sectionColors]
        } border rounded-full text-sm font-medium cursor-grab active:cursor-grabbing transition-all duration-200 hover:scale-[1.02] hover:shadow-lg backdrop-blur-sm min-w-0 w-full ${
          isDragging ? 'opacity-70 shadow-2xl scale-105 rotate-2' : 'hover:shadow-md'
        }`}
      >
        <GripVertical className="w-3 h-3 opacity-40 group-hover:opacity-60 transition-opacity flex-shrink-0" />
        <span
          className="select-none font-medium tracking-wide truncate flex-1 min-w-0"
          title={name}
        >
          {name}
        </span>
        <div className="absolute inset-0 rounded-full bg-gradient-to-r from-transparent via-white/20 to-transparent opacity-0 group-hover:opacity-100 transition-opacity duration-300" />
      </div>
    );
  };

  const DroppableSection: React.FC<{
    id: string;
    title: string;
    columns: string[];
    gradient: string;
    accentColor: string;
  }> = ({ id, title, columns, gradient, accentColor }) => {
    const { setNodeRef, isOver } = useDroppable({ id });

    return (
      <div
        ref={setNodeRef}
        className={`relative overflow-hidden bg-gradient-to-br ${gradient} border-2 ${
          isOver ? `border-${accentColor} shadow-2xl scale-105` : 'border-border/50'
        } rounded-2xl transition-all duration-300 hover:shadow-xl`}
      >
        <div
          className={`absolute inset-0 bg-gradient-to-br ${gradient} opacity-10 transition-opacity duration-300 ${
            isOver ? 'opacity-30' : ''
          }`}
        />
        <div
          className={`relative px-6 py-4 border-b border-border/30 bg-gradient-to-r ${gradient}`}
        >
          <h3 className="text-lg font-bold text-foreground flex items-center gap-2">
            <div className={`w-3 h-3 rounded-full bg-${accentColor} animate-pulse`} />
            {title}
          </h3>
        </div>
        <div
          className={`relative p-6 min-h-[450px] bg-card/50 backdrop-blur-sm transition-all duration-300 ${
            isOver ? 'bg-primary/5' : ''
          }`}
        >
          <div className="grid grid-cols-2 gap-3">
            {columns.map((column, index) => (
              <DraggableColumnPill
                key={`${id}-${column}-${index}`}
                name={column}
                section={id}
              />
            ))}
          </div>
          {columns.length === 0 && (
            <div className="flex items-center justify-center h-32 text-muted-foreground">
              <span className="text-sm italic">No columns assigned</span>
            </div>
          )}
          {isOver && (
            <div className="absolute inset-6 border-2 border-dashed border-primary/50 rounded-xl bg-primary/5 flex items-center justify-center animate-pulse">
              <span className="text-primary font-medium">Drop here</span>
            </div>
          )}
        </div>
      </div>
    );
  };

  const handleDragStart = (event: DragStartEvent) => {
    setActiveId(event.active.id as string);
  };

  const handleDragEnd = (event: DragEndEvent) => {
    const { active, over } = event;
    setActiveId(null);
    if (!over) return;
    const activeData = active.data.current;
    const overSection = over.id as string;
    if (activeData?.section !== overSection) {
      const columnName = activeData.column as string;
      onColumnMove(columnName, overSection, data.activeFileIndex);
    }
  };

  if (!data.files.length) {
    return (
      <div className="w-full h-full flex items-center justify-center bg-gray-50">
        <div className="text-center p-8">
          <div className="w-16 h-16 mx-auto mb-4 bg-gray-200 rounded-full flex items-center justify-center">
            <Database className="w-8 h-8 text-gray-400" />
          </div>
          <h3 className="text-lg font-semibold text-gray-700 mb-2">Column Classifier</h3>
          <p className="text-gray-500">Use the Properties panel to upload files and classify columns</p>
        </div>
      </div>
    );
  }

  return (
    <DndContext
      sensors={sensors}
      collisionDetection={closestCenter}
      onDragStart={handleDragStart}
      onDragEnd={handleDragEnd}
    >
      <div className="h-full bg-gradient-to-br from-background via-muted/30 to-background">
        <div className="border-b border-border bg-gradient-to-r from-card via-card/95 to-card backdrop-blur-sm">
          <div className="flex items-center justify-between p-6">
            <div className="flex items-center gap-3">
              <div className="p-2 bg-gradient-to-br from-primary/20 to-primary/10 rounded-xl">
                <Database className="w-6 h-6 text-primary" />
              </div>
              <h2 className="text-2xl font-bold bg-gradient-to-r from-foreground to-foreground/70 bg-clip-text text-transparent">
                Column Classifier
              </h2>
            </div>
            <Badge
              variant="secondary"
              className="bg-gradient-to-r from-primary/10 to-primary/5 text-primary border-primary/20"
            >
              Interactive
            </Badge>
          </div>
          <div className="flex items-center px-6 pb-4 space-x-3">
            {data.files.map((file, index) => (
              <div key={index} className="relative">
                <button
                  onClick={() => onActiveFileChange(index)}
                  className={`flex items-center space-x-2 px-5 py-3 rounded-t-xl text-sm font-medium border-t border-l border-r transition-all duration-200 hover:scale-105 ${
                    index === data.activeFileIndex
                      ? 'bg-gradient-to-b from-card to-card/90 text-foreground border-border/50 border-b-card -mb-px shadow-lg'
                      : 'bg-gradient-to-b from-muted/50 to-muted/30 text-muted-foreground hover:from-muted/70 hover:to-muted/50 border-border/30'
                  }`}
                >
                  <FileText className="w-4 h-4" />
                  <span>{file.fileName}</span>
                  {index === data.activeFileIndex && (
                    <div className="w-2 h-2 rounded-full bg-primary animate-pulse" />
                  )}
                </button>
              </div>
            ))}
          </div>
        </div>
        <div className="p-8 h-[calc(100%-160px)] overflow-auto">
          <div className="grid grid-cols-3 gap-8 max-w-7xl mx-auto">
            <DroppableSection
              id="unclassified"
              title="Unclassified Columns"
              columns={columnsByCategory.unclassified}
              gradient="from-slate-50 to-gray-50"
              accentColor="gray-400"
            />
            <DroppableSection
              id="identifiers"
              title="Identifiers"
              columns={columnsByCategory.identifiers}
              gradient="from-blue-50 to-indigo-50"
              accentColor="blue-500"
            />
            <DroppableSection
              id="measures"
              title="Measures"
              columns={columnsByCategory.measures}
              gradient="from-emerald-50 to-green-50"
              accentColor="emerald-500"
            />
          </div>
        </div>
        <DragOverlay>
          {activeId ? (
            <div className="group relative inline-flex items-center gap-2 px-4 py-2.5 bg-gradient-to-r from-primary/20 to-primary/10 text-primary border border-primary/30 rounded-full text-sm font-medium shadow-2xl backdrop-blur-sm scale-110 rotate-3">
              <GripVertical className="w-3 h-3 opacity-60" />
              <span className="select-none font-medium tracking-wide">
                {activeId.split('-').slice(1).join('-')}
              </span>
              <div className="absolute inset-0 rounded-full bg-gradient-to-r from-transparent via-white/30 to-transparent opacity-100 animate-pulse" />
            </div>
          ) : null}
        </DragOverlay>
      </div>
    </DndContext>
  );
};

export default ColumnClassifierCanvas;

