
import React from 'react';
import { Card } from '@/components/ui/card';

interface ModuleCardProps {
  molecule: {
    id: string;
    type: string;
    title: string;
    subtitle: string;
    tag: string;
  };
}

const ModuleCard: React.FC<ModuleCardProps> = ({ molecule }) => {
  const getTypeColor = (type: string) => {
    switch (type) {
      case 'Data': return 'border-trinity-yellow bg-trinity-yellow-pale';
      case 'EDA': return 'border-trinity-blue bg-blue-50';
      case 'Modeling': return 'border-trinity-green bg-green-50';
      default: return 'border-gray-300 bg-gray-50';
    }
  };

  const handleDragStart = (e: React.DragEvent) => {
    console.log('Starting drag for molecule:', molecule.id);
    e.dataTransfer.setData('application/json', JSON.stringify(molecule));
    e.dataTransfer.effectAllowed = 'copy';
  };

  const handleDragEnd = (e: React.DragEvent) => {
    console.log('Drag ended for molecule:', molecule.id);
  };

  return (
    <Card 
      className={`p-4 cursor-grab active:cursor-grabbing hover:shadow-md transition-all duration-200 ${getTypeColor(molecule.type)} border-2`}
      draggable
      onDragStart={handleDragStart}
      onDragEnd={handleDragEnd}
    >
      <div className="mb-3">
        <span className="text-sm font-medium text-gray-700">{molecule.type}</span>
      </div>
      
      <h4 className="font-semibold text-gray-900 mb-2 text-sm">{molecule.title}</h4>
      <p className="text-xs text-gray-700 mb-3 line-clamp-2">{molecule.subtitle}</p>
      
      <div className="text-xs text-gray-600 bg-white px-2 py-1 rounded">
        Tags: {molecule.tag}
      </div>
    </Card>
  );
};

export default ModuleCard;
