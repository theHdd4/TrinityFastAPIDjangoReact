
import React from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { BarChart3, LineChart, PieChart, Activity } from 'lucide-react';

const CreateColumnVisualisation: React.FC = () => {
  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center space-x-2">
            <BarChart3 className="w-5 h-5 text-purple-500" />
            <span>Visualization Options</span>
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="p-4 border border-gray-200 rounded-lg hover:border-purple-300 hover:bg-purple-50 transition-all cursor-pointer">
              <div className="flex items-center space-x-3 mb-2">
                <BarChart3 className="w-8 h-8 text-purple-500" />
                <h4 className="font-semibold text-gray-900">Column Comparison</h4>
              </div>
              <p className="text-sm text-gray-600">
                Compare original and newly created columns using bar charts
              </p>
            </div>

            <div className="p-4 border border-gray-200 rounded-lg hover:border-purple-300 hover:bg-purple-50 transition-all cursor-pointer">
              <div className="flex items-center space-x-3 mb-2">
                <LineChart className="w-8 h-8 text-purple-500" />
                <h4 className="font-semibold text-gray-900">Trend Analysis</h4>
              </div>
              <p className="text-sm text-gray-600">
                Visualize trends in the newly created columns over time
              </p>
            </div>

            <div className="p-4 border border-gray-200 rounded-lg hover:border-purple-300 hover:bg-purple-50 transition-all cursor-pointer">
              <div className="flex items-center space-x-3 mb-2">
                <Activity className="w-8 h-8 text-purple-500" />
                <h4 className="font-semibold text-gray-900">Correlation Plot</h4>
              </div>
              <p className="text-sm text-gray-600">
                Show relationships between original and calculated columns
              </p>
            </div>

            <div className="p-4 border border-gray-200 rounded-lg hover:border-purple-300 hover:bg-purple-50 transition-all cursor-pointer">
              <div className="flex items-center space-x-3 mb-2">
                <PieChart className="w-8 h-8 text-purple-500" />
                <h4 className="font-semibold text-gray-900">Distribution</h4>
              </div>
              <p className="text-sm text-gray-600">
                Analyze the distribution of values in new columns
              </p>
            </div>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Visualization Preview</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="flex items-center justify-center h-64 bg-gray-50 rounded-lg border-2 border-dashed border-gray-300">
            <div className="text-center">
              <BarChart3 className="w-16 h-16 text-gray-400 mx-auto mb-4" />
              <p className="text-gray-600">
                Visualizations will appear here after creating columns
              </p>
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  );
};

export default CreateColumnVisualisation;