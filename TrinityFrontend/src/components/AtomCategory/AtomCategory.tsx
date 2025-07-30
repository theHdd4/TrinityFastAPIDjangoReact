import React from 'react';
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible';
import { ChevronDown, ChevronRight } from 'lucide-react';
import AtomCard from '../AtomList/AtomCard';
import type { AtomCategory } from './data/atomCategories';

interface AtomCategoryProps {
  category: AtomCategory;
  isOpen: boolean;
  toggle: (name: string) => void;
  onAtomDragStart?: (e: React.DragEvent, atomId: string) => void;
}

const AtomCategoryComponent: React.FC<AtomCategoryProps> = ({ category, isOpen, toggle, onAtomDragStart }) => (
  <Collapsible open={isOpen} onOpenChange={() => toggle(category.name)}>
    <CollapsibleTrigger className="flex items-center justify-between w-full p-2 hover:bg-gray-50 rounded-lg transition-colors">
      <div className="flex items-center space-x-3">
        <div className={`w-8 h-8 ${category.color} rounded-lg flex items-center justify-center`}>
          <category.icon className="w-4 h-4 text-white" />
        </div>
        <div className="text-left">
          <h4 className="font-medium text-gray-900 text-sm">{category.name}</h4>
          <p className="text-xs text-gray-500">{category.atoms.length} atoms</p>
        </div>
      </div>
      {isOpen ? <ChevronDown className="w-4 h-4 text-gray-500" /> : <ChevronRight className="w-4 h-4 text-gray-500" />}
    </CollapsibleTrigger>
    <CollapsibleContent className="pt-2">
      <div className="ml-4 space-y-3">
        {category.atoms.map(atom => (
          <AtomCard
            key={atom.id}
            id={atom.id}
            title={atom.title}
            category={atom.category}
            description={atom.description}
            tags={atom.tags}
            color={atom.color}
            onDragStart={onAtomDragStart}
          />
        ))}
      </div>
    </CollapsibleContent>
  </Collapsible>
);

export default AtomCategoryComponent;
