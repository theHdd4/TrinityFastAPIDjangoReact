
import React from 'react';
import { Card } from '@/components/ui/card';
import { Plus, Grid3X3 } from 'lucide-react';

const Canvas = () => {
  return (
    <div className="h-full bg-gray-50 rounded-lg border-2 border-dashed border-gray-300 relative overflow-hidden">
      {/* Grid Background */}
      <div className="absolute inset-0 opacity-10">
        <div className="grid grid-cols-12 h-full">
          {Array.from({ length: 12 }).map((_, i) => (
            <div key={i} className="border-r border-gray-400"></div>
          ))}
        </div>
        <div className="absolute inset-0 grid grid-rows-8">
          {Array.from({ length: 8 }).map((_, i) => (
            <div key={i} className="border-b border-gray-400"></div>
          ))}
        </div>
      </div>
      
      {/* Empty State */}
      <div className="absolute inset-0 flex items-center justify-center">
        <div className="text-center">
          <div className="w-16 h-16 bg-white rounded-full flex items-center justify-center mx-auto mb-4 shadow-lg">
            <Grid3X3 className="w-8 h-8 text-gray-400" />
          </div>
          <h3 className="text-lg font-semibold text-gray-600 mb-2">
            Start Building Your Workflow
          </h3>
          <p className="text-gray-500 mb-4">
            Drag atoms from the sidebar to build your data science pipeline
          </p>
          <div className="flex items-center justify-center space-x-2 text-sm text-gray-400">
            <Plus className="w-4 h-4" />
            <span>Drop atoms here</span>
          </div>
        </div>
      </div>
      
      {/* Sample positioned atoms for demo */}
      <div className="absolute top-8 left-8">
        <Card className="p-3 bg-white shadow-sm border border-gray-200 w-48">
          <div className="flex items-center space-x-2 mb-2">
            <div className="w-3 h-3 bg-[#41C185] rounded-full"></div>
            <span className="text-sm font-medium">Data Import</span>
          </div>
          <p className="text-xs text-gray-600">CSV, JSON, Database</p>
        </Card>
      </div>
      
      <div className="absolute top-32 left-64">
        <Card className="p-3 bg-white shadow-sm border border-gray-200 w-48">
          <div className="flex items-center space-x-2 mb-2">
            <div className="w-3 h-3 bg-[#458EE2] rounded-full"></div>
            <span className="text-sm font-medium">Data Cleaning</span>
          </div>
          <p className="text-xs text-gray-600">Remove nulls, normalize</p>
        </Card>
      </div>
    </div>
  );
};

export default Canvas;
