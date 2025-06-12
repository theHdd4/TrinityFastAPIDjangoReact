
import React, { useState } from 'react';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Search, ChevronDown, ChevronRight } from 'lucide-react';
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible';
import AtomCard from './AtomCard';
import { atomCategories } from '../AtomCategory/data/atomCategories';

interface AtomLibraryProps {
  onAtomDragStart?: (e: React.DragEvent, atomId: string) => void;
}

const AtomLibrary: React.FC<AtomLibraryProps> = ({ onAtomDragStart }) => {
  const [searchTerm, setSearchTerm] = useState('');
  const [openCategories, setOpenCategories] = useState<string[]>(['Data Sources']);

  const toggleCategory = (categoryName: string) => {
    setOpenCategories(prev => 
      prev.includes(categoryName) 
        ? prev.filter(name => name !== categoryName)
        : [...prev, categoryName]
    );
  };

  const filteredCategories = atomCategories.map(category => ({
    ...category,
    atoms: category.atoms.filter(atom => 
      atom.title.toLowerCase().includes(searchTerm.toLowerCase()) ||
      atom.description.toLowerCase().includes(searchTerm.toLowerCase()) ||
      atom.tags.some(tag => tag.toLowerCase().includes(searchTerm.toLowerCase()))
    )
  })).filter(category => category.atoms.length > 0);

  return (
    <div className="w-80 bg-white border-r border-gray-200 flex flex-col h-full">
      {/* Search Header */}
      <div className="p-4 border-b border-gray-200">
        <div className="relative">
          <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400 w-4 h-4" />
          <Input
            placeholder="Search atoms..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="pl-10 text-sm"
          />
        </div>
      </div>
      
      {/* Atom Categories */}
      <div className="flex-1 overflow-y-auto">
        <div className="p-4 space-y-4">
          {filteredCategories.map((category) => (
            <Collapsible 
              key={category.name}
              open={openCategories.includes(category.name)}
              onOpenChange={() => toggleCategory(category.name)}
            >
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
                {openCategories.includes(category.name) ? (
                  <ChevronDown className="w-4 h-4 text-gray-500" />
                ) : (
                  <ChevronRight className="w-4 h-4 text-gray-500" />
                )}
              </CollapsibleTrigger>
              
              <CollapsibleContent className="pt-2">
                <div className="ml-4 space-y-3">
                  {category.atoms.map((atom) => (
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
          ))}
        </div>
      </div>
    </div>
  );
};

export default AtomLibrary;
