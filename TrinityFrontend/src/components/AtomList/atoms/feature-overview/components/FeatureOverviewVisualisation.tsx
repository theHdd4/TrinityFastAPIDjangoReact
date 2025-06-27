import React from 'react';
import { Card } from '@/components/ui/card';
import { Checkbox } from '@/components/ui/checkbox';

interface Props {
  numericColumns: string[];
  values: string[];
  onChange: (v: string[]) => void;
}
const FeatureOverviewVisualisation: React.FC<Props> = ({ numericColumns, values, onChange }) => {
  const toggle = (col: string, checked: boolean | "indeterminate") => {
    const isChecked = Boolean(checked);
    let next = values;
    if (isChecked) {
      if (!next.includes(col)) next = [...next, col];
    } else {
      next = next.filter(v => v !== col);
    }
    onChange(next);
  };

  return (
    <Card className="p-4 border border-gray-200 shadow-sm">
      <label className="text-sm font-medium text-gray-700 block mb-2">Select Dependant Variables for SKU Analysis</label>
      <div className="grid grid-cols-2 gap-2">
        {numericColumns.map(c => (
          <label key={c} className="flex items-center space-x-2 text-xs">
            <Checkbox checked={values.includes(c)} onCheckedChange={val => toggle(c, val)} />
            <span>{c}</span>
          </label>
        ))}
      </div>
    </Card>
  );
};

export default FeatureOverviewVisualisation;
