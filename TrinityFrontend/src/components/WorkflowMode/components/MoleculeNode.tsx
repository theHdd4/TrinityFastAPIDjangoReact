import React from 'react';
import { createPortal } from 'react-dom';
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

// Custom Portal Tooltip Component
interface PortalTooltipProps {
  children: React.ReactNode;
  content: string;
  disabled?: boolean;
}

const PortalTooltip: React.FC<PortalTooltipProps> = ({ children, content, disabled = false }) => {
  const [isVisible, setIsVisible] = React.useState(false);
  const [position, setPosition] = React.useState({ x: 0, y: 0 });
  const triggerRef = React.useRef<HTMLDivElement>(null);

  const handleMouseEnter = () => {
    if (disabled) return;
    
    if (triggerRef.current) {
      const rect = triggerRef.current.getBoundingClientRect();
      setPosition({
        x: rect.left + rect.width / 2,
        y: rect.top - 8
      });
    }
    setIsVisible(true);
  };

  const handleMouseLeave = () => {
    setIsVisible(false);
  };

  return (
    <>
      <div
        ref={triggerRef}
        onMouseEnter={handleMouseEnter}
        onMouseLeave={handleMouseLeave}
      >
        {children}
      </div>
      {isVisible && createPortal(
        <div
          className="fixed z-[9999] pointer-events-none"
          style={{
            left: position.x,
            top: position.y,
            transform: 'translateX(-50%) translateY(-100%)'
          }}
        >
          <div className="bg-white text-black text-sm px-2 py-1 rounded shadow-lg whitespace-nowrap border border-gray-200">
            {content}
            <div className="absolute top-full left-1/2 transform -translate-x-1/2 w-0 h-0 border-l-4 border-r-4 border-t-4 border-transparent border-t-white"></div>
          </div>
        </div>,
        document.body
      )}
    </>
  );
};

export interface MoleculeNodeData {
  id: string;
  type: string;
  title: string;
  subtitle: string;
  tag: string;
  atoms: string[];
  selectedAtoms: Record<string, boolean>;
  atomOrder: string[];
  containedMolecules?: Array<{ id: string; title: string; type: string }>; // NEW: Molecules inside this container
  onAtomToggle: (moleculeId: string, atom: string, checked: boolean) => void;
  onAtomReorder: (moleculeId: string, newOrder: string[]) => void;
  onRemove: (moleculeId: string) => void;
  onClick: (moleculeId: string) => void;
  onMoveAtomToMolecule?: (atomId: string, fromMoleculeId: string, toMoleculeId: string) => void;
  onMoveAtomToAtomList?: (atomId: string, fromMoleculeId: string) => void;
  onRename?: (moleculeId: string, newName: string) => void;
  onAddToContainer?: (containerId: string, molecule: any) => void; // NEW: Add molecule to container
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

