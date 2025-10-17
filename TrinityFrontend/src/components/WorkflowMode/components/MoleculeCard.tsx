
import React, { useState } from 'react';
import { Card } from '@/components/ui/card';
import { GripVertical, ChevronDown, ChevronRight, Trash2 } from 'lucide-react';
import { cn } from '@/lib/utils';
import { atomIconMap } from '../utils/atomIconMap';
import {
  ContextMenu,
  ContextMenuContent,
  ContextMenuItem,
  ContextMenuTrigger,
} from '@/components/ui/context-menu';
import { CUSTOM_MOLECULES_API } from '@/lib/api';

interface MoleculeCardProps {
  molecule: {
    id: string;
    type: string;
    title: string;
    subtitle: string;
    tag: string;
    atoms: string[];
  };
  canEdit: boolean;
  onDelete?: (moleculeId: string) => void;
}

const MoleculeCard: React.FC<MoleculeCardProps> = ({ molecule, canEdit, onDelete }) => {
  const [isCollapsed, setIsCollapsed] = useState(true);

  const handleDelete = async () => {
    if (!onDelete) return;
    
    try {
      // Get current project information
      const currentProjectStr = localStorage.getItem('current-project');
      let project_id = null;
      
      if (currentProjectStr) {
        try {
          const currentProject = JSON.parse(currentProjectStr);
          project_id = currentProject.id || null;
        } catch (e) {
          console.warn('Failed to parse current project:', e);
        }
      }

      if (!project_id) {
        console.error('Project ID not found');
        return;
      }

      // Delete the molecule from the backend using the standard DELETE endpoint
      // No project_id needed since molecules are shared across all projects
      const response = await fetch(`${CUSTOM_MOLECULES_API}/${molecule.id}/`, {
        method: 'DELETE',
        headers: {
          'Content-Type': 'application/json',
        },
        credentials: 'include',
      });

      if (response.ok) {
        // Call the parent's delete callback to update the UI
        onDelete(molecule.id);
        console.log('Molecule deleted successfully');
      } else {
        console.error('Failed to delete molecule:', response.statusText);
      }
    } catch (error) {
      console.error('Error deleting molecule:', error);
    }
  };

  const handleDragStart = (e: React.DragEvent) => {
    if (!canEdit) {
      e.preventDefault();
      return;
    }
    
    e.dataTransfer.setData('application/json', JSON.stringify(molecule));
    e.dataTransfer.effectAllowed = 'copy';
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

  const getMoleculeColor = () => {
    // Determine the primary category color based on the first atom in the molecule
    const primaryAtom = molecule.atoms[0];
    const categoryColor = primaryAtom ? getCategoryColor(primaryAtom) : 'gray';
    
    switch (categoryColor) {
      case 'blue': return 'bg-gradient-to-br from-blue-500 to-blue-600 shadow-blue-200/50';
      case 'green': return 'bg-gradient-to-br from-green-500 to-green-600 shadow-green-200/50';
      case 'purple': return 'bg-gradient-to-br from-purple-500 to-purple-600 shadow-purple-200/50';
      case 'orange': return 'bg-gradient-to-br from-orange-500 to-orange-600 shadow-orange-200/50';
      case 'pink': return 'bg-gradient-to-br from-pink-500 to-pink-600 shadow-pink-200/50';
      case 'indigo': return 'bg-gradient-to-br from-indigo-500 to-indigo-600 shadow-indigo-200/50';
      case 'emerald': return 'bg-gradient-to-br from-emerald-500 to-emerald-600 shadow-emerald-200/50';
      case 'gray': return 'bg-gradient-to-br from-gray-500 to-gray-600 shadow-gray-200/50';
      default: return 'bg-gradient-to-br from-gray-500 to-gray-600 shadow-gray-200/50';
    }
  };

  const getAtomBorderColor = (atomName: string) => {
    const categoryColor = getCategoryColor(atomName);
    
    switch (categoryColor) {
      case 'blue': return 'border-2 border-blue-400 hover:border-blue-500 hover:shadow-blue-200/30';
      case 'green': return 'border-2 border-green-400 hover:border-green-500 hover:shadow-green-200/30';
      case 'purple': return 'border-2 border-purple-400 hover:border-purple-500 hover:shadow-purple-200/30';
      case 'orange': return 'border-2 border-orange-400 hover:border-orange-500 hover:shadow-orange-200/30';
      case 'pink': return 'border-2 border-pink-400 hover:border-pink-500 hover:shadow-pink-200/30';
      case 'indigo': return 'border-2 border-indigo-400 hover:border-indigo-500 hover:shadow-indigo-200/30';
      case 'emerald': return 'border-2 border-emerald-400 hover:border-emerald-500 hover:shadow-emerald-200/30';
      case 'gray': return 'border-2 border-gray-400 hover:border-gray-500 hover:shadow-gray-200/30';
      default: return 'border-2 border-gray-400 hover:border-gray-500 hover:shadow-gray-200/30';
    }
  };

  const getMoleculeBackground = () => {
    const primaryAtom = molecule.atoms[0];
    const categoryColor = primaryAtom ? getCategoryColor(primaryAtom) : 'gray';
    
    switch (categoryColor) {
      case 'blue': return 'bg-gradient-to-br from-blue-50 to-blue-100 border-l-4 border-blue-400 shadow-blue-100/50';
      case 'green': return 'bg-gradient-to-br from-green-50 to-green-100 border-l-4 border-green-400 shadow-green-100/50';
      case 'purple': return 'bg-gradient-to-br from-purple-50 to-purple-100 border-l-4 border-purple-400 shadow-purple-100/50';
      case 'orange': return 'bg-gradient-to-br from-orange-50 to-orange-100 border-l-4 border-orange-400 shadow-orange-100/50';
      case 'pink': return 'bg-gradient-to-br from-pink-50 to-pink-100 border-l-4 border-pink-400 shadow-pink-100/50';
      case 'indigo': return 'bg-gradient-to-br from-indigo-50 to-indigo-100 border-l-4 border-indigo-400 shadow-indigo-100/50';
      case 'emerald': return 'bg-gradient-to-br from-emerald-50 to-emerald-100 border-l-4 border-emerald-400 shadow-emerald-100/50';
      case 'gray': return 'bg-gradient-to-br from-gray-50 to-gray-100 border-l-4 border-gray-400 shadow-gray-100/50';
      default: return 'bg-gradient-to-br from-gray-50 to-gray-100 border-l-4 border-gray-400 shadow-gray-100/50';
    }
  };


  // Convert atom name to kebab-case for icon map lookup
  const getAtomIconKey = (atomName: string) => {
    return atomName
      .toLowerCase()
      .replace(/\s+/g, '-')
      .replace(/[^a-z0-9-]/g, '');
  };

  // Get the atom icon from the map
  const getAtomIcon = (atomName: string) => {
    const iconKey = getAtomIconKey(atomName);
    const AtomIcon = atomIconMap[iconKey];
    
    if (!AtomIcon) {
      console.log(`No icon found for atom: "${atomName}" (key: "${iconKey}")`);
      // Return a default icon if not found
      return GripVertical;
    }
    
    return AtomIcon;
  };

  return (
    <ContextMenu>
      <ContextMenuTrigger asChild>
        <div className={`space-y-4 p-4 rounded-xl ${getMoleculeBackground()} shadow-sm hover:shadow-md transition-all duration-200`}>
          {/* Collapsible Molecule Header */}
          <div 
            className={`flex items-center gap-2.5 pb-3 border-b border-gray-200/50 cursor-pointer hover:bg-white/30 p-2 -m-2 rounded-lg transition-all duration-200 ${canEdit ? 'cursor-grab active:cursor-grabbing' : 'cursor-not-allowed'}`}
            onClick={() => setIsCollapsed(!isCollapsed)}
            draggable={canEdit}
            onDragStart={handleDragStart}
          >
        <div className={`p-1.5 rounded-lg ${getMoleculeColor()} border border-gray-200`}>
          <GripVertical className="h-3.5 w-3.5 text-white" />
        </div>
        <div className="flex-1">
          <h4 className="font-semibold text-sm text-gray-800 tracking-tight">{molecule.title}</h4>
          {molecule.subtitle && (
            <p className="text-xs text-gray-600 mt-0.5 leading-tight">{molecule.subtitle}</p>
          )}
        </div>
        <div className="flex items-center gap-2">
          <span className="text-xs text-white bg-gradient-to-r from-blue-500 to-purple-500 px-3 py-1.5 rounded-full font-medium shadow-sm">
            {molecule.atoms.length} atoms
          </span>
          <button className="p-1 hover:bg-gray-100 rounded transition-colors">
            {isCollapsed ? (
              <ChevronRight className="h-4 w-4 text-gray-600 transition-transform duration-200" />
            ) : (
              <ChevronDown className="h-4 w-4 text-gray-600 transition-transform duration-200" />
            )}
          </button>
        </div>
      </div>

      {/* Collapsible Atoms Content */}
      {!isCollapsed && (
        <div className="grid grid-cols-3 gap-3 pl-2">
          {molecule.atoms.map((atom, index) => {
            const borderColor = getAtomBorderColor(atom);
            const AtomIcon = getAtomIcon(atom);
            const categoryColor = getCategoryColor(atom);
            
            return (
              <div key={index} className="flex flex-col items-center space-y-2">
                <div 
                  className={cn(
                    "group relative flex items-center justify-center bg-white rounded-xl hover:shadow-lg cursor-pointer transition-all duration-300 h-14 w-14 transform hover:scale-105",
                    borderColor
                  )}
                  title={atom}
                >
                  <AtomIcon className={`h-6 w-6 transition-colors ${
                    categoryColor === 'blue' ? 'text-blue-600 group-hover:text-blue-700' :
                    categoryColor === 'green' ? 'text-green-600 group-hover:text-green-700' :
                    categoryColor === 'purple' ? 'text-purple-600 group-hover:text-purple-700' :
                    categoryColor === 'orange' ? 'text-orange-600 group-hover:text-orange-700' :
                    categoryColor === 'pink' ? 'text-pink-600 group-hover:text-pink-700' :
                    categoryColor === 'indigo' ? 'text-indigo-600 group-hover:text-indigo-700' :
                    categoryColor === 'emerald' ? 'text-emerald-600 group-hover:text-emerald-700' :
                    'text-gray-600 group-hover:text-gray-700'
                  }`} />
                </div>
                <span className="text-xs text-gray-700 text-center leading-tight px-1 font-medium">
                  {atom}
                </span>
              </div>
            );
          })}
        </div>
      )}
        </div>
      </ContextMenuTrigger>
      
      <ContextMenuContent className="bg-white border border-gray-200 shadow-lg rounded-lg p-1">
        <ContextMenuItem 
          onClick={handleDelete}
          className="text-red-600 hover:text-red-700 hover:bg-red-50 focus:text-red-700 focus:bg-red-50 cursor-pointer flex items-center px-3 py-2 rounded-md transition-colors"
          disabled={!canEdit || !onDelete}
        >
          <Trash2 className="w-4 h-4 mr-2" />
          Delete Molecule
        </ContextMenuItem>
      </ContextMenuContent>
    </ContextMenu>
  );
};

export default MoleculeCard;