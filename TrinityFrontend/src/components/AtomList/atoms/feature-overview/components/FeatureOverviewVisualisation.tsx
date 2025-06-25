import React from 'react';
import { Card } from '@/components/ui/card';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Button } from '@/components/ui/button';
import { BarChart3, Palette, Eye, TrendingUp } from 'lucide-react';

const FeatureOverviewVisualisation: React.FC = () => {
  return (
    <div className="space-y-4">
      <Card className="p-4 border border-gray-200 shadow-sm">
        <div className="flex items-center space-x-2 mb-4">
          <BarChart3 className="w-4 h-4 text-blue-500" />
          <h4 className="font-medium text-gray-900">Chart Configuration</h4>
        </div>
        <div className="space-y-4">
          <div>
            <label className="text-sm font-medium text-gray-700 block mb-2">Primary Visualization</label>
            <Select>
              <SelectTrigger className="bg-white border-gray-300">
                <SelectValue placeholder="Select visualization type..." />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="overview-table">Feature Overview Table</SelectItem>
                <SelectItem value="distribution">Distribution Charts</SelectItem>
                <SelectItem value="correlation">Correlation Matrix</SelectItem>
                <SelectItem value="summary-stats">Summary Statistics</SelectItem>
              </SelectContent>
            </Select>
          </div>
          
          <div>
            <label className="text-sm font-medium text-gray-700 block mb-2">Secondary Chart</label>
            <Select>
              <SelectTrigger className="bg-white border-gray-300">
                <SelectValue placeholder="Optional secondary chart..." />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="none">None</SelectItem>
                <SelectItem value="histogram">Histogram</SelectItem>
                <SelectItem value="boxplot">Box Plot</SelectItem>
                <SelectItem value="scatter">Scatter Plot</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </div>
      </Card>

      <Card className="p-4 border border-gray-200 shadow-sm">
        <div className="flex items-center space-x-2 mb-4">
          <TrendingUp className="w-4 h-4 text-green-500" />
          <h4 className="font-medium text-gray-900">Analysis Options</h4>
        </div>
        <div className="space-y-3">
          <div className="flex items-center justify-between">
            <span className="text-sm text-gray-700">Show data quality metrics</span>
            <input type="checkbox" className="rounded border-gray-300" defaultChecked />
          </div>
          <div className="flex items-center justify-between">
            <span className="text-sm text-gray-700">Include missing value analysis</span>
            <input type="checkbox" className="rounded border-gray-300" defaultChecked />
          </div>
          <div className="flex items-center justify-between">
            <span className="text-sm text-gray-700">Generate statistical summary</span>
            <input type="checkbox" className="rounded border-gray-300" defaultChecked />
          </div>
          <div className="flex items-center justify-between">
            <span className="text-sm text-gray-700">Show unique value counts</span>
            <input type="checkbox" className="rounded border-gray-300" defaultChecked />
          </div>
        </div>
      </Card>

      <Card className="p-4 border border-gray-200 shadow-sm">
        <div className="flex items-center space-x-2 mb-4">
          <Palette className="w-4 h-4 text-purple-500" />
          <h4 className="font-medium text-gray-900">Display Styling</h4>
        </div>
        <div className="space-y-4">
          <div>
            <label className="text-sm font-medium text-gray-700 block mb-2">Table Theme</label>
            <Select>
              <SelectTrigger className="bg-white border-gray-300">
                <SelectValue placeholder="Select table theme..." />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="clean">Clean & Modern</SelectItem>
                <SelectItem value="compact">Compact View</SelectItem>
                <SelectItem value="detailed">Detailed Analysis</SelectItem>
                <SelectItem value="minimal">Minimal</SelectItem>
              </SelectContent>
            </Select>
          </div>

          <div>
            <label className="text-sm font-medium text-gray-700 block mb-2">Color Scheme</label>
            <Select>
              <SelectTrigger className="bg-white border-gray-300">
                <SelectValue placeholder="Choose color scheme..." />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="blue">Blue Gradient</SelectItem>
                <SelectItem value="green">Green Tones</SelectItem>
                <SelectItem value="neutral">Neutral Gray</SelectItem>
                <SelectItem value="rainbow">Multi-color</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </div>
      </Card>

      <Card className="p-4 border border-gray-200 shadow-sm">
        <div className="flex items-center space-x-2 mb-4">
          <Eye className="w-4 h-4 text-orange-500" />
          <h4 className="font-medium text-gray-900">Export Options</h4>
        </div>
        <div className="space-y-3">
          <div className="flex items-center justify-between">
            <span className="text-sm text-gray-700">Include in PDF report</span>
            <input type="checkbox" className="rounded border-gray-300" />
          </div>
          <div className="flex items-center justify-between">
            <span className="text-sm text-gray-700">Export as Excel</span>
            <input type="checkbox" className="rounded border-gray-300" />
          </div>
          <div className="flex items-center justify-between">
            <span className="text-sm text-gray-700">Save as PNG image</span>
            <input type="checkbox" className="rounded border-gray-300" />
          </div>
        </div>
      </Card>

      <Button className="w-full bg-gradient-to-r from-blue-500 to-blue-600 hover:from-blue-600 hover:to-blue-700 text-white shadow-lg">
        Generate Feature Overview
      </Button>
    </div>
  );
};

export default FeatureOverviewVisualisation;
