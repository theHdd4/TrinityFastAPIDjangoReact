
import React from 'react';
import { Card } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Grip, MoreVertical } from 'lucide-react';

interface AtomWidgetProps {
  title: string;
  category: string;
  description: string;
  tags: string[];
  color: string;
}

const AtomWidget: React.FC<AtomWidgetProps> = ({
  title,
  category,
  description,
  tags,
  color
}) => {
  return (
    <Card className="p-4 hover:shadow-md transition-shadow cursor-grab active:cursor-grabbing border border-gray-200 bg-white">
      <div className="flex items-start justify-between mb-3">
        <div className="flex items-center space-x-2">
          <Grip className="w-4 h-4 text-gray-400" />
          <Badge variant="secondary" className={`${color} text-white border-0`}>
            {category}
          </Badge>
        </div>
        <MoreVertical className="w-4 h-4 text-gray-400" />
      </div>
      
      <h4 className="font-semibold text-gray-900 mb-2">{title}</h4>
      <p className="text-sm text-gray-600 mb-3">{description}</p>
      
      <div className="flex flex-wrap gap-1">
        {tags.map((tag, index) => (
          <Badge key={index} variant="outline" className="text-xs">
            {tag}
          </Badge>
        ))}
      </div>
    </Card>
  );
};

export default AtomWidget;
