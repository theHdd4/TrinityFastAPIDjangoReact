import React from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Label } from '@/components/ui/label';
import { Checkbox } from '@/components/ui/checkbox';
import { Button } from '@/components/ui/button';
import { Target, X, Check } from 'lucide-react';
import { ScopeSelectorData } from '../ScopeSelectorAtom';

interface ScopeSelectorSettingsProps {
  data: Partial<ScopeSelectorData>;
  onDataChange: (newData: Partial<ScopeSelectorData>) => void;
}

const ScopeSelectorSettings: React.FC<ScopeSelectorSettingsProps> = ({ data, onDataChange }) => {
  // Ensure we have valid arrays
  const availableIdentifiers = React.useMemo(() => 
    Array.isArray(data.availableIdentifiers) ? data.availableIdentifiers : [], 
    [data.availableIdentifiers]
  );
  
  const selectedIdentifiers = React.useMemo(() => 
    Array.isArray(data.selectedIdentifiers) ? data.selectedIdentifiers : [], 
    [data.selectedIdentifiers]
  );

  const toggleIdentifier = React.useCallback((identifier: string) => {
    const newSelected = selectedIdentifiers.includes(identifier)
      ? selectedIdentifiers.filter(id => id !== identifier)
      : [...selectedIdentifiers, identifier];
    
    onDataChange({ selectedIdentifiers: newSelected });
  }, [selectedIdentifiers, onDataChange]);

  const selectAllIdentifiers = React.useCallback(() => {
    onDataChange({ selectedIdentifiers: [...availableIdentifiers] });
  }, [availableIdentifiers, onDataChange]);

  const clearAllIdentifiers = React.useCallback(() => {
    onDataChange({ selectedIdentifiers: [] });
  }, [onDataChange]);

  if (!data.allColumns?.length) {
    return (
      <div className="p-6 text-center text-gray-500">
        <Target className="w-10 h-10 mx-auto mb-3 text-gray-400" />
        <h3 className="text-lg font-medium mb-1">No Data Source Selected</h3>
        <p className="text-sm">Please select a data source in the Input Files tab</p>
      </div>
    );
  }

  if (availableIdentifiers.length === 0) {
    return (
      <div className="p-6 text-center text-gray-500">
        <Target className="w-10 h-10 mx-auto mb-3 text-gray-400" />
        <h3 className="text-lg font-medium mb-1">No Categorical Columns Found</h3>
        <p className="text-sm">The selected data source doesn't contain any suitable categorical columns</p>
      </div>
    );
  }

  return (
    <div className="h-full flex flex-col">
      <div className="flex items-center justify-between mb-2">
        <h3 className="text-sm font-medium text-gray-700">Identifiers</h3>
        <Button 
          variant="outline" 
          size="sm"
          onClick={selectedIdentifiers.length === availableIdentifiers.length ? clearAllIdentifiers : selectAllIdentifiers}
          className="text-blue-600 border-blue-200 hover:bg-blue-50 text-xs h-7 px-2"
        >
          {selectedIdentifiers.length === availableIdentifiers.length ? 'Deselect All' : 'Select All'}
        </Button>
      </div>
      
      <div className="flex-1 overflow-y-auto pr-1">
        <div className="grid grid-cols-1 gap-2">
          {availableIdentifiers.map((identifier) => (
            <div 
              key={identifier} 
              className={`flex items-center p-2 rounded-md border ${
                selectedIdentifiers.includes(identifier) 
                  ? 'bg-blue-50 border-blue-200' 
                  : 'border-gray-200 hover:border-blue-200 hover:bg-gray-50'
              } transition-colors cursor-pointer`}
              onClick={() => toggleIdentifier(identifier)}
            >
              <Checkbox
                id={`checkbox-${identifier}`}
                checked={selectedIdentifiers.includes(identifier)}
                onCheckedChange={() => toggleIdentifier(identifier)}
                className="data-[state=checked]:bg-blue-600 data-[state=checked]:border-blue-600 mr-2"
              />
              <Label 
                htmlFor={`checkbox-${identifier}`}
                className="flex-1 text-sm font-normal cursor-pointer truncate"
                title={identifier}
              >
                {identifier}
              </Label>
            </div>
          ))}
        </div>
      </div>

      {/* Selected Identifiers Summary */}
      {selectedIdentifiers.length > 0 && (
        <div className="mt-4 pt-4 border-t border-gray-200">
          <div className="flex items-center justify-between mb-2">
            <span className="text-sm font-medium text-gray-700">Selected ({selectedIdentifiers.length})</span>
            <Button 
              variant="ghost" 
              size="sm" 
              onClick={clearAllIdentifiers}
              className="text-red-500 hover:bg-red-50 h-8 px-2 text-xs"
            >
              Clear All
            </Button>
          </div>
          <div className="max-h-32 overflow-y-auto pr-1">
            <div className="grid grid-cols-1 gap-1">
              {selectedIdentifiers.map((identifier) => (
                <div 
                  key={identifier}
                  className="flex items-center justify-between p-2 text-sm rounded-md bg-blue-50 hover:bg-blue-100 cursor-pointer"
                  onClick={() => toggleIdentifier(identifier)}
                >
                  <span className="truncate">{identifier}</span>
                  <X className="w-3.5 h-3.5 text-gray-500 hover:text-gray-700" />
                </div>
              ))}
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default ScopeSelectorSettings;