import React, { useState } from 'react';
import { Checkbox } from '@/components/ui/checkbox';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { ScrollArea } from '@/components/ui/scroll-area';
import { X, Check, ChevronDown } from 'lucide-react';

export interface MultiSelectDropdownProps {
  label?: string;
  placeholder?: string;
  selectedValues?: string[];
  onSelectionChange?: (selectedValues: string[]) => void;
  options?: Array<{ value: string; label: string }>;
  disabled?: boolean;
  className?: string;
  showSelectAll?: boolean;
  showDeselectAll?: boolean;
  maxHeight?: string;
  showTrigger?: boolean;
  triggerClassName?: string;
  identifierName?: string;
}

const MultiSelectDropdown: React.FC<MultiSelectDropdownProps> = ({
  label = "Select Options",
  placeholder = "Select multiple options",
  selectedValues = [],
  onSelectionChange,
  options = [
    { value: "option1", label: "Option 1" },
    { value: "option2", label: "Option 2" },
    { value: "option3", label: "Option 3" },
    { value: "option4", label: "Option 4" }
  ],
  disabled = false,
  className = "",
  showSelectAll = true,
  showDeselectAll = true,
  maxHeight = "200px",
  showTrigger = false,
  triggerClassName = "",
  identifierName = ""
}) => {
  const toggleOption = (value: string) => {
    if (disabled) return;
    
    const newSelected = selectedValues.includes(value)
      ? selectedValues.filter(val => val !== value)
      : [...selectedValues, value];
    
    onSelectionChange?.(newSelected);
  };

  const selectAll = () => {
    if (disabled) return;
    onSelectionChange?.(options.map(option => option.value));
  };

  const deselectAll = () => {
    if (disabled) return;
    onSelectionChange?.([]);
  };

  const isAllSelected = selectedValues.length === options.length;
  const hasSelection = selectedValues.length > 0;

  const getDisplayText = () => {
    if (identifierName) {
      // When identifierName is provided, show option name for single selection, count for multiple
      if (selectedValues.length === 0) {
        return identifierName;
      }
      if (selectedValues.length === 1) {
        const option = options.find(opt => opt.value === selectedValues[0]);
        return option?.label || selectedValues[0];
      }
      return `${selectedValues.length} selected`;
    }
    
    // Fallback to original pattern
    if (selectedValues.length === 0) {
      return placeholder;
    }
    if (selectedValues.length === 1) {
      const option = options.find(opt => opt.value === selectedValues[0]);
      return option?.label || selectedValues[0];
    }
    return `${selectedValues.length} selected`;
  };

  const dropdownContent = (
    <div className={`bg-white border border-gray-200 rounded-md shadow-lg ${className}`}>
      <div style={{ maxHeight: maxHeight, overflowY: 'auto' }}>
        <div className="p-2">
          <div className="space-y-1">
            {/* Select All checkbox option */}
            {showSelectAll && (
              <div
                className={`flex items-center space-x-2 py-1 px-1 hover:bg-gray-50 cursor-pointer rounded ${disabled ? 'opacity-50 cursor-not-allowed' : ''}`}
                onClick={() => isAllSelected ? deselectAll() : selectAll()}
              >
                <Checkbox
                  id="checkbox-select-all"
                  checked={isAllSelected}
                  onCheckedChange={() => isAllSelected ? deselectAll() : selectAll()}
                  disabled={disabled}
                  className="data-[state=checked]:bg-gray-800 data-[state=checked]:border-gray-800"
                />
                <Label
                  htmlFor="checkbox-select-all"
                  className="text-sm font-medium cursor-pointer"
                  title="Select All"
                >
                  Select All
                </Label>
              </div>
            )}
            
            {/* Regular options */}
            {options.map((option) => {
              const isSelected = selectedValues.includes(option.value);
              return (
                <div
                  key={option.value}
                  className={`flex items-center space-x-2 py-1 px-1 hover:bg-gray-50 cursor-pointer rounded ${disabled ? 'opacity-50 cursor-not-allowed' : ''}`}
                  onClick={() => toggleOption(option.value)}
                >
                  <Checkbox
                    id={`checkbox-${option.value}`}
                    checked={isSelected}
                    onCheckedChange={() => toggleOption(option.value)}
                    disabled={disabled}
                    className="data-[state=checked]:bg-gray-800 data-[state=checked]:border-gray-800"
                  />
                  <Label
                    htmlFor={`checkbox-${option.value}`}
                    className="text-sm cursor-pointer truncate"
                    title={option.label}
                  >
                    {option.label}
                  </Label>
                </div>
              );
            })}
          </div>
        </div>
      </div>
    </div>
  );

  if (showTrigger) {
    return (
      <Popover>
        <PopoverTrigger asChild>
          <Button
            variant="outline"
            className={`w-full max-w-[180px] justify-between truncate group ${triggerClassName}`}
            disabled={disabled}
          >
            <div className="flex items-center gap-2">
              <span>
                {getDisplayText()}
              </span>
            </div>
            <span className="ml-2 text-gray-400">▼</span>
          </Button>
        </PopoverTrigger>
        <PopoverContent className="w-64 p-0" align="start">
          {dropdownContent}
        </PopoverContent>
      </Popover>
    );
  }

  return dropdownContent;
};

export default MultiSelectDropdown;
