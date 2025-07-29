
import React from 'react';
import { Card } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Grip, MoreVertical } from 'lucide-react';

interface AtomCardProps {
  id: string;
  title: string;
  category: string;
  description: string;
  tags: string[];
  color: string;
  onDragStart?: (e: React.DragEvent, atomId: string) => void;
}

const AtomCard: React.FC<AtomCardProps> = ({
  id,
  title,
  category,
  description,
  tags,
  color,
  onDragStart
}) => {
  const handleDragStart = (e: React.DragEvent) => {
    if (onDragStart) {
      onDragStart(e, id);
    }
  };

  return (
    <Card 
      className="p-4 hover:shadow-lg transition-all duration-200 cursor-grab active:cursor-grabbing border border-gray-200 bg-white group hover:scale-105"
      draggable
      onDragStart={handleDragStart}
    >
      <div className="flex items-start justify-between mb-3">
        <div className="flex items-center space-x-2">
          <Grip className="w-4 h-4 text-gray-400 group-hover:text-gray-600" />
          <Badge variant="secondary" className={`${color} text-white border-0 text-xs`}>
            {category}
          </Badge>
        </div>
        <MoreVertical className="w-4 h-4 text-gray-400 opacity-0 group-hover:opacity-100 transition-opacity" />
      </div>
      
      <h4 className="font-semibold text-gray-900 mb-2 text-sm">{title}</h4>
      <p className="text-xs text-gray-600 mb-3 line-clamp-2">{description}</p>
      
      <div className="flex flex-wrap gap-1">
        {tags.map((tag, index) => (
          <Badge key={index} variant="outline" className="text-xs px-2 py-0.5">
            {tag}
          </Badge>
        ))}
      </div>
    </Card>
  );
};

export default AtomCard;
