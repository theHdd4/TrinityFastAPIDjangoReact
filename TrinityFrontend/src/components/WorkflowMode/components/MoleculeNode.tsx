import React from 'react';
import { Card } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Checkbox } from '@/components/ui/checkbox';
import { Input } from '@/components/ui/input';
import { X, GripVertical, Settings, Save } from 'lucide-react';
import { toast } from '@/hooks/use-toast';
import { CUSTOM_MOLECULES_API } from '@/lib/api';
import { atomIconMap } from '../utils/atomIconMap';
import { Handle, NodeProps, Position } from 'reactflow';
import {
  ContextMenu,
  ContextMenuContent,
  ContextMenuItem,
  ContextMenuTrigger,
} from "@/components/ui/context-menu";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  DndContext,
  closestCenter,
  KeyboardSensor,
  PointerSensor,
  useSensor,
  useSensors,
  DragEndEvent,
} from '@dnd-kit/core';
import {
  arrayMove,
  SortableContext,
  sortableKeyboardCoordinates,
  useSortable,
  verticalListSortingStrategy,
} from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';

export interface MoleculeNodeData {
  id: string;
  type: string;
  title: string;
  subtitle: string;
  tag: string;
  atoms: string[];
  selectedAtoms: Record<string, boolean>;
  atomOrder: string[];
  onAtomToggle: (moleculeId: string, atom: string, checked: boolean) => void;
  onAtomReorder: (moleculeId: string, newOrder: string[]) => void;
  onRemove: (moleculeId: string) => void;
  onClick: (moleculeId: string) => void;
  onMoveAtomToMolecule?: (atomId: string, fromMoleculeId: string, toMoleculeId: string) => void;
  onMoveAtomToAtomList?: (atomId: string, fromMoleculeId: string) => void;
  onRename?: (moleculeId: string, newName: string) => void;
  availableMolecules?: Array<{ id: string; title: string }>;
}

interface SortableAtomItemProps {
  atom: string;
  isSelected: boolean;
  onToggle: () => void;
  onMoveAtomToMolecule?: (atomId: string, toMoleculeId: string) => void;
  onMoveAtomToAtomList?: (atomId: string) => void;
  availableMolecules?: Array<{ id: string; title: string }>;
  currentMoleculeId: string;
}

const SortableAtomItem: React.FC<SortableAtomItemProps> = ({ 
  atom, 
  isSelected, 
  onToggle, 
  onMoveAtomToMolecule, 
  onMoveAtomToAtomList, 
  availableMolecules = [], 
  currentMoleculeId 
}) => {
  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({ id: atom });

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.5 : 1,
  };

  // Convert atom name to kebab-case for icon map lookup
  const getAtomIconKey = (atomName: string) => {
    return atomName
      .toLowerCase()
      .replace(/\s+/g, '-')
      .replace(/[^a-z0-9-]/g, '');
  };

  // Get the atom icon from the map
  const atomIconKey = getAtomIconKey(atom);
  const AtomIcon = atomIconMap[atomIconKey] || (() => {
    console.log(`No icon found for atom: "${atom}" (key: "${atomIconKey}")`);
    return <div className="w-4 h-4 rounded-full bg-gray-300" />;
  });

  return (
    <ContextMenu>
      <ContextMenuTrigger>
        <div className="relative">
          <div className="flex items-center justify-center p-2">
            <div className="p-2 rounded-md bg-white border border-gray-200 hover:border-blue-300 transition-all duration-200 hover:shadow-md hover:scale-105 bg-gradient-to-br from-white to-gray-50 group relative">
              <AtomIcon className="h-4 w-4 text-gray-600 hover:text-blue-600 transition-colors duration-200" />
            </div>
          </div>
        </div>
      </ContextMenuTrigger>
      <ContextMenuContent className="min-w-[200px]">
        <div className="px-2 py-1.5 text-xs font-semibold text-gray-600 border-b border-gray-200 mb-1">
          Move Atom
        </div>
        <ContextMenuItem
          onClick={() => onMoveAtomToAtomList?.(atom, currentMoleculeId)}
          className="cursor-pointer"
        >
          Move to Atom List
        </ContextMenuItem>
        {availableMolecules.filter(m => m.id !== currentMoleculeId).length > 0 && (
          <>
            <div className="px-2 py-1.5 text-xs font-semibold text-gray-600 border-b border-gray-200 mb-1 mt-2">
              Move to Molecule
            </div>
            {availableMolecules
              .filter(m => m.id !== currentMoleculeId)
              .map(molecule => (
                <ContextMenuItem
                  key={molecule.id}
                  onClick={() => onMoveAtomToMolecule?.(atom, currentMoleculeId, molecule.id)}
                  className="cursor-pointer"
                >
                  {molecule.title}
                </ContextMenuItem>
              ))}
          </>
        )}
      </ContextMenuContent>
    </ContextMenu>
  );
};

