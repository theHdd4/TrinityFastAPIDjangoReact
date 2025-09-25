import React from 'react';
import { Card } from '@/components/ui/card';
import { Checkbox } from '@/components/ui/checkbox';
import { Button } from '@/components/ui/button';

import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';

interface Props {
  numericColumns: string[];
  allColumns: string[];
  yValues: string[];
  xValue: string;
  onYChange: (v: string[]) => void;
  onXChange: (v: string) => void;
  onApply: () => void;
}
const FeatureOverviewVisualisation: React.FC<Props> = ({
  numericColumns,
  allColumns,
  yValues,
  xValue,
  onYChange,
  onXChange,
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

  return (
    <div className="space-y-4">
      <Card className="p-4 border border-gray-200 shadow-sm">
        <label className="text-sm font-medium text-gray-700 block mb-2">Select Dependant Variables for SKU Analysis</label>
        <div className="grid grid-cols-2 gap-2">
          {numericList.map(c => (
            <label key={c} className="flex items-center space-x-2 text-xs">
              <Checkbox checked={yValues.includes(c)} onCheckedChange={val => toggle(c, val)} />
              <span>{c}</span>
            </label>
          ))}
        </div>
      </Card>
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
