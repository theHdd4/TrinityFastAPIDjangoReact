import React, { useEffect } from 'react';
import { Card } from '@/components/ui/card';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Checkbox } from '@/components/ui/checkbox';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';
import { Database } from 'lucide-react';
import { VALIDATE_API } from '@/lib/api';
import { BuildModelFeatureBasedData } from '../BuildModelFeatureBasedAtom';

interface BuildModelFeatureBasedInputProps {
  data: BuildModelFeatureBasedData;
  onDataChange: (data: Partial<BuildModelFeatureBasedData>) => void;
}

const BuildModelFeatureBasedInput: React.FC<BuildModelFeatureBasedInputProps> = ({
  data,
  onDataChange
}) => {
  // fetch saved dataframes list on mount
  useEffect(() => {
    fetch(`${VALIDATE_API}/list_saved_dataframes`)
      .then(r => r.json())
      .then(d => {
        const files = Array.isArray(d.files) ? d.files.map((f: any)=> f.object_name || f) : [];
        if (files.length && (!data?.availableFiles || data.availableFiles.length === 0)) {
          onDataChange({ availableFiles: files });
        }
      })
      .catch(() => {/* ignore */});
  }, [data?.availableFiles]);

  // Filter files that contain "Scope" and extract unique scope numbers
  const scopeFiles = (data?.availableFiles || []).filter(file => 
    typeof file === 'string' && file.includes('Scope_')
  );

  // Extract unique scope numbers from filenames
  const uniqueScopeNumbers = scopeFiles
    .map(file => {
      const match = file.match(/Scope_(\d+)_/);
      return match ? parseInt(match[1]) : null;
    })
    .filter((scopeNum): scopeNum is number => scopeNum !== null)
    .sort((a, b) => a - b);

  // Remove duplicates and create scope options
  const scopeOptions = [...new Set(uniqueScopeNumbers)].map(scopeNum => ({
    value: scopeNum.toString(),
    label: `Scope ${scopeNum}`
  }));

  // Filter files by selected scope number and extract combinations after scope number
  const filesForSelectedScope = data?.selectedScope ? 
    scopeFiles.filter(file => file.includes(`Scope_${data.selectedScope}_`)) : [];

  // Extract combinations after scope number (e.g., "Channel_Convenience_Variant_Flavoured_Brand_HEINZ_Flavoured_PPG_Small_Single")
  const scopeCombinations = filesForSelectedScope.map(file => {
    const match = file.match(/Scope_\d+_(.+?)_\d{8}_\d{6}\.arrow$/);
    return match ? match[1] : null;
  }).filter((combination): combination is string => combination !== null);

  // Remove duplicates and create combination options
  const uniqueCombinations = [...new Set(scopeCombinations)].map(combination => ({
    value: combination,
    label: combination
  }));

  const handleCombinationToggle = (combination: string, checked: boolean) => {
    const updatedCombinations = checked
      ? [...(data.selectedCombinations || []), combination]
      : (data.selectedCombinations || []).filter(c => c !== combination);
    
    onDataChange({ selectedCombinations: updatedCombinations });
  };

  const handleSelectAllCombinations = (checked: boolean) => {
    if (checked) {
      // Select all combinations
      const allCombinations = uniqueCombinations.map(option => option.value);
      onDataChange({ selectedCombinations: allCombinations });
    } else {
      // Deselect all combinations
      onDataChange({ selectedCombinations: [] });
    }
  };

  // Check if all combinations are selected
  const allCombinationsSelected = uniqueCombinations.length > 0 && 
    uniqueCombinations.every(option => data?.selectedCombinations?.includes(option.value));

  return (
    <div className="space-y-6">
      {/* Select Data */}
      <Card>
        <div className="p-4 border-b bg-muted/30">
          <h4 className="font-medium text-foreground flex items-center gap-2">
            <Database className="w-4 h-4 text-primary" />
            Select Data
          </h4>
        </div>
        <div className="p-4 space-y-4">
          <div>
            <Label>Scope Selection</Label>
            <Select value={data.selectedScope} onValueChange={(value) => {
              if (value !== data.selectedScope) {
                // Get combinations for the selected scope
                const scopeFiles = (data?.availableFiles || []).filter(file => 
                  typeof file === 'string' && file.includes(`Scope_${value}_`)
                );
                
                const scopeCombinations = scopeFiles.map(file => {
                  const match = file.match(/Scope_\d+_(.+?)_\d{8}_\d{6}\.arrow$/);
                  return match ? match[1] : null;
                }).filter((combination): combination is string => combination !== null);
                
                const uniqueCombinationsForScope = [...new Set(scopeCombinations)];
                
                // Automatically select all combinations for the new scope
                onDataChange({ 
                  selectedScope: value, 
                  selectedCombinations: uniqueCombinationsForScope 
                });
              }
            }}>
              <SelectTrigger>
                <SelectValue placeholder="Select a scope number" />
              </SelectTrigger>
              <SelectContent>
                {scopeOptions.length > 0 ? (
                  scopeOptions.map(option => (
                    <SelectItem key={option.value} value={option.value}>{option.label}</SelectItem>
                  ))
                ) : (
                  <SelectItem value="no-scopes" disabled>No scope files found</SelectItem>
                )}
              </SelectContent>
            </Select>
          </div>
          
          <div>
            <Label>Application Area</Label>
            <Select 
              value={data.modelType || 'general'} 
              onValueChange={(value) => onDataChange({ modelType: value })}
            >
              <SelectTrigger className="text-left">
                <SelectValue placeholder="Select application area" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="general">General Models (Individual & Stack)</SelectItem>
                <SelectItem value="mmm">MMM Models (Marketing Mix Modeling)</SelectItem>
              </SelectContent>
            </Select>
          </div>
          
          {/* Separator line between scope and combination sections */}
          <div className="border-t border-gray-200 my-4"></div>
          
          <div>
            {/* Select All Checkbox */}
            {uniqueCombinations.length > 0 && (
              <div className="mb-3">
                <div className="flex items-center space-x-2">
                  <Checkbox
                    id="select-all-combinations"
                    checked={allCombinationsSelected}
                    onCheckedChange={(checked) => handleSelectAllCombinations(checked as boolean)}
                  />
                  <Label htmlFor="select-all-combinations" className="text-sm font-medium">
                    Select All Combinations
                  </Label>
                </div>
              </div>
            )}
            
            {/* Separator line */}
            {uniqueCombinations.length > 0 && (
              <div className="border-t border-gray-200 mb-3"></div>
            )}
            
            <div className="max-h-60 overflow-y-auto overflow-x-auto mt-2">
              <div className="space-y-1 min-w-max">
                {uniqueCombinations.map(option => (
                  <div key={option.value} className="flex items-center space-x-2 py-1">
                    <Checkbox
                      id={option.value}
                      checked={data?.selectedCombinations?.includes(option.value) || false}
                      onCheckedChange={(checked) => handleCombinationToggle(option.value, checked as boolean)}
                      onClick={(e) => e.stopPropagation()}
                    />
                    <Tooltip>
                      <TooltipTrigger asChild>
                        <Label htmlFor={option.value} className="text-sm truncate">{option.label}</Label>
                      </TooltipTrigger>
                      <TooltipContent>
                        <p>{option.label}</p>
                      </TooltipContent>
                    </Tooltip>
                  </div>
                ))}
              </div>
            </div>
          </div>
          {data?.uploadedFile && (
            <p className="text-sm text-muted-foreground mt-2">
              Uploaded: {data.uploadedFile.name}
            </p>
          )}
        </div>
      </Card>
    </div>
  );
};

export default BuildModelFeatureBasedInput;
