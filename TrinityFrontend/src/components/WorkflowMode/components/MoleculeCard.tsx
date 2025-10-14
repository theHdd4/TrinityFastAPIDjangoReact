
import React, { useState } from 'react';
import { Card } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';

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
}

const MoleculeCard: React.FC<MoleculeCardProps> = ({ molecule, canEdit }) => {
  const [isExpanded, setIsExpanded] = useState(false);

  const getTypeColor = (type: string) => {
    switch (type) {
      case 'Build': return 'border-purple-300 bg-purple-50';
      case 'Data Pre-Process': return 'border-blue-300 bg-blue-50';
      case 'Explore': return 'border-green-300 bg-green-50';
      case 'Engineer': return 'border-orange-300 bg-orange-50';
      case 'Pre Process': return 'border-yellow-300 bg-yellow-50';
      case 'Data Exploration': return 'border-pink-300 bg-pink-50';
      default: return 'border-gray-300 bg-gray-50';
    }
  };

  const handleDragStart = (e: React.DragEvent) => {
    if (!canEdit) return;
    console.log('Starting drag for molecule:', molecule.id);
    e.dataTransfer.setData('application/json', JSON.stringify(molecule));
    e.dataTransfer.effectAllowed = 'copy';
  };

  const atomsToShow = isExpanded ? molecule.atoms : molecule.atoms.slice(0, 3);
  const hasMoreAtoms = molecule.atoms.length > 3;

  return (
    <Card
      className={`p-4 ${canEdit ? 'cursor-grab active:cursor-grabbing hover:shadow-md' : 'cursor-not-allowed'} transition-all duration-200 ${getTypeColor(molecule.type)} border-2`}
      draggable={canEdit}
      onDragStart={handleDragStart}
    >
      <div className="mb-3">
        <Badge variant="secondary" className="text-xs font-medium">
          {molecule.type}
        </Badge>
      </div>
      
      <h4 className="font-semibold text-foreground mb-2 text-sm">{molecule.title}</h4>
      <p className="text-xs text-muted-foreground mb-3">{molecule.subtitle}</p>
      
      <div className="space-y-1">
        <p className="text-xs font-medium text-muted-foreground">Atoms ({molecule.atoms.length}):</p>
        <div className="space-y-1">
          {atomsToShow.map((atom, index) => (
            <div key={index} className="text-xs text-foreground bg-card px-2 py-1 rounded border border-border">
              {atom}
            </div>
          ))}
          {hasMoreAtoms && !isExpanded && (
            <button
              onClick={(e) => {
                e.stopPropagation();
                setIsExpanded(true);
              }}
              className="text-xs text-muted-foreground italic hover:text-foreground cursor-pointer transition-colors"
            >
              +{molecule.atoms.length - 3} more atoms
            </button>
          )}
          {isExpanded && hasMoreAtoms && (
            <button
              onClick={(e) => {
                e.stopPropagation();
                setIsExpanded(false);
              }}
              className="text-xs text-muted-foreground italic hover:text-foreground cursor-pointer transition-colors"
            >
              Show less
            </button>
          )}
        </div>
      </div>
    </Card>
  );
};

export default MoleculeCard;