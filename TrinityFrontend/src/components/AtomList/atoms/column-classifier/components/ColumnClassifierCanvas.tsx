import React, { useState, useRef, useEffect, useLayoutEffect } from 'react';
import { createPortal } from 'react-dom';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { CheckboxTemplate } from '@/templates/checkbox';
import { Plus } from 'lucide-react';
import { Database, FileText, GripVertical, Info } from 'lucide-react';
import { ClassifierData } from '../ColumnClassifierAtom';
import ColClassifierColumnView from './ColClassifierColumnView';
import { useToast } from '@/hooks/use-toast';
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from '@/components/ui/tooltip';
import {
  useLaboratoryStore,
  ColumnClassifierSettings as SettingsType,
  DEFAULT_COLUMN_CLASSIFIER_SETTINGS
} from '@/components/LaboratoryMode/store/laboratoryStore';
// import {
//   DndContext,
//   DragEndEvent,
//   DragOverlay,
//   DragStartEvent,
//   PointerSensor,
//   closestCenter,
//   useDraggable,
//   useDroppable,
//   useSensor,
//   useSensors,
// } from '@dnd-kit/core';

interface ColumnClassifierCanvasProps {
  data: ClassifierData;
  onColumnMove: (
    columnName: string | string[],
    newCategory: string,
    fileIndex?: number
  ) => void;
  onActiveFileChange: (fileIndex: number) => void;
  showColumnView: boolean;
  filterUnique: boolean;
  onFilterToggle: (val: boolean) => void;
  atomId?: string;
}

