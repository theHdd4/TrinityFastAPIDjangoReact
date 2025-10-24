import React, { useState, useMemo } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { MessageSquare, Atom, FileQuestion, X, Sparkles, ChevronDown, Search } from 'lucide-react';
import { cn } from '@/lib/utils';
import { Badge } from '@/components/ui/badge';
import { atoms as allAtoms } from '@/components/AtomList/data';
import { atomCategories } from '@/components/AtomCategory/data/atomCategories';
import { atomIconMap } from '../utils/atomIconMap';
import AtomTooltip from './AtomTooltip';
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
}

type PanelType = 'chat' | 'atoms' | 'custom' | null;

const WorkflowRightPanel: React.FC<WorkflowRightPanelProps> = ({ 
  molecules,
  onAtomAssignToMolecule,
  onMultipleAtomsAssignToMolecule,
  assignedAtoms = [],
  onAtomLibraryVisibilityChange,
  onRightPanelToolVisibilityChange
}) => {
  const [activePanel, setActivePanel] = useState<PanelType>(null);
  const [selectedAtomForAssignment, setSelectedAtomForAssignment] = useState<string | null>(null);
  const [selectedAtoms, setSelectedAtoms] = useState<string[]>([]);
  const [collapsedCategories, setCollapsedCategories] = useState<Record<string, boolean>>(() => {
    // Initialize all categories as collapsed by default
    const initialCollapsed: Record<string, boolean> = {};
    atomCategories.forEach(category => {
      initialCollapsed[category.name] = true;
    });
    return initialCollapsed;
  });
  const [searchTerm, setSearchTerm] = useState('');

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
        atom.title.toLowerCase().includes(searchTerm.toLowerCase()) ||
        atom.id.toLowerCase().includes(searchTerm.toLowerCase())
      )
    })).filter(category => category.atoms.length > 0);
  }, [searchTerm]);

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
      {/* Panel Area - Shows when active */}
      {activePanel === 'chat' && (
        <div className="w-80 bg-white border-r border-gray-200 flex flex-col">
          <div className="px-4 py-3 border-b border-gray-200 flex items-center justify-between">
            <h3 className="font-semibold text-gray-900">AI Agent Chat</h3>
            <button
              className="w-6 h-6 flex items-center justify-center hover:bg-gray-100 rounded"
              onClick={() => setActivePanel(null)}
            >
              <X className="w-4 h-4 text-gray-600" />
            </button>
          </div>
          <div className="flex-1 overflow-y-auto scrollbar-thin scrollbar-thumb-gray-300">
            <div className="p-4">
              <p className="text-sm text-gray-600 mb-4">
                AI Chat functionality will be integrated here.
              </p>
              <div className="h-96 bg-gray-50 rounded-lg flex items-center justify-center border border-gray-200">
                <p className="text-sm text-gray-500">Chat interface coming soon</p>
              </div>
            </div>
          </div>
        </div>
      )}
      
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
                  />
                </div>
                
                <p className="text-xs text-gray-600 leading-relaxed">
                  {selectedAtoms.length > 0 
                    ? `Click atoms to select (${selectedAtoms.length} selected). Right-click to assign to a molecule.`
                    : 'Click atoms to select multiple, then right-click to assign to a molecule'}
                </p>
              </div>
              
              {filteredAtomCategories.map(category => {
                const CategoryIcon = category.icon;
                const isCollapsed = collapsedCategories[category.name];
                const availableAtoms = category.atoms.filter(atom => !assignedAtoms.includes(atom.id));
                
                // Get category color based on laboratory mode colors
                const getCategoryColor = (categoryName: string) => {
                  switch (categoryName) {
                    case 'Data Sources': return 'bg-blue-500';
                    case 'Data Processing': return 'bg-green-500';
                    case 'Analytics': return 'bg-purple-500';
                    case 'Machine Learning': return 'bg-orange-500';
                    case 'Visualization': return 'bg-pink-500';
                    case 'Planning & Optimization': return 'bg-indigo-500';
                    case 'Utilities': return 'bg-gray-500';
                    case 'Business Intelligence': return 'bg-emerald-500';
                    default: return 'bg-gray-500';
                  }
                };
                
                const categoryColor = getCategoryColor(category.name);
                
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
                        const AtomIcon = atomIconMap[atom.id] || CategoryIcon;
                        const isSelected = selectedAtoms.includes(atom.id);
                        
                        // Get category-based border colors
                        const getCategoryBorderColor = (categoryName: string) => {
                          switch (categoryName) {
                            case 'Data Sources': return 'border-blue-300';
                            case 'Data Processing': return 'border-green-300';
                            case 'Analytics': return 'border-purple-300';
                            case 'Machine Learning': return 'border-orange-300';
                            case 'Visualization': return 'border-pink-300';
                            case 'Planning & Optimization': return 'border-indigo-300';
                            case 'Utilities': return 'border-gray-300';
                            case 'Business Intelligence': return 'border-emerald-300';
                            default: return 'border-gray-300';
                          }
                        };
                        
                        const borderColor = getCategoryBorderColor(category.name);
                        
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
                                    title={atom.title}
                                  >
                                    <AtomIcon className="h-5 w-5 text-gray-600 transition-colors" />
                                    {isSelected && (
                                      <div className="absolute top-1 right-1 w-2 h-2 bg-blue-500 rounded-full"></div>
                                    )}
                                  </div>
                                  <span className="text-xs text-gray-700 font-medium text-center leading-tight">
                                    {atom.title}
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
            onClick={() => togglePanel('chat')}
            className={`group relative w-8 h-8 flex items-center justify-center rounded-md transition-colors hover:bg-gray-100 ${
              activePanel === 'chat' ? 'bg-yellow-100 text-yellow-600' : 'text-gray-600'
            }`}
            title="AI Agent Chat"
          >
            <MessageSquare className="w-4 h-4" />
            <span className="pointer-events-none absolute right-full mr-2 px-2 py-1 bg-popover text-popover-foreground text-xs rounded opacity-0 group-hover:opacity-100 transition-opacity whitespace-nowrap z-50 shadow-lg border border-border">
              AI Agent Chat
            </span>
          </button>
        </div>
        <div className="p-3 border-b border-gray-200 flex items-center justify-center">
          <button
            onClick={() => togglePanel('atoms')}
            className={`group relative w-8 h-8 flex items-center justify-center rounded-md transition-colors hover:bg-gray-100 ${
              activePanel === 'atoms' ? 'bg-yellow-100 text-yellow-600' : 'text-gray-600'
            }`}
            title="Atom Library"
          >
            <Atom className="w-4 h-4" />
            <span className="pointer-events-none absolute right-full mr-2 px-2 py-1 bg-popover text-popover-foreground text-xs rounded opacity-0 group-hover:opacity-100 transition-opacity whitespace-nowrap z-50 shadow-lg border border-border">
              Atom Library
            </span>
          </button>
        </div>
        <div className="p-3 flex items-center justify-center">
          <button
            onClick={() => togglePanel('custom')}
            className={`group relative w-8 h-8 flex items-center justify-center rounded-md transition-colors hover:bg-gray-100 ${
              activePanel === 'custom' ? 'bg-yellow-100 text-yellow-600' : 'text-gray-600'
            }`}
            title="Custom Section"
          >
            <FileQuestion className="w-4 h-4" />
            <span className="pointer-events-none absolute right-full mr-2 px-2 py-1 bg-popover text-popover-foreground text-xs rounded opacity-0 group-hover:opacity-100 transition-opacity whitespace-nowrap z-50 shadow-lg border border-border">
              Custom Section
            </span>
          </button>
        </div>
      </div>
    </div>
  );
};

export default WorkflowRightPanel;
