
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
      console.log('🗑️ Attempting to delete molecule:', molecule.id);
      
      // Delete the molecule from the backend using the standard DELETE endpoint
      // No project_id needed since molecules are shared across all projects
      const deleteUrl = `${CUSTOM_MOLECULES_API}/${molecule.id}/`;
      console.log('🗑️ Delete URL:', deleteUrl);
      
      const response = await fetch(deleteUrl, {
        method: 'DELETE',
        headers: {
          'Content-Type': 'application/json',
        },
        credentials: 'include',
      });

      console.log('🗑️ Delete response status:', response.status);
      console.log('🗑️ Delete response ok:', response.ok);

      if (response.ok) {
        const result = await response.json();
        console.log('🗑️ Delete response data:', result);
        
        // Call the parent's delete callback to update the UI
        onDelete(molecule.id);
        console.log('✅ Molecule deleted successfully');
      } else {
        const errorText = await response.text();
        console.error('❌ Failed to delete molecule:', response.status, response.statusText);
        console.error('❌ Error response:', errorText);
      }
    } catch (error) {
      console.error('❌ Error deleting molecule:', error);
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
    // Supports both display names and atom IDs (kebab-case)
    const atomCategoryMap: Record<string, string> = {
      // Data Sources - Blue
      'Data Upload Validate': 'blue',
      'data-upload-validate': 'blue',
      'CSV Import': 'blue',
      'csv-import': 'blue', 
      'JSON Import': 'blue',
      'json-import': 'blue',
      'Database Connect': 'blue',
      'database-connect': 'blue',
      
      // Data Processing - Green
      'Feature Overview': 'green',
      'feature-overview': 'green',
      'GroupBy Weighted Average': 'green',
      'groupby-weighted-average': 'green',
      'groupby-wtg-avg': 'green',
      'Merge': 'green',
      'merge': 'green',
      'Concat': 'green',
      'concat': 'green',
      'Scope Selector': 'green',
      'scope-selector': 'green',
      'Row Operations': 'green',
      'row-operations': 'green',
      'Column Classifier': 'green',
      'column-classifier': 'green',
      'Create and Transform Features': 'green',
      'create-column': 'green',
      'Dataframe Operations': 'green',
      'dataframe-operations': 'green',
      
      // Analytics - Purple
      'Correlation': 'purple',
      'correlation': 'purple',
      'EDA': 'purple',
      'eda': 'purple',
      'Explore': 'purple',
      'explore': 'purple',
      'Descriptive Stats': 'purple',
      'descriptive-stats': 'purple',
      'Trend Analysis': 'purple',
      'trend-analysis': 'purple',
      
      // Machine Learning - Orange
      'Auto-regressive models': 'orange',
      'auto-regressive-models': 'orange',
      'Model Output - Non CSF': 'orange',
      'model-output-non-csf': 'orange',
      'Single Modeling': 'orange',
      'single-modeling': 'orange',
      'Bulk Model Output - CSF': 'orange',
      'bulk-model-output-csf': 'orange',
      'Bulk Modeling': 'orange',
      'bulk-modeling': 'orange',
      'Model Performance': 'orange',
      'model-performance': 'orange',
      'Model Selector': 'orange',
      'model-selector': 'orange',
      'Clustering': 'orange',
      'clustering': 'orange',
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
      'chart-maker': 'pink',
      'Text Box': 'pink',
      'text-box': 'pink',
      'Scatter Plot': 'pink',
      'scatter-plot': 'pink',
      'Histogram': 'pink',
      'histogram': 'pink',
      
      // Planning & Optimization - Indigo
      'Scenario Planner': 'indigo',
      'scenario-planner': 'indigo',
      'Optimizer': 'indigo',
      'optimizer': 'indigo',
      
      // Utilities - Gray
      'Atom Maker': 'gray',
      'atom-maker': 'gray',
      'Read Presentation Summarize': 'gray',
      'read-presentation-summarize': 'gray',
      
      // Business Intelligence - Emerald
      'Base Price Estimator': 'emerald',
      'base-price-estimator': 'emerald',
      'Promo Estimator': 'emerald',
      'promo-estimator': 'emerald',
      'Promo Comparison': 'emerald',
      'promo-comparison': 'emerald',
      'Promotion Intensity Analysis': 'emerald',
      'promotion-intensity-analysis': 'emerald',
    };
    
    return atomCategoryMap[atomName] || 'blue'; // Default to blue instead of gray for better visual appeal
  };

  const getMoleculeColor = () => {
    // Determine the primary category color based on the first atom in the molecule
    const primaryAtom = molecule.atoms[0];
    const categoryColor = primaryAtom ? getCategoryColor(primaryAtom) : 'blue';
    
    switch (categoryColor) {
      case 'blue': return 'bg-gradient-to-br from-blue-500 to-blue-600 shadow-blue-200/50';
      case 'green': return 'bg-gradient-to-br from-green-500 to-green-600 shadow-green-200/50';
      case 'purple': return 'bg-gradient-to-br from-purple-500 to-purple-600 shadow-purple-200/50';
      case 'orange': return 'bg-gradient-to-br from-orange-500 to-orange-600 shadow-orange-200/50';
      case 'pink': return 'bg-gradient-to-br from-pink-500 to-pink-600 shadow-pink-200/50';
      case 'indigo': return 'bg-gradient-to-br from-indigo-500 to-indigo-600 shadow-indigo-200/50';
      case 'emerald': return 'bg-gradient-to-br from-emerald-500 to-emerald-600 shadow-emerald-200/50';
      case 'gray': return 'bg-gradient-to-br from-gray-500 to-gray-600 shadow-gray-200/50';
      default: return 'bg-gradient-to-br from-blue-500 to-blue-600 shadow-blue-200/50';
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
      default: return 'border-2 border-blue-400 hover:border-blue-500 hover:shadow-blue-200/30';
    }
  };

  const getMoleculeBackground = () => {
    const primaryAtom = molecule.atoms[0];
    const categoryColor = primaryAtom ? getCategoryColor(primaryAtom) : 'blue';
    
    switch (categoryColor) {
      case 'blue': return 'border-l-4 border-l-blue-500 bg-white shadow-lg hover:shadow-xl transition-all duration-300';
      case 'green': return 'border-l-4 border-l-green-500 bg-white shadow-lg hover:shadow-xl transition-all duration-300';
      case 'purple': return 'border-l-4 border-l-purple-500 bg-white shadow-lg hover:shadow-xl transition-all duration-300';
      case 'orange': return 'border-l-4 border-l-orange-500 bg-white shadow-lg hover:shadow-xl transition-all duration-300';
      case 'pink': return 'border-l-4 border-l-pink-500 bg-white shadow-lg hover:shadow-xl transition-all duration-300';
      case 'indigo': return 'border-l-4 border-l-indigo-500 bg-white shadow-lg hover:shadow-xl transition-all duration-300';
      case 'emerald': return 'border-l-4 border-l-emerald-500 bg-white shadow-lg hover:shadow-xl transition-all duration-300';
      case 'gray': return 'border-l-4 border-l-gray-500 bg-white shadow-lg hover:shadow-xl transition-all duration-300';
      default: return 'border-l-4 border-l-blue-500 bg-white shadow-lg hover:shadow-xl transition-all duration-300';
    }
  };

  const getBadgeColor = () => {
    const primaryAtom = molecule.atoms[0];
    const categoryColor = primaryAtom ? getCategoryColor(primaryAtom) : 'blue';
    
    switch (categoryColor) {
      case 'blue': return 'bg-gradient-to-r from-blue-500 to-purple-600 text-white border-0';
      case 'green': return 'bg-gradient-to-r from-green-500 to-teal-600 text-white border-0';
      case 'purple': return 'bg-gradient-to-r from-purple-500 to-pink-600 text-white border-0';
      case 'orange': return 'bg-gradient-to-r from-orange-500 to-red-600 text-white border-0';
      case 'pink': return 'bg-gradient-to-r from-pink-500 to-rose-600 text-white border-0';
      case 'indigo': return 'bg-gradient-to-r from-indigo-500 to-blue-600 text-white border-0';
      case 'emerald': return 'bg-gradient-to-r from-emerald-500 to-green-600 text-white border-0';
      case 'gray': return 'bg-gradient-to-r from-gray-500 to-slate-600 text-white border-0';
      default: return 'bg-gradient-to-r from-blue-500 to-purple-600 text-white border-0';
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
        <div className={`space-y-4 p-4 rounded-xl ${getMoleculeBackground()} transition-all duration-200`}>
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
          <span className={`text-xs px-3 py-1.5 rounded-full font-medium shadow-sm ${getBadgeColor()}`}>
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
        <div className="grid grid-cols-4 gap-3 pl-2">
          {molecule.atoms.map((atom, index) => {
            const borderColor = getAtomBorderColor(atom);
            const AtomIcon = getAtomIcon(atom);
            const categoryColor = getCategoryColor(atom);
            
            return (
              <div key={index} className="flex flex-col items-center space-y-2">
                <div 
                  className={cn(
                     "group relative flex items-center justify-center bg-white rounded-xl hover:shadow-lg cursor-pointer transition-all duration-300 h-10 w-10 transform hover:scale-105",
                    borderColor
                  )}
                  title={atom}
                >
                   <AtomIcon className="h-4 w-4 text-gray-600 group-hover:text-gray-700 transition-colors" />
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