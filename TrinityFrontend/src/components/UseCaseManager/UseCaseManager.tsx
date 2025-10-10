/**
 * Use Case Manager - Simple interface to manage use cases
 * This component allows you to view, enable/disable, and manage use cases
 */

import React, { useState } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Switch } from '@/components/ui/switch';
import { 
  Settings, 
  Plus, 
  Eye, 
  EyeOff, 
  Edit,
  Trash2,
  Copy
} from 'lucide-react';
import { 
  USE_CASES, 
  getActiveUseCases, 
  getCategories, 
  toggleUseCase,
  addUseCase 
} from '@/config/useCases';
import type { UseCase } from '@/config/useCases';

const UseCaseManager: React.FC = () => {
  const [useCases, setUseCases] = useState(USE_CASES);
  const [selectedCategory, setSelectedCategory] = useState<string>('all');

  const categories = ['all', ...getCategories()];
  const activeUseCases = getActiveUseCases();

  const handleToggleUseCase = (id: string) => {
    toggleUseCase(id);
    // Force re-render by updating state
    setUseCases([...USE_CASES]);
  };

  const handleAddUseCase = () => {
    // Example of adding a new use case programmatically
    const newUseCase: Omit<UseCase, 'isActive'> = {
      id: 'new-use-case-' + Date.now(),
      title: 'New Use Case',
      description: 'A new use case added programmatically',
      icon: Plus,
      color: 'from-gray-500 to-gray-700',
      bgGradient: 'from-gray-50 to-gray-100',
      molecules: ['Data Pre-Process', 'Explore'],
      category: 'Custom'
    };
    
    addUseCase(newUseCase);
    setUseCases([...USE_CASES]);
  };

  const filteredUseCases = useCases.filter(useCase => {
    const matchesCategory = selectedCategory === 'all' || useCase.category === selectedCategory;
    return matchesCategory;
  });

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-2xl font-bold text-gray-900">Use Case Manager</h2>
          <p className="text-gray-600 mt-1">
            Manage your analytics use cases - {activeUseCases.length} active, {useCases.length} total
          </p>
        </div>
        <Button onClick={handleAddUseCase} className="flex items-center gap-2">
          <Plus className="w-4 h-4" />
          Add Use Case
        </Button>
      </div>

      {/* Category Filter */}
      <div className="flex gap-2 flex-wrap">
        {categories.map(category => (
          <Button
            key={category}
            variant={selectedCategory === category ? 'default' : 'outline'}
            size="sm"
            onClick={() => setSelectedCategory(category)}
          >
            {category === 'all' ? 'All Categories' : category}
          </Button>
        ))}
      </div>

      {/* Use Cases Grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
        {filteredUseCases.map((useCase) => {
          const Icon = useCase.icon;
          return (
            <Card key={useCase.id} className="relative">
              <CardHeader className="pb-3">
                <div className="flex items-start justify-between">
                  <div className="flex items-center gap-3">
                    <div className="text-2xl">
                      <Icon className="w-8 h-8" />
                    </div>
                    <div>
                      <CardTitle className="text-lg">{useCase.title}</CardTitle>
                      <Badge variant="secondary" className="mt-1">
                        {useCase.category}
                      </Badge>
                    </div>
                  </div>
                  <div className="flex items-center gap-2">
                    <Switch
                      checked={useCase.isActive}
                      onCheckedChange={() => handleToggleUseCase(useCase.id)}
                    />
                    {useCase.isActive ? (
                      <Eye className="w-4 h-4 text-green-600" />
                    ) : (
                      <EyeOff className="w-4 h-4 text-gray-400" />
                    )}
                  </div>
                </div>
              </CardHeader>
              
              <CardContent className="pt-0">
                <CardDescription className="mb-4">
                  {useCase.description}
                </CardDescription>
                
                {/* Molecules */}
                <div className="space-y-2">
                  <div className="text-sm font-medium text-gray-700">Molecules:</div>
                  <div className="flex flex-wrap gap-1">
                    {useCase.molecules.slice(0, 3).map((molecule) => (
                      <Badge key={molecule} variant="outline" className="text-xs">
                        {molecule}
                      </Badge>
                    ))}
                    {useCase.molecules.length > 3 && (
                      <Badge variant="outline" className="text-xs">
                        +{useCase.molecules.length - 3} more
                      </Badge>
                    )}
                  </div>
                </div>

                {/* Actions */}
                <div className="mt-4 flex gap-2">
                  <Button variant="outline" size="sm" className="flex-1">
                    <Edit className="w-4 h-4 mr-2" />
                    Edit
                  </Button>
                  <Button variant="outline" size="sm" className="flex-1">
                    <Copy className="w-4 h-4 mr-2" />
                    Copy
                  </Button>
                  {useCase.id !== 'blank' && (
                    <Button variant="outline" size="sm" className="px-3">
                      <Trash2 className="w-4 h-4 text-red-600" />
                    </Button>
                  )}
                </div>

                {/* Status Badge */}
                <div className="mt-3 pt-3 border-t border-gray-100">
                  <div className="flex justify-between items-center">
                    <span className="text-sm text-gray-600">Status:</span>
                    <Badge 
                      variant={useCase.isActive ? 'default' : 'secondary'}
                      className={useCase.isActive ? 'bg-green-100 text-green-800' : ''}
                    >
                      {useCase.isActive ? 'Active' : 'Inactive'}
                    </Badge>
                  </div>
                </div>
              </CardContent>
            </Card>
          );
        })}
      </div>

      {/* Instructions */}
      <Card className="bg-blue-50 border-blue-200">
        <CardHeader>
          <CardTitle className="text-blue-900">How to Add New Use Cases</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="space-y-2 text-sm text-blue-800">
            <p><strong>Method 1 - Code Only:</strong> Edit <code>src/config/useCases.ts</code> and add your use case to the <code>USE_CASES</code> array.</p>
            <p><strong>Method 2 - Programmatic:</strong> Use the <code>addUseCase()</code> function from <code>@/config/useCases</code>.</p>
            <p><strong>Method 3 - UI:</strong> Click "Add Use Case" button above (for testing).</p>
          </div>
        </CardContent>
      </Card>
    </div>
  );
};

export default UseCaseManager;
