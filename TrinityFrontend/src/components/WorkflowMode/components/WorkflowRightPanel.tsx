import React, { useState, useMemo, useEffect } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { 
  Database, Filter, BarChart3, Brain, TrendingUp, Target, Settings, DollarSign,
  FileQuestion, X, ChevronDown, Search, Atom
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { Badge } from '@/components/ui/badge';
import { TRINITY_V1_ATOMS_API } from '@/lib/api';
import { atomIconMap } from '../utils/atomIconMap';
import AtomTooltip from './AtomTooltip';
import { TrinityAIIcon } from '@/components/TrinityAI';
import WorkflowAIPanel from '@/components/TrinityAI/WorkflowAIPanel';
import {
  ContextMenu,
  ContextMenuContent,
  ContextMenuItem,
  ContextMenuTrigger,
} from "@/components/ui/context-menu";

interface WorkflowRightPanelProps {
  molecules: Array<{ id: string; title: string }>;
  onAtomAssignToMolecule: (atomId: string, moleculeId: string) => void;
  onMultipleAtomsAssignToMolecule?: (atomIds: string[], moleculeId: string) => void;
  assignedAtoms?: string[];
  onAtomLibraryVisibilityChange?: (isVisible: boolean) => void;
  onRightPanelToolVisibilityChange?: (isVisible: boolean) => void;
  onMoleculeAdd?: (molecule: any) => void;
  onRenderWorkflow?: () => void;
  onCheckCanvasHasMolecules?: () => boolean;
  onGetAICreatedMolecules?: () => string[];
  onClearAIMolecules?: () => void;
  onGetRightmostPosition?: () => number;
}

interface Atom {
  id: string;
  name: string;
  description: string;
  category: string;
  tags: string[];
  color: string;
}

interface AtomCategory {
  name: string;
  icon: any;
  color: string;
  atoms: Atom[];
}

type PanelType = 'trinityAI' | 'atoms' | 'custom' | null;

const WorkflowRightPanel: React.FC<WorkflowRightPanelProps> = ({ 
  molecules,
  onAtomAssignToMolecule,
  onMultipleAtomsAssignToMolecule,
  assignedAtoms = [],
  onAtomLibraryVisibilityChange,
  onRightPanelToolVisibilityChange,
  onMoleculeAdd,
  onRenderWorkflow,
  onCheckCanvasHasMolecules,
  onGetAICreatedMolecules,
  onClearAIMolecules,
  onGetRightmostPosition
}) => {
  const [activePanel, setActivePanel] = useState<PanelType>(null);
  const [selectedAtomForAssignment, setSelectedAtomForAssignment] = useState<string | null>(null);
  const [selectedAtoms, setSelectedAtoms] = useState<string[]>([]);
  const [atoms, setAtoms] = useState<Atom[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [searchTerm, setSearchTerm] = useState('');

  // Fetch atoms from API
  useEffect(() => {
    const fetchAtoms = async () => {
      try {
        setLoading(true);
        setError(null);
        const response = await fetch(`${TRINITY_V1_ATOMS_API}/atoms-for-frontend/`, {
          credentials: 'include'
        });

        if (response.ok) {
          const data = await response.json();
          setAtoms(data.atoms || []);
        } else {
          setError('Failed to fetch atoms');
        }
      } catch (err) {
        setError('Error fetching atoms');
        console.error('Error fetching atoms:', err);
      } finally {
        setLoading(false);
      }
    };

    fetchAtoms();
  }, []);

  // Group atoms by category with correct order and icons (matching laboratory mode)
  const atomCategories = useMemo(() => {
    // Define category order and icons (matching laboratory mode)
    const categoryConfig = [
      { name: 'Data Sources', icon: Database, color: 'bg-blue-500' },
      { name: 'Data Processing', icon: Filter, color: 'bg-green-500' },
      { name: 'Analytics', icon: BarChart3, color: 'bg-purple-500' },
      { name: 'Machine Learning', icon: Brain, color: 'bg-orange-500' },
      { name: 'Visualization', icon: TrendingUp, color: 'bg-pink-500' },
      { name: 'Planning & Optimization', icon: Target, color: 'bg-indigo-500' },
      { name: 'Utilities', icon: Settings, color: 'bg-gray-500' },
      { name: 'Business Intelligence', icon: DollarSign, color: 'bg-emerald-500' }
    ];

    const categoryMap = new Map<string, AtomCategory>();
    
    // Initialize categories in correct order
    categoryConfig.forEach(config => {
      categoryMap.set(config.name, {
        name: config.name,
        icon: config.icon,
        color: config.color,
        atoms: []
      });
    });
    
    // Add atoms to their categories
    atoms.forEach(atom => {
      if (categoryMap.has(atom.category)) {
        categoryMap.get(atom.category)!.atoms.push(atom);
      }
    });

    // Return categories in the correct order, only including those with atoms
    return categoryConfig
      .map(config => categoryMap.get(config.name)!)
      .filter(category => category.atoms.length > 0);
  }, [atoms]);

  const [collapsedCategories, setCollapsedCategories] = useState<Record<string, boolean>>(() => {
    // Initialize all categories as collapsed by default
    const initialCollapsed: Record<string, boolean> = {};
    atomCategories.forEach(category => {
      initialCollapsed[category.name] = true;
    });
    return initialCollapsed;
  });

  // Notify parent about initial atom library visibility state and any right panel tool visibility
  React.useEffect(() => {
    if (onAtomLibraryVisibilityChange) {
      onAtomLibraryVisibilityChange(activePanel === 'atoms');
    }
    if (onRightPanelToolVisibilityChange) {
      onRightPanelToolVisibilityChange(activePanel !== null);
    }
  }, [activePanel, onAtomLibraryVisibilityChange, onRightPanelToolVisibilityChange]);

  const togglePanel = (panel: PanelType) => {
    const newActivePanel = activePanel === panel ? null : panel;
    setActivePanel(newActivePanel);
    
    // Notify parent about atom library visibility changes
    if (onAtomLibraryVisibilityChange) {
      onAtomLibraryVisibilityChange(newActivePanel === 'atoms');
    }
    // Notify parent about any right panel tool visibility changes
    if (onRightPanelToolVisibilityChange) {
      onRightPanelToolVisibilityChange(newActivePanel !== null);
    }
  };

  const toggleCategoryCollapse = (categoryName: string) => {
    setCollapsedCategories(prev => ({ ...prev, [categoryName]: !prev[categoryName] }));
  };

  // Filter atoms based on search term
  const filteredAtomCategories = useMemo(() => {
    if (!searchTerm.trim()) return atomCategories;
    
    return atomCategories.map(category => ({
      ...category,
      atoms: category.atoms.filter(atom => 
        atom.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
        atom.id.toLowerCase().includes(searchTerm.toLowerCase())
      )
    })).filter(category => category.atoms.length > 0);
  }, [searchTerm, atomCategories]);

  const handleAtomClick = (atomId: string, event: React.MouseEvent) => {
    // Always allow multi-select - no need for Ctrl/Cmd key
    setSelectedAtoms(prev => 
      prev.includes(atomId) 
        ? prev.filter(id => id !== atomId)
        : [...prev, atomId]
    );
    
    // Update the single selected atom for assignment
    setSelectedAtomForAssignment(atomId);
  };

  const handleAssignToMolecule = (moleculeId: string) => {
    if (selectedAtoms.length > 0) {
      if (onMultipleAtomsAssignToMolecule) {
        onMultipleAtomsAssignToMolecule(selectedAtoms, moleculeId);
      } else {
        selectedAtoms.forEach(atomId => {
          onAtomAssignToMolecule(atomId, moleculeId);
        });
      }
      setSelectedAtoms([]);
      setSelectedAtomForAssignment(null);
    } else if (selectedAtomForAssignment) {
      onAtomAssignToMolecule(selectedAtomForAssignment, moleculeId);
      setSelectedAtomForAssignment(null);
    }
  };

  return (
    <div className="flex h-full">
      {/* Panel Area - Always mounted to preserve state */}
      <div className={`h-full flex flex-col bg-white border-r border-gray-200 ${activePanel === 'trinityAI' ? '' : 'hidden'}`}>
        <WorkflowAIPanel 
          isCollapsed={activePanel !== 'trinityAI'}
          onToggle={() => setActivePanel(activePanel === 'trinityAI' ? null : 'trinityAI')}
          workflowContext={{
            workflowName: localStorage.getItem('workflow-name') || 'Untitled Workflow',
            canvasMolecules: JSON.parse(localStorage.getItem('workflow-canvas-molecules') || '[]'),
            customMolecules: JSON.parse(localStorage.getItem('workflow-custom-molecules') || '[]')
          }}
          onMoleculeAdd={onMoleculeAdd}
          onRenderWorkflow={onRenderWorkflow}
          onCheckCanvasHasMolecules={onCheckCanvasHasMolecules}
          onGetAICreatedMolecules={onGetAICreatedMolecules}
          onClearAIMolecules={onClearAIMolecules}
          onGetRightmostPosition={onGetRightmostPosition}
        />
      </div>
      
      {activePanel === 'atoms' && (
        <div className="w-80 bg-white border-r border-gray-200 flex flex-col">
          <div className="px-4 py-3 border-b border-gray-200 flex items-center justify-between">
            <h3 className="font-semibold text-gray-900">Atom Library</h3>
            <button
              className="w-6 h-6 flex items-center justify-center hover:bg-gray-100 rounded"
              onClick={() => setActivePanel(null)}
            >
              <X className="w-4 h-4 text-gray-600" />
            </button>
          </div>
          <div className="flex-1 overflow-y-auto scrollbar-thin scrollbar-thumb-gray-300">
            <div className="p-6 space-y-6">
              <div className="space-y-3">
                
                {/* Search Input */}
                <div className="relative">
                  <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-gray-400" />
                  <Input
                    type="text"
                    placeholder="Search atoms..."
                    value={searchTerm}
                    onChange={(e) => setSearchTerm(e.target.value)}
                    className="pl-10 pr-4 py-2 text-sm border-gray-200 focus:border-blue-300 focus:ring-1 focus:ring-blue-300"
                    disabled={loading}
                  />
                </div>
                
                <p className="text-xs text-gray-600 leading-relaxed">
                  {loading 
                    ? 'Loading available atoms...'
                    : selectedAtoms.length > 0 
                      ? `Click atoms to select (${selectedAtoms.length} selected). Right-click to assign to a molecule.`
                      : 'Click atoms to select multiple, then right-click to assign to a molecule'}
                </p>
              </div>

              {/* Loading State */}
              {loading && (
                <div className="flex items-center justify-center py-8">
                  <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-500"></div>
                  <span className="ml-3 text-sm text-gray-600">Loading atoms...</span>
                </div>
              )}

              {/* Error State */}
              {error && (
                <div className="bg-red-50 border border-red-200 rounded-lg p-4">
                  <p className="text-sm text-red-600">{error}</p>
                </div>
              )}

              {/* Atoms List */}
              {!loading && !error && (
                <>
                  {filteredAtomCategories.map(category => {
                    const CategoryIcon = category.icon;
                    const isCollapsed = collapsedCategories[category.name];
                    const availableAtoms = category.atoms.filter(atom => !assignedAtoms.includes(atom.id));
                
                const categoryColor = category.color;
                
                return (
                  <div key={category.name} className="space-y-4">
                    <div 
                      className="flex items-center gap-2.5 pb-3 border-b border-gray-200 cursor-pointer hover:bg-gray-50 p-2 -m-2 rounded-lg transition-colors"
                      onClick={() => toggleCategoryCollapse(category.name)}
                    >
                      <div className={`p-1.5 rounded-lg ${categoryColor} border border-gray-200`}>
                        <CategoryIcon className="h-3.5 w-3.5 text-white" />
                      </div>
                      <div className="flex-1">
                        <h4 className="font-semibold text-sm text-gray-900 tracking-tight">{category.name}</h4>
                      </div>
                      <div className="flex items-center gap-2">
                        <button className="p-1 hover:bg-gray-100 rounded transition-colors">
                          <ChevronDown 
                            className={cn(
                              "h-4 w-4 text-gray-600 transition-transform duration-200",
                              isCollapsed ? '-rotate-90' : 'rotate-0'
                            )} 
                          />
                        </button>
                      </div>
                    </div>
                    {!isCollapsed && (
                      <div className="grid grid-cols-3 gap-3">
                      {category.atoms
                        .filter(atom => !assignedAtoms.includes(atom.id))
                        .map(atom => {
                        const AtomIcon = atomIconMap[atom.id] || Atom;
                        const isSelected = selectedAtoms.includes(atom.id);
                        
                        // Convert category background color to border color
                        const getBorderColor = (bgColor: string) => {
                          const colorMap: Record<string, string> = {
                            'bg-blue-500': 'border-blue-300',
                            'bg-green-500': 'border-green-300',
                            'bg-purple-500': 'border-purple-300',
                            'bg-orange-500': 'border-orange-300',
                            'bg-pink-500': 'border-pink-300',
                            'bg-indigo-500': 'border-indigo-300',
                            'bg-gray-500': 'border-gray-300',
                            'bg-emerald-500': 'border-emerald-300'
                          };
                          return colorMap[bgColor] || 'border-gray-300';
                        };
                        
                        const borderColor = getBorderColor(category.color);
                        
                        return (
                          <ContextMenu key={atom.id}>
                            <ContextMenuTrigger>
                              <AtomTooltip atomId={atom.id}>
                                <div className="flex flex-col items-center space-y-2 p-2 hover:bg-gray-50 rounded-lg cursor-pointer transition-all duration-200">
                                  <div 
                                    className={cn(
                                      "group relative flex items-center justify-center bg-gray-50 rounded-lg hover:shadow-sm transition-all duration-200 h-12 w-12",
                                      borderColor,
                                      "border-2",
                                      isSelected && "bg-blue-50 shadow-sm"
                                    )}
                                    onClick={(e) => handleAtomClick(atom.id, e)}
                                    title={atom.name}
                                  >
                                    <AtomIcon className="h-5 w-5 text-gray-600 transition-colors" />
                                    {isSelected && (
                                      <div className="absolute top-1 right-1 w-2 h-2 bg-blue-500 rounded-full"></div>
                                    )}
                                  </div>
                                  <span className="text-xs text-gray-700 font-medium text-center leading-tight">
                                    {atom.name}
                                  </span>
                                </div>
                              </AtomTooltip>
                            </ContextMenuTrigger>
                            <ContextMenuContent className="min-w-[200px]">
                              <div className="px-2 py-1.5 text-xs font-semibold text-gray-600 border-b border-gray-200 mb-1">
                                {selectedAtoms.length > 1 ? `Assign ${selectedAtoms.length} Atoms to Molecule` : 'Assign to Molecule'}
                              </div>
                              {molecules.length === 0 ? (
                                <div className="px-2 py-6 text-xs text-gray-500 text-center">
                                  No molecules created yet
                                </div>
                              ) : (
                                molecules.map(molecule => (
                                  <ContextMenuItem
                                    key={molecule.id}
                                    onClick={() => handleAssignToMolecule(molecule.id)}
                                    className="cursor-pointer"
                                  >
                                    <span className="font-medium">{molecule.title}</span>
                                  </ContextMenuItem>
                                ))
                              )}
                            </ContextMenuContent>
                          </ContextMenu>
                        );
                      })}
                      </div>
                    )}
                  </div>
                );
              })}
                </>
              )}
            </div>
          </div>
        </div>
      )}

      {activePanel === 'custom' && (
        <div className="w-80 bg-white border-r border-gray-200 flex flex-col">
          <div className="px-4 py-3 border-b border-gray-200 flex items-center justify-between">
            <h3 className="font-semibold text-gray-900">Custom Section</h3>
            <button
              className="w-6 h-6 flex items-center justify-center hover:bg-gray-100 rounded"
              onClick={() => setActivePanel(null)}
            >
              <X className="w-4 h-4 text-gray-600" />
            </button>
          </div>
          <div className="flex-1 overflow-y-auto scrollbar-thin scrollbar-thumb-gray-300">
            <div className="p-4">
              <p className="text-sm text-gray-600">
                This section can be customized for future use.
              </p>
            </div>
          </div>
        </div>
      )}

      {/* Icons Column - Always visible and stays on the right */}
      <div className="bg-white border-l border-gray-200 transition-all duration-300 flex flex-col h-full w-12 flex-shrink-0">
        <div className="p-3 border-b border-gray-200 flex items-center justify-center">
          <button
            onClick={() => togglePanel('trinityAI')}
            className={`group relative w-9 h-9 rounded-lg hover:bg-muted transition-all hover:scale-105 hover:shadow-lg flex items-center justify-center ${
              activePanel === 'trinityAI' ? 'bg-muted text-foreground' : 'text-gray-600'
            }`}
            title="Trinity AI"
            type="button"
          >
            <TrinityAIIcon className="text-purple-500" />
            <span className="absolute right-full mr-2 px-2 py-1 bg-popover text-popover-foreground text-xs rounded opacity-0 group-hover:opacity-100 transition-opacity whitespace-nowrap z-50 pointer-events-none shadow-lg border border-border">
              Trinity AI
            </span>
          </button>
        </div>
        <div className="p-3 border-b border-gray-200 flex items-center justify-center">
          <button
            onClick={() => togglePanel('atoms')}
            className={`group relative w-9 h-9 rounded-lg hover:bg-muted transition-all hover:scale-105 hover:shadow-lg flex items-center justify-center ${
              activePanel === 'atoms' ? 'bg-muted text-foreground' : 'text-gray-600'
            }`}
            title="Atom Library"
            type="button"
          >
            <Atom className="w-4 h-4" />
            <span className="absolute right-full mr-2 px-2 py-1 bg-popover text-popover-foreground text-xs rounded opacity-0 group-hover:opacity-100 transition-opacity whitespace-nowrap z-50 pointer-events-none shadow-lg border border-border">
              Atom Library
            </span>
          </button>
        </div>
        <div className="p-3 flex items-center justify-center">
          <button
            onClick={() => togglePanel('custom')}
            className={`group relative w-9 h-9 rounded-lg hover:bg-muted transition-all hover:scale-105 hover:shadow-lg flex items-center justify-center ${
              activePanel === 'custom' ? 'bg-muted text-foreground' : 'text-gray-600'
            }`}
            title="Custom Section"
            type="button"
          >
            <FileQuestion className="w-4 h-4" />
            <span className="absolute right-full mr-2 px-2 py-1 bg-popover text-popover-foreground text-xs rounded opacity-0 group-hover:opacity-100 transition-opacity whitespace-nowrap z-50 pointer-events-none shadow-lg border border-border">
              Custom Section
            </span>
          </button>
        </div>
      </div>
    </div>
  );
};

export default WorkflowRightPanel;
