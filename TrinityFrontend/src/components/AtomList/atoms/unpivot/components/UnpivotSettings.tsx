import React, { useMemo, useState } from 'react';
import { Card } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Button } from '@/components/ui/button';
import { Check, Info } from 'lucide-react';
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from '@/components/ui/tooltip';
import { UnpivotSettings as UnpivotSettingsType } from '@/components/LaboratoryMode/store/laboratoryStore';
import { MultiSelectDropdown } from '@/templates/dropdown';

interface UnpivotSettingsProps {
  data: UnpivotSettingsType;
  onDataChange: (data: Partial<UnpivotSettingsType>) => void;
  onApply?: () => void;
  isComputing?: boolean;
}

const UnpivotSettings: React.FC<UnpivotSettingsProps> = ({ data, onDataChange, onApply, isComputing = false }) => {
  const [searchTerm, setSearchTerm] = useState('');

  const fieldOptions = useMemo(() => {
    if (data.dataSourceColumns && data.dataSourceColumns.length > 0) {
      console.log('UnpivotSettings: Available columns:', data.dataSourceColumns.length);
      return data.dataSourceColumns;
    }
    console.log('UnpivotSettings: No columns available. dataSourceColumns:', data.dataSourceColumns);
    return [];
  }, [data.dataSourceColumns]);

  const filteredFields = useMemo(() => {
    if (!searchTerm.trim()) {
      return fieldOptions;
    }
    return fieldOptions.filter(field => field.toLowerCase().includes(searchTerm.toLowerCase()));
  }, [fieldOptions, searchTerm]);

  const availableForIdVars = useMemo(() => {
    return filteredFields.filter(f => !data.valueVars.includes(f));
  }, [filteredFields, data.valueVars]);

  const availableForValueVars = useMemo(() => {
    return filteredFields.filter(f => !data.idVars.includes(f));
  }, [filteredFields, data.idVars]);

  // Convert string arrays to {value, label} format for MultiSelectDropdown
  const idVarOptions = useMemo(() => {
    return availableForIdVars.map(field => ({ value: field, label: field }));
  }, [availableForIdVars]);

  const valueVarOptions = useMemo(() => {
    return availableForValueVars.map(field => ({ value: field, label: field }));
  }, [availableForValueVars]);

  const handleIdVarToggle = (field: string, checked: boolean) => {
    if (checked) {
      if (data.idVars.includes(field)) return;
      onDataChange({
        idVars: [...data.idVars, field],
      });
    } else {
      onDataChange({
        idVars: data.idVars.filter(f => f !== field),
      });
    }
  };

  const handleValueVarToggle = (field: string, checked: boolean) => {
    if (checked) {
      if (data.valueVars.includes(field)) return;
      onDataChange({
        valueVars: [...data.valueVars, field],
      });
    } else {
      onDataChange({
        valueVars: data.valueVars.filter(f => f !== field),
      });
    }
  };


  return (
    <div className="space-y-6">
      {/* Column Name Settings */}
      <div className="space-y-4">
        <div>
          <div className="flex items-center gap-2 mb-2">
            <Label className="text-sm font-medium">Variable Column Name</Label>
            <TooltipProvider>
              <Tooltip>
                <TooltipTrigger asChild>
                  <Info className="h-4 w-4 text-gray-400 hover:text-gray-600 cursor-help" />
                </TooltipTrigger>
                <TooltipContent>
                  <p className="text-xs max-w-xs">
                    Name for the column containing variable names (default: "variable")
                  </p>
                </TooltipContent>
              </Tooltip>
            </TooltipProvider>
          </div>
          <Input
            value={data.variableColumnName || ''}
            onChange={(e) => {
              const value = e.target.value.trim();
              onDataChange({ variableColumnName: value || undefined });
            }}
            placeholder="variable"
            className="w-full"
          />
        </div>

        <div>
          <div className="flex items-center gap-2 mb-2">
            <Label className="text-sm font-medium">Value Column Name</Label>
            <TooltipProvider>
              <Tooltip>
                <TooltipTrigger asChild>
                  <Info className="h-4 w-4 text-gray-400 hover:text-gray-600 cursor-help" />
                </TooltipTrigger>
                <TooltipContent>
                  <p className="text-xs max-w-xs">
                    Name for the column containing values (default: "value")
                  </p>
                </TooltipContent>
              </Tooltip>
            </TooltipProvider>
          </div>
          <Input
            value={data.valueColumnName || ''}
            onChange={(e) => {
              const value = e.target.value.trim();
              onDataChange({ valueColumnName: value || undefined });
            }}
            placeholder="value"
            className="w-full"
          />
        </div>
      </div>

      {/* Value Variables */}
      <div className="space-y-2">
        <div className="flex items-center gap-2">
          <Label className="text-sm font-medium">Value Variables (Columns to Unpivot)</Label>
          <TooltipProvider>
            <Tooltip>
              <TooltipTrigger asChild>
                <Info className="h-4 w-4 text-gray-400 hover:text-gray-600 cursor-help" />
              </TooltipTrigger>
              <TooltipContent>
                <p className="text-xs max-w-xs">
                  Select columns that will be unpivoted (converted from columns to rows)
                </p>
              </TooltipContent>
            </Tooltip>
          </TooltipProvider>
        </div>

        <MultiSelectDropdown
          identifierName="Value Variables"
          placeholder="Select value variables..."
          options={valueVarOptions}
          selectedValues={data.valueVars}
          onSelectionChange={(selected) => onDataChange({ valueVars: selected })}
          showSelectAll={true}
          showDeselectAll={true}
          showTrigger={true}
          triggerClassName="w-full justify-between"
          maxHeight="300px"
        />
      </div>

      {/* ID Variables */}
      <div className="space-y-2">
        <div className="flex items-center gap-2">
          <Label className="text-sm font-medium">ID Variables (Columns to Keep)</Label>
          <TooltipProvider>
            <Tooltip>
              <TooltipTrigger asChild>
                <Info className="h-4 w-4 text-gray-400 hover:text-gray-600 cursor-help" />
              </TooltipTrigger>
              <TooltipContent>
                <p className="text-xs max-w-xs">
                  Select columns that will remain as identifier columns in the unpivoted result
                </p>
              </TooltipContent>
            </Tooltip>
          </TooltipProvider>
        </div>

        <MultiSelectDropdown
          identifierName="ID Variables"
          placeholder="Select ID variables..."
          options={idVarOptions}
          selectedValues={data.idVars}
          onSelectionChange={(selected) => onDataChange({ idVars: selected })}
          showSelectAll={true}
          showDeselectAll={true}
          showTrigger={true}
          triggerClassName="w-full justify-between"
          maxHeight="300px"
        />
      </div>

      {/* Apply Button */}
      <div className="pt-2">
        <Button
          onClick={onApply || (() => {})}
          disabled={isComputing || !data.datasetPath || (data.idVars.length === 0 && data.valueVars.length === 0)}
          className="w-full bg-[#1A73E8] hover:bg-[#1455ad] text-white"
        >
          <Check className="h-4 w-4 mr-2" />
          {isComputing ? 'Applying...' : 'Apply'}
        </Button>
      </div>

      {/* Info Message */}
      {fieldOptions.length === 0 && (
        <Card className="p-3 bg-yellow-50 border-yellow-200">
          <p className="text-xs text-yellow-800">
            Please select a dataset from the Input Files tab to see available columns.
          </p>
        </Card>
      )}

      {data.idVars.length === 0 && data.valueVars.length === 0 && fieldOptions.length > 0 && (
        <Card className="p-3 bg-blue-50 border-blue-200">
          <p className="text-xs text-blue-800">
            Tip: Select at least one column for ID Variables or Value Variables to perform unpivot.
            If no ID variables are selected, a row number will be automatically added.
          </p>
        </Card>
      )}
    </div>
  );
};

export default UnpivotSettings;