const ColumnClassifierCanvas: React.FC<ColumnClassifierCanvasProps> = ({
  data,
  onColumnMove,
  onActiveFileChange,
  showColumnView,
  filterUnique,
  onFilterToggle,
  atomId,
}) => {
  const [selectedColumns, setSelectedColumns] = useState<Set<string>>(new Set());
  const [contextMenu, setContextMenu] = useState<{ visible: boolean; x: number; y: number }>({ visible: false, x: 0, y: 0 });
  const [portalContainer, setPortalContainer] = useState<HTMLElement | null>(null);
  const contextMenuRef = useRef<HTMLDivElement>(null);

  // Dimension settings state
  const atom = useLaboratoryStore(state => state.getAtom(atomId || ''));
  const updateSettings = useLaboratoryStore(state => state.updateAtomSettings);
  const settings: SettingsType = {
    ...DEFAULT_COLUMN_CLASSIFIER_SETTINGS,
    ...(atom?.settings as SettingsType)
  };
  const { toast } = useToast();

  const [enableMapping, setEnableMapping] = useState<boolean>(true);
  const [options, setOptions] = useState<string[]>(
    Array.from(
      new Set([
        'unattributed',
        'market',
        'product',
        ...(settings.dimensions || [])
      ])
    )
  );
  const [selected, setSelected] = useState<string[]>(
    (settings.dimensions || []).filter(d => d !== 'unattributed')
  );
  const [showInput, setShowInput] = useState(false);
  const [newDim, setNewDim] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    if (typeof document !== 'undefined') {
      setPortalContainer(document.body);
    }
  }, []);

  // Dimension settings useEffect
  React.useEffect(() => {
    setEnableMapping(true);
    setOptions(
      Array.from(
        new Set([
          'unattributed',
          'market',
          'product',
          ...(settings.dimensions || [])
        ])
      )
    );
    setSelected((settings.dimensions || []).filter(d => d !== 'unattributed'));
  }, [settings.dimensions]);

  const toggle = (dim: string) => {
    setSelected(prev =>
      prev.includes(dim) ? prev.filter(d => d !== dim) : [...prev, dim]
    );
  };

  const addDimension = () => {
    const dim = newDim.trim().toLowerCase();
    if (dim && !options.includes(dim) && options.length < 10) {
      setOptions([...options, dim]);
      setSelected([...selected, dim]);
    }
    setNewDim('');
    setShowInput(false);
  };

  const save = async () => {
    if (!settings.validatorId || settings.data.files.length === 0) {
      setError('Classify a dataframe first');
      return;
    }
    setLoading(true);
    setError('');
    try {
      const dims = ['unattributed', ...selected];
      updateSettings(atomId || '', {
        enableDimensionMapping: true,
        dimensions: dims
      });
      if (settings.data.files.length) {
        const updatedFiles = settings.data.files.map(file => {
          const identifiers = file.columns
            .filter(c => c.category === 'identifiers')
            .map(c => c.name);
          const custom = dims.reduce((acc, d) => {
            acc[d] = d === 'unattributed' ? identifiers : [];
            return acc;
          }, {} as { [key: string]: string[] });
          return { ...file, customDimensions: custom };
        });
        updateSettings(atomId || '', {
          data: { ...settings.data, files: updatedFiles }
        });
      }
      toast({ title: 'Dimensions Saved Successfully' });
    } catch (e: any) {
      setError(e.message);
      toast({ title: 'Unable to Save Dimensions', variant: 'destructive' });
    } finally {
      setLoading(false);
    }
  };

  // const sensors = useSensors(
  //   useSensor(PointerSensor, {
  //     activationConstraint: { distance: 8 },
  //   })
  // );

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

  const SelectableColumnPill: React.FC<{ 
    name: string; 
    section: string; 
    color: string; 
    borderColor: string; 
  }> = ({ name, section, color, borderColor }) => {
    const isSelected = selectedColumns.has(name);
    
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
        className={`group relative inline-flex items-center gap-2 px-3 py-2 bg-white border-2 ${borderColor} rounded-full text-sm font-medium text-slate-700 shadow-sm hover:shadow-md transition-all duration-200 cursor-pointer select-none ${
          isSelected ? 'ring-2 ring-primary ring-offset-2 bg-primary/5' : 'hover:bg-slate-50'
        }`}
      >
        <div className={`w-2 h-2 rounded-full ${color}`} />
        <span className="font-medium tracking-wide">{name}</span>
        <div className="absolute inset-0 rounded-full bg-black/5 opacity-0 group-hover:opacity-100 transition-opacity duration-300" />
      </div>
    );
  };

  // const DroppableZone: React.FC<{ id: string }> = ({ id }) => {
  //   const { setNodeRef, isOver } = useDroppable({ id });
  //
  //   return (
  //     <div
  //       ref={setNodeRef}
  //       className={`absolute inset-0 pointer-events-auto ${
  //         isOver ? 'bg-primary/10 border-2 border-dashed border-primary/50 rounded-lg' : ''
  //       }`}
  //     />
  //   );
  // };

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

  const handleClassificationChange = (newCategory: string) => {
    // Create a copy of selected columns to avoid state issues
    const columnsToMove = Array.from(selectedColumns);
    console.log('Moving columns:', columnsToMove, 'to category:', newCategory);
    
    // Pass all columns at once to onColumnMove
    onColumnMove(columnsToMove, newCategory, data.activeFileIndex);
    
    // Clear selection and context menu immediately
    setSelectedColumns(new Set());
    setContextMenu({ visible: false, x: 0, y: 0 });
  };

  const getCurrentCategory = (columnName: string) => {
    const column = currentFile?.columns.find(c => c.name === columnName);
    return column?.category || 'unclassified';
  };

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

  const UnifiedDroppableSection: React.FC<{
    id: 'unclassified' | 'identifiers' | 'measures';
    title: string;
    columns: string[];
    indicatorColor: string;
    borderColor: string;
    activeBorderColor: string;
    isOver?: boolean;
  }> = ({ id, title, columns, indicatorColor, borderColor, activeBorderColor, isOver = false }) => {
    const { setNodeRef, isOver: isDroppableOver } = useDroppable({ id });
    const isActive = isOver || isDroppableOver;

    return (
      <div
        ref={setNodeRef}
        className={`relative rounded-lg border-2 transition-all duration-300 ${
          isActive ? `${activeBorderColor} shadow-lg` : `${borderColor} hover:shadow-md`
        } bg-white/50 p-4`}
      >
        <div className="flex items-center gap-3 mb-3">
          <div className={`w-2 h-4 rounded-full ${indicatorColor}`} />
          <h5 className="text-sm font-semibold text-gray-900">{title}</h5>
        </div>
        <div className="flex flex-wrap gap-2 min-h-[100px]">
          {columns.map((column, index) => (
            <DraggableColumnPill
              key={`${id}-${column}-${index}`}
              name={column}
              section={id}
            />
          ))}
          {columns.length === 0 && (
            <div className="flex items-center justify-center w-full h-20 text-muted-foreground">
              <span className="text-xs italic">No columns assigned</span>
            </div>
          )}
          {isActive && (
            <div className="absolute inset-2 border-2 border-dashed border-primary/50 rounded-lg bg-primary/5 flex items-center justify-center animate-pulse">
              <span className="text-primary font-medium text-sm">Drop here</span>
            </div>
          )}
        </div>
      </div>
    );
  };

  const DroppableSection: React.FC<{
    id: 'unclassified' | 'identifiers' | 'measures';
    title: string;
    columns: string[];
  }> = ({ id, title, columns }) => {
    const { setNodeRef, isOver } = useDroppable({ id });
    const sectionStyles = {
      unclassified: {
        indicator: 'bg-gradient-to-r from-gray-400 to-gray-500',
        border: 'border-[#fec107]',
        active: 'border-[#fec107]',
      },
      identifiers: {
        indicator: 'bg-gradient-to-r from-blue-500 to-blue-600',
        border: 'border-blue-200',
        active: 'border-blue-400',
      },
      measures: {
        indicator: 'bg-gradient-to-r from-emerald-500 to-emerald-600',
        border: 'border-emerald-200',
        active: 'border-emerald-400',
      },
    }[id];

    return (
      <Card
        ref={setNodeRef}
        className={`h-full bg-white/80 backdrop-blur-sm overflow-hidden transform transition-all duration-300 border-2 rounded-xl ${
          isOver ? `${sectionStyles.active} shadow-xl scale-105` : `${sectionStyles.border} hover:shadow-lg`
        } flex flex-col`}
      >
        <div className="flex items-center gap-3 border-b border-slate-200 px-5 py-3">
          <div className={`w-2 h-4 rounded-full ${sectionStyles.indicator}`} />
          <h4 className="text-base font-semibold text-gray-900">{title}</h4>
        </div>
        <div className="flex-1 p-5">
          <div
            className={`relative flex-1 min-h-[450px] rounded-lg bg-white transition-all duration-300 ${
              isOver ? 'bg-blue-50' : ''
            } p-4`}
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
      </Card>
    );
  };

  // const handleDragStart = (event: DragStartEvent) => {
  //   setActiveId(event.active.id as string);
  // };

  // const handleDragEnd = (event: DragEndEvent) => {
  //   const { active, over } = event;
  //   setActiveId(null);
  //   if (!over) return;
  //   const activeData = active.data.current;
  //   const overSection = over.id as string;
  //   if (activeData?.section !== overSection) {
  //     const columnName = activeData.column as string;
  //     onColumnMove(columnName, overSection, data.activeFileIndex);
  //   }
  // };

  if (!data.files.length) {
    return (
      <div className="w-full h-full p-6 bg-gradient-to-br from-slate-50 via-green-50/30 to-green-50/50 overflow-y-auto relative">
        <div className="absolute inset-0 opacity-20">
          <svg width="80" height="80" viewBox="0 0 80 80" className="absolute inset-0 w-full h-full">
            <defs>
              <pattern id="emptyGrid" width="80" height="80" patternUnits="userSpaceOnUse">
                <path d="M 80 0 L 0 0 0 80" fill="none" stroke="rgb(148 163 184 / 0.15)" strokeWidth="1"/>
              </pattern>
            </defs>
            <rect width="100%" height="100%" fill="url(#emptyGrid)" />
          </svg>
        </div>

        <div className="relative z-10 flex items-center justify-center h-full">
          <div className="text-center max-w-md">
            <div className="w-24 h-24 mx-auto mb-8 rounded-2xl bg-gradient-to-br from-green-500 to-green-600 flex items-center justify-center shadow-2xl transform rotate-3 hover:rotate-0 transition-transform duration-300">
              <FileText className="w-12 h-12 text-white drop-shadow-lg" />
            </div>
            <h3 className="text-3xl font-bold text-gray-900 mb-3 bg-gradient-to-r from-green-500 to-green-600 bg-clip-text text-transparent">
              Column Classifier Operation
            </h3>
            <p className="text-gray-600 mb-6 text-lg font-medium leading-relaxed">
              Upload files from the properties panel to get started
            </p>
          </div>
        </div>
      </div>
    );
  }

  return (
    <>
      {/* Custom thin scrollbar styles */}
      <style>{`
        .custom-thin-scrollbar::-webkit-scrollbar {
          height: 6px;
          background: #f8fafc;
          border-radius: 4px;
        }
        .custom-thin-scrollbar::-webkit-scrollbar-thumb {
          background: #cbd5e1;
          border-radius: 4px;
          border: 1px solid #f8fafc;
        }
        .custom-thin-scrollbar::-webkit-scrollbar-thumb:hover {
          background: #94a3b8;
        }
        .custom-thin-scrollbar {
          scrollbar-color: #cbd5e1 #f8fafc;
          scrollbar-width: thin;
        }
      `}</style>
      {/* <DndContext
        sensors={sensors}
        collisionDetection={closestCenter}
        onDragStart={handleDragStart}
        onDragEnd={handleDragEnd}
      > */}
      <div className="w-full h-full p-4">
        <div className="border-b border-blue-200 bg-blue-50">
          <div className="flex items-center px-6 py-4 space-x-3">
            {data.files.map((file, index) => {
              const displayName = file.fileName.split('/').pop();
              return (
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
                    <span>{displayName}</span>
                    {index === data.activeFileIndex && (
                      <div className="w-2 h-2 rounded-full bg-primary animate-pulse" />
                    )}
                  </button>
                </div>
              );
            })}
          </div>
        </div>
        <div className="p-4 space-y-3">
          {showColumnView && currentFile && (
            <ColClassifierColumnView
              objectName={currentFile.fileName}
              columns={columnsByCategory}
              filterUnique={filterUnique}
              onFilterToggle={onFilterToggle}
              atomId={atomId}
            />
          )}
          {/* <div className="grid grid-cols-3 gap-6">
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
          </div> */}
          
          {/* Unified Apply Classification Box */}
          <div className="w-full">
            <Card className="bg-white/80 backdrop-blur-sm overflow-hidden border-2 border-gray-200 rounded-xl">
               <div className="flex items-start gap-3 border-b border-slate-200 px-5 py-3">
                 <div className="flex items-center gap-3 flex-wrap">
                   <span className="text-green-600 font-semibold text-base flex-shrink-0">(1/2)</span> 
                   <div className="flex items-center gap-1 flex-wrap">
                     <span className="text-base font-semibold text-gray-900">Below are column names extracted from the data. Classify them into identifiers</span>
                     <TooltipProvider delayDuration={100}>
                       <Tooltip>
                         <TooltipTrigger asChild>
                           <Info className="w-3.5 h-3.5 text-green-500 cursor-help flex-shrink-0" />
                         </TooltipTrigger>
                         <TooltipContent side="bottom" align="start">
                           <p className="text-xs max-w-xs">Identifiers are unique keys or IDs that distinguish records, such as customer IDs, markets, product codes, or transaction numbers.</p>
                         </TooltipContent>
                       </Tooltip>
                     </TooltipProvider>
                     <span className="text-base font-semibold text-gray-900">or measures</span>
                     <TooltipProvider delayDuration={100}>
                       <Tooltip>
                         <TooltipTrigger asChild>
                           <Info className="w-3.5 h-3.5 text-green-500 cursor-help flex-shrink-0" />
                         </TooltipTrigger>
                         <TooltipContent side="bottom" align="start">
                           <p className="text-xs max-w-xs">Measures are values, numeric or categorical, that represent readings, measurements or calculations, such as sales amounts, number of customers or inventory levels</p>
                         </TooltipContent>
                       </Tooltip>
                     </TooltipProvider>
                   </div>
                 </div>
               </div>
              <div className="p-3">
                <div className="relative rounded-lg bg-white/50 p-4">
                  <div className="space-y-3">
                    {/* Unclassified Section */}
                    <div className="space-y-3">
                      <div className="flex items-center gap-2">
                        <div className="w-2 h-2 rounded-full bg-gradient-to-r from-gray-400 to-gray-500" />
                        <span className="text-sm font-medium text-gray-600">Unclassified</span>
                      </div>
                      <div className="flex flex-wrap gap-3">
                        {columnsByCategory.unclassified.map((column, index) => (
                          <SelectableColumnPill
                            key={`unclassified-${column}-${index}`}
                            name={column}
                            section="unclassified"
                            color="bg-gradient-to-r from-gray-400 to-gray-500"
                            borderColor="border-[#fec107]"
                          />
                        ))}
                      </div>
                    </div>
                    
                    {/* Horizontal Separator */}
                    <div className="border-t border-gray-200"></div>
                    
                    {/* Identifiers Section */}
                    <div className="space-y-3">
                      <div className="flex items-center gap-2">
                        <div className="w-2 h-2 rounded-full bg-gradient-to-r from-blue-500 to-blue-600" />
                        <span className="text-sm font-medium text-gray-600">Identifiers</span>
                      </div>
                      <div className="flex flex-wrap gap-3">
                        {columnsByCategory.identifiers.map((column, index) => (
                          <SelectableColumnPill
                            key={`identifiers-${column}-${index}`}
                            name={column}
                            section="identifiers"
                            color="bg-gradient-to-r from-blue-500 to-blue-600"
                            borderColor="border-blue-400"
                          />
                        ))}
                      </div>
                    </div>
                    
                    {/* Horizontal Separator */}
                    <div className="border-t border-gray-200"></div>
                    
                    {/* Measures Section */}
                    <div className="space-y-3">
                      <div className="flex items-center gap-2">
                        <div className="w-2 h-2 rounded-full bg-gradient-to-r from-emerald-500 to-emerald-600" />
                        <span className="text-sm font-medium text-gray-600">Measures</span>
                      </div>
                      <div className="flex flex-wrap gap-3">
                        {columnsByCategory.measures.map((column, index) => (
                          <SelectableColumnPill
                            key={`measures-${column}-${index}`}
                            name={column}
                            section="measures"
                            color="bg-gradient-to-r from-emerald-500 to-emerald-600"
                            borderColor="border-emerald-400"
                          />
                        ))}
                      </div>
                    </div>
                  </div>
                  
                  {/* Drop zones for each category - commented out */}
                  {/* <div className="absolute inset-0 pointer-events-none">
                    <div className="absolute top-0 left-0 right-0 h-1/3">
                      <DroppableZone id="unclassified" />
                    </div>
                    <div className="absolute top-1/3 left-0 right-0 h-1/3">
                      <DroppableZone id="identifiers" />
                    </div>
                    <div className="absolute bottom-0 left-0 right-0 h-1/3">
                      <DroppableZone id="measures" />
                    </div>
                  </div> */}
                  
                  {currentFile?.columns.length === 0 && (
                    <div className="flex items-center justify-center h-32 text-muted-foreground">
                      <span className="text-sm italic">No columns assigned</span>
                    </div>
                  )}
                </div>
              </div>
            </Card>
        </div>
        
        {/* Instructional Text - Show only if no dimensions are configured */}
        {(!settings.dimensions || settings.dimensions.length === 0) && (
          <div className="w-full mt-6">
            <div className="bg-blue-50 border border-blue-200 rounded-lg p-4">
              <div className="flex items-start space-x-3">
                <div className="flex-shrink-0">
                  <div className="w-6 h-6 bg-blue-100 rounded-full flex items-center justify-center">
                    <span className="text-blue-600 text-sm font-semibold">!</span>
                  </div>
                </div>
                <div className="flex-1">
                  <p className="text-sm text-blue-800 leading-relaxed">
                    Now you have to organize identifiers into Dimensions.
                    <br />
                    Dimensions are broad abstractions of identifiers. For example, a Product dimension will hold all product related attributes, such as Product ID, Brand, Flavor and Pack Size.
                    <br />
                    <span className="text-yellow-700 font-medium">Go to Settings section on Properties panel and create relevant dimensions.</span>
                  </p>
                </div>
              </div>
            </div>
          </div>
        )}
        
        {/* <DragOverlay>
          {activeId ? (
            <div className="group relative inline-flex items-center gap-2 px-4 py-2.5 bg-gradient-to-r from-primary/20 to-primary/10 text-primary border border-primary/30 rounded-full text-sm font-medium shadow-2xl backdrop-blur-sm scale-110 rotate-3">
              <GripVertical className="w-3 h-3 opacity-60" />
              <span className="select-none font-medium tracking-wide">
                {activeId.split('-').slice(1).join('-')}
              </span>
              <div className="absolute inset-0 rounded-full bg-gradient-to-r from-transparent via-white/30 to-transparent opacity-100 animate-pulse" />
            </div>
          ) : null}
        </DragOverlay> */}
        
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
                  Classify to:
                </div>
                <button
                  onClick={() => handleClassificationChange('unclassified')}
                  className="w-full px-3 py-2 text-left text-sm hover:bg-gray-50 flex items-center gap-2"
                >
                  <div className="w-2 h-2 rounded-full bg-gradient-to-r from-gray-400 to-gray-500" />
                  Unclassified
                </button>
                <button
                  onClick={() => handleClassificationChange('identifiers')}
                  className="w-full px-3 py-2 text-left text-sm hover:bg-gray-50 flex items-center gap-2"
                >
                  <div className="w-2 h-2 rounded-full bg-gradient-to-r from-blue-500 to-blue-600" />
                  Identifiers
                </button>
                <button
                  onClick={() => handleClassificationChange('measures')}
                  className="w-full px-3 py-2 text-left text-sm hover:bg-gray-50 flex items-center gap-2"
                >
                  <div className="w-2 h-2 rounded-full bg-gradient-to-r from-emerald-500 to-emerald-600" />
                  Measures
                </button>
              </div>,
              portalContainer
            )
          : null}
        </div>
      </div>
      {/* </DndContext> */}
    </>
  );
};

export default ColumnClassifierCanvas;

