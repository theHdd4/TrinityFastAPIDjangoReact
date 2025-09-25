import React from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Checkbox } from '@/components/ui/checkbox';
import { Button } from '@/components/ui/button';
import { X } from 'lucide-react';
import { SingleSelectDropdown } from '@/templates/dropdown';
import type { GroupByData } from '../GroupByAtom';

interface GroupBySettingsProps {
  data: GroupByData;
  onDataChange: (newData: Partial<GroupByData>) => void;
}

const GroupBySettings: React.FC<GroupBySettingsProps> = ({ data, onDataChange }) => {
  const toggleIdentifier = (identifier: string) => {
    const newSelected = data.selectedIdentifiers.includes(identifier)
      ? data.selectedIdentifiers.filter(id => id !== identifier)
      : [...data.selectedIdentifiers, identifier];
    onDataChange({ selectedIdentifiers: newSelected });
  };

  return (
    <div className="p-6 space-y-6 h-full overflow-auto">
      <Card>
        <CardHeader>
          <CardTitle>Select Data</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div>
            <SingleSelectDropdown
              label="Single Selection"
              placeholder="Select data source"
              value="sales-data"
              onValueChange={(value) => {
                // Handle value change if needed
                console.log('Selected value:', value);
              }}
              options={[
                { value: "sales-data", label: "Sales Data" },
                { value: "market-data", label: "Market Data" },
                { value: "product-data", label: "Product Data" }
              ]}
              className="mt-2"
            />
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Select Identifier</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div>
            <Label className="text-sm font-medium">Multi Selection</Label>
            <div className="mt-2 space-y-2">
              {data.identifiers.map((identifier) => (
                <div key={identifier} className="flex items-center justify-between">
                  <div className="flex items-center space-x-2">
                    <Checkbox
                      id={identifier}
                      checked={data.selectedIdentifiers.includes(identifier)}
                      onCheckedChange={() => toggleIdentifier(identifier)}
                    />
                    <Label htmlFor={identifier} className="text-sm">
                      {identifier}
                    </Label>
                  </div>
                  {data.selectedIdentifiers.includes(identifier) && (
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => toggleIdentifier(identifier)}
                    >
                      <X className="h-3 w-3" />
                    </Button>
                  )}
                </div>
              ))}
            </div>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Select Measures</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div>
            <Label className="text-sm font-medium">Multi Selection</Label>
            <div className="mt-2 space-y-3">
              {data.measures.map((measure) => (
                <div key={measure} className="flex items-center justify-between">
                  <div className="flex items-center space-x-2">
                    <Checkbox id={measure} />
                    <Label htmlFor={measure} className="text-sm">
                      {measure}
                    </Label>
                  </div>
                  <Button variant="ghost" size="sm">
                    <X className="h-3 w-3" />
                  </Button>
                </div>
              ))}
            </div>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Select Aggregation</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div>
            <Label className="text-sm font-medium">Multi Selection</Label>
            <div className="mt-2 space-y-2">
              {['sum', 'Average', 'Aggregation #'].map((agg) => (
                <div key={agg} className="flex items-center justify-between">
                  <div className="flex items-center space-x-2">
                    <Checkbox id={agg} />
                    <Label htmlFor={agg} className="text-sm">
                      {agg}
                    </Label>
                  </div>
                  <Button variant="ghost" size="sm">
                    <X className="h-3 w-3" />
                  </Button>
                </div>
              ))}
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  );
};

export default GroupBySettings;