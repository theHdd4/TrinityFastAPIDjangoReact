import React from 'react';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';

export type ElementType = 'text-box' | 'metric-card' | 'insight-panel' | 'qa' | 'caption' | 'interactive-blocks' | 'chart' | 'table' | 'image';

interface ElementDropdownProps {
  value?: ElementType;
  onValueChange: (value: ElementType) => void;
}

const ElementDropdown: React.FC<ElementDropdownProps> = ({ value, onValueChange }) => {
  const elements = [
    { value: 'text-box' as ElementType, label: 'Text Box' },
    { value: 'metric-card' as ElementType, label: 'Metric Card' },
    { value: 'insight-panel' as ElementType, label: 'Insight Panel' },
    { value: 'qa' as ElementType, label: 'Q&A' },
    { value: 'caption' as ElementType, label: 'Caption' },
    { value: 'interactive-blocks' as ElementType, label: 'Interactive Blocks' },
    { value: 'chart' as ElementType, label: 'Chart' },
    { value: 'table' as ElementType, label: 'Table' },
    { value: 'image' as ElementType, label: 'Image' }
  ];

  return (
    <Select value={value} onValueChange={onValueChange}>
      <SelectTrigger className="w-full bg-background border-border">
        <SelectValue placeholder="Select element type..." />
      </SelectTrigger>
      <SelectContent className="bg-background border-border z-50">
        {elements.map((element) => (
          <SelectItem 
            key={element.value} 
            value={element.value}
            className="cursor-pointer hover:bg-accent"
          >
            {element.label}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
};

export default ElementDropdown;