  // Get category color based on atom categories from laboratory mode
  const getCategoryColor = (atomName: string) => {
    // Map atom names to their categories based on laboratory mode categories
    const atomCategoryMap: Record<string, string> = {
      // Data Sources - Blue
      'Data Upload Validate': 'blue',
      'CSV Import': 'blue', 
      'JSON Import': 'blue',
      'Database Connect': 'blue',
      'data-upload-validate': 'blue',
      'csv-import': 'blue',
      'json-import': 'blue',
      'database-connect': 'blue',
      
      // Data Processing - Green
      'Feature Overview': 'green',
      'GroupBy Weighted Average': 'green',
      'Merge': 'green',
      'Concat': 'green',
      'Scope Selector': 'green',
      'Row Operations': 'green',
      'Column Classifier': 'green',
      'Create and Transform Features': 'green',
      'Dataframe Operations': 'green',
      'feature-overview': 'green',
      'groupby-weighted-average': 'green',
      'merge': 'green',
      'concat': 'green',
      'scope-selector': 'green',
      'row-operations': 'green',
      'column-classifier': 'green',
      'create-column': 'green',
      'dataframe-operations': 'green',
      'groupby-wtg-avg': 'green',
      
      // Analytics - Purple
      'Correlation': 'purple',
      'EDA': 'purple',
      'Descriptive Stats': 'purple',
      'Trend Analysis': 'purple',
      'Explore': 'purple',
      'explore': 'purple',
      'correlation': 'purple',
      'eda': 'purple',
      'descriptive-stats': 'purple',
      'trend-analysis': 'purple',
      
      // Machine Learning - Orange
      'Auto-regressive models': 'orange',
      'Model Output - Non CSF': 'orange',
      'Single Modeling': 'orange',
      'Bulk Model Output - CSF': 'orange',
      'Bulk Modeling': 'orange',
      'Model Performance': 'orange',
      'Model Selector': 'orange',
      'Clustering': 'orange',
      'Scenario Planner': 'orange',
      'Build model - feature based': 'orange',
      'Regression - feature based': 'orange',
      'Select models - feature': 'orange',
      'Evaluate models - feature': 'orange',
      'Select models - auto regressive': 'orange',
      'Evaluate models - auto regressive': 'orange',
      'auto-regressive-models': 'orange',
      'model-output-non-csf': 'orange',
      'single-modeling': 'orange',
      'bulk-model-output-csf': 'orange',
      'bulk-modeling': 'orange',
      'model-performance': 'orange',
      'model-selector': 'orange',
      'clustering': 'orange',
      'scenario-planner': 'orange',
      'build-model-feature-based': 'orange',
      'regression-feature-based': 'orange',
      'select-models-feature': 'orange',
      'evaluate-models-feature': 'orange',
      'select-models-auto-regressive': 'orange',
      'evaluate-models-auto-regressive': 'orange',
      
      // Visualization - Pink
      'Chart Maker': 'pink',
      'Text Box': 'pink',
      'Scatter Plot': 'pink',
      'Histogram': 'pink',
      'chart-maker': 'pink',
      'text-box': 'pink',
      'scatter-plot': 'pink',
      'histogram': 'pink',
      
      // Planning & Optimization - Indigo
      'Optimizer': 'indigo',
      'optimizer': 'indigo',
      
      // Utilities - Gray
      'Atom Maker': 'gray',
      'Read Presentation Summarize': 'gray',
      'atom-maker': 'gray',
      'read-presentation-summarize': 'gray',
      
      // Business Intelligence - Emerald
      'Base Price Estimator': 'emerald',
      'Promo Estimator': 'emerald',
      'Promo Comparison': 'emerald',
      'Promotion Intensity Analysis': 'emerald',
      'base-price-estimator': 'emerald',
      'promo-estimator': 'emerald',
      'promo-comparison': 'emerald',
      'promotion-intensity-analysis': 'emerald',
    };
    
    const exactMatch = atomCategoryMap[atomName];
    if (exactMatch) return exactMatch;
    
    const normalizedName = atomName.toLowerCase().replace(/\s+/g, '-');
    const normalizedMatch = atomCategoryMap[normalizedName];
    if (normalizedMatch) return normalizedMatch;
    
    console.warn(`Atom "${atomName}" not found in category map, defaulting to blue`);
    return 'blue';
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
            <PortalTooltip content={atom}>
              <div className={`p-2 rounded-md bg-white border-2 transition-all duration-200 hover:shadow-md hover:scale-105 bg-gradient-to-br from-white to-gray-50 group relative ${
                getCategoryColor(atom) === 'blue' ? 'border-blue-400 hover:border-blue-500' :
                getCategoryColor(atom) === 'green' ? 'border-green-400 hover:border-green-500' :
                getCategoryColor(atom) === 'purple' ? 'border-purple-400 hover:border-purple-500' :
                getCategoryColor(atom) === 'orange' ? 'border-orange-400 hover:border-orange-500' :
                getCategoryColor(atom) === 'pink' ? 'border-pink-400 hover:border-pink-500' :
                getCategoryColor(atom) === 'indigo' ? 'border-indigo-400 hover:border-indigo-500' :
                getCategoryColor(atom) === 'emerald' ? 'border-emerald-400 hover:border-emerald-500' :
                getCategoryColor(atom) === 'gray' ? 'border-gray-400 hover:border-gray-500' :
                'border-blue-400 hover:border-blue-500'
              }`}>
                <AtomIcon className="h-4 w-4 text-gray-600 hover:text-gray-700 transition-colors duration-200" />
              </div>
            </PortalTooltip>
          </div>
        </div>
      </ContextMenuTrigger>
      <ContextMenuContent className="min-w-[200px]">
        <div className="px-2 py-1.5 text-xs font-semibold text-gray-600 border-b border-gray-200 mb-1">
          Move {atom} to
        </div>
        <ContextMenuItem
          onClick={() => onMoveAtomToAtomList?.(atom, currentMoleculeId)}
          className="cursor-pointer"
        >
          Remove Atom
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
      'data-upload-validate': 'blue',
      'csv-import': 'blue',
      'json-import': 'blue',
      'database-connect': 'blue',
      
      // Data Processing - Green
      'Feature Overview': 'green',
      'GroupBy Weighted Average': 'green',
      'Merge': 'green',
      'Concat': 'green',
      'Scope Selector': 'green',
      'Row Operations': 'green',
      'Column Classifier': 'green',
      'Create and Transform Features': 'green',
      'Dataframe Operations': 'green',
      'feature-overview': 'green',
      'groupby-weighted-average': 'green',
      'merge': 'green',
      'concat': 'green',
      'scope-selector': 'green',
      'row-operations': 'green',
      'column-classifier': 'green',
      'create-column': 'green',
      'dataframe-operations': 'green',
      'groupby-wtg-avg': 'green',
      
      // Analytics - Purple
      'Correlation': 'purple',
      'EDA': 'purple',
      'Descriptive Stats': 'purple',
      'Trend Analysis': 'purple',
      'correlation': 'purple',
      'eda': 'purple',
      'descriptive-stats': 'purple',
      'trend-analysis': 'purple',
      'Explore': 'purple',
      'explore': 'purple',
      
      // Machine Learning - Orange
      'Auto-regressive models': 'orange',
      'Model Output - Non CSF': 'orange',
      'Single Modeling': 'orange',
      'Bulk Model Output - CSF': 'orange',
      'Bulk Modeling': 'orange',
      'Model Performance': 'orange',
      'Model Selector': 'orange',
      'Clustering': 'orange',
      'auto-regressive-models': 'orange',
      'model-output-non-csf': 'orange',
      'single-modeling': 'orange',
      'bulk-model-output-csf': 'orange',
      'bulk-modeling': 'orange',
      'model-performance': 'orange',
      'model-selector': 'orange',
      'clustering': 'orange',
      'scenario-planner': 'orange',
      'Build model - feature based': 'orange',
      'build-model-feature-based': 'orange',
      'Regression - feature based': 'orange',
      'regression-feature-based': 'orange',
      'Select models - feature': 'orange',
      'select-models-feature': 'orange',
      'Evaluate models - feature': 'orange',
      'evaluate-models-feature': 'orange',
      'Select models - auto regressive': 'orange',
      'select-models-auto-regressive': 'orange',
      'Evaluate models - auto regressive': 'orange',
      'evaluate-models-auto-regressive': 'orange',
      
      // Visualization - Pink
      'Chart Maker': 'pink',
      'Text Box': 'pink',
      'Scatter Plot': 'pink',
      'Histogram': 'pink',
      'chart-maker': 'pink',
      'text-box': 'pink',
      'scatter-plot': 'pink',
      'histogram': 'pink',
      
      // Planning & Optimization - Indigo
      'Scenario Planner': 'indigo',
      'Optimizer': 'indigo',
      'optimizer': 'indigo',
      
      // Utilities - Gray
      'Atom Maker': 'gray',
      'Read Presentation Summarize': 'gray',
      'atom-maker': 'gray',
      'read-presentation-summarize': 'gray',
      
      // Business Intelligence - Emerald
      'Base Price Estimator': 'emerald',
      'Promo Estimator': 'emerald',
      'Promo Comparison': 'emerald',
      'Promotion Intensity Analysis': 'emerald',
      'base-price-estimator': 'emerald',
      'promo-estimator': 'emerald',
      'promo-comparison': 'emerald',
      'promotion-intensity-analysis': 'emerald',
    };
    
