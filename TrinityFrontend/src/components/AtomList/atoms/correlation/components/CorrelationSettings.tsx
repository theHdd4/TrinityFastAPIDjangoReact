import React from 'react';
import { Calendar, X, Upload, FileText } from 'lucide-react';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { CorrelationData } from '../CorrelationAtom';

interface CorrelationSettingsProps {
  data: CorrelationData;
  onDataChange: (newData: Partial<CorrelationData>) => void;
}

const CorrelationSettings: React.FC<CorrelationSettingsProps> = ({ data, onDataChange }) => {
  const handleSettingsChange = (key: string, value: any) => {
    onDataChange({
      settings: {
        ...data.settings,
        [key]: value
      }
    });
  };

  const handleIdentifierChange = (key: string, value: string) => {
    onDataChange({
      identifiers: {
        ...data.identifiers,
        [key]: value
      }
    });
  };

  const handleFileUpload = (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (file) {
      // Handle file upload logic here
      console.log('File uploaded:', file.name);
    }
  };

  return (
    <div className="h-full overflow-y-auto">
      <div className="p-4 space-y-6 bg-background text-foreground">
        {/* File Upload Section */}
        <div className="space-y-3">
          <h3 className="text-sm font-medium text-muted-foreground">Data Input</h3>
          <div className="space-y-3">
            <div className="border-2 border-dashed border-border rounded-lg p-4 text-center hover:border-primary/50 transition-colors">
              <Upload className="w-8 h-8 mx-auto mb-2 text-muted-foreground" />
              <p className="text-sm font-medium mb-1">Upload your data file</p>
              <p className="text-xs text-muted-foreground mb-3">Supports CSV, Excel, JSON formats</p>
              <input
                type="file"
                accept=".csv,.xlsx,.xls,.json"
                onChange={handleFileUpload}
                className="hidden"
                id="correlation-file-upload"
              />
              <label htmlFor="correlation-file-upload">
                <Button asChild variant="outline" size="sm" className="cursor-pointer">
                  <span>Choose File</span>
                </Button>
              </label>
            </div>
            
            <div className="flex items-center gap-2 p-2 bg-muted/50 rounded-lg">
              <FileText className="w-4 h-4 text-muted-foreground" />
              <span className="text-sm text-muted-foreground">sales_data.csv</span>
              <Badge variant="secondary" className="ml-auto">Active</Badge>
            </div>
          </div>
        </div>

        {/* Select Data Section */}
      <div className="space-y-3">
        <h3 className="text-sm font-medium text-muted-foreground">Select Data</h3>
        <div className="space-y-2">
          <Select 
            value={data.settings.selectData} 
            onValueChange={(value) => handleSettingsChange('selectData', value)}
          >
            <SelectTrigger className="w-full bg-background border-border">
              <SelectValue />
            </SelectTrigger>
            <SelectContent className="bg-background border-border z-50">
              <SelectItem value="Single Selection">Single Selection</SelectItem>
              <SelectItem value="Multi Selection">Multi Selection</SelectItem>
            </SelectContent>
          </Select>
          
          <Select 
            value={data.settings.dataset} 
            onValueChange={(value) => handleSettingsChange('dataset', value)}
          >
            <SelectTrigger className="w-full bg-background border-border">
              <SelectValue />
            </SelectTrigger>
            <SelectContent className="bg-background border-border z-50">
              <SelectItem value="Sales_Data">Sales_Data</SelectItem>
              <SelectItem value="Marketing_Data">Marketing_Data</SelectItem>
              <SelectItem value="Customer_Data">Customer_Data</SelectItem>
            </SelectContent>
          </Select>
        </div>
      </div>

      {/* Date Filter Section */}
      <div className="space-y-3">
        <h3 className="text-sm font-medium text-muted-foreground">Date Filter</h3>
        <div className="grid grid-cols-2 gap-2">
          <div className="space-y-1">
            <Label htmlFor="fromDate" className="text-xs text-muted-foreground">From</Label>
            <div className="relative">
              <Input
                id="fromDate"
                value={data.settings.dateFrom}
                onChange={(e) => handleSettingsChange('dateFrom', e.target.value)}
                className="pr-8 text-xs bg-background border-border"
                placeholder="01 JUL 2020"
              />
              <Calendar className="absolute right-2 top-1/2 transform -translate-y-1/2 h-3 w-3 text-muted-foreground" />
            </div>
          </div>
          
          <div className="space-y-1">
            <Label htmlFor="toDate" className="text-xs text-muted-foreground">To</Label>
            <div className="relative">
              <Input
                id="toDate"
                value={data.settings.dateTo}
                onChange={(e) => handleSettingsChange('dateTo', e.target.value)}
                className="pr-8 text-xs bg-background border-border"
                placeholder="30 MAR 2025"
              />
              <Calendar className="absolute right-2 top-1/2 transform -translate-y-1/2 h-3 w-3 text-muted-foreground" />
            </div>
          </div>
        </div>
        
        <div className="text-xs text-muted-foreground">
          Data available<br />
          <span className="font-medium">From:</span> 01-Jan-2018 to: 30-Mar-2025
        </div>
      </div>

      {/* Date and Time Aggregation */}
      <div className="space-y-3">
        <h3 className="text-sm font-medium text-muted-foreground">Date and Time Aggregation</h3>
        <div className="space-y-2">
          <div className="flex gap-1">
            {['Yearly', 'Quarterly', 'Monthly', 'Weekly'].map((period) => (
              <Button
                key={period}
                variant={data.settings.aggregationLevel === period ? "default" : "outline"}
                size="sm"
                className="text-xs h-6 px-2"
                onClick={() => handleSettingsChange('aggregationLevel', period)}
              >
                {period}
              </Button>
            ))}
          </div>
        </div>
      </div>

      {/* Select Filter */}
      <div className="space-y-3">
        <h3 className="text-sm font-medium text-muted-foreground">Select Filter</h3>
        <div className="space-y-2">
          <Select 
            value={data.settings.selectFilter} 
            onValueChange={(value) => handleSettingsChange('selectFilter', value)}
          >
            <SelectTrigger className="w-full bg-background border-border">
              <SelectValue />
            </SelectTrigger>
            <SelectContent className="bg-background border-border z-50">
              <SelectItem value="Multi Selection">Multi Selection</SelectItem>
              <SelectItem value="Single Selection">Single Selection</SelectItem>
            </SelectContent>
          </Select>
          
          {/* Filter Items */}
          <div className="space-y-2">
            {Object.entries(data.identifiers).map(([key, value]) => {
              const displayName = key.replace('identifier', 'Identifier ');
              return (
                <div key={key} className="flex items-center gap-2">
                  <span className="text-xs text-muted-foreground min-w-[70px]">{displayName}</span>
                  <div className="flex items-center gap-1 px-2 py-1 bg-muted rounded text-xs">
                    <span>{value}</span>
                    <X className="h-3 w-3 text-muted-foreground cursor-pointer" 
                       onClick={() => handleIdentifierChange(key, '')} />
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      </div>

      {/* Correlation Method */}
      <div className="space-y-3">
        <h3 className="text-sm font-medium text-muted-foreground">Correlation Method</h3>
        <Select 
          value={data.settings.correlationMethod} 
          onValueChange={(value) => handleSettingsChange('correlationMethod', value)}
        >
          <SelectTrigger className="w-full bg-background border-border">
            <SelectValue />
          </SelectTrigger>
          <SelectContent className="bg-background border-border z-50">
            <SelectItem value="Pearson">Pearson</SelectItem>
            <SelectItem value="Spearman">Spearman</SelectItem>
            <SelectItem value="Kendall">Kendall</SelectItem>
          </SelectContent>
        </Select>
      </div>

      {/* Action Buttons */}
      <div className="flex gap-2 pt-4">
        <Button variant="default" size="sm" className="flex-1">
          Apply Settings
        </Button>
        <Button variant="outline" size="sm" className="flex-1">
          Reset
        </Button>
        </div>
      </div>
    </div>
  );
};

export default CorrelationSettings;