const MoleculeNode: React.FC<NodeProps<MoleculeNodeData>> = ({ id, data }) => {
  const [isRenaming, setIsRenaming] = React.useState(false);
  const [newName, setNewName] = React.useState(data.title);

  // Update newName when data.title changes (after rename)
  React.useEffect(() => {
    setNewName(data.title);
  }, [data.title]);
  const sensors = useSensors(
    useSensor(PointerSensor),
    useSensor(KeyboardSensor, {
      coordinateGetter: sortableKeyboardCoordinates,
    })
  );

  // Get category color based on atom categories from laboratory mode
  const getCategoryColor = (atomName: string) => {
    // Map atom names to their categories based on laboratory mode categories
    const atomCategoryMap: Record<string, string> = {
      // Data Sources - Blue
      'Data Upload Validate': 'blue',
      'CSV Import': 'blue', 
      'JSON Import': 'blue',
      'Database Connect': 'blue',
      
      // Data Processing - Green
      'Feature Overview': 'green',
      'GroupBy Weighted Average': 'green',
      'Merge': 'green',
      'Concat': 'green',
      'Scope Selector': 'green',
      'Row Operations': 'green',
      'Column Classifier': 'green',
      'Create Column': 'green',
      'Dataframe Operations': 'green',
      
      // Analytics - Purple
      'Correlation': 'purple',
      'EDA': 'purple',
      'Descriptive Stats': 'purple',
      'Trend Analysis': 'purple',
      
      // Machine Learning - Orange
      'Auto-regressive models': 'orange',
      'Model Output - Non CSF': 'orange',
      'Single Modeling': 'orange',
      'Bulk Model Output - CSF': 'orange',
      'Bulk Modeling': 'orange',
      'Model Performance': 'orange',
      'Model Selector': 'orange',
      'Clustering': 'orange',
      
      // Visualization - Pink
      'Chart Maker': 'pink',
      'Text Box': 'pink',
      'Scatter Plot': 'pink',
      'Histogram': 'pink',
      
      // Planning & Optimization - Indigo
      'Scenario Planner': 'indigo',
      'Optimizer': 'indigo',
      
      // Utilities - Gray
      'Atom Maker': 'gray',
      'Read Presentation Summarize': 'gray',
      
      // Business Intelligence - Emerald
      'Base Price Estimator': 'emerald',
      'Promo Estimator': 'emerald',
      'Promo Comparison': 'emerald',
      'Promotion Intensity Analysis': 'emerald',
    };
    
    return atomCategoryMap[atomName] || 'gray';
  };

  const getTypeColor = (type: string) => {
    // Determine the primary category color based on the first atom in the molecule
    const primaryAtom = data.atomOrder[0];
    const categoryColor = primaryAtom ? getCategoryColor(primaryAtom) : 'gray';
    
    switch (categoryColor) {
      case 'blue': return 'border-blue-300/60 bg-gradient-to-br from-blue-50/90 to-blue-100/50 dark:from-blue-950/40 dark:to-blue-900/20 dark:border-blue-700/40 shadow-blue-200/30 dark:shadow-blue-900/20';
      case 'green': return 'border-green-300/60 bg-gradient-to-br from-green-50/90 to-green-100/50 dark:from-green-950/40 dark:to-green-900/20 dark:border-green-700/40 shadow-green-200/30 dark:shadow-green-900/20';
      case 'purple': return 'border-purple-300/60 bg-gradient-to-br from-purple-50/90 to-purple-100/50 dark:from-purple-950/40 dark:to-purple-900/20 dark:border-purple-700/40 shadow-purple-200/30 dark:shadow-purple-900/20';
      case 'orange': return 'border-orange-300/60 bg-gradient-to-br from-orange-50/90 to-orange-100/50 dark:from-orange-950/40 dark:to-orange-900/20 dark:border-orange-700/40 shadow-orange-200/30 dark:shadow-orange-900/20';
      case 'pink': return 'border-pink-300/60 bg-gradient-to-br from-pink-50/90 to-pink-100/50 dark:from-pink-950/40 dark:to-pink-900/20 dark:border-pink-700/40 shadow-pink-200/30 dark:shadow-pink-900/20';
      case 'indigo': return 'border-indigo-300/60 bg-gradient-to-br from-indigo-50/90 to-indigo-100/50 dark:from-indigo-950/40 dark:to-indigo-900/20 dark:border-indigo-700/40 shadow-indigo-200/30 dark:shadow-indigo-900/20';
      case 'emerald': return 'border-emerald-300/60 bg-gradient-to-br from-emerald-50/90 to-emerald-100/50 dark:from-emerald-950/40 dark:to-emerald-900/20 dark:border-emerald-700/40 shadow-emerald-200/30 dark:shadow-emerald-900/20';
      case 'gray': return 'border-gray-300/60 bg-gradient-to-br from-gray-50/90 to-gray-100/50 dark:from-gray-950/40 dark:to-gray-900/20 dark:border-gray-700/40 shadow-gray-200/30 dark:shadow-gray-900/20';
      default: return 'border-border bg-card shadow-muted/20';
    }
  };

  const getBadgeColor = (type: string) => {
    // Determine the primary category color based on the first atom in the molecule
    const primaryAtom = data.atomOrder[0];
    const categoryColor = primaryAtom ? getCategoryColor(primaryAtom) : 'gray';
    
    switch (categoryColor) {
      case 'blue': return 'bg-blue-100/80 text-blue-700 dark:bg-blue-900/50 dark:text-blue-300 border-blue-300/50 dark:border-blue-700/50';
      case 'green': return 'bg-green-100/80 text-green-700 dark:bg-green-900/50 dark:text-green-300 border-green-300/50 dark:border-green-700/50';
      case 'purple': return 'bg-purple-100/80 text-purple-700 dark:bg-purple-900/50 dark:text-purple-300 border-purple-300/50 dark:border-purple-700/50';
      case 'orange': return 'bg-orange-100/80 text-orange-700 dark:bg-orange-900/50 dark:text-orange-300 border-orange-300/50 dark:border-orange-700/50';
      case 'pink': return 'bg-pink-100/80 text-pink-700 dark:bg-pink-900/50 dark:text-pink-300 border-pink-300/50 dark:border-pink-700/50';
      case 'indigo': return 'bg-indigo-100/80 text-indigo-700 dark:bg-indigo-900/50 dark:text-indigo-300 border-indigo-300/50 dark:border-indigo-700/50';
      case 'emerald': return 'bg-emerald-100/80 text-emerald-700 dark:bg-emerald-900/50 dark:text-emerald-300 border-emerald-300/50 dark:border-emerald-700/50';
      case 'gray': return 'bg-gray-100/80 text-gray-700 dark:bg-gray-900/50 dark:text-gray-300 border-gray-300/50 dark:border-gray-700/50';
      default: return 'bg-muted text-muted-foreground border-border';
    }
  };

  const handleAtomToggle = (atom: string, checked: boolean) => {
    data.onAtomToggle(id, atom, checked);
  };

  const handleRename = () => {
    if (newName.trim() && newName.trim() !== data.title) {
      data.onRename?.(id, newName.trim());
      setIsRenaming(false);
      toast({
        title: "Molecule Renamed",
        description: `"${data.title}" has been renamed to "${newName.trim()}"`,
      });
    } else {
      setIsRenaming(false);
      setNewName(data.title);
      toast({
        title: "Rename Cancelled",
        description: "No changes were made to the molecule name",
        variant: "destructive",
      });
    }
  };

  const handleRemove = () => {
    toast({
      title: "Molecule Removed",
      description: `"${data.title}" has been removed from the canvas`,
    });
    data.onRemove(id);
  };

  const handleRenameCancel = () => {
    setIsRenaming(false);
    setNewName(data.title);
  };

  const handleSaveMolecule = async () => {
    try {
      // Get current app/project information from localStorage
      const currentAppStr = localStorage.getItem('current-app');
      const currentProjectStr = localStorage.getItem('current-project');
      
      let client_id = '';
      let app_id = '';
      let project_id = null;
      
      if (currentAppStr) {
        try {
          const currentApp = JSON.parse(currentAppStr);
          client_id = currentApp.client_name || '';
          app_id = currentApp.app_name || '';
        } catch (e) {
          console.warn('Failed to parse current app:', e);
        }
      }
      
      if (currentProjectStr) {
        try {
          const currentProject = JSON.parse(currentProjectStr);
          project_id = currentProject.id || null;
        } catch (e) {
          console.warn('Failed to parse current project:', e);
        }
      }

      const moleculeData = {
        id: data.id,
        molecule_id: data.id,
        name: data.title,
        title: data.title,
        type: data.type || 'custom', // Provide default value if type is empty
        subtitle: data.subtitle || '',
        tag: data.tag || '',
        atoms: data.atoms || [],
        atom_order: data.atomOrder || [],
        selected_atoms: data.selectedAtoms || {},
        connections: [], // Could be enhanced later
        position: { x: 0, y: 0 }, // Could be enhanced later
        project_id: project_id
      };

      console.log('🔧 Custom Molecules API Debug:', {
        apiUrl: `${CUSTOM_MOLECULES_API}/save_to_library/`,
        moleculeData: moleculeData,
        timestamp: new Date().toISOString()
      });

      const response = await fetch(`${CUSTOM_MOLECULES_API}/save_to_library/`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        credentials: 'include',
        body: JSON.stringify(moleculeData)
      });

      console.log('🔧 API Response:', {
        status: response.status,
        statusText: response.statusText,
        ok: response.ok,
        headers: Object.fromEntries(response.headers.entries())
      });

      if (response.ok) {
        const result = await response.json();
        toast({
          title: "Molecule Saved",
          description: `"${data.title}" has been saved to Client Molecules`,
        });
      } else {
        const errorText = await response.text();
        console.error('🔧 API Error Response:', {
          status: response.status,
          statusText: response.statusText,
          errorBody: errorText
        });
        throw new Error(`Failed to save molecule: ${response.status} ${response.statusText}`);
      }
    } catch (error) {
      console.error('🔧 Error saving molecule:', error);
      toast({
        title: "Save Failed",
        description: "Failed to save molecule. Please try again.",
        variant: "destructive",
      });
    }
  };

  const handleDragEnd = (event: DragEndEvent) => {
    const { active, over } = event;

    if (over && active.id !== over.id) {
      const oldIndex = data.atomOrder.indexOf(active.id as string);
      const newIndex = data.atomOrder.indexOf(over.id as string);
      const newOrder = arrayMove(data.atomOrder, oldIndex, newIndex);
      data.onAtomReorder(id, newOrder);
    }
  };

  return (
    <div className="relative group">
      <Handle 
        id="left"
        type="target" 
        position={Position.Left} 
        className="w-3.5 h-3.5 !bg-primary/70 !border-2 !border-background shadow-md transition-all group-hover:!bg-primary group-hover:scale-125 group-hover:shadow-lg group-hover:shadow-primary/30" 
      />
      <Handle 
        id="right"
        type="source" 
        position={Position.Right} 
        className="w-3.5 h-3.5 !bg-primary/70 !border-2 !border-background shadow-md transition-all group-hover:!bg-primary group-hover:scale-125 group-hover:shadow-lg group-hover:shadow-primary/30" 
      />
      {/* Additional handles for snake pattern connections */}
      <Handle 
        id="right-target"
        type="target" 
        position={Position.Right} 
        className="w-3.5 h-3.5 !bg-green-500/70 !border-2 !border-background shadow-md transition-all group-hover:!bg-green-500 group-hover:scale-125 group-hover:shadow-lg group-hover:shadow-green-500/30" 
      />
      <Handle 
        id="left-target"
        type="target" 
        position={Position.Left} 
        className="w-3.5 h-3.5 !bg-blue-500/70 !border-2 !border-background shadow-md transition-all group-hover:!bg-blue-500 group-hover:scale-125 group-hover:shadow-lg group-hover:shadow-blue-500/30" 
      />
      <Handle 
        id="left-source"
        type="source" 
        position={Position.Left} 
        className="w-3.5 h-3.5 !bg-purple-500/70 !border-2 !border-background shadow-md transition-all group-hover:!bg-purple-500 group-hover:scale-125 group-hover:shadow-lg group-hover:shadow-purple-500/30" 
      />
      <Card
        className={`relative w-56 select-none ${getTypeColor(data.type)} border-2 shadow-lg hover:shadow-xl transition-all duration-300 backdrop-blur-sm rounded-2xl overflow-hidden group hover:scale-105 hover:shadow-2xl hover:shadow-primary/20`}
        onClick={e => {
          e.stopPropagation();
          data.onClick(id);
        }}
      >
        {/* Elegant header with gradient accent */}
        <div className="relative">
          <div className={`h-1 w-full ${getBadgeColor(data.type).split(' ')[0]} opacity-40`} />
          
          {/* Beautiful gradient overlay */}
          <div className="absolute inset-0 bg-gradient-to-br from-white/10 via-transparent to-black/5 pointer-events-none" />
          
          <div className="drag-handle cursor-move p-3 pb-2 relative z-10">
            <div className="flex items-center justify-between mb-1">
              <div className="flex-1 min-w-0">
                {isRenaming ? (
                  <Input
                    value={newName}
                    onChange={(e) => setNewName(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter') {
                        handleRename();
                      } else if (e.key === 'Escape') {
                        handleRenameCancel();
                      }
                    }}
                    onBlur={handleRename}
                    autoFocus
                    className="text-base font-bold h-8 px-2 py-1"
                    placeholder="Enter molecule name"
                  />
                ) : (
                  <h4 className="font-bold text-foreground text-base tracking-tight leading-tight bg-gradient-to-r from-foreground to-foreground/80 bg-clip-text text-transparent truncate">{data.title}</h4>
                )}
              </div>
              
              <div className="flex items-center gap-1 ml-2 flex-shrink-0">
                <DropdownMenu>
                  <DropdownMenuTrigger asChild>
                    <button
                      className="text-muted-foreground/50 hover:text-blue-600 transition-all z-10 p-1.5 rounded-lg hover:bg-blue-50 hover:shadow-sm"
                      onClick={e => {
                        e.stopPropagation();
                      }}
                      title="Molecule settings"
                    >
                      <Settings className="w-4 h-4" />
                    </button>
                  </DropdownMenuTrigger>
                  <DropdownMenuContent align="end" className="w-48">
                    <DropdownMenuItem
                      onClick={(e) => {
                        e.stopPropagation();
                        handleSaveMolecule();
                      }}
                    >
                      <Save className="w-4 h-4 mr-2" />
                      Save to Library
                    </DropdownMenuItem>
                    <DropdownMenuItem
                      onClick={(e) => {
                        e.stopPropagation();
                        setIsRenaming(true);
                      }}
                    >
                      Rename Molecule
                    </DropdownMenuItem>
                    <DropdownMenuItem
                      onClick={(e) => {
                        e.stopPropagation();
                        handleRemove();
                      }}
                      className="text-destructive focus:text-destructive"
                    >
                      Remove Molecule
                    </DropdownMenuItem>
                  </DropdownMenuContent>
                </DropdownMenu>
                <button
                  className="text-muted-foreground/50 hover:text-destructive transition-all z-10 p-1.5 rounded-lg hover:bg-destructive/10 hover:shadow-sm"
                  onClick={e => {
                    e.stopPropagation();
                    handleRemove();
                  }}
                  title="Remove molecule"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>
            </div>
            {data.subtitle && (
              <p className="text-xs text-muted-foreground leading-tight">{data.subtitle}</p>
            )}
          </div>
        </div>
        
        {/* Atoms Section with Drag & Drop */}
        <div className="border-t border-border/50 px-3 py-2 bg-gradient-to-b from-transparent to-muted/5">
          <div className="flex items-center justify-between mb-2">
            <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide bg-gradient-to-r from-muted-foreground to-muted-foreground/70 bg-clip-text text-transparent">
              Atoms
            </p>
            <span className="text-xs text-muted-foreground bg-muted/50 px-2 py-1 rounded-full font-medium">
              {data.atomOrder.length} atoms
            </span>
          </div>
            <div 
              className="grid grid-cols-4 gap-2 max-h-72 overflow-y-auto pr-1"
              onPointerDownCapture={e => e.stopPropagation()}
              style={{ scrollbarWidth: 'thin' }}
            >
            {data.atomOrder.map((atom) => (
              <SortableAtomItem
                key={atom}
                atom={atom}
                isSelected={data.selectedAtoms[atom] || false}
                onToggle={() => handleAtomToggle(atom, !data.selectedAtoms[atom])}
                onMoveAtomToMolecule={data.onMoveAtomToMolecule}
                onMoveAtomToAtomList={data.onMoveAtomToAtomList}
                availableMolecules={data.availableMolecules}
                currentMoleculeId={id}
              />
            ))}
          </div>
        </div>
      </Card>
    </div>
  );
};

export default MoleculeNode;
