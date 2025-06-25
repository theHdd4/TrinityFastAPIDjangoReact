import React from 'react';
import { Card } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Button } from '@/components/ui/button';
import { ChevronDown, Filter, TrendingUp, BarChart3 } from 'lucide-react';

interface FeatureOverviewCanvasProps {
  settings: any;
}

const FeatureOverviewCanvas: React.FC<FeatureOverviewCanvasProps> = ({ settings }) => {
  // Sample data structure matching the image
  const featureData = [
    { 
      column: 'Market', 
      dataType: 'String', 
      uniqueCount: 5, 
      uniqueValues: ['Market1', 'Market2', 'Market3', 'Market4', 'Market5'],
      nullCount: 0,
      sampleValues: ['Market1', 'Market2', 'Market3']
    },
    { 
      column: 'Channel', 
      dataType: 'String', 
      uniqueCount: 4, 
      uniqueValues: ['Channel1', 'Channel2', 'Channel3', 'Channel4'],
      nullCount: 0,
      sampleValues: ['Channel1', 'Channel2', 'Channel3']
    },
    { 
      column: 'Region', 
      dataType: 'String', 
      uniqueCount: 3, 
      uniqueValues: ['Region1', 'Region2', 'Region3'],
      nullCount: 0,
      sampleValues: ['Region1', 'Region2', 'Region3']
    },
    { 
      column: 'Brand', 
      dataType: 'String', 
      uniqueCount: 5, 
      uniqueValues: ['Brand1', 'Brand2', 'Brand3', 'Brand4', 'Brand5'],
      nullCount: 2,
      sampleValues: ['Brand1', 'Brand2', 'Brand3']
    },
    { 
      column: 'Variant', 
      dataType: 'String', 
      uniqueCount: 8, 
      uniqueValues: ['Variant1', 'Variant2', 'Variant3', 'Variant4', 'Variant5', 'Variant6', 'Variant7', 'Variant8'],
      nullCount: 1,
      sampleValues: ['Variant1', 'Variant2', 'Variant3']
    },
    { 
      column: 'PackType', 
      dataType: 'String', 
      uniqueCount: 3, 
      uniqueValues: ['PackType1', 'PackType2', 'PackType3'],
      nullCount: 0,
      sampleValues: ['PackType1', 'PackType2', 'PackType3']
    },
    { 
      column: 'PackSize', 
      dataType: 'String', 
      uniqueCount: 4, 
      uniqueValues: ['Small', 'Medium', 'Large', 'XLarge'],
      nullCount: 0,
      sampleValues: ['Small', 'Medium', 'Large']
    },
    { 
      column: 'PPG', 
      dataType: 'Numeric', 
      uniqueCount: 156, 
      uniqueValues: [],
      nullCount: 5,
      sampleValues: ['12.50', '15.75', '18.20']
    }
  ];

  const detailedData = [
    { srNo: 1, region: 'Region 1', channel: 'Channel 1', brand: 'Brand 1', packType: 'PackType 1', variant: 'Variant 1', ppg: 'PPG 1', viewStat: 'View Stat' },
    { srNo: 2, region: 'Region 1', channel: 'Channel 2', brand: 'Brand 1', packType: 'PackType 2', variant: 'Variant 1', ppg: 'PPG 2', viewStat: 'View Stat' },
    { srNo: 3, region: 'Region 1', channel: 'Channel 3', brand: 'Brand 1', packType: 'PackType 1', variant: 'Variant 1', ppg: 'PPG 3', viewStat: 'View Stat' },
    { srNo: 4, region: 'Region 1', channel: 'Channel 4', brand: 'Brand 1', packType: 'PackType 1', variant: 'Variant 2', ppg: 'PPG 1', viewStat: 'View Stat' },
    { srNo: 5, region: 'Region 2', channel: 'Channel 1', brand: 'Brand 1', packType: 'PackType 1', variant: 'Variant 2', ppg: 'PPG 2', viewStat: 'View Stat' },
    { srNo: 6, region: 'Region 2', channel: 'Channel 2', brand: 'Brand 1', packType: 'PackType 2', variant: 'Variant 2', ppg: 'PPG 3', viewStat: 'View Stat' },
    { srNo: 7, region: 'Region 2', channel: 'Channel 3', brand: 'Brand 1', packType: 'PackType 1', variant: 'Variant 2', ppg: 'PPG 4', viewStat: 'View Stat' },
    { srNo: 8, region: 'Region 2', channel: 'Channel 4', brand: 'Brand 1', packType: 'PackType 2', variant: 'Variant 3', ppg: 'PPG 1', viewStat: 'View Stat' }
  ];

  const getDataTypeColor = (type: string) => {
    switch (type.toLowerCase()) {
      case 'string':
        return 'bg-blue-100 text-blue-800 border-blue-200';
      case 'numeric':
        return 'bg-green-100 text-green-800 border-green-200';
      case 'datetime':
        return 'bg-purple-100 text-purple-800 border-purple-200';
      default:
        return 'bg-gray-100 text-gray-800 border-gray-200';
    }
  };

  return (
    <div className="w-full h-full p-6 bg-gradient-to-br from-slate-50 to-blue-50 overflow-y-auto">
      {/* Column View Section */}
      <div className="mb-8">
        <div className="flex items-center mb-6">
          <div className="w-1 h-8 bg-gradient-to-b from-blue-500 to-blue-600 rounded-full mr-4"></div>
          <h3 className="text-xl font-bold text-gray-900">Column View</h3>
        </div>
        
        <Card className="border-0 shadow-xl bg-white/80 backdrop-blur-sm mb-6 overflow-hidden">
          <div className="bg-gradient-to-r from-blue-500 to-blue-600 p-1">
            <div className="bg-white rounded-sm">
              <Table>
                <TableHeader>
                  <TableRow className="bg-gradient-to-r from-gray-50 to-blue-50 border-b-2 border-blue-100">
                    <TableHead className="font-bold text-gray-800 text-center py-4">Columns</TableHead>
                    <TableHead className="font-bold text-gray-800 text-center py-4">Data Type</TableHead>
                    <TableHead className="font-bold text-gray-800 text-center py-4">Unique Counts</TableHead>
                    <TableHead className="font-bold text-gray-800 text-center py-4">Unique Values</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {featureData.map((feature, index) => (
                    <TableRow key={index} className="hover:bg-blue-50/50 transition-all duration-200 border-b border-gray-100">
                      <TableCell className="font-semibold text-gray-900 text-center py-4">
                        {feature.column}
                      </TableCell>
                      <TableCell className="text-center py-4">
                        <Badge 
                          variant="outline" 
                          className={`text-xs font-medium ${getDataTypeColor(feature.dataType)} shadow-sm`}
                        >
                          {feature.dataType}
                        </Badge>
                      </TableCell>
                      <TableCell className="text-gray-700 text-center font-medium py-4">
                        {feature.uniqueCount}
                      </TableCell>
                      <TableCell className="text-center py-4">
                        <div className="flex flex-wrap gap-1 justify-center">
                          {feature.uniqueValues.slice(0, 3).map((value, idx) => (
                            <Badge key={idx} variant="outline" className="text-xs bg-gray-50 hover:bg-gray-100 transition-colors">
                              {value}
                            </Badge>
                          ))}
                          {feature.uniqueValues.length > 3 && (
                            <Badge variant="outline" className="text-xs bg-orange-50 text-orange-700 border-orange-200">
                              +{feature.uniqueValues.length - 3}
                            </Badge>
                          )}
                          {feature.uniqueValues.length === 0 && (
                            <span className="text-xs text-gray-500 italic font-medium">Multiple values</span>
                          )}
                        </div>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          </div>
        </Card>
      </div>

      {/* Hierarchical View Section */}
      {settings.hierarchicalView && (
        <div className="mb-8">
          <div className="flex items-center mb-6">
            <input type="checkbox" checked={true} readOnly className="mr-3 w-4 h-4 text-blue-600 rounded" />
            <span className="font-semibold text-gray-900 text-lg">Open Hierarchical View</span>
          </div>
          
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-8 mb-8">
            {/* Market Dimension */}
            <Card className="border-0 shadow-xl bg-white/90 backdrop-blur-sm overflow-hidden transform hover:scale-105 transition-all duration-300">
              <div className="bg-gradient-to-r from-blue-500 to-blue-600 p-4">
                <h4 className="font-bold text-white text-lg flex items-center">
                  <BarChart3 className="w-5 h-5 mr-2" />
                  Market Dimension
                </h4>
              </div>
              <div className="p-6">
                <div className="flex flex-wrap gap-3">
                  <Badge className="bg-gradient-to-r from-blue-500 to-blue-600 text-white px-4 py-2 font-medium">Region</Badge>
                  <Badge className="bg-gradient-to-r from-blue-500 to-blue-600 text-white px-4 py-2 font-medium">Channel</Badge>
                  <div className="flex items-center justify-center w-10 h-10 bg-gradient-to-r from-blue-500 to-blue-600 text-white rounded-full font-bold text-lg shadow-lg">
                    +
                  </div>
                </div>
              </div>
            </Card>

            {/* Product Dimension */}
            <Card className="border-0 shadow-xl bg-white/90 backdrop-blur-sm overflow-hidden transform hover:scale-105 transition-all duration-300">
              <div className="bg-gradient-to-r from-green-500 to-green-600 p-4">
                <h4 className="font-bold text-white text-lg flex items-center">
                  <TrendingUp className="w-5 h-5 mr-2" />
                  Product Dimension
                </h4>
              </div>
              <div className="p-6">
                <div className="flex flex-wrap gap-3">
                  <Badge className="bg-gradient-to-r from-green-500 to-green-600 text-white px-4 py-2 font-medium">Brand</Badge>
                  <Badge className="bg-gradient-to-r from-green-500 to-green-600 text-white px-4 py-2 font-medium">Variant</Badge>
                  <Badge className="bg-gradient-to-r from-green-500 to-green-600 text-white px-4 py-2 font-medium">PackType</Badge>
                  <Badge className="bg-gradient-to-r from-green-500 to-green-600 text-white px-4 py-2 font-medium">PPG</Badge>
                  <div className="flex items-center justify-center w-10 h-10 bg-gradient-to-r from-green-500 to-green-600 text-white rounded-full font-bold text-lg shadow-lg">
                    +
                  </div>
                </div>
              </div>
            </Card>
          </div>
        </div>
      )}

      {/* Data Table Section */}
      <div className="mb-8">
        <Card className="border-0 shadow-xl bg-white/80 backdrop-blur-sm overflow-hidden">
          <div className="bg-gradient-to-r from-purple-500 to-purple-600 p-1">
            <div className="bg-white rounded-sm">
              <Table>
                <TableHeader>
                  <TableRow className="bg-gradient-to-r from-gray-50 to-purple-50 border-b-2 border-purple-100">
                    <TableHead className="font-bold text-gray-800 text-center py-4">SR NO.</TableHead>
                    <TableHead className="font-bold text-gray-800 text-center py-4">
                      Region <ChevronDown className="w-4 h-4 inline ml-1" />
                    </TableHead>
                    <TableHead className="font-bold text-gray-800 text-center py-4">
                      Channel <ChevronDown className="w-4 h-4 inline ml-1" />
                    </TableHead>
                    <TableHead className="font-bold text-gray-800 text-center py-4">
                      Brand <Filter className="w-4 h-4 inline ml-1" />
                    </TableHead>
                    <TableHead className="font-bold text-gray-800 text-center py-4">
                      PackType <ChevronDown className="w-4 h-4 inline ml-1" />
                    </TableHead>
                    <TableHead className="font-bold text-gray-800 text-center py-4">
                      Variant <ChevronDown className="w-4 h-4 inline ml-1" />
                    </TableHead>
                    <TableHead className="font-bold text-gray-800 text-center py-4">
                      PPG <ChevronDown className="w-4 h-4 inline ml-1" />
                    </TableHead>
                    <TableHead className="font-bold text-gray-800 text-center py-4">View Stat</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {detailedData.map((row, index) => (
                    <TableRow key={index} className="hover:bg-purple-50/50 transition-all duration-200 border-b border-gray-100">
                      <TableCell className="text-center py-3 font-medium">{row.srNo}</TableCell>
                      <TableCell className="text-center py-3">{row.region}</TableCell>
                      <TableCell className="text-center py-3">{row.channel}</TableCell>
                      <TableCell className="text-center py-3">{row.brand}</TableCell>
                      <TableCell className="text-center py-3">{row.packType}</TableCell>
                      <TableCell className="text-center py-3">{row.variant}</TableCell>
                      <TableCell className="text-center py-3">{row.ppg}</TableCell>
                      <TableCell className="text-center py-3">
                        <button className="text-blue-600 hover:text-blue-800 font-medium underline transition-colors">
                          {row.viewStat}
                        </button>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          </div>
        </Card>
      </div>

      {/* Enhanced Analytics Section */}
      <div className="grid grid-cols-1 xl:grid-cols-3 gap-8">
        {/* Chart Section - Now takes 2 columns on large screens */}
        <div className="xl:col-span-2">
          <Card className="border-0 shadow-xl bg-white/90 backdrop-blur-sm overflow-hidden h-80">
            <div className="bg-gradient-to-r from-indigo-500 to-purple-600 p-4">
              <h4 className="font-bold text-white text-lg flex items-center">
                <TrendingUp className="w-5 h-5 mr-2" />
                SalesValue Trend Analysis
              </h4>
            </div>
            <div className="p-6 h-full flex items-center justify-center">
              <div className="w-full h-full flex flex-col items-center justify-center">
                <svg width="100%" height="200" viewBox="0 0 400 200" className="mx-auto">
                  {/* Grid lines */}
                  <defs>
                    <pattern id="grid" width="40" height="20" patternUnits="userSpaceOnUse">
                      <path d="M 40 0 L 0 0 0 20" fill="none" stroke="#e5e7eb" strokeWidth="0.5"/>
                    </pattern>
                  </defs>
                  <rect width="100%" height="100%" fill="url(#grid)" />
                  
                  {/* Gradient area under the line */}
                  <defs>
                    <linearGradient id="areaGradient" x1="0%" y1="0%" x2="0%" y2="100%">
                      <stop offset="0%" stopColor="#3b82f6" stopOpacity="0.3"/>
                      <stop offset="100%" stopColor="#3b82f6" stopOpacity="0.05"/>
                    </linearGradient>
                  </defs>
                  
                  <polygon
                    fill="url(#areaGradient)"
                    points="30,160 60,140 90,120 120,130 150,110 180,100 210,90 240,80 270,85 300,75 300,180 30,180"
                  />
                  
                  {/* Main trend line */}
                  <polyline
                    fill="none"
                    stroke="url(#lineGradient)"
                    strokeWidth="3"
                    points="30,160 60,140 90,120 120,130 150,110 180,100 210,90 240,80 270,85 300,75"
                  />
                  
                  <defs>
                    <linearGradient id="lineGradient" x1="0%" y1="0%" x2="100%" y2="0%">
                      <stop offset="0%" stopColor="#3b82f6"/>
                      <stop offset="50%" stopColor="#8b5cf6"/>
                      <stop offset="100%" stopColor="#06b6d4"/>
                    </linearGradient>
                  </defs>
                  
                  {/* Data points */}
                  <circle cx="30" cy="160" r="4" fill="#3b82f6" className="drop-shadow-sm" />
                  <circle cx="60" cy="140" r="4" fill="#3b82f6" className="drop-shadow-sm" />
                  <circle cx="90" cy="120" r="4" fill="#3b82f6" className="drop-shadow-sm" />
                  <circle cx="120" cy="130" r="4" fill="#3b82f6" className="drop-shadow-sm" />
                  <circle cx="150" cy="110" r="4" fill="#8b5cf6" className="drop-shadow-sm" />
                  <circle cx="180" cy="100" r="4" fill="#8b5cf6" className="drop-shadow-sm" />
                  <circle cx="210" cy="90" r="4" fill="#8b5cf6" className="drop-shadow-sm" />
                  <circle cx="240" cy="80" r="4" fill="#06b6d4" className="drop-shadow-sm" />
                  <circle cx="270" cy="85" r="4" fill="#06b6d4" className="drop-shadow-sm" />
                  <circle cx="300" cy="75" r="4" fill="#06b6d4" className="drop-shadow-sm" />
                  
                  {/* Axes */}
                  <defs>
                    <marker id="arrowhead" markerWidth="10" markerHeight="7" 
                     refX="0" refY="3.5" orient="auto">
                      <polygon points="0 0, 10 3.5, 0 7" fill="#6b7280" />
                    </marker>
                  </defs>
                  <line x1="30" y1="180" x2="350" y2="180" stroke="#6b7280" strokeWidth="2" markerEnd="url(#arrowhead)" />
                  <line x1="30" y1="180" x2="30" y2="40" stroke="#6b7280" strokeWidth="2" markerEnd="url(#arrowhead)" />
                  
                  <text x="360" y="185" fontSize="12" fill="#6b7280" fontWeight="600">Week-Year</text>
                  <text x="15" y="30" fontSize="12" fill="#6b7280" fontWeight="600">Value</text>
                </svg>
                <div className="mt-4 flex items-center gap-4 text-sm text-gray-600">
                  <div className="flex items-center gap-2">
                    <div className="w-3 h-3 rounded-full bg-gradient-to-r from-blue-500 to-purple-500"></div>
                    <span>Sales Trend</span>
                  </div>
                  <div className="flex items-center gap-2">
                    <div className="w-3 h-3 rounded-full bg-blue-200"></div>
                    <span>Confidence Range</span>
                  </div>
                </div>
              </div>
            </div>
          </Card>
        </div>

        {/* Enhanced Summary Table */}
        <div className="xl:col-span-1">
          <Card className="border-0 shadow-xl bg-white/90 backdrop-blur-sm overflow-hidden h-80">
            <div className="bg-gradient-to-r from-emerald-500 to-teal-600 p-4">
              <h5 className="font-bold text-white text-sm flex items-center">
                <BarChart3 className="w-4 h-4 mr-2" />
                Statistical Summary
              </h5>
            </div>
            <div className="p-4 overflow-y-auto h-full">
              <div className="text-xs text-gray-600 mb-4 font-medium bg-gray-50 p-2 rounded">
                Details: Region*Channel*Brand*PackType*Variant [PPG]
                <br />
                <span className="text-emerald-600 font-semibold">01-JUL-16 to 30-JUN-24</span>
              </div>
              
              <div className="space-y-1">
                <Table>
                  <TableHeader>
                    <TableRow className="border-b border-gray-200">
                      <TableHead className="text-xs p-2 font-bold text-gray-700">Metric</TableHead>
                      <TableHead className="text-xs p-2 font-bold text-gray-700">Avg</TableHead>
                      <TableHead className="text-xs p-2 font-bold text-gray-700">Min</TableHead>
                      <TableHead className="text-xs p-2 font-bold text-gray-700">Max</TableHead>
                      <TableHead className="text-xs p-2 font-bold text-gray-700">Action</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    <TableRow className="hover:bg-emerald-50/50 transition-colors">
                      <TableCell className="text-xs p-2 font-semibold text-gray-800">SalesValue</TableCell>
                      <TableCell className="text-xs p-2 text-emerald-600 font-bold">342.76</TableCell>
                      <TableCell className="text-xs p-2">01-JUL-21</TableCell>
                      <TableCell className="text-xs p-2 text-green-600 font-bold">1024.54</TableCell>
                      <TableCell className="text-xs p-2">
                        <button className="text-blue-600 hover:text-blue-800 font-medium underline transition-colors">
                          View
                        </button>
                      </TableCell>
                    </TableRow>
                    <TableRow className="hover:bg-blue-50/50 transition-colors">
                      <TableCell className="text-xs p-2 font-semibold text-gray-800">Volume</TableCell>
                      <TableCell className="text-xs p-2 text-gray-400">-</TableCell>
                      <TableCell className="text-xs p-2 text-gray-400">-</TableCell>
                      <TableCell className="text-xs p-2 text-gray-400">-</TableCell>
                      <TableCell className="text-xs p-2">
                        <button className="text-blue-600 hover:text-blue-800 font-medium underline transition-colors">
                          View
                        </button>
                      </TableCell>
                    </TableRow>
                    <TableRow className="hover:bg-purple-50/50 transition-colors">
                      <TableCell className="text-xs p-2 font-semibold text-gray-800">Volume Unit</TableCell>
                      <TableCell className="text-xs p-2 text-gray-400">-</TableCell>
                      <TableCell className="text-xs p-2 text-gray-400">-</TableCell>
                      <TableCell className="text-xs p-2 text-gray-400">-</TableCell>
                      <TableCell className="text-xs p-2">
                        <button className="text-blue-600 hover:text-blue-800 font-medium underline transition-colors">
                          View
                        </button>
                      </TableCell>
                    </TableRow>
                    <TableRow className="hover:bg-orange-50/50 transition-colors">
                      <TableCell className="text-xs p-2 font-semibold text-gray-800">Distribution</TableCell>
                      <TableCell className="text-xs p-2 text-gray-400">-</TableCell>
                      <TableCell className="text-xs p-2 text-gray-400">-</TableCell>
                      <TableCell className="text-xs p-2 text-gray-400">-</TableCell>
                      <TableCell className="text-xs p-2">
                        <button className="text-blue-600 hover:text-blue-800 font-medium underline transition-colors">
                          View
                        </button>
                      </TableCell>
                    </TableRow>
                    {[1, 2, 3].map((num) => (
                      <TableRow key={num} className="hover:bg-indigo-50/50 transition-colors">
                        <TableCell className="text-xs p-2 font-semibold text-gray-800">Numerical Var #{num}</TableCell>
                        <TableCell className="text-xs p-2 text-gray-400">-</TableCell>
                        <TableCell className="text-xs p-2 text-gray-400">-</TableCell>
                        <TableCell className="text-xs p-2 text-gray-400">-</TableCell>
                        <TableCell className="text-xs p-2">
                          <button className="text-blue-600 hover:text-blue-800 font-medium underline transition-colors">
                            View
                          </button>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            </div>
          </Card>
        </div>
      </div>
    </div>
  );
};

export default FeatureOverviewCanvas;
