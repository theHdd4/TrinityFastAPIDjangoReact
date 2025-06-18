import React from 'react';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Checkbox } from '@/components/ui/checkbox';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Eye, Share2, Download, Layout } from 'lucide-react';

const ExhibitionTab: React.FC = () => {
  return (
    <div className="space-y-4 pt-4">
      <Card className="p-4 border border-gray-200 shadow-sm">
        <div className="flex items-center space-x-2 mb-4">
          <Eye className="w-4 h-4 text-blue-500" />
          <h4 className="font-medium text-gray-900">Exhibition Display</h4>
        </div>
        <div className="space-y-4">
          <div className="flex items-center space-x-3">
            <Checkbox />
            <label className="text-sm font-medium text-gray-700">Display in Exhibition Mode</label>
          </div>
          <div className="flex items-center space-x-3">
            <Checkbox defaultChecked />
            <label className="text-sm font-medium text-gray-700">Show Data Summary</label>
          </div>
          <div className="flex items-center space-x-3">
            <Checkbox defaultChecked />
            <label className="text-sm font-medium text-gray-700">Include Validation Results</label>
          </div>
          <div className="flex items-center space-x-3">
            <Checkbox />
            <label className="text-sm font-medium text-gray-700">Show Processing Status</label>
          </div>
        </div>
      </Card>

      <Card className="p-4 border border-gray-200 shadow-sm">
        <div className="flex items-center space-x-2 mb-4">
          <Layout className="w-4 h-4 text-blue-500" />
          <h4 className="font-medium text-gray-900">Layout Configuration</h4>
        </div>
        <div className="space-y-4">
          <div>
            <label className="text-sm font-medium text-gray-700 block mb-2">Exhibition Title</label>
            <Input type="text" className="bg-white border-gray-300" placeholder="Data Upload & Validation Dashboard" />
          </div>

          <div>
            <label className="text-sm font-medium text-gray-700 block mb-2">Description</label>
            <Input type="text" className="bg-white border-gray-300" placeholder="Interactive data upload and validation interface" />
          </div>

          <div>
            <label className="text-sm font-medium text-gray-700 block mb-2">Layout Style</label>
            <Select>
              <SelectTrigger className="bg-white border-gray-300">
                <SelectValue placeholder="Choose layout..." />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="full">Full Width</SelectItem>
                <SelectItem value="split">Split View</SelectItem>
                <SelectItem value="tabbed">Tabbed Interface</SelectItem>
                <SelectItem value="minimal">Minimal View</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </div>
      </Card>

      <Card className="p-4 border border-gray-200 shadow-sm">
        <div className="flex items-center space-x-2 mb-4">
          <Share2 className="w-4 h-4 text-blue-500" />
          <h4 className="font-medium text-gray-900">Sharing Options</h4>
        </div>
        <div className="space-y-3">
          <div className="flex items-center justify-between">
            <span className="text-sm text-gray-700">Public Access</span>
            <input type="checkbox" className="rounded border-gray-300" />
          </div>
          <div className="flex items-center justify-between">
            <span className="text-sm text-gray-700">Allow Downloads</span>
            <input type="checkbox" className="rounded border-gray-300" />
          </div>
          <div className="flex items-center justify-between">
            <span className="text-sm text-gray-700">Enable Comments</span>
            <input type="checkbox" className="rounded border-gray-300" />
          </div>
        </div>
      </Card>

      <div className="space-y-2">
        <Button className="w-full bg-gradient-to-r from-blue-500 to-blue-600 hover:from-blue-600 hover:to-blue-700 text-white shadow-lg">
          <Eye className="w-4 h-4 mr-2" />
          Save Exhibition Settings
        </Button>
        <Button variant="outline" className="w-full border-gray-300">
          <Download className="w-4 h-4 mr-2" />
          Export Configuration
        </Button>
      </div>
    </div>
  );
};

export default ExhibitionTab;
