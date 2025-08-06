import React, { useState } from 'react';
import { Card } from '@/components/ui/card';
import { Database, FileText, GripVertical } from 'lucide-react';
import { ClassifierData } from '../ColumnClassifierAtom';
import ColClassifierColumnView from './ColClassifierColumnView';
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
  showColumnView: boolean;
  filterUnique: boolean;
  onFilterToggle: (val: boolean) => void;
}

const ColumnClassifierCanvas: React.FC<ColumnClassifierCanvasProps> = ({
  data,
  onColumnMove,
  onActiveFileChange,
  showColumnView,
  filterUnique,
  onFilterToggle,
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
        'bg-white border-[#fec107] text-black hover:bg-[#fec107]/10',
      identifiers:
        'bg-white border-blue-400 text-black hover:bg-blue-50',
      measures:
        'bg-white border-emerald-400 text-black hover:bg-emerald-50',
    } as const;

    return (
      <div
        ref={setNodeRef}
        style={style}
        {...listeners}
        {...attributes}
        className={`group relative flex items-center gap-2 px-3 py-2 ${
          sectionColors[section as keyof typeof sectionColors]
        } rounded-full text-sm font-medium cursor-grab active:cursor-grabbing transition-all duration-200 hover:scale-[1.02] hover:shadow-lg backdrop-blur-sm ${
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

  const DroppableSection: React.FC<{
    id: 'unclassified' | 'identifiers' | 'measures';
    title: string;
    columns: string[];
  }> = ({ id, title, columns }) => {
    const { setNodeRef, isOver } = useDroppable({ id });

    const styles = {
      unclassified: {
        gradient: 'from-gray-400 to-gray-500',
        bg: 'bg-white',
        border: 'border-[#fec107]',
      },
      identifiers: {
        gradient: 'from-blue-500 to-blue-600',
        bg: 'bg-white',
        border: 'border-blue-200',
      },
      measures: {
        gradient: 'from-emerald-500 to-emerald-600',
        bg: 'bg-white',
        border: 'border-emerald-200',
      },
    }[id];

    return (
      <Card
        ref={setNodeRef}
        className={`h-full border-0 shadow-xl bg-white/80 backdrop-blur-sm overflow-hidden transform transition-all duration-300 ${
          isOver ? 'scale-105 shadow-2xl' : 'hover:shadow-xl'
        }`}
      >
        <div className={`bg-gradient-to-r ${styles.gradient} p-1 h-full`}>
          <div className="bg-white rounded-sm h-full flex flex-col">
            <div className="p-6 flex flex-col h-full">
              <div className="flex items-center mb-4">
                <div className={`w-1 h-8 bg-gradient-to-b ${styles.gradient} rounded-full mr-3`} />
                <h4 className="text-lg font-bold text-gray-900">{title}</h4>
              </div>
              <div
                className={`relative flex-1 min-h-[450px] p-4 rounded-lg ${styles.bg} border ${styles.border} transition-all duration-300 ${
                  isOver ? 'bg-primary/5' : ''
                }`}
              >
                <div className="flex flex-wrap gap-3">
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
                  <div className="absolute inset-4 border-2 border-dashed border-primary/50 rounded-lg bg-primary/5 flex items-center justify-center animate-pulse">
                    <span className="text-primary font-medium">Drop here</span>
                  </div>
                )}
              </div>
            </div>
          </div>
        </div>
      </Card>
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
      <div className="w-full h-full p-4">
        <div className="border-b border-blue-200 bg-blue-50">
          <div className="flex items-center px-6 py-4 space-x-3">
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
        <div className="p-4 space-y-6">
          {showColumnView && currentFile && (
            <ColClassifierColumnView
              objectName={currentFile.fileName}
              columns={columnsByCategory}
              filterUnique={filterUnique}
              onFilterToggle={onFilterToggle}
            />
          )}
          <div className="grid grid-cols-3 gap-6">
            <DroppableSection
              id="unclassified"
              title="Unclassified"
              columns={columnsByCategory.unclassified}
            />
            <DroppableSection
              id="identifiers"
              title="Identifiers"
              columns={columnsByCategory.identifiers}
            />
            <DroppableSection
              id="measures"
              title="Measures"
              columns={columnsByCategory.measures}
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

