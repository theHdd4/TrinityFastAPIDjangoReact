import React, { useState } from 'react';
import { Card } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible';
import { ChevronDown, Plus, Settings as SettingsIcon } from 'lucide-react';
import { Checkbox } from '@/components/ui/checkbox';

interface SettingsTabProps {
  settings: any;
  onSettingsChange: (settings: any) => void;
  uploadedFiles: File[];
}

const SettingsTab: React.FC<SettingsTabProps> = ({
  settings,
  onSettingsChange,
  uploadedFiles,
}) => {
  const [openSections, setOpenSections] = useState<string[]>(['setting1', 'fileValidation']);

  const toggleSection = (sectionId: string) => {
    setOpenSections((prev) =>
      prev.includes(sectionId) ? prev.filter((id) => id !== sectionId) : [...prev, sectionId]
    );
  };

  const dimensions = [
    'Brand',
    'Category',
    'Region',
    'Channel',
    'Season',
    'Customer_Segment',
    'Product_Type',
    'Price_Tier',
    'Market',
    'Distribution',
    'Segment',
    'SKU',
  ];

  const measures = [
    'Volume_Sales',
    'Value_Sales',
    'Revenue',
    'Profit',
    'Units_Sold',
    'Market_Share',
    'Price',
    'Cost',
    'Margin',
    'Discount',
    'Promotion_Lift',
    'Base_Sales',
    'Incremental_Sales',
    'ROI',
    'Customer_Count',
    'Repeat_Rate',
    'Conversion',
    'Penetration',
    'Frequency',
    'Elasticity',
  ];

  const SectionCard = ({ id, title, children, defaultOpen = false, icon }: { id: string; title: string; children: React.ReactNode; defaultOpen?: boolean; icon?: React.ReactNode }) => {
    const isOpen = openSections.includes(id);
    return (
      <Card className="border border-gray-200 shadow-sm hover:shadow-md transition-all duration-200">
        <Collapsible open={isOpen} onOpenChange={() => toggleSection(id)}>
          <CollapsibleTrigger className="flex items-center justify-between w-full p-4 hover:bg-gray-50 transition-colors">
            <div className="flex items-center space-x-2">
              {icon}
              <h4 className="font-medium text-gray-900">{title}</h4>
            </div>
            <ChevronDown className={`w-4 h-4 text-gray-500 transition-transform duration-200 ${isOpen ? 'rotate-180' : ''}`} />
          </CollapsibleTrigger>
          <CollapsibleContent>
            <div className="px-4 pb-4 border-t border-gray-100 bg-gray-50/50">{children}</div>
          </CollapsibleContent>
        </Collapsible>
      </Card>
    );
  };

  return (
    <div className="space-y-4 pt-4">
      {/* Upload Master File */}
      <SectionCard id="setting1" title="Upload Master File" icon={<SettingsIcon className="w-4 h-4 text-blue-500" />}>
        <div className="space-y-4 mt-4">
          <div>
            <label className="text-sm font-medium text-gray-700 block mb-2">Choose Master File</label>
            <Select value={settings.masterFile} onValueChange={(value) => onSettingsChange({ masterFile: value })}>
              <SelectTrigger className="bg-white border-gray-300">
                <SelectValue placeholder="Select uploaded file..." />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="none">No file selected</SelectItem>
                {uploadedFiles.map((file, index) => (
                  <SelectItem key={index} value={file.name}>
                    {file.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div>
            <label className="text-sm font-medium text-gray-700 block mb-2">Master File Identifier</label>
            <Input placeholder="Enter master file identifier..." className="bg-white border-gray-300" />
          </div>
        </div>
      </SectionCard>

      {/* File Validation */}
      <SectionCard id="fileValidation" title="File Validation">
        <div className="mt-4">
          <div className="flex items-center space-x-3">
            <Checkbox checked={settings.fileValidation} onCheckedChange={(checked) => onSettingsChange({ fileValidation: checked })} />
            <label className="text-sm font-medium text-gray-700">Enable automatic file validation</label>
          </div>
          <p className="text-xs text-gray-600 mt-2 ml-6">Validates file structure, data types, and required columns</p>
        </div>
      </SectionCard>

      {/* Column Configuration */}
      <SectionCard id="columnConfig" title="Column Configuration">
        <div className="mt-4 space-y-4">
          <div className="grid grid-cols-5 gap-1 text-xs">
            {Array.from({ length: 20 }, (_, i) => (
              <div key={i} className="p-2 bg-white border border-gray-200 text-center rounded text-gray-600 hover:bg-blue-50 hover:border-blue-300 cursor-pointer transition-colors">
                Col {i + 1}
              </div>
            ))}
          </div>
          <Button variant="outline" size="sm" className="w-full border-gray-300">
            Configure Selected Columns
          </Button>
        </div>
      </SectionCard>

      {/* Range Type */}
      <SectionCard id="rangeType" title="Data Range Configuration">
        <div className="mt-4">
          <Select>
            <SelectTrigger className="bg-white border-gray-300">
              <SelectValue placeholder="Select data range type..." />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="full">Full Dataset</SelectItem>
              <SelectItem value="sample">Sample Data</SelectItem>
              <SelectItem value="custom">Custom Range</SelectItem>
            </SelectContent>
          </Select>
        </div>
      </SectionCard>

      {/* Frequency */}
      <SectionCard id="frequency" title="Data Frequency">
        <div className="mt-4">
          <Select value={settings.frequency} onValueChange={(value) => onSettingsChange({ frequency: value })}>
            <SelectTrigger className="bg-white border-gray-300">
              <SelectValue placeholder="Select frequency..." />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="daily">Daily</SelectItem>
              <SelectItem value="weekly">Weekly</SelectItem>
              <SelectItem value="monthly">Monthly</SelectItem>
              <SelectItem value="quarterly">Quarterly</SelectItem>
              <SelectItem value="yearly">Yearly</SelectItem>
            </SelectContent>
          </Select>
        </div>
      </SectionCard>

      {/* Dimensions */}
      <SectionCard id="dimensions" title="Dimensions">
        <div className="mt-4 space-y-4">
          <div>
            <label className="text-sm font-medium text-gray-700 block mb-3">Available Dimensions</label>
            <div className="grid grid-cols-2 gap-2">
              {dimensions.map((dim, index) => (
                <Badge key={index} variant="outline" className="text-xs justify-center py-1 bg-white border-gray-300 hover:bg-blue-50 hover:border-blue-300 cursor-pointer transition-colors">
                  {dim}
                </Badge>
              ))}
            </div>
          </div>
          <Button variant="outline" size="sm" className="w-full border-gray-300">
            <Plus className="w-3 h-3 mr-1" />
            Add Custom Dimension
          </Button>
        </div>
      </SectionCard>

      {/* Measures */}
      <SectionCard id="measures" title="Measures">
        <div className="mt-4">
          <label className="text-sm font-medium text-gray-700 block mb-3">Available Measures</label>
          <div className="grid grid-cols-2 gap-2">
            {measures.map((measure, index) => (
              <Badge key={index} variant="outline" className="text-xs justify-center py-1 bg-white border-gray-300 hover:bg-green-50 hover:border-green-300 cursor-pointer transition-colors">
                {measure}
              </Badge>
            ))}
          </div>
        </div>
      </SectionCard>

      {/* Save Configuration */}
      <div className="pt-4">
        <Button className="w-full bg-gradient-to-r from-blue-500 to-blue-600 hover:from-blue-600 hover:to-blue-700 text-white shadow-lg">
          Save Configuration
        </Button>
      </div>
    </div>
  );
};

export default SettingsTab;
