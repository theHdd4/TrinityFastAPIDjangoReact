import React, { useState } from 'react';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Checkbox } from '@/components/ui/checkbox';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible';
import { ChevronDown, Database, Table, Filter, Eye, EyeOff } from 'lucide-react';

interface FeatureOverviewSettingsProps {
  settings: any;
  onSettingsChange: (settings: any) => void;
}

const FeatureOverviewSettings: React.FC<FeatureOverviewSettingsProps> = ({
  settings,
  onSettingsChange
}) => {
  const [openSections, setOpenSections] = useState<string[]>(['columnView', 'marketDimension']);

  // Sample data structure based on the image
  const columns = [
    { name: 'Market', type: 'String', uniqueCount: 5, uniqueValues: ['Market1', 'Market2', 'Market3', 'Market4', 'Market5'] },
    { name: 'Channel', type: 'String', uniqueCount: 4, uniqueValues: ['Channel1', 'Channel2', 'Channel3', 'Channel4'] },
    { name: 'Region', type: 'String', uniqueCount: 3, uniqueValues: ['Region1', 'Region2', 'Region3'] },
    { name: 'Brand', type: 'String', uniqueCount: 5, uniqueValues: ['Brand1', 'Brand2', 'Brand3', 'Brand4', 'Brand5'] },
    { name: 'Variant', type: 'String', uniqueCount: 8, uniqueValues: ['Variant1', 'Variant2', 'Variant3', 'Variant4', 'Variant5', 'Variant6', 'Variant7', 'Variant8'] },
    { name: 'PackType', type: 'String', uniqueCount: 3, uniqueValues: ['PackType1', 'PackType2', 'PackType3'] },
    { name: 'PackSize', type: 'String', uniqueCount: 4, uniqueValues: ['Small', 'Medium', 'Large', 'XLarge'] },
    { name: 'PPG', type: 'Numeric', uniqueCount: 156, uniqueValues: [] }
  ];

  const marketDimensions = ['Region', 'Channel', 'Brand', 'PPG'];
  const productDimensions = ['Brand', 'Variant', 'PackSize', 'PPG'];

  const toggleSection = (sectionId: string) => {
    setOpenSections(prev => 
      prev.includes(sectionId) 
        ? prev.filter(id => id !== sectionId)
        : [...prev, sectionId]
    );
  };

  const toggleHierarchicalView = (checked: boolean) => {
    onSettingsChange({ hierarchicalView: checked });
  };

  const SectionCard = ({ 
    id, 
    title, 
    children, 
    icon 
  }: { 
    id: string;
    title: string; 
    children: React.ReactNode; 
    icon?: React.ReactNode;
  }) => {
    const isOpen = openSections.includes(id);
    
    return (
      <Card className="border border-gray-200 shadow-sm">
        <Collapsible open={isOpen} onOpenChange={() => toggleSection(id)}>
          <CollapsibleTrigger className="flex items-center justify-between w-full p-4 hover:bg-gray-50 transition-colors">
            <div className="flex items-center space-x-2">
              {icon}
              <h4 className="font-medium text-gray-900">{title}</h4>
            </div>
            <ChevronDown className={`w-4 h-4 text-gray-500 transition-transform duration-200 ${isOpen ? 'rotate-180' : ''}`} />
          </CollapsibleTrigger>
          <CollapsibleContent>
            <div className="px-4 pb-4 border-t border-gray-100">
              {children}
            </div>
          </CollapsibleContent>
        </Collapsible>
      </Card>
    );
  };

  return (
    <div className="space-y-4">
      {/* Data Validation Section */}
      <SectionCard 
        id="dataValidation" 
        title="Data Validation" 
        icon={<Database className="w-4 h-4 text-blue-500" />}
      >
        <div className="mt-4 space-y-3">
          <div className="flex items-center justify-between">
            <span className="text-sm text-gray-700">Validate data types</span>
            <Checkbox defaultChecked />
          </div>
          <div className="flex items-center justify-between">
            <span className="text-sm text-gray-700">Check for missing values</span>
            <Checkbox defaultChecked />
          </div>
          <div className="flex items-center justify-between">
            <span className="text-sm text-gray-700">Identify outliers</span>
            <Checkbox />
          </div>
        </div>
      </SectionCard>

      {/* Column View Section */}
      <SectionCard 
        id="columnView" 
        title="Column View" 
        icon={<Table className="w-4 h-4 text-green-500" />}
      >
        <div className="mt-4 space-y-4">
          {/* Hierarchical View Toggle */}
          <div className="flex items-center justify-between p-3 bg-blue-50 rounded-lg border border-blue-200">
            <div className="flex items-center space-x-2">
              {settings.hierarchicalView ? <Eye className="w-4 h-4 text-blue-600" /> : <EyeOff className="w-4 h-4 text-gray-400" />}
              <span className="text-sm font-medium text-gray-900">Open Hierarchical View</span>
            </div>
            <Checkbox 
              checked={settings.hierarchicalView}
              onCheckedChange={toggleHierarchicalView}
            />
          </div>

          {/* Column Selection Table */}
          <div className="border border-gray-200 rounded-lg overflow-hidden">
            <div className="bg-gray-50 px-4 py-2 border-b border-gray-200">
              <div className="grid grid-cols-4 gap-4 text-xs font-medium text-gray-700">
                <span>Columns</span>
                <span>Data Type</span>
                <span>Unique Counts</span>
                <span>Unique Values</span>
              </div>
            </div>
            
            <div className="max-h-64 overflow-y-auto">
              {columns.map((column, index) => (
                <div key={index} className="px-4 py-3 border-b border-gray-100 hover:bg-gray-50">
                  <div className="grid grid-cols-4 gap-4 text-sm">
                    <div className="flex items-center space-x-2">
                      <Checkbox />
                      <span className="text-gray-900">{column.name}</span>
                    </div>
                    <span className="text-gray-600">{column.type}</span>
                    <span className="text-gray-600">{column.uniqueCount}</span>
                    <div className="flex flex-wrap gap-1">
                      {column.uniqueValues.slice(0, 3).map((value, idx) => (
                        <Badge key={idx} variant="outline" className="text-xs">
                          {value}
                        </Badge>
                      ))}
                      {column.uniqueValues.length > 3 && (
                        <Badge variant="outline" className="text-xs">
                          +{column.uniqueValues.length - 3}
                        </Badge>
                      )}
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      </SectionCard>

      {/* Market Dimension Section */}
      <SectionCard 
        id="marketDimension" 
        title="Market Dimension" 
        icon={<Filter className="w-4 h-4 text-purple-500" />}
      >
        <div className="mt-4 space-y-3">
          <div className="grid grid-cols-2 gap-2">
            {marketDimensions.map((dim, index) => (
              <Badge 
                key={index} 
                variant="outline" 
                className="text-xs justify-center py-2 bg-blue-50 border-blue-200 hover:bg-blue-100 cursor-pointer transition-colors"
              >
                {dim}
              </Badge>
            ))}
          </div>
        </div>
      </SectionCard>

      {/* Product Dimension Section */}
      <SectionCard 
        id="productDimension" 
        title="Product Dimension" 
        icon={<Filter className="w-4 h-4 text-orange-500" />}
      >
        <div className="mt-4 space-y-3">
          <div className="grid grid-cols-2 gap-2">
            {productDimensions.map((dim, index) => (
              <Badge 
                key={index} 
                variant="outline" 
                className="text-xs justify-center py-2 bg-green-50 border-green-200 hover:bg-green-100 cursor-pointer transition-colors"
              >
                {dim}
              </Badge>
            ))}
          </div>
        </div>
      </SectionCard>

      {/* Data Source Selection */}
      <SectionCard 
        id="dataSource" 
        title="Data Source" 
        icon={<Database className="w-4 h-4 text-gray-500" />}
      >
        <div className="mt-4">
          <Select>
            <SelectTrigger className="bg-white border-gray-300">
              <SelectValue placeholder="Select data source..." />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="upload">Uploaded Files</SelectItem>
              <SelectItem value="database">Database Connection</SelectItem>
              <SelectItem value="api">API Endpoint</SelectItem>
            </SelectContent>
          </Select>
        </div>
      </SectionCard>

      {/* Action Buttons */}
      <div className="flex space-x-3 pt-4">
        <Button className="flex-1 bg-gradient-to-r from-blue-500 to-blue-600 hover:from-blue-600 hover:to-blue-700 text-white">
          Apply Settings
        </Button>
        <Button variant="outline" className="flex-1">
          Reset to Default
        </Button>
      </div>
    </div>
  );
};

export default FeatureOverviewSettings;
