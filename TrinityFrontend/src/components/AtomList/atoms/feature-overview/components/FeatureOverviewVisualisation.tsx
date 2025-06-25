import React from 'react';
import { Card } from '@/components/ui/card';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';

interface Props {
  numericColumns: string[];
  value: string;
  onChange: (v: string) => void;
}

const FeatureOverviewVisualisation: React.FC<Props> = ({ numericColumns, value, onChange }) => (
  <Card className="p-4 border border-gray-200 shadow-sm">
    <label className="text-sm font-medium text-gray-700 block mb-2">Select Y-Axis for SKU analysis</label>
    <Select value={value} onValueChange={onChange}>
      <SelectTrigger className="bg-white border-gray-300">
        <SelectValue placeholder="Choose column" />
      </SelectTrigger>
      <SelectContent>
        {numericColumns.map(c => (
          <SelectItem key={c} value={c}>{c}</SelectItem>
        ))}
      </SelectContent>
    </Select>
  </Card>
);

export default FeatureOverviewVisualisation;
