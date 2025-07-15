
import React from 'react';
import { Card } from '@/components/ui/card';
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, PieChart, Pie, Cell } from 'recharts';
import { ClassifierData } from '../ColumnClassifierAtom';

interface ColumnClassifierVisualisationProps {
  data: ClassifierData;
}

const ColumnClassifierVisualisation: React.FC<ColumnClassifierVisualisationProps> = ({ data }) => {
  if (!data.files.length) {
    return (
      <div className="text-center p-8">
        <p className="text-gray-500">Upload and classify data to see visualizations</p>
      </div>
    );
  }

  const currentFile = data.files[data.activeFileIndex];
  const displayName = currentFile.fileName.split('/').pop();
  
  const categoryCounts = {
    identifiers: currentFile.columns.filter(col => col.category === 'identifiers').length,
    measures: currentFile.columns.filter(col => col.category === 'measures').length,
    unclassified: currentFile.columns.filter(col => col.category === 'unclassified').length,
    customDimensions: Object.keys(currentFile.customDimensions).length
  };

  const barData = [
    { name: 'Identifiers', count: categoryCounts.identifiers },
    { name: 'Measures', count: categoryCounts.measures },
    { name: 'Unclassified', count: categoryCounts.unclassified },
    ...(categoryCounts.customDimensions > 0
      ? [{ name: 'Custom Dimensions', count: categoryCounts.customDimensions }]
      : [])
  ];

  const pieData = [
    { name: 'Identifiers', value: categoryCounts.identifiers, color: '#3b82f6' },
    { name: 'Measures', value: categoryCounts.measures, color: '#10b981' },
    { name: 'Unclassified', value: categoryCounts.unclassified, color: '#f59e0b' },
    ...(categoryCounts.customDimensions > 0
      ? [{ name: 'Custom Dimensions', value: categoryCounts.customDimensions, color: '#8b5cf6' }]
      : [])
  ];

  return (
    <div className="space-y-4">
      <Card className="p-4">
        <h4 className="font-semibold text-gray-900 mb-2">Current File</h4>
        <p className="text-sm text-gray-600 mb-4 break-all whitespace-normal">{displayName}</p>
        
        <h5 className="font-medium text-gray-900 mb-4">Column Distribution</h5>
        <ResponsiveContainer width="100%" height={160}>
          <BarChart data={barData}>
            <CartesianGrid strokeDasharray="3 3" />
            <XAxis dataKey="name" />
            <YAxis />
            <Tooltip />
            <Bar dataKey="count" fill="#3b82f6" />
          </BarChart>
        </ResponsiveContainer>
      </Card>

      <Card className="p-4">
        <h4 className="font-semibold text-gray-900 mb-4">Category Breakdown</h4>
        <ResponsiveContainer width="100%" height={160}>
          <PieChart>
            <Pie
              data={pieData}
              cx="50%"
              cy="50%"
              outerRadius={80}
              dataKey="value"
              label={({ name, value }) => `${name}: ${value}`}
            >
              {pieData.map((entry, index) => (
                <Cell key={`cell-${index}`} fill={entry.color} />
              ))}
            </Pie>
            <Tooltip />
          </PieChart>
        </ResponsiveContainer>
      </Card>

      <Card className="p-4">
        <h4 className="font-semibold text-gray-900 mb-4">Summary</h4>
        <div className="space-y-2 text-sm">
          <div className="flex justify-between">
            <span>Total Files:</span>
            <span className="font-medium">{data.files.length}</span>
          </div>
          <div className="flex justify-between">
            <span>Total Columns:</span>
            <span className="font-medium">{currentFile.columns.length}</span>
          </div>
          <div className="flex justify-between">
            <span>Classified:</span>
            <span className="font-medium">
              {categoryCounts.identifiers + categoryCounts.measures + Object.values(currentFile.customDimensions).flat().length}
            </span>
          </div>
          <div className="flex justify-between">
            <span>Unclassified:</span>
            <span className="font-medium">{categoryCounts.unclassified}</span>
          </div>
          <div className="flex justify-between">
            <span>Classification Rate:</span>
            <span className="font-medium">
              {((categoryCounts.identifiers + categoryCounts.measures + Object.values(currentFile.customDimensions).flat().length) / currentFile.columns.length * 100).toFixed(1)}%
            </span>
          </div>
          {categoryCounts.customDimensions > 0 && (
            <div className="flex justify-between">
              <span>Custom Dimensions:</span>
              <span className="font-medium">{categoryCounts.customDimensions}</span>
            </div>
          )}
        </div>
      </Card>
    </div>
  );
};

export default ColumnClassifierVisualisation;