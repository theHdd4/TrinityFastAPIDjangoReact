
import React, { useState, useEffect } from 'react';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Search, ChevronDown, ChevronRight, ChevronLeft } from 'lucide-react';
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible';
import AtomCard from './AtomCard';
import { atomCategories } from '../AtomCategory/data/atomCategories';
import { TRINITY_V1_ATOMS_API } from '@/lib/api';

interface AtomLibraryProps {
  onAtomDragStart?: (e: React.DragEvent, atomId: string) => void;
  onCollapse?: () => void;
}

interface Atom {
  id: string;
  name: string;
  description: string;
  category: string;
  tags: string[];
  color: string;
}

interface AtomCategory {
  name: string;
  icon: any;
  color: string;
  atoms: Atom[];
}

const AtomLibrary: React.FC<AtomLibraryProps> = ({ onAtomDragStart, onCollapse }) => {
  const [searchTerm, setSearchTerm] = useState('');
  const [atoms, setAtoms] = useState<Atom[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  // Collapse categories by default, keeping "Data Sources" and
  // "Data Processing" closed on first load
  const [openCategories, setOpenCategories] = useState<string[]>([]);

  // Fetch atoms from API
  useEffect(() => {
    const fetchAtoms = async () => {
      try {
        setLoading(true);
        const response = await fetch(`${TRINITY_V1_ATOMS_API}/atoms-for-frontend/`, {
          credentials: 'include'
        });

        if (response.ok) {
          const data = await response.json();
          console.log('API Response:', data);
          if (data.success && data.atoms) {
            // Transform API data to match frontend format
            const transformedAtoms = data.atoms.map((atom: any) => ({
              id: atom.id || '',
              name: atom.name || '',
              description: atom.description || '',
              category: atom.category || 'Utilities',
              tags: atom.tags || [], // Use tags from API
              color: atom.color || getCategoryColor(atom.category || 'Utilities')
            }));
            console.log('Transformed atoms:', transformedAtoms.slice(0, 3));
            setAtoms(transformedAtoms);
          } else {
            console.log('No atoms found, using fallback');
            setAtoms([]);
          }
        } else {
          console.log('Failed to fetch atoms, using fallback');
          setAtoms([]);
        }
      } catch (error) {
        console.error('Error fetching atoms:', error);
        setError('Failed to load atoms');
        setAtoms([]);
      } finally {
        setLoading(false);
      }
    };

    fetchAtoms();
  }, []);

  // Helper function to get category color
  const getCategoryColor = (category: string) => {
    const colorMap: Record<string, string> = {
      'Data Sources': 'bg-blue-500',
      'Data Processing': 'bg-green-500',
      'Analytics': 'bg-purple-500',
      'Machine Learning': 'bg-orange-500',
      'Visualization': 'bg-pink-500',
      'Planning & Optimization': 'bg-indigo-500',
      'Utilities': 'bg-gray-500',
      'Business Intelligence': 'bg-teal-500'
    };
    return colorMap[category] || 'bg-gray-500';
  };

  const toggleCategory = (categoryName: string) => {
    setOpenCategories(prev => 
      prev.includes(categoryName) 
        ? prev.filter(name => name !== categoryName)
        : [...prev, categoryName]
    );
  };

  // Group atoms by category
  const groupedAtoms = atoms.reduce((acc, atom) => {
    if (!acc[atom.category]) {
      acc[atom.category] = [];
    }
    acc[atom.category].push(atom);
    return acc;
  }, {} as Record<string, Atom[]>);

  // Create categories from API data
  const apiCategories: AtomCategory[] = Object.entries(groupedAtoms).map(([categoryName, categoryAtoms]) => {
    // Find matching category from hardcoded data for icon and color
    const hardcodedCategory = atomCategories.find(cat => cat.name === categoryName);
    return {
      name: categoryName,
      icon: hardcodedCategory?.icon || Search,
      color: hardcodedCategory?.color || 'bg-gray-500',
      atoms: categoryAtoms
    };
  });

  // Use API categories if available, otherwise fallback to hardcoded
  const categoriesToUse = atoms.length > 0 ? apiCategories : atomCategories;

  const filteredCategories = categoriesToUse.map(category => ({
    ...category,
    atoms: category.atoms.filter(atom => {
      // Safely check if fields exist before calling toLowerCase
      const name = atom.name || '';
      const description = atom.description || '';
      const tags = atom.tags || [];
      
      const searchLower = (searchTerm || '').toLowerCase();
      return name.toLowerCase().includes(searchLower) ||
             description.toLowerCase().includes(searchLower) ||
             tags.some(tag => tag && tag.toLowerCase().includes(searchLower));
    })
  })).filter(category => category.atoms.length > 0);

  // Auto-open categories that have matching atoms when searching
  React.useEffect(() => {
    if (searchTerm.trim()) {
      const categoriesWithMatches = filteredCategories.map(category => category.name);
      setOpenCategories(categoriesWithMatches);
    } else {
      // Close all categories when search is cleared
      setOpenCategories([]);
    }
  }, [searchTerm]);

  return (
    <div className="w-80 bg-white border-r border-gray-200 flex flex-col h-full">
      {/* Search Header */}
      <div className="p-4 border-b border-gray-200">
        <div className="flex items-center">
          <div className="relative flex-1">
            <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400 w-4 h-4" />
            <Input
              placeholder="Search atoms..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="pl-10 text-sm"
              data-atom-search="true"
            />
          </div>
          {onCollapse && (
            <button
              onClick={onCollapse}
              className="ml-2 p-1 hover:bg-gray-100 rounded"
              title="Collapse"
            >
              <ChevronLeft className="w-4 h-4 text-gray-500" />
            </button>
          )}
        </div>
      </div>
      
      {/* Atom Categories */}
      <div className="flex-1 overflow-y-auto">
        <div className="p-4 space-y-4">
          {loading && (
            <div className="flex items-center justify-center py-8">
              <div className="text-sm text-gray-500">Loading atoms...</div>
            </div>
          )}
          
          {error && (
            <div className="flex items-center justify-center py-8">
              <div className="text-sm text-red-500">{error}</div>
            </div>
          )}
          
          {!loading && !error && filteredCategories.length === 0 && (
            <div className="flex items-center justify-center py-8">
              <div className="text-sm text-gray-500">No atoms found</div>
            </div>
          )}
          
          {!loading && !error && filteredCategories.map((category) => (
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
                      title={atom.name}
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
