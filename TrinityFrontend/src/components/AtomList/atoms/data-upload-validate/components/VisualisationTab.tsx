import React from 'react';
import { Card } from '@/components/ui/card';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Button } from '@/components/ui/button';
import { BarChart3, Palette, Eye } from 'lucide-react';

const VisualisationTab: React.FC = () => {
  return (
    <div className="space-y-4 pt-4">
      <Card className="p-4 border border-gray-200 shadow-sm">
        <div className="flex items-center space-x-2 mb-4">
          <BarChart3 className="w-4 h-4 text-blue-500" />
          <h4 className="font-medium text-gray-900">Chart Configuration</h4>
        </div>
        <div className="space-y-4">
          <div>
            <label className="text-sm font-medium text-gray-700 block mb-2">Primary Chart Type</label>
            <Select>
              <SelectTrigger className="bg-white border-gray-300">
                <SelectValue placeholder="Select chart type..." />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="bar">Bar Chart</SelectItem>
                <SelectItem value="line">Line Chart</SelectItem>
                <SelectItem value="pie">Pie Chart</SelectItem>
                <SelectItem value="scatter">Scatter Plot</SelectItem>
                <SelectItem value="heatmap">Heatmap</SelectItem>
                <SelectItem value="table">Data Table</SelectItem>
              </SelectContent>
            </Select>
          </div>

          <div>
            <label className="text-sm font-medium text-gray-700 block mb-2">Secondary Visualization</label>
            <Select>
              <SelectTrigger className="bg-white border-gray-300">
                <SelectValue placeholder="Optional secondary chart..." />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="none">None</SelectItem>
                <SelectItem value="trend">Trend Line</SelectItem>
                <SelectItem value="summary">Summary Statistics</SelectItem>
                <SelectItem value="distribution">Distribution Plot</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </div>
      </Card>

      <Card className="p-4 border border-gray-200 shadow-sm">
        <div className="flex items-center space-x-2 mb-4">
          <Palette className="w-4 h-4 text-blue-500" />
          <h4 className="font-medium text-gray-900">Visual Styling</h4>
        </div>
        <div className="space-y-4">
          <div>
            <label className="text-sm font-medium text-gray-700 block mb-2">Color Scheme</label>
            <Select>
              <SelectTrigger className="bg-white border-gray-300">
                <SelectValue placeholder="Choose color scheme..." />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="corporate">Corporate Blue</SelectItem>
                <SelectItem value="vibrant">Vibrant Rainbow</SelectItem>
                <SelectItem value="pastel">Soft Pastels</SelectItem>
                <SelectItem value="monochrome">Monochrome</SelectItem>
                <SelectItem value="earth">Earth Tones</SelectItem>
              </SelectContent>
            </Select>
          </div>

          <div>
            <label className="text-sm font-medium text-gray-700 block mb-2">Theme</label>
            <Select>
              <SelectTrigger className="bg-white border-gray-300">
                <SelectValue placeholder="Select theme..." />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="light">Light Theme</SelectItem>
                <SelectItem value="dark">Dark Theme</SelectItem>
                <SelectItem value="minimal">Minimal</SelectItem>
                <SelectItem value="modern">Modern</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </div>
      </Card>

      <Card className="p-4 border border-gray-200 shadow-sm">
        <div className="flex items-center space-x-2 mb-4">
          <Eye className="w-4 h-4 text-blue-500" />
          <h4 className="font-medium text-gray-900">Display Options</h4>
        </div>
        <div className="space-y-3">
          <div className="flex items-center justify-between">
            <span className="text-sm text-gray-700">Show Data Labels</span>
            <input type="checkbox" className="rounded border-gray-300" />
          </div>
          <div className="flex items-center justify-between">
            <span className="text-sm text-gray-700">Enable Tooltips</span>
            <input type="checkbox" className="rounded border-gray-300" defaultChecked />
          </div>
          <div className="flex items-center justify-between">
            <span className="text-sm text-gray-700">Show Legend</span>
            <input type="checkbox" className="rounded border-gray-300" defaultChecked />
          </div>
          <div className="flex items-center justify-between">
            <span className="text-sm text-gray-700">Interactive Zoom</span>
            <input type="checkbox" className="rounded border-gray-300" />
          </div>
        </div>
      </Card>

      <Button className="w-full bg-gradient-to-r from-blue-500 to-blue-600 hover:from-blue-600 hover:to-blue-700 text-white shadow-lg">
        Apply Visualization Settings
      </Button>
    </div>
  );
};

export default VisualisationTab;