    // Try exact match first, then try lowercase with hyphens
    const exactMatch = atomCategoryMap[atomName];
    if (exactMatch) return exactMatch;
    
    // Try lowercase with spaces replaced by hyphens
    const normalizedName = atomName.toLowerCase().replace(/\s+/g, '-');
    const normalizedMatch = atomCategoryMap[normalizedName];
    if (normalizedMatch) return normalizedMatch;
    
    // Default to blue instead of gray for better visual appeal
    console.warn(`Atom "${atomName}" not found in category map, defaulting to blue`);
    return 'blue';
  };

  const getTypeColor = (type: string) => {
    // Determine the primary category color based on the first available atom in the molecule
    // If first atom is removed, use the second atom, and so on
    let categoryColor = 'blue'; // Default to blue for new molecules
    
    if (data.atomOrder && data.atomOrder.length > 0) {
      // Find the first available atom and get its category color
      for (let i = 0; i < data.atomOrder.length; i++) {
        const atomColor = getCategoryColor(data.atomOrder[i]);
        if (atomColor !== 'gray') { // Skip gray atoms, use the first non-gray atom
          categoryColor = atomColor;
          break;
        }
      }
      // If all atoms are gray or no atoms found, keep default blue
    }
    
    switch (categoryColor) {
      case 'blue': return 'border-l-4 border-l-blue-500 bg-white shadow-lg hover:shadow-xl transition-all duration-300';
      case 'green': return 'border-l-4 border-l-green-500 bg-white shadow-lg hover:shadow-xl transition-all duration-300';
      case 'purple': return 'border-l-4 border-l-purple-500 bg-white shadow-lg hover:shadow-xl transition-all duration-300';
      case 'orange': return 'border-l-4 border-l-orange-500 bg-white shadow-lg hover:shadow-xl transition-all duration-300';
      case 'pink': return 'border-l-4 border-l-pink-500 bg-white shadow-lg hover:shadow-xl transition-all duration-300';
      case 'indigo': return 'border-l-4 border-l-indigo-500 bg-white shadow-lg hover:shadow-xl transition-all duration-300';
      case 'emerald': return 'border-l-4 border-l-emerald-500 bg-white shadow-lg hover:shadow-xl transition-all duration-300';
      case 'gray': return 'border-l-4 border-l-gray-500 bg-white shadow-lg hover:shadow-xl transition-all duration-300';
      default: return 'border-l-4 border-l-blue-500 bg-white shadow-lg hover:shadow-xl transition-all duration-300'; // Default blue for new molecules
    }
  };

  const getBadgeColor = (type: string) => {
    // Determine the primary category color based on the first available atom in the molecule
    // If first atom is removed, use the second atom, and so on
    let categoryColor = 'blue'; // Default to blue for new molecules
    
    if (data.atomOrder && data.atomOrder.length > 0) {
      // Find the first available atom and get its category color
      for (let i = 0; i < data.atomOrder.length; i++) {
        const atomColor = getCategoryColor(data.atomOrder[i]);
        if (atomColor !== 'gray') { // Skip gray atoms, use the first non-gray atom
          categoryColor = atomColor;
          break;
        }
      }
      // If all atoms are gray or no atoms found, keep default blue
    }
    
    switch (categoryColor) {
      case 'blue': return 'bg-gradient-to-r from-blue-500 to-purple-600 text-white border-0';
      case 'green': return 'bg-gradient-to-r from-green-500 to-teal-600 text-white border-0';
      case 'purple': return 'bg-gradient-to-r from-purple-500 to-pink-600 text-white border-0';
      case 'orange': return 'bg-gradient-to-r from-orange-500 to-red-600 text-white border-0';
      case 'pink': return 'bg-gradient-to-r from-pink-500 to-rose-600 text-white border-0';
      case 'indigo': return 'bg-gradient-to-r from-indigo-500 to-blue-600 text-white border-0';
      case 'emerald': return 'bg-gradient-to-r from-emerald-500 to-green-600 text-white border-0';
      case 'gray': return 'bg-gradient-to-r from-gray-500 to-slate-600 text-white border-0';
      default: return 'bg-gradient-to-r from-blue-500 to-purple-600 text-white border-0'; // Default blue gradient for new molecules
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
        className={`relative w-60 select-none ${getTypeColor(data.type)} rounded-xl overflow-hidden group hover:scale-105 transition-all duration-300`}
        onClick={e => {
          e.stopPropagation();
          data.onClick(id);
        }}
      >
        {/* Header */}
        <div className="relative">
          
          <div className="drag-handle cursor-move p-2 pb-1 relative z-10">
            <div className="flex items-center justify-between mb-1">
              {/* Left-aligned title */}
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
                    className="text-sm font-bold h-8 px-2 py-1"
                    placeholder="Enter molecule name"
                  />
                ) : (
                  <h4 className="font-bold text-foreground text-sm tracking-tight leading-tight bg-gradient-to-r from-foreground to-foreground/80 bg-clip-text text-transparent break-words">{data.title}</h4>
                )}
              </div>
              
              {/* Right-aligned buttons */}
              <div className="flex items-center gap-1 flex-shrink-0 ml-2">
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
        
        {/* Content Section - Atoms or Contained Molecules */}
        <div className="border-t border-border/50 px-2 py-1.5 bg-gradient-to-b from-transparent to-muted/5">
          {/* Check if molecule has atoms or is a container */}
          {data.atomOrder.length > 0 ? (
            // Show atoms section
            <>
              <div className="flex items-center justify-between mb-1.5">
                <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide bg-gradient-to-r from-muted-foreground to-muted-foreground/70 bg-clip-text text-transparent">
                  Atoms
                </p>
                <span className={`text-xs px-3 py-1 rounded-full font-medium ${getBadgeColor(data.type)}`}>
                  {data.atomOrder.length} atoms
                </span>
              </div>
            </>
          ) : (
            // Show empty container state (ready to be replaced) - compact size to match atoms state
            <>
              <div className="flex items-center justify-between mb-1.5">
                <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide bg-gradient-to-r from-muted-foreground to-muted-foreground/70 bg-clip-text text-transparent">
                  Container
                </p>
                <span className={`text-xs px-3 py-1 rounded-full font-medium ${getBadgeColor(data.type)}`}>
                  Empty
                </span>
              </div>
              <div className="text-center py-1">
                <div 
                  className="border-2 border-dashed border-muted-foreground/30 rounded-lg p-2.5 min-h-[56px] transition-colors hover:border-primary/50 flex items-center justify-center"
                  onDragOver={(e) => {
                    e.preventDefault();
                    e.currentTarget.classList.add('border-primary/70', 'bg-primary/5');
                  }}
                  onDragLeave={(e) => {
                    e.currentTarget.classList.remove('border-primary/70', 'bg-primary/5');
                  }}
                  onDrop={(e) => {
                    e.preventDefault();
                    e.stopPropagation(); // Prevent event from bubbling to canvas
                    e.currentTarget.classList.remove('border-primary/70', 'bg-primary/5');
                    
                    const moleculeData = e.dataTransfer.getData('application/json');
                    if (!moleculeData) return;
                    
                    try {
                      const molecule = JSON.parse(moleculeData);
                      
                      // Replace container with the actual molecule
                      data.onAddToContainer?.(id, molecule);
                      
                      console.log(`✅ Replaced container "${id}" with molecule "${molecule.title}"`);
                    } catch (error) {
                      console.error('Error replacing container with molecule:', error);
                    }
                  }}
                >
                  <p className="text-xs text-muted-foreground/60 font-medium">Drag molecules or select atoms</p>
                </div>
              </div>
            </>
          )}
          {/* Show atoms grid when atoms are assigned */}
          {data.atomOrder.length > 0 && (
            <div 
              className="grid grid-cols-5 gap-1.5 max-h-40 overflow-y-auto pr-1"
              onPointerDownCapture={e => e.stopPropagation()}
              style={{ scrollbarWidth: 'thin', overflowX: 'visible' }}
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
          )}
        </div>
      </Card>
    </div>
  );
};

export default MoleculeNode;

