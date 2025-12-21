import React from 'react';
import { Card } from '@/components/ui/card';
import { CheckboxTemplate } from '@/templates/checkbox';
import { Button } from '@/components/ui/button';

import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';

// Filter out unattributed dimensions
const filterUnattributed = (mapping: Record<string, string[]>) =>
  Object.fromEntries(
    Object.entries(mapping || {}).filter(
      ([key]) => key.toLowerCase() !== "unattributed",
    ),
  );

interface Props {
  numericColumns: string[];
  allColumns: string[];
  yValues: string[];
  xValue: string;
  onYChange: (v: string[]) => void;
  onXChange: (v: string) => void;
  dimensionMap: Record<string, string[]>;
  originalDimensionMap: Record<string, string[]>;
  onDimensionChange: (dimensions: Record<string, string[]>) => void;
  onApply: () => void;
}
const FeatureOverviewVisualisation: React.FC<Props> = ({
  numericColumns,
  allColumns,
  yValues,
  xValue,
  onYChange,
  onXChange,
  dimensionMap,
  originalDimensionMap,
  onDimensionChange,
  onApply,
}) => {
  const numericList = Array.isArray(numericColumns) ? numericColumns : [];
  const columnList = Array.isArray(allColumns) ? allColumns : [];
  const toggle = (col: string, checked: boolean | "indeterminate") => {
    const isChecked = Boolean(checked);
    let next = yValues;
    if (isChecked) {
      if (!next.includes(col)) next = [...next, col];
    } else {
      next = next.filter(v => v !== col);
    }
    onYChange(next);
  };

  const toggleDimension = (dimensionName: string, column: string, checked: boolean | "indeterminate") => {
    const isChecked = Boolean(checked);
    const updatedDimensions = { ...dimensionMap };
    
    // Ensure column is lowercase for consistency with file columns
    const columnLower = typeof column === 'string' ? column.toLowerCase() : column;
    
    if (!updatedDimensions[dimensionName]) {
      updatedDimensions[dimensionName] = [];
    }
    
    if (isChecked) {
      // Remove any existing versions (case-insensitive) and add lowercase version
      updatedDimensions[dimensionName] = updatedDimensions[dimensionName]
        .filter(col => col?.toLowerCase() !== columnLower)
        .concat([columnLower]);
    } else {
      // Remove by case-insensitive comparison
      updatedDimensions[dimensionName] = updatedDimensions[dimensionName].filter(
        col => col?.toLowerCase() !== columnLower
      );
    }
    
    onDimensionChange(updatedDimensions);
  };

  return (
    <div className="space-y-4">
      <Card className="p-4 border border-gray-200 shadow-sm">
        <label className="text-sm font-medium text-gray-700 block mb-2">Select Dependant Variables for SKU Analysis</label>
        <div className="grid grid-cols-2 gap-2">
          {numericList.map(c => (
            <div key={c} title={c} className="cursor-pointer select-none">
              <CheckboxTemplate
                label={c}
                checked={yValues.includes(c)}
                onCheckedChange={val => toggle(c, val)}
                className="w-full"
                labelClassName="text-sm cursor-pointer truncate max-w-full"
              />
            </div>
          ))}
        </div>
      </Card>
      
      {/* Dimension Selection */}
      {Object.keys(filterUnattributed(originalDimensionMap)).length > 0 && (
        <Card className="p-4 border border-gray-200 shadow-sm">
          <label className="text-sm font-medium text-gray-700 block mb-2">Select relevant dimensions for building appropriate level of analysis</label>
          <div className="space-y-4">
            {Object.entries(filterUnattributed(originalDimensionMap)).map(([dimensionName, columns]) => (
              <div key={dimensionName} className="space-y-2">
                <div className="text-sm font-medium text-gray-600 capitalize">{dimensionName}</div>
                <div className="grid grid-cols-2 gap-2">
                  {(Array.isArray(columns) ? columns : []).map(column => {
                    // Convert column to lowercase for consistency with file columns
                    const columnLower = typeof column === 'string' ? column.toLowerCase() : column;
                    // Check if lowercase version is in dimensionMap (also check original case for backward compatibility)
                    const isChecked = dimensionMap[dimensionName]?.some(
                      col => col?.toLowerCase() === columnLower
                    ) || false;
                    return (
                      <CheckboxTemplate
                        key={`${dimensionName}-${columnLower}`}
                        label={columnLower}
                        checked={isChecked}
                        onCheckedChange={val => toggleDimension(dimensionName, columnLower, val)}
                      />
                    );
                  })}
                </div>
              </div>
            ))}
          </div>
        </Card>
      )}
      
      <Card className="p-4 border border-gray-200 shadow-sm">
        <label className="text-sm font-medium text-gray-700 block mb-2">Select Independent Variable for Visualisation</label>
        <Select value={xValue} onValueChange={onXChange}>
          <SelectTrigger className="bg-white border-gray-300">
            <SelectValue placeholder="Select column" />
          </SelectTrigger>
          <SelectContent>
            {columnList.map(c => (
              <SelectItem key={c} value={c} className="text-xs">
                {c}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </Card>
      <Button className="w-full" onClick={onApply}>
        Update Variables
      </Button>
    </div>
  );
};

export default FeatureOverviewVisualisation;
