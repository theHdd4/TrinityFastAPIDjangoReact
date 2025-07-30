import React from 'react';
import { Card } from '@/components/ui/card';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Eye, Layout, Share2, Download } from 'lucide-react';

const FeatureOverviewExhibition: React.FC = () => {
  return (
    <div className="space-y-4">
      <Card className="p-4 border border-gray-200 shadow-sm">
        <div className="flex items-center space-x-2 mb-4">
          <Layout className="w-4 h-4 text-blue-500" />
          <h4 className="font-medium text-gray-900">Exhibition Layout</h4>
        </div>
        <div className="space-y-4">
          <div>
            <label className="text-sm font-medium text-gray-700 block mb-2">Display Mode</label>
            <Select>
              <SelectTrigger className="bg-white border-gray-300">
                <SelectValue placeholder="Select display mode..." />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="dashboard">Dashboard View</SelectItem>
                <SelectItem value="report">Report Format</SelectItem>
                <SelectItem value="presentation">Presentation Mode</SelectItem>
                <SelectItem value="interactive">Interactive Explorer</SelectItem>
              </SelectContent>
            </Select>
          </div>
          
          <div>
            <label className="text-sm font-medium text-gray-700 block mb-2">Layout Size</label>
            <Select>
              <SelectTrigger className="bg-white border-gray-300">
                <SelectValue placeholder="Choose layout size..." />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="compact">Compact</SelectItem>
                <SelectItem value="standard">Standard</SelectItem>
                <SelectItem value="expanded">Expanded</SelectItem>
                <SelectItem value="fullscreen">Full Screen</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </div>
      </Card>

      <Card className="p-4 border border-gray-200 shadow-sm">
        <div className="flex items-center space-x-2 mb-4">
          <Eye className="w-4 h-4 text-green-500" />
          <h4 className="font-medium text-gray-900">Visibility Settings</h4>
        </div>
        <div className="space-y-3">
          <div className="flex items-center justify-between">
            <span className="text-sm text-gray-700">Show column headers</span>
            <input type="checkbox" className="rounded border-gray-300" defaultChecked />
          </div>
          <div className="flex items-center justify-between">
            <span className="text-sm text-gray-700">Display data types</span>
            <input type="checkbox" className="rounded border-gray-300" defaultChecked />
          </div>
          <div className="flex items-center justify-between">
            <span className="text-sm text-gray-700">Show unique counts</span>
            <input type="checkbox" className="rounded border-gray-300" defaultChecked />
          </div>
          <div className="flex items-center justify-between">
            <span className="text-sm text-gray-700">Include sample values</span>
            <input type="checkbox" className="rounded border-gray-300" />
          </div>
          <div className="flex items-center justify-between">
            <span className="text-sm text-gray-700">Show data quality metrics</span>
            <input type="checkbox" className="rounded border-gray-300" />
          </div>
        </div>
      </Card>

      <Card className="p-4 border border-gray-200 shadow-sm">
        <div className="flex items-center space-x-2 mb-4">
          <Share2 className="w-4 h-4 text-purple-500" />
          <h4 className="font-medium text-gray-900">Sharing Options</h4>
        </div>
        <div className="space-y-4">
          <div>
            <label className="text-sm font-medium text-gray-700 block mb-2">Access Level</label>
            <Select>
              <SelectTrigger className="bg-white border-gray-300">
                <SelectValue placeholder="Select access level..." />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="private">Private</SelectItem>
                <SelectItem value="team">Team Access</SelectItem>
                <SelectItem value="organization">Organization Wide</SelectItem>
                <SelectItem value="public">Public View</SelectItem>
              </SelectContent>
            </Select>
          </div>

          <div>
            <label className="text-sm font-medium text-gray-700 block mb-3">Available Actions</label>
            <div className="flex flex-wrap gap-2">
              <Badge variant="outline" className="text-xs bg-blue-50 border-blue-200">
                View Only
              </Badge>
              <Badge variant="outline" className="text-xs bg-green-50 border-green-200">
                Comment
              </Badge>
              <Badge variant="outline" className="text-xs bg-orange-50 border-orange-200">
                Download
              </Badge>
              <Badge variant="outline" className="text-xs bg-purple-50 border-purple-200">
                Export
              </Badge>
            </div>
          </div>
        </div>
      </Card>

      <Card className="p-4 border border-gray-200 shadow-sm">
        <div className="flex items-center space-x-2 mb-4">
          <Download className="w-4 h-4 text-orange-500" />
          <h4 className="font-medium text-gray-900">Export Configuration</h4>
        </div>
        <div className="space-y-3">
          <div>
            <label className="text-sm font-medium text-gray-700 block mb-2">Export Format</label>
            <Select>
              <SelectTrigger className="bg-white border-gray-300">
                <SelectValue placeholder="Choose export format..." />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="pdf">PDF Report</SelectItem>
                <SelectItem value="excel">Excel Workbook</SelectItem>
                <SelectItem value="csv">CSV File</SelectItem>
                <SelectItem value="json">JSON Data</SelectItem>
                <SelectItem value="png">PNG Image</SelectItem>
              </SelectContent>
            </Select>
          </div>
          
          <div className="flex items-center justify-between">
            <span className="text-sm text-gray-700">Include metadata</span>
            <input type="checkbox" className="rounded border-gray-300" defaultChecked />
          </div>
          <div className="flex items-center justify-between">
            <span className="text-sm text-gray-700">Add timestamp</span>
            <input type="checkbox" className="rounded border-gray-300" defaultChecked />
          </div>
        </div>
      </Card>

      <div className="flex space-x-3">
        <Button className="flex-1 bg-gradient-to-r from-blue-500 to-blue-600 hover:from-blue-600 hover:to-blue-700 text-white">
          <Eye className="w-4 h-4 mr-2" />
          Preview Exhibition
        </Button>
        <Button variant="outline" className="flex-1">
          <Share2 className="w-4 h-4 mr-2" />
          Share Now
        </Button>
      </div>
    </div>
  );
};

export default FeatureOverviewExhibition;
