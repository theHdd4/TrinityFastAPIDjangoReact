import React, { useState, useMemo, useEffect } from 'react';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Checkbox } from '@/components/ui/checkbox';
import { Loader2 } from 'lucide-react';
import { cn } from '@/lib/utils';

interface UnpivotFilterModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  field: string;
  options: string[];
  selections: string[];
  onSelectionsChange: (selections: string[]) => void;
  isLoading?: boolean;
  error?: string | null;
}

const UnpivotFilterModal: React.FC<UnpivotFilterModalProps> = ({
  open,
  onOpenChange,
  field,
  options,
  selections,
  onSelectionsChange,
  isLoading = false,
  error = null,
}) => {
  const [searchTerm, setSearchTerm] = useState('');
  const [tempSelections, setTempSelections] = useState<string[]>(selections);

  const filteredOptions = useMemo(() => {
    if (!searchTerm.trim()) {
      return options;
    }
    return options.filter(option =>
      option.toLowerCase().includes(searchTerm.toLowerCase())
    );
  }, [options, searchTerm]);

  // Update temp selections when modal opens or selections prop changes
  // If selections are empty but options are available, select all options by default
  useEffect(() => {
    if (open) {
      // If selections are empty and we have options, select all options
      if (selections.length === 0 && options.length > 0) {
        setTempSelections([...options]);
      } else {
        setTempSelections(selections);
      }
    }
  }, [open, selections, options]);

  const allSelected = useMemo(() => {
    return filteredOptions.length > 0 && filteredOptions.every(opt => tempSelections.includes(opt));
  }, [filteredOptions, tempSelections]);

  const someSelected = useMemo(() => {
    return filteredOptions.some(opt => tempSelections.includes(opt)) && !allSelected;
  }, [filteredOptions, tempSelections, allSelected]);

  const handleSelectAll = () => {
    if (allSelected) {
      // Deselect all filtered options
      const newSelections = tempSelections.filter(sel => !filteredOptions.includes(sel));
      setTempSelections(newSelections);
    } else {
      // Select all filtered options
      const newSelections = [...new Set([...tempSelections, ...filteredOptions])];
      setTempSelections(newSelections);
    }
  };

  const handleToggle = (value: string) => {
    if (tempSelections.includes(value)) {
      setTempSelections(tempSelections.filter(s => s !== value));
    } else {
      setTempSelections([...tempSelections, value]);
    }
  };

  const handleOK = () => {
    onSelectionsChange(tempSelections);
    setSearchTerm('');
    onOpenChange(false);
  };

  const handleCancel = () => {
    setTempSelections(selections); // Reset to original
    setSearchTerm('');
    onOpenChange(false);
  };

  return (
    <Dialog open={open} onOpenChange={handleCancel}>
      <DialogContent className="sm:max-w-[400px] max-h-[600px] flex flex-col p-0">
        <DialogHeader className="px-4 pt-4 pb-2">
          <DialogTitle className="text-base">Filter: {field}</DialogTitle>
        </DialogHeader>
        <div className="flex-1 overflow-hidden flex flex-col px-4 pb-2">
          <Input
            placeholder="Search"
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="h-8 mb-2"
          />
          
          {isLoading ? (
            <div className="flex items-center justify-center py-8">
              <Loader2 className="h-5 w-5 animate-spin text-primary" />
              <span className="ml-2 text-sm text-muted-foreground">Loading values...</span>
            </div>
          ) : error ? (
            <div className="text-sm text-destructive py-4">{error}</div>
          ) : (
            <div className="flex-1 overflow-y-auto border rounded-md min-h-[200px] max-h-[400px]">
              {filteredOptions.length === 0 ? (
                <div className="text-sm text-muted-foreground py-4 text-center px-2">
                  {searchTerm ? 'No matches found' : 'No values available'}
                </div>
              ) : (
                <div className="py-1">
                  {/* Select All option at the top */}
                  <label
                    className={cn(
                      'flex items-center gap-2 px-3 py-2 hover:bg-muted/50 cursor-pointer',
                    )}
                  >
                    <Checkbox
                      checked={allSelected}
                      onCheckedChange={handleSelectAll}
                      className="h-4 w-4"
                    />
                    <span className="text-sm font-medium">(Select All)</span>
                  </label>
                  
                  {/* Divider */}
                  <div className="border-t my-1" />
                  
                  {/* Options list */}
                  {filteredOptions.map((option) => {
                    const isChecked = tempSelections.includes(option);
                    return (
                      <label
                        key={option}
                        className={cn(
                          'flex items-center gap-2 px-3 py-1.5 hover:bg-muted/50 cursor-pointer',
                          isChecked && 'bg-muted/30'
                        )}
                      >
                        <Checkbox
                          checked={isChecked}
                          onCheckedChange={() => handleToggle(option)}
                          className="h-4 w-4"
                        />
                        <span className="text-sm flex-1 truncate" title={option}>
                          {option}
                        </span>
                      </label>
                    );
                  })}
                </div>
              )}
            </div>
          )}
        </div>
        <DialogFooter className="px-4 pb-4 pt-2 border-t">
          <Button onClick={handleCancel} variant="outline" className="min-w-[80px]">
            Cancel
          </Button>
          <Button onClick={handleOK} className="min-w-[80px]">
            OK
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};

export default UnpivotFilterModal;